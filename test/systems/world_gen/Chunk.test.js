import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import Chunk, { __clearTexturePool } from '../../../systems/world_gen/chunks/Chunk.js';
import { WORLD_GEN } from '../../../systems/world_gen/worldGenConfig.js';
import { getBiome } from '../../../systems/world_gen/biomes/biomeMap.js';

function mockScene(rtCb) {
    const graphicsCalls = [];
    const scene = {
        add: {
            group: () => ({
                active: true,
                add() {},
                getChildren: () => [],
                clear() {},
                remove() {},
            }),
            renderTexture: rtCb,
            graphics: () => {
                const g = {
                    fills: [],
                    fillStyle(color) {
                        this.fills.push(color);
                        return this;
                    },
                    fillRect() { return this; },
                    clear() { return this; },
                    destroy() { return this; },
                };
                graphicsCalls.push(g);
                return g;
            },
        },
        resourcePool: { release() {} },
        _graphicsCalls: graphicsCalls,
    };
    return scene;
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
        const scene = mockScene((x, y, w, h) => {
            return {
                draws: 0,
                setOrigin() { return this; },
                setDepth() { return this; },
                setVisible() { return this; },
                setActive() { return this; },
                setPosition(nx, ny) { x = nx; y = ny; return this; },
                clear() { return this; },
                draw() { this.draws++; return this; },
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
        assert.ok(tex.draws > 0);
        const fills = scene._graphicsCalls[0].fills;
        const expectedSamples = Math.max(
            2,
            Math.floor(size / WORLD_GEN.chunk.blendRadius)
                * WORLD_GEN.chunk.blendDensity,
        );
        assert.equal(fills.length, expectedSamples * expectedSamples);
        assert(fills.includes(WORLD_GEN.biomeColors[biome]));
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
            draw() {},
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

