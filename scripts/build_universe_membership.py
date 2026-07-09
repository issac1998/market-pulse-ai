#!/usr/bin/env python3
"""Build point-in-time S&P 500 membership and optional member bar coverage.

The primary source is fja05680/sp500's MIT-licensed ticker start/end table. The
script stores provenance per row and can optionally call the existing historical
bar builder to backfill Longbridge daily bars for the PIT members.

Long backfills should run against an isolated working DB and then use
--merge-into to copy bars/coverage into the live DB in one short transaction.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import subprocess
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = REPO_ROOT / "data" / "market_pulse.sqlite"
BAR_BUILDER = REPO_ROOT / "scripts" / "build_historical_bars.py"
FJA_START_END_URL = "https://raw.githubusercontent.com/fja05680/sp500/master/sp500_ticker_start_end.csv"
FJA_LICENSE_URL = "https://raw.githubusercontent.com/fja05680/sp500/master/LICENSE"
WIKIPEDIA_SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
SQLITE_BUSY_TIMEOUT_MS = 30000
SQLITE_RETRY_DELAYS = (0.25, 0.75, 1.5)


def text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def safe_ticker(value: Any) -> str:
    raw = text(value).upper()
    if raw.startswith("$"):
        raw = raw[1:]
    if raw.endswith(".US"):
        raw = raw[:-3]
    return "".join(ch for ch in raw if ch.isalnum() or ch in {".", "-"}).split(".")[0][:16]


def ymd(value: Any) -> str:
    raw = text(value)
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) >= 8 and "-" not in raw[:10]:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        return raw[:10]


def yyyymmdd(value: str) -> str:
    return ymd(value).replace("-", "")


def fetch_text(url: str, timeout: int = 30) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "MarketPulseAI/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="ignore")


def connect_sqlite(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=max(30, SQLITE_BUSY_TIMEOUT_MS // 1000))
    conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
    return conn


def commit_with_retry(conn: sqlite3.Connection) -> None:
    last_error: Exception | None = None
    for delay in (0, *SQLITE_RETRY_DELAYS):
        if delay:
            time.sleep(delay)
        try:
            conn.commit()
            return
        except sqlite3.OperationalError as exc:
            if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                raise
            last_error = exc
    raise last_error or sqlite3.OperationalError("sqlite commit failed")


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS universe_membership (
          ticker TEXT NOT NULL,
          added_at TEXT NOT NULL,
          removed_at TEXT,
          source TEXT NOT NULL,
          json TEXT NOT NULL,
          PRIMARY KEY (ticker, added_at, source)
        );

        CREATE INDEX IF NOT EXISTS idx_universe_membership_active
          ON universe_membership(added_at, removed_at, ticker);

        CREATE TABLE IF NOT EXISTS universe_coverage_status (
          ticker TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          last_attempt_at TEXT NOT NULL,
          json TEXT NOT NULL
        );
        """
    )


def init_historical_bars_schema(conn: sqlite3.Connection) -> None:
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
        """
    )


def overlaps(row: dict[str, Any], start: str, end: str) -> bool:
    added = ymd(row.get("added_at") or row.get("start_date")) or start
    removed = ymd(row.get("removed_at") or row.get("end_date"))
    return added <= end and (not removed or removed >= start)


def fja_license_metadata(timeout: int) -> dict[str, Any]:
    license_text = fetch_text(FJA_LICENSE_URL, timeout=timeout)
    license_name = "MIT" if "MIT License" in license_text[:200] else "unknown"
    return {
        "repository": "fja05680/sp500",
        "license": license_name,
        "licenseUrl": FJA_LICENSE_URL,
        "sourceUrl": FJA_START_END_URL,
    }


def load_fja_rows(start: str, end: str, timeout: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    license_meta = fja_license_metadata(timeout)
    if license_meta["license"] != "MIT":
        raise RuntimeError(f"fja05680/sp500 license is not MIT: {license_meta['license']}")
    payload = fetch_text(FJA_START_END_URL, timeout=timeout)
    rows: list[dict[str, Any]] = []
    for raw in csv.DictReader(payload.splitlines()):
        ticker = safe_ticker(raw.get("ticker"))
        if not ticker:
            continue
        row = {
            "ticker": ticker,
            "added_at": ymd(raw.get("start_date")) or "1996-01-02",
            "removed_at": ymd(raw.get("end_date")),
            "source": "fja05680/sp500:sp500_ticker_start_end.csv",
            "raw": raw,
        }
        if overlaps(row, start, end):
            rows.append(row)
    meta = {
        "schemaVersion": "universe-membership-source-v1",
        **license_meta,
        "sourceRows": len(rows),
        "eventMatchPct": 100,
        "eventMatchBasis": "Direct start/end interval table; no lossy event reconstruction.",
    }
    return rows, meta


def flatten_column(column: Any) -> str:
    if isinstance(column, tuple):
        return " ".join(text(part) for part in column if text(part) and not str(part).startswith("Unnamed")).strip()
    return text(column)


def load_wikipedia_rows(start: str, end: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    try:
        import pandas as pd  # type: ignore
    except Exception as exc:  # pragma: no cover - environment fallback
        raise RuntimeError(f"pandas is required for Wikipedia fallback: {exc}") from exc
    tables = pd.read_html(WIKIPEDIA_SP500_URL)
    current = next((table for table in tables if "Symbol" in [flatten_column(col) for col in table.columns]), None)
    if current is None:
        raise RuntimeError("Wikipedia S&P 500 current table not found")
    current.columns = [flatten_column(col) for col in current.columns]
    rows: list[dict[str, Any]] = []
    for _, raw in current.iterrows():
        ticker = safe_ticker(raw.get("Symbol"))
        if not ticker:
            continue
        row = {
            "ticker": ticker,
            "added_at": ymd(raw.get("Date added")) or start,
            "removed_at": "",
            "source": "wikipedia:sp500-current",
            "raw": {key: text(value) for key, value in raw.to_dict().items()},
        }
        if overlaps(row, start, end):
            rows.append(row)
    meta = {
        "schemaVersion": "universe-membership-source-v1",
        "repository": "Wikipedia",
        "license": "CC BY-SA",
        "sourceUrl": WIKIPEDIA_SP500_URL,
        "sourceRows": len(rows),
        "eventMatchPct": None,
        "eventMatchBasis": "Fallback current constituent table; historical removals may be incomplete.",
    }
    return rows, meta


def membership_rows(args: argparse.Namespace) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    errors: list[str] = []
    if args.source in {"auto", "fja05680"}:
        try:
            return load_fja_rows(args.start_ymd, args.end_ymd, args.fetch_timeout)
        except Exception as exc:
            errors.append(f"fja05680:{type(exc).__name__}:{exc}")
            if args.source == "fja05680":
                raise
    rows, meta = load_wikipedia_rows(args.start_ymd, args.end_ymd)
    meta["fallbackErrors"] = errors
    return rows, meta


def insert_membership(conn: sqlite3.Connection, rows: list[dict[str, Any]], source_meta: dict[str, Any]) -> int:
    before = conn.total_changes
    conn.executemany(
        """
        INSERT OR REPLACE INTO universe_membership
          (ticker, added_at, removed_at, source, json)
        VALUES
          (:ticker, :added_at, :removed_at, :source, :json)
        """,
        [
            {
                "ticker": row["ticker"],
                "added_at": row["added_at"],
                "removed_at": row.get("removed_at") or None,
                "source": row["source"],
                "json": json.dumps(
                    {
                        "schemaVersion": "universe-membership-row-v1",
                        "ticker": row["ticker"],
                        "addedAt": row["added_at"],
                        "removedAt": row.get("removed_at") or None,
                        "sourceMeta": source_meta,
                        "raw": row.get("raw") or {},
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            }
            for row in rows
        ],
    )
    return conn.total_changes - before


def update_coverage_status(conn: sqlite3.Connection, tickers: list[str], status: str, source: str, details: dict[str, Any] | None = None) -> None:
    now = datetime.now(timezone.utc).isoformat()
    has_bars_table = (
        conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='historical_bars'",
        ).fetchone()[0]
        or 0
    ) > 0
    payloads = []
    for ticker in tickers:
        count = int(
            conn.execute(
                "SELECT COUNT(*) FROM historical_bars WHERE ticker=?",
                (ticker,),
            ).fetchone()[0]
            or 0
        ) if has_bars_table else 0
        row_status = "bars_available" if count > 0 else status
        payloads.append(
            {
                "ticker": ticker,
                "status": row_status,
                "source": source,
                "last_attempt_at": now,
                "json": json.dumps(
                    {
                        "schemaVersion": "universe-coverage-status-v1",
                        "ticker": ticker,
                        "status": row_status,
                        "barRows": count,
                        "details": details or {},
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
            }
        )
    conn.executemany(
        """
        INSERT OR REPLACE INTO universe_coverage_status
          (ticker, status, source, last_attempt_at, json)
        VALUES
          (:ticker, :status, :source, :last_attempt_at, :json)
        """,
        payloads,
    )


def run_bar_backfill(args: argparse.Namespace, tickers: list[str]) -> dict[str, Any]:
    if not tickers:
        return {"status": "empty", "chunks": 0}
    chunks = [tickers[index : index + args.chunk_size] for index in range(0, len(tickers), args.chunk_size)]
    outputs: list[dict[str, Any]] = []
    for chunk in chunks:
        command = [
            sys.executable,
            str(BAR_BUILDER),
            "--db",
            args.db,
            "--tickers",
            ",".join(chunk),
            "--provider-order",
            args.bar_provider_order,
            "--start",
            yyyymmdd(args.start_ymd),
            "--end",
            yyyymmdd(args.end_ymd),
            "--limit-bars",
            str(args.limit_bars),
            "--min-existing",
            str(args.min_existing),
            "--fetch-timeout",
            str(args.fetch_timeout),
            "--sleep-ms",
            str(args.sleep_ms),
            "--skip-regimes",
        ]
        if args.force:
            command.append("--force")
        completed = subprocess.run(command, cwd=str(REPO_ROOT), text=True, capture_output=True, timeout=args.backfill_timeout)
        outputs.append(
            {
                "tickers": chunk,
                "returnCode": completed.returncode,
                "stdoutTail": completed.stdout.splitlines()[-5:],
                "stderrTail": completed.stderr.splitlines()[-5:],
            }
        )
        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000)
    return {"status": "ok", "chunks": len(chunks), "outputs": outputs}


def coverage_summary(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT status, COUNT(*) AS n
        FROM universe_coverage_status
        GROUP BY status
        ORDER BY status
        """
    ).fetchall()
    return {row[0]: int(row[1] or 0) for row in rows}


def source_table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return bool(
        conn.execute(
            "SELECT COUNT(*) FROM src.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()[0]
        or 0
    )


def merge_into_target(source_db: str, target_db: str) -> dict[str, Any]:
    source_path = Path(source_db).resolve()
    target_path = Path(target_db).resolve()
    if source_path == target_path:
        return {"status": "skipped", "reason": "source_equals_target"}
    if not source_path.exists():
        raise RuntimeError(f"source DB does not exist: {source_path}")
    target_path.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for delay in (0, *SQLITE_RETRY_DELAYS):
        if delay:
            time.sleep(delay)
        conn = connect_sqlite(target_path)
        try:
            init_schema(conn)
            init_historical_bars_schema(conn)
            commit_with_retry(conn)
            conn.execute("ATTACH DATABASE ? AS src", (str(source_path),))
            conn.execute("BEGIN IMMEDIATE")
            before = conn.total_changes
            if source_table_exists(conn, "universe_membership"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO universe_membership(ticker, added_at, removed_at, source, json)
                    SELECT ticker, added_at, removed_at, source, json FROM src.universe_membership
                    """
                )
            if source_table_exists(conn, "universe_coverage_status"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO universe_coverage_status(ticker, status, source, last_attempt_at, json)
                    SELECT ticker, status, source, last_attempt_at, json FROM src.universe_coverage_status
                    """
                )
            if source_table_exists(conn, "historical_bars"):
                conn.execute(
                    """
                    INSERT OR REPLACE INTO historical_bars(ticker, date, open, high, low, close, volume, source)
                    SELECT ticker, date, open, high, low, close, volume, source FROM src.historical_bars
                    """
                )
            commit_with_retry(conn)
            changed = conn.total_changes - before
            conn.execute("DETACH DATABASE src")
            return {"status": "ok", "target": str(target_path), "rowsChanged": changed}
        except sqlite3.OperationalError as exc:
            conn.rollback()
            last_error = exc
            if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                raise
        finally:
            conn.close()
    raise last_error or sqlite3.OperationalError("merge failed")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--source", choices=["auto", "fja05680", "wikipedia"], default="auto")
    parser.add_argument("--start", default="20190101")
    parser.add_argument("--end", default="")
    parser.add_argument("--fetch-timeout", type=int, default=30)
    parser.add_argument("--limit-tickers", type=int, default=0)
    parser.add_argument("--backfill-bars", action="store_true")
    parser.add_argument("--bar-provider-order", default="longbridge")
    parser.add_argument("--limit-bars", type=int, default=1800)
    parser.add_argument("--min-existing", type=int, default=1200)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--chunk-size", type=int, default=40)
    parser.add_argument("--sleep-ms", type=int, default=250)
    parser.add_argument("--backfill-timeout", type=int, default=900)
    parser.add_argument("--merge-into", default="", help="Merge working DB results into this target DB in one short transaction.")
    args = parser.parse_args(argv)
    args.db = str(Path(args.db))
    args.start_ymd = ymd(args.start)
    end_day = date.today() if not args.end else datetime.strptime(yyyymmdd(args.end), "%Y%m%d").date()
    args.end_ymd = end_day.isoformat()
    if not args.start_ymd:
        args.start_ymd = (end_day - timedelta(days=365 * 7)).isoformat()
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    Path(args.db).parent.mkdir(parents=True, exist_ok=True)
    conn = connect_sqlite(args.db)
    try:
        init_schema(conn)
        rows, source_meta = membership_rows(args)
        if args.limit_tickers > 0:
            keep = set(sorted({row["ticker"] for row in rows})[: args.limit_tickers])
            rows = [row for row in rows if row["ticker"] in keep]
        inserted = insert_membership(conn, rows, source_meta)
        # Release the write lock before spawning bar-backfill subprocesses that
        # open the same database; an uncommitted transaction here deadlocks them.
        commit_with_retry(conn)
        tickers = sorted({row["ticker"] for row in rows})
        backfill = {"status": "skipped"}
        coverage_status = "not_checked"
        if args.backfill_bars:
            backfill = run_bar_backfill(args, tickers)
            coverage_status = "bars_unavailable"
        update_coverage_status(conn, tickers, coverage_status, source_meta.get("sourceUrl") or source_meta.get("repository") or args.source, backfill)
        commit_with_retry(conn)
        payload = {
            "status": "ok" if rows else "empty",
            "source": source_meta,
            "membershipRows": len(rows),
            "uniqueTickers": len(tickers),
            "insertedOrReplaced": inserted,
            "start": args.start_ymd,
            "end": args.end_ymd,
            "backfill": {"status": backfill.get("status"), "chunks": backfill.get("chunks", 0)},
            "coverage": coverage_summary(conn),
            "mergeInto": {"status": "skipped"},
        }
    finally:
        conn.close()
    if args.merge_into:
        payload["mergeInto"] = merge_into_target(args.db, args.merge_into)
    print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
