// systems/world_gen/biomes/biomeMap.js
// Biome assignment based on simple noise thresholds.
// Import local copy so browser can load without relying on node_modules.
import SimplexNoise from '../../../lib/simplex-noise.js';

import { BIOME_IDS, BIOME_SCALE } from '../worldGenConfig.js';

// cumulative probabilities for Plains -> Forest -> Desert
// [0.4, 0.7] yields 40% Plains, 30% Forest, 30% Desert
const THRESHOLDS = [0.4, 0.7];

// Noise generator for biome assignment.
// Initialized via setBiomeSeed to avoid per-frame allocations.
let noise2D = () => 0;

export function setBiomeSeed(seed) {
    const simplex = new SimplexNoise(seed);
    noise2D = simplex.noise2D.bind(simplex);
}

export function getBiome(cx, cy) {
    const v = (noise2D(cx * BIOME_SCALE, cy * BIOME_SCALE) + 1) / 2;
    if (v < THRESHOLDS[0]) return BIOME_IDS.PLAINS;
    if (v < THRESHOLDS[1]) return BIOME_IDS.FOREST;
    return BIOME_IDS.DESERT;
}

// Test-only hook to replace noise generator
export function __setNoise2D(fn) {
    noise2D = fn;
}

// Expose raw noise for edge blending and tests.
export function sampleBiomeNoise(x, y) {
    return noise2D(x, y);
}

export default { getBiome, setBiomeSeed };
