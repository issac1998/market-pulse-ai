import net from "node:net";
import os from "node:os";
import tls from "node:tls";

import { appFetch } from "./network_fetch.mjs";

export function addressOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim();
}

function encodeHeader(value) {
  const text = String(value || "");
  return /^[\x00-\x7F]*$/.test(text)
    ? text
    : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function parseSmtpResponse(buffer) {
  let pos = 0;
  const lines = [];
  while (true) {
    const nl = buffer.indexOf("\n", pos);
    if (nl === -1) return null;
    const raw = buffer.slice(pos, nl + 1);
    const line = raw.replace(/\r?\n$/, "");
    lines.push(line);
    pos = nl + 1;
    if (/^\d{3} /.test(line)) {
      return {
        code: Number(line.slice(0, 3)),
        message: lines.join("\n"),
        rest: buffer.slice(pos),
      };
    }
  }
}

async function readSmtpResponse(socket, state, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`SMTP timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };
    const onData = (chunk) => {
      state.buffer += chunk.toString("utf8");
      const parsed = parseSmtpResponse(state.buffer);
      if (!parsed) return;
      state.buffer = parsed.rest;
      cleanup();
      resolve(parsed);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("SMTP connection closed"));
    };
    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    onData(Buffer.alloc(0));
  });
}

async function smtpCommand(socket, state, command, expected, timeoutMs) {
  if (command) socket.write(`${command}\r\n`);
  const response = await readSmtpResponse(socket, state, timeoutMs);
  if (!expected.includes(response.code)) {
    throw new Error(`SMTP ${command || "greeting"} failed: ${response.message}`);
  }
  return response;
}

async function connectSmtp(smtp) {
  const options = { host: smtp.host, port: smtp.port, servername: smtp.host };
  const socket = smtp.secure ? tls.connect(options) : net.createConnection(options);
  socket.setTimeout(smtp.timeoutMs);
  await new Promise((resolve, reject) => {
    const event = smtp.secure ? "secureConnect" : "connect";
    const timer = setTimeout(() => reject(new Error("SMTP connect timeout")), smtp.timeoutMs);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return socket;
}

async function upgradeSmtpTls(socket, smtp) {
  const tlsSocket = tls.connect({ socket, servername: smtp.host });
  tlsSocket.setTimeout(smtp.timeoutMs);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SMTP STARTTLS timeout")), smtp.timeoutMs);
    tlsSocket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve();
    });
    tlsSocket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return tlsSocket;
}

function buildMimeMessage({ from, fromName, to, subject, text, html, messageIdHost }) {
  const boundary = `market-pulse-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const host = (messageIdHost || "localhost").replace(/[^a-zA-Z0-9.-]/g, "") || "localhost";
  const fromHeader = `${encodeHeader(fromName)} <${from}>`;
  const normalizedText = String(text || "").replace(/\r?\n/g, "\r\n");
  const normalizedHtml = String(html || "").replace(/\r?\n/g, "\r\n");
  return [
    `From: ${fromHeader}`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedText,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    normalizedHtml,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendSmtpEmail({ to, subject, text, html, smtp }) {
  let socket = await connectSmtp(smtp);
  let state = { buffer: "" };
  try {
    await smtpCommand(socket, state, null, [220], smtp.timeoutMs);
    await smtpCommand(socket, state, `EHLO ${os.hostname() || "localhost"}`, [250], smtp.timeoutMs);
    if (!smtp.secure && smtp.starttls) {
      await smtpCommand(socket, state, "STARTTLS", [220], smtp.timeoutMs);
      socket = await upgradeSmtpTls(socket, smtp);
      state = { buffer: "" };
      await smtpCommand(socket, state, `EHLO ${os.hostname() || "localhost"}`, [250], smtp.timeoutMs);
    }
    const auth = Buffer.from(`\u0000${smtp.user}\u0000${smtp.pass}`, "utf8").toString("base64");
    await smtpCommand(socket, state, `AUTH PLAIN ${auth}`, [235], smtp.timeoutMs);
    const from = addressOnly(smtp.from || smtp.user);
    await smtpCommand(socket, state, `MAIL FROM:<${from}>`, [250], smtp.timeoutMs);
    for (const recipient of to) {
      await smtpCommand(socket, state, `RCPT TO:<${addressOnly(recipient)}>`, [250, 251], smtp.timeoutMs);
    }
    await smtpCommand(socket, state, "DATA", [354], smtp.timeoutMs);
    const message = buildMimeMessage({
      from,
      fromName: smtp.fromName,
      to,
      subject,
      text,
      html,
      messageIdHost: smtp.host,
    }).replace(/^\./gm, "..");
    socket.write(`${message}\r\n.\r\n`);
    await smtpCommand(socket, state, null, [250], smtp.timeoutMs);
    await smtpCommand(socket, state, "QUIT", [221], smtp.timeoutMs);
  } finally {
    socket.destroy();
  }
}

export async function probeSmtpEmail(smtp) {
  const socket = await connectSmtp(smtp);
  const state = { buffer: "" };
  try {
    await smtpCommand(socket, state, null, [220], smtp.timeoutMs);
    await smtpCommand(socket, state, "QUIT", [221, 250], smtp.timeoutMs);
  } finally {
    socket.destroy();
  }
}

export async function sendResendEmail({ to, subject, text, html, apiKey, from }) {
  const res = await appFetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        html,
      }),
    },
    30000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Resend ${res.status} ${res.statusText}`);
  }
  return data;
}
