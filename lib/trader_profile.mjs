function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function daysBetween(a = "", b = "") {
  const start = new Date(`${ymd(a)}T00:00:00.000Z`);
  const end = new Date(`${ymd(b)}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function median(values = []) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

function std(values = []) {
  const rows = values.filter(Number.isFinite);
  if (rows.length < 2) return null;
  const avg = mean(rows);
  return Math.sqrt(rows.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (rows.length - 1));
}

function correlation(xs = [], ys = []) {
  const pairs = xs.map((x, index) => [numberOrNull(x), numberOrNull(ys[index])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const xAvg = mean(pairs.map(([x]) => x));
  const yAvg = mean(pairs.map(([, y]) => y));
  let numerator = 0;
  let xDen = 0;
  let yDen = 0;
  for (const [x, y] of pairs) {
    const xd = x - xAvg;
    const yd = y - yAvg;
    numerator += xd * yd;
    xDen += xd * xd;
    yDen += yd * yd;
  }
  const denominator = Math.sqrt(xDen * yDen);
  return denominator ? numerator / denominator : null;
}

function metric(id, value, n, options = {}) {
  const minSamples = Number(options.minSamples || 1);
  const status = Number(n || 0) >= minSamples && Number.isFinite(value) ? "ok" : "insufficient_data";
  return {
    id,
    value: Number.isFinite(value) ? value : null,
    n: Number(n || 0),
    status,
    minSamples,
    unit: options.unit || "",
  };
}

function pctMetric(id, count, n, options = {}) {
  return metric(id, n ? (count / n) * 100 : null, n, { ...options, unit: "%" });
}

function barsByTicker(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker).push({
      ...row,
      date: ymd(row.date),
      open: numberOrNull(row.open),
      high: numberOrNull(row.high),
      low: numberOrNull(row.low),
      close: numberOrNull(row.close),
      volume: numberOrNull(row.volume),
    });
  }
  for (const values of map.values()) values.sort((a, b) => a.date.localeCompare(b.date));
  return map;
}

function historyBefore(rows = [], date = "", count = 20) {
  const target = ymd(date);
  return rows.filter((row) => row.date && row.date <= target).slice(-count);
}

function historyBetween(rows = [], start = "", end = "") {
  const a = ymd(start);
  const b = ymd(end);
  return rows.filter((row) => row.date >= a && row.date <= b);
}

function barAfter(rows = [], date = "", offset = 1) {
  const target = ymd(date);
  const future = rows.filter((row) => row.date > target);
  return future[Math.max(0, offset - 1)] || null;
}

function lotReturnPct(lot = {}) {
  const entry = numberOrNull(lot.entryPrice);
  const exit = numberOrNull(lot.exitPrice);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit)) return null;
  if (lot.positionSide === "short") return ((entry - exit) / entry) * 100;
  return ((exit - entry) / entry) * 100;
}

function notional(lot = {}) {
  const entry = numberOrNull(lot.entryPrice);
  const quantity = numberOrNull(lot.quantity);
  return Number.isFinite(entry) && Number.isFinite(quantity) ? Math.abs(entry * quantity) : null;
}

function maxDrawdownFromPnl(lots = []) {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const curve = [];
  for (const lot of lots.slice().sort((a, b) => String(a.closedAt).localeCompare(String(b.closedAt)))) {
    equity += numberOrNull(lot.realizedPnl) || 0;
    peak = Math.max(peak, equity);
    const drawdown = equity - peak;
    maxDrawdown = Math.min(maxDrawdown, drawdown);
    curve.push({ date: ymd(lot.closedAt), equity, drawdown });
  }
  return { value: maxDrawdown, curve };
}

function tradeWeekKey(trade = {}) {
  const date = new Date(`${ymd(trade.executedAt)}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return "";
  const oneJan = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - oneJan) / 86400000) + oneJan.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function sectorForTicker(securityMaster = {}, ticker = "") {
  if (securityMaster instanceof Map) return securityMaster.get(ticker)?.sector || "unknown";
  if (Array.isArray(securityMaster)) return securityMaster.find((row) => String(row.ticker || "").toUpperCase() === ticker)?.sector || "unknown";
  return securityMaster?.[ticker]?.sector || "unknown";
}

function tag(axis, value, status, evidence = []) {
  return { axis, tag: value, status, evidence };
}

function tickerKey(value = "") {
  return String(value || "").trim().toUpperCase().replace(/^\$/, "");
}

function normalizeAction(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (["buy", "b", "long", "买入", "加仓"].includes(text)) return "buy";
  if (["sell", "s", "short", "卖出", "减仓", "止盈", "止损"].includes(text)) return "sell";
  return text;
}

function tradingDayDistance(a = "", b = "") {
  const start = new Date(`${ymd(a)}T00:00:00.000Z`);
  const end = new Date(`${ymd(b)}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.round((end - start) / 86400000);
}

function insufficientStyleTags(reason = "round trips < 20") {
  return [
    tag("horizon", "insufficient_data", "insufficient_data", [{ metricId: "results.roundTrips", reason }]),
    tag("entryStyle", "insufficient_data", "insufficient_data", [{ metricId: "entry.chaseRate", reason }]),
    tag("riskDiscipline", "insufficient_data", "insufficient_data", [{ metricId: "exit.worstDecileLossShare", reason }]),
    tag("diversification", "insufficient_data", "insufficient_data", [{ metricId: "concentration.sectorHhi", reason }]),
    tag("turnover", "insufficient_data", "insufficient_data", [{ metricId: "concentration.tradesPerWeek", reason }]),
  ];
}

export function buildTraderSystemOverlap({
  trades = [],
  decisions = [],
  outcomes = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const actionable = (decisions || []).filter((decision) => decision && decision.actionable !== false);
  const outcomeByDecision = new Map((outcomes || []).map((row) => [String(row.decisionId || row.id || ""), row]));
  const rows = (trades || [])
    .filter((trade) => trade && trade.ticker)
    .map((trade) => {
      const side = normalizeAction(trade.side);
      const sameTicker = actionable
        .filter((decision) => tickerKey(decision.ticker) === tickerKey(trade.ticker))
        .map((decision) => ({
          decision,
          distance: tradingDayDistance(decision.generatedAt || decision.createdAt, trade.executedAt || trade.createdAt),
        }))
        .filter((row) => row.distance !== null && Math.abs(row.distance) <= 2)
        .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
      const match = sameTicker.find(({ decision }) => normalizeAction(decision.action) === side) || null;
      return {
        tradeId: trade.id || "",
        decisionId: match?.decision?.id || "",
        ticker: tickerKey(trade.ticker),
        classification: match ? "followed" : "owner_instinct",
        distanceDays: match?.distance ?? null,
        trade,
        decision: match?.decision || null,
      };
    });
  const followed = rows.filter((row) => row.classification === "followed");
  const instinct = rows.filter((row) => row.classification === "owner_instinct");
  const actionableBuyIds = new Set(
    actionable.filter((decision) => normalizeAction(decision.action) === "buy").map((decision) => String(decision.id || "")),
  );
  const tradedDecisionIds = new Set(followed.map((row) => row.decisionId).filter(Boolean));
  const ignoredWinners = [...actionableBuyIds].filter((id) => !tradedDecisionIds.has(id) && outcomeByDecision.get(id)?.outcome === "win").length;
  const avgOutcome = (items) => {
    const values = items.map((row) => numberOrNull(outcomeByDecision.get(row.decisionId)?.excessPct)).filter(Number.isFinite);
    return metric("systemOverlap.avgExcessPct", values.length ? mean(values) : null, values.length, { unit: "%" });
  };
  return {
    schemaVersion: "trader-system-overlap-v1",
    generatedAt,
    followRate: pctMetric("systemOverlap.followRate", followed.length, rows.length),
    followedOutcome: avgOutcome(followed),
    ownerInstinctOutcome: avgOutcome(instinct),
    ignoredWinners: metric("systemOverlap.ignoredWinners", ignoredWinners, actionableBuyIds.size),
    rows: rows.slice(0, 100),
  };
}

export function buildTraderProfile({
  closedLots = [],
  openLots = [],
  trades = [],
  bars = [],
  securityMaster = {},
  spyBars = [],
  systemOverlap = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const lots = (closedLots || []).filter((lot) => lot && lot.ticker);
  const tradeRows = (trades || []).filter((trade) => trade && trade.ticker);
  const byBars = barsByTicker(bars);
  const spy = barsByTicker(spyBars.length ? spyBars : bars).get("SPY") || [];
  const returns = lots.map(lotReturnPct).filter(Number.isFinite);
  const wins = lots.filter((lot) => (numberOrNull(lot.realizedPnl) || 0) >= 0);
  const losses = lots.filter((lot) => (numberOrNull(lot.realizedPnl) || 0) < 0);
  const grossProfit = wins.reduce((sum, lot) => sum + Math.max(0, numberOrNull(lot.realizedPnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, lot) => sum + Math.min(0, numberOrNull(lot.realizedPnl) || 0), 0));
  const holdingDays = lots.map((lot) => numberOrNull(lot.holdingDays) ?? daysBetween(lot.openedAt, lot.closedAt)).filter(Number.isFinite);
  const drawdown = maxDrawdownFromPnl(lots);

  const entryContexts = lots.map((lot) => {
    const rows = byBars.get(String(lot.ticker || "").toUpperCase()) || [];
    const history = historyBefore(rows, lot.openedAt, 20);
    const highs = history.map((row) => row.high).filter(Number.isFinite);
    const lows = history.map((row) => row.low).filter(Number.isFinite);
    const closes = history.map((row) => row.close).filter(Number.isFinite);
    const high20 = highs.length ? Math.max(...highs) : null;
    const low20 = lows.length ? Math.min(...lows) : null;
    const sma20 = mean(closes);
    const entry = numberOrNull(lot.entryPrice);
    const ret = lotReturnPct(lot);
    const chase = Number.isFinite(entry) && Number.isFinite(high20) ? entry >= high20 * 0.98 : null;
    const pullback = Number.isFinite(entry) && Number.isFinite(high20) && Number.isFinite(low20) ? entry <= (high20 + low20) / 2 : null;
    return {
      lot,
      entry,
      ret,
      high20,
      low20,
      sma20,
      chase,
      pullback,
      extensionPct: Number.isFinite(entry) && Number.isFinite(sma20) && sma20 ? ((entry - sma20) / sma20) * 100 : null,
      status: history.length >= 20 ? "ok" : "insufficient_data",
    };
  });
  const entryOk = entryContexts.filter((row) => row.status === "ok");
  const chaseRows = entryOk.filter((row) => row.chase === true);
  const pullbackRows = entryOk.filter((row) => row.pullback === true);

  const mfeRows = lots.map((lot) => {
    const rows = historyBetween(byBars.get(String(lot.ticker || "").toUpperCase()) || [], lot.openedAt, lot.closedAt);
    const maxClose = rows.map((row) => row.close).filter(Number.isFinite).reduce((max, value) => Math.max(max, value), -Infinity);
    const entry = numberOrNull(lot.entryPrice);
    const exit = numberOrNull(lot.exitPrice);
    const capture = Number.isFinite(maxClose) && Number.isFinite(entry) && Number.isFinite(exit) && maxClose !== entry
      ? (exit - entry) / (maxClose - entry)
      : null;
    return Number.isFinite(capture) ? Math.max(0, Math.min(1.5, capture)) : null;
  }).filter(Number.isFinite);
  const lossAbs = losses.map((lot) => Math.abs(numberOrNull(lot.realizedPnl) || 0)).sort((a, b) => b - a);
  const worstCount = Math.max(1, Math.ceil(lossAbs.length * 0.1));
  const worstDecileLossShare = lossAbs.length ? (lossAbs.slice(0, worstCount).reduce((sum, value) => sum + value, 0) / lossAbs.reduce((sum, value) => sum + value, 0)) * 100 : null;
  const loserHoldMedian = median(losses.map((lot) => numberOrNull(lot.holdingDays)).filter(Number.isFinite));
  const winnerHoldMedian = median(wins.map((lot) => numberOrNull(lot.holdingDays)).filter(Number.isFinite));

  const lossLots = losses.slice().sort((a, b) => String(a.closedAt).localeCompare(String(b.closedAt)));
  const revengeCount = lossLots.filter((lot) =>
    tradeRows.some((trade) =>
      trade.side === "buy" &&
      String(trade.ticker || "").toUpperCase() === String(lot.ticker || "").toUpperCase() &&
      daysBetween(lot.closedAt, trade.executedAt) !== null &&
      daysBetween(lot.closedAt, trade.executedAt) > 0 &&
      daysBetween(lot.closedAt, trade.executedAt) <= 5),
  ).length;

  const notionals = lots.map(notional).filter(Number.isFinite);
  const totalNotional = notionals.reduce((sum, value) => sum + value, 0);
  const notionalByTicker = new Map();
  for (const lot of lots) {
    const ticker = String(lot.ticker || "").toUpperCase();
    notionalByTicker.set(ticker, (notionalByTicker.get(ticker) || 0) + (notional(lot) || 0));
  }
  const notionalBySector = new Map();
  for (const [ticker, value] of notionalByTicker.entries()) {
    const sector = sectorForTicker(securityMaster, ticker);
    notionalBySector.set(sector, (notionalBySector.get(sector) || 0) + value);
  }
  const sectorHhi = totalNotional ? [...notionalBySector.values()].reduce((sum, value) => sum + (value / totalNotional) ** 2, 0) : null;
  const weekCount = new Set(tradeRows.map(tradeWeekKey).filter(Boolean)).size;
  const buyTrades = tradeRows.filter((trade) => trade.side === "buy");
  const spyReactiveBuys = buyTrades.filter((trade) => {
    const day = ymd(trade.executedAt);
    const index = spy.findIndex((row) => row.date === day);
    if (index <= 0) return false;
    const prev = spy[index - 1]?.close;
    const close = spy[index]?.close;
    const move = Number.isFinite(prev) && prev ? ((close - prev) / prev) * 100 : null;
    return Number.isFinite(move) && (move <= -1.5 || move >= 1.5);
  });

  const counterfactualRows = lots.map((lot) => {
    const rows = byBars.get(String(lot.ticker || "").toUpperCase()) || [];
    const exitFuture = barAfter(rows, lot.closedAt, 20);
    const spyExit = barAfter(spy, lot.closedAt, 20);
    const spyEntry = spy.find((row) => row.date >= ymd(lot.openedAt));
    const entry = numberOrNull(lot.entryPrice);
    const exit = numberOrNull(lot.exitPrice);
    const actual = lotReturnPct(lot);
    const hold20 = exitFuture && Number.isFinite(entry) && entry ? ((exitFuture.close - entry) / entry) * 100 : null;
    const spyReturn = spyEntry && spyExit && spyEntry.close ? ((spyExit.close - spyEntry.close) / spyEntry.close) * 100 : null;
    return { lot, actual, hold20, spyReturn, soldTooEarly: Number.isFinite(hold20) && Number.isFinite(actual) && hold20 > actual + 1, underperformedSpy: Number.isFinite(spyReturn) && Number.isFinite(actual) && actual < spyReturn };
  });
  const counterfactualOk = counterfactualRows.filter((row) => Number.isFinite(row.hold20) || Number.isFinite(row.spyReturn));

  const results = {
    roundTrips: metric("results.roundTrips", lots.length, lots.length),
    winRate: pctMetric("results.winRate", wins.length, lots.length, { minSamples: 20 }),
    profitFactor: metric("results.profitFactor", grossLoss ? grossProfit / grossLoss : null, lots.length, { minSamples: 20 }),
    expectancyPct: metric("results.expectancyPct", mean(returns), returns.length, { minSamples: 20, unit: "%" }),
    avgWinPct: metric("results.avgWinPct", mean(wins.map(lotReturnPct).filter(Number.isFinite)), wins.length, { minSamples: 8, unit: "%" }),
    avgLossPct: metric("results.avgLossPct", mean(losses.map(lotReturnPct).filter(Number.isFinite)), losses.length, { minSamples: 8, unit: "%" }),
    medianHoldingDays: metric("results.medianHoldingDays", median(holdingDays), holdingDays.length, { minSamples: 20, unit: "days" }),
    maxDrawdownUsd: metric("results.maxDrawdownUsd", drawdown.value, lots.length, { minSamples: 20, unit: "USD" }),
  };
  const entryBehavior = {
    chaseRate: pctMetric("entry.chaseRate", chaseRows.length, entryOk.length, { minSamples: 8 }),
    pullbackRate: pctMetric("entry.pullbackRate", pullbackRows.length, entryOk.length, { minSamples: 8 }),
    chaseAvgReturnPct: metric("entry.chaseAvgReturnPct", mean(chaseRows.map((row) => row.ret).filter(Number.isFinite)), chaseRows.length, { minSamples: 8, unit: "%" }),
    pullbackAvgReturnPct: metric("entry.pullbackAvgReturnPct", mean(pullbackRows.map((row) => row.ret).filter(Number.isFinite)), pullbackRows.length, { minSamples: 8, unit: "%" }),
    avgEntryExtensionVsSma20Pct: metric("entry.avgEntryExtensionVsSma20Pct", mean(entryOk.map((row) => row.extensionPct).filter(Number.isFinite)), entryOk.length, { minSamples: 8, unit: "%" }),
  };
  const exitBehavior = {
    dispositionRatio: metric("exit.dispositionRatio", Number.isFinite(loserHoldMedian) && Number.isFinite(winnerHoldMedian) && winnerHoldMedian ? loserHoldMedian / winnerHoldMedian : null, lots.length, { minSamples: 20 }),
    mfeCapturePct: metric("exit.mfeCapturePct", mean(mfeRows) === null ? null : mean(mfeRows) * 100, mfeRows.length, { minSamples: 8, unit: "%" }),
    worstDecileLossShare: metric("exit.worstDecileLossShare", worstDecileLossShare, losses.length, { minSamples: 8, unit: "%" }),
    revengeReentryRate: pctMetric("exit.revengeReentryRate", revengeCount, lossLots.length, { minSamples: 8 }),
  };
  const sizing = {
    notionalSizeCv: metric("sizing.notionalSizeCv", mean(notionals) ? std(notionals) / mean(notionals) : null, notionals.length, { minSamples: 20 }),
    sizeVsReturnCorrelation: metric("sizing.sizeVsReturnCorrelation", correlation(notionals, returns), Math.min(notionals.length, returns.length), { minSamples: 20 }),
    maxSingleNameSharePct: metric("sizing.maxSingleNameSharePct", totalNotional ? (Math.max(0, ...notionalByTicker.values()) / totalNotional) * 100 : null, notionalByTicker.size, { minSamples: 3, unit: "%" }),
  };
  const concentration = {
    sectorHhi: metric("concentration.sectorHhi", sectorHhi, notionalBySector.size, { minSamples: 3 }),
    tradesPerWeek: metric("concentration.tradesPerWeek", weekCount ? tradeRows.length / weekCount : null, tradeRows.length, { minSamples: 20 }),
    spyMoveBuySharePct: pctMetric("concentration.spyMoveBuySharePct", spyReactiveBuys.length, buyTrades.length, { minSamples: 8 }),
  };
  const counterfactuals = {
    soldTooEarlyRate: pctMetric("counterfactual.soldTooEarlyRate", counterfactualRows.filter((row) => row.soldTooEarly).length, counterfactualOk.length, { minSamples: 8 }),
    underperformedSpyWhileHeldRate: pctMetric("counterfactual.underperformedSpyWhileHeldRate", counterfactualRows.filter((row) => row.underperformedSpy).length, counterfactualOk.length, { minSamples: 8 }),
    avgHold20DeltaPct: metric("counterfactual.avgHold20DeltaPct", mean(counterfactualRows.map((row) => Number.isFinite(row.hold20) && Number.isFinite(row.actual) ? row.hold20 - row.actual : null).filter(Number.isFinite)), counterfactualOk.length, { minSamples: 8, unit: "%" }),
  };

  let styleTags = insufficientStyleTags(`round trips ${lots.length} < 20`);
  if (lots.length >= 20) {
    const medianHold = results.medianHoldingDays.value;
    const horizonTag = medianHold < 2 ? "day" : medianHold <= 10 ? "swing" : medianHold <= 60 ? "position" : "long";
    const chaseRate = entryBehavior.chaseRate.value;
    const entryTag = chaseRate > 40 ? "chaser" : chaseRate < 20 ? "pullback" : "mixed";
    const worstShare = exitBehavior.worstDecileLossShare.value;
    const mfe = exitBehavior.mfeCapturePct.value;
    const revenge = exitBehavior.revengeReentryRate.value;
    const disciplineTag = revenge > 15 ? "undisciplined" : worstShare < 35 && mfe > 60 ? "tight" : "loose";
    const diversificationTag = concentration.sectorHhi.value > 0.35 || sizing.maxSingleNameSharePct.value > 35 ? "concentrated" : "diversified";
    const turnoverTag = concentration.tradesPerWeek.value > 5 ? "high" : "normal";
    styleTags = [
      tag("horizon", horizonTag, "ok", [{ metricId: results.medianHoldingDays.id, value: medianHold, n: results.medianHoldingDays.n }]),
      tag("entryStyle", entryTag, entryBehavior.chaseRate.status, [{ metricId: entryBehavior.chaseRate.id, value: chaseRate, n: entryBehavior.chaseRate.n }]),
      tag("riskDiscipline", disciplineTag, exitBehavior.revengeReentryRate.status, [
        { metricId: exitBehavior.worstDecileLossShare.id, value: worstShare, n: exitBehavior.worstDecileLossShare.n },
        { metricId: exitBehavior.mfeCapturePct.id, value: mfe, n: exitBehavior.mfeCapturePct.n },
        { metricId: exitBehavior.revengeReentryRate.id, value: revenge, n: exitBehavior.revengeReentryRate.n },
      ]),
      tag("diversification", diversificationTag, concentration.sectorHhi.status, [{ metricId: concentration.sectorHhi.id, value: concentration.sectorHhi.value, n: concentration.sectorHhi.n }]),
      tag("turnover", turnoverTag, concentration.tradesPerWeek.status, [{ metricId: concentration.tradesPerWeek.id, value: concentration.tradesPerWeek.value, n: concentration.tradesPerWeek.n }]),
    ];
  }

  return {
    schemaVersion: "trader-profile-v1",
    generatedAt,
    styleSchema: "trader-style-v1",
    status: lots.length ? "ok" : "empty",
    sampleCounts: {
      trades: tradeRows.length,
      closedLots: lots.length,
      openLots: openLots.length,
      barTickers: byBars.size,
    },
    results,
    entryBehavior,
    exitBehavior,
    sizing,
    concentration,
    counterfactuals,
    styleTags,
    systemOverlap: systemOverlap || null,
    equityCurve: drawdown.curve,
    llmGovernance: {
      schemaVersion: "llm-governance-v1",
      llmWritesMetrics: false,
      llmWritesStyleTags: false,
      llmWritesScores: false,
      llmWritesGates: false,
      llmWritesWeights: false,
    },
  };
}
