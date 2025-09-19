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

test('phase segments update at expected elapsed thresholds and midnight forces full darkness', () => {
    const events = createEventStub();
    const overlayStub = {
        lastAlpha: null,
        setAlpha(value) {
            this.lastAlpha = value;
        },
    };
    const lightsStub = {
        lastColor: null,
        setAmbientColor(value) {
            this.lastColor = value;
        },
    };
    const reusableTimer = { remove() {} };
    const scene = {
        phase: 'day',
        dayIndex: 3,
        nightOverlay: overlayStub,
        lights: lightsStub,
        _baseAmbientColor: 0x101010,
        events,
        time: {
            delayedCall() {
                return reusableTimer;
            },
            addEvent() {
                return reusableTimer;
            },
        },
    };

    const system = createDayNightSystem(scene);
    DevTools.cheats.timeScale = 1;

    const { dayNight } = WORLD_GEN;
    const segmentCount = Math.max(dayNight.segments?.perPhase ?? 3, 1);
    const daySegmentDuration = dayNight.dayMs / segmentCount;
    const nightSegmentDuration = dayNight.nightMs / segmentCount;

    const defaultDayLabel = DAY_SEGMENTS[0] || 'Daytime';
    const defaultNightLabel = NIGHT_SEGMENTS[0] || 'Dusk';
    const maxDayIndex = Math.max(0, Math.min(DAY_SEGMENTS.length - 1, segmentCount - 1));
    const maxNightIndex = Math.max(0, Math.min(NIGHT_SEGMENTS.length - 1, segmentCount - 1));

    function resolveLabel(labels, fallback, index, maxIndex) {
        const clampedIndex = Math.min(index, maxIndex);
        const label = labels[clampedIndex];
        return typeof label === 'string' && label.length > 0 ? label : fallback;
    }

    function assertSegmentState(expectedIndex, expectedLabel, context) {
        assert.equal(
            scene.phaseSegmentIndex,
            expectedIndex,
            `${context} index should match expected segment`,
        );
        assert.equal(
            scene.phaseSegmentLabel,
            expectedLabel,
            `${context} label should match expected text`,
        );
    }

    // ----- Day progression -----
    scene.phase = 'day';
    scene._phaseElapsedMs = 0;
    system.tick(0);
    assertSegmentState(0, defaultDayLabel, 'day start');

    let currentElapsed = 0;
    for (let boundaryIndex = 0; boundaryIndex < segmentCount - 1; boundaryIndex++) {
        const boundary = Math.ceil(daySegmentDuration * (boundaryIndex + 1));
        const beforeBoundary = Math.max(0, boundary - 1);
        if (beforeBoundary > currentElapsed) {
            system.tick(beforeBoundary - currentElapsed);
            currentElapsed = beforeBoundary;
        }

        const holdIndex = Math.min(boundaryIndex, maxDayIndex);
        const holdLabel = resolveLabel(
            DAY_SEGMENTS,
            defaultDayLabel,
            boundaryIndex,
            maxDayIndex,
        );
        assertSegmentState(
            holdIndex,
            holdLabel,
            `day segment ${boundaryIndex} before next boundary`,
        );

        if (boundary > currentElapsed) {
            system.tick(boundary - currentElapsed);
            currentElapsed = boundary;
        }

        const nextIndex = Math.min(boundaryIndex + 1, maxDayIndex);
        const nextLabel = resolveLabel(
            DAY_SEGMENTS,
            defaultDayLabel,
            boundaryIndex + 1,
            maxDayIndex,
        );
        assertSegmentState(
            nextIndex,
            nextLabel,
            `day segment ${boundaryIndex + 1} after crossing boundary`,
        );
    }

    // ----- Night progression -----
    scene.phase = 'night';
    scene._phaseElapsedMs = 0;
    overlayStub.lastAlpha = null;
    system.tick(0);
    assertSegmentState(0, defaultNightLabel, 'night start');

    currentElapsed = 0;
    let midnightVerified = false;
    for (let boundaryIndex = 0; boundaryIndex < segmentCount - 1; boundaryIndex++) {
        const boundary = Math.ceil(nightSegmentDuration * (boundaryIndex + 1));
        const beforeBoundary = Math.max(0, boundary - 1);
        if (beforeBoundary > currentElapsed) {
            system.tick(beforeBoundary - currentElapsed);
            currentElapsed = beforeBoundary;
        }

        const holdIndex = Math.min(boundaryIndex, maxNightIndex);
        const holdLabel = resolveLabel(
            NIGHT_SEGMENTS,
            defaultNightLabel,
            boundaryIndex,
            maxNightIndex,
        );
        assertSegmentState(
            holdIndex,
            holdLabel,
            `night segment ${boundaryIndex} before next boundary`,
        );

        if (boundary > currentElapsed) {
            system.tick(boundary - currentElapsed);
            currentElapsed = boundary;
        }

        const nextIndex = Math.min(boundaryIndex + 1, maxNightIndex);
        const nextLabel = resolveLabel(
            NIGHT_SEGMENTS,
            defaultNightLabel,
            boundaryIndex + 1,
            maxNightIndex,
        );
        assertSegmentState(
            nextIndex,
            nextLabel,
            `night segment ${boundaryIndex + 1} after crossing boundary`,
        );

        if (!midnightVerified && typeof nextLabel === 'string') {
            const normalized = nextLabel.trim().toLowerCase();
            if (normalized === 'midnight') {
                assert.equal(
                    overlayStub.lastAlpha,
                    1,
                    'night overlay alpha should be forced to 1 during midnight segment',
                );
                midnightVerified = true;
            }
        }
    }

    assert.ok(midnightVerified, 'midnight segment should have been observed during test');

    events.emitShutdown();
});

