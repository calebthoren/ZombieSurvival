// test/systems/dayNightSystem.test.js — verifies day/night timing
import test from 'node:test';
import assert from 'node:assert/strict';
import createDayNightSystem from '../../systems/world_gen/dayNightSystem.js';
import DevTools from '../../systems/DevTools.js';

globalThis.Phaser = {
    Math: {
        Linear: (start, end, t) => start + (end - start) * t,
        Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
    },
};

test('tick scales day-night progression with time scale', () => {
    const scene = {
        phase: 'day',
        dayIndex: 1,
        nightOverlay: { setAlpha() {} },
    };
    const system = createDayNightSystem(scene);

    DevTools.cheats.timeScale = 1;
    system.tick(100);
    assert.equal(scene._phaseElapsedMs, 100);

    DevTools.cheats.timeScale = 2;
    system.tick(100);
    assert.equal(scene._phaseElapsedMs, 300);

    DevTools.cheats.timeScale = 1;
});

