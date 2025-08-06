export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    preload() {
        // Load player, zombie, rock, and bullet images
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        this.load.image('zombie', 'assets/enemies/zombie.png');
        this.load.image('rock', 'assets/resources/rock.png');
        this.load.image('bullet', 'assets/weapons/bullet.png');
    }

    create() {
        this.inventory = []; // Holds collected resources (e.g., rocks)
        this.ammo = 0; // Player starts with 0 ammo
        this.health = 100; //player starts with full health
        this.lastHitTime = 0; //hit delay

        // Start UIScene and pass player data
        this.health = 100;
        this.ammo = 0;

        // Start UIScene with fresh data
        this.scene.launch('UIScene', { playerData: { health: this.health, ammo: this.ammo } });
        this.uiScene = this.scene.get('UIScene');

        // Add the player to the center of the screen
        this.player = this.physics.add.sprite(400, 300, 'player').setScale(0.5);
        this.player.setCollideWorldBounds(true); // Prevent player from going offscreen

        // Set up WASD movement keys
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys("W,A,S,D");

        // Create a bullet group for shooting
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 20,                  // Max bullets allowed on screen
            runChildUpdate: true
        });

        // Fire bullets when the mouse is clicked
        this.input.on('pointerdown', this.fireBullet, this);

        // Create a group for zombies
        this.zombies = this.physics.add.group();

        // Start a timer that spawns zombies at random intervals between 1–3 seconds
        this.spawnZombieTimer = this.time.addEvent({
            delay: Phaser.Math.Between(1000, 3000),
            callback: this.spawnZombie,
            callbackScope: this,
            loop: true
        });

        // Add collectible rocks randomly on the map
        this.resources = this.physics.add.group();
        for (let i = 0; i < 10; i++) {
            const rock = this.resources.create(
                Phaser.Math.Between(100, 700),
                Phaser.Math.Between(100, 500),
                'rock'
            );
            rock.setScale(1); // Rocks are already small, no extra scaling needed
        }

        // Game over state variables
        this.isGameOver = false;
        this.gameOverText = null;

        // Handle collisions: player touching rock → collect it
        this.physics.add.overlap(this.player, this.resources, this.collectResource, null, this);

        // Player touching zombie → trigger game over
        this.physics.add.overlap(this.player, this.zombies, this.handlePlayerZombieCollision, null, this);

        // Bullet hitting zombie → destroy both
        this.physics.add.overlap(this.bullets, this.zombies, this.handleBulletHit, null, this);
    }

    update() {
        // Handle game restart after Game Over
        if (this.isGameOver) {
            // Press SPACE to restart the scene
            if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE))) {
                // Stop UIScene so it can be re-launched with fresh data
                this.scene.stop('UIScene');

                // Restart the MainScene
                this.scene.restart();
            }

            return;
        }

        // Player movement logic
        const speed = 100;
        const p = this.player.body.velocity;
        p.set(0); // Reset velocity every frame

        // WASD controls
        if (this.keys.W.isDown) p.y = -speed;
        else if (this.keys.S.isDown) p.y = speed;

        if (this.keys.A.isDown) p.x = -speed;
        else if (this.keys.D.isDown) p.x = speed;

        // Move zombies toward the player
        this.zombies.getChildren().forEach(zombie => {
            this.physics.moveToObject(zombie, this.player, 40);

            // Flip zombie sprite based on movement direction
            if (zombie.body.velocity.x < 0) {
                zombie.setFlipX(true); // face left
            } else if (zombie.body.velocity.x > 0) {
                zombie.setFlipX(false); // face right
            }
        });

    }

    fireBullet(pointer) {
        // Don't fire if out of ammo
        if (this.ammo <= 0) {
            console.log("Out of ammo!");
            return;
        }

        // Try to get an available bullet from the group
        const bullet = this.bullets.get(this.player.x, this.player.y, 'bullet');

        if (bullet) {
            // Deduct 1 ammo and update the HUD
            this.ammo -= 1;
            this.uiScene.updateAmmo(this.ammo);
            console.log(`Ammo left: ${this.ammo}`);

            // Activate and configure the bullet
            bullet.setActive(true).setVisible(true);
            bullet.body.allowGravity = false;
            bullet.setCollideWorldBounds(true);
            bullet.body.onWorldBounds = true;

            // Calculate angle and velocity to point at the mouse
            const angle = Phaser.Math.Angle.Between(
                this.player.x,
                this.player.y,
                pointer.worldX,
                pointer.worldY
            );

            const speed = 400;
            const velocity = this.physics.velocityFromRotation(angle, speed);

            bullet.setVelocity(velocity.x, velocity.y);
            bullet.setRotation(angle); // Makes bullet face the right direction
            bullet.setSize(8, 8);      // Smaller collision box
            bullet.setScale(.4);       // 32x32 is already correctly sized
        }
    }

    handleBulletHit(bullet, zombie) {
        // When bullet hits zombie, destroy both
        bullet.destroy();
        zombie.destroy();
    }

    collectResource(player, resource) {
        // Add 1 ammo per rock collected
        this.ammo += 1;
        this.uiScene.updateAmmo(this.ammo);
        console.log(`Ammo: ${this.ammo}`);

        // Hide and deactivate the rock
        resource.disableBody(true, true);

        // Random delay between 5–8 seconds
        const delay = Phaser.Math.Between(5000, 7000);

        // Respawn the rock after 5 seconds at a new random location
        this.time.delayedCall(5000, () => {
            const x = Phaser.Math.Between(100, 700);
            const y = Phaser.Math.Between(100, 500);
            resource.enableBody(true, x, y, true, true);
        });
    }

    handlePlayerZombieCollision(player, zombie) {
        if (this.isGameOver) return;

        const currentTime = this.time.now;
        const cooldown = 500; // .5 seconds

        if (currentTime - this.lastHitTime < cooldown) {
            return; // Still in cooldown, ignore hit
        }

        this.lastHitTime = currentTime; // Record hit time

        // Reduce health
        const damage = Phaser.Math.Between(5, 10);
        this.health = Math.max(0, this.health - damage);
        this.uiScene.updateHealth(this.health);

        if (this.health <= 0) {
            this.isGameOver = true;
            this.physics.pause();
            player.setTint(0x720c0c);

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
        // Spawn a zombie at a random edge of the screen
        const edge = Phaser.Math.Between(0, 3);
        let x, y;
        const maxX = this.sys.game.config.width;
        const maxY = this.sys.game.config.height;

        switch (edge) {
            case 0: x = Phaser.Math.Between(0, maxX); y = 0; break; // top
            case 1: x = Phaser.Math.Between(0, maxX); y = maxY; break; // bottom
            case 2: x = 0; y = Phaser.Math.Between(0, maxY); break; // left
            case 3: x = maxX; y = Phaser.Math.Between(0, maxY); break; // right
        }

        const zombie = this.zombies.create(x, y, 'zombie');
        zombie.setScale(0.1); // Shrink large zombie sprite

        // Reset the timer with a new delay for next spawn (1–3 sec)
        this.spawnZombieTimer.reset({
            delay: Phaser.Math.Between(1000, 3000),
            callback: this.spawnZombie,
            callbackScope: this,
            loop: true
        });
    }
}
