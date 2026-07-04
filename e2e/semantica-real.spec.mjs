// Verificação REAL do achado 8: o embedder roda num Web Worker (blob, module) e a
// página principal — que guarda o PAT — nunca toca o CDN nem o modelo.
// Este spec USA A REDE de verdade (jsdelivr + huggingface, modelo multilíngue) e por
// isso NÃO roda no CI: só com REAL_EMB=1 (os projects firefox/webkit entram no config).
//   REAL_EMB=1 npx playwright test e2e/semantica-real.spec.mjs
import { test, expect } from "@playwright/test";

test.skip(!process.env.REAL_EMB, "modelo real (rede pesada) — rode com REAL_EMB=1");

test("embeddings reais saem do Web Worker isolado e têm qualidade semântica", async ({ page, browserName }) => {
  test.setTimeout(420_000);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.goto("/");

  const r = await page.evaluate(async () => {
    const texts = [
      "fazer reserva de hotel na praia",
      "mod de minecraft com dragões",
      "reservar pousada beira-mar",
    ];
    const t0 = performance.now();
    const [hotel, mine, pousada] = await embed(texts);
    const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
    // tamanho real baixado (cache do modelo fica no Cache Storage da origem, escrito pelo worker)
    let modelBytes = 0;
    try {
      for (const name of await caches.keys()) {
        const c = await caches.open(name);
        for (const req of await c.keys()) {
          if (!/huggingface|jsdelivr/i.test(req.url)) continue;
          const res = await c.match(req);
          if (res) modelBytes += (await res.blob()).size;
        }
      }
    } catch (e) { modelBytes = -1; }
    return {
      ms: Math.round(performance.now() - t0),
      dims: hotel.length,
      norm: Math.hypot(...hotel),
      simRel: dot(hotel, pousada),   // hotel ↔ pousada: próximos
      simIrrel: dot(hotel, mine),    // hotel ↔ minecraft: distantes
      workerOk: !!window.__semWorkerOk,
      cdnNaPagina: performance
        .getEntriesByType("resource")
        .some((e) => /jsdelivr|transformers|huggingface/i.test(e.name)),
      modelMB: modelBytes >= 0 ? Math.round(modelBytes / 1048576) : null,
    };
  });

  console.log(`[${browserName}] embed 3 textos em ${r.ms}ms · ${r.dims}d · norm=${r.norm.toFixed(3)} · rel=${r.simRel.toFixed(3)} vs irrel=${r.simIrrel.toFixed(3)} · modelo em cache=${r.modelMB}MB`);
  expect(r.workerOk, "os vetores vieram do Web Worker").toBe(true);
  expect(r.cdnNaPagina, "a PÁGINA não carregou CDN/modelo (isolamento: tudo no worker)").toBe(false);
  expect(r.dims, "dimensão do multilingual-MiniLM-L12").toBe(384);
  expect(Math.abs(r.norm - 1), "vetor normalizado").toBeLessThan(0.01);
  expect(r.simRel, "semântica: reserva-hotel ≈ pousada ≫ minecraft").toBeGreaterThan(r.simIrrel + 0.15);
  expect(pageErrors, "zero erro de página").toEqual([]);
});

test("reindexar de verdade: buildSemIndex + semSearch acham o projeto certo", async ({ page, browserName }) => {
  test.setTimeout(420_000);
  await page.goto("/");
  const r = await page.evaluate(async () => {
    // workspace mínima real (sem token/rede do GitHub: só corpus da brain local)
    DB.companies = [
      { id: "coH", name: "Hotelaria Beira-Mar", emoji: "🏨", projects: [{ id: "pjH", name: "Central de Reservas", apps: [], todos: [], context: "Onde parei: bot de WhatsApp responde hóspedes e fecha reservas de quartos com café da manhã na pousada." }] },
      { id: "coG", name: "Estúdio de Games", emoji: "🎮", projects: [{ id: "pjG", name: "Mod Espacial", apps: [], todos: [], context: "Onde parei: mod de minecraft com naves, dragões e combate espacial em java." }] },
    ];
    await buildSemIndex(null, { includeCode: false });
    const top = (await semSearch("como o hóspede faz uma reserva pelo whatsapp?", 3)).results[0];
    return { topScope: top.scope, topScore: top.score, workerOk: !!window.__semWorkerOk };
  });
  console.log(`[${browserName}] top: ${r.topScope} (${Math.round(r.topScore * 100)}%)`);
  expect(r.workerOk).toBe(true);
  expect(r.topScope, "busca real acha o projeto de reservas").toContain("Central de Reservas");
});
