import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const go=(sec,inp,g)=>{ if(g) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
const DIRS=['se','sw','nw','ne'];
// natural approach: drive straight from a free start toward a target for up to 5s, then steer into prop 6s, then full escape battery
const cases=[]; for (const [sx,sy,d] of [[20,17,'se'],[21,17,'se'],[22,17,'se'],[30,16,'nw'],[33,16,'nw'],[34,16,'nw'],[28,14,'sw'],[28,15,'sw'],[30,14,'sw'],[28,25,'ne'],[28,26,'ne']]) for (const s of [-1,1]) cases.push([sx,sy,d,s]);
for (const [sx,sy,d,s] of cases) { if (jac.poseBlocked(sx,sy,d)!==0) { console.log('blocked start',sx,sy,d); continue; }
  jac.qaSpawnDrive(sx,sy,d); go(5,{dx:0,dy:-1},'D'); const pin=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir];
  go(6,{dx:s,dy:-1}); const gu=jac.escapeGaveUp; const sp=[jac.cx,jac.cy];
  let best=0, how=''; const snapState=()=>{}; // battery applied sequentially like a frustrated player
  const seq=[[0.3,null,0,0],[2,'R',0,-1],[2,'R',-s,-1],[2,'R',s,-1],[0.3,null,0,0],[3,'D',-s,-1],[3,'D',0,-1],[3,'D',s,-1],[0.3,null,0,0],[3,'R',0,-1],[0.3,null,0,0],[3,'D',-s,-1]];
  for (const [sec,g,dx,dy] of seq){ go(sec,{dx,dy},g); const m=Math.hypot(jac.cx-sp[0],jac.cy-sp[1]); if(m>best){best=m; how=`${g}${dx}`;} }
  console.log(`start(${sx},${sy},${d}) s=${s} pinnedAt ${pin} -> steer6s ${gu?'GU stop':'no-GU'} at (${sp[0].toFixed(2)},${sp[1].toFixed(2)}) ; frustrated-player battery max displacement=${best.toFixed(2)} ${best<1.5?'TRAPPED':''}`); }
