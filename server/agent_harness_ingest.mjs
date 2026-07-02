function requestHeaderValue(req, key) {
  const value = req.headers?.[String(key || "").toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function compactAgentDebateForIngest(value, { cloneValue, nowIso } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const debate = typeof cloneValue === "function" ? cloneValue(value) : JSON.parse(JSON.stringify(value));
  debate.schemaVersion = String(debate.schemaVersion || "trading-agents-llm-v2");
  debate.ingestedAt = debate.ingestedAt || nowIso?.() || new Date().toISOString();
  debate.source = debate.source || "python-agent-harness";
  if (!debate.finalDecision || typeof debate.finalDecision !== "object") {
    debate.finalDecision = {
      action: "信息不足：保持观察",
      riskVeto: false,
      confidence: 50,
      rationale: ["Python harness 回灌结果缺少 finalDecision，已按保守结论处理。"],
    };
  }
  debate.finalDecision = {
    action: String(debate.finalDecision.action || "信息不足：保持观察").slice(0, 240),
    riskVeto: Boolean(debate.finalDecision.riskVeto),
    confidence: Math.max(0, Math.min(100, Number(debate.finalDecision.confidence) || 50)),
    rationale: Array.isArray(debate.finalDecision.rationale)
      ? debate.finalDecision.rationale.slice(0, 8).map((item) => String(item || "").slice(0, 500)).filter(Boolean)
      : [],
  };
  if (Array.isArray(debate.traces)) {
    debate.traces = debate.traces.slice(0, 8);
  }
  return debate;
}

export function deterministicAgentDebateForGate(debate = null) {
  if (!debate || typeof debate !== "object") return null;
  const schema = String(debate.schemaVersion || "");
  const source = String(debate.source || debate.provider || "");
  if (/python-agent-harness|agy-cli|antigravity|codex-cli|codex|llm/i.test(source)) return null;
  if (/trading-agents-llm-v\d+/i.test(schema)) return null;
  return debate;
}

export function separatedAgentDebateNarrative(item = null) {
  if (!item || typeof item !== "object") return item;
  const deterministic = deterministicAgentDebateForGate(item.agentDebate);
  const llmDebate = deterministic ? item.agentDebateLLM : item.agentDebateLLM || item.agentDebate || null;
  const dashboard = item.decisionDashboard && typeof item.decisionDashboard === "object" ? item.decisionDashboard : null;
  const dashboardDeterministic = deterministicAgentDebateForGate(dashboard?.agentDebate);
  const dashboardLlmDebate = dashboardDeterministic ? dashboard?.agentDebateLLM : dashboard?.agentDebateLLM || dashboard?.agentDebate || null;
  return {
    ...item,
    agentDebate: deterministic || undefined,
    agentDebateLLM: llmDebate || undefined,
    decisionDashboard: dashboard
      ? {
          ...dashboard,
          agentDebate: dashboardDeterministic || undefined,
          agentDebateLLM: dashboardLlmDebate || undefined,
        }
      : dashboard,
  };
}

export function verifyAgentDebateIngestRequest(req, { enabled = false, token: expectedToken = "" } = {}) {
  if (!enabled) {
    return { ok: false, status: 403, error: "Agent Debate ingest 默认关闭；设置 AGENT_DEBATE_INGEST_ENABLED=true 后才允许回灌。" };
  }
  if (!expectedToken) return { ok: true };
  const token =
    requestHeaderValue(req, "x-agent-harness-token") ||
    requestHeaderValue(req, "authorization").replace(/^Bearer\s+/i, "");
  if (token !== expectedToken) {
    return { ok: false, status: 401, error: "Agent Debate ingest token 无效。" };
  }
  return { ok: true };
}

export function ingestAgentDebateIntoRun(db, body = {}, deps = {}) {
  const { safeTicker, latestRun, cloneValue, nowIso } = deps;
  const normalizeTicker = typeof safeTicker === "function" ? safeTicker : (value) => String(value || "").trim().toUpperCase();
  const ticker = normalizeTicker(body.ticker || body.symbol || body.debate?.ticker);
  if (!ticker) return { error: "请输入 ticker。", status: 400 };
  const debate = compactAgentDebateForIngest(body.debate || body.agentDebate || body.payload, { cloneValue, nowIso });
  if (!debate) return { error: "缺少有效 debate 对象。", status: 400 };
  const runId = String(body.runId || body.id || "").trim();
  const run = runId ? db.runs.find((item) => item.id === runId) : latestRun?.(db);
  if (!run) return { error: "暂无可回灌的 run。", status: 404 };
  const stockNarratives = run.stockNarratives && typeof run.stockNarratives === "object"
    ? run.stockNarratives
    : { items: [] };
  const items = Array.isArray(stockNarratives.items) ? stockNarratives.items : [];
  const index = items.findIndex((item) => normalizeTicker(item.ticker) === ticker);
  const previous = index >= 0 ? items[index] : { ticker, provider: "python-agent-harness" };
  const previousDeterministicDebate = deterministicAgentDebateForGate(previous.agentDebate);
  const previousDashboardDeterministicDebate = deterministicAgentDebateForGate(previous.decisionDashboard?.agentDebate);
  const nextItem = {
    ...previous,
    ticker,
    provider: previous.provider || "python-agent-harness",
    agentDebate: previousDeterministicDebate || undefined,
    agentDebateLLM: debate,
    decisionDashboard: {
      ...(previous.decisionDashboard || {}),
      agentDebate: previousDashboardDeterministicDebate || undefined,
      agentDebateLLM: debate,
    },
  };
  if (!nextItem.oneLine) {
    nextItem.oneLine = `${ticker} 已回灌 Python Agent Harness 辩论结果：${debate.finalDecision.action}`;
  }
  const nextItems = index >= 0
    ? items.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
    : [nextItem, ...items];
  run.stockNarratives = {
    ...stockNarratives,
    items: nextItems,
    harnessUpdatedAt: nowIso?.() || new Date().toISOString(),
  };
  db.runs = db.runs.map((item) => (item.id === run.id ? run : item));
  return { ticker, run, debate };
}
