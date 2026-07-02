# Market Pulse AI 改进计划 V3 —— 新功能路线（竞品对标）

> 编写时间：2026-06-30
> 触发：用户要求“深读现有代码 + 上网找同类项目 + 该加什么新功能”，落盘供后续实现。
> 方法：① 通读 `server.mjs`(36k 行)/`public/app.js`/`lib/market_core.mjs`/`strategies/all_stock_agent_skill.md`；② 检索同类开源项目；③ 区分「真缺」与「有骨架待升级」，只把**真正能补差距**的项列进来。
> 衔接：本计划只覆盖**新功能方向**；可靠性/信息密度类待办仍以 [`IMPROVEMENT_PLAN_V2.md`](IMPROVEMENT_PLAN_V2.md) §四 为准（LLM 翻译/摘要瓶颈、§8 追责闭环、SQLite 迁移等），不在此重复。

---

## 〇、先看这里：现状盘点（避免重复造轮子）

本代码库**比表面成熟很多**。下列能力**已存在**，V3 多数是“升级/接线”，不是从零做：

| 能力 | 现有实现 | 状态 |
|---|---|---|
| 多智能体投研 | `buildAgentDebate`（`server.mjs:30496`，新闻/基本面/技术/情绪/风险/证据 6 角色 + 多空 + riskVeto），UI `agentDebateBlock` + Prism 三棱镜（Seri/道士/Cat） | ⚠️ **单轮启发式**，stance 由 if-else 定；`riskVeto` 仅展示，**未接入决策** |
| 全市场硬规则 Agent | `runAllStockAgentForRun`/`buildAllStockAgentEvaluation`，每日 10 买 N 卖 + 自学习调权 | ✅ 已闭环 |
| 追责快照 | `buildAllStockAgentOutcomeSnapshots`（T+1/3/5/10 冻结、SPY 超额、无 look-ahead）、`buildAllStockAgentRuleStats`、`buildAllStockAgentPaperBook` | ✅ 已闭环（慢热，靠时间积累） |
| 一致预期/EPS 修正 | `collectLongBridgeResearchPack` 已取 `consensus`/`forecast-eps`/`institution-rating`；`firstConsensusPeriod`/`consensusMetric`；反向 DCF `buildReverseDcfExpectationGap` | ⚠️ **已抓数据**，但未做成 Agent 因子/独立面板 |
| 财报日历 | `collectLongBridgeEarningsCalendarEvents` + `finance-calendar report` | ⚠️ 有数据，无“催化指挥台”工作流 |
| 内部人交易 | `researchInsiderSummary`（Form 4 买/卖/授予 + `insiderBias`），SEC 已识别 13F/13D | ⚠️ 有摘要，未做成因子/面板/异动 |
| 盘中数据 | `collectLongBridgeMicrostructure`（intraday/逐笔/盘口） | ⚠️ 有数据，**无实时告警/推送** |
| 单名仓位建议 | 投资建议 `positionSizing`、paper book 等额建仓 + 个名 Sharpe | ⚠️ **无组合层**优化/相关性/情景 |
| 回测 | `buildMomentumBacktest` + `updateSignalHistory`（动量信号回测） | ⚠️ **不是**对 skill 规则的 walk-forward 回测 |
| 聊天 | `/api/chat`：`summarizeRunForChat` 把最新 run 塞进 prompt，单次 LLM 调用 | ⚠️ **静态上下文**，非工具调用 Agent |

> 结论：**基础设施领先同类玩具项目；真正短板是“单视角推理 + 缺历史验证 + 缺实时/组合层”**。下面据此排序。

---

## 一、竞品对标（找差距）

| 项目 | 它有、我们弱的点 |
|---|---|
| [TradingAgents](https://github.com/TauricResearch/TradingAgents)（我们 `buildAgentDebate` 已致敬） | **真多轮 LLM 辩论**（多空研究员来回反驳）+ 风险经理/基金经理**审批后才出决策**；我们是单轮启发式且 veto 不接决策 |
| [ai-hedge-fund](https://github.com/bit-r/TradingAgents-AI-hedge-fund) / [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | 投研员 persona + **组合经理角色**（组合层加减仓） |
| [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | 452 预置 alpha 因子库 + **一切走工具调用**的 Agent（我们 discovery 是启发式打分、chat 是静态上下文） |
| [AgenticTrading](https://github.com/Open-Finance-Lab/AgenticTrading) | **历史回测 + 纸面交易**一体的 harness + 决策日志（我们只有前向 track record，缺离线回测 skill 规则） |
| [Look-Ahead-Bench](https://arxiv.org/pdf/2601.13770) | 形式化的 look-ahead 偏差基准——正好可作为我们回测的验收标准 |
| WarrenAI / Robinhood Cortex（商业） | 财报分析 + **盘中异动推送** + AI 评分新闻 + 内部人追踪面板 |

---

## 二、V3 待办（按 ROI 排序）

### 🔴 P0 —— 闭合“可信度”最大缺口

#### V3-1 全市场 Agent 的历史 walk-forward 回测（**净新增**）
- **差距**：现有 `buildMomentumBacktest` 是**动量信号**回测，**不是**对 `all_stock_agent_skill.md` 那套买卖规则/门控的回测。`IMPROVEMENT_PLAN_V2.md §8.4-5` 列了但未做。线上 track record 是“慢热”机制，调权前没有任何离线验证。
- **做什么**：先用历史 `stockHistory` 快照（+ 当时报价/技术/基本面）对**当前 skill JSON 规则**跑“可用数据回放”：每个历史交易日按当时快照选 10 买 N 卖 → 用各 horizon 后续快照算相对 SPY 超额 → 输出每规则期望/胜率/换手与组合权益曲线。
- **关键纪律**：严格 PIT（决策只用决策时点可得，禁用未来收盘/未来财报，对齐 Look-Ahead-Bench）；死区判定复用 `buildAllStockAgentOutcomeSnapshots` 的口径；产物落 `data/` 不污染线上 store。
- **边界说明**：第一版不是 survivorship-free 机构级回测；缺退市票、历史一致预期与完整 security master 时，必须在 UI/报告里标注“基于现有快照”。V3-10 再补完整退市/复权历史。
- **复用**：`buildAllStockAgentEvaluation`（评分）、`buildAllStockAgentRuleStats`（按 horizon 统计）、`buildAllStockAgentPaperBook`（权益曲线/Sharpe/MaxDD）。
- **新端点/页面**：`POST /api/all-stock-agent/backtest` + 研究页“信号回测”面板加“规则回测”标签。
- **验收**：能对当前 skill 跑出 ≥N 个交易日的 walk-forward，给出每规则 IC 与组合 Sharpe/MaxDD；**调权前先看回测**成为流程。
- **依赖**：历史快照已有；幸存者偏差需退市票（见 V3-10，可后补）。

#### V3-2 把 `riskVeto` + 多空结论接入 Agent 决策门控（**升级现有**）
- **差距**：`buildAgentDebate` 的 `riskVeto`/`finalDecision` 目前**只在个股报告展示**，`runAllStockAgentForRun`/`buildAllStockAgentEvaluation` 选买入 10 名时**不读它**。即“风险经理否决”是说说而已。
- **做什么**：第一阶段做 **shadow/cap gate**：对每个候选取其 `agentDebate.finalDecision`，`riskVeto=true` 先触发 `cap_buy`/降权并记录“若硬 veto 会怎样”；`多空分歧` 降权或移入“等待确认”。等 outcome 样本验证后，再决定是否升级成硬 `veto_buy`。
- **复用**：skill `riskGates` 已有 `veto_buy`/`cap_buy` 机制，加一条 `debate_risk_veto` 即可。
- **验收**：decision 记录里能看到 debate gate 命中；track record 能比较“被 shadow/cap 的票 vs 放行票”后续表现；样本足够后再升级硬 veto。

---

### 🟠 P1 —— 用已抓到的数据补强（性价比高）

#### V3-3 预期差升级为显式因子 + 面板（**升级现有**）
- **差距**：`consensus`/`forecast-eps`/`institution-rating` 已在 `collectLongBridgeResearchPack` 抓到，反向 DCF 也有，但**没变成 Agent 买卖规则，也没独立 UI**。`IMPROVEMENT_PLAN_V2.md §8.5` 把它列为最高性价比因子。
- **做什么**：① skill 增因子 `expectation_gap`（实际/指引 vs 一致预期；EPS 修正方向）作 buy/sell 规则；② 财报后“超/不及预期 + 盘后反应”进追踪；③ 个股页加“一致预期 vs 实际 / 目标价分布 / EPS 修正趋势”面板。**无需 FMP/Zacks，Longbridge CLI 已够**。
- **验收**：买入候选能解释“相对预期是 beat/inline/miss”；面板展示一致预期与目标价。

#### V3-3B 数据质量与来源审计总线（**升级现有，P0 辅助项**）
- **差距**：`analysisContextPack` 已有，但不是所有 Agent 决策都强制引用；用户看到建议时仍难判断“哪些数据是真的、哪些缺失”。
- **做什么**：每个投资建议和全市场 Agent decision 都带 `dataQualityAudit`：价格、技术、新闻正文、基本面、预期差、期权、社交、宏观分别输出 `source/status/quality/missingReason`。UI 只展开有料项，缺失项用短标签提示。
- **验收**：任一买入/卖出建议都能回答“这条建议依赖了哪些数据、缺了哪些数据、质量多少分”。

#### V3-3C 新闻故事线聚合（**净新增，P1**）
- **差距**：新闻卡片多但分散，用户需要的是“发生了什么故事、为什么影响股票”。
- **做什么**：按公司/主题聚合成故事线：财报/指引、AI capex、监管诉讼、分析师上调、供应链订单、宏观利率。每条故事含时间线、关键数据、影响方向、未证实点和来源。
- **验收**：首页/个股页可先看 3-8 条故事，而不是 40 条孤立新闻。

#### V3-3D 组合约束优先于单票建议（**升级现有，P1**）
- **差距**：操作建议主要看单票，缺“我的组合能不能再买”。
- **做什么**：把真实持仓、paper book、行业集中度、相关性、财报集中风险和宏观 regime 接到操作建议，输出 `可以买但最多 X% / 已重仓不加 / 先减仓 Y%`。
- **验收**：操作建议页显示组合层限制，不再只给单票买卖。

#### V3-3E Agent 评测集（**净新增，P2**）
- **差距**：每次改新闻/Agent 逻辑，容易回归到“只读标题”“错挂 ticker”“无数据硬建议”。
- **做什么**：固定样本问题和历史案例，跑 summary/ticker ownership/action advice eval；把 eval 分数写到执行报告。
- **验收**：核心改动必须跑一组固定 eval，避免质量倒退。

#### V3-4 财报/催化指挥台 + 期权 IV crush（**升级现有**）
- **差距**：`collectLongBridgeEarningsCalendarEvents`/`finance-calendar` 有数据，但没有“盯财报”工作流；期权链已采集但没和财报联动。
- **做什么**：首页/个股页“催化指挥台”——财报倒计时、财报前 setup（隐含波动率分位、历史财报跳空）、**财报前持有期权的 IV crush 预警**、财报后漂移跟踪。无财报标的复用现有“关键日历”面板扩展。
- **验收**：关注列表里临近财报的标的有倒计时与“财报风险/IV 偏高”提示；持有相关期权时给 IV crush 警告。

#### V3-5 Agentic 工具调用聊天（**净新增**）
- **差距**：`/api/chat` 是**静态上下文**（`summarizeRunForChat` 塞进 prompt，单次调用）。同类（WarrenAI/Vibe-Trading）让助手**按需调工具**取新鲜数据。
- **做什么**：给 chat 接 LLM tool-calling，暴露只读工具：`research-pack`、`industry-chain-pack`、`options/chain`、`stocks/snapshot`、`fred/macro-regime`、（未来）`screener`、SEC filing 取数。助手能“现拉一个票的研究包/期权链/筛一遍”，而非只答上下文已有。
- **风险控制**：工具只读、单轮工具次数上限、复用现有熔断/超时；失败回退到当前静态上下文回答（零回归）。
- **验收**：问“帮我现在筛出本周财报 + 站上 20 日线的票”，助手能调工具返回，而不是“上下文里没有”。

---

### 🟡 P2 —— 差异化能力

#### V3-6 实时盘中告警 + 推送引擎（**净新增**）
- **差距**：盘中数据 (`collectLongBridgeMicrostructure`) 有，但只有**定时邮件**，无规则化实时告警/推送。
- **做什么**：轻量告警引擎——价格/成交量突破、异常期权流、`top-movers`/`anomaly` 异动、关注列表新闻催化触发；推送走邮件/桌面通知/Webhook（复用现有 Resend/SMTP）。规则在配置中心管理，去重复用现有“提醒”稳定指纹。
- **验收**：盘中触发条件能在分钟级产生一条去重告警并推送。

#### V3-7 组合层构建与风险（**净新增/升级**）
- **差距**：有单名 `positionSizing` 和 paper book 等额建仓，**无组合层**：相关性/集中度、波动率目标/Kelly 上限across the book、regime 情景压力测试。
- **做什么**：① 持仓相关性/集中度热力图（行业、因子、单票权重）；② 组合级仓位建议（vol-target + Kelly 封顶，喂给 paper book 和真实持仓）；③ 结合 `fred/macro-regime` 的情景压力测试（“利率 +50bp / VIX→30 时本组合估计回撤”）。
- **复用**：FRED regime、`calculateTradeJournal`、paper book Sharpe/MaxDD。
- **验收**：持仓页给出集中度热力图 + 一条组合级再平衡建议 + 一个 regime 情景回撤估计。

#### V3-8 内部人/13F 升级为因子 + 面板（**升级现有**）
- **差距**：`researchInsiderSummary`（Form 4 + `insiderBias`）已有，SEC 已识别 13F，但**没做成 Agent 因子，也没专门面板/异动**。
- **做什么**：① skill 增 `insider_cluster_buy` / `institutional_accumulation` 因子；② “聪明钱”面板：近 90 天内部人集群买入、13F 季度增减、机构评级变化；③ 集群买入/大额增持触发 V3-6 告警。
- **验收**：买入候选能体现“内部人/机构在买”维度；面板列出最近内部人与 13F 变动。

---

### 🟢 P3 —— 锦上添花 / 依赖项

- **V3-9 因子/alpha 筛选器**：接 Longbridge `screener` + OpenBB，把 discovery 从启发式打分扩成可配置因子筛选（对标 Vibe-Trading alpha 库）。
- **V3-10 退市票 + 复权历史**（survivorship-free）：消除回测幸存者偏差，是 V3-1 可信度的前提，可后补。
- **V3-11 多轮真 LLM 辩论**：把 `buildAgentDebate` 的 if-else stance 升级为多空研究员多轮反驳（成本高、低频标的才跑），是 V3-2 的进阶。
- **V3-12 `market-temp` 情绪面板**：Longbridge 市场情绪 0–100 接入大盘 regime 面板（数据源已认证、未用）。

---

## 三、优先级总表

| 优先级 | 项 | 类型 | 主依赖 |
|---|---|---|---|
| 🔴 P0 | V3-1 skill 历史 walk-forward 回测 | 净新增 | 历史快照（有） |
| 🔴 P0 | V3-2 riskVeto/多空接入决策门控 | 升级 | `buildAgentDebate`（有） |
| 🟠 P1 | V3-3 预期差因子 + 面板 | 升级 | consensus/EPS（已抓） |
| 🟠 P1 | V3-3B/3C/3D 数据质量、故事线、组合约束 | 混合 | 现有 context/news/portfolio |
| 🟠 P1 | V3-4 财报催化指挥台 + IV crush | 升级 | 财报日历/期权（有） |
| 🟠 P1 | V3-5 Agentic 工具调用聊天 | 净新增 | 现有只读 API |
| 🟡 P2 | V3-6 实时盘中告警 + 推送 | 净新增 | 盘中数据/Resend（有） |
| 🟡 P2 | V3-7 组合层构建与风险 | 净新增 | FRED/交易日志（有） |
| 🟡 P2 | V3-8 内部人/13F 因子 + 面板 | 升级 | `researchInsiderSummary`（有） |
| 🟢 P3 | V3-9/10/11/12 | 混合 | 见各项 |

---

## 四、一句话总结

基础设施已领先同类项目，真正缺的是**历史验证（V3-1）**与**把已有的风险/预期/内部人信号真正接进决策（V3-2/3/8）**；其后再补**数据质量审计、故事线、组合层（V3-3B/3C/3D/V3-7）**和**工具调用聊天（V3-5）**形成对 WarrenAI/Cortex 类商业产品的差异化。建议从 **V3-1 + V3-2 + V3-3** 起步——它们成本可控、且直接提升 Agent 推荐的可信度与可追责性。

### 参考项目
[TradingAgents](https://github.com/TauricResearch/TradingAgents) · [ai-hedge-fund](https://github.com/bit-r/TradingAgents-AI-hedge-fund) · [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) · [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) · [AgenticTrading](https://github.com/Open-Finance-Lab/AgenticTrading) · [awesome-ai-in-finance](https://github.com/georgezouq/awesome-ai-in-finance) · [Look-Ahead-Bench](https://arxiv.org/pdf/2601.13770)
