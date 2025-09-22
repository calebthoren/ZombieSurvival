// data/itemDatabase.js
// PURE DATA — inventory items only; world resources live in resourceDatabase.js.
// Resources that yield items reference ITEM_IDS via `givesItem`.

export const ITEM_IDS = {
  SLINGSHOT: 'slingshot',
  SLINGSHOT_ROCK: 'slingshot_rock',
  CRUDE_BAT: 'crude_bat',
  ROCK1A: 'rock1A',
  ROCK2A: 'rock2A',
  ROCK3A: 'rock3A',
  ROCK4A: 'rock4A',
  ROCK5A: 'rock5A',
};

export const ITEM_TYPES = {
  WEAPON: 'weapon',
  AMMO: 'ammo',
  RESOURCE: 'resource',
  CONSUMABLE: 'consumable',
  TOOL: 'tool',
};

export const WEAPON_CATEGORIES = {
  MELEE: 'melee',
  RANGED: 'ranged',
  TOOL: 'tool',
};

export const ITEM_DB = {

  //-------------------------------
  // Weapons
  //-------------------------------

  //slingshot (ranged)
  //------------------
    [ITEM_IDS.SLINGSHOT]: {
    id: ITEM_IDS.SLINGSHOT,
    name: 'Slingshot',
    type: ITEM_TYPES.WEAPON,
    stackable: false,
    maxStack: 1,

    // visuals (standalone images by default)
    icon: { textureKey: 'slingshot', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'slingshot', scale: 0.5 },

    showCountOnIcon: true, // show total ammo on the weapon icon

    sounds: {
        shoot: 'sfx_slingshot_shoot',
        dry: 'sfx_dry_fire',
        equip: 'sfx_equip',
    },

    // data/itemDatabase.js — inside ITEM_DB[ITEM_IDS.SLINGSHOT]
        weapon: {
            category: WEAPON_CATEGORIES.RANGED,
            usesAmmo: true,
            compatibleAmmo: [ITEM_IDS.SLINGSHOT_ROCK],

            // damage/knockback
            minDamage: 5,
            maxDamage: 5,
            knockback: 5,

            // Charging support
            canCharge: true,
            chargeMaxMs: 1500,
            maxChargeDamage: 10,
            maxChargeKnockback: 8,

            // Tuning
            projectileTexture: 'slingshot_rock',
            projectileFrame: null,
            projectileSpeed: 520,
            minRange: 250,
            maxRange: 500,
            spread: 3,
            muzzleOffset: { x: 16, y: 6 },
            fireCooldownMs: 1000, // ranged fire cooldown (ms)

            // STAMINA + penalties when stamina is insufficient
            stamina: {
                baseCost: 5,             // at 0% charge
                maxCost: 10,             // at 100% charge
                poorChargeClamp: 0.15,   // when low stamin max charge is ~15%
                lowSpeedMultiplier: 0.75,      // e.g., 25% slower when tired
                lowCooldownMultiplier: 1.5,     // e.g., 1.0s → 1.5s when tired
                lowRangeMultiplier: 0.6  // e.g., cut travel distance to 60%
            },
        },



    tags: ['weapon', 'ranged', 'slingshot'],
    meta: { rarity: 'common' },
  },


  // crude bat (melee)
  //------------------
  [ITEM_IDS.CRUDE_BAT]: {
    id: ITEM_IDS.CRUDE_BAT,
    name: 'Crude Bat',
    type: ITEM_TYPES.WEAPON,
    stackable: false,
    maxStack: 1,

    // visuals
    icon:  { textureKey: 'crude_bat', scale: 1.1, ox: 0, oy: 0 },
    world: { textureKey: 'crude_bat', scale: 1.0 },

    showCountOnIcon: false,

    // data/itemDatabase.js — inside ITEM_DB[ITEM_IDS.CRUDE_BAT]
    weapon: {
        category: WEAPON_CATEGORIES.MELEE,
        usesAmmo: false,

        // Damage & knockback
        minDamage: 15,
        maxDamage: 15,
        knockback: 15,

        // Charging support
        canCharge: true,
        chargeMaxMs: 2000,
        maxChargeDamage: 20,
        maxChargeKnockback: 25,

        // Swing tuning
        swingDurationMs: 160,
        swingCooldownMs: 100,

        // Hit shape/reach
        range: 30,
        radius: 22,

        // STAMINA + penalties when stamina is insufficient
        stamina: {
            cost: 15,
            slowMultiplier: 6,
            cooldownMultiplier: 12,
            poorChargeClamp: 0.25,
        },
    },

    sounds: {
      swing: 'sfx_swing_wood',
      equip: 'sfx_equip',
    },

    tags: ['weapon', 'melee', 'bat'],
    meta: { rarity: 'common' },
  },


  //-------------------------------
  // Ammo
  //-------------------------------

  //slingshot ammo
  //-------------
  [ITEM_IDS.SLINGSHOT_ROCK]: {
    id: ITEM_IDS.SLINGSHOT_ROCK,
    name: 'Slingshot Ammo',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'slingshot_rock', scale: .5, ox: 0, oy: 0 },
    world: { textureKey: 'slingshot_rock', scale: 1.0 },

    showCountOnIcon: true,

    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      damageBonus: 0,
    },

    tags: ['ammo', 'rock', 'slingshot'],
    meta: { rarity: 'common' },
  },

  //-------------------------------
  // Materials / throwable rocks
  //-------------------------------

  [ITEM_IDS.ROCK1A]: {
    id: ITEM_IDS.ROCK1A,
    name: 'Small Rock',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'rock1A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock1A', scale: .65 },

    showCountOnIcon: true,
    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      minDamage: 1,
      maxDamage: 3,
      minRange: 50,
      maxRange: 100,
      maxChargeMs: 2000,
      speed: 300,
      knockback: 0,
    },

    tags: ['ammo', 'material', 'rock'],
    meta: { rarity: 'common' },
  },

  [ITEM_IDS.ROCK2A]: {
    id: ITEM_IDS.ROCK2A,
    name: 'Small Grassy Rock',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'rock2A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock2A', scale: .65 },

    showCountOnIcon: true,
    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      minDamage: 1,
      maxDamage: 3,
      minRange: 50,
      maxRange: 100,
      maxChargeMs: 2000,
      speed: 300,
      knockback: 0,
    },

    tags: ['ammo', 'material', 'rock'],
    meta: { rarity: 'common' },
  },

  [ITEM_IDS.ROCK3A]: {
    id: ITEM_IDS.ROCK3A,
    name: 'Small Sandstone',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'rock3A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock3A', scale: 0.65 },

    showCountOnIcon: true,
    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      minDamage: 1,
      maxDamage: 3,
      minRange: 50,
      maxRange: 100,
      maxChargeMs: 2000,
      speed: 300,
      knockback: 0,
    },

    tags: ['ammo', 'material', 'rock'],
    meta: { rarity: 'common' },
  },

  [ITEM_IDS.ROCK4A]: {
    id: ITEM_IDS.ROCK4A,
    name: 'Small Limestone',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'rock4A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock4A', scale: 0.65 },

    showCountOnIcon: true,
    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      minDamage: 1,
      maxDamage: 3,
      minRange: 50,
      maxRange: 100,
      maxChargeMs: 2000,
      speed: 300,
      knockback: 0,
    },

    tags: ['ammo', 'material', 'rock'],
    meta: { rarity: 'common' },
  },

  [ITEM_IDS.ROCK5A]: {
    id: ITEM_IDS.ROCK5A,
    name: 'Small Marble Rock',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'rock5A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock5A', scale: .65 },

    showCountOnIcon: true,
    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      minDamage: 1,
      maxDamage: 3,
      minRange: 50,
      maxRange: 100,
      maxChargeMs: 2000,
      speed: 300,
      knockback: 0,
    },

    tags: ['ammo', 'material', 'rock'],
    meta: { rarity: 'common' },
  },

};

export const GROUPS = {
  weapons: [ITEM_IDS.SLINGSHOT, ITEM_IDS.CRUDE_BAT],
  ammo: [
    ITEM_IDS.SLINGSHOT_ROCK,
    ITEM_IDS.ROCK1A,
    ITEM_IDS.ROCK2A,
    ITEM_IDS.ROCK3A,
    ITEM_IDS.ROCK4A,
    ITEM_IDS.ROCK5A,
  ],
  materials: [
    ITEM_IDS.ROCK1A,
    ITEM_IDS.ROCK2A,
    ITEM_IDS.ROCK3A,
    ITEM_IDS.ROCK4A,
    ITEM_IDS.ROCK5A,
  ],
};
