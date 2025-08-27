import test from 'node:test';
import assert from 'node:assert';
import DevTools from '../../systems/DevTools.js';

function makeStubScene() {
    const events = new Set();
    const time = {
        addEvent(opts) {
            const evt = {
                delay: opts.delay,
                callback: opts.callback,
                removed: false,
                remove() { this.removed = true; events.delete(this); },
            };
            events.add(evt);
            return evt;
        },
        events,
    };
    const add = {
        graphics() {
            return {
                destroyed: false,
                clear() { return this; },
                lineStyle() { return this; },
                strokeRect() { return this; },
                fillStyle() { return this; },
                fillRect() { return this; },
                setDepth() { return this; },
                setScrollFactor() { return this; },
                destroy() { this.destroyed = true; },
            };
        },
        text(x, y, msg, style) {
            return {
                x, y, text: msg, style,
                destroyed: false,
                setText(t) { this.text = t; return this; },
                setScrollFactor() { return this; },
                setDepth() { return this; },
                destroy() { this.destroyed = true; },
            };
        },
    };
    const cameras = { main: { worldView: { x: 0, y: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 } } };
    const player = { x: 250, y: 250 };
    const chunkManager = { loadedChunks: new Map([['0,0', {}]]), cols: 20, rows: 20 };
    const game = { loop: { actualFps: 60 } };
    return { time, add, cameras, player, chunkManager, game };
}

test('setMeleeSliceBatch clamps to 1 or 2', () => {
    DevTools.setMeleeSliceBatch(2);
    assert.equal(DevTools.cheats.meleeSliceBatch, 2);
    DevTools.setMeleeSliceBatch(0);
    assert.equal(DevTools.cheats.meleeSliceBatch, 1);
});

test('chunkDetails toggle manages overlay and timer', () => {
    const scene = makeStubScene();
    DevTools.setChunkDetails(true, scene);
    assert.ok(DevTools._chunkGfx);
    assert.ok(DevTools._chunkTimer);
    DevTools._chunkTimer.callback();
    assert.match(DevTools._chunkText.text, /loaded/);
    DevTools.setChunkDetails(false);
    assert.equal(DevTools._chunkGfx, null);
    assert.equal(DevTools._chunkTimer, null);
});

test('performanceHud toggle manages HUD and timer', () => {
    const scene = makeStubScene();
    DevTools.setPerformanceHud(true, scene);
    assert.ok(DevTools._perfText);
    assert.ok(DevTools._perfTimer);
    DevTools._perfTimer.callback();
    assert.match(DevTools._perfText.text, /FPS/);
    DevTools.setPerformanceHud(false);
    assert.equal(DevTools._perfText, null);
    assert.equal(DevTools._perfTimer, null);
});
