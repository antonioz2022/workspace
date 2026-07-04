/* ===== ⚙ Conta & Workspace: abas + header de conta + logout ===== */
function switchAccTab(name){
  document.querySelectorAll(".acc-tab").forEach(b=>b.classList.toggle("on", b.dataset.tab===name));
  document.querySelectorAll(".tabpane").forEach(p=>p.classList.toggle("on", p.id==="tab-"+name));
}
function renderAccHeader(){
  const el=document.getElementById("accHeader"); if(!el) return;
  const tok=(DB.settings||{}).githubToken;
  const login=localStorage.getItem(LS_KEY+"-ghlogin");
  if(tok){
    el.innerHTML=`<div class="acc-id">
      <span class="av">${esc((login||"?").slice(0,1).toUpperCase())}</span>
      <span style="flex:1;min-width:0"><b>@${esc(login||"conectado")}</b><br><span style="font-size:11.5px;color:var(--tx3)">GitHub conectado${login?"":" (token manual)"} · workspace ${esc(stateRepo()||"não configurada")}</span></span>
      <button class="btn sm" onclick="githubLogout()">Sair</button>
    </div>`;
  }else{
    el.innerHTML=`<div class="acc-id">
      <span class="av" style="background:var(--glass2); border:1px solid var(--line2)">🐙</span>
      <span style="flex:1;min-width:0"><b>Desconectado</b><br><span style="font-size:11.5px;color:var(--tx3)">entre pra sincronizar e gerenciar a workspace daqui</span></span>
      <button class="btn sm primary" onclick="githubLogin()">⚡ Entrar com GitHub</button>
    </div>`;
  }
}
async function githubLogout(){
  // Local-first: o mapa vive NESTE navegador. Um modal do app (não popup nativo)
  // com 3 opções claras — inclui limpar os dados p/ máquina compartilhada.
  const choice=await uiDialog({
    title:"Sair da conta GitHub?",
    message:"O acesso deste painel é removido (as IAs já conectadas continuam).\n\nEm computador compartilhado, você pode limpar os dados da workspace deste navegador. Eles voltam quando você entrar de novo (ficam salvos no repo privado).",
    buttons:[
      {label:"Cancelar", value:""},
      {label:"Só sair", value:"out", kind:"primary"},
      {label:"Sair e limpar", value:"wipe", kind:"danger"}
    ], cancelValue:""
  });
  if(!choice) return;
  const tok=(DB.settings||{}).githubToken||"";
  if(/^gho_/.test(tok)){ // token do login (OAuth) → revoga no GitHub também (best-effort)
    try{ await fetch(mcpUrl()+"/panel/logout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({access_token:tok})}); }catch(e){}
  }
  if(choice==="wipe"){
    ["","-syncat","-patexp","-ghlogin"].forEach(s=>localStorage.removeItem(LS_KEY+s));
    try{ await idbSet("brainDir", null); }catch(e){} // solta o handle da pasta local do cérebro
    location.reload();
    return;
  }
  setGithubToken("");
  localStorage.removeItem(LS_KEY+"-ghlogin");
  const gi=document.getElementById("ghTokenInput"); if(gi) gi.value="";
  const card=document.getElementById("ghLoginCard"); if(card){ card.style.display="none"; card.innerHTML=""; }
  renderAccHeader(); renderMembers(); renderMcpConnections(); renderWatchdog(); renderWorkspaceState();
  uiToast("Você saiu da conta GitHub.", "ok");
}

