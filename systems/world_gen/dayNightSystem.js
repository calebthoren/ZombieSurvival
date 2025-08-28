// systems/world_gen/dayNightSystem.js
// Day/Night cycle logic isolated from Phaser scene for reuse.
import { WORLD_GEN } from './worldGenConfig.js';
import DevTools from '../DevTools.js';

export default function createDayNightSystem(scene) {
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

                const targetCount = Math.min(
                    nightCfg.baseCount +
                        (scene.waveNumber - 1) * nightCfg.perWave,
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
        const phaseLabel = scene.phase === 'day' ? 'Daytime' : 'Night';
        scene.uiScene.updateTimeDisplay(scene.dayIndex, phaseLabel, progress);
    }

    // ----- Tick -----
    function tick(delta) {
        const scale = DevTools.cheats.timeScale || 1;
        scene._phaseElapsedMs =
            (scene._phaseElapsedMs || 0) + ((delta * scale) | 0);
        if (getPhaseElapsed() >= getPhaseDuration()) {
            if (scene.phase === 'day') {
                startNight();
            } else {
                scene.dayIndex++;
                startDay();
            }
        }
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
        updateNightOverlay,
        updateTimeUi,
        tick,
    };
}
