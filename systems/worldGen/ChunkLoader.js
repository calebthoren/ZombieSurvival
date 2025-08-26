export default class ChunkLoader {
    constructor(scene) {
        this.scene = scene;
    }

    load(chunkX, chunkY) {
        // TODO: load terrain or metadata for this chunk
        return null;
    }

    unload(chunkX, chunkY) {
        // TODO: persist changes or free resources for this chunk
    }
}
