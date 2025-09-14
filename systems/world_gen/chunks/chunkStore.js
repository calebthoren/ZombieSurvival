// systems/world_gen/chunks/chunkStore.js
// Unified chunk state and data store.

const store = new Map();

export function getState(id) {
    return store.get(id)?.state;
}

export function setState(id, state) {
    const entry = store.get(id);
    if (entry) {
        entry.state = state;
    } else {
        store.set(id, { state });
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
