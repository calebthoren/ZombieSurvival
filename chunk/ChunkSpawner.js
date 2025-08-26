export default class ChunkSpawner {
    constructor(rng) {
        this.rng = rng;
        // TODO: seedable RNG for deterministic spawning
    }

    spawn(scene, chunkMeta) {
        // TODO: spawn entities for the chunk
    }

    despawn(scene, chunkMeta) {
        // TODO: remove entities when chunk is deactivated
    }
}
