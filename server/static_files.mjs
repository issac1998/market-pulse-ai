import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";

const GZIP_MIN_BYTES = 64 * 1024;

export function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

export async function serveStatic(req, res, url, { publicDir }) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const stats = await stat(filePath);
    const gzip = stats.size > GZIP_MIN_BYTES && /\bgzip\b/i.test(String(req.headers["accept-encoding"] || ""));
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
      ...(gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : { "Content-Length": stats.size }),
    });
    const stream = createReadStream(filePath);
    if (gzip) {
      stream.pipe(createGzip()).pipe(res);
    } else {
      stream.pipe(res);
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}
