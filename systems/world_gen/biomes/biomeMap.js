// systems/world_gen/biomes/biomeMap.js
// Biome assignment based on simple noise thresholds.

import SimplexNoise from 'simplex-noise';

import { BIOME_IDS, BIOME_SCALE } from '../worldGenConfig.js';

// cumulative probabilities for Plains -> Forest -> Desert
// [0.4, 0.7] yields 40% Plains, 30% Forest, 30% Desert
const THRESHOLDS = [0.4, 0.7];

// Seeded simplex noise generator for biome assignment.
// Created once at module scope to avoid per-frame allocations.
const NOISE_SEED = 1337;
const simplex = new SimplexNoise(NOISE_SEED);
let noise2D = simplex.noise2D.bind(simplex);

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

export default { getBiome };
