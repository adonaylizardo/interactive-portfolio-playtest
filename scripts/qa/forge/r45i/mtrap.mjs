import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
let seed=1; const rnd=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const acts=[['D',0,-1],['D',-1,-1],['D',1,-1],['D',0,-1],['D',-1,-1],['D',1,-1],['R',0,-1],['R',-1,-1],['R',1,-1],[null,0,0],['D',0,1]];
const go=(sec,inp,g)=>{ if(g) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
for (const [k,T0] of [[39,20],[1,100],[44,70],[58,50],[71,25],[4,90]]) { seed=k*7919; jac.qaSpawnDrive(20,6,'se'); jac.setGear('D'); let t=0; const log=[];
  while(t<T0){ const a=acts[Math.floor(rnd()*acts.length)]; const sec=0.3+rnd()*1.5; if(a[0] && a[0]!==jac.gear) jac.setGear(a[0]); let u=0; while(u<sec){ jac.update(dt,{dx:a[1],dy:a[2]}); u+=dt; t+=dt;} log.push(`${a[0]}${a[1]}/${a[2]}@${jac.cx.toFixed(1)},${jac.cy.toFixed(1)},${jac.dir}`); }
  const sp=[jac.cx,jac.cy]; const st=`(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir},h${jac.heading.toFixed(2)},${jac.gear},GU${jac.escapeGaveUp?1:0},blk${jac.poseBlocked(jac.cx,jac.cy,jac.dir)})`;
  let best=0, how=''; const seq=[[0.3,null,0,0],[3,'R',0,-1],[0.3,null,0,0],[3,'R',-1,-1],[0.3,null,0,0],[3,'R',1,-1],[0.3,null,0,0],[3,'D',0,-1],[0.3,null,0,0],[3,'D',-1,-1],[0.3,null,0,0],[3,'D',1,-1],[0.3,null,0,0],[2,'R',0,-1],[3,'D',1,-1],[0.3,null,0,0],[2,'R',0,-1],[3,'D',-1,-1]];
  for (const [sec,g,dx,dy] of seq){ go(sec,{dx,dy},g); const m=Math.hypot(jac.cx-sp[0],jac.cy-sp[1]); if(m>best){best=m;how=`${g}${dx}`;} }
  console.log(`seed${k} t=${T0} state ${st} last inputs: ${log.slice(-4).join(' ')} -> deliberate battery max disp ${best.toFixed(2)} via ${how} ${best<1.5?'TRAPPED':''}`); }
