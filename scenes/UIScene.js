export default class UIScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UIScene' });
    }

    init(data) {
        this.playerData = data.playerData || { health: 100, ammo: 10 };
    }

    create() {
        console.log("UIScene started!");

        // --- Health UI ---
        // --- Health Bar ---
        this.healthBarWidth = 200;
        this.healthBarHeight = 20;
        this.healthBarX = 10;
        this.healthBarY = 10;

        // Background bar (grey)
        this.healthBarBackground = this.add.rectangle(
            this.healthBarX,
            this.healthBarY,
            this.healthBarWidth,
            this.healthBarHeight,
            0x222222
        ).setOrigin(0, 0);

        // Foreground bar (red, will shrink)
        this.healthBarFill = this.add.rectangle(
            this.healthBarX,
            this.healthBarY,
            this.healthBarWidth,
            this.healthBarHeight,
            0xff0000
        ).setOrigin(0, 0);

        // Health number text (dark red)
        this.healthText = this.add.text(0, 0, '', {
            fontSize: '10px',
            fill: '#5e0000ff',
            fontFamily: 'monospace'
        });

        this.updateHealth();

        // --- Ammo UI ---
        this.ammoText = this.add.text(10, 30, '', {
            fontSize: '16px',
            fill: '#ffffff',
            fontFamily: 'monospace'
        });
        this.updateAmmo();

        // --- Hotbar UI ---
        const screenCenterX = this.cameras.main.width / 2;
        const slotSize = 48;
        const spacing = 8;
        this.hotbarSlots = [];

        for (let i = 0; i < 5; i++) {
            const slotX = screenCenterX - ((slotSize + spacing) * 2) + i * (slotSize + spacing);
            const slot = this.add.rectangle(slotX, this.cameras.main.height - 60, slotSize, slotSize, 0x333333);
            slot.setStrokeStyle(2, 0xffffff);
            this.hotbarSlots.push(slot);
        }
    }

    updateHealth(amount) {
        if (typeof amount === 'number') {
            this.playerData.health = Phaser.Math.Clamp(amount, 0, 100);
        }

        const health = this.playerData.health ?? 0;

        // Resize health bar based on percentage
        const percent = health / 100;
        const newWidth = this.healthBarWidth * percent;
        this.healthBarFill.width = newWidth;

        // Update health text
        const text = `${health}`;
        this.healthText.setText(text);

        // Position text inside the red bar, aligned right
        const textPadding = 4;
        const textWidth = this.healthText.width;
        if (textWidth + textPadding * 2 <= newWidth) {
            this.healthText.setVisible(true);
            this.healthText.setPosition(
                this.healthBarX + newWidth - textWidth - textPadding,
                this.healthBarY + 4
            );
        } else {
            this.healthText.setVisible(false);
        }
    }


    updateAmmo(amount) {
        if (typeof amount === 'number') {
            this.playerData.ammo = Math.max(0, amount);
        }

        const count = this.playerData.ammo ?? 0;
        this.ammoText.setText(`Ammo: ${count}`);
    }

}
