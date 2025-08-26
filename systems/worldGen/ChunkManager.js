import ChunkLoader from './ChunkLoader.js';
import ChunkSpawner from './ChunkSpawner.js';
import ChunkCache from './ChunkCache.js';
import ChunkPathGrid from './ChunkPathGrid.js';

export default class ChunkManager {
    constructor(scene, opts = {}) {
        this.scene = scene;
        this.chunkWidth = opts.chunkWidth || 400;
        this.chunkHeight = opts.chunkHeight || 300;
        this.radius = opts.radius || 1;
        this.active = new Map();
        this._lastChunkX = NaN;
        this._lastChunkY = NaN;

        this.loader = new ChunkLoader(scene);
        this.spawner = new ChunkSpawner(scene);
        this.cache = new ChunkCache();
        this.pathGrid = new ChunkPathGrid();
    }

    static rng(seed) {
        return function () {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    _seed(x, y) {
        let s = x * 374761393 + y * 668265263;
        s = (s ^ (s >> 13)) >>> 0;
        return s;
    }

    update() {
        const player = this.scene.player;
        if (!player) return;
        const cx = Math.floor(player.x / this.chunkWidth);
        const cy = Math.floor(player.y / this.chunkHeight);
        if (cx === this._lastChunkX && cy === this._lastChunkY) return;
        this._lastChunkX = cx;
        this._lastChunkY = cy;

        const needed = new Set();
        for (let dx = -this.radius; dx <= this.radius; dx++) {
            for (let dy = -this.radius; dy <= this.radius; dy++) {
                const nx = cx + dx;
                const ny = cy + dy;
                const key = `${nx},${ny}`;
                needed.add(key);
                if (!this.active.has(key)) {
                    const seed = this._seed(nx, ny);
                    const data = this.loader.load(nx, ny);
                    this.cache.set(nx, ny, data);
                    this.pathGrid.build(nx, ny, data);
                    this.spawner.activate(nx, ny, seed, data);
                    this.active.set(key, { chunkX: nx, chunkY: ny, seed });
                    this.scene.events.emit('chunk:activate', {
                        chunkX: nx,
                        chunkY: ny,
                        seed,
                    });
                }
            }
        }

        for (const key of Array.from(this.active.keys())) {
            if (!needed.has(key)) {
                const info = this.active.get(key);
                this.spawner.deactivate(info.chunkX, info.chunkY);
                this.loader.unload(info.chunkX, info.chunkY);
                this.cache.delete(info.chunkX, info.chunkY);
                this.scene.events.emit('chunk:deactivate', info);
                this.active.delete(key);
            }
        }
    }
}
