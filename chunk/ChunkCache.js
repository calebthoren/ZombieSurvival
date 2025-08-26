export default class ChunkCache {
    constructor() {
        // TODO: setup persistence for chunk state
        this._cache = new Map();
    }

    save(key, state) {
        // TODO: persist state for the given chunk
        this._cache.set(key, state);
    }

    restore(key) {
        // TODO: return saved state for the given chunk or null
        return this._cache.get(key) || null;
    }
}
