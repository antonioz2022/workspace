#!/usr/bin/env node
/*  Córtex — smoke test (sem dependências: só Node)
    Rode:  node smoke-test.mjs
    Sai com código !=0 se algo falhar (dá pra usar em CI / pre-deploy).

    O que cobre:
      1. Sintaxe de TODOS os blocos <script> (a maior fonte de "erro de console" no load).
      2. sanitizeStateForSync NÃO deixa vazar segredos (token, providers, mcpUrl, dock).
      3. Pendências: parseTodos → serTodos é LOSSLESS (inclui a pendencias.md real, multilinha).
      4. Fluxo "adicionar tarefa": serializa o novo item e o [x] concluído.
      5. Símbolos críticos presentes (hardening + features que já existem).

    Limite honesto: NÃO abre um navegador de verdade. Pra checar erro de console em runtime
    com DOM, use o preview ao vivo (ou plugue Playwright depois). Este script pega o essencial
    testável sem dependência: parse/serialize, sanitização e ausência de erro de parse. */

import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = fs.readFileSync(path.join(HERE, "index.html"), "utf8");

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log("  ✓ " + m); };
const bad = (m) => { fail++; console.log("  ✗ " + m); };
const eq  = (a, b, m) => (a === b ? ok(m) : bad(`${m} (esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)})`));

function extract(re, label) {
  const m = HTML.match(re);
  if (!m) throw new Error("não achei no index.html: " + label);
  return m[0];
}

// ---- 0) src/ em sincronia com o index.html (a fonte da verdade é src/) ----
if (fs.existsSync(path.join(HERE, "src"))) {
  console.log("0) build em sincronia (src/ → index.html)");
  const hasLocalSeed = fs.existsSync(path.join(HERE, "src", "js", "seed.local.js"));
  const r = spawnSync(process.execPath, [path.join(HERE, "build.mjs"), hasLocalSeed ? "--check" : "--check-deploy"], { encoding: "utf8" });
  if (r.status === 0) ok("index.html reconstrói byte a byte a partir de src/");
  else bad("DRIFT entre src/ e index.html; edite src/ e rode: node build.mjs --local\n" + (r.stderr || r.stdout || "").trim());
}

// ---- 1) sintaxe de todos os <script> ----
console.log("1) sintaxe dos scripts");
{
  const blocks = [...HTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
  let n = 0, errs = 0;
  for (const code of blocks) { n++; try { new vm.Script(code); } catch (e) { errs++; bad(`bloco #${n}: ${e.message}`); } }
  if (!errs) ok(`${n} bloco(s) sem erro de parse`);
}

// ---- 2) sanitizeStateForSync não vaza segredos ----
console.log("2) sanitização do estado (sync/backup)");
{
  const src = extract(/function sanitizeStateForSync\(\)\{[\s\S]*?\n\}/, "sanitizeStateForSync");
  const ctx = {
    JSON,
    DB: { companies: [{ id: "c", name: "X", projects: [] }],
          settings: { githubToken: "ghp_SECRET", mcpUrl: "https://mcp", dock: { messages: [1] },
                      providers: [{ id: "p", baseUrl: "https://api", apiKey: "sk-SECRET" }], stateRepo: "o/r" } },
    result: null,
  };
  vm.runInNewContext(src + "\nresult = sanitizeStateForSync();", ctx);
  const s = ctx.result.settings;
  eq(s.githubToken, undefined, "token fora do sync");
  eq(s.providers, undefined, "providers fora do sync (fecha exfiltração de baseUrl)");
  eq(s.mcpUrl, undefined, "mcpUrl fora do sync");
  eq(s.dock, undefined, "dock fora do sync");
  eq(s.stateRepo, "o/r", "config não-secreta preservada");
  eq(ctx.DB.settings.providers[0].apiKey, "sk-SECRET", "DB local intacto (só o clone é limpo)");
}

// ---- 3) pendências: round-trip lossless ----
console.log("3) pendências parse↔serialize lossless");
{
  const helpers  = extract(/function splitTodoMeta\(body\)\{[\s\S]*?\n\}/, "splitTodoMeta")
                 + "\n" + extract(/function todoMetaStr\(t\)\{.*\}/, "todoMetaStr");
  const serSrc   = extract(/const serTodos=p=>\{[\s\S]*?\n\};/, "serTodos");
  const parseSrc = extract(/function parseTodos\(text\)\{[\s\S]*?\n\}/, "parseTodos");
  const ctx = { console };
  vm.runInNewContext(helpers + "\n" + serSrc + "\n" + parseSrc + "\nthis.serTodos=serTodos; this.parseTodos=parseTodos;", ctx);
  const { serTodos, parseTodos } = ctx;

  const sample = `# Pendências — Demo\n\n## Seção A\n- [ ] item multi\n  linha de continuação\n  outra continuação\n- [x] feito\n\n## Seção B\n- [ ] outro\n`;
  const r1 = serTodos({ name: "Demo", todos: parseTodos(sample) });
  const r2 = serTodos({ name: "Demo", todos: parseTodos(r1) });
  eq(r1, r2, "round-trip idempotente (amostra)");
  ok(r1.includes("linha de continuação") && r1.includes("outra continuação") ? "continuações preservadas" : bad("continuações perdidas"));
  ok(r1.includes("## Seção A") && r1.includes("## Seção B") ? "seções preservadas" : bad("seções perdidas"));
  ok(r1.includes("- [x] feito") ? "concluído preservado" : bad("[x] perdido"));

  const real = path.join(HERE, "brain", "blockyfy", "dragon-block-galactic", "pendencias.md");
  if (fs.existsSync(real)) {
    const orig = fs.readFileSync(real, "utf8");
    const round = serTodos({ name: "Dragon Block Galactic", todos: parseTodos(orig) });
    eq(round, orig, "pendencias.md REAL byte-a-byte idêntica no round-trip");
  } else {
    console.log("  · (pendencias.md real ausente — pulei o teste do arquivo)");
  }
}

// ---- 4) fluxo adicionar tarefa ----
console.log("4) fluxo adicionar/concluir tarefa");
{
  const metaSrc = extract(/function todoMetaStr\(t\)\{.*\}/, "todoMetaStr");
  const serSrc = extract(/const serTodos=p=>\{[\s\S]*?\n\};/, "serTodos");
  const ctx = {}; vm.runInNewContext(metaSrc + "\n" + serSrc + "\nthis.serTodos=serTodos;", ctx);
  const todos = [];
  todos.push({ t: "comprar café", done: false });          // addTodo
  todos.push({ t: "pagar boleto", done: false, prio:"alta", owner:"antonio", due:"2026-07-10" });
  todos[0].done = true;                                      // toggleTodo
  const out = ctx.serTodos({ name: "P", todos });
  ok(out.includes("- [x] comprar café") ? "tarefa concluída vira [x]" : bad("[x] não saiu"));
  ok(out.includes("- [ ] pagar boleto !alta @antonio 📅2026-07-10") ? "metadata (prio/dono/prazo) serializada inline" : bad("metadata não saiu: "+out));
}

// ---- 5) símbolos críticos presentes ----
console.log("5) símbolos críticos presentes");
{
  const need = ["function saveView(", "let lastPushedDbStr", "async function downloadBrainFile",
    "async function createRepoIssue", "async function switchWorkspace", "function setMapFilter",
    'role="button"', "delete clone.settings.providers"];
  for (const s of need) (HTML.includes(s) ? ok : bad)(s);
}

console.log(`\n${fail ? "❌" : "✅"} smoke test: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
