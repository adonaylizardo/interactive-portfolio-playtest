import { load } from './common.mjs';
const { T, jac } = await load();
for (const name of ['bain','volaris']) {
const b = T.getEnterableBuildings().find(b => b.name === name);
const sits = jac.sitsForDoor(b.door.x, b.door.y);
const R = c => !!jac.footprintPath(c.x,c.y);
const doorSide = sits.filter(c=>c.along>=0), close = doorSide.filter(c=>Math.hypot(c.x-b.door.x,c.y-b.door.y)<=8);
const rs = doorSide.filter(R).sort((a,b2)=>Math.hypot(a.x-b.door.x,a.y-b.door.y)-Math.hypot(b2.x-b.door.x,b2.y-b.door.y));
console.log(name,'close reachable', close.filter(R).length,'/',close.length,' doorSide reachable', rs.length,'/',doorSide.length, 'nearest reachable door-side', rs.slice(0,3).map(c=>`${c.x},${c.y} d=${Math.hypot(c.x-b.door.x,c.y-b.door.y).toFixed(1)} pathLen=${jac.footprintPath(c.x,c.y).length}`));
}
