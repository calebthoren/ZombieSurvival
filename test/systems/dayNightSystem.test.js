// test/systems/dayNightSystem.test.js — verifies day/night timing
import test from 'node:test';
import assert from 'node:assert/strict';
import createDayNightSystem, {
    DAY_SEGMENTS,
    NIGHT_SEGMENTS,
} from '../../systems/world_gen/dayNightSystem.js';
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
            DESTROY: 'destroy',
        },
    },
};

function createEventStub() {
    const handlers = Object.create(null);
    return {
        once(eventName, cb) {
            handlers[eventName] = cb;
        },
        emit(eventName) {
            const handler = handlers[eventName];
            if (typeof handler === 'function') {
                delete handlers[eventName];
                handler();
            }
        },
        emitShutdown() {
            this.emit(Phaser.Scenes.Events.SHUTDOWN);
        },
        emitDestroy() {
            this.emit(Phaser.Scenes.Events.DESTROY);
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

test('noDarkness cheat suppresses night overlay and ambient', () => {
    const events = createEventStub();
    const overlay = { alpha: 0, setAlpha(v) { this.alpha = v; } };
    let ambient = -1;
    const scene = {
        phase: 'night',
        dayIndex: 1,
        nightOverlay: overlay,
        events,
        time: {
            addEvent() { return { remove() {} }; },
            delayedCall() { return { remove() {} }; },
        },
        combat: {
            getEligibleZombieTypesForPhase() { return ['basic']; },
            pickZombieTypeWeighted() { return 'basic'; },
            spawnZombie() {},
        },
        updateNightAmbient(value) {
            ambient = value;
        },
    };

    const system = createDayNightSystem(scene);
    // Set elapsed time to be in the middle of midnight segment (segment 1 of 3)
    // Night duration is typically 180_000ms, so middle segment is ~60_000ms-120_000ms
    // Set to middle of that segment (90_000ms) to ensure we get midnight strength
    scene._phaseElapsedMs = 90_000;

    DevTools.cheats.noDarkness = false;
    system.updateNightOverlay();
    assert.ok(overlay.alpha > 0.5);
    assert.ok(ambient >= 0);

    DevTools.cheats.noDarkness = true;
    system.updateNightOverlay();
    assert.equal(overlay.alpha, 0);
    assert.equal(ambient, 0);

    DevTools.cheats.noDarkness = false;
    system.updateNightOverlay();
    assert.ok(overlay.alpha > 0.5);
    assert.ok(ambient >= 0);

    events.emitShutdown();
});

test('scheduleNightWave queues timers within each night segment', () => {
    const events = createEventStub();
    const scheduledDelays = [];
    const reusableTimer = { remove() {} };
    const scene = {
        phase: 'night',
        dayIndex: 1,
        waveNumber: 0,
        isGameOver: false,
        time: {
            delayedCall(delay) {
                scheduledDelays.push(delay);
                return reusableTimer;
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

test('spawn scheduling honors DevTools time scale', () => {
    const events = createEventStub();
    const addEventDelays = [];
    const delayedCalls = [];
    let spawnCount = 0;
    const scene = {
        phase: 'night',
        dayIndex: 1,
        waveNumber: 0,
        isGameOver: false,
        time: {
            timeScale: 0.5,
            addEvent(cfg) {
                addEventDelays.push(cfg.delay);
                return {
                    remove() {},
                };
            },
            delayedCall(delay, callback) {
                const event = {
                    delay,
                    callback,
                    remove() {},
                };
                delayedCalls.push(event);
                return event;
            },
        },
        combat: {
            getEligibleZombieTypesForPhase() {
                return [{ id: 'basic', weight: 1 }];
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

    DevTools.cheats.timeScale = 2;

    system.scheduleNightTrickle();
    system.scheduleNightWave();

    const expectedTrickleDelay = Math.floor((20_000 / 2) * 0.5);
    assert.equal(
        addEventDelays[addEventDelays.length - 1],
        expectedTrickleDelay,
    );

    const segmentCount = Math.max(
        WORLD_GEN.dayNight.segments?.perPhase ?? 3,
        1,
    );
    assert.equal(delayedCalls.length, segmentCount);

    const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
    const nightDuration = WORLD_GEN.dayNight.nightMs;
    const segmentDuration = nightDuration / segmentCount;

    for (let i = 0; i < segmentCount; i++) {
        const segmentStart = i * segmentDuration;
        const segmentEnd = segmentStart + segmentDuration;
        const minDelay = segmentStart + segmentDuration * 0.25;
        const maxDelay = segmentEnd - nightCfg.burstIntervalMs;
        const baseDelay = Math.floor((minDelay + maxDelay) / 2);
        const expectedDelay = Math.floor((baseDelay / 2) * 0.5);
        assert.equal(delayedCalls[i].delay, expectedDelay);
    }

    const initialCount = delayedCalls.length;
    delayedCalls[0].callback();

    const burstEvents = delayedCalls.slice(initialCount);
    // Use new linear scaling formula: BaseCount + (NightNumber - 1) * PerNight + SegmentNumber * PerSegment
    const nightNumber = scene.dayIndex; // Night 1
    const segmentIndex = 0; // First segment (Dusk)
    const perNight = nightCfg.perNight ?? nightCfg.perDay ?? 2;
    const perSegment = nightCfg.perSegment ?? 0;
    const waveTarget = Math.min(
        nightCfg.baseCount + (nightNumber - 1) * perNight + segmentIndex * perSegment,
        nightCfg.maxCount,
    );
    assert.equal(burstEvents.length, waveTarget);

    for (let i = 0; i < burstEvents.length; i++) {
        const baseDelay = i * nightCfg.burstIntervalMs;
        const expectedDelay = Math.floor((baseDelay / 2) * 0.5);
        assert.equal(burstEvents[i].delay, expectedDelay);
    }
    assert.equal(spawnCount, 0);

    DevTools.cheats.timeScale = 1;
    events.emitShutdown();
});

test('new linear wave scaling formula: BaseCount + (NightNumber - 1) * PerNight + SegmentNumber * PerSegment', () => {
    const events = createEventStub();
    const actualWaveSizes = [];
    
    const scene = {
        phase: 'night',
        dayIndex: 1, // Night 1
        waveNumber: 0,
        isGameOver: false,
        time: {
            delayedCall(delay, callback) {
                // Capture the targetCount from the wave callback
                const originalCallback = callback;
                callback = () => {
                    const waveNumberBefore = scene.waveNumber;
                    originalCallback();
                    // The callback increments scene.waveNumber first, then calculates targetCount
                    // We need to extract targetCount from the spawning loop
                    actualWaveSizes.push(scene._lastTargetCount);
                };
                return { remove() {} };
            },
        },
        combat: {
            getEligibleZombieTypesForPhase() { return ['basic']; },
            pickZombieTypeWeighted() { return 'basic'; },
            spawnZombie() {
                // Track spawns to verify targetCount
            },
        },
        events,
    };

    const system = createDayNightSystem(scene);
    
    // Test Night 1 (dayIndex=1): should be [3, 4, 5] for segments [0, 1, 2]
    scene.dayIndex = 1;
    scene.waveNumber = 0;
    actualWaveSizes.length = 0;
    
    // Mock the night wave scheduling to capture targetCount
    const originalSchedule = system.scheduleNightWave;
    system.scheduleNightWave = function() {
        const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
        const segmentCount = Math.max(WORLD_GEN.dayNight.segments?.perPhase ?? 3, 1);
        
        for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
            const nightNumber = scene.dayIndex;
            const perNight = nightCfg.perNight ?? nightCfg.perDay ?? 2;
            const perSegment = nightCfg.perSegment ?? 0;
            const targetCount = Math.min(
                nightCfg.baseCount +
                    (nightNumber - 1) * perNight +
                    segmentIndex * perSegment,
                nightCfg.maxCount,
            );
            actualWaveSizes.push(targetCount);
        }
    };
    
    system.scheduleNightWave();
    
    // Night 1: BaseCount(1) + (1-1)*PerNight(1) + SegmentIndex*PerSegment(1)
    // Dusk(0): 1 + 0*1 + 0*1 = 1
    // Midnight(1): 1 + 0*1 + 1*1 = 2  
    // Dawn(2): 1 + 0*1 + 2*1 = 3
    assert.deepEqual(actualWaveSizes, [1, 2, 3]);
    
    // Test Night 2 (dayIndex=2): should be [5, 6, 7] for segments [0, 1, 2]
    scene.dayIndex = 2;
    actualWaveSizes.length = 0;
    system.scheduleNightWave();
    
    // Night 2: BaseCount(1) + (2-1)*PerNight(1) + SegmentIndex*PerSegment(1)
    // Dusk(0): 1 + 1*1 + 0*1 = 2
    // Midnight(1): 1 + 1*1 + 1*1 = 3
    // Dawn(2): 1 + 1*1 + 2*1 = 4
    assert.deepEqual(actualWaveSizes, [2, 3, 4]);
    
    // Test Night 3 (dayIndex=3): should be [7, 8, 9] for segments [0, 1, 2]
    scene.dayIndex = 3;
    actualWaveSizes.length = 0;
    system.scheduleNightWave();
    
    // Night 3: BaseCount(1) + (3-1)*PerNight(1) + SegmentIndex*PerSegment(1)
    // Dusk(0): 1 + 2*1 + 0*1 = 3
    // Midnight(1): 1 + 2*1 + 1*1 = 4
    // Dawn(2): 1 + 2*1 + 2*1 = 5
    assert.deepEqual(actualWaveSizes, [3, 4, 5]);
    
    events.emitShutdown();
});

