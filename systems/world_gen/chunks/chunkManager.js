// systems/world_gen/chunks/chunkManager.js
// Minimal chunk manager that updates chunkRegistry on load/unload/metadata change.

import { setChunkState } from './chunkRegistry.js';
import { chunkMetadata } from '../worldGenConfig.js';

const ChunkManager = {
    loadChunk(cx, cy) {
        setChunkState(cx, cy, 'loaded');
    },

    unloadChunk(cx, cy) {
        const key = `${cx},${cy}`;
        const meta = chunkMetadata.get(key);
        setChunkState(cx, cy, meta && meta.dirty ? 'dirty' : 'unloaded');
    },

    markMetadataDirty(cx, cy, data) {
        const key = `${cx},${cy}`;
        chunkMetadata.set(key, { ...(chunkMetadata.get(key) || {}), ...data, dirty: true });
        setChunkState(cx, cy, 'dirty');
    },
};

export default ChunkManager;
