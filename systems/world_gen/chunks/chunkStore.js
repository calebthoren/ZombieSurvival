// systems/world_gen/chunks/chunkStore.js
// Session-scoped chunk persistence.

const memoryStore = {};

export function saveChunk(id, data) {
    if (id == null) return;
    memoryStore[id] = data;
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem('chunk:' + id, JSON.stringify(data));
        }
    } catch (err) {
        // ignore storage errors (e.g., quota, SSR)
    }
}

export function loadChunk(id) {
    if (id == null) return null;
    if (id in memoryStore) return memoryStore[id];
    try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
            const raw = window.sessionStorage.getItem('chunk:' + id);
            if (raw) {
                const data = JSON.parse(raw);
                memoryStore[id] = data;
                return data;
            }
        }
    } catch (err) {
        // ignore parse/storage errors
    }
    return null;
}
