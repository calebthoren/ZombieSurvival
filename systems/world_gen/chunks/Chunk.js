// systems/world_gen/chunks/Chunk.js
// Basic world chunk container handling entity group and metadata.

import { WORLD_GEN } from '../worldGenConfig.js';
import { getBiome } from '../biomes/biomeMap.js';

const TEX_POOL = [];

function drawBiomeTexture(rt, cx, cy) {
    const size = WORLD_GEN.chunk.size;
    const radius = WORLD_GEN.chunk.blendRadius ?? 50;
    const samples = Math.max(2, Math.floor(size / radius));
    const step = size / samples;
    for (let ix = 0; ix < samples; ix++) {
        for (let iy = 0; iy < samples; iy++) {
            const biome = getBiome(cx + ix / samples, cy + iy / samples);
            const color = WORLD_GEN.biomeColors[biome];
            rt.fill(color, 1, ix * step, iy * step, step + 1, step + 1);
        }
    }
}

export default class Chunk {
    constructor(cx, cy, meta = {}) {
        this.cx = cx;
        this.cy = cy;
        this.group = null;
        this.meta = meta;
        this.rt = null;
    }

    load(scene) {
        if (!this.group) {
            this.group = scene.add.group();
        }
        this.group.active = true;
        if (!this.rt) {
            const size = WORLD_GEN.chunk.size;
            let tex = TEX_POOL.pop();
            if (tex) {
                tex.setPosition(this.cx * size, this.cy * size);
                tex.setVisible(true).setActive(true).clear();
            } else {
                tex = scene.add.renderTexture(
                    this.cx * size,
                    this.cy * size,
                    size,
                    size,
                ).setOrigin(0, 0).setDepth(-1);
            }
            drawBiomeTexture(tex, this.cx, this.cy);
            this.group.add(tex);
            this.rt = tex;
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
        if (this.rt) {
            this.group?.remove(this.rt, false);
            this.rt.clear();
            this.rt.setVisible(false);
            this.rt.setActive(false);
            TEX_POOL.push(this.rt);
            this.rt = null;
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

export function __clearTexturePool() {
    TEX_POOL.length = 0;
}

