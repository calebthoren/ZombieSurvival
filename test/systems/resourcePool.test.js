import test from 'node:test';
import assert from 'node:assert/strict';

import createResourcePool from '../../systems/pools/resourcePool.js';

function createLayer(name) {
    return {
        name,
        active: true,
        scene: {},
        destroyed: false,
        destroy() {
            this.destroyed = true;
            this.active = false;
            this.scene = null;
        },
    };
}

function createTrunk({ body = null, scene } = {}) {
    const data = new Map();
    const events = new Map();
    if (body && typeof body.enable === 'undefined') {
        body.enable = true;
    }
    return {
        active: true,
        visible: true,
        scene: scene || {},
        body,
        destroyCount: 0,
        removed: false,
        getData(key) {
            return data.get(key);
        },
        setData(key, value) {
            data.set(key, value);
            return this;
        },
        setActive(value) {
            this.active = value;
            return this;
        },
        setVisible(value) {
            this.visible = value;
            return this;
        },
        setTexture() {
            return this;
        },
        setOrigin() {
            return this;
        },
        setScale() {
            return this;
        },
        setDepth() {
            return this;
        },
        setPosition() {
            return this;
        },
        removeFromDisplayList() {
            this.removed = true;
            return this;
        },
        once(event, cb) {
            events.set(event, cb);
            return this;
        },
        off(event, cb) {
            const stored = events.get(event);
            if (stored === cb) {
                events.delete(event);
            }
            return this;
        },
        destroy() {
            this.destroyCount += 1;
            this.scene = null;
            this.active = false;
            this.visible = false;
            return this;
        },
    };
}

function attachVisuals(trunk) {
    const overlaySprite = createLayer('overlay');
    const topSprite = createLayer('top');
    const cleanup = () => {
        overlaySprite.destroy();
    };
    const destroyTop = () => {
        topSprite.destroy();
    };
    trunk.setData('overlaySprite', overlaySprite);
    trunk.setData('overlayCleanup', cleanup);
    trunk.once('destroy', cleanup);
    trunk.setData('topSprite', topSprite);
    trunk.setData('topSpriteDestroy', destroyTop);
    trunk.once('destroy', destroyTop);
    return { overlaySprite, topSprite };
}

function createScene() {
    const addCalls = [];
    const removeCalls = [];
    return {
        resources: {
            add(obj) {
                addCalls.push(obj);
            },
            remove(obj, disable) {
                removeCalls.push({ obj, disable });
            },
            create() {
                throw new Error('not expected in test');
            },
        },
        _adds: addCalls,
        _removes: removeCalls,
    };
}

test('resource pool release cleans up resources deterministically', () => {
    const scene = createScene();
    const pool = createResourcePool(scene);

    const decor = createTrunk({ scene });
    attachVisuals(decor);
    const decorChunkGroup = {
        calls: 0,
        remove(obj, reset) {
            this.calls += 1;
            this.last = { obj, reset };
        },
    };
    decor.setData('chunk', { group: decorChunkGroup });

    assert.equal(pool.size(), 0);
    pool.release(decor);
    assert.equal(pool.size(), 0);
    assert.equal(decor.destroyCount, 1);
    assert.equal(decorChunkGroup.calls, 1);
    assert.equal(decor.getData('overlaySprite'), null);
    assert.equal(decor.getData('topSprite'), null);

    pool.release(decor);
    assert.equal(pool.size(), 0);
    assert.equal(decor.destroyCount, 1);

    const staticBody = { moves: false, enable: true };
    const staticObj = createTrunk({ scene, body: staticBody });
    attachVisuals(staticObj);
    pool.release(staticObj);
    assert.equal(pool.size(), 0);
    assert.equal(staticObj.destroyCount, 1);

    const dynamicBody = {
        moves: true,
        enable: true,
        stopCalled: 0,
        stop() {
            this.stopCalled += 1;
        },
    };
    const dynamicObj = createTrunk({ scene, body: dynamicBody });
    attachVisuals(dynamicObj);
    dynamicObj.setData('chunk', { group: { remove() {} } });

    pool.release(dynamicObj);
    assert.equal(pool.size(), 1);
    assert.equal(dynamicObj.destroyCount, 0);
    assert.equal(dynamicBody.stopCalled, 1);
    assert.equal(dynamicObj.active, false);

    pool.release(dynamicObj);
    assert.equal(pool.size(), 1);
    assert.equal(dynamicBody.stopCalled, 1);

    const reused = pool.acquire('tex');
    assert.strictEqual(reused, dynamicObj);
    assert.equal(pool.size(), 0);
    assert.equal(dynamicObj.active, true);
    assert.equal(scene._adds.length, 1);
    assert.ok(scene._removes.length >= 1);
});
