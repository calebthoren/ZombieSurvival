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
    const dayBonus = scene.dayIndex * nightCfg.perDay;
    const waveTarget = Math.min(
        nightCfg.baseCount + (1 - 1) * nightCfg.perWave + dayBonus,
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

