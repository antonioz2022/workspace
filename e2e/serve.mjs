// Servidor dos testes e2e: builda o DEPLOY (seed vazio) e serve o dist/index.html.
import { spawnSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = spawnSync(process.execPath, [path.join(ROOT, "build.mjs")], { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);

const html = fs.readFileSync(path.join(ROOT, "dist", "index.html"));
http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(4599, () => console.log("e2e: servindo dist/index.html em http://127.0.0.1:4599"));
