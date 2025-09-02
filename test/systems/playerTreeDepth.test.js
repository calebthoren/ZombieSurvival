import test from 'node:test';
import assert from 'node:assert/strict';

// Stub Phaser math utilities
globalThis.Phaser = {
    Math: {
        Between: (min, max) => Math.floor(min + (max - min) * Math.random()),
        FloatBetween: (min, max) => min + (max - min) * Math.random(),
    },
    Geom: {
        Rectangle: class {
            constructor(x = 0, y = 0, w = 0, h = 0) {
                this.x = x;
                this.y = y;
                this.width = w;
                this.height = h;
            }
        },
        Intersects: {
            RectangleToRectangle(r1, r2) {
                return (
                    r1.x < r2.x + r2.width &&
                    r1.x + r1.width > r2.x &&
                    r1.y < r2.y + r2.height &&
                    r1.y + r1.height > r2.y
                );
            },
        },
    },
};

test('player depth exceeds tree trunk depth', async (t) => {
    t.mock.method(Math, 'random', () => 0.5);

    const { default: createResourceSystem } = await import('../../systems/resourceSystem.js');

    const makeSprite = (x, y) => ({
        x,
        y,
        width: 32,
        height: 32,
        displayWidth: 32,
        displayHeight: 32,
        originX: 0.5,
        originY: 0.5,
        active: true,
        setOrigin(ox, oy) {
            this.originX = ox;
            this.originY = oy;
            return this;
        },
        setScale(s) {
            this.displayWidth = this.width * s;
            this.displayHeight = this.height * s;
            return this;
        },
        setDepth(d) { this.depth = d; return this; },
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
            children: [],
            add: (obj) => scene.resources.children.push(obj),
            getChildren: () => scene.resources.children,
            countActive: () => scene.resources.children.length,
        },
        resourcesDyn: { add: () => {} },
        resourcesDecor: { add: () => {} },
        physics: { add: { image: (x, y) => makeSprite(x, y) } },
        add: { image: (x, y) => makeSprite(x, y) },
        textures: { get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) }) },
        player: { depth: 900 },
        zombies: { getChildren: () => [] },
        events: { on: () => {}, once: () => {}, off: () => {} },
        time: { addEvent: () => ({ remove() {} }) },
    };

    const system = createResourceSystem(scene);

    let trunk;
    const cfg = {
        variants: [{ id: 'tree1A', weight: 1 }],
        clusterMin: 1,
        clusterMax: 1,
        clusterRadius: 0,
        minSpacing: 0,
    };

    system.__testSpawnResourceGroup('trees', cfg, {
        bounds: { minX: 0, minY: 1000, maxX: 1000, maxY: 2000 },
        count: 1,
        noRespawn: true,
        proximityGroup: scene.resources,
        getDensity: () => 1,
        getBiome: () => 0,
        onCreate(obj) { trunk = obj; },
    });

    assert.ok(trunk.depth < scene.player.depth);
});
