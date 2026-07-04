/* ===== ⌨️ command palette (Ctrl+K): AÇÕES + busca em empresas/projetos/pendências/… ===== */
function snippet(text,q){ const i=(text||"").toLowerCase().indexOf(q); if(i<0) return ""; return "…"+(text.slice(Math.max(0,i-24), i+46)).replace(/\s+/g," ").trim()+"…"; }
const COMMANDS=[
  {icon:"🏢", label:"Nova empresa", kw:"criar company adicionar", run:()=>openCoModal()},
  {icon:"📅", label:"Agenda de prazos", kw:"deadline vencidas prazo pendencias", run:()=>openAgenda()},
  {icon:"🧠", label:"Perguntar à brain (busca semântica)", kw:"buscar semantica pergunta significado embeddings rag", run:()=>openAsk()},
  {icon:"💡", label:"Sugerir relações (por semântica)", kw:"grafo conexao descobrir relacao sugestao proximidade", run:()=>openSuggest()},
  {icon:"🎛", label:"Cockpit", kw:"dashboard painel geral visao", run:()=>openCockpit()},
  {icon:"📄", label:"Relatório da workspace", kw:"report export markdown status", run:()=>exportReport()},
  {icon:"🗂", label:"Trocar / criar workspace", kw:"workspace repo mudar", run:()=>openWsModal()},
  {icon:"🕘", label:"Histórico da workspace", kw:"rollback versao snapshot voltar", run:()=>openHistory()},
  {icon:"👥", label:"Membros da workspace", kw:"time equipe convidar colaborador", run:()=>{ openAiModal(); switchAccTab("membros"); }},
  {icon:"🤖", label:"Conectar uma IA", kw:"mcp claude chatgpt conector cursor", run:()=>{ openAiModal(); switchAccTab("ias"); }},
  {icon:"⚙", label:"Conta & Workspace", kw:"settings config token login sair", run:()=>openAiModal()},
  {icon:"🌗", label:"Alternar tema (claro/escuro)", kw:"dark light theme modo", run:()=>toggleTheme()},
  {icon:"🧠", label:"Conectar cérebro (pasta local)", kw:"brain sync pasta", run:()=>connectBrainClick()},
  {icon:"⬇", label:"Backup dos dados", kw:"export json salvar", run:()=>exportData()},
];
function matchCommands(q){ return q ? COMMANDS.filter(c=>(c.label+" "+c.kw).toLowerCase().includes(q)) : COMMANDS.slice(0,6); }
function cmdRun(i){ const c=COMMANDS[i]; if(!c) return; closeMore&&closeMore(); closeModals(); c.run(); }
function openSearch(){
  document.getElementById("searchModal").classList.add("open");
  const inp=document.getElementById("searchInput"); inp.value=""; runSearch();
  setTimeout(()=>inp.focus(), 30);
}
function runSearch(){
  const q=(document.getElementById("searchInput").value||"").trim().toLowerCase();
  const box=document.getElementById("searchResults"); if(!box) return;
  const cmds=matchCommands(q);
  const hit=s=>(s||"").toLowerCase().includes(q), res=[];
  if(q.length>=2) for(const c of DB.companies){
    if(hit(c.name)||hit(c.desc)) res.push({id:c.id, icon:c.emoji||"🏢", title:c.name, sub:"empresa"+(c.desc?" · "+c.desc:"")});
    for(const p of c.projects){
      if(hit(p.name)||hit(p.desc)||hit(p.github)) res.push({id:p.id, icon:p.emoji||"🚀", title:p.name, sub:"projeto · "+c.name+(p.github?" · "+p.github:"")});
      (p.todos||[]).forEach(t=>{ if(hit(t.t)||hit(t.owner)) res.push({id:p.id, icon:t.done?"✅":"⬜", title:(t.t||"").split("\n")[0].slice(0,90), sub:"pendência · "+p.name+(t.owner?" · @"+t.owner:"")+(t.due?" · 📅"+t.due:"")}); });
      (p.apps||[]).forEach(a=>{ if(hit(a.name)||hit(a.role)) res.push({id:a.id, icon:"🔌", title:a.name, sub:"serviço · "+p.name}); });
      if(hit(p.context)) res.push({id:p.id, icon:"🧠", title:"memória de "+p.name, sub:snippet(p.context,q)});
    }
  }
  let html="";
  if(cmds.length){
    html+=`<div class="agenda-h">⚡ Ações</div>`+cmds.map(c=>{ const i=COMMANDS.indexOf(c);
      return `<div class="mini-item" onclick="cmdRun(${i})"><span class="mi-emoji">${c.icon}</span><span style="flex:1;min-width:0"><b>${esc(c.label)}</b></span><span class="arrow">⏎</span></div>`;
    }).join("");
  }
  if(q.length<2 && !res.length){
    box.innerHTML=(cmds.length?html:"")+`<div class="empty-mini"><span class="ico">🔎</span>Rode uma ação acima, ou digite 2+ letras pra buscar empresas, projetos, pendências, serviços e memória.</div>`;
    return;
  }
  if(res.length){
    html+=`<div class="agenda-h">🔎 Resultados</div>`+res.slice(0,50).map(r=>`<div class="mini-item" onclick="searchGo('${r.id}')">
        <span class="mi-emoji">${esc(r.icon)}</span>
        <span style="flex:1;min-width:0"><b>${esc(r.title)}</b><br><span style="font-size:11px;color:var(--tx3)">${esc(r.sub)}</span></span>
        <span class="arrow">→</span></div>`).join("")+(res.length>50?`<div class="dr-desc" style="color:var(--tx3);margin-top:6px">+${res.length-50} resultado(s)…</div>`:"");
  } else if(!cmds.length){
    html=`<div class="empty-mini"><span class="ico">🫥</span>Nada encontrado pra "<b>${esc(q)}</b>".</div>`;
  }
  box.innerHTML=html;
}
function searchGo(id){ closeModals(); jumpTo(id); }
document.addEventListener("keydown",e=>{ if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); openSearch(); } });

