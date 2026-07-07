/* ================= estado ================= */
const LS_KEY = "workspace-map-v3";
// ⚠ estas consts são usadas por hardenDB/migrate DENTRO do load() logo abaixo — precisam
// vir ANTES do `let DB=load()`. Declaradas depois, dão TDZ no load: o catch engolia o erro
// e DESCARTAVA o estado salvo (workspace zerada + logout a cada reload — bug real, só se
// manifestava com dados). Coberto pelo e2e "sobrevive ao reload".
const NODE_STATUS=["ativo","pausado","concluido"], TODO_PRIOS=["alta","media","baixa"];
let DB = load();
let cam = JSON.parse(localStorage.getItem(LS_KEY+"-cam") || "null") || {x:0, y:0, z:1};
let expanded = new Set(JSON.parse(localStorage.getItem(LS_KEY+"-exp") || "[]"));
let sel = null;           // {type:'co'|'pj'|'ap', co, pj, ap}
let editingCo=null, editingPj=null, editingApp=null;
const pingCache = {};     // id -> {cls, txt}

/* ===== higiene de dados que ENTRAM (pull/import/load): estado remoto e backups são
   conteúdo de MENOR confiança. IDs viram atributos e strings de handler inline, e img vira
   src — então validamos contra um padrão seguro (sem aspas/HTML) na porta de entrada. ===== */
function uid(){ return Math.random().toString(36).slice(2,9); }
function safeId(v){ return (typeof v==="string" && /^[A-Za-z0-9_-]{1,40}$/.test(v)) ? v : uid(); }
function safeImg(v){ if(typeof v!=="string"||!v) return ""; if(/["'<>\s]/.test(v)) return ""; return /^(data:image\/|https:\/\/|assets\/)/i.test(v)?v:""; }
function jsq(v){ return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/[<>"&]/g,c=>({"<":"\\u003c",">":"\\u003e",'"':"&quot;","&":"&amp;"}[c])); } // seguro dentro de onclick="fn('...')"
// URL de serviço (painel/serviço/health) segura: só http(s). Bloqueia javascript:/data:/file:/blob:
// pra que um link de serviço não execute script ao clicar nem o health faça fetch em esquema perigoso.
// (localhost/IP privado continuam válidos de propósito: health-check de dev local é caso de uso real.)
function safeUrl(u){ const s=(u==null?"":String(u)).trim(); if(!s) return "";
  try{ const p=new URL(s, location.href); return (p.protocol==="http:"||p.protocol==="https:") ? p.href : ""; }catch(e){ return ""; } }
// host privado/loopback: um health-check SINCRONIZADO por um colaborador não deve ser
// buscado AUTOMATICAMENTE (SSRF no navegador da vítima). Só verifica no clique explícito.
function isPrivateHost(u){
  try{ const h=new URL(u, location.href).hostname.toLowerCase();
    return h==="localhost" || h==="::1" || h==="0.0.0.0" || h.endsWith(".local")
      || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
      || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }catch(e){ return false; }
}
// coordenada segura: só número finito (senão null → o layout recalcula). Fecha o breakout de style="left:${x}".
function safeCoord(v){ return (typeof v==="number" && isFinite(v)) ? v : null; }
// repo GitHub estrito owner/repo (2 segmentos seguros, sem "..") — impede que `../` redirecione a API.
function safeRepo(v){ v=(v==null?"":String(v)).trim(); return (/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(v) && !v.includes("..")) ? v : ""; }
// cor de empresa: só hex CSS. Ela vai crua pra style="background:…" e esc() não impede
// declarações extras (";position:fixed" ou "url(https://…)" de rastreio). Fora do padrão → violeta.
function safeColor(v){ return (typeof v==="string" && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) ? v : "#8B5CF6"; }
// config LOCAL-ONLY: segredos + config de máquina que NUNCA vêm do repo/backup.
// Ao aplicar estado que ENTRA (pull/restore/import) apagamos qualquer versão injetada
// ANTES de restaurar a local — senão um mcpUrl/providers plantado no state.json
// sobreviveria quando o valor local é indefinido e vazaria o token pro domínio do atacante.
const LOCAL_ONLY_SETTINGS=["githubToken","providers","mcpUrl","dock"];
function scrubIncomingSettings(db){ if(db&&db.settings) for(const k of LOCAL_ONLY_SETTINGS) delete db.settings[k]; return db; }
/* aplica um DB que ENTRA (pull/restore/import) preservando o que é LOCAL deste navegador.
   Ponto ÚNICO do ritual keep→migrate→scrub→restore: essa lógica já esteve copiada em 3
   lugares e uma cópia divergiu (o furo F2 de exfiltração do mcpUrl) — não duplicar de novo. */
function applyIncomingState(db){
  const local=(DB.settings||{});
  const keep={ githubToken:local.githubToken, stateRepo:local.stateRepo,
               providers:local.providers, mcpUrl:local.mcpUrl, dock:local.dock };
  DB=migrate(db);
  DB.settings=DB.settings||{};
  scrubIncomingSettings(DB);   // remoto/backup/versão antiga nunca injeta config local-only
  if(keep.githubToken) DB.settings.githubToken=keep.githubToken;
  if(keep.stateRepo) DB.settings.stateRepo=keep.stateRepo;
  if(keep.providers!==undefined) DB.settings.providers=keep.providers;
  if(keep.mcpUrl!==undefined) DB.settings.mcpUrl=keep.mcpUrl;
  if(keep.dock!==undefined) DB.settings.dock=keep.dock;
}
function hardenDB(db){
  if(!db || !Array.isArray(db.companies)) return db;
  for(const c of db.companies){
    c.id=safeId(c.id); if("img" in c) c.img=safeImg(c.img); c.x=safeCoord(c.x); c.y=safeCoord(c.y);
    c.color=safeColor(c.color);
    if(!Array.isArray(c.projects)) c.projects=[];
    for(const p of c.projects){
      p.id=safeId(p.id); if("img" in p) p.img=safeImg(p.img); p.x=safeCoord(p.x); p.y=safeCoord(p.y);
      p.status=NODE_STATUS.indexOf(p.status)>=0?p.status:"ativo";                 // enum → some XSS via ${status}
      if("github" in p) p.github=safeRepo(p.github);                              // owner/repo estrito → sem `../`
      if(Array.isArray(p.apps)) for(const a of p.apps){ a.id=safeId(a.id); a.x=safeCoord(a.x); a.y=safeCoord(a.y); }
      if(Array.isArray(p.chats)) for(const ch of p.chats) ch.id=safeId(ch.id);
      if(Array.isArray(p.todos)) for(const t of p.todos){
        t.prio=TODO_PRIOS.indexOf(t.prio)>=0?t.prio:undefined;                    // enum → some injeção em class="tb-${prio}"
        if(t.due!=null && !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) t.due=undefined;
      }
    }
  }
  if(db.settings && Array.isArray(db.settings.providers)) for(const pr of db.settings.providers) pr.id=safeId(pr.id);
  if(Array.isArray(db.links)) for(const l of db.links){ l.id=safeId(l.id); if(typeof l.type!=="string") l.type="relacionado"; }
  // recentPids são REFERÊNCIAS a ids: mantém só as que batem o padrão seguro (dangling some no render)
  if(db.settings && Array.isArray(db.settings.recentPids)) db.settings.recentPids=db.settings.recentPids.filter(x=>typeof x==="string" && /^[A-Za-z0-9_-]{1,40}$/.test(x));
  return db;
}
function migrate(db){
  // v4 (02/07): identidade da Blockyfy — desc "Estúdio de Games" + logos em
  // assets/ pros nós da Blockyfy e do Dragon Block Galactic.
  if((db.version||3) < 4){
    const b=db.companies.find(c=>c.id==="blockyfy");
    if(b){
      b.desc="Estúdio de Games"; b.color="#59d99d";
      b.img="assets/blockyfy_logo.png"; b.imgFit="cover";
      const p=b.projects.find(x=>x.id==="dragon-block-galactic");
      if(p){ p.img="assets/dbg_logo.png"; p.imgFit="contain"; }
    }
    db.version=4;
  }
  // v5 (02/07): IA — contas/provedores, chats por projeto e memória de projeto.
  if(db.version < 5){
    db.settings = db.settings || {};
    db.settings.providers = db.settings.providers || [];
    db.companies.forEach(c=>c.projects.forEach(p=>{
      p.chats = p.chats || [];
      p.context = p.context || "";
    }));
    db.version=5;
  }
  // v6 (04/07): grafo de conhecimento — relações tipadas entre nós (empresa/projeto/serviço)
  if(db.version < 6){
    db.links = db.links || [];
    db.version=6;
  }
  return hardenDB(db); // toda entrada (load/pull) passa pela higiene
}
function load(){
  try{ const raw=localStorage.getItem(LS_KEY); if(raw) return migrate(JSON.parse(raw)); }catch(e){}
  return migrate(JSON.parse(JSON.stringify(SEED)));
}
function save(){
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
  localStorage.setItem(LS_KEY+"-cam", JSON.stringify(cam));
  localStorage.setItem(LS_KEY+"-exp", JSON.stringify([...expanded]));
  if(typeof scheduleStatePush==="function") scheduleStatePush();
}
// só a VISÃO (câmera/expandidos) — não toca no DB nem dispara sync remoto
function saveView(){
  localStorage.setItem(LS_KEY+"-cam", JSON.stringify(cam));
  localStorage.setItem(LS_KEY+"-exp", JSON.stringify([...expanded]));
}
const esc=s=>(s??"").toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const pjCost=p=>p.apps.reduce((s,a)=>s+(parseFloat(a.cost)||0),0);
const coCost=c=>c.projects.reduce((s,p)=>s+pjCost(p),0);

