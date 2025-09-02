// systems/world_gen/chunks/Chunk.js
// Basic world chunk container handling entity group and metadata.

import { WORLD_GEN } from '../worldGenConfig.js';
import { getBiome } from '../biomes/biomeMap.js';

export default class Chunk {
    constructor(cx, cy, meta = {}) {
        this.cx = cx;
        this.cy = cy;
        this.group = null;
        this.meta = meta;
        this.rect = null;
    }

    load(scene) {
        if (!this.group) {
            this.group = scene.add.group();
        }
        this.group.active = true;
        if (!this.rect) {
            const size = WORLD_GEN.chunk.size;
            const color = WORLD_GEN.biomeColors[getBiome(this.cx, this.cy)];
            this.rect = scene.add.rectangle(
                this.cx * size,
                this.cy * size,
                size,
                size,
                color,
            ).setOrigin(0, 0).setDepth(-1);
            this.group.add(this.rect);
        }
        if (Array.isArray(this.meta.zombies) && this.meta.zombies.length > 0) {
            if (scene?.combat?.spawnZombie) {
                for (const z of this.meta.zombies) {
                    const zombie = scene.combat.spawnZombie(z.type, { x: z.x, y: z.y });
                    if (zombie) zombie.hp = z.hp ?? zombie.maxHp;
                }
            }
            this.meta.zombies = [];
        }
        return this.group;
    }

    unload(scene) {
        if (this.rect) {
            this.rect.destroy();
            this.rect = null;
        }
        if (this.group) {
            const children = this.group.getChildren ? this.group.getChildren() : [];
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                scene?.resourcePool?.release?.(c);
            }
            this.group.clear && this.group.clear(false);
            this.group.active = false;
        }
        const size = WORLD_GEN.chunk.size;
        const minX = this.cx * size;
        const minY = this.cy * size;
        const maxX = minX + size;
        const maxY = minY + size;
        this.meta.zombies = [];
        if (scene?.zombies && scene?.zombiePool) {
            const zs = scene.zombies.getChildren();
            for (let i = zs.length - 1; i >= 0; i--) {
                const z = zs[i];
                if (!z.active) continue;
                if (z.x >= minX && z.x < maxX && z.y >= minY && z.y < maxY) {
                    this.meta.zombies.push({
                        type: z.zType,
                        x: z.x,
                        y: z.y,
                        hp: z.hp,
                    });
                    scene.zombiePool.release(z);
                }
            }
        }
        return this.meta;
    }

    serialize() {
        return {
            cx: this.cx,
            cy: this.cy,
            meta: { ...this.meta },
        };
    }
}

