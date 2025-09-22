// data/zombieDatabase.js
// Central place to tune zombie types/stats.

const ZOMBIES = {
    // Basic walker
    walker: {
        name: 'Walker',
        textureKey: 'zombie',
        scale: 0.1,
        // Match player depth so zombies render under tree canopies when north
        // of the trunk and over the trunk when south of it.
        depth: 900,

        // Core stats
        health: 25,
        speed: 40,
        damage: 5,
        aggroRange: 200,
        attackCooldownMs: 800,

        // Spawning
        spawnWeight: 10,
        canSpawnDay: true,

        // Resistances
        // - rangedMult / meleeMult: 1 = normal, <1 resists, >1 takes more
        // - knockback: 0..1 (fraction of knockback resisted)
        resist: { rangedMult: 1, meleeMult: 1, knockback: 0.0 },

        // Stagger/Stun
        staggerThreshold: 10,
        stunDurationMs: 250,

        // HP bar visuals
        hpBar: { width: 18, height: 3, yOffsetFactor: 0.6 },

        // Loot scaffolding (placeholder):
        // When you want drops, add entries to loot.table like:
        // { itemId: 'slingshot_rock', min: 1, max: 3, weight: 10, chance: 0.6 }
        // With an empty table, MainScene._maybeDropLoot() will drop nothing.
        loot: {
            table: []
        }
    },

    // Fire zombie with light emission
    flamed_walker: {
        name: 'Flamed Walker',
        texture: 'flamed_walker',   // fallback for older code
        textureKey: 'flamed_walker',
        scale: 0.1,
        depth: 900,

        // Core stats - same as walker but night-only
        health: 25,
        speed: 40,
        damage: 5,
        aggroRange: 200,
        attackCooldownMs: 800,

        // Spawning - night only, lower weight to keep special
        spawnWeight: 4,
        canSpawnDay: false,

        // Resistances - same as walker
        resist: { rangedMult: 1, meleeMult: 1, knockback: 0.0 },

        // Stagger/Stun
        staggerThreshold: 10,
        stunDurationMs: 250,

        // HP bar visuals
        hpBar: { width: 18, height: 3, yOffsetFactor: 0.6 },

        // Light emission - glows in the dark
        light: { radius: 96, intensity: 1, maskScale: 0.9 },

        // Loot scaffolding (placeholder)
        loot: {
            table: []
        }
    },

};

export default ZOMBIES;
