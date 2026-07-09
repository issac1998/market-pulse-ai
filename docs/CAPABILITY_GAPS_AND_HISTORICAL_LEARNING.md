# Capability Gaps & Historical Learning Plan

> Written: 2026-07-05 (updated same day: execution model, backtest report spec, external references)
> Author: Claude (review opinion, follow-up to [INVESTMENT_ASSISTANT_ROADMAP_FINAL.md](INVESTMENT_ASSISTANT_ROADMAP_FINAL.md))
> Execution model: **Codex implements, Claude reviews** — work packages and review gates in §6.
> Scope: (1) what abilities are still missing for **first-time detection** of important news / large value moves; (2) what is missing for **advanced-strategy stock analysis** — factor quantity *and* quality; (3) whether the strategy can be **run on past data** to accrue learning samples faster, and how to do it safely; (4) the required **historical backtest report** (factor weights + profit/drawdown/all meaningful metrics, LLM-narrated) in §7; (5) which **open-source quant projects** to borrow from (abu / qlib / alphalens / quantstats / vectorbt) in §8.
> Verified against live code/data on 2026-07-05: `stockHistory` spans ~2026-06-02 → 2026-06-30 (≈1 month, 213 tickers, in-sample universe); AkShare bridge already serves ~1,500 daily bars (~6 years) per ticker; `runAllStockAgentBacktest` and the `factorStatsSource="stockHistory-backtest"` fallback already exist.

**TL;DR.** Today the system is a *batch research station* (3 scheduled runs/day) with 10 broad factors of uneven quality. First-time detection needs an **event-driven fast lane** (intraday watcher + EDGAR polling + LLM-free triage + instant push) — all buildable on data sources already integrated. The factor set needs **history accrual and engineering rigor before headcount**: fix the two accrual bugs, add the earnings-quality family, and add orthogonality/winsorization controls before adding more factors. And yes, the strategy **can partially run on past data** — a reduced-factor walk-forward over 5+ years is feasible and valuable, but backtest samples must inform priors and pruning, never directly overwrite live-learned weights.

---

## 0. Preconditions: two bugs block everything downstream

Both found in the 2026-07-04 review of commit `d110f7c`. Every section below assumes they are fixed first.

| # | Bug | Why it blocks this plan | Fix direction |
|---|---|---|---|
| B1 | The ≤3 actionable cap is applied to the **frozen decision log** (`decisions = buyDecisions(≤3) + sells` in `runAllStockAgentForRun`); downgraded-but-eligible names become watch-buys, which `allStockAgentDecisionTracksOutcome` excludes | Factor×horizon×regime stats accrue at ~⅓ the intended rate; several cells will never reach `minSamples`. No factor-quality judgment is possible without samples | Log up to `buyLimit` (10) outcome-tracked decisions with `actionable: true/false`; only actionable ones feed the paper book and "today's calls" |
| B2 | `options_snapshots.iv_atm` is NULL on every row (sync reads `option.ivAtm`, a field that does not exist in the run payload) | The IV-history accrual — the input for IV rank, IV-RV spread, term-structure factors — is running empty; every day is unrecoverable | Extract ATM IV from the chain payload's real fields (or compute via the existing BS-IV bisection in `lib/finance_math.mjs`) at sync time |

Also carry forward: quarantine outcomes with absurd prices (the GDC +19,059% row) behind an `outcomeQualityStatus` field so track-record aggregates stop being poisoned.

---

## 1. Goal 1 — catch important news / large moves at the first moment

### 1.1 What is missing

The system today is blind between the 07:45 / 16:30 / 17:05 runs (plus one fixed-time intraday alert). "First time" requires an always-on loop with a fast, LLM-free reflex arc:

```
detect (seconds)  →  triage (rules, <1s)  →  push (seconds)  →  enrich (LLM, async, minutes)
```

The current pipeline inverts this: it enriches first (extract → translate → summarize, minutes and LLM-provider-dependent) and surfaces later. Both paths should coexist: the fast lane never waits for the slow lane.

### 1.2 What to do and how

**W1. Intraday watcher loop (highest value).**
- New module `server/intraday_watcher.mjs`, started by the scheduler during NYSE regular+extended hours, interval 60–300 s (env `INTRADAY_WATCHER_INTERVAL_MS`).
- Universe: watchlist + open positions + today's buy/watch candidates (bounded, ~50–100 names).
- Data: reuse the IBKR socket bridge (`scripts/ibkr_gateway_bridge.py`) for streaming quotes; Finnhub/Yahoo quote fallback per existing provider ladder.
- Signals (all deterministic, computed from data already available):
  - price move vs ATR(14) z-score (gap and intraday drift separately);
  - volume pace vs same-time-of-day 20-day baseline;
  - spread blowout / quote staleness (also a data-quality alarm);
  - new 52-week high/low crossing, halt detection via quote gap heuristics.
- Output: `alerts` entries with fingerprint dedup (the alerts array + fingerprint field already exist), plus an `audit_events` row per firing.

**W2. Real-time SEC feed.**
- Poll EDGAR full-text/RSS every 1–2 min for watchlist CIKs (EDGAR is free and near-real-time). New collector `collectEdgarRealtime` reusing the existing EDGAR fetch stack.
- 8-K item codes are a free materiality taxonomy — map item → severity (e.g. 1.01/2.02/5.02/8.01 high; 7.01/9.01 low) in a static table. 13D/G and Form 4 cluster-buys are first-class triggers.

**W3. LLM-free triage rules.**
- `lib/alert_triage.mjs` (pure functions, unit-testable): severity = f(move z-score, volume pace, 8-K item, headline keyword class, earnings-day flag, position/watchlist membership).
- Keyword classes for headlines (halt, guidance cut/raise, offering, FDA, M&A, investigation, index add/delete) — bilingual patterns, no LLM call.
- Never let triage call an LLM; the fast lane must work when every provider is in cooldown (the antigravity latency incident is the cautionary tale).

**W4. Instant push channel.**
- `server/push_delivery.mjs`: Bark / Telegram bot / ntfy webhook (env-selected, all free). Email stays for digests; push is for severity ≥ threshold only, with per-ticker cooldown to avoid spam.
- Acceptance: a simulated 8-K or ±5% move on a watchlist name produces a phone notification in < 2 minutes, with zero LLM calls on the critical path.

**W5. Move→reason reverse pipeline.**
- Today `moversWithReasons` joins already-collected news on a schedule. Add the inverse: when the watcher fires, immediately run a *targeted* mini-collection for that one ticker (news + EDGAR + social mentions), then queue LLM enrichment async. Endpoint `POST /api/intraday/explain {ticker}` reusing existing per-ticker collectors.
- The push message links to this explanation; the explanation arrives minutes later and updates in place.

**W6. Novelty detection.**
- "First time" = new information, not re-circulated stories. Add a seen-claims cache: story fingerprint = normalized headline shingles + ticker + catalyst class. A story that matches an existing fingerprint within N days is "update", not "new" — different push severity. Builds on the planned story clustering (roadmap P1.1).

**W7. Anticipation calendar.**
- Being first is easier when the drop time is known. Extend the event calendar beyond earnings: FOMC/CPI/PCE dates (static yearly lists), OPEX, index rebalance dates, lockup expirations (from S-1/424B filings), biotech PDUFA dates (free trackers). Pre-position: the watcher tightens intervals around scheduled events for affected names.
- Snapshot consensus EPS/revenue the day before each watchlist earnings report (from the existing Longbridge research pack) so the surprise can be computed the moment actuals print — this also starts the SUE history accrual (§2.2).

**Honest limits.** Millisecond news latency, OPRA time-and-sales, and dark-pool prints are paid-data territory. The achievable free-tier goal is *reaction quality within 1–5 minutes*, which is sufficient for a personal research workflow — say so in the UI rather than pretending otherwise.

---

## 2. Goal 2 — factor completeness: quality before quantity

### 2.1 Engineering quality (do this before adding factors)

1. **Sample flow** — fix B1; otherwise no factor can ever be validated or killed on evidence.
2. **Winsorization** — clip factor raw inputs and outcome returns at cross-sectional percentiles (e.g. 1/99) before normalization; one bad print (GDC) currently can distort both scoring and stats. Implement in `lib/recommender_core.mjs` normalization path.
3. **Orthogonality monitor** — nightly cross-factor Spearman correlation matrix over the day's snapshots, persisted per run and rendered in the track-record view. Flag pairs with |ρ| > 0.6 (expected offenders: momentum × newsCatalyst × socialAttention — movers generate chatter). Until then, adding factors mostly double-counts one bet.
4. **Per-factor horizon profiles** — with T+1…T+60 outcomes accruing, compute rankIC per factor per horizon; assign each factor a decay profile. News catalysts should stop influencing T+60-oriented judgments and vice versa. This is the data foundation for the sleeve split (§3.1).
5. **PIT discipline** — fundamentals restate; revisions must be event-dated. When the historical layer (§4) lands, factor builders must accept an `asOf` and refuse to read later-dated inputs.

### 2.2 Missing factor families (ranked by value ÷ effort, all free-tier feasible)

| Family | Inputs | Source | Effort | Note |
|---|---|---|---|---|
| **Earnings quality / forensic** | accruals ratio, cash conversion, Piotroski F, Altman Z, share dilution trend | already-collected fundamentals + EDGAR XBRL | Low | Highest value-per-hour of any new factor; pure computation |
| **SUE / post-earnings drift** | actual vs pre-report consensus snapshot, drift window | consensus snapshots (W7) + earnings calendar | Low-mid | Accrual starts only when snapshots start — begin now; conflicts with the current ±2d earnings blackout, which must become pre-earnings-only to allow PEAD entries |
| **Revision breadth** | % analysts revising up vs down, 30/90d | Longbridge ratings history (already collected) diffed over time | Mid | Turns the currently hollow `earningsRevision` factor into a real one |
| **Short-interest dynamics** | days-to-cover trend, borrow-fee direction | existing research-pack short interest, accrued as history | Low | Display-only today; the *trend* is the signal, so accrual is the work |
| **Volatility structure** | IV rank, IV−RV spread, term-structure slope | `options_snapshots` accrual | Blocked by B2 | ~3–6 months of accrual before usable |
| **Liquidity / microstructure** | Amihud illiquidity, turnover, spread | already computed for display | Low | Score it; also a natural veto input |
| **Ownership / flow** | 13F holdings deltas, index membership changes | EDGAR 13F (free, quarterly), index change announcements | Mid | Upgrades `smartMoney` beyond Form 4 |

Every new factor enters at a token weight, is excluded from actionable influence until rankIC ≥ threshold over ≥50 samples, and can be killed by the same evidence — same constitution as everything else.

### 2.3 Input-quality upgrades that raise *existing* factor quality

- `industryChain`: still a keyword heuristic (live test: 15/15 NVDA relationships "inferred"). Do roadmap P1.4 properly — curated per-industry templates + source-cited extraction, cached per ticker.
- `newsCatalyst`: catalyst taxonomy + corroboration count (how many independent sources) as a quality multiplier.
- Earnings-call transcripts: still zero ingestion; guidance extraction from post-earnings news bodies is the honest fallback (roadmap P1.5).
- `optionsFlow`: keep weight low until B2's accrual matures; without time-and-sales it stays context, never trigger.

---

## 3. Advanced strategy layer

1. **Two-sleeve split (the single biggest structural upgrade).** Separate a short-horizon event/technical sleeve (T+1–5: momentum, catalyst, SUE, liquidity) from a fundamental sleeve (T+20–60: quality, valuation, revisions, ownership). Each sleeve has its own weights, thresholds, outcome horizons, and track record. The current single blended score serving T+1 through T+60 dilutes both. Implementation: `sleeve` field on skill rules + per-sleeve scoring pass in `lib/recommender_core.mjs`; decisions carry `sleeve`; stats split by it.
2. **Event strategies as first-class rule sets**: PEAD, insider-cluster buy, 8-K-item plays, index add/delete. Each is a small deterministic rule set with its own frozen decisions and track record — the architecture already supports this shape.
3. **Position sizing & portfolio construction** (roadmap Phase 3): vol-target sizing, correlation/concentration caps from actual IBKR positions. Note the exposure-threshold gate shipped in `d110f7c` is currently inert (exposure can't exceed its own trigger); wire it to IBKR net liquidation when this lands.
4. **ML challenger, safely**: a gradient-boosted *rank* model trained on the same frozen snapshots, run in shadow, promoted only if it beats the linear weights walk-forward across ≥2 regimes — identical governance ladder to the debate gate. Never a replacement for the interpretable path, always a challenger to it.

---

## 4. Historical learning: can the strategy run on past data?

**Yes — partially, and it is worth doing.** But be precise about what it buys and what it cannot.

### 4.1 What already exists (Tier 0)

`runAllStockAgentBacktest` replays the skill over `stockHistory` snapshots, and factor stats already fall back to `factorStatsSource="stockHistory-backtest"` when live samples are thin. Limits: history starts ~2026-06-02 (≈1 month), covers only ~213 watched/discovered tickers (survivorship + selection bias), and one month is one regime. Useful smoke test; not a learning corpus.

### 4.2 Which factors can be reconstructed historically

The honest split — this determines everything:

| Reconstructable (Tier 1–2) | Source, free | Not faithfully reconstructable |
|---|---|---|
| momentum / technical | daily OHLCV: AkShare bridge already returns ~1,500 bars (~6y); Finnhub/Yahoo/Alpha Vantage as fallbacks | socialAttention (no historical ApeWisdom/Reddit heat) |
| macroRegime | FRED is fully historical | optionsFlow (no free historical chains) |
| qualityGrowth, valuation | EDGAR XBRL company facts = free **point-in-time** fundamentals (filing-dated, restatement-safe) | newsCatalyst (only proxies: 8-K events, GDELT headlines — different animal from the live pipeline) |
| SUE / earnings events | historical actuals + estimate archives (partial); 8-K 2.02 dates from EDGAR | smartMoney beyond 13F/Form 4 (both are actually historical & free — partially reconstructable) |
| liquidity | from OHLCV + shares outstanding | intraday anything |

So a **reduced-factor backtest** covering roughly 5–6 of the 10 factors is feasible over 5+ years. Those happen to be the highest-weight factors (momentum ≈0.176, qualityGrowth ≈0.175, valuation ≈0.134), so the coverage is meaningful, not token.

### 4.3 What historical samples are worth — and the trap

The big win is **regime coverage**: live accrual will take years to see a bear market; 2020–2025 daily data contains several regimes immediately, and regime-split factor validation is exactly what the live loop cannot provide soon.

The trap is treating backtest samples as exchangeable with live samples. They are not: reconstructed snapshots lack 4 factors, use proxy news, and are vulnerable to subtle lookahead. **Governance rule: backtest evidence sets priors and kills factors; live evidence adopts weights.** Concretely:

1. Backtest-derived stats stay in separate rows (`factorStatsSource` already distinguishes them; keep it that way in every view — never blend counts).
2. Use historical results to (a) **prune**: a factor with ~0 rankIC over 5 years × 3 regimes gets its weight floored — that decision needs no live samples; (b) **bound**: set per-factor weight ranges the live learner may move within; (c) **validate candidates**: the Phase-2 walk-forward gate for candidate strategy versions runs on this corpus.
3. Live weight adoption keeps its own sample gates (`minSamples`, step caps). Historical evidence never directly writes the live skill.
4. Multiple-testing discipline: 10 factors × 6 horizons × 4 regimes over one historical period will produce spurious winners; require sign-consistency across regimes and adjacent horizons, not best-cell selection.

### 4.4 How to build it (Tier 1 → Tier 3)

**Tier 1 — price/macro corpus (~1–2 weeks of part-time work, do first).**
- `scripts/build_historical_bars.py`: bulk-fetch daily OHLCV for a defined universe into a new `historical_bars(ticker, date, o/h/l/c/v, source)` SQLite table. Universe: current S&P 500 + Nasdaq 100 + the ~213 known tickers, with the survivorship caveat recorded in the corpus metadata (delisted names are the known gap; add them opportunistically from EDGAR filing lists).
- FRED history → `historical_regimes(date, bucket, riskScore)` via the existing `scoreFredMacroRegime` logic.
- Historical snapshot builder: a `buildFactorSnapshotAsOf(ticker, date)` that computes the reconstructable factors **through the same normalization/scoring path** (`scoreRecommendationFromFactorSnapshot` in `lib/recommender_core.mjs`) with absent factors at neutral-50 + `missingReason:"not-reconstructable"` — the data-quality multiplier then honestly discounts, exactly as live. Backtest/live parity through shared code is non-negotiable; a parallel reimplementation would invalidate the whole exercise.
- Walk-forward runner: extend `runAllStockAgentBacktest` to source from `historical_bars` (env/option switch), generating frozen pseudo-decisions (`decisionSource:"historical-backtest"`) and outcomes vs SPY/sector baskets across T+1…T+60, tagged with historical regime.
- Expected yield: thousands of decision-outcome samples across ≥3 regimes vs ~19 live outcomes today.

**Tier 2 — PIT fundamentals (+2–3 weeks).** EDGAR XBRL company-facts ingestion keyed by *filing date* (not period date) → qualityGrowth/valuation/earnings-quality factors as-of any historical day; 8-K 2.02 + historical actuals → SUE/PEAD validation.

**Tier 3 — news proxies (optional, labeled).** GDELT headlines + 8-K items as catalyst proxies, clearly flagged `proxy:true`; never claim they validate the live news pipeline. Social and options are honestly skipped.

**Acceptance criteria.** Every historical stat row carries `source=historical`, universe id, and regime; the track-record UI shows live and historical in separate panels with separate sample counts; at least one factor weight decision (a floor or a bound) is made from Tier-1 evidence and recorded in a strategy-version changelog with the supporting numbers.

---

## 5. Priority order

1. **B1 + B2 bug fixes** (§0) — unblocks live accrual and IV history. Days, not weeks.
2. **Intraday watcher fast lane** (§1: W1→W4 first, W5–W7 after) — delivers the "first time" goal with existing data sources.
3. **Consensus-snapshot accrual before earnings** (W7/SUE) — another cannot-backfill clock; one day of work.
4. **Earnings-quality factor family + winsorization + correlation monitor** (§2) — quality before quantity.
5. **Tier-1 historical corpus + walk-forward** (§4.4) — the sample-quantity answer, feeding the Phase-2 validation gate.
6. **Two-sleeve split** (§3.1) — once per-factor horizon profiles exist from steps 1+5.
7. Tier-2 PIT fundamentals, event strategies, ML shadow challenger — after the above prove out.

The through-line: **every improvement here either starts an unrecoverable clock (accruals) or increases the evidence rate (samples) — which is why bug fixes and accrual starts outrank every feature.**

---

## 6. Execution model: Codex implements, Claude reviews

Division of labor agreed 2026-07-05. Codex writes the code as discrete work packages; each package is reviewed (code + live behavior on `localhost:5173`) before the next one starts. A package is **not done** when `node --check` passes — it is done when its review gate passes.

### 6.1 Work packages

| WP | Content | Spec | Review gate (what Claude verifies live) |
|---|---|---|---|
| **WP1** | Fix B1 (decision-log starvation) + B2 (NULL `iv_atm`) + GDC-style outcome quarantine (`outcomeQualityStatus`) | §0 | Next agent run logs up to 10 outcome-tracked decisions with `actionable` flags (≤3 actionable); `options_snapshots` rows carry finite `iv_atm`; track-record averages exclude quarantined outcomes and show the exclusion count |
| **WP2** | Intraday watcher fast lane: W1 watcher loop + W3 LLM-free triage + W4 push; then W2 EDGAR polling, W5 move→reason, W6 novelty, W7 anticipation calendar | §1 | Simulated ±5% move / 8-K on a watchlist name → push in <2 min with **zero LLM calls on the critical path** (verified from audit_events timing); triage unit tests pass; no watcher call inside the LLM provider stack |
| **WP3** | Tier-1 historical corpus: `historical_bars` + `historical_regimes` tables, bulk fetch scripts, `buildFactorSnapshotAsOf` through the **shared** scoring path | §4.4 | Spot-check 5 tickers × 3 dates against provider data; snapshot builder provably refuses post-`asOf` inputs (fixture test with poisoned future data); absent factors carry `missingReason:"not-reconstructable"` |
| **WP4** | Historical walk-forward + **backtest report** (candidate factor weights + full metrics + LLM narrative) | §7 | Metrics reproduce from frozen pseudo-decisions independently (I recompute a sample offline); weights come from the mechanical learner only; report renders with sample counts on every number; regime splits present |
| **WP5** | Python metrics/factor-analysis bridges (quantstats + alphalens-reloaded per §9 D1/D2/D9), integrated as report generators | §7, §9 | Tearsheet numbers match WP4's own metrics within tolerance; bridge failures degrade to native metrics, never block the report; report states its metrics engine (D10) |
| **WP6** | edgartools integration (§9 D3): PIT fundamentals bridge (filing-date-keyed XBRL), 13F holdings deltas → `smartMoney` upgrade, watcher real-time filings feed (W2) | §4.4 Tier 2, §9 | PIT spot-check: a restated quarter returns the *originally filed* value for pre-restatement `asOf` dates; 13F deltas match EDGAR web for 2 sampled funds; watcher receives a new 8-K within one poll interval |

Sequencing: WP1 → (WP2 ∥ WP3) → WP4 → WP5 → WP6. WP2 and WP3 are independent and can interleave. Technical choices inside WP3–WP6 are fixed by the §9 decision record — Codex implements as written and flags contradictions in the execution log instead of substituting.

### 6.2 Standing review checklist (applies to every WP)

1. **LLM write-boundary**: no code path lets LLM output reach `factorSnapshot.factors[*].score`, gates, weights, or skill JSON. (`llmGovernance` stamp stays truthful.)
2. **Parity**: any historical/backtest scoring goes through `lib/recommender_core.mjs` — a parallel scoring implementation is an automatic reject.
3. **Frozen-record immutability**: no retroactive mutation of decisions/outcomes; corrections append.
4. **Sample-count honesty**: no metric surfaced without `n`; backtest-sourced stats never blend into live-sourced rows.
5. **Failure surfacing**: no empty catches; provider failures land in diagnostics/audit_events.
6. **Safety flags**: no broker order paths; double-lock untouched; watcher/push respect enable flags and cooldowns.
7. **Tests**: `node --check`, `core_regression_tests.mjs`, harness unittest, plus the WP's own fixtures, all green before review starts.

---

## 7. Historical backtest report: required outputs

Requirement (owner, 2026-07-05): the historical run must output **the factor weights and the profit / drawdown / all meaningful metrics on past data**, in a readable report.

Division of labor inside the report — stated once, applied everywhere: **the mechanical learner computes the weights; the statistics compute the metrics; the LLM writes the narrative that explains them.** The LLM's output is the *report prose*, never the numbers inside it.

### 7.1 Factor-weight outputs

| Output | How it is computed | Status in report |
|---|---|---|
| **Candidate weights per walk-forward window** | The existing capped differential learner (`learnRecommendationFactorWeights`) run over historical frozen outcomes, same `minSamples`/step caps | The headline weight recommendation; becomes a candidate `strategy_version` eligible for the Phase-2 adoption gate |
| **Reference weights (unconstrained)** | Cross-sectional rank regression / rankIC-proportional fit over the full corpus | Labeled `reference-only` — shows where the constrained learner is being conservative; **never** eligible for adoption directly |
| **Weight-trajectory chart** | Candidate weights across successive windows | Stability check: weights that flip sign across windows are flagged untrustworthy |
| **Per-factor verdict** | rankIC, hit rate, avg excess by horizon × regime, with `n` | One of: `keep / floor-to-minimum / needs-more-samples`, each with the supporting numbers |

### 7.2 Metrics (the "all meaningful metrics" list)

Portfolio-level, computed on the simulated top-K book (entry at next-day open after signal, configurable cost/slippage bps stored with the run):

- Total return, CAGR, **excess return vs SPY / QQQ / sector basket** (headline metrics are excess, not raw)
- **Max drawdown** (magnitude, duration, recovery time), Calmar
- Sharpe, Sortino, annualized volatility, downside deviation
- Hit rate (deadband ±0.5%), payoff ratio, expectancy, profit factor
- Precision@10 per horizon; turnover and cost drag (shown **next to** Sharpe, per roadmap §6.2)
- Exposure %, max consecutive losses, monthly/quarterly return table
- Equity curve + drawdown curve vs benchmark, per-regime sub-curves

Factor-level: rankIC (+ t-stat) per factor per horizon per regime; IC decay profile; factor quantile spreads (top-minus-bottom); cross-factor correlation matrix (§2.1.3). Every cell carries `n`.

### 7.3 Delivery formats

1. `POST /api/recommender/historical-backtest` → frozen run record (`backtest_runs` + pseudo-decisions/outcomes in their own labeled tables).
2. `GET /api/recommender/historical-backtest/:id/report` → JSON: all §7.1/§7.2 numbers + config (universe, window, costs, strategy version hash).
3. **LLM narrative** (Chinese, the existing report pipeline): interprets the JSON — which factors earned their weights, where drawdowns clustered, which regimes broke the strategy, what the candidate weights imply — with the standard provider badge and the disclaimer that narrative is derived from, and subordinate to, the frozen numbers.
4. quantstats HTML tearsheet as an attached artifact (WP5), linked from the report page.

### 7.4 Anti-fooling rules (enforced at review)

- Walk-forward only; no full-sample optimization presented as performance.
- Costs/slippage always on; a zero-cost run must be labeled `frictionless-reference`.
- Universe caveat (survivorship) printed on the report header until delisted coverage exists.
- No best-window or best-horizon cherry-picking in the headline; headline = pre-registered config (top-10, T+20 primary horizon, current skill thresholds).
- Candidate weights from the backtest enter the live system **only** through the strategy-version candidate → validation → human-adopt workflow. The report itself changes nothing.

---

## 8. External open-source references: what to use, borrow, or skip

Reviewed 2026-07-05 (GitHub states verified via web).

### 8.1 abu (bbfamily/abu) — the owner's suggestion: borrow ideas, do not adopt

~17.7k stars, GPL-3.0, Python, Chinese docs/tutorials. Covers picking (选股) + timing (择时) + backtest + ML "UMP judge" layer that vetoes trades learned from past failures. **Effectively unmaintained since ~2019** (py2/3-shim era code, old pandas APIs, bundled data fetchers largely dead).

- **Skip**: adopting it as our backtest engine. It is a full framework that wants to own strategy, data, and execution — swallowing our deterministic recommender would break the backtest/live parity rule (§6.2.2), and we'd inherit 7 years of bit-rot. GPL-3.0 is acceptable for private local use but adds friction if anything is ever published.
- **Borrow (ideas, re-implemented)**:
  1. **UMP judge layer** — train classifiers on *failed* historical trades to veto similar future setups. This maps cleanly onto our gate architecture as another **shadow challenger** (same promotion ladder as the debate gate: shadow → cap → veto on evidence). Worth a design note in Phase 3.
  2. **Picking/timing separation** — independent confirmation of our two-sleeve split (§3.1).
  3. Its tutorial notebooks as a factor-idea checklist (position management, stop policies, similarity search).

### 8.2 Working set — verified in depth 2026-07-05

Each row was verified against the live repo (license, latest release, maintenance) before being decided. Verification details in §8.3; the binding decisions in §9.

| Project | Verdict | What we use it for | Integration shape |
|---|---|---|---|
| **quantstats** | ✅ adopt | The §7.2 portfolio tearsheet (Sharpe/Sortino/MaxDD/Calmar/monthly tables/HTML report) from our equity curve | `scripts/quantstats_bridge.py`, same JSON-bridge pattern as akshare/openbb; input = frozen equity series, output = metrics JSON + HTML artifact |
| **alphalens-reloaded** | ✅ adopt | Per-factor IC analysis, quantile spreads, turnover — the §7.2 factor-level report, industry-standard methodology | `scripts/alphalens_bridge.py`; input = factor values + prices exported from SQLite via `get_clean_factor_and_forward_returns()` → tear-sheet stats JSON |
| **edgartools** | ✅ adopt (the deep-dive's biggest find) | Tier-2 **PIT fundamentals** (XBRL financials keyed by filing date, history to 1994), **13F holdings deltas** (upgrades `smartMoney`), Form 4 parsing, 8-K current-filings feed (powers watcher W2) | `scripts/edgar_pit_bridge.py`; replaces the planned hand-rolled EDGAR XBRL ingestion in §4.4 Tier 2 entirely |
| **Microsoft qlib** | 📖 reference only | Alpha158 factor definitions as the technical-factor expansion catalog (§9 D4); PIT design informs Tier-2; LightGBM workflow is the §3.4 ML-challenger template | Borrow definitions, re-implement in our snapshot builder; do not install the platform |
| **abu** | 📖 ideas only | UMP-judge concept → Phase-3 shadow challenger; picking/timing split confirms two-sleeve design | No code reuse (frozen ~2019, GPL-3.0) |
| **vectorbt** | ❌ skip | — | Apache-2.0 **+ Commons Clause** fair-code license (free tier of commercial vectorbt PRO). Our sweep needs are trivial pandas loops; not worth the license surface (§9 D6) |
| pandas-ta / TA-Lib | ❌ skip | — | Alpha158 subset + existing `lib/finance_math.mjs` cover technicals; no new dependency justified |
| zipline-reloaded / backtrader / FinRL | ❌ skip | — | Event-driven engines / RL platforms would duplicate our decision loop and break parity |

The rule that resolves every row: **libraries serve our pipeline as data-prep and reporting tools; no framework replaces our scoring path.** Metrics and factor analytics are exactly the components where battle-tested externals beat hand-rolling (subtle annualization/DD conventions), and scoring is exactly where they'd destroy auditability.

### 8.3 Deep-dive verification results (2026-07-05)

| Project | License | Latest release verified | Maintenance | Key facts checked |
|---|---|---|---|---|
| quantstats | Apache-2.0 | v0.0.81, 2026-01-13 | Active, 7.4k★ | Python ≥3.10; metrics + HTML tearsheet vs benchmark |
| alphalens-reloaded | Apache-2.0 | v0.4.5, 2025-07-23 | Active (stefan-jansen), 605★ | Needs pandas ≥2.2.2 with numpy ≥2; input = factor values + prices |
| edgartools | MIT | v5.40.1, 2026-06 | Very active (162 releases, 4k commits), 2.4k★ | XBRL financials as-reported PIT; Form 4; 13F; 8-K feed; full history since 1994; built-in rate limiting/caching |
| qlib Alpha158 | MIT (qlib) | — (reference) | Active | 9 k-bar features + normalized price features + 28 rolling operators (ROC/MA/STD/BETA/RSQR/RESI/MAX/MIN/QTLU/QTLD/RANK/RSV/IMAX/IMIN/IMXD/CORR/CORD/CNTP/CNTN/CNTD/SUMP/SUMN/SUMD/VMA/VSTD/WVMA/VSUMP/VSUMN/VSUMD) over windows [5,10,20,30,60]; **inputs are OHLCV+VWAP only** → fully computable from our Tier-1 `historical_bars` |
| vectorbt (OSS) | Apache-2.0 + Commons Clause | v1.0.0, 2026-04-22 | Active, 8.1k★ | Fair-code: may not sell products primarily based on it; free tier of commercial PRO |
| abu | GPL-3.0 | last real activity ~2019 | Unmaintained, 17.7k★ | py2/3-shim era; bundled data fetchers dead |

---

## 9. Decision record (binding for implementation)

Role split, per owner 2026-07-05: **Claude decides, Codex executes.** The decisions below are final for the current phase; Codex should implement them as written and raise a flag in the execution log if reality contradicts one (e.g., an API turns out dead) rather than silently substituting.

- **D1 — Metrics engine = quantstats via bridge.** `scripts/quantstats_bridge.py` (stdin JSON: daily equity series + benchmark series + costs config → stdout JSON metrics + optional HTML tearsheet path under `data/reports/`). Native JS metrics in §7.2 remain the fallback when the bridge is unavailable; the report must state which engine produced the numbers.
- **D2 — Factor-IC engine = alphalens-reloaded via bridge.** `scripts/alphalens_bridge.py` (input: long-format factor values + close prices exported from SQLite; output: IC by horizon, quantile mean returns, turnover, as JSON). Pin `pandas>=2.2.2, numpy>=2` in the bridge venv; this is the §7.2 factor-level report.
- **D3 — All EDGAR work goes through edgartools.** Tier-2 PIT fundamentals (`scripts/edgar_pit_bridge.py`: XBRL facts keyed by **filing date**, never period date), 13F holdings deltas for the `smartMoney` upgrade, Form 4 parsing, and the watcher's W2 real-time filings polling. Do not hand-roll EDGAR XBRL parsing anywhere.
- **D4 — Technical-factor expansion = curated Alpha158 subset, in-house.** Implement ~24 features (k-bar shape family; ROC/MA/STD over [5,20,60]; RSV, RANK, IMAX/IMIN, CORR(price,volume), CNTP/CNTN, WVMA) inside the shared snapshot builder (`lib/` — JS, or the historical Python builder with identical formulas + parity fixtures). Not all 158: orthogonality (§2.1.3) and interpretability outrank feature count. These enter as *inputs to the momentum/technical factor group*, at token weight, under the standard earn-your-weight rule.
- **D5 — Historical bars source. AMENDED 2026-07-05 after live verification**: from this network, EastMoney is unreachable (direct and proxied), Finnhub candles are 403 (free tier), and no Alpha Vantage key exists — all three original sources are dead here. Verified working alternative already in-repo: **Longbridge CLI `kline <SYM>.US --period day --count 1000` returns ~4 years of daily bars (tested: AAPL back to 2022-07)**. New order: **Longbridge CLI primary → IBKR socket `history_payload` (duration "2 Y"+) secondary → AkShare/Finnhub/Alpha Vantage tertiary when reachable**. FRED regimes work (direct and proxied) — earlier timeouts were sandbox artifacts. Original rationale stands otherwise: no yfinance; Stooq rejected (JS proof-of-work wall); Yahoo v8 rate-limited.
- **D6 — No vectorbt.** Parameter sweeps (thresholds, cooldowns, blackout windows) are a ~100-line pandas loop over frozen snapshots in `scripts/param_sweep.py`; Commons-Clause license surface not justified for that. Sweep outputs are evidence for human threshold changes via the strategy-version workflow, never auto-applied.
- **D7 — No framework adoption, ever, for scoring.** abu/qlib/zipline/backtrader/FinRL are reference material. Anything that computes a recommendation score outside `lib/recommender_core.mjs` is an automatic review reject (§6.2.2).
- **D8 — abu's UMP-judge idea is deferred to Phase 3** as a designed-in-house shadow challenger (classifier trained on failed frozen trades, vetoing similar setups), entering through the same shadow→cap→veto promotion ladder as the debate gate. No abu code (GPL, unmaintained).
- **D9 — Bridge pattern is uniform.** All three new Python bridges follow the existing akshare/openbb contract: JSON in/out, timeout-guarded via `runJsonCli`, failures surface in diagnostics + `audit_events`, never block the native report path.
- **D10 — Report provenance is mandatory.** Every §7 report states: metrics engine (quantstats vs native), data source per factor (live vs reconstructed vs proxy), universe caveat, strategy version hash, and config. A report missing provenance fails review.
- **D17 — PIT universe evidence judgement (WP29, 2026-07-09).** `universe_membership` now uses the MIT-licensed fja05680/sp500 start/end interval table (667 overlapping rows, 665 unique tickers for 2019-01-01→2026-07-09). A live SQLite PIT smoke over 2025-01-01→2026-07-02 produced `universeMode:"pit"`, 503 point-in-time members, 19 members with bars (3.78% coverage), 25 pseudo-decisions, 30 outcomes, primary T+5 `avgExcessPct=-14.7606` (`n=5`), hit-rate `0` (`n=5`), missing benchmark `0` (`n=5`), and momentum rankIC `-0.2809` (`n=30`, effectiveN 25). Judgement: the machinery is correct but the evidence is low-coverage; do **not** revise the two-sleeve or short-horizon reversal plan from this smoke alone. Full D17 requires Longbridge backfill for the PIT member set and a rerun with adequate coverage; if momentum rankIC remains negative under adequate PIT coverage, flag the two-sleeve plan for human revision without changing scoring semantics in the evidence pass.

Work-package mapping: D1/D2/D9/D10 land in **WP5**; D3 adds a **WP6 (edgartools: PIT fundamentals + 13F + watcher filings feed)** after WP4; D4/D5 land in **WP3**; D6's sweep script is optional after WP4.

---

## 10. Phase acceleration: what historical data unlocks now (decision, 2026-07-05)

Question from the owner: are we limited to deploying Phase 0–1 now, or can past data make Phase 2/3 possible today? Ruling: **the roadmap phases are evidence gates, not deployment locks.** The historical corpus converts most of Phase 2 from calendar-gated to effort-gated. Amended sequencing (supersedes the Phase-2 timing in [INVESTMENT_ASSISTANT_ROADMAP_FINAL.md](INVESTMENT_ASSISTANT_ROADMAP_FINAL.md) §2):

### 10.1 Unlocked now by the historical corpus (after WP4)

- **D11 — Build the Phase-2 validation gate immediately.** Walk-forward validation is a historical computation; candidate weights validate against 5+ years × multiple regimes instead of waiting for trailing live days. Adopt/rollback machinery ships with WP4, not Months 5–6.
- **D12 — Historically-calibrated strategy version.** A weight set for the *reconstructable* factors that wins the historical walk-forward may be adopted as a new strategy version (`changeReason: "historical-calibration"`, validation record attached, human-approved). This is standard strategy initialization, not a shortcut. Non-reconstructable factors (news/social/options/most smartMoney) keep bounded priors under live sample gates.
- **D13 — Live parity window before trusting the calibration.** For 4–6 weeks after adoption, a parity dashboard compares live factor distributions, decision rates, and gate-fire rates against historical expectations; material divergence reverts to the prior version. This closes the sim-to-real gap the corpus cannot test.
- Regime-split dashboards, per-factor horizon profiles, and the two-sleeve design inputs — all derivable from the corpus at WP4 time.
- Phase 2.3 (user paper portfolio) was never evidence-gated; build whenever bandwidth allows.

### 10.2 Not purchasable with past data (live-only clocks)

- **D14 — Start shadow debates now to start the 3.1 clock.** Debate-gate promotion needs ≥50 live shadow-gated decisions across ≥2 regimes; there is no historical reconstruction of what the debate would have said. Enable daily top-5 shadow debates immediately (cost-permitting) — the clock only runs while shadow mode runs.
- **D15 — The order-draft gate (3.4) is unchanged and non-negotiable**: 2 quarters of *live* paper outperformance with documented drawdowns. Backtest outperformance does not substitute; the gate tests the live system end-to-end, including the owner's behavior around it.
- Clarification: **3.2 (portfolio risk) and 3.3 (execution monitoring) are effort-gated, not evidence-gated** — they may be scheduled any time without violating governance; they sit late in the roadmap for focus only.

### 10.3 Amended sequence

```
WP1 → (WP2 ∥ WP3+WP4) → Phase-2 machinery on historical evidence (D11)
   → human-adopt historical-calibration version (D12)
   → 4–6 wk live parity window (D13), shadow debates accruing throughout (D14)
   → live learner updates from calibrated priors; 3.4 keeps its live 2-quarter clock (D15)
```

Net: Phase 2 arrives roughly a quarter earlier than the FINAL roadmap's "Months 5–6"; Phase 3's two evidence gates keep live-only clocks, one of which can start today.

---

## 11. External open-source scan, round 2 (2026-07-05): news, stock/market analysis, recommendations, portfolio

Requested scope: anything usable for news collection, single-stock analysis, market analysis, recommendations, and quant. All states verified via web on 2026-07-05. Same governing rule as §8: **libraries serve the pipeline (data, formulas, reporting); no framework replaces our scoring or decides trades.**

| Project | Verified state | Verdict | What it gives us |
|---|---|---|---|
| **FinanceDatabase** (JerBouma) | MIT, v2.3.0, active, 300k+ symbols | ✅ **adopt** | Offline sector/industry/country classification for every US ticker — directly fixes the WP4 `missing_sector_mapping` (sector benchmark baskets) and upgrades peer-set generation. Static data files, no API key. |
| **FinanceToolkit** (JerBouma) | MIT, active, 200+ ratios, 30y statements | ✅ **borrow formulas** | Transparent reference implementations for the exact ratios WP7 approximated (Piotroski F, Altman Z, accruals, 150+ more). Caveat: its default data source is FinancialModelingPrep (paid key) — we feed **our own PIT data** into its calculation layer or port the formulas; never depend on FMP. |
| **pandas-market-calendars** (rsheftel) | Active (docs built May 2026), NYSE 1885→present incl. early closes | ✅ **adopt as validator** | Our NYSE calendar in `lib/market_core.mjs` is hand-rolled — a silent-drift risk (early closes, new holidays like Juneteenth analogues). Generate a static holiday/early-close JSON (2019–2028) from it; JS calendar consumes + is fixture-verified against it. |
| **ai-hedge-fund** (virattt) | MIT, 60.8k★, active | ✅ **borrow prompts only** | The persona-agent checklists (Damodaran valuation discipline, Graham value, Munger quality, Burry deep value, Wood growth) are excellent prompt material for our harness personas/debate. Its *architecture* (LLM agents make the trading decision) violates our constitution — prompts yes, control flow no. |
| **Riskfolio-Lib** (dcajasn) | BSD-3, v7.3.0 (2026-06), 13 risk measures, HRP/HERC | ✅ **adopt when Phase 3.2 starts** | The portfolio-risk assistant's engine: risk parity, CVaR/CDaR, hierarchical clustering allocation — via the standard bridge pattern. Decision recorded now so 3.2 doesn't re-litigate. PyPortfolioOpt (MIT, active) is the simpler fallback. |
| **FinNLP / FinGPT** (AI4Finance) | MIT, FinNLP 482★, 19 news + 8 social + 3 filing source adapters | 📖 **reference only** | Catalog of scraper adapters (Seeking Alpha, CNBC paths etc.) to consult if we add sources; most wrap APIs we already integrate with more robustness (extraction, dedup, circuit breakers). FinGPT's fine-tuned models: skip — we route general LLMs via CLI. |
| TradingAgents / FinRobot | (assessed in IMPROVEMENT_PLAN_V3) | 📖 already referenced | Competitor architecture references; nothing new to adopt. |

Net-new capability unlocked by this round: **real sector benchmark baskets** (FinanceDatabase), **exact ratio fidelity** (FinanceToolkit formulas over PIT data), **calendar correctness insurance** (pandas-market-calendars), **richer debate personas** (ai-hedge-fund prompts), and a pre-made decision for the Phase-3.2 portfolio engine (Riskfolio-Lib). Implementation queue: handoff doc Round 5 (WP25).

---

## §12 Round 6 — review findings & blind-spot solutions (2026-07-07)

Post-Rounds-3–5 review (verdicts in the execution log) surfaced defects **and** confirmed four strategic blind spots. Solutions are specced as handoff Round 6 (WP26–WP30). Summary of the reasoning:

| Blind spot / defect | Why it discounts the outcome | Solution |
|---|---|---|
| **Server OOM crash** (F12): full-store `structuredClone` per save blew the 2 GB heap mid-collection | Silent process death ⇒ missed runs, stale data, and the likeliest root cause of the June-30→July-4 scheduler gap | WP26 (remove clone, heap telemetry, crash-detection lock file, launchd restart) |
| **Benchmark integrity** (F13): capped runs never load SPY; missing benchmark silently makes excess = raw; sector ETFs only excluded as literal "SPY" | "Excess return" numbers that are actually raw returns poison every comparison; ETF bars (now loaded for sector baskets) would be traded as stocks | WP27 (benchmark set isolation, `missing_benchmark` quality flag, evidence re-run) |
| **Survivorship bias**: the corpus is today's watchlist — winners by construction | Every backtest excess number is an upper bound, possibly 100% artifact; rankIC conclusions (two-sleeve rationale) inherit the bias | WP29 (PIT S&P membership table, member-bars backfill, `universeMode:"pit"`, D17 re-judgement) |
| **Never-exercised promotion path** + **unmeasured LLM channel** + **invisible calendar bottleneck** | First real promotion would debut untested machinery; LLM channel cost/benefit unknown; owner switches (watcher/push/debate) stay off because nothing surfaces them | WP30 (sandboxed promotion fire-drill, LLM counterfactual scorecard, go-live status card) |
| **Dual-active strategy versions** (F14) | Audit trail cannot say which version governed a decision | WP28 (single-active invariant + migration) |

Standing caution until WP27 lands: `historical_bars` now contains 12 sector-ETF ticker sets (loaded 2026-07-07 to enable sector baskets) — **do not treat new uncapped walk-forward runs as evidence** until the benchmark/universe split is merged.

Owner actions (not Codex work, restated): enable `INTRADAY_WATCHER_ENABLED` + push, enable `AGENT_DEBATE_DAILY_ENABLED` (starts the Phase-3.1 shadow clock and feeds WP30b), commit the still-uncommitted README.md / ROADMAP_FINAL.md, and start the server with `NODE_OPTIONS=--max-old-space-size=6144` until WP26 lands.

---

## §13 Trader Mirror agent（操作画像）— design (2026-07-07)

**Owner request**: an agent that reads the owner's real buy/sell operations, concludes what they usually do, classifies their style, shows how it turned out, and coaches based on it.

**What exists already (build on, do not duplicate)**: `db.trades` ledger with `sanitizeTrade`/`mergeTrades` (dedup on `externalId`/`orderId`), manual + CSV/text import + IBKR Flex sync (`/api/ibkr/flex-sync`), FIFO closed-lot matching in `calculateTradeJournal` with performance splits (strategy/emotion/tag/month/holding-bucket/plan-quality), equity curve + realized max-DD, and `/api/trade-recommendation-reconciliation` (trade↔recommendation matching). **The ledger is currently empty** — the owner has never imported trades — so ingestion is the first mile. Verified today: `longbridge order executions --history --start <date> --format json` returns the owner's real fills (primary broker).

**Constitution fit**: all numbers, cohorts, and style *tags* are computed deterministically with thresholds in versioned code; the LLM writes narrative and coaching **on top of** the computed metrics, citing metric ids, and never assigns tags, scores, or thresholds. Every metric carries `n`; any dimension below its min-samples reports `insufficient_data` instead of a confident label ("you can backtest an equation; you cannot backtest a mood" applies to the owner too).

Architecture (→ handoff Round 7, WP31):

1. **Fills ingestion (31a)** — Longbridge executions bridge with a sync watermark, merged into `db.trades` via the existing dedup; IBKR Flex stays; daily auto-sync + manual button.
2. **Behavioral metrics engine (31b)** — `lib/trader_profile.mjs`, consuming the journal's closed lots + `historical_bars` context. New metric families: entry behavior (chase rate = buys within 2% of trailing 20d high vs pullback entries, each cohort's outcome), exit behavior (disposition ratio: holding days losers vs winners; MFE capture = exit vs max close in window; revenge re-entry rate after losses), sizing (size CV, size-vs-outcome correlation), concentration (sector HHI via `security_master_ext`), reactivity (activity after big SPY/VIX moves), counterfactuals (hold-20-more-days and SPY-same-window alternative returns → "sold too early/late" evidence). Rule-based style classifier over 5 axes (horizon / entry style / risk discipline / diversification / turnover), thresholds versioned as `styleSchema`.
3. **System-overlap (31c)** — follow-rate vs the recommender's actionable list, outcome comparison of system-followed vs owner-instinct trades, "ignored winners" count. Answers: does the owner beat their own tool?
4. **LLM narrator (31d)** — `harness/agents/trader_mirror.md`, narrative-only, every claim cites metric ids, coaching must be if-then behavioral rules tied to cohort deltas. Privacy: sending trade data to an LLM provider is opt-in (`TRADER_MIRROR_LLM_ENABLED`, default false); the deterministic report renders fully without it.
5. **API/UI (31e)** — `GET /api/trader-profile`, `POST /api/trader-profile/refresh`; 交易画像 card: style tags with evidence, metric table with `n` badges, coaching list, overlap panel; profile snapshots persisted for future drift view.

### D17 (2026-07-10) — Survivorship re-judgement on the PIT universe (closes the WP29d question)

Evidence: run `hist-bt-1783626982204-07952cba` (8,556 decisions / 25,519 outcomes / 1,830 days; 603-member PIT coverage 90.7%). T+20 excess −0.139% (n=8,411), hit 49.2%; momentum rankIC −0.0155 (n=25,445) — same sign as the watchlist corpus. **Decisions**: (1) all pre-PIT excess metrics are demoted to "survivorship-contaminated — do not cite"; (2) the two-sleeve design (short-horizon reversal handling) **stands** — reversal is universe-independent; (3) macroRegime (+0.046 rankIC) is promoted to first-class evidence — regime-conditioned analysis becomes a standing report section; (4) factor-development priority shifts decisively to non-price factors (PIT fundamentals, revisions, catalyst) since the price sleeve alone shows ≈0 net alpha on the honest universe — the backtest cannot see the live-only factors, so live shadow evidence remains the deciding channel for them.

WP34 full-grid addendum: run `hist-bt-1783632041459-f87d2d9d` persisted full detail rows after chunked SQLite persistence (8,556 decisions / 33,693 outcomes / 1,830 daily rows; 601 of 662 PIT members with bars = 90.79% coverage; gridTruncated=false). Horizon evidence is now explicit: T+1 excess −0.095% (n=8,536), T+5 +0.057% (n=8,498), T+20 −0.139% (n=8,411), T+60 −0.272% (n=8,157). Across the 1/5/20/60 outcome set, momentum rankIC is −0.0405 (n=33,602, effectiveN 8,536) and macroRegime rankIC is +0.0651 (n=33,602, effectiveN 8,536). Cost sensitivity for the diagnostic daily-rebalanced always-invested topN equity book remains poor even before friction (0 bps excessReturnPct −47.66%, MaxDD −63.54%, Sharpe −0.789; 15 bps excessReturnPct −51.45%, MaxDD −65.41%, Sharpe −0.891), reinforcing the rule that per-decision horizon metrics are the primary evidence and equity-book metrics are implementation diagnostics only.
