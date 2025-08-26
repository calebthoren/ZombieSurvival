import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../systems/worldGen/ChunkManager.js';

export default class ChunkSpawner {
    constructor(seed = 0) {
        this.seed = seed;
        this._active = new Map();
    }

    /**
     * Spawn deterministic per-chunk entities such as zombies.
     * @param {Phaser.Scene} scene
     * @param {{chunkX:number, chunkY:number, entities?:Array}} chunkMeta
     * @returns {Array} list of spawned entities
     */
    spawn(scene, chunkMeta) {
        const { chunkX, chunkY } = chunkMeta || {};
        const key = `${chunkX},${chunkY}`;
        if (this._active.has(key)) return this._active.get(key);

        const rng = new Phaser.Math.RandomDataGenerator([
            this.seed,
            chunkX,
            chunkY,
        ]);
        const spawned = [];

        if (Array.isArray(chunkMeta?.entities)) {
            for (const ent of chunkMeta.entities) {
                if (ent.type === 'zombie') {
                    const z = scene.spawnZombie(ent.zombieType || 'walker', {
                        x: ent.x,
                        y: ent.y,
                    });
                    if (z) spawned.push(z);
                }
            }
        } else {
            const chance = 0.25;
            const maxCount = 3;
            const count = rng.frac() < chance ? rng.between(1, maxCount) : 0;
            for (let i = 0; i < count; i++) {
                const x = rng.between(
                    chunkX * CHUNK_WIDTH,
                    chunkX * CHUNK_WIDTH + CHUNK_WIDTH,
                );
                const y = rng.between(
                    chunkY * CHUNK_HEIGHT,
                    chunkY * CHUNK_HEIGHT + CHUNK_HEIGHT,
                );
                const z = scene.spawnZombie('walker', { x, y });
                if (z) {
                    z.setData('chunkX', chunkX);
                    z.setData('chunkY', chunkY);
                    spawned.push(z);
                }
            }
        }

        this._active.set(key, spawned);
        return spawned;
    }

    /**
     * Despawn any entities tracked for the given chunk.
     * @param {Phaser.Scene} scene
     * @param {{chunkX:number, chunkY:number}} chunkMeta
     * @returns {number} number of entities removed
     */
    despawn(scene, chunkMeta) {
        const { chunkX, chunkY } = chunkMeta || {};
        const key = `${chunkX},${chunkY}`;
        const list = this._active.get(key);
        if (list) {
            for (const obj of list) {
                if (obj && obj.destroy) obj.destroy();
            }
            this._active.delete(key);
            return list.length;
        }
        return 0;
    }
}
