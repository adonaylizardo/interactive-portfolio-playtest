import { JacT9 } from '../sent-r45h/src/game/jacT9';
import { objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings } from '../sent-r45h/src/data/map';
import { buildingParkPrefer } from '../sent-r45h/src/data/world';
(globalThis as any).__T = { JacT9, objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings, buildingParkPrefer };
