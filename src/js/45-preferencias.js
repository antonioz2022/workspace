/* ===== 🎚 Preferências — controle das automações do painel =====
   Norte: automação por padrão, controle pra quem preferir. Toda preferência é
   default-LIGADA (chave ausente = ligada, checagem `!==false`), então quem nunca
   abrir esta aba mantém o comportamento atual. As chaves vivem em DB.settings e
   não estão em LOCAL_ONLY_SETTINGS → viajam no state.json (mesma escolha em todo
   aparelho). O tema é a exceção deliberada: preferência LOCAL por navegador (como
   a câmera), porque claro/escuro é do ambiente, não da workspace. */
const PREFS=[
  {key:"memAutoDraft", emoji:"🧠", title:"Rascunho automático de checkpoint",
   desc:"Ao abrir o painel, projetos com commits sem checkpoint ganham sozinhos uma sessão datada na memória. Desligado, o banner do projeto passa a oferecer o rascunho com 1 clique."},
  {key:"autoRefresh", emoji:"🔄", title:"Atualização automática",
   desc:"Ao voltar pra janela e a cada 5 minutos, atualiza o estado da workspace, a telemetria dos repositórios e o status dos serviços. Desligado, use o Cockpit pra atualizar na mão."},
  {key:"collabNotify", emoji:"🤝", title:"Aviso de colaboração",
   desc:"Mostra um banner quando outra pessoa (ou outro aparelho seu) atualiza a workspace, pra você puxar na hora que quiser."},
  {key:"resumeBanner", emoji:"▶", title:"Sugestão de retomada",
   desc:"Ao abrir o painel, sugere voltar pro último projeto em que você mexeu, já com o resumo de onde parou."},
];
function prefOn(key){ return ((DB.settings||{})[key])!==false; }
function prefToggle(key){
  DB.settings=DB.settings||{}; DB.settings[key]=!prefOn(key);
  save(); renderPrefs();
  prefSideEffects(key);
}
function prefSideEffects(key){
  // reflete a escolha na hora, sem esperar o próximo boot
  if(key==="resumeBanner" && typeof renderResumeBanner==="function") renderResumeBanner();
  if(key==="collabNotify" && !prefOn(key) && typeof hideCollab==="function") hideCollab();
  if(key==="memAutoDraft" && typeof sel!=="undefined" && sel){
    const f=findNode(sel.id); if(f&&f.type==="pj"&&typeof hydrateMemSync==="function") hydrateMemSync(f.co,f.pj);
  }
}
function prefSwitchHtml(on, onclick, label){
  return `<button class="pref-sw ${on?"on":""}" role="switch" aria-checked="${on?"true":"false"}" aria-label="${esc(label)}" onclick="${onclick}"><span></span></button>`;
}
function renderPrefs(){
  const el=document.getElementById("prefsList"); if(!el) return;
  const rows=PREFS.map(p=>`<div class="pref-item">
      <div class="pref-tx"><b>${p.emoji} ${esc(p.title)}</b><span>${esc(p.desc)}</span></div>
      ${prefSwitchHtml(prefOn(p.key), `prefToggle('${p.key}')`, p.title)}
    </div>`);
  const light=document.documentElement.getAttribute("data-theme")==="light";
  rows.push(`<div class="pref-item">
      <div class="pref-tx"><b>☀️ Tema claro</b><span>Aparência do painel neste navegador. Não sincroniza: cada aparelho escolhe o seu.</span></div>
      ${prefSwitchHtml(light, "toggleTheme();renderPrefs()", "Tema claro")}
    </div>`);
  el.innerHTML=rows.join("");
}
function openPrefs(){ openAiModal(); switchAccTab("prefs"); }
