import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
const go=(sec,inp,g)=>{ if(g) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
for (const y of [19,20,21,22]) for (const d of ['sw','ne']) console.log(`(25,${y},${d}) blk`, jac.poseBlocked(25,y,d));
for (const [x0,y0,d] of [[25,21,'sw'],[25,22,'sw'],[25,20,'sw']]) for (const s of [0,-1,1]) {
  if (jac.poseBlocked(x0,y0,d)) continue; jac.qaSpawnDrive(x0,y0,d); jac.setGear('D'); go(3,{dx:0,dy:-1}); const a=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir];
  go(4,{dx:s,dy:-1}); const b=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2)];
  // get out: R straight 3s, then R+steer, then D
  const sp=[jac.cx,jac.cy]; let best=0, fin; for (const [sec,g,dx,dy] of [[3,'R',0,-1],[3,'R',1,-1],[3,'R',-1,-1],[3,'D',1,-1],[3,'D',-1,-1]]) { go(sec,{dx,dy},g); best=Math.max(best,Math.hypot(jac.cx-sp[0],jac.cy-sp[1])); }
  console.log(`from (${x0},${y0},${d}) straight3s->${a} steer${s} 4s->${b} ; get-out max ${best.toFixed(2)} end (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) ${best<1.5?'TRAPPED':''}`); }
