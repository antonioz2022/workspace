// e2e dos fluxos críticos do Córtex, contra o build de deploy (seed vazio).
// Cada teste é autocontido (cria o que precisa via UI) e NÃO toca a rede real.
import { test, expect } from "@playwright/test";

// coleta erros de página/console; cada teste termina limpo
test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  // falha de REDE (fonte externa, offline etc) não é bug do app; erro de código é
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

test("PWA: manifest presente, service worker ativo e app abre OFFLINE", async ({ page, context }) => {
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  // espera o SW registrar, ativar e pré-cachear o shell
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    return !!(reg && reg.active);
  }, null, { timeout: 10_000 });
  await page.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const c = await caches.open(keys[0]);
    return !!(await c.match("./index.html")) || !!(await c.match("index.html")) || !!(await c.match("./"));
  }, null, { timeout: 10_000 });
  // derruba a rede e recarrega: o shell tem que vir do cache
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".hud h1")).toHaveText("Córtex");
  await expect(page.locator("#dock")).toBeVisible();
  await context.setOffline(false);
});

test("membros: fluxo de convite completo com API mockada", async ({ page }) => {
  const REPO = "antonioz2022/ws-teste";
  let invited = false;
  // GitHub API mockada de ponta a ponta; o worker do MCP/vigia responde 401 (a UI degrada com elegância)
  await page.route("https://workspace-mcp.**", (r) => r.fulfill({ status: 401, json: {} }));
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url(), method = route.request().method();
    if (url.endsWith("/user")) return route.fulfill({ json: { login: "antonioz2022" } });
    if (url.endsWith(`/repos/${REPO}`)) return route.fulfill({ json: { full_name: REPO, permissions: { admin: true, push: true } } });
    if (url.includes("/collaborators?")) return route.fulfill({ json: [{ login: "antonioz2022", permissions: { admin: true } }] });
    if (method === "PUT" && url.includes("/collaborators/fulano")) { invited = true; return route.fulfill({ status: 201, json: { id: 9 } }); }
    if (url.endsWith("/invitations")) return route.fulfill({ json: invited ? [{ id: 9, invitee: { login: "fulano" } }] : [] });
    if (url.includes("/contents/state.json")) return route.fulfill({ status: 404, json: { message: "Not Found" } });
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  await page.evaluate(() => {
    DB.settings = DB.settings || {};
    DB.settings.githubToken = "ghp_mock";
    DB.settings.stateRepo = "antonioz2022/ws-teste";
    save();
  });
  await page.getByRole("button", { name: "⚙ Contas" }).click();
  await page.locator('.acc-tab:has-text("👥 Membros")').click();
  await expect(page.locator("#memberSelf")).toContainText("você: @antonioz2022 (admin)");
  await expect(page.locator("#membersList")).toContainText("@antonioz2022");

  await page.fill("#memberUser", "fulano");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.locator(".ui-toast")).toContainText("Convite enviado pra @fulano");
  await expect(page.locator("#membersList")).toContainText("convite pendente");
  await expect(page.locator("#membersList")).toContainText("@fulano");
});

test("colaboração viva: banner avisa quando o remoto muda e o Atualizar aplica", async ({ page }) => {
  const REPO = "antonioz2022/ws-teste";
  const remote = { updatedAt: 9999999999999, device: "colega",
    db: { version: 5, companies: [{ id: "rc", name: "Empresa Remota", emoji: "🛰", x: 0, y: 0, projects: [] }], settings: {} } };
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("/contents/state.json")) {
      const content = Buffer.from(JSON.stringify(remote)).toString("base64");
      return route.fulfill({ json: { sha: "s1", content } });
    }
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  await page.evaluate(() => {
    DB.settings = DB.settings || {};
    DB.settings.githubToken = "ghp_mock"; DB.settings.stateRepo = "antonioz2022/ws-teste";
    save();
    localStorage.setItem("workspace-map-v3-syncat", "1"); // local desatualizado
  });
  await page.evaluate(() => checkRemoteChanges());
  await expect(page.locator("#collabBanner")).toHaveClass(/show/);
  await expect(page.locator("#collabBanner")).toContainText("colega");
  await page.locator('#collabBanner button:has-text("Atualizar")').click();
  await expect(page.locator("#collabBanner")).not.toHaveClass(/show/);
  await expect(page.locator(".node.co .tag", { hasText: "Empresa Remota" })).toBeVisible();
});

test("orgs: criar workspace pergunta o owner e cria na organização", async ({ page }) => {
  let orgPost = null;
  await page.route("https://workspace-mcp.**", (r) => r.fulfill({ status: 401, json: {} }));
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url(), method = route.request().method();
    if (url.includes("/user/orgs")) return route.fulfill({ json: [{ login: "acme-org" }] });
    if (/\/user(\?|$)/.test(url)) return route.fulfill({ json: { login: "antonioz2022" } });
    if (method === "POST" && url.includes("/orgs/acme-org/repos")) {
      orgPost = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({ status: 201, json: { full_name: "acme-org/cortex-workspace" } });
    }
    if (url.includes("/repos/acme-org/cortex-workspace")) return route.fulfill({ json: { full_name: "acme-org/cortex-workspace", permissions: { admin: true, push: true } } });
    if (url.includes("/contents/")) {
      if (method === "GET") return route.fulfill({ status: 404, json: {} });
      return route.fulfill({ status: 201, json: { content: { sha: "x" } } });
    }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.evaluate(() => {
    DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_mock";
    localStorage.setItem("workspace-map-v3-ghlogin", "antonioz2022");
  });
  await page.getByRole("button", { name: "⚙ Contas" }).click();
  await page.locator("#wsState").getByRole("button", { name: "🚀 Criar minha workspace" }).click();
  // 1) nome
  await page.locator(".ui-dlg input").fill("cortex-workspace");
  await page.locator('.ui-dlg button:has-text("Próximo")').click();
  // 2) onde criar → escolhe a org
  await expect(page.locator(".ui-dlg")).toContainText("Onde criar a workspace?");
  await page.locator('.ui-dlg button:has-text("acme-org")').click();
  await expect.poll(() => orgPost).not.toBeNull();
  expect(orgPost).toMatchObject({ private: true });
  // a workspace conectou no repo da org
  await expect(page.locator("#wsState")).toContainText("acme-org/cortex-workspace");
});
