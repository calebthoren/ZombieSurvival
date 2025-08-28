// systems/world_gen/chunks/chunkUtils.js
// Conversion helpers between world and chunk coordinates.

import { WORLD_GEN } from '../worldGenConfig.js';

export function worldToChunk(x, y) {
    const size = WORLD_GEN.chunk.size;
    return { cx: Math.floor(x / size), cy: Math.floor(y / size) };
}

export function chunkToWorld(cx, cy) {
    const size = WORLD_GEN.chunk.size;
    return { x: cx * size, y: cy * size };
}

