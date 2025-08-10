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
      compatibleAmmo: [ITEM_IDS.SLINGSHOT_ROCK], // add more later
      fireRate: 2.5,              // shots/sec
      projectileTexture: 'slingshot_rock',
      projectileFrame: null,
      projectileSpeed: 520,
      spread: 3,                  // degrees
      knockback: 80,
      damage: 12,
      muzzleOffset: { x: 16, y: 6 },
    },

    tags: ['weapon', 'ranged', 'slingshot'],
    meta: { rarity: 'common' },
  },

  // crude bat (melee)
  [ITEM_IDS.CRUDE_BAT]: {
    id: ITEM_IDS.CRUDE_BAT,
    name: 'Crude Bat',
    type: ITEM_TYPES.WEAPON,
    stackable: false,
    maxStack: 1,

    // visuals
    icon:  { textureKey: 'crude_bat', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'crude_bat', scale: 1.0 },

    showCountOnIcon: false,

    weapon: {
      category: WEAPON_CATEGORIES.MELEE,
      usesAmmo: false,
      swingDurationMs: 160,
      swingCooldownMs: 280,
      range: 30,
      radius: 22,
      damage: 25,
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
  [ITEM_IDS.SLINGSHOT_ROCK]: {
    id: ITEM_IDS.SLINGSHOT_ROCK,
    name: 'Rock',
    type: ITEM_TYPES.AMMO,
    stackable: true,
    maxStack: 99,

    icon: { textureKey: 'slingshot_rock', scale: 1.0, ox: 0, oy: 0 },
    world: { textureKey: 'slingshot_rock', scale: 1.0 },

    showCountOnIcon: true,

    sounds: { pickup: 'sfx_pickup_small' },

    ammo: {
      damageBonus: 0,
    },

    tags: ['ammo', 'rock', 'slingshot'],
    meta: { rarity: 'common' },
  },
};

export const GROUPS = {
  weapons: [ITEM_IDS.SLINGSHOT, ITEM_IDS.CRUDE_BAT],
  ammo: [ITEM_IDS.SLINGSHOT_ROCK ],
};
