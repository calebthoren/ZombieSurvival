// systems/world_gen/biomes/biomeMap.js
// Biome assignment based on simple noise thresholds.

import { BIOME_IDS } from '../worldGenConfig.js';

const THRESHOLDS = [0.4, 0.7];

function noise(cx, cy) {
    const n = Math.sin(cx * 12.9898 + cy * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

export function getBiome(cx, cy) {
    const v = noise(cx, cy);
    if (v < THRESHOLDS[0]) return BIOME_IDS.PLAINS;
    if (v < THRESHOLDS[1]) return BIOME_IDS.FOREST;
    return BIOME_IDS.DESERT;
}

export default { getBiome };
