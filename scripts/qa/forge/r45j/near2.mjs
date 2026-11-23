import { load } from '../../sentinel-r45h/common.mjs';
const dt=1/60; const { T, jac } = await load(process.env.BUNDLE);
for (const [x,y,lab] of [[39,27,'bain 1 tile'],[39,28,'bain 2 tiles'],[40,37,'volaris 1.4'],[39,38,'volaris 2']]) { jac.qaSpawnDrive(20,6,'se'); const p=jac.findDrivePath(x,y); jac.setDrivePath(p,{x,y},{loose:true}); let t=0,ov=0; while(t<60 && jac.drivePath.length>0){ jac.update(dt,{dx:0,dy:0}); t+=dt; ov=Math.max(ov,jac.poseBlocked(jac.cx,jac.cy,jac.dir)); } for(let k=0;k<120;k++) jac.update(dt,{dx:0,dy:0});
  console.log(`${lab}: target (${x},${y}) path ${p.length} -> end (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) t=${t.toFixed(1)}s dist=${Math.hypot(jac.cx-x,jac.cy-y).toFixed(2)} maxOverlap=${ov}`); }
