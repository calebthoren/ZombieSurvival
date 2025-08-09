// systems/inventoryModel.js
// State + logic only (no Phaser). Keeps hotbar/grid arrays and stacking rules.
import { ITEM_DB } from '../data/itemDatabase.js';
import { INVENTORY_CONFIG } from '../data/inventoryConfig.js';

export default class InventoryModel {
  constructor(eventBus) {
    this.events = eventBus; // Phaser.Scene.events is fine
    const { gridCols, gridRows, hotbarCount } = INVENTORY_CONFIG;
    this.hotbar = Array.from({ length: hotbarCount }, () => null);      // { id, count } | null
    this.grid   = Array.from({ length: gridCols * gridRows }, () => null);
    this.selectedHotbarIndex = 0;
  }

  // ---------- helpers
  #maxStack(id)  { return ITEM_DB[id]?.maxStack ?? 1; }
  #stackable(id) { return ITEM_DB[id]?.stackable === true; }
  #compatAmmo(weaponId) { return ITEM_DB[weaponId]?.weapon?.compatibleAmmo ?? []; }
  #arr(area) { return area === 'hotbar' ? this.hotbar : this.grid; }

  // ---------- selection
  getEquipped() { return this.hotbar[this.selectedHotbarIndex]; }
  setSelectedHotbarIndex(i) {
    if (i < 0 || i >= this.hotbar.length) return;
    this.selectedHotbarIndex = i;
    this.events.emit('inv:hotbarSelected', i);
    this.events.emit('inv:changed');
  }

  // ---------- adding (grid-first, then hotbar)
  addItem(id, count = 1) {
    const stack = (arr) => {
      if (!this.#stackable(id)) return false;
      for (let i = 0; i < arr.length && count > 0; i++) {
        const s = arr[i];
        if (s?.id === id) {
          const can = this.#maxStack(id) - s.count;
          if (can > 0) {
            const add = Math.min(can, count);
            s.count += add; count -= add;
            this.events.emit('inv:slotChanged', { area: arr === this.hotbar ? 'hotbar' : 'grid', index: i });
          }
        }
      }
      return count === 0;
    };
    const empty = (arr) => {
      for (let i = 0; i < arr.length && count > 0; i++) {
        if (!arr[i]) {
          const add = Math.min(this.#maxStack(id), count);
          arr[i] = { id, count: add }; count -= add;
          this.events.emit('inv:slotChanged', { area: arr === this.hotbar ? 'hotbar' : 'grid', index: i });
        }
      }
      return count === 0;
    };

    if (!stack(this.grid))  stack(this.hotbar);
    if (!empty(this.grid))  empty(this.hotbar);

    this.events.emit('inv:changed');
    return count === 0;
  }

  // ---------- moving / merging / swapping (slot-to-slot)
  move(fromArea, fromIndex, toArea, toIndex) {
    const A = this.#arr(fromArea);
    const B = this.#arr(toArea);
    const a = A[fromIndex], b = B[toIndex];
    if (!a && !b) return;

    if (!b) { // move
      B[toIndex] = a; A[fromIndex] = null;
    } else if (b.id === a.id && this.#stackable(a.id)) { // merge
      const max = this.#maxStack(a.id);
      const can = Math.max(0, max - b.count);
      const moved = Math.min(can, a.count);
      b.count += moved; a.count -= moved;
      if (a.count <= 0) A[fromIndex] = null;
    } else { // swap
      A[fromIndex] = b; B[toIndex] = a;
    }

    this.events.emit('inv:slotChanged', { area: fromArea, index: fromIndex });
    this.events.emit('inv:slotChanged', { area: toArea, index: toIndex });
    this.events.emit('inv:changed');
  }

  // ---------- take & place (for drag-and-drop / wheel / right-click)
  /** Remove the entire stack from a slot. Returns {id,count} or null */
  takeAll(area, index) {
    const arr = this.#arr(area);
    const s = arr[index];
    if (!s) return null;
    arr[index] = null;
    this.events.emit('inv:slotChanged', { area, index });
    this.events.emit('inv:changed');
    return { id: s.id, count: s.count };
  }

  /** Split off amount (default half). Returns {id,count} or null */
  split(area, index, amount) {
    const arr = this.#arr(area);
    const s = arr[index]; if (!s || s.count <= 1) return null;
    const take = (amount !== undefined && amount !== null)
  ? amount
  : Math.floor(s.count / 2) || 1;

    const n = Math.min(take, s.count - 1);
    s.count -= n;
    this.events.emit('inv:slotChanged', { area, index });
    this.events.emit('inv:changed');
    return { id: s.id, count: n };
  }

  /**
   * Place up to `amount` of `item` into a slot.
   * - If slot empty -> place min(maxStack, amount)
   * - If same id and stackable -> merge up to maxStack
   * - If different id -> swap FULL item only when amount === item.count (carry whole stack)
   *
   * Returns { leftover: {id,count}|null, swapped: {id,count}|null }
   */
  place(area, index, item, amount = item.count) {
    const arr = this.#arr(area);
    const dest = arr[index];
    let leftover = null;
    let swapped = null;

    if (!dest) {
      const put = Math.min(this.#maxStack(item.id), amount);
      arr[index] = { id: item.id, count: put };
      const remaining = item.count - put;
      if (remaining > 0) leftover = { id: item.id, count: remaining };
    } else if (dest.id === item.id && this.#stackable(item.id)) {
      const max = this.#maxStack(item.id);
      const can = Math.max(0, max - dest.count);
      const put = Math.min(can, amount);
      dest.count += put;
      const remaining = item.count - put;
      if (remaining > 0) leftover = { id: item.id, count: remaining };
    } else {
      // different item -> only allow swap when placing the whole carried stack
      if (amount === item.count) {
        swapped = { id: dest.id, count: dest.count };
        arr[index] = { id: item.id, count: item.count };
      } else {
        // can't partially place onto an occupied different item
        leftover = { id: item.id, count: item.count };
      }
    }

    this.events.emit('inv:slotChanged', { area, index });
    this.events.emit('inv:changed');
    return { leftover, swapped };
  }

  // ---------- counts / ammo
  countById(id) {
    let t = 0;
    for (const s of this.hotbar) if (s?.id === id) t += s.count;
    for (const s of this.grid)   if (s?.id === id) t += s.count;
    return t;
  }

  firstViableAmmoFor(weaponId) {
    const compat = this.#compatAmmo(weaponId);
    if (!compat.length) return null;

    // "Earliest in UI order" means: hotbar (0->end) then grid (row-major)
    const scan = (arr, area) => {
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        if (s && s.count > 0 && compat.includes(s.id)) return { area, index: i, ammoId: s.id };
      }
      return null;
    };
    return scan(this.hotbar, 'hotbar') || scan(this.grid, 'grid');
  }

  totalOfActiveAmmo(weaponId) {
    const first = this.firstViableAmmoFor(weaponId);
    if (!first) return { ammoId: null, total: 0 };
    const ammoId = first.ammoId;
    return { ammoId, total: this.countById(ammoId) };
  }

  consumeAmmo(ammoId, amount = 1) {
    const drain = (arr, area) => {
      for (let i = 0; i < arr.length && amount > 0; i++) {
        const s = arr[i]; if (!s || s.id !== ammoId) continue;
        const take = Math.min(amount, s.count);
        s.count -= take; amount -= take;
        if (s.count <= 0) arr[i] = null;
        this.events.emit('inv:slotChanged', { area, index: i });
      }
    };
    // consume from grid then hotbar (tweak if you prefer opposite)
    drain(this.grid, 'grid'); drain(this.hotbar, 'hotbar');
    const ok = amount <= 0;
    if (ok) this.events.emit('inv:changed');
    return ok;
  }
}
