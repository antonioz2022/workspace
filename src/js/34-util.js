/* ================= util ================= */
function closeModals(){ document.querySelectorAll(".overlay").forEach(o=>o.classList.remove("open")); }
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{ if(e.target===o) closeModals(); }));
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){ closeModals(); closeDrawer(); if(typeof closeMore==="function") closeMore(); } });

/* menu "⋯ Mais" da barra superior (ações secundárias: cérebro, cockpit, backup, restaurar) */
function toggleMore(e){ if(e) e.stopPropagation(); const m=document.getElementById("moreMenu"), b=document.getElementById("moreBtn");
  const open=m.classList.toggle("show"); if(b) b.setAttribute("aria-expanded", open?"true":"false"); }
function closeMore(){ const m=document.getElementById("moreMenu"); if(m) m.classList.remove("show");
  const b=document.getElementById("moreBtn"); if(b) b.setAttribute("aria-expanded","false"); }
document.addEventListener("click",e=>{ if(!(e.target.closest&&e.target.closest(".more-wrap"))) closeMore(); });

/* tema claro/escuro (preferência LOCAL por navegador, como a câmera) */
function applyTheme(t){
  const light = t==="light";
  document.documentElement.setAttribute("data-theme", light?"light":"dark");
  const lbl=document.getElementById("themeToggle"); if(lbl) lbl.textContent = light?"🌙 Tema escuro":"☀️ Tema claro";
  const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.setAttribute("content", light?"#F4F3FB":"#0B0A12");
}
function toggleTheme(){
  const next = document.documentElement.getAttribute("data-theme")==="light" ? "dark" : "light";
  applyTheme(next); localStorage.setItem(LS_KEY+"-theme", next);
}

function downloadFile(name, text, mime){
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type:mime||"text/plain;charset=utf-8"}));
  a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
function exportData(){
  // NÃO exporta segredos: token do GitHub, chaves de IA, mcpUrl e histórico do dock ficam de fora
  const clean = (typeof sanitizeStateForSync==="function") ? sanitizeStateForSync() : DB;
  const blob=new Blob([JSON.stringify(clean,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="workspace-dados.json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  if(typeof uiToast==="function") uiToast("Backup salvo. Por segurança, o token do GitHub e as chaves de IA não vão no arquivo.","ok");
}
function importData(ev){
  const f=ev.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{
    const d=JSON.parse(r.result);
    if(!d || !Array.isArray(d.companies)) throw new Error("formato inválido");
    // backup = conteúdo de MENOR confiança: normaliza+higieniza (migrate→hardenDB: IDs/img)
    // e preserva os segredos LOCAIS deste navegador (um backup legítimo não os traz;
    // um malicioso não pode injetar mcpUrl/providers/token e vazar a chave)
    const local=(DB.settings||{}), keepTok=local.githubToken, keepRepo=local.stateRepo,
          keepProv=local.providers, keepMcp=local.mcpUrl, keepDock=local.dock;
    DB=migrate(d); DB.settings=DB.settings||{};
    scrubIncomingSettings(DB);
    if(keepTok)DB.settings.githubToken=keepTok; if(keepRepo)DB.settings.stateRepo=keepRepo;
    if(keepProv!==undefined)DB.settings.providers=keepProv;
    if(keepMcp!==undefined)DB.settings.mcpUrl=keepMcp;
    if(keepDock!==undefined)DB.settings.dock=keepDock;
    expanded=new Set(); save(); render(); fitView();
  }catch(e){ alert("Arquivo inválido: "+e.message);} };
  r.readAsText(f); ev.target.value="";
}

