// systems/world_gen/chunks/ChunkManager.js
// Manages loading and unloading of world chunks around the player.

import Chunk from './Chunk.js';
import { WORLD_GEN } from '../worldGenConfig.js';
import { save, load } from './chunkStore.js';

export default class ChunkManager {
    constructor(scene, radius = 1) {
        this.scene = scene;
        this.radius = radius;
        this.loadedChunks = new Map(); // key: "cx,cy" -> Chunk
        const size = WORLD_GEN.chunk.size;
        this.cols = Math.floor(WORLD_GEN.world.width / size);
        this.rows = Math.floor(WORLD_GEN.world.height / size);
        // Budget how many chunks to load/unload per tick to avoid spikes
        this.maxLoadsPerTick = 2;
        this.maxUnloadsPerTick = 2;
        // Geometric hysteresis padding (0 keeps the cap tight around radius)
        this.unloadPadding = 0;
        // Time-based hysteresis: must be out of range for this long before unload
        this.unloadGraceMs = 900; // ~0.9s, reduces border thrash
        this._outSince = new Map(); // key -> ms timestamp when first seen out-of-range
    }

    _key(cx, cy) {
        return `${cx},${cy}`;
    }

    update(x, y) {
        const size = WORLD_GEN.chunk.size;
        const w = WORLD_GEN.world.width;
        const h = WORLD_GEN.world.height;
        let wx = x % w;
        if (wx < 0) wx += w;
        let wy = y % h;
        if (wy < 0) wy += h;
        const cx = Math.floor(wx / size);
        const cy = Math.floor(wy / size);
        const radius = this.radius;
        const cols = this.cols;
        const rows = this.rows;
        // Collect missing neighbor chunks to load, prioritize nearest first
        const toLoad = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const nx = (cx + dx + cols) % cols;
                const ny = (cy + dy + rows) % rows;
                const key = this._key(nx, ny);
                if (!this.loadedChunks.has(key)) {
                    // Use Manhattan distance as priority (center first)
                    const priority = Math.abs(dx) + Math.abs(dy);
                    toLoad.push({ key, nx, ny, priority });
                }
            }
        }
        toLoad.sort((a, b) => a.priority - b.priority);
        const loads = Math.min(this.maxLoadsPerTick, toLoad.length);
        for (let i = 0; i < loads; i++) {
            const item = toLoad[i];
            const saved = load(item.key);
            const chunk = new Chunk(item.nx, item.ny, saved?.meta);
            chunk.load(this.scene);
            this.loadedChunks.set(item.key, chunk);
            this.scene.events.emit('chunk:load', chunk);
        }

        const now = this.scene?.time?.now ?? Date.now();
        // Collect chunks outside radius (+padding) to unload, prioritize farthest first
        const toUnload = [];
        for (const [key, chunk] of this.loadedChunks) {
            const dx = Math.abs(chunk.cx - cx);
            const dy = Math.abs(chunk.cy - cy);
            const distX = Math.min(dx, cols - dx);
            const distY = Math.min(dy, rows - dy);
            const out = distX > (radius + this.unloadPadding) || distY > (radius + this.unloadPadding);
            if (out) {
                const first = this._outSince.get(key) || now;
                if (!this._outSince.has(key)) this._outSince.set(key, first);
                if (now - first >= this.unloadGraceMs) {
                    const priority = distX + distY; // farthest first
                    toUnload.push({ key, chunk, priority });
                }
            } else {
                // Back in range; clear any pending timestamp
                if (this._outSince.has(key)) this._outSince.delete(key);
            }
        }
        toUnload.sort((a, b) => b.priority - a.priority);
        const unloads = Math.min(this.maxUnloadsPerTick, toUnload.length);
        for (let i = 0; i < unloads; i++) {
            const { key, chunk } = toUnload[i];
            save(key, chunk.serialize());
            chunk.unload(this.scene);
            this.loadedChunks.delete(key);
            this.scene.events.emit('chunk:unload', chunk);
        }
    }
}

