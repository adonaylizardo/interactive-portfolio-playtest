// random real-input-like play from spawn; finds poses where a frustrated player cannot get out
import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const SEEDS=+(process.argv[3]||150); const { T, jac } = await load(process.env.BUNDLE);
let seed=1; const rnd=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const acts=[['D',0,-1],['D',-1,-1],['D',1,-1],['D',0,-1],['D',-1,-1],['D',1,-1],['R',0,-1],['R',-1,-1],['R',1,-1],[null,0,0],['D',0,1]];
const go=(sec,inp,g)=>{ if(g && g!==jac.gear) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
let traps=0, guTime=0, total=0, snaps=0, frames=0; const ex=[];
for (let k=1;k<=SEEDS;k++){ seed=k*7919; jac.qaSpawnDrive(20,6,'se'); jac.setGear('D'); let t=0; const H=[];
  while(t<120){ const a=acts[Math.floor(rnd()*acts.length)]; const sec=0.3+rnd()*1.5; if(a[0] && a[0]!==jac.gear) jac.setGear(a[0]); let u=0;
    while(u<sec){ const ph=jac.heading, pd=jac.dir; jac.update(dt,{dx:a[1],dy:a[2]}); u+=dt; t+=dt; frames++; if(jac.escapeGaveUp) guTime+=dt; let fh=jac.heading-ph; while(fh>2)fh-=4; while(fh<-2)fh+=4; if(pd!==jac.dir && Math.abs(fh)>0.6) snaps++; }
    H.push([t,jac.cx,jac.cy]); }
  total+=t;
  // stuck: any 30s window where bbox < 1.5 tiles despite random inputs (incl. R) => trap candidate
  for (let i=0;i<H.length;i++){ let j=i, mnx=1e9,mxx=-1e9,mny=1e9,mxy=-1e9; while(j<H.length && H[j][0]-H[i][0]<30){ mnx=Math.min(mnx,H[j][1]);mxx=Math.max(mxx,H[j][1]);mny=Math.min(mny,H[j][2]);mxy=Math.max(mxy,H[j][2]); j++; }
    if(j<H.length && Math.max(mxx-mnx,mxy-mny)<1.5){ traps++; if(ex.length<8) ex.push(`seed${k} t=${H[i][0].toFixed(0)} box at (${mnx.toFixed(2)}-${mxx.toFixed(2)},${mny.toFixed(2)}-${mxy.toFixed(2)})`); break; } }
}
console.log(`dt=${dt} seeds=${SEEDS} x120s: seeds with a 30s trap (random inputs incl R) = ${traps}; escapeGaveUp share of play time = ${(100*guTime/total).toFixed(1)}%; 1-frame sprite turns >0.6q = ${snaps} (${(snaps/(total/60)).toFixed(2)}/min)`); console.log(ex.join('\n'));
