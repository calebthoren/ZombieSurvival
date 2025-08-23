// scenes/UIScene.js
import InventoryModel from '../systems/inventoryModel.js';
import { INVENTORY_CONFIG } from '../data/inventoryConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import DevTools from '../systems/DevTools.js';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
        // Cache for icon scales (per texture key) to avoid recomputing
        this._iconScaleCache = new Map();
        // Debounce guard for bottom hotbar updates
        this._hotbarRefreshQueued = false;
        this._hotbarRefreshDelayMs = 16; // one frame-ish
        // Tweens used to pulse the charge bar when fully charged
        this._chargeGlowTweens = [];
        // NEW: cooldown overlay state
        this._activeCooldowns = new Map(); // itemId -> { start: ms, end: ms }
        this._slotOverlays = [];           // [{kind:'bottom'|'hotbar'|'grid', area, index, itemId, rect}]

    }

    init(data) {
        this.playerData = data.playerData || { health: 100, stamina: 100 };
        if (typeof this.playerData.health !== 'number') this.playerData.health = 100;
        if (typeof this.playerData.stamina !== 'number') this.playerData.stamina = 100;
    }

    create() {
        // -------------------------
        // Inventory model (logic)
        // -------------------------
        this.inventory = new InventoryModel(this.events);
        DevTools.applyTimeScale(this);

        // -------------------------
        // Basic HUD
        // -------------------------
        this.healthBarWidth = 200;
        this.healthBarHeight = 20;
        this.healthBarX = 10;
        this.healthBarY = 10;

        this.input.mouse.disableContextMenu();

        this.healthBarBackground = this.add.rectangle(
            this.healthBarX, this.healthBarY, this.healthBarWidth, this.healthBarHeight, 0x222222
        ).setOrigin(0, 0);

        this.healthBarFill = this.add.rectangle(
            this.healthBarX, this.healthBarY, this.healthBarWidth, this.healthBarHeight, 0xff0000
        ).setOrigin(0, 0);

        this.healthText = this.add.text(0, 0, '', {
            fontSize: '10px',
            fill: '#800000',
            fontFamily: 'monospace'
        });
        this.updateHealth();

        // --- Stamina Bar (below health) ---
        this.staminaBarWidth = 180;   // slightly smaller than health
        this.staminaBarHeight = 12;   // shorter
        this.staminaBarX = this.healthBarX;
        this.staminaBarY = this.healthBarY + this.healthBarHeight + 6;

        // background (black/gray like other bars)
        this.staminaBarBackground = this.add.rectangle(
            this.staminaBarX, this.staminaBarY, this.staminaBarWidth, this.staminaBarHeight, 0x222222
        ).setOrigin(0, 0);

        // fill (yellow)
        this.staminaBarFill = this.add.rectangle(
            this.staminaBarX, this.staminaBarY, this.staminaBarWidth, this.staminaBarHeight, 0xffff00
        ).setOrigin(0, 0);

        // number text (dark yellow/orange)
        this.staminaText = this.add.text(0, 0, '', {
            fontSize: '10px',
            fill: '#b8860b', // dark goldenrod-ish
            fontFamily: 'monospace'
        });
        this.updateStamina(this.playerData.stamina);


        // -------------------------
        // Bottom on-screen hotbar
        // -------------------------
        const screenW = this.cameras.main.width;
        const screenH = this.cameras.main.height;
        const spacing = INVENTORY_CONFIG.padding ?? 8;
        this.slotSize = INVENTORY_CONFIG.slotSize ?? 44;

        this.bottomHotbarRects = [];
        this.bottomHotbarVisuals = []; // [{icon, countText, numText, chargeBg, chargeFill}]
        this.selectedSlotIndex = 0;

        for (let i = 0; i < INVENTORY_CONFIG.hotbarCount; i++) {
            const x = screenW / 2 - ((this.slotSize + spacing) * 2) + i * (this.slotSize + spacing);
            const rect = this.add.rectangle(
                x, screenH - 60, this.slotSize, this.slotSize, 0x333333
            ).setStrokeStyle(2, 0xffffff).setAlpha(INVENTORY_CONFIG.slotAlpha).setOrigin(0, 0);
            this.bottomHotbarRects.push(rect);

            const numText = this.add.text(
                rect.x + 4, rect.y + 2, `${i + 1}`,
                { fontSize: '8px', fill: '#ffffff', fontFamily: 'monospace' }
            ).setAlpha(INVENTORY_CONFIG.slotAlpha).setDepth(11);

            const icon = this.add.image(
                rect.x + this.slotSize / 2, rect.y + this.slotSize / 2, ''
            ).setVisible(false).setDepth(10);

            const countText = this.add.text(
                rect.x + this.slotSize - 16, rect.y + this.slotSize - 16, '',
                { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
            ).setVisible(false).setDepth(11);

            // --- Charge bar (inside slot, above icon) ---
            const barW = Math.floor(this.slotSize * 0.8);
            const barH = 4;
            const barX = rect.x + Math.floor((this.slotSize - barW) / 2);
            const barY = rect.y + Math.floor(this.slotSize * 0.28);

            const chargeBg = this.add.rectangle(barX, barY, barW, barH, 0x000000)
                .setOrigin(0, 0).setVisible(false).setDepth(12).setAlpha(0.95);
            const chargeFill = this.add.rectangle(barX, barY, 0, barH, 0xffff00)
                .setOrigin(0, 0).setVisible(false).setDepth(13).setAlpha(1.0);

            this.bottomHotbarVisuals.push({ icon, countText, numText, chargeBg, chargeFill });
        }
        this.#highlightBottomHotbar(0);

        // Number keys to select hotbar slot
        this.input.keyboard.on('keydown', (event) => {
            const key = parseInt(event.key, 10);
            if (key >= 1 && key <= INVENTORY_CONFIG.hotbarCount) {
                this.selectedSlotIndex = key - 1;
                this.inventory.setSelectedHotbarIndex(this.selectedSlotIndex);
                this.#highlightBottomHotbar(this.selectedSlotIndex);
                this.#hideChargeUIForAll();
                this.#queueBottomHotbarRefresh();
            }
        });

        // -------------------------
        // Inventory Panel (with top hotbar + 6x5 grid)
        // -------------------------
        this.inventoryPanel = this.add.container().setVisible(false);

        const panelW = this.cameras.main.width - 100;
        const panelH = this.cameras.main.height - 240;
        const panelX = 50;
        const panelY = 100;

        // Panel background (uses config alpha)
        const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x444444)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xffffff)
            .setAlpha(INVENTORY_CONFIG.panelAlpha);
        this.inventoryPanel.add(panelBg);
        this.panelBg = panelBg;

        // Visual dividers (cosmetic)
        const third = panelW / 3;
        const d1x = panelX + third, d2x = panelX + 2 * third;
        const divider1 = this.add.line(0, 0, d1x, panelY, d1x, panelY + panelH, 0xffffff)
            .setLineWidth(2).setAlpha(INVENTORY_CONFIG.slotAlpha).setOrigin(0);
        const divider2 = this.add.line(0, 0, d2x, panelY, d2x, panelY + panelH, 0xffffff)
            .setLineWidth(2).setAlpha(INVENTORY_CONFIG.slotAlpha).setOrigin(0);
        this.inventoryPanel.add(divider1);
        this.inventoryPanel.add(divider2);

        // Left segment — top hotbar row + grid
        const segW = panelW / 3;
        const segX = panelX - 12;
               const segY = panelY + 20;

        const cols = INVENTORY_CONFIG.gridCols;
        const rows = INVENTORY_CONFIG.gridRows;

        const totalSlotWidth = cols * this.slotSize;
        const centeredX = segX + (segW + 24 - totalSlotWidth) / 2;
        const hotbarY = segY;
        const gridStartY = hotbarY + this.slotSize + 12;

        this.uiHotbarSlots = []; // [{rect, icon, countText, area:'hotbar', index:i}]
        this.uiGridSlots = [];   // [{rect, icon, countText, area:'grid', index:i}]
        const border = 1;

        // Panel top hotbar
        for (let i = 0; i < cols; i++) {
            const x = centeredX + i * this.slotSize;
            const rect = this.add.rectangle(x, hotbarY, this.slotSize, this.slotSize, 0x333333)
                .setStrokeStyle(border, 0xffffff).setOrigin(0, 0).setAlpha(INVENTORY_CONFIG.slotAlpha).setInteractive();
            this.inventoryPanel.add(rect);

            // POOLED ICON & COUNT: create once, reuse
            const icon = this.add.image(
                rect.x + this.slotSize / 2, rect.y + this.slotSize / 2, ''
            ).setVisible(false).setDepth(10);
            const countText = this.add.text(
                rect.x + this.slotSize - 16, rect.y + this.slotSize - 16, '',
                { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
            ).setVisible(false).setDepth(11);

            this.inventoryPanel.add(icon);
            this.inventoryPanel.add(countText);

            const slot = { rect, icon, countText, area: 'hotbar', index: i };
            this.uiHotbarSlots.push(slot);
        }

        // Panel grid (6x5)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = centeredX + c * this.slotSize;
                const y = gridStartY + r * this.slotSize;
                const rect = this.add.rectangle(x, y, this.slotSize, this.slotSize, 0x222222)
                    .setStrokeStyle(border, 0x888888).setOrigin(0, 0).setAlpha(INVENTORY_CONFIG.slotAlpha).setInteractive();
                this.inventoryPanel.add(rect);

                rect.on('pointerover', () => { this.hoveredSlot = { area: 'grid', index: r * cols + c }; });
                rect.on('pointerout', () => { if (this.hoveredSlot?.area === 'grid' && this.hoveredSlot?.index === r * cols + c) this.hoveredSlot = null; });

                // POOLED ICON & COUNT: create once, reuse
                const icon = this.add.image(
                    rect.x + this.slotSize / 2, rect.y + this.slotSize / 2, ''
                ).setVisible(false).setDepth(10);
                const countText = this.add.text(
                    rect.x + this.slotSize - 16, rect.y + this.slotSize - 16, '',
                    { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
                ).setVisible(false).setDepth(11);

                this.inventoryPanel.add(icon);
                this.inventoryPanel.add(countText);

                const slot = { rect, icon, countText, area: 'grid', index: r * cols + c };
                this.uiGridSlots.push(slot);
            }
        }

        // Wire interactions (drag logic uses model ops)
        this.#wireSlotInput([...this.uiHotbarSlots, ...this.uiGridSlots]);

        // Toggle TAB
        // Make sure the browser doesn't swallow TAB (focus change)
        this.input.keyboard.addCapture(Phaser.Input.Keyboard.KeyCodes.TAB);
        this.input.keyboard.on('keydown-TAB', (e) => {
            e.preventDefault();
            this.toggleInventory();
        });

        // --- Inventory lock after death ---
        this.inventoryLocked = false;

        this.events.on('ui:lockInventory', (locked = true) => {
            this.inventoryLocked = !!locked;

            if (this.inventoryLocked) {
                // If panel is open while locking, snap carried item back and close it
                if (this.inventoryPanel?.visible) {
                    if (typeof this.#returnCarryOnClose === 'function') {
                        this.#returnCarryOnClose();
                    } else {
                        // Fallback cleanup if helper isn't present
                        this.dragCarry = null;
                        this.dragOrigin = null;
                        if (this.dragIcon) { this.dragIcon.destroy(); this.dragIcon = null; }
                        if (this.dragText) { this.dragText.destroy(); this.dragText = null; }
                        this.events.emit('inv:changed');
                    }
                    this.inventoryPanel.setVisible(false);
                }
            }
        });

        // Scroll wheel (when panel visible)
        this.input.on('wheel', (_p, _objs, _dx, dy) => {
            const up = dy < 0, down = dy > 0;

            // --- Inventory wheel-transfer when panel is open AND hovering a slot ---
            if (this.inventoryPanel.visible && this.hoveredSlot) {
                const slot = this.hoveredSlot;

                if (up) {
                    // place 1 from carried into hovered
                    if (!this.dragCarry) return;
                    const one = { id: this.dragCarry.id, count: 1 };
                    const res = this.inventory.place(slot.area, slot.index, one, 1);
                    if (!res.leftover) {
                        this.dragCarry.count -= 1;
                        if (this.dragCarry.count <= 0) this.#clearCarry();
                        else this.#updateCarryVisual();
                    }
                } else if (down) {
                    if (!this.dragCarry) {
                        // pick up 1 into carry — allow emptying the slot
                        const got = this.inventory.split(slot.area, slot.index, 1, /* allowEmpty */ true);
                        if (got) {
                            this.dragCarry = got;
                            // (optional) remember origin if you use return-on-close logic
                            this.dragOrigin = { area: slot.area, index: slot.index };
                            this.#updateCarryVisual();
                        }
                    } else {
                        // if same type in slot, siphon 1 more into carry — allow emptying the slot
                        const arr = slot.area === 'hotbar' ? this.inventory.hotbar : this.inventory.grid;
                        const s = arr[slot.index];
                        if (s && s.id === this.dragCarry.id) {
                            const got = this.inventory.split(slot.area, slot.index, 1, /* allowEmpty */ true);
                            if (got) {
                                this.dragCarry.count += got.count;
                                this.#updateCarryVisual();
                            }
                        }
                    }
                }
                return; // handled inventory case
            }

            // --- Hotbar scrolling when inventory panel is hidden or not hovering a slot ---
            if (up || down) {
                const count = INVENTORY_CONFIG.hotbarCount;
                let idx = this.inventory.selectedHotbarIndex ?? 0;
                // Wheel up -> next slot, wheel down -> previous slot
                idx = (idx + (up ? -1 : 1) + count) % count;
                this.inventory.setSelectedHotbarIndex(idx); // fires inv:hotbarSelected + inv:changed
                // UI highlight + bottom hotbar text update via existing event handlers
            }
        });

        // Puting items in inventory
        this.inventory.addItem('slingshot_rock', 7);
        this.inventory.hotbar[0] = { id: 'slingshot', count: 1 };
        this.inventory.hotbar[1] = { id: 'crude_bat', count: 1 };
        this.events.emit('inv:changed');

        // React to model changes
        this.events.on('inv:slotChanged', ({ area, index }) => {
            // Update only that slot; then refresh bottom HUD (debounced)
            this.#redrawSlot(area, index);
            this.#queueBottomHotbarRefresh();
            this.#syncCooldownOverlays();
        });
        this.events.on('inv:hotbarSelected', () => {
            this.#highlightBottomHotbar(this.inventory.selectedHotbarIndex);
            this.#hideChargeUIForAll();
            this.#queueBottomHotbarRefresh();
            this.#syncCooldownOverlays();
        });
        // Keep a light handler for “bulk” changes (e.g., initial paint or mass ops)
        this.events.on('inv:changed', () => {
            if (this.inventoryPanel.visible) this.#refreshAllIcons();
            this.#queueBottomHotbarRefresh();
            this.#syncCooldownOverlays();
        });

        // Charging UI events from MainScene
        this.events.on('weapon:charge', (percent) => {
            this.#updateChargeBar(percent);
        });
        this.events.on('weapon:chargeEnd', () => {
            this.#hideChargeUIForAll();
            // Restore normal selected highlight (no border glow here anymore)
            this.#highlightBottomHotbar(this.inventory.selectedHotbarIndex);
        });
        
        // NEW: cooldown overlays (e.g., bat swings)
        this.events.on('weapon:cooldownStart', ({ itemId, durationMs }) => {
            if (!itemId || !durationMs || durationMs <= 0) return;
            const now = this.time.now;
            this._activeCooldowns.set(itemId, { start: now, end: now + durationMs });
            this.#syncCooldownOverlays();
        });

        // Day/Night mini HUD
        this.dayNightLabel = this.add.text(this.cameras.main.centerX, 12, 'Day 1 — Daytime', {
            fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace'
        }).setOrigin(0.5, 0);

        const barW = 200, barH = 6;
        this.timeBarBg = this.add.rectangle(this.cameras.main.centerX, 30, barW, barH, 0x000000)
            .setOrigin(0.5, 0.5).setAlpha(0.4);
        this.timeBarFill = this.add.rectangle(this.cameras.main.centerX - barW / 2, 30, 0, barH, 0xffff66)
            .setOrigin(0, 0.5).setAlpha(0.9);

        // Initial paint (panel may start hidden, but we prep visuals)
        this.#refreshAllIcons();
        this.#queueBottomHotbarRefresh();
    }

    // -------------------------
    // Health
    // -------------------------
    updateHealth(amount) {
        if (typeof amount === 'number') {
            this.playerData.health = Phaser.Math.Clamp(amount, 0, 100);
        }
        const hp = this.playerData.health ?? 0;
        const pct = hp / 100;
        this.healthBarFill.width = this.healthBarWidth * pct;
               this.healthText.setText(`${hp}`);
        this.healthText.setVisible(true);
        this.healthText.setPosition(this.healthBarX + 4, this.healthBarY + 4);
    }

    // -------------------------
    // Stamina
    // -------------------------
    updateStamina(amount) {
        if (typeof amount === 'number') {
            this.playerData.stamina = Phaser.Math.Clamp(amount, 0, 100);
        }
        const st = this.playerData.stamina ?? 0;
        const pct = st / 100;
        if (this.staminaBarFill) {
            this.staminaBarFill.width = this.staminaBarWidth * pct;
        }
        if (this.staminaText) {
            // Only show whole numbers
            this.staminaText.setText(`${Math.floor(st)}`);
            this.staminaText.setVisible(true);
            this.staminaText.setPosition(this.staminaBarX + 4, this.staminaBarY + 1 );
        }
    }

    // -------------------------
    // Inventory panel
    // -------------------------
    toggleInventory() {
        if (this.inventoryLocked) return; // <- blocked after death

        const wasVisible = this.inventoryPanel.visible;
        if (wasVisible) {
            // Closing: if we’re carrying something, put it back and clear carry state
            this.#returnCarryOnClose();
        }
        this.inventoryPanel.setVisible(!wasVisible);
        if (!wasVisible) this.#refreshAllIcons();
    }

    setInventoryAlpha() {
        if (!this.inventoryPanel) return;
        if (this.panelBg && this.panelBg.setAlpha) {
            this.panelBg.setAlpha(INVENTORY_CONFIG.panelAlpha);
        }
        this.inventoryPanel.iterate((child) => {
            if (!child || child === this.panelBg || !child.setAlpha) return;
            child.setAlpha(INVENTORY_CONFIG.slotAlpha);
        });
    }

    // -------------------------
    // Input wiring for panel slots
    // -------------------------
    #wireSlotInput(slots) {
        slots.forEach((s) => {
            // Hover tracking for wheel
            s.rect.on('pointerover', () => { this.hoveredSlot = { area: s.area, index: s.index }; });
            s.rect.on('pointerout', () => { if (this.hoveredSlot?.area === s.area && this.hoveredSlot?.index === s.index) this.hoveredSlot = null; });

            s.rect.on('pointerdown', (pointer) => {
                if (!this.inventoryPanel.visible) return;

                const isLeft = pointer.leftButtonDown();
                const isRight = pointer.rightButtonDown();

                if (isLeft) {
                    // LEFT: full pick/place (with swap)
                    if (!this.dragCarry) {
                        const got = this.inventory.takeAll(s.area, s.index);
                        if (got) {
                            this.dragCarry = got;
                            this.dragOrigin = { area: s.area, index: s.index }; // <— TRACK ORIGIN
                            this.#updateCarryVisual();
                        }
                    } else {
                        const res = this.inventory.place(s.area, s.index, { id: this.dragCarry.id, count: this.dragCarry.count }, this.dragCarry.count);
                        if (res.swapped) {
                            this.dragCarry = res.swapped;
                            // keep original dragOrigin; we still “came from” the first pickup
                            this.#updateCarryVisual();
                        } else if (res.leftover) {
                            this.dragCarry = res.leftover;
                            this.#updateCarryVisual();
                        } else {
                            this.#clearCarry();
                        }
                    }
                }

                if (isRight) {
                    // RIGHT: half logic
                    if (!this.dragCarry) {
                        const got = this.inventory.split(s.area, s.index); // half
                        if (got) {
                            this.dragCarry = got;
                            this.dragOrigin = { area: s.area, index: s.index }; // <— TRACK ORIGIN
                            this.#updateCarryVisual();
                        }
                    } else {
                        // place half of carry if empty or same id; if different id, swap full
                        const amount = Math.max(1, Math.floor(this.dragCarry.count / 2));
                        const arr = s.area === 'hotbar' ? this.inventory.hotbar : this.inventory.grid;
                        const dest = arr[s.index];
                        if (dest && dest.id !== this.dragCarry.id) {
                            // swap full on right-click if different item
                            const res = this.inventory.place(s.area, s.index, { id: this.dragCarry.id, count: this.dragCarry.count }, this.dragCarry.count);
                            if (res.swapped) {
                                this.dragCarry = res.swapped;
                                this.#updateCarryVisual();
                            } else {
                                this.#updateCarryVisual();
                            }
                        } else {
                            const res = this.inventory.place(s.area, s.index, { id: this.dragCarry.id, count: amount }, amount);
                            if (!res.leftover) {
                                this.dragCarry.count -= amount;
                                if (this.dragCarry.count <= 0) this.#clearCarry();
                                else this.#updateCarryVisual();
                            } else {
                                this.#updateCarryVisual();
                            }
                        }
                    }
                }
            });
        });
    }


    // -------------------------
    // Visual refresh
    // -------------------------
    #refreshAllIcons() {
        // Panel hotbar
        for (let i = 0; i < this.uiHotbarSlots.length; i++) this.#redrawSlot('hotbar', i);
        // Panel grid
        for (let i = 0; i < this.uiGridSlots.length; i++) this.#redrawSlot('grid', i);
    }

    #redrawSlot(area, index) {
        const slot = area === 'hotbar' ? this.uiHotbarSlots[index] : this.uiGridSlots[index];
        if (!slot) return;

        const arr = area === 'hotbar' ? this.inventory.hotbar : this.inventory.grid;
        const s = arr[index];

        if (!s) {
            // Hide visuals for empty slot
            slot.icon.setVisible(false);
            slot.countText.setVisible(false);
            return;
        }

        // Update / show icon
        if (slot.icon.texture?.key !== s.id) {
            slot.icon.setTexture(s.id);
            this.#fitIconToSlot(slot.icon);
        }
        if (!slot.icon.visible) slot.icon.setVisible(true);

        // Count label (ammo vs stack count)
        let label = `${s.count}`;
        const def = ITEM_DB?.[s.id];
        const showWeaponAmmo = def?.showCountOnIcon === true && def?.weapon?.usesAmmo === true;
        if (showWeaponAmmo) {
            const { total } = this.inventory.totalOfActiveAmmo(s.id);
            label = `${total}`;
        }

        if (slot.countText.text !== label) slot.countText.setText(label);
        if (!slot.countText.visible) slot.countText.setVisible(true);
    }

    #queueBottomHotbarRefresh() {
        if (this._hotbarRefreshQueued) return;
        this._hotbarRefreshQueued = true;
        this.time.delayedCall(this._hotbarRefreshDelayMs, () => {
            this._hotbarRefreshQueued = false;
            this.#updateBottomHotbar();
        });
    }

    #updateBottomHotbar() {
        for (let i = 0; i < this.bottomHotbarVisuals.length; i++) {
            const vis = this.bottomHotbarVisuals[i];
            const s = this.inventory.hotbar[i];

            if (s) {
                if (vis.icon.texture?.key !== s.id) {
                    vis.icon.setTexture(s.id);
                    this.#fitIconToSlot(vis.icon);
                }
                if (!vis.icon.visible) vis.icon.setVisible(true);

                const def = ITEM_DB?.[s.id];
                const show = def?.showCountOnIcon === true && def?.weapon?.usesAmmo === true;
                const label = show
                    ? `${this.inventory.totalOfActiveAmmo(s.id).total}`
                    : `${s.count}`;

                if (vis.countText.text !== label) vis.countText.setText(label);
                if (!vis.countText.visible) vis.countText.setVisible(true);
            } else {
                if (vis.icon.visible) vis.icon.setVisible(false);
                if (vis.countText.visible) vis.countText.setVisible(false);
            }
        }

        // highlight ring
        this.#highlightBottomHotbar(this.inventory.selectedHotbarIndex);
    }

    #highlightBottomHotbar(index) {
        // Non‑selected = white border; Selected = yellow border
        this.bottomHotbarRects.forEach((r, i) => {
            if (i === index) {
                r.setStrokeStyle(3, 0xffff00); // selected = yellow, thicker
            } else {
                r.setStrokeStyle(2, 0xffffff); // others = white, normal
            }
        });
    }

    #fitIconToSlot(img) {
        const key = img.texture?.key;
        if (!key) { img.setScale(0.5); return; }

        // If DB has a manual icon scale, use it
        const def = ITEM_DB?.[key];
        if (def?.icon?.scale !== undefined) {
            img.setScale(def.icon.scale);
            this._iconScaleCache.set(key, def.icon.scale);
            return;
        }

        // Use cached scale if available
        const cached = this._iconScaleCache.get(key);
        if (cached) { img.setScale(cached); return; }

        // Auto-fit logic (default)
        const src = img.texture.getSourceImage?.();
        if (!src || !src.width || !src.height) { img.setScale(0.5); return; }

        const pad = 6;
        const maxW = this.slotSize - pad;
        const maxH = this.slotSize - pad;
        const s = Math.min(maxW / src.width, maxH / src.height);

        this._iconScaleCache.set(key, s);
        img.setScale(s);
    }

    // -------------------------
    // Charge bar helpers
    // -------------------------
    #hideChargeUIForAll() {
        for (let i = 0; i < this.bottomHotbarVisuals.length; i++) {
            const v = this.bottomHotbarVisuals[i];
            if (!v) continue;

            // stop & clear any pulse tween
            const tw = this._chargeGlowTweens[i];
            if (tw && tw.isPlaying()) tw.stop();
            this._chargeGlowTweens[i] = null;

            // hide bars and reset visuals
            if (v.chargeBg.visible) v.chargeBg.setVisible(false);
            if (v.chargeFill.visible) v.chargeFill.setVisible(false);
            v.chargeFill.setAlpha(1);
            v.chargeFill.setFillStyle(0xffff00); // standard yellow when visible
        }
    }


    #updateChargeBar(percent) {
        const idx = this.inventory.selectedHotbarIndex ?? 0;
        const vis = this.bottomHotbarVisuals[idx];
        if (!vis) return;

        // ✅ Show charge bar for ANY equipped weapon that supports charging
        const eq = this.inventory.getEquipped?.();
        const canCharge =
            !!eq &&
            ITEM_DB?.[eq.id]?.weapon?.canCharge === true;

        if (!canCharge) {
            this.#hideChargeUIForAll();
            this.#highlightBottomHotbar(idx);
            return;
        }

        const p = Phaser.Math.Clamp(percent ?? 0, 0, 1);

        // Show bars
        if (!vis.chargeBg.visible) vis.chargeBg.setVisible(true);
        if (!vis.chargeFill.visible) vis.chargeFill.setVisible(true);

        // Size the fill bar
        const fullW = vis.chargeBg.width;
        const w = Math.max(0, Math.min(fullW, Math.floor(fullW * p)));
        vis.chargeFill.width = w;

        // Handle glow: pulse when fully charged; otherwise solid
        const existing = this._chargeGlowTweens[idx];
        if (p >= 1) {
            vis.chargeFill.setFillStyle(0xffff88);
            if (!existing || !existing.isPlaying()) {
                this._chargeGlowTweens[idx] = this.tweens.add({
                    targets: vis.chargeFill,
                    alpha: 0.5,
                    duration: 250,
                    yoyo: true,
                    repeat: -1
                });
            }
        } else {
            if (existing && existing.isPlaying()) {
                existing.stop();
                this._chargeGlowTweens[idx] = null;
            }
            vis.chargeFill.setAlpha(1);
            vis.chargeFill.setFillStyle(0xffff00);
        }

        // Keep slot border on normal highlight — no border glow
        this.#highlightBottomHotbar(idx);
    }

    // =========================
    // Cooldown overlay helpers
    // =========================

    // Create/ensure overlays for any slots showing items currently on cooldown,
    // and remove overlays that no longer match or have expired.
    #syncCooldownOverlays() {
        const now = this.time.now;

        // Remove expired item cooldowns
        for (const [itemId, cd] of this._activeCooldowns) {
            if (now >= cd.end) this._activeCooldowns.delete(itemId);
        }

        // Build quick lookup of which slots show which item
        const slotsByItem = new Map(); // itemId -> array of { kind, area, index, x, y, w, h }
        const pushSlot = (itemId, desc) => {
            if (!itemId) return;
            if (!slotsByItem.has(itemId)) slotsByItem.set(itemId, []);
            slotsByItem.get(itemId).push(desc);
        };

        const slotSize = this.slotSize || 44;

        // Bottom HUD hotbar
        for (let i = 0; i < this.bottomHotbarRects.length; i++) {
            const s = this.inventory.hotbar[i];
            if (!s) continue;
            const r = this.bottomHotbarRects[i];
            pushSlot(s.id, {
                kind: 'bottom', area: 'bottom', index: i,
                x: r.x, y: r.y, w: r.width, h: r.height
            });
        }

        // Panel top hotbar
        for (let i = 0; i < this.uiHotbarSlots.length; i++) {
            const s = this.inventory.hotbar[i];
            if (!s) continue;
            const r = this.uiHotbarSlots[i].rect;
            pushSlot(s.id, {
                kind: 'hotbar', area: 'hotbar', index: i,
                x: r.x, y: r.y, w: r.width ?? slotSize, h: r.height ?? slotSize
            });
        }

        // Panel grid
        for (let i = 0; i < this.uiGridSlots.length; i++) {
            const s = this.inventory.grid[i];
            if (!s) continue;
            const r = this.uiGridSlots[i].rect;
            pushSlot(s.id, {
                kind: 'grid', area: 'grid', index: i,
                x: r.x, y: r.y, w: r.width ?? slotSize, h: r.height ?? slotSize
            });
        }

        // Ensure overlays for active cooldown items
        const need = new Set();
        for (const [itemId, cd] of this._activeCooldowns) {
            const slots = slotsByItem.get(itemId) || [];
            for (const desc of slots) {
                const key = `${desc.kind}:${desc.index}:${itemId}`;
                need.add(key);
                this.#ensureOverlay(desc, itemId);
            }
        }

        // Remove overlays that are no longer needed
        for (let i = this._slotOverlays.length - 1; i >= 0; i--) {
            const o = this._slotOverlays[i];
            const key = `${o.kind}:${o.index}:${o.itemId}`;
            const cd = this._activeCooldowns.get(o.itemId);
            const alive = cd && this.time.now < cd.end;
            if (!alive || !need.has(key)) {
                this.#removeOverlay(o, i);
            }
        }
    }

    // Create overlay for a specific slot if missing
    #ensureOverlay(desc, itemId) {
        const existing = this._slotOverlays.find(o =>
            o.kind === desc.kind && o.index === desc.index && o.itemId === itemId
        );
        if (existing) return;

        const rect = this.add.rectangle(desc.x, desc.y, desc.w, desc.h, 0x808080)
            .setOrigin(0, 0)
            .setAlpha(0.4) // 40% opaque grey cover 
            .setVisible(true);

        // Depth: above icons/counters
        if (desc.kind === 'bottom') rect.setDepth(14); // icon(10), count(11), chargeFill(13) -> overlay(14)
        else rect.setDepth(12); // panel: icon(10), count(11) -> overlay(12)

        // If this is inside the inventory panel, attach to panel container for correct draw order
        if (desc.kind !== 'bottom' && this.inventoryPanel) {
            this.inventoryPanel.add(rect);
        }

        this._slotOverlays.push({
            kind: desc.kind, area: desc.area, index: desc.index, itemId, rect,
            x: desc.x, y: desc.y, w: desc.w, h: desc.h
        });
    }

    // Per-frame: update overlay “flattening” based on the item’s cooldown progress
    #updateCooldownOverlays() {
        if (this._slotOverlays.length === 0) return;

        const now = this.time.now;
        for (let i = this._slotOverlays.length - 1; i >= 0; i--) {
            const o = this._slotOverlays[i];
            const cd = this._activeCooldowns.get(o.itemId);
            if (!cd) { this.#removeOverlay(o, i); continue; }

            const span = Math.max(1, cd.end - cd.start);
            const t = Phaser.Math.Clamp((now - cd.start) / span, 0, 1);

            // Flatten from full to zero **downward** (bottom anchored)
            // Keep bottom edge fixed at y + h; move the TOP down as height shrinks.
            const newHeight = o.h * (1 - t);
            const newY = o.y + (o.h - newHeight);

            o.rect.height = newHeight;
            o.rect.y = newY;

            if (now >= cd.end) {
                this.#removeOverlay(o, i);
            }
        }
    }

    // Remove and destroy overlay (index optional for faster splice)
    #removeOverlay(o, idx = -1) {
        if (!o) return;
        if (o.rect && o.rect.destroy) o.rect.destroy();
        if (idx >= 0) this._slotOverlays.splice(idx, 1);
        else {
            const i = this._slotOverlays.indexOf(o);
            if (i >= 0) this._slotOverlays.splice(i, 1);
        }
    }

    // -------------------------
    // Carry (drag) visuals
    // -------------------------
    #updateCarryVisual() {
        if (!this.dragCarry) { this.#clearCarry(); return; }

        // Icon
        if (!this.dragIcon) {
            this.dragIcon = this.add.image(0, 0, this.dragCarry.id).setDepth(1000);
        } else if (this.dragIcon.texture?.key !== this.dragCarry.id) {
            this.dragIcon.setTexture(this.dragCarry.id);
        }
        this.#fitIconToSlot(this.dragIcon);

        // Decide which number to show:
        const def = ITEM_DB?.[this.dragCarry.id];
        let labelText = `${this.dragCarry.count}`;
        const isWeaponShowingAmmo = def?.showCountOnIcon === true && def?.weapon?.usesAmmo === true;

        if (isWeaponShowingAmmo) {
            const { total } = this.inventory.totalOfActiveAmmo(this.dragCarry.id);
            labelText = `${total}`;
        }

        // Count text
        if (!this.dragText) {
            this.dragText = this.add.text(0, 0, labelText, {
                fontSize: '12px',
                fill: '#ffffff',
                fontFamily: 'monospace'
            }).setDepth(1001);
        } else if (this.dragText.text !== labelText) {
            this.dragText.setText(labelText);
        }
    }

    #returnCarryOnClose() {
        if (!this.dragCarry || !this.dragCarry.id || this.dragCarry.count <= 0) {
            // Nothing in hand; just be sure the drag state is clean
            this.dragOrigin = null;
            if (this.dragIcon) { this.dragIcon.destroy(); this.dragIcon = null; }
            if (this.dragText) { this.dragText.destroy(); this.dragText = null; }
            this.dragCarry = null;
            return;
        }

        const origin = this.dragOrigin || null; // { area, index } or null

        // Ask the model to put it back with the priority: origin -> first empty grid -> first empty hotbar
        this.inventory.putBack(
            { id: this.dragCarry.id, count: this.dragCarry.count },
            origin?.area || null,
            origin?.index ?? 0
        );

        // Clear drag state & visuals — after closing you are NOT holding anything
        this.dragOrigin = null;
        if (this.dragIcon) { this.dragIcon.destroy(); this.dragIcon = null; }
        if (this.dragText) { this.dragText.destroy(); this.dragText = null; }
        this.dragCarry = null;

        // Refresh UI
        this.events.emit('inv:changed');
    }

    #clearCarry() {
        this.dragCarry = null;
        if (this.dragIcon) { this.dragIcon.destroy(); this.dragIcon = null; }
        if (this.dragText) { this.dragText.destroy(); this.dragText = null; }
    }

    update() {
        if (this.dragIcon && this.input.activePointer) {
            const p = this.input.activePointer;
            this.dragIcon.setPosition(p.worldX, p.worldY);
            if (this.dragText) this.dragText.setPosition(p.worldX + 12, p.worldY + 12);
        }
        // NEW: animate cooldown overlays
        this.#updateCooldownOverlays();
    }

    // -------------------------
    // Day/Night HUD update (called by MainScene)
    // -------------------------
    updateTimeDisplay(dayIndex, phaseLabel, progress) {
        if (!this.dayNightLabel || !this.timeBarFill) return;
        this.dayNightLabel.setText(`Day ${dayIndex} — ${phaseLabel}`);
        const barW = this.timeBarBg.width;
        const clamped = Phaser.Math.Clamp(progress, 0, 1);
        this.timeBarFill.width = Math.max(0, barW * clamped);
        this.timeBarFill.setFillStyle(phaseLabel === 'Night' ? 0x66aaff : 0xffff66);
    }
}
