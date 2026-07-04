/* ===== 🔄 Reconciliador de memória — a Brain sabe quando está defasada =====
   Fecha o buraco "nada percebe que a memória está velha": compara o último commit do
   repo de CÓDIGO com a última vez que a memoria.md deste projeto foi atualizada no
   cérebro (workspace-state). Se o código andou DEPOIS da memória, sinaliza no drawer e
   no cockpit, e oferece DUAS saídas: 📋 Contexto p/ IA (a IA da sessão reescreve) e
   💾 rascunho de checkpoint gerado dos commits, aceito com 1 clique, sem IA. */
const memSyncCache={};   // pid -> {stale, count, memTs, codeTs, never, at, commits[]}
async function brainMemoriaTs(c,p){
  // data do último commit no cérebro que tocou a memoria.md deste projeto
  if(!stateSyncOn()) return undefined;                 // sem cérebro → não opina
  const path=`${brainDirOf(c,p)}/memoria.md`;
  try{
    const j=await ghGet(`/repos/${stateRepo()}/commits?path=${encodeURIComponent(path)}&per_page=1`);
    if(Array.isArray(j) && j[0] && j[0].commit && j[0].commit.author && j[0].commit.author.date)
      return Date.parse(j[0].commit.author.date);
    return null;                                        // memória ainda não existe no cérebro
  }catch(e){ return undefined; }                        // sem acesso/erro → não opina
}
async function computeMemStale(c,p){
  if(!p.github || p.noRepo || !stateSyncOn()) return null;   // só faz sentido com repo + cérebro
  const memTs=await brainMemoriaTs(c,p);
  if(memTs===undefined) return null;
  const [o,r]=p.github.split("/");
  let codeTs=null, count=0, commits=[];
  try{
    // commits do código DEPOIS da última atualização da memória (memória nova → últimos)
    const q = memTs ? `&since=${new Date(memTs+1000).toISOString()}` : "";
    const j=await ghGet(`/repos/${o}/${r}/commits?per_page=20${q}`);
    if(Array.isArray(j)){
      count=j.length;
      if(j[0]&&j[0].commit&&j[0].commit.author) codeTs=Date.parse(j[0].commit.author.date);
      commits=j.map(x=>({
        sha:String(x.sha||"").slice(0,7),
        when:String((x.commit&&x.commit.author&&x.commit.author.date)||"").slice(0,10),
        msg:String((x.commit&&x.commit.message)||"").split("\n")[0].slice(0,110)
      }));
    }
  }catch(e){ return null; }
  const res={ stale:(memTs===null)?true:count>0, count, memTs, codeTs, never:memTs===null, at:Date.now(), commits };
  memSyncCache[p.id]=res;
  return res;
}
function memSyncBannerHtml(res,pid){
  if(!res || !res.stale) return "";
  const draftBtn=(res.commits&&res.commits.length)
    ?`<button class="btn sm primary" onclick="memDraftCheckpoint('${pid}')" title="Gera um rascunho de checkpoint a partir dos commits e salva na memória com 1 clique, sem depender de IA">💾 Rascunho de checkpoint</button> `
    :"";
  const auto=memAutoDraftOn()
    ?`auto ligado · <a href="#" onclick="memAutoToggle('${pid}');return false" style="color:var(--tx3)">desligar</a>`
    :`auto desligado · <a href="#" onclick="memAutoToggle('${pid}');return false" style="color:var(--tx3)">ligar</a>`;
  const box=inner=>`<div style="font-size:12px;color:var(--warn);background:rgba(245,165,36,.09);border:1px solid rgba(245,165,36,.28);border-radius:9px;padding:8px 11px;margin:2px 0 8px">${inner}
    <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">${draftBtn}<button class="btn sm" onclick="copyProjectContext('${pid}')" title="Monta o prompt (commits + pendências + memória) pra a IA da sessão do repo reescrever a memória">📋 Gerar atualização pra IA</button><span style="font-size:10.5px;color:var(--tx3)" title="Com o automático ligado, ao abrir o painel os commits sem checkpoint viram sessão na memória sem clique">${auto}</span></div></div>`;
  if(res.never) return box(`⚠ A memória deste projeto <b>ainda não foi escrita no cérebro</b>. Escreva acima (sobe sozinho) ou gere o contexto pra sua IA.`);
  const n=res.count>=20?"20+":String(res.count);
  return box(`⚠ <b>Memória possivelmente defasada:</b> ${n} commit(s) no repo desde a última atualização da memória${res.memTs?` · memória ${esc(agoStr(res.memTs))}`:""}${res.codeTs?` · último commit ${esc(agoStr(res.codeTs))}`:""}.`);
}
/* ===== modo automático: o painel aceita o rascunho SOZINHO ao abrir =====
   Memória defasada só importa quando alguém lê; a leitura pelo painel é este momento.
   No boot (após o pull do estado), varre os projetos com repo e, se houver commits
   depois da memória, grava o rascunho sem clique. Conservador: preserva o 🎯 existente
   (só o clique manual troca o foco), nunca cria memória do zero (never → só banner) e
   dá pra desligar no próprio banner (DB.settings.memAutoDraft=false, sincroniza). */
function memAutoDraftOn(){ return ((DB.settings||{}).memAutoDraft)!==false; }
function memAutoToggle(pid){
  DB.settings=DB.settings||{}; DB.settings.memAutoDraft=!memAutoDraftOn();
  save(); if(typeof scheduleSync==="function") scheduleSync();
  const f=findNode(pid); if(f&&f.type==="pj") hydrateMemSync(f.co,f.pj);
  uiToast(memAutoDraftOn()?"Rascunho automático ligado: ao abrir o painel, commits sem checkpoint viram sessão na memória.":"Rascunho automático desligado: volta a pedir o clique no banner.");
}
function memAutoApplyDraft(p,res){
  const body=[`Rascunho automático (aceito sozinho ao abrir o painel) a partir dos commits do repo \`${p.github||""}\`:`]
    .concat(res.commits.map(x=>`- \`${x.sha}\` ${x.when}: ${x.msg}`)).join("\n");
  const curFocus=(typeof projFocus==="function"?projFocus(p):"")||"";
  const next=curFocus || `revisar e continuar do último commit: ${res.commits[0].msg}`.slice(0,160);
  memInsertSession(p, body, next);
  p._memDirty=true;
  memSyncCache[p.id]={stale:false,count:0,memTs:Date.now(),codeTs:null,never:false,at:Date.now(),commits:[]};
}
async function memAutoDraftSweep(){
  if(!stateSyncOn() || !memAutoDraftOn()) return 0;
  let saved=0;
  for(const c of DB.companies) for(const p of (c.projects||[])){
    if(!p.github || p.noRepo) continue;
    const res=await computeMemStale(c,p).catch(()=>null);
    if(!res || !res.stale || res.never || !res.commits || !res.commits.length) continue;
    memAutoApplyDraft(p,res); saved++;
  }
  if(saved){
    save(); if(typeof scheduleSync==="function") scheduleSync();
    if(sel){ const f=findNode(sel.id); if(f&&f.type==="pj") openDrawer(f); }
    uiToast(`🧠 ${saved} memória(s) atualizada(s) sozinha(s) com o rascunho dos commits. Revise no projeto se quiser ajustar.`,"ok");
  }
  return saved;
}
/* 💾 Rascunho de checkpoint: transforma os commits órfãos numa sessão datada na memória
   (mesmo formato da tool MCP checkpoint, via memInsertSession) — o pior caso deixa de ser
   "memória parada há dias" e vira "1 clique pra aceitar um resumo automático". */
async function memDraftCheckpoint(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  let res=memSyncCache[pid];
  if(!res || !res.commits || Date.now()-res.at>90000) res=await computeMemStale(f.co,f.pj).catch(()=>null);
  if(!res || !res.commits || !res.commits.length){ uiToast("Nenhum commit novo pra rascunhar."); return; }
  const body=[`Rascunho automático a partir dos commits do repo \`${f.pj.github||""}\` (trabalho sem checkpoint de IA):`]
    .concat(res.commits.map(x=>`- \`${x.sha}\` ${x.when}: ${x.msg}`)).join("\n");
  const next=`revisar e continuar do último commit: ${res.commits[0].msg}`.slice(0,160);
  memDraftDialog(pid, body, next);
}
function memDraftDialog(pid, body, next){
  const ov=document.createElement("div"); ov.className="ui-ov";
  const dlg=document.createElement("div"); dlg.className="ui-dlg"; dlg.style.width="min(560px,92vw)"; dlg.style.maxWidth="560px";
  dlg.innerHTML=`<h4>💾 Rascunho de checkpoint</h4>
    <p>Gerado a partir dos commits do repo. Revise, ajuste se quiser e salve: vira uma sessão datada na memória e sincroniza com a brain.</p>
    <label style="font-size:11px;color:var(--tx3)">🎯 Onde parei</label>
    <input class="mem-draft-next" style="width:100%;margin:4px 0 10px">
    <label style="font-size:11px;color:var(--tx3)">Resumo da sessão</label>
    <textarea class="mem-draft-body" style="width:100%;min-height:150px;margin-top:4px;background:rgba(0,0,0,.32);border:1px solid var(--line);border-radius:9px;color:var(--tx);padding:8px;font:12px/1.5 'JetBrains Mono',ui-monospace,monospace;resize:vertical"></textarea>
    <div class="btns"><button class="btn">Cancelar</button><button class="btn primary ok">💾 Salvar na memória</button></div>`;
  const inp=dlg.querySelector(".mem-draft-next"), ta=dlg.querySelector(".mem-draft-body");
  inp.value=next; ta.value=body;                         // .value (nunca innerHTML): msg de commit não vira HTML
  let done=false;
  const close=()=>{ if(done)return; done=true; ov.remove(); document.removeEventListener("keydown",onKey); };
  function onKey(e){ if(e.key==="Escape") close(); }
  dlg.querySelector(".btns .btn:not(.ok)").onclick=close;
  ov.onclick=e=>{ if(e.target===ov) close(); };
  document.addEventListener("keydown",onKey);
  dlg.querySelector(".ok").onclick=()=>{
    const f=findNode(pid); if(!f||f.type!=="pj"){ close(); return; }
    const b=(ta.value||"").trim(), n=(inp.value||"").trim();
    if(!b&&!n){ close(); return; }
    memInsertSession(f.pj, b||"(rascunho de commits aceito)", n||(b.split("\n")[0]||"").slice(0,160));
    f.pj._memDirty=true; save(); if(typeof scheduleSync==="function") scheduleSync();
    memSyncCache[pid]={stale:false,count:0,memTs:Date.now(),codeTs:null,never:false,at:Date.now(),commits:[]};
    close(); openDrawer(findNode(pid));
    uiToast("Checkpoint salvo na memória e a caminho da brain. Qualquer aparelho ou conta de IA retoma daqui.","ok");
  };
  ov.appendChild(dlg); document.body.appendChild(ov);
  inp.focus();
}
async function hydrateMemSync(c,p){
  const paint=res=>{ const el=document.getElementById("memSyncBanner"); if(el && (!sel||sel.id===p.id)) el.innerHTML = res?memSyncBannerHtml(res,p.id):""; };
  const cache=memSyncCache[p.id];
  if(cache && Date.now()-cache.at < 90000){ paint(cache); return; }   // TTL: não re-bate a API a cada re-render
  paint(await computeMemStale(c,p).catch(()=>null));
}
