import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import Chunk from '../../../systems/world_gen/chunks/Chunk.js';
import { WORLD_GEN } from '../../../systems/world_gen/worldGenConfig.js';
import { getBiome } from '../../../systems/world_gen/biomes/biomeMap.js';

function mockScene(rectCb) {
    return {
        add: {
            group: () => ({
                active: true,
                add() {},
                getChildren: () => [],
                clear() {},
            }),
            rectangle: rectCb,
        },
        resourcePool: { release() {} },
    };
}

test('Chunk load draws biome-colored rectangle', () => {
    const size = WORLD_GEN.chunk.size;
    const cases = [
        { cx: 0, cy: 0 },
        { cx: 8, cy: 8 },
        { cx: 1, cy: 1 },
    ];

    for (const { cx, cy } of cases) {
        const biome = getBiome(cx, cy);
        const rects = [];
        const scene = mockScene((x, y, w, h, color) => {
            rects.push({ x, y, w, h, color });
            return {
                setOrigin() { return this; },
                setDepth() { return this; },
                destroy() {},
            };
        });
        const chunk = new Chunk(cx, cy);
        chunk.load(scene);
        assert.equal(rects.length, 1);
        assert.equal(rects[0].x, cx * size);
        assert.equal(rects[0].y, cy * size);
        assert.equal(rects[0].w, size);
        assert.equal(rects[0].h, size);
        assert.equal(rects[0].color, WORLD_GEN.biomeColors[biome]);
        chunk.unload(scene);
        assert.equal(chunk.rect, null);
    }
});

test('Rectangles only created on load and destroyed on unload', () => {
    let createCount = 0;
    let destroyCount = 0;
    const scene = mockScene(() => {
        createCount++;
        return {
            setOrigin() { return this; },
            setDepth() { return this; },
            destroy() { destroyCount++; },
        };
    });
    const chunk = new Chunk(0, 0);
    chunk.load(scene);
    assert.equal(createCount, 1);
    chunk.load(scene);
    assert.equal(createCount, 1);
    chunk.unload(scene);
    assert.equal(destroyCount, 1);
    chunk.load(scene);
    assert.equal(createCount, 2);
});

