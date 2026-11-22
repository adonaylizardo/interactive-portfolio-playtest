// GU-independent behaviour metrics on the real JacT9 (works on any build)
import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const wrap=(d)=>{while(d>2)d-=4;while(d<-2)d+=4;return d;};
const freeAhead=(x,y,d,r)=>{ for(let s=0;s<=r;s+=0.25) if(jac.poseBlocked(x+V[d][0]*s,y+V[d][1]*s,d)!==0) return false; return true; };
// per-frame monitor
const M={frames:0,maxLat:0,latEx:null,maxDh:0,dhEx:null,backInD:0,backEx:null,offSpriteMax:0};
const step=(inp,tag)=>{ const px=jac.cx,py=jac.cy,ph=jac.heading,pd=jac.dir; jac.update(dt,inp); M.frames++;
  const dx=jac.cx-px,dy=jac.cy-py; const v=V[pd]; const along=dx*v[0]+dy*v[1]; const lat=Math.abs(dx*v[1]-dy*v[0]);
  // lateral wrt both old and new sprite axis (a swap frame may legitimately move along the new axis)
  const v2=V[jac.dir]; const lat2=Math.abs(dx*v2[1]-dy*v2[0]); const L=Math.min(lat,lat2);
  if(L>M.maxLat){M.maxLat=L;M.latEx=`${tag} (${px.toFixed(2)},${py.toFixed(2)},${pd})->(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`;}
  const dh=Math.abs(wrap(jac.heading-ph)); if(dh>M.maxDh){M.maxDh=dh;M.dhEx=`${tag} at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) ${pd}->${jac.dir} steer=${inp.dx}`;}
  const off=Math.abs(wrap(jac.heading-DIRS.indexOf(jac.dir))); if(off>M.offSpriteMax) M.offSpriteMax=off;
  if(jac.gear==='D' && inp.dy<0){ const a2=dx*V[jac.dir][0]+dy*V[jac.dir][1]; if(a2<-1e-4){ M.backInD+= -a2; if(!M.backEx) M.backEx=`${tag} (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`; } }
};
// 1) turn at speed, GU-independent
let runs=0,done=0,stopped=0; const stopEx=[];
for (let y=1;y<T.MAP_HEIGHT-1;y++) for (let x=1;x<T.MAP_WIDTH-1;x++) for (const d of DIRS) for (const s of [-1,1]) {
  if (jac.poseBlocked(x,y,d)!==0||!freeAhead(x,y,d,3.5)) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue; jac.setGear('D');
  let t=0; while(t<0.5){step({dx:0,dy:-1},'run');t+=dt;}
  const h0=jac.heading; let tt=0,H=[],res='slide';
  while(tt<3){ step({dx:s,dy:-1},`turn(${x},${y},${d},${s})`); tt+=dt; H.push([tt,jac.cx,jac.cy]); let dh=wrap(jac.heading-h0); if(Math.abs(dh)>=0.9){res='ok';break;}
    let j=H.length-1; while(j>0&&tt-H[j][0]<0.5) j--; if(tt-H[j][0]>=0.5 && Math.hypot(jac.cx-H[j][1],jac.cy-H[j][2])<0.1){res='stop';break;} }
  runs++; if(res==='ok')done++; if(res==='stop'){stopped++; if(stopEx.length<6) stopEx.push(`(${x},${y},${d}) s=${s} stop@(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) t=${tt.toFixed(2)}`);} }
console.log(`dt=${dt} TURN runs=${runs} completed=${done} stopped(0.5s<0.1t)=${stopped} slide/other=${runs-done-stopped}`); console.log('  stop ex:',stopEx.join(' | '));
// 2) steer into porch/cactus then escape by steering only (D, opposite steer), then by R straight
const props={porch:[29.5,21],cactus:[26.5,18]};
for (const [pn,[qx,qy]] of Object.entries(props)) { let r=0,stuck=0,escSteer=0,escR=0,trapped=0,maxOff=0,back=0; const ex=[];
  for (let y=Math.round(qy-7);y<=qy+7;y++) for (let x=Math.round(qx-7);x<=qx+7;x++) for (const d of DIRS) for (const s of [-1,1]) {
    if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue;
    const v=V[d]; const to=[qx-x,qy-y]; const dist=Math.hypot(...to); if (dist>7 || (to[0]*v[0]+to[1]*v[1])/dist<0.5) continue;
    r++; jac.setGear('D'); const b0=M.backInD; let H=[],t=0,mo=0; while(t<6){ step({dx:s,dy:-1},`${pn}-into(${x},${y},${d},${s})`); t+=dt; H.push([jac.cx,jac.cy]); mo=Math.max(mo,Math.abs(wrap(jac.heading-DIRS.indexOf(jac.dir)))); }
    back+=M.backInD-b0; maxOff=Math.max(maxOff,mo);
    const k=Math.max(0,H.length-Math.round(3/dt)); const net3=Math.hypot(jac.cx-H[k][0],jac.cy-H[k][1]); if(net3>=0.5) continue; stuck++;
    const sp=[jac.cx,jac.cy]; const snap=JSON.stringify([jac.cx,jac.cy,jac.dir]);
    let m=0; t=0; while(t<4){ step({dx:-s,dy:-1},'escSteer'); t+=dt; m=Math.max(m,Math.hypot(jac.cx-sp[0],jac.cy-sp[1])); } const okS=m>=1.5;
    // continue (state as left) with R straight 2s then D opposite steer
    jac.setGear('R'); t=0; while(t<2){step({dx:0,dy:-1},'escR');t+=dt;} jac.setGear('D'); t=0; while(t<3){step({dx:-s,dy:-1},'escRD');t+=dt; m=Math.max(m,Math.hypot(jac.cx-sp[0],jac.cy-sp[1]));}
    if(okS) escSteer++; else if(m>=1.5) escR++; else {trapped++; if(ex.length<5) ex.push(`(${x},${y},${d}) s=${s} stuck@${snap}`);} }
  console.log(`${pn}: runs=${r} stuck(last3s<0.5t)=${stuck} freedBySteerOnly=${escSteer} neededR=${escR} TRAPPED=${trapped} maxHeadingOffSprite=${(maxOff*90).toFixed(0)}deg autoBackInD(total tiles)=${back.toFixed(1)} ${ex.join(' ')}`); }
console.log(`MONITOR frames=${M.frames} maxLateralFrameHop=${M.maxLat.toFixed(3)} [${M.latEx}] maxHeadingJump=${(M.maxDh*90).toFixed(0)}deg [${M.dhEx}] maxOffSprite=${(M.offSpriteMax*90).toFixed(0)}deg backInD=${M.backInD.toFixed(1)} first:${M.backEx}`);
