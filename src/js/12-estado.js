/* ================= estado ================= */
const LS_KEY = "workspace-map-v3";
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
// config LOCAL-ONLY: segredos + config de máquina que NUNCA vêm do repo/backup.
// Ao aplicar estado que ENTRA (pull/restore/import) apagamos qualquer versão injetada
// ANTES de restaurar a local — senão um mcpUrl/providers plantado no state.json
// sobreviveria quando o valor local é indefinido e vazaria o token pro domínio do atacante.
const LOCAL_ONLY_SETTINGS=["githubToken","providers","mcpUrl","dock"];
function scrubIncomingSettings(db){ if(db&&db.settings) for(const k of LOCAL_ONLY_SETTINGS) delete db.settings[k]; return db; }
function hardenDB(db){
  if(!db || !Array.isArray(db.companies)) return db;
  for(const c of db.companies){
    c.id=safeId(c.id); if("img" in c) c.img=safeImg(c.img);
    if(!Array.isArray(c.projects)) c.projects=[];
    for(const p of c.projects){
      p.id=safeId(p.id); if("img" in p) p.img=safeImg(p.img);
      if(Array.isArray(p.apps)) for(const a of p.apps) a.id=safeId(a.id);
      if(Array.isArray(p.chats)) for(const ch of p.chats) ch.id=safeId(ch.id);
    }
  }
  if(db.settings && Array.isArray(db.settings.providers)) for(const pr of db.settings.providers) pr.id=safeId(pr.id);
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

