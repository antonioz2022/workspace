/* ===== 🛰 Vigia 24/7 — config/status via /admin/watchdog do worker ===== */
function setWdTopic(v){ DB.settings=DB.settings||{}; DB.settings.ntfyTopic=(v||"").trim(); save(); }
function genWdTopic(){
  const abc="abcdefghijklmnopqrstuvwxyz0123456789"; let t="workspace-";
  const rnd=new Uint8Array(20); crypto.getRandomValues(rnd);
  for(const b of rnd) t+=abc[b%abc.length];
  const el=document.getElementById("wdTopicInput"); if(el) el.value=t;
  setWdTopic(t);
}
function wdServices(){
  const out=[];
  for(const c of DB.companies) for(const p of c.projects) for(const a of (p.apps||[]))
    if(a.health) out.push({name:`${a.name} (${p.name})`, url:a.health});
  return out;
}
function wdBadge(txt, ok){ const el=document.getElementById("wdStatus"); if(el){ el.textContent=txt; el.style.color= ok===false?"var(--warn)":"var(--tx3)"; } }
async function wdFetch(path, opts){
  const tok=(DB.settings||{}).githubToken;
  if(!tok) throw new Error("cola o token do GitHub (acima) primeiro");
  const r=await fetch(mcpUrl()+path, Object.assign({headers:{Authorization:"Bearer "+tok, "content-type":"application/json"}}, opts||{}));
  if(!r.ok){ const j=await r.json().catch(()=>({})); throw new Error(j.error||("HTTP "+r.status)); }
  return r.json().catch(()=>({}));
}
async function sendWatchdog(){
  const b=document.getElementById("wdSendBtn"), set=s=>{ if(b) b.textContent=s; };
  const topic=(DB.settings||{}).ntfyTopic||"";
  const services=wdServices();
  if(!topic){ alert("Gera (🎲) ou cola um tópico ntfy primeiro."); return; }
  if(!services.length){ alert("Nenhum serviço com health check cadastrado. Preencha o campo 'Health check' nos serviços."); return; }
  set("⏳ enviando…");
  try{
    const j=await wdFetch("/admin/watchdog",{method:"POST", body:JSON.stringify({ntfyTopic:topic, services})});
    set(`✓ vigiando ${j.saved} serviço(s)`); renderWatchdog();
  }catch(e){ set("⚠ falhou"); alert("Vigia: "+(e.message||e)); }
  setTimeout(()=>set("📡 Ativar/atualizar vigia"), 2800);
}
async function testWatchdog(){
  const b=document.getElementById("wdTestBtn"), set=s=>{ if(b) b.textContent=s; };
  set("⏳…");
  try{ await wdFetch("/admin/watchdog/test",{method:"POST"}); set("✓ push enviado. Olha o celular"); }
  catch(e){ set("⚠"); alert("Teste: "+(e.message||e)); }
  setTimeout(()=>set("🔔 Testar push"), 3200);
}
async function renderWatchdog(){
  const tok=(DB.settings||{}).githubToken;
  if(!tok){ wdBadge("cola o token do GitHub pra ver o status"); return; }
  try{
    const j=await wdFetch("/admin/watchdog");
    const svcs=(j.config&&j.config.services)||[];
    if(!svcs.length){ wdBadge("vigia desligado. Envie os serviços com 📡"); return; }
    const st=(j.state&&j.state.services)||{};
    const down=Object.entries(st).filter(([,v])=>v&&v.ok===false).map(([k])=>k);
    const last=j.state&&j.state.lastCheck?` · último check ${agoStr(j.state.lastCheck)}`:"";
    wdBadge(down.length?`🔴 FORA DO AR: ${down.join(", ")}${last}`:`✅ ${svcs.length} serviço(s) no ar${last}`, down.length?false:true);
  }catch(e){ wdBadge("status indisponível: "+(e.message||e), false); }
}
