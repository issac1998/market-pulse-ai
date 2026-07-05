const els = {
  runDiagnostics: document.getElementById("runDiagnostics"),
  configSummary: document.getElementById("configSummary"),
  readyScore: document.getElementById("readyScore"),
  okCount: document.getElementById("okCount"),
  todoCount: document.getElementById("todoCount"),
  priorityList: document.getElementById("priorityList"),
  diagnosticTime: document.getElementById("diagnosticTime"),
  diagnosticGrid: document.getElementById("diagnosticGrid"),
  guideGrid: document.getElementById("guideGrid"),
  envConfigGrid: document.getElementById("envConfigGrid"),
  envConfigMessage: document.getElementById("envConfigMessage"),
  saveEnvConfig: document.getElementById("saveEnvConfig"),
  integrationTaskList: document.getElementById("integrationTaskList"),
  transportWarning: document.getElementById("transportWarning"),
  transportWarningText: document.getElementById("transportWarningText"),
};

const guideSections = [
  {
    key: "core",
    title: "1. 核心行情和披露",
    diagnostics: ["finnhub"],
    summary: "先保证行情、新闻和 SEC 披露可用，这是日报、个股页和聊天上下文的底座。",
    steps: [
      "在 Finnhub 创建 API key。",
      "把 FINNHUB_API_KEY 写入项目根目录 .env。",
      "填写 SEC_USER_AGENT，建议使用你的真实邮箱或项目标识。",
      "重启 node server.mjs，然后运行诊断。",
    ],
    env: "FINNHUB_API_KEY=你的_finnhub_key\nSEC_USER_AGENT=MarketPulseAI/0.1 your_email@example.com",
  },
  {
    key: "llm",
    title: "2. LLM 路由",
    diagnostics: ["llm", "codex-cli", "antigravity-cli", "gemini-api"],
    summary: "默认调度、Agent 和深度分析走 Codex CLI；新闻正文摘要单独走 Antigravity 的 Gemini Pro；聊天只在页面上由用户触发。",
    steps: [
      "确认 codex --version 可用，并保持 Codex CLI 已登录。",
      "确认 agy --version 可用；ARTICLE_LLM_PROVIDER=antigravity-cli 会让新闻正文摘要走 agy 的 Gemini Pro 档。",
      "Codex CLI 模型留空时使用 Codex 当前默认模型；如需固定模型再设置 CODEX_CLI_MODEL_*。",
      "也可以配置 OPENAI_API_KEY / GEMINI_API_KEY 作为备用。",
      "外部 LLM 不稳定时，页面顶部先选本地规则，报告仍可生成。",
    ],
    env:
      "LLM_PROVIDER=codex-cli\nSCHEDULE_LLM_PROVIDER=codex-cli\nCODEX_CLI_COMMAND=codex\nCODEX_CLI_ARGS_JSON=[\"exec\",\"--color\",\"never\",\"--sandbox\",\"read-only\",\"--skip-git-repo-check\",\"--ephemeral\",\"--output-last-message\",\"{output_file}\",\"-\"]\nCODEX_CLI_MODEL=\nCODEX_CLI_TIMEOUT_STANDARD_MS=300000\nCODEX_CLI_TIMEOUT_REASONING_MS=600000\nARTICLE_LLM_PROVIDER=antigravity-cli\nANTIGRAVITY_CLI_MODEL_REASONING=gemini-3.1-pro-preview\nLLM_DIAGNOSTIC_TIMEOUT_MS=180000",
  },
  {
    key: "stability",
    title: "2.1 稳定性与采集超时",
    diagnostics: [],
    summary: "给每类外部采集器设置总 deadline，某个源超时会被标记为 timeout，本轮报告继续生成。",
    steps: [
      "保持默认 COLLECTOR_TIMEOUT_MS=300000。",
      "COLLECTOR_TIMEOUTS 可按源调整，例如 Hot News、Options Chain、OpenBB Platform。",
      "如果网络很慢，可以适当调大 Hot News 或 Company News，但需要重启服务。",
      "数据质量里看到 timeout 时，优先检查该源 key、代理、套餐权限和站点限流。",
    ],
    env:
      "COLLECTOR_TIMEOUT_MS=300000\nCOLLECTOR_TIMEOUTS=Social Media=180000,SEC EDGAR=240000,Company News=240000,YouTube=120000,Quotes=180000,Technical Chart=180000,Fundamentals=180000,Options Chain=180000,OpenBB Platform=240000,OpenBB News Articles=180000,Hot News=240000,Market Overview=180000,IBKR Portal=120000,Longbridge Microstructure=120000",
  },
  {
    key: "articles",
    title: "3. 新闻正文和 AI 投研摘要",
    diagnostics: [],
    summary: "系统会打开新闻原文、抽取正文、优先用 LLM 生成中文摘要和投资观察；LLM 超时时才降级到本地正文分析。",
    steps: [
      "保持 ARTICLE_EXTRACT_ENABLED=true。",
      "保持 Jina Reader fallback，用于源站反爬或 HTML 混乱时兜底。",
      "ARTICLE_LLM_SUMMARY_ENABLED=true 时，会对高材料性新闻调用 LLM；诊断超时不会阻止正式采集再尝试一次。",
      "如果 Antigravity/Gemini Pro 连续超时，ARTICLE_LLM_FAILURE_LIMIT 会触发文章摘要熔断，后续条目保留本地正文摘要。",
      "页面新闻卡片会标明 LLM 或本地 AI 规则来源。",
    ],
    env:
      "ARTICLE_EXTRACT_ENABLED=true\nARTICLE_READER_FALLBACK_ENABLED=true\nARTICLE_READER_BASE_URL=https://r.jina.ai\nARTICLE_EXTRACT_TIMEOUT_MS=120000\nARTICLE_EXTRACT_ITEM_TIMEOUT_MS=90000\nARTICLE_EXTRACT_RUN_BUDGET_MS=180000\nARTICLE_LLM_SUMMARY_ENABLED=true\nARTICLE_LLM_SUMMARY_LIMIT=8\nARTICLE_LLM_SUMMARY_TIMEOUT_MS=90000\nARTICLE_LLM_SUMMARY_RUN_BUDGET_MS=180000\nARTICLE_LLM_FAILURE_LIMIT=2\nARTICLE_LLM_FAILURE_COOLDOWN_MS=180000",
  },
  {
    key: "hotnews",
    title: "4. 当日热门新闻 API",
    diagnostics: ["alpha-vantage-news", "newsapi-hot-news", "polygon-hot-news", "hot-news-rss", "google-ticker-news-rss"],
    summary: "增强新闻源用来发现全市场热闻和个股新闻，再交给正文抽取和 LLM 过滤噪音；缺 key 时系统会继续用 Finnhub、OpenBB、SEC、RSS、Google News ticker RSS 和网页抽取兜底。",
    links: [
      { label: "Alpha Vantage", href: "https://www.alphavantage.co/support/#api-key" },
      { label: "NewsAPI", href: "https://newsapi.org/register" },
      { label: "Polygon", href: "https://polygon.io/dashboard/api-keys" },
    ],
    steps: [
      "先配置 Alpha Vantage，适合 News Sentiment 和情绪标签，但免费套餐频率低。",
      "再配置 NewsAPI，用于聚合 Reuters、MarketWatch、CNBC 等财经站热闻。",
      "如果需要个股新闻端点，配置 Polygon/Massive key。",
      "保留 HOT_NEWS_RSS_URLS，并开启默认 RSS fallback，作为无 key 热闻兜底。",
      "保持 HOT_NEWS_GOOGLE_TICKER_RSS_ENABLED=true，系统会围绕研究池 ticker 动态搜索近几天新闻。",
      "HOT_NEWS_GOOGLE_TICKER_RSS_RESERVE 控制个股动态新闻保底进入 Hot News 候选的条数，避免被大盘静态 RSS 完全挤掉。",
      "配置后点击本节“测试本节配置”，如果套餐不含新闻权限，诊断会显示 403 并自动降级。",
    ],
    env:
      "HOT_NEWS_ENABLED=true\nHOT_NEWS_ALPHA_VANTAGE_ENABLED=true\nALPHAVANTAGE_API_KEY=你的_alpha_vantage_key\nHOT_NEWS_NEWSAPI_ENABLED=true\nNEWSAPI_KEY=你的_newsapi_key\nHOT_NEWS_POLYGON_ENABLED=true\nPOLYGON_API_KEY=你的_polygon_or_massive_key\nPOLYGON_NEWS_BASE_URL=https://api.polygon.io\nHOT_NEWS_RSS_ENABLED=true\nHOT_NEWS_RSS_DEFAULT_FALLBACK_ENABLED=true\nHOT_NEWS_GOOGLE_TICKER_RSS_ENABLED=true\nHOT_NEWS_GOOGLE_TICKER_RSS_TICKER_LIMIT=12\nHOT_NEWS_GOOGLE_TICKER_RSS_LIMIT=4\nHOT_NEWS_GOOGLE_TICKER_RSS_RESERVE=6\nMARKET_EDITORIAL_BRIEF_ARTICLE_LIMIT=4\nMARKET_EDITORIAL_BRIEF_RUN_BUDGET_MS=90000\nMARKET_EDITORIAL_BRIEF_LLM_ENABLED=true\nMARKET_EDITORIAL_BRIEF_LLM_TIMEOUT_MS=90000\nHOT_NEWS_RSS_URLS=https://feeds.content.dowjones.io/public/rss/mw_topstories,https://www.cnbc.com/id/10000664/device/rss/rss.html,https://finance.yahoo.com/news/rssindex,https://www.nasdaq.com/feed/rssoutbound?category=Markets,https://www.nasdaq.com/feed/rssoutbound?category=Stocks,https://seekingalpha.com/market_currents.xml,https://www.investing.com/rss/news.rss,https://news.google.com/rss/search?q=stock%20market%20when:1d&hl=en-US&gl=US&ceid=US:en,https://news.google.com/rss/search?q=market%20movers%20stocks%20when:1d&hl=en-US&gl=US&ceid=US:en",
  },
  {
    key: "social",
    title: "5. 全市场社交发现",
    diagnostics: ["custom-social-feeds"],
    summary: "ApeWisdom 是当前无 key 的全市场热榜主力；系统会再用新闻原文、行情、基本面和技术面解释它为什么热。",
    steps: [
      "保持 SOCIAL_APEWISDOM_ENABLED=true。",
      "SOCIAL_TREND_ENRICH_LIMIT 控制从全市场热榜临时扩展研究池的 ticker 数。",
      "保持 Stocktwits 全市场 trending 开启，用作 X token 缺失时的交易者热度补位。",
      "X Bearer Token 缺失时，开启 Stocktwits 单标的轻量补抓，补足自选股讨论上下文。",
      "自定义 RSS/JSON 可以在主页面“数据源状态”里添加。",
      "ApeWisdom 只提供排名、提及数和 24h 变化；真正的热门理由由系统回补公司画像、新闻原文、行情和技术面。",
      "社交热度只做发现线索，必须用新闻、披露、行情和基本面交叉验证。",
    ],
    env: "SOCIAL_APEWISDOM_ENABLED=true\nSOCIAL_APEWISDOM_LIMIT=80\nSOCIAL_TREND_ENRICH_LIMIT=24\nSOCIAL_STOCKTWITS_ENABLED=true\nSOCIAL_STOCKTWITS_TRENDING_ENABLED=true\nSOCIAL_STOCKTWITS_TRENDING_LIMIT=80\nSOCIAL_STOCKTWITS_SYMBOL_ENABLED=false\nSOCIAL_STOCKTWITS_SYMBOL_FALLBACK_WHEN_X_MISSING=true\nSOCIAL_STOCKTWITS_SYMBOL_FALLBACK_TICKER_LIMIT=6\nSOCIAL_STOCKTWITS_SYMBOL_FALLBACK_LIMIT=8\nSOCIAL_FEED_URLS=https://example.com/feed.xml",
  },
  {
    key: "x",
    title: "6. X / Twitter",
    diagnostics: ["x-search"],
    summary: "X 官方 recent search 是实时讨论源；没有 Bearer Token 时系统会继续使用 ApeWisdom 和自定义源兜底。",
    links: [{ label: "X Developer", href: "https://developer.x.com/" }],
    steps: [
      "到 X Developer Portal 创建 Project/App。",
      "复制 Bearer Token。",
      "写入 X_SEARCH_ENABLED=true 和 X_BEARER_TOKEN。",
      "重启服务并运行诊断。",
    ],
    env: "X_SEARCH_ENABLED=true\nX_BEARER_TOKEN=你的_x_bearer_token\nX_SEARCH_MAX_RESULTS=20",
  },
  {
    key: "xhs",
    title: "7. 小红书",
    diagnostics: ["xhs"],
    summary: "中文社区热议依赖网页版 cookie，平台风控强，过期时建议先暂停源。",
    steps: [
      "在浏览器登录小红书网页版。",
      "打开开发者工具复制完整 cookie。",
      "写入 XHS_COOKIE，并确认 XHS_CLI_COMMAND=python3。",
      "如果诊断提示登录过期，重新复制 cookie 后再启用。",
    ],
    env:
      "XHS_COOKIE=你复制的_cookie\nXHS_CLI_COMMAND=python3\nXHS_CLI_ARGS_TEMPLATE=scripts/xhs_search.py search {keyword} --json --limit 10\nXHS_KEYWORDS=美股,美股投资,英伟达,NVDA,特斯拉,TSLA,苹果,AAPL,微软,MSFT,AI股票",
  },
  {
    key: "youtube",
    title: "8. YouTube",
    diagnostics: ["youtube-api", "youtube-rss"],
    summary: "YouTube 用来补充视频叙事线索。API key 比 RSS 更稳，RSS 可作为频道级兜底。",
    links: [{ label: "YouTube Data API v3", href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" }],
    steps: [
      "优先创建 YouTube Data API key。",
      "如果只想跟踪固定频道，配置频道 RSS；不配置也会启用默认 CNBC/Bloomberg 财经频道 fallback。",
      "没有 API key 时，可启用 yt-dlp 搜索 fallback，它只读取搜索结果元数据，不下载视频。",
      "RSS 经常超时或返回 0 条时，健康度会标出限制；保持暂停并改用 API key。",
      "视频只做叙事线索，不作为交易依据。",
    ],
    env:
      "YOUTUBE_API_KEY=你的_youtube_data_api_key\nYOUTUBE_FEED_FALLBACK_ENABLED=true\nYOUTUBE_FEED_URLS=https://www.youtube.com/feeds/videos.xml?channel_id=频道ID\nYOUTUBE_FEED_TIMEOUT_MS=15000\nYOUTUBE_YTDLP_ENABLED=true\nYOUTUBE_YTDLP_PYTHON=.venv-openbb/bin/python\nYOUTUBE_YTDLP_TIMEOUT_MS=90000",
  },
  {
    key: "openbb",
    title: "9. OpenBB",
    diagnostics: ["openbb"],
    summary: "OpenBB 通过 Python bridge 接入，当前已用于 discovery、identity、filings、quote、historical、profile、metrics、news 和 options 的增强采集。",
    steps: [
      "确认 .venv-openbb/bin/python 可用。",
      "保持 OPENBB_ENABLED=true。",
      "默认 collector sections 已包含 quote/historical/options；如果采集太慢，再按需删减。",
      "在主页面 OpenBB 面板可手动调用 route。",
    ],
    env:
      "OPENBB_ENABLED=true\nOPENBB_MODE=auto\nOPENBB_PROVIDER=\nOPENBB_PYTHON_COMMAND=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python\nOPENBB_COLLECTOR_SECTIONS=discovery,identity,filings,quote,historical,profile,metrics,news,options\nOPENBB_TICKER_LIMIT=8\nOPENBB_DISCOVERY_LIMIT=25\nOPENBB_NEWS_LIMIT=40\nOPENBB_TIMEOUT_MS=120000\nOPENBB_ROUTE_TIMEOUT_MS=30000",
  },
  {
    key: "ibkr",
    title: "10. IBKR 交易、行情和期权",
    diagnostics: ["ibkr-gateway", "ibkr-cp", "ibkr-marketdata", "ibkr-trading", "ibkr-flex", "ibkr-portal"],
    summary: "IB Gateway/TWS Socket API 用于账户、持仓、K线、真实指数和期权链；Client Portal 只作旧接口 fallback；Flex 用于同步历史交易；IBKR Portal 可作为大盘/Hot News 叙事增强源。",
    steps: [
      "IBKR Desktop 不等同于 TWS/IB Gateway Socket API；必须启动并登录 IB Gateway 或 TWS。",
      "IB Gateway 登录页选择 IB API。Live 通常用 4001，Paper 通常用 4002；TWS Live/Paper 通常是 7496/7497。",
      "完成登录和手机/设备二次验证前，本机端口不会监听；当前诊断会扫描 4001/4002/7497/7496/4000 并提示哪个端口可用。",
      "确认 IBKR_GATEWAY_PYTHON 指向的 Python 已安装 ibapi；当前推荐用 .venv-openbb/bin/python。",
      "如果用 TWS，在 API Settings 里启用 Socket Client，并允许 127.0.0.1。",
      "如果 Gateway Latest 没有登录窗口且 4001/4002 不监听，检查 ~/Jts/launcher.log；若出现 Toolkit.getLockingKeyState 或 instance of control is not created yet，优先改用 TWS 7496/7497，或安装 IB Gateway Stable 版。",
      "先跑 IBKR Gateway Socket 诊断，再跑 IBKR 行情/K线诊断。",
      "登录后可在首页点击“登录后验证 IBKR”，只读检查 Socket、AAPL 行情、K线和期权链。",
      "跑 IBKR 交易 API 诊断，只读验证账户和当日订单列表，不会下单。",
      "单股页补抓期权链，优先应显示 IBKR Gateway Socket Option Chain；若仍显示 Nasdaq，说明 IBKR 未登录、端口不匹配或市场数据权限不足。",
      "交易 API 先只接 Paper Account 和订单预览；真实下单必须二次确认。",
      "在 IBKR Account Management 创建 Flex Query，勾选 Trades/Open Positions。",
      "写入 Flex token 和 query id 后，在页面点击同步 IBKR Flex。",
      "打开 IBKR Portal Home/Market Overview/Hot News，复制卡片可见文本，粘贴到首页“IBKR Portal 大盘与 Hot News”导入框。",
      "普通 Portal URL 多数只返回前端壳，不要把 IBKR cookie 写进 .env；当前最稳路径是页面导入。",
    ],
    env:
      "IBKR_GATEWAY_ENABLED=true\nIBKR_GATEWAY_HOST=127.0.0.1\nIBKR_GATEWAY_PORT=4001\nIBKR_GATEWAY_PORT_CANDIDATES=4001,4002,7497,7496,4000\nIBKR_GATEWAY_PYTHON=/Users/a/Desktop/codes/market-pulse-ai/.venv-openbb/bin/python\nIBKR_GATEWAY_TIMEOUT_MS=45000\nIBKR_MARKETDATA_ENABLED=true\nQUOTE_PROVIDER_ORDER=ibkr,finnhub,alphavantage\nTECHNICAL_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub\nTECHNICAL_TICKER_LIMIT=24\nTECHNICAL_CONCURRENCY=6\nTECHNICAL_TICKER_TIMEOUT_MS=90000\nOPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub\nOPTIONS_UNUSUAL_ACTIVITY_ENABLED=true\nOPTIONS_UNUSUAL_ACTIVITY_LIMIT=8\nOPTIONS_UNUSUAL_MIN_VOLUME=100\nOPTIONS_UNUSUAL_MIN_NOTIONAL=1000000\nOPTIONS_UNUSUAL_MIN_VOLUME_OI_RATIO=0.5\nIBKR_OPTIONS_PREFLIGHT_TIMEOUT_MS=20000\nIBKR_TRADING_READ_ENABLED=true\nIBKR_TRADING_ENABLED=false\nIBKR_PAPER_ONLY=true\nIBKR_CP_BASE_URL=https://localhost:5000/v1/api\nIBKR_CP_REJECT_UNAUTHORIZED=false\nIBKR_CP_TIMEOUT_MS=45000\nIBKR_PORTAL_NEWS_ENABLED=true\nIBKR_PORTAL_URLS=\nIBKR_PORTAL_COLLECT_LIMIT=16\nIBKR_PORTAL_LLM_LIMIT=6\nIBKR_PORTAL_LLM_TIMEOUT_MS=12000\nIBKR_PORTAL_LLM_CONCURRENCY=2\nIBKR_FLEX_TOKEN=你的_flex_token\nIBKR_FLEX_QUERY_ID=你的_query_id\nIBKR_FLEX_VERSION=3",
  },
  {
    key: "email",
    title: "11. 邮件报告和定时任务",
    diagnostics: ["email"],
    summary: "服务运行时每 30 秒检查纽约时间，默认美东 08:30 盘前、16:30 盘后；当前 Desktop 目录先用 screen 保持运行。",
    steps: [
      "推荐使用 Resend，配置 RESEND_API_KEY 和 RESEND_FROM。",
      "Gmail SMTP 需要 App Password，不是网页登录密码。",
      "REPORT_EMAIL_ENABLED=true 后，定时报告会自动发送。",
      "SCHEDULE_LLM_PROVIDER 默认 codex-cli，邮件和定时报表走 Codex；新闻正文摘要仍按 ARTICLE_LLM_PROVIDER 单独路由。",
      "SCHEDULE_CATCH_UP_MINUTES 控制定时任务错过精确分钟后的补跑窗口。",
      "当前项目在 Desktop 隐私目录下，先用 screen 保持运行；迁移到 ~/Developer 等目录后再用 LaunchAgent。",
    ],
    env:
      "REPORT_EMAIL_ENABLED=true\nREPORT_EMAIL_TO=你的邮箱@example.com\nRESEND_API_KEY=你的_resend_key\nRESEND_FROM=Market Pulse AI <onboarding@resend.dev>\nSCHEDULE_LLM_PROVIDER=codex-cli\nSCHEDULE_CATCH_UP_MINUTES=75\n\n# 当前 Desktop 路径推荐\nscreen -dmS market-pulse-ai bash -lc 'cd /Users/a/Desktop/codes/market-pulse-ai && exec node server.mjs'\nscreen -ls\n\n# 迁移到非隐私目录后可选\n./scripts/install_launch_agent.sh --replace-screen\n./scripts/launch_agent_status.sh",
  },
];

const integrationTaskMeta = {
  "ibkr-socket": {
    env: ["IBKR_GATEWAY_PORT", "IBKR_GATEWAY_PORT_CANDIDATES", "IBKR_GATEWAY_CLIENT_ID", "IBKR_GATEWAY_PYTHON"],
    links: [{ label: "IBKR 配置攻略", href: "#guide-ibkr" }],
  },
  youtube: {
    env: ["YOUTUBE_API_KEY", "YOUTUBE_FEED_FALLBACK_ENABLED", "YOUTUBE_YTDLP_ENABLED"],
    links: [
      { label: "YouTube Data API", href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com" },
      { label: "YouTube 攻略", href: "#guide-youtube" },
    ],
  },
  "x-search": {
    env: ["X_SEARCH_ENABLED", "X_BEARER_TOKEN"],
    links: [
      { label: "X Developer", href: "https://developer.x.com/" },
      { label: "X 攻略", href: "#guide-x" },
    ],
  },
  "enhanced-news": {
    env: ["NEWSAPI_KEY", "POLYGON_API_KEY", "ALPHAVANTAGE_API_KEY"],
    links: [
      { label: "NewsAPI", href: "https://newsapi.org/register" },
      { label: "Polygon", href: "https://polygon.io/dashboard/api-keys" },
      { label: "Alpha Vantage", href: "https://www.alphavantage.co/support/#api-key" },
      { label: "热门新闻攻略", href: "#guide-hotnews" },
    ],
  },
};

let appState = null;
let diagnostics = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusLabel(status) {
  if (status === "ok") return "已完成";
  if (status === "warn") return "需关注";
  if (status === "fail") return "未通过";
  if (status === "skipped") return "已暂停";
  return status || "未知";
}

function statusClass(status) {
  if (status === "ok") return "green";
  if (status === "warn" || status === "skipped") return "amber";
  return "red";
}

function integrationTaskClass(status) {
  if (status === "ok") return "green";
  if (status === "fallback") return "amber";
  if (status === "manual" || status === "warn") return "red";
  return "";
}

function shortText(value, max = 420) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function diagnosticMap() {
  return new Map((diagnostics?.rows || []).map((row) => [row.key, row]));
}

function mergeDiagnosticRows(partialDiagnostics) {
  const incoming = partialDiagnostics?.rows || [];
  if (!incoming.length) return;
  const existing = diagnostics?.rows || [];
  const map = new Map(existing.map((row) => [row.key, row]));
  for (const row of incoming) map.set(row.key, row);
  const merged = existing.map((row) => map.get(row.key)).filter(Boolean);
  for (const row of incoming) {
    if (!existing.some((item) => item.key === row.key)) merged.push(row);
  }
  diagnostics = {
    ...(diagnostics || {}),
    generatedAt: partialDiagnostics.generatedAt || diagnostics?.generatedAt || new Date().toISOString(),
    rows: merged,
  };
}

function sectionStatus(section) {
  const map = diagnosticMap();
  const rows = (section.diagnostics || []).map((key) => map.get(key)).filter(Boolean);
  if (!rows.length) return "ok";
  if (rows.some((row) => row.status === "ok")) return "ok";
  if (rows.some((row) => row.status === "fail")) return "fail";
  if (rows.some((row) => row.status === "warn" || row.status === "skipped")) return "warn";
  return "warn";
}

function diagnosticSummaryFor(keys = []) {
  const map = diagnosticMap();
  return keys
    .map((key) => map.get(key))
    .filter(Boolean)
    .map((row) => `${row.label || row.key}：${statusLabel(row.status)}${row.detail ? `，${row.detail}` : ""}`)
    .join("；");
}

function groupedEnvFields() {
  const fields = appState?.config?.envConfig?.fields || [];
  const groups = new Map();
  for (const field of fields) {
    const group = field.group || "其他";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(field);
  }
  return groups;
}

function renderEnvConfig() {
  if (!els.envConfigGrid) return;
  const groups = groupedEnvFields();
  if (!groups.size) {
    els.envConfigGrid.innerHTML = `<div class="empty-state">当前服务没有暴露可写配置项。</div>`;
    return;
  }
  els.envConfigGrid.innerHTML = [...groups.entries()]
    .map(
      ([group, fields]) => `<article class="env-config-card">
        <h3>${escapeHtml(group)}</h3>
        <div class="env-field-list">
          ${fields.map(renderEnvField).join("")}
        </div>
      </article>`,
    )
    .join("");
}

function renderEnvField(field) {
  const input = field.multiline
    ? `<textarea data-env-key="${escapeHtml(field.key)}" rows="${field.secret ? 3 : 2}" placeholder="${escapeHtml(field.placeholder || "")}"></textarea>`
    : `<input data-env-key="${escapeHtml(field.key)}" type="${field.secret ? "password" : "text"}" placeholder="${escapeHtml(field.placeholder || "")}" />`;
  return `<label class="env-field">
    <span>
      <strong>${escapeHtml(field.label || field.key)}</strong>
      <small>${escapeHtml(field.key)}</small>
    </span>
    <div class="env-field-status">
      <span class="tag ${field.configured ? "green" : "amber"}">${field.configured ? "已配置" : "未配置"}</span>
      <span class="tag ${field.live ? "green" : "amber"}">${field.live ? "可热更新" : "需重启"}</span>
    </div>
    ${input}
  </label>`;
}

function renderSummary() {
  const readiness = appState?.latest?.dataQuality?.readiness;
  const score = readiness?.score ?? readiness ?? "-";
  const rows = diagnostics?.rows || [];
  const ok = rows.filter((row) => row.status === "ok").length;
  const todo = rows.filter((row) => row.status && row.status !== "ok").length;
  els.readyScore.textContent = typeof score === "number" ? String(score) : score;
  els.okCount.textContent = String(ok);
  els.todoCount.textContent = String(todo);
  const latest = appState?.latest;
  els.configSummary.textContent = latest?.id
    ? `最新报告 ${fmtTime(latest.completedAt)}，可用度 ${score}；当前配置缺口会在下面按优先级列出。`
    : "还没有报告。先回到信息台手动刷新一次，再按诊断补齐配置。";
  els.diagnosticTime.textContent = diagnostics?.generatedAt ? fmtTime(diagnostics.generatedAt) : "未诊断";
}

function renderTransportWarning() {
  if (!els.transportWarning) return;
  const transport = appState?.config?.transport || {};
  const warning = transport.exposureWarning || "";
  els.transportWarning.hidden = !warning;
  if (els.transportWarningText) {
    els.transportWarningText.textContent = warning
      ? `${warning} 当前绑定：${transport.host || "-"}:${transport.port || "-"}。`
      : "";
  }
}

function renderIntegrationTasks() {
  if (!els.integrationTaskList) return;
  const readiness = appState?.config?.integrationReadiness || {};
  const items = Array.isArray(readiness.items) ? readiness.items : [];
  if (!items.length) {
    els.integrationTaskList.innerHTML = `<div class="empty-state">暂无外部接入状态。请先运行诊断。</div>`;
    return;
  }
  els.integrationTaskList.innerHTML = items
    .map((item) => {
      const meta = integrationTaskMeta[item.key] || {};
      const verifyKeys = Array.isArray(item.verifyKeys) ? item.verifyKeys : [];
      const env = Array.isArray(meta.env) ? meta.env : [];
      const links = Array.isArray(meta.links) ? meta.links : [];
      return `<article class="integration-task-card ${escapeHtml(item.status || "")}">
        <div class="row">
          <div>
            <h3>${escapeHtml(item.title || item.key)}</h3>
            <p class="muted">${escapeHtml(shortText(item.evidence || "尚未完成诊断。"))}</p>
          </div>
          <span class="tag ${integrationTaskClass(item.status)}">${escapeHtml(item.statusLabel || item.label || item.status || "未知")}</span>
        </div>
        ${item.fallback ? `<p><strong>当前兜底：</strong>${escapeHtml(shortText(item.fallback, 260))}</p>` : ""}
        ${item.nextAction ? `<p><strong>下一步：</strong>${escapeHtml(shortText(item.nextAction, 300))}</p>` : ""}
        ${
          env.length
            ? `<div class="task-chip-row">${env.map((key) => `<span class="tag">${escapeHtml(key)}</span>`).join("")}</div>`
            : ""
        }
        <div class="integration-task-actions">
          ${
            verifyKeys.length
              ? `<button class="btn compact" type="button" data-test-diagnostics="${escapeHtml(verifyKeys.join(","))}" data-ignore-disabled="true">复检这项</button>`
              : ""
          }
          ${links
            .map(
              (link) =>
                `<a class="btn compact ghost" href="${escapeHtml(link.href)}" ${
                  String(link.href || "").startsWith("#") ? "" : 'target="_blank" rel="noreferrer"'
                }>${escapeHtml(link.label)}</a>`,
            )
            .join("")}
        </div>
      </article>`;
    })
    .join("");
}

function renderDiagnostics() {
  const rows = diagnostics?.rows || [];
  if (!rows.length) {
    els.diagnosticGrid.innerHTML = `<div class="empty-state">暂无诊断结果。点击“运行诊断”。</div>`;
    return;
  }
  els.diagnosticGrid.innerHTML = rows
    .map(
      (row) => `<article class="diagnostic-row config-diagnostic-row">
        <div>
          <strong>${escapeHtml(row.label || row.key)}</strong>
          <p>${escapeHtml(row.detail || "")}</p>
          ${row.action ? `<p class="muted">下一步：${escapeHtml(row.action)}</p>` : ""}
        </div>
        <div class="config-row-actions">
          <span class="tag ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
          <button class="btn compact ghost" type="button" data-test-diagnostics="${escapeHtml(row.key)}" data-ignore-disabled="true">强制测试</button>
        </div>
      </article>`,
    )
    .join("");
}

function renderPriority() {
  const rows = (diagnostics?.rows || []).filter((row) => row.status && row.status !== "ok");
  const priorityOrder = ["fail", "warn", "skipped"];
  rows.sort((a, b) => priorityOrder.indexOf(a.status) - priorityOrder.indexOf(b.status));
  if (!rows.length) {
    els.priorityList.innerHTML = `<div class="empty-state">当前诊断没有未完成项。</div>`;
    return;
  }
  els.priorityList.innerHTML = rows
    .slice(0, 8)
    .map(
      (row) => `<article class="config-priority-card">
        <div class="row">
          <strong>${escapeHtml(row.label || row.key)}</strong>
          <span class="tag ${statusClass(row.status)}">${escapeHtml(statusLabel(row.status))}</span>
        </div>
        <p>${escapeHtml(row.detail || "需要补充配置。")}</p>
        <p class="muted">${escapeHtml(row.action || "按下方配置攻略补齐后重启服务并重新诊断。")}</p>
      </article>`,
    )
    .join("");
}

function renderGuide() {
  els.guideGrid.innerHTML = guideSections
    .map((section) => {
      const status = sectionStatus(section);
      const diagnostic = diagnosticSummaryFor(section.diagnostics);
      return `<article id="guide-${escapeHtml(section.key)}" class="config-guide-card ${escapeHtml(status)}">
        <div class="row">
          <h3>${escapeHtml(section.title)}</h3>
          <span class="tag ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>
        </div>
        <p>${escapeHtml(section.summary)}</p>
        ${diagnostic ? `<p class="muted">${escapeHtml(diagnostic)}</p>` : ""}
        ${
          section.links?.length
            ? `<div class="guide-links">${section.links
                .map((link) => `<a class="btn compact ghost" href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`)
                .join("")}</div>`
            : ""
        }
        <ol>${section.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        <pre><code>${escapeHtml(section.env)}</code></pre>
        ${
          section.diagnostics?.length
            ? `<button class="btn compact" type="button" data-test-diagnostics="${escapeHtml(section.diagnostics.join(","))}" data-ignore-disabled="true">测试本节配置</button>`
            : ""
        }
      </article>`;
    })
    .join("");
}

function renderAll() {
  renderTransportWarning();
  renderSummary();
  renderIntegrationTasks();
  renderEnvConfig();
  renderPriority();
  renderDiagnostics();
  renderGuide();
}

async function loadState() {
  const data = await api("/api/state");
  appState = data;
  diagnostics = data.sourceDiagnostics || null;
  renderAll();
}

async function runDiagnostics() {
  els.runDiagnostics.disabled = true;
  els.runDiagnostics.textContent = "诊断中...";
  try {
    const result = await api("/api/source-diagnostics");
    diagnostics = result.diagnostics || null;
    if (result.config) {
      appState ||= {};
      appState.config = result.config;
    }
    renderAll();
  } catch (error) {
    alert(`诊断失败：${error.message}`);
  } finally {
    els.runDiagnostics.disabled = false;
    els.runDiagnostics.textContent = "运行诊断";
  }
}

async function runTargetDiagnostics(keys, button) {
  const normalizedKeys = String(keys || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!normalizedKeys.length) return;
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "测试中...";
  }
  try {
    const params = new URLSearchParams({
      keys: normalizedKeys.join(","),
      ignoreDisabled: "true",
    });
    const result = await api(`/api/source-diagnostics?${params.toString()}`);
    mergeDiagnosticRows(result.diagnostics);
    if (result.config) {
      appState ||= {};
      appState.config = result.config;
    }
    renderAll();
  } catch (error) {
    alert(`单项诊断失败：${error.message}`);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original || "强制测试";
    }
  }
}

function changedKeysNeedExternalSmoke(keys = []) {
  const set = new Set(keys);
  return [
    "YOUTUBE_API_KEY",
    "X_BEARER_TOKEN",
    "NEWSAPI_KEY",
    "POLYGON_API_KEY",
    "ALPHAVANTAGE_API_KEY",
    "HOT_NEWS_RSS_URLS",
    "HOT_NEWS_RSS_DEFAULT_FALLBACK_ENABLED",
    "MARKET_EDITORIAL_BRIEF_ARTICLE_LIMIT",
    "MARKET_EDITORIAL_BRIEF_RUN_BUDGET_MS",
    "MARKET_EDITORIAL_BRIEF_LLM_ENABLED",
    "MARKET_EDITORIAL_BRIEF_LLM_TIMEOUT_MS",
    "HOT_NEWS_GOOGLE_TICKER_RSS_ENABLED",
    "HOT_NEWS_GOOGLE_TICKER_RSS_TICKER_LIMIT",
    "HOT_NEWS_GOOGLE_TICKER_RSS_LIMIT",
    "HOT_NEWS_GOOGLE_TICKER_RSS_RESERVE",
    "HOT_NEWS_GOOGLE_TICKER_RSS_TIMEOUT_MS",
    "YOUTUBE_FEED_URLS",
    "YOUTUBE_FEED_FALLBACK_ENABLED",
    "YOUTUBE_YTDLP_ENABLED",
    "YOUTUBE_YTDLP_PYTHON",
    "YOUTUBE_YTDLP_TIMEOUT_MS",
    "SOCIAL_STOCKTWITS_ENABLED",
    "SOCIAL_STOCKTWITS_TRENDING_ENABLED",
    "SOCIAL_STOCKTWITS_SYMBOL_ENABLED",
    "SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_WHEN_X_MISSING",
    "SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_TICKER_LIMIT",
    "SOCIAL_STOCKTWITS_SYMBOL_FALLBACK_LIMIT",
  ].some((key) => set.has(key));
}

function changedKeysNeedIbkrSmoke(keys = []) {
  const set = new Set(keys);
  return [
    "IBKR_GATEWAY_ENABLED",
    "IBKR_GATEWAY_PORT",
    "IBKR_GATEWAY_PORT_CANDIDATES",
    "IBKR_GATEWAY_CLIENT_ID",
    "IBKR_GATEWAY_PYTHON",
    "IBKR_OPTIONS_PREFLIGHT_TIMEOUT_MS",
    "IBKR_OPTIONS_PREFLIGHT_CACHE_TTL_MS",
    "OPTIONS_UNUSUAL_ACTIVITY_ENABLED",
    "OPTIONS_UNUSUAL_ACTIVITY_LIMIT",
    "OPTIONS_UNUSUAL_MIN_VOLUME",
    "OPTIONS_UNUSUAL_MIN_NOTIONAL",
    "OPTIONS_UNUSUAL_MIN_VOLUME_OI_RATIO",
  ].some((key) => set.has(key));
}

async function runPostSaveChecks(result) {
  const changedKeys = [...(result.updatedKeys || []), ...(result.clearedKeys || [])];
  const messages = [];
  const diagnosticKeys = [...new Set(result.recommendedDiagnostics || [])];
  if (diagnosticKeys.length) {
    const params = new URLSearchParams({
      keys: diagnosticKeys.join(","),
      ignoreDisabled: "true",
    });
    const diagnosticsResult = await api(`/api/source-diagnostics?${params.toString()}`);
    mergeDiagnosticRows(diagnosticsResult.diagnostics);
    if (diagnosticsResult.config) {
      appState ||= {};
      appState.config = diagnosticsResult.config;
    }
    const rows = diagnosticsResult.diagnostics?.rows || [];
    messages.push(`已复检 ${rows.length} 个相关诊断。`);
  }
  if (changedKeysNeedExternalSmoke(changedKeys)) {
    const smokeResult = await api("/api/external-provider-smoke-test", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const smoke = smokeResult.smoke || {};
    if (smoke.rows?.length) {
      mergeDiagnosticRows({
        generatedAt: smoke.generatedAt,
        rows: smoke.rows,
      });
    }
    messages.push(smoke.summary || "外部 API smoke test 已完成。");
  }
  if (changedKeysNeedIbkrSmoke(changedKeys)) {
    const smokeResult = await api("/api/ibkr/socket-smoke-test", {
      method: "POST",
      body: JSON.stringify({ ticker: "AAPL" }),
    });
    const smoke = smokeResult.smoke || {};
    messages.push(smoke.summary || "IBKR smoke test 已完成。");
  }
  return messages;
}

async function saveEnvConfig() {
  const inputs = [...document.querySelectorAll("[data-env-key]")];
  const updates = {};
  for (const input of inputs) {
    const value = String(input.value || "").trim();
    if (value) updates[input.dataset.envKey] = value;
  }
  if (!Object.keys(updates).length) {
    els.envConfigMessage.textContent = "没有填写新配置；留空不会覆盖已有密钥。";
    return;
  }
  els.saveEnvConfig.disabled = true;
  els.saveEnvConfig.textContent = "保存中...";
  els.envConfigMessage.textContent = "";
  try {
    const result = await api("/api/env-config", {
      method: "POST",
      body: JSON.stringify({ updates }),
    });
    appState ||= {};
    appState.config = result.config || appState.config || {};
    if (result.sourceDiagnostics) diagnostics = result.sourceDiagnostics;
    for (const input of inputs) input.value = "";
    const changed = [...(result.updatedKeys || []), ...(result.clearedKeys || [])].join("、");
    const restart = (result.restartRecommended || []).length
      ? ` ${result.restartRecommended.join("、")} 需要重启服务后完全生效。`
      : "";
    const enabled = (result.enabledSources || []).length
      ? ` 已自动启用：${result.enabledSources.join("、")}。`
      : "";
    const tests = (result.recommendedDiagnostics || []).length
      ? ` 建议测试：${result.recommendedDiagnostics.join("、")}。`
      : " 建议点击对应“强制测试”。";
    els.envConfigMessage.textContent = `已保存：${changed || "配置"}。${enabled}${restart}${tests} 正在自动复检...`;
    let checkText = "";
    try {
      const messages = await runPostSaveChecks(result);
      checkText = messages.length ? ` 自动复检：${messages.join(" ")}` : "";
    } catch (checkError) {
      checkText = ` 自动复检失败：${checkError.message}`;
    }
    els.envConfigMessage.textContent = `已保存：${changed || "配置"}。${enabled}${restart}${tests}${checkText}`;
    renderAll();
  } catch (error) {
    els.envConfigMessage.textContent = `保存失败：${error.message}`;
  } finally {
    els.saveEnvConfig.disabled = false;
    els.saveEnvConfig.textContent = "保存到 .env";
  }
}

els.runDiagnostics.addEventListener("click", runDiagnostics);
els.saveEnvConfig?.addEventListener("click", saveEnvConfig);
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-test-diagnostics]");
  if (!button) return;
  runTargetDiagnostics(button.dataset.testDiagnostics, button);
});

loadState().catch((error) => {
  els.configSummary.textContent = `配置状态读取失败：${error.message}`;
});
