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

test("estado inicial: convite aparece no mapa vazio e some ao criar a 1ª empresa", async ({ page }) => {
  await expect(page.locator("#emptyState")).toHaveClass(/show/);
  await expect(page.locator("#emptyState")).toContainText("Comece o seu cérebro");
  await page.locator('#emptyState button:has-text("Criar primeira empresa")').click();
  await expect(page.locator("#coModal")).toHaveClass(/open/);
  await page.fill("#coName", "Primeira");
  await page.locator('#coModal button:has-text("Salvar")').click();
  await expect(page.locator("#emptyState")).not.toHaveClass(/show/);
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
    (async () => { await page.locator("#moreBtn").click(); await page.locator('.more-menu button:has-text("⬇ Backup")').click(); })(),
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

test("layout: a barra superior NÃO sobrepõe o HUD em nenhum tamanho", async ({ page }) => {
  await novaEmpresa(page, "Acme"); // popula HUD/mapa
  await page.evaluate(() => { const d = (typeof dockState === "function") ? dockState() : null; if (d) { d.min = true; applyDockMin(); } }); // dock minimizado (estado real no estreito)
  for (const w of [1440, 1200, 1000, 820, 640, 400, 360]) {
    await page.setViewportSize({ width: w, height: 820 });
    const r = await page.evaluate(() => {
      const rc = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
      const prim = document.querySelector(".topright .btn.primary").getBoundingClientRect();
      const el = document.elementFromPoint(prim.left + prim.width / 2, prim.top + prim.height / 2);
      const btn = document.querySelector(".topright .btn.primary");
      return { hud: rc(".hud"), tr: rc(".topright"), primClickable: !!(el && (el === btn || btn.contains(el))) };
    });
    const overlapX = Math.max(0, Math.min(r.hud.right, r.tr.right) - Math.max(r.hud.left, r.tr.left));
    const overlapY = Math.max(0, Math.min(r.hud.bottom, r.tr.bottom) - Math.max(r.hud.top, r.tr.top));
    expect(overlapX > 2 && overlapY > 2, `HUD×barra sobrepõem em ${w}px`).toBe(false);
    expect(r.primClickable, `botão + Nova empresa clicável em ${w}px`).toBe(true);
  }
});

test("mobile 360px: nada estoura a tela (página, drawer e modais)", async ({ page }) => {
  await page.route("https://api.github.com/**", (r) => r.fulfill({ status: 404, json: {} })); // sem rede real
  await novaEmpresa(page, "Empresa de Teste com Nome Longo");            // no tamanho padrão (rótulos visíveis)
  await novoProjeto(page, "Empresa de Teste com Nome Longo", "Projeto de Nome Bem Comprido Também");
  await page.setViewportSize({ width: 360, height: 760 });               // agora aperta pra celular
  await page.evaluate(() => { const c = DB.companies[0], p = c.projects[0]; sel = { id: p.id, co: c, pj: p, type: "pj" }; openDrawer(findNode(p.id)); }); // abre o drawer por código (o nó fica fora da tela)
  await expect(page.locator("#drawer")).toHaveClass(/open/);

  // 1) com o drawer aberto, a PÁGINA não rola na horizontal
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(noHScroll, "página não deve rolar horizontal").toBe(true);

  // 2) cada modal cabe na viewport e nenhum filho estoura a caixa do modal
  const report = await page.evaluate(() => {
    const openers = {
      pjModal: () => openPjModalFor(DB.companies[0].id, DB.companies[0].projects[0].id),
      coModal: () => openCoModal(),
      appModal: () => openAppModalFor(DB.companies[0].projects[0].id),
      prModal: () => { DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_x"; const p = DB.companies[0].projects[0]; p.github = "owner/repositorio-de-nome-longo"; teleCache[p.id] = { source: "github", repo: { defBranch: "main" }, git: { branch: "feature/x" } }; openPrModal(p.id); },
    };
    const out = {};
    for (const [k, fn] of Object.entries(openers)) {
      closeModals(); fn();
      const m = document.querySelector(".overlay.open .modal"); if (!m) { out[k] = "no-modal"; continue; }
      const mr = m.getBoundingClientRect();
      let overflowers = 0;
      m.querySelectorAll("*").forEach(el => { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > mr.right + 1 || r.left < mr.left - 1)) overflowers++; });
      out[k] = { fitsViewport: mr.left >= -1 && mr.right <= innerWidth + 1, overflowers };
    }
    closeModals();
    return out;
  });
  for (const [name, r] of Object.entries(report)) {
    expect(r, `${name} abriu`).not.toBe("no-modal");
    expect(r.fitsViewport, `${name} cabe na viewport`).toBe(true);
    expect(r.overflowers, `${name} sem filhos estourando`).toBe(0);
  }
});

test("polish: skeleton na telemetria + estados vazios (cockpit/busca)", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  // telemetria em 'loading' rende skeleton, não texto cru (determinístico)
  const hasSkel = await page.evaluate(() => { const c = DB.companies[0], p = c.projects[0]; return teleInner(c, p, "loading").includes("skel-wrap"); });
  expect(hasSkel).toBe(true);

  // cockpit vazio (sem projetos): mensagem amigável
  await page.evaluate(() => { window.__bkp = DB.companies; DB.companies = []; openCockpit(); });
  await expect(page.locator("#cockpitBody .empty-mini")).toContainText("Sem projetos ainda");
  await page.evaluate(() => { DB.companies = window.__bkp; closeModals(); });

  // busca: dica ao abrir + sem resultado
  await page.keyboard.press("Control+k");
  await expect(page.locator("#searchResults .empty-mini")).toContainText("digite 2+ letras");
  await page.fill("#searchInput", "zzxqwops");
  await expect(page.locator("#searchResults .empty-mini")).toContainText("Nada encontrado");
});

test("command palette: Ctrl+K roda ações (tema, agenda) além de buscar", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#searchModal")).toHaveClass(/open/);
  // ao abrir, mostra ações sugeridas
  await expect(page.locator("#searchResults .agenda-h", { hasText: "Ações" })).toBeVisible();
  // digitar "tema" filtra a ação e o Enter roda ela (alterna o tema)
  await page.fill("#searchInput", "tema");
  const themeCmd = page.locator('#searchResults .mini-item:has-text("Alternar tema")');
  await expect(themeCmd).toBeVisible();
  await themeCmd.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // "agenda" abre a Agenda
  await page.keyboard.press("Control+k");
  await page.fill("#searchInput", "agenda");
  await page.locator('#searchResults .mini-item:has-text("Agenda de prazos")').click();
  await expect(page.locator("#agendaModal")).toHaveClass(/open/);
  await page.evaluate(() => closeModals());
  // busca de entidade ainda funciona (2+ letras)
  await page.keyboard.press("Control+k");
  await page.fill("#searchInput", "Acme");
  await expect(page.locator("#searchResults .agenda-h", { hasText: "Resultados" })).toBeVisible();
});

test("relatório: workspace (.md) e projeto (.md) baixam com o conteúdo certo", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await abrirDrawerProjeto(page, "Site");
  await page.evaluate(() => { const p = DB.companies[0].projects[0]; p.todos = [{ t: "publicar landing", done: false, prio: "alta" }]; save(); openDrawer(findNode(p.id)); });
  // relatório do projeto (botão no rodapé)
  const [dl1] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "📄 Relatório" }).click()]);
  const fs = await import("node:fs");
  const md1 = fs.readFileSync(await dl1.path(), "utf8");
  expect(md1).toContain("# 📋 Relatório — Site");
  expect(md1).toContain("publicar landing");
  expect(dl1.suggestedFilename()).toMatch(/\.md$/);
  // relatório da workspace (pela paleta)
  await page.keyboard.press("Control+k");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.locator('#searchResults .mini-item:has-text("Relatório da workspace")').click()]);
  const md2 = fs.readFileSync(await dl2.path(), "utf8");
  expect(md2).toContain("# 📊 Relatório da workspace");
  expect(md2).toContain("Acme");
  expect(md2).toContain("Site");
});

test("agenda de prazos: agrupa por urgência, conta vencidas e navega", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await abrirDrawerProjeto(page, "Site");
  // 3 pendências: uma vencida, uma daqui a 3 dias, uma sem data
  await page.evaluate(() => {
    const p = DB.companies[0].projects[0];
    const d = new Date(); const iso = x => { const t = new Date(d); t.setDate(t.getDate() + x); return t.toISOString().slice(0, 10); };
    p.todos = [
      { t: "pagar servidor", done: false, due: iso(-2), prio: "alta", owner: "antonio" },
      { t: "revisar copy", done: false, due: iso(3) },
      { t: "sem prazo", done: false },
    ];
    save(); render();
  });
  await page.evaluate(() => openAgenda());
  const body = page.locator("#agendaBody");
  await expect(body.locator(".agenda-h", { hasText: "Vencidas" })).toBeVisible();
  await expect(body.locator(".agenda-h", { hasText: "Próximos 7 dias" })).toBeVisible();
  await expect(body).toContainText("pagar servidor");
  await expect(body).toContainText("revisar copy");
  await expect(body).not.toContainText("sem prazo");            // sem data não entra
  // clicar leva ao projeto
  await body.locator('.mini-item:has-text("pagar servidor")').click();
  await expect(page.locator("#drTitle")).toHaveText("Site");
  // o cockpit mostra o chip de vencidas
  await page.evaluate(() => openCockpit());
  await expect(page.locator("#cockpitBody")).toContainText("vencida(s)");
});

test("tema claro/escuro: alterna, muda o fundo e persiste no reload", async ({ page }) => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe("rgb(11, 10, 18)");                 // escuro (#0B0A12) por padrão
  await page.locator("#moreBtn").click();
  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg()).toBe("rgb(244, 243, 251)");              // claro (#F4F3FB)
  // o texto dos botões da barra termina ESCURO no claro (toHaveCSS espera a transição de cor)
  await expect(page.locator(".topright .btn").first()).toHaveCSS("color", "rgb(27, 24, 48)");
  await expect(page.locator("#themeToggle")).toHaveText(/Tema escuro/);
  await page.reload();                                        // persiste
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg()).toBe("rgb(244, 243, 251)");
  await page.locator("#moreBtn").click();
  await page.locator("#themeToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await bg()).toBe("rgb(11, 10, 18)");
});

test("barra: menu ⋯ Mais abre e leva às ações secundárias", async ({ page }) => {
  await page.locator("#moreBtn").click();
  await expect(page.locator("#moreMenu")).toHaveClass(/show/);
  await expect(page.locator("#moreMenu")).toContainText("Cockpit");
  await expect(page.locator("#moreMenu")).toContainText("Backup");
  await page.locator('.more-menu button:has-text("🎛 Cockpit")').click();
  await expect(page.locator("#cockpitModal")).toHaveClass(/open/);
  await expect(page.locator("#moreMenu")).not.toHaveClass(/show/); // fecha ao escolher
});

/* ==================== segurança: correções do report ofensivo ==================== */

test("higiene: IDs maliciosos em estado que entra viram IDs seguros (fecha os handlers inline)", async ({ page }) => {
  const ids = await page.evaluate(() => {
    DB = migrate({ version: 5, companies: [
      { id: "x'),alert(1);//", name: "Mau", emoji: "🏢", x: 0, y: 0, projects: [
        { id: '"><img src=x onerror=alert(1)>', name: "P", emoji: "🚀", x: 0, y: 0,
          apps: [{ id: "a')//", name: "S" }], chats: [{ id: "c'x", title: "t" }], todos: [] },
      ] },
    ], settings: { providers: [{ id: "p'x", name: "Groq", models: ["m"] }] } });
    save(); render();
    const c = DB.companies[0], p = c.projects[0];
    return { co: c.id, pj: p.id, ap: p.apps[0].id, ch: p.chats[0].id, pr: DB.settings.providers[0].id };
  });
  const safe = /^[A-Za-z0-9_-]{1,40}$/;
  for (const [k, v] of Object.entries(ids)) expect(v, `id ${k} normalizado`).toMatch(safe);
  expect(await page.locator("img[onerror]").count(), "nenhum <img onerror> escapou pro DOM").toBe(0);
});

test("higiene: img de logo fora do allowlist é descartada (sem breakout de atributo)", async ({ page }) => {
  const r = await page.evaluate(() => {
    const bad = migrate({ version: 5, companies: [{ id: "co1", name: "X", emoji: "🏢", x: 0, y: 0, img: 'x" onerror="alert(1)', projects: [] }] });
    const ok = migrate({ version: 5, companies: [{ id: "co2", name: "Y", emoji: "🏢", x: 0, y: 0, img: "data:image/png;base64,iVBORw0KGgo=", projects: [] }] });
    return { bad: bad.companies[0].img, ok: ok.companies[0].img };
  });
  expect(r.bad).toBe("");                                        // aspas/HTML → rejeitado
  expect(r.ok).toBe("data:image/png;base64,iVBORw0KGgo=");      // dataURL de imagem legítimo passa
});

test("exfil: mcpUrl/providers plantados no state.json remoto NÃO são aplicados (token não vaza)", async ({ page }) => {
  const payload = { updatedAt: 9999999999999, device: "atacante",
    db: { version: 5, companies: [], settings: { mcpUrl: "https://evil.example.com", providers: [{ id: "p", apiKey: "roubada" }] } } };
  await page.route("https://api.github.com/**", (route) => {
    if (route.request().url().includes("/contents/state.json")) {
      return route.fulfill({ json: { sha: "s1", content: Buffer.from(JSON.stringify(payload)).toString("base64") } });
    }
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  const res = await page.evaluate(async () => {
    DB.settings = DB.settings || {};
    DB.settings.githubToken = "ghp_local"; DB.settings.stateRepo = "antonioz2022/ws-teste";
    delete DB.settings.mcpUrl; delete DB.settings.providers;   // local no DEFAULT (mcpUrl indefinido = o furo do report)
    save();
    localStorage.setItem("workspace-map-v3-syncat", "1");
    await pullState({ force: true });
    return { mcp: DB.settings.mcpUrl, prov: DB.settings.providers, urlFn: mcpUrl() };
  });
  expect(res.mcp, "mcpUrl remoto descartado").toBeUndefined();
  expect(res.prov, "providers remotos descartados").toBeUndefined();
  expect(res.urlFn, "cai no default, não no domínio do atacante").toBe("https://workspace-mcp.antonioz2022.workers.dev");
});

test("exfil: backup importado com mcpUrl/providers/token maliciosos é higienizado", async ({ page }) => {
  await page.evaluate(() => { DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_MEU_LOCAL"; save(); });
  const mal = JSON.stringify({ version: 5,
    companies: [{ id: "co1", name: "Boa", emoji: "🏢", x: 0, y: 0, projects: [] }],
    settings: { mcpUrl: "https://evil.example.com", providers: [{ id: "p", apiKey: "x" }], githubToken: "ghp_INJETADO" } });
  await page.setInputFiles("#importFile", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(mal) });
  await expect(page.locator(".node.co .tag", { hasText: "Boa" })).toBeVisible();   // barreira: importou e renderizou
  const res = await page.evaluate(() => ({ mcp: DB.settings.mcpUrl, prov: DB.settings.providers, tok: DB.settings.githubToken }));
  expect(res.mcp).toBeUndefined();
  expect(res.prov).toBeUndefined();
  expect(res.tok, "preservou o token LOCAL, ignorou o injetado").toBe("ghp_MEU_LOCAL");
});

test("URL de serviço: javascript: não vira link nem é fetchado; https válido rende com rel de segurança", async ({ page }) => {
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await page.evaluate(() => {
    const p = DB.companies[0].projects[0];
    p.apps = [{ id: "svc1", name: "Painel", dash: "javascript:alert(1)", url: "https://exemplo.com/app", health: "javascript:alert(1)" }];
    save(); sel = { id: "svc1", co: DB.companies[0], pj: p, type: "ap" }; openDrawer(findNode("svc1"));
  });
  await expect(page.locator("#drawer")).toHaveClass(/open/);
  expect(await page.locator('#drawer a[href^="javascript:"]').count(), "nenhum href javascript:").toBe(0);
  await expect(page.locator('#drawer a.link:has-text("Abrir painel")'), "dash perigoso não vira link").toHaveCount(0);
  const ok = page.locator('#drawer a.link[href="https://exemplo.com/app"]');
  await expect(ok).toHaveCount(1);
  await expect(ok).toHaveAttribute("rel", "noopener noreferrer");
});

test("reconciliador: sinaliza memória defasada quando o repo andou depois da última atualização", async ({ page }) => {
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    // memoria.md no cérebro: último commit ANTIGO
    if (url.includes("/commits") && url.includes("memoria.md"))
      return route.fulfill({ json: [{ commit: { author: { date: "2020-01-01T00:00:00Z" } } }] });
    // commits do repo de CÓDIGO (após o `since`): 2 novos
    if (url.includes("/repos/owner/repo/commits"))
      return route.fulfill({ json: [
        { sha: "aaaaaa1", commit: { message: "feat: novo", author: { date: "2030-01-02T00:00:00Z" } }, html_url: "https://x/1" },
        { sha: "bbbbbb2", commit: { message: "fix: bug", author: { date: "2030-01-01T00:00:00Z" } }, html_url: "https://x/2" },
      ] });
    return route.fulfill({ status: 404, json: { message: "Not Found" } });
  });
  await novaEmpresa(page, "Acme");
  await novoProjeto(page, "Acme", "Site");
  await page.evaluate(() => {
    DB.settings = DB.settings || {}; DB.settings.githubToken = "ghp_mock"; DB.settings.stateRepo = "antonioz2022/ws-teste";
    const p = DB.companies[0].projects[0]; p.github = "owner/repo"; save();
    sel = { id: p.id, co: DB.companies[0], pj: p, type: "pj" }; openDrawer(findNode(p.id));
  });
  await expect(page.locator("#memSyncBanner")).toContainText("defasada", { timeout: 6000 });
  await expect(page.locator('#memSyncBanner button:has-text("Gerar atualização pra IA")')).toBeVisible();
});

test("servidor de teste só serve o allowlist do PWA (nada de src/ nem seed.local.js)", async ({ page }) => {
  const codes = await page.evaluate(async () => {
    const get = (u) => fetch(u).then((r) => r.status).catch(() => 0);
    return { seed: await get("/src/js/seed.local.js"), mod: await get("/src/js/12-estado.js"), manifest: await get("/manifest.webmanifest") };
  });
  expect(codes.seed, "seed.local.js nunca servido").toBe(404);
  expect(codes.mod, "fonte src/ não servida").toBe(404);
  expect(codes.manifest, "estático do PWA continua ok").toBe(200);
});
