import { WORLD_GEN } from '../worldGenConfig.js';
import { registerResourceType } from './registry.js';

registerResourceType('trees', () => WORLD_GEN?.spawns?.resources?.trees);
