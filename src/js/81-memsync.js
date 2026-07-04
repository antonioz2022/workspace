/* ===== 🔄 Reconciliador de memória — a Brain sabe quando está defasada =====
   Fecha o buraco "nada percebe que a memória está velha": compara o último commit do
   repo de CÓDIGO com a última vez que a memoria.md deste projeto foi atualizada no
   cérebro (workspace-state). Se o código andou DEPOIS da memória, sinaliza no drawer e
   no cockpit, e oferece a ponte (📋 Contexto p/ IA) pra a IA da sessão escrever de volta. */
const memSyncCache={};   // pid -> {stale, count, memTs, codeTs, never, at}
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
  let codeTs=null, count=0;
  try{
    // commits do código DEPOIS da última atualização da memória (memória nova → últimos)
    const q = memTs ? `&since=${new Date(memTs+1000).toISOString()}` : "";
    const j=await ghGet(`/repos/${o}/${r}/commits?per_page=20${q}`);
    if(Array.isArray(j)){
      count=j.length;
      if(j[0]&&j[0].commit&&j[0].commit.author) codeTs=Date.parse(j[0].commit.author.date);
    }
  }catch(e){ return null; }
  const res={ stale:(memTs===null)?true:count>0, count, memTs, codeTs, never:memTs===null, at:Date.now() };
  memSyncCache[p.id]=res;
  return res;
}
function memSyncBannerHtml(res,pid){
  if(!res || !res.stale) return "";
  const box=inner=>`<div style="font-size:12px;color:var(--warn);background:rgba(245,165,36,.09);border:1px solid rgba(245,165,36,.28);border-radius:9px;padding:8px 11px;margin:2px 0 8px">${inner}
    <div style="margin-top:6px"><button class="btn sm" onclick="copyProjectContext('${pid}')" title="Monta o prompt (commits + pendências + memória) pra a IA da sessão do repo reescrever a memória">📋 Gerar atualização pra IA</button></div></div>`;
  if(res.never) return box(`⚠ A memória deste projeto <b>ainda não foi escrita no cérebro</b>. Escreva acima (sobe sozinho) ou gere o contexto pra sua IA.`);
  const n=res.count>=20?"20+":String(res.count);
  return box(`⚠ <b>Memória possivelmente defasada:</b> ${n} commit(s) no repo desde a última atualização da memória${res.memTs?` · memória ${esc(agoStr(res.memTs))}`:""}${res.codeTs?` · último commit ${esc(agoStr(res.codeTs))}`:""}.`);
}
async function hydrateMemSync(c,p){
  const paint=res=>{ const el=document.getElementById("memSyncBanner"); if(el && (!sel||sel.id===p.id)) el.innerHTML = res?memSyncBannerHtml(res,p.id):""; };
  const cache=memSyncCache[p.id];
  if(cache && Date.now()-cache.at < 90000){ paint(cache); return; }   // TTL: não re-bate a API a cada re-render
  paint(await computeMemStale(c,p).catch(()=>null));
}
