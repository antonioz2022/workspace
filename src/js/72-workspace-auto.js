/* ===== 🚀 Workspace no automático: criar/conectar/apagar pelo Córtex ===== */
function renderWorkspaceState(){
  const el=document.getElementById("wsState"); if(!el) return;
  const tok=(DB.settings||{}).githubToken, repo=stateRepo();
  if(!tok){ el.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">Entre com o GitHub (no topo) pra criar e sincronizar sua workspace.</div>`; return; }
  if(!repo){
    el.innerHTML=`<div class="acc-id" style="flex-direction:column;align-items:stretch;gap:12px">
      <div><b>Nenhuma workspace ainda.</b><br><span style="font-size:11.5px;color:var(--tx3)">É um repo privado onde o Córtex salva tudo (empresas, projetos, brain) e sincroniza sozinho.</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm primary" onclick="createWorkspace()">🚀 Criar minha workspace</button>
        <button class="btn sm" onclick="connectExistingWorkspace()">Conectar existente</button>
      </div></div>`;
    return;
  }
  el.innerHTML=`<div class="acc-id">
      <span class="av" style="background:var(--glass2);border:1px solid var(--line2)">☁</span>
      <span style="flex:1;min-width:0"><b>${esc(repo)}</b><br><span style="font-size:11.5px;color:var(--tx3)">sincroniza sozinha · sem apertar botão</span></span>
    </div>
    <div id="stateSyncStatus" style="font-size:12px; color:var(--tx3); margin-top:8px"></div>
    <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap"><button class="btn sm" onclick="openWsModal()">🗂 Ver todas as workspaces</button><button class="btn sm" onclick="openHistory()">🕘 Histórico / voltar versão</button></div>
    <details style="margin-top:10px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Avançado</summary>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <button class="btn sm" onclick="disconnectWorkspace()">Desconectar</button>
        <span id="wsAdminZone" style="font-size:11px;color:var(--tx3)">verificando permissão…</span>
      </div>
      <p style="font-size:11px;color:var(--tx3);margin:8px 0 0">Desconectar = só some daqui (repo fica salvo). Apagar = remove o repo do GitHub de vez, e só o admin da workspace pode.</p>
    </details>`;
  if(stateSyncOn()) stateBadge("☁ sincronizada · salva sozinho ao editar", true);
  checkWsAdmin();
}
async function checkWsAdmin(){
  const zone=document.getElementById("wsAdminZone"); if(!zone) return;
  try{
    const info=await ghGet("/repos/"+stateRepo());
    const admin=!!(info&&info.permissions&&info.permissions.admin);
    const z=document.getElementById("wsAdminZone"); if(!z) return; // modal fechou no meio
    z.outerHTML = admin
      ? `<button class="btn sm danger" onclick="deleteWorkspace()">Apagar workspace</button>`
      : `<span style="font-size:11px;color:var(--tx3)">🔒 só o admin da workspace pode apagá-la</span>`;
  }catch(e){ const z=document.getElementById("wsAdminZone"); if(z) z.textContent="(não deu pra checar permissão)"; }
}
async function createWorkspace(){
  if(!(DB.settings||{}).githubToken){ uiToast("Entre com o GitHub primeiro.","warn"); return; }
  const name=await uiPrompt({title:"Criar workspace", message:"Vou criar um repositório PRIVADO pra guardar tudo (empresas, projetos, brain). Nome:", value:"cortex-workspace", placeholder:"cortex-workspace", okLabel:"Próximo →"});
  if(!name) return;
  // onde criar: sua conta ou uma organização (times / SSO / permissões finas = enterprise)?
  let owner="";
  const orgs=await ghGet("/user/orgs?per_page=50").catch(()=>null);
  if(Array.isArray(orgs) && orgs.length){
    const login=localStorage.getItem(LS_KEY+"-ghlogin")||"você";
    const buttons=[{label:"👤 "+login+" (sua conta)", value:"", kind:"primary"}]
      .concat(orgs.slice(0,6).map(o=>({label:"🏢 "+o.login, value:o.login})))
      .concat([{label:"Cancelar", value:"__cancel__"}]);
    owner=await uiDialog({title:"Onde criar a workspace?", message:"Numa organização você ganha times, SSO e permissões finas (enterprise); na sua conta é mais simples. Dá pra transferir depois.", buttons, cancelValue:"__cancel__"});
    if(owner==="__cancel__") return;
  }
  const url = owner ? `https://api.github.com/orgs/${owner}/repos` : "https://api.github.com/user/repos";
  try{
    const r=await fetch(url,{method:"POST",headers:Object.assign(ghApiHeaders(),{"content-type":"application/json"}),
      body:JSON.stringify({name, private:true, auto_init:true, description:"Córtex workspace — brain + estado (privado)"})});
    if(r.status===422){ uiToast("Já existe um repo com esse nome"+(owner?(" na org "+owner):"")+". Tente outro.","warn"); return; }
    if(r.status===403){ uiToast("Sem permissão pra criar"+(owner?(" na org "+owner+" — você precisa do papel/scope certo lá"):"")+".","warn"); return; }
    if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.message||("HTTP "+r.status)); }
    const j=await r.json();
    setStateRepo(j.full_name);
    uiToast("Workspace criada ✓ semeando…","ok");
    await pushState();
    try{ if(typeof flushBrainPush==="function") await flushBrainPush(); }catch(e){}
    wsRemember(stateRepo()); renderWsPill();
    renderWorkspaceState();
    uiToast("Pronto! Sua workspace sincroniza sozinha agora.","ok");
  }catch(e){ uiToast("Criar workspace: "+(e.message||e),"bad"); }
}
async function connectExistingWorkspace(){
  const login=localStorage.getItem(LS_KEY+"-ghlogin")||"";
  const repo=await uiPrompt({title:"Conectar workspace existente", message:"Cole o repo (owner/repo) que já tem sua workspace:", value:login?login+"/":"", placeholder:"owner/repo", okLabel:"Conectar"});
  if(repo===null) return;
  if(!/^[^/\s]+\/[^/\s]+$/.test(repo)){ uiToast("Formato inválido. Use owner/repo.","warn"); return; }
  setStateRepo(repo);
  const pulled=await pullState({force:true}).catch(()=>false);
  wsRemember(repo); renderWsPill();
  renderWorkspaceState();
  uiToast(pulled?"Conectada. Puxei a workspace ✓":"Conectada.","ok");
}
async function disconnectWorkspace(){
  if(!(await uiConfirm("Desconectar a workspace deste navegador? O repo continua salvo no GitHub, dá pra reconectar depois.",{okLabel:"Desconectar"}))) return;
  setStateRepo(""); localStorage.removeItem(LS_KEY+"-syncat");
  renderWsPill();
  renderWorkspaceState(); uiToast("Desconectada. O repo continua no GitHub.","ok");
}
async function deleteWorkspace(){
  const repo=stateRepo(); if(!repo) return;
  // defesa: só o admin da workspace pode apagar (o GitHub também barra, mas avisamos claro)
  try{ const info=await ghGet("/repos/"+repo);
    if(!(info&&info.permissions&&info.permissions.admin)){ uiToast("🔒 Só o admin da workspace pode apagá-la.","warn"); return; }
  }catch(e){}
  const typed=await uiPrompt({title:"⚠️ Apagar a workspace PARA SEMPRE?", danger:true,
    message:`Isso APAGA o repositório "${repo}" do teu GitHub de forma PERMANENTE.\n\nVocê vai PERDER TUDO que está salvo nele: empresas, projetos, memórias, pendências e todo o histórico da workspace. NÃO tem como desfazer, nem eu nem o GitHub recuperam.\n\nSe tem certeza, digite o nome exato do repositório pra confirmar:`,
    placeholder:repo, okLabel:"Apagar tudo de vez", confirmText:repo});
  if(typed===null) return;
  try{
    const r=await fetch("https://api.github.com/repos/"+repo,{method:"DELETE",headers:ghApiHeaders()});
    if(!r.ok && r.status!==204){ const j=await r.json().catch(()=>({}));
      throw new Error((r.status===403?"teu token não pode apagar. Re-entre com o GitHub pra pegar o novo acesso. ":"")+(j.message||("HTTP "+r.status))); }
    setStateRepo(""); localStorage.removeItem(LS_KEY+"-syncat");
    wsForget(repo); renderWsPill();
    renderWorkspaceState(); uiToast("Workspace apagada do GitHub.","ok");
  }catch(e){ uiToast("Apagar: "+(e.message||e),"bad"); }
}

