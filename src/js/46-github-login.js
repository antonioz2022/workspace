/* ===== ⚡ Entrar com GitHub — OAuth Device Flow (via worker) ===== */
let ghDevicePoll=null;
async function githubLogin(){
  switchAccTab("conta"); // o card do código vive na aba Conta
  const card=document.getElementById("ghLoginCard"); if(!card) return;
  if(ghDevicePoll){ clearTimeout(ghDevicePoll); ghDevicePoll=null; }
  card.style.display="block";
  card.innerHTML=`<div style="color:var(--tx2);font-size:12.5px">Falando com o GitHub…</div>`;
  try{
    const r=await fetch(mcpUrl()+"/panel/device/start",{method:"POST",headers:{"content-type":"application/json"}});
    const j=await r.json();
    if(j.error){
      card.innerHTML=`<div style="color:var(--warn);font-size:12.5px">Não deu pra iniciar o login (<b>${esc(j.error)}</b>).<br>${esc(j.hint||"")}</div>`;
      return;
    }
    window.open(j.verification_uri_complete,"_blank","noopener");
    card.innerHTML=`
      <div style="font-size:12.5px;color:var(--tx2)">Abriu uma aba no GitHub. É só clicar <b>Authorize</b>. ✅</div>
      <div style="font-size:12px;color:var(--tx3);margin-top:6px">Se não abriu: <a href="${esc(j.verification_uri)}" target="_blank" rel="noopener" style="color:var(--ac)">${esc(j.verification_uri)}</a> e digite</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <code style="font-family:var(--mono);font-size:18px;letter-spacing:2px;background:var(--glass2);padding:6px 12px;border-radius:8px">${esc(j.user_code)}</code>
        <button class="btn sm" onclick="copyText('${jsq(j.user_code)}')">📋 copiar</button>
      </div>
      <div id="ghLoginWait" style="font-size:12px;color:var(--tx3);margin-top:10px">⏳ aguardando você autorizar no GitHub…</div>`;
    pollDeviceToken(j.device_code, (j.interval||5), Date.now()+((j.expires_in||900)*1000));
  }catch(e){ card.innerHTML=`<div style="color:var(--warn);font-size:12.5px">Falha ao conectar no servidor: ${esc(e.message||e)}</div>`; }
}
function pollDeviceToken(deviceCode, interval, deadline){
  ghDevicePoll=setTimeout(async ()=>{
    if(Date.now()>deadline){ const w=document.getElementById("ghLoginWait"); if(w){ w.textContent="⌛ o código expirou. Clique em ⚡ Entrar com GitHub de novo."; w.style.color="var(--warn)"; } return; }
    try{
      const r=await fetch(mcpUrl()+"/panel/device/poll",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({device_code:deviceCode})});
      const j=await r.json();
      if(j.access_token){
        setGithubToken(j.access_token);
        if(j.login) localStorage.setItem(LS_KEY+"-ghlogin", j.login);
        const card=document.getElementById("ghLoginCard");
        if(card) card.innerHTML=`<div style="color:var(--ok);font-size:13px">✓ conectado como <b>@${esc(j.login||"você")}</b>. Já pode gerenciar tudo por aqui.</div>`;
        renderAccHeader(); renderMembers(); renderWorkspaceState();
        return;
      }
      if(j.slow_down) interval=(j.interval||interval+5);
      pollDeviceToken(deviceCode, interval, deadline); // pending → segue tentando
    }catch(e){ pollDeviceToken(deviceCode, interval, deadline); }
  }, Math.max(2,interval)*1000);
}
function setGithubToken(v){ DB.settings=DB.settings||{}; DB.settings.githubToken=(v||"").trim(); ghRepoListCache=null; localStorage.removeItem(LS_KEY+"-patexp"); save();
  const s=document.getElementById("ghTokenStatus"); if(s) s.textContent=DB.settings.githubToken?"✓ token salvo neste navegador":""; }
function openAiModal(){ renderProvs(); document.getElementById("provForm").style.display="none";
  DB.settings=DB.settings||{};
  const gi=document.getElementById("ghTokenInput"); if(gi) gi.value=DB.settings.githubToken||"";
  const gs=document.getElementById("ghTokenStatus");
  if(gs){
    const d=patDays();
    let txt=DB.settings.githubToken?"✓ token salvo neste navegador":"";
    if(DB.settings.githubToken && d!==null){
      const dt=new Date(parseInt(localStorage.getItem(LS_KEY+"-patexp"),10)).toLocaleDateString("pt-BR");
      txt+=` · expira em ${d} dia(s) (${dt})${d<10?", RENOVA LOGO":""}`;
    }
    gs.textContent=txt; gs.style.color=(d!==null&&d<10)?"var(--warn)":"var(--tx3)";
  }
  renderWorkspaceState();
  const mu=document.getElementById("mcpUrlInput"); if(mu) mu.value=DB.settings.mcpUrl||MCP_URL_DEFAULT;
  renderAIDirectory();
  renderMcpConnections();
  renderPresetGrid(); renderProvs();
  const wt=document.getElementById("wdTopicInput"); if(wt) wt.value=DB.settings.ntfyTopic||"";
  renderWatchdog();
  renderMembers();
  renderAccHeader();
  switchAccTab("conta");
  document.getElementById("aiModal").classList.add("open"); }
function renderPresetGrid(){
  const el=document.getElementById("presetGrid"); if(!el) return;
  el.innerHTML=`<div class="ai-cards">`+PRESET_ORDER.map(id=>{ const p=PROV_PRESETS[id];
    return `<div class="ai-card" style="gap:6px">
      <div class="ai-h" style="justify-content:space-between">
        <b style="font-size:13px">${esc(p.name)}</b>
        <span style="font-size:9px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.05em;color:${TAG_COLOR[p.tag]||"var(--tx3)"}">${esc(p.tag)}</span>
      </div>
      <button class="btn sm ${p.tag==="grátis"||p.tag==="local"?"primary":""}" onclick="openProvForm('${id}');switchAccTab('chat')">Usar →</button>
    </div>`;
  }).join("")+`</div>`;
}
function renderProvs(){
  const el=document.getElementById("provList");
  el.innerHTML = PROVS().map(p=>`
    <div class="prov-item">
      <div class="pi">
        <div class="pname">${esc(p.name)}</div>
        <div class="pmeta">${p.kind==="anthropic"?"Anthropic":"OpenAI-compat"} · ${esc((p.models||[]).join(", "))} · chave ${p.apiKey?("•••"+p.apiKey.slice(-4)):"—"}</div>
      </div>
      <button class="btn sm" onclick="openProvForm(null,'${p.id}')">✎</button>
      <button class="btn sm ghost" onclick="delProv('${p.id}')">✕</button>
    </div>`).join("") || '<div style="color:var(--tx3); font-size:13px; padding:6px 2px">nenhuma conta ainda. Adicione a primeira 👇</div>';
}
function openProvForm(preset, id){
  editingProv=id||null;
  const f=document.getElementById("provForm"); f.style.display="block";
  const p = id ? getProv(id) : (preset ? PROV_PRESETS[preset] : {name:"",kind:"openai",base:"",models:""});
  document.getElementById("pvName").value = p.name||"";
  document.getElementById("pvKind").value = p.kind||"anthropic";
  document.getElementById("pvBase").value = p.base || p.baseUrl || "";
  document.getElementById("pvKey").value = id ? (p.apiKey||"") : "";
  document.getElementById("pvModels").value = Array.isArray(p.models) ? p.models.join(", ") : (p.models||"");
  pvKindChanged();
}
function pvKindChanged(){
  document.getElementById("pvBaseWrap").style.display =
    document.getElementById("pvKind").value==="openai" ? "block" : "none";
}
function saveProv(){
  const name=document.getElementById("pvName").value.trim();
  const key=document.getElementById("pvKey").value.trim();
  const base=document.getElementById("pvBase").value.trim().replace(/\/+$/,"");
  const models=document.getElementById("pvModels").value.split(",").map(s=>s.trim()).filter(Boolean);
  const isLocal=/localhost|127\.0\.0\.1/.test(base);
  if(!name) return alert("Dá um nome pra conta.");
  if(!key && !isLocal) return alert("Cola a API key (provedores locais como Ollama podem ficar sem).");
  if(!models.length) return alert("Informa pelo menos um modelo.");
  const data={ name, kind:document.getElementById("pvKind").value,
    baseUrl:base, apiKey:key||"local", models };
  if(data.kind==="openai" && !data.baseUrl) return alert("OpenAI-compatível precisa da Base URL.");
  if(editingProv){ Object.assign(getProv(editingProv), data); }
  else{ DB.settings.providers.push({id:uid(), ...data}); }
  save(); renderProvs(); renderDock();
  document.getElementById("provForm").style.display="none";
}
async function delProv(id){
  const p=getProv(id);
  if(!(await uiConfirm(`Remover a conta "${p.name}"? Os chats que a usam vão pedir outra conta.`,{danger:true,okLabel:"Remover"}))) return;
  DB.settings.providers = PROVS().filter(x=>x.id!==id);
  save(); renderProvs(); renderDock();
}

