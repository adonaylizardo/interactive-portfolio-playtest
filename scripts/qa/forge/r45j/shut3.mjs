import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||1/60); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const props={porch:[29.5,21],cactus:[26.5,18],edge:[28,1]};
for (const [pn,[qx,qy]] of Object.entries(props)) { let runs=0,sh=0,worst=0,ex=null,revTot=0;
  for (let y=Math.max(1,Math.round(qy-7));y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
    if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
    const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || dist<0.5 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
    runs++; jac.setGear('D'); let t=0,H=[],prev=0,rev=0,box=0;
    while(t<12){ jac.update(dt,{dx:s,dy:-1}); t+=dt; const sg=jac.vel>0.3?1:jac.vel<-0.3?-1:0; if(sg&&prev&&sg!==prev) rev++; if(sg) prev=sg; H.push([t,jac.cx,jac.cy]); }
    // longest window with bbox<3 tiles
    let best=0; for(let i=0,k=0;i<H.length;i++){ let mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9; for(k=i;k<H.length;k++){ mnx=Math.min(mnx,H[k][1]);mxx=Math.max(mxx,H[k][1]);mny=Math.min(mny,H[k][2]);mxy=Math.max(mxy,H[k][2]); if(Math.max(mxx-mnx,mxy-mny)>=3) break; } best=Math.max(best,H[k-1][0]-H[i][0]); if(k>=H.length) break; }
    if (rev>=2 && best>=6){ sh++; revTot+=rev; if(best>worst){worst=best; ex=`(${x},${y},${d}) s=${s} rev=${rev} end=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`;} } }
  console.log(`dt=${dt} ${pn}: runs=${runs} shuttles(>=2 D vel reversals & >=6s in <3-tile box, 12s gas+steer)=${sh} worst ${worst.toFixed(1)}s ${ex??''}`); }
