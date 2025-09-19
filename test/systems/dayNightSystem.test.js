// test/systems/dayNightSystem.test.js — verifies day/night timing
import test from 'node:test';
import assert from 'node:assert/strict';
import createDayNightSystem from '../../systems/world_gen/dayNightSystem.js';
import DevTools from '../../systems/DevTools.js';
import { WORLD_GEN } from '../../systems/world_gen/worldGenConfig.js';

globalThis.Phaser = {
    Math: {
        Linear: (start, end, t) => start + (end - start) * t,
        Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
        Between: (min, max) => Math.floor((min + max) / 2),
    },
    Scenes: {
        Events: {
            SHUTDOWN: 'shutdown',
        },
    },
};

function createEventStub() {
    let handler = null;
    return {
        once(eventName, cb) {
            handler = cb;
        },
        emitShutdown() {
            if (handler) handler();
        },
    };
}

test('tick scales day-night progression with time scale', () => {
    const events = createEventStub();
    const scene = {
        phase: 'day',
        dayIndex: 1,
        nightOverlay: { setAlpha() {} },
        events,
    };
    const system = createDayNightSystem(scene);

    DevTools.cheats.timeScale = 1;
    system.tick(100);
    assert.equal(scene._phaseElapsedMs, 100);

    DevTools.cheats.timeScale = 2;
    system.tick(100);
    assert.equal(scene._phaseElapsedMs, 300);

    DevTools.cheats.timeScale = 1;
    events.emitShutdown();
});

test('scheduleNightWave queues timers within each night segment', () => {
    const events = createEventStub();
    const scheduledDelays = [];
    const scene = {
        phase: 'night',
        dayIndex: 1,
        waveNumber: 0,
        isGameOver: false,
        time: {
            delayedCall(delay) {
                scheduledDelays.push(delay);
                return {
                    remove() {},
                };
            },
        },
        combat: {
            getEligibleZombieTypesForPhase() {
                return ['basic'];
            },
            pickZombieTypeWeighted() {
                return 'basic';
            },
            spawnZombie() {},
        },
        events,
    };

    const system = createDayNightSystem(scene);
    system.scheduleNightWave();

    const segmentCount = Math.max(
        WORLD_GEN.dayNight.segments?.perPhase ?? 3,
        1,
    );
    assert.equal(scheduledDelays.length, segmentCount);

    const nightDuration = WORLD_GEN.dayNight.nightMs;
    const segmentDuration = nightDuration / segmentCount;

    for (let i = 0; i < scheduledDelays.length; i++) {
        const segmentStart = i * segmentDuration;
        const segmentEnd = segmentStart + segmentDuration;
        const delay = scheduledDelays[i];
        assert.ok(delay >= segmentStart, 'delay should be in segment start');
        assert.ok(delay <= segmentEnd, 'delay should be in segment end');
    }

    events.emitShutdown();
});

