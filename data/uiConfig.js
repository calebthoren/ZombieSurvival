// data/uiConfig.js
// PURE DATA — UI layout/theme hints used by UIScene.

export const UI_CONFIG = {
  // inventory/hotbar layout
  slotSize: 44,
  hotbarCount: 5,        // keys 1–5
  inventoryCols: 5,
  inventoryRows: 6,      // not counting the top hotbar row

  // spacing & placement used in UIScene
  hotbarBottomOffset: 60,  // px from bottom
  slotSpacing: 8,          // bottom hotbar spacing
  panelMarginX: 50,
  panelMarginY: 100,
  panelHeightOffset: 240,  // screenHeight - this

  // visuals/text
  countFont: '12px',
  countFontFamily: 'monospace',
  showStackLabelIfQtyGte: 2,

  // theme colors (hex numbers for Phaser fill styles)
  colors: {
    hotbarSlot: 0x333333,
    invSlot: 0x222222,
    hotbarOutline: 0xffffff,
    hotbarSelected: 0xffff00,
    invOutline: 0x888888,
  },
};
