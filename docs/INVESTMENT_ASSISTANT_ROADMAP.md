# Market Pulse AI — Investment Assistant Roadmap

> Written: 2026-07-03
> Scope: full repository review + product plan for evolving Market Pulse AI into a dependable personal U.S.-equity investment assistant.
> Method: direct code reading of `server.mjs` (37,922 lines), `server/*.mjs`, `lib/*.mjs`, `public/app.js` (8,172 lines), `harness/` (Python), `scripts/`, `strategies/`, all 12 docs; live inspection of `data/store.json` (93 MB) and the SQLite mirror; syntax/regression/harness test runs (all green).
> Related docs: [IMPROVEMENT_PLAN_V2.md](IMPROVEMENT_PLAN_V2.md) (reliability backlog), [IMPROVEMENT_PLAN_V3.md](IMPROVEMENT_PLAN_V3.md) (feature roadmap vs. competitors), [AUDIT_AND_HARDENING_V4.md](AUDIT_AND_HARDENING_V4.md) (post-refactor audit — all P0/P1 items executed 2026-07-02), [STOCK_RECOMMENDER_EVOLUTION_DESIGN.md](STOCK_RECOMMENDER_EVOLUTION_DESIGN.md) (factor system design), [AGENT_HARNESS_DESIGN.md](AGENT_HARNESS_DESIGN.md) (Python agent runtime).
> Note: git history was recently squashed to a fresh initial import; commit hashes referenced in older docs are historical.

---

## 1. Executive summary

Market Pulse AI is already far beyond a demo. It is a locally-run U.S. equity intelligence station with: multi-source news collection with full-text extraction and Chinese summarization; a market-regime dashboard; movers-with-reasons; an earnings calendar; options chains with GEX/IV estimation; a 10-factor recommendation engine with data-quality and regime multipliers; a hard-rule daily buy/sell agent with frozen T+1/3/5/10 benchmark-relative outcome tracking, a paper book, walk-forward backtesting, and a capped, differential factor-weight learning loop; a FIFO trade journal with behavioral analytics; IBKR Flex import and read-only gateway access; and a separate Python multi-agent debate harness (bull/bear/risk/coordinator) with episodic memory.

**The honest gap analysis is therefore not "build the assistant" — most of the assistant exists.** The real gaps, in order of importance:

1. **Durability and scale of the data layer** — `data/store.json` (93 MB, single JSON file) is still the primary store; SQLite is only a read mirror. This is the biggest threat to daily dependability.
2. **Depth of single-stock research** — value-chain/supplier/customer mapping is keyword-heuristic; earnings-call transcripts are not ingested at all (0 references in code); analyst research beyond Longbridge ratings is absent; IV rank lacks a persisted IV time series.
3. **Consolidation of the recommendation surface** — decisions, outcomes, paper book, backtests, and factor stats exist but are spread across panels; there is no single "track record + today's calls" dashboard that would let the owner audit the system at a glance.
4. **Evidence and freshness surfacing** — largely fixed on 2026-07-02 (provider badges, staleness badges, health strips), but per-recommendation source traceability with confidence is still partial.
5. **Learning-loop hardening** — the mechanics are right (frozen outcomes, SPY-relative, deadband, min-samples, capped differential weight updates, LLM lessons quarantined from weights); what's missing is regime-split evaluation, T+20+ horizons, strategy versioning as a first-class record, and a validation gate that requires walk-forward improvement before adopted weights go live.

This document is critical by design: several requested capabilities are pushed back on (live trading, LLM-direct recommendations, social signals as alpha, options-flow trust) with reasoning in §6.

---

## 2. What the current project does

A single Node.js process (`server.mjs`) serves a vanilla-JS SPA on `localhost:5173` and runs scheduled pre-market (08:30 ET) and post-market (16:30 ET) collection runs (plus optional opt-in intraday alert runs). Each run:

1. Collects: watchlist + discovery-pool news (Longbridge CLI primary, Finnhub/Yahoo/Google-News-decode/NewsAPI/Polygon/RSS fallbacks), SEC filings (EDGAR), social attention (ApeWisdom/Reddit/Stocktwits/X/XHS, TrendRadar now default-off), quotes/K-lines (IBKR socket → Finnhub → AlphaVantage), technicals, fundamentals, options chains (IBKR → Nasdaq → Yahoo → Finnhub), market indices + FRED macro regime, Longbridge top-movers/market-editorial/earnings-calendar, OpenBB routes.
2. Extracts article bodies (trafilatura → HTML fallback → Reader API, cached), translates titles via Azure (cascade Azure → LLM → local), summarizes materials via tier-routed LLMs (light/standard/reasoning/fallback/heavy across local/gemini/gemini-cli/antigravity-cli/codex-cli/openai, per provider×tier circuit breakers).
3. Analyzes: stock narratives with a heuristic six-role debate + optional ingested LLM debate from the Python harness, prism personas, investment advice with expectation-gap (reverse DCF + consensus) and insider signals, movers-with-reasons, market editorial.
4. Recommends: the all-stock agent (hard rules in `strategies/all_stock_agent_skill.md`) picks ≤10 buys + N sells through weighted rules and veto/cap risk gates (including a shadow debate gate), logs frozen decisions, then on later runs freezes T+1/3/5/10 outcomes vs. benchmark baskets, updates per-rule and per-factor stats, maintains a paper book, and — with ≥20 samples — applies capped differential factor-weight updates.
5. Reviews: FIFO trade journal (long/short, options quarantined into a separate FIFO), behavioral analytics (strategy/emotion/tag/holding-period splits, expectancy, drawdown, streaks), review todos, IBKR Flex import, trade-review LLM reports.
6. Reports: email via Resend/SMTP after scheduled runs; history browser of last runs; diagnostics for every source.

---

## 3. Current architecture overview

```
┌────────────────────────────────────────────────────────────────────┐
│ Node server.mjs (37.9k lines) — routes (54 /api/*), schedulers,     │
│ collectors, analyzers, recommender, trade journal, email            │
│   imports → server/*.mjs  (network_fetch w/ proxy+gzip, email,      │
│              cli_process, http req/res, runtime_utils, static,      │
│              agent_harness_ingest, all_stock/debate_gate)           │
│   imports → lib/*.mjs     (market_core: calendar/ownership/FIFO;    │
│              finance_math: RSI/ATR/EMA/BS-IV; recommender_core:     │
│              factor weights/normalization/scoring/learning/outcome) │
├────────────────────────────────────────────────────────────────────┤
│ public/ vanilla JS SPA — 7 hash pages (home/actions/stocks/social/  │
│ research/portfolio/ops), app.js 8.2k lines, no framework            │
├────────────────────────────────────────────────────────────────────┤
│ data/store.json (93 MB, PRIMARY) ←→ scripts/sqlite_store_sync.py    │
│    → data/market_pulse.sqlite (READ MIRROR: runs, stock_history,    │
│      social_posts, article_cache, recommendation_decisions,         │
│      recommendation_outcomes, factor_stats, metadata)               │
├────────────────────────────────────────────────────────────────────┤
│ Python bridges (scripts/): openbb, akshare, ibkr_gateway (socket    │
│ 4001), article_extractor, xhs, youtube                              │
├────────────────────────────────────────────────────────────────────┤
│ Python harness/ (standalone agent runtime): agents-as-markdown,     │
│ ReAct loop w/ budgets+fallback, read-only HTTP/SQLite tools,        │
│ bull/bear/risk/coordinator debate, review_attributor → episodic     │
│ SQLite memory; invokers: agy-cli / codex-cli / mock                 │
│   → POST /api/agent-debate/run triggers debate + ingests result     │
└────────────────────────────────────────────────────────────────────┘
```

Strategy state lives in `strategies/all_stock_agent_skill.md` (human-readable doc + machine-read JSON block + changelog): rule weights, thresholds, risk gates, learning settings.

---

## 4. Existing features (implemented and verified)

| Domain | Implemented | Evidence |
|---|---|---|
| News pipeline | Multi-source collection, canonical-URL dedupe, shell-page/CAPTCHA detection, full-text extraction + cache, Azure title translation, tiered LLM summaries, info-score gating, provider badges (`LLM 摘要`/`本地兜底`) | `collectYahooNews`, `newsDedupeKey`, `articleLooksLikeSiteShell`, `localizeTitlesWithMtApi` |
| Market intelligence | Index dashboard (IBKR IND contracts + ETF proxies), FRED macro-regime score, Longbridge market editorial (full-text, bypasses paywalls), movers-with-reasons (news-joined), hot news, earnings calendar, market-temp available | `scoreFredMacroRegime` (lib), `collectLongBridgeMarketEditorial`, `buildMoversWithReasons` |
| Single-stock | Quote/K-line/technicals/fundamentals, research pack (consensus, forecast-EPS, institution ratings + history, insider Form 4 w/ bias, short interest), reverse-DCF expectation gap, industry rank/peers, microstructure, options chain w/ GEX + estimated IV + unusual activity, narrative + heuristic debate + prism, per-stock LLM debate button | `collectLongBridgeResearchPack`, `buildReverseDcfExpectationGap`, `buildAgentDebate`, `/api/agent-debate/run` |
| Recommendation engine | 10-factor snapshot (momentum, qualityGrowth, valuationExpectation, earningsRevision, newsCatalyst, industryChain, macroRegime, optionsFlow, smartMoney, socialAttention), peer-baseline normalization, data-quality multiplier, regime multiplier, portfolio-fit penalty, hard-veto/cap gates, action taxonomy (买入候选/观察买入/等待触发/持有/回避) | `lib/recommender_core.mjs` `scoreRecommendationFromFactorSnapshot` |
| Daily agent | Hard-rule skill (10 buys/N sells), risk gates incl. shadow debate gate, frozen decision log w/ matched factors + benchmark baskets, T+1/3/5/10 frozen outcomes w/ SPY/sector-basket excess + deadband + MAE/MFE, per-rule×horizon stats, paper book w/ equity curve/Sharpe/MaxDD, walk-forward backtest endpoint w/ precision@10, factor-weight learning (differential relativeEdge, minSamples 20, ≤2%/step, skipped-factor freeze + stepViolations audit, LLM lessons excluded) | `runAllStockAgentForRun`, `buildAllStockAgentOutcomeSnapshots`, `learnRecommendationFactorWeights`, `runAllStockAgentBacktest` |
| Trade review | Trade CRUD/CSV/IBKR-Flex import (dedup by execId), FIFO incl. short-selling, options FIFO quarantine, realized/unrealized P&L, behavior splits, expectancy/profit-factor/streaks/drawdown, review todos w/ status, trade-review LLM reports, history snapshots per ticker per run | `calculateTradeJournal` (lib/market_core has options FIFO), `/api/trade-review` |
| IBKR | Flex Web Service sync + paste-XML import, read-only socket (account/positions/quotes/history/options), Client Portal fallback, `IBKR_TRADING_ENABLED=false` + `IBKR_PAPER_ONLY=true` defaults | `scripts/ibkr_gateway_bridge.py`, env flags |
| Ops & trust | Per-source diagnostics + enable/pause controls, provider×tier cooldown panel, staleness badges + schedule health strip, store-health card (dirty-write, size warning), config center w/ env editing, LaunchAgent scripts, intraday alerts (opt-in) | 2026-07-02 execution log in [AUDIT_AND_HARDENING_V4.md](AUDIT_AND_HARDENING_V4.md) §六 |
| Agent harness | Markdown-spec agents, budgeted ReAct loop, protocol correction, invoker fallback, read-only tool registry (7 HTTP + 4 SQLite tools), debate orchestrator, review→episodic memory, traces to artifacts, 2 smoke tests | `harness/runtime/loop.py`, `harness/orchestrator/debate.py` |

---

## 5. Codebase map

| Path | Role | Notes |
|---|---|---|
| `server.mjs` | Monolith: 54 API routes, schedulers, collectors, analyzers, recommender glue | 37.9k lines — future extraction candidates: collectors, all-stock agent, routes |
| `server/network_fetch.mjs` | Proxy-aware fetch (CONNECT/TLS, gzip/deflate/br, body cap), retries | Fixed B3 (gzip) 2026-07-02 |
| `server/agent_harness_ingest.mjs` | Harness debate ingest + deterministic/LLM debate separation | Token-gated, default off |
| `server/all_stock/debate_gate.mjs` | Shadow gates from debate finalDecision | `shadow_cap_buy` / `shadow_downweight` |
| `server/email_delivery.mjs`, `cli_process.mjs`, `runtime_utils.mjs`, `http_*.mjs`, `env_utils.mjs`, `process_errors.mjs`, `static_files.mjs`, `text_utils.mjs` | Extracted infra | Clean, 0 empty catches |
| `lib/market_core.mjs` | NYSE calendar/holidays, semantic news ownership, dedupe, options FIFO | Pure functions |
| `lib/finance_math.mjs` | RSI(Wilder)/ATR/EMA/MACD/BS gamma/price/IV-bisection, technical snapshot | Verified correct |
| `lib/recommender_core.mjs` | Factor weights/normalization/scoring/learning, benchmark baskets, outcome/deadband, MAE/MFE, thesis-hit | The recommendation brain |
| `public/app.js` + `index.html` + `styles.css` | SPA, 7 hash pages | 8.2k lines, no framework |
| `strategies/all_stock_agent_skill.md` | The hard-rule skill (JSON) + changelog | Versioned by changelog entries |
| `harness/` | Python agent runtime (see §3) | Standalone; touches Node only via read-only APIs + opt-in ingest |
| `scripts/` | Python bridges + `sqlite_store_sync.py` + eval/regression scripts | `core_regression_tests.mjs` green |
| `data/store.json` | PRIMARY store (93 MB) | Biggest liability (§7.1) |
| `data/market_pulse.sqlite` | Read mirror: 8 tables | decisions 69+, outcomes 19+, factor_stats 30 rows |
| `docs/` | 12 design/audit docs | This file is the product roadmap |

---

## 6. Critical review of the target vision (challenging the assumptions)

**6.1 Should an LLM generate direct trade recommendations? No — and the codebase already agrees.** The current design (LLM explains/synthesizes; structured factors + gates score; hard rules pick) is correct and must be preserved. Concretely: LLM output must never write to `factorSnapshot.factors[*].score`, gate decisions, or skill weights. The LLM's legitimate seats: narrative synthesis, thesis articulation, debate (as *shadow* gate until validated), post-trade lesson writing (quarantined in harness memory). Any future feature that lets the LLM "adjust" a score should be rejected in review.

**6.2 Do daily recommendations create overtrading risk? Yes.** Ten buys/day × 250 days = 2,500 signals/year for one person — that is a research feed, not a trade plan. Mitigations (partially present): (a) keep the "research ideas vs. actionable" split explicit — today's taxonomy (买入候选 vs 观察买入 vs 等待触发) is the right shape, but the UI should default to showing ≤3 actionable candidates with the rest collapsed as research; (b) add a per-ticker cooldown (no re-recommendation within N days unless thesis changed); (c) show the paper book's turnover cost drag next to its Sharpe so the system's own churn is visible. The success metric for the *product* is not signal count; it is whether the owner's realized decisions beat their counterfactual (see 6.7 reconciliation).

**6.3 Are social/news hotspots predictive or noise? Mostly noise, occasionally regime fuel.** The literature and this repo's own design docs agree: mentions correlate with volatility and crowding, not forward alpha. Current handling is right: socialAttention has the smallest factor weight (0.03) and social heat requires a stated reason. Keep social as (a) an attention/liquidity flag, (b) a crowding *risk* input (contrarian at extremes), (c) a discovery funnel into the research pool — never a standalone buy reason. The factor-stats loop will empirically confirm this: if `socialAttention` rankIC stays ≈0 after 100+ samples, cut its weight to near-zero and say so in the changelog.

**6.4 Is options-flow data reliable enough to influence recommendations? Only with a quality gate.** Free-tier chains (Nasdaq/Yahoo/Finnhub) have stale OI, missing Greeks (the code estimates IV from mid-price when absent), and no trade-direction inference; "unusual activity" without time-and-sales is a heuristic. Current mitigations exist (`largeOrderSupport.supportsTimeAndSales === false` is surfaced; optionsFlow weight is 0.05). Requirement: optionsFlow factor quality must be scored from chain completeness (real Greeks? OI fresh? IBKR vs. fallback provider?) and the data-quality multiplier must already discount it — verify this passes through, and never let optionsFlow alone flip an action.

**6.5 Should IBKR live trading be enabled? No — not on this roadmap.** Reasons: (a) the learning loop is young (outcomes only started accruing in late June); (b) a system that can order is a system that can mis-order during a provider outage — the failure domain becomes your brokerage account; (c) the compliance/testing burden (order-state reconciliation, partial fills, halts) would consume all engineering capacity that should go to research quality. The roadmap caps at **order *drafts* with mandatory human approval and full audit logs (P3, optional)**, and even that only after ≥2 quarters of paper-book outperformance vs. SPY with documented drawdown behavior. `IBKR_TRADING_ENABLED=false` stays default; live ordering should additionally require a physical-file flag (e.g., `data/ALLOW_LIVE_TRADING`) so no env typo can enable it.

**6.6 Can "self-improvement" be safe? Yes, narrowly — and the current design is already the safe shape.** Frozen decision snapshots (no repainting), horizon-frozen outcomes, benchmark-relative + deadband labels, min-20 samples, ≤2%/step capped differential updates with skipped-factor freezing and step-violation audits, and LLM lessons quarantined from weights. Remaining risks: (a) **survivorship/backfill bias** in walk-forward backtests built from `stockHistory` snapshots (only tickers that were watched/discovered are in history); label backtest results "in-sample universe" until a point-in-time universe exists; (b) **regime overfitting** — all current samples come from one market regime; require regime-split stats before trusting any weight trend; (c) **multiple-testing** — with 10 factors × 4 horizons, some will look good by chance; prefer long-horizon consistency over best-cell selection.

**6.7 The most underrated feature in the vision: reconciliation.** The single highest-value personal feature is comparing *your actual IBKR trades* against *the system's same-day decisions*: did you buy things the system vetoed? Sell things it flagged hold? This closes the loop between "assistant" and "behavioral mirror" and requires no new data — both sides already exist in the store.

---

## 7. Gap analysis vs. the target vision

| # | Target capability | Status | Gap |
|---|---|---|---|
| G1 | Market intelligence w/ traceability + confidence | 80% | Hotspots exist; missing story-level clustering (V3-3C), per-item confidence labels, and signal-vs-noise tiering on the home page |
| G2 | Single-stock research dashboard | 65% | Strong on quotes/technicals/fundamentals/consensus/insider/options; **weak on value chain** (keyword heuristic, no supplier/customer/substitute graph), **no earnings-call transcripts** (0 refs), no analyst report ingestion beyond ratings, IV rank lacks persisted IV history |
| G3 | Multi-factor purchase-value assessment | 85% | Engine + gates + evidence exist; needs per-factor evidence surfacing on cards (partially done 07-02) and options-quality gating verification |
| G4 | Daily recommendation agent w/ tracking + learning | 80% | Missing: T+20+ horizons, regime-split stats, strategy versioning as records, validation gate before weight adoption, research/actionable UI split, per-ticker cooldown |
| G5 | IBKR integration + personal review | 70% | Flex import + read-only + FIFO + behavior analytics exist; missing: **trade↔recommendation reconciliation**, portfolio-level exposure/concentration review, real-time execution monitoring (P3) |
| G6 | Durable data layer | 40% | store.json primary (93 MB); SQLite mirror read-only; no PIT universe; no IV/quote time-series tables beyond stockHistory snapshots |
| G7 | Auditability (decision → data snapshot → outcome) | 75% | Decisions freeze factors/prices/baskets; missing: strategy-version stamp on each decision, one-click "why" view reconstructing a past decision |

---

## 8. Recommended architectures

### 8.1 Product architecture (information flow)

```
Collect (sources w/ budgets) → Normalize (dedupe/ownership/quality)
→ Snapshot (factor snapshot + data-quality audit per ticker)
→ Decide (hard rules + gates; LLM debate as shadow/annotator)
→ Record (decision log w/ strategy version + evidence refs)
→ Track (frozen outcomes per horizon vs. benchmark)
→ Learn (capped mechanical weight updates, gated by walk-forward validation)
→ Review (paper book + user-trade reconciliation + lessons memory)
→ Present (Today / Stock / Recommendations / Portfolio / System)
```

### 8.2 Data architecture

**Make SQLite the primary store; demote store.json.** Target tables (existing ✅ / new ➕):

- ✅ `runs` (slim: metadata + summary JSON; move heavy payloads out)
- ➕ `news_items(run_id, ticker, url_canonical, title, title_zh, summary_zh, source, published_at, info_score, provenance JSON)`
- ➕ `narratives(run_id, ticker, payload JSON)`
- ➕ `options_snapshots(ticker, as_of, expiry, chain_summary JSON, iv_atm, provider, quality)` — enables true IV rank/percentile after ~6 months of accrual
- ✅ `stock_history`, `article_cache`, `social_posts`
- ✅ `recommendation_decisions` ➕ column `strategy_version` (skill changelog hash) ➕ `evidence_refs JSON`
- ✅ `recommendation_outcomes` ➕ horizons 20, 60
- ✅ `factor_stats` ➕ column `regime` (from FRED score bucket)
- ➕ `strategy_versions(id, created_at, skill_json, parent_id, reason, validation JSON)`
- ➕ `trade_reconciliation(trade_id, decision_id, relation, verdict, computed_at)`
- ➕ `alerts(id, rule, ticker, fired_at, payload, delivered, fingerprint)`
- Harness-owned: `agent_memory` (episodic lessons) — keep separate; promote recurring lessons to a curated `knowledge/` file by hand, not automatically.

Migration path: dual-write runs to SQLite → switch readers table-by-table (news first, biggest win) → store.json becomes export format only.

### 8.3 LLM / agent architecture

- Keep the **tier router + per provider×tier circuit breakers** (proven design). Azure MT for titles; flash-class for summaries; reasoning-class for narrative/editorial/advice; codex-cli now available as a provider.
- **Harness debate** stays out-of-process with read-only tools; wire-in stays ingest-only. Promotion path for the debate gate: shadow (now) → cap (after ≥50 gated decisions show worse outcomes for vetoed names) → hard veto (only if the effect persists across regimes).
- **Chat should become tool-calling** (V3-5): expose the 7 existing read-only harness HTTP tools to the Node chat endpoint; budget ≤4 tool calls; fall back to current static-context chat on failure.
- Every LLM output surface carries its provider badge (done) and a `basis` list (which tool/data it read) — extend from news cards to advice and debate cards.

### 8.4 Recommendation-engine architecture

Keep: factor snapshot → normalization → weighted alpha score → multipliers → gates → action. Add:

1. **Strategy versioning**: hash the skill JSON on every change; stamp decisions; changelog entry references validation results.
2. **Validation gate for learning**: learned weights are written to a *candidate* strategy version; nightly walk-forward compares candidate vs. active on trailing 60–90 days (precision@10, excess, MaxDD); auto-adopt only if candidate ≥ active on excess **and** not worse on MaxDD; otherwise keep candidate as shadow and log.
3. **Regime tagging**: every decision/outcome/factor-stat row gets the FRED regime bucket; stats views must support regime filtering.
4. **Cooldown + actionable cap**: per-ticker re-recommendation cooldown (default 5 trading days); UI shows ≤3 actionable, rest research.
5. **Horizons**: extend `reviewAfterDays` to `[1,3,5,10,20,60]` (60 for thesis-level review only, excluded from weight learning until sample counts justify).

### 8.5 IBKR architecture

- **Phase R (read, now)**: Flex import (done) + scheduled read-only position/execution sync via socket bridge → `trades` with `source=ibkr`; never write to IBKR.
- **Phase P (paper, next)**: user-facing paper portfolio that mirrors *accepted* recommendations (distinct from the agent's own paper book), so the owner can "accept" a call and track it without money.
- **Phase D (drafts, P3, optional)**: order *drafts* generated from accepted recommendations with position-sizing suggestions; a human copies them into TWS manually. No API order submission on this roadmap (see §6.5).
- Audit log table for every recommendation shown → accepted/rejected → (if ever) draft created. Live trading remains out of scope; double-locked (`env` + marker file) if ever revisited.

---

## 9. Safety, compliance, and risk-control principles

1. No autonomous live trading; no order-submission code paths.
2. LLM never writes scores, gates, or weights; mechanical learning only, capped and validated (§8.4).
3. Every recommendation displays: uncertainty (confidence + sample count of the underlying stats), risks, invalidation conditions, data-quality score, and source identifiers.
4. Missing data > wrong data: factors without data score 50 (neutral) with `missingReason`, and the quality multiplier discounts the whole score — never impute bullishness.
5. Frozen records are immutable: decisions/outcomes are never recomputed retroactively; corrections append, not overwrite.
6. All external-source failures are surfaced (diagnostics panel), never silently swallowed (repo currently has zero empty catch blocks — keep it that way in review).
7. The system's own track record (paper book, per-rule stats) must be visible on the same screen as its recommendations — no confident UI atop an unproven engine.
8. Local-only by default (localhost bind); if ever exposed, add auth before anything else; keys live in `.env` (gitignored) only.

---

## 10. Data-quality and source-traceability requirements

- Every news item: canonical URL, publisher, published-at, extraction status (`body/summary/title-only/shell`), info score, translation provider, ownership category (`direct_company/related/macro/ambiguous` — already in `semanticNewsOwnership`).
- Every factor: `source`, `quality (0-100)`, `missingReason`, normalization method + peer group (already in snapshot; surface it).
- Every recommendation: `dataQualityScore`, per-factor evidence refs, strategy version, regime tag.
- Every outcome: price provenance (which provider's close), benchmark basket composition.
- Data-quality audit bus (V3-3B): one JSON per decision answering "which data was real, which was missing, what quality" — render as expandable audit block on advice cards.

---

## 11. Proposed API endpoints (delta over the existing 54)

| Endpoint | Purpose |
|---|---|
| `GET /api/recommendations/today` | Actionable (≤3) + research list + track-record summary in one payload |
| `GET /api/recommendations/track-record?horizon=&regime=` | Decisions+outcomes+paper book, filterable |
| `GET /api/strategy/versions` / `POST /api/strategy/adopt` | Version history; manual adopt/rollback of candidate weights |
| `GET /api/stock/:ticker/research` | One-call consolidated research view (quote/technicals/fundamentals/consensus/insider/options/news/debate/chain) |
| `GET /api/stock/:ticker/iv-history` | From new `options_snapshots` table |
| `POST /api/trades/reconcile` / `GET /api/trades/reconciliation` | Trade↔decision reconciliation reports |
| `POST /api/paper-portfolio/accept` | Owner accepts a recommendation into the personal paper portfolio |
| `GET /api/alerts` / `POST /api/alerts/rules` | Intraday alert rules + history (engine exists; needs rule CRUD) |
| `POST /api/chat` (upgrade) | Tool-calling chat (same route, new capability) |

---

## 12. Proposed UI screens and flows

1. **Today (morning flow)**: freshness badge → market regime + editorial → 3–8 clustered stories (not 40 cards) → movers-with-reasons → earnings countdown → *Today's calls*: ≤3 actionable + collapsed research list, each with confidence/quality/evidence chips → system health strip. (Replaces scattered home panels; mostly re-composition.)
2. **Stock deep-dive**: header (quote/action/score) → factor breakdown w/ evidence per factor → business & chain (upgraded pack) → expectations (consensus vs. reverse-DCF gap, target-price distribution) → insider/institutional → options (chain, GEX, IV history once accrued) → news timeline → debate (deterministic + LLM w/ provider badges) → invalidation conditions.
3. **Recommendations & track record**: calls table (filter by action/regime/horizon) → outcome curves vs. benchmark → per-rule/per-factor stats w/ sample counts → paper book equity curve → strategy version timeline w/ adopt/rollback.
4. **Portfolio & review**: positions w/ risk → reconciliation view ("your trades vs. system calls") → behavior analytics → review todos → lessons memory browser.
5. **System**: source diagnostics, provider cooldowns, store health, schedule health, config. (Exists; keep.)

---

## 13. Prioritized roadmap

### P0 — Foundation hardening (make it dependable)
| Task | Why | Where |
|---|---|---|
| P0.1 SQLite-primary migration, phase 1: `news_items` + slim `runs` dual-write, switch news readers | 93 MB single-file store is the top operational risk (B1) | `saveStore`/`ensureStore`, `sqlite_store_sync.py` → becomes writer library |
| P0.2 Strategy versioning + decision stamping | Auditability; prerequisite for validation-gated learning | `maybeUpdateAllStockAgentSkill`, decisions schema |
| P0.3 Horizons +20/+60 & regime tagging on decisions/outcomes/factor_stats | Regime-split evaluation; longer-horizon truth | `buildAllStockAgentOutcomeSnapshots`, skill settings |
| P0.4 Data-quality audit block on every advice card (V3-3B) | Trust; "which data is real" at a glance | advice builders + app.js card renderer |
| P0.5 `options_snapshots` accrual table (ticker, as_of, iv_atm, quality) | Unblocks true IV rank later; cheap now, impossible retroactively | options collector post-processing |

### P1 — Assistant core (make it useful daily)
| Task | Why | Where |
|---|---|---|
| P1.1 Today page re-composition + story clustering (V3-3C) + actionable-vs-research split + per-ticker cooldown | The daily 10-minute loop; anti-overtrading | app.js home, new clustering pass over run news |
| P1.2 Consolidated stock research endpoint + deep-dive page (§12.2) | The "understand a company fast" goal | new route aggregating existing packs |
| P1.3 Value-chain enrichment: replace keyword heuristic with curated per-industry chain templates + LLM-extracted (but source-cited) supplier/customer/competitor lists cached per ticker | Biggest research-depth gap (G2) | `buildIndustryChainPackFromContext` |
| P1.4 Earnings-call transcript ingestion (source: Longbridge notice/report detail if available; else Motley Fool/Seeking Alpha RSS where permitted; else skip with honest gap) + LLM summary w/ guidance extraction | 0 transcript refs today; earnings are the #1 catalyst | new collector + `news_items` provenance |
| P1.5 Trade↔recommendation reconciliation (§6.7) | Highest personal value per engineering hour | trade journal × decisions join |
| P1.6 Tool-calling chat (V3-5) | "Ask the desk" becomes real | `/api/chat` + harness tool specs |

### P2 — Learning loop hardening
| Task | Why |
|---|---|
| P2.1 Validation gate: candidate weights must beat active on trailing walk-forward before adoption (§8.4.2) | Prevents drift adoption |
| P2.2 Regime-split stats views + precision@K/excess/MaxDD/hit/payoff/rankIC dashboard per version | Evaluation completeness |
| P2.3 User paper portfolio (accept-a-call) | Safe rehearsal before any real money follows a call |
| P2.4 Lessons memory surfacing: recall relevant harness lessons onto stock pages ("last time this setup...") | Makes memory real, keeps it advisory |
| P2.5 PIT universe snapshot (daily liquid-universe list persisted) | Starts fixing survivorship for future backtests |

### P3 — Advanced (only after P0–P2 prove out)
- Multi-agent debate default-on for top-N candidates (invoker latency/cost permitting), promotion of debate gate per §8.3.
- Portfolio-level risk assistant (correlation/concentration heatmap, vol-target sizing, regime stress scenarios — V3-7).
- Real-time IBKR execution monitoring (socket event stream → journal).
- Order-draft workflow w/ mandatory human approval — **only** behind double-lock, after 2+ quarters of validated paper outperformance; may reasonably never ship (§6.5).

---

## 14. Acceptance criteria (major features)

- **P0.1**: `/api/state` p95 < 300 ms with store.json ≤ 10 MB residual; kill -9 during save loses at most one run's delta; news queries served from SQLite.
- **P0.2–P0.3**: every new decision row has `strategy_version` + `regime`; outcomes exist for 20d horizon after 20 trading days; factor_stats filterable by regime with correct sample counts.
- **P0.4**: any advice card can answer "which data was missing" without opening dev tools.
- **P1.1**: home shows ≤ 8 stories and ≤ 3 actionable calls; a ticker recommended on day T is not re-shown as new before T+5 without a thesis-change flag.
- **P1.3/P1.4**: for 10 benchmark tickers (AAPL, NVDA, AVGO, MRVL, TSLA, MSFT, AMZN, LLY, JPM, XOM), the deep-dive shows non-empty, source-cited chain data and (where a call exists) a transcript summary with guidance numbers matching the source.
- **P1.5**: reconciliation report classifies ≥ 90% of imported IBKR trades into {aligned, contrarian, uncovered} with linked decision IDs.
- **P2.1**: no weight adoption without a stored validation record showing candidate ≥ active on excess and ≤ on MaxDD; rollback restores prior version byte-identically.
- **Backtest honesty**: every backtest render carries its universe caveat (in-sample watch/discovery universe) until P2.5 lands.

---

## 15. Backtesting & evaluation framework

- **Data**: `stockHistory` snapshots (current), `options_snapshots` (accruing), PIT universe list (P2.5), delisted handling deferred (documented bias until then).
- **Protocol**: walk-forward only (train ≤ T, decide at T, score at T+h with frozen prices); no same-day close for same-day signals; benchmark = decision-time-frozen basket (SPY/QQQ/sector, already implemented).
- **Metrics**: per horizon × regime: excess return, hit rate (deadband ±0.5%), precision@10, payoff ratio, expectancy, MaxDD, turnover, rankIC per factor; report sample counts everywhere; no metric shown without n.
- **Anti-patterns to enforce in review**: no repainting frozen rows; no selecting best horizon post-hoc for headline numbers; no factor promoted on < 20 samples or single-regime evidence.

---

## 16. How the system learns (without look-ahead or uncontrolled self-modification)

1. **Mechanical channel (weights)**: frozen outcomes → per-factor differential edge (fired-vs-not, benchmark-relative, deadbanded) → capped ≤2%/step updates with skipped-factor freezing → **candidate version** → walk-forward validation gate → adopt/rollback with recorded reason. The LLM is not in this channel.
2. **Knowledge channel (lessons)**: harness `review_attributor` writes attributed lessons (alpha-vs-beta, what worked/failed, trigger conditions, regime) into episodic memory; lessons are *recalled as context* for future analysis and surfaced to the owner; promotion to durable knowledge files is a human act. Lessons never modify weights.
3. **Rule channel (skill rules)**: adding/removing rules stays human-only; the skill's own constitution (no rule deletion, no new high-risk rules, small weight steps) is retained.

---

## 17. Open questions & technical risks

1. **LLM invoker latency/cost**: antigravity-cli/codex-cli latencies constrain how many tickers get real debates; the eval harness (`scripts/evaluate_llm_invokers.py`, `docs/LLM_INVOKER_EVAL_REPORT.md`) should drive the default; debate may need to stay top-5-candidates-only.
2. **Transcript sourcing legality/stability**: no free, reliable, ToS-clean transcript source is guaranteed; P1.4 may land as "guidance extraction from post-earnings news bodies" instead — acceptable fallback, label honestly.
3. **Longbridge dependency concentration**: editorial, movers, consensus, calendar, fundamentals all lean on one authenticated CLI; if it breaks, market intelligence degrades broadly. Mitigation: keep fallback collectors alive in diagnostics, document a degradation ladder.
4. **Sample starvation**: with ~10 buys/day, per-factor×horizon×regime cells fill slowly; expect 1–2 quarters before weight learning has authority; resist the urge to lower `minSamples`.
5. **Store migration risk**: dual-write must be checksummed (row counts + spot hashes) before any reader switch; keep store.json export path forever.
6. **Monolith gravity**: server.mjs at 37.9k lines still grows; each P1 feature should extract its module (collectors next) rather than append.
7. **Single-user assumptions**: no auth, localhost-only; fine for now, but any remote access idea must trigger the auth question first.

---

## 18. One-line conclusion

The repository already contains a rigorous, safety-first recommendation engine with real accountability mechanics — rarer than any feature; the roadmap's job is to (P0) make the data layer worthy of it, (P1) deepen single-stock research and consolidate the daily surface, (P2) let the learning loop earn authority through validation gates and regime-split evidence, and (P3, maybe never) touch order workflows — while keeping the LLM as analyst and narrator, never as the hand on the wheel.
