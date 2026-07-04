/* ===== 🔎 busca global: empresas · projetos · pendências · serviços · memória ===== */
function snippet(text,q){ const i=(text||"").toLowerCase().indexOf(q); if(i<0) return ""; return "…"+(text.slice(Math.max(0,i-24), i+46)).replace(/\s+/g," ").trim()+"…"; }
function openSearch(){
  document.getElementById("searchModal").classList.add("open");
  const inp=document.getElementById("searchInput"); inp.value=""; runSearch(); // já mostra a dica de busca
  setTimeout(()=>inp.focus(), 30);
}
function runSearch(){
  const q=(document.getElementById("searchInput").value||"").trim().toLowerCase();
  const box=document.getElementById("searchResults"); if(!box) return;
  if(q.length<2){ box.innerHTML=`<div class="empty-mini"><span class="ico">🔎</span>Busque em empresas, projetos, pendências, serviços e memória. Digite ao menos 2 letras.</div>`; return; }
  const hit=s=>(s||"").toLowerCase().includes(q), res=[];
  for(const c of DB.companies){
    if(hit(c.name)||hit(c.desc)) res.push({id:c.id, icon:c.emoji||"🏢", title:c.name, sub:"empresa"+(c.desc?" · "+c.desc:"")});
    for(const p of c.projects){
      if(hit(p.name)||hit(p.desc)||hit(p.github)) res.push({id:p.id, icon:p.emoji||"🚀", title:p.name, sub:"projeto · "+c.name+(p.github?" · "+p.github:"")});
      (p.todos||[]).forEach(t=>{ if(hit(t.t)||hit(t.owner)) res.push({id:p.id, icon:t.done?"✅":"⬜", title:(t.t||"").split("\n")[0].slice(0,90), sub:"pendência · "+p.name+(t.owner?" · @"+t.owner:"")+(t.due?" · 📅"+t.due:"")}); });
      (p.apps||[]).forEach(a=>{ if(hit(a.name)||hit(a.role)) res.push({id:a.id, icon:"🔌", title:a.name, sub:"serviço · "+p.name}); });
      if(hit(p.context)) res.push({id:p.id, icon:"🧠", title:"memória de "+p.name, sub:snippet(p.context,q)});
    }
  }
  if(!res.length){ box.innerHTML=`<div class="empty-mini"><span class="ico">🫥</span>Nada encontrado pra "<b>${esc(q)}</b>".</div>`; return; }
  box.innerHTML = res.slice(0,50).map(r=>`<div class="mini-item" onclick="searchGo('${r.id}')">
      <span class="mi-emoji">${esc(r.icon)}</span>
      <span style="flex:1;min-width:0"><b>${esc(r.title)}</b><br><span style="font-size:11px;color:var(--tx3)">${esc(r.sub)}</span></span>
      <span class="arrow">→</span>
    </div>`).join("") + (res.length>50?`<div class="dr-desc" style="color:var(--tx3);margin-top:6px">+${res.length-50} resultado(s)…</div>`:"");
}
function searchGo(id){ closeModals(); jumpTo(id); }
document.addEventListener("keydown",e=>{ if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); openSearch(); } });

