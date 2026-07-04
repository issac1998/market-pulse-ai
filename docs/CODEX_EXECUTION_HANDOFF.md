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

## ☐ WP12 — Sub-signal decomposition, live correlation matrix, horizon profiles, news decay (plan §2 A2+A4+A5; fixes P3/P7/P10-partial)

- `factors[id].subSignals[{id, label, raw, score, quality}]` (append-only on `factor-snapshot-v2`), each sub-signal scored through the same cross-sectional path. Binding decomposition: `momentum{smaDistance, return5d, rsiBand, trendLabel}`; `qualityGrowth{revenueGrowth, netMargin, roe, leverage, accrualsRatio, cashConversion}` (promotes the WP7 raw fields); `valuationExpectation{targetUpside, reverseDcfGap, peLevel}`; `earningsRevision{ratingLevel}` (revisionDelta arrives in WP13); `newsCatalyst{positiveMateriality, negativeMateriality, bodyEvidence}`; `optionsFlow{unusualCount, ivRankLevel, flowRatio}`; `smartMoney{insiderBias, holderBias, shortRiskLevel}`; `socialAttention{mentions, mentionDelta}`; `industryChain{relativeChange, downstreamChange}`; `macroRegime` stays atomic. Composite = mean of non-null sub-signal scores; all-null ⇒ factor quality 0 (neutral via shrinkage).
- Extend factor stats (live + historical through a shared helper — parity): per sub-signal rankIC/hitRate/`n`, and per horizon bucket `{1,3,5,10,20,60}` at both factor and sub-signal level (`factorStats[id].horizons`, `.subSignals`).
- **Live cross-factor Spearman matrix**: extract the historical matrix code (historical_backtest.mjs:357) into a shared helper; compute per live run over the day's snapshots; persist `factorCorrelationMatrix` in the run payload; render in the track-record view; flag |ρ| > 0.6 pairs.
- **News recency decay**: storyline materiality weighted by `2^(−ageHours/36)` from publishedAt; missing timestamp ⇒ weight 0.5.
- Implement IC-weighted sub-signal composites (weights ∝ max(0, rolling rankIC), ≥50 samples per sub-signal, renormalized) but ship **disabled**: `SUBSIGNAL_IC_WEIGHTING_ENABLED=false`; activation only via WP16 strategy version.
- **Verify**: track-record shows per-sub-signal IC with `n`; live correlation matrix renders with values and `n`; decay + all-null-composite fixtures green; every new stat cell carries `n`; route inventory regenerated.

## ☐ WP13 — Factor spec DSL, registry, B1/B2 factors as specs (plan §4 C1–C2, §3 B1/B2)

- **`lib/factor_spec.mjs`** — `parseFactorSpec(json)` and `evaluateFactorSpec(spec, dataset, {asOf})`, pure functions. Operator whitelist (exact, closed): `ref, delta, ts_mean, ts_std, ts_sum, ts_rank, ts_max, ts_min, ts_corr, cs_rank, cs_zscore, add, sub, mul, div, log, abs, sign, clip, overnight_return, dollar_volume`. Windows only from `{5,10,21,63,126,252}`. ≤8 pipeline steps, ≤3 windowed ops. Unknown op/input ⇒ parse error listing valid options. Dataset contract: `{bars, pit, revisions, shortInterest, ivHistory, consensus}`; the evaluator itself filters rows to `≤ asOf` (poisoned-future fixture required, same discipline as WP3).
- **Registry**: store key `factorRegistry` (`factor-registry-v1`): `{trialLedger:{count, entries[]}, factors:[{factorId, family, spec, hypothesis, expectedSign, horizons, prior:"literature"|"generated", state, createdBy, stateHistory[], evidence{}}]}`; states `candidate|shadow|active|decayed|retired|rejected`; `stateHistory` append-only. SQLite mirror tables `factor_registry`, `factor_trial_ledger` in `scripts/sqlite_store_sync.py`.
- **Routes**: `GET /api/factors/registry`; `GET /api/factors/performance-report` (per factor/sub-signal IC × horizon × regime, correlation matrix, coverage, lifecycle states — this is the payload the WP15 agent will read); `POST /api/factors/candidates` (human spec submission through parse + originality gates); `POST /api/factors/candidates/:id/advance` (human override; writes `audit_events`).
- **Originality gate** (runs on every submission, human or LLM): op-sequence similarity ≥0.8 vs any existing spec ⇒ reject; evaluated score-series |ρ| > 0.9 vs any existing factor over the corpus ⇒ reject. Rejections recorded in the registry (so WP15 can show the agent its failures).
- **B1/B2 factors registered as `candidate` specs** (`prior:"literature"`): `revisionMomentum` (30d Δ buy-ratio + 90d Δ consensus EPS from `analyst_revision_history`), `sueScore` (from `sue_history`), `shortInterestDelta` + `daysToCover` (from `short_interest_history`), `ivRank252`, `ivRvSpread` (iv_atm − annualized `ts_std(returns,21)`), `putCallRatio` (from `options_snapshots`). Accrual tables that are still empty ⇒ evaluation status `insufficient-data`, honestly reported — do not fabricate. Where the DSL genuinely cannot express a factor, contradiction protocol: register with `implementation:"native"` + a native evaluator function; never silently extend the operator whitelist.
- **Verify**: poisoned-future and unknown-op fixtures; registry APIs render; each B1/B2 candidate has either corpus evaluation evidence or an explicit `insufficient-data` status; route inventory regenerated.

## ☐ WP14 — Admission gates, decay monitor, trial ledger, live shadow, B3 seeds (plan §4 C4, §5 D1–D2)

- **Evaluator job**: nightly when `FACTOR_EVALUATOR_ENABLED=true` (default **false**, owner flips) + manual `POST /api/factors/evaluate`. Runs: admission gates over the historical corpus, decay monitor over live stats, correlation refresh, performance-report persist.
- **Admission gates (candidate → shadow)**, all mechanical: (1) rankIC with correct `expectedSign`, t-stat from **non-overlapping outcome windows per horizon**, hurdle ≥3.0 for `prior:"literature"`, ≥3.5 for `"generated"`, escalating +0.1 per doubling of `trialLedger.count` beyond 8; (2) same IC sign in ≥2 of 3 regime buckets AND in the horizons adjacent to the target (needs WP10 F11); (3) |ρ| < 0.6 vs every active/shadow factor; (4) computable for ≥60% of the live universe. Every evaluation writes a trial-ledger entry first (ground rule 13).
- **Shadow in live runs**: registry `shadow` factors are evaluated each live run (dataset assembled from run context + accrual tables) and inserted into `factorSnapshot.factors` with `lifecycleState:"shadow"` — absent from the weights map (zero decision influence by construction), present in outcome accrual and factorStats.
- **Promotion (shadow → active)**: ≥50 usable live outcomes, live IC sign matches historical, |ρ| checks hold ⇒ emit a **candidate strategy version** with the new factor at weight 0.015 (existing normalization redistributes; step caps apply) → human `promote` via the WP8 API. No auto-promotion path may exist.
- **Decay monitor (active → decayed/retired)**: rolling window of the trailing 60 usable outcomes per factor and sub-signal; demote to `decayed` after 2 consecutive windows with rankIC ≤ 0 AND negative cumulative weighted contribution — weight floored to 0.005 via candidate strategy version; `redundant` flag when |ρ| > 0.85 with a higher-IC factor ⇒ retirement recommendation. Auto-recovery: a decayed factor whose next 60-outcome window turns IC-positive returns to the promotable list. Every transition ⇒ registry stateHistory + `audit_events` + (if weights touched) strategy version.
- **B3 seeds** registered as `prior:"literature"` specs: `residualMomentum` (60d return residual vs SPY+sector basket), `week52HighProximity`, `shortTermReversal` (−return5d, horizons [1,5]), `idioVol21`, `maxDailyReturn21`, `amihudIlliquidity21`, `overnightGapBias21`.
- **Verify**: one seeded factor walks candidate→shadow with gate evidence stored in `evidence{}`; a deliberate noise spec is rejected AND its trial recorded; decay fixture demotes then auto-recovers; grep-verifiable: no code path changes weights without a candidate strategy version; `llmGovernance` stamp still truthful.

## ☐ WP15 — factor_researcher agent, post-mortems, lifecycle UI (plan §4 C3)

- **`harness/agents/factor_researcher.md`** in the exact `review_attributor.md` format (tier `reasoning`, `veto_power: false`, `max_steps: 6`, output_schema `factor-proposal-v1`). Tools: `get_factor_performance_report`, `get_factor_registry` (includes past rejections — the agent must not re-propose them), `get_data_catalog`, `get_lessons`. Prompt requirements: hypothesis-first (falsifiable economic rationale mandatory), 1–3 proposals per cycle, each with a novelty argument referencing the correlation matrix and naming the weak factor it replaces (if any); numbers only from tool results.
- **Ingest path** (mirror of `agent_harness_ingest` pattern): proposals → parse gate → originality gate → registry `candidate` with `createdBy:"llm:factor_researcher"`, `prior:"generated"`. `FACTOR_RESEARCHER_ENABLED=false` default; weekly schedule when enabled; manual `POST /api/factors/research`.
- **Post-mortems**: on every demotion/retirement the agent is invoked with the factor's history → `factor-postmortem-v1` (hypothesis, what the evidence showed, transferable lesson) → episodic memory + registry entry. The agent never executes removals (ground rule 12).
- **UI**: factor lifecycle board (candidate/shadow/active/decayed/retired columns; per-card IC sparkline + `n` + gate evidence expandable) on the ops/track-record page.
- **Verify**: end-to-end cycle with the mock invoker (`harness/invoker/mock.py`) lands a valid registry candidate without human edit; a forced demotion produces a post-mortem lesson in memory; no LLM write path to scores/weights/states (review will grep).

## ☐ WP16 — Overlap-aware stats everywhere, IC-weighted composites live, B4/B5 (plan §5 D1, §3 B4/B5)

- Replace pooled-sample t-stats in **all** factorStats surfaces (live, historical, report) with non-overlapping effective-`n` (report `effectiveN` alongside raw `n`); Newey-West adjustment acceptable as a labeled alternative.
- Flip IC-weighted sub-signal composites on — ONLY via a candidate strategy version through the WP8 promote flow; record the reweighting in the changelog.
- B4/B5 specs as PIT/13F depth allows: `netShareIssuance`, `grossProfitability`, `assetGrowth` (need ≥2 PIT periods), `insiderClusterBuy` (Form 4, ≥2 distinct insiders / 30d), `institutionalBreadthDelta` (blocked while 13F sync is filing-level-only — contradiction protocol if still true).
- **Verify**: `effectiveN < n` wherever horizons overlap; at least one composite reweighted on evidence with the strategy-version changelog entry; blocked items recorded, not faked.

## Round-2 dependency notes

- WP10 first (F9/F11 poison all gate math). WP11 → WP12 strictly ordered. WP13 can start in parallel with WP12 (touches different files). WP14 needs WP10+WP11+WP13. WP15 needs WP14. WP16 needs WP12+WP14.
- Sequencing rationale (from the plan): measurement fixes before the LLM loop — gates built on tie-clumped, biased scores would admit and kill the wrong factors.
