// systems/world_gen/chunks/chunkRegistry.js
// Tracks load states for procedural world chunks.

export const chunkRegistry = new Map();

function _key(cx, cy) {
    return `${cx},${cy}`;
}

export function getChunkState(cx, cy) {
    return chunkRegistry.get(_key(cx, cy))?.state;
}

export function setChunkState(cx, cy, state) {
    const key = _key(cx, cy);
    const entry = chunkRegistry.get(key);
    if (entry) {
        entry.state = state;
    } else {
        chunkRegistry.set(key, { state });
    }
}
