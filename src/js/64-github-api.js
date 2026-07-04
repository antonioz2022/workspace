/* ===== Fase 2a: camada de leitura via GitHub API (modo remoto, multi-dispositivo) =====
   PAT fine-grained (Contents: read-only) em DB.settings.githubToken. api.github.com tem
   CORS liberado — funciona client-side, sem servidor. */
async function ghGet(path){
  const tok=(DB.settings||{}).githubToken;
  const r=await fetch("https://api.github.com"+path,{headers:Object.assign(
    {"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},
    tok?{"Authorization":"Bearer "+tok}:{})});
  try{ // ⏰ expiração do PAT (fine-grained) — best-effort (depende do CORS expor o header)
    const ex=r.headers.get("github-authentication-token-expiration");
    if(ex){ const m=ex.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
      if(m){ const t=Date.parse(`${m[1]}T${m[2]}Z`); if(t) localStorage.setItem(LS_KEY+"-patexp", String(t)); } }
  }catch(e){}
  if(r.status===404) return null;
  if(!r.ok) throw new Error("GitHub "+r.status+(r.status===401?" (token inválido)":r.status===403?" (rate limit ou sem acesso ao repo)":""));
  return r.json();
}
async function ghRepoTelemetry(owner,repo){
  const out={git:null, specs:null, source:"github", repo:null, commits:[], issues:[], prs:[], releases:[], milestones:[], repoError:false};
  const info=await ghGet(`/repos/${owner}/${repo}`);
  if(!info){ out.repoError=true; return out; }   // 404: repo não existe ou o token não o inclui
  const branch=info.default_branch||null;
  out.repo={ private:!!info.private, desc:info.description||"", lang:info.language||"",
    stars:info.stargazers_count||0, forks:info.forks_count||0, openIssues:info.open_issues_count||0,
    pushedAt:info.pushed_at?Date.parse(info.pushed_at):null,
    url:info.html_url||`https://github.com/${owner}/${repo}`, defBranch:branch,
    license:(info.license&&info.license.spdx_id&&info.license.spdx_id!=="NOASSERTION")?info.license.spdx_id:"" };
  const commits=await ghGet(`/repos/${owner}/${repo}/commits?per_page=5`).catch(()=>null);
  if(Array.isArray(commits)){
    out.commits=commits.map(c=>({ hash:(c.sha||"").slice(0,7),
      msg:((c.commit&&c.commit.message)||"").split("\n")[0]||"(sem mensagem)",
      ts:(c.commit&&c.commit.author&&c.commit.author.date)?Date.parse(c.commit.author.date):null,
      author:(c.author&&c.author.login)||(c.commit&&c.commit.author&&c.commit.author.name)||"", url:c.html_url }));
    if(out.commits[0]){ const f=out.commits[0]; out.git={branch, commits:null, hash:f.hash, ts:f.ts, msg:f.msg}; }
  }
  if(!out.git && branch) out.git={branch, commits:null, hash:"", ts:null, msg:"(sem commits)"};
  const issues=await ghGet(`/repos/${owner}/${repo}/issues?state=open&per_page=8&sort=updated`).catch(()=>null);
  if(Array.isArray(issues)) for(const it of issues){
    const o={num:it.number, title:it.title||"", url:it.html_url, ts:it.updated_at?Date.parse(it.updated_at):null};
    if(it.pull_request) out.prs.push(o); else out.issues.push(o);
  }
  const specs=await ghGet(`/repos/${owner}/${repo}/contents/specs`).catch(()=>null);
  if(Array.isArray(specs)){
    const dirs=specs.filter(e=>e.type==="dir" && /^\d{3}-/.test(e.name)).map(e=>e.name).sort();
    if(dirs.length) out.specs={count:dirs.length, last:dirs[dirs.length-1]};
  }
  const rels=await ghGet(`/repos/${owner}/${repo}/releases?per_page=5`).catch(()=>null);
  if(Array.isArray(rels)) out.releases=rels.filter(r=>!r.draft).map(r=>({tag:r.tag_name||"", name:r.name||r.tag_name||"", ts:r.published_at?Date.parse(r.published_at):null, url:r.html_url, pre:!!r.prerelease}));
  const miles=await ghGet(`/repos/${owner}/${repo}/milestones?state=open&per_page=10&sort=due_on&direction=asc`).catch(()=>null);
  if(Array.isArray(miles)) out.milestones=miles.map(mi=>({title:mi.title||"", open:mi.open_issues||0, closed:mi.closed_issues||0, due:mi.due_on?mi.due_on.slice(0,10):null, url:mi.html_url}));
  return out;
}
/* repos que o token enxerga — pro autocomplete e o auto-match de projeto novo */
let ghRepoListCache=null;
async function ghMyRepos(){
  if(ghRepoListCache) return ghRepoListCache;
  if(!(DB.settings||{}).githubToken) return [];
  try{
    const j=await ghGet("/user/repos?per_page=100&sort=updated");
    ghRepoListCache=(Array.isArray(j)?j:[]).map(r=>r.full_name);
  }catch(e){ ghRepoListCache=[]; }
  return ghRepoListCache;
}
function ghAutoMatchRepo(name){
  const rs=ghRepoListCache||[]; const s=slug(name);
  return rs.find(r=>slug(r.split("/")[1])===s)
      || rs.find(r=>{ const rn=slug(r.split("/")[1]); return rn.includes(s)||s.includes(rn); })
      || "";
}
async function detectRepoFromGit(dir){
  try{
    const gitDir=await dir.getDirectoryHandle(".git");
    const cfg=await readFileIf(gitDir,"config");
    if(!cfg) return null;
    const m=cfg.match(/url\s*=\s*\S*github\.com[:/]([^/\s]+)\/([^\s]+?)(?:\.git)?\s*$/mi);
    return m?`${m[1]}/${m[2]}`:null;
  }catch(e){ return null; }
}
/* híbrido: pasta local (ao vivo) quando disponível; senão GitHub API (remoto) */
async function getTelemetry(p, {promptLocal=false}={}){
  let dir=null; try{ dir=await getProjDir(p.id,{prompt:promptLocal}); }catch(e){}
  if(dir){
    if(!p.github){ const gh=await detectRepoFromGit(dir); if(gh){ p.github=gh; save(); } }
    const t=await readProjectTelemetry(dir); t.at=Date.now(); teleCache[p.id]=t; return t;
  }
  if(p.github && !p.noRepo && (DB.settings||{}).githubToken){
    const [o,r]=p.github.split("/");
    const t=await ghRepoTelemetry(o,r); t.at=Date.now(); teleCache[p.id]=t; return t;
  }
  return null;
}
function agoStr(ts){
  if(!ts) return "";
  const s=Math.max(0,(Date.now()-ts)/1000);
  if(s<90) return "agora há pouco";
  const m=s/60; if(m<90) return "há "+Math.round(m)+" min";
  const h=m/60; if(h<36) return "há "+Math.round(h)+" h";
  const d=h/24; if(d<14) return "há "+Math.round(d)+" dias";
  const w=d/7; if(w<9) return "há "+Math.round(w)+" sem";
  const mo=d/30; if(mo<18) return "há "+Math.round(mo)+" meses";
  return "há "+Math.round(d/365)+" ano(s)";
}
function hasAIProvider(){ return ((DB.settings||{}).providers||[]).some(pr=>pr.apiKey); }

function teleInner(c,p,state){
  const openN=(p.todos||[]).filter(x=>!x.done).length, totN=(p.todos||[]).length, t=teleCache[p.id];
  if(state==="loading") return `<div class="skel-wrap" aria-label="carregando…">
      <div class="skel" style="height:15px;width:58%"></div>
      <div class="skel" style="height:12px;width:82%"></div>
      <div class="chips" style="margin-top:2px">
        <span class="skel" style="height:22px;width:74px;border-radius:99px"></span>
        <span class="skel" style="height:22px;width:92px;border-radius:99px"></span>
        <span class="skel" style="height:22px;width:60px;border-radius:99px"></span>
      </div></div>`;
  // repo linkado mas ilegível (404/sem acesso)
  if(t && t.repoError){
    return `<div style="font-size:12px;color:var(--warn);margin:-2px 0 8px">Não consegui ler <b>${esc(p.github)}</b> (owner/repo errado, repo privado sem acesso, ou rate limit).</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn sm" onclick="refreshProjClick('${p.id}')">🔄 Tentar de novo</button>
        <button class="btn sm ghost" onclick="openPjModalFor('${c.id}','${p.id}')">✎ Corrigir repositório</button></div>`;
  }
  if(state==="none" || !t){
    if(p.noRepo) return `<div style="font-size:12px;color:var(--tx3);margin:-2px 0 8px">Sem repositório (por escolha). Dá pra conectar a pasta local ou linkar um repo no ✎ Editar.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="connectProjDir('${p.id}')">🔗 Conectar pasta local</button><button class="btn sm ghost" onclick="openPjModalFor('${c.id}','${p.id}')">✎ Editar</button></div>`;
    if(p.github) return `<div style="font-size:12px;color:var(--tx3);margin:-2px 0 8px">Repo linkado (<b>${esc(p.github)}</b>), mas sem leitura ainda. Entre com o GitHub em ⚙ Contas, ou conecte a pasta local.</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm primary" onclick="refreshProjClick('${p.id}')">🔄 Ler do GitHub</button><button class="btn sm" onclick="connectProjDir('${p.id}')">🔗 Conectar pasta</button></div>`;
    return `<div style="font-size:12px;color:var(--tx3);margin:-2px 0 8px">
        Conecte a pasta do projeto (working tree ao vivo) ou linke um repositório GitHub no ✎ Editar, pra ver commit, branch, issues e features reais.
      </div><div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn sm primary" onclick="connectProjDir('${p.id}')">🔗 Conectar pasta do projeto</button>
        <button class="btn sm" onclick="openPjModalFor('${c.id}','${p.id}')">🐙 Linkar repositório</button></div>`;
  }
  const g=t.git, s=t.specs, R=t.repo, isGh=t.source==="github", chips=[];
  chips.push(isGh
    ? `<span class="chip" title="lido da API do GitHub: estado remoto (pushed)">☁ GitHub</span>`
    : `<span class="chip" title="lido da pasta local: working tree ao vivo">📁 local</span>`);
  if(g){ chips.push(`<span class="chip" title="branch">⎇ ${esc(g.branch||"—")}</span>`); if(g.commits!=null) chips.push(`<span class="chip">${g.commits} commit(s)</span>`); }
  if(R){ if(R.lang) chips.push(`<span class="chip">${esc(R.lang)}</span>`);
         if(R.stars) chips.push(`<span class="chip">⭐ ${R.stars}</span>`);
         if(R.forks) chips.push(`<span class="chip">🍴 ${R.forks}</span>`);
         chips.push(`<span class="chip" title="issues + PRs abertos (contagem do GitHub)">🐛 ${R.openIssues} abertas</span>`);
         if(R.license) chips.push(`<span class="chip">${esc(R.license)}</span>`); }
  if(s) chips.push(`<span class="chip" title="pasta specs/">${s.count} features · atual ${esc(s.last||"—")}</span>`);
  chips.push(`<span class="chip">${openN}/${totN} pendências</span>`);
  if(isGh && t.releases && t.releases[0]) chips.push(`<span class="chip" title="release mais recente">🏷 ${esc(t.releases[0].tag)}</span>`);
  if(isGh && t.milestones && t.milestones.length) chips.push(`<span class="chip" title="milestones abertos">🎯 ${t.milestones.length} milestone(s)</span>`);
  const header = R ? `<div style="display:flex;align-items:center;gap:8px;margin:-2px 0 6px;flex-wrap:wrap">
      <a href="${esc(R.url)}" target="_blank" rel="noopener" style="color:var(--ac2);font-weight:650;font-size:13px;text-decoration:none">🐙 ${esc(p.github)}</a>
      <span class="chip">${R.private?"🔒 privado":"🌐 público"}</span>
      ${R.pushedAt?`<span style="font-size:11px;color:var(--tx3)">push ${esc(agoStr(R.pushedAt))}</span>`:""}
    </div>${R.desc?`<div class="dr-desc" style="color:var(--tx2);margin:0 0 6px">${esc(R.desc)}</div>`:""}` : "";
  const commitLine = g
    ? `<div style="font-size:12.5px;color:var(--tx2);margin:2px 0 8px"><b>último commit</b> ${agoStr(g.ts)}${g.hash?` · <code style="color:var(--tx3)">${esc(g.hash)}</code>`:""}<br><span style="color:var(--tx)">${esc(g.msg)}</span></div>`
    : `<div class="dr-desc" style="color:var(--tx3)">pasta sem <code>.git</code>, sem histórico de commits</div>`;
  const links = R ? `<a class="btn sm ghost" style="text-decoration:none" href="${esc(R.url)}" target="_blank" rel="noopener">↗ Repo</a>
      <a class="btn sm ghost" style="text-decoration:none" href="${esc(R.url)}/issues" target="_blank" rel="noopener">🐛 Issues</a>
      <a class="btn sm ghost" style="text-decoration:none" href="${esc(R.url)}/pulls" target="_blank" rel="noopener">🔀 PRs</a>
      <a class="btn sm ghost" style="text-decoration:none" href="${esc(R.url)}/commits" target="_blank" rel="noopener">⎇ Commits</a>` : "";
  const miniLink=(icon,txt,url)=>`<a class="mini-item" href="${esc(url)}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--tx)"><span class="mi-emoji">${icon}</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${txt}</span><span class="arrow">↗</span></a>`;
  const commitsList = (isGh && t.commits && t.commits.length>1) ? `<details style="margin-top:8px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Commits recentes (${t.commits.length})</summary><div class="mini-list" style="margin-top:6px">${t.commits.map(cm=>miniLink("⎇",esc(cm.msg),cm.url)).join("")}</div></details>` : "";
  const issuesList = (isGh && t.issues && t.issues.length) ? `<details style="margin-top:6px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Issues abertas (${t.issues.length}${R&&R.openIssues>t.issues.length?"+":""})</summary><div class="mini-list" style="margin-top:6px">${t.issues.map(it=>miniLink("🐛","#"+it.num+" "+esc(it.title),it.url)).join("")}</div></details>` : "";
  const prsList = (isGh && t.prs && t.prs.length) ? `<details style="margin-top:6px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Pull requests abertos (${t.prs.length})</summary><div class="mini-list" style="margin-top:6px">${t.prs.map(it=>miniLink("🔀","#"+it.num+" "+esc(it.title),it.url)).join("")}</div></details>` : "";
  const milesList = (isGh && t.milestones && t.milestones.length) ? `<details style="margin-top:6px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Milestones (${t.milestones.length})</summary><div class="mini-list" style="margin-top:6px">${t.milestones.map(mi=>{
      const tot=mi.open+mi.closed, pct=tot?Math.round(mi.closed/tot*100):0, over=mi.due && mi.due<todayStr();
      return `<a class="mini-item" href="${esc(mi.url)}" target="_blank" rel="noopener" style="text-decoration:none;color:var(--tx)"><span class="mi-emoji">🎯</span><span style="flex:1;min-width:0"><b style="font-size:12.5px">${esc(mi.title)}</b> <span style="font-size:10.5px;color:var(--tx3)">${mi.closed}/${tot} (${pct}%)</span>${mi.due?` <span class="tb ${over?"tb-over":""}">📅 ${esc(mi.due)}</span>`:""}</span><span class="arrow">↗</span></a>`;
    }).join("")}</div></details>` : "";
  const relsList = (isGh && t.releases && t.releases.length) ? `<details style="margin-top:6px"><summary style="font-size:12px;color:var(--tx3);cursor:pointer">Releases (${t.releases.length})</summary><div class="mini-list" style="margin-top:6px">${t.releases.map(rl=>miniLink("🏷",esc(rl.tag)+(rl.name&&rl.name!==rl.tag?" · "+esc(rl.name):"")+(rl.pre?" (pré)":"")+(rl.ts?" · "+esc(agoStr(rl.ts)):""),rl.url)).join("")}</div></details>` : "";
  return `${header}${commitLine}<div class="chips" style="margin-bottom:8px">${chips.join("")}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      ${links}
      <button class="btn sm" onclick="refreshProjClick('${p.id}')">🔄 Atualizar</button>
      <button class="btn sm primary" id="copyCtxBtn" onclick="copyProjectContext('${p.id}')" title="Copia commits + pendências + memória atual pra colar no Claude Code / Codex">📋 Contexto p/ IA</button>
      <button class="btn sm" id="repoBrainBtn" onclick="syncRepoBrain('${p.id}')" title="Cria/sincroniza .workspace/brain.md dentro do repositório, versionado no git">🧩 Brain no repo</button>
      ${R?`<button class="btn sm" onclick="createRepoIssue('${p.id}')" title="Abrir uma issue neste repositório">＋ Nova issue</button>`:""}
      ${R?`<button class="btn sm" onclick="openPrModal('${p.id}')" title="Abrir um pull request neste repositório">🔀 Novo PR</button>`:""}
      ${isGh?"":`<button class="btn sm ghost" onclick="disconnectProjDir('${p.id}')" title="esquecer a pasta">⊘</button>`}
    </div>${commitsList}${milesList}${relsList}${issuesList}${prsList}${t.at?`<div style="font-size:11px;color:var(--tx3);margin-top:6px">lido ${agoStr(t.at)}</div>`:""}`;
}
/* abre um pull request: escolhe head/base (branches do repo) + título + descrição, depois POST /pulls */
let prPid=null;
async function openPrModal(pid){
  const f=findNode(pid); if(!f||f.type!=="pj"||!f.pj.github) return;
  if(!(DB.settings||{}).githubToken){ uiToast("Entre com o GitHub (⚙ Contas) pra abrir PRs.","warn"); return; }
  prPid=pid; const repo=f.pj.github;
  document.getElementById("prModal").classList.add("open");
  document.getElementById("prRepoLine").textContent="em "+repo;
  document.getElementById("prTitle").value=""; document.getElementById("prBody").value="";
  const st=document.getElementById("prStatus"); st.textContent="carregando branches…"; st.style.color="var(--tx3)";
  const headSel=document.getElementById("prHead"), baseSel=document.getElementById("prBase");
  headSel.innerHTML=baseSel.innerHTML="";
  try{
    const def=(teleCache[pid]&&teleCache[pid].repo&&teleCache[pid].repo.defBranch)||"main";
    const cur=(teleCache[pid]&&teleCache[pid].git&&teleCache[pid].git.branch)||"";
    const brs=await ghGet(`/repos/${repo}/branches?per_page=100`);
    const names=(Array.isArray(brs)?brs:[]).map(b=>b.name);
    if(!names.length){ st.textContent="não achei branches (o token tem acesso de escrita?)"; st.style.color="var(--warn)"; return; }
    const headDefault = (cur && cur!==def && names.includes(cur)) ? cur : (names.find(n=>n!==def)||names[0]);
    const opt=(n,sel)=>`<option value="${esc(n)}"${sel?" selected":""}>${esc(n)}</option>`;
    headSel.innerHTML=names.map(n=>opt(n, n===headDefault)).join("");
    baseSel.innerHTML=names.map(n=>opt(n, n===def)).join("");
    st.textContent = names.length<2 ? "só há 1 branch — crie/empurre outra pra abrir um PR" : "";
    if(names.length<2) st.style.color="var(--warn)";
  }catch(e){ st.textContent="falha ao ler branches: "+(e.message||e); st.style.color="var(--warn)"; }
}
async function createRepoPR(){
  const f=findNode(prPid); if(!f||f.type!=="pj") return;
  const repo=f.pj.github;
  const head=document.getElementById("prHead").value, base=document.getElementById("prBase").value;
  const title=(document.getElementById("prTitle").value||"").trim(), body=document.getElementById("prBody").value||"";
  const st=document.getElementById("prStatus");
  if(!title){ st.textContent="dê um título ao PR"; st.style.color="var(--warn)"; return; }
  if(!head||!base||head===base){ st.textContent="head e base precisam ser branches diferentes"; st.style.color="var(--warn)"; return; }
  st.textContent="criando…"; st.style.color="var(--tx3)";
  try{
    const r=await fetch(`https://api.github.com/repos/${repo}/pulls`,{method:"POST",
      headers:Object.assign(ghApiHeaders(),{"content-type":"application/json"}),
      body:JSON.stringify({title, head, base, body})});
    if(!r.ok){ const j=await r.json().catch(()=>({}));
      const msg=(j.errors&&j.errors[0]&&j.errors[0].message)||j.message||("HTTP "+r.status);
      throw new Error(/No commits between/i.test(msg)?`não há commits em "${head}" à frente de "${base}"`:((r.status===403)?"o token não pode abrir PR nesse repo (precisa de escrita)":msg)); }
    const j=await r.json();
    closeModals();
    uiToast("✓ PR #"+j.number+" criado em "+repo,"ok");
    delete teleCache[prPid];
    try{ const t=await getTelemetry(f.pj,{promptLocal:false}); paintTele(prPid, t?"ready":"none"); }catch(e){}
  }catch(e){ st.textContent="Criar PR: "+(e.message||e); st.style.color="var(--warn)"; }
}
/* abre uma issue no repo do projeto (ação do usuário: título + descrição + confirmar) */
async function createRepoIssue(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  const repo=f.pj.github;
  if(!repo){ uiToast("Este projeto não tem repositório linkado.","warn"); return; }
  if(!(DB.settings||{}).githubToken){ uiToast("Entre com o GitHub (⚙ Contas) pra criar issues.","warn"); return; }
  const title=await uiPrompt({title:"Nova issue", message:`Título da issue em ${repo}:`, placeholder:"ex.: bug ao salvar a memória", okLabel:"Próximo →"});
  if(title===null) return;
  if(!title.trim()){ uiToast("A issue precisa de um título.","warn"); return; }
  const body=await uiPrompt({title:"Nova issue", message:`Descrição (opcional) — vai virar a issue "${title.trim()}":`, placeholder:"detalhes, passos, contexto…", okLabel:"Criar issue"});
  if(body===null) return;   // cancelou na 2ª etapa
  try{
    const r=await fetch(`https://api.github.com/repos/${repo}/issues`,{method:"POST",
      headers:Object.assign(ghApiHeaders(),{"content-type":"application/json"}),
      body:JSON.stringify({title:title.trim(), body:body||""})});
    if(!r.ok){ const j=await r.json().catch(()=>({}));
      throw new Error((r.status===403||r.status===404)?"o token não pode abrir issues nesse repo (precisa de acesso de escrita)":(j.message||("HTTP "+r.status))); }
    const j=await r.json();
    uiToast("✓ Issue #"+j.number+" criada em "+repo,"ok");
    delete teleCache[pid];   // força releitura pra a issue nova aparecer na lista
    try{ const t=await getTelemetry(f.pj,{promptLocal:false}); paintTele(pid, t?"ready":"none"); }catch(e){}
  }catch(e){ uiToast("Criar issue: "+(e.message||e),"bad"); }
}
function teleSectionHtml(c,p,state){ return `<div class="dr-sec">📡 Estado do projeto</div><div id="teleWrap">${teleInner(c,p,state)}</div>`; }
function paintTele(pid,state){ const el=document.getElementById("teleWrap"); if(!el) return; const f=findNode(pid); if(f&&f.type==="pj") el.innerHTML=teleInner(f.co,f.pj,state); }

async function hydrateTele(c,p){
  paintTele(p.id, teleCache[p.id]?"ready":"loading");
  if(typeof pullBrainRemote==="function") pullBrainRemote(c,p).catch(()=>{});
  try{ const t=await getTelemetry(p,{promptLocal:false}); paintTele(p.id, (t||teleCache[p.id])?"ready":"none"); }
  catch(e){ paintTele(p.id, teleCache[p.id]?"ready":"none"); }
}
async function connectProjDir(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  paintTele(pid,"loading");
  try{ const dir=await getProjDir(pid,{prompt:true}); if(!dir){ paintTele(pid, teleCache[pid]?"ready":"none"); return; }
       await refreshProjectTelemetry(f.pj); paintTele(pid,"ready"); }
  catch(e){ alert("Pasta do projeto: "+(e.message||e)); paintTele(pid,"none"); }
}
async function refreshProjClick(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  paintTele(pid,"loading");
  try{ const t=await getTelemetry(f.pj,{promptLocal:true}); paintTele(pid, t?"ready":"none");
       if(!t) alert("Conecte a pasta do projeto, OU configure o repositório GitHub (owner/repo) no ✎ do projeto + o token em ⚙ Contas."); }
  catch(e){ alert("Atualizar: "+(e.message||e)); paintTele(pid, teleCache[pid]?"ready":"none"); }
}
async function disconnectProjDir(pid){ await forgetProjDir(pid); paintTele(pid,"none"); }

/* SEM API key (preferência do Antonio, 02/07): monta o contexto do projeto — commits +
   pendências + memória atual — e copia pro clipboard, pra colar no Claude Code / Codex.
   A IA que ele já usa no repo reescreve a memoria.md; o painel sincroniza. */
async function copyText(text){
  try{ if(navigator.clipboard){ await navigator.clipboard.writeText(text); return true; } }catch(e){}
  try{
    const ta=document.createElement("textarea"); ta.value=text;
    ta.style.position="fixed"; ta.style.left="-9999px"; document.body.appendChild(ta);
    ta.focus(); ta.select(); const ok=document.execCommand("copy"); document.body.removeChild(ta); return ok;
  }catch(e){ return false; }
}
async function copyProjectContext(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  const p=f.pj, btn=document.getElementById("copyCtxBtn"), setBtn=s=>{ if(btn) btn.innerHTML=s; };
  setBtn("⏳ lendo…");
  let log=null;
  const dir=await getProjDir(pid,{prompt:false}).catch(()=>null);   // reusa a pasta já conectada; não força escolher
  if(dir){
    try{
      const gitDir=await dir.getDirectoryHandle(".git");
      const logsDir=await getDirPath(gitDir,["logs"]);
      const raw=await readFileIf(logsDir,"HEAD");
      if(raw){ const lines=raw.split("\n").filter(l=>l.trim()).slice(-15).reverse();
        log=lines.map(l=>{ const tab=l.indexOf("\t"), rest=tab>=0?l.slice(tab+1):l; return "- "+rest.replace(/^[^:]*:\s*/,"").trim(); }).join("\n"); }
    }catch(e){}
    await refreshProjectTelemetry(p).catch(()=>{});
  }
  if(!log){
    // remoto (sem pasta local): usa os commits lidos do GitHub — assim a ponte funciona em qualquer aparelho
    let tt=teleCache[pid];
    if(!(tt&&tt.commits&&tt.commits.length)){ try{ tt=await getTelemetry(p,{promptLocal:false}); }catch(e){} }
    if(tt&&tt.commits&&tt.commits.length) log=tt.commits.map(cm=>`- ${cm.msg}${cm.hash?` (${cm.hash})`:""}`).join("\n");
  }
  if(!log) log="(sem commits acessíveis — conecte a pasta local, ou linke o repo GitHub + token em ⚙ Contas)";
  const t=teleCache[pid]||{};
  const branch=t.git?`branch ${t.git.branch}, ${t.git.commits} commit(s), HEAD ${t.git.hash||"—"}`:"sem git";
  const specs=t.specs?`${t.specs.count} features (atual ${t.specs.last})`:"—";
  const pend=(p.todos||[]).map(x=>`- [${x.done?"x":" "}] ${x.t}`).join("\n")||"(nenhuma)";
  const out=`Você é a IA que o Antonio usa neste repositório (Claude Code / Codex). Atualize a MEMÓRIA do projeto "${p.name}" no painel Workspace dele.
Reescreva o memoria.md (em Workspace/brain/<empresa>/<projeto>/memoria.md) de forma CURTA, factual, em português, mantendo o estilo e as seções já existentes. Baseie-se SÓ no estado abaixo; não invente; preserve aprendizados antigos que ainda valham. Salve em memoria.md — o painel sincroniza sozinho.

## memoria.md ATUAL
${p.context||"(vazio)"}

## TELEMETRIA (lida do repo)
${p.name} · ${branch} · specs: ${specs}

## COMMITS RECENTES (novo→antigo)
${log}

## PENDÊNCIAS
${pend}`;
  const ok=await copyText(out);
  setBtn(ok?"✓ copiado — cole na sua IA":"⚠ copie do console (F12)");
  if(ok && typeof uiToast==="function") uiToast("Contexto copiado. Cole na IA da sessão do repo pra ela reescrever a memória — o painel sincroniza.","ok");
  if(!ok) console.log(out);
  setTimeout(()=>setBtn("📋 Copiar contexto p/ IA"), 2800);
}

