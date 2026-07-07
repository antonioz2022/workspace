/* ================= interação: pan / zoom / drag ================= */
const vp=document.getElementById("viewport");
let panState=null, dragState=null, moved=false;
const activePtrs=new Map();   // pointerId -> {x,y} (touch: pinch-zoom com 2 dedos)
let pinchState=null;          // {dPrev}

vp.addEventListener("pointerdown", e=>{
  activePtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(activePtrs.size===2){
    // 2º dedo → vira pinch: cancela pan/drag e passa a zoomar
    dragState=null; panState=null; vp.classList.remove("panning"); moved=true;
    const [p1,p2]=[...activePtrs.values()];
    pinchState={dPrev:Math.hypot(p2.x-p1.x,p2.y-p1.y)};
    vp.setPointerCapture(e.pointerId);
    return;
  }
  if(activePtrs.size>2){ vp.setPointerCapture(e.pointerId); return; }
  const nodeEl = e.target.closest(".node");
  moved=false;
  if(nodeEl){
    const id=nodeEl.dataset.id;
    const found=findNode(id);
    if(found){
      dragState={item:found.item, sx:e.clientX, sy:e.clientY, ox:found.item.x, oy:found.item.y, el:nodeEl};
      vp.setPointerCapture(e.pointerId);
    }
  }else{
    panState={sx:e.clientX, sy:e.clientY, ox:cam.x, oy:cam.y};
    vp.classList.add("panning");
    vp.setPointerCapture(e.pointerId);
  }
});
vp.addEventListener("pointermove", e=>{
  if(activePtrs.has(e.pointerId)) activePtrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinchState){
    if(activePtrs.size>=2){
      const [p1,p2]=[...activePtrs.values()];
      const d=Math.hypot(p2.x-p1.x,p2.y-p1.y);
      const cx=(p1.x+p2.x)/2, cy=(p1.y+p2.y)/2;
      if(pinchState.dPrev>8 && d>8) zoomAt(cx,cy,d/pinchState.dPrev);
      pinchState.dPrev=d;
    }
    return;
  }
  if(dragState){
    const dx=(e.clientX-dragState.sx)/cam.z, dy=(e.clientY-dragState.sy)/cam.z;
    if(Math.abs(dx)>3||Math.abs(dy)>3) moved=true;
    dragState.item.x=dragState.ox+dx; dragState.item.y=dragState.oy+dy;
    dragState.el.style.left=dragState.item.x+"px";
    dragState.el.style.top=dragState.item.y+"px";
    redrawEdgesOnly();
  }else if(panState){
    const dx=e.clientX-panState.sx, dy=e.clientY-panState.sy;
    if(Math.abs(dx)>3||Math.abs(dy)>3) moved=true;
    cam.x=panState.ox+dx; cam.y=panState.oy+dy;
    applyCam();
  }
});
vp.addEventListener("pointercancel", e=>{
  activePtrs.delete(e.pointerId);
  if(activePtrs.size<2) pinchState=null;
  dragState=null; panState=null; vp.classList.remove("panning");
});
vp.addEventListener("pointerup", e=>{
  activePtrs.delete(e.pointerId);
  if(pinchState){ if(activePtrs.size<2){ pinchState=null; saveView(); } return; }
  if(dragState){
    const id=dragState.item.id ? (dragState.el.dataset.id) : null;
    if(!moved && id) handleClick(id, dragState.el.dataset.type);
    else save();
    dragState=null;
  }else if(panState){
    panState=null; vp.classList.remove("panning");
    saveView();
  }
});
vp.addEventListener("wheel", e=>{
  e.preventDefault();
  const f = e.deltaY<0 ? 1.12 : 1/1.12;
  zoomAt(e.clientX, e.clientY, f);
},{passive:false});

function zoomAt(px,py,f){
  const nz=Math.min(2.6, Math.max(.25, cam.z*f));
  const k=nz/cam.z;
  cam.x = px - (px-cam.x)*k;
  cam.y = py - (py-cam.y)*k;
  cam.z = nz;
  applyCam(); saveView();
}
function zoomBy(d){ zoomAt(innerWidth/2, innerHeight/2, 1+d); }
function fitView(){
  let xs=[], ys=[];
  DB.companies.forEach(c=>{ xs.push(c.x); ys.push(c.y);
    if(expanded.has(c.id)) c.projects.forEach(p=>{ xs.push(p.x); ys.push(p.y);
      if(expanded.has(p.id)) p.apps.forEach(a=>{ xs.push(a.x); ys.push(a.y); }); }); });
  if(!xs.length){ cam={x:innerWidth/2,y:innerHeight/2,z:1}; applyCam(); return; }
  const minX=Math.min(...xs)-220, maxX=Math.max(...xs)+220;
  const minY=Math.min(...ys)-200, maxY=Math.max(...ys)+200;
  const z=Math.min(2, Math.min(innerWidth/(maxX-minX), innerHeight/(maxY-minY)));
  cam.z=Math.max(.25,z);
  cam.x=innerWidth/2 - (minX+maxX)/2*cam.z;
  cam.y=innerHeight/2 - (minY+maxY)/2*cam.z;
  applyCam(); save();
}

function redrawEdgesOnly(){
  let html="";
  DB.companies.forEach(c=>{
    if(!expanded.has(c.id)) return;
    c.projects.forEach(p=>{
      html+=edgeHtml(c.x,c.y,p.x,p.y,c.color,1);
      if(expanded.has(p.id)) p.apps.forEach(a=>html+=edgeHtml(p.x,p.y,a.x,a.y,c.color,0));
    });
  });
  edgesEl.innerHTML=html;
}

function findNode(id){
  for(const c of DB.companies){
    if(c.id===id) return {type:"co", item:c, co:c};
    for(const p of c.projects){
      if(p.id===id) return {type:"pj", item:p, co:c, pj:p};
      for(const a of p.apps) if(a.id===id) return {type:"ap", item:a, co:c, pj:p, ap:a};
    }
  }
  return null;
}

function handleClick(id, type){
  const f=findNode(id); if(!f) return;
  if(type==="co"){
    if(expanded.has(id)) { expanded.delete(id); f.co.projects.forEach(p=>expanded.delete(p.id)); }
    else { expanded.add(id); f.co.projects.forEach(p=>newborn.add(p.id)); }
  }
  if(type==="pj"){
    if(expanded.has(id)) expanded.delete(id);
    else { expanded.add(id); f.pj.apps.forEach(a=>newborn.add(a.id)); }
  }
  if(typeof markRecent==="function") markRecent(id);   // clique direto também conta pro "▶ Retomar"
  sel={id, ...f};
  save(); render(); openDrawer(f);
}

