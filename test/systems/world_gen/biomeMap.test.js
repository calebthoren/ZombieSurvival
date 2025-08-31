import test from 'node:test';
import assert from 'node:assert';

import { WORLD_GEN, BIOME_IDS } from '../../../systems/world_gen/worldGenConfig.js';
import { getBiome } from '../../../systems/world_gen/biomes/biomeMap.js';
import { getDensity } from '../../../systems/world_gen/noise.js';

test('getBiome returns expected IDs', () => {
    assert.strictEqual(getBiome(0, 0), BIOME_IDS.PLAINS);
    assert.strictEqual(getBiome(8, 8), BIOME_IDS.FOREST);
    assert.strictEqual(getBiome(1, 1), BIOME_IDS.DESERT);
});

function worldCoords(cx, cy) {
    const size = WORLD_GEN.chunk.size;
    return { x: cx * size + 10, y: cy * size + 10 };
}

// helper to find density with current seeds
function densityAt(cx, cy) {
    const { x, y } = worldCoords(cx, cy);
    const biome = getBiome(cx, cy);
    const seed = WORLD_GEN.biomeSeeds[biome];
    return getDensity(x, y, seed);
}

test('changing a biome seed only affects that biome\'s densities', () => {
    const biomeA = BIOME_IDS.PLAINS;
    const dA1 = densityAt(0, 0);
    const dB1 = densityAt(8, 8);
    const oldSeed = WORLD_GEN.biomeSeeds[biomeA];
    WORLD_GEN.biomeSeeds[biomeA] = oldSeed + 1;
    const dA2 = densityAt(0, 0);
    const dB2 = densityAt(8, 8);
    assert.notStrictEqual(dA1, dA2);
    assert.strictEqual(dB1, dB2);
    WORLD_GEN.biomeSeeds[biomeA] = oldSeed;
});
