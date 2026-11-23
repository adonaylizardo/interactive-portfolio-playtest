import { JacT9 } from '../../../src/game/jacT9';
import { objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings } from '../../../src/data/map';
import { buildingParkPrefer } from '../../../src/data/world';
(globalThis as any).__T = { JacT9, objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings, buildingParkPrefer };
