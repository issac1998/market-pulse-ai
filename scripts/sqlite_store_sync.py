#!/usr/bin/env python3
import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any


def text(value: Any) -> str:
    if value is None:
        return ""
    return clean_surrogates(str(value))


def dump(value: Any) -> str:
    return clean_surrogates(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def clean_surrogates(value: str) -> str:
    return value.encode("utf-8", "replace").decode("utf-8")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)
    return payload if isinstance(payload, dict) else {}


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
          full_json TEXT NOT NULL
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
        """
    )


def sync_store(conn: sqlite3.Connection, store: dict[str, Any]) -> dict[str, int]:
    init_schema(conn)
    counts = {
        "runs": 0,
        "articleCache": 0,
        "stockHistory": 0,
        "socialPosts": 0,
        "recommendationDecisions": 0,
        "recommendationOutcomes": 0,
        "factorStats": 0,
    }
    with conn:
        for run in store.get("runs") or []:
            if not isinstance(run, dict) or not run.get("id"):
                continue
            summary = run_summary(run)
            conn.execute(
                """
                INSERT INTO runs (
                  id, session, trigger, started_at, completed_at, summary_only,
                  news_count, social_posts_count, options_count, error_count,
                  summary_json, full_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                  full_json=excluded.full_json
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
                ),
            )
            counts["runs"] += 1

        article_cache = store.get("articleCache") or {}
        if isinstance(article_cache, dict):
            for key, row in article_cache.items():
                if not isinstance(row, dict):
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
        for run in store.get("runs") or []:
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
                conn.execute(
                    """
                    INSERT INTO recommendation_decisions(
                      id, run_id, ticker, action, status, generated_at, price,
                      action_score, alpha_score, data_quality_score, factor_snapshot_id, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        dump(row),
                    ),
                )
                counts["recommendationDecisions"] += 1

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
                conn.execute(
                    """
                    INSERT INTO recommendation_outcomes(
                      id, decision_id, ticker, action, horizon_days, evaluated_at,
                      outcome, excess_pct, mae_pct, mfe_pct, json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        dump(row),
                    ),
                )
                counts["recommendationOutcomes"] += 1

            for run in agent.get("runs") or []:
                if not isinstance(run, dict):
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
                            INSERT INTO factor_stats(id, run_id, factor_id, label, samples, rank_ic, avg_excess_pct, hit_rate, json)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id) DO UPDATE SET
                              run_id=excluded.run_id,
                              factor_id=excluded.factor_id,
                              label=excluded.label,
                              samples=excluded.samples,
                              rank_ic=excluded.rank_ic,
                              avg_excess_pct=excluded.avg_excess_pct,
                              hit_rate=excluded.hit_rate,
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
                                dump(row),
                            ),
                        )
                        counts["factorStats"] += 1

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
    args = parser.parse_args()
    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        if args.status:
            payload = {"status": "ok", "db": str(db_path), **status(conn)}
        else:
            store = load_json(Path(args.store_json))
            payload = {"status": "ok", "db": str(db_path), "synced": sync_store(conn, store), **status(conn)}
        print(json.dumps(payload, ensure_ascii=False))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
