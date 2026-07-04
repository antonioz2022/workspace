/* ===== 👥 Membros — colaboração GitHub-nativa =====
   Workspace = o repo de estado (privado). Membro = collaborator do repo.
   Papéis: admin (gerencia) / push=Editor / pull=Leitor. As IAs dos membros entram
   pelo MCP (o worker testa o acesso da pessoa ao repo). Token de cada um fica SÓ
   no navegador da pessoa. */
function roleLabel(p){ p=p||{}; return p.admin?"admin":(p.maintain||p.push)?"editor":"leitor"; }
function ghApiHeaders(){ return {Authorization:"Bearer "+((DB.settings||{}).githubToken||""), Accept:"application/vnd.github+json", "X-GitHub-Api-Version":"2022-11-28"}; }
async function renderMembers(){
  const list=document.getElementById("membersList"), self=document.getElementById("memberSelf");
  if(!list) return;
  if(!stateSyncOn()){
    list.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">liga a sync (token + repo, acima). A workspace É o repo de estado</div>`;
    if(self) self.textContent=""; return;
  }
  list.innerHTML=`<div class="dr-desc" style="color:var(--tx3)">carregando membros…</div>`;
  try{
    const me=await ghGet("/user").catch(()=>null);
    if(me&&me.login) localStorage.setItem(LS_KEY+"-ghlogin", me.login);
    const repo=await ghGet("/repos/"+stateRepo()).catch(()=>null);
    if(self) self.textContent=`workspace: ${stateRepo()} · você: @${me&&me.login||"?"} (${repo&&repo.permissions?roleLabel(repo.permissions):"?"})`;
    let rows="";
    let cols=null; try{ cols=await ghGet("/repos/"+stateRepo()+"/collaborators?affiliation=all&per_page=100"); }catch(e){ cols=null; }
    if(Array.isArray(cols)){
      rows+=cols.map(c=>`<div class="mini-item" style="cursor:default">
        <span class="mi-emoji">${c.login===(me&&me.login)?"⭐":"👤"}</span>
        <span style="flex:1;min-width:0"><b>@${esc(c.login)}</b> <span style="color:var(--tx3);font-size:11px">· ${roleLabel(c.permissions)}</span></span>
        ${c.login!==(me&&me.login)?`<span class="x" title="remover da workspace" onclick="removeMember('${esc(c.login)}')">✕</span>`:""}
      </div>`).join("");
    }else{
      rows+=`<div class="dr-desc" style="color:var(--warn)">não deu pra listar. Pra gerenciar membros, teu token precisa da permissão "Administration" no repo (ou usa a página do repo no GitHub)</div>`;
    }
    let invs=null; try{ invs=await ghGet("/repos/"+stateRepo()+"/invitations"); }catch(e){ invs=null; }
    if(Array.isArray(invs)&&invs.length){
      rows+=invs.map(i=>`<div class="mini-item" style="cursor:default;opacity:.75">
        <span class="mi-emoji">✉️</span>
        <span style="flex:1;min-width:0"><b>@${esc((i.invitee&&i.invitee.login)||"?")}</b> <span style="color:var(--tx3);font-size:11px">· convite pendente</span></span>
        <span class="x" title="cancelar convite" onclick="cancelInvite(${parseInt(i.id,10)||0})">✕</span>
      </div>`).join("");
    }
    list.innerHTML=rows||`<div class="dr-desc" style="color:var(--tx3)">só você por enquanto. Convide alguém acima</div>`;
  }catch(e){ list.innerHTML=`<div class="dr-desc" style="color:var(--warn)">falha: ${esc(e.message||String(e))}</div>`; }
}
async function inviteMember(){
  const u=((document.getElementById("memberUser")||{}).value||"").trim().replace(/^@/,"");
  const role=(document.getElementById("memberRole")||{}).value||"push";
  if(!u){ alert("Digite o usuário do GitHub da pessoa."); return; }
  if(!stateSyncOn()){ alert("Liga a sync primeiro (token + repo)."); return; }
  try{
    const r=await fetch("https://api.github.com/repos/"+stateRepo()+"/collaborators/"+encodeURIComponent(u),{
      method:"PUT", headers:Object.assign(ghApiHeaders(),{"content-type":"application/json"}),
      body:JSON.stringify({permission:role})});
    if(r.status===201) alert(`Convite enviado pra @${u}! A pessoa aceita no GitHub (e-mail/notificações). Depois manda pra ela o "📋 Copiar convite" com os passos do Córtex.`);
    else if(r.status===204) alert(`@${u} já era membro. Papel atualizado.`);
    else{
      const j=await r.json().catch(()=>({}));
      throw new Error((r.status===403?'403: teu token precisa da permissão "Administration" (read/write) no repo pra convidar. ':"HTTP "+r.status+" · ")+(j.message||""));
    }
    document.getElementById("memberUser").value="";
    renderMembers();
  }catch(e){ alert("Convite: "+(e.message||e)); }
}
async function removeMember(login){
  if(!(await uiConfirm(`Remover @${login} da workspace? A pessoa (e as IAs dela) perde o acesso à brain.`,{danger:true,okLabel:"Remover"}))) return;
  try{
    const r=await fetch("https://api.github.com/repos/"+stateRepo()+"/collaborators/"+encodeURIComponent(login),{method:"DELETE", headers:ghApiHeaders()});
    if(!r.ok&&r.status!==204) throw new Error("HTTP "+r.status);
    renderMembers();
  }catch(e){ alert("Remover: "+(e.message||e)); }
}
async function cancelInvite(id){
  try{
    await fetch("https://api.github.com/repos/"+stateRepo()+"/invitations/"+id,{method:"DELETE", headers:ghApiHeaders()});
    renderMembers();
  }catch(e){ alert("Cancelar: "+(e.message||e)); }
}
async function copyInviteText(btn){
  const repo=stateRepo()||"<owner/repo>";
  const txt=`Você foi convidado pra workspace do Córtex! 🧠

1) Aceita o convite do GitHub (repo ${repo}) — chegou no teu e-mail/notificações
2) Cria TEU token: github.com/settings/tokens → "Generate new token (classic)" → escopo "repo" → copia
   (o token é teu e fica só no teu navegador — nunca compartilha)
3) Abre o Córtex: https://antonioz2022.github.io/workspace/
4) ⚙ Contas → cola teu token → no campo do repo de estado cola: ${repo} → sincroniza
5) (opcional) Conecta tua IA: na seção "🤖 IAs conectadas", copia a URL do conector e adiciona no teu Claude/ChatGPT — tua IA passa a conhecer a workspace

Pronto — mesmo mapa, mesma brain, cada um com seu acesso.`;
  const ok=await copyText(txt);
  if(btn){ btn.textContent=ok?"✓ copiado — manda pro novo membro":"⚠ veja o console"; if(!ok) console.log(txt);
    setTimeout(()=>{ btn.textContent="📋 Copiar convite (passos pro novo membro)"; },3200); }
}
async function mcpDisconnect(clientId, name){
  if(!(await uiConfirm(`Desconectar "${name}"? Ele perde o acesso à brain na hora (precisaria autorizar de novo).`,{danger:true,okLabel:"Desconectar"}))) return;
  try{
    const r=await fetch(mcpUrl()+"/admin/connections/"+encodeURIComponent(clientId),{
      method:"DELETE", headers:{Authorization:"Bearer "+((DB.settings||{}).githubToken||"")}});
    if(!r.ok && r.status!==204){ const j=await r.json().catch(()=>({})); throw new Error(j.error||("HTTP "+r.status)); }
    renderMcpConnections();
  }catch(e){ alert("Desconectar: "+(e.message||e)); }
}

