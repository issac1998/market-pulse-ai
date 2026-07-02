const TRANSIENT_UNCAUGHT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

function isTransientUncaughtNetworkError(error) {
  if (!error) return false;
  if (TRANSIENT_UNCAUGHT_NETWORK_CODES.has(error.code)) return true;
  return /Client network socket disconnected|socket hang up|TLS connection|certificate has expired/i.test(error.message || "");
}

export function installProcessErrorHandlers() {
  process.on("uncaughtException", (error) => {
    if (isTransientUncaughtNetworkError(error)) {
      console.warn(`[network uncaught] ${error.code || "NETWORK"}: ${error.message}`);
      return;
    }
    console.error("[uncaughtException]", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    if (isTransientUncaughtNetworkError(reason)) {
      console.warn(`[network rejection] ${reason.code || "NETWORK"}: ${reason.message}`);
      return;
    }
    console.error("[unhandledRejection]", reason);
  });
}
