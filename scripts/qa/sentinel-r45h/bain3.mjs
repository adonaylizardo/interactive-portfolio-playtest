import { load } from './common.mjs';
const { T, jac } = await load();
const b = T.getEnterableBuildings().find(b => b.name === 'bain');
const sx=Math.round(jac.cx), sy=Math.round(jac.cy);
const sits = jac.sitsForDoor(b.door.x, b.door.y);
// replicate the pool selection
const usable = sits; const doorSide = usable.filter(c=>c.along>=0); const close = doorSide.filter(c=>Math.hypot(c.x-b.door.x,c.y-b.door.y)<=8);
const front = close.filter(c=>c.along>=1&&c.doorD>=3&&c.doorD<=5);
const pool = front.length?front:close.length?close:doorSide.length?doorSide:usable;
console.log('pool', pool.length, 'front', front.length, 'close', close.length);
let ok=0; for (const c of pool) { const p = jac.footprintPath(c.x,c.y); if (p) ok++; }
console.log('pool reachable by footprintPath', ok, '/', pool.length);
for (const c of pool.slice(0,6)) console.log(' ', c.x,c.y,c.heading,'goal',jac.footprintGoal(c.x,c.y),'pose(heading)',jac.poseBlocked(c.x,c.y,c.heading),'axis',!!jac.axisDrivePath(sx,sy,c.x,c.y,(x,y)=>jac.driveBoxWalkable(x,y)||(x===sx&&y===sy)),'bfs',!!jac.footprintPath(c.x,c.y));
const reach = sits.filter(c=>jac.footprintPath(c.x,c.y)); console.log('reachable sits sample', reach.slice(0,5).map(c=>`${c.x},${c.y} along=${c.along} doorD=${c.doorD.toFixed?.(1)??c.doorD} dist=${Math.hypot(c.x-b.door.x,c.y-b.door.y).toFixed(1)}`));
