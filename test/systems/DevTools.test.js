import test from 'node:test';
import assert from 'node:assert';
import DevTools from '../../systems/DevTools.js';

test('setMeleeSliceBatch clamps to 1 or 2', () => {
    DevTools.setMeleeSliceBatch(2);
    assert.equal(DevTools.cheats.meleeSliceBatch, 2);
    DevTools.setMeleeSliceBatch(0);
    assert.equal(DevTools.cheats.meleeSliceBatch, 1);
});

test('chunk detail overlay registers and cleans up', () => {
    let removed = false;
    let destroyed = false;
    let offCalled = false;
    let shutdownCb = null;
    const fakeTimer = { remove: () => { removed = true; } };
    const fakeGfx = {
        clear() { return this; }, lineStyle() { return this; }, strokeRect() {},
        setDepth() { return this; }, setVisible() { return this; }, destroy() { destroyed = true; return this; }
    };
    const fakeScene = {
        player: { x: 0, y: 0 },
        time: { addEvent: () => fakeTimer },
        add: { graphics: () => fakeGfx },
        events: {
            once(ev, cb) { if (ev === 'shutdown') shutdownCb = cb; },
            off(ev, cb) { if (ev === 'shutdown' && cb === shutdownCb) offCalled = true; }
        }
    };

    DevTools.setChunkDetails(true, fakeScene);
    assert.ok(DevTools._chunkTimer);
    DevTools.setChunkDetails(false);
    assert.equal(DevTools._chunkTimer, null);
    assert.ok(removed);
    assert.ok(destroyed);
    assert.ok(offCalled);
});
