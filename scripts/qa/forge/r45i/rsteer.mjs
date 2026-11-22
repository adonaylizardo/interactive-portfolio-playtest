import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
for (const s of [0,-1,1]) { jac.qaSpawnDrive(21,52,'se'); jac.setGear('R'); let t=0, gu=0; while(t<2){jac.update(dt,{dx:s,dy:-1});t+=dt; if(jac.escapeGaveUp)gu+=dt;} console.log(`open R steer ${s}: moved ${Math.hypot(jac.cx-21,jac.cy-52).toFixed(2)} heading ${jac.heading.toFixed(2)} dir ${jac.dir} GU ${gu.toFixed(2)}s`); }
