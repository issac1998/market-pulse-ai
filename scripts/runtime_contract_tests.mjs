import assert from "node:assert/strict";

import { sendJson } from "../server/http_responses.mjs";
import {
  RetryError,
  retryOperation,
  sleepMs,
  timeboxedTask,
  withExternalRetries,
} from "../server/runtime_utils.mjs";

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

test("success returns the operation result without retrying", async () => {
  const freshResult = { source: "operation", version: 1 };
  let calls = 0;
  const result = await retryOperation(
    "success",
    ({ attempt, maxAttempts, signal }) => {
      calls += 1;
      assert.equal(attempt, 1);
      assert.equal(maxAttempts, 3);
      assert.ok(signal instanceof AbortSignal);
      assert.equal(signal.aborted, false);
      return freshResult;
    },
    { attempts: 3, delayMs: 0 },
  );

  assert.equal(result, freshResult);
  assert.equal(calls, 1);
});

test("retry succeeds with distinct signals and exponential backoff", async () => {
  const signals = [];
  const retryDelays = [];
  let calls = 0;
  const result = await retryOperation(
    "eventual success",
    ({ signal }) => {
      calls += 1;
      signals.push(signal);
      if (calls < 3) throw new Error(`temporary failure ${calls}`);
      return "fresh-value";
    },
    {
      attempts: 3,
      baseDelayMs: 1,
      backoffFactor: 3,
      onRetry: ({ delayMs }) => retryDelays.push(delayMs),
    },
  );

  assert.equal(result, "fresh-value");
  assert.equal(calls, 3);
  assert.deepEqual(retryDelays, [1, 3]);
  assert.equal(new Set(signals).size, 3);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, true);
  assert.equal(signals[2].aborted, false);
});

test("withExternalRetries keeps its attempt argument and adds AbortSignal", async () => {
  const seen = [];
  const result = await withExternalRetries(
    "legacy callback",
    (attempt, signal) => {
      seen.push({ attempt, signal });
      if (attempt === 1) throw new Error("temporary timeout");
      return "ok";
    },
    { attempts: 2, delayMs: 0 },
  );

  assert.equal(result, "ok");
  assert.deepEqual(seen.map((item) => item.attempt), [1, 2]);
  assert.ok(seen.every((item) => item.signal instanceof AbortSignal));
});

test("three failures throw RetryError with every attempt error", async () => {
  const operationErrors = [];
  let caught = null;
  try {
    await retryOperation(
      "always fails",
      ({ attempt }) => {
        const error = new Error(`failure ${attempt}`);
        operationErrors.push(error);
        throw error;
      },
      { attempts: 99, delayMs: 0 },
    );
  } catch (error) {
    caught = error;
  }

  assert.ok(caught instanceof RetryError);
  assert.ok(caught instanceof AggregateError);
  assert.equal(caught.attempts, 3);
  assert.equal(caught.retriesUsed, 2);
  assert.deepEqual(caught.errors, operationErrors);
  assert.deepEqual(caught.attemptErrors.map((item) => item.attempt), [1, 2, 3]);
  assert.deepEqual(caught.attemptErrors.map((item) => item.error), operationErrors);
  assert.equal(caught.lastError, operationErrors[2]);
  assert.equal(caught.cause, operationErrors[2]);
});

test("timeboxedTask aborts the underlying operation without fallback", async () => {
  let completed = false;
  let sawAbort = false;
  let timeoutFailure = null;
  try {
    await timeboxedTask(
      "slow task",
      (signal) =>
        new Promise((resolve, reject) => {
          assert.ok(signal instanceof AbortSignal);
          const workTimer = setTimeout(() => {
            completed = true;
            resolve("late-stale-value");
          }, 60);
          signal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
              clearTimeout(workTimer);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
      10,
      () => "must-not-run",
    );
  } catch (error) {
    timeoutFailure = error;
  }

  assert.equal(sawAbort, true);
  assert.equal(timeoutFailure?.name, "TimeoutError");
  assert.equal(timeoutFailure?.code, "ERR_OPERATION_TIMEOUT");
  await sleepMs(70);
  assert.equal(completed, false, "aborted work must not complete or surface stale data later");

  assert.equal(await timeboxedTask("legacy callback", () => "legacy-ok", 20, () => "must-not-run"), "legacy-ok");
});

test("sendJson emits no JSON entity headers or body for 204", () => {
  const response = {
    destroyed: false,
    writableEnded: false,
    status: null,
    headers: null,
    endArguments: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers || {};
    },
    end(...args) {
      this.endArguments = args;
      this.writableEnded = true;
    },
  };
  const unencodable = {
    toJSON() {
      throw new Error("204 data must not be serialized");
    },
  };

  sendJson(response, unencodable, 204);

  const headerNames = Object.keys(response.headers).map((name) => name.toLowerCase());
  assert.equal(response.status, 204);
  assert.equal(headerNames.includes("content-length"), false);
  assert.equal(headerNames.includes("content-type"), false);
  assert.equal(headerNames.includes("content-encoding"), false);
  assert.deepEqual(response.endArguments, []);
});

for (const [index, entry] of tests.entries()) {
  await entry.run();
  console.log(`ok ${index + 1} - ${entry.name}`);
}
console.log(`runtime_contract_tests: ${tests.length} passed`);
