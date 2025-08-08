export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    preload() {
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        this.load.image('zombie', 'assets/enemies/zombie.png');
        this.load.image('big_rock_node', 'assets/resources/big_rock_node.png');
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
    }

    create() {
        this.health = 100;
        this.ammo = 0;
        this.isGameOver = false;

        this.scene.launch('UIScene', { playerData: { health: this.health, ammo: this.ammo } });
        this.uiScene = this.scene.get('UIScene');

        this.player = this.physics.add.sprite(400, 300, 'player').setScale(0.5);
        this.player.setCollideWorldBounds(true);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys("W,A,S,D");

        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 20,
            runChildUpdate: true
        });

        this.shootListener = this.input.on('pointerdown', this.fireBullet, this);

        this.zombies = this.physics.add.group();

        this.spawnZombieTimer = this.time.addEvent({
            delay: Phaser.Math.Between(1000, 3000),
            callback: this.spawnZombie,
            callbackScope: this,
            loop: true
        });

        this.resources = this.physics.add.group();
        for (let i = 0; i < 10; i++) {
            const rock = this.resources.create(
                Phaser.Math.Between(100, 700),
                Phaser.Math.Between(100, 500),
                'big_rock_node'
            );
            rock.setScale(1);
        }

        this.inventory = [];

        this.physics.add.overlap(this.player, this.resources, this.collectResource, null, this);
        this.physics.add.overlap(this.player, this.zombies, this.handlePlayerZombieCollision, null, this);
        this.physics.add.overlap(this.bullets, this.zombies, this.handleBulletHit, null, this);
    }

    update() {
        if (this.isGameOver) {
            if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE))) {
                this.scene.stop('UIScene');
                this.scene.restart();
            }
            return;
        }

        const speed = 100;
        const p = this.player.body.velocity;
        p.set(0);

        if (this.keys.W.isDown) p.y = -speed;
        else if (this.keys.S.isDown) p.y = speed;

        if (this.keys.A.isDown) p.x = -speed;
        else if (this.keys.D.isDown) p.x = speed;

        this.zombies.getChildren().forEach(zombie => {
            this.physics.moveToObject(zombie, this.player, 40);
            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);
        });
    }

    fireBullet(pointer) {
        if (this.isGameOver) return;

        const equipped = this.uiScene.getEquippedItem();
        if (!equipped || equipped.textureKey !== 'slingshot') {
            console.log("No slingshot equipped.");
            return;
        }

        if (!this.uiScene.hasItemInInventory('slingshot_rock')) {
            console.log("Out of slingshot ammo.");
            return;
        }

        // Get bullet from pool
        const bullet = this.bullets.get(this.player.x, this.player.y, 'slingshot_rock');
        if (bullet) {
            this.uiScene.consumeAmmo('slingshot_rock');

            bullet.setActive(true).setVisible(true);
            bullet.body.allowGravity = false;
            bullet.setCollideWorldBounds(true);
            bullet.body.onWorldBounds = true;

            const angle = Phaser.Math.Angle.Between(
                this.player.x,
                this.player.y,
                pointer.worldX,
                pointer.worldY
            );

            const speed = 400;
            const velocity = this.physics.velocityFromRotation(angle, speed);
            bullet.setVelocity(velocity.x, velocity.y);
            bullet.setRotation(angle);
            bullet.setSize(8, 8);
            bullet.setScale(0.4);
        }
    }




    handleBulletHit(bullet, zombie) {
        bullet.destroy();
        zombie.destroy();
    }

    collectResource(player, resource) {
        const added = this.uiScene.addItemToFirstAvailableSlot('slingshot_rock', 1);

        if (!added) {
            console.log("Inventory full. Couldn't collect rock.");
            // Optionally: show a message or sound here
        }

        resource.disableBody(true, true);

        const delay = Phaser.Math.Between(5000, 7000);
        this.time.delayedCall(delay, () => {
            const x = Phaser.Math.Between(100, 700);
            const y = Phaser.Math.Between(100, 500);
            resource.enableBody(true, x, y, true, true);
        });
    }


    handlePlayerZombieCollision(player, zombie) {
        if (this.isGameOver) return;

        const currentTime = this.time.now;
        const cooldown = 500;

        if (!zombie.lastHitTime) zombie.lastHitTime = 0;

        if (currentTime - zombie.lastHitTime < cooldown) return;
        zombie.lastHitTime = currentTime;

        const damage = Phaser.Math.Between(5, 10);
        this.health = Math.max(0, this.health - damage);
        this.uiScene.updateHealth(this.health);

        if (this.health <= 0) {
            this.isGameOver = true;
            this.physics.pause();
            player.setTint(0x720c0c);

            if (this.shootListener) {
                this.input.off('pointerdown', this.fireBullet, this);
                this.shootListener = null;
            }

            this.gameOverText = this.add.text(
                this.cameras.main.centerX,
                this.cameras.main.centerY,
                'Game Over!\nPress SPACE to restart',
                {
                    fontSize: '32px',
                    fill: '#fff',
                    align: 'center',
                    padding: { x: 20, y: 20 }
                }
            ).setOrigin(0.5);
            this.gameOverText.setStroke('#720c0c', 3);
        }
    }

    spawnZombie() {
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        const maxX = this.sys.game.config.width;
        const maxY = this.sys.game.config.height;

        switch (edge) {
            case 0: x = Phaser.Math.Between(0, maxX); y = 0; break;
            case 1: x = Phaser.Math.Between(0, maxX); y = maxY; break;
            case 2: x = 0; y = Phaser.Math.Between(0, maxY); break;
            case 3: x = maxX; y = Phaser.Math.Between(0, maxY); break;
        }

        const zombie = this.zombies.create(x, y, 'zombie');
        zombie.lastHitTime = 0; // individual cooldown

        zombie.setScale(0.1);

        this.spawnZombieTimer.reset({
            delay: Phaser.Math.Between(1000, 3000),
            callback: this.spawnZombie,
            callbackScope: this,
            loop: true
        });
    }
}
