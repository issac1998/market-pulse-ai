const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).trim().replace(/[%,$]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function utcDateFromYmd(ymd) {
  const [year, month, day] = String(ymd || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function ymdFromDate(date) {
  return date.toISOString().slice(0, 10);
}

function weekdayUtc(date) {
  return date.getUTCDay();
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - weekdayUtc(first) + 7) % 7;
  return ymdFromDate(new Date(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7)));
}

function lastWeekdayOfMonth(year, month, weekday) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (weekdayUtc(last) - weekday + 7) % 7;
  return ymdFromDate(new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset)));
}

function observedFixedHoliday(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dow = weekdayUtc(date);
  if (dow === 0) return ymdFromDate(new Date(Date.UTC(year, month - 1, day + 1)));
  if (dow === 6) return ymdFromDate(new Date(Date.UTC(year, month - 1, day - 1)));
  return ymdFromDate(date);
}

function easterSundayYmd(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymdFromDate(new Date(Date.UTC(year, month - 1, day)));
}

function addUtcDays(ymd, days) {
  const date = utcDateFromYmd(ymd);
  if (!date) return "";
  return ymdFromDate(new Date(date.getTime() + days * MS_PER_DAY));
}

export function nyseHolidayName(ymd) {
  const date = utcDateFromYmd(ymd);
  if (!date) return "";
  const year = date.getUTCFullYear();
  const holidays = new Map([
    [observedFixedHoliday(year, 1, 1), "New Year's Day"],
    [nthWeekdayOfMonth(year, 1, 1, 3), "Martin Luther King Jr. Day"],
    [nthWeekdayOfMonth(year, 2, 1, 3), "Washington's Birthday"],
    [addUtcDays(easterSundayYmd(year), -2), "Good Friday"],
    [lastWeekdayOfMonth(year, 5, 1), "Memorial Day"],
    [observedFixedHoliday(year, 7, 4), "Independence Day"],
    [nthWeekdayOfMonth(year, 9, 1, 1), "Labor Day"],
    [nthWeekdayOfMonth(year, 11, 4, 4), "Thanksgiving Day"],
    [observedFixedHoliday(year, 12, 25), "Christmas Day"],
  ]);
  if (year >= 2022) holidays.set(observedFixedHoliday(year, 6, 19), "Juneteenth National Independence Day");
  return holidays.get(ymdFromDate(date)) || "";
}

export function nyseHalfDayName(ymd) {
  const date = utcDateFromYmd(ymd);
  if (!date) return "";
  const year = date.getUTCFullYear();
  const dow = weekdayUtc(date);
  if (dow === 0 || dow === 6) return "";
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  if (ymd === addUtcDays(thanksgiving, 1)) return "Day after Thanksgiving early close";
  if (ymd === observedFixedHoliday(year, 7, 4)) return "";
  if (ymd === `${year}-07-03` && weekdayUtc(utcDateFromYmd(`${year}-07-04`)) >= 1 && weekdayUtc(utcDateFromYmd(`${year}-07-04`)) <= 5) {
    return "Independence Day early close";
  }
  if (ymd === `${year}-12-24` && !nyseHolidayName(ymd)) return "Christmas Eve early close";
  return "";
}

export function isNyseTradingDay(ymd) {
  const date = utcDateFromYmd(ymd);
  if (!date) return false;
  const dow = weekdayUtc(date);
  if (dow === 0 || dow === 6) return false;
  return !nyseHolidayName(ymd);
}

export function nyseSessionForYmd(ymd) {
  const holiday = nyseHolidayName(ymd);
  if (holiday) return { ymd, isTradingDay: false, isHalfDay: false, label: "休市", reason: holiday };
  if (!isNyseTradingDay(ymd)) return { ymd, isTradingDay: false, isHalfDay: false, label: "非交易日", reason: "Weekend or invalid date" };
  const halfDay = nyseHalfDayName(ymd);
  return { ymd, isTradingDay: true, isHalfDay: Boolean(halfDay), label: halfDay ? "半日市" : "正常交易日", reason: halfDay };
}

export function addNyseTradingDays(value, days = 0) {
  const start = typeof value === "string" ? value.slice(0, 10) : ymdFromDate(new Date(value));
  if (!start || !Number.isFinite(Number(days))) return null;
  let date = utcDateFromYmd(start);
  if (!date) return null;
  const direction = days >= 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(days));
  while (remaining > 0) {
    date = new Date(date.getTime() + direction * MS_PER_DAY);
    if (isNyseTradingDay(ymdFromDate(date))) remaining -= 1;
  }
  return date;
}

function latestSeriesValue(series = []) {
  return (series || []).find((row) => Number.isFinite(numberOrNull(row.value))) || null;
}

export function scoreFredMacroRegime(seriesMap = {}) {
  const get = (id) => {
    const row = latestSeriesValue(seriesMap[id] || []);
    const value = numberOrNull(row?.value);
    return Number.isFinite(value) ? { id, value, date: row.date || "" } : null;
  };
  const dgs10 = get("DGS10");
  const dgs2 = get("DGS2");
  const curve = get("T10Y2Y") || (dgs10 && dgs2 ? { id: "DGS10-DGS2", value: dgs10.value - dgs2.value, date: dgs10.date || dgs2.date } : null);
  const credit = get("BAMLC0A0CM");
  const breakeven = get("T10YIE");
  const vix = get("VIXCLS");
  let score = 50;
  const drivers = [];
  const add = (points, text) => {
    score += points;
    if (text) drivers.push(text);
  };
  if (dgs10) {
    if (dgs10.value >= 5) add(12, `10Y 美债 ${dgs10.value.toFixed(2)}%，贴现率压力高。`);
    else if (dgs10.value >= 4.3) add(7, `10Y 美债 ${dgs10.value.toFixed(2)}%，成长股估值承压。`);
    else if (dgs10.value <= 3.5) add(-5, `10Y 美债 ${dgs10.value.toFixed(2)}%，利率压力相对缓和。`);
  }
  if (curve) {
    if (curve.value < -0.5) add(12, `10Y-2Y 利差 ${curve.value.toFixed(2)}%，收益率曲线深度倒挂。`);
    else if (curve.value < 0) add(7, `10Y-2Y 利差 ${curve.value.toFixed(2)}%，曲线仍倒挂。`);
    else if (curve.value > 0.75) add(-5, `10Y-2Y 利差 ${curve.value.toFixed(2)}%，曲线形态较正常。`);
  }
  if (credit) {
    if (credit.value >= 5.5) add(18, `高收益/公司债信用利差 ${credit.value.toFixed(2)}%，信用压力显著。`);
    else if (credit.value >= 4) add(10, `信用利差 ${credit.value.toFixed(2)}%，风险偏好偏弱。`);
    else if (credit.value <= 3) add(-6, `信用利差 ${credit.value.toFixed(2)}%，信用环境尚未恶化。`);
  }
  if (breakeven) {
    if (breakeven.value >= 2.6) add(6, `10Y 通胀预期 ${breakeven.value.toFixed(2)}%，通胀再定价风险上升。`);
    else if (breakeven.value <= 2.1) add(-3, `10Y 通胀预期 ${breakeven.value.toFixed(2)}%，通胀预期较温和。`);
  }
  if (vix) {
    if (vix.value >= 25) add(12, `VIX ${vix.value.toFixed(1)}，波动率处于高压区。`);
    else if (vix.value <= 15) add(-5, `VIX ${vix.value.toFixed(1)}，波动率压力较低。`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const regime = score >= 72 ? "宏观风险收缩" : score >= 58 ? "宏观谨慎" : score >= 42 ? "宏观中性" : "宏观顺风";
  const latestDate = [dgs10, dgs2, curve, credit, breakeven, vix].map((item) => item?.date).filter(Boolean).sort().at(-1) || "";
  return {
    schemaVersion: "fred-macro-regime-v1",
    provider: "FRED",
    generatedAt: new Date().toISOString(),
    latestDate,
    score,
    regime,
    tone: score >= 58 ? "riskOff" : score <= 42 ? "riskOn" : "neutral",
    drivers,
    observations: { dgs10, dgs2, curve, credit, breakeven, vix },
  };
}

function normText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function tickerTerms(ticker, companyName = "") {
  const symbol = String(ticker || "").toUpperCase().trim();
  const terms = new Set();
  if (symbol) {
    terms.add(symbol.toLowerCase());
    terms.add(`$${symbol}`.toLowerCase());
  }
  const cleaned = String(companyName || "")
    .replace(/\b(incorporated|inc|corp|corporation|company|co|ltd|plc|class a|ordinary shares|common stock)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 3) {
    terms.add(cleaned.toLowerCase());
    for (const part of cleaned.split(/\s+/).filter((item) => item.length >= 4)) terms.add(part.toLowerCase());
  }
  return [...terms];
}

export function semanticNewsOwnership(item = {}, context = {}) {
  const ticker = String(item.ticker || context.ticker || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  const companyName = item.companyName || context.companyName || context.fundamental?.name || "";
  const text = normText([
    item.title,
    item.titleZh,
    item.summary,
    item.summaryZh,
    item.article?.title,
    item.article?.summary,
    item.article?.summaryZh,
    item.article?.text,
    item.publisher,
    item.source,
  ].filter(Boolean).join(" "));
  const terms = tickerTerms(ticker, companyName);
  const hits = terms.filter((term) => {
    if (!term) return false;
    if (/^\$?[a-z0-9.-]{1,8}$/.test(term)) return new RegExp(`(^|[^a-z0-9])\\$?${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
    return text.includes(term);
  });
  const related = (item.relatedTickers || []).map((value) => String(value || "").toUpperCase()).filter(Boolean);
  const directSource = /sec|filing|company news|longbridge news|earnings|press release|investor relations/i.test(`${item.source || ""} ${item.publisher || ""}`);
  const marketLike = /\b(fed|fomc|inflation|cpi|ppi|pce|treasury|yield|nasdaq|s&p|dow|russell|vix|oil|dollar)\b|美联储|通胀|收益率|纳指|标普|大盘|市场/.test(text);
  let category = "ambiguous";
  let confidence = 45;
  const reasons = [];
  if (hits.length) {
    category = "direct_company";
    confidence = 78 + Math.min(14, hits.length * 4) + (directSource ? 5 : 0);
    reasons.push(`命中主体词：${hits.slice(0, 4).join("、")}。`);
  } else if (ticker && related.includes(ticker)) {
    category = "related_ticker_only";
    confidence = 58;
    reasons.push("仅 relatedTickers 命中，正文未命中公司名或 ticker。");
  } else if (marketLike) {
    category = "macro_market";
    confidence = 70;
    reasons.push("文本主要是宏观/大盘主题。");
  } else {
    reasons.push("没有找到足够的主体归属证据。");
  }
  const mismatch = Boolean(ticker && category !== "direct_company" && !related.includes(ticker) && !marketLike);
  return {
    schemaVersion: "semantic-news-ownership-v1",
    ticker,
    category,
    confidence: Math.min(95, confidence),
    mismatch,
    reasons,
  };
}

export function dedupeNewsItems(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    const key = normText(item.url || item.resolvedUrl || item.title || item.titleZh || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function calculateOptionFifoLots(trades = []) {
  const openLots = [];
  const closedLots = [];
  const unmatchedCloses = [];
  const sorted = [...(trades || [])].sort((a, b) => new Date(a.executedAt || a.date || 0) - new Date(b.executedAt || b.date || 0));
  for (const trade of sorted) {
    const quantity = Math.abs(numberOrNull(trade.quantity) || 0);
    const price = numberOrNull(trade.price);
    const multiplier = numberOrNull(trade.multiplier) || 100;
    const side = String(trade.side || trade.action || "").toLowerCase();
    const symbol = String(trade.optionSymbol || trade.contract || trade.ticker || "").toUpperCase();
    const underlyingTicker = String(trade.underlyingTicker || trade.underlying || trade.ticker || "").toUpperCase();
    if (!quantity || !Number.isFinite(price) || !symbol) continue;
    let remaining = quantity;
    const opensLong = /buy|bot|bto|买入/.test(side);
    const closesLong = /sell|sld|stc|卖出/.test(side);
    if (opensLong) {
      openLots.push({
        ...trade,
        optionSymbol: symbol,
        underlyingTicker,
        openQuantity: quantity,
        remainingQuantity: quantity,
        price,
        multiplier,
      });
      continue;
    }
    if (!closesLong) continue;
    while (remaining > 0) {
      const lotIndex = openLots.findIndex((lot) => lot.optionSymbol === symbol && lot.remainingQuantity > 1e-9);
      if (lotIndex < 0) break;
      const lot = openLots[lotIndex];
      const matched = Math.min(remaining, lot.remainingQuantity);
      const realizedPnl = (price - lot.price) * matched * multiplier;
      closedLots.push({
        optionSymbol: symbol,
        underlyingTicker: lot.underlyingTicker || underlyingTicker,
        quantity: matched,
        entryPrice: lot.price,
        exitPrice: price,
        multiplier,
        openedAt: lot.executedAt || lot.date || "",
        closedAt: trade.executedAt || trade.date || "",
        realizedPnl,
        entryTradeId: lot.id || "",
        exitTradeId: trade.id || "",
        strategy: lot.strategy || trade.strategy || "",
        thesis: lot.thesis || trade.thesis || "",
        emotion: lot.emotion || trade.emotion || "",
        tags: [...(Array.isArray(lot.tags) ? lot.tags : []), ...(Array.isArray(trade.tags) ? trade.tags : [])],
        notes: lot.notes || trade.notes || "",
        source: trade.source || lot.source || "",
      });
      lot.remainingQuantity -= matched;
      remaining -= matched;
      if (lot.remainingQuantity <= 1e-9) openLots.splice(lotIndex, 1);
    }
    if (remaining > 1e-9) {
      unmatchedCloses.push({
        ...trade,
        optionSymbol: symbol,
        underlyingTicker,
        unmatchedQuantity: remaining,
        reason: "没有匹配到同一合约的开仓 lot。",
      });
    }
  }
  return {
    schemaVersion: "option-fifo-v1",
    openLots: openLots.filter((lot) => lot.remainingQuantity > 1e-9),
    closedLots,
    unmatchedCloses,
    realizedPnl: closedLots.reduce((sum, lot) => sum + lot.realizedPnl, 0),
  };
}
