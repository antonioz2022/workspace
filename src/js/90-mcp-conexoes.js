/* ===== 🔌 Claudes conectados — gestão das conexões do MCP da brain =====
   O worker expõe /admin/connections (GET/DELETE), autenticado com o MESMO PAT do
   painel (ele confere no GitHub que o dono é o Antonio). Desconectar = deleteClient
   no servidor (cascata) — aquele Claude perde o acesso na hora. */
const MCP_URL_DEFAULT="https://workspace-mcp.antonioz2022.workers.dev";
function mcpUrl(){ return (((DB.settings||{}).mcpUrl)||MCP_URL_DEFAULT).replace(/\/+$/,""); }
function setMcpUrl(v){ DB.settings=DB.settings||{}; DB.settings.mcpUrl=(v||"").trim(); save(); }
async function copyMcpUrl(){
  const ok=await copyText(mcpUrl()+"/mcp");
  const b=document.getElementById("mcpCopyBtn");
  if(b){ b.textContent=ok?"✓ copiado":"⚠ veja o console"; if(!ok) console.log(mcpUrl()+"/mcp");
    setTimeout(()=>{ b.textContent="📋 Copiar URL"; }, 2200); }
}
/* ===== Diretório universal de IAs — o Córtex é um servidor MCP; toda IA conecta na
   mesma URL. Cada cliente adiciona de um jeito (open/deeplink/config). ===== */
function connectorUrl(){ return mcpUrl()+"/mcp"; }
function aiConfigJson(){ return JSON.stringify({mcpServers:{cortex:{url:connectorUrl()}}}, null, 2); }
const AI_GROUPS=[["fronteira","IAs de fronteira (chat)"],["dev","Ferramentas de dev"],["local","Local & open-source (rode seus modelos)"],["universal","Qualquer cliente MCP"]];
const AI_CLIENTS=[
  {id:"claude", g:"fronteira", n:"Claude", ic:"🟠", t:"open", url:"https://claude.ai/settings/connectors",
   steps:"No Claude: ＋ Adicionar conector personalizado → cole a URL → Autorize.", note:"todos os planos"},
  {id:"chatgpt", g:"fronteira", n:"ChatGPT", ic:"🟢", t:"open", url:"https://chatgpt.com",
   steps:"No ChatGPT: Settings → Connectors → Developer mode → Create → cole a URL.", note:"plano pago · Plus/Pro só leitura"},
  {id:"perplexity", g:"fronteira", n:"Perplexity", ic:"🔵", t:"open", url:"https://www.perplexity.ai",
   steps:"Na Perplexity: Settings → Connectors → Add → cole a URL.", note:"Pro/Max/Enterprise"},
  {id:"grok", g:"fronteira", n:"Grok", ic:"⚫", t:"open", url:"https://grok.com",
   steps:"No Grok: Settings → Connectors → cole a URL.", note:"conta paga"},
  {id:"mistral", g:"fronteira", n:"Mistral · Le Chat", ic:"🟧", t:"open", url:"https://chat.mistral.ai",
   steps:"No Le Chat: Connectors → Add MCP → cole a URL.", note:"todos os planos"},
  {id:"gemini", g:"fronteira", n:"Gemini", ic:"✨", t:"config",
   steps:"Via Gemini CLI: gemini mcp add cortex <URL>. App em rollout.", note:"em rollout"},
  {id:"cursor", g:"dev", n:"Cursor", ic:"🖱️", t:"deeplink", one:true, steps:"Abre o Cursor e instala sozinho.", note:"1-clique"},
  {id:"vscode", g:"dev", n:"VS Code", ic:"🔷", t:"deeplink", one:true, steps:"Abre o VS Code e instala sozinho.", note:"1-clique"},
  {id:"windsurf", g:"dev", n:"Windsurf", ic:"🌊", t:"config", steps:"Cole no mcp_config do Windsurf.", note:""},
  {id:"cline", g:"dev", n:"Cline", ic:"🤖", t:"config", steps:"Cole nas MCP settings do Cline.", note:""},
  {id:"zed", g:"dev", n:"Zed", ic:"⚡", t:"config", steps:"Cole em context servers do Zed.", note:""},
  {id:"librechat", g:"local", n:"LibreChat", ic:"💬", t:"config", steps:"librechat.yaml → mcpServers (url + OAuth).", note:"self-hosted · roda teus modelos"},
  {id:"openwebui", g:"local", n:"Open WebUI", ic:"🦙", t:"config", steps:"Settings → External Tools/MCP → Streamable HTTP + OAuth.", note:"self-hosted · Ollama/LM Studio"},
  {id:"ollama-tui", g:"local", n:"MCP Client for Ollama", ic:"🖥️", t:"config", steps:"Adicione o server remoto no mcp-client-for-ollama.", note:"TUI · modelos locais"},
  {id:"any", g:"universal", n:"Qualquer cliente MCP", ic:"🌐", t:"config", steps:"Cole esta config MCP no seu cliente (Streamable HTTP + OAuth GitHub).", note:""},
];
function renderAIDirectory(){
  const host=document.getElementById("aiDir"); if(!host) return;
  host.innerHTML=AI_GROUPS.map(([g,label])=>{
    const cards=AI_CLIENTS.filter(c=>c.g===g).map(c=>{
      let btn;
      if(c.t==="open") btn=`<button class="btn sm primary" onclick="connectAI('${c.id}')">Conectar →</button>`;
      else if(c.t==="deeplink") btn=`<button class="btn sm primary" onclick="deeplinkAI('${c.id}')">Adicionar (1-clique)</button>`;
      else btn=`<button class="btn sm" onclick="copyAIConfig('${c.id}')">📋 Copiar config</button>`;
      return `<div class="ai-card">
        <div class="ai-h"><span class="ai-ic">${c.ic}</span><b>${esc(c.n)}</b>${c.one?` <span style="font-size:9.5px;color:var(--ok);font-family:var(--mono)">1-CLIQUE</span>`:""}</div>
        <p>${esc(c.note||c.steps)}</p>${btn}</div>`;
    }).join("");
    return `<div class="dr-sec" style="margin:14px 0 8px">${esc(label)}</div><div class="ai-cards">${cards}</div>`;
  }).join("");
}
function aiClient(id){ return AI_CLIENTS.find(c=>c.id===id); }
async function connectAI(id){ const c=aiClient(id); if(!c) return;
  await copyText(connectorUrl());
  if(c.url) window.open(c.url,"_blank","noopener");
  uiToast("URL copiada ✓  "+c.steps, "ok");
}
function deeplinkAI(id){ const c=aiClient(id); if(!c) return;
  let href;
  if(id==="cursor") href="cursor://anysphere.cursor-deeplink/mcp/install?name=cortex&config="+btoa(JSON.stringify({url:connectorUrl()}));
  else if(id==="vscode") href="vscode:mcp/install?"+encodeURIComponent(JSON.stringify({name:"cortex",type:"http",url:connectorUrl()}));
  else return;
  location.href=href;
  uiToast("Abrindo o "+c.n+"… confirme a instalação do conector 'cortex'.", "ok");
}
async function copyAIConfig(id){ const c=aiClient(id);
  const ok=await copyText(aiConfigJson());
  uiToast((ok?"Config copiada ✓  ":"")+(c?c.steps:"Cole a config MCP no seu cliente."), ok?"ok":"warn");
}
function mcpDate(n){ if(!n) return "—"; if(n<1e12) n*=1000; return new Date(n).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}); }
async function renderMcpConnections(){
  const el=document.getElementById("mcpConnList"); if(!el) return;
  const tok=(DB.settings||{}).githubToken;
  if(!tok){ el.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">cola o token do GitHub (acima) pra ver as conexões</div>`; return; }
  el.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">carregando conexões…</div>`;
  try{
    const r=await fetch(mcpUrl()+"/admin/connections",{headers:{Authorization:"Bearer "+tok}});
    if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||("HTTP "+r.status)); }
    const j=await r.json();
    const cons=j.connections||[];
    if(!cons.length){ el.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">nenhum Claude conectado ainda</div>`; return; }
    el.innerHTML=cons.map(c=>`
      <div class="mini-item" style="cursor:default">
        <span class="mi-emoji">${/chatgpt|openai|gpt/i.test(c.clientName||"")?"🟢":"🟠"}</span>
        <span style="flex:1;min-width:0">
          <b>${esc(c.clientName||"Claude")}</b>
          <span style="color:var(--tx3);font-size:11px"> · conectado em ${mcpDate(c.registrationDate)} · ${c.grants.length} autorização(ões)${c.grants[0]&&c.grants[0].label?` · ${esc(c.grants[0].label)}`:""}</span>
        </span>
        <span class="x" title="desconectar este Claude (revoga o acesso)" onclick="mcpDisconnect('${esc(c.clientId)}','${esc(c.clientName||"Claude")}')">✕</span>
      </div>`).join("");
  }catch(e){ el.innerHTML=`<div class="dr-desc" style="color:var(--warn)">falha: ${esc(e.message||String(e))}</div>`; }
}
