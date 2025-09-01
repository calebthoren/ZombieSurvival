import test from 'node:test';
import assert from 'node:assert/strict';

// Stub Phaser math utilities with deterministic sequence
const seq = [80, 160, 0, 21, Math.PI / 2, 21];
let si = 0;
globalThis.Phaser = {
    Math: {
        Between: () => seq[si++],
        FloatBetween: () => seq[si++],
    },
};

test('clusters spawn same base type without overlap', async () => {

    const { default: createResourceSystem } = await import('../../systems/resourceSystem.js');

    const children = [];
    const makeSprite = (x, y) => ({
        x,
        y,
        width: 32,
        height: 32,
        displayWidth: 32,
        displayHeight: 32,
        active: true,
        setOrigin() { return this; },
        setScale(s) {
            this.displayWidth = this.width * s;
            this.displayHeight = this.height * s;
            return this;
        },
        setDepth() { return this; },
        setImmovable() { return this; },
        setPosition() { return this; },
        setCrop() { return this; },
        setData() { return this; },
        setInteractive() { return this; },
        on() { return this; },
        once() { return this; },
        destroy() {},
    });

    const scene = {
        resources: {
            children,
            add: (obj) => children.push(obj),
            getChildren: () => children,
            countActive: () => children.length,
        },
        resourcesDyn: { add: () => {} },
        resourcesDecor: { add: () => {} },
        physics: { add: { image: (x, y) => makeSprite(x, y) } },
        add: { image: (x, y) => makeSprite(x, y) },
        textures: { get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) }) },
        player: { depth: 0 },
        zombies: { getChildren: () => [] },
        events: { on: () => {}, once: () => {}, off: () => {} },
    };

    const system = createResourceSystem(scene);

    const spawned = [];
    const cfg = {
        variants: [
            { id: 'rock1A', weight: 1 },
            { id: 'rock1B', weight: 1 },
            { id: 'rock2A', weight: 1 },
            { id: 'rock2B', weight: 1 },
        ],
        clusterMin: 3,
        clusterMax: 3,
        minSpacing: 0,
    };

    const count = system.__testSpawnResourceGroup('test', cfg, {
        bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
        count: 3,
        noRespawn: true,
        proximityGroup: scene.resources,
        getDensity: () => 1,
        getBiome: () => 0,
        onCreate(obj, id, x, y) {
            obj.id = id;
            obj.x = x;
            obj.y = y;
            spawned.push(obj);
        },
    });

    assert.equal(count, 3);
    const base = spawned[0].id.replace(/[A-Za-z]$/, '');
    for (const s of spawned) {
        assert.ok(s.id.startsWith(base));
    }
    assert.ok(spawned.some((s) => s.id !== spawned[0].id));

});
