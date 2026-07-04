#!/usr/bin/env node
/*  Córtex: build do app (src/ → index.html de arquivo único)

    O runtime continua sendo UM index.html (sem ES modules; os onclick inline dependem
    de escopo global clássico). Este build só CONCATENA os módulos de src/ na ordem
    dos nomes e injeta o SEED no placeholder. A fonte da verdade é src/; o index.html
    é artefato gerado (não edite à mão: o smoke test acusa drift).

    Modos:
      node build.mjs                 → build de DEPLOY (seed VAZIO por construção) em dist/index.html
      node build.mjs --local         → index.html na raiz com o seed LOCAL (dados do dono, se existir)
      node build.mjs --check         → reconstrói local e compara com index.html (drift check)
      node build.mjs --check-deploy  → reconstrói deploy e compara com index.html (uso no CI do repo público)

    Segurança: seed.local.js NUNCA vai pro repo público; o deploy usa seed.js (vazio)
    por construção, então o strip por brace-matching deixou de ser necessário. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "src");
const args = new Set(process.argv.slice(2));

function assemble({ localSeed }) {
  const head = fs.readFileSync(path.join(SRC, "00-head.html"), "utf8");
  const body = fs.readFileSync(path.join(SRC, "01-body.html"), "utf8");
  const tail = fs.readFileSync(path.join(SRC, "99-tail.html"), "utf8");
  const jsDir = path.join(SRC, "js");
  const mods = fs.readdirSync(jsDir).filter(f => /^\d.*\.js$/.test(f)).sort();
  let js = mods.map(f => fs.readFileSync(path.join(jsDir, f), "utf8")).join("");

  const localPath = path.join(jsDir, "seed.local.js");
  const seedFile = (localSeed && fs.existsSync(localPath)) ? localPath : path.join(jsDir, "seed.js");
  const seed = fs.readFileSync(seedFile, "utf8");
  if (!js.includes("/*__CORTEX_SEED__*/")) throw new Error("placeholder do SEED não encontrado em src/js");
  js = js.replace("/*__CORTEX_SEED__*/", seed);
  if (/\/\*__CORTEX_SEED__\*\//.test(js)) throw new Error("mais de um placeholder de SEED");
  return head + body + js + tail;
}

const outLocal = path.join(HERE, "index.html");
const outDeploy = path.join(HERE, "dist", "index.html");

if (args.has("--check") || args.has("--check-deploy")) {
  const html = assemble({ localSeed: args.has("--check") });
  const cur = fs.readFileSync(outLocal, "utf8");
  if (html === cur) { console.log("✅ em sincronia: src/ reconstrói o index.html byte a byte (" + html.length + " bytes)"); process.exit(0); }
  console.error("❌ DRIFT: o index.html não bate com o build de src/ (" + cur.length + " vs " + html.length + " bytes). Edite src/ e rode: node build.mjs --local");
  process.exit(1);
}

if (args.has("--local")) {
  fs.writeFileSync(outLocal, assemble({ localSeed: true }));
  console.log("✅ index.html (local, com seed" + (fs.existsSync(path.join(SRC, "js", "seed.local.js")) ? " REAL" : " vazio") + ") gerado");
} else {
  fs.mkdirSync(path.dirname(outDeploy), { recursive: true });
  const html = assemble({ localSeed: false });
  if (!html.includes("const SEED = { version: 5, companies: [] }")) throw new Error("deploy sem seed vazio?!");
  fs.writeFileSync(outDeploy, html);
  console.log("✅ dist/index.html (DEPLOY, seed vazio por construção) gerado: " + html.length + " bytes");
}
