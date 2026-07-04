/* ================= IA: chats ================= */
let curChat=null;   // {pjId, chatId}
let chatBusy=false;

const getChat = () => {
  if(!curChat) return null;
  const f=findNode(curChat.pjId); if(!f) return null;
  return {f, chat:(f.pj.chats||[]).find(c=>c.id===curChat.chatId)};
};

function newChat(pjId){
  if(!PROVS().length){ uiToast("Adicione uma conta de IA primeiro. Escolha um modelo grátis/local em 💬 Chat.", "warn"); openAiModal(); switchAccTab("chat"); return; }
  const f=findNode(pjId);
  const prov=PROVS()[0];
  const chat={ id:uid(), title:"", providerId:prov.id, model:prov.models[0], messages:[], ctx:[] };
  f.pj.chats.push(chat); save();
  openChat(pjId, chat.id);
}
async function delChat(pjId, chatId){
  const f=findNode(pjId);
  const ch=f.pj.chats.find(c=>c.id===chatId);
  if(!(await uiConfirm(`Apagar o chat "${ch.title||"novo chat"}"?`,{danger:true,okLabel:"Apagar"}))) return;
  f.pj.chats = f.pj.chats.filter(c=>c.id!==chatId);
  save();
  if(curChat && curChat.chatId===chatId){ curChat=null; openDrawer(f); }
  else openDrawer(f);
}
function saveMemory(pjId){
  const f=findNode(pjId);
  f.pj.context = document.getElementById("pjMemory").value;
  f.pj._memDirty = true;
  save(); scheduleSync();
  const b=event.target; b.textContent="✓ salvo"; setTimeout(()=>b.textContent="💾 Salvar memória", 1200);
}

function openChat(pjId, chatId){
  curChat={pjId, chatId};
  const {f, chat}=getChat();
  document.getElementById("drawerStd").style.display="none";
  document.getElementById("drawerChat").style.display="flex";
  const d=document.getElementById("drawer");
  d.classList.add("open","wide");
  document.getElementById("chTitle").textContent = chat.title || (f.pj.name+" · novo chat");
  // selects de conta/modelo
  const sp=document.getElementById("chProv");
  sp.innerHTML = PROVS().map(p=>`<option value="${p.id}" ${p.id===chat.providerId?"selected":""}>${esc(p.name)}</option>`).join("");
  fillModelSelect(chat);
  renderCtxBar(); renderMsgs();
}
function fillModelSelect(chat){
  const prov=getProv(chat.providerId) || PROVS()[0];
  const sm=document.getElementById("chModel");
  sm.innerHTML = (prov?prov.models:[]).map(m=>`<option value="${esc(m)}" ${m===chat.model?"selected":""}>${esc(shortModel(m))}</option>`).join("");
}
function chatProvChanged(){
  const {chat}=getChat(); if(!chat) return;
  chat.providerId=document.getElementById("chProv").value;
  const prov=getProv(chat.providerId);
  if(prov && !prov.models.includes(chat.model)) chat.model=prov.models[0];
  fillModelSelect(chat); save();
}
function chatModelChanged(){
  const {chat}=getChat(); if(!chat) return;
  chat.model=document.getElementById("chModel").value; save();
}
function backFromChat(){
  const pjId=curChat && curChat.pjId;
  exitChatUi();
  if(pjId){ const f=findNode(pjId); if(f) openDrawer(f); }
}
function exitChatUi(){
  curChat=null;
  document.getElementById("drawerChat").style.display="none";
  document.getElementById("drawerStd").style.display="contents";
  document.getElementById("drawer").classList.remove("wide");
}

/* ---- contexto interconectado (opt-in, pra não gastar token à toa) ---- */
function renderCtxBar(){
  const {f, chat}=getChat(); if(!chat) return;
  const el=document.getElementById("chCtx");
  let chips=`<span class="lbl">🔗 contexto</span>
    <span class="ctxchip on lock" title="o projeto atual sempre entra">${esc(f.pj.name)}</span>`;
  DB.companies.forEach(c=>c.projects.forEach(p=>{
    if(p.id===f.pj.id) return;
    const on=(chat.ctx||[]).includes(p.id);
    chips+=`<span class="ctxchip ${on?"on":""}" onclick="toggleCtx('${p.id}')" title="${on?"conectado: a IA lê a memória deste projeto":"desligado: não gasta token"}">${esc(c.name)} · ${esc(p.name)}</span>`;
  }));
  chips+=`<span style="margin-left:auto; font-size:10.5px; color:var(--tx3); font-family:'JetBrains Mono',monospace" id="ctxEst"></span>`;
  el.innerHTML=chips;
  updateCtxEst();
}
function toggleCtx(pjId){
  const {chat}=getChat(); if(!chat) return;
  chat.ctx = chat.ctx||[];
  const i=chat.ctx.indexOf(pjId);
  if(i>=0) chat.ctx.splice(i,1); else chat.ctx.push(pjId);
  save(); renderCtxBar();
}
function updateCtxEst(){
  const g=getChat(); if(!g||!g.chat) return;
  const sys=buildSystem(g.f, g.chat);
  const hist=g.chat.messages.map(m=>m.content).join(" ");
  const est=Math.round((sys.length+hist.length)/3.5);
  const el=document.getElementById("ctxEst");
  if(el) el.textContent="~"+(est>1000?(est/1000).toFixed(1)+"k":est)+" tokens";
}

function projectCard(c, p){
  const svcs=(p.apps||[]).map(a=>`- ${a.name}: ${a.role||""}${a.plan?` (${a.plan})`:""}`).join("\n");
  const pend=(p.todos||[]).filter(t=>!t.done).map(t=>"- "+t.t).join("\n");
  return `### Projeto: ${p.name} (empresa: ${c.name})
${p.desc||""}
${svcs?`Serviços/ferramentas:\n${svcs}`:""}
${pend?`Pendências abertas:\n${pend}`:""}
${p.context?`Memória do projeto:\n${p.context}`:""}`.trim();
}
function buildSystem(f, chat){
  let s=`Você é o assistente do Antonio no painel Workspace dele. O foco desta conversa é o projeto abaixo.

${projectCard(f.co, f.pj)}`;
  const extras=(chat.ctx||[]).map(pid=>{
    for(const c of DB.companies){ const p=c.projects.find(x=>x.id===pid); if(p) return projectCard(c,p); }
    return null;
  }).filter(Boolean);
  if(extras.length) s+=`

## Contexto conectado de outros projetos (o Antonio ligou de propósito)
${extras.join("\n\n")}`;
  s+=`

Responda em português (Brasil), direto e útil, sem enrolação. Se faltar informação sobre a operação, diga o que falta em vez de inventar.`;
  return s;
}

/* ---- render das mensagens ---- */
function mdlite(s){
  let t=esc(s);
  t=t.replace(/```([\s\S]*?)```/g,(_,c)=>`<pre>${c.replace(/^\w+\n/,"")}</pre>`);
  t=t.replace(/`([^`\n]+)`/g,"<code>$1</code>");
  t=t.replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>");
  return t;
}
function renderMsgs(){
  const g=getChat(); if(!g||!g.chat) return;
  const el=document.getElementById("chMsgs");
  el.innerHTML = g.chat.messages.map(m=>
    m.role==="user"
      ? `<div class="bub user">${esc(m.content)}</div>`
      : `<div class="bub ai">${mdlite(m.content)}${m.model?`<span class="meta">${esc(shortModel(m.model))}</span>`:""}</div>`
  ).join("") || `<div style="color:var(--tx3); font-size:13px; text-align:center; margin-top:30px">
      Novo chat sobre <b>${esc(g.f.pj.name)}</b>.<br>A IA já conhece os serviços, pendências e a memória deste projeto.<br>
      Pra cruzar com outro projeto, liga o chip dele aí embaixo. 👇</div>`;
  el.scrollTop=el.scrollHeight;
  updateCtxEst();
}
function chKey(e){
  if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendChat(); }
}

/* ---- envio + streaming ---- */
async function sendChat(){
  if(chatBusy) return;
  const g=getChat(); if(!g||!g.chat) return;
  const inp=document.getElementById("chInput");
  const text=inp.value.trim(); if(!text) return;
  const prov=getProv(g.chat.providerId);
  if(!prov){ alert("A conta deste chat foi removida. Escolha outra no seletor do topo."); return; }

  inp.value="";
  g.chat.messages.push({role:"user", content:text});
  if(!g.chat.title){ g.chat.title=text.slice(0,42)+(text.length>42?"…":""); document.getElementById("chTitle").textContent=g.chat.title; }
  save(); renderMsgs();

  chatBusy=true;
  document.getElementById("chSend").disabled=true;
  const el=document.getElementById("chMsgs");
  el.insertAdjacentHTML("beforeend", `<div class="bub ai" id="liveBub"><span class="typing"><i></i><i></i><i></i></span></div>`);
  el.scrollTop=el.scrollHeight;

  const sys=buildSystem(g.f, g.chat);
  const hist=g.chat.messages.slice(-30).map(m=>({role:m.role, content:m.content}));
  let acc="";
  const onDelta=t=>{
    acc+=t;
    const b=document.getElementById("liveBub");
    if(b){ b.innerHTML=mdlite(acc); el.scrollTop=el.scrollHeight; }
  };
  try{
    if(prov.kind==="anthropic") await streamAnthropic(prov, g.chat.model, sys, hist, onDelta);
    else await streamOpenAI(prov, g.chat.model, sys, hist, onDelta);
    g.chat.messages.push({role:"assistant", content:acc||"(resposta vazia)", model:g.chat.model});
  }catch(err){
    if(acc) g.chat.messages.push({role:"assistant", content:acc+"\n\n[resposta interrompida]", model:g.chat.model});
    const live=document.getElementById("liveBub"); if(live) live.remove();
    el.insertAdjacentHTML("beforeend", `<div class="bub err">⚠ ${esc(String(err.message||err))}</div>`);
    el.scrollTop=el.scrollHeight;
  }
  save();
  chatBusy=false;
  document.getElementById("chSend").disabled=false;
  if(acc) renderMsgs();
  inp.focus();
}

async function readSSE(resp, onEvent){
  if(!resp.ok){
    let msg="HTTP "+resp.status;
    try{ const j=await resp.json(); msg += ": "+(j.error&&(j.error.message||j.error.type)||JSON.stringify(j)).slice(0,300); }catch(e){}
    throw new Error(msg);
  }
  const reader=resp.body.getReader();
  const dec=new TextDecoder();
  let buf="";
  for(;;){
    const {done, value}=await reader.read();
    if(done) break;
    buf+=dec.decode(value,{stream:true});
    const lines=buf.split("\n"); buf=lines.pop();
    for(const ln of lines){
      const s=ln.trim();
      if(!s.startsWith("data:")) continue;
      const payload=s.slice(5).trim();
      if(payload==="[DONE]") return;
      let obj; try{ obj=JSON.parse(payload); }catch(e){ continue; } // só engole linha malformada…
      onEvent(obj);   // …NÃO o erro lançado pelo callback (ex.: evento "error" da API) → propaga
    }
  }
}
async function streamAnthropic(prov, model, system, messages, onDelta){
  const resp=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-api-key":prov.apiKey,
      "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true"
    },
    body:JSON.stringify({model, max_tokens:4096, system, messages, stream:true})
  });
  await readSSE(resp, ev=>{
    if(ev.type==="content_block_delta" && ev.delta && ev.delta.type==="text_delta") onDelta(ev.delta.text);
    if(ev.type==="error") throw new Error(ev.error && ev.error.message || "erro da API");
  });
}
async function streamOpenAI(prov, model, system, messages, onDelta){
  const resp=await fetch(prov.baseUrl+"/chat/completions",{
    method:"POST",
    headers:{"content-type":"application/json","authorization":"Bearer "+prov.apiKey},
    body:JSON.stringify({model, stream:true, messages:[{role:"system",content:system},...messages]})
  });
  await readSSE(resp, ev=>{
    const d=ev.choices && ev.choices[0] && ev.choices[0].delta;
    if(d && d.content) onDelta(d.content);
  });
}

