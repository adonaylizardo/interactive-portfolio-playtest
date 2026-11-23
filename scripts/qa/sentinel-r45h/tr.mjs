import { load } from './common.mjs';
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
jac.qaSpawnDrive(28,23,'se'); const dt=1/60; let t=0,i=0;
while(t<9){ jac.update(dt,{dx:1,dy:-1}); t+=dt; i++; if(t>3 && i%6==0) console.log(t.toFixed(2),jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,'h',jac.heading.toFixed(2),'v',jac.vel.toFixed(2),'latch',jac.escapeLatch?jac.escapeLatch.face:'-','rem',jac.escapeRemain.toFixed(2),'cs',jac.creepStalled?1:0,'sb',jac.swapBlocked?1:0,'tsd',jac.travelSinceDir.toFixed(2),'rotBlk',jac.poseBlocked(jac.cx,jac.cy,'sw'),'pin',jac.nosePinned(1)?1:0); }
