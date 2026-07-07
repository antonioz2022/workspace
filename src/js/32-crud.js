/* ================= CRUD ================= */
let pjTargetCo=null, apTargetPj=null;
// undefined = não mexeu; null = remover; string = dataURL novo
let pendingLogo={co:undefined, pj:undefined};

function pickLogo(ev, kind){
  const f=ev.target.files[0]; if(!f) return;
  const img=new Image();
  img.onload=()=>{
    // reduz pra ~220px (cabe folgado no localStorage e no orbe)
    const s=Math.min(1, 220/Math.max(img.width,img.height));
    const cv=document.createElement("canvas");
    cv.width=Math.max(1,Math.round(img.width*s)); cv.height=Math.max(1,Math.round(img.height*s));
    cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
    pendingLogo[kind]=cv.toDataURL("image/png");
    showLogoPrev(kind, pendingLogo[kind]);
    URL.revokeObjectURL(img.src);
  };
  img.src=URL.createObjectURL(f);
}
function showLogoPrev(kind, src){
  const el=document.getElementById(kind+"ImgPrev");
  el.innerHTML = src
    ? `<img src="${esc(src)}" style="height:52px; border-radius:11px; vertical-align:middle; background:rgba(0,0,0,.3); padding:3px"> <button type="button" class="btn sm ghost" onclick="clearLogo('${kind}')">tirar logo</button>`
    : `<span style="color:var(--tx3); font-size:12px">sem logo, usa o emoji</span>`;
}
function clearLogo(kind){
  pendingLogo[kind]=null;
  const fi=document.getElementById(kind+"ImgFile"); if(fi) fi.value="";
  showLogoPrev(kind, null);
}

function openCoModal(id){
  editingCo=id||null;
  document.getElementById("coModalTitle").textContent=id?"Editar empresa":"Nova empresa";
  const c=id?findNode(id).co:null;
  document.getElementById("coEmoji").value=c?(c.emoji||""):"";
  document.getElementById("coName").value=c?c.name:"";
  document.getElementById("coDesc").value=c?(c.desc||""):"";
  {const pr=(c&&c.profile)||{}; document.getElementById("coTone").value=pr.tone||""; document.getElementById("coAudience").value=pr.audience||""; document.getElementById("coValue").value=pr.value||""; document.getElementById("coRules").value=pr.rules||"";}
  document.getElementById("coColor").value=c?(c.color||"#8B5CF6"):"#8B5CF6";
  pendingLogo.co=undefined;
  document.getElementById("coImgFile").value="";
  showLogoPrev("co", c&&c.img ? c.img : null);
  document.getElementById("coModal").classList.add("open");
}
function saveCo(){
  const name=document.getElementById("coName").value.trim();
  if(!name) return alert("Dá um nome pra empresa.");
  const data={emoji:document.getElementById("coEmoji").value.trim()||"🏢", name,
    desc:document.getElementById("coDesc").value.trim(), color:document.getElementById("coColor").value,
    profile:{tone:document.getElementById("coTone").value.trim(), audience:document.getElementById("coAudience").value.trim(), value:document.getElementById("coValue").value.trim(), rules:document.getElementById("coRules").value.trim()}};
  if(pendingLogo.co!==undefined){ data.img = pendingLogo.co || ""; if(pendingLogo.co) data.imgFit="cover"; }
  if(editingCo){ const co=findNode(editingCo).co; Object.assign(co, data); co._coDirty=true; }
  else{
    const id=uid();
    const vx=(innerWidth/2-cam.x)/cam.z, vy=(innerHeight/2-cam.y)/cam.z;
    DB.companies.push({id, ...data, x:vx, y:vy, projects:[], _coDirty:true});
    newborn.add(id);
  }
  save(); scheduleSync(); closeModals(); render();
}
/* excluir um nó tira também as relações do grafo que apontavam pra ele (senão ficam
   órfãs "(nó removido)" pra sempre) e avisa a brain (INDEX/GRAFO regeneram no flush) */
function dropLinksFor(ids){
  if(!(DB.links||[]).length) return;
  const set=new Set(ids), before=DB.links.length;
  DB.links=DB.links.filter(l=>!set.has(l.from)&&!set.has(l.to));
  if(DB.links.length!==before) brainLinksDirty=true;
}
async function delCo(id){
  const c=findNode(id).co;
  if(!(await uiConfirm(`Excluir "${c.name}" e todos os projetos dela? Não dá pra desfazer.`,{danger:true,okLabel:"Excluir"}))) return;
  dropLinksFor([id, ...c.projects.flatMap(p=>[p.id, ...(p.apps||[]).map(a=>a.id)])]);
  DB.companies=DB.companies.filter(x=>x.id!==id);
  brainStructDirty=true;   // o INDEX do cérebro precisa parar de listar o que saiu
  closeDrawer(); save(); scheduleSync(); render();
}

function openPjModalFor(coId, pjId){ pjTargetCo=coId; openPjModal(pjId); }
function openPjModal(id){
  editingPj=id||null;
  document.getElementById("pjModalTitle").textContent=id?"Editar projeto":"Novo projeto";
  const p=id?findNode(id).pj:null;
  document.getElementById("pjEmoji").value=p?(p.emoji||""):"";
  document.getElementById("pjName").value=p?p.name:"";
  document.getElementById("pjDesc").value=p?(p.desc||""):"";
  document.getElementById("pjStatus").value=p?(p.status||"ativo"):"ativo";
  document.getElementById("pjGithub").value=p?(p.github||""):"";
  document.getElementById("pjNoRepo").checked=!!(p&&p.noRepo);
  pjNoRepoToggle(false);   // aplica o estado (habilita/desabilita) sem apagar o valor; valida se houver repo
  document.getElementById("pjLocal").value=p?(p.local||""):"";
  {const pr=(p&&p.profile)||{}; document.getElementById("pjTone").value=pr.tone||""; document.getElementById("pjAudience").value=pr.audience||""; document.getElementById("pjValue").value=pr.value||""; document.getElementById("pjRules").value=pr.rules||"";}
  (async()=>{ const rs=await ghMyRepos(); const dl=document.getElementById("ghRepoList");
    if(dl) dl.innerHTML=rs.map(r=>`<option value="${esc(r)}">`).join(""); })();
  pendingLogo.pj=undefined;
  document.getElementById("pjImgFile").value="";
  showLogoPrev("pj", p&&p.img ? p.img : null);
  document.getElementById("pjModal").classList.add("open");
}
function savePj(){
  const name=document.getElementById("pjName").value.trim();
  if(!name) return alert("Dá um nome pro projeto.");
  const noRepo=document.getElementById("pjNoRepo").checked;
  const data={emoji:document.getElementById("pjEmoji").value.trim()||"🚀", name,
    desc:document.getElementById("pjDesc").value.trim(), status:document.getElementById("pjStatus").value,
    github:noRepo?"":document.getElementById("pjGithub").value.trim(),
    noRepo,
    local:document.getElementById("pjLocal").value.trim(),
    profile:{tone:document.getElementById("pjTone").value.trim(), audience:document.getElementById("pjAudience").value.trim(), value:document.getElementById("pjValue").value.trim(), rules:document.getElementById("pjRules").value.trim()}};
  if(pendingLogo.pj!==undefined){ data.img = pendingLogo.pj || ""; if(pendingLogo.pj) data.imgFit="contain"; }
  if(!noRepo && !data.github) data.github=ghAutoMatchRepo(name);   // conecta sozinho ao repo com nome parecido (só se não for "sem repo")
  if(editingPj && teleCache[editingPj] && findNode(editingPj).pj.github!==data.github) delete teleCache[editingPj]; // trocou de repo → invalida cache
  if(editingPj){ const pj=findNode(editingPj).pj; Object.assign(pj, data); pj._memDirty=true; }
  else{
    const co=findNode(pjTargetCo).co;
    const id=uid();
    // nasce "dirty" → o próximo flush cria brain/<empresa>/<projeto>/ no cérebro sozinho
    co.projects.push({id, ...data, apps:[], todos:[], _memDirty:true, _todoDirty:true});
    expanded.add(co.id); newborn.add(id);
  }
  save(); scheduleSync(); closeModals(); render();
}
/* ===== repo do projeto: marcar "sem repo" + validar o owner/repo ao vivo ===== */
function pjNoRepoToggle(fromUser){
  const no=document.getElementById("pjNoRepo").checked;
  const inp=document.getElementById("pjGithub");
  inp.disabled=no; inp.style.opacity=no?".45":"1";
  if(no){ if(fromUser) inp.value=""; const el=document.getElementById("pjRepoStatus"); if(el){ el.textContent="sem repositório neste projeto"; el.style.color="var(--tx3)"; } }
  else pjRepoValidate();
}
let pjRepoValTimer=null;
function pjRepoValidate(){ clearTimeout(pjRepoValTimer); pjRepoValTimer=setTimeout(_pjRepoValidate, 450); }
async function _pjRepoValidate(){
  const el=document.getElementById("pjRepoStatus"); if(!el) return;
  if(document.getElementById("pjNoRepo").checked){ el.textContent="sem repositório neste projeto"; el.style.color="var(--tx3)"; return; }
  const v=(document.getElementById("pjGithub").value||"").trim();
  if(!v){ el.textContent='opcional — deixe em branco ou marque "sem repositório"'; el.style.color="var(--tx3)"; return; }
  if(!/^[^/\s]+\/[^/\s]+$/.test(v)){ el.textContent="use o formato owner/repo"; el.style.color="var(--warn)"; return; }
  if(!(DB.settings||{}).githubToken){ el.textContent="entre com o GitHub (⚙ Contas) pra validar o repositório"; el.style.color="var(--tx3)"; return; }
  el.textContent="verificando…"; el.style.color="var(--tx3)";
  const asked=v;
  try{
    const j=await ghGet("/repos/"+v);
    if((document.getElementById("pjGithub").value||"").trim()!==asked) return; // mudou enquanto buscava
    if(j&&j.full_name){
      const bits=[j.private?"🔒 privado":"🌐 público"]; if(j.language) bits.push(esc(j.language)); if(j.stargazers_count) bits.push("⭐ "+j.stargazers_count);
      el.innerHTML="✓ conectado: <b>"+esc(j.full_name)+"</b> · "+bits.join(" · "); el.style.color="var(--ok)";
    } else { el.textContent="repositório não encontrado (confira owner/repo)"; el.style.color="var(--warn)"; }
  }catch(e){ el.textContent="não achei esse repo (o token não tem acesso, ou owner/repo errado)"; el.style.color="var(--warn)"; }
}
async function delPj(id){
  const f=findNode(id);
  if(!(await uiConfirm(`Excluir o projeto "${f.pj.name}"?`,{danger:true,okLabel:"Excluir"}))) return;
  dropLinksFor([id, ...(f.pj.apps||[]).map(a=>a.id)]);
  f.co.projects=f.co.projects.filter(x=>x.id!==id);
  brainStructDirty=true;
  closeDrawer(); save(); scheduleSync(); render();
}

function openAppModalFor(pjId, apId){ apTargetPj=pjId; openAppModal(apId); }
function openAppModal(id){
  editingApp=id||null;
  document.getElementById("appModalTitle").textContent=id?"Editar serviço":"Novo serviço";
  const a=id?findNode(id).ap:null;
  const g=(f,v)=>document.getElementById(f).value=v||"";
  g("apName",a&&a.name); g("apRole",a&&a.role); g("apPlan",a&&a.plan);
  document.getElementById("apCost").value=a?(a.cost||0):0;
  g("apDash",a&&a.dash); g("apUrl",a&&a.url); g("apHealth",a&&a.health);
  g("apNotes",a&&a.notes); g("apAlert",a&&a.alert);
  document.getElementById("apKind").value=a?(a.kind||""):""; g("apOps",a&&a.ops);
  document.getElementById("appModal").classList.add("open");
}
function saveApp(){
  const name=document.getElementById("apName").value.trim();
  if(!name) return alert("Dá um nome pro serviço.");
  const data={name, role:document.getElementById("apRole").value.trim(),
    plan:document.getElementById("apPlan").value.trim(),
    cost:parseFloat(document.getElementById("apCost").value)||0,
    dash:document.getElementById("apDash").value.trim(),
    url:document.getElementById("apUrl").value.trim(),
    health:document.getElementById("apHealth").value.trim(),
    notes:document.getElementById("apNotes").value,
    alert:document.getElementById("apAlert").value.trim(),
    kind:document.getElementById("apKind").value,
    ops:document.getElementById("apOps").value};
  if(editingApp){ const f=findNode(editingApp); Object.assign(f.ap, data); if(f.pj) f.pj._memDirty=true; }
  else{
    const f=findNode(apTargetPj);
    const id=uid();
    f.pj.apps.push({id, ...data}); f.pj._memDirty=true;
    expanded.add(f.co.id); expanded.add(f.pj.id); newborn.add(id);
  }
  save(); scheduleSync(); closeModals(); render();
}
async function delApp(id){
  const f=findNode(id);
  if(!(await uiConfirm(`Excluir "${f.ap.name}"?`,{danger:true,okLabel:"Excluir"}))) return;
  dropLinksFor([id]);
  f.pj.apps=f.pj.apps.filter(x=>x.id!==id);
  f.pj._memDirty=true;   // projeto.md lista os serviços → reescreve no cérebro (igual ao saveApp)
  closeDrawer(); save(); scheduleSync(); render();
}

let editingTodo=null;
function toggleTodo(pjId,i){ const p=findNode(pjId).pj; p.todos[i].done=!p.todos[i].done; p._todoDirty=true; save(); openDrawer(findNode(pjId)); updateHud(); scheduleSync(); }
function delTodo(pjId,i){ const p=findNode(pjId).pj; p.todos.splice(i,1); p._todoDirty=true; save(); openDrawer(findNode(pjId)); updateHud(); scheduleSync(); }
function addTodo(pjId){
  const inp=document.getElementById("todoInput"); const raw=inp.value.trim(); if(!raw) return;
  const p=findNode(pjId).pj; const m=splitTodoMeta(raw);
  p.todos.push({t:m.text, done:false, prio:m.prio||undefined, owner:m.owner||undefined, due:m.due||undefined});
  p._todoDirty=true; save(); openDrawer(findNode(pjId)); updateHud(); scheduleSync();
}
function editTodoMeta(pjId,i){ editingTodo=pjId+":"+i; openDrawer(findNode(pjId)); const el=document.getElementById("tdOwner"); if(el) el.focus(); }
function saveTodoMeta(pjId,i){
  const p=findNode(pjId).pj, t=p.todos[i]; if(!t) return;
  const prio=document.getElementById("tdPrio").value;
  const owner=(document.getElementById("tdOwner").value||"").trim().replace(/^@/,"").replace(/\s+/g,"");
  const due=(document.getElementById("tdDue").value||"").trim();
  t.prio = prio||undefined;
  t.owner = owner||undefined;
  t.due = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined;
  editingTodo=null; p._todoDirty=true; save(); openDrawer(findNode(pjId)); updateHud(); scheduleSync();
}
let syncTimer=null;
function scheduleSync(){
  if(typeof queueBrainPush==="function") queueBrainPush();  // cérebro na nuvem (2c)
  if(!brainDir) return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>syncBrain(), 1500);
}

