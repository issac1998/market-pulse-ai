const SEVERITY_RANK = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

const KEYWORD_CLASSES = Object.freeze([
  {
    id: "halt",
    label: "停牌/熔断",
    severityBoost: 45,
    patterns: [/trading halt|halted|suspended|circuit breaker|停牌|熔断|暂停交易/i],
  },
  {
    id: "guidance",
    label: "指引/业绩预告",
    severityBoost: 35,
    patterns: [/guidance|outlook|preannounc|raises forecast|cuts forecast|业绩指引|上调指引|下调指引|业绩预告/i],
  },
  {
    id: "offering",
    label: "融资/增发",
    severityBoost: 30,
    patterns: [/offering|secondary|convertible|atm program|share sale|equity raise|增发|配股|可转债|融资/i],
  },
  {
    id: "fda",
    label: "FDA/临床",
    severityBoost: 32,
    patterns: [/\bFDA\b|clinical trial|phase [123]|pdufa|approval|rejection|临床|获批|药监|试验/i],
  },
  {
    id: "mna",
    label: "并购/战略交易",
    severityBoost: 34,
    patterns: [/acquisition|merger|takeover|buyout|strategic review|收购|并购|私有化|要约/i],
  },
  {
    id: "investigation",
    label: "调查/诉讼",
    severityBoost: 28,
    patterns: [/investigation|subpoena|lawsuit|probe|SEC charges|DOJ|class action|调查|诉讼|传票|处罚/i],
  },
  {
    id: "index_change",
    label: "指数纳入/剔除",
    severityBoost: 22,
    patterns: [/index inclusion|index deletion|added to|removed from|S&P 500|Nasdaq 100|Russell|纳入指数|剔除指数/i],
  },
  {
    id: "earnings",
    label: "财报/业绩",
    severityBoost: 20,
    patterns: [/earnings|revenue|EPS|quarterly results|margin|财报|业绩|营收|每股收益|毛利率/i],
  },
]);

export function severityRank(value = "") {
  return SEVERITY_RANK[String(value || "").toLowerCase()] || 0;
}

export function severityAtLeast(value = "", threshold = "medium") {
  return severityRank(value) >= severityRank(threshold);
}

export function normalizeAlertText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u4e00-\u9fa5%.$+-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyCatalystClass(text = "") {
  const normalized = normalizeAlertText(text);
  for (const row of KEYWORD_CLASSES) {
    if (row.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        id: row.id,
        label: row.label,
        severityBoost: row.severityBoost,
      };
    }
  }
  return { id: "price_volume", label: "价格/成交量异动", severityBoost: 0 };
}

function textShingles(text = "", size = 3, limit = 12) {
  const tokens = normalizeAlertText(text)
    .split(" ")
    .filter((token) => token && token.length > 1)
    .slice(0, 32);
  if (tokens.length <= size) return tokens.slice(0, limit);
  const rows = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    rows.push(tokens.slice(index, index + size).join("_"));
    if (rows.length >= limit) break;
  }
  return rows;
}

export function storyFingerprint(input = {}) {
  const ticker = String(input.ticker || "MARKET").toUpperCase().replace(/[^A-Z0-9.-]/g, "") || "MARKET";
  const catalyst = input.catalystClass || classifyCatalystClass(input.headline || input.title || input.detail || "").id;
  const headline = input.headline || input.title || input.detail || `${ticker} ${catalyst}`;
  const shingles = textShingles(headline);
  return [ticker, catalyst, shingles.join("|") || normalizeAlertText(headline).slice(0, 80)].join(":").slice(0, 240);
}

export function noveltyForFingerprint(fingerprint = "", existingAlerts = [], options = {}) {
  const lookbackDays = Math.max(1, Number(options.lookbackDays || 5));
  const nowMs = new Date(options.now || Date.now()).getTime();
  const cutoff = nowMs - lookbackDays * 86400000;
  const matched = (existingAlerts || []).find((alert) => {
    if (alert?.storyFingerprint !== fingerprint) return false;
    const createdMs = new Date(alert.createdAt || 0).getTime();
    return Number.isFinite(createdMs) && createdMs >= cutoff;
  });
  return matched
    ? { novelty: "update", matchedAlertId: matched.id || "", matchedAt: matched.createdAt || "" }
    : { novelty: "new", matchedAlertId: "", matchedAt: "" };
}

function severityFromScore(score) {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function triageIntradaySignal(signal = {}, context = {}) {
  const headline = signal.headline || signal.title || signal.reason || "";
  const catalyst = classifyCatalystClass(`${headline} ${signal.detail || ""}`);
  const movePercent = numberOrNull(signal.movePercent);
  const moveZ = numberOrNull(signal.moveZ);
  const volumePace = numberOrNull(signal.volumePace);
  const spreadPct = numberOrNull(signal.spreadPct);
  const reasons = [];
  let score = 10 + catalyst.severityBoost;

  if (Number.isFinite(moveZ)) {
    if (moveZ >= 3) {
      score += 35;
      reasons.push(`价格波动约 ${moveZ.toFixed(1)} 倍 ATR。`);
    } else if (moveZ >= 2) {
      score += 25;
      reasons.push(`价格波动约 ${moveZ.toFixed(1)} 倍 ATR。`);
    } else if (moveZ >= 1.5) {
      score += 14;
      reasons.push(`价格波动约 ${moveZ.toFixed(1)} 倍 ATR。`);
    }
  }
  if (Number.isFinite(movePercent)) {
    const absMove = Math.abs(movePercent);
    if (absMove >= 5) score += 25;
    else if (absMove >= 3) score += 15;
    else if (absMove >= 2) score += 8;
    if (absMove >= 2) reasons.push(`价格变动 ${movePercent >= 0 ? "+" : ""}${movePercent.toFixed(2)}%。`);
  }
  if (Number.isFinite(volumePace)) {
    if (volumePace >= 4) score += 28;
    else if (volumePace >= 2.5) score += 18;
    else if (volumePace >= 1.8) score += 10;
    if (volumePace >= 1.8) reasons.push(`成交量节奏约 ${volumePace.toFixed(1)}x。`);
  }
  if (Number.isFinite(spreadPct) && spreadPct >= 1.5) {
    score += 12;
    reasons.push(`盘口价差约 ${spreadPct.toFixed(2)}%。`);
  }
  if (signal.quoteStale) {
    score += 6;
    reasons.push("报价可能滞后，需要复核行情源。");
  }
  if (signal.crossed52WeekHigh) {
    score += 18;
    reasons.push("触及或突破 52 周高点。");
  }
  if (signal.crossed52WeekLow) {
    score += 18;
    reasons.push("触及或跌破 52 周低点。");
  }
  if (signal.earningsDay || context.earningsDay) {
    score += 10;
    reasons.push("临近或处于财报日。");
  }
  const membership = new Set([...(signal.membership || []), ...(context.membership || [])]);
  if (membership.has("open_position")) score += 8;
  if (membership.has("watchlist")) score += 5;
  if (membership.has("today_candidate")) score += 5;
  if (catalyst.id !== "price_volume") reasons.push(`新闻/事件关键词：${catalyst.label}。`);

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const fingerprint = storyFingerprint({
    ticker: signal.ticker,
    headline: headline || `${signal.ticker || "MARKET"} ${reasons.join(" ")}`,
    catalystClass: catalyst.id,
  });
  const novelty = noveltyForFingerprint(fingerprint, context.existingAlerts || [], {
    now: context.now,
    lookbackDays: context.noveltyLookbackDays,
  });
  const severity = novelty.novelty === "update" && boundedScore < 90 ? severityFromScore(Math.max(45, boundedScore - 10)) : severityFromScore(boundedScore);
  const ticker = String(signal.ticker || "MARKET").toUpperCase();
  return {
    schemaVersion: "intraday-alert-triage-v1",
    ticker,
    severity,
    score: boundedScore,
    catalystClass: catalyst.id,
    catalystLabel: catalyst.label,
    novelty: novelty.novelty,
    matchedAlertId: novelty.matchedAlertId,
    storyFingerprint: fingerprint,
    title: signal.title || `${ticker} ${novelty.novelty === "update" ? "异动更新" : "盘中异动"}`,
    detail: reasons.join(" ") || signal.detail || "触发盘中监控信号。",
    reasons,
    evidenceIds: (signal.evidenceIds || []).slice(0, 8),
    llmCriticalPath: false,
  };
}
