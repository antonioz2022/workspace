/* ===== Etapa E: 🎛 Cockpit — todos os projetos num relance ===== */
function cockpitRows(){
  const rows=[];
  for(const c of DB.companies) for(const p of c.projects){
    const t=teleCache[p.id];
    const open=(p.todos||[]).filter(x=>!x.done).length;
    const alerts=(p.apps||[]).filter(a=>a.alert).length
      + (p.apps||[]).filter(a=>a.health && pingCache[a.id] && pingCache[a.id].cls==="bad").length;
    const commitTs=t&&t.git?t.git.ts:null;
    const staleDays=commitTs?(Date.now()-commitTs)/86400000:null;
    const memStale=!!(memSyncCache[p.id]&&memSyncCache[p.id].stale);
    const score=alerts*3 + open + (staleDays!==null&&staleDays>7?2:0) + (memStale?2:0) + (p.status==="ativo"?0:-1);
    rows.push({c,p,t,open,alerts,commitTs,memStale,score});
  }
  return rows.sort((a,b)=>b.score-a.score);
}
function renderCockpit(){
  const el=document.getElementById("cockpitBody"); if(!el) return;
  const rows=cockpitRows();
  const totCost=DB.companies.reduce((s,c)=>s+coCost(c),0);
  el.innerHTML=`
    <div id="ckWatchdog" style="font-size:12px;color:var(--tx3);margin-bottom:8px">🛰 vigia: …</div>
    <div class="chips" style="margin-bottom:12px">
      <span class="chip">${rows.length} projeto(s)</span>
      <span class="chip">${rows.reduce((s,r)=>s+r.open,0)} pendência(s) aberta(s)</span>
      ${rows.some(r=>r.t&&r.t.repo)?`<span class="chip">🐛 ${rows.reduce((s,r)=>s+((r.t&&r.t.repo)?r.t.repo.openIssues:0),0)} issues+PRs</span>`:""}
      ${(function(){const n=overdueCount(); return n?`<span class="chip" style="color:var(--bad)" onclick="closeModals();openAgenda()" title="ver na Agenda">📅 ${n} vencida(s)</span>`:"";})()}
      ${(function(){const n=rows.filter(r=>r.memStale).length; return n?`<span class="chip" style="color:var(--warn)" title="projetos com commits novos no repo desde a última atualização da memória — abra o projeto e gere o contexto pra IA">🧠 ${n} memória(s) defasada(s)</span>`:"";})()}
      <span class="chip" style="color:${rows.some(r=>r.alerts)?'var(--warn)':'var(--ok)'}">${rows.reduce((s,r)=>s+r.alerts,0)} alerta(s)</span>
      <span class="chip cost">~US$ ${totCost.toFixed(0)}/mês</span>
    </div>
    ${rows.length ? rows.map(r=>{
      const dot=r.alerts>0?"🔴":(r.open>0?"🟡":"🟢");
      const commit=r.commitTs?`último commit ${agoStr(r.commitTs)}`:(r.t?"sem git":"telemetria não lida");
      const src=r.t?(r.t.source==="github"?"☁":"📁"):"";
      const gh=(r.t&&r.t.repo)?` · 🐛 ${r.t.repo.openIssues}${(r.t.prs&&r.t.prs.length)?` · 🔀 ${r.t.prs.length}`:""}${r.t.repo.lang?` · ${esc(r.t.repo.lang)}`:""}`:"";
      const st=r.p.status&&r.p.status!=="ativo"?` <span class="chip" style="padding:1px 7px;font-size:10px">${r.p.status==="pausado"?"🟡 pausado":"⚪ concluído"}</span>`:"";
      return `<div class="mini-item" onclick="closeModals();jumpTo('${r.p.id}')">
        <span class="mi-emoji">${r.p.img?`<img src="${esc(r.p.img)}" style="width:26px;height:26px;object-fit:contain;vertical-align:middle">`:esc(r.p.emoji||"🚀")}</span>
        <span style="flex:1;min-width:0">
          <b>${esc(r.p.name)}</b> <span style="color:var(--tx3);font-size:11px">· ${esc(r.c.name)}</span>${st}<br>
          <span style="font-size:11.5px;color:var(--tx2)">${dot} ${r.open} pendência(s) · ${r.alerts} alerta(s) · ${commit} ${src}${gh} · ~US$ ${pjCost(r.p).toFixed(0)}/mês${r.memStale?' · <span style="color:var(--warn)">🧠 memória defasada</span>':''}</span>
        </span>
        <span class="arrow">→</span>
      </div>`;
    }).join("") : `<div class="empty-mini"><span class="ico">🗺️</span>Sem projetos ainda. Crie uma empresa e um projeto no mapa pra ver tudo agregado aqui: pendências, alertas, commits e custo.</div>`}
    <div id="ckFeed"></div>`;
}

/* ===== 📅 Agenda de prazos: pendências abertas COM data, agrupadas por urgência ===== */
function daysUntil(due){ const d=new Date(due+"T00:00:00"), t=new Date(todayStr()+"T00:00:00"); return Math.round((d-t)/86400000); }
function dueLabel(due){ const n=daysUntil(due);
  if(n<0) return n===-1?"venceu ontem":"venceu há "+(-n)+" dias";
  if(n===0) return "vence hoje"; if(n===1) return "vence amanhã"; if(n<=7) return "vence em "+n+" dias";
  return "vence em "+Math.round(n/7)+" sem"; }
function agendaItems(){
  const items=[];
  for(const c of DB.companies) for(const p of c.projects) (p.todos||[]).forEach(t=>{
    if(t.done || !/^\d{4}-\d{2}-\d{2}$/.test(t.due||"")) return;
    items.push({due:t.due, prio:t.prio, owner:t.owner, text:(t.t||"").split("\n")[0], pjId:p.id, pjName:p.name, coName:c.name});
  });
  const po={alta:0,media:1,baixa:2};
  items.sort((a,b)=> a.due.localeCompare(b.due) || (po[a.prio]!=null?po[a.prio]:9)-(po[b.prio]!=null?po[b.prio]:9));
  return items;
}
function overdueCount(){ const today=todayStr(); return agendaItems().filter(i=>i.due<today).length; }
function openAgenda(){ renderAgenda(); document.getElementById("agendaModal").classList.add("open"); }
function agendaGo(pjId){ closeModals(); jumpTo(pjId); }
function renderAgenda(){
  const box=document.getElementById("agendaBody"); if(!box) return;
  const items=agendaItems(), today=todayStr();
  if(!items.length){ box.innerHTML=`<div class="empty-mini"><span class="ico">📅</span>Nenhuma pendência com prazo ainda. Coloque uma data (📅) nas pendências e elas aparecem aqui, ordenadas por urgência.</div>`; return; }
  const groups=[
    {label:"⚠️ Vencidas", cls:"agr-over", test:i=>i.due<today},
    {label:"🔥 Hoje", test:i=>i.due===today},
    {label:"🗓️ Próximos 7 dias", test:i=>{const n=daysUntil(i.due); return n>0&&n<=7;}},
    {label:"🌤️ Depois", test:i=>daysUntil(i.due)>7},
  ];
  let html="";
  for(const g of groups){
    const gi=items.filter(g.test); if(!gi.length) continue;
    html+=`<div class="agenda-h ${g.cls||""}">${g.label} <span class="n">${gi.length}</span></div>`;
    html+=gi.map(i=>{
      const over=i.due<today;
      const prioB=i.prio?`<span class="tb tb-${i.prio}">${prioMark[i.prio]||""} ${prioName[i.prio]||""}</span>`:"";
      const ownerB=i.owner?`<span class="tb">@${esc(i.owner)}</span>`:"";
      return `<div class="mini-item" onclick="agendaGo('${i.pjId}')">
        <span class="mi-emoji">${over?"🔴":"📅"}</span>
        <span style="flex:1;min-width:0">
          <b style="font-size:13px">${esc(i.text)}</b>${prioB}${ownerB}<br>
          <span style="font-size:11px;color:var(--tx3)">${esc(i.pjName)} · ${esc(i.coName)} · <span style="color:${over?"var(--bad)":"var(--tx2)"}">${esc(i.due)} (${esc(dueLabel(i.due))})</span></span>
        </span>
        <span class="arrow">→</span>
      </div>`;
    }).join("");
  }
  box.innerHTML=html;
}

/* ===== 📄 Relatório (status em markdown) — projeto ou workspace inteira ===== */
function pjOverdue(p){ const t=todayStr(); return (p.todos||[]).filter(x=>!x.done && /^\d{4}-\d{2}-\d{2}$/.test(x.due||"") && x.due<t).length; }
function reportTodoLine(t){
  const meta=(t.prio?` \`${prioName[t.prio]||t.prio}\``:"")+(t.owner?` @${t.owner}`:"")+(t.due?` 📅${t.due} (${dueLabel(t.due)})`:"");
  return `- [${t.done?"x":" "}] ${(t.t||"").split("\n")[0]}${meta}`;
}
function genProjectReport(c,p){
  const open=(p.todos||[]).filter(t=>!t.done), done=(p.todos||[]).filter(t=>t.done);
  let s=`# 📋 Relatório — ${p.name}\n_${c.name} · ${p.status||"ativo"} · gerado em ${nowStr()}_\n\n`;
  if(p.desc) s+=`${p.desc}\n\n`;
  s+=`## Resumo\n- **Serviços:** ${(p.apps||[]).length} (~US$ ${pjCost(p).toFixed(0)}/mês)\n`;
  s+=`- **Pendências:** ${open.length} abertas de ${(p.todos||[]).length}${pjOverdue(p)?` (**${pjOverdue(p)} vencidas**)`:""}\n`;
  if(p.github) s+=`- **GitHub:** \`${p.github}\`\n`;
  if(p.local) s+=`- **Pasta local:** \`${p.local}\`\n`;
  if(open.length) s+=`\n## Pendências abertas\n`+open.map(reportTodoLine).join("\n")+"\n";
  if((p.apps||[]).length) s+=`\n## Serviços\n`+p.apps.map(a=>`- **${a.name}**${a.role?` — ${a.role}`:""}${a.plan?` · ${a.plan}`:""}${(parseFloat(a.cost)||0)>0?` · ~US$ ${parseFloat(a.cost).toFixed(0)}/mês`:" · grátis"}${a.url?` · ${a.url}`:""}`).join("\n")+"\n";
  if(p.context) s+=`\n## Memória\n${p.context.trim()}\n`;
  if(done.length) s+=`\n## Concluídas (${done.length})\n`+done.slice(-12).map(reportTodoLine).join("\n")+"\n";
  return s;
}
function genWorkspaceReport(){
  const totPj=DB.companies.reduce((s,c)=>s+c.projects.length,0);
  const totCost=DB.companies.reduce((s,c)=>s+coCost(c),0);
  const openTot=DB.companies.reduce((s,c)=>s+c.projects.reduce((q,p)=>q+(p.todos||[]).filter(t=>!t.done).length,0),0);
  const overTot=overdueCount();
  let s=`# 📊 Relatório da workspace\n_gerado em ${nowStr()}_\n\n`;
  s+=`**${DB.companies.length}** empresa(s) · **${totPj}** projeto(s) · **~US$ ${totCost.toFixed(0)}/mês** · **${openTot}** pendência(s) aberta(s)${overTot?` · **${overTot} vencida(s)**`:""}\n\n`;
  for(const c of DB.companies){
    s+=`## ${c.emoji||"🏢"} ${c.name}${c.desc?` — ${c.desc}`:""}\n`;
    if(!c.projects.length){ s+=`_(sem projetos)_\n\n`; continue; }
    for(const p of c.projects){
      const open=(p.todos||[]).filter(t=>!t.done).length, ov=pjOverdue(p);
      s+=`- **${p.name}** (${p.status||"ativo"}) — ${open}/${(p.todos||[]).length} pendências${ov?` · ${ov} vencidas`:""} · ${(p.apps||[]).length} serviços · ~US$ ${pjCost(p).toFixed(0)}/mês${p.github?` · \`${p.github}\``:""}\n`;
    }
    s+="\n";
  }
  return s;
}
function nowStr(){ const d=new Date(); const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function exportReport(){ downloadFile(`cortex-relatorio-${todayStr()}.md`, genWorkspaceReport(), "text/markdown;charset=utf-8"); if(typeof uiToast==="function") uiToast("Relatório da workspace baixado (.md).","ok"); }
function exportProjectReport(pid){ const f=findNode(pid); if(!f||f.type!=="pj") return; downloadFile(`relatorio-${slug(f.pj.name)}-${todayStr()}.md`, genProjectReport(f.co,f.pj), "text/markdown;charset=utf-8"); if(typeof uiToast==="function") uiToast("Relatório do projeto baixado (.md).","ok"); }

/* ===== 📜 Feed de atividade — commits da brain traduzidos pra gente ===== */
function feedLabel(msg){
  const via=/via MCP/i.test(msg);
  const tail=esc((msg.split("—").slice(1).join("—")||"").trim());
  const who=via?" · 🤖 IA (MCP)":"";
  if(/^brain: mem/i.test(msg)) return `🧠 memória${tail?" de "+tail:""}${who}`;
  if(/^brain: pend/i.test(msg)) return `✅ pendências${tail?" de "+tail:""}${who}`;
  if(/^brain: projeto/i.test(msg)) return `📋 cartão${tail?" de "+tail:""}`;
  if(/^brain: empresa/i.test(msg)) return `🏢 empresa${tail?" "+tail:""}`;
  if(/^brain: arquivo/i.test(msg)) return `🎨 arquivo${tail?" "+tail:""}`;
  if(/^brain: remove/i.test(msg)) return `🗑 removido${tail?" "+tail:""}`;
  if(/^brain: INDEX/i.test(msg)) return "🗺 INDEX atualizado";
  if(/^workspace: sync de estado/i.test(msg)) return "💾 estado do painel";
  return "• "+esc(msg.slice(0,80));
}
async function renderActivityFeed(){
  const host=document.getElementById("ckFeed"); if(!host) return;
  if(!(DB.settings||{}).githubToken || !stateRepo()){ host.innerHTML=""; return; }
  try{
    const j=await ghGet(`/repos/${stateRepo()}/commits?per_page=25`);
    const items=(Array.isArray(j)?j:[]).map(c=>({
      msg:((c.commit&&c.commit.message)||"").split("\n")[0],
      date:(c.commit&&c.commit.author&&c.commit.author.date)?Date.parse(c.commit.author.date):null
    }));
    const rows=[]; let prev=null;
    for(const it of items){
      const label=feedLabel(it.msg);
      if(prev && prev.label===label){ prev.count++; continue; }
      prev={label, date:it.date, count:1}; rows.push(prev);
    }
    host.innerHTML=rows.length?`<div class="dr-sec" style="margin-top:14px">📜 Atividade recente na brain</div>`+
      rows.slice(0,12).map(r=>`<div style="font-size:12px;color:var(--tx2);padding:3px 0">${r.label}${r.count>1?` <span style="color:var(--tx3)">×${r.count}</span>`:""} <span style="color:var(--tx3)">· ${r.date?agoStr(r.date):""}</span></div>`).join(""):"";
  }catch(e){ host.innerHTML=""; }
}
