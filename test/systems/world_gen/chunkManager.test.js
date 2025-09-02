import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';

import ChunkManager from '../../../systems/world_gen/chunks/ChunkManager.js';
import { WORLD_GEN } from '../../../systems/world_gen/worldGenConfig.js';

test('ChunkManager loads and unloads chunks around player movement', () => {
    const scene = {
        events: new EventEmitter(),
        add: {
            group: () => ({
                active: true,
                add() {},
                getChildren: () => [],
                clear() {},
                destroy() {},
                remove() {},
            }),
            renderTexture: () => ({
                setOrigin() { return this; },
                setDepth() { return this; },
                setVisible() { return this; },
                setActive() { return this; },
                setPosition() { return this; },
                clear() { return this; },
                draw() {},
            }),
            graphics: () => ({
                fillGradientStyle() { return this; },
                fillRect() { return this; },
                clear() { return this; },
                destroy() { return this; },
            }),
        },
    };
    const cm = new ChunkManager(scene, 1);
    cm.maxLoadsPerTick = 9;
    cm.maxUnloadsPerTick = 9;
    cm.unloadGraceMs = 0;
    let loadCount = 0;
    let unloadCount = 0;
    scene.events.on('chunk:load', () => loadCount++);
    scene.events.on('chunk:unload', () => unloadCount++);

    cm.update(0, 0);
    assert.equal(loadCount, 9);
    assert.equal(unloadCount, 0);
    assert.equal(cm.loadedChunks.size, 9);
    assert(cm.loadedChunks.has('0,0'));

    cm.update(WORLD_GEN.chunk.size, 0);
    assert.equal(loadCount, 12);
    assert.equal(unloadCount, 3);
    assert(cm.loadedChunks.size <= 9);
});

test('ChunkManager wraps coordinates across world bounds', () => {
    const scene = {
        events: new EventEmitter(),
        add: {
            group: () => ({
                active: true,
                add() {},
                getChildren: () => [],
                clear() {},
                destroy() {},
                remove() {},
            }),
            renderTexture: () => ({
                setOrigin() { return this; },
                setDepth() { return this; },
                setVisible() { return this; },
                setActive() { return this; },
                setPosition() { return this; },
                clear() { return this; },
                draw() {},
            }),
            graphics: () => ({
                fillGradientStyle() { return this; },
                fillRect() { return this; },
                clear() { return this; },
                destroy() { return this; },
            }),
        },
    };
    const cm = new ChunkManager(scene, 1);
    cm.maxLoadsPerTick = 9;
    cm.maxUnloadsPerTick = 9;
    cm.unloadGraceMs = 0;
    let loadCount = 0;
    let unloadCount = 0;
    scene.events.on('chunk:load', () => loadCount++);
    scene.events.on('chunk:unload', () => unloadCount++);

    cm.update(0, 0);
    loadCount = 0;
    unloadCount = 0;
    cm.update(
        WORLD_GEN.world.width + 1,
        WORLD_GEN.world.height + 1,
    );
    assert.equal(loadCount, 0);
    assert.equal(unloadCount, 0);
    assert(cm.loadedChunks.has('0,0'));
});
