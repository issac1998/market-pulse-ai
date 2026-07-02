import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import zlib from "node:zlib";

import { withExternalRetries } from "./runtime_utils.mjs";

const DEFAULT_PROXY_BYPASS_SUFFIXES = [
  "sec.gov",
  "ibkr.com",
  "ibllc.com",
  "ibllc.com.cn",
  "interactivebrokers.com",
  "interactivebrokers.com.cn",
  "localhost",
  "local",
];
const MAX_PROXY_BODY_BYTES = Math.max(1024 * 1024, Number(process.env.MAX_PROXY_BODY_BYTES || 50 * 1024 * 1024));

function envFirst(...keys) {
  return keys.map((key) => process.env[key]).find((value) => String(value || "").trim()) || "";
}

function proxyNoProxyList() {
  return envFirst("NO_PROXY", "no_proxy")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function noProxyMatches(target) {
  const host = target.hostname.toLowerCase();
  const port = target.port || (target.protocol === "https:" ? "443" : "80");
  if (DEFAULT_PROXY_BYPASS_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  for (const raw of proxyNoProxyList()) {
    const item = raw.toLowerCase();
    if (item === "*") return true;
    const [pattern, patternPort] = item.includes(":") ? item.split(":") : [item, ""];
    if (patternPort && patternPort !== port) continue;
    if (pattern === host) return true;
    if (pattern.startsWith(".") && host.endsWith(pattern)) return true;
    if (!pattern.startsWith(".") && host.endsWith(`.${pattern}`)) return true;
  }
  return false;
}

function proxyUrlForTarget(target) {
  if (noProxyMatches(target)) return "";
  const raw =
    target.protocol === "https:"
      ? envFirst("HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy")
      : envFirst("HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy");
  if (!raw) return "";
  try {
    const proxy = new URL(raw);
    if (!["http:", "https:"].includes(proxy.protocol)) return "";
    return proxy.href;
  } catch {
    return "";
  }
}

export function redactProxyUrl(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      url.username = url.username ? "<user>" : "";
      url.password = url.password ? "<pass>" : "";
    }
    return url.href;
  } catch {
    return value ? "<invalid>" : "";
  }
}

export function proxySummary() {
  const httpsProxy = envFirst("HTTPS_PROXY", "https_proxy");
  const httpProxy = envFirst("HTTP_PROXY", "http_proxy");
  const allProxy = envFirst("ALL_PROXY", "all_proxy");
  return {
    httpProxy: httpProxy ? redactProxyUrl(httpProxy) : "",
    httpsProxy: httpsProxy ? redactProxyUrl(httpsProxy) : "",
    allProxy: allProxy ? redactProxyUrl(allProxy) : "",
    noProxy: proxyNoProxyList().join(","),
    active: Boolean(httpProxy || httpsProxy || allProxy),
  };
}

function normalizeFetchHeaders(headers = {}) {
  if (!headers) return {};
  if (typeof headers.entries === "function") return Object.fromEntries(headers.entries());
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function fetchBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body));
}

function waitForSocketConnect(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(reject, new Error(`Proxy connect timeout after ${timeoutMs}ms`)), timeoutMs);
    const cleanup = (done, value) => {
      clearTimeout(timer);
      socket.off(event, onConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      done(value);
    };
    const onConnect = () => cleanup(resolve);
    const onError = (error) => cleanup(reject, error);
    const onTimeout = () => cleanup(reject, new Error(`Proxy socket timeout after ${timeoutMs}ms`));
    socket.once(event, onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(timeoutMs);
  });
}

async function openProxySocket(proxy, timeoutMs) {
  const port = Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80));
  const socket =
    proxy.protocol === "https:"
      ? tls.connect({ host: proxy.hostname, port, servername: proxy.hostname })
      : net.createConnection({ host: proxy.hostname, port });
  await waitForSocketConnect(socket, proxy.protocol === "https:" ? "secureConnect" : "connect", timeoutMs);
  return socket;
}

function proxyAuthHeader(proxy) {
  if (!proxy.username && !proxy.password) return "";
  const user = decodeURIComponent(proxy.username || "");
  const pass = decodeURIComponent(proxy.password || "");
  return `Proxy-Authorization: Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}\r\n`;
}

function readHttpHeader(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => cleanup(reject, new Error(`HTTP header timeout after ${timeoutMs}ms`)), timeoutMs);
    const cleanup = (done, value) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      done(value);
    };
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const index = buffer.indexOf("\r\n\r\n");
      if (index === -1) return;
      cleanup(resolve, {
        header: buffer.slice(0, index + 4).toString("latin1"),
        rest: buffer.slice(index + 4),
      });
    };
    const onError = (error) => cleanup(reject, error);
    const onTimeout = () => cleanup(reject, new Error(`HTTP socket timeout after ${timeoutMs}ms`));
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(timeoutMs);
  });
}

function readSocketToEnd(socket, initial = Buffer.alloc(0), timeoutMs = 12000, maxBytes = MAX_PROXY_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = initial.length ? [initial] : [];
    let totalBytes = initial.length;
    if (totalBytes > maxBytes) {
      socket.destroy();
      reject(new Error(`HTTP body exceeded proxy limit ${maxBytes} bytes`));
      return;
    }
    const timer = setTimeout(() => cleanup(reject, new Error(`HTTP body timeout after ${timeoutMs}ms`)), timeoutMs);
    const cleanup = (done, value) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      socket.off("end", onEnd);
      socket.off("close", onEnd);
      done(value);
    };
    const onData = (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        cleanup(reject, new Error(`HTTP body exceeded proxy limit ${maxBytes} bytes`));
        socket.destroy();
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => cleanup(resolve, Buffer.concat(chunks));
    const onError = (error) => cleanup(reject, error);
    const onTimeout = () => cleanup(reject, new Error(`HTTP socket timeout after ${timeoutMs}ms`));
    socket.on("data", onData);
    socket.once("end", onEnd);
    socket.once("close", onEnd);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(timeoutMs);
  });
}

function parseStatusLine(header) {
  const [line = ""] = String(header || "").split(/\r?\n/);
  const match = line.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\s*(.*)$/i);
  return {
    status: match ? Number(match[1]) : 0,
    statusText: match ? match[2] || "" : "Invalid HTTP response",
  };
}

function parseResponseHeaders(header) {
  const lines = String(header || "").split(/\r?\n/).slice(1).filter(Boolean);
  const headers = new Map();
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers.set(key, headers.has(key) ? `${headers.get(key)}, ${value}` : value);
  }
  return headers;
}

function decodeChunkedBody(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", offset, "latin1");
    if (lineEnd === -1) return buffer;
    const sizeText = buffer.slice(offset, lineEnd).toString("latin1").split(";")[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size)) return buffer;
    offset = lineEnd + 2;
    if (size === 0) return Buffer.concat(chunks);
    if (offset + size > buffer.length) return buffer;
    chunks.push(buffer.slice(offset, offset + size));
    offset += size + 2;
  }
  return Buffer.concat(chunks);
}

export function proxyFetchResponse(header, body) {
  const status = parseStatusLine(header);
  const headers = parseResponseHeaders(header);
  const transferDecodedBody = /chunked/i.test(headers.get("transfer-encoding") || "") ? decodeChunkedBody(body) : body;
  const contentEncoding = String(headers.get("content-encoding") || "").toLowerCase();
  let decodedBody = transferDecodedBody;
  try {
    if (/\bgzip\b/.test(contentEncoding)) {
      decodedBody = zlib.gunzipSync(transferDecodedBody);
    } else if (/\bdeflate\b/.test(contentEncoding)) {
      decodedBody = zlib.inflateSync(transferDecodedBody);
    } else if (/\bbr\b/.test(contentEncoding) && typeof zlib.brotliDecompressSync === "function") {
      decodedBody = zlib.brotliDecompressSync(transferDecodedBody);
    }
  } catch (error) {
    throw new Error(`Proxy response decompression failed (${contentEncoding || "identity"}): ${error.message}`);
  }
  if (contentEncoding) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return {
    ok: status.status >= 200 && status.status < 300,
    status: status.status,
    statusText: status.statusText,
    headers: { get: (key) => headers.get(String(key || "").toLowerCase()) || null },
    text: async () => decodedBody.toString("utf8"),
    json: async () => JSON.parse(decodedBody.toString("utf8")),
  };
}

async function requestOverSocket(socket, target, options, timeoutMs, absoluteUrl = false) {
  const method = String(options.method || "GET").toUpperCase();
  const body = fetchBodyBuffer(options.body);
  const headers = normalizeFetchHeaders(options.headers);
  const hasHeader = (name) => Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
  if (!hasHeader("Host")) headers.Host = target.host;
  if (!hasHeader("Connection")) headers.Connection = "close";
  if (body && !hasHeader("Content-Length")) headers["Content-Length"] = String(body.length);
  const pathText = absoluteUrl ? target.href : `${target.pathname || "/"}${target.search || ""}`;
  const headerText = Object.entries(headers).map(([key, value]) => `${key}: ${value}\r\n`).join("");
  socket.write(`${method} ${pathText} HTTP/1.1\r\n${headerText}\r\n`);
  if (body) socket.write(body);
  const { header, rest } = await readHttpHeader(socket, timeoutMs);
  const bodyBuffer = await readSocketToEnd(socket, rest, timeoutMs);
  socket.destroy();
  return proxyFetchResponse(header, bodyBuffer);
}

async function fetchViaHttpProxy(target, proxy, options = {}, timeoutMs = 12000) {
  if (target.protocol === "http:") {
    const socket = await openProxySocket(proxy, timeoutMs);
    return requestOverSocket(socket, target, options, timeoutMs, true);
  }
  const proxySocket = await openProxySocket(proxy, timeoutMs);
  const connectHost = `${target.hostname}:${target.port || 443}`;
  proxySocket.write(
    `CONNECT ${connectHost} HTTP/1.1\r\nHost: ${connectHost}\r\n${proxyAuthHeader(proxy)}Proxy-Connection: Keep-Alive\r\n\r\n`,
  );
  const { header } = await readHttpHeader(proxySocket, timeoutMs);
  const { status, statusText } = parseStatusLine(header);
  if (status < 200 || status >= 300) {
    proxySocket.destroy();
    throw new Error(`Proxy CONNECT failed: ${status} ${statusText}`);
  }
  const tlsSocket = tls.connect({ socket: proxySocket, servername: target.hostname });
  await waitForSocketConnect(tlsSocket, "secureConnect", timeoutMs);
  return requestOverSocket(tlsSocket, target, options, timeoutMs, false);
}

export async function appFetch(url, options = {}, timeoutMs = 12000, redirectCount = 0) {
  const target = new URL(url);
  const proxyUrl = proxyUrlForTarget(target);
  let response;
  const startTime = options.startTime || Date.now();
  const elapsed = Date.now() - startTime;
  const remainingMs = Math.max(100, timeoutMs - elapsed);
  if (!proxyUrl) {
    const signal = options.signal || AbortSignal.timeout(remainingMs);
    response = await fetch(url, { ...options, signal });
  } else {
    const proxy = new URL(proxyUrl);
    try {
      response = await fetchViaHttpProxy(target, proxy, options, remainingMs);
    } catch (error) {
      throw new Error(`Proxy ${redactProxyUrl(proxyUrl)} request failed for ${target.hostname}: ${error.message}`);
    }
  }
  const redirectMode = options.redirect || "follow";
  const location = response.headers?.get?.("location");
  if (
    redirectMode !== "manual" &&
    location &&
    [301, 302, 303, 307, 308].includes(Number(response.status)) &&
    redirectCount < 5
  ) {
    const nextUrl = new URL(location, target.href).href;
    const nextOptions = { ...options, startTime };
    if (response.status === 303) {
      nextOptions.method = "GET";
      delete nextOptions.body;
    }
    return appFetch(nextUrl, nextOptions, timeoutMs, redirectCount + 1);
  }
  return response;
}

export async function fetchJson(url, options = {}, timeoutMs = 12000) {
  return withExternalRetries(`HTTP JSON ${new URL(url).hostname}`, async () => {
    const res = await appFetch(url, options, timeoutMs);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 180)}`);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`did not return JSON / SyntaxError: ${e.message}; ${text.slice(0, 120)}`);
    }
  });
}

export async function fetchText(url, options = {}, timeoutMs = 12000) {
  return withExternalRetries(`HTTP Text ${new URL(url).hostname}`, async () => {
    const res = await appFetch(url, options, timeoutMs);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 180)}`);
    }
    return text;
  });
}

export async function requestJson(url, options = {}, timeoutMs = 12000) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const headers = options.headers || {};
  return await new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: options.method || "GET",
        headers,
        rejectUnauthorized: options.rejectUnauthorized,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          text += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`${res.statusCode} ${res.statusMessage}: ${text.slice(0, 180)}`));
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : null);
          } catch (error) {
            reject(new Error(`Invalid JSON: ${error.message}; ${text.slice(0, 120)}`));
          }
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
