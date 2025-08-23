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

  // Trees
  tree1A: {
    id: 'tree1A',
    name: 'Tree 1A',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree1A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree1A', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },
  tree1B: {
    id: 'tree1B',
    name: 'Tree 1B',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree1B', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree1B', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },
  tree1C: {
    id: 'tree1C',
    name: 'Tree 1C',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree1C', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree1C', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },
  tree2A: {
    id: 'tree2A',
    name: 'Tree 2A',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree2A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree2A', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },
  tree2B: {
    id: 'tree2B',
    name: 'Tree 2B',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree2B', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree2B', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },
  tree2C: {
    id: 'tree2C',
    name: 'Tree 2C',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'tree2C', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'tree2C', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: true,
    depth: 1,
    tags: ['resource', 'tree'],
    meta: { rarity: 'common' },
  },

  // Bushes
  bush1A: {
    id: 'bush1A',
    name: 'Bush 1A',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush1A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush1A', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  bush1B: {
    id: 'bush1B',
    name: 'Bush 1B',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush1B', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush1B', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  bush1C: {
    id: 'bush1C',
    name: 'Bush 1C',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush1C', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush1C', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  bush3A: {
    id: 'bush3A',
    name: 'Bush 3A',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush3A', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush3A', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  bush3B: {
    id: 'bush3B',
    name: 'Bush 3B',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush3B', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush3B', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  bush3C: {
    id: 'bush3C',
    name: 'Bush 3C',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'bush3C', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'bush3C', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },

  // Berry bushes
  berry_bushA1: {
    id: 'berry_bushA1',
    name: 'Berry Bush A1',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushA1', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushA1', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  berry_bushA2: {
    id: 'berry_bushA2',
    name: 'Berry Bush A2',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushA2', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushA2', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  berry_bushA3: {
    id: 'berry_bushA3',
    name: 'Berry Bush A3',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushA3', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushA3', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  berry_bushB1: {
    id: 'berry_bushB1',
    name: 'Berry Bush B1',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushB1', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushB1', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  berry_bushB2: {
    id: 'berry_bushB2',
    name: 'Berry Bush B2',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushB2', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushB2', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  berry_bushB3: {
    id: 'berry_bushB3',
    name: 'Berry Bush B3',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'berry_bushB3', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'berry_bushB3', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },

  // Cotton bushes
  cotton_bush1: {
    id: 'cotton_bush1',
    name: 'Cotton Bush 1',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'cotton_bush1', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'cotton_bush1', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  cotton_bush2: {
    id: 'cotton_bush2',
    name: 'Cotton Bush 2',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'cotton_bush2', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'cotton_bush2', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
  cotton_bush3: {
    id: 'cotton_bush3',
    name: 'Cotton Bush 3',
    type: ITEM_TYPES.RESOURCE,
    stackable: false,
    maxStack: 1,
    icon: { textureKey: 'cotton_bush3', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'cotton_bush3', scale: 1.0, origin: { x: 0.5, y: 1 } },
    collectible: false,
    blocking: false,
    depth: 1,
    tags: ['resource', 'bush'],
    meta: { rarity: 'common' },
  },
};

export const GROUPS = {
  weapons: [ITEM_IDS.SLINGSHOT, ITEM_IDS.CRUDE_BAT],
  ammo: [ITEM_IDS.SLINGSHOT_ROCK ],
};
