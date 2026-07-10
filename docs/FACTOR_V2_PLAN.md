# Factor V2 — Precision Audit, Enrichment, and LLM Auto-Discovery Loop

> Owner request (2026-07-05): "I doubt current factor is not precise. Enrich the initial factors in quantity and quality. Optimize the workflow so the LLM automatically finds new factors and removes bad ones. Search online for other improvements."
>
> Verified against live code on 2026-07-05: `lib/recommender_core.mjs`, `lib/historical_features.mjs`, `server.mjs` (factor scorers ≈ L20760–L21145, backtest stats ≈ L24070), `server/strategy_versions.mjs`, `server/historical_backtest.mjs`, `harness/agents/*`. Builds on WP1–WP9 (see `INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md`) and §2 of `CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md`.

**TL;DR.** The suspicion is correct: the 10 live factors are *heuristic point-scores with hand-tuned magic constants*, normalized against **static fake baselines instead of the actual cross-section**, rounded to coarse integers, and several award points for *data availability* rather than signal. Before adding factors, fix the measurement pipeline (Workstream A); then add ~15 new atomic factors from data that is already accruing (Workstream B); then close the loop with an **LLM factor-researcher agent that proposes declarative factor specs into a candidate → shadow → active → retired lifecycle**, where deterministic gates — never the LLM — decide promotion and retirement (Workstream C). Evaluation rigor upgrades (purged stats, multiple-testing ledger, decay monitor) come from published practice (Workstream D). The existing constitution is preserved: **no code path lets LLM output write factor scores, weights, gates, or skill JSON.**

---

## 1. Diagnosis — why the current factors are imprecise

Ten defects, each with evidence and the fix that Workstream A/B implements.

| # | Defect | Evidence | Why it hurts | Fix (workstream) |
|---|--------|----------|--------------|------------------|
| P1 | **Fake cross-sectional normalization.** `normalizeFactorValue` z-scores against `FACTOR_BASELINES` — hardcoded `{median≈50, mad≈15}` constants — because `allStockAgentPeerGroup` (`server.mjs:20798`) never supplies a real `median`/`mad`. The `"peer-median-mad"` branch is dead in live runs. | `lib/recommender_core.mjs:350-408` | Factor scores are the heuristic scores lightly re-scaled, not a ranking of today's universe. A day when every ticker's momentum reads 60 should be neutral; today it reads bullish across the board. Cross-sectional rank is the single highest-leverage precision fix. | A1 |
| P2 | **Coarse integer scores.** Every scorer does `clampScore(Math.round(score))` (`server.mjs:20761`, `recommender_core.mjs:394`); rankIC is then computed on 0–100 ints. | ties everywhere in `rankCorrelation` inputs | Massive tie-clumps at 50 destroy rank resolution; measured rankIC is biased toward 0, so the weight learner starves. | A1 |
| P3 | **Composite factors hide sub-signals.** `momentum` mixes SMA10/SMA20 distance, 5d return, RSI, and a text-matched trend label via an unweighted `average()` (`server.mjs:20818-20855`). Same pattern in most scorers. | one score per family; no per-component stats | If RSI is noise and SMA distance is signal, the composite dilutes it and the learning loop can only judge the blend. Nothing can ever tell *which* sub-signal works. | A2 |
| P4 | **Unvalidated magic constants.** `priceVsSma10Pct * 2.2`, `revenueGrowth * 0.55`, `capitalFlow / 1_000_000` (a fixed $1M scale regardless of market cap or ADV), `marketRisk * 0.62`, etc. | throughout `server.mjs:20818-21087` | Constants encode untested beliefs; the flow constant makes `optionsFlow` saturate on mega-caps and read noise on small-caps. | A2/A3 |
| P5 | **Availability bias — points for having data, not for signal.** `optionsFlow` +6 for `contractCount > 0`; `socialAttention` +8 for `hasReason`; `earningsRevision` +5 for an EPS estimate existing. | `server.mjs:21014-21087` | Well-covered mega-caps get systematically higher scores independent of any signal → size bias contaminates every downstream stat. | A3 |
| P6 | **`earningsRevision` measures a level, not a revision.** It scores today's buy/sell rating *distribution* — a static level — despite WP7 having created `analyst_revision_history` and `sue_history` accrual tables precisely to hold the deltas. | `server.mjs:20912-20938` | Revision *breadth/direction change* is the documented signal (PEAD/estimate-momentum literature); a static buy-ratio level is mostly size+coverage bias. | B1 |
| P7 | **`newsCatalyst` counts headlines with no recency decay** (`positives*8 − negatives*10`), and is structurally correlated with `socialAttention` and `momentum` (movers generate chatter). The correlation matrix exists only in the historical backtest (`server/historical_backtest.mjs:357`), not live. | `server.mjs:20940-20977` | Triple-counts one bet; a 6-day-old article scores like a 2-hour-old one. | A4, D3 |
| P8 | **Missing factor = neutral 50 at full weight.** `scoreRecommendationFromFactorSnapshot` uses `score ?? 50` per factor; quality only discounts the *total* via `dataQualityMultiplier`. | `recommender_core.mjs:443-466` | A factor with quality 0 still moves relative rankings (50 ≠ cross-section mean), and per-factor confidence is ignored where it matters. | A3 |
| P9 | **Winsorization is backtest-only.** `winsorizeSeries` is applied to historical outcome returns; live factor snapshots never pass through `winsorizeFactorSnapshots` (exported but unused in the live path). | `server/historical_backtest.mjs:304`; no call site in `server.mjs` | One bad print (the GDC incident) still distorts live scores and live-outcome factorStats. | A1 |
| P10 | **Pooled-horizon, pooled-regime learning.** `allStockAgentBacktestFactorStats` pools all horizons into one rankIC per factor (`server.mjs:24070-24112`); overlapping outcome windows inflate the effective sample count; regime tags exist but the learner ignores them. | `server.mjs:24070`, `recommender_core.mjs:95` | News factors look weak because T+60 outcomes dilute them; slow factors look weak at T+1; t-stats are overstated by overlap. | A5, D1 |

**Bottom line:** the learning machinery (rankIC stats, capped learner, strategy-version governance) is sound, but it is being fed low-resolution, biased inputs. Fixing measurement multiplies the value of every sample already accruing.

---

## 2. Workstream A — precision: make the existing 10 factors measure what they claim

### A1. Real cross-sectional normalization (highest leverage, do first)

- In `buildFactorSnapshotForRun` (`server.mjs:21140`), compute all heuristic raw scores for the run's universe **first**, then normalize each factor **within the run cross-section**: winsorize raw values at 1/99 pct (`winsorizeFactorSnapshots` — already written, currently unused), then rank-normalize to a continuous score (`percentileRank → 100·p`), falling back to the current static baselines only when the cross-section is `< 30` names.
- Keep a continuous `score` (float, not `Math.round`) and keep `heuristicScore` for display/audit. All rankIC/learning reads the float.
- Sub-universe option: normalize within `sizeBucket` when the bucket has ≥ 30 names, to stop size leakage.
- **Acceptance:** live snapshot `normalization.method` reads `"cross-sectional-rank"` for ≥ 90% of factors on a normal run; a fixture proves a uniform +10 shift across the whole universe leaves scores unchanged; tie-fraction at score=50 drops below 5%.

### A2. Sub-factor decomposition — atomic signals, tracked individually

- Split each composite scorer into named sub-signals, e.g. `momentum.smaDistance`, `momentum.return5d`, `momentum.rsiBand`, `momentum.trendLabel`; `qualityGrowth.revenueGrowth`, `.netMargin`, `.roe`, `.accruals` (WP7 raw fields promoted to sub-signals); etc.
- Snapshot schema `factor-snapshot-v2`: `factors[id].subSignals[{id, raw, score, quality}]`. Composite score = equal-weighted sub-signals until a sub-signal has ≥ 50 samples, then **IC-weighted** (weights ∝ max(0, rolling rankIC), renormalized) — computed mechanically, same governance as factor weights.
- `allStockAgentBacktestFactorStats` gains a sub-signal level: rankIC per sub-signal per horizon. This is what makes "remove bad ones" possible at the granularity where bad actually lives (e.g. kill `rsiBand`, keep `smaDistance`).
- **Acceptance:** track-record view shows per-sub-signal IC with `n`; at least one sub-signal demonstrably reweighted or zeroed on evidence, recorded in a strategy-version changelog.

### A3. Kill availability bias; per-factor confidence shrinkage

- Remove all "+N because data exists" terms (P5 list). Missing input ⇒ sub-signal `score=null`, never a bonus.
- Effective score used by the aggregator: `50 + (score − 50) · shrink(quality)` with `shrink = quality/100` (linear, simple, auditable) — a quality-0 factor becomes exactly neutral instead of pseudo-informative. Replaces the blunt total-level `dataQualityMultiplier` double-count for per-factor gaps (keep the total multiplier for overall-coverage discounting, halved in strength).
- Normalize flow-type raw inputs by scale: `capitalFlow / avgDollarVolume20d` instead of `/1M`; options counts by ADV bucket.
- **Acceptance:** regression fixture — two identical tickers, one missing options data, must produce identical `optionsFlow` contribution of 0 for the missing one; size-decile mean-score spread shrinks measurably on a live run.

### A4. `newsCatalyst` recency + de-crowding

- Exponential recency decay on storyline materiality (half-life ~36h; catalysts are fast per §2.1.4 horizon logic).
- Live cross-factor Spearman matrix each run (reuse `historical_backtest.mjs:357` code path), persisted to the run payload; flag |ρ| > 0.6 pairs in the UI.
- Optional (behind flag): residualize `socialAttention` on `momentum` + `newsCatalyst` cross-sectionally, so it only carries *incremental* attention.
- **Acceptance:** correlation matrix visible in track-record UI with live data; flagged pairs listed with values.

### A5. Per-horizon factor profiles

- Compute rankIC per factor per horizon (T+1/T+5/T+20/T+60) from the same outcome rows (they already carry `horizonDays`); persist as `factorHorizonProfile`.
- The weight learner keeps pooling for now (samples are thin) but the report shows the profile, and the two-sleeve split (roadmap §3.1) consumes it later.
- **Acceptance:** every factor row in the report shows IC per horizon with `n` per cell; no cell without its `n`.

---

## 3. Workstream B — quantity: new factors from data already accruing

Rule unchanged from the capability-gaps doc: **every new factor enters as `candidate`, is excluded from actionable influence until it passes gates, and can be killed by the same evidence.** Ranked by value ÷ effort; all free-tier feasible; sources already integrated unless noted.

| Priority | Factor (atomic) | Definition | Source (existing) | Notes |
|---|---|---|---|---|
| B1 | `revisionMomentum` | 30d/90d change in buy-ratio and consensus EPS; % analysts revising up − down | `analyst_revision_history` (WP7, accruing) | Replaces the hollow half of `earningsRevision` (P6) |
| B1 | `sueScore` / `peadDrift` | standardized unexpected earnings; post-earnings drift window flag | `sue_history` + 8-K/actuals (WP6/WP7) | WP7 removed the post-earnings blackout precisely to allow PEAD entries |
| B2 | `shortInterestDelta`, `daysToCover` | Δ short interest 2-week; SI/ADV | `short_interest_history` (WP7) | delta, not level — level is already in `smartMoney` |
| B2 | `ivRank`, `ivRvSpread`, `putCallRatio`, `termSlope` | from accruing IV history (post-B2 fix) | `options_snapshots` | were impossible before the `iv_atm` fix; now accruing daily |
| B3 | `residualMomentum` | 60d return residual vs SPY+sector ETF beta | `historical_bars` + benchmark baskets (`buildBenchmarkBasket`) | de-crowds `momentum` from pure beta |
| B3 | `week52HighProximity` | close / 252d max | `historical_bars` | classic anchoring signal, trivial to compute |
| B3 | `shortTermReversal` | −(5d return) sleeve-gated to T+1..T+5 | `historical_bars` | needs horizon sleeves (A5) to avoid fighting momentum |
| B3 | `idioVol`, `maxDailyReturn21d` | idiosyncratic vol; MAX effect (lottery preference, negative sign) | `historical_bars` | low-vol/MAX anomalies; also good risk gates |
| B3 | `amihudIlliquidity` | avg(|ret|/dollar volume, 21d) | `historical_bars` | replaces the coarse liquidity bucket as a real factor |
| B4 | `overnightGapBias` | cumulative overnight vs intraday return split, 21d | `historical_bars` (needs open) | open price already stored |
| B4 | `netShareIssuance` | YoY diluted share change | `pit_fundamentals` (WP6/WP7 diluted shares) | dilution signal, sign negative |
| B4 | `grossProfitability` | gross profit / assets (Novy-Marx) | `pit_fundamentals` | needs `gross_profit`+`assets` facts — already extracted |
| B4 | `assetGrowth` | YoY total assets (negative sign) | `pit_fundamentals` | needs 2 periods of PIT history |
| B5 | `insiderClusterBuy` | ≥2 distinct insider buys within 30d | Form 4 via edgartools (WP6) | cluster, not single trade |
| B5 | `institutionalBreadthDelta` | Δ # of 13F holders QoQ | 13F (currently filing-level only — blocker noted in WP6) | unblocks when 13F table expansion lands |

Also promote the WP7 earnings-quality raw fields (`accrualsRatio`, `cashConversion`, `piotroskiPartial`, `altmanZApprox`) from buried `raw` payload entries to first-class sub-signals of `qualityGrowth` (they currently influence historical scoring only).

**Target end-state: ~10 factor families × 2–5 atomic sub-signals ≈ 35–45 tracked signals**, each with its own IC ledger — quantity through decomposition and new atomics, not through more hand-tuned composites.

---

## 4. Workstream C — the LLM factor discovery & removal loop

The core ask: *"LLM automatically finds new factors and removes bad ones."* Design principle, consistent with the existing LLM write-boundary (`llmGovernance`): **the LLM proposes and explains; deterministic code evaluates and decides; humans promote.** The LLM never emits executable code and never touches live scores.

### C1. Factor lifecycle state machine (mechanical)

```
candidate ──(historical gates pass)──▶ shadow ──(live gates pass)──▶ active
    │                                    │                             │
    └──(fails / expires 90d)──▶ rejected └──(fails)──▶ rejected        ├──(decay monitor)──▶ decayed ──▶ shadow (re-prove) or retired
                                                                       └──(redundancy |ρ|>0.85 vs stronger factor)──▶ retired
```

- **candidate**: spec exists, evaluated only on the historical corpus (WP3/WP4 machinery + alphalens bridge).
- **shadow**: computed in every live run, present in `factorSnapshot` with `weight = 0`, accrues live outcomes/IC. Zero influence on decisions. (Same trick as WP2's shadow gates.)
- **active**: enters the weight vector at a token weight (0.01–0.02) via a **candidate strategy version** → existing `validate`/`promote`/`rollback` API (WP8). Promotion remains a human action.
- **decayed/retired**: set by the decay monitor (C4). Retirement also goes through a strategy version (weight → 0), so it is rollback-able and changelogged.

Persist as a `factor_registry` store key + SQLite table: `{factorId, family, spec, hypothesis, state, trialCount, createdBy: "llm:factor_researcher"|"human", stateHistory[], evidence{}}`.

### C2. Declarative factor spec DSL (the safety boundary)

LLM output is **data, not code** — a JSON spec compiled and executed by a trusted evaluator:

```json
{
  "schemaVersion": "factor-spec-v1",
  "id": "overnight_gap_bias_21d",
  "family": "microstructure",
  "hypothesis": "Persistent negative overnight/intraday split indicates institutional distribution; expect underperformance at T+5..T+20.",
  "expectedSign": -1,
  "horizons": [5, 20],
  "inputs": ["bars.open", "bars.close", "bars.volume"],
  "pipeline": [
    {"op": "overnight_return"},
    {"op": "ts_sum", "window": 21},
    {"op": "cs_rank"}
  ]
}
```

- **Operator whitelist** (~20 ops): `ref/delta/ts_mean/ts_std/ts_sum/ts_rank/ts_max/ts_min/ts_corr`, `cs_rank/cs_zscore`, `add/sub/mul/div/log/abs/sign/clip`, domain ops (`overnight_return`, `dollar_volume`). Same shape as Qlib's expression engine, restricted. Evaluator lives in `lib/factor_spec.mjs`, pure functions over the WP3 data catalog (`historical_bars`, `pit_fundamentals`, `historical_regimes`, the WP7 accrual tables, `options_snapshots`).
- **Input catalog is explicit**: the agent is prompted with the exact list of available columns + their PIT semantics; specs referencing unknown inputs are rejected at parse time.
- **Complexity cap** (AlphaAgent-style regularization): ≤ 8 pipeline steps, ≤ 3 window parameters, windows from a fixed menu {5,10,21,63,126,252} — throttles overfit-by-construction and keeps factors interpretable.
- **Originality check**: normalized-spec similarity (op-sequence edit distance) vs all registry specs, plus evaluated-score correlation vs existing factors; near-duplicates rejected before burning a trial.

### C3. `factor_researcher` harness agent (proposes; also writes post-mortems)

New agent `harness/agents/factor_researcher.md`, same format/discipline as `review_attributor.md` (tier: reasoning, tool-limited, output-schema'd, `veto_power: false`):

- **Inputs (tools):** `get_factor_performance_report` (per-factor/sub-signal IC × horizon × regime with `n`, correlation matrix, coverage, decay flags), `get_factor_registry` (specs + states + past rejections, so it stops re-proposing), `get_lessons` (review_attributor memories), `get_data_catalog`.
- **Output (`factor-proposal-v1`):** 1–3 proposals per cycle, each = spec + hypothesis + expected sign/horizon + a *novelty argument* referencing the correlation matrix ("fills the low-|ρ| gap vs momentum/newsCatalyst") + which weak factor it is meant to replace, if any.
- **Cadence:** weekly (not nightly — each proposal burns a multiple-testing trial, see D2), triggered from the daily-loop scheduler after the Sunday run; also on-demand via `POST /api/factors/research`.
- **Removal side:** the agent does **not** remove anything. When the decay monitor (C4) demotes/retires a factor, the agent is invoked to write the post-mortem (`factor-postmortem-v1`: what the hypothesis was, what the evidence showed, transferable lesson → episodic memory). Symmetric with review_attributor's role for trades.

### C4. Mechanical gates (evaluate + remove) — the part the LLM never touches

**Admission gates** (candidate → shadow), run by a nightly evaluator job over the historical corpus:

1. Historical rankIC, correct sign, with **overlap-aware t-stat ≥ 3.0** (factor-zoo hurdle, not 2.0), on non-overlapping outcome windows or Newey-West-adjusted.
2. Sign consistency: same IC sign in ≥ 2 of 3 regime buckets and in adjacent horizons (anti best-cell selection, per capability-gaps §4.4).
3. Orthogonality: |ρ| < 0.6 vs every active/shadow factor score series.
4. Coverage: computable for ≥ 60% of the live universe.
5. Multiple-testing ledger (D2) consulted — the threshold tightens as `trialCount` grows.

**Live gates** (shadow → promotable): ≥ 50 live outcome samples, live rankIC sign matches historical, live |ρ| checks hold. Emits a candidate strategy version; human promotes via the existing WP8 endpoint.

**Decay monitor** (active → decayed/retired), nightly:

- Rolling rankIC over the trailing 60 usable outcomes per factor/sub-signal; demote to `decayed` (weight floored to minimum via candidate strategy version) after 2 consecutive windows with IC ≤ 0 **and** cumulative contribution negative; flag `redundant` when |ρ| > 0.85 with a factor of higher IC.
- `decayed` factors keep accruing in shadow; recover automatically if the next 60-sample window turns positive (regime-driven dips shouldn't kill structurally sound factors — this is the anti-whipsaw guard).
- Every transition = audit event + registry stateHistory entry + LLM post-mortem.

### C5. Workflow integration

- Extend the daily loop: post-run nightly job = evaluator (gates + decay monitor + correlation matrix + performance report persist); weekly job = factor_researcher proposal cycle.
- New routes: `GET /api/factors/registry`, `GET /api/factors/performance-report`, `POST /api/factors/research`, `POST /api/factors/candidates/:id/advance` (human override, audited).
- UI: factor lifecycle board (candidate/shadow/active/decayed columns, IC sparkline + `n` per card) in the track-record view.

---

## 5. Workstream D — evaluation-rigor upgrades (from external research)

1. **Overlap-aware statistics.** Outcomes at T+20/T+60 from adjacent days share paths; current pooled `samples` overstate independence. Use non-overlapping windows per horizon for t-stats, or Newey-West/HAC correction; report *effective* n. (Purged/embargoed CV, López de Prado; CPCV is the stretch goal for walk-forward windows.)
2. **Multiple-testing ledger.** Persist a global `trialCount` — every candidate ever evaluated (LLM- or human-proposed) increments it; admission t-stat hurdle starts at 3.0 and derives from the deflated-Sharpe/DSR logic as trials grow. This is the single most important guard once an LLM can generate candidates cheaply: without it the loop *will* mine noise.
3. **Live correlation matrix + factor quantile spreads** in every report (top-minus-bottom quintile excess per factor) — alphalens bridge (WP5) already computes these for historical data; wire live.
4. **Borrowed from LLM-alpha-mining literature** ([AlphaAgent](https://arxiv.org/abs/2502.16789), [RD-Agent(Q)](https://arxiv.org/html/2505.15155v2), [QuantaAlpha](https://arxiv.org/html/2602.07085v1)): hypothesis-first proposals (every spec must state a falsifiable economic rationale — enforced by schema), originality regularization vs the existing factor library, complexity caps, and eval-feedback loops (rejected-candidate evidence is fed back into the next proposal cycle's context). These papers report that unregularized LLM mining converges to crowded, fast-decaying, homogeneous factors — C2's caps and C4's ledger are the defense.
5. **Seed library, don't just generate.** Before any generative mining, backfill candidates from the published, interpretable sets — the remaining [Qlib Alpha158](https://qlib.readthedocs.io/en/latest/component/data.html) features (subset already in `alpha158Subset`, `lib/historical_features.mjs:102`) and the simpler [WorldQuant 101](https://arxiv.org/pdf/1601.00991) price-volume alphas expressible in the DSL. Known factors with literature priors need less multiple-testing penalty than de-novo generated ones; tag registry entries `prior: "literature" | "generated"` and let the admission threshold differ (3.0 vs 3.5).

---

## 6. Execution plan

| WP | Scope | Depends on | Acceptance criteria |
|----|-------|-----------|---------------------|
| **WP-F1** | A1 + A3: cross-sectional rank normalization (winsorized, float scores), remove availability bonuses, per-factor quality shrinkage | — | Uniform-shift fixture passes; `method:"cross-sectional-rank"` ≥ 90% of live factors; missing-data ticker fixture contributes exactly 0; tie-fraction < 5% |
| **WP-F2** | A2 + A4 + A5: sub-signal decomposition (`factor-snapshot-v2`), per-sub-signal + per-horizon IC stats, live correlation matrix, news recency decay | F1 | Track-record shows sub-signal IC with `n`; correlation matrix live; every stat cell carries `n`; regression tests green |
| **WP-F3** | Factor spec DSL + evaluator (`lib/factor_spec.mjs`) + factor registry (store + SQLite + routes) + B1/B2 factors implemented *as specs* (revisionMomentum, SUE/PEAD, shortInterestDelta, IV family) | F1; WP7 tables accruing | Spec evaluator refuses non-whitelisted ops & unknown inputs (poisoned-spec fixture); B1/B2 factors run as candidates over the historical corpus; registry API renders |
| **WP-F4** | Admission gates + decay monitor + multiple-testing ledger + shadow computation in live runs; B3 price-volume factors seeded from literature | F3; WP3/WP4 corpus | A seeded factor provably walks candidate→shadow with gate evidence attached; a deliberately-noise spec is rejected with its trial recorded; decay fixture demotes then auto-recovers a factor |
| **WP-F5** | `factor_researcher` agent + proposal/post-mortem cycle + weekly scheduling + lifecycle UI board | F4; harness invoker | Agent proposes ≥ 1 valid spec end-to-end into candidate state without human edit; on a forced demotion, post-mortem lesson lands in memory; LLM-governance stamp still truthful (no LLM write path to scores/weights) |
| **WP-F6** | D1 overlap-aware stats everywhere; IC-weighted sub-signal composites go live behind strategy-version governance; B4/B5 factors as PIT history deepens | F2, F4 | Reported effective-n < raw n where windows overlap; at least one composite reweighted on evidence via candidate strategy version |

Sequencing rationale: F1/F2 first because every later gate consumes IC statistics — gates built on today's biased, tie-clumped scores would admit and kill the wrong factors. The LLM loop (F5) lands last because it is only as good as the evaluator beneath it.

## 7. Risks & guardrails

- **LLM-mined noise / crowding** → trial ledger with rising hurdle (D2), complexity+originality caps (C2), hypothesis-first schema, literature-vs-generated priors (D5).
- **Auto-removal whipsaw** → decay demotes to shadow (reversible, keeps accruing), never hard-deletes; auto-recovery path; every transition via strategy version = rollback-able.
- **Lookahead in candidate evaluation** → specs evaluate only through `buildFactorSnapshotAsOf`-style PIT paths; poisoned-future-data fixture required per spec-evaluator release (same discipline as WP3).
- **Governance drift** → the constitution stands: LLM output → specs/narratives/lessons only; weights move only through candidate strategy versions; promotion stays human. `llmGovernance` stamp must remain truthful in every new payload.
- **Sample starvation** (10 factors → 40+ signals splits the same outcomes) → sub-signals share their family's outcome rows (they're columns over the same samples, not new samples needed); shadow factors accrue from day one; historical corpus carries admission so live samples are only needed for confirmation.

## 8. Sources

- [AlphaAgent: LLM-Driven Alpha Mining with Regularized Exploration to Counteract Alpha Decay (KDD 2025)](https://arxiv.org/abs/2502.16789) · [GitHub](https://github.com/RndmVariableQ/AlphaAgent)
- [R&D-Agent(Q): Multi-Agent Framework for Data-Centric Factors and Model Joint Optimization (Microsoft)](https://arxiv.org/html/2505.15155v2)
- [QuantaAlpha: An Evolutionary Framework for LLM-Driven Alpha Mining](https://arxiv.org/html/2602.07085v1) · [GitHub](https://github.com/QuantaAlpha/QuantaAlpha)
- [Navigating the Alpha Jungle: LLM-Powered MCTS for Formulaic Factor Mining](https://arxiv.org/pdf/2505.11122)
- [101 Formulaic Alphas (WorldQuant)](https://arxiv.org/pdf/1601.00991)
- [Qlib data/expression engine & Alpha158/Alpha360](https://qlib.readthedocs.io/en/latest/component/data.html)
- [The Deflated Sharpe Ratio (Bailey & López de Prado)](https://www.researchgate.net/publication/286121118_The_Deflated_Sharpe_Ratio_Correcting_for_Selection_Bias_Backtest_Overfitting_and_Non-Normality)
- [Time-variation, multiple testing, and the factor zoo](https://www.sciencedirect.com/science/article/abs/pii/S1057521922003441)
- [Backtest overfitting & CPCV comparison](https://papers.ssrn.com/sol3/Delivery.cfm/SSRN_ID4686376_code4361537.pdf?abstractid=4686376&mirid=1)
