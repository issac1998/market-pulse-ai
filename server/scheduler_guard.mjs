export function catchUpAttemptKey(due = {}) {
  return String(due.key || "").trim();
}

export function normalizeCatchUpAttempts(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const rows = source.catchUp && typeof source.catchUp === "object" ? source.catchUp : {};
  const catchUp = {};
  for (const [key, row] of Object.entries(rows)) {
    if (!key || !row || typeof row !== "object") continue;
    catchUp[key] = {
      key,
      count: Math.max(0, Number(row.count || 0)),
      firstAttemptAt: row.firstAttemptAt || "",
      lastAttemptAt: row.lastAttemptAt || "",
      blockedAt: row.blockedAt || "",
      newYorkDate: row.newYorkDate || String(key).split(":")[0] || "",
      session: row.session || String(key).split(":")[1] || "",
    };
  }
  return { catchUp };
}

export function registerCatchUpAttempt(scheduleAttempts = {}, due = {}, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 2));
  const now = options.now || new Date().toISOString();
  const key = catchUpAttemptKey(due);
  if (!key) {
    return {
      allowed: false,
      reason: "missing_schedule_key",
      attempts: normalizeCatchUpAttempts(scheduleAttempts),
      record: null,
    };
  }
  const attempts = normalizeCatchUpAttempts(scheduleAttempts);
  const previous = attempts.catchUp[key] || {
    key,
    count: 0,
    firstAttemptAt: "",
    lastAttemptAt: "",
    blockedAt: "",
    newYorkDate: due.newYorkDate || key.split(":")[0] || "",
    session: due.job?.id || key.split(":")[1] || "",
  };
  if (previous.count >= maxAttempts) {
    const record = {
      ...previous,
      blockedAt: previous.blockedAt || now,
      maxAttempts,
    };
    attempts.catchUp[key] = record;
    return {
      allowed: false,
      reason: "max_attempts_exceeded",
      attempts,
      record,
    };
  }
  const record = {
    ...previous,
    count: previous.count + 1,
    firstAttemptAt: previous.firstAttemptAt || now,
    lastAttemptAt: now,
    blockedAt: "",
    maxAttempts,
    newYorkDate: due.newYorkDate || previous.newYorkDate || key.split(":")[0] || "",
    session: due.job?.id || previous.session || key.split(":")[1] || "",
  };
  attempts.catchUp[key] = record;
  return {
    allowed: true,
    reason: "attempt_registered",
    attempts,
    record,
  };
}

export function scheduledCollectionRuntime(trigger = "", scheduleLlmStageTimeoutMs = null) {
  const scheduledRun = trigger === "schedule" || trigger === "catch-up";
  return {
    scheduledRun,
    scheduledLlmStageTimeoutMs: scheduledRun ? scheduleLlmStageTimeoutMs : null,
  };
}
