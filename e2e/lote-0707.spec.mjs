// e2e do lote 07/07: higiene do c.color, confirm do connectExistingWorkspace e ghSend.
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push("console: " + m.text());
  });
  page.errors = errors;
  await page.goto("/");
  await expect(page.locator(".hud h1")).toHaveText("Córtex");
});
test.afterEach(async ({ page }) => {
  expect(page.errors, "sem erros de console/página").toEqual([]);
});

test("higiene v3: cor de empresa maliciosa é coerida pra hex; cor legítima passa", async ({ page }) => {
  const r = await page.evaluate(() => {
    const bad = migrate({ version: 6, companies: [
      { id: "c1", name: "Evil", emoji: "🏢", x: 0, y: 0, color: "red;position:fixed;inset:0;background:url(https://evil/beacon)", projects: [] },
      { id: "c2", name: "Ok", emoji: "🏢", x: 0, y: 0, color: "#59d99d", projects: [] },
      { id: "c3", name: "SemCor", emoji: "🏢", x: 0, y: 0, projects: [] },
    ] });
    return { evil: bad.companies[0].color, ok: bad.companies[1].color, missing: bad.companies[2].color };
  });
  expect(r.evil, "declaração CSS extra → default violeta").toBe("#8B5CF6");
  expect(r.ok, "hex legítimo preservado").toBe("#59d99d");
  expect(r.missing, "cor ausente → default (antes virava 'undefined' no style)").toBe("#8B5CF6");
});

test("conectar workspace existente: mapa local sem workspace pede confirmação; cancelar preserva tudo", async ({ page }) => {
  await page.evaluate(() => {
    DB.companies.push({ id: "local1", name: "Mapa Local", emoji: "🏢", x: 0, y: 0, color: "#8B5CF6", projects: [] });
    save(); render();
  });
  await expect(page.locator("#hudCos")).toHaveText("1");
  await page.evaluate(() => { connectExistingWorkspace(); });   // fire-and-forget: o fluxo vive nos diálogos
  await page.locator(".ui-dlg input").fill("acme/ws-remota");
  await page.locator(".ui-dlg .ok").click();
  await expect(page.locator(".ui-dlg"), "aviso de substituição aparece").toContainText("SUBSTITUI");
  await page.locator('.ui-dlg button:has-text("Cancelar")').click();
  const st = await page.evaluate(() => ({ n: DB.companies.length, repo: stateRepo() }));
  expect(st.n, "mapa local intacto").toBe(1);
  expect(st.repo, "não conectou em nada").toBeNull();
});

test("ghSend: 422 ao criar workspace vira aviso amigável (sem conectar)", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url(), m = route.request().method();
    if (url.endsWith("/user/repos") && m === "POST") return route.fulfill({ status: 422, json: { message: "name already exists on this account" } });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.evaluate(() => { DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_mock"; });
  await page.evaluate(() => { createWorkspace(); });
  await page.locator(".ui-dlg .ok").click();   // nome já vem preenchido ("cortex-workspace")
  await expect(page.locator(".ui-toast").last()).toContainText("Já existe um repo");
  const repo = await page.evaluate(() => stateRepo());
  expect(repo, "não conectou no repo que falhou").toBeNull();
});
