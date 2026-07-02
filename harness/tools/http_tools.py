import json
import urllib.error
import urllib.parse
import urllib.request

from ..config import BASE_URL
from .registry import Tool


def _ticker(value):
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum() or ch in ".-")[:14]


class NodeHttpClient:
    def __init__(self, base_url=None, timeout=20):
        self.base_url = (base_url or BASE_URL).rstrip("/")
        self.timeout = timeout

    def request(self, method, path, params=None, body=None, timeout=None):
        params = dict(params or {})
        url = self.base_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json; charset=utf-8"
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as res:
                text = res.read().decode("utf-8")
                return json.loads(text) if text else {}
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(text)
            except json.JSONDecodeError:
                payload = {"error": text}
            return {"status": "error", "httpStatus": exc.code, "error": payload}
        except Exception as exc:
            return {"status": "error", "error": str(exc), "path": path}

    def state(self):
        return self.request("GET", "/api/state", timeout=10)


def _find_ticker_row(rows, ticker):
    target = _ticker(ticker)
    for row in rows or []:
        if _ticker(row.get("ticker") or row.get("symbol")) == target:
            return row
    return None


def _pick(row, keys):
    if not isinstance(row, dict):
        return None
    return {key: row.get(key) for key in keys if key in row and row.get(key) is not None}


def _compact_list(rows, limit=5):
    if not isinstance(rows, list):
        return []
    return rows[:limit]


def _compact_narrative(row):
    if not isinstance(row, dict):
        return None
    catalyst = row.get("catalystPack") or {}
    dashboard = row.get("decisionDashboard") or {}
    context = row.get("analysisContextPack") or {}
    return {
        "ticker": row.get("ticker"),
        "oneLine": row.get("oneLine"),
        "newsCatalyst": row.get("newsCatalyst"),
        "investmentAngle": row.get("investmentAngle"),
        "validationSteps": _compact_list(row.get("validationSteps"), 5),
        "riskNotes": _compact_list(row.get("riskNotes"), 4),
        "socialReason": row.get("socialReason"),
        "agentDebate": _pick(row.get("agentDebate"), ["schemaVersion", "framework", "finalDecision"]),
        "agentDebateLLM": _pick(row.get("agentDebateLLM"), ["schemaVersion", "framework", "finalDecision"]),
        "decisionDashboard": {
            "score": dashboard.get("score"),
            "confidenceLevel": dashboard.get("confidenceLevel"),
            "decisionType": dashboard.get("decisionType"),
            "coreConclusion": dashboard.get("coreConclusion"),
            "agentDebateLLM": _pick(dashboard.get("agentDebateLLM"), ["schemaVersion", "framework", "finalDecision"]),
        } if dashboard else None,
        "catalystPack": {
            "summary": catalyst.get("summary"),
            "direction": catalyst.get("direction"),
            "signalCount": catalyst.get("signalCount"),
            "whyItMatters": _compact_list(catalyst.get("whyItMatters"), 4),
            "items": [
                _pick(item, ["title", "titleZh", "source", "publishedAt", "summary", "summaryZh", "url", "relevanceCategory", "newsRelevance"])
                for item in _compact_list(catalyst.get("items"), 5)
            ],
        } if catalyst else None,
        "analysisContextPack": {
            "status": context.get("status"),
            "overallScore": context.get("overallScore"),
            "blocks": [
                _pick(block, ["key", "title", "status", "qualityScore", "missingReason", "source"])
                for block in _compact_list(context.get("blocks"), 8)
            ],
        } if context else None,
        "sources": [
            _pick(item, ["title", "titleZh", "source", "publishedAt", "url", "articleSummary", "articleType"])
            for item in _compact_list(row.get("sources"), 8)
        ],
    }


def _compact_snapshot(snapshot):
    if not isinstance(snapshot, dict):
        return snapshot
    return {
        "quote": _pick(snapshot.get("quote"), ["ticker", "price", "changePercent", "volume", "marketCap", "provider", "asOf"]),
        "technical": _pick(snapshot.get("technical"), ["ticker", "latestClose", "sma10", "sma20", "rsi14", "trend", "volumeAvg20", "provider"]),
        "fundamental": _pick(snapshot.get("fundamental"), ["ticker", "name", "industry", "sector", "mainBusiness", "marketCap", "peTtm", "pb", "revenueGrowthTTMYoy", "grossMarginTTM", "netProfitMarginTTM"]),
        "researchPack": _pick(snapshot.get("researchPack"), ["ticker", "summary", "provider", "errors"]),
        "allNewsPack": _pick(snapshot.get("allNewsPack"), ["ticker", "summary", "provider", "errors"]),
        "investmentAdvisor": _pick(snapshot.get("investmentAdvisor"), ["ticker", "action", "summary", "confidence", "provider", "errors"]),
        "errors": _compact_list(snapshot.get("errors"), 8),
    }


def get_stock_snapshot(client, ticker):
    symbol = _ticker(ticker)
    state = client.state()
    latest = state.get("latest") or {}
    cached = {
        "quote": _pick(_find_ticker_row(latest.get("quotes"), symbol), ["ticker", "price", "changePercent", "volume", "marketCap", "provider", "asOf"]),
        "technical": _pick(_find_ticker_row(latest.get("technicals"), symbol), ["ticker", "latestClose", "sma10", "sma20", "rsi14", "trend", "volumeAvg20", "provider"]),
        "fundamental": _pick(_find_ticker_row(latest.get("fundamentals"), symbol), ["ticker", "name", "industry", "sector", "mainBusiness", "marketCap", "peTtm", "pb", "revenueGrowthTTMYoy", "grossMarginTTM", "netProfitMarginTTM"]),
        "narrative": _compact_narrative(_find_ticker_row((latest.get("stockNarratives") or {}).get("items"), symbol)),
    }
    if any(cached.values()):
        cached.update({"status": "ok", "source": "/api/state", "ticker": symbol})
        return cached
    payload = client.request("POST", "/api/stocks/snapshot", body={"ticker": symbol, "llmProvider": "local"}, timeout=30)
    if not payload.get("status") == "error" and payload.get("snapshot"):
        return {"status": "ok", "source": "/api/stocks/snapshot", "ticker": symbol, "snapshot": _compact_snapshot(payload.get("snapshot"))}
    return {
        "status": "fallback",
        "source": "/api/state",
        "ticker": symbol,
        "quote": cached.get("quote"),
        "technical": cached.get("technical"),
        "fundamental": cached.get("fundamental"),
        "narrative": cached.get("narrative"),
        "initialError": payload.get("error") or payload,
    }


def get_research_pack(client, ticker):
    symbol = _ticker(ticker)
    payload = client.request("GET", "/api/research-pack", params={"ticker": symbol}, timeout=30)
    if payload.get("researchPack"):
        return {"status": "ok", "source": "/api/research-pack", "ticker": symbol, "researchPack": payload.get("researchPack"), "errors": payload.get("errors", [])}
    return {"status": "missing", "ticker": symbol, "error": payload.get("error") or payload}


def get_industry_chain(client, ticker):
    symbol = _ticker(ticker)
    state = client.state()
    narrative = _find_ticker_row(((state.get("latest") or {}).get("stockNarratives") or {}).get("items"), symbol)
    if narrative and narrative.get("industryChainPack"):
        return {"status": "ok", "source": "/api/state.stockNarratives.industryChainPack", "ticker": symbol, "industryChainPack": _pick(narrative.get("industryChainPack"), ["schemaVersion", "summary", "relative", "peers", "upstream", "downstream", "errors"])}
    payload = client.request("GET", "/api/industry-chain-pack", params={"ticker": symbol}, timeout=30)
    if payload.get("industryChainPack"):
        return {"status": "ok", "source": "/api/industry-chain-pack", "ticker": symbol, "industryChainPack": payload.get("industryChainPack")}
    return {"status": "missing", "ticker": symbol, "error": payload.get("error") or payload}


def get_news_catalyst(client, ticker):
    symbol = _ticker(ticker)
    state = client.state()
    narrative = _find_ticker_row(((state.get("latest") or {}).get("stockNarratives") or {}).get("items"), symbol)
    if narrative and (narrative.get("catalystPack") or narrative.get("newsCatalyst") or narrative.get("sources")):
        return {"status": "ok", "source": "/api/state.stockNarratives", "ticker": symbol, "narrative": _compact_narrative(narrative)}
    payload = client.request("GET", "/api/news/all", params={"ticker": symbol, "llmProvider": "local"}, timeout=45)
    if payload.get("allNewsPack"):
        return {"status": "ok", "source": "/api/news/all", "ticker": symbol, "allNewsPack": payload.get("allNewsPack")}
    return {"status": "fallback", "source": "/api/state.stockNarratives", "ticker": symbol, "narrative": _compact_narrative(narrative), "initialError": payload.get("error") or payload}


def get_options_chain(client, ticker):
    symbol = _ticker(ticker)
    state = client.state()
    latest = state.get("latest") or {}
    options = _find_ticker_row(latest.get("options"), symbol)
    if options:
        return {"status": "ok", "source": "/api/state.options", "ticker": symbol, "optionsChain": options}
    return {"status": "missing", "ticker": symbol, "error": "当前 run 未缓存该标的期权链；harness 保持只读，未触发刷新。"}


def get_macro_regime(client):
    state = client.state()
    latest = state.get("latest") or {}
    market_overview = latest.get("marketOverview") or {}
    if market_overview:
        return {"status": "ok", "source": "/api/state.marketOverview", "marketOverview": market_overview, "macroRegime": market_overview.get("macroRegime")}
    payload = client.request("GET", "/api/fred/macro-regime", timeout=30)
    if payload.get("macroRegime"):
        return {"status": "ok", "source": "/api/fred/macro-regime", "macroRegime": payload.get("macroRegime"), "errors": payload.get("errors", [])}
    return {"status": "fallback", "source": "/api/state.marketOverview", "marketOverview": latest.get("marketOverview"), "initialError": payload.get("error") or payload}


def get_investment_advice(client, ticker):
    symbol = _ticker(ticker)
    payload = client.request("GET", "/api/investment-advice", params={"ticker": symbol, "llmProvider": "local"}, timeout=45)
    if payload.get("investmentAdvice"):
        return {"status": "ok", "source": "/api/investment-advice", "ticker": symbol, "investmentAdvice": payload.get("investmentAdvice"), "evidence": payload.get("evidence")}
    return {"status": "missing", "ticker": symbol, "error": payload.get("error") or payload}


def http_tools(base_url=None):
    client = NodeHttpClient(base_url=base_url)
    ticker_schema = {
        "type": "object",
        "required": ["ticker"],
        "properties": {"ticker": {"type": "string"}},
    }
    return [
        Tool("get_stock_snapshot", "读取单股行情/技术/基本面快照。", ticker_schema, lambda ticker: get_stock_snapshot(client, ticker)),
        Tool("get_research_pack", "读取一致预期、目标价、EPS/收入预测等研究包。", ticker_schema, lambda ticker: get_research_pack(client, ticker)),
        Tool("get_industry_chain", "读取同行业、上下游与产业链线索。", ticker_schema, lambda ticker: get_industry_chain(client, ticker)),
        Tool("get_news_catalyst", "读取单股新闻正文摘要与催化判断。", ticker_schema, lambda ticker: get_news_catalyst(client, ticker)),
        Tool("get_options_chain", "读取当前 run 已缓存的期权链和异常线索。", ticker_schema, lambda ticker: get_options_chain(client, ticker)),
        Tool("get_macro_regime", "读取 FRED/大盘宏观 regime。", {"type": "object", "properties": {}}, lambda: get_macro_regime(client)),
        Tool("get_investment_advice", "读取现有投资建议 Agent 产物和证据包。", ticker_schema, lambda ticker: get_investment_advice(client, ticker)),
    ]
