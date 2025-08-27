import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';

import ChunkManager from '../../../systems/world_gen/chunks/ChunkManager.js';
import { WORLD_GEN } from '../../../systems/world_gen/worldGenConfig.js';

test('ChunkManager loads and unloads chunks around player movement', () => {
    const scene = {
        events: new EventEmitter(),
        add: { group: () => ({ active: true, destroy() {} }) },
    };
    const cm = new ChunkManager(scene, 1);
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
