/* ===== 🕸 Grafo de conhecimento — relações tipadas entre empresas/projetos/serviços =====
   A árvore (empresa → projeto → serviço) vira GRAFO: arestas nomeadas ligam nós de
   qualquer parte do workspace (ex.: "Publicador Social publica Dragon Block Galactic",
   "Córtex hospeda o Vigia da Pousada"). As relações são DADOS (`DB.links`) — viajam no
   state.json, aparecem no mapa e vão pra Brain (GRAFO.md + INDEX) pras IAs cruzarem
   contexto sem re-derivar tudo lendo. `DB.links[]` = {id, from, to, type, note}. */
let brainLinksDirty=false;   // muda uma relação → regenera INDEX + GRAFO no cérebro
const LINK_TYPES=[
  {id:"depende",    label:"depende de",           dir:true},
  {id:"hospeda",    label:"hospeda / é infra de", dir:true},
  {id:"integra",    label:"integra / usa",        dir:true},
  {id:"publica",    label:"publica / distribui",  dir:true},
  {id:"deriva",     label:"deriva de / é parte de",dir:true},
  {id:"compartilha",label:"compartilha com",      dir:false},
  {id:"relacionado",label:"relacionado a",        dir:false},
];
function linkType(id){ return LINK_TYPES.find(x=>x.id===id)||{id, label:id, dir:false}; }
function linkTypeLabel(id){ return linkType(id).label; }
function linkTypeDir(id){ return linkType(id).dir; }

/* índice de TODOS os nós do workspace (empresa/projeto/serviço), por id */
function graphNodes(){
  const out=[];
  for(const c of DB.companies){
    out.push({id:c.id, kind:"co", name:c.name, co:c, x:c.x, y:c.y, label:c.name});
    for(const p of (c.projects||[])){
      out.push({id:p.id, kind:"pj", name:p.name, co:c, pj:p, x:p.x, y:p.y, label:`${p.name} · ${c.name}`});
      for(const a of (p.apps||[])) out.push({id:a.id, kind:"ap", name:a.name, co:c, pj:p, ap:a, x:a.x, y:a.y, label:`${a.name} · ${p.name}`});
    }
  }
  return out;
}
function graphNode(id){ return graphNodes().find(n=>n.id===id)||null; }
const kindIcon=k=>k==="co"?"🏢":k==="pj"?"🚀":"🔌";
const kindName=k=>k==="co"?"empresa":k==="pj"?"projeto":"serviço";
function nodeVisibleG(n){
  if(!n) return false;
  if(n.kind==="co") return true;
  if(n.kind==="pj") return expanded.has(n.co.id);
  return expanded.has(n.co.id) && expanded.has(n.pj.id);   // serviço
}
function linksOf(id){ return (DB.links||[]).filter(l=>l.from===id||l.to===id); }
function addLinkData(from,to,type,note){
  if(!from||!to||from===to) return false;
  DB.links=DB.links||[];
  if(DB.links.some(l=>l.from===from&&l.to===to&&l.type===type)) return false;   // sem duplicata exata
  DB.links.push({id:uid(), from, to, type:type||"relacionado", note:(note||"").trim()});
  brainLinksDirty=true; save(); if(typeof queueBrainPush==="function") queueBrainPush(); return true;
}
function delLinkData(id){ DB.links=(DB.links||[]).filter(l=>l.id!==id); brainLinksDirty=true; save(); if(typeof queueBrainPush==="function") queueBrainPush(); }

/* arestas do grafo no mapa: só desenha quando OS DOIS nós estão à vista (pai expandido) */
function grafoEdgesHtml(){
  const links=DB.links||[]; if(!links.length) return "";
  let out="";
  for(const l of links){
    const a=graphNode(l.from), b=graphNode(l.to);
    if(!a||!b || !nodeVisibleG(a) || !nodeVisibleG(b)) continue;
    if(a.x==null||b.x==null) continue;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    out+=`<path class="edge rel" d="M ${a.x} ${a.y} L ${b.x} ${b.y}"><title>${esc(linkTypeLabel(l.type))}${l.note?" — "+esc(l.note):""}</title></path>`;
    out+=`<text class="edge-label" x="${mx}" y="${my-4}" text-anchor="middle">${esc(linkTypeLabel(l.type))}</text>`;
  }
  return out;
}

/* seção "🕸 Relações" no drawer (empresa/projeto/serviço) */
function relationsSectionHtml(id){
  const links=linksOf(id);
  const rows=links.map(l=>{
    const isFrom=l.from===id, other=graphNode(isFrom?l.to:l.from), dir=linkTypeDir(l.type);
    const arrow = dir ? (isFrom?"→":"←") : "↔";
    const oName = other?esc(other.name):"(nó removido)";
    const oKind = other?` <span style="color:var(--tx3);font-size:11px">(${kindName(other.kind)})</span>`:"";
    return `<div class="mini-item" style="cursor:default">
      <span class="mi-emoji" title="${dir?(isFrom?"deste → outro":"outro → deste"):"mútua"}">${arrow}</span>
      <span style="flex:1;min-width:0"><b>${esc(linkTypeLabel(l.type))}</b> ${oName}${oKind}${l.note?`<br><span style="color:var(--tx3);font-size:11px">${esc(l.note)}</span>`:""}</span>
      ${other?`<span class="arrow" title="ir até o nó" onclick="closeDrawer();jumpTo('${other.id}')" style="cursor:pointer">↗</span>`:""}
      <span class="x" title="remover relação" onclick="delLinkUi('${l.id}')">✕</span>
    </div>`;
  }).join("");
  return `<div class="dr-sec">🕸 Relações <span style="font-weight:400;font-size:11px;color:var(--tx3)">— conexões com outros projetos, empresas e serviços</span></div>
    ${links.length?`<div class="mini-list">${rows}</div>`:`<div class="dr-desc" style="color:var(--tx3)">Nenhuma relação ainda. Ligue este nó a outro do workspace (ex.: "publica", "hospeda", "depende de") — as IAs passam a enxergar a conexão.</div>`}
    <div style="margin-top:8px"><button class="btn sm" onclick="openLinkForm('${id}')">＋ Nova relação</button></div>`;
}

/* modal de nova relação */
let linkFromId=null;
function openLinkForm(fromId, preTo){
  const from=graphNode(fromId); if(!from) return;
  linkFromId=fromId;
  document.getElementById("linkFromLabel").textContent=`${kindIcon(from.kind)} ${from.label||from.name}`;
  document.getElementById("linkType").innerHTML=LINK_TYPES.map(t=>`<option value="${t.id}">${esc(t.label)}</option>`).join("");
  const others=graphNodes().filter(n=>n.id!==fromId);
  document.getElementById("linkTo").innerHTML = others.length
    ? others.map(n=>`<option value="${esc(n.id)}"${n.id===preTo?" selected":""}>${kindIcon(n.kind)} ${esc(n.label||n.name)}</option>`).join("")
    : `<option value="">(nenhum outro nó no workspace)</option>`;
  document.getElementById("linkNote").value="";
  document.getElementById("linkModal").classList.add("open");
}
function saveLinkUi(){
  const to=document.getElementById("linkTo").value, type=document.getElementById("linkType").value, note=document.getElementById("linkNote").value;
  if(!to){ uiToast("Escolha o outro nó da relação.","warn"); return; }
  const ok=addLinkData(linkFromId, to, type, note);
  closeModals();
  if(sel){ const f=findNode(sel.id); if(f) openDrawer(f); }
  render();
  uiToast(ok?"Relação criada — já vai pra brain.":"Essa relação já existe.", ok?"ok":"warn");
}
function delLinkUi(id){ delLinkData(id); if(sel){ const f=findNode(sel.id); if(f) openDrawer(f); } render(); }

/* GRAFO.md pra Brain: as conexões viram documento que a IA lê (fecha "conexão não codificada") */
function genGrafoMd(){
  const nodes=graphNodes(), links=DB.links||[];
  const nameOf=id=>{ const n=nodes.find(x=>x.id===id); return n?(n.label||n.name):"(removido)"; };
  let out=`# 🕸 GRAFO — relações entre projetos, empresas e serviços\n\n`+
    `> Como as coisas do workspace se conectam entre si (o que a árvore empresa→projeto não mostra).\n`+
    `> Gerado pelo painel Córtex — não editar à mão. Comece pelo [INDEX.md](INDEX.md).\n`;
  if(!links.length){ out+=`\n_(nenhuma relação registrada ainda)_\n`; return out; }
  const byNode={};
  for(const l of links){ (byNode[l.from]=byNode[l.from]||[]).push(l); (byNode[l.to]=byNode[l.to]||[]).push(l); }
  out+=`\n## Por nó\n`;
  for(const n of nodes){
    const ls=byNode[n.id]; if(!ls||!ls.length) continue;
    out+=`\n### ${kindIcon(n.kind)} ${n.label||n.name}\n`;
    for(const l of ls){
      const isFrom=l.from===n.id, other=isFrom?l.to:l.from, dir=linkTypeDir(l.type);
      const rel = dir ? (isFrom?`→ ${linkTypeLabel(l.type)}`:`← ${linkTypeLabel(l.type)}`) : `↔ ${linkTypeLabel(l.type)}`;
      out+=`- ${rel} **${nameOf(other)}**${l.note?` — ${l.note}`:""}\n`;
    }
  }
  out+=`\n## Todas as relações (${links.length})\n`;
  for(const l of links) out+=`- ${nameOf(l.from)} — *${linkTypeLabel(l.type)}* → ${nameOf(l.to)}${l.note?` (${l.note})`:""}\n`;
  return out;
}
/* linha de relações de um nó pro INDEX.md (panorama já mostra as conexões) */
function indexRelLine(id){
  const ls=linksOf(id); if(!ls.length) return "";
  const parts=ls.map(l=>{
    const isFrom=l.from===id, other=graphNode(isFrom?l.to:l.from), dir=linkTypeDir(l.type);
    const nm=other?(other.name):"(removido)";
    const rel=dir?(isFrom?linkTypeLabel(l.type):"← "+linkTypeLabel(l.type)):linkTypeLabel(l.type);
    return `${rel} ${nm}`;
  });
  return `- **Relações**: ${parts.join(" · ")}\n`;
}
