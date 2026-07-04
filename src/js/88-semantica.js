/* ===== 🔎🧠 Busca semântica na Brain (embeddings) — "pergunte qualquer coisa" =====
   Fecha o buraco "busca é só por palavra": em vez de keyword, indexa o SIGNIFICADO do
   conteúdo da brain e acha por proximidade. Roda 100% LOCAL no browser (transformers.js,
   modelo all-MiniLM-L6-v2 ~23MB baixado 1x e cacheado) — zero chave, zero servidor,
   US$0. O corpus sai do próprio DB (sempre atual, offline), o índice mora no IndexedDB,
   e a busca é cosseno em JS (a brain é pequena). Embedder é PLUGÁVEL (troca por serviço
   hospedado depois; testes injetam um fake determinístico). */
const EMB_MODEL="Xenova/paraphrase-multilingual-MiniLM-L12-v2";   // multilíngue: essencial p/ conteúdo em PT
const SEMIDX_KEY="cortex-semindex";
let _embPipe=null, _emb=null, semIndex=null;
function setEmbedder(fn){ _emb=fn; }   // testes/serviço hospedado: fn(texts:string[]) -> vetores normalizados
async function localEmbedder(texts){
  const mod=await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
  if(mod.env){ mod.env.allowLocalModels=false; mod.env.useBrowserCache=true; }
  if(!_embPipe) _embPipe=await mod.pipeline("feature-extraction", EMB_MODEL);
  const out=[];
  for(const t of texts){ const r=await _embPipe(t,{pooling:"mean", normalize:true}); out.push(Array.from(r.data)); }
  return out;
}
async function embed(texts){ return (_emb||localEmbedder)(texts); }

/* corpus: gera os trechos direto do DB (memória/pendências/projeto/empresa/grafo) — local, sempre fresco */
function chunkText(t){
  const parts=(t||"").split(/\n\s*\n/).map(s=>s.trim()).filter(s=>s.length>=25);
  const out=[];
  for(let s of parts){ while(s.length>1000){ out.push(s.slice(0,1000)); s=s.slice(900); } out.push(s); }
  return out;
}
function brainCorpus(){
  const items=[];
  const add=(text, meta)=>{ for(const c of chunkText(text)) items.push(Object.assign({text:`[${meta.scope}] ${c}`}, meta, {raw:c})); };
  for(const c of DB.companies){
    add(genEmpresaMd(c), {scope:`empresa ${c.name}`, coId:c.id, file:"empresa.md", goId:c.id});
    for(const p of (c.projects||[])){
      if(p.context) add(p.context, {scope:`${p.name} · ${c.name}`, pjId:p.id, file:"memoria.md", goId:p.id});
      if(typeof serTodos==="function") add(serTodos(p), {scope:`${p.name} · ${c.name}`, pjId:p.id, file:"pendencias.md", goId:p.id});
      if(typeof genProjetoMd==="function") add(genProjetoMd(c,p), {scope:`${p.name} · ${c.name}`, pjId:p.id, file:"projeto.md", goId:p.id});
    }
  }
  if(typeof genGrafoMd==="function" && (DB.links||[]).length) add(genGrafoMd(), {scope:"grafo de relações", file:"GRAFO.md"});
  return items;
}
async function buildSemIndex(onProgress){
  const items=brainCorpus();
  if(!items.length){ semIndex={model:EMB_MODEL, builtAt:Date.now(), items:[]}; await idbSet(SEMIDX_KEY, semIndex); return semIndex; }
  const vecs=[]; const B=12;
  for(let i=0;i<items.length;i+=B){
    const batch=items.slice(i,i+B);
    const v=await embed(batch.map(x=>x.text));
    for(const vv of v) vecs.push(vv);
    if(onProgress) onProgress(Math.min(i+B, items.length), items.length);
  }
  semIndex={ model:EMB_MODEL, builtAt:Date.now(), repo:(typeof stateRepo==="function"?stateRepo():"")||"",
    items:items.map((it,i)=>({scope:it.scope, file:it.file, goId:it.goId||null, raw:it.raw, vec:vecs[i]})) };
  await idbSet(SEMIDX_KEY, semIndex);
  return semIndex;
}
async function loadSemIndex(){ if(!semIndex) semIndex=await idbGet(SEMIDX_KEY).catch(()=>null); return semIndex; }
function cosine(a,b){ let s=0, n=Math.min(a.length,b.length); for(let i=0;i<n;i++) s+=a[i]*b[i]; return s; }   // vetores normalizados → dot
async function semSearch(query, k){
  const idx=await loadSemIndex();
  if(!idx || !idx.items || !idx.items.length) return {needIndex:true, results:[]};
  const [qv]=await embed([query]);
  const scored=idx.items.map(it=>({scope:it.scope, file:it.file, goId:it.goId, raw:it.raw, score:cosine(qv, it.vec)}));
  scored.sort((a,b)=>b.score-a.score);
  return {results:scored.slice(0, k||8)};
}

/* ===== UI: modal "🧠 Perguntar à brain" ===== */
function askIndexStatus(){
  const el=document.getElementById("askStatus"); if(!el) return;
  loadSemIndex().then(idx=>{
    if(!idx || !idx.items || !idx.items.length){ el.innerHTML=`<span style="color:var(--tx3)">sem índice ainda — clique <b>Reindexar</b> pra ligar a busca semântica (baixa um modelinho ~23MB na 1ª vez, depois é offline).</span>`; return; }
    el.innerHTML=`<span style="color:var(--tx3)">índice: <b>${idx.items.length}</b> trecho(s) · ${esc(idx.model.split("/").pop())} · ${typeof agoStr==="function"?agoStr(idx.builtAt):""}</span>`;
  });
}
function openAsk(){
  document.getElementById("askModal").classList.add("open");
  document.getElementById("askResults").innerHTML="";
  document.getElementById("askAnswer").innerHTML="";
  askIndexStatus();
  setTimeout(()=>{ const i=document.getElementById("askInput"); if(i) i.focus(); }, 40);
}
let askBuilding=false;
async function askReindex(){
  if(askBuilding) return;
  askBuilding=true;
  const btn=document.getElementById("askReindexBtn"), st=document.getElementById("askStatus");
  const set=s=>{ if(btn) btn.textContent=s; };
  set("⏳ preparando…");
  try{
    await buildSemIndex((done,total)=>{ if(st) st.innerHTML=`<span style="color:var(--tx3)">indexando… ${done}/${total} trechos${done<total?" (baixando o modelo na 1ª vez pode demorar)":""}</span>`; });
    askIndexStatus(); uiToast("Índice semântico pronto.","ok");
  }catch(e){ if(st) st.innerHTML=`<span style="color:var(--warn)">falha ao indexar: ${esc(e.message||String(e))}</span>`; }
  set("↻ Reindexar"); askBuilding=false;
}
async function askRun(){
  const q=(document.getElementById("askInput").value||"").trim();
  const box=document.getElementById("askResults"), ans=document.getElementById("askAnswer");
  ans.innerHTML="";
  if(q.length<3){ box.innerHTML=`<div class="empty-mini"><span class="ico">🔎</span>Escreva uma pergunta (ex.: "quais projetos usam o Kommo?", "o que conecta o Publicador ao Dragon Block?").</div>`; return; }
  box.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">buscando por significado…</div>`;
  let r; try{ r=await semSearch(q, 8); }
  catch(e){ box.innerHTML=`<div class="dr-desc" style="color:var(--warn)">falha na busca: ${esc(e.message||String(e))}</div>`; return; }
  if(r.needIndex){ box.innerHTML=`<div class="empty-mini"><span class="ico">🧠</span>Ainda não há índice. Clique <b>Reindexar</b> acima pra ligar a busca semântica.</div>`; return; }
  const hits=(r.results||[]).filter(x=>x.score>0.15);
  if(!hits.length){ box.innerHTML=`<div class="empty-mini"><span class="ico">🫥</span>Nada relevante achado. Talvez o índice esteja velho — Reindexar, ou reformule.</div>`; return; }
  box.innerHTML=`<div class="agenda-h">🔎 Trechos mais relevantes</div>`+hits.map(h=>`
    <div class="mini-item" ${h.goId?`onclick="closeModals();jumpTo('${h.goId}')" style="cursor:pointer"`:`style="cursor:default"`}>
      <span class="mi-emoji" title="proximidade">${Math.round(h.score*100)}%</span>
      <span style="flex:1;min-width:0"><b>${esc(h.scope)}</b> <span style="color:var(--tx3);font-size:11px">· ${esc(h.file)}</span><br><span style="font-size:11.5px;color:var(--tx2)">${esc((h.raw||"").replace(/\s+/g," ").slice(0,150))}…</span></span>
      ${h.goId?`<span class="arrow">→</span>`:""}
    </div>`).join("");
  // "responder com IA" (RAG) se houver provider configurado
  if(typeof PROVS==="function" && PROVS().length){
    ans.innerHTML=`<button class="btn sm primary" id="askAnsBtn" onclick="askAnswer()">💬 Responder com IA (usa os trechos acima)</button>`;
    window._askCtx={q, hits};
  }else{
    ans.innerHTML=`<div style="font-size:11px;color:var(--tx3);margin-top:6px">Pra uma RESPOSTA escrita (não só trechos), adicione uma conta de IA em 💬 Chat — aí aparece "Responder com IA".</div>`;
  }
}
async function askAnswer(){
  const ctx=window._askCtx; if(!ctx) return;
  const prov=PROVS()[0], model=prov.models[0];
  const ans=document.getElementById("askAnswer");
  ans.innerHTML=`<div class="dr-sec" style="margin-top:10px">💬 Resposta (${esc(typeof shortModel==="function"?shortModel(model):model)})</div><div id="askAnsBody" class="notes">…</div>`;
  const body=document.getElementById("askAnsBody"); let acc="";
  const system=`Você responde perguntas sobre as empresas/projetos do Antonio usando SÓ os trechos da brain fornecidos. Seja direto e factual, cite de qual projeto/empresa veio cada informação, e se algo não estiver nos trechos diga que não encontrou. Português.`;
  const ctxText=ctx.hits.map(h=>`### ${h.scope} · ${h.file}\n${h.raw}`).join("\n\n");
  const messages=[{role:"user", content:`Pergunta: ${ctx.q}\n\nTrechos da brain:\n${ctxText}`}];
  const onDelta=d=>{ acc+=d; body.innerHTML=(typeof mdlite==="function"?mdlite(acc):esc(acc)); };
  try{
    if(prov.kind==="anthropic") await streamAnthropic(prov, model, system, messages, onDelta);
    else await streamOpenAI(prov, model, system, messages, onDelta);
    if(!acc) body.textContent="(resposta vazia)";
  }catch(e){ body.innerHTML=`<span style="color:var(--warn)">falha: ${esc(e.message||String(e))}</span>`; }
}
