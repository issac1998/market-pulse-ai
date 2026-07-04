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

## WP6 — edgartools Integration

### What Changed

- Installed `edgartools==4.6.3`; pinned `hishel==0.1.5` after discovering `hishel 1.1.8` removed the `FileStorage` API used by edgartools.
- Added `scripts/edgar_pit_bridge.py` with commands:
  - `init-schema`
  - `pit-fundamentals`
  - `current-filings`
  - `13f`
- Added append-only SQLite tables:
  - `pit_fundamentals`
  - `institutional_holdings`
  - `edgar_current_filings`
- `pit-fundamentals` extracts XBRL facts through `filing.xbrl().query().by_concept(...).to_dataframe()` and stores revenue, net income, diluted EPS, gross profit, assets, liabilities, equity, and operating cash flow by filing date.
- Extended `buildFactorSnapshotAsOf` so PIT facts filed `<= asOf` activate Tier-2 `qualityGrowth` and `valuationExpectation`; later restatements do not overwrite earlier as-of values.
- Extended `server/historical_backtest.mjs` to read `pit_fundamentals` from SQLite and pass them to the historical snapshot builder.
- Added disabled-by-default EDGAR current-filings seam to `server/intraday_watcher.mjs`; `EDGAR_WATCHER_ENABLED=false` by default, and the watcher only calls a collector when explicitly enabled.
- Added `EDGAR_WATCHER_ENABLED` / `EDGAR_WATCHER_LIMIT` to the config center.

### Files / Functions

- `scripts/edgar_pit_bridge.py`: EDGAR schema, PIT facts, current filings, 13F filing-level bridge.
- `lib/historical_features.mjs`: PIT as-of fact filtering, `qualityGrowthFromPit`, `valuationFromPit`.
- `server/historical_backtest.mjs`: SQLite `pit_fundamentals` read path and diagnostics.
- `server/intraday_watcher.mjs`: disabled EDGAR filing watcher seam.
- `server.mjs`: config fields for EDGAR watcher.
- `scripts/core_regression_tests.mjs`: PIT restatement fixture and EDGAR watcher fixture.

### Verification Output

```text
$ python3 -m pip install --user edgartools
Successfully installed edgartools-4.6.3 ...

$ python3 -m pip install --user 'hishel==0.1.5'
Successfully installed anysqlite-0.0.5 hishel-0.1.5

$ python3 scripts/edgar_pit_bridge.py init-schema --db data/market_pulse.sqlite
{"ok": true, "command": "init-schema", "db": "data/market_pulse.sqlite"}

$ python3 scripts/edgar_pit_bridge.py current-filings --db data/market_pulse.sqlite --tickers AAPL --limit 1 --output-limit 1
{"ok": true, "command": "current-filings", "rows": 1, "filings": [{"id": "AAPL:0000320193-26-000013", "ticker": "AAPL", "cik": "320193", "form": "10-Q", "filed_at": "2026-05-01", "severity": "high"}]}

$ python3 scripts/edgar_pit_bridge.py pit-fundamentals --db data/market_pulse.sqlite --ticker AAPL --limit 1
{"ok": true, "command": "pit-fundamentals", "ticker": "AAPL", "rows": 8, "fields": ["assets", "eps_diluted", "equity", "gross_profit", "liabilities", "net_income", "operating_cash_flow", "revenue"]}

$ python3 scripts/edgar_pit_bridge.py 13f --db data/market_pulse.sqlite --limit 1
{"ok": true, "command": "13f", "rows": 1, "status": "filing-level-only"}

$ node --check server.mjs
$ node --check public/app.js
$ node --check lib/historical_features.mjs
$ node --check server/historical_backtest.mjs
$ node --check server/intraday_watcher.mjs
$ node --check scripts/core_regression_tests.mjs
all passed with no output

$ python3 -m py_compile scripts/edgar_pit_bridge.py scripts/quantstats_bridge.py scripts/alphalens_bridge.py scripts/build_historical_bars.py scripts/akshare_bridge.py scripts/sqlite_store_sync.py
passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
```

### Contradictions / Blockers

- The WP6 "known restated quarter" proof was implemented as a deterministic fixture: a later filed value is ignored for an earlier `asOf`. I did not identify and verify a real SEC restatement sample in this session.
- The 13F command currently persists filing-level rows with `status:"filing-level-only"`; it does not yet expand each 13F information table into per-holding shares/value rows. This is recorded explicitly in the bridge output and table JSON.
- The live watcher has an EDGAR current-filings seam, but no production collector is passed from `server.mjs` yet; it remains disabled by default and test-covered with an injected collector.

## WP7 — Factor Quality Pack

### What Changed

- Added winsorization utilities in `lib/recommender_core.mjs`:
  - `winsorizeSeries`
  - `winsorizeFactorSnapshots`
- Historical backtest factor stats now winsorize outcome returns at 1/99 percentiles and persist per-factor winsorization audit fields.
- Historical factor analysis now emits a real cross-factor Spearman correlation matrix instead of identity/null placeholders.
- Enhanced PIT-driven `qualityGrowth` raw inputs with earnings-quality fields:
  - accruals ratio
  - cash conversion
  - partial Piotroski score
  - approximate Altman Z
  - dilution trend placeholder from diluted share count
- Extended EDGAR PIT extraction to include diluted shares.
- Earnings blackout gate is now pre-earnings only; post-earnings periods are no longer buy-downgrade gates, enabling PEAD-style entries.
- Added SQLite accrual tables and sync:
  - `sue_history`
  - `short_interest_history`
  - `analyst_revision_history`
- Consensus snapshots sync into `sue_history`; research packs with short-interest or revision counts sync into their accrual tables without fabricating missing values.

### Files / Functions

- `lib/recommender_core.mjs`: `winsorizeSeries`, `winsorizeFactorSnapshots`.
- `server/historical_backtest.mjs`: winsorized factor stats and cross-factor correlation matrix.
- `lib/historical_features.mjs`: accruals, cash conversion, Piotroski partial, Altman Z approximate, dilution trend.
- `scripts/edgar_pit_bridge.py`: diluted shares XBRL concept extraction.
- `scripts/sqlite_store_sync.py`: SUE/short-interest/analyst-revision accrual tables and sync.
- `server.mjs`: pre-only earnings blackout gate.
- `scripts/core_regression_tests.mjs`: winsorization, correlation matrix, PIT quality fixtures.

### Verification Output

```text
$ node --check lib/recommender_core.mjs
$ node --check lib/historical_features.mjs
$ node --check server/historical_backtest.mjs
$ node --check server.mjs
$ node --check scripts/core_regression_tests.mjs
all passed with no output

$ python3 -m py_compile scripts/sqlite_store_sync.py scripts/edgar_pit_bridge.py scripts/quantstats_bridge.py scripts/alphalens_bridge.py
passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite --status
{"status":"ok","tables":{"sue_history":0,"short_interest_history":0,"analyst_revision_history":0,...}}

$ python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite
{"status":"ok","synced":{"sueHistory":0,"shortInterestHistory":0,"analystRevisionHistory":0,...}}

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
{"status":"ok","routes":67,"uiFetches":34,"storeKeys":25}
```

### Contradictions / Blockers

- The new SUE/short-interest/revision accrual tables are wired, but current `store.json` has no `consensusSnapshots` and no research-pack fields matching short-interest/revision counts, so verification row counts are 0.
- Piotroski F and Altman Z are partial/approximate because Tier-2 PIT fundamentals currently only extract core facts; full ratio fidelity requires more XBRL concepts and period-over-period balance-sheet history.
- The correlation matrix is computed for historical backtest outcomes; live track-record frontend rendering remains part of WP9.

## WP8 — Phase-2 Machinery on Historical Evidence

### What Changed

- Added a strategy-version governance module that keeps learned factor weights in `candidate` versions until a human promote call succeeds.
- Removed the in-run auto-application path for `learnedWeights`; live scoring now reads active weights from the active strategy version, with legacy factor weights only as fallback.
- Live all-stock-agent runs and historical backtests now write mechanical learning outputs as candidate strategy versions rather than active weights.
- Added validation/promote/rollback workflow:
  - `POST /api/strategy-versions/validate` appends a validation record to a candidate.
  - `POST /api/strategy-versions/promote` requires a stored passed validation record.
  - `POST /api/strategy-versions/rollback` restores the pre-promotion strategy-version snapshot.
- Added regime-split and live-parity payloads:
  - `GET /api/recommender/regime-split`
  - `GET /api/recommender/live-parity`
  - both are also attached to recommendation track-record payloads.
- Added disabled-by-default daily shadow debate scheduling behind `AGENT_DEBATE_DAILY_ENABLED=false`.
- Added `GET /api/agent-debate/shadow-daily` status endpoint. Shadow debate records are narrative/shadow-gate only and do not write factor scores, weights, hard gates, or skill JSON.

### Files / Functions

- `server/strategy_versions.mjs`: strategy version normalization, candidate creation, validation records, promote, rollback, regime-split payload, live-parity payload.
- `server.mjs`: active strategy weight routing, candidate write path, strategy version APIs, regime/parity APIs, shadow debate status/scheduler.
- `scripts/core_regression_tests.mjs`: candidate workflow, promote validation gate, rollback fixture, regime split, live parity.
- `docs/CODEBASE_ROUTE_INVENTORY.md`: regenerated route inventory.

### Verification Output

```text
$ node --check server.mjs
$ node --check server/strategy_versions.mjs
$ node --check scripts/core_regression_tests.mjs
$ node --check public/app.js
all passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":72,"uiFetches":34,"storeKeys":25}
{"status":"ok","routes":72,"uiFetches":34,"storeKeys":25}

$ curl -sS http://127.0.0.1:5173/api/strategy-versions
count=2
active=all-stock-e07073aab308
candidates=0
rollbackAvailable=false

$ curl -sS http://127.0.0.1:5173/api/strategy-versions/validate
schema=strategy-validation-v1
active=all-stock-e07073aab308
candidates=0
rule="候选权重只在 walk-forward 同时不弱于 active 的超额收益与 MaxDD 后才可人工采纳；validate 只写 validationRecords，promote 才能切 active。"

$ curl -sS -X POST http://127.0.0.1:5173/api/strategy-versions/promote -H 'Content-Type: application/json' -d '{"id":"missing-candidate"}'
HTTP 404
{"error":"未找到可提升的 candidate strategy version。"}

$ curl -sS -X POST http://127.0.0.1:5173/api/strategy-versions/rollback
HTTP 404
{"error":"没有可用的 strategy version rollback 快照。"}

$ curl -sS http://127.0.0.1:5173/api/recommender/regime-split
schema=regime-split-evaluation-v1
live.n=18
historical.n=0
live.rows=1
historical.rows=0

$ curl -sS http://127.0.0.1:5173/api/recommender/live-parity
schema=live-parity-dashboard-v1
live.n=90
historical.n=0
live.decisionRates.buyRate.n=154
historical.decisionRates.buyRate.n=0

$ curl -sS http://127.0.0.1:5173/api/agent-debate/shadow-daily
enabled=false
topN=5
invoker=codex-cli
due=false
latest=false

$ curl -sS http://127.0.0.1:5173/api/recommendations/track-record
sampleCount=18
excludedCount=1
regimeSplit.panels.live.n=18
liveParity.panels.live.n=90
```

### Contradictions / Blockers

- Current production `store.json` has no candidate strategy version after prior runs, so runtime promote/rollback cannot be exercised without mutating production state or running a new learning-producing agent run. The promote/rollback behavior is covered by deterministic regression fixtures instead.
- Historical panel sample counts are currently 0 because the stored historical backtest corpus has no completed outcomes in the current environment. The payload keeps live and historical panels separate and exposes `n=0` rather than blending sources.
- `ALL_STOCK_AGENT_APPLY_LEARNED_WEIGHTS=true` is now intentionally ignored for active writes; the factor-weight state records `env_ignored_candidate_workflow_required` if that env is present, because WP8 requires candidate-only learning until promote.

## WP9 — Frontend Surfaces for the Daily Loop

### What Changed

- Added a Today Desk panel on the Action page that consumes `/api/recommendations/today`:
  - freshness / regime / editorial summary
  - ≤3 actionable calls
  - collapsed research-tracking list with downgrade chips
  - track-record strip with `excludedCount`
  - visible health / missing-data section
  - paper-accept button wired to `/api/paper-portfolio/accept`
- Added a stock Deep Dive evidence panel on the Stocks page that consumes `/api/stocks/deep-dive`:
  - factor waterfall with score, weight, contribution, source
  - expandable-style data quality block with weakest/missing blocks
  - value-chain / peers / upstream / downstream chips with source/quality labels
  - news timeline, decision history, and invalidation list
- Added a Reconciliation panel on the Portfolio page that consumes `/api/trade-recommendation-reconciliation`.
- Added a Strategy Governance panel on the Ops page that consumes `/api/strategy-versions` and `/api/strategy-versions/validate`:
  - active/candidate/legacy-active version list
  - validation record metrics with `n`
  - promote button requiring typed confirmation
  - rollback button requiring typed `ROLLBACK`
- Regenerated route inventory for the added frontend API calls.

### Files / Functions

- `public/index.html`: new Today Desk, Deep Dive, Reconciliation, and Strategy Governance containers.
- `public/app.js`: supplemental API loading, Today Desk renderer, Deep Dive renderer, Reconciliation renderer, Strategy Governance renderer, paper accept and strategy promote/rollback handlers.
- `public/styles.css`: responsive card/grid styles for the new panels.
- `docs/CODEBASE_ROUTE_INVENTORY.md`: regenerated frontend API call inventory.

### Verification Output

```text
$ node --check public/app.js
$ node --check server.mjs
$ node --check server/strategy_versions.mjs
all passed with no output

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":72,"uiFetches":42,"storeKeys":25}
{"status":"ok","routes":72,"uiFetches":42,"storeKeys":25}

Browser verification on http://localhost:5173:
actions page:
bodyPage=actions
today desk rendered agentRunId=1783189346161-all-stock-agent
visiblePanels=2
consoleErrors=[]

stock page:
url=http://localhost:5173/#/stock/NVDA
bodyPage=stocks
deep dive rendered "NVDA Evidence Pack"
factor count=10
DQ score=71
invalidations=4

portfolio page:
bodyPage=portfolio
reconciliation summary trades=0 aligned=0 contrarian=0 uncovered=0

ops page:
bodyPage=ops
strategy versions=2
active=all-stock-e07073aab308
legacy active row is labeled legacy-active after hard reload
consoleErrors=[]
```

### Contradictions / Blockers

- Current store has no strategy candidate and no user trades, so the UI shows empty candidate/reconciliation states. The panels render correctly and expose why no action is available.
- The store contains two legacy `status:"active"` strategy rows. Backend effective active selection is singular; the WP9 UI labels the non-effective active row as `legacy-active` instead of mutating historical strategy records.

## Final Summary — WP1 to WP9

### Completed WPs

- WP1: restored frozen sample flow, IV ATM accrual, and outcome quarantine.
- WP2: added disabled-by-default intraday watcher, triage, push seam, explain endpoint, novelty, and consensus snapshots.
- WP3: added historical corpus builder and Alpha158-style historical feature reconstruction.
- WP4: added historical walk-forward backtest and report API.
- WP5: added QuantStats / Alphalens bridge fallbacks.
- WP6: added EDGAR PIT bridge and watcher seam.
- WP7: added factor-quality pack, winsorization, correlation matrix, and accrual tables.
- WP8: added candidate strategy-version governance, validation/promote/rollback, regime split, live parity, and disabled shadow debate scheduler.
- WP9: added daily-loop frontend surfaces for Today, Deep Dive, Reconciliation, and Strategy Governance.

### Open Contradictions

- Historical corpus providers were unavailable in the current environment for live bulk corpus population; fixtures verify logic, but real historical sample counts remain limited until providers return.
- Historical panel sample counts are currently 0 in the latest stored backtest state.
- Current production store has no candidate strategy version, so runtime promote/rollback success cannot be demonstrated without producing a real candidate or mutating production state.
- Current store has no user trades, so reconciliation shows the correct empty state.
- EDGAR 13F bridge is filing-level-only; per-holding expansion remains a future data upgrade.
- SUE / short-interest / analyst revision accrual tables are wired but have no live rows in the current store.
- The store has legacy duplicate active strategy rows; UI marks the non-effective row as `legacy-active` without rewriting history.

### Disabled-By-Default Flags

- `INTRADAY_WATCHER_ENABLED=false`
- push provider config (`PUSH_PROVIDER`, `PUSH_TARGET`, provider-specific tokens) remains unset/disabled.
- `AGENT_DEBATE_DAILY_ENABLED=false`
- EDGAR watcher seam is disabled unless `EDGAR_WATCHER_ENABLED=true` and a production collector is supplied.

### Human-Only / Owner Actions

- Strategy-version promote is human-only by design and requires a stored passed validation record.
- Live trading remains locked behind existing `IBKR_TRADING_ENABLED` plus `data/ALLOW_LIVE_TRADING`; no broker order-submission path was added.
- To exercise successful promote/rollback in production, first run a learning-producing agent/backtest to create a candidate, then attach/persist a passed walk-forward validation record.

---

## External Review (Claude) — 2026-07-05

Reviewed all nine commits (`b916737`..`92d1ad6`) by code reading plus live verification on `localhost:5173`. **Verdict: 8 of 9 WPs pass; WP3 conditional-pass on an environmental blocker whose root cause this review identified (see below). No ground-rule violations found** — LLM write-boundary intact, all scoring through `lib/recommender_core.mjs`, frozen records untouched, sample counts everywhere, order double-lock verified still blocking, schemas append-only.

| WP | Verdict | Review evidence |
|---|---|---|
| WP1 | ✅ pass | Code: pool = buyEligible minus cooldown-suppressed, ≤10 tracked, top-3 actionable with `actionable_daily_cap` gate labeling. Live: GDC outcome tagged `suspect_price`; track record 18 ok + 1 excluded; **T+1 avg excess now +0.71% vs the poisoned +1003.8%**; `options_snapshots` 15/15 non-null iv_atm (AAPL ATM IV 0.2499, source=provider). The ">3 tracked decisions" live demo remains blocked by market state, not code: a fresh 166s agent run produced 0 buyEligible because every top scorer is either a held position (TSM/SNDK/GLW/META/MRVL — no-add-to-existing rule; shadow debate penalties working, e.g. META 89→63) or stale-data vetoed (collection run is 2026-06-30). Will self-verify on the next fresh trading-day run. |
| WP2 | ✅ pass | No `llm` references in watcher/triage/push beyond `llmCriticalPath:false` flags; explain endpoint writes only `llmSummary/llmStatus`; volume-pace honestly `missing_same_time_20d_baseline`; disabled by default. Push end-to-end untested (no provider configured — owner action). |
| WP3 | ⚠️ conditional | Code correct (asOf filtering, Alpha158 subset parity fixtures, resumable builder). Corpus empty for an **environmental reason this review diagnosed**: `akshare_bridge.py` strips proxy env by default (`AKSHARE_KEEP_PROXY` unset) while this network reaches EastMoney/FRED only through the `.env` proxy; Finnhub 403 = free-tier candle limitation. Deeper diagnosis (post-review): EastMoney is unreachable from this network even unsandboxed and proxied; all three D5 sources are dead here. **D5 amended (see CAPABILITY_GAPS §9): Longbridge CLI `kline` becomes the primary bar source** — verified live returning 1,000 daily bars (AAPL back to 2022-07) — with IBKR `history_payload` secondary. **Follow-up F1 (expanded, final)**: (a) add Longbridge + IBKR fetchers to `build_historical_bars.py` as primary/secondary bar sources; keep AkShare/Finnhub/AV tertiary with `.env` proxies loaded; (b) **fetch FRED via a Node one-shot (or `curl` subprocess), not Python urllib** — verified: FRED silently drops Python's TLS handshake (urllib times out direct *and* proxied) while Node fetch returns the full DGS10 CSV (267 KB, history to 1962) and curl returns 200; the script already spawns Node for `scoreFredMacroRegime`, so route the CSV download through the same process. |
| WP4 | ✅ pass | Engine verified lookahead-free (bars ≤ signalDate; entry next bar open; round-trip costs); pseudo-decisions labeled `historical-backtest`, separate tables; provenance complete; sector-basket gap honestly labeled. Real-corpus run pending WP3 data. |
| WP5 | ✅ pass | Bridges degrade visibly, never block. quantstats unavailable because the pip index reachable *without proxy* caps at 0.0.77 — same proxy root cause; retry install with proxy env (**F2**). alphalens-reloaded installed and functioning. |
| WP6 | ✅ pass | Real PIT rows live (AAPL 10-Q filed 2026-05-01, revenue 111.184B), current-filings row present, restatement property fixture-proven. **F3**: 13F per-holding expansion (currently filing-level). **F4**: wire production EDGAR collector into the watcher seam. **F5**: verify one real-world restated quarter once more history is ingested. |
| WP7 | ✅ pass | Winsorization + Spearman matrix in engine; earnings blackout verified signed/pre-only (`daysUntil`); accrual tables wired (0 rows until consensus snapshots/data flow — by design, no fabrication). |
| WP8 | ✅ pass | `activeFactorWeights = currentFactorWeights` (from active strategy version); `ALL_STOCK_AGENT_APPLY_LEARNED_WEIGHTS` explicitly ignored with `env_ignored_candidate_workflow_required`; promote requires a `passed` validation record (verified in `strategy_versions.mjs`); rollback restores stacked snapshot; regime-split/live-parity live with labeled sources + n. **F6**: retire the legacy duplicate `active` row via an append-only retire event. |
| WP9 | ✅ pass | All four containers live (`todayDeskBox`, `stockDeepDiveBox`, `recommendationReconciliationBox`, `strategyGovernanceBox`); route inventory consistent (72 routes / 42 UI fetches); regression suite green under review re-run. |

**Owner actions to activate shipped-but-dormant capability**: enable `INTRADAY_WATCHER_ENABLED` + configure `PUSH_PROVIDER`/`PUSH_TARGET`; enable `AGENT_DEBATE_DAILY_ENABLED` (starts the Phase-3.1 evidence clock per D14); install quantstats through the proxy; commit the two outstanding doc edits (README.md, ROADMAP_FINAL amendment).

### Data-verification session (Claude, 2026-07-05, post-review)

Corpus populated via the D5-amended recipe (review-side scratchpad scripts; Codex's F1 replaces them in-repo):

- **`historical_bars`: 40,172 rows, 45 tickers (44 universe + SPY), 2019-11-18 → 2026-07-02** via Longbridge CLI `--format json` (values arrive as strings — F1 implementation note).
- **`historical_regimes`: 1,648 dates** via curl-downloaded FRED CSVs fed into the script's own `compute_regimes_with_node`; buckets: 宏观中性 1327 / 宏观谨慎 261 / 宏观顺风 54 / 宏观风险收缩 6.
- **WP3 gate CLOSED**: cross-provider spot-check vs June live quotes (IBKR/Finnhub-sourced): 58/64 (ticker,day) pairs within 1%; the 6 outliers are capture-timing semantics (live quotes snapshotted mid-session at 15:18Z, incl. TSLA on a volatile day), not bad data.
- **WP4 core gate CLOSED**: full pre-registered run (top-10, T+20 primary, 5+10 bps, 1,000 signal dates) completed server-side: 4,374 pseudo-decisions, 25,314 outcomes. Independent recomputation: **0 lookahead violations, 0 label violations; engine T+20 hit rate 0.49520 vs independently recomputed 0.495 — match.**
- **First real factor evidence** (all under the survivorship caveat — the 44-ticker universe was selected in 2026, so *levels* are inflated; *structure* is the usable part): avg excess vs SPY rises monotonically with horizon — T+1 −0.00%, T+3 +0.61%, T+5 +1.25%, T+10 +1.66%, **T+20 +2.10%, T+60 +5.44%**; hit(>+0.5%) 37.0% → 55.7%. Pooled rankIC (n=25,179): momentum **−0.042** (short-horizon reversal — supports the two-sleeve split), liquidity proxy +0.139, macroRegime ≈0, non-reconstructable factors honestly null.

**New follow-ups from this session (F7–F11, all in `server/historical_backtest.mjs` metrics/report assembly — the engine core is sound):**

- **F7 (serialization)**: runs >~500 dates kill the HTTP response (1,000-date run: HTTP 000 at 137s; 2-year segment: truncated at 1.57 MB despite HTTP 200; report endpoint returns an empty body for the big run). Runs DO persist server-side. Fix: persist decisions/outcomes to SQLite tables, return compact summaries, paginate detail reads.
- **F8 (headline metrics null)**: `avgExcessPct`, `totalReturnPct`, `excessReturnPct` are null while per-horizon data exists — assembly incomplete.
- **F9 (MaxDD broken)**: `maxDrawdown = −100%` (duration 4094, recovered:false) — equity-curve construction is wrong (portfolio did not go to zero); Sharpe (0.147) and CAGR (4.7%) are untrustworthy until the daily book is rebuilt correctly.
- **F10 (weight windows empty)**: `candidateWeights.status="candidate-only"` with **0 windows** despite 4,166 completed primary-horizon samples ≥ minSamples — the windowed learner never ran; the §7.1 weight deliverable is not yet produced.
- **F11 (stub analytics)**: `icDecay` returns `pending-more-horizons`/null despite 6 horizons of outcomes; `regimeSplit` rows = 0 in the run payload despite populated `historical_regimes`.

**Deferred-gate status after this session**: WP3 ✅ closed; WP4 core ✅ closed, WP4 *report deliverable* ❌ blocked on F8–F10; WP5 tolerance still pending quantstats install; WP6 real-restatement and WP8 successful-promote unchanged.

### Data-verification addendum — segment B + regime evidence + WP5 closure (Claude, 2026-07-05)

- **Segment B run** (2024-07-01 → 2026-07-02, same pre-registered config, executed via direct Node `runHistoricalWalkForwardFromSqlite` — validating the F7 workaround): 4,430 pseudo-decisions, 25,649 outcomes, **0 lookahead / 0 label violations; engine T+20 hit 0.5714 vs independent recomputation 0.572 — second match**. Avg excess vs SPY: T+1 +0.13%, T+5 +1.73%, T+10 +3.79%, **T+20 +8.49% (hit 0.572), T+60 +24.99% (hit 0.614)**. Same survivorship caveat, amplified: Seg B's universe is the 2026 watchlist's AI-era winners — treat levels as ceiling, structure as signal.
- **First regime-dependence evidence (the corpus's headline insight)**: momentum rankIC **−0.042** in Seg A (2022-24, n=25,179) vs **+0.049** in Seg B (2024-26, n=25,649). One momentum weight cannot serve both eras — direct empirical support for regime-split evaluation (§10 D11) and the two-sleeve split (§3.1).
- **F10 nuance**: pooled candidate weights ARE produced per run (capped ≤1% steps, `candidate-only`, e.g. momentum 0.18→0.1785 in Seg A vs 0.18→0.1806 in Seg B — the two segments push opposite directions, consistent with the IC flip); what's missing is only the per-window trajectory. Reference (rankIC-proportional) weights are degenerate (≈96% liquidity-proxy) until WP6 makes more factors reconstructable — labeled, not misleading.
- **WP5 gate closed with an amendment (F12)**: system Python is 3.9.6 → quantstats ≥0.0.81 uninstallable (needs ≥3.10), and 0.0.77 is runtime-incompatible with the installed pandas (`int − Timedelta` in `qs.stats`). The bridge degrades **visibly and correctly** to native-python, whose Sharpe/MaxDD match an independent recomputation to 1e-15 on a 120-day fixture. **F12 for Codex: give the bridges a Python ≥3.10 venv (e.g. `.venv-bridges`, `BRIDGE_PYTHON` env) with quantstats≥0.0.81 + pandas≥2.2.2; until then the native engine is the metrics source and reports say so (D10).**
- Bar-source implementation note for F1: Longbridge `--format json` returns OHLCV values as **strings** — coerce to float before insert.

### Codex Follow-Up F1 / F7-F12 Execution — 2026-07-05

Implemented the remaining historical-calibration polish items from the execution log.

- **F1 Longbridge / IBKR fetchers**: `scripts/build_historical_bars.py` now tries `longbridge:kline` first, `ibkr:socket-historical` second, then AkShare / Finnhub / Alpha Vantage. Longbridge JSON OHLCV strings are coerced through the shared `number()` path before insert. Longbridge `history` failures and count-limit failures are recorded in provider errors and the fetcher progressively falls back through safe `--count` sizes. FRED CSV download now uses a Node `fetch` one-shot with curl fallback instead of Python urllib.
- **F7 SQLite persistence + pagination**: historical backtest runs now persist summary, decisions, outcomes, and daily rows into append-only SQLite tables (`historical_backtest_runs`, `historical_backtest_decisions`, `historical_backtest_outcomes`, `historical_backtest_daily`). The POST API returns compact samples plus `detailCounts` and pagination endpoints. New details API: `GET /api/recommender/historical-backtest/:id/details?kind=outcomes|decisions|daily&page=1&pageSize=100`.
- **F8 headline metrics**: run metrics now include `avgExcessPct`, `totalReturnPct`, `excessReturnPct`, `avgBenchmarkReturnPct`, `benchmarkTotalReturnPct`, and `portfolioDailyExcessPct`, each with sample count.
- **F9 equity curve / MaxDD fix**: MaxDD, Sharpe, Sortino, CAGR, Calmar, and volatility now use the daily portfolio-average return series instead of compounding overlapping individual outcome samples. Returns at or below -100% are guarded and counted in `maxDrawdown.guardedReturnCount`.
- **F10 per-window weight trajectory**: `weightOutputs.trajectory.windows` now records rolling candidate weights, factor rankIC, window dates, status, and sample counts. Pooled learned weights remain `candidate-only`.
- **F11 icDecay / regimeSplit**: `factorAnalysis.icDecay` now computes horizon-by-horizon rankIC curves per factor. `factorAnalysis.regimeSplit` now groups usable outcomes by macro-regime bucket with `n`, average excess, hit rate, and horizons.
- **F12 Python bridge venv**: created `.venv-bridges` with Python 3.12.13, `quantstats==0.0.81`, `pandas==2.3.3`, `numpy==2.5.1`; `.gitignore` excludes it. `server/historical_backtest.mjs` now prefers `BRIDGE_PYTHON`, then `.venv-bridges/bin/python`, before falling back. `scripts/quantstats_bridge.py` now supplies a DatetimeIndex to QuantStats, fixing the pandas `int - Timedelta` failure.

Verification:

```text
$ python3 scripts/build_historical_bars.py --db /tmp/mp_hist_test.sqlite --tickers AAPL --days 10 --provider-order longbridge --skip-regimes --force --fetch-timeout 30 --sleep-ms 0 --min-existing 0
{"ticker":"AAPL","rows":19,"insertedOrReplaced":19,"source":"longbridge:kline"}

$ python3 - <<'PY'  # FRED Node/curl path
fred_csv("DGS10", 30) -> rows=16109, last={"date":"2026-07-01","value":4.48}
PY

$ printf ... | .venv-bridges/bin/python scripts/quantstats_bridge.py
{"ok":true,"engine":"quantstats","preferredAvailable":true,...}

$ BRIDGE_PYTHON=.venv-bridges/bin/python node --input-type=module - <<'NODE'
runHistoricalWalkForwardFromSqlite(... compactResponse:true) -> detailCounts={decisions:10,outcomes:18,daily:5}, quantPreferred=quantstats, weightWindows=1, icDecayKeys=10, regimeSplitRows=1
historicalBacktestDetailsFromSqlite(... kind:"outcomes") -> total=18, rows=3
NODE

$ curl -sS -X POST http://localhost:5173/api/recommender/historical-backtest ...
detailCounts={decisions:3,outcomes:4,daily:3}, returned={decisions:1,outcomes:1}, quant=quantstats

$ curl -sS http://localhost:5173/api/recommender/historical-backtest/<id>/details?kind=outcomes&page=1&pageSize=2
{"kind":"outcomes","total":4,"rows":2,"first":"AMD"}

$ node --check server.mjs && node --check server/historical_backtest.mjs && node --check scripts/generate_route_inventory.mjs
pass

$ python3 -m py_compile scripts/build_historical_bars.py scripts/quantstats_bridge.py scripts/ibkr_gateway_bridge.py
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
```

Notes:

- `.venv-bridges/` is a local runtime artifact and is intentionally ignored by git.
- Longbridge `history` still returns `301607` in this environment, but the implemented fetcher records it and falls back to bounded `kline --count` calls.
- IBKR historical fetcher is wired behind `HISTORICAL_IBKR_ENABLED=1` / `--ibkr-enabled 1`; it uses the existing socket bridge and remains non-trading.

---

## WP10 — Backtest Analytics Repair — 2026-07-05

Implemented Round 2 WP10 on top of the earlier F7-F12 repairs.

Changes:

- Rebuilt the historical daily equity book in `server/historical_backtest.mjs`: equal-weight open pseudo-positions are now marked daily from `historical_bars` closes, with entry/exit cost applied on the holding path. `portfolioReturnPct`, `benchmarkReturnPct`, and `avgExcessPct` are stored per day.
- MaxDD / Sharpe / CAGR / Calmar now derive from the corrected daily book, not from overlapping outcome samples.
- Added `historicalMaxDrawdownFromReturns()` fixture seam and an exact 10-day MaxDD regression test.
- Added SQLite compatibility tables `historical_decisions` and `historical_outcomes` in addition to the existing `historical_backtest_*` detail tables.
- Details pagination now accepts both `page/pageSize` and `offset/limit`.
- Weight trajectory defaults now produce real rolling windows on multi-quarter runs; the 2-year segment produced 17 windows.

Verification:

```text
$ node --check server/historical_backtest.mjs && node --check server.mjs && node --check public/app.js
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 -m py_compile scripts/build_historical_bars.py scripts/quantstats_bridge.py scripts/ibkr_gateway_bridge.py
pass

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}

$ curl -sS --max-time 300 -X POST http://localhost:5173/api/recommender/historical-backtest ...
2-year segment, maxDates=500:
detailCounts={decisions:4430,outcomes:25649,daily:444}
returned={decisions:1,outcomes:1}
maxDrawdown=-18.2994%, guardedReturnCount=0
headline avgExcessPct=7.2522%, totalReturnPct=712.8069%, excessReturnPct=543.7442%
weightWindows=17
firstIcDecayCells=6
regimeSplitRows=3
preferred=quantstats
responseBytes=346718
```

Contradictions:

- None for WP10. The spec expected the populated 40k-bar / 45-ticker corpus, which is present in `data/market_pulse.sqlite`.

---

## WP11 — Cross-Sectional Normalization + De-Bias — 2026-07-05

Implemented Round 2 WP11.

Changes:

- Added shared `applyCrossSectionalNormalization()` in `lib/recommender_core.mjs`; live and historical call sites now use the same percentile-rank normalizer with 1/99 winsorization and static-baseline fallback below 30 valid names.
- Removed upstream factor-score rounding from `normalizeFactorValue`, live `factorRow`, and historical factor feature assembly so factor scores remain continuous floats for rankIC/statistics.
- Upgraded factor snapshots to `factor-snapshot-v2` and recommendation scores to `recommendation-score-v2`; live and historical outcomes now carry `scoreSchema`, and factor stats now report `schemaMix`.
- Removed the four availability bonuses: options contract count, social reason presence, earnings estimates presence, and industry-chain summary presence no longer boost scores by themselves.
- Added per-factor quality shrinkage inside `scoreRecommendationFromFactorSnapshot`; missing/low-quality factors shrink toward neutral 50 before weighting.
- Softened total data-quality multiplier tiers to `{>=85:1, >=70:.96, >=55:.89, else:.775}`.
- Re-scaled options-flow capital flow to `(netInflow / avgDollarVolume20d) * 160`, clipped to `[-8,+8]`; unavailable ADV now contributes nothing instead of using the old million-dollar divisor.
- Removed the unused local data-quality/regime multiplier duplicate from `server.mjs`, leaving `lib/recommender_core.mjs` as the single scoring implementation.

Verification:

```text
$ node --check lib/recommender_core.mjs && node --check lib/historical_features.mjs && node --check server/historical_backtest.mjs && node --check server.mjs && node --check scripts/core_regression_tests.mjs
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ ALL_STOCK_AGENT_PREFETCH_ENABLED=false BRIDGE_PYTHON=.venv-bridges/bin/python NODE_OPTIONS=--max-old-space-size=4096 node server.mjs
Market Pulse AI running at http://localhost:5173

$ curl -sS --max-time 180 -X POST http://localhost:5173/api/all-stock-agent/run -H 'content-type: application/json' --data '{"trigger":"wp11-smoke-light"}' ...
{
  "runId": "1783203528067-all-stock-agent",
  "evaluations": 80,
  "totalFactors": 800,
  "crossSectionalRank": 800,
  "fallback": 0,
  "pct": 1
}

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
```

Regression fixtures added:

- Uniform +10 shift across a 40-ticker universe leaves cross-sectional scores unchanged.
- Missing options data shrinks `optionsFlow` contribution to 0.
- Tie fraction at exactly 50 is below 5%.
- Same cross-section through the shared live/historical normalizer yields identical scores.
- Historical factor snapshots now assert `recommendation-score-v2`.

Notes:

- A first full `/api/all-stock-agent/run` with normal prefetch enabled exceeded the 240s curl limit and blocked `/api/state`; the WP11 live method check was therefore rerun with `ALL_STOCK_AGENT_PREFETCH_ENABLED=false` to exercise the live scoring path without bulk data prefetch. The live normalization result was 100% `cross-sectional-rank`, above the >=90% requirement.
- Route inventory was regenerated and verified; route counts were unchanged.
- No Python files touched in WP11.

Contradictions:

- None for WP11.

---

## WP12 — Sub-Signal Decomposition + Correlation Matrix — 2026-07-05

Implemented Round 2 WP12.

Changes:

- Added shared recommender helpers in `lib/recommender_core.mjs`: sub-signal-aware cross-sectional normalization, `buildFactorStatsFromOutcomes()`, `buildFactorCorrelationMatrix()`, shared `rankCorrelation()`, and `newsRecencyDecayWeight()`.
- Factor snapshots now carry `factors[id].subSignals[]` for live factors. Macro regime remains atomic. All-null sub-signal groups set factor quality to 0 and remain neutral through quality shrinkage.
- Historical factor snapshots now expose reconstructable sub-signals for momentum, PIT quality, and PIT valuation; non-reconstructable factors remain explicit neutral/missing rather than fabricated.
- Live and historical factorStats now use the shared helper and include per-factor horizons plus per-sub-signal stats, all with `n`/`samples`.
- Historical factor analysis now uses the shared Spearman correlation matrix object with per-cell `rho` and `n`.
- Live all-stock-agent runs now persist `factorCorrelationMatrix`; the track-record UI renders factor IC, sub-signal IC, and high-correlation factor pairs with sample counts.
- News storyline materiality is decayed by `2^(-ageHours/36)` using published timestamps; missing timestamps use weight `0.5`.
- `SUBSIGNAL_IC_WEIGHTING_ENABLED` is intentionally hard-disabled in WP12. The run payload records env requests but keeps equal-weight composites until WP16 strategy-version promotion.
- Store hardening added while validating WP12: historical backtest runs are compacted on read, write, and route storage via `compactHistoricalRun()`. Local ignored `data/store.json` was compacted from 536MB to 80MB because Node could not read the oversized JSON string.

Verification:

```text
$ node --check lib/recommender_core.mjs && node --check lib/historical_features.mjs && node --check server/historical_backtest.mjs && node --check server.mjs && node --check public/app.js && node --check scripts/core_regression_tests.mjs
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}
{"status":"ok","routes":75,"uiFetches":43,"storeKeys":25}

$ ALL_STOCK_AGENT_PREFETCH_ENABLED=false BRIDGE_PYTHON=.venv-bridges/bin/python NODE_OPTIONS=--max-old-space-size=4096 node server.mjs
Market Pulse AI running at http://localhost:5173

$ curl -sS --max-time 180 -X POST http://localhost:5173/api/all-stock-agent/run -H 'content-type: application/json' --data '{"trigger":"wp12-smoke-light"}' ...
{
  "runId": "1783204909405-all-stock-agent",
  "evaluations": 80,
  "subSignals": 2160,
  "subRank": 428,
  "subRankPct": 0.19814814814814816,
  "factorStats": 10,
  "subSignalFactors": 9,
  "horizonFactors": 10,
  "matrixRows": 10,
  "highPairs": 0,
  "icWeighted": {
    "icWeightedEnabled": false,
    "requestedByEnv": false,
    "mode": "equal-weight-composite; IC weighting disabled until WP16 strategy-version promotion"
  }
}
```

Regression fixtures added:

- Sub-signals normalize through cross-sectional rank and factor composite uses sub-signal mean.
- All-null sub-signal composites set factor quality to 0 and score to neutral 50.
- News recency decay halves after 36 hours and missing timestamps receive the documented 0.5 weight.
- Historical factorStats now assert horizon cells and sub-signal stats exist when reconstructable.

Contradictions:

- None for WP12. Some live sub-signals are missing and therefore use missing/fallback normalization; this is expected because the live run lacks every raw field for every ticker.

---

## WP13 — Factor Spec DSL + Registry — 2026-07-05

Implemented Round 2 WP13.

Changes:

- Added pure `lib/factor_spec.mjs` with `parseFactorSpec()` and `evaluateFactorSpec()`. The operator whitelist is closed to the WP13 list, windows are restricted to `{5,10,21,63,126,252}`, pipelines are capped at 8 steps, and windowed ops are capped at 3.
- The evaluator filters all dataset rows to `<= asOf` before any operation, preserving PIT/no-lookahead discipline.
- Added `server/factor_registry.mjs` with default B1/B2 seeds, registry normalization, originality gates, candidate ingestion, human state advancement, and performance-report assembly.
- Added store key `factorRegistry` (`factor-registry-v1`) and four routes:
  - `GET /api/factors/registry`
  - `GET /api/factors/performance-report`
  - `POST /api/factors/candidates`
  - `POST /api/factors/candidates/:id/advance`
- Originality gate rejects op-sequence similarity `>=0.8`; rejected submissions are still recorded in the trial ledger.
- Added SQLite mirror tables `factor_registry` and `factor_trial_ledger` in `scripts/sqlite_store_sync.py`.
- Seeded B1/B2 factors as candidates where DSL can represent them: `revisionMomentum`, `sueScore`, `shortInterestDelta`, `daysToCover`, `ivRank252`, `putCallRatio`. `ivRvSpread` is registered as `implementation:"native"` with explicit `insufficient-data` evidence because DSL v1 cannot honestly combine IV and realized volatility without a native multi-input evaluator.

Verification:

```text
$ node --check lib/factor_spec.mjs && node --check server/factor_registry.mjs && node --check server.mjs && node --check scripts/core_regression_tests.mjs && node --check public/app.js
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 -m py_compile scripts/sqlite_store_sync.py
pass

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":79,"uiFetches":43,"storeKeys":26}
{"status":"ok","routes":79,"uiFetches":43,"storeKeys":26}

$ curl -sS http://localhost:5173/api/factors/registry
{"schema":"factor-registry-v1","factors":7,"states":{"candidate":7}}

$ curl -sS http://localhost:5173/api/factors/performance-report
{"schema":"factor-performance-report-v1","total":7,"trialCount":0,"source":"latest-all-stock-agent-run"}

$ curl -sS -X POST http://localhost:5173/api/factors/candidates ... duplicate revisionMomentum shape
{"factor":"wp13Duplicate","state":"rejected","gateOk":false,"reason":"op-sequence similarity 1.00 vs revisionMomentum","trialCount":1}

$ curl -sS -X POST http://localhost:5173/api/factors/candidates/revisionMomentum/advance ...
{"factor":"revisionMomentum","state":"shadow","history":2}

$ python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite
synced factorRegistry=8, factorTrialLedger=1
```

Regression fixtures added:

- Unknown DSL op is rejected and lists the valid whitelist.
- Poisoned future bar rows are filtered before evaluation.
- Duplicate factor candidate is rejected but still recorded in the trial ledger.

Contradictions:

- `ivRvSpread` cannot be expressed honestly by DSL v1 without extending the whitelist or adding a native multi-input evaluator, so it is registered as `implementation:"native"` with `insufficient-data` evidence.

---

## WP14 — Admission Gates + Shadow Factors + Decay Monitor — 2026-07-05

Implemented Round 2 WP14.

Changes:

- Added B3 seed factors to the registry: `residualMomentum`, `week52HighProximity`, `shortTermReversal`, `idioVol21`, `maxDailyReturn21`, `amihudIlliquidity21`, `overnightGapBias21`.
- Added mechanical `evaluateFactorRegistry()`:
  - candidate → shadow admission gates using sign-correct RankIC, t-stat hurdle, regime signs, adjacent-horizon signs, max correlation, and coverage.
  - trial ledger entries are written for every evaluated factor before transitions.
  - active/decayed monitor demotes weak active factors and recovers decayed factors with positive IC.
- Added manual `POST /api/factors/evaluate`; schedule flag `FACTOR_EVALUATOR_ENABLED=false` remains default. Manual evaluation can accept explicit evidence overrides, recorded as `manual-evidence-override`.
- Live all-stock-agent factor snapshots now inject registry `shadow` factors as `lifecycleState:"shadow"` with neutral score/quality 0 and `weightEligible:false`. They are present for outcome accrual but absent from recommendation-score contributions because they are not in the active weights map.
- Added `llmGovernance` stamps to factor evaluation/performance reports: LLM does not write scores, weights, or states.

Verification:

```text
$ node --check server/factor_registry.mjs && node --check server.mjs && node --check scripts/core_regression_tests.mjs && node --check public/app.js
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":80,"uiFetches":43,"storeKeys":26}
{"status":"ok","routes":80,"uiFetches":43,"storeKeys":26}

$ curl -sS -X POST http://localhost:5173/api/factors/evaluate ... evidenceOverrides.week52HighProximity
{
  "transitions": ["week52HighProximity:candidate->shadow"],
  "trials": 15,
  "llm": {
    "llmWritesScores": false,
    "llmWritesWeights": false,
    "llmWritesStates": false,
    "stateTransitions": "mechanical evaluator or human override only"
  }
}

$ curl -sS -X POST http://localhost:5173/api/all-stock-agent/run ... wp14-shadow-smoke
{
  "runId": "1783206366858-all-stock-agent",
  "evaluations": 80,
  "shadowFactors": 160,
  "shadowWeighted": 0
}

$ rg -n "learnedWeights|weights\\s*=|\\.weights\\s*=" server.mjs server/factor_registry.mjs
only existing candidate-weight/governance paths; factor_registry does not write active weights
```

Regression fixtures added:

- Seeded `week52HighProximity` walks candidate → shadow when mechanical gate evidence passes.
- Duplicate/noise-style candidate is rejected and recorded in the trial ledger.
- Decay monitor demotes an active factor and recovers it after positive IC.

Contradictions:

- True nightly scheduling is intentionally not activated in WP14 because `FACTOR_EVALUATOR_ENABLED` defaults false per spec. The manual route is available.

---

## WP15 — Factor Researcher Agent + Post-Mortems + Lifecycle UI — 2026-07-05

Implemented Round 2 WP15.

Changes:

- Added `harness/agents/factor_researcher.md` in the same frontmatter/prompt format as `review_attributor.md`: tier `reasoning`, `veto_power:false`, `max_steps:6`, `output_schema:factor-proposal-v1`.
- Added read-only harness tools for factor research:
  - `get_factor_performance_report`
  - `get_factor_registry`
  - `get_data_catalog`
  - `get_lessons`
- Extended the mock invoker so `factor_researcher` can produce `factor-proposal-v1` and `factor-postmortem-v1` outputs for deterministic smoke tests.
- Added registry ingest for factor researcher proposals:
  - proposals pass through `parseFactorSpec` and `factorOriginalityGate`.
  - accepted entries are only `state:"candidate"`, `prior:"generated"`, `createdBy:"llm:factor_researcher"`.
  - rejected entries still write trial ledger entries.
- Added manual `POST /api/factors/research`; `FACTOR_RESEARCHER_ENABLED=false` remains default, with a disabled-by-default weekly schedule available when the owner flips it.
- Added post-mortem memory for demotion/retirement transitions. The evaluator still performs the mechanical state transition; the researcher only writes `factor-postmortem-v1` lesson text into registry memory and the factor entry.
- Added `factorRegistry` to `/api/state` and a factor lifecycle board on the all-stock-agent track-record area, with candidate/shadow/active/decayed/retired/rejected columns, IC sparkline, `n`, and expandable gate evidence.

Verification:

```text
$ node --check server/factor_registry.mjs && node --check server.mjs && node --check scripts/core_regression_tests.mjs && node --check public/app.js
pass

$ python3 -m py_compile harness/invoker/mock.py harness/tools/http_tools.py harness/tests/test_harness.py
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 -m unittest harness.tests.test_harness
........
Ran 8 tests in 0.012s
OK

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":81,"uiFetches":43,"storeKeys":26}
{"status":"ok","routes":81,"uiFetches":43,"storeKeys":26}

$ PORT=5191 FACTOR_RESEARCHER_INVOKER=mock AGENT_HARNESS_TIMEOUT_MS=300000 node server.mjs
Market Pulse AI running at http://localhost:5191

$ curl -sS -X POST http://127.0.0.1:5191/api/factors/research ... {"invoker":"mock"}
{
  "ok": true,
  "invoker": "mock",
  "accepted": [
    {
      "factorId": "volumeAccumulation63",
      "state": "candidate",
      "createdBy": "llm:factor_researcher",
      "prior": "generated"
    }
  ],
  "rejected": 0
}

$ curl -sS -X POST /api/factors/candidates/volumeAccumulation63/advance ... active
$ curl -sS -X POST /api/factors/evaluate ... factorStatsOverride negative IC
{
  "transitions": ["volumeAccumulation63:active->decayed"],
  "postmortems": [
    {
      "factorId": "volumeAccumulation63",
      "lesson": "因子降级后只沉淀可迁移教训，不由 LLM 改状态、分数或权重。"
    }
  ],
  "memoryLessons": 3,
  "factorState": "decayed"
}

$ rg -n "llm:factor_researcher|ingestFactorResearcherOutput|appendFactorPostmortem|writesScores|writesWeights|writesStates" server.mjs server/factor_registry.mjs
factor researcher only enters proposal ingest and post-mortem memory; `llmGovernance` records writesScores/writesWeights/writesStates as false.
```

Regression fixtures added:

- `ingestFactorResearcherOutput()` accepts a valid mock proposal through parse + originality gates and preserves `createdBy:"llm:factor_researcher"`.
- `appendFactorPostmortem()` appends both episodic registry memory and per-factor post-mortem records.
- Python harness mock test verifies the new agent can call tools and return a `factor-proposal-v1` proposal.

Contradictions:

- None. Weekly automation is implemented but disabled by default per spec through `FACTOR_RESEARCHER_ENABLED=false`.

---

## WP16 — Overlap-Aware Stats + Sub-Signal Strategy Candidate + B4/B5 Seeds — 2026-07-05

Implemented Round 2 WP16.

Changes:

- Replaced pooled t-stat assumptions in shared factorStats with overlap-aware `effectiveN`:
  - raw `n/samples` remains unchanged.
  - `effectiveN` is computed by unique frozen decision key across overlapping horizons.
  - `tStat = rankIC * sqrt(effectiveN)` and `tStatMethod:"rankIC*sqrt(effectiveN)"`.
  - horizon and sub-signal rows carry the same effective-n fields.
- Updated factor admission gate to use `effectiveN` for t-stat calculation while still reporting raw `n`.
- Added `effectiveN` to historical factor analysis surfaces: `factorStats`, `rankIC`, `icDecay`, and weight trajectory factor IC rows.
- Added mechanical IC-weighted sub-signal composite support:
  - `buildSubSignalCompositePlan()` reads only factorStats/subSignal rankIC and effectiveN.
  - `applyCrossSectionalNormalization()` can use `subSignalCompositeMode:"ic-weighted"` with a strategy-version-controlled plan.
  - default live mode remains equal-weight unless an active strategy version has been human-promoted with the IC-weighted plan.
- Added `candidateStrategyVersionFromSubSignalComposites()`:
  - creates `status:"candidate"` strategy versions only.
  - records a changelog entry and `json.settings.subSignalCompositeMode:"ic-weighted"`.
  - does not change active weights or active scoring before validate/promote.
- Live all-stock-agent runs now create a candidate sub-signal-composite strategy version when evidence is available, and show the candidate id in run roadmap metadata.
- Added B4/B5 registry seeds:
  - `netShareIssuance`
  - `grossProfitability`
  - `assetGrowth`
  - `insiderClusterBuy`
  - `institutionalBreadthDelta`

Verification:

```text
$ node --check lib/recommender_core.mjs && node --check server/strategy_versions.mjs && node --check server/factor_registry.mjs && node --check server/historical_backtest.mjs && node --check server.mjs && node --check scripts/core_regression_tests.mjs
pass

$ python3 -m py_compile harness/invoker/mock.py harness/tools/http_tools.py harness/tests/test_harness.py
pass

$ node scripts/core_regression_tests.mjs
core_regression_tests: ok

$ python3 -m unittest harness.tests.test_harness
........
Ran 8 tests in 0.013s
OK

$ node scripts/generate_route_inventory.mjs && node scripts/generate_route_inventory.mjs --check
{"status":"ok","routes":81,"uiFetches":43,"storeKeys":26}
{"status":"ok","routes":81,"uiFetches":43,"storeKeys":26}
```

Regression fixtures added:

- Overlapping horizon fixture: raw `n=3`, `effectiveN=2`, proving `effectiveN < n` when one decision contributes multiple horizons.
- Historical walk-forward fixture asserts at least one factorStats row has `effectiveN < n` under multi-horizon outcomes.
- IC-weighted sub-signal fixture reweights `newsCatalyst` relative to equal-weight composite using only sub-signal RankIC/effectiveN evidence.
- Strategy-version fixture proves IC-weighted composite enters as `status:"candidate"` and records a changelog entry, while active version remains unchanged until promote.
- B4/B5 seed fixtures prove `netShareIssuance` is registered with `insufficient-data`, and `institutionalBreadthDelta` is recorded as `blocked-data-depth`.

Contradictions:

- `institutionalBreadthDelta` remains blocked because the current 13F sync is filing-level-only and does not provide holdings-level point-in-time holder breadth by ticker. The factor is recorded as `implementation:"native"` with `evidence.status:"blocked-data-depth"`; no synthetic breadth data is fabricated.
