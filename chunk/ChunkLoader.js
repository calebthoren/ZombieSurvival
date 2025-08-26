import { WORLD_GEN } from '../data/worldGenConfig.js';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../systems/worldGen/ChunkManager.js';

// Generates deterministic metadata for world chunks.
// Terrain/resources/entities are seeded by chunk coordinates.
export default class ChunkLoader {
    constructor(seed = 'default') {
        this.seed = seed;
    }

    load(chunkX, chunkY) {
        const rng = new Phaser.Math.RandomDataGenerator([
            this.seed,
            chunkX,
            chunkY,
        ]);
        const terrain = { type: 'plain' };
        const resources = this._generateResources(chunkX, chunkY, rng);
        const entities = [];
        return { chunkX, chunkY, rng, terrain, resources, entities };
    }

    _generateResources(chunkX, chunkY, rng) {
        const groups = WORLD_GEN?.spawns?.resources;
        if (!groups) return [];
        const minX = chunkX * CHUNK_WIDTH;
        const minY = chunkY * CHUNK_HEIGHT;
        const maxX = minX + CHUNK_WIDTH;
        const maxY = minY + CHUNK_HEIGHT;
        const list = [];
        for (const cfg of Object.values(groups)) {
            list.push(
                ...this._spawnGroup(cfg, rng, minX, maxX, minY, maxY),
            );
        }
        return list;
    }

    _spawnGroup(cfg, rng, minX, maxX, minY, maxY) {
        const variants = Array.isArray(cfg?.variants) ? cfg.variants : null;
        if (!variants || variants.length === 0) return [];
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);
        const totalChunks =
            (WORLD_GEN.world.width / CHUNK_WIDTH) *
            (WORLD_GEN.world.height / CHUNK_HEIGHT);
        const countPerChunk = Math.max(
            1,
            Math.floor((cfg.maxActive || 0) / totalChunks),
        );
        const minSpacing = cfg.minSpacing || 0;
        const minSpacingSq = minSpacing * minSpacing;
        const results = [];
        for (let i = 0; i < countPerChunk; i++) {
            let r = rng.frac() * totalWeight;
            let id = variants[0].id;
            for (const v of variants) {
                r -= v.weight || 0;
                if (r <= 0) {
                    id = v.id;
                    break;
                }
            }
            let x = 0;
            let y = 0;
            let valid = false;
            for (let attempt = 0; attempt < 4 && !valid; attempt++) {
                x = rng.between(minX, maxX);
                y = rng.between(minY, maxY);
                valid = true;
                if (minSpacing > 0) {
                    for (const e of results) {
                        const dx = e.x - x;
                        const dy = e.y - y;
                        if (dx * dx + dy * dy < minSpacingSq) {
                            valid = false;
                            break;
                        }
                    }
                }
            }
            if (!valid) continue;
            results.push({ id, x, y });
        }
        return results;
    }
}
