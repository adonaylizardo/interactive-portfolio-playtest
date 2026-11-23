import { load } from '../../sentinel-r45h/common.mjs';
const dt=1/60; const { T, jac } = await load(process.env.BUNDLE);
const [x,y,d,s]=process.argv.slice(2); jac.qaSpawnDrive(+x,+y,d); jac.setGear('D'); let t=0,k=0,line='';
while(t<12){ jac.update(dt,{dx:+s,dy:-1}); t+=dt; if(k++%15==0) line+=`${t.toFixed(2)}:(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir},h${jac.heading.toFixed(2)},v${jac.vel.toFixed(1)}) `; }
console.log(line);
