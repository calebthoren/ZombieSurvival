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

export default function createDayNightSystem(scene) {
    let cachedSegmentPhase = 'day';
    let cachedSegmentIndex = 0;
    let cachedSegmentLabel = DEFAULT_DAY_SEGMENT_LABEL;

    scene.phaseSegmentIndex = cachedSegmentIndex;
    scene.phaseSegmentLabel = cachedSegmentLabel;

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
        if (scene.nightWaveTimer) {
            scene.nightWaveTimer.remove(false);
            scene.nightWaveTimer = null;
        }
        if (scene.spawnZombieTimer) {
            scene.spawnZombieTimer.remove(false);
            scene.spawnZombieTimer = null;
        }
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
        scene.waveNumber = 0;
        resetSegmentForPhase('night');
        scheduleNightWave();
        scheduleNightTrickle();
        updateTimeUi();
    }

    // ----- Spawning -----
    function scheduleDaySpawn() {
        const dayCfg = WORLD_GEN.spawns.zombie.day;
        const delay = Phaser.Math.Between(dayCfg.minDelayMs, dayCfg.maxDelayMs);
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
        const delay = Phaser.Math.Between(
            nightCfg.minDelayMs,
            nightCfg.maxDelayMs,
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
        scene.nightWaveTimer = scene.time.addEvent({
            delay: 10,
            loop: false,
            callback: () => {
                scene.waveNumber++;
                if (scene.phase !== 'night' || scene.isGameOver) return;

                const dayBonus = scene.dayIndex * nightCfg.perDay;
                const targetCount = Math.min(
                    nightCfg.baseCount +
                        (scene.waveNumber - 1) * nightCfg.perWave +
                        dayBonus,
                    nightCfg.maxCount,
                );

                for (let i = 0; i < targetCount; i++) {
                    scene.time.delayedCall(i * nightCfg.burstIntervalMs, () => {
                        if (scene.phase === 'night' && !scene.isGameOver) {
                            const types =
                                scene.combat.getEligibleZombieTypesForPhase(
                                    'night',
                                );
                            const id =
                                scene.combat.pickZombieTypeWeighted(types);
                            scene.combat.spawnZombie(id);
                        }
                    });
                }

                scene.time.delayedCall(nightCfg.waveIntervalMs, () => {
                    if (scene.phase === 'night' && !scene.isGameOver)
                        scheduleNightWave();
                });
            },
        });
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
    function updateNightOverlay() {
        const { transitionMs, nightOverlayAlpha } = WORLD_GEN.dayNight;
        const elapsed = getPhaseElapsed();
        const duration = getPhaseDuration();

        let target = 0;
        if (scene.phase === 'day') {
            if (elapsed >= duration - transitionMs) {
                const t = (elapsed - (duration - transitionMs)) / transitionMs;
                target = Phaser.Math.Linear(0, nightOverlayAlpha, t);
            }
        } else if (scene.phase === 'night') {
            if (elapsed >= duration - transitionMs) {
                const t = (elapsed - (duration - transitionMs)) / transitionMs;
                target = Phaser.Math.Linear(nightOverlayAlpha, 0, t);
            } else {
                target = nightOverlayAlpha;
            }
        }
        scene.nightOverlay.setAlpha(target);
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
        const scale = DevTools.cheats.timeScale || 1;
        scene._phaseElapsedMs =
            (scene._phaseElapsedMs || 0) + ((delta * scale) | 0);
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
