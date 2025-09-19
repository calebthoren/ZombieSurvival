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
    const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
    const burstInterval = Math.max(nightCfg.burstIntervalMs ?? 0, 0);
    const maxWaveSpan = Math.max(
        0,
        (Math.max(nightCfg.maxCount ?? 1, 1) - 1) * burstInterval,
    );

    for (let i = 0; i < scheduledDelays.length; i++) {
        const segmentStart = i * segmentDuration;
        const segmentEnd = segmentStart + segmentDuration;
        const rawMin = segmentStart + segmentDuration * 0.25;
        const rawMax = segmentEnd - burstInterval;
        const safeMaxStart = Math.max(
            segmentStart,
            segmentEnd - maxWaveSpan - burstInterval,
        );
        const windowStart = Math.max(
            segmentStart,
            Math.min(rawMin, safeMaxStart),
        );
        const windowEnd = Math.max(
            windowStart,
            Math.min(rawMax, safeMaxStart),
        );
        const minDelay = Math.max(0, Math.floor(windowStart));
        const maxDelay = Math.max(minDelay, Math.floor(windowEnd));
        const fallbackMidpoint = segmentStart + segmentDuration * 0.5;
        const fallbackDelay = Math.max(
            0,
            Math.floor(
                Phaser.Math.Clamp(
                    fallbackMidpoint,
                    segmentStart,
                    safeMaxStart,
                ),
            ),
        );
        const expectedDelay =
            minDelay <= maxDelay
                ? Math.floor((minDelay + maxDelay) / 2)
                : fallbackDelay;

        assert.equal(
            scheduledDelays[i],
            expectedDelay,
            'delay should match midpoint of safe window',
        );
    }

    events.emitShutdown();
});

test('scheduleNightWave spawns full bursts when timers execute', () => {
    const events = createEventStub();
    const timers = [];
    let spawnCount = 0;
    const scene = {
        phase: 'night',
        dayIndex: 1,
        waveNumber: 0,
        isGameOver: false,
        time: {
            delayedCall(delay, cb) {
                const timer = {
                    delay,
                    cb,
                    removed: false,
                    remove() {
                        this.removed = true;
                    },
                };
                timers.push(timer);
                return timer;
            },
        },
        combat: {
            getEligibleZombieTypesForPhase() {
                return ['basic'];
            },
            pickZombieTypeWeighted() {
                return 'basic';
            },
            spawnZombie() {
                spawnCount++;
            },
        },
        events,
    };

    const system = createDayNightSystem(scene);
    system.scheduleNightWave();

    let index = 0;
    while (index < timers.length) {
        const timer = timers[index++];
        if (timer.removed || typeof timer.cb !== 'function') continue;
        timer.cb();
    }

    const segmentCount = Math.max(
        WORLD_GEN.dayNight.segments?.perPhase ?? 3,
        1,
    );
    assert.equal(scene.waveNumber, segmentCount);

    const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
    let expectedSpawns = 0;
    for (let waveIndex = 0; waveIndex < segmentCount; waveIndex++) {
        const waveNumber = waveIndex + 1;
        const dayBonus = scene.dayIndex * nightCfg.perDay;
        expectedSpawns += Math.min(
            nightCfg.baseCount + (waveNumber - 1) * nightCfg.perWave + dayBonus,
            nightCfg.maxCount,
        );
    }
    assert.equal(spawnCount, expectedSpawns);

    events.emitShutdown();
});

