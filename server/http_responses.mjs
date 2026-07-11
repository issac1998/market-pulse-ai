import { gzipSync } from "node:zlib";

const GZIP_MIN_BYTES = 64 * 1024;

export function sanitizeJsonResponseText(value = "") {
  return String(value || "")
    .replace(
      /\b([A-Z]{1,6})?\s*重点是财报\/指引[；;，,\s]*财报和指引会直接影响未来盈利预期(?:与估值倍数)?[。.]?/g,
      (_, ticker = "") => `${ticker ? `${ticker} ` : ""}疑似财报/指引相关，但当前未提取收入、EPS、毛利率或指引数字，暂不能判断业绩影响。`,
    )
    .replace(/\b([A-Z]{1,6})重点是财报\/指引/g, "$1疑似财报/指引相关")
    .replace(/重点是财报\/指引/g, "疑似财报/指引相关")
    .replace(
      /财报和指引会直接影响未来盈利预期(?:与估值倍数)?/g,
      "当前未提取收入、EPS、毛利率或指引数字，暂不能判断业绩影响",
    )
    .replace(
      /财报、指引或利润率变化会直接影响未来盈利预期/g,
      "只有提取到财报、指引或利润率具体数字后，才能判断盈利预期影响",
    )
    .replace(
      /参考[^。]{0,160}：?市场综述线索集中在[^。]+。?/g,
      "市场编辑综述当前只读取到标题或 RSS 摘要，未读取到足够正文；不能据此判断大盘上涨、下跌或板块轮动原因。",
    )
    .replace(
      /市场综述线索集中在[^。]+。?/g,
      "市场编辑综述当前只读取到标题或 RSS 摘要，未读取到足够正文；不能据此判断大盘上涨、下跌或板块轮动原因。",
    );
}

export function jsonResponseReplacer(_key, value) {
  return typeof value === "string" ? sanitizeJsonResponseText(value) : value;
}

function requestAcceptsGzip(req) {
  return /\bgzip\b/i.test(String(req?.headers?.["accept-encoding"] || ""));
}

function maybeGzipBody(res, body, headers = {}) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  if (buffer.length <= GZIP_MIN_BYTES || !requestAcceptsGzip(res.req)) {
    return { body: buffer, headers };
  }
  return {
    body: gzipSync(buffer),
    headers: { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" },
  };
}

export function sendJson(res, data, status = 200) {
  if (res.destroyed || res.writableEnded) return;
  if (Number(status) === 204) {
    res.writeHead(status, { "Cache-Control": "no-store" });
    res.end();
    return;
  }
  const payload = JSON.stringify(data, jsonResponseReplacer);
  const encoded = maybeGzipBody(res, payload, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.writeHead(status, {
    ...encoded.headers,
    "Content-Length": encoded.body.length,
  });
  res.end(encoded.body);
}

export function sendDownload(res, body, filename, type) {
  if (res.destroyed || res.writableEnded) return;
  const safeName = String(filename || "market-pulse-export.txt").replace(/[^A-Za-z0-9._-]/g, "_");
  const encoded = maybeGzipBody(res, body, {
    "Content-Type": type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "Cache-Control": "no-store",
  });
  res.writeHead(200, {
    ...encoded.headers,
    "Content-Length": encoded.body.length,
  });
  res.end(encoded.body);
}
