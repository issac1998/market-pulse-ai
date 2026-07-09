# Changelog

## 2026-07-10

### Highlights

- Completed Round 6 crash resilience, benchmark integrity, PIT universe, strategy-version invariant, and trust-loop closure work.
- Added Trader Mirror so the owner's operations can be profiled with deterministic metrics and optional narrative-only LLM coaching.
- Replaced giant store writes with sectioned persistence and added repo/runtime integrity checks for first-party modules, data files, and harness paths.
- Scaled the honest-universe historical walk-forward path: chunked bar loading, chunked SQLite detail persistence, explicit grid metadata, cost-sensitivity rows, and a full PIT rerun with T+60 evidence.
- Recorded the updated D17 PIT evidence: full detail rows persisted for the 1/5/20/60 run, with regime split and per-horizon sample counts.

### Key Links

- PR links: no PR identifiers are present in local git history for this work.
- WP26-WP30 crash resilience, evidence integrity, and trust closure: [a875a6c](https://github.com/issac1998/market-pulse-ai/commit/a875a6c) → [8eb6d4a](https://github.com/issac1998/market-pulse-ai/commit/8eb6d4a)
- WP31 Trader Mirror: [3c0f567](https://github.com/issac1998/market-pulse-ai/commit/3c0f567)
- WP32-WP34 durability, integrity checks, and walk-forward scale: [3ce34fe](https://github.com/issac1998/market-pulse-ai/commit/3ce34fe) → [b046d0c](https://github.com/issac1998/market-pulse-ai/commit/b046d0c)

## 2026-07-05

### Highlights

- Completed the full investment-assistant execution queue WP1-WP25.
- Added historical corpus, walk-forward backtesting, metric bridges, PIT EDGAR data, factor quality analytics, strategy-version governance, and daily-loop frontend surfaces.
- Added Factor V2 lifecycle: cross-sectional normalization, sub-signals, factor DSL/registry, evaluator, factor researcher, effective-N stats, corpus evidence, live shadow factors, and promotion emitters.
- Hardened runtime operations: localhost binding, request-size caps, gzip responses, compact store persistence, scheduler catch-up, stale-source gates, and sample-accrual backfill.
- Added external integration round 2: FinanceDatabase security master, NYSE reference calendar, exact Piotroski/Altman formula support, and optional debate personas.

### Key Links

- PR links: no PR identifiers are present in local git history for this work.
- WP1-WP9 roadmap implementation: [b916737](https://github.com/issac1998/market-pulse-ai/commit/b916737) → [92d1ad6](https://github.com/issac1998/market-pulse-ai/commit/92d1ad6)
- WP10-WP16 Factor V2: [8adbed7](https://github.com/issac1998/market-pulse-ai/commit/8adbed7) → [db6cd7e](https://github.com/issac1998/market-pulse-ai/commit/db6cd7e)
- WP17-WP20 Round 3 evidence/statistics: [cc9f905](https://github.com/issac1998/market-pulse-ai/commit/cc9f905) → [077b6e1](https://github.com/issac1998/market-pulse-ai/commit/077b6e1)
- WP21-WP25 reliability and external integrations: [a318b01](https://github.com/issac1998/market-pulse-ai/commit/a318b01) → [30085b6](https://github.com/issac1998/market-pulse-ai/commit/30085b6)
