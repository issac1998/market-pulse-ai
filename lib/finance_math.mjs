export function normalPdf(value) {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

export function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x));
  return 0.5 * (1 + sign * erf);
}

export function normalizeOptionIv(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number > 3 ? number / 100 : number;
}

export function blackScholesGamma({ spot, strike, iv, dte, rate = 0 }) {
  if (!Number.isFinite(spot) || !Number.isFinite(strike) || !Number.isFinite(iv)) return null;
  if (spot <= 0 || strike <= 0 || iv <= 0) return null;
  const t = Math.max(Number(dte) || 0, 1) / 365;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * iv * iv) * t) / (iv * sqrtT);
  return normalPdf(d1) / (spot * iv * sqrtT);
}

export function blackScholesPrice({ spot, strike, iv, dte, optionType, rate = 0 }) {
  if (!Number.isFinite(spot) || !Number.isFinite(strike) || !Number.isFinite(iv)) return null;
  if (spot <= 0 || strike <= 0 || iv <= 0) return null;
  const t = Math.max(Number(dte) || 0, 1) / 365;
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (rate + 0.5 * iv * iv) * t) / (iv * sqrtT);
  const d2 = d1 - iv * sqrtT;
  const discount = Math.exp(-rate * t);
  if (optionType === "put") {
    return strike * discount * normalCdf(-d2) - spot * normalCdf(-d1);
  }
  return spot * normalCdf(d1) - strike * discount * normalCdf(d2);
}

export function inferOptionIvFromPrice({ spot, strike, dte, optionType, price, rate = 0 }) {
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(spot) || !Number.isFinite(strike) || spot <= 0 || strike <= 0) return null;
  const t = Math.max(Number(dte) || 0, 1) / 365;
  const discountedStrike = strike * Math.exp(-rate * t);
  const intrinsic = optionType === "put" ? Math.max(discountedStrike - spot, 0) : Math.max(spot - discountedStrike, 0);
  if (price <= intrinsic + 0.005) return null;
  let low = 0.01;
  let high = 5;
  for (let i = 0; i < 64; i += 1) {
    const mid = (low + high) / 2;
    const modeled = blackScholesPrice({ spot, strike, iv: mid, dte, optionType, rate });
    if (!Number.isFinite(modeled)) return null;
    if (modeled > price) high = mid;
    else low = mid;
  }
  return (low + high) / 2;
}

export function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

export function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

export function ema(values, period) {
  const out = [];
  const k = 2 / (period + 1);
  let prev = null;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      out.push(prev);
      continue;
    }
    prev = prev === null ? value : value * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function calculateRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function calculateAtr(candles, period = 14) {
  if (candles.length <= period) return null;
  const ranges = [];
  for (let i = 1; i < candles.length; i += 1) {
    const candle = candles[i];
    const prevClose = candles[i - 1].close;
    ranges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose),
      ),
    );
  }
  return average(ranges.slice(-period));
}

export function calculateTechnicalSnapshot(candles) {
  const valid = candles.filter((c) => Number.isFinite(c.close) && c.close > 0);
  if (valid.length < 5) return null;
  const closes = valid.map((c) => c.close);
  const volumes = valid.map((c) => c.volume || 0);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdSeries = closes.map((_, index) =>
    ema12[index] !== null && ema26[index] !== null ? ema12[index] - ema26[index] : null,
  );
  const signalSeries = ema(macdSeries.filter((value) => value !== null), 9);
  const macd = macdSeries.at(-1);
  const signal = signalSeries.at(-1);
  const latest = valid.at(-1);
  const previous = valid.at(-2);
  const sma10 = valid.length >= 10 ? average(closes.slice(-10)) : null;
  const sma20 = valid.length >= 20 ? average(closes.slice(-20)) : null;
  const sma50 = valid.length >= 50 ? average(closes.slice(-50)) : null;
  const rollingAverage = (index, period) =>
    index + 1 >= period ? average(closes.slice(index + 1 - period, index + 1)) : null;
  return {
    latestClose: latest.close,
    latestDate: latest.date,
    changePercent: previous ? ((latest.close - previous.close) / previous.close) * 100 : null,
    sma10,
    sma20,
    sma50,
    rsi14: calculateRsi(closes),
    macd,
    macdSignal: signal,
    macdHistogram: macd !== null && signal !== null ? macd - signal : null,
    atr14: calculateAtr(valid),
    volumeAvg20: average(volumes.slice(-20)),
    trend:
      sma20 && sma50 && latest.close > sma20 && sma20 > sma50
        ? "uptrend"
        : sma20 && sma50 && latest.close < sma20 && sma20 < sma50
          ? "downtrend"
          : "mixed",
    chart: valid.slice(-90).map((c, chartIndex, chartRows) => {
      const index = valid.length - chartRows.length + chartIndex;
      return {
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        sma10: rollingAverage(index, 10),
        sma20: rollingAverage(index, 20),
      };
    }),
  };
}
