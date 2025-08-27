import { WORLD_GEN } from '../worldGenConfig.js';
import { registerResourceType } from './registry.js';

registerResourceType('bushes', () => WORLD_GEN?.spawns?.resources?.bushes);
