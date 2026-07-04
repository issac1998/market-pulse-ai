import { severityAtLeast } from "../lib/alert_triage.mjs";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizePushConfig(env = process.env) {
  const provider = normalizeText(env.PUSH_PROVIDER).toLowerCase();
  const target = normalizeText(env.PUSH_TARGET);
  const minSeverity = normalizeText(env.PUSH_MIN_SEVERITY || "high").toLowerCase();
  const cooldownMs = Math.max(0, Number(env.PUSH_TICKER_COOLDOWN_MS || 15 * 60 * 1000));
  return {
    enabled: Boolean(provider && target),
    provider,
    target,
    minSeverity,
    cooldownMs,
    telegramBotToken: normalizeText(env.PUSH_TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN),
    timeoutMs: Math.max(1000, Number(env.PUSH_TIMEOUT_MS || 8000)),
  };
}

function pushMessage(alert = {}) {
  const ticker = normalizeText(alert.ticker || "MARKET");
  const title = normalizeText(alert.title || `${ticker} alert`);
  const detail = normalizeText(alert.detail || "");
  const link = normalizeText(alert.explainUrl || "");
  return {
    title,
    body: [detail, link].filter(Boolean).join("\n"),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text().catch((error) => `response_text_error:${error.message}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    return { status: "sent", statusCode: response.status, responseText: text.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function sendBark(alert, config) {
  const message = pushMessage(alert);
  const base = config.target.startsWith("http")
    ? config.target.replace(/\/+$/, "")
    : `https://api.day.app/${encodeURIComponent(config.target)}`;
  const url = `${base}/${encodeURIComponent(message.title)}/${encodeURIComponent(message.body)}`;
  return fetchWithTimeout(url, { method: "GET" }, config.timeoutMs);
}

async function sendTelegram(alert, config) {
  const token = config.telegramBotToken || config.target.split(":").slice(0, -1).join(":");
  const chatId = config.telegramBotToken ? config.target : config.target.split(":").at(-1);
  if (!token || !chatId) throw new Error("Telegram push requires PUSH_TELEGRAM_BOT_TOKEN plus PUSH_TARGET chat_id, or PUSH_TARGET token:chat_id.");
  const message = pushMessage(alert);
  return fetchWithTimeout(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${message.title}\n${message.body}`.slice(0, 3900),
        disable_web_page_preview: true,
      }),
    },
    config.timeoutMs,
  );
}

async function sendNtfy(alert, config) {
  const message = pushMessage(alert);
  const url = config.target.startsWith("http") ? config.target : `https://ntfy.sh/${encodeURIComponent(config.target)}`;
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Title: message.title,
        Priority: alert.severity === "critical" ? "urgent" : alert.severity === "high" ? "high" : "default",
      },
      body: message.body,
    },
    config.timeoutMs,
  );
}

export async function deliverPushNotification(alert = {}, config = normalizePushConfig(), deliveryState = {}) {
  if (!config.enabled) {
    return { status: "disabled", provider: config.provider || "", reason: "PUSH_PROVIDER/PUSH_TARGET not configured" };
  }
  if (!severityAtLeast(alert.severity, config.minSeverity)) {
    return { status: "skipped", provider: config.provider, reason: `severity_below_${config.minSeverity}` };
  }
  const ticker = normalizeText(alert.ticker || "MARKET").toUpperCase();
  const key = `${config.provider}:${ticker}`;
  deliveryState.lastDeliveredByTicker ||= {};
  const previous = deliveryState.lastDeliveredByTicker[key];
  const previousMs = new Date(previous || 0).getTime();
  if (Number.isFinite(previousMs) && Date.now() - previousMs < config.cooldownMs) {
    return { status: "skipped", provider: config.provider, reason: "ticker_cooldown", previousAt: previous };
  }

  let result;
  if (config.provider === "bark") result = await sendBark(alert, config);
  else if (config.provider === "telegram") result = await sendTelegram(alert, config);
  else if (config.provider === "ntfy") result = await sendNtfy(alert, config);
  else throw new Error(`Unsupported PUSH_PROVIDER: ${config.provider}`);

  deliveryState.lastDeliveredByTicker[key] = nowIso();
  return { ...result, provider: config.provider, deliveredAt: deliveryState.lastDeliveredByTicker[key] };
}
