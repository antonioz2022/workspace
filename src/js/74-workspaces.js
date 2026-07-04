/* ===== 🗂 Workspaces: lista local (por navegador) + troca rápida entre workspaces =====
   A lista de workspaces conhecidas fica só neste navegador (como o token), NÃO vai pro
   state.json — pra não vazar os nomes das suas outras workspaces pros colaboradores de uma. */
function wsKnownList(){
  try{ const a=JSON.parse(localStorage.getItem(LS_KEY+"-workspaces")||"[]"); return Array.isArray(a)?a.filter(x=>x&&x.repo):[]; }catch(e){ return []; }
}
function wsSaveKnown(list){ localStorage.setItem(LS_KEY+"-workspaces", JSON.stringify(list.slice(0,40))); }
function wsRemember(repo){
  repo=(repo||"").trim(); if(!/^[^/\s]+\/[^/\s]+$/.test(repo)) return;
  const list=wsKnownList(); const e=list.find(x=>x.repo===repo);
  if(e){ e.lastUsed=Date.now(); } else { list.push({repo, lastUsed:Date.now()}); }
  list.sort((a,b)=>(b.lastUsed||0)-(a.lastUsed||0));
  wsSaveKnown(list);
}
function wsForget(repo){ wsSaveKnown(wsKnownList().filter(x=>x.repo!==repo)); renderWsModal(); }
function renderWsPill(){
  const b=document.getElementById("wsPill"); if(!b) return;
  const r=stateRepo();
  b.innerHTML = r ? `🗂 ${esc(r.split("/")[1]||r)} ▾` : `🗂 Workspace`;
  b.title = r ? `Workspace ativa: ${r} · clique pra trocar` : "Escolha ou crie uma workspace";
}
function openWsModal(){ renderWsModal(); document.getElementById("wsModal").classList.add("open"); }
function renderWsModal(){
  const box=document.getElementById("wsList"); if(!box) return;
  const active=stateRepo();
  if(!(DB.settings||{}).githubToken){
    box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">Entre com o GitHub (em <b>⚙ Contas</b>) pra ver e trocar de workspace.</div>`;
    renderWsPill(); return;
  }
  if(active) wsRemember(active);
  const list=wsKnownList();
  if(!list.length){
    box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">Nenhuma workspace conhecida ainda. Crie a primeira, conecte por owner/repo ou procure no seu GitHub.</div>`;
  } else box.innerHTML=list.map(w=>{
    const on=w.repo===active, r=esc(w.repo), nm=esc(w.repo.split("/")[1]||w.repo), ow=esc(w.repo.split("/")[0]);
    return `<div class="acc-id" style="${on?'border-color:var(--ac); background:rgba(139,92,246,.10)':''}">
      <span class="av" style="background:var(--glass2); border:1px solid var(--line2)">${on?'✅':'☁'}</span>
      <span style="flex:1; min-width:0">
        <b>${nm}</b> <span style="font-size:11px; color:var(--tx3)">${ow}</span>
        <br><span style="font-size:11px; color:var(--tx3)">${on?'workspace ativa':('usada '+esc(agoStr(w.lastUsed)||'antes'))}</span>
      </span>
      ${on
        ? `<span style="font-size:11px; color:var(--ac2); font-weight:700">✓ aqui</span>`
        : `<button class="btn sm primary" onclick="switchWorkspace('${r}')">Entrar</button>`+
          `<button class="btn sm" title="tirar da lista (não apaga o repo no GitHub)" onclick="wsForget('${r}')">×</button>`}
    </div>`;
  }).join("");
  renderWsPill();
}
async function switchWorkspace(repo){
  repo=(repo||"").trim();
  if(!/^[^/\s]+\/[^/\s]+$/.test(repo)) return;
  if(repo===stateRepo()){ closeModals(); return; }
  if(!(DB.settings||{}).githubToken){ uiToast("Entre com o GitHub primeiro.","warn"); return; }
  const prev=stateRepo();
  uiToast("Trocando pra "+(repo.split("/")[1]||repo)+"…");
  try{ if(stateSyncOn()) await pushState(); }catch(e){}   // salva a atual antes: nada se perde
  setStateRepo(repo);
  localStorage.removeItem(LS_KEY+"-syncat");
  const pulled=await pullState({force:true}).catch(()=>false);
  if(!pulled){
    // repo sem state.json → não mistura dados da anterior: volta pra ela
    setStateRepo(prev||"");
    if(prev) localStorage.removeItem(LS_KEY+"-syncat");
    uiToast("Não achei o estado dessa workspace (repo sem state.json). Continuei na atual.","bad");
    renderWsModal(); return;
  }
  wsRemember(repo);
  renderWorkspaceState(); renderWsModal(); renderWsPill();
  try{ if(typeof renderDock==="function") renderDock(); }catch(e){}
  closeModals();
  uiToast("Agora em "+(repo.split("/")[1]||repo)+" ✓","ok");
}
async function wsConnectByName(){
  const login=localStorage.getItem(LS_KEY+"-ghlogin")||"";
  const repo=await uiPrompt({title:"Conectar workspace", message:"Cole o repo (owner/repo) da workspace que você quer abrir:", value:login?login+"/":"", placeholder:"owner/repo", okLabel:"Conectar"});
  if(repo===null) return;
  if(!/^[^/\s]+\/[^/\s]+$/.test((repo||"").trim())){ uiToast("Formato inválido. Use owner/repo.","warn"); return; }
  await switchWorkspace(repo.trim());
}
async function wsCreateNew(){ await createWorkspace(); wsRemember(stateRepo()); renderWsModal(); renderWsPill(); }
async function wsScanGithub(){
  if(!(DB.settings||{}).githubToken){ uiToast("Entre com o GitHub primeiro.","warn"); return; }
  const st=document.getElementById("wsScanStatus");
  if(st) st.textContent="🔍 procurando… (checando seus repositórios)";
  ghRepoListCache=null;                       // pega a lista fresca
  const repos=await ghMyRepos(), cap=repos.slice(0,60);
  let found=0;
  await Promise.all(cap.map(async r=>{
    try{ const f=await ghGetFile(r, STATE_PATH); if(f){ wsRemember(r); found++; } }catch(e){}
  }));
  if(st) st.textContent=`Olhei ${cap.length} repo(s)${repos.length>cap.length?` (de ${repos.length}; limitei a 60)`:""}. Achei ${found} workspace(s).`;
  renderWsModal();
}
function wsBoot(){ const r=stateRepo(); if(r) wsRemember(r); renderWsPill(); }

