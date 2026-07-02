export function errorZh(value) {
  const text = String(value || "");
  if (!text) return "";
  if (/403\s+Blocked/i.test(text)) return "403 被数据源拦截或限流";
  if (/^\d{3}\s+Bad Request/i.test(text) && /<html|<!doctype html/i.test(text)) {
    return "请求失败，数据源返回错误页，可能被限流或临时拦截";
  }
  if (/<html|<!doctype html/i.test(text)) return "数据源返回错误页，可能被限流或临时拦截";
  return text
    .replaceAll("No CIK mapping found", "未找到 SEC CIK 映射")
    .replaceAll("Ticker map unavailable", "ticker 映射不可用")
    .replaceAll("FINNHUB_API_KEY not configured", "未配置 FINNHUB_API_KEY")
    .replaceAll("not configured", "未配置")
    .replaceAll("fetch failed", "网络请求失败")
    .replaceAll("timeout", "超时")
    .replaceAll("Timeout", "超时")
    .replaceAll("Failed", "失败")
    .replaceAll("failed", "失败")
    .replaceAll("error", "异常")
    .replaceAll("Error", "异常");
}
