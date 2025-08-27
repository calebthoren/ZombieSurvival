// test/systems/resourceRegistry.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import createResourceSystem from '../../systems/resourceSystem.js';
import {
    getResourceRegistry,
    registerResourceType,
} from '../../systems/world_gen/resources/registry.js';

const noop = () => {};

const scene = {
    resources: { getChildren: () => [] },
    physics: { add: { collider: noop, overlap: noop } },
    player: {},
    zombies: { getChildren: () => [] },
    time: { delayedCall: noop },
    events: { on: noop, once: noop, off: noop },
    textures: { get: () => ({ getSourceImage: () => ({ width: 0, height: 0 }) }) },
    add: { image: () => ({ setDepth: noop, setScale: noop }) },
    uiScene: { inventory: { addItem: noop } },
};

const system = createResourceSystem(scene);

test('existing resource modules register themselves', () => {
    const registry = getResourceRegistry();
    assert.ok(registry.has('rocks'));
    assert.ok(registry.has('trees'));
    assert.ok(registry.has('bushes'));
});

test('resourceSystem iterates over registry entries', () => {
    const registry = getResourceRegistry();
    for (const key of registry.keys()) {
        registry.set(key, () => ({ variants: [] }));
    }
    let called = false;
    registerResourceType('dummy', () => {
        called = true;
        return { variants: [] };
    });
    system.spawnAllResources();
    assert.equal(called, true);
});
