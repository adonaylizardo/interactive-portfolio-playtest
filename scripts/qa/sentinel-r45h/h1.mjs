import { load } from './common.mjs';
const dt = +(process.argv[2]||1/60);
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const DIRS=['se','sw','nw','ne'];
let runs=0, autoturn=0, ex=[], slides=[];
for (let y=3;y<60;y+=3) for (let x=3;x<60;x+=3) for (const d of DIRS) {
  if (jac.poseBlocked(x,y,d)!==0 || !jac.driveBoxWalkable(x,y)) continue;
  jac.qaSpawnDrive(x,y,d); if (jac.cx!==x||jac.cy!==y||jac.dir!==d) continue;
  runs++; let t=0, d0=jac.dir, px=jac.cx, py=jac.cy;
  while (t<4) { jac.update(dt,{dx:0,dy:-1}); t+=dt;
    const disp=Math.hypot(jac.cx-px,jac.cy-py);
    if (jac.dir!==d0) { autoturn++; if (ex.length<6) ex.push(`start(${x},${y},${d}) t=${t.toFixed(2)} ${d0}->${jac.dir} at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) frameDisp=${disp.toFixed(3)} vel=${jac.vel.toFixed(2)}`);
      // lateral component of that frame vs new sprite
      const v={se:[1,0],nw:[-1,0],sw:[0,1],ne:[0,-1]}[jac.dir]; const lat=Math.abs((jac.cx-px)*v[1]-(jac.cy-py)*v[0]); slides.push(lat); break; }
    px=jac.cx; py=jac.cy; }
}
slides.sort((a,b)=>b-a);
console.log(`dt=${dt} straight-gas runs=${runs} runs with a facing change and NO steer input=${autoturn}; max lateral disp in swap frame=${(slides[0]||0).toFixed(3)}`);
ex.forEach(e=>console.log(' ',e));
