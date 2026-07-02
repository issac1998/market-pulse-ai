# Market Pulse AI 改进计划执行清单

执行日期：2026-06-27

## 已执行

1. 公司新闻兜底
   - 修复 `COMPANY_NEWS_EXTRA_SOURCES_ENABLED=false` 时公司新闻整段短路的问题。
   - 现在 Longbridge 单票新闻低于阈值时，会自动启用 Finnhub/Yahoo fallback。
   - 新增 `COMPANY_NEWS_MIN_LONG_BRIDGE_PER_TICKER`，默认每票至少 2 条 Longbridge 新闻，否则补抓。

2. 新闻时间准确性
   - 新增 `collectedAt` 语义，缺失真实发布时间时 `publishedAt=null`，不再伪装成当前时间。
   - 修复 Hot News、IBKR Portal 导入、OpenBB 日期、市场综述等多处 `publishedAt || nowIso()`。
   - 前端 `fmtTime()` 和排序逻辑已容错非法时间，缺失时间显示为 `-`。

3. 新闻去重
   - 新增统一 `newsDedupeKey()`：规范化 Google/Finnhub 代理 URL、域名路径和标题指纹。
   - 主新闻合并、公司新闻、GDELT 热闻使用统一去重，减少重复和误合并。

4. 新闻相关性分类
   - `withNewsRelevanceForItems()` 已注入 SEC company ticker map 和 fundamentals map。
   - 修复相关性分类时 `companyMap` 实际为空的问题。

5. 社交 ticker 误判
   - `extractTickerMentions()` 对非 `$cashtag` 的 1-3 位高歧义 ticker 增加金融上下文要求。
   - 降低 `ALL/ON/IT/NOW/CASH` 等普通英文词误判为股票的概率。

6. GDELT 热闻源
   - 接入 GDELT DOC 2.0 作为无 key 热闻召回源。
   - 新增 `HOT_NEWS_GDELT_ENABLED`、`HOT_NEWS_GDELT_QUERY`、`HOT_NEWS_GDELT_LIMIT`、`HOT_NEWS_GDELT_TIMEOUT_MS`。
   - 新增 GDELT 专用 6 秒节流和限流重试。
   - 已加入配置中心和源诊断。

7. Provider 诊断
   - 数据质量/配置详情新增 GDELT、Nasdaq security master、Finnhub fallback 说明。
   - 配置中心新增 GDELT 字段。
   - Hot News API 源开关现在包含 Alpha Vantage、NewsAPI、Polygon/Massive、GDELT。

8. 主报告预抓配置
   - 本地 `.env` 已打开：
     - `REPORT_OPTIONS_CHAIN_ENABLED=true`
     - `REPORT_SEC_EDGAR_ENABLED=true`
     - `REPORT_OPENBB_ENABLED=true`
   - 本地 `.env` 已把定时 LLM 从 `local` 改为 `antigravity-cli`。
   - 说明：`.env` 被 git 忽略，这属于本机运行配置，不会进入提交。

9. 交易复盘
   - FIFO 撮合支持空头开仓和买回补。
   - `buy` 会优先覆盖已有 short lots；`sell` 在无 long lots 时会开 short lot。
   - 已增加除零保护。

10. Store 性能
   - `ensureStore()` 新增进程内缓存和 mtime 失效检查。
   - `saveStore()` 写入成功后刷新缓存。
   - 未改变 `data/store.json` 格式。

11. 候选池 Agent
   - 接入 Nasdaq Trader Symbol Directory 缓存，用于过滤 ETF/测试标的。
   - 常见 ETF/指数代理加入静态黑名单。
   - UI 从“全市场 Agent”改为“候选池 Agent”，避免误导。
   - Skill 增加最低买入价、K线/均线、基本面硬门槛。
   - 补位买入候选不再硬凑，必须同时满足价格、趋势、证据和置信度要求。

12. 新闻正文壳页与缓存污染
   - 新增文章 URL 可用性判断，`www.yahoo.com`、`finance.yahoo.com` 根页、Google News RSS 代理页、同意墙不再作为正文缓存键。
   - `applyCachedArticle()`、`extractArticleForNews()`、`cacheArticleItem()` 三处同时拦截站点壳页，避免一篇错误正文污染多个 ticker。
   - `normalizeArticleCache()` 会丢弃历史壳页缓存，后续采集不会继续命中这些缓存。
   - 旧 run 在客户端出口会把已保存的壳页正文降级为 `source-limited`，不再展示张冠李戴摘要。

13. 本地标题兜底
   - 本地/翻译失败模式下，`titleZh` 回退为原始标题或轻量词汇替换，不再用“疑似财报/指引新闻，当前未提取收入、EPS...”这类催化模板占位。
   - `newsItemForClient()` 会净化旧 run 中已经持久化的模板标题。

14. Longbridge 盘前/盘后报价
   - `normalizeLongBridgeQuote()` 增加会话感知：当常规盘 `last==prev_close` 且涨跌为 0 时，优先使用 `pre_market.last` / `post_market.last` 并重算涨跌幅。
   - 返回 `session`、`sessionLabel`、`regularLast`、`changePercentUnavailable`。
   - 旧 run 中已经保存的 Longbridge “昨收=现价、涨跌 0%”报价，在客户端出口标记为“无当日变动数据”，不再显示为有效 0%。

15. 市场编辑综述
   - `marketEditorialThemeSummary()` 增加摘要指纹去重、标题级内容过滤和英文标题护栏。
   - 只读到 Yahoo/Google 壳页或重复标题时，输出“正文不足，不能据此归因”，不再展示重复英文标题。
   - `marketOverviewForClient()` 会净化旧 run 的 `editorialBriefText` 和 `notes`。

16. 总结信息密度
   - `buildReadableArticleSummary()` 改为“无关键事实不展开投资结论”。
   - 有事实但无硬数字时，只短句说明可核验事实和数字缺口，不再拼接三段式模板。

17. 评测脚本
   - 新增 `scripts/eval_summaries.mjs`。
   - 默认报告站点壳正文、模板标题、摘要 ticker 错配、Longbridge 零变动报价；`--strict` 可用于 CI 阻断。
   - 2026-06-27 增强：
     - 支持 `--api` 读取运行中的 `/api/state`，用于评估页面实际出口数据，而不只评估原始 `store.json`。
     - 新增 `summaryInfoScore`，统计摘要是否包含数字、so-what 和可证伪观察点。
     - 区分 `Shell articles` 与 `Active shell articles`：已降级为 `source-limited` 的壳页不会被当作仍在展示的壳页回归。
     - 支持 `--min-info=`、`--min-match=` 调整严格阈值。
   - 2026-06-27 二次增强：
     - 页面出口会把低信息、模板化长摘要降级为空，保留更结构化的“事实/影响/核验”brief。
     - `eval_summaries.mjs --api` 会按页面真实展示优先评估 brief，避免旧长摘要掩盖可读信息。

18. LLM 路由
   - 本地 `.env` 保持轻任务为 `gemini-3.1-flash-lite`。
   - `ANTIGRAVITY_CLI_MODEL_REASONING/HEAVY`、`GEMINI_CLI_MODEL_REASONING/HEAVY`、`GEMINI_MODEL_REASONING/HEAVY` 改为 `gemini-3.1-pro-preview`，用于复杂投资建议/多维分析。

19. Google News RSS 原文解析
   - 新增 `resolveGoogleNewsArticleUrl()`：先读取 Google News 文章页的 `data-n-a-id`、`data-n-a-ts`、`data-n-a-sg`，再调用 `Fbv4je/garturlreq` batchexecute 获取真实发布方 URL。
   - `resolveOriginalArticleUrl()` 调整顺序：Google News RSS 先解码，Finnhub 再看跳转，最后才标题搜索反查。
   - 新增配置：
     - `GOOGLE_NEWS_DECODE_ENABLED=true`
     - `GOOGLE_NEWS_DECODE_TIMEOUT_MS=15000`
   - 已同步 `.env.example` 和 `README.md`。

20. 投资建议增强
   - 新增反向 DCF/预期差模块：用价格和 EPS 代理 FCF，反推当前价格隐含的 10 年每股盈利/现金流增长要求。
   - 投资建议 Agent 新增“预期差/反向DCF”评分块；当隐含增长要求偏高且原始动作为买入时，风控闸门会把动作压到持有。
   - 前端投资建议卡片新增“预期差/反向 DCF”区块，展示隐含增长、参考增长、差值和中文解释。
   - 投资流派评分卡扩展为多 persona 评分镜：格雷厄姆、巴菲特、林奇、芒格、克拉曼、霍华德·马克斯、达摩达兰、成长/动量、宏观、情绪/事件。
   - 前端流派评分卡展示“认可/观察”的 persona 共识，减少只看单一风格分数的问题。

## 部分执行

1. GDELT
   - 诊断接口已验证通过，返回 3 条样本。
   - 手工 curl 曾触发 GDELT 公共限流提示；代码已加入节流和一次重试。

2. OpenBB
   - `/api/openbb/probe` 验证 Python backend 正常。
   - Rest backend 未配置 `OPENBB_REST_BASE_URL`，保持 disabled。

3. IBKR
   - `/api/ibkr/socket-smoke-test` 返回 warn。
   - 当前 127.0.0.1:4001/4002/7497/7496/4000 均未监听，未检测到可用 IB Gateway/TWS 进程。
   - 结论：代码侧已接入，但本机 IB Gateway 当前未开放 Socket，行情/期权/账户无法通过 IBKR 拉取。

4. 外部 Provider smoke test
   - AkShare 正常：估值、K线、中文新闻、全球新闻、美债收益率接口可用。
   - AkShare 全球新闻正常：筛选到美股/全球/日韩相关新闻。
   - Alpha Vantage、NewsAPI、Polygon/Massive 缺 key。
   - TrendRadar/NewsNow 公共实例被错误页/限流拦截。

## 未执行或延后

1. SQLite 迁移
   - 合理，但风险和改动面较大。
   - 本轮先实现内存缓存；后续建议把 runs/articles/social 拆表或分片。

2. 自动化测试体系
   - 合理，但需要先拆出纯函数模块。
   - 本轮只做语法检查、API smoke test 和浏览器验证。

3. 美股交易日历/节假日
   - 合理，未在本轮实现。
   - 建议后续接入 `date-holidays` 或 NYSE 官方日历，并在 `maybeRunSchedule()` 跳过非交易日/半日市。

4. Provider order 全量清理
   - 本轮未删除 provider order 中的不可用项。
   - 原因：这些项在补 key 后仍可用，直接删除会降低可配置性；目前通过诊断面板暴露缺 key/限流状态。

## 验证结果

- `node --check server.mjs`：通过。
- `node --check public/app.js`：通过。
- 浏览器控制打开 `http://localhost:5173/`：通过。
  - 页面标题：`Market Pulse AI`
  - 操作建议按钮：`运行候选池 Agent`
  - 浏览器控制台错误：0 条。
- `/api/state`：通过。
- `/api/env-config`：已包含 GDELT 字段。
- `/api/source-diagnostics?keys=gdelt-hot-news&ignoreDisabled=true`：GDELT ok，返回 3 条样本。
- `/api/openbb/probe`：OpenBB Python backend ok。
- `/api/ibkr/socket-smoke-test`：warn，IBKR Socket 未监听。
- `/api/external-provider-smoke-test`：warn；AkShare ok，AlphaVantage/NewsAPI/Polygon 缺 key，TrendRadar 被拦截。
- `/api/all-stock-agent/run`：通过；当前严格门槛下买入候选为 0，避免低价/缺数据票进入买入列表。
- `node --check server.mjs`：新增补丁后通过。
- `node --check scripts/eval_summaries.mjs`：通过。
- `node scripts/eval_summaries.mjs`：历史原始 run 仍暴露旧问题（壳页 34/40、模板标题 35/40、摘要错配 29/40、零变动报价 66/66），作为采集后回归基线。
- `/api/state`：客户端出口已净化旧 run：
  - 模板标题：0
  - 壳页 article title：0
  - 壳页正文降级 `source-limited`：34
  - 市场编辑综述：降级为“正文不足，不能据此判断大盘原因”
  - Longbridge 旧零变动报价：`changePercent=null`、`changePercentUnavailable=true`
- 应用内浏览器验证 `http://localhost:5173/`：页面标题 `Market Pulse AI`，控制台 error 0 条，未出现旧模板标题或重复英文综述。
- Google News 解码烟测：
  - 输入旧报告中的 Google News RSS `NEO` 链接。
  - 成功解码到 `https://stockstory.org/us/stocks/nasdaq/neo/news/earnings/a-look-back-at-testing-and-diagnostics-services-stocks-q1-earnings-neogenomics-nasdaqneo-vs-the-rest-of-the-pack`。
  - `scripts/article_extractor.py` 对该真实 URL 抽取成功：`status=ok`、`textChars=7034`、`extractor=stdlib-fallback`。
- `node scripts/eval_summaries.mjs --api --strict --min-info=0`：通过。
  - 页面出口 active shell articles 为 0，模板标题 0，ticker 错配 0，未降级的 0% 报价 0。
- `node scripts/eval_summaries.mjs --api --strict`：失败，原因是当前最新 run 仍是旧报告，6 条可评分摘要平均信息量 23.3，低于默认阈值 45。
  - 结论：展示层回归已挡住；摘要信息密度仍需下一轮真实正文采集 + LLM 摘要改善。
- `node --check server.mjs`：通过。
- `node --check public/app.js`：通过。
- `/api/investment-advice`，AAPL，`llmProvider=local`：通过。
  - 返回 `expectationGap.status=ok`。
  - 示例结果：当前价格用 EPS 代理现金流反推，约需要未来 10 年每年 32.0% 的增长；比现有增长参考高 10.2 个百分点。
  - 原始动作为买入，但因“估值预期偏高”和“仓位集中”风控闸门，最终动作压到持有；仓位文案同步为“不新增仓位”。
- `/api/state`：通过，返回 200；旧 run 中 `fundamental=null` 的条目不会再触发反向 DCF 空指针。
- `node scripts/eval_summaries.mjs --api --strict --min-info=0`：通过。
- `node scripts/eval_summaries.mjs --api --strict`：通过。
  - 页面出口 active shell articles 0，模板标题 0，ticker 错配 0。
  - 平均信息量分从上一轮 23.3/30.0 提升到 73.3；默认阈值 45 已通过。

## 2026-06-27 续跑结果

1. 投资建议 Agent 大盘上下文净化
   - 已将 `investmentAdvisorContextFromRun()` 从直接读取 `run.marketOverview` 改为复用 `marketOverviewForClient(run)`。
   - 同步增加大盘摘要保护：当多个核心资产只有昨收/历史快照且摘要仍出现 `0.0%` 类文字时，页面和 Agent 会降级为“缺少有效当日涨跌”的说明，不再把无效 0% 当成大盘判断依据。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check scripts/eval_summaries.mjs`：通过。
   - `node scripts/eval_summaries.mjs --api --strict`：通过；当前页面出口 active shell articles 0、模板标题 0、ticker 错配 0、平均信息量分 61.5。
   - `/api/state`：通过；最新 run 的大盘摘要为中文结构化结论，`^IXIC/^GSPC/^VIX/SMH/TLT` 等样本含有效涨跌，stale assets 为 0。
   - `/api/investment-advice`，AAPL，`llmProvider=local`：通过；返回“持有”，证据里的大盘摘要与首页一致，stale assets 为 0。
   - `/api/ibkr/socket-smoke-test`：仍为 warn；IB Gateway 进程存在，但 4001/4002/7497/7496/4000 均未监听，日志显示 macOS Java `Toolkit.getLockingKeyState` 导致登录控件未创建。
   - `/api/external-provider-smoke-test`：fail；AkShare CLI 30s/60s 超时，AlphaVantage/NewsAPI/Polygon/YouTube API/X 仍缺 key；Google News RSS、热门新闻 RSS、YouTube RSS、Stocktwits 可用。

3. 新增风险记录
   - `/api/investment-advice` AAPL 本次耗时约 170 秒，主要慢点来自 Longbridge/新闻正文/AkShare 补充源。建议后续做接口级超时预算和分阶段返回，避免前端长时间等待。
   - AkShare `stock_news_em` 和估值历史接口仍会超时；在网络/代理稳定前，它只能作为可选补充源，不能作为关键路径。

## 2026-06-27 单股接口性能与时间戳修复

1. 单股页/投资建议快预算
   - 新增 `AKSHARE_SNAPSHOT_TIMEOUT_MS`，默认 12000ms；单股页 AkShare 新闻、估值历史和单股新闻包里的 AkShare 全球新闻使用快预算，主报告仍保留 `AKSHARE_TIMEOUT_MS`。
   - 新增 `STOCK_SNAPSHOT_ALL_NEWS_TIMEOUT_MS`，默认 45000ms；单股快照的 All News Pack 超出预算时会降级为 partial，不阻塞投资建议。
   - `collectLongBridgeStockNews()` 从串行拉新闻详情改为并发拉取，避免 6 条新闻逐条等待。
   - 单股 `All News Pack` 默认跳过 GDELT 全局热闻，避免每次打开个股都触发公共源 429 和 5 秒限速等待；主报告 Hot News 仍使用 GDELT。

2. 时间戳修复
   - AkShare 个股新闻、AkShare 全球新闻和 IBKR Portal 导入内容缺失真实发布时间时，`publishedAt` 置空，另写 `collectedAt/importedAt`。
   - 这避免“缺失发布时间的旧闻被当成刚刚发布”进入排序。

3. 验证
   - `node --check server.mjs`：通过。
   - `node scripts/eval_summaries.mjs --api --strict`：通过。
   - `/api/news/all`，AAPL，`llmProvider=local`：从约 65064ms 降到约 30839ms；GDELT 429 不再出现在单股新闻包错误列表。
   - `/api/investment-advice`，AAPL，`llmProvider=local`：从约 170000ms 降到约 35331ms；返回“持有”，新闻证据保留 10 条。
   - `/api/env-config`：已包含 `AKSHARE_SNAPSHOT_TIMEOUT_MS` 和 `STOCK_SNAPSHOT_ALL_NEWS_TIMEOUT_MS`。

4. 仍需处理
   - AkShare 当前仍会在 12 秒快预算内超时，页面会显示 AkShare 降级错误；后续要么修代理/网络，要么默认把单股页 AkShare 置为可选后台源。
   - 新闻时间戳还有其他来源使用 `nowIso()` 的历史代码，需要继续分批替换为 `publishedAt=null + collectedAt`。

## 2026-06-27 新闻/社交时间戳续修

1. 完成项
   - 清理 `server.mjs` 中剩余的 `publishedAt: ... || nowIso()` / `publishedAt: nowIso()` 明确模式。
   - YouTube、RSS、Reddit、ApeWisdom、X、Longbridge 新闻/榜单、OpenBB discovery、东财全市场榜、外部社交源、Stock Sentiment、Stocktwits 和社交催化材料都改为：有真实发布时间才写 `publishedAt`，否则写 `collectedAt`。
   - `normalizeSearchPublishedAt()` 无法解析日期时返回 `null`，不再把搜索结果缺失时间伪装成本机当前时间。

2. 验证
   - `node --check server.mjs`：通过。
   - `rg "publishedAt:.*nowIso|publishedAt: nowIso" server.mjs`：无命中。
   - `node scripts/eval_summaries.mjs --api --strict`：通过。
   - `/api/news/all`，AAPL，`llmProvider=local`：通过，28 条新闻，`nearNowPublishedAt=0`，未发现“刚采集就冒充刚发布”的条目。
   - `/api/ibkr/socket-smoke-test`：仍为 warn；IB Gateway(pid 6330) 存在，但 4001/4002/7497/7496/4000 均未监听，仍是 Gateway/Java 登录窗口外部问题。

3. 仍需处理
   - 交易录入的 `normalizeExecutedAt()` 仍会在缺时间时默认当前时间，这是交易记录的录入语义，本轮未改。
   - 需要继续清理非 `publishedAt` 命名但承担发布时间语义的字段，例如部分 `timestamp`/`createdAt` 兜底。

## 2026-06-27 V2 可靠性修复执行清单

1. 已完成
   - LLM 熔断粒度从 provider 全局改为 `provider + task tier`，翻译/light 任务失败不会再连带熔断摘要、个股分析和投资建议等 standard/reasoning/heavy 任务。
   - 新闻事实清洗入口不再生成 `[原文] "..."` 英文兜底；无法可靠中文化的英文事实会被跳过，由摘要逻辑降级为“未提取到可核验关键事实或关键数字”。
   - API 输出层新增历史兼容净化，旧 run 中已经落库的 `[原文]` 英文片段、blob 图片噪音和截断英文不再透出到前端新闻摘要/whyHot/article summary。
   - `ensureStore()` 和 `saveStore()` 对内存缓存做深拷贝隔离，避免请求处理中的就地修改污染后续读取。
   - 反向 DCF 的收入/每股收益增长字段统一归一为百分数，`0.22` 会按 `22%` 处理，避免与 `22` 混算。
   - 公司新闻补抓从“任一 ticker 覆盖不足就全体补抓”改为“只对 Longbridge 覆盖不足的 ticker 补抓”，降低 Finnhub/Yahoo 请求量和延迟。
   - `isUnusableArticleUrl()` 的 Google URL 判断补充括号，避免后续维护误解运算符优先级。

2. 验证
   - `node --check server.mjs`：通过。
   - 服务启动：`node server.mjs` 可正常监听 `http://localhost:5173`。
   - `/api/state`：通过；最新 run 40 条新闻，前端出口字段中 `[原文]` 残留 0，blob/Continue reading 噪音 0。
   - `node scripts/eval_summaries.mjs --api --strict`：通过；active shell articles 0、模板标题 0、ticker 错配 0、平均信息量分 62.3、0% 假行情 0。
   - 首页 HTML：`curl http://localhost:5173/` 返回中文页面壳。

3. 未完成 / 后续项
   - V2 §8 的 all-stock agent outcome 快照、按 T+1/3/5/10 horizon 的规则统计、paper P&L 权益曲线和自学习门槛升级尚未实现；这是较大功能，需要单独改数据结构和前端仪表盘。
   - SQLite / runs 分片仍未做，`store.json` 长期膨胀问题只是通过缓存缓解。
   - 语义级新闻主体归属校验、FMP/Zacks 一致预期、FRED 宏观 regime、IBKR Gateway 外部连通性、期权分账单测仍待后续推进。

## 2026-06-27 V2 §8 全市场 Agent 追责闭环执行清单

1. 已完成
   - 新增 `allStockAgent.outcomeSnapshots`，每次运行候选池 Agent 时检查历史买入/卖出决策，若 T+1/T+3/T+5/T+10 已到且能拿到价格，就冻结一条 outcome；冻结后不随每日行情漂移。
   - outcome 记录包含入场价、退出价、benchmark、原始收益、方向调整后的表现、相对基准超额收益、命中/持平/失败结果和命中的 skill 规则。
   - 规则统计改为优先使用冻结 outcome，并按 horizon 记录 `samples / winRate / avgExcessPct`；没有 outcome 时才退回旧的当前价复盘。
   - 自学习调权改为使用 `avgExcessPct`，并将最小样本门槛提升到 20，避免 3 个样本噪声误改 skill。
   - 新增 `paperBook`：买入建议等额开仓，遇到卖出建议平仓；若未卖出但已到最长冻结 horizon，则用冻结 outcome 平仓；输出已实现/未实现盈亏、胜率、期望、最大回撤、交易 Sharpe、未平仓和最近平仓。
   - 每次采集会把 Agent 虚拟持仓纳入后续行情/技术/基本面候选池，提升非自选买入票的后续复盘覆盖。
   - `stockHistory` 从只记录自选股扩展为记录 watchlist、researchTickers、社交热股、报价、技术面、基本面、stock narratives 和投资建议覆盖的标的。
   - 操作建议页新增“可追责复盘”仪表盘，展示冻结 outcome、T+N 胜率/平均超额、纸面组合 P&L、未平仓和最近平仓。
   - `strategies/all_stock_agent_skill.md` 已同步把 `minSamplesForWeightUpdate` 改为 20，并写入 changelog。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - `/api/all-stock-agent/run`：通过；生成最新 Agent run `1782573531140-all-stock-agent`，`paperBook=true`，当前纸面未平仓 15 条。
   - `/api/all-stock-agent`：通过；返回 `paperBook.summary`，当前已平仓 0、未平仓 15。由于历史决策尚未到可用 T+N 价格点，本次新增 outcome 为 0，系统没有伪造复盘结果。
   - `node scripts/eval_summaries.mjs --api --strict`：通过；新闻摘要质量指标未被本轮改动破坏。

3. 仍需处理
   - 真正的“交易日”仍是工作日近似，尚未接入完整美股节假日日历。
   - benchmark 当前优先使用本地可得的 SPY/QQQ/VTI/VOO；若这些标的未进入历史快照，会退回方向收益，后续可强制每轮采集 SPY/QQQ。
   - paperBook 未计滑点、税费、真实成交、仓位上限和风险预算；目前用于建议质量追责，不等同真实账户回测。

## 后续需要配置或修复

1. IBKR Gateway
   - 启动并登录 IB Gateway。
   - 确认 API Socket 开启，端口通常 Live 4001 / Paper 4002。
   - 再运行 `/api/ibkr/socket-smoke-test`。

2. 新闻 API key
   - `NEWSAPI_KEY`
   - `POLYGON_API_KEY` 或 `MASSIVE_API_KEY`
   - `ALPHAVANTAGE_API_KEY`

3. 社交/搜索增强
   - `BRAVE_API_KEYS` / `TAVILY_API_KEYS` / `SERPAPI_API_KEYS` / `SEARXNG_BASE_URLS`
   - `X_BEARER_TOKEN`
   - `YOUTUBE_API_KEY`

4. TrendRadar/NewsNow
   - 当前公共实例被拦截。
   - 建议自托管 NewsNow，再配置 `TRENDRADAR_API_URLS`。

5. Store 架构
   - 建议下一步迁移 SQLite 或 run 分片，彻底解决 83MB `store.json` 长期增长问题。

## 2026-06-28 Longbridge Research / 行业榜 / Agent 追责补强执行清单

1. 已完成
   - 接入 Longbridge `industry-rank` + `industry-peers` 到主采集链，输出 `run.longBridge.industryRank`，并把行业榜摘要合入首页大盘卡片。
   - 行业榜默认采集 `leading-gainer / popularity / market-cap / revenue-growth`；`industry-peers` 改为全局限额，避免按每个榜单重复拉取导致主报告卡住。
   - 首页新增“Longbridge 板块热度”展示，显示行业名称、涨跌幅、领涨龙头和部分子行业层级。
   - 每轮采集强制加入 `SPY/QQQ/VTI/VOO`，供全市场 Agent 的 T+1/T+3/T+5/T+10 追责计算基准收益，避免只学到裸涨跌。
   - `analysis.summary` 从计数元数据改为结论优先：先输出大盘结论、重要新闻、社交热度和重点标的，采集数量降为末尾覆盖说明。
   - Longbridge research pack 已前台化更多结构化字段：空头比例、days-to-cover、内部人买/卖、机构股东增/减，并纳入投资建议风险门控。
   - 新增/同步配置项：`FORCED_BENCHMARK_TICKERS`、`LONG_BRIDGE_INDUSTRY_RANK_*`、`LONG_BRIDGE_INDUSTRY_PEERS_LIMIT`，并补齐 `COLLECTOR_TIMEOUTS` 中 Longbridge/Market Editorial 等显式超时。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - Longbridge CLI 实测 `industry-rank --market US --indicator leading-gainer --count 2 --lang zh-CN --format json` 可返回 BK counter_id、行业名称、涨跌幅和领涨 ticker。
   - `/api/state`：通过；服务已重启并监听 `http://localhost:5173`，配置说明中已包含 `industry-rank/industry-peers`，全股票 Agent skill 路径返回 `strategies/all_stock_agent_skill.md`。

3. 仍需处理
   - `industry-peers` 是 BK counter_id 维度；单股页要做强绑定还缺稳定的 ticker -> BK 映射。本轮先放在大盘/板块与热股解释层，避免把不确定映射写成单股事实。
   - 完整手动采集会被外部新闻/社交源拖慢，本轮未等待完整 run 结束；已补显式超时，下一轮正常采集会落库行业榜和强制基准。
   - Claude 列出的 FRED 宏观 regime、语义级新闻主体归属 eval、NYSE 节假日日历、SQLite/run 分片、核心纯函数单测、FIFO 期权分账已在下一节推进；SQLite 仍未迁库，但已先落 run 分片。

## 2026-06-28 核心可靠性收尾执行清单

1. 已完成
   - 新增 `lib/market_core.mjs`，把 NYSE 交易日历、FRED 宏观 regime 打分、新闻主体归属校验、新闻去重、期权 FIFO 分账拆成纯函数，便于独立测试。
   - NYSE 节假日/半日市已接入定时调度和全市场 Agent T+N 追责：盘前/盘后任务跳过美国交易所休市日，`addBusinessDays` 改为 NYSE trading days。
   - 大盘宏观面板新增 FRED regime：默认无 key 走 FRED 官方 CSV，有 key 走 FRED API；覆盖 10Y、2Y/10Y 曲线、信用利差、通胀预期、VIX，并进入投资建议 Agent 的宏观降权/加权。
   - run 分片已落地：最近 `RUN_INLINE_FULL_LIMIT` 个 run 保留完整内容，更早 run 写入 `data/runs/<runId>.json`，`/api/runs/:id` 会自动读取 sidecar，减少 `store.json` 长期膨胀。
   - 新闻相关度新增语义级主体归属字段：`newsOwnership / ownershipCategory / ownershipConfidence / ownershipMismatch`；前端会显示“主体疑似错配”，避免错把别家公司新闻当成个股催化。
   - 操作记录新增期权字段保存与导出：`instrumentType / underlyingTicker / optionSymbol / optionType / expiration / strike / multiplier`，IBKR Flex 与 CSV 导入均可携带这些字段。
   - 操作复盘新增期权 FIFO 分账：按同一 `optionSymbol` 匹配开平仓，按合约乘数计算已实现盈亏，并在操作页显示期权操作数、平仓段、未平仓 lot、未匹配平仓。
   - 新增 `scripts/core_regression_tests.mjs`，覆盖 NYSE 假日、半日市、交易日推进、FRED risk-off 评分、新闻主体错配、期权 FIFO 合约级匹配。
   - `.env.example` 和配置中心补齐 `RUN_ARCHIVE_*`、`FRED_*` 等配置项。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - `node scripts/core_regression_tests.mjs`：通过。

3. 剩余风险
   - run 分片不是完整 SQLite 迁移；若历史数据继续膨胀，下一步仍建议把 `runs / articleCache / stockHistory` 拆到 SQLite。
   - FRED 数据是日频且部分序列有发布滞后，只适合作为仓位 regime 闸门，不替代实时指数/利率行情。
   - 期权 FIFO 依赖导入数据的合约代码一致性；若 IBKR/CSV 导出缺少 `optionSymbol` 或历史开仓未导入，会出现“未匹配平仓”，页面会直接提示。

## 2026-06-28 逐项收尾执行清单

1. 已完成
   - 语义级新闻主体归属 eval 已接入 `scripts/eval_summaries.mjs`：新增 semantic ownership checked/mismatch 指标，并纳入 strict 失败条件。
   - 单股行业/上下游包已补 Longbridge 行业榜强证据映射：当 ticker 是行业榜 `leadingTicker` 时，单股详情会显示对应 BK 行业、榜单来源、涨跌幅和领涨证据；没有稳定 ticker->BK 映射时不写成确定事实。
   - 个股页产业链展示已支持 Longbridge 行业榜证据 tag。
   - IBKR Gateway socket 复测已完成：Python/ibapi 桥接存在，IB Gateway 进程存在，但本机 `4001/4002/7497/7496/4000` 均未监听；当前阻塞在 IB Gateway 登录/API 端口未开启，不是项目代码能绕过的问题。
   - SQLite 镜像已落地：新增 `scripts/sqlite_store_sync.py`，把 `runs / articleCache / stockHistory / socialPosts` 从 `data/store.json` 同步到 `data/market_pulse.sqlite`。
   - 服务新增 `/api/sqlite/status` 和 `/api/sqlite/sync`，并在 `/api/state.config.storage.sqliteMirror` 暴露 SQLite 镜像配置。
   - SQLite 镜像已接入保存后的自动同步队列：默认 `SQLITE_MIRROR_AUTO_SYNC=true`，保存后 5 秒 debounce，再由后台队列同步到 SQLite。
   - SQLite 同步脚本已处理孤立 Unicode surrogate，避免历史新闻/社交文本中的异常字符导致落库失败。
   - `.env.example` 已补齐 `SQLITE_MIRROR_*` 配置项。

2. 验证
   - `python3 -m py_compile scripts/sqlite_store_sync.py`：通过。
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - `node --check scripts/eval_summaries.mjs`：通过。
   - `node scripts/core_regression_tests.mjs`：通过。
   - `python3 scripts/sqlite_store_sync.py --store-json data/store.json --db data/market_pulse.sqlite`：通过；同步 `runs=20`、`articleCache=300`、`stockHistory=1998`、`socialPosts=2508`。
   - `GET /api/sqlite/status`：通过；`ready=true`。
   - `POST /api/sqlite/sync`：通过；返回同样的表计数。
   - `GET /api/state`：通过；配置中已返回 `storage.sqliteMirror`。
   - 服务重启后 `storage.sqliteMirror.autoSync=true`，`saveDebounceMs=5000`。
   - `GET /api/ibkr/socket-smoke-test?ticker=AAPL`：返回 `warn`，原因是 IB Gateway socket 端口未监听。
   - `node scripts/eval_summaries.mjs --api`：通过；当前历史报告里旧的浅层 ticker mismatch 为 3 条，但新语义主体错配为 `0`。

3. 仍需处理
   - IBKR 行情/期权/option time-and-sales 还不能跑通：需要 IB Gateway 完成登录，并确认 API Socket 端口实际监听。当前项目侧已能诊断端口和 JTS 配置。
   - SQLite 目前是镜像同步，不是完全替换 JSON 主库；下一步若要彻底降低 `store.json` 压力，需要把读写路径逐步迁到 SQLite。
   - 单股 ticker->BK 行业映射仍缺稳定源；目前只接强证据榜单映射，避免误归因。

## 2026-06-28 全球市场邮件源替换执行清单

1. 已完成
   - 每小时邮件推送不再默认使用 AkShare/同花顺 `stock_info_global_ths/thsm`。
   - 新增 `GLOBAL_MARKET_NEWS_*` 配置，默认源顺序为 `gdelt,rss,longbridge,newsapi,polygon,alphavantage,finnhub`。
   - `GLOBAL_MARKET_NEWS_INCLUDE_AKSHARE=false` 已写入 `.env` 和 `.env.example`，同花顺只在显式开启时作为兜底。
   - 新增全球市场新闻聚合器：过滤纯 A股/港股内盘消息，保留美股、全球宏观、日韩股市、AI/半导体/财报等美股相关线索。
   - 每个邮件新闻 provider 增加单源超时 `GLOBAL_MARKET_NEWS_PROVIDER_TIMEOUT_MS=20000`，单个源卡住不会阻断小时任务。
   - 邮件主题从“全球财经快讯”改为“全球市场快讯”，日志 source 改为 `Global Market News`。
   - 数据源诊断项文案改为“全球市场新闻邮件源”，不再显示为 AkShare 全球财经主源。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - `node scripts/core_regression_tests.mjs`：通过。
   - 服务已重启并监听 `http://localhost:5173`。
   - `/api/state` 显示：全球市场新闻邮件源默认使用 `gdelt -> rss -> longbridge -> newsapi -> polygon -> alphavantage -> finnhub`，同花顺/AkShare 已排除。
   - `/api/source-diagnostics?keys=akshare-global-news&ignoreDisabled=true`：通过；筛选到 39 条美股/全球/日韩相关全球市场新闻，来源为 `Longbridge 市场新闻` 和 `Finnhub Market News`。

3. 剩余风险
   - NewsAPI、Polygon、Alpha Vantage 若未配置 key 会自动跳过；当前可用源主要依赖 Longbridge/Finnhub/RSS/GDELT。
   - GDELT 和 RSS 噪音较高，仍需要后续摘要和材料性过滤；本轮已先过滤纯国内市场消息。

## 2026-06-29 Agent 全量预抓、邮件 LLM 摘要与 IBKR 复测执行清单

1. 已完成
   - All-stock Agent 的行情/K线预抓改为默认覆盖全候选池：`ALL_STOCK_AGENT_TECHNICAL_PREFETCH_LIMIT=0` 和 `ALL_STOCK_AGENT_QUOTE_PREFETCH_LIMIT=0` 现在表示 `all-candidates`，填正数时才限流为 top-N。
   - `/api/state.config.allStockAgent.prefetch` 新增 `technicalScope / quoteScope`，前端和诊断能直接看到当前是全量预抓还是 top-N。
   - All-stock Agent 增加“待触发买入候选”字段 `watchBuyCandidates`：正式买入仍只包含通过硬门槛且会进入 paperBook 的标的；观察候选用于补足扫描结果，不开虚拟仓、不参与追责。
   - 2026-06-30 追加修复：历史和新 run 中 `status=watch-buy` / `thresholdMet=false` 的买入记录不再被当作活跃持仓、paperBook 开仓或 T+N outcome 样本；正式 `buyCandidates` 只保留 `status=open` 的可追责买入。
   - 2026-06-30 追加迁移：停服后清洗 `data/store.json` 中历史 Agent run，把 14 条混入 `buyCandidates` 的 `watch-buy` 移入 `watchBuyCandidates`；保留备份 `data/store.json.bak-watch-buy-stopped-*`。
   - 个股基本面门控补入本地公司画像：`knownEquityProfile/mainBusinessZh` 可解除 GLW、WDC、SNDK、LLY、BB、LITE 等常见公司“主业缺失”误判；但 `行业待补/主业暂缺` 模板文案不会被当成有效证据。
   - 操作建议页新增“正式买入”和“待触发买入候选”两个区块，并在指标区显示观察候选数量。
   - 全球市场邮件新增 `GLOBAL_MARKET_NEWS_LLM_PROVIDER=antigravity-cli`，邮件正文新增“LLM 总结”段落，并记录 `llmStatus / llmProvider / summarySource`；LLM 失败时会明确标记规则兜底。
   - 全球新闻摘要 prompt 新增 `takeaway` 字段，要求用完整中文句子总结核心变化、资产类别影响和待观察数据，避免邮件只给标题列表。
   - 服务新增网络类 uncaught guard：只吞掉明确的外部网络/TLS 断连（如 `ECONNRESET`），避免单个远端源断连杀掉整个 Node 服务；非网络编程错误仍退出。
   - 2026-06-30 追加：外部 HTTPS 源的证书错误（如 `CERT_HAS_EXPIRED`、自签/链验证失败）也纳入网络类 guard，防止第三方新闻源证书过期导致主服务退出。

2. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
   - `node scripts/core_regression_tests.mjs`：通过。
   - 2026-06-30 追加验证：`node --check server.mjs` 和 `node scripts/core_regression_tests.mjs` 通过；服务重启后 `/api/state` 响应正常。
   - 服务已重启并监听 `http://localhost:5173`。
   - `/api/state` 显示 Agent 预抓为 `technicalScope=all-candidates`、`quoteScope=all-candidates`。
   - `/api/source-diagnostics?keys=akshare-global-news&ignoreDisabled=true`：通过；筛选到 34 条美股/全球/日韩相关全球市场新闻，来源为 `Longbridge 市场新闻` 和 `Finnhub Market News`。
   - IBKR Python bridge 单独验证通过：`.venv-openbb` 内 `ibapi` 可正常 import。
   - `POST /api/all-stock-agent/run`：通过；全量候选池 `universe=180/evaluated=180`，预抓 `quoteTargets=180/technicalTargets=180`，K线覆盖从 8 提升到 169。
   - 修复主业门控后，首次复跑生成正式买入 `GLW/LLY`；再次复跑因二者已进入虚拟持仓，不重复买入，并输出 8 个 `watch-buy` 待触发候选。
   - 2026-06-30 追加验证：最新 run `1782800805044-all-stock-agent` 中正式买入为 `AZI/BE/MU/INTC`，全部 `status=open` 且 `thresholdMet=true`；`PL/RDW/NNBR/RBLX/DCOY/MSFT/NVDA/GOOGL/UPC/ASTS` 单独列入 `watch-buy`。
   - 2026-06-30 追加验证：清洗后直接检查 `data/store.json`，历史 run 的 `buyCandidates` 中 `status=watch-buy` 或 `thresholdMet=false` 条数为 `0`；当前 `/api/state` 最新正式买入只剩 `TSM`，`SPCX` 已移入观察候选。

3. IBKR 当前状态
   - `GET /api/ibkr/socket-smoke-test?ticker=AAPL` 返回 `warn`：`127.0.0.1:4001/4002/7497/7496/4000` 均未监听，未检测到已登录并监听 Socket 的 IB Gateway/TWS 进程。
   - `https://localhost:5000/v1/api/iserver/auth/status` 超时；`lsof` 显示当前监听 5000 的进程是系统 `ControlCenter`，不是 IBKR Client Portal Gateway。
   - 因此本轮未能从 IBKR 拉到 AAPL 行情/K线/期权链。项目侧 smoke-test 与诊断可用，阻塞点在本机 IBKR Gateway/Client Portal 未暴露可访问 API 端口。

4. 剩余风险
   - 全候选池预抓会显著增加 Longbridge/IBKR/Finnhub 等行情请求量；若后续触发限流，可把 `ALL_STOCK_AGENT_*_PREFETCH_LIMIT` 改为正数做 top-N 限流。
   - 全量 Agent 单次运行当前约 4 分钟级别；如果要保持手动按钮秒级响应，下一步应把全量预抓拆成后台任务或缓存刷新任务。
   - 邮件 LLM 摘要依赖 Antigravity CLI 响应速度；超时会保留规则摘要并在邮件中标明 `规则兜底`。
   - IBKR 仍需重新启动/登录真正的 IB Gateway API 模式，并确认 Socket 端口实际监听后再复测。

## 2026-06-30 IBKR 断联处理与全球新闻时效性修复执行清单

1. IBKR 自动登录结论
   - 不实现绕过验证码/2FA/免登录。IBKR Gateway/TWS 与 Client Portal 的登录态属于券商安全边界，项目只做登录后只读连接、保活、诊断和降级。
   - 当前诊断显示 `127.0.0.1:4001/4002/7497/7496/4000` 均未监听；本机 JTS 配置里 `ApiOnly=true`、`RemotePortOrderRouting=4001`，但没有已登录且开放 Socket 的 Gateway/TWS 进程。
   - 已保留 `/api/ibkr/wait-for-socket` 与 `/api/ibkr/socket-smoke-test` 作为登录后自动验证入口；Socket 不可用时报告会降级到 Longbridge/Finnhub/Nasdaq/OpenBB。

2. Longbridge 行情/K线兜底验证
   - `longbridge quote AAPL.US --format json` 验证通过，返回 AAPL 实时报价、盘前/盘后字段、成交量和换手相关字段。
   - `longbridge kline AAPL.US --period day --count 5 --format json` 验证通过，返回最近 5 根日 K。
   - 当前配置已是 `QUOTE_PROVIDER_ORDER=longbridge,ibkr,finnhub,alphavantage`、`TECHNICAL_PROVIDER_ORDER=longbridge,ibkr,nasdaq,yahoo,akshare,finnhub`，即 IBKR 断联时行情/K线优先走 Longbridge。

3. 全球市场新闻邮件旧闻修复
   - 新增 `GLOBAL_MARKET_NEWS_MAX_AGE_HOURS=48` 和 `GLOBAL_MARKET_NEWS_REQUIRE_PUBLISHED_AT=true`，全球市场邮件只保留最近 48 小时且带发布时间的新闻。
   - `filterGlobalMarketNews` 改为先过滤旧闻、未来时间、无发布时间、纯内盘国内新闻，再按材料性和发布时间排序；诊断会显示过滤掉的旧闻和无发布时间数量。
   - 邮件正文的“重点新闻”新增发布时间展示，LLM prompt 明确只总结最近 48 小时新闻。

4. 全球新闻源增强
   - `GLOBAL_MARKET_NEWS_SOURCE_ORDER` 调整为 `gdelt,rss,google-news-rss,search,longbridge,newsapi,polygon,alphavantage,finnhub`。
   - 新增全局 Google News RSS 查询源，覆盖美股指数、Fed/美债/通胀、巨头/半导体/财报、日韩股市。
   - 新增统一搜索 Provider 全球新闻源，可使用 Brave/Tavily/SerpAPI/SearXNG；无商业 key 时与 Google News RSS 兜底协同。
   - Google News RSS 多查询已改为并发，避免 20 秒单源总超时导致搜索源被整体跳过。

5. 验证结果
   - `node --check server.mjs` 通过。
   - `akshare-global-news` 诊断通过：筛选到 60 条最近 48 小时内的美股/全球/日韩相关新闻，来源包含 Longbridge 市场新闻、Google News RSS、Finnhub Market News；过滤旧闻 9 条、无发布时间 0 条。
   - `search-provider` 诊断通过：Google News RSS 返回样本新闻。
   - `hot-news-rss` 诊断通过：11 个 RSS 均可用，共 491 条样本。

6. 仍需人工处理
   - IBKR Gateway/TWS 需要用户完成正常登录和二次验证，并确认 API Socket 端口实际监听；项目不能也不应绕过券商验证码。
   - 当前邮件日志中的上一封仍显示旧 source order，这是历史 log；下一轮小时任务会使用新的 `google-news-rss/search` 源和 48 小时过滤规则。

## 2026-06-30 全球新闻盘前发送与 Longbridge 期权能力确认

1. 全球新闻邮件调度
   - 新增 `GLOBAL_MARKET_NEWS_SCHEDULE_MODE`，支持 `premarket` 和旧的 `interval` 两种模式。
   - 当前 `.env` 已设为 `GLOBAL_MARKET_NEWS_SCHEDULE_MODE=premarket`、`GLOBAL_MARKET_NEWS_NEW_YORK_TIME=08:30`、`GLOBAL_MARKET_NEWS_CATCH_UP_MINUTES=75`。
   - `maybeRunAkshareGlobalNews` 改为在 NYSE 交易日美东 08:30 盘前窗口内每天最多发送一次；周末和 NYSE 假日不发送。
   - 旧的 `GLOBAL_MARKET_NEWS_INTERVAL_MS` 保留给 `interval` 模式，本机配置改为 `86400000`，避免误解为每小时推送。

2. agy / Antigravity 新闻摘要超时
   - 新增 `GLOBAL_MARKET_NEWS_LLM_TIMEOUT_MS`，当时 `.env` 和 `.env.example` 设为 `240000`；2026-06-30 已进一步放宽到 `600000`。
   - 全球新闻 LLM 摘要从硬编码 `90000ms` 改为读取该配置；如果 `agy` 慢，最多等 240 秒后再规则兜底。

3. Longbridge 期权能力
   - Longbridge 官方 CLI 有 `option` 子命令，支持 `chain / quote / volume`。
   - 实测 `longbridge option chain AAPL.US --format json` 可返回 AAPL 到期日列表。
   - 实测 `longbridge option chain AAPL.US --date 2026-07-17 --format json` 可返回行权价及 call/put 合约代码。
   - 实测 `longbridge option volume AAPL.US --format json` 可返回实时 Call/Put 成交量快照。
   - 实测 `longbridge option quote AAPL260717C300000 --format json` 返回 `no quote access`；即期权链和量能可用，但单合约实时报价、Greeks/IV/OI 等 quote 字段取决于长桥账号的期权行情权限。

4. 验证
   - `node --check server.mjs`：通过。
   - 服务已重启并监听 `http://localhost:5173`。
   - `akshare-global-news` 诊断通过：筛选到 60 条最近 48 小时内新闻；邮件调度为美东 08:30 盘前；LLM 超时 `240000ms`。

## 2026-06-30 LLM 超时放宽与 ticker 中文名展示

1. LLM/CLI 超时
   - Antigravity CLI、Gemini CLI、Gemini API 的轻任务超时调到 `180000ms`，普通任务调到 `300000ms`，reasoning/heavy 调到 `600000ms`。
   - 文章正文 LLM 摘要、市场综述、Longbridge 新闻详情摘要、投资建议 Agent、IBKR Portal LLM、个股 narrative 等任务统一放宽到 5-10 分钟档，降低 `agy` 或 Gemini 慢响应导致的误失败。
   - `.env` 和 `.env.example` 均已同步；运行时默认值也已同步，缺少环境变量时不再退回旧短超时。

2. 盘前新闻提前运行
   - 全球市场新闻邮件从美东 `08:30` 提前到 `07:45`，仍只在 NYSE 交易日盘前窗口每天发送一次。
   - 主报告盘前采集新增 `SCHEDULE_PRE_NEW_YORK_TIME`，本机已设为美东 `07:45`；盘后和候选池 Agent 时间不变。
   - 配置页占位提示同步改为 `07:45` 和 `600000ms`。

3. ticker 中文名
   - 新增后端 `TICKER_CHINESE_NAMES`，并在 `/api/state` 的 `config.tickerNamesZh` 暴露给前端。
   - Longbridge quote、compare、fundamental、industry rank 结果新增 `nameZh` 字段；优先使用 Longbridge 返回的中文名，其次使用本地常见美股映射。
   - 首页异动、重要新闻标签、财报日历、个股日报、社交热议、操作建议、自选池、技术/基本面、同业/上下游、交易复盘和全市场 Agent 主要展示点改为 `AAPL · 苹果` 这类格式。

4. 验证
   - `node --check server.mjs`：通过。
   - `node --check public/app.js`：通过。
