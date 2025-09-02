import test from 'node:test';
import assert from 'node:assert';

import { WORLD_GEN, BIOME_IDS } from '../../../systems/world_gen/worldGenConfig.js';
import { getDensity } from '../../../systems/world_gen/noise.js';

// helper to convert chunk coords to world coords
function worldCoords(cx, cy) {
    const size = WORLD_GEN.chunk.size;
    return { x: cx * size + 10, y: cy * size + 10 };
}

test('getBiome maps noise thresholds', async () => {
    const { getBiome, __setNoise2D } = await import('../../../systems/world_gen/biomes/biomeMap.js?threshold');
    const values = [-0.9, 0.0, 0.9];
    let call = 0;
    __setNoise2D(() => values[call++]);
    assert.strictEqual(getBiome(0, 0), BIOME_IDS.PLAINS);
    assert.strictEqual(getBiome(1, 1), BIOME_IDS.FOREST);
    assert.strictEqual(getBiome(2, 2), BIOME_IDS.DESERT);
});

test('neighboring chunks share biome when noise diff is below threshold step', async () => {
    const { getBiome, __setNoise2D } = await import('../../../systems/world_gen/biomes/biomeMap.js?neighbor');
    const values = [0.2, 0.22];
    let call = 0;
    __setNoise2D(() => values[call++]);
    const b1 = getBiome(0, 0);
    const b2 = getBiome(0, 1);
    assert.strictEqual(b1, BIOME_IDS.FOREST);
    assert.strictEqual(b2, BIOME_IDS.FOREST);
});

test('seeded noise yields deterministic biomes', async () => {
    const path = '../../../systems/world_gen/biomes/biomeMap.js?det';
    const { getBiome } = await import(path);
    const { getBiome: getBiome2 } = await import(path + '&again');
    assert.strictEqual(getBiome(10, 20), getBiome2(10, 20));
});

test('changing a biome seed only affects that biome\'s densities', async () => {
    const { getBiome } = await import('../../../systems/world_gen/biomes/biomeMap.js?density');

    function densityAt(cx, cy) {
        const { x, y } = worldCoords(cx, cy);
        const biome = getBiome(cx, cy);
        const seed = WORLD_GEN.biomeSeeds[biome];
        return getDensity(x, y, seed);
    }

    function findChunkWithBiome(id) {
        for (let x = 0; x < 20; x++) {
            for (let y = 0; y < 20; y++) {
                if (getBiome(x, y) === id) return { cx: x, cy: y };
            }
        }
        throw new Error('Biome not found');
    }

    const plainsChunk = findChunkWithBiome(BIOME_IDS.PLAINS);
    const otherChunk = findChunkWithBiome(BIOME_IDS.FOREST);

    const dA1 = densityAt(plainsChunk.cx, plainsChunk.cy);
    const dB1 = densityAt(otherChunk.cx, otherChunk.cy);
    const oldSeed = WORLD_GEN.biomeSeeds[BIOME_IDS.PLAINS];
    WORLD_GEN.biomeSeeds[BIOME_IDS.PLAINS] = oldSeed + 1;
    const dA2 = densityAt(plainsChunk.cx, plainsChunk.cy);
    const dB2 = densityAt(otherChunk.cx, otherChunk.cy);
    assert.notStrictEqual(dA1, dA2);
    assert.strictEqual(dB1, dB2);
    WORLD_GEN.biomeSeeds[BIOME_IDS.PLAINS] = oldSeed;
});

test('getDensity spans 0..1 range', () => {
    let min = 1,
        max = 0;
    for (let i = 0; i < 1000; i++) {
        const d = getDensity(i * 17, i * 29, 12345);
        if (d < min) min = d;
        if (d > max) max = d;
    }
    assert(min < 0.1);
    assert(max > 0.9);
});

