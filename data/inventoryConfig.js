// data/inventoryConfig.js
// Pure data: sizes, counts, and rules for the inventory UI/behavior.
export const INVENTORY_CONFIG = {
  gridCols: 5,
  gridRows: 6,
  hotbarCount: 5,

  wheelStep: 1,
  rightClickSplitsHalf: true,
  mirrorHotbarToBottomHud: true,

  // Optional UI hints (UIScene may read these or keep its own constants)
  slotSize: 44,
  padding: 8,
};
