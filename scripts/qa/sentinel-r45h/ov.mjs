import { load } from './common.mjs';
const dt = +(process.argv[2]||0.1);
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const DIRS=['se','sw','nw','ne']; let n=0;
for (let y=2;y<62;y+=4) for (let x=2;x<62;x+=4) for (const d of DIRS) for (const s of [-1,0,1]) {
  if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y||jac.dir!==d) continue;
  let t=0; while(t<10){ const px=jac.cx,py=jac.cy,pd=jac.dir; jac.update(dt,{dx:s,dy:-1}); t+=dt; const b=jac.poseBlocked(jac.cx,jac.cy,jac.dir); if(b>0){ n++; if(n<=5) console.log(`overlap=${b} start(${x},${y},${d}) steer=${s} t=${t.toFixed(1)} (${px.toFixed(2)},${py.toFixed(2)},${pd}) -> (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) escapeKept=${jac.escapeKept} latch=${!!jac.escapeLatch}`); break; } }
}
console.log('runs ending a frame overlapped:', n);
