import { load } from '../../sentinel-r45h/common.mjs';
const dt=+(process.argv[2]||0.0166667); const { T, jac } = await load(process.env.BUNDLE);
const DIRS=['se','sw','nw','ne'];
// clearance: largest r such that all poses within r are unblocked
const clear=(x,y)=>{ let r=0; for(;r<8;r++){ let ok=true; for(let dy=-r;dy<=r&&ok;dy++)for(let dx=-r;dx<=r&&ok;dx++) for(const d of DIRS) if(jac.poseBlocked(x+dx,y+dy,d)!==0){ok=false;break;} if(!ok) break;} return r; };
let best=[]; for(let y=1;y<T.MAP_HEIGHT-1;y++)for(let x=1;x<T.MAP_WIDTH-1;x++){const c=clear(x,y); if(c>=3) best.push([c,x,y]);} best.sort((a,b)=>b[0]-a[0]);
console.log('open spots (clearance>=3):',best.length, best.slice(0,8).map(b=>b.join(',')).join(' | '));
let runs=0,stops=0; for (const [c,x,y] of best) for (const d of DIRS) for (const s of [-1,1]) { jac.qaSpawnDrive(x,y,d); jac.setGear('D'); let t=0; while(t<0.6){jac.update(dt,{dx:0,dy:-1});t+=dt;} let gu=0; const h0=jac.heading; while(t<3.6){jac.update(dt,{dx:s,dy:-1});t+=dt; if(jac.escapeGaveUp) gu+=dt;} runs++; if(gu>0.3) stops++; }
console.log(`open-area turns runs=${runs} stops=${stops}`);
// trace one
const [c,x,y]=best[0]; jac.qaSpawnDrive(x,y,'se'); jac.setGear('D'); let t=0,k=0; while(t<4){ const s=t<0.6?0:1; jac.update(dt,{dx:s,dy:-1}); t+=dt; if(k++%6==0) console.log(t.toFixed(2),jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2),jac.vel.toFixed(2),jac.escapeGaveUp?'GU':'', jac.slowSteerT.toFixed(2)); }
