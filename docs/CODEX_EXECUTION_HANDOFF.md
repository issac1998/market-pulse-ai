# Codex Execution Handoff — Full Work Queue

> Written: 2026-07-05 (Claude — decider/reviewer). Codex — implementer.
> This is the single source of truth for the remaining implementation work. Execute WP1 → WP9 in order (parallel-safe pairs noted). Specs referenced here are **binding**: [CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md](CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md) (§0–§10, decisions D1–D15) and [INVESTMENT_ASSISTANT_ROADMAP_FINAL.md](INVESTMENT_ASSISTANT_ROADMAP_FINAL.md) (safety constitution §11).
> Progress protocol: after finishing a WP, tick its checkbox here, append a WP section to [INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md](INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md) (what changed, files/functions, verification output, contradictions found), commit, and continue.

## Ground rules (apply to every WP; violations = external review reject)

1. **Contradiction protocol**: if reality contradicts a spec (missing API, dead field, impossible constraint) — STOP on that item, record the contradiction in the execution doc, continue with the rest. Never silently substitute your own design.
2. **LLM write-boundary**: no code path may let LLM output reach `factorSnapshot.factors[*].score`, gate decisions, factor weights, or skill JSON. The LLM narrates; it never computes decision numbers.
3. **Parity**: all scoring — live, historical, backtest — goes through `lib/recommender_core.mjs`. A parallel scoring implementation anywhere is an automatic reject.
4. **Frozen-record immutability**: never mutate logged decisions/outcomes retroactively; corrections append new fields only.
5. **Sample honesty**: no metric surfaced without its sample count `n`; backtest-sourced stats never blend into live-sourced rows (separate `source` labels always).
6. **Safety intact**: never touch `IBKR_TRADING_ENABLED` semantics, the `data/ALLOW_LIVE_TRADING` double lock, or add any broker order-submission path.
7. **Schemas append-only**: add fields/tables; never rename or repurpose existing ones.
8. **No empty catches**; failures surface in diagnostics and/or `audit_events`.
9. **Per-WP verification**: `node --check server.mjs`, `node --check public/app.js`, `node scripts/core_regression_tests.mjs`, `python3 -m py_compile` for touched Python, `node scripts/generate_route_inventory.mjs` after any route change, plus the WP's own checks below.
10. **One commit per WP** (WP2/WP3 may be two commits each). Message format: `WPn: <summary>`.

---

## ☑ WP1 — Restore sample flow, fix IV accrual, quarantine bad outcomes

**Fix 1 (B1) — decision-log starvation** in `runAllStockAgentForRun` (server.mjs). Currently `decisions = [...buyDecisions(≤3, actionableEligible-only), ...sellDecisions]`; downgraded buy-eligible names become untracked watch-buys.
- Primary buy pool = `buyEligible` evaluations (pre-`d110f7c` behavior). Log up to `skill.settings.buyLimit` (10) as frozen BUY decisions, **all outcome-tracked**, each with boolean `actionable` = true only for the top `actionableBuyLimit` (3) that pass all actionability gates.
- Paper book, `/api/recommendations/today` calls, and the 正式买入 UI section consume ONLY `actionable` decisions; downgraded ones render in the research list but remain tracked decisions.
- Gate semantics: `ticker_cooldown` / `failed_thesis_cooldown` suppress **re-logging** the same ticker; `low_data_quality` / `dynamic_threshold` / `earnings_blackout` only clear `actionable` (decision still logged and tracked).
- `allStockAgentDecisionTracksOutcome` / `allStockAgentDecisionIsExecutableBuy` must treat research-status buy decisions as tracked; paper book opens positions for actionable ones only.

**Fix 2 (B2) — NULL `iv_atm`**. Fix at the source: in Node options post-processing compute `summary.ivAtm` (nearest 7–45 DTE expiry, contract nearest ATM; provider IV if present, else BS-IV bisection from `lib/finance_math.mjs` on mid), plus `summary.ivAtmSource` ("provider"|"estimated") and `summary.ivAtmQuality` (ok|stale|thin from OI/quote freshness). `scripts/sqlite_store_sync.py` reads the new fields. No fabricated backfill for old runs.

**Fix 3 — outcome quarantine**. Add `outcomeQualityStatus` at freeze time and retroactively tag existing rows on next load (append-only). Rule: `suspect_price` when |tickerReturnPct| > 100 at horizons ≤10 trading days, or exit/entry ratio > 3 (or < 1/3) at horizons ≤10, or entryPrice < $0.50; else `ok`. ALL aggregates (`buildRecommendationTrackRecordPayload`, rule stats, factor stats, weight-learning inputs, paper book) exclude non-`ok` rows and report `excludedCount`. Quarantined rows stay visible in raw views. Add a fixture test to `core_regression_tests.mjs`.

**Verify**: agent run with >3 buyEligible names logs >3 decisions with actionable flags; `SELECT COUNT(*) FROM options_snapshots WHERE iv_atm IS NOT NULL` > 0 for the new run; `/api/recommendations/today` shows ≤3 actionable + downgraded names in research + `excludedCount` in trackRecord; the GDC outcome row is `suspect_price`.

## ☑ WP2 — Intraday watcher fast lane (spec: CAPABILITY_GAPS §1)

Scope here: W1 watcher + W3 triage + W4 push + W5 move→reason + W6 novelty + W7 anticipation calendar. (W2 real-time EDGAR lands in WP6 via edgartools — do not hand-roll it here.)
- `server/intraday_watcher.mjs`: loop during NYSE regular+extended hours, `INTRADAY_WATCHER_INTERVAL_MS` (default 120000), universe = watchlist + open positions + today's candidates (cap ~100). Signals: |move| vs ATR(14) z-score (gap vs drift separately), volume pace vs same-time-of-day 20-day baseline, spread blowout/stale quote, 52-week crossing. Fingerprint-dedup into existing `alerts` + one `audit_events` row per firing.
- `lib/alert_triage.mjs` (pure, unit-tested): severity from move z, volume pace, headline keyword class (halt/guidance/offering/FDA/M&A/investigation/index-change; bilingual patterns), earnings-day flag, membership. **Zero LLM calls anywhere in watcher→triage→push.**
- `server/push_delivery.mjs`: Bark / Telegram / ntfy via env (`PUSH_PROVIDER`, `PUSH_TARGET`…), severity threshold + per-ticker cooldown. Email untouched.
- `POST /api/intraday/explain {ticker}`: targeted mini-collection (news + filings cache + social) for one ticker, queues LLM enrichment async; push message links here.
- Novelty: story fingerprint = normalized headline shingles + ticker + catalyst class; match within N days ⇒ "update" severity, not "new".
- Anticipation calendar: static FOMC/CPI/OPEX lists + earnings calendar; watcher tightens interval around events for affected names. **Include the consensus snapshot**: the day before each watchlist earnings date, snapshot consensus EPS/revenue from the research pack into a new `consensus_snapshots` store key + mirror table (starts SUE accrual for WP7).
- **Verify**: simulated ±5% move and a fake filing alert → push < 2 min end-to-end, audit_events timestamps prove no LLM on the critical path; triage unit tests green; watcher fully disabled when `INTRADAY_WATCHER_ENABLED=false` (default **false** until owner enables).

## ☑ WP3 — Tier-1 historical corpus (spec: §4.4 Tier 1 + D4/D5)

- `scripts/build_historical_bars.py`: bulk daily OHLCV via the **existing AkShare bridge** (D5; ~1500 bars/ticker), gap-fill Finnhub/Alpha Vantage, into `historical_bars(ticker, date, open, high, low, close, volume, source)` with a corpus-metadata row (universe def, build date, survivorship caveat). Universe: current S&P 500 + Nasdaq 100 + all tickers in `stock_history`/decisions. Resumable, rate-limit-aware.
- `historical_regimes(date, bucket, risk_score)` from FRED history through the existing `scoreFredMacroRegime` logic.
- `buildFactorSnapshotAsOf(ticker, date)`: computes reconstructable factors (momentum/technical incl. the **D4 Alpha158 subset** below, macroRegime, liquidity; qualityGrowth/valuation stay Tier-2/WP6) strictly from data ≤ `asOf`, then scores through `scoreRecommendationFromFactorSnapshot`. Non-reconstructable factors = 50 + `missingReason:"not-reconstructable"`. Poisoned-future-data fixture test required (builder must reject/ignore post-asOf rows).
- **D4 Alpha158 subset (~24 features, OHLCV-only, in-house)**: k-bar shape family (KMID/KLEN/KUP/KLOW/KSFT); ROC/MA/STD over windows [5,20,60]; RSV, RANK, IMAX/IMIN; CORR(close,volume); CNTP/CNTN; WVMA. These feed the momentum/technical factor group's raw inputs; identical formulas live-side and historical-side with parity fixtures (same input → same value in both paths).
- **Verify**: 5 tickers × 3 dates spot-checked vs provider closes; parity fixtures green; corpus build logs row counts per source.

## ☑ WP4 — Historical walk-forward + backtest report (spec: §7, unlocks §10)

- Extend `runAllStockAgentBacktest` (or add `runHistoricalWalkForward`) sourcing from `historical_bars`: frozen pseudo-decisions (`decisionSource:"historical-backtest"`, own tables/labels, never blended with live), entry next-open after signal, cost/slippage bps config stored with the run, outcomes T+1/3/5/10/20/60 vs SPY + sector basket, regime-tagged from `historical_regimes`.
- Weights outputs (§7.1): candidate weights per walk-forward window via `learnRecommendationFactorWeights` (same caps); unconstrained rankIC-proportional reference weights labeled `reference-only`; weight-trajectory stability data; per-factor verdicts (keep / floor / needs-more-samples) with `n`.
- Metrics (§7.2): CAGR, excess vs SPY/QQQ/sector (headline = excess), MaxDD (magnitude/duration/recovery), Calmar, Sharpe, Sortino, vol, hit rate (±0.5% deadband), payoff, expectancy, profit factor, precision@10 per horizon, turnover + cost drag next to Sharpe, exposure, monthly/quarterly table, equity+drawdown curves per regime; factor-level rankIC(+t-stat)/IC-decay/quantile spreads/correlation matrix. Every cell carries `n`.
- APIs: `POST /api/recommender/historical-backtest` (frozen run), `GET /api/recommender/historical-backtest/:id/report` (full JSON + provenance per D10: engine, per-factor data source, universe caveat, strategy hash, config).
- LLM narrative (Chinese) via existing report pipeline, derived from and subordinate to the frozen JSON; provider badge; never writes numbers.
- Anti-fooling (§7.4): walk-forward only; zero-cost runs labeled `frictionless-reference`; headline = pre-registered config (top-10, T+20 primary, current thresholds); backtest weights enter live ONLY as candidate strategy versions.
- **Verify**: metrics independently recomputable from the frozen pseudo-decision tables (external reviewer will do this); report renders with all provenance fields.

## ☑ WP5 — Metrics & factor-analysis bridges (D1/D2/D9/D10)

- `scripts/quantstats_bridge.py`: stdin JSON {daily equity series, benchmark series, costs} → stdout metrics JSON + optional HTML tearsheet path under `data/reports/`. Wire into WP4 report as the preferred engine; native metrics remain fallback; report states which engine ran (D10).
- `scripts/alphalens_bridge.py`: long-format factor values + closes from SQLite → `get_clean_factor_and_forward_returns` → IC by horizon, quantile mean returns, turnover as JSON. Venv pins: `pandas>=2.2.2`, `numpy>=2`, `quantstats>=0.0.81`, `alphalens-reloaded>=0.4.5`.
- Both follow the akshare/openbb bridge contract: `runJsonCli`, timeouts, failures → diagnostics + `audit_events`, never block the native path.
- **Verify**: bridge Sharpe/MaxDD match native within 1e-3 relative tolerance on a fixture series; kill the venv → report still renders with native engine + a visible degradation note.

## ☑ WP6 — edgartools integration (D3)

- `scripts/edgar_pit_bridge.py` (pip `edgartools`, MIT): (a) PIT fundamentals — XBRL facts keyed by **filing date** into `pit_fundamentals(ticker, filed_at, period, field, value, form)`; (b) 13F holdings deltas per quarter into `institutional_holdings` → upgrade the `smartMoney` factor raw inputs (holders count Δ, top-holder concentration Δ); (c) current-filings feed: watcher W2 polling every 1–2 min for watchlist CIKs, 8-K item→severity map (1.01/2.02/5.02/8.01 high; 7.01/9.01 low), wired into WP2 triage/push.
- Extend `buildFactorSnapshotAsOf` to use `pit_fundamentals` for qualityGrowth/valuation (Tier 2), enabling those factors in WP4 re-runs.
- **Verify (the PIT proof)**: for a known restated quarter, `asOf` dates before the restatement return the *originally filed* value; 13F deltas match EDGAR web UI for 2 sampled funds; watcher receives a fresh 8-K within one poll interval.

## ☑ WP7 — Factor quality pack (spec: §2)

- Winsorization: clip factor raw inputs and outcome returns at cross-sectional 1/99 percentiles before normalization, in `lib/recommender_core.mjs` (flag-controlled, default on; log clip counts).
- Cross-factor Spearman correlation matrix per run, persisted, rendered in track-record view; flag |ρ| > 0.6 pairs.
- Earnings-quality factor family from existing fundamentals + (post-WP6) PIT data: accruals ratio, cash conversion, Piotroski F, Altman Z, dilution trend → new raw inputs under `qualityGrowth` (or a new factor entering at token weight per the earn-your-weight rule).
- SUE inputs from WP2's `consensus_snapshots` + actuals; revision-breadth from diffing stored Longbridge ratings history; short-interest history accrual table from the research pack.
- Earnings blackout becomes **pre-earnings only** (remove the post-earnings half of the abs-distance check) so PEAD entries are possible; keep a separate post-gap flag as information, not a gate.
- **Verify**: unit tests per computed ratio vs hand-checked values for 3 tickers; correlation matrix renders with `n`.

## ☑ WP8 — Phase-2 machinery on historical evidence (D11–D14)

- Candidate workflow: learned weights (live or WP4-historical) write to a **candidate** `strategy_versions` row (`status:"candidate"`), never directly active. `POST /api/strategy-versions/promote {id}` = human adopt (requires stored validation record: candidate ≥ active on excess AND ≤ on MaxDD in walk-forward); `POST /api/strategy-versions/rollback` restores prior version byte-identically. The in-run auto-application of `learnedWeights` as `activeFactorWeights` is **removed** — active weights always come from the active strategy version.
- Regime-split evaluation dashboard (track-record page): per horizon × regime metrics with `n` everywhere, live and historical panels separate.
- Live parity dashboard (D13): daily comparison of live factor distributions / decision rates / gate-fire rates vs historical expectations; divergence warning banner.
- Shadow debates accrual (D14): scheduled daily debate for top-5 candidates behind `AGENT_DEBATE_DAILY_ENABLED` (default **false** — owner flips it; cost/latency is theirs to accept); results remain shadow-gate only.
- **Verify**: no path writes weights to the active skill without a promote call + validation record; rollback fixture; parity dashboard renders with both panels.

## ☑ WP9 — Frontend surfaces for the daily loop (roadmap FINAL Phase 1)

- Today page: consume `/api/recommendations/today` — freshness badge, regime, ≤8 stories, ≤3 actionable + collapsed research (with downgrade-reason chips), track-record strip with `excludedCount`, health strip.
- Deep-dive page: consume `/api/stocks/deep-dive` — factor waterfall (contributions reconcile to score), DQ audit block expandable, value chain with verified/inferred chips, news timeline, decision history, invalidations.
- Reconciliation view (portfolio page): `/api/trade-recommendation-reconciliation` summary + rows; paper-accept button on actionable cards → `/api/paper-portfolio/accept`.
- Strategy panel (ops page): versions list, candidate vs active, promote/rollback buttons (promote requires typed confirmation), validation records.
- **Verify**: each page renders from a cold server with the current store; no dev-tools needed to answer "which data was missing" on any advice card.

---

## Dependency notes

- WP2 ∥ WP3 after WP1. WP4 needs WP3. WP5 needs WP4. WP6 after WP5 (its Tier-2 factors trigger a WP4 re-run). WP7 partially parallel (winsorization/correlation any time after WP1; SUE needs WP2's consensus snapshots; earnings-quality is better after WP6). WP8 needs WP4 (validation corpus). WP9 any time after WP1, ideally after WP8 for the strategy panel.
- If blocked on one WP >1 session, log the blocker and advance to the next non-dependent WP.

---

# Round 2 — Factor V2 queue (WP10–WP16)

> Written: 2026-07-05 (Claude — decider/reviewer). Binding spec: [FACTOR_V2_PLAN.md](FACTOR_V2_PLAN.md) (diagnosis P1–P10, workstreams A–D). Same ground rules 1–10 above, plus:
>
> 11. **Float scores**: after WP11, factor scores are continuous floats; never re-introduce `Math.round` anywhere upstream of stats/rankIC. Rounding is display-only.
> 12. **Registry write-boundary**: `factorRegistry` state transitions happen ONLY in the mechanical evaluator/gates or the audited human endpoints. LLM proposals can only *create* `candidate` entries, and only through the parse+originality ingest gate. LLM output never sets states, weights, or scores.
> 13. **Trial honesty**: every candidate that reaches evaluation increments the trial ledger, including rejected and LLM-proposed ones. No evaluation without a ledger entry.
> 14. **Environment facts** (verified 07-05, do not rediscover): Longbridge CLI `kline SYM.US --period day --count N --format json` is the primary bar source (values are STRINGS — coerce); FRED must be fetched via Node fetch or curl subprocess, never Python urllib; `BRIDGE_PYTHON` venv (py≥3.10) for quantstats per F12; big walk-forward runs must go through SQLite persistence, not one-shot HTTP bodies (F7).

## ☑ WP10 — Backtest analytics repair (follow-ups F7–F11; prerequisite for all gate math)

All five live in `server/historical_backtest.mjs` metrics/report assembly (engine core verified sound — 0 lookahead violations, hit-rate matches independent recompute; see FINAL_EXECUTION “New follow-ups from this session”).

- **F7**: persist pseudo-decisions/outcomes of walk-forward runs to SQLite tables (`historical_decisions`, `historical_outcomes`), return compact run summaries from `POST /api/recommender/historical-backtest`, paginate detail reads (`?offset/limit`). Runs >500 dates must not construct multi-MB HTTP bodies.
- **F8**: assemble headline `avgExcessPct` / `totalReturnPct` / `excessReturnPct` from the per-horizon data that already exists (primary horizon = T+20 per pre-registered config).
- **F9**: rebuild the daily equity book: equal-weight open pseudo-positions, daily mark-to-market from `historical_bars` closes, compounded portfolio return; MaxDD magnitude/duration/recovery from that curve. Add a fixture where hand-computed MaxDD on a 10-day series must match exactly. Sharpe/CAGR recompute from the corrected curve.
- **F10**: run the windowed learner (`learnRecommendationFactorWeights`, same caps) per walk-forward quarter; output the weight trajectory (§7.1 deliverable) — pooled weights already work, only the per-window trajectory is missing.
- **F11**: fill `icDecay` (rankIC per factor per horizon from the 6 horizon outcome sets, each with `n`) and `regimeSplit` (join outcomes to `historical_regimes` buckets) in the run payload.
- **Verify**: 2-year segment run over the populated corpus (40k bars / 45 tickers already in SQLite) returns HTTP 200 with non-null headline metrics; MaxDD > −100% and fixture-exact; ≥4 quarterly weight windows; icDecay has 6 horizon cells with `n`; regimeSplit ≥2 buckets with `n`.

## ☑ WP11 — Cross-sectional normalization + de-bias (plan §2 A1+A3; fixes P1/P2/P5/P8/P9)

- **Shared helper** `applyCrossSectionalNormalization(snapshots, options)` in `lib/recommender_core.mjs` (parity rule: live and historical both call it): for each factor id across the run/date cross-section, winsorize heuristic scores at 1/99 (`winsorizeFactorSnapshots` — already written, currently unused), then percentile-rank to a **continuous float** `score = 100 · rank/(n−1)`; `normalization.method = "cross-sectional-rank"`. Fallback to the existing `normalizeFactorValue` static-baseline path only when cross-section `n < 30` (method label unchanged). Live call site: `buildFactorSnapshotForRun` (server.mjs) becomes two-pass (compute all heuristic factors first, then normalize). Historical call site: the walk-forward normalizes per date over its universe.
- Remove `Math.round` from `factorRow` (server.mjs:20761) and `normalizeFactorValue` score assembly. Keep `heuristicScore` for display/audit. Bump snapshot schema to `factor-snapshot-v2`; outcome rows carry `scoreSchema` (append-only); factorStats report a `schemaMix` count but keep pooling (rank-based stats tolerate within-day monotone transforms).
- **Remove all four availability bonuses**: `optionsFlow` `contractCount>0 → +6`; `socialAttention` `hasReason → +8`; `earningsRevision` `+5` for estimates existing; `industryChain` `summary → +8`. Missing input ⇒ that term contributes nothing.
- **Per-factor quality shrinkage** in `scoreRecommendationFromFactorSnapshot` (`lib/recommender_core.mjs`): effective score = `50 + (score − 50) · (quality/100)`; bump to `recommendation-score-v2`. Soften the now-double-counting total multiplier tiers to `{≥85: 1, ≥70: 0.96, ≥55: 0.89, else: 0.775}`.
- **Flow scale fix** (P4): `optionsFlow` capital-flow term becomes `clip((netInflow / avgDollarVolume20d) · 160, −8, +8)`; if 20d ADV is unavailable, the term is null (no contribution) — never the old `/1_000_000`.
- **Verify** (fixtures in `core_regression_tests.mjs`): uniform +10 shift across a 40-ticker synthetic universe leaves all scores unchanged; two identical tickers where one lacks options data produce identical `optionsFlow` contribution 0; tie-fraction at score 50 < 5%; live run shows `method:"cross-sectional-rank"` on ≥90% of factors; parity fixture — same cross-section through live and historical paths yields identical scores.

## ☑ WP12 — Sub-signal decomposition, live correlation matrix, horizon profiles, news decay (plan §2 A2+A4+A5; fixes P3/P7/P10-partial)

- `factors[id].subSignals[{id, label, raw, score, quality}]` (append-only on `factor-snapshot-v2`), each sub-signal scored through the same cross-sectional path. Binding decomposition: `momentum{smaDistance, return5d, rsiBand, trendLabel}`; `qualityGrowth{revenueGrowth, netMargin, roe, leverage, accrualsRatio, cashConversion}` (promotes the WP7 raw fields); `valuationExpectation{targetUpside, reverseDcfGap, peLevel}`; `earningsRevision{ratingLevel}` (revisionDelta arrives in WP13); `newsCatalyst{positiveMateriality, negativeMateriality, bodyEvidence}`; `optionsFlow{unusualCount, ivRankLevel, flowRatio}`; `smartMoney{insiderBias, holderBias, shortRiskLevel}`; `socialAttention{mentions, mentionDelta}`; `industryChain{relativeChange, downstreamChange}`; `macroRegime` stays atomic. Composite = mean of non-null sub-signal scores; all-null ⇒ factor quality 0 (neutral via shrinkage).
- Extend factor stats (live + historical through a shared helper — parity): per sub-signal rankIC/hitRate/`n`, and per horizon bucket `{1,3,5,10,20,60}` at both factor and sub-signal level (`factorStats[id].horizons`, `.subSignals`).
- **Live cross-factor Spearman matrix**: extract the historical matrix code (historical_backtest.mjs:357) into a shared helper; compute per live run over the day's snapshots; persist `factorCorrelationMatrix` in the run payload; render in the track-record view; flag |ρ| > 0.6 pairs.
- **News recency decay**: storyline materiality weighted by `2^(−ageHours/36)` from publishedAt; missing timestamp ⇒ weight 0.5.
- Implement IC-weighted sub-signal composites (weights ∝ max(0, rolling rankIC), ≥50 samples per sub-signal, renormalized) but ship **disabled**: `SUBSIGNAL_IC_WEIGHTING_ENABLED=false`; activation only via WP16 strategy version.
- **Verify**: track-record shows per-sub-signal IC with `n`; live correlation matrix renders with values and `n`; decay + all-null-composite fixtures green; every new stat cell carries `n`; route inventory regenerated.

## ☑ WP13 — Factor spec DSL, registry, B1/B2 factors as specs (plan §4 C1–C2, §3 B1/B2)

- **`lib/factor_spec.mjs`** — `parseFactorSpec(json)` and `evaluateFactorSpec(spec, dataset, {asOf})`, pure functions. Operator whitelist (exact, closed): `ref, delta, ts_mean, ts_std, ts_sum, ts_rank, ts_max, ts_min, ts_corr, cs_rank, cs_zscore, add, sub, mul, div, log, abs, sign, clip, overnight_return, dollar_volume`. Windows only from `{5,10,21,63,126,252}`. ≤8 pipeline steps, ≤3 windowed ops. Unknown op/input ⇒ parse error listing valid options. Dataset contract: `{bars, pit, revisions, shortInterest, ivHistory, consensus}`; the evaluator itself filters rows to `≤ asOf` (poisoned-future fixture required, same discipline as WP3).
- **Registry**: store key `factorRegistry` (`factor-registry-v1`): `{trialLedger:{count, entries[]}, factors:[{factorId, family, spec, hypothesis, expectedSign, horizons, prior:"literature"|"generated", state, createdBy, stateHistory[], evidence{}}]}`; states `candidate|shadow|active|decayed|retired|rejected`; `stateHistory` append-only. SQLite mirror tables `factor_registry`, `factor_trial_ledger` in `scripts/sqlite_store_sync.py`.
- **Routes**: `GET /api/factors/registry`; `GET /api/factors/performance-report` (per factor/sub-signal IC × horizon × regime, correlation matrix, coverage, lifecycle states — this is the payload the WP15 agent will read); `POST /api/factors/candidates` (human spec submission through parse + originality gates); `POST /api/factors/candidates/:id/advance` (human override; writes `audit_events`).
- **Originality gate** (runs on every submission, human or LLM): op-sequence similarity ≥0.8 vs any existing spec ⇒ reject; evaluated score-series |ρ| > 0.9 vs any existing factor over the corpus ⇒ reject. Rejections recorded in the registry (so WP15 can show the agent its failures).
- **B1/B2 factors registered as `candidate` specs** (`prior:"literature"`): `revisionMomentum` (30d Δ buy-ratio + 90d Δ consensus EPS from `analyst_revision_history`), `sueScore` (from `sue_history`), `shortInterestDelta` + `daysToCover` (from `short_interest_history`), `ivRank252`, `ivRvSpread` (iv_atm − annualized `ts_std(returns,21)`), `putCallRatio` (from `options_snapshots`). Accrual tables that are still empty ⇒ evaluation status `insufficient-data`, honestly reported — do not fabricate. Where the DSL genuinely cannot express a factor, contradiction protocol: register with `implementation:"native"` + a native evaluator function; never silently extend the operator whitelist.
- **Verify**: poisoned-future and unknown-op fixtures; registry APIs render; each B1/B2 candidate has either corpus evaluation evidence or an explicit `insufficient-data` status; route inventory regenerated.

## ☑ WP14 — Admission gates, decay monitor, trial ledger, live shadow, B3 seeds (plan §4 C4, §5 D1–D2)

- **Evaluator job**: nightly when `FACTOR_EVALUATOR_ENABLED=true` (default **false**, owner flips) + manual `POST /api/factors/evaluate`. Runs: admission gates over the historical corpus, decay monitor over live stats, correlation refresh, performance-report persist.
- **Admission gates (candidate → shadow)**, all mechanical: (1) rankIC with correct `expectedSign`, t-stat from **non-overlapping outcome windows per horizon**, hurdle ≥3.0 for `prior:"literature"`, ≥3.5 for `"generated"`, escalating +0.1 per doubling of `trialLedger.count` beyond 8; (2) same IC sign in ≥2 of 3 regime buckets AND in the horizons adjacent to the target (needs WP10 F11); (3) |ρ| < 0.6 vs every active/shadow factor; (4) computable for ≥60% of the live universe. Every evaluation writes a trial-ledger entry first (ground rule 13).
- **Shadow in live runs**: registry `shadow` factors are evaluated each live run (dataset assembled from run context + accrual tables) and inserted into `factorSnapshot.factors` with `lifecycleState:"shadow"` — absent from the weights map (zero decision influence by construction), present in outcome accrual and factorStats.
- **Promotion (shadow → active)**: ≥50 usable live outcomes, live IC sign matches historical, |ρ| checks hold ⇒ emit a **candidate strategy version** with the new factor at weight 0.015 (existing normalization redistributes; step caps apply) → human `promote` via the WP8 API. No auto-promotion path may exist.
- **Decay monitor (active → decayed/retired)**: rolling window of the trailing 60 usable outcomes per factor and sub-signal; demote to `decayed` after 2 consecutive windows with rankIC ≤ 0 AND negative cumulative weighted contribution — weight floored to 0.005 via candidate strategy version; `redundant` flag when |ρ| > 0.85 with a higher-IC factor ⇒ retirement recommendation. Auto-recovery: a decayed factor whose next 60-outcome window turns IC-positive returns to the promotable list. Every transition ⇒ registry stateHistory + `audit_events` + (if weights touched) strategy version.
- **B3 seeds** registered as `prior:"literature"` specs: `residualMomentum` (60d return residual vs SPY+sector basket), `week52HighProximity`, `shortTermReversal` (−return5d, horizons [1,5]), `idioVol21`, `maxDailyReturn21`, `amihudIlliquidity21`, `overnightGapBias21`.
- **Verify**: one seeded factor walks candidate→shadow with gate evidence stored in `evidence{}`; a deliberate noise spec is rejected AND its trial recorded; decay fixture demotes then auto-recovers; grep-verifiable: no code path changes weights without a candidate strategy version; `llmGovernance` stamp still truthful.

## ☑ WP15 — factor_researcher agent, post-mortems, lifecycle UI (plan §4 C3)

- **`harness/agents/factor_researcher.md`** in the exact `review_attributor.md` format (tier `reasoning`, `veto_power: false`, `max_steps: 6`, output_schema `factor-proposal-v1`). Tools: `get_factor_performance_report`, `get_factor_registry` (includes past rejections — the agent must not re-propose them), `get_data_catalog`, `get_lessons`. Prompt requirements: hypothesis-first (falsifiable economic rationale mandatory), 1–3 proposals per cycle, each with a novelty argument referencing the correlation matrix and naming the weak factor it replaces (if any); numbers only from tool results.
- **Ingest path** (mirror of `agent_harness_ingest` pattern): proposals → parse gate → originality gate → registry `candidate` with `createdBy:"llm:factor_researcher"`, `prior:"generated"`. `FACTOR_RESEARCHER_ENABLED=false` default; weekly schedule when enabled; manual `POST /api/factors/research`.
- **Post-mortems**: on every demotion/retirement the agent is invoked with the factor's history → `factor-postmortem-v1` (hypothesis, what the evidence showed, transferable lesson) → episodic memory + registry entry. The agent never executes removals (ground rule 12).
- **UI**: factor lifecycle board (candidate/shadow/active/decayed/retired columns; per-card IC sparkline + `n` + gate evidence expandable) on the ops/track-record page.
- **Verify**: end-to-end cycle with the mock invoker (`harness/invoker/mock.py`) lands a valid registry candidate without human edit; a forced demotion produces a post-mortem lesson in memory; no LLM write path to scores/weights/states (review will grep).

## ☑ WP16 — Overlap-aware stats everywhere, IC-weighted composites live, B4/B5 (plan §5 D1, §3 B4/B5)

- Replace pooled-sample t-stats in **all** factorStats surfaces (live, historical, report) with non-overlapping effective-`n` (report `effectiveN` alongside raw `n`); Newey-West adjustment acceptable as a labeled alternative.
- Flip IC-weighted sub-signal composites on — ONLY via a candidate strategy version through the WP8 promote flow; record the reweighting in the changelog.
- B4/B5 specs as PIT/13F depth allows: `netShareIssuance`, `grossProfitability`, `assetGrowth` (need ≥2 PIT periods), `insiderClusterBuy` (Form 4, ≥2 distinct insiders / 30d), `institutionalBreadthDelta` (blocked while 13F sync is filing-level-only — contradiction protocol if still true).
- **Verify**: `effectiveN < n` wherever horizons overlap; at least one composite reweighted on evidence with the strategy-version changelog entry; blocked items recorded, not faked.

## Round-2 dependency notes

- WP10 first (F9/F11 poison all gate math). WP11 → WP12 strictly ordered. WP13 can start in parallel with WP12 (touches different files). WP14 needs WP10+WP11+WP13. WP15 needs WP14. WP16 needs WP12+WP14.
- Sequencing rationale (from the plan): measurement fixes before the LLM loop — gates built on tie-clumped, biased scores would admit and kill the wrong factors.

---

# Round 2 external review (Claude, 2026-07-05, commits 8adbed7..db6cd7e) — verdict + Round 3 queue

## Per-WP verdicts

| WP | Verdict | Notes |
|----|---------|-------|
| WP10 | ✅ pass | MaxDD −18.30% (was −100%), headline metrics non-null, 17 weight windows, icDecay 6 horizon cells, regimeSplit 3 buckets, SQLite persistence + pagination. Daily book = equal-weight mark-to-market from `historical_bars`, exact-MaxDD fixture present. Absolute return levels remain survivorship-inflated (known corpus caveat) — treat structure, not level, as the signal. |
| WP11 | ✅ pass (high quality) | `applyCrossSectionalNormalization` (recommender_core) is correct: winsorize 1/99 → tie-averaged percentile rank → continuous float; `<30` static-baseline fallback; live + historical share the code path (parity holds). All four availability bonuses verified removed in the scorers; flow term is ADV-normalized and null when ADV missing; per-factor quality shrinkage + softened multiplier tiers in `recommendation-score-v2`; `schemaMix` tagging present. Fixtures verified green. |
| WP12 | ✅ pass | Sub-signal decomposition matches the binding lists exactly (`buildFactorSubSignals`, server.mjs ≈20848); shared `buildFactorStatsFromOutcomes` produces per-sub-signal + per-horizon stats with `n` everywhere; live `factorCorrelationMatrix` + high-|ρ| pairs; news decay `2^(−age/36)` with 0.5 missing-timestamp default; IC weighting shipped disabled as specified. |
| WP13 | ✅ pass | DSL parse gates solid (closed whitelist, window menu, ≤8 steps / ≤3 windowed); asOf filtering inside the evaluator verified by independent poisoned-future test (n=0). Registry + trial ledger + 4 routes + SQLite mirrors; empty accrual tables reported `insufficient-data` honestly; native-implementation contradictions recorded, not faked. |
| WP14 | ⚠️ conditional | Gate *logic* is correct and fails closed; flags default off; llmGovernance stamps truthful; shadow factors excluded from weights by construction. BUT the two evidence engines are stubs — see R1/R2 below. The candidate→shadow verification walked on `manual-evidence-override`, not computed evidence. |
| WP15 | ✅ pass | Agent file matches house format; tools read-only; ingest goes through parse+originality gates; only creates `candidate` entries with `createdBy:"llm:factor_researcher"`; post-mortems land in registry memory; mock-invoker E2E green; lifecycle UI board renders. One integrity bug (R3a). |
| WP16 | ✅ pass with refinement | `effectiveN` = unique-decision dedupe across horizons, honestly labeled; IC-composite plan reads only mechanical stats and enters as `status:"candidate"` strategy version; B4/B5 seeded with `blocked-data-depth` recorded for 13F. Within-horizon time overlap not yet addressed (R4a). |

Mechanical checks re-run externally: `node --check` all touched files ✓, `core_regression_tests` ✓, route inventory `--check` ✓ (81 routes), Python compiles ✓, independent DSL smoke test ✓.

**Bottom line: the lifecycle skeleton, governance, and measurement layer are real and well-built. But the loop cannot yet validate a factor end-to-end on its own evidence: nothing evaluates candidate specs over the historical corpus, and live shadow factors are injected with a constant score of 50 (zero variance ⇒ IC can never accrue). Round 3 closes exactly that.**

Unrelated working-tree note: uncommitted `public/app.js`/`public/styles.css` (uzi-analysis feature), `README.md`, and two doc edits predate this round — do **not** revert or absorb them into Round-3 commits.

## Round 3 queue — execute in order (same ground rules 1–14; ticks/report protocol unchanged)

## ☑ WP17 — Corpus evidence engine (closes the candidate→shadow loop on real evidence; CRITICAL)

The missing piece found in review: `admissionEvidenceForFactor` (server/factor_registry.mjs) only reads `evidenceOverrides` / stored `factor.evidence` / live factorStats — nothing computes evidence from `historical_bars` + walk-forward outcomes. Build the engine:

- **Multi-ticker DSL semantics first** (in `lib/factor_spec.mjs`): `refSeries`/`overnight_return`/rolling ops currently mix tickers into one date-sorted series — `delta`/`ts_*` would compute across ticker boundaries on multi-ticker datasets. Group all series ops by ticker. Make `cs_rank`/`cs_zscore` true per-date cross-sectional ops (rank across tickers at each date); currently they rank over the whole time series, which is a mislabeled `ts_rank`. Keep the operator whitelist closed. Fixture: a 2-ticker dataset where per-ticker delta and per-date cs_rank are hand-checkable.
- **`evaluateFactorSpecOverCorpus(spec, {db, universe, dateGrid})`** (new, in `server/factor_registry.mjs` or a sibling module): per rebalance date (weekly grid is fine), evaluate the spec per ticker from SQLite (`historical_bars`, `pit_fundamentals`, accrual tables) strictly ≤ asOf, cross-sectionally rank the values, join to the WP10 `historical_outcomes` tables per horizon, and compute: rankIC + `effectiveN` + t-stat per horizon, per regime bucket (join `historical_regimes`), coverage (fraction of universe with computable values), and score-series correlation vs each active/shadow factor (aligned on ticker+date pairs — the current originality correlation aligns by array index, which is meaningless; fix it there too). Write the result into `factor.evidence` with `source:"historical-corpus"`, every cell carrying `n`/`effectiveN`.
- Wire `evaluateFactorRegistry` to call this for `candidate` factors (batch, resumable; cap runtime per factor); `manual-evidence-override` stays allowed but must be labeled in `stateHistory.reason` and should no longer be the only path.
- **Verify**: at least one B3 seed (e.g. `week52HighProximity` or `overnightGapBias21`) gets fully computed corpus evidence (IC × horizon × regime with n) and passes or fails the gates on that evidence alone — no overrides; a poisoned-future fixture at the corpus-engine level; the two-ticker DSL fixtures green.

## ☑ WP18 — Real live shadow computation + shadow→active promotion emitter (CRITICAL)

- `shadowFactorsForContext` (server.mjs ≈21257) currently injects `score: 50, quality: 0` constants — zero cross-sectional variance, so live IC can never accrue and the shadow phase is decorative. Replace: for each `shadow` registry factor, assemble a per-ticker dataset from run context + accrual tables (bars from the technical chart / Longbridge kline cache, `options_snapshots` for ivHistory, `analyst_revision_history`, `short_interest_history`, PIT facts) and evaluate the spec (DSL or native) per ticker. Real values flow into `applyCrossSectionalNormalization` alongside core factors (they already pass through it — constants were the only reason it was inert). Keep `quality` honest (coverage-based), keep `weightEligible:false` and exclusion from the weights map exactly as now. Tickers where the spec has insufficient data ⇒ `score:null`/missing, never a fabricated 50-with-quality.
- Native evaluator functions for the 5 `implementation:"native"` seeds, registered in one dispatch map (same registry entry, no DSL whitelist changes): `ivRvSpread` (iv_atm − annualized ts_std of daily returns, 21d), `residualMomentum` (60d return residual vs SPY + sector-basket regression using `buildBenchmarkBasket`), `amihudIlliquidity21` (mean |daily return| / dollar volume), `insiderClusterBuy` (≥2 distinct Form 4 insiders buying within 30d — contradiction protocol if Form 4 rows lack insider identity), `institutionalBreadthDelta` (stays `blocked-data-depth` until 13F holdings-level sync exists — do not fake).
- **Shadow→active promotion emitter** (missing entirely — grep found no path): when a shadow factor reaches ≥50 usable live outcomes AND live rankIC sign matches historical AND |ρ| < 0.6 holds, emit a **candidate strategy version** including the factor at weight 0.015 (normalization redistributes; step caps apply) with the evidence attached in the changelog. Human promote via the WP8 API remains the only activation. Also emit the **weight-floor candidate strategy version** on decay of any factor present in active weights (the current decay path changes registry state but never touches a strategy version).
- **Verify**: a live run shows shadow factors with non-constant cross-sectional scores (fixture: two tickers, different spec inputs ⇒ different shadow scores); shadow outcomes accrue into factorStats with real rankIC after simulated outcomes; the promotion emitter produces a `status:"candidate"` version with weight 0.015 and never touches active weights; decay on an active-weighted factor emits a floor candidate version.

## ☑ WP19 — Registry integrity + ledger semantics + decay windows (bugs found in review)

- **R3a — id-clobber bug**: `addFactorCandidate` replaces any same-`factorId` entry wholesale (`factors.filter(item => item.factorId !== factorId)`), so an LLM proposal reusing an existing id can silently overwrite a shadow/active factor's state and history — a ground-rule-12 violation surface. Reject submissions whose `factorId` already exists in any non-`rejected` state (error names the conflict); rejected ids may be reused.
- **R3b — trial-ledger inflation**: `evaluateFactorRegistry` writes a ledger entry per factor per evaluation run (~20/run including "state observed only"), so the escalation hurdle rises with routine monitoring instead of with distinct hypotheses. Count a trial ONLY on (a) new candidate submission (human or LLM) and (b) first admission evaluation of a distinct spec hash; routine re-evaluations and decay monitoring log to `stateHistory`/audit, not the ledger. Migrate the existing inflated count with an append-only correction entry (record old count, new count, rule).
- **R3c — decay-window semantics**: current monitor uses full-sample pooled stats (`n ≥ 60 && rankIC ≤ 0 && avgExcessPct < 0`). Implement the spec: rolling window of the **trailing 60 usable outcomes**, demotion only after **2 consecutive** negative windows; add the redundancy check (|ρ| > 0.85 vs a higher-IC factor ⇒ retirement recommendation, needs the WP17 correlation machinery); auto-recovery stays.
- **R3d — originality correlation alignment**: fixed as part of WP17 (align score series on ticker+date); confirm the gate uses it.
- **Verify**: fixture — proposal reusing a shadow factor's id is rejected with the conflict named; ledger fixture — 3 evaluator runs over an unchanged registry add 0 trials; decay fixture — one bad window does not demote, two consecutive do; migration entry present and append-only.

## ☑ WP20 — Statistical refinements (after WP17/WP18 are producing evidence)

- **Within-horizon overlap**: `effectiveN` currently dedupes multi-horizon rows of one decision but not adjacent-day decisions whose T+20/T+60 windows share most of their path. Add calendar-based non-overlap subsampling per horizon (keep every ⌈horizon⌉-th decision date per ticker) as the t-stat basis, or Newey-West with lag = horizonDays as a labeled alternative; report both `effectiveN` variants with method labels.
- **`revisionMomentum` spec semantics**: once `analyst_revision_history` accrues rows, sanity-check `ref revisions.upgrades → delta 21` against hand-computed 30d revision breadth for 3 tickers; adjust the spec (not the whitelist) if the field mapping is off.
- **Hurdle formula re-check**: with R3b's honest trial counting, re-derive the escalation (base 3.0/3.5 + 0.1 per doubling beyond 8 trials) and document the current trial count in the report payload.
- **Verify**: both effectiveN variants visible with method labels and `effectiveN ≤ n` always; a hand-checked revision-breadth comparison recorded in the execution doc.

## Round-3 dependency notes

- WP17 → WP18 → (WP19 ∥ WP20-after-evidence). WP19's R3a/R3b can land any time (independent bug fixes) — if WP17 stalls on corpus/data issues, do WP19 first and log the blocker.
- Do not re-verify WP10–WP16 items; they are accepted. Round 3 must not change scoring semantics landed in WP11/WP12 (cross-sectional rank, shrinkage, sub-signal lists) — extend, don't rewrite.

---

# Round 4 — Runtime performance, security & operational reliability (WP21–WP24)

> Written: 2026-07-05 (Claude — whole-codebase deep review: bugs, performance, and settings/workflows that discount outcomes or hurt UX). All numbers below were **measured live** on the current build — do not re-derive, fix. Same ground rules 1–14.

**Measured facts driving this round** (evidence basis, 2026-07-05):
`store.json` = 110.4 MB pretty-printed; the identical content is **58.9 MB compact (47% waste)**. A full `JSON.stringify(store, null, 2)` costs ~325 ms and `structuredClone` of the store a comparable amount — both **synchronous on the event loop, executed on every `saveStore`**, plus `archiveRuns` rewrites every full run file (~60 MB of pretty JSON) on every save, plus the debounced SQLite mirror re-parses the full store in Python (**2.9 s**) per save. `/api/state` = **25.9 MB, uncompressed** (no gzip anywhere in `http_responses.mjs`), ~1.05 s server time per load. Store composition: collection `runs` 63.9 MB (biggest run 12.4 MB: stockNarratives 3.78 + socialHotStocks 3.18 + technicals 2.27), `allStockAgent.runs` 39.8 MB (24 retained agent runs × 1.64 MB of full evaluations), articleCache 6.3 MB. `server.listen(PORT)` binds **0.0.0.0**. `readBody` has **no size cap**. Scheduler catch-up window = 75 min with no on-start/on-wake makeup → the June-30→July-5 five-day data gap happened silently. The 1,000-date walk-forward blocked the event loop ~137 s (compute is in-process).

## ☑ WP21 — Security & transport (small, do first)

- **S1 — bind localhost by default**: `server.listen(PORT, process.env.HOST || "127.0.0.1")`. Rationale: the API currently exposes `.env` editing (`/api/config/env`), order-draft creation, and strategy promote to the whole LAN with zero auth — a direct violation of the roadmap's "local-only by default" principle. `HOST=0.0.0.0` remains an explicit opt-out; when non-loopback, log a startup warning and show a banner in the config center.
- **S2 — request body cap**: `readBody` (server/http_requests.mjs) must cap at 2 MB (configurable `MAX_REQUEST_BODY_BYTES`) and respond 413 beyond it; JSON parse failures return 400 with a structured error, never a crash.
- **S3 — gzip responses**: `sendJson`/static serving negotiate `Accept-Encoding` and gzip payloads > 64 KB (Node `zlib`). `/api/state` is 25.9 MB raw and JSON compresses ~8–10×; this is the single cheapest UX win in the repo.
- **Verify**: request from another interface refused by default; 3 MB POST → 413; `curl -H 'Accept-Encoding: gzip' /api/state` returns `Content-Encoding: gzip` with size < 4 MB; UI loads normally.

## ☑ WP22 — Save-path & store performance (the event-loop stalls)

Every store mutation currently costs: structuredClone(full store) + stringify-pretty(full store) + full-payload string compare + rewrite of all run archives + a 2.9 s Python full re-sync. With the watcher enabled (2-min ticks that call `saveStore` even when nothing fired) this repeats all day.

- **P1 — compact JSON**: write `JSON.stringify(payload)` (no indent) in `saveStore` AND `archiveRuns`. Immediate ~47% disk cut (110 → 59 MB) at zero risk; keep a `STORE_PRETTY_JSON=true` escape hatch for debugging.
- **P2 — stop retaining full payload strings**: replace `storeLastSavedPayload === payload` with a sha256 hash comparison (keep only the hash) — frees ~200 MB steady-state RSS.
- **P3 — incremental archives**: `archiveRuns` keeps an in-memory `Map<runId, contentHash>` and writes only new/changed runs, not all 20 per save.
- **P4 — dirty-aware watcher saves**: `runIntradayWatcherAndSave` skips `saveStore` when the tick produced no alerts, no consensus snapshots, and no state change.
- **P5 — slim retained payloads** (append-only trimming; never touch frozen decisions/outcomes):
  - collection runs: store at most 60 K-line bars per ticker inside a run's `technicals` (full series already lives in the caches); `stockNarratives` keep full text only in the latest 3 runs (older runs keep per-ticker one-line summaries); `socialHotStocks` deduped by post id within a run.
  - agent runs: full `evaluations` retained only for the latest 3 agent runs; older agent runs keep decision/candidate lists + summary (target: `allStockAgent` ≤ 12 MB).
- **P6 — incremental SQLite sync**: `sqlite_store_sync.py` accepts `--since <runId|timestamp>` and the debounced auto-sync passes the last-synced watermark, so a routine save re-syncs only the delta (full sync stays available via CLI/`/api/sqlite/sync`).
- **P7 — walk-forward off the event loop**: `runHistoricalWalkForwardFromRows` executes in a `worker_threads` Worker (or child `node` process with JSON hand-off); the HTTP handler awaits without blocking other requests. Verify by hitting `/api/run/status` every 2 s during a 500-date run — all responses < 500 ms.
- **Verify**: p95 `saveStore` wall time < 150 ms over 20 consecutive watcher-tick saves (log timing into `storePersistenceStatus`); store.json ≤ 60 MB after first compact save; archive mtimes show only changed runs rewritten; server responsive during a walk-forward.

## ☑ WP23 — Scheduler reliability & staleness honesty (the silent 5-day gap)

The system silently served June-30 data as "today's" content for five days. Freshness badges exist but nothing *acted* on staleness and nothing told the owner a run was missed.

- **W1 — startup/wake catch-up**: on server start and once per hour, if today is a NYSE trading day and the expected session's run (pre after 07:45+grace, post after 16:30+grace NY time) is missing, trigger the collection run (same-trading-day only — never backfill prior days as if fresh) and record `trigger:"catch-up"`. The 75-min `SCHEDULE_CATCH_UP_MINUTES` window stays for the normal tick; this is the safety net above it.
- **W2 — missed-run alerting**: when a scheduled session is detected as missed (not merely late), append an `alerts` entry + `audit_events` row, and if push (WP2) is configured, send one push. The Today desk shows a red "数据已过期 N 个交易日" banner when the newest run is older than 1 trading day (currently only a quiet freshness timestamp).
- **W3 — stale-source hard gate for the agent**: if the agent's source collection run is older than `AGENT_MAX_SOURCE_AGE_HOURS` (default 36), every buy auto-downgrades to research with explicit gate id `stale_source_run` (instead of relying on incidental `missing_price_or_data`), and the run summary says so. Outcome tracking of those research decisions continues — they are honest, labeled samples.
- **W4 — deadline-aware LLM budgets for scheduled runs**: pre-market runs must finish before the open. Scheduled (not manual) runs use a per-stage LLM ceiling (`SCHEDULE_LLM_STAGE_TIMEOUT_MS`, default 90 s; local fallback beyond) instead of the interactive `LLM_FULL_REPORT_TIMEOUT_MS=600 s` — a hung provider currently delays the morning report by 10+ minutes per stage.
- **Verify**: restart the server across a missed scheduled time → catch-up run fires with `trigger:"catch-up"` + alert row; simulate a 3-day-old newest run → red Today banner and agent downgrades all buys with `stale_source_run`; scheduled-run LLM stages observed ≤ 90 s in audit timings.

## ☑ WP24 — Sample-accrual guarantee (settings that starve the learning loop)

Even after WP1, live evidence shows **0 tracked buy decisions on recent runs**: every top scorer is either a held position (`allowAddToExisting=false` excludes it from `buyEligible` entirely) or stale-data-vetoed. Quiet/stale days produce zero outcome samples — the single biggest discount on the final outcome, because the learning loop cannot earn authority without samples.

- **A1 — always-track research fallback**: after normal buy selection, if tracked buy decisions < `MIN_TRACKED_DECISIONS_PER_RUN` (default 5), log the top-scoring remaining evaluations (by `actionScore`, requiring `dataQualityScore ≥ minDataQuality`, cooldown-respecting, positions included) as decisions with `actionable:false`, `status:"open"`, `trackingReason:"starvation-backfill"` — outcome-tracked, excluded from the paper book and Today's actionable list. Factor stats gain a `trackingReason` split so backfill samples are distinguishable (and excludable) in analysis.
- **A2 — held-position signal tracking**: `hasPosition` names skip `buyEligible` (correct for trading) but their *signals* are exactly as informative — A1's pool must include them (decision records carry `hasPosition:true`).
- **A3 — starvation telemetry**: run summary reports `trackedDecisions`, `starvationBackfill` count, and consecutive-zero days; ≥3 consecutive zero-tracked days raises an alert (through the W2 channel).
- **Verify**: run the agent against the current (stale) store → ≥5 tracked decisions exist with `trackingReason:"starvation-backfill"`, none in the paper book or actionable list; factor-stats view shows the split with `n`; regression fixture for the backfill selection.

## Round-4 dependency notes

- Order: **WP21 (hours) → WP22 → WP23 ∥ WP24.** WP22's P1/P2 must land before the intraday watcher is enabled for real (otherwise every 2-min tick pays the full save cost).
- WP22-P5 trimming must not touch `decisions`, `outcomeSnapshots`, `strategyVersions`, or anything frozen — display/derived payloads only. If a trim would lose data the UI still reads, keep the data and log the conflict.
- Round 4 deliberately contains **no scoring-semantics changes**; it is safe to interleave with Round 3.

---

# Round 5 — External integrations round 2 (WP25)

> Written: 2026-07-05 (Claude). Source scan + verdicts: [CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md](CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md) §11. All licenses/maintenance verified 2026-07-05. Same ground rules; every integration follows the bridge pattern (JSON in/out, timeout, diagnostics on failure, native fallback) and none touches scoring semantics.

## ☑ WP25 — Adopt the round-2 external set

- **25a — FinanceDatabase → sector/industry master (highest value).** Import JerBouma/FinanceDatabase (MIT, v2.3.0; static data files, no API key) into a `security_master_ext(ticker, name, sector, industry_group, industry, country, market_cap_bucket)` SQLite table via `scripts/finance_database_import.py` (one-shot + `--refresh`). Consumers: (1) historical walk-forward sector benchmark baskets — replace `sectorBasketStatus:"missing_sector_mapping"` with sector-ETF mapping (XLK/XLE/XLF/XLV/XLY/XLP/XLI/XLB/XLU/XLRE/XLC via sector name); (2) live benchmark baskets in `lib/recommender_core.mjs` fall back to it when Longbridge industry is missing; (3) peer-set generation gains an industry-group filter. **Verify**: ≥95% of the 45-ticker corpus resolves to a sector; WP4 re-run shows `sectorBenchmarkReturn` non-null; 3 spot-checks against known classifications.
- **25b — NYSE calendar validation via pandas-market-calendars.** `scripts/generate_market_calendar.py` (pip `pandas_market_calendars`, active 2026) emits `data/reference/nyse_calendar_2019_2028.json` (trading days + early closes). `lib/market_core.mjs` loads it when present and a regression fixture compares the hand-rolled calendar against it over the full range — **any divergence fails the test and the JSON wins**. Keeps the JS runtime dependency-free while insuring against silent holiday drift.
- **25c — FinanceToolkit formulas over our PIT data.** Replace WP7's "partial Piotroski / approximate Altman" with exact implementations ported from JerBouma/FinanceToolkit (MIT; transparent formula code). Two allowed shapes: port the formulas into `lib/historical_features.mjs` with attribution comments, or bridge into FinanceToolkit's calculation layer feeding **our `pit_fundamentals` rows** as external data. **Hard rule: no FinancialModelingPrep dependency** (its default data source; paid). Extend `edgar_pit_bridge.py` to pull the additional XBRL concepts the exact formulas need (current assets/liabilities, long-term debt, shares basic, CFO components). **Verify**: hand-checked F-score and Z-score for AAPL/JPM/TSLA against manually computed values from the same PIT rows.
- **25d — Debate persona upgrade from ai-hedge-fund prompts.** Port 4 persona checklists (Damodaran story+valuation discipline, Graham margin-of-safety, Munger quality/incentives, Burry contrarian/deep-value) from virattt/ai-hedge-fund (MIT, 60.8k★) into `harness/agents/` as additional markdown personas usable by the debate orchestrator (config-selected, default off). **Prompts and checklists only — none of its decision/order flow**; coordinator remains unable to override hard gates (ground rule 12). **Verify**: one manual debate run per persona produces schema-valid output with cited source IDs.
- **25e — (reference, no task) FinNLP source catalog.** AI4Finance/FinNLP is the consult-first catalog if we ever add news sources (Seeking Alpha/CNBC adapters etc.); no integration now — our collectors already cover the majority with better failure handling.
- **D16 (decision, executes with Phase 3.2, not now): portfolio-risk engine = Riskfolio-Lib** (BSD-3, v7.3.0 2026-06; 13 risk measures, HRP/HERC) via bridge; PyPortfolioOpt (MIT, active) as the simpler fallback. Recorded so Phase 3.2 starts with the engine question closed.

Order within WP25: 25a → 25b ∥ 25c → 25d. 25a unblocks a WP4 metric gap and should land first. Round 5 is independent of Rounds 3–4 and may interleave.

---

# Round 6 — Crash resilience, evidence integrity, trust closure (WP26–WP30)

> Written 2026-07-07 (Claude) after reviewing Rounds 3–5 (verdicts + findings F12–F16 in the execution log) and live-verifying on localhost:5173. Two inputs: defects found in review, and the strategic blind spots recorded in CAPABILITY_GAPS §12 (survivorship-biased corpus, never-exercised promotion path, unmeasured LLM channel, owner-side switches). Same ground rules as Rounds 1–5. Priority: **WP26 → WP27 → WP28 ∥ WP29 → WP30**; WP26/WP27 are P0 and block trusting any new evidence.

## ☑ WP26 — Memory architecture & crash resilience (P0 — the server died during review)

Facts (F12): with the default 2 GB Node heap, the server OOM-crashed 589 s into a catch-up collection. Stack: `saveStore()` → `cloneStoreValue(db)` → `structuredClone` of the entire store object graph on **every save**. This is also the leading root-cause hypothesis for the silent scheduler gap (OOM-killed scheduled runs leave no visible trace). Reviewer mitigation already in place: start with `NODE_OPTIONS=--max-old-space-size=6144`.

- **26a — remove the full-store clone from the save path.** `storeCache` must not be built by `structuredClone(db)` per save. Acceptable shapes: cache the already-produced compact payload string and lazily `JSON.parse` on the rare cache-read path; or drop `storeCache` and reload from disk on cache miss. Save semantics (sha256 skip-clean, atomic tmp+rename) unchanged.
- **26b — heap telemetry.** Record `process.memoryUsage().heapUsed/rss` and `v8.getHeapStatistics().heap_size_limit` in `storePersistenceStatus` on every save; append a high-severity alert when heapUsed > 70% of the limit.
- **26c — crash honesty.** Write `data/server.lock` (pid + startedAt) on boot, remove on clean shutdown (SIGINT/SIGTERM handlers). Lock present at startup ⇒ previous process died dirty ⇒ high-severity alert + `server.crash_detected` audit event. Document a launchd (macOS) auto-restart recipe in the README ops section.
- **26d — interim heap floor.** Start scripts/README document `NODE_OPTIONS=--max-old-space-size=6144` until 26a lands; remove the recommendation after verification.
- **26a′ — allocation forensics from the live review (2026-07-07/08, REQUIRED READING).** The machine has **8 GB RAM**; the store is ~50 MB compact JSON. Observed: OOM at the 2 GB default heap AND at a 6 GB heap (41 min into a collection, GC mark-compact pauses up to 151 s, mutator utilization 0.035). The three allocators to eliminate, all confirmed in code/live sample:
  1. `ensureStore()` returns `cloneStoreValue(...)` — a **full structuredClone of the store on every call** (server.mjs:3830/3886), including the 30-second scheduler tick and most request handlers.
  2. `saveStore()` clones the whole store again into `storeCache` per save (server.mjs:3932; caught live via `sample` inside `StructuredClone`).
  3. `archiveRuns()` (WP22-P3) compacts + stringifies **every** non-summary run on **every save** — the content-hash check happens *after* the stringify (server.mjs:3558-3559), so 20 runs × dozens of saves per collection ≈ multi-GB string churn. This is the June→July regression: June collections completed with the same store; WP22 added this per-save cost.
  Fix direction: single shared in-memory store object (no clone-on-read; callers already mutate-then-save), payload-string cache instead of graph clone, and archive only runs whose id/updated marker changed (track dirty run ids; never stringify to discover cleanliness). Interim env mitigations applied by the reviewer (remove after fix): `RUN_HISTORY_LIMIT=6 RUN_INLINE_FULL_LIMIT=3 RUN_ARCHIVE_ENABLED=false NODE_OPTIONS=--max-old-space-size=6144`; runs 7+ remain archived in `data/runs/` (24 files, 127 MB).
- **26e — absorb the F17 hotfix + kill the retry storm (added after live review).** WP23 shipped a scope bug: `scheduledLlmStageTimeoutMs` was declared inside `articleUrlParts()` instead of `runCollection()` — every collection since 2026-07-05 died at the analysis stage with a ReferenceError, the missed-run detector re-fired every 30 s (54 failed attempts in ~44 min), and `articleUrlParts()` silently returned null for all article URLs. The reviewer applied the 2-line hotfix (declaration moved to `runCollection()` top; utility restored) — absorb that working-tree diff. Then add: (1) a regression test that executes the scheduled-collection path with the LLM mocked, so scope errors in `runCollection` fail CI; (2) a catch-up retry guard — max 2 catch-up attempts per schedule key per day, then high-severity alert and stop.
- **Verify**: a full collection run completes with `--max-old-space-size=2048`; `storePersistenceStatus` shows heap fields; `kill -9` + restart produces the crash alert; no `structuredClone` of the whole store anywhere on the save path (grep).

## ☑ WP27 — Walk-forward benchmark integrity (P0 — "excess" can silently be raw return)

Facts (F13): universe = `SELECT DISTINCT ticker … ORDER BY ticker LIMIT maxTickers`; bars load only for that list, so capped runs never load SPY (alphabetical order). At `server/historical_backtest.mjs:1196` a missing benchmark degrades to `excess = raw − 0` unlabeled. Only literal `"SPY"` is excluded from the trading loop. The reviewer has loaded 12 sector-ETF bar sets (XLK/XLE/XLF/XLV/XLY/XLP/XLI/XLB/XLU/XLRE/XLC/SMH; corpus now 52,172 bars / 57 tickers) — sector baskets can now resolve, but **until this WP lands, uncapped runs would trade the ETFs and their metrics must not be used as evidence**.

- **27a — benchmark set isolation.** Define `BENCHMARK_TICKERS` (SPY, QQQ, the 11 SPDR XL* funds, SMH). Always load their bars in a dedicated query unaffected by `maxTickers`/ticker filters; exclude the whole set from the trading-universe loop *and* from cross-sectional normalization input.
- **27b — no silent benchmark fallback.** When basket/SPY benchmark return is null for an outcome: `benchmarkStatus:"missing_benchmark"`, `excessPct:null`, `outcomeUsable:false`. Metrics exclude such rows and report a `missingBenchmark` count. Never `excess = raw`.
- **27c — evidence re-run.** Re-run the full-corpus walk-forward after 27a/27b; the report must show `sectorBasketStatus` predominantly `sector_mapping_ok`, zero ETF tickers among decisions, and the missing-benchmark disclosure.
- **Verify**: capped run (`maxTickers:8`) has non-null SPY benchmark on every outcome; fixture proving missing-ETF-bars → `missing_benchmark`, not raw-as-excess; uncapped run decision list contains no `BENCHMARK_TICKERS` member.

## ☑ WP28 — Strategy-version single-active invariant (P1)

Facts (F14): two versions are simultaneously `status:"active", active:true` because `upsertStrategyVersion` inserts new active baselines (new skill hash) without demoting the old.

- Enforce exactly one active per `strategyType`: inserting an active sets the previous active's `activeTo`, `status:"superseded"`, and appends `stateHistory`. Startup migration repairs existing dual-active rows (newest stays active; older → superseded + `strategy_version.migrated` audit event). Regression fixture: upserting two actives leaves exactly one.
- **Verify**: after migration, `/api/strategy-versions` shows one active; agent decisions stamp that version id; fixture green.

## ☑ WP29 — Point-in-time universe corpus (P0 for evidence trust — kills survivorship bias)

The single biggest discount on every backtest number so far: the 45-ticker corpus is *today's watchlist* — stocks that already won. All excess metrics are upper bounds; the rankIC conclusions (including the momentum-reversal rationale behind the two-sleeve design) inherit the bias.

- **29a — membership table.** `universe_membership(ticker, added_at, removed_at, source, json)` from historical S&P 500 constituent-change data (e.g. the fja05680/sp500 GitHub dataset — verify its license file before vendoring; fallback: one-shot scrape of Wikipedia's S&P 500 change table). Import via `scripts/build_universe_membership.py`, provenance JSON alongside.
- **29b — bars backfill for historical members** 2019→present via Longbridge CLI (reuse the reviewer's pattern: values arrive as strings → coerce; `INSERT OR REPLACE`). Delisted/unfetchable tickers are recorded with `universe_coverage_status:"bars_unavailable"` — never silently dropped. Reports state "N of M point-in-time members have bars (x%)".
- **29c — `universeMode` in the walk-forward.** `"pit"` (candidates on signalDate = members on that date ∩ bars available) vs `"watchlist"` (current). Mode goes into run provenance. **Anti-fooling rule: PIT and watchlist metrics never appear in the same table without a mode column.**
- **29d — re-judge the evidence.** Re-run factor rankIC + horizon metrics under PIT mode; record the outcome as Decision **D17** in CAPABILITY_GAPS §9, explicitly re-evaluating the two-sleeve (short-horizon reversal) rationale. If momentum rankIC flips sign, flag the two-sleeve plan for revision — evidence and judgement only, no scoring-semantics change in this WP.
- **Verify**: membership spans 2019–2026 and matches the source's change events ≥95%; PIT report shows coverage + mode; D17 recorded with numbers.

## ☑ WP30 — Trust the loop: promotion drill, LLM scorecard, go-live status (P1)

- **30a — promotion fire-drill (sandboxed).** Copy the store; run a second server instance on a test port against the copy; take a real candidate version, attach a drill validation record (`source:"drill"`, clearly non-production), promote, verify active weights actually change agent scoring output, rollback, verify byte-identical restoration. Log everything in the execution doc. Production store untouched; drill artifacts never merged back. Closes the "promotion path has never actually run" gap (F16 / deferred WP8 gate).
- **30b — LLM knowledge-channel scorecard.** Every LLM-sourced veto/cap/knowledge application records a counterfactual snapshot (the mechanical decision absent the LLM input). As outcomes mature, a report cell aggregates: n, avg excess with vs. without, hit-rate delta; below n=20 it prints "insufficient evidence" (honestly). Measurement only — no behavior change. This decides whether the LLM channel earns its latency and cost.
- **30c — go-live/learning-loop status card.** Configuration page card listing learning-critical switches currently OFF (`INTRADAY_WATCHER_ENABLED`, `PUSH_PROVIDER`/`PUSH_TARGET`, `AGENT_DEBATE_DAILY_ENABLED`, `FACTOR_RESEARCHER_ENABLED`), plus per-channel samples accrued and estimated days-to-`minSamples` at the current accrual rate. Purpose: make the calendar bottleneck visible to the owner every day.
- **Verify**: drill log with before/after weight hashes and rollback proof; scorecard renders the insufficient-evidence state; status card reflects real env state.

## Round-6 dependency notes

- WP26/WP27 first — they protect process survival and evidence integrity; everything downstream is untrustworthy until they land.
- WP29b may run long (many tickers); it is data-only and can proceed in parallel with WP28/WP30 once WP27 is merged (do not run evidence backtests in the window where ETF bars exist but WP27 has not landed).
- No scoring-semantics changes anywhere in Round 6.

---

# Round 7 — Trader Mirror agent（操作画像）(WP31)

> Written 2026-07-07 (Claude) on owner request. Design rationale: CAPABILITY_GAPS §13. Independent of Round 6 and may interleave, but land WP26 (save path) first if both are in flight. Same ground rules; the constitution applies to the owner's profile exactly as to stock scoring: **deterministic numbers and tags, LLM narrative only.**

## WP31 — Trader Mirror: read the owner's operations, classify style, coach

**Status: [x] Completed 2026-07-09.** See `docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md` for verification output and disabled-by-default flags.

**Order: 31a → 31b → 31c ∥ 31e → 31d.** Reuse the existing trade stack (`sanitizeTrade`/`mergeTrades`, `calculateTradeJournal` closed lots, `/api/trade-recommendation-reconciliation`, IBKR Flex sync). Do not re-implement FIFO matching or journal performance splits.

- **31a — Longbridge fills ingestion.** New bridge using the verified CLI shape `longbridge order executions --history --start <watermark> --format json` (values may be strings — coerce, same as kline). Map fills → trade schema (`ticker` from `SYM.US`, `side`, `quantity`, `price`, `executedAt`, `broker:"longbridge"`, `externalId` = execution id, `orderId`), merge via `mergeTrades` (dedup on `externalId`). Watermark `db.tradeSync.longbridge.lastSyncAt` (start default 2019-01-01 on first run). Daily auto-sync after the post-session collection + `POST /api/trades/sync-longbridge` manual trigger + button in the trades UI. Fills for non-US markets are kept but flagged `market` so US-only analytics can filter. **Verify**: run against the owner's real account; imported count reported; re-running imports 0 duplicates; a hand-checked fill matches broker records exactly.
- **31b — behavioral metrics engine (deterministic).** `lib/trader_profile.mjs` exporting `buildTraderProfile({ closedLots, openLots, trades, bars, securityMaster, spyBars })` → `trader-profile-v1` JSON. Metric families (each cell `{value, n, status}`; `status:"insufficient_data"` when n < minSamples — overall round trips < 20, per-cohort < 8):
  - **Results** (reuse journal where present): win rate, profit factor, expectancy, avg win/loss, holding-day distribution, realized equity curve + max DD.
  - **Entry behavior**: chase rate (% of buys with entry ≥ 98% of trailing 20d high, from `historical_bars`); cohort outcomes chase vs pullback (entry ≤ 50th percentile of 20d range); average entry-day extension vs SMA20.
  - **Exit behavior**: disposition ratio (median holding days of losers ÷ winners); MFE capture (exit price ÷ max close between entry and exit); worst-decile loss share (stop discipline); revenge re-entry rate (re-buy same ticker ≤ 5 trading days after a closed loss).
  - **Sizing**: notional size CV; correlation of size vs subsequent lot return; max single-name share of total notional.
  - **Concentration/reactivity**: sector HHI via `security_master_ext`; trades-per-week; share of buys on days when SPY moved ≤ −1.5% or ≥ +1.5% (panic/FOMO reactivity).
  - **Counterfactuals**: per closed lot, alternative return if held +20 more trading days, and SPY over the same window; aggregates "sold-too-early %", "underperformed-SPY-while-held %".
  - **Style classifier (rule-based, versioned `styleSchema:"trader-style-v1"`)**: horizon (day <2d / swing 2–10d / position 10–60d / long >60d by median holding days), entry style (chaser if chase rate >40% / pullback if <20% / mixed), risk discipline (tight if worst-decile loss share <35% and MFE-capture >60% / loose otherwise / undisciplined if revenge rate >15%), diversification (concentrated if HHI top-quartile), turnover (high if >5 trades/week). Tags carry the metric ids + values they were derived from. **The LLM never assigns tags.**
  - **Verify**: fixture with a synthetic 30-lot ledger where every metric is hand-computed; insufficient-data fixture (5 lots → all styles `insufficient_data`); metrics carry `n` everywhere.
- **31c — system-overlap analysis.** Extend the reconciliation: follow-rate (owner trade matches an actionable recommendation same ticker/direction within ±2 trading days), outcome comparison followed vs owner-instinct cohorts, ignored-winner count (actionable recs not traded whose frozen outcome was a win). Output into the profile as `systemOverlap`. **Verify**: fixture with known matches; cohorts carry `n`.
- **31d — LLM narrator (opt-in).** `harness/agents/trader_mirror.md` (tier reasoning, `veto_power:false`, `output_schema: trader-mirror-report-v1`): inputs are the computed profile JSON **only**; outputs `{styleNarrative, habits[], resultsSummary, coachingInstructions[], disclaimers}` where every habit/instruction cites metric ids and instructions are if-then behavioral rules bound to cohort deltas (e.g. "chase entries (chaseRate n=14, avg −3.2%) lose vs your pullback entries (+1.8%, n=9) → require limit orders ≥2% below the 20d high"). No metric → no claim. Gated by `TRADER_MIRROR_LLM_ENABLED` (default false; trade data leaves the machine only with this consent); without it the deterministic profile still renders fully. `llmGovernance` stamp on the stored report. **Verify**: mock-invoker run produces schema-valid output with metric-id citations; disabled flag → profile renders with `narrative:null`.
- **31e — API/UI/persistence.** `GET /api/trader-profile` (cached compute), `POST /api/trader-profile/refresh` (sync fills → recompute → optional LLM). Store key `traderProfile` `{ current, snapshots[≤24], tradeSync }` (+ sqlite mirror table `trader_profile_snapshots`). UI 交易画像 card: style tags with evidence popovers, metric table with `n` badges, coaching list, overlap panel, explicit insufficient-data rendering, sync status/button. Weekly auto-refresh (Sunday) + on-demand. **Verify**: with the ledger empty the page shows the ingestion call-to-action, not fake zeros; after 31a sync, profile renders on real data; route inventory regenerated.

## Round-7 dependency notes

- 31b/31c consume `historical_bars` + `security_master_ext` — both already populated (52,172 bars / 57 tickers; 9,432 securities). Bars missing for a traded ticker ⇒ that lot's context metrics are `insufficient_data`, never fabricated.
- Counterfactual and entry-context metrics must use bars ≤ the relevant dates only (same PIT discipline as the walk-forward).
- No scoring-semantics changes; the profile must never feed factor weights or gates — it is a mirror for the human, not an input to the machine.

---

# Round 8 — Durability & self-diagnosis (WP32–WP33)

> Written 2026-07-09 (Claude) after the F18 incident (execution log) proved two structural weaknesses that are project-level, not just environment-level. Small round; independent of any pending Round 6–7 follow-ups.

## WP32 — Kill the giant-JSON write amplification (P1)

**Status: [x] Completed 2026-07-10.** See `docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md` WP32 section for implementation details and verification output.

Every save rewrites one ~50 MB `store.json`. Beyond the F12/F15 heap+latency costs (now mitigated), F18 showed the disk-level cost: dozens of full-file rewrites per day amplify into OS version-store/sync churn measured in tens of GB, and a single file is a single point of loss. Fix: **split persistence into per-section files** under `data/store/` — one file per top-level store key (`runs.json`, `allStockAgent.json`, `alerts.json`, …), each saved only when its section is dirty (track dirty keys at mutation sites or hash per section at save). Loader assembles the store from sections with a one-time migration from legacy `store.json` (keep it as `store.legacy.json` until first successful sectioned save; never delete it in the same run). Skip-clean, atomic tmp+rename, and the SQLite mirror stay as-is. **Verify**: a watcher tick that only touches `intradayWatcher` writes only that section (<1 MB) instead of 50 MB; total save p95 <100 ms; cold load produces an identical store object (deep-equal fixture against a legacy-format copy); crash between section writes leaves a loadable store (sections are independently valid JSON).

## WP33 — Repo/runtime integrity self-check (P2)

**Status: [x] Completed 2026-07-10.** See `docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md` WP33 section for implementation details and verification output.

F18 went undetected until the process died mid-import. Two cheap detectors:
- **33a — boot preflight**: before starting the HTTP listener, stat+open-read 1 byte from every first-party module in the import graph (`server/**/*.mjs`, `lib/*.mjs`) and the critical data files (`strategies/*.json`); on failure, print ONE clear line naming the unreadable file (and hint: iCloud eviction / permissions) and exit non-zero. Budget <200 ms.
- **33b — `scripts/verify_repo_integrity.mjs`**: compares working-tree files against `.git/index` blob SHAs (pure Node, no git binary needed — the reviewer's recovery used exactly this technique) and reports missing/dataless/modified files. Run it in the go-live status card (WP30c) as a daily "repo integrity" row.
- **33c — harness fail-fast**: when `AGENT_DEBATE_DAILY_ENABLED` / `FACTOR_RESEARCHER_ENABLED` / `TRADER_MIRROR_LLM_ENABLED` is on, preflight the `harness/` tree the same way before invoking Python; unreadable files → one structured diagnostic (`harness_unreadable` source status), never a raw ETIMEDOUT stack.
**Verify**: fixture with a chmod-000 module → preflight names it and exits cleanly; integrity script flags a deliberately truncated file; harness preflight downgrades gracefully with debates enabled and a file unreadable.

## WP33 addendum — 33d: SQLite writer contention in bridge scripts (found live 2026-07-09)

**Status: [x] Completed as part of WP33 on 2026-07-10.**

First `--backfill-bars` run against the production `data/market_pulse.sqlite` failed wholesale with `sqlite3.OperationalError: database is locked` — the server's mirror sync held the writer lock through the pre-market collection window, and `build_historical_bars.py` (and its callers) neither sets `PRAGMA busy_timeout` nor retries. All 646 members were marked `bars_unavailable` with zero rows written (the coverage labels were honest, which is how it was caught). Fix: (1) every bridge script that writes SQLite sets `busy_timeout >= 30000` on connect and retries the final metadata/coverage transaction; (2) `build_universe_membership.py` gains a `--merge-into <db>` mode formalizing the reviewer's workaround — backfill into an isolated working DB, then merge `historical_bars`/`universe_coverage_status` into the target in one short `ATTACH` transaction; (3) document in the script header that long backfills must not share a writer with a live server. **Verify**: backfill completes with the server running and mirror-sync active; zero `database is locked` in output; merge is atomic.

## WP33d addendum 2 — actual root cause of the backfill lock (hotfixed in review, absorb the diff)

**Status: [x] Completed as part of WP33 on 2026-07-10.**

The `database is locked` failures were **not** (primarily) server contention: `build_universe_membership.py` held an **uncommitted write transaction** (from `insert_membership`) while spawning `build_historical_bars.py` subprocesses against the same DB file — the parent deadlocked its own children, 100% failure both times, including against an isolated DB. Reviewer hotfix (in working tree): `conn.commit()` immediately after `insert_membership` with a comment. Codex: absorb the diff; keep the WP33d busy_timeout + `--merge-into` items (they are still correct hardening); add a regression-style smoke that runs `--limit-tickers 2 --backfill-bars` against a temp DB and asserts `coverage.bars_available == 2` — the original WP29 verification never exercised `--backfill-bars` end-to-end, which is how this shipped. `update_coverage_status` itself was correct (per-ticker bar-count check) — no change needed there.
