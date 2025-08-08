export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    init(data) {
        this.playerData = data.playerData || { health: 100, ammo: 10 };
    }

    create() {
        this.healthBarWidth = 200;
        this.healthBarHeight = 20;
        this.healthBarX = 10;
        this.healthBarY = 10;
        const slotSize = 44;

        this.input.mouse.disableContextMenu();

        this.healthBarBackground = this.add.rectangle(
            this.healthBarX, this.healthBarY,
            this.healthBarWidth, this.healthBarHeight, 0x222222
        ).setOrigin(0, 0);

        this.healthBarFill = this.add.rectangle(
            this.healthBarX, this.healthBarY,
            this.healthBarWidth, this.healthBarHeight, 0xff0000
        ).setOrigin(0, 0);

        this.healthText = this.add.text(0, 0, '', {
            fontSize: '10px',
            fill: '#800000',
            fontFamily: 'monospace'
        });

        this.updateHealth();

        const screenWidth = this.cameras.main.width;
        const screenHeight = this.cameras.main.height;
        const screenCenterX = screenWidth / 2;
        const spacing = 8;
        this.hotbarSlots = [];
        this.hotbarTexts = [];
        this.hotbarVisuals = [];
        this.selectedSlotIndex = 0;

        for (let i = 0; i < 5; i++) {
            const slotX = screenCenterX - ((slotSize + spacing) * 2) + i * (slotSize + spacing);

            const slot = this.add.rectangle(
                slotX, screenHeight - 60,
                slotSize, slotSize, 0x333333
            ).setStrokeStyle(2, 0xffffff).setAlpha(0.65);

            this.hotbarSlots.push(slot);

            const slotNumber = this.add.text(
                slotX - slotSize / 2 + 4,
                screenHeight - 60 - 20,
                `${i + 1}`,
                {
                    fontSize: '10px',
                    fill: '#ffffff',
                    fontFamily: 'monospace'
                }
            ).setAlpha(0.65);

            this.hotbarTexts.push(slotNumber);

            const icon = this.add.image(
                slot.x + slotSize / 2,
                slot.y + slotSize / 2,
                ''
            ).setScale(0.5).setVisible(false).setDepth(10);

            const countText = this.add.text(
                slot.x + slotSize - 16,
                slot.y + slotSize - 16,
                '',
                {
                    fontSize: '12px',
                    fill: '#ffffff',
                    fontFamily: 'monospace'
                }
            ).setVisible(false).setDepth(11);

            this.hotbarVisuals.push({ icon, countText });
        }

        this.highlightHotbarSlot(this.selectedSlotIndex);

        this.input.keyboard.on('keydown', (event) => {
            const mainScene = this.scene.get('MainScene');
            if (!mainScene || mainScene.isGameOver) return;

            const key = parseInt(event.key);
            if (key >= 1 && key <= 5) {
                this.selectHotbarSlot(key - 1);
            }
        });

        // --- Inventory Panel ---
        this.inventoryPanel = this.add.container().setVisible(false);

        const panelWidth = screenWidth - 100;
        const panelHeight = screenHeight - 240;
        const panelX = 50;
        const panelY = 100;


        const panelBg = this.add.rectangle(panelX, panelY, panelWidth, panelHeight, 0x444444)
            .setOrigin(0, 0)
            .setStrokeStyle(2, 0xffffff)
        this.inventoryPanel.add(panelBg);

        // Draw dividers to split inventory panel into 3 vertical sections
        const thirdWidth = panelWidth / 3;
        const dividerY1 = panelY;
        const dividerY2 = panelY + panelHeight;

        const divider1X = panelX + thirdWidth;
        const divider2X = panelX + thirdWidth * 2;

        const divider1 = this.add.line(0, 0, divider1X, dividerY1, divider1X, dividerY2, 0xffffff)
            .setLineWidth(2)
            .setAlpha(0.6)
            .setOrigin(0); // ✅ Ensure correct position

        const divider2 = this.add.line(0, 0, divider2X, dividerY1, divider2X, dividerY2, 0xffffff)
            .setLineWidth(2)
            .setAlpha(0.6)
            .setOrigin(0); // ✅ Ensure correct position

        // Add dividers to the inventory panel
        this.inventoryPanel.add(divider1);
        this.inventoryPanel.add(divider2);


        // --- Left Segment (expanded layout) ---
        const segmentWidth = panelWidth / 3;
        const leftSegmentExtra = 12; // breathing room left and right

        const segmentX = panelX - leftSegmentExtra;
        const segmentY = panelY + 20;

        const gridCols = 5;
        const gridRows = 6;
        const slotSpacing = 0;
        const totalSlotWidth = gridCols * slotSize;

        const centeredX = segmentX + (segmentWidth + leftSegmentExtra * 2 - totalSlotWidth) / 2;
        const hotbarY = segmentY;
        const borderWidth = 1;

        this.inventoryHotbar = [];
        for (let i = 0; i < gridCols; i++) {
            const x = centeredX + i * slotSize; 
            const slot = this.add.rectangle(x, hotbarY, slotSize, slotSize, 0x333333)
                .setStrokeStyle(borderWidth, 0xffffff)
                .setOrigin(0, 0)
                .setAlpha(0.9)
                .setInteractive();

            slot.index = i;
            slot.type = 'hotbar';
            slot.highlight = this.add.rectangle(x, hotbarY, slotSize, slotSize)
                .setOrigin(0, 0)
                .setStrokeStyle(2, 0xffff00)
                .setVisible(false);

            this.inventoryPanel.add(slot);
            this.inventoryPanel.add(slot.highlight);
            this.inventoryHotbar.push(slot);
        }

        this.inventorySlots = [];
        const inventoryGap = 12; // vertical space between hotbar and grid
        const gridStartY = hotbarY + slotSize + inventoryGap;


        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                const x = centeredX + col * slotSize;
                const y = gridStartY + row * slotSize;

                const slot = this.add.rectangle(x, y, slotSize, slotSize, 0x222222)
                    .setStrokeStyle(borderWidth, 0x888888)
                    .setOrigin(0, 0)
                    .setAlpha(0.9)
                    .setInteractive();

                slot.index = row * gridCols + col;
                slot.type = 'inventory';

                slot.on('pointerover', () => {
                    slot.setStrokeStyle(2, 0xffffaa);
                });
                slot.on('pointerout', () => {
                    if (!slot.isSelected) {
                        slot.setStrokeStyle(borderWidth, 0x888888);
                    }
                });

                this.inventoryPanel.add(slot);
                this.inventorySlots.push(slot);
            }
        }

        this.input.keyboard.on('keydown-TAB', (event) => {
            event.preventDefault();
            this.toggleInventory();
        });

        this.makeSlotsDraggable([...this.inventoryHotbar, ...this.inventorySlots]);

        this.addItemToSlot(this.inventorySlots[0], 'slingshot_rock', 7);
        this.addItemToSlot(this.inventoryHotbar[0], 'slingshot', 0);

    }

    updateHealth(amount) {
        if (typeof amount === 'number') {
            this.playerData.health = Phaser.Math.Clamp(amount, 0, 100);
        }

        const health = this.playerData.health ?? 0;
        const percent = health / 100;
        const newWidth = this.healthBarWidth * percent;
        this.healthBarFill.width = newWidth;

        this.healthText.setText(`${health}`);
        this.healthText.setVisible(true);
        this.healthText.setPosition(this.healthBarX + 4, this.healthBarY + 4);
    }

    selectHotbarSlot(index) {
        if (index < 0 || index >= this.hotbarSlots.length) return;
        this.selectedSlotIndex = index;
        this.highlightHotbarSlot(index);
    }

    highlightHotbarSlot(index) {
        this.hotbarSlots.forEach((slot, i) => {
            if (i === index) slot.setStrokeStyle(3, 0xffff00);
            else slot.setStrokeStyle(2, 0xffffff);
        });
    }

    toggleInventory() {
        const showing = this.inventoryPanel.visible;
        this.inventoryPanel.setVisible(!showing);
    }

    updateSlotVisuals(slot) {
        if (slot.icon) slot.icon.destroy();
        if (slot.countText) slot.countText.destroy();

        if (!slot.item) return;

        const slotSize = 48;
        slot.icon = this.add.image(
            slot.x + slotSize / 2,
            slot.y + slotSize / 2,
            slot.item.textureKey
        ).setScale(0.5).setDepth(10);

        slot.countText = this.add.text(
            slot.x + slotSize - 16,
            slot.y + slotSize - 16,
            `${slot.item.count}`,
            {
                fontSize: '12px',
                fill: '#ffffff',
                fontFamily: 'monospace'
            }
        ).setDepth(11);

        this.inventoryPanel.add(slot.icon);
        this.inventoryPanel.add(slot.countText);
    }

    makeSlotsDraggable(slots) {
        this.input.setTopOnly(true);

        slots.forEach((slot) => {
            slot.setInteractive();

            slot.on('pointerdown', (pointer) => {
                if (!this.inventoryPanel.visible) return;

                const isLeft = pointer.leftButtonDown();
                const isRight = pointer.rightButtonDown();

                // LEFT CLICK = Pick up or place full stack
                if (isLeft) {
                    if (!this.draggingItem) {
                        if (!slot.item) return;
                        this.draggingItem = { ...slot.item };
                        slot.item = null;
                    } else {
                        if (!slot.item) {
                            slot.item = { ...this.draggingItem };
                            this.draggingItem = null;
                        } else if (slot.item.textureKey === this.draggingItem.textureKey) {
                            slot.item.count += this.draggingItem.count;
                            this.draggingItem = null;
                        } else {
                            const temp = slot.item;
                            slot.item = this.draggingItem;
                            this.draggingItem = temp;
                        }
                    }
                    this.updateSlotVisuals(slot);
                    if (slot.type === 'hotbar') {
                        this.updateBottomHotbarDisplay();}

                    this.updateDraggingVisual(pointer);
                }

                // RIGHT CLICK = Pick up/place half stack
                if (isRight) {
                    if (!this.draggingItem) {
                        if (!slot.item || slot.item.count < 2) return;
                        const half = Math.floor(slot.item.count / 2);
                        this.draggingItem = {
                            textureKey: slot.item.textureKey,
                            count: half
                        };
                        slot.item.count -= half;
                        if (slot.item.count <= 0) slot.item = null;
                        this.updateSlotVisuals(slot);
                        if (slot.type === 'hotbar') {
                            this.updateBottomHotbarDisplay();}

                        this.updateDraggingVisual(pointer);
                    } else {
                        if (!slot.item) {
                            const half = Math.floor(this.draggingItem.count / 2);
                            slot.item = {
                                textureKey: this.draggingItem.textureKey,
                                count: half
                            };
                            this.draggingItem.count -= half;
                        } else if (slot.item.textureKey === this.draggingItem.textureKey) {
                            const half = Math.floor(this.draggingItem.count / 2);
                            slot.item.count += half;
                            this.draggingItem.count -= half;
                        } else {
                            const temp = slot.item;
                            slot.item = this.draggingItem;
                            this.draggingItem = temp;
                        }

                        if (this.draggingItem?.count <= 0) {
                            this.destroyDraggingVisual();
                            this.draggingItem = null;
                        }

                        this.updateSlotVisuals(slot);
                        if (slot.type === 'hotbar') {
                            this.updateBottomHotbarDisplay();}


                        this.updateDraggingVisual(pointer);
                    }
                }
            });

            slot.on('pointerover', () => {
                this.hoveredSlot = slot;
            });
            slot.on('pointerout', () => {
                if (this.hoveredSlot === slot) this.hoveredSlot = null;
            });
        });

        // SCROLL WHEEL: pick up (up), place (down) if inventory is open
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
            if (!this.inventoryPanel.visible || !this.hoveredSlot) return;
            const slot = this.hoveredSlot;

            const scrollingUp = deltaY < 0;
            const scrollingDown = deltaY > 0;

            if (scrollingUp) {
                // PLACE 1 item
                if (!this.draggingItem) return;

                if (!slot.item) {
                    slot.item = {
                        textureKey: this.draggingItem.textureKey,
                        count: 1
                    };
                    this.draggingItem.count -= 1;
                } else if (slot.item.textureKey === this.draggingItem.textureKey) {
                    slot.item.count += 1;
                    this.draggingItem.count -= 1;
                }

                if (this.draggingItem.count <= 0) {
                    this.destroyDraggingVisual();
                    this.draggingItem = null;
                }

                this.updateSlotVisuals(slot);
                if (slot.type === 'hotbar') {
                    this.updateBottomHotbarDisplay();}

                this.updateDraggingVisual(pointer);
            }

            if (scrollingDown) {
                // Pick up 1 item if not holding anything and slot has an item
                if (!this.draggingItem && slot.item) {
                    this.draggingItem = {
                        textureKey: slot.item.textureKey,
                        count: 1
                    };
                    slot.item.count -= 1;
                    if (slot.item.count <= 0) slot.item = null;

                    this.updateSlotVisuals(slot);
                    if (slot.type === 'hotbar') {
                        this.updateBottomHotbarDisplay();}


                    this.updateDraggingVisual(pointer);
                }
                // Add 1 item to stack if holding the same type
                else if (
                    this.draggingItem &&
                    slot.item &&
                    slot.item.textureKey === this.draggingItem.textureKey
                ) {
                    this.draggingItem.count += 1;
                    slot.item.count -= 1;
                    if (slot.item.count <= 0) slot.item = null;

                    this.updateSlotVisuals(slot);
                    if (slot.type === 'hotbar') {
                        this.updateBottomHotbarDisplay();}

                    this.updateDraggingVisual(pointer);
                }
            }
        });
    }

    updateDraggingVisual() {
        if (!this.draggingItem) {
            this.destroyDraggingVisual();
            return;
        }

        if (!this.draggingIcon) {
            this.draggingIcon = this.add.image(0, 0, this.draggingItem.textureKey)
                .setScale(0.5)
                .setDepth(1000);
        } else {
            this.draggingIcon.setTexture(this.draggingItem.textureKey);
        }

        if (!this.draggingIconCount) {
            this.draggingIconCount = this.add.text(
                0, 0,
                `${this.draggingItem.count}`,
                {
                    fontSize: '12px',
                    fill: '#ffffff',
                    fontFamily: 'monospace'
                }
            ).setDepth(1001);
        } else {
            this.draggingIconCount.setText(`${this.draggingItem.count}`);
        }

        this.updateBottomHotbarDisplay();
    }

    destroyDraggingVisual() {
        if (this.draggingIcon) {
            this.draggingIcon.destroy();
            this.draggingIcon = null;
        }
        if (this.draggingIconCount) {
            this.draggingIconCount.destroy();
            this.draggingIconCount = null;
        }

        this.updateBottomHotbarDisplay();
    }

    update() {
        if (this.draggingIcon && this.input.activePointer) {
            const pointer = this.input.activePointer;
            this.draggingIcon.setPosition(pointer.worldX, pointer.worldY);
            if (this.draggingIconCount) {
                this.draggingIconCount.setPosition(pointer.worldX + 12, pointer.worldY + 12);
            }
        }
    }

    setInventoryAlpha(value) {
        if (!this.inventoryPanel) return;

        this.inventoryPanel.iterate((child) => {
            if (child.setAlpha) {
                child.setAlpha(value);
            }
        });
    }

    

    addItemToSlot(slot, textureKey, count) {
        slot.item = { textureKey, count };
        this.updateSlotVisuals(slot);
        if (slot.type === 'hotbar') {
            this.updateBottomHotbarDisplay();}
    }


    updateBottomHotbarDisplay() {
        for (let i = 0; i < this.hotbarVisuals.length; i++) {
            const visual = this.hotbarVisuals[i];
            const slot = this.inventoryHotbar[i];

            if (slot.item) {
                visual.icon.setTexture(slot.item.textureKey);
                visual.icon.setVisible(true);

                visual.countText.setText(`${slot.item.count}`);
                visual.countText.setVisible(true);
            } else {
                visual.icon.setVisible(false);
                visual.countText.setVisible(false);
            }
        }
    }

    getEquippedItem() {
        return this.inventoryHotbar[this.selectedSlotIndex]?.item || null;
    }

    addItemToFirstAvailableSlot(textureKey, count = 1) {
        const tryAddToSlot = (slot) => {
            if (!slot.item) {
                slot.item = { textureKey, count };
                this.updateSlotVisuals(slot);
                if (slot.type === 'hotbar') this.updateBottomHotbarDisplay();
                return true;
            } else if (slot.item.textureKey === textureKey) {
                slot.item.count += count;
                this.updateSlotVisuals(slot);
                if (slot.type === 'hotbar') this.updateBottomHotbarDisplay();
                return true;
            }
            return false;
        };

        for (let slot of this.inventorySlots) {
            if (tryAddToSlot(slot)) return true;
        }
        for (let slot of this.inventoryHotbar) {
            if (tryAddToSlot(slot)) return true;
        }
        return false;
    }

    consumeAmmo(textureKey) {
        const tryRemoveFromSlot = (slot) => {
            if (slot.item && slot.item.textureKey === textureKey) {
                slot.item.count -= 1;
                if (slot.item.count <= 0) slot.item = null;
                this.updateSlotVisuals(slot);
                if (slot.type === 'hotbar') this.updateBottomHotbarDisplay();
                return true;
            }
            return false;
        };

        for (let slot of this.inventorySlots) {
            if (tryRemoveFromSlot(slot)) return true;
        }
        for (let slot of this.inventoryHotbar) {
            if (tryRemoveFromSlot(slot)) return true;
        }
        return false;
    }

    hasItemInInventory(textureKey) {
        for (let slot of [...this.inventoryHotbar, ...this.inventorySlots]) {
            if (slot.item && slot.item.textureKey === textureKey && slot.item.count > 0) {
                return true;
            }
        }
        return false;
    }
}
