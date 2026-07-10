# Market Pulse AI — Final Integrated Investment Assistant Roadmap

> Written: 2026-07-03
> Synthesized from three AI-generated drafts:
> - [INVESTMENT_ASSISTANT_ROADMAP.md](INVESTMENT_ASSISTANT_ROADMAP.md) (Claude — code-verified baseline, critical vision review)
> - [INVESTMENT_ASSISTANT_ROADMAP_v2.md](INVESTMENT_ASSISTANT_ROADMAP_v2.md) (Codex — schemas, governance, implementation templates)
> - [INVESTMENT_ASSISTANT_ROADMAP_v1.md](INVESTMENT_ASSISTANT_ROADMAP_v1.md) (Gemini — timeline discipline, portfolio-aware gating)
>
> Current-state facts (what exists, line counts, verified test results) are taken from the Claude draft, which is the only one grounded in direct code reading. Where the other drafts proposed building something that already exists, the task is recast as "verify / extend / surface."

---

## 0. Assumptions (stated explicitly)

1. **Attribution**: file→model mapping as above; inferred from provenance evidence (the Claude draft matches the prior session's verified audit; v2 self-describes a GitHub-web-only review; v1 is the remaining draft). If the mapping is wrong, the content evaluation still stands.
2. **Team**: one developer (the owner), part-time, no hard external deadlines. Timeline units are calendar weeks of part-time work, not FTE-weeks.
3. **Deployment**: single-user, localhost-only, no auth required until remote exposure is ever considered.
4. **Data access**: Longbridge CLI auth, IBKR account, Finnhub/FRED/etc. free tiers remain available.
5. **Capital safety**: no live trading on this roadmap. Order *drafts* with human approval are the ceiling, and are conditional (§7, Phase 3).
6. **Verified baseline** (from the Claude draft, 2026-07-03): the 10-factor recommender, hard-rule daily agent, frozen T+1/3/5/10 benchmark-relative outcomes, capped factor-weight learning, paper book, walk-forward backtest endpoint, FIFO trade journal, IBKR Flex import, and the Python debate harness **already exist and pass tests**. This roadmap does not rebuild them.

---

## 1. Strategic objectives

1. **Dependability before features.** Make the data layer (93 MB `store.json` single-file primary) durable enough to trust every morning. (All three drafts agree; Claude quantifies it.)
2. **Reproducibility and audit.** Every recommendation must be reconstructable: frozen factor snapshot, data-quality audit, strategy version, source IDs, benchmark basket. (Codex's strongest theme.)
3. **The assistant, not the trader.** LLMs explain, challenge, synthesize, and review; deterministic factors + gates score; hard rules decide; humans act. LLM output never writes scores, gates, or weights. (Unanimous across drafts.)
4. **Personal loop closure.** Compare the owner's actual IBKR trades against the system's same-day calls (reconciliation) and review process quality separately from outcome quality. (Claude's highest-value insight + Codex's review taxonomy.)
5. **Learning that earns authority.** Weight changes are mechanical, capped, regime-aware, and adopted only after walk-forward validation beats the active version. (Claude's validation gate + Codex's governance thresholds.)
6. **Anti-overtrading by design.** ≤3 actionable calls/day, per-ticker cooldowns, earnings blackouts, and portfolio-exposure-scaled thresholds. (Codex's gate config + Gemini's dynamic threshold.)
7. **Start irreplaceable data accrual immediately.** IV snapshots, point-in-time universe lists, and regime tags cannot be backfilled — every week of delay is a week of evaluation history lost forever. (Synthesis insight: these are calendar-bound, so they move to Phase 0 regardless of when they're consumed.)

---

## 2. Phases, timeline, and milestones

Sequencing note: Phase 2 is **calendar-gated, not effort-gated** — factor/regime statistics need samples that accrue at ~10 decisions/trading day, so its start date depends on when Phase 0's tagging lands, which is another reason Phase 0 comes first.

> **Amendment 2026-07-05**: the historical backtest corpus (see [CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md](CAPABILITY_GAPS_AND_HISTORICAL_LEARNING.md) §10, decisions D11–D15) converts most of Phase 2 to effort-gated: the validation gate and regime dashboards build on historical evidence right after the corpus lands, a historically-calibrated strategy version may be human-adopted with a 4–6 week live parity window, and Phase 2 arrives ~a quarter earlier than shown below. Phase 3.1 (debate promotion) and 3.4 (order drafts) keep live-only evidence clocks; 3.2/3.3 were always effort-gated.

```
Phase 0  Foundation & Accrual        Weeks 1–6      "Can I trust it?"
Phase 1  Daily Assistant Core        Weeks 7–16     "Is it useful every morning?"
Phase 2  Learning Loop Authority     Months 5–6     "Has it earned the right to adapt?"
Phase 3  Conditional Advanced        Month 7+       "Only if Phases 0–2 prove out."
```

| Milestone | Target | Definition of done |
|---|---|---|
| **M0** | End of week 2 | Route inventory generated; strategy versioning live (every new decision stamped); `options_snapshots`, PIT universe, and regime tags accruing daily |
| **M1** | End of week 6 | SQLite authoritative for news + decisions/outcomes (checksummed dual-write verified); data-quality audit block on every advice card; T+20/T+60 horizons live; anti-overtrading gate enforced |
| **M2** | End of week 12 | Today page recomposed (≤8 stories, ≤3 actionable); consolidated stock deep-dive page live; reconciliation report v1 classifying ≥90% of imported trades |
| **M3** | End of week 16 | Transcript/guidance ingestion (or honest fallback); value-chain enrichment with verified-vs-inferred labels; tool-calling chat |
| **M4** | End of month 6 | Validation-gated weight adoption with rollback; regime-split evaluation dashboard; user paper portfolio (accept-a-call) |
| **M5** | Month 7+ (conditional) | Debate gate promotion decision made on evidence; portfolio risk assistant; order drafts remain double-locked and optional |

---

## 3. Phase 0 — Foundation & Accrual (Weeks 1–6)

**Goal:** make the existing engine auditable, durable, and start every clock that can't be rewound.

| # | Task | Source draft(s) | Notes |
|---|---|---|---|
| 0.1 | **Codebase & route inventory** — script that emits `docs/CODEBASE_ROUTE_INVENTORY.md` (54 routes, handlers, storage keys, UI fetch mapping); fail on duplicate routes | Codex P0.1 | 1–2 days; cheap insurance before touching a 37.9k-line monolith. Do *not* let this expand into a rewrite. |
| 0.2 | **Strategy versioning + decision stamping** — `strategy_versions` table (Codex DDL: config_hash, change_reason, evaluation_summary, active_from/to); hash skill JSON on every change; stamp every decision with `strategy_version` | Claude P0.2 + Codex §8.7 | Prerequisite for validation-gated learning (2.1). |
| 0.3 | **Horizons +T20/+T60 and regime tagging** — extend `reviewAfterDays`; tag every decision/outcome/factor-stat row with the FRED regime bucket | Claude P0.3 | T+60 for thesis review only, excluded from weight learning until n justifies. Regime tags are accrual-critical. |
| 0.4 | **SQLite-primary migration, phase 1** — dual-write `news_items` + slim `runs` with row-count + spot-hash checksums; switch news readers; `store.json` demoted toward export format | Claude P0.1 + Codex §8.1 | Biggest operational risk (B1). Keep the store.json export path forever. WAL mode on. Postgres (Gemini) rejected: overkill for single-user local. |
| 0.5 | **Data-quality audit block on every advice card** — per-decision JSON: which fields real/missing/stale/fallback, final score; **DQ score below threshold blocks `actionable` classification** (downgrade to research) | Claude P0.4 + Codex §8.3 + Gemini's DQ<60 veto | Codex's `data_quality_audits` dimensions (freshness, completeness, reliability, cross-source agreement, fallback penalty) are the schema; Gemini's hard veto is the teeth. |
| 0.6 | **Irreplaceable accrual tables** — `options_snapshots(ticker, as_of, iv_atm, chain quality, provider)` daily; PIT liquid-universe snapshot daily | Claude P0.5 + P2.5 (moved up) | PIT universe moved from Claude's P2 to Phase 0: it costs ~a day and every day not accruing is unrecoverable survivorship bias in future backtests. |
| 0.7 | **Anti-overtrading gate** — max 3 actionable buys/day; 5-trading-day per-ticker cooldown (20 after a failed thesis); earnings blackout (no new actionable within 2 days of earnings unless event strategy); **dynamic threshold: required score scales up with current portfolio exposure** | Codex §10.5 + Gemini §6.2 + Claude §8.4.4 | Config lives in the versioned skill, not code. |
| 0.8 | **`audit_events` table** — recommendation runs, LLM calls, IBKR syncs, config changes; actor + status + payload | Codex §8.9 | Lightweight; append-only. |

**Explicitly deferred from Codex's P0:** factor-snapshot persistence, decision log, outcome freezer, benchmark baskets — these already exist (verified); Phase 0 only adds the missing columns (version, regime) rather than rebuilding.

**Acceptance criteria (M1):**
- `/api/state` p95 < 300 ms; residual `store.json` ≤ 10 MB; kill -9 during save loses at most one run's delta.
- Every new decision row has `strategy_version` + `regime`; dual-write checksums match for 2 consecutive weeks before reader switch.
- Any advice card answers "which data was missing" without dev tools; low-DQ names cannot appear as actionable.
- A ticker recommended on day T is not re-shown as new before T+5 without a thesis-change flag.

---

## 4. Phase 1 — Daily Assistant Core (Weeks 7–16)

**Goal:** the 10-minute morning loop — market context, ≤3 vetted calls, one-page stock research, and a mirror for the owner's own trading.

| # | Task | Source draft(s) | Notes |
|---|---|---|---|
| 1.1 | **Today page recomposition** — freshness badge → regime + editorial → 3–8 clustered stories (not 40 cards) → movers-with-reasons → earnings countdown → ≤3 actionable + collapsed research list with confidence/DQ/evidence chips → health strip | Claude P1.1 + Codex §15.1 | Codex's theme-cluster scoring (source reliability × corroboration × price confirmation) is the clustering algorithm; social-only themes visually marked unconfirmed. |
| 1.2 | **Consolidated stock deep-dive** — one endpoint + page: header/action/score → **factor waterfall** (raw → normalized → weighted contribution per factor, reconciling to the score) → business & chain → expectations (consensus vs reverse-DCF) → insider/institutional → options → news timeline → debate → invalidation conditions → decision history | Claude P1.2 + Codex §15.3 | Codex's factor waterfall is the best single UI idea across all drafts — adopt it verbatim. Facts visually separated from LLM synthesis. |
| 1.3 | **Trade↔recommendation reconciliation** — join imported IBKR trades to same-day decisions; classify {aligned, contrarian, uncovered}; `thesis_alignment` on every review | Claude §6.7 + Codex `trade_reviews` | Highest personal value per engineering hour; needs no new data. |
| 1.4 | **Value-chain enrichment** — curated per-industry chain templates + LLM-extracted supplier/customer/competitor lists, cached per ticker; **every relationship labeled verified (sourced) vs inferred (LLM), with confidence** | Claude P1.3 + Codex P1.3 | Codex's verified-vs-inferred separation prevents hallucinated supply chains from hardening into "facts." |
| 1.5 | **Earnings transcript / guidance ingestion** — Longbridge notice/report detail if available; else guidance extraction from post-earnings news bodies, honestly labeled | Claude P1.4 | No ToS-clean free transcript source is guaranteed; the fallback is acceptable if labeled. |
| 1.6 | **Options analytics hardening** — quality gates (real Greeks? OI fresh? provider tier?) feeding the DQ multiplier; "do-not-use-for-score" state when stale; IV rank/percentile turns on once `options_snapshots` has ~6 months of accrual | Codex P1.5 + Claude §6.4 | Options flow may inform risk context, never independently flip an action. |
| 1.7 | **Tool-calling chat** — expose the 7 read-only harness HTTP tools to `/api/chat`; ≤4 tool calls per turn; fall back to static-context chat on failure | Claude P1.6 | |
| 1.8 | **Post-trade review upgrade: process vs outcome** — behavioral taxonomy (FOMO, revenge, early sell, late stop, over-concentration, no-plan); a winning trade can be flagged poor process; a losing trade can be good process | Codex §15.6 | Extends the existing behavioral analytics, doesn't replace them. |

**Acceptance criteria (M2/M3):**
- Home shows ≤8 stories and ≤3 actionable calls; every driver links to at least one source item.
- For 10 benchmark tickers (AAPL, NVDA, AVGO, MRVL, TSLA, MSFT, AMZN, LLY, JPM, XOM): deep-dive shows non-empty, source-cited chain data; factor contributions sum to the displayed score; where a recent call exists, guidance numbers match the source.
- Reconciliation classifies ≥90% of imported IBKR trades with linked decision IDs.
- Chat answers "why was X recommended on Tuesday?" from the frozen decision record.

---

## 5. Phase 2 — Learning Loop Authority (Months 5–6, calendar-gated)

**Goal:** let the learning loop adapt only when it can prove, out-of-sample, that it should.

| # | Task | Source draft(s) | Notes |
|---|---|---|---|
| 2.1 | **Validation-gated weight adoption** — learned weights write to a *candidate* strategy version; nightly walk-forward compares candidate vs active on trailing 60–90 days (precision@10, excess return, MaxDD); auto-adopt only if candidate ≥ active on excess **and** not worse on MaxDD; else shadow + log; one-click rollback restores prior version byte-identically | Claude P2.1 + Codex learn/preview→learn/apply | Thresholds reconciled: keep existing minSamples 20 for *generating* candidates; require n ≥ 50 per factor plus a stored validation record for *adoption* (Codex's stricter bar applied where it matters). Max step stays ≤2%. |
| 2.2 | **Regime-split evaluation dashboard** — per horizon × regime: excess, hit rate (±0.5% deadband), precision@10, payoff, expectancy, MaxDD, turnover, rankIC per factor; **no metric rendered without its sample count**; calibration by confidence bucket | Claude P2.2 + Codex §19.2 | Anti-patterns enforced in review: no repainting, no post-hoc best-horizon headlines, no factor promoted on single-regime evidence. |
| 2.3 | **User paper portfolio (accept-a-call)** — owner accepts a recommendation into a personal paper book (distinct from the agent's own); slippage/cost assumptions stored in the strategy version; turnover cost drag displayed next to Sharpe | Claude P2.3 + Codex P2.3 + Claude §6.2 | The rehearsal space between "system said" and "I did." |
| 2.4 | **Lessons memory surfacing** — recall relevant harness lessons onto stock pages ("last time this setup…"); lessons link to decisions/outcomes/regimes; **observation-only until a human promotes one through the strategy-version workflow** | Claude P2.4 + Codex §20.4 | Lessons never touch weights. |
| 2.5 | **LLM output governance** — recommendation-facing LLM outputs validate against JSON schemas (claims + evidence IDs + confidence; assumptions + how-to-disprove; invalidation conditions); prompt template ID/version, model/provider, and schema-validation status stamped on artifacts | Codex §9.2/§9.4 | Prevents silent model drift from contaminating evaluation. Start with the debate and advice surfaces. |

**Acceptance criteria (M4):**
- No weight adoption exists without a stored validation record; rollback verified.
- Factor stats filterable by regime with correct sample counts; every backtest render carries its universe caveat until PIT accrual matures.
- Paper portfolio reconciles to fills and marks; no real broker calls.

---

## 6. Phase 3 — Conditional Advanced (Month 7+, each item gated)

| # | Task | Gate to unlock |
|---|---|---|
| 3.1 | **Debate gate promotion** — shadow → cap → hard veto | ≥50 gated decisions where vetoed names underperform, persisting across ≥2 regimes; latency/cost budget keeps debate top-5-candidates-only |
| 3.2 | **Portfolio risk assistant** — sector/factor/single-name concentration, correlation heatmap, vol-target sizing, regime stress scenarios | M2 reconciliation + IBKR position sync stable |
| 3.3 | **Real-time IBKR execution monitoring** (read-only socket event stream → journal) with reconnect/keep-alive daemon | Phase-1 review loop in daily use; Gemini's gateway-brittleness warning addressed by the daemon |
| 3.4 | **Order-draft workflow** — drafts only, mandatory human approval, full audit; **double-locked**: `IBKR_TRADING_ENABLED=true` *and* physical marker file `data/ALLOW_LIVE_TRADING` | ≥2 quarters of validated paper outperformance vs SPY with documented drawdown behavior. May reasonably never ship. No API order submission on this roadmap. |
| 3.5 | **Multi-modal review reports** — periodic HTML/PDF with entry/exit markers overlaid on charts | Nice-to-have; only after 3.2 |

---

## 7. Dependencies

```
0.1 inventory ──────────► (safety net for all later monolith edits)
0.2 strategy versions ──► 2.1 validation gate ──► 3.1 debate promotion
0.3 regime tags ────────► 2.2 regime-split dashboard
0.4 SQLite primary ─────► 1.1 Today page (fast queries), 2.2 dashboards
0.5 DQ audit ───────────► 1.6 options gating, 2.5 LLM governance
0.6 options_snapshots ──► 1.6 IV rank (~6 months accrual)
0.6 PIT universe ───────► honest backtests (calendar-gated)
IBKR Flex import (done) ► 1.3 reconciliation ──► 3.2 portfolio risk
1.2 deep-dive endpoint ─► 1.7 tool-calling chat (richer tools)
2.1 + 2.2 + 2.3 ────────► any Phase-3 unlock decision
Sample accrual (~10 decisions/day, calendar time) ► Phase 2 authority
```

---

## 8. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Store migration corrupts data | High | Checksummed dual-write (row counts + spot hashes) for 2 weeks before any reader switch; store.json export path kept forever |
| Longbridge dependency concentration (editorial, movers, consensus, calendar, fundamentals on one authenticated CLI) | High | Keep fallback collectors alive in diagnostics; document a degradation ladder; alert when primary down >1 run |
| Sample starvation (10 buys/day fills factor×horizon×regime cells slowly) | Medium | Accept 1–2 quarters before learning has authority; do **not** lower minSamples; longer-horizon consistency over best-cell selection (multiple-testing guard) |
| Survivorship/backfill bias in backtests | Medium | PIT universe accrual from week 1; label all pre-PIT backtests "in-sample universe" |
| Regime overfitting (samples from one regime) | Medium | Regime tags from week 1; no weight trend trusted without regime-split stats |
| Monolith gravity (37.9k lines keeps growing) | Medium | Each Phase-1 feature extracts its module rather than appending; inventory (0.1) makes edits safer |
| LLM invoker latency/cost (antigravity/codex CLI) | Medium | Tier router + circuit breakers (existing); debate top-5 only; local models for non-critical summarization (Gemini's cost suggestion) |
| Transcript sourcing legality/stability | Low | Fallback to guidance extraction from news bodies, honestly labeled |
| Over-engineering stall (Codex's 10+ tables / 8 services all at once) | Medium | Adopt schemas incrementally, only when the consuming feature lands; single-user tool does not need enterprise workflow ceremony |
| IBKR gateway disconnects | Low (read-only) | Reconnect/keep-alive daemon before any real-time monitoring (3.3) |

---

## 9. Success metrics

**System dependability**
- `/api/state` p95 < 300 ms; zero data-loss incidents; store.json ≤ 10 MB residual.
- 100% of new decisions carry strategy_version, regime, DQ score, and source refs.

**Daily usefulness (the 10-minute test)**
- Morning loop ≤ 10 minutes: regime + ≤8 stories + ≤3 actionable calls with evidence.
- Deep-dive completeness on the 10-ticker benchmark set; owner stops opening 4 other sites/apps.

**Research quality (report with n, always)**
- Precision@10 and benchmark-relative excess per horizon × regime; rankIC per factor; calibration by confidence bucket.
- Paper book excess vs SPY with MaxDD and turnover drag displayed together.

**Personal loop**
- ≥90% of IBKR trades reconciled to {aligned/contrarian/uncovered}; recurring behavior patterns surfaced monthly; process-vs-outcome flags on every closed trade.

**Learning integrity**
- Zero weight adoptions without validation records; zero LLM writes to scores/gates/weights (enforced in code review); zero live-order code paths.

---

## 10. Recommended priorities (if capacity forces choices)

1. **0.6 accrual tables** — a day of work; every day of delay is unrecoverable history. Do this first even before the migration.
2. **0.2 + 0.3 versioning/regime stamping** — cheap columns now, impossible to retrofit onto frozen history later.
3. **0.4 SQLite migration phase 1** — the single biggest dependability risk.
4. **1.3 reconciliation** — highest personal value per engineering hour.
5. **1.1 Today page** — converts existing machinery into a daily habit.
6. Everything else in phase order. If Phase 2 must slip, let it: outcomes accrue on their own; the validation gate matters only when there's something to validate.

---

## 11. Safety constitution (non-negotiable, merged from all three drafts)

1. No autonomous live trading; no order-submission code paths; drafts (if ever) double-locked behind env flag + physical marker file.
2. LLM never writes `factorSnapshot` scores, gate decisions, or skill weights; the debate coordinator cannot turn a vetoed name into an actionable buy (at most research/watch).
3. Missing data > wrong data: absent factors score neutral with `missingReason`; DQ multiplier discounts the whole score; low DQ blocks actionable.
4. Frozen records are immutable; corrections append, never overwrite; benchmarks never change after outcomes are known.
5. Every recommendation displays uncertainty, risks, invalidation conditions, DQ score, strategy version, and source IDs; no metric without its sample count.
6. The system's track record renders on the same screen as its recommendations — no confident UI atop an unproven engine.
7. All source failures surface in diagnostics; zero empty catch blocks (currently true — keep it in review).
8. Local-only by default; auth before any remote exposure; keys in gitignored `.env`; IBKR account IDs hashed in stored records.
9. Strategy changes (rules, weights, gates) only through the versioned, validated, human-approved workflow; the LLM may propose, never apply.
