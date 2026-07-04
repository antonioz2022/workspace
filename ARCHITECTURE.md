# Arquitetura do Córtex

> Um cérebro para todas as suas IAs: painel de comando + memória compartilhada + conector MCP.
> Este documento é a fonte da verdade sobre como o produto é montado hoje e para onde vai.
> Última revisão: 2026-07-04.

## 1. Visão

O Córtex resolve um problema simples: toda conversa nova com uma IA começa do zero.
A solução tem três partes que se reforçam:

1. **Saber**: cada empresa/projeto do usuário tem perfil, memória viva, pendências e arquivos num lugar só (a "brain").
2. **Conectar**: qualquer IA relevante (Claude, ChatGPT, Cursor, modelos locais) lê e escreve nessa brain pela mesma URL MCP, com o mesmo OAuth do GitHub.
3. **Executar**: runbooks e briefings ensinam a IA a agir nos serviços do usuário com segurança; o painel mostra tudo (telemetria git, issues, PRs, milestones, vigia de uptime).

Princípios que não mudam sem uma boa razão:

- **US$ 0 de infra**: GitHub (Pages + repos privados) + Cloudflare Workers free tier.
- **Local-first**: os dados vivem no navegador do usuário e sincronizam com um repo privado DELE. Não existe banco nosso, não existe servidor nosso guardando dados de cliente.
- **GitHub como identidade e permissão**: login por OAuth/device flow; membro de workspace = collaborator do repo; Editor = quem tem push. Zero sistema próprio de contas.
- **Segredos nunca saem da máquina**: token, chaves de IA e URLs de provedor são locais por navegador.

## 2. As três peças (hoje)

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│  APP (GitHub Pages)      │     │  WORKER (Cloudflare)          │
│  antonioz2022.github.io/ │     │  workspace-mcp....workers.dev │
│  workspace               │     │                               │
│  arquivo único (buildado │     │  /mcp     servidor MCP+OAuth  │
│  de src/), vanilla JS,   │     │  /panel   device flow login   │
│  localStorage            │     │  /admin   conexões + vigia    │
└──────────┬──────────────┘     │  cron 5min: vigia → ntfy      │
           │ Contents API        └──────────────┬───────────────┘
           ▼                                    │ OAuth do usuário
┌───────────────────────────────────────────────▼───────────────┐
│  WORKSPACE REPO (privado, do usuário; ex. workspace-state)     │
│  state.json  = estado do painel (sanitizado, versionado)       │
│  INDEX.md    = mapa-mestre para IAs                            │
│  brain/<empresa>/<projeto>/{memoria,pendencias,projeto}.md     │
│  brain/<empresa>/brand/ + assets/ = arquivos                   │
└────────────────────────────────────────────────────────────────┘
```

- **App**: canvas estilo mapa (empresas → projetos → serviços), drawers, cockpit, chat embutido
  (API key local, direto do navegador), dock lateral, busca global, histórico/rollback.
- **Worker**: a única peça server-side. Não guarda dados de usuário: age com o token OAuth
  do próprio usuário sobre o repo privado dele. Membership dinâmica (acesso ao repo = membro;
  escrita exige permissão de push), fail-closed.
- **Workspace repo**: é a brain E o backup E o histórico (cada sync é um commit; o rollback
  do painel usa o histórico git do state.json). Multi-workspace = trocar de repo.

## 3. Fluxos principais

- **Edição no painel** → `save()` → debounce → `pushState` (state.json sanitizado) +
  `queueBrainPush` (memoria/pendencias/projeto/INDEX .md). Guard: não empurra conteúdo idêntico.
- **IA editando a brain** (via MCP ou git) → commit no repo → o painel importa no foco
  (`pullState` + `pullBrainRemote`), com preview/diff quando há edição local não sincronizada.
- **Pendências**: parser/serializer LOSSLESS (multilinha, seções, metadata inline
  `!prio @dono 📅prazo`). O arquivo .md é o contrato com as IAs; round-trip byte a byte.
- **Telemetria**: pasta local (File System Access) quando disponível, senão GitHub API
  (commits, branch, issues, PRs, milestones, releases, specs/).

## 4. Modelo de segurança

| Camada | Regra |
|---|---|
| Sync/backup | `sanitizeStateForSync` remove: githubToken, providers (inteiros, para baseUrl não vir do remoto), mcpUrl, dock. Backup manual usa a mesma sanitização. |
| Pull remoto | Preserva os campos locais acima; estado remoto nunca troca URL de provedor (fecha exfiltração de chave). |
| Push | Só quando o conteúdo sanitizado mudou (pan/zoom não geram push nem sobrescrevem outro device). |
| Worker | Allowlist do dono + membership dinâmica por token do próprio usuário; escrita exige push no repo; deletar conexão revoga em cascata. |
| Deploy do app | O build de deploy usa `src/js/seed.js` (vazio) POR CONSTRUÇÃO. `seed.local.js` (dados do dono) nunca entra no repo público. Gates: sintaxe (vm), regex de segredos, contagem de termos privados vs live. |
| Apagar workspace | Só admin do repo, com type-to-confirm; o GitHub valida de novo no servidor. |

## 5. Código-fonte modular (src/)

O runtime continua **um único index.html** (decisão consciente: os handlers `onclick` inline
dependem de escopo global clássico; ES modules quebrariam tudo sem benefício de runtime).
A modularização é na FONTE: `src/` tem os pedaços, `build.mjs` concatena.

```
src/
  00-head.html        doctype + <head> + CSS
  01-body.html        HTML (hud, modais, drawer, dock) até <script>
  js/
    10-seed.js        placeholder do SEED + migrações
    12-estado.js      load/save/saveView, helpers
    20..24-mapa*.js   layout, render, filtro, pan/zoom/drag
    30-drawer.js      drawer + ping
    32-crud.js        CRUD + validação de repo do projeto
    34-util.js        modais, backup sanitizado, scheduleSync
    40..46-*.js       providers, diálogos/toasts, conta ⚙, device flow
    50..52-chat*.js   chat por projeto + dock lateral (SSE)
    60..66-*.js       brain local, telemetria, GitHub API, brain no repo
    70..74-*.js       sync de estado, workspace automático, multi-workspace
    80..86-*.js       brain cloud + arquivos/briefings, cockpit, busca, histórico
    90..94-*.js       conexões MCP, vigia, membros
    99-boot.js        boot
    seed.js           SEED VAZIO (vai pro repo público)
    seed.local.js     SEED com dados reais (SÓ local, nunca commitar)
  99-tail.html
build.mjs             monta; --local (raiz, seed real) · default (dist/, seed vazio) · --check/--check-deploy
smoke-test.mjs        0) drift src↔index  1) sintaxe  2) sanitização  3) round-trip pendências  4) fluxos  5) símbolos
e2e/ + playwright.config.mjs   e2e de navegador (Chromium) contra o build de deploy: boot sem erro
                      de console, onboarding empresa/projeto, pendências com metadata, busca Ctrl+K,
                      filtro por status, backup sanitizado, dock, teclado/a11y, validação de repo
                      com API mockada (nenhum teste toca a rede real)
```

**Fluxo de desenvolvimento**: editar `src/` → `node build.mjs --local` → testar (preview +
`node smoke-test.mjs` + `npx playwright test`) → deploy = `node build.mjs` e push do
`dist/index.html` no repo público. O CI roda `--check-deploy` + smoke + e2e em todo push/PR.

## 6. Roadmap

**Curto prazo (produto usável por terceiros)**
- Convite de membro e2e validado com uma segunda conta.
- Landing page num domínio real; onboarding do zero (criar workspace no primeiro login já existe).
- Encher o próprio uso: perfis, runbooks, milestones e prazos reais (o valor agora vem do uso).

**Médio prazo (produtização)**
- ~~Testes e2e de navegador (Playwright) sobre os fluxos críticos, rodando no CI.~~ Feito em 2026-07-04.
- PWA/offline (manifest + service worker) e instalável no celular.
- Colaboração mais viva: polling no foco → notificação de mudanças (o worker já vê os commits).
- Organizações/enterprise: workspace numa GitHub Org (já funciona; falta documentação e UX).

**Longo prazo (se virar SaaS de verdade)**
- Plano pago = conveniências (domínio, templates de brain, vigia com mais frequência,
  onboarding assistido por IA), mantendo o núcleo local-first e os dados no GitHub do cliente.
- App wrapper mobile; i18n (en primeiro).

## 7. Decisões registradas (por quê)

- **Arquivo único no runtime**: zero build no navegador, abre até de file://, deploy trivial,
  sem CORS interno. A dor de manutenção foi resolvida na fonte (src/ + build), não no runtime.
- **Sem framework**: o app é um canvas + drawers; vanilla JS mantém o bundle em ~230 KB sem
  dependências pra auditar. Reavaliar só se a equipe crescer.
- **GitHub-nativo em vez de backend próprio**: identidade, permissão, storage, histórico e
  webhooks já existem lá, de graça, com a confiança que o público-alvo (fundadores/devs) já tem.
- **Providers locais por navegador**: menos conveniente em multi-device, porém elimina a
  classe inteira de ataque "estado remoto envenena baseUrl e rouba a chave".
