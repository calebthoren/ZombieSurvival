// systems/world_gen/dayNightSystem.js
// Day/Night cycle logic isolated from Phaser scene for reuse.
import { WORLD_GEN } from './worldGenConfig.js';
import DevTools from '../DevTools.js';

const SEGMENT_CONFIG = WORLD_GEN.dayNight.segments || {};
const SEGMENT_COUNT = Math.max(SEGMENT_CONFIG.perPhase ?? 3, 1);

export const DAY_SEGMENTS =
    Array.isArray(SEGMENT_CONFIG.day?.labels) && SEGMENT_CONFIG.day.labels.length > 0
        ? SEGMENT_CONFIG.day.labels
        : ['Daytime', 'Daytime', 'Daytime'];

export const NIGHT_SEGMENTS =
    Array.isArray(SEGMENT_CONFIG.night?.labels) && SEGMENT_CONFIG.night.labels.length > 0
        ? SEGMENT_CONFIG.night.labels
        : ['Dusk', 'Midnight', 'Dawn'];

const DEFAULT_DAY_SEGMENT_LABEL = DAY_SEGMENTS[0] || 'Daytime';
const DEFAULT_NIGHT_SEGMENT_LABEL = NIGHT_SEGMENTS[0] || 'Dusk';
const MAX_DAY_SEGMENT_INDEX = Math.max(0, Math.min(DAY_SEGMENTS.length - 1, SEGMENT_COUNT - 1));
const MAX_NIGHT_SEGMENT_INDEX = Math.max(
    0,
    Math.min(NIGHT_SEGMENTS.length - 1, SEGMENT_COUNT - 1),
);

function normalizeSegmentLabel(label) {
    return typeof label === 'string' ? label.trim().toLowerCase() : '';
}

const MIDNIGHT_SEGMENT_INDEX = (() => {
    for (let i = 0; i < NIGHT_SEGMENTS.length; i++) {
        if (normalizeSegmentLabel(NIGHT_SEGMENTS[i]) === 'midnight') {
            return i;
        }
    }
    return -1;
})();

let nightWaveTimers = [];

function clearNightWaveTimers() {
    for (let i = 0; i < nightWaveTimers.length; i++) {
        const timer = nightWaveTimers[i];
        if (timer?.remove) {
            timer.remove(false);
        }
    }
    nightWaveTimers = [];
}

export default function createDayNightSystem(scene) {
    let cachedSegmentPhase = 'day';
    let cachedSegmentIndex = 0;
    let cachedSegmentLabel = DEFAULT_DAY_SEGMENT_LABEL;

    scene.phaseSegmentIndex = cachedSegmentIndex;
    scene.phaseSegmentLabel = cachedSegmentLabel;

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, clearNightWaveTimers);
    scene.events.once(Phaser.Scenes.Events.DESTROY, clearNightWaveTimers);

    const clearSpawnTimer = () => {
        if (scene.spawnZombieTimer?.remove) {
            scene.spawnZombieTimer.remove(false);
        }
        scene.spawnZombieTimer = null;
    };
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, clearSpawnTimer);
    scene.events.once(Phaser.Scenes.Events.DESTROY, clearSpawnTimer);

    function scaleSpawnDelay(ms) {
        const base = Math.max(0, ms | 0);
        if (base === 0) return 0;
        const cheatScaleRaw = DevTools?.cheats?.timeScale;
        const cheatScale =
            typeof cheatScaleRaw === 'number' && cheatScaleRaw > 0
                ? cheatScaleRaw
                : 1;
        const timerScaleRaw = scene?.time?.timeScale;
        const timerScale =
            typeof timerScaleRaw === 'number' && timerScaleRaw > 0
                ? timerScaleRaw
                : 1;
        const scaled = Math.floor((base / cheatScale) * timerScale);
        return scaled > 0 ? scaled : 0;
    }

    function resetSegmentForPhase(phase) {
        const isNight = phase === 'night';
        const segments = isNight ? NIGHT_SEGMENTS : DAY_SEGMENTS;
        const fallback = isNight
            ? DEFAULT_NIGHT_SEGMENT_LABEL
            : DEFAULT_DAY_SEGMENT_LABEL;

        cachedSegmentPhase = phase;
        cachedSegmentIndex = 0;
        cachedSegmentLabel = segments[0] || fallback;
        scene.phaseSegmentIndex = cachedSegmentIndex;
        scene.phaseSegmentLabel = cachedSegmentLabel;
    }

    function refreshSegmentState(phaseElapsed, phaseDuration) {
        const isNight = scene.phase === 'night';
        const segments = isNight ? NIGHT_SEGMENTS : DAY_SEGMENTS;
        const fallback = isNight
            ? DEFAULT_NIGHT_SEGMENT_LABEL
            : DEFAULT_DAY_SEGMENT_LABEL;
        const maxIndex = isNight ? MAX_NIGHT_SEGMENT_INDEX : MAX_DAY_SEGMENT_INDEX;

        const perSegment = phaseDuration / SEGMENT_COUNT;
        let nextIndex =
            perSegment > 0
                ? Math.floor(phaseElapsed / perSegment)
                : 0; // Math.floor(phaseElapsed / (phaseDuration / 3)) when SEGMENT_COUNT === 3
        if (nextIndex > maxIndex) nextIndex = maxIndex;
        if (nextIndex < 0) nextIndex = 0;
        const nextLabel = segments[nextIndex] || fallback;

        if (
            cachedSegmentPhase !== scene.phase ||
            cachedSegmentIndex !== nextIndex ||
            cachedSegmentLabel !== nextLabel
        ) {
            cachedSegmentPhase = scene.phase;
            cachedSegmentIndex = nextIndex;
            cachedSegmentLabel = nextLabel;
            scene.phaseSegmentIndex = nextIndex;
            scene.phaseSegmentLabel = nextLabel;
        }
    }

    function getSegmentLabel() {
        return cachedSegmentLabel;
    }

    // ----- Phase Transitions -----
    function startDay() {
        scene.phase = 'day';
        scene.phaseStartTime = DevTools.now(scene);
        scene._phaseElapsedMs = 0;
        if (scene.spawnZombieTimer) {
            scene.spawnZombieTimer.remove(false);
            scene.spawnZombieTimer = null;
        }
        clearNightWaveTimers();
        scene.waveNumber = 0;
        resetSegmentForPhase('day');
        scheduleDaySpawn();
        updateTimeUi();
    }

    function startNight() {
        scene.phase = 'night';
        scene.phaseStartTime = DevTools.now(scene);
        scene._phaseElapsedMs = 0;
        if (scene.spawnZombieTimer) {
            scene.spawnZombieTimer.remove(false);
            scene.spawnZombieTimer = null;
        }
        clearNightWaveTimers();
        scene.waveNumber = 0;
        resetSegmentForPhase('night');
        scheduleNightWave();
        scheduleNightTrickle();
        updateTimeUi();
    }

    // ----- Spawning -----
    function scheduleDaySpawn() {
        const dayCfg = WORLD_GEN.spawns.zombie.day;
        const delay = scaleSpawnDelay(
            Phaser.Math.Between(dayCfg.minDelayMs, dayCfg.maxDelayMs),
        );
        if (scene.spawnZombieTimer) {
            scene.spawnZombieTimer.remove(false);
            scene.spawnZombieTimer = null;
        }
        scene.spawnZombieTimer = scene.time.addEvent({
            delay,
            loop: false,
            callback: () => {
                if (scene.phase !== 'day' || scene.isGameOver) return;
                if (Math.random() < dayCfg.chance) {
                    const types =
                        scene.combat.getEligibleZombieTypesForPhase('day');
                    const id = scene.combat.pickZombieTypeWeighted(types);
                    scene.combat.spawnZombie(id);
                }
                scheduleDaySpawn();
            },
        });
    }

    function scheduleNightTrickle() {
        const nightCfg = WORLD_GEN.spawns.zombie.nightTrickle;
        const delay = scaleSpawnDelay(
            Phaser.Math.Between(nightCfg.minDelayMs, nightCfg.maxDelayMs),
        );
        if (scene.spawnZombieTimer) {
            scene.spawnZombieTimer.remove(false);
            scene.spawnZombieTimer = null;
        }
        scene.spawnZombieTimer = scene.time.addEvent({
            delay,
            loop: false,
            callback: () => {
                if (scene.phase !== 'night' || scene.isGameOver) return;
                if (Math.random() < nightCfg.chance) {
                    const types =
                        scene.combat.getEligibleZombieTypesForPhase('night');
                    const id = scene.combat.pickZombieTypeWeighted(types);
                    scene.combat.spawnZombie(id);
                }
                scheduleNightTrickle();
            },
        });
    }

    function scheduleNightWave() {
        const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
        const nightDuration = WORLD_GEN.dayNight.nightMs;
        const segmentDuration = nightDuration / SEGMENT_COUNT;

        for (let segmentIndex = 0; segmentIndex < SEGMENT_COUNT; segmentIndex++) {
            const segmentStart = segmentIndex * segmentDuration;
            const segmentEnd = segmentStart + segmentDuration;
            const minDelay = segmentStart + segmentDuration * 0.25;
            const maxDelay = segmentEnd - nightCfg.burstIntervalMs;
            const hasValidRange = minDelay <= maxDelay;
            const fallbackDelay = Phaser.Math.Clamp(
                Math.floor(segmentStart + segmentDuration * 0.5),
                segmentStart,
                segmentEnd,
            );
            const delay = scaleSpawnDelay(
                hasValidRange
                    ? Phaser.Math.Between(minDelay, maxDelay)
                    : fallbackDelay,
            );

            let timer;
            const removeTimer = () => {
                const index = nightWaveTimers.indexOf(timer);
                if (index !== -1) {
                    nightWaveTimers.splice(index, 1);
                }
            };

            timer = scene.time.delayedCall(delay, () => {
                removeTimer();
                if (scene.phase !== 'night' || scene.isGameOver) return;

                scene.waveNumber++;

                const dayBonus = scene.dayIndex * nightCfg.perDay;
                const targetCount = Math.min(
                    nightCfg.baseCount +
                        (scene.waveNumber - 1) * nightCfg.perWave +
                        dayBonus,
                    nightCfg.maxCount,
                );

                for (let i = 0; i < targetCount; i++) {
                    scene.time.delayedCall(
                        scaleSpawnDelay(i * nightCfg.burstIntervalMs),
                        () => {
                            if (scene.phase === 'night' && !scene.isGameOver) {
                                const types =
                                    scene.combat.getEligibleZombieTypesForPhase(
                                        'night',
                                    );
                                const id =
                                    scene.combat.pickZombieTypeWeighted(types);
                                scene.combat.spawnZombie(id);
                            }
                        },
                    );
                }
            });

            nightWaveTimers.push(timer);
        }
    }

    // ----- Phase Info -----
    function getPhaseElapsed() {
        return scene._phaseElapsedMs | 0;
    }
    function getPhaseDuration() {
        return scene.phase === 'day'
            ? WORLD_GEN.dayNight.dayMs
            : WORLD_GEN.dayNight.nightMs;
    }

    // ----- Visuals & UI -----
    let lastMidnightStrength = -1;

    function updateNightOverlay() {
        const { transitionMs, nightOverlayAlpha } = WORLD_GEN.dayNight;
        const elapsed = getPhaseElapsed();
        const duration = getPhaseDuration();

        const hasTransition = transitionMs > 0;
        let target = 0;
        let midnightStrength = 0;

        if (scene.phase === 'day') {
            if (hasTransition && duration > 0) {
                const transitionStart = Math.max(0, duration - transitionMs);
                const transitionSpan = duration - transitionStart;
                if (transitionSpan > 0 && elapsed >= transitionStart) {
                    const t = Phaser.Math.Clamp(
                        (elapsed - transitionStart) / transitionSpan,
                        0,
                        1,
                    );
                    target = Phaser.Math.Linear(0, nightOverlayAlpha, t);
                }
            }
        } else if (scene.phase === 'night') {
            if (hasTransition && duration > 0) {
                const transitionStart = Math.max(0, duration - transitionMs);
                const transitionSpan = duration - transitionStart;
                if (transitionSpan > 0 && elapsed >= transitionStart) {
                    const t = Phaser.Math.Clamp(
                        (elapsed - transitionStart) / transitionSpan,
                        0,
                        1,
                    );
                    target = Phaser.Math.Linear(nightOverlayAlpha, 0, t);
                } else {
                    target = nightOverlayAlpha;
                    midnightStrength = calculateMidnightStrength(
                        elapsed,
                        duration,
                        transitionMs,
                    );
                    if (midnightStrength > 0) {
                        target = Phaser.Math.Linear(
                            nightOverlayAlpha,
                            1,
                            midnightStrength,
                        );
                    }
                }
            } else {
                target = nightOverlayAlpha;
                midnightStrength = calculateMidnightStrength(
                    elapsed,
                    duration,
                    transitionMs,
                );
            }
        }

        target = Phaser.Math.Clamp(target, 0, 1);

        const overlay = scene.nightOverlay;
        if (overlay && typeof overlay.setAlpha === 'function') {
            overlay.setAlpha(target);
        }

        applyMidnightAmbient(midnightStrength);
    }

    function applyMidnightAmbient(strength) {
        const normalized = Phaser.Math.Clamp(Number.isFinite(strength) ? strength : 0, 0, 1);
        if (normalized === lastMidnightStrength) return;
        lastMidnightStrength = normalized;
        if (scene && typeof scene.updateNightAmbient === 'function') {
            scene.updateNightAmbient(normalized);
        }
    }

    function calculateMidnightStrength(phaseElapsed, phaseDuration, transitionMs) {
        if (transitionMs <= 0) return 0;
        if (MIDNIGHT_SEGMENT_INDEX < 0) return 0;
        if (MIDNIGHT_SEGMENT_INDEX >= SEGMENT_COUNT) return 0;
        if (phaseDuration <= 0) return 0;

        const perSegment = phaseDuration / SEGMENT_COUNT;
        if (!Number.isFinite(perSegment) || perSegment <= 0) return 0;

        const midnightStart = perSegment * MIDNIGHT_SEGMENT_INDEX;
        const midnightEnd = perSegment * (MIDNIGHT_SEGMENT_INDEX + 1);

        if (phaseElapsed <= midnightStart) return 0;
        if (phaseElapsed >= midnightEnd) return 0;

        const fadeInStart = midnightStart;
        const fadeInEnd = Math.min(midnightStart + transitionMs, midnightEnd);
        const fadeOutEnd = midnightEnd;
        const fadeOutStart = Math.max(midnightEnd - transitionMs, midnightStart);

        if (fadeInEnd <= fadeOutStart) {
            if (phaseElapsed <= fadeInEnd) {
                const denom = fadeInEnd - fadeInStart;
                if (denom <= 0) return 1;
                const t = (phaseElapsed - fadeInStart) / denom;
                return Phaser.Math.Clamp(t, 0, 1);
            }
            if (phaseElapsed < fadeOutStart) return 1;
            if (phaseElapsed < fadeOutEnd) {
                const denom = fadeOutEnd - fadeOutStart;
                if (denom <= 0) return 0;
                const t = (phaseElapsed - fadeOutStart) / denom;
                const strength = 1 - t;
                return Phaser.Math.Clamp(strength, 0, 1);
            }
            return 0;
        }

        const totalDuration = fadeOutEnd - fadeInStart;
        if (totalDuration <= 0) return 0;
        const halfPoint = fadeInStart + totalDuration * 0.5;

        if (phaseElapsed <= halfPoint) {
            const denom = halfPoint - fadeInStart;
            if (denom <= 0) return 1;
            const t = (phaseElapsed - fadeInStart) / denom;
            return Phaser.Math.Clamp(t, 0, 1);
        }

        const denom = fadeOutEnd - halfPoint;
        if (denom <= 0) return 0;
        const t = (phaseElapsed - halfPoint) / denom;
        const strength = 1 - t;
        return Phaser.Math.Clamp(strength, 0, 1);
    }

    function updateTimeUi() {
        if (!scene.uiScene) return;
        const elapsed = getPhaseElapsed();
        const duration = getPhaseDuration();
        const progress = Phaser.Math.Clamp(elapsed / duration, 0, 1);
        const segmentLabel = getSegmentLabel();
        scene.uiScene.updateTimeDisplay(scene.dayIndex, segmentLabel, progress);
        const fill = scene.uiScene.timeBarFill;
        if (fill?.setFillStyle) {
            fill.setFillStyle(scene.phase === 'night' ? 0x66aaff : 0xffff66);
        }
    }

    // ----- Tick -----
    function tick(delta) {
        const cheatScaleRaw = DevTools?.cheats?.timeScale;
        let cheatScale =
            typeof cheatScaleRaw === 'number' ? cheatScaleRaw : 1;
        if (cheatScale < 0) cheatScale = 0;
        scene._phaseElapsedMs =
            (scene._phaseElapsedMs || 0) + ((delta * cheatScale) | 0);
        let phaseElapsed = getPhaseElapsed();
        let phaseDuration = getPhaseDuration();
        if (phaseElapsed >= phaseDuration) {
            if (scene.phase === 'day') {
                startNight();
            } else {
                scene.dayIndex++;
                startDay();
            }
            phaseElapsed = getPhaseElapsed();
            phaseDuration = getPhaseDuration();
        }
        refreshSegmentState(phaseElapsed, phaseDuration);
        updateNightOverlay();
    }

    return {
        startDay,
        startNight,
        scheduleDaySpawn,
        scheduleNightTrickle,
        scheduleNightWave,
        getPhaseElapsed,
        getPhaseDuration,
        getSegmentLabel,
        updateNightOverlay,
        updateTimeUi,
        tick,
    };
}
