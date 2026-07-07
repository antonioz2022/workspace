/* ================= 🧠 CÉREBRO (Workspace/brain <-> IAs por arquivos) ================= */
let brainDir=null;

const slug=s=>(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase()
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

function idbOpen(){ return new Promise((res,rej)=>{
  const r=indexedDB.open("workspace-brain",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("kv");
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
});}
async function idbSet(k,v){ const db=await idbOpen(); return new Promise((res,rej)=>{
  const tx=db.transaction("kv","readwrite"); tx.objectStore("kv").put(v,k);
  tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
});}
async function idbGet(k){ const db=await idbOpen(); return new Promise((res,rej)=>{
  const rq=db.transaction("kv").objectStore("kv").get(k);
  rq.onsuccess=()=>res(rq.result); rq.onerror=()=>rej(rq.error);
});}

function setBrainBtn(label){ const b=document.getElementById("brainBtn"); if(b) b.innerHTML=label; }

async function getDirPath(root, parts, create){
  let d=root;
  for(const p of parts) d=await d.getDirectoryHandle(p,{create:!!create});
  return d;
}
async function readFileIf(dir, name){
  try{ const fh=await dir.getFileHandle(name); return await (await fh.getFile()).text(); }
  catch(e){ return null; }
}
async function writeFile(dir, name, text){
  const fh=await dir.getFileHandle(name,{create:true});
  const w=await fh.createWritable(); await w.write(text); await w.close();
}

function profileBlock(pr){
  pr=pr||{}; const rows=[];
  if(pr.tone) rows.push(`- **Tom de voz:** ${pr.tone}`);
  if(pr.audience) rows.push(`- **Público-alvo:** ${pr.audience}`);
  if(pr.value) rows.push(`- **Proposta / essência:** ${pr.value}`);
  if(pr.rules) rows.push(`- **Do's & Don'ts:** ${pr.rules}`);
  return rows.length ? `\n## Perfil pra IA\n${rows.join("\n")}\n` : "";
}
function genEmpresaMd(c){
  const projs=(c.projects||[]).map(p=>`- **${p.name}** (${p.status||"ativo"})${p.desc?` — ${p.desc}`:""}`).join("\n")||"(nenhum)";
  return `# ${c.name} — perfil da empresa\n\n${c.desc||""}\n${profileBlock(c.profile)}\n## Projetos\n${projs}\n\n## Brand kit\n[brand/](brand/) — logos + cores em brand.md\n`;
}
async function copyProfilePrompt(which){
  const isCo=which==="co";
  const nm=(document.getElementById(isCo?"coName":"pjName").value||"").trim()||"(sem nome)";
  let mat="o que você já sabe";
  if(!isCo){ const gh=(document.getElementById("pjGithub").value||"").trim(); if(gh) mat=`o repositório ${gh} (README/CLAUDE.md/código) e o que você sabe`; }
  const alvo=isCo?`a empresa "${nm}"`:`o projeto "${nm}"`;
  const prompt=`Com base em ${mat}, proponha um PERFIL curto de ${alvo} pra alimentar a brain do Antonio. Responda EXATAMENTE assim, 1 linha por campo, específico e direto:\n\nTom de voz: <...>\nPúblico-alvo: <...>\nProposta / essência: <...>\nDo's & Don'ts: <...>\n\nDepois eu colo cada linha no campo correspondente do painel.`;
  const ok=await copyText(prompt);
  const b=(typeof event!=="undefined")&&event.target; if(b){ const o=b.textContent; b.textContent=ok?"✓ copiado — cole na IA":"⚠ veja console"; if(!ok)console.log(prompt); setTimeout(()=>{b.textContent=o;},2000); }
}
async function copyRunbookPrompt(){
  const nm=(document.getElementById("apName").value||"").trim()||"este serviço";
  const kind=document.getElementById("apKind").value||"";
  const url=(document.getElementById("apUrl").value||"").trim();
  const notes=(document.getElementById("apNotes").value||"").trim();
  const prompt=`Escreva um RUNBOOK curto de como operar o serviço "${nm}"${kind?` (${kind})`:""}${url?`, ${url}`:""} pra uma IA agir nele com segurança. Inclua: ações comuns (deploy, ver logs, testar), comandos, e ONDE ficam as credenciais no ambiente (env vars, git local…) — SEM os valores. ${notes?`Contexto: ${notes}. `:""}Responda em bullets curtos, direto ao ponto — é só eu colar no campo "Runbook" do painel.`;
  const ok=await copyText(prompt);
  const b=(typeof event!=="undefined")&&event.target; if(b){ const o=b.textContent; b.textContent=ok?"✓ copiado — cole na IA":"⚠ veja console"; if(!ok)console.log(prompt); setTimeout(()=>{b.textContent=o;},2000); }
}
function runbookBlock(p){
  const ops=(p.apps||[]).filter(a=>a.ops||a.kind);
  if(!ops.length) return "";
  return `\n## Como operar (runbook pra IA)\n`+ops.map(a=>{
    let s=`### ${a.name}${a.kind?` — ${a.kind}`:""}`;
    if(a.url) s+=`\n- endpoint: ${a.url}`;
    if(a.dash) s+=`\n- painel: ${a.dash}`;
    if(a.health) s+=`\n- health: ${a.health}`;
    if(a.ops) s+=`\n${a.ops.split("\n").filter(l=>l.trim()).map(l=>"- "+l.trim()).join("\n")}`;
    return s;
  }).join("\n\n")+`\n\n> A IA age com as credenciais do ambiente LOCAL do Antonio (nunca no repo). Não exponha/commite segredos; confirme antes de ações destrutivas (deploy em produção, apagar, envio em massa); valide com o health/teste após agir.\n`;
}
function genProjetoMd(c,p){
  const svcs=(p.apps||[]).map(a=>{
    let l=`- **${a.name}** — ${a.role||""} · ${a.plan||"—"} · ${(parseFloat(a.cost)||0)>0?"~US$ "+parseFloat(a.cost).toFixed(0)+"/mês":"grátis"}`;
    if(a.alert) l+=`\n  - ⚠ ${a.alert}`;
    if(a.notes) l+="\n"+a.notes.split("\n").map(n=>"  - "+n).join("\n");
    if(a.dash) l+=`\n  - painel: ${a.dash}`;
    return l;
  }).join("\n");
  return `# ${p.name}
**Empresa:** ${c.name}${c.desc?` (${c.desc})`:""}
**Status:** ${p.status||"ativo"} · **Custo:** ~US$ ${pjCost(p).toFixed(0)}/mês
${p.focus?`\n**🎯 Onde parei / foco atual:** ${p.focus}\n`:""}
${p.desc||""}
${profileBlock(p.profile)}
## Serviços & assinaturas
${svcs||"(nenhum)"}
${runbookBlock(p)}
*(gerado pelo painel Workspace — edite pelo painel, não aqui)*
`;
}
/* metadata inline das pendências: !alta|!media|!baixa · @dono · 📅YYYY-MM-DD no FIM da 1ª linha.
   Fica no texto → viaja no pendencias.md (a IA lê/escreve igual) e o round-trip segue lossless. */
const prioMark={alta:"🔴", media:"🟡", baixa:"🟢"}, prioName={alta:"alta", media:"média", baixa:"baixa"};
function splitTodoMeta(body){
  let prio=null, owner=null, due=null, m, go=true;
  while(go){ go=false;
    if((m=body.match(/\s+(?:📅|due:)\s?(\d{4}-\d{2}-\d{2})$/))){ due=m[1]; body=body.slice(0,m.index); go=true; continue; }
    if((m=body.match(/\s+@([\w.\-]+)$/))){ owner=m[1]; body=body.slice(0,m.index); go=true; continue; }
    if((m=body.match(/\s+!(alta|m[ée]dia|baixa)$/i))){ prio=m[1].toLowerCase().replace("é","e"); body=body.slice(0,m.index); go=true; continue; }
  }
  return {text:body, prio, owner, due};
}
function todoMetaStr(t){ return (t.prio?` !${t.prio}`:"")+(t.owner?` @${t.owner}`:"")+(t.due?` 📅${t.due}`:""); }
/* serializa preservando o texto MULTILINHA (continuações vêm com \n+indentação em t.t), a
   seção (## …), o espaçamento (gap) e a metadata (só na 1ª linha, depois do texto). */
const serTodos=p=>{
  let out=`# Pendências — ${p.name}\n\n`, lastSec=null, first=true;
  for(const t of (p.todos||[])){
    const sec=t.section||"";
    if(sec!==lastSec){ if(sec){ if(!first) out+="\n"; out+=`## ${sec}\n`; } lastSec=sec; }
    if(t.gap && !first) out+="\n";
    const lines=(t.t||"").split("\n"), head=lines.shift();
    out+=`- [${t.done?"x":" "}] ${head}${todoMetaStr(t)}\n`;
    if(lines.length) out+=lines.join("\n")+"\n";
    first=false;
  }
  return out;
};
/* parser lossless: item = 1ª linha "- [ ] …" + linhas de continuação indentadas (guardadas
   em t com o \n original); cabeçalhos ## viram section; linhas em branco viram "gap". Assim
   o round-trip NÃO trunca as pendências multilinha escritas por uma IA no repo. */
function parseTodos(text){
  const out=[]; let cur=null, section="", pendingGap=false;
  for(const ln of text.split("\n")){
    const mItem=ln.match(/^\s*[-*] \[( |x|X)\]\s?(.*)$/);
    if(mItem){ cur={t:mItem[2], done:mItem[1].toLowerCase()==="x", section, gap:pendingGap}; out.push(cur); pendingGap=false; continue; }
    const mHead=ln.match(/^(#{1,6})\s+(.*)$/);
    if(mHead){ if(mHead[1].length>1){ section=mHead[2].trim(); } cur=null; pendingGap=false; continue; } // # (H1 título) é ignorado; ##+ vira seção
    if(ln.trim()===""){ pendingGap=true; cur=null; continue; }
    if(cur){ cur.t += "\n"+ln; continue; } // linha de continuação do item atual (mantém indentação)
    // texto solto sem item/cabeçalho (não ocorre nas pendências normais) → ignora, como o parser antigo
  }
  return out;
}

async function connectBrainClick(){
  try{
    if(!brainDir) brainDir=await idbGet("brainDir")||null;
    if(brainDir){
      let st=await brainDir.queryPermission({mode:"readwrite"});
      if(st!=="granted") st=await brainDir.requestPermission({mode:"readwrite"});
      if(st==="granted") return syncBrain();
      brainDir=null;
    }
    brainDir=await window.showDirectoryPicker({mode:"readwrite"});
    await idbSet("brainDir", brainDir);
    await syncBrain();
  }catch(e){
    if(e && e.name==="AbortError") return;
    alert("Cérebro: "+(e.message||e));
  }
}

async function syncBrain(){
  if(!brainDir) return;
  setBrainBtn("⏳ sincronizando…");
  let lidos=0, escritos=0;
  try{
    for(const c of DB.companies){
      for(const p of c.projects){
        const dir=await getDirPath(brainDir,[slug(c.name),slug(p.name)],true);
        // memória: quem editou por último ganha (app marcado como "dirty" escreve;
        // senão o disco — onde as IAs escrevem — é a fonte da verdade)
        if(p._memDirty){
          await writeFile(dir,"memoria.md", p.context||`# Memória — ${p.name}\n`);
          p._memDirty=false; escritos++;
        }else{
          const t=await readFileIf(dir,"memoria.md");
          if(t===null){ await writeFile(dir,"memoria.md", p.context||`# Memória — ${p.name}\n`); escritos++; }
          else if(t!==p.context){ p.context=t; lidos++; }
        }
        // pendências: mesma regra
        if(p._todoDirty){
          await writeFile(dir,"pendencias.md", serTodos(p));
          p._todoDirty=false; escritos++;
        }else{
          const t=await readFileIf(dir,"pendencias.md");
          if(t===null){ await writeFile(dir,"pendencias.md", serTodos(p)); escritos++; }
          else{
            const parsed=parseTodos(t);
            if(JSON.stringify(parsed)!==JSON.stringify(p.todos)){ p.todos=parsed; lidos++; }
          }
        }
        // cartão do projeto: sempre reflete o painel
        await writeFile(dir,"projeto.md", genProjetoMd(c,p));
      }
    }
    // espelho SEM segredos (mesma regra do backup): a pasta brain/ é lida por IAs por
    // contrato — token do GitHub e chaves de IA nunca vão pro disco
    await writeFile(brainDir,"workspace.json", JSON.stringify(sanitizeStateForSync(),null,2));
    save(); updateHud();
    if(sel){ const f=findNode(sel.id); if(f) openDrawer(f); }
    setBrainBtn("✓ cérebro sincronizado "+hhmm());
    setTimeout(()=>setBrainBtn("🧠 Sincronizar"), 2600);
  }catch(e){
    setBrainBtn("🧠 Conectar cérebro");
    alert("Cérebro: falha ao sincronizar. "+(e.message||e));
  }
}

async function ensureBrain(){
  try{
    if(!("showDirectoryPicker" in window)){ setBrainBtn("🧠 (Chrome/Edge)"); return; }
    const h=await idbGet("brainDir");
    if(!h){ setBrainBtn("🧠 Conectar cérebro"); return; }
    brainDir=h;
    const st=await brainDir.queryPermission({mode:"readwrite"});
    if(st==="granted"){ setBrainBtn("🧠 Sincronizar"); syncBrain(); }
    else setBrainBtn("🧠 Reconectar cérebro");
  }catch(e){ setBrainBtn("🧠 Conectar cérebro"); }
}

