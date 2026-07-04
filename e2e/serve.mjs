// Servidor dos testes e2e: builda o DEPLOY (seed vazio) e serve dist/index.html +
// os estáticos do PWA (sw.js, manifest, assets/) direto da raiz do projeto.
import { spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [path.join(ROOT, "build.mjs")], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);

const html = fs.readFileSync(path.join(ROOT, "dist", "index.html"));
const MIME = { ".js": "application/javascript", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".md": "text/markdown" };

http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(html);
  }
  const file = path.join(ROOT, p.replaceAll("..", ""));   // sem path traversal
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    return res.end(fs.readFileSync(file));
  }
  res.writeHead(404); res.end("not found");
}).listen(4599, () => console.log("e2e: servindo dist + estáticos em http://127.0.0.1:4599"));
