import { WORLD_GEN } from '../worldGenConfig.js';
import { registerResourceType } from './registry.js';

registerResourceType('rocks', () => WORLD_GEN?.spawns?.resources?.rocks);
