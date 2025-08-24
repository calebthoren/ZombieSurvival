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
    // Resource nodes (rocks, trees, bushes)
    resources: {
        // Weighted rock variants A–E (A most common → E rarest)
        rocks: {
          maxActive: 15,
          minSpacing: 48,  // pixels between rock centers
          respawnDelayMs: { min: 5000, max: 7000 },
          variants: [
            { id: 'rock1A', weight: 60 }, // collectible, non-blocking
            { id: 'rock1B', weight: 20 }, // blocking
            { id: 'rock1C', weight: 12 }, // blocking
            { id: 'rock1D', weight: 6 },  // blocking
            { id: 'rock1E', weight: 2 },  // blocking
            { id: 'rock2A', weight: 60 }, // collectible, non-blocking
            { id: 'rock2B', weight: 20 }, // blocking
            { id: 'rock2C', weight: 12 }, // blocking
            { id: 'rock2D', weight: 6 },  // blocking
            { id: 'rock2E', weight: 2 },  // blocking
            { id: 'rock4A', weight: 60 }, // collectible, non-blocking
            { id: 'rock4B', weight: 20 }, // blocking
            { id: 'rock4C', weight: 12 }, // blocking
            { id: 'rock4D', weight: 6 },  // blocking
            { id: 'rock4E', weight: 2 },  // blocking
          ],
        },
        // Weighted tree variants
        trees: {
          maxActive: 20,
          minSpacing: 100,
          variants: [
            { id: 'tree1A', weight: 25 },
            { id: 'tree1B', weight: 20 },
            { id: 'tree1C', weight: 20 },
            { id: 'tree2A', weight: 15 },
            { id: 'tree2B', weight: 10 },
            { id: 'tree2C', weight: 10 },
          ],
        },
        // Weighted bush variants
        bushes: {
          maxActive: 30,
          minSpacing: 50,
          variants: [
            { id: 'bush1A', weight: 15 },
            { id: 'bush1B', weight: 15 },
            { id: 'bush1C', weight: 15 },
            { id: 'bush3A', weight: 10 },
            { id: 'bush3B', weight: 10 },
            { id: 'bush3C', weight: 10 },
            { id: 'berry_bushA1', weight: 6 },
            { id: 'berry_bushA2', weight: 6 },
            { id: 'berry_bushA3', weight: 6 },
            { id: 'berry_bushB1', weight: 6 },
            { id: 'berry_bushB2', weight: 6 },
            { id: 'berry_bushB3', weight: 6 },
            { id: 'cotton_bush1', weight: 3 },
            { id: 'cotton_bush2', weight: 3 },
            { id: 'cotton_bush3', weight: 3 },
          ],
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
