import { load } from '../../sentinel-r45h/common.mjs';
const dt=0.0166667; const { T, jac } = await load(process.env.BUNDLE);
const go=(sec,inp,g)=>{ if(g) jac.setGear(g); let t=0; while(t<sec){jac.update(dt,inp);t+=dt;}};
const battery=(s)=>{ const sp=[jac.cx,jac.cy]; let best=0,how='';
  const seq=[[0.3,null,0,0],[3,'D',-s,-1],[0.3,null,0,0],[3,'D',0,-1],[0.3,null,0,0],[2,'R',0,-1],[3,'D',-s,-1],[0.3,null,0,0],[2,'R',s,-1],[3,'D',-s,-1],[0.3,null,0,0],[2,'R',-s,-1],[3,'D',s,-1],[0.3,null,0,0],[3,'R',0,-1],[3,'D',0,-1]];
  for (const [sec,g,dx,dy] of seq){ go(sec,{dx,dy},g); const m=Math.hypot(jac.cx-sp[0],jac.cy-sp[1]); if(m>best){best=m;how=`${g}${dx}`;} } return [best,how]; };
const cases=[[27,22,'se',1],[27,23,'se',-1],[25,24,'ne',-1],[25,24,'ne',1],[25,23,'ne',-1],[25,23,'ne',1]];
for (const [x,y,d,s] of cases){ jac.qaSpawnDrive(x,y,d); jac.setGear('D'); go(6,{dx:s,dy:-1}); const st=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2)]; const [b,h]=battery(s); console.log(`spawn(${x},${y},${d}) s=${s} after 6s ${st} battery max ${b.toFixed(2)} via ${h} ${b<1.5?'TRAPPED':''}`); }
// natural approaches toward the same spots
for (const [x0,y0,d,s,label] of [[25,30,'ne',-1,'x25 north'],[25,30,'ne',1,'x25 north'],[22,22,'se',1,'y22 east'],[22,22,'se',-1,'y22 east'],[22,23,'se',-1,'y23 east'],[22,23,'se',1,'y23 east']]) {
  if (jac.poseBlocked(x0,y0,d)!==0){console.log('blocked',x0,y0,d);continue;} jac.qaSpawnDrive(x0,y0,d); jac.setGear('D'); go(5,{dx:0,dy:-1}); const pin=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir];
  go(6,{dx:s,dy:-1}); const st=[jac.cx.toFixed(2),jac.cy.toFixed(2),jac.dir,jac.heading.toFixed(2)]; const [b,h]=battery(s); console.log(`natural ${label} from (${x0},${y0},${d}) s=${s}: straight->${pin} steer6s->${st} battery max ${b.toFixed(2)} via ${h} ${b<1.5?'TRAPPED':''}`); }
