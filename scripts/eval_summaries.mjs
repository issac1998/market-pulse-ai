#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { semanticNewsOwnership } from "../lib/market_core.mjs";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const strict = args.has("--strict");
const apiArg = rawArgs.find((arg) => arg === "--api" || arg.startsWith("--api="));
const apiUrl = apiArg
  ? apiArg.includes("=")
    ? apiArg.slice("--api=".length)
    : "http://localhost:5173/api/state"
  : "";
const storePathArg = rawArgs.find((arg) => arg.startsWith("--store="));
const storePath = storePathArg
  ? storePathArg.slice("--store=".length)
  : path.join(process.cwd(), "data", "store.json");
const minMatchRate = Number((rawArgs.find((arg) => arg.startsWith("--min-match=")) || "").split("=")[1] || 0.95);
const minInfoScore = Number((rawArgs.find((arg) => arg.startsWith("--min-info=")) || "").split("=")[1] || 45);
const maxSemanticMismatchArg = rawArgs.find((arg) => arg.startsWith("--max-semantic-mismatch="));
const maxSemanticOwnershipMismatch = Number(
  (maxSemanticMismatchArg || "").split("=")[1] ||
    process.env.EVAL_MAX_SEMANTIC_OWNERSHIP_MISMATCH ||
    2,
);

function norm(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isGenericTitle(value) {
  return /疑似财报\/指引新闻|当前未提取收入、EPS、毛利率或指引数字|核验是否影响收入、利润率或指引|标题未提供足够可投资事实/i.test(norm(value));
}

function isShellArticle(article = {}) {
  const title = norm(article.title);
  const finalUrl = norm(article.finalUrl || article.resolvedUrl || article.url);
  return /Yahoo\s*\|\s*Mail|Yahoo Finance - Stock Market Live|Google News|Sign in|Consent|Access Denied|Just a moment/i.test(title) ||
    /^https?:\/\/(?:www\.)?yahoo\.com\/?$/i.test(finalUrl) ||
    /^https?:\/\/finance\.yahoo\.com\/?$/i.test(finalUrl) ||
    /^https?:\/\/news\.google\.com\/rss\/articles/i.test(finalUrl);
}

function summaryText(item = {}) {
  if (item.article?.status === "source-limited") return "";
  const briefText = [
    item.brief?.fact,
    item.brief?.impact,
    item.brief?.verification,
  ].map(norm).filter(Boolean).join(" ");
  const longText = norm(item.summaryZh || item.article?.summaryZh || item.catalyst?.summaryZh || item.summary || "");
  if (!longText) return briefText;
  if (briefText && (item.summaryQuality?.downgraded || (summaryInfoScore(briefText) || 0) > (summaryInfoScore(longText) || 0))) {
    return briefText;
  }
  return longText;
}

function summaryMentionsDifferentTicker(item = {}) {
  const ticker = norm(item.ticker).toUpperCase();
  if (!ticker || ticker === "MARKET") return false;
  const summary = summaryText(item);
  const leading = (summary.match(/^([A-Z][A-Z0-9.-]{0,8})\b/) || [])[1];
  return Boolean(leading && leading !== ticker);
}

function itemCompanyName(item = {}, run = {}) {
  const ticker = norm(item.ticker).toUpperCase();
  const direct = norm(item.companyName || item.name || item.fundamental?.name);
  if (direct) return direct;
  const fundamental = (run.fundamentals || []).find((row) => norm(row.ticker).toUpperCase() === ticker);
  return norm(fundamental?.name || fundamental?.companyName || "");
}

function itemWithSummaryForOwnership(item = {}, run = {}) {
  return {
    ...item,
    summary: summaryText(item),
    companyName: itemCompanyName(item, run),
    article: {
      ...(item.article || {}),
      summary: norm(item.article?.summary || item.article?.summaryZh || ""),
      text: norm(item.article?.text || item.article?.content || item.article?.body || ""),
    },
  };
}

function semanticOwnershipResult(item = {}, run = {}) {
  const ticker = norm(item.ticker).toUpperCase();
  if (!ticker || ticker === "MARKET" || item.article?.status === "source-limited") return null;
  return semanticNewsOwnership(itemWithSummaryForOwnership(item, run), {
    ticker,
    companyName: itemCompanyName(item, run),
  });
}

function semanticOwnershipMismatch(item = {}, run = {}) {
  const result = semanticOwnershipResult(item, run);
  if (!result) return false;
  return Boolean(result.mismatch || item.ownershipMismatch || item.newsOwnership?.mismatch);
}

function summaryInfoScore(value = "") {
  const s = norm(value);
  if (!s) return null;
  let score = 0;
  if (/\d/.test(s)) score += 40;
  if (/(因此|意味着|影响|利好|利空|压制|推动|改善|恶化|收入|利润|毛利率|估值|订单|现金流|指引|资金流)/.test(s)) score += 30;
  if (/(若|如果|跌破|站上|低于|高于|确认|证伪|关注.*指引|观察.*成交|失效位|目标价|止损)/.test(s)) score += 20;
  if (/(需要核验|不构成投资建议|属于市场解读|原文没有披露|暂不能判断|暂不展开投资结论|标题未提供足够)/.test(s)) score -= 30;
  if (/(当前未提取|需进一步阅读原文|需要进一步确认|待补充|暂缺)/.test(s)) score -= 20;
  return Math.max(0, Math.min(100, score));
}

function latestRun(db) {
  const runs = Array.isArray(db.runs) ? db.runs : [];
  return runs
    .filter(Boolean)
    .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0))[0] || null;
}

async function loadRun() {
  if (apiUrl) {
    const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${apiUrl} returned ${res.status}`);
    const payload = await res.json();
    return { source: apiUrl, run: payload.latest || payload.run || null };
  }
  const raw = fs.readFileSync(storePath, "utf8");
  const db = JSON.parse(raw);
  return { source: storePath, run: latestRun(db) };
}

function pct(count, total) {
  return total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const { source, run } = await loadRun();
if (!run) {
  console.error(`No run found from ${source}`);
  process.exit(strict ? 1 : 0);
}

const news = Array.isArray(run.news) ? run.news : [];
const quotes = Array.isArray(run.quotes) ? run.quotes : [];
const infoScores = news
  .map((item) => summaryInfoScore(summaryText(item)))
  .filter((value) => Number.isFinite(value));
const shellArticles = news.filter((item) => isShellArticle(item.article || {})).length;
const activeShellArticles = news.filter((item) => item.article?.status !== "source-limited" && isShellArticle(item.article || {})).length;
const genericTitles = news.filter((item) => isGenericTitle(item.titleZh)).length;
const summaryTickerMismatch = news.filter(summaryMentionsDifferentTicker).length;
const semanticOwnershipResults = news.map((item) => semanticOwnershipResult(item, run)).filter(Boolean);
const semanticOwnershipMismatches = news.filter((item) => semanticOwnershipMismatch(item, run));
const sourceLimited = news.filter((item) => item.article?.status === "source-limited").length;
const zeroChangeQuotes = quotes.filter((quote) =>
  !quote.changePercentUnavailable &&
  Number.isFinite(Number(quote.price)) &&
  Number.isFinite(Number(quote.previousClose)) &&
  Math.abs(Number(quote.price) - Number(quote.previousClose)) < 1e-9 &&
  (Number(quote.changePercent) === 0 || quote.changePercent === "0")
).length;
const unavailableZeroQuotes = quotes.filter((quote) => quote.changePercentUnavailable).length;
const avgInfo = avg(infoScores);
const matchRate = news.length ? (news.length - summaryTickerMismatch) / news.length : 1;

const metrics = {
  source,
  runId: run.id || "",
  completedAt: run.completedAt || "",
  newsCount: news.length,
  quoteCount: quotes.length,
  shellArticles,
  activeShellArticles,
  genericTitles,
  sourceLimited,
  summaryTickerMismatch,
  semanticOwnershipChecked: semanticOwnershipResults.length,
  semanticOwnershipMismatch: semanticOwnershipMismatches.length,
  semanticOwnershipMismatchSamples: semanticOwnershipMismatches.slice(0, 5).map((item) => ({
    ticker: item.ticker,
    title: item.titleZh || item.title || "",
    ownership: semanticOwnershipResult(item, run),
  })),
  matchRate,
  infoScoreCount: infoScores.length,
  avgInfo,
  zeroChangeQuotes,
  unavailableZeroQuotes,
};

const lines = [
  `Source: ${metrics.source}`,
  `Run: ${metrics.runId || "(unknown)"} ${metrics.completedAt || ""}`,
  `News: ${metrics.newsCount}`,
  `Shell articles: ${metrics.shellArticles} (${pct(metrics.shellArticles, metrics.newsCount)})`,
  `Active shell articles: ${metrics.activeShellArticles} (${pct(metrics.activeShellArticles, metrics.newsCount)})`,
  `Generic title placeholders: ${metrics.genericTitles} (${pct(metrics.genericTitles, metrics.newsCount)})`,
  `Source-limited articles: ${metrics.sourceLimited} (${pct(metrics.sourceLimited, metrics.newsCount)})`,
  `Summary/ticker mismatches: ${metrics.summaryTickerMismatch} (${pct(metrics.summaryTickerMismatch, metrics.newsCount)})`,
  `Semantic ownership mismatches: ${metrics.semanticOwnershipMismatch} (${pct(metrics.semanticOwnershipMismatch, metrics.semanticOwnershipChecked)})`,
  `Semantic ownership mismatch limit: ${maxSemanticOwnershipMismatch}`,
  `Avg info score: ${metrics.avgInfo === null ? "-" : metrics.avgInfo.toFixed(1)} (${metrics.infoScoreCount} scored)`,
  `Zero-change quotes: ${metrics.zeroChangeQuotes} (${pct(metrics.zeroChangeQuotes, metrics.quoteCount)})`,
  `Unavailable zero-change quotes: ${metrics.unavailableZeroQuotes} (${pct(metrics.unavailableZeroQuotes, metrics.quoteCount)})`,
];
console.log(lines.join("\n"));

const failed = metrics.activeShellArticles > 0 ||
  metrics.genericTitles > 0 ||
  matchRate < minMatchRate ||
  metrics.semanticOwnershipMismatch > maxSemanticOwnershipMismatch ||
  metrics.zeroChangeQuotes > 0 ||
  (metrics.infoScoreCount >= 3 && metrics.avgInfo !== null && metrics.avgInfo < minInfoScore);

if (strict && failed) {
  process.exit(1);
}
