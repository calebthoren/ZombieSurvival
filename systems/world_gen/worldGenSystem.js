// systems/world_gen/worldGenSystem.js
// Basic chunk-based world streaming.
import { save, load } from './chunks/chunkStore.js';

export default function createWorldGenSystem(scene) {
    const CHUNK_SIZE = 256;
    const PRELOAD_RADIUS = 32;

    const activeChunks = new Map();
    let currentId = null;
    let playerChunkX = 0;
    let playerChunkY = 0;

    function createChunk(id) {
        return {
            id,
            meta: null,
            serialize() {
                return { meta: this.meta };
            },
            deserialize(data) {
                this.meta = data?.meta || null;
            },
        };
    }

    function ensureChunk(id) {
        if (activeChunks.has(id)) return;
        const chunk = createChunk(id);
        const saved = load(id);
        if (saved) {
            chunk.deserialize(saved);
        } else {
            setTimeout(() => {
                chunk.meta = { generated: true };
            }, 0);
        }
        activeChunks.set(id, chunk);
    }

    function unloadChunk(id) {
        const chunk = activeChunks.get(id);
        if (!chunk) return;
        save(id, chunk.serialize());
        activeChunks.delete(id);
    }

    function swapChunk(id) {
        if (currentId === id) return;
        if (currentId) unloadChunk(currentId);
        ensureChunk(id);
        currentId = id;
    }

    function preload(x, y) {
        const id = x + ',' + y;
        if (activeChunks.has(id)) return;
        setTimeout(() => ensureChunk(id), 0);
    }

    function tick() {
        const p = scene.player;
        if (!p) return;
        const cx = (p.x / CHUNK_SIZE) | 0;
        const cy = (p.y / CHUNK_SIZE) | 0;
        if (cx !== playerChunkX || cy !== playerChunkY) {
            const id = cx + ',' + cy;
            swapChunk(id);
            playerChunkX = cx;
            playerChunkY = cy;
        }

        const localX = p.x - playerChunkX * CHUNK_SIZE;
        const localY = p.y - playerChunkY * CHUNK_SIZE;
        if (localX < PRELOAD_RADIUS) preload(playerChunkX - 1, playerChunkY);
        if (localX > CHUNK_SIZE - PRELOAD_RADIUS) preload(playerChunkX + 1, playerChunkY);
        if (localY < PRELOAD_RADIUS) preload(playerChunkX, playerChunkY - 1);
        if (localY > CHUNK_SIZE - PRELOAD_RADIUS) preload(playerChunkX, playerChunkY + 1);
    }

    scene.events.on('update', tick);
    scene.events.once('shutdown', () => {
        scene.events.off('update', tick);
        activeChunks.forEach((_, id) => unloadChunk(id));
    });

    return { tick };
}
