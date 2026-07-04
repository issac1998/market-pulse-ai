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

## WP1 — Restore Sample Flow, Fix IV Accrual, Quarantine Bad Outcomes

### What Changed

- Restored frozen buy-decision logging to use the buy-eligible pool up to `skill.settings.buyLimit`; only the first `actionableBuyLimit` decisions remain actionable.
- Added cooldown suppression for re-logging (`ticker_cooldown`, `failed_thesis_cooldown`) while keeping `low_data_quality`, `dynamic_threshold`, and `earnings_blackout` as research downgrades.
- Split actionable vs downgraded buy rows in `/api/recommendations/today` and the all-stock Agent UI; paper-book opens only actionable buy decisions, while research-status buy decisions remain outcome-tracked.
- Added Node-side `summary.ivAtm`, `summary.ivAtmSource`, and `summary.ivAtmQuality` in options post-processing using nearest 7-45 DTE ATM contract, provider IV first, Black-Scholes implied IV fallback from mid price.
- Added append-only `outcomeQualityStatus` classification with `ok` / `suspect_price`, excluded non-`ok` rows from aggregates and learning inputs, and surfaced `excludedCount`.

### Files / Functions

- `server.mjs`: `runAllStockAgentForRun`, `allStockAgentDecisionLogSuppressed`, `allStockAgentDecisionOpensPaperPosition`, `buildTodayRecommendationsPayload`, `summarizeOptionAtmIv`, `summarizeOptionsChain`, outcome-quality wrappers.
- `lib/recommender_core.mjs`: `classifyOutcomeQuality`, `outcomeIsUsable`.
- `scripts/sqlite_store_sync.py`: `extract_atm_iv`, `outcome_quality_status`.
- `scripts/core_regression_tests.mjs`: outcome quarantine fixture including the GDC-style price-scale case.
- `public/app.js`: split actionable buy rows from downgraded tracked research rows.

### Verification Output

```text
$ node --check server.mjs
$ node --check public/app.js
$ node --check lib/recommender_core.mjs
$ node --check scripts/core_regression_tests.mjs
$ python3 -m py_compile scripts/sqlite_store_sync.py
all passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite
{"status":"ok","synced":{"runs":20,"recommendationOutcomes":19,"optionsSnapshots":15,"factorStats":60}}

$ sqlite3 data/market_pulse.sqlite "SELECT outcome_quality_status, COUNT(*) FROM recommendation_outcomes GROUP BY outcome_quality_status ORDER BY outcome_quality_status;"
ok|18
suspect_price|1

$ sqlite3 data/market_pulse.sqlite "SELECT ticker, horizon_days, entry_price, exit_price, outcome_quality_status FROM (SELECT json_extract(json,'$.entryPrice') AS entry_price, json_extract(json,'$.exitPrice') AS exit_price, * FROM recommendation_outcomes) WHERE ticker='GDC' ORDER BY horizon_days;"
GDC|1|0.0137|2.625|suspect_price

$ sqlite3 data/market_pulse.sqlite "SELECT COUNT(*) AS total, SUM(CASE WHEN iv_atm IS NOT NULL THEN 1 ELSE 0 END) AS non_null FROM options_snapshots;"
15|15

$ curl -sS -X POST http://localhost:5173/api/options/chain -H 'Content-Type: application/json' -d '{"ticker":"AAPL"}'
provider=Nasdaq Option Chain (stocks, OpenBB-style normalized)
contractCount=684
ivAtm=0.2498655943110643
summary.ivAtmSource=provider
summary.ivAtmQuality=ok

$ curl -sS http://localhost:5173/api/recommendations/today
actionable=0
research=13
actionableLimit=3
downgraded=3
trackRecord.sampleCount=18
trackRecord.excludedCount=1
```

### Contradictions / Blockers

- The WP1 live verification item "agent run with >3 buyEligible names logs >3 decisions with actionable flags" could not be completed in this session: `POST /api/all-stock-agent/run` remained open for more than 5 minutes while the server stayed responsive to other endpoints. I stopped only that verification request and did not substitute a mock result.
- Current `/api/recommendations/today` verifies the display split and `excludedCount`, but the latest stored run has zero actionable calls due to existing gates, so it does not prove a live `>3 buyEligible` distribution.
