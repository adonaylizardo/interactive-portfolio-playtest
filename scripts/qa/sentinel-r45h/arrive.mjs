import { load } from './common.mjs';
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const tgt = process.argv[2];
let path, goal;
if (tgt.includes(',')) { const [x,y]=tgt.split(',').map(Number); path=jac.findDrivePath(x,y); goal={x,y}; }
else { const b=T.getEnterableBuildings().find(b=>b.name===tgt); const s=jac.parkForDoor(b.door.x,b.door.y); if(!s){console.log(tgt,'NULL');process.exit(0);} path=s.path; goal={x:s.x,y:s.y}; }
if(!path){console.log('no path');process.exit(0);}
jac.setDrivePath(path, path[path.length-1]??goal, {loose:true});
const dt=+(process.argv[3]||1/60); let t=0,len=0,px=jac.cx,py=jac.cy,arr=null,ov=0;
while(t<60){ jac.update(dt,{dx:0,dy:0}); t+=dt; len+=Math.hypot(jac.cx-px,jac.cy-py); px=jac.cx; py=jac.cy; ov=Math.max(ov,jac.poseBlocked(jac.cx,jac.cy,jac.dir)); if(arr==null && Math.hypot(jac.cx-goal.x,jac.cy-goal.y)<0.5 && Math.abs(jac.vel)<0.1){arr=t;break;} if(!jac.drivePath.length && !jac.driveGoal) break; }
console.log(`${tgt} dt=${dt.toFixed(3)} nodes=${path.length} arrived=${arr!=null?arr.toFixed(1)+'s':'NO'} len=${len.toFixed(1)} end=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) maxOverlap=${ov}`);
