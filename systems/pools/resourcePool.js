// systems/pools/resourcePool.js
// Object pool for world resources (trees, rocks, bushes).

import DevTools from '../DevTools.js';

function shouldLogResourceDebug() {
    return (
        !!DevTools &&
        typeof DevTools.shouldLogResourcePool === 'function' &&
        DevTools.shouldLogResourcePool()
    );
}

function logResourceDebug(message, obj) {
    if (!shouldLogResourceDebug()) return;
    console.warn(`[ResourcePool] ${message}`, obj);
}

function isGameObjectDestroyed(obj) {
    return !!obj && obj.active === false && !obj.scene;
}

export function safeDestroyResourceSprite(obj, label = 'resource sprite') {
    if (!obj || typeof obj.destroy !== 'function') return false;
    if (isGameObjectDestroyed(obj)) {
        logResourceDebug(`${label} was already destroyed`, obj);
        return false;
    }
    obj.destroy();
    return true;
}

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
        if (overlay && typeof overlay.destroy === 'function') {
            safeDestroyResourceSprite(overlay, 'resource overlay');
        }
    }
    if (canSetData) obj.setData('overlaySprite', null);

    const topDestroy = obj.getData('topSpriteDestroy');
    if (typeof topDestroy === 'function' && typeof obj.off === 'function') {
        obj.off('destroy', topDestroy);
    }
    const top = obj.getData('topSprite');
    if (top && typeof top.destroy === 'function') {
        safeDestroyResourceSprite(top, 'resource top sprite');
    }
    if (canSetData) {
        obj.setData('topSprite', null);
        obj.setData('topSpriteDestroy', null);
    }
}

export default function createResourcePool(scene) {
    const pool = [];

    function destroyStaticResource(obj) {
        if (!obj) return;

        if (scene.resources && typeof scene.resources.remove === 'function') {
            scene.resources.remove(obj, false);
        }

        const body = obj.body || null;
        if (body) {
            if (body.enable !== false && typeof body.stop === 'function') {
                body.stop();
            }
            body.enable = false;
        }

        let overlay = null;
        let overlayCleanup = null;
        let top = null;
        if (typeof obj.getData === 'function') {
            overlay = obj.getData('overlaySprite');
            overlayCleanup = obj.getData('overlayCleanup');
            top = obj.getData('topSprite');
        }

        if (typeof obj.setData === 'function') {
            obj.setData('chunk', null);
            obj.setData('chunkIdx', null);
            obj.setData('overlayCleanup', null);
            obj.setData('overlaySprite', null);
            obj.setData('topSprite', null);
            obj.setData('topSpriteDestroy', null);
        }

        if (shouldLogResourceDebug() && (overlay || overlayCleanup || top)) {
            logResourceDebug('destroyStaticResource() found lingering overlays', {
                overlay,
                overlayCleanup,
                top,
            });
        }

        safeDestroyResourceSprite(obj, 'resource sprite');
    }

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
        if (isGameObjectDestroyed(obj)) {
            logResourceDebug('release() received a destroyed sprite', obj);
            return;
        }
        cleanupResourceLayers(obj);
        const body = obj.body || null;
        const shouldDestroy = !body || body.moves === false;
        if (shouldDestroy) {
            destroyStaticResource(obj);
            return;
        }
        if (typeof obj.getData === 'function') {
            const overlay = obj.getData('overlaySprite');
            const overlayCleanup = obj.getData('overlayCleanup');
            const top = obj.getData('topSprite');
            if (shouldLogResourceDebug() && (overlay || overlayCleanup || top)) {
                logResourceDebug('release() pooling sprite with lingering overlays', {
                    overlay,
                    overlayCleanup,
                    top,
                });
            }
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
