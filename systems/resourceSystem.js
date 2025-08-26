// systems/resourceSystem.js
// Handles world resource spawning via chunk events.
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from './worldGen/ChunkManager.js';

export default function createResourceSystem(scene) {
    const chunkResources = new Map();
    const chunkRespawns = new Map();

    const onActivate = ({ chunkX, chunkY, rng }) => {
        const key = `${chunkX},${chunkY}`;
        if (chunkResources.has(key)) return;
        const all = WORLD_GEN?.spawns?.resources;
        if (!all) return;
        const minX = chunkX * CHUNK_WIDTH;
        const minY = chunkY * CHUNK_HEIGHT;
        const maxX = minX + CHUNK_WIDTH;
        const maxY = minY + CHUNK_HEIGHT;
        const list = [];
        for (const [gk, cfg] of Object.entries(all)) {
            list.push(
                ..._spawnGroup(gk, cfg, rng, minX, maxX, minY, maxY, chunkX, chunkY),
            );
        }
        chunkResources.set(key, list);
        _ensureColliders();
    };

    const onDeactivate = ({ chunkX, chunkY }) => {
        const key = `${chunkX},${chunkY}`;
        const list = chunkResources.get(key);
        if (list) {
            for (const obj of list) obj.destroy();
            chunkResources.delete(key);
        }
        const timers = chunkRespawns.get(key);
        if (timers) {
            for (const t of timers) t.remove(false);
            chunkRespawns.delete(key);
        }
    };

    scene.events.on('chunk:activate', onActivate);
    scene.events.on('chunk:deactivate', onDeactivate);
    scene.events.once('shutdown', () => {
        scene.events.off('chunk:activate', onActivate);
        scene.events.off('chunk:deactivate', onDeactivate);
        for (const timers of chunkRespawns.values()) {
            for (const t of timers) t.remove(false);
        }
        chunkRespawns.clear();
    });

    function _ensureColliders() {
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
                        }
                    }
                }
            }
            if (!valid) continue;
            const clusterSize = rng.between(clusterMin, clusterMax);
            const radius = minSpacing * 0.5;
            for (let i = 0; i < clusterSize; i++) {
                let r = rng.frac() * totalWeight;
                let id = variants[0].id;
                for (const v of variants) {
                    r -= v.weight || 0;
                    if (r <= 0) {
                        id = v.id;
                        break;
                    }
                }
                const def = RESOURCE_DB[id];
                if (!def) continue;
                const ang = rng.angle();
                const dist = radius * rng.frac();
                const x = cx + Math.cos(ang) * dist;
                const y = cy + Math.sin(ang) * dist;
                const obj = _createResource(id, def, x, y, groupKey, chunkX, chunkY);
                results.push(obj);
                existing.push(obj);
            }
        }
        return results;
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

        const blocking = !!def.blocking;
        trunk.setData('blocking', blocking);
        trunk.setData('chunkX', chunkX);
        trunk.setData('chunkY', chunkY);
        trunk.setData('id', id);
        trunk.setData('group', groupKey);
        if (def.tags?.includes('bush')) trunk.setData('bush', true);
        if (trunk.body) {
            if (trunk.body.setAllowGravity) trunk.body.setAllowGravity(false);
            if (trunk.body.setImmovable) trunk.body.setImmovable(true);
            if ('moves' in trunk.body) trunk.body.moves = false;
        }

        if (def.collectible) {
            trunk.setInteractive();
            trunk.on('pointerdown', (pointer) => {
                if (!pointer?.rightButtonDown || !pointer.rightButtonDown()) return;
                const dx = scene.player.x - trunk.x;
                const dy = scene.player.y - trunk.y;
                if (dx * dx + dy * dy > 40 * 40) return;
                if (def.givesItem) {
                    scene.addItemToInventory(def.givesItem, def.giveAmount ?? 1);
                }
                const cx = trunk.getData('chunkX');
                const cy = trunk.getData('chunkY');
                const key = `${cx},${cy}`;
                const list = chunkResources.get(key);
                if (list) {
                    const idx = list.indexOf(trunk);
                    if (idx !== -1) list.splice(idx, 1);
                }
                _scheduleRespawn(groupKey, id, cx, cy, trunk.x, trunk.y);
                trunk.destroy();
            });
        }
        return trunk;
    }

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

    return { spawnWorldItem };
}
