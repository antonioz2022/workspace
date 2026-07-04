/* ===== ▶ Retomar / "onde você parou" — AUTO-derivado (zero digitação por padrão) =====
   Norte do Córtex: retomar em qualquer aparelho/conta como se nunca tivesse trocado. Isto
   monta SOZINHO o "onde parei" de cada projeto a partir do que o sistema já sabe — último
   commit, branch de trabalho, PR aberto, pendência mais urgente e frescor da memória. O
   foco manual (`p.focus`) é OPCIONAL: se existir vira o título; senão o auto-derivado vale.
   `DB.settings.recentPids` (sincroniza) guarda os projetos tocados por último → num aparelho
   NOVO o app já abre sugerindo "retomar em X". Interação é opção, não requisito. */
function pjOpenTodosSorted(p){
  const open=(p.todos||[]).filter(x=>!x.done), today=todayStr(), po={alta:0,media:1,baixa:2};
  return open.slice().sort((a,b)=>{
    const ao=(a.due&&a.due<today)?0:1, bo=(b.due&&b.due<today)?0:1;
    if(ao!==bo) return ao-bo;                                   // vencidas primeiro
    if((a.due||"")!==(b.due||"")) return (a.due||"9999-99-99").localeCompare(b.due||"9999-99-99");
    return (po[a.prio]!=null?po[a.prio]:9)-(po[b.prio]!=null?po[b.prio]:9);
  });
}
// canal frictionless pra IA: se a memória começa com "Onde parei:"/"Foco atual:", usa a linha
function focusFromContext(ctx){
  const m=(ctx||"").match(/^(?:#+\s*)?(?:🎯\s*)?(?:onde parei|foco atual)\s*[:\-]\s*(.+)$/im);
  return m?m[1].trim().slice(0,160):"";
}
function projFocus(p){ return ((p.focus||"").trim()) || focusFromContext(p.context); }
function resumeState(p){
  const t=teleCache[p.id]||{}, lines=[];
  if(t.git && t.git.ts) lines.push(`⎇ último commit ${agoStr(t.git.ts)}${t.git.msg?": "+t.git.msg.slice(0,72):""}`);
  if(t.git && t.git.branch && t.repo && t.repo.defBranch && t.git.branch!==t.repo.defBranch) lines.push(`🌿 na branch ${t.git.branch} (trabalho em progresso)`);
  if(t.prs && t.prs.length) lines.push(`🔀 PR aberto #${t.prs[0].num} ${(t.prs[0].title||"").slice(0,56)}`);
  const open=pjOpenTodosSorted(p);
  if(open.length){ const n=open[0]; lines.push(`◻ próximo: ${(n.t||"").split("\n")[0].slice(0,72)}${n.due?` (📅 ${n.due})`:""}`); if(open.length>1) lines.push(`… +${open.length-1} pendência(s) aberta(s)`); }
  const ms=(typeof memSyncCache!=="undefined"?memSyncCache[p.id]:null);
  if(ms && ms.stale) lines.push(`⚠ memória pode estar defasada (${ms.count>=20?"20+":ms.count} commit(s) desde a última atualização)`);
  const foco=projFocus(p);
  const headline = foco || (t.git&&t.git.msg?`mexendo em: ${t.git.msg.slice(0,64)}` : (open.length?`próximo: ${(open[0].t||"").split("\n")[0].slice(0,64)}`:"sem sinais recentes de trabalho"));
  return {headline, lines, foco};
}
/* bloco no topo do drawer do projeto */
function resumeBlockHtml(p){
  const r=resumeState(p);
  return `<div style="background:linear-gradient(180deg,rgba(139,92,246,.10),rgba(139,92,246,.03));border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:0 0 12px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-weight:700;font-size:11px;color:var(--ac2);letter-spacing:.03em">▶ ONDE VOCÊ PAROU</span>
      <span style="display:flex;gap:6px">
        <button class="btn sm ghost" style="padding:2px 8px" onclick="saveProgress('${p.id}')" title="grava um checkpoint do progresso na memória, com 1 clique — sem depender de IA">💾 Salvar</button>
        <button class="btn sm ghost" style="padding:2px 8px" onclick="editFocus('${p.id}')" title="definir um foco manual (opcional) — some se deixar vazio">${r.foco?"✎":"＋ foco"}</button>
      </span>
    </div>
    <div style="font-size:13px;color:var(--tx);margin:5px 0 ${r.lines.length?"6px":"0"};font-weight:${r.foco?"600":"400"}">${r.foco?"🎯 ":""}${esc(r.headline)}</div>
    ${r.lines.length?`<div style="font-size:11.5px;color:var(--tx3);display:flex;flex-direction:column;gap:2px">${r.lines.map(l=>`<span>${esc(l)}</span>`).join("")}</div>`:""}
  </div>`;
}
/* 💾 Salvar progresso: 1 clique grava um checkpoint na memória do projeto (MESMO formato da
   tool MCP checkpoint) — SEM depender de IA. Pega o "onde parei" auto-derivado + nota opcional. */
function memInsertSession(p, sessionBody, nextLine){
  // cirurgia compartilhada (💾 Salvar e rascunho de commits): título → 🎯 novo → sessão datada → corpo
  const session=`## Sessão (${todayStr()})\n${sessionBody}\n`;
  let title=`# Memória — ${p.name}`, gotTitle=false; const rest=[];
  for(const ln of (p.context||"").split("\n")){
    if(!gotTitle && /^#\s+/.test(ln)){ title=ln.trim(); gotTitle=true; continue; }
    if(/^[*#\s]*(?:🎯\s*)?(?:onde parei|foco atual)\s*[:*\-]/i.test(ln)) continue;   // remove o "onde parei" antigo
    rest.push(ln);
  }
  const body=rest.join("\n").replace(/^\n+/,"");
  p.context=(`${title}\n\n🎯 Onde parei: ${nextLine.replace(/\s+/g," ").trim()}\n\n${session}\n${body}`).replace(/\n{3,}/g,"\n\n").replace(/\s+$/,"")+"\n";
  p.focus="";   // o "onde parei" agora vive na memória (linha 🎯) — evita fonte duplicada
}
function applyProgress(p, note){
  const r=resumeState(p);
  const nextLine=((note||"").trim()) || r.headline;
  const bodyLines=[]; if((note||"").trim()) bodyLines.push((note||"").trim());
  for(const l of r.lines) bodyLines.push("- "+l);
  memInsertSession(p, bodyLines.length?bodyLines.join("\n"):"(checkpoint manual)", nextLine);
}
async function saveProgress(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  const note=await uiPrompt({title:"💾 Salvar progresso", message:"O que você fez / onde parou? (opcional — vazio usa o resumo automático dos sinais)", value:"", placeholder:"ex.: terminei o webhook, falta testar com lead real", okLabel:"Salvar"});
  if(note===null) return;   // cancelou
  applyProgress(f.pj, note);
  f.pj._memDirty=true; save(); if(typeof scheduleSync==="function") scheduleSync();
  openDrawer(findNode(pid));
  if(typeof uiToast==="function") uiToast("Progresso salvo na memória — sincroniza com a brain; você retoma daqui em qualquer aparelho ou conta de IA.","ok");
}
function editFocus(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  uiPrompt({title:"🎯 Foco atual (opcional)", message:"Uma linha: o que está fazendo / onde parou / próximo passo. Deixe vazio pra voltar ao automático.", value:f.pj.focus||"", placeholder:"ex.: implementei o webhook, falta testar com lead real", okLabel:"Salvar"}).then(v=>{
    if(v===null) return; f.pj.focus=(v||"").trim(); f.pj._memDirty=true; save(); if(typeof scheduleSync==="function") scheduleSync(); openDrawer(findNode(pid));
  });
}
/* recência sincronizada: qual projeto foi tocado por último (pro banner cross-device) */
function markRecent(pid){
  const f=findNode(pid); if(!f) return;
  const target = (f.type==="pj"||f.type==="ap") ? f.pj.id : null;
  if(!target) return;
  DB.settings=DB.settings||{};
  DB.settings.recentPids=[target, ...((DB.settings.recentPids||[]).filter(x=>x!==target))].slice(0,6);
}
/* banner de boot: "▶ Retomar em X" — aparece sozinho no aparelho novo (recentPids sincroniza) */
let resumeDismissed=false;
function renderResumeBanner(){
  const el=document.getElementById("resumeBanner"); if(!el) return;
  const cb=document.getElementById("collabBanner");
  if(resumeDismissed || (cb && cb.classList.contains("show"))){ el.classList.remove("show"); return; }
  let f=null;
  for(const pid of (((DB.settings||{}).recentPids)||[])){ const n=findNode(pid); if(n&&n.type==="pj"){ f=n; break; } }
  if(!f){ el.classList.remove("show"); return; }
  const r=resumeState(f.pj);
  el.innerHTML=`<span style="min-width:0;flex:1"><b>▶ Retomar em ${esc(f.pj.name)}</b> <span style="color:var(--tx3)">· ${esc(f.co.name)}</span><br><span style="font-size:11.5px;color:var(--tx2)">${r.foco?"🎯 ":""}${esc(r.headline)}</span></span>
    <button class="btn sm primary" onclick="resumeGo('${f.pj.id}')">Abrir →</button>
    <button class="btn sm ghost" onclick="dismissResume()" title="ver depois">✕</button>`;
  el.classList.add("show");
}
function resumeGo(pid){ resumeDismissed=true; const el=document.getElementById("resumeBanner"); if(el) el.classList.remove("show"); jumpTo(pid); }
function dismissResume(){ resumeDismissed=true; const el=document.getElementById("resumeBanner"); if(el) el.classList.remove("show"); }
