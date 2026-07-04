/* ============ conexão com o projeto REAL (telemetria factual) ============ */
/* handle da pasta de cada projeto (só leitura), no mesmo IndexedDB do cérebro. */
const projDirCache={};   // p.id -> FileSystemDirectoryHandle (memória)
const teleCache={};      // p.id -> {git,specs,at}

async function getProjDir(pid, {prompt=false, write=false}={}){
  const mode=write?"readwrite":"read";
  try{
    let h = projDirCache[pid] || await idbGet("proj:"+pid);
    if(h){
      let st = await h.queryPermission({mode});
      if(st!=="granted" && prompt) st = await h.requestPermission({mode});
      if(st==="granted"){ projDirCache[pid]=h; return h; }
      if(!prompt) return null;
    }
    if(!prompt) return null;
    h = await window.showDirectoryPicker({mode});
    await idbSet("proj:"+pid, h); projDirCache[pid]=h; return h;
  }catch(e){ if(e && e.name==="AbortError") return null; throw e; }
}
async function forgetProjDir(pid){ projDirCache[pid]=null; delete teleCache[pid]; try{ await idbSet("proj:"+pid,null); }catch(e){} }

async function readProjectTelemetry(dir){
  const out={git:null, specs:null, source:"local"};
  try{                                             // git: branch + último commit
    const gitDir=await dir.getDirectoryHandle(".git");
    const head=await readFileIf(gitDir,"HEAD");
    let branch=null;
    if(head){ const m=head.match(/ref:\s*refs\/heads\/(.+)\s*$/m); branch=m?m[1].trim():"detached"; }
    let logs=null;
    try{ const logsDir=await getDirPath(gitDir,["logs"]); logs=await readFileIf(logsDir,"HEAD"); }catch(e){}
    if(logs){
      const lines=logs.split("\n").filter(l=>l.trim());
      const last=lines[lines.length-1]||"";
      const tab=last.indexOf("\t");
      const meta=tab>=0?last.slice(0,tab):last, rest=tab>=0?last.slice(tab+1):"";
      const tsm=meta.match(/ (\d+) [+-]\d{4}\s*$/), parts=meta.split(" ");
      out.git={ branch, commits:lines.length, hash:(parts[1]||"").slice(0,7),
                ts: tsm?parseInt(tsm[1],10)*1000:null,
                msg: rest.replace(/^[^:]*:\s*/,"").trim() || "(sem mensagem)" };
    }else if(branch){ out.git={branch, commits:0, hash:"", ts:null, msg:"(sem commits)"}; }
  }catch(e){}
  try{                                             // specs/: quantas features
    const specsDir=await dir.getDirectoryHandle("specs");
    let count=0, last="";
    for await (const [name,h] of specsDir.entries()){
      if(h.kind==="directory" && /^\d{3}-/.test(name)){ count++; if(name>last) last=name; }
    }
    if(count) out.specs={count, last};
  }catch(e){}
  return out;
}
async function refreshProjectTelemetry(p, opts={}){
  const dir=await getProjDir(p.id, opts); if(!dir) return null;
  const t=await readProjectTelemetry(dir); t.at=Date.now(); teleCache[p.id]=t; return t;
}

