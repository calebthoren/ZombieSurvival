// systems/world_gen/chunks/ChunkManager.js
// Manages loading and unloading of world chunks around the player.

import Chunk from './Chunk.js';
import { WORLD_GEN } from '../worldGenConfig.js';
import { saveChunk, loadChunk } from './chunkStore.js';

export default class ChunkManager {
    constructor(scene, radius = 1) {
        this.scene = scene;
        this.radius = radius;
        this.loadedChunks = new Map(); // key: "cx,cy" -> Chunk
        const size = WORLD_GEN.chunk.size;
        this.cols = Math.floor(WORLD_GEN.world.width / size);
        this.rows = Math.floor(WORLD_GEN.world.height / size);
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

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const nx = (cx + dx + cols) % cols;
                const ny = (cy + dy + rows) % rows;
                const key = this._key(nx, ny);
                if (!this.loadedChunks.has(key)) {
                    const saved = loadChunk(key);
                    const chunk = new Chunk(nx, ny, saved?.meta);
                    chunk.load(this.scene);
                    this.loadedChunks.set(key, chunk);
                    this.scene.events.emit('chunk:load', chunk);
                }
            }
        }

        for (const [key, chunk] of this.loadedChunks) {
            const dx = Math.abs(chunk.cx - cx);
            const dy = Math.abs(chunk.cy - cy);
            const distX = Math.min(dx, cols - dx);
            const distY = Math.min(dy, rows - dy);
            if (distX > radius || distY > radius) {
                saveChunk(key, chunk.serialize());
                chunk.unload(this.scene);
                this.loadedChunks.delete(key);
                this.scene.events.emit('chunk:unload', chunk);
            }
        }
    }
}

