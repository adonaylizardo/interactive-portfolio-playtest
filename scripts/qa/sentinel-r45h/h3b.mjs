// Sentinel r45h HIGH-3 shuttle check (porch + cactus, gas+steer 12 s from poses whose nose points at the prop).
// r45k (Forge, per Sentinel's plan review): the r45j agent's axis edit is reverted to Sentinel's original
// pre-frame measurement (now printed as information). Kept from r45j: dead stops ≥0.5 s fail. Speed honesty is
// judged as the HUD mph vs the frame's REAL displacement (±1 mph). Same logic as run-all.mjs check `h3b`.
import { load } from './common.mjs';
import { blocked } from '../forge/oracle.mjs';
const dt = +(process.argv[2]||0.0166667);
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const TOP=4.5*1.15; const expMph=(disp)=>disp<0.01?0:Math.max(1,Math.min(10,Math.round(Math.min(1,disp/dt/TOP)*10)));
const unwrap=(a,b)=>{let d=b-a; while(d>2)d-=4; while(d<-2)d+=4; return d;};
const props={porch:[29.5,21],cactus:[26.5,18]};
for (const [pn,[qx,qy]] of Object.entries(props)) {
 let runs=0,sh=0,worst=0,ex=null, velBad=0, frames=0, velMax=0, hudBad=0, dead=0, deadEx=null;
 for (let y=Math.round(qy-7);y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
  if (blocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
  // only poses whose nose points roughly at the prop
  const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
  runs++; let t=0,H=[],hc=0,ph=jac.heading,best=0,still=0,deadThis=0;
  while(t<12){ const px=jac.cx,py=jac.cy; const vv=V[jac.dir]; jac.update(dt,{dx:s,dy:-1}); t+=dt; frames++;
    const along=((jac.cx-px)*vv[0]+(jac.cy-py)*vv[1])/dt; const err=Math.abs(jac.vel-along); velMax=Math.max(velMax,err); if(err>0.5) velBad++;
    const disp=Math.hypot(jac.cx-px,jac.cy-py); if (Math.abs((jac.mph??0)-expMph(disp))>1) hudBad++;
    if (disp < 0.08*dt && Math.abs(jac.vel) < 0.2) still += dt; else still = 0; if (still >= 0.5) deadThis = still;
    hc+=unwrap(ph,jac.heading); ph=jac.heading; H.push([t,jac.cx,jac.cy,hc]);
    let j=H.length-1; while(j>0&&t-H[j][0]<3) j--; if(t-H[j][0]<3) continue;
    let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,pl=0; for(let k=j;k<H.length;k++){mnx=Math.min(mnx,H[k][1]);mxx=Math.max(mxx,H[k][1]);mny=Math.min(mny,H[k][2]);mxy=Math.max(mxy,H[k][2]); if(k>j)pl+=Math.hypot(H[k][1]-H[k-1][1],H[k][2]-H[k-1][2]);}
    if (Math.max(mxx-mnx,mxy-mny)<1.5 && Math.abs(hc-H[j][3])<0.33 && pl>0.5) best+=dt; }
  if (best>0){ sh++; if(best>worst){worst=best; ex=`start(${x},${y},${d}) steer=${s} end=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`;} }
  if (deadThis >= 0.5){ dead++; if(!deadEx) deadEx=`start(${x},${y},${d}) steer=${s} stopped ${deadThis.toFixed(1)}s end=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`; }
 }
 console.log(`${pn}: runs=${runs} runs-with-shuttle=${sh} worst shuttle time=${worst.toFixed(1)}s ${ex??''} | dead-stops=${dead} ${deadEx??''} | HUD mph off real displacement: ${hudBad}/${frames} | info pre-frame vel err>0.5 t/s: ${velBad}/${frames} (max ${velMax.toFixed(2)})`);
 if (sh > 0 || dead > 0 || hudBad > 0) process.exitCode = 1;
}
