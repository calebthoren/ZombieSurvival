// systems/world_gen/chunks/chunkStore.js
// Unified chunk persistence and state tracking.

const store = new Map();

function _key(cx, cy) {
    return `${cx},${cy}`;
}

export function getState(cx, cy) {
    return store.get(_key(cx, cy))?.state;
}

export function setState(cx, cy, state) {
    const key = _key(cx, cy);
    const entry = store.get(key);
    if (entry) {
        entry.state = state;
    } else {
        store.set(key, { state });
    }
}

export function save(id, data) {
    const entry = store.get(id);
    if (entry) {
        entry.data = data;
    } else {
        store.set(id, { data });
    }
}

export function load(id) {
    return store.get(id)?.data;
}

export function clear() {
    store.clear();
}
