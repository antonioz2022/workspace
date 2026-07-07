/* ===== 🕘 snapshots + rollback: reusa o histórico git do state.json ===== */
async function openHistory(){
  document.getElementById("histModal").classList.add("open");
  const box=document.getElementById("histBody");
  if(!stateSyncOn()){ box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">conecte uma workspace (⚙ Contas) pra ver o histórico</div>`; return; }
  box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">lendo histórico…</div>`;
  try{
    const commits=await ghGet(`/repos/${stateRepo()}/commits?path=${STATE_PATH}&per_page=25`);
    if(!Array.isArray(commits)||!commits.length){ box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">sem histórico ainda (edite algo pra gerar a 1ª versão)</div>`; return; }
    box.innerHTML=commits.map((c,i)=>{
      const d=(c.commit&&c.commit.author&&c.commit.author.date)?Date.parse(c.commit.author.date):null;
      const who=(c.commit&&c.commit.author&&c.commit.author.name)||"";
      const when=d?new Date(d).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
      return `<div class="mini-item" ${i===0?"":`onclick="restoreSnapshot('${c.sha}')" style="cursor:pointer"`}>
        <span class="mi-emoji">${i===0?"🟢":"🕘"}</span>
        <span style="flex:1;min-width:0"><b>${i===0?"atual":"versão de "+esc(agoStr(d)||when)}</b><br><span style="font-size:11px;color:var(--tx3)">${esc(who)} · ${esc(when)} · ${esc((c.sha||"").slice(0,7))}</span></span>
        ${i===0?`<span style="font-size:11px;color:var(--ok)">✓ aqui</span>`:`<span class="arrow" title="voltar pra esta">↩</span>`}
      </div>`;
    }).join("");
  }catch(e){ box.innerHTML=`<div class="dr-desc" style="color:var(--warn)">falha ao ler histórico: ${esc(e.message||e)}</div>`; }
}
async function restoreSnapshot(sha){
  if(!(await uiConfirm("Voltar a workspace pra esta versão? O estado atual é substituído (e vira o novo topo do histórico — dá pra voltar de novo).",{danger:true, okLabel:"Voltar pra esta versão"}))) return;
  try{
    const j=await ghGet(`/repos/${stateRepo()}/contents/${STATE_PATH}?ref=${sha}`);
    if(!j||!j.content) throw new Error("não consegui ler essa versão");
    const payload=JSON.parse(b64d(j.content));
    if(!payload||!payload.db||!Array.isArray(payload.db.companies)) throw new Error("versão inválida");
    applyIncomingState(payload.db);   // versão restaurada é conteúdo remoto: preserva o local-only (anti-exfil)
    // reescreve a brain (memoria/pendencias/projeto) pra bater com a versão restaurada
    DB.companies.forEach(c=>{ c._coDirty=true; c.projects.forEach(p=>{ p._memDirty=true; p._todoDirty=true; }); });
    lastPushedDbStr=null;                    // garante o push do estado restaurado
    save(); render(); closeModals();
    uiToast("Voltou pra versão "+sha.slice(0,7)+". Sincronizando…","ok");
    await pushState();
    if(typeof queueBrainPush==="function") queueBrainPush();
  }catch(e){ uiToast("Restaurar: "+(e.message||e),"bad"); }
}

function openCockpit(){
  renderCockpit();
  document.getElementById("cockpitModal").classList.add("open");
  // status do vigia (best-effort)
  (async()=>{
    const el=document.getElementById("ckWatchdog"); if(!el) return;
    try{
      const j=await wdFetch("/admin/watchdog");
      const svcs=(j.config&&j.config.services)||[];
      if(!svcs.length){ el.textContent="🛰 vigia: desligado (ativa em ⚙ Contas)"; return; }
      const down=Object.entries((j.state&&j.state.services)||{}).filter(([,v])=>v&&v.ok===false).map(([k])=>k);
      el.textContent=down.length?`🛰 vigia: 🔴 FORA DO AR: ${down.join(", ")}`:`🛰 vigia: ✅ ${svcs.length} serviço(s) no ar${j.state&&j.state.lastCheck?" · check "+agoStr(j.state.lastCheck):""}`;
      el.style.color=down.length?"var(--warn)":"var(--tx3)";
    }catch(e){ el.textContent="🛰 vigia: status indisponível"; }
  })();
  renderActivityFeed();
  // telemetria em background pros que dá (pasta concedida ou repo+token) — RESPEITANDO os
  // caches (90s): abrir/fechar o cockpit não re-bate a API toda vez (o 🔄 Atualizar força)
  (async()=>{
    for(const c of DB.companies) for(const p of c.projects){
      try{ if(!(teleCache[p.id] && Date.now()-teleCache[p.id].at<90000)) await getTelemetry(p,{promptLocal:false}); }catch(e){}
      try{ if(typeof memStaleCached==="function") await memStaleCached(c,p); }catch(e){}
    }
    renderCockpit();
  })();
}
async function cockpitRefreshAll(){
  const el=document.getElementById("cockpitBody");
  if(el) el.insertAdjacentHTML("afterbegin",`<div class="dr-desc" id="ckLoading" style="color:var(--tx3)">atualizando telemetria + pings…</div>`);
  for(const c of DB.companies) for(const p of c.projects){
    try{ await getTelemetry(p,{promptLocal:false}); }catch(e){}
    for(const a of p.apps) if(a.health){ if(pingCache[a.id]) pingCache[a.id].fresh=false; ping(a, true); }   // auto: pula host privado (SSRF)
  }
  renderCockpit();
  renderActivityFeed();
}
