import { numberOrNull } from "./market_core.mjs";

export const FACTOR_SPEC_OPERATORS = Object.freeze([
  "ref",
  "delta",
  "ts_mean",
  "ts_std",
  "ts_sum",
  "ts_rank",
  "ts_max",
  "ts_min",
  "ts_corr",
  "cs_rank",
  "cs_zscore",
  "add",
  "sub",
  "mul",
  "div",
  "log",
  "abs",
  "sign",
  "clip",
  "overnight_return",
  "dollar_volume",
]);

const OPERATOR_SET = new Set(FACTOR_SPEC_OPERATORS);
const WINDOW_SET = new Set([5, 10, 21, 63, 126, 252]);
const WINDOWED_OPS = new Set(["delta", "ts_mean", "ts_std", "ts_sum", "ts_rank", "ts_max", "ts_min", "ts_corr"]);
const DATASET_SOURCES = new Set(["bars", "pit", "revisions", "shortInterest", "ivHistory", "consensus"]);

function text(value = "") {
  return String(value || "").trim();
}

function ymd(value = "") {
  const raw = text(value);
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  return raw.slice(0, 10);
}

function dateOf(row = {}) {
  return ymd(row.date || row.asOf || row.capturedAt || row.filed_at || row.filedAt || row.event_date || row.eventDate || row.period || "");
}

function finite(value) {
  const n = numberOrNull(value);
  return Number.isFinite(n) ? n : null;
}

function parseInput(input = "") {
  const value = text(input);
  const [source, ...fieldParts] = value.split(".");
  const field = fieldParts.join(".");
  if (!DATASET_SOURCES.has(source) || !field) {
    throw new Error(`Unknown input "${value}". Expected one of: ${[...DATASET_SOURCES].map((item) => `${item}.<field>`).join(", ")}`);
  }
  return { source, field };
}

function normalizeStep(step = {}, index = 0) {
  if (!step || typeof step !== "object") throw new Error(`Step ${index} must be an object.`);
  const op = text(step.op);
  if (!OPERATOR_SET.has(op)) {
    throw new Error(`Unknown op "${op}" at step ${index}. Valid ops: ${FACTOR_SPEC_OPERATORS.join(", ")}`);
  }
  const normalized = { ...step, op };
  if (WINDOWED_OPS.has(op)) {
    const window = Number(step.window);
    if (!WINDOW_SET.has(window)) {
      throw new Error(`Invalid window "${step.window}" at step ${index}. Valid windows: ${[...WINDOW_SET].join(", ")}`);
    }
    normalized.window = window;
  }
  if (op === "ref") parseInput(step.input || step.field);
  if ((op === "ts_corr" || op === "ref") && op === "ts_corr") {
    parseInput(step.input || step.left || step.field);
    parseInput(step.right);
  }
  return normalized;
}

export function parseFactorSpec(json = {}) {
  const spec = json && typeof json === "object" ? json : {};
  const pipeline = Array.isArray(spec.pipeline) ? spec.pipeline : [];
  if (!pipeline.length) throw new Error("Factor spec requires a non-empty pipeline.");
  if (pipeline.length > 8) throw new Error("Factor spec pipeline may contain at most 8 steps.");
  const steps = pipeline.map(normalizeStep);
  const windowedCount = steps.filter((step) => WINDOWED_OPS.has(step.op)).length;
  if (windowedCount > 3) throw new Error("Factor spec may contain at most 3 windowed operators.");
  return {
    schemaVersion: "factor-spec-v1",
    factorId: text(spec.factorId || spec.id || ""),
    family: text(spec.family || "custom"),
    hypothesis: text(spec.hypothesis || ""),
    expectedSign: spec.expectedSign === -1 || spec.expectedSign === "negative" ? -1 : 1,
    horizons: Array.isArray(spec.horizons) ? spec.horizons.map(Number).filter(Number.isFinite) : [20],
    pipeline: steps,
  };
}

function sourceRows(dataset = {}, source = "", asOf = "") {
  return (Array.isArray(dataset[source]) ? dataset[source] : [])
    .map((row) => ({ ...row, _date: dateOf(row) }))
    .filter((row) => row._date && (!asOf || row._date <= asOf))
    .sort((a, b) => text(a.ticker || a.symbol).localeCompare(text(b.ticker || b.symbol)) || a._date.localeCompare(b._date));
}

function refSeries(dataset = {}, input = "", asOf = "") {
  const { source, field } = parseInput(input);
  return sourceRows(dataset, source, asOf)
    .map((row) => ({ date: row._date, ticker: text(row.ticker || row.symbol), value: finite(row[field]) }))
    .filter((row) => Number.isFinite(row.value));
}

function alignMap(series = []) {
  const map = new Map();
  for (const row of series || []) {
    const ticker = text(row.ticker || "");
    map.set(`${ticker}|${row.date}`, row.value);
    if (!ticker) map.set(`|${row.date}`, row.value);
  }
  return map;
}

function alignedValue(map = new Map(), row = {}) {
  const ticker = text(row.ticker || "");
  if (map.has(`${ticker}|${row.date}`)) return map.get(`${ticker}|${row.date}`);
  return map.get(`|${row.date}`);
}

function groupByTicker(series = []) {
  const groups = new Map();
  for (const row of series || []) {
    const ticker = text(row.ticker || "__single__");
    if (!groups.has(ticker)) groups.set(ticker, []);
    groups.get(ticker).push(row);
  }
  for (const rows of groups.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
  return groups;
}

function groupByDate(series = []) {
  const groups = new Map();
  for (const row of series || []) {
    if (!groups.has(row.date)) groups.set(row.date, []);
    groups.get(row.date).push(row);
  }
  return groups;
}

function sortSeries(series = []) {
  return series
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date) || text(a.ticker).localeCompare(text(b.ticker)));
}

function rolling(series = [], window = 5, fn) {
  const out = [];
  for (const rows of groupByTicker(series).values()) {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const subset = rows.slice(Math.max(0, index - window + 1), index + 1).map((item) => item.value).filter(Number.isFinite);
      out.push({ ...row, value: subset.length === window ? fn(subset, row, index, rows) : null });
    }
  }
  return sortSeries(out);
}

function mean(values = []) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function std(values = []) {
  if (values.length < 2) return null;
  const m = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function rankLast(values = [], value = null) {
  const rows = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!rows.length || !Number.isFinite(value)) return null;
  const first = rows.findIndex((item) => item === value);
  const last = rows.length - 1 - rows.slice().reverse().findIndex((item) => item === value);
  if (first < 0 || last < 0) return null;
  return rows.length > 1 ? ((first + last) / 2) / (rows.length - 1) : 0.5;
}

function binarySeries(left = [], right = [], op) {
  const rightMap = alignMap(right);
  return left.map((row) => {
    const rv = alignedValue(rightMap, row);
    const lv = row.value;
    let value = null;
    if (Number.isFinite(lv) && Number.isFinite(rv)) {
      if (op === "add") value = lv + rv;
      if (op === "sub") value = lv - rv;
      if (op === "mul") value = lv * rv;
      if (op === "div") value = rv === 0 ? null : lv / rv;
    }
    return { ...row, value };
  }).filter((row) => Number.isFinite(row.value));
}

function corr(xs = [], ys = []) {
  const pairs = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map(([x]) => x));
  const my = mean(pairs.map(([, y]) => y));
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx;
    const dy = y - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 && dy2 ? numerator / Math.sqrt(dx2 * dy2) : null;
}

function applyStep(series = [], step = {}, dataset = {}, asOf = "") {
  const op = step.op;
  if (op === "ref") return refSeries(dataset, step.input || step.field, asOf);
  if (op === "dollar_volume") {
    const close = refSeries(dataset, "bars.close", asOf);
    const volume = refSeries(dataset, "bars.volume", asOf);
    return binarySeries(close, volume, "mul");
  }
  if (op === "overnight_return") {
    const bars = sourceRows(dataset, "bars", asOf);
    const out = [];
    for (const rows of groupByTicker(bars.map((row) => ({ ...row, date: row._date, ticker: text(row.ticker || row.symbol), value: finite(row.close) }))).values()) {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const original = bars.find((item) => item._date === row.date && text(item.ticker || item.symbol) === text(row.ticker));
        const previous = rows[index - 1];
        const open = finite(original?.open);
        const prevClose = finite(previous?.value);
        out.push({ date: row.date, ticker: row.ticker, value: Number.isFinite(open) && Number.isFinite(prevClose) && prevClose ? (open - prevClose) / prevClose : null });
      }
    }
    return sortSeries(out);
  }
  if (op === "delta") {
    const out = [];
    for (const rows of groupByTicker(series).values()) {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const previous = rows[index - step.window];
        out.push({ ...row, value: previous && Number.isFinite(previous.value) ? row.value - previous.value : null });
      }
    }
    return sortSeries(out);
  }
  if (op === "ts_mean") return rolling(series, step.window, (values) => mean(values));
  if (op === "ts_std") return rolling(series, step.window, (values) => std(values));
  if (op === "ts_sum") return rolling(series, step.window, (values) => values.reduce((sum, value) => sum + value, 0));
  if (op === "ts_max") return rolling(series, step.window, (values) => Math.max(...values));
  if (op === "ts_min") return rolling(series, step.window, (values) => Math.min(...values));
  if (op === "ts_rank") return rolling(series, step.window, (values, row) => rankLast(values, row.value));
  if (op === "ts_corr") {
    const left = refSeries(dataset, step.input || step.left || step.field, asOf);
    const right = refSeries(dataset, step.right, asOf);
    const rightMap = alignMap(right);
    const paired = left.map((row) => ({ ...row, right: alignedValue(rightMap, row) })).filter((row) => Number.isFinite(row.value) && Number.isFinite(row.right));
    const out = [];
    for (const rows of groupByTicker(paired).values()) {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const subset = rows.slice(Math.max(0, index - step.window + 1), index + 1);
        out.push({ date: row.date, ticker: row.ticker, value: subset.length === step.window ? corr(subset.map((item) => item.value), subset.map((item) => item.right)) : null });
      }
    }
    return sortSeries(out);
  }
  if (op === "cs_rank") {
    const out = [];
    for (const rows of groupByDate(series).values()) {
      const values = rows.map((row) => row.value);
      for (const row of rows) out.push({ ...row, value: rankLast(values, row.value) });
    }
    return sortSeries(out);
  }
  if (op === "cs_zscore") {
    const out = [];
    for (const rows of groupByDate(series).values()) {
      const values = rows.map((row) => row.value).filter(Number.isFinite);
      const m = mean(values);
      const sd = std(values);
      for (const row of rows) out.push({ ...row, value: Number.isFinite(sd) && sd > 0 ? (row.value - m) / sd : null });
    }
    return sortSeries(out);
  }
  if (["add", "sub", "mul", "div"].includes(op)) {
    const right = step.right || step.input ? refSeries(dataset, step.right || step.input, asOf) : series.map((row) => ({ ...row, value: finite(step.value) }));
    return binarySeries(series, right, op);
  }
  if (op === "log") return series.map((row) => ({ ...row, value: row.value > 0 ? Math.log(row.value) : null })).filter((row) => Number.isFinite(row.value));
  if (op === "abs") return series.map((row) => ({ ...row, value: Math.abs(row.value) })).filter((row) => Number.isFinite(row.value));
  if (op === "sign") return series.map((row) => ({ ...row, value: Math.sign(row.value) })).filter((row) => Number.isFinite(row.value));
  if (op === "clip") {
    const min = finite(step.min);
    const max = finite(step.max);
    return series.map((row) => ({ ...row, value: Math.max(Number.isFinite(min) ? min : -Infinity, Math.min(Number.isFinite(max) ? max : Infinity, row.value)) }));
  }
  return series;
}

export function evaluateFactorSpec(specInput = {}, dataset = {}, options = {}) {
  const spec = parseFactorSpec(specInput);
  const asOf = ymd(options.asOf || new Date().toISOString());
  let series = [];
  for (const step of spec.pipeline) {
    series = applyStep(series, step, dataset, asOf);
  }
  const latest = series.at(-1) || null;
  return {
    schemaVersion: "factor-spec-evaluation-v1",
    factorId: spec.factorId,
    asOf,
    status: series.length ? "ok" : "insufficient-data",
    n: series.length,
    latest,
    values: series,
    opSequence: spec.pipeline.map((step) => step.op),
  };
}

export function factorSpecOpSequence(specInput = {}) {
  const spec = parseFactorSpec(specInput);
  return spec.pipeline.map((step) => step.op);
}
