# Investment Assistant Roadmap v2

**Repository:** https://github.com/issac1998/market-pulse-ai  
**Target file:** `docs/INVESTMENT_ASSISTANT_ROADMAP_v2.md`  
**Review date:** 2026-07-02  
**Purpose:** product, architecture, quant, LLM-agent, IBKR, safety, and implementation roadmap for evolving the current project into a useful personal U.S. equities investment assistant.

---

## 0. Review scope and evidence basis

This roadmap treats `market-pulse-ai` as an existing local U.S. equities research workstation, not as a greenfield trading bot.

The review is based on the repository README, existing docs, public directory structure, visible raw source files, and the code/documentation inventory available through the public GitHub interface. The most important caveat is that `server.mjs` is a very large monolithic file, reported by GitHub as roughly 37,922 lines / 1.58 MB. Because the public raw fetch was not fully usable in this review environment, route-level details in this document should be verified with a local grep/static-inventory pass. The roadmap therefore includes a P0 route and schema inventory task before implementation work that depends on exact route names.

Reviewed evidence included:

- `README.md`: current product description, features, API examples, data sources, LLM routing, storage, scheduler, IBKR posture, and testing commands.
- `docs/`: existing design and execution docs, including all-stock agent, recommender evolution, configuration, LLM invoker evaluation, research sources, and hardening plans.
- `lib/recommender_core.mjs`: factor weights, factor normalization, scoring, benchmark basket construction, outcome scoring, MAE/MFE utilities, and controlled factor-weight learning logic.
- `lib/market_core.mjs`: market/calendar utilities and shared market helpers.
- `server/`: modular server helpers and `all_stock/debate_gate.mjs`.
- `scripts/`: Python/Node bridges for AkShare, OpenBB, IBKR Gateway, article extraction, YouTube search, SQLite sync, diagnostics, and regression tests.
- `harness/`: Python agent runtime with agents, invokers, memory, tools, orchestrators, and tests.
- `public/`: vanilla browser UI assets and configuration pages.
- `strategies/`: all-stock strategy skill and strategy configuration.

This document is intentionally critical. It does not assume that daily recommendations, social heat, options flow, or LLM-generated theses are automatically useful. The central design principle is: **the LLM may explain, challenge, synthesize, and review, but it must not be the sole decision maker for investment recommendations or trades.**

---

## 1. Executive summary

`market-pulse-ai` is already a substantial MVP for a local U.S. equities information desk. It currently appears to combine quotes, news, SEC filings, social heat, options chains, macro inputs, trade logs, paper/review workflows, and multi-agent analysis into a Chinese-language research interface. It also has documented scheduler support for pre-market/post-market collection, source fallbacks, LLM routing, and explicit safety defaults around IBKR: read-oriented integration, paper mode, and no automatic live trading by default.

The correct next step is **not** to ask the system to “become an AI trader.” That framing is too broad, dangerous, and likely to create untestable behavior. The correct next step is to turn the existing research station into an **auditable decision-support system** with:

1. A unified, versioned factor snapshot for every ticker and recommendation.
2. A first-class data-quality audit layer.
3. Decision logs that freeze inputs, scores, thesis, risk gates, and model/strategy versions.
4. Benchmark-relative outcome tracking at T+1, T+3, T+5, T+10, T+20, and longer horizons.
5. Controlled backtesting and walk-forward evaluation before any strategy rule or factor-weight change.
6. Read-only IBKR synchronization and post-trade review before any order workflow.
7. A single-stock research dashboard that separates facts, estimates, LLM synthesis, and unsupported assumptions.
8. Market-intelligence workflows that distinguish signal from noise and identify which sources support each claim.

The repository already has many of the building blocks. The biggest product risk is feature sprawl: market news, social heat, options flow, LLM debate, IBKR, paper trading, and recommendation learning can easily become a noisy dashboard without a disciplined evidence model. The roadmap should therefore prioritize **schema, reproducibility, traceability, and evaluation** before adding more data feeds or autonomous behavior.

The recommended implementation order is:

- **P0 — Foundation:** codebase inventory, data-quality audit, factor snapshot persistence, recommendation decision log, outcome freezer, benchmark-relative metrics, IBKR read-only hardening, and this documentation.
- **P1 — Investment assistant core:** market hotspot engine, single-stock research page, peer/value-chain enrichment, options analytics, recommendation dashboard, and post-trade review.
- **P2 — Learning loop:** walk-forward backtesting, precision@K/excess-return/rank-IC/regime evaluation, strategy versioning, paper portfolio, controlled factor-weight updates, and long-term lesson memory.
- **P3 — Advanced assistant:** multi-agent debate, portfolio-risk assistant, real-time IBKR execution monitoring, optional live-order draft workflow with mandatory human approval, and interactive trade-review reports.

The system should remain explicitly non-autonomous for live trading unless a much stricter safety, audit, paper-trading, and human-approval layer is implemented and tested.

---

## 2. What the current project does

Based on the README and existing docs, the current project is best described as a **local U.S. stock research and monitoring workspace**. It is not a conventional broker terminal, not a purely quantitative backtester, and not a generic chatbot. It sits between a data collector, a research dashboard, an LLM summarizer, a stock-candidate agent, and a trade-review notebook.

### 2.1 Current user-facing intent

The project currently aims to help the user:

- Run local pre-market and post-market market collection.
- Gather market, stock, SEC, quote, options, macro, social, and news data.
- Produce Chinese summaries and structured market reports.
- Chat with local context assembled from market data.
- Track candidate recommendations and later outcomes.
- Review personal trades and paper positions.
- Use LLM routing and agent harnesses for richer analysis.

The README explicitly describes the system as a local research and information-assistance tool and warns against treating it as guaranteed investment advice or autonomous trading infrastructure.

### 2.2 Existing high-level capabilities

The repository appears to already contain the following capabilities:

| Area | Current capability | Current maturity assessment |
|---|---|---|
| Market dashboard | Chinese homepage with market overview, watchlist, reports, source health, scheduler status, and configuration links | Useful MVP; should be reorganized around evidence quality and workflows |
| Scheduled collection | NYSE pre-market/post-market scheduler and manual run endpoints | Strong foundation; should add run manifests and reproducible collector snapshots |
| News | RSS/Google News/financial sites, article extraction, summaries, facts, why-it-matters, verification actions | Useful; needs source-item IDs, claim-level traceability, duplicate clustering, and catalyst taxonomy |
| SEC | SEC EDGAR collection and summaries | Useful; needs filing-type-specific parsers and financial event tagging |
| Quotes / bars | Longbridge, IBKR, OpenBB, Yahoo/Nasdaq/Finnhub fallbacks depending on module | Useful; needs normalized quote-bar schema and quote freshness warnings |
| Social heat | ApeWisdom, Stocktwits, Reddit/RSS, optional X, TrendRadar, Xiaohongshu CLI | Good discovery layer; should never be treated as standalone buy signal |
| Options | IBKR Socket priority plus Nasdaq/Yahoo/Finnhub fallback for option chain and GEX-style views | Valuable but fragile; needs source-quality scoring, stale-chain detection, IV rank/percentile, and validation |
| Single-stock detail | Quote, K-line, moving averages, valuation/news/SEC/research proxy/peers/value chain/options | Good shell; should become a structured research dashboard with persistent research packs |
| All-stock agent | Candidate scan, buy/watch/sell/hold checks, rule hits, paper book, outcome accountability | Strong direction; must be grounded in frozen factor snapshots and benchmark-relative evaluation |
| Recommender core | Default factor weights, factor normalization, score/risk gates, benchmark baskets, outcome scoring, controlled factor learning | Important foundation; should be made fully persistent, visible, and testable |
| Trade review | FIFO review, positions, paper book, T+1/3/5/10 accountability | Valuable; should be linked to IBKR-imported trades and behavioral error taxonomy |
| IBKR | Flex sync and read-only Gateway/TWS-style integration are documented; default live trading disabled | Correct safety posture; deepen read-only sync before any execution workflow |
| LLM routing | Codex CLI, Antigravity CLI, Gemini, OpenAI API, local fallback depending on task | Useful but needs schema validation and prompt/version governance |
| Agent harness | Python runtime with bull/bear/risk/coordinator/review agents, memory, tools, debate/review orchestrators | Good advanced layer; should be read-only and evidence-constrained |
| Storage | `data/store.json`, archived runs, and SQLite mirror | Adequate MVP; decision/outcome/audit records should become explicit relational tables |

### 2.3 What the project should not be treated as

The system should not be described or designed as:

- A guaranteed profitable trading system.
- A fully autonomous trading bot.
- An LLM that independently decides whether to buy or sell.
- A social-media trend follower.
- A black-box recommendation engine with no reproducibility.
- A live order router until paper-trading, audit, human approval, and strategy-validation requirements are satisfied.

---

## 3. Current architecture overview

### 3.1 Likely current architecture

The current architecture is a local-first, mostly monolithic Node/vanilla-JS application with Python bridges and a separate Python agent harness.

```text
Browser UI
  public/index.html
  public/app.js
  public/styles.css
  public/configuration.html
  public/configuration.js
        |
        v
Node HTTP application
  server.mjs                    # main server, API routes, orchestration, scheduler, storage glue
  server/*.mjs                  # helper modules: HTTP, runtime, static files, fetch, email, env, errors
  lib/*.mjs                     # pure finance/recommender/market utilities
        |
        +--> data collectors / bridges
        |      scripts/akshare_bridge.py
        |      scripts/openbb_bridge.py
        |      scripts/ibkr_gateway_bridge.py
        |      scripts/article_extractor.py
        |      scripts/youtube_search.py
        |      scripts/xhs_search.py
        |
        +--> LLM routing
        |      Codex CLI / Antigravity CLI / Gemini / OpenAI / local rules
        |
        +--> Agent harness
        |      harness/agents/*.md
        |      harness/orchestrator/*.py
        |      harness/tools/*.py
        |      harness/memory/sqlite_memory.py
        |
        v
Local storage
  data/store.json               # operational local state/cache
  archived runs                 # historical run outputs
  SQLite mirror                 # query/evaluation/agent memory mirror
```

### 3.2 Architectural strengths

- **Local-first design:** good for privacy, iterative development, and personal research workflows.
- **Broad source coverage:** the project already aggregates multiple market, news, SEC, social, options, and macro sources.
- **Existing safety defaults:** IBKR is documented as read/paper-oriented with live trading disabled by default.
- **LLM is already routed by task:** article summaries, chat, investment review, global news, and fallback behavior are separated.
- **Pure recommender utilities exist:** `lib/recommender_core.mjs` already contains factor weights, scoring, risk gates, benchmark baskets, outcome scoring, and controlled learning utilities.
- **Agent harness is isolated:** the Python harness can support multi-agent research without making the Node server even larger.
- **Documentation culture is present:** the repo already has extensive planning and design documents.

### 3.3 Architectural weaknesses

- **`server.mjs` is too large.** A 37k-line main server file is difficult to review, test, and safely modify. It may be acceptable for an MVP, but recommendation, IBKR, data-quality, scheduler, source, route, and storage concerns should be incrementally separated.
- **Data contracts are not visible enough.** Many features likely operate through ad hoc JSON state. The assistant vision requires stable schemas for source items, factor snapshots, decisions, outcomes, trades, reviews, and audit logs.
- **Source traceability needs to be first-class.** Every recommendation and LLM synthesis should carry source item IDs, freshness, collection time, and quality status.
- **Backtest/live parity is not guaranteed.** The same scoring path should be used by live daily recommendations, historical backtests, paper trades, and post-hoc evaluation.
- **LLM outputs need stricter schemas.** LLMs should produce typed claims, evidence links, assumptions, risks, and invalidation conditions. Free-form prose should not feed trading decisions directly.
- **Options/social data may be over-weighted by perception.** These are often high-noise inputs; they need reliability gates and explicit downgrading when incomplete or stale.
- **IBKR scope can creep.** Read-only sync is useful; live order capability is a separate, high-risk product requiring strict gating.

---

## 4. Codebase map

This map is based on the visible repository structure and should be converted into a generated inventory document in P0.

### 4.1 Root-level folders and files

| Path | Role | Recommended treatment |
|---|---|---|
| `README.md` | Main product overview, setup, data sources, API examples, safety posture | Keep as concise user/operator doc; move deep architecture details into docs |
| `server.mjs` | Main Node HTTP app, API routing, orchestration, scheduler, state/report logic | Gradually split by domain; add route inventory tests before large edits |
| `server/` | Helper modules and all-stock submodules | Continue extracting modules here |
| `lib/` | Shared pure JavaScript finance, market, recommender logic | Best place for deterministic scoring, calendars, math, validation utilities |
| `public/` | Vanilla frontend app and config UI | Keep simple; add screens around decisions, factor waterfall, data quality, trade review |
| `scripts/` | Python/Node bridges, data fetches, article extraction, diagnostics, SQLite sync | Good integration layer; standardize JSON contracts and failure semantics |
| `harness/` | Python agent runtime, tools, memory, orchestrators, tests | Use for multi-agent analysis and trade review; keep read-only by default |
| `strategies/` | Strategy skill documents and JSON strategy config | Version strategy configs; link each recommendation to exact strategy version |
| `docs/` | Design, evaluation, hardening, config, and source docs | Keep this roadmap here; de-duplicate stale roadmap docs over time |
| `data/` | Local runtime state, archives, SQLite mirror, caches | Do not commit sensitive data; separate cache vs audit-grade records |

### 4.2 Key backend components

| Component | Current role | Roadmap role |
|---|---|---|
| `server.mjs` | Main API, scheduler, data collector orchestration, state, reports, likely all-stock/recommender routes | Should become thin app/router plus domain modules over time |
| `server/network_fetch.mjs` | Network fetch helper | Centralize timeout, retry, source status, and error classification |
| `server/http_requests.mjs` / `server/http_responses.mjs` | HTTP request/response helpers | Keep route handling consistent; add schema validation errors |
| `server/email_delivery.mjs` | Resend/SMTP delivery | Keep separate; include report audit IDs in outbound emails |
| `server/env_utils.mjs` | Environment/config helpers | Expand for safety flags and IBKR mode enforcement |
| `server/runtime_utils.mjs` / `process_errors.mjs` | Runtime and error helpers | Add structured error codes and source-health integration |
| `server/static_files.mjs` | Static frontend serving | Keep simple |
| `server/all_stock/debate_gate.mjs` | All-stock debate gate support | Integrate as shadow/review layer, not direct decision layer |
| `lib/recommender_core.mjs` | Factor weights, scoring, risk gates, benchmark baskets, outcomes, factor learning | Anchor deterministic recommendation engine here |
| `lib/finance_math.mjs` | Finance math utilities | Add tested valuation, returns, drawdown, volatility, beta, and payoff utilities here |
| `lib/market_core.mjs` | Market/calendar utilities | Add market session, benchmark, and regime helper functions here |

### 4.3 Key scripts

| Script | Current role | Roadmap role |
|---|---|---|
| `scripts/akshare_bridge.py` | AkShare data bridge | Normalize output contracts and freshness metadata |
| `scripts/openbb_bridge.py` | OpenBB bridge | Use for fundamentals, quotes, research data where available; cache and validate output |
| `scripts/ibkr_gateway_bridge.py` | IBKR Gateway/TWS bridge | Read-only account/positions/orders/executions/quotes/history/options sync; no live orders in P0/P1 |
| `scripts/article_extractor.py` | News article extraction | Emit source item ID, extraction confidence, article text hash, summary status |
| `scripts/youtube_search.py` | Optional YouTube search | Use as discovery only; never as direct recommendation input without corroboration |
| `scripts/xhs_search.py` | Optional Xiaohongshu source | Treat as social/noise source; require validation |
| `scripts/sqlite_store_sync.py` | SQLite mirror sync | Expand into audit-grade schema sync/migration tool |
| `scripts/core_regression_tests.mjs` | Regression tests | Expand for factor snapshot, scoring, outcome freezer, and IBKR safety tests |
| `scripts/evaluate_llm_invokers.py` | LLM invoker evaluation | Add schema-validity, hallucinated-source, latency, and cost metrics |
| `scripts/install_launch_agent.sh` / `uninstall_launch_agent.sh` | macOS launch agent scheduler helpers | Keep operator docs clear; log run IDs and failures |

### 4.4 Frontend components

| Path | Current role | Roadmap role |
|---|---|---|
| `public/index.html` | Main app shell | Add navigation for market intelligence, stock research, recommendations, trades, evaluation |
| `public/app.js` | Main browser UI logic | Break into logical UI modules if it becomes large: market, stock, recs, trades, config |
| `public/styles.css` | Styling | Add visual hierarchy for evidence quality, warnings, factor waterfalls, decision states |
| `public/configuration.html` / `configuration.js` | Config center and diagnostics | Add read-only/live safety state banner and IBKR mode checks |
| `public/docs/` | Static docs exposed in UI | Link this roadmap and acceptance criteria |

### 4.5 Agent harness

| Path | Current role | Roadmap role |
|---|---|---|
| `harness/agents/bull_researcher.md` | Bull case agent | Must cite source IDs and explicit assumptions |
| `harness/agents/bear_researcher.md` | Bear case agent | Must identify invalidation, red flags, and missing data |
| `harness/agents/risk_manager.md` | Risk agent | Should enforce risk gates and position constraints |
| `harness/agents/coordinator.md` | Coordinator | Aggregates debate; must not override deterministic gates |
| `harness/agents/review_attributor.md` | Trade/recommendation review agent | Map actual trades to prior thesis and behavioral taxonomy |
| `harness/orchestrator/debate.py` | Debate orchestration | Use for research review/shadow debate, not first-pass scoring |
| `harness/orchestrator/review.py` | Review orchestration | Use for post-trade review and failed thesis analysis |
| `harness/tools/http_tools.py` | HTTP tool access | Read-only API tools; no order submission tools in P0/P1 |
| `harness/tools/sqlite_tools.py` | SQLite read tools | Query decisions/outcomes/trades for evaluation and review |
| `harness/memory/sqlite_memory.py` | Persistent memory | Store lessons as qualitative notes linked to evidence, not as direct strategy mutation |

---

## 5. Critical assumptions to challenge

### 5.1 “The LLM should generate direct trade recommendations”

This assumption is only partially valid. The LLM can generate a thesis, explain evidence, challenge assumptions, and identify risks. It should not be the sole decision maker because it is not deterministic, can overfit recent narratives, can hallucinate unavailable evidence, and can overweight vivid news.

**Better design:** deterministic factor scoring + data-quality gate + risk gate + portfolio gate + benchmark-relative evaluation, with LLM synthesis as an explanatory layer.

### 5.2 “Daily recommendations are always useful”

Daily recommendations may create overtrading, especially for a personal account. A daily agent should produce four different categories:

- **Research ideas:** interesting but not actionable.
- **Watchlist candidates:** need a trigger or better data.
- **Actionable candidates:** pass data, risk, and portfolio gates.
- **Avoid/sell/exit-review candidates:** thesis impaired, poor setup, or risk exposure too high.

The system should include an anti-overtrading gate: max new actionable ideas per day, ticker cooldown periods, earnings blackout rules, and minimum expected edge thresholds.

### 5.3 “Social heat and news hotspots predict returns”

Social and news attention often measure **attention**, not investable edge. A spike in attention can be useful for discovery and risk monitoring, but it can also mark a crowded, late, or low-quality trade.

**Better design:** social/news hotspots should enter the system as catalyst and attention features with low base weights, source reliability scores, and corroboration requirements.

### 5.4 “Options flow is a strong signal”

Options-chain and unusual-flow data are easy to misread. Large trades may be hedges, rolls, spreads, dealer positioning adjustments, or stale/misclassified prints. Public chain snapshots are not a reliable substitute for full OPRA trade-level data.

**Better design:** options data should provide risk and sentiment context: IV rank/percentile, skew, term structure, liquidity, event premium, gamma exposure approximation, and unusual activity flags. It should not independently trigger buy recommendations.

### 5.5 “IBKR live trading should eventually be automatic”

Automatic live trading is not a natural extension of a research assistant. It is a separate execution system with materially higher safety, legal, operational, and financial risk.

**Better design:** deepen IBKR read-only sync first. Add paper-trading. Add order drafts only after P0-P2 evaluation quality is credible. Require human approval for any live order. Keep live trading disabled by default.

### 5.6 “The system should self-improve”

Self-improvement is dangerous if it means that an LLM rewrites its own rules based on recent wins/losses. That creates overfitting, look-ahead bias, survivorship bias, and hidden strategy drift.

**Better design:** learning must be controlled, slow, versioned, benchmark-relative, and tested out-of-sample. The LLM may summarize lessons; statistical evaluation should propose factor-weight changes; humans approve strategy changes.

---

## 6. Gap analysis against target investment-assistant vision

### 6.1 Market intelligence

| Target | Current project appears to have | Gap | Priority |
|---|---|---|---|
| Understand current market environment | Market overview, runs, news, macro, hot news, source health | Need unified market regime object and daily market narrative with evidence IDs | P1 |
| Identify market drivers | News, SEC, social, macro, options, movers | Need catalyst clustering, source corroboration, and driver classification | P1 |
| Sector/theme detection | Social hot topics and market hot news | Need theme graph linking tickers, sectors, catalysts, sources, and price action | P1 |
| Confidence and signal/noise distinction | Partial via source health and summaries | Need claim-level confidence and data-quality scoring | P0/P1 |
| Risk-on/risk-off signals | Macro/regime docs suggest existing work | Need explicit regime snapshot and backtested usefulness | P1/P2 |

### 6.2 Single-stock research dashboard

| Target | Current project appears to have | Gap | Priority |
|---|---|---|---|
| Business overview | Company/profile data via Longbridge/OpenBB/LLM possible | Need persistent `company_profile` and segment schema | P1 |
| Revenue drivers and products | Business segments mentioned in README/config docs | Need structured segment revenue, product taxonomy, source dates | P1 |
| Industry and peers | Peer/proxy support exists | Need peer-set governance and benchmark basket logic visible in UI | P1 |
| Upstream/downstream chain | Existing UI/docs mention upstream/downstream | Need evidence-backed supply-chain relationships, confidence, and source IDs | P1 |
| News/SEC/earnings/analyst summaries | News and SEC exist; analyst/research proxy exists | Need normalized event timeline and earnings-call ingestion | P1 |
| Financial metrics/valuation/technical/options | Existing stock detail has many of these | Need factor snapshot waterfall and data freshness warnings | P0/P1 |
| Buy/hold/avoid assessment | Existing all-stock agent and recommender core | Need frozen decision record and reproducible scoring | P0 |

### 6.3 Multi-factor investment analysis

| Target factor layer | Current state | Gap | Priority |
|---|---|---|---|
| Business quality | Partial via fundamentals/profiles | Need normalized quality factors and peer baselines | P1 |
| Growth | Partial fundamentals | Need trailing/forward growth and revision source handling | P1 |
| Valuation / expectation gap | Recommender docs/core include valuation-expectation factor | Need visible calculation, peer normalization, and stale-data detection | P0/P1 |
| Analyst revisions | Research/report proxy mentioned | Need actual revision events, estimate deltas, and source license review | P1/P2 |
| News catalysts | Summaries and hot news exist | Need catalyst ontology and duplicate clustering | P1 |
| Industry/supply chain | Partial UI/data | Need structured relationships and peer/value-chain confidence | P1 |
| Technical setup | K-line, moving averages, momentum likely exist | Need tested technical factor library and avoiding look-ahead | P0/P1 |
| Options chain | Option chain and GEX exist | Need IV rank/percentile, liquidity, event premium, reliability gates | P1 |
| Macro/sector regime | Macro/regime docs exist | Need regime splits in evaluation | P2 |
| Portfolio fit | Docs/core suggest portfolio fit exists or planned | Need actual portfolio exposure from IBKR/paper book and constraints | P1/P2 |
| Risk gates | Recommender core includes gate concepts | Need UI/audit visibility and hard-veto tests | P0 |

### 6.4 Daily recommendation agent

| Requirement | Current state | Gap | Priority |
|---|---|---|---|
| Daily candidates | All-stock agent exists | Need candidate taxonomy: research/watch/actionable/avoid/sell | P0/P1 |
| Timestamped records | Existing run archives and decision docs suggest partial support | Need explicit `recommendation_decisions` table | P0 |
| Data snapshot | Factor snapshot utilities exist | Need persisted snapshot linked to each decision | P0 |
| Outcome tracking T+ horizons | Docs suggest T+1/3/5/10 support | Need T+20+ and benchmark basket record | P0/P2 |
| Benchmark-relative success | Recommender core has benchmark baskets/outcome tools | Need productionized outcome freezer and dashboards | P0 |
| Paper trading | README/docs mention paper book | Need portfolio accounting, slippage/cost model, and decision linkage | P2 |
| Walk-forward backtesting | Docs suggest API/UI | Need strict no-look-ahead, universe rules, and CI tests | P2 |
| Controlled learning | Recommender core has controlled factor learning | Need governance, holdouts, max-step, human approval workflow | P2 |
| Long-term memory | Harness memory exists | Need lesson schema linked to outcomes and strategy versions | P2 |

### 6.5 IBKR and personal trade review

| Requirement | Current state | Gap | Priority |
|---|---|---|---|
| Read-only account/position/order/execution sync | IBKR Gateway/Flex support documented | Need robust sync tables, account coverage, and audit status | P0/P1 |
| Historical trades via Flex | Flex sync documented | Need import idempotency, mapping to tickers/options, split/corporate-action handling | P0/P1 |
| Real-time execution monitoring | Possible future via Gateway | Should wait until read-only + paper + review are stable | P3 |
| Paper trading before live | Already documented as default | Need paper fill model and portfolio constraints | P2 |
| Human approval gate | Documented future principle | Need dual config + UI confirmation + audit for any order draft | P3 |
| Audit logs | Partial run archives | Need central `audit_events` table | P0 |
| Trading-review LLM | Harness has review agent | Need behavioral taxonomy and linkage to actual trades/recommendations | P1/P2 |
| Portfolio-level review | Position/paper data likely exists | Need exposure, drawdown, concentration, factor exposure, recommendation adherence | P2/P3 |

---

## 7. Recommended product architecture

The product should be organized into seven layers. This does not require a full rewrite; it requires explicit contracts between existing modules.

```text
1. Source ingestion layer
   quotes, bars, news, SEC, macro, social, options, IBKR, research/earnings

2. Normalization and data-quality layer
   source_items, entity linking, freshness, completeness, reliability, duplicate clustering

3. Research and factor layer
   company_profile, peer_set, value_chain, factor_snapshot, market_regime, catalyst_snapshot

4. Deterministic recommendation layer
   scoring, risk gates, portfolio fit, anti-overtrading, action classification

5. LLM synthesis layer
   thesis, counter-thesis, assumptions, risks, invalidation, summary, source-grounded Q&A

6. Decision and audit layer
   recommendation_decisions, strategy_versions, model_versions, audit_events, paper orders

7. Evaluation and learning layer
   outcomes, backtests, walk-forward validation, factor statistics, controlled weight changes, lessons
```

### 7.1 Product principles

1. **Evidence before narrative.** LLM narrative must be downstream of structured evidence.
2. **Every recommendation must be reproducible.** A future review should be able to reconstruct the exact input snapshot and strategy version.
3. **Missing data is a signal.** Low data quality should reduce confidence or block recommendations.
4. **Benchmarks matter.** Raw returns are not enough; evaluate against SPY, QQQ, sector ETF, and custom benchmark basket.
5. **Portfolio context matters.** A stock can be attractive but still unsuitable because the user already has sector, factor, or single-name exposure.
6. **Do not let the LLM silently change strategy.** Strategy changes require evaluation, versioning, and approval.
7. **Do not default to live trading.** IBKR is first a read-only data source and review feed.

### 7.2 Recommended module boundaries

Refactor only after P0 inventory. Avoid a disruptive rewrite.

Suggested eventual server structure:

```text
server/
  routes/
    market_routes.mjs
    stock_routes.mjs
    recommendation_routes.mjs
    backtest_routes.mjs
    ibkr_routes.mjs
    trade_review_routes.mjs
    config_routes.mjs
    agent_routes.mjs
  services/
    source_registry.mjs
    data_quality_service.mjs
    market_intelligence_service.mjs
    stock_research_service.mjs
    recommendation_service.mjs
    outcome_service.mjs
    ibkr_sync_service.mjs
    trade_review_service.mjs
    audit_service.mjs
  storage/
    store_json_adapter.mjs
    sqlite_adapter.mjs
    migrations.mjs
  schemas/
    source_item_schema.mjs
    factor_snapshot_schema.mjs
    recommendation_schema.mjs
    trade_schema.mjs
    audit_schema.mjs
```

Keep `lib/` for deterministic pure utilities and `harness/` for agentic analysis.

---

## 8. Recommended data architecture

### 8.1 Data layers

| Layer | Purpose | Storage guidance |
|---|---|---|
| Raw source data | Preserve original collector outputs and source metadata | Archive files + SQLite `source_items` index |
| Normalized entities | Tickers, filings, articles, bars, options, social items, macro observations | SQLite tables with JSON payload columns where necessary |
| Derived research data | Profiles, peer sets, value chains, catalysts, factor snapshots | SQLite + cache in `data/store.json` for UI speed |
| Decisions | Frozen recommendation decisions and user decisions | SQLite authoritative |
| Outcomes | T+ returns, benchmark returns, MAE/MFE, thesis hit/miss | SQLite authoritative |
| Trades | IBKR Flex/Gateway trades, executions, orders, positions, paper trades | SQLite authoritative; sensitive data local only |
| LLM artifacts | Prompts, model name, version, output JSON, validation status | SQLite audit + archive summaries |
| Lessons | Qualitative lessons linked to outcomes and regimes | SQLite memory table, never direct self-modification |

### 8.2 Source item model

Every raw input should eventually be represented by a `source_item` record.

```sql
CREATE TABLE IF NOT EXISTS source_items (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_type TEXT NOT NULL,              -- quote, bar, news, sec, social, option, macro, ibkr, research
  source_url TEXT,
  external_id TEXT,
  ticker TEXT,
  title TEXT,
  published_at TEXT,
  collected_at TEXT NOT NULL,
  collector_run_id TEXT,
  raw_hash TEXT,
  normalized_hash TEXT,
  freshness_seconds INTEGER,
  extraction_status TEXT,                 -- ok, partial, failed, fallback
  parse_confidence REAL,
  reliability_score REAL,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
```

### 8.3 Data-quality audit model

```sql
CREATE TABLE IF NOT EXISTS data_quality_audits (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,               -- ticker, market, recommendation, trade_review, backtest
  scope_id TEXT NOT NULL,
  ticker TEXT,
  as_of TEXT NOT NULL,
  completeness_score REAL NOT NULL,
  freshness_score REAL NOT NULL,
  source_reliability_score REAL NOT NULL,
  cross_source_agreement_score REAL,
  fallback_penalty REAL DEFAULT 0,
  stale_fields_json TEXT,                 -- field -> reason
  missing_fields_json TEXT,               -- field -> reason
  warnings_json TEXT,
  source_item_ids_json TEXT,
  final_score REAL NOT NULL,
  created_at TEXT NOT NULL
);
```

### 8.4 Factor snapshot model

```sql
CREATE TABLE IF NOT EXISTS factor_snapshots (
  id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  as_of TEXT NOT NULL,
  market_session TEXT,                    -- premarket, regular, afterhours, closed
  strategy_version TEXT NOT NULL,
  model_version TEXT,
  universe_id TEXT,
  benchmark_basket_json TEXT,
  raw_factors_json TEXT NOT NULL,
  normalized_factors_json TEXT NOT NULL,
  factor_scores_json TEXT NOT NULL,
  data_quality_audit_id TEXT,
  source_item_ids_json TEXT,
  peer_set_id TEXT,
  market_regime_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_factor_snapshots_ticker_asof
  ON factor_snapshots(ticker, as_of);
```

### 8.5 Recommendation decision model

```sql
CREATE TABLE IF NOT EXISTS recommendation_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  as_of TEXT NOT NULL,
  decision_type TEXT NOT NULL,            -- research_idea, watch, actionable_buy, avoid, sell_review, hold
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  data_quality_score REAL NOT NULL,
  factor_snapshot_id TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  model_version TEXT,
  llm_prompt_version TEXT,
  risk_gate_status TEXT NOT NULL,         -- pass, cap_buy, veto_buy, block_actionable
  risk_gates_json TEXT NOT NULL,
  portfolio_fit_json TEXT,
  thesis_json TEXT,                       -- structured thesis, assumptions, catalysts, invalidation
  rationale_markdown TEXT,
  source_item_ids_json TEXT NOT NULL,
  benchmark_basket_json TEXT NOT NULL,
  anti_overtrading_status TEXT,
  user_action TEXT,                       -- ignored, watched, bought, sold, paper_bought, dismissed
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendation_decisions_run
  ON recommendation_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_decisions_ticker_asof
  ON recommendation_decisions(ticker, as_of);
```

### 8.6 Outcome model

```sql
CREATE TABLE IF NOT EXISTS recommendation_outcomes (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  horizon TEXT NOT NULL,                  -- T1, T3, T5, T10, T20, T60
  decision_as_of TEXT NOT NULL,
  outcome_as_of TEXT NOT NULL,
  entry_price REAL,
  exit_price REAL,
  raw_return REAL,
  benchmark_return REAL,
  excess_return REAL,
  sector_benchmark_return REAL,
  max_adverse_excursion REAL,
  max_favorable_excursion REAL,
  time_to_profit_days REAL,
  thesis_hit_status TEXT,                 -- hit, partial, miss, unknown
  outcome_quality_status TEXT,            -- complete, stale_price, missing_benchmark, corporate_action_risk
  created_at TEXT NOT NULL,
  UNIQUE(decision_id, horizon)
);
```

### 8.7 Strategy version model

```sql
CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  factor_weights_json TEXT NOT NULL,
  risk_gates_json TEXT NOT NULL,
  portfolio_constraints_json TEXT,
  prompt_versions_json TEXT,
  code_commit TEXT,
  config_hash TEXT NOT NULL,
  active_from TEXT,
  active_to TEXT,
  change_reason TEXT,
  evaluation_summary_json TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(name, version)
);
```

### 8.8 IBKR and trade-review models

```sql
CREATE TABLE IF NOT EXISTS ibkr_sync_runs (
  id TEXT PRIMARY KEY,
  sync_type TEXT NOT NULL,                -- flex, gateway_accounts, gateway_positions, gateway_orders, gateway_executions
  mode TEXT NOT NULL,                     -- read_only, paper, live_disabled
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  account_ids_json TEXT,
  coverage_start TEXT,
  coverage_end TEXT,
  warnings_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_trades (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,                   -- ibkr_flex, ibkr_gateway, manual, paper
  external_trade_id TEXT,
  account_id_hash TEXT,
  ticker TEXT NOT NULL,
  asset_class TEXT,                       -- stock, option, etf, cash
  side TEXT NOT NULL,                     -- buy, sell, short, cover
  quantity REAL NOT NULL,
  price REAL,
  commission REAL,
  currency TEXT,
  trade_time TEXT NOT NULL,
  order_id TEXT,
  execution_id TEXT,
  linked_recommendation_id TEXT,
  strategy_tag TEXT,
  import_run_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trade_reviews (
  id TEXT PRIMARY KEY,
  trade_id TEXT,
  position_id TEXT,
  ticker TEXT NOT NULL,
  review_as_of TEXT NOT NULL,
  linked_recommendation_id TEXT,
  plan_quality_score REAL,
  execution_quality_score REAL,
  risk_reward_score REAL,
  behavior_tags_json TEXT,                -- FOMO, revenge_trade, early_sell, late_stop, over_concentration, no_plan
  thesis_alignment TEXT,                  -- followed_system, contradicted_system, no_prior_thesis, unknown
  review_markdown TEXT,
  source_item_ids_json TEXT,
  model_version TEXT,
  prompt_version TEXT,
  created_at TEXT NOT NULL
);
```

### 8.9 Audit event model

```sql
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,               -- recommendation_run, llm_call, ibkr_sync, order_draft, order_reject, config_change
  actor TEXT NOT NULL,                    -- system, user, llm, scheduler
  related_type TEXT,
  related_id TEXT,
  status TEXT NOT NULL,
  request_json TEXT,
  response_json TEXT,
  warnings_json TEXT,
  created_at TEXT NOT NULL
);
```

---

## 9. Recommended LLM and agent architecture

### 9.1 LLM role boundaries

The LLM should be used for:

- Summarizing and translating news, SEC filings, earnings, and reports.
- Extracting structured claims from unstructured text.
- Explaining factor snapshots in plain language.
- Generating bull/bear/risk/portfolio-manager perspectives.
- Identifying missing data and weak assumptions.
- Producing trade-review feedback and behavioral pattern summaries.
- Creating human-readable research notes and invalidation conditions.

The LLM should not be used for:

- Directly overriding hard risk gates.
- Freely changing factor weights.
- Submitting trades.
- Treating unsupported claims as facts.
- Producing recommendation records without structured source IDs.
- Using private portfolio data without explicit local storage/security controls.

### 9.2 Required LLM output schema

For recommendation explanations, use strict JSON first, prose second.

```json
{
  "ticker": "AAPL",
  "as_of": "2026-07-02T13:30:00Z",
  "summary": "One-paragraph thesis in user-facing language.",
  "bull_case": [
    {"claim": "...", "evidence_ids": ["source_..."], "confidence": 0.72}
  ],
  "bear_case": [
    {"claim": "...", "evidence_ids": ["source_..."], "confidence": 0.66}
  ],
  "key_assumptions": [
    {"assumption": "...", "how_to_disprove": "..."}
  ],
  "risks": [
    {"risk": "...", "severity": "high", "monitor": "..."}
  ],
  "invalidation_conditions": [
    {"condition": "...", "data_source": "..."}
  ],
  "data_quality_warnings": [
    {"field": "analyst_revisions", "warning": "missing or stale"}
  ],
  "recommended_follow_up": ["..."],
  "unsupported_claims_removed": true
}
```

### 9.3 Multi-agent debate pattern

Use the harness agents as a **review layer**, not the primary scoring layer.

Recommended flow:

```text
Deterministic factor snapshot
  -> deterministic score/risk gate
  -> initial classification
  -> bull researcher reviews evidence
  -> bear researcher challenges thesis
  -> risk manager checks vetoes, sizing, event risk, concentration
  -> coordinator summarizes disagreements
  -> final recommendation record stores both score and debate summary
```

The coordinator must not be allowed to turn a vetoed stock into an actionable buy. At most, it can label the stock as a research idea or watchlist item.

### 9.4 LLM prompt/version governance

Every LLM-generated recommendation artifact should store:

- Prompt template ID.
- Prompt template version.
- Model/provider name.
- Invocation route.
- Input context hash.
- Output JSON hash.
- Schema validation status.
- Source IDs visible to the model.
- Whether fallback/local rules were used.

This prevents silent model drift from contaminating evaluation.

---

## 10. Recommended recommendation-engine architecture

### 10.1 End-to-end flow

```text
1. Build universe
   watchlist + high-liquidity stocks + top movers + earnings names + social/news candidates

2. Collect inputs
   quote/bars, fundamentals, valuation, SEC, news, social, options, macro, portfolio/trade context

3. Normalize and audit data
   source_items + data_quality_audit + stale/missing/fallback warnings

4. Build factor snapshot
   raw factors -> peer/regime normalization -> weighted factor scores

5. Apply deterministic scoring
   alpha score + data-quality multiplier + market regime multiplier + portfolio fit

6. Apply hard gates
   liquidity, data quality, earnings/event risk, extreme IV, concentration, drawdown, news ambiguity

7. Classify output
   research_idea, watch, actionable_buy, avoid, sell_review, hold

8. Generate LLM explanation
   thesis, counter-thesis, evidence IDs, risks, invalidation, uncertainty

9. Freeze decision
   recommendation_decisions + factor_snapshot + source IDs + strategy/model/prompt versions

10. Track outcomes
   T+1/T+3/T+5/T+10/T+20+ raw and benchmark-relative results

11. Evaluate and learn
   precision@K, excess returns, hit rate, payoff ratio, rank IC, drawdown, regime split, factor stats
```

### 10.2 Candidate classification

Do not collapse all outputs into “buy/sell.” Use a richer taxonomy:

| Classification | Meaning | Allowed user action |
|---|---|---|
| `research_idea` | Interesting anomaly or theme, insufficient evidence | Read only; add to research queue |
| `watch` | Thesis plausible but missing trigger/data/price setup | Add to watchlist; monitor trigger |
| `actionable_buy` | Passes score, data, risk, and portfolio gates | User may consider manually; no auto order |
| `avoid` | Low quality, high uncertainty, bad setup, or weak thesis | No action except monitoring |
| `sell_review` | Existing/paper position thesis impaired or risk too high | Review position manually |
| `hold` | Existing position remains within thesis and risk bounds | No new action |

### 10.3 Factor groups

Use the existing factor direction as the default, but make it configurable and versioned.

| Factor group | Suggested role | Base weight direction |
|---|---|---|
| Momentum / technical setup | Entry quality and trend confirmation | Medium-high |
| Quality / growth | Business strength and earnings trajectory | Medium-high |
| Valuation / expectation gap | Avoid overpaying; identify dislocations | Medium |
| Earnings revisions | Forward estimate change and sentiment from analysts | Medium |
| News catalyst | Specific events that can change expectations | Medium |
| Industry / value chain | Sector and supply-chain positioning | Low-medium |
| Macro regime | Whether market backdrop supports risk | Low-medium |
| Options flow / IV | Sentiment, event risk, crowding, hedging pressure | Low |
| Smart money / ownership | 13F, insider, institutional context where available | Low |
| Social attention | Discovery, crowding, and sentiment warning | Low |

The exact weights should live in `strategy_versions`, not only in code or docs.

### 10.4 Risk gates

Hard risk gates should be interpretable and logged.

Examples:

- Data-quality score below threshold -> block `actionable_buy`.
- Missing quote or stale price -> block all actionable recommendations.
- Earnings within restricted window -> downgrade to watch unless explicitly event strategy.
- Extreme IV / illiquid options -> do not use options signal.
- Large adverse news with uncertain facts -> downgrade to research idea.
- Existing portfolio sector concentration above cap -> cap or block buy.
- Position size would exceed max single-name exposure -> block buy.
- Recommendation cooldown active -> downgrade to watch.
- Low-liquidity ticker -> avoid or research only.
- Unverified social-only catalyst -> research only.

### 10.5 Anti-overtrading gate

Add a gate that explicitly reduces the number of daily actionable recommendations.

Suggested fields:

```json
{
  "max_actionable_buys_per_day": 3,
  "max_new_watchlist_items_per_day": 10,
  "ticker_cooldown_days_after_actionable": 5,
  "ticker_cooldown_days_after_failed_thesis": 20,
  "min_excess_edge_threshold": 0.02,
  "avoid_new_buy_before_major_earnings_days": 2,
  "avoid_new_buy_after_major_gap_days": 1
}
```

---

## 11. Recommended IBKR architecture

### 11.1 IBKR design stance

IBKR should be treated first as a **read-only personal trading data source** and only much later as an optional execution-monitoring integration.

The project should maintain these defaults:

```text
IBKR_TRADING_READ_ENABLED=true
IBKR_TRADING_ENABLED=false
IBKR_PAPER_ONLY=true
```

Any future live-order capability must require explicit configuration, a UI approval workflow, server-side rejection when disabled, and audit logs.

### 11.2 IBKR phases

#### Phase A — Read-only synchronization, P0/P1

Purpose:

- Import account, positions, trades, orders, executions, cash, and basic portfolio state.
- Support personal trade review.
- Support portfolio-fit scoring.
- Support recommendation adherence analysis.

Data sources:

- IBKR Flex for historical trades, open positions, cash, and activity statements.
- IBKR Gateway/TWS Socket for read-only account/position/order/execution snapshots where available.

Required controls:

- No order-placement code path.
- Account IDs hashed or locally protected.
- Sync coverage displayed in UI.
- Idempotent import using external trade/order/execution IDs.
- Audit event for every sync.

#### Phase B — Paper trading, P2

Purpose:

- Simulate trades based on recommendation decisions.
- Evaluate slippage, turnover, drawdown, exposure, and strategy adherence.
- Train the user to compare recommended vs actual decisions.

Controls:

- Paper-only positions clearly separated from IBKR actual positions.
- Commission/slippage assumptions stored in strategy version.
- No broker order drafts.

#### Phase C — Execution monitoring, P3

Purpose:

- Monitor real IBKR orders/executions after the user manually trades in IBKR.
- Compare live trades to prior system recommendations and risk plan.

Controls:

- Read-only monitoring only.
- No server ability to submit or modify orders.
- Clear “manual trade detected” review flow.

#### Phase D — Optional live-order draft workflow, P3+ only

This phase should not be implemented until the system has credible paper/backtest metrics and robust audit logs.

Allowed scope:

- The system may draft an order ticket.
- The user must manually approve it.
- The server must reject any order if live trading is disabled.
- Every draft, rejection, confirmation, and submission must be logged.

Recommended stance: even in P3, prefer **order drafts** over autonomous order submission.

### 11.3 IBKR-specific API endpoints

| Endpoint | Method | Purpose | Safety posture |
|---|---:|---|---|
| `/api/ibkr/status` | GET | Show gateway/flex configuration and sync status | Read-only |
| `/api/ibkr/flex/sync` | POST | Import Flex trades/positions/cash | Read-only |
| `/api/ibkr/sync/read-only` | POST | Sync account/position/order/execution snapshots | Read-only |
| `/api/ibkr/positions` | GET | Return normalized positions | Read-only |
| `/api/ibkr/trades` | GET | Return imported trades | Read-only |
| `/api/ibkr/orders` | GET | Return imported orders | Read-only |
| `/api/paper/orders/draft` | POST | Draft paper order linked to recommendation | Paper only |
| `/api/orders/draft` | POST | Future live-order draft, not submission | Disabled by default |
| `/api/orders/submit` | POST | Future live submit, human approval required | P3+ only; reject unless explicitly enabled |

---

## 12. Safety, compliance, and risk-control principles

### 12.1 Product safety principles

- The product is a research and decision-support tool, not a guarantee of returns.
- Every recommendation must disclose uncertainty, data quality, risks, invalidation conditions, and benchmark context.
- The system should never claim a trade is “safe” or “certain.”
- The system should not encourage overtrading.
- Social/news/options flow must be framed as evidence with reliability limits, not as deterministic signals.
- Live trading should remain disabled by default.
- The user must approve any future live order.
- Sensitive IBKR data must remain local unless the user explicitly exports it.

### 12.2 Recommendation safety gates

Minimum gates before `actionable_buy`:

1. Quote and bar data fresh enough for the market session.
2. Data-quality score above threshold.
3. No unresolved severe news/SEC risk.
4. Liquidity threshold satisfied.
5. Spread/volatility not extreme relative to strategy constraints.
6. Earnings/event window acceptable.
7. Portfolio concentration acceptable.
8. Recommendation cooldown not active.
9. Benchmark-relative expected edge above threshold.
10. LLM explanation contains evidence IDs and invalidation conditions.

### 12.3 Hard veto examples

- Missing or stale current price.
- Corporate action or ticker mapping uncertainty.
- News catalyst is social-only and unverified.
- Major SEC filing summary failed but filing is material.
- Options chain stale but options factor materially influences score.
- User already exceeds max exposure to the ticker/sector/factor.
- Strategy version is not active or not evaluated.
- IBKR sync status incomplete for portfolio-fit claims.

---

## 13. Data-quality and source-traceability requirements

### 13.1 Source traceability

Every user-facing claim should be backed by at least one of:

- A source item ID.
- A collector run ID.
- A filing accession number.
- A quote/bar timestamp.
- An IBKR import run ID.
- A model/prompt output ID, when the claim is LLM-generated synthesis.

For LLM summaries, store both the source IDs used and the output validation result.

### 13.2 Data-quality dimensions

| Dimension | Meaning | Example warning |
|---|---|---|
| Freshness | How current the data is | “Quote is 47 minutes old during regular session.” |
| Completeness | Whether required fields are present | “No analyst revision data available.” |
| Source reliability | Historical trust level of the source | “Social source only; not corroborated.” |
| Cross-source agreement | Whether independent sources agree | “Price differs across providers by >1%.” |
| Extraction confidence | Whether article/filing extraction succeeded | “Article body extraction fell back to partial snippet.” |
| Fallback penalty | Whether primary source failed | “IBKR options chain unavailable; using Yahoo fallback.” |
| Entity resolution | Whether ticker/company mapping is certain | “Ticker changed or duplicate symbol ambiguity.” |
| Coverage | Whether data history is long enough | “Only 18 outcome samples for this factor.” |

### 13.3 Claim-level confidence

The market-intelligence and stock-research pages should display claim confidence separately from recommendation confidence.

Example:

```json
{
  "claim": "Semiconductor equipment names are leading today's risk-on move.",
  "claim_type": "theme_driver",
  "confidence": 0.78,
  "supporting_source_ids": ["source_news_...", "source_quote_...", "source_social_..."],
  "contradicting_source_ids": [],
  "data_quality_notes": ["Social attention is elevated but not used as primary evidence."]
}
```

---

## 14. Proposed API endpoints

The README already lists existing endpoints such as `/api/state`, `/api/run`, `/api/run/status`, `/api/stocks/snapshot`, `/api/all-stock-agent/run`, `/api/agent-debate/run`, and `/api/report-email`. Keep those working. Add or standardize the following endpoints.

### 14.1 Market intelligence

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/market-intelligence/today` | GET | Current market regime, drivers, sectors, themes, risk-on/risk-off state |
| `/api/market-intelligence/runs/:runId` | GET | Frozen market-intelligence run with sources and claims |
| `/api/hotspots/themes` | GET | Theme clusters with tickers, source support, confidence, and price action |
| `/api/hotspots/themes/:themeId` | GET | Theme details, timeline, source items, tickers, risks |
| `/api/data-quality/status` | GET | Global source health, stale fields, collector failures |

### 14.2 Single-stock research

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/stocks/:ticker/research-pack` | GET | Company profile, segments, value chain, peers, events, factor snapshot, thesis |
| `/api/stocks/:ticker/factor-snapshot` | GET | Latest factor snapshot and waterfall |
| `/api/stocks/:ticker/factor-snapshot/build` | POST | Build and optionally persist a new factor snapshot |
| `/api/stocks/:ticker/events` | GET | News/SEC/earnings/social/options event timeline |
| `/api/stocks/:ticker/value-chain` | GET | Suppliers, customers, competitors, substitutes, confidence |
| `/api/stocks/:ticker/options-analytics` | GET | Chain, IV, skew, term structure, GEX approximation, quality warnings |

### 14.3 Recommendations and evaluation

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/recommendations/daily/run` | POST | Run daily recommendation workflow with strategy version |
| `/api/recommendations/latest` | GET | Latest decisions grouped by classification |
| `/api/recommendations/:decisionId` | GET | Full frozen decision record |
| `/api/recommendations/:decisionId/user-decision` | POST | Record user action or dismissal |
| `/api/recommendations/outcomes/freeze` | POST | Freeze due T+ outcomes |
| `/api/recommendations/outcomes/:decisionId` | GET | Outcome series for a decision |
| `/api/recommender/backtest` | POST | Run deterministic historical evaluation |
| `/api/recommender/walk-forward` | POST | Run walk-forward backtest |
| `/api/recommender/factor-stats` | GET | Factor IC, hit rate, payoff, drawdown, precision@K |
| `/api/recommender/learn/preview` | POST | Preview controlled factor-weight changes without applying |
| `/api/recommender/learn/apply` | POST | Apply approved strategy version change |

### 14.4 Trade review and portfolio

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/trades/imports` | GET | IBKR/manual/paper import run status |
| `/api/trades` | GET | User trades with filters |
| `/api/trades/:tradeId/review` | POST | Generate structured trade review |
| `/api/trades/reviews` | GET | Review dashboard and behavioral patterns |
| `/api/portfolio/snapshot` | GET | Current actual + paper exposure snapshot |
| `/api/portfolio/risk` | GET | Sector/factor/single-name exposure and drawdown |
| `/api/portfolio/recommendation-fit/:ticker` | GET | Position sizing and portfolio-fit analysis for a ticker |

### 14.5 Audit

| Endpoint | Method | Purpose |
|---|---:|---|
| `/api/audit/events` | GET | Audit log search |
| `/api/audit/events/:id` | GET | Full event details |
| `/api/strategy-versions` | GET | Strategy version registry |
| `/api/model-versions` | GET | LLM/prompt version registry |

---

## 15. Proposed UI screens and user flows

### 15.1 Market Intelligence screen

Purpose: answer “What is moving the market today?”

Sections:

1. Market regime summary: risk-on/risk-off, volatility, rates/macro, sector leadership.
2. Top drivers: macro, earnings, analyst changes, SEC, news catalysts, social attention, options signals.
3. Theme clusters: theme name, tickers, source count, confidence, price action, noise warning.
4. Source-quality panel: stale sources, failed collectors, fallback usage.
5. Research queue: themes or tickers promoted to deeper research.

Acceptance criteria:

- Every driver has at least one source item ID.
- Social-only themes are visually marked as unconfirmed.
- The page can be reconstructed from a stored run ID.

### 15.2 Theme detail screen

Purpose: inspect a market hotspot without confusing attention for edge.

Sections:

- Theme summary.
- Ticker map.
- Timeline of source items.
- Price/volume confirmation.
- Contradicting evidence.
- Candidate tickers and why they are research/watch/actionable/avoid.
- Data-quality warnings.

### 15.3 Single-stock research dashboard

Purpose: answer “What is this company, why is it moving, and is it worth deeper action?”

Sections:

1. Header: ticker, price, session, freshness, recommendation classification, confidence.
2. Business profile: segments, products, revenue drivers, geography.
3. Industry and peers: peer basket, sector ETF, valuation/growth comparisons.
4. Value chain: suppliers, customers, competitors, substitutes, confidence.
5. Event timeline: news, SEC, earnings, analyst changes, social, options.
6. Factor snapshot waterfall: raw and normalized factors, weights, contributions.
7. Options analytics: IV rank, skew, term structure, liquidity, unusual activity, GEX approximation, warnings.
8. Thesis panel: bull case, bear case, assumptions, risks, invalidation.
9. Portfolio fit: current exposure, proposed size range, concentration warning.
10. Decision history: prior recommendations and outcomes.

Acceptance criteria:

- All facts are separate from LLM synthesis.
- No buy/hold/avoid output appears without data-quality status.
- Every recommendation links to a frozen decision record.

### 15.4 Daily recommendation dashboard

Purpose: manage daily outputs without encouraging overtrading.

Sections:

- Actionable candidates.
- Watchlist candidates.
- Research ideas.
- Avoid/sell-review candidates.
- Anti-overtrading gate status.
- Strategy version and run ID.
- Outcome status from prior runs.

Acceptance criteria:

- Maximum actionable ideas per day is enforced.
- Each card shows factor score, confidence, data-quality score, risk gates, and benchmark basket.
- User can record actions: ignore, watch, paper buy, actual buy, dismiss, add note.

### 15.5 Recommendation detail screen

Purpose: make each recommendation auditable.

Sections:

- Frozen decision metadata.
- Factor snapshot and waterfall.
- Source items.
- LLM thesis and counter-thesis.
- Risk gates and portfolio fit.
- User decision and notes.
- Outcomes by horizon.
- Post-mortem.

### 15.6 Trade review screen

Purpose: review actual user behavior.

Sections:

- Imported trades and positions.
- Trade plan status.
- Link to prior recommendation, if any.
- Behavioral tags: FOMO, early selling, late stop-loss, over-concentration, no plan, strategy drift.
- Risk/reward review.
- Outcome vs thesis.
- Recurring patterns and lessons.

Acceptance criteria:

- The review distinguishes bad process from bad outcome.
- A winning trade can still be flagged as poor process.
- A losing trade can be marked as good process if the thesis/risk plan was followed.

### 15.7 Evaluation and Learning Lab

Purpose: prevent uncontrolled self-improvement.

Sections:

- Backtest results by strategy version.
- Walk-forward splits.
- Precision@K, rank IC, excess return, drawdown, hit rate, payoff ratio.
- Factor contribution and stability.
- Regime split performance.
- Proposed factor-weight changes in shadow mode.
- Approval log.

---

## 16. Prioritized roadmap

## P0 — Foundation

P0 should make the existing system auditable and reproducible. It should not add live trading.

### P0.1 Full codebase and route audit

**Why it matters:** `server.mjs` is large enough that implementation work can accidentally duplicate routes or break hidden dependencies.

**Related code:** `server.mjs`, `server/*.mjs`, `public/app.js`, `scripts/core_regression_tests.mjs`.

**Implementation tasks:**

- Add `scripts/codebase_inventory.mjs`.
- Generate `docs/CODEBASE_ROUTE_INVENTORY.md`.
- Inventory API routes, route handlers, scheduler jobs, storage keys, environment flags, major functions, and UI fetch calls.
- Mark each route as stable, legacy, experimental, or deprecated.

**Backend changes:** none initially, except adding inventory script.

**Frontend changes:** none.

**Storage changes:** optional JSON inventory artifact under `data/dev/codebase_inventory.json`.

**LLM/prompt changes:** none.

**Tests:** inventory script runs in CI/local test and fails if duplicate route definitions are detected.

**Acceptance criteria:**

- All API routes are listed with method, path, handler location, UI caller, and storage side effects.
- All `public/app.js` fetch calls map to a known route.
- Existing smoke tests still pass.

### P0.2 Data-quality audit layer

**Why it matters:** recommendations without data quality are not trustworthy.

**Related code:** collectors in `server.mjs`, `server/network_fetch.mjs`, scripts, `data/store.json`, SQLite sync.

**New data needed:** freshness timestamps, source reliability, extraction status, fallback status, missing field lists.

**Backend changes:**

- Add `data_quality_service.mjs`.
- Add `buildDataQualityAudit(scope)`.
- Require data-quality audit for factor snapshots and market-intelligence runs.

**Frontend changes:**

- Add data-quality badges and warning panels.
- Show source fallback/staleness warnings on stock and recommendation cards.

**Storage changes:** add `data_quality_audits` table.

**LLM/prompt changes:** LLM must include data-quality warnings and must not hide missing fields.

**Tests:** unit tests for stale quote, missing options, social-only catalyst, failed article extraction, fallback provider.

**Acceptance criteria:** every recommendation has a data-quality score and machine-readable missing/stale/fallback reasons.

### P0.3 Unified factor snapshot persistence

**Why it matters:** scoring cannot be audited if factors are assembled ad hoc.

**Related code:** `lib/recommender_core.mjs`, all-stock agent routes, backtest routes, stock detail page.

**New data needed:** raw factor values, normalized factor values, peer baselines, benchmark basket, source IDs, data-quality audit ID.

**Backend changes:**

- Add `factor_snapshot_service.mjs`.
- Use existing `lib/recommender_core.mjs` scoring utilities.
- Persist every factor snapshot used in a recommendation.

**Frontend changes:** factor waterfall panel on recommendation and stock pages.

**Storage changes:** add `factor_snapshots` table.

**LLM/prompt changes:** LLM receives factor snapshot as structured JSON, not only prose context.

**Tests:** deterministic snapshot builds for fixtures; no look-ahead in historical snapshot mode.

**Acceptance criteria:** every recommendation links to exactly one factor snapshot that can be replayed.

### P0.4 Recommendation decision log

**Why it matters:** the system cannot learn or be trusted without frozen decisions.

**Related code:** all-stock agent, paper book, recommendation UI, outcome snapshots.

**New data needed:** decision type, factor snapshot ID, risk gates, strategy version, model/prompt version, source IDs, benchmark basket, rationale.

**Backend changes:**

- Add `recommendation_decision_service.mjs`.
- Classify outputs into research/watch/actionable/avoid/sell-review/hold.
- Store each decision before any user action.

**Frontend changes:** daily recommendation dashboard and decision-detail screen.

**Storage changes:** add `recommendation_decisions` table.

**LLM/prompt changes:** explanation must produce structured thesis JSON with assumptions/risks/invalidation.

**Tests:** create decision from fixture; schema validation; blocked actionable buy when risk gate fails.

**Acceptance criteria:** decision records are immutable except for appended user action/outcome fields.

### P0.5 Benchmark-relative outcome freezer

**Why it matters:** raw returns can be misleading during bull or bear markets.

**Related code:** `lib/recommender_core.mjs` benchmark basket and outcome utilities, all-stock outcome snapshots, paper book.

**New data needed:** benchmark basket at decision time, entry price, exit price, benchmark returns, MAE/MFE.

**Backend changes:**

- Add scheduled outcome freezer.
- Freeze T+1/T+3/T+5/T+10/T+20 outcomes.
- Use the benchmark basket saved in the decision record.

**Frontend changes:** outcome cards and charts by horizon.

**Storage changes:** add `recommendation_outcomes` table.

**LLM/prompt changes:** post-mortem LLM receives frozen outcomes and original thesis.

**Tests:** fixture outcomes with missing bars, holidays, splits, and benchmark gaps.

**Acceptance criteria:** every due decision receives an outcome record or explicit missing-data status.

### P0.6 Safer IBKR read-only sync

**Why it matters:** personal trade review and portfolio fit require actual trade and position data, but live trading is high risk.

**Related code:** `scripts/ibkr_gateway_bridge.py`, Flex sync docs/config, trade log/paper book.

**New data needed:** account coverage, import run metadata, trades, positions, orders, executions, cash.

**Backend changes:**

- Add explicit read-only sync service.
- Server rejects any order submit endpoint unless future live flags are enabled.
- Store sync coverage and warnings.

**Frontend changes:** IBKR sync status, read-only badge, coverage warnings.

**Storage changes:** add `ibkr_sync_runs`, `user_trades`, and normalized positions tables.

**LLM/prompt changes:** trade-review agent can use imported trades but must not expose sensitive account IDs.

**Tests:** mock Gateway/Flex imports; assert no live order path is reachable with default config.

**Acceptance criteria:** read-only sync works or fails safely; no order placement can occur in P0.

### P0.7 Documentation landing

**Why it matters:** the repository already has several docs; the roadmap should become implementation guidance, not another vague plan.

**Related code:** `docs/`, README docs links.

**Implementation tasks:**

- Add this file as `docs/INVESTMENT_ASSISTANT_ROADMAP_v2.md`.
- Link it from README and/or `public/docs`.
- Add a small “current status vs roadmap” section that is updated after each milestone.

**Acceptance criteria:** new contributors can identify what to build next, where to build it, and how to test it.

---

## P1 — Investment assistant core

P1 should turn the existing data desk into a coherent personal investment assistant.

### P1.1 Market hotspot engine

**Why it matters:** the user wants to understand what is moving the market today, but hotspots are noisy unless clustered and traced.

**Related code:** market hot news, social heat collectors, quote movers, SEC/news summaries, scheduler.

**New data needed:** theme clusters, driver taxonomy, source IDs, price confirmation, sector mapping.

**Backend changes:**

- Add `market_intelligence_service.mjs`.
- Cluster source items by theme/ticker/sector/catalyst.
- Score themes by source reliability, cross-source corroboration, price/volume confirmation, and novelty.

**Frontend changes:** Market Intelligence screen and Theme Detail screen.

**Storage changes:** add `market_themes` and `market_theme_items` or store as typed JSON runs.

**LLM/prompt changes:** market narrator must distinguish “confirmed driver,” “possible driver,” and “attention/noise.”

**Tests:** fixture with social-only spike should not become high-confidence market driver.

**Success metric:** fewer unsupported “hot” claims; theme pages link to evidence and price confirmation.

### P1.2 Single-stock research pack

**Why it matters:** ticker analysis needs a stable structured object, not scattered UI fields.

**Related code:** stock snapshot/detail routes, Longbridge/OpenBB bridges, SEC/news/options modules.

**New data needed:** company profile, segments, revenue drivers, peers, value chain, event timeline, factor snapshot, thesis.

**Backend changes:** add `stock_research_service.mjs` that returns a normalized `research_pack`.

**Frontend changes:** redesign stock detail page around the research dashboard sections.

**Storage changes:** `company_profiles`, `peer_sets`, `value_chain_relationships`, `research_packs` cache.

**LLM/prompt changes:** ticker analyst receives structured pack and returns only schema-valid synthesis.

**Tests:** snapshot tests for AAPL/NVDA/JPM/XOM-style varied sectors; missing data warnings visible.

**Success metric:** user can answer business/valuation/catalyst/risk questions from one page without hidden assumptions.

### P1.3 Industry, peer, product, and value-chain enrichment

**Why it matters:** stock assessment depends on what a company sells, who it competes with, and where it sits in the supply chain.

**Related code:** existing peers/upstream/downstream UI/data support.

**New data needed:** industry taxonomy, peer set source, product taxonomy, supplier/customer/competitor/substitute relationships.

**Backend changes:**

- Add peer-set generator with manual overrides.
- Add confidence scoring for value-chain relationships.
- Separate verified relationships from LLM-inferred relationships.

**Frontend changes:** value-chain graph/table with confidence and source labels.

**Storage changes:** `peer_sets`, `company_relationships`, `product_taxonomy`.

**LLM/prompt changes:** LLM may propose relationships but must label them as inferred until sourced.

**Tests:** prevent unsourced LLM-generated supplier/customer facts from being displayed as verified.

**Success metric:** peer comparisons and value-chain claims are sourced and reusable across recommendations.

### P1.4 Multi-factor scoring UI and recommendation dashboard

**Why it matters:** users need to see why a stock is scored a certain way.

**Related code:** `lib/recommender_core.mjs`, all-stock agent, paper book, backtest UI.

**New data needed:** persisted factor snapshot and decision records from P0.

**Backend changes:** expose factor waterfall and risk-gate explanations.

**Frontend changes:** recommendation dashboard and detail screen.

**Storage changes:** no new schema beyond P0, but add indexes for recent decisions.

**LLM/prompt changes:** LLM explanation must refer to top positive/negative factor contributions.

**Tests:** factor contribution sums reconcile to score; risk gate visible when triggered.

**Success metric:** user can inspect score, confidence, data quality, and risks without reading raw logs.

### P1.5 Options-chain analytics

**Why it matters:** options can inform risk and sentiment, but poor chain data can mislead recommendations.

**Related code:** IBKR option chain, Nasdaq/Yahoo/Finnhub fallbacks, stock detail options section.

**New data needed:** IV rank/percentile, skew, term structure, liquidity, open interest, volume/OI anomalies, event IV premium, approximate gamma exposure.

**Backend changes:** add `options_analytics_service.mjs` with source-quality gates.

**Frontend changes:** options analytics panel with warnings and “do not use for score” state when stale.

**Storage changes:** `option_snapshots`, `option_contract_snapshots`, `options_analytics`.

**LLM/prompt changes:** LLM can explain options context but must not infer intent of large trades without caveats.

**Tests:** stale/fallback chains cannot materially boost recommendation score.

**Success metric:** options factor is present only when chain quality and liquidity are adequate.

### P1.6 Post-trade review engine

**Why it matters:** personal improvement comes from reviewing actual behavior, not just generating new ideas.

**Related code:** trade log, FIFO review, IBKR Flex sync, harness review agent.

**New data needed:** imported trades, linked recommendations, trade plan, outcome, behavioral tags.

**Backend changes:** add `trade_review_service.mjs` and behavior taxonomy.

**Frontend changes:** trade review dashboard.

**Storage changes:** `trade_reviews`, `behavior_patterns`, optional `position_lots`.

**LLM/prompt changes:** review agent must classify process quality separately from outcome quality.

**Tests:** winning no-plan trade can be flagged poor process; losing rule-following trade can be good process.

**Success metric:** weekly review identifies recurring behavior patterns and links trades to prior system recommendations.

---

## P2 — Learning loop

P2 should improve evaluation rigor and controlled adaptation.

### P2.1 Walk-forward backtesting

**Why it matters:** historical performance must be tested without look-ahead bias.

**Related code:** existing backtest docs/routes, recommender core, archived runs, SQLite mirror.

**Backend changes:**

- Add time-split walk-forward engine.
- Use only data available as of each decision timestamp.
- Freeze universe membership rules.
- Include cost/slippage assumptions.

**Frontend changes:** Evaluation and Learning Lab.

**Storage changes:** `backtest_runs`, `backtest_decisions`, `backtest_metrics`.

**Tests:** fixtures that intentionally include future data should fail validation.

**Metrics:** precision@K, excess return, hit rate, payoff ratio, rank IC, max drawdown, turnover, MAE/MFE, regime split.

**Success metric:** strategy changes are supported by out-of-sample results, not recent anecdotes.

### P2.2 Strategy versioning and controlled factor updates

**Why it matters:** factor learning exists conceptually/code-wise, but production learning must be governed.

**Related code:** `lib/recommender_core.mjs`, `strategies/us_stock_strategies.json`, existing docs.

**Backend changes:**

- Add strategy version registry.
- Add `learn/preview` and `learn/apply` flow.
- Require minimum samples and holdout validation.
- Cap factor-weight movement per update.

**Frontend changes:** proposed-change review UI.

**Storage changes:** `strategy_versions`, `factor_weight_change_proposals`.

**LLM/prompt changes:** LLM may explain why a factor underperformed but cannot apply changes.

**Tests:** insufficient samples freeze factors; proposed changes must be reversible.

**Success metric:** factor updates are rare, documented, and benchmark-relative.

### P2.3 Paper-trading portfolio

**Why it matters:** paper trading tests the whole decision chain before any real execution workflow.

**Related code:** paper book, recommendation decisions, trade review.

**Backend changes:**

- Link paper trades to recommendation decisions.
- Add fills, costs, slippage, position lifecycle.
- Compare paper portfolio vs benchmark basket.

**Frontend changes:** paper portfolio screen.

**Storage changes:** `paper_orders`, `paper_executions`, `paper_positions`, `paper_portfolio_snapshots`.

**LLM/prompt changes:** portfolio review agent can analyze paper behavior and strategy adherence.

**Tests:** no real broker calls; P&L reconciles to fills and marks.

**Success metric:** user can compare “system would have done” vs “I actually did” over time.

### P2.4 Long-term lesson memory

**Why it matters:** qualitative lessons are useful, but they should not mutate strategy without evaluation.

**Related code:** `harness/memory/sqlite_memory.py`, review agents.

**Backend changes:**

- Store lessons linked to decisions, trades, outcomes, regimes, and strategy versions.
- Separate observations from approved rule changes.

**Frontend changes:** lesson library and recurring-pattern panel.

**Storage changes:** `lesson_memory` table.

**LLM/prompt changes:** use lessons as review context, not as automatic scoring inputs.

**Tests:** lesson cannot alter factor weights unless converted into approved strategy proposal.

**Success metric:** reviews become more personalized without hidden strategy drift.

---

## P3 — Advanced assistant

P3 should be attempted only after P0-P2 are stable.

### P3.1 Multi-agent debate as standard review layer

**Why it matters:** bull/bear/risk debate can expose weak assumptions.

**Related code:** `harness/agents`, `harness/orchestrator/debate.py`, all-stock debate gate.

**Backend changes:** call debate only for high-impact candidates or user-requested deep dives.

**Frontend changes:** debate tab on recommendation detail.

**Storage changes:** `agent_debates` table or LLM artifacts table.

**Tests:** debate output must cite source IDs and cannot override hard vetoes.

**Success metric:** debate improves explanation quality and catches missing risks, without increasing false confidence.

### P3.2 Portfolio-level risk and allocation assistant

**Why it matters:** a personal assistant must understand existing exposure.

**Related code:** IBKR sync, paper book, factor snapshots, trade review.

**Backend changes:** compute sector, industry, factor, single-name, correlation, drawdown, and liquidity exposure.

**Frontend changes:** portfolio risk dashboard.

**Storage changes:** `portfolio_snapshots`, `portfolio_exposures`.

**LLM/prompt changes:** portfolio manager agent explains exposure and position-sizing constraints.

**Tests:** adding a recommendation that breaches concentration cap is blocked.

**Success metric:** recommendations adapt to actual portfolio state.

### P3.3 Real-time IBKR execution monitoring

**Why it matters:** after the user manually trades, real-time monitoring can support review and risk alerts.

**Related code:** IBKR Gateway bridge.

**Backend changes:** subscribe to read-only order/execution updates.

**Frontend changes:** execution monitor and alerts.

**Storage changes:** `order_snapshots`, `execution_events`.

**Safety:** still no live order submission.

**Success metric:** manually executed trades are captured and reviewed without order-placement permissions.

### P3.4 Optional live-order draft workflow with human approval

**Why it matters:** if ever implemented, order flow must be safer than a generic chatbot action.

**Related code:** future IBKR module only; not current P0/P1 scope.

**Backend changes:**

- Add order draft model.
- Server rejects submit unless `IBKR_TRADING_ENABLED=true` and `IBKR_PAPER_ONLY=false`.
- Require recommendation ID, risk checks, size checks, and user approval token.

**Frontend changes:** order review modal with explicit confirmation.

**Storage changes:** `order_drafts`, `order_approvals`, `order_submissions`, `audit_events`.

**LLM/prompt changes:** LLM cannot submit orders; it can summarize the draft and risks.

**Tests:** default config rejects all live submissions; approval token required; audit complete.

**Recommendation:** do not build this until P0-P2 performance, safety, and audit quality are proven.

---

## 17. Concrete implementation task list

| ID | Task | Priority | Related existing code | Done when |
|---|---|---:|---|---|
| P0-01 | Generate route/function/storage inventory | P0 | `server.mjs`, `public/app.js`, `server/*` | `docs/CODEBASE_ROUTE_INVENTORY.md` exists and all UI fetches map to routes |
| P0-02 | Add schema validation helpers | P0 | `server/http_responses.mjs`, `lib/*` | invalid recommendation/factor/trade records are rejected with structured errors |
| P0-03 | Implement `source_items` index | P0 | collectors/scripts | every article/filing/quote/options/social item has source ID |
| P0-04 | Implement data-quality audit service | P0 | collectors, `network_fetch`, stock/recommender routes | every recommendation has quality score/warnings |
| P0-05 | Persist factor snapshots | P0 | `lib/recommender_core.mjs`, all-stock agent | decisions link to factor snapshot IDs |
| P0-06 | Persist recommendation decisions | P0 | all-stock agent, paper book | each output is immutable and reproducible |
| P0-07 | Freeze benchmark-relative outcomes | P0 | outcome snapshots, recommender core | T+ records include raw and excess returns |
| P0-08 | Add anti-overtrading gate | P0 | all-stock agent | daily actionable candidates are capped and cooldowns enforced |
| P0-09 | Harden IBKR read-only sync | P0 | `scripts/ibkr_gateway_bridge.py`, Flex sync | no live order path reachable; sync coverage visible |
| P0-10 | Link this roadmap from repo docs/UI | P0 | `docs/`, README, `public/docs` | roadmap discoverable from repo |
| P1-01 | Build market hotspot/theme engine | P1 | hot news/social/movers | themes show source support, confidence, noise warnings |
| P1-02 | Build stock research pack API | P1 | stock snapshot/detail routes | one API returns profile/peers/events/factors/thesis |
| P1-03 | Add peer/value-chain schemas | P1 | existing peers/upstream/downstream | sourced relationships shown with confidence |
| P1-04 | Add factor waterfall UI | P1 | stock/recommendation UI | user sees score contributions and gates |
| P1-05 | Add options analytics service | P1 | IBKR/options fallback modules | IV/skew/liquidity/GEX warnings available |
| P1-06 | Build post-trade review engine | P1 | trade log, harness review | trades classified by process and behavior tags |
| P2-01 | Implement walk-forward backtest | P2 | backtest routes, SQLite mirror | no-look-ahead validation and out-of-sample metrics |
| P2-02 | Add strategy version registry | P2 | strategies JSON, recommender core | every decision links to strategy version |
| P2-03 | Implement controlled learning workflow | P2 | factor learning utilities | factor changes require preview, holdout, approval |
| P2-04 | Build paper portfolio accounting | P2 | paper book | fills/P&L/exposure reconcile |
| P2-05 | Implement lesson memory | P2 | harness memory/review | lessons linked to decisions/trades/outcomes |
| P3-01 | Standardize multi-agent debate | P3 | harness agents/orchestrators | debate cites evidence and cannot override vetoes |
| P3-02 | Add portfolio risk assistant | P3 | IBKR/paper/factors | recommendations reflect exposure constraints |
| P3-03 | Add read-only execution monitor | P3 | IBKR Gateway bridge | manual trades captured for review |
| P3-04 | Add optional order-draft workflow | P3+ | future IBKR module | live submit impossible without explicit config + approval |

---

## 18. Acceptance criteria by major feature

### 18.1 Market intelligence

- Daily market-intelligence run produces a persisted run ID.
- Every market driver links to source item IDs.
- Each driver has confidence, source quality, and noise classification.
- Social-only or single-source claims are marked as weak.
- The UI shows stale/failed source warnings.

### 18.2 Single-stock research

- `/api/stocks/:ticker/research-pack` returns a stable schema.
- Business facts are separate from LLM synthesis.
- Peer set and value-chain relationships include source/confidence.
- Factor snapshot and data-quality audit are present.
- Thesis includes risks and invalidation conditions.

### 18.3 Recommendation decisioning

- Every recommendation stores factor snapshot ID, strategy version, source IDs, risk gates, benchmark basket, and model/prompt version.
- Actionable recommendations are blocked when hard gates fail.
- Daily output distinguishes research/watch/actionable/avoid/sell-review.
- User actions are appended, not used to rewrite the original decision.

### 18.4 Outcome tracking

- T+1/T+3/T+5/T+10/T+20 outcomes are generated or explicitly marked missing.
- Outcomes include raw return, benchmark return, excess return, MAE, MFE, and thesis-hit status where possible.
- Corporate-action or missing-bar risk is flagged.
- Evaluation dashboards use benchmark-relative metrics.

### 18.5 Backtesting and learning

- Historical tests use only data available at each simulated decision time.
- Universe construction is documented.
- Costs/slippage are configurable.
- Metrics include precision@K, excess return, hit rate, payoff ratio, rank IC, drawdown, turnover, and regime split.
- Factor-weight updates require sample thresholds, holdout validation, max-step limits, and version approval.

### 18.6 IBKR sync and trade review

- IBKR sync runs are logged with coverage and status.
- Account identifiers are protected or hashed where practical.
- Default config cannot submit live orders.
- Imported trades are idempotent.
- Trade reviews distinguish process quality from outcome quality.
- Reviews link to prior recommendations when available.

### 18.7 LLM outputs

- All recommendation-facing LLM outputs pass JSON schema validation.
- Every factual claim has source IDs or is labeled as inference.
- Missing data and uncertainty are explicitly surfaced.
- Prompt/model versions are logged.
- The LLM cannot override deterministic hard vetoes.

---

## 19. Backtesting and evaluation framework

### 19.1 Required evaluation types

| Evaluation | Purpose | Minimum requirement |
|---|---|---|
| Online outcome tracking | Measure real daily recommendations | T+ horizon raw and excess returns |
| Historical backtest | Test strategy on past data | No look-ahead, frozen universe rules |
| Walk-forward validation | Test adaptation over time | Train/validate/test windows |
| Paper trading | Test execution and portfolio effects | Costs, slippage, exposure, drawdown |
| Regime split | Understand when strategy works/fails | Bull, bear, high-rate, high-vol, sector-led regimes |
| Factor attribution | Identify useful/noisy factors | rank IC, hit rate, payoff, drawdown contribution |
| Behavioral review | Improve user process | actual vs recommended vs paper decisions |

### 19.2 Metrics

Use at least:

- Precision@K for top actionable candidates.
- Average excess return vs benchmark basket.
- Median excess return vs benchmark basket.
- Hit rate of positive excess return.
- Payoff ratio: average win / average loss.
- Rank IC between score and future excess return.
- Maximum drawdown of paper portfolio.
- Turnover.
- MAE/MFE.
- Time to profit.
- Calibration by confidence bucket.
- Performance by sector, market cap, liquidity, regime, and source-quality bucket.

### 19.3 Bias controls

- Use point-in-time data snapshots whenever possible.
- Freeze source-item collection timestamps.
- Do not use later article updates for earlier decisions.
- Do not use current index membership for historical universe unless explicitly documented.
- Account for delisted names or state survivorship-bias limitation.
- Avoid using future earnings revisions in historical snapshots.
- Split by calendar time, not random rows.
- Keep strategy version fixed within each test segment.

### 19.4 Benchmark construction

Every decision should store a benchmark basket at decision time. Suggested default:

- Broad market: SPY/QQQ/VTI.
- Sector ETF if industry mapping is confident.
- Thematic ETF where appropriate and available.
- Small-cap adjustment using IWM when market cap/liquidity indicates.
- Custom peer basket where peer set is reliable.

Do not change the benchmark after the outcome is known.

---

## 20. How the system should learn safely

The system should learn through **controlled evaluation**, not autonomous prompt mutation.

### 20.1 Allowed learning

- Update factor weights after sufficient out-of-sample evidence.
- Add or remove factor rules after documented backtest and paper results.
- Add new risk gates after repeated failure modes.
- Store qualitative lessons from failed and successful theses.
- Adjust confidence calibration based on historical reliability.

### 20.2 Disallowed learning

- LLM rewrites scoring rules automatically.
- LLM increases weight of a factor because of one vivid trade.
- Strategy changes without versioning.
- Optimizing on outcomes that include future data.
- Applying learned weights before holdout validation.
- Treating social/news popularity as proof of alpha.

### 20.3 Controlled weight-update process

```text
1. Freeze online decisions and outcomes.
2. Compute factor stats by horizon and regime.
3. Exclude factors with insufficient samples.
4. Estimate proposed weight changes with max step size.
5. Test proposal in walk-forward and holdout periods.
6. Run paper shadow strategy before production.
7. Human reviews proposal and approves new strategy version.
8. Store change reason, metrics, config hash, and active date.
```

Suggested safeguards:

- Minimum samples per factor: 50 for review, 100+ for production changes.
- Max weight movement: 1–2 percentage points per approved update.
- Minimum active period before next update: 20 trading days.
- Require improvement in excess return and drawdown-adjusted metrics.
- Reject changes that improve one regime while catastrophically worsening another unless intentionally regime-specific.

### 20.4 Lesson memory

Qualitative lesson example:

```json
{
  "lesson_id": "lesson_2026_07_02_nvda_gap_chase",
  "lesson_type": "behavioral_pattern",
  "linked_decisions": ["rec_..."],
  "linked_trades": ["trade_..."],
  "market_regime": "risk_on_high_momentum",
  "observation": "User repeatedly chased semiconductors after large opening gaps.",
  "evidence": ["outcome_...", "trade_review_..."],
  "proposed_rule_change": "Add opening-gap cooldown for discretionary buys.",
  "status": "observation_only"
}
```

A lesson can become a rule only through the strategy-version workflow.

---

## 21. Open questions and technical risks

### 21.1 Data and licensing

- Which data sources are licensed for long-term storage and derived analytics?
- Can analyst revisions and research-report summaries be legally stored and summarized at scale?
- Are options chain fallbacks consistent enough to compute IV rank and skew reliably?
- How should missing or delayed data be marked during regular vs pre/post-market sessions?

### 21.2 Backtest integrity

- Does the project have historical source snapshots, or only current data plus later archives?
- How will survivorship bias be handled for all-stock scans?
- Can the system reconstruct prior factor snapshots exactly?
- Are benchmark bars available for every outcome horizon?

### 21.3 Architecture maintainability

- How much code should be extracted from `server.mjs` before adding new features?
- Should SQLite become authoritative for decisions/outcomes while `store.json` remains UI cache?
- Should route schemas use a library or lightweight hand validation?
- How should migration and backward compatibility for existing `data/store.json` be handled?

### 21.4 LLM reliability

- Which LLM provider is most reliable for schema-valid structured outputs?
- How should hallucinated citations be detected?
- What is the fallback behavior when all LLM providers fail?
- What prompts should be considered strategy-relevant and versioned?

### 21.5 IBKR safety

- Should the project ever include live order submission, or stop at order drafts and read-only monitoring?
- How will account identifiers and trade data be protected locally?
- How will option trades, assignments, expirations, and corporate actions be represented?
- How will the system avoid confusing paper, actual, and hypothetical trades?

### 21.6 Product behavior

- How many actionable recommendations per day are actually useful for the user?
- What position-sizing rules should apply to the user’s portfolio?
- How should the system handle conflicting goals: research breadth vs focus, speed vs depth, novelty vs quality?
- Should the assistant optimize for short-term trades, swing trades, long-term investing, or separate modes?

---

## 22. Recommended 10-day implementation plan

This is a practical near-term plan for turning the roadmap into code without a rewrite.

### Day 1–2: Inventory and contracts

- Generate route/function/storage inventory.
- Identify all recommendation-related routes and storage keys.
- Draft JSON schemas for source items, data-quality audits, factor snapshots, decisions, and outcomes.
- Add schema validation helpers.

### Day 3: Data-quality audit MVP

- Add source freshness and fallback metadata.
- Implement data-quality audit for ticker snapshot and recommendation scope.
- Show warnings in existing UI cards.

### Day 4: Factor snapshot persistence

- Persist factor snapshots using existing recommender core utilities.
- Link snapshots to all-stock agent outputs.
- Add deterministic unit tests.

### Day 5: Recommendation decision log

- Add immutable decision record table.
- Convert all-stock output to research/watch/actionable/avoid/sell-review/hold.
- Add decision-detail API.

### Day 6: Outcome freezer

- Freeze T+1/T+3/T+5/T+10/T+20 outcomes.
- Store benchmark basket at decision time.
- Add missing-data outcome statuses.

### Day 7: UI visibility

- Add recommendation dashboard sections.
- Add factor waterfall and risk-gate display.
- Add data-quality warnings.

### Day 8: IBKR read-only hardening

- Add sync-run records and coverage warnings.
- Add tests that default config cannot submit live orders.
- Show read-only/paper/live-disabled status in config UI.

### Day 9: Backtest/evaluation smoke

- Verify existing backtest routes or add minimal walk-forward smoke.
- Compute precision@K, excess return, hit rate, rank IC, drawdown, and turnover for available historical decisions.

### Day 10: Documentation and acceptance review

- Link this roadmap from README/docs UI.
- Add P0 acceptance checklist.
- Run Node/Python smoke tests.
- Record current limitations and next P1 tasks.

---

## 23. Final recommended direction

The repository is already more advanced than a simple “AI stock assistant” concept. Its next stage should be disciplined productization, not more loosely connected features.

The highest-value path is:

1. **Make every recommendation reproducible.** Persist factor snapshots, decisions, source IDs, data quality, and strategy versions.
2. **Evaluate against benchmarks.** Judge recommendations by excess return, not raw return.
3. **Keep the LLM in the right role.** Use it for explanation, critique, and review; do not let it be the scoring engine or execution engine.
4. **Use IBKR first for review, not trading.** Historical trades and positions will make the assistant personal and useful without creating live-order risk.
5. **Treat social/news/options as noisy evidence.** Useful for discovery and risk context, dangerous as standalone alpha.
6. **Control learning.** Strategy updates must be slow, versioned, benchmark-relative, and validated out of sample.
7. **Avoid a rewrite.** Extract modules from `server.mjs` gradually, starting with schemas, data quality, factor snapshots, decisions, outcomes, and IBKR sync.

If P0 is implemented well, the project will become a credible auditable personal investment assistant. If P0 is skipped, P1-P3 features will likely increase noise, overfitting, and operational risk.
