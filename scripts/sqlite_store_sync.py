#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from pathlib import Path
from typing import Any

SQLITE_BUSY_TIMEOUT_MS = 30000


def connect_sqlite(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=max(30, SQLITE_BUSY_TIMEOUT_MS // 1000))
    conn.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
    return conn


def text(value: Any) -> str:
    if value is None:
        return ""
    return clean_surrogates(str(value))


def dump(value: Any) -> str:
    return clean_surrogates(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def sha256_text(value: str) -> str:
    return hashlib.sha256(clean_surrogates(value).encode("utf-8", "replace")).hexdigest()


def clean_surrogates(value: str) -> str:
    return value.encode("utf-8", "replace").decode("utf-8")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else {}


def run_watermark(run: dict[str, Any]) -> str:
    return text(run.get("completedAt") or run.get("generatedAt") or run.get("startedAt") or run.get("id"))


def run_after_since(run: dict[str, Any], since: str = "") -> bool:
    if not since:
        return True
    watermark = run_watermark(run)
    return bool(watermark and watermark > since)


def latest_store_watermark(store: dict[str, Any]) -> str:
    values = [run_watermark(run) for run in store.get("runs") or [] if isinstance(run, dict)]
    return max([value for value in values if value], default="")


def run_summary(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": run.get("id", ""),
        "session": run.get("session", ""),
        "trigger": run.get("trigger", ""),
        "startedAt": run.get("startedAt", ""),
        "completedAt": run.get("completedAt", ""),
        "summaryOnly": bool(run.get("summaryOnly")),
        "newsCount": len(run.get("news") or []) if isinstance(run.get("news"), list) else run.get("newsCount", 0),
        "socialPostsCount": len(run.get("socialPosts") or []) if isinstance(run.get("socialPosts"), list) else run.get("socialPostsCount", 0),
        "optionsCount": len(run.get("options") or []) if isinstance(run.get("options"), list) else run.get("optionsCount", 0),
        "errorCount": len(run.get("errors") or []) if isinstance(run.get("errors"), list) else run.get("errorCount", 0),
        "marketSummary": (run.get("marketOverview") or {}).get("summary", "") if isinstance(run.get("marketOverview"), dict) else "",
    }


def run_slim_json(run: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": run.get("id", ""),
        "session": run.get("session", ""),
        "trigger": run.get("trigger", ""),
        "startedAt": run.get("startedAt", ""),
        "completedAt": run.get("completedAt", ""),
        "counts": {
            "news": len(run.get("news") or []) if isinstance(run.get("news"), list) else 0,
            "filings": len(run.get("filings") or []) if isinstance(run.get("filings"), list) else 0,
            "socialPosts": len(run.get("socialPosts") or []) if isinstance(run.get("socialPosts"), list) else 0,
            "options": len(run.get("options") or []) if isinstance(run.get("options"), list) else 0,
            "errors": len(run.get("errors") or []) if isinstance(run.get("errors"), list) else 0,
        },
        "marketOverview": run.get("marketOverview") or None,
        "dataQuality": run.get("dataQuality") or None,
    }


def ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")


def row_regime(row: dict[str, Any]) -> str:
    if not isinstance(row, dict):
        return ""
    value = row.get("regime")
    if value:
        return text(value)
    tag = row.get("regimeTag")
    if isinstance(tag, dict) and tag.get("bucket"):
        return text(tag.get("bucket"))
    factor = ((row.get("factorSnapshot") or {}).get("factors") or {}).get("macroRegime") or {}
    raw = factor.get("raw") or {}
    risk = raw.get("marketRisk")
    try:
        risk_num = float(risk)
    except (TypeError, ValueError):
        return text(raw.get("regime") or "unknown")
    if risk_num < 45:
        return "risk_on"
    if risk_num < 65:
        return "neutral"
    if risk_num < 80:
        return "risk_off"
    return "high_risk"


def number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if result == result else None


def normalize_iv(value: Any) -> float | None:
    result = number(value)
    if result is None or result <= 0:
        return None
    return result / 100 if result > 3 else result


def extract_atm_iv(option: dict[str, Any]) -> float | None:
    direct = normalize_iv(option.get("ivAtm") or (option.get("summary") or {}).get("ivAtm"))
    if direct is not None:
        return direct
    spot = number(option.get("underlyingPrice") or option.get("spot") or option.get("price"))
    candidates: list[tuple[float, float]] = []
    for row in option.get("ivSmile") or []:
        if not isinstance(row, dict):
            continue
        strike = number(row.get("strike"))
        iv = normalize_iv(row.get("avgIv") or row.get("iv") or row.get("impliedVolatility"))
        if strike is not None and iv is not None:
            candidates.append((strike, iv))
    for row in option.get("contracts") or []:
        if not isinstance(row, dict):
            continue
        strike = number(row.get("strike"))
        iv = normalize_iv(row.get("impliedVolatility") or row.get("iv") or row.get("implied_volatility"))
        if strike is not None and iv is not None:
            candidates.append((strike, iv))
    for expiry in option.get("expirations") or []:
        if not isinstance(expiry, dict):
            continue
        for row in expiry.get("options") or []:
            if not isinstance(row, dict):
                continue
            strike = number(row.get("strike"))
            iv = normalize_iv(row.get("impliedVolatility") or row.get("iv") or row.get("avgIv"))
            if strike is not None and iv is not None:
                candidates.append((strike, iv))
    if not candidates:
        return None
    if spot is not None and spot > 0:
        return sorted(candidates, key=lambda item: abs(item[0] - spot))[0][1]
    ordered = sorted(candidates, key=lambda item: item[0])
    return ordered[len(ordered) // 2][1]


def safe_ticker(value: Any) -> str:
    return "".join(ch for ch in text(value).upper().strip() if ch.isalnum() or ch in {".", "-"}).split(".")[0]


def same_ymd(a: Any, b: Any) -> bool:
    ay = text(a)[:10]
    by = text(b)[:10]
    return bool(ay and by and ay == by)


def row_after_since(row: dict[str, Any], since: str = "", fields: tuple[str, ...] = ("createdAt", "updatedAt")) -> bool:
    if not since:
        return True
    if not isinstance(row, dict):
        return False
    for field in fields:
        value = text(row.get(field))
        if value:
            return value > since
    return False


def normalize_trade_side(value: Any) -> str:
    side = text(value).lower()
    if side in {"buy", "b", "bot", "long", "买入"} or "buy" in side or "买" in side:
        return "buy"
    if side in {"sell", "s", "sld", "short", "卖出"} or "sell" in side or "卖" in side:
        return "sell"
    return side


def outcome_quality_status(row: dict[str, Any]) -> str:
    explicit = text(row.get("outcomeQualityStatus") or row.get("qualityStatus"))
    if explicit in {"ok", "suspect_price"}:
        return explicit
    raw = number(
        row.get("tickerReturnPct")
        if row.get("tickerReturnPct") is not None
        else row.get("rawReturnPct")
        if row.get("rawReturnPct") is not None
        else row.get("performancePct")
    )
    entry = number(row.get("entryPrice"))
    exit_price = number(row.get("exitPrice"))
    horizon = number(row.get("horizonDays"))
    if entry is None or entry <= 0 or exit_price is None or exit_price <= 0:
        return "suspect_price"
    if entry < 0.5:
        return "suspect_price"
    short_horizon = horizon is None or horizon <= 10
    if short_horizon and raw is not None and abs(raw) > 100:
        return "suspect_price"
    ratio = exit_price / entry
    if short_horizon and (ratio > 3 or ratio < 1 / 3):
        return "suspect_price"
    return "ok"


def news_checksum(row: dict[str, Any]) -> str:
    return sha256_text("|".join([text(row.get("ticker")), text(row.get("url") or row.get("link")), text(row.get("title") or row.get("titleZh")), text(row.get("publishedAt"))]))


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;

        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          session TEXT,
          trigger TEXT,
          started_at TEXT,
          completed_at TEXT,
          summary_only INTEGER DEFAULT 0,
          news_count INTEGER DEFAULT 0,
          social_posts_count INTEGER DEFAULT 0,
          options_count INTEGER DEFAULT 0,
          error_count INTEGER DEFAULT 0,
          summary_json TEXT NOT NULL,
          full_json TEXT NOT NULL,
          slim_json TEXT,
          row_count_checksum TEXT,
          spot_hash TEXT
        );

        CREATE TABLE IF NOT EXISTS article_cache (
          cache_key TEXT PRIMARY KEY,
          ticker TEXT,
          url TEXT,
          updated_at TEXT,
          status TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stock_history (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          run_id TEXT,
          captured_at TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS social_posts (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          source TEXT,
          published_at TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recommendation_decisions (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          ticker TEXT,
          action TEXT,
          status TEXT,
          generated_at TEXT,
          price REAL,
          action_score REAL,
          alpha_score REAL,
          data_quality_score REAL,
          factor_snapshot_id TEXT,
          strategy_version TEXT,
          regime TEXT,
          evidence_refs TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recommendation_outcomes (
          id TEXT PRIMARY KEY,
          decision_id TEXT,
          ticker TEXT,
          action TEXT,
          horizon_days INTEGER,
          evaluated_at TEXT,
          outcome TEXT,
          excess_pct REAL,
          mae_pct REAL,
          mfe_pct REAL,
          regime TEXT,
          outcome_quality_status TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS factor_stats (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          factor_id TEXT,
          label TEXT,
          samples INTEGER DEFAULT 0,
          rank_ic REAL,
          avg_excess_pct REAL,
          hit_rate REAL,
          regime TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS factor_registry (
          factor_id TEXT PRIMARY KEY,
          family TEXT,
          state TEXT,
          prior TEXT,
          implementation TEXT,
          created_by TEXT,
          updated_at TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS factor_trial_ledger (
          id TEXT PRIMARY KEY,
          factor_id TEXT,
          accepted INTEGER DEFAULT 0,
          reason TEXT,
          created_at TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_versions (
          id TEXT PRIMARY KEY,
          strategy_type TEXT,
          config_hash TEXT,
          active_from TEXT,
          active_to TEXT,
          change_reason TEXT,
          evaluation_summary TEXT,
          status TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS news_items (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          ticker TEXT,
          category TEXT,
          source TEXT,
          publisher TEXT,
          published_at TEXT,
          url TEXT,
          title TEXT,
          summary TEXT,
          checksum TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS data_quality_audits (
          id TEXT PRIMARY KEY,
          decision_id TEXT,
          run_id TEXT,
          ticker TEXT,
          score REAL,
          status TEXT,
          missing_count INTEGER DEFAULT 0,
          stale_count INTEGER DEFAULT 0,
          fallback_count INTEGER DEFAULT 0,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS options_snapshots (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          ticker TEXT,
          as_of TEXT,
          provider TEXT,
          iv_atm REAL,
          chain_quality TEXT,
          contracts_count INTEGER DEFAULT 0,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pit_universe_snapshots (
          id TEXT PRIMARY KEY,
          run_id TEXT,
          as_of TEXT,
          ticker TEXT,
          labels TEXT,
          source TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          event_type TEXT,
          actor TEXT,
          status TEXT,
          created_at TEXT,
          payload_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS consensus_snapshots (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          event_date TEXT,
          captured_at TEXT,
          eps_estimate REAL,
          revenue_estimate REAL,
          source TEXT,
          status TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sue_history (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          event_date TEXT,
          captured_at TEXT,
          eps_estimate REAL,
          revenue_estimate REAL,
          actual_eps REAL,
          actual_revenue REAL,
          sue_eps REAL,
          source TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS short_interest_history (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          captured_at TEXT,
          short_interest REAL,
          source TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analyst_revision_history (
          id TEXT PRIMARY KEY,
          ticker TEXT,
          captured_at TEXT,
          upgrades INTEGER DEFAULT 0,
          downgrades INTEGER DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          source TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trade_recommendation_reconciliation (
          id TEXT PRIMARY KEY,
          trade_id TEXT,
          decision_id TEXT,
          ticker TEXT,
          executed_at TEXT,
          classification TEXT,
          thesis_alignment TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_paper_acceptances (
          id TEXT PRIMARY KEY,
          decision_id TEXT,
          ticker TEXT,
          accepted_at TEXT,
          status TEXT,
          entry_price REAL,
          slippage_bps REAL,
          cost_bps REAL,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trader_profile_snapshots (
          id TEXT PRIMARY KEY,
          generated_at TEXT,
          status TEXT,
          closed_lots INTEGER DEFAULT 0,
          trades INTEGER DEFAULT 0,
          open_lots INTEGER DEFAULT 0,
          narrative_status TEXT,
          json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_runs_completed_at ON runs(completed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_stock_history_ticker_time ON stock_history(ticker, captured_at DESC);
        CREATE INDEX IF NOT EXISTS idx_social_posts_ticker_time ON social_posts(ticker, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_article_cache_ticker ON article_cache(ticker);
        CREATE INDEX IF NOT EXISTS idx_recommendation_decisions_ticker_time ON recommendation_decisions(ticker, generated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_recommendation_outcomes_decision ON recommendation_outcomes(decision_id, horizon_days);
        CREATE INDEX IF NOT EXISTS idx_factor_stats_factor ON factor_stats(factor_id, samples DESC);
        CREATE INDEX IF NOT EXISTS idx_factor_registry_state ON factor_registry(state, family);
        CREATE INDEX IF NOT EXISTS idx_factor_trial_factor ON factor_trial_ledger(factor_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_news_items_ticker_time ON news_items(ticker, published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_news_items_run ON news_items(run_id);
        CREATE INDEX IF NOT EXISTS idx_dq_audits_decision ON data_quality_audits(decision_id);
        CREATE INDEX IF NOT EXISTS idx_options_snapshots_ticker_time ON options_snapshots(ticker, as_of DESC);
        CREATE INDEX IF NOT EXISTS idx_pit_universe_time ON pit_universe_snapshots(as_of DESC, ticker);
        CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_consensus_snapshots_ticker_event ON consensus_snapshots(ticker, event_date DESC);
        CREATE INDEX IF NOT EXISTS idx_sue_history_ticker_event ON sue_history(ticker, event_date DESC);
        CREATE INDEX IF NOT EXISTS idx_short_interest_ticker_time ON short_interest_history(ticker, captured_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analyst_revision_ticker_time ON analyst_revision_history(ticker, captured_at DESC);
        CREATE INDEX IF NOT EXISTS idx_trader_profile_generated ON trader_profile_snapshots(generated_at DESC);
        """
    )
    ensure_column(conn, "runs", "slim_json", "TEXT")
    ensure_column(conn, "runs", "row_count_checksum", "TEXT")
    ensure_column(conn, "runs", "spot_hash", "TEXT")
    ensure_column(conn, "recommendation_decisions", "strategy_version", "TEXT")
    ensure_column(conn, "recommendation_decisions", "regime", "TEXT")
    ensure_column(conn, "recommendation_decisions", "evidence_refs", "TEXT")
    ensure_column(conn, "recommendation_outcomes", "regime", "TEXT")
    ensure_column(conn, "recommendation_outcomes", "outcome_quality_status", "TEXT")
    ensure_column(conn, "factor_stats", "regime", "TEXT")


def sync_store(conn: sqlite3.Connection, store: dict[str, Any], since: str = "") -> dict[str, int]:
    init_schema(conn)
    counts = {
        "runs": 0,
        "articleCache": 0,
        "stockHistory": 0,
        "socialPosts": 0,
        "recommendationDecisions": 0,
        "recommendationOutcomes": 0,
        "factorStats": 0,
        "factorRegistry": 0,
        "factorTrialLedger": 0,
        "strategyVersions": 0,
        "newsItems": 0,
        "dataQualityAudits": 0,
        "optionsSnapshots": 0,
        "pitUniverseSnapshots": 0,
        "auditEvents": 0,
        "consensusSnapshots": 0,
        "sueHistory": 0,
        "shortInterestHistory": 0,
        "analystRevisionHistory": 0,
        "tradeRecommendationReconciliation": 0,
        "userPaperAcceptances": 0,
        "traderProfileSnapshots": 0,
    }
    runs_to_sync = [run for run in store.get("runs") or [] if isinstance(run, dict) and run_after_since(run, since)]
    with conn:
        for run in runs_to_sync:
            if not isinstance(run, dict) or not run.get("id"):
                continue
            summary = run_summary(run)
            slim = run_slim_json(run)
            row_count_checksum = sha256_text(dump(slim.get("counts") or {}))
            spot_hash = sha256_text("|".join([text(run.get("id")), text(run.get("completedAt")), dump((run.get("news") or [])[:3]), dump((run.get("options") or [])[:2])]))
            conn.execute(
                """
                INSERT INTO runs (
                  id, session, trigger, started_at, completed_at, summary_only,
                  news_count, social_posts_count, options_count, error_count,
                  summary_json, full_json, slim_json, row_count_checksum, spot_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  session=excluded.session,
                  trigger=excluded.trigger,
                  started_at=excluded.started_at,
                  completed_at=excluded.completed_at,
                  summary_only=excluded.summary_only,
                  news_count=excluded.news_count,
                  social_posts_count=excluded.social_posts_count,
                  options_count=excluded.options_count,
                  error_count=excluded.error_count,
                  summary_json=excluded.summary_json,
                  full_json=excluded.full_json,
                  slim_json=excluded.slim_json,
                  row_count_checksum=excluded.row_count_checksum,
                  spot_hash=excluded.spot_hash
                """,
                (
                    text(run.get("id")),
                    text(run.get("session")),
                    text(run.get("trigger")),
                    text(run.get("startedAt")),
                    text(run.get("completedAt")),
                    1 if run.get("summaryOnly") else 0,
                    int(summary.get("newsCount") or 0),
                    int(summary.get("socialPostsCount") or 0),
                    int(summary.get("optionsCount") or 0),
                    int(summary.get("errorCount") or 0),
                    dump(summary),
                    dump(run),
                    dump(slim),
                    row_count_checksum,
                    spot_hash,
                ),
            )
            counts["runs"] += 1

            news_rows: dict[str, dict[str, Any]] = {}
            for source_key in ["news", "filings"]:
                for news in run.get(source_key) or []:
                    if not isinstance(news, dict):
                        continue
                    checksum = news_checksum(news)
                    news_id = text(news.get("id") or news.get("url") or f"{run.get('id')}:{source_key}:{checksum[:16]}")
                    news_rows[news_id] = {
                        **news,
                        "_sourceKey": source_key,
                        "_checksum": checksum,
                    }
            for news_id, news in news_rows.items():
                conn.execute(
                    """
                    INSERT INTO news_items(
                      id, run_id, ticker, category, source, publisher, published_at,
                      url, title, summary, checksum, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      run_id=excluded.run_id,
                      ticker=excluded.ticker,
                      category=excluded.category,
                      source=excluded.source,
                      publisher=excluded.publisher,
                      published_at=excluded.published_at,
                      url=excluded.url,
                      title=excluded.title,
                      summary=excluded.summary,
                      checksum=excluded.checksum,
                      json=excluded.json
                    """,
                    (
                        news_id,
                        text(run.get("id")),
                        text(news.get("ticker")),
                        text(news.get("newsCategory") or news.get("category") or news.get("_sourceKey")),
                        text(news.get("source") or news.get("provider")),
                        text(news.get("publisher")),
                        text(news.get("publishedAt") or news.get("createdAt")),
                        text(news.get("url") or news.get("link")),
                        text(news.get("titleZh") or news.get("title")),
                        text(((news.get("article") or {}).get("summaryZh")) or news.get("summaryZh") or news.get("summary")),
                        text(news.get("_checksum")),
                        dump(news),
                    ),
                )
                counts["newsItems"] += 1

            for option in run.get("options") or []:
                if not isinstance(option, dict):
                    continue
                ticker = text(option.get("ticker"))
                if not ticker:
                    continue
                contracts = option.get("contracts") if isinstance(option.get("contracts"), list) else []
                expirations = option.get("expirations") if isinstance(option.get("expirations"), list) else []
                contract_count = int(option.get("contractCount") or len(contracts) or sum(len((exp or {}).get("options") or []) for exp in expirations if isinstance(exp, dict)) or 0)
                iv_atm = extract_atm_iv(option)
                snap_id = text(f"{run.get('id')}:{ticker}:{option.get('provider','options')}")
                conn.execute(
                    """
                    INSERT INTO options_snapshots(id, run_id, ticker, as_of, provider, iv_atm, chain_quality, contracts_count, json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      run_id=excluded.run_id,
                      ticker=excluded.ticker,
                      as_of=excluded.as_of,
                      provider=excluded.provider,
                      iv_atm=excluded.iv_atm,
                      chain_quality=excluded.chain_quality,
                      contracts_count=excluded.contracts_count,
                      json=excluded.json
                    """,
                    (
                        snap_id,
                        text(run.get("id")),
                        ticker,
                        text(run.get("completedAt") or run.get("generatedAt")),
                        text(option.get("provider")),
                        iv_atm,
                        text(option.get("status") or option.get("quality") or ("ok" if contract_count else "empty")),
                        contract_count,
                        dump(option),
                    ),
                )
                counts["optionsSnapshots"] += 1

            universe: dict[str, set[str]] = {}
            def add_universe(ticker: Any, label: str) -> None:
                symbol = text(ticker).upper().replace("$", "").strip()
                if not symbol or len(symbol) > 12:
                    return
                universe.setdefault(symbol, set()).add(label)
            for ticker in run.get("watchlist") or []:
                add_universe(ticker, "watchlist")
            for ticker in run.get("researchTickers") or []:
                add_universe(ticker, "research")
            for key in ["quotes", "technicals", "fundamentals", "news", "socialPosts"]:
                for row in run.get(key) or []:
                    if isinstance(row, dict):
                        add_universe(row.get("ticker") or row.get("symbol"), key)
                        for related in row.get("relatedTickers") or []:
                            add_universe(related, f"{key}:related")
            for ticker, labels in universe.items():
                pit_id = text(f"{run.get('id')}:{ticker}")
                payload = {"ticker": ticker, "labels": sorted(labels), "runId": run.get("id")}
                conn.execute(
                    """
                    INSERT INTO pit_universe_snapshots(id, run_id, as_of, ticker, labels, source, json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      run_id=excluded.run_id,
                      as_of=excluded.as_of,
                      ticker=excluded.ticker,
                      labels=excluded.labels,
                      source=excluded.source,
                      json=excluded.json
                    """,
                    (
                        pit_id,
                        text(run.get("id")),
                        text(run.get("completedAt") or run.get("generatedAt")),
                        ticker,
                        ",".join(sorted(labels)),
                        "run-universe",
                        dump(payload),
                    ),
                )
                counts["pitUniverseSnapshots"] += 1

        article_cache = store.get("articleCache") or {}
        if isinstance(article_cache, dict):
            for key, row in article_cache.items():
                if not isinstance(row, dict):
                    continue
                if not row_after_since(row, since, ("updatedAt", "fetchedAt", "cachedAt", "publishedAt")):
                    continue
                conn.execute(
                    """
                    INSERT INTO article_cache(cache_key, ticker, url, updated_at, status, json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(cache_key) DO UPDATE SET
                      ticker=excluded.ticker,
                      url=excluded.url,
                      updated_at=excluded.updated_at,
                      status=excluded.status,
                      json=excluded.json
                    """,
                    (
                        text(key),
                        text(row.get("ticker")),
                        text(row.get("url") or row.get("finalUrl") or row.get("resolvedUrl")),
                        text(row.get("updatedAt") or row.get("fetchedAt") or row.get("cachedAt")),
                        text(row.get("status")),
                        dump(row),
                    ),
                )
                counts["articleCache"] += 1

        for row in store.get("stockHistory") or []:
            if not isinstance(row, dict):
                continue
            if not row_after_since(row, since, ("capturedAt", "createdAt", "updatedAt")):
                continue
            row_id = text(row.get("id") or f"{row.get('runId','')}:{row.get('ticker','')}:{row.get('capturedAt','')}")
            if not row_id:
                continue
            conn.execute(
                """
                INSERT INTO stock_history(id, ticker, run_id, captured_at, json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  ticker=excluded.ticker,
                  run_id=excluded.run_id,
                  captured_at=excluded.captured_at,
                  json=excluded.json
                """,
                (row_id, text(row.get("ticker")), text(row.get("runId")), text(row.get("capturedAt")), dump(row)),
            )
            counts["stockHistory"] += 1

        post_rows: dict[str, dict[str, Any]] = {}
        for run in runs_to_sync:
            if isinstance(run, dict):
                for post in run.get("socialPosts") or []:
                    if isinstance(post, dict):
                        post_id = text(post.get("id") or f"{post.get('source','')}:{post.get('ticker','')}:{post.get('url','')}:{post.get('publishedAt','')}")
                        if post_id:
                            post_rows[post_id] = post
        for post_id, row in post_rows.items():
            conn.execute(
                """
                INSERT INTO social_posts(id, ticker, source, published_at, json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  ticker=excluded.ticker,
                  source=excluded.source,
                  published_at=excluded.published_at,
                  json=excluded.json
                """,
                (post_id, text(row.get("ticker")), text(row.get("source")), text(row.get("publishedAt") or row.get("createdAt")), dump(row)),
            )
            counts["socialPosts"] += 1

        agent = store.get("allStockAgent") or {}
        if isinstance(agent, dict):
            strategy_rows: dict[str, dict[str, Any]] = {}
            for row in agent.get("strategyVersions") or []:
                if isinstance(row, dict) and row.get("id"):
                    strategy_rows[text(row.get("id"))] = row
            for run in agent.get("runs") or []:
                if isinstance(run, dict):
                    version = ((run.get("skill") or {}).get("strategyVersion") or (run.get("roadmap") or {}))
                    version_id = text((version.get("id") or version.get("strategyVersion")) if isinstance(version, dict) else version)
                    if version_id:
                        strategy_rows[version_id] = version if isinstance(version, dict) else {"id": version_id}
            for version_id, row in strategy_rows.items():
                conn.execute(
                    """
                    INSERT INTO strategy_versions(id, strategy_type, config_hash, active_from, active_to, change_reason, evaluation_summary, status, json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      strategy_type=excluded.strategy_type,
                      config_hash=excluded.config_hash,
                      active_from=excluded.active_from,
                      active_to=excluded.active_to,
                      change_reason=excluded.change_reason,
                      evaluation_summary=excluded.evaluation_summary,
                      status=excluded.status,
                      json=excluded.json
                    """,
                    (
                        version_id,
                        text(row.get("strategyType") or "all-stock-agent"),
                        text(row.get("configHash") or row.get("strategyConfigHash")),
                        text(row.get("activeFrom") or row.get("generatedAt")),
                        text(row.get("activeTo")),
                        text(row.get("changeReason")),
                        dump(row.get("evaluationSummary")) if row.get("evaluationSummary") is not None else "",
                        text(row.get("status") or "active"),
                        dump(row),
                    ),
                )
                counts["strategyVersions"] += 1

            decision_rows: dict[str, dict[str, Any]] = {}
            for decision in agent.get("decisions") or []:
                if isinstance(decision, dict) and decision.get("id"):
                    decision_rows[text(decision.get("id"))] = decision
            for run in agent.get("runs") or []:
                if not isinstance(run, dict):
                    continue
                for key in ["buyCandidates", "watchBuyCandidates", "sellCandidates", "holdReviews"]:
                    for decision in run.get(key) or []:
                        if isinstance(decision, dict) and decision.get("id"):
                            decision_rows[text(decision.get("id"))] = decision
            for decision_id, row in decision_rows.items():
                if not row_after_since(row, since, ("generatedAt", "createdAt", "updatedAt")):
                    continue
                conn.execute(
                    """
                    INSERT INTO recommendation_decisions(
                      id, run_id, ticker, action, status, generated_at, price,
                      action_score, alpha_score, data_quality_score, factor_snapshot_id,
                      strategy_version, regime, evidence_refs, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      run_id=excluded.run_id,
                      ticker=excluded.ticker,
                      action=excluded.action,
                      status=excluded.status,
                      generated_at=excluded.generated_at,
                      price=excluded.price,
                      action_score=excluded.action_score,
                      alpha_score=excluded.alpha_score,
                      data_quality_score=excluded.data_quality_score,
                      factor_snapshot_id=excluded.factor_snapshot_id,
                      strategy_version=excluded.strategy_version,
                      regime=excluded.regime,
                      evidence_refs=excluded.evidence_refs,
                      json=excluded.json
                    """,
                    (
                        decision_id,
                        text(row.get("runId")),
                        text(row.get("ticker")),
                        text(row.get("action")),
                        text(row.get("status")),
                        text(row.get("generatedAt")),
                        row.get("price"),
                        row.get("actionScore"),
                        row.get("alphaScore"),
                        row.get("dataQualityScore"),
                        text(row.get("factorSnapshotId")),
                        text(row.get("strategyVersion") or row.get("modelVersion")),
                        row_regime(row),
                        dump(row.get("evidenceRefs") or []),
                        dump(row),
                    ),
                )
                counts["recommendationDecisions"] += 1
                audit = row.get("dataQualityAudit")
                if isinstance(audit, dict):
                    audit_id = text(audit.get("id") or f"{decision_id}:data-quality")
                    blocks = audit.get("blocks") if isinstance(audit.get("blocks"), list) else []
                    stale_count = len([block for block in blocks if isinstance(block, dict) and block.get("status") == "stale"])
                    fallback_count = len([block for block in blocks if isinstance(block, dict) and block.get("status") == "fallback"])
                    conn.execute(
                        """
                        INSERT INTO data_quality_audits(
                          id, decision_id, run_id, ticker, score, status,
                          missing_count, stale_count, fallback_count, json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                          decision_id=excluded.decision_id,
                          run_id=excluded.run_id,
                          ticker=excluded.ticker,
                          score=excluded.score,
                          status=excluded.status,
                          missing_count=excluded.missing_count,
                          stale_count=excluded.stale_count,
                          fallback_count=excluded.fallback_count,
                          json=excluded.json
                        """,
                        (
                            audit_id,
                            decision_id,
                            text(row.get("runId")),
                            text(row.get("ticker")),
                            audit.get("score"),
                            text(audit.get("status")),
                            int(audit.get("missingBlocks") or 0),
                            stale_count,
                            fallback_count,
                            dump(audit),
                        ),
                    )
                    counts["dataQualityAudits"] += 1

            for trade in store.get("trades") or []:
                if not isinstance(trade, dict):
                    continue
                ticker = safe_ticker(trade.get("ticker"))
                executed_at = text(trade.get("executedAt") or trade.get("date") or trade.get("time"))
                if since and executed_at <= since:
                    continue
                if not ticker or not executed_at:
                    continue
                same_day = [
                    row
                    for row in decision_rows.values()
                    if safe_ticker(row.get("ticker")) == ticker and same_ymd(row.get("generatedAt"), executed_at)
                ]
                same_day.sort(key=lambda row: abs(number(row.get("actionScore") or row.get("score")) or 0), reverse=True)
                decision = same_day[0] if same_day else None
                side = normalize_trade_side(trade.get("side") or trade.get("action"))
                aligned = bool(
                    decision
                    and ((side == "buy" and text(decision.get("action")) == "买入")
                         or (side == "sell" and text(decision.get("action")) == "卖出"))
                )
                classification = "aligned" if aligned else "contrarian" if decision else "uncovered"
                thesis_alignment = "same_direction" if classification == "aligned" else "opposite_direction" if classification == "contrarian" else "no_same_day_call"
                rec_id = text(f"{trade.get('id') or ticker + ':' + executed_at}:{decision.get('id') if decision else 'uncovered'}")
                payload = {
                    "id": rec_id,
                    "tradeId": trade.get("id") or "",
                    "decisionId": decision.get("id") if decision else "",
                    "ticker": ticker,
                    "executedAt": executed_at,
                    "tradeSide": side,
                    "decisionAction": decision.get("action") if decision else "",
                    "classification": classification,
                    "thesisAlignment": thesis_alignment,
                    "trade": trade,
                    "decision": decision,
                }
                conn.execute(
                    """
                    INSERT INTO trade_recommendation_reconciliation(
                      id, trade_id, decision_id, ticker, executed_at, classification, thesis_alignment, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      trade_id=excluded.trade_id,
                      decision_id=excluded.decision_id,
                      ticker=excluded.ticker,
                      executed_at=excluded.executed_at,
                      classification=excluded.classification,
                      thesis_alignment=excluded.thesis_alignment,
                      json=excluded.json
                    """,
                    (
                        rec_id,
                        text(payload["tradeId"]),
                        text(payload["decisionId"]),
                        ticker,
                        executed_at,
                        classification,
                        thesis_alignment,
                        dump(payload),
                    ),
                )
                counts["tradeRecommendationReconciliation"] += 1

            outcome_rows: dict[str, dict[str, Any]] = {}
            for outcome in agent.get("outcomeSnapshots") or []:
                if isinstance(outcome, dict):
                    outcome_id = text(outcome.get("id") or f"{outcome.get('decisionId','')}:{outcome.get('horizonDays','')}")
                    if outcome_id:
                        outcome_rows[outcome_id] = outcome
            for run in agent.get("runs") or []:
                if isinstance(run, dict):
                    for outcome in run.get("outcomeSnapshots") or []:
                        if isinstance(outcome, dict):
                            outcome_id = text(outcome.get("id") or f"{outcome.get('decisionId','')}:{outcome.get('horizonDays','')}")
                            if outcome_id:
                                outcome_rows[outcome_id] = outcome
            for outcome_id, row in outcome_rows.items():
                if not row_after_since(row, since, ("evaluatedAt", "createdAt", "updatedAt")):
                    continue
                conn.execute(
                    """
                    INSERT INTO recommendation_outcomes(
                      id, decision_id, ticker, action, horizon_days, evaluated_at,
                      outcome, excess_pct, mae_pct, mfe_pct, regime, outcome_quality_status, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      decision_id=excluded.decision_id,
                      ticker=excluded.ticker,
                      action=excluded.action,
                      horizon_days=excluded.horizon_days,
                      evaluated_at=excluded.evaluated_at,
                      outcome=excluded.outcome,
                      excess_pct=excluded.excess_pct,
                      mae_pct=excluded.mae_pct,
                      mfe_pct=excluded.mfe_pct,
                      regime=excluded.regime,
                      outcome_quality_status=excluded.outcome_quality_status,
                      json=excluded.json
                    """,
                    (
                        outcome_id,
                        text(row.get("decisionId")),
                        text(row.get("ticker")),
                        text(row.get("action")),
                        int(row.get("horizonDays") or 0),
                        text(row.get("evaluatedAt")),
                        text(row.get("outcome")),
                        row.get("excessPct"),
                        row.get("maePct"),
                        row.get("mfePct"),
                        row_regime(row),
                        outcome_quality_status(row),
                        dump(row),
                    ),
                )
                counts["recommendationOutcomes"] += 1

            for run in agent.get("runs") or []:
                if not isinstance(run, dict):
                    continue
                if not run_after_since(run, since):
                    continue
                run_id = text(run.get("id"))
                factor_stats = run.get("factorStats") or {}
                if isinstance(factor_stats, dict):
                    for factor_id, row in factor_stats.items():
                        if not isinstance(row, dict):
                            continue
                        stat_id = text(f"{run_id}:{factor_id}")
                        conn.execute(
                            """
                            INSERT INTO factor_stats(id, run_id, factor_id, label, samples, rank_ic, avg_excess_pct, hit_rate, regime, json)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                              run_id=excluded.run_id,
                              factor_id=excluded.factor_id,
                              label=excluded.label,
                              samples=excluded.samples,
                              rank_ic=excluded.rank_ic,
                              avg_excess_pct=excluded.avg_excess_pct,
                              hit_rate=excluded.hit_rate,
                              regime=excluded.regime,
                              json=excluded.json
                            """,
                            (
                                stat_id,
                                run_id,
                                text(factor_id),
                                text(row.get("label")),
                                int(row.get("samples") or 0),
                                row.get("rankIC"),
                                row.get("avgExcessPct"),
                                row.get("hitRate"),
                                text(row.get("regime") or ((row.get("regimeTag") or {}).get("bucket") if isinstance(row.get("regimeTag"), dict) else "")),
                                dump(row),
                            ),
                        )
                        counts["factorStats"] += 1

            registry = store.get("factorRegistry") or {}
            if isinstance(registry, dict):
                for factor in registry.get("factors") or []:
                    if not isinstance(factor, dict):
                        continue
                    factor_id = text(factor.get("factorId"))
                    if not factor_id:
                        continue
                    state_history = factor.get("stateHistory") if isinstance(factor.get("stateHistory"), list) else []
                    updated_at = text((state_history[0] or {}).get("at")) if state_history else text(factor.get("createdAt"))
                    conn.execute(
                        """
                        INSERT INTO factor_registry(factor_id, family, state, prior, implementation, created_by, updated_at, json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(factor_id) DO UPDATE SET
                          family=excluded.family,
                          state=excluded.state,
                          prior=excluded.prior,
                          implementation=excluded.implementation,
                          created_by=excluded.created_by,
                          updated_at=excluded.updated_at,
                          json=excluded.json
                        """,
                        (
                            factor_id,
                            text(factor.get("family")),
                            text(factor.get("state")),
                            text(factor.get("prior")),
                            text(factor.get("implementation") or "dsl"),
                            text(factor.get("createdBy")),
                            updated_at,
                            dump(factor),
                        ),
                    )
                    counts["factorRegistry"] += 1
                ledger = registry.get("trialLedger") or {}
                if isinstance(ledger, dict):
                    for entry in ledger.get("entries") or []:
                        if not isinstance(entry, dict):
                            continue
                        entry_id = text(entry.get("id") or f"{entry.get('factorId','')}:{entry.get('at','')}")
                        if not entry_id:
                            continue
                        conn.execute(
                            """
                            INSERT INTO factor_trial_ledger(id, factor_id, accepted, reason, created_at, json)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                              factor_id=excluded.factor_id,
                              accepted=excluded.accepted,
                              reason=excluded.reason,
                              created_at=excluded.created_at,
                              json=excluded.json
                            """,
                            (
                                entry_id,
                                text(entry.get("factorId")),
                                1 if entry.get("accepted") else 0,
                                text(entry.get("reason")),
                                text(entry.get("at")),
                                dump(entry),
                            ),
                        )
                        counts["factorTrialLedger"] += 1

            portfolio = agent.get("userPaperPortfolio") or {}
            if isinstance(portfolio, dict):
                for row in portfolio.get("acceptances") or []:
                    if not isinstance(row, dict):
                        continue
                    row_id = text(row.get("id") or f"{row.get('decisionId','')}:{row.get('acceptedAt','')}")
                    if not row_id:
                        continue
                    conn.execute(
                        """
                        INSERT INTO user_paper_acceptances(id, decision_id, ticker, accepted_at, status, entry_price, slippage_bps, cost_bps, json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                          decision_id=excluded.decision_id,
                          ticker=excluded.ticker,
                          accepted_at=excluded.accepted_at,
                          status=excluded.status,
                          entry_price=excluded.entry_price,
                          slippage_bps=excluded.slippage_bps,
                          cost_bps=excluded.cost_bps,
                          json=excluded.json
                        """,
                        (
                            row_id,
                            text(row.get("decisionId")),
                            text(row.get("ticker")),
                            text(row.get("acceptedAt")),
                            text(row.get("status")),
                            row.get("entryPrice"),
                            row.get("slippageBps"),
                            row.get("costBps"),
                            dump(row),
                        ),
                    )
                    counts["userPaperAcceptances"] += 1

        trader_profile = store.get("traderProfile") or {}
        if isinstance(trader_profile, dict):
            profile_rows: dict[str, dict[str, Any]] = {}
            current = trader_profile.get("current")
            if isinstance(current, dict):
                profile_id = text(current.get("id") or f"current:{current.get('generatedAt','')}")
                if profile_id:
                    profile_rows[profile_id] = current
            for index, profile in enumerate(trader_profile.get("snapshots") or []):
                if not isinstance(profile, dict):
                    continue
                profile_id = text(profile.get("id") or f"snapshot:{profile.get('generatedAt','')}:{index}")
                if profile_id:
                    profile_rows[profile_id] = profile
            for profile_id, profile in profile_rows.items():
                if not row_after_since(profile, since, ("generatedAt", "updatedAt")):
                    continue
                sample_counts = profile.get("sampleCounts") if isinstance(profile.get("sampleCounts"), dict) else {}
                narrative = profile.get("narrative") if isinstance(profile.get("narrative"), dict) else {}
                conn.execute(
                    """
                    INSERT INTO trader_profile_snapshots(
                      id, generated_at, status, closed_lots, trades, open_lots, narrative_status, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      generated_at=excluded.generated_at,
                      status=excluded.status,
                      closed_lots=excluded.closed_lots,
                      trades=excluded.trades,
                      open_lots=excluded.open_lots,
                      narrative_status=excluded.narrative_status,
                      json=excluded.json
                    """,
                    (
                        profile_id,
                        text(profile.get("generatedAt")),
                        text(profile.get("status")),
                        int(sample_counts.get("closedLots") or 0),
                        int(sample_counts.get("trades") or 0),
                        int(sample_counts.get("openLots") or 0),
                        text(narrative.get("status")),
                        dump(profile),
                    ),
                )
                counts["traderProfileSnapshots"] += 1

        for row in store.get("auditEvents") or []:
            if not isinstance(row, dict):
                continue
            if not row_after_since(row, since, ("createdAt", "updatedAt")):
                continue
            row_id = text(row.get("id") or f"{row.get('eventType','')}:{row.get('createdAt','')}")
            if not row_id:
                continue
            conn.execute(
                """
                INSERT INTO audit_events(id, event_type, actor, status, created_at, payload_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  event_type=excluded.event_type,
                  actor=excluded.actor,
                  status=excluded.status,
                  created_at=excluded.created_at,
                  payload_json=excluded.payload_json
                """,
                (
                    row_id,
                    text(row.get("eventType") or row.get("type")),
                    text(row.get("actor")),
                    text(row.get("status")),
                    text(row.get("createdAt")),
                    dump(row.get("payload") or row),
                ),
            )
            counts["auditEvents"] += 1

        for row in store.get("consensusSnapshots") or []:
            if not isinstance(row, dict):
                continue
            if not row_after_since(row, since, ("capturedAt", "createdAt", "updatedAt")):
                continue
            row_id = text(row.get("id") or f"{row.get('ticker','')}:{row.get('eventDate','')}:{row.get('capturedAt','')}")
            if not row_id:
                continue
            conn.execute(
                """
                INSERT INTO consensus_snapshots(
                  id, ticker, event_date, captured_at, eps_estimate, revenue_estimate, source, status, json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  ticker=excluded.ticker,
                  event_date=excluded.event_date,
                  captured_at=excluded.captured_at,
                  eps_estimate=excluded.eps_estimate,
                  revenue_estimate=excluded.revenue_estimate,
                  source=excluded.source,
                  status=excluded.status,
                  json=excluded.json
                """,
                (
                    row_id,
                    text(row.get("ticker")),
                    text(row.get("eventDate")),
                    text(row.get("capturedAt")),
                    row.get("epsEstimate"),
                    row.get("revenueEstimate"),
                    text(row.get("source")),
                    text(row.get("status")),
                    dump(row),
                ),
            )
            counts["consensusSnapshots"] += 1
            conn.execute(
                """
                INSERT INTO sue_history(
                  id, ticker, event_date, captured_at, eps_estimate, revenue_estimate,
                  actual_eps, actual_revenue, sue_eps, source, json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  ticker=excluded.ticker,
                  event_date=excluded.event_date,
                  captured_at=excluded.captured_at,
                  eps_estimate=excluded.eps_estimate,
                  revenue_estimate=excluded.revenue_estimate,
                  actual_eps=excluded.actual_eps,
                  actual_revenue=excluded.actual_revenue,
                  sue_eps=excluded.sue_eps,
                  source=excluded.source,
                  json=excluded.json
                """,
                (
                    f"sue:{row_id}",
                    text(row.get("ticker")),
                    text(row.get("eventDate")),
                    text(row.get("capturedAt")),
                    row.get("epsEstimate"),
                    row.get("revenueEstimate"),
                    row.get("actualEps"),
                    row.get("actualRevenue"),
                    row.get("sueEps"),
                    text(row.get("source")),
                    dump(row),
                ),
            )
            counts["sueHistory"] += 1

        for run in runs_to_sync:
            if not isinstance(run, dict):
                continue
            captured_at = text(run.get("completedAt") or run.get("generatedAt") or run.get("startedAt"))
            for pack in run.get("researchPacks") or []:
                if not isinstance(pack, dict):
                    continue
                ticker = safe_ticker(pack.get("ticker"))
                if not ticker:
                    continue
                summary = pack.get("summary") if isinstance(pack.get("summary"), dict) else {}
                short_interest = number(
                    summary.get("shortInterest")
                    or summary.get("short_interest")
                    or pack.get("shortInterest")
                    or pack.get("short_interest")
                )
                if short_interest is not None:
                    row_id = f"short:{ticker}:{captured_at}:{text(pack.get('provider'))}"
                    conn.execute(
                        """
                        INSERT INTO short_interest_history(id, ticker, captured_at, short_interest, source, json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                          ticker=excluded.ticker,
                          captured_at=excluded.captured_at,
                          short_interest=excluded.short_interest,
                          source=excluded.source,
                          json=excluded.json
                        """,
                        (row_id, ticker, captured_at, short_interest, text(pack.get("provider")), dump(pack)),
                    )
                    counts["shortInterestHistory"] += 1
                upgrades = int(number(summary.get("upgrades") or summary.get("upgradeCount") or 0) or 0)
                downgrades = int(number(summary.get("downgrades") or summary.get("downgradeCount") or 0) or 0)
                rating_count = int(number(summary.get("ratingCount") or summary.get("analystCount") or 0) or 0)
                if upgrades or downgrades or rating_count:
                    row_id = f"revision:{ticker}:{captured_at}:{text(pack.get('provider'))}"
                    conn.execute(
                        """
                        INSERT INTO analyst_revision_history(id, ticker, captured_at, upgrades, downgrades, rating_count, source, json)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET
                          ticker=excluded.ticker,
                          captured_at=excluded.captured_at,
                          upgrades=excluded.upgrades,
                          downgrades=excluded.downgrades,
                          rating_count=excluded.rating_count,
                          source=excluded.source,
                          json=excluded.json
                        """,
                        (row_id, ticker, captured_at, upgrades, downgrades, rating_count, text(pack.get("provider")), dump(pack)),
                    )
                    counts["analystRevisionHistory"] += 1

        conn.execute("INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)", ("last_sync", dump(counts)))
    return counts


def status(conn: sqlite3.Connection) -> dict[str, Any]:
    init_schema(conn)
    tables = {}
    for table in [
        "runs",
        "article_cache",
        "stock_history",
        "social_posts",
        "recommendation_decisions",
        "recommendation_outcomes",
        "factor_stats",
        "factor_registry",
        "factor_trial_ledger",
        "strategy_versions",
        "news_items",
        "data_quality_audits",
        "options_snapshots",
        "pit_universe_snapshots",
        "audit_events",
        "consensus_snapshots",
        "sue_history",
        "short_interest_history",
        "analyst_revision_history",
        "trade_recommendation_reconciliation",
        "user_paper_acceptances",
    ]:
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        tables[table] = count
    latest = conn.execute("SELECT id, completed_at FROM runs ORDER BY completed_at DESC LIMIT 1").fetchone()
    return {
        "tables": tables,
        "latestRun": {"id": latest[0], "completedAt": latest[1]} if latest else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--store-json", required=True)
    parser.add_argument("--db", required=True)
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--since", default="")
    args = parser.parse_args()
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect_sqlite(db_path)
    try:
        if args.status:
            payload = {"status": "ok", "db": str(db_path), **status(conn)}
        else:
            store = load_json(Path(args.store_json))
            payload = {
                "status": "ok",
                "db": str(db_path),
                "since": args.since,
                "watermark": latest_store_watermark(store) or args.since,
                "synced": sync_store(conn, store, since=args.since),
                **status(conn),
            }
        print(json.dumps(payload, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
