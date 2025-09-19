// systems/pools/resourcePool.js
// Object pool for world resources (trees, rocks, bushes).

export function cleanupResourceLayers(obj) {
    if (!obj || typeof obj.getData !== 'function') return;

    const canSetData = typeof obj.setData === 'function';

    const overlayCleanup = obj.getData('overlayCleanup');
    if (typeof overlayCleanup === 'function') {
        if (typeof obj.off === 'function') {
            obj.off('destroy', overlayCleanup);
        }
        if (canSetData) obj.setData('overlayCleanup', null);
        overlayCleanup();
    } else {
        const overlay = obj.getData('overlaySprite');
        if (
            overlay &&
            typeof overlay.destroy === 'function' &&
            (overlay.scene || overlay.active !== false)
        ) {
            overlay.destroy();
        }
    }
    if (canSetData) obj.setData('overlaySprite', null);

    const topDestroy = obj.getData('topSpriteDestroy');
    if (typeof topDestroy === 'function' && typeof obj.off === 'function') {
        obj.off('destroy', topDestroy);
    }
    const top = obj.getData('topSprite');
    if (top && typeof top.destroy === 'function' && (top.scene || top.active !== false)) {
        top.destroy();
    }
    if (canSetData) {
        obj.setData('topSprite', null);
        obj.setData('topSpriteDestroy', null);
    }
}

export default function createResourcePool(scene) {
    const pool = [];

    function acquire(texKey) {
        const obj = pool.pop();
        if (obj) {
            scene.resources.add(obj, true);
            obj
                .setTexture(texKey)
                .setActive(true)
                .setVisible(true);
            obj.body && (obj.body.enable = true);
            return obj;
        }
        const res = scene.resources.create(0, 0, texKey);
        return res;
    }

    function release(obj) {
        if (!obj) return;
        const chunk = typeof obj.getData === 'function' ? obj.getData('chunk') : null;
        if (chunk && chunk.group && typeof chunk.group.remove === 'function') {
            chunk.group.remove(obj, false);
        }
        cleanupResourceLayers(obj);
        const body = obj.body || null;
        const hasScene = !!obj.scene;
        const isActive = obj.active !== false;
        const shouldDestroy = !body || body.moves === false;
        if (shouldDestroy) {
            if (hasScene && isActive && typeof obj.destroy === 'function') {
                obj.destroy();
            }
            return;
        }
        if (scene.resources && typeof scene.resources.remove === 'function') {
            scene.resources.remove(obj, false);
        }
        if (body && body.enable !== false && typeof body.stop === 'function') {
            body.stop();
        }
        if (body) body.enable = false;
        if (typeof obj.removeFromDisplayList === 'function') {
            obj.removeFromDisplayList();
        }
        if (typeof obj.setActive === 'function') obj.setActive(false);
        else obj.active = false;
        if (typeof obj.setVisible === 'function') obj.setVisible(false);
        else obj.visible = false;
        if (typeof obj.setData === 'function') {
            obj.setData('chunk', null);
            obj.setData('chunkIdx', null);
            obj.setData('overlayCleanup', null);
            obj.setData('overlaySprite', null);
            obj.setData('topSprite', null);
            obj.setData('topSpriteDestroy', null);
        }
        if (!pool.includes(obj)) pool.push(obj);
    }

    function size() {
        return pool.length;
    }

    return { acquire, release, size };
}
