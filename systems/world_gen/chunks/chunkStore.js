const store = new Map();

export function saveChunk(id, data) {
    store.set(id, data);
}

export function loadChunk(id) {
    return store.get(id);
}

export function deleteChunk(id) {
    store.delete(id);
}

export function clearChunkStore() {
    store.clear();
}
