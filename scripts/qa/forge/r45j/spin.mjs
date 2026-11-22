import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||1/60); const { T, jac } = await load(process.env.BUNDLE);
let seed=1; const rnd=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const acts=[['D',0,-1],['D',-1,-1],['D',1,-1],['D',0,-1],['D',-1,-1],['D',1,-1],['R',0,-1],['R',-1,-1],['R',1,-1],[null,0,0],['D',0,1]];
let swaps=0,spins=0,spin01=0; const ex=[]; let offRest=0, restFrames=0, offMax=0;
const wrap=(d)=>{while(d>2)d-=4;while(d<-2)d+=4;return d;}; const DI={se:0,sw:1,nw:2,ne:3};
for (let k=1;k<=60;k++){ seed=k*7919; jac.qaSpawnDrive(20,6,'se'); jac.setGear('D'); let t=0, trav=0;
  while(t<120){ const a=acts[Math.floor(rnd()*acts.length)]; const sec=0.3+rnd()*1.5; if(a[0]&&a[0]!==jac.gear) jac.setGear(a[0]); let u=0;
    while(u<sec){ const px=jac.cx,py=jac.cy,pd=jac.dir; jac.update(dt,{dx:a[1],dy:a[2]}); u+=dt;t+=dt; trav+=Math.hypot(jac.cx-px,jac.cy-py);
      if(jac.dir!==pd){ swaps++; if(trav<0.3){spins++; if(trav<0.1){spin01++; if(ex.length<6) ex.push(`seed${k} (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) ${pd}->${jac.dir} trav=${trav.toFixed(3)} input=${a.join('/')}`);}} trav=0; }
      if(Math.abs(jac.vel)<0.05){ restFrames++; const o=Math.abs(wrap(jac.heading-DI[jac.dir])); offMax=Math.max(offMax,o); if(o>56/90) offRest++; } } } }
console.log(`dt=${dt} monkey60x120s swaps=${swaps} swapsWith<0.3tileTravel=${spins} <0.1=${spin01} ; rest frames heading>56deg off sprite: ${offRest}/${restFrames} (max ${(offMax*90).toFixed(0)}deg)`); console.log(ex.join('\n'));
