// data/itemDatabase.js
// PURE DATA — items only, no UI or rules here.

export const ITEM_IDS = {
  SLINGSHOT: 'slingshot',
  SLINGSHOT_ROCK: 'slingshot_rock',
  CRUDE_BAT: 'crude_bat',
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
    world: { textureKey: 'slingshot', scale: 1.0 },

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
      damage: 5,
      knockback: 5,

      // Charging support
      canCharge: true,
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
      damage: 15,
      knockback: 15,

      // Charging support
      canCharge: true,
      chargeMaxMs: 1000, 
      maxChargeDamage: 20,
      maxChargeKnockback: 25,

      // Swing tuning
      swingDurationMs: 160,
      swingCooldownMs: 100,
      chargeMaxMs: 2000,

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

  //slingshot rock
  //--------------
  [ITEM_IDS.SLINGSHOT_ROCK]: {
    id: ITEM_IDS.SLINGSHOT_ROCK,
    name: 'Rock',
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
  // Resources
  //-------------------------------

  //rocks
  //-----
  rock2A: {
    id: 'rock2A',
    name: 'Small Grassy Rock',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon:  { textureKey: 'rock2A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'rock2A', scale: .65 },
    collectible: true,          // custom flag for pickup
    blocking: false,            // walk-through
    givesItem: ITEM_IDS.SLINGSHOT_ROCK,
    giveAmount: 1,
    depth: 1,
    tags: ['resource', 'rock'],
    meta: { rarity: 'common' },
  },

  rock2B: {
    id: 'rock2B',
    name: 'Medium Grassy Rock',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon:  { textureKey: 'rock2B', scale: 1.0, ox: 0, oy: 0 },
    world: {  
      textureKey: 'rock2B',
      scale: 1.0,
      origin: { x: 0.5, y: 1 },
      body: { kind: 'circle', radius: 8, offsetX: 0, offsetY: -11, useScale: true, anchor: 'bottomCenter' }

    },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'rock'],
    meta: { rarity: 'uncommon' },
  },

  rock2C: {
    id: 'rock2C',
    name: 'Large Grassy Rock',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon:  { textureKey: 'rock2C', scale: 1.0, ox: 0, oy: 0 },
    world: {
      textureKey: 'rock2C',
      scale: 1.0,
      origin: { x: 0.5, y: 1 },
      body: { kind: 'circle', radius: 12, offsetX: 0, offsetY: -11, useScale: true, anchor: 'bottomCenter' }
    },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'rock'],
    meta: { rarity: 'rare' },
  },

  rock2D: {
    id: 'rock2D',
    name: 'Huge Grassy Rock',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon:  { textureKey: 'rock2D', scale: 1.0, ox: 0, oy: 0 },
    world: {
      textureKey: 'rock2D',
      scale: 1.0,
      origin: { x: 0.5, y: 1 },
      body: { kind: 'circle', radius: 18, offsetX: 0, offsetY: -12, useScale: true, anchor: 'bottomCenter' }
    },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'rock'],
    meta: { rarity: 'very_rare' },
  },

  rock2E: {
    id: 'rock2E',
    name: 'Giant Grassy Rock',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon:  { textureKey: 'rock2E', scale: 1.0, ox: 0, oy: 0 },
    world: {
      textureKey: 'rock2E',
      scale: 1.0,
      origin: { x: 0.5, y: 1 },
      body: { kind: 'circle', radius: 24, offsetX: 0, offsetY: -13, useScale: true, anchor: 'bottomCenter' }
    },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'rock'],
    meta: { rarity: 'legendary' },
  },

};

export const GROUPS = {
  weapons: [ITEM_IDS.SLINGSHOT, ITEM_IDS.CRUDE_BAT],
  ammo: [ITEM_IDS.SLINGSHOT_ROCK ],
};
