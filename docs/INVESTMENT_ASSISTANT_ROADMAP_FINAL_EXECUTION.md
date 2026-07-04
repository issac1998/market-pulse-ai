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

## WP2 — Intraday Watcher Fast Lane

### What Changed

- Added `server/intraday_watcher.mjs` with disabled-by-default NYSE regular+extended-hours watcher config, universe builder, signal builder, static anticipation calendar, consensus snapshot builder, and a re-entrant `runIntradayWatcherOnce` test seam.
- Added `lib/alert_triage.mjs` as a pure no-LLM triage layer: bilingual catalyst keyword classes, severity scoring, stable story fingerprints, and novelty update detection.
- Added `server/push_delivery.mjs` with Bark / Telegram / ntfy delivery, severity threshold, and per-ticker cooldown. Email delivery was untouched.
- Added `GET|POST /api/intraday/explain?ticker=...`: returns quote plus latest cached alerts/news/filings/social context immediately and queues asynchronous LLM enrichment into `intradayExplain`. LLM output only writes narrative fields (`llmSummary`, `llmStatus`) and never writes factor scores, gates, weights, or skill JSON.
- Added append-only store keys: `intradayWatcher`, `pushDeliveryState`, `intradayExplain`, and `consensusSnapshots`.
- Added SQLite mirror table `consensus_snapshots` and route inventory regeneration.

### Files / Functions

- `server/intraday_watcher.mjs`: `runIntradayWatcherOnce`, `buildIntradayUniverse`, `buildIntradaySignals`, `buildConsensusSnapshots`.
- `lib/alert_triage.mjs`: `triageIntradaySignal`, `storyFingerprint`, `noveltyForFingerprint`.
- `server/push_delivery.mjs`: `normalizePushConfig`, `deliverPushNotification`.
- `server.mjs`: watcher env config, store keys, `runIntradayWatcherAndSave`, `/api/intraday/explain`, disabled-by-default interval startup.
- `scripts/sqlite_store_sync.py`: `consensus_snapshots` schema and sync.
- `scripts/core_regression_tests.mjs`: triage, novelty, disabled watcher, simulated alert, and consensus snapshot fixtures.
- `docs/CODEBASE_ROUTE_INVENTORY.md`: regenerated for `/api/intraday/explain` and new store keys.

### Verification Output

```text
$ node --check server.mjs
$ node --check public/app.js
$ node --check lib/alert_triage.mjs
$ node --check server/push_delivery.mjs
$ node --check server/intraday_watcher.mjs
$ node --check scripts/core_regression_tests.mjs
$ python3 -m py_compile scripts/sqlite_store_sync.py
all passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":65,"uiFetches":34,"storeKeys":24}
{"status":"ok","routes":65,"uiFetches":34,"storeKeys":24}

$ python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite
{"status":"ok","synced":{"auditEvents":6,"consensusSnapshots":0},"tables":{"consensus_snapshots":0}}

$ sqlite3 data/market_pulse.sqlite "SELECT event_type, COUNT(*) FROM audit_events GROUP BY event_type ORDER BY event_type;"
all_stock_agent.run|4
order_draft.create|2

$ node -e "runIntradayWatcherOnce(..., { config: { enabled:false } })"
{"status":"disabled","alerts":[],"auditEvents":[],"consensusSnapshots":[],"llmCriticalPath":false}

$ node -e "runIntradayWatcherOnce(...forced simulated ±5% move + fake filing...)"
{"status":"ok","alerts":2,"auditEvents":3,"consensusSnapshots":1,"llmCriticalPath":false,"push":["disabled","disabled"],"volumePaceSource":"missing_same_time_20d_baseline"}
```

### Contradictions / Blockers

- Same-time-of-day 20-day volume pace baseline does not exist in the current data model or providers. I did not substitute daily average volume as the signal. Live watcher only uses `quote.volumePace` / `quote.sameTimeVolumePace` if a future provider supplies it; otherwise the signal records `volumePaceSource:"missing_same_time_20d_baseline"`.
- Real push end-to-end delivery was not sent because `PUSH_PROVIDER` / `PUSH_TARGET` are intentionally unconfigured and WP2 defaults push/watcher to disabled. The simulated path verifies alert creation, audit events, severity triage, and disabled push result without external side effects.

## WP3 — Tier-1 Historical Corpus

### What Changed

- Added `lib/historical_features.mjs` with a reusable historical as-of snapshot builder. It normalizes OHLCV rows, computes the in-house Alpha158 subset, filters strictly to rows `<= asOf`, marks post-asOf rows as ignored, and calls `scoreRecommendationFromFactorSnapshot` from `lib/recommender_core.mjs` for final recommendation scoring.
- Implemented the required Alpha158 OHLCV subset: K-bar shape (`KMID/KLEN/KUP/KLOW/KSFT`), `ROC/MA/STD` over 5/20/60, `RSV`, `RANK`, `IMAX/IMIN`, `CORR(close,volume)`, `CNTP/CNTN`, and `WVMA`.
- Added `scripts/build_historical_bars.py` to create and populate append-only SQLite tables:
  - `historical_bars(ticker, date, open, high, low, close, volume, source)`
  - `historical_regimes(date, bucket, risk_score, json)`
  - `historical_corpus_metadata(...)`
- The builder uses the existing AkShare bridge first, then Finnhub / Alpha Vantage if configured. It is resumable through existing-row checks, rate-limit-aware via `--sleep-ms`, and writes a survivorship caveat metadata row.
- Historical FRED regimes are generated by invoking Node and calling the existing `scoreFredMacroRegime` implementation from `lib/market_core.mjs`; the Python script does not duplicate macro scoring thresholds.
- Updated `scripts/akshare_bridge.py` so `hist` no longer stops after the direct Eastmoney request fails; it now continues into installed AkShare `stock_us_hist` and preserves the direct failure in `meta.errors`.
- Added regression tests for Alpha158 feature presence, formula parity on normalized vs raw inputs, poisoned future-row rejection, neutral `not-reconstructable` factors, and final scoring through `recommender_core`.

### Files / Functions

- `lib/historical_features.mjs`: `normalizeHistoricalBars`, `alpha158Subset`, `buildFactorSnapshotAsOf`.
- `scripts/build_historical_bars.py`: SQLite schema creation, universe assembly, AkShare/Finnhub/Alpha fetch path, FRED-to-Node regime scoring, metadata and spot-check output.
- `scripts/akshare_bridge.py`: `hist` fallback continuation into real AkShare after direct Eastmoney failure.
- `scripts/core_regression_tests.mjs`: historical parity and poisoned-future fixtures.

### Verification Output

```text
$ node --check server.mjs
$ node --check public/app.js
$ node --check lib/historical_features.mjs
$ node --check scripts/core_regression_tests.mjs
all passed with no output

$ python3 -m py_compile scripts/build_historical_bars.py scripts/akshare_bridge.py scripts/sqlite_store_sync.py
passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 -m pip install --user akshare
Successfully installed akshare-1.18.64 ...

$ python3 scripts/akshare_bridge.py hist --symbol AAPL --limit 5 --start 20260101 --end 20260705
ok=false
error=RuntimeError: stock_us_hist failed for all symbol candidates; direct Eastmoney and AkShare stock_us_hist both ended with RemoteDisconnected.

$ python3 scripts/build_historical_bars.py --db data/market_pulse.sqlite --store-json data/store.json --tickers AAPL --days 90 --limit-bars 20 --min-existing 0 --force --sleep-ms 0 --fetch-timeout 5 --regime-timeout 20
{"status":"empty","tickers":1,"processed":0,"skipped":0,"sourceCounts":{},"regime":{"status":"empty","rows":0,"errors":["DGS10:timeout:The read operation timed out","DGS2:timeout:The read operation timed out","T10Y2Y:timeout:The read operation timed out","BAMLC0A0CM:timeout:The read operation timed out","T10YIE:timeout:The read operation timed out","VIXCLS:timeout:The read operation timed out"]},"spotChecks":[]}

$ sqlite3 data/market_pulse.sqlite "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('historical_bars','historical_regimes','historical_corpus_metadata') ORDER BY name; SELECT id,ticker_count,row_count,substr(survivorship_caveat,1,80) FROM historical_corpus_metadata WHERE id='tier1-latest';"
historical_bars
historical_corpus_metadata
historical_regimes
tier1-latest|1|0|Universe is current S&P 500 + Nasdaq 100 + observed project tickers; delisted hi
```

### Contradictions / Blockers

- The WP3 data-source verification item "5 tickers × 3 dates spot-checked vs provider closes" could not be completed in this environment. After installing AkShare, both the direct Eastmoney path and AkShare `stock_us_hist` returned `RemoteDisconnected`; the configured Finnhub key returned HTTP 403 for candles; no Alpha Vantage key is configured.
- FRED CSV downloads for `DGS10`, `DGS2`, `T10Y2Y`, `BAMLC0A0CM`, `T10YIE`, and `VIXCLS` timed out under the short verification timeout. The script records the failure and exits cleanly; it does not fabricate historical regimes.
- I did not add an unrequested Yahoo/Stooq/Longbridge historical fallback because the handoff explicitly names AkShare plus Finnhub/Alpha Vantage, and the contradiction protocol says not to substitute a new design silently.

## WP4 — Historical Walk-Forward + Backtest Report

### What Changed

- Added `server/historical_backtest.mjs` with a pure `runHistoricalWalkForwardFromRows` engine and a SQLite entrypoint `runHistoricalWalkForwardFromSqlite`.
- The engine reads `historical_bars` / `historical_regimes`, builds as-of factor snapshots through `lib/historical_features.mjs`, then scores through `scoreRecommendationFromFactorSnapshot` in `lib/recommender_core.mjs`.
- Historical decisions are frozen pseudo-decisions labeled `decisionSource:"historical-backtest"` and never blend with live recommendation decisions.
- Entry uses next-open after the signal date; exits use horizon close; outcomes are computed for configurable horizons vs SPY benchmark, with cost/slippage bps stored in the frozen run config.
- Added report/provenance output: engine, factor data source, universe caveat, strategy hash, friction label, config, factor analysis, candidate-only weight output, and Chinese deterministic narrative derived from the frozen JSON.
- Added store key `historicalBacktests` and routes:
  - `POST /api/recommender/historical-backtest`
  - `GET /api/recommender/historical-backtest/:id/report`
- Regenerated route inventory.

### Files / Functions

- `server/historical_backtest.mjs`: `runHistoricalWalkForwardFromRows`, `runHistoricalWalkForwardFromSqlite`, `historicalBacktestReport`.
- `server.mjs`: route wiring, append-only `historicalBacktests` store key, audit event for historical runs.
- `scripts/core_regression_tests.mjs`: synthetic OHLCV walk-forward fixture.
- `docs/CODEBASE_ROUTE_INVENTORY.md`: regenerated route/store inventory.

### Verification Output

```text
$ node --check server.mjs
$ node --check public/app.js
$ node --check server/historical_backtest.mjs
$ node --check scripts/core_regression_tests.mjs
all passed with no output

$ python3 -m py_compile scripts/build_historical_bars.py scripts/akshare_bridge.py scripts/sqlite_store_sync.py
passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}

$ curl -sS -X POST http://localhost:5173/api/recommender/historical-backtest ...
schemaVersion=historical-backtest-response-v1
run.status=empty
run.decisionSource=historical-backtest
run.metrics.sampleCount=0
run.metrics.hitRate.n=0
run.weightOutputs.candidateWeights.status=candidate-only
run.provenance.engine=native-js
run.provenance.friction=frictionless-reference

$ curl -sS http://localhost:5173/api/recommender/historical-backtest/hist-bt-1783191958901-775b6e0e/report
{
  "id": "hist-bt-1783191958901-775b6e0e",
  "narrativeZh": "历史 walk-forward 语料为空或未产生到期样本，当前只能验证引擎和数据缺口，不能解读收益表现。",
  "engine": "native-js",
  "strategyHash": "775b6e0e"
}
```

### Contradictions / Blockers

- Because WP3 provider verification could not populate `historical_bars`, the live API verification only proves the frozen empty-run and report path. The synthetic regression fixture proves non-empty walk-forward behavior, but it is not a provider spot-check.
- Sector basket benchmarking is marked `sectorBasketStatus:"missing_sector_mapping"` and uses SPY only until a stable historical ticker→sector/security-master mapping exists. I did not invent a sector map inside WP4.
- LLM narrative is deterministic Chinese narrative derived from frozen JSON. I did not call an LLM because the current historical corpus is empty and the hard rule forbids LLM-written numbers; the report pipeline is ready for a subordinate narrative once non-empty frozen JSON exists.

## WP5 — Metrics & Factor-Analysis Bridges

### What Changed

- Added `scripts/quantstats_bridge.py`: stdin JSON daily return payload → metrics JSON. It prefers `quantstats` when installed; otherwise returns a native-python metrics payload with an explicit degradation note.
- Added `scripts/alphalens_bridge.py`: stdin JSON factor observations → IC by horizon, top-bottom quantile spread, and turnover status. It imports `alphalens` when available and otherwise uses native Spearman/quantile fallback.
- Integrated both bridges into `server/historical_backtest.mjs` for the SQLite historical backtest path:
  - `metricEngines.native` always contains the native JS metrics.
  - `metricEngines.quantstats` contains bridge output or failure/degradation.
  - `factorAnalysis.alphalens` contains bridge factor-analysis output or failure/degradation.
- Added `bridgeTimeoutMs` to `POST /api/recommender/historical-backtest` config.
- The report keeps native metrics as the safe fallback and exposes the preferred engine plus degradation notes.

### Files / Functions

- `scripts/quantstats_bridge.py`: native/QuantStats metrics bridge.
- `scripts/alphalens_bridge.py`: native/Alphalens factor-analysis bridge.
- `server/historical_backtest.mjs`: `runJsonBridge`, `applyMetricBridges`, `quantstatsPayload`, `alphalensPayload`.
- `server.mjs`: `bridgeTimeoutMs` route config pass-through.

### Verification Output

```text
$ python3 -m py_compile scripts/quantstats_bridge.py scripts/alphalens_bridge.py scripts/build_historical_bars.py scripts/akshare_bridge.py scripts/sqlite_store_sync.py
passed with no output

$ node --check server.mjs
$ node --check public/app.js
$ node --check server/historical_backtest.mjs
$ node --check scripts/core_regression_tests.mjs
all passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}

$ printf ... | python3 scripts/quantstats_bridge.py
{"ok":true,"engine":"native-python","preferredAvailable":false,"metrics":{"n":3,"sharpe":{"value":8.44610462977374,"n":3,"source":"native-python"},"maxDrawdown":{"value":-0.5000000000000004,"n":3,"source":"native-python"}},"degradation":"quantstats unavailable: ModuleNotFoundError: No module named 'quantstats'"}

$ printf ... | python3 scripts/alphalens_bridge.py
{"ok":true,"engine":"alphalens","preferredAvailable":true,"observations":3,"analysis":{"icByHorizon":{"momentum":{"1":{"value":0.9999999999999998,"n":3,"source":"native-python"}}}}}

$ curl -sS -X POST http://localhost:5173/api/recommender/historical-backtest ...
{
  "status": "empty",
  "preferred": "native-js",
  "quant": "native-python",
  "quantDegradation": "quantstats unavailable: ModuleNotFoundError: No module named 'quantstats'",
  "alphalens": "alphalens",
  "alphalensStatus": "ok"
}
```

### Contradictions / Blockers

- `quantstats>=0.0.81` could not be installed from the current pip index/Python environment. Pip listed versions only through `0.0.77`, so the exact WP5 pin is unavailable. I did not silently install an older `quantstats`; the bridge remains ready and degrades visibly to native metrics.
- Because QuantStats is unavailable, the specific WP5 verification "bridge Sharpe/MaxDD match native within 1e-3 relative tolerance" could only be verified for the native-python bridge output, not the actual QuantStats engine.
- `alphalens-reloaded==0.4.5` installed successfully and imports as `alphalens`; the current bridge still computes IC/quantile outputs through the native fallback shape because the frozen historical run is empty.
