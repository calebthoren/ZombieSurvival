// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js'; // NEW


export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
        // Day/Night state
        this.dayIndex = 1;
        this.phase = 'day';
        this.phaseStartTime = 0;
        this.waveNumber = 0;
        this.spawnZombieTimer = null;
        this.nightWaveTimer = null;

        // Charge state (UI only; keeps your current shooting model)
        this.isCharging = false;
        this.chargeStart = 0;
        this.chargeMaxMs = 1500;
        this.lastCharge = 0;

        // Melee swing state
        this.isSwinging = false;   // true only during tween
        this.cooldownUntil = 0;    // timestamp (ms) when next swing is allowed
        this.swingEndAt = 0;       // hard stop time for current swing (watchdog)

    }

    preload() {
        //player
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        //zombies
        this.load.image('zombie', 'assets/enemies/zombie.png');
        //weapons and ammo
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');
        //rocks
        this.load.image('rock2A', 'assets/resources/rocks/rock2A.png');
        this.load.image('rock2B', 'assets/resources/rocks/rock2B.png');
        this.load.image('rock2C', 'assets/resources/rocks/rock2C.png');
        this.load.image('rock2D', 'assets/resources/rocks/rock2D.png');
        this.load.image('rock2E', 'assets/resources/rocks/rock2E.png');

    }

    create() {
        // Basic state
        this.health = 100;
        this.isGameOver = false;

        // Stamina state
        this.staminaMax = 100;
        this.stamina = this.staminaMax;
        this._lastStaminaSpendTime = 0;      // timestamp of last spend (for regen delay)
        this._staminaRegenDelayMs = 1000;    // 1.0s after last spend
        this._staminaRegenPerSec = 1;        // +1 / second
        this._sprintDrainPerSec = 2;         // -2 / second
        this._isSprinting = false;

        // Launch UI and keep a reference
        this.scene.launch('UIScene', { playerData: { health: this.health, stamina: 100, ammo: 0 } });
        this.uiScene = this.scene.get('UIScene');

    
        // Player
        this.player = this.physics.add.sprite(400, 300, 'player')
            .setScale(0.5)
            .setDepth(900); // always on top
        this.player.setCollideWorldBounds(true);

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');
        // Bind SHIFT once (don’t create keys in update)
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        // Restart key (press SPACE after Game Over)
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Projectile pool (used for slingshot rocks)
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 20,
            runChildUpdate: true
        });

        // Melee hit circle pool (short-lived sensors)
        this.meleeHits = this.physics.add.group();

        // Input: use press/hold to charge slingshot, release to fire; tap for bat
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointerup', this.onPointerUp, this);

        // Groups
        this.zombies = this.physics.add.group();
        this.resources = this.physics.add.group();

        // Spawn resources using data config (reads ALL groups in WORLD_GEN.spawns.resources)
        this.spawnAllResources();

        // Debug hitbox graphics (can comment out drawing in update)
        this.debugGraphics = this.add.graphics().setDepth(1000);

        // Overlaps (no player/resources overlap; pickups are right-click with range)
        this.physics.add.overlap(this.player, this.zombies, this.handlePlayerZombieCollision, null, this);
        this.physics.add.overlap(this.bullets, this.zombies, this.handleBulletHit, null, this);
        this.physics.add.overlap(this.meleeHits, this.zombies, this.handleMeleeHit, null, this);

        // Colliders: resources with bullets (ALL resources stop bullets)
        this.physics.add.collider(this.bullets, this.resources, (bullet, res) => {
            if (bullet && bullet.destroy) bullet.destroy(); // stop/destroy bullet on impact
        }, null, this);

        // Colliders: zombies vs resources (only blocking ones cause separation)
        if (!this._zombieResourceCollider) {
            this._zombieResourceCollider = this.physics.add.collider(
                this.zombies,
                this.resources,
                null,
                (zombie, obj) => !!obj.getData('blocking'),
                this
            );
        }

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
    // World Gen — Generic resources (reads every group in WORLD_GEN.spawns.resources)
    // --------------------------
    spawnAllResources() {
        const all = WORLD_GEN?.spawns?.resources;
        if (!all) {
            console.warn('[spawnAllResources] Missing WORLD_GEN.spawns.resources config.');
            return;
        }

        // Spawn each resource group (e.g., "rocks", "berryBush", etc.)
        for (const [key, groupCfg] of Object.entries(all)) {
            this._spawnResourceGroup(key, groupCfg);
        }

        // Ensure player only collides with blocking resources (set once)
        if (!this._resourcesCollider) {
            this._resourcesCollider = this.physics.add.collider(
                this.player,
                this.resources,
                null,
                (player, obj) => !!obj.getData('blocking'),
                this
            );
        }
    }

    // Internal: spawn one resource group by config
    _spawnResourceGroup(groupKey, groupCfg) {
        const variants = Array.isArray(groupCfg?.variants) ? groupCfg.variants : null;
        if (!variants || variants.length === 0) {
            console.warn(`[spawn] Resource group "${groupKey}" missing variants.`);
            return;
        }

        const maxActive   = groupCfg.maxActive ?? Phaser.Math.Between(groupCfg.minCount ?? 8, groupCfg.maxCount ?? 12);
        const minSpacing  = groupCfg.minSpacing ?? 48;
        const respawnMin  = groupCfg.respawnDelayMs?.min ?? 5000;
        const respawnMax  = groupCfg.respawnDelayMs?.max ?? 7000;
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);

        const w = this.sys.game.config.width;
        const h = this.sys.game.config.height;
        const minX = 100, maxX = w - 100;
        const minY = 100, maxY = h - 100;

        const tooClose = (x, y) => {
            return this.resources.getChildren().some(c => {
                if (!c.active) return false;
                const dx = c.x - x;
                const dy = c.y - y;
                return (dx * dx + dy * dy) < (minSpacing * minSpacing);
            });
        };

        const pickVariantId = () => {
            let r = Math.random() * totalWeight;
            for (let v of variants) {
                r -= (v.weight || 0);
                if (r <= 0) return v.id;
            }
            return variants[0].id;
        };

        const spawnOne = () => {
            let x, y, tries = 30;
            do {
                x = Phaser.Math.Between(minX, maxX);
                y = Phaser.Math.Between(minY, maxY);
                tries--;
            } while (tries > 0 && tooClose(x, y));
            if (tries <= 0) return;

            const id  = pickVariantId();
            const def = ITEM_DB[id];
            if (!def) {
                console.warn('[spawn] No ITEM_DB entry for', id);
                return;
            }

            // Sprite: origin, scale, depth from item DB
            const originX = def.world?.origin?.x ?? 0.5;
            const originY = def.world?.origin?.y ?? 0.5;
            const scale   = def.world?.scale ?? 1;

            const obj = this.resources.create(x, y, def.world?.textureKey || id)
                .setOrigin(originX, originY)
                .setScale(scale)
                .setDepth(def.depth ?? 5);

            // Blocking vs non-blocking
            const blocking = !!def.blocking;
            obj.setData('blocking', blocking);

            // --- Apply optional body config (FRAME-SPACE anchor; scale-aware) ---
            const bodyCfg = def.world?.body;
            if (obj.body) {
                obj.body.setAllowGravity(false);

                if (bodyCfg) {
                    // Use Phaser's frame vs display sizes directly
                    const frameW = obj.width;          // unscaled texture/frame width
                    const frameH = obj.height;         // unscaled texture/frame height
                    const dispW  = obj.displayWidth;   // scaled on-screen width
                    const dispH  = obj.displayHeight;  // scaled on-screen height

                    // If useScale=true, compute body size in display pixels; else in frame pixels
                    const scaleX = obj.scaleX || 1;
                    const scaleY = obj.scaleY || 1;
                    const useScale = !!bodyCfg.useScale;

                    let bw, bh, br;
                    if (bodyCfg.kind === 'circle') {
                        br = useScale ? (bodyCfg.radius * scaleX) : bodyCfg.radius;
                        bw = bh = 2 * br; // bounds of the circle for anchoring
                    } else {
                        bw = useScale ? (bodyCfg.width  * scaleX) : bodyCfg.width;
                        bh = useScale ? (bodyCfg.height * scaleY) : bodyCfg.height;
                    }

                    // Choose the space to anchor within: display (scaled) or frame (unscaled)
                    const anchorSpaceW = useScale ? dispW : frameW;
                    const anchorSpaceH = useScale ? dispH : frameH;

                    // Base offset inside the texture/frame space (NOT world; origin does not apply here)
                    const anchor = bodyCfg.anchor || 'topLeft';
                    let baseX = 0, baseY = 0;
                    switch (anchor) {
                        case 'center':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = (anchorSpaceH - bh) * 0.5;
                            break;
                        case 'topCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = 0;
                            break;
                        case 'bottomCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'bottomLeft':
                            baseX = 0;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'topLeft':
                        default:
                            baseX = 0;
                            baseY = 0;
                            break;
                    }

                    // Fine-tune offsets (in same space as body size)
                    const addX = useScale ? ((bodyCfg.offsetX || 0) * scaleX) : (bodyCfg.offsetX || 0);
                    const addY = useScale ? ((bodyCfg.offsetY || 0) * scaleY) : (bodyCfg.offsetY || 0);
                    const ox = baseX + addX;
                    const oy = baseY + addY;

                    if (bodyCfg.kind === 'circle') {
                        // setCircle(radius, offsetX, offsetY) — offset is top-left of the circle bounds
                        obj.body.setCircle(br, ox, oy);
                    } else {
                        obj.body.setSize(bw, bh);
                        obj.body.setOffset(ox, oy);
                    }

                    obj.body.setImmovable(blocking);
                } else {
                    // No explicit body provided
                    if (blocking) {
                        obj.body.setImmovable(true);
                    } else {
                        // Enable a default, immovable body so bullets can collide with ALL resources
                        obj.body.setSize(obj.displayWidth, obj.displayHeight);
                        obj.body.setOffset(0, 0);
                        obj.body.setImmovable(true);
                    }
                }

            }

            // Right-click collectible (distance-gated)
            if (def.collectible) {
                obj.setInteractive();
                obj.on('pointerdown', (pointer) => {
                    if (!pointer.rightButtonDown()) return;

                    const pickupRange = 40; // px
                    const distSq = Phaser.Math.Distance.Squared(this.player.x, this.player.y, obj.x, obj.y);
                    if (distSq > pickupRange * pickupRange) return;

                    if (def.givesItem && this.uiScene?.inventory) {
                        this.uiScene.inventory.addItem(def.givesItem, def.giveAmount || 1);
                    }
                    // TODO: this.sound.play('sfx_pickup_small');

                    obj.destroy();
                    this.time.delayedCall(Phaser.Math.Between(respawnMin, respawnMax), () => {
                        if (this.resources.countActive(true) < maxActive) spawnOne();
                    });
                });
            }
        };

        // Initial batch
        for (let i = 0; i < maxActive; i++) spawnOne();
    }

    // ==========================
    // STAMINA HELPERS
    // ==========================
    spendStamina(amount) {
        if (!amount || amount <= 0) return 0;
        const spend = Math.min(this.stamina, amount);
        if (spend > 0) {
            this.stamina -= spend;
            this._lastStaminaSpendTime = this.time.now;
            if (this.uiScene?.updateStamina) this.uiScene.updateStamina(this.stamina);
        }
        return spend;
    }

    hasStamina(amount) {
        return (this.stamina >= (amount || 0.0001));
    }

    regenStamina(deltaMs) {
        // Regen allowed while walking — only blocked by sprinting, charging, or regen delay
        if (this._isSprinting || this.isCharging) return;

        if (this.time.now - this._lastStaminaSpendTime < this._staminaRegenDelayMs) return;

        const add = (this._staminaRegenPerSec * (deltaMs / 1000));
        if (add > 0) {
            this.stamina = Math.min(this.staminaMax, this.stamina + add);
            if (this.uiScene?.updateStamina) this.uiScene.updateStamina(this.stamina);
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
            if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
                this.scene.stop('UIScene');
                this.scene.restart();
            }
            return;
        }

        // Movement with normalization + sprinting (Shift)
        const walkSpeed = 100;
        const sprintMult = 1.75;

        const p = this.player.body.velocity;
        p.set(0);

        const up = (this.keys.W?.isDown) || (this.cursors.up?.isDown);
        const down = (this.keys.S?.isDown) || (this.cursors.down?.isDown);
        const left = (this.keys.A?.isDown) || (this.cursors.left?.isDown);
        const right = (this.keys.D?.isDown) || (this.cursors.right?.isDown);
        const shift = this.shiftKey?.isDown === true;

        // Determine sprint state (must have stamina > 0)
        this._isSprinting = shift && this.hasStamina(0.001);

        let speed = walkSpeed * (this._isSprinting ? sprintMult : 1);

        if (up) p.y = -speed;
        else if (down) p.y = speed;
        if (left) p.x = -speed;
        else if (right) p.x = speed;

        if (p.x !== 0 && p.y !== 0) {
            p.x *= Math.SQRT1_2; // 1/sqrt(2)
            p.y *= Math.SQRT1_2;
        }

        // Sprint drain (continuous)
        if (this._isSprinting && (p.x !== 0 || p.y !== 0)) {
            const drain = this._sprintDrainPerSec * (delta / 1000);
            this.spendStamina(drain);
            // If we hit 0 mid-frame, stop sprint next tick
            if (!this.hasStamina(0.001)) this._isSprinting = false;
        }

        // Stamina regen when eligible
        this.regenStamina(delta);

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

        // --- Charging UI update while holding LMB with slingshot equipped ---
        if (this.isCharging) {
            const held = Phaser.Math.Clamp(this.time.now - this.chargeStart, 0, this.chargeMaxMs);
            const percent = (this.chargeMaxMs > 0) ? (held / this.chargeMaxMs) : 1;
            this.uiScene?.events?.emit('weapon:charge', percent);
        }

        // --- Swing watchdog: if somehow stuck past end time, force cleanup ---
        if (this.isSwinging && this.time.now > (this.swingEndAt || 0)) {
            this.isSwinging = false;
            if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }
            if (this.meleeHits) this.meleeHits.clear(true, true);
        }

        
        /*==== RESOURCE HITBOXES =====
        this.debugGraphics.clear();
        this.debugGraphics.lineStyle(1, 0xff0000, 1);
        this.debugGraphics.fillStyle(0xff0000, 0.25);

        this.resources.getChildren().forEach(obj => {
            if (!obj.body) return;
            const body = obj.body;

            if (body.isCircle) {
                this.debugGraphics.fillCircle(
                    body.x + body.halfWidth,
                    body.y + body.halfHeight,
                    body.halfWidth
                );
                this.debugGraphics.strokeCircle(
                    body.x + body.halfWidth,
                    body.y + body.halfHeight,
                    body.halfWidth
                );
            } else {
                this.debugGraphics.fillRect(body.x, body.y, body.width, body.height);
                this.debugGraphics.strokeRect(body.x, body.y, body.width, body.height);
            }
        });
        //===== END DEBUG =====*/ 

    }

    updateNightOverlay() {
        const { transitionMs, nightOverlayAlpha } = WORLD_GEN.dayNight;
        const elapsed = this.getPhaseElapsed();
        const duration = this.getPhaseDuration();

        let target = 0;

        if (this.phase === 'day') {
            // Fade IN during the last transitionMs of day so it's fully dark at night start
            if (elapsed >= duration - transitionMs) {
                const t = (elapsed - (duration - transitionMs)) / Math.max(1, transitionMs);
                target = Phaser.Math.Linear(0, nightOverlayAlpha, Phaser.Math.Clamp(t, 0, 1));
            } else {
                target = 0;
            }
        } else {
            // phase === 'night'
            // Stay fully dark for most of night; fade OUT during the last transitionMs of night
            if (elapsed < duration - transitionMs) {
                target = nightOverlayAlpha;
            } else {
                const t = (elapsed - (duration - transitionMs)) / Math.max(1, transitionMs);
                target = Phaser.Math.Linear(nightOverlayAlpha, 0, Phaser.Math.Clamp(t, 0, 1));
            }
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

    _restartGame() {
        // Guard to avoid double triggers
        if (!this.isGameOver) return;
        this.scene.stop('UIScene');
        this.scene.restart();
    }


    // --------------------------
    // Input & Combat
    // --------------------------
    onPointerDown(pointer) {
        if (this.isGameOver || pointer.button !== 0) return; // left-only
        const equipped = this.uiScene?.inventory?.getEquipped?.();
        if (!equipped) return;

        const def = ITEM_DB[equipped.id];
        const cat = def?.weapon?.category;

        if (cat === 'melee' && equipped.id === 'crude_bat') {
            // Melee immediately on press (stamina handled inside swingBat)
            this.swingBat(pointer, def.weapon);
            return;
        }

        if (cat === 'ranged' && equipped.id === 'slingshot') {
            // Begin charge only if we have ammo
            const ammo = this.uiScene?.inventory?.totalOfActiveAmmo?.('slingshot');
            if (!ammo || ammo.total <= 0) return;

            this.isCharging = true;
            this.chargeStart = this.time.now;
            this.uiScene?.events?.emit('weapon:charge', 0);
            return;
        }
    }


    onPointerUp(pointer) {
        if (this.isGameOver || pointer.button !== 0) return; // left-only

        if (this.isCharging) {
            // Capture charge percent
            const heldMs = Phaser.Math.Clamp(this.time.now - this.chargeStart, 0, this.chargeMaxMs);
            this.lastCharge = (this.chargeMaxMs > 0) ? (heldMs / this.chargeMaxMs) : 1;

            // End charge -> notify UI
            this.isCharging = false;
            this.uiScene?.events?.emit('weapon:chargeEnd');

            // Spend stamina for the shot (scaled by charge). If insufficient, mark low and still shoot with penalties
            const eq = this.uiScene?.inventory?.getEquipped?.();
            const wpn = eq ? ITEM_DB[eq.id]?.weapon : null;
            let lowStamina = false;
            if (wpn?.stamina && eq?.id === 'slingshot') {
                const cost = Phaser.Math.Linear(wpn.stamina.baseCost || 0, wpn.stamina.maxCost || 0, Phaser.Math.Clamp(this.lastCharge, 0, 1));
                if (this.hasStamina(cost)) {
                    this.spendStamina(cost);
                } else {
                    lowStamina = true;
                    // spend whatever is left to 0 to trigger regen delay cleanly
                    this.spendStamina(this.stamina);
                }
            }

            // Fire using captured charge and whether we were low on stamina
            this.fireBullet(pointer, lowStamina);

            // Reset after use
            this.lastCharge = 0;
        }
    }


    // --------------------------
    // Combat (existing projectile & melee behavior)
    // --------------------------
    fireBullet(pointer, lowStamina = false) {
        if (this.isGameOver) return;
        if (pointer && pointer.button !== 0) return; // left-only

        const equipped = this.uiScene?.inventory?.getEquipped();
        if (!equipped) return;

        const def = ITEM_DB[equipped.id];
        const cat = def?.weapon?.category;

        if (cat === 'ranged' && equipped.id === 'slingshot') {
            const weapon = def.weapon || {};
            const { ammoId, total } = this.uiScene.inventory.totalOfActiveAmmo('slingshot');
            if (!ammoId || total <= 0) return;

            const angle = Phaser.Math.Angle.Between(
                this.player.x, this.player.y, pointer.worldX, pointer.worldY
            );

            // DB-driven tuning
            const speed = weapon.projectileSpeed ?? 400; // px/sec
            const minRange = weapon.minRange ?? 180;     // px
            const maxRange = weapon.maxRange ?? 420;     // px

            // Range scales with charge (0..1); safe clamp
            let charge = Phaser.Math.Clamp(this.lastCharge ?? 0, 0, 1);

            // Low-stamina penalty: clamp effective charge and (later) use min damage placeholder
            if (lowStamina && weapon.stamina?.poorChargeClamp != null) {
                charge = Math.max(charge, weapon.stamina.poorChargeClamp);
                // Note: damage system TBD; when implemented, apply weapon.stamina.minDamageOnLow
            }

            const actualRange = Phaser.Math.Linear(minRange, maxRange, charge);

            const bullet = this.bullets.get(this.player.x, this.player.y, ammoId);
            if (bullet) {
                this.uiScene.inventory.consumeAmmo(ammoId, 1);

                bullet.setActive(true).setVisible(true);
                bullet.body.allowGravity = false;
                bullet.setCollideWorldBounds(true);
                bullet.body.onWorldBounds = true;
                bullet.setSize(8, 8);
                bullet.setScale(0.4);

                const velocity = this.physics.velocityFromRotation(angle, speed);
                bullet.setVelocity(velocity.x, velocity.y);
                bullet.setRotation(angle);

                // Auto-destroy after traveling scaled range
                const lifetimeMs = Math.max(1, Math.floor((actualRange / Math.max(1, speed)) * 1000));
                this.time.delayedCall(lifetimeMs, () => {
                    if (bullet.active) bullet.destroy();
                });
            }
            return;
        }

        if (cat === 'melee' && equipped.id === 'crude_bat') {
            this.swingBat(pointer, def.weapon);
            return;
        }
    }



    swingBat(pointer, wpn) {
        // --- Gates: no reentry while swinging; respect cooldown ---
        const now = this.time.now;
        if (this.isSwinging) return;
        if (now < (this.cooldownUntil || 0)) return;

        // Per-weapon tuning
        let swingDurationMs = wpn?.swingDurationMs ?? 160;
        let swingCooldownMs = wpn?.swingCooldownMs ?? 280;
        const range  = wpn?.range  ?? 30;
        const radius = wpn?.radius ?? 22;

        // Stamina FIRST so penalties are known before commit
        const st = wpn?.stamina;
        let lowStamina = false;
        if (st?.cost != null) {
            if (this.hasStamina(st.cost)) {
                this.spendStamina(st.cost);
            } else {
                lowStamina = true;
                this.spendStamina(this.stamina); // drain to 0; triggers regen delay
            }
        }
        if (lowStamina && st) {
            swingDurationMs = Math.floor(swingDurationMs * (st.slowMultiplier || 3));
            swingCooldownMs = Math.floor(swingCooldownMs * (st.cooldownMultiplier || 2));
        }

        // Commit: set state and fixed cooldown end time now
        this.isSwinging = true;
        this.cooldownUntil = now + swingCooldownMs;
        this.swingEndAt = now + swingDurationMs + 300; // watchdog margin

        // Aim
        let aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        aim = Phaser.Math.Angle.Normalize(aim);

        // 90° arc centered on aim
        const halfArc = Phaser.Math.DegToRad(45);
        let startRot = Phaser.Math.Angle.Normalize(aim - halfArc);
        let endRot   = Phaser.Math.Angle.Normalize(aim + halfArc);
        if (endRot < startRot) endRot += Math.PI * 2;

        // Clean any leftovers (paranoid)
        if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }
        if (this.meleeHits) this.meleeHits.clear(true, true);

        // Bat sprite
        const baseOffset = Phaser.Math.DegToRad(45);
        this.batSprite = this.add.image(this.player.x, this.player.y, 'crude_bat')
            .setDepth(500)
            .setOrigin(0.1, 0.8)
            .setRotation(startRot);

        // Hit circle (pure sensor)
        const hit = this.add.circle(this.player.x, this.player.y, radius, 0xff0000, 0);
        this.physics.add.existing(hit);
        hit.body.setAllowGravity(false);
        hit.body.setImmovable(true);
        hit.body.moves = false;
        if (hit.body.setCircle) {
            hit.body.setCircle(radius);
            hit.body.setOffset(-radius, -radius);
        }
        this.meleeHits.add(hit);

        // Tweened swing
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
                if (hit?.body) hit.body.enable = false;
                if (hit && hit.destroy) hit.destroy();
                this.isSwinging = false;
            }
        });

        // Safety cleanup in case tween is interrupted
        this.time.delayedCall(swingDurationMs + 50, () => {
            if (hit?.body) hit.body.enable = false;
            if (hit && !hit.destroyed && hit.destroy) hit.destroy();
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

            // Cleanup input
            this.input.off('pointerdown', this.onPointerDown, this);
            this.input.off('pointerup', this.onPointerUp, this);

            this.gameOverText = this.add.text(
            this.cameras.main.centerX,
            this.cameras.main.centerY,
            'Game Over!\nPress SPACE (or R) to restart',
            {
                fontSize: '32px',
                fill: '#fff',
                align: 'center',
                padding: { x: 20, y: 20 }
            }
        )
        .setOrigin(0.5)
        .setScrollFactor(0)   // HUD-style: fixed to screen
        .setDepth(2000);
        this.gameOverText.setStroke('#720c0c', 3);

        // One-time restart listeners (space)
        this.input.keyboard.once('keydown-SPACE', this._restartGame, this);
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
