/* ================= layout ================= */
function ensurePositions(){
  DB.companies.forEach((c,ci)=>{
    if(c.x==null){ c.x = ci*760 - (DB.companies.length-1)*380; c.y = (ci%2)*140 - 40; }
    const pn = c.projects.length;
    c.projects.forEach((p,pi)=>{
      if(p.x==null){
        const spread = Math.min(Math.PI*0.9, Math.max(1, pn)*0.75);
        const a = Math.PI/2 - spread/2 + (pi+0.5)*(spread/Math.max(pn,1));
        p.x = c.x + Math.cos(a)*300;
        p.y = c.y + Math.sin(a)*300;
      }
      const an = p.apps.length;
      const base = Math.atan2(p.y-c.y, p.x-c.x);
      p.apps.forEach((ap,ai)=>{
        if(ap.x==null){
          const spread = Math.min(Math.PI*1.7, Math.max(an,1)*0.72);
          const a = base - spread/2 + (ai+0.5)*(spread/Math.max(an,1));
          const dist = 250 + (ai%2)*80;
          ap.x = p.x + Math.cos(a)*dist;
          ap.y = p.y + Math.sin(a)*dist;
        }
      });
    });
  });
}

