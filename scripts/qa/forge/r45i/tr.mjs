import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
const [x,y,d,s,pre]=process.argv.slice(2); jac.qaSpawnDrive(+x,+y,d); jac.setGear('D'); let t=0,k=0;
const pr=(tag)=>console.log(tag,t.toFixed(2),jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2),jac.vel.toFixed(2),jac.escapeGaveUp?'GU':'-',jac.slowSteerT.toFixed(2),'swapBlk',jac.swapBlocked?1:0,'lock',jac.dirLock?.toFixed?.(2));
while(t<(+pre||0.5)){jac.update(dt,{dx:0,dy:-1});t+=dt; if(k++%6==0)pr('S');}
while(t<4){jac.update(dt,{dx:+s,dy:-1});t+=dt; if(k++%3==0)pr('T');}
