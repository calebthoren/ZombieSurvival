import test from 'node:test';
import assert from 'node:assert/strict';
import { generate } from '../../../systems/world_gen/resources/poissonSampler.js';
import createResourceSystem from '../../../systems/resourceSystem.js';
import { getResourceRegistry } from '../../../systems/world_gen/resources/registry.js';
import '../../../systems/world_gen/resources/rocks.js';
import '../../../systems/world_gen/resources/trees.js';
import '../../../systems/world_gen/resources/bushes.js';

globalThis.Phaser = {
    Math: {
        Between: (min, max) => Math.floor((min + max) / 2),
        FloatBetween: (min, max) => (min + max) / 2,
    },
    Geom: {
        Rectangle: class {
            constructor(x, y, w, h) {
                this.x = x;
                this.y = y;
                this.width = w;
                this.height = h;
            }
        },
        Intersects: {
            RectangleToRectangle: () => false,
        },
    },
};

test('poissonSampler keeps centers spaced at least radius apart', () => {
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const radius = 10;
    const pts = generate(bounds, radius);
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i].x - pts[j].x;
            const dy = pts[i].y - pts[j].y;
            const dist = Math.hypot(dx, dy);
            assert.ok(dist >= radius);
        }
    }
});

test('spawnChunkResources creates clusters around poisson centers', () => {
    const rng = (() => {
        let a = 1;
        return () => {
            a = (a * 16807) % 2147483647;
            return (a - 1) / 2147483646;
        };
    })();
    const origRandom = Math.random;
    Math.random = rng;

    const resourceSprites = [];
    const group = {
        add(obj) { resourceSprites.push(obj); },
        getChildren: () => resourceSprites,
        countActive: () => resourceSprites.length,
        active: true,
    };
    const sprite = () => ({
        x: 0,
        y: 0,
        data: {},
        setOrigin() { return this; },
        setScale() { return this; },
        setDepth() { return this; },
        setImmovable() { return this; },
        setPosition(x, y) { this.x = x; this.y = y; return this; },
        setCrop() { return this; },
        setAlpha() { return this; },
        setInteractive() { return this; },
        setData(k, v) { this.data[k] = v; return this; },
        getData(k) { return this.data[k]; },
        once() { return this; },
        on() { return this; },
        body: {
            setAllowGravity() {},
            setCircle() {},
            setSize() {},
            setOffset() {},
        },
        destroy() {},
    });

    const scene = {
        player: { x: 0, y: 0, body: { x: 0, y: 0, width: 0, height: 0 } },
        physics: { add: { collider() {}, overlap() {}, image: sprite }, world: {} },
        add: { image: sprite },
        resources: group,
        resourcesDyn: group,
        resourcesDecor: { add() {} },
        zombies: { getChildren: () => [] },
        time: { addEvent({ callback }) { callback(); }, delayedCall(ms, cb) { cb(); } },
        events: { on() {}, once() {}, off() {} },
        textures: { get: () => ({ getSourceImage: () => ({ width: 32, height: 32 }) }) },
    };
    const chunk = { cx: 0, cy: 0, group, meta: {} };

    const system = createResourceSystem(scene);
    system.spawnChunkResources(chunk);

    Math.random = origRandom;

    const res = chunk.meta.resources;
    assert.ok(res.length >= 35 && res.length <= 45, `count ${res.length}`);

    const centers = chunk.meta.centerPoints;
    assert.ok(centers.length > 0);
    let clustered = false;
    for (const c of centers) {
        let nearby = 0;
        for (const r of res) {
            const dx = r.x - c.x;
            const dy = r.y - c.y;
            if (Math.hypot(dx, dy) < 80) nearby++;
        }
        if (nearby > 1) {
            clustered = true;
            break;
        }
    }
    assert.ok(clustered, 'expected at least one cluster');
});
