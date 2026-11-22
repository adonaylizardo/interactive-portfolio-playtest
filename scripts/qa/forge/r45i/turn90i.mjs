import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne']; const V={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]};
const freeAhead=(x,y,d,r)=>{ for(let s=0;s<=r;s+=0.25) if(jac.poseBlocked(x+V[d][0]*s,y+V[d][1]*s,d)!==0) return false; return true; };
let runs=0,completed=0,gu=0,snapStop=0,hardStop=0,openStop=0; const ex=[];
for (let y=10;y<50;y++) for (let x=10;x<50;x++) for (const d of DIRS) for (const s of [-1,1]) {
  if (jac.poseBlocked(x,y,d)!==0||!freeAhead(x,y,d,3.5)) continue; jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y) continue; jac.setGear('D');
  let t=0; while(t<0.5){jac.update(dt,{dx:0,dy:-1});t+=dt;}
  const h0=jac.heading; let tt=0, res='none';
  while(tt<3){ const pd=jac.dir, pv=jac.vel, ph=jac.heading; jac.update(dt,{dx:s,dy:-1}); tt+=dt; let dh=jac.heading-h0; while(dh>2)dh-=4; while(dh<-2)dh+=4;
    if(jac.escapeGaveUp){ gu++; let fh=jac.heading-ph; while(fh>2)fh-=4; while(fh<-2)fh+=4;
      const snap = pd!==jac.dir && Math.abs(fh)>0.4; if(snap) snapStop++; if(Math.abs(pv)>3) hardStop++;
      // "open": the turned facing (sign of steer relative to motion) has 2.5 tiles clear from the pre-turn spot
      const turnTo = DIRS[(DIRS.indexOf(d)+(s>0?1:3))%4]; const open=freeAhead(jac.cx,jac.cy,turnTo,2.5)&&freeAhead(jac.cx,jac.cy,d,0.0);
      if(open) openStop++;
      if(ex.length<400) ex.push({x,y,d,s,at:[+jac.cx.toFixed(2),+jac.cy.toFixed(2),jac.dir],tt:+tt.toFixed(2),vBefore:+pv.toFixed(2),frameDh:+fh.toFixed(2),snap,open});
      res='gu'; break; }
    if(Math.abs(dh)>=0.9){res='ok';break;} }
  runs++; if(res==='ok') completed++;
}
console.log(`dt=${dt} 90deg-turn runs=${runs} completed=${completed} GU=${gu} (1-frame snap>0.4q at GU onset: ${snapStop}; stop from >3 t/s: ${hardStop}; turn-to facing clear 2.5t: ${openStop})`);
const interior=ex.filter(e=>e.x>8&&e.x<52&&e.y>8&&e.y<52); console.log('interior examples', interior.length); for (const e of interior.filter((_,i)=>i%Math.max(1,Math.floor(interior.length/12))==0).slice(0,12)) console.log(JSON.stringify(e));
