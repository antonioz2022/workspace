/* ================= render ================= */
const worldEl=document.getElementById("world");
const nodesEl=document.getElementById("nodes");
const edgesEl=document.getElementById("edges");
const newborn = new Set();
// acessibilidade: nós são role=button/tabindex=0 → Enter/Espaço ativam (delegado, sobrevive ao re-render)
nodesEl.addEventListener("keydown", e=>{
  const node = e.target && e.target.closest && e.target.closest(".node");
  if(!node) return;
  if(e.key==="Enter" || e.key===" " || e.key==="Spacebar"){ e.preventDefault(); handleClick(node.dataset.id, node.dataset.type); }
});

// estado inicial: aparece só quando não há nenhuma empresa (mapa vazio)
function renderEmptyState(){
  const el=document.getElementById("emptyState"); if(!el) return;
  el.classList.toggle("show", DB.companies.length===0);
}
function applyCam(){
  worldEl.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
  document.getElementById("zoomPct").textContent = Math.round(cam.z*100)+"%";
  document.getElementById("gridDots").style.backgroundSize = (26*cam.z)+"px "+(26*cam.z)+"px";
  document.getElementById("gridDots").style.backgroundPosition = cam.x+"px "+cam.y+"px";
}

function render(){
  ensurePositions();
  let nodesHtml="", edgesHtml="";

  DB.companies.forEach(c=>{
    const coOpen = expanded.has(c.id);
    nodesHtml += nodeHtml("co", c, c, null, null);
    if(coOpen){
      c.projects.forEach(p=>{
        edgesHtml += edgeHtml(c.x,c.y,p.x,p.y,c.color,1);
        nodesHtml += nodeHtml("pj", p, c, p, null);
        if(expanded.has(p.id)){
          p.apps.forEach(ap=>{
            edgesHtml += edgeHtml(p.x,p.y,ap.x,ap.y,c.color,0);
            nodesHtml += nodeHtml("ap", ap, c, p, ap);
          });
        }
      });
    }
  });
  edgesEl.innerHTML = edgesHtml;
  nodesEl.innerHTML = nodesHtml;
  newborn.clear();
  updateHud();
  renderWsPill();
  renderMapFilter();
  renderEmptyState();
  applyCam();
  // pings
  DB.companies.forEach(c=>c.projects.forEach(p=>p.apps.forEach(a=>{
    if(a.health && expanded.has(c.id) && expanded.has(p.id)) ping(a);
  })));
}

function edgeHtml(x1,y1,x2,y2,color,thick){
  const mx=(x1+x2)/2, my=(y1+y2)/2;
  const dx=x2-x1, dy=y2-y1;
  const bend = 0.18;
  const cx = mx - dy*bend, cy = my + dx*bend;
  return `<path class="edge ${thick?'':'dim'}" stroke="${esc(color)}" d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}"/>`;
}

/* ===== filtro de projetos por status (destaca no mapa) ===== */
let mapFilter="all";
function renderMapFilter(){
  const el=document.getElementById("mapFilter"); if(!el) return;
  const cnt={ativo:0, pausado:0, concluido:0}, total=DB.companies.reduce((s,c)=>s+c.projects.length,0);
  for(const c of DB.companies) for(const p of c.projects){ const s=p.status||"ativo"; if(cnt[s]!=null) cnt[s]++; }
  if(!total){ el.innerHTML=""; return; }
  const opts=[["all","Todos",total],["ativo","🟢 Ativos",cnt.ativo],["pausado","🟡 Pausados",cnt.pausado],["concluido","⚪ Concluídos",cnt.concluido]];
  el.innerHTML=opts.map(([v,lb,n])=>`<button class="fc ${mapFilter===v?"on":""}" onclick="setMapFilter('${v}')">${lb} <span class="n">${n}</span></button>`).join("");
}
function setMapFilter(v){ mapFilter = (mapFilter===v && v!=="all") ? "all" : v; renderMapFilter(); render(); }
function nodeHtml(type, item, c, p, ap){
  const id = item.id;
  const isSel = sel && sel.id===id;
  const enter = newborn.has(id) ? "enter" : "";
  let dimCls="";
  if(mapFilter!=="all"){
    const st = type==="pj" ? (item.status||"ativo") : (type==="ap" && p ? (p.status||"ativo") : null);
    if(st && st!==mapFilter) dimCls=" dimmed";
  }
  let inner="", tag="", sub="", extra="";
  if(type==="co"){
    inner = orbInner(c, "🏢");
    tag = esc(c.name);
    sub = c.projects.length+" projeto"+(c.projects.length===1?"":"s");
    extra = `<div class="halo" style="background:${esc(c.color)}"></div>
             <div class="expand-dot">${expanded.has(id)?"−":"+"}</div>`;
  }else if(type==="pj"){
    inner = orbInner(p, "🚀");
    tag = esc(p.name);
    sub = p.apps.length+" serviço"+(p.apps.length===1?"":"s")+((p.github&&!p.noRepo)?" · ⎇ repo":(p.noRepo?"":""));
    const stc = p.status==="ativo"?"ok":(p.status==="pausado"?"alert":"na");
    extra = `<div class="halo" style="background:${esc(c.color)}; opacity:.25"></div>
             <span class="sdot ${stc}"></span>
             <div class="expand-dot">${expanded.has(id)?"−":"+"}</div>`;
  }else{
    const ic = iconFor(ap.name);
    inner = `<span style="background:linear-gradient(135deg,${ic.bg},${ic.bg}cc); width:100%; height:100%; border-radius:50%; display:grid; place-items:center">${esc(ic.txt)}</span>`;
    tag = esc(ap.name);
    const pc = pingCache[ap.id];
    const dotCls = ap.health ? (pc?pc.cls:"load") : (ap.alert?"alert":"");
    if(dotCls) extra = `<span class="sdot ${dotCls}" id="nd-${ap.id}"></span>`;
  }
  const typeName = type==="co"?"empresa":(type==="pj"?"projeto":"serviço");
  const aria = `${typeName} ${tag}${sub?", "+sub:""}${type!=="ap"?(expanded.has(id)?", aberto":", fechado"):""}`;
  return `
  <div class="node ${type} ${isSel?'sel':''} ${enter}${dimCls}" data-id="${id}" data-type="${type}" style="left:${item.x}px; top:${item.y}px"
       role="button" tabindex="0" aria-label="${aria}"${type!=="ap"?` aria-expanded="${expanded.has(id)}"`:""}>
    <div class="orb">${inner}${extra}</div>
    <div class="tag">${tag}</div>
    ${sub?`<div class="sub">${sub}</div>`:""}
  </div>`;
}

function iconFor(name){
  const n=(name||"?").trim();
  const palette=["#8B5CF6","#B69CFF","#ff8b3d","#12b8a0","#ff5e7a","#eab308","#a855f7","#3ddc84"];
  let h=0; for(const ch of n) h=(h*31+ch.charCodeAt(0))>>>0;
  return {bg:palette[h%palette.length], txt:n.replace(/[^\p{L}\p{N} ]/gu,"").trim().slice(0,2).toUpperCase()||"?"};
}

function orbInner(item, fallback){
  if(item.img){
    const contain = item.imgFit==="contain";
    return `<img src="${esc(item.img)}" draggable="false" alt=""
      style="width:100%; height:100%; border-radius:50%; pointer-events:none;
             object-fit:${contain?"contain":"cover"}; ${contain?"padding:9px;":""}"
      onerror="this.remove()">`;
  }
  return esc(item.emoji||fallback);
}
function drawerIcon(item, fallback){
  if(item.img){
    const contain = item.imgFit==="contain";
    return `<img src="${esc(item.img)}" alt=""
      style="width:100%; height:100%; border-radius:14px;
             object-fit:${contain?"contain":"cover"}; ${contain?"padding:5px;":""}"
      onerror="this.remove()">`;
  }
  return esc(item.emoji||fallback);
}

function updateHud(){
  document.getElementById("hudCos").textContent = DB.companies.length;
  document.getElementById("hudPjs").textContent = DB.companies.reduce((s,c)=>s+c.projects.length,0);
  document.getElementById("hudCost").textContent = "$"+DB.companies.reduce((s,c)=>s+coCost(c),0).toFixed(0);
  { const nPend = DB.companies.reduce((s,c)=>s+c.projects.reduce((q,p)=>q+p.todos.filter(t=>!t.done).length,0),0);
    const elPend = document.getElementById("hudPend");
    elPend.textContent = nPend;
    elPend.style.color = nPend>0 ? "var(--warn)" : ""; } // âmbar = sinal: tem coisa pedindo ação
}

