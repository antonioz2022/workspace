// e2e dos fluxos críticos do Córtex, contra o build de deploy (seed vazio).
// Cada teste é autocontido (cria o que precisa via UI) e NÃO toca a rede real.
import { test, expect } from "@playwright/test";

// coleta erros de página/console; cada teste termina limpo
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.errors = errors;
  await page.goto("/");
  await expect(page.locator(".hud h1")).toHaveText("Córtex");
});
test.afterEach(async ({ page }) => {
  expect(page.errors, "sem erros de console/página").toEqual([]);
});

async function novaEmpresa(page, nome) {
  await page.getByRole("button", { name: "＋ Nova empresa" }).click();
  await page.fill("#coName", nome);
  await page.locator('#coModal button:has-text("Salvar")').click();
  await expect(page.locator(".node.co .tag", { hasText: nome })).toBeVisible();
}
async function novoProjeto(page, nomeEmpresa, nomeProjeto) {
  await page.locator(`.node.co:has-text("${nomeEmpresa}")`).click();
  await expect(page.locator("#drawer")).toHaveClass(/open/);
  await page.getByRole("button", { name: "＋ Novo projeto" }).click();
  await page.fill("#pjName", nomeProjeto);
  await page.locator('#pjModal button:has-text("Salvar")').click();
  await expect(page.locator(".node.pj .tag", { hasText: nomeProjeto })).toBeVisible();
}
async function abrirDrawerProjeto(page, nomeProjeto) {
  await page.locator(`.node.pj:has-text("${nomeProjeto}")`).click();
  await expect(page.locator("#drawer")).toHaveClass(/open/);
  await expect(page.locator("#drTitle")).toHaveText(nomeProjeto);
}

test("boot limpo: título, HUD, dock com convite, sem erros", async ({ page }) => {
  await expect(page).toHaveTitle(/Córtex/);
  await expect(page.locator("#hudCos")).toHaveText("0");
  await expect(page.locator("#dock")).toBeVisible();
  await expect(page.locator("#dockBody")).toContainText("Converse com uma IA por aqui");
});

test("onboarding: criar empresa e projeto pelo mapa", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await expect(page.locator("#hudCos")).toHaveText("1");
  await novoProjeto(page, "Acme", "Site Novo");
  await expect(page.locator("#hudPjs")).toHaveText("1");
});

test("pendências: metadata inline, badges, prazo vencido e concluir", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await abrirDrawerProjeto(page, "Site");

  await page.fill("#todoInput", "lançar beta !alta @antonio 📅2030-12-31");
  await page.press("#todoInput", "Enter");
  const item1 = page.locator(".todo-item", { hasText: "lançar beta" });
  await expect(item1.locator(".tb.tb-alta")).toContainText("alta");
  await expect(item1.locator(".tb", { hasText: "@antonio" })).toBeVisible();
  await expect(item1.locator(".tb", { hasText: "2030-12-31" })).not.toHaveClass(/tb-over/);

  await page.fill("#todoInput", "tarefa atrasada !media 📅2020-01-01");
  await page.press("#todoInput", "Enter");
  await expect(page.locator(".todo-item", { hasText: "tarefa atrasada" }).locator(".tb-over")).toBeVisible();

  await item1.locator(".cb").click();
  await expect(page.locator(".todo-item.done", { hasText: "lançar beta" })).toBeVisible();

  // o estado persistido tem a metadata estruturada (não só visual)
  const todo = await page.evaluate(() => JSON.parse(localStorage.getItem("workspace-map-v3")).companies[0].projects[0].todos[0]);
  expect(todo).toMatchObject({ prio: "alta", owner: "antonio", due: "2030-12-31", done: true });
});

test("busca global: Ctrl+K acha pendência e navega", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await abrirDrawerProjeto(page, "Site");
  await page.fill("#todoInput", "publicar landing");
  await page.press("#todoInput", "Enter");

  await page.keyboard.press("Control+k");
  await expect(page.locator("#searchModal")).toHaveClass(/open/);
  await page.fill("#searchInput", "landing");
  const hit = page.locator("#searchResults .mini-item", { hasText: "publicar landing" });
  await expect(hit).toContainText("pendência");
  await hit.click();
  await expect(page.locator("#drawer")).toHaveClass(/open/);
  await expect(page.locator("#drTitle")).toHaveText("Site");
});

test("filtro por status esmaece quem não bate", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  // muda o status pra pausado pelo ✎ Editar
  await abrirDrawerProjeto(page, "Site");
  await page.getByRole("button", { name: "✎ Editar" }).click();
  await page.selectOption("#pjStatus", "pausado");
  await page.locator('#pjModal button:has-text("Salvar")').click();

  await page.locator('#mapFilter .fc:has-text("Pausados")').click();
  await expect(page.locator(".node.pj")).not.toHaveClass(/dimmed/);
  await page.locator('#mapFilter .fc:has-text("Ativos")').click();
  await expect(page.locator(".node.pj")).toHaveClass(/dimmed/);
  await page.locator('#mapFilter .fc:has-text("Todos")').click();
  await expect(page.locator(".node.pj")).not.toHaveClass(/dimmed/);
});

test("backup baixado NÃO contém token nem chave de IA", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await page.evaluate(() => {
    DB.settings = DB.settings || {};
    DB.settings.githubToken = "ghp_SEGREDO_DE_TESTE_1234567890abcd";
    DB.settings.providers = [{ id: "p1", name: "Groq", baseUrl: "https://api.groq.com", apiKey: "sk-SEGREDO_XYZ" }];
    save();
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "⬇ Backup" }).click(),
  ]);
  const file = await download.path();
  const txt = (await import("node:fs")).readFileSync(file, "utf8");
  expect(txt).not.toContain("ghp_SEGREDO");
  expect(txt).not.toContain("sk-SEGREDO");
  expect(txt).toContain("Acme");
});

test("dock: convite leva pra aba 💬 Chat das contas", async ({ page }) => {
  await page.locator('#dock button:has-text("Escolher IA")').click();
  await expect(page.locator("#aiModal")).toHaveClass(/open/);
  await expect(page.locator("#tab-chat")).toHaveClass(/on/);
});

test("acessibilidade: nó do mapa opera por teclado", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  const node = page.locator(".node.co").first();
  await expect(node).toHaveAttribute("role", "button");
  await expect(node).toHaveAttribute("aria-expanded", "false");
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#drawer")).toHaveClass(/open/);
  await expect(page.locator(".node.co").first()).toHaveAttribute("aria-expanded", "true");
});

test("repo do projeto: validação ao vivo com API mockada + sem repositório", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/repos/foo/bar")) {
      return route.fulfill({ json: { full_name: "foo/bar", private: true, language: "TypeScript", stargazers_count: 7 } });
    }
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await abrirDrawerProjeto(page, "Site");
  await page.getByRole("button", { name: "✎ Editar" }).click();
  await page.evaluate(() => { DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_mock"; });

  await page.fill("#pjGithub", "foo/bar");
  await expect(page.locator("#pjRepoStatus")).toContainText("✓ conectado: foo/bar", { timeout: 5000 });
  await expect(page.locator("#pjRepoStatus")).toContainText("🔒 privado");

  // marcar "sem repositório" desabilita e limpa o campo
  await page.check("#pjNoRepo");
  await expect(page.locator("#pjGithub")).toBeDisabled();
  await expect(page.locator("#pjGithub")).toHaveValue("");
  await expect(page.locator("#pjRepoStatus")).toContainText("sem repositório");
});
