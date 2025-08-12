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

    weapon: {
      category: WEAPON_CATEGORIES.RANGED,
      usesAmmo: true,
      compatibleAmmo: [ITEM_IDS.SLINGSHOT_ROCK],

      // Tuning
      projectileTexture: 'slingshot_rock',
      projectileFrame: null,
      projectileSpeed: 520,   // px/sec (travel speed)
      minRange: 250,          // px — tap
      maxRange: 500,          // px — fully charged (keep sane for early game)
      spread: 3,              // degrees
      knockback: 80,
      damage: 12,
      muzzleOffset: { x: 16, y: 6 },

      // STAMINA + penalties when stamina is insufficient
      stamina: {
          baseCost: 5,          // at 0% charge
          maxCost: 10,          // at 100% charge
          minDamageOnLow: 5,    // forced damage when low stamina
          poorChargeClamp: 0.15 // when low stamina, treat charge as ~15%
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

    weapon: {
      category: WEAPON_CATEGORIES.MELEE,
      usesAmmo: false,
      swingDurationMs: 160,
      swingCooldownMs: 80,
      range: 30,
      radius: 22,
      damage: 25,

      // STAMINA + penalties when stamina is insufficient
      stamina: {
        cost: 15,               // per swing
        minDamageOnLow: 8,      // forced damage when low stamina
        slowMultiplier: 3,      // swingDuration ×3
        cooldownMultiplier: 2,  // swingCooldown ×2
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

    icon: { textureKey: 'slingshot_rock', scale: .0, ox: 0, oy: 0 },
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
