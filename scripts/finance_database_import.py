#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import subprocess
import time
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_EXCHANGES = ["NYQ", "NMS", "NGM", "ASE", "NCM"]
BASE_URL = "https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main/database/equities/{exchange}.csv"
BENCHMARK_OR_ETF_TICKERS = {
    "SPY", "QQQ", "VTI", "VOO", "IWM", "DIA",
    "XLK", "XLE", "XLF", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE", "XLC", "SMH", "SOXX",
    "SPCX",
}


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def safe_ticker(value: Any) -> str:
    return "".join(ch for ch in text(value).upper() if ch.isalnum() or ch in {".", "-"}).split(".")[0][:16]


def number(value: Any) -> float | None:
    raw = text(value).replace(",", "").replace("$", "")
    if not raw:
        return None
    try:
        result = float(raw)
    except ValueError:
        return None
    return result if result == result else None


def market_cap_bucket(value: Any) -> str:
    cap = number(value)
    if cap is None or cap <= 0:
        return "unknown"
    if cap >= 200_000_000_000:
        return "mega"
    if cap >= 10_000_000_000:
        return "large"
    if cap >= 2_000_000_000:
        return "mid"
    if cap >= 300_000_000:
        return "small"
    return "micro"


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS security_master_ext (
          ticker TEXT PRIMARY KEY,
          name TEXT,
          sector TEXT,
          industry_group TEXT,
          industry TEXT,
          country TEXT,
          market_cap_bucket TEXT,
          market_cap REAL,
          exchange TEXT,
          mic TEXT,
          summary TEXT,
          source TEXT,
          updated_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_security_master_ext_sector
          ON security_master_ext(sector, industry_group, industry);
        """
    )


def fetch_exchange_csv(exchange: str, cache_dir: Path, refresh: bool, timeout: int) -> str:
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{exchange}.csv"
    if cache_path.exists() and not refresh:
        return cache_path.read_text(encoding="utf-8", errors="replace")
    url = BASE_URL.format(exchange=exchange)
    curl_error: Exception | None = None
    try:
        completed = subprocess.run(
            ["curl", "-fsSL", "--max-time", str(timeout), url],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout + 5,
        )
        payload = completed.stdout
        cache_path.write_text(payload, encoding="utf-8")
        return payload
    except Exception as exc:
        curl_error = exc
    if curl_error is not None:
        raise RuntimeError(f"curl failed: {curl_error}")
    req = urllib.request.Request(url, headers={"User-Agent": "MarketPulseAI/finance-database-import"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            payload = response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        raise RuntimeError(f"curl failed: {curl_error}; urllib failed: {exc}") from exc
    cache_path.write_text(payload, encoding="utf-8")
    return payload


def parse_rows(exchange: str, payload: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    reader = csv.DictReader(payload.splitlines())
    for row in reader:
        ticker = safe_ticker(row.get("symbol"))
        if not ticker:
            continue
        if text(row.get("delisted")).lower() in {"true", "1", "yes", "y"}:
            continue
        rows.append(
            {
                "ticker": ticker,
                "name": text(row.get("name")),
                "sector": text(row.get("sector")),
                "industry_group": text(row.get("industry_group")),
                "industry": text(row.get("industry")),
                "country": text(row.get("country")),
                "market_cap_bucket": market_cap_bucket(row.get("market_cap")),
                "market_cap": number(row.get("market_cap")),
                "exchange": text(row.get("exchange") or exchange),
                "mic": text(row.get("mic")),
                "summary": text(row.get("summary")),
                "source": "JerBouma/FinanceDatabase",
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
        )
    return rows


def write_json_cache(rows: list[dict[str, Any]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    by_ticker = {row["ticker"]: row for row in rows}
    payload = {
        "schemaVersion": "security-master-ext-v1",
        "provider": "JerBouma/FinanceDatabase",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "count": len(by_ticker),
        "byTicker": by_ticker,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def corpus_coverage(conn: sqlite3.Connection) -> dict[str, Any]:
    try:
        corpus = [safe_ticker(row[0]) for row in conn.execute("SELECT DISTINCT ticker FROM historical_bars").fetchall()]
    except sqlite3.Error:
        corpus = []
    corpus = [ticker for ticker in corpus if ticker]
    if not corpus:
        return {"corpusTickers": 0, "resolved": 0, "coverage": None, "missing": []}
    placeholders = ",".join("?" for _ in corpus)
    resolved = {
        safe_ticker(row[0])
        for row in conn.execute(
            f"SELECT ticker FROM security_master_ext WHERE ticker IN ({placeholders}) AND COALESCE(sector,'') <> ''",
            corpus,
        ).fetchall()
    }
    missing = [ticker for ticker in corpus if ticker not in resolved]
    equity_corpus = [ticker for ticker in corpus if ticker not in BENCHMARK_OR_ETF_TICKERS]
    equity_missing = [ticker for ticker in equity_corpus if ticker not in resolved]
    return {
        "corpusTickers": len(corpus),
        "resolved": len(resolved),
        "coverage": len(resolved) / len(corpus) if corpus else None,
        "missing": missing[:50],
        "excludedBenchmarkOrEtf": [ticker for ticker in corpus if ticker in BENCHMARK_OR_ETF_TICKERS],
        "equityCorpusTickers": len(equity_corpus),
        "equityResolved": len(equity_corpus) - len(equity_missing),
        "equityCoverage": (len(equity_corpus) - len(equity_missing)) / len(equity_corpus) if equity_corpus else None,
        "equityMissing": equity_missing[:50],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import FinanceDatabase equities into Market Pulse SQLite.")
    parser.add_argument("--db", default="data/market_pulse.sqlite")
    parser.add_argument("--cache-dir", default="data/cache/finance_database")
    parser.add_argument("--json-output", default="data/reference/security_master_ext.json")
    parser.add_argument("--exchanges", default=",".join(DEFAULT_EXCHANGES))
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    exchanges = [item.strip().upper() for item in args.exchanges.split(",") if item.strip()]
    cache_dir = Path(args.cache_dir)
    all_rows: dict[str, dict[str, Any]] = {}
    errors: list[str] = []
    for exchange in exchanges:
        try:
            payload = fetch_exchange_csv(exchange, cache_dir, args.refresh, args.timeout)
            for row in parse_rows(exchange, payload):
                current = all_rows.get(row["ticker"])
                if current and current.get("sector") and not row.get("sector"):
                    continue
                all_rows[row["ticker"]] = row
        except Exception as exc:
            errors.append(f"{exchange}: {type(exc).__name__}: {exc}")

    conn = sqlite3.connect(args.db)
    ensure_schema(conn)
    rows = sorted(all_rows.values(), key=lambda item: item["ticker"])
    conn.executemany(
        """
        INSERT OR REPLACE INTO security_master_ext
          (ticker, name, sector, industry_group, industry, country, market_cap_bucket, market_cap, exchange, mic, summary, source, updated_at)
        VALUES
          (:ticker, :name, :sector, :industry_group, :industry, :country, :market_cap_bucket, :market_cap, :exchange, :mic, :summary, :source, :updated_at)
        """,
        rows,
    )
    conn.commit()
    write_json_cache(rows, Path(args.json_output))
    coverage = corpus_coverage(conn)
    spot = {}
    for ticker in ["AAPL", "MSFT", "NVDA"]:
        row = conn.execute(
            "SELECT ticker,name,sector,industry_group,industry,market_cap_bucket FROM security_master_ext WHERE ticker=?",
            (ticker,),
        ).fetchone()
        spot[ticker] = list(row) if row else None
    conn.close()
    print(json.dumps({
        "ok": True,
        "rows": len(rows),
        "exchanges": exchanges,
        "coverage": coverage,
        "spotChecks": spot,
        "errors": errors,
    }, ensure_ascii=False, indent=2))
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
