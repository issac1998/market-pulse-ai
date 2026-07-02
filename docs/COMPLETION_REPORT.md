# Market Pulse AI 完成度记录

更新时间：2026-06-21

## 结论

当前核心目标已完成到“可运行、有降级、有数据质量提示”的状态。2026-06-21 新增 AkShare、TrendRadar/NewsNow、结构化新闻 brief、Prism/AI 决策仪表盘验证和 IBKR Portal 超时放宽；仍有少量外部权限限制无法由代码绕过，例如 Finnhub Economic Calendar 当前 key 的 403、Reddit 429/403、TrendRadar 公共实例拦截、东财 K线临时断连、IBKR 行情订阅和部分新闻站点反爬。

## 已完成目标

1. 新闻正文读取与 AI 摘要
   - 已实现正文抽取、Jina Reader fallback、本地规则摘要和 LLM 摘要。
   - 热门新闻默认先抓 50 条候选，再用有效性评分/LLM 排序，只展示最重要 10 条。
   - 每条新闻输出中文标题、中文摘要、关键事实、投资观察和核验动作；LLM 超时会降级但不空白。

2. 个股日报二级页面与自由输入
   - 首页只保留大盘、重要新闻和二级页面入口。
   - 个股页支持自由输入 ticker，按需从 Longbridge/IBKR/Finnhub/OpenBB 拉行情、K线、新闻、基本面、同业和期权。

3. 全市场社交热议股票
   - 已从自选池扩展到全市场候选，合并 ApeWisdom、Stocktwits Trending、Reddit/RSS、小红书 CLI 和新闻回补。
   - 输出两句话解释：为什么被热议、所属行业/主业、基本面或事件线索、以及需要核验的交易含义。
   - 对 MU、AMD、ASML 等已加入行业链和主业知识兜底，避免只写“几次提及”。

4. 行情、K线、均线和图形
   - Longbridge 已作为行情、K线和新闻源接入。
   - 个股页显示 K 线、10 日线、20 日线、技术面趋势和可视化图表。
   - IBKR Socket/Client Portal 作为行情补充，失败时会降级并在数据质量里记录。

5. 期权链与图文解释
   - 期权链按用户要求优先走 IBKR，fallback 为 Nasdaq/Yahoo/Finnhub。
   - 已增加 GEX、OI/Volume、IV Smile 图，以及 Call Wall、Put Wall、净 GEX 和阅读教学。
   - IBKR 期权链依赖本机 Gateway 登录、账户权限和市场数据订阅；权限不足会显示明确 provider 错误。

6. 大盘、Hot News、宏观日历和邮件
   - 首页显示 AI 整理后的大盘结论、重要新闻和二级入口。
   - Hot News 从 RSS、Google ticker RSS、Finnhub/Longbridge/OpenBB/IBKR Portal 等源合并，并过滤低价值材料。
   - 宏观/Fed 日历已接入 Finnhub earnings、Federal Reserve 官方日历、New York Fed 经济指标日历、Fed/BLS/BEA 静态兜底。
   - 盘前/盘后自动报告和邮件发送已配置，邮件内容已做精简。

7. LLM、Antigravity、Longbridge 官方插件和配置攻略
   - 默认 LLM 已切到 Antigravity CLI，模型统一为 `gemini-3.1-flash-lite`，并保留本地规则降级。
   - Longbridge 官方 Codex plugin 已安装：`longbridge@longbridge-skills 2.0.0`。
   - 配置攻略已写入 `docs/CONFIGURATION_GUIDE.md`，页面副本在 `public/docs/CONFIGURATION_GUIDE.md`。

8. AkShare 增强源
   - 新增 `scripts/akshare_bridge.py`，输出稳定 JSON，支持 `probe`、`valuation`、`hist`、`news-em`、`global-news`、`macro`。
   - 个股详情页接入 `stock_us_valuation_baidu`，显示 PE(TTM)、PB、市值历史趋势；实测 MU 返回 260 行估值历史。
   - AkShare `stock_news_em` 已作为中文新闻补充源并进入新闻 cross-check。
   - AkShare 美债收益率已接入大盘宏观面板；全球指数源若被东财拦截，会记录为可选数据质量警告。
   - AkShare 全球财经新闻每小时抓取最近 100 条，按美股、全球、日韩股市关键词筛选后总结，并走现有邮件通道推送。
   - `stock_us_hist` 已接入为 K线 fallback，但当前东财 K线端点在本机多次返回 `RemoteDisconnected`；Longbridge/IBKR/Nasdaq/Yahoo 仍作为主要 K线源。

9. TrendRadar、社交主题和新闻结构化
   - 新增 TrendRadar/NewsNow 采集适配，拆成两个榜单：非股票社交热议主题、美股/全球市场热议主题。
   - 公共 `newsnow.busiyi.world` 当前返回错误页/疑似限流；系统会在诊断中提示自托管 `ourongxing/newsnow` 后配置 `TRENDRADAR_API_URLS`。
   - 参考 `wuseesth/AI-Financial-Insight-Assistant` 后，未复制其手工粘贴流程，而是把新闻输出统一成 `fact / impact / verification / sentiment / scope`，前端每条新闻直接展示事实、影响、核验和判断。
   - 个股详情页已验证 Prism、AI 决策仪表盘和 `analysisContextPack` 生效；实测 `MU` 快照返回 Prism、decisionDashboard、analysisContextPack、14 条新闻和结构化 brief。

## 已知外部限制

- Finnhub Economic Calendar：当前 key 无权限，不能绕过；已用官方免费源替代美国核心宏观节点。
- Reddit：匿名/RSS 抓取可能遇到 429/403；系统会重试三次并在主页面报错，其他社交源继续工作。
- TrendRadar/NewsNow：公共实例可能被 Cloudflare 或网络阻断；建议自托管 NewsNow 后配置 `TRENDRADAR_API_URLS`。
- AkShare K线：当前东财 K线端点对本机请求多次断连；已保留接入和错误上报，但主 K线继续依赖 Longbridge/IBKR/Nasdaq/Yahoo。
- 新闻原文：付费墙、登录态、反爬或脚本渲染页面无法保证全文可读；系统会标记来源风险并降级。
- IBKR：行情、历史 K线、期权 Greeks/OI 取决于 IB Gateway 登录状态、市场数据权限和 IB pacing 限制。
- Longbridge Codex plugin：已安装，但当前 Codex 会话的 skills 列表需要重启 Codex 或新开线程后才会自动出现。

## 当前推荐下一步

1. 重启 Codex 或开新线程，让 Longbridge 官方 skills 自动进入可用技能列表。
2. 若需要完整全球经济日历，评估 Trading Economics / FMP / EODHD 的免费额度和授权条款后再接入。
3. 若要提高新闻正文命中率，优先补 NewsAPI、Polygon/Massive、Alpha Vantage 和付费新闻源 key。
