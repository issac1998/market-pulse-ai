import { spawn } from "node:child_process";

function killProcessTree(child, signal = "SIGTERM") {
  if (!child || child.killed) return;
  try {
    if (child.pid) process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Ignore process teardown races.
    }
  }
}

function runCli(command, args, timeoutMs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const forceKill = () => {
      killProcessTree(child, "SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) killProcessTree(child, "SIGKILL");
      }, 500).unref?.();
    };
    const timer = setTimeout(() => {
      forceKill();
      rejectOnce(new Error(`CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      rejectOnce(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        rejectOnce(new Error(stderr.trim() || `CLI exited with ${code}`));
        return;
      }
      resolveOnce(stdout);
    });
  });
}

export async function runJsonCli(command, args, timeoutMs, options = {}) {
  const stdout = await runCli(command, args, timeoutMs, options);
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("CLI did not return JSON");
  }
}

export function runTextCli(command, args, timeoutMs, options = {}) {
  return runCli(command, args, timeoutMs, options);
}
