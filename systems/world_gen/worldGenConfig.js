// systems/world_gen/worldGenConfig.js
// PURE DATA ONLY — no logic. Tunable world gen + day/night + spawn settings.

import { RESOURCE_IDS } from '../../data/resourceDatabase.js';

export const BIOME_IDS = {
    PLAINS: 0,
    FOREST: 1,
    DESERT: 2,
};

// Controls the size of biome patches in world generation.
// Smaller values produce larger patches; larger values yield smaller patches.
// Typical range: 0.01 (very large areas) to 1.0 (tiny, noisy patches).
export const BIOME_SCALE = 0.08;

export const WORLD_GEN = {
  // Seed for deterministic world generation; overridable via global WORLD_GEN_SEED
  seed: globalThis.WORLD_GEN_SEED ?? Date.now(),
  // -----------------------------
  // World bounds / scale (future)
  // -----------------------------
  world: {
    width: 10000,  // logical world width (px). You can expand later.
    height: 10000, // logical world height (px).
  },

  // -----------------------------
  // Chunk settings (session only)
  // -----------------------------
  chunk: {
    size: 500,
    // Biome color blending (chunk backgrounds)
    blendRadius: 50, // width of edge blending in pixels (also sets sample spacing)
    blendFalloff: 1.0, // easing for edge fade (1 = linear)
    blendDensity: 4, // multiplier for sample grid (higher = smaller pixels)
    blendJitter: 0.5, // amount of noisy edge distortion (0 = straight)
    blendNoiseScale: 0.1, // scale of noise used for edge distortion
  },

  // Biome-specific RNG seeds
  biomeSeeds: {
    [BIOME_IDS.PLAINS]: 12345,
    [BIOME_IDS.FOREST]: 67890,
    [BIOME_IDS.DESERT]: 13579,
  },

  // Debug fill colors for biome backgrounds
  biomeColors: {
    [BIOME_IDS.PLAINS]: 0x228B22,
    [BIOME_IDS.FOREST]: 0x8B4513,
    [BIOME_IDS.DESERT]: 0xFFD700,
  },

  // -----------------------------
  // Day/Night cycle (arcade-style)
  // -----------------------------
  // Goal: fast cycles, plenty of daytime to build/explore, but night happens often.
  // Total cycle = dayMs + nightMs (plus smooth transitions for the overlay).
  dayNight: {
    dayMs: 240_000,          // 4 min day
    nightMs: 120_000,        // 2 min night
    transitionMs: 15_000,    // 15s fade before/after night
    nightOverlayAlpha: 0.55, // darkness amount at deepest night (0..1)
    segments: {
        perPhase: 3, // day/night are broken into thirds for pacing cues
        day: {
            labels: ['Morning', 'Afternoon', 'Evening'],
        },
        night: {
            labels: ['Nightfall', 'Midnight', 'Late Night'],
        },
    },
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
          maxActive: 20,
          minSpacing: 100,  // pixels between rock centers
          clusterMin: 1,
          clusterMax: 6,
          clusterGrowth: 0.2,
          respawnDelayMs: { min: 5000, max: 7000 },
          variants: [
            { id: RESOURCE_IDS.ROCK1A, weight: 40 },
            { id: RESOURCE_IDS.ROCK1B, weight: 20 },
            { id: RESOURCE_IDS.ROCK1C, weight: 10 },
            { id: RESOURCE_IDS.ROCK1D, weight: 6 },
            { id: RESOURCE_IDS.ROCK1E, weight: 3 },
            { id: RESOURCE_IDS.ROCK2A, weight: 40 },
            { id: RESOURCE_IDS.ROCK2C, weight: 10 },
            { id: RESOURCE_IDS.ROCK2D, weight: 6 },
            { id: RESOURCE_IDS.ROCK2E, weight: 3 },
            { id: RESOURCE_IDS.ROCK3A, weight: 40, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK3B, weight: 20, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK3C, weight: 10, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK3D, weight: 6,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK3E, weight: 3,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK4A, weight: 40, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK4B, weight: 20, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK4C, weight: 10, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK4D, weight: 6,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK4E, weight: 3,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.ROCK5A, weight: 40 },
            { id: RESOURCE_IDS.ROCK5B, weight: 20 },
            { id: RESOURCE_IDS.ROCK5C, weight: 10 },
            { id: RESOURCE_IDS.ROCK5D, weight: 6 },
            { id: RESOURCE_IDS.ROCK5E, weight: 3 },
          ],
        },
        // Weighted tree variants
        trees: {
          maxActive: 30,
          minSpacing: 100,
          clusterMin: 1,
          clusterMax: 6,
          variants: [
            { id: RESOURCE_IDS.TREE1A, weight: 20, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE1B, weight: 10, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE1C, weight: 3,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE2A, weight: 10, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE2B, weight: 5,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE2C, weight: 3,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE3A, weight: 20, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE3B, weight: 10, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE3C, weight: 3,  biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.LOG1, weight: 8,  biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.LOG2, weight: 8,  biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.STUMP1, weight: 5, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.STUMP2, weight: 5, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.STUMP3, weight: 5, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.STUMP4, weight: 5, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.STUMP5, weight: 5, biomes: [BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.TREE10A, weight: 17, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.TREE10B, weight: 7,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.TREE10C, weight: 1,  biomes: [BIOME_IDS.DESERT] },
          ],
        },
        // Weighted bush variants
        bushes: {
          maxActive: 18,
          minSpacing: 50,
          clusterMin: 1,
          clusterMax: 6,
          variants: [
            { id: RESOURCE_IDS.BUSH1A, weight: 30, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH1B, weight: 15, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH1C, weight: 5,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH2A, weight: 30, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH2B, weight: 15, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH2C, weight: 5,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH3A, weight: 20, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH3B, weight: 10, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH3C, weight: 3,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH4A, weight: 30, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH4B, weight: 15, biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.BUSH4C, weight: 5,  biomes: [BIOME_IDS.PLAINS, BIOME_IDS.FOREST] },
            { id: RESOURCE_IDS.DEAD_BUSH1, weight: 40, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.DEAD_BUSH2, weight: 20, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.DEAD_BUSH3, weight: 10, biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.DEAD_BUSH4, weight: 5,  biomes: [BIOME_IDS.DESERT] },
            { id: RESOURCE_IDS.BERRY_BUSHA1, weight: 10, biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.BERRY_BUSHA2, weight: 3,  biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.BERRY_BUSHA3, weight: 1,  biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.BERRY_BUSHB1, weight: 10, biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.BERRY_BUSHB2, weight: 3,  biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.BERRY_BUSHB3, weight: 1,  biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.COTTON_BUSH1, weight: 20, biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.COTTON_BUSH2, weight: 10, biomes: [BIOME_IDS.PLAINS] },
            { id: RESOURCE_IDS.COTTON_BUSH3, weight: 3,  biomes: [BIOME_IDS.PLAINS] },
          ],
        },
      },

    // Resource type weights per biome
    // Biome-specific resource type distribution
    resourceWeights: {
      [BIOME_IDS.PLAINS]: [
        { key: 'bushes', weight: 70 },
        { key: 'rocks', weight: 15 },
        { key: 'trees', weight: 15 },
      ],
      [BIOME_IDS.DESERT]: [
        { key: 'rocks', weight: 70 },
        { key: 'bushes', weight: 20 },
        { key: 'trees', weight: 10 },
      ],
      [BIOME_IDS.FOREST]: [
        { key: 'trees', weight: 70 },
        { key: 'rocks', weight: 15 },
        { key: 'bushes', weight: 15 },
      ],
    },

    // Enemies
    zombie: {
      // DAY: Rare trickle
      day: {
        minDelayMs: 20_000,  // fixed interval between checks
        maxDelayMs: 20_000,
        chance: 0.15,        // 15% chance to spawn 1 when timer fires
      },

      // NIGHT: Occasional trickle
      nightTrickle: {
        minDelayMs: 20_000,
        maxDelayMs: 20_000,
        chance: 0.5,        // 50% chance to spawn 1 when timer fires
      },

      // NIGHT: Waves
      nightWaves: {
        waveIntervalMs: 30_000, // time between waves
        baseCount: 3,           // zombies in wave 1
        perWave: 2,             // +N per subsequent wave
        perDay: 2,              // +2 zombies added per day
        maxCount: 25,           // clamp
        burstIntervalMs: 200,   // gap between individuals within a wave
      },
    },
  },
  spawn: { x: 5000, y: 5000 },
};

// Center spawn point (re-export for convenience)
export const spawn = WORLD_GEN.spawn;

// Session-scoped metadata for procedural chunks
export const chunkMetadata = new Map();
