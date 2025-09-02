import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import Chunk, { __clearTexturePool } from '../../../systems/world_gen/chunks/Chunk.js';
import { WORLD_GEN, BIOME_IDS, BIOME_SCALE } from '../../../systems/world_gen/worldGenConfig.js';
import { getBiome, __setNoise2D } from '../../../systems/world_gen/biomes/biomeMap.js';

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

function lerpColor(a, b, t) {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = ar + ((br - ar) * t) | 0;
    const g = ag + ((bg - ag) * t) | 0;
    const bcol = ab + ((bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bcol;
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
        const cIdx = Math.floor(expectedSamples / 2) * expectedSamples
            + Math.floor(expectedSamples / 2);
        assert.equal(fills[cIdx], WORLD_GEN.biomeColors[biome]);
        chunk.unload(scene);
        assert.equal(chunk.rt, null);
    }
});

test('edge samples blend to neighbouring biome colors', () => {
    __clearTexturePool();
    const origNoise = (x, y) => 0;
    __setNoise2D((x, y) => {
        const gx = x / BIOME_SCALE;
        const gy = y / BIOME_SCALE;
        return (gx >= 0 && gx < 1 && gy >= 0 && gy < 1) ? -1 : 1;
    });
    const size = WORLD_GEN.chunk.size;
    const radius = WORLD_GEN.chunk.blendRadius;
    const samples = Math.max(
        2,
        Math.floor(size / radius) * WORLD_GEN.chunk.blendDensity,
    );
    const step = size / samples;
    const scene = mockScene((x, y, w, h) => ({
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
    }));
    const chunk = new Chunk(0, 0);
    chunk.load(scene);
    const fills = scene._graphicsCalls[0].fills;
    const plains = WORLD_GEN.biomeColors[BIOME_IDS.PLAINS];
    const desert = WORLD_GEN.biomeColors[BIOME_IDS.DESERT];
    const t = 1 - (step / 2) / radius;
    const expected = lerpColor(plains, desert, Math.pow(t, WORLD_GEN.chunk.blendFalloff));
    assert.equal(fills[0], expected);
    chunk.unload(scene);
    __setNoise2D(origNoise);
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

