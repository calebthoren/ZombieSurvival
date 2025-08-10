// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js'; // NEW


export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');

        // Day/Night state
        this.dayIndex = 1;              // starts on Day 1
        this.phase = 'day';             // 'day' | 'night'
        this.phaseStartTime = 0;        // ms since scene start
        this.waveNumber = 0;            // increments each night
        this.spawnZombieTimer = null;   // day trickle timer
        this.nightWaveTimer = null;     // night waves timer
        
    }

    preload() {
        // NOTE: Using standalone images
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        this.load.image('zombie', 'assets/enemies/zombie.png');
        this.load.image('big_rock_node', 'assets/resources/big_rock_node.png');
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');
    }

    create() {
        // Basic state
        this.health = 100;
        this.isGameOver = false;

        // Launch UI and keep a reference
        this.scene.launch('UIScene', { playerData: { health: this.health, ammo: 0 } });
        this.uiScene = this.scene.get('UIScene');

        // Player
        this.player = this.physics.add.sprite(400, 300, 'player').setScale(0.5);
        this.player.setCollideWorldBounds(true);

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');

        // Projectile pool (used for slingshot rocks)
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 20,
            runChildUpdate: true
        });

        // Melee hit circle pool (short-lived sensors)
        this.meleeHits = this.physics.add.group();


        // Shooting
        this.shootListener = this.input.on('pointerdown', this.fireBullet, this);

        // Groups
        this.zombies = this.physics.add.group();
        this.resources = this.physics.add.group();

        // Spawn resources using data config
        this.spawnResourceNodes();

        // Overlaps
        this.physics.add.overlap(this.player, this.resources, this.collectResource, null, this);
        this.physics.add.overlap(this.player, this.zombies, this.handlePlayerZombieCollision, null, this);
        this.physics.add.overlap(this.bullets, this.zombies, this.handleBulletHit, null, this);
        this.physics.add.overlap(this.meleeHits, this.zombies, this.handleMeleeHit, null, this);


        // Night overlay
        const w = this.sys.game.config.width;
        const h = this.sys.game.config.height;
        this.nightOverlay = this.add.rectangle(0, 0, w, h, 0x000000)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(999)
            .setAlpha(0);

        // Start the cycle at DAY
        this.startDay();

        // Update small clock/label in the UI
        this.time.addEvent({
            delay: 250,
            loop: true,
            callback: () => this.updateTimeUi(),
        });
    }

    // --------------------------
    // World Gen — Resources
    // --------------------------
    spawnResourceNodes() {
        const cfg = WORLD_GEN.spawns.resources.big_rock_node;
        const count = Phaser.Math.Between(cfg.minCount, cfg.maxCount);

        for (let i = 0; i < count; i++) {
            const x = Phaser.Math.Between(100, this.sys.game.config.width - 100);
            const y = Phaser.Math.Between(100, this.sys.game.config.height - 100);
            const rock = this.resources.create(x, y, 'big_rock_node');
            rock.setScale(1);
        }
    }

    // --------------------------
    // Day/Night Cycle Management
    // --------------------------
    startDay() {
        this.phase = 'day';
        this.phaseStartTime = this.time.now;

        if (this.nightWaveTimer) {
            this.nightWaveTimer.remove(false);
            this.nightWaveTimer = null;
        }
        this.waveNumber = 0;

        this.scheduleDaySpawn();
        this.updateTimeUi();
    }

    startNight() {
        this.phase = 'night';
        this.phaseStartTime = this.time.now;

        if (this.spawnZombieTimer) {
            this.spawnZombieTimer.remove(false);
            this.spawnZombieTimer = null;
        }

        this.waveNumber = 0;
        this.scheduleNightWave();
        this.updateTimeUi();
    }

    scheduleDaySpawn() {
        const dayCfg = WORLD_GEN.spawns.zombie.day;
        const delay = Phaser.Math.Between(dayCfg.minDelayMs, dayCfg.maxDelayMs);

        this.spawnZombieTimer = this.time.addEvent({
            delay,
            callback: () => {
                if (this.phase !== 'day' || this.isGameOver) return;
                if (Math.random() < dayCfg.chance) {
                    this.spawnZombie();
                }
                this.scheduleDaySpawn();
            },
            callbackScope: this,
            loop: false
        });
    }

    scheduleNightWave() {
        const nightCfg = WORLD_GEN.spawns.zombie.nightWaves;
        this.nightWaveTimer = this.time.addEvent({
            delay: 10,
            loop: false,
            callback: () => {
                this.waveNumber++;
                if (this.phase !== 'night' || this.isGameOver) return;

                const targetCount = Math.min(
                    nightCfg.baseCount + (this.waveNumber - 1) * nightCfg.perWave,
                    nightCfg.maxCount
                );

                for (let i = 0; i < targetCount; i++) {
                    this.time.delayedCall(i * nightCfg.burstIntervalMs, () => {
                        if (this.phase === 'night' && !this.isGameOver) {
                            this.spawnZombie();
                        }
                    });
                }

                this.time.delayedCall(nightCfg.waveIntervalMs, () => {
                    if (this.phase === 'night' && !this.isGameOver) {
                        this.scheduleNightWave();
                    }
                });
            }
        });
    }

    // --------------------------
    // Phase timing helpers
    // --------------------------
    getPhaseElapsed() {
        return this.time.now - this.phaseStartTime;
    }

    getPhaseDuration() {
        const dn = WORLD_GEN.dayNight;
        return this.phase === 'day' ? dn.dayMs : dn.nightMs;
    }

    update(time, delta) {
        if (this.isGameOver) {
            if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE))) {
                this.scene.stop('UIScene');
                this.scene.restart();
            }
            return;
        }

        // Movement with normalization (no diagonal speed boost)
        const speed = 100;
        const p = this.player.body.velocity;
        p.set(0);

        const up = (this.keys.W?.isDown) || (this.cursors.up?.isDown);
        const down = (this.keys.S?.isDown) || (this.cursors.down?.isDown);
        const left = (this.keys.A?.isDown) || (this.cursors.left?.isDown);
        const right = (this.keys.D?.isDown) || (this.cursors.right?.isDown);

        if (up) p.y = -speed;
        else if (down) p.y = speed;
        if (left) p.x = -speed;
        else if (right) p.x = speed;

        if (p.x !== 0 && p.y !== 0) {
            p.x *= Math.SQRT1_2; // 1/sqrt(2)
            p.y *= Math.SQRT1_2;
        }

        // Zombie pursuit
        this.zombies.getChildren().forEach(zombie => {
            this.physics.moveToObject(zombie, this.player, 40);
            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);
        });

        // Check phase transitions
        const elapsed = this.getPhaseElapsed();
        const duration = this.getPhaseDuration();
        if (elapsed >= duration) {
            if (this.phase === 'day') {
                this.startNight();
            } else {
                this.dayIndex++;
                this.startDay();
            }
        }

        // Update overlay alpha for dusk/dawn feel
        this.updateNightOverlay();
    }

    updateNightOverlay() {
        const { transitionMs, nightOverlayAlpha } = WORLD_GEN.dayNight;
        const elapsed = this.getPhaseElapsed();
        const duration = this.getPhaseDuration();

        let target = 0;
        if (this.phase === 'night') {
            if (elapsed <= transitionMs) {
                target = Phaser.Math.Linear(0, nightOverlayAlpha, elapsed / transitionMs);
            } else if (elapsed >= duration - transitionMs) {
                const t = (elapsed - (duration - transitionMs)) / transitionMs;
                target = Phaser.Math.Linear(nightOverlayAlpha, 0, t);
            } else {
                target = nightOverlayAlpha;
            }
        } else {
            target = 0;
        }
        this.nightOverlay.setAlpha(target);
    }

    updateTimeUi() {
        if (!this.uiScene) return;
        const elapsed = this.getPhaseElapsed();
        const duration = this.getPhaseDuration();
        const progress = Phaser.Math.Clamp(elapsed / duration, 0, 1);

        const phaseLabel = this.phase === 'day' ? 'Daytime' : 'Night';
        this.uiScene.updateTimeDisplay(this.dayIndex, phaseLabel, progress);
    }

    // --------------------------
    // Combat (uses InventoryModel via UIScene)
    // --------------------------
    fireBullet(pointer) {
        if (this.isGameOver) return;

        const equipped = this.uiScene?.inventory?.getEquipped();
        if (!equipped) return;

        // Route by equipped weapon type from item data
        const def = ITEM_DB[equipped.id];
        const cat = def?.weapon?.category;

        if (cat === 'ranged' && equipped.id === 'slingshot') {
            // ---- SLINGSHOT (existing behavior) ----
            const { ammoId, total } = this.uiScene.inventory.totalOfActiveAmmo('slingshot');
            if (!ammoId || total <= 0) return;

            const bullet = this.bullets.get(this.player.x, this.player.y, ammoId);
            if (bullet) {
                this.uiScene.inventory.consumeAmmo(ammoId, 1);

                bullet.setActive(true).setVisible(true);
                bullet.body.allowGravity = false;
                bullet.setCollideWorldBounds(true);
                bullet.body.onWorldBounds = true;

                const angle = Phaser.Math.Angle.Between(
                    this.player.x, this.player.y, pointer.worldX, pointer.worldY
                );
                const speed = 400;
                const velocity = this.physics.velocityFromRotation(angle, speed);
                bullet.setVelocity(velocity.x, velocity.y);
                bullet.setRotation(angle);
                bullet.setSize(8, 8);
                bullet.setScale(0.4);
            }
            return;
        }

        if (cat === 'melee' && equipped.id === 'crude_bat') {
            // ---- MELEE BAT ----
            this.swingBat(pointer, def.weapon);
            return;
        }

        // Otherwise, no primary action for this item (yet)
    }

    swingBat(pointer, wpn) {
        // Per-weapon tuning
        const swingDurationMs = wpn?.swingDurationMs ?? 160;
        const swingCooldownMs = wpn?.swingCooldownMs ?? 280;
        const range = wpn?.range ?? 30;
        const radius = wpn?.radius ?? 22;

        // Cooldown
        const now = this.time.now;
        if (!this.lastSwingTime) this.lastSwingTime = 0;
        if (now - this.lastSwingTime < swingCooldownMs) return;
        this.lastSwingTime = now;

        // Aim at cursor
        let aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        aim = Phaser.Math.Angle.Normalize(aim);

        // 90° arc centered on aim
        const halfArc = Phaser.Math.DegToRad(45);
        let startRot = Phaser.Math.Angle.Normalize(aim - halfArc);
        let endRot   = Phaser.Math.Angle.Normalize(aim + halfArc);
        if (endRot < startRot) endRot += Math.PI * 2; // unwrap

        // Bat sprite
        if (this.batSprite) this.batSprite.destroy();

        // If the bat art is diagonal, add a base offset so it appears vertical at 0 radians
        const baseOffset = Phaser.Math.DegToRad(45); // adjust this value until the bat looks vertical

        this.batSprite = this.add.image(this.player.x, this.player.y, 'crude_bat')
            .setDepth(500)
            .setOrigin(0.1, 0.8)
            .setRotation(startRot);

        // Hit circle
        const hit = this.add.circle(this.player.x, this.player.y, radius, 0xff0000, 0);
        this.physics.add.existing(hit);
        hit.body.setAllowGravity(false);
        if (hit.body.setCircle) {
            hit.body.setCircle(radius);
            hit.body.setOffset(-radius, -radius);
        }
        this.meleeHits.add(hit);

        // Drive swing using a tweened t value for precise control
        const swing = { t: 0 };
        const deltaRot = endRot - startRot;
        this.tweens.add({
            targets: swing,
            t: 1,
            duration: swingDurationMs,
            ease: 'Sine.InOut',
            onUpdate: () => {
                const rot = startRot + swing.t * deltaRot;
                this.batSprite.setPosition(this.player.x, this.player.y).setRotation(rot + baseOffset);

                const hx = this.player.x + Math.cos(rot) * range;
                const hy = this.player.y + Math.sin(rot) * range;
                hit.setPosition(hx, hy);
            },
            onComplete: () => {
                if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }
            }
        });

        this.time.delayedCall(swingDurationMs, () => {
            if (hit && hit.destroy) hit.destroy();
        });
    }

    handleMeleeHit(hit, zombie) {
        if (!zombie || !zombie.active) return;

        // Simple i-frames to prevent multi-hits within a single swing overlap
        const now = this.time.now;
        if (!zombie.lastMeleeTime) zombie.lastMeleeTime = 0;
        if (now - zombie.lastMeleeTime < 120) return;
        zombie.lastMeleeTime = now;

        // TODO: When zombies have HP, subtract itemDB damage instead of destroy
        zombie.destroy();
    }

    handleBulletHit(bullet, zombie) {
        bullet.destroy();
        zombie.destroy();
    }

    collectResource(player, resource) {
        // Give 1 rock (ammo) using the inventory model (grid-first, then hotbar)
        if (this.uiScene?.inventory) {
            this.uiScene.inventory.addItem('slingshot_rock', 1);
        }

        // Respawn the node after a short delay
        resource.disableBody(true, true);
        const delay = Phaser.Math.Between(5000, 7000);
        this.time.delayedCall(delay, () => {
            const x = Phaser.Math.Between(100, this.sys.game.config.width - 100);
            const y = Phaser.Math.Between(100, this.sys.game.config.height - 100);
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

    // Spawn a zombie at a random screen edge
    spawnZombie() {
        const edge = Phaser.Math.Between(0, 3);
        const maxX = this.sys.game.config.width;
        const maxY = this.sys.game.config.height;
        let x, y;

        switch (edge) {
            case 0: x = Phaser.Math.Between(0, maxX); y = 0; break;
            case 1: x = Phaser.Math.Between(0, maxX); y = maxY; break;
            case 2: x = 0; y = Phaser.Math.Between(0, maxY); break;
            case 3: x = maxX; y = Phaser.Math.Between(0, maxY); break;
        }

        const zombie = this.zombies.create(x, y, 'zombie');
        zombie.lastHitTime = 0;
        zombie.setScale(0.1);
    }
}
