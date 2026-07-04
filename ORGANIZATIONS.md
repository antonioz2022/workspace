# Córtex em Organizações (times / enterprise)

Uma workspace do Córtex é **um repositório privado**. Ela pode ficar na sua conta pessoal
(mais simples) ou numa **GitHub Organization** (times, SSO, permissões finas, faturamento
central). Nada muda no app: só muda o `owner/repo`.

Este guia é para quem quer rodar o Córtex com um time ou empresa.

## Por que uma organização

| | Conta pessoal | Organização |
|---|---|---|
| Membros | colaboradores 1 a 1 | **times** (adiciona/remove em grupo) |
| Login | senha + 2FA | **SSO / SAML** (enterprise) |
| Permissões | admin / write / read | papéis por time + branch protection |
| Token dos membros | **PAT classic** (scope `repo`) | **PAT fine-grained** funciona |
| Cobrança | pessoal | central da org |

Regra que não muda: **cada pessoa usa o token dela, guardado só no navegador dela.** O
Córtex nunca guarda o token de ninguém; o worker MCP age com o token de cada usuário.

## Criar a workspace numa org

1. No Córtex, entre com o GitHub (⚙ Contas → ⚡ Entrar com GitHub).
2. Clique **🚀 Criar minha workspace**. Se você pertence a organizações, o Córtex
   **pergunta onde criar** — escolha a org. (Você precisa ter permissão de criar repositório
   privado nessa org.)
3. Pronto: o repo privado nasce na org e a sync liga sozinha.

Já tem um repo de workspace numa org? Use **Conectar existente** e cole `org/repo`.

> Transferir uma workspace pessoal para uma org: GitHub → repo → Settings → **Transfer
> ownership** → nome da org. Depois, no Córtex, reconecte com o novo `org/repo`
> (🗂 Workspaces → Conectar) — os dados continuam, só mudou o dono.

## Adicionar o time

Duas formas, ambas válidas:

- **Pelo Córtex** (⚙ Contas → 👥 Membros → Convidar): adiciona a pessoa como colaborador
  do repo com o papel escolhido (Editor = push, Leitor = pull). Requer que o seu token
  tenha a permissão **Administration** no repo.
- **Pelo GitHub** (recomendado em org): repo → Settings → Collaborators and teams →
  **Add teams**. Assim você gerencia acesso por time, não pessoa a pessoa.

Cada membro, no primeiro acesso, faz: entra com o GitHub no Córtex → **Conectar existente**
com `org/repo`. As IAs de cada um entram sozinhas pelo conector MCP (o worker confere o
acesso da pessoa ao repo).

## Papéis

| Papel no repo | No Córtex | Pode |
|---|---|---|
| `admin` / `maintain` | **Admin** | tudo, incl. gerenciar membros e apagar a workspace |
| `write` (push) | **Editor** | editar o mapa e a brain (memória, pendências, arquivos) |
| `read` (pull) | **Leitor** | ver tudo, sem editar |

O worker MCP respeita isso: **escrita na brain exige push**; leitura basta ter acesso.

## Tokens numa org

- **Fine-grained PAT** funciona quando o repo está numa org (na conta pessoal, colaborador
  externo às vezes precisa de PAT classic com scope `repo`).
  - Repository access: **Only select repositories** → o repo da workspace.
  - Permissions: **Contents: Read and write** (obrigatório) · **Administration: Read and
    write** (só se for convidar membros pelo painel) · **Metadata: Read** (automático).
- **SSO/SAML**: depois de criar o token, na página do token clique **Configure SSO** e
  **autorize** para a sua org, senão a API responde 403.

## SSO e o login do Córtex

O "⚡ Entrar com GitHub" usa OAuth device flow. Se a org exige SSO, o membro pode precisar
**autorizar o OAuth App do Córtex** para a org (uma vez), em
`https://github.com/settings/connections/applications`. Sem isso, a API bloqueia o acesso
aos repos da org.

## Segurança em time

- Providers de IA e chaves **não sincronizam** — são locais por navegador. Um Editor
  malicioso não consegue trocar a `baseUrl` de outro membro para roubar chave.
- Apagar a workspace é **só para admin**, com confirmação por digitação; o GitHub valida de
  novo no servidor.
- Toda sincronização é um commit versionado; dá para auditar quem mudou o quê (histórico do
  `state.json`) e voltar atrás (🕘 Histórico no painel).

## Checklist rápido (admin da org)

- [ ] Criar/transferir o repo privado da workspace para a org.
- [ ] Dar acesso ao time (Add teams) com os papéis certos.
- [ ] Cada membro: entrar com GitHub no Córtex → Conectar existente (`org/repo`).
- [ ] (Se SSO) cada membro autoriza o token/OAuth para a org.
- [ ] (Opcional) branch protection no `main` do repo, se quiser revisão via PR do `state.json`.
