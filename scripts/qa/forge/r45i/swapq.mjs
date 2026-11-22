import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
// open-area forward circle & reverse circle: stats per sprite swap
for (const [g,s] of [['D',1],['D',-1],['R',1],['R',-1]]) { jac.qaSpawnDrive(21,52,'se'); jac.setGear(g); let t=0; let sw=[]; let pv=0;
  while(t<6){ const pd=jac.dir, ph=jac.heading, vv=jac.vel, px=jac.cx, py=jac.cy; jac.update(dt,{dx:s,dy:-1}); t+=dt; if(pd!==jac.dir){ let fh=jac.heading-ph; while(fh>2)fh-=4; while(fh<-2)fh+=4; sw.push([+fh.toFixed(2), +vv.toFixed(1), +jac.vel.toFixed(1), +Math.hypot(jac.cx-px,jac.cy-py).toFixed(2)]);} }
  const hj=sw.map(x=>Math.abs(x[0])); console.log(`${g} steer${s} dt=${dt}: swaps=${sw.length} heading jump at swap max ${Math.max(...hj).toFixed(2)}q (${(Math.max(...hj)*90).toFixed(0)}deg), speed before->after e.g. ${sw.slice(0,3).map(x=>x[1]+'->'+x[2]).join(', ')}`); }
