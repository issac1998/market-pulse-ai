import { isNyseTradingDay } from "../lib/market_core.mjs";
import { triageIntradaySignal } from "../lib/alert_triage.mjs";
import { deliverPushNotification, normalizePushConfig } from "./push_delivery.mjs";

const DEFAULT_INTERVAL_MS = 120000;

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").split(".")[0];
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowIso() {
  return new Date().toISOString();
}

function compactId(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nyParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    ymd: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

export function intradayWatcherConfigFromEnv(env = process.env) {
  return {
    enabled: String(env.INTRADAY_WATCHER_ENABLED || "false").toLowerCase() === "true",
    intervalMs: Math.max(15000, Number(env.INTRADAY_WATCHER_INTERVAL_MS || DEFAULT_INTERVAL_MS)),
    universeLimit: Math.max(10, Number(env.INTRADAY_WATCHER_UNIVERSE_LIMIT || 100)),
    noveltyLookbackDays: Math.max(1, Number(env.INTRADAY_WATCHER_NOVELTY_DAYS || 5)),
    minSeverity: String(env.INTRADAY_WATCHER_MIN_SEVERITY || "medium").toLowerCase(),
    explainBaseUrl: String(env.PUBLIC_APP_URL || env.APP_URL || "http://localhost:5173").replace(/\/+$/, ""),
    push: normalizePushConfig(env),
  };
}

export function isNyseRegularOrExtendedWindow(date = new Date()) {
  const parts = nyParts(date);
  if (!isNyseTradingDay(parts.ymd)) return false;
  return parts.minutes >= 4 * 60 && parts.minutes <= 20 * 60;
}

function addUniverse(map, ticker, reason) {
  const safe = safeTicker(ticker);
  if (!safe) return;
  const row = map.get(safe) || { ticker: safe, membership: [] };
  if (reason && !row.membership.includes(reason)) row.membership.push(reason);
  map.set(safe, row);
}

function activePaperPositionTickers(allStockAgent = {}) {
  const active = new Map();
  const decisions = Array.isArray(allStockAgent.decisions) ? allStockAgent.decisions.slice().reverse() : [];
  for (const decision of decisions) {
    const ticker = safeTicker(decision.ticker);
    if (!ticker) continue;
    if (decision.action === "买入" && decision.status !== "watch-buy" && decision.thresholdMet !== false && decision.actionable !== false) {
      active.set(ticker, true);
    }
    if (decision.action === "卖出") active.delete(ticker);
  }
  return [...active.keys()];
}

export function buildIntradayUniverse(db = {}, options = {}) {
  const limit = Math.max(1, Number(options.limit || 100));
  const map = new Map();
  for (const ticker of db.watchlist || []) addUniverse(map, ticker, "watchlist");
  for (const position of db.portfolio || []) addUniverse(map, position.ticker || position.symbol, "open_position");
  for (const ticker of activePaperPositionTickers(db.allStockAgent || {})) addUniverse(map, ticker, "open_position");
  const latestAgent = Array.isArray(db.allStockAgent?.runs) ? db.allStockAgent.runs[0] : null;
  for (const row of [
    ...(latestAgent?.buyCandidates || []),
    ...(latestAgent?.watchBuyCandidates || []),
    ...(latestAgent?.sellCandidates || []),
  ]) {
    addUniverse(map, row.ticker, "today_candidate");
  }
  return [...map.values()].slice(0, limit);
}

function latestTechnicalForTicker(technicals = [], ticker = "") {
  const safe = safeTicker(ticker);
  return (technicals || []).find((item) => safeTicker(item.ticker) === safe) || null;
}

function latestQuoteForTicker(quotes = [], ticker = "") {
  const safe = safeTicker(ticker);
  return (quotes || []).find((item) => safeTicker(item.ticker) === safe) || null;
}

function quoteAgeMs(quote = {}, now = new Date()) {
  const stamp = quote.timestamp || quote.updatedAt || quote.time || quote.capturedAt;
  const ms = new Date(stamp || 0).getTime();
  return Number.isFinite(ms) && ms > 0 ? now.getTime() - ms : null;
}

export function buildIntradaySignals({ universe = [], quotes = [], technicals = [], previousQuotes = {}, latestRun = {}, now = new Date(), simulatedSignals = [] } = {}) {
  const rows = [];
  for (const item of universe || []) {
    const ticker = safeTicker(item.ticker);
    const quote = latestQuoteForTicker(quotes, ticker) || {};
    const technical = latestTechnicalForTicker(technicals, ticker) || latestTechnicalForTicker(latestRun.technicals || [], ticker) || {};
    const price = numberOrNull(quote.price ?? technical.latestClose);
    if (!ticker || !Number.isFinite(price) || price <= 0) continue;
    const previousClose = numberOrNull(quote.previousClose);
    const open = numberOrNull(quote.open);
    const changePercent =
      numberOrNull(quote.changePercent) ??
      (Number.isFinite(previousClose) && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : null);
    const atr = numberOrNull(technical.atr14);
    const atrPct = Number.isFinite(atr) && atr > 0 ? (atr / price) * 100 : null;
    const moveZ = Number.isFinite(changePercent) && Number.isFinite(atrPct) && atrPct > 0 ? Math.abs(changePercent) / atrPct : null;
    const volumePace = numberOrNull(quote.volumePace ?? quote.sameTimeVolumePace);
    const bid = numberOrNull(quote.bid);
    const ask = numberOrNull(quote.ask);
    const spreadPct = Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid && price > 0 ? ((ask - bid) / price) * 100 : null;
    const week52High = numberOrNull(technical.keyLevels?.week52High);
    const week52Low = numberOrNull(technical.keyLevels?.week52Low);
    const previous = previousQuotes[ticker] || {};
    const previousPrice = numberOrNull(previous.price);
    const quoteAge = quoteAgeMs(quote, now);
    const gapPercent = Number.isFinite(open) && Number.isFinite(previousClose) && previousClose > 0
      ? ((open - previousClose) / previousClose) * 100
      : null;
    const driftPercent = Number.isFinite(previousPrice) && previousPrice > 0
      ? ((price - previousPrice) / previousPrice) * 100
      : null;
    const triggers = [];
    if (Number.isFinite(moveZ) && moveZ >= 1.5) triggers.push("move_vs_atr");
    if (Number.isFinite(changePercent) && Math.abs(changePercent) >= 3) triggers.push("absolute_move");
    if (Number.isFinite(volumePace) && volumePace >= 1.8) triggers.push("volume_pace_daily_proxy");
    if (Number.isFinite(spreadPct) && spreadPct >= 1.5) triggers.push("spread_blowout");
    if (Number.isFinite(quoteAge) && quoteAge > 15 * 60 * 1000) triggers.push("stale_quote");
    if (Number.isFinite(week52High) && price >= week52High) triggers.push("cross_52w_high");
    if (Number.isFinite(week52Low) && price <= week52Low) triggers.push("cross_52w_low");
    if (!triggers.length) continue;
    rows.push({
      ticker,
      price,
      movePercent: changePercent,
      moveZ,
      gapPercent,
      driftPercent,
      volumePace,
      spreadPct,
      quoteStale: Number.isFinite(quoteAge) && quoteAge > 15 * 60 * 1000,
      crossed52WeekHigh: Number.isFinite(week52High) && price >= week52High,
      crossed52WeekLow: Number.isFinite(week52Low) && price <= week52Low,
      membership: item.membership || [],
      evidenceIds: triggers,
      title: `${ticker} 盘中异动`,
      detail: triggers.join(", "),
      source: "intraday-watcher",
      volumePaceSource: Number.isFinite(volumePace) ? "same_time_20d" : "missing_same_time_20d_baseline",
    });
  }
  return [...rows, ...(simulatedSignals || [])];
}

export function buildStaticAnticipationCalendar(now = new Date()) {
  const parts = nyParts(now);
  const month = parts.ymd.slice(5, 7);
  const opex = { type: "OPEX", priority: "medium", note: "月度期权到期窗口，关注指数权重和高 Gamma 标的。" };
  const fomcMonths = new Set(["01", "03", "05", "06", "07", "09", "11", "12"]);
  const cpi = { type: "CPI", priority: "high", note: "CPI/FOMC 等宏观事件前后提高观察频率。" };
  return [opex, ...(fomcMonths.has(month) ? [{ type: "FOMC", priority: "high", note: "FOMC 月份，利率敏感资产提高观察频率。" }] : []), cpi];
}

function ymd(value = "") {
  return String(value || "").slice(0, 10);
}

function dayDiff(a = "", b = "") {
  const ams = new Date(`${ymd(a)}T00:00:00Z`).getTime();
  const bms = new Date(`${ymd(b)}T00:00:00Z`).getTime();
  if (!Number.isFinite(ams) || !Number.isFinite(bms)) return null;
  return Math.round((bms - ams) / 86400000);
}

export function buildConsensusSnapshots({ db = {}, latestRun = {}, now = new Date() } = {}) {
  const today = nyParts(now).ymd;
  const watch = new Set((db.watchlist || []).map(safeTicker).filter(Boolean));
  const existing = new Set((db.consensusSnapshots || []).map((row) => row.id).filter(Boolean));
  const rows = [];
  for (const event of latestRun.eventCalendar?.earnings || []) {
    const ticker = safeTicker(event.ticker);
    if (!ticker || !watch.has(ticker)) continue;
    if (dayDiff(today, event.date || event.reportDate || event.eventDate) !== 1) continue;
    const research = (latestRun.researchPacks || []).find((row) => safeTicker(row.ticker) === ticker) || {};
    const summary = research.summary || {};
    const id = `${ticker}:${ymd(event.date || event.reportDate || event.eventDate)}:${today}`;
    if (existing.has(id)) continue;
    rows.push({
      schemaVersion: "consensus-snapshot-v1",
      id,
      ticker,
      eventDate: ymd(event.date || event.reportDate || event.eventDate),
      capturedAt: now.toISOString(),
      epsEstimate: numberOrNull(summary.epsEstimate),
      revenueEstimate: numberOrNull(summary.revenueEstimate),
      targetPrice: numberOrNull(summary.targetPrice),
      source: research.provider || "research-pack",
      status: research.summary ? "ok" : "missing_research_pack",
      event,
    });
  }
  return rows;
}

export async function runIntradayWatcherOnce(deps = {}, options = {}) {
  const config = { ...intradayWatcherConfigFromEnv(), ...(options.config || {}) };
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  if (!config.enabled && !options.force) {
    return { status: "disabled", alerts: [], auditEvents: [], consensusSnapshots: [], llmCriticalPath: false };
  }
  if (!options.force && !isNyseRegularOrExtendedWindow(now)) {
    return { status: "outside_market_window", alerts: [], auditEvents: [], consensusSnapshots: [], llmCriticalPath: false };
  }
  const db = deps.db || {};
  const latestRun = typeof deps.latestRun === "function" ? (deps.latestRun(db) || {}) : (deps.latestRun || {});
  const universe = options.universe || buildIntradayUniverse(db, { limit: config.universeLimit });
  const tickers = universe.map((row) => row.ticker);
  const [quoteResult, technicalResult] = await Promise.all([
    deps.collectQuotes ? deps.collectQuotes(tickers) : Promise.resolve({ quotes: [], errors: [] }),
    deps.collectTechnicalData ? deps.collectTechnicalData(tickers, { limit: tickers.length }) : Promise.resolve({ technicals: [], errors: [] }),
  ]);
  db.intradayWatcher ||= {};
  const previousQuotes = db.intradayWatcher.lastQuotes || {};
  const signals = buildIntradaySignals({
    universe,
    quotes: quoteResult.quotes || [],
    technicals: technicalResult.technicals || [],
    previousQuotes,
    latestRun,
    now,
    simulatedSignals: options.simulatedSignals || [],
  });
  const existingAlerts = [...(db.alerts || []), ...(latestRun.alerts || [])];
  const auditEvents = [];
  const alerts = signals.map((signal) => {
    const triage = triageIntradaySignal(signal, {
      existingAlerts,
      now,
      noveltyLookbackDays: config.noveltyLookbackDays,
      membership: signal.membership,
    });
    const alert = {
      id: compactId("intraday-alert"),
      alertKey: triage.storyFingerprint,
      storyFingerprint: triage.storyFingerprint,
      createdAt: now.toISOString(),
      severity: triage.severity,
      ticker: triage.ticker,
      title: triage.title,
      detail: triage.detail,
      evidenceIds: triage.evidenceIds,
      status: "active",
      catalystClass: triage.catalystClass,
      novelty: triage.novelty,
      score: triage.score,
      explainUrl: `${config.explainBaseUrl}/api/intraday/explain?ticker=${encodeURIComponent(triage.ticker)}`,
      llmCriticalPath: false,
      rawSignal: signal,
    };
    auditEvents.push({
      eventType: "intraday_watcher.alert",
      actor: "intraday-watcher",
      status: "ok",
      createdAt: now.toISOString(),
      payload: {
        alertId: alert.id,
        ticker: alert.ticker,
        severity: alert.severity,
        storyFingerprint: alert.storyFingerprint,
        llmCriticalPath: false,
        signalSource: signal.source || "intraday-watcher",
      },
    });
    return alert;
  });
  db.alerts = [...alerts, ...(db.alerts || [])].slice(0, 300);
  db.intradayWatcher.lastQuotes = Object.fromEntries(
    (quoteResult.quotes || []).map((quote) => [safeTicker(quote.ticker), { price: numberOrNull(quote.price), timestamp: quote.timestamp || now.toISOString() }]),
  );
  db.intradayWatcher.lastRunAt = now.toISOString();
  db.intradayWatcher.lastErrors = [...(quoteResult.errors || []), ...(technicalResult.errors || [])].slice(0, 20);
  db.pushDeliveryState ||= {};
  const pushResults = [];
  for (const alert of alerts) {
    try {
      pushResults.push(await deliverPushNotification(alert, config.push, db.pushDeliveryState));
    } catch (error) {
      const failure = { status: "failed", provider: config.push.provider || "", error: error.message, ticker: alert.ticker };
      pushResults.push(failure);
      auditEvents.push({
        eventType: "intraday_watcher.push_failed",
        actor: "intraday-watcher",
        status: "fail",
        createdAt: now.toISOString(),
        payload: failure,
      });
    }
  }
  const consensusSnapshots = buildConsensusSnapshots({ db, latestRun, now });
  if (consensusSnapshots.length) {
    db.consensusSnapshots = [...consensusSnapshots, ...(db.consensusSnapshots || [])].slice(0, 2000);
    for (const snapshot of consensusSnapshots) {
      auditEvents.push({
        eventType: "intraday_watcher.consensus_snapshot",
        actor: "intraday-watcher",
        status: snapshot.status === "ok" ? "ok" : "warn",
        createdAt: now.toISOString(),
        payload: { id: snapshot.id, ticker: snapshot.ticker, eventDate: snapshot.eventDate, status: snapshot.status },
      });
    }
  }
  return {
    status: "ok",
    universeCount: universe.length,
    signalCount: signals.length,
    alerts,
    auditEvents,
    pushResults,
    consensusSnapshots,
    staticCalendar: buildStaticAnticipationCalendar(now),
    llmCriticalPath: false,
  };
}

export function createIntradayWatcher(deps = {}, options = {}) {
  const config = { ...intradayWatcherConfigFromEnv(), ...(options.config || {}) };
  let timer = null;
  let running = false;
  const runOnce = async (runOptions = {}) => {
    if (running) return { status: "already_running" };
    running = true;
    try {
      return await runIntradayWatcherOnce(deps, { ...runOptions, config });
    } finally {
      running = false;
    }
  };
  return {
    config,
    runOnce,
    start() {
      if (!config.enabled || timer) return false;
      timer = setInterval(() => {
        runOnce().catch((error) => {
          if (deps.onError) deps.onError(error);
        });
      }, config.intervalMs);
      timer.unref?.();
      return true;
    },
    stop() {
      if (!timer) return false;
      clearInterval(timer);
      timer = null;
      return true;
    },
  };
}
