const els = {
  runPre: document.getElementById("runPre"),
  runPost: document.getElementById("runPost"),
  runManual: document.getElementById("runManual"),
  briefTitle: document.getElementById("briefTitle"),
  briefMeta: document.getElementById("briefMeta"),
  statusGrid: document.getElementById("statusGrid"),
  marketOverview: document.getElementById("marketOverview"),
  hotNewsList: document.getElementById("hotNewsList"),
  moversWithReasonsBox: document.getElementById("moversWithReasonsBox"),
  eventCalendarBox: document.getElementById("eventCalendarBox"),
  actionSuggestionsBox: document.getElementById("actionSuggestionsBox"),
  allStockAgentBox: document.getElementById("allStockAgentBox"),
  todayDeskBox: document.getElementById("todayDeskBox"),
  runAllStockAgent: document.getElementById("runAllStockAgent"),
  runAllStockAgentBacktest: document.getElementById("runAllStockAgentBacktest"),
  stockReportForm: document.getElementById("stockReportForm"),
  stockReportInput: document.getElementById("stockReportInput"),
  stockReportOptions: document.getElementById("stockReportOptions"),
  stockReportFetch: document.getElementById("stockReportFetch"),
  stockReportBox: document.getElementById("stockReportBox"),
  stockDeepDiveBox: document.getElementById("stockDeepDiveBox"),
  discoveryGrid: document.getElementById("discoveryGrid"),
  socialGrid: document.getElementById("socialGrid"),
  analysisProvider: document.getElementById("analysisProvider"),
  analysisBody: document.getElementById("analysisBody"),
  tickerGrid: document.getElementById("tickerGrid"),
  technicalGrid: document.getElementById("technicalGrid"),
  fundamentalGrid: document.getElementById("fundamentalGrid"),
  openbbGrid: document.getElementById("openbbGrid"),
  capabilityRadar: document.getElementById("capabilityRadar"),
  openbbRouteForm: document.getElementById("openbbRouteForm"),
  openbbRouteInput: document.getElementById("openbbRouteInput"),
  openbbParamsInput: document.getElementById("openbbParamsInput"),
  openbbRouteResult: document.getElementById("openbbRouteResult"),
  backtestBox: document.getElementById("backtestBox"),
  watchlistForm: document.getElementById("watchlistForm"),
  watchlistInput: document.getElementById("watchlistInput"),
  watchlistAddInput: document.getElementById("watchlistAddInput"),
  watchlistAddButton: document.getElementById("watchlistAddButton"),
  newsList: document.getElementById("newsList"),
  filingList: document.getElementById("filingList"),
  chatLog: document.getElementById("chatLog"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  portfolioForm: document.getElementById("portfolioForm"),
  portfolioInput: document.getElementById("portfolioInput"),
  portfolioFromTradesButton: document.getElementById("portfolioFromTradesButton"),
  portfolioBox: document.getElementById("portfolioBox"),
  tradeForm: document.getElementById("tradeForm"),
  tradeDate: document.getElementById("tradeDate"),
  tradeTicker: document.getElementById("tradeTicker"),
  tradeSide: document.getElementById("tradeSide"),
  tradeQuantity: document.getElementById("tradeQuantity"),
  tradePrice: document.getElementById("tradePrice"),
  tradeFees: document.getElementById("tradeFees"),
  tradeStrategy: document.getElementById("tradeStrategy"),
  tradeThesis: document.getElementById("tradeThesis"),
  tradeEmotion: document.getElementById("tradeEmotion"),
  tradeTags: document.getElementById("tradeTags"),
  tradeNotes: document.getElementById("tradeNotes"),
  tradeEditBar: document.getElementById("tradeEditBar"),
  tradeEditLabel: document.getElementById("tradeEditLabel"),
  tradeEditCancel: document.getElementById("tradeEditCancel"),
  tradeSubmitButton: document.getElementById("tradeSubmitButton"),
  tradeImportText: document.getElementById("tradeImportText"),
  tradeImportButton: document.getElementById("tradeImportButton"),
  ibkrSyncButton: document.getElementById("ibkrSyncButton"),
  tradeReviewButton: document.getElementById("tradeReviewButton"),
  tradeExportButton: document.getElementById("tradeExportButton"),
  tradeJournalExportButton: document.getElementById("tradeJournalExportButton"),
  tradeJournalBox: document.getElementById("tradeJournalBox"),
  tradeReviewBox: document.getElementById("tradeReviewBox"),
  recommendationReconciliationBox: document.getElementById("recommendationReconciliationBox"),
  alertsBox: document.getElementById("alertsBox"),
  runHistoryBox: document.getElementById("runHistoryBox"),
  scheduleBox: document.getElementById("scheduleBox"),
  ibkrPortalForm: document.getElementById("ibkrPortalForm"),
  ibkrPortalMeta: document.getElementById("ibkrPortalMeta"),
  ibkrPortalKind: document.getElementById("ibkrPortalKind"),
  ibkrPortalInput: document.getElementById("ibkrPortalInput"),
  providerBox: document.getElementById("providerBox"),
  strategyGovernanceBox: document.getElementById("strategyGovernanceBox"),
  diagnoseSources: document.getElementById("diagnoseSources"),
  llmProviderInputs: Array.from(document.querySelectorAll('input[name="llmProvider"]')),
  pagePanels: Array.from(document.querySelectorAll("[data-page-panel]")),
  pageLinks: Array.from(document.querySelectorAll("[data-page-link]")),
  sideColumn: document.querySelector(".side-column"),
};

const LLM_STORAGE_KEY = "marketPulse.llmProvider";
const STOCK_REPORT_STORAGE_KEY = "marketPulse.stockReportTicker";
const RUN_SELECTION_STORAGE_KEY = "marketPulse.selectedRunId";
const STOCK_DETAIL_HASH_PREFIX = "#/stock/";
const LLM_PROVIDERS = new Set(["codex-cli", "gemini", "antigravity-cli", "gemini-cli", "openai"]);
const APP_PAGES = new Set(["home", "actions", "stocks", "social", "research", "portfolio", "ops"]);
const KNOWN_ETF_TICKERS = new Set([
  "ARKK", "DIA", "GLD", "IAU", "IEF", "IVV", "IWM", "KBE", "KRE", "QQQ", "QQQM", "RSP", "SHY",
  "SLV", "SMH", "SOXL", "SOXS", "SOXX", "SPY", "SQQQ", "SVXY", "TLT", "TQQQ", "UUP", "USO",
  "UVXY", "VIXY", "VOO", "VTI", "VXX", "XLB", "XLC", "XLE", "XLF", "XLI", "XLK", "XLP", "XLRE",
  "XLU", "XLV", "XLY", "XOP",
]);
const FALLBACK_TICKER_NAMES_ZH = Object.freeze({
  AAPL: "苹果",
  MSFT: "微软",
  NVDA: "英伟达",
  AMZN: "亚马逊",
  GOOGL: "Alphabet/谷歌",
  GOOG: "Alphabet/谷歌",
  META: "Meta",
  TSLA: "特斯拉",
  AMD: "超威半导体",
  INTC: "英特尔",
  MU: "美光科技",
  ASML: "阿斯麦",
  TSM: "台积电",
  AVGO: "博通",
  MRVL: "美满电子",
  QCOM: "高通",
  ARM: "Arm",
  AMAT: "应用材料",
  LRCX: "泛林集团",
  KLAC: "科磊",
  CDNS: "楷登电子",
  SNPS: "新思科技",
  CRDO: "Credo",
  ALAB: "Astera Labs",
  WDC: "西部数据",
  STX: "希捷科技",
  SNDK: "闪迪",
  GLW: "康宁",
  LITE: "Lumentum",
  BB: "黑莓",
  ORCL: "甲骨文",
  CRM: "赛富时",
  PLTR: "Palantir",
  NFLX: "奈飞",
  DIS: "迪士尼",
  JPM: "摩根大通",
  LLY: "礼来",
  NVO: "诺和诺德",
  PFE: "辉瑞",
  MRK: "默沙东",
  UNH: "联合健康",
  JNJ: "强生",
  XOM: "埃克森美孚",
  CVX: "雪佛龙",
  BABA: "阿里巴巴",
  JD: "京东",
  PDD: "拼多多",
  BIDU: "百度",
  NIO: "蔚来",
  LI: "理想汽车",
  XPEV: "小鹏汽车",
});

let appState = null;
let busy = false;
let editingTradeId = "";
let collectionStatus = null;
let collectionPollTimer = null;
let sourceDiagnostics = null;
let sourceDiagnosticsBusy = false;
let allStockAgentBacktest = null;
let todayRecommendations = null;
let recommendationReconciliation = null;
let strategyVersionsPayload = null;
let strategyValidationPayload = null;
let supplementalDataError = "";
let runDetailWarning = "";
let runHistoryLoading = false;
let runHistoryPagination = { loaded: false, nextOffset: 0, hasMore: false, total: 0 };
const longListPages = { social: 0, stocks: 0 };
const refreshErrors = new Map();
const runDetailCache = new Map();
const runDetailLoading = new Set();
const optionFetchInFlight = new Set();
const stockSnapshotCache = new Map();
const stockSnapshotLoading = new Set();
const stockDeepDiveCache = new Map();
const stockDeepDiveLoading = new Set();
const uziAnalysisCache = new Map();
const uziAnalysisLoading = new Set();

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const raw = res.status === 204 ? "" : await res.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      const invalid = new Error(`接口返回了无效 JSON：${error.message}`);
      invalid.status = res.status;
      throw invalid;
    }
  }
  if (!res.ok) {
    const error = new Error(data?.error || `请求失败（HTTP ${res.status}）`);
    error.status = res.status;
    error.details = data;
    throw error;
  }
  return data;
}

async function loadSupplementalData() {
  supplementalDataError = "";
  const results = await Promise.allSettled([
    api("/api/recommendations/today"),
    api("/api/trade-recommendation-reconciliation"),
    api("/api/strategy-versions"),
    api("/api/strategy-versions/validate"),
  ]);
  const [today, reconciliation, versions, validation] = results;
  if (today.status === "fulfilled") todayRecommendations = today.value.today || null;
  if (reconciliation.status === "fulfilled") recommendationReconciliation = reconciliation.value.reconciliation || null;
  if (versions.status === "fulfilled") strategyVersionsPayload = versions.value || null;
  if (validation.status === "fulfilled") strategyValidationPayload = validation.value.validation || null;
  const errors = results
    .filter((item) => item.status === "rejected")
    .map((item) => item.reason?.message || "补充数据读取失败");
  supplementalDataError = errors.join("；");
}

function downloadUrl(path) {
  const link = document.createElement("a");
  link.href = path;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function currentPage() {
  const hash = window.location.hash || "#/home";
  if (hash.startsWith(STOCK_DETAIL_HASH_PREFIX)) return "stocks";
  const page = hash.replace(/^#\/?/, "").split(/[/?]/)[0] || "home";
  return APP_PAGES.has(page) ? page : "home";
}

function pageLabel(page) {
  const labels = {
    home: "首页",
    actions: "操作建议",
    stocks: "个股分析",
    social: "社交热议",
    research: "研究材料",
    portfolio: "持仓复盘",
    ops: "自动化配置",
  };
  return labels[page] || "首页";
}

function renderPageShell() {
  const page = currentPage();
  const stockDetailActive = page === "stocks" && Boolean(stockDetailTickerFromHash());
  const pageHasSidebar = Boolean(els.sideColumn?.querySelector(`[data-page-panel="${page}"]`));
  document.body.classList.toggle("stock-detail-mode", stockDetailActive);
  document.body.classList.toggle("has-page-sidebar", pageHasSidebar);
  document.body.dataset.page = page;
  els.pageLinks.forEach((link) => {
    const active = link.dataset.pageLink === page;
    link.classList.toggle("is-active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  });
  els.pagePanels.forEach((panel) => {
    const visible = panel.dataset.pagePanel === page;
    panel.classList.toggle("is-page-hidden", !visible);
    panel.setAttribute("aria-hidden", visible ? "false" : "true");
  });
  if (els.sideColumn) {
    els.sideColumn.classList.toggle("is-page-hidden", !pageHasSidebar);
  }
  document.title = page === "home" ? "Market Pulse AI" : `${pageLabel(page)} · Market Pulse AI`;
}

function refreshErrorBanner() {
  let banner = document.getElementById("dataRefreshError");
  if (banner) return banner;
  banner = document.createElement("aside");
  banner.id = "dataRefreshError";
  banner.className = "data-refresh-error";
  banner.setAttribute("role", "alert");
  banner.setAttribute("aria-live", "assertive");
  banner.hidden = true;
  banner.innerHTML = "<strong>数据刷新失败</strong><span></span>";
  const nav = document.querySelector(".page-nav");
  if (nav) nav.insertAdjacentElement("afterend", banner);
  else document.querySelector(".app-shell")?.prepend(banner);
  return banner;
}

function refreshErrorText() {
  const suffix = appState
    ? "当前页面继续展示最近一次成功内容。"
    : "页面数据尚未载入，请稍后重试。";
  return `${[...refreshErrors.values()].join("；")} ${suffix}`;
}

function showRefreshError(message, key = "state") {
  refreshErrors.set(key, message);
  const banner = refreshErrorBanner();
  const detail = banner.querySelector("span");
  if (detail) detail.textContent = refreshErrorText();
  banner.hidden = false;
}

function clearRefreshError(key = "state") {
  refreshErrors.delete(key);
  const banner = document.getElementById("dataRefreshError");
  if (!banner) return;
  if (!refreshErrors.size) {
    banner.hidden = true;
    return;
  }
  const detail = banner.querySelector("span");
  if (detail) detail.textContent = refreshErrorText();
}

function fmtTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function strategyVersionText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.id || value.strategyVersion || "";
  return String(value);
}

function timeValue(value) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function ageHours(value) {
  const time = timeValue(value);
  if (!time) return null;
  const hours = (Date.now() - time) / 3600000;
  return Number.isFinite(hours) ? hours : null;
}

function freshnessInfo(value) {
  const hours = ageHours(value);
  if (!Number.isFinite(hours)) {
    return { status: "missing", label: "暂无报告", detail: "未采集", tagClass: "amber" };
  }
  if (hours <= 8) {
    return { status: "fresh", label: "新鲜", detail: `${fmtNumber(hours, 1)} 小时前`, tagClass: "green" };
  }
  if (hours <= 24) {
    return { status: "aging", label: "可用", detail: `${fmtNumber(hours, 1)} 小时前`, tagClass: "amber" };
  }
  return { status: "stale", label: "过期", detail: `${fmtNumber(hours, 1)} 小时前`, tagClass: "red" };
}

function toLocalDateTimeInput(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function tagsInputValue(tags) {
  return Array.isArray(tags) ? tags.join(", ") : String(tags || "");
}

function setTradeEditing(trade = null) {
  editingTradeId = trade?.id || "";
  els.tradeEditBar.classList.toggle("hidden", !editingTradeId);
  els.tradeSubmitButton.textContent = editingTradeId ? "保存修改" : "记录操作";
  if (!trade) {
    els.tradeEditLabel.textContent = "正在编辑操作";
    return;
  }
  els.tradeEditLabel.textContent = `正在编辑 ${trade.ticker} · ${tradeSideLabel(trade.side)} · ${fmtTime(trade.executedAt)}`;
  els.tradeDate.value = toLocalDateTimeInput(trade.executedAt);
  els.tradeTicker.value = trade.ticker || "";
  els.tradeSide.value = trade.side || "buy";
  els.tradeQuantity.value = trade.quantity ?? "";
  els.tradePrice.value = trade.price ?? "";
  els.tradeFees.value = trade.fees ?? "0";
  els.tradeStrategy.value = trade.strategy || "";
  els.tradeThesis.value = trade.thesis || "";
  els.tradeEmotion.value = trade.emotion || "";
  els.tradeTags.value = tagsInputValue(trade.tags);
  els.tradeNotes.value = trade.notes || "";
  els.tradeTicker.focus();
}

function resetTradeForm() {
  els.tradeForm.reset();
  els.tradeFees.value = "0";
  els.tradeDate.value = toLocalDateTimeInput();
  setTradeEditing(null);
}

function findTradeById(id) {
  return (
    (appState?.trades || []).find((trade) => trade.id === id) ||
    (appState?.tradeJournal?.recentTrades || []).find((trade) => trade.id === id) ||
    null
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanDisplayText(value) {
  return String(value ?? "")
    .replace(/\uFFFD+/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, "")
    .replace(/Â([£¥©®°±])/g, "$1")
    .replace(/Â\s/g, " ")
    .replace(/â€™|â€˜|Ã¢â‚¬â„¢/g, "'")
    .replace(/â€œ|â€�|Ã¢â‚¬Å“|Ã¢â‚¬Â/g, '"')
    .replace(/â€“|â€”|Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/â€¦|Ã¢â‚¬Â¦/g, "...")
    .replace(/â€¢|Ã¢â‚¬Â¢/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripUiPunctuation(value) {
  return cleanDisplayText(value).replace(/[。.!?！？；;，,、\s]+$/u, "");
}

function cleanArticleFactText(value) {
  const clean = stripUiPunctuation(value)
    .replace(/^(原文事实|正文依据|诉讼\/监管|财报\/指引|分析师|指数\/资金流|合同\/合作|业务\/产品)[：:\s]+/u, "")
    .replace(/^(原文事实|正文依据|诉讼\/监管|财报\/指引|分析师|指数\/资金流|合同\/合作|业务\/产品)[：:\s]+/u, "")
    .replace(/[；;]+/g, "，")
    .replace(/\s+/g, " ")
    .trim();
  const translated = englishFactToChinese(clean);
  if (translated) return translated;
  if (looksLikeEnglishProse(clean)) return "";
  return clean;
}

function englishFactToChinese(value) {
  const text = cleanDisplayText(value);
  if (!text) return "";
  const facts = [];
  const quote = text.match(/\(([A-Z][A-Z0-9.-]{0,8})\s+([\d.]+)[，,]\s*([+-]?[\d.]+)[，,]\s*([+-]?[\d.]+)%\)/);
  if (quote) facts.push(`${quote[1]} 报 ${quote[2]} 美元，当日变动 ${quote[3]} 美元，涨跌幅 ${quote[4]}%`);
  const upAnother = text.match(/shares?\s+(?:are\s+)?up\s+another\s+([\d.]+)%/i);
  if (upAnother) facts.push(`股价当日继续上涨 ${upAnother[1]}%`);
  const downAnother = text.match(/shares?\s+(?:are\s+)?down\s+another\s+([\d.]+)%/i);
  if (downAnother) facts.push(`股价当日继续下跌 ${downAnother[1]}%`);
  const slid = text.match(/\b(?:slid|fell|dropped|declined|retreated)\s+(?:over|more than|about|around)?\s*([\d.]+)%/i);
  if (slid) facts.push(`股价下跌约 ${slid[1]}%`);
  const gained = text.match(/\b(?:rose|gained|jumped|surged|rallied)\s+(?:over|more than|about|around)?\s*([\d.]+)%/i);
  if (gained) facts.push(`股价上涨约 ${gained[1]}%`);
  const aboveIpo = text.match(/([\d.]+)%\s+above\s+the\s+\$([\d.]+)\s+IPO\s+price/i);
  if (aboveIpo) facts.push(`股价较 ${aboveIpo[2]} 美元 IPO 价高 ${aboveIpo[1]}%`);
  const belowIpo = text.match(/([\d.]+)%\s+below\s+the\s+\$([\d.]+)\s+IPO\s+price/i);
  if (belowIpo) facts.push(`股价较 ${belowIpo[2]} 美元 IPO 价低 ${belowIpo[1]}%`);
  const amount = text.match(/\$([\d.]+)\s*(billion|million|trillion)\b/i);
  if (amount) {
    const numeric = Number(amount[1]);
    const unit = amount[2].toLowerCase();
    const amountZh = unit === "trillion" ? `${fmtNumber(numeric, 2)} 万亿美元` : unit === "billion" ? `${fmtNumber(numeric * 10, 0)} 亿美元` : `${fmtNumber(numeric, 1)} 百万美元`;
    facts.push(`报道提到金额 ${amountZh}`);
  }
  if (/largest IPO in market history/i.test(text)) facts.push("报道称这是市场史上规模最大的 IPO 之一");
  return [...new Set(facts)].slice(0, 4).join("，");
}

function looksLikeEnglishProse(value) {
  const text = cleanDisplayText(value);
  const words = text.match(/[A-Za-z]{3,}/g) || [];
  if (/^(?:jan|feb|mar|apr|may|jun|june|jul|july|aug|sep|sept|oct|nov|dec)\b/i.test(text)) return true;
  if (/\b(?:min read|first appeared|gmt|reuters|bloomberg|yahoo finance|gurufocus)\b/i.test(text)) return true;
  return words.length >= 5;
}

function summaryTypeLabel(value) {
  const text = cleanDisplayText(value);
  if (/财报|指引/.test(text)) return "财报与指引相关的新事实";
  if (/法律|监管|和解|诉讼/.test(text)) return "法律、和解或监管相关的新事实";
  if (/指数/.test(text)) return "指数再平衡或被动资金流相关的新事实";
  if (/合同|合作|交易/.test(text)) return "合同、合作或交易相关的新事实";
  if (/分析师|评级|目标价/.test(text)) return "分析师观点或评级变化";
  if (/市场解读/.test(text)) return "市场解读";
  return text || "待核验材料";
}

function summaryHasHardData(value) {
  return /\$?\b\d+(?:\.\d+)?\s*(?:%|billion|million|trillion|bn|m|x|times|bps|basis points)?\b|收入|EPS|每股收益|毛利率|利润率|指引|订单金额|合同金额|目标价|和解金额|亿美元|百万|亿|万/i.test(value);
}

function earningsNewsHasSpecificData(item = {}) {
  const rows = [
    item.article?.keyData || [],
    item.article?.llmKeyData || [],
    item.article?.evidenceLines || [],
    item.catalyst?.keyData || [],
    item.articleKeyData || [],
    item.articleEvidence || [],
  ].flat().join(" ");
  return /\$?\b\d+(?:\.\d+)?\s*(?:%|billion|million|trillion|bn|m|bps|basis points)?\b.{0,90}(收入|营收|EPS|每股收益|毛利率|利润率|指引|guidance|revenue|sales|margin|profit)|(?:收入|营收|EPS|每股收益|毛利率|利润率|指引|guidance|revenue|sales|margin|profit).{0,90}\$?\b\d/i.test(rows);
}

function hotNewsMissingEarningsData(item = {}) {
  const text = cleanDisplayText([
    item.title,
    item.titleZh,
    item.summaryZh,
    item.llmBriefZh,
    item.article?.summaryZh,
    item.catalyst?.summary,
    item.catalyst?.summaryZh,
  ].filter(Boolean).join(" "));
  return /财报|业绩|指引|earnings|results|guidance|revenue|eps/i.test(text) && !earningsNewsHasSpecificData(item);
}

function displayNewsSummary(value, item = {}) {
  const text = cleanDisplayText(value).replace(/[；;]+/g, "，");
  const alreadyReadable = rewriteExistingNewsSummary(text);
  if (alreadyReadable) return cleanTemplateTone(alreadyReadable);
  if (!/原文结论：|原文事实：|正文依据：/.test(text)) return cleanTemplateTone(text);
  const ticker = item?.ticker || text.match(/^([A-Z][A-Z0-9.-]{0,8})\s+原文结论：/)?.[1] || "这家公司";
  const conclusion = text.match(/原文结论：([^。]+)/)?.[1] || "";
  const [rawType, rawEvent] = conclusion.split(/[，,]/).map(stripUiPunctuation).filter(Boolean);
  const factsRaw = text.match(/原文事实：(.+?)(?=(?:AI\/|合同|分析师|指数|诉讼|财报|需要结合|投资含义|正文依据：|$))/)?.[1] || "";
  const evidenceRaw = text.match(/正文依据：(.+)$/)?.[1] || "";
  const facts = [factsRaw, evidenceRaw]
    .flatMap((part) => part.split(/[，,]/))
    .map(cleanArticleFactText)
    .filter(Boolean)
    .filter((fact, index, rows) => rows.indexOf(fact) === index)
    .slice(0, 3);
  const rest = text
    .replace(/^.*?原文结论：[^。]+。?/, "")
    .replace(/原文事实：.+?(?=(?:AI\/|合同|分析师|指数|诉讼|财报|需要结合|投资含义|正文依据：|$))/, "")
    .replace(/正文依据：.+$/, "")
    .split(/[。]/)
    .map(stripUiPunctuation)
    .filter(Boolean)
    .filter((line) => !/^(原文结论|原文事实|正文依据)/.test(line))
    .filter((line) => !/需要结合正文事实判断/.test(line))
    .filter((line) => !looksLikeEnglishProse(line))
    .slice(0, 2);
  const hardFacts = facts.filter(summaryHasHardData);
  const factSentence = hardFacts.length
    ? `原文给出的关键数据是：${hardFacts.join("，")}。`
    : facts.length
      ? `原文可核验的信息是：${facts.join("，")}。不过，这篇材料没有披露收入、EPS、利润率、订单金额或指引等关键数字。`
      : "原文没有披露收入、EPS、利润率、订单金额或指引等关键数字。";
  const impactSentence = rest.length
    ? `投资含义是，${rest.join("，")}。`
    : "投资含义是，这条新闻需要进一步确认是否会改变收入、利润率、现金流、估值假设或资金流。";
  return cleanTemplateTone(`${ticker} ${rawEvent || "相关事件"}，属于${summaryTypeLabel(rawType)}。${factSentence}${impactSentence}`);
}

function rewriteExistingNewsSummary(value) {
  let text = cleanDisplayText(value).replace(/[；;]+/g, "，");
  if (!/原文给出的关键数据是：|原文可核验的信息是：/.test(text)) return "";
  text = text.replace(/需要结合正文事实判断对收入、利润率、估值或资金流的影响。?/g, "");
  const dataMatch = text.match(/原文给出的关键数据是：(.+?)。/);
  if (dataMatch) {
    const translated = englishFactToChinese(dataMatch[1]);
    const cleaned = translated || dataMatch[1]
      .split(/[，,]/)
      .map(cleanArticleFactText)
      .filter(Boolean)
      .filter((fact) => !looksLikeEnglishProse(fact))
      .filter((fact, index, rows) => rows.indexOf(fact) === index)
      .slice(0, 4)
      .join("，");
    text = text.replace(/原文给出的关键数据是：(.+?)。/, cleaned ? `原文给出的关键数据是：${cleaned}。` : "原文没有披露收入、EPS、利润率、订单金额或指引等关键数字。");
  }
  const factMatch = text.match(/原文可核验的信息是：(.+?)。/);
  if (factMatch) {
    const translated = englishFactToChinese(factMatch[1]);
    const cleaned = translated || factMatch[1]
      .split(/[，,]/)
      .map(cleanArticleFactText)
      .filter(Boolean)
      .filter((fact) => !looksLikeEnglishProse(fact))
      .filter((fact, index, rows) => rows.indexOf(fact) === index)
      .slice(0, 4)
      .join("，");
    text = text.replace(/原文可核验的信息是：(.+?)。/, cleaned ? `原文可核验的信息是：${cleaned}。` : "原文没有披露收入、EPS、利润率、订单金额或指引等关键数字。");
  }
  const impactMatch = text.match(/投资含义是，(.+)$/);
  if (impactMatch && looksLikeEnglishProse(impactMatch[1])) {
    text = text.replace(/投资含义是，.+$/, "投资含义是，这条新闻需要进一步确认是否会改变收入、利润率、现金流、估值假设或资金流。");
  }
  return cleanTemplateTone(text);
}

function cleanTemplateTone(value) {
  return cleanDisplayText(value)
    .replace(/[；;]+/g, "，")
    .replace(/这条材料重点是/g, "重点是")
    .replace(/这篇材料重点是/g, "重点是")
    .replace(/这篇新闻主要讲/g, "")
    .replace(/需要回到(?:财报|公告|新闻)?原文(?:继续)?核对/g, "后续看")
    .replace(/需要打开原文(?:确认|核验|查看)?/g, "后续看原文")
    .replace(/需要(?:进一步)?确认/g, "后续观察")
    .replace(/需要(?:继续)?核验/g, "后续观察")
    .replace(/需(?:继续)?核验/g, "后续观察")
    .replace(/不能臆造具体[^。]+。?/g, "")
    .replace(/当前系统只看到标题[^。]+。?/g, "")
    .replace(/原文没有披露/g, "材料未披露")
    .replace(/这条新闻/g, "这件事")
    .replace(/投资含义是，?/g, "")
    .replace(/不过，/g, "")
    .replace(/\s*，\s*/g, "，")
    .replace(/，。/g, "。")
    .replace(/。。+/g, "。")
    .trim();
}

function sentenceParts(value) {
  return cleanTemplateTone(value)
    .split(/(?<=[。.!?！？])|\n+/u)
    .map((line) => stripUiPunctuation(line))
    .filter(Boolean)
    .filter((line) => !looksLikeEnglishProse(line));
}

function compactSentence(value, limit = 120) {
  const text = stripUiPunctuation(cleanTemplateTone(value));
  if (!text) return "";
  if (text.length <= limit) return `${text}。`;
  const shortened = text.slice(0, limit).replace(/[，、：:][^，、：:]*$/u, "");
  return `${stripUiPunctuation(shortened || text.slice(0, limit))}。`;
}

function looksLikeRawDiagnostic(value) {
  const text = cleanDisplayText(value);
  return (
    /IneligibleTierError|UNSUPPORTED_CLIENT|Gemini Code Assist|node:internal|Traceback|SyntaxError|TypeError|ReferenceError/i.test(text) ||
    /<html|<!doctype html|\{".{20,}":|^\[object Object\]$/i.test(text) ||
    /(curl|npm|brew|python3|spawn|ETIMEDOUT|ECONNRESET|ENOTFOUND)/i.test(text)
  );
}

function cleanReadableRow(value) {
  let text = stripUiPunctuation(cleanTemplateTone(value));
  if (!text || looksLikeRawDiagnostic(text)) return "";
  if (/财报和指引会直接影响未来盈利预期|未来盈利预期与估值倍数|财报、指引或利润率变化会直接影响未来盈利预期/.test(text)) return "";
  text = text
    .replace(/^[-•]\s*/u, "")
    .replace(/^更多理由[：:\s]*/u, "")
    .replace(/^正文依据[：:\s]*/u, "")
    .replace(/^原文事实[：:\s]*/u, "")
    .trim();
  const translated = englishFactToChinese(text);
  if (translated) text = translated;
  if (looksLikeEnglishProse(text)) return "";
  return stripUiPunctuation(text);
}

function firstUsefulSentence(...values) {
  for (const value of values.flat()) {
    const parts = sentenceParts(value);
    if (parts[0]) return parts[0];
  }
  return "";
}

function uniqueCompactRows(rows = [], limit = 3) {
  const seen = new Set();
  return rows
    .flat()
    .map(cleanReadableRow)
    .filter(Boolean)
    .filter((row) => {
      const key = row.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function evidenceFromItem(item = {}) {
  const rows = uniqueCompactRows([
    item.article?.keyData || [],
    item.article?.evidenceLines || [],
    item.catalyst?.keyData || [],
    item.catalyst?.evidence || [],
    item.articleKeyData || [],
    item.articleEvidence || [],
    item.secInsight?.keyFindings || [],
  ]);
  if (rows.length) return rows.join("；");
  const summary = firstUsefulSentence(
    item.article?.summaryZh,
    item.summaryZh,
    item.catalyst?.summaryZh,
    item.catalyst?.summary,
    item.articleSummary,
    item.summary,
  );
  if (summary && summaryHasHardData(summary)) return summary;
  const source = sourceLabel(item.publisher || item.source || item.article?.source || "");
  const time = item.publishedAt ? fmtTime(item.publishedAt) : "";
  return [source, time].filter(Boolean).join(" · ") || "当前材料证据有限。";
}

function observationFromItem(item = {}) {
  const rows = uniqueCompactRows([
    item.article?.investmentMemo?.monitor || [],
    item.catalyst?.checks || [],
    item.checks || [],
    item.secInsight?.actionChecks || [],
    item.articleInvestmentMemo?.monitor || [],
  ]);
  if (rows.length) return rows[0];
  const advice = firstUsefulSentence(
    item.article?.investmentAdvice,
    item.catalyst?.investmentAdvice,
    item.articleInvestmentAdvice,
    item.article?.investmentMemo?.suggestedAction,
  );
  if (advice) return advice;
  return "看后续公告、成交量、价格延续性和管理层/监管表态。";
}

function conclusionFromItem(item = {}) {
  return firstUsefulSentence(
    item.article?.investmentView,
    item.catalyst?.investmentView,
    item.articleInvestmentView,
    item.article?.summaryZh,
    item.summaryZh,
    item.catalyst?.summaryZh,
    item.catalyst?.summary,
    item.articleSummary,
    item.summary,
    displayTitle(item),
  );
}

function triadFromItem(item = {}, overrides = {}) {
  const conclusionSource = overrides.conclusion || conclusionFromItem(item) || displayTitle(item);
  const evidenceSource = overrides.evidence || evidenceFromItem(item);
  const observationSource = overrides.observation || observationFromItem(item);
  const conclusion = compactSentence(cleanReadableRow(conclusionSource) || conclusionSource, 118);
  const evidence = compactSentence(cleanReadableRow(evidenceSource) || evidenceSource, 150);
  const observation = compactSentence(cleanReadableRow(observationSource) || observationSource, 140);
  return { conclusion, evidence, observation };
}

function renderInsightTriad(triad = {}, className = "") {
  const rows = [
    ["结论", triad.conclusion],
    ["证据", triad.evidence],
    ["观察", triad.observation],
  ].filter(([, value]) => cleanDisplayText(value));
  if (!rows.length) return "";
  return `<div class="insight-triad ${escapeHtml(className)}">
    ${rows
      .map(
        ([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(compactSentence(value, label === "证据" ? 170 : 145))}</span></p>`,
      )
      .join("")}
  </div>`;
}

function trendLabel(value) {
  if (value === "uptrend") return "上升趋势";
  if (value === "downtrend") return "下降趋势";
  if (value === "mixed") return "震荡混合";
  return value || "未知";
}

function industryLabel(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();
  const map = {
    semiconductors: "半导体",
    "software - infrastructure": "基础设施软件",
    "software - application": "应用软件",
    "interactive media": "互联网媒体",
    "internet retail": "互联网零售",
    "auto manufacturers": "汽车制造",
    "consumer electronics": "消费电子",
    "capital markets": "资本市场",
    banks: "银行",
    biotechnology: "生物科技",
  };
  if (map[lower]) return map[lower];
  if (lower.includes("semiconductor")) return "半导体";
  if (lower.includes("software")) return "软件";
  if (lower.includes("bank")) return "银行";
  if (lower.includes("biotech")) return "生物科技";
  if (lower.includes("pharma")) return "制药";
  if (lower.includes("retail")) return "零售";
  if (lower.includes("auto")) return "汽车";
  return raw || "未知行业";
}

function signalLabel(value) {
  if (value === "bullish") return "偏积极";
  if (value === "cautious") return "偏谨慎";
  if (value === "neutral") return "中性";
  return value || "未知";
}

function categoryLabel(value) {
  if (value === "hot") return "热门";
  if (value === "watch") return "观察";
  if (value === "quiet") return "平静";
  return value || "未知";
}

function severityLabel(value) {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return value || "未知";
}

function providerLabel(value) {
  const labels = {
    gemini: "Gemini 接口",
    "codex-cli": "Codex CLI",
    "antigravity-cli": "Antigravity CLI",
    "gemini-cli": "Gemini CLI",
    openai: "GPT/OpenAI",
    auto: "自动",
  };
  return labels[value] || value || "未选择";
}

function sourceLabel(value) {
  const labels = {
    "Yahoo Finance Search": "雅虎财经新闻发现",
    "Yahoo News": "雅虎新闻",
    "Company News": "公司新闻",
    "Finnhub News": "Finnhub 公司新闻",
    "Finnhub Market News": "Finnhub 市场热闻",
    "Yahoo Finance Hot News": "雅虎财经热闻",
    "Alpha Vantage News Sentiment": "Alpha Vantage 热门新闻/情绪",
    "NewsAPI Everything": "NewsAPI 财经热闻",
    "Polygon News": "Polygon/Massive 股票新闻",
    "Hot News RSS": "财经站 RSS 热闻",
    "MarketWatch RSS": "MarketWatch 热闻",
    "Google News RSS": "Google News 财经热闻",
    "Yahoo Finance Chart": "雅虎财经图表",
    "Nasdaq Historical": "Nasdaq 历史日线",
    "Nasdaq Options": "Nasdaq 期权链",
    "Yahoo Options": "Yahoo 期权链",
    "Finnhub Options": "Finnhub 期权链",
    "IBKR Options": "IBKR Client Portal 期权链",
    "IBKR Client Portal Option Chain": "IBKR Client Portal 期权链",
    "IBKR Portal": "IBKR Portal",
    "IBKR Portal Hot News": "IBKR Portal 热闻",
    "IBKR Portal Market Overview": "IBKR Portal 大盘概览",
    "IBKR Portal LLM Summary": "IBKR Portal LLM 摘要",
    "IBKR Gateway Socket Index": "IBKR 真实指数",
    "Options Chain": "期权链",
    "Technical Chart": "技术图表",
    "YouTube Data API": "YouTube 数据接口",
    "YouTube RSS": "YouTube 频道 RSS",
    YouTube: "YouTube",
    "SEC EDGAR": "SEC 官方披露",
    Quotes: "报价",
    Fundamentals: "基本面",
    "Reddit Hot": "Reddit 热门讨论",
    "Reddit RSS": "Reddit RSS 热门讨论",
    "Reddit Social": "Reddit 社交热议",
    ApeWisdom: "ApeWisdom 热议榜",
    Stocktwits: "Stocktwits 社区",
    "Social Media": "社交媒体",
    "X Recent Search": "X 实时搜索",
    "Nitter RSS": "Nitter RSS",
    "XHS CLI": "小红书 CLI",
    "Custom Social Feed": "自定义社交源",
    "Finnhub Fundamentals": "Finnhub 基本面",
    "Article LLM Summary": "新闻原文 LLM 摘要",
    "Article Extractor": "新闻正文抽取",
    Finnhub: "Finnhub 行情",
  };
  if (/^Nasdaq Historical/i.test(value)) return String(value).replace(/^Nasdaq Historical/i, "Nasdaq 历史日线");
  return labels[value] || value || "";
}

function errorLabel(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/IneligibleTierError|UNSUPPORTED_CLIENT|Gemini Code Assist|Antigravity/i.test(text)) {
    return "Gemini CLI 个人版通道不可用；请检查账号层级后重试";
  }
  if (/403\s+Blocked/i.test(text)) return "403 被数据源拦截或限流";
  if (/^\d{3}\s+Bad Request/i.test(text) && /<html|<!doctype html/i.test(text)) {
    return "请求失败，数据源返回错误页，可能被限流或临时拦截";
  }
  if (/<html|<!doctype html/i.test(text)) return "数据源返回错误页，可能被限流或临时拦截";
  const translated = text
    .replaceAll("No CIK mapping found", "未找到 SEC CIK 映射")
    .replaceAll("Ticker map unavailable", "ticker 映射不可用")
    .replaceAll("FINNHUB_API_KEY not configured", "未配置 FINNHUB_API_KEY")
    .replaceAll("You don't have access to this resource.", "当前 key 没有这个资源权限")
    .replaceAll("Yahoo options returned no result", "Yahoo 未返回期权链")
    .replaceAll("Nasdaq options returned no usable contracts", "Nasdaq 未返回可用合约")
    .replaceAll("missing underlying price", "缺少标的价格")
    .replaceAll("not configured", "未配置")
    .replaceAll("fetch failed", "网络请求失败")
    .replaceAll("timeout", "超时")
    .replaceAll("Timeout", "超时")
    .replaceAll("Failed", "失败")
    .replaceAll("failed", "失败")
    .replaceAll("error", "异常")
    .replaceAll("Error", "异常");
  const clean = cleanDisplayText(translated);
  return clean.length > 180 ? `${clean.slice(0, 180)}...` : clean;
}

function typeLabel(value) {
  if (value === "filing" || value === "SEC") return "SEC 文件";
  if (value === "news") return "新闻";
  if (value === "video") return "视频";
  if (value === "social") return "社交";
  if (value === "market") return "大盘";
  if (value === "quote") return "报价";
  if (value === "technical") return "技术";
  if (value === "fundamental") return "基本面";
  return value || "材料";
}

function displayTitle(item) {
  const titleZh = item?.titleZh || "";
  if (/标题暂未翻译/.test(titleZh)) {
    return item?.title || item?.summaryZh || titleZh;
  }
  return titleZh || item?.title || item?.summaryZh || "";
}

function setBusy(next) {
  busy = next;
  [els.runPre, els.runPost, els.runManual].forEach((btn) => {
    btn.disabled = busy;
  });
  els.portfolioForm.querySelector("button").disabled = busy;
  els.portfolioFromTradesButton.disabled = busy;
  els.tradeSubmitButton.disabled = busy;
  els.tradeEditCancel.disabled = busy;
  els.tradeImportButton.disabled = busy;
  els.ibkrSyncButton.disabled = busy;
  els.tradeReviewButton.disabled = busy;
  els.tradeExportButton.disabled = busy;
  els.tradeJournalExportButton.disabled = busy;
  document.body.classList.toggle("loading", busy);
}

function collectionStateLabel(state) {
  if (state === "running") return "采集中";
  if (state === "completed") return "已完成";
  if (state === "failed") return "失败";
  return "空闲";
}

function collectionElapsed(status) {
  const ms = Number(status?.elapsedMs);
  if (Number.isFinite(ms)) return `${Math.max(1, Math.round(ms / 1000))} 秒`;
  if (!status?.startedAt) return "-";
  return `${Math.max(1, Math.round((Date.now() - new Date(status.startedAt).getTime()) / 1000))} 秒`;
}

function readinessMetric(readiness) {
  if (!readiness) return "未评估";
  const score = Number.isFinite(readiness.score) ? `${readiness.score}` : "-";
  return `${readiness.label || "未评估"} ${score}`;
}

function readinessTagClass(status) {
  if (status === "usable") return "green";
  if (status === "blocked" || status === "limited") return "red";
  return "amber";
}

function stopCollectionPolling() {
  if (collectionPollTimer) clearTimeout(collectionPollTimer);
  collectionPollTimer = null;
}

async function pollCollectionStatus() {
  stopCollectionPolling();
  try {
    const result = await api("/api/run/status");
    clearRefreshError("collection-status");
    collectionStatus = result.runStatus || null;
    const running = collectionStatus?.state === "running";
    setBusy(running);
    if (collectionStatus?.state === "completed" && collectionStatus.runId) {
      localStorage.setItem(RUN_SELECTION_STORAGE_KEY, collectionStatus.runId);
      try {
        await loadState();
      } catch {
        setBusy(false);
      }
      return;
    }
    render();
    if (running) {
      collectionPollTimer = setTimeout(pollCollectionStatus, 4000);
    }
  } catch (error) {
    showRefreshError(`采集状态读取失败：${error.message}`, "collection-status");
    if (collectionStatus?.state === "running") {
      setBusy(true);
      collectionPollTimer = setTimeout(pollCollectionStatus, 4000);
    } else {
      setBusy(false);
    }
  }
}

async function loadState() {
  let nextState;
  try {
    nextState = await api("/api/state");
    clearRefreshError("state");
  } catch (error) {
    showRefreshError(`状态数据刷新失败：${error.message}`, "state");
    throw error;
  }
  appState = nextState;
  runHistoryPagination = { loaded: false, nextOffset: 0, hasMore: false, total: appState.runs?.length || 0 };
  await loadSupplementalData();
  if (supplementalDataError) {
    showRefreshError(`部分补充数据刷新失败：${supplementalDataError}`, "supplemental");
  } else {
    clearRefreshError("supplemental");
  }
  if (!sourceDiagnosticsBusy) sourceDiagnostics = appState.sourceDiagnostics || null;
  collectionStatus = appState.runStatus || collectionStatus;
  if (collectionStatus?.state === "running") {
    setBusy(true);
    if (!collectionPollTimer) collectionPollTimer = setTimeout(pollCollectionStatus, 1000);
  } else if (busy) {
    setBusy(false);
  }
  if (appState.latest?.id) {
    runDetailCache.set(appState.latest.id, appState.latest);
  }
  render();
  ensureSelectedRunDetail();
}

function render() {
  const selectedRun = selectedReportRun();
  const page = currentPage();
  renderPageShell();
  els.watchlistInput.value = appState.watchlist.join(", ");
  els.portfolioInput.value = (appState.portfolio || [])
    .map((item) => `${item.ticker} ${item.shares} ${item.costBasis}`)
    .join("\n");
  renderLlmPicker();
  if (page === "ops") {
    renderRunHistory(appState.runs || [], selectedRun);
    ensureRunHistoryLoaded();
  }
  if (selectedRun?.summaryOnly) {
    renderRunSummaryLoading(selectedRun);
    if (page === "actions") {
      renderActionSuggestions(selectedRun);
      renderAllStockAgent(appState.allStockAgent);
      renderTodayDesk(todayRecommendations);
    } else if (page === "stocks") {
      renderStockDeepDive(stockDetailTickerFromHash() || els.stockReportInput?.value || "");
    } else if (page === "portfolio") {
      renderPortfolio(selectedRun);
      renderRecommendationReconciliation(recommendationReconciliation);
      renderTradeJournal(appState.tradeJournal, appState.tradeReviews || [], appState.config?.ibkr);
    } else if (page === "research") {
      renderCapabilityRadar(selectedRun, appState.config || {});
    } else if (page === "ops") {
      renderChat(appState.chat || []);
      renderSchedule(appState.config.schedule, appState.config.email, appState.emailLog || []);
      renderIbkrPortal(appState.config?.ibkr?.portal);
      renderStrategyGovernance(strategyVersionsPayload, strategyValidationPayload);
      renderProviders(
        appState.config.providers,
        selectedRun?.dataQuality,
        appState.config.providerDetails,
        appState.config.sourceControls,
        appState.config.customSocialFeeds,
        appState.config.llmRouting,
        appState.config,
      );
    }
    return;
  }
  if (page === "home") {
    renderMarketOverview(selectedRun);
    renderMoversWithReasons(selectedRun);
    renderHotNews(selectedRun);
    renderEventCalendar(selectedRun);
  } else if (page === "actions") {
    renderActionSuggestions(selectedRun);
    renderAllStockAgent(appState.allStockAgent);
    renderTodayDesk(todayRecommendations);
  } else if (page === "stocks") {
    renderStockReport(selectedRun);
    renderStockDeepDive(stockDetailTickerFromHash() || els.stockReportInput?.value || "");
    renderDiscovery(selectedRun);
    renderTickers(selectedRun);
    renderTechnicals(selectedRun);
    renderFundamentals(selectedRun);
  } else if (page === "social") {
    renderSocial(selectedRun);
  } else if (page === "research") {
    renderAnalysis(selectedRun);
    renderOpenBB(selectedRun, appState.config?.openbb);
    renderCapabilityRadar(selectedRun, appState.config || {});
    renderBacktest(selectedRun);
    renderFeeds(selectedRun);
  } else if (page === "portfolio") {
    renderPortfolio(selectedRun);
    renderRecommendationReconciliation(recommendationReconciliation);
    renderTradeJournal(appState.tradeJournal, appState.tradeReviews || [], appState.config?.ibkr);
    renderAlerts(selectedRun);
  } else if (page === "ops") {
    renderStatus(selectedRun);
    renderChat(appState.chat || []);
    renderSchedule(appState.config.schedule, appState.config.email, appState.emailLog || []);
    renderIbkrPortal(appState.config?.ibkr?.portal);
    renderStrategyGovernance(strategyVersionsPayload, strategyValidationPayload);
    renderProviders(
      appState.config.providers,
      selectedRun?.dataQuality,
      appState.config.providerDetails,
      appState.config.sourceControls,
      appState.config.customSocialFeeds,
      appState.config.llmRouting,
      appState.config,
    );
  }
}

function renderRunSummaryLoading(run) {
  document.body.classList.remove("stock-detail-mode");
  els.briefTitle.textContent = `${sessionLabel(run.session)}报告加载中`;
  els.briefMeta.textContent = `${fmtTime(run.completedAt)} · 正在按需载入历史报告详情。`;
  els.statusGrid.innerHTML = [
    metric(countForRun(run, "news", "newsCount"), "新闻"),
    metric(countForRun(run, "filings", "filingsCount"), "SEC 文件"),
    metric(countForRun(run, "socialPosts", "socialPostsCount"), "社交"),
    metric(countForRun(run, "options", "optionsCount"), "期权链"),
  ].join("");
  const message = "正在加载这份历史报告详情。最新报告会即时加载，历史报告按需打开以保持页面速度。";
  els.marketOverview.innerHTML = empty(message);
  if (els.hotNewsList) els.hotNewsList.innerHTML = empty(message);
  if (els.stockReportOptions) els.stockReportOptions.innerHTML = "";
  if (els.stockReportInput) els.stockReportInput.value = "";
  els.stockReportBox.className = "stock-report-box empty-state";
  els.stockReportBox.textContent = message;
  els.discoveryGrid.innerHTML = empty(message);
  els.socialGrid.innerHTML = empty(message);
  els.analysisProvider.textContent = "历史报告";
  els.analysisBody.textContent = message;
  els.tickerGrid.innerHTML = empty(message);
  els.technicalGrid.innerHTML = empty(message);
  els.fundamentalGrid.innerHTML = empty(message);
  els.openbbGrid.innerHTML = empty(message);
  els.backtestBox.innerHTML = empty(message);
  els.alertsBox.innerHTML = empty(message);
  els.newsList.innerHTML = empty(message);
  els.filingList.innerHTML = empty(message);
}

function preferredLlmProvider() {
  const stored = localStorage.getItem(LLM_STORAGE_KEY);
  const configuredDefault = appState?.config?.llmDefaultProvider;
  if (configuredDefault === "antigravity-cli" && stored === "gemini-cli") {
    return "antigravity-cli";
  }
  if (stored !== "local" && LLM_PROVIDERS.has(stored)) return stored;
  const configured =
    appState?.config?.llmRecommendedProvider ||
    appState?.config?.llmProvider ||
    appState?.config?.llmDefaultProvider;
  if (LLM_PROVIDERS.has(configured)) return configured;
  return "codex-cli";
}

function selectedLlmProvider() {
  const checked = els.llmProviderInputs.find((input) => input.checked);
  return checked?.value || preferredLlmProvider();
}

function renderLlmPicker() {
  const selected = selectedLlmProvider();
  const providers = appState?.config?.providers || {};
  els.llmProviderInputs.forEach((input) => {
    const label = input.closest(".provider-segment");
    const providerKey =
      input.value === "gemini-cli"
        ? "geminiCli"
        : input.value === "codex-cli"
          ? "codexCli"
        : input.value === "antigravity-cli"
          ? "antigravityCli"
          : input.value;
    const enabled = Boolean(providers[providerKey]);
    input.checked = input.value === selected;
    input.disabled = !enabled;
    label.classList.toggle("is-unconfigured", !enabled);
    label.title = enabled ? "已配置；仅用于你主动发送的聊天" : "未配置或命令不可用";
  });
}

function sessionLabel(value) {
  if (value === "pre") return "盘前";
  if (value === "intraday") return "盘中告警";
  if (value === "post") return "盘后";
  if (value === "agent") return "候选池 Agent";
  return "手动";
}

function jobStatusLabel(value) {
  if (value === "completed") return "已完成";
  if (value === "recorded") return "有记录";
  if (value === "running") return "运行中";
  if (value === "failed") return "失败";
  return value || "-";
}

function emailStatusLabel(value) {
  if (value === "sent") return "已发送";
  if (value === "failed") return "发送失败";
  if (value === "skipped") return "已跳过";
  if (value === "pending") return "等待中";
  return value || "暂无记录";
}

function emailStatusTagClass(value) {
  if (value === "sent") return "green";
  if (value === "failed") return "red";
  if (value) return "amber";
  return "";
}

function selectedReportRun() {
  const runs = appState.runs || [];
  if (!runs.length) return appState.latest || null;
  const stored = localStorage.getItem(RUN_SELECTION_STORAGE_KEY);
  if (stored && appState.latest?.id === stored) return appState.latest;
  if (stored && runDetailCache.has(stored)) return runDetailCache.get(stored);
  let selected = runs.find((run) => run.id === stored) || runs[0];
  if (selected?.summaryOnly && selected.archiveAvailable === false) {
    selected = appState.latest || runs.find((run) => run.archiveAvailable !== false) || runs[0];
  }
  if (selected?.id && selected.id !== stored) {
    localStorage.setItem(RUN_SELECTION_STORAGE_KEY, selected.id);
  }
  if (selected?.id === appState.latest?.id) return appState.latest;
  return selected || appState.latest || null;
}

function stockDetailTickerFromHash() {
  const hash = decodeURIComponent(window.location.hash || "").trim();
  const patterns = [
    STOCK_DETAIL_HASH_PREFIX,
    "#stock=",
    "#stock/",
  ];
  const matchedPrefix = patterns.find((prefix) => hash.toLowerCase().startsWith(prefix.toLowerCase()));
  if (!matchedPrefix) return "";
  return hash.slice(matchedPrefix.length).split(/[/?#&]/)[0].trim().toUpperCase();
}

function normalizeTickerInput(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 14);
}

function normalizeTickerSymbol(value) {
  return normalizeTickerInput(value).replace(/\.(US|HK|SH|SZ|SG|HAS)$/i, "");
}

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isEtfInstrument(item = {}, ticker = "") {
  const data = item || {};
  const symbol = normalizeTickerSymbol(ticker || data.ticker || data.symbol || data.code);
  if (KNOWN_ETF_TICKERS.has(symbol)) return true;
  const descriptor = [
    data.instrumentType,
    data.assetType,
    data.assetCategory,
    data.securityType,
    data.secType,
    data.quoteType,
    data.type,
    data.name,
    data.companyName,
    data.industry,
    data.mainBusiness,
  ].filter(Boolean).join(" ");
  return /\bETF\b|exchange[- ]traded fund|交易型开放式指数基金|交易所交易基金|指数基金/i.test(descriptor);
}

function fundamentalMarginDisplay(item = {}) {
  if (isEtfInstrument(item)) return "不适用";
  return Number.isFinite(item?.netProfitMarginTTM) ? `${fmtNumber(item.netProfitMarginTTM, 1)}%` : "-";
}

function hasChineseText(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ""));
}

function candidateTickerNames(context = {}) {
  return [
    context.nameZh,
    context.chineseName,
    context.companyNameZh,
    context.company_name_zh,
    context.name,
    context.companyName,
    context.company_name,
  ].filter(Boolean);
}

function tickerNameFromRun(ticker, run = null) {
  const symbol = normalizeTickerSymbol(ticker);
  if (!symbol || !run) return "";
  const pools = [
    run.quotes,
    run.fundamentals,
    run.technicals,
    run.discovery?.candidates,
    run.moversWithReasons?.items,
    run.socialHotStocks?.candidates,
    run.socialHotStocks?.rising,
    run.stockNarratives?.items,
    run.researchPacks,
    run.investmentAdvice,
    run.industryChainPacks,
  ];
  for (const pool of pools) {
    const item = (pool || []).find((row) => normalizeTickerSymbol(row?.ticker || row?.symbol) === symbol);
    if (!item) continue;
    const found = candidateTickerNames(item).find((name) => hasChineseText(name));
    if (found) return cleanDisplayText(found);
  }
  const rankRows = (run.longBridge?.industryRank?.ranks || []).flatMap((rank) => rank.rows || []);
  const rankItem = rankRows.find((row) => normalizeTickerSymbol(row?.leadingTicker) === symbol);
  if (rankItem?.leadingNameZh) return cleanDisplayText(rankItem.leadingNameZh);
  return "";
}

function tickerNameZh(ticker, context = {}) {
  const symbol = normalizeTickerSymbol(ticker);
  if (!symbol) return "";
  const direct = candidateTickerNames(context).find((name) => hasChineseText(name));
  if (direct) return cleanDisplayText(direct);
  const runName = tickerNameFromRun(symbol, context.run || null);
  if (runName) return runName;
  const configured = appState?.config?.tickerNamesZh?.[symbol] || FALLBACK_TICKER_NAMES_ZH[symbol] || "";
  return cleanDisplayText(configured);
}

function tickerLabel(ticker, context = {}) {
  const symbol = normalizeTickerSymbol(ticker);
  if (!symbol) return "";
  const zh = tickerNameZh(symbol, context);
  return zh && zh !== symbol ? `${symbol} · ${zh}` : symbol;
}

function tickerNameLine(ticker, context = {}) {
  const zh = tickerNameZh(ticker, context);
  return zh || cleanDisplayText(context.name || context.companyName || "") || normalizeTickerSymbol(ticker);
}

function openStockDetail(ticker, options = {}) {
  const normalized = normalizeTickerInput(ticker);
  if (!normalized) return;
  localStorage.setItem(STOCK_REPORT_STORAGE_KEY, normalized);
  if (els.stockReportInput) els.stockReportInput.value = normalized;
  const nextHash = `${STOCK_DETAIL_HASH_PREFIX}${encodeURIComponent(normalized)}`;
  if (window.location.hash === nextHash) {
    renderStockReport(selectedReportRun());
  } else {
    window.location.hash = nextHash;
  }
  if (options.fetch !== false) requestStockSnapshot(normalized, { force: options.force === true });
}

function closeStockDetail() {
  if (window.location.hash === "#/stocks") {
    render();
    return;
  }
  window.location.hash = "#/stocks";
}

function replaceByTicker(rows = [], row = null) {
  if (!row?.ticker) return rows || [];
  return [row, ...(rows || []).filter((item) => item?.ticker !== row.ticker)];
}

function mergeStockSnapshotIntoRun(run, snapshot) {
  if (!snapshot?.ticker) return run;
  const base = run || {
    id: "ad-hoc",
    session: "manual",
    trigger: "manual",
    completedAt: snapshot.generatedAt || new Date().toISOString(),
    watchlist: [],
    quotes: [],
    technicals: [],
    fundamentals: [],
    options: [],
    openbb: null,
    news: [],
    filings: [],
    videos: [],
    socialPosts: [],
    stockNarratives: { generatedAt: snapshot.generatedAt, provider: "longbridge-ad-hoc", items: [] },
    factorLayer: { schemaVersion: "factor-layer-v1", byTicker: [], topCandidates: [] },
    researchPacks: [],
    allNewsPacks: [],
    investmentAdvice: [],
    industryChainPacks: [],
    socialHotStocks: { candidates: [] },
    analysis: { tickerScores: [] },
    backtest: { perTicker: [] },
    alerts: [],
  };
  const ticker = snapshot.ticker;
  const news = [...(snapshot.news || []), ...(base.news || []).filter((item) => !itemMatchesTicker(item, ticker))];
  const filings = [...(snapshot.filings || []), ...(base.filings || []).filter((item) => !itemMatchesTicker(item, ticker))];
  const options = snapshot.options?.length
    ? [...snapshot.options, ...(base.options || []).filter((item) => item?.ticker !== ticker)]
    : base.options || [];
  const narrativeItems = replaceByTicker(base.stockNarratives?.items || [], snapshot.narrative);
  const snapshotFactorRow = (snapshot.factorLayer?.byTicker || []).find((item) => item.ticker === ticker) || null;
  const factorRows = replaceByTicker(base.factorLayer?.byTicker || [], snapshotFactorRow);
  const longBridge = {
    ...(base.longBridge || {}),
    microstructure: replaceByTicker(base.longBridge?.microstructure || [], (snapshot.microstructure || [])[0] || null),
    filings: [...(snapshot.filings || []), ...(base.longBridge?.filings || []).filter((item) => !itemMatchesTicker(item, ticker))],
  };
  return {
    ...base,
    completedAt: base.completedAt || snapshot.generatedAt,
    watchlist: [...new Set([...(base.watchlist || []), ticker])],
    researchTickers: [...new Set([...(base.researchTickers || []), ticker])],
    quotes: replaceByTicker(base.quotes || [], snapshot.quote),
    technicals: replaceByTicker(base.technicals || [], snapshot.technical),
    fundamentals: [...(snapshot.fundamentals || []), ...(base.fundamentals || []).filter((item) => item.ticker !== ticker)],
    options,
    researchPacks: replaceByTicker(base.researchPacks || [], snapshot.researchPack),
    allNewsPacks: replaceByTicker(base.allNewsPacks || [], snapshot.allNewsPack),
    investmentAdvice: replaceByTicker(base.investmentAdvice || [], snapshot.investmentAdvisor),
    industryChainPacks: replaceByTicker(base.industryChainPacks || [], snapshot.industryChainPack),
    marketOverview: base.marketOverview || snapshot.marketOverview,
    eventCalendar: base.eventCalendar || snapshot.eventCalendar,
    portfolioRisk: base.portfolioRisk || snapshot.portfolioRisk,
    news,
    filings,
    longBridge,
    stockNarratives: {
      ...(base.stockNarratives || {}),
      generatedAt: snapshot.generatedAt || base.stockNarratives?.generatedAt || base.completedAt,
      provider: snapshot.narrative?.provider || base.stockNarratives?.provider || "longbridge-ad-hoc",
      items: narrativeItems,
    },
    factorLayer: snapshot.factorLayer
      ? {
          ...(base.factorLayer || {}),
          ...snapshot.factorLayer,
          byTicker: factorRows,
          topCandidates: factorRows.slice().sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0)).slice(0, 12),
        }
      : base.factorLayer,
    errors: [...(snapshot.errors || []), ...(base.errors || [])],
  };
}

function runWithStockSnapshots(run) {
  let next = run;
  for (const snapshot of stockSnapshotCache.values()) {
    next = mergeStockSnapshotIntoRun(next, snapshot);
  }
  return next;
}

function runHasTickerData(run, ticker) {
  if (!run || !ticker) return false;
  return Boolean(
    (run.quotes || []).some((item) => item.ticker === ticker) ||
      (run.technicals || []).some((item) => item.ticker === ticker) ||
      (run.news || []).some((item) => itemMatchesTicker(item, ticker)) ||
      (run.stockNarratives?.items || []).some((item) => item.ticker === ticker),
  );
}

async function requestStockSnapshot(ticker, options = {}) {
  const normalized = normalizeTickerInput(ticker);
  if (!normalized) return;
  if (!options.force && stockSnapshotCache.has(normalized)) return;
  if (stockSnapshotLoading.has(normalized)) return;
  stockSnapshotLoading.add(normalized);
  renderStockReport(selectedReportRun());
  try {
    const result = await api("/api/stocks/snapshot", {
      method: "POST",
      body: JSON.stringify({
        ticker: normalized,
      }),
    });
    if (result.snapshot?.ticker) {
      stockSnapshotCache.set(result.snapshot.ticker, result.snapshot);
      localStorage.setItem(STOCK_REPORT_STORAGE_KEY, result.snapshot.ticker);
    }
  } catch (error) {
    stockSnapshotCache.set(normalized, {
      ticker: normalized,
      generatedAt: new Date().toISOString(),
      quote: null,
      technical: null,
      news: [],
      errors: [{ source: "Longbridge Snapshot", ticker: normalized, error: error.message }],
      narrative: {
        ticker: normalized,
        provider: "longbridge-ad-hoc-error",
        oneLine: `${normalized} 按需拉取失败：${error.message}`,
        investmentAngle: "请检查 Longbridge 登录态、行情权限和网络后重试。",
        validationSteps: ["运行 Longbridge 诊断确认 quote、kline、news 是否可用。"],
        riskNotes: [error.message],
      },
    });
  } finally {
    stockSnapshotLoading.delete(normalized);
    renderStockReport(selectedReportRun());
  }
}

async function requestStockDeepDive(ticker, options = {}) {
  const normalized = normalizeTickerInput(ticker);
  if (!normalized) return;
  if (!options.force && stockDeepDiveCache.has(normalized)) return;
  if (stockDeepDiveLoading.has(normalized)) return;
  stockDeepDiveLoading.add(normalized);
  renderStockDeepDive(normalized);
  try {
    const result = await api(`/api/stocks/deep-dive?ticker=${encodeURIComponent(normalized)}`);
    if (result.deepDive?.ticker) {
      stockDeepDiveCache.set(result.deepDive.ticker, result.deepDive);
    }
  } catch (error) {
    stockDeepDiveCache.set(normalized, {
      ticker: normalized,
      error: error.message,
      dataQualityAudit: {
        status: "missing",
        score: 0,
        weakestBlocks: [{ label: "Deep Dive API", missingReason: error.message }],
      },
    });
  } finally {
    stockDeepDiveLoading.delete(normalized);
    renderStockDeepDive(normalized);
  }
}

async function requestUziAnalysis(ticker, options = {}) {
  const normalized = normalizeTickerInput(ticker);
  if (!normalized) return;
  if (uziAnalysisLoading.has(normalized)) return;
  uziAnalysisLoading.add(normalized);
  renderStockReport(selectedReportRun());
  try {
    const result = await api("/api/uzi/analyze", {
      method: "POST",
      body: JSON.stringify({
        ticker: normalized,
        depth: options.depth || "lite",
      }),
    });
    if (result.uziAnalysis?.ticker) {
      uziAnalysisCache.set(result.uziAnalysis.ticker, result.uziAnalysis);
    }
  } catch (error) {
    uziAnalysisCache.set(normalized, {
      ticker: normalized,
      provider: "UZI-Skill",
      status: "error",
      generatedAt: new Date().toISOString(),
      summary: `UZI 分析失败：${error.message}`,
      error: error.message,
      capabilities: ["22 维数据采集", "66 位投资者评审", "机构方法报告"],
      sourceRisk: "UZI 运行失败不会影响本系统的行情、新闻、因子评分和投资建议 Agent。",
    });
  } finally {
    uziAnalysisLoading.delete(normalized);
    renderStockReport(selectedReportRun());
  }
}

function countForRun(run, field, fallbackField = `${field}Count`) {
  if (Number.isFinite(run?.[fallbackField])) return run[fallbackField];
  if (Array.isArray(run?.[field])) return run[field].length;
  return 0;
}

async function loadRunDetail(runId) {
  if (!runId || runDetailCache.has(runId) || runDetailLoading.has(runId)) return;
  runDetailLoading.add(runId);
  try {
    const result = await api(`/api/runs/${encodeURIComponent(runId)}`);
    if (result.run?.id) {
      runDetailCache.set(result.run.id, result.run);
      if (localStorage.getItem(RUN_SELECTION_STORAGE_KEY) === result.run.id) render();
    }
  } catch (error) {
    const fallbackRunId = error.details?.fallbackRunId || (error.status === 404 ? appState.latest?.id || "" : "");
    if (localStorage.getItem(RUN_SELECTION_STORAGE_KEY) === runId && fallbackRunId) {
      localStorage.setItem(RUN_SELECTION_STORAGE_KEY, fallbackRunId);
    }
    runDetailWarning = error.status === 404
      ? "这份旧报告的归档文件已丢失，已自动切回最新报告。"
      : `历史报告仍安全保存在 Google Drive，当前下载失败，可稍后重试：${error.message}`;
    render();
  } finally {
    runDetailLoading.delete(runId);
  }
}

function ensureSelectedRunDetail() {
  const selected = selectedReportRun();
  if (selected?.summaryOnly) loadRunDetail(selected.id);
}

async function loadRunHistoryPage({ reset = false } = {}) {
  if (runHistoryLoading) return;
  runHistoryLoading = true;
  const offset = reset ? 0 : Number(runHistoryPagination.nextOffset || 0);
  try {
    const result = await api(`/api/runs?offset=${encodeURIComponent(offset)}&limit=50`);
    const incoming = result.runs || [];
    const existing = reset ? [] : (appState.runs || []);
    const byId = new Map(existing.map((run) => [run.id, run]));
    incoming.forEach((run) => byId.set(run.id, run));
    appState.runs = [...byId.values()].sort(
      (a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0),
    );
    runHistoryPagination = {
      loaded: true,
      nextOffset: Number(result.pagination?.nextOffset || appState.runs.length),
      hasMore: Boolean(result.pagination?.hasMore),
      total: Number(result.pagination?.total || appState.runs.length),
    };
  } catch (error) {
    runDetailWarning = `历史报告索引加载失败：${error.message}`;
    runHistoryPagination = { ...runHistoryPagination, loaded: true };
  } finally {
    runHistoryLoading = false;
    if (currentPage() === "ops") render();
  }
}

function ensureRunHistoryLoaded() {
  if (!runHistoryPagination.loaded && !runHistoryLoading) loadRunHistoryPage({ reset: true });
}

function renderRunHistory(runs, selectedRun) {
  const rows = runs || [];
  if (!rows.length) {
    els.runHistoryBox.innerHTML = empty("暂无历史报告。运行采集后会保留最近报告。");
    return;
  }
  els.runHistoryBox.innerHTML = `${runDetailWarning ? `<p class="quality-warning">${escapeHtml(runDetailWarning)}</p>` : ""}<div class="run-history-list">
    ${rows
      .map((run, index) => {
        const isActive = run.id === selectedRun?.id;
        const archiveMissing = Boolean(run.summaryOnly && run.archiveAvailable === false);
        const driveArchived = run.archiveLocation === "google-drive";
        const readiness = run.dataQuality?.readiness;
        const coreErrors = Number.isFinite(run.dataQuality?.coreErrorCount)
          ? run.dataQuality.coreErrorCount
          : countForRun(run, "errors", "errorCount");
        return `<button class="run-history-row ${isActive ? "active" : ""} ${archiveMissing ? "disabled" : ""}" type="button" data-run-id="${escapeHtml(run.id)}" ${archiveMissing ? "disabled" : ""}>
          <div>
            <strong>${escapeHtml(sessionLabel(run.session))}${index === 0 ? " · 最新" : ""}</strong>
            <p class="muted">${escapeHtml(fmtTime(run.completedAt))}</p>
          </div>
          <div class="run-history-meta">
            <span>${escapeHtml(countForRun(run, "news", "newsCount"))} 新闻</span>
            <span>${escapeHtml(countForRun(run, "filings", "filingsCount"))} SEC</span>
            <span class="${readiness?.status === "usable" ? "gain" : "loss"}">${escapeHtml(
              readiness ? `${readiness.label} ${readiness.score}` : "未评估",
            )}</span>
            <span class="${coreErrors ? "loss" : "muted"}">${escapeHtml(coreErrors)} 核心异常</span>
            ${driveArchived ? `<span class="tag green">Drive 冷归档</span>` : ""}
            ${archiveMissing ? `<span class="loss">归档缺失</span>` : ""}
          </div>
        </button>`;
      })
      .join("")}
  </div>${runHistoryPagination.hasMore
    ? `<button class="btn compact ghost" type="button" data-run-history-more ${runHistoryLoading ? "disabled" : ""}>${runHistoryLoading ? "加载中..." : `加载更多（${escapeHtml(rows.length)}/${escapeHtml(runHistoryPagination.total)}）`}</button>`
    : ""}`;
}

function renderStatus(run) {
  if (collectionStatus?.state === "running") {
    const label = sessionLabel(collectionStatus.session);
    els.briefTitle.textContent = `${label}采集中`;
    els.briefMeta.textContent = `${collectionStatus.message || "正在采集。"} · 已用时 ${collectionElapsed(collectionStatus)} · LLM：${collectionStatus.llmProvider || "-"}`;
    els.statusGrid.innerHTML = [
      metric(collectionStateLabel(collectionStatus.state), "状态"),
      metric(label, "任务"),
      metric(collectionElapsed(collectionStatus), "用时"),
      metric(collectionStatus.llmProvider || "-", "LLM"),
    ].join("");
    return;
  }
  if (collectionStatus?.state === "failed") {
    const label = sessionLabel(collectionStatus.session);
    els.briefTitle.textContent = `${label}采集失败`;
    els.briefMeta.textContent = `${collectionStatus.message || "采集失败。"} ${collectionStatus.error ? `错误：${errorLabel(collectionStatus.error)}` : ""}`;
    els.statusGrid.innerHTML = [
      metric(collectionStateLabel(collectionStatus.state), "状态"),
      metric(label, "任务"),
      metric(collectionElapsed(collectionStatus), "用时"),
    ].join("");
    return;
  }
  if (!run) {
    els.briefTitle.textContent = "等待采集";
    els.briefMeta.textContent = "点击上方按钮抓取新闻、SEC 文件和可用行情。";
    els.statusGrid.innerHTML = [
      metric("0", "新闻"),
      metric("0", "SEC 文件"),
      metric("0", "视频"),
    ].join("");
    return;
  }
  const label = sessionLabel(run.session);
  const viewingHistory = appState.latest?.id && run.id !== appState.latest.id;
  const coreErrors = Number.isFinite(run.dataQuality?.coreErrorCount) ? run.dataQuality.coreErrorCount : run.errors.length;
  const optionalWarnings = Number.isFinite(run.dataQuality?.optionalWarningCount)
    ? run.dataQuality.optionalWarningCount
    : 0;
  const fresh = freshnessInfo(run.completedAt);
  els.briefTitle.textContent = run.analysis?.headline || `${label}简报`;
  els.briefMeta.textContent = `${viewingHistory ? "历史回看 · " : ""}${label}采集完成：${fmtTime(run.completedAt)}，触发方式：${run.trigger}，新鲜度：${fresh.label}（${fresh.detail}）`;
  els.statusGrid.innerHTML = [
    metric(readinessMetric(run.dataQuality?.readiness), "可用性"),
    metric(fresh.label, "新鲜度"),
    metric(run.news.length, "新闻"),
    metric(run.filings.length, "SEC 文件"),
    metric((run.socialPosts || []).length, "社交"),
    metric(run.videos.length, "YouTube"),
    metric(run.quotes.length, "报价"),
    metric(coreErrors, "核心异常"),
    metric(optionalWarnings, "可选警告"),
    metric(run.watchlist.length, "Ticker"),
  ].join("");
}

function metric(value, label) {
  return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(
    label,
  )}</span></div>`;
}

function toneTagClass(tone) {
  if (tone === "riskOn") return "green";
  if (tone === "riskOff") return "red";
  if (tone === "cautious") return "amber";
  return "";
}

function changeClass(value, riskTone = "") {
  if (riskTone === "riskOff") return "negative";
  if (riskTone === "riskOn") return "positive";
  if (!Number.isFinite(value)) return "";
  return value > 0 ? "positive" : value < 0 ? "negative" : "";
}

function looksLikeRawMarketText(text = "") {
  return /IBKR 门户补充|IBKR 门户摘要|正文依据|原文结论|https?:\/\/|Newswire|Briefing\.com|Market Update/i.test(String(text || ""));
}

function marketSummaryForDisplay(overview = {}) {
  const synthesized = overview.marketSynthesis?.summary || "";
  const raw = synthesized || overview.summary || "";
  const cleaned = String(raw || "").replace(/\s*IBKR 门户补充：[\s\S]*$/i, "").trim();
  return cleaned || "暂无大盘摘要。";
}

function marketRatesNote(overview = {}) {
  const latestYield = overview?.macro?.akshare?.yields?.[0];
  if (!latestYield) return "";
  const us2y = optionalFiniteNumber(latestYield.us2yYield);
  const us10y = optionalFiniteNumber(latestYield.us10yYield);
  const curve = optionalFiniteNumber(latestYield.usYieldCurve10y2y);
  const curveText = curve === null ? "" : `，10Y-2Y ${fmtNumber(curve, 2)}bp`;
  return `美债收益率：2Y ${us2y === null ? "暂无" : `${fmtNumber(us2y, 2)}%`}，10Y ${us10y === null ? "暂无" : `${fmtNumber(us10y, 2)}%`}${curveText}。`;
}

function marketNotesForDisplay(overview = {}) {
  const ratesNote = marketRatesNote(overview);
  const notes = (overview.notes || [])
    .map((note) => String(note || "").trim())
    .filter((note) => note && !looksLikeRawMarketText(note) && (!ratesNote || !/^美债收益率[：:]/.test(note)));
  return ratesNote ? [...notes.slice(0, 3), ratesNote] : notes.slice(0, 4);
}

function marketAssetIsEtfProxy(asset = {}) {
  if (asset.fallbackUsed) return true;
  const sourceSymbol = asset.sourceSymbol || asset.symbol || asset.fallbackSymbol || "";
  return isEtfInstrument({ ...asset, ticker: sourceSymbol }, sourceSymbol);
}

function marketAssetDisplayLabel(asset = {}) {
  return asset.fallbackUsed ? `${asset.label || asset.symbol || "市场资产"} · ETF 代理` : asset.label || asset.symbol || "市场资产";
}

function marketAssetValueLabel(asset = {}) {
  if (marketAssetIsEtfProxy(asset)) return "ETF 价格";
  if (String(asset.symbol || "").startsWith("^")) return "指数点位";
  return "资产价格";
}

function marketAssetInterpretationForDisplay(asset = {}) {
  const raw = asset.interpretation || "";
  if (!asset.fallbackUsed) return raw;
  const proxy = asset.sourceSymbol || asset.fallbackSymbol || "该 ETF";
  return `${proxy} 为 ETF 代理，其价格不等同于 ${asset.label || asset.symbol || "对应指数"} 点位。${raw}`;
}

function marketPortalBriefForDisplay(overview = {}) {
  const text = overview.portalBrief || overview.marketSynthesis?.portalTakeaway || overview.portal?.summary || "";
  if (!text || looksLikeRawMarketText(text)) return "";
  return text;
}

function marketEditorialBriefForDisplay(overview = {}) {
  const brief = overview.editorialBrief || {};
  const rawText = overview.editorialBriefText || brief.summary || overview.marketSynthesis?.editorialTakeaway || "";
  const text = /市场综述线索集中在/.test(rawText)
    ? "市场编辑综述当前只读取到标题或 RSS 摘要，未读取到足够正文；不能据此判断大盘上涨、下跌或板块轮动原因。"
    : rawText;
  if (!text || looksLikeRawMarketText(text)) return null;
  return {
    text,
    generatedAt: brief.generatedAt || overview.generatedAt || "",
    sources: Array.isArray(brief.sources) ? brief.sources.slice(0, 4) : [],
    items: Array.isArray(brief.items) ? brief.items.slice(0, 3) : [],
  };
}

function marketEditorialReadLabel(item = {}) {
  if (item.readDepth === "body") return "已读正文";
  if (item.readDepth === "summary") return "有效摘要";
  if (item.articleStatus === "ok" && Number(item.textChars || 0) > 0) return "正文不足";
  return "仅标题/RSS";
}

function marketIndustryRankForDisplay(overview = {}) {
  const rank = overview.industryRank || {};
  const ranks = Array.isArray(rank.ranks) ? rank.ranks : [];
  const peerTrees = Array.isArray(rank.peerTrees) ? rank.peerTrees : [];
  if (!ranks.length && !peerTrees.length) return null;
  return {
    summary: Array.isArray(rank.summary) ? rank.summary.slice(0, 3) : [],
    ranks: ranks
      .map((group) => ({
        label: group.label || group.indicator || "行业榜",
        rows: (group.rows || []).slice(0, 3),
      }))
      .filter((group) => group.rows.length)
      .slice(0, 4),
    peerTrees: peerTrees.slice(0, 3).map((tree) => ({
      name: tree.name || tree.counterId || "行业层级",
      nodes: (tree.nodes || []).filter((node) => Number(node.level || 0) > 0).slice(0, 5),
    })),
  };
}

function renderMarketOverview(run) {
  const overview = run?.marketOverview;
  if (!els.marketOverview) return;
  if (!overview) {
    els.marketOverview.className = "market-overview empty-state";
    els.marketOverview.textContent = "运行采集后显示纳指、标普、恐慌指数代理、长债、美元等市场状态。";
    return;
  }
  const assets = overview.assets || [];
  const available = assets.filter((item) => item.available);
  const lead = available.slice(0, 6);
  const notes = marketNotesForDisplay(overview);
  const portalBrief = marketPortalBriefForDisplay(overview);
  const editorialBrief = marketEditorialBriefForDisplay(overview);
  const industryRank = marketIndustryRankForDisplay(overview);
  els.marketOverview.className = "market-overview";
  els.marketOverview.innerHTML = `
    <div class="market-hero">
      <div>
        <div class="feed-meta">
          <span class="tag ${toneTagClass(overview.tone)}">${escapeHtml(overview.regime || "未知")}</span>
          <span class="tag">风险分 ${escapeHtml(overview.riskScore ?? "-")}/100</span>
          <span class="tag">${escapeHtml(overview.provider || "无可用行情")}</span>
        </div>
        <p>${escapeHtml(marketSummaryForDisplay(overview))}</p>
      </div>
      <div class="market-score">
        <strong>${escapeHtml(overview.riskScore ?? "-")}</strong>
        <span>系统风险</span>
      </div>
    </div>
    ${
      notes.length
        ? `<ul class="market-notes">${notes
            .map((note) => `<li>${escapeHtml(note)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${
      industryRank
        ? `<div class="market-portal-note">
            <div class="feed-meta">
              <span class="tag green">Longbridge 板块热度</span>
              <span>行业 rank + peers</span>
            </div>
            ${
              industryRank.summary.length
                ? `<ul class="compact-list">${industryRank.summary
                    .map((line) => `<li>${escapeHtml(line)}</li>`)
                    .join("")}</ul>`
                : ""
            }
            <div class="mini-grid">
              ${industryRank.ranks
                .map(
                  (group) => `<article class="mini-card">
                    <strong>${escapeHtml(group.label)}</strong>
                    ${group.rows
                      .map(
                        (row) => `<p>
                          ${escapeHtml(row.name || "-")}
                          <span class="${changeClass(Number(row.changePercent))}">${escapeHtml(pctLabel(Number(row.changePercent)))}</span>
                          ${
                            row.leadingTicker
                              ? `<small class="muted">龙头 ${escapeHtml(row.leadingTicker)}${row.leadingName ? ` · ${escapeHtml(row.leadingName)}` : ""}</small>`
                              : ""
                          }
                        </p>`,
                      )
                      .join("")}
                  </article>`,
                )
                .join("")}
            </div>
            ${
              industryRank.peerTrees.length
                ? `<p class="muted">${escapeHtml(
                    industryRank.peerTrees
                      .map((tree) => `${tree.name}：${tree.nodes.map((node) => node.name).filter(Boolean).slice(0, 4).join("、")}`)
                      .join("；"),
                  )}</p>`
                : ""
            }
          </div>`
        : ""
    }
    <div class="market-assets">
      ${lead
        .map((asset) => {
          const isEtfProxy = marketAssetIsEtfProxy(asset);
          return `<article class="market-asset">
            <div class="row">
              <div>
                <h3>${escapeHtml(marketAssetDisplayLabel(asset))}</h3>
                <p class="muted">${escapeHtml(asset.sourceSymbol || asset.symbol)} · ${escapeHtml(asset.group)}</p>
              </div>
              <div class="feed-meta market-asset-tags">
                ${isEtfProxy ? `<span class="tag amber">ETF 代理</span>` : ""}
                <span class="tag ${toneTagClass(asset.riskTone)}">${escapeHtml(asset.riskTone === "riskOn" ? "偏风险偏好" : asset.riskTone === "riskOff" ? "偏避险" : "中性")}</span>
              </div>
            </div>
            <div class="market-price-line">
              <div class="market-price-value">
                <strong>${escapeHtml(fmtNumber(asset.price, 2))}</strong>
                <small>${escapeHtml(marketAssetValueLabel(asset))}</small>
              </div>
              <span class="${changeClass(asset.changePercent, asset.riskTone)}">${escapeHtml(pctLabel(asset.changePercent))}</span>
            </div>
            <p>${escapeHtml(asset.role || "")}</p>
            <p class="muted">${escapeHtml(marketAssetInterpretationForDisplay(asset))}</p>
          </article>`;
        })
        .join("")}
    </div>
    ${
      overview.caveats?.length
        ? `<p class="muted market-caveat">${escapeHtml(overview.caveats.slice(0, 2).join(" "))}</p>`
        : ""
    }
    ${
      editorialBrief
        ? `<div class="market-portal-note">
            <div class="feed-meta">
              <span class="tag green">市场编辑综述</span>
              <span>${escapeHtml(fmtTime(editorialBrief.generatedAt))}</span>
              ${editorialBrief.sources.length ? `<span>${escapeHtml(editorialBrief.sources.join(" / "))}</span>` : ""}
            </div>
            <p>${escapeHtml(editorialBrief.text)}</p>
            ${
              editorialBrief.items.length
                ? `<ul class="compact-list">${editorialBrief.items
                    .map(
                      (item) => `<li>
                        ${
                          item.url
                            ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || item.source || "市场综述")}</a>`
                            : escapeHtml(item.title || item.source || "市场综述")
                        }
                        <small class="muted">${escapeHtml(marketEditorialReadLabel(item))}${item.textChars ? ` · ${escapeHtml(item.textChars)} 字符` : ""}</small>
                        ${item.articleError ? `<small class="muted">${escapeHtml(item.articleError)}</small>` : ""}
                        ${item.summary ? `<span>${escapeHtml(item.summary)}</span>` : ""}
                      </li>`,
                    )
                    .join("")}</ul>`
                : ""
            }
          </div>`
        : ""
    }
    ${
      portalBrief
        ? `<div class="market-portal-note">
            <div class="feed-meta">
              <span class="tag green">IBKR Portal</span>
              <span>${escapeHtml(fmtTime(overview.portal?.updatedAt))}</span>
            </div>
            <p>${escapeHtml(portalBrief)}</p>
          </div>`
        : ""
    }
  `;
}

const HOT_NEWS_CATEGORY_META = {
  macro: { label: "宏观", tagClass: "amber" },
  market: { label: "市场", tagClass: "green" },
  stock: { label: "个股", tagClass: "red" },
};

function normalizeHotNewsCategory(value) {
  const text = cleanDisplayText(value).toLowerCase();
  if (!text) return "";
  if (["macro", "macroeconomic", "economy", "economic"].includes(text) || text.includes("宏观")) return "macro";
  if (["market", "markets", "index", "sector"].includes(text) || text.includes("市场")) return "market";
  if (["stock", "stocks", "company", "single-stock", "single stock"].includes(text) || text.includes("个股")) return "stock";
  return "";
}

function hotNewsCategoryMeta(value) {
  const category = normalizeHotNewsCategory(value) || "market";
  return {
    category,
    ...HOT_NEWS_CATEGORY_META[category],
  };
}

function newsRelevanceMeta(item = {}) {
  const category = item.relevanceCategory || item.newsRelevance?.category || "";
  const label = item.relevanceLabel || item.newsRelevance?.label || "";
  const confidence = item.relevanceConfidence ?? item.newsRelevance?.confidence;
  const tagClass =
    category === "direct_company_news"
      ? "green"
      : category === "sector_related_news"
        ? "amber"
        : category === "macro_market_news"
          ? ""
          : "";
  return {
    category,
    label,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : null,
    tagClass,
  };
}

function newsRelevanceTag(item = {}) {
  const meta = newsRelevanceMeta(item);
  const base = meta.label
    ? `<span class="tag ${escapeHtml(meta.tagClass)}">${escapeHtml(meta.label)}${meta.confidence !== null ? ` ${escapeHtml(Math.round(meta.confidence))}` : ""}</span>`
    : "";
  const ownership = item.newsOwnership || {};
  const mismatch = Boolean(item.ownershipMismatch || ownership.mismatch);
  const confidence = Number(item.ownershipConfidence ?? ownership.confidence);
  const mismatchTag = mismatch
    ? `<span class="tag red">主体疑似错配${Number.isFinite(confidence) ? ` ${escapeHtml(Math.round(confidence))}` : ""}</span>`
    : "";
  return `${base}${mismatchTag}`;
}

function aiProvenanceMeta(item = {}) {
  const article = item.article || {};
  if (article.llmBased) {
    return {
      label: `LLM 摘要${article.llmProvider ? ` · ${providerLabel(article.llmProvider)}` : ""}`,
      tagClass: "green",
    };
  }
  if (article.llmError) {
    return { label: "LLM 失败 · 本地兜底", tagClass: "amber" };
  }
  if (article.status === "ok") {
    return { label: "已读原文 · 规则摘要", tagClass: "amber" };
  }
  if (article.status === "source-limited" || article.status === "error") {
    return { label: "原文受限 · 标题兜底", tagClass: "red" };
  }
  if (item.llmBriefZh || item.llmImportanceReason || item.llmImportanceScore !== undefined) {
    return { label: "LLM 重要性筛选", tagClass: "green" };
  }
  return { label: "本地规则", tagClass: "" };
}

function aiProvenanceTag(item = {}) {
  const meta = aiProvenanceMeta(item);
  return `<span class="tag ${escapeHtml(meta.tagClass)}">${escapeHtml(meta.label)}</span>`;
}

function hotNewsCategoryFromItem(item = {}) {
  const existing = normalizeHotNewsCategory(item.hotNewsCategory || item.category);
  const text = cleanDisplayText([
    item.title,
    item.titleZh,
    item.summaryZh,
    item.whyHot,
    item.llmBriefZh,
    item.article?.title,
    item.article?.summaryZh,
    item.article?.investmentView,
    item.catalyst?.summaryZh,
    item.catalyst?.themes?.join(" "),
  ].filter(Boolean).join(" ")).toLowerCase();
  const related = [item.ticker, ...(item.relatedTickers || [])]
    .map((ticker) => String(ticker || "").toUpperCase())
    .filter((ticker) => ticker && ticker !== "MARKET");
  if (!text && existing) return existing;
  const marketProxyTickers = new Set(["SPY", "QQQ", "DIA", "IWM", "VXX", "UVXY", "SQQQ", "TQQQ", "TLT", "IEF", "GLD", "SLV", "USO"]);
  if (related.length && related.every((ticker) => marketProxyTickers.has(ticker))) return "market";
  if (/fed|fomc|inflation|cpi|ppi|pce|treasury|yield|payroll|unemployment|gdp|tariff|oil|opec|美联储|政策利率|基准利率|隔夜利率|降息|加息|通胀|非农|就业|国债收益率|美债收益率|关税|原油/.test(text)) {
    return "macro";
  }
  if (!related.length) return "market";
  if (related.length >= 3 && /market|nasdaq|s&p|dow|russell|index|sector|rotation|volatility|vix|大盘|市场|指数|板块|轮动|波动率/.test(text)) {
    return "market";
  }
  return related.length <= 2 ? "stock" : "market";
}

function hotNewsCategoryGroups(run) {
  const groups = run?.hotNews?.categoryGroups;
  if (Array.isArray(groups) && groups.length) {
    return groups
      .map((group) => {
        const meta = hotNewsCategoryMeta(group.category || group.label);
        return {
          ...group,
          category: meta.category,
          label: group.label || meta.label,
          items: (group.items || []).map((item) => ({
            ...item,
            hotNewsCategory: normalizeHotNewsCategory(item.hotNewsCategory || item.category) || meta.category,
          })),
        };
      })
      .filter((group) => group.items.length);
  }
  const buckets = { macro: [], market: [], stock: [] };
  for (const item of run?.hotNews?.items || []) {
    const category = hotNewsCategoryFromItem(item);
    buckets[category].push({ ...item, hotNewsCategory: category });
  }
  return ["macro", "market", "stock"]
    .map((category) => ({
      category,
      label: HOT_NEWS_CATEGORY_META[category].label,
      count: buckets[category].length,
      items: buckets[category],
    }))
    .filter((group) => group.items.length);
}

function renderMoversWithReasons(run) {
  if (!els.moversWithReasonsBox) return;
  const box = els.moversWithReasonsBox;
  if (!run) {
    box.className = "movers-box empty-state";
    box.innerHTML = "运行采集后显示今日异动股、涨跌幅与对应催化原因。";
    return;
  }
  const items = run?.moversWithReasons?.items || [];
  if (!items.length) {
    box.className = "movers-box empty-state";
    box.innerHTML = "暂无异动数据（Longbridge 异动榜未返回，或当前非交易时段）。";
    return;
  }
  box.className = "movers-box";
  const withReason = Number.isFinite(run.moversWithReasons?.withReason)
    ? run.moversWithReasons.withReason
    : items.filter((item) => item.reason).length;
  const cards = items
    .slice(0, 14)
    .map((item) => {
      const label = tickerLabel(item.ticker, { ...item, run });
      const name = tickerNameLine(item.ticker, { ...item, run });
      const labels = (item.labels || [])
        .slice(0, 2)
        .map((label) => `<span class="tag subtle">${escapeHtml(label)}</span>`)
        .join("");
      const alert = item.alertReason ? `<span class="tag subtle">${escapeHtml(item.alertReason)}</span>` : "";
      const reason = item.reason
        ? `<p class="mover-reason">${escapeHtml(item.reason)}</p>`
        : `<p class="mover-reason muted">${escapeHtml(item.note || "暂无可解释消息，需进一步核查。")}</p>`;
      return `<article class="mover-card" data-ticker="${escapeHtml(item.ticker)}" role="button" tabindex="0" title="${escapeHtml(`查看 ${label} 个股详情`)}">
        <div class="mover-head">
          <div class="mover-id"><strong>${escapeHtml(item.ticker)}</strong><span class="mover-name">${escapeHtml(name)}</span></div>
          <span class="mover-change ${changeClass(item.changePercent)}">${escapeHtml(pctLabel(item.changePercent))}</span>
        </div>
        <div class="mover-tags">${labels}${alert}</div>
        ${reason}
      </article>`;
    })
    .join("");
  const header = `<div class="movers-summary muted">共 ${items.length} 只异动，其中 ${withReason} 只有可解释催化（来源：Longbridge 异动榜 + 已采集新闻）。</div>`;
  box.innerHTML = header + `<div class="movers-grid">${cards}</div>`;
}

function renderHotNews(run) {
  if (!els.hotNewsList) return;
  const items = run?.hotNews?.items || [];
  if (!run) {
    els.hotNewsList.className = "hot-news-list empty-state";
    els.hotNewsList.innerHTML = "运行采集后显示市场热闻。";
    return;
  }
  if (!items.length) {
    els.hotNewsList.className = "hot-news-list empty-state";
    els.hotNewsList.innerHTML = "暂无市场热闻。";
    return;
  }
  els.hotNewsList.className = "hot-news-list";
  const bulletList = (title, rows = []) =>
    rows?.length
      ? `<div class="hot-news-bullets"><strong>${escapeHtml(title)}</strong><ul>${rows
          .slice(0, 5)
          .map((row) => `<li>${escapeHtml(cleanHotNewsBody(row))}</li>`)
          .join("")}</ul></div>`
      : "";
  const summary = run.hotNews?.marketSummaryZh
    ? `<article class="hot-news-card hot-news-summary">
        <div class="feed-meta">
          <span class="tag red">AI Top10</span>
          ${run.hotNews?.provider ? `<span>${escapeHtml(providerLabel(run.hotNews.provider))}</span>` : ""}
          ${run.hotNews?.filter?.candidateCount ? `<span>候选 ${escapeHtml(run.hotNews.filter.candidateCount)}</span>` : ""}
        </div>
        <h3>今日新闻主线</h3>
        <p>${escapeHtml(cleanHotNewsBody(run.hotNews.marketSummaryZh))}</p>
        ${bulletList("主线", run.hotNews.themeBullets)}
        ${bulletList("风险", run.hotNews.riskBullets)}
        ${bulletList("接下来观察", run.hotNews.watchBullets)}
      </article>`
    : "";
  const groups = hotNewsCategoryGroups(run);
  const groupedHtml = groups
    .map((group) => {
      const meta = hotNewsCategoryMeta(group.category);
      return `<section class="hot-news-category hot-news-category-${escapeHtml(meta.category)}">
        <div class="hot-news-category-head">
          <h3>${escapeHtml(group.label || meta.label)}</h3>
          <span class="tag ${escapeHtml(meta.tagClass)}">${escapeHtml(group.items.length)} 条</span>
        </div>
        <div class="hot-news-category-grid">${group.items.map(hotNewsItem).join("")}</div>
      </section>`;
    })
    .join("");
  els.hotNewsList.innerHTML = `${summary}${groupedHtml || items.slice(0, 10).map(hotNewsItem).join("")}`;
}

function hotNewsItem(item) {
  const href = item.finalUrl || item.article?.finalUrl || item.resolvedUrl || item.url;
  const categoryMeta = hotNewsCategoryMeta(item.hotNewsCategory || item.category);
  const related = [item.ticker, ...(item.relatedTickers || [])]
    .filter((ticker) => ticker && ticker !== "MARKET")
    .filter((ticker, index, rows) => rows.indexOf(ticker) === index)
    .slice(0, 4);
  const summary = cleanHotNewsBody(item.summaryZh || item.article?.summaryZh || item.catalyst?.summaryZh || "");
  const why = cleanHotNewsBody(item.whyHot || item.article?.summaryZh || item.summaryZh || "");
  const missingEarningsData = hotNewsMissingEarningsData(item);
  const triad = triadFromItem(item, {
    conclusion: missingEarningsData
      ? `${displayHotNewsTitle(item)}：当前没有提取到收入、EPS、毛利率或下季指引等关键数字。`
      : item.llmBriefZh || item.article?.investmentView || summary || why || displayHotNewsTitle(item),
    evidence: missingEarningsData
      ? "未提取到收入、EPS、毛利率或指引数字；不能判断 beat/miss 或估值影响。"
      : uniqueCompactRows([item.article?.keyData || [], item.article?.evidenceLines || [], item.catalyst?.evidence || []], 2).join("；") || evidenceFromItem(item),
    observation: item.llmImportanceReason || item.article?.investmentAdvice || item.catalyst?.checks?.[0] || observationFromItem(item),
  });
  return `<article class="hot-news-card">
    <div class="feed-meta">
      <span class="tag ${escapeHtml(categoryMeta.tagClass)}">${escapeHtml(categoryMeta.label)}</span>
      ${newsRelevanceTag(item)}
      ${aiProvenanceTag(item)}
      <span class="tag red">重要 ${escapeHtml(item.llmImportanceScore ?? item.effectiveScore ?? item.hotScore ?? "")}</span>
      <span>${escapeHtml(sourceLabel(item.publisher || item.source || ""))}</span>
      <span>${fmtTime(item.publishedAt)}</span>
    </div>
    <h3><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(displayHotNewsTitle(item))}</a></h3>
    ${renderInsightTriad(triad)}
    ${
      related.length
        ? `<div class="feed-meta">${related.map((ticker) => `<span class="tag">${escapeHtml(tickerLabel(ticker, { run: appState?.latest }))}</span>`).join("")}</div>`
        : ""
    }
  </article>`;
}

function calendarTimeOrder(value) {
  const text = cleanDisplayText(value).toLowerCase();
  if (!text) return 50 * 60;
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3] || "";
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  if (/\b(before|pre|bmo)\b|盘前|开盘前/.test(text)) return 8 * 60;
  if (/\b(during|dmh)\b|盘中/.test(text)) return 12 * 60;
  if (/\b(after|post|amc)\b|盘后|收盘后/.test(text)) return 17 * 60;
  return 50 * 60;
}

function compareCalendarEventsAsc(a = {}, b = {}) {
  const dateCompare = `${a.date || ""}`.localeCompare(`${b.date || ""}`);
  if (dateCompare) return dateCompare;
  const timeCompare = calendarTimeOrder(a.time) - calendarTimeOrder(b.time);
  if (timeCompare) return timeCompare;
  return `${a.ticker || a.title || ""}`.localeCompare(`${b.ticker || b.title || ""}`);
}

function renderEventCalendar(run) {
  if (!els.eventCalendarBox) return;
  const calendar = run?.eventCalendar;
  const events = calendar?.events || [];
  if (!run) {
    els.eventCalendarBox.className = "event-calendar-box empty-state";
    els.eventCalendarBox.innerHTML = "运行采集后显示重要财报、非农、美联储讲话和宏观发布时间。";
    return;
  }
  if (!events.length) {
    els.eventCalendarBox.className = "event-calendar-box empty-state";
    els.eventCalendarBox.innerHTML = "暂无关键日历。请检查 Finnhub key 或基础面 provider 是否返回财报日期。";
    return;
  }
  const earnings = (calendar.earnings || []).slice().sort(compareCalendarEventsAsc).slice(0, 12);
  const macro = (calendar.macro || []).slice().sort(compareCalendarEventsAsc).slice(0, 12);
  const row = (event) => {
    const isMacro = event.type === "macro";
    const label = isMacro ? event.category || "宏观" : event.ticker ? tickerLabel(event.ticker, { ...event, run }) : "财报";
    const importance = !isMacro && Number.isFinite(event.importanceScore) ? `重要度 ${event.importanceScore}` : "";
    const detail = isMacro
      ? [event.country, event.estimate ? `预期 ${event.estimate}` : "", event.previous ? `前值 ${event.previous}` : ""].filter(Boolean).join(" · ")
      : [event.time, event.period, Number.isFinite(event.epsEstimate) ? `EPS预期 ${fmtNumber(event.epsEstimate, 2)}` : "", Number.isFinite(event.revenueEstimate) ? `收入预期 ${fmtNumber(event.revenueEstimate / 1000000, 1)}M` : ""].filter(Boolean).join(" · ");
    const reason = !isMacro && event.importanceReasons?.length ? event.importanceReasons.join(" · ") : "";
    return `<article class="calendar-row ${event.priority === "high" ? "high" : ""}">
      <div class="calendar-date">
        <strong>${escapeHtml(event.date || "-")}</strong>
        ${event.time ? `<span>${escapeHtml(event.time)}</span>` : ""}
      </div>
      <div>
        <div class="feed-meta">
          <span class="tag ${isMacro ? "amber" : "green"}">${escapeHtml(label)}</span>
          ${importance ? `<span class="tag ${event.priority === "high" ? "red" : "amber"}">${escapeHtml(importance)}</span>` : ""}
          ${event.verified ? `<span class="tag green">已校验</span>` : `<span class="tag amber">待复核</span>`}
        </div>
          <h3>${escapeHtml(event.title || label)}</h3>
        ${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ""}
        ${reason ? `<p class="muted">重要原因：${escapeHtml(reason)}</p>` : ""}
        ${event.sources?.length ? `<p class="muted">来源：${escapeHtml(event.sources.join(" + "))}</p>` : ""}
      </div>
    </article>`;
  };
  els.eventCalendarBox.className = "event-calendar-box";
  els.eventCalendarBox.innerHTML = `<article class="calendar-summary">
      <div class="feed-meta">
        <span class="tag red">${escapeHtml(calendar.lookaheadDays || "-")} 天前瞻</span>
        <span>${escapeHtml(calendar.source || "")}</span>
        <span>已校验 ${escapeHtml(calendar.verification?.verifiedCount ?? 0)}</span>
      </div>
      <p>${escapeHtml(cleanDisplayText(calendar.summary || "未来关键日程待补充。"))}</p>
      ${calendar.importanceDefinition ? `<p class="muted">${escapeHtml(calendar.importanceDefinition)}</p>` : ""}
    </article>
    <div class="calendar-columns">
      <section>
        <h3>重要股票财报</h3>
        ${earnings.length ? earnings.map(row).join("") : empty("暂无未来财报日期。")}
      </section>
      <section>
        <h3>宏观/Fed 节点</h3>
        ${macro.length ? macro.map(row).join("") : empty("暂无非农、FOMC、CPI/PPI/PCE 或 Fed 发言节点。")}
      </section>
    </div>`;
}

function displayHotNewsTitle(item) {
  const original = item?.title || item?.article?.title || "";
  const title = displayTitle(item);
  if (hotNewsMissingEarningsData(item) && /重点是财报|财报\/指引|财报和指引|未来盈利预期|估值倍数/.test(title)) {
    const ticker = item?.ticker && item.ticker !== "MARKET" ? `${item.ticker} ` : "";
    return `${ticker}疑似财报/指引新闻，缺少收入、EPS、毛利率或指引数字`;
  }
  if (title && !/^市场热闻：.+需要打开原文/.test(title)) return title;
  const literal = literalHotNewsTitle(original);
  if (literal) return literal;
  return translateCommonHotNewsTerms(original) || title || "市场热闻";
}

function cleanHotNewsBody(value) {
  return cleanDisplayText(value)
    .replace(/\bMARKET\s+原文/g, "原文")
    .replace(/\bMARKET\s+投资观察/g, "投资观察")
    .replace(/\bMARKET\s+这条材料/g, "这条材料")
    .replace(/影响观察：MARKET\s*/g, "影响观察：")
    .replace(/原文事实：正文依据：[^。]*[A-Za-z][^。]*。?/g, "")
    .replace(/正文依据：[^。]*[A-Za-z][^。]*。?/g, "")
    .replace(/^MARKET[：:\s-]+/i, "")
    .replace(/\bMARKET\b/g, "市场")
    .replace(/[；;]+/g, "，");
}

function literalHotNewsTitle(title) {
  const clean = cleanDisplayText(title);
  let match = clean.match(/^(.+?)\s+to buy\s+(.+?)\s+for\s+\$?([\d.]+)\s+billion\b/i);
  if (match) {
    const amount = Number(match[3]);
    const amountZh = Number.isFinite(amount) ? `约 ${fmtNumber(amount * 10, 0)} 亿美元` : "未披露金额";
    return `${translateCommonHotNewsTerms(match[1])}拟以${amountZh}收购${translateCommonHotNewsTerms(match[2])}`;
  }
  match = clean.match(/^(.+?)\s+looks to strengthen its AI platform\b/i);
  if (match) return `${translateCommonHotNewsTerms(match[1])}寻求加强 AI 平台`;
  if (/^things are lining up in favor of the market bulls/i.test(clean)) return "多项因素转向有利于市场多头，关注后续仓位节奏";
  if (/^we['’]?re adding to our position in a consumer bank/i.test(clean)) return "投资组合加仓受益于低油价的消费银行股";
  if (/^strait of hormuz traffic to return to normal as soon as august/i.test(clean)) return "交易者押注霍尔木兹海峡通行最快 8 月恢复正常";
  if (/^the club['’]?s top 10 things to watch in the stock market/i.test(clean)) return "The Club 股市十大关注点";
  match = clean.match(/^(.+?)\s+stock\s+(dives|drops|falls|plunges|sinks|slides|tumbles)\b/i);
  if (match) return `${translateCommonHotNewsTerms(match[1])}股价急跌，市场重新定价风险`;
  match = clean.match(/^(.+?)\s+stock\s+(rises|jumps|surges|soars|rallies)\b/i);
  if (match) return `${translateCommonHotNewsTerms(match[1])}股价走强，需核验基本面支撑`;
  return "";
}

function translateCommonHotNewsTerms(value) {
  let text = cleanDisplayText(value);
  const replacements = [
    [/\bstreaming device maker\b/gi, "流媒体设备商"],
    [/\bconsumer bank\b/gi, "消费银行"],
    [/\bmarket bulls\b/gi, "市场多头"],
    [/\bstock market\b/gi, "股市"],
    [/\bwall street\b/gi, "华尔街"],
    [/\bartificial intelligence\b/gi, "AI"],
    [/\bAI platform\b/gi, "AI 平台"],
    [/\blower oil prices\b/gi, "低油价"],
    [/\bpositive note\b/gi, "正面观点"],
    [/\bposition\b/gi, "仓位"],
    [/\bearnings\b/gi, "财报"],
    [/\brevenue\b/gi, "收入"],
    [/\bguidance\b/gi, "指引"],
    [/\binflation\b/gi, "通胀"],
    [/\brate cuts?\b/gi, "降息"],
    [/\btreasury yields?\b/gi, "美债收益率"],
    [/\bvolatility\b/gi, "波动率"],
    [/\boptions\b/gi, "期权"],
    [/\boil\b/gi, "油价"],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return cleanDisplayText(text);
}

function itemMatchesTicker(item, ticker) {
  return item?.ticker === ticker || (item?.relatedTickers || []).includes(ticker);
}

function watchlistRank(ticker) {
  const list = appState?.watchlist || [];
  const index = list.indexOf(String(ticker || "").toUpperCase());
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

function prioritizeWatchlist(items, tickerFn = (item) => item?.ticker) {
  return (items || [])
    .map((item, index) => ({ item, index, rank: watchlistRank(tickerFn(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.item);
}

function feedPriorityTicker(item) {
  const tickers = [item?.ticker, ...(item?.relatedTickers || [])].map((ticker) => String(ticker || "").toUpperCase());
  return tickers.slice().sort((a, b) => watchlistRank(a) - watchlistRank(b))[0] || item?.ticker;
}

function feedImportance(item) {
  const articleBoost = item?.article?.status === "ok" ? 120 : item?.article?.status === "error" ? -20 : 0;
  const materiality = Number(item?.catalyst?.materiality || 0);
  const secBoost = item?.type === "filing" && item?.secInsight?.priority === "high" ? 40 : 0;
  return articleBoost + materiality + secBoost;
}

function sortFeedItems(items) {
  return (items || [])
    .map((item, index) => ({
      item,
      index,
      watchRank: Number.isFinite(watchlistRank(feedPriorityTicker(item))) ? 0 : 1,
      importance: feedImportance(item),
      time: timeValue(item?.publishedAt),
    }))
    .sort((a, b) => a.watchRank - b.watchRank || b.importance - a.importance || b.time - a.time || a.index - b.index)
    .map((row) => row.item);
}

function pctLabel(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${fmtNumber(value, 1)}%`;
}

function reportToneLabel(report) {
  if (report.score >= 72) return "观察偏积极";
  if (report.score <= 42) return "偏谨慎";
  return "中性观察";
}

function reportToneClass(score) {
  if (score >= 72) return "green";
  if (score <= 42) return "red";
  return "amber";
}

function stockNextEarnings(run, ticker, fundamental = {}) {
  const symbol = String(ticker || "").toUpperCase();
  const calendarEvent = (run?.eventCalendar?.earnings || []).find((event) => event.ticker === symbol);
  if (calendarEvent) return calendarEvent;
  const earnings = fundamental?.nextEarnings || {};
  const date = earnings.date || earnings.date2 || earnings.period || earnings.reportDate || "";
  if (!date) return null;
  return {
    ticker: symbol,
    type: "earnings",
    title: `${symbol} 下次财报`,
    date,
    time: earnings.hour || earnings.time || "",
    period: earnings.period || earnings.quarter || "",
    epsEstimate: earnings.epsEstimate,
    revenueEstimate: earnings.revenueEstimate,
    verified: false,
    sources: [fundamental.provider || "Fundamentals"],
  };
}

function tradeMemoryForTicker(memory, ticker) {
  const symbol = normalizeTickerInput(ticker);
  if (!symbol || !memory?.byTicker?.[symbol]) return null;
  return {
    schemaVersion: memory.schemaVersion,
    provider: memory.provider,
    generatedAt: memory.generatedAt,
    caveat: memory.caveat,
    ...memory.byTicker[symbol],
  };
}

function buildStockReport(run, ticker) {
  const quote = (run.quotes || []).find((item) => item.ticker === ticker);
  const technical = (run.technicals || []).find((item) => item.ticker === ticker);
  const fundamental = (run.fundamentals || []).find((item) => item.ticker === ticker);
  const scoreRow = (run.analysis?.tickerScores || []).find((item) => item.ticker === ticker);
  const backtest = (run.backtest?.perTicker || []).find((item) => item.ticker === ticker);
  const socialHot = (run.socialHotStocks?.candidates || []).find((item) => item.ticker === ticker);
  const options = (run.options || []).find((item) => item.ticker === ticker);
  const openbbBundle = (run.openbb?.bundles || []).find((item) => item.symbol === ticker);
  const microstructure = (run.longBridge?.microstructure || []).find((item) => item.ticker === ticker);
  const narrative = (run.stockNarratives?.items || []).find((item) => item.ticker === ticker);
  const factorLayer = (run.factorLayer?.byTicker || []).find((item) => item.ticker === ticker);
  const researchPack = (run.researchPacks || []).find((item) => item.ticker === ticker);
  const allNewsPack = (run.allNewsPacks || []).find((item) => item.ticker === ticker);
  const investmentAdvisor = (run.investmentAdvice || []).find((item) => item.ticker === ticker);
  const industryChainPack = (run.industryChainPacks || []).find((item) => item.ticker === ticker) || narrative?.industryChainPack || null;
  const tradeMemory = tradeMemoryForTicker(appState.tradeJournal?.tradeMemory, ticker);
  const news = [...(run.news || []), ...(run.videos || [])]
    .filter((item) => itemMatchesTicker(item, ticker))
    .sort((a, b) => timeValue(b.publishedAt) - timeValue(a.publishedAt));
  const filings = (run.filings || [])
    .filter((item) => itemMatchesTicker(item, ticker))
    .sort((a, b) => timeValue(b.publishedAt) - timeValue(a.publishedAt));
  const social = (run.socialPosts || [])
    .filter((item) => itemMatchesTicker(item, ticker))
    .sort((a, b) => (b.comments || 0) + (b.upvotes || 0) - ((a.comments || 0) + (a.upvotes || 0)));
  const alerts = (run.alerts || []).filter((item) => item.ticker === ticker && item.status !== "dismissed");
  const isEtf = isEtfInstrument({ ...quote, ...fundamental }, ticker);
  const nextEarnings = isEtf ? null : stockNextEarnings(run, ticker, fundamental);
  const change =
    quote?.previousClose > 0 ? ((quote.price - quote.previousClose) / quote.previousClose) * 100 : null;
  let score = 50;
  const positives = [];
  const risks = [];
  if (technical?.trend === "uptrend") {
    score += 12;
    positives.push("技术趋势处在上升结构");
  }
  if (technical?.trend === "downtrend") {
    score -= 12;
    risks.push("技术趋势偏弱");
  }
  if (Number.isFinite(technical?.rsi14) && technical.rsi14 >= 75) risks.push("RSI 偏高，短线可能拥挤");
  if (Number.isFinite(technical?.rsi14) && technical.rsi14 <= 35) positives.push("RSI 偏低，存在反弹观察价值");
  if (!isEtf && Number.isFinite(fundamental?.revenueGrowthTTMYoy) && fundamental.revenueGrowthTTMYoy > 8) {
    score += 8;
    positives.push(`收入同比增长 ${fmtNumber(fundamental.revenueGrowthTTMYoy, 1)}%`);
  }
  if (!isEtf && Number.isFinite(fundamental?.netProfitMarginTTM) && fundamental.netProfitMarginTTM > 15) {
    score += 6;
    positives.push(`净利率 ${fmtNumber(fundamental.netProfitMarginTTM, 1)}%`);
  }
  if (!isEtf && Number.isFinite(fundamental?.debtEquityAnnual) && fundamental.debtEquityAnnual > 150) {
    score -= 8;
    risks.push("负债/权益偏高");
  }
  if (news.length >= 3) {
    score += 6;
    positives.push(`近期公司新闻 ${news.length} 条`);
  }
  if (filings.some((item) => item.form === "8-K")) {
    score += 4;
    positives.push("存在 8-K 等事件披露，需要跟进细节");
  }
  if (socialHot?.score >= 70) {
    score += 8;
    positives.push(`社交热度高，提及 ${socialHot.mentions} 次`);
  } else if (socialHot?.score >= 50) {
    score += 4;
    positives.push("社交讨论进入观察区");
  }
  if (options?.walls?.callWall || options?.walls?.putWall) {
    positives.push(
      `期权墙位：Call ${options.walls.callWall?.strike ?? "-"} / Put ${options.walls.putWall?.strike ?? "-"}`,
    );
  }
  if (scoreRow?.riskScore >= 70) {
    score -= 10;
    risks.push(`材料风险分 ${scoreRow.riskScore}`);
  }
  if (alerts.some((item) => item.severity === "high")) {
    score -= 10;
    risks.push("触发高优先级提醒");
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const nextSteps = [
    filings.length ? "先读最新 SEC 文件原文，确认是否涉及业绩、管理层或资本开支变化。" : null,
    news.length ? "打开排名靠前的新闻原文，区分事实、市场解读和旧闻复述。" : null,
    socialHot ? "把社交热议当作线索，核验高热帖子是否有真实催化剂。" : null,
    technical ? "结合 20 日/50 日均线和 RSI，避免只因热度做短线追涨。" : null,
    fundamental
      ? isEtf
        ? "ETF 重点核对跟踪标的、持仓集中度、费用、流动性和跟踪误差。"
        : "把估值倍数与收入增速、利润率一起看，不单看 P/E 高低。"
      : null,
  ].filter(Boolean);
  return {
    ticker,
    quote,
    technical,
    fundamental,
    scoreRow,
    backtest,
    socialHot,
    options,
    openbbBundle,
    microstructure,
    narrative,
    factorLayer,
    researchPack,
    allNewsPack,
    investmentAdvisor,
    industryChainPack,
    tradeMemory,
    nextEarnings,
    news,
    filings,
    social,
    alerts,
    isEtf,
    change,
    score,
    positives: positives.slice(0, 5),
    risks: risks.slice(0, 5),
    nextSteps: nextSteps.slice(0, 5),
  };
}

function stockReportAgentRecord(ticker) {
  const symbol = normalizeTickerSymbol(ticker);
  const latest = appState?.allStockAgent?.latest || {};
  const pools = [
    latest.evaluations,
    latest.buyCandidates,
    latest.watchBuyCandidates,
    latest.sellCandidates,
    latest.holdReviews,
    appState?.allStockAgent?.decisions,
  ];
  for (const pool of pools) {
    const row = (pool || []).find((item) => normalizeTickerSymbol(item?.ticker) === symbol && (item.factorSnapshot || item.recommendationScore));
    if (row) return row;
  }
  return null;
}

function stockReportFactorSnapshotBlock(ticker) {
  const record = stockReportAgentRecord(ticker);
  const snapshot = record?.factorSnapshot || null;
  const factors = snapshot?.factors || {};
  const rows = Object.values(factors)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 10);
  if (!rows.length) return empty("当前 Agent run 暂无该标的 factor snapshot。运行候选池 Agent 后会补齐。");
  return `<div class="factor-snapshot-shell">
    <div class="factor-mini-grid">
      ${indicator("Alpha", Number.isFinite(Number(record.alphaScore)) ? fmtNumber(Number(record.alphaScore), 0) : "-")}
      ${indicator("Action", Number.isFinite(Number(record.actionScore)) ? fmtNumber(Number(record.actionScore), 0) : "-")}
      ${indicator("数据质量", Number.isFinite(Number(record.dataQualityScore)) ? fmtNumber(Number(record.dataQualityScore), 0) : "-")}
      ${indicator("组合适配", Number.isFinite(Number(record.portfolioFitScore)) ? fmtNumber(Number(record.portfolioFitScore), 0) : "-")}
      ${indicator("主 Horizon", record.primaryHorizon ? `T+${record.primaryHorizon}` : "-")}
      ${indicator("策略版本", strategyVersionText(record.strategyVersion) || "-")}
      ${indicator("Regime", record.regime || record.regimeTag?.bucket || "-")}
    </div>
    ${renderRecommendationFactorStrip(record)}
    <div class="factor-grid">
      ${rows.map((factor) => `<article>
        <h4>${escapeHtml(factor.label || factor.id || "")}</h4>
        <div class="mini-kv">
          ${indicator("分数", fmtNumber(Number(factor.score), 0))}
          ${indicator("质量", fmtNumber(Number(factor.quality), 0))}
          ${indicator("来源", (factor.source || []).slice(0, 2).join(" + ") || "-")}
        </div>
        ${factor.missingReason ? `<p class="muted">${escapeHtml(factor.missingReason)}</p>` : ""}
      </article>`).join("")}
    </div>
    ${renderDecisionDataQuality(record)}
  </div>`;
}

function stockReportTickers(run) {
  return [
    ...new Set([
      ...(run?.watchlist || appState.watchlist || []),
      ...stockSnapshotCache.keys(),
      ...((run?.discovery?.candidates || []).map((item) => item.ticker)),
      ...((run?.socialHotStocks?.rising || run?.socialHotStocks?.candidates || []).slice(0, 12).map((item) => item.ticker)),
    ]),
  ].filter(Boolean);
}

function longListPage(scope, rows = [], pageSize = 8) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(0, Number(longListPages[scope] || 0)), pageCount - 1);
  longListPages[scope] = page;
  return {
    page,
    pageCount,
    items: rows.slice(page * pageSize, (page + 1) * pageSize),
  };
}

function renderListPagination(scope, total, page, pageCount) {
  if (pageCount <= 1) return "";
  return `<nav class="list-pagination" aria-label="长列表分页">
    <button class="btn compact ghost" type="button" data-list-page-scope="${escapeHtml(scope)}" data-list-page-index="${page - 1}" ${page <= 0 ? "disabled" : ""} aria-label="上一页">&#8592; 上一页</button>
    <span>第 ${escapeHtml(page + 1)} / ${escapeHtml(pageCount)} 页 · 共 ${escapeHtml(total)} 个</span>
    <button class="btn compact ghost" type="button" data-list-page-scope="${escapeHtml(scope)}" data-list-page-index="${page + 1}" ${page >= pageCount - 1 ? "disabled" : ""} aria-label="下一页">下一页 &#8594;</button>
  </nav>`;
}

function renderStockReportOverview(run, tickers) {
  document.body.classList.remove("stock-detail-mode");
  if (!run || !tickers.length) {
    els.stockReportBox.className = "stock-report-box empty-state";
    els.stockReportBox.textContent = "运行采集后生成个股日报。";
    return;
  }
  const watchSet = new Set(run.watchlist || appState.watchlist || []);
  const risingSet = new Set((run.socialHotStocks?.rising || []).map((item) => item.ticker));
  const pageData = longListPage("stocks", tickers, 8);
  const cards = pageData.items.map((ticker) => buildStockReport(run, ticker));
  els.stockReportBox.className = "stock-report-box stock-report-overview";
  els.stockReportBox.innerHTML = `<div class="stock-report-overview-head">
    <div>
      <h3>个股日报入口</h3>
      <p class="muted">主页只显示摘要卡片，完整新闻催化、社交热议、K线、期权和决策备忘录放到二级页。</p>
    </div>
    <span class="tag">共 ${escapeHtml(tickers.length)} 个标的</span>
  </div>
  <div class="stock-report-card-grid">
    ${cards
      .map((report) => `<article class="stock-report-card">
        <div class="row">
          <h3>${escapeHtml(tickerLabel(report.ticker, { ...report.quote, ...report.fundamental, ...report.socialHot, run }))}</h3>
          <span class="tag ${reportToneClass(report.score)}">评分 ${escapeHtml(report.score)}</span>
        </div>
        <div class="feed-meta">
          ${watchSet.has(report.ticker) ? `<span class="tag green">自选池</span>` : ""}
          ${risingSet.has(report.ticker) ? `<span class="tag amber">全市场热度上升</span>` : ""}
          <span class="tag">${escapeHtml(trendLabel(report.technical?.trend))}</span>
          <span class="tag">${escapeHtml(pctLabel(report.change))}</span>
        </div>
        <p>${escapeHtml(report.narrative?.oneLine || report.narrative?.investmentAngle || `${tickerLabel(report.ticker, { ...report.quote, ...report.fundamental, run })} 暂无完整日报摘要。`)}</p>
        <button class="btn compact" type="button" data-open-stock-report="${escapeHtml(report.ticker)}">查看日报</button>
      </article>`)
      .join("")}
  </div>
  ${renderListPagination("stocks", tickers.length, pageData.page, pageData.pageCount)}`;
}

function renderStockReport(run) {
  const enrichedRun = runWithStockSnapshots(run);
  const tickers = stockReportTickers(enrichedRun);
  const stored = normalizeTickerInput(localStorage.getItem(STOCK_REPORT_STORAGE_KEY));
  const hashTicker = normalizeTickerInput(stockDetailTickerFromHash());
  const detailMode = Boolean(hashTicker);
  const selected = detailMode
    ? hashTicker
    : tickers.includes(stored) ? stored : tickers[0] || "";
  if (els.stockReportOptions) {
    els.stockReportOptions.innerHTML = tickers
      .map((ticker) => `<option value="${escapeHtml(ticker)}"></option>`)
      .join("");
  }
  if (els.stockReportInput && document.activeElement !== els.stockReportInput) {
    els.stockReportInput.value = selected;
  }
  if (els.stockReportFetch) {
    els.stockReportFetch.disabled = Boolean(selected && stockSnapshotLoading.has(selected));
    els.stockReportFetch.textContent = selected && stockSnapshotLoading.has(selected) ? "拉取中..." : "拉取 Longbridge";
  }
  if (!enrichedRun || !selected) {
    document.body.classList.remove("stock-detail-mode");
    els.stockReportBox.className = "stock-report-box empty-state";
    els.stockReportBox.textContent = "输入 ticker 后可从 Longbridge 按需拉取行情、K线和新闻。";
    return;
  }
  if (!detailMode) {
    renderStockReportOverview(enrichedRun, tickers);
    return;
  }
  if (!runHasTickerData(enrichedRun, selected) && !stockSnapshotLoading.has(selected)) {
    setTimeout(() => requestStockSnapshot(selected), 0);
  }
  if (!stockDeepDiveCache.has(selected) && !stockDeepDiveLoading.has(selected)) {
    setTimeout(() => requestStockDeepDive(selected), 0);
  }
  document.body.classList.add("stock-detail-mode");
  const report = buildStockReport(enrichedRun, selected);
  queueOptionsAutofetch(enrichedRun, selected, Boolean(report.options));
  const tone = reportToneLabel(report);
  const loading = stockSnapshotLoading.has(selected);
  const snapshot = stockSnapshotCache.get(selected);
  const snapshotErrors = snapshot?.errors || [];
  const latestNews = report.news.slice(0, 4);
  const latestFilings = report.filings.slice(0, 4);
  const hotPosts = (report.socialHot?.topPosts || report.social).slice(0, 4);
  const snapshotStatus = loading
    ? `<div class="stock-fetch-status"><span class="spinner-dot"></span> 正在从 Longbridge 拉取 ${escapeHtml(selected)} 的行情、K线和新闻...</div>`
    : snapshotErrors.length
      ? `<div class="stock-fetch-status warn">Longbridge 按需拉取有异常：${escapeHtml(snapshotErrors.map((item) => item.error).join("；"))}</div>`
      : snapshot
        ? `<div class="stock-fetch-status ok">已从 Longbridge 更新：${escapeHtml(fmtTime(snapshot.generatedAt))}</div>`
        : "";
  els.stockReportBox.className = "stock-report-box stock-report-detail";
  els.stockReportBox.innerHTML = `<div class="stock-report-hero">
    <div>
      <p class="section-label">US.${escapeHtml(report.ticker)} 个股日报</p>
      <h3>${escapeHtml(tickerLabel(report.ticker, { ...report.quote, ...report.fundamental, ...report.socialHot, run: enrichedRun }))} · ${escapeHtml(tone)}</h3>
      <p class="muted">生成时间：${fmtTime(enrichedRun.completedAt)} · 只做信息归纳，不构成投资建议。</p>
    </div>
    <div class="stock-detail-actions">
      <span class="tag ${reportToneClass(report.score)}">评分 ${escapeHtml(report.score)}</span>
      <button class="btn compact" type="button" data-refresh-stock-report="${escapeHtml(report.ticker)}">刷新 Longbridge</button>
      <button class="btn compact" type="button" data-run-agent-debate="${escapeHtml(report.ticker)}">运行 LLM 辩论</button>
      <button class="btn compact" type="button" data-run-uzi-analysis="${escapeHtml(report.ticker)}">运行 UZI</button>
      <button class="btn compact ghost" type="button" data-back-stock-overview>返回总览</button>
    </div>
  </div>
  ${snapshotStatus}
  <div class="stock-report-metrics">
    ${metric(report.quote ? fmtNumber(report.quote.price) : fmtNumber(report.technical?.latestClose), "最新价")}
    ${metric(pctLabel(report.change), "日内变动")}
    ${metric(trendLabel(report.technical?.trend), "技术趋势")}
    ${metric(report.isEtf ? "不适用" : report.nextEarnings?.date || "未知", report.isEtf ? "ETF 财报" : "下次财报")}
    ${metric(report.socialHot ? report.socialHot.mentions : report.social.length, "社交提及")}
  </div>
  <div class="stock-report-grid">
    <section class="report-block wide prism-report-block">
      <h3>Prism 三棱镜（Seri / 道士 / Cat）</h3>
      ${prismBlock(report.narrative?.prism)}
    </section>
    <section class="report-block wide">
      <h3>AI 决策仪表盘</h3>
      ${aiDecisionDashboardBlock(report.narrative?.decisionDashboard)}
    </section>
    <section class="report-block wide">
      <h3>投资建议 Agent</h3>
      ${investmentAdvisorBlock(report.investmentAdvisor)}
    </section>
    <section class="report-block wide">
      <h3>投资流派评分卡</h3>
      ${styleScorecardBlock(report.narrative?.investmentStyleScorecard || report.narrative?.styleScorecard)}
    </section>
    <section class="report-block wide">
      <h3>UZI 游资深度分析</h3>
      ${uziAnalysisBlock(report.ticker)}
    </section>
    <section class="report-block wide">
      <h3>因子决策层</h3>
      ${factorLayerTickerBlock(report.factorLayer)}
    </section>
    <section class="report-block wide">
      <h3>推荐因子快照</h3>
      ${stockReportFactorSnapshotBlock(report.ticker)}
    </section>
    <section class="report-block wide">
      <h3>数据上下文包</h3>
      ${analysisContextPackBlock(report.narrative?.analysisContextPack)}
    </section>
    <section class="report-block wide">
      <h3>策略配置命中</h3>
      ${strategyConfigBlock(report.narrative?.strategies || report.narrative?.decisionDashboard?.strategyConfig)}
    </section>
    <section class="report-block">
      <h3>今日一句话</h3>
      <p>${escapeHtml(
        report.narrative?.oneLine ||
          report.narrative?.investmentAngle ||
          (report.positives.length
          ? `${tickerLabel(report.ticker, { ...report.quote, ...report.fundamental, run: enrichedRun })} 当前主要看点是：${report.positives.slice(0, 2).join("；")}。`
          : `${tickerLabel(report.ticker, { ...report.quote, ...report.fundamental, run: enrichedRun })} 当前信息密度有限，先保持观察并等待更明确催化剂。`),
      )}</p>
    </section>
    <section class="report-block">
      <h3>看多线索</h3>
      ${report.positives.length ? `<ul>${report.positives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无明显正向线索。")}
    </section>
    <section class="report-block">
      <h3>主要风险</h3>
      ${report.risks.length ? `<ul>${report.risks.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无高优先级风险，但仍需核验来源。")}
    </section>
    <section class="report-block">
      <h3>${report.isEtf ? "ETF 结构/估值" : "基本面/估值"}</h3>
      <div class="mini-kv">
        ${indicator("市值", report.fundamental?.marketCapitalization ? `${fmtNumber(report.fundamental.marketCapitalization / 1000, 1)}B` : "-")}
        ${indicator("市盈率", fmtNumber(report.fundamental?.peTTM, 1))}
        ${report.isEtf ? indicator("产品类型", "ETF") : indicator("收入同比", Number.isFinite(report.fundamental?.revenueGrowthTTMYoy) ? `${fmtNumber(report.fundamental.revenueGrowthTTMYoy, 1)}%` : "-")}
        ${indicator(report.isEtf ? "公司财报" : "下次财报", report.isEtf ? "不适用" : report.nextEarnings?.date || "-")}
        ${indicator("日程来源", report.isEtf ? "不适用" : report.nextEarnings?.sources?.join(" + ") || "-")}
        ${indicator("校验", report.isEtf ? "不适用" : report.nextEarnings?.verified ? "已校验" : report.nextEarnings ? "待复核" : "-")}
      </div>
      ${longBridgeFundamentalBlock(report.fundamental, report.ticker)}
      ${valuationHistoryBlock(report.fundamental)}
    </section>
    <section class="report-block wide">
      <h3>机构研报代理</h3>
      ${researchPackBlock(report.researchPack)}
    </section>
    <section class="report-block">
      <h3>盘口/盘中</h3>
      ${microstructureBlock(report.microstructure)}
    </section>
    <section class="report-block wide">
      <h3>同业/上下游雷达</h3>
      ${industryChainPackBlock(report.industryChainPack || report.narrative?.industryChainPack)}
    </section>
    <section class="report-block wide">
      <h3>同业对照</h3>
      ${peerBenchmarkBlock(report.narrative?.peerBenchmark)}
    </section>
    <section class="report-block">
      <h3>关键价位</h3>
      ${technicalLevelBlock(report.narrative?.technicalBrief, report.technical)}
    </section>
    <section class="report-block wide">
      <h3>期权/GEX</h3>
      ${optionsGexBlock(report.options, report.ticker, enrichedRun)}
    </section>
    <section class="report-block wide">
      <h3>OpenBB 数据</h3>
      ${openbbBundleBlock(report.openbbBundle)}
    </section>
    <section class="report-block">
      <h3>证据质量</h3>
      ${
        report.narrative?.evidenceQuality
          ? `<p><strong>${escapeHtml(report.narrative.evidenceQuality.label)}</strong> · ${escapeHtml(report.narrative.evidenceQuality.score)}</p><ul>${(report.narrative.evidenceQuality.notes || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : empty("暂无证据质量评分。")
      }
    </section>
    <section class="report-block wide">
      <h3>新闻催化</h3>
      ${allNewsPackBlock(report.allNewsPack, latestNews)}
      ${catalystDeepDiveBlock(report.narrative?.catalystDeepDive)}
      ${catalystPackBlock(report.narrative?.catalystPack, latestNews)}
    </section>
    <section class="report-block wide">
      <h3>SEC/事件</h3>
      ${report.narrative?.secSummary ? `<p>${escapeHtml(report.narrative.secSummary)}</p>` : ""}
      ${latestFilings.length ? secReportLinks(latestFilings) : empty("暂无近期重点 SEC 文件。")}
    </section>
    <section class="report-block wide">
      <h3>社交热议</h3>
      ${
        report.socialHot
          ? `${socialInsightBlock(
              { ...report.socialHot, socialContext: report.socialHot.socialContext || report.narrative?.socialContext },
              report.narrative?.socialReason,
            )}${hotPosts.length ? reportLinks(hotPosts) : ""}`
          : report.social.length
            ? reportLinks(hotPosts)
            : empty("暂无社交热议信号。")
      }
    </section>
    <section class="report-block wide">
      <h3>决策备忘录</h3>
      ${decisionMemoBlock(report.narrative?.decisionMemo)}
    </section>
    <section class="report-block wide">
      <h3>交易记忆</h3>
      ${tradeMemoryBlock(report.tradeMemory)}
    </section>
    <section class="report-block wide">
      <h3>多 Agent 观点</h3>
      ${agentDebateBlock(report.narrative?.agentDebateLLM || report.narrative?.decisionDashboard?.agentDebateLLM || report.narrative?.agentDebate || [])}
    </section>
    <section class="report-block wide">
      <h3>事件时间线</h3>
      ${timelineBlock(report.narrative?.eventTimeline || [])}
    </section>
    <section class="report-block wide">
      <h3>下一步验证</h3>
      ${(report.narrative?.validationSteps || report.nextSteps).length ? `<ul>${(report.narrative?.validationSteps || report.nextSteps).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("先补充数据源或等待新材料。")}
    </section>
  </div>`;
}

function contextStatusLabel(status) {
  if (status === "ok") return "可用";
  if (status === "partial") return "部分";
  if (status === "fallback") return "兜底";
  if (status === "not_supported") return "不支持";
  if (status === "missing") return "缺失";
  return status || "未知";
}

function contextStatusClass(status) {
  if (status === "ok") return "green";
  if (status === "partial" || status === "fallback") return "amber";
  if (status === "missing") return "red";
  return "";
}

function advisorActionClass(action = "") {
  if (action === "买入") return "green";
  if (action === "卖出") return "red";
  return "amber";
}

function uziAnalysisBlock(ticker = "") {
  const symbol = normalizeTickerInput(ticker);
  const loading = symbol && uziAnalysisLoading.has(symbol);
  const analysis = symbol ? uziAnalysisCache.get(symbol) : null;
  if (loading) {
    return `<div class="uzi-analysis-card loading">
      <div class="stock-fetch-status"><span class="spinner-dot"></span> UZI-Skill 正在分析 ${escapeHtml(symbol)}，默认 lite 档可能需要 1-2 分钟...</div>
      <p class="muted">UZI 是外部专项报告，不会写入本系统因子分、买卖闸门或策略权重。</p>
    </div>`;
  }
  if (!analysis) {
    return `<div class="uzi-analysis-card">
      <p>调用 UZI-Skill 生成外部专项报告：22 维数据、66 位投资者评审、DCF/Comps/LBO/IC Memo 和杀猪盘检查。</p>
      <div class="decision-actions">
        <button class="btn compact" type="button" data-run-uzi-analysis="${escapeHtml(symbol)}">运行 UZI lite</button>
      </div>
      <p class="muted">默认 lite 档用于前端交互；medium/deep 更适合后台队列运行。</p>
    </div>`;
  }
  if (analysis.status === "error") {
    return `<div class="uzi-analysis-card error">
      <p class="quality-error">${escapeHtml(analysis.summary || analysis.error || "UZI 分析失败。")}</p>
      <div class="decision-actions">
        <button class="btn compact" type="button" data-run-uzi-analysis="${escapeHtml(symbol)}">重试 UZI</button>
      </div>
      <p class="muted">${escapeHtml(analysis.sourceRisk || "")}</p>
    </div>`;
  }
  const caps = analysis.capabilities || [];
  const stdout = analysis.stdoutTail || [];
  return `<div class="uzi-analysis-card">
    <div class="context-pack-head">
      <span class="tag green">${escapeHtml(analysis.provider || "UZI-Skill")}</span>
      <span class="tag">深度 ${escapeHtml(analysis.depth || "-")}</span>
      ${Number.isFinite(Number(analysis.sizeKb)) ? `<span class="tag">${escapeHtml(analysis.sizeKb)} KB</span>` : ""}
      ${Number.isFinite(Number(analysis.durationMs)) ? `<span class="tag">${escapeHtml(fmtNumber(Number(analysis.durationMs) / 1000, 1))}s</span>` : ""}
      <span class="muted">${escapeHtml(fmtTime(analysis.generatedAt))}</span>
    </div>
    <p class="social-lede">${escapeHtml(analysis.summary || "UZI 报告已生成。")}</p>
    ${caps.length ? `<div class="feed-meta">${caps.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    <div class="decision-actions">
      ${analysis.reportUrl ? `<a class="btn compact" href="${escapeHtml(analysis.reportUrl)}" target="_blank" rel="noopener">打开 UZI HTML 报告</a>` : ""}
      ${analysis.metaUrl ? `<a class="btn compact ghost" href="${escapeHtml(analysis.metaUrl)}" target="_blank" rel="noopener">查看元数据</a>` : ""}
      <button class="btn compact ghost" type="button" data-run-uzi-analysis="${escapeHtml(symbol)}">重新运行</button>
    </div>
    ${stdout.length ? `<details><summary>运行日志</summary><pre class="compact-pre">${escapeHtml(stdout.join("\n"))}</pre></details>` : ""}
    <p class="muted">${escapeHtml(analysis.sourceRisk || "UZI 输出仅作为外部研究材料。")}</p>
  </div>`;
}

function investmentAdvisorBlock(advisor) {
  if (!advisor) return empty("暂无买入/卖出/持有建议。请刷新 Longbridge 快照。");
  const breakdown = advisor.scoreBreakdown || [];
  const rationale = advisor.rationale || [];
  const entry = advisor.tradePlan?.entryTriggers || [];
  const exit = advisor.tradePlan?.exitTriggers || [];
  const risks = advisor.risks || [];
  const gates = advisor.riskGates || [];
  const coverageRows = advisor.inputCoverage?.rows || [];
  const expectationGap = advisor.expectationGap || null;
  const researchSummary = advisor.researchPack?.summary || advisor.context?.researchPack?.summary || {};
  const insider = researchSummary.insiderTrades || advisor.insiderTrades || {};
  const providerText = advisor.provider || "local";
  const providerClass = /local|rule|fallback|本地/i.test(providerText) ? "amber" : "green";
  const evidenceTags = [
    expectationGap?.status === "ok"
      ? `预期差：${expectationGap.verdict || "已计算"}`
      : "预期差：缺失",
    insider?.bullet ||
      (Number.isFinite(Number(insider.buyCount)) || Number.isFinite(Number(insider.sellCount))
        ? `内部人：买 ${insider.buyCount || 0} / 卖 ${insider.sellCount || 0}`
        : "内部人：缺失"),
    rationale[0] || advisor.stance || "核心 thesis 待补",
  ].filter(Boolean);
  return `<div class="ai-dashboard investment-advisor">
    <div class="ai-dashboard-head">
      <div>
        <span class="tag ${advisorActionClass(advisor.action)}">${escapeHtml(advisor.action || "持有")}</span>
        ${advisor.gateAdjusted ? `<span class="tag red">已被风控闸门调整</span>` : ""}
        <span class="tag ${reportToneClass(advisor.score || 0)}">综合 ${escapeHtml(advisor.score ?? "-")}</span>
        <span class="tag">置信 ${escapeHtml(advisor.confidence || advisor.confidenceScore || "-")}</span>
        <span class="tag">覆盖 ${escapeHtml(advisor.dataCoverage ?? advisor.inputCoverage?.score ?? "-")}</span>
        <span class="tag ${providerClass}">${escapeHtml(providerText)}</span>
      </div>
      <p>${escapeHtml(advisor.stance || "暂无明确结论。")}</p>
      <div class="feed-meta compact-tags">${evidenceTags
        .slice(0, 4)
        .map((item) => `<span class="tag">${escapeHtml(item)}</span>`)
        .join("")}</div>
    </div>
    <div class="ai-dashboard-grid">
      <article>
        <h4>核心依据</h4>
        ${rationale.length ? `<ul>${rationale.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无可解释依据。")}
      </article>
      <article>
        <h4>预期差/反向 DCF</h4>
        ${
          expectationGap?.status === "ok"
            ? `<div class="mini-kv">
                ${indicator("隐含增长", Number.isFinite(expectationGap.impliedGrowthPct) ? `${fmtNumber(expectationGap.impliedGrowthPct, 1)}%` : "-")}
                ${indicator("参考增长", Number.isFinite(expectationGap.referenceGrowthPct) ? `${fmtNumber(expectationGap.referenceGrowthPct, 1)}%` : "-")}
                ${indicator("差值", Number.isFinite(expectationGap.gapPct) ? `${fmtNumber(expectationGap.gapPct, 1)}pct` : "-")}
              </div>
              <p>${escapeHtml(expectationGap.verdict || "")}</p>`
            : empty(expectationGap?.verdict || "缺少价格、EPS/FCF 或增长参考，暂不能反推市场隐含预期。")
        }
      </article>
      <article>
        <h4>分项打分</h4>
        ${
          breakdown.length
            ? `<div class="mini-kv">${breakdown.map((item) => indicator(item.label || item.key, item.score ?? "-")).join("")}</div>`
            : empty("暂无分项打分。")
        }
      </article>
      <article>
        <h4>风控闸门</h4>
        ${gates.length ? `<ul>${gates.slice(0, 5).map((item) => `<li>${escapeHtml(`${item.label || item.key}：${item.reason || ""}`)}</li>`).join("")}</ul>` : empty("暂无触发闸门。")}
      </article>
      <article>
        <h4>数据覆盖</h4>
        ${
          coverageRows.length
            ? `<div class="feed-meta">${coverageRows
                .slice(0, 11)
                .map((item) => `<span class="tag ${item.status === "ok" ? "green" : "amber"}">${escapeHtml(item.label)} ${item.status === "ok" ? "可用" : "缺失"}</span>`)
                .join("")}</div>`
            : empty("暂无覆盖明细。")
        }
      </article>
      <article>
        <h4>进场条件</h4>
        ${entry.length ? `<ul>${entry.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无进场条件。")}
      </article>
      <article>
        <h4>失效/退出</h4>
        ${exit.length ? `<ul>${exit.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无退出条件。")}
      </article>
    </div>
    ${advisor.tradePlan?.positionSizing ? `<p class="decision-stance">${escapeHtml(advisor.tradePlan.positionSizing)}</p>` : ""}
    ${risks.length ? `<div class="decision-actions"><h4>风险</h4><ul>${risks.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    <p class="muted">${escapeHtml(advisor.complianceNote || "系统化投研建议不等于个性化财务顾问意见。")}</p>
  </div>`;
}

function researchPackBlock(pack) {
  if (!pack) return empty("暂无机构研报代理数据。");
  const summary = pack.summary || {};
  const sections = pack.sections || [];
  const bullets = summary.bullets || [];
  const shortRate = Number(summary.shortPositions?.latest?.rate);
  const daysToCover = Number(summary.shortPositions?.latest?.daysToCover);
  const insider = summary.insiderTrades || {};
  const shareholder = summary.shareholder || {};
  return `<div class="research-pack">
    <div class="context-pack-head">
      <span class="tag ${contextStatusClass(pack.status)}">${escapeHtml(contextStatusLabel(pack.status))}</span>
      <span class="tag">${escapeHtml(pack.provider || "Longbridge Research Pack")}</span>
      <span class="muted">${escapeHtml(fmtTime(pack.generatedAt))}</span>
    </div>
    <div class="mini-kv">
      ${indicator("机构评级", summary.recommendation || "-")}
      ${indicator("目标价", Number.isFinite(summary.targetPrice) ? fmtNumber(summary.targetPrice, 2) : "-")}
      ${indicator("隐含空间", Number.isFinite(summary.targetUpsidePercent) ? `${fmtNumber(summary.targetUpsidePercent, 1)}%` : "-")}
      ${indicator("一致 EPS", Number.isFinite(summary.consensus?.epsEstimate) ? fmtNumber(summary.consensus.epsEstimate, 2) : "-")}
      ${indicator("空头比例", Number.isFinite(shortRate) ? `${fmtNumber(shortRate, 1)}%` : "-")}
      ${indicator("DTC", Number.isFinite(daysToCover) ? fmtNumber(daysToCover, 1) : "-")}
      ${indicator("内部人买/卖", `${Number(insider.buyCount || 0)}/${Number(insider.sellCount || 0)}`)}
      ${indicator("机构增/减", `${Number(shareholder.increasing || 0)}/${Number(shareholder.decreasing || 0)}`)}
    </div>
    ${bullets.length ? `<ul>${bullets.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("Longbridge 暂未返回机构摘要。")}
    <div class="context-block-grid">
      ${sections
        .slice(0, 9)
        .map(
          (section) => `<article class="context-block ${contextStatusClass(section.status)}">
            <div class="row">
              <h4>${escapeHtml(section.label || section.key)}</h4>
              <span class="tag ${contextStatusClass(section.status)}">${escapeHtml(contextStatusLabel(section.status))}</span>
            </div>
            <p class="muted">${escapeHtml(section.provider || "Longbridge")} · ${escapeHtml(section.itemCount ?? 0)} 条</p>
            ${section.error ? `<p class="quality-error">${escapeHtml(section.error)}</p>` : `<p>${escapeHtml(section.preview || "已获取结构化数据。")}</p>`}
          </article>`,
        )
        .join("")}
    </div>
    ${
      pack.sourceNotes?.length
        ? `<p class="muted">${escapeHtml(pack.sourceNotes.join(" "))}</p>`
        : ""
    }
  </div>`;
}

function allNewsPackBlock(pack, fallbackItems = []) {
  const items = pack?.items?.length ? pack.items : fallbackItems;
  if (!pack && !items.length) return empty("暂无全源新闻包。");
  const summary = pack?.summary || {};
  const coverage = pack?.sourceCoverage || [];
  const groups = summary.categoryGroups || [];
  return `<div class="all-news-pack">
    ${pack ? `<div class="context-pack-head">
      <span class="tag ${contextStatusClass(pack.status)}">${escapeHtml(contextStatusLabel(pack.status))}</span>
      <span class="tag">${escapeHtml(pack.provider || "All News Pack")}</span>
      <span class="muted">${escapeHtml(fmtTime(pack.generatedAt))}</span>
    </div>` : ""}
    ${summary.headline ? `<p class="social-lede">${escapeHtml(summary.headline)}</p>` : ""}
    ${summary.bullets?.length ? `<ul>${summary.bullets.slice(0, 10).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${
      groups.length
        ? `<div class="decision-grid">${groups
            .map((group) => `<section>
              <h4>${escapeHtml(group.label || group.category)}</h4>
              ${group.items?.length ? reportLinks(group.items.slice(0, 4)) : empty("暂无。")}
            </section>`)
            .join("")}</div>`
        : ""
    }
    ${
      coverage.length
        ? `<div class="feed-meta">${coverage.slice(0, 8).map((item) => `<span class="tag">${escapeHtml(item.source)} ${escapeHtml(item.count)} 条 / 正文 ${escapeHtml(item.readable)}</span>`).join("")}</div>`
        : ""
    }
    ${items.length ? reportLinks(items.slice(0, 8)) : ""}
    ${summary.risks?.length ? `<p class="muted">${escapeHtml(summary.risks.join("；"))}</p>` : ""}
  </div>`;
}

function aiDecisionDashboardBlock(dashboard) {
  if (!dashboard) return empty("暂无 AI 决策仪表盘。");
  const riskAlerts = dashboard.intelligence?.riskAlerts || [];
  const checklist = dashboard.battlePlan?.actionChecklist || [];
  const points = dashboard.battlePlan?.sniperPoints || [];
  return `<div class="ai-dashboard">
    <div class="ai-dashboard-head">
      <div>
        <span class="tag ${reportToneClass(dashboard.score || 0)}">综合 ${escapeHtml(dashboard.score ?? "-")}</span>
        <span class="tag">${escapeHtml(dashboard.confidenceLevel || "置信度未知")}</span>
        <span class="tag">${escapeHtml(dashboard.decisionType || "观察")}</span>
      </div>
      <p>${escapeHtml(dashboard.coreConclusion?.oneSentence || "")}</p>
    </div>
    <div class="ai-dashboard-grid">
      <article>
        <h4>数据视角</h4>
        <p>${escapeHtml(dashboard.dataPerspective?.fundamentalSnapshot || "基本面暂缺。")}</p>
        <div class="feed-meta">
          <span class="tag">${escapeHtml(dashboard.dataPerspective?.trendStatus || "-")}</span>
          <span class="tag">${escapeHtml(dashboard.dataPerspective?.priceReaction || "-")}</span>
          <span class="tag">${escapeHtml(dashboard.dataPerspective?.dataQuality || "-")}</span>
        </div>
      </article>
      <article>
        <h4>情报</h4>
        <p>${escapeHtml(dashboard.intelligence?.latestNews || "暂无新闻主线。")}</p>
        <p class="muted">${escapeHtml(dashboard.intelligence?.socialHeat || "")}</p>
      </article>
      <article>
        <h4>关键位置</h4>
        ${points.length ? `<div class="feed-meta">${points.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>` : empty("暂无关键价位。")}
      </article>
      <article>
        <h4>风险提醒</h4>
        ${riskAlerts.length ? `<ul>${riskAlerts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无高优先级风险。")}
      </article>
    </div>
    ${checklist.length ? `<div class="decision-actions"><h4>执行前核验</h4><ul>${checklist.slice(0, 6).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}

function analysisContextPackBlock(pack) {
  if (!pack?.blocks?.length) return empty("暂无上下文包。");
  return `<div class="context-pack">
    <div class="context-pack-head">
      <span class="tag ${reportToneClass(pack.overallScore || 0)}">质量 ${escapeHtml(pack.overallScore ?? "-")}</span>
      <span class="tag">${escapeHtml(pack.status || "unknown")}</span>
      <span class="muted">${escapeHtml(fmtTime(pack.generatedAt))}</span>
    </div>
    <div class="context-block-grid">
      ${pack.blocks
        .map(
          (block) => `<article class="context-block ${contextStatusClass(block.status)}">
            <div class="row">
              <h4>${escapeHtml(block.title)}</h4>
              <span class="tag ${contextStatusClass(block.status)}">${escapeHtml(contextStatusLabel(block.status))} · ${escapeHtml(block.qualityScore ?? "-")}</span>
            </div>
            <p class="muted">${escapeHtml(block.source || "-")}</p>
            ${
              block.dataLimit
                ? `<div class="feed-meta">
                    <span class="tag">事实 ${escapeHtml(block.dataLimit.visibleFacts ?? 0)}/${escapeHtml(block.dataLimit.availableFacts ?? 0)}</span>
                    ${block.dataLimit.truncated ? `<span class="tag amber">已截断</span>` : ""}
                    ${block.qualityComponents?.hasReadableEvidence ? `<span class="tag green">已读正文</span>` : ""}
                    ${block.qualityComponents?.hasStructuredData ? `<span class="tag green">结构化</span>` : ""}
                  </div>`
                : ""
            }
            ${
              block.facts?.length
                ? `<ul>${block.facts.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
                : `<p>${escapeHtml(block.missingReason || "暂无可展示事实。")}</p>`
            }
            ${block.missingReason && block.status !== "ok" ? `<p class="quality-error">${escapeHtml(block.missingReason)}</p>` : ""}
          </article>`,
        )
        .join("")}
    </div>
  </div>`;
}

function strategyConfigBlock(strategies = []) {
  const rows = (strategies || []).filter(Boolean);
  if (!rows.length) return empty("暂无策略命中。");
  return `<div class="strategy-grid">
    ${rows
      .map(
        (strategy) => `<article>
          <div class="row">
            <h4>${escapeHtml(strategy.name || strategy.id || "策略")}</h4>
            <span class="tag ${reportToneClass(strategy.relevanceScore || 0)}">${escapeHtml(strategy.relevanceScore ?? "-")}</span>
          </div>
          <p class="muted">覆盖度 ${escapeHtml(strategy.coverageScore ?? "-")} · 缺失 ${escapeHtml((strategy.missingBlocks || []).join("、") || "无")}</p>
          ${
            strategy.outputFocus?.length
              ? `<div class="feed-meta">${strategy.outputFocus.slice(0, 4).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>`
              : ""
          }
        </article>`,
      )
      .join("")}
  </div>`;
}

function prismList(items = []) {
  return items?.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : `<p class="muted">暂无。</p>`;
}

function prismField(label, body, options = {}) {
  const value = Array.isArray(body) ? body.filter(Boolean) : body;
  const hasValue = Array.isArray(value) ? value.length : value !== undefined && value !== null && String(value).trim() !== "";
  if (!hasValue && options.hideEmpty) return "";
  const content = Array.isArray(value)
    ? prismList(value)
    : `<p>${escapeHtml(value || options.empty || "暂无。")}</p>`;
  return `<section class="prism-field">
    <strong>${escapeHtml(label)}</strong>
    ${content}
  </section>`;
}

function prismPersonaCard(className, title, badge, fields = []) {
  return `<article class="prism-persona-card ${escapeHtml(className)}">
    <div class="row">
      <h4>${escapeHtml(title)}</h4>
      <span class="tag ${className === "seri" ? "green" : className === "cat" ? "amber" : ""}">${escapeHtml(badge)}</span>
    </div>
    ${fields.filter(Boolean).join("")}
  </article>`;
}

function prismBlock(prism) {
  if (!prism) return empty("暂无 Prism 三视角分析。");
  const seri = prism.seri || {};
  const dao = prism.dao || {};
  const cat = prism.cat || {};
  const consensus = prism.consensus || {};
  const daoDimensions = (dao.dimensions || []).map((item) => `${item.label}：${item.value}`);
  return `<div class="prism-shell">
    <div class="prism-head">
      <div>
        <p class="section-label">prism-skill ${escapeHtml(prism.schemaVersion || "adapter")}</p>
        <h4>三视角合议：供应链卡位 × 宏观过滤 × 技术执行</h4>
      </div>
      <span class="tag">教育研究框架</span>
    </div>
    <div class="prism-grid">
      ${prismPersonaCard("seri", seri.title || "Seri · 供应链卡脖子", `${seri.chokePointScore ?? "-"}/10`, [
        prismField("供应链位置", seri.supplyChainPosition?.layer || "产业链位置待补全。"),
        prismField("供应链分层", seri.supplyChainPosition?.layers || []),
        prismField("卡脖子评分依据", seri.chokePointReason || []),
        prismField("供需缺口量化", seri.supplyDemandGap || "暂无订单、产能和交付周期数据，不能硬算供需缺口。"),
        prismField("大资金动向", seri.bigMoney || "暂无机构持仓、期权 OI 或热度证据。"),
        prismField("Seri 的判断", seri.judgment || "卡位逻辑待补证据。"),
      ])}
      ${prismPersonaCard("dao", dao.title || "道士 · 宏观判断", "宏观", [
        prismField("当前宏观周期定性", dao.macroCycle || "缺少大盘综述，宏观定性待补。"),
        prismField("四维度逐项", daoDimensions),
        prismField("预期差分析", dao.expectationGap || "缺少新闻催化和市场预期对照。"),
        prismField("加密/流动性第二层验证", dao.cryptoLiquidity || "当前系统未接入 BTC、稳定币和 ETF 净流入。"),
        prismField("道士的判断", dao.judgment || "宏观过滤器待补。"),
      ])}
      ${prismPersonaCard("cat", cat.title || "Cat · 技术执行", cat.marketDayType || "待确认", [
        prismField("先说结论", cat.conclusion || "等，技术条件不足。"),
        prismField("今日市场日分类", cat.marketDayType || "待确认。"),
        prismField("真假突破判断", cat.breakoutValidity || []),
        prismField("执行框架推演", cat.executionFramework || []),
        prismField("基本面/执行红旗", (cat.redFlags || []).slice(0, 12)),
        prismField("Cat 的判断", cat.judgment || "等。"),
      ])}
      <article class="prism-consensus">
        <div class="row">
          <h4>三人合议</h4>
          <span class="tag green">${escapeHtml(consensus.stance || "待确认")}</span>
        </div>
        ${prismField("最终立场", consensus.stance || "中性观察。")}
        ${prismField("证据与执行条件", consensus.evidence || consensus.mustVerify || [])}
        ${(consensus.missingEvidence || []).length ? prismField("仍缺数据", consensus.missingEvidence || []) : ""}
        <p class="muted">${escapeHtml(prism.disclaimer || "以上为框架推演，不构成投资建议。")}</p>
      </article>
    </div>
  </div>`;
}

function valuationSeriesRows(history = {}) {
  return (history.rows || [])
    .map((row) => ({
      date: row.date,
      peTTM: Number(row.peTTM),
      pb: Number(row.pb),
      marketCapMillions: Number(row.marketCapMillions),
    }))
    .filter((row) => row.date && (Number.isFinite(row.peTTM) || Number.isFinite(row.pb) || Number.isFinite(row.marketCapMillions)))
    .slice(-180);
}

function valuationSparkline(rows = [], key, label, color) {
  const points = rows
    .map((row, index) => ({ index, value: Number(row[key]), date: row.date }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return `<div class="option-chart-empty">暂无 ${escapeHtml(label)} 历史</div>`;
  const width = 360;
  const height = 150;
  const pad = 18;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const scaleX = (index) => pad + (index / Math.max(rows.length - 1, 1)) * (width - pad * 2);
  const scaleY = (value) => height - pad - ((value - min) / Math.max(max - min, 0.0001)) * (height - pad * 2);
  const d = points.map((point, i) => `${i ? "L" : "M"}${scaleX(point.index).toFixed(1)},${scaleY(point.value).toFixed(1)}`).join(" ");
  const latest = points.at(-1);
  const first = points[0];
  const change = first?.value ? ((latest.value - first.value) / Math.abs(first.value)) * 100 : null;
  return `<article class="option-chart-card valuation-chart">
    <div class="row">
      <h4>${escapeHtml(label)}</h4>
      <span class="tag">${escapeHtml(fmtNumber(latest.value, key === "marketCapMillions" ? 0 : 2))}${key === "marketCapMillions" ? "M" : ""}</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)} 历史趋势">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="rgba(255,255,255,.7)"></rect>
      <path d="M${pad},${height - pad} H${width - pad}" stroke="rgba(100,116,139,.25)" />
      <path d="${d}" fill="none" stroke="${escapeHtml(color)}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${scaleX(latest.index).toFixed(1)}" cy="${scaleY(latest.value).toFixed(1)}" r="3.5" fill="${escapeHtml(color)}" />
      <text x="${pad}" y="16" font-size="11" fill="#667085">${escapeHtml(fmtNumber(max, key === "marketCapMillions" ? 0 : 2))}</text>
      <text x="${pad}" y="${height - 5}" font-size="11" fill="#667085">${escapeHtml(fmtNumber(min, key === "marketCapMillions" ? 0 : 2))}</text>
    </svg>
    <p class="muted">${escapeHtml(points[0].date)} 到 ${escapeHtml(latest.date)}${Number.isFinite(change) ? `，区间变化 ${change >= 0 ? "+" : ""}${fmtNumber(change, 1)}%` : ""}</p>
  </article>`;
}

function valuationHistoryBlock(fundamental = {}) {
  const history = fundamental?.valuationHistory || {};
  const rows = valuationSeriesRows(history);
  if (!rows.length) return "";
  return `<div class="valuation-history">
    <div class="row">
      <strong>AkShare 估值历史</strong>
      <span class="tag">${escapeHtml(history.provider || "AkShare")}</span>
    </div>
    <div class="option-chart-grid">
      ${valuationSparkline(rows, "peTTM", "PE(TTM)", "#2563eb")}
      ${valuationSparkline(rows, "pb", "PB", "#d97706")}
      ${valuationSparkline(rows, "marketCapMillions", "市值", "#059669")}
    </div>
    <p class="muted">${escapeHtml(history.sourceRisk || "公开估值历史仅供趋势观察。")}</p>
  </div>`;
}

function longBridgeFundamentalBlock(fundamental = {}, ticker = "") {
  if (!fundamental) return "";
  const isEtf = isEtfInstrument(fundamental, ticker);
  const rating = fundamental.analystRating || {};
  const financial = fundamental.financialSnapshot || {};
  const latest = fundamental.financialLatest || {};
  const segments = fundamental.businessSegments || [];
  const latestIndicators = (latest.indicators || []).slice(0, 4);
  const extras = [
    fundamental.mainBusiness ? `<p class="muted">${escapeHtml(fundamental.mainBusiness)}</p>` : "",
    fundamental.valuationSummary ? `<p class="muted">${escapeHtml(fundamental.valuationSummary)}</p>` : "",
    `<div class="mini-kv compact">
      ${indicator("评级", rating.recommendation || "-")}
      ${indicator("目标价", fmtNumber(rating.targetPrice, 2))}
      ${indicator("EPS预测", fmtNumber(fundamental.forecastEps?.mean, 2))}
      ${isEtf ? indicator("产品类型", "ETF") : indicator("净利率", fundamentalMarginDisplay(fundamental))}
    </div>`,
    financial.report
      ? `<p class="muted">最新财报：${escapeHtml(financial.report)}${Number.isFinite(financial.revenueYoy) ? `；收入同比 ${escapeHtml(fmtNumber(financial.revenueYoy, 1))}%` : ""}${Number.isFinite(financial.epsYoy) ? `；EPS同比 ${escapeHtml(fmtNumber(financial.epsYoy, 1))}%` : ""}</p>`
      : "",
    latest.report || latestIndicators.length
      ? `<p class="muted">Longbridge 最新摘要${latest.report ? `：${escapeHtml(latest.report)}` : ""}${Number.isFinite(latest.revenueYoy) ? `；收入同比 ${escapeHtml(fmtNumber(latest.revenueYoy, 1))}%` : ""}${Number.isFinite(latest.netProfitYoy) ? `；净利润同比 ${escapeHtml(fmtNumber(latest.netProfitYoy, 1))}%` : ""}</p>`
      : "",
    latestIndicators.length
      ? `<div class="feed-meta">${latestIndicators.map((item) => `<span class="tag">${escapeHtml(item.name)} ${escapeHtml(item.displayValue || fmtNumber(item.value, 2))}${Number.isFinite(item.yoy) ? ` / YoY ${escapeHtml(fmtNumber(item.yoy, 1))}%` : ""}</span>`).join("")}</div>`
      : "",
    segments.length
      ? `<div class="feed-meta">${segments.slice(0, 5).map((item) => `<span class="tag">${escapeHtml(item.name)} ${escapeHtml(fmtNumber(item.percent, 1))}%</span>`).join("")}</div>`
      : "",
  ].filter(Boolean).join("");
  return extras ? `<div class="longbridge-fundamental">${extras}</div>` : "";
}

function microstructureBlock(micro = null) {
  if (!micro) return empty("暂无 Longbridge 盘口/盘中数据。");
  const summary = micro.summary || {};
  const depth = micro.depth || {};
  const hasDepth = (depth.asks || []).length || (depth.bids || []).length;
  return `<div class="mini-kv compact">
      ${indicator("分时点数", summary.points ?? "-")}
      ${indicator("盘中变化", Number.isFinite(summary.intradayChangePercent) ? `${fmtNumber(summary.intradayChangePercent, 2)}%` : "-")}
      ${indicator("最新/均价", `${fmtNumber(summary.latestPrice, 2)} / ${fmtNumber(summary.avgPrice, 2)}`)}
      ${indicator("价差", Number.isFinite(summary.spread) ? fmtNumber(summary.spread, 3) : "-")}
    </div>
    ${
      hasDepth
        ? `<div class="feed-meta">
            ${summary.bestBid ? `<span class="tag">Bid ${escapeHtml(fmtNumber(summary.bestBid, 2))}</span>` : ""}
            ${summary.bestAsk ? `<span class="tag">Ask ${escapeHtml(fmtNumber(summary.bestAsk, 2))}</span>` : ""}
            ${summary.lastTradeDirection ? `<span class="tag">逐笔 ${escapeHtml(summary.lastTradeDirection)}</span>` : ""}
          </div>`
        : `<p class="muted">盘口档位当前为空，可能是 Level 2 权限、交易时段或数据源限制；已保留分时和逐笔成交摘要。</p>`
    }`;
}

function technicalLevelBlock(brief, technical) {
  const levels = brief?.levels || technical?.keyLevels || {};
  if (!brief?.summary && !Object.keys(levels).length) return empty("暂无关键价位。");
  return `<p>${escapeHtml(brief?.summary || "技术面数据有限。")}</p>
    <div class="mini-kv">
      ${indicator("52周高点", fmtNumber(levels.week52High, 2))}
      ${indicator("52周低点", fmtNumber(levels.week52Low, 2))}
      ${indicator("距高点", Number.isFinite(levels.distanceTo52WeekHighPercent) ? `${fmtNumber(levels.distanceTo52WeekHighPercent, 1)}%` : "-")}
    </div>`;
}

function rankLabel(rank) {
  return rank?.rank ? `${rank.rank}/${rank.total}` : "-";
}

function industryChainMiniTable(rows = [], relationLabel = "") {
  if (!rows.length) return empty(`暂无${relationLabel}样本。`);
  return `<div class="peer-table compact-chain-table">
    <div class="peer-row head">
      <span>Ticker</span><span>角色</span><span>涨跌</span><span>P/E</span><span>净利率</span>
    </div>
    ${rows.slice(0, 6).map((item) => `<div class="peer-row">
      <span><strong>${escapeHtml(normalizeTickerSymbol(item.ticker) || "-")}</strong><small>${escapeHtml(tickerNameLine(item.ticker, item))}</small></span>
      <span>${escapeHtml(item.role || relationLabel || "-")}</span>
      <span>${escapeHtml(pctLabel(item.changePercent))}</span>
      <span>${escapeHtml(fmtNumber(item.peTTM, 1))}</span>
      <span>${escapeHtml(fundamentalMarginDisplay(item))}</span>
    </div>`).join("")}
  </div>`;
}

function industryChainPackBlock(pack) {
  if (!pack) return empty("暂无同业/上下游数据包。");
  const relative = pack.relative || {};
  const bullets = pack.summary?.bullets || [];
  const watchItems = pack.summary?.watchItems || [];
  const coverage = pack.sourceCoverage || [];
  const rankEvidence = pack.industryRankEvidence || [];
  return `<div class="industry-chain-pack">
    <div class="context-pack-head">
      <span class="tag ${contextStatusClass(pack.status)}">${escapeHtml(contextStatusLabel(pack.status))}</span>
      <span class="tag">${escapeHtml(pack.provider || "行业链路")}</span>
      <span class="muted">${escapeHtml(fmtTime(pack.generatedAt))}</span>
    </div>
    <p>${escapeHtml(pack.summary?.headline || pack.sourceRisk || "")}</p>
    ${
      rankEvidence.length
        ? `<div class="feed-meta">${rankEvidence
            .slice(0, 4)
            .map((item) => `<span class="tag green">${escapeHtml(item.label || "Longbridge 行业")} · ${escapeHtml(item.industryName || item.counterId || "")}</span>`)
            .join("")}</div>`
        : ""
    }
    <div class="mini-kv">
      ${indicator("相对同行", Number.isFinite(relative.relativeChange) ? `${relative.relativeChange >= 0 ? "+" : ""}${fmtNumber(relative.relativeChange, 1)}pct` : "-")}
      ${indicator("同行中位涨跌", pctLabel(relative.peerMedianChange))}
      ${indicator("上游均值", pctLabel(relative.upstreamAvgChangePercent))}
      ${indicator("下游均值", pctLabel(relative.downstreamAvgChangePercent))}
      ${indicator("P/E溢价", Number.isFinite(relative.pePremium) ? `${relative.pePremium >= 0 ? "+" : ""}${fmtNumber(relative.pePremium, 0)}%` : "-")}
    </div>
    ${bullets.length ? `<ul>${bullets.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    <div class="chain-groups">
      <div>
        <h4>同行</h4>
        ${industryChainMiniTable(pack.peers || [], "同业")}
      </div>
      <div>
        <h4>上游</h4>
        ${industryChainMiniTable(pack.upstream || [], "上游")}
      </div>
      <div>
        <h4>下游/客户</h4>
        ${industryChainMiniTable(pack.downstream || [], "下游")}
      </div>
    </div>
    ${watchItems.length ? `<div class="decision-actions"><h4>怎么用</h4><ul>${watchItems.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    ${coverage.length ? `<div class="feed-meta">${coverage.map((item) => `<span class="tag ${item.status === "ok" ? "green" : item.status === "missing" ? "amber" : ""}">${escapeHtml(item.source)} ${escapeHtml(item.status || "")} ${escapeHtml(item.itemCount ?? "")}</span>`).join("")}</div>` : ""}
    ${pack.sourceRisk ? `<p class="muted">${escapeHtml(pack.sourceRisk)}</p>` : ""}
  </div>`;
}

function peerBenchmarkBlock(peer) {
  if (!peer?.peers?.length) return empty(peer?.summary || "暂无同业对照。");
  const rows = peer.peers.slice(0, 10);
  const targetIsEtf = rows.some((item) => item.isTarget && isEtfInstrument(item));
  return `<div class="peer-benchmark">
    <p>${escapeHtml(peer.summary || "")}</p>
    <div class="peer-ranks">
      ${indicator("P/E低估值排名", rankLabel(peer.ranks?.valuationPe))}
      ${indicator("P/S低估值排名", rankLabel(peer.ranks?.valuationPs))}
      ${indicator("增速排名", rankLabel(peer.ranks?.growth))}
      ${indicator("净利率排名", targetIsEtf ? "不适用" : rankLabel(peer.ranks?.margin))}
    </div>
    ${
      peer.notes?.length
        ? `<div class="feed-meta">${peer.notes
            .slice(0, 4)
            .map((note) => `<span class="tag">${escapeHtml(note)}</span>`)
            .join("")}</div>`
        : ""
    }
    <div class="peer-table">
      <div class="peer-row head">
        <span>Ticker</span><span>P/E</span><span>P/S</span><span>收入</span><span>净利率</span>
      </div>
      ${rows
        .map(
          (item) => `<div class="peer-row ${item.isTarget ? "target" : ""}">
            <span>${escapeHtml(tickerLabel(item.ticker, item))}</span>
            <span>${escapeHtml(fmtNumber(item.peTTM, 1))}</span>
            <span>${escapeHtml(fmtNumber(item.psTTM, 1))}</span>
            <span>${escapeHtml(Number.isFinite(item.revenueGrowthTTMYoy) ? `${fmtNumber(item.revenueGrowthTTMYoy, 1)}%` : "-")}</span>
            <span>${escapeHtml(fundamentalMarginDisplay(item))}</span>
          </div>`,
        )
        .join("")}
    </div>
  </div>`;
}

function moneyMillions(value) {
  return Number.isFinite(value) ? `${fmtNumber(value / 1_000_000, 1)}M` : "-";
}

function moneyCompact(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000) return `${fmtNumber(number / 1_000_000_000, 1)}B`;
  if (abs >= 1_000_000) return `${fmtNumber(number / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${fmtNumber(number / 1_000, 1)}K`;
  return fmtNumber(number, 0);
}

function wallLabel(wall) {
  if (!wall) return "-";
  const distance = Number.isFinite(wall.distancePercent)
    ? ` (${wall.distancePercent >= 0 ? "+" : ""}${fmtNumber(wall.distancePercent, 1)}%)`
    : "";
  return `${fmtNumber(wall.strike, 1)}${distance}`;
}

function optionRows(options = {}) {
  return (options.chartStrikes?.length ? options.chartStrikes : options.topStrikes || [])
    .filter((row) => Number.isFinite(row?.strike))
    .map((row) => ({
      strike: Number(row.strike),
      callGex: Number(row.callGex || 0),
      putGex: Number(row.putGex || 0),
      netGex: Number(row.netGex || 0),
      callOpenInterest: Number(row.callOpenInterest || 0),
      putOpenInterest: Number(row.putOpenInterest || 0),
      callVolume: Number(row.callVolume || 0),
      putVolume: Number(row.putVolume || 0),
    }))
    .sort((a, b) => a.strike - b.strike);
}

function optionDominantExpiry(options = {}) {
  const rows = options.expiryStats || [];
  const totalOi = rows.reduce((sum, row) => sum + Number(row.totalOpenInterest || 0), 0);
  if (!rows.length || !totalOi) return { label: "到期结构不足", detail: "provider 未返回足够到期日分布。" };
  const leader = rows
    .slice()
    .sort((a, b) => Number(b.totalOpenInterest || 0) - Number(a.totalOpenInterest || 0))[0];
  const share = Number(leader.totalOpenInterest || 0) / totalOi;
  const dte = Number.isFinite(leader.dte) ? leader.dte : null;
  const bucket = dte !== null && dte <= 9 ? "本周/近月" : dte !== null && dte <= 45 ? "中短期" : "远月";
  return {
    label: `${bucket}主导`,
    detail: `${leader.expiration || "最近到期"} OI 占比 ${fmtNumber(share * 100, 1)}%，${bucket}合约对短线结构影响更大。`,
  };
}

function optionMaxOiStrike(rows = []) {
  return rows
    .slice()
    .sort(
      (a, b) =>
        b.callOpenInterest + b.putOpenInterest - (a.callOpenInterest + a.putOpenInterest) ||
        Math.abs(b.netGex) - Math.abs(a.netGex),
    )[0] || null;
}

function optionStructureRead(options = {}) {
  const rows = optionRows(options);
  const walls = options.walls || {};
  const spot = Number(options.underlyingPrice);
  const gammaFlip = Number(walls.gammaFlip);
  const netGex = Number(options.totals?.netGex || 0);
  const maxOi = optionMaxOiStrike(rows);
  const expiry = optionDominantExpiry(options);
  const callWall = walls.callWall?.strike;
  const putWall = walls.putWall?.strike;
  const hasStructure = rows.length >= 4 && Number.isFinite(spot);
  const aboveFlip = Number.isFinite(gammaFlip) && Number.isFinite(spot) ? spot >= gammaFlip : null;
  const betweenWalls =
    Number.isFinite(spot) &&
    Number.isFinite(callWall) &&
    Number.isFinite(putWall) &&
    spot <= Math.max(callWall, putWall) &&
    spot >= Math.min(callWall, putWall);
  const nearMaxOi =
    maxOi && Number.isFinite(spot) && Math.abs(maxOi.strike - spot) / Math.max(spot, 1) <= 0.035;
  let structure = "噪音不足";
  if (hasStructure && netGex > 0 && betweenWalls && nearMaxOi) structure = "偏 pin/震荡";
  else if (hasStructure && (netGex < 0 || (Number.isFinite(callWall) && spot > callWall) || (Number.isFinite(putWall) && spot < putWall))) structure = "偏突破/波动放大";
  else if (hasStructure && netGex > 0) structure = "偏区间震荡";
  else if (hasStructure) structure = "结构混合";
  const flipText =
    aboveFlip === null
      ? "Gamma Flip 不足"
      : `现价在 Gamma Flip ${aboveFlip ? "上方" : "下方"}`;
  return {
    structure,
    conclusion: `${options.ticker || "该标的"} 期权结构${structure}，${flipText}，${expiry.label}。`,
    evidence: [
      `现价 ${fmtNumber(spot, 2)}`,
      `Call Wall ${wallLabel(walls.callWall)}`,
      `Put Wall ${wallLabel(walls.putWall)}`,
      Number.isFinite(gammaFlip) ? `Gamma Flip ${fmtNumber(gammaFlip, 1)}` : "Gamma Flip 暂无",
      maxOi ? `最大 OI 在 ${fmtNumber(maxOi.strike, 1)}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    observation: `${expiry.detail} 继续看现价是否站稳 Gamma Flip、是否贴近最大 OI，以及突破 Call/Put Wall 后成交量是否放大。`,
  };
}

function optionPercentDistance(value, spot) {
  const number = Number(value);
  const base = Number(spot);
  if (!Number.isFinite(number) || !Number.isFinite(base) || base <= 0) return "";
  const pct = ((number - base) / base) * 100;
  return `${pct >= 0 ? "高于" : "低于"}现价 ${fmtNumber(Math.abs(pct), 1)}%`;
}

function optionPressureRead(options = {}) {
  const walls = options.walls || {};
  const spot = Number(options.underlyingPrice);
  const callWall = Number(walls.callWall?.strike);
  const putWall = Number(walls.putWall?.strike);
  const gammaFlip = Number(walls.gammaFlip);
  const rows = optionRows(options);
  const maxOi = optionMaxOiStrike(rows);
  const netGex = Number(options.totals?.netGex || 0);
  const callOi = Number(options.totals?.callOpenInterest || 0);
  const putOi = Number(options.totals?.putOpenInterest || 0);
  const oiRatio = putOi > 0 ? callOi / putOi : null;
  const betweenWalls =
    Number.isFinite(spot) &&
    Number.isFinite(callWall) &&
    Number.isFinite(putWall) &&
    spot <= Math.max(callWall, putWall) &&
    spot >= Math.min(callWall, putWall);
  const aboveFlip = Number.isFinite(spot) && Number.isFinite(gammaFlip) ? spot >= gammaFlip : null;
  const positionText = [
    Number.isFinite(spot) ? `现价 ${fmtNumber(spot, 2)}` : "现价暂缺",
    Number.isFinite(gammaFlip)
      ? `Gamma Flip ${fmtNumber(gammaFlip, 1)}，${aboveFlip ? "现价在上方，结构更偏稳定" : "现价在下方，波动更容易放大"}`
      : "Gamma Flip 暂缺",
    maxOi ? `最大未平仓集中在 ${fmtNumber(maxOi.strike, 1)}，${optionPercentDistance(maxOi.strike, spot) || "距离现价待确认"}` : "最大 OI 暂缺",
  ].join("。");
  const wallText =
    Number.isFinite(callWall) && Number.isFinite(putWall)
      ? `${betweenWalls ? "现价仍被主要 Call/Put Wall 夹住" : "现价已经离开主要墙位区间"}；Call Wall ${fmtNumber(callWall, 1)}（${optionPercentDistance(callWall, spot) || "距离待确认"}），Put Wall ${fmtNumber(putWall, 1)}（${optionPercentDistance(putWall, spot) || "距离待确认"}）。`
      : "Call Wall 或 Put Wall 数据不足，墙位信号要降权。";
  const gexText =
    netGex > 0
      ? `净 GEX 为 ${moneyMillions(netGex)}，通常代表做市商对冲会压低波动，区间交易信号权重更高。`
      : netGex < 0
        ? `净 GEX 为 ${moneyMillions(netGex)}，通常代表对冲会放大波动，突破或跳空风险更高。`
        : "净 GEX 接近 0，方向信息较弱。";
  const oiText = Number.isFinite(oiRatio)
    ? `Call/Put OI 比约 ${fmtNumber(oiRatio, 2)}，${oiRatio >= 1.15 ? "看涨仓位更集中" : oiRatio <= 0.85 ? "保护性或看跌仓位更集中" : "多空仓位大致均衡"}。`
    : "Call/Put OI 比暂缺。";
  return {
    positionText,
    wallText,
    gexText,
    oiText,
    expiryText: optionDominantExpiry(options).detail,
    actions: [
      betweenWalls && netGex > 0 ? "墙位夹住且净 GEX 为正时，先把它当区间/震荡结构观察。" : "",
      netGex < 0 || !betweenWalls ? "若价格突破墙位或跌破 Gamma Flip，需要成交量、新闻催化和大盘方向共同确认。" : "",
      "财报、并购、监管和宏观事件前后，期权墙位容易失效，不能单独作为交易依据。",
    ].filter(Boolean),
  };
}

function optionReadGuideBlock(options = {}) {
  const read = optionPressureRead(options);
  const cards = [
    { title: "1. 位置", tag: "Spot", text: read.positionText },
    { title: "2. 墙位", tag: "Walls", text: read.wallText },
    { title: "3. 仓位", tag: "GEX / OI", text: `${read.gexText}${read.oiText}` },
    { title: "4. 到期", tag: "Expiry", text: read.expiryText },
  ];
  return `<div class="option-read-guide">
    ${cards
      .map(
        (card) => `<article>
          <div class="row"><h4>${escapeHtml(card.title)}</h4><span class="tag">${escapeHtml(card.tag)}</span></div>
          <p>${escapeHtml(card.text)}</p>
        </article>`,
      )
      .join("")}
    <div class="option-action-note">
      <strong>交易观察</strong>
      <ul>${read.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  </div>`;
}

function optionTypeLabel(value) {
  return value === "put" ? "Put" : "Call";
}

function optionSeverityLabel(value) {
  if (value === "high") return "高";
  if (value === "medium") return "中";
  return "观察";
}

function optionSeverityClass(value) {
  if (value === "high") return "red";
  if (value === "medium") return "amber";
  return "";
}

function optionUnusualRead(options = {}) {
  const rows = (options.unusualActivity || []).filter(Boolean);
  if (!rows.length) {
    return {
      conclusion: `${options.ticker || "该标的"} 当前未出现满足阈值的期权大额成交或成交/OI 异常线索。`,
      evidence: options.unusualActivitySummary || "provider 未返回足够 volume/OI/价格字段，或成交量未达到阈值。",
      observation: "没有异常不等于没有风险；财报、宏观和重大新闻前后仍要结合 IV、墙位和标的成交量观察。",
    };
  }
  const top = rows[0];
  const type = optionTypeLabel(top.optionType);
  const strike = Number.isFinite(Number(top.strike)) ? fmtNumber(Number(top.strike), 1) : "-";
  const expiry = top.expiration || "到期日未知";
  return {
    conclusion: `${options.ticker || "该标的"} 出现 ${rows.length} 条链级期权异动，最强为 ${type} ${expiry} ${strike}。`,
    evidence: `${top.reasons?.join("；") || top.summary || "成交量异常"}，评分 ${fmtNumber(Number(top.score || 0), 0)}/100。`,
    observation: "这不是逐笔订单流；需要用 time-and-sales、成交价靠近 bid/ask，以及隔日 OI 变化确认是开仓、平仓还是对冲。",
  };
}

function optionUnusualActivityBlock(options = {}) {
  const rows = (options.unusualActivity || []).filter(Boolean);
  const thresholds = appState?.config?.optionsChain?.unusualActivity || {};
  const thresholdText = [
    Number.isFinite(Number(thresholds.minVolume)) ? `成交量 >= ${fmtNumber(Number(thresholds.minVolume), 0)}` : "",
    Number.isFinite(Number(thresholds.minNotional)) ? `名义 >= ${moneyCompact(Number(thresholds.minNotional))}` : "",
    Number.isFinite(Number(thresholds.minVolumeOiRatio)) ? `成交/OI >= ${fmtNumber(Number(thresholds.minVolumeOiRatio), 2)}x` : "",
  ].filter(Boolean).join("，");
  const triad = optionUnusualRead(options);
  if (!rows.length) {
    return `<section class="option-unusual">
      <div class="row"><h4>期权大单/异动雷达</h4><span class="tag">链级</span></div>
      ${renderInsightTriad(triad, "option-unusual-empty")}
      <p class="muted">当前阈值：${escapeHtml(thresholdText || "默认阈值")}。该模块依赖 provider 返回 volume、OI 和价格字段。</p>
    </section>`;
  }
  return `<section class="option-unusual">
    <div class="row"><h4>期权大单/异动雷达</h4><span class="tag red">${escapeHtml(`${rows.length} 条`)}</span></div>
    ${renderInsightTriad(triad, "option-unusual-read")}
    <div class="peer-table options-unusual-table">
      <div class="peer-row head">
        <span>合约</span><span>成交</span><span>成交/OI</span><span>名义额</span><span>解释</span>
      </div>
      ${rows
        .slice(0, 6)
        .map((row) => {
          const type = optionTypeLabel(row.optionType);
          const strike = Number.isFinite(Number(row.strike)) ? fmtNumber(Number(row.strike), 1) : "-";
          const expiry = row.expiration || "-";
          const dte = Number.isFinite(Number(row.dte)) ? `${fmtNumber(Number(row.dte), 0)}D` : "";
          const ratio = Number.isFinite(Number(row.volumeOiRatio)) ? `${fmtNumber(Number(row.volumeOiRatio), 2)}x` : "OI缺失";
          const severity = optionSeverityClass(row.severity);
          const reasons = (row.reasons || []).slice(0, 2).join("；") || row.summary || row.sideHint || "";
          return `<div class="peer-row">
            <span><strong>${escapeHtml(type)} ${escapeHtml(strike)}</strong><small>${escapeHtml(`${expiry}${dte ? ` · ${dte}` : ""}`)}</small></span>
            <span>${escapeHtml(fmtNumber(Number(row.volume || 0), 0))}</span>
            <span>${escapeHtml(ratio)}</span>
            <span>${escapeHtml(moneyCompact(row.notional))}</span>
            <span><span class="tag ${severity}">${escapeHtml(optionSeverityLabel(row.severity))}</span> ${escapeHtml(reasons)}</span>
          </div>`;
        })
        .join("")}
    </div>
    <p class="muted">口径：${escapeHtml(thresholdText || "默认阈值")}。这是期权链聚合成交异常，不是逐笔 sweep/block；方向必须结合 bid/ask、time-and-sales 和隔日 OI 变化确认。</p>
  </section>`;
}

function indicatorWithHelp(label, value, help) {
  return `<div class="indicator option-help-indicator">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    <small>${escapeHtml(help)}</small>
  </div>`;
}

function optionSvgEmpty(title, text) {
  return `<article class="option-chart-card">
    <div class="row"><h4>${escapeHtml(title)}</h4><span class="tag amber">暂无图</span></div>
    <div class="option-chart-empty">${escapeHtml(text)}</div>
  </article>`;
}

function optionScale(min, max, start, end) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return () => (start + end) / 2;
  return (value) => {
    const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)));
    return start + ratio * (end - start);
  };
}

function optionMarkers(options = {}, xFor, top, bottom) {
  const walls = options.walls || {};
  const markers = [
    { label: "现价", value: options.underlyingPrice, color: "#255ec7" },
    { label: "Call Wall", value: walls.callWall?.strike, color: "#0f766e" },
    { label: "Put Wall", value: walls.putWall?.strike, color: "#b42318" },
    { label: "Gamma Flip", value: walls.gammaFlip, color: "#7c3aed" },
  ].filter((item) => Number.isFinite(Number(item.value)));
  return markers
    .map((item, index) => {
      const x = xFor(Number(item.value));
      return `<g class="option-marker">
        <line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${item.color}" stroke-width="1.4" stroke-dasharray="4 4" />
        <text x="${x + 4}" y="${top + 13 + index * 12}" fill="${item.color}">${escapeHtml(item.label)}</text>
      </g>`;
    })
    .join("");
}

function optionAxisLabels(rows, xFor, y) {
  const step = Math.max(1, Math.ceil(rows.length / 6));
  return rows
    .filter((_, index) => index % step === 0)
    .map((row) => `<text x="${xFor(row.strike)}" y="${y}" text-anchor="middle">${escapeHtml(fmtNumber(row.strike, 0))}</text>`)
    .join("");
}

function optionGexChart(options = {}) {
  const rows = optionRows(options);
  if (!rows.length) return optionSvgEmpty("GEX by Strike", "provider 未返回足够行权价，无法画 GEX 分布。");
  const width = 720;
  const height = 260;
  const margin = { left: 42, right: 22, top: 24, bottom: 34 };
  const minStrike = Math.min(...rows.map((row) => row.strike));
  const maxStrike = Math.max(...rows.map((row) => row.strike));
  const xFor = optionScale(minStrike, maxStrike, margin.left, width - margin.right);
  const zero = Math.round((height - margin.bottom + margin.top) / 2);
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.netGex)));
  const barWidth = Math.max(5, Math.min(18, (width - margin.left - margin.right) / Math.max(rows.length * 1.8, 1)));
  const bars = rows
    .map((row) => {
      const x = xFor(row.strike) - barWidth / 2;
      const y = zero - (row.netGex / maxAbs) * (zero - margin.top);
      const top = Math.min(y, zero);
      const h = Math.max(2, Math.abs(y - zero));
      const color = row.netGex >= 0 ? "#0f766e" : "#b42318";
      return `<rect x="${x}" y="${top}" width="${barWidth}" height="${h}" rx="2" fill="${color}" opacity="0.82" />`;
    })
    .join("");
  return `<article class="option-chart-card">
    <div class="row"><h4>GEX by Strike</h4><span class="tag">${escapeHtml(moneyMillions(options.totals?.netGex))}</span></div>
    <div class="option-chart-scroll"><svg class="option-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="GEX by strike">
      <line x1="${margin.left}" y1="${zero}" x2="${width - margin.right}" y2="${zero}" stroke="#9aa6b2" />
      ${bars}
      ${optionMarkers(options, xFor, margin.top, height - margin.bottom)}
      ${optionAxisLabels(rows, xFor, height - 10)}
      <text x="${margin.left}" y="16">正 GEX 压波动</text>
      <text x="${margin.left}" y="${height - 18}">负 GEX 放波动</text>
    </svg></div>
  </article>`;
}

function optionOiVolumeChart(options = {}) {
  const rows = optionRows(options);
  if (!rows.length) return optionSvgEmpty("OI / Volume", "provider 未返回 OI/Volume，无法画仓位分布。");
  const width = 720;
  const height = 260;
  const margin = { left: 42, right: 22, top: 24, bottom: 34 };
  const minStrike = Math.min(...rows.map((row) => row.strike));
  const maxStrike = Math.max(...rows.map((row) => row.strike));
  const xFor = optionScale(minStrike, maxStrike, margin.left, width - margin.right);
  const baseline = height - margin.bottom;
  const maxOi = Math.max(1, ...rows.map((row) => row.callOpenInterest + row.putOpenInterest));
  const maxVol = Math.max(1, ...rows.map((row) => row.callVolume + row.putVolume));
  const barWidth = Math.max(5, Math.min(18, (width - margin.left - margin.right) / Math.max(rows.length * 1.8, 1)));
  const bars = rows
    .map((row) => {
      const x = xFor(row.strike) - barWidth / 2;
      const callH = (row.callOpenInterest / maxOi) * (height - margin.top - margin.bottom);
      const putH = (row.putOpenInterest / maxOi) * (height - margin.top - margin.bottom);
      const volH = ((row.callVolume + row.putVolume) / maxVol) * 34;
      const putY = baseline - putH;
      const callY = putY - callH;
      return `<rect x="${x}" y="${callY}" width="${barWidth}" height="${Math.max(0, callH)}" fill="#0f766e" opacity="0.78" />
        <rect x="${x}" y="${putY}" width="${barWidth}" height="${Math.max(0, putH)}" fill="#a46113" opacity="0.78" />
        <rect x="${x}" y="${baseline - Math.max(2, volH)}" width="${barWidth}" height="${Math.max(2, volH)}" fill="#255ec7" opacity="0.35" />`;
    })
    .join("");
  return `<article class="option-chart-card">
    <div class="row"><h4>OI / Volume 堆叠</h4><span class="tag">Call / Put</span></div>
    <div class="option-chart-scroll"><svg class="option-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Open interest and volume">
      <line x1="${margin.left}" y1="${baseline}" x2="${width - margin.right}" y2="${baseline}" stroke="#9aa6b2" />
      ${bars}
      ${optionMarkers(options, xFor, margin.top, height - margin.bottom)}
      ${optionAxisLabels(rows, xFor, height - 10)}
      <text x="${margin.left}" y="16">绿=Call OI，橙=Put OI，蓝=成交量</text>
    </svg></div>
  </article>`;
}

function optionIvSmileChart(options = {}) {
  const rows = (options.ivSmile || []).filter((row) => Number.isFinite(row?.strike) && Number.isFinite(row?.avgIv));
  if (!rows.length) return optionSvgEmpty("IV Smile", "provider 未返回 IV，无法画隐含波动率曲线。");
  const width = 720;
  const height = 260;
  const margin = { left: 42, right: 22, top: 24, bottom: 34 };
  const minStrike = Math.min(...rows.map((row) => row.strike));
  const maxStrike = Math.max(...rows.map((row) => row.strike));
  const values = rows.flatMap((row) => [row.callIv, row.putIv, row.avgIv]).filter(Number.isFinite);
  const minIv = Math.max(0, Math.min(...values) * 0.88);
  const maxIv = Math.max(...values) * 1.08;
  const xFor = optionScale(minStrike, maxStrike, margin.left, width - margin.right);
  const yFor = optionScale(minIv, maxIv, height - margin.bottom, margin.top);
  const pathFor = (key) =>
    rows
      .filter((row) => Number.isFinite(row[key]))
      .map((row, index) => `${index ? "L" : "M"}${xFor(row.strike).toFixed(1)},${yFor(row[key]).toFixed(1)}`)
      .join(" ");
  return `<article class="option-chart-card">
    <div class="row"><h4>IV Smile</h4><span class="tag">隐含波动率</span></div>
    <div class="option-chart-scroll"><svg class="option-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Implied volatility smile">
      <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" stroke="#9aa6b2" />
      <path d="${pathFor("avgIv")}" fill="none" stroke="#475569" stroke-width="2.2" />
      <path d="${pathFor("callIv")}" fill="none" stroke="#0f766e" stroke-width="1.8" />
      <path d="${pathFor("putIv")}" fill="none" stroke="#a46113" stroke-width="1.8" />
      ${optionMarkers(options, xFor, margin.top, height - margin.bottom)}
      ${optionAxisLabels(rows, xFor, height - 10)}
      <text x="${margin.left}" y="16">灰=平均 IV，绿=Call，橙=Put</text>
      <text x="${width - 96}" y="16">${escapeHtml(`${fmtNumber(maxIv * 100, 0)}%`)}</text>
      <text x="${width - 96}" y="${height - 40}">${escapeHtml(`${fmtNumber(minIv * 100, 0)}%`)}</text>
    </svg></div>
  </article>`;
}

function optionsChartGrid(options = {}) {
  return `<div class="option-chart-grid option-data-chart-grid">
    ${optionGexChart(options)}
    ${optionOiVolumeChart(options)}
    ${optionIvSmileChart(options)}
  </div>`;
}

function optionKey(runId, ticker) {
  return `${runId || "latest"}:${String(ticker || "").toUpperCase()}`;
}

function optionProviderOrderLabel() {
  const labels = { nasdaq: "Nasdaq", yahoo: "Yahoo", finnhub: "Finnhub" };
  const order = appState?.config?.optionsChain?.providerOrder?.length
    ? appState.config.optionsChain.providerOrder
    : ["nasdaq", "yahoo", "finnhub"];
  return order.map((item) => labels[item] || item).join(" -> ");
}

function optionFailuresForTicker(run, ticker) {
  const normalizedTicker = String(ticker || "").toUpperCase();
  const onDemand = run?.dataQuality?.optionOnDemand;
  const fromOnDemand =
    onDemand?.ticker === normalizedTicker && onDemand.status === "failed"
      ? onDemand.errors || []
      : [];
  const fromErrors = (run?.errors || []).filter((item) => {
    const source = `${item.source || ""} ${item.error || ""}`;
    return String(item.ticker || "").toUpperCase() === normalizedTicker && /Options|期权|option/i.test(source);
  });
  const seen = new Set();
  return [...fromOnDemand, ...fromErrors].filter((item) => {
    const key = `${item.source || ""}:${item.error || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function requestOptionsChain(ticker, runId) {
  return api("/api/options/chain", {
    method: "POST",
    body: JSON.stringify({ ticker, runId }),
  });
}

function queueOptionsAutofetch(run, ticker, hasOptions) {
  if (!run || !ticker || hasOptions || run.summaryOnly) return;
  if (!appState?.config?.optionsChain?.enabled) return;
  if (appState?.latest?.id && run.id !== appState.latest.id) return;
  if (optionFailuresForTicker(run, ticker).length) return;
  const key = optionKey(run.id, ticker);
  if (optionFetchInFlight.has(key)) return;
  optionFetchInFlight.add(key);
  setTimeout(async () => {
    try {
      const result = await requestOptionsChain(ticker, run.id);
      if (result.run?.id) runDetailCache.set(result.run.id, result.run);
      await loadState();
    } catch {
      await loadState().catch(() => {});
    } finally {
      optionFetchInFlight.delete(key);
    }
  }, 0);
}

function optionsGexBlock(options, ticker, run) {
  if (!options) {
    const order = optionProviderOrderLabel();
    const failures = optionFailuresForTicker(run, ticker);
    const fetching = optionFetchInFlight.has(optionKey(run?.id, ticker));
    return `<div class="empty-state option-empty">
      <p>暂无 ${escapeHtml(ticker)} 期权链。当前会按 ${escapeHtml(order)} 顺序补抓，并写回当前报告；Yahoo 在当前网络经常 403，Finnhub 取决于账号套餐权限。</p>
      ${fetching ? `<p class="muted">正在自动补抓期权链...</p>` : ""}
      ${
        failures.length
          ? `<div class="option-provider-errors">${failures
              .slice(0, 4)
              .map(
                (item) =>
                  `<p class="quality-error">${escapeHtml(sourceLabel(item.source || "Options Chain"))}：${escapeHtml(errorLabel(item.error || ""))}</p>`,
              )
              .join("")}</div>`
          : ""
      }
      <button class="btn compact" type="button" data-fetch-options="${escapeHtml(ticker)}" data-run-id="${escapeHtml(run?.id || "")}">${failures.length ? "重试补抓期权链" : "立即补抓期权链"}</button>
    </div>`;
  }
  const topStrikes = options.topStrikes || [];
  const walls = options.walls || {};
  const contractCount = Number.isFinite(options.contractCount)
    ? options.contractCount
    : options.contracts?.length || 0;
  const structure = optionStructureRead(options);
  const sourceRisk = cleanTemplateTone(options.sourceRisk || "期权数据为衍生计算，需结合原始链、成交量和到期日结构观察。");
  return `<div class="options-gex">
    ${renderInsightTriad(structure, "option-structure")}
    ${
      options.cacheHit
        ? `<p class="muted"><span class="tag amber">缓存</span> 当前 provider 暂不可用，显示 ${escapeHtml(fmtTime(options.cachedAt))} 的最近成功期权链。</p>`
        : ""
    }
    <div class="mini-kv option-kv">
      ${indicatorWithHelp("标的价格", fmtNumber(options.underlyingPrice, 2), "所有墙位都要和现价距离一起看。")}
      ${indicatorWithHelp("净GEX", moneyMillions(options.totals?.netGex), "正值通常压波动，负值更容易放大波动。")}
      ${indicatorWithHelp("Call Wall", wallLabel(walls.callWall), "上方潜在压力位，不等于一定涨不破。")}
      ${indicatorWithHelp("Put Wall", wallLabel(walls.putWall), "下方潜在支撑位，不等于一定跌不破。")}
      ${indicatorWithHelp("Gamma Flip", Number.isFinite(walls.gammaFlip) ? fmtNumber(walls.gammaFlip, 1) : "-", "市场从容易被压住切到容易放大波动的参考点。")}
      ${indicatorWithHelp("Call/Put OI", `${fmtNumber(options.totals?.callOpenInterest, 0)} / ${fmtNumber(options.totals?.putOpenInterest, 0)}`, "看多空仓位集中在哪些行权价。")}
      ${indicatorWithHelp("Call/Put Vol", `${fmtNumber(Number(options.totals?.callVolume || 0), 0)} / ${fmtNumber(Number(options.totals?.putVolume || 0), 0)}`, "当日成交量，配合 OI 看是否有异常开平仓线索。")}
      ${indicatorWithHelp("异动线索", fmtNumber(Number(options.unusualActivity?.length || 0), 0), "链级大额成交和成交/OI 异常，不等于逐笔大单。")}
    </div>
    ${
      options.largeOrderSupport?.note
        ? `<div class="option-capability">
            <span class="tag ${options.largeOrderSupport.supportsTimeAndSales ? "green" : "amber"}">${escapeHtml(options.largeOrderSupport.supportsTimeAndSales ? "支持逐笔" : "链级估算")}</span>
            <p>${escapeHtml(options.largeOrderSupport.note)}</p>
          </div>`
        : ""
    }
    ${optionsChartGrid(options)}
    ${optionReadGuideBlock(options)}
    ${optionUnusualActivityBlock(options)}
    <div class="option-teaching">
      <p><strong>怎么读：</strong>先看现价相对 Gamma Flip，再看最大 OI 和 Call/Put Wall 是否夹住现价，最后看近月到期是否主导；只有成交量跟随突破时，墙位信号才更有交易意义。</p>
      <p class="muted">口径：覆盖 ${escapeHtml(options.expirations?.length || 0)} 个到期日、${escapeHtml(contractCount)} 个合约；GEX 近似为 gamma * OI * 100 * spot^2 * 1%，Call 记正、Put 记负。</p>
    </div>
    ${
      topStrikes.length
        ? `<div class="peer-table options-table">
            <div class="peer-row head">
              <span>Strike</span><span>Call GEX</span><span>Put GEX</span><span>Net GEX</span><span>OI</span>
            </div>
            ${topStrikes
              .slice(0, 8)
              .map(
                (row) => `<div class="peer-row">
                  <span>${escapeHtml(fmtNumber(row.strike, 1))}</span>
                  <span>${escapeHtml(moneyMillions(row.callGex))}</span>
                  <span>${escapeHtml(moneyMillions(row.putGex))}</span>
                  <span>${escapeHtml(moneyMillions(row.netGex))}</span>
                  <span>${escapeHtml(`${fmtNumber(row.callOpenInterest, 0)}/${fmtNumber(row.putOpenInterest, 0)}`)}</span>
                </div>`,
              )
              .join("")}
          </div>`
        : ""
    }
    <p class="muted">${escapeHtml(sourceRisk)}</p>
  </div>`;
}

function openbbRouteStatus(route) {
  if (!route) return "未返回";
  if (route.status === "ok" && route.records?.length) return `${route.records.length} 条`;
  if (route.status === "ok") return "无数据";
  return "异常";
}

function routeStatusClass(route) {
  if (route?.status === "ok" && route.records?.length) return "green";
  if (route?.status === "ok") return "amber";
  return "red";
}

function openbbDiscoveryBlock(discovery) {
  const routes = discovery?.routes || {};
  const labels = { active: "成交活跃", gainers: "涨幅榜", losers: "跌幅榜" };
  const rows = Object.entries(labels).flatMap(([key, label]) =>
    (routes[key]?.records || []).slice(0, 5).map((record, index) => ({
      label,
      rank: index + 1,
      symbol: record.symbol || record.ticker || "",
      change: record.change_percent || record.percent_change || record.changes_percentage || "",
    })),
  );
  if (!rows.length) {
    const issue = (discovery?.errors || [])
      .map((item) => item.error || item.route)
      .filter(Boolean)
      .slice(0, 2)
      .join("；");
    return `<article class="openbb-card">
      <div class="row"><h3>OpenBB 市场扫描</h3><span class="tag amber">暂无可用热股</span></div>
      <p class="muted">${escapeHtml(issue || "OpenBB discovery route 暂未返回数据；常见原因是 yfinance 限流或缺少 FMP/Benzinga 等 provider key。")}</p>
    </article>`;
  }
  return `<article class="openbb-card">
    <div class="row"><h3>OpenBB 市场扫描</h3><span class="tag green">${rows.length} 条</span></div>
    <div class="mini-kv">${rows
      .map((row) => `<span><strong>${escapeHtml(row.symbol || "-")}</strong>${escapeHtml(row.label)} #${escapeHtml(row.rank)}${row.change !== "" ? ` · ${escapeHtml(row.change)}%` : ""}</span>`)
      .join("")}</div>
  </article>`;
}

function openbbBundleBlock(bundle) {
  if (!bundle) return empty("暂无该 ticker 的 OpenBB 数据。");
  const routes = bundle.routes || {};
  const labels = {
    identity: "公司识别",
    filings: "SEC公告",
    quote: "报价",
    historical: "历史价格",
    profile: "公司画像",
    metrics: "基本面指标",
    news: "新闻",
    options: "期权链",
  };
  return `<div class="openbb-card">
    <div class="feed-meta">${Object.entries(labels)
      .map(([key, label]) => `<span class="tag ${routeStatusClass(routes[key])}">${escapeHtml(label)}：${escapeHtml(openbbRouteStatus(routes[key]))}</span>`)
      .join("")}</div>
    ${Object.entries(labels)
      .map(([key, label]) => {
        const records = routes[key]?.records || [];
        if (!records.length) return "";
        const sample = records[0] || {};
        const fields = Object.entries(sample).slice(0, 5);
        return `<p class="muted"><strong>${escapeHtml(label)}</strong> ${fields
          .map(([field, value]) => `${field}: ${String(value).slice(0, 48)}`)
          .join(" · ")}</p>`;
      })
      .join("")}
  </div>`;
}

function catalystDeepDiveBlock(deepDive) {
  if (!deepDive) return "";
  const list = (title, items, fallback = "暂无") => `<section>
    <h4>${escapeHtml(title)}</h4>
    ${
      items?.length
        ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
        : `<p class="muted">${escapeHtml(fallback)}</p>`
    }
  </section>`;
  return `<div class="catalyst-deep-dive">
    <p class="social-lede">${escapeHtml(deepDive.headline || "")}</p>
    <div class="decision-grid">
      ${list("发生了什么", deepDive.factRows)}
      ${list("为什么波动", deepDive.whyMove)}
      ${list("预期差", deepDive.expectationGap, "缺少足够标题或原文信息来判断预期差。")}
      ${list("行业链条", deepDive.industryRows)}
      ${list("同业对照", deepDive.peerRows)}
      ${list("证据缺口", deepDive.verify)}
    </div>
    ${deepDive.sourceLimit ? `<p class="muted">${escapeHtml(deepDive.sourceLimit)}</p>` : ""}
  </div>`;
}

function socialMetaLine(item) {
  const parts = [
    Number.isFinite(item?.mentions) ? `榜单提及 ${item.mentions} 次` : null,
    Number.isFinite(item?.totalUsers) && item.totalUsers > 0 ? `用户 ${item.totalUsers}` : null,
    Number.isFinite(item?.totalUpvotes) && item.totalUpvotes > 0 ? `热度 ${item.totalUpvotes}` : null,
    Number.isFinite(item?.totalComments) && item.totalComments > 0 ? `评论 ${item.totalComments}` : null,
    Number.isFinite(item?.sentimentPositivePercent) && Number.isFinite(item?.sentimentNegativePercent)
      ? `情绪 ${fmtNumber(item.sentimentPositivePercent, 1)}% 正面 / ${fmtNumber(item.sentimentNegativePercent, 1)}% 负面`
      : null,
    (item?.subreddits || []).length ? `来源 ${(item.subreddits || []).join("、")}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "社交来源待核验";
}

function socialReasonFragment(text = "", limit = 160) {
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[。.!?！？]+/g, "，")
    .replace(/[；;]+/g, "，")
    .replace(/\s+/g, " ")
    .replace(/[，,\s]+$/g, "")
    .slice(0, limit);
}

function compactSocialHeatSource(text = "", limit = 4) {
  return socialReasonFragment(text, 220)
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, limit)
    .join("，");
}

function compactSocialCatalyst(item = {}, context = {}) {
  const raw = context.catalystSummary || item.newsCatalyst || "";
  const text = String(raw || "");
  const mainMatch = text.match(/近期催化主线是([^。]+)(?:。|$)/);
  if (mainMatch) return socialReasonFragment(`近期催化主线是${mainMatch[1]}`, 100);
  const aroundMatch = text.match(/主要围绕([^；。]+)(?:[；。]|$)/);
  if (aroundMatch) return socialReasonFragment(`近期材料主要围绕${aroundMatch[1]}`, 100);
  return socialReasonFragment(text || "但还需要新闻原文解释热度", 100);
}

function socialKnownText(value, fallback) {
  const text = socialReasonFragment(value, 180);
  if (!text || /^(n\/a|na|null|undefined|-|待补全)$/i.test(text)) return fallback;
  if (/^n\/a\s*行业公司/i.test(text)) return fallback;
  return text;
}

function socialTwoSentenceReason(item = {}) {
  if (item.twoSentenceReason) return item.twoSentenceReason;
  const context = item.socialContext || {};
  if (context.twoSentenceReason) return context.twoSentenceReason;
  const company = context.company || {};
  const heat = compactSocialHeatSource(context.heatSource || socialMetaLine(item));
  const catalyst = compactSocialCatalyst(item, context);
  const companyName = socialKnownText(company.name, item.ticker || "该标的");
  const industry = socialKnownText(company.industry, "行业信息待补全");
  const business = socialKnownText(company.mainBusiness || item.companyBrief || item.fundamentalBrief, "主业信息待补全");
  const chain = context.industryContext || {};
  const products = (chain.products || []).slice(0, 3).filter(Boolean).join("、");
  const upstream = (chain.upstream || []).slice(0, 2).filter(Boolean).join("、");
  const downstream = (chain.downstream || []).slice(0, 2).filter(Boolean).join("、");
  const chainText = upstream || downstream ? `；上游看${upstream || "供应链"}，下游看${downstream || "客户需求"}` : "";
  return `${escapeSentenceEnd(item.ticker || "该标的")} 被热议，主要因为${heat}${catalyst ? `，${catalyst}` : ""}。${companyName} 属于${chain.industry || industry}，核心产品是${products || business}${chainText}；投资上先把热度当线索，结合新闻原文、财报/指引和成交量确认是否真有基本面变化。`;
}

function escapeSentenceEnd(text = "") {
  return String(text || "").replace(/[。.!?！？]+$/g, "");
}

function socialInsightBlock(item, fallbackText = "") {
  const context = item?.socialContext || {};
  const company = context.company || {};
  const fundamentalSnapshot = context.fundamentalSnapshot || {};
  const metrics = fundamentalSnapshot.metrics || item?.fundamentalMetrics || [];
  const drivers = context.heatDrivers || item?.reasons || [];
  const checks = context.actionChecks || [];
  const evidenceBreakdown = context.evidenceBreakdown || [];
  const industry = context.industryContext || {};
  const keywords = context.socialKeywords || item?.socialKeywords || [];
  const keywordLine = keywords
    .slice(0, 8)
    .map((keyword) => `${keyword.keyword || keyword}${Number.isFinite(keyword.count) ? ` x${keyword.count}` : ""}`)
    .join("、");
  const lede =
    socialTwoSentenceReason(item) ||
    context.whyHot ||
    fallbackText ||
    item?.investmentView ||
    "热议理由需要结合原帖、新闻、行情和官方披露继续核验。";
  const companyLine = company.summary || item?.companyBrief || item?.fundamentalBrief || "";
  const catalystLine = context.catalystSummary || item?.newsCatalyst || "";
  const fundamentalLine = fundamentalSnapshot.summary || item?.fundamentalBrief || "";
  const ledeParts = sentenceParts(lede);
  const triad = {
    conclusion: compactSentence(ledeParts[0] || lede, 125),
    evidence: compactSentence(context.heatSource || catalystLine || socialMetaLine(item), 155),
    observation: compactSentence(checks[0] || item?.investmentView || ledeParts[1] || "把热度当线索，结合新闻原文、财报和成交量确认基本面变化。", 145),
  };
  return `<div class="social-insight">
    ${renderInsightTriad(triad, "social-triad")}
    ${context.heatSource ? `<p class="muted">热度来源：${escapeHtml(context.heatSource)}</p>` : ""}
    <div class="social-facts">
      ${companyLine ? `<p><strong>行业/主业</strong><span>${escapeHtml(companyLine)}</span></p>` : ""}
      ${keywordLine ? `<p><strong>社交关键词</strong><span>${escapeHtml(keywordLine)}</span></p>` : ""}
      ${fundamentalLine ? `<p><strong>基本面</strong><span>${escapeHtml(fundamentalLine)}</span></p>` : ""}
      ${catalystLine ? `<p><strong>近期催化</strong><span>${escapeHtml(catalystLine)}</span></p>` : ""}
    </div>
    ${
      metrics.length
        ? `<div class="mini-kv social-mini-kv">${metrics
            .slice(0, 6)
            .map((metricItem) => indicator(metricItem.label, metricItem.value))
            .join("")}</div>`
        : ""
    }
    ${
      evidenceBreakdown.length
        ? `<div class="trigger-grid social-evidence-grid">${evidenceBreakdown
            .map(
              (row) => `<article>
                <strong>${escapeHtml(row.label || "证据")}</strong>
                <p>${escapeHtml(row.value || "")}</p>
                ${row.read ? `<p class="muted">${escapeHtml(row.read)}</p>` : ""}
              </article>`,
            )
            .join("")}</div>`
        : ""
    }
    ${
      industry.summary
        ? `<div class="social-facts">
            <p><strong>行业链</strong><span>${escapeHtml(industry.summary)}</span></p>
            ${industry.products?.length ? `<p><strong>主要产品</strong><span>${escapeHtml(industry.products.slice(0, 6).join("、"))}</span></p>` : ""}
            ${industry.upstream?.length ? `<p><strong>上游环节</strong><span>${escapeHtml(industry.upstream.slice(0, 6).join("、"))}</span></p>` : ""}
            ${industry.upstreamCompanies?.length ? `<p><strong>上游上市公司</strong><span>${escapeHtml(industry.upstreamCompanies.slice(0, 8).map((row) => `${row.ticker}${row.role ? `(${row.role})` : ""}`).join("、"))}</span></p>` : ""}
            ${industry.downstream?.length ? `<p><strong>下游/客户</strong><span>${escapeHtml(industry.downstream.slice(0, 6).join("、"))}</span></p>` : ""}
            ${industry.downstreamCompanies?.length ? `<p><strong>下游/客户上市公司</strong><span>${escapeHtml(industry.downstreamCompanies.slice(0, 8).map((row) => `${row.ticker}${row.role ? `(${row.role})` : ""}`).join("、"))}</span></p>` : ""}
            ${industry.demandDrivers?.length ? `<p><strong>关键驱动</strong><span>${escapeHtml(industry.demandDrivers.slice(0, 6).join("、"))}</span></p>` : ""}
            ${industry.peers?.length ? `<p><strong>同类公司</strong><span>${escapeHtml(industry.peers.slice(0, 6).map((peer) => peer.ticker || peer).join("、"))}</span></p>` : ""}
            ${industry.keyRisks?.length ? `<p><strong>链条风险</strong><span>${escapeHtml(industry.keyRisks.join("、"))}</span></p>` : ""}
          </div>`
        : ""
    }
    ${
      drivers.length
        ? `<div class="feed-meta">${drivers
            .slice(0, 6)
            .map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`)
            .join("")}</div>`
        : ""
    }
    ${item?.investmentView ? `<p class="social-view">${escapeHtml(item.investmentView)}</p>` : ""}
    ${
      checks.length
        ? `<ul class="social-checks">${checks
            .slice(0, 4)
            .map((check) => `<li>${escapeHtml(check)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${context.limitation ? `<p class="muted">${escapeHtml(context.limitation)}</p>` : ""}
  </div>`;
}

function decisionMemoBlock(memo) {
  if (!memo) return empty("暂无决策备忘录。");
  const list = (items, fallback = "暂无") =>
    items?.length
      ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p class="muted">${escapeHtml(fallback)}</p>`;
  return `<div class="decision-memo">
    <div class="decision-head">
      <div>
        <span class="tag green">${escapeHtml(memo.watchLevel || "继续跟踪")}</span>
        <span class="tag">${escapeHtml(`置信度 ${memo.confidence ?? "-"}`)}</span>
        <span class="tag">${escapeHtml(memo.horizon || "观察周期待定")}</span>
      </div>
    </div>
    <p class="decision-stance">${escapeHtml(memo.stance || "")}</p>
    <div class="decision-grid">
      <section>
        <h4>看多依据</h4>
        ${list(memo.bullCase, "暂无明确看多依据。")}
      </section>
      <section>
        <h4>看空/风险</h4>
        ${list(memo.bearCase, "暂无明确看空依据。")}
      </section>
      <section>
        <h4>失效条件</h4>
        ${list(memo.invalidation, "暂无失效条件。")}
      </section>
      <section>
        <h4>数据缺口</h4>
        ${list(memo.dataGaps, "关键数据基本覆盖。")}
      </section>
    </div>
    ${
      memo.monitorTriggers?.length
        ? `<div class="trigger-grid">${memo.monitorTriggers
            .map(
              (item) => `<article>
                <div class="row">
                  <strong>${escapeHtml(item.label)}</strong>
                  <span class="tag amber">${escapeHtml(item.status)}</span>
                </div>
                <p>${escapeHtml(item.detail)}</p>
              </article>`,
            )
            .join("")}</div>`
        : ""
    }
    ${
      memo.actionPlan?.length
        ? `<div class="decision-actions"><h4>下一步动作</h4>${list(memo.actionPlan)}</div>`
        : ""
    }
  </div>`;
}

function styleScorecardBlock(scorecard) {
  const card = scorecard?.investmentStyleScorecard || scorecard;
  const rows = card?.rows || card?.styles || [];
  if (!rows.length) return empty("暂无投资流派评分。");
  const best = card.bestFit || card.bestMatch || rows[0];
  const consensus = card.personaConsensus || {};
  const likedBy = consensus.likedBy || [];
  const watchBy = consensus.watchBy || [];
  return `<div class="style-scorecard">
    <div class="style-scorecard-head">
      <div>
        <strong>最匹配：${escapeHtml(best?.name || best?.nameZh || best?.styleId || "-")}</strong>
        <p class="muted">${escapeHtml(best?.thesis || best?.summaryZh || card.note || "")}</p>
        ${
          likedBy.length || watchBy.length || consensus.disagreement
            ? `<div class="feed-meta">
                ${likedBy.slice(0, 4).map((item) => `<span class="tag green">认可：${escapeHtml(item)}</span>`).join("")}
                ${watchBy.slice(0, 4).map((item) => `<span class="tag amber">观察：${escapeHtml(item)}</span>`).join("")}
              </div>
              ${consensus.disagreement ? `<p class="muted">${escapeHtml(consensus.disagreement)}</p>` : ""}`
            : ""
        }
      </div>
      <span class="tag green">${escapeHtml(best?.label || best?.ratingZh || "评分")} · ${escapeHtml(best?.score ?? "-")}</span>
    </div>
    <div class="style-score-grid">${rows
      .map((row) => `<article>
        <div class="row">
          <h4>${escapeHtml(row.name || row.nameZh || row.id)}</h4>
          <span class="tag ${row.score >= 75 ? "green" : row.score >= 58 ? "amber" : ""}">${escapeHtml(row.label || row.ratingZh || "")} · ${escapeHtml(row.score ?? "-")}</span>
        </div>
        <p>${escapeHtml(row.thesis || row.viewZh || "")}</p>
        ${(row.evidence || row.positivesZh || []).length ? `<ul>${(row.evidence || row.positivesZh || []).slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
      </article>`)
      .join("")}</div>
    <p class="muted">${escapeHtml(card.note || card.disclaimerZh || "评分只做研究归纳，不构成投资建议。")}</p>
  </div>`;
}

function factorLayerTickerBlock(row) {
  if (!row) return empty("暂无单股因子评分。");
  const factors = row.factorScores || {};
  const factorRows = [
    ["趋势动量", factors.momentum],
    ["质量增长", factors.qualityGrowth],
    ["估值合理性", factors.valuation],
    ["情绪催化", factors.sentimentCatalyst],
    ["风险约束", factors.riskControl],
  ];
  return `<div class="factor-layer-card">
    <div class="row">
      <strong>${escapeHtml(row.ratingZh || "因子评分")}</strong>
      <span class="tag ${row.totalScore >= 75 ? "green" : row.totalScore >= 62 ? "amber" : ""}">总分 ${escapeHtml(row.totalScore ?? "-")}</span>
    </div>
    <p>${escapeHtml(row.actionZh || "")}</p>
    <div class="factor-mini-grid">${factorRows
      .map(([label, value]) => indicator(label, value ?? "-"))
      .join("")}</div>
    ${(row.evidence || []).length ? `<ul>${row.evidence.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    ${(row.warnings || []).length ? `<p class="muted">缺口：${escapeHtml(row.warnings.join("；"))}</p>` : ""}
  </div>`;
}

function tradeMemoryBlock(memory) {
  if (!memory) return empty("暂无交易记忆。");
  const shortTerm = memory.shortTermMemory || [];
  const events = memory.eventMemory || [];
  const patterns = memory.mistakePatterns || [];
  const rules = memory.longTermRules || [];
  const summary = memory.summaryZh || "暂无交易记忆摘要。";
  return `<div class="trade-memory">
    <div class="trade-memory-head">
      <strong>${escapeHtml(summary)}</strong>
      <span class="tag">${escapeHtml(memory.provider || "local")}</span>
    </div>
    <div class="trade-memory-grid">
      <article>
        <h4>短期记忆</h4>
        ${shortTerm.length ? `<ul>${shortTerm.slice(0, 4).map((item) => `<li>${escapeHtml(item.summaryZh || "")}</li>`).join("")}</ul>` : empty("暂无近期操作。")}
      </article>
      <article>
        <h4>事件记忆</h4>
        ${events.length ? `<ul>${events.slice(0, 4).map((item) => `<li>${escapeHtml(item.summaryZh || "")}</li>`).join("")}</ul>` : empty("暂无平仓/事件样本。")}
      </article>
      <article>
        <h4>错误模式</h4>
        ${patterns.length ? `<ul>${patterns.slice(0, 4).map((item) => `<li>${escapeHtml(item.summaryZh || item.title || "")}</li>`).join("")}</ul>` : empty("暂无明显错误模式。")}
      </article>
      <article>
        <h4>长期规则</h4>
        ${rules.length ? `<ul>${rules.slice(0, 4).map((item) => `<li>${escapeHtml(item.ruleZh || item.title || "")}</li>`).join("")}</ul>` : empty("暂无长期规则。")}
      </article>
    </div>
    ${memory.reviewQuestions?.length ? `<div class="trade-memory-questions"><strong>复盘问题</strong><ul>${memory.reviewQuestions.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
    ${memory.caveat ? `<p class="muted">${escapeHtml(memory.caveat)}</p>` : ""}
  </div>`;
}

function agentDebateBlock(debate) {
  const legacyItems = Array.isArray(debate) ? debate : [];
  if (legacyItems.length) {
    return `<div class="report-links">${legacyItems
      .map(
        (item) => `<article>
          <div class="row">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="tag ${item.stance === "积极" ? "green" : item.stance === "谨慎" ? "red" : "amber"}">${escapeHtml(item.stance)} · ${escapeHtml(item.confidence)}</span>
          </div>
          <p>${escapeHtml(item.view || "")}</p>
        </article>`,
      )
      .join("")}</div>`;
  }
  const agents = debate?.agents || [];
  if (!agents.length) return empty("暂无 Agent 观点。");
  const decision = debate.finalDecision || {};
  return `<div class="agent-debate">
    <div class="agent-debate-head">
      <div>
        <strong>${escapeHtml(decision.action || "多 Agent 合议")}</strong>
        <p class="muted">${escapeHtml(debate.framework || "本地多角色投研会议纪要。")}</p>
      </div>
      <span class="tag ${decision.riskVeto ? "red" : "green"}">置信 ${escapeHtml(decision.confidence ?? "-")}</span>
    </div>
    <div class="agent-debate-grid">${agents
      .map((item) => `<article>
        <div class="row">
          <h4>${escapeHtml(item.name)}</h4>
          <span class="tag ${item.stance === "积极" || item.stance === "可继续研究" ? "green" : item.stance === "谨慎" || item.stance === "证据不足" ? "red" : "amber"}">${escapeHtml(item.stance)} · ${escapeHtml(item.confidence)}</span>
        </div>
        <p>${escapeHtml(item.view || "")}</p>
        ${(item.evidence || []).length ? `<ul>${item.evidence.slice(0, 3).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
      </article>`)
      .join("")}</div>
    <div class="debate-rounds">${(debate.debateRounds || [])
      .map((round) => `<article>
        <strong>${escapeHtml(round.title || round.speaker || "")}</strong>
        <span class="tag">${escapeHtml(round.stance || "")}</span>
        <p>${escapeHtml(round.argument || "")}</p>
      </article>`)
      .join("")}</div>
    ${(decision.rationale || []).length ? `<div class="decision-actions"><h4>最终依据</h4><ul>${decision.rationale.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
  </div>`;
}

function timelineBlock(items) {
  if (!items.length) return empty("暂无事件时间线。");
  return `<div class="report-links">${items
    .slice(0, 8)
    .map(
      (item) => `<article>
        <div class="row">
          <strong>${escapeHtml(item.type)}</strong>
          <span class="tag">${escapeHtml(directionLabel(item.direction))}</span>
        </div>
        ${
          item.url
            ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "")}</a>`
            : `<strong>${escapeHtml(item.title || "")}</strong>`
        }
        <p>${escapeHtml(item.summary || "")}</p>
        <p class="muted">${escapeHtml(item.time ? fmtTime(item.time) : "")}</p>
      </article>`,
    )
    .join("")}</div>`;
}

function reportLinks(items) {
  return `<div class="report-links">${items
    .map((item) => {
      const title = displayTitle(item);
      const source = sourceLabel(item.publisher || item.source || "");
      const meta = [item.ticker, source, item.publishedAt ? fmtTime(item.publishedAt) : ""]
        .filter(Boolean)
        .join(" · ");
      const summary = displayNewsSummary(item.summaryZh || item.catalyst?.summaryZh || item.catalyst?.summary || "", item);
      const triad = triadFromItem(item, {
        conclusion: item.article?.investmentView || item.catalyst?.investmentView || summary || title,
        evidence: evidenceFromItem(item),
        observation: item.article?.investmentAdvice || item.catalyst?.checks?.[0] || observationFromItem(item),
      });
      const catalystTags = item.catalyst?.themes?.length
        ? `<div class="feed-meta">${newsRelevanceTag(item)}${item.catalyst.themes
            .slice(0, 3)
            .map((theme) => `<span class="tag">${escapeHtml(theme)}</span>`)
            .join("")}<span class="tag">${escapeHtml(directionLabel(item.catalyst.direction))}</span></div>`
        : newsRelevanceTag(item)
          ? `<div class="feed-meta">${newsRelevanceTag(item)}</div>`
        : "";
      return `<article>
        ${
          item.url
            ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
            : `<strong>${escapeHtml(title)}</strong>`
        }
        ${renderInsightTriad(triad)}
        ${catalystTags}
        <p class="muted">${escapeHtml(meta)}</p>
      </article>`;
    })
    .join("")}</div>`;
}

function catalystPackBlock(pack, fallbackItems = []) {
  const items = pack?.items?.length ? pack.items : fallbackItems;
  if (!items.length && !pack?.summary) return empty("暂无相关公司新闻。");
  const packSummary = compactSentence(pack?.summary || "", 190);
  const packWhy = uniqueCompactRows([pack?.whyItMatters || []], 3);
  return `<div class="catalyst-pack">
    ${packSummary ? `<p>${escapeHtml(packSummary)}</p>` : ""}
    ${
      packWhy.length
        ? `<ul>${packWhy
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")}</ul>`
        : ""
    }
    <div class="report-links">${items
      .slice(0, 5)
      .map((item) => {
        const title = displayTitle(item) || item.title || "公司新闻";
        const summary = firstUsefulSentence(item.summary, item.summaryZh, item.catalyst?.summaryZh, item.catalyst?.summary, item.articleSummary);
        const themes = uniqueCompactRows([item.themes || [], item.catalyst?.themes || []], 2);
        const checks = uniqueCompactRows([item.checks || [], item.catalyst?.checks || []], 2);
        const source = sourceLabel(item.source || item.publisher || "");
        const materiality = item.materialityLabel || item.catalyst?.materialityLabel || "";
        const articleSummary = item.articleSummary || "";
        const articleType = item.articleType || "";
        const articleMismatch = item.articleMismatchTicker || (String(item.articleStatus || "").startsWith("mismatch:") ? String(item.articleStatus).split(":")[1] : "");
        const articleKeyData = uniqueCompactRows([item.articleKeyData || [], item.articleEvidence || []], 2);
        const articleInvestmentView = cleanReadableRow(item.articleInvestmentView) || summary || cleanReadableRow(articleSummary);
        const articleInvestmentAdvice = cleanReadableRow(item.articleInvestmentAdvice) || checks[0] || "";
        const articleInvestmentMemo = item.articleInvestmentMemo || null;
        const bullCase = uniqueCompactRows([articleInvestmentMemo?.bullCase || []], 1);
        const bearCase = uniqueCompactRows([articleInvestmentMemo?.bearCase || []], 1);
        const href = item.finalUrl || item.url;
        const triad = triadFromItem(item, {
          conclusion: articleInvestmentView || summary || articleSummary || title,
          evidence: articleKeyData.join("；") || evidenceFromItem(item),
          observation: articleInvestmentAdvice || checks[0] || observationFromItem(item),
        });
        const tags = [
          articleType ? `原文：${articleType}` : "",
          articleMismatch ? `正文错配：${articleMismatch}` : "",
          materiality,
          directionLabel(item.direction || item.catalyst?.direction),
          ...themes,
        ].filter(Boolean);
        return `<article>
          ${
            href
              ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
              : `<strong>${escapeHtml(title)}</strong>`
          }
          ${renderInsightTriad(triad)}
          ${
            bullCase.length || bearCase.length
              ? `<div class="article-memo-grid compact">
                  ${
                    bullCase.length
                      ? `<section><h4>看多依据</h4><ul>${bullCase.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>`
                      : ""
                  }
                  ${
                    bearCase.length
                      ? `<section><h4>风险</h4><ul>${bearCase.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>`
                      : ""
                  }
                </div>`
              : ""
          }
          ${
            tags.length
              ? `<div class="feed-meta">${tags
                  .slice(0, 5)
                  .map((tag) => `<span class="tag ${item.lowSignal && tag === materiality ? "amber" : ""}">${escapeHtml(tag)}</span>`)
                  .join("")}</div>`
              : ""
          }
          <p class="muted">${escapeHtml([source, item.publishedAt ? fmtTime(item.publishedAt) : ""].filter(Boolean).join(" · "))}</p>
        </article>`;
      })
      .join("")}</div>
  </div>`;
}

function directionLabel(value) {
  if (value === "positive") return "偏正面";
  if (value === "negative") return "偏负面";
  if (value === "mixed") return "多空混合";
  return "待判断";
}

function secReportLinks(items) {
  return `<div class="report-links">${items
    .map((item) => {
      const insight = item.secInsight || {};
      const title = `${tickerLabel(item.ticker, { ...item, run: appState?.latest })} ${insight.eventTitleZh || insight.formZh || item.form || "SEC 文件"} · ${fmtTime(item.publishedAt)}`;
      const topics = insight.topics || [];
      const sections = insight.sections || [];
      const itemNumbers = insight.itemNumbers || [];
      const findings = insight.keyFindings || [];
      const triad = triadFromItem(item, {
        conclusion: insight.eventTitleZh || insight.summaryZh || title,
        evidence: findings.length ? findings.join("；") : sections[0] || evidenceFromItem(item),
        observation: insight.actionChecks?.[0] || "看 Item 编号、附件条款和公司后续 8-K/10-Q 是否补充财务影响。",
      });
      return `<article>
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>
        ${renderInsightTriad(triad)}
        ${
          topics.length || itemNumbers.length
            ? `<div class="feed-meta">${itemNumbers
                .slice(0, 4)
                .map((num) => `<span class="tag">Item ${escapeHtml(num)}</span>`)
                .join("")}${topics
                .slice(0, 4)
                .map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`)
                .join("")}</div>`
            : ""
        }
        ${findings.length ? `<ul class="compact-list">${findings.slice(0, 3).map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>` : ""}
        ${secExhibitList(insight.exhibits || [])}
        ${sections.length ? `<p class="muted">${escapeHtml(`原文片段：${sections[0].slice(0, 180)}`)}</p>` : ""}
      </article>`;
    })
    .join("")}</div>`;
}

function secExhibitList(exhibits) {
  if (!exhibits?.length) return "";
  return `<div class="sec-exhibits">
    ${exhibits
      .slice(0, 3)
      .map(
        (exhibit) => `<article>
          <a href="${escapeHtml(exhibit.url || "")}" target="_blank" rel="noreferrer">${escapeHtml(
            exhibit.document || "Exhibit",
          )}</a>
          ${exhibit.summary ? `<p>${escapeHtml(exhibit.summary)}</p>` : ""}
          ${(exhibit.findings || []).length ? `<ul class="compact-list">${exhibit.findings.slice(0, 2).map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}</ul>` : ""}
        </article>`,
      )
      .join("")}
  </div>`;
}

function renderDiscovery(run) {
  const candidates = run?.discovery?.candidates || [];
  if (!candidates.length) {
    els.discoveryGrid.innerHTML = empty("暂无候选。运行采集后显示。");
    return;
  }
  els.discoveryGrid.innerHTML = prioritizeWatchlist(candidates)
    .slice(0, 8)
    .map(
      (item) => `<article class="discovery-card">
        <div class="row">
          <h3>${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</h3>
          <span class="tag ${item.category === "hot" ? "red" : item.category === "watch" ? "amber" : "green"}">${escapeHtml(categoryLabel(item.category))} · ${escapeHtml(item.score)}</span>
        </div>
        <p class="muted">价格 ${fmtNumber(item.latestPrice)} · 变动 ${fmtNumber(item.changePercent, 1)}%</p>
        <div class="feed-meta">${(item.reasons || [])
          .slice(0, 5)
          .map((reason) => `<span class="tag">${escapeHtml(reason)}</span>`)
          .join("")}</div>
      </article>`,
    )
    .join("");
}

function renderSocialRankCard(item, badgeText = "", run = null) {
  return `<article class="social-card">
    <div class="row">
      <h3>${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</h3>
      ${badgeText ? `<span class="tag">${escapeHtml(badgeText)}</span>` : ""}
      <span class="tag ${item.category === "hot" ? "red" : item.category === "watch" ? "amber" : "green"}">${escapeHtml(categoryLabel(item.category))} · ${escapeHtml(item.score)}</span>
    </div>
    <p class="muted">${escapeHtml(socialMetaLine(item))}</p>
    <div class="feed-meta">
      ${Number.isFinite(item.trendScore) ? `<span class="tag red">上升分 ${escapeHtml(item.trendScore)}</span>` : ""}
      ${Number.isFinite(item.mentionMove) && item.mentionMove !== 0 ? `<span class="tag">24h 提及 ${item.mentionMove > 0 ? "+" : ""}${escapeHtml(item.mentionMove)}</span>` : ""}
      ${Number.isFinite(item.rankMove) && item.rankMove !== 0 ? `<span class="tag">24h 排名 ${item.rankMove > 0 ? "+" : ""}${escapeHtml(item.rankMove)}</span>` : ""}
    </div>
    ${socialInsightBlock(item)}
    <div class="social-posts">${(item.topPosts || [])
      .slice(0, 3)
      .map(
        (post) => `<a href="${escapeHtml(post.url)}" target="_blank" rel="noreferrer">${escapeHtml(
          post.title,
        )}</a>`,
      )
      .join("")}</div>
  </article>`;
}

function clientSocialSourceKey(value = "") {
  const text = String(value || "").toLowerCase();
  if (text.includes("longbridge") && (text.includes("异动") || text.includes("top mover"))) return "Longbridge 异动榜";
  if (text.includes("longbridge")) return "Longbridge 热度榜";
  if (text.includes("trendradar") || text.includes("newsnow")) return "TrendRadar/NewsNow";
  if (text.includes("apewisdom")) return "ApeWisdom Reddit 热议榜";
  if (text.includes("stocktwits")) return "Stocktwits 热门讨论";
  if (text.includes("reddit")) return "Reddit 热门讨论";
  if (text.includes("小红书") || text.includes("xhs")) return "小红书";
  if (text.includes("nitter")) return "Nitter RSS";
  if (text === "x" || text.includes("x recent search")) return "X 实时搜索";
  if (text.includes("custom")) return "自定义社交源";
  if (text.includes("openbb")) return "OpenBB 发现榜";
  return value || "其他社交源";
}

function clientSocialSourceBoards(run) {
  const ranked = run?.socialHotStocks?.rising?.length
    ? run.socialHotStocks.rising
    : run?.socialHotStocks?.candidates || [];
  if (!ranked.length) return [];
  const counts = new Map();
  for (const post of run?.socialPosts || []) {
    const key = clientSocialSourceKey(post.source || post.publisher || post.channel || post.subreddit || "");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const boards = new Map();
  for (const item of ranked) {
    const labels = (item.sources?.length ? item.sources : item.subreddits || []).map(clientSocialSourceKey);
    for (const label of labels.length ? labels : ["其他社交源"]) {
      if (!boards.has(label)) boards.set(label, { key: label, label, source: label, count: counts.get(label) || 0, candidates: [] });
      const board = boards.get(label);
      if (!board.candidates.some((row) => row.ticker === item.ticker)) board.candidates.push(item);
    }
  }
  return [...boards.values()]
    .map((board) => ({
      ...board,
      candidates: board.candidates.sort((a, b) => (b.trendScore || b.score || 0) - (a.trendScore || a.score || 0)).slice(0, 12),
      rising: board.candidates.sort((a, b) => (b.trendScore || 0) - (a.trendScore || 0)).slice(0, 12),
    }))
    .filter((board) => board.candidates.length);
}

function renderTrendTopicCard(item = {}) {
  return `<article class="social-card topic-card">
    <div class="row">
      <h3>${escapeHtml(item.title || "热点")}</h3>
      <span class="tag">${escapeHtml(item.sourceName || item.sourceId || "TrendRadar")}</span>
    </div>
    <div class="feed-meta">
      ${Number.isFinite(item.rank) ? `<span class="tag">#${escapeHtml(item.rank)}</span>` : ""}
      ${(item.marketTags || []).slice(0, 3).map((tag) => `<span class="tag amber">${escapeHtml(tag)}</span>`).join("")}
      ${(item.relatedTickers || []).slice(0, 4).map((ticker) => `<span class="tag">${escapeHtml(tickerLabel(ticker, { run: appState?.latest }))}</span>`).join("")}
      <span>${fmtTime(item.publishedAt)}</span>
    </div>
    ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">查看来源</a>` : ""}
  </article>`;
}

function trendTopicSections(run = {}) {
  const general = run.generalHotTopics || [];
  const market = run.marketHotTopics || [];
  if (!general.length && !market.length) return "";
  return `<details class="social-source-board social-source-fold">
    <summary class="social-source-head">
      <div>
        <p class="section-label">TrendRadar / NewsNow</p>
        <h3>社交热议（非股票）</h3>
      </div>
      <span class="tag">${escapeHtml(general.length)} 条</span>
    </summary>
    <div class="social-board-grid">${general.length ? general.map(renderTrendTopicCard).join("") : empty("暂无非股票泛热点。")}</div>
  </details>
  <details class="social-source-board social-source-fold">
    <summary class="social-source-head">
      <div>
        <p class="section-label">Market Topics</p>
        <h3>美股/全球市场热议主题</h3>
      </div>
      <span class="tag amber">${escapeHtml(market.length)} 条</span>
    </summary>
    <div class="social-board-grid">${market.length ? market.map(renderTrendTopicCard).join("") : empty("暂无市场主题热点。")}</div>
  </details>`;
}

function renderSocial(run) {
  const sourceBoards = run?.socialHotStocks?.sourceBoards?.length
    ? run.socialHotStocks.sourceBoards
    : clientSocialSourceBoards(run);
  const topicSections = trendTopicSections(run || {});
  if (sourceBoards.length) {
    const totalCandidates = sourceBoards.reduce((sum, board) => {
      const rows = board.rising?.length ? board.rising : board.candidates || [];
      return sum + rows.length;
    }, 0);
    els.socialGrid.innerHTML = `${topicSections}<article class="social-card social-summary">
      <div class="row">
        <h3>分来源排行榜</h3>
        <span class="tag red">Source Boards</span>
      </div>
      <p>${escapeHtml(`当前保留 ${sourceBoards.length} 个来源榜，候选 ${totalCandidates} 个；各榜单单独排序，不再让 Longbridge、ApeWisdom、Stocktwits 等互相挤掉。`)}</p>
      <p class="muted">每个来源内部仍会用新闻正文、关键词、公司画像、行情和技术面解释“为什么热”；综合榜只作为兼容数据保留。</p>
    </article>${sourceBoards
      .map((board, boardIndex) => {
        const rows = board.rising?.length ? board.rising : board.candidates || [];
        return `<details class="social-source-board social-source-fold" ${boardIndex === 0 ? "open" : ""}>
          <summary class="social-source-head">
            <div>
              <p class="section-label">${escapeHtml(board.label || board.source || "社交来源")}</p>
              <h3>${escapeHtml(board.label || board.source || "社交来源")}</h3>
            </div>
            <div class="feed-meta">
              <span class="tag">${escapeHtml(board.count || 0)} 条材料</span>
              <span class="tag amber">${escapeHtml(rows.length)} 个候选</span>
            </div>
          </summary>
          <div class="social-board-grid">
            ${rows.map((item, index) => renderSocialRankCard(item, `#${index + 1}`, run)).join("")}
          </div>
        </details>`;
      })
      .join("")}`;
    return;
  }
  const ranked = run?.socialHotStocks?.rising?.length
    ? run.socialHotStocks.rising
    : run?.socialHotStocks?.candidates || [];
  if (!ranked.length) {
    els.socialGrid.innerHTML = topicSections || empty("暂无社交热议股票。运行采集后会读取 Reddit、X、小红书、Stocktwits 或自定义社交源。");
    return;
  }
  const allMarket = ranked.filter((item) => item.discoveryScope === "all-market");
  const watchlist = ranked.filter((item) => item.discoveryScope !== "all-market");
  const candidates = [...allMarket, ...watchlist];
  const pageData = longListPage("social", candidates, 8);
  const sourceText = [
    allMarket.length ? `全市场新机会 ${allMarket.length} 个` : "暂无全市场新机会",
    watchlist.length ? `自选池补充 ${watchlist.length} 个` : "",
    run?.socialTrendTickers?.length ? `已临时扩展研究池 ${run.socialTrendTickers.length} 个 ticker` : "",
  ].filter(Boolean).join(" · ");
  els.socialGrid.innerHTML = `${topicSections}<article class="social-card social-summary">
      <div class="row">
        <h3>全市场热度上升优先</h3>
        <span class="tag red">Rising</span>
      </div>
      <p>${escapeHtml(sourceText)}</p>
      <p class="muted">排序优先看 24h 提及变化、排名变化、跨社区热度，再用新闻原文、基本面、技术面和行业画像解释“为什么热”。</p>
    </article>${pageData.items
    .map(
      (item) => renderSocialRankCard(item, item.discoveryScope === "all-market" ? "全市场" : "自选池", run),
    )
    .join("")}${renderListPagination("social", candidates.length, pageData.page, pageData.pageCount)}`;
}

function actionSuggestionTypeClass(type = "", action = "") {
  if (type === "候选买入" || action === "买入") return "green";
  if (type === "风险处理" || type === "回避" || action === "卖出") return "red";
  if (type === "等待触发") return "amber";
  return "";
}

function actionSuggestionMetric(value, label, digits = 0) {
  const display = Number.isFinite(value) ? fmtNumber(value, digits) : "-";
  return `<div class="action-suggestion-metric"><strong>${escapeHtml(display)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function actionSuggestionList(title, rows = []) {
  const items = (rows || []).filter(Boolean).slice(0, 4);
  if (!items.length) return "";
  return `<div class="action-suggestion-list"><h4>${escapeHtml(title)}</h4><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></div>`;
}

function renderActionSuggestionCard(item = {}, run = null) {
  const typeClass = actionSuggestionTypeClass(item.operationType, item.action);
  const priceLine = item.quote
    ? `价格 ${fmtNumber(item.quote.price, 2)} · ${pctLabel(item.quote.changePercent)} · ${item.quote.provider || "行情"}`
    : "暂无有效价格";
  const pools = item.poolLabels || [];
  const positionLine = item.position
    ? `持仓 ${fmtNumber(item.position.weight, 1)}% · 盈亏 ${pctLabel(item.position.pnlPercent)}`
    : "无持仓记录";
  return `<article class="action-suggestion-card">
    <div class="action-suggestion-head">
      <div>
        <button class="link-button ticker-link" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</button>
        <p class="muted">${escapeHtml(tickerNameLine(item.ticker, { ...item, run }))}</p>
      </div>
      <div class="feed-meta">
        <span class="tag ${typeClass}">${escapeHtml(item.operationType || item.action || "观察")}</span>
        <span class="tag ${advisorActionClass(item.action)}">${escapeHtml(item.action || "持有")}</span>
        ${item.gateAdjusted ? `<span class="tag red">风控调整</span>` : ""}
      </div>
    </div>
    <p>${escapeHtml(item.stance || item.oneLine || "暂无完整结论。")}</p>
    <div class="action-suggestion-metrics">
      ${actionSuggestionMetric(item.priority, "优先级")}
      ${actionSuggestionMetric(item.score, "综合分")}
      ${actionSuggestionMetric(item.confidenceScore, "置信")}
      ${actionSuggestionMetric(item.dataCoverage, "覆盖")}
    </div>
    <div class="feed-meta">
      ${pools.map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join("")}
      <span>${escapeHtml(priceLine)}</span>
      <span>${escapeHtml(positionLine)}</span>
    </div>
    <p class="muted">${escapeHtml(item.technicalLine || "")}</p>
    <div class="action-suggestion-detail-grid">
      ${actionSuggestionList("触发条件", item.entryTriggers)}
      ${actionSuggestionList("失效/退出", item.exitTriggers)}
      ${actionSuggestionList("核心理由", item.reasons)}
      ${actionSuggestionList("风险", item.risks)}
    </div>
    ${(item.sourceHints || []).length ? `<div class="action-source-hints">${item.sourceHints
      .slice(0, 3)
      .map((hint) => `<p>${escapeHtml(hint)}</p>`)
      .join("")}</div>` : ""}
  </article>`;
}

function renderActionSuggestionSection(title, subtitle, rows = [], run = null, options = {}) {
  return `<details class="action-suggestion-section agent-disclosure" ${options.open === false ? "" : "open"}>
    <summary class="social-source-head">
      <div>
        <p class="section-label">${escapeHtml(subtitle)}</p>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <span class="tag">${escapeHtml(rows.length)} 个</span>
    </summary>
    <div class="action-suggestion-grid">${rows.length ? rows.map((item) => renderActionSuggestionCard(item, run)).join("") : empty("暂无。")}</div>
  </details>`;
}

function actionSuggestionGroupKey(item = {}) {
  if (item.operationType === "候选买入") return "buy";
  if (item.operationType === "等待触发") return "wait";
  if (item.operationType === "风险处理" || item.operationType === "回避") return "risk";
  return "idle";
}

function actionSuggestionViewModel(suggestions = {}) {
  const groupedRows = Object.values(suggestions.groups || {}).flat();
  const sourceRows = suggestions.candidates?.length ? suggestions.candidates : groupedRows;
  const seen = new Set();
  const rows = sourceRows.filter(Boolean).filter((item, index) => {
    const key = normalizeTickerSymbol(item.ticker) || `${item.operationType || "unknown"}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const groups = { buy: [], wait: [], risk: [], idle: [] };
  rows.forEach((item) => groups[actionSuggestionGroupKey(item)].push(item));
  return {
    rows,
    groups,
    summary: {
      total: rows.length,
      buy: groups.buy.length,
      wait: groups.wait.length,
      risk: groups.risk.length,
      idle: groups.idle.length,
    },
  };
}

function renderActionSuggestions(run) {
  if (!els.actionSuggestionsBox) return;
  const suggestions = run?.actionSuggestions;
  if (!run) {
    els.actionSuggestionsBox.className = "action-suggestions-box empty-state";
    els.actionSuggestionsBox.innerHTML = "暂无报告。先运行一次采集。";
    return;
  }
  if (run.summaryOnly) {
    els.actionSuggestionsBox.className = "action-suggestions-box empty-state";
    els.actionSuggestionsBox.innerHTML = "正在加载历史报告详情，稍后显示操作建议。";
    return;
  }
  const view = actionSuggestionViewModel(suggestions || {});
  if (!view.rows.length) {
    els.actionSuggestionsBox.className = "action-suggestions-box empty-state";
    els.actionSuggestionsBox.innerHTML = "当前没有可排序的操作建议。请先运行采集，或在自选股里加入标的。";
    return;
  }
  const { groups, summary } = view;
  els.actionSuggestionsBox.className = "action-suggestions-box";
  els.actionSuggestionsBox.innerHTML = `<div class="action-suggestion-hero">
      <div>
        <p class="section-label">Action Desk</p>
        <h3>从自选股和重点股票池筛选可操作标的</h3>
        <p class="muted">${escapeHtml(suggestions.universe?.note || "排序优先自选股，并结合重点股票池、因子候选和社交异动。")}</p>
      </div>
      <div class="action-suggestion-metrics action-suggestion-summary-metrics">
        ${actionSuggestionMetric(summary.total, "总数")}
        ${actionSuggestionMetric(summary.buy, "候选买入")}
        ${actionSuggestionMetric(summary.wait, "等待触发")}
        ${actionSuggestionMetric(summary.risk, "风险处理")}
        ${actionSuggestionMetric(summary.idle, "观察/暂不操作")}
      </div>
    </div>
    ${renderActionSuggestionSection("优先操作", "候选买入", groups.buy || [], run, { open: Boolean(groups.buy?.length) })}
    ${renderActionSuggestionSection("等待触发", "持有但接近条件", groups.wait || [], run, { open: false })}
    ${renderActionSuggestionSection("风险处理", "卖出/回避", groups.risk || [], run, { open: Boolean(groups.risk?.length) })}
    ${renderActionSuggestionSection("暂不操作", "低优先级", groups.idle || [], run, { open: false })}
    <p class="muted">${escapeHtml(suggestions.disclaimer || "")}</p>`;
}

function allStockAgentMetric(value, label, digits = 0) {
  const display = Number.isFinite(value) ? fmtNumber(value, digits) : "-";
  return `<div class="all-stock-agent-metric"><strong>${escapeHtml(display)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderAgentRuleHits(rules = []) {
  const rows = (rules || []).slice(0, 4);
  if (!rows.length) return `<p class="muted">未命中明确规则。</p>`;
  return `<ul class="agent-rule-list">${rows
    .map((rule) => `<li><strong>${escapeHtml(rule.label || rule.id)}</strong><span>${escapeHtml(rule.evidence || "")}</span></li>`)
    .join("")}</ul>`;
}

function renderRecommendationFactorStrip(item = {}) {
  const score = item.recommendationScore || {};
  const positives = score.topPositiveFactors || [];
  const risks = score.topRiskFactors || [];
  const rows = [
    ...positives.map((factor) => ({ ...factor, kind: "positive" })),
    ...risks.map((factor) => ({ ...factor, kind: "risk" })),
  ].slice(0, 6);
  if (!rows.length) return "";
  return `<div class="recommendation-factor-strip">
    <div class="recommendation-factor-title">
      <strong>因子贡献</strong>
      <span class="muted">Top 正向/风险</span>
    </div>
    ${rows.map((factor) => {
      const contribution = Number(factor.contribution);
      const quality = Number(factor.quality);
      const width = Math.min(100, Math.max(8, Math.abs(contribution) * 16 + 12));
      return `<div class="recommendation-factor-row ${factor.kind}">
        <span>${escapeHtml(factor.label || factor.id || "")}</span>
        <div class="recommendation-factor-bar"><i style="width:${escapeHtml(width)}%"></i></div>
        <b>${escapeHtml(Number.isFinite(contribution) ? fmtNumber(contribution, 1) : "-")}</b>
        <em>Q${escapeHtml(Number.isFinite(quality) ? fmtNumber(quality, 0) : "-")}</em>
      </div>`;
    }).join("")}
  </div>`;
}

function renderDecisionDataQuality(item = {}) {
  const audit = item.dataQualityAudit || {};
  const weak = audit.weakestBlocks || [];
  if (!weak.length) return "";
  return `<div class="decision-quality-audit">
    <strong>数据缺口</strong>
    ${weak.slice(0, 3).map((block) => `<span class="tag ${block.status === "missing" ? "red" : "amber"}">${escapeHtml(block.label || block.key)} Q${escapeHtml(fmtNumber(Number(block.qualityScore), 0))}</span>`).join("")}
  </div>`;
}

function renderDecisionStorylines(item = {}) {
  const stories = item.newsStorylines || item.factorSnapshot?.newsStorylines || [];
  if (!stories.length) return "";
  return `<div class="decision-storylines">
    ${stories.slice(0, 2).map((story) => `<p><strong>${escapeHtml(story.label || "新闻")}</strong> ${escapeHtml(story.summary || "")}</p>`).join("")}
  </div>`;
}

function renderAllStockAgentDecision(item = {}, type = "buy", run = null) {
  const action = item.action || (type === "buy" ? "买入" : "卖出");
  const tagClass = advisorActionClass(action);
  const price = Number.isFinite(item.price) ? `$${fmtNumber(item.price, 2)}` : "价格缺失";
  const score = Number.isFinite(item.score) ? fmtNumber(item.score, 0) : "-";
  const confidence = Number.isFinite(item.confidence) ? fmtNumber(item.confidence, 0) : "-";
  const alphaScore = Number.isFinite(item.alphaScore) ? fmtNumber(item.alphaScore, 0) : "";
  const actionScore = Number.isFinite(item.actionScore) ? fmtNumber(item.actionScore, 0) : "";
  const dataQualityScore = Number.isFinite(item.dataQualityScore) ? fmtNumber(item.dataQualityScore, 0) : "";
  return `<article class="all-stock-agent-card ${type}">
    <div class="all-stock-agent-card-head">
      <div>
        <button class="link-button" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</button>
        <span class="muted">${escapeHtml(item.name || "")}</span>
      </div>
      <span class="tag ${tagClass}">${escapeHtml(action)} · ${escapeHtml(score)}</span>
    </div>
    <div class="feed-meta">
      <span>${escapeHtml(price)}</span>
      <span>置信 ${escapeHtml(confidence)}</span>
      ${alphaScore ? `<span>Alpha ${escapeHtml(alphaScore)}</span>` : ""}
      ${actionScore ? `<span>Action ${escapeHtml(actionScore)}</span>` : ""}
      ${dataQualityScore ? `<span>数据 ${escapeHtml(dataQualityScore)}</span>` : ""}
      ${(item.pools || []).slice(0, 3).map((pool) => `<span class="tag">${escapeHtml(pool)}</span>`).join("")}
    </div>
    <p>${escapeHtml(item.thesis || item.advisorStance || "")}</p>
    ${renderRecommendationFactorStrip(item)}
    ${renderDecisionStorylines(item)}
    ${renderDecisionDataQuality(item)}
    ${renderAgentRuleHits(item.matchedRules)}
    ${(item.gates || []).length ? `<div class="agent-gates">${(item.gates || []).slice(0, 3).map((gate) => `<span class="tag red">${escapeHtml(gate.label)}</span>`).join("")}</div>` : ""}
  </article>`;
}

function renderAllStockAgentHold(item = {}, run = null) {
  const ret = Number.isFinite(item.positionReturnPct) ? `${fmtNumber(item.positionReturnPct, 1)}%` : "-";
  return `<article class="all-stock-agent-card hold">
    <div class="all-stock-agent-card-head">
      <div>
        <button class="link-button" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</button>
        <span class="muted">${escapeHtml(item.name || "")}</span>
      </div>
      <span class="tag amber">继续观察</span>
    </div>
    <div class="feed-meta">
      <span>买分 ${escapeHtml(item.buyScore ?? "-")}</span>
      <span>卖分 ${escapeHtml(item.sellScore ?? "-")}</span>
      <span>收益 ${escapeHtml(ret)}</span>
    </div>
    <p>${escapeHtml(item.thesis || "")}</p>
    ${renderRecommendationFactorStrip(item)}
    ${renderDecisionDataQuality(item)}
    ${renderAgentRuleHits(item.matchedBuyRules)}
  </article>`;
}

function renderAllStockAgentReview(review = {}, run = null) {
  const perf = Number.isFinite(review.performancePct) ? `${fmtNumber(review.performancePct, 1)}%` : "-";
  const reviewTone = review.outcome === "命中" ? "green" : review.outcome === "待核验" ? "amber" : "red";
  return `<div class="all-stock-agent-review-row">
    <button class="link-button" type="button" data-open-stock-report="${escapeHtml(review.ticker)}">${escapeHtml(tickerLabel(review.ticker, { ...review, run }))}</button>
    <span class="tag ${reviewTone}">${escapeHtml(review.outcome || "")}</span>
    <span>${escapeHtml(review.action || "")}</span>
    <span>${escapeHtml(perf)}</span>
    <span class="muted">${escapeHtml(fmtNumber(review.ageDays || 0, 1))} 天</span>
  </div>`;
}

function renderAllStockAgentTrackRecord(latest = {}) {
  const allSnapshots = (latest.outcomeSnapshots || []).filter((item) => item.outcome && item.outcome !== "pending");
  const snapshots = allSnapshots.filter((item) => {
    if (item.outcomeQualityStatus === "suspect_price" || item.outcomeUsable === false) return false;
    const horizon = Number(item.horizonDays);
    const rawReturn = Number(item.performancePct ?? item.rawReturnPct);
    return !(Number.isFinite(horizon) && horizon <= 10 && Number.isFinite(rawReturn) && Math.abs(rawReturn) > 50);
  });
  const quarantinedCount = allSnapshots.length - snapshots.length;
  const paper = latest.paperBook || {};
  const paperSummary = paper.summary || {};
  const byHorizon = new Map();
  for (const row of snapshots) {
    const key = Number(row.horizonDays) || 0;
    const bucket = byHorizon.get(key) || { horizonDays: key, samples: 0, wins: 0, flats: 0, totalExcess: 0 };
    const excess = Number(row.excessPct ?? row.performancePct);
    if (Number.isFinite(excess)) {
      bucket.samples += 1;
      bucket.wins += row.outcome === "win" ? 1 : 0;
      bucket.flats += row.outcome === "flat" ? 1 : 0;
      bucket.totalExcess += excess;
    }
    byHorizon.set(key, bucket);
  }
  const horizonRows = [...byHorizon.values()]
    .filter((row) => row.samples)
    .sort((a, b) => a.horizonDays - b.horizonDays);
  const fmtMoney = (value) => Number.isFinite(value) ? `$${fmtNumber(value, 0)}` : "-";
  const fmtPct = (value, digits = 1) => Number.isFinite(value) ? `${fmtNumber(value, digits)}%` : "-";
  const totalPnl = Number(paperSummary.totalPnl);
  const winRate = Number(paperSummary.winRate);
  const openPositions = paper.openPositions || [];
  const closedTrades = paper.closedTrades || [];
  const factorRows = Object.values(latest.factorStats || {})
    .filter((row) => Number(row.n || row.samples) > 0)
    .sort((a, b) => Math.abs(Number(b.rankIC) || 0) - Math.abs(Number(a.rankIC) || 0) || Number(b.n || b.samples) - Number(a.n || a.samples))
    .slice(0, 6);
  const subSignalRows = factorRows
    .flatMap((factor) => Object.values(factor.subSignals || {}).map((sub) => ({ ...sub, factorLabel: factor.label || factor.id })))
    .filter((row) => Number(row.n || row.samples) > 0)
    .sort((a, b) => Math.abs(Number(b.rankIC) || 0) - Math.abs(Number(a.rankIC) || 0) || Number(b.n || b.samples) - Number(a.n || a.samples))
    .slice(0, 6);
  const correlation = latest.factorCorrelationMatrix || {};
  const highPairs = (correlation.highCorrelationPairs || []).slice(0, 6);
  return `<section class="all-stock-agent-section">
    <div class="social-source-head">
      <div>
        <p class="section-label">Track Record</p>
        <h3>可追责复盘</h3>
      </div>
      <span class="tag">${escapeHtml(snapshots.length)} 个可用 outcome</span>
      ${quarantinedCount ? `<span class="tag amber">${escapeHtml(quarantinedCount)} 个异常样本已隔离</span>` : ""}
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(snapshots.length, "冻结样本")}
      ${allStockAgentMetric(Number(paperSummary.closedTrades), "平仓笔数")}
      ${allStockAgentMetric(Number.isFinite(winRate) ? winRate * 100 : NaN, "纸面胜率", 1)}
      ${allStockAgentMetric(totalPnl, "纸面总盈亏", 0)}
      ${allStockAgentMetric(Number(paperSummary.maxDrawdown), "最大回撤", 0)}
    </div>
    <div class="all-stock-agent-horizons">
      ${horizonRows.length ? horizonRows.map((row) => {
        const avg = row.totalExcess / row.samples;
        const rate = row.wins / row.samples;
        return `<div class="all-stock-agent-horizon">
          <strong>T+${escapeHtml(row.horizonDays)}</strong>
          <span>样本 ${escapeHtml(row.samples)} · 胜率 ${escapeHtml(fmtPct(rate * 100))} · 平均超额 ${escapeHtml(fmtPct(avg))}</span>
        </div>`;
      }).join("") : empty("暂无到期 outcome。需要至少经过 T+1/T+3/T+5/T+10 后才会冻结结果。")}
    </div>
    <details class="agent-disclosure">
      <summary>查看纸面组合与因子统计</summary>
      <div class="all-stock-agent-paper-grid">
      <article class="all-stock-agent-paper-card">
        <h4>纸面组合</h4>
        <div class="mini-kv">
          <span>已实现</span><strong>${escapeHtml(fmtMoney(Number(paperSummary.realizedPnl)))}</strong>
          <span>未实现</span><strong>${escapeHtml(fmtMoney(Number(paperSummary.unrealizedPnl)))}</strong>
          <span>期望/笔</span><strong>${escapeHtml(fmtMoney(Number(paperSummary.expectancy)))}</strong>
          <span>交易 Sharpe</span><strong>${escapeHtml(fmtNumber(Number(paperSummary.tradeSharpe), 2))}</strong>
        </div>
        <p class="muted">${escapeHtml(paper.note || "纸面组合尚未生成。")}</p>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>未平仓</h4>
        <div class="all-stock-agent-mini-list">
          ${openPositions.slice(0, 6).length ? openPositions.slice(0, 6).map((item) => `<div>
            <button class="link-button" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(tickerLabel(item.ticker, { ...item, run: latest }))}</button>
            <span>${escapeHtml(fmtPct(Number(item.returnPct)))}</span>
          </div>`).join("") : `<p class="muted">暂无未平仓纸面持仓。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>最近平仓</h4>
        <div class="all-stock-agent-mini-list">
          ${closedTrades.slice(0, 6).length ? closedTrades.slice(0, 6).map((item) => `<div>
            <button class="link-button" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(tickerLabel(item.ticker, { ...item, run: latest }))}</button>
            <span>${escapeHtml(fmtPct(Number(item.returnPct)))} · ${escapeHtml(item.reason || "")}</span>
          </div>`).join("") : `<p class="muted">暂无已平仓纸面交易。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>因子 IC</h4>
        <div class="all-stock-agent-mini-list">
          ${factorRows.length ? factorRows.map((item) => `<div>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <span>RankIC ${escapeHtml(fmtNumber(Number(item.rankIC), 2))} · n=${escapeHtml(item.n || item.samples || 0)}</span>
          </div>`).join("") : `<p class="muted">暂无因子追责样本。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>子信号 IC</h4>
        <div class="all-stock-agent-mini-list">
          ${subSignalRows.length ? subSignalRows.map((item) => `<div>
            <strong>${escapeHtml(item.factorLabel)} / ${escapeHtml(item.label || item.id)}</strong>
            <span>RankIC ${escapeHtml(fmtNumber(Number(item.rankIC), 2))} · n=${escapeHtml(item.n || item.samples || 0)}</span>
          </div>`).join("") : `<p class="muted">暂无子信号追责样本。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>高相关因子</h4>
        <div class="all-stock-agent-mini-list">
          ${highPairs.length ? highPairs.map((item) => `<div>
            <strong>${escapeHtml(item.left)} / ${escapeHtml(item.right)}</strong>
            <span>ρ ${escapeHtml(fmtNumber(Number(item.rho), 2))} · n=${escapeHtml(item.n || 0)}</span>
          </div>`).join("") : `<p class="muted">暂无 |ρ| > 0.6 的因子对。矩阵样本 n=${escapeHtml(correlation.n || 0)}。</p>`}
        </div>
      </article>
      </div>
    </details>
  </section>`;
}

function renderFactorLifecycleBoard(registry = {}) {
  const factors = Array.isArray(registry?.factors) ? registry.factors : [];
  if (!factors.length) return "";
  const states = [
    ["candidate", "候选"],
    ["shadow", "Shadow"],
    ["active", "Active"],
    ["decayed", "Decayed"],
    ["retired", "Retired"],
    ["rejected", "Rejected"],
  ];
  const fmtPctMaybe = (value) => Number.isFinite(Number(value)) ? fmtNumber(Number(value), 2) : "-";
  const evidenceLine = (factor) => {
    const evidence = factor.evidence?.admission || factor.evidence?.latestAdmission || factor.evidence?.latestDecay || factor.evidence || {};
    const n = evidence.n ?? evidence.samples ?? factor.liveStats?.n ?? factor.liveStats?.samples ?? 0;
    const rankIC = evidence.rankIC ?? factor.liveStats?.rankIC;
    const gate = evidence.status || factor.evidence?.status || "pending";
    return `RankIC ${fmtPctMaybe(rankIC)} · n=${n || 0} · ${gate}`;
  };
  const sparkline = (factor) => {
    const history = Object.values(factor.liveStats?.horizons || factor.evidence?.horizons || {})
      .map((item) => Number(item.rankIC))
      .filter(Number.isFinite)
      .slice(0, 8);
    if (!history.length) return `<span class="factor-spark empty"></span>`;
    const bars = history.map((value) => {
      const height = Math.max(12, Math.min(100, Math.abs(value) * 260));
      const cls = value >= 0 ? "pos" : "neg";
      return `<i class="${cls}" style="height:${escapeHtml(height)}%"></i>`;
    }).join("");
    return `<span class="factor-spark">${bars}</span>`;
  };
  const card = (factor) => {
    const latestPostmortem = (factor.postMortems || [])[0] || null;
    return `<article class="factor-lifecycle-card">
      <div>
        <strong>${escapeHtml(factor.factorId || "")}</strong>
        <span>${escapeHtml(factor.family || "")} · ${escapeHtml(factor.prior || "")}</span>
      </div>
      ${sparkline(factor)}
      <p>${escapeHtml(evidenceLine(factor))}</p>
      <details>
        <summary>Gate evidence</summary>
        <p>${escapeHtml(factor.hypothesis || "")}</p>
        <p>${escapeHtml(factor.researcherProposal?.novelty || factor.evidence?.reason || factor.evidence?.latestAdmission?.source || "")}</p>
        ${latestPostmortem ? `<p>${escapeHtml(latestPostmortem.transferableLesson || latestPostmortem.evidenceShowed || "")}</p>` : ""}
      </details>
    </article>`;
  };
  return `<details class="all-stock-agent-section factor-lifecycle-board agent-disclosure">
    <summary class="social-source-head">
      <div>
        <p class="section-label">Factor Registry</p>
        <h3>因子生命周期看板</h3>
      </div>
      <span class="tag">${escapeHtml(factors.length)} 个因子 · trial ${escapeHtml(registry.trialLedger?.count || 0)}</span>
    </summary>
    <div class="factor-lifecycle-grid">
      ${states.map(([state, label]) => {
        const rows = factors.filter((factor) => factor.state === state).slice(0, 12);
        return `<div class="factor-lifecycle-column">
          <h4>${escapeHtml(label)} <span>${escapeHtml(rows.length)}</span></h4>
          ${rows.length ? rows.map(card).join("") : `<p class="muted">暂无。</p>`}
        </div>`;
      }).join("")}
    </div>
  </details>`;
}

function metricWithN(item = {}, digits = 1, suffix = "") {
  const value = item && typeof item === "object" ? item.value : item;
  const n = item && typeof item === "object" ? Number(item.n || 0) : 0;
  const numeric = value === null || value === undefined || value === "" ? NaN : Number(value);
  const text = Number.isFinite(numeric) ? `${fmtNumber(numeric, digits)}${suffix}` : "-";
  return `${text} · n=${Number.isFinite(n) ? n : 0}`;
}

function todayCallCard(item = {}, type = "research") {
  const isActionable = type === "actionable";
  const title = tickerLabel(item.ticker, { ...item, run: appState?.latest });
  const thesis = item.thesis || item.oneLine || item.reason || item.actionability?.reason || "";
  const gates = (item.actionability?.gates || item.gates || []).slice(0, 3);
  return `<article class="daily-card ${isActionable ? "actionable" : "research"}">
    <div class="daily-card-head">
      <button class="link-button" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">${escapeHtml(title)}</button>
      <span class="tag ${isActionable ? "green" : "amber"}">${escapeHtml(isActionable ? "可执行" : "研究跟踪")}</span>
    </div>
    <div class="feed-meta">
      <span>买分 ${escapeHtml(item.buyScore ?? "-")}</span>
      <span>行动分 ${escapeHtml(item.actionScore ?? "-")}</span>
      <span>DQ ${escapeHtml(item.dataQualityScore ?? "-")}</span>
      <span>${escapeHtml(item.strategyVersion || "")}</span>
    </div>
    <p>${escapeHtml(thesis || "暂无 thesis。")}</p>
    ${gates.length ? `<div class="chip-list">${gates.map((gate) => `<span>${escapeHtml(gate.label || gate.id || "")}</span>`).join("")}</div>` : ""}
    <div class="daily-card-actions">
      <button class="btn compact ghost" type="button" data-open-stock-report="${escapeHtml(item.ticker)}">深挖</button>
      ${isActionable && item.id ? `<button class="btn compact" type="button" data-paper-accept="${escapeHtml(item.id)}">纸面接受</button>` : ""}
    </div>
  </article>`;
}

function renderTodayDesk(today = null) {
  if (!els.todayDeskBox) return;
  if (!today) {
    els.todayDeskBox.className = "daily-loop-box empty-state";
    els.todayDeskBox.textContent = supplementalDataError || "暂无今日推荐数据。";
    return;
  }
  const calls = today.calls || {};
  const actionable = calls.actionable || [];
  const research = calls.research || [];
  const track = today.trackRecord || {};
  const regime = today.regime || {};
  const freshness = today.freshness || {};
  const health = today.health || {};
  const missing = (health.missingData || []).slice(0, 6);
  const stories = (today.stories || []).slice(0, 8);
  els.todayDeskBox.className = "daily-loop-box";
  els.todayDeskBox.innerHTML = `<div class="daily-loop-hero">
    <div>
      <p class="section-label">Daily Loop</p>
      <h3>今日操作台</h3>
      <p class="muted">Agent ${escapeHtml(freshness.agentRunId || "-")} · ${escapeHtml(fmtTime(freshness.agentCompletedAt || freshness.runCompletedAt))}</p>
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(actionable.length, `正式建议 / ${calls.actionableLimit ?? 3}`)}
      ${allStockAgentMetric(research.length, "研究列表")}
      ${allStockAgentMetric(track.sampleCount, "追责样本")}
      ${allStockAgentMetric(track.excludedCount, "剔除异常")}
    </div>
  </div>
  <div class="all-stock-agent-note">
    <strong>Regime</strong>
    <span>${escapeHtml(regime.label || regime.bucket || "unknown")} · 风险分 ${escapeHtml(Number.isFinite(Number(regime.riskScore)) ? fmtNumber(Number(regime.riskScore), 0) : "-")}。</span>
  </div>
  ${today.editorial ? `<div class="all-stock-agent-note"><strong>大盘结论</strong><span>${escapeHtml(today.editorial)}</span></div>` : ""}
  <section class="daily-subsection">
    <div class="social-source-head"><h3>今日可执行</h3><span class="tag">${escapeHtml(actionable.length)} 个</span></div>
    <div class="daily-card-grid">${actionable.length ? actionable.map((item) => todayCallCard(item, "actionable")).join("") : empty("暂无可执行买入；请看研究列表和缺失数据。")}</div>
  </section>
  <details class="daily-subsection agent-disclosure">
    <summary>研究跟踪 / 降级原因</summary>
    <div class="daily-card-grid">${research.length ? research.slice(0, 12).map((item) => todayCallCard(item, "research")).join("") : empty("暂无研究跟踪。")}</div>
  </details>
  <section class="daily-subsection">
    <div class="social-source-head"><h3>重要新闻</h3><span class="tag">${escapeHtml(stories.length)} 条</span></div>
    <div class="daily-news-list">${stories.length ? stories.map((item) => `<article>
      <a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">${escapeHtml(item.title || "未命名新闻")}</a>
      <p>${escapeHtml(item.summary || "暂无摘要。")}</p>
      <div class="feed-meta"><span>${escapeHtml(item.category || "市场")}</span><span>${escapeHtml(item.source || "")}</span><span>${escapeHtml(fmtTime(item.publishedAt))}</span></div>
    </article>`).join("") : empty("暂无重要新闻。")}</div>
  </section>
  <section class="daily-subsection">
    <div class="social-source-head"><h3>健康与缺口</h3><span class="tag ${missing.length ? "amber" : "green"}">${escapeHtml(missing.length ? "需补数据" : "正常")}</span></div>
    ${missing.length ? `<ul class="compact-list">${missing.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p class="muted">未发现前台可见缺口。</p>`}
  </section>`;
}

function renderStockDeepDive(ticker = "") {
  if (!els.stockDeepDiveBox) return;
  const symbol = normalizeTickerInput(ticker || stockDetailTickerFromHash() || els.stockReportInput?.value || "");
  if (!symbol) {
    els.stockDeepDiveBox.className = "deep-dive-box empty-state";
    els.stockDeepDiveBox.textContent = "打开单股详情后显示因子瀑布、数据质量、产业链和决策历史。";
    return;
  }
  if (stockDeepDiveLoading.has(symbol)) {
    els.stockDeepDiveBox.className = "deep-dive-box empty-state";
    els.stockDeepDiveBox.textContent = `${symbol} 证据包读取中...`;
    return;
  }
  const dive = stockDeepDiveCache.get(symbol);
  if (!dive) {
    els.stockDeepDiveBox.className = "deep-dive-box empty-state";
    els.stockDeepDiveBox.textContent = `${symbol} 证据包尚未加载。`;
    return;
  }
  if (dive.error) {
    els.stockDeepDiveBox.className = "deep-dive-box empty-state";
    els.stockDeepDiveBox.textContent = `${symbol} 证据包读取失败：${dive.error}`;
    return;
  }
  const factorRows = dive.factorWaterfall?.rows || [];
  const dq = dive.dataQualityAudit || {};
  const weakest = dq.weakestBlocks || [];
  const chain = dive.valueChain || {};
  const chainRows = [...(chain.peers || []), ...(chain.upstream || []), ...(chain.downstream || [])].slice(0, 10);
  const newsRows = (dive.newsTimeline || []).slice(0, 6);
  const decisions = (dive.decisionHistory || []).slice(0, 6);
  const invalidations = dive.invalidations || [];
  els.stockDeepDiveBox.className = "deep-dive-box";
  els.stockDeepDiveBox.innerHTML = `<div class="deep-dive-hero">
    <div>
      <p class="section-label">${escapeHtml(symbol)} Evidence Pack</p>
      <h3>${escapeHtml(tickerLabel(symbol, { ...dive.header?.quote, run: appState?.latest }))}</h3>
      <p class="muted">策略版本 ${escapeHtml(dive.header?.strategyVersion || "-")} · Regime ${escapeHtml(dive.header?.regime || "-")}</p>
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(dq.score, "DQ 分")}
      ${allStockAgentMetric(factorRows.length, "因子")}
      ${allStockAgentMetric(decisions.length, "历史决策")}
      ${allStockAgentMetric(invalidations.length, "失效条件")}
    </div>
  </div>
  <div class="deep-dive-grid">
    <article class="daily-card wide">
      <h4>因子瀑布</h4>
      <div class="factor-waterfall-list">${factorRows.length ? factorRows.map((row) => `<div class="factor-waterfall-row">
        <span>${escapeHtml(row.label || row.id)}</span>
        <strong>${escapeHtml(fmtNumber(Number(row.contribution), 2))}</strong>
        <small>分 ${escapeHtml(row.score ?? "-")} · 权重 ${escapeHtml(Number.isFinite(Number(row.weight)) ? fmtNumber(Number(row.weight) * 100, 1) : "-")}% · 来源 ${(row.source || []).map(sourceLabel).join(" / ")}</small>
      </div>`).join("") : empty("暂无因子瀑布。")}</div>
    </article>
    <article class="daily-card">
      <h4>数据质量</h4>
      <p><strong>${escapeHtml(contextStatusLabel(dq.status))}</strong> · 缺失 ${escapeHtml(dq.missingBlocks ?? 0)} · 部分 ${escapeHtml(dq.partialBlocks ?? 0)}</p>
      ${weakest.length ? `<ul class="compact-list">${weakest.map((row) => `<li>${escapeHtml(row.label || row.key)}：${escapeHtml(row.missingReason || "覆盖不足")}（质量 ${escapeHtml(row.qualityScore ?? "-")}）</li>`).join("")}</ul>` : `<p class="muted">暂无明显弱项。</p>`}
    </article>
    <article class="daily-card wide">
      <h4>产业链与同业</h4>
      <p class="muted">${escapeHtml(chain.industry || dive.business?.industry || "行业未知")} · ${escapeHtml(chain.segment || dive.business?.mainBusiness || "主业信息不足")}</p>
      <div class="chain-chip-grid">${chainRows.length ? chainRows.map((row) => `<button class="chain-chip" type="button" data-open-stock-report="${escapeHtml(row.ticker)}">
        <strong>${escapeHtml(tickerLabel(row.ticker, { ...row, run: appState?.latest }))}</strong>
        <span>${escapeHtml(row.role || row.relation || "")}</span>
        <small>${escapeHtml((row.sourceTags || []).length ? "已标来源" : "推断")} · 质量 ${escapeHtml(row.qualityScore ?? "-")}</small>
      </button>`).join("") : empty("暂无产业链关系。")}</div>
    </article>
    <article class="daily-card wide">
      <h4>新闻时间线</h4>
      ${newsRows.length ? newsRows.map((item) => `<div class="timeline-row">
        <span>${escapeHtml(fmtTime(item.publishedAt || item.createdAt))}</span>
        <strong>${escapeHtml(displayTitle(item) || item.title || "未命名材料")}</strong>
        <p>${escapeHtml(item.summaryZh || item.summary || item.article?.summaryZh || "")}</p>
      </div>`).join("") : empty("暂无新闻时间线。")}
    </article>
    <article class="daily-card">
      <h4>决策历史</h4>
      ${decisions.length ? decisions.map((item) => `<p>${escapeHtml(fmtTime(item.generatedAt || item.decisionAt))} · ${escapeHtml(item.action || "")} · ${escapeHtml(item.outcome || "追踪中")}</p>`).join("") : empty("暂无冻结决策历史。")}
    </article>
    <article class="daily-card">
      <h4>失效条件</h4>
      ${invalidations.length ? `<ul class="compact-list">${invalidations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : empty("暂无失效条件。")}
    </article>
  </div>`;
}

function renderAllStockAgentBacktestBlock(backtest = null) {
  if (!backtest) return "";
  const summary = backtest.summary || {};
  const scope = backtest.scope || {};
  const learning = backtest.learningMetrics || {};
  const learningLog = backtest.learningLog || {};
  const metricNumber = (value) => value === null || value === undefined || value === "" ? NaN : Number(value);
  const fmtPct = (value, digits = 1) => Number.isFinite(metricNumber(value)) ? `${fmtNumber(metricNumber(value), digits)}%` : "-";
  const ruleRows = Object.values(backtest.ruleStats || {})
    .filter((row) => Number(row.samples) > 0)
    .sort((a, b) => Number(b.samples) - Number(a.samples) || Number(b.avgExcessPct) - Number(a.avgExcessPct))
    .slice(0, 6);
  const factorRows = Object.values(backtest.factorStats || learning.factorStats || {})
    .filter((row) => Number(row.samples) > 0)
    .sort((a, b) => Math.abs(Number(b.rankIC) || 0) - Math.abs(Number(a.rankIC) || 0) || Number(b.samples) - Number(a.samples))
    .slice(0, 6);
  const regimeRows = Object.values(learning.regimeSplit || {})
    .filter((row) => Number(row.samples) > 0)
    .sort((a, b) => Number(b.samples) - Number(a.samples))
    .slice(0, 4);
  const dailyRows = (backtest.daily || []).slice(-6).reverse();
  return `<section class="all-stock-agent-section">
    <div class="social-source-head">
      <div>
        <p class="section-label">Backtest</p>
        <h3>规则可用数据回放</h3>
      </div>
      <span class="tag ${backtest.status === "ok" ? "green" : "amber"}">${escapeHtml(backtest.status || "unknown")}</span>
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(Number(scope.dates), "回放日期")}
      ${allStockAgentMetric(Number(summary.formalBuy), "正式买入")}
      ${allStockAgentMetric(Number(summary.watchBuy), "观察信号")}
      ${allStockAgentMetric(Number(summary.outcomeSamples), "到期样本")}
      ${allStockAgentMetric(Number.isFinite(metricNumber(summary.winRate)) ? metricNumber(summary.winRate) * 100 : NaN, "胜率", 1)}
      ${allStockAgentMetric(metricNumber(summary.avgExcessPct), "平均超额", 1)}
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(Number.isFinite(metricNumber(learning.precisionAt10)) ? metricNumber(learning.precisionAt10) * 100 : NaN, "Precision@10", 1)}
      ${allStockAgentMetric(metricNumber(learning.actionScoreRankIC), "Action RankIC", 2)}
      ${allStockAgentMetric(metricNumber(learning.alphaScoreRankIC), "Alpha RankIC", 2)}
      ${allStockAgentMetric(metricNumber(learning.maxDrawdownPct), "回测回撤", 1)}
      ${allStockAgentMetric(Number.isFinite(metricNumber(learning.turnover)) ? metricNumber(learning.turnover) * 100 : NaN, "换手", 1)}
    </div>
    <div class="all-stock-agent-paper-grid">
      <article class="all-stock-agent-paper-card">
        <h4>最近回放日</h4>
        <div class="all-stock-agent-mini-list">
          ${dailyRows.length ? dailyRows.map((item) => `<div>
            <strong>${escapeHtml(item.date || "")}</strong>
            <span>正式 ${escapeHtml(item.buy || 0)} · 观察 ${escapeHtml(item.watchBuy || 0)} · 样本 ${escapeHtml(item.outcomeSamples || 0)} · 超额 ${escapeHtml(fmtPct(item.avgExcessPct))}</span>
          </div>`).join("") : `<p class="muted">暂无可回放日期。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>因子表现</h4>
        <div class="all-stock-agent-mini-list">
          ${factorRows.length ? factorRows.map((item) => `<div>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <span>样本 ${escapeHtml(item.samples)} · RankIC ${escapeHtml(fmtNumber(metricNumber(item.rankIC), 2))} · 超额 ${escapeHtml(fmtPct(item.avgExcessPct))}</span>
          </div>`).join("") : `<p class="muted">暂无因子 outcome 样本。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>规则表现</h4>
        <div class="all-stock-agent-mini-list">
          ${ruleRows.length ? ruleRows.map((item) => `<div>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <span>样本 ${escapeHtml(item.samples)} · 胜率 ${escapeHtml(fmtPct(metricNumber(item.winRate) * 100))} · 超额 ${escapeHtml(fmtPct(item.avgExcessPct))}</span>
          </div>`).join("") : `<p class="muted">暂无到期规则样本。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>学习日志</h4>
        <div class="all-stock-agent-mini-list">
          ${(learningLog.actions || []).slice(0, 4).length ? (learningLog.actions || []).slice(0, 4).map((item) => `<div>
            <strong>${escapeHtml(item.label || item.factorId || "")}</strong>
            <span>${escapeHtml(item.reason || "")}</span>
          </div>`).join("") : `<p class="muted">暂无调权候选。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>Regime 分层</h4>
        <div class="all-stock-agent-mini-list">
          ${regimeRows.length ? regimeRows.map((item) => `<div>
            <strong>${escapeHtml(item.bucket || "")}</strong>
            <span>样本 ${escapeHtml(item.samples)} · 胜率 ${escapeHtml(fmtPct(metricNumber(item.hitRate) * 100))} · 超额 ${escapeHtml(fmtPct(item.avgExcessPct))}</span>
          </div>`).join("") : `<p class="muted">暂无宏观分层样本。</p>`}
        </div>
      </article>
      <article class="all-stock-agent-paper-card">
        <h4>限制</h4>
        <ul class="compact-list">
          ${(backtest.caveats || []).slice(0, 3).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </article>
    </div>
  </section>`;
}

function renderAllStockAgentSection(title, subtitle, rows, renderer, options = {}) {
  return `<details class="all-stock-agent-section agent-disclosure" ${options.open === false ? "" : "open"}>
    <summary class="social-source-head">
      <div>
        <p class="section-label">${escapeHtml(subtitle)}</p>
        <h3>${escapeHtml(title)}</h3>
      </div>
      <span class="tag">${escapeHtml(rows.length)} 个</span>
    </summary>
    <div class="all-stock-agent-grid">${rows.length ? rows.map(renderer).join("") : empty("暂无。")}</div>
  </details>`;
}

function renderAllStockAgentRoadmapBlock(latest = {}) {
  const roadmap = latest.roadmap || {};
  const regime = roadmap.regime || {};
  const gates = roadmap.antiOvertrading || {};
  const downgraded = latest.summary?.researchDowngraded || 0;
  const version = strategyVersionText(roadmap.strategyVersion || latest.skill?.strategyVersion) || "-";
  return `<section class="all-stock-agent-section roadmap">
    <div class="social-source-head">
      <div>
        <p class="section-label">Governance</p>
        <h3>策略版本与风控闸门</h3>
      </div>
      <span class="tag">${escapeHtml(version)}</span>
    </div>
    <div class="all-stock-agent-track">
      ${allStockAgentMetric(gates.actionableBuyLimit, "每日正式买入上限")}
      ${allStockAgentMetric(gates.minActionableDataQuality, "Actionable DQ阈值")}
      ${allStockAgentMetric(gates.cooldownTradingDays, "普通冷却T+")}
      ${allStockAgentMetric(gates.failedThesisCooldownTradingDays, "失败冷却T+")}
      ${allStockAgentMetric(downgraded, "降级研究")}
    </div>
    <div class="all-stock-agent-note">
      <strong>Regime</strong>
      <span>${escapeHtml(regime.label || regime.bucket || "unknown")} · 风险分 ${escapeHtml(Number.isFinite(Number(regime.riskScore)) ? fmtNumber(Number(regime.riskScore), 0) : "-")}。低数据质量、冷却期、财报黑窗或组合暴露过高时，买入会降级到研究列表。</span>
    </div>
  </section>`;
}

function renderAllStockAgent(agentState) {
  if (!els.allStockAgentBox) return;
  const latest = agentState?.latest;
  if (!latest) {
    els.allStockAgentBox.className = allStockAgentBacktest ? "all-stock-agent-box" : "all-stock-agent-box empty-state";
    els.allStockAgentBox.innerHTML = allStockAgentBacktest
      ? `<div class="all-stock-agent-note"><strong>尚未运行</strong><span>候选池 Skill Agent 尚未运行；下方先显示历史快照回测。</span></div>${renderAllStockAgentBacktestBlock(allStockAgentBacktest)}`
      : "候选池 Skill Agent 尚未运行。点击右上角按钮，使用最新报告生成正式买入、待触发候选和卖出检查。";
    return;
  }
  const summary = latest.summary || {};
  const sourceReadinessBlocked = appState?.latest?.dataQuality?.readiness?.status === "blocked";
  const allBuyRows = latest.buyCandidates || [];
  const buyRows = sourceReadinessBlocked
    ? []
    : allBuyRows.filter((item) => item.actionable !== false && item.actionability?.status !== "research");
  const downgradedBuyRows = sourceReadinessBlocked
    ? allBuyRows
    : allBuyRows.filter((item) => item.actionable === false || item.actionability?.status === "research");
  const downgradedTickers = new Set(downgradedBuyRows.map((item) => normalizeTickerSymbol(item.ticker)).filter(Boolean));
  const watchBuyRows = [
    ...downgradedBuyRows,
    ...(latest.watchBuyCandidates || []).filter((item) => {
      const ticker = normalizeTickerSymbol(item.ticker);
      if (!ticker || downgradedTickers.has(ticker)) return false;
      downgradedTickers.add(ticker);
      return true;
    }),
  ];
  const sellRows = latest.sellCandidates || [];
  const holdRows = latest.holdReviews || [];
  const reviewRows = latest.reviews || [];
  const revision = latest.skillRevision;
  const run = latest.sourceRun || appState?.latest || null;
  els.allStockAgentBox.className = "all-stock-agent-box";
  els.allStockAgentBox.innerHTML = `<div class="all-stock-agent-hero">
      <div>
        <p class="section-label">Skill Agent</p>
        <h3>候选池扫描与自纠错</h3>
        <p class="muted">Skill：${escapeHtml(latest.skill?.path || "")} · 最新运行 ${escapeHtml(fmtTime(latest.completedAt || latest.generatedAt))}</p>
      </div>
      <div class="all-stock-agent-metrics">
        ${allStockAgentMetric(summary.universe, "候选池")}
        ${allStockAgentMetric(summary.evaluated, "已评分")}
        ${allStockAgentMetric(buyRows.length, "正式买入")}
        ${allStockAgentMetric(summary.watchBuy, "观察")}
        ${allStockAgentMetric(summary.sell, "卖出")}
        ${allStockAgentMetric(summary.reviewed, "复盘")}
      </div>
    </div>
    <div class="all-stock-agent-note">
      <strong>覆盖边界</strong>
      <span>${escapeHtml(latest.universeCoverage?.note || "当前扫描可获取候选池。")}</span>
    </div>
    ${sourceReadinessBlocked ? `<div class="all-stock-agent-note warning"><strong>当前报告不可用于操作</strong><span>${escapeHtml(appState.latest?.dataQuality?.readiness?.summary || "核心数据源未达到可用门槛")}；旧 Agent 买入结果已全部降级到观察区。</span></div>` : ""}
    ${revision?.changes?.length ? `<div class="all-stock-agent-note success"><strong>Skill 已自更新</strong><span>${escapeHtml(revision.summary || "")}</span></div>` : ""}
    ${renderAllStockAgentRoadmapBlock(latest)}
    ${renderAllStockAgentTrackRecord(latest)}
    ${renderFactorLifecycleBoard(appState?.factorRegistry)}
    ${renderAllStockAgentBacktestBlock(allStockAgentBacktest)}
    ${renderAllStockAgentSection("正式买入", "Buy List", buyRows, (item) => renderAllStockAgentDecision(item, "buy", run))}
    ${renderAllStockAgentSection("待触发买入候选", "Watch Buy", watchBuyRows, (item) => renderAllStockAgentDecision(item, "watch", run), { open: false })}
    ${renderAllStockAgentSection("持仓卖出检查", "Sell Check", sellRows, (item) => renderAllStockAgentDecision(item, "sell", run))}
    ${renderAllStockAgentSection("持仓继续观察", "Hold Review", holdRows, (item) => renderAllStockAgentHold(item, run), { open: false })}
    <details class="all-stock-agent-section agent-disclosure">
      <summary class="social-source-head">
        <div>
          <p class="section-label">Review</p>
          <h3>历史建议复盘</h3>
        </div>
        <span class="tag">${escapeHtml(reviewRows.length)} 条</span>
      </summary>
      <div class="all-stock-agent-review-list">${reviewRows.slice(0, 12).length ? reviewRows.slice(0, 12).map(renderAllStockAgentReview).join("") : empty("暂无可复盘价格。")}</div>
    </details>
    ${(latest.missingData || []).length ? `<details class="all-stock-agent-section agent-disclosure"><summary><strong>缺失数据 / 覆盖限制</strong><span class="tag amber">${escapeHtml(latest.missingData.length)} 条</span></summary><ul class="compact-list">${latest.missingData.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>` : ""}
    <p class="muted">${escapeHtml(latest.disclaimer || "")}</p>`;
}

function renderAnalysis(run) {
  if (!run) {
    els.analysisProvider.textContent = "local";
    els.analysisBody.className = "analysis-body empty-state";
    els.analysisBody.textContent = "暂无分析。先运行一次采集。";
    return;
  }
  const a = run.analysis || {};
  els.analysisProvider.textContent = a.provider || "local";
  els.analysisBody.className = "analysis-body";
  const localBlocks = [
    agentBlock(a.agentReports || []),
    claimsBlock(a.claims || [], a.evidence || []),
    listBlock("核心摘要", a.summary || []),
    listBlock("机会线索", a.opportunities || []),
    listBlock("风险与限制", a.risks || []),
  ].join("");
  const llmBlock = a.llmText
    ? `<div><h3>LLM 深度摘要</h3><div class="llm-block">${escapeHtml(a.llmText)}</div></div>`
    : "";
  const errorBlock = a.llmError
    ? `<div class="tag red">LLM 异常：${escapeHtml(a.llmError)}</div>`
    : "";
  els.analysisBody.innerHTML = `${errorBlock}${llmBlock}${localBlocks}`;
}

function agentBlock(agents) {
  if (!agents.length) return "";
  return `<div><h3>多 Agent 投研</h3><div class="agent-grid">${agents
    .map(
      (agent) => `<article class="agent-card">
        <div class="row">
          <strong>${escapeHtml(agent.name)}</strong>
          <span class="tag ${agent.signal === "bullish" ? "green" : agent.signal === "cautious" ? "red" : "amber"}">${escapeHtml(signalLabel(agent.signal))} · ${escapeHtml(agent.confidence)}</span>
        </div>
        <ul>${(agent.observations || [])
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>
      </article>`,
    )
    .join("")}</div></div>`;
}

function claimsBlock(claims, evidence) {
  if (!claims.length && !evidence.length) return "";
  return `<div><h3>证据链</h3>
    <div class="claims-list">${claims
      .map(
        (claim) => `<article class="claim-card">
          <p>${escapeHtml(claim.claim)}</p>
          <div class="feed-meta">${(claim.evidenceIds || [])
            .map((id) => `<span class="tag">${escapeHtml(id)}</span>`)
            .join("")}</div>
        </article>`,
      )
      .join("")}</div>
    <div class="evidence-list">${evidence
      .slice(0, 16)
      .map((item) => {
        const title = `${item.id} · ${item.ticker || "市场"} · ${displayTitle(item)}`;
        return `<div class="evidence-row">
          <span class="tag ${item.reliability === "official" ? "green" : item.reliability === "derived" ? "amber" : ""}">${escapeHtml(typeLabel(item.type))}</span>
          ${
            item.url
              ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
              : `<span>${escapeHtml(title)}</span>`
          }
          <span class="muted">${escapeHtml(sourceLabel(item.source || ""))}</span>
        </div>`;
      })
      .join("")}</div></div>`;
}

function listBlock(title, items) {
  if (!items.length) return "";
  return `<div><h3>${escapeHtml(title)}</h3><ul>${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul></div>`;
}

async function addWatchlistTicker(value) {
  const ticker = normalizeTickerInput(value);
  if (!ticker) throw new Error("请输入 ticker。");
  await api("/api/watchlist/add", {
    method: "POST",
    body: JSON.stringify({ ticker }),
  });
  if (els.watchlistAddInput) els.watchlistAddInput.value = "";
  await loadState();
}

async function removeWatchlistTicker(ticker) {
  const safe = normalizeTickerInput(ticker);
  if (!safe) throw new Error("缺少要删除的 ticker。");
  await api(`/api/watchlist/${encodeURIComponent(safe)}`, {
    method: "DELETE",
  });
  await loadState();
}

function renderTickers(run) {
  const scores = run?.analysis?.tickerScores || [];
  const quoteMap = Object.fromEntries((run?.quotes || []).map((q) => [q.ticker, q]));
  els.tickerGrid.innerHTML = appState.watchlist
    .map((ticker) => {
      const score = scores.find((s) => s.ticker === ticker) || {
        attention: 0,
        riskScore: 0,
      };
      const quote = quoteMap[ticker];
      const riskClass =
        score.riskScore >= 70 ? "danger" : score.riskScore >= 50 ? "warn" : "";
      return `<article class="ticker-card">
        <div class="row">
          <h3>${escapeHtml(tickerLabel(ticker, { ...quote, run }))}</h3>
          <div class="ticker-actions">
            <span class="tag ${riskClass === "danger" ? "red" : riskClass === "warn" ? "amber" : "green"}">风险 ${escapeHtml(score.riskScore)}</span>
            <button class="btn compact icon-btn" type="button" data-remove-watchlist="${escapeHtml(ticker)}" title="删除自选 ${escapeHtml(ticker)}" aria-label="删除自选 ${escapeHtml(ticker)}">&times;</button>
          </div>
        </div>
        <div class="risk-bar"><div class="risk-fill ${riskClass}" style="width:${Math.max(
          4,
          score.riskScore || 0,
        )}%"></div></div>
        <p class="muted">关注度 ${escapeHtml(score.attention || 0)} · 正向 ${
          score.positiveHits || 0
        } · 风险词 ${score.riskHits || 0}</p>
        <p class="muted">${
          quote
            ? `价格 ${quote.price} · ${escapeHtml(quote.provider)}`
            : "未接入授权报价源"
        }</p>
      </article>`;
    })
    .join("");
}

function fmtNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : "-";
}

function renderTechnicals(run) {
  const technicals = prioritizeWatchlist(run?.technicals || []);
  if (!technicals.length) {
    els.technicalGrid.innerHTML = empty("暂无技术指标。运行一次采集后显示。");
    return;
  }
  els.technicalGrid.innerHTML = technicals
    .slice(0, 8)
    .map(
      (item, index) => `<article class="technical-card">
        <div class="row">
          <h3>${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</h3>
          <span class="tag ${item.trend === "uptrend" ? "green" : item.trend === "downtrend" ? "red" : "amber"}">${escapeHtml(trendLabel(item.trend))}</span>
        </div>
        <canvas class="mini-chart" width="360" height="160" data-tech-index="${index}" aria-label="${escapeHtml(item.ticker)} 价格图"></canvas>
        <div class="indicator-grid">
          ${indicator("收盘", fmtNumber(item.latestClose))}
          ${indicator("10日线", fmtNumber(item.sma10))}
          ${indicator("20日均线", fmtNumber(item.sma20))}
          ${indicator("50日均线", fmtNumber(item.sma50))}
          ${indicator("RSI", fmtNumber(item.rsi14, 1))}
          ${indicator("MACD", fmtNumber(item.macdHistogram, 2))}
          ${indicator("ATR", fmtNumber(item.atr14, 2))}
        </div>
      </article>`,
    )
    .join("");
  requestAnimationFrame(() => drawTechnicalCharts(technicals.slice(0, 8)));
}

function renderFundamentals(run) {
  const fundamentals = prioritizeWatchlist(run?.fundamentals || []);
  if (!fundamentals.length) {
    els.fundamentalGrid.innerHTML = empty("暂无基本面数据。配置 Finnhub 后运行采集。");
    return;
  }
  els.fundamentalGrid.innerHTML = fundamentals
    .slice(0, 10)
    .map((item) => {
      const isEtf = isEtfInstrument(item);
      const earningsDate =
        item.nextEarnings?.date || item.nextEarnings?.date2 || item.nextEarnings?.period || "";
      return `<article class="fundamental-card">
        <div class="row">
          <div>
            <h3>${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</h3>
            <p class="muted">${escapeHtml(tickerNameLine(item.ticker, { ...item, run }))}</p>
          </div>
          <span class="tag">${escapeHtml(industryLabel(item.industry))}</span>
        </div>
        <div class="indicator-grid">
          ${indicator("市值", item.marketCapitalization ? `${fmtNumber(item.marketCapitalization / 1000, 1)}B` : "-")}
          ${indicator("市盈率", fmtNumber(item.peTTM, 1))}
          ${indicator("市销率", fmtNumber(item.psTTM, 1))}
          ${indicator("收入同比", Number.isFinite(item.revenueGrowthTTMYoy) ? `${fmtNumber(item.revenueGrowthTTMYoy, 1)}%` : "-")}
          ${isEtf ? indicator("产品类型", "ETF") : indicator("净利率", fundamentalMarginDisplay(item))}
          ${indicator("负债/权益", fmtNumber(item.debtEquityAnnual, 1))}
        </div>
        <p class="muted fundamental-foot">${isEtf ? "ETF 无公司财报日" : `下次财报：${escapeHtml(earningsDate || "未知")}`} · ${escapeHtml(item.provider || "")}</p>
      </article>`;
    })
    .join("");
}

function renderOpenBB(run, config = {}) {
  if (!els.openbbGrid) return;
  const openbb = run?.openbb;
  if (!openbb) {
    els.openbbGrid.innerHTML = empty(
      `OpenBB collector 尚未运行。当前配置：${config?.enabled ? "已启用" : "未启用"}，模式：${config?.mode || "auto"}，Python：${config?.pythonCommand || "python3"}。`,
    );
    return;
  }
  const summary = openbb.summary || {};
  const coverage = summary.coverage || {};
  const bundles = openbb.bundles || [];
  const coverageTags = Object.entries({
    discovery: "市场扫描",
    identity: "公司识别",
    filings: "SEC公告",
    quote: "报价",
    historical: "历史价格",
    profile: "公司画像",
    metrics: "基本面",
    news: "新闻",
    options: "期权",
  })
    .map(([key, label]) => `<span class="tag ${(coverage[key] || 0) > 0 ? "green" : "amber"}">${escapeHtml(label)} ${escapeHtml(coverage[key] || 0)}</span>`)
    .join("");
  els.openbbGrid.innerHTML = `<article class="openbb-card">
      <div class="row">
        <h3>${summary.installed ? "OpenBB 已接入" : "OpenBB 环境待安装"}</h3>
        <span class="tag ${summary.installed ? "green" : "amber"}">${escapeHtml(summary.status || "unknown")}</span>
      </div>
      <p class="muted">${escapeHtml(
        summary.installed
          ? `版本 ${summary.openbbVersion || "未知"} · 后端 ${summary.backend || "python"} · 模式 ${summary.mode || config?.mode || "auto"} · Provider ${summary.provider || "auto"} · 定时采集 ${summary.collectorSections?.join?.(", ") || config?.collectorSections?.join?.(", ") || "默认"} · ${summary.backend === "rest" ? `REST ${summary.restBaseUrl || config?.restBaseUrl || ""}` : `Python ${String(summary.python || "").split("\\n")[0]}`}`
          : `${summary.error || "当前 Python 环境没有 openbb 包"}；安装建议：${summary.install || "python -m pip install openbb"}`,
      )}</p>
      <div class="feed-meta">${coverageTags}</div>
    </article>
    ${openbbDiscoveryBlock(openbb.discovery)}
    ${bundles
      .slice(0, 8)
      .map(
        (bundle) => `<article class="openbb-card">
          <div class="row">
            <h3>${escapeHtml(bundle.symbol)}</h3>
            <span class="tag">OpenBB routes</span>
          </div>
          ${openbbBundleBlock(bundle)}
        </article>`,
      )
      .join("")}`;
}

function renderOpenBbRouteResult(payload) {
  if (!els.openbbRouteResult) return;
  if (!payload) {
    els.openbbRouteResult.innerHTML = "";
    return;
  }
  const rows = payload.records || [];
  els.openbbRouteResult.innerHTML = `<article class="openbb-card">
    <div class="row">
      <h3>${escapeHtml(payload.route || "OpenBB route")}</h3>
      <span class="tag ${payload.status === "ok" ? "green" : "red"}">${escapeHtml(payload.status || "unknown")}</span>
      ${payload.backend ? `<span class="tag">${escapeHtml(payload.backend)}</span>` : ""}
    </div>
    ${payload.error ? `<p class="muted">${escapeHtml(payload.error)}</p>` : ""}
    ${rows.length ? `<pre class="json-preview">${escapeHtml(JSON.stringify(rows.slice(0, 5), null, 2))}</pre>` : empty("该 route 没有返回记录。")}
  </article>`;
}

function capabilityStatusClass(status) {
  if (status === "已接入") return "green";
  if (status === "可接入") return "";
  if (status === "需要 key" || status === "不稳定") return "amber";
  return "red";
}

function capabilityCardStatus(on, error = "", fallback = "需要 key") {
  if (error) return "不稳定";
  if (on) return "已接入";
  return fallback;
}

function renderCapabilityRadar(run, config = {}) {
  if (!els.capabilityRadar) return;
  const providers = config.providers || {};
  const dataQuality = run?.dataQuality || {};
  const optionsOrder = config.optionsChain?.providerOrder || [];
  const socialOn = Boolean(
    providers.apeWisdomSocial ||
      providers.redditSocial ||
      providers.xSearch ||
      providers.xhsCli ||
      providers.customSocialFeeds,
  );
  const rows = [
    {
      name: "OpenBB Platform",
      status: capabilityCardStatus(providers.openbb, providerRecentError("openbb", dataQuality), "可接入"),
      reference: "OpenBB 的核心价值是把行情、基本面、新闻、期权等 route 做成统一接口。",
      ours: providers.openbb ? "已接入 route 调用、bundle 覆盖和 collector 状态。" : "代码已留接口，当前未启用 OpenBB 环境。",
      next: providers.openbb ? "继续把高价值 route 固化到单股日报。" : "安装 openbb 并设置 OPENBB_ENABLED=true。",
    },
    {
      name: "IBKR 行情/期权",
      status: capabilityCardStatus(
        providers.ibkrGateway || providers.ibkrMarketData || providers.ibkrClientPortal,
        providerRecentError("ibkrGateway", dataQuality) || providerRecentError("ibkrClientPortal", dataQuality),
        "可接入",
      ),
      reference: "开源项目通常用 broker API 做真实行情与交易闭环，IBKR 是最适合落地的一条线。",
      ours: `Socket ${providers.ibkrGateway ? "已启用" : "未启用"}，行情 ${providers.ibkrMarketData ? "已启用" : "未启用"}，期权 provider ${optionsOrder.includes("ibkr") ? "已优先" : "未优先"}。`,
      next: "保持 IB Gateway/TWS 登录；期权 Greeks 和实时行情取决于账户市场数据权限。",
    },
    {
      name: "Longbridge AI",
      status: capabilityCardStatus(providers.longBridge, providerRecentError("longBridge", dataQuality), "可接入"),
      reference: "Longbridge Skill/MCP 的价值是把港美 A 股行情、K线、新闻、基本面和筛选统一给 AI Agent 调用。",
      ours: providers.longBridge
        ? `CLI 已接入；新闻 ${providers.longBridgeNews ? "已启用" : "未启用"}，行情/K线 provider 可参与回退。`
        : "未检测到 Longbridge CLI 或未启用 LONG_BRIDGE_ENABLED。",
      next: "当前只用于行情、K线和新闻；期权链固定使用 IBKR 优先和 Nasdaq/Yahoo/Finnhub fallback。",
    },
    {
      name: "Finnhub",
      status: capabilityCardStatus(providers.finnhub, providerRecentError("finnhub", dataQuality)),
      reference: "适合作为公司新闻、基础行情和财务补充源，免费套餐要接受限流。",
      ours: providers.finnhub ? "已用于新闻/公司信息兜底。" : "未配置 FINNHUB_API_KEY。",
      next: providers.finnhub ? "监控 429 与套餐权限。" : "配置 FINNHUB_API_KEY。",
    },
    {
      name: "NewsAPI / Polygon",
      status: capabilityCardStatus(
        providers.newsapiHotNews || providers.polygonHotNews,
        providerRecentError("newsapiHotNews", dataQuality) || providerRecentError("polygonHotNews", dataQuality),
      ),
      reference: "财经热闻适合用新闻聚合 API 扩覆盖，再交给正文抽取和 LLM 过滤噪音。",
      ours: `NewsAPI ${providers.newsapiHotNews ? "已接入" : "缺 key"}，Polygon/Massive ${providers.polygonHotNews ? "已接入" : "缺 key"}。`,
      next: "补 key 后优先服务“当日热门新闻”和市场热闻排序。",
    },
    {
      name: "Alpha Vantage",
      status: capabilityCardStatus(providers.alphaVantage, providerRecentError("alphaVantage", dataQuality)),
      reference: "适合作为新闻情绪和备用行情源，覆盖广但节流明显。",
      ours: providers.alphaVantage ? "已配置备用行情/热闻能力。" : "未配置 ALPHAVANTAGE_API_KEY。",
      next: providers.alphaVantage ? "控制频率，避免免费额度触发节流。" : "配置 ALPHAVANTAGE_API_KEY。",
    },
    {
      name: "社交热议源",
      status: capabilityCardStatus(
        socialOn,
        providerRecentError("redditSocial", dataQuality) ||
          providerRecentError("xSearch", dataQuality) ||
          providerRecentError("xhsCli", dataQuality) ||
          providerRecentError("stocktwitsSocial", dataQuality),
        "可接入",
      ),
      reference: "TradingAgents/FinGPT 类项目更重视舆情作为催化线索，不把热度直接当买卖信号。",
      ours: `ApeWisdom ${providers.apeWisdomSocial ? "已启用" : "未启用"}，X ${providers.xSearch ? "已启用" : "缺 token"}，小红书 ${providers.xhsCli ? "已启用" : "未启用"}，自定义 feed ${providers.customSocialFeeds ? "已启用" : "未配置"}。`,
      next: "继续用全市场上升热度找新机会，再用新闻/财报解释为什么热。",
    },
    {
      name: "LLM 分析层",
      status: capabilityCardStatus(
        providers.codexCli || providers.antigravityCli || providers.geminiCli || providers.gemini || providers.openai || providers.localRules,
        providerRecentError("articleLlmSummary", dataQuality),
        "可接入",
      ),
      reference: "TradingAgents 的参考价值在多角色拆解：新闻事实、估值影响、风险、交易计划分开写。",
      ours: providers.codexCli || providers.antigravityCli || providers.geminiCli || providers.gemini || providers.openai ? "外部 LLM + 本地规则兜底。" : "当前主要靠本地规则。",
      next: "轻任务用 flash-lite，长报告失败时保留本地规则摘要，避免超时阻塞采集。",
    },
    {
      name: "期权源",
      status: capabilityCardStatus(providers.optionsChain, providerRecentError("optionsChain", dataQuality), "可接入"),
      reference: "OpenBB/QuantLib 思路可借鉴：链路归一、Greeks 标准化、图形化解释结构。",
      ours: `顺序 ${optionsOrder.length ? optionsOrder.join(" -> ") : "未配置"}；现在已图形化 GEX、OI/Volume、IV Smile。`,
      next: "优先 IBKR Socket/账户权限，Nasdaq/Yahoo/Finnhub 只做 fallback。",
    },
  ];
  els.capabilityRadar.innerHTML = `<div class="capability-grid">
    ${rows
      .map(
        (row) => `<article class="capability-card">
          <div class="row">
            <h3>${escapeHtml(row.name)}</h3>
            <span class="tag ${capabilityStatusClass(row.status)}">${escapeHtml(row.status)}</span>
          </div>
          <p><strong>可借鉴</strong>${escapeHtml(row.reference)}</p>
          <p><strong>当前</strong>${escapeHtml(row.ours)}</p>
          <p class="muted"><strong>下一步</strong>${escapeHtml(row.next)}</p>
        </article>`,
      )
      .join("")}
  </div>`;
}

function renderPortfolio(run) {
  const risk = run?.portfolioRisk;
  if (!risk?.positions?.length) {
    els.portfolioBox.innerHTML = empty("暂无持仓。每行输入 TICKER 数量 成本价。");
    return;
  }
  els.portfolioBox.innerHTML = `<div class="portfolio-summary">
    ${metric(fmtNumber(risk.totalValue, 0), "总市值")}
    ${metric(fmtNumber(risk.totalPnl, 0), "总盈亏")}
    ${metric(`${fmtNumber(risk.totalPnlPercent, 1)}%`, "盈亏率")}
    ${metric(`${fmtNumber(risk.atrWeighted, 1)}%`, "ATR风险")}
  </div>
  <div class="position-list">
    ${risk.positions
      .map(
        (p) => `<div class="position-row">
          <div>
            <strong>${escapeHtml(tickerLabel(p.ticker, { ...p, run }))}</strong>
            <p class="muted">${escapeHtml(p.shares)} 股 · 权重 ${fmtNumber(p.weight, 1)}%</p>
          </div>
          <div class="position-numbers">
            <span>${fmtNumber(p.marketValue, 0)}</span>
            <span class="${p.pnl >= 0 ? "gain" : "loss"}">${fmtNumber(p.pnl, 0)} (${fmtNumber(p.pnlPercent, 1)}%)</span>
          </div>
        </div>`,
      )
      .join("")}
  </div>
  <div class="risk-notes">${(risk.notes || []).map((note) => `<p>${escapeHtml(note)}</p>`).join("")}</div>`;
}

function renderRecommendationReconciliation(payload = null) {
  if (!els.recommendationReconciliationBox) return;
  if (!payload) {
    els.recommendationReconciliationBox.className = "reconciliation-box empty-state";
    els.recommendationReconciliationBox.textContent = supplementalDataError || "暂无交易建议对账数据。";
    return;
  }
  const summary = payload.summary || {};
  const rows = payload.rows || [];
  els.recommendationReconciliationBox.className = "reconciliation-box";
  els.recommendationReconciliationBox.innerHTML = `<div class="all-stock-agent-track">
    ${allStockAgentMetric(summary.trades, "交易")}
    ${allStockAgentMetric(summary.aligned, "顺向")}
    ${allStockAgentMetric(summary.contrarian, "反向")}
    ${allStockAgentMetric(summary.uncovered, "无同日建议")}
  </div>
  <div class="reconciliation-list">${rows.length ? rows.slice(0, 20).map((row) => `<article class="daily-card">
    <div class="daily-card-head">
      <button class="link-button" type="button" data-open-stock-report="${escapeHtml(row.ticker)}">${escapeHtml(tickerLabel(row.ticker, { ...row, run: appState?.latest }))}</button>
      <span class="tag ${row.classification === "aligned" ? "green" : row.classification === "contrarian" ? "red" : "amber"}">${escapeHtml(row.classification || "-")}</span>
    </div>
    <div class="feed-meta">
      <span>交易 ${escapeHtml(tradeSideLabel(row.tradeSide))}</span>
      <span>建议 ${escapeHtml(row.decisionAction || "-")}</span>
      <span>${escapeHtml(row.processQuality || "-")}</span>
    </div>
    <p>${escapeHtml(row.thesisAlignment || "暂无 thesis 对齐结果。")}</p>
  </article>`).join("") : empty("暂无可对账交易。")}</div>`;
}

function strategyVersionCard(version = {}, activeId = "") {
  const records = version.validationRecords || [];
  const latestRecord = records[0] || null;
  const effectiveActive = version.id === activeId;
  const displayStatus = effectiveActive ? "active" : version.status === "active" ? "legacy-active" : version.status || "-";
  return `<article class="daily-card strategy-version-card">
    <div class="daily-card-head">
      <strong>${escapeHtml(version.id || "-")}</strong>
      <span class="tag ${effectiveActive ? "green" : version.status === "candidate" ? "amber" : ""}">${escapeHtml(displayStatus)}</span>
    </div>
    <div class="feed-meta">
      <span>${escapeHtml(version.source || version.sourceFile || "-")}</span>
      <span>验证 ${escapeHtml(latestRecord?.status || version.validationStatus || "无")}</span>
      <span>n=${escapeHtml(latestRecord?.n ?? 0)}</span>
    </div>
    <p>${escapeHtml(version.changeReason || version.evaluationSummary?.status || "暂无变更说明。")}</p>
    ${latestRecord ? `<div class="mini-kv">
      ${indicator("候选超额", metricWithN({ value: latestRecord.candidateExcessPct, n: latestRecord.n }, 2, "%"))}
      ${indicator("Active 超额", metricWithN({ value: latestRecord.activeExcessPct, n: latestRecord.n }, 2, "%"))}
      ${indicator("候选 MaxDD", metricWithN({ value: latestRecord.candidateMaxDrawdownPct, n: latestRecord.n }, 2, "%"))}
      ${indicator("Active MaxDD", metricWithN({ value: latestRecord.activeMaxDrawdownPct, n: latestRecord.n }, 2, "%"))}
    </div>` : `<p class="muted">暂无 walk-forward validation record，不能 promote。</p>`}
    <div class="daily-card-actions">
      ${version.status === "candidate" ? `<button class="btn compact" type="button" data-promote-strategy="${escapeHtml(version.id)}">Promote</button>` : ""}
    </div>
  </article>`;
}

function renderStrategyGovernance(payload = null, validation = null) {
  if (!els.strategyGovernanceBox) return;
  if (!payload) {
    els.strategyGovernanceBox.className = "strategy-governance-box empty-state";
    els.strategyGovernanceBox.textContent = supplementalDataError || "暂无策略版本数据。";
    return;
  }
  const versions = payload.strategyVersions || [];
  const active = payload.active || validation?.activeVersion || null;
  const activeId = strategyVersionText(active);
  const candidates = versions.filter((item) => item.status === "candidate");
  els.strategyGovernanceBox.className = "strategy-governance-box";
  els.strategyGovernanceBox.innerHTML = `<div class="all-stock-agent-track">
    ${allStockAgentMetric(versions.length, "版本")}
    ${allStockAgentMetric(candidates.length, "候选")}
    ${allStockAgentMetric(validation?.validation?.eligibleFactorCount ?? 0, "可验证因子")}
    ${allStockAgentMetric(payload.rollbackAvailable ? 1 : 0, "可回滚")}
  </div>
  <div class="all-stock-agent-note">
    <strong>Active</strong>
    <span>${escapeHtml(activeId || "-")}。候选权重必须先通过 walk-forward validation，再由人工 Promote。</span>
  </div>
  <div class="strategy-actions">
    <button class="btn compact ghost" type="button" data-refresh-strategy-panel>刷新策略面板</button>
    <button class="btn compact" type="button" data-rollback-strategy ${payload.rollbackAvailable ? "" : "disabled"}>Rollback</button>
  </div>
  <div class="strategy-version-list">${versions.length ? versions.map((item) => strategyVersionCard(item, activeId)).join("") : empty("暂无策略版本。")}</div>
  <p class="muted">${escapeHtml(validation?.validation?.rule || "Promote 是人工动作；系统不会自动把学习权重写成 active。")}</p>`;
}

function tradeSideLabel(value) {
  if (value === "buy") return "买入";
  if (value === "sell") return "卖出";
  return value || "-";
}

function tradeContextLine(trade) {
  const context = trade.context;
  if (!context) return "暂无历史快照";
  const parts = [
    Number.isFinite(context.price) ? `当时价 ${fmtNumber(context.price)}` : "",
    Number.isFinite(context.changePercent) ? `变动 ${pctLabel(context.changePercent)}` : "",
    context.trend ? `趋势 ${trendLabel(context.trend)}` : "",
    Number.isFinite(context.rsi14) ? `RSI ${fmtNumber(context.rsi14, 1)}` : "",
    Number.isFinite(context.newsCount) ? `新闻 ${context.newsCount}` : "",
    Number.isFinite(context.socialCount) ? `社交 ${context.socialCount}` : "",
  ].filter(Boolean);
  return parts.join(" · ") || "暂无历史快照";
}

function tradePnlClass(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "";
  return number > 0 ? "gain" : "loss";
}

function tradePerformanceTable(title, rows, options = {}) {
  const data = (rows || []).slice(0, options.limit || 5);
  if (!data.length) return "";
  return `<section class="trade-performance-card">
    <div class="row">
      <h3>${escapeHtml(title)}</h3>
      ${options.note ? `<span class="muted">${escapeHtml(options.note)}</span>` : ""}
    </div>
    <div class="performance-table">
      <div class="performance-row head">
        <span>维度</span><span>盈亏</span><span>胜率</span><span>次数</span>
      </div>
      ${data
        .map(
          (row) => `<div class="performance-row">
            <span title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
            <span class="${tradePnlClass(row.realizedPnl)}">${escapeHtml(fmtNumber(row.realizedPnl, 0))}</span>
            <span>${escapeHtml(row.winRate === null ? "-" : `${fmtNumber(row.winRate, 0)}%`)}</span>
            <span>${escapeHtml(row.trades)}</span>
          </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function tradeClosedLotLine(item) {
  const tags = (item.tags || []).slice(0, 2).join("、");
  const parts = [
    fmtTime(item.closedAt),
    Number.isFinite(item.holdingDays) ? `${fmtNumber(item.holdingDays, 1)}天` : "",
    item.strategy || "",
    tags,
  ].filter(Boolean);
  return parts.join(" · ");
}

function tradeRiskStatsBlock(stats) {
  if (!stats?.tradeCount) return "";
  const recent = stats.recentClosedLots || [];
  return `<section class="trade-risk-stats">
    <div class="trade-summary">
      ${metric(fmtNumber(stats.expectancy, 0), "期望值")}
      ${metric(fmtNumber(stats.maxDrawdown, 0), "最大回撤")}
      ${metric(stats.profitFactor === null ? "∞" : fmtNumber(stats.profitFactor, 2), "盈利因子")}
      ${metric(stats.payoffRatio === null ? "-" : fmtNumber(stats.payoffRatio, 2), "盈亏比")}
    </div>
    <div class="feed-meta trade-status">
      <span class="tag">最长连胜 ${escapeHtml(stats.maxWinStreak || 0)}</span>
      <span class="tag">最长连亏 ${escapeHtml(stats.maxLossStreak || 0)}</span>
      ${
        stats.bestTrade
          ? `<span class="tag green">最大盈利 ${escapeHtml(tickerLabel(stats.bestTrade.ticker, { ...stats.bestTrade, run: appState?.latest }))} ${escapeHtml(fmtNumber(stats.bestTrade.realizedPnl, 0))}</span>`
          : ""
      }
      ${
        stats.worstTrade
          ? `<span class="tag red">最大亏损 ${escapeHtml(tickerLabel(stats.worstTrade.ticker, { ...stats.worstTrade, run: appState?.latest }))} ${escapeHtml(fmtNumber(stats.worstTrade.realizedPnl, 0))}</span>`
          : ""
      }
    </div>
    ${
      recent.length
        ? `<div class="closed-lot-list">${recent
            .slice(0, 5)
            .map(
              (item) => `<div class="closed-lot-row">
                <div>
                  <strong>${escapeHtml(tickerLabel(item.ticker, { ...item, run: appState?.latest }))}</strong>
                  <p class="muted">${escapeHtml(tradeClosedLotLine(item))}</p>
                </div>
                <span class="${tradePnlClass(item.realizedPnl)}">${escapeHtml(fmtNumber(item.realizedPnl, 0))}</span>
              </div>`,
            )
            .join("")}</div>`
        : ""
    }
  </section>`;
}

function reviewPriorityLabel(priority) {
  if (priority === "high") return "高";
  if (priority === "medium") return "中";
  return "提示";
}

function reviewPriorityClass(priority) {
  if (priority === "high") return "red";
  if (priority === "medium") return "amber";
  return "green";
}

function reviewStatusLabel(status) {
  if (status === "done") return "已完成";
  if (status === "ignored") return "已忽略";
  return "待处理";
}

function reviewStatusClass(status) {
  if (status === "done") return "green";
  if (status === "ignored") return "amber";
  return "";
}

function tradeReviewActionsBlock(actions) {
  const rows = (actions || []).slice(0, 8);
  if (!rows.length) return "";
  const openCount = rows.filter((item) => (item.status || "open") === "open").length;
  return `<section class="review-actions">
    <div class="row">
      <h3>复盘待办</h3>
      <span class="muted">${escapeHtml(openCount)} 项待处理</span>
    </div>
    ${rows
      .map(
        (item) => `<article class="review-action ${item.status && item.status !== "open" ? "resolved" : ""}">
          <div class="row">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="tag ${reviewPriorityClass(item.priority)}">${escapeHtml(reviewPriorityLabel(item.priority))}</span>
          </div>
          <div class="feed-meta">
            <span class="tag ${reviewStatusClass(item.status)}">${escapeHtml(reviewStatusLabel(item.status))}</span>
            <span class="tag">${escapeHtml(item.category)}</span>
          </div>
          <p>${escapeHtml(item.reason)}</p>
          <p class="muted">${escapeHtml(item.nextStep)}</p>
          ${
            (item.evidence || []).length
              ? `<div class="feed-meta">${item.evidence
                  .map((line) => `<span class="tag">${escapeHtml(line)}</span>`)
                  .join("")}</div>`
              : ""
          }
          ${
            item.note
              ? `<p class="muted">处理备注：${escapeHtml(item.note)}</p>`
              : ""
          }
          <div class="review-action-controls">
            <button class="icon-text" type="button" data-review-action-id="${escapeHtml(item.id)}" data-review-action-status="${escapeHtml(item.status || "open")}" data-review-action-note-edit="true" data-review-action-note-value="${escapeHtml(item.note || "")}">备注</button>
            ${
              (item.status || "open") === "open"
                ? `<button class="icon-text" type="button" data-review-action-id="${escapeHtml(item.id)}" data-review-action-status="done">完成</button>
                   <button class="icon-text danger" type="button" data-review-action-id="${escapeHtml(item.id)}" data-review-action-status="ignored">忽略</button>`
                : `<button class="icon-text" type="button" data-review-action-id="${escapeHtml(item.id)}" data-review-action-status="open">重开</button>`
            }
          </div>
        </article>`,
      )
      .join("")}
  </section>`;
}

function tradePerformanceBlock(performance) {
  if (!performance?.closedLots) return "";
  const tables = [
    tradePerformanceTable("按策略", performance.byStrategy),
    tradePerformanceTable("按标签", performance.byTag),
    tradePerformanceTable("按情绪", performance.byEmotion),
    tradePerformanceTable("持仓周期", performance.byHoldingPeriod),
    tradePerformanceTable("月度", performance.byMonth, { limit: 6 }),
    tradePerformanceTable("计划完整度", performance.byPlanQuality, { limit: 4 }),
  ].filter(Boolean);
  if (!tables.length) return "";
  return `<div class="trade-performance">
    <div class="row">
      <strong>复盘归因</strong>
      <span class="tag">${escapeHtml(performance.closedLots)} 段平仓</span>
    </div>
    ${tradeRiskStatsBlock(performance.stats)}
    <div class="trade-performance-grid">${tables.join("")}</div>
  </div>`;
}

function tradeOptionFifoBlock(optionFifo) {
  if (!optionFifo?.tradeCount && !optionFifo?.closedLots?.length && !optionFifo?.openLots?.length) return "";
  const recentClosed = (optionFifo.closedLots || []).slice(0, 6);
  return `<section class="trade-option-fifo">
    <div class="row">
      <h3>期权 FIFO 分账</h3>
      <span class="tag">${escapeHtml(optionFifo.schemaVersion || "option-fifo")}</span>
    </div>
    <div class="trade-summary">
      ${metric(optionFifo.tradeCount || 0, "期权操作")}
      ${metric((optionFifo.closedLots || []).length, "平仓段")}
      ${metric((optionFifo.openLots || []).length, "未平仓lot")}
      ${metric(fmtNumber(optionFifo.realizedPnl || 0, 0), "已实现")}
      ${metric((optionFifo.unmatchedCloses || []).length, "未匹配平仓")}
    </div>
    ${
      recentClosed.length
        ? `<div class="closed-lot-list">${recentClosed
            .map(
              (item) => `<div class="closed-lot-row">
                <div>
                  <strong>${escapeHtml(item.underlyingTicker || item.ticker || item.optionSymbol || "-")}</strong>
                  <p class="muted">${escapeHtml(item.optionSymbol || "")} · ${escapeHtml(fmtTime(item.closedAt))} · ${escapeHtml(fmtNumber(item.quantity, 2))} 张</p>
                </div>
                <span class="${tradePnlClass(item.realizedPnl)}">${escapeHtml(fmtNumber(item.realizedPnl, 0))}</span>
              </div>`,
            )
            .join("")}</div>`
        : `<p class="muted">暂无已匹配的期权平仓段。</p>`
    }
    ${
      (optionFifo.unmatchedCloses || []).length
        ? `<p class="muted">存在未匹配平仓，通常是历史开仓未导入、合约代码不一致，或券商导出字段缺失。</p>`
        : ""
    }
  </section>`;
}

function tradeTickerReviewBlock(rows) {
  const data = (rows || [])
    .slice()
    .sort(
      (a, b) =>
        Math.abs(Number(b.realizedPnl || 0) + Number(b.unrealizedPnl || 0)) -
        Math.abs(Number(a.realizedPnl || 0) + Number(a.unrealizedPnl || 0)),
    )
    .slice(0, 10);
  if (!data.length) return "";
  return `<section class="trade-ticker-review">
    <div class="row">
      <h3>按标的复盘</h3>
      <span class="muted">${escapeHtml(data.length)} 个 ticker</span>
    </div>
    <div class="trade-ticker-table">
      <div class="trade-ticker-row head">
        <span>标的</span><span>持仓</span><span>均价/现价</span><span>已实现</span><span>未实现</span><span>胜负</span>
      </div>
      ${data
        .map((row) => {
          const winLoss = `${row.wins || 0}/${row.losses || 0}`;
          const costLine = Number.isFinite(row.averageCost)
            ? `${fmtNumber(row.averageCost, 2)} / ${Number.isFinite(row.latestPrice) ? fmtNumber(row.latestPrice, 2) : "-"}`
            : "-";
          return `<div class="trade-ticker-row">
            <span>
              <strong>${escapeHtml(tickerLabel(row.ticker, { ...row, run: appState?.latest }))}</strong>
              <small>${escapeHtml(String(row.trades ?? 0))} 笔 · 买 ${escapeHtml(String(row.buys ?? 0))} / 卖 ${escapeHtml(String(row.sells ?? 0))}</small>
            </span>
            <span>${escapeHtml(fmtNumber(row.openQuantity, 4))}</span>
            <span>${escapeHtml(costLine)}</span>
            <span class="${tradePnlClass(row.realizedPnl)}">${escapeHtml(fmtNumber(row.realizedPnl, 0))}</span>
            <span class="${tradePnlClass(row.unrealizedPnl)}">${escapeHtml(Number.isFinite(row.unrealizedPnl) ? fmtNumber(row.unrealizedPnl, 0) : "-")}</span>
            <span>${escapeHtml(winLoss)}</span>
          </div>`;
        })
        .join("")}
    </div>
  </section>`;
}

function traderProfileMetricValue(cell, digits = 1) {
  if (!cell || cell.status !== "ok") return "-";
  const value = Number(cell.value);
  if (!Number.isFinite(value)) return "-";
  return `${fmtNumber(value, digits)}${cell.unit || ""}`;
}

function traderProfileMetricRow(label, cell, digits = 1) {
  const status = cell?.status === "ok" ? "green" : "amber";
  return `<div class="performance-row">
    <span>${escapeHtml(label)}</span>
    <span>${escapeHtml(traderProfileMetricValue(cell, digits))}</span>
    <span><span class="tag ${status}">n=${escapeHtml(cell?.n ?? 0)}</span></span>
    <span>${escapeHtml(cell?.status === "ok" ? "可用" : "样本不足")}</span>
  </div>`;
}

function traderProfileBlock(traderProfile, mirrorConfig = {}) {
  const current = traderProfile?.current || null;
  const sync = traderProfile?.tradeSync?.longbridge || mirrorConfig?.lastSync || null;
  const syncLabel = sync?.status
    ? `${sync.status === "ok" ? "同步成功" : "同步异常"} · ${fmtTime(sync.completedAt || sync.lastSyncAt)}`
    : "尚未同步 Longbridge 成交";
  if (!current) {
    return `<section class="trader-profile-card">
      <div class="row">
        <h3>交易画像</h3>
        <span class="tag amber">未生成</span>
      </div>
      <p class="muted">暂无操作画像。可以先导入交易记录，或同步 Longbridge 成交后生成。</p>
      <div class="trade-actions">
        <button class="icon-text" type="button" data-refresh-trader-profile>刷新画像</button>
        <button class="icon-text" type="button" data-sync-longbridge-trades>同步 Longbridge 成交</button>
      </div>
      <p class="muted">${escapeHtml(syncLabel)}</p>
    </section>`;
  }
  const samples = current.sampleCounts || {};
  const tags = (current.styleTags || []).slice(0, 8);
  const rows = [
    ["胜率", current.results?.winRate, 1],
    ["盈利因子", current.results?.profitFactor, 2],
    ["期望收益", current.results?.expectancyPct, 2],
    ["追高率", current.entryBehavior?.chaseRate, 1],
    ["回调买入率", current.entryBehavior?.pullbackRate, 1],
    ["MFE 捕获率", current.exitBehavior?.mfeCapturePct, 1],
    ["最大单名义占比", current.sizing?.maxSingleNameSharePct, 1],
    ["跟随系统比例", current.systemOverlap?.followRate, 1],
  ];
  const overlap = current.systemOverlap || {};
  const narrative = current.narrative;
  return `<section class="trader-profile-card">
    <div class="row">
      <h3>交易画像</h3>
      <span class="tag ${current.status === "ok" ? "green" : "amber"}">${escapeHtml(current.status === "ok" ? "已生成" : current.status || "unknown")}</span>
    </div>
    <div class="trade-summary">
      ${metric(samples.trades || 0, "交易")}
      ${metric(samples.closedLots || 0, "闭合段")}
      ${metric(samples.openLots || 0, "未平仓")}
      ${metric(samples.barTickers || 0, "K线覆盖")}
    </div>
    <div class="feed-meta trade-status">
      <span class="tag">${escapeHtml(syncLabel)}</span>
      <span class="tag">${escapeHtml(mirrorConfig.llmEnabled ? "LLM 叙述已启用" : "LLM 叙述默认关闭")}</span>
      <span class="tag">${escapeHtml(mirrorConfig.weeklyRefreshEnabled ? "周刷新已启用" : "周刷新关闭")}</span>
    </div>
    <div class="trade-actions">
      <button class="icon-text" type="button" data-refresh-trader-profile>刷新画像</button>
      <button class="icon-text" type="button" data-sync-longbridge-trades>同步 Longbridge 成交</button>
    </div>
    ${
      samples.closedLots < 20
        ? `<p class="muted">闭合交易段少于 20，风格判断会保持样本不足，不会强行归因。</p>`
        : ""
    }
    <div class="feed-meta">
      ${tags.map((item) => `<span class="tag ${item.status === "ok" ? "green" : "amber"}" title="${escapeHtml((item.evidence || []).map((e) => `${e.metricId || ""} n=${e.n ?? ""}`).join("；"))}">${escapeHtml(`${item.axis}: ${item.tag}`)}</span>`).join("")}
    </div>
    <div class="performance-table trader-profile-table">
      <div class="performance-row head"><span>指标</span><span>数值</span><span>样本</span><span>状态</span></div>
      ${rows.map(([label, cell, digits]) => traderProfileMetricRow(label, cell, digits)).join("")}
    </div>
    <div class="trade-performance-card">
      <div class="row">
        <h3>系统重合度</h3>
        <span class="tag">n=${escapeHtml(overlap.followRate?.n ?? 0)}</span>
      </div>
      <p class="muted">跟随系统：${escapeHtml(traderProfileMetricValue(overlap.followRate, 1))}；跟随后平均超额：${escapeHtml(traderProfileMetricValue(overlap.followedOutcome, 2))}；本能交易平均超额：${escapeHtml(traderProfileMetricValue(overlap.ownerInstinctOutcome, 2))}；忽略后胜出：${escapeHtml(overlap.ignoredWinners?.value ?? "-")}。</p>
    </div>
    ${
      narrative
        ? `<div class="trade-performance-card">
            <div class="row"><h3>LLM 复盘叙述</h3><span class="tag ${narrative.status === "ok" ? "green" : "amber"}">${escapeHtml(narrative.status || "disabled")}</span></div>
            <p>${escapeHtml(narrative.styleNarrative || narrative.error || "LLM 叙述未生成。")}</p>
            ${(narrative.coachingInstructions || []).length ? `<ul>${narrative.coachingInstructions.slice(0, 4).map((item) => `<li>${escapeHtml(item.rule || item.why || "")}</li>`).join("")}</ul>` : ""}
          </div>`
        : ""
    }
  </section>`;
}

function renderTradeJournal(journal, reviews, ibkr) {
  if (!journal?.totals) {
    els.tradeJournalBox.innerHTML = `${empty("暂无操作记录。")}${traderProfileBlock(appState.traderProfile, appState.config?.traderMirror)}`;
    els.tradeReviewBox.innerHTML = "";
    return;
  }
  const totals = journal.totals;
  const ibkrStatus = ibkr?.flexConfigured
    ? `<span class="tag green">IBKR Flex 已配置</span>`
    : `<span class="tag amber">IBKR Flex 未配置</span>`;
  const recent = (journal.recentTrades || []).slice(0, 8);
  els.tradeJournalBox.innerHTML = `<div class="trade-summary">
    ${metric(totals.trades, "操作")}
    ${metric(fmtNumber(totals.realizedPnl, 0), "已实现")}
    ${metric(totals.winRate === null ? "-" : `${fmtNumber(totals.winRate, 1)}%`, "胜率")}
    ${metric(journal.historyCoverage?.snapshots || 0, "历史快照")}
  </div>
  <div class="feed-meta trade-status">
    ${ibkrStatus}
    <span class="tag">买入 ${escapeHtml(totals.buys)}</span>
    <span class="tag">卖出 ${escapeHtml(totals.sells)}</span>
    <span class="tag">缺少计划 ${escapeHtml(totals.missingPlan)}</span>
  </div>
  <div class="trade-insights">${(journal.insights || [])
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("")}</div>
  ${traderProfileBlock(appState.traderProfile, appState.config?.traderMirror)}
  ${tradeMemoryBlock(journal.tradeMemory)}
  ${tradeTickerReviewBlock(journal.byTicker)}
  ${tradeOptionFifoBlock(journal.optionFifo)}
  ${tradeReviewActionsBlock(journal.reviewActions)}
  ${tradePerformanceBlock(journal.performance)}
  ${
    recent.length
      ? `<div class="trade-list">${recent
          .map(
            (trade) => `<article class="trade-row">
              <div>
                <div class="row">
                  <strong>${escapeHtml(tickerLabel(trade.ticker, { ...trade, run: appState?.latest }))} · ${escapeHtml(tradeSideLabel(trade.side))}</strong>
                  <span class="tag ${trade.side === "buy" ? "green" : "amber"}">${escapeHtml(trade.source || "manual")}</span>
                </div>
                <p class="muted">${fmtTime(trade.executedAt)} · ${escapeHtml(trade.quantity)} 股 · ${fmtNumber(trade.price)} · 费用 ${fmtNumber(trade.fees, 2)}</p>
                <p class="muted">${escapeHtml(tradeContextLine(trade))}</p>
                ${
                  trade.strategy || trade.thesis || trade.notes
                    ? `<p>${escapeHtml([trade.strategy, trade.thesis, trade.notes].filter(Boolean).join(" / "))}</p>`
                    : ""
                }
              </div>
              <div class="trade-row-actions">
                <button class="icon-text" type="button" data-edit-trade="${escapeHtml(trade.id)}">编辑</button>
                <button class="icon-text danger" type="button" data-delete-trade="${escapeHtml(trade.id)}">删除</button>
              </div>
            </article>`,
          )
          .join("")}</div>`
      : empty("暂无最近操作。")
  }`;
  const latestReview = reviews?.[0];
  els.tradeReviewBox.innerHTML = latestReview
    ? `<div class="trade-review">
        <div class="row">
          <strong>最近复盘</strong>
          <span class="tag">${escapeHtml(latestReview.provider || "local")}</span>
        </div>
        <p class="muted">${fmtTime(latestReview.createdAt)}</p>
        <div class="llm-block">${escapeHtml(latestReview.content || "")}</div>
      </div>`
    : "";
}

function factorPortfolioBlock(layer, run = null) {
  if (!layer?.byTicker?.length) return "";
  const top = layer.topCandidates || layer.byTicker.slice(0, 8);
  const weights = layer.portfolio?.suggestedWeights || [];
  const aggregate = layer.simulation?.aggregate || {};
  return `<section class="factor-portfolio">
    <div class="row">
      <div>
        <h3>因子组合层</h3>
        <p class="muted">${escapeHtml(layer.framework || "当前快照的因子评分和轻量回看。")}</p>
      </div>
      <span class="tag">${escapeHtml(layer.universe?.tickers?.length || layer.byTicker.length)} 个标的</span>
    </div>
    <div class="status-grid">
      ${metric(aggregate.averageReturn5d === null || aggregate.averageReturn5d === undefined ? "-" : `${fmtNumber(aggregate.averageReturn5d, 2)}%`, "样本5日均值")}
      ${metric(aggregate.averageReturn20d === null || aggregate.averageReturn20d === undefined ? "-" : `${fmtNumber(aggregate.averageReturn20d, 2)}%`, "样本20日均值")}
      ${metric(aggregate.sampleSize || 0, "回看样本")}
    </div>
    <div class="factor-grid">${top
      .map((row) => `<article>
        <div class="row">
          <h4>${escapeHtml(tickerLabel(row.ticker, { ...row, run }))}</h4>
          <span class="tag ${row.totalScore >= 75 ? "green" : row.totalScore >= 62 ? "amber" : ""}">${escapeHtml(row.ratingZh)} · ${escapeHtml(row.totalScore)}</span>
        </div>
        <p>${escapeHtml(row.actionZh || "")}</p>
        <div class="mini-kv">
          ${indicator("动量", row.factorScores?.momentum ?? "-")}
          ${indicator("质量", row.factorScores?.qualityGrowth ?? "-")}
          ${indicator("催化", row.factorScores?.sentimentCatalyst ?? "-")}
        </div>
      </article>`)
      .join("")}</div>
    ${
      weights.length
        ? `<div class="factor-weights"><h4>研究权重建议</h4>${weights
            .slice(0, 8)
            .map((item) => `<p><strong>${escapeHtml(tickerLabel(item.ticker, { ...item, run }))}</strong>：${escapeHtml(fmtNumber(item.targetWeightPct, 1))}% · ${escapeHtml(item.reason || "")}</p>`)
            .join("")}</div>`
        : ""
    }
    <p class="muted">${escapeHtml(layer.simulation?.caveat || "")}</p>
  </section>`;
}

function renderBacktest(run) {
  const backtest = run?.backtest;
  const factorBlock = factorPortfolioBlock(run?.factorLayer, run);
  if (!backtest?.perTicker?.length && !factorBlock) {
    els.backtestBox.innerHTML = empty("暂无回测。运行采集后显示。");
    return;
  }
  const backtestHtml = backtest?.perTicker?.length ? `<div class="status-grid">
    ${metric(`${fmtNumber(backtest.averageBullishReturn, 2)}%`, "偏积极均收益")}
    ${metric(backtest.perTicker.length, "标的")}
    ${metric(backtest.horizon, "周期")}
  </div>
  <div class="backtest-grid">${backtest.perTicker
    .slice(0, 8)
    .map(
      (row) => `<article class="backtest-card">
        <div class="row">
          <h3>${escapeHtml(tickerLabel(row.ticker, { ...row, run }))}</h3>
          <span class="tag ${row.latestSignal === "bullish" ? "green" : "amber"}">${escapeHtml(signalLabel(row.latestSignal))}</span>
        </div>
        <div class="indicator-grid">
          ${indicator("样本", row.sampleSize)}
          ${indicator("偏积极胜率", row.bullish.winRate === null ? "-" : `${fmtNumber(row.bullish.winRate, 1)}%`)}
          ${indicator("偏积极收益", row.bullish.avgReturn === null ? "-" : `${fmtNumber(row.bullish.avgReturn, 2)}%`)}
        </div>
      </article>`,
    )
    .join("")}</div>
  <p class="muted">${escapeHtml(backtest.caveat)}</p>` : "";
  els.backtestBox.innerHTML = `${factorBlock}${backtestHtml}`;
}

function alertStatusLabel(status) {
  return status === "dismissed" ? "已忽略" : "待处理";
}

function sortedAlerts(alerts) {
  return (alerts || []).slice().sort((a, b) => {
    const aDismissed = a.status === "dismissed" ? 1 : 0;
    const bDismissed = b.status === "dismissed" ? 1 : 0;
    return aDismissed - bDismissed || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });
}

function renderAlerts(run) {
  const alerts = sortedAlerts(run?.alerts || appState.alerts || []);
  if (!alerts.length) {
    els.alertsBox.innerHTML = empty("暂无提醒。");
    return;
  }
  const activeCount = alerts.filter((alert) => alert.status !== "dismissed").length;
  els.alertsBox.innerHTML = `<div class="feed-meta alert-summary">
    <span class="tag">${escapeHtml(activeCount)} 条待处理</span>
    <span class="tag">${escapeHtml(alerts.length - activeCount)} 条已忽略</span>
  </div>${alerts
    .slice(0, 12)
    .map(
      (alert) => `<article class="alert-card ${escapeHtml(alert.severity)} ${alert.status === "dismissed" ? "dismissed" : ""}">
        <div class="row">
          <strong>${escapeHtml(alert.title)}</strong>
          <div class="feed-meta">
            <span class="tag ${alert.severity === "high" ? "red" : "amber"}">${escapeHtml(severityLabel(alert.severity))}</span>
            <span class="tag ${alert.status === "dismissed" ? "green" : ""}">${escapeHtml(alertStatusLabel(alert.status))}</span>
          </div>
        </div>
        <p class="muted">${escapeHtml(alert.detail)}</p>
        <div class="feed-meta">${(alert.evidenceIds || [])
          .map((id) => `<span class="tag">${escapeHtml(id)}</span>`)
          .join("")}</div>
        <div class="alert-actions">
          ${
            alert.status === "dismissed"
              ? `<button class="icon-text" type="button" data-alert-id="${escapeHtml(alert.id)}" data-alert-key="${escapeHtml(alert.alertKey || "")}" data-alert-status="active">重开</button>`
              : `<button class="icon-text danger" type="button" data-alert-id="${escapeHtml(alert.id)}" data-alert-key="${escapeHtml(alert.alertKey || "")}" data-alert-status="dismissed">忽略</button>`
          }
        </div>
      </article>`,
    )
    .join("")}`;
}

function indicator(label, value) {
  return `<div class="indicator"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function drawTechnicalCharts(technicals) {
  document.querySelectorAll("[data-tech-index]").forEach((canvas) => {
    const item = technicals[Number(canvas.dataset.techIndex)];
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const pad = 12;
    const points = item?.chart || [];
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fbfcfe";
    ctx.fillRect(0, 0, width, height);
    if (!points.length) {
      ctx.fillStyle = "#657184";
      ctx.font = "13px system-ui";
      ctx.fillText("暂无完整K线数据", pad, height / 2);
      return;
    }
    const values = points
      .flatMap((p) => [p.high, p.low, p.close, p.sma10, p.sma20])
      .filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scaleY = (value) =>
      height - pad - ((value - min) / Math.max(max - min, 0.0001)) * (height - pad * 2);
    const scaleX = (index) => pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2);
    ctx.strokeStyle = "#dbe2ea";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      const y = pad + (i / 2) * (height - pad * 2);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    const candleWidth = Math.max(2, Math.min(8, (width - pad * 2) / Math.max(points.length, 1) * 0.58));
    points.forEach((point, index) => {
      const x = scaleX(index);
      const open = Number.isFinite(point.open) ? point.open : point.close;
      const close = point.close;
      const high = Number.isFinite(point.high) ? point.high : Math.max(open, close);
      const low = Number.isFinite(point.low) ? point.low : Math.min(open, close);
      if (!Number.isFinite(close)) return;
      const up = close >= open;
      ctx.strokeStyle = up ? "#16856f" : "#c94b43";
      ctx.fillStyle = up ? "rgba(22, 133, 111, 0.16)" : "#c94b43";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, scaleY(high));
      ctx.lineTo(x, scaleY(low));
      ctx.stroke();
      const top = scaleY(Math.max(open, close));
      const bottom = scaleY(Math.min(open, close));
      const bodyHeight = Math.max(1, bottom - top);
      if (up) {
        ctx.strokeRect(x - candleWidth / 2, top, candleWidth, bodyHeight);
      } else {
        ctx.fillRect(x - candleWidth / 2, top, candleWidth, bodyHeight);
      }
    });
    const drawAverage = (key, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      points.forEach((point, index) => {
        if (!Number.isFinite(point[key])) return;
        const x = scaleX(index);
        const y = scaleY(point[key]);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (started) ctx.stroke();
    };
    drawAverage("sma10", "#255ec7");
    drawAverage("sma20", "#d38a18");
    ctx.fillStyle = "#657184";
    ctx.font = "12px system-ui";
    ctx.fillText(`${fmtNumber(max)} 高点`, pad, 16);
    ctx.fillText(`${fmtNumber(min)} 低点`, pad, height - 6);
    ctx.fillStyle = "#255ec7";
    ctx.fillText("MA10", width - 84, 16);
    ctx.fillStyle = "#d38a18";
    ctx.fillText("MA20", width - 46, 16);
  });
}

function renderFeeds(run) {
  if (!run) {
    els.newsList.innerHTML = empty("暂无新闻。");
    els.filingList.innerHTML = empty("暂无 SEC 文件。");
    return;
  }
  const news = sortFeedItems([...run.news, ...run.videos]);
  els.newsList.innerHTML = news.length
    ? news.slice(0, 28).map(feedItem).join("")
    : empty("暂无新闻或视频。");
  const filings = sortFeedItems(run.filings || []);
  els.filingList.innerHTML = filings.length
    ? filings.slice(0, 28).map(feedItem).join("")
    : empty("暂无 SEC 文件。");
}

function articleInvestmentBlock(item, heading = "AI 投资观察与建议") {
  const article = item?.article || {};
  const memo = article.investmentMemo || item?.catalyst?.investmentMemo || null;
  const bullCase = uniqueCompactRows([memo?.bullCase || []], 1);
  const bearCase = uniqueCompactRows([memo?.bearCase || []], 1);
  const monitor = uniqueCompactRows([memo?.monitor || []], 1);
  if (!bullCase.length && !bearCase.length && !monitor.length) return "";
  const provider = article.llmBased
    ? `LLM：${article.llmProvider || "已执行"}`
    : article.status === "ok"
      ? "已读原文：本地 AI 规则"
      : "标题级：本地 AI 规则";
  const list = (title, items) =>
    items?.length
      ? `<section><h4>${escapeHtml(title)}</h4><ul>${items.slice(0, 3).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></section>`
      : "";
  return `<div class="article-investment-memo">
    <div class="row">
      <strong>${escapeHtml(heading === "AI 投资观察与建议" ? "补充依据" : heading)}</strong>
      <span class="tag ${article.llmBased ? "green" : "amber"}">${escapeHtml(provider)}</span>
    </div>
    <div class="article-memo-grid compact">${list("看多依据", bullCase)}${list("风险", bearCase)}${list("跟踪触发器", monitor)}</div>
  </div>`;
}

function articleBriefBlock(item = {}) {
  const brief = item.brief || {};
  if (!brief.fact && !brief.impact && !brief.verification && !brief.sentiment && !brief.scope) return "";
  const sentiment = brief.sentiment || {};
  const scope = brief.scope || {};
  const themes = Array.isArray(scope.themes) ? scope.themes.filter(Boolean).slice(0, 4) : [];
  const companies = Array.isArray(scope.affectedCompanies) ? scope.affectedCompanies.filter(Boolean).slice(0, 5) : [];
  return `<div class="article-brief-grid">
    <section>
      <strong>事实</strong>
      <p>${escapeHtml(brief.fact || "暂无可核验事实，需回到原文。")}</p>
    </section>
    <section>
      <strong>影响</strong>
      <p>${escapeHtml(brief.impact || "暂未确认对收入、利润率、指引或估值假设的影响。")}</p>
    </section>
    <section>
      <strong>核验</strong>
      <p>${escapeHtml(brief.verification || "优先核对公司公告、财报原文和价格成交量。")}</p>
    </section>
    <section>
      <strong>判断</strong>
      <p>${escapeHtml(sentiment.type || "中性")} · 置信度 ${escapeHtml(sentiment.confidence || "待确认")} · 影响 ${escapeHtml(scope.level || "待定")}</p>
      <div class="feed-meta compact-tags">
        ${themes.map((theme) => `<span class="tag amber">${escapeHtml(theme)}</span>`).join("")}
        ${companies.map((ticker) => `<span class="tag">${escapeHtml(tickerLabel(ticker, { run: appState?.latest }))}</span>`).join("")}
      </div>
    </section>
  </div>`;
}

function feedItem(item) {
  const href = item.finalUrl || item.article?.finalUrl || item.resolvedUrl || item.url;
  const itemSummary = displayNewsSummary(item.summaryZh || "", item);
  const articleSummary = displayNewsSummary(item.article?.summaryZh || "", item);
  const articleEvidence = item.article?.evidenceLines || [];
  const articleStatus =
    item.article?.llmError
      ? `LLM 摘要失败：${errorLabel(item.article.llmError)}`
      : item.article?.status === "error"
        ? `原文抽取失败：${errorLabel(item.article.error || "")}`
        : item.article?.status === "source-limited"
          ? `原文受限：${errorLabel(item.article.reason || item.article.error || "")}`
        : item.article?.status === "skipped" && item.type === "news"
          ? `原文未抽取：${errorLabel(item.article.reason || "")}`
          : "";
  const typeLabel =
    item.type === "filing"
      ? item.form || "SEC 文件"
      : item.type === "video"
        ? "视频"
        : item.type === "social"
          ? "社交"
          : "新闻";
  const tagClass = item.type === "filing" ? "amber" : item.type === "video" ? "" : "green";
  const triad = triadFromItem(item, {
    conclusion: item.article?.investmentView || articleSummary || itemSummary || displayTitle(item),
    evidence: articleEvidence.length ? articleEvidence.join("；") : evidenceFromItem(item),
    observation: item.article?.investmentAdvice || observationFromItem(item),
  });
  const secInsight = item.secInsight
    ? `<div class="sec-insight">
        <div class="feed-meta">
          <span class="tag ${item.secInsight.priority === "high" ? "red" : "amber"}">${escapeHtml(severityLabel(item.secInsight.priority))}</span>
          ${(item.secInsight.itemNumbers || [])
            .slice(0, 4)
            .map((num) => `<span class="tag">Item ${escapeHtml(num)}</span>`)
            .join("")}
          ${(item.secInsight.topics || [])
            .map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`)
            .join("")}
          <span class="tag">${escapeHtml(item.secInsight.extractStatus === "extracted" ? "已提取片段" : "已分类")}</span>
        </div>
        <p class="muted">${escapeHtml(item.secInsight.summaryZh || item.secInsight.summary || "")}</p>
        ${(item.secInsight.keyFindings || [])
          .slice(0, 3)
          .map((finding) => `<p class="muted">- ${escapeHtml(finding)}</p>`)
          .join("")}
        ${secExhibitList(item.secInsight.exhibits || [])}
        ${(item.secInsight.sections || [])
          .slice(0, 2)
          .map((section) => `<blockquote>${escapeHtml(section)}</blockquote>`)
          .join("")}
      </div>`
    : "";
  return `<article class="feed-item">
    <h3><a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(
      item.secInsight?.eventTitleZh ? `${tickerLabel(item.ticker, { ...item, run: appState?.latest })} ${item.secInsight.eventTitleZh}` : displayTitle(item),
    )}</a></h3>
    ${renderInsightTriad(triad)}
    ${articleBriefBlock(item)}
    ${articleStatus && !articleSummary ? `<p class="muted">${escapeHtml(articleStatus)}</p>` : ""}
    ${articleInvestmentBlock(item)}
    <div class="feed-meta">
      <span class="tag ${tagClass}">${escapeHtml(typeLabel)}</span>
      ${newsRelevanceTag(item)}
      ${aiProvenanceTag(item)}
      <span>${escapeHtml(item.ticker ? tickerLabel(item.ticker, { ...item, run: appState?.latest }) : "")}</span>
      <span>${escapeHtml(sourceLabel(item.publisher || item.source || ""))}</span>
      <span>${fmtTime(item.publishedAt)}</span>
    </div>
    ${secInsight}
  </article>`;
}

function empty(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function renderChat(chat) {
  if (!chat.length) {
    els.chatLog.innerHTML = empty("先运行一次采集，然后问我关于关注列表的问题。");
    return;
  }
  els.chatLog.innerHTML = chat
    .map(
      (item) =>
        `<div class="message ${item.role}">${escapeHtml(item.content)}${
          item.provider ? `\n\n[${escapeHtml(item.provider)}]` : ""
        }</div>`,
    )
    .join("");
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function scheduleHealthLabel(status) {
  if (status === "ok") return "正常";
  if (status === "attention") return "需关注";
  if (status === "warn") return "告警";
  return "未知";
}

function scheduleHealthClass(status) {
  if (status === "ok") return "green";
  if (status === "warn") return "red";
  return "amber";
}

function renderSchedule(schedule, email, emailLog = []) {
  const scheduleProviderLabel = providerLabel(schedule?.llmProvider || "local");
  const catchUpMinutes = Number(schedule?.catchUpMinutes || 0);
  const pendingCatchUp = schedule?.pendingCatchUp;
  const health = schedule?.health || {};
  const healthBlock = `<div class="schedule-row compact-row schedule-health-row">
    <div>
      <strong>任务健康</strong>
      <p class="muted">最近报告：${escapeHtml(health.lastRunAt ? fmtTime(health.lastRunAt) : "暂无")} · ${
        Number.isFinite(Number(health.ageHours)) ? `${escapeHtml(fmtNumber(health.ageHours, 1))} 小时前` : "未采集"
      }</p>
      <p class="muted">最近邮件：${escapeHtml(health.lastEmailStatus ? emailStatusLabel(health.lastEmailStatus) : "暂无")} · 下一次：${escapeHtml(health.nextRunAt ? fmtTime(health.nextRunAt) : "-")}</p>
      ${health.lastEmailReason ? `<p class="quality-error">${escapeHtml(health.lastEmailReason)}</p>` : ""}
    </div>
    <span class="tag ${scheduleHealthClass(health.status)}">${escapeHtml(scheduleHealthLabel(health.status))}</span>
  </div>`;
  const rows = (schedule.next || []).map((item) => {
    return `<div class="schedule-row">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <p class="muted">纽约时间 ${escapeHtml(item.newYorkDate)} ${escapeHtml(
          item.newYorkTime,
        )}</p>
      </div>
      <span class="tag">${fmtTime(item.localTime)}</span>
    </div>`;
  });
  const catchUpBlock = `<div class="schedule-row compact-row">
    <div>
      <strong>补跑窗口</strong>
      <p class="muted">错过精确时间后 ${escapeHtml(catchUpMinutes)} 分钟内，服务会补跑未执行的计划任务。</p>
      ${
        pendingCatchUp
          ? `<p class="quality-error">当前待补跑：${escapeHtml(pendingCatchUp.job?.label || pendingCatchUp.key)}，已过 ${escapeHtml(pendingCatchUp.elapsedMinutes)} 分钟。</p>`
          : ""
      }
    </div>
  </div>`;
  const history = (schedule?.history || []).slice(0, 6);
  const historyBlock = history.length
    ? `<div class="schedule-history">
        <h3>最近定时运行</h3>
        ${history
          .map((item) => `<div class="schedule-row compact-row">
            <div>
              <strong>${escapeHtml(item.label || item.session || "-")}</strong>
              <p class="muted">纽约日期 ${escapeHtml(item.newYorkDate || "-")} · 报告 ${escapeHtml(item.runId || "-")}</p>
              ${
                item.emailStatus
                  ? `<p class="muted">邮件：${escapeHtml(emailStatusLabel(item.emailStatus))}${
                      item.emailReason ? ` · ${escapeHtml(item.emailReason)}` : ""
                    }</p>`
                  : `<p class="muted">邮件：暂无记录</p>`
              }
            </div>
            <span class="tag ${emailStatusTagClass(item.emailStatus)}">${escapeHtml(
              item.completedAt ? fmtTime(item.completedAt) : jobStatusLabel(item.status || "recorded"),
            )}</span>
          </div>`)
          .join("")}
      </div>`
    : `<div class="schedule-history">${empty("还没有定时运行记录。")}</div>`;
  const last = email?.last;
  const emailStatus = email?.configured
    ? `<span class="tag green">${escapeHtml(email.provider === "resend" ? "Resend 已配置" : "SMTP 已配置")}</span>`
    : `<span class="tag amber">等待邮件配置</span>`;
  const lastStatus = last
    ? `<p class="muted">最近邮件：${escapeHtml(emailStatusLabel(last.status))} · ${fmtTime(
        last.sentAt || last.failedAt || last.createdAt,
      )}${last.reason ? ` · ${escapeHtml(last.reason)}` : ""}</p>`
    : `<p class="muted">还没有发送记录。</p>`;
  const emailBlock = `<div class="schedule-row email-report-row">
    <div>
      <strong>邮件报告</strong>
      <p class="muted">定时报告 LLM：${escapeHtml(scheduleProviderLabel)}</p>
      <p class="muted">收件人：${escapeHtml((email?.to || []).join(", ") || "-")}</p>
      ${lastStatus}
      ${
        email?.missing?.length
          ? `<p class="quality-error">缺少配置：${escapeHtml(email.missing.join("、"))}</p>`
          : ""
      }
    </div>
    <div class="email-actions">
      ${emailStatus}
      <button class="btn compact" type="button" data-send-report>发送最新报告</button>
    </div>
  </div>`;
  const emailHistory = (emailLog || []).slice(0, 5);
  const emailHistoryBlock = emailHistory.length
    ? `<div class="schedule-history email-history">
        <h3>最近邮件</h3>
        ${emailHistory
          .map((item) => `<div class="schedule-row compact-row">
            <div>
              <strong>${escapeHtml(item.subject || `${sessionLabel(item.session)}报告`)}</strong>
              <p class="muted">${escapeHtml((item.to || []).join(", ") || "-")}</p>
              ${item.reason ? `<p class="quality-error">${escapeHtml(item.reason)}</p>` : ""}
            </div>
            <span class="tag ${emailStatusTagClass(item.status)}">${escapeHtml(
              `${emailStatusLabel(item.status)} · ${fmtTime(item.sentAt || item.failedAt || item.createdAt)}`,
            )}</span>
          </div>`)
          .join("")}
      </div>`
    : "";
  els.scheduleBox.innerHTML = `${healthBlock}${rows.join("") || empty("暂无计划。")}${catchUpBlock}${historyBlock}${emailBlock}${emailHistoryBlock}`;
}

function renderIbkrPortal(portal = {}) {
  if (!els.ibkrPortalMeta) return;
  const imported = Number(portal.importedCount || 0);
  const updatedAt = portal.updatedAt ? fmtTime(portal.updatedAt) : "尚未导入";
  els.ibkrPortalMeta.innerHTML = [
    `<span class="tag ${portal.enabled ? "green" : "amber"}">${portal.enabled ? "已启用" : "未启用"}</span>`,
    `<span class="tag">${escapeHtml(imported)} 条已导入</span>`,
    `<span>${escapeHtml(updatedAt)}</span>`,
    Number.isFinite(Number(portal.autoUrlCount)) ? `<span>自动 URL ${escapeHtml(portal.autoUrlCount)}</span>` : "",
  ].filter(Boolean).join("");
}

function providerRecentError(key, dataQuality) {
  const patterns = {
    yahooNewsFallback: /Yahoo/i,
    redditSocial: /Reddit/i,
    apeWisdomSocial: /ApeWisdom/i,
    stocktwitsSocial: /Stocktwits/i,
    xSearch: /X Recent Search/i,
    nitterSearch: /Nitter/i,
    xhsCli: /XHS CLI|小红书/i,
    customSocialFeeds: /Custom Social Feed/i,
    openbb: /OpenBB/i,
    finnhub: /Finnhub/i,
    alphaVantage: /Alpha Vantage/i,
    youtubeApi: /YouTube Data API/i,
    youtubeFeeds: /YouTube RSS/i,
    articleExtractor: /Article Extractor/i,
    articleLlmSummary: /Article LLM Summary/i,
    newsapiHotNews: /NewsAPI/i,
    polygonHotNews: /Polygon|Massive/i,
    ibkrGateway: /IBKR Gateway Socket/i,
    ibkrClientPortal: /IBKR Options|Client Portal/i,
    ibkrPortal: /IBKR Portal/i,
    optionsChain: /Options|期权|Nasdaq Options|Yahoo Options|Finnhub Options|IBKR Options/i,
  };
  const pattern = patterns[key];
  if (!pattern) return "";
  const errors = [
    ...Object.values(dataQuality?.errorBySource || {}),
    ...(dataQuality?.errorSamples || []),
  ];
  const match = errors.find((item) =>
    pattern.test(`${item.source || ""} ${item.error || ""}`),
  );
  if (!match) return "";
  return `${sourceLabel(match.source || "")}${match.ticker ? ` ${match.ticker}` : ""}：${errorLabel(match.error || "")}`;
}

function dataSourceActionItems(providers, dataQuality) {
  const errors = [
    ...Object.values(dataQuality?.errorBySource || {}),
    ...(dataQuality?.errorSamples || []),
  ];
  const hasError = (pattern) => errors.some((item) => pattern.test(`${item.source || ""} ${item.error || ""}`));
  const rows = [];
  if (providers.youtubeFeeds && hasError(/YouTube RSS/i)) {
    rows.push({
      level: "high",
      title: "YouTube RSS 当前连不上",
      body: providers.youtubeYtDlp
        ? "YouTube RSS 异常时会继续使用 yt-dlp 搜索 fallback；若需要官方搜索和更稳定配额，再配置 YOUTUBE_API_KEY。"
        : "本机访问 youtube.com 超时；配置 YOUTUBE_API_KEY、换可访问网络/代理，或开启 YOUTUBE_YTDLP_ENABLED=true 作为无 key 搜索兜底。",
      pauseKeys: ["youtubeFeeds"],
    });
  } else if (!providers.youtubeApi && !providers.youtubeFeeds && !providers.youtubeYtDlp) {
    rows.push({
      level: "medium",
      title: "YouTube 未配置",
      body: "如果需要视频信号，配置 YOUTUBE_API_KEY、YOUTUBE_FEED_URLS，或开启 YOUTUBE_YTDLP_ENABLED=true；否则这个源可以忽略。",
    });
  }
  if (providers.xhsCli && hasError(/XHS CLI|小红书|登录已过期/i)) {
    rows.push({
      level: "high",
      title: "小红书登录已过期",
      body: "更新 XHS_COOKIE 后重启服务；如果近期不用小红书信号，可以清空 XHS_CLI_COMMAND 关闭该源。",
      pauseKeys: ["xhsCli"],
    });
  }
  if (hasError(/Yahoo Finance Search|403/i)) {
    rows.push({
      level: "medium",
      title: "Yahoo 新闻搜索被拦截",
      body: "系统已用 Finnhub 新闻和原文跳转兜底；若要扩大新闻覆盖，可补充可访问的新闻 API 或 OpenBB news provider。",
      pauseKeys: ["yahooNewsFallback"],
    });
  }
  if (!providers.xSearch) {
    rows.push({
      level: "medium",
      title: "X 官方搜索未接入",
      body: "要追踪 X 热议股票，需要 X_SEARCH_ENABLED=true 并配置 X_BEARER_TOKEN；否则继续使用 ApeWisdom/自定义源兜底。",
    });
  }
  if (providers.ibkrGateway && hasError(/IBKR Gateway Socket|IBKR Options|Client Portal/i)) {
    rows.push({
      level: "low",
      title: "IBKR Socket 未连通",
      body: "期权链和行情会先尝试 IBKR；如果 Gateway/TWS 未登录或端口未监听，系统会自动跳过并使用 Nasdaq/Finnhub/OpenBB 等 provider。",
    });
  } else if (!providers.ibkrGateway) {
    rows.push({
      level: "low",
      title: "IBKR Socket 未启用",
      body: "需要本机启动并登录 IB Gateway/TWS，设置 IBKR_GATEWAY_ENABLED=true 和 OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub；当前仍会用 fallback provider。",
    });
  }
  if (!providers.openai && !providers.gemini && !providers.geminiCli && !providers.antigravityCli && !providers.codexCli) {
    rows.push({
      level: "medium",
      title: "当前仅本地规则稳定可用",
      body: "本地规则可以完成采集、摘要、单股日报和聊天兜底；配置 Codex CLI、Antigravity CLI、Gemini API、Gemini CLI 或 OpenAI 后可增强深度分析。",
    });
  }
  return rows.slice(0, 6);
}

function diagnosticStatusLabel(status) {
  if (status === "ok") return "正常";
  if (status === "warn") return "警告";
  if (status === "fail") return "失败";
  return "跳过";
}

function diagnosticTagClass(status) {
  if (status === "ok") return "green";
  if (status === "warn") return "amber";
  if (status === "fail") return "red";
  if (status === "skipped") return "";
  return "";
}

function renderSourceControls(sourceControls = {}) {
  const available = Array.isArray(sourceControls.available) ? sourceControls.available : [];
  if (!available.length) return "";
  const disabled = new Set(Array.isArray(sourceControls.disabled) ? sourceControls.disabled : []);
  const updatedAt = sourceControls.updatedAt ? fmtTime(sourceControls.updatedAt) : "尚未调整";
  const rows = available
    .map((item) => {
      const paused = disabled.has(item.key);
      const envKeys = Array.isArray(item.envKeys) && item.envKeys.length ? item.envKeys.join(", ") : "";
      return `<label class="source-control-row">
        <input type="checkbox" data-source-control="${escapeHtml(item.key)}" ${paused ? "checked" : ""}>
        <span class="source-toggle-ui" aria-hidden="true"></span>
        <div>
          <strong>${escapeHtml(item.label || item.key)}</strong>
          <p class="muted">${escapeHtml(item.description || "")}</p>
          ${envKeys ? `<p class="muted">关联配置：${escapeHtml(envKeys)}</p>` : ""}
        </div>
        <span class="tag ${paused ? "amber" : "green"}">${paused ? "已暂停" : "运行中"}</span>
      </label>`;
    })
    .join("");
  return `<div class="quality-section source-controls">
    <div class="quality-row">
      <div>
        <h3>可选源开关</h3>
        <p class="muted">暂停会跳过对应采集器，适合网络慢、cookie 过期或上游反爬时使用。</p>
      </div>
      <span class="tag">更新：${escapeHtml(updatedAt)}</span>
    </div>
    ${rows}
  </div>`;
}

function renderCustomSocialFeeds(customSocialFeeds = {}) {
  const feeds = Array.isArray(customSocialFeeds.feeds) ? customSocialFeeds.feeds : [];
  const envCount = Number(customSocialFeeds.envCount || 0);
  const totalCount = Number(customSocialFeeds.totalCount || feeds.length + envCount);
  return `<form class="quality-section custom-feed-form" data-custom-social-feed-form>
    <div class="quality-row">
      <div>
        <h3>自定义社交源</h3>
        <p class="muted">支持 RSS、Atom、JSON feed。</p>
      </div>
      <span class="tag">${escapeHtml(totalCount)} 个</span>
    </div>
    <textarea data-custom-social-feeds rows="4" placeholder="https://example.com/feed.xml">${escapeHtml(feeds.join("\n"))}</textarea>
    <div class="custom-feed-actions">
      ${envCount ? `<span class="muted">.env：${escapeHtml(envCount)} 个</span>` : "<span></span>"}
      <button class="btn compact" type="submit">保存源</button>
    </div>
  </form>`;
}

function routeLabel(key) {
  const labels = {
    light: "轻任务",
    standard: "常规摘要",
    reasoning: "推理复盘",
    fallback: "快速摘要模型",
    heavy: "深度报告",
  };
  return labels[key] || key;
}

function renderLlmRouting(llmRouting = {}) {
  const cliRouting = llmRouting.codexCli || llmRouting.antigravityCli || llmRouting.geminiCli || {};
  const cliName = llmRouting.codexCli ? "Codex CLI" : llmRouting.antigravityCli ? "Antigravity CLI" : "Gemini CLI";
  const order = ["light", "standard", "reasoning", "fallback", "heavy"];
  const rows = order
    .filter((key) => cliRouting[key]?.model)
    .map((key) => `<div class="diagnostic-row">
      <div>
        <strong>${escapeHtml(routeLabel(key))}</strong>
        <p class="muted">${escapeHtml(cliRouting[key].model)}</p>
      </div>
      <span class="tag">${escapeHtml(cliRouting[key].timeoutMs || "-")}ms</span>
    </div>`)
    .join("");
  if (!rows) return "";
  const cooldown = Number(llmRouting.failureCooldownMs || 0);
  const cooldownRows = (llmRouting.cooldowns || [])
    .map((item) => `<div class="diagnostic-row">
      <div>
        <strong>${escapeHtml(`${providerLabel(item.provider)} · ${routeLabel(item.tier)}`)}</strong>
        <p class="muted">${escapeHtml(item.error || "外部 LLM 调用失败，正在等待重试。")}</p>
      </div>
      <span class="tag amber">${escapeHtml(`${Math.ceil(Number(item.remainingMs || 0) / 1000)} 秒`)}</span>
    </div>`)
    .join("");
  return `<div class="quality-section">
    <h3>CLI 模型路由</h3>
    <p class="muted">当前展示 ${escapeHtml(cliName)}；轻任务优先速度，深度报告优先推理；失败后最多重试三次，仍失败则明确终止对应任务。${cooldown ? `外部 LLM 失败后冷却 ${Math.round(cooldown / 1000)} 秒。` : ""}</p>
    ${rows}
    ${cooldownRows ? `<h3>冷却中的 LLM</h3>${cooldownRows}` : `<p class="muted">当前没有 LLM provider/tier 处于冷却状态。</p>`}
  </div>`;
}

function integrationReadinessClass(status) {
  if (status === "ok") return "green";
  if (status === "fallback") return "amber";
  if (status === "manual") return "red";
  if (status === "warn") return "amber";
  return "";
}

function renderIntegrationReadiness(config = {}) {
  const readiness = config.integrationReadiness || {};
  const items = Array.isArray(readiness.items) ? readiness.items : [];
  if (!items.length) return "";
  const counts = readiness.counts || {};
  const headerClass = counts.manual ? "red" : counts.fallback ? "amber" : "green";
  const rows = items
    .map((item) => {
      const verify = Array.isArray(item.verifyKeys) && item.verifyKeys.length ? item.verifyKeys.join("、") : "";
      return `<div class="diagnostic-row">
        <div>
          <strong>${escapeHtml(item.title || item.key)}</strong>
          <p class="muted">${escapeHtml(item.evidence || "尚未完成诊断。")}</p>
          ${item.fallback ? `<p class="muted">其他独立来源：${escapeHtml(item.fallback)}</p>` : ""}
          ${item.nextAction ? `<p class="muted">下一步：${escapeHtml(item.nextAction)}</p>` : ""}
          ${verify ? `<p class="muted">复检项：${escapeHtml(verify)}</p>` : ""}
        </div>
        <span class="tag ${integrationReadinessClass(item.status)}">${escapeHtml(item.statusLabel || item.label || item.status)}</span>
      </div>`;
    })
    .join("");
  return `<div class="quality-section">
    <div class="quality-row">
      <div>
        <h3>外部接入真实状态</h3>
        <p class="muted">${escapeHtml(readiness.summary || "正在汇总外部接入状态。")}</p>
      </div>
      <span class="tag ${headerClass}">${escapeHtml(counts.ok || 0)} 已接入 / ${escapeHtml((counts.warn || 0) + (counts.fallback || 0))} 部分可用 / ${escapeHtml(counts.manual || 0)} 待处理</span>
    </div>
    ${
      readiness.stale
        ? `<p class="quality-error">诊断可能已过期：${escapeHtml(readiness.staleReason || "配置已变化，请重新运行诊断。")}</p>`
        : ""
    }
    ${rows}
  </div>`;
}

function renderLearningLoopStatus(config = {}) {
  const loop = config.learningLoop || {};
  const status = loop.goLiveStatus || {};
  const scorecard = loop.llmKnowledgeScorecard || {};
  const switches = Array.isArray(status.switches) ? status.switches : [];
  const channels = Array.isArray(status.channels) ? status.channels : [];
  if (!switches.length && !channels.length) return "";
  const offCount = switches.filter((item) => item.status === "off").length;
  const switchRows = switches
    .map((item) => `<div class="diagnostic-row">
      <div>
        <strong>${escapeHtml(item.label || item.key)}</strong>
        <p class="muted">${escapeHtml(item.detail || item.key || "")}</p>
      </div>
      <span class="tag ${item.status === "on" ? "green" : "amber"}">${escapeHtml(item.status === "on" ? "已启用" : "未启用")}</span>
    </div>`)
    .join("");
  const channelRows = channels
    .map((item) => `<div class="diagnostic-row">
      <div>
        <strong>${escapeHtml(item.label || item.id)}</strong>
        <p class="muted">${escapeHtml(item.source || "")}</p>
      </div>
      <span class="tag ${item.status === "ready" ? "green" : item.status === "accruing" ? "amber" : "red"}">${escapeHtml(item.samples)}/${escapeHtml(item.minSamples)} · ${escapeHtml(item.daysToMinSamples === null ? "无速率" : `${item.daysToMinSamples}天`)}</span>
    </div>`)
    .join("");
  return `<div class="quality-section">
    <div class="quality-row">
      <div>
        <h3>学习闭环上线状态</h3>
        <p class="muted">${escapeHtml(status.summary || "学习通道状态未生成。")}</p>
      </div>
      <span class="tag ${offCount ? "amber" : "green"}">${escapeHtml(offCount)} 个关键开关关闭</span>
    </div>
    ${switchRows}
    ${channelRows ? `<h3>样本时钟</h3>${channelRows}` : ""}
    <p class="${scorecard.status === "ready" ? "muted" : "quality-error"}">LLM 知识通道：${escapeHtml(scorecard.status === "ready" ? "证据可读" : "样本不足")}；应用 ${escapeHtml(scorecard.applicationCount || 0)} 次，成熟 outcome ${escapeHtml(scorecard.maturedApplicationCount || 0)}/${escapeHtml(scorecard.minSamples || 20)}。</p>
  </div>`;
}

function diagnosticMapByKey(diagnostics = null) {
  return new Map((diagnostics?.rows || []).map((row) => [row.key, row]));
}

function diagnosticSummary(keys, diagnostics = null) {
  const map = diagnosticMapByKey(diagnostics);
  return keys
    .map((key) => map.get(key))
    .filter(Boolean)
    .filter((row) => row.status && row.status !== "ok")
    .map((row) => `${row.label || row.key}：${diagnosticStatusLabel(row.status)}${row.detail ? `，${row.detail}` : ""}`)
    .join("；");
}

function diagnosticAnyStatus(keys, diagnostics = null, statuses = []) {
  const map = diagnosticMapByKey(diagnostics);
  return keys.some((key) => statuses.includes(map.get(key)?.status));
}

function diagnosticFirstAction(keys, diagnostics = null) {
  const map = diagnosticMapByKey(diagnostics);
  return keys.map((key) => map.get(key)?.action).find(Boolean) || "";
}

function setupLinkCards(config = {}, diagnostics = null) {
  const providers = config.providers || {};
  const cards = [
    {
      key: "ibkr-socket",
      title: "IBKR Socket 行情/期权",
      done: diagnosticAnyStatus(["ibkr-gateway"], diagnostics, ["ok"]),
      status: "需登录",
      detail: diagnosticSummary(["ibkr-gateway", "ibkr-options"], diagnostics) || "IB Gateway/TWS Socket 尚未确认连通。",
      action: "打开 IB Gateway，选择 IB API 并完成登录；Live 用 4001，Paper 用 4002。登录后回到这里运行 IBKR 诊断。",
      fallback: "当前自动使用 Nasdaq 期权链、Nasdaq K线、Finnhub/OpenBB 行情和新闻兜底。",
      verify: "完成登录后测试 IBKR Gateway Socket、IBKR 行情/K线、IBKR 期权链 Socket。",
      whyManual: "需要输入 IBKR 账号、密码和二次验证，不能由应用自动代替完成。",
      env: "IBKR_GATEWAY_PORT / IBKR_GATEWAY_PORT_CANDIDATES",
      href: "/configuration.html",
      hrefLabel: "查看 IBKR 步骤",
    },
    {
      key: "longbridge",
      title: "Longbridge AI 数据源",
      done: diagnosticAnyStatus(["longbridge"], diagnostics, ["ok"]),
      status: providers.longBridge ? "需确认权限" : "需安装",
      detail: diagnosticSummary(["longbridge"], diagnostics) || "可补充行情、K线和新闻。",
      action: "安装 Longbridge CLI，完成 longbridge init / auth；本机已优先使用 LONG_BRIDGE_COMMAND 指向的 CLI。",
      fallback: "Longbridge 暂不参与期权链；期权继续使用 IBKR/Nasdaq/Yahoo/Finnhub。",
      verify: "运行 Longbridge 诊断，确认 quote、kline、news 可用。",
      whyManual: "登录授权和行情权限需要在 Longbridge 账户侧确认。",
      env: "LONG_BRIDGE_COMMAND / LONG_BRIDGE_ENABLED",
      href: "https://open.longbridge.cn/skill/install.md",
      hrefLabel: "打开 Longbridge 安装指南",
    },
    {
      key: "youtube-api",
      title: "YouTube Data API",
      done: Boolean(providers.youtubeApi),
      status: "缺 key",
      detail: diagnosticSummary(["youtube-api", "youtube-rss"], diagnostics) || "RSS 不稳定时需要 YouTube Data API key。",
      action: "在 Google Cloud Console 启用 YouTube Data API v3，创建 API key 后填入 YOUTUBE_API_KEY。",
      fallback: "当前可继续用 YouTube RSS；RSS 偶发 404/500 时会在数据质量里提示。",
      verify: "填入 key 后测试 YouTube Data API 和 YouTube RSS。",
      whyManual: "创建 API key 属于第三方持久访问凭证，需要你在 Google Cloud 账户里确认创建。",
      env: "YOUTUBE_API_KEY",
      href: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
      hrefLabel: "打开 Google Cloud",
    },
    {
      key: "x-search",
      title: "X 官方搜索",
      done: Boolean(providers.xSearch),
      status: "缺 token",
      detail: diagnosticSummary(["x-search"], diagnostics) || "需要 X Developer App 的 app-only Bearer Token；当前可由 ApeWisdom/Stocktwits trending 先补位。",
      action: "创建 Project/App，复制 Bearer Token，填入 X_BEARER_TOKEN；若套餐不足会返回 403。未配置前继续使用无 key 社交热榜。",
      fallback: "当前使用 ApeWisdom、Reddit RSS、Stocktwits Trending 和新闻回补发现热股。",
      verify: "填入 token 后测试 X 官方搜索。",
      whyManual: "创建 Bearer Token 属于第三方持久访问凭证，可能受 X 套餐限制，需要账户侧确认。",
      env: "X_BEARER_TOKEN",
      href: "https://developer.x.com/",
      hrefLabel: "打开 X Developer",
    },
    {
      key: "newsapi",
      title: "NewsAPI 财经热闻",
      done: Boolean(providers.newsapiHotNews),
      status: "缺 key",
      detail: diagnosticSummary(["newsapi-hot-news"], diagnostics) || "用于聚合财经站热闻，补强当日热门新闻发现。",
      action: "注册后复制 API key，填入 NEWSAPI_KEY。",
      fallback: "当前使用 Finnhub、OpenBB、SEC、RSS 和网页正文抽取兜底。",
      verify: "填入 key 后测试 NewsAPI 财经热闻。",
      whyManual: "创建 API key 属于第三方持久访问凭证，免费/付费套餐范围需要你确认。",
      env: "NEWSAPI_KEY",
      href: "https://newsapi.org/register",
      hrefLabel: "打开 NewsAPI",
    },
    {
      key: "polygon",
      title: "Polygon / Massive 新闻",
      done: Boolean(providers.polygonHotNews),
      status: "缺 key",
      detail: diagnosticSummary(["polygon-hot-news"], diagnostics) || "用于补充股票新闻端点和个股热闻。",
      action: "从 Polygon/Massive 控制台复制 key，填入 POLYGON_API_KEY；新闻端点可能需要对应套餐。",
      fallback: "当前个股新闻由 Finnhub、OpenBB、RSS 和原文抽取兜底。",
      verify: "填入 key 后测试 Polygon/Massive 新闻。",
      whyManual: "创建 API key 和选择套餐属于第三方账户操作，需要你确认。",
      env: "POLYGON_API_KEY",
      href: "https://polygon.io/dashboard/api-keys",
      hrefLabel: "打开 Polygon",
    },
    {
      key: "alpha-vantage",
      title: "Alpha Vantage 情绪新闻",
      done: Boolean(providers.alphaVantage),
      status: "缺 key",
      detail: diagnosticSummary(["alpha-vantage-news"], diagnostics) || "用于 News Sentiment 和备用行情；免费套餐频率低。",
      action: "申请 free API key，填入 ALPHAVANTAGE_API_KEY。",
      fallback: "当前热门新闻和行情由 RSS、Finnhub、OpenBB、Nasdaq fallback 覆盖。",
      verify: "填入 key 后测试 Alpha Vantage 热门新闻和备用行情。",
      whyManual: "申请 key 需要第三方账户表单确认，免费额度也需要你接受其条款。",
      env: "ALPHAVANTAGE_API_KEY",
      href: "https://www.alphavantage.co/support/#api-key",
      hrefLabel: "打开 Alpha Vantage",
    },
  ].filter((card) => !card.done);
  if (!cards.length) return "";
  return `<div class="quality-section setup-links">
    <div class="quality-row">
      <div>
        <h3>外部接入开通卡</h3>
        <p class="muted">这些项目需要第三方账户登录或创建 key。创建完成后在 <a href="/configuration.html" target="_blank" rel="noreferrer">配置中心</a> 填入变量并强制测试。</p>
      </div>
      <div class="setup-link-actions">
        <button class="btn compact" type="button" data-external-api-smoke>一键复检外部 API</button>
        <span class="tag amber">${escapeHtml(cards.length)} 项待接入</span>
      </div>
    </div>
    <div class="setup-link-grid">
      ${cards
        .map(
          (card) => `<article class="setup-link-card">
            <div class="row">
              <strong>${escapeHtml(card.title)}</strong>
              <span class="tag amber">${escapeHtml(card.status)}</span>
            </div>
            <p>${escapeHtml(card.detail)}</p>
            <p class="muted">${escapeHtml(card.action)}</p>
            <p class="muted"><strong>兜底：</strong>${escapeHtml(card.fallback || "当前会自动降级到已可用源。")}</p>
            <p class="muted"><strong>复检：</strong>${escapeHtml(card.verify || "填好配置后运行数据源诊断。")}</p>
            <p class="muted"><strong>需你确认：</strong>${escapeHtml(card.whyManual || "涉及第三方账户或凭证，需在账户侧确认。")}</p>
            <p class="muted">配置项：${escapeHtml(card.env)}</p>
            <div class="setup-link-actions">
              <a class="btn compact ghost" href="${escapeHtml(card.href)}" target="_blank" rel="noreferrer">${escapeHtml(card.hrefLabel)}</a>
              ${card.key === "ibkr-socket" ? `<button class="btn compact ghost" type="button" data-ibkr-smoke-test="AAPL">立即验证 IBKR</button><button class="btn compact" type="button" data-ibkr-wait-test="AAPL">等待登录并验证</button>` : ""}
            </div>
          </article>`,
        )
        .join("")}
    </div>
  </div>`;
}

function formatIbkrSmokeAlert(smoke = {}) {
  const lines = [
    smoke.summary || "IBKR smoke test 完成。",
    "",
    smoke.wait
      ? `等待状态：${smoke.wait.status === "socket-detected" ? "已发现 Socket" : "等待超时"}，耗时 ${fmtNumber(Number(smoke.wait.elapsedMs || 0) / 1000, 0)} 秒，尝试 ${smoke.wait.attempts || 0} 次。`
      : "",
    smoke.wait ? "" : "",
    ...(smoke.steps || []).map((step) => {
      const label = step.status === "ok" ? "OK" : step.status === "warn" ? "WARN" : "FAIL";
      return `${label} ${step.label}：${step.detail || ""}`;
    }),
  ];
  if (smoke.nextActions?.length) {
    lines.push("", "下一步：", ...smoke.nextActions.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function formatExternalProviderSmokeAlert(smoke = {}) {
  const lines = [
    smoke.summary || "外部 API smoke test 完成。",
    "",
    ...(smoke.rows || []).map((row) => {
      const label = row.status === "ok" ? "OK" : row.status === "warn" ? "WARN" : row.status === "skipped" ? "SKIP" : "FAIL";
      return `${label} ${row.label || row.key}：${row.detail || ""}`;
    }),
  ];
  if (smoke.fallback?.length) {
    lines.push("", "当前兜底：", ...smoke.fallback.map((item) => `- ${item}`));
  }
  if (smoke.nextActions?.length) {
    lines.push("", "下一步：", ...smoke.nextActions.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

function setupChecklistItems(config = {}, dataQuality = {}, diagnostics = null) {
  const providers = config.providers || {};
  const email = config.email || {};
  const openbb = config.openbb || {};
  const articles = config.articles || {};
  const options = config.optionsChain || {};
  const disabled = new Set(config.sourceControls?.disabled || []);
  const readiness = dataQuality?.readiness || {};
  const llmDiagnosticIssue = diagnosticSummary(["llm", "codex-cli", "antigravity-cli", "gemini-api", "gemini-cli"], diagnostics);
  const youtubeDiagnosticIssue = diagnosticSummary(["youtube-api", "youtube-rss"], diagnostics);
  const xDiagnosticIssue = diagnosticSummary(["x-search"], diagnostics);
  const xhsDiagnosticIssue = diagnosticSummary(["xhs"], diagnostics);
  const ibkrDiagnosticIssue = diagnosticSummary(["ibkr-gateway", "ibkr-options", "ibkr-marketdata", "ibkr-trading", "ibkr-flex", "ibkr-cp"], diagnostics);
  const ibkrPortalDiagnosticIssue = diagnosticSummary(["ibkr-portal"], diagnostics);
  const openbbDiagnosticIssue = diagnosticSummary(["openbb"], diagnostics);
  const longBridgeDiagnosticIssue = diagnosticSummary(["longbridge"], diagnostics);
  const emailDiagnosticIssue = diagnosticSummary(["email"], diagnostics);
  const rows = [
    {
      key: "core",
      label: "核心报告",
      status: readiness.status === "usable" || readiness.status === "clean" ? "done" : "warn",
      detail: readiness.summary || "需要运行一次采集生成健康度。",
      next: readiness.actions?.[0] || "运行一次手动刷新并查看数据质量。",
    },
    {
      key: "news",
      label: "新闻正文 + AI 投研摘要",
      status: articles.enabled ? "done" : "missing",
      detail: articles.enabled
        ? `正文抽取已启用，单轮预算 ${articles.runBudgetMs || "-"}ms；LLM 摘要 ${articles.llmSummaryEnabled ? "已启用" : "未启用"}。`
        : "ARTICLE_EXTRACT_ENABLED=false。",
      next: articles.enabled ? "若源站反爬，保留 Jina Reader fallback 或补充新闻 API。" : "开启 ARTICLE_EXTRACT_ENABLED=true。",
    },
    {
      key: "llm",
      label: "LLM 深度分析",
      status: diagnosticAnyStatus(["llm"], diagnostics, ["ok"])
        ? "done"
        : providers.codexCli || providers.antigravityCli || providers.geminiCli || providers.gemini || providers.openai
          ? "warn"
          : "warn",
      detail: llmDiagnosticIssue || (providers.codexCli
        ? "Codex CLI 已配置，失败时会自动本地兜底。"
        : providers.antigravityCli
          ? "Antigravity CLI 已配置，失败时会自动本地兜底。"
        : providers.geminiCli
          ? "Gemini CLI 已配置，失败时会自动本地兜底。"
        : providers.gemini
          ? "Gemini API 已配置。"
          : providers.openai
            ? "OpenAI 已配置。"
            : "当前只有本地规则稳定可用。"),
      next: providers.codexCli || providers.antigravityCli || providers.geminiCli || providers.gemini || providers.openai
        ? diagnosticFirstAction(["llm", "codex-cli", "antigravity-cli", "gemini-cli", "gemini-api"], diagnostics) || "若诊断超时，优先检查网络/登录态。"
        : "配置 Codex CLI、Antigravity CLI、Gemini API 或 OPENAI_API_KEY。",
    },
    {
      key: "social",
      label: "全市场社交发现",
      status: providers.apeWisdomSocial ? "done" : "warn",
      detail: providers.apeWisdomSocial
        ? "ApeWisdom 全市场热榜已启用，社交上升榜会优先展示非自选池机会。"
        : "缺少可用的全市场社交源。",
      next: providers.apeWisdomSocial ? "可进一步配置 X_BEARER_TOKEN、小红书 cookie、自定义 feed。" : "开启 SOCIAL_APEWISDOM_ENABLED=true。",
    },
    {
      key: "x",
      label: "X / Twitter",
      status: providers.xSearch ? "done" : "missing",
      detail: xDiagnosticIssue || (providers.xSearch ? "X 官方搜索已启用。" : "未配置 X_BEARER_TOKEN。"),
      next: diagnosticFirstAction(["x-search"], diagnostics) || "在 X Developer Portal 创建 Bearer Token，写入 X_SEARCH_ENABLED=true 和 X_BEARER_TOKEN。",
    },
    {
      key: "xhs",
      label: "小红书",
      status: diagnosticAnyStatus(["xhs"], diagnostics, ["ok"])
        ? "done"
        : providers.xhsCli ? "warn" : "missing",
      detail: xhsDiagnosticIssue || (providers.xhsCli ? providerRecentError("xhsCli", dataQuality) || "小红书 CLI 已配置。" : "未配置小红书 CLI/cookie。"),
      next: diagnosticFirstAction(["xhs"], diagnostics) || (providers.xhsCli ? "若提示登录过期，更新 XHS_COOKIE。" : "登录小红书网页版，复制 cookie 到 XHS_COOKIE。"),
    },
    {
      key: "youtube",
      label: "YouTube",
      status: diagnosticAnyStatus(["youtube-api", "youtube-rss"], diagnostics, ["ok"])
        ? "done"
        : providers.youtubeApi || providers.youtubeFeeds ? "warn" : "missing",
      detail: youtubeDiagnosticIssue || (providers.youtubeApi
        ? "YouTube Data API 已配置。"
        : providers.youtubeFeeds || providers.youtubeYtDlp
          ? providerRecentError("youtubeFeeds", dataQuality) || providerRecentError("youtubeYtDlp", dataQuality) || `YouTube 无 key fallback 已启用：${providers.youtubeFeeds ? "RSS" : ""}${providers.youtubeFeeds && providers.youtubeYtDlp ? " + " : ""}${providers.youtubeYtDlp ? "yt-dlp 搜索" : ""}。`
          : "未配置 YouTube API/RSS。"),
      next: diagnosticFirstAction(["youtube-api", "youtube-rss", "youtube-ytdlp"], diagnostics) || (providers.youtubeApi ? "无须处理。" : "需要官方搜索和配额时配置 YOUTUBE_API_KEY；暂时可继续用 RSS/yt-dlp fallback。"),
    },
    {
      key: "ibkr",
      label: "IBKR",
      status: diagnosticAnyStatus(["ibkr-gateway", "ibkr-marketdata", "ibkr-options", "ibkr-flex", "ibkr-cp"], diagnostics, ["ok"])
        ? "done"
        : "warn",
      detail: ibkrDiagnosticIssue || [
        config.ibkr?.flexConfigured ? "Flex 已配置" : "Flex 未配置",
        providers.ibkrGateway ? "Socket provider 已启用" : "Socket provider 未启用",
        providerRecentError("ibkrGateway", dataQuality) || providerRecentError("ibkrClientPortal", dataQuality),
      ].filter(Boolean).join("；"),
      next: diagnosticFirstAction(["ibkr-gateway", "ibkr-options", "ibkr-marketdata", "ibkr-trading", "ibkr-cp", "ibkr-flex"], diagnostics) || "启动并登录 IB Gateway/TWS；需要交易同步时配置 Flex token/query。",
    },
    {
      key: "ibkrPortal",
      label: "IBKR 大盘/Hot News",
      status: diagnosticAnyStatus(["ibkr-portal"], diagnostics, ["ok"])
        ? "done"
        : config.ibkr?.portal?.importedCount ? "done" : "warn",
      detail: ibkrPortalDiagnosticIssue || (config.ibkr?.portal?.importedCount
        ? `已导入 ${config.ibkr.portal.importedCount} 条 IBKR Portal 内容。`
        : "尚未导入 IBKR Portal Market Overview/Hot News。"),
      next: diagnosticFirstAction(["ibkr-portal"], diagnostics) || "打开 IBKR Portal，复制 Market Overview/Hot News 可见文本，粘贴到首页导入框。",
    },
    {
      key: "openbb",
      label: "OpenBB",
      status: diagnosticAnyStatus(["openbb"], diagnostics, ["ok"]) ? "done" : providers.openbb ? "warn" : "missing",
      detail: openbbDiagnosticIssue || (providers.openbb ? `OpenBB ${openbb.mode || "auto"} / provider ${openbb.provider || "auto"}。` : "OpenBB 未启用。"),
      next: diagnosticFirstAction(["openbb"], diagnostics) || (providers.openbb ? "可按需扩展 collector sections/provider。" : "设置 OPENBB_ENABLED=true 并安装 OpenBB 环境。"),
    },
    {
      key: "longbridge",
      label: "Longbridge",
      status: diagnosticAnyStatus(["longbridge"], diagnostics, ["ok"])
        ? "done"
        : providers.longBridge ? "warn" : "missing",
      detail: longBridgeDiagnosticIssue || (providers.longBridge
        ? "Longbridge CLI 已启用，可补充行情、K线和新闻。"
        : "未启用或未检测到 Longbridge CLI。"),
      next: diagnosticFirstAction(["longbridge"], diagnostics) || "安装 Longbridge CLI、完成 auth，并保持 LONG_BRIDGE_ENABLED=true。",
    },
    {
      key: "email",
      label: "邮件报告",
      status: diagnosticAnyStatus(["email"], diagnostics, ["ok"]) ? "done" : email.configured ? "warn" : "missing",
      detail: emailDiagnosticIssue || (email.configured ? `邮件已配置：${email.provider || "smtp"}。` : `缺少：${(email.missing || []).join("、") || "邮件 provider"}`),
      next: diagnosticFirstAction(["email"], diagnostics) || "推荐配置 Resend；或用 Gmail App Password 配 SMTP。",
    },
    {
      key: "options",
      label: "期权链/GEX",
      status: options.enabled ? "done" : "missing",
      detail: options.enabled ? `provider 顺序：${(options.providerOrder || []).join(" -> ")}。` : "OPTIONS_ENABLED=false。",
      next: "IBKR 不可用时会 fallback 到 Nasdaq/Yahoo/Finnhub；实时 Greeks 取决于市场数据权限。",
    },
  ];
  return rows;
}

function setupStatusLabel(status) {
  if (status === "done") return "已完成";
  if (status === "warn") return "需关注";
  return "未配置";
}

function setupStatusClass(status) {
  if (status === "done") return "green";
  if (status === "warn") return "amber";
  return "red";
}

function renderSetupChecklist(config = {}, dataQuality = {}, diagnostics = null) {
  const rows = setupChecklistItems(config, dataQuality, diagnostics);
  const done = rows.filter((row) => row.status === "done").length;
  return `<div class="quality-section setup-checklist">
    <div class="quality-row">
      <div>
        <h3>完整可用配置清单</h3>
        <p class="muted">按这个清单补齐后，报告、聊天、社交发现、期权、邮件和交易同步会更稳定。</p>
      </div>
      <span class="tag ${done === rows.length ? "green" : done >= rows.length - 3 ? "amber" : "red"}">${escapeHtml(done)}/${escapeHtml(rows.length)}</span>
    </div>
    <p class="muted">详细步骤见 <a href="/configuration.html" target="_blank" rel="noreferrer">实时配置攻略</a>。</p>
    <div class="setup-grid">
      ${rows
        .map((row) => `<article class="setup-card ${escapeHtml(row.status)}">
          <div class="row">
            <strong>${escapeHtml(row.label)}</strong>
            <span class="tag ${setupStatusClass(row.status)}">${escapeHtml(setupStatusLabel(row.status))}</span>
          </div>
          <p>${escapeHtml(row.detail || "")}</p>
          <p class="muted">${escapeHtml(row.next || "")}</p>
        </article>`)
        .join("")}
    </div>
  </div>`;
}

function renderStorageHealth(storage = {}) {
  const status = storage.status || {};
  const bytes = Number(status.payloadBytes || 0);
  const mb = bytes ? `${fmtNumber(bytes / 1024 / 1024, 1)}MB` : "-";
  const sqlite = storage.sqliteMirror || {};
  const sqliteStatus = sqlite.lastResult?.status || (sqlite.enabled ? "等待同步" : "未启用");
  const drive = storage.driveArchive || {};
  const driveStatus = drive.status || {};
  const driveReady = Boolean(drive.enabled && driveStatus.commandAvailable && driveStatus.remoteConfigured);
  const driveLabel = driveReady ? "已就绪" : drive.enabled ? "待配置" : "未启用";
  const driveCounts = driveStatus.counts || {};
  const statusClass = status.warning ? "amber" : status.status === "saved" || status.status === "skipped-clean" || status.status === "loaded" ? "green" : "amber";
  return `<div class="quality-section storage-health">
    <div class="quality-row">
      <div>
        <h3>存储健康</h3>
        <p class="muted">${escapeHtml(storage.storeFile || "data/store.json")} · ${escapeHtml(mb)} · ${escapeHtml(status.status || "unknown")}</p>
        ${
          status.lastSavedAt
            ? `<p class="muted">最近写入：${escapeHtml(fmtTime(status.lastSavedAt))}</p>`
            : status.lastSkippedAt
              ? `<p class="muted">最近跳过重复写入：${escapeHtml(fmtTime(status.lastSkippedAt))}</p>`
              : ""
        }
        ${status.warning ? `<p class="quality-error">${escapeHtml(status.warning)}</p>` : ""}
      </div>
      <span class="tag ${statusClass}">${escapeHtml(status.warning ? "体积告警" : "正常")}</span>
    </div>
    <div class="diagnostic-row">
      <div>
        <strong>SQLite mirror</strong>
        <p class="muted">${escapeHtml(sqlite.dbFile || "-")} · autoSync=${escapeHtml(sqlite.autoSync ? "true" : "false")}</p>
      </div>
      <span class="tag ${sqliteStatus === "ok" ? "green" : sqlite.enabled ? "amber" : ""}">${escapeHtml(sqliteStatus)}</span>
    </div>
    <div class="diagnostic-row">
      <div>
        <strong>Google Drive 冷归档</strong>
        <p class="muted">${escapeHtml(drive.remote || "market-pulse-drive")}:${escapeHtml(drive.basePath || "MarketPulseAI")} · 本地保留 ${escapeHtml(drive.afterDays || 30)} 天</p>
        <p class="muted">远端独占 ${escapeHtml(driveCounts.remoteOnly || 0)} 份 · 待归档 ${escapeHtml(driveCounts.pending || 0)} 份 · 下载缓存 ${escapeHtml(drive.cacheTtlHours || 24)} 小时</p>
        ${driveStatus.lastFailure ? `<p class="quality-error">${escapeHtml(driveStatus.lastFailure)}</p>` : ""}
      </div>
      <div class="row">
        <span class="tag ${driveReady ? "green" : drive.enabled ? "amber" : ""}">${escapeHtml(driveLabel)}</span>
        <button class="btn compact ghost" type="button" data-run-drive-archive data-drive-dry-run="${drive.enabled ? "false" : "true"}">${drive.enabled ? "立即归档" : "检查配置"}</button>
      </div>
    </div>
  </div>`;
}

function renderProviders(providers, dataQuality, providerDetails = {}, sourceControls = {}, customSocialFeeds = {}, llmRouting = {}, fullConfig = {}) {
  const labels = {
    networkProxy: "网络代理",
    sec: "SEC EDGAR",
    yahooNewsFallback: "Yahoo 新闻发现",
    localRules: "本地规则分析",
    gemini: "Gemini 接口",
    codexCli: "Codex CLI",
    antigravityCli: "Antigravity CLI",
    geminiCli: "Gemini CLI",
    openai: "OpenAI 模型",
    alphaVantage: "Alpha Vantage",
    finnhub: "Finnhub",
    newsapiHotNews: "NewsAPI 热闻",
    polygonHotNews: "Polygon/Massive 新闻",
    youtube: "YouTube 总开关",
    youtubeApi: "YouTube 数据接口",
    youtubeFeeds: "YouTube 频道 RSS",
    redditSocial: "Reddit 社交热议",
    apeWisdomSocial: "ApeWisdom 热议榜",
    stocktwitsSocial: "Stocktwits 社区",
    xSearch: "X 官方搜索",
    nitterSearch: "Nitter 搜索",
    xhsCli: "小红书 CLI",
    customSocialFeeds: "自定义社交源",
    ibkrFlex: "IBKR Flex 交易同步",
    ibkrGateway: "IBKR Gateway Socket",
    ibkrClientPortal: "IBKR Client Portal 期权",
    ibkrMarketData: "IBKR 行情/K线",
    ibkrTrading: "IBKR 交易 API",
    ibkrPortal: "IBKR Portal 大盘/Hot News",
    articleExtractor: "新闻正文抽取",
    articleLlmSummary: "新闻原文 LLM 摘要",
    openbb: "OpenBB Platform",
    marketOverview: "大盘整体情况",
    optionsChain: "期权链/GEX",
  };
  const disabledSources = new Set(Array.isArray(sourceControls.disabled) ? sourceControls.disabled : []);
  const providerRows = Object.entries(labels)
    .map(([key, label]) => {
      const paused = disabledSources.has(key);
      const on = providers[key] && !paused;
      const detail = providerDetails[key] || "";
      const recentError = paused ? "" : providerRecentError(key, dataQuality);
      return `<div class="provider-row">
        <div>
          <strong>${escapeHtml(label)}</strong>
          ${detail ? `<p class="muted">${escapeHtml(detail)}</p>` : ""}
          ${recentError ? `<p class="quality-error">${escapeHtml(recentError)}</p>` : ""}
        </div>
        <span class="tag ${paused ? "amber" : on ? "green" : "amber"}">${paused ? "已暂停" : on ? "启用" : "未配置"}</span>
      </div>`;
    })
    .join("");
  const readiness = dataQuality?.readiness;
  const readinessBlock = readiness
    ? `<div class="quality-section readiness-section">
        <div class="quality-row">
          <div>
            <h3>报告健康度</h3>
            <p class="muted">${escapeHtml(readiness.summary || "")}</p>
          </div>
          <span class="tag ${readinessTagClass(readiness.status)}">${escapeHtml(readiness.label || "未评估")} · ${escapeHtml(
            Number.isFinite(readiness.score) ? `${readiness.score}/100` : "-",
          )}</span>
        </div>
        ${
          readiness.strengths?.length
            ? `<p class="muted">可用证据：${escapeHtml(readiness.strengths.slice(0, 5).join("；"))}</p>`
            : ""
        }
        ${
          readiness.limitations?.length
            ? `<p class="quality-error">降级点：${escapeHtml(readiness.limitations.slice(0, 5).join("；"))}</p>`
            : ""
        }
        ${
          readiness.actions?.length
            ? `<ul class="compact-list">${readiness.actions
              .slice(0, 4)
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join("")}</ul>`
            : ""
        }
      </div>`
    : "";
  const actions = dataSourceActionItems(providers, dataQuality)
    .map(
      (item) => `<div class="source-action ${escapeHtml(item.level)}">
        <span class="tag ${item.level === "high" ? "red" : item.level === "medium" ? "amber" : ""}">${escapeHtml(
          item.level === "high" ? "优先" : item.level === "medium" ? "建议" : "可选",
        )}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p class="muted">${escapeHtml(item.body)}</p>
          ${
            item.pauseKeys?.length
              ? `<button class="btn compact ghost" type="button" data-pause-sources="${escapeHtml(item.pauseKeys.join(","))}">暂停该故障源</button>`
              : ""
          }
        </div>
      </div>`,
    )
    .join("");
  const diagnostics = sourceDiagnostics?.rows?.length
    ? `<div class="quality-section">
        <h3>即时诊断</h3>
        <p class="muted">生成时间：${escapeHtml(fmtTime(sourceDiagnostics.generatedAt))}</p>
        ${
          sourceDiagnostics.stale
            ? `<p class="quality-error">可能已过期：${escapeHtml(sourceDiagnostics.staleReason || "配置已变化，请重新运行诊断。")}</p>`
            : ""
        }
        ${sourceDiagnostics.rows
          .map(
            (row) => `<div class="diagnostic-row">
              <div>
                <strong>${escapeHtml(row.label || row.key)}</strong>
                <p class="muted">${escapeHtml(row.detail || "")}</p>
                ${row.action ? `<p class="muted">建议：${escapeHtml(row.action)}</p>` : ""}
              </div>
              <span class="tag ${diagnosticTagClass(row.status)}">${escapeHtml(diagnosticStatusLabel(row.status))}${
                Number.isFinite(row.durationMs) ? ` · ${escapeHtml(row.durationMs)}ms` : ""
              }</span>
            </div>`,
          )
          .join("")}
      </div>`
    : "";
  const collectorRows = (dataQuality?.collectors || [])
    .map(
      (row) => `<div class="quality-row">
        <div>
          <strong>${escapeHtml(sourceLabel(row.source))}</strong>
          <p class="muted">${escapeHtml(row.items)} 条 · ${escapeHtml(row.errors)} 个异常</p>
        </div>
        <span class="tag ${row.status === "ok" ? "green" : row.status === "failed" ? "red" : "amber"}">${escapeHtml(row.status === "ok" ? "正常" : row.status === "failed" ? "失败" : "部分")} · ${escapeHtml(row.durationMs)}ms</span>
      </div>`,
    )
    .join("");
  const coreErrors = (dataQuality?.coreErrorSamples || [])
    .map(
      (item) =>
        `<p class="quality-error">${escapeHtml(sourceLabel(item.source || ""))}：${escapeHtml(
          item.ticker || "",
        )} ${escapeHtml(errorLabel(item.error || ""))}</p>`,
    )
    .join("");
  const optionalWarnings = (dataQuality?.optionalWarningSamples || [])
    .map(
      (item) =>
        `<p class="muted">${escapeHtml(sourceLabel(item.source || ""))}：${escapeHtml(
          item.ticker || "",
        )} ${escapeHtml(errorLabel(item.error || ""))}</p>`,
    )
    .join("");
  if (els.diagnoseSources) {
    els.diagnoseSources.disabled = sourceDiagnosticsBusy;
    els.diagnoseSources.textContent = sourceDiagnosticsBusy ? "诊断中..." : "运行诊断";
  }
  const sourceControlsBlock = renderSourceControls(sourceControls);
  const customFeedsBlock = renderCustomSocialFeeds(customSocialFeeds);
  const llmRoutingBlock = renderLlmRouting(llmRouting);
  const integrationReadinessBlock = renderIntegrationReadiness(fullConfig);
  const learningLoopBlock = renderLearningLoopStatus(fullConfig);
  const setupLinksBlock = setupLinkCards(fullConfig, sourceDiagnostics);
  const setupChecklistBlock = renderSetupChecklist(fullConfig, dataQuality, sourceDiagnostics);
  const storageHealthBlock = renderStorageHealth(fullConfig.storage);
  const providerDetailsBlock = `${learningLoopBlock}${setupLinksBlock}${setupChecklistBlock}${storageHealthBlock}${providerRows}${llmRoutingBlock}${sourceControlsBlock}${customFeedsBlock}${
    diagnostics
  }${
    actions ? `<div class="quality-section"><h3>需要处理</h3>${actions}</div>` : ""
  }${
    collectorRows ? `<div class="quality-section"><h3>采集器健康状态</h3>${collectorRows}</div>` : ""
  }${
    coreErrors ? `<div class="quality-section"><h3>核心异常</h3>${coreErrors}</div>` : ""
  }${
    optionalWarnings ? `<div class="quality-section"><h3>可选源警告</h3>${optionalWarnings}</div>` : ""
  }`;
  els.providerBox.innerHTML = `${integrationReadinessBlock}${readinessBlock}<details class="quality-section agent-disclosure"><summary><strong>配置、诊断与采集明细</strong><span class="tag">按需展开</span></summary>${providerDetailsBlock}</details>`;
}

async function run(session) {
  setBusy(true);
  try {
    const result = await api("/api/run", {
      method: "POST",
      body: JSON.stringify({ session, async: true }),
    });
    clearRefreshError("run");
    if (result.runStatus) {
      collectionStatus = result.runStatus;
      render();
      pollCollectionStatus();
      return;
    }
    if (result.run?.id) {
      localStorage.setItem(RUN_SELECTION_STORAGE_KEY, result.run.id);
    }
    await loadState();
  } catch (error) {
    showRefreshError(`采集启动失败：${error.message}`, "run");
    alert(error.message);
  } finally {
    if (collectionStatus?.state !== "running") setBusy(false);
  }
}

els.runPre.addEventListener("click", () => run("pre"));
els.runPost.addEventListener("click", () => run("post"));
els.runManual.addEventListener("click", () => run("manual"));

els.diagnoseSources?.addEventListener("click", async () => {
  sourceDiagnosticsBusy = true;
  render();
  try {
    const result = await api("/api/source-diagnostics");
    sourceDiagnostics = result.diagnostics || null;
    if (result.config) appState.config = result.config;
    render();
  } catch (error) {
    alert(`数据源诊断失败：${error.message}`);
  } finally {
    sourceDiagnosticsBusy = false;
    render();
  }
});

els.providerBox?.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-source-control]");
  if (!input) return;
  const key = input.dataset.sourceControl;
  const disabled = input.checked;
  input.disabled = true;
  try {
    const result = await api("/api/source-controls", {
      method: "POST",
      body: JSON.stringify({ key, disabled }),
    });
    if (result.config) {
      appState.config = result.config;
      sourceDiagnostics = result.sourceDiagnostics || sourceDiagnostics;
    } else {
      appState.config ||= {};
      appState.config.sourceControls = result.sourceControls;
    }
    render();
  } catch (error) {
    input.checked = !disabled;
    alert(`更新数据源开关失败：${error.message}`);
  } finally {
    input.disabled = false;
  }
});

els.providerBox?.addEventListener("click", async (event) => {
  const driveArchiveButton = event.target.closest("[data-run-drive-archive]");
  if (driveArchiveButton) {
    driveArchiveButton.disabled = true;
    const dryRun = driveArchiveButton.dataset.driveDryRun === "true";
    driveArchiveButton.textContent = dryRun ? "检查中..." : "归档中...";
    try {
      const response = await api("/api/drive-archive/run", {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      const result = response.result || {};
      alert(
        dryRun
          ? `Drive 配置检查完成：${result.status || "unknown"}，符合 30 天规则 ${result.candidates || 0} 份。`
          : `Drive 归档完成：验证 ${result.verified || 0} 份，清理 ${result.pruned || 0} 份，失败 ${result.failed || 0} 份。`,
      );
      await loadState();
    } catch (error) {
      alert(`Google Drive 冷归档失败：${error.message}`);
    } finally {
      driveArchiveButton.disabled = false;
    }
    return;
  }
  const externalSmokeButton = event.target.closest("[data-external-api-smoke]");
  if (externalSmokeButton) {
    externalSmokeButton.disabled = true;
    externalSmokeButton.textContent = "复检中...";
    try {
      const result = await api("/api/external-provider-smoke-test", { method: "POST", body: JSON.stringify({}) });
      alert(formatExternalProviderSmokeAlert(result.smoke || {}));
      const diagnostics = await api("/api/source-diagnostics?keys=longbridge,youtube-api,youtube-rss,youtube-ytdlp,x-search,newsapi-hot-news,polygon-hot-news,alpha-vantage-news,hot-news-rss,google-ticker-news-rss,stocktwits-social&ignoreDisabled=true");
      sourceDiagnostics = diagnostics.diagnostics || sourceDiagnostics;
      if (diagnostics.config) appState.config = diagnostics.config;
      render();
    } catch (error) {
      alert(`外部 API 复检失败：${error.message}`);
    } finally {
      externalSmokeButton.disabled = false;
      externalSmokeButton.textContent = "一键复检外部 API";
    }
    return;
  }
  const waitButton = event.target.closest("[data-ibkr-wait-test]");
  if (waitButton) {
    const ticker = waitButton.dataset.ibkrWaitTest || "AAPL";
    waitButton.disabled = true;
    waitButton.textContent = "等待登录中...";
    try {
      const result = await api("/api/ibkr/wait-for-socket", {
        method: "POST",
        body: JSON.stringify({ ticker, timeoutMs: 180000, intervalMs: 3000 }),
      });
      alert(formatIbkrSmokeAlert(result.smoke || {}));
      const diagnostics = await api("/api/source-diagnostics?keys=ibkr-gateway,ibkr-marketdata,ibkr-options&ignoreDisabled=true");
      sourceDiagnostics = diagnostics.diagnostics || sourceDiagnostics;
      if (diagnostics.config) appState.config = diagnostics.config;
      render();
    } catch (error) {
      alert(`IBKR 等待验证失败：${error.message}`);
    } finally {
      waitButton.disabled = false;
      waitButton.textContent = "等待登录并验证";
    }
    return;
  }
  const smokeButton = event.target.closest("[data-ibkr-smoke-test]");
  if (smokeButton) {
    const ticker = smokeButton.dataset.ibkrSmokeTest || "AAPL";
    smokeButton.disabled = true;
    smokeButton.textContent = "验证中...";
    try {
      const result = await api("/api/ibkr/socket-smoke-test", {
        method: "POST",
        body: JSON.stringify({ ticker }),
      });
      alert(formatIbkrSmokeAlert(result.smoke || {}));
      const diagnostics = await api("/api/source-diagnostics?keys=ibkr-gateway,ibkr-marketdata,ibkr-options&ignoreDisabled=true");
      sourceDiagnostics = diagnostics.diagnostics || sourceDiagnostics;
      if (diagnostics.config) appState.config = diagnostics.config;
      render();
    } catch (error) {
      alert(`IBKR 验证失败：${error.message}`);
    } finally {
      smokeButton.disabled = false;
      smokeButton.textContent = "立即验证 IBKR";
    }
    return;
  }
  const button = event.target.closest("[data-pause-sources]");
  if (!button) return;
  const keys = String(button.dataset.pauseSources || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (!keys.length) return;
  button.disabled = true;
  button.textContent = "暂停中...";
  try {
    for (const key of keys) {
      const result = await api("/api/source-controls", {
        method: "POST",
        body: JSON.stringify({ key, disabled: true }),
      });
      sourceDiagnostics = result.sourceDiagnostics || sourceDiagnostics;
    }
    await loadState();
  } catch (error) {
    alert(`暂停数据源失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "暂停该故障源";
  }
});

els.providerBox?.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-custom-social-feed-form]");
  if (!form) return;
  event.preventDefault();
  const textarea = form.querySelector("[data-custom-social-feeds]");
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await api("/api/custom-social-feeds", {
      method: "POST",
      body: JSON.stringify({ feeds: textarea?.value || "" }),
    });
    if (result.config) appState.config = result.config;
    sourceDiagnostics = result.sourceDiagnostics || sourceDiagnostics;
    render();
  } catch (error) {
    alert(`保存自定义社交源失败：${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
});

els.runHistoryBox.addEventListener("click", (event) => {
  const moreButton = event.target.closest("[data-run-history-more]");
  if (moreButton) {
    loadRunHistoryPage();
    return;
  }
  const button = event.target.closest("[data-run-id]");
  if (!button) return;
  localStorage.setItem(RUN_SELECTION_STORAGE_KEY, button.dataset.runId);
  render();
  loadRunDetail(button.dataset.runId);
});

els.stockReportBox.addEventListener("click", async (event) => {
  const pageButton = event.target.closest('[data-list-page-scope="stocks"]');
  if (pageButton && !pageButton.disabled) {
    longListPages.stocks = Number(pageButton.dataset.listPageIndex || 0);
    renderStockReport(selectedReportRun());
    els.stockReportBox.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const openButton = event.target.closest("[data-open-stock-report]");
  if (openButton) {
    openStockDetail(openButton.dataset.openStockReport, { fetch: false });
    return;
  }
  const refreshButton = event.target.closest("[data-refresh-stock-report]");
  if (refreshButton) {
    requestStockSnapshot(refreshButton.dataset.refreshStockReport, { force: true });
    return;
  }
  const uziButton = event.target.closest("[data-run-uzi-analysis]");
  if (uziButton) {
    const ticker = uziButton.dataset.runUziAnalysis;
    uziButton.disabled = true;
    uziButton.textContent = "UZI 分析中...";
    try {
      await requestUziAnalysis(ticker, { depth: "lite" });
    } catch (error) {
      alert(`UZI 分析失败：${error.message}`);
    } finally {
      uziButton.disabled = false;
      uziButton.textContent = "运行 UZI";
    }
    return;
  }
  const debateButton = event.target.closest("[data-run-agent-debate]");
  if (debateButton) {
    const ticker = debateButton.dataset.runAgentDebate;
    debateButton.disabled = true;
    debateButton.textContent = "辩论中...";
    try {
      const result = await api("/api/agent-debate/run", {
        method: "POST",
        body: JSON.stringify({ ticker }),
      });
      if (result.latest) appState.latest = result.latest;
      if (result.run?.id) runDetailCache.set(result.run.id, result.run);
      await loadState();
      openStockDetail(ticker, { fetch: false });
    } catch (error) {
      alert(`LLM 辩论失败：${error.message}`);
    } finally {
      debateButton.disabled = false;
      debateButton.textContent = "运行 LLM 辩论";
    }
    return;
  }
  const backButton = event.target.closest("[data-back-stock-overview]");
  if (backButton) {
    closeStockDetail();
    return;
  }
  const button = event.target.closest("[data-fetch-options]");
  if (!button) return;
  const ticker = button.dataset.fetchOptions;
  setBusy(true);
  button.disabled = true;
  button.textContent = "抓取中...";
  try {
    const result = await requestOptionsChain(ticker, button.dataset.runId);
    if (result.run?.id) runDetailCache.set(result.run.id, result.run);
    await loadState();
  } catch (error) {
    await loadState().catch(() => {});
    alert(`期权链补抓失败：${error.message}`);
  } finally {
    setBusy(false);
    button.disabled = false;
    button.textContent = "立即补抓期权链";
  }
});

els.socialGrid?.addEventListener("click", (event) => {
  const pageButton = event.target.closest('[data-list-page-scope="social"]');
  if (!pageButton || pageButton.disabled) return;
  longListPages.social = Number(pageButton.dataset.listPageIndex || 0);
  renderSocial(selectedReportRun());
  els.socialGrid.scrollIntoView({ behavior: "smooth", block: "start" });
});

els.actionSuggestionsBox?.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-stock-report]");
  if (!openButton) return;
  openStockDetail(openButton.dataset.openStockReport, { fetch: false });
});

els.allStockAgentBox?.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-stock-report]");
  if (!openButton) return;
  openStockDetail(openButton.dataset.openStockReport, { fetch: false });
});

els.todayDeskBox?.addEventListener("click", async (event) => {
  const openButton = event.target.closest("[data-open-stock-report]");
  if (openButton) {
    openStockDetail(openButton.dataset.openStockReport);
    return;
  }
  const acceptButton = event.target.closest("[data-paper-accept]");
  if (!acceptButton) return;
  acceptButton.disabled = true;
  try {
    await api("/api/paper-portfolio/accept", {
      method: "POST",
      body: JSON.stringify({ decisionId: acceptButton.dataset.paperAccept }),
    });
    await loadState();
  } catch (error) {
    alert(`纸面接受失败：${error.message}`);
  } finally {
    acceptButton.disabled = false;
  }
});

els.stockDeepDiveBox?.addEventListener("click", (event) => {
  const openButton = event.target.closest("[data-open-stock-report]");
  if (!openButton) return;
  openStockDetail(openButton.dataset.openStockReport);
});

els.strategyGovernanceBox?.addEventListener("click", async (event) => {
  const refreshButton = event.target.closest("[data-refresh-strategy-panel]");
  if (refreshButton) {
    refreshButton.disabled = true;
    try {
      await loadSupplementalData();
      renderStrategyGovernance(strategyVersionsPayload, strategyValidationPayload);
    } catch (error) {
      alert(`策略面板刷新失败：${error.message}`);
    } finally {
      refreshButton.disabled = false;
    }
    return;
  }
  const promoteButton = event.target.closest("[data-promote-strategy]");
  if (promoteButton) {
    const id = promoteButton.dataset.promoteStrategy;
    const confirmation = prompt(`输入 ${id} 确认提升该候选策略为 Active`);
    if (confirmation !== id) return;
    promoteButton.disabled = true;
    try {
      await api("/api/strategy-versions/promote", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      await loadState();
    } catch (error) {
      alert(`策略 Promote 失败：${error.message}`);
    } finally {
      promoteButton.disabled = false;
    }
    return;
  }
  const rollbackButton = event.target.closest("[data-rollback-strategy]");
  if (!rollbackButton) return;
  const confirmation = prompt("输入 ROLLBACK 确认恢复上一版 active strategy");
  if (confirmation !== "ROLLBACK") return;
  rollbackButton.disabled = true;
  try {
    await api("/api/strategy-versions/rollback", { method: "POST", body: JSON.stringify({}) });
    await loadState();
  } catch (error) {
    alert(`策略 Rollback 失败：${error.message}`);
  } finally {
    rollbackButton.disabled = false;
  }
});

els.moversWithReasonsBox?.addEventListener("click", (event) => {
  const card = event.target.closest(".mover-card[data-ticker]");
  if (!card) return;
  // movers may be outside the watchlist/run coverage, so fetch the snapshot on open
  openStockDetail(card.dataset.ticker);
});

els.moversWithReasonsBox?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".mover-card[data-ticker]");
  if (!card) return;
  event.preventDefault();
  openStockDetail(card.dataset.ticker);
});

els.runAllStockAgent?.addEventListener("click", async () => {
  const button = els.runAllStockAgent;
  button.disabled = true;
  button.textContent = "运行中...";
  try {
    const result = await api("/api/all-stock-agent/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    appState.allStockAgent = result.allStockAgent;
    await loadState();
  } catch (error) {
    alert(`候选池 Agent 运行失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "运行候选池 Agent";
  }
});

els.runAllStockAgentBacktest?.addEventListener("click", async () => {
  const button = els.runAllStockAgentBacktest;
  button.disabled = true;
  button.textContent = "回测中...";
  try {
    const result = await api("/api/all-stock-agent/backtest", {
      method: "POST",
      body: JSON.stringify({ days: 45, maxDates: 24, horizons: [1, 3, 5, 10] }),
    });
    allStockAgentBacktest = result.backtest || null;
    renderAllStockAgent(appState?.allStockAgent);
  } catch (error) {
    alert(`规则回测失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "规则回测";
  }
});

els.scheduleBox.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-send-report]");
  if (!button) return;
  button.disabled = true;
  try {
    const result = await api("/api/report-email", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadState();
    const email = result.email || {};
    alert(
      email.status === "sent"
        ? "最新报告已发送。"
        : `邮件未发送：${email.reason || email.status || "未知原因"}`,
    );
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

els.ibkrPortalForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = els.ibkrPortalInput.value.trim();
  if (!text) {
    alert("请先粘贴 IBKR Portal 的 Market Overview 或 Hot News 文本。");
    return;
  }
  const button = els.ibkrPortalForm.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await api("/api/ibkr/portal-import", {
      method: "POST",
      body: JSON.stringify({
        text,
        kind: els.ibkrPortalKind.value || "mixed",
      }),
    });
    els.ibkrPortalInput.value = "";
    if (result.config) appState.config = result.config;
    sourceDiagnostics = result.sourceDiagnostics || sourceDiagnostics;
    render();
    alert(`已导入 ${result.imported || 0} 条 IBKR Portal 内容。`);
  } catch (error) {
    alert(`IBKR Portal 导入失败：${error.message}`);
  } finally {
    if (button) button.disabled = false;
  }
});

els.alertsBox.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-alert-id]");
  if (!button) return;
  button.disabled = true;
  try {
    await api("/api/alerts/update", {
      method: "POST",
      body: JSON.stringify({
        id: button.dataset.alertId,
        alertKey: button.dataset.alertKey,
        status: button.dataset.alertStatus,
      }),
    });
    runDetailCache.clear();
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

els.watchlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    await api("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ tickers: els.watchlistInput.value }),
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.watchlistAddButton?.addEventListener("click", async () => {
  setBusy(true);
  try {
    await addWatchlistTicker(els.watchlistAddInput?.value || "");
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.watchlistAddInput?.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  setBusy(true);
  try {
    await addWatchlistTicker(els.watchlistAddInput.value);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.tickerGrid?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-watchlist]");
  if (!button) return;
  button.disabled = true;
  setBusy(true);
  try {
    await removeWatchlistTicker(button.dataset.removeWatchlist);
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  } finally {
    setBusy(false);
  }
});

els.portfolioForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    await api("/api/portfolio", {
      method: "POST",
      body: JSON.stringify({ text: els.portfolioInput.value }),
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.portfolioFromTradesButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const result = await api("/api/portfolio/from-trades", {
      method: "POST",
      body: JSON.stringify({}),
    });
    els.portfolioInput.value = (result.portfolio || [])
      .map((item) => `${item.ticker} ${item.shares} ${item.costBasis}`)
      .join("\n");
    await loadState();
    alert(`已从交易日志同步 ${result.synced || 0} 个未平仓标的。`);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.tradeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const trade = {
    executedAt: els.tradeDate.value ? new Date(els.tradeDate.value).toISOString() : new Date().toISOString(),
    ticker: els.tradeTicker.value,
    side: els.tradeSide.value,
    quantity: els.tradeQuantity.value,
    price: els.tradePrice.value,
    fees: els.tradeFees.value,
    strategy: els.tradeStrategy.value,
    thesis: els.tradeThesis.value,
    emotion: els.tradeEmotion.value,
    tags: els.tradeTags.value,
    notes: els.tradeNotes.value,
  };
  setBusy(true);
  try {
    const path = editingTradeId ? "/api/trades/update" : "/api/trades";
    await api(path, {
      method: "POST",
      body: JSON.stringify(editingTradeId ? { id: editingTradeId, trade } : { trade }),
    });
    resetTradeForm();
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.tradeImportButton.addEventListener("click", async () => {
  const text = els.tradeImportText.value.trim();
  if (!text) return;
  setBusy(true);
  try {
    const result = await api("/api/trades/import", {
      method: "POST",
      body: JSON.stringify({ text, source: /<(?:Trade|TradeConfirm)\b/i.test(text) ? "ibkr-flex" : "csv" }),
    });
    els.tradeImportText.value = "";
    await loadState();
    alert(`已解析 ${result.parsed} 条，新增 ${result.imported} 条。`);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.ibkrSyncButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const result = await api("/api/ibkr/flex-sync", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadState();
    alert(`IBKR 同步完成：解析 ${result.sync.parsed} 条，新增 ${result.sync.imported} 条。`);
  } catch (error) {
    await loadState().catch(() => {});
    alert(`IBKR 同步未完成：${error.message}`);
  } finally {
    setBusy(false);
  }
});

els.tradeReviewButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    await api("/api/trade-review", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.tradeExportButton.addEventListener("click", () => {
  downloadUrl("/api/trades/export?format=csv");
});

els.tradeJournalExportButton.addEventListener("click", () => {
  downloadUrl("/api/trade-journal/export?format=json");
});

els.tradeEditCancel.addEventListener("click", () => {
  resetTradeForm();
});

els.tradeJournalBox.addEventListener("click", async (event) => {
  const syncLongbridgeButton = event.target.closest("[data-sync-longbridge-trades]");
  if (syncLongbridgeButton) {
    setBusy(true);
    try {
      const result = await api("/api/trades/sync-longbridge", { method: "POST" });
      appState.trades = result.trades || appState.trades;
      appState.tradeJournal = result.tradeJournal || appState.tradeJournal;
      appState.traderProfile = result.traderProfile || appState.traderProfile;
      renderTradeJournal(appState.tradeJournal, appState.tradeReviews || [], appState.config?.ibkr);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
    return;
  }
  const refreshTraderProfileButton = event.target.closest("[data-refresh-trader-profile]");
  if (refreshTraderProfileButton) {
    setBusy(true);
    try {
      const result = await api("/api/trader-profile/refresh", {
        method: "POST",
        body: JSON.stringify({ syncLongbridge: false, llm: false }),
      });
      appState.traderProfile = result.traderProfile || appState.traderProfile;
      renderTradeJournal(appState.tradeJournal, appState.tradeReviews || [], appState.config?.ibkr);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
    return;
  }
  const actionButton = event.target.closest("[data-review-action-id]");
  if (actionButton) {
    const isNoteEdit = actionButton.dataset.reviewActionNoteEdit === "true";
    const note = isNoteEdit
      ? window.prompt("复盘备注", actionButton.dataset.reviewActionNoteValue || "")
      : undefined;
    if (note === null) return;
    setBusy(true);
    try {
      const result = await api("/api/trade-review-actions/update", {
        method: "POST",
        body: JSON.stringify({
          id: actionButton.dataset.reviewActionId,
          status: actionButton.dataset.reviewActionStatus || "open",
          ...(isNoteEdit ? { note } : {}),
        }),
      });
      appState.tradeJournal = result.tradeJournal;
      renderTradeJournal(appState.tradeJournal, appState.tradeReviews || [], appState.config?.ibkr);
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
    return;
  }
  const editButton = event.target.closest("[data-edit-trade]");
  if (editButton) {
    const trade = findTradeById(editButton.dataset.editTrade);
    if (!trade) {
      alert("没有找到这笔交易记录，请刷新后再试。");
      return;
    }
    setTradeEditing(trade);
    els.tradeForm.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const button = event.target.closest("[data-delete-trade]");
  if (!button) return;
  setBusy(true);
  try {
    await api("/api/trades/delete", {
      method: "POST",
      body: JSON.stringify({ id: button.dataset.deleteTrade }),
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.chatInput.value.trim();
  if (!message) return;
  els.chatInput.value = "";
  setBusy(true);
  try {
    await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message, llmProvider: selectedLlmProvider() }),
    });
    await loadState();
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

els.llmProviderInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (input.checked) {
      localStorage.setItem(LLM_STORAGE_KEY, input.value);
      renderLlmPicker();
    }
  });
});

els.stockReportForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const ticker = normalizeTickerInput(els.stockReportInput?.value);
  if (!ticker) {
    alert("请输入 ticker，例如 MRVL、AAPL、AVGO。");
    return;
  }
  openStockDetail(ticker, { force: true });
});

window.addEventListener("hashchange", () => {
  if (appState) render();
});

els.openbbRouteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const route = els.openbbRouteInput.value.trim();
  let params = {};
  try {
    params = els.openbbParamsInput.value.trim() ? JSON.parse(els.openbbParamsInput.value) : {};
  } catch {
    alert("OpenBB 参数必须是合法 JSON。");
    return;
  }
  if (!route) {
    alert("请输入 OpenBB route。");
    return;
  }
  setBusy(true);
  try {
    const result = await api("/api/openbb/call", {
      method: "POST",
      body: JSON.stringify({ route, params }),
    });
    renderOpenBbRouteResult(result.openbb);
  } catch (error) {
    alert(error.message);
  } finally {
    setBusy(false);
  }
});

resetTradeForm();

loadState()
  .then(() => pollCollectionStatus())
  .catch(() => {
    renderPageShell();
  });

setInterval(() => {
  if (busy) return;
  api("/api/run/status")
    .then(async (result) => {
      clearRefreshError("background-status");
      collectionStatus = result.runStatus || null;
      if (collectionStatus?.state === "running") {
        setBusy(true);
        if (!collectionPollTimer) collectionPollTimer = setTimeout(pollCollectionStatus, 1000);
        return;
      }
      if (collectionStatus?.state === "completed" && collectionStatus.runId && collectionStatus.runId !== appState?.latest?.id) {
        await loadState();
      }
    })
    .catch((error) => {
      showRefreshError(`后台状态检查失败：${error.message}`, "background-status");
    });
}, 30000);
