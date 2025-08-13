// data/zombieDatabase.js
// Central place to tune zombie types/stats.

const ZOMBIES = {
    walker: {
        // Presentation
        textureKey: 'zombie',
        scale: 0.1,
        depth: 2,

        // Core stats
        speed: 40,            // px/s pursuit speed
        health: 25,           // max HP
        damage: 10,           // per attack (hook into your player damage when you’re ready)

        // AI ranges / timing
        aggroRange: 420,      // start chasing when within this distance (px)
        attackCooldownMs: 800,

        // Meta
        score: 10,            // score value when killed
        spawnWeight: 10,      // used by spawner weighting later

        // Daytime eligibility
        canSpawnDay: true,

        // Loot table (empty for now)
        loot: [],

        // Resistances (1.0 = normal; lower = takes less / gets pushed less)
        resist: {
            rangedMult: 1.0,     // damage multiplier for ranged
            meleeMult: 1.0,      // damage multiplier for melee
            knockback: 0.2       // 0..1 (portion resisted). 0.2 = resists 20% of knockback
        },

        // HP bar visuals (optional overrides)
        hpBar: { width: 18, height: 3, yOffsetFactor: 0.60 },

        // Optional Arcade body (leave commented until needed)
        // body: { kind: 'circle', radius: 12, offsetX: 0, offsetY: 0 }
    }
};

export default ZOMBIES;
