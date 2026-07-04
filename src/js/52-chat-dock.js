/* ================= 💬 chat dock (copiloto lateral, sempre à mão) ================= */
let dockBusy=false;
function dockState(){ DB.settings=DB.settings||{}; DB.settings.dock=DB.settings.dock||{}; return DB.settings.dock; }
function initDock(){ const d=dockState(); if(d.min===undefined) d.min=innerWidth<900; applyDockMin(); renderDock(); }
function applyDockMin(){ const dock=document.getElementById("dock"); if(dock) dock.classList.toggle("min", !!dockState().min); }
function dockToggleMin(){ const d=dockState(); d.min=!d.min; save(); applyDockMin(); if(!d.min){ renderDock(); const i=document.getElementById("dockInput"); if(i&&!i.disabled) i.focus(); } }
function dockKey(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); dockSend(); } }
function dockModelChanged(){ const sel=document.getElementById("dockModel"); const opt=sel.options[sel.selectedIndex]; if(!opt) return; const d=dockState(); d.providerId=opt.dataset.prov; d.model=opt.value; save(); }
function dockSystem(){
  let s="Você é o copiloto do Córtex do Antonio — um painel que organiza as empresas e projetos dele. Responda em PT-BR, direto e útil, sem enrolação.\n\nVisão geral da workspace:";
  DB.companies.forEach(c=>{ s+=`\n• ${c.name}${c.desc?" — "+c.desc:""}`; c.projects.forEach(p=>{ s+=`\n   – ${p.name}${p.desc?": "+p.desc:""}`; }); });
  if(!DB.companies.length) s+="\n(workspace ainda vazia)";
  s+="\n\nA memória completa de cada projeto está no painel; se precisar de detalhe, diga o que falta em vez de inventar.";
  return s;
}
function renderDock(){
  const body=document.getElementById("dockBody"); if(!body) return;
  const provs=PROVS(), sel=document.getElementById("dockModel"), comp=document.getElementById("dockComposer");
  const setComposer=(on)=>{ if(!comp) return; const ta=comp.querySelector("textarea"), b=comp.querySelector(".send");
    if(ta){ ta.disabled=!on; ta.placeholder=on?"pergunte algo…":"adicione uma IA pra conversar…"; } if(b) b.disabled=!on; };
  if(!provs.length){
    if(sel) sel.style.display="none"; setComposer(false);
    body.innerHTML=`<div style="margin:auto; text-align:center; color:var(--tx2); font-size:13.5px; padding:22px; line-height:1.6">
      <div style="font-size:34px; margin-bottom:6px">💬</div>
      <b style="color:var(--tx)">Converse com uma IA por aqui.</b><br>
      Conecte um modelo (tem opção <b>grátis</b>) e ele já entra sabendo dos seus projetos.
      <div style="margin-top:16px"><button class="btn sm primary" onclick="openAiModal();switchAccTab('chat')">Escolher IA →</button></div></div>`;
    return;
  }
  if(sel) sel.style.display="";
  const d=dockState();
  if(!d.providerId || !getProv(d.providerId)) d.providerId=provs[0].id;
  const prov=getProv(d.providerId);
  if(!d.model || !prov.models.includes(d.model)) d.model=prov.models[0];
  if(sel) sel.innerHTML=provs.flatMap(p=>(p.models||[]).map(m=>`<option value="${esc(m)}" data-prov="${p.id}" ${(p.id===d.providerId&&m===d.model)?"selected":""}>${esc(shortModel(m))}</option>`)).join("");
  setComposer(true);
  const msgs=d.messages||[];
  body.innerHTML = msgs.length
    ? msgs.map(m=> m.role==="user"?`<div class="bub user">${esc(m.content)}</div>`:`<div class="bub ai">${mdlite(m.content)}</div>`).join("")
    : `<div style="margin:auto;text-align:center;color:var(--tx3);font-size:13px;padding:22px">Pronto pra ajudar.<br>Pergunte o que quiser sobre os seus projetos. 🧠</div>`;
  body.scrollTop=body.scrollHeight;
}
async function dockSend(){
  if(dockBusy) return;
  const d=dockState(), prov=getProv(d.providerId);
  const inp=document.getElementById("dockInput"), text=(inp.value||"").trim();
  if(!text || !prov) return;
  inp.value="";
  d.messages=d.messages||[]; d.messages.push({role:"user",content:text}); save(); renderDock();
  dockBusy=true; const sb=document.getElementById("dockSendBtn"); if(sb) sb.disabled=true;
  const body=document.getElementById("dockBody");
  body.insertAdjacentHTML("beforeend",`<div class="bub ai" id="dockLive"><span class="typing"><i></i><i></i><i></i></span></div>`); body.scrollTop=body.scrollHeight;
  const sys=dockSystem(), hist=d.messages.slice(-20).map(m=>({role:m.role,content:m.content}));
  let acc="";
  const onDelta=t=>{ acc+=t; const el=document.getElementById("dockLive"); if(el){ el.innerHTML=mdlite(acc); body.scrollTop=body.scrollHeight; } };
  try{
    if(prov.kind==="anthropic") await streamAnthropic(prov, d.model, sys, hist, onDelta);
    else await streamOpenAI(prov, d.model, sys, hist, onDelta);
    d.messages.push({role:"assistant",content:acc||"(resposta vazia)",model:d.model});
  }catch(err){
    if(acc) d.messages.push({role:"assistant",content:acc+"\n\n[interrompido]",model:d.model});
    const live=document.getElementById("dockLive"); if(live) live.remove();
    body.insertAdjacentHTML("beforeend",`<div class="bub err">⚠ ${esc(String(err.message||err))}</div>`); body.scrollTop=body.scrollHeight;
  }
  save(); dockBusy=false; if(sb) sb.disabled=false;
  if(acc) renderDock();
  inp.focus();
}

