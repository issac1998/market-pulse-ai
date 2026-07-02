import { readFileSync } from "node:fs";

export const DEFAULT_ENV_FILE_OVERRIDE_KEYS = new Set([
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
]);

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

export function splitList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadEnvFile(file, { overrideKeys = DEFAULT_ENV_FILE_OVERRIDE_KEYS } = {}) {
  try {
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined && !overrideKeys.has(key)) continue;
      let value = rawValue.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read .env: ${error.message}`);
    }
  }
}
