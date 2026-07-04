import { defineConfig } from "@playwright/test";

/*  e2e do Córtex: roda contra o BUILD DE DEPLOY (dist/index.html, seed vazio),
    ou seja, exatamente o que um usuário novo recebe no Pages. O servidor de teste
    (e2e/serve.mjs) builda e serve; nenhum teste toca a rede de verdade
    (chamadas ao GitHub são mockadas com page.route). */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4599",
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    url: "http://127.0.0.1:4599",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    // cross-browser só na verificação com modelo REAL (REAL_EMB=1): pesado demais pro CI.
    // (firefox do Playwright não abre nesta máquina — erro SxS do mozglue; webkit cobre
    // o motor mais restritivo pra module workers)
    ...(process.env.REAL_EMB
      ? [{ name: "webkit", use: { browserName: "webkit" } }]
      : []),
  ],
});
