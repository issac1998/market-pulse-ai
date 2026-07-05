#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO_ROOT / "data" / "market_pulse.sqlite"


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def safe_ticker(value: Any) -> str:
    raw = text(value).upper()
    if raw.endswith(".US"):
        raw = raw[:-3]
    return "".join(ch for ch in raw if ch.isalnum() or ch in {".", "-"}).split(".")[0][:16]


def number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS pit_fundamentals (
          ticker TEXT NOT NULL,
          filed_at TEXT NOT NULL,
          period TEXT,
          field TEXT NOT NULL,
          value REAL,
          form TEXT,
          json TEXT NOT NULL,
          PRIMARY KEY (ticker, filed_at, period, field, form)
        );

        CREATE INDEX IF NOT EXISTS idx_pit_fundamentals_ticker_filedate
          ON pit_fundamentals(ticker, filed_at);

        CREATE TABLE IF NOT EXISTS institutional_holdings (
          filer_cik TEXT,
          filer_name TEXT,
          ticker TEXT,
          period TEXT,
          filed_at TEXT,
          shares REAL,
          value REAL,
          json TEXT NOT NULL,
          PRIMARY KEY (filer_cik, ticker, period, filed_at)
        );

        CREATE TABLE IF NOT EXISTS edgar_current_filings (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          cik TEXT,
          form TEXT,
          filed_at TEXT,
          item TEXT,
          severity TEXT,
          json TEXT NOT NULL
        );
        """
    )


def import_edgar():
    import edgar  # type: ignore

    identity = os.environ.get("EDGAR_IDENTITY") or os.environ.get("SEC_IDENTITY") or "Market Pulse AI panzf98@gmail.com"
    try:
        edgar.set_identity(identity)
    except Exception as exc:
        os.environ["EDGAR_IDENTITY_ERROR"] = f"{type(exc).__name__}: {exc}"
    return edgar


def first_attr(obj: Any, names: list[str], default: Any = "") -> Any:
    for name in names:
        if isinstance(obj, dict) and name in obj:
            return obj.get(name)
        if hasattr(obj, name):
            value = getattr(obj, name)
            return value() if callable(value) and name.startswith("get_") else value
    return default


def list_filings(company: Any, forms: list[str], limit: int) -> list[Any]:
    errors = []
    for kwargs in ({"form": forms}, {"form": forms[0] if forms else None}, {}):
        try:
            filings = company.get_filings(**{k: v for k, v in kwargs.items() if v})
            rows = list(filings)
            if forms:
                rows = [row for row in rows if text(first_attr(row, ["form", "form_type"])).upper() in {form.upper() for form in forms}]
            return rows[:limit]
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
    raise RuntimeError("; ".join(errors) or "company.get_filings failed")


def filing_metadata(filing: Any) -> dict[str, Any]:
    accession = text(first_attr(filing, ["accession_no", "accession_number", "accession"]))
    form = text(first_attr(filing, ["form", "form_type"]))
    filed_at = text(first_attr(filing, ["filing_date", "filed_at", "date"]))
    period = text(first_attr(filing, ["period_of_report", "report_date", "period"]))
    return {"accession": accession, "form": form, "filed_at": filed_at[:10], "period": period[:10]}


def extract_facts_from_filing(filing: Any) -> list[dict[str, Any]]:
    meta = filing_metadata(filing)
    facts: list[dict[str, Any]] = []
    aliases = {
        "revenue": ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"),
        "net_income": ("NetIncomeLoss",),
        "eps_diluted": ("EarningsPerShareDiluted",),
        "gross_profit": ("GrossProfit",),
        "assets": ("Assets",),
        "current_assets": ("AssetsCurrent",),
        "liabilities": ("Liabilities",),
        "current_liabilities": ("LiabilitiesCurrent",),
        "long_term_debt": ("LongTermDebt", "LongTermDebtAndFinanceLeaseObligations", "LongTermDebtCurrentAndNoncurrent"),
        "equity": ("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"),
        "retained_earnings": ("RetainedEarningsAccumulatedDeficit",),
        "ebit": ("OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"),
        "operating_cash_flow": ("NetCashProvidedByUsedInOperatingActivities",),
        "shares_basic": ("WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfSharesOutstandingBasicAndDiluted"),
        "shares_diluted": ("WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageDilutedSharesOutstanding"),
    }
    try:
        xbrl = filing.xbrl()
    except Exception:
        xbrl = None
    if xbrl is not None:
        for field, tags in aliases.items():
            for tag in tags:
                try:
                    df = xbrl.query().by_concept(tag).to_dataframe()
                    records = df.to_dict(orient="records") if hasattr(df, "to_dict") else []
                    records = [row for row in records if number(row.get("numeric_value") if isinstance(row, dict) else None) is not None]
                    if not records:
                        continue
                    row = sorted(
                        records,
                        key=lambda item: (
                            text(item.get("period_end")),
                            0 if any(str(key).startswith("dim_") and text(value) not in {"", "nan", "None"} for key, value in item.items()) else 1,
                        ),
                        reverse=True,
                    )[0]
                    period = text(row.get("period_end"))[:10] or meta.get("period") or ""
                    facts.append({
                        **meta,
                        "period": period,
                        "field": field,
                        "value": number(row.get("numeric_value")),
                        "rawTag": tag,
                        "label": text(row.get("label")),
                        "unit": text(row.get("unit_ref")),
                    })
                    break
                except Exception:
                    continue
    if not facts:
        facts.append({**meta, "field": "filing_seen", "value": None, "rawTags": [], "status": "no_xbrl_fact_extracted"})
    return facts


def command_pit_fundamentals(args: argparse.Namespace) -> dict[str, Any]:
    edgar = import_edgar()
    ticker = safe_ticker(args.ticker)
    if not ticker:
        raise ValueError("--ticker is required")
    company = edgar.Company(ticker)
    filings = list_filings(company, ["10-K", "10-Q"], args.limit)
    rows = []
    for filing in filings:
        for fact in extract_facts_from_filing(filing):
            rows.append({"ticker": ticker, **fact})
    conn = sqlite3.connect(args.db)
    init_schema(conn)
    conn.executemany(
        """
        INSERT OR REPLACE INTO pit_fundamentals
          (ticker, filed_at, period, field, value, form, json)
        VALUES
          (:ticker, :filed_at, :period, :field, :value, :form, :json)
        """,
        [
            {
                "ticker": row["ticker"],
                "filed_at": row.get("filed_at") or "",
                "period": row.get("period") or "",
                "field": row.get("field") or "",
                "value": row.get("value"),
                "form": row.get("form") or "",
                "json": dump(row),
            }
            for row in rows
        ],
    )
    conn.commit()
    return {"ok": True, "command": "pit-fundamentals", "ticker": ticker, "rows": len(rows), "fields": sorted({row.get("field") for row in rows})}


def severity_for_current_filing(form: str, item: str = "") -> str:
    item_text = text(item)
    if form.upper() in {"8-K", "6-K"}:
        if any(token in item_text for token in ("1.01", "2.02", "5.02", "8.01")):
            return "high"
        if any(token in item_text for token in ("7.01", "9.01")):
            return "low"
        return "medium"
    if form.upper() in {"10-K", "10-Q", "S-1", "424B", "SC 13D", "SC 13G"}:
        return "high"
    return "medium"


def command_current_filings(args: argparse.Namespace) -> dict[str, Any]:
    edgar = import_edgar()
    tickers = [safe_ticker(item) for item in text(args.tickers or args.ticker).replace("\n", ",").split(",") if safe_ticker(item)]
    rows = []
    if tickers:
        for ticker in tickers:
            company = edgar.Company(ticker)
            for filing in list_filings(company, ["8-K", "6-K", "10-Q", "10-K"], args.limit):
                meta = filing_metadata(filing)
                item = text(first_attr(filing, ["items", "item", "description"]))
                rows.append({
                    "id": f"{ticker}:{meta.get('accession') or meta.get('filed_at') or now_iso()}",
                    "ticker": ticker,
                    "cik": text(first_attr(company, ["cik"])),
                    "form": meta.get("form"),
                    "filed_at": meta.get("filed_at"),
                    "item": item,
                    "severity": severity_for_current_filing(meta.get("form") or "", item),
                    "meta": meta,
                })
    else:
        filings = edgar.get_current_filings(form=args.form or "8-K")
        for filing in list(filings)[: args.limit]:
            meta = filing_metadata(filing)
            item = text(first_attr(filing, ["items", "item", "description"]))
            rows.append({
                "id": meta.get("accession") or f"current:{len(rows)}:{now_iso()}",
                "ticker": "",
                "cik": text(first_attr(filing, ["cik"])),
                "form": meta.get("form"),
                "filed_at": meta.get("filed_at"),
                "item": item,
                "severity": severity_for_current_filing(meta.get("form") or "", item),
                "meta": meta,
            })
    conn = sqlite3.connect(args.db)
    init_schema(conn)
    conn.executemany(
        """
        INSERT OR REPLACE INTO edgar_current_filings
          (id, ticker, cik, form, filed_at, item, severity, json)
        VALUES
          (:id, :ticker, :cik, :form, :filed_at, :item, :severity, :json)
        """,
        [{**row, "json": dump(row)} for row in rows],
    )
    conn.commit()
    return {"ok": True, "command": "current-filings", "rows": len(rows), "filings": rows[: args.output_limit]}


def command_13f(args: argparse.Namespace) -> dict[str, Any]:
    edgar = import_edgar()
    rows = []
    try:
        filings = edgar.get_portfolio_holding_filings(year=args.year or None, quarter=args.quarter or None)
        for filing in list(filings)[: args.limit]:
            meta = filing_metadata(filing)
            rows.append({
                "filer_cik": text(first_attr(filing, ["cik"])),
                "filer_name": text(first_attr(filing, ["company", "company_name", "name"])),
                "ticker": "",
                "period": meta.get("period"),
                "filed_at": meta.get("filed_at"),
                "shares": None,
                "value": None,
                "meta": meta,
                "status": "filing_seen_holdings_not_expanded",
            })
    except Exception as exc:
        raise RuntimeError(f"13F fetch failed: {type(exc).__name__}: {exc}")
    conn = sqlite3.connect(args.db)
    init_schema(conn)
    conn.executemany(
        """
        INSERT OR REPLACE INTO institutional_holdings
          (filer_cik, filer_name, ticker, period, filed_at, shares, value, json)
        VALUES
          (:filer_cik, :filer_name, :ticker, :period, :filed_at, :shares, :value, :json)
        """,
        [{**row, "json": dump(row)} for row in rows],
    )
    conn.commit()
    return {"ok": True, "command": "13f", "rows": len(rows), "status": "filing-level-only"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init-schema", "pit-fundamentals", "current-filings", "13f"])
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--ticker", default="")
    parser.add_argument("--tickers", default="")
    parser.add_argument("--form", default="")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--output-limit", type=int, default=10)
    parser.add_argument("--year", type=int, default=0)
    parser.add_argument("--quarter", type=int, default=0)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        conn = sqlite3.connect(args.db)
        init_schema(conn)
        conn.commit()
        if args.command == "init-schema":
            payload = {"ok": True, "command": "init-schema", "db": args.db}
        elif args.command == "pit-fundamentals":
            payload = command_pit_fundamentals(args)
        elif args.command == "current-filings":
            payload = command_current_filings(args)
        elif args.command == "13f":
            payload = command_13f(args)
        else:
            raise ValueError(f"unsupported command {args.command}")
    except Exception as exc:
        payload = {
            "ok": False,
            "command": args.command,
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
        }
    print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
