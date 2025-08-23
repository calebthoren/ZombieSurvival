// systems/resourceSystem.js
// Handles world resource spawning in a Phaser-agnostic way.
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';

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
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);

        const w = scene.sys.game.config.width;
        const h = scene.sys.game.config.height;
        const minX = 100,
            maxX = w - 100,
            minY = 100,
            maxY = h - 100;

        const tooClose = (x, y) => {
            return scene.resources.getChildren().some((c) => {
                if (!c.active) return false;
                const dx = c.x - x,
                    dy = c.y - y;
                return dx * dx + dy * dy < minSpacing * minSpacing;
            });
        };

        const pickVariantId = () => {
            let r = Math.random() * totalWeight;
            for (let v of variants) {
                r -= v.weight || 0;
                if (r <= 0) return v.id;
            }
            return variants[0].id;
        };

        const spawnOne = () => {
            let x,
                y,
                tries = 30;
            do {
                x = Phaser.Math.Between(minX, maxX);
                y = Phaser.Math.Between(minY, maxY);
                tries--;
            } while (tries > 0 && tooClose(x, y));
            if (tries <= 0) return;

            const id = pickVariantId();
            const def = ITEM_DB[id];
            if (!def) return;

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
                    if (blocking) obj.body.setImmovable(true);
                    else {
                        obj.body.setSize(obj.displayWidth, obj.displayHeight);
                        obj.body.setOffset(0, 0);
                        obj.body.setImmovable(true);
                    }
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
                                spawnOne();
                        },
                    );
                });
            }
        };

        for (let i = 0; i < maxActive; i++) spawnOne();
    }

    // ----- Dev Helpers -----
    function spawnWorldItem(id, pos) {
        const def = ITEM_DB[id];
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
