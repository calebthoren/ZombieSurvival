// systems/world_gen/chunks/ChunkManager.js
// Manages loading and unloading of world chunks around the player.

import Chunk from './Chunk.js';
import { WORLD_GEN } from '../worldGenConfig.js';

export default class ChunkManager {
    constructor(scene, radius = 1) {
        this.scene = scene;
        this.radius = radius;
        this.loadedChunks = new Map(); // key: "cx,cy" -> Chunk
    }

    _key(cx, cy) {
        return `${cx},${cy}`;
    }

    update(x, y) {
        const size = WORLD_GEN.chunk.size;
        const cx = Math.floor(x / size);
        const cy = Math.floor(y / size);
        const radius = this.radius;

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const nx = cx + dx;
                const ny = cy + dy;
                const key = this._key(nx, ny);
                if (!this.loadedChunks.has(key)) {
                    const chunk = new Chunk(nx, ny);
                    chunk.load(this.scene);
                    this.loadedChunks.set(key, chunk);
                    this.scene.events.emit('chunk:load', chunk);
                }
            }
        }

        for (const [key, chunk] of this.loadedChunks) {
            if (
                Math.abs(chunk.cx - cx) > radius ||
                Math.abs(chunk.cy - cy) > radius
            ) {
                chunk.unload();
                this.loadedChunks.delete(key);
                this.scene.events.emit('chunk:unload', chunk);
            }
        }
    }
}

