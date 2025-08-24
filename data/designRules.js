// data/designRules.js
// PURE DATA — gameplay/design rules that systems read.

export const DESIGN_RULES = {
  // When multiple ammo types are compatible, choose earliest stack in UI order.
  ammoSelection: 'earliest_stack', // top-left → bottom-right

  // Pickup routing for ammo/resources:
  // try inventory first; if full, fallback to hotbar; otherwise drop.
  pickupRouting: ['inventoryFirst', 'hotbarFallback', 'drop'],

  // Count rendering consistency hints
  counts: {
    clampToMaxStack: true,
  },

  // Resource interaction modifiers
  movement: {
    bushSlowMultiplier: 0.5,
  },
};
