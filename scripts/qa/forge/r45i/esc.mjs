// Headless escapability + stop-rate probe on the real JacT9 (sentinel bundle). Inputs = {dx,dy} like keys; setGear = gear button.
import { load } from '../../sentinel-r45h/common.mjs';
const dt = +(process.argv[2]||0.0166667);
const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const run=(sec,inp,gear)=>{ if(gear) jac.setGear(gear); let t=0,stopT=0,gu=0,x0=jac.cx,y0=jac.cy,maxNet=0,h0=jac.heading; while(t<sec){ jac.update(dt,inp); t+=dt; if(jac.escapeGaveUp) gu+=dt; maxNet=Math.max(maxNet,Math.hypot(jac.cx-x0,jac.cy-y0)); } return {net:Math.hypot(jac.cx-x0,jac.cy-y0),maxNet,gu,dh:Math.abs(jac.heading-h0)}; };
// A) porch/cactus: steer into prop 6s, then try escapes
const props={porch:[29.5,21],cactus:[26.5,18]};
for (const [pn,[qx,qy]] of Object.entries(props)) {
  let runs=0,stopped=0,trapped=0,escR=0,escSteerOnly=0,escD=0; const ex=[];
  for (let y=Math.round(qy-7);y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
    if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
    const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
    runs++; const a=run(6,{dx:s,dy:-1},'D'); const st=jac.escapeGaveUp || a.net<0.3; const pose=[jac.cx,jac.cy,jac.dir,jac.heading];
    if(!jac.escapeGaveUp) continue; stopped++;
    // escape 1: other steer / straight in D (no R)
    const snap=()=>{jac.qaSpawnDrive(pose[0],pose[1],pose[2]);}; 
    const e0=run(4,{dx:-s,dy:-1}); const okSteer=e0.maxNet>=1.5;
    // escape 2: R + steer each way, then D + gas
    let okR=false; for (const rs of [s,-s,0]) { snap(); run(0.1,{dx:0,dy:0}); const r=run(2.5,{dx:rs,dy:-1},'R'); const dd=run(3,{dx:0,dy:-1},'D'); if (r.maxNet>=1.0 && (dd.maxNet>=1.5)) { okR=true; break; } }
    if(okSteer) escSteerOnly++; if(okR) escR++; if(!okSteer&&!okR){ trapped++; if(ex.length<5) ex.push(`(${x},${y},${d}) s=${s} stop@(${pose[0].toFixed(2)},${pose[1].toFixed(2)},${pose[2]})`); }
  }
  console.log(`${pn}: runs=${runs} stoppedWithCue=${stopped} escapeOppSteerD=${escSteerOnly} escapeR+steer->D=${escR} TRAPPED=${trapped} ${ex.join(' ')}`);
}
// B) normal-play stop rate: every free pose on map, gas straight 1s then gas+steer 3s
let runs=0,stops=0,stopsOpen=0; const ex=[];
for (let y=1;y<T.MAP_HEIGHT-1;y+=2) for (let x=1;x<T.MAP_WIDTH-1;x+=2) for (const d of DIRS) for (const s of [-1,1]) {
  if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
  const a=run(1,{dx:0,dy:-1},'D'); if (a.net<1.5) continue; // only while actually moving
  runs++; const b=run(3,{dx:s,dy:-1}); if (b.gu>0.3) { stops++; if(ex.length<12) ex.push(`(${x},${y},${d}) s=${s} stop@(${jac.cx.toFixed(1)},${jac.cy.toFixed(1)},${jac.dir}) gu=${b.gu.toFixed(1)}s`); }
}
console.log(`normal turn-while-moving runs=${runs} giveUp-stops=${stops} (${(100*stops/runs).toFixed(1)}%)`); console.log(ex.join('\n'));
