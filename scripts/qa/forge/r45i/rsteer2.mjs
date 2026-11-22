import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
for (const s of [-1,1]) { jac.qaSpawnDrive(21,52,'se'); jac.setGear('R'); let t=0,k=0; let line=`s=${s}: `; while(t<2){const pd=jac.dir; jac.update(dt,{dx:s,dy:-1});t+=dt; if(k++%6==0||pd!==jac.dir) line+=`${t.toFixed(2)}:${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir},h${jac.heading.toFixed(2)},v${jac.vel.toFixed(1)}${pd!==jac.dir?'*':''} `;} console.log(line); }
