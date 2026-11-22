import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const freeAhead=(x,y,d,r)=>{ for(let s=0;s<=r;s+=0.25) if(jac.poseBlocked(x+V[d][0]*s,y+V[d][1]*s,d)!==0) return false; return true; };
let runs=0,completed=0,gu=0,guFalse=0; const ex=[];
for (let y=1;y<T.MAP_HEIGHT-1;y++) for (let x=1;x<T.MAP_WIDTH-1;x++) for (const d of DIRS) for (const s of [-1,1]) {
  if (jac.poseBlocked(x,y,d)!==0) continue;
  // require 3 tiles clear ahead (the straight run-in) so we start moving
  if(!freeAhead(x,y,d,3)) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue; jac.setGear('D');
  let t=0; while(t<0.5){jac.update(dt,{dx:0,dy:-1});t+=dt;}
  const h0=jac.heading; let turned=false, guHit=false, guFalseHit=false, tt=0;
  while(tt<3){ jac.update(dt,{dx:s,dy:-1}); tt+=dt; let dh=jac.heading-h0; while(dh>2)dh-=4; while(dh<-2)dh+=4;
    if(jac.escapeGaveUp && !guHit){ guHit=true; const nd=DIRS[(DIRS.indexOf(jac.dir)+(s*1>0?1:3))%4]; // candidate next facing
      // ground truth: could a truck at this cell face either neighbour dir and roll 2 tiles?
      const cx=Math.round(jac.cx), cy=Math.round(jac.cy); const alt=DIRS.filter(q=>q!==jac.dir).some(q=>freeAhead(jac.cx,jac.cy,q,2)) ;
      const cur=freeAhead(jac.cx,jac.cy,jac.dir,2);
      if(freeAhead(jac.cx,jac.cy,nd,2.5)) { guFalseHit=true; if(ex.length<15) ex.push(`(${x},${y},${d}) s=${s} GU@(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) next ${nd} clear 2.5 tiles; t=${tt.toFixed(2)}`); }
      break; }
    if(Math.abs(dh)>=0.9){turned=true;break;} }
  runs++; if(turned) completed++; if(guHit) gu++; if(guFalseHit) guFalse++;
}
console.log(`dt=${dt} 90deg-turn runs=${runs} completed=${completed} stoppedGU=${gu} stoppedButNextFacingClear2.5=${guFalse}`); console.log(ex.join('\n'));
