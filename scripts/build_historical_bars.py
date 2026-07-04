#!/usr/bin/env python3
"""Build the Tier-1 historical OHLCV and macro-regime corpus.

The script is intentionally append-only: it creates new SQLite tables and writes
provider rows without changing store.json. Historical macro regimes are scored by
calling lib/market_core.mjs::scoreFredMacroRegime through Node so the thresholds
stay shared with the live market overview path.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO_ROOT / "data" / "market_pulse.sqlite"
DEFAULT_STORE = REPO_ROOT / "data" / "store.json"
DEFAULT_BRIDGE = REPO_ROOT / "scripts" / "akshare_bridge.py"
DEFAULT_IBKR_BRIDGE = REPO_ROOT / "scripts" / "ibkr_gateway_bridge.py"
FRED_SERIES = ("DGS10", "DGS2", "T10Y2Y", "BAMLC0A0CM", "T10YIE", "VIXCLS")


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def safe_ticker(value: Any) -> str:
    raw = text(value).upper()
    if raw.startswith("$"):
        raw = raw[1:]
    if raw.endswith(".US"):
        raw = raw[:-3]
    if ":" in raw and not raw.split(":", 1)[0].isdigit():
        raw = raw.rsplit(":", 1)[-1]
    return "".join(ch for ch in raw if ch.isalnum() or ch in {".", "-"}).split(".")[0][:16]


def number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        result = float(value)
        return result if result == result else None
    cleaned = text(value).replace(",", "").replace("%", "").replace("$", "")
    if cleaned in {"", "-", "--", "None", "nan", "NaN", "."}:
        return None
    try:
        result = float(cleaned)
        return result if result == result else None
    except ValueError:
        return None


def ymd(value: Any) -> str:
    raw = text(value)
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return raw[:10]


def yyyymmdd(day: date) -> str:
    return day.strftime("%Y%m%d")


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip('"').strip("'")


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS historical_bars (
          ticker TEXT NOT NULL,
          date TEXT NOT NULL,
          open REAL,
          high REAL,
          low REAL,
          close REAL,
          volume REAL,
          source TEXT NOT NULL,
          PRIMARY KEY (ticker, date, source)
        );

        CREATE INDEX IF NOT EXISTS idx_historical_bars_ticker_date
          ON historical_bars(ticker, date);

        CREATE TABLE IF NOT EXISTS historical_regimes (
          date TEXT PRIMARY KEY,
          bucket TEXT,
          risk_score REAL,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS historical_corpus_metadata (
          id TEXT PRIMARY KEY,
          built_at TEXT,
          universe_definition TEXT,
          ticker_count INTEGER,
          row_count INTEGER,
          survivorship_caveat TEXT,
          json TEXT NOT NULL
        );
        """
    )


def load_store(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def tickers_from_store(store: dict[str, Any]) -> set[str]:
    out: set[str] = set()
    for row in store.get("stockHistory") or []:
        if isinstance(row, dict):
            out.add(safe_ticker(row.get("ticker")))
    agent = store.get("allStockAgent") or {}
    for key in ("decisions", "outcomeSnapshots", "paperBook"):
        rows = agent.get(key) if isinstance(agent, dict) else None
        if isinstance(rows, list):
            for row in rows:
                if isinstance(row, dict):
                    out.add(safe_ticker(row.get("ticker")))
    for run in store.get("runs") or []:
        if not isinstance(run, dict):
            continue
        for key in ("quotes", "technicals", "fundamentals", "researchPacks"):
            for row in run.get(key) or []:
                if isinstance(row, dict):
                    out.add(safe_ticker(row.get("ticker") or row.get("symbol")))
    return {ticker for ticker in out if ticker}


def fetch_url(url: str, timeout: int = 20) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/124 Safari/537.36",
            "Accept": "text/csv,text/plain,text/html,application/json,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_csv_tickers(payload: bytes, columns: tuple[str, ...]) -> set[str]:
    rows = csv.DictReader(payload.decode("utf-8", errors="ignore").splitlines())
    out: set[str] = set()
    for row in rows:
        for column in columns:
            ticker = safe_ticker(row.get(column))
            if ticker:
                out.add(ticker)
                break
    return out


def fetch_current_sp500() -> set[str]:
    urls = [
        "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv",
        "https://raw.githubusercontent.com/plotly/datasets/master/2014_sp500_fortune500.csv",
    ]
    for url in urls:
        try:
            tickers = parse_csv_tickers(fetch_url(url), ("Symbol", "symbol", "Ticker", "ticker"))
            if len(tickers) >= 300:
                return tickers
        except Exception:
            continue
    return set()


def fetch_current_nasdaq100() -> set[str]:
    urls = [
        "https://raw.githubusercontent.com/datasets/nasdaq-100/master/data/nasdaq-100.csv",
        "https://raw.githubusercontent.com/persichert/nasdaq100/master/nasdaq100.csv",
    ]
    for url in urls:
        try:
            tickers = parse_csv_tickers(fetch_url(url), ("Symbol", "symbol", "Ticker", "ticker"))
            if len(tickers) >= 80:
                return tickers
        except Exception:
            continue
    return set()


def fallback_seed_universe() -> set[str]:
    return {
        "AAPL",
        "MSFT",
        "NVDA",
        "AMZN",
        "META",
        "GOOGL",
        "GOOG",
        "AVGO",
        "TSLA",
        "AMD",
        "MU",
        "ASML",
        "INTC",
        "MRVL",
        "SPY",
        "QQQ",
        "IWM",
        "SMH",
    }


def build_universe(args: argparse.Namespace) -> tuple[list[str], dict[str, Any]]:
    explicit = {safe_ticker(item) for item in text(args.tickers).replace("\n", ",").split(",") if safe_ticker(item)}
    store_tickers = tickers_from_store(load_store(Path(args.store_json))) if args.store_json else set()
    sp500 = set() if args.no_remote_universe or explicit else fetch_current_sp500()
    nasdaq100 = set() if args.no_remote_universe or explicit else fetch_current_nasdaq100()
    universe = explicit or (sp500 | nasdaq100 | store_tickers | fallback_seed_universe())
    tickers = sorted(ticker for ticker in universe if ticker)
    if args.max_tickers and args.max_tickers > 0:
        tickers = tickers[: args.max_tickers]
    meta = {
        "explicitTickers": sorted(explicit),
        "sp500Count": len(sp500),
        "nasdaq100Count": len(nasdaq100),
        "storeTickerCount": len(store_tickers),
        "fallbackSeedCount": len(fallback_seed_universe()),
        "maxTickers": args.max_tickers,
    }
    return tickers, meta


def existing_count(conn: sqlite3.Connection, ticker: str, start: str, end: str) -> int:
    return int(
        conn.execute(
            "SELECT COUNT(*) FROM historical_bars WHERE ticker=? AND date>=? AND date<=?",
            (ticker, start, end),
        ).fetchone()[0]
        or 0
    )


def run_json_command(command: list[str], timeout: int, cwd: Path = REPO_ROOT, input_text: str | None = None) -> dict[str, Any]:
    completed = subprocess.run(
        command,
        input=input_text,
        text=True,
        cwd=str(cwd),
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    output = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else ""
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"non-JSON output from {' '.join(command[:3])}: {exc}; stderr={completed.stderr[-500:]}")
    if not payload.get("ok"):
        raise RuntimeError(payload.get("error") or f"command failed: {' '.join(command)}")
    return payload


def run_text_command(command: list[str], timeout: int, cwd: Path = REPO_ROOT) -> str:
    completed = subprocess.run(
        command,
        text=True,
        cwd=str(cwd),
        capture_output=True,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"command failed ({completed.returncode}): {' '.join(command[:4])}; stderr={completed.stderr[-800:]}")
    return completed.stdout


def resolve_command(value: str, default_names: tuple[str, ...] = ()) -> str:
    raw = text(value)
    if raw:
        expanded = os.path.expanduser(raw)
        if Path(expanded).exists() or shutil.which(expanded):
            return expanded
    for name in default_names:
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError(f"command not found: {value or '/'.join(default_names)}")


def normalize_rows(ticker: str, rows: list[dict[str, Any]], source: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in rows:
        day = ymd(row.get("date") or row.get("日期"))
        open_ = number(row.get("open") if row.get("open") is not None else row.get("开盘"))
        high = number(row.get("high") if row.get("high") is not None else row.get("最高"))
        low = number(row.get("low") if row.get("low") is not None else row.get("最低"))
        close = number(row.get("close") if row.get("close") is not None else row.get("收盘"))
        volume = number(row.get("volume") if row.get("volume") is not None else row.get("成交量"))
        if not day or open_ is None or high is None or low is None or close is None:
            continue
        out.append(
            {
                "ticker": ticker,
                "date": day,
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
                "source": source,
            }
        )
    out.sort(key=lambda item: item["date"])
    return out


def fetch_akshare_bars(args: argparse.Namespace, ticker: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    payload = run_json_command(
        [
            sys.executable,
            str(args.akshare_bridge),
            "hist",
            "--symbol",
            ticker,
            "--limit",
            str(args.limit_bars),
            "--period",
            "daily",
            "--start",
            args.start,
            "--end",
            args.end,
        ],
        timeout=args.fetch_timeout,
    )
    source = "akshare:stock_us_hist"
    if payload.get("meta", {}).get("fallbackUsed"):
        source = f"akshare:{payload['meta']['fallbackUsed']}"
    return normalize_rows(ticker, payload.get("rows") or [], source), payload.get("meta") or {}


def longbridge_symbol(ticker: str) -> str:
    symbol = safe_ticker(ticker)
    if not symbol:
        raise RuntimeError("empty ticker")
    return symbol if "." in symbol else f"{symbol}.US"


def parse_longbridge_kline_payload(ticker: str, payload_text: str) -> list[dict[str, Any]]:
    payload = json.loads(payload_text)
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError("Longbridge kline JSON was not a list")
    normalized = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        normalized.append(
            {
                "date": row.get("date") or row.get("time") or row.get("timestamp"),
                "open": row.get("open"),
                "high": row.get("high"),
                "low": row.get("low"),
                "close": row.get("close"),
                "volume": row.get("volume"),
            }
        )
    return normalize_rows(ticker, normalized, "longbridge:kline")


def fetch_longbridge_bars(args: argparse.Namespace, ticker: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    command = resolve_command(args.longbridge_command, ("longbridge",))
    symbol = longbridge_symbol(ticker)
    errors: list[str] = []
    duration_days = max(1, (datetime.strptime(args.end, "%Y%m%d").date() - datetime.strptime(args.start, "%Y%m%d").date()).days + 1)
    recent_counts = []
    estimated_trading_rows = max(30, int(duration_days * 0.75) + 10)
    for count in (min(args.limit_bars, 1000, estimated_trading_rows), 1000, 500, 200, 100, 30):
        if count > 0 and count not in recent_counts:
            recent_counts.append(count)
    candidates = [
        [
            command,
            "kline",
            "history",
            symbol,
            "--period",
            "day",
            "--start",
            args.start_ymd,
            "--end",
            args.end_ymd,
            "--adjust",
            "forward",
            "--format",
            "json",
        ],
    ]
    candidates.extend([
        [
            command,
            "kline",
            symbol,
            "--period",
            "day",
            "--count",
            str(count),
            "--adjust",
            "forward",
            "--format",
            "json",
        ]
        for count in recent_counts
    ])
    for candidate in candidates:
        try:
            rows = parse_longbridge_kline_payload(ticker, run_text_command(candidate, args.fetch_timeout))
            rows = [row for row in rows if args.start_ymd <= row["date"] <= args.end_ymd]
            if rows:
                return rows[-args.limit_bars :], {"source": "longbridge:kline", "rowCount": len(rows), "errors": errors}
        except Exception as exc:
            errors.append(f"{Path(candidate[0]).name}:{candidate[1]}:{type(exc).__name__}:{exc}")
    raise RuntimeError("; ".join(errors) or "Longbridge returned no kline rows")


def ibkr_duration_for_days(days: int) -> str:
    if days >= 365:
        return f"{max(1, round(days / 365))} Y"
    if days >= 30:
        return f"{max(1, round(days / 30))} M"
    return f"{max(1, days)} D"


def fetch_ibkr_bars(args: argparse.Namespace, ticker: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if str(args.ibkr_enabled).lower() not in {"1", "true", "yes", "on"}:
        raise RuntimeError("IBKR historical fetcher disabled; set HISTORICAL_IBKR_ENABLED=1 or --ibkr-enabled 1")
    duration_days = max(1, (datetime.strptime(args.end, "%Y%m%d").date() - datetime.strptime(args.start, "%Y%m%d").date()).days + 1)
    payload = run_json_command(
        [
            sys.executable,
            str(args.ibkr_bridge),
            "historical",
            "--host",
            args.ibkr_host,
            "--port",
            str(args.ibkr_port),
            "--client-id",
            str(args.ibkr_client_id),
            "--timeout",
            str(max(4, args.ibkr_timeout)),
            "--symbols",
            safe_ticker(ticker),
            "--duration",
            ibkr_duration_for_days(duration_days),
            "--bar-size",
            "1 day",
            "--market-data-type",
            str(args.ibkr_market_data_type),
        ],
        timeout=max(args.fetch_timeout, int(args.ibkr_timeout) + 5),
    )
    rows = []
    for item in payload.get("historical") or []:
        if safe_ticker(item.get("symbol")) == safe_ticker(ticker):
            rows.extend(item.get("bars") or [])
    normalized = [row for row in normalize_rows(ticker, rows, "ibkr:socket-historical") if args.start_ymd <= row["date"] <= args.end_ymd]
    if not normalized:
        raise RuntimeError(f"IBKR returned no historical bars; errors={payload.get('errors') or []}")
    return normalized[-args.limit_bars :], {"source": "ibkr:socket-historical", "rowCount": len(normalized), "errors": payload.get("errors") or []}


def fetch_finnhub_bars(ticker: str, start: str, end: str, api_key: str, timeout: int) -> list[dict[str, Any]]:
    start_dt = datetime.strptime(start, "%Y%m%d").replace(tzinfo=timezone.utc)
    end_dt = datetime.strptime(end, "%Y%m%d").replace(tzinfo=timezone.utc)
    params = urllib.parse.urlencode(
        {
            "symbol": ticker,
            "resolution": "D",
            "from": int(start_dt.timestamp()),
            "to": int(end_dt.timestamp()),
            "token": api_key,
        }
    )
    payload = json.loads(fetch_url(f"https://finnhub.io/api/v1/stock/candle?{params}", timeout=timeout).decode("utf-8"))
    if payload.get("s") != "ok":
        raise RuntimeError(f"Finnhub candle status={payload.get('s')}")
    rows = []
    for index, ts in enumerate(payload.get("t") or []):
        rows.append(
            {
                "date": datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat(),
                "open": (payload.get("o") or [])[index],
                "high": (payload.get("h") or [])[index],
                "low": (payload.get("l") or [])[index],
                "close": (payload.get("c") or [])[index],
                "volume": (payload.get("v") or [None])[index],
            }
        )
    return normalize_rows(ticker, rows, "finnhub:candle")


def fetch_alpha_vantage_bars(ticker: str, api_key: str, timeout: int) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            "function": "TIME_SERIES_DAILY_ADJUSTED",
            "symbol": ticker,
            "outputsize": "full",
            "apikey": api_key,
        }
    )
    payload = json.loads(fetch_url(f"https://www.alphavantage.co/query?{params}", timeout=timeout).decode("utf-8"))
    series = payload.get("Time Series (Daily)") or {}
    rows = []
    for day, row in series.items():
        rows.append(
            {
                "date": day,
                "open": row.get("1. open"),
                "high": row.get("2. high"),
                "low": row.get("3. low"),
                "close": row.get("4. close"),
                "volume": row.get("6. volume"),
            }
        )
    return normalize_rows(ticker, rows, "alphavantage:daily_adjusted")


def fetch_bars(args: argparse.Namespace, ticker: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    errors: list[str] = []
    providers = [item.strip().lower() for item in text(args.provider_order).split(",") if item.strip()]
    for provider in providers:
        if provider == "longbridge":
            try:
                rows, meta = fetch_longbridge_bars(args, ticker)
                if rows:
                    return rows, {**meta, "errors": errors + (meta.get("errors") or [])}
            except Exception as exc:
                errors.append(f"longbridge:{type(exc).__name__}:{exc}")
        elif provider == "ibkr":
            try:
                rows, meta = fetch_ibkr_bars(args, ticker)
                if rows:
                    return rows, {**meta, "errors": errors + (meta.get("errors") or [])}
            except Exception as exc:
                errors.append(f"ibkr:{type(exc).__name__}:{exc}")
        elif provider == "akshare":
            try:
                rows, meta = fetch_akshare_bars(args, ticker)
                if rows:
                    return rows, {"source": rows[0]["source"], "rowCount": len(rows), "akshareMeta": meta, "errors": errors}
            except Exception as exc:
                errors.append(f"akshare:{type(exc).__name__}:{exc}")
        elif provider == "finnhub":
            finnhub_key = os.environ.get("FINNHUB_API_KEY") or os.environ.get("FINNHUB_TOKEN")
            if finnhub_key:
                try:
                    rows = fetch_finnhub_bars(ticker, args.start, args.end, finnhub_key, args.fetch_timeout)
                    if rows:
                        return rows[-args.limit_bars :], {"source": "finnhub:candle", "rowCount": len(rows), "errors": errors}
                except Exception as exc:
                    errors.append(f"finnhub:{type(exc).__name__}:{exc}")
        elif provider in {"alphavantage", "alpha_vantage", "av"}:
            alpha_key = os.environ.get("ALPHAVANTAGE_API_KEY") or os.environ.get("ALPHA_VANTAGE_API_KEY")
            if alpha_key:
                try:
                    rows = [row for row in fetch_alpha_vantage_bars(ticker, alpha_key, args.fetch_timeout) if args.start[:4] <= row["date"][:4] <= args.end[:4]]
                    if rows:
                        return rows[-args.limit_bars :], {"source": "alphavantage:daily_adjusted", "rowCount": len(rows), "errors": errors}
                except Exception as exc:
                    errors.append(f"alphavantage:{type(exc).__name__}:{exc}")
        else:
            errors.append(f"unknown-provider:{provider}")
    raise RuntimeError("; ".join(errors) or "no historical provider returned rows")


def insert_bars(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> int:
    before = conn.total_changes
    conn.executemany(
        """
        INSERT OR REPLACE INTO historical_bars
          (ticker, date, open, high, low, close, volume, source)
        VALUES
          (:ticker, :date, :open, :high, :low, :close, :volume, :source)
        """,
        rows,
    )
    return conn.total_changes - before


def fetch_url_via_node_or_curl(url: str, timeout: int) -> bytes:
    node_script = """
const url = process.argv[1];
const timeoutMs = Number(process.argv[2] || 30000);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
try {
  const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": "MarketPulseAI/1.0" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  process.stdout.write(await response.text());
} finally {
  clearTimeout(timer);
}
"""
    try:
        return run_text_command(["node", "--input-type=module", "-e", node_script, url, str(timeout * 1000)], timeout=timeout + 5).encode("utf-8")
    except Exception:
        curl = shutil.which("curl")
        if curl:
            return run_text_command([curl, "-fsSL", "--max-time", str(timeout), url], timeout=timeout + 5).encode("utf-8")
        return fetch_url(url, timeout=timeout)


def fred_csv(series_id: str, timeout: int) -> list[dict[str, Any]]:
    payload = fetch_url_via_node_or_curl(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}", timeout=timeout)
    out = []
    for row in csv.DictReader(payload.decode("utf-8", errors="ignore").splitlines()):
        day = ymd(row.get("observation_date") or row.get("DATE") or row.get("date"))
        value = row.get(series_id) or row.get("VALUE") or row.get("value")
        if day and number(value) is not None:
            out.append({"date": day, "value": number(value)})
    out.sort(key=lambda item: item["date"])
    return out


def compute_regimes_with_node(series: dict[str, list[dict[str, Any]]], dates: list[str], timeout: int) -> list[dict[str, Any]]:
    node_source = """
import fs from 'node:fs';
import { scoreFredMacroRegime } from './lib/market_core.mjs';
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const rows = payload.dates.map((date) => {
  const map = {};
  for (const [id, seriesRows] of Object.entries(payload.series || {})) {
    map[id] = (seriesRows || []).filter((row) => row.date <= date).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  const scored = scoreFredMacroRegime(map);
  return { date, bucket: scored.regime, risk_score: scored.score, json: scored };
});
process.stdout.write(JSON.stringify({ ok: true, rows }));
"""
    return run_json_command(["node", "--input-type=module", "-e", node_source], timeout=timeout, input_text=json.dumps({"series": series, "dates": dates})).get("rows") or []


def build_historical_regimes(conn: sqlite3.Connection, args: argparse.Namespace) -> dict[str, Any]:
    if args.skip_regimes:
        return {"status": "skipped", "rows": 0, "errors": []}
    errors: list[str] = []
    series: dict[str, list[dict[str, Any]]] = {}
    for series_id in FRED_SERIES:
        try:
            series[series_id] = fred_csv(series_id, args.fetch_timeout)
        except Exception as exc:
            errors.append(f"{series_id}:{type(exc).__name__}:{exc}")
            series[series_id] = []
    all_dates = sorted({row["date"] for rows in series.values() for row in rows if args.start_ymd <= row["date"] <= args.end_ymd})
    if not all_dates:
        return {"status": "empty", "rows": 0, "errors": errors}
    rows = compute_regimes_with_node(series, all_dates, args.regime_timeout)
    conn.executemany(
        """
        INSERT OR REPLACE INTO historical_regimes (date, bucket, risk_score, json)
        VALUES (:date, :bucket, :risk_score, :json)
        """,
        [
            {
                "date": row.get("date"),
                "bucket": row.get("bucket"),
                "risk_score": row.get("risk_score"),
                "json": json.dumps(row.get("json") or {}, ensure_ascii=False, separators=(",", ":")),
            }
            for row in rows
            if row.get("date")
        ],
    )
    return {"status": "ok", "rows": len(rows), "series": {key: len(value) for key, value in series.items()}, "errors": errors}


def sample_spot_checks(conn: sqlite3.Connection, tickers: list[str]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    for ticker in tickers[:5]:
        rows = conn.execute(
            """
            SELECT ticker, date, close, source
            FROM historical_bars
            WHERE ticker=?
            ORDER BY date
            """,
            (ticker,),
        ).fetchall()
        if not rows:
            continue
        indexes = sorted({0, len(rows) // 2, len(rows) - 1})
        for index in indexes:
            row = rows[index]
            checks.append({"ticker": row[0], "date": row[1], "close": row[2], "source": row[3]})
    return checks


def write_metadata(conn: sqlite3.Connection, tickers: list[str], universe_meta: dict[str, Any], source_counts: dict[str, int], regime_meta: dict[str, Any]) -> None:
    row_count = int(conn.execute("SELECT COUNT(*) FROM historical_bars").fetchone()[0] or 0)
    payload = {
        "schemaVersion": "historical-corpus-metadata-v1",
        "universe": universe_meta,
        "sourceCounts": source_counts,
        "regime": regime_meta,
        "survivorshipCaveat": "Universe is current S&P 500 + Nasdaq 100 + observed project tickers; delisted historical constituents are not yet included.",
        "tickers": tickers,
    }
    conn.execute(
        """
        INSERT OR REPLACE INTO historical_corpus_metadata
          (id, built_at, universe_definition, ticker_count, row_count, survivorship_caveat, json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "tier1-latest",
            datetime.now(timezone.utc).isoformat(),
            "current_sp500|current_nasdaq100|store_stock_history|store_decisions",
            len(tickers),
            row_count,
            payload["survivorshipCaveat"],
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        ),
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--store-json", default=str(DEFAULT_STORE))
    parser.add_argument("--akshare-bridge", default=str(DEFAULT_BRIDGE))
    parser.add_argument("--ibkr-bridge", default=str(DEFAULT_IBKR_BRIDGE))
    parser.add_argument("--provider-order", default=os.environ.get("HISTORICAL_PROVIDER_ORDER", "longbridge,ibkr,akshare,finnhub,alphavantage"))
    parser.add_argument("--longbridge-command", default=os.environ.get("LONGBRIDGE_CLI", "longbridge"))
    parser.add_argument("--ibkr-enabled", default=os.environ.get("HISTORICAL_IBKR_ENABLED", "0"))
    parser.add_argument("--ibkr-host", default=os.environ.get("IBKR_SOCKET_HOST", "127.0.0.1"))
    parser.add_argument("--ibkr-port", type=int, default=int(os.environ.get("IBKR_SOCKET_PORT", "4001") or 4001))
    parser.add_argument("--ibkr-client-id", type=int, default=int(os.environ.get("IBKR_HISTORICAL_CLIENT_ID", "177") or 177))
    parser.add_argument("--ibkr-timeout", type=int, default=int(os.environ.get("IBKR_HISTORICAL_TIMEOUT", "45") or 45))
    parser.add_argument("--ibkr-market-data-type", type=int, default=int(os.environ.get("IBKR_MARKET_DATA_TYPE", "3") or 3))
    parser.add_argument("--tickers", default="")
    parser.add_argument("--max-tickers", type=int, default=0)
    parser.add_argument("--days", type=int, default=365 * 6)
    parser.add_argument("--limit-bars", type=int, default=1500)
    parser.add_argument("--start", default="")
    parser.add_argument("--end", default="")
    parser.add_argument("--sleep-ms", type=int, default=250)
    parser.add_argument("--fetch-timeout", type=int, default=90)
    parser.add_argument("--regime-timeout", type=int, default=120)
    parser.add_argument("--min-existing", type=int, default=1000)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-regimes", action="store_true")
    parser.add_argument("--no-remote-universe", action="store_true")
    args = parser.parse_args(argv)
    end_day = datetime.strptime(args.end, "%Y%m%d").date() if args.end else date.today()
    start_day = datetime.strptime(args.start, "%Y%m%d").date() if args.start else end_day - timedelta(days=max(30, args.days))
    args.start = yyyymmdd(start_day)
    args.end = yyyymmdd(end_day)
    args.start_ymd = start_day.isoformat()
    args.end_ymd = end_day.isoformat()
    args.db = str(Path(args.db))
    args.store_json = str(Path(args.store_json))
    args.akshare_bridge = str(Path(args.akshare_bridge))
    args.ibkr_bridge = str(Path(args.ibkr_bridge))
    return args


def main(argv: list[str] | None = None) -> int:
    load_env_file(REPO_ROOT / ".env")
    args = parse_args(argv)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    init_schema(conn)
    tickers, universe_meta = build_universe(args)
    source_counts: dict[str, int] = {}
    errors: list[dict[str, Any]] = []
    processed = 0
    skipped = 0
    for ticker in tickers:
        if not args.force and existing_count(conn, ticker, args.start_ymd, args.end_ymd) >= args.min_existing:
            skipped += 1
            continue
        try:
            rows, meta = fetch_bars(args, ticker)
            rows = [row for row in rows if args.start_ymd <= row["date"] <= args.end_ymd]
            inserted = insert_bars(conn, rows)
            source = meta.get("source") or (rows[0]["source"] if rows else "unknown")
            source_counts[source] = source_counts.get(source, 0) + len(rows)
            processed += 1
            conn.commit()
            print(json.dumps({"ticker": ticker, "rows": len(rows), "insertedOrReplaced": inserted, "source": source}, ensure_ascii=False), flush=True)
        except Exception as exc:
            errors.append({"ticker": ticker, "error": f"{type(exc).__name__}: {exc}"})
            print(json.dumps({"ticker": ticker, "error": errors[-1]["error"]}, ensure_ascii=False), flush=True)
        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000)
    regime_meta = build_historical_regimes(conn, args)
    write_metadata(conn, tickers, universe_meta, source_counts, regime_meta)
    conn.commit()
    spot_checks = sample_spot_checks(conn, tickers)
    payload = {
        "status": "ok" if processed or skipped else "empty",
        "tickers": len(tickers),
        "processed": processed,
        "skipped": skipped,
        "errors": errors[:20],
        "sourceCounts": source_counts,
        "regime": regime_meta,
        "spotChecks": spot_checks,
    }
    print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
