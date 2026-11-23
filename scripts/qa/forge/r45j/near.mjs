import { load } from '../../sentinel-r45h/common.mjs';
const { T, jac } = await load(process.env.BUNDLE);
for (const [name,[ax,ay]] of Object.entries({bain:[39,26],volaris:[39,36]})) { const found=[];
  for (let y=ay-6;y<=ay+6;y++) for (let x=ax-6;x<=ax+6;x++) for (const d of ['se','sw','nw','ne']) { if (jac.poseBlocked(x,y,d)!==0) continue; jac.qaSpawnDrive(20,6,'se'); const p=jac.findDrivePath(x,y); if(p) found.push([+Math.hypot(x-ax,y-ay).toFixed(2),x,y,d]); }
  found.sort((a,b)=>a[0]-b[0]); console.log(name,'access',ax,ay,'nearest reachable legal drive poses:',JSON.stringify(found.slice(0,6))); }
