// data/worldGenConfig.js
// PURE DATA ONLY — no logic. Tunable world gen + day/night + spawn settings.

import { RESOURCE_IDS } from './resourceDatabase.js';

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
          maxActive: 10,
          minSpacing: 100,  // pixels between rock centers
          clusterMin: 3,
          clusterMax: 6,
          respawnDelayMs: { min: 5000, max: 7000 },
          variants: [
            { id: RESOURCE_IDS.ROCK1A, weight: 40 }, // collectible, non-blocking
            { id: RESOURCE_IDS.ROCK1B, weight: 20 }, // blocking
            { id: RESOURCE_IDS.ROCK1C, weight: 10 }, // blocking
            { id: RESOURCE_IDS.ROCK1D, weight: 6 },  // blocking
            { id: RESOURCE_IDS.ROCK1E, weight: 3 },  // blocking
            { id: RESOURCE_IDS.ROCK2A, weight: 40 }, // collectible, non-blocking
            { id: RESOURCE_IDS.ROCK2C, weight: 10 }, // blocking
            { id: RESOURCE_IDS.ROCK2D, weight: 6 },  // blocking
            { id: RESOURCE_IDS.ROCK2E, weight: 3 },  // blocking
            { id: RESOURCE_IDS.ROCK5A, weight: 40 }, // collectible, non-blocking
            { id: RESOURCE_IDS.ROCK5B, weight: 20 }, // blocking
            { id: RESOURCE_IDS.ROCK5C, weight: 10 }, // blocking
            { id: RESOURCE_IDS.ROCK5D, weight: 6 },  // blocking
            { id: RESOURCE_IDS.ROCK5E, weight: 3 },  // blocking
          ],
        },
        // Weighted tree variants
        trees: {
          maxActive: 10,
          minSpacing: 100,
          clusterMin: 3,
          clusterMax: 6,
          variants: [
            { id: RESOURCE_IDS.TREE1A, weight: 20 },
            { id: RESOURCE_IDS.TREE1B, weight: 10 },
            { id: RESOURCE_IDS.TREE1C, weight: 3 },
            { id: RESOURCE_IDS.TREE2A, weight: 10 },
            { id: RESOURCE_IDS.TREE2B, weight: 5 },
            { id: RESOURCE_IDS.TREE2C, weight: 3 },
          ],
        },
        // Weighted bush variants
        bushes: {
          maxActive: 15,
          minSpacing: 50,
          clusterMin: 3,
          clusterMax: 6,
          variants: [
            { id: RESOURCE_IDS.BUSH1A, weight: 20 },
            { id: RESOURCE_IDS.BUSH1B, weight: 10 },
            { id: RESOURCE_IDS.BUSH1C, weight: 3 },
            { id: RESOURCE_IDS.BUSH3A, weight: 20 },
            { id: RESOURCE_IDS.BUSH3B, weight: 10 },
            { id: RESOURCE_IDS.BUSH3C, weight: 3 },
            { id: RESOURCE_IDS.BERRY_BUSHA1, weight: 10 },
            { id: RESOURCE_IDS.BERRY_BUSHA2, weight: 3 },
            { id: RESOURCE_IDS.BERRY_BUSHA3, weight: 1.5 },
            { id: RESOURCE_IDS.BERRY_BUSHB1, weight: 10 },
            { id: RESOURCE_IDS.BERRY_BUSHB2, weight: 3 },
            { id: RESOURCE_IDS.BERRY_BUSHB3, weight: 1.5 },
            { id: RESOURCE_IDS.COTTON_BUSH1, weight: 20 },
            { id: RESOURCE_IDS.COTTON_BUSH2, weight: 10 },
            { id: RESOURCE_IDS.COTTON_BUSH3, weight: 3 },
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
