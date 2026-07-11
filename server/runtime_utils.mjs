import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { errorZh } from "./text_utils.mjs";

const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;

function abortReason(signal) {
  if (signal?.reason !== undefined) return signal.reason;
  const error = new Error("操作已取消。");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

function timeoutError(label, timeoutMs, attempt = 0) {
  const suffix = attempt > 0 ? `（第 ${attempt} 次尝试）` : "";
  const error = new Error(`${label}${suffix} 超过 ${Math.round(timeoutMs)}ms 未完成，已取消。`);
  error.name = "TimeoutError";
  error.code = "ERR_OPERATION_TIMEOUT";
  error.timeoutMs = timeoutMs;
  if (attempt > 0) error.attempt = attempt;
  return error;
}

function retryAttemptLimit(value, fallback = MAX_RETRY_ATTEMPTS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(MAX_RETRY_ATTEMPTS, Math.max(1, Math.floor(parsed)));
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function sleepMs(ms, signal) {
  const delayMs = Math.max(0, Number(ms) || 0);
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function retryableExternalError(error) {
  const message = String(error?.message || error || "");
  if (!message) return false;
  if (/IneligibleTierError|UNSUPPORTED_CLIENT|no longer supported|API_KEY|api key|not configured|unauthorized|permission denied|billing|quota exceeded/i.test(message)) {
    return false;
  }
  return /timeout|timed out|fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ECONNRESET|429|Too Many Requests|5\d\d|temporar|rate limit|returned no text|did not return JSON/i.test(message);
}

function runRetryAttempt(label, attempt, operation, options = {}) {
  const controller = new AbortController();
  const parentSignal = options.signal;
  const budget = nonNegativeNumber(options.timeoutMs, 0);
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let onParentAbort = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (parentSignal && onParentAbort) parentSignal.removeEventListener("abort", onParentAbort);
    };
    const rejectAttempt = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!controller.signal.aborted) controller.abort(error);
      reject(error);
    };
    const resolveAttempt = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    if (parentSignal) {
      onParentAbort = () => rejectAttempt(abortReason(parentSignal));
      if (parentSignal.aborted) {
        onParentAbort();
        return;
      }
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
    if (budget > 0) {
      timer = setTimeout(() => rejectAttempt(timeoutError(label, budget, attempt)), budget);
    }

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(resolveAttempt, rejectAttempt);
  });
}

export class RetryError extends AggregateError {
  constructor(label, attemptDetails) {
    const details = attemptDetails.map((item) => ({ ...item }));
    const errors = details.map((item) => item.error);
    const lastError = errors.at(-1);
    const attempts = details.length;
    const retriesUsed = Math.max(0, attempts - 1);
    const detail = errorZh(lastError?.message || lastError || "未知错误");
    super(errors, `${label} 失败，已尝试 ${attempts} 次（重试 ${retriesUsed} 次）：${detail}`, { cause: lastError });
    this.name = "RetryError";
    this.label = label;
    this.attempts = attempts;
    this.retriesUsed = retriesUsed;
    this.lastError = lastError;
    this.attemptErrors = details;
  }
}

export async function retryOperation(labelOrOperation, operationOrOptions, maybeOptions = {}) {
  const shorthand = typeof labelOrOperation === "function";
  const operation = shorthand ? labelOrOperation : operationOrOptions;
  const options = (shorthand ? operationOrOptions : maybeOptions) || {};
  const label = String(shorthand ? options.label || "操作" : labelOrOperation || "操作");
  if (typeof operation !== "function") throw new TypeError("retryOperation 需要 operation callback。");

  const maxAttempts = retryAttemptLimit(options.attempts ?? options.maxAttempts);
  const baseDelayMs = nonNegativeNumber(options.baseDelayMs ?? options.delayMs, DEFAULT_RETRY_DELAY_MS);
  const backoffFactor = Math.max(1, nonNegativeNumber(options.backoffFactor, 2));
  const maxDelayMs = nonNegativeNumber(options.maxDelayMs, Number.POSITIVE_INFINITY);
  const attemptTimeoutMs = nonNegativeNumber(options.attemptTimeoutMs ?? options.timeoutMs, 0);
  const shouldRetry = typeof options.shouldRetry === "function" ? options.shouldRetry : () => true;
  const attemptDetails = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      return await runRetryAttempt(
        label,
        attempt,
        (signal) => operation({ attempt, maxAttempts, signal }),
        { signal: options.signal, timeoutMs: attemptTimeoutMs },
      );
    } catch (error) {
      attemptDetails.push({ attempt, error, durationMs: Date.now() - startedAt });
      const parentAborted = Boolean(options.signal?.aborted);
      const canRetry =
        !parentAborted &&
        attempt < maxAttempts &&
        Boolean(await shouldRetry(error, attempt, { label, maxAttempts, signal: options.signal }));
      if (!canRetry) {
        const retryError = new RetryError(label, attemptDetails);
        if (parentAborted) {
          retryError.aborted = true;
          retryError.abortReason = abortReason(options.signal);
        }
        throw retryError;
      }

      const delayMs = Math.min(maxDelayMs, baseDelayMs * backoffFactor ** (attempt - 1));
      if (typeof options.onRetry === "function") {
        await options.onRetry({
          label,
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts,
          error,
          delayMs,
        });
      }
      try {
        if (delayMs > 0) await sleepMs(delayMs, options.signal);
      } catch (abortError) {
        const retryError = new RetryError(label, attemptDetails);
        retryError.aborted = true;
        retryError.abortReason = abortError;
        throw retryError;
      }
    }
  }
  throw new RetryError(label, attemptDetails);
}

export async function withExternalRetries(label, fn, options = {}) {
  const defaultAttempts = process.env.EXTERNAL_RETRY_ATTEMPTS || MAX_RETRY_ATTEMPTS;
  const defaultDelayMs = process.env.EXTERNAL_RETRY_DELAY_MS || 800;
  return retryOperation(
    label,
    ({ attempt, signal }) => fn(attempt, signal),
    {
      ...options,
      attempts: options.attempts ?? options.defaultAttempts ?? defaultAttempts,
      baseDelayMs: options.baseDelayMs ?? options.delayMs ?? options.defaultDelayMs ?? defaultDelayMs,
      backoffFactor: options.backoffFactor ?? process.env.EXTERNAL_RETRY_BACKOFF_FACTOR ?? 2,
      maxDelayMs: options.maxDelayMs ?? process.env.EXTERNAL_RETRY_MAX_DELAY_MS ?? Number.POSITIVE_INFINITY,
      shouldRetry: options.shouldRetry || retryableExternalError,
    },
  );
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

export async function timeboxedTask(label, taskFactory, timeoutMs, _fallbackFactory) {
  if (typeof taskFactory !== "function") throw new TypeError("timeboxedTask 需要 taskFactory callback。");
  const budget = Number(timeoutMs);
  const controller = new AbortController();
  if (!Number.isFinite(budget) || budget <= 0) {
    try {
      return await Promise.resolve().then(() => taskFactory(controller.signal));
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (done, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(value);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = timeoutError(label, budget);
      error.message = `${label} 超过 ${Math.round(budget / 1000)} 秒未完成，已取消底层操作；系统不会返回快照或占位结果降级。`;
      controller.abort(error);
      reject(error);
    }, budget);

    Promise.resolve()
      .then(() => taskFactory(controller.signal))
      .then(
        (value) => finish(resolve, value),
        (error) => {
          if (settled) return;
          if (!controller.signal.aborted) controller.abort(error);
          finish(reject, error);
        },
      );
  });
}
