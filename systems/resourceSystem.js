// systems/resourceSystem.js
// Handles world resource spawning via chunk events.
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';
import { CHUNK_WIDTH, CHUNK_HEIGHT } from './worldGen/ChunkManager.js';

export default function createResourceSystem(scene) {
    const chunkResources = new Map();

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
    };

    scene.events.on('chunk:activate', onActivate);
    scene.events.on('chunk:deactivate', onDeactivate);
    scene.events.once('shutdown', () => {
        scene.events.off('chunk:activate', onActivate);
        scene.events.off('chunk:deactivate', onDeactivate);
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
        const count = groupCfg.maxActive || 0;
        const results = [];
        for (let i = 0; i < count; i++) {
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
            const x = rng.between(minX, maxX);
            const y = rng.between(minY, maxY);
            const obj = _createResource(id, def, x, y);
            obj.setData('chunkX', chunkX);
            obj.setData('chunkY', chunkY);
            results.push(obj);
        }
        return results;
    }

    function _createResource(id, def, x, y) {
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
        if (def.tags?.includes('bush')) trunk.setData('bush', true);
        if (trunk.body) {
            trunk.body.setAllowGravity(false);
            trunk.body.setImmovable(true);
            trunk.body.moves = false;
        }
        return trunk;
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
