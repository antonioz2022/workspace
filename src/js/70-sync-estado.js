/* ===== Fase 2b-2: sync de estado multi-device (state.json em repo PRIVADO) =====
   O PAT vira o "login": colar o token + repo de estado num aparelho novo puxa tudo.
   SEGURANÇA: token e apiKeys NUNCA sobem — são removidos antes do upload e
   preservados localmente no pull. Estratégia: last-write-wins por updatedAt. */
const STATE_PATH="state.json";
let statePushTimer=null, stateApplying=false, statePushing=false;
function b64e(str){
  const b=new TextEncoder().encode(str); let bin="";
  for(let i=0;i<b.length;i+=0x8000) bin+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));
  return btoa(bin);
}
function b64d(b64){
  const bin=atob((b64||"").replace(/\s/g,"")); const b=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}
function stateRepo(){ const r=((DB.settings||{}).stateRepo||"").trim(); return /^[^/\s]+\/[^/\s]+$/.test(r)?r:null; }
function stateSyncOn(){ return !!(stateRepo() && (DB.settings||{}).githubToken); }
function sanitizeStateForSync(){
  const clone=JSON.parse(JSON.stringify(DB));
  if(clone.settings){
    // segredos e config de máquina NÃO vão pro repo: o token, e os PROVIDERS inteiros
    // (baseUrl/mcpUrl poderiam ser trocados por um Editor malicioso e vazar a chave local
    // pra outro domínio), além do histórico do dock. Ficam só neste navegador.
    delete clone.settings.githubToken;
    delete clone.settings.providers;
    delete clone.settings.mcpUrl;
    delete clone.settings.dock;
  }
  return clone;
}
function stateBadge(txt, ok){
  const el=document.getElementById("stateSyncStatus");
  if(el){ el.textContent=txt; el.style.color = ok===false ? "var(--warn)" : "var(--tx3)"; }
}
async function ghGetFile(repo,path){
  const j=await ghGet(`/repos/${repo}/contents/${encodeURIComponent(path)}`);
  if(!j||Array.isArray(j)) return null;
  return {sha:j.sha, text:b64d(j.content||"")};
}
async function ghPutFile(repo,path,text,sha,msg){
  const body={message:msg, content:b64e(text)}; if(sha) body.sha=sha;
  try{ return (await ghSend("PUT", `/repos/${repo}/contents/${encodeURIComponent(path)}`, body)).json; }
  catch(e){
    const api=(e.json&&e.json.message)?(" · "+e.json.message):"";
    if(e.status===403) e.message="GitHub 403: o token precisa de Contents: read AND write no repo de estado"+api;
    else if(e.status===404) e.message="GitHub 404: repo de estado não existe ou o token não o inclui"+api;
    throw e;   // e.status preservado — o pushState distingue conflito real (409/422) de falha de acesso
  }
}
let lastPushedDbStr=null;
/* hash curto (djb2+tamanho) SÓ pra detectar mudança — o guard do pull precisa saber se há
   edição local não sincronizada mesmo DEPOIS de um reload (lastPushedDbStr morre com a aba),
   então o hash do último push/pull fica persistido em LS_KEY+"-pushed". */
function strHash(s){ let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0; return h+":"+s.length; }
function rememberPushed(dbStr){ lastPushedDbStr=dbStr; try{ localStorage.setItem(LS_KEY+"-pushed", strHash(dbStr)); }catch(e){} }
async function pushState(){
  if(!stateSyncOn() || stateApplying || statePushing) return;
  const dbClean=sanitizeStateForSync(), dbStr=JSON.stringify(dbClean);
  // conteúdo idêntico ao último push → NÃO empurra (evita que pan/zoom ou re-render
  // carimbem updatedAt novo e sobrescrevam edições reais de outro aparelho)
  if(dbStr===lastPushedDbStr) return;
  statePushing=true; stateBadge("☁ enviando…");
  const who=localStorage.getItem(LS_KEY+"-ghlogin")||navigator.userAgent.slice(0,40);
  let lastErr=null;
  try{
    for(let tent=1; tent<=2; tent++){
      try{
        const payload={updatedAt:Date.now(), device:who, db:dbClean};
        const cur=await ghGetFile(stateRepo(),STATE_PATH).catch(()=>null); // re-lê o sha a cada tentativa
        await ghPutFile(stateRepo(),STATE_PATH, JSON.stringify(payload), cur&&cur.sha, "workspace: sync de estado");
        rememberPushed(dbStr);
        localStorage.setItem(LS_KEY+"-syncat", String(payload.updatedAt));
        stateBadge("☁ sincronizado "+hhmm(), true);
        statePushing=false; return;
      }catch(e){ lastErr=e; }
    }
    // 2 tentativas falharam. Só é CONFLITO quando o GitHub disse isso (409/422 = sha
    // desatualizado, alguém sincronizou no meio) — aí puxa a versão nova e avisa.
    // Falha persistente de OUTRA natureza (403 sem escrita, rede) NÃO pode virar pull
    // forçado: descartaria as edições locais em silêncio. Elas ficam aqui e re-tentam.
    statePushing=false;
    if(lastErr && (lastErr.status===409 || lastErr.status===422)){
      const pulled=await pullState({force:true}).catch(()=>false);
      stateBadge(pulled
        ? "☁ conflito: alguém sincronizou antes. Puxei a versão nova (revise e edite de novo se precisar)"
        : "☁ falha ao enviar: "+((lastErr&&lastErr.message)||lastErr), false);
    }else{
      stateBadge("☁ falha ao enviar: "+((lastErr&&lastErr.message)||lastErr)+" — suas edições continuam neste navegador; tento de novo na próxima edição/foco", false);
    }
  }catch(e){ stateBadge("☁ falha ao enviar: "+(e.message||e), false); statePushing=false; }
  statePushing=false;
}
function scheduleStatePush(){
  if(!stateSyncOn() || stateApplying) return;
  clearTimeout(statePushTimer); statePushTimer=setTimeout(pushState, 4000);
}
/* resumo legível do que o estado REMOTO muda em relação ao local (pro preview antes do pull) */
function diffState(remoteDb){
  const curP={}, remP={}, lines=[];
  DB.companies.forEach(c=>c.projects.forEach(p=>curP[p.id]={p,co:c.name}));
  (remoteDb.companies||[]).forEach(c=>c.projects.forEach(p=>remP[p.id]={p,co:c.name}));
  const curCo=new Set(DB.companies.map(c=>c.id)), remCo=new Set((remoteDb.companies||[]).map(c=>c.id));
  (remoteDb.companies||[]).forEach(c=>{ if(!curCo.has(c.id)) lines.push(`➕ empresa "${c.name}"`); });
  DB.companies.forEach(c=>{ if(!remCo.has(c.id)) lines.push(`➖ empresa "${c.name}" (some)`); });
  Object.keys(remP).forEach(id=>{ if(!curP[id]) lines.push(`➕ projeto "${remP[id].p.name}"`); });
  Object.keys(curP).forEach(id=>{ if(!remP[id]) lines.push(`➖ projeto "${curP[id].p.name}" (some)`); });
  Object.keys(remP).forEach(id=>{ if(!curP[id]) return;
    const a=curP[id].p, b=remP[id].p, ch=[];
    if((a.todos||[]).length!==(b.todos||[]).length) ch.push(`pendências ${(a.todos||[]).length}→${(b.todos||[]).length}`);
    if((a.context||"")!==(b.context||"")) ch.push("memória mudou");
    if((a.desc||"")!==(b.desc||"")) ch.push("descrição");
    if((a.apps||[]).length!==(b.apps||[]).length) ch.push(`serviços ${(a.apps||[]).length}→${(b.apps||[]).length}`);
    if(ch.length) lines.push(`✏ "${b.name}": ${ch.join(", ")}`);
  });
  return lines;
}
async function pullState({force=false}={}){
  if(!stateSyncOn() || statePushing) return false;
  const f=await ghGetFile(stateRepo(),STATE_PATH).catch(e=>{ stateBadge("☁ falha ao ler: "+(e.message||e), false); return null; });
  if(!f){ return false; }
  let payload; try{ payload=JSON.parse(f.text); }catch(e){ stateBadge("☁ state.json inválido", false); return false; }
  if(!payload || !payload.db || !Array.isArray(payload.db.companies)) return false;
  const last=parseInt(localStorage.getItem(LS_KEY+"-syncat")||"0",10);
  if(!force && !(payload.updatedAt>last)) return false;
  // PREVIEW/DIFF: remoto mais novo E há edições locais não sincronizadas → mostra o que muda e
  // confirma. A referência do "último sincronizado" sobrevive ao reload (hash persistido) —
  // senão um boot logo após editar (push ainda no debounce) aplicaria o remoto em silêncio.
  const pushedRef = lastPushedDbStr!==null ? strHash(lastPushedDbStr) : localStorage.getItem(LS_KEY+"-pushed");
  if(!force && pushedRef && strHash(JSON.stringify(sanitizeStateForSync()))!==pushedRef){
    const lines=diffState(payload.db);
    const resumo = lines.length ? lines.slice(0,12).map(l=>"• "+l).join("\n")+(lines.length>12?`\n• +${lines.length-12} mudança(s)…`:"") : "(mudanças pequenas)";
    const go = await uiConfirm(
      `O remoto está mais novo (por ${String(payload.device||"?").slice(0,24)}) e você tem edições locais não sincronizadas.\n\nPuxar SUBSTITUI o local por:\n\n${resumo}\n\nPuxar mesmo assim? (edições locais não enviadas se perdem)`,
      {danger:true, okLabel:"Puxar e substituir"});
    if(!go){ stateBadge("☁ pull adiado — você tem edições locais (elas sobem sozinhas ao editar/salvar)", false); return false; }
  }
  stateApplying=true;
  try{
    // preserva TUDO que é local (token, providers com as chaves, mcpUrl, dock) — ritual
    // único em applyIncomingState, compartilhado com restaurar versão e importar backup.
    applyIncomingState(payload.db);
    save();
    rememberPushed(JSON.stringify(sanitizeStateForSync()));   // acabou de aplicar o remoto → não re-empurra idêntico
    localStorage.setItem(LS_KEY+"-syncat", String(payload.updatedAt));
    render();
    if(typeof hideCollab==="function") hideCollab();   // aplicou → some o aviso de novidade
    stateBadge(`☁ atualizado do repo (por ${String(payload.device||"?").slice(0,24)}) `+hhmm(), true);
  }finally{ stateApplying=false; }
  return true;
}
function setStateRepo(v){ DB.settings=DB.settings||{}; DB.settings.stateRepo=(v||"").trim(); save();
  localStorage.removeItem(LS_KEY+"-pushed");   // referência de sync é POR workspace; o pull da nova regrava
  collabSeenAt=0; if(typeof hideCollab==="function") hideCollab();   // troca de workspace zera o aviso
  stateBadge(stateSyncOn()?"☁ sync ligada: salva sozinho após edições":"☁ desligada (precisa de token + repo)"); }

/* ===== colaboração viva: avisa quando alguém (ou outro aparelho seu) atualiza a workspace =====
   Enquanto o app está aberto, checa o state.json de tempos em tempos e mostra um banner
   NÃO-intrusivo em vez de aplicar de surpresa. Clicar "Atualizar" chama o pull (que ainda
   mostra o diff se você tiver edição local). É leve: só um GET do arquivo pequeno. */
let collabTimer=null, collabSeenAt=0;
function startCollabPoll(){ clearInterval(collabTimer); collabTimer=setInterval(collabTick, 45000); }
function collabTick(){
  if(typeof prefOn==="function" && !prefOn("collabNotify")) return;   // 🎚 preferência
  if(document.visibilityState==="visible") checkRemoteChanges().catch(()=>{});
}
async function checkRemoteChanges(){
  if(!stateSyncOn() || statePushing || stateApplying) return;
  const f=await ghGetFile(stateRepo(), STATE_PATH).catch(()=>null); if(!f) return;
  let payload; try{ payload=JSON.parse(f.text); }catch(e){ return; }
  if(!payload || !payload.updatedAt) return;
  const last=parseInt(localStorage.getItem(LS_KEY+"-syncat")||"0",10);
  if(payload.updatedAt>last && payload.updatedAt>collabSeenAt){
    collabSeenAt=payload.updatedAt;
    showCollabBanner(String(payload.device||"alguém").slice(0,24));
  }
}
function showCollabBanner(who){
  const el=document.getElementById("collabBanner"); if(!el) return;
  el.innerHTML=`<span>🔄 <b>${esc(who)}</b> atualizou a workspace</span>
    <button class="btn sm primary" onclick="applyCollab()">Atualizar</button>
    <button class="btn sm ghost" onclick="hideCollab()" title="ver depois">✕</button>`;
  el.classList.add("show");
}
function hideCollab(){ const el=document.getElementById("collabBanner"); if(el) el.classList.remove("show"); }
async function applyCollab(){ hideCollab(); await pullState({force:false}); }

