import test from 'node:test';
import assert from 'node:assert/strict';
import ChunkSpawner from '../../chunk/ChunkSpawner.js';

class RNG {
    constructor(seeds) {
        this.state = seeds.reduce((s, v) => s + (v || 0), 0);
    }
    _next() {
        const x = Math.sin(this.state++) * 10000;
        return x - Math.floor(x);
    }
    frac() {
        return this._next();
    }
    between(min, max) {
        return Math.floor(this._next() * (max - min)) + min;
    }
}

globalThis.Phaser = { Math: { RandomDataGenerator: RNG } };

test('chunk spawner is deterministic per chunk', () => {
    const spawner = new ChunkSpawner(42);
    const spawned = [];
    const destroyed = [];
    const scene = {
        spawnZombie: (type, pos) => {
            const obj = {
                ...pos,
                setData() {},
                destroy() {
                    destroyed.push(pos);
                },
            };
            spawned.push(obj);
            return obj;
        },
    };
    const meta = { chunkX: 1, chunkY: 2 };
    const first = spawner
        .spawn(scene, meta)
        .map((z) => ({ x: z.x, y: z.y }));
    spawner.despawn(scene, meta);
    assert.equal(destroyed.length, first.length);
    spawned.length = 0;
    destroyed.length = 0;
    const second = spawner
        .spawn(scene, meta)
        .map((z) => ({ x: z.x, y: z.y }));
    assert.deepEqual(first, second);
});
