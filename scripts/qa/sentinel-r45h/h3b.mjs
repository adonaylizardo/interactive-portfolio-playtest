import { load } from './common.mjs';
const dt = +(process.argv[2]||0.0166667);
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const unwrap=(a,b)=>{let d=b-a; while(d>2)d-=4; while(d<-2)d+=4; return d;};
const props={porch:[29.5,21],cactus:[26.5,18]};
for (const [pn,[qx,qy]] of Object.entries(props)) {
 let runs=0,sh=0,worst=0,ex=null, velBad=0, frames=0, velMax=0;
 for (let y=Math.round(qy-7);y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
  if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
  // only poses whose nose points roughly at the prop
  const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
  runs++; let t=0,H=[],hc=0,ph=jac.heading,best=0;
  while(t<12){ const px=jac.cx,py=jac.cy; const vv=V[jac.dir]; jac.update(dt,{dx:s,dy:-1}); t+=dt; frames++;
    const along=((jac.cx-px)*vv[0]+(jac.cy-py)*vv[1])/dt; const err=Math.abs(jac.vel-along); velMax=Math.max(velMax,err); if(err>0.5) velBad++;
    hc+=unwrap(ph,jac.heading); ph=jac.heading; H.push([t,jac.cx,jac.cy,hc]);
    let j=H.length-1; while(j>0&&t-H[j][0]<3) j--; if(t-H[j][0]<3) continue;
    let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9,pl=0; for(let k=j;k<H.length;k++){mnx=Math.min(mnx,H[k][1]);mxx=Math.max(mxx,H[k][1]);mny=Math.min(mny,H[k][2]);mxy=Math.max(mxy,H[k][2]); if(k>j)pl+=Math.hypot(H[k][1]-H[k-1][1],H[k][2]-H[k-1][2]);}
    if (Math.max(mxx-mnx,mxy-mny)<1.5 && Math.abs(hc-H[j][3])<0.33 && pl>0.5) best+=dt; }
  if (best>0){ sh++; if(best>worst){worst=best; ex=`start(${x},${y},${d}) steer=${s} end=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`;} }
 }
 console.log(`${pn}: runs=${runs} runs-with-shuttle=${sh} worst shuttle time=${worst.toFixed(1)}s ${ex??''} | vel-vs-displacement frames err>0.5 t/s: ${velBad}/${frames} (max err ${velMax.toFixed(2)})`);
}
