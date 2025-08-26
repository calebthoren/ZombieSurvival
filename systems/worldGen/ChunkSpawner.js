export default class ChunkSpawner {
    constructor(scene) {
        this.scene = scene;
    }

    activate(chunkX, chunkY, seed, data) {
        // TODO: spawn entities/resources for this chunk using seed and data
    }

    deactivate(chunkX, chunkY) {
        // TODO: remove or recycle entities/resources for this chunk
    }
}
