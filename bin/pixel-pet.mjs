#!/usr/bin/env node
// `npx pixel-pet` — serve the built web preview of the pet locally so anyone can
// try it in a browser without installing the Rust/Tauri desktop toolchain.
//
// The browser preview uses the same code as the desktop app; native features
// (tray, always-on-top, file inbox, external packs) are unavailable and fall
// back gracefully, and state persists in localStorage.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? "127.0.0.1";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!existsSync(join(DIST, "index.html"))) {
  console.error("pixel-pet: no build found. Run `npm run build` first, then retry.");
  process.exit(1);
}

const server = createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  // Resolve inside DIST only; anything outside falls back to index.html.
  const resolved = normalize(join(DIST, requestPath));
  let filePath = resolved.startsWith(DIST) ? resolved : join(DIST, "index.html");
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
  if (!existsSync(filePath)) filePath = join(DIST, "index.html");

  res.writeHead(200, { "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  console.log(`pixel-pet web preview: http://${HOST}:${PORT}/`);
  console.log("Press Ctrl+C to stop.");
});
