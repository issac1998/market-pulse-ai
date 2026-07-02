# Market Pulse AI 改进计划 V2

> 审阅时间：2026-06-27
> 范围：审查 Codex 在 `IMPROVEMENT_EXECUTION_REPORT.md` 中声称的修复（commits `87819a9`..`749b3d4`），分两条线核对——①代码层正确性；②实测运行结果。最后汇总 V2 待办。
> 实测样本：`data/store.json` 最新 run `1782507681643-post`（2026-06-26T21:01Z，`trigger=schedule`、`llmProvider=antigravity-cli`、40 条新闻 / 64 条报价）。

---

## 一、Codex 修复审查结论（先看这里）

### 1.1 已正确落地、实测生效的修复 ✅

| 项 | 代码位置 | 实测验证 |
|---|---|---|
| 9.1 站点壳/缓存键碰撞 | `isUnusableArticleUrl` `server.mjs:2455`、`articleLooksLikeSiteShell:2483`、`normalizeArticleUrlForCache:2503`、`articleCacheKeys:2529` | 最新 run **壳页 0、ticker 错配 0**（eval 指标）。裸域名/同意墙/Google RSS 不再做缓存键，根因已堵。 |
| 9.3 Longbridge 盘前/盘后报价 | `normalizeLongBridgeQuote:16317`、`latestLongBridgeExtendedQuote:16302` | 最新 run **64/64 报价均有真实涨跌**（AAPL +3.14%、NVDA −1.64% 等），无一条 0% 冒充；`changePercentUnavailable` 兜底齐全。 |
| 9.4 市场综述 | `marketEditorialThemeSummary` + LLM 路径 | 实测综述为**真实中文归因**（纳指标普周跌幅、美光涨 15%、PCE、新屋销售 −7.3%），不再重复英文标题。 |
| 1.1 公司新闻短路兜底 | `collectYahooNews:12101`，新增 `COMPANY_NEWS_MIN_LONG_BRIDGE_PER_TICKER:222` | Longbridge 覆盖不足时自动放开 Finnhub/Yahoo，不再整段 `return`。 |
| 1.3 去重键 | `newsDedupeKey:16222`（canonical URL + 标题指纹 + 日期） | 替换了 `url||title`，代理/跳转链接已归一。 |
| 1.4 相关性 companyMap | `collectYahooNews` 注入 `getCompanyTickerMap()` | companyMap 不再恒空。 |
| 1.5 社交 ticker 误判 | `extractTickerMentions:15428`，`tickerMentionHasFinancialContext:15439` | ≤3 位非 cashtag 非自选 ticker 需金融上下文，`ALL/ON/IT` 类误判已收敛。 |
| 3.1 FIFO 做空/买回补 | `calculateTradeJournal:5203`（`shortLots`、buy-to-cover、signed 持仓） | 真正支持有符号持仓；`buildTradeJournalForDb:4963` 委托到它。 |
| 3.2 除零保护 | `sanitizeTrades:4389`（`quantity<=0` 拒绝）+ 撮合处 `Math.max(q, EPSILON):5247/5307` | 双层防护，已解决。 |
| 4.1 store 内存缓存 | `ensureStore:3023`（mtime 失效）、`saveStore:3098` | 命中缓存避免重复解析 90MB（见下方风险）。 |
| 20 反向 DCF / 预期差 | `impliedGrowthFromPrice:17302`、`buildReverseDcfExpectationGap:17331` | 二分求隐含增长，实现正确（见下方单位风险）。 |
| 19 Google News 解码 | `resolveGoogleNewsArticleUrl:10937`（batchexecute） | 函数到位；解码失败降级标题级。 |

> 结论：Codex 把清单里**确证的线上 bug（§9 全部）**和大部分 P0/P1 都真实修了，代码质量整体不错，不是表面功夫。问题集中在「修了机制、但被 LLM 不稳定拖累」和「§12/§13 信息密度类工作尚未真正见效」。

### 1.2 代码层发现的问题 / 风险 ⚠️

1. **[P1] store 缓存返回共享对象引用，不是拷贝** —— `ensureStore()`（`server.mjs:3027`）命中缓存时直接 `return storeCache`，`saveStore()`（`:3106`）又 `storeCache = db`。原先每次 `readFile+JSON.parse` 返回**全新深拷贝**，现在所有 handler 拿到的是**同一个对象**。任何在请求里对 `db`/`run` 的**就地修改（未 save 也会）泄漏到后续所有请求**，例如 `refreshLatestPortfolioRisk(db)`（`:4983`）直接 `run.portfolio=`/`run.portfolioRisk=`。这是引入缓存后最危险的隐性副作用。
   - **建议**：读路径返回 `structuredClone(storeCache)`，或审计所有"读后就地改"的位置改为不可变更新；至少给写路径加单飞锁。

2. **[P1] 反向 DCF 增长口径单位一致性未校验** —— `buildReverseDcfExpectationGap`（`:17357`）`gap = impliedPct − referenceGrowth`，隐含值是百分数（如 32.0）。`referenceGrowth` 取自 `revenueGrowthTTMYoy`/`epsGrowth3Y`/`financialSnapshot.revenueYoy` 等**多个不同 provider 字段**（`:17344-17346`）。AAPL 实测正常（参考≈21.8），但只要其中**有一个源用小数（0.22）而非百分数（22）**，gap 就会算成 `32 − 0.22`，给出错误"估值透支"判断并触发风控压单。
   - **建议**：统一在入口把所有增长字段归一到百分数（检测 `|v|<1` 视为小数 ×100），并加一条断言/单测。

3. **[P2] 公司新闻兜底是"全体放开"而非"按票放开"** —— `lowLongBridgeCoverage = tickers.some(...)`（`:12125`），只要**任一** ticker 覆盖不足，就对**所有** ticker 启用 Finnhub/Yahoo 补抓，放大 API 调用与延迟。建议改为按 ticker 粒度决定是否补抓。

4. **[P2] FIFO 仍未区分期权/资产类型** —— `calculateTradeJournal` 对所有 `assetType` 一视同仁撮合（grep 无 `assetType` 分支）。期权多空与股票混在一个 FIFO 池里，含期权账户的胜率/盈亏仍会失真。§3.1 里"期权单独建账或显式排除标注"这一半未做。

5. **[P2] `isUnusableArticleUrl` 运算符优先级可读性** —— `:2461` `host==="news.google.com" || /google\./.test(host) && /path/.test(path)`，依赖 `&&` 优先于 `||`，语义正确但易被后续误改，建议补括号。

---

## 二、实测运行结果问题（最新 run，重点）

> 报价、壳页、市场综述已确认修好。但**总结质量类问题（§12/§9.2）在实测中仍然存在**，而且这次 run 用的是 LLM（`antigravity-cli`）而非 local，本应是"最好情况"。

### 2.1 [P0] 根因：LLM provider（antigravity-cli）大面积超时 + 熔断

最新 run 的 `errors[]` 直接坐实：

- **LLM Translation：3 批全部超时**（30000ms），随后**熔断**："antigravity-cli 连续失败后暂时熔断，约 300 秒后重试"。
- **Article LLM Summary：超时**（12000ms，MRVL/NVDA/Nasdaq 等条目）。

后果是整份"AI 报告"实际大量退化到本地兜底：

- **18/40 条 `titleZh` 实为未翻译英文**（如 `INTC：Here is What to Know Beyond Why Intel...`）。9.2 的"英文兜底"避免了错误模板，但掩盖了**翻译管线在失败**这一真问题——对中文产品，一半标题是英文是硬伤。
- **33/40 条 `summaryZh` 内嵌原始英文**（`[原文] "..."`，来自 `server.mjs:11135` 本地兜底）：中文模板句 + 一段生英文，可读性差。
- **3/40 条 `titleZh` 仍是分类模板**（`新闻：原文披露了公司相关事件，属于市场解读`）——9.2 未完全消除。

> **这是 V2 第一优先级**：Codex 把调度 LLM 从 `local` 改成 `antigravity-cli`（执行报告项 8），但该 provider 在本机不稳定（30s 翻译超时、12s 摘要超时、熔断 300s）。**不解决 LLM 可靠性，§12 的所有总结改造都无法在产物里体现。**

### 2.2 [P0] §12「有字数没信息」仍未解决（实测信息量 32.3 < 45）

- `node scripts/eval_summaries.mjs`（原始 store，最新 run）：**Avg info score 32.3**，低于默认阈值 45。
- `analysis.summary` 仍是**计数元数据**："本次覆盖 88 个 ticker，抓到新闻 40 条、SEC 24 条…关注度最高 NVDA(26)"——正是 §12.1 点名的"元数据不是结论"。
- 即便综述（marketEditorial）已变好，**逐条新闻摘要的信息密度没达标**。§12 的"无料不展开 + 信息量门槛 + 砍模板"在新闻条目级别尚未真正生效（部分被 2.1 的 LLM 失败拖累，部分是本地兜底仍在拼模板）。

### 2.3 [P1] 跨标的归属仍有语义错配（eval 指标有盲区）

- 实测 `[AAPL] Intel Stock Surges As Apple Deal...` 整条摘要在讲 **Intel 代工**，却挂在 AAPL 卡片下。这是 §1.4 相关性归属问题的残留：文章主体是 INTC，因含 "Apple" 被归到 AAPL。
- **eval 的"ticker 错配"指标只比对 `summaryZh` 首词 ticker 标签 == `news.ticker`**，此处首词正好是 "AAPL" 故判为通过——**指标存在盲区**，无法发现"标签对、内容错"。需要升级为语义级归属校验（公司名/主体识别）。

### 2.4 [P1] store.json 持续膨胀，4.1 只缓解未根治

- 实测 `data/store.json` 已从 86MB 涨到 **90MB**。内存缓存解决了重复解析，但**单文件全量读写 + runs 内联 news/social 的结构性问题没动**（SQLite/分片在执行报告里明确延后）。随历史增长会继续恶化。

### 2.5 [P2] 大量外部源在本机仍是哑的（已知，但影响产物完整度）

最新 run 37 条采集异常：TrendRadar 17、Longbridge Quote 5、IBKR(Gateway/Portal/Index) 3、Finnhub Economic Calendar、Official Macro Calendar、Reddit、XHS 各 1+。AkShare 在快预算内超时。即 §2.1/§2.4 的"缺 key/被拦/超时"现状未变，宏观日历、IBKR 行情、中文社交基本拿不到。

---

## 三、V1 计划中明确未做 / 延后的项（继承到 V2）

来自执行报告"未执行或延后""后续需要配置或修复"：

1. **SQLite 迁移 / runs 分片**（4.1 根治）——store 已 90MB。
2. **自动化测试体系**（4.2）——仍只有 `eval_summaries.mjs` + syntax check，纯函数（FIFO、relevance、dedupe、reverse-DCF）无单测。
3. **美股交易日历/节假日**（3.3）——`maybeRunSchedule` 仍按分钟跑，节假日会发空报告。
4. **Provider order 清理**（2.4）——保留缺 key 项，仅诊断暴露。
5. **新闻/社交 API key**：NEWSAPI / POLYGON / ALPHAVANTAGE / X / YOUTUBE 仍缺。
6. **IBKR Gateway**：本机 4001/4002/7496/7497 未监听（Java 登录窗口问题），行情/期权/账户拉不到。
7. **TrendRadar/NewsNow 自托管**。
8. 交易录入 `normalizeExecutedAt` 缺时间仍默认当前（执行报告自述未改）。

> §10–§17 的功能路线（EPS 修正/FMP、FRED、setup 识别器、双周期计划卡、persona 多镜、故事聚合、agent-reach/last30days/TradingAgents 接入、qlib 离线大脑等）在本轮**基本未启动**——除"反向 DCF（17.1）"和"persona 多镜（17.2 雏形）"已落地外，其余仍是计划。

---

## 四、V2 待办（按优先级）

### 🔴 P0 —— 不做这些，前面所有 AI 改造都无法在产物里兑现

1. **LLM 可靠性工程化（最高优先）**
   - 给翻译/摘要/推理分别设**合理超时 + 重试 + 快速降级**，并把熔断窗口从"整 provider 熔断 300s"细化为**按任务类型**熔断，避免一类超时拖垮整份报告。
   - 翻译走**更稳通道**（短输入批量、本地小模型 Ollama 兜底翻译而非直接吐英文）；`titleZh` 兜底英文时在 UI **显式标注"未翻译"**，并把"翻译失败率"做成可观测指标。
   - 评估调度档是否值得退回 `local`，或给调度单配一个低延迟稳定模型（呼应 §2.3）。
   - **验收**：最新 run 的 `titleZh` 英文占比 < 10%、`[原文]` 内嵌英文摘要 < 10%、LLM Translation/Article Summary 超时 = 0。

2. **§12 总结纪律真正落地到逐条新闻**
   - 本地兜底**禁止内嵌生英文**（`server.mjs:11135`）：无中文化能力时只输出"原文无可核验数字/未翻译"，不拼 `[原文] "..."`。
   - `analysis.summary` 从计数元数据改为**结论优先**（什么在动/为什么/所以呢），把计数降到附属。
   - 展示层按 `summaryInfoScore` 阈值折叠低信息条目（机制已有，需真正接在新闻条目渲染上）。
   - **验收**：`eval_summaries.mjs` avg info ≥ 45（默认阈值）在**真实新采集** run 上达标，而非仅靠净化旧 run。

3. **store 缓存共享引用审计（修潜在数据串台）**
   - 读路径返回拷贝或审计所有"读后就地改 `db`/`run`"的调用（见 §1.2.1）。

### 🟠 P1

4. **语义级新闻归属校验 + eval 指标升级**（修 §2.3）：用公司名/主体识别判断文章主角，纠正"Intel 文章挂 AAPL"；eval 增加"摘要主体 == 卡片 ticker"的语义比对，消除当前盲区。
5. **反向 DCF 增长口径归一 + 单测**（修 §1.2.2）。
6. **预期差数据源接入（FMP/Zacks 一致预期 + EPS 修正）**——解锁 §13-A3/§15 长期资格闸的真实"超/不及预期"，也是 §10.3 最高性价比因子。
7. **FRED 宏观 regime**——修宏观/利率面板，喂 regime 闸（§14.6 / §15.2 第五闸）。
8. **交易日历/节假日**（3.3）+ **IBKR Gateway 恢复**（行情/期权/账户）。
9. **核心纯函数单测**（FIFO 含做空/期权、reverse-DCF、newsDedupeKey、extractTickerMentions、relevance）——为已修复项加回归网，并接入 CI 的 `eval_summaries.mjs --strict`。

### 🟡 P2 / P3

10. **SQLite / runs 分片**（4.1 根治，store 已 90MB）。
11. **FIFO 期权分账或显式排除标注**（§3.1 余项）。
12. **公司新闻按票粒度兜底**（§1.2.3）。
13. **setup 识别器 + 双周期交易计划卡**（§15，纯技术零新数据可先做）。
14. **故事聚合 + 输出契约**（§17.3）替掉 40 张孤立卡片；**persona 多镜**继续扩（§17.2 已有雏形）。
15. **社交补强**：agent-reach（雪球/微博/X/小红书，先修 §1.5 再放量）、last30days 叙事源（§16）。
16. **provider order 清理 + 源状态总览前台化**（2.4 / §14.3）。

---

## 六、深入定位① — LLM 可靠性（V2 P0 第一刀的实现细节）

> 这是 §2.1 / §四-P0-1 的代码级落地方案。

### 6.1 根因：熔断是「按 provider 全局」而非「按任务」

- `recordLlmFailure(provider, error)`（`server.mjs:29844`）只用 **provider 作 key**（`llmFailureState.set(provider, ...)`），冷却 `LLM_FAILURE_COOLDOWN_MS`（实测 ~300s）。
- `callConfiguredLlm`（`server.mjs:30341`）入口先查 `llmCooldown(provider)`（`:30345`），**只要该 provider 在冷却就立刻 throw**，不分任务类型（`:30348`）。
- **后果**：翻译（light 任务）连续超时 3 次 → 把整个 `antigravity-cli` 熔断 300s → 之后所有 article-summary / stock-narrative / market-editorial / investment-advice 调用**全部秒抛**，退化到本地兜底。这就是"翻译失败污染摘要"的机制根因。

### 6.2 修复方案
1. **熔断粒度改为 `(provider, taskTier)`**：`llmFailureState` 的 key 改成 `${provider}:${task.tier}`（已有 `normalizeLlmTask`/`resolveLlmTask`，`:29874`），`recordLlmFailure`/`llmCooldown`/`recordLlmSuccess` 同步带 tier。这样 light(翻译) 熔断不波及 standard(摘要)/reasoning(建议)。
2. **超时按 provider 真实 p95 校准**：实测翻译用 30000ms 超时仍不够（antigravity-cli 偏慢）。要么调大 light 超时，要么**缩小单批 token / 提高并发拆分**，让每批稳定在超时内。
3. **翻译必须有"非英文"兜底**：light 翻译失败时走**本地小模型(Ollama)或词表翻译**，而不是直接吐英文标题（现 `titleZh` 回退英文，`[原文]` 内嵌英文摘要 `server.mjs:11135`）。
4. **半开探测**：熔断到期后先放 1 个探测请求成功再全开，避免冷却一过又被打满立刻再熔断。
5. **可观测**：把"每 provider×tier 的失败率 / 当前是否熔断 / 最近错误"放进数据质量面板（§14.3）。
- **验收**：最新 run `titleZh` 英文占比 < 10%、`[原文]` 内嵌英文 < 10%、单类任务超时不再连锁拖垮其它任务。

---

## 七、深入定位② — store 共享引用审计（V2 P1）

> §1.2.1 的代码级落地。

- `ensureStore()` 命中缓存时 `return storeCache`（`server.mjs:3027`），`saveStore()` 又 `storeCache = db`（`:3106`）——所有 handler 共享同一对象。
- **确证的就地修改点**：`refreshLatestPortfolioRisk(db)`（`:4983`）直接 `run.portfolio = ...`、`run.portfolioRisk = ...`，在 `POST /api/portfolio` 等处被调用（`:32580/:32592`）。即便不 `saveStore`，这些写入也已**留在内存缓存里影响后续所有读请求**。
- `runWithDerivedAnalysisLayers`（`:31469`）是浅拷贝 `{...run}`，顶层赋值安全，但**嵌套对象仍与缓存共享**，下游若就地改 `next.stockNarratives.items[i]` 会回写缓存。
- **修复**：① 读路径返回 `structuredClone(storeCache)`（或对 `runs` 做深拷贝）；或 ② 审计所有"读后就地改 db/run"的位置改成不可变更新 + 显式 `saveStore`。③ 给写路径加单飞锁，防止并发 save 与 mtime 竞态。
- **验收**：补一个并发测试——并发打 `/api/state` 与 `/api/portfolio`，确认报价/持仓不串台。

---

## 八、推荐股票 + 交易复盘能力落地（本轮重点）

> 目标（用户定义）：**Agent 执行的全是硬规则，规则落盘在 skill 文件里**；每天**选 10 个票买入 + 0..N 个票卖出**；之后**跟踪这些操作是否盈利（买的是否涨、卖的是否跌），用结果不断优化 skill**。
> 好消息：这套闭环**已有 ~70% 骨架**，不需要从零搭。下面分"现状 / 关键缺陷 / 目标形态 / 落地步骤 / 数据缺口"。

### 8.1 现状（已有的硬规则闭环，可复用）
- **硬规则 skill 已落盘**：`strategies/all_stock_agent_skill.md`（人读说明 + 机器读 `json` 块）。含 `buyLimit:10`、`buyThreshold/sellThreshold`、`buyRules/sellRules`（带 `weight`）、`riskGates`（`veto_buy`/`cap_buy`），以及自更新参数 `autoUpdate / minSamplesForWeightUpdate / maxDailyWeightStep / promoteAvgReturnPct / demoteAvgReturnPct`。
- **每日 10 买 / N 卖已实现**：`runAllStockAgentForRun`（`server.mjs:19296`）筛候选→`buildAllStockAgentEvaluation` 按规则评分→取前 10 买（`:19330`）+ 已持仓卖出信号（`:19333`）；定时任务每交易日 17:05 跑。
- **决策落库已冻结当时价/分/命中规则**：`allStockAgentDecisionFromEvaluation`（`:19104`）。
- **虚拟持仓**：`allStockAgentActivePositions`（`:18750`）——买入加仓、卖出删除。
- **复盘 + 规则胜率**：`buildAllStockAgentReviews`（`:19166`）算收益、`buildAllStockAgentRuleStats`（`:19196`）按规则统计 winRate/avgReturn。
- **自更新写回 skill**：`maybeUpdateAllStockAgentSkill`（`:19225`）小幅调权 + changelog。

### 8.2 关键缺陷（决定"追踪是否盈利"准不准 —— 必须修）
1. **[P0] 复盘没有固定 horizon、不冻结价格** —— `buildAllStockAgentReviews` 用**最新报价**算单点收益，`ageDays` 仅供参考；skill 里 `reviewAfterDays:[1,3,5,10]` **形同虚设**。`buildAllStockAgentRuleStats` 只过滤 `ageDays>=1`（`:19199`）就把**1 天前与 30 天前的决策放进同一个池平均**——"次日小涨"和"两月大涨"混为一谈，且每天重算、来回波动让 track record 漂移、不可追责。
2. **[P0] outcome 是裸收益符号（`>=0` 即"命中"，`:19188`），无基准、无成本、无死区** —— 上涨市里所有买入规则都会"高胜率"，**学到的是 beta 不是 skill**。用户要的"买的涨/卖的跌"应是**相对基准（SPY/同业）的超额收益**，并设死区（|超额|<~0.5% 记平）+ 计交易成本/滑点。
3. **[P0] 没有虚拟组合权益曲线 / paper P&L** —— 有 decision 和虚拟持仓，但没把"每天买 10 卖 N"跑成一个**纸上组合**（等权建仓、按 sell 平仓、已实现/未实现盈亏、权益曲线、组合级胜率/期望/最大回撤/Sharpe）。**这是直接回答"整体赚没赚"的东西，现在缺。**
4. **[P1] 自学习用 3 样本 + pooled 裸收益调权，易过拟合噪声** —— `minSamplesForWeightUpdate:3` 太低；promote 条件无统计显著性、不分 horizon、不分 regime（§8.3/§13-A5 已警告）。
5. **[P1] 无 look-ahead 防护** —— 要确保 decision 用**决策时点可得价格**、outcome 用各 horizon **真实收盘价**对齐（§10.6 两个隐形杀手：用当日收盘算当日信号、用未来财报）。
6. **[P2] 调权只改数字、无可解释反思** —— 用户要"不断优化 skill"，最好每次 revision 附带证据的"反思"(哪类 setup 命中/失效) 写进 changelog（§17.6 reflection）。
7. **[P2] 候选池非真全市场** —— 需 PIT security master 才能真正"全市场选 10"。
8. **[P2] skill 上线前无离线回测** —— 现在只有线上前向。应能用历史 `stockHistory` 对这套硬规则跑 **walk-forward**，验证有正 IC/正期望再调。

### 8.3 目标形态
- **决策**：每日硬规则跑出 **买入 Top10 + 卖出 0..N**（已有，保留），全部走 skill JSON 的规则与门控，LLM 只补解释不改分（已符合）。
- **追踪（要新增）**：每条 decision 落库后，在 **T+1/3/5/10 交易日**各冻结一个 outcome 快照：
  ```jsonc
  { "decisionId":"...", "horizonDays":5, "asOf":"2026-07-02",
    "entryPrice":182.4, "exitPrice":190.1, "returnPct":4.2,
    "benchmarkReturnPct":1.1, "excessPct":3.1, "outcome":"win" }  // win/flat/loss 用 excess+死区判定
  ```
  规则统计、胜率、期望值**按 horizon 分别算**，绝不跨 horizon 合并。
- **paper book（要新增）**：等权虚拟组合，buy 开仓 / sell 信号平仓 / 到 horizon 或止损平仓，输出权益曲线 + CAGR/Sharpe/MaxDD/命中率/期望/盈亏比（可复用 `buildTradeEquityStats`/`empyrical`）。
- **自优化（升级现有）**：把调权依据从"pooled 裸收益"换成"**按 horizon 的相对基准胜率 + 期望 + IC**"，样本门槛 ≥20 且跨 ≥X 个交易日、近 N 段稳定才调；保留 maxDailyWeightStep / 冷却；每次 revision 附 LLM 反思写 changelog。
- **不变**：自更新只能小幅调权、不删规则、不新增高风险规则（skill 设计原则已写）。

### 8.4 落地步骤（次序）
1. **outcome 快照引擎**：新增 `allStockAgentOutcomeSnapshots`——每次 run 时给"已到 T+1/3/5/10"的历史 decision 用**当日收盘**补一条 horizon 快照并落库（一次写、不再回算）。基准取 SPY 同期收益算 excess。
2. **按 horizon 的规则统计**：`buildAllStockAgentRuleStats` 改为 `{ruleId}×{horizon}` 维度，输出 winRate/expectancy/IC/样本数。
3. **paper 组合**：基于虚拟持仓 + 快照算权益曲线与组合级指标，前端出 track-record 仪表盘（命中率/期望/回撤/校准）。
4. **升级自学习门槛**：用 §8.3 的统计量 + 样本/稳定性门槛替换现 3 样本裸收益逻辑。
5. **离线 walk-forward**：用历史 `stockHistory` 对当前 skill 跑前推验证（先验证再上线）。
6. **反思式 changelog**：调权时让 LLM 基于命中/失效样本生成简短归因，写入 skill `## Changelog`。
- **验收**：track-record 仪表盘可显示"买入信号 T+5 相对 SPY 超额胜率/期望"，且历史决策的 outcome 不随每日行情漂移（已冻结）。

### 8.5 数据缺口（"完整推荐系统"前提，接 §8.1/§15.1）
- **PIT 基本面 + 分析师一致预期/EPS 修正**（FMP/Zacks）——长期资格闸 + 预期差因子。
- **复权历史含退市票**——消除幸存者偏差，做可信回测。
- **GICS 行业分类**——因子行业内中性化（否则押的是行业 beta）。
- **FRED 宏观 regime**——regime 闸（风险关时不开多）。
- **做空拥挤（FINRA）/ 异常期权流**——拥挤与"聪明钱"维度。
- **PIT security master**——真正全市场候选。

### 8.6 用户真实交易复盘的增强（区别于 Agent 纸上交易）
> `calculateTradeJournal`（`server.mjs:5203`）已做 FIFO（含做空）+ 按策略/情绪/标签/持仓期绩效。补：
1. **标准化风险指标**：Sharpe/Sortino/Calmar/期望/盈亏比/CVaR（empyrical/quantstats 口径），现多为手算。
2. **基准相对**：每笔/整体 vs SPY 同期，区分 alpha 与 beta。
3. **期权分账**：FIFO 仍混期权（§1.2.4），需单独建账或标注。
4. **真实交易 ↔ Agent 信号对账**：用户某笔买卖与当日 Agent 信号是否一致，事后谁对——既复盘用户、也复盘 skill，形成双向反馈。

### 8.7 优先级
| 优先级 | 事项 | 依赖 |
|---|---|---|
| 🔴 P0 | 8.4-1 outcome 快照 + 8.4-2 按 horizon 规则统计 | 已有 decision/quotes |
| 🔴 P0 | 8.4-3 paper 组合权益曲线 + track-record 仪表盘 | 上一项 |
| 🟠 P1 | 8.4-4 升级自学习门槛（IC/期望/基准/稳定性） | 快照统计 |
| 🟠 P1 | 8.5 预期差数据（FMP/Zacks）+ FRED regime | 外部源 |
| 🟡 P2 | 8.4-5 离线 walk-forward + 8.4-6 反思 changelog + 8.6 真实交易增强 | 历史数据/LLM |
| 🟡 P2 | PIT security master / GICS / 退市票 / 做空拥挤 | 外部源 |

---

## 十、验证：Codex V2 两批实现实测结果（2026-06-27）

> 对 commits `249c123`（V2 可靠性）、`5b95e42`（§8 追责闭环）做了代码核对 + 起服务跑了一次完整 fresh run（约 24 分钟，主因外部死源拖慢）。

### 10.1 代码层：声称的修复都真实落地且正确 ✅
- **熔断按 `provider:tier`**：`llmFailureKey(provider, task)`（`server.mjs:30316`）、`recordLlmFailure(provider, task, error)`（`:30332`），所有调用点都传了 `task`。fresh run 的错误信息已变成"antigravity-cli 的 **light 任务**连续失败后暂时熔断"——证明 light(翻译) 熔断不再波及 standard(摘要)。
- **store 深拷贝隔离**：`cloneStoreValue`（`:3033`，`structuredClone`）在读/写两端都用上，共享引用串台风险消除。实测 `/api/state` 仍 ~0.6–0.8s（未比原来 0.93s 更慢），**纠正了正确性且没牺牲性能**。
- **不再吐 `[原文]` 英文**：fresh run `raw[原文]=0`；无法中文化的英文事实降级为"未提取到可核验关键事实"。
- **反向 DCF 单位归一、公司新闻按票补抓、`isUnusableArticleUrl` 加括号**：均已改。
- **§8 追责闭环全套到位**：`buildAllStockAgentOutcomeSnapshots`（`:19334`，T+1/3/5/10 业务日冻结、benchmark 超额、死区判定、无 look-ahead）、按 horizon 的 `buildAllStockAgentRuleStats`（`:19450`）、`buildAllStockAgentPaperBook`（`:19536`，等额开平仓 + 权益曲线 + Sharpe/MaxDD）、自学习 `minSamples` 提到 **20** 且改用 `avgExcessPct` + winRate 0.55/0.45 带（`:19690`）。

### 10.2 运行结果：架构对了，但 provider 仍是硬瓶颈 ⚠️
- **翻译仍 100% 失败**：fresh run `LLM Translation` 3 批**全部超时（30000ms）**后熔断；**21/40 `titleZh` 仍是英文**（与修复前 18 基本持平，未改善）。熔断粒度修复**成功隔离了爆炸半径**（摘要不再被连带），但**根因是 antigravity-cli/gemini-3.1-flash-lite 本身在 30s 内跑不完翻译**，每次必超时。
- **摘要部分超时**：`Article LLM Summary` 多条 12000ms 超时；信息量分 fresh run **40.3（raw）/ 62.3（--api 出口）**——出口分高是因为**剥离低信息文本**，不是生成了更富的中文。
- **§8 追责数据目前为空**：15 条决策全是买入（06-26），**0 条 outcome、0 笔平仓、0 次调权**——因 T+1 业务日落在 06-29（周一），现在还没到，属正常（系统没伪造）。paperBook 已在跑：15 个未平仓、浮亏约 -3172（等额名义）。
- store 涨到 **97MB**。

### 10.3 结论与下一刀
1. **Codex 的 V2 实现质量高、与计划一致**；两批都不是表面功夫。
2. **但"翻译/摘要不达标"已收敛为单一根因：antigravity-cli 延迟超预算**。光修熔断粒度不够——必须二选一/组合：① 给翻译换**更快通道**（本地 Ollama / 更快模型 / 更小批量 + 高并发）；② 翻译失败时走**本地词表/小模型中文化**而非吐英文。**这是 V2 现在投入产出比最高的一步**（§6.2-2/6.2-3）。
3. **§8 追责闭环要等时间积累**：T+N 到期才有 outcome、每规则×horizon 攒满 20 样本才会调权——是"慢热"机制，方向对，但需保证**每天定时真跑 + 每轮强制采集 SPY/QQQ 基准**（否则超额退回方向收益）。

### 10.4 已实施：标题翻译改走 MT API（Azure，2026-06-28）
- 在 `localizeItemsForDisplay`（`server.mjs`）前置一条 **MT API 优先** 路径：`localizeTitlesWithMtApi` → `azureTranslateTexts`（Azure Translator `/translate?api-version=3.0&from=en&to=zh-Hans`），批量 50 条/请求、`AZURE_TRANSLATOR_TIMEOUT_MS=15000`。
- 级联：**Azure → LLM → 本地兜底**。未配置 `AZURE_TRANSLATOR_KEY` 时该路径直接跳过，行为与之前完全一致（零回归，已起服务实测 `/api/state` 正常）。
- 翻译不再依赖较慢且常熔断的 antigravity-cli light 任务；Azure 子秒级、确定性，预期 `titleZh` 英文占比降到接近 0。
- 新增 env：`AZURE_TRANSLATOR_KEY / REGION / ENDPOINT / TIMEOUT_MS / BATCH_SIZE`，已进配置中心（group=LLM）与 `.env.example`。请求格式已对 Azure 真实端点用 dummy key 验证（返回 401，证明端点/头/体均正确，仅鉴权被拒）。
- **范围说明**：MT 只解决 `titleZh`（最显眼的 §9.2 问题）；真正的中文**分析文本**（叙事/大盘综述/投资建议）仍走 LLM。
- **待用户操作**：在配置中心或 `.env` 填 `AZURE_TRANSLATOR_KEY` + `AZURE_TRANSLATOR_REGION`，跑一轮后我再做端到端验证（目标：fresh run `english-titleZh ≈ 0`）。

### 10.5 已实施：文章中文摘要改走真实 Gemini API（2026-06-28）
- **根因**：文章 LLM 摘要原走 `antigravity-cli`，单篇 ~90s 常超时；`ARTICLE_LLM_CONCURRENCY=1` 串行 + 180s 总预算 → 4 篇里只有 1–2 篇能完成，其余被预算耗尽降到 12–15s 地板并失败，连续 2 次失败再触发文章级熔断 180s。**结构上跑不动**。
- **修复（`.env` 配置，零代码风险）**：用户已有真实 `GEMINI_API_KEY`，把 `ARTICLE_LLM_PROVIDER=gemini`（`articleLlmSummaryProvider` 优先读它）。同时 `ARTICLE_LLM_SUMMARY_LIMIT 4→10`、`ARTICLE_LLM_CONCURRENCY 1→3`、`ARTICLE_LLM_SUMMARY_TIMEOUT_MS 90000→30000`。
- **验证**：直连 `generativelanguage.googleapis.com/.../gemini-3.1-flash-lite:generateContent` 实测 **HTTP 200、~2s/次**（对比 antigravity-cli 30–90s 超时）。10 篇 × ~2s、并发 3 → 约 7s 完成，远在 180s 预算内。
- **效果预期**：覆盖从 4 篇升到 10 篇且基本不再超时/熔断 → §12 逐条新闻的中文摘要从"本地模板"变为"真实 LLM 摘要"，信息量分应明显上升。
- **范围说明**：本次只改文章摘要的 provider；其它 reasoning 档（叙事/大盘综述/投资建议）仍是 `LLM_PROVIDER=antigravity-cli`。若也想加速，可考虑把 `LLM_PROVIDER` 整体切到 `gemini`（用户有 key），但属更大改动，单列下轮评估。
- **待端到端验证**：下一次完整 run 后核对 `Article LLM Summary` 超时=0、带 LLM 摘要的新闻条数≈10、平均信息量分。

### 10.6 已实施 + 端到端验证：reasoning 走 pro，全链路实测（2026-06-28）
- **reasoning 改 pro**：`normalizeLlmTask`（`server.mjs`）把 `stock-narrative`/`market-editorial-brief`/`investment-advice` 从 standard/默认档**重映射到 `reasoning` 档**。配合 `LLM_PROVIDER=antigravity-cli`，这三个任务现在走 `ANTIGRAVITY_CLI_MODEL_REASONING=gemini-3.1-pro-preview`。
  - **为何不用 Gemini API 的 pro**：用户的 Gemini API key 是**免费档，pro 配额 = 0**（实测 429 `generate_content_free_tier_requests, limit: 0`）。antigravity-cli 用自己的账号走 pro，免计费。实测 `agy --model gemini-3.1-pro-preview` ~11s、中文质量好。
  - 三个任务都是**低频**（综述 1/run、建议 1/点击、叙事 1 次批量调用覆盖所有 ticker），pro 延迟可接受。
- **端到端实测（fresh run `1782632413677` + 重启后）**：
  - 标题（Azure）：**english-titleZh = 0**（修复前 18–21），样例"美光业绩炸裂超预期，存储超级周期实锤！"
  - 信息量分：**70.8**（修复前 raw 32.3）；壳页 0、模板标题 0、raw `[原文]` 0、`Article LLM Summary` 超时 **0**。
  - 文章摘要 provider 实测 `gemini:gemini-3.1-flash-lite:standard`；投资建议 provider 实测 **`antigravity-cli:gemini-3.1-pro-preview:reasoning`** ✅。
- **本轮观察到的两点（非本次改动的回归）**：
  1. 本轮新闻**几乎全是中文源**（每日经济新闻/财联社/哈富证券…），`article.status={ok:1, summary:39}`，没有英文正文可抽 → 只有 1 篇走 Gemini 摘要。英文新闻多的 run 才会充分用到 Gemini 摘要路径。
  2. **市场综述本轮降级为"正文不足"**：editorial 文章抽取失败（`Market Editorial Article` 报错，网络/源问题），与模型无关；有正文的 run 才会用上 pro 综述。→ 仍待在"正文能抽到"的 run 上验证 pro 综述质量。

### 10.7 市场综述"正文不足"根因排查（2026-06-28）
> 用户反馈这是老大难。深挖后是两层：

**第一层（机械性，已修）**：`collectMarketEditorialBrief`（`server.mjs:13892`）的文章抽取是**串行（concurrency 1）**，而 `extractArticleForNews` 内部用 `withExternalRetries`，`EXTERNAL_RETRY_ATTEMPTS=4` → 遇到一个会阻塞的 URL（本轮是 Yahoo via Google News）会**重试 4 次 × ~20s ≈ 75s**，把整轮 90s 预算吃光，后面的候选一篇都抽不到。实测错误就是 `Market Editorial Article ... 超过剩余预算 74992ms`。
- **修复**：① 给 `extractArticleForNews` 增加 `retryAttempts` 选项；② editorial 抽取改 **concurrency 3 + `retryAttempts:1`（不重试）+ 每篇 20s 外层硬上限**。这样一个坏 URL 最多耗 20s 且不阻塞其它候选，会"快速失败、把所有候选都试一遍"。

**第二层（根本性，未完全可解）**：editorial 的**市场综述类条目几乎都来自 Google News `site:` 搜索 RSS** → 解码后落到 **Schwab/MarketWatch/Yahoo/IBD 等付费墙/反爬页**（实测 MarketWatch 直接返回 CAPTCHA、Schwab 15s 超时、Yahoo 是壳页）→ 正文根本抽不到。而**自带 description 摘要的 feed**（Dow Jones top-stories、CNBC）内容大多不是"大盘综述"，被 `marketEditorialRelevant` 关键词过滤掉（实测 CNBC markets 30 条里只有 1–2 条同时满足"市场相关 + description≥140"）。即：**有描述的不相关、相关的抓不到正文**。
- 机械修复能让综述"更常被填上"（只要有任一可抽到的相关条目），但全源被封的日子仍会"正文不足"——这是诚实结果，不该编。
- ~~建议的根本解（option B）~~ → 改用更好的方案并已实施，见 §10.8。

### 10.8 已实施 + 端到端验证：用 Longbridge 市场新闻作综述首选源（2026-06-28）
> 用户要求"找新数据源,先看 IBKR/Longbridge 有没有,没有再搜 GitHub"。排查发现 **Longbridge CLI 自带正好的模块**：
- **`longbridge news search "<关键词>"` + `news detail`**：聚合 TipRanks/Benzinga/MSN/Nasdaq/Unusual Whales 等的**盘面综述**新闻，**API 取全文（实测单篇 8555 字）、中文、无反爬/CAPTCHA/付费墙**——正好绕开 §10.7 第二层的死结（Schwab/MarketWatch/Yahoo 全被封）。
- 另外可用：`top-movers`（异动+关联新闻=movers-with-reasons）、`market-temp`（市场情绪 0–100）、`anomaly`（异动）。
- **实施**：新增 `collectLongBridgeMarketEditorial`（`news search` 多个市场关键词 → 相关性过滤 → `news detail` 取全文），并入 `collectMarketEditorialBrief` 的候选池；`marketEditorialScore` 给 Longbridge + 有正文项最高权重，使其入选并喂给（现已 pro 的）LLM 综述。
- **端到端实测（fresh run `1782637101141`）**：综述变为**真实中文盘面叙事 + 硬数字**（"标普/纳指涨 0.13%/0.03% 创新高…全周累跌超 4%…OpenAI 延迟 IPO 传闻重击半导体…美光暴涨 15%…"），**4 条来源全部 `readDepth=body`**（Nasdaq/Yahoo/Benzinga 经 Longbridge 取到全文），不再"正文不足"。Schwab direct 仍报错但已无关紧要。
- **附带（用户指令）**：大盘综述非实时，把 editorial 单篇抽取上限放宽（`MARKET_EDITORIAL_ARTICLE_TIMEOUT_MS=1000000`），并同步调大 `MARKET_EDITORIAL_BRIEF_RUN_BUDGET_MS` 与 `COLLECTOR_TIMEOUTS` 的 `Market Editorial Brief=1080000`，让慢的兜底源不被过早掐断（Longbridge 首选源通常很快返回，所以实际不会真等满）。
- **IBKR 对比**：IBKR Client Portal/Gateway 也有 news（Briefing.com 大盘评论、Dow Jones），但需在 bridge 里加端点；Longbridge 方案已是中文+全文+零改造，故首选 Longbridge，IBKR 留作未来备援。GitHub 未搜——Longbridge 自带已够。

---

## 九、一句话总结

Codex 把**确证的线上 bug（§9 全部）和大部分 P0/P1 机制**都真实修好了，代码质量可靠；但**两类问题待办**：①代码层有 3 处需修的风险（store 共享引用、反向 DCF 单位、公司新闻全体放开）；②**运行结果层最大瓶颈是 LLM provider 不稳定**——antigravity-cli 翻译/摘要大面积超时熔断，导致一半标题未翻译、摘要内嵌英文、§12 信息密度仍不达标。**V2 的第一刀应是 LLM 可靠性 + §12 逐条总结落地**，否则其余 AI 改造都无法在用户看到的产物里兑现；其后再接预期差数据（FMP/Zacks）与 FRED 宏观，逐步推进 §13/§15 的"真建议 + 真懂市场"。

### 10.9 已实施 + 端到端验证：带原因的异动榜（§13-B2，2026-06-28）
> 用户要求基于 Longbridge `top-movers` 做"带原因的异动榜"。
- **数据源**：`collectLongBridgeTopMovers`（`server.mjs`）调 `longbridge top-movers`（异动股 + 技术异动原因 `alert_reason` + 板块标签 + 涨跌幅），只取美股、上限 18。
- **"原因"join**：`buildMoversWithReasons` 把每只异动股 join 当轮已采集新闻的催化（优先，最丰富的中文）；运行新闻没覆盖到的票，collector 补一条 **Longbridge 最新头条**（`news <ticker>`，英文头条用 **Azure 翻成中文**）。加了**错配守卫**：头条里出现别家 `(交易所:TICKER)`/`$TICKER` 且与本票不符则丢弃（修早期"AMZN 显示 Nokia 头条"的问题）。
- **前端**：首页新增"异动榜（带原因）"面板（`moversWithReasonsBox` + `renderMoversWithReasons` + CSS），按 |涨跌幅| 排序，展示 ticker/名称/涨跌/板块/异动类型/原因；无原因标"需进一步核查"（§13-B5 信号）。
- **端到端实测（fresh run `1782639343822`）**：17 只异动、**16/17 有原因**（修复前仅 run-news 覆盖 3/17）。样例：AAPL +3.1%「营收指引 1072–1100 亿超预期」、AMZN +2.5%「AWS 上调 EC2 ML 容量价格」、SNDK −10.5%「投行上调目标价至 1700–3250」、WDC −13.2%「AI 内存紧张是否让西部数据变战略瓶颈」。0 报错；错配守卫生效（AMZN 不再串 Nokia）。
- **已知限制**：`news <ticker>` 的"最新一条"偶尔是 13F/泛标题而非当日催化（如个别票），但远好于空白，且主异动用的是更准的 run-news。
