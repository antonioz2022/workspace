/* ============ auto-refresh no foco + auto-ping (só fatos, nunca IA) ============ */
let _autoBusy=false;
async function autoRefreshAll(force){
  if(_autoBusy) return; _autoBusy=true;
  try{
    if(stateSyncOn()) await pullState().catch(()=>{});
    for(const c of DB.companies) for(const p of c.projects){
      try{ const dir=await getProjDir(p.id,{prompt:false}); if(dir) await refreshProjectTelemetry(p); }catch(e){}
    }
    if(sel) paintTele(sel.id, teleCache[sel.id]?"ready":"none");
    for(const c of DB.companies) for(const p of c.projects) for(const a of p.apps){
      if(a.health){ if(force && pingCache[a.id]) pingCache[a.id].fresh=false; ping(a, true); }   // auto: pula host privado (SSRF)
    }
  }finally{ _autoBusy=false; }
}
function onAppFocus(){ autoRefreshAll(false); if(stateSyncOn()) pullState({force:false}).catch(()=>{}); }
window.addEventListener("focus", onAppFocus);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") onAppFocus(); });
setInterval(()=>{ if(document.visibilityState==="visible") autoRefreshAll(true); }, 5*60*1000);

/* ================= go ================= */
applyTheme(localStorage.getItem(LS_KEY+"-theme")==="light"?"light":"dark"); // sincroniza rótulo do menu + meta theme-color
render();
initDock();
wsBoot();
if(!localStorage.getItem(LS_KEY+"-cam")) fitView();
ensureBrain();
if(typeof renderResumeBanner==="function") renderResumeBanner();   // ▶ Retomar (recência local; re-renderiza após o pull)
if(stateSyncOn()) setTimeout(()=>{ pullState().catch(()=>{}).then(()=>{
  if(typeof renderResumeBanner==="function") renderResumeBanner();
  // rascunho automático: depois do pull (estado fresco de outros aparelhos), commits sem checkpoint viram sessão sozinhos
  if(typeof memAutoDraftSweep==="function") setTimeout(()=>memAutoDraftSweep().catch(()=>{}), 2500);
}); }, 600);
if(typeof startCollabPoll==="function") startCollabPoll();   // colaboração viva: avisa quando alguém atualiza
{ const d=patDays(); const b=document.getElementById("contasBtn"); if(b && d!==null && d<10) b.textContent="⚙ Contas ⚠"; }
// PWA: registra o service worker (só quando servido por http/https; abrir de file:// segue funcionando)
if("serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}
