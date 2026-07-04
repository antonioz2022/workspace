/* ===== Fase 1: brain versionado no próprio repo (.workspace/brain.md) =====
   Cria/sincroniza um brain.md DENTRO do repositório + um README com instruções pra
   qualquer IA (Claude Code/Codex) alimentar esse arquivo. A brain viaja versionada
   com o código (git push/pull). Sync bidirecional: lado "dirty" ganha, senão o repo. */
const REPO_BRAIN_README="# Workspace brain — instruções para IAs\n\n"+
"Este repositório é acompanhado pelo painel Workspace do Antonio.\n\n"+
"## Regra\n"+
"Ao concluir um trabalho relevante aqui, ATUALIZE o arquivo .workspace/brain.md:\n"+
"- Curto e factual: estado vivo do projeto, decisões, próximo passo.\n"+
"- A seção '## Pendências' usa checklist Markdown (- [ ] aberta, - [x] feita).\n"+
"- Não invente; reflita o que mudou (confira o git log recente).\n\n"+
"O painel Workspace lê este arquivo e sincroniza. No git push, o estado viaja com o código.\n";

function genRepoBrain(p){
  const todos=(p.todos||[]).map(t=>`- [${t.done?"x":" "}] ${t.t}`).join("\n")||"_(sem pendências)_";
  return `${(p.context||("# "+p.name)).trim()}\n\n## Pendências\n${todos}\n`;
}
function parseRepoBrain(text){
  const i=text.search(/^##\s+Pend[êe]ncias\s*$/mi);
  if(i<0) return {context:text.trim(), todos:null};
  return {context:text.slice(0,i).trim(), todos:parseTodos(text.slice(i))};
}
async function syncRepoBrain(pid){
  const f=findNode(pid); if(!f||f.type!=="pj") return;
  const p=f.pj, btn=document.getElementById("repoBrainBtn"), setBtn=s=>{ if(btn) btn.innerHTML=s; };
  setBtn("⏳ sincronizando…");
  let dir; try{ dir=await getProjDir(pid,{prompt:true, write:true}); }
  catch(e){ alert("Repo: "+(e.message||e)); setBtn("🧩 Brain no repo"); return; }
  if(!dir){ setBtn("🧩 Brain no repo"); return; }
  try{
    const wsDir=await getDirPath(dir,[".workspace"],true);
    const existing=await readFileIf(wsDir,"brain.md");
    if(existing===null){
      await writeFile(wsDir,"brain.md", genRepoBrain(p));
      await writeFile(wsDir,"README.md", REPO_BRAIN_README);
      save(); scheduleSync(); setBtn("✓ criado em .workspace/ (commite)");
    }else if(p._memDirty || p._todoDirty){
      await writeFile(wsDir,"brain.md", genRepoBrain(p));
      p._memDirty=false; p._todoDirty=false; save(); scheduleSync(); setBtn("✓ gravado no repo");
    }else{
      const parsed=parseRepoBrain(existing);
      p.context=parsed.context; if(parsed.todos) p.todos=parsed.todos;
      save(); scheduleSync();
      if(sel && sel.id===pid) openDrawer(findNode(pid));  // re-render com o que veio do repo
      return;
    }
  }catch(e){ alert("Repo brain: "+(e.message||e)); setBtn("🧩 Brain no repo"); return; }
  setTimeout(()=>setBtn("🧩 Brain no repo"), 3000);
}

