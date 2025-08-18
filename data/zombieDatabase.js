// data/zombieDatabase.js
// Central place to tune zombie types/stats.

const ZOMBIES = {
    // Basic walker
    walker: {
        name: 'Walker',
        textureKey: 'zombie',
        scale: 0.1,
        depth: 2,

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

};

export default ZOMBIES;
