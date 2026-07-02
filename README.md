# Market Pulse AI

一个本地运行的美股信息台 MVP：每日盘前/盘后定时采集关注列表的新闻、SEC 文件、可选 YouTube 信号和可选授权报价源，然后生成可追溯的中文摘要，并提供基于最新采集上下文的聊天能力。

## 运行

```bash
node server.mjs
```

打开：

```text
http://localhost:5173
```

当前项目在 `/Users/a/Desktop/codes` 下，Desktop 属于 macOS 隐私保护目录，LaunchAgent 可能无法读取服务文件。推荐先用 `screen` 保持运行：

```bash
screen -dmS market-pulse-ai bash -lc 'cd /Users/a/Desktop/codes/market-pulse-ai && exec node server.mjs'
screen -ls
```

如果以后把项目迁移到 `~/Developer` 等非隐私目录，或已给后台进程授权，再安装 macOS LaunchAgent：

```bash
./scripts/install_launch_agent.sh --replace-screen
./scripts/launch_agent_status.sh
```

卸载自启动：

```bash
./scripts/uninstall_launch_agent.sh
```

## 本地 key 配置

项目启动时会自动读取根目录的 `.env` 文件。示例：

```bash
LLM_PROVIDER=gemini-cli
SCHEDULE_LLM_PROVIDER=local
GEMINI_CLI_COMMAND=gemini
GEMINI_CLI_MODEL=gemini-3.1-flash-lite
GEMINI_CLI_TIMEOUT_MS=300000
LLM_ROUTING_ENABLED=true
GEMINI_CLI_MODEL_LIGHT=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_STANDARD=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_REASONING=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_FALLBACK=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_HEAVY=gemini-3.1-flash-lite
GEMINI_CLI_TIMEOUT_LIGHT_MS=90000
GEMINI_CLI_TIMEOUT_STANDARD_MS=180000
GEMINI_CLI_TIMEOUT_REASONING_MS=240000
GEMINI_CLI_TIMEOUT_FALLBACK_MS=90000
GEMINI_CLI_TIMEOUT_HEAVY_MS=300000
LLM_FULL_REPORT_TIMEOUT_MS=180000
LLM_FULL_REPORT_FALLBACK_TIMEOUT_MS=120000
LLM_FAILURE_COOLDOWN_MS=300000
STOCK_NARRATIVE_LLM_TIMEOUT_MS=90000
LLM_TRANSLATION_BATCH_SIZE=35
LLM_TRANSLATION_ITEM_LIMIT=220
LLM_TRANSLATION_PROVIDER=none # 可改为 gemini-cli/gemini/openai；none 会用本地中文兜底，避免定时报表被翻译阻塞

GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_MODEL_LIGHT=gemini-3.1-flash-lite
GEMINI_MODEL_STANDARD=gemini-3.1-flash-lite
GEMINI_MODEL_REASONING=gemini-3.1-flash-lite
GEMINI_MODEL_FALLBACK=gemini-3.1-flash-lite
GEMINI_MODEL_HEAVY=gemini-3.1-flash-lite
GEMINI_TIMEOUT_LIGHT_MS=60000
GEMINI_TIMEOUT_STANDARD_MS=120000
GEMINI_TIMEOUT_HEAVY_MS=240000

YOUTUBE_API_KEY=...
YOUTUBE_FEED_URLS=https://www.youtube.com/feeds/videos.xml?channel_id=UCEAZeUIeJs0IjQiqTCdVSIg,https://www.youtube.com/feeds/videos.xml?channel_id=UCIALMKvObZNtJ6AmdCLP7Lg,https://www.youtube.com/feeds/videos.xml?channel_id=UCvJJ_dzjViJCoLf5uKUTwoA
YOUTUBE_FEED_TIMEOUT_MS=15000
YOUTUBE_FEED_CONCURRENCY=4
YAHOO_NEWS_SEARCH_TIMEOUT_MS=15000
FINNHUB_API_KEY=...
FINNHUB_NEWS_TIMEOUT_MS=15000
FINNHUB_NEWS_CONCURRENCY=6
ALPHAVANTAGE_API_KEY=...
HOT_NEWS_ENABLED=true
HOT_NEWS_LIMIT=50
HOT_NEWS_ALPHA_VANTAGE_ENABLED=true
HOT_NEWS_NEWSAPI_ENABLED=true
NEWSAPI_KEY=...
HOT_NEWS_POLYGON_ENABLED=true
POLYGON_API_KEY=...
POLYGON_NEWS_BASE_URL=https://api.polygon.io
HOT_NEWS_RSS_ENABLED=true
HOT_NEWS_RSS_URLS=https://feeds.content.dowjones.io/public/rss/mw_topstories
OPTIONS_ENABLED=true
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
OPTIONS_TICKER_LIMIT=10     # 定时报告预抓数量；单股页缺失时会自动补抓，失败后可点击“重试补抓期权链”写回报告
OPTIONS_EXPIRATION_LIMIT=6
OPTIONS_NASDAQ_LIMIT=420
OPTIONS_UNUSUAL_ACTIVITY_ENABLED=true
OPTIONS_UNUSUAL_ACTIVITY_LIMIT=8
OPTIONS_UNUSUAL_MIN_VOLUME=100
OPTIONS_UNUSUAL_MIN_NOTIONAL=1000000
OPTIONS_UNUSUAL_MIN_VOLUME_OI_RATIO=0.5
IBKR_CP_BASE_URL=https://localhost:5000/v1/api # 可选 Client Portal fallback/Portal 源；期权链优先 Socket 4001
IBKR_CP_REJECT_UNAUTHORIZED=false # 本机 Client Portal Gateway 常用自签名证书
IBKR_CP_TIMEOUT_MS=45000
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
IBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
IBKR_MARKETDATA_ENABLED=true
QUOTE_PROVIDER_ORDER=ibkr,finnhub,alphavantage
TECHNICAL_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
IBKR_CP_KEEPALIVE_ENABLED=true
IBKR_CP_KEEPALIVE_MS=60000
IBKR_TRADING_READ_ENABLED=true
IBKR_TRADING_ENABLED=false
IBKR_PAPER_ONLY=true
IBKR_MARKETDATA_HISTORY_PERIOD=6m
IBKR_MARKETDATA_HISTORY_BAR=1d
IBKR_OPTIONS_PREFLIGHT_TIMEOUT_MS=20000
IBKR_CP_SNAPSHOT_WARMUP_MS=1200
IBKR_OPTIONS_EXPIRATION_LIMIT=3
IBKR_OPTIONS_STRIKE_LIMIT=16
IBKR_OPTIONS_CONTRACT_LIMIT=96
IBKR_OPTIONS_DATA_SECONDS=8     # Socket 期权盘口/OI/Greeks 短时等待窗口；定义链会先返回
IBKR_OPTIONS_SNAPSHOT_BATCH_SIZE=60
SEC_USER_AGENT="YourApp/0.1 your@email.com"
PORT=5173
OPENBB_ENABLED=true
OPENBB_PYTHON_COMMAND=python3
OPENBB_BRIDGE_SCRIPT=scripts/openbb_bridge.py
OPENBB_PROVIDER=
OPENBB_TICKER_LIMIT=8
SOCIAL_REDDIT_ENABLED=true
SOCIAL_REDDIT_SUBREDDITS=wallstreetbets,stocks,investing,options
SOCIAL_REDDIT_POST_LIMIT=25
SOCIAL_STOCKTWITS_ENABLED=true
SOCIAL_STOCKTWITS_LIMIT=20
X_SEARCH_ENABLED=true
X_BEARER_TOKEN=...
X_SEARCH_MAX_RESULTS=20
NITTER_BASE_URL=
NITTER_SEARCH_ENABLED=false
NITTER_SEARCH_LIMIT=20
XHS_CLI_COMMAND=python3
XHS_CLI_ARGS_TEMPLATE="scripts/xhs_search.py search {keyword} --json --limit 10"
XHS_CLI_TIMEOUT_MS=60000
XHS_COOKIE=
XHS_KEYWORDS=美股,美股投资,英伟达,NVDA,特斯拉,TSLA,苹果,AAPL,微软,MSFT,AI股票
SOCIAL_FEED_URLS=

REPORT_EMAIL_ENABLED=true
REPORT_EMAIL_TO=panzf98@gmail.com
REPORT_EMAIL_FROM_NAME="Market Pulse AI"
REPORT_EMAIL_FROM=you@gmail.com
RESEND_API_KEY=...
RESEND_FROM="Market Pulse AI <onboarding@resend.dev>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@gmail.com
SMTP_PASS=your_gmail_app_password

TRADE_HISTORY_LIMIT=5000
STOCK_HISTORY_LIMIT=8000
IBKR_FLEX_TOKEN=
IBKR_FLEX_QUERY_ID=
IBKR_FLEX_USER_AGENT="MarketPulseAI/0.1"
```

`.env` 已加入 `.gitignore`，不会被提交。

## 可选环境变量

```bash
LLM_PROVIDER=auto           # auto | local | gemini-cli | gemini | openai
SCHEDULE_LLM_PROVIDER=local # 定时盘前/盘后报告默认走本地规则，避免外部 LLM 超时影响邮件
GEMINI_CLI_COMMAND=gemini   # Gemini CLI 命令路径
GEMINI_CLI_MODEL=gemini-3.1-flash-lite
GEMINI_CLI_TIMEOUT_MS=300000
LLM_ROUTING_ENABLED=true     # 开启任务路由：轻任务/常规任务/推理任务/降级摘要/重任务走不同 Gemini 模型
GEMINI_CLI_MODEL_LIGHT=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_STANDARD=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_REASONING=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_FALLBACK=gemini-3.1-flash-lite
GEMINI_CLI_MODEL_HEAVY=gemini-3.1-flash-lite
GEMINI_CLI_TIMEOUT_LIGHT_MS=90000
GEMINI_CLI_TIMEOUT_STANDARD_MS=180000
GEMINI_CLI_TIMEOUT_REASONING_MS=240000
GEMINI_CLI_TIMEOUT_FALLBACK_MS=90000
GEMINI_CLI_TIMEOUT_HEAVY_MS=300000
LLM_FULL_REPORT_TIMEOUT_MS=180000 # 最终整份报告 pro 调用的最长等待
LLM_FULL_REPORT_FALLBACK_TIMEOUT_MS=120000 # pro 失败后，fallback/flash 降级报告的最长等待
LLM_FAILURE_COOLDOWN_MS=300000 # 外部 LLM 超时/失败后 5 分钟内快速本地兜底
STOCK_NARRATIVE_LLM_TIMEOUT_MS=90000 # 单股叙事 LLM 的最长等待；失败后使用本地单股分析
LLM_TRANSLATION_BATCH_SIZE=35
LLM_TRANSLATION_ITEM_LIMIT=220
GEMINI_API_KEY=...          # 开启 Gemini 摘要与聊天
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_MODEL_LIGHT=gemini-3.1-flash-lite
GEMINI_MODEL_STANDARD=gemini-3.1-flash-lite
GEMINI_MODEL_HEAVY=gemini-3.1-flash-lite
GEMINI_TIMEOUT_LIGHT_MS=60000
GEMINI_TIMEOUT_STANDARD_MS=120000
GEMINI_TIMEOUT_HEAVY_MS=240000
OPENAI_API_KEY=...          # 可选：OpenAI 摘要与聊天
OPENAI_MODEL=gpt-4o-mini
FINNHUB_API_KEY=...         # 开启报价
ALPHAVANTAGE_API_KEY=...    # 开启备用报价
HOT_NEWS_ENABLED=true       # 开启当日热门新闻汇总
HOT_NEWS_ALPHA_VANTAGE_ENABLED=true # 使用 Alpha Vantage News Sentiment 发现热点
NEWSAPI_KEY=...             # 可选：NewsAPI 聚合 Reuters/MarketWatch/CNBC 等财经站
POLYGON_API_KEY=...         # 可选：Polygon/Massive 股票新闻
HOT_NEWS_RSS_URLS=https://feeds.content.dowjones.io/public/rss/mw_topstories # 可选：公开财经 RSS
OPTIONS_ENABLED=true        # 开启期权链/GEX
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub # 默认先预检查 IBKR Gateway；未登录会自动跳过，再降级到 Nasdaq/Yahoo/Finnhub
OPTIONS_TICKER_LIMIT=10     # 定时报告预抓数量；单股页缺失时可点击“立即补抓期权链”按需写回报告
OPTIONS_EXPIRATION_LIMIT=6
OPTIONS_NASDAQ_LIMIT=420
OPTIONS_UNUSUAL_ACTIVITY_ENABLED=true
OPTIONS_UNUSUAL_ACTIVITY_LIMIT=8
OPTIONS_UNUSUAL_MIN_VOLUME=100
OPTIONS_UNUSUAL_MIN_NOTIONAL=1000000
OPTIONS_UNUSUAL_MIN_VOLUME_OI_RATIO=0.5
OPTIONS_CACHE_TTL_DAYS=1     # 期权链 provider 抖动时复用最近成功链
OPTIONS_CACHE_LIMIT=80
IBKR_CP_BASE_URL=https://localhost:5000/v1/api # IBKR Client Portal Gateway；现在仅作旧接口 fallback/Portal 源，期权优先走 Socket 4001
IBKR_CP_REJECT_UNAUTHORIZED=false
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
IBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
IBKR_OPTIONS_PREFLIGHT_TIMEOUT_MS=20000
IBKR_CP_TIMEOUT_MS=45000
IBKR_CP_SNAPSHOT_WARMUP_MS=1200
IBKR_OPTIONS_EXPIRATION_LIMIT=3
IBKR_OPTIONS_STRIKE_LIMIT=16
IBKR_OPTIONS_CONTRACT_LIMIT=96
IBKR_OPTIONS_DATA_SECONDS=8
IBKR_OPTIONS_SNAPSHOT_BATCH_SIZE=60
YOUTUBE_API_KEY=...         # 开启 YouTube 官方搜索信号
YOUTUBE_FEED_URLS=...       # 可选：YouTube 频道 RSS 兜底，不需要 API key
YOUTUBE_FEED_TIMEOUT_MS=15000 # RSS 被网络拦截时快速失败，避免拖慢整轮采集
YOUTUBE_FEED_CONCURRENCY=4
YAHOO_NEWS_SEARCH_TIMEOUT_MS=15000 # Yahoo 新闻 fallback 被风控/403 时快速失败并停止后续搜索
FINNHUB_NEWS_TIMEOUT_MS=15000 # Finnhub 公司新闻单 ticker 请求超时
FINNHUB_NEWS_CONCURRENCY=6   # Finnhub 公司新闻并发，避免研究池扩大后拖慢整轮
SEC_USER_AGENT="YourApp/0.1 your@email.com"
PORT=5173
SOCIAL_REDDIT_ENABLED=true  # 开启 Reddit 热门讨论抓取
SOCIAL_REDDIT_SUBREDDITS=wallstreetbets,stocks,investing,options
SOCIAL_REDDIT_POST_LIMIT=25
SOCIAL_APEWISDOM_ENABLED=true # 开启 ApeWisdom Reddit 热议聚合榜
SOCIAL_APEWISDOM_LIMIT=80
SOCIAL_TREND_ENRICH_LIMIT=10 # 将热议榜前 N 个 ticker 加入临时研究池，补抓新闻/行情/基本面
TECHNICAL_YAHOO_ENABLED=false # 当前网络下 Yahoo 图表常 403；false 时使用 Finnhub 指标兜底生成关键价位
OPENBB_ENABLED=true        # 开启 OpenBB Platform 接入
OPENBB_MODE=auto           # auto | python | rest；auto 会优先 Python SDK，必要时试 REST
OPENBB_PYTHON_COMMAND=python3 # 建议指向已安装 openbb 的虚拟环境 Python
OPENBB_BRIDGE_SCRIPT=scripts/openbb_bridge.py
OPENBB_PROVIDER=           # 可填 yfinance/fmp/benzinga/tiingo 等 OpenBB provider，留空由 route 自行选择
OPENBB_REST_BASE_URL=      # 可选：本地 OpenBB REST，例如 http://127.0.0.1:8000
OPENBB_REST_AUTH_HEADER=   # 可选：REST 需要鉴权时填 Authorization header 内容
OPENBB_COLLECTOR_SECTIONS=discovery,identity,filings,profile,metrics,news
OPENBB_TICKER_LIMIT=8
OPENBB_DISCOVERY_LIMIT=25
OPENBB_NEWS_LIMIT=40
OPENBB_TIMEOUT_MS=120000
OPENBB_ROUTE_TIMEOUT_MS=30000
SEC_FILING_SKIP_TICKERS=QQQ,SPY,DIA,IWM,SMH,VIXY,TLT,UUP,GLD,VOO,VTI,IVV,VT,VEA,VWO # ETF/指数代理不跑公司 SEC filings
ARTICLE_EXTRACT_ENABLED=true # 新闻 URL 正文抽取，用于催化总结
ARTICLE_EXTRACTOR_PYTHON=python3
ARTICLE_EXTRACTOR_SCRIPT=scripts/article_extractor.py
ARTICLE_EXTRACT_LIMIT=24
ARTICLE_EXTRACT_TIMEOUT_MS=120000
ARTICLE_EXTRACT_ITEM_TIMEOUT_MS=90000 # 单篇正文抽取硬上限，避免慢页面拖住整轮报告
ARTICLE_EXTRACT_RUN_BUDGET_MS=180000 # 单轮正文抽取总预算；优先保证高材料性新闻
ARTICLE_EXTRACT_MIN_REMAINING_MS=12000 # 低于该剩余时间时跳过后续正文抽取，避免整轮采集拖尾
ARTICLE_EXTRACT_TEXT_LIMIT=8000
ARTICLE_SOURCE_RESOLVE_ENABLED=true # Finnhub/Google News 中间链接会先解析真实原文 URL，再抽正文
ARTICLE_SOURCE_RESOLVE_TIMEOUT_MS=15000
GOOGLE_NEWS_DECODE_ENABLED=true     # Google News RSS articles 链接先走签名解码；失败再标题搜索反查
GOOGLE_NEWS_DECODE_TIMEOUT_MS=15000
ARTICLE_READER_FALLBACK_ENABLED=true # 本地抽取 403/读空时尝试 Reader API fallback
ARTICLE_READER_BASE_URL=https://r.jina.ai
ARTICLE_CACHE_TTL_DAYS=7       # 成功抽取的新闻正文缓存天数，避免同一原文反复超时
ARTICLE_CACHE_LIMIT=300        # 最多缓存多少篇成功正文
ARTICLE_LLM_SUMMARY_ENABLED=true # 抽取成功后，对材料性新闻做 LLM 中文摘要
ARTICLE_LLM_SUMMARY_LIMIT=8      # 每轮最多让 LLM 读几篇新闻原文
ARTICLE_LLM_SUMMARY_TIMEOUT_MS=90000 # 单篇原文 LLM 摘要最长等待
ARTICLE_LLM_SUMMARY_RUN_BUDGET_MS=180000 # 单轮原文 LLM 摘要总预算，避免拖慢整轮报告
ARTICLE_LLM_SUMMARY_MIN_REMAINING_MS=15000 # 低于该剩余时间时跳过后续 LLM 摘要，保留本地正文摘要
ARTICLE_LLM_TEXT_LIMIT=7000      # 单篇原文送入 LLM 的最大字符数
ARTICLE_LLM_CONCURRENCY=1        # Gemini CLI 建议保持 1，避免并发卡顿
ARTICLE_LLM_PROVIDER=            # 留空沿用本轮采集 provider；也可指定 gemini-cli/gemini/openai/local
MARKET_OVERVIEW_ENABLED=true # 开启大盘整体情况：优先 IBKR Socket 真实指数 ^IXIC/^GSPC/^VIX，再 fallback 到 ETF 代理
MARKET_OVERVIEW_LLM_ENABLED=true # 对真实指数、ETF 补充和 IBKR Portal 材料生成 AI 投研结论，不直接展示原文
MARKET_OVERVIEW_LLM_TIMEOUT_MS=90000 # 大盘结论 LLM 最长等待；超时会用本地规则合成
HOT_NEWS_ENABLED=true # 开启市场热闻板块：Finnhub general market news + Yahoo market search + OpenBB/IBKR Portal
HOT_NEWS_LIMIT=50
SOCIAL_STOCKTWITS_ENABLED=true # 开启 Stocktwits 个股社区流
SOCIAL_STOCKTWITS_LIMIT=20
X_SEARCH_ENABLED=true       # 开启 X 官方 recent search；需要 X_BEARER_TOKEN
X_BEARER_TOKEN=...
X_SEARCH_MAX_RESULTS=20
NITTER_BASE_URL=            # 自建 Nitter 实例，例如 https://nitter.example.com
NITTER_SEARCH_ENABLED=false
NITTER_SEARCH_LIMIT=20
XHS_CLI_COMMAND=python3     # 小红书适配器；留空但配置了 XHS_COOKIE 时会默认使用 python3
XHS_CLI_ARGS_TEMPLATE="scripts/xhs_search.py search {keyword} --json --limit 10"
XHS_CLI_TIMEOUT_MS=60000
XHS_COOKIE=                 # 从已登录浏览器复制的小红书 Cookie；平台风控可能导致失效
XHS_KEYWORDS=美股,美股投资,英伟达,NVDA,特斯拉,TSLA,苹果,AAPL,微软,MSFT,AI股票
SOCIAL_FEED_URLS=           # 逗号分隔的 RSS/Atom/JSON 社交源
REPORT_EMAIL_ENABLED=true  # 定时盘前/盘后采集后发送报告
REPORT_EMAIL_TO=panzf98@gmail.com
REPORT_EMAIL_FROM_NAME="Market Pulse AI"
REPORT_EMAIL_FROM=you@gmail.com
RESEND_API_KEY=...         # 推荐：用 Resend API 发邮件；配置后优先于 SMTP
RESEND_FROM="Market Pulse AI <onboarding@resend.dev>"
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_STARTTLS=false
SMTP_USER=you@gmail.com
SMTP_PASS=...              # Gmail 需要 App Password，不是网页登录密码
SMTP_TIMEOUT_MS=30000
TRADE_HISTORY_LIMIT=5000   # 本地最多保留多少笔操作/成交
STOCK_HISTORY_LIMIT=8000   # 本地最多保留多少条 ticker 历史快照
TRADE_REVIEW_LIMIT=50      # 最多保留多少份复盘报告
IBKR_FLEX_TOKEN=           # IBKR Flex Web Service token
IBKR_FLEX_QUERY_ID=        # Trade Confirmation 或 Activity Flex Query ID
IBKR_FLEX_VERSION=3
IBKR_FLEX_USER_AGENT="MarketPulseAI/0.1"
IBKR_FLEX_WAIT_MS=6000
IBKR_FLEX_TIMEOUT_MS=30000
```

没有任何 LLM key 也可以运行；系统会使用 SEC EDGAR、Yahoo Finance 新闻发现和本地规则分析器。`LLM_PROVIDER=local` 会强制使用本地规则，适合外部 LLM 超时或 API 不稳定时生成稳定日报；`LLM_PROVIDER=auto` 时优先使用 Gemini 接口，其次使用 OpenAI。

网页顶部可以在本地规则、Gemini 接口、Gemini CLI 和 GPT 之间切换；这个选择会作用于本次手动采集和聊天。服务端定时盘前/盘后采集使用 `.env` 中的 `SCHEDULE_LLM_PROVIDER`，默认 `local`，如果确认外部 LLM 稳定再改成 `gemini-cli`、`gemini` 或 `openai`。

## 社交热议

系统优先接入 ApeWisdom 的 Reddit 热议 ticker 聚合榜作为无 key 稳定兜底；同时会尝试抓取 Reddit 热门讨论和 Stocktwits 个股流。如果配置 X Bearer Token，也会抓 X recent search；如果配置自建 Nitter、小红书 CLI/MCP 或自定义 RSS/JSON feed，也会统一进入 `socialPosts`。系统会把热议榜前 `SOCIAL_TREND_ENRICH_LIMIT` 个 ticker 临时加入研究池，补抓新闻、SEC、报价、技术面和基本面，再按排名、提及次数、赞同数、行业/主业、基本面和近期新闻催化生成“社交热议股票”。页面会展示热门理由和非个性化投资观察建议。该建议只用于提示下一步核验动作和风险控制，不是买卖指令。

调研到的可接入方案：

- X/Twitter：官方 X API 的 recent search 或 filtered stream 最稳定；Nitter 可以自建 RSS 实例，但近年需要账号/session 支持，公共实例不可靠。
- Reddit/WSB 聚合：ApeWisdom 已经把 Reddit/WSB 等讨论聚合成 ticker 排名、mentions、upvotes 和 24h 变化，稳定性明显好于本机直接抓 Reddit。
- 小红书：`xiaohongshu-mcp`、`xiaohongshu-cli`、`redbook` 这类项目可以搜索笔记、读取详情和评论；多数依赖登录态、Cookie 或浏览器自动化，适合由你单独登录后通过 CLI/MCP 暴露结果。
- 其他来源：Stocktwits、RSS、新闻聚合、Discord/Telegram 导出等都可以通过 `SOCIAL_FEED_URLS` 或页面里的“自定义社交源”接成 RSS/Atom/JSON，再由现有聚合器统一评分。

采集和分析阶段会保留英文/原始材料，避免为了分析提前翻译两遍；最终写入页面、邮件报告和聊天摘要时才使用中文标题、摘要和中文 LLM 输出。

## 操作日志与交易复盘

右侧“交易复盘”面板可以记录和编辑每一笔操作：时间、ticker、买卖方向、数量、价格、费用、策略、理由、情绪、标签和备注。系统会用 FIFO 计算已实现盈亏、胜率、未实现盈亏，并把最近操作和当时的 ticker 历史快照放在一起展示；面板也会按标的列出持仓数量、均价/现价、已实现与未实现盈亏，方便先定位贡献或拖累最大的股票。“持仓风险”面板可以一键从交易日志未平仓 lot 同步持仓，并立即用最新报告里的报价/技术指标重算风险。平仓后还会按策略、标签、情绪、持仓周期、月度和“是否有计划”拆解绩效，并计算期望值、最大回撤、盈利因子、盈亏比、最长连胜/连亏，方便定位哪些交易模式真的赚钱、哪些标签或情绪在拖累。系统还会根据缺少计划、FOMO/追高标签、负期望、回撤、连续亏损等信号生成“复盘待办”，把下一步该核查的问题直接列出来；待办可以在页面标记完成、忽略或重开，也可以补充处理备注，状态和备注都会本地保存。

面板里的“导出交易”会下载原始交易 CSV；“导出复盘”会下载完整 JSON，包含原始交易、FIFO journal、全部平仓 lot、权益曲线/回撤指标、历史快照覆盖和最近复盘文本。也可以直接调用：

```bash
curl -o trades.csv "http://localhost:5173/api/trades/export?format=csv"
curl -o trade-journal.json "http://localhost:5173/api/trade-journal/export?format=json"
```

每次盘前、盘后或手动采集完成后，服务会为关注列表里的每个 ticker 追加一条 `stockHistory` 快照，包含：

- 报价：价格、前收、开盘、涨跌幅、来源
- 技术面：趋势、RSI、20/50 日均线、ATR
- 基本面：市值、P/E、P/S、收入同比、净利率
- 信息面：新闻、SEC、社交和视频数量
- 发现器：评分、分类和热门理由

这样后续复盘不会只看到“我买了/卖了”，还可以回看当时是否追高、是否有真实催化剂、是否缺少入场计划。聊天上下文也会带上交易日志，所以可以直接问：“我最近是不是在追高？”、“MRVL 那笔交易当时信息面是什么？”

## IBKR 同步

当前实现了 IBKR Flex Web Service 的同步入口。你需要在 IBKR Client Portal 里启用 Flex Web Service，创建 Trade Confirmation 或 Activity Flex Query，然后把 token 和 Query ID 写入 `.env`：

```bash
IBKR_FLEX_TOKEN=...
IBKR_FLEX_QUERY_ID=...
```

页面点击“同步 IBKR Flex”后，服务会调用 `/SendRequest` 生成报表，再调用 `/GetStatement` 取 XML，并把 `<Trade>` / `<TradeConfirm>` 记录导入本地交易日志。导入会按 `execId` 或交易关键信息去重。若 IBKR Flex Web Service 因网络、代理或 IBKR 端限流不可达，也可以在 IBKR Client Portal 下载 Flex XML 后直接粘贴到“导入 CSV / IBKR”文本框，本地会复用同一套 XML 解析器导入。

IBKR 的几个限制需要注意：

- Flex Web Service 适合补历史账单和每日同步；Trade Confirmation 通常不是实时，成交后可能延迟数分钟才进入报表。
- TWS API / IB Gateway 的 execution callback 更适合当天实时监听，但需要你本机 TWS 或 IB Gateway 在线，并且历史范围有限。
- 本地 FIFO 复盘只用于行为分析；最终盈亏、税务和账单核对应以 IBKR 官方报表为准。

### IBKR 期权链

期权链默认会优先尝试 IBKR Gateway/TWS Socket 4001 provider。它使用官方 TWS API 的合约详情、`reqSecDefOptParams` 和短时 market data stream 拉取 AAPL/MRVL 这类已有期权的标的；Client Portal 5000 现在只是旧接口 fallback 或 IBKR Portal 内容源。若 Socket 未启动、未登录或 4001 被禁用，系统会记录一条跳过说明，然后自动降级到 Nasdaq/Yahoo/Finnhub。

```bash
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
IBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
IBKR_OPTIONS_PREFLIGHT_TIMEOUT_MS=20000
IBKR_OPTIONS_DATA_SECONDS=8
```

IBKR 期权合约定义通常可以通过 Socket API 查询，但实时行情、监管快照、Greeks、open interest 等字段可能依赖订阅或产生 IBKR 侧费用；系统会在缺少 Greeks 时用 bid/ask 中间价估算 IV/Gamma/GEX，并在数据质量里记录 Socket 未登录、行情缺失或字段缺失。

如果期权链诊断失败，先确认 IB Gateway/TWS 已登录，并在 API 设置里启用 Socket 客户端、端口为 `4001`、允许 `127.0.0.1`。如果只有 Client Portal 的 `https://localhost:5000` 不通，不会阻断 Socket 期权链；它只影响旧接口 fallback 或 Portal 自动导入。

### IBKR 行情和K线

行情和技术指标默认优先尝试 IB Gateway/TWS Socket API；当前这台机器已验证 `127.0.0.1:4001` 可连接。若 snapshot 因市场数据订阅不足没有价格，会自动降级到 Finnhub/Alpha Vantage；K线优先使用 Socket historical。

```bash
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
IBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python
IBKR_MARKETDATA_ENABLED=true
QUOTE_PROVIDER_ORDER=ibkr,finnhub,alphavantage
TECHNICAL_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
IBKR_MARKETDATA_HISTORY_PERIOD=6m
IBKR_MARKETDATA_HISTORY_BAR=1d
```

`/api/source-diagnostics?keys=ibkr-gateway,ibkr-marketdata,ibkr-trading` 会验证 Socket 连接、账户/持仓只读、AAPL snapshot / historical K线。Client Portal `https://localhost:5000/v1/api` 仍可用于期权链；如果 5000 被占用，Socket K线不受影响。

## OpenBB 接入

系统通过 `scripts/openbb_bridge.py` 调用 OpenBB Platform Python SDK，也支持连接 OpenBB REST API。中文页面会展示 OpenBB 环境状态、当前后端、route 覆盖和每个 ticker 的 quote / historical / profile / metrics / news / options 数据状态。

定时报告默认只跑 `identity,filings` 两个稳定 SEC route，避免 Yahoo/FMP/Intrinio 等外部 provider 限流导致整轮报告超时。完整 OpenBB 能力仍然通过页面里的任意 route 调用开放；如果你希望定时报告也抓市场数据，可以把 `.env` 改成：

```bash
OPENBB_COLLECTOR_SECTIONS=discovery,identity,filings,profile,metrics,news
```

建议单独创建 Python 环境安装 OpenBB，然后把 `.env` 的 `OPENBB_PYTHON_COMMAND` 指向该环境的 Python：

```bash
python -m pip install openbb openbb-yfinance
python scripts/openbb_bridge.py probe
python scripts/openbb_bridge.py bundle --symbols AAPL,MSFT --provider yfinance --sections identity,filings
```

如果想用 OpenBB 官方 REST 服务形态，可以在同一个 Python 环境启动 FastAPI：

```bash
uvicorn openbb_core.api.rest_api:app --host 127.0.0.1 --port 8000
```

然后配置：

```bash
OPENBB_MODE=rest
OPENBB_REST_BASE_URL=http://127.0.0.1:8000
```

后端也提供任意 route 调用接口：

```bash
curl -X POST http://localhost:5173/api/openbb/call \
  -H 'Content-Type: application/json' \
  -d '{"route":"equity.price.quote","params":{"symbol":"AAPL","provider":"yfinance"}}'
```

如果当前 Python 环境未安装 `openbb`，页面会用中文显示安装建议，不会让整轮采集失败。

## 新闻正文抽取

系统会用 `scripts/article_extractor.py` 抽取新闻原文正文，再把正文摘要、关键证据句和投资影响写入“新闻催化”。抽取顺序是 `trafilatura`、标准库 HTML fallback、Reader API fallback；这样遇到 403、正文为空或 `trafilatura` 卡住时，也能尽量拿到正文。成功抽取的正文会缓存到本地 store，下一轮遇到同一原文会直接复用，避免 Yahoo/付费墙页面因为网络抖动反复超时。推荐在同一个 Python 环境安装：

```bash
python -m pip install trafilatura
```

当前接入参考的是 GitHub 上常用的正文抽取项目 `adbar/trafilatura`，Reader fallback 默认使用 `https://r.jina.ai`。如果新闻源返回的是 Finnhub 这类中间链接，系统会先按标题反查原文 URL，再抓正文；遇到付费墙/反爬时会记录 `article.status`，并保留标题级兜底。

## 大盘整体情况

首页会生成“大盘整体情况”面板，优先通过 IBKR Gateway/TWS Socket 4001 的 `IND` 合约日线读取 `^IXIC`（IBKR: COMP）、`^GSPC`（IBKR: SPX）、`^VIX`（IBKR: VIX）和 `^RUT`（IBKR: RUT），再用 SMH、TLT、UUP、GLD 等 ETF 补充板块、利率、美元和避险线索。若真实指数不可用，系统才会 fallback 到 QQQ/SPY/VIXY/IWM 等 ETF 代理，并在 caveat 中明确标注代理误差。

首页还会生成“市场热闻”板块。数据源包括 Finnhub general market news、Yahoo Finance market search、OpenBB news 和导入的 IBKR Portal Hot News；这些热闻会并入新闻池，复用原文抽取、中文摘要和投资观察逻辑。

IBKR Portal 的 Home / Market Overview / Hot News 可以作为大盘叙事增强源。由于 IBKR 网页内容依赖登录态前端渲染，系统不保存 cookie，也不会绕过登录；首页右侧提供“IBKR Portal 大盘与 Hot News”导入框。打开已登录的 IBKR Portal，复制 Market Overview 或 Hot News 卡片里的可见文本粘贴进去，下一次采集会把它作为 `IBKR Portal Market Overview` / `IBKR Portal Hot News` 新闻材料，进入中文摘要、投资观察、数据质量和大盘卡片。

```env
IBKR_PORTAL_NEWS_ENABLED=true
IBKR_PORTAL_URLS=
IBKR_PORTAL_COLLECT_LIMIT=16
IBKR_PORTAL_LLM_LIMIT=6
```

`IBKR_PORTAL_URLS` 只适合以后接入可直接返回正文的内部/导出地址；普通 `https://ndcdyn.interactivebrokers.com/portal/...` 通常只返回 Client Portal 前端壳，系统会跳过并提示改用页面导入。

提醒面板支持把重复或已处理的提醒标记为“忽略”，同类提醒会按稳定指纹保留状态；需要重新跟踪时可以点“重开”。邮件报告和个股风险只会把未忽略提醒作为待处理风险。

右侧“历史简报”会列出最近 12 次采集，点击任意一条可以回看当时的大盘、个股日报、发现器、新闻/SEC、OpenBB 和回测结果；如果不是最新报告，顶部简报会标记为“历史回看”。为了保持页面加载速度，首页状态接口只返回历史摘要，具体历史报告会在点击时按需加载。

## 使用 Gemini CLI

如果你有 Google AI Pro/Ultra 并且 Gemini CLI 能正常走账号登录，可以把 `LLM_PROVIDER` 设为 `gemini-cli`。本项目会用 headless 方式调用：

```bash
gemini --prompt "..." --output-format json --model pro
```

官方安装方式：

```bash
npm install -g @google/gemini-cli
gemini
```

第一次运行 `gemini` 时选择 `Login with Google`，并用绑定 Pro/Ultra 的 Google 账号登录。后端调用 CLI 时会在临时目录运行，并从子进程环境里移除 `GEMINI_API_KEY`，尽量避免误走 API key 配额。

### LLM 任务路由

为了降低 Gemini CLI 超时概率，默认开启 `LLM_ROUTING_ENABLED=true`：

- `light`：标题翻译、本地化、短聊天，走 `GEMINI_CLI_MODEL_LIGHT=gemini-3.1-flash-lite`，默认 15 秒超时；如果 CLI 卡住，会快速回退本地答案。
- `standard`：新闻原文单篇摘要、普通股票叙事、常规报告摘要，走 `GEMINI_CLI_MODEL_STANDARD=gemini-3.1-flash-lite`，默认 60 秒超时。
- `reasoning`：交易复盘、单股深度判断、社交热议归因，走 `GEMINI_CLI_MODEL_REASONING=gemini-3.1-flash-lite`，默认 90 秒超时。
- `fallback`：主报告失败后的快速降级摘要，走 `GEMINI_CLI_MODEL_FALLBACK=gemini-3.1-flash-lite`，默认 45 秒超时。
- `heavy`：整份盘前/盘后深度摘要、长上下文深度研究，走 `GEMINI_CLI_MODEL_HEAVY=gemini-3.1-flash-lite`，默认 120 秒超时。

Gemini API 模式也支持同样的 `LIGHT/STANDARD/REASONING/FALLBACK/HEAVY` 配置项；但当前项目优先把 Gemini CLI 作为 Google One/Ultra 登录态通道。
外部 LLM 如果超时或返回错误，会进入 `LLM_FAILURE_COOLDOWN_MS` 的短期熔断窗口；窗口内聊天和采集会快速使用本地规则兜底，避免页面反复卡住。点击“运行诊断”会绕过熔断重新实测连通性。

## 定时

服务运行期间，每 30 秒检查一次纽约时间：

- 盘前：08:30 America/New_York
- 盘后：16:30 America/New_York

默认 `SCHEDULE_CATCH_UP_MINUTES=75`，也就是如果电脑短暂睡眠、网络慢或服务刚好重启错过精确分钟，只要仍在 75 分钟窗口内且当天该场次没有执行，服务会自动补跑一次。超过窗口、机器长期关机或服务停止时仍不会执行。

定时采集完成后，如果 `.env` 里 Resend 或 SMTP 配置完整，服务会自动把本次报告发送到 `REPORT_EMAIL_TO`。网页右侧“定时采集”面板会显示邮件配置状态、最近一次发送记录，并提供“发送最新报告”按钮用于测试。配置了 `RESEND_API_KEY` 时优先使用 Resend；否则回落到 SMTP。

这一版没有交易所节假日判断。只要 `node server.mjs` 保持运行，定时任务就会自动触发。当前 Desktop 目录建议先用 `screen -dmS market-pulse-ai ...` 持续运行；如果迁移到非隐私目录或已授予后台访问权限，再用 `./scripts/install_launch_agent.sh --replace-screen` 安装 LaunchAgent 做登录自启动和异常拉起。

## 数据风险

- Yahoo Finance 搜索只作为新闻发现 fallback，不是授权行情源。
- Reddit 热门讨论只代表讨论密度，容易混入玩笑、营销、误导或高度投机内容。
- X、小红书和自定义社交源会受登录态、付费权限、限流、反爬和平台规则影响；缺失数据比错误数据更安全，系统会把异常记录到数据质量面板。
- SEC EDGAR 是官方来源，但本版仅抓重点文件，且 filing 时间按日期粒度处理；ETF/指数代理默认跳过公司 CIK/filings 检查。
- LLM 只做归纳和解释，价格、计数和链接由代码生成。
- 默认不下单，不连接券商交易权限。
