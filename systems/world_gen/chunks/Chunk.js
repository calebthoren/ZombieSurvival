// systems/world_gen/chunks/Chunk.js
// Basic world chunk container handling entity group and metadata.

import { WORLD_GEN } from '../worldGenConfig.js';
import { getBiome, sampleBiomeNoise } from '../biomes/biomeMap.js';

function texPool() {
    if (!globalThis.__chunkTexPool) {
        globalThis.__chunkTexPool = [];
    }
    return globalThis.__chunkTexPool;
}

function lerpColor(a, b, t) {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = ar + ((br - ar) * t) | 0;
    const g = ag + ((bg - ag) * t) | 0;
    const bcol = ab + ((bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bcol;
}

// Pre-render a chunk-sized texture with biome colors that fade to
// neighbouring chunk colors only within the configured edge radius.
function drawBiomeTexture(scene, rt, cx, cy) {
    const size = WORLD_GEN.chunk.size;
    const radius = WORLD_GEN.chunk.blendRadius ?? 50;
    const density = WORLD_GEN.chunk.blendDensity ?? 1;
    const samples = Math.max(2, Math.floor(size / radius) * density);
    const step = size / samples;
    const falloff = WORLD_GEN.chunk.blendFalloff ?? 1;
    const jitterAmt = (WORLD_GEN.chunk.blendJitter ?? 0.5) * radius;
    const noiseScale = WORLD_GEN.chunk.blendNoiseScale ?? 0.1;
    const baseColor = WORLD_GEN.biomeColors[getBiome(cx + 0.5, cy + 0.5)];
    const g = scene.add.graphics();
    for (let ix = 0; ix < samples; ix++) {
        for (let iy = 0; iy < samples; iy++) {
            const px = (ix + 0.5) * step;
            const py = (iy + 0.5) * step;
            const worldX = cx * size + px;
            const worldY = cy * size + py;
            const edgeDist = Math.min(px, py, size - px, size - py);
            const jitter = sampleBiomeNoise(worldX * noiseScale, worldY * noiseScale) * jitterAmt;
            const dist = edgeDist + jitter;
            let color = baseColor;
            if (dist < radius) {
                let nx = cx;
                let ny = cy;
                if (px < radius) nx = cx - 1;
                else if (px > size - radius) nx = cx + 1;
                if (py < radius) ny = cy - 1;
                else if (py > size - radius) ny = cy + 1;
                const neighborColor = WORLD_GEN.biomeColors[getBiome(nx + 0.5, ny + 0.5)];
                const t = Math.pow(1 - dist / radius, falloff) * 0.5;
                color = lerpColor(baseColor, neighborColor, t);
            }
            g.fillStyle(color, 1);
            g.fillRect(ix * step, iy * step, step + 1, step + 1);
        }
    }
    rt.draw(g);
    g.destroy();
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
            let tex = texPool().pop();
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
            drawBiomeTexture(scene, tex, this.cx, this.cy);
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
            texPool().push(this.rt);
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
    texPool().length = 0;
}

