// systems/pools/resourcePool.js
// Object pool for world resources (trees, rocks, bushes).

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
        const chunk = obj.getData('chunk');
        if (chunk && chunk.group) {
            chunk.group.remove(obj, false);
        }
        // If this is a non-physics decor object, just destroy it
        if (!obj.body) {
            try { obj.destroy(); } catch {}
            return;
        }
        // If this is a static physics body (StaticGroup), don't pool; destroy
        if (obj.body && obj.body.moves === false) {
            try { obj.destroy(); } catch {}
            return;
        }
        scene.resources.remove(obj, false);
        obj.body && obj.body.stop && obj.body.stop();
        if (obj.body) obj.body.enable = false;
        const top = obj.getData('topSprite');
        if (top && top.destroy) top.destroy();
        const overlayCleanup = obj.getData('overlayCleanup');
        if (typeof overlayCleanup === 'function') {
            try { overlayCleanup(); } catch {}
        } else {
            const overlay = obj.getData('overlaySprite');
            if (overlay && overlay.destroy) {
                try { overlay.destroy(); } catch {}
            }
        }
        obj.removeFromDisplayList();
        obj.setActive(false).setVisible(false);
        obj.setData('chunk', null);
        obj.setData('chunkIdx', null);
        obj.setData('topSprite', null);
        obj.setData('overlaySprite', null);
        obj.setData('overlayCleanup', null);
        pool.push(obj);
    }

    function size() {
        return pool.length;
    }

    return { acquire, release, size };
}
