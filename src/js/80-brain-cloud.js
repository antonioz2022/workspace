/* ===== Fase 2c: ciclo fechado da brain — write-back + read remoto no cérebro =====
   O repo de estado É a Grande Brain: brain/<empresa>/<projeto>/{memoria,pendencias,
   projeto}.md + INDEX.md. Painel commita edições (qualquer device); IAs commitam por
   fora e o painel importa ao abrir o projeto (quando a pasta local não está no jogo). */
const queuedBrainPids=new Set(), queuedBrainCids=new Set();
let brainPushTimer=null, brainPushing=false;
let brainStructDirty=false;   // empresa/projeto excluído → INDEX precisa regenerar mesmo sem nada "dirty"
function brainDirOf(c,p){ return `brain/${slug(c.name)}/${slug(p.name)}`; }
function brainBadge(txt, ok){
  const el=document.getElementById("brainCloudBadge");
  if(el){ el.textContent=txt; el.style.color = ok===false ? "var(--warn)" : "var(--tx3)"; }
}
function genIndexMd(){
  const site="https://antonioz2022.github.io/workspace/";
  let out=`# 🧠 INDEX — Mapa-mestre do Workspace do Antonio\n\n`+
    `> **IA: comece por aqui.** Este arquivo diz o que existe e onde encontrar TUDO sobre\n`+
    `> cada empresa/projeto. Regras de uso em [LEIA-ME-IA.md](LEIA-ME-IA.md).\n`+
    `> Gerado pelo painel Workspace (${site}) — não editar à mão.\n`;
  for(const c of DB.companies){
    const cs=slug(c.name);
    out+=`\n## ${c.name}${c.desc?` — ${c.desc}`:""}\n`;
    out+=`Perfil: [brain/${cs}/empresa.md](brain/${cs}/empresa.md) · Brand kit: [brain/${cs}/brand/](brain/${cs}/brand/)\n`;
    if(typeof indexRelLine==="function") out+=indexRelLine(c.id);
    for(const p of c.projects){
      const d=brainDirOf(c,p);
      out+=`\n### ${p.name} (${p.status||"ativo"})\n`;
      if(p.desc) out+=`${p.desc}\n`;
      out+=`- **Memória viva**: [${d}/memoria.md](${d}/memoria.md)\n`;
      out+=`- **Pendências** (${(p.todos||[]).filter(t=>!t.done).length} abertas): [${d}/pendencias.md](${d}/pendencias.md)\n`;
      out+=`- **Cartão (serviços/custos)**: [${d}/projeto.md](${d}/projeto.md)\n`;
      out+=`- **Arquivos/assets**: [${d}/assets/](${d}/assets/)\n`;
      if(p.github) out+=`- **Código (git)**: \`${p.github}\` (privado)\n`;
      if(p.local) out+=`- **Pasta local (PC do Antonio)**: \`${p.local}\`\n`;
      const links=(p.apps||[]).filter(a=>a.url||a.dash).map(a=>`${a.name}: ${a.url||a.dash}`);
      if(links.length) out+=`- **Serviços**: ${links.join(" · ")}\n`;
      const ops=(p.apps||[]).filter(a=>a.ops||a.kind).map(a=>a.name);
      if(ops.length) out+=`- **Serviços operáveis** (runbook no projeto.md): ${ops.join(", ")}\n`;
      if(typeof indexRelLine==="function") out+=indexRelLine(p.id);
    }
  }
  if((DB.links||[]).length) out+=`\n> 🕸 Relações entre projetos/empresas/serviços: veja [GRAFO.md](GRAFO.md).\n`;
  out+=`\n---\n\n- \`state.json\` — estado do painel Workspace (uso interno do app)\n`+
    `- Painel público (interface): repo \`antonioz2022/workspace\` → ${site}\n`;
  return out;
}
async function putBrainFile(path, text, msg){
  const cur=await ghGetFile(stateRepo(), path).catch(()=>null);
  if(cur && cur.text===text) return false;   // sem mudança → sem commit
  await ghPutFile(stateRepo(), path, text, cur&&cur.sha, msg);
  return true;
}
function queueBrainPush(){
  if(!stateSyncOn()) return;
  for(const c of DB.companies){
    if(c._coDirty) queuedBrainCids.add(c.id);
    for(const p of c.projects) if(p._memDirty||p._todoDirty) queuedBrainPids.add(p.id);
  }
  if(!queuedBrainPids.size && !queuedBrainCids.size && !brainLinksDirty && !brainStructDirty) return;
  clearTimeout(brainPushTimer);
  brainPushTimer=setTimeout(flushBrainPush, 4500);
}
async function flushBrainPush(){
  if(brainPushing||!stateSyncOn()||(!queuedBrainPids.size && !queuedBrainCids.size && !brainLinksDirty && !brainStructDirty)) return;
  brainPushing=true;
  const pids=[...queuedBrainPids]; queuedBrainPids.clear();
  const cids=[...queuedBrainCids]; queuedBrainCids.clear();
  const linksWere=brainLinksDirty; brainLinksDirty=false;   // relações mudaram → regenera GRAFO
  const structWere=brainStructDirty; brainStructDirty=false; // exclusões → regenera INDEX (o put pula se igual)
  try{
    brainBadge("☁ salvando no cérebro…");
    let touched=false;
    for(const pid of pids){
      const f=findNode(pid); if(!f||f.type!=="pj") continue;
      const d=brainDirOf(f.co,f.pj);
      await putBrainFile(`${d}/memoria.md`, f.pj.context||`# Memória — ${f.pj.name}\n`, "brain: memória — "+f.pj.name);
      await putBrainFile(`${d}/pendencias.md`, serTodos(f.pj), "brain: pendências — "+f.pj.name);
      await putBrainFile(`${d}/projeto.md`, genProjetoMd(f.co,f.pj), "brain: projeto — "+f.pj.name);
      f.pj._memDirty=false; f.pj._todoDirty=false; touched=true;   // ✅ gravou → limpa (senão pullBrainRemote fica bloqueado pra sempre)
    }
    for(const cid of cids){
      const c=DB.companies.find(x=>x.id===cid); if(!c) continue;
      await putBrainFile(`brain/${slug(c.name)}/empresa.md`, genEmpresaMd(c), "brain: empresa — "+c.name);
      c._coDirty=false; touched=true;
    }
    await putBrainFile("INDEX.md", genIndexMd(), "brain: INDEX atualizado");
    if(typeof genGrafoMd==="function" && (linksWere || (DB.links||[]).length))
      await putBrainFile("GRAFO.md", genGrafoMd(), "brain: GRAFO (relações) atualizado");
    if(touched) save();   // persiste as flags limpas
    brainBadge("☁ salvo no cérebro "+hhmm(), true);
  }catch(e){
    pids.forEach(id=>queuedBrainPids.add(id)); cids.forEach(id=>queuedBrainCids.add(id));
    if(linksWere) brainLinksDirty=true;
    if(structWere) brainStructDirty=true;
    brainBadge("☁ falha: "+(e.message||e), false);
  }
  brainPushing=false;
}
/* read remoto: quando NÃO há pasta local do cérebro (celular/outro PC), o repo é a fonte */
async function pullBrainRemote(c,p){
  if(!stateSyncOn() || brainDir) return false;
  if(p._memDirty||p._todoDirty) return false;   // edição local pendente vence (sobe já já)
  const d=brainDirOf(c,p);
  let changed=false;
  const mem=await ghGetFile(stateRepo(), `${d}/memoria.md`).catch(()=>null);
  if(mem && mem.text!==p.context){ p.context=mem.text; changed=true; }
  const pen=await ghGetFile(stateRepo(), `${d}/pendencias.md`).catch(()=>null);
  if(pen){ const t=parseTodos(pen.text); if(JSON.stringify(t)!==JSON.stringify(p.todos)){ p.todos=t; changed=true; } }
  if(changed){
    save();
    if(sel && sel.id===p.id && document.activeElement!==document.getElementById("pjMemory")){
      const f=findNode(p.id); if(f) openDrawer(f);
    }
    brainBadge("☁ atualizado do cérebro "+hhmm(), true);
  }
  return changed;
}

/* ===== Etapa C: Arquivos & Brand kit (empresa → brand/ · projeto → assets/) =====
   Lê/sobe/apaga arquivos direto no repo-cérebro via Contents API — igual em qualquer
   aparelho. Preview de imagem <1MB via base64 do próprio GET. */
let filesDir=null, filesList=[], filesGen=0;   // gen: resposta de um drawer ANTERIOR é descartada
function b64bytes(buf){
  const b=new Uint8Array(buf); let bin="";
  for(let i=0;i<b.length;i+=0x8000) bin+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));
  return btoa(bin);
}
const IMG_RE=/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
function fmtSize(n){ return n>=1048576 ? (n/1048576).toFixed(1)+" MB" : n>=1024 ? Math.round(n/1024)+" KB" : n+" B"; }
function filesSectionHtml(){
  return `<div class="dr-sec">🎨 Arquivos & Brand kit</div><div id="filesWrap"><div class="skel-wrap" aria-label="carregando…"><div class="skel" style="height:44px"></div><div class="skel" style="height:44px"></div></div></div>`;
}
function filesDirFor(f){
  if(f.type==="co") return `brain/${slug(f.co.name)}/brand`;
  if(f.type==="pj") return `brain/${slug(f.co.name)}/${slug(f.pj.name)}/assets`;
  return null;
}
async function hydrateFiles(f){
  const wrap=document.getElementById("filesWrap"); if(!wrap) return;
  // trocar de drawer no meio do fetch: a resposta ATRASADA do drawer anterior não pode
  // sobrescrever filesList (⬇/✕ agiriam no arquivo errado) nem pintar preview no novo
  const gen=++filesGen;
  filesDir=filesDirFor(f); filesList=[];
  if(!stateSyncOn()){
    wrap.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">Pra ver/subir arquivos, configura o token + repo do cérebro em <b>⚙ Contas</b>.</div>`;
    return;
  }
  let items=null;
  try{ items=await ghGet(`/repos/${stateRepo()}/contents/${filesDir}`); }
  catch(e){ if(gen!==filesGen) return; wrap.innerHTML=`<div class="dr-desc" style="color:var(--warn)">falha: ${esc(e.message||String(e))}</div>`; return; }
  if(gen!==filesGen) return;
  filesList=(Array.isArray(items)?items:[]).filter(x=>x.type==="file" && x.name!==".gitkeep" && x.name!=="brand.md");
  const rows=filesList.map((x,i)=>`
    <div class="mini-item" style="cursor:default">
      <span class="mi-emoji" id="fprev-${i}" style="width:34px;height:34px;border-radius:8px;background:rgba(0,0,0,.3);display:grid;place-items:center;overflow:hidden">${IMG_RE.test(x.name)?"🖼":"📄"}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}<span style="color:var(--tx3);font-size:11px"> · ${fmtSize(x.size)}</span></span>
      <span title="baixar pro PC" onclick="downloadBrainFile(${i})" style="cursor:pointer;color:var(--tx3);font-size:15px;padding:0 6px">⬇</span>
      <span class="x" title="excluir do cérebro" onclick="deleteBrainFile(${i})">✕</span>
    </div>`).join("");
  wrap.innerHTML=`${rows||'<div class="dr-desc" style="color:var(--tx3)">nenhum arquivo ainda</div>'}
    <div style="margin-top:10px; display:flex; gap:8px; align-items:center">
      <input type="file" id="brainFileInput" multiple style="display:none" onchange="uploadBrainFiles(event)">
      <button class="btn sm primary" onclick="document.getElementById('brainFileInput').click()">⬆ Subir arquivos</button>
      <span id="filesStatus" style="font-size:11px;color:var(--tx3)"></span>
    </div>
    <div style="font-size:11px;color:var(--tx3);margin-top:6px">vão pro cérebro (<code>${esc(filesDir)}</code>); as IAs enxergam de lá</div>`;
  // previews de imagem (<1MB) — GET individual devolve o base64
  filesList.forEach(async (x,i)=>{
    if(!IMG_RE.test(x.name) || x.size>1048576) return;
    try{
      const j=await ghGet(`/repos/${stateRepo()}/contents/${filesDir}/${encodeURIComponent(x.name)}`);
      if(gen!==filesGen) return;   // drawer já é outro: não pinta preview alheio
      if(j && j.content){
        const mime=x.name.toLowerCase().endsWith(".svg")?"image/svg+xml":"image/"+x.name.split(".").pop().toLowerCase().replace("jpg","jpeg");
        const el=document.getElementById("fprev-"+i);
        if(el) el.innerHTML=`<img src="data:${mime};base64,${j.content.replace(/\s/g,"")}" style="width:100%;height:100%;object-fit:cover">`;
      }
    }catch(e){}
  });
}
async function uploadBrainFiles(ev){
  const files=[...(ev.target.files||[])]; ev.target.value="";
  if(!files.length||!filesDir) return;
  const st=document.getElementById("filesStatus");
  let done=0;
  for(const file of files){
    if(file.size>8*1048576){ alert(`"${file.name}" tem ${fmtSize(file.size)}, acima do limite de 8 MB. Pulei.`); continue; }
    if(st) st.textContent=`subindo ${file.name}…`;
    try{
      const buf=await file.arrayBuffer();
      const path=`${filesDir}/${file.name}`;
      const cur=await ghGetFile(stateRepo(), path).catch(()=>null);
      await ghSend("PUT", `/repos/${stateRepo()}/contents/${encodeURIComponent(path)}`,
        Object.assign({message:"brain: arquivo — "+file.name, content:b64bytes(buf)}, cur?{sha:cur.sha}:{}));
      done++;
    }catch(e){ alert(`Falha ao subir "${file.name}": ${e.message||e}`); }
  }
  if(st) st.textContent=done?`✓ ${done} arquivo(s) no cérebro`:"";
  if(sel){ const f=findNode(sel.id); if(f&&(f.type==="co"||f.type==="pj")) hydrateFiles(f); }
}
/* baixa um arquivo do cérebro de volta pro PC. Git Blobs API (base64 via header de auth)
   funciona em repo PRIVADO e pra qualquer tamanho — a listagem já traz o sha de cada item. */
async function downloadBrainFile(i){
  const x=filesList[i]; if(!x||!filesDir) return;
  const st=document.getElementById("filesStatus");
  if(st) st.textContent=`baixando ${x.name}…`;
  try{
    const j=await ghGet(`/repos/${stateRepo()}/git/blobs/${x.sha}`);
    const b64=((j&&j.content)||"").replace(/\s/g,"");
    if(!b64) throw new Error("arquivo vazio ou não lido");
    const bin=atob(b64), bytes=new Uint8Array(bin.length);
    for(let k=0;k<bin.length;k++) bytes[k]=bin.charCodeAt(k);
    const url=URL.createObjectURL(new Blob([bytes]));
    const a=document.createElement("a"); a.href=url; a.download=x.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 5000);
    if(st) st.textContent=`✓ baixado ${x.name}`;
  }catch(e){ if(st) st.textContent=""; uiToast("Falha ao baixar: "+(e.message||e),"bad"); }
}
/* ===== Bloco 1B: Briefings de tarefa — 1 clique monta o prompt-mestre pra IA ===== */
const BRIEF_TYPES={
  video:{label:"🎬 Vídeo de apresentação", task:"Crie um ROTEIRO de vídeo de apresentação (60–90s): gancho inicial, o que é, 2–3 diferenciais, e um call-to-action. Sugira cenas, narração e onde usar cada logo/asset do brand kit."},
  post:{label:"📣 Post / anúncio", task:"Crie um post para redes sociais: headline forte, corpo curto, hashtags e CTA — no tom da marca. Sugira a imagem (usando o brand kit)."},
  readme:{label:"📄 README / landing", task:"Escreva um README/página de apresentação: título, tagline, o que é, principais features, como acessar/usar, e prints sugeridos."},
  art:{label:"🎨 Arte / material visual", task:"Proponha uma peça visual (capa/banner/thumbnail): conceito, composição, uso do logo e das cores da marca, e o texto na arte. Baseie-se nos arquivos do brand kit."},
  analysis:{label:"🔍 Análise de estado", task:"Faça uma análise do estado atual: o que está pronto, o que falta (pendências), riscos, e os 3 próximos passos recomendados."},
  action:{label:"🔧 Ação técnica (agir nos serviços)", task:null},
  free:{label:"💬 Tarefa livre", task:null}
};
async function listBrainDirNames(dir){
  if(!stateSyncOn()) return [];
  try{ const j=await ghGet(`/repos/${stateRepo()}/contents/${dir}`);
    return (Array.isArray(j)?j:[]).filter(x=>x.type==="file"&&x.name!==".gitkeep").map(x=>`${dir}/${x.name}`); }
  catch(e){ return []; }
}
async function buildBriefing(kind, c, p, free){
  const T=BRIEF_TYPES[kind]||BRIEF_TYPES.free;
  const task=((kind==="free"||kind==="action")?(free||"(descreva a tarefa técnica — ex.: 'faça o deploy da Pousada')"):T.task);
  const cs=slug(c.name);
  let out=`# BRIEFING — ${T.label}${p?` · ${p.name}`:` · ${c.name}`}\n\n`;
  out+=`## Tarefa\n${task}\n\n`;
  out+=`## Empresa: ${c.name}\n${c.desc||""}\n`;
  out+=profileBlock(c.profile).replace(/^\n## Perfil pra IA\n/,"") ;
  out+=`\n`;
  if(p){
    out+=`## Projeto: ${p.name} (${p.status||"ativo"})\n${p.desc||""}\n`;
    const pb=profileBlock(p.profile).replace(/^\n## Perfil pra IA\n/,"");
    if(pb.trim()) out+=pb+`\n`;
    out+=`\n### Estado atual (memória)\n${(p.context||"(sem memória registrada)").trim()}\n`;
    const open=(p.todos||[]).filter(t=>!t.done);
    out+=`\n### Pendências abertas\n${open.length?open.map(t=>`- ${t.t}`).join("\n"):"(nenhuma)"}\n`;
  }else{
    out+=`## Projetos\n${(c.projects||[]).map(x=>`- ${x.name} (${x.status||"ativo"})${x.desc?` — ${x.desc}`:""}`).join("\n")||"(nenhum)"}\n`;
  }
  // brand kit + assets
  const brandFiles=await listBrainDirNames(`brain/${cs}/brand`);
  const assetFiles=p?await listBrainDirNames(`brain/${cs}/${slug(p.name)}/assets`):[];
  out+=`\n## Identidade visual (brand kit)\n`;
  out+=`Manifesto de marca (cores, uso do logo): brain/${cs}/brand/brand.md\n`;
  const allFiles=[...brandFiles,...assetFiles];
  out+=`Arquivos disponíveis: ${allFiles.length?allFiles.join(" · "):"(nenhum ainda — subir no painel)"}\n`;
  out+=`> Ficam no repo PRIVADO \`${stateRepo()||"antonioz2022/workspace-state"}\` — clone com git pra baixar os arquivos reais.\n`;
  // recursos técnicos
  out+=`\n## Recursos técnicos\n`;
  if(p&&p.github) out+=`- Código (git): \`${p.github}\`\n`;
  if(p&&p.local) out+=`- Pasta local (PC do Antonio): \`${p.local}\`\n`;
  const svcs=(p?p.apps:(c.projects||[]).flatMap(x=>x.apps||[]))||[];
  const links=svcs.filter(a=>a.url||a.dash).map(a=>`${a.name}: ${a.url||a.dash}`);
  if(links.length) out+=`- Serviços: ${links.join(" · ")}\n`;
  if(kind==="action" && p){
    out+=`\n## Runbook dos serviços (como agir)\n`;
    const ops=(p.apps||[]).filter(a=>a.ops||a.kind);
    if(ops.length){ out+=ops.map(a=>{
      let s=`### ${a.name}${a.kind?` — ${a.kind}`:""}`;
      if(a.url) s+=`\n- endpoint: ${a.url}`; if(a.dash) s+=`\n- painel: ${a.dash}`; if(a.health) s+=`\n- health: ${a.health}`;
      if(a.ops) s+=`\n${a.ops}`; return s;
    }).join("\n\n")+"\n"; }
    else out+=`(nenhum runbook preenchido — preencha "🔧 Como a IA opera" no serviço, no painel)\n`;
    out+=`\n## ⚠️ Regras de segurança (OBRIGATÓRIAS)\n`+
      `- Aja SÓ com as credenciais que já existem no MEU ambiente local (env vars, git configurado). Não peça, não crie, não commite, não exiba segredos.\n`+
      `- CONFIRME comigo antes de qualquer ação destrutiva ou de produção (deploy, apagar, migração, envio em massa).\n`+
      `- Depois de agir, VALIDE (health check / teste) e me diga o resultado real.\n`+
      `- Se faltar algum acesso, diga exatamente o que falta — não improvise nem invente.\n`;
  }
  out+=`\n## Onde buscar mais\nBrain completa (memória, pendências, todos os projetos): repo \`${stateRepo()||"antonioz2022/workspace-state"}\` → comece pelo INDEX.md.\n`;
  return out;
}
function briefSectionHtml(id){
  const opts=Object.entries(BRIEF_TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join("");
  return `<div class="dr-sec">🎯 Briefing pra IA</div>
    <div style="font-size:12px;color:var(--tx3);margin:-4px 0 8px">Monta um prompt completo (identidade + memória + marca + código + serviços) pra colar na sua IA.</div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <select id="briefKind" onchange="document.getElementById('briefFree').style.display=this.value==='free'?'block':'none'" style="flex:1;min-width:150px;background:rgba(0,0,0,.32);border:1px solid var(--line);border-radius:9px;color:var(--tx);padding:8px">${opts}</select>
      <button class="btn sm primary" id="briefBtn" onclick="copyBriefing('${id}')">📋 Copiar briefing</button>
    </div>
    <input id="briefFree" placeholder="descreva a tarefa livre…" style="display:none;width:100%;margin-top:6px">`;
}
async function copyBriefing(id){
  const f=findNode(id); if(!f) return;
  const kind=document.getElementById("briefKind").value;
  const free=(document.getElementById("briefFree")||{}).value||"";
  const btn=document.getElementById("briefBtn"), set=s=>{ if(btn) btn.innerHTML=s; };
  set("⏳ montando…");
  let text; try{ text=await buildBriefing(kind, f.co, f.pj||null, free); }
  catch(e){ set("⚠ erro"); alert("Briefing: "+(e.message||e)); return; }
  const ok=await copyText(text);
  set(ok?"✓ copiado — cole na IA":"⚠ veja o console"); if(!ok) console.log(text);
  setTimeout(()=>set("📋 Copiar briefing"), 2800);
}
async function deleteBrainFile(i){
  const x=filesList[i]; if(!x||!filesDir) return;
  if(!(await uiConfirm(`Excluir "${x.name}" do cérebro?`,{danger:true,okLabel:"Excluir"}))) return;
  try{
    await ghSend("DELETE", `/repos/${stateRepo()}/contents/${encodeURIComponent(filesDir+"/"+x.name)}`, {message:"brain: remove — "+x.name, sha:x.sha});
    if(sel){ const f=findNode(sel.id); if(f) hydrateFiles(f); }
  }catch(e){ alert("Excluir: "+(e.message||e)); }
}

