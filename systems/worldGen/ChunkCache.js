export default class ChunkCache {
    constructor() {
        this._cache = new Map();
    }

    get(chunkX, chunkY) {
        return this._cache.get(`${chunkX},${chunkY}`) || null;
    }

    set(chunkX, chunkY, data) {
        this._cache.set(`${chunkX},${chunkY}`, data);
    }

    delete(chunkX, chunkY) {
        this._cache.delete(`${chunkX},${chunkY}`);
    }
}
