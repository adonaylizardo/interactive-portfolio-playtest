import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
const [x,y,d,s]=process.argv.slice(2); jac.qaSpawnDrive(+x,+y,d); jac.setGear('D'); let t=0,k=0;
const pr=(tag)=>console.log(tag,t.toFixed(2),jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2),jac.vel.toFixed(2),jac.gear,jac.escapeGaveUp?'GU':'-','blk',jac.poseBlocked(jac.cx,jac.cy,jac.dir));
const seq=[[6,'D',+s,-1],[0.3,null,0,0],[3,'R',0,-1],[3,'R',+s,-1],[3,'R',-s,-1],[0.3,null,0,0],[4,'D',-s,-1],[4,'D',0,-1],[4,'S-brake-in-D',0,1]];
for (const [sec,g,dx,dy] of seq){ if(g==='D'||g==='R') jac.setGear(g); const e=t+sec; console.log('--',g,dx,dy); while(t<e){jac.update(dt,{dx,dy});t+=dt; if(k++%20==0)pr(' ');} }
