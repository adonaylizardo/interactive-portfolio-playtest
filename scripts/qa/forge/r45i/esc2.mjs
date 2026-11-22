import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const go=(sec,inp)=>{let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
const props={porch:[29.5,21],cactus:[26.5,18]};
for (const [pn,[qx,qy]] of Object.entries(props)) { let stopped=0, trapped=0, simple=0; const ex=[];
  for (let y=Math.round(qy-7);y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
    if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
    const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
    jac.setGear('D'); go(6,{dx:s,dy:-1}); if(!jac.escapeGaveUp) continue; stopped++;
    const sp=[jac.cx,jac.cy,jac.dir]; let freed=null;
    // natural player sequence first: release, tap R, hold W (reverse) with steer, tap D, gas with steer away/straight
    outer: for (const rt of [1,2,3]) for (const rs of [0,-s,s]) for (const ds of [0,-s,s]) {
      jac.qaSpawnDrive(sp[0],sp[1],sp[2]); jac.setGear('D'); go(6,{dx:s,dy:-1}); // re-create exact stuck state incl. drifted heading
      go(0.2,{dx:0,dy:0}); jac.setGear('R'); go(rt,{dx:rs,dy:-1}); go(0.2,{dx:0,dy:0}); jac.setGear('D');
      let mx=0; let t=0; while(t<4){jac.update(dt,{dx:ds,dy:-1}); t+=dt; mx=Math.max(mx,Math.hypot(jac.cx-sp[0],jac.cy-sp[1]));}
      if(mx>=2.5 && !jac.escapeGaveUp){ freed=`R${rt}s steer${rs} then D steer${ds}`; break outer; } }
    if(!freed){trapped++; if(ex.length<6) ex.push(`(${x},${y},${d}) s=${s} stop@(${sp[0].toFixed(2)},${sp[1].toFixed(2)},${sp[2]})`);} else if(freed.startsWith('R1s steer0 then D steer0')||freed.startsWith('R1s')) simple++;
  }
  console.log(`${pn}: stopped=${stopped} freedWithin27combos=${stopped-trapped} (R 1s works: ${simple}) TRAPPED=${trapped} ${ex.join(' ')}`); }
