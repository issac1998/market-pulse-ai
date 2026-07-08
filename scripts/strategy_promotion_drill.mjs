#!/usr/bin/env node
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeRecommendationFactorWeights } from "../lib/recommender_core.mjs";
import {
  activeStrategyVersion,
  activeStrategyWeights,
  buildPromotionValidationRecord,
  normalizeStrategyVersions,
  upsertStrategyVersion,
} from "../server/strategy_versions.mjs";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const defaultStore = path.join(repoRoot, "data", "store.json");

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(port, pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

async function waitForServer(port, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      return await requestJson(port, "/api/strategy-versions");
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`drill server did not become ready on port ${port}`);
}

function buildDrillCandidate(store) {
  store.allStockAgent ||= {};
  const state = store.allStockAgent;
  const fallbackWeights = normalizeRecommendationFactorWeights();
  const active = activeStrategyVersion(state.strategyVersions || []) || {
    schemaVersion: "strategy-version-v2",
    id: "drill-active-default",
    strategyType: "all-stock-agent",
    status: "active",
    active: true,
    createdAt: new Date().toISOString(),
    activeFrom: new Date().toISOString(),
    weights: fallbackWeights,
    validationRecords: [],
  };
  const activeWeights = normalizeRecommendationFactorWeights(active.weights || fallbackWeights, fallbackWeights);
  const candidateWeights = normalizeRecommendationFactorWeights({
    ...activeWeights,
    momentum: Math.min(0.5, Number(activeWeights.momentum || 0) + 0.02),
    valuationExpectation: Math.max(0.001, Number(activeWeights.valuationExpectation || 0) - 0.01),
  }, activeWeights);
  const candidateId = `drill-candidate-${hashJson({ active: active.id, candidateWeights }).slice(0, 10)}`;
  let candidate = {
    schemaVersion: "strategy-version-v2",
    id: candidateId,
    strategyType: "all-stock-agent",
    status: "candidate",
    active: false,
    createdAt: new Date().toISOString(),
    activeFrom: "",
    activeTo: "",
    source: "drill",
    changeReason: "promotion-fire-drill-non-production",
    weights: candidateWeights,
    previousWeights: activeWeights,
    validationRecords: [],
    validationStatus: "pending_validation",
    llmWritable: false,
    json: {
      schemaVersion: "all-stock-agent-weight-overlay-v1",
      weights: candidateWeights,
      source: "drill",
    },
  };
  const validation = buildPromotionValidationRecord(candidate, active, {
    source: "drill",
    candidateExcessPct: 2,
    activeExcessPct: 1,
    candidateMaxDrawdownPct: -4,
    activeMaxDrawdownPct: -6,
    n: 30,
  });
  candidate = {
    ...candidate,
    validationRecords: [{ ...validation, source: "drill", nonProduction: true }],
    validationStatus: validation.status,
  };
  const rows = upsertStrategyVersion(upsertStrategyVersion(state.strategyVersions || [active], active), candidate);
  state.strategyVersions = normalizeStrategyVersions(rows);
  return { candidateId, activeId: active.id, activeWeights, candidateWeights };
}

async function main() {
  const args = new Map(process.argv.slice(2).map((item, index, list) => item.startsWith("--") ? [item, list[index + 1]] : [item, ""]));
  const storePath = path.resolve(args.get("--store") || defaultStore);
  const port = Number(args.get("--port") || process.env.DRILL_PORT || 0) || (5300 + Math.floor(Math.random() * 400));
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-pulse-drill-"));
  let child = null;
  try {
    const store = JSON.parse(await readFile(storePath, "utf8"));
    const setup = buildDrillCandidate(store);
    await writeFile(path.join(tempDir, "store.json"), JSON.stringify(store), "utf8");
    child = spawn(process.execPath, ["server.mjs"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATA_DIR: tempDir,
        PORT: String(port),
        HOST: "127.0.0.1",
        SQLITE_MIRROR_ENABLED: "false",
        SQLITE_MIRROR_AUTO_SYNC: "false",
        RUN_ARCHIVE_ENABLED: "false",
        INTRADAY_WATCHER_ENABLED: "false",
        AGENT_DEBATE_DAILY_ENABLED: "false",
        FACTOR_RESEARCHER_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const before = await waitForServer(port);
    const beforeHash = hashJson(activeStrategyWeights(before.strategyVersions || [], setup.activeWeights));
    const promoted = await requestJson(port, "/api/strategy-versions/promote", {
      method: "POST",
      body: JSON.stringify({ id: setup.candidateId }),
    });
    const promotedHash = hashJson(activeStrategyWeights(promoted.strategyVersions || [], setup.activeWeights));
    const rolledBack = await requestJson(port, "/api/strategy-versions/rollback", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const rollbackHash = hashJson(activeStrategyWeights(rolledBack.strategyVersions || [], setup.activeWeights));
    const payload = {
      schemaVersion: "strategy-promotion-drill-result-v1",
      status: promoted.active?.id === setup.candidateId && rollbackHash === beforeHash && promotedHash !== beforeHash ? "ok" : "failed",
      tempDataDir: tempDir,
      candidateId: setup.candidateId,
      activeBefore: before.active?.id || "",
      activeAfterPromote: promoted.active?.id || "",
      activeAfterRollback: rolledBack.active?.id || "",
      weightHashes: { before: beforeHash, promoted: promotedHash, rollback: rollbackHash },
      rollbackAvailableAfterPromote: Boolean(promoted.rollbackAvailable),
      stderrTail: stderr.split("\n").slice(-5),
      note: "Drill uses a temporary DATA_DIR and never writes production store.json.",
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exitCode = payload.status === "ok" ? 0 : 1;
  } finally {
    if (child) child.kill("SIGTERM");
    if (!process.env.KEEP_DRILL_DATA_DIR) await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
