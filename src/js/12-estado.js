/* ================= estado ================= */
const LS_KEY = "workspace-map-v3";
let DB = load();
let cam = JSON.parse(localStorage.getItem(LS_KEY+"-cam") || "null") || {x:0, y:0, z:1};
let expanded = new Set(JSON.parse(localStorage.getItem(LS_KEY+"-exp") || "[]"));
let sel = null;           // {type:'co'|'pj'|'ap', co, pj, ap}
let editingCo=null, editingPj=null, editingApp=null;
const pingCache = {};     // id -> {cls, txt}

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
  return db;
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
const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>(s??"").toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const pjCost=p=>p.apps.reduce((s,a)=>s+(parseFloat(a.cost)||0),0);
const coCost=c=>c.projects.reduce((s,p)=>s+pjCost(p),0);

