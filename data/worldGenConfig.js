// data/worldGenConfig.js
// PURE DATA ONLY — no logic. Tunable world gen + day/night + spawn settings.

export const WORLD_GEN = {
  // -----------------------------
  // World bounds / scale (future)
  // -----------------------------
  world: {
    width: 1200,   // logical world width (px). You can expand later.
    height: 900,   // logical world height (px).
  },

  // -----------------------------
  // Day/Night cycle (arcade-style)
  // -----------------------------
  // Goal: fast cycles, plenty of daytime to build/explore, but night happens often.
  // Total cycle = dayMs + nightMs (plus smooth transitions for the overlay).
  dayNight: {
    dayMs: 240_000,          // 4 min day
    nightMs: 120_000,        // 2 min night
    transitionMs: 15_000,    // 15s fade at start/end of night
    nightOverlayAlpha: 0.55, // darkness amount at deepest night (0..1)
    // (You can tweak these freely without touching scene code.)
  },

  // -----------------------------
  // Spawns
  // -----------------------------
  spawns: {
    // Resource nodes
    resources: {
      big_rock_node: {
        minCount: 8,
        maxCount: 12,
        minSpacing: 100, // not enforced yet — placeholder for future scatter
      },
    },

    // Enemies
    zombie: {
      // DAY: Rare trickle
      day: {
        minDelayMs: 6_000,   // random interval between checks
        maxDelayMs: 12_000,
        chance: 0.25,        // 25% chance to spawn 1 when timer fires
      },

      // NIGHT: Waves
      nightWaves: {
        waveIntervalMs: 30_000, // time between waves
        baseCount: 3,           // zombies in wave 1
        perWave: 2,             // +N per subsequent wave
        maxCount: 25,           // clamp
        burstIntervalMs: 200,   // gap between individuals within a wave
      },
    },
  },
};
