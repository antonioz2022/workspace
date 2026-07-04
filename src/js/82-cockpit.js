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
    const score=alerts*3 + open + (staleDays!==null&&staleDays>7?2:0) + (p.status==="ativo"?0:-1);
    rows.push({c,p,t,open,alerts,commitTs,score});
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
          <span style="font-size:11.5px;color:var(--tx2)">${dot} ${r.open} pendência(s) · ${r.alerts} alerta(s) · ${commit} ${src}${gh} · ~US$ ${pjCost(r.p).toFixed(0)}/mês</span>
        </span>
        <span class="arrow">→</span>
      </div>`;
    }).join("") : `<div class="empty-mini"><span class="ico">🗺️</span>Sem projetos ainda. Crie uma empresa e um projeto no mapa pra ver tudo agregado aqui: pendências, alertas, commits e custo.</div>`}
    <div id="ckFeed"></div>`;
}

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
