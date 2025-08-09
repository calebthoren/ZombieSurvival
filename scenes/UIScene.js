// scenes/UIScene.js
import InventoryModel from '../systems/inventoryModel.js';
import { INVENTORY_CONFIG } from '../data/inventoryConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';

export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    init(data) {
        this.playerData = data.playerData || { health: 100 };
    }

    create() {
        // -------------------------
        // Inventory model (logic)
        // -------------------------
        this.inventory = new InventoryModel(this.events);

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

        // -------------------------
        // Bottom on-screen hotbar
        // -------------------------
        const screenW = this.cameras.main.width;
        const screenH = this.cameras.main.height;
        const spacing = INVENTORY_CONFIG.padding ?? 8;
        this.slotSize = INVENTORY_CONFIG.slotSize ?? 44;

        this.bottomHotbarRects = [];
        this.bottomHotbarVisuals = []; // {icon, countText}
        this.selectedSlotIndex = 0;

        for (let i = 0; i < INVENTORY_CONFIG.hotbarCount; i++) {
            const x = screenW / 2 - ((this.slotSize + spacing) * 2) + i * (this.slotSize + spacing);
            const rect = this.add.rectangle(
                x, screenH - 60, this.slotSize, this.slotSize, 0x333333
            ).setStrokeStyle(2, 0xffffff).setAlpha(0.65).setOrigin(0, 0);
            this.bottomHotbarRects.push(rect);

            const numText = this.add.text(
                x - this.slotSize / 2 + 4,
                screenH - 60 - 20,
                `${i + 1}`,
                { fontSize: '10px', fill: '#ffffff', fontFamily: 'monospace' }
            ).setAlpha(0.65);

            const icon = this.add.image(
                rect.x + this.slotSize / 2, rect.y + this.slotSize / 2, ''
            ).setVisible(false).setDepth(10);

            const countText = this.add.text(
                rect.x + this.slotSize - 16, rect.y + this.slotSize - 16, '',
                { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
            ).setVisible(false).setDepth(11);

            this.bottomHotbarVisuals.push({ icon, countText });
        }
        this.#highlightBottomHotbar(0);

        // Number keys to select hotbar slot
        this.input.keyboard.on('keydown', (event) => {
            const key = parseInt(event.key, 10);
            if (key >= 1 && key <= INVENTORY_CONFIG.hotbarCount) {
                this.selectedSlotIndex = key - 1;
                this.inventory.setSelectedHotbarIndex(this.selectedSlotIndex);
                this.#highlightBottomHotbar(this.selectedSlotIndex);
                this.#refreshAllIcons();
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

        const panelBg = this.add.rectangle(panelX, panelY, panelW, panelH, 0x444444)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xffffff);
        this.inventoryPanel.add(panelBg);

        // Visual dividers (purely cosmetic)
        const third = panelW / 3;
        const d1x = panelX + third, d2x = panelX + 2 * third;
        const divider1 = this.add.line(0, 0, d1x, panelY, d1x, panelY + panelH, 0xffffff).setLineWidth(2).setAlpha(0.6).setOrigin(0);
        const divider2 = this.add.line(0, 0, d2x, panelY, d2x, panelY + panelH, 0xffffff).setLineWidth(2).setAlpha(0.6).setOrigin(0);
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
                .setStrokeStyle(border, 0xffffff).setOrigin(0, 0).setAlpha(0.9).setInteractive();
            this.inventoryPanel.add(rect);

            const slot = { rect, icon: null, countText: null, area: 'hotbar', index: i };
            this.uiHotbarSlots.push(slot);
        }

        // Panel grid (6x5)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = centeredX + c * this.slotSize;
                const y = gridStartY + r * this.slotSize;
                const rect = this.add.rectangle(x, y, this.slotSize, this.slotSize, 0x222222)
                    .setStrokeStyle(border, 0x888888).setOrigin(0, 0).setAlpha(0.9).setInteractive();
                this.inventoryPanel.add(rect);

                rect.on('pointerover', () => { this.hoveredSlot = { area: 'grid', index: r * cols + c }; });
                rect.on('pointerout', () => { if (this.hoveredSlot?.area === 'grid' && this.hoveredSlot?.index === r * cols + c) this.hoveredSlot = null; });

                const slot = { rect, icon: null, countText: null, area: 'grid', index: r * cols + c };
                this.uiGridSlots.push(slot);
            }
        }

        // Wire interactions (drag logic uses model ops)
        this.#wireSlotInput([...this.uiHotbarSlots, ...this.uiGridSlots]);

        // Toggle TAB
        this.input.keyboard.on('keydown-TAB', (e) => {
            e.preventDefault();
            this.toggleInventory();
        });

        // Scroll wheel (when panel visible)
        this.input.on('wheel', (_p, _objs, _dx, dy) => {
            if (!this.inventoryPanel.visible || !this.hoveredSlot) return;
            const up = dy < 0, down = dy > 0;
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
                    // pick up 1 into carry
                    const got = this.inventory.split(slot.area, slot.index, 1);
                    if (got) { this.dragCarry = got; this.#updateCarryVisual(); }
                } else {
                    // if same type in slot, siphon 1 more into carry
                    const arr = slot.area === 'hotbar' ? this.inventory.hotbar : this.inventory.grid;
                    const s = arr[slot.index];
                    if (s && s.id === this.dragCarry.id) {
                        const got = this.inventory.split(slot.area, slot.index, 1);
                        if (got) {
                            this.dragCarry.count += got.count;
                            this.#updateCarryVisual();
                        }
                    }
                }
            }
        });

        // Seed demo items (optional)
        this.inventory.addItem('slingshot_rock', 7);
        this.inventory.hotbar[0] = { id: 'slingshot', count: 1 };
        this.events.emit('inv:changed');

        // React to model changes -> refresh visuals
        this.events.on('inv:slotChanged', ({ area, index }) => this.#redrawSlot(area, index));
        this.events.on('inv:changed', () => this.#refreshAllIcons());

        // Day/Night mini HUD
        this.dayNightLabel = this.add.text(this.cameras.main.centerX, 12, 'Day 1 — Daytime', {
            fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace'
        }).setOrigin(0.5, 0);

        const barW = 200, barH = 6;
        this.timeBarBg = this.add.rectangle(this.cameras.main.centerX, 30, barW, barH, 0x000000)
            .setOrigin(0.5, 0.5).setAlpha(0.4);
        this.timeBarFill = this.add.rectangle(this.cameras.main.centerX - barW / 2, 30, 0, barH, 0xffff66)
            .setOrigin(0, 0.5).setAlpha(0.9);

        // Initial paint
        this.#refreshAllIcons();
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
    // Inventory panel
    // -------------------------
    toggleInventory() {
        const visible = this.inventoryPanel.visible;
        this.inventoryPanel.setVisible(!visible);
        if (!visible) this.#refreshAllIcons();
    }

    setInventoryAlpha(v) {
        if (!this.inventoryPanel) return;
        this.inventoryPanel.iterate((child) => child.setAlpha && child.setAlpha(v));
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
                        if (got) { this.dragCarry = got; this.#updateCarryVisual(); }
                    } else {
                        const res = this.inventory.place(s.area, s.index, { id: this.dragCarry.id, count: this.dragCarry.count }, this.dragCarry.count);
                        if (res.swapped) {
                            this.dragCarry = res.swapped;
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
                        if (got) { this.dragCarry = got; this.#updateCarryVisual(); }
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
                                // nothing placed; keep carrying
                                this.#updateCarryVisual();
                            }
                        } else {
                            const res = this.inventory.place(s.area, s.index, { id: this.dragCarry.id, count: amount }, amount);
                            if (!res.leftover) {
                                this.dragCarry.count -= amount;
                                if (this.dragCarry.count <= 0) this.#clearCarry();
                                else this.#updateCarryVisual();
                            } else {
                                // couldn't place, keep carrying
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
        // Bottom HUD
        this.#updateBottomHotbar();
    }

    #redrawSlot(area, index) {
        const slot = area === 'hotbar' ? this.uiHotbarSlots[index] : this.uiGridSlots[index];
        if (!slot) return;

        if (slot.icon) { slot.icon.destroy(); slot.icon = null; }
        if (slot.countText) { slot.countText.destroy(); slot.countText = null; }

        const arr = area === 'hotbar' ? this.inventory.hotbar : this.inventory.grid;
        const s = arr[index];
        if (!s) return;

        slot.icon = this.add.image(slot.rect.x + this.slotSize / 2, slot.rect.y + this.slotSize / 2, s.id).setDepth(10);
        this.#fitIconToSlot(slot.icon);

        let label = `${s.count}`;
        const def = ITEM_DB?.[s.id];
        const showWeaponAmmo = def?.showCountOnIcon === true && def?.weapon?.usesAmmo === true;
        if (showWeaponAmmo) {
            const { total } = this.inventory.totalOfActiveAmmo(s.id);
            label = `${total}`;
        }

        slot.countText = this.add.text(
            slot.rect.x + this.slotSize - 16, slot.rect.y + this.slotSize - 16, label,
            { fontSize: '12px', fill: '#ffffff', fontFamily: 'monospace' }
        ).setDepth(11);

        this.inventoryPanel.add(slot.icon);
        this.inventoryPanel.add(slot.countText);
    }

    #updateBottomHotbar() {
        for (let i = 0; i < this.bottomHotbarVisuals.length; i++) {
            const vis = this.bottomHotbarVisuals[i];
            const s = this.inventory.hotbar[i];

            if (s) {
                vis.icon.setTexture(s.id);
                vis.icon.setVisible(true);
                this.#fitIconToSlot(vis.icon);

                const def = ITEM_DB?.[s.id];
                const show = def?.showCountOnIcon === true && def?.weapon?.usesAmmo === true;
                if (show) {
                    const { total } = this.inventory.totalOfActiveAmmo(s.id);
                    vis.countText.setText(`${total}`);
                } else {
                    vis.countText.setText(`${s.count}`);
                }
                vis.countText.setVisible(true);
            } else {
                vis.icon.setVisible(false);
                vis.countText.setVisible(false);
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
        if (!img.texture || !img.texture.key) return;
        const src = img.texture.getSourceImage?.();
        if (!src || !src.width || !src.height) { img.setScale(0.5); return; }
        const pad = 6;
        const maxW = this.slotSize - pad;
        const maxH = this.slotSize - pad;
        const s = Math.min(maxW / src.width, maxH / src.height);
        img.setScale(s);
    }

    // -------------------------
    // Carry (drag) visuals
    // -------------------------
    #updateCarryVisual() {
        if (!this.dragCarry) { this.#clearCarry(); return; }

        // Icon
        if (!this.dragIcon) {
            this.dragIcon = this.add.image(0, 0, this.dragCarry.id).setDepth(1000);
        } else {
            this.dragIcon.setTexture(this.dragCarry.id);
        }
        this.#fitIconToSlot(this.dragIcon);

        // Decide which number to show:
        // - For weapons that display ammo, show total usable ammo
        // - Otherwise, show the carried stack count (normal items)
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
        } else {
            this.dragText.setText(labelText);
        }
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
