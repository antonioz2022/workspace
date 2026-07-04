/* ===== diálogos & toasts do próprio Córtex (substituem os popups do navegador) ===== */
function uiToast(msg, kind){
  let host=document.getElementById("uiToasts");
  if(!host){ host=document.createElement("div"); host.id="uiToasts"; document.body.appendChild(host); }
  const t=document.createElement("div");
  t.className="ui-toast"+(kind?(" "+kind):"");
  t.textContent=String(msg);
  host.appendChild(t);
  const life=Math.min(9000, 2800 + String(msg).length*45);
  setTimeout(()=>{ t.classList.add("out"); setTimeout(()=>t.remove(), 260); }, life);
}
function uiDialog(opts){
  opts=opts||{};
  return new Promise(res=>{
    const ov=document.createElement("div"); ov.className="ui-ov";
    const dlg=document.createElement("div"); dlg.className="ui-dlg";
    const btns=(opts.buttons&&opts.buttons.length)?opts.buttons:[{label:"OK",value:true,kind:"primary"}];
    dlg.innerHTML=`${opts.title?`<h4>${esc(opts.title)}</h4>`:""}${opts.message?`<p>${esc(opts.message).replace(/\n/g,"<br>")}</p>`:""}<div class="btns"></div>`;
    const row=dlg.querySelector(".btns");
    let done=false;
    const cancelV=(opts.cancelValue!==undefined?opts.cancelValue:null);
    const close=v=>{ if(done)return; done=true; ov.remove(); document.removeEventListener("keydown",onKey); res(v); };
    btns.forEach(b=>{ const el=document.createElement("button");
      el.className="btn"+(b.kind==="primary"?" primary":b.kind==="danger"?" danger":"");
      el.textContent=b.label; el.onclick=()=>close(b.value); row.appendChild(el); });
    function onKey(e){ if(e.key==="Escape") close(cancelV);
      else if(e.key==="Enter"){ const p=btns.find(b=>b.kind==="primary"||b.kind==="danger"); if(p) close(p.value); } }
    ov.onclick=e=>{ if(e.target===ov) close(cancelV); };
    document.addEventListener("keydown",onKey);
    ov.appendChild(dlg); document.body.appendChild(ov);
    const f=row.querySelector(".primary,.danger")||row.firstChild; if(f&&f.focus) f.focus();
  });
}
async function uiConfirm(message, o){ o=o||{};
  return await uiDialog({ title:o.title||"Confirmar", message,
    buttons:[{label:o.cancelLabel||"Cancelar", value:false},
             {label:o.okLabel||"Confirmar", value:true, kind:o.danger?"danger":"primary"}],
    cancelValue:false });
}
function uiPrompt(opts){
  opts=opts||{};
  return new Promise(res=>{
    const ov=document.createElement("div"); ov.className="ui-ov";
    const dlg=document.createElement("div"); dlg.className="ui-dlg";
    dlg.innerHTML=`${opts.title?`<h4 style="${opts.danger?"color:var(--bad)":""}">${esc(opts.title)}</h4>`:""}${opts.message?`<p style="${opts.danger?"color:var(--bad)":""}">${esc(opts.message).replace(/\n/g,"<br>")}</p>`:""}
      <input style="width:100%;margin-top:14px" placeholder="${esc(opts.placeholder||"")}">
      <div class="btns"><button class="btn">${esc(opts.cancelLabel||"Cancelar")}</button><button class="btn primary ok">${esc(opts.okLabel||"OK")}</button></div>`;
    const inp=dlg.querySelector("input"), ok=dlg.querySelector(".ok"), cancel=dlg.querySelector(".btns .btn:not(.ok)");
    inp.value=opts.value||"";
    let done=false;
    const close=v=>{ if(done)return; done=true; ov.remove(); document.removeEventListener("keydown",onKey); res(v); };
    function validate(){ if(opts.confirmText!==undefined) ok.disabled = inp.value.trim()!==opts.confirmText; }
    inp.addEventListener("input", validate);
    ok.onclick=()=>{ if(!ok.disabled) close(inp.value.trim()); };
    cancel.onclick=()=>close(null);
    function onKey(e){ if(e.key==="Escape") close(null); else if(e.key==="Enter" && !ok.disabled) close(inp.value.trim()); }
    ov.onclick=e=>{ if(e.target===ov) close(null); };
    document.addEventListener("keydown",onKey);
    ov.appendChild(dlg); document.body.appendChild(ov);
    validate(); inp.focus(); if(inp.select) inp.select();
  });
}
// redireciona TODOS os alert() do app pro toast bonito — nada de popup do navegador
window.alert=(m)=>uiToast(String(m));

