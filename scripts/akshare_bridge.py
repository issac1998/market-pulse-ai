#!/usr/bin/env python3
"""JSON bridge between the Node app and AkShare.

AkShare data providers and function names can vary by installed version.  This
bridge keeps stdout to exactly one JSON document and reports per-command errors
without making the parent Node process crash.
"""

from __future__ import annotations

import argparse
import inspect
import json
import math
import os
import sys
import traceback
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import reduce
from typing import Any, Callable

JSON_STDOUT = sys.stdout
PROXY_ENV_KEYS = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
PROXY_POLICY: dict[str, Any] = {"keepProxy": None, "removedProxyKeys": []}


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ValueError(message)


class SimpleFrame:
    """Tiny records-backed DataFrame stand-in for tests and non-pandas payloads."""

    def __init__(self, records: list[dict[str, Any]]) -> None:
        self.records = [dict(record) for record in records]
        columns: list[str] = []
        for record in self.records:
            for key in record:
                key = str(key)
                if key not in columns:
                    columns.append(key)
        self._columns = columns

    @property
    def columns(self) -> list[str]:
        return self._columns

    @columns.setter
    def columns(self, new_columns: list[str]) -> None:
        old_columns = list(self._columns)
        if len(old_columns) != len(new_columns):
            self._columns = [str(column) for column in new_columns]
            return
        renamed = []
        for record in self.records:
            renamed.append({str(new): record.get(old) for old, new in zip(old_columns, new_columns)})
        self.records = renamed
        self._columns = [str(column) for column in new_columns]

    @property
    def empty(self) -> bool:
        return not self.records

    def copy(self) -> "SimpleFrame":
        return SimpleFrame(self.records)

    def head(self, limit: int) -> "SimpleFrame":
        return SimpleFrame(self.records[:limit])

    def tail(self, limit: int) -> "SimpleFrame":
        return SimpleFrame(self.records[-limit:])

    def to_dict(self, orient: str = "records") -> list[dict[str, Any]]:
        if orient != "records":
            raise ValueError("SimpleFrame only supports orient='records'")
        return [dict(record) for record in self.records]

    def __getitem__(self, key: Any) -> "SimpleFrame":
        if isinstance(key, list):
            return SimpleFrame([{str(column): record.get(str(column)) for column in key} for record in self.records])
        raise TypeError("SimpleFrame only supports list-column selection")


def print_json(payload: dict[str, Any]) -> None:
    JSON_STDOUT.write(json.dumps(jsonable(payload), ensure_ascii=False, allow_nan=False))
    JSON_STDOUT.write("\n")
    JSON_STDOUT.flush()


def apply_proxy_policy() -> dict[str, Any]:
    """AkShare's China data providers often fail through local SOCKS/HTTP proxies."""
    keep_proxy = str(os.environ.get("AKSHARE_KEEP_PROXY", "")).strip().lower() in {"1", "true", "yes", "on"}
    removed = {}
    if not keep_proxy:
        for key in PROXY_ENV_KEYS:
            value = os.environ.pop(key, None)
            if value:
                removed[key] = value
    return {"keepProxy": keep_proxy, "removedProxyKeys": sorted(removed)}


def import_akshare() -> tuple[Any | None, Exception | None]:
    try:
        import akshare as ak  # type: ignore

        return ak, None
    except Exception as exc:  # pragma: no cover - depends on local env
        return None, exc


def missing_akshare_payload(command: str, error: Exception) -> dict[str, Any]:
    return {
        "ok": False,
        "command": command,
        "error": f"AkShare is not installed or could not be imported: {type(error).__name__}: {error}",
        "meta": {
            "install": "python -m pip install akshare",
            "python": sys.version,
        },
    }


def is_missing(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float):
        return not math.isfinite(value)
    if isinstance(value, (str, bool, int)):
        return False
    try:
        import pandas as pd  # type: ignore

        result = pd.isna(value)
        return bool(result) if isinstance(result, (bool, int)) else False
    except Exception:
        return False


def jsonable(value: Any) -> Any:
    if is_missing(value):
        return None
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, Decimal):
        if not value.is_finite():
            return None
        as_float = float(value)
        return as_float if math.isfinite(as_float) else str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if hasattr(value, "item"):
        try:
            return jsonable(value.item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)


def clamp_limit(limit: int | None, default: int = 100, maximum: int = 2000) -> int:
    try:
        parsed = int(limit if limit is not None else default)
    except Exception:
        parsed = default
    return max(1, min(parsed, maximum))


def get_ak_version(ak: Any) -> str:
    return str(getattr(ak, "__version__", "unknown"))


def resolve_function(ak: Any, names: list[str]) -> tuple[str, Callable[..., Any]]:
    for name in names:
        fn = getattr(ak, name, None)
        if callable(fn):
            return name, fn
    raise AttributeError(f"AkShare function not found; tried: {', '.join(names)}")


def compact_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if value is not None and value != ""}


def call_ak_function(fn: Callable[..., Any], kwargs: dict[str, Any]) -> Any:
    kwargs = compact_kwargs(kwargs)
    try:
        signature = inspect.signature(fn)
        accepts_kwargs = any(param.kind == inspect.Parameter.VAR_KEYWORD for param in signature.parameters.values())
        if not accepts_kwargs:
            kwargs = {key: value for key, value in kwargs.items() if key in signature.parameters}
    except Exception:
        pass
    return fn(**kwargs)


def coerce_dataframe(payload: Any) -> Any | None:
    if payload is None:
        return None
    if isinstance(payload, SimpleFrame):
        return payload.copy()
    if hasattr(payload, "to_dict") and hasattr(payload, "columns"):
        try:
            return payload.copy()
        except Exception:
            return payload
    try:
        import pandas as pd  # type: ignore

        if isinstance(payload, list):
            return pd.DataFrame(payload)
        if isinstance(payload, dict):
            return pd.DataFrame([payload])
    except Exception:
        if isinstance(payload, list):
            return SimpleFrame([row if isinstance(row, dict) else {"value": row} for row in payload])
        if isinstance(payload, dict):
            return SimpleFrame([payload])
    return None


def find_column(df: Any, candidates: list[str]) -> str | None:
    columns = [str(column) for column in getattr(df, "columns", [])]
    exact = {column: column for column in columns}
    lowered = {column.lower(): column for column in columns}
    for candidate in candidates:
        if candidate in exact:
            return exact[candidate]
        if candidate.lower() in lowered:
            return lowered[candidate.lower()]
    return None


def normalize_dataframe(df: Any, limit: int, tail: bool = False) -> list[dict[str, Any]]:
    if df is None:
        return []
    try:
        import pandas as pd  # type: ignore
        import numpy as np  # type: ignore

        df = df.replace([np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)
    except Exception:
        pass
    try:
        df = df.tail(limit) if tail else df.head(limit)
        records = df.to_dict(orient="records")
    except Exception:
        return []
    return [with_aliases(jsonable(record)) for record in records if isinstance(record, dict)]


def to_records(payload: Any, limit: int = 100, tail: bool = False) -> list[dict[str, Any]]:
    limit = clamp_limit(limit)
    df = coerce_dataframe(payload)
    if df is not None:
        return normalize_dataframe(df, limit, tail=tail)
    payload = jsonable(payload)
    if isinstance(payload, list):
        rows = [row if isinstance(row, dict) else {"value": row} for row in payload]
        selected = rows[-limit:] if tail else rows[:limit]
        return [with_aliases(row) for row in selected]
    if isinstance(payload, dict):
        return [with_aliases(payload)]
    return [{"value": payload}]


def first_value(row: dict[str, Any], names: list[str]) -> Any:
    lowered = {str(key).lower(): key for key in row}
    for name in names:
        if name in row and not is_missing(row[name]):
            return row[name]
        key = lowered.get(name.lower())
        if key is not None and not is_missing(row.get(key)):
            return row[key]
    return None


def with_aliases(row: dict[str, Any]) -> dict[str, Any]:
    aliases = {
        "date": ["date", "日期", "交易日期", "交易日", "时间", "最新行情时间"],
        "publishedAt": ["发布时间", "发布日期", "时间", "最新行情时间", "date", "日期"],
        "symbol": ["symbol", "代码", "股票代码", "关键词"],
        "name": ["name", "名称", "简称", "股票简称"],
        "open": ["open", "开盘", "今开", "开盘价"],
        "close": ["close", "收盘", "最新价", "收盘价"],
        "high": ["high", "最高", "最高价"],
        "low": ["low", "最低", "最低价"],
        "volume": ["volume", "成交量", "成交量(股)"],
        "amount": ["amount", "成交额"],
        "change": ["change", "涨跌额"],
        "changePct": ["changePct", "涨跌幅"],
        "turnoverRate": ["turnoverRate", "换手率"],
        "amplitude": ["amplitude", "振幅"],
        "pe": ["pe", "市盈率(TTM)", "市盈率", "市盈率(动)"],
        "peStatic": ["peStatic", "市盈率(静)"],
        "pb": ["pb", "市净率"],
        "pcf": ["pcf", "市现率"],
        "marketCap": ["marketCap", "总市值", "市值"],
        "title": ["title", "新闻标题", "标题"],
        "content": ["content", "新闻内容", "内容"],
        "url": ["url", "新闻链接", "链接"],
        "source": ["source", "文章来源", "来源"],
        "cn2yYield": ["cn2yYield", "中国国债收益率2年"],
        "cn5yYield": ["cn5yYield", "中国国债收益率5年"],
        "cn10yYield": ["cn10yYield", "中国国债收益率10年"],
        "cn30yYield": ["cn30yYield", "中国国债收益率30年"],
        "us2yYield": ["us2yYield", "美国国债收益率2年"],
        "us5yYield": ["us5yYield", "美国国债收益率5年"],
        "us10yYield": ["us10yYield", "美国国债收益率10年"],
        "us30yYield": ["us30yYield", "美国国债收益率30年"],
        "usYieldCurve10y2y": ["usYieldCurve10y2y", "美国国债收益率10年-2年", "美国国债收益率10年-2 年"],
    }
    enriched = dict(row)
    for alias, names in aliases.items():
        if alias not in enriched or is_missing(enriched.get(alias)):
            value = first_value(enriched, names)
            if not is_missing(value):
                enriched[alias] = value
    return enriched


def clean_symbol(symbol: str | None) -> str:
    value = str(symbol or "").strip().upper()
    if value.startswith("$"):
        value = value[1:]
    if ":" in value and not value.split(":", 1)[0].isdigit():
        value = value.rsplit(":", 1)[-1]
    if value.endswith(".US"):
        value = value[:-3]
    return value


def require_symbol(args: argparse.Namespace) -> str:
    symbol = clean_symbol(getattr(args, "symbol", ""))
    if not symbol:
        raise ValueError("--symbol is required for this command")
    return symbol


def normalize_hist_period(period: str | None) -> str:
    value = str(period or "daily").strip().lower()
    mapping = {
        "d": "daily",
        "1d": "daily",
        "day": "daily",
        "daily": "daily",
        "w": "weekly",
        "1w": "weekly",
        "week": "weekly",
        "weekly": "weekly",
        "m": "monthly",
        "1m": "monthly",
        "month": "monthly",
        "monthly": "monthly",
    }
    return mapping.get(value, value or "daily")


def normalize_valuation_period(period: str | None) -> str:
    value = str(period or "近一年").strip()
    mapping = {
        "1y": "近一年",
        "y": "近一年",
        "year": "近一年",
        "3y": "近三年",
        "all": "全部",
        "max": "全部",
        "全部": "全部",
        "近一年": "近一年",
        "近三年": "近三年",
    }
    return mapping.get(value.lower(), mapping.get(value, value))


def default_start(days: int) -> str:
    return (date.today() - timedelta(days=days)).strftime("%Y%m%d")


def today_yyyymmdd() -> str:
    return date.today().strftime("%Y%m%d")


def us_hist_symbol_candidates(symbol: str) -> list[str]:
    if "." in symbol and symbol.split(".", 1)[0].isdigit():
        return [symbol]
    candidates = [symbol, f"105.{symbol}", f"106.{symbol}", f"107.{symbol}"]
    unique: list[str] = []
    for candidate in candidates:
        if candidate not in unique:
            unique.append(candidate)
    return unique


def success_payload(command: str, rows: list[dict[str, Any]], meta: dict[str, Any]) -> dict[str, Any]:
    meta = dict(meta)
    meta.setdefault("rowCount", len(rows))
    return {
        "ok": True,
        "command": command,
        "rows": rows,
        "meta": meta,
    }


def valuation_frame(result: Any, indicator: str) -> Any | None:
    df = coerce_dataframe(result)
    if df is None or getattr(df, "empty", False):
        return None
    date_col = find_column(df, ["date", "日期", "交易日"])
    value_col = find_column(df, ["value", "数值", "指标值"])
    if value_col is None:
        for column in getattr(df, "columns", []):
            column_name = str(column)
            if column_name != date_col:
                value_col = column_name
                break
    if not date_col or not value_col:
        return None
    slim = df[[date_col, value_col]].copy()
    slim.columns = ["date", indicator]
    return slim


def merge_frames_on_date(frames: list[Any]) -> Any:
    try:
        import pandas as pd  # type: ignore

        merged = reduce(lambda left, right: pd.merge(left, right, on="date", how="outer"), frames)
        return merged.sort_values("date")
    except Exception:
        by_date: dict[str, dict[str, Any]] = {}
        for frame in frames:
            for record in to_records(frame, limit=2000):
                row_date = record.get("date")
                if is_missing(row_date):
                    continue
                key = str(row_date)
                by_date.setdefault(key, {"date": row_date}).update(record)
        return SimpleFrame([by_date[key] for key in sorted(by_date)])


def browser_headers(referer: str = "") -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        ),
        "Accept": "application/json,text/plain,*/*",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def maybe_number(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value if not isinstance(value, float) or math.isfinite(value) else None
    text = str(value).strip().replace(",", "")
    if text in {"", "-", "--", "None", "nan", "NaN"}:
        return None
    try:
        return float(text)
    except Exception:
        return value


def manual_baidu_valuation_frame(symbol: str, indicator: str, period: str) -> SimpleFrame:
    import requests  # type: ignore

    url = "https://gushitong.baidu.com/opendata"
    params = {
        "openapi": "1",
        "dspName": "iphone",
        "tn": "tangram",
        "client": "app",
        "query": indicator,
        "code": symbol,
        "word": "",
        "resource_id": "51171",
        "market": "us",
        "tag": indicator,
        "chart_select": period,
        "industry_select": "",
        "skip_industry": "1",
        "finClientType": "pc",
    }
    response = requests.get(
        url,
        params=params,
        headers=browser_headers(f"https://gushitong.baidu.com/stock/us-{symbol}"),
        timeout=20,
    )
    response.raise_for_status()
    data_json = response.json()
    body = data_json["Result"][0]["DisplayData"]["resultData"]["tplData"]["result"]["chartInfo"][0]["body"]
    rows = []
    for item in body or []:
        if isinstance(item, dict):
            row_date = item.get("date") or item.get("日期")
            row_value = item.get("value") or item.get("数值")
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            row_date, row_value = item[0], item[1]
        else:
            continue
        if is_missing(row_date):
            continue
        rows.append({"date": str(row_date)[:10], indicator: maybe_number(row_value)})
    if not rows:
        raise RuntimeError("manual Baidu valuation returned empty chartInfo")
    return SimpleFrame(rows)


def manual_eastmoney_hist_frame(candidate: str, period: str, start: str, end: str) -> SimpleFrame:
    import requests  # type: ignore

    period_dict = {"daily": "101", "weekly": "102", "monthly": "103"}
    limit_dict = {"daily": "1500", "weekly": "600", "monthly": "240"}
    params = {
        "secid": candidate,
        "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
        "klt": period_dict.get(period, "101"),
        "fqt": "0",
        "end": "20500000",
        "lmt": limit_dict.get(period, "1500"),
    }
    last_error: Exception | None = None
    data = {}
    referer_symbol = candidate.split(".")[-1]
    referer = f"https://quote.eastmoney.com/us/{referer_symbol}.html"
    for host in ("https://push2his.eastmoney.com/api/qt/stock/kline/get", "https://63.push2his.eastmoney.com/api/qt/stock/kline/get"):
        for _ in range(2):
            try:
                response = requests.get(
                    host,
                    params=params,
                    headers=browser_headers(referer),
                    timeout=20,
                )
                response.raise_for_status()
                data = response.json().get("data") or {}
                if data.get("klines"):
                    last_error = None
                    break
            except Exception as exc:
                last_error = exc
        if data.get("klines"):
            break
    if last_error is not None and not data.get("klines"):
        raise last_error
    klines = data.get("klines") or []
    columns = ["日期", "开盘", "收盘", "最高", "最低", "成交量", "成交额", "振幅", "涨跌幅", "涨跌额", "换手率"]
    rows = []
    start_key = str(start or "").replace("-", "")
    end_key = str(end or "").replace("-", "")
    for line in klines:
        values = str(line).split(",")
        if len(values) < len(columns):
            continue
        row = {column: values[index] for index, column in enumerate(columns)}
        date_key = str(row["日期"]).replace("-", "")
        if start_key and date_key < start_key:
            continue
        if end_key and date_key > end_key:
            continue
        for column in columns[1:]:
            row[column] = maybe_number(row[column])
        rows.append(row)
    if not rows:
        raise RuntimeError("manual Eastmoney hist returned empty klines")
    return SimpleFrame(rows)


def fetch_valuation(ak: Any, args: argparse.Namespace) -> dict[str, Any]:
    symbol = require_symbol(args)
    limit = clamp_limit(args.limit)
    period = normalize_valuation_period(args.period)
    fn_name, fn = resolve_function(ak, ["stock_us_valuation_baidu"])
    indicators = ["总市值", "市盈率(TTM)", "市盈率(静)", "市净率", "市现率"]
    frames = []
    errors = []
    fallback_used = []
    for indicator in indicators:
        try:
            result = call_ak_function(fn, {"symbol": symbol, "indicator": indicator, "period": period})
            frame = valuation_frame(result, indicator)
            if frame is None or getattr(frame, "empty", False):
                errors.append({"indicator": indicator, "error": "empty result"})
                frame = manual_baidu_valuation_frame(symbol, indicator, period)
                fallback_used.append(indicator)
            frames.append(frame)
        except Exception as exc:
            errors.append({"indicator": indicator, "error": f"{type(exc).__name__}: {exc}"})
            try:
                frame = manual_baidu_valuation_frame(symbol, indicator, period)
                frames.append(frame)
                fallback_used.append(indicator)
            except Exception as fallback_exc:
                errors.append(
                    {
                        "indicator": indicator,
                        "fallback": "manual-baidu",
                        "error": f"{type(fallback_exc).__name__}: {fallback_exc}",
                    }
                )
    if not frames:
        raise RuntimeError(f"{fn_name} returned no valuation rows; errors={errors}")
    merged = merge_frames_on_date(frames)
    rows = to_records(merged, limit, tail=True)
    return success_payload(
        "valuation",
        rows,
        {
            "akshareVersion": get_ak_version(ak),
            "function": fn_name,
            "symbol": symbol,
            "period": period,
            "indicators": indicators,
            "fallbackUsed": fallback_used,
            "errors": errors,
        },
    )


def fetch_hist(ak: Any, args: argparse.Namespace) -> dict[str, Any]:
    symbol = require_symbol(args)
    limit = clamp_limit(args.limit)
    period = normalize_hist_period(args.period)
    start = args.start or default_start(365 * 3)
    end = args.end or today_yyyymmdd()
    fn_name, fn = resolve_function(ak, ["stock_us_hist"])
    errors = []
    direct_error = getattr(args, "direct_error", "")
    if direct_error:
        errors.append({"symbol": symbol, "fallback": "manual-eastmoney-before-akshare-import", "error": direct_error})
    first_empty: tuple[str, Any] | None = None
    fallback_used = ""
    skip_manual = str(os.environ.get("AKSHARE_SKIP_MANUAL_HIST", "")).strip().lower() in {"1", "true", "yes", "on"}
    for candidate in us_hist_symbol_candidates(symbol):
        if not skip_manual:
            try:
                df = manual_eastmoney_hist_frame(candidate, period, start, end)
                fallback_used = "manual-eastmoney"
                rows = to_records(df, limit, tail=True)
                return success_payload(
                    "hist",
                    rows,
                    {
                        "akshareVersion": get_ak_version(ak),
                        "function": fn_name,
                        "fallbackUsed": fallback_used,
                        "symbol": symbol,
                        "resolvedSymbol": candidate,
                        "period": period,
                        "start": start,
                        "end": end,
                        "triedSymbols": us_hist_symbol_candidates(symbol),
                        "errors": errors,
                    },
                )
            except Exception as fallback_exc:
                errors.append(
                    {
                        "symbol": candidate,
                        "fallback": "manual-eastmoney",
                        "error": f"{type(fallback_exc).__name__}: {fallback_exc}",
                    }
                )
        try:
            result = call_ak_function(
                fn,
                {
                    "symbol": candidate,
                    "period": period,
                    "start_date": start,
                    "end_date": end,
                    "adjust": "",
                },
            )
            df = coerce_dataframe(result)
            if df is not None and not getattr(df, "empty", False):
                rows = to_records(df, limit, tail=True)
                return success_payload(
                    "hist",
                    rows,
                    {
                        "akshareVersion": get_ak_version(ak),
                        "function": fn_name,
                        "symbol": symbol,
                        "resolvedSymbol": candidate,
                        "period": period,
                        "start": start,
                        "end": end,
                        "triedSymbols": us_hist_symbol_candidates(symbol),
                        "errors": errors,
                    },
                )
            if first_empty is None:
                first_empty = (candidate, df)
            errors.append({"symbol": candidate, "error": "empty result"})
        except Exception as exc:
            errors.append({"symbol": candidate, "error": f"{type(exc).__name__}: {exc}"})
    if first_empty is not None:
        candidate, df = first_empty
        return success_payload(
            "hist",
            to_records(df, limit, tail=True),
            {
                "akshareVersion": get_ak_version(ak),
                "function": fn_name,
                "symbol": symbol,
                "resolvedSymbol": candidate,
                "period": period,
                "start": start,
                "end": end,
                "triedSymbols": us_hist_symbol_candidates(symbol),
                "errors": errors,
            },
        )
    raise RuntimeError(f"{fn_name} failed for all symbol candidates; errors={errors}")


def fetch_hist_direct(args: argparse.Namespace) -> dict[str, Any]:
    symbol = require_symbol(args)
    limit = clamp_limit(args.limit)
    period = normalize_hist_period(args.period)
    start = args.start or default_start(365 * 3)
    end = args.end or today_yyyymmdd()
    errors = []
    candidates = us_hist_symbol_candidates(symbol)
    for candidate in candidates:
        try:
            df = manual_eastmoney_hist_frame(candidate, period, start, end)
            return success_payload(
                "hist",
                to_records(df, limit, tail=True),
                {
                    "akshareVersion": "not-imported",
                    "function": "stock_us_hist",
                    "fallbackUsed": "manual-eastmoney-before-akshare-import",
                    "symbol": symbol,
                    "resolvedSymbol": candidate,
                    "period": period,
                    "start": start,
                    "end": end,
                    "triedSymbols": candidates,
                    "errors": errors,
                    "note": "当前环境中 import akshare 后东财 K线接口会断连，因此 hist 命令在导入 AkShare 前使用等价 Eastmoney JSON 请求。",
                },
            )
        except Exception as exc:
            errors.append(
                {
                    "symbol": candidate,
                    "fallback": "manual-eastmoney-before-akshare-import",
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
    raise RuntimeError(f"manual Eastmoney hist failed for all symbol candidates; errors={errors}")


def fetch_news_em(ak: Any, args: argparse.Namespace) -> dict[str, Any]:
    symbol = require_symbol(args)
    limit = clamp_limit(args.limit)
    fn_name, fn = resolve_function(ak, ["stock_news_em"])
    result = call_ak_function(fn, {"symbol": symbol})
    rows = to_records(result, limit)
    return success_payload(
        "news-em",
        rows,
        {
            "akshareVersion": get_ak_version(ak),
            "function": fn_name,
            "symbol": symbol,
        },
    )


def fetch_global_news(ak: Any, args: argparse.Namespace) -> dict[str, Any]:
    limit = clamp_limit(args.limit)
    fn_name, fn = resolve_function(ak, ["stock_info_global_ths", "stock_info_global_thsm"])
    result = call_ak_function(fn, {})
    rows = to_records(result, limit)
    return success_payload(
        "global-news",
        rows,
        {
            "akshareVersion": get_ak_version(ak),
            "function": fn_name,
        },
    )


def filter_dataframe_dates(df: Any, start: str | None, end: str | None) -> Any:
    if df is None or getattr(df, "empty", False) or (not start and not end):
        return df
    date_col = find_column(df, ["date", "日期", "交易日", "时间"])
    if not date_col:
        return df
    if isinstance(df, SimpleFrame):
        filtered = []
        for record in df.to_dict("records"):
            value = record.get(date_col)
            normalized = str(value or "").replace("-", "").replace("/", "")[:8]
            if start and normalized < start:
                continue
            if end and normalized > end:
                continue
            filtered.append(record)
        return SimpleFrame(filtered)
    try:
        series = df[date_col].astype(str).str.replace("-", "", regex=False).str.replace("/", "", regex=False).str.slice(0, 8)
        mask = True
        if start:
            mask = mask & (series >= start)
        if end:
            mask = mask & (series <= end)
        return df[mask]
    except Exception:
        return df


def tag_rows(rows: list[dict[str, Any]], **tags: Any) -> list[dict[str, Any]]:
    tagged = []
    for row in rows:
        enriched = dict(row)
        for key, value in tags.items():
            enriched.setdefault(key, value)
        tagged.append(with_aliases(enriched))
    return tagged


def fetch_macro(ak: Any, args: argparse.Namespace) -> dict[str, Any]:
    limit = clamp_limit(args.limit)
    rows: list[dict[str, Any]] = []
    sections = []
    errors = []

    try:
        fn_name, fn = resolve_function(ak, ["index_global_spot_em"])
        result = call_ak_function(fn, {})
        section_rows = tag_rows(
            to_records(result, limit),
            category="globalIndex",
            sourceFunction=fn_name,
        )
        rows.extend(section_rows)
        sections.append({"name": "globalIndex", "function": fn_name, "rowCount": len(section_rows)})
    except Exception as exc:
        errors.append({"section": "globalIndex", "error": f"{type(exc).__name__}: {exc}"})

    try:
        fn_name, fn = resolve_function(ak, ["bond_zh_us_rate"])
        start = args.start or default_start(365 * 3)
        result = call_ak_function(fn, {"start_date": start})
        df = filter_dataframe_dates(coerce_dataframe(result), args.start or start, args.end)
        section_rows = tag_rows(
            to_records(df, limit, tail=True),
            category="usChinaTreasuryYield",
            sourceFunction=fn_name,
        )
        rows.extend(section_rows)
        sections.append(
            {
                "name": "usChinaTreasuryYield",
                "function": fn_name,
                "rowCount": len(section_rows),
                "start": start,
                "end": args.end or "",
            }
        )
    except Exception as exc:
        errors.append({"section": "usChinaTreasuryYield", "error": f"{type(exc).__name__}: {exc}"})

    if not rows:
        raise RuntimeError(f"No macro sections returned data; errors={errors}")
    return success_payload(
        "macro",
        rows,
        {
            "akshareVersion": get_ak_version(ak),
            "sections": sections,
            "errors": errors,
            "limitPerSection": limit,
        },
    )


def probe(ak: Any | None, error: Exception | None, command: str) -> dict[str, Any]:
    if error or ak is None:
        return missing_akshare_payload(command, error or RuntimeError("unknown import error"))
    available = {}
    for name in [
        "stock_us_valuation_baidu",
        "stock_us_hist",
        "stock_news_em",
        "stock_info_global_ths",
        "stock_info_global_thsm",
        "index_global_spot_em",
        "bond_zh_us_rate",
    ]:
        available[name] = callable(getattr(ak, name, None))
    return success_payload(
        command,
        [],
        {
            "akshareVersion": get_ak_version(ak),
            "python": sys.version,
            "functionsAvailable": available,
            "proxyPolicy": PROXY_POLICY,
        },
    )


def build_parser() -> JsonArgumentParser:
    parser = JsonArgumentParser()
    parser.add_argument("command", nargs="?")
    parser.add_argument("--symbol", default="")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--period", default="")
    parser.add_argument("--start", default="")
    parser.add_argument("--end", default="")
    return parser


def command_from_argv(argv: list[str]) -> str:
    for item in argv:
        if not item.startswith("-"):
            return item
    return "unknown"


def run(args: argparse.Namespace) -> dict[str, Any]:
    command = str(args.command or "").strip()
    if not command:
        raise ValueError("command is required")

    handlers: dict[str, Callable[[Any, argparse.Namespace], dict[str, Any]]] = {
        "valuation": fetch_valuation,
        "hist": fetch_hist,
        "news-em": fetch_news_em,
        "global-news": fetch_global_news,
        "macro": fetch_macro,
    }
    if command != "probe" and command not in handlers:
        raise ValueError(f"unsupported command: {command}")

    if command == "hist":
        try:
            return fetch_hist_direct(args)
        except Exception as direct_exc:
            setattr(args, "direct_error", f"{type(direct_exc).__name__}: {direct_exc}")
            os.environ["AKSHARE_SKIP_MANUAL_HIST"] = "1"

    ak, import_error = import_akshare()
    if command == "probe":
        return probe(ak, import_error, command)
    if import_error or ak is None:
        return missing_akshare_payload(command, import_error or RuntimeError("unknown import error"))

    handler = handlers.get(command)
    if handler is None:
        raise ValueError(f"unsupported command: {command}")
    return handler(ak, args)


def main(argv: list[str] | None = None) -> int:
    global PROXY_POLICY
    # AkShare providers may print diagnostics. Keep stdout reserved for JSON.
    sys.stdout = sys.stderr
    PROXY_POLICY = apply_proxy_policy()
    argv = list(sys.argv[1:] if argv is None else argv)
    command = command_from_argv(argv)
    try:
        args = build_parser().parse_args(argv)
        command = str(args.command or command)
        print_json(run(args))
    except Exception as exc:
        print_json(
            {
                "ok": False,
                "command": command,
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            }
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
