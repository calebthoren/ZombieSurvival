// systems/resourceSystem.js
// Handles world resource spawning in a Phaser-agnostic way.
import { WORLD_GEN } from './world_gen/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';
import { getResourceRegistry } from './world_gen/resources/registry.js';
import './world_gen/resources/rocks.js';
import './world_gen/resources/trees.js';
import './world_gen/resources/bushes.js';

export default function createResourceSystem(scene) {
    // Background job timers for time-sliced chunk population
    const _chunkJobs = new Map(); // key: "cx,cy" -> Phaser.TimerEvent
    // Ensure resource collision/overlap systems are set up once
    function ensureColliders() {
        if (!scene.player || !scene.physics) return;
        if (!scene._resourcesCollider) {
            if (!scene.resources) return; // wait until group exists
            scene._resourcesCollider = scene.physics.add.collider(
                scene.player,
                scene.resources,
                null,
                (player, obj) => !!obj.getData('blocking'),
                scene,
            );
        }
        if (!scene._resourcesColliderDyn) {
            if (!scene.resourcesDyn) return;
            scene._resourcesColliderDyn = scene.physics.add.collider(
                scene.player,
                scene.resourcesDyn,
                null,
                (player, obj) => !!obj.getData('blocking'),
                scene,
            );
        }

        if (!scene._bushSlowOverlap) {
            if (!scene.player || !scene.resources || !scene.zombies) return;
            const markBush = (ent, obj) => {
                if (obj.getData('bush')) ent._inBush = true;
            };
            scene._bushSlowOverlap = [
                scene.physics.add.overlap(
                    scene.player,
                    scene.resources,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.zombies,
                    scene.resources,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.player,
                    scene.resourcesDyn,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.zombies,
                    scene.resourcesDyn,
                    markBush,
                    null,
                    scene,
                ),
            ];
            const slow = DESIGN_RULES.movement?.bushSlowMultiplier ?? 0.5;
            scene._bushSlowUpdate = () => {
                const p = scene.player;
                if (p) {
                    p._speedMult = p._inBush ? slow : 1;
                    p._inBush = false;
                }
                const zs = scene.zombies.getChildren();
                for (let i = 0; i < zs.length; i++) {
                    const z = zs[i];
                    z._speedMult = z._inBush ? slow : 1;
                    z._inBush = false;
                }
            };
            scene.events.on('update', scene._bushSlowUpdate);
            scene.events.once('shutdown', () => {
                scene.events.off('update', scene._bushSlowUpdate);
                scene._bushSlowUpdate = null;
            });
        }
    }
    // ----- Public API -----
    function _keyForChunk(c) {
        return `${c.cx},${c.cy}`;
    }

    function _cancelChunkJob(chunk) {
        const key = _keyForChunk(chunk);
        const t = _chunkJobs.get(key);
        if (t) {
            try { t.remove(false); } catch {}
            _chunkJobs.delete(key);
        }
    }

    function spawnChunkResources(chunk) {
        // Make sure physics interactions exist before creating any resources
        ensureColliders();
        const registry = getResourceRegistry();
        const size = WORLD_GEN.chunk.size;
        const bounds = {
            minX: chunk.cx * size,
            minY: chunk.cy * size,
            maxX: (chunk.cx + 1) * size,
            maxY: (chunk.cy + 1) * size,
        };

        const meta = chunk.meta;
        meta.resources = meta.resources || [];
        const resources = meta.resources;

        if (resources.length === 0) {
            // Lower per-chunk density: target 25–35 total resources
            const total = Phaser.Math.Between(25, 35);
            const keys = Array.from(registry.keys());
            const counts = {};
            let remaining = total;
            for (let i = 0; i < keys.length; i++) {
                const left = keys.length - i - 1;
                // Per-group bounds tuned to match 25–35 total across 3 groups
                const min = 8;
                const max = 12;
                const maxAllowed = Math.min(max, remaining - min * left);
                const minAllowed = Math.max(min, remaining - max * left);
                const c =
                    i === keys.length - 1
                        ? remaining
                        : Phaser.Math.Between(minAllowed, maxAllowed);
                counts[keys[i]] = c;
                remaining -= c;
            }

            // Time-sliced population: spawn small batches over several ticks
            const tasks = keys
                .map((k) => {
                    const gen = registry.get(k);
                    const cfg = gen && gen();
                    return cfg ? { key: k, cfg, remaining: counts[k] | 0 } : null;
                })
                .filter(Boolean);

            // Cancel any prior job for this chunk and start a new one
            _cancelChunkJob(chunk);
            const perBatch = 4; // aim to create up to ~4 resources per step
            const keyStr = _keyForChunk(chunk);
            const step = () => {
                // Stop if chunk got unloaded
                if (!chunk.group || chunk.group.active === false) {
                    _cancelChunkJob(chunk);
                    return;
                }
                let producedThisStep = 0;
                for (let i = 0; i < tasks.length; i++) {
                    const t = tasks[i];
                    if (!t || t.remaining <= 0) continue;
                    const want = Math.min(perBatch, t.remaining);
                const spawned = _spawnResourceGroup(t.key, t.cfg, {
                    bounds,
                    count: want,
                    noRespawn: true,
                    proximityGroup: chunk.group,
                    onCreate(trunk, id, x, y) {
                        chunk.group.add(trunk);
                        const idx = resources.push({
                            type: t.key,
                            id,
                                x,
                                y,
                                harvested: false,
                            }) - 1;
                            trunk.setData('chunkIdx', idx);
                            trunk.setData('chunk', chunk);
                        },
                        onHarvest(trunk) {
                            const idx = trunk.getData('chunkIdx');
                            if (idx != null) resources[idx].harvested = true;
                        },
                    }) | 0;
                    t.remaining = Math.max(0, t.remaining - spawned);
                    producedThisStep += spawned;
                    // Light cap per step to keep frame time stable
                    if (producedThisStep >= perBatch) break;
                }

                // If all tasks finished, stop; else schedule next slice
                const done = tasks.every((t) => !t || t.remaining <= 0);
                if (done) {
                    _cancelChunkJob(chunk);
                } else {
                    const ev = scene.time.addEvent({ delay: 60, callback: step });
                    _chunkJobs.set(keyStr, ev);
                }
            };
            const ev = scene.time.addEvent({ delay: 20, callback: step });
            _chunkJobs.set(keyStr, ev);
        } else {
            for (let i = 0; i < resources.length; i++) {
                const r = resources[i];
                if (r.harvested) continue;
                const cfg = {
                    variants: [{ id: r.id, weight: 1 }],
                    clusterMin: 1,
                    clusterMax: 1,
                };
                _spawnResourceGroup(r.type, cfg, {
                    bounds: {
                        minX: r.x,
                        maxX: r.x,
                        minY: r.y,
                        maxY: r.y,
                    },
                    count: 1,
                    noRespawn: true,
                    proximityGroup: chunk.group,
                    onCreate(trunk) {
                        chunk.group.add(trunk);
                        trunk.setData('chunkIdx', i);
                        trunk.setData('chunk', chunk);
                    },
                    onHarvest() {
                        resources[i].harvested = true;
                    },
                });
            }
        }
    }

    function spawnAllResources() {
        const registry = getResourceRegistry();
        for (const [key, gen] of registry.entries()) {
            const cfg = gen();
            if (!cfg) continue;
            const count = _spawnResourceGroup(key, cfg);
            console.log(`resources: ${key}=${count}`);
        }
        // After global spawn, set up interactions once
        ensureColliders();
    }

    // ----- Internal Helpers -----
    function _spawnResourceGroup(groupKey, groupCfg, opts = {}) {
        const variants = Array.isArray(groupCfg?.variants)
            ? groupCfg.variants
            : null;
        if (!variants || variants.length === 0) return;

        const maxActive =
            opts.count ??
            groupCfg.maxActive ??
            Phaser.Math.Between(
                groupCfg.minCount ?? 8,
                groupCfg.maxCount ?? 12,
            );
        const minSpacing = groupCfg.minSpacing ?? 48;
        const respawnMin = groupCfg.respawnDelayMs?.min ?? 5000;
        const respawnMax = groupCfg.respawnDelayMs?.max ?? 7000;
        const clusterMin = groupCfg.clusterMin ?? 3;
        const clusterMax = groupCfg.clusterMax ?? 6;
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);

        const w = WORLD_GEN.world.width;
        const h = WORLD_GEN.world.height;
        const bounds = opts.bounds || {};
        const minX = bounds.minX ?? 0;
        const maxX = bounds.maxX ?? w;
        const minY = bounds.minY ?? 0;
        const maxY = bounds.maxY ?? h;
        const noRespawn = !!opts.noRespawn;
        const onCreate = opts.onCreate;
        const onHarvest = opts.onHarvest;

        const tooClose = (x, y, w, h) => {
            // Prefer proximity-limited list (e.g., the current chunk's group) to avoid global N^2 scans
            const proxGroup = opts.proximityGroup;
            let children = [];
            if (proxGroup && proxGroup.getChildren) {
                children = proxGroup.getChildren();
            } else {
                const a = (scene.resources && scene.resources.getChildren) ? scene.resources.getChildren() : [];
                const b = (scene.resourcesDyn && scene.resourcesDyn.getChildren) ? scene.resourcesDyn.getChildren() : [];
                children = a.concat(b);
            }
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                if (!c.active) continue;
                const margin = (groupCfg.minSpacing ?? 0) * 0.5; // use half-spacing per axis
                const halfW = (c.displayWidth + w) * 0.5 + margin;
                const halfH = (c.displayHeight + h) * 0.5 + margin;
                const dx = c.x - x;
                const dy = c.y - y;
                if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) return true;
            }
            return false;
        };

        const pickVariantId = () => {
            let r = Math.random() * totalWeight;
            for (let v of variants) {
                r -= v.weight || 0;
                if (r <= 0) return v.id;
            }
            return variants[0].id;
        };

        const createResourceAt = (id, def, x, y) => {
            const originX = def.world?.origin?.x ?? 0.5;
            const originY = def.world?.origin?.y ?? 0.5;
            const scale = def.world?.scale ?? 1;
            const texKey = def.world?.textureKey || id;

            const isBush = !!def.tags?.includes('bush');
            const isBlocking = !!def.blocking;
            const needsPhysics = isBlocking || isBush;

            let trunk;
            const bodyCfg = def.world?.body;
            // REVERT: Always create dynamic physics bodies for resources that need physics
            if (needsPhysics) {
                trunk = scene.physics.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth(def.trunkDepth ?? def.depth ?? 5)
                    .setImmovable(true)
                    .setPosition(x, y);
                if (scene.resourcesDyn && scene.resourcesDyn.add) scene.resourcesDyn.add(trunk);
            } else {
                trunk = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth(def.trunkDepth ?? def.depth ?? 5);
                scene.resourcesDecor && scene.resourcesDecor.add(trunk);
            }

            trunk.setData('blocking', isBlocking);

            if (isBlocking && def.tags?.includes('rock')) {
                const frameW = trunk.width;
                const frameH = trunk.height;
                const topH = frameH * 0.5;
                const top = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth((scene.player?.depth ?? 900) + 2)
                    .setCrop(0, 0, frameW, topH);
                trunk.setCrop(0, topH, frameW, frameH - topH);
                trunk.setData('topSprite', top);
                trunk.once('destroy', () => top.destroy());
            }

            if (isBush) trunk.setData('bush', true);

            if (needsPhysics && trunk.body) {
                const b = trunk.body;
                if (typeof b.setAllowGravity === 'function') b.setAllowGravity(false);

                if (isBush) {
                    // Prefer circular slow zone, centered slightly above geometric center
                    const dispW = trunk.displayWidth;
                    const dispH = trunk.displayHeight;
                    const r = Math.min(dispW, dispH) * 0.45;
                    const lift = r * 0.2; // nudge up a bit
                    const ox = (trunk.displayOriginX || dispW * 0.5) - r;
                    const oy = (trunk.displayOriginY || dispH * 0.5) - r - lift;
                    if (typeof b.setCircle === 'function') b.setCircle(r, ox, oy);
                    else if (typeof b.setSize === 'function') b.setSize(2 * r, 2 * r);
                    if (typeof b.setOffset === 'function') b.setOffset(ox, oy);
                } else if (bodyCfg) {
                    const frameW = trunk.width;
                    const frameH = trunk.height;
                    const dispW = trunk.displayWidth;
                    const dispH = trunk.displayHeight;

                    const scaleX = trunk.scaleX || 1;
                    const scaleY = trunk.scaleY || 1;
                    const useScale = !!bodyCfg.useScale;

                    let bw, bh, br;
                    if (bodyCfg.kind === 'circle') {
                        br = useScale
                            ? bodyCfg.radius * scaleX
                            : bodyCfg.radius;
                        bw = bh = 2 * br;
                    } else {
                        bw = useScale ? bodyCfg.width * scaleX : bodyCfg.width;
                        bh = useScale
                            ? bodyCfg.height * scaleY
                            : bodyCfg.height;
                    }

                    const anchorSpaceW = useScale ? dispW : frameW;
                    const anchorSpaceH = useScale ? dispH : frameH;

                    const anchor = bodyCfg.anchor || 'topLeft';
                    let baseX = 0,
                        baseY = 0;
                    switch (anchor) {
                        case 'center':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = (anchorSpaceH - bh) * 0.5;
                            break;
                        case 'topCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = 0;
                            break;
                        case 'bottomCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'bottomLeft':
                            baseX = 0;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'topLeft':
                        default:
                            baseX = 0;
                            baseY = 0;
                            break;
                    }

                    const addX = useScale
                        ? (bodyCfg.offsetX || 0) * scaleX
                        : bodyCfg.offsetX || 0;
                    const addY = useScale
                        ? (bodyCfg.offsetY || 0) * scaleY
                        : bodyCfg.offsetY || 0;
                    const ox = baseX + addX;
                    const oy = baseY + addY;

                    if (bodyCfg.kind === 'circle' && typeof b.setCircle === 'function') {
                        b.setCircle(br, ox, oy);
                    } else {
                        if (typeof b.setSize === 'function') b.setSize(bw, bh);
                        if (typeof b.setOffset === 'function') b.setOffset(ox, oy);
                    }
                    // static bodies are inherently immovable; for dynamic, guard the call
                    if (typeof b.setImmovable === 'function') b.setImmovable(true);
                } else {
                    if (isBlocking) {
                        if (typeof b.setImmovable === 'function') b.setImmovable(true);
                    } else {
                            if (typeof b.setSize === 'function') b.setSize(trunk.displayWidth, trunk.displayHeight);
                            // Center align rect within the sprite's display frame
                            if (typeof b.setOffset === 'function') {
                                const ox = (trunk.displayOriginX || trunk.displayWidth * 0.5) - trunk.displayWidth * 0.5;
                                const oy = (trunk.displayOriginY || trunk.displayHeight * 0.5) - trunk.displayHeight * 0.5;
                                b.setOffset(ox, oy);
                            }
                        }
                        if (typeof b.setImmovable === 'function') b.setImmovable(true);
                    }
                }
                // Important for static bodies: refresh after size/offset/scale/origin/crop changes
                if (b.moves === false && typeof trunk.refreshBody === 'function') {
                    try { trunk.refreshBody(); } catch {}
                }
            }

            const leavesCfg = def.world?.leaves;
            if (leavesCfg) {
                const frameW = trunk.width;
                const frameH = trunk.height;

                const lw = leavesCfg.width;
                const lh = leavesCfg.height;

                const anchor = leavesCfg.anchor || 'topLeft';
                let baseX = 0,
                    baseY = 0;
                switch (anchor) {
                    case 'center':
                        baseX = (frameW - lw) * 0.5;
                        baseY = (frameH - lh) * 0.5;
                        break;
                    case 'topCenter':
                        baseX = (frameW - lw) * 0.5;
                        baseY = 0;
                        break;
                    case 'bottomCenter':
                        baseX = (frameW - lw) * 0.5;
                        baseY = frameH - lh;
                        break;
                    case 'bottomLeft':
                        baseX = 0;
                        baseY = frameH - lh;
                        break;
                    case 'topLeft':
                    default:
                        baseX = 0;
                        baseY = 0;
                        break;
                }

                const addX = leavesCfg.offsetX || 0;
                const addY = leavesCfg.offsetY || 0;
                const cropX = baseX + addX;
                const cropY = baseY + addY;

                trunk.setCrop(0, cropY + lh, frameW, frameH - (cropY + lh));

                const leaves = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth(def.leavesDepth ?? def.depth ?? 5)
                    .setCrop(cropX, cropY, lw, lh);

                const dispW = trunk.displayWidth;
                const dispH = trunk.displayHeight;
                const scaleX = trunk.scaleX || 1;
                const scaleY = trunk.scaleY || 1;
                const useScale = !!leavesCfg.useScale;

                const lwWorld = useScale ? lw * scaleX : lw;
                const lhWorld = useScale ? lh * scaleY : lh;

                const anchorSpaceW = useScale ? dispW : frameW;
                const anchorSpaceH = useScale ? dispH : frameH;

                switch (anchor) {
                    case 'center':
                        baseX = (anchorSpaceW - lwWorld) * 0.5;
                        baseY = (anchorSpaceH - lhWorld) * 0.5;
                        break;
                    case 'topCenter':
                        baseX = (anchorSpaceW - lwWorld) * 0.5;
                        baseY = 0;
                        break;
                    case 'bottomCenter':
                        baseX = (anchorSpaceW - lwWorld) * 0.5;
                        baseY = anchorSpaceH - lhWorld;
                        break;
                    case 'bottomLeft':
                        baseX = 0;
                        baseY = anchorSpaceH - lhWorld;
                        break;
                    case 'topLeft':
                    default:
                        baseX = 0;
                        baseY = 0;
                        break;
                }

                const addXWorld = useScale ? addX * scaleX : addX;
                const addYWorld = useScale ? addY * scaleY : addY;
                const topLeftX = trunk.x - dispW * trunk.originX;
                const topLeftY = trunk.y - dispH * trunk.originY;
                const rect = new Phaser.Geom.Rectangle(
                    topLeftX + baseX + addXWorld,
                    topLeftY + baseY + addYWorld,
                    lwWorld,
                    lhWorld,
                );

                scene._treeLeaves = scene._treeLeaves || [];
                const data = { leaves, rect };
                scene._treeLeaves.push(data);
                trunk.once('destroy', () => {
                    leaves.destroy();
                    const idx = scene._treeLeaves.indexOf(data);
                    if (idx !== -1) scene._treeLeaves.splice(idx, 1);
                });

                if (!scene._treeLeavesUpdate) {
                    const playerRect = new Phaser.Geom.Rectangle();
                    scene._treeLeavesUpdate = () => {
                        const pb = scene.player.body;
                        playerRect.x = pb.x;
                        playerRect.y = pb.y;
                        playerRect.width = pb.width;
                        playerRect.height = pb.height;
                        for (const d of scene._treeLeaves) {
                            const overlap =
                                Phaser.Geom.Intersects.RectangleToRectangle(
                                    playerRect,
                                    d.rect,
                                );
                            d.leaves.setAlpha(overlap ? 0.5 : 1);
                        }
                    };
                    // Throttle updates with a timer instead of every frame
                    scene._treeLeavesTimer = scene.time.addEvent({
                        delay: 120,
                        loop: true,
                        callback: scene._treeLeavesUpdate,
                    });
                    scene.events.once('shutdown', () => {
                        try { scene._treeLeavesTimer?.remove(false); } catch {}
                        scene._treeLeavesTimer = null;
                        scene._treeLeaves = [];
                        scene._treeLeavesUpdate = null;
                    });
                }
            }

            if (def.collectible) {
                trunk.setInteractive();
                trunk.on('pointerdown', (pointer) => {
                    if (!pointer.rightButtonDown()) return;
                    const pickupRange = 40;
                    const d2 = Phaser.Math.Distance.Squared(
                        scene.player.x,
                        scene.player.y,
                        trunk.x,
                        trunk.y,
                    );
                    if (d2 > pickupRange * pickupRange) return;

                    if (def.givesItem && scene.uiScene?.inventory) {
                        scene.uiScene.inventory.addItem(
                            def.givesItem,
                            def.giveAmount || 1,
                        );
                    }
                    if (onHarvest) onHarvest(trunk, id, x, y);
                    if (needsPhysics) {
                        try { trunk.destroy(); } catch {}
                    } else if (scene.resourcePool) {
                        scene.resourcePool.release(trunk);
                    } else {
                        trunk.destroy();
                    }
                    if (!noRespawn) {
                        scene.time.delayedCall(
                            Phaser.Math.Between(respawnMin, respawnMax),
                            () => {
                                if (scene.resources.countActive(true) < maxActive)
                                    spawnCluster();
                            },
                        );
                    }
                });
            }
            if (onCreate) onCreate(trunk, id, x, y);
        };

        const spawnCluster = () => {
            const baseId = pickVariantId();
            const baseKey = baseId.replace(/[A-Za-z]$/, '');
            const baseVariants = variants.filter((v) => v.id.startsWith(baseKey));
            const baseTotalWeight = baseVariants.reduce(
                (s, v) => s + (v.weight || 0),
                0,
            );
            const pickBaseVariant = () => {
                let r = Math.random() * baseTotalWeight;
                for (const v of baseVariants) {
                    r -= v.weight || 0;
                    if (r <= 0) return v.id;
                }
                return baseVariants[0].id;
            };

            const firstId = pickBaseVariant();
            const firstDef = RESOURCE_DB[firstId];
            if (!firstDef) return 0;

            const firstTex = scene.textures.get(
                firstDef.world?.textureKey || firstId,
            );
            const src = firstTex.getSourceImage();
            const scale = firstDef.world?.scale ?? 1;
            const width = src.width * scale;
            const height = src.height * scale;

            let x,
                y,
                tries = 30;
            do {
                x = Phaser.Math.Between(minX, maxX);
                y = Phaser.Math.Between(minY, maxY);
                tries--;
            } while (tries > 0 && tooClose(x, y, width, height));
            if (tries <= 0) return 0;

            createResourceAt(firstId, firstDef, x, y);
            let spawned = 1;

            const clusterCount = Phaser.Math.Between(clusterMin, clusterMax);
            const radius =
                groupCfg.clusterRadius ?? Math.max(width, height) * 1.1;
            for (
                let i = 1;
                i < clusterCount && scene.resources.countActive(true) < maxActive;
                i++
            ) {
                const id = pickBaseVariant();
                const def = RESOURCE_DB[id];
                if (!def) continue;

                const tex = scene.textures.get(def.world?.textureKey || id);
                const src2 = tex.getSourceImage();
                const scale2 = def.world?.scale ?? 1;
                const w = src2.width * scale2;
                const h = src2.height * scale2;

                let x2,
                    y2,
                    t2 = 10;
                do {
                    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    x2 = x + Math.cos(ang) * radius;
                    y2 = y + Math.sin(ang) * radius;
                    t2--;
                } while (t2 > 0 && tooClose(x2, y2, w, h));
                if (t2 <= 0) continue;
                createResourceAt(id, def, x2, y2);
                spawned++;
            }

            return spawned;
        };

        let spawned = 0,
            attempts = 0;
        while (spawned < maxActive && attempts < maxActive * 10) {
            spawned += spawnCluster();
            attempts++;
        }
        return spawned;
    }

    // ----- Dev Helpers -----
    function spawnWorldItem(id, pos) {
        const def = RESOURCE_DB[id];
        if (!def) return;
        const obj = scene.add
            .image(pos.x, pos.y, def.world?.textureKey || id)
            .setDepth(def.depth ?? 5)
            .setScale(def.world?.scale ?? 1);
        scene.physics.add.existing(obj);
        obj.body.setAllowGravity(false);
    }

    // Expose API on the scene; return nothing to avoid top-level return issues
    scene.resourceSystem = {
        spawnAllResources,
        spawnWorldItem,
        spawnChunkResources,
        cancelChunkJob: _cancelChunkJob,
    };
