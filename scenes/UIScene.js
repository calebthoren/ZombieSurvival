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

        this.ammoText = this.add.text(10, 40, '', {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'monospace'
        });
        this.updateAmmo();

        const screenCenterX = this.cameras.main.width / 2;
        const slotSize = 48;
        const spacing = 8;
        this.hotbarSlots = [];
        this.hotbarTexts = [];
        this.selectedSlotIndex = 0;

        for (let i = 0; i < 5; i++) {
            const slotX = screenCenterX - ((slotSize + spacing) * 2) + i * (slotSize + spacing);

            const slot = this.add.rectangle(
                slotX, this.cameras.main.height - 60,
                slotSize, slotSize, 0x333333
            ).setStrokeStyle(2, 0xffffff).setAlpha(0.65);
            this.hotbarSlots.push(slot);

            const slotNumber = this.add.text(
                slotX - slotSize / 2 + 4,
                this.cameras.main.height - 60 - 20,
                `${i + 1}`,
                {
                    fontSize: '10px',
                    fill: '#ffffff',
                    fontFamily: 'monospace'
                }
            ).setAlpha(0.65);

            this.hotbarTexts.push(slotNumber);
        }

        this.highlightHotbarSlot(this.selectedSlotIndex);

        this.hotbarKeyListener = this.input.keyboard.on('keydown', (event) => {
            const mainScene = this.scene.get('MainScene');
            if (!mainScene || mainScene.isGameOver) return;

            const key = parseInt(event.key);
            if (key >= 1 && key <= 5) {
                this.selectHotbarSlot(key - 1);
            }
        });
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
        this.healthText.setPosition(
            this.healthBarX + 4,
            this.healthBarY + 4
        );
    }

    updateAmmo(amount) {
        if (typeof amount === 'number') {
            this.playerData.ammo = Math.max(0, amount);
        }

        const count = this.playerData.ammo ?? 0;
        this.ammoText.setText(`Ammo: ${count}`);
    }

    selectHotbarSlot(index) {
        if (index < 0 || index >= this.hotbarSlots.length) return;

        this.selectedSlotIndex = index;
        this.highlightHotbarSlot(index);
    }

    highlightHotbarSlot(index) {
        this.hotbarSlots.forEach((slot, i) => {
            if (i === index) {
                slot.setStrokeStyle(3, 0xffff00);
            } else {
                slot.setStrokeStyle(2, 0xffffff);
            }
        });
    }
}
