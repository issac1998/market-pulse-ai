# Investment Assistant Roadmap Final — Execution Checklist

Generated: 2026-07-03

## Implemented

- Added `scripts/generate_route_inventory.mjs` and generated `docs/CODEBASE_ROUTE_INVENTORY.md`.
- Added strategy version hashing for the all-stock Agent and stamped new decisions with `strategyVersion`, `strategyConfigHash`, `regime`, `regimeTag`, `actionability`, `evidenceRefs`, and LLM governance metadata.
- Extended all-stock Agent review horizons to `T+1/T+3/T+5/T+10/T+20/T+60`.
- Added anti-overtrading gates: max 3 actionable buys/day, DQ threshold, per-ticker cooldown, failed-thesis cooldown, earnings blackout, and exposure-adjusted threshold.
- Added audit event persistence for collection runs, all-stock Agent runs, config updates, paper portfolio acceptance, and order draft creation.
- Extended SQLite mirror schema and sync for:
  - `strategy_versions`
  - `news_items`
  - `data_quality_audits`
  - `options_snapshots`
  - `pit_universe_snapshots`
  - `audit_events`
  - `trade_recommendation_reconciliation`
  - `user_paper_acceptances`
  - slim run checksums and strategy/regime columns on existing recommendation tables.
- Added recommendation APIs:
  - `GET /api/recommendations/today`
  - `GET /api/recommendations/track-record`
  - `GET|POST /api/stocks/deep-dive`
  - `GET /api/trade-recommendation-reconciliation`
  - `GET /api/strategy-versions`
  - `GET|POST /api/strategy-versions/validate`
  - `GET /api/lessons/relevant`
  - `POST /api/paper-portfolio/accept`
  - `POST /api/order-drafts`
- Added stock deep-dive factor waterfall payload and value-chain `verified` vs `inferred` labeling.
- Added read-only chat tool context for market regime, recommendations, stock deep-dive, track record, trade journal, and lessons, capped at 4 tool results per turn.
- Surfaced strategy version, regime, anti-overtrading gates, DQ threshold, and downgraded research count in the all-stock Agent UI.

## Safety Status

- LLM output remains unable to write factor scores, hard gates, or factor weights.
- Strategy weight validation endpoint is read-only and returns `shadow_only` until sample gates are met.
- Order drafts are blocked unless both `IBKR_TRADING_ENABLED=true` and `data/ALLOW_LIVE_TRADING` exist; no broker order submission was added.
- `store.json` remains the operational export/read path; SQLite dual-write now has the additional roadmap tables and checksums required before any future reader switch.

## Verification Run

- `node --check server.mjs`
- `node --check public/app.js`
- `node --check scripts/generate_route_inventory.mjs`
- `python3 -m py_compile scripts/sqlite_store_sync.py`
- `node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check`
- `python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite`
- `node scripts/core_regression_tests.mjs`
- `python3 -m unittest harness.tests.test_harness`
- Runtime API checks:
  - `/api/recommendations/today`
  - `/api/recommendations/track-record?horizon=20`
  - `/api/stocks/deep-dive?ticker=NVDA`
  - `/api/chat` with local provider and read-only tool results
  - `/api/all-stock-agent/run`
  - `/api/strategy-versions`
  - `/api/strategy-versions/validate`
  - `/api/order-drafts`
  - `/api/trade-recommendation-reconciliation`

## Known Calendar-Gated Items

- `T+20/T+60` outcome quality requires calendar time to accrue.
- Validation-gated factor adoption requires enough completed samples; current validation correctly remains shadow-only when sample gates are not met.
- IV rank/percentile needs months of `options_snapshots` accrual before it should be promoted into stronger scoring.
