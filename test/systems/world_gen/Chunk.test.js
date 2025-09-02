import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import Chunk, { __clearTexturePool } from '../../../systems/world_gen/chunks/Chunk.js';
import { WORLD_GEN } from '../../../systems/world_gen/worldGenConfig.js';
import { getBiome } from '../../../systems/world_gen/biomes/biomeMap.js';

function mockScene(rtCb) {
    return {
        add: {
            group: () => ({
                active: true,
                add() {},
                getChildren: () => [],
                clear() {},
                remove() {},
            }),
            renderTexture: rtCb,
        },
        resourcePool: { release() {} },
    };
}

test('Chunk load draws biome render texture', () => {
    __clearTexturePool();
    const size = WORLD_GEN.chunk.size;
    const cases = [
        { cx: 0, cy: 0 },
        { cx: 8, cy: 8 },
        { cx: 1, cy: 1 },
    ];

    for (const { cx, cy } of cases) {
        const biome = getBiome(cx, cy);
        const calls = [];
        const scene = mockScene((x, y, w, h) => {
            return {
                fills: [],
                setOrigin() { return this; },
                setDepth() { return this; },
                setVisible() { return this; },
                setActive() { return this; },
                setPosition(nx, ny) { x = nx; y = ny; return this; },
                clear() { this.fills = []; return this; },
                fill(color, alpha, rx, ry, rw, rh) { this.fills.push(color); },
                get x() { return x; },
                get y() { return y; },
                get width() { return w; },
                get height() { return h; },
            };
        });
        const chunk = new Chunk(cx, cy);
        chunk.load(scene);
        const tex = chunk.rt;
        assert.equal(tex.x, cx * size);
        assert.equal(tex.y, cy * size);
        assert.equal(tex.width, size);
        assert.equal(tex.height, size);
        assert.equal(tex.fills[0], WORLD_GEN.biomeColors[biome]);
        chunk.unload(scene);
        assert.equal(chunk.rt, null);
    }
});

test('RenderTextures only created once and pooled on unload', () => {
    __clearTexturePool();
    let createCount = 0;
    const scene = mockScene(() => {
        createCount++;
        return {
            setOrigin() { return this; },
            setDepth() { return this; },
            setVisible() { return this; },
            setActive() { return this; },
            setPosition() { return this; },
            clear() { return this; },
            fill() {},
        };
    });
    const chunk = new Chunk(0, 0);
    chunk.load(scene);
    assert.equal(createCount, 1);
    chunk.load(scene);
    assert.equal(createCount, 1);
    chunk.unload(scene);
    chunk.load(scene);
    assert.equal(createCount, 1);
});

