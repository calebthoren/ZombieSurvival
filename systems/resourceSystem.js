// systems/resourceSystem.js
// Handles world resource spawning in a Phaser-agnostic way.
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';

export default function createResourceSystem(scene) {
    const chunkResources = new Map();
    const chunkRespawns = new Map();
    const leafOverlaps = [];

    const onActivate = ({ chunkX, chunkY, rng }) => {
        const key = `${chunkX},${chunkY}`;
        if (chunkResources.has(key)) return;

        const all = WORLD_GEN?.spawns?.resources;
        if (!all) return;

        for (const [key, cfg] of Object.entries(all))
            _spawnResourceGroup(key, cfg);

        if (!scene._resourcesCollider) {
            scene._resourcesCollider = scene.physics.add.collider(
                scene.player,
                scene.resources,
                null,
                (player, obj) => !!obj.getData('blocking'),
                scene,
            );
        }

        if (!scene._bushSlowOverlap) {
            const markBush = (ent, obj) => {
                if (obj.getData('bush')) ent._inBush = true;
            };
            scene._bushSlowOverlap = [
                scene.physics.add.overlap(scene.player, scene.resources, markBush, null, scene),
                scene.physics.add.overlap(scene.zombies, scene.resources, markBush, null, scene),
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

    function _ensureLeavesUpdate() {
        if (scene._leavesOverlapUpdate) return;
        scene._leavesOverlapUpdate = () => {
            const p = scene.player;
            if (!p?.body) return;
            const b = p.body;
            const px = b.x;
            const py = b.y;
            const pr = px + b.width;
            const pb = py + b.height;
            for (let i = 0; i < leafOverlaps.length; i++) {
                const { leaves, rect } = leafOverlaps[i];
                leaves.alpha =
                    px < rect.right &&
                    pr > rect.x &&
                    py < rect.bottom &&
                    pb > rect.y
                        ? 0.5
                        : 1;
            }
        };
        scene.events.on('update', scene._leavesOverlapUpdate);
        scene.events.once('shutdown', () => {
            scene.events.off('update', scene._leavesOverlapUpdate);
            scene._leavesOverlapUpdate = null;
            leafOverlaps.length = 0;
        });
    }

    function _spawnGroup(groupKey, groupCfg, rng, minX, maxX, minY, maxY, chunkX, chunkY) {
        const variants = Array.isArray(groupCfg?.variants) ? groupCfg.variants : null;
        if (!variants || variants.length === 0) return [];
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);
        const totalChunks =
            (WORLD_GEN.world.width / CHUNK_WIDTH) *
            (WORLD_GEN.world.height / CHUNK_HEIGHT);
        const clustersPerChunk = Math.max(
            1,
            Math.floor((groupCfg.maxActive || 0) / totalChunks),
        );
        const minSpacing = groupCfg.minSpacing || 0;
        const minSpacingSq = minSpacing * minSpacing;
        const clusterMin = groupCfg.clusterMin || 1;
        const clusterMax = groupCfg.clusterMax || clusterMin;
        const results = [];
        const existing = scene.resources.getChildren();
        for (let c = 0; c < clustersPerChunk; c++) {
            let cx = 0;
            let cy = 0;
            let valid = false;
            for (let attempt = 0; attempt < 4 && !valid; attempt++) {
                cx = rng.between(minX, maxX);
                cy = rng.between(minY, maxY);
                valid = true;
                if (minSpacing > 0) {
                    for (let j = 0; j < existing.length; j++) {
                        const obj = existing[j];
                        const dx = obj.x - cx;
                        const dy = obj.y - cy;
                        if (dx * dx + dy * dy < minSpacingSq) {
                            valid = false;
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

                    if (bodyCfg.kind === 'circle') {
                        trunk.body.setCircle(br, ox, oy);
                    } else {
                        trunk.body.setSize(bw, bh);
                        trunk.body.setOffset(ox, oy);
                    }
                    trunk.body.setImmovable(blocking);
                } else {
                    if (blocking) {
                        trunk.body.setImmovable(true);
                    } else {
                        if (trunk.getData('bush')) {
                            const r =
                                Math.min(
                                    trunk.displayWidth,
                                    trunk.displayHeight,
                                ) * 0.45; // shrink hitbox by 10%
                            const ox = trunk.displayWidth * 0.5 - r;
                            const oy = trunk.displayHeight * 0.5 - r;
                            trunk.body.setCircle(r, ox, oy);
                        } else {
                            trunk.body.setSize(trunk.displayWidth, trunk.displayHeight);
                            trunk.body.setOffset(0, 0);
                        }
                        trunk.body.setImmovable(true);
                    }
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
                    scene.events.on('update', scene._treeLeavesUpdate);
                    scene.events.once('shutdown', () => {
                        scene.events.off('update', scene._treeLeavesUpdate);
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
                    trunk.destroy();
                    scene.time.delayedCall(
                        Phaser.Math.Between(respawnMin, respawnMax),
                        () => {
                            if (scene.resources.countActive(true) < maxActive)
                                spawnCluster();
                        },
                    );
                });
            }
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

    function _createResource(id, def, x, y, groupKey, chunkX, chunkY) {
        const originX = def.world?.origin?.x ?? 0.5;
        const originY = def.world?.origin?.y ?? 0.5;
        const scale = def.world?.scale ?? 1;
        const texKey = def.world?.textureKey || id;

        const trunk = scene.resources
            .create(x, y, texKey)
            .setOrigin(originX, originY)
            .setScale(scale)
            .setDepth(def.trunkDepth ?? def.depth ?? 5);

        trunk.setData('chunkX', chunkX);
        trunk.setData('chunkY', chunkY);

        const leavesCfg = def.world?.leaves;
        if (leavesCfg) {
            const frameW = trunk.width;
            const frameH = trunk.height;
            const leavesH = leavesCfg.height;
            trunk.setCrop(0, leavesH, frameW, frameH - leavesH);

            const scaleMul = leavesCfg.useScale ? scale : 1;
            const trunkTopY = y - (frameH - leavesH) * scale;
            const lx = x + (leavesCfg.offsetX || 0) * scaleMul;
            const ly =
                trunkTopY - leavesH * scaleMul + (leavesCfg.offsetY || 0) * scaleMul;
            const leaves = scene.add
                .image(lx, ly, texKey)
                .setOrigin(0.5, 0)
                .setScale(scale)
                .setDepth(def.leavesDepth ?? (scene.player?.depth ?? 900) + 2)
                .setCrop(0, 0, leavesCfg.width, leavesCfg.height);
            const rect = {
                x: lx - (leavesCfg.width * scaleMul) / 2,
                y: ly,
                right: lx + (leavesCfg.width * scaleMul) / 2,
                bottom: ly + leavesCfg.height * scaleMul,
            };
            leafOverlaps.push({ leaves, rect });
            _ensureLeavesUpdate();
            trunk.once('destroy', () => {
                leaves.destroy();
                const idx = leafOverlaps.findIndex((e) => e.leaves === leaves);
                if (idx !== -1) leafOverlaps.splice(idx, 1);
                if (leafOverlaps.length === 0 && scene._leavesOverlapUpdate) {
                    scene.events.off('update', scene._leavesOverlapUpdate);
                    scene._leavesOverlapUpdate = null;
                }
            });
        }

        const blocking = !!def.blocking;
        trunk.setData('blocking', blocking);
        if (blocking && def.tags?.includes('rock')) {
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

        let spawned = 0,
            attempts = 0;
        while (spawned < maxActive && attempts < maxActive * 10) {
            spawned += spawnCluster();
            attempts++;

        }
    }

    // ----- Dev Helpers -----
    function _scheduleRespawn(groupKey, id, chunkX, chunkY, x, y) {
        const cfg = WORLD_GEN?.spawns?.resources?.[groupKey];
        const delayCfg = cfg?.respawnDelayMs;
        if (!delayCfg) return;
        const delay = Phaser.Math.Between(
            delayCfg.min || 0,
            delayCfg.max || delayCfg.min || 0,
        );
        const timer = scene.time.delayedCall(delay, () => {
            const def = RESOURCE_DB[id];
            if (!def) return;
            const obj = _createResource(id, def, x, y, groupKey, chunkX, chunkY);
            const key = `${chunkX},${chunkY}`;
            const list = chunkResources.get(key);
            if (list) list.push(obj);
            const arr = chunkRespawns.get(key);
            if (arr) {
                const idx = arr.indexOf(timer);
                if (idx !== -1) arr.splice(idx, 1);
                if (arr.length === 0) chunkRespawns.delete(key);
            }
        });
        const key = `${chunkX},${chunkY}`;
        let arr = chunkRespawns.get(key);
        if (!arr) {
            arr = [];
            chunkRespawns.set(key, arr);
        }
        arr.push(timer);
    }

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

    return { spawnAllResources, spawnWorldItem };
}
