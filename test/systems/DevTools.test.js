import test from 'node:test';
import assert from 'node:assert';
import DevTools from '../../systems/DevTools.js';
import { WORLD_GEN, BIOME_IDS } from '../../systems/world_gen/worldGenConfig.js';
import { getBiome } from '../../systems/world_gen/biomes/biomeMap.js';

const BIOME_NAMES = {
    [BIOME_IDS.PLAINS]: 'Plains',
    [BIOME_IDS.FOREST]: 'Forest',
    [BIOME_IDS.DESERT]: 'Desert',
};

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
    const styles = [];
    const gfx = {
        destroyed: false,
        styles,
        clear() { return this; },
        lineStyle(width, color) { styles.push({ width, color }); return this; },
        beginPath() { return this; },
        moveTo() { return this; },
        lineTo() { return this; },
        strokePath() { return this; },
        strokeRect() { return this; },
        fillStyle() { return this; },
        fillRect() { return this; },
        setDepth() { return this; },
        setScrollFactor() { return this; },
        destroy() { this.destroyed = true; },
    };
    const add = {
        graphics() { return gfx; },
        text(x, y, msg, style) {
            return {
                x, y, text: msg, style,
                destroyed: false,
                setText(t) { this.text = t; return this; },
                setY(y) { this.y = y; return this; },
                setScrollFactor() { return this; },
                setDepth() { return this; },
                destroy() { this.destroyed = true; },
            };
        },
    };
    const cameras = { main: { worldView: { x: 0, y: 0, width: 1000, height: 1000, right: 1000, bottom: 1000 } } };
    const player = { x: WORLD_GEN.spawn.x, y: WORLD_GEN.spawn.y };
    const cx = Math.floor(WORLD_GEN.spawn.x / WORLD_GEN.chunk.size);
    const cy = Math.floor(WORLD_GEN.spawn.y / WORLD_GEN.chunk.size);
    const chunkManager = { loadedChunks: new Map([[`${cx},${cy}`, {}]]), cols: 20, rows: 20 };
    const game = { loop: { actualFps: 60 } };
    return { time, add, cameras, player, chunkManager, game, gfxStyles: styles };
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
    assert.match(DevTools._chunkText.text, /loaded/);
    assert.ok(scene.gfxStyles.some(s => s.width === 4 && s.color === 0x0000aa));
    // Simulate reopening Dev UI which re-applies current toggle
    assert.equal(DevTools.cheats.chunkDetails, true);
    DevTools.setChunkDetails(DevTools.cheats.chunkDetails, scene);
    assert.ok(DevTools._chunkGfx);
    DevTools._chunkTimer.callback();
    const spawnCx = Math.floor(WORLD_GEN.spawn.x / WORLD_GEN.chunk.size);
    const spawnCy = Math.floor(WORLD_GEN.spawn.y / WORLD_GEN.chunk.size);
    const biomeId = getBiome(spawnCx, spawnCy);
    const expected = BIOME_NAMES[biomeId];
    assert.match(DevTools._chunkText.text, new RegExp(`Biome: ${expected}`));
    DevTools.setChunkDetails(false);
    assert.equal(DevTools._chunkGfx, null);
    assert.equal(DevTools._chunkTimer, null);
});

test('performanceHud toggle manages HUD and timer', () => {
    const scene = makeStubScene();
    DevTools.setPerformanceHud(true, scene);
    assert.ok(DevTools._perfText);
    assert.ok(DevTools._perfTimer);
    assert.match(DevTools._perfText.text, /FPS/);
    DevTools._perfTimer.callback();
    assert.match(DevTools._perfText.text, /FPS/);
    DevTools.setPerformanceHud(false);
    assert.equal(DevTools._perfText, null);
    assert.equal(DevTools._perfTimer, null);
});
