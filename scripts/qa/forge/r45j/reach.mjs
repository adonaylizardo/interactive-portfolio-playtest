import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
const go=(sec,inp,g)=>{ if(g) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
jac.qaSpawnDrive(20,6,'se'); const p=jac.findDrivePath(25,24); console.log('path spawn->(25,24):', p? p.length+' nodes, last '+JSON.stringify(p.slice(-3)) : null);
for (const d of ['se','sw','nw','ne']) console.log('pose (25,24)',d,'blocked',jac.poseBlocked(25,24,d), ' (25,23)',jac.poseBlocked(25,23,d),' (25,25)',jac.poseBlocked(25,25,d),' (24,24)',jac.poseBlocked(24,24,d),' (26,24)',jac.poseBlocked(26,24,d));
// tap-park finoa from spawn, follow, then try to drive away
for (const name of ['finoa','pg','mentoria','estudio']) { jac.qaSpawnDrive(20,6,'se'); const b=T.getEnterableBuildings().find(e=>e.id===name||e.name===name||(e.panelTitle||'').toLowerCase().includes(name)); 
  const door=b?.door; if(!door){console.log(name,'no door', T.getEnterableBuildings().map(e=>e.id).join(','));continue;}
  const sit=jac.parkForDoor(door.x,door.y); if(!sit){console.log(name,'no sit');continue;} if(sit.path?.length) jac.followPath?.(sit.path);
  let t=0; while(t<40 && (jac.drivePath?.length||0)>0){ jac.update(dt,{dx:0,dy:0}); t+=dt; } const at=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir];
  // drive away: player tries D straight, D steer each way, R
  const sp=[jac.cx,jac.cy]; let best=0; for (const [sec,g,dx,dy] of [[2,'D',0,-1],[2,'D',-1,-1],[2,'D',1,-1],[2,'R',0,-1],[2,'D',1,-1],[2,'R',1,-1],[2,'D',-1,-1]]) { go(sec,{dx,dy},g); best=Math.max(best,Math.hypot(jac.cx-sp[0],jac.cy-sp[1])); }
  console.log(name,'door',JSON.stringify(door),'sit',JSON.stringify({x:sit.x,y:sit.y,dir:sit.dir}),'arrived',at,'t',t.toFixed(1),'drive-away max',best.toFixed(2)); }
