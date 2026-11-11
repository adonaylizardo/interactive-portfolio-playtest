#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  EXTERIOR_DOOR_ENTRY_COOLDOWN_MS,
  outdoorSpawnTileAwayFromDoor,
} from '../src/game/outdoorSpawn.ts';
import { objects } from '../src/data/map.ts';

const teresa = objects.find((o) => o.name === 'teresa');
const biblioteca = objects.find((o) => o.name === 'biblioteca');
assert.ok(teresa?.door, 'teresa has door');
assert.ok(biblioteca?.door, 'biblioteca has door');
assert.ok(EXTERIOR_DOOR_ENTRY_COOLDOWN_MS >= 1000, 'door grace at least 1s');

for (const b of [teresa, biblioteca]) {
  const spawn = outdoorSpawnTileAwayFromDoor(b, 2);
  assert.ok(spawn, `spawn for ${b.name}`);
  const d = b.door;
  const dist = Math.max(Math.abs(spawn.x - d.x), Math.abs(spawn.y - d.y));
  assert.ok(dist >= 2, `${b.name}: spawn must be 2+ tiles from door (got ${dist})`);
}

console.log('test-exit-spawn-grace: ok');
