/* ================= drawer ================= */
function openDrawer(f){
  const d=document.getElementById("drawer");
  const body=document.getElementById("drBody"), foot=document.getElementById("drFoot");
  const kind=document.getElementById("drKind"), title=document.getElementById("drTitle"), em=document.getElementById("drEmoji");

  if(f.type==="co"){
    const c=f.co;
    kind.textContent="empresa"; title.textContent=c.name; em.innerHTML=drawerIcon(c,"🏢");
    body.innerHTML=`
      <div class="dr-desc">${esc(c.desc||"")}</div>
      <div class="dr-sec">Números</div>
      <div class="chips">
        <span class="chip">${c.projects.length} projeto(s)</span>
        <span class="chip cost">~US$ ${coCost(c).toFixed(0)}/mês</span>
        <span class="chip">${c.projects.reduce((s,p)=>s+p.todos.filter(t=>!t.done).length,0)} pendência(s)</span>
      </div>
      ${filesSectionHtml()}
      <div class="dr-sec">Projetos</div>
      <div class="mini-list">
        ${c.projects.map(p=>`
          <div class="mini-item" onclick="jumpTo('${p.id}')">
            <span class="mi-emoji">${p.img?`<img src="${esc(p.img)}" style="width:26px;height:26px;object-fit:contain;vertical-align:middle">`:esc(p.emoji||"🚀")}</span>${esc(p.name)}<span class="arrow">→</span>
          </div>`).join("") || '<div class="dr-desc" style="color:var(--tx3)">nenhum projeto</div>'}
      </div>
      <div style="margin-top:14px"><button class="btn sm primary" onclick="openPjModalFor('${c.id}')">＋ Novo projeto</button></div>
      ${typeof relationsSectionHtml==="function"?relationsSectionHtml(c.id):""}
      ${briefSectionHtml(c.id)}`;
    foot.innerHTML=`
      <button class="btn" onclick="openCoModal('${c.id}')">✎ Editar</button>
      <button class="btn ghost" onclick="delCo('${c.id}')">Excluir empresa</button>`;
  }

  if(f.type==="pj"){
    const c=f.co, p=f.pj;
    kind.textContent="projeto · "+c.name; title.textContent=p.name; em.innerHTML=drawerIcon(p,"🚀");
    body.innerHTML=`
      <div class="chips" style="margin-bottom:12px">
        <span class="chip" style="color:${p.status==='ativo'?'var(--ok)':(p.status==='pausado'?'var(--warn)':'var(--tx2)')}">● ${p.status||"ativo"}</span>
        <span class="chip">${p.apps.length} serviço(s)</span>
        <span class="chip cost">~US$ ${pjCost(p).toFixed(0)}/mês</span>
      </div>
      <div class="dr-desc">${esc(p.desc||"")}</div>
      ${teleSectionHtml(c,p, teleCache[p.id]?"ready":"loading")}
      <div class="dr-sec">🧠 Memória do projeto <span id="brainCloudBadge" style="font-weight:400; font-size:11px; color:var(--tx3); margin-left:6px"></span></div>
      <div style="font-size:12px; color:var(--tx3); margin:-4px 0 8px">
        Estado vivo do projeto. Sincroniza com <b>Workspace/brain/</b>, onde suas IAs
        (Claude Code, Codex…) leem e atualizam.
      </div>
      <div id="memSyncBanner"></div>
      <textarea id="pjMemory" style="width:100%; min-height:90px; background:rgba(0,0,0,.32); border:1px solid var(--line); border-radius:11px; color:var(--tx); padding:10px 13px; font-size:13px; font-family:'JetBrains Mono',monospace; resize:vertical">${esc(p.context||"")}</textarea>
      <div id="memBar" style="margin-top:8px"><button class="btn sm" onclick="saveMemory('${p.id}')">💾 Salvar memória</button></div>
      ${briefSectionHtml(p.id)}
      <div class="dr-sec">💬 Chat com IA</div>
      <div style="font-size:12px; color:var(--tx3); margin:-4px 0 8px">Converse com qualquer modelo (grátis, barato ou local). Ela já conhece a memória, os serviços e as pendências deste projeto.</div>
      ${(p.chats||[]).length ? `<div class="mini-list">`+p.chats.map(ch=>`<div class="mini-item" onclick="openChat('${p.id}','${ch.id}')"><span class="mi-emoji">💬</span>${esc(ch.title||"novo chat")}<span class="arrow">→</span></div>`).join("")+`</div>` : ""}
      <div style="margin-top:${(p.chats||[]).length?"8px":"0"}"><button class="btn sm primary" onclick="newChat('${p.id}')">＋ Novo chat</button></div>
      ${typeof relationsSectionHtml==="function"?relationsSectionHtml(p.id):""}
      <div class="dr-sec">Serviços</div>
      <div class="mini-list">
        ${p.apps.map(a=>`
          <div class="mini-item" onclick="jumpTo('${a.id}')">
            <span class="mi-emoji" style="font-size:13px; font-weight:700; color:#fff; background:${iconFor(a.name).bg}; width:24px;height:24px;border-radius:7px;display:grid;place-items:center">${esc(iconFor(a.name).txt)}</span>
            ${esc(a.name)}<span class="arrow">→</span>
          </div>`).join("") || '<div class="dr-desc" style="color:var(--tx3)">nenhum serviço</div>'}
      </div>
      <div style="margin-top:14px"><button class="btn sm primary" onclick="openAppModalFor('${p.id}')">＋ Adicionar serviço</button></div>
      <div class="dr-sec">Pendências</div>
      ${p.todos.map((t,i)=>{
        if(editingTodo===p.id+":"+i){
          return `<div class="todo-item" style="flex-wrap:wrap; gap:6px">
            <span class="t" style="flex:1 1 100%; font-size:12px; color:var(--tx2)">${esc((t.t||"").split("\n")[0])}</span>
            <select id="tdPrio" class="td-in"><option value="">— prioridade</option><option value="alta"${t.prio==="alta"?" selected":""}>🔴 alta</option><option value="media"${t.prio==="media"?" selected":""}>🟡 média</option><option value="baixa"${t.prio==="baixa"?" selected":""}>🟢 baixa</option></select>
            <input id="tdOwner" class="td-in" placeholder="@dono" value="${esc(t.owner||"")}" style="width:100px">
            <input id="tdDue" class="td-in" type="date" value="${esc(t.due||"")}">
            <button class="btn sm primary" onclick="saveTodoMeta('${p.id}',${i})">ok</button>
            <button class="btn sm ghost" onclick="editingTodo=null; openDrawer(findNode('${p.id}'))">✕</button>
          </div>`;
        }
        const overdue = t.due && !t.done && t.due < todayStr();
        const badges = (t.prio?`<span class="tb tb-${t.prio}" title="prioridade ${prioName[t.prio]||""}">${prioMark[t.prio]||""} ${prioName[t.prio]||""}</span>`:"")
          + (t.owner?`<span class="tb" title="responsável">@${esc(t.owner)}</span>`:"")
          + (t.due?`<span class="tb ${overdue?"tb-over":""}" title="prazo${overdue?" — vencido":""}">📅 ${esc(t.due)}</span>`:"");
        return `<div class="todo-item ${t.done?'done':''}">
          <span class="cb" onclick="toggleTodo('${p.id}',${i})">✓</span>
          <span class="t">${esc(t.t)}${badges}</span>
          <span class="td-ed" title="prazo · dono · prioridade" onclick="editTodoMeta('${p.id}',${i})">✎</span>
          <span class="x" onclick="delTodo('${p.id}',${i})">✕</span>
        </div>`;
      }).join("")}
      <div class="todo-add">
        <input id="todoInput" placeholder="nova pendência…  (dá pra usar !alta @dono 📅2026-07-10)" onkeydown="if(event.key==='Enter')addTodo('${p.id}')">
        <button class="btn sm" onclick="addTodo('${p.id}')">＋</button>
      </div>
      ${filesSectionHtml()}`;
    foot.innerHTML=`
      <button class="btn" onclick="openPjModalFor('${c.id}','${p.id}')">✎ Editar</button>
      <button class="btn" onclick="exportProjectReport('${p.id}')" title="Baixa um status do projeto em Markdown">📄 Relatório</button>
      <button class="btn ghost" onclick="delPj('${p.id}')">Excluir projeto</button>`;
  }

  if(f.type==="ap"){
    const a=f.ap, ic=iconFor(a.name);
    const dashU=safeUrl(a.dash), urlU=safeUrl(a.url);   // só http(s); esquema perigoso vira "" (some o link)
    kind.textContent="serviço · "+f.pj.name; title.textContent=a.name;
    em.innerHTML=`<span style="font-size:16px; font-weight:800; color:#fff; background:linear-gradient(135deg,${ic.bg},${ic.bg}cc); width:100%; height:100%; border-radius:15px; display:grid; place-items:center">${esc(ic.txt)}</span>`;
    const pc=pingCache[a.id];
    body.innerHTML=`
      <div class="dr-desc">${esc(a.role||"")}</div>
      <div class="dr-sec">Assinatura</div>
      <div class="chips">
        ${a.plan?`<span class="chip">${esc(a.plan)}</span>`:""}
        <span class="chip cost">${(parseFloat(a.cost)||0)>0?"~US$ "+parseFloat(a.cost).toFixed(0)+"/mês":"grátis"}</span>
        ${a.health?`<span class="chip st" id="drping">${pc?pc.txt:"verificando…"}</span>`:""}
      </div>
      ${a.alert?`<div class="chips" style="margin-top:8px"><span class="chip alert">⚠ ${esc(a.alert)}</span></div>`:""}
      ${a.notes?`<div class="dr-sec">Notas</div><div class="notes">${esc(a.notes)}</div>`:""}
      ${(dashU||urlU)?`<div class="dr-sec">Acessos</div>
        <div style="display:flex; gap:9px; flex-wrap:wrap">
          ${dashU?`<a class="link" href="${esc(dashU)}" target="_blank" rel="noopener noreferrer">Abrir painel ↗</a>`:""}
          ${urlU?`<a class="link" href="${esc(urlU)}" target="_blank" rel="noopener noreferrer">Abrir serviço ↗</a>`:""}
        </div>`:""}
      ${typeof relationsSectionHtml==="function"?relationsSectionHtml(a.id):""}`;
    foot.innerHTML=`
      <button class="btn" onclick="openAppModalFor('${f.pj.id}','${a.id}')">✎ Editar</button>
      <button class="btn ghost" onclick="delApp('${a.id}')">Excluir serviço</button>`;
    if(a.health) ping(a);
  }
  if(f.type==="pj") hydrateTele(f.co,f.pj);
  if(f.type==="pj" && typeof hydrateMemSync==="function") hydrateMemSync(f.co,f.pj);
  if(f.type==="co"||f.type==="pj") hydrateFiles(f);
  d.classList.add("open");
}
function closeDrawer(){
  if(typeof exitChatUi==="function" && curChat) exitChatUi();
  document.getElementById("drawer").classList.remove("open");
  sel=null; render();
}
function jumpTo(id){
  const f=findNode(id); if(!f) return;
  if(f.type==="pj"){ expanded.add(f.co.id); }
  if(f.type==="ap"){ expanded.add(f.co.id); expanded.add(f.pj.id); }
  sel={id, ...f};
  // centraliza no nó
  cam.x = innerWidth/2 - f.item.x*cam.z;
  cam.y = innerHeight/2 - f.item.y*cam.z;
  save(); render(); openDrawer(f);
}

/* ================= ping ================= */
async function ping(a){
  const upd=(cls,txt)=>{
    pingCache[a.id]={cls,txt};
    const nd=document.getElementById("nd-"+a.id); if(nd) nd.className="sdot "+cls;
    const dp=document.getElementById("drping"); if(dp && sel && sel.id===a.id) dp.textContent=txt;
  };
  if(pingCache[a.id] && pingCache[a.id].fresh) return upd(pingCache[a.id].cls, pingCache[a.id].txt);
  const target=safeUrl(a.health);   // só http(s): impede fetch em javascript:/data:/file: vindos de estado não confiável
  if(!target){ upd("bad","URL inválida"); if(pingCache[a.id]) pingCache[a.id].fresh=true; return; }
  const t0=performance.now();
  try{
    const ctl=new AbortController(); const timer=setTimeout(()=>ctl.abort(),65000);
    const r=await fetch(target,{signal:ctl.signal}); clearTimeout(timer);
    const ms=Math.round(performance.now()-t0);
    if(r.ok){ upd("ok","online · "+ms+"ms"); } else { upd("bad","HTTP "+r.status); }
  }catch(e){ upd("bad","offline"); }
  if(pingCache[a.id]) pingCache[a.id].fresh=true;
}

