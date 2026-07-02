# Market Pulse AI 配置攻略

这份攻略按“先让报告稳定生成，再补实时社交、交易、期权和邮件”的顺序来。所有密钥都写在项目根目录 `/Users/a/Desktop/codes/market-pulse-ai/.env`，不要提交到 git。

推荐优先使用实时配置中心：`http://localhost:5173/configuration.html`。它会读取当前诊断状态，把未点亮项排到前面。

## 0. 启动和诊断

1. 进入项目：

```bash
cd /Users/a/Desktop/codes/market-pulse-ai
```

2. 启动服务：

```bash
node server.mjs
```

当前项目在 `/Users/a/Desktop/codes` 下，Desktop 属于 macOS 隐私保护目录，LaunchAgent 可能无法读取服务文件。当前推荐先用 `screen` 保持运行：

```bash
screen -dmS market-pulse-ai bash -lc 'cd /Users/a/Desktop/codes/market-pulse-ai && exec node server.mjs'
screen -ls
```

如果以后把项目迁移到 `~/Developer` 等非隐私目录，或已给后台进程授权，再改用 LaunchAgent：

```bash
./scripts/install_launch_agent.sh --replace-screen
./scripts/launch_agent_status.sh
```

卸载自启动：

```bash
./scripts/uninstall_launch_agent.sh
```

3. 打开页面：

```text
http://localhost:5173/
```

4. 在右侧“数据源状态”点击“运行诊断”。命令行也可以看：

```bash
curl -s http://localhost:5173/api/source-diagnostics
```

诊断里 `ok` 表示可用，`warn` 表示能降级但质量受限，`fail` 表示需要处理。

## 当前待补配置

按 2026-06-19 的本机诊断，当前系统能生成报告，代理、Finnhub、Longbridge、OpenBB、RSS、Reddit、IBKR Socket 和 Resend 已可用；这些项目还需要继续配置或恢复：

1. IBKR Socket：`4001` 已能连接并读取账户/持仓，AAPL 期权定义可读；但诊断仍看到 IBKR market data / historical / sec-def farm 断开，行情 snapshot 和部分历史 K 线可能降级到 Longbridge/Finnhub/Nasdaq。优先检查 IB Gateway 网络代理直连规则、股票行情订阅和 OPRA/Options 权限。
2. YouTube Data API：缺 `YOUTUBE_API_KEY`；当前会用频道 RSS 和 `yt-dlp` 搜索 fallback 补位。填 key 后复检 `YouTube Data API`。
3. X 官方搜索：缺 `X_BEARER_TOKEN`；需要 X Developer App 的 app-only Bearer Token。未配置前，社交热股由 ApeWisdom、Reddit RSS、Stocktwits Trending 和新闻回补支撑。
4. NewsAPI / Polygon(Massive) / Alpha Vantage：缺增强新闻源 key；当前用 Finnhub、RSS、OpenBB、SEC 和网页正文抽取兜底。填 key 后分别复检 `NewsAPI 财经热闻`、`Polygon/Massive 新闻`、`Alpha Vantage 热门新闻`。
5. Longbridge：quote、K线、新闻可用；只作为行情/K线/新闻源，不参与期权链。
6. 小红书：如果诊断显示登录过期，需要更新 `XHS_COOKIE`。
7. IBKR Flex：如果要自动导入历史交易，仍需有效 `IBKR_FLEX_TOKEN` 和 `IBKR_FLEX_QUERY_ID`。

填完 YouTube/X/NewsAPI/Polygon/Alpha Vantage 任意 key 后，可以在首页点击 `一键复检外部 API`，或直接调用：

```bash
curl -s -X POST http://localhost:5173/api/external-provider-smoke-test
```

这个接口只做只读连通性检查，不会打印密钥；返回会列出缺 key、权限/套餐问题和当前 fallback。

## 1. 必配项

### Finnhub

用途：报价、公司新闻、基本面、部分期权 fallback。

1. 注册并创建 key：`https://finnhub.io/`
2. 写入 `.env`：

```env
FINNHUB_API_KEY=你的_finnhub_key
```

3. 重启服务，诊断应显示 `Finnhub ok`。

### SEC EDGAR

用途：官方 8-K、10-Q、10-K、附件和事件披露。

```env
SEC_USER_AGENT=MarketPulseAI/0.1 your_email@example.com
```

SEC 不需要 key，但建议填真实邮箱/标识，降低限流概率。

## 2. LLM

系统会按任务路由模型：默认调度、Agent、投资建议、复盘、翻译兜底和全球新闻邮件总结走 Codex CLI；新闻正文摘要单独走 Antigravity CLI 的 Gemini Pro 档；聊天只在页面上由用户主动触发。超时时会自动退回本地规则，报告不会空白。

### Codex + Antigravity 推荐

1. 确认命令可用：

```bash
codex --version
agy --version
```

2. 登录 Codex CLI 和 Antigravity CLI：

```bash
codex
agy
```

3. 推荐 `.env`：

```env
LLM_PROVIDER=codex-cli
SCHEDULE_LLM_PROVIDER=codex-cli
CODEX_CLI_COMMAND=codex
CODEX_CLI_ARGS_JSON=["exec","--color","never","--sandbox","read-only","--skip-git-repo-check","--ephemeral","--output-last-message","{output_file}","-"]
CODEX_CLI_MODEL=
CODEX_CLI_TIMEOUT_STANDARD_MS=300000
CODEX_CLI_TIMEOUT_REASONING_MS=600000
ARTICLE_LLM_PROVIDER=antigravity-cli
ANTIGRAVITY_CLI_MODEL_REASONING=gemini-3.1-pro-preview
LLM_FAILURE_COOLDOWN_MS=300000
LLM_DIAGNOSTIC_TIMEOUT_MS=180000
```

说明：Codex CLI 模型留空时使用当前 Codex 默认模型；正文摘要会映射到 reasoning/pro 档，因此 `ARTICLE_LLM_PROVIDER=antigravity-cli` 会使用 `gemini-3.1-pro-preview`。诊断失败会触发 LLM 冷却，但新闻正文摘要会在自己的预算内绕过诊断冷却再试一次，成功后自动标记 provider。

## 2.1 稳定性与采集超时

用途：避免某个外部数据源、期权 provider、OpenBB route 或新闻正文抽取长时间不返回，导致整份盘前/盘后报告一直 running。

推荐保持：

```env
COLLECTOR_TIMEOUT_MS=300000
COLLECTOR_TIMEOUTS=Social Media=180000,SEC EDGAR=240000,Company News=240000,YouTube=120000,Quotes=180000,Technical Chart=180000,Fundamentals=180000,Options Chain=180000,OpenBB Platform=240000,OpenBB News Articles=180000,Hot News=240000,Market Overview=180000,IBKR Portal=120000
```

超过对应时间的源会在数据质量里显示为 `timeout`，本轮报告继续生成。调大这些值需要重启服务，因为它们在启动时读取。

如果你想用 Google 登录的 Gemini CLI，而不是 API key，把上面的三行改成：

```env
GEMINI_CLI_AUTH_TYPE=oauth-personal
GEMINI_CLI_INHERIT_API_KEY=false
GEMINI_CLI_ISOLATED_HOME=false
```

注意：Gemini CLI 会读取 `~/.gemini/settings.json`。如果这个文件固定了 `oauth-personal`，即使 `.env` 有 `GEMINI_API_KEY`，非交互调用也可能继续走 OAuth 并超时；`GEMINI_CLI_ISOLATED_HOME=true` 会给服务使用独立的 CLI home，避免被本机交互式设置覆盖。

### Gemini API

1. 到 Google AI Studio 创建 API key。
2. 写入：

```env
GEMINI_API_KEY=你的_gemini_api_key
GEMINI_MODEL_LIGHT=gemini-3.1-flash-lite
GEMINI_MODEL_STANDARD=gemini-3.1-flash-lite
GEMINI_MODEL_REASONING=gemini-3.1-flash-lite
GEMINI_MODEL_FALLBACK=gemini-3.1-flash-lite
GEMINI_MODEL_HEAVY=gemini-3.1-flash-lite
```

3. 页面顶部 LLM 选择“Gemini 接口”。

### OpenAI

```env
OPENAI_API_KEY=你的_openai_key
OPENAI_MODEL=gpt-4o-mini
```

页面顶部 LLM 选择“GPT”。

## 3. 新闻正文和 AI 投研摘要

用途：打开新闻原文，抽取正文事实，再生成中文摘要、关键证据、投资观察和下一步核验动作。

推荐保持：

```env
ARTICLE_EXTRACT_ENABLED=true
ARTICLE_EXTRACT_LIMIT=24
ARTICLE_EXTRACT_TIMEOUT_MS=120000
ARTICLE_EXTRACT_ITEM_TIMEOUT_MS=90000
ARTICLE_EXTRACT_RUN_BUDGET_MS=180000
ARTICLE_READER_FALLBACK_ENABLED=true
ARTICLE_READER_BASE_URL=https://r.jina.ai
ARTICLE_LLM_SUMMARY_ENABLED=true
ARTICLE_LLM_SUMMARY_LIMIT=8
ARTICLE_LLM_SUMMARY_TIMEOUT_MS=90000
ARTICLE_LLM_SUMMARY_RUN_BUDGET_MS=180000
ARTICLE_LLM_FAILURE_LIMIT=2
ARTICLE_LLM_FAILURE_COOLDOWN_MS=180000
```

系统使用本地 `scripts/article_extractor.py`，优先正文抽取；源站反爬或 HTML 很乱时，用 Jina Reader fallback。抽取成功后会优先让 LLM 读正文并输出中文摘要、关键事实、为什么重要、核验动作和非个性化投资观察。若 LLM 超时，页面仍会显示“已读原文：本地 AI 规则”的摘要和投资观察，但会标明不是外部 LLM。若外部 LLM 连续超时，`ARTICLE_LLM_FAILURE_LIMIT` 会触发文章级熔断，后续新闻保留本地正文摘要，避免 Company/OpenBB/Hot News 在同一轮里重复等待同一个失败的外部 LLM。

## 3.1 当日热门新闻源

用途：从全市场财经新闻里发现当天最重要的宏观、板块和个股事件，再交给正文抽取和 LLM 生成中文结论。

这些 key 都属于第三方账户的持久访问凭证，创建前通常需要登录、同意条款，有些还涉及计费计划。系统可以诊断和使用 key，但不要把网页登录密码、cookie 或 API key 提交到 git。

推荐配置：

```env
HOT_NEWS_ENABLED=true
HOT_NEWS_LIMIT=50
HOT_NEWS_ALPHA_VANTAGE_ENABLED=true
ALPHAVANTAGE_API_KEY=你的_alpha_vantage_key
HOT_NEWS_NEWSAPI_ENABLED=true
NEWSAPI_KEY=你的_newsapi_key
HOT_NEWS_POLYGON_ENABLED=true
POLYGON_API_KEY=你的_polygon_key
POLYGON_NEWS_BASE_URL=https://api.polygon.io
HOT_NEWS_RSS_ENABLED=true
HOT_NEWS_RSS_DEFAULT_FALLBACK_ENABLED=true
HOT_NEWS_GOOGLE_TICKER_RSS_ENABLED=true
HOT_NEWS_GOOGLE_TICKER_RSS_TICKER_LIMIT=12
HOT_NEWS_GOOGLE_TICKER_RSS_LIMIT=4
HOT_NEWS_GOOGLE_TICKER_RSS_RESERVE=6
HOT_NEWS_RSS_URLS=https://feeds.content.dowjones.io/public/rss/mw_topstories,https://www.cnbc.com/id/10000664/device/rss/rss.html,https://finance.yahoo.com/news/rssindex,https://www.nasdaq.com/feed/rssoutbound?category=Markets,https://www.nasdaq.com/feed/rssoutbound?category=Stocks,https://seekingalpha.com/market_currents.xml,https://www.investing.com/rss/news.rss,https://news.google.com/rss/search?q=stock%20market%20when:1d&hl=en-US&gl=US&ceid=US:en,https://news.google.com/rss/search?q=market%20movers%20stocks%20when:1d&hl=en-US&gl=US&ceid=US:en
HOT_NEWS_PROVIDER_TIMEOUT_MS=30000
```

### Alpha Vantage

1. 打开 `https://www.alphavantage.co/support/#api-key`。
2. 申请 free API key。
3. 写入：

```env
ALPHAVANTAGE_API_KEY=你的_alpha_vantage_key
HOT_NEWS_ALPHA_VANTAGE_ENABLED=true
```

4. 重启服务，运行诊断 `Alpha Vantage 热门新闻`。免费套餐频率低，若返回限流提示，报告会自动跳过并用其他源。

### NewsAPI

1. 打开 `https://newsapi.org/register` 注册并复制 API key。
2. 写入：

```env
NEWSAPI_KEY=你的_newsapi_key
HOT_NEWS_NEWSAPI_ENABLED=true
HOT_NEWS_NEWSAPI_QUERY=(stock market OR Nasdaq OR S&P 500 OR earnings OR "AI stocks" OR semiconductor OR "market movers")
HOT_NEWS_NEWSAPI_DOMAINS=reuters.com,bloomberg.com,marketwatch.com,cnbc.com,barrons.com,investors.com,seekingalpha.com,benzinga.com
```

3. 重启服务，诊断 `NewsAPI 财经热闻` 应为 ok。NewsAPI 不同套餐对历史跨度、商业使用和来源覆盖有限制，系统只把它当热门新闻发现源，不把它当唯一事实来源。

### Polygon / Massive

1. 打开 `https://polygon.io/` 或新品牌 `https://massive.com/` 登录控制台。
2. 复制 API key。
3. 写入：

```env
POLYGON_API_KEY=你的_polygon_or_massive_key
POLYGON_NEWS_BASE_URL=https://api.polygon.io
HOT_NEWS_POLYGON_ENABLED=true
```

4. 重启服务，诊断 `Polygon/Massive 新闻`。如果套餐没有新闻端点权限，诊断会显示 403/permission，报告会继续使用 RSS/Finnhub/OpenBB。

优先级建议：

1. `Alpha Vantage News Sentiment`：有情绪标签和 ticker 关联，适合补全热门新闻发现，但免费套餐频率低。
2. `NewsAPI`：适合聚合 Reuters、MarketWatch、CNBC、Barron's、IBD、Seeking Alpha、Benzinga 等财经站；需要 key。
3. `Polygon/Massive News`：偏个股新闻，适合和行情/期权/社交热度交叉验证。
4. `HOT_NEWS_RSS_URLS`：无 key 兜底；系统会把自定义 URL 与内置默认 RSS 去重合并。默认候选包含 MarketWatch/Dow Jones、CNBC、Yahoo Finance、Nasdaq Markets/Stocks、Seeking Alpha、Investing，以及 Google News 的当日 stock market / market movers / earnings / AI semiconductor 搜索 RSS。若不想使用内置默认候选，设置 `HOT_NEWS_RSS_DEFAULT_FALLBACK_ENABLED=false`。RSS 仍可能被源站限流，系统会多源检测并忽略少数失败源。
5. `HOT_NEWS_GOOGLE_TICKER_RSS_ENABLED`：无 key 的个股新闻发现源。系统会对研究池 ticker 动态查询 Google News RSS，例如 AAPL/MRVL/NVDA 的近 7 天新闻，再交给正文抽取和 LLM 摘要。默认每轮最多 12 个 ticker、每个 ticker 4 条，并保底 6 条进入 Hot News 候选，避免被大盘静态 RSS 完全挤掉；如果网络慢，可以调低 `HOT_NEWS_GOOGLE_TICKER_RSS_TICKER_LIMIT` 或 `HOT_NEWS_GOOGLE_TICKER_RSS_RESERVE`，也可以关闭该开关。

系统会按“多源重复、发布时间、关联 ticker、正文可读性、材料性”给热门新闻排序。即使某个源被限流，报告仍会使用 Finnhub/Yahoo/IBKR Portal/OpenBB/RSS 可用源继续生成。

## 4. 社交热议

目标：不是只看自选池，而是从全市场发现热度上升快的 ticker，再补抓新闻、行情、基本面和技术面解释“为什么热”。

### ApeWisdom

无 key，当前作为全市场 Reddit 热榜主力。

```env
SOCIAL_APEWISDOM_ENABLED=true
SOCIAL_APEWISDOM_LIMIT=80
SOCIAL_APEWISDOM_DETAILS_ENABLED=true
SOCIAL_APEWISDOM_DETAILS_LIMIT=24
SOCIAL_APEWISDOM_DETAILS_TIMEOUT_MS=30000
SOCIAL_APEWISDOM_DETAILS_CONCURRENCY=1
SOCIAL_APEWISDOM_DETAILS_MIN_INTERVAL_MS=2000
SOCIAL_APEWISDOM_DETAILS_RATE_LIMIT_COOLDOWN_MS=60000
SOCIAL_KEYWORD_WEB_VERIFY_ENABLED=true
SOCIAL_KEYWORD_WEB_VERIFY_LIMIT=8
SOCIAL_KEYWORD_WEB_VERIFY_ITEM_LIMIT=3
SOCIAL_KEYWORD_WEB_VERIFY_DAYS=7
SOCIAL_KEYWORD_WEB_VERIFY_TIMEOUT_MS=60000
SOCIAL_KEYWORD_WEB_VERIFY_CONCURRENCY=1
SOCIAL_KEYWORD_WEB_VERIFY_MIN_INTERVAL_MS=2000
SOCIAL_TREND_ENRICH_LIMIT=24
SOCIAL_STOCKTWITS_ENABLED=true
SOCIAL_STOCKTWITS_TRENDING_ENABLED=true
SOCIAL_STOCKTWITS_TRENDING_LIMIT=80
```

页面“社交热议股票”会优先展示 `全市场` 且 `上升分` 高的标的，再补充自选池。

ApeWisdom 列表接口提供排名、提及数、24 小时提及变化、赞同/热度；详情页还能提供 24h 提及、讨论用户数、正负面比例和 nearby keywords。系统会把这些关键词作为解释“为什么热”的第一层证据，但不会只靠关键词直接下结论：它会用 Google News RSS 公开搜索验证关键词是否能落到近期新闻。搜到新闻时显示“新闻搜索已找到相关线索”，搜不到时只显示“仅按社交关键词初步推断”。例如 `machines/china/euv` 只有在搜到 ASML/EUV/China 相关新闻时，才会升级为新闻验证线索；否则只能作为未验证主题。为了避免触发限流，详情页默认串行抓取，每个请求至少间隔 2 秒；遇到 `429 Too Many Requests` 会读取 `Retry-After`，否则默认冷却 60 秒后再重试。

### Stocktwits Trending

无需 key，当前用于补充全市场交易者实时热度流，尤其是在 `X_BEARER_TOKEN` 尚未配置时补位：

```env
SOCIAL_STOCKTWITS_ENABLED=true
SOCIAL_STOCKTWITS_TRENDING_ENABLED=true
SOCIAL_STOCKTWITS_TRENDING_LIMIT=80
SOCIAL_STOCKTWITS_SYMBOL_ENABLED=false
SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_WHEN_X_MISSING=true
SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_TICKER_LIMIT=6
SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_LIMIT=8
```

Stocktwits trending 噪音和短线喊单较多，系统会把它当“发现线索”，再用新闻、SEC、行情、基本面和技术面解释为什么热。完整单标的消息流默认关闭，因为它可能拖慢整轮采集；但在 `X_BEARER_TOKEN` 缺失时，系统会对前几个自选/研究 ticker 做轻量单标的补抓，补足“具体在聊什么”的上下文。需要深挖自选池时再把 `SOCIAL_STOCKTWITS_SYMBOL_ENABLED=true`。

### Reddit

```env
SOCIAL_REDDIT_ENABLED=true
SOCIAL_REDDIT_SUBREDDITS=wallstreetbets,stocks,investing,options
SOCIAL_REDDIT_POST_LIMIT=25
```

如果 Reddit 当前网络不可达，可以先关掉：

```env
SOCIAL_REDDIT_ENABLED=false
```

### X / Twitter

1. 打开 `https://developer.x.com/` 并进入 Developer Portal。
2. 创建 Project/App，或使用已有 App。
3. 在 App 的 Keys and Tokens 页面复制 app-only `Bearer Token`。不要复制账号密码，也不要把 OAuth client secret 当 Bearer Token。
4. 写入：

```env
X_SEARCH_ENABLED=true
X_BEARER_TOKEN=你的_x_bearer_token
X_SEARCH_MAX_RESULTS=20
```

5. 重启服务，诊断 `X 官方搜索` 应为 ok。

注意：X API 免费/基础套餐经常变化，搜索端点可能需要 Basic/Pro 权限；如果诊断返回 403 或 plan restricted，保持 ApeWisdom、Reddit、RSS 和新闻回补作为全市场热度兜底。

### 小红书

1. 在浏览器登录小红书网页版。
2. 打开开发者工具，复制完整 cookie。
3. 写入：

```env
XHS_COOKIE=你复制的_cookie
XHS_CLI_COMMAND=python3
XHS_CLI_ARGS_TEMPLATE=search {keyword} --json --limit 10
XHS_KEYWORDS=美股,美股投资,英伟达,NVDA,特斯拉,TSLA,苹果,AAPL,微软,MSFT,AI股票
```

4. 如果诊断提示登录过期，重新复制 cookie。若短期不想用，可在页面数据源开关里暂停。

### YouTube

RSS 方式：

```env
YOUTUBE_FEED_FALLBACK_ENABLED=true
YOUTUBE_FEED_URLS=https://www.youtube.com/feeds/videos.xml?channel_id=频道ID1,https://www.youtube.com/feeds/videos.xml?channel_id=频道ID2
YOUTUBE_FEED_TIMEOUT_MS=15000
```

即使 `YOUTUBE_FEED_URLS` 留空，系统默认也会追加 CNBC、CNBC Television 和 Bloomberg Television 的公开频道 RSS，作为无 key 视频叙事兜底。若不想使用默认频道，设置 `YOUTUBE_FEED_FALLBACK_ENABLED=false`。

无 key 全站搜索 fallback：

```env
YOUTUBE_YTDLP_ENABLED=true
YOUTUBE_YTDLP_PYTHON=.venv-openbb/bin/python
YOUTUBE_YTDLP_TIMEOUT_MS=90000
```

`yt-dlp` fallback 只读取 YouTube 搜索结果元数据，不下载视频；它用于弥补 RSS 只能覆盖固定频道的问题。该源可能受 YouTube 风控、网络和排序噪音影响，系统会把它当可选视频叙事线索，失败时不会阻塞报告。

API 方式更稳：

1. 打开 Google Cloud Console：`https://console.cloud.google.com/`。
2. 选择或创建一个项目。
3. 进入 APIs & Services，启用 `YouTube Data API v3`。
4. 进入 Credentials，创建 API key。
5. 建议给 key 加限制：API restrictions 只允许 `YouTube Data API v3`；Application restrictions 可先设为 none，确认可用后再按部署环境收紧。
6. 写入：

```env
YOUTUBE_API_KEY=你的_youtube_data_api_key
```

7. 重启服务，诊断 `YouTube Data API` 应为 ok。

如果 RSS 经常超时、404/500 或返回 0 条，优先配置 API key。系统现在会把“已配置但本轮没有视频”标成数据质量限制，避免误判为增强源全部可用。

### 自定义 RSS/JSON

页面“数据源状态”里可以直接添加，也可以写：

```env
SOCIAL_FEED_URLS=https://example.com/feed.xml,https://example.com/feed.json
```

## 4.5 Longbridge AI / OpenAPI

用途：补充港美 A 股行情、K线、新闻正文、全市场热股/异动原因、基本面、估值、分析师数据和财报日历。当前项目通过 Longbridge 官方 Codex skills 推荐的 CLI 命令接入，已验证 `quote`、`kline`、`news detail`、`top-movers`、`rank`、`company`、`business-segments`、`financial-report`、`valuation` 和 `finance-calendar report` 可用；期权链仍固定走 IBKR 优先。

安装和登录：

```bash
cd /Users/a/Desktop/codes/market-pulse-ai
~/.local/bin/longbridge --version
~/.local/bin/longbridge auth status
```

推荐配置：

```env
LONG_BRIDGE_ENABLED=true
LONG_BRIDGE_COMMAND=/Users/a/.local/bin/longbridge
LONG_BRIDGE_TIMEOUT_MS=30000
LONG_BRIDGE_CONCURRENCY=3
LONG_BRIDGE_MARKET_SUFFIX=US
LONG_BRIDGE_NEWS_ENABLED=true
LONG_BRIDGE_NEWS_LIMIT=8
LONG_BRIDGE_NEWS_DETAIL_ENABLED=true
LONG_BRIDGE_NEWS_DETAIL_LIMIT=8
LONG_BRIDGE_DISCOVERY_ENABLED=true
LONG_BRIDGE_DISCOVERY_LIMIT=30
LONG_BRIDGE_RANK_KEYS=hot_up-us,hot_all-us,discuss_heat-us,trade_heat-us
LONG_BRIDGE_FUNDAMENTALS_ENABLED=true
LONG_BRIDGE_FUNDAMENTALS_TICKER_LIMIT=3
LONG_BRIDGE_EARNINGS_CALENDAR_ENABLED=true
LONG_BRIDGE_EARNINGS_CALENDAR_LIMIT=100
LONG_BRIDGE_KLINE_COUNT=180
QUOTE_PROVIDER_ORDER=longbridge,ibkr,finnhub,alphavantage
TECHNICAL_PROVIDER_ORDER=longbridge,ibkr,nasdaq,yahoo,finnhub
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
```

验证：

```bash
curl -s 'http://localhost:5173/api/source-diagnostics?keys=longbridge&ignoreDisabled=true'
```

说明：Longbridge 的 `top-movers` 会进入“社交热议/市场异动”原因，`news detail` 会优先作为新闻正文来源，`finance-calendar report` 会进入财报日历校验。Longbridge 不参与期权链，避免 `no quote access` 噪音；期权链继续使用 IBKR Socket 优先，之后降级到 Nasdaq/Yahoo/Finnhub。

## 5. OpenBB

用途：接入 OpenBB 开源金融数据能力，页面提供中文状态和 route 调用。

推荐：

```env
OPENBB_ENABLED=true
OPENBB_MODE=auto
OPENBB_PROVIDER=
OPENBB_PYTHON_COMMAND=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
OPENBB_COLLECTOR_SECTIONS=discovery,identity,filings,quote,historical,profile,metrics,news,options
OPENBB_TICKER_LIMIT=8
OPENBB_DISCOVERY_LIMIT=25
OPENBB_NEWS_LIMIT=40
OPENBB_ROUTE_TIMEOUT_MS=30000
```

验证：

1. 页面“OpenBB 开源数据平台”输入：

```text
equity.price.quote
```

2. 参数：

```json
{"symbol":"AAPL","provider":"yfinance"}
```

3. 有些 ETF 的 identity route 可能返回空，不影响主报告。

## 6. IBKR

### IB Gateway / TWS Socket API

用途：优先读取 IBKR 账户、持仓、行情 snapshot、历史 K 线和期权链。IBKR Desktop 不等同于 TWS/IB Gateway Socket API；当前以 IB Gateway Socket `4001` 为主，失败时会自动降级到 Longbridge/Nasdaq/Finnhub/OpenBB 等源。

1. 启动 `IB Gateway 10.47` 或 `Trader Workstation`。
2. IB Gateway 登录页选择 `IB API`。
3. 如果使用 Live Trading，`.env` 使用 `IBKR_GATEWAY_PORT=4001`；如果使用 Paper Trading，使用 `IBKR_GATEWAY_PORT=4002`。TWS Live/Paper 通常是 `7496/7497`。
4. 完成登录和手机/设备二次验证。登录完成前端口不会监听。
5. 如果用 TWS，在 `Global Configuration -> API -> Settings` 里勾选 `Enable ActiveX and Socket Clients`，并允许 `127.0.0.1`。IB Gateway 的 Jts 配置里当前已看到 `TrustedIPs=127.0.0.1` 和 `ApiOnly=true`。
6. 确认 Python bridge 有官方 `ibapi` 依赖：

```bash
/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python -m pip install ibapi
```

如果 `.env` 使用 `IBKR_GATEWAY_PYTHON=python3`，则需要对系统 Python 执行 `python3 -m pip install ibapi`。

7. 先用命令确认端口：

```bash
nc -vz 127.0.0.1 4001
nc -vz 127.0.0.1 4002
nc -vz 127.0.0.1 7497
nc -vz 127.0.0.1 7496
```

8. 写入：

```env
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
IBKR_GATEWAY_PORT_CANDIDATES=4001,4002,7497,7496,4000
IBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
IBKR_MARKETDATA_ENABLED=true
QUOTE_PROVIDER_ORDER=longbridge,ibkr,finnhub,alphavantage
TECHNICAL_PROVIDER_ORDER=longbridge,ibkr,nasdaq,yahoo,finnhub
TECHNICAL_TICKER_LIMIT=24
TECHNICAL_CONCURRENCY=6
TECHNICAL_TICKER_TIMEOUT_MS=90000
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
IBKR_TRADING_READ_ENABLED=true
IBKR_TRADING_ENABLED=false
IBKR_PAPER_ONLY=true
```

9. 重启服务，先跑诊断 `IBKR Gateway Socket`，应为 ok。
10. 在首页“外部接入开通卡”点击 `立即验证 IBKR`，或直接调用：

```bash
curl -s -X POST http://localhost:5173/api/ibkr/socket-smoke-test \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"AAPL"}'
```

这只会做只读检查：Socket 握手、AAPL 行情、AAPL 历史 K 线、AAPL 期权链，不会下单。

如果你正在登录 IB Gateway，可以让页面等待端口起来后自动验证：点击首页 IBKR 卡片里的 `等待登录并验证`，或直接调用：

```bash
curl -s -X POST http://localhost:5173/api/ibkr/wait-for-socket \
  -H 'Content-Type: application/json' \
  -d '{"ticker":"AAPL","timeoutMs":180000,"intervalMs":3000}'
```

这个接口只轮询本机候选端口，发现 `4001/4002/7497/7496/4000` 任一端口监听后，会自动使用开放端口执行同一组只读 smoke test；不会下单，也不会修改 IBKR 设置。

11. 再跑诊断 `IBKR 行情/K线` 和 `IBKR 期权链 Socket`。如果 snapshot 因市场数据订阅不足没有价格，系统会自动降级到 Longbridge/Finnhub；K线/期权定义会继续优先尝试 Socket。

现在的后端会先做 TCP 端口探测：如果端口没监听，诊断会提示“IB Gateway/TWS 进程是否正在运行、是否还停在登录页、Jts 里的 API 端口配置是什么”，不会再只显示 `CLI exited with 1`。如果发现其他候选端口已开，诊断会提醒你把 `IBKR_GATEWAY_PORT` 改到已开的端口；如果 Python bridge 缺 `ibapi`，诊断会直接给出安装命令。

### Client Portal Gateway

用途：补充读取 IBKR Client Portal Web API 和 Portal 页面内容。期权链当前优先 Socket 4001/4002，Client Portal 只是旧 fallback；真正生产报告时，即使 IBKR 不通也会自动降级到 Nasdaq/Yahoo/Finnhub。

1. 启动 IBKR Client Portal Gateway、TWS 或 IB Gateway。
2. 浏览器打开并登录：

```text
https://localhost:5000
```

如果打不开，先检查端口：

```bash
lsof -nP -iTCP:5000 -sTCP:LISTEN
```

当前这台 Mac 上 5000 已被 `ControlCe` 占用；如果 IBKR Gateway 无法绑定 5000，请把 Gateway 改到 5001/5050 等空闲端口，并同步改：

```env
IBKR_CP_BASE_URL=https://localhost:5001/v1/api
```

3. 写入：

```env
IBKR_CP_BASE_URL=https://localhost:5000/v1/api
IBKR_CP_REJECT_UNAUTHORIZED=false
IBKR_MARKETDATA_ENABLED=true
QUOTE_PROVIDER_ORDER=ibkr,finnhub,alphavantage
TECHNICAL_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
TECHNICAL_TICKER_LIMIT=24
TECHNICAL_CONCURRENCY=6
TECHNICAL_TICKER_TIMEOUT_MS=90000
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
IBKR_CP_KEEPALIVE_ENABLED=true
IBKR_TRADING_READ_ENABLED=true
IBKR_TRADING_ENABLED=false
IBKR_PAPER_ONLY=true
```

4. 重启服务，先跑诊断 `IBKR Client Portal`，应为 ok。
5. 再跑诊断 `IBKR 行情/K线`，确认 AAPL snapshot 和历史 K 线能返回。
6. 单股页点击“立即补抓期权链”，provider 优先应显示 `IBKR Gateway Socket Option Chain`；如果显示 Nasdaq/Yahoo/Finnhub，说明 IBKR 未登录、端口不可达、行情权限不足或 OPRA/期权字段不可用。

注意：合约定义通常可取到；股票实时/延迟行情、历史 K 线、实时期权报价、Greeks、OPRA 数据可能需要 IBKR 市场数据权限。IBKR 不可用时会自动 fallback：行情走 Longbridge/Finnhub/Alpha Vantage，K 线走 Longbridge/Nasdaq/Yahoo/Finnhub，期权走 Nasdaq/Yahoo/Finnhub。

### IBKR Portal Market Overview / Hot News

用途：把 IBKR Home / Market Overview / Hot News 的可见内容作为大盘叙事和热点新闻增强源。

1. 在 Chrome 登录 IBKR Portal，进入 Home、Market Overview 或 Hot News 卡片。
2. 复制卡片里的可见文本，例如 `BRIEFING.COM MARKET UPDATE`、标题、正文、Hot News 标题和来源。
3. 回到 Market Pulse AI 首页右侧 `IBKR Portal 大盘与 Hot News`，选择 `自动判断`，粘贴并点击 `导入 IBKR 内容`。
4. 运行一次手动刷新或等待盘前/盘后采集。
5. 大盘卡片会显示 `IBKR Portal` 补充，新闻列表会出现 `IBKR Portal Market Overview` / `IBKR Portal Hot News`，并生成中文摘要和投资观察。

```env
IBKR_PORTAL_NEWS_ENABLED=true
IBKR_PORTAL_URLS=
IBKR_PORTAL_COLLECT_LIMIT=16
IBKR_PORTAL_LLM_LIMIT=6
IBKR_PORTAL_LLM_TIMEOUT_MS=12000
IBKR_PORTAL_LLM_CONCURRENCY=2
```

不要把 IBKR cookie 写进 `.env`。普通 Portal URL 通常只返回 Client Portal 前端壳，无法直接拿到 Market Overview 正文；系统会自动跳过这种 URL，并在诊断里提示改用页面导入。Chrome 自动读取可以作为后续增强，但当前最稳的是复制可见文本导入。

`IBKR_PORTAL_LLM_TIMEOUT_MS` 和 `IBKR_PORTAL_LLM_CONCURRENCY` 用来控制导入内容的逐条 LLM 摘要耗时。Gemini CLI 慢或超时时，系统会保留本地正文摘要和后续报告级总结，不会因为单条 Portal 新闻阻塞整轮采集太久。

### 交易 API 安全边界

Client Portal 的交易接口和行情接口共用 Gateway 登录态。今天建议先跑通会话、账户、行情、期权链和交易预览，不自动真实下单。真实下单前必须只使用 Paper Account，且页面需要二次确认订单 ticker、方向、数量、订单类型、价格、账户和预估影响；没有二次确认时服务端应拒绝下单。

当前内置诊断只读调用 `/iserver/accounts` 和 `/iserver/account/orders`，用于确认交易 API 会话可用，不会提交订单。保持：

```env
IBKR_TRADING_READ_ENABLED=true
IBKR_TRADING_ENABLED=false
IBKR_PAPER_ONLY=true
```

### Flex Web Service

用途：同步历史交易/持仓到操作日志，后续复盘每笔操作。

1. 在 IBKR Account Management 创建 Flex Query。
2. 勾选 Trades、Open Positions、Cash 或你需要的字段。
3. 复制 Flex Token 和 Query ID。
4. 写入：

```env
IBKR_FLEX_TOKEN=你的_flex_token
IBKR_FLEX_QUERY_ID=你的_query_id
IBKR_FLEX_VERSION=3
```

5. 页面点击“同步 IBKR Flex”。

## 7. 邮件报告

### Resend 推荐

```env
REPORT_EMAIL_ENABLED=true
REPORT_EMAIL_TO=你的邮箱@example.com
RESEND_API_KEY=你的_resend_key
RESEND_FROM=Market Pulse AI <onboarding@resend.dev>
```

### SMTP

```env
REPORT_EMAIL_ENABLED=true
REPORT_EMAIL_TO=你的邮箱@example.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=你的邮箱@gmail.com
SMTP_PASS=你的_app_password
REPORT_EMAIL_FROM=你的邮箱@gmail.com
```

Gmail 需要 App Password，不是网页登录密码。

## 8. 定时任务

服务运行时每 30 秒检查一次纽约时间。

默认：

- 盘前：美东 08:30
- 盘后：美东 16:30

只要服务保持运行，定时任务会自动触发。当前 Desktop 目录建议先用 `screen` 持续运行；如果迁移到非隐私目录或已授予后台访问权限，再用 `./scripts/install_launch_agent.sh --replace-screen` 安装 macOS LaunchAgent，让 `server.mjs` 登录后自启动、异常退出后自动拉起。默认 `SCHEDULE_CATCH_UP_MINUTES=75`，短暂睡眠、网络慢或服务重启错过精确分钟时，仍会在 75 分钟窗口内补跑一次；机器长期睡眠、服务停止超过窗口时不会执行。

如果要定时邮件：

```env
REPORT_EMAIL_ENABLED=true
SCHEDULE_LLM_PROVIDER=codex-cli
SCHEDULE_CATCH_UP_MINUTES=75
```

## 9. 建议配置顺序

1. `FINNHUB_API_KEY`、`SEC_USER_AGENT`
2. Longbridge CLI / auth
3. Gemini CLI 或 OpenAI/Gemini API
4. 新闻正文抽取和 Jina Reader fallback
5. `SOCIAL_APEWISDOM_ENABLED=true`、`SOCIAL_APEWISDOM_DETAILS_ENABLED=true`、`SOCIAL_TREND_ENRICH_LIMIT=24`
6. X Bearer Token
7. 小红书 cookie
8. YouTube API key
9. IBKR Socket / Flex
10. Resend 或 SMTP 邮件

## 10. 常见问题

- Gemini 超时：页面先选“本地规则”，系统仍会读正文并生成本地投资观察。
- 新闻显示 source-limited：源站付费墙或反爬，系统不会伪造正文数字。
- 社交热议只有提及数：先确认 ApeWisdom/X/Reddit/XHS 是否有可用源，再看页面的“全市场上升榜”和新闻催化。
- 小红书失败：多数是 cookie 过期，重新复制 cookie。
- YouTube RSS 超时：配置 `YOUTUBE_API_KEY`，或保留 `YOUTUBE_YTDLP_ENABLED=true` 作为无 key 搜索兜底。
- IBKR CP 超时：确认 Gateway/TWS 已启动并登录，浏览器能打开 `https://localhost:5000`。
- Longbridge 连接上限：如果看到 `connections limitation is hit`，调低 `LONG_BRIDGE_CONCURRENCY`；默认已限制为 3。
- 期权链不是 IBKR：说明 IBKR 未登录、不可达或市场数据权限不足，系统已降级到 Nasdaq/Yahoo/Finnhub。
