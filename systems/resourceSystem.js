// systems/resourceSystem.js
// Handles world resource spawning in a Phaser-agnostic way.
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';

export default function createResourceSystem(scene) {
    // ----- Public API -----
    function spawnAllResources() {
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

    // ----- Internal Helpers -----
    function _spawnResourceGroup(groupKey, groupCfg) {
        const variants = Array.isArray(groupCfg?.variants)
            ? groupCfg.variants
            : null;
        if (!variants || variants.length === 0) return;

        const maxActive =
            groupCfg.maxActive ??
            Phaser.Math.Between(
                groupCfg.minCount ?? 8,
                groupCfg.maxCount ?? 12,
            );
        const minSpacing = groupCfg.minSpacing ?? 48;
        const respawnMin = groupCfg.respawnDelayMs?.min ?? 5000;
        const respawnMax = groupCfg.respawnDelayMs?.max ?? 7000;
        const clusterMax = groupCfg.clusterMax ?? 3;
        const clusterRadius = groupCfg.clusterRadius ?? minSpacing * 2;
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);

        const w = scene.sys.game.config.width;
        const h = scene.sys.game.config.height;
        const minX = 100,
            maxX = w - 100,
            minY = 100,
            maxY = h - 100;

        const tooClose = (x, y, w, h) => {
            const children = scene.resources.getChildren();
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                if (!c.active) continue;
                const halfW = (c.displayWidth + w) * 0.5;
                const halfH = (c.displayHeight + h) * 0.5;
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

            const obj = scene.resources
                .create(x, y, def.world?.textureKey || id)
                .setOrigin(originX, originY)
                .setScale(scale)
                .setDepth(def.depth ?? 5);

            const blocking = !!def.blocking;
            obj.setData('blocking', blocking);

            if (def.tags?.includes('bush')) obj.setData('bush', true);

            const bodyCfg = def.world?.body;
            if (obj.body) {
                obj.body.setAllowGravity(false);

                if (bodyCfg) {
                    const frameW = obj.width;
                    const frameH = obj.height;
                    const dispW = obj.displayWidth;
                    const dispH = obj.displayHeight;

                    const scaleX = obj.scaleX || 1;
                    const scaleY = obj.scaleY || 1;
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

                    if (bodyCfg.kind === 'circle') {
                        obj.body.setCircle(br, ox, oy);
                    } else {
                        obj.body.setSize(bw, bh);
                        obj.body.setOffset(ox, oy);
                    }
                    obj.body.setImmovable(blocking);
                } else {
                    if (blocking) {
                        obj.body.setImmovable(true);
                    } else {
                        if (obj.getData('bush')) {
                            const r = Math.min(
                                obj.displayWidth,
                                obj.displayHeight,
                            ) * 0.5;
                            const ox = obj.displayWidth * 0.5 - r;
                            const oy = obj.displayHeight * 0.5 - r;
                            obj.body.setCircle(r, ox, oy);
                        } else {
                            obj.body.setSize(obj.displayWidth, obj.displayHeight);
                            obj.body.setOffset(0, 0);
                        }
                        obj.body.setImmovable(true);
                    }
                }
            }

            // Precompute leaf overlap rectangle for transparency
            const leavesCfg = def.world?.leaves;
            if (leavesCfg) {
                const frameW = obj.width;
                const frameH = obj.height;
                const dispW = obj.displayWidth;
                const dispH = obj.displayHeight;

                const scaleX = obj.scaleX || 1;
                const scaleY = obj.scaleY || 1;
                const useScale = !!leavesCfg.useScale;

                const lw = useScale ? leavesCfg.width * scaleX : leavesCfg.width;
                const lh = useScale
                    ? leavesCfg.height * scaleY
                    : leavesCfg.height;

                const anchorSpaceW = useScale ? dispW : frameW;
                const anchorSpaceH = useScale ? dispH : frameH;

                const anchor = leavesCfg.anchor || 'topLeft';
                let baseX = 0,
                    baseY = 0;
                switch (anchor) {
                    case 'center':
                        baseX = (anchorSpaceW - lw) * 0.5;
                        baseY = (anchorSpaceH - lh) * 0.5;
                        break;
                    case 'topCenter':
                        baseX = (anchorSpaceW - lw) * 0.5;
                        baseY = 0;
                        break;
                    case 'bottomCenter':
                        baseX = (anchorSpaceW - lw) * 0.5;
                        baseY = anchorSpaceH - lh;
                        break;
                    case 'bottomLeft':
                        baseX = 0;
                        baseY = anchorSpaceH - lh;
                        break;
                    case 'topLeft':
                    default:
                        baseX = 0;
                        baseY = 0;
                        break;
                }

                const addX = useScale
                    ? (leavesCfg.offsetX || 0) * scaleX
                    : leavesCfg.offsetX || 0;
                const addY = useScale
                    ? (leavesCfg.offsetY || 0) * scaleY
                    : leavesCfg.offsetY || 0;

                const topLeftX = obj.x - dispW * obj.originX;
                const topLeftY = obj.y - dispH * obj.originY;

                const rect = new Phaser.Geom.Rectangle(
                    topLeftX + baseX + addX,
                    topLeftY + baseY + addY,
                    lw,
                    lh,
                );

                scene._treeLeaves = scene._treeLeaves || [];
                scene._treeLeaves.push({ tree: obj, rect });
                if (!scene._treeLeavesUpdate) {
                    scene._treeLeavesUpdate = () => {
                        const pb = scene.player.body;
                        for (const data of scene._treeLeaves) {
                            const overlap =
                                Phaser.Geom.Intersects.RectangleToRectangle(
                                    pb,
                                    data.rect,
                                );
                            data.tree.setAlpha(overlap ? 0.5 : 1);
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
                obj.setInteractive();
                obj.on('pointerdown', (pointer) => {
                    if (!pointer.rightButtonDown()) return;
                    const pickupRange = 40;
                    const d2 = Phaser.Math.Distance.Squared(
                        scene.player.x,
                        scene.player.y,
                        obj.x,
                        obj.y,
                    );
                    if (d2 > pickupRange * pickupRange) return;

                    if (def.givesItem && scene.uiScene?.inventory) {
                        scene.uiScene.inventory.addItem(
                            def.givesItem,
                            def.giveAmount || 1,
                        );
                    }
                    obj.destroy();
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
            const id = pickVariantId();
            const def = RESOURCE_DB[id];
            if (!def) return 0;

            const tex = scene.textures.get(def.world?.textureKey || id);
            const src = tex.getSourceImage();
            const scale = def.world?.scale ?? 1;
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

            createResourceAt(id, def, x, y);
            let spawned = 1;

            const clusterCount = Phaser.Math.Between(1, clusterMax);
            for (
                let i = 1;
                i < clusterCount && scene.resources.countActive(true) < maxActive;
                i++
            ) {
                let x2,
                    y2,
                    t2 = 10;
                do {
                    x2 =
                        x + Phaser.Math.Between(-clusterRadius, clusterRadius);
                    y2 =
                        y + Phaser.Math.Between(-clusterRadius, clusterRadius);
                    t2--;
                } while (t2 > 0 && tooClose(x2, y2, width, height));
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

    return { spawnAllResources, spawnWorldItem };
}
