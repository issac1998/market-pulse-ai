# Market Pulse AI 改进与修复清单

> 审阅时间：2026-06-27
> 审阅范围：`server.mjs`(32,349 行)、`public/app.js`(7,324 行)、`scripts/*.py`、`.env` 实际配置、运行中的 `localhost:5173` 实测。
> 说明：本文件聚焦"功能缺陷 / 数据正确性 / 数据源缺失"，并附代码定位与修复建议，便于逐条排期。

## 严重程度图例

- **P0** 影响核心数据正确性或可靠性，应尽快修。
- **P1** 明显削弱产品价值或埋有错误，下一迭代修。
- **P2** 维护性 / 体验 / 长期债务。

---

## 一、新闻获取准确性（重点）

### 1.1 [P0] 公司个股新闻在当前配置下被整段短路，只剩 Longbridge
- **证据**：`collectYahooNews()` 开头 `server.mjs:11619`
  ```js
  if (!COMPANY_NEWS_EXTRA_SOURCES_ENABLED) {
    return { news: uniqBy(all, (item) => item.url || item.title).slice(0, 32), errors };
  }
  ```
  `COMPANY_NEWS_EXTRA_SOURCES_ENABLED` 默认 `false`（`server.mjs:217`），且 `.env` 实测为 `false`。
- **影响**：函数名叫 `collectYahooNews`，但实际只返回 Longbridge 新闻；后面几百行的 **Finnhub 公司新闻 + Yahoo 新闻搜索 fallback 全是死代码**。一旦 Longbridge 对某 ticker 无结果或失败，该股当天**个股新闻直接为空**，但页面不会提示"新闻源被关闭"，看起来像"没有新闻"。
- **修复**：
  - 至少把 Finnhub 公司新闻作为默认开启的兜底（已有 key），不要整段 `return`。
  - 或者：当 Longbridge 命中数低于阈值时自动启用 extra sources，而不是全局开关一刀切。
  - 在数据质量面板里明确标注"公司新闻仅来自 Longbridge / 已关闭 Finnhub/Yahoo"。

### 1.2 [P0] 缺失发布时间的新闻被打上"现在"时间戳 → 旧闻冒充新闻 + 排序失真
- **证据**：约 25 处 `publishedAt: ... || nowIso()`，例如
  `server.mjs:13112`（market editorial 直读条目，**无条件 now**）、
  `server.mjs:19380`（OpenBB 新闻，**无条件 now**）、
  `server.mjs:14467 / 14519`（IBKR Portal 粘贴，**无条件 now**）、
  `server.mjs:11661 / 13368`（Finnhub 无 `datetime` 时 now）。
  合并后的新闻流排序键 `server.mjs:29576-29582` 依次按 `articleDisplayPriority → materiality → publishedAt desc`。
- **影响**：任何拿不到真实时间的新闻都会被当成"刚刚发布"，从而**排到最前面**，盘前/盘后报告和邮件会把陈旧内容当头条。这是典型的"新闻不准 / 时间不可信"。
- **修复**：
  - 区分"真实发布时间"与"采集时间"：新增字段 `collectedAt`，`publishedAt` 缺失时置 `null` 而非 now。
  - 排序时 `publishedAt` 为空的条目降权，不参与"最新"判定；展示层标注"发布时间未知"。
  - 粘贴类来源（IBKR Portal）标注为"导入时间"，不要冒充发布时间。

### 1.3 [P1] 新闻去重键过弱，既会误合并又会漏合并
- **证据**：`server.mjs:11621`、`29574` 等多处 `uniqBy(items, (item) => item.url || item.title)`。
- **影响**：
  - 不同文章若标题被截断/雷同（如多个"Earnings Preview"）会被**误判为同一条**而丢失。
  - 同一文章经 Finnhub 代理链接、Google News 跳转链接、原文 URL 三种形态出现时，URL 不同 → **去重失败，重复展示**。
- **修复**：规范化去重键：先解析跳转/代理 URL 到原文域名+路径，再叠加"标题归一化指纹 + 发布日期"做近似去重，而非 `url||title`。

### 1.4 [P1] 公司名/别名匹配依赖硬编码小表，且相关性分类时 companyMap 没传进去
- **证据**：
  - 别名表 `ARTICLE_TICKER_ALIASES`（`server.mjs:10303`）只硬编码了 ~22 个知名票（AAPL/MSFT/...）。
  - `withNewsRelevanceForItems()`（`server.mjs:13889`）只构造了 `fundamentalMap`，**没有构造/传入 `companyMap`**；而 `classifyNewsRelevance` 用到了 `context.companyMap`（`server.mjs:13817`）。主流程调用 `withNewsRelevanceForItems(items, { fundamentals })`（`server.mjs:29562/29693`）→ `companyMap` 恒为空。
- **影响**：自选/研究池里只要不在那 22 个别名内，公司名匹配只能靠 `item.companyName` 或基本面 `name`，覆盖不全 → 相关性分类偏保守，正确的公司新闻可能被降级成"行业/宏观"。
- **修复**：相关性上下文统一注入 `getCompanyTickerMap()` 的结果；别名表改为可配置/可从基本面 `name` 自动派生，去掉硬编码长期维护负担。

### 1.5 [P1] 社交文本抽取 ticker 用全量 SEC 代码集，普通英文词易误判为个股
- **证据**：`extractTickerMentions()`（`server.mjs:14786`）对每个 1–5 位大写词，只要落在 `validTickerSet`（= 约 1 万个 SEC ticker + 自选）就算命中，仅靠 `COMMON_TICKER_WORDS`（**只有 69 个词**，`server.mjs:14273`）做黑名单。
- **影响**：`ALL / ON / IT / ARE / OPEN / REAL / TECH / NOW / CASH ...` 这类既是常用词又是真实 ticker 的会被误抓，污染"社交热议"研究池，进而触发对错误标的的补抓新闻/行情。
- **修复**：非 `$cashtag` 的提及要求更强上下文（前后出现 stock/shares/$ 等），或对 2–3 位高歧义 ticker 仅认 cashtag；把黑名单换成基于词频的歧义词模型。

---

## 二、数据源缺失 / 名存实亡

### 2.1 [P1] 多个"已接入"新闻/社交源在当前 `.env` 里根本没有 key
- **实测 `.env` 缺失**：`NEWSAPI_KEY`、`POLYGON_API_KEY`、`ALPHAVANTAGE_API_KEY`、`X_BEARER_TOKEN`、`YOUTUBE_API_KEY` 全部 **ABSENT**；`XHS_COOKIE` 空。
- **影响**：
  - 新闻聚合实际只剩 **Finnhub + AkShare 中文 + RSS + Longbridge**（且 Finnhub 公司新闻还被 1.1 关掉）。Reuters/CNBC/MarketWatch（靠 NewsAPI/Polygon）等英文财经主源**实际未接入**。
  - X/Twitter 社交、YouTube 官方搜索、小红书**全部静默关闭**，README 宣传的多社交源大多不生效。
- **修复**：在数据质量/诊断面板显式列出"已配置 vs 缺 key 而跳过"的源清单（现在用户无法一眼看出哪些源是哑的）；README/配置攻略标注"最低可用源集合"。

### 2.2 [P1] 主报告默认关闭 期权链 / OpenBB / SEC EDGAR，首页和邮件信息不全
- **证据**：`.env` 实测 `REPORT_OPTIONS_CHAIN_ENABLED=false`、`REPORT_OPENBB_ENABLED=false`、`REPORT_SEC_EDGAR_ENABLED=false`；对应 `runCollection` 的 skip 分支 `server.mjs:29457/29473/29482`。实测 `/api/state` 的 `latest.options.length === 0`。
- **影响**：SEC 文件是核心卖点之一，但主报告**只用 Longbridge 公告替代**，原始 SEC filing 不进每日报告；期权链、OpenBB 同样要到单股页手动补抓。首页/邮件的"信息台"完整度被削弱。
- **修复**：把这三项做成"轻量预抓"（限 ticker 数 + 严格超时）默认开，而不是全关；或在首页明确标注"期权/SEC 需进入个股页补抓"。

### 2.3 [P1] 定时邮件用本地规则而非 AI 摘要
- **证据**：`.env` `SCHEDULE_LLM_PROVIDER=local`；调度入口 `runCollection(due.job.id, "schedule", { llmProvider: SCHEDULE_LLM_PROVIDER })`（`server.mjs:29838`）。
- **影响**：用户实际收到的盘前/盘后邮件是**规则拼接**摘要，不是宣传的"AI 中文投研结论"。这是稳定性与质量的取舍，但与首页手动采集（走 LLM）体验不一致，且未告知用户。
- **修复**：邮件里标注"本场为本地规则摘要"或提供"AI 摘要重发"按钮；评估给调度单独配一个更稳的 LLM 通道。

### 2.4 [P2] 报价/行情兜底链中有失效环节
- **证据**：`QUOTE_PROVIDER_ORDER=longbridge,ibkr,finnhub,alphavantage` 但 `ALPHAVANTAGE_API_KEY` 缺失；`TECHNICAL_PROVIDER_ORDER` 含 `akshare`/`yahoo`，但 `TECHNICAL_YAHOO_ENABLED=false`、东财 K线已知 `RemoteDisconnected`（见 `COMPLETION_REPORT.md`）。
- **影响**：当 Longbridge + IBKR 同时拿不到价时，兜底实际只剩 Finnhub；技术面兜底链里有两环是哑的。
- **修复**：清理 provider order 中实际不可用的环节，或补 key；诊断面板对"链路里被跳过的 provider"给出原因。

### 2.5 [P2] 已知且暂时无法绕过的外部限制（来自 `COMPLETION_REPORT.md`，需持续跟踪）
- Finnhub Economic Calendar 当前 key 403；Reddit 匿名 429/403；TrendRadar/NewsNow 公共实例被 Cloudflare 拦；东财 K线断连；付费墙/反爬新闻原文。
- **修复方向**：补充授权源（NewsAPI/Polygon/Trading Economics/FMP/EODHD）、自托管 NewsNow、Reddit 走官方 OAuth。

---

## 三、交易复盘 / 计算正确性

### 3.1 [P1] FIFO 只支持多头，做空 / 买回补 / 期权完全不建模
- **证据**：`buildTradeJournalForDb()` 撮合逻辑 `server.mjs:5074-5135`：`buy` 压入 lot，`sell` 只与已有 buy lot 撮合；卖出找不到 lot 的部分记为 `unmatchedQuantity` 后**丢弃**，不会开空头仓位。
- **影响**：先卖后买（做空）、买入开仓再卖空、期权多空，全部算不对；胜率/已实现盈亏/期望值等绩效指标在含空单或期权的账户里**系统性失真**。README 宣传的 FIFO 盈亏/胜率对这类账户不可信。
- **修复**：支持有符号持仓（多/空）与买回补撮合；对 `assetType=option` 单独建账或显式排除并标注；导出里区分已撮合/未撮合数量。

### 3.2 [P2] 成本/净价计算存在除零风险
- **证据**：`costPerShare: trade.price + (trade.fees || 0) / trade.quantity`（`server.mjs:5085`）、`sellNetPerShare`（`server.mjs:5101`）。`quantity=0` 时为 `Infinity/NaN`。
- **修复**：导入/录入层强校验 `quantity > 0`，撮合前再兜底。

### 3.3 [P2] 无交易所节假日 / 半日市判断，定时任务照常触发
- **证据**：`README.md:541` 明确"这一版没有交易所节假日判断"；`maybeRunSchedule()`（`server.mjs:29830`）只按纽约时间分钟判断。
- **影响**：节假日/周末仍会跑盘前盘后并发空报告邮件。
- **修复**：接入美股交易日历（含半日市），非交易日跳过调度。

---

## 四、架构 / 性能 / 可靠性

### 4.1 [P0] `store.json` 全量读写、无内存缓存
- **证据**：单文件 **86MB**（其中 `runs` 20 条占 ~55MB，每条内联 40 新闻 + 320 社交 + 28 叙事）。`ensureStore()`（`server.mjs:2874`）在**每个 API handler** 里 `readFile + JSON.parse` 整个文件；`saveStore()` 整体序列化重写。实测 `/api/state` 单次 **~0.93s**、返回 7.8MB。
- **影响**：随历史增长持续恶化；并发请求会叠加 86MB 解析；`data/` 里还堆了 290MB/100MB 历史备份。
- **修复**：迁移到 SQLite（或把 `runs` 内容分片到独立文件，store 只存索引）+ 进程内缓存 + 写时增量；run 体内的 news/social 改为引用而非全量内联。

### 4.2 [P2] 单文件巨石 + 零自动化测试
- **证据**：`server.mjs` 32k 行 / ~1011 个函数集中一个模块；全仓无任何 test/spec。
- **影响**：FIFO、规则评估、相关性分类、store 归一化这些纯函数无回归保护，改一处难评估影响面。
- **修复**：先给纯函数（FIFO、`classifyNewsRelevance`、`extractTickerMentions`、store normalize）补单测；按采集器/LLM/存储/HTTP 路由分模块。

### 4.3 [P1] "全市场 Skill Agent" 名不副实
- **证据**：候选池为"可获取候选池"（`ALL_STOCK_AGENT.md` 自述缺完整 security master）；实测买入候选第一名是 **SPY**（ETF）。
- **影响**：把指数/ETF 代理混入"个股买入前十"，且无法真正覆盖全市场。
- **修复**：候选池过滤 ETF/指数代理（已有 `SEC_FILING_SKIP_TICKERS` 名单可复用）；接入 security master 做真正全量；UI 改称"候选池扫描"以免误导。

---

## 五、其他改进点

- **[P2] 残留物**：根目录 `未命名文件夹/` 空目录；`data/` 下两份 290MB/100MB 备份建议清理或挪出仓库。
- **[P2] 文档与实现漂移**：README 写 `LLM_PROVIDER=gemini-cli / 翻译 none`，实际 `.env` 为 `antigravity-cli`，`LLM_TRANSLATION_PROVIDER=antigravity-cli`。配置攻略需对齐。
- **[P2] 配置面过重**：`.env` 300+ 变量、README 500+ 行，迁移/排错成本高；建议拆"最小可用"与"高级"两档，并在诊断页可视化生效情况。
- **[P2] 错误可观测性**：很多源失败只进 `errors[]`，前端未必显眼。建议在数据质量面板按"源 → 状态(SET/缺key/被限流/超时) → 最近成功时间"统一呈现。

---

## 建议修复优先级

| 优先级 | 条目 | 价值 |
|---|---|---|
| 🔴 P0 | 1.1 公司新闻短路 / 1.2 时间戳冒充 / 4.1 store 性能 | 直接影响"新闻准不准"和可用性 |
| 🟠 P1 | 1.3 去重 / 1.4 相关性 companyMap / 2.1 缺 key 源 / 2.2 主报告补全 / 2.3 调度走 LLM / 3.1 FIFO 做空 / 4.3 Agent 过滤 ETF | 数据完整性与计算正确性 |
| 🟡 P2 | 1.5 ticker 误判 / 2.4 兜底链清理 / 3.2 除零 / 3.3 节假日 / 4.2 测试与拆分 / 五的全部 | 维护性与长期质量 |

> 注：本清单基于静态阅读 + 单次运行实测；P0/P1 条目建议各补一个最小复现用例后再动手，避免误改采集兜底逻辑。

---

## 六、数据源补充建议

> 现有源：Finnhub、Yahoo、AkShare、Longbridge、IBKR、OpenBB、SEC EDGAR、Reddit/ApeWisdom/Stocktwits/X（其中 NewsAPI/Polygon/AlphaVantage/X/YouTube 的 key 在 `.env` 实际缺失，见 2.1）。
> 下表按"价值/是否免费"排序，标注它能喂给哪个因子，便于决定接入优先级。

### 6.1 优先补（免费 + 高价值，建议先做）

| 源 | 类型 | 喂给 | 说明 |
|---|---|---|---|
| **FRED**（`fredapi`，圣路易斯联储） | 宏观 | 风险/regime | 利率、收益率曲线、信用利差(BAML OAS)、失业、CPI、PCE、M2、金融条件指数。免费、稳定、官方，是宏观 regime 过滤的基石，远比抓新闻判断宏观可靠。 |
| **SEC `companyfacts` XBRL API**（`data.sec.gov/api/xbrl/companyfacts`） | 基本面 | 质量/价值/增长 | 结构化财务三表历史，**point-in-time、官方、免费**。可替代易限流的第三方基本面，做干净的 ROIC/毛利/FCF/营收同比。 |
| **SEC EDGAR 全文检索**（`efts.sec.gov/LATEST/search-index`） | 公告/催化 | 情绪催化/事件 | 全文搜 8-K/10-K/S-1/Form 4，做关键词级催化抓取，比只抓"重点文件"覆盖更全。 |
| **SEC Form 4 内部人交易**（EDGAR / OpenInsider 聚合） | 另类 | 情绪/质量 | 内部人买卖是经典 alpha 信号；OpenInsider 提供可解析聚合页。 |
| **FINRA 每日做空量**（免费 CSV） | 另类 | 风险/拥挤度 | short volume / short interest 反映拥挤与逼空风险，补当前缺的"持仓拥挤"维度。 |
| **GDELT**（免费全球新闻图谱） | 新闻 | 情绪/事件 | 无 key 的全球新闻与情绪时间序列，可作 NewsAPI/Polygon 缺位时的英文新闻兜底。 |

### 6.2 值得评估（付费/有免费额度，覆盖关键盲区）

| 源 | 类型 | 喂给 | 说明 |
|---|---|---|---|
| **Financial Modeling Prep (FMP)** | 基本面/估值/电话会 | 价值/质量/催化 | 一个 key 拿到财报三表、**分析师预期与修正**、**财报电话会转录**、内部人、ETF 持仓。性价比高，能一次补齐多个盲区。 |
| **Tiingo / EODHD / Twelve Data / Intrinio** | 行情+基本面 | 全因子 | 复权日线/分钟线 + 基本面，替代易 403 的 Yahoo 图表；EODHD 还有基本面+财报日历。 |
| **Polygon.io**（补回 key） | 行情/新闻 | 动量/流动性 | 全市场分钟线、聚合、新闻、ws 实时，全市场扫描必备。 |
| **Quiver Quantitative** | 另类 | 情绪/事件 | 国会议员交易、内部人、游说、政府合同、WSB 提及——差异化 alt-data。 |
| **Unusual Whales / ORATS / CBOE** | 期权流/波动率 | 情绪催化/风险 | 异常期权流、IV skew/term structure、GEX，强化现有期权模块的"聪明钱"信号。 |
| **Tipranks / Benzinga / Marketaux** | 分析师/快讯 | 催化/情绪 | 评级与目标价共识、低延迟快讯。 |
| **Exa / Tavily / Brave Search API** | 语义检索 | LLM grounding | 给 LLM 做"催化原因"检索时，语义搜索召回质量优于关键词；替代当前靠 Yahoo search 反查的脆弱链路。 |

### 6.3 接入建议
- **先把"point-in-time 基本面（SEC XBRL）+ FRED 宏观 + 分析师预期修正”补齐**，这三块是把"信息台"升级成"可量化选股"的关键缺口。
- 所有新源统一进数据质量面板的"源 → 状态(SET/缺key/限流/超时) → 最近成功时间"视图（见 2.1 修复）。
- 行情/基本面尽量同时存"原值 + 复权 + 数据发布时间"，为第八节的无前视回测打基础。

---

## 七、分析 Skill / Agent 可参考的开源库

> 现状：项目已参考 TradingAgents / ai-hedge-fund / FinGPT / OpenBB，`buildFactorLayer` 注释也提到 Qlib。下面按用途补充更具体、可直接借鉴的库。

### 7.1 选股 / 因子 / ML（与现有 `factorLayer` 最相关）
- **Microsoft `qlib`** —— **本项目"股票推荐"最值得对标的参考**。内置数据层、因子/表达式引擎、模型库(LightGBM/LSTM/Transformer/双塔)、滚动训练与回测、以及现成的横截面选股工作流。可作为"全市场打分排序"的离线训练大脑，把结果喂回现有 skill agent。
- **`FinanceToolkit`**（Jeroen Bouma）—— 从原始三表算 150+ 财务比率与技术指标，**确定性、可解释**，非常适合做 skill 的"数值后端"，避免让 LLM 算数字。
- **`mlfinlab`**（方法论参考，López de Prado）—— triple-barrier 标注、meta-labeling、样本权重、**purged & embargoed 交叉验证**、特征重要性。决定回测是否"骗自己"的关键方法集。
- **`alphalens-reloaded`** —— 因子有效性评估：IC/ICIR、分位收益、换手、衰减曲线。用来验证你的五因子到底有没有预测力。
- **`FinRL` / `FinRL-Meta`** —— 深度强化学习交易框架，作为"组合/择时"实验层（教育用途）。

### 7.2 多智能体 / LLM 金融（强化现有决策层）
- **TradingAgents**（已参考）—— 基本面/情绪/新闻/技术/交易/风控/组合经理分角色辩论 + decision log 回写，正好对应你的 `decisionDashboard` 与 skill 自调权重。
- **ai-hedge-fund**（已参考）—— 多风格投资人 + 估值/情绪/基本面/技术/风控/组合经理协作，纯研究不下单。
- **`FinRobot`** —— 面向金融的多智能体编排框架，可参考其工具/角色抽象。
- **`FinGPT` / `FinBERT`(ProsusAI)** —— 金融文本情绪打分模型，可替代当前规则情绪，提升"新闻方向(positive/negative/mixed)"判定准确度。
- **设计原则**：LLM 只负责**定性催化解读、叙事、对量化信号的"陪审/集成"**；价格、比率、因子分必须由代码算（你现在 hot-news 排序的 prompt 已经做对了这件事，应推广到 skill agent 的全部数字）。

### 7.3 回测 / 组合 / 绩效引擎
- **`vectorbt`(/pro)** —— **向量化、可一次扫上千只票**的回测/参数网格，适合替换当前 `buildMomentumBacktest` 做全市场横截面回测。
- **`backtesting.py`** —— 轻量、单策略快速验证；**`backtrader`** —— 成熟事件驱动；**`zipline-reloaded`** —— 自带 pipeline 和点位数据；**`nautilus_trader`** —— 机构级、Rust 内核、含撮合与延迟模型。
- **`quantstats` / `pyfolio-reloaded`** —— 一键生成 tearsheet：Sharpe/Sortino/Calmar、回撤、滚动 beta、月度热力图。
- **`PyPortfolioOpt` / `riskfolio-lib` / `cvxportfolio`(Stanford)** —— 组合优化：均值方差、Black-Litterman、HRP、风险平价、带成本的凸优化，可替代现有 `suggestedWeights` 的朴素打分加权。
- **技术指标**：`pandas-ta` / `TA-Lib` / `stockstats`，统一指标口径，替散落的手算均线。

---

## 八、股票推荐系统：需要的数据、分析方式、怎么回测

> 现有 `buildFactorLayer`（动量/质量/估值/情绪/风控五因子加权）方向正确，但用的是"当前快照"评分，没有历史面板和无前视回测；`buildMomentumBacktest`（`server.mjs:24789`）是**单票、样本内、close>SMA20→5日收益、无成本、样本极小**的回看，结论不可外推。下面给出把它升级为可信推荐引擎的路线。

### 8.1 推荐系统需要的数据（缺一类，结论就偏）
1. **复权价量历史**（含已退市票，**避免幸存者偏差**）——动量/波动/流动性因子。
2. **Point-in-time 基本面时间序列**（财报按**真实披露日 + 滞后**对齐，含重述）——价值/质量/增长因子。**这是当前最大缺口**（现在只有快照）。
3. **分析师预期与修正**（EPS 上修/下修、盈利惊喜）——盈利修正动量/PEAD，是中短期最强因子之一。
4. **情绪/新闻流**（已部分有）+ FinBERT 方向分。
5. **另类数据**：内部人(Form 4)、做空拥挤(FINRA/Ortex)、期权 skew/GEX、国会交易。
6. **宏观 regime**（FRED：利率、信用利差、VIX、广度）——决定整体仓位的"开关"。
7. **GICS 行业分类**——因子做**行业内中性化**，否则只是押行业 beta。

### 8.2 分析方式（建议在现有五因子上扩展）
- **横截面多因子排序**：每个因子在**同行业内做 z-score**→按权重合成总分→全市场排名→取分位。这才是系统化选股的主线（现有是绝对阈值 ≥50，建议改横截面分位）。
- **具体因子库**：
  - 动量：12-1 月动量、相对强弱、距 52 周高点、残差动量。
  - 质量：ROIC、毛利率稳定性、**Piotroski F-score**、**Altman Z**、低应计。
  - 价值：EV/EBIT、FCF yield、P/E、P/B（行业相对）。
  - 增长/修正：营收与 EPS 增速、**分析师上修动量**、盈利惊喜(SUE)。
  - 情绪催化：FinBERT 新闻情绪、社交热度变化率、异常期权流。
  - 风险：beta、波动、最大回撤、流动性、做空拥挤。
- **regime 过滤**：FRED 信用利差走阔 / 趋势破位时降权或转防守，只在风险偏好友好时给"积极"。
- **ML 排序（进阶）**：用 qlib + LightGBM 预测**前瞻分位收益**，标签用 mlfinlab 的 triple-barrier，特征 = 上面的因子。输出与规则因子做**集成**，而非二选一。
- **LLM 层定位**：对排名靠前的票做"催化是否成立 / 风险点 / 叙事"定性核验与多智能体辩论（TradingAgents 模式），**不参与算分**。

### 8.3 怎么回测（重点：别骗自己）
当前回测的硬伤与对应做法：

| 现有问题 | 正确做法 |
|---|---|
| 样本内、无样本外 | **Walk-forward**：滚动窗口训练→前推测试，参数只在训练段调。 |
| 标签重叠/前视泄漏 | **Purged + embargoed CV**（mlfinlab），特征用披露日对齐的 point-in-time 数据。 |
| 单票评估 | **横截面分位组合**：按总分分 5/10 档，定期(周/月)再平衡，看 **多空价差** 与 **IC/ICIR**。 |
| 无成本 | 计 **佣金 + 滑点 + 买卖价差 + 做空借券成本**，并做成本敏感性。 |
| 幸存者偏差 | universe 纳入**退市票**与历史成分股。 |
| 只看收益 | 指标：**CAGR、Sharpe、Sortino、MaxDD、Calmar、换手、命中率、IC/ICIR、因子暴露**（确认不是纯 beta/动量）。 |
| 单次结果当真 | **稳健性**：参数敏感性、子区间稳定性、**Deflated Sharpe / 多重检验校正**、bootstrap/蒙特卡洛。 |

- **实现栈建议**：`vectorbt` 跑全市场横截面回测引擎 + `alphalens` 评因子 IC + `quantstats` 出 tearsheet；ML 路线用 `qlib` 全流程。
- **前向验证（你已有雏形，应强化）**：现有"全市场 Skill Agent 虚拟持仓 + 决策表现复盘"本质就是**纸上前向测试**——这是最诚实的验证。建议：① 决策落库时冻结当时分数与价格（已做）；② 用**前瞻多周期收益**(5/20/60 日)统计每条规则的**胜率、期望、IC**；③ 只有样本量足够且跨区间稳定时才小步调权（现在每天最多调一次的机制方向对，但应加"样本量阈值 + 区间稳定性"门槛，避免对噪声过拟合）。

### 8.4 落地次序建议
1. 先补 **point-in-time 基本面(SEC XBRL) + 分析师修正 + FRED regime**（第六节），把 `stockHistory` 升级成可回测的因子面板。
2. 用 `vectorbt` 重写横截面回测，先验证现有五因子的 **IC** 是否为正。
3. 因子改**行业内 z-score + 分位排序**，加 regime 过滤。
4. 强化 Skill Agent 的前向验证统计（多周期收益 + IC + 稳定性门槛）。
5. 有数据与算力后再上 qlib/LightGBM ML 排序作为集成项。

---

## 九、实测线上缺陷（2026-06-27 对运行中的 5173 端口实跑）

> 直接拉取运行中的 `/api/state` 分析 `latest` 报告（该报告为 06-26 盘前、`trigger=schedule`、`llmProvider=local`），发现以下**用户在首页可直接看到的错误**。这些是第一节抽象隐患的具体爆发，严重度更高。

### 9.1 [P0] 新闻正文抽取落到 Yahoo 首页 + 摘要张冠李戴（最严重）
- **现象**：首页"重要新闻"40 条里，**34 条的中文摘要在讲一家完全不相干的公司**。例：
  - ticker=`NEO`、标题"…NeoGenomics…"，但 `summary`/`summaryZh`/`catalyst` 全在讲 **LSCC（Lattice Semiconductor）**；
  - ticker=`AAPL`"Apple Hikes Mac, iPad Prices…"、`MU`"Micron Surges…"、`BB`"BlackBerry Earnings…" 的中文摘要同样都是 LSCC 那一段。
- **量化**：`summaryZh` 首词 ticker 与新闻自身 ticker **不一致 34/40**；其中 22 条指向 LSCC、12 条指向 KMI。
- **根因（双重 bug 叠加）**：
  1. **抽取失败落到通用首页**：Google News RSS 跳转链接被 resolve 成 `https://www.yahoo.com/`（22 条）和 `https://finance.yahoo.com/`（12 条），抽到的"正文"是 Yahoo 首页壳——`article.title` 实测为 `"Yahoo | Mail, Weather, Search, Politics, News, Finance, Sports & Video"`。即 `article_extractor` 没跟随 Google News 重定向到真实原文，停在了同意墙/首页。
  2. **缓存键碰撞→污染**：`articleCacheKeys()`（`server.mjs:2392`）把 `article.resolvedUrl` 也作为 key（`url:https://www.yahoo.com/`）。于是 22 条不同新闻共享同一个缓存键，全部命中**同一条缓存文章**，`applyCachedArticle()`（`server.mjs:2430`）把那条文章的 `summary/summaryZh/catalyst` 复制到所有命中项 → 一篇 LSCC 摘要被广播到 22 个不相关 ticker。实测 `article.url` 仅 8 个去重值 / 40 条。
- **修复**：
  - **缓存键去掉通用域名 / 同意墙 landing**：`normalizeArticleUrlForCache` 对 `www.yahoo.com`、`finance.yahoo.com`、`consent.*`、`news.google.com` 等无文章路径的 URL 返回空，绝不作为缓存键；只有解析到真实文章路径才缓存。
  - **抽取结果校验**：当 `article.title` 命中"Yahoo | Mail, Weather…"这类站点壳、或 `resolvedUrl` 是裸域名根路径时，判为抽取失败（`status=blocked`），不写缓存、不覆盖标题级兜底。
  - **修复 Google News RSS 解码**：用 base64 解码 `news.google.com/rss/articles/...` 拿真实原文 URL，或走 Reader API 时带原始 RSS 链接，而不是 resolve 到 yahoo 首页。

### 9.2 [P0] 全部新闻的中文标题相同
- **现象**：40 条新闻 `titleZh` 只有 **7 个不同值**，主导值是固定模板 `"疑似财报/指引新闻，当前未提取收入、EPS、毛利率或指引数字"`——页面上几乎每条新闻标题长一个样，无法区分。
- **根因**：`llmProvider=local` 时没有真正翻译标题，`titleZh` 被错误地填成了"催化猜测"兜底句（来自 `server.mjs:8525/8638` 一带），而不是真实标题翻译或保留英文原标题。
- **修复**：本地档下 `titleZh` 缺失时**回退英文原标题**，绝不用催化兜底句占位；催化猜测只能进 `summary/catalyst`，不能进 `title`。

### 9.3 [P0]【已 CLI 验证】盘前/盘后报告所有报价用"昨收"、涨跌幅恒为 0
- **现象**：定时报告 66 条报价**全部** `changePercent=0` 且 `previousClose===price`（如 AAPL `price=275.15` / `prevClose=275.15`）。首页每只票、大盘面板（QQQ/SPY/SMH 全 +0.0%）、社交"股价变动"、`discovery.changePercent`、factor change 全部归零。
- **根因（已用 Longbridge CLI JSON 当场对比确认，不是盘前巧合而是取数 bug）**：
  - 同一时刻 `longbridge quote AAPL.US --format json` 真实返回：`last=278.94`、`change_percentage="1.38"`、`prev_close="275.15"`，且**盘前实时价在 `pre_market.last="274.73"`、盘后在 `post_market.last`**。
  - 但 `normalizeLongBridgeQuote()`（`server.mjs:15578`）的 `price = firstDefined(row.last, row.price, row.last_done)` **只读常规盘 `last`**；盘前/盘后常规盘尚无当日成交，`row.last` 等于 `prev_close`，于是 `price=prev_close`、`change_percentage="0"`。
  - 代码读取了 `row.pre_market`/`row.post_market`，**却只用了它们的 `prev_close`/`timestamp`，丢弃了其中真正的盘前/盘后 `last` 和 `change`**（`server.mjs:15583-15596`）。
  - 定时报告恰好在盘前 08:30 / 盘后 16:30 ET 运行 → **每一份定时报告的所有价格都是昨收、涨跌幅全 0**；盘中手动跑则正常，因此极易被漏掉。
- **修复**：
  - `normalizeLongBridgeQuote` 增加"会话感知"：当 `status` 非常规交易时段、或 `row.last==prev_close && change_percentage==0` 且存在 `pre_market.last`/`post_market.last` 时，**采用对应盘前/盘后的 `last` 作为现价**，并用该 `last` 与 `prev_close` 重算涨跌幅，附 `session: "pre"|"post"|"regular"` 标签。
  - 报价/大盘/社交展示按 `session` 标注"盘前/盘后/收盘"，避免把昨收当现价。
  - 兜底校验：`previousClose===price && changePercent===0` 时不要显示误导性的 `0.00%`，标注"无当日变动数据"。
  - 同一会话感知逻辑应同步到 IBKR/Finnhub 等其它报价 provider 的归一化。

### 9.4 [P0]【已定位】"市场编辑综述"总结不可读：重复的未翻译英文标题
- **现象**：首页大盘面板的"市场综述"与 `marketEditorial.brief.summary` 实测为：
  > 市场编辑综述已读取正文/有效摘要：Yahoo Finance（已读正文）：Kevin Warsh is already changing the Fed's vibe The central bank already feels different under its new chairman。 〔同一句**逐字重复 3 遍**〕
  - 即：**未翻译的英文 + 只是一条文章标题/副标题、不是综述 + 同一句重复 3 次 + 给不出任何大盘归因**。对中文用户"完全不可读"，也"不构成更多信息"。同一串还污染 `marketOverview.editorialBriefText`、`marketSynthesis.editorialTakeaway`、`marketOverview.notes[0]`。
- **根因**：本地兜底 `marketEditorialThemeSummary()`（`server.mjs:13309-13321`）：
  1. 拼接用的是 `item.summary`，而该字段此处实为文章**英文标题/副标题**（非正文综述），且**未做中文化**；
  2. `useful.slice(0,3)` 的 3 条来源（Schwab/MarketWatch/Yahoo/Investing/Google）都解析到了**同一篇 Yahoo 文章**（与 9.1 同源的文章解析问题），`lines` 三条完全相同，**且 join 前不去重** → 同一句重复 3 遍；
  3. LLM 综述路径有"只有 title 就写正文不足"的护栏（`server.mjs:21601`），但**这个本地兜底函数没有该护栏**，把"标题当正文"直接输出；`local` 档（定时报告默认）必走此兜底，所以每份定时报告的大盘综述都是这种重复英文。
- **修复**：
  - `lines` 生成后按"归一化文本指纹"**去重**，相同/近重复来源只保留一条；全部塌缩为一条时按 `marketEditorialInsufficientSummary` 处理（"正文不足，不据此归因"），不要重复输出。
  - 把"标题级"内容判为不足：复用并加强 `marketEditorialLooksTitleOnly`，英文标题/副标题不得作为中文综述正文。
  - 对入选英文正文做**中文化**（LLM 或本地翻译）后再写入"市场综述"；保留英文原文到证据字段而非展示字段。
  - 兜底文案统一加"仅供盘面背景、不构成投资建议"，但**前提是要有真实信息**，不能只剩免责声明。

### 9.5 [P2] 首页展示的是数小时前、本地规则生成的报告
- **现象**：`completedAt=06-26T13:28Z` 而 `serverTime=06-26T16:33Z`，首页 `latest` 是 ~3 小时前的盘前报告，且 `llmProvider=local`（规则摘要，非 AI）。
- **影响**：与 2.3 一致——用户看到/收到的定时报告是规则拼接，且无"数据时效/本地档"提示。
- **修复**：首页对"非最新/本地规则"报告显著标注；提供一键"用 AI 重新摘要最新报告"。

> 复现方式：`curl -s localhost:5173/api/state` 后检查 `latest.news[].summaryZh` 首词 ticker 与 `latest.news[].ticker` 是否一致、`latest.news[].article.title` 是否为站点壳、`latest.quotes[].changePercent` 是否恒为 0。建议把这三条做成启动自检/单测断言（呼应 4.2）。

---

## 十、基于行业调研的新增功能 / 增补建议（2026-06-27 网络调研）

> 本节对标 2026 年主流零售投研工具（Earnings Whispers、Unusual Whales、Quiver、InsiderFinance、Seeking Alpha Quant）与开源框架（TradingAgents v0.3、FinRobot、OpenBB ODP），列出本项目**还缺、且公认高价值**的功能与数据；并用调研结论强化第六/七/八节。

### 10.1 对标主流工具的功能缺口（建议新增）
| 功能 | 主流工具如何做 | 本项目现状 | 建议 |
|---|---|---|---|
| **盈利预期修正（EPS Revisions）** | Seeking Alpha Quant 把它列为 5 大因子之一；研究普遍认为上修/下修是**领先于股价的信号** | 无 | **最高性价比的分析新增**：把 EPS/营收一致预期与近 30/90 天修正方向做成第 6 个因子（见 10.3）。 |
| **盈利日历 + whisper + beat/miss 历史 + 财报后漂移(PEAD)** | Earnings Whispers：whisper number、历史 beat/miss、覆盖 11000+ 票 | 有基础财报日历 | 增补"历史超预期记录 + 财报后 1/5/20 日漂移"，作为事件驱动因子。 |
| **实时期权流 / 异常活跃 / 暗池** | Unusual Whales：real-time options scanner、dark pool prints、flow alerts | 有期权链/GEX，无"聪明钱"流 | 接 Unusual Whales / ORATS / CBOE，或基于现有链数据做 volume>OI、大单 sweep 识别。 |
| **国会/内部人/13F 汇聚** | Quiver（30+ 另类源）、Capitol Trades、OpenInsider（免费） | 无 | 接 **OpenInsider(免费 Form 4) + Quiver/Capitol Trades(国会)**，做"聪明钱共振"信号。 |
| **财报电话会转录 + 管理层语气分析** | LLM 抽取 guidance、按季跟踪管理层情绪 | 无 | 接 **Roic AI / EarningsAPI / FMP / API Ninjas** 转录（多家有免费档），用 LLM 抽指引数字与语气趋势——差异化强、与现有 LLM 管线契合。 |
| **实时提醒推送** | 价格/成交量/新闻/SEC filing 即时 push | 只有定时邮件 | 增加价量异动、关注股 8-K/Form 4、关键价位击穿的即时提醒（接 SEC Daily API / Kaleidoscope filing push）。 |

### 10.2 数据源增补（调研验证版，细化第六节）
- **Financial Modeling Prep (FMP)** —— **首选补强**。调研确认：一个 key 同时覆盖**基本面三表 + 分析师一致预期与修正 + 目标价 + 财报电话会转录**，免费档灵活度高于多数同类。能一次补齐 10.1 里 EPS 修正、转录两大缺口。
- **FRED**（圣路易斯联储，免费）—— 宏观 regime 基石；TradingAgents v0.3 也已把 FRED 列为内置 vendor，侧证其在 AI 投研里的标准地位。
- **财报转录**：Roic AI（每档含免费）、EarningsAPI（自带 MCP，支持自然语言查转录）、API Ninjas（带摘要+指引+情绪）。
- **实时 SEC filing 推送**：SEC Daily API（免费 1000 次/月，分钟级 Form 4）、Kaleidoscope（filing 即时 webhook）、sec-api.io（2000 万份全文检索）。
- **另类数据**：OpenInsider（免费 Form 4 聚合）、Quiver（国会/游说/合同）、Unusual Whales（期权流+暗池）、Capitol Trades（国会，UX 最简、免费）。
- **预期修正**：Zacks Consensus（Nasdaq Data Link，含上/下修家数）、Finnhub EPS estimates。

### 10.3 分析方法增强（调研验证版，细化第八节）
- **新增"盈利修正"因子（强烈建议）**：研究一致认为 EPS/营收**估计修正**与一致**目标价上调**常领先股价；Seeking Alpha Quant 直接把"EPS Revisions"与 Value/Growth/Profitability/Momentum 并列为 5 因子。现有 `factorLayer` 五因子里没有它——补上后是横截面选股最值得加的一维。
- **QVM 组合得到验证**：Quality + Value + Momentum 是公认稳健的多因子组合（多份长周期回测支持）；现有因子层已含三者，建议再叠加 **盈利修正 + 财报超预期/PEAD** 形成"QVM + Earnings"。
- **情绪模型升级**：调研显示 **FinBERT**（Financial PhraseBank 微调）在 Benzinga/道琼斯新闻上准确率约 68–76%，稳定优于通用小模型；GPT-4 少样本可与之相当，但 **FinGPT 多条新闻输入时易输出乱码**。建议新闻方向判定用 FinBERT 或 GPT-4 少样本，替换当前规则情绪。
- **2026 因子环境**（仅作权重参考）：调研显示动量延续领先、价值在美股仍具吸引力、质量偏弱——可作为 regime 自适应加权的输入，而非固定权重。

### 10.4 平台层（与 Agent/Codex 生态对齐）
- **把采集层做成 MCP server**：本项目运行在 Agent/Codex 语境，OpenBB ODP 的"connect once, consume everywhere"模式值得借鉴——将现有 collectors 暴露为 MCP，可被 Claude/Codex/Cursor 直接消费；同时可**反向消费**外部财经 MCP（OpenBB MCP、yahoo-finance-mcp、EarningsAPI MCP）快速补数据。
- **本地 LLM 选项（Ollama）**：TradingAgents 已支持本地模型零成本运行；可作为外部 LLM 限流/超时时的隐私友好降级（呼应现有 `local` 档，但用真模型而非纯规则）。

### 10.5 具体修复增补：Google News RSS 解码（接 9.1）
- 调研确认 9.1 的抽取失败根因：`news.google.com/rss/articles/CBMi...` 是 Google 加密重定向，**不能直接 GET 拿原文**，否则会停在同意墙/首页（正是本项目落到 `yahoo.com` 的原因）。
- 正确解码流程：提取路径里的 base64 article id → 请求文章页拿 `data-n-a-sg`(签名) 与 `data-n-a-ts`(时间戳) → POST 到 Google `batchexecute` 端点 → 解析嵌套 JSON 得真实 source URL。参考实现 `SSujitX/google-news-url-decoder`(Python)。
- **注意**：该端点有限流/CAPTCHA 风险。**更稳的做法是少用 Google News RSS 作主源**，改用发布方直连 RSS、NewsAPI 或 FMP/Finnhub 新闻（带原文 URL），从源头避免重定向解码。

### 10.6 回测 / 验证强化（调研再确认第八节）
- 调研把两类"隐形杀手"点名为必须规避：① **用今日收盘价算当日信号**（off-by-one，应用昨收）；② **在季末日就用季度财报数据**（财报通常 4–5 月才披露，构成前视）。→ 必须用**按真实披露日对齐的 point-in-time 基本面**（从 SEC XBRL filing 日期构建），且 universe 纳入**退市票**消除幸存者偏差。
- 落地不变：walk-forward + purged CV + 真实成本 + 横截面分位 IC/ICIR；现有"虚拟持仓决策复盘"是最诚实的前向测试，按 8.3 加多周期收益与稳定性门槛。

### 10.7 建议优先级（新增项）
| 优先级 | 新增项 | 理由 |
|---|---|---|
| 🟠 P1 | EPS 修正因子 + FMP 接入 + 财报转录 LLM 抽取 | 单点投入小、对"选股质量/差异化"提升最大，调研一致背书 |
| 🟡 P2 | OpenInsider/Quiver 另类数据 + 实时 filing/价量提醒 + FinBERT 情绪 | 补"聪明钱"与时效，提升信号面 |
| 🟢 P3 | MCP server 化 + 本地 LLM(Ollama) + Unusual Whales 期权流 | 平台/生态与高级数据，按精力推进 |

---

## 十一、开源库 → 具体缺陷映射（可直接落地）

> 这一节把调研到的开源库**对应到本文件前面的具体缺陷**，给"用哪个库、怎么用"，便于直接动手。两个总索引：[`wilsonfreitas/awesome-quant`](https://github.com/wilsonfreitas/awesome-quant)、[`georgezouq/awesome-ai-in-finance`](https://github.com/georgezouq/awesome-ai-in-finance)。

### 11.1 新闻正文抽取（修 9.1 / 1.1）
- **现状**：`scripts/article_extractor.py` 用 trafilatura + 标准库 + Reader，遇 Google News 重定向落到 `yahoo.com` 首页且无校验。
- **推荐库**：
  - **`Fundus`**（基准 F1 ~97.7%，发布方专用解析器，准确度最高）作首选，**`newspaper4k`**（0.9.5，2026-02 仍活跃、多线程、自带摘要/关键词）与 **`news-please`** 作并列兜底；trafilatura 2.0 仍是通用全能项保留。
  - JS 渲染/付费墙页面配 **Playwright**（无头浏览器）兜底。
- **落地**：抽取改成 `trafilatura → newspaper4k → fundus/news-please → Playwright → Reader` 级联，并加"结果校验"（title 命中站点壳 / resolvedUrl 是裸域名根 → 判失败、不写缓存），与 9.1 的缓存键修复合并。

### 11.2 Ticker / 公司实体识别（修 1.5、强化 1.4 与 9.1 的张冠李戴）
- **现状**：`extractTickerMentions` 用全量 SEC 代码集 + 69 词黑名单的正则，易把 `ALL/ON/OPEN` 误判为个股；新闻 ticker 归属也靠硬编码别名表。
- **推荐库**：
  - **John Snow Labs `finner_roberta_ticker`**（RoBERTa 金融 NER，从文本抽 ticker）做模型级实体识别替代正则。
  - **`rohanmahen/phrase-ticker`**（GPT-4 微调数据集：自然语言→S&P500 ticker）可用于训练/few-shot。
  - **`pytickersymbols`** 做 ticker 白名单与公司名校验，替代手维护的 `ARTICLE_TICKER_ALIASES`。
- **落地**：用 NER 置信度 + 公司名匹配决定新闻归属，低置信归"行业/宏观"，从源头减少错配。

### 11.3 新闻近重复去重（修 1.3）
- **现状**：`uniqBy(url||title)`，既误合并又漏合并（代理链接/标题截断）。
- **推荐库**：**`datasketch`**（MinHash + LSH，Python 成熟）；**`KavehKadkhoda/news_similarity_clusters`**（字符 shingle + MinHash + LSH，语言无关，适合中英混合）。
- **注意**：2025 研究指出 LSH 在现代付费墙新闻上准确率下降，对高价值条目可叠加 **sentence-transformers 句向量**做近义判重。
- **落地**：去重键改"原文域名+路径归一 + 标题 MinHash 指纹 + 发布日"，经 Python 桥调用即可（项目已有 bridge 模式）。

### 11.4 期权 Greeks / IV（强化期权模块与数据质量）
- **现状**：README 自述"缺 Greeks 时用 bid/ask 中间价估算 IV/Gamma/GEX"。
- **推荐库**：**`py_vollib`/`py_vollib_vectorized`**（LetsBeRational，快且准的 BS IV+Greeks）、**`fast-vollib`**（py_vollib 兼容，NumPy/PyTorch/JAX 批量后端）、**QuantLib**（美式/奇异/随机波动率）。
- **落地**：用真实 BS Greeks 替换中间价估算，GEX/IV smile 的数值更可信，并在数据质量里标注"模型估算 vs 交易所快照"。

### 11.5 行情可靠性（修 9.3、TECHNICAL_YAHOO 403）
- **现状**：Yahoo 图表 403 被关；Longbridge 盘前快照导致涨跌幅恒 0。
- **推荐库/源**：**`yahooquery`**（走官方 endpoint，比 yfinance 抓取稳）；生产级用 **EODHD / Tiingo / FMP / Alpaca**（官方 API、含复权与实时）。
- **落地**：把 yahooquery 作为 Yahoo 图表/报价的稳定替代；报价层补"无当日变动数据"判定（见 9.3）。

### 11.6 LLM 结构化输出（修 `JSON.parse(LLM 输出)` 脆弱性）
- **现状**：服务端多处对 LLM 返回手动 `JSON.parse`（如 `rankImportantNewsWithLlm`、stockNarratives、advisor），格式错乱即降级，无 schema 校验。
- **推荐库**：**`zod` v4**（`.toJSONSchema()` 直接生成约束 schema + 运行时校验，1.9KB、解析快）或 **AJV**；本地 Ollama 走 structured outputs + zod。
- **落地**：生成端用 schema 约束 + 接收端 zod 校验"双层"，减少格式失败；注意 zod 只验结构不验真伪（幻觉仍需 grounding，现有 prompt 已做对，保留）。

### 11.7 前端图表升级（K线/技术面 UI）
- **现状**：`public/app.js` 自绘图表。
- **推荐库**：**TradingView `lightweight-charts`**（45KB、可流畅渲染 5 万+ K线、免费 OSS、原生支持蜡烛/均线/标记）；需要更多图种用 **Apache ECharts**。
- **落地**：个股页 K线/均线/期权 GEX 图换成 lightweight-charts，性能与专业度都提升。

### 11.8 组合风险 / 绩效 / 回测指标（强化第三、八节）
- **现状**：FIFO 复盘手算胜率/回撤/期望，缺标准化风险指标，且只支持多头（3.1）。
- **推荐库**：**`quantstats`**（一键 tearsheet：Sharpe/Sortino/Calmar/回撤/滚动 beta）、**`empyrical-reloaded`**（标准风险指标）、**`pyfolio-reloaded`**、**`riskfolio-lib`**（组合优化）、**`fortitudo.tech`**（CVaR/压力测试）；回测引擎用 **`vectorbt`**（全市场横截面，见第八节）。
- **落地**：交易复盘的绩效与权益曲线改由 empyrical/quantstats 计算，口径标准、并自带 CVaR/Calmar/盈亏比；与 3.1 的多空支持一起改。

### 11.9 建议落地顺序（库集成）
| 优先级 | 集成 | 直接修复 |
|---|---|---|
| 🔴 P0 | Fundus/newspaper4k 级联 + 抽取校验 | 9.1 新闻落到 yahoo 首页 / 张冠李戴 |
| 🟠 P1 | 金融 NER(finner_roberta_ticker) + datasketch 去重 | 1.5 ticker 误判 / 1.3 去重 / 9.1 错配 |
| 🟠 P1 | zod 校验 LLM 输出 | 各处 JSON.parse 脆弱性 |
| 🟡 P2 | yahooquery 报价 + py_vollib Greeks | 9.3 报价 / 期权数值质量 |
| 🟡 P2 | quantstats/empyrical 绩效 + vectorbt 回测 | 3.1 / 第八节回测可信度 |
| 🟢 P3 | lightweight-charts 前端图表 | K线/技术面 UI 体验 |

---

## 十二、根本问题：总结"有字数、没信息"（systemic，最高优先级）

> 这不是某个字段的渲染 bug，而是贯穿全产品的设计病：**几乎所有"总结"都在描述"我读了什么 / 缺什么 / 还要再核验"，而不是"发生了什么 / 关键数字是多少 / 所以呢"**。9.1（张冠李戴）、9.2（标题全相同）、9.4（重复英文）只是这个病在不同字段的表现。即使把那些 bug 都修了，按现在的写法总结依然没价值。

### 12.1 症状（跨模块同一种病，实测引用）
- **新闻 `summaryZh` = 模板填空**：「X 这篇新闻主要讲原文披露了公司相关事件，属于市场解读。原文没有披露收入、EPS、利润率、订单金额或指引等关键数字。投资含义是…需要验证。下一步需要核验…」——40 条里 34 条共用两套模板。
- **`titleZh` 全是**「疑似财报/指引新闻，当前未提取收入、EPS、毛利率或指引数字」。
- **`analysis.summary` = 计数**：「本次覆盖 68 个 ticker，抓到新闻 40 条、SEC 4 条…」「关注度最高：MSFT(36条)」——元数据，不是结论。
- **`opportunities` = 关键词计数**：「AAPL: 信息活跃度 23，正向关键词 4。」`risks` = 「SLS 风险分 47；BB 风险分 45」——黑箱分。
- **`socialReason` / `decisionMemo` / `prism` = 华丽结构 + 对冲脚手架**：「能否被新闻原文、SEC 和后续行情确认」「卡位逻辑一般」「仍需确认是否为正式合同、金额、制程节点和量产时间」——永远不给结论。
- **市场综述 = 9.4 的重复英文标题**。
- 共同点：**信息密度趋近于 0，免责声明和"需核验"占了大部分篇幅。**

### 12.2 为什么没价值（根因，按可修复性排序）
1. **Garbage-in**：正文抽取坏了（9.1 落到 yahoo 首页拿到的是站点壳/标题），**根本没有真材料可总结** → 总结只能如实报"没提取到数字"，再包装成一段话。**这是第一性原因**。
2. **本地兜底是模板而非抽取**：没料时输出脚手架句式，而不是一句"无有效数据，已跳过"。
3. **定时报告走 `local`（2.3）**：用户真正收到/看到的报告**根本没跑 LLM 推理**，增值分析从未发生。
4. **免责与对冲挤占信息**：每条都「需核验 / 不构成投资建议」，把可能有价值的 20% 淹没。
5. **字段间高度冗余**：同一组 `themes` 在 `newsCatalyst`/`catalystPack`/`socialReason`/`decisionMemo`/`prism` 反复复述——是重复，不是深度。
6. **评分黑箱 + 饱和**：`score=100`（社交前 11 名全 100）、`风险分 47` 没有可解释维度，读者无法据此行动。

### 12.3 有价值的总结长什么样（投资者视角的验收标准）
对每一条催化/新闻，必须给到下面四点，**缺料就明说缺、不展开**：
1. **事实 + 硬数字**：具体发生了什么 + 关键数字（EPS/营收/指引/涨跌幅/价位/日期）。没有数字就一句"原文无关键数字"，不再扩写三句。
2. **so-what 量化**：影响谁的收入/利润率/估值，量级多大（不是"需要验证收入转化"）。
3. **预期差**：vs 一致预期 / vs 上季 / vs 股价是否已反映。
4. **可证伪的下一步**：带价位/日期/字段的核验点，例：「看 Q4 指引是否提存储成本；若毛利率指引 < 44% 则看空逻辑成立」。
并且：**置信度由证据质量决定（不是固定 100）**；**一段 ≤ 3 句**；**砍掉模板与跨字段重复**。

### 12.4 怎么改（落地次序）
1. **先修 garbage-in（9.1 / 11.1 抽取级联+校验）**——没有真正文，任何总结都没价值，这是前置条件。
2. **抽取层做"硬数字抽取"**：用正则 + LLM 抽 EPS、营收、指引、百分比、价位、日期，落到 `keyData`；**总结层强制"无 keyData 就不准展开 fact 句"**，从机制上消灭"原文没有披露…"这类填充。
3. **信息密度优先的总结策略**：有 fact 才展开；无 fact 直接降级成一行"无有效信息，已跳过"，不要凑字数。
4. **预期差要有数据支撑**：接 EPS 修正 / 一致预期（第十节 FMP/Zacks），才能真正写"超/不及预期"，否则不写。
5. **LLM-as-judge 把关信息量**：对每条总结打"信息量分"（是否含数字 / 是否有 so-what / 是否有可证伪点），低分**不展示**而非展示一段废话。
6. **一个 ticker 一份"事实库"，各展示位引用而非各自重述**，消除 12.2.5 的冗余。
7. **免责声明全局一处**，删掉每条结尾的无差别堆叠。

> 一句话：当前总结优化的是"看起来做了分析"，应改为优化"每句话是否让用户多知道一件可据以行动的事"。这是该项目**投入产出比最高**的改造方向——比加任何新数据源都重要，因为没有它，新数据也只会被加工成同样无价值的总结。

---

## 十三、要"真投资建议 + 真懂市场每天发生什么"，最值得做的功能

> 核心判断：系统**不缺采集，缺合成层**。已有但没用起来的资产：`stockHistory`（每轮快照，可做 diff）、`signalHistory` + all-stock-agent 决策复盘（可做 track record）、`portfolio`/交易日志（可做仓位感知）、`factorLayer`（可做轮动）、`agentDebate`（可做情景）。下面的功能基本都是**连接并合成这些已有资产**，而非加数据源。分成两个目标。

### 目标 A：真正的"投资建议"（不是评分，是可执行、可追责的决策）

1. **A1 仓位感知的建议（最该先做）** —— 建议必须相对用户**真实持仓**给出，而不是通用评级。「你 NVDA 持仓占 18%、成本 $X；今天的消息对你的论点做了 Y；结论：减/加/持 + 理由 + 对组合的影响」。系统已有 portfolio + 交易日志，缺的是把建议挂到持仓上。
2. **A2 每个标的一个可证伪的论点（thesis）** —— 每条建议带：一句话论点、关键假设、**证伪条件**（价位/基本面阈值/日期）、目标价/止损、时间周期、**基于波动率的建议仓位**。这是"信息→建议"的分水岭。`decisionMemo`/`agentDebate` 现在止于"继续跟踪"，要让它收敛到"决策 + 仓位 + 证伪点"。
3. **A3 预期差引擎（alpha 的核心，关键依赖）** —— 建议的价值来自「市场预期 X、我判断 Y、差在 Z」。**没有一致预期/盈利修正数据就只能描述、不能建议**。必须接 FMP/Zacks 的 consensus + EPS revisions（第十节）。这是为"建议"解锁价值的单点最大缺口。
4. **A4 风险与仓位层** —— 把信心 × 波动(ATR) × **与现有持仓的相关性**转成建议仓位和组合级风险（集中度、因子暴露、相关性）。「别加 NVDA，你已经 40% 押半导体」。`portfolioRisk` 已有骨架，缺相关性/因子暴露与"加仓会恶化什么"的判断。
5. **A5 追责闭环 / track record（让建议可信）** —— 每条建议落库时冻结当时价格与论点，按前瞻多周期结果打分，surface「建议命中率 / 期望值 / 校准度」。all-stock-agent 决策复盘 + `signalHistory` 已有骨架，要做成**面向用户的可信度仪表盘**——没有 track record 的建议是不可证伪的噪音。
6. **A6 校准的置信度 + 情景化** —— 置信度由证据质量 + 同类设置的历史胜率决定（不是固定 100）；每条建议给 bull/base/bear + 粗略概率 + 关键观察点。

### 目标 B：真正"懂市场每天发生什么"（一个连贯叙事，不是 40 张卡片）

1. **B1 "今日市场叙事"——一份连贯日报（最该先做）** —— 回答四问：**什么在动**（指数/板块/因子）、**为什么**（2–3 个真实驱动）、**什么 regime**、**相比昨天变了什么**。以价格行为为主线串成一个故事，而不是 40 条标题。这是 §12"有字数没信息"的正解。
2. **B2 带原因的异动榜（movers-with-reasons）** —— 「你的池子 + 全市场今日最大异动：TICKER ±X%，因为〔具体催化 + 数字〕」。把价格变动→催化→so-what 串起来。依赖修好 9.3（涨跌幅）和 9.1（催化抽取）。
3. **B3 "较昨日发生了什么" diff 引擎（高杠杆，已有数据）** —— 用 `stockHistory` 快照算**增量**：新 8-K、盈利预期被上/下修、情绪翻转、技术突破、异常期权、叙事变化。价值在 **delta**，不是重述静态状态。这是系统已有却几乎没用的最大富矿。
4. **B4 板块/因子轮动视图** —— 今天谁领涨/领跌（成长 vs 价值、半导体 vs 银行），钱在不在轮动。给出单股卡片给不出的"市场在做什么"的高度。`factorLayer` 可扩展成时间序列。
5. **B5 异常/惊讶检测** —— 只标真正异常的：异常成交量、期权扫单、跳空、情绪骤升、**无消息却大动的股**（→ 去查）。信号是异常，不是例行。
6. **B6 个性化相关性排序 + 2 分钟简报** —— 一切先按"对你的持仓/自选的影响"排序，再到全市场；盘前/盘后输出**人会真读完的叙事邮件**：regime、你组合今天怎么了、对你最重要的 3 件事、明天看什么。

### 贯穿性使能层（让 A、B 都成立）

- **C1 每个 ticker 一个"演进中的论点 + 事实库"** —— 系统现在每轮失忆。应保留昨日观点并更新：「昨天我说看 X，今天发生 Y，所以调整为 Z」。这同时给出叙事连续性（B）和建议追责（A）。是 §12 "一个 ticker 一份事实库"的延伸。
- **C2 预期差数据（一致预期 + 修正）** —— A3/B2 的共同依赖；接 FMP/Zacks 后，"超预期/轮动/估值容错"才有真实数据支撑。

### 优先级
| 优先级 | 功能 | 为什么 |
|---|---|---|
| 🔴 先做 | B1 今日市场叙事 + B3 diff 引擎 | 用已有 `stockHistory`，立刻把"每天发生什么"做成有信息量的叙事，且不依赖新数据 |
| 🔴 先做 | A1 仓位感知建议 + A2 可证伪论点 | 用已有 portfolio/journal，把"评分"升级成"决策" |
| 🟠 关键依赖 | C2 预期差数据（FMP/Zacks） | 解锁 A3/B2 的"建议含金量" |
| 🟠 次做 | A5 追责闭环 + C1 演进论点 | 让建议可信、叙事连续 |
| 🟡 增强 | A4 风险/相关性、B4 轮动、B5 异常检测、A6 情景 | 在前面成立后逐步加深 |

> 一句话：要"真建议"就把**评分→可证伪决策、并接预期差数据、再用 track record 追责**；要"真懂市场"就把**40 张卡片→一个以价格为主线、以 delta 为重点、以"对我的影响"排序的每日叙事**。两者共用一个"每标的演进论点 + 事实库"。这些几乎都是合成已有资产，工程量小于它们的价值。

---

## 十四、让它成为"能依赖的产品"：信任 / 度量 / 可靠性（工程化层）

> 前面是"修什么 / 加什么功能"。这一节是把它从"原型"变成"每天敢依赖、还要给投资建议"的产品所必需、却最容易被跳过的层。**本节优先级高于第十节之后的任何新数据源**——尤其因为我们已经证明系统会在坏数据上自信输出（错价格 9.3、张冠李戴 9.1、重复英文综述 9.4）。

1. **14.1 建议前的"数据信任闸门"（最重要）** —— 给"投资建议"前强制 gate：每条建议依赖的关键输入（价格新鲜度、催化是否有真实正文而非站点壳、预期差是否有数据）打一个"数据可信分"，**低于阈值就降级为"信息不足，不给建议"，而不是硬给**。把 §12 的"无料就说无料"上升为产品级硬约束——在一个会给建议的系统里，"在坏数据上自信输出"是最危险的失败模式。
2. **14.2 质量度量 / 评测闭环（没有它，§12/§13 全部不可知）** —— ① 摘要信息量分（含数字/有 so-what/有可证伪点）做成**可回归指标**，每次改 prompt/逻辑都跑，防退化；② 建议 track record（A5）→ 命中率/期望/校准，按时间与设置类型拆分；③ 一小套"金标准"样本 + LLM-as-judge 跑在 CI 里。这是把前面所有改造从"感觉变好"变成"可证明变好"的唯一办法。
3. **14.3 可靠性 / 可观测性（每天依赖的前提）** —— 采集失败/数据陈旧要**主动告警**（现在静默进 `errors[]`）；run 失败、邮件失败、某源连续 N 天为空要可见；健康检查 + 卡死自愈；store 损坏/超大要有预案；把"源状态总览（SET/缺key/限流/超时/最近成功时间）"从后台暴露到前台。
4. **14.4 用户模型 / 个性化（建议要"合身"）** —— 风险偏好、投资风格、时间周期、硬约束（能否做空、期权权限、单仓/行业集中度上限、税务）。建议与排序按用户模型调；all-stock-agent 的 skill 文档可扩成用户画像。没有它，"建议"只能是通用的、对谁都一样的话。
5. **14.5 对话式 + grounded 的问答入口（"懂市场"的真正交互）** —— 把现有 chat 升级成对"事实库 + 持仓 + 今日 diff"的 RAG 问答：「我该担心我的半导体仓位吗」「今天和我相关的最重要三件事」。对"了解市场每天发生什么"，一个能追问、答案带出处的对话，往往比再加一个面板更有价值。
6. **14.6 真正的跨资产宏观（market awareness 的另一半）** —— 利率 / 信用利差 / 美元 / 波动率 / 商品 / 加密的 regime，而不是退化成全 +0.0% 的代理 ETF（现状）。FRED（第六/十节）接上后这块才成立。
7. **14.7 数据血缘 / 一键溯源** —— 每个数字与论断可点击回到来源（价格来自哪个 provider、催化来自哪篇原文、预期差来自哪次修正）。给建议的系统，"凭什么这么说"必须一键可查——这也是 14.1 信任闸门的展示面。

### 优先级
| 优先级 | 事项 | 为什么 |
|---|---|---|
| 🔴 必做 | 14.1 数据信任闸门 + 14.2 评测闭环 | 前者防"在坏数据上给建议"，后者让所有改造可证明、防回退 |
| 🟠 高 | 14.3 可靠性告警 + 14.7 溯源 | "每天依赖"和"可信建议"的底座 |
| 🟡 中 | 14.4 用户模型 + 14.5 对话式问答 + 14.6 跨资产宏观 | 让建议合身、交互自然、市场视角完整 |

---

> **文档收尾**：到此，清单已覆盖 ①线上确证 bug（§1、§9）→ ②数据正确性根因（§9.1/9.3/9.4）→ ③数据源与开源库（§6/§7/§10/§11）→ ④系统性的"总结无价值"根本问题（§12）→ ⑤"真建议 + 真懂市场"的功能路线（§13）→ ⑥信任/度量/可靠性的工程化层（§14）。**接下来的瓶颈是执行与度量，不是更多点子**。建议的第一刀：修 9.1（新闻 garbage-in）→ 上 §12 的"无料不展开 + 信息量门槛"→ 用 §14.2 的评测闭环证明它真的变好，再推进 §13 的叙事与建议。

---

## 附录 A：优先项的代码级实现方式

> 下面是"第一刀"四项 + 评测闭环的**可落地实现**。函数以名称引用（行号会随编辑漂移）。代码为贴合本项目风格的草图，落地时按真实签名微调；每项都标了**改哪个函数 / 加什么 / 为什么**。

### A.1 修 9.1：新闻 garbage-in（缓存键碰撞 + 抽取落到站点壳）
**改 `normalizeArticleUrlForCache` / `articleCacheKeys` / `applyCachedArticle`（约 2397/2422/2460）+ `scripts/article_extractor.py`。**

1) 新增"无用 URL"判定，挡掉裸域名根 / 同意墙 / Google News 重定向壳：
```js
const ARTICLE_LANDING_HOSTS = new Set([
  "yahoo.com","www.yahoo.com","finance.yahoo.com","consent.yahoo.com",
  "news.google.com","www.google.com","consent.google.com",
]);
function isUnusableArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/\/+$/, "");
    if (host.startsWith("consent.")) return true;
    if (ARTICLE_LANDING_HOSTS.has(host)) return true;   // 站点首页/同意墙
    if (!path) return true;                              // 裸域名根（http://www.yahoo.com/）
    return false;
  } catch { return true; }
}
```

2) `normalizeArticleUrlForCache` 末尾返回前过滤——**根因修复**：22 条不同新闻不再塌缩到 `url:https://www.yahoo.com/` 同一个缓存键：
```js
// return url.href;  ←旧
return isUnusableArticleUrl(url.href) ? "" : url.href;
```

3) 抽取结果校验：title 命中站点壳或 resolvedUrl 是裸域名根 → 判 `blocked`，**不写缓存、不覆盖标题级兜底**：
```js
const SITE_SHELL_TITLE_RE = /^(yahoo(\s*finance)?|google news|sign in|consent|are you a robot|access denied|just a moment|enable javascript)/i;
function articleLooksLikeSiteShell(article = {}) {
  if (isUnusableArticleUrl(article.resolvedUrl || article.finalUrl || article.url)) return true;
  return SITE_SHELL_TITLE_RE.test(normalizeDisplayText(article.title || ""));
}
```
在抽取成功路径与 `applyCachedArticle` 内，命中即走 `withSourceLimitedArticle(item, article, "site shell / unusable url")`，并跳过 `cacheArticleItem`。

4) Google News RSS 解码（替掉直接 GET `news.google.com/rss/articles/...`）：在 `scripts/article_extractor.py` 里先解码出真实原文 URL 再抽取——base64 取 article id → 请求文章页拿 `data-n-a-sg`/`data-n-a-ts` → POST `batchexecute` → 解析真实 URL（参考 `SSujitX/google-news-url-decoder`）；解码失败的条目**降级为标题级、不进正文缓存**，避免再次落到 yahoo 首页。

> 验收：`latest.news[].article.url` 去重数应≈条目数；`summaryZh` 首词 ticker 与 `news[].ticker` 一致率 → 接近 100%。

### A.2 修 9.3：会话感知报价（盘前/盘后用对应 last 重算）
**改 `normalizeLongBridgeQuote`（约 15977）。** Longbridge JSON 实测含 `pre_market.last` / `post_market.last`，当前被丢弃：
```js
function normalizeLongBridgeQuote(row = {}, fallbackTicker = "") {
  const ticker = longBridgeTickerFromSymbol(row.symbol, fallbackTicker);
  const regularLast = numberOrNull(firstDefined(row.last, row.price, row.last_done));
  if (!ticker || !Number.isFinite(regularLast) || regularLast <= 0) return null;
  const pre = row.pre_market || row.preMarket || {};
  const post = row.post_market || row.postMarket || {};
  const prevClose = numberOrNull(firstDefined(row.prev_close, row.previousClose, pre.prev_close, post.prev_close));
  const regularChange = numberOrNull(firstDefined(row.change_percentage, row.changePercent));

  let session = "regular", price = regularLast, changePercent = regularChange;
  // 常规盘 last==prevClose 且无变动 → 处于盘前/盘后，改用扩展时段 last
  const regularStale = Number.isFinite(prevClose)
    && Math.abs(regularLast - prevClose) < 1e-6
    && (!Number.isFinite(regularChange) || regularChange === 0);
  if (regularStale) {
    const preLast = numberOrNull(pre.last), postLast = numberOrNull(post.last);
    const preTs = Date.parse(pre.timestamp || 0), postTs = Date.parse(post.timestamp || 0);
    if (Number.isFinite(preLast) && (!Number.isFinite(postTs) || preTs >= postTs)) { price = preLast; session = "pre"; }
    else if (Number.isFinite(postLast)) { price = postLast; session = "post"; }
    if (session !== "regular" && Number.isFinite(prevClose) && prevClose > 0) {
      changePercent = ((price - prevClose) / prevClose) * 100;
    }
  }
  return {
    ticker, price, previousClose: prevClose, changePercent, session,
    open: numberOrNull(row.open), high: numberOrNull(row.high), low: numberOrNull(row.low),
    volume: numberOrNull(row.volume), turnover: numberOrNull(row.turnover),
    provider: "Longbridge Quote",
    timestamp: firstDefined(session === "post" ? post.timestamp : session === "pre" ? pre.timestamp : row.timestamp, nowIso()),
    sourceRisk: "Longbridge 行情取决于市场数据订阅；盘前/盘后已采用对应时段 last 重算涨跌幅。",
  };
}
```
展示层按 `session` 标注"盘前/盘后/收盘"；`previousClose===price && changePercent===0` 时 UI 显示"—"而非 0.00%。同样的会话逻辑同步到 IBKR/Finnhub 归一化。

### A.3 修 9.4：市场综述去重 + 标题护栏 + 中文化
**改 `marketEditorialThemeSummary`（约 13309）。**
```js
function marketEditorialThemeSummary(items = []) {
  const useful = (items || [])
    .map((item) => ({ ...item, readDepth: item.readDepth || marketEditorialReadDepth(item) }))
    .filter((item) => ["body", "summary"].includes(item.readDepth))
    .filter((item) => item.summary && !marketEditorialLooksTitleOnly(item.summary, item));
  // 去重：同一篇/近重复只留一条（修"同句重复 3 遍"）
  const seen = new Set(); const deduped = [];
  for (const item of useful) {
    const fp = normalizeDisplayText(item.summary).toLowerCase().replace(/\s+/g, "").slice(0, 80);
    if (!fp || seen.has(fp)) continue;
    seen.add(fp); deduped.push(item);
  }
  if (!deduped.length) return marketEditorialInsufficientSummary(items); // 全塌缩=正文不足，不硬凑
  const lines = deduped.slice(0, 3).map((item) => {
    const raw = trimSentencePunctuation(item.summary);
    const text = looksLikeEnglishProse(raw) ? translateMarketTextToZh(raw) : raw; // 英文先中文化
    return `${item.source || "市场综述源"}：${text}。`;
  });
  return cleanHotNewsText(`市场综述要点：${lines.join(" ")}`).slice(0, 900);
}
```
`translateMarketTextToZh` 走现有 LLM/本地翻译；翻译失败则标"（英文原文，未翻译）"而非直接展示。

### A.4 §12 总结纪律："无料不展开"硬约束
**核心机制：先抽硬数字，无硬数字就不准生成 fact 句。** 在本地新闻摘要主路径（`normalizeReadableArticleSummary` / `articleFactSentence` 一带，约 10983）前置一个门：
```js
// 抽取层：把 EPS/营收/指引/百分比/价位/日期抽进 keyData
function extractHardNumbers(text = "") {
  const t = normalizeDisplayText(text);
  const hits = [];
  const re = /(\$?\d[\d,.]*\s?(?:%|bn|billion|million|m|亿|万|美元|美分|bps|点)|\bEPS\b[^。.;]{0,20}\d|guidance[^。.;]{0,30}\d|Q[1-4][^。.;]{0,20}\d)/gi;
  let m; while ((m = re.exec(t)) && hits.length < 8) hits.push(m[0].trim());
  return [...new Set(hits)];
}

function buildGroundedSummary(item) {
  const keyData = (item.article?.keyData?.length ? item.article.keyData : extractHardNumbers(item.article?.text || item.summary || item.title));
  if (!keyData.length) {
    // 无料：一行降级，禁止"原文没有披露…需要核验"三句脚手架
    return `${safeTicker(item.ticker) || ""}｜原文未含可核验数字，仅标题/泛叙述。`.trim();
  }
  const fact = `关键数据：${keyData.slice(0, 4).join("、")}。`;
  const soWhat = item.catalyst?.impactZh || "";        // 量化影响（有就给）
  const falsify = item.catalyst?.watchZh || "";        // 可证伪点（带价位/日期/字段）
  return normalizeDisplayText([fact, soWhat, falsify].filter(Boolean).join("")).slice(0, 360);
}
```
并加信息量分用于排序/门槛：
```js
function summaryInfoScore(s = "") {
  let score = 0;
  if (/\d/.test(s)) score += 40;                                   // 有数字
  if (/(因此|意味着|影响|利好|利空|压制|推动|改善|恶化)/.test(s)) score += 30; // 有 so-what
  if (/(若|如果|跌破|站上|低于|高于|看|确认|证伪|关注.*指引)/.test(s)) score += 20; // 可证伪点
  if (/(需要核验|不构成投资建议|属于市场解读|原文没有披露)/.test(s)) score -= 30; // 模板/废话扣分
  return Math.max(0, Math.min(100, score));
}
```
展示层只渲染 `summaryInfoScore >= 阈值` 的总结；低分直接折叠为"无有效信息"。

### A.5 §14.2 评测闭环（最小可跑）
**新增 `scripts/eval_summaries.mjs`，CI/手动可跑：**
```js
// node scripts/eval_summaries.mjs  → 读 data/store.json 最新 run，给每条总结打分并断言均值
import { readFileSync } from "node:fs";
const db = JSON.parse(readFileSync("data/store.json", "utf8"));
const run = db.runs?.[0]; const news = run?.news || [];
const score = (s = "") => { /* 同 summaryInfoScore */ };
const rows = news.map((n) => ({
  ticker: n.ticker,
  tickerMatch: ((n.summaryZh || "").match(/^([A-Z]{1,5})\b/)?.[1] || n.ticker) === n.ticker, // 9.1 回归
  siteShell: /^(yahoo|google news)/i.test(n.article?.title || ""),                            // 9.1 回归
  info: score(n.summaryZh || ""),
}));
const avgInfo = rows.reduce((a, r) => a + r.info, 0) / (rows.length || 1);
const matchRate = rows.filter((r) => r.tickerMatch).length / (rows.length || 1);
console.log({ avgInfo: avgInfo.toFixed(1), matchRate: (matchRate * 100).toFixed(0) + "%",
  shells: rows.filter((r) => r.siteShell).length });
// 断言（CI 失败即回退）
if (matchRate < 0.95) process.exit(1);   // 摘要张冠李戴
if (avgInfo < 45) process.exit(1);       // 总结信息量不达标
```
后续把 `tickerMatch / siteShell / avgInfo / 0%涨跌幅占比` 做成每轮自检指标，改 prompt/逻辑后对比，防止 §12/§13 的改造回退。

> 落地次序：**A.1 → A.4 → A.5**（先修 garbage-in，再上无料门槛，再用评测证明），随后 A.2/A.3 并行；§13 的 B3 diff 引擎与 A1 仓位建议在这些稳定后再做。

---

## 十五、双周期决策引擎：长期持有 + 1–2 周先盈利（核心方法论，待实现）

> 目标策略：**长期想拥有这家公司，但要求建仓后 1–2 周内大概率先转正**。核心张力——**好公司 ≠ 好买点**。所以系统要同时回答两个问题：①该不该长期拥有（标的资格）；②现在是不是 1–2 周大概率为正的进场点（择时与边际）。下面给出"大师视角需要的信息 + 决策逻辑 + 系统要产出的交易计划卡"，并标注系统现状（✅已有 / 🟡部分 / ❌缺→数据源）。

### 15.1 需要的信息（按决策分三层）

**第一层：该不该长期拥有（标的资格 / 估值）**
| 信息 | 用途 | 现状 |
|---|---|---|
| 商业质量：护城河、市占趋势、毛利率/ROIC/FCF 利润率、收入可持续性 | 是否值得长期拥有 | 🟡 有基本面，缺 ROIC/FCF/质量打分 |
| 长期赛道/TAM：是否处在多年结构性顺风（AI/电力/再工业化…） | 长期 beta 来源 | 🟡 行业链有，缺"赛道阶段"判断 |
| 财务健康：现金/负债、稀释 vs 回购 | 抗风险 | 🟡 部分 |
| 成长与盈利轨迹：营收增速、利润率方向、经营杠杆 | 趋势是改善还是恶化 | ✅ 部分有 |
| **盈利预期修正趋势**（分析师上修/下修） | **最强的中期领先信号** | ❌ 缺 → FMP/Zacks |
| 估值：vs 自身历史 + vs 同业（P/E、EV/EBIT、FCF yield、PEG） | 容错率、是否已透支 | 🟡 有 P/E 同业，缺历史分位/EV-EBIT/FCF yield |
| **预期差**：市场已 price-in 什么、什么会 surprise | 超额收益来源 | ❌ 缺（依赖预期数据） |
| 论点破坏条件：竞争、监管、客户集中、周期见顶 | 长期止损 | ❌ 缺（需结构化） |

**第二层：1–2 周大概率先盈利（择时 / 边际 / положing）**
| 信息 | 用途 | 现状 |
|---|---|---|
| 趋势上下文：是否在上升趋势、站于上升的 20/50 日线之上 | **不逆势**——顺势胜率高 | ✅ 有均线/趋势 |
| 进场位置形态：回踩支撑/上升均线、上升中超卖(RSI)、突破回踩、下跌过度均值回归 | **买在好价位**，决定 1–2 周赔率 | 🟡 有指标，缺"setup 识别" |
| 相对强度(RS)：近 1–3 月跑赢板块/大盘 | 强者恒强（短周期有效） | 🟡 factor 动量有，缺显式 RS |
| **窗口内催化日历**：财报日、产品/发布会、分析师日、宏观印数 | 知道两周内有什么事 → 借势或避雷 | ✅ 有日历，🟡 未绑进交易计划 |
| 持仓拥挤/燃料：做空比例(逼空)、看跌看涨比、**异常期权流(聪明钱)**、**Dealer Gamma/Pin 价位** | 短期助燃或风险；GEX 磁吸/钉扎位 | 🟡 有 GEX，❌ 缺做空比例→FINRA/Ortex，🟡 期权流弱 |
| 波动率(ATR)与流动性 | 止损/目标定标、可不可交易 | ✅ 有 ATR |
| 市场 regime：风险偏好、广度 | **风险关时不开多** | 🟡 大盘面板退化（见 9.3/14.6） |
| 已知资金流：指数再平衡、OpEx、月末 | 短期扰动 | ❌ 缺 |

**第三层：执行与风控（怎么下手、怎么管）**
| 信息 | 用途 | 现状 |
|---|---|---|
| 明确支撑/阻力与**止损位**（结构无效点 / N×ATR / 摆动低点） | 风险定义 | 🟡 keyLevels 有，缺止损口径 |
| **赔率**：到止损 vs 到阻力的目标，要 ≥ 2:1 | 只做不对称机会 | ❌ 缺（需计算） |
| 仓位：按波动率定 + 对窗口内二元事件缩仓 | 风险预算 | ❌ 缺 |
| 二段式计划：核心仓(长期) + 交易仓(波段) 拆分 | 既长期持有又锁短期盈利 | ❌ 缺 |
| 进场触发：站上 20 日线放量 / 支撑反弹 RSI 上拐 / 催化前漂移 | 不追、等确认 | ❌ 缺 |
| 减仓/止盈规则：波段仓到阻力或 +1–1.5ATR 或 RSI 超买分批了结，保留核心 | 先落袋短期利润 | ❌ 缺 |
| 财报处置：核心仓是否扛财报、波段仓财报前减 | 管理 gamma/二元风险 | ❌ 缺 |
| 复盘闭环：记录进场论点+无效点，按结果打分 | 可追责、可改进 | 🟡 有 journal/决策复盘骨架 |

### 15.2 决策逻辑（分层闸门 + 二段式建仓）
**按顺序过闸，任一不过则"等待/不做"，而不是硬给建议：**
1. **长期资格闸**：质量达标 **且** 估值可接受（历史分位不极端）**且** 盈利预期未被下修 **且** 论点未破 → 否则不进核心仓。
2. **趋势未破闸**：价格在上升/未跌破关键均线或结构 → 否则不做短期（好公司也等）。
3. **短期 setup 闸**：命中四类之一（回踩上升均线 / 上升中超卖 / 突破回踩 / 过度下跌均值回归）**且** 有明确支撑 **且** 动量/RS 配合 → 否则等更好价位。
4. **赔率闸**：到止损的风险 vs 到第一阻力的目标 ≥ 2:1 → 否则等回调或缩小波段仓。
5. **窗口风险闸**：market regime 支持 **且** 2 周内无不想要的二元事件（或已为其缩仓）→ 否则缩仓/延后。
6. **通过 → 输出二段式计划**：核心仓（按长期信心定）+ 波段仓（按短期 setup 定），含进场触发、止损、目标、减仓规则、可证伪点、总风险%。

> 关键原则：**长期决定"买什么"，短期决定"何时买、买多少波段仓"；核心仓的止损是论点破坏，波段仓的止损是技术无效点——两套止损分开管。**

### 15.3 系统要产出的 artifact：每标的"双周期交易计划卡"
```jsonc
{
  "ticker": "NVDA",
  "dataTrust": 0.86,                         // §14.1 闸门，低于阈值则只给"信息不足"
  "longTerm": {
    "thesisOneLine": "AI 加速计算的事实标准，受多年数据中心 capex 顺风",
    "qualityScore": 82, "secularStage": "扩张早-中期",
    "valuation": { "peVsHist": "高于 5 年中位", "evEbit": 38, "fcfYield": 1.8, "verdict": "偏贵但增长支撑" },
    "estimateRevision": "+ 近 90 天上修",     // ← 依赖 FMP/Zacks
    "expectationGap": "市场已 price-in 强增长；surprise 来自指引上修或毛利率",
    "thesisInvalidation": ["数据中心 capex 见顶", "竞争致毛利率 < X%"],
    "conviction": "高"
  },
  "swing": {
    "setupType": "pullback-in-uptrend",
    "trendContext": "20/50 日线多头排列，价在 20 日线上方",
    "relativeStrength": "近 1 月跑赢 SOX",
    "entryZone": [182, 186], "support": 180, "resistance": 198, "atr": 6.4,
    "stop": 178, "target": 196, "riskReward": 2.4,
    "catalystInWindow": { "event": "无财报；GTC 演讲", "date": "2026-07-02", "action": "可借势" },
    "positioning": { "socialHeat": "高", "shortInterest": "低", "optionsFlow": "看涨 sweep", "gammaPin": 190 },
    "regimeOK": true
  },
  "plan": {
    "coreSizePct": 6, "swingSizePct": 3, "totalRiskPct": 0.8,
    "entryTrigger": "回踩 184 不破 180 且 RSI 上拐放量",
    "scaleOut": ["196 减 1/3", "RSI>72 再减 1/3，保留核心"],
    "holdThroughEarnings": "核心扛、波段不参与", "expectedWindowReturn": "+4%~+7%"
  },
  "confidence": 74,                          // 由证据质量+同类设置历史胜率校准（非固定 100）
  "updatedAt": "..."
}
```

### 15.4 实现映射与优先级（接 §10–§14）
1. **先补数据缺口**：盈利预期修正/一致预期（FMP/Zacks，§10.2/C2）、做空比例（FINRA，§6.1）、估值历史分位（已有 AkShare 估值历史可算）、相对强度（用已有 K 线算）。
2. **加 setup 识别器**：在 `buildFactorLayer`/technical 之上加 `detectSwingSetup(technical)`，输出四类形态 + 支撑/阻力 + 止损 + 赔率（纯技术，已有 K 线即可做）。
3. **加 regime 闸**：修好大盘（9.3/14.6 + FRED），产出 `regimeOK` 布尔 + 理由。
4. **合成决策卡**：把 §13-A1/A2（仓位感知 + 可证伪论点）扩成上面的"双周期计划卡"，跑 15.2 的分层闸门，**任一不过输出"等待 + 缺什么"**。
5. **接 §14.1 信任闸 + §14.2 评测 + §13-A5 追责**：计划卡落库冻结，按 1–2 周与长期两个 horizon 分别打分，校准 `confidence`。

| 优先级 | 事项 | 依赖 |
|---|---|---|
| 🔴 | setup 识别器 + 赔率/止损（纯技术，零新数据） | 已有 K 线/ATR |
| 🔴 | 盈利预期修正接入（解锁长期资格闸 + 预期差） | FMP/Zacks |
| 🟠 | 双周期计划卡合成 + 分层闸门 | 上两项 + §13-A1/A2 |
| 🟠 | regime 闸（修大盘 + FRED） | 9.3/14.6 |
| 🟡 | 做空比例/期权流/资金流增强 + 追责校准 | FINRA/Ortex + §13-A5 |

> 一句话方法论：**长期资格筛"买什么"，技术 setup + regime + 赔率筛"何时买、买多少波段仓"，二段式建仓让你既长期持有、又用波段仓在 1–2 周内先把成本和情绪打正；每个结论都带止损、目标和可证伪点，并落库追责。**

---

## 十六、外部 Agent/Skill 接入评估：last30days-skill 与 TradingAgents

### 16.1 last30days-skill（`mvanhorn/last30days-skill`）——叙事/趋势研究引擎
- **它是什么**：一个 AI agent **skill**，给一个 topic（人/公司/产品/概念/`A vs B`），它自己并行抓 Reddit/HN/Polymarket/GitHub/Web（免费）+ X（浏览器 cookie）+ TikTok/IG/YouTube（ScrapeCreators key）最近 30 天内容，按社交信号排序，**合成一份带引用的叙事 brief（"What I learned" + 编号 KEY PATTERNS + 来源覆盖脚注）**。
- **关键事实（决定接入方向）**：
  - **不吃外部输入**——"我们的新闻接入它"这个方向**不成立**；它不 ingest 用户提供的新闻/文档，只接受 topic 然后自己抓。
  - 但**能 headless 跑**：`python3 scripts/last30days.py "{TOPIC}"`（`SETUP_COMPLETE=true`）→ 正好套本项目现有 Python bridge 模式（`openbb_bridge.py`/`akshare_bridge.py`/`xhs_search.py`）。
- **能不能接、怎么接**：✅ **能，但方向是反的——把它当成"按 ticker/主题调用的叙事研究源"，吃它的输出，而不是喂我们的新闻进去。**
  - 新增 `scripts/last30days_bridge.py` 包装 `python3 scripts/last30days.py "{TICKER} {公司名/主题}"` → 解析 brief + KEY PATTERNS → 作为新源 `last30days 30天叙事` 并入 `socialPosts`/新闻叙事层与"社交热议催化"解释。
  - **它正好补 §12/§13 的洞**：产出的是**有引用、按社交信号排序的叙事综合**——正是我们手写总结做不到的"故事在形成什么"。在"叙事/情绪面"上比现有社交管线更强。
- **要注意**：
  - 仍是**社交信号**（玩笑/炒作/操纵风险同我们现有社交源，进数据质量 caveat，不能当事实）。
  - **30 天滚动窗口**——适合叙事/情绪，不适合 §15 的 1–2 周择时（那要价量/技术）。
  - 全覆盖要 key/浏览器 session（X/YouTube/TikTok）；Reddit/HN/Polymarket/GitHub 免费即用。
  - 是 agent 驱动的合成（每 topic 有 LLM 成本/延迟）——按 watchlist + 热门主题**限量调用**，不要全市场扫。
  - 与现有 `collectSocialMedia`/`socialHotStocks` **功能重叠**——决定是增强（叙事层）还是替换（社交抓取层）。建议**增强**：用它做"叙事综合"，保留我们自己的结构化 ticker 归属与因子。
- **结论**：值得接，定位"个股/主题的 30 天叙事与情绪综合源"，喂进 §13-B 的每日叙事和社交催化解释；🟡 P1（叙事价值高、接入小，套现有 bridge）。

### 16.2 TradingAgents 能否替换现有 agent
- **它是什么**：Python/LangGraph 多智能体框架（分析师团队 基本面/情绪/新闻/技术 → 研究员 多空辩论 → 交易员 → 风控团队 → 组合经理），带 decision log 与 reflection；v0.3 加了 provider registry、FRED/Polymarket vendor、OpenAI 兼容端点。**自己抓数据**（Yahoo/Alpha Vantage/Finnhub/FRED）。
- **我们现在有两个"agent"**：① `all-stock-agent`（规则化买卖 skill，JS，全市场扫描漏斗）；② `agentDebate`（`trading-agents-lite-v1`，本地手写的 TradingAgents 仿制品，出中文"会议纪要"）。
- **能否替换**（分开看）：
  - ✅ **可以替换 `agentDebate`**：后者本就是 TradingAgents 的本地仿制；对**单股深度分析**（个股详情页/shortlist），跑真的 TradingAgents 严格更强。
  - ❌ **不应整体替换 `all-stock-agent` 扫描器**：每只票一轮完整多智能体辩论 = 大量 LLM 调用，**太慢太贵**，无法在定时任务里扫一个 universe（你们 `SCHEDULE_LLM_PROVIDER=local` 正是为躲 LLM 成本/超时）。保留便宜的规则扫描器作漏斗。
- **接入成本/取舍**：
  - **Python 服务/子进程**（bridge 模式），与单文件 Node 解耦；按 ticker 调用、吃回 决策 + 辩论纪要。
  - **数据层冲突**：它默认自己抓 Yahoo/AlphaVantage/Finnhub → 与我们重复，且**看不到我们已采集的 Longbridge/IBKR/OpenBB/期权/社交** richness。要么 (a) 接受它自抓（丢我们的数据优势），要么 (b) **写自定义 data vendor adapter 让它消费我们的数据**（有工作量，但保住我们的边际）。推荐 (b)。
  - 开箱**不做**组合级/仓位感知/§15 双周期择时——这些仍要我们在外层包。
- **结论 / 推荐架构（漏斗式）**：
  1. **便宜的 `all-stock-agent` 规则扫描** → 出 shortlist（漏斗，保留）。
  2. **last30days** → 给 shortlist 的 ticker/主题做 30 天叙事/情绪层。
  3. **TradingAgents（喂我们的数据）** → 只对 shortlist 做 top-N **深度多智能体决策**，替换 `agentDebate`。
  4. **§15 双周期引擎 + §14 信任/追责** 在最外层把上面三者合成"交易计划卡"并落库打分。
- **优先级**：🟡 P2——价值高但工程量大（Python 服务 + 数据 adapter + 成本控制）；建议**先把它作为 shortlist 深度分析替换 `agentDebate`**，验证质量与成本后再扩。**别在全市场扫描上跑它。**

> 一句话：**last30days 当"叙事研究源"接进来（反向：调用它、吃输出，不喂新闻进去），P1 小投入；TradingAgents 用来替换深度辩论那一层（agentDebate），喂我们自己的数据、只跑 shortlist，P2；两者嵌进"规则漏斗 → 叙事 → 深度决策 → 双周期计划卡"的管线，而不是各自孤立。**

### 16.3 agent-reach（`Panniantong/Agent-Reach`）——统一社交抓取层（最契合"社交热点"）
- **它是什么**：一个零 API 费的 CLI + **统一 MCP server**，给 agent 统一访问 **16+ 平台**：Twitter/X、Reddit、YouTube、GitHub、**Bilibili、小红书、抖音、微博、微信公众号、雪球(Xueqiu)、LinkedIn、Instagram、V2EX、Xiaoyuzhou 播客、RSS、Exa 搜索、任意 URL**；每个渠道用 cookie 鉴权 / 公开抓取 / 免费 MCP（Exa、Jina Reader），**不需要付费 key**。`pip install agent-reach && agent-reach install`。
- **能不能用作社交热点的一部分**：✅ **能，而且比 last30days 更契合"社交热点"这一层**——它是**原始抓取器（raw fetcher）**，吐出帖子/搜索/timeline，正好喂进现有 `collectSocialMedia → socialPosts → socialHotStocks` 的**提及计数 / 情绪 / 热度评分 / ticker 归属**流水线；而 last30days 是**合成器**（给成品叙事 brief）。两者互补：**agent-reach = 原料（社交热度层），last30days = 叙事综合层**。
- **为什么对本项目价值大**：
  1. **零成本解掉 §2.1 的缺 key 痛点**：当前 `X_BEARER_TOKEN`、`XHS_COOKIE` 实测缺失、Nitter 关闭——agent-reach 用 cookie/抓取**免费复活 X 和小红书**。
  2. **新增中文股民社交**：**雪球、微博、小红书、抖音、B站**——对一个中文界面的美股产品，雪球/微博的美股讨论是直接相关的高价值热点源，现在完全没有。
  3. **简化**：可**替换项目里多个脆弱的一次性适配器**（Reddit/X/Nitter/XHS 各写一套）为一个统一工具。
  4. **接法贴合现状**：它既是 CLI（套现有 Python bridge：`agent-reach <platform> search ...`），也暴露 **MCP server**（呼应 §10.4"消费外部 MCP"）。
- **要注意（与现有社交源同源的风险，需配合修复）**：
  - cookie/抓取 → **脆弱、限流、反爬/ToS 风险**，cookie 会过期（同 XHS/Nitter 的已知问题，进数据质量 caveat）。
  - **放大 §1.5 的 ticker 误判**：原始社交量一上来，"ALL/ON/OPEN 被当个股"会更严重 → **接 agent-reach 前/同时必须先上金融 NER（§11.2）**，否则热点池被噪音污染。
  - 仍是社交信号（玩笑/炒作/操纵），只作"讨论密度/情绪"线索，不当事实。
- **接法建议**：新增 `scripts/agent_reach_bridge.py`（或直接消费其 MCP），按 watchlist + 热议 ticker/关键词调用 X/Reddit/雪球/微博/小红书 → 统一进 `socialPosts`，复用现有热度评分；**雪球/微博作为中文美股社交新增板块**。
- **结论 / 优先级**：✅ **强烈建议作为统一社交抓取层**，定位"社交热点的原料源"，**先修 §1.5 ticker 归属再放量**。🟠 P1（直接补 §2.1 缺 key + 加中文股民社交 + 简化多适配器，投入中等）。

> **三者分工**：`agent-reach`＝**原始多平台社交抓取**（喂社交热度层，补 X/雪球/微博/小红书）→ `last30days`＝**30 天叙事/情绪综合**（喂每日叙事）→ `TradingAgents`＝**shortlist 深度多智能体决策**（替 agentDebate）。原料→叙事→决策三段，分别接在"规则漏斗 → 双周期计划卡"管线的不同位置。

### 16.4 scientific-agent-skills（`K-Dense-AI/scientific-agent-skills`）——大部分不相关，少量值得摘用
- **它是什么**：面向**科学家**的 Agent Skills 库（140+ skill：生物/化学/医药/药物发现 + 100+ 科研数据库 PubChem/ChEMBL/UniProt/PDB…）。兼容 Codex/Claude Code/Antigravity（你当前 `LLM_PROVIDER=antigravity-cli` 正好在生态内）。
- **整体判断**：❌ **不要整库接**——主体（RDKit/Scanpy/BioPython + 78 个生物数据库）与美股投研无关。
- **但有几个金融/宏观 skill 值得 cherry-pick**（它库里确有"Scientific & Financial Databases"）：
  1. **FRED skill**（✅ 高价值）——provenance-rich 的宏观源，正好是 §6.1/§10/§14.6 反复要的利率/收益率/信用利差/CPI；可直接补**现状全是 0.00% 的宏观/利率面板**（§9 macro、9.3 旁证）。
  2. **U.S. Treasury Fiscal Data / 收益率**（✅ 相关）——补美债收益率曲线，修 `ratesSummary: 2Y 0.00%/10Y 0.00%` 的空数据。
  3. **ClinicalTrials.gov skill**（🟡 看 universe）——**若池子含 biotech/pharma**，临床试验状态/读出是重大催化源，现有完全没有；不含生物医药票则跳过。
  4. **USPTO 专利**（🟢 可选 alt-data）——按公司专利活动做创新度信号，niche。
- **接法**：只装需要的那几个 skill（开放 Agent Skills 标准，filesystem markdown + code），或把其数据库访问代码抽出来走 bridge；**不要把整库 140 个 skill 拉进上下文**。
- **结论 / 优先级**：🟡 **只摘 FRED + Treasury 两个补宏观**（与 §14.6 跨资产 regime 合并做），ClinicalTrials.gov 视是否覆盖生物医药票再定；其余忽略。比起 §16.1–16.3 三个，这个对本项目的相关面小得多。

> 16.1–16.4 小结：**强相关**＝agent-reach（社交原料）、last30days（叙事）、TradingAgents（深度决策）；**弱相关、只摘零件**＝scientific-agent-skills（仅 FRED/Treasury/可选 ClinicalTrials）。判断标准始终是"它落在我们哪一段管线、补的是不是真缺口"，而不是 star 数。

### 16.5 Vibe-Trading / FinceptTerminal / qlib——不是"组件"，是三种不同的整体关系
> 关键区分：16.1–16.4 是**能插进我们管线的组件**；下面这三个分别是**整套竞品平台 / 整个桌面终端 / 离线量化大脑**，集成模型完全不同——别当组件硬接。

**① Vibe-Trading（注意：多个同名仓库；主力 `HKUDS/Vibe-Trading` 11.3k★）**
- **是什么**：HKUDS（港大数据智能实验室）的 **agent-native 投研框架**——自然语言提问 → 机构级分析 + 回测 + 多市场数据 + AI swarm，暴露 **54 个 MCP 工具**，可选经授权券商（Robinhood Agentic）自主下单。同实验室还有 `HKUDS/AI-Trader`。
- **与本项目的关系**：⚠️ **它基本就是"本项目想成为的东西"的另一种实现**——不是组件，是**平行竞品/可选底座**。两条路：(a) 当**参考架构**学它的 agent 编排与 MCP 工具划分；(b) 严肃评估"继续堆 32k 行 Node 单文件 vs 以它为底座重构"。
- **判断**：作为**架构参照**很有价值（尤其它的 54 MCP 工具拆分、NL→分析→回测闭环）；作为**整体替换**是个大决策，需权衡迁移成本与你已有的多源数据/中文叙事资产。**自主下单**超出当前 scope（默认研究、不持有资金）。🟡 先当参考，不急着接。

**② FinceptTerminal（`Fincept-Corporation/FinceptTerminal`）**
- **是什么**：开源 **Bloomberg 替代桌面终端**（C++20/Qt6 原生 + 内嵌 Python）：100+ 数据连接器、DCF/组合优化/风险(VaR/Sharpe)/衍生品定价、50+ 技术指标、16 个券商接入、实时流、GenAI 研究助手、**37 个 agent（Buffett/Graham/Lynch/Munger/Klarman/Marks 投资人 persona + 经济 + 地缘）**、多 LLM + Ollama。
- **与本项目的关系**：它是**整个桌面应用**，C++/Qt——**无法嵌进你的 Node web 栈**。只能**借鉴/摘 Python 模块**，不能集成。
- **可借鉴点**：**投资人 persona agent 框架**（Buffett/Graham/Lynch…）正好对应你已有的 `investmentStyleScorecard`（已含"巴菲特质量复利"风格）——它的 37-agent persona 是更丰富的参照；DCF/VaR/风险指标可作 §11.8 的口径参照。
- **⚠️ 重要风险**：截至 2026-06 **因资金问题转为每月 1 更、不再日常维护**，团队转向付费私有版与新项目 Quantcept；且 **AGPL-3.0**（强 copyleft，分发时有传染性）。**不建议押注依赖它**；只当 persona/指标的灵感来源。🟢 仅参考。

**③ qlib（`microsoft/qlib` + `microsoft/RD-Agent`）**（已在 §7.1/§8 评过，补最新）
- **新进展**：**RD-Agent / R&D-Agent(Q)**——LLM 自主 agent 自动化整条量化研发闭环（Specification→Synthesis→Implementation→Validation→Analysis），**从财报自动挖因子**、因子+模型联合优化；实测 IC 0.0532、年化 14.21%、IR 1.74，**整轮优化 API 成本 < $10**；现默认 LiteLLM 后端。
- **与本项目的关系**：它是**离线量化/ML 选股大脑**，不是 live web 组件。正确用法（同 §8）：**离线**跑 qlib/RD-Agent 训练+验证排序模型与因子 → 把"赢的因子 / 排序结果"**喂回**线上 `factorLayer`；RD-Agent 用来**离线发现/验证因子**，比你现在手调因子权重 + all-stock-agent 规则自调高一个量级。
- **前置条件**：⚠️ **必须先有 point-in-time 数据底座（§8.1/§15.1）**，否则 qlib 学到的是泄漏/有偏的数据，结论不可用。
- **判断**：✅ **"选股大脑"的金标准参照，最高价值、最高工程量**；离线借其输出，别在 Node app 里跑 live；**先补 PIT 数据再上**。🟡 P2，是 §8 ML 路线的落地工具。

> 16.5 小结（集成模型）：**Vibe-Trading＝平行竞品/可选底座（先当架构参考）；FinceptTerminal＝桌面终端（只借 persona/指标灵感，别依赖，维护在衰减）；qlib/RD-Agent＝离线选股大脑（离线训练、喂回因子，先要 PIT 数据）。** 三者都不是"接进来就用"的组件——和 agent-reach/last30days/TradingAgents 的角色要分清。

---

## 十七、从这些项目"拿过来"的设计（borrowed designs，落地清单）

> 不接整库，只把**值得偷的具体机制**抽出来落到本项目。每条：借鉴点 / 来源 / 怎么落地（映射现有代码） / 修哪个缺口 / 优先级。

### 17.1 反向 DCF＝严格的"预期差"工具（来源：FinceptTerminal 的 DCF）—— 🔴 高价值且零新数据
当前价**反推**市场隐含的增长，与分析师/历史增速比，就是 §13-A3/§15 要的"预期差"，而且**只用我们已有的基本面，不必等 FMP**：
```js
function impliedGrowthFromPrice({ price, fcfPerShare, discountRate = 0.09, terminalGrowth = 0.025, years = 10 }) {
  const dcf = (g) => {
    let pv = 0, fcf = fcfPerShare;
    for (let t = 1; t <= years; t++) { fcf *= (1 + g); pv += fcf / (1 + discountRate) ** t; }
    const terminal = (fcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
    return pv + terminal / (1 + discountRate) ** years;
  };
  let lo = -0.1, hi = 0.6;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; (dcf(mid) > price ? hi : lo) = mid; } // 二分
  return (lo + hi) / 2; // 市场隐含的 10 年 FCF 增速
}
// 预期差：隐含增速 vs 分析师一致增速（有 FMP 用 FMP，没有先用历史营收增速近似）
// 隐含 > 预期 → 估值已透支（看空边际）；隐含 < 预期 → 有重估空间
```
即使没有一致预期，一句"**市场已 price-in 未来 10 年 FCF 增速 18%**"本身就是可解释、可决策的。落到 `decisionDashboard`/计划卡的 `expectationGap`。修：§13-A3、§15 第一层"预期差"缺口。

### 17.2 投资人 persona 多镜评分（来源：FinceptTerminal 37-agent persona）—— 🔴 低成本、扩现有功能
你已有 `investmentStyleScorecard`（含"巴菲特质量复利"）。把它扩成多位传奇投资人的**确定性评分镜**，输出"现在哪些大师看得上这只票 + 各自一句理由 + 共识/分歧"：
```js
const peg = (f) => (f.peTTM && f.revenueGrowthTTMYoy > 0) ? f.peTTM / f.revenueGrowthTTMYoy : null;
const INVESTOR_PERSONAS = {
  graham:  { name: "格雷厄姆·安全边际", lens: "低估值+低负债", test: (f) => f.peTTM < 15 && f.pbAnnual < 1.5 && f.debtAssetsRatio < 0.5 },
  lynch:   { name: "林奇·合理价成长",   lens: "PEG<1.5 的成长", test: (f) => peg(f) > 0 && peg(f) < 1.5 },
  buffett: { name: "巴菲特·质量复利",   lens: "高利润率+高ROE", test: (f) => f.netProfitMarginTTM > 0.2 && f.roeTTM > 0.15 },
  munger:  { name: "芒格·优质护城河",   lens: "高ROIC+定价权",  test: (f) => f.roeTTM > 0.18 && f.netProfitMarginTTM > 0.25 },
  klarman: { name: "克拉曼·下行保护",   lens: "现金充裕+低杠杆", test: (f) => f.debtAssetsRatio < 0.4 },
  marks:   { name: "马克斯·周期与风险", lens: "周期位置+风险补偿", test: (f) => f.peTTM > 0 && f.peTTM < 25 },
};
// 输出：likedBy=[buffett,munger], 共识强 → 质量派认可；分歧（价值派不看、成长派看）也显式标
```
修：让"投资风格"从单一最佳拟合升级为多镜共识/分歧，决策更立体。

### 17.3 跨源"故事聚合" + 严格输出契约（来源：last30days）—— 🔴 直接修 §12/§13-B1
last30days 的两个核心设计：①**把跨平台相关信号聚成一个 story**（GitHub trending + HN 讨论 = 一条，不是两条）；②**固定输出契约**（"What I learned" 综述 + 编号 KEY PATTERNS + 来源覆盖脚注）。拿过来：
- 在 `combinedNews + socialPosts` 上按 ticker+主题做**事件聚类**（用 §11.3 的 MinHash/句向量），每个 ticker 当日产出 **1 个"今日故事"对象**：`{ headline, whatHappened, keyPatterns[], consensus, disagreement, sources[] }`，替掉 40 张孤立卡片。
- 每日大盘/个股叙事强制走这个契约：综述 + 编号要点 + 出处，**无要点就明说"无"**（接 §12 信息量门槛）。修：§12 墙式卡片、§13-B1 连贯叙事。

### 17.4 社交按真实互动相对排序 + 共识/分歧（来源：last30days）—— 🟠 修热度饱和
当前 `socialHotStocks` 前 11 名全 100。借 last30days 的"互相打分、按真实互动排序"：把热度改成**横截面相对分位**（mentions/upvotes/comments 的 z-score），并显式拆**看多 vs 看空**两侧，而不是一个饱和的 100。修：§9 社交分饱和。

### 17.5 预测市场概率作前瞻信号（来源：last30days 的 Polymarket）—— 🟡 新前瞻信号
接 Polymarket/Kalshi 的事件赔率（Fed 决议、CPI 超预期、个股财报 beat 概率）作**校准过的前瞻概率**，喂 regime 闸（§15）与事件日历。市场用真金下注的概率，比新闻情绪更硬。

### 17.6 辩论→交易员→风控→PM 的"收敛图" + reflection（来源：TradingAgents）—— 🟠 修 agentDebate 止于"继续跟踪"
- 把 `agentDebate` 从"并行各说一个 stance"改成 TradingAgents 的**收敛图**：分析师 → 多空辩论 → **交易员出决策** → **风控多视角(激进/保守)辩仓位** → **组合经理定 size**，**必须收敛到 决策+仓位+止损**。
- 偷它的 **reflection**：决策落库后，结果已知时让 agent **复盘"哪里判错"并更新**——把 all-stock-agent 现在"粗调规则权重"升级成"带理由的反思学习"。修：§13-A2 收敛、A5/C1 追责与演进。

### 17.7 RD-Agent 因子研发闭环 + IC 目标 + Alpha 因子表（来源：qlib/RD-Agent）—— 🟡 离线大脑，先要 PIT
- 偷 RD-Agent 的**五段闭环**（提议→实现→回测→分析→调度）做一个**夜间离线因子研究 job**：LLM 提因子 → 回测算 **IC/ICIR** → 留正 IC、退负 IC，把赢的因子**喂回**线上 `factorLayer`，替代手调权重。
- 直接**移植 qlib 的 Alpha158/Alpha360 因子表达式**（动量/波动/量价/相关性，有现成公式）进 `scoreTickerFactors`。前置：§8.1 PIT 数据。修：§8 ML 路线、§14.2 用 IC 度量因子。

### 17.8 统一社交源接口 + 雪球/微博 + YouTube 转录（来源：agent-reach）—— 🟠 见 §16.3
把 N 个脆弱适配器重构成**一个 `socialSource` 接口**（search/read/timeline/transcript）；新增**雪球/微博**中文股民社交；用**转录**替 YouTube 的"只有标题"（真内容才可摘）。修：§2.1 缺 key、§1.1 真内容。

### 17.9 全量 provenance / 一键溯源（来源：scientific-skills + agent-reach 的 deterministic+citation）—— 🟠 见 §14.7
偷"每个数据点带来源+时间戳、确定性可复现"的做法：我们每个数字/论断都挂 `{source, fetchedAt, url}`，前台一键回源。修：§14.7、§14.1 信任闸的展示面。

### 17.10 采集层 MCP 工具化（来源：Vibe-Trading 的 54 MCP 工具）—— 🟡 见 §10.4
把现有 collectors 暴露为 MCP 工具集，既可被 Codex/Claude 复用，也为以后"以 agent 框架为底座"留接口。

### 借来设计的优先级
| 优先级 | 拿过来的设计 | 为什么先做 |
|---|---|---|
| 🔴 | 17.1 反向 DCF 预期差 | **零新数据**就解锁"建议"的核心——预期差 |
| 🔴 | 17.2 persona 多镜评分 | 扩现有功能、确定性、低成本、立体化判断 |
| 🔴 | 17.3 故事聚合 + 输出契约 | 直接修 §12 墙式无价值卡片、§13-B1 叙事 |
| 🟠 | 17.6 收敛图 + reflection | 让 agentDebate 收敛到决策、自学习 |
| 🟠 | 17.4 社交相对排序 / 17.8 统一社交+雪球 / 17.9 溯源 | 修热度饱和、社交缺口、信任 |
| 🟡 | 17.5 预测市场 / 17.7 RD-Agent 因子 / 17.10 MCP 化 | 新信号 / 离线大脑（先 PIT） / 生态 |

> 一句话：**这些项目最值钱的不是"接进来"，是它们的设计——反向 DCF（预期差）、persona 多镜（立体判断）、故事聚合+输出契约（杀掉墙式废话）、收敛图+reflection（决策与自学习）、RD-Agent 因子闭环（离线大脑）。其中 17.1/17.2/17.3 零或低新依赖，应最先拿过来。**
