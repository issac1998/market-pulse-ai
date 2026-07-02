import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { errorZh } from "./text_utils.mjs";

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function retryableExternalError(error) {
  const message = String(error?.message || error || "");
  if (!message) return false;
  if (/IneligibleTierError|UNSUPPORTED_CLIENT|no longer supported|API_KEY|api key|not configured|unauthorized|permission denied|billing|quota exceeded/i.test(message)) {
    return false;
  }
  return /timeout|timed out|fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ECONNRESET|429|Too Many Requests|5\d\d|temporar|rate limit|returned no text|did not return JSON/i.test(message);
}

export async function withExternalRetries(label, fn, options = {}) {
  const defaultAttempts = Math.max(1, Number(process.env.EXTERNAL_RETRY_ATTEMPTS || 4));
  const defaultDelayMs = Math.max(0, Number(process.env.EXTERNAL_RETRY_DELAY_MS || 800));
  const attempts = Math.max(1, Number(options.attempts || options.defaultAttempts || defaultAttempts));
  const delayMs = Math.max(0, Number(options.delayMs ?? options.defaultDelayMs ?? defaultDelayMs));
  const shouldRetry = options.shouldRetry || retryableExternalError;
  let lastError = null;
  let retriesUsed = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && shouldRetry(error, attempt);
      if (!canRetry) break;
      retriesUsed += 1;
      await sleepMs(delayMs * attempt);
    }
  }
  if (lastError && retriesUsed > 0) {
    const retryError = new Error(`${label} 失败，已重试 ${retriesUsed} 次：${errorZh(lastError.message || lastError)}`);
    retryError.cause = lastError;
    retryError.retriesUsed = retriesUsed;
    retryError.attempts = retriesUsed + 1;
    throw retryError;
  }
  throw lastError || new Error(`${label} 失败`);
}

export function longBridgeDefaultCommand() {
  const local = path.join(os.homedir(), ".local", "bin", "longbridge");
  return existsSync(local) ? local : "longbridge";
}

export function isCliCommandAvailable(command) {
  const cmd = String(command || "").trim();
  if (!cmd) return false;
  if (cmd.includes(path.sep)) return existsSync(cmd);
  const dirs = String(process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  return dirs.some((dir) => existsSync(path.join(dir, cmd)));
}

export function execFileText(command, args = [], timeoutMs = 5000) {
  return new Promise((resolve) => {
    const maxBuffer = Math.max(512 * 1024, Number(process.env.EXEC_FILE_MAX_BUFFER_BYTES || 4 * 1024 * 1024));
    execFile(command, args, { timeout: timeoutMs, maxBuffer }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? error.message || String(error) : "",
      });
    });
  });
}

export function parseCollectorTimeouts(value) {
  const rows = String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const timeouts = new Map();
  for (const row of rows) {
    const match = row.match(/^(.+?)(?:=|:)(\d+)$/);
    if (!match) continue;
    const source = match[1].trim();
    const timeoutMs = Number(match[2]);
    if (source && Number.isFinite(timeoutMs) && timeoutMs > 0) timeouts.set(source, timeoutMs);
  }
  return timeouts;
}

export async function timeboxedTask(label, taskFactory, timeoutMs, fallbackFactory) {
  const budget = Number(timeoutMs);
  if (!Number.isFinite(budget) || budget <= 0) return await Promise.resolve().then(taskFactory);
  const task = Promise.resolve().then(taskFactory);
  task.catch(() => {});
  return await Promise.race([
    task,
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(fallbackFactory(new Error(`${label} 超过 ${Math.round(budget / 1000)} 秒未完成，已按快照预算降级。`)));
      }, budget);
      timer.unref?.();
    }),
  ]);
}
