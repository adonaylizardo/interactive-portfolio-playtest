import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
for (const s of [-1,1]) for (let X=21; X<=34; X+=0.5) { jac.qaSpawnDrive(20,6,'se'); jac.setGear('D'); let t=0; while(jac.cx<X && t<6){jac.update(dt,{dx:0,dy:-1});t+=dt;} if(jac.cx<X) continue;
  const p0=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.vel.toFixed(2)]; let tt=0,res='', snap=null, ph=jac.heading, pd=jac.dir; const h0=jac.heading;
  while(tt<3){ jac.update(dt,{dx:s,dy:-1}); tt+=dt; let fh=jac.heading-ph; while(fh>2)fh-=4; while(fh<-2)fh+=4; if(jac.dir!==pd && Math.abs(fh)>0.4 && !snap) snap=`${pd}->${jac.dir} dh=${fh.toFixed(2)} t=${tt.toFixed(2)}`; ph=jac.heading; pd=jac.dir; if(jac.escapeGaveUp){res=`GU@${jac.cx.toFixed(2)},${jac.cy.toFixed(2)} t=${tt.toFixed(2)}`;break;} let dh=jac.heading-h0; while(dh>2)dh-=4; while(dh<-2)dh+=4; if(Math.abs(dh)>=0.9){res=`turned t=${tt.toFixed(2)}`;break;} }
  console.log(`s=${s} X=${X} at ${p0} -> ${res||'neither'} ${snap?'SNAP '+snap:''}`); }
