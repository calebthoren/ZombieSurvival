// data/itemDatabase.js
// PURE DATA — items only, no UI or rules here.

export const ITEM_IDS = {
  SLINGSHOT: 'slingshot',
  SLINGSHOT_ROCK: 'slingshot_rock',
  // Future:
  // STEEL_BALL: 'steel_ball',
  // WOOD_BAT: 'wood_bat',
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
  //slingshot
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
  weapons: [ITEM_IDS.SLINGSHOT /*, ITEM_IDS.WOOD_BAT */],
  ammo: [ITEM_IDS.SLINGSHOT_ROCK /*, ITEM_IDS.STEEL_BALL */],
};
