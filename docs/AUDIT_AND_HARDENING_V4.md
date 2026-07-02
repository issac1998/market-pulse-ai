# Market Pulse AI 审计与加固计划 V4（Codex 重构后）

> 编写时间：2026-07-02
> 触发：Codex 重构后，用户要求 ①找 bug（含会导致错误数据/性能问题的，以及使用中"膈应人"的小问题）；②让项目更"可依赖"——真能靠它收新闻、要投资建议、看趋势；③落一个新 md。
> 方法：读 `server.mjs`(37k) + 新抽出的 `server/*.mjs`、`lib/finance_math.mjs`、`lib/recommender_core.mjs`、`harness/`；跑 `node --check`（全绿）、`core_regression_tests`（ok）、harness tests（2/2）；抽查 `data/store.json`(93MB) 最新 run 真实数据。
> 结论先行：**重构质量高，无编译/回归破坏；技术指标数学正确；因子学习环设计对**。真正问题集中在 **①单文件 store 体量、②因子调权归一化的隐性漂移、③代理路径的 gzip、④"降级/过期"在 UI 上不够响**——后两类正是"膈应人"和"不敢依赖"的根源。

---

## 〇、先说健康的部分（校准信任）

- **重构干净**：`server.mjs` 拆出 `server/{network_fetch,email_delivery,cli_process,http_*,runtime_utils,...}.mjs` 与 `lib/{finance_math,recommender_core}.mjs`；`node --check` 全绿、`core_regression_tests` ok、harness 测试 2/2；**全库 0 个空 `catch {}`**（无静默吞异常）。
- **数学正确**：`lib/finance_math.mjs` 的 Wilder RSI、ATR、Black-Scholes gamma/IV 二分反解、EMA/MACD 均实现正确，不是抽取时抖出来的 bug。
- **因子学习环设计对**：`learnRecommendationFactorWeights`（`lib/recommender_core.mjs:52`）用 `relativeEdge = factorEdge − 样本加权均值` 的**差分归因** + `minSamples`(默认20) + 必须有 `rankIC` + 每步 ≤2% 封顶——正是我们讨论过的"差分信用、避免奖励对所有票都命中的因子"。`factor_stats` 现已落库（30 行），之前的空表已修。
- **新闻在收**：最新 run `1782832698093-pre`（2026-06-30、antigravity-cli）有 **40 条新闻**，`latestRun`=runs[0] 当前确实指向它。

> 所以下面的问题是"在一个已经不错的系统上找真实短板"，不是推倒重来。

---

## 一、Bug 与风险（按严重度）

| # | 严重度 | 位置 | 问题 |
|---|---|---|---|
| B1 | 🔴 高（性能/可靠性） | `data/store.json` + `saveStore`/`ensureStore` | 主存仍是 **93MB 单文件 JSON**（news/narratives 内联）。每次 save 全量序列化写盘、读路径 `structuredClone` 全量深拷贝 → 保存慢、内存尖峰、崩溃即整库风险。SQLite 只是**只读镜像**（`sqlite_store_sync`），不是主存。 |
| B2 | 🟠 中（正确性，隐性） | `lib/recommender_core.mjs:142` | 因子调权后 `normalizeRecommendationFactorWeights(nextRaw)` 把**所有**因子重归一到 1，包括**样本不足被 skip 的因子**——它们本应"不参与调权"，却因归一被**静默漂移**，且 `changes[]` 只记录 eligible，漂移**不可见**。同时"每步 ≤maxStepPct"在归一后**不再被保证**。 |
| B3 | 🟠 中（条件触发） | `server/network_fetch.mjs:236` `proxyFetchResponse` | 代理路径只解 `chunked`，**不解 `Content-Encoding: gzip/deflate`**。无代理走原生 `fetch`（自动解压）故正常；**一旦设了 `HTTPS_PROXY` 且上游压缩，`.text()/.json()` 得到乱码/抛错**。且代理路径**无响应体大小上限**（超大响应 OOM）。 |
| B4 | 🟡 低（潜伏） | `server.mjs:34943` `latestRun` | `return db.runs?.[0]`——**默认 runs[0] 恒为最新**。实测数组当前并非严格按时间排序（`chronological=False`），今天 runs[0] 恰好是最新，但只要任一写入路径把非最新 run 前插，**整个 UI/邮件/聊天会静默显示过期 run**且无报错。 |
| B5 | 🔵 待办（WIP） | 未提交的 `server.mjs` codex-cli 改动 | codex-cli provider 调用链**已完整**（`codexCliArgs` 替换 `{output_file}`、dispatch `:34299`），但**未提交、未端到端验证**。需确认 `--output-last-message {output_file}` 的临时文件**创建/清理无泄漏**，并跑一次真实 codex 调用再提交。 |

### 细节与修复建议

- **B1**：把 `runs[]` 的重字段（news 正文、narratives、options 链）迁到 SQLite 主表，`store.json` 只留索引/轻量元数据；或先做 **runs 分片**（每 run 一个文件 + 索引）。落地前的止血：`saveStore` 增加"写前大小告警 + 只在 dirty 时写"。
- **B2**：归一化只在 **eligible ∪ 未触发因子** 间重分配、**冻结 skipped 因子权重**；或在 `changes/skipped` 里显式记录归一带来的漂移；并在返回前 `assert(|learned−prev| ≤ maxStepWeight + ε)`。
- **B3**：代理路径按 `content-encoding` 用 `zlib.gunzipSync/inflateSync` 解压；加 `MAX_PROXY_BODY_BYTES` 上限；或对 https 代理直接改走 `undici` ProxyAgent，删掉手写 CONNECT/TLS 那一坨。
- **B4**：`latestRun` 改成"按解析时间戳取最大"或 save 时 `assert` 前插不变式；顺带给 `db.runs` 统一入口，杜绝散点 push/unshift。

---

## 二、"膈应人"/使用中的小问题（用户点名要的）

- **T1（信任）—— LLM 降级不够响**：外部 LLM 超时/熔断后自动退回**本地规则兜底**，但用户在"投资建议/摘要"里**分不清这条是 LLM 推理还是本地模板**。对"要靠它拿投资建议"的场景，这是最大的信任杀手。→ 每条建议/摘要卡片打 badge：`LLM 推理` / `本地兜底·未经 LLM`，并把当轮各 provider×tier 的熔断状态放进数据质量面板。
- **T2（新鲜度）—— 过期数据当现价展示**：最新 run 是 **2026-06-30**，今天 07-02，首页仍原样展示，无"数据时间/已过期"提示；`store.schedule` 元数据为空 → **定时是否真的在跑无从判断**。→ 用 run `completedAt` vs now + 交易时段，给全局"数据时间 T、距今 X 小时/已过期"徽标；把最近定时执行/邮件发送结果做成看得见的健康条。
- **T3（拖慢）—— 死源默认开**：`TRENDRADAR_ENABLED`/`IBKR_GATEWAY_ENABLED` 默认 true、XHS 配了 cookie 就开；本机这些常年拿不到（V2 已记：单轮采集 ~24 分钟，被死源重试拖尾）。→ 对"本机确认死"的源默认关，或给采集**硬预算隔离**：死源永远不能挤占 news/advice 的时间片。

---

## 三、让它"真能依赖"的实用化（对齐三大目标）

### 目标 A：可靠地收新闻
- 去重/正文抽取已有；缺的是**可见性**：①全局新鲜度徽标（T2）；②"本轮源健康"面板——哪些源填上了、哪些失败/超时/被封，直接摆首页；③**预算隔离**（T3），保证 news 覆盖不被死源拖垮。

### 目标 B：可依赖的投资建议
- ①**响亮的降级标注**（T1）是前提，否则用户无法判断该不该信；②个股建议卡要**摊开证据**：预期差（consensus/forecast-eps 已抓）、内部人（`researchInsiderSummary` 已有）作为因子在卡片上给出"依据+缺失项"；③把 harness 的**真 LLM 多空辩论**接进 Node 建议——目前是 `AGENT_DEBATE_INGEST_ENABLED` 默认关的**文件回灌**（`ingestAgentDebateIntoRun`），默认走不到；先在个股页做"一键跑 harness 辩论并回灌"的手动闭环。

### 目标 C：看懂趋势
- movers-with-reasons / hot news / market regime 已有；缺**时效**：①加交易时段+新鲜度上下文（T2）；②把"定时 2 次/天邮件"升级为**盘中告警推送**（价格/量突破、异常期权、异动榜触发），复用现有 Resend/SMTP 与"提醒"去重指纹。

---

## 四、优先级 Do-Next 清单

### 🔴 P0（信任与稳定，先做）
1. **T1 降级标注**：每条建议/摘要标 `LLM 推理` vs `本地兜底`，熔断状态上面板。*（改动小，直接决定"敢不敢信"。）*
2. **T2 新鲜度徽标 + 定时健康条**：run `completedAt` 驱动"已过期"，暴露最近定时/邮件结果。
3. **B2 因子归一化漂移**：冻结 skipped 因子 / 记录漂移 / 断言步长上限。*（当前是错误学习信号，越跑越偏。）*

### 🟠 P1（可靠性根治）
4. **B1 store 瘦身**：重字段入 SQLite 主表或 runs 分片；先加"只在 dirty 时写 + 大小告警"止血。
5. **B3 代理 gzip + 体积上限**（若从不设代理可降级为 P2，但留注释以防未来踩坑）。
6. **T3 死源默认关 / 采集预算隔离**：保证 news/advice 不被死源拖累。

### 🟡 P2（实用化增强）
7. **B4 `latestRun` 取时间戳最大**，加前插不变式断言。
8. **B5 codex-cli** 端到端验证 + 临时文件生命周期检查后提交。
9. **投资建议摊开证据**（预期差/内部人因子上卡）+ **harness 辩论手动回灌闭环**。
10. **盘中告警推送**（趋势时效）。

---

## 五、一句话总结

Codex 的重构是**干净且正确的**（数学、模块化、学习环都靠谱），没有会崩的硬 bug；真正拦住"能不能每天依赖它"的是四件事：**store 93MB 单文件（B1）、因子调权的隐性漂移（B2）、降级/过期在 UI 上不够响（T1/T2）**。把 P0 三项（降级标注、新鲜度徽标、归一化漂移）先做完，这个系统就从"能跑的 demo"变成"敢每天看的信息台"。

---

## 六、执行记录（2026-07-02）

- ✅ B1 止血：`saveStore` 增加 dirty write，内容未变化时跳过全量写盘；新增 `STORE_SIZE_WARN_BYTES` 和前端“存储健康”卡，展示 JSON 体积、最近写入/跳过、SQLite mirror 状态。
- ✅ B2 修复：因子学习改为冻结 skipped 因子，只在 eligible 因子间再平衡 delta；新增 `audit.stepViolations` 并补回归测试，防止归一化后越过单步上限。
- ✅ B3 修复：代理路径支持 `gzip/deflate/br` 解压，增加 `MAX_PROXY_BODY_BYTES` 体积上限；回归测试覆盖 chunked+gzip JSON。
- ✅ B4 修复：`latestRun` 改为按 `completedAt/generatedAt/startedAt/id` 解析时间取最大值，`/api/state` 历史报告按同一逻辑排序。
- ✅ B5 已在上一提交完成：codex-cli provider 已接入默认 LLM 路由。
- ✅ T1 修复：新闻/热闻展示 `LLM 摘要`、`LLM 失败·本地兜底`、`已读原文·规则摘要`；投资建议卡展示 provider、预期差、内部人和首条核心依据；LLM cooldown 按 provider×tier 暴露到模型路由面板。
- ✅ T2 修复：首页展示报告新鲜度；定时任务面板新增任务健康条，展示最近报告、最近邮件、下一次运行。
- ✅ T3 修复：TrendRadar 默认关闭（`.env` 显式开启仍生效），避免不稳定社交源拖慢核心采集；源暂停能力继续复用既有 source controls。
- ✅ P2 手动 harness 闭环：新增 `/api/agent-debate/run`，可调用 Python harness debate 并回灌最新 run；个股页新增“运行 LLM 辩论”按钮，优先展示回灌的 LLM debate。
- ✅ P2 盘中告警调度：新增 `INTRADAY_ALERTS_ENABLED` / `INTRADAY_ALERTS_NEW_YORK_TIME`，开启后复用现有采集、提醒和邮件通道；默认关闭，不改变盘前/盘后节奏。
