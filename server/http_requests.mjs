export function maxRequestBodyBytes() {
  const configured = Number(process.env.MAX_REQUEST_BODY_BYTES || 2 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? configured : 2 * 1024 * 1024;
}

export function requestContentLengthExceedsLimit(req, limit = maxRequestBodyBytes()) {
  const value = Number(req?.headers?.["content-length"]);
  return Number.isFinite(value) && value > limit;
}

function bodyReadError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function readBody(req, options = {}) {
  const limit = Number(options.maxBytes || maxRequestBodyBytes());
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (Number.isFinite(limit) && limit > 0 && total > limit) {
      throw bodyReadError(`请求体超过上限 ${limit} 字节。`, 413, "REQUEST_BODY_TOO_LARGE");
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw bodyReadError(`JSON 解析失败：${error.message}`, 400, "INVALID_JSON_BODY");
  }
}
