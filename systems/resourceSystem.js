// systems/resourceSystem.js
// Handles world resource spawning via chunk events.
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';

export default function createResourceSystem(scene) {
    const chunkResources = new Map();

    const onActivate = (chunkMeta) => {
        const { chunkX, chunkY, resources } = chunkMeta;
        const key = `${chunkX},${chunkY}`;
        if (chunkResources.has(key)) return;
        const list = [];
        for (const r of resources || []) {
            const def = RESOURCE_DB[r.id];
            if (!def) continue;
            const obj = _createResource(r.id, def, r.x, r.y);
            obj.setData('chunkX', chunkX);
            obj.setData('chunkY', chunkY);
            list.push(obj);
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
                trunk.destroy();
            });
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
