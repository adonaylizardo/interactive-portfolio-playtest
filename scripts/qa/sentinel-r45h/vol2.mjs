import { load } from './common.mjs';
const { T, jac } = await load();
const b = T.getEnterableBuildings().find(b => b.name === 'volaris');
const sit = jac.parkForDoor(b.door.x, b.door.y);
const path = sit.path;
console.log('path tail', JSON.stringify(path.slice(-25)));
jac.setDrivePath(path, path[path.length-1], { loose: true });
let t=0; const dt=1/60; let hist=[];
while (t<16 && (jac.drivePath.length||jac.driveGoal)) { jac.update(dt,{dx:0,dy:0}); t+=dt; hist.push([t.toFixed(2),jac.cx.toFixed(3),jac.cy.toFixed(3),jac.dir,jac.vel.toFixed(2),JSON.stringify(jac.drivePath[0]),jac.followDir,jac.turnCrawl]); }
for (const h of hist.filter((_,i)=>i%10==0).slice(-60,-40)) console.log(h.join(' '));
const x=jac.cx,y=jac.cy;
for (const [px,py] of [[x,y],[x,y+0.1],[56,y],[56,y+0.1],[56,42]]) console.log('poseBlocked sw',px.toFixed(2),py.toFixed(2),jac.poseBlocked(px,py,'sw'), 'cells', JSON.stringify(jac.footprintCellsAt(px,py,'sw').filter(([a,c])=>!jac.driveCellOpen(a,c))));
console.log('upcomingTurn', JSON.stringify(jac.upcomingTurn?.()), 'travelSinceDir', jac.travelSinceDir.toFixed(2), 'goalBest',jac.goalBest.toFixed(2));
