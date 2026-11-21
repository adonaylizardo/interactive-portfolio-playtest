import { load } from './common.mjs';
const name = process.argv[2]; const dtArg = +(process.argv[3]||1/60);
const { T, jac } = await load(process.env.BUNDLE||'./bundle.mjs');
const b = T.getEnterableBuildings().find(b => b.name === name);
const prefer = T.buildingParkPrefer(b.name);
console.log('door', b.door, 'prefer', JSON.stringify(prefer));
if (prefer) {
  const h = prefer.dir ?? null;
  console.log(' prefer sitWith', h && jac.sitWith(prefer.x, prefer.y, h), 'poseBlocked', h && jac.poseBlocked(prefer.x, prefer.y, h), 'footprintGoal', jac.footprintGoal(prefer.x, prefer.y), 'findDrivePath', JSON.stringify(jac.findDrivePath(prefer.x, prefer.y))?.slice(0,80));
}
const sits = jac.sitsForDoor(b.door.x, b.door.y);
if (jac.footprintGoal) console.log(' sits', sits.length, 'footprintGoal-ok', sits.filter(c=>jac.footprintGoal(c.x,c.y)).length, 'reachable(full BFS)', sits.filter(c=>jac.footprintPath(c.x,c.y)).length);
const sit = jac.parkForDoor(b.door.x, b.door.y, prefer ?? undefined);
console.log(' parkForDoor ->', sit ? `${sit.x},${sit.y} ${sit.heading} path=${sit.path.length}` : 'NULL => scene.ts:2897 jacGetOut at spawn');
if (!sit) process.exit(0);
const path = sit.path.length ? sit.path : jac.findDrivePath(sit.x, sit.y);
// validate every node with the facing of its leg using the follower's own continuous tolerance
let bad = 0;
jac.setDrivePath(path, path[path.length-1] ?? sit, { loose: true });
let t = 0, len = 0, lx = jac.cx, ly = jac.cy, stillT = 0, maxBlk = 0, lastLog = -5;
while (t < 60 && (jac.drivePath.length || jac.driveGoal)) {
  jac.update(dtArg, { dx: 0, dy: 0 }); t += dtArg;
  const d = Math.hypot(jac.cx - lx, jac.cy - ly); len += d; lx = jac.cx; ly = jac.cy;
  maxBlk = Math.max(maxBlk, jac.poseBlocked(jac.cx, jac.cy, jac.dir));
  if (d < 1e-3) stillT += dtArg; else stillT = 0;
  if (stillT > 1 && t - lastLog > 3) { lastLog = t; const f = jac.drivePath[0]; console.log(`  t=${t.toFixed(1)} still at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) dir=${jac.dir} next=${JSON.stringify(f)} poseBlk(here)=${jac.poseBlocked(jac.cx,jac.cy,jac.dir)} poseBlk(rounded)=${jac.poseBlocked(Math.round(jac.cx),Math.round(jac.cy),jac.dir)} stuckEvents=${jac.__stuck||0}`); }
}
console.log(` end t=${t.toFixed(1)} pos=(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) len=${len.toFixed(1)} pathLeft=${jac.drivePath.length} maxOverlap=${maxBlk} gaveUp=${jac.gaveUpRoute?.()} stuck=${jac.__stuck||0}`);
