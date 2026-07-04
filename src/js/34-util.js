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
    if(!d.companies) throw new Error("formato inválido");
    DB=d; expanded=new Set(); save(); render(); fitView();
  }catch(e){ alert("Arquivo inválido: "+e.message);} };
  r.readAsText(f); ev.target.value="";
}

