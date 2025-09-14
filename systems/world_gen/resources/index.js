// systems/world_gen/resources/index.js
import { WORLD_GEN } from '../worldGenConfig.js';
import { registerResourceType } from './registry.js';

registerResourceType('rocks', () => WORLD_GEN?.spawns?.resources?.rocks);
registerResourceType('trees', () => WORLD_GEN?.spawns?.resources?.trees);
registerResourceType('bushes', () => WORLD_GEN?.spawns?.resources?.bushes);
