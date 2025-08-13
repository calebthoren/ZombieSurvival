// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js'; // NEW


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

        // Charge state (UI only; keeps your current shooting model)
        this.isCharging = false;
        this.chargeStart = 0;
        this.chargeMaxMs = 1500; // 1.5s max charge for the UI
        this.lastCharge = 0;     // 0..1 captured on release to scale range

        // Melee swing state
        this._isSwinging = false;       // true while a swing tween is running
        this._lastSwingEndTime = 0;     // when the last swing actually finished
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
        this.physics.add.collider(
            this.bullets,
            this.resources,
            (bullet, res) => {
                if (bullet && bullet.destroy) bullet.destroy();
            },
            (bullet, res) => !!res.getData('blocking'),
            this
        );

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
                    const types = this._getEligibleZombieTypesForPhase('day');
                    const id = this._pickZombieTypeWeighted(types);
                    this.spawnZombie(id);
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
                            const types = this._getEligibleZombieTypesForPhase('night');
                            const id = this._pickZombieTypeWeighted(types);
                            this.spawnZombie(id);
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

        // Movement with normalization + sprinting (Shift)
        const walkSpeed = 100;
        const sprintMult = 1.75;

        const p = this.player.body.velocity;
        p.set(0);

        const up = (this.keys.W?.isDown) || (this.cursors.up?.isDown);
        const down = (this.keys.S?.isDown) || (this.cursors.down?.isDown);
        const left = (this.keys.A?.isDown) || (this.cursors.left?.isDown);
        const right = (this.keys.D?.isDown) || (this.cursors.right?.isDown);
        const shift = this.input.keyboard.checkDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0);

        // Determine sprint state (must have stamina > 0)
        this._isSprinting = !!shift && this.hasStamina(0.001);

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
        
        // Keep the orbiting slingshot synced while charging
        if (this.isCharging && this.slingshotGhost) {
            this._updateSlingshotGhost();
        } else if (!this.isCharging && this.slingshotGhost) {
            this._destroySlingshotGhost();
        }

        // Zombie pursuit (and keep HP bars synced if present)
        this.zombies.getChildren().forEach(zombie => {
            this.physics.moveToObject(zombie, this.player, zombie.speed || 40);

            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);

            if (zombie.hpBg && zombie.hpFill) {
                this._updateOneZombieHpBar(zombie);
            }
        });

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

            // 👇 create and position the orbiting slingshot sprite
            this._createSlingshotGhost(equipped);
            this._updateSlingshotGhost();
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

            // 👇 hide the ghost immediately on release
            this._destroySlingshotGhost();

            // Spend stamina for the shot (scaled by charge). If insufficient, mark low and still shoot with penalties
            const eq = this.uiScene?.inventory?.getEquipped?.();
            const wpn = eq ? ITEM_DB[eq.id]?.weapon : null;
            let lowStamina = false;
            if (wpn?.stamina && eq?.id === 'slingshot') {
                const base = wpn.stamina.baseCost ?? 0;
                const max  = wpn.stamina.maxCost  ?? base;
                const cost = Phaser.Math.Linear(base, max, Phaser.Math.Clamp(this.lastCharge, 0, 1));
                if (this.hasStamina(cost)) {
                    this.spendStamina(cost);
                } else {
                    lowStamina = true;
                    this.spendStamina(this.stamina); // drain to 0; keeps regen timing consistent
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
                bullet.setDepth(600); // draw over resource sprites (resources use low depth like 5)

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
        // Per-weapon tuning
        let swingDurationMs = wpn?.swingDurationMs ?? 160;
        const swingCooldownMs = wpn?.swingCooldownMs ?? 80; // base cooldown ONLY (DB cooldownMultiplier ignored)
        const range = wpn?.range ?? 30;
        const radius = wpn?.radius ?? 22;

        // --- MID-SWING PROTECTION: don't allow a new swing during the tween
        if (this._isSwinging) return;

        // --- COOLDOWN: measured from END of the previous swing
        const now = this.time.now;
        if (now - (this._lastSwingEndTime || 0) < swingCooldownMs) return;

        // Stamina handling
        const st = wpn?.stamina;
        let lowStamina = false;
        if (st?.cost != null) {
            const cost = st.cost;
            if (this.hasStamina(cost)) {
                this.spendStamina(cost);
                // If paying cost leaves us effectively gassed, mark tired (affects swingDuration only)
                if (this.stamina <= 0 || this.stamina < cost) lowStamina = true;
            } else {
                lowStamina = true;
                this.spendStamina(this.stamina); // drain to 0 for consistent regen timing
            }
        }

        // Apply tired penalty to ANIMATION LENGTH ONLY (no cooldown scaling)
        if (lowStamina && st) {
            const slowMult = (st.slowMultiplier ?? st.slowMult ?? 3); // keep slow animation if configured
            swingDurationMs = Math.floor(swingDurationMs * slowMult);
            // NOTE: cooldownMultiplier intentionally ignored per Option C
        }

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

        const baseOffset = Phaser.Math.DegToRad(45); // art offset

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

        // Per‑swing registry: ensures each enemy is hit only once per swing
        hit._hitSet = new Set();

        // --- Lock swing state now
        this._isSwinging = true;

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
                // Swing finished → record end time for cooldown and unlock
                this._isSwinging = false;
                this._lastSwingEndTime = this.time.now;
                if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }
            }
        });

        // Destroy the hit sensor when the swing completes
        this.time.delayedCall(swingDurationMs, () => {
            if (hit && hit.destroy) hit.destroy();
        });
    }




    handleMeleeHit(hit, zombie) {
        if (!hit || !zombie || !zombie.active) return;

        // One-hit-per-swing: use the swing's registry Set on the hit circle
        const reg = hit._hitSet || (hit._hitSet = new Set());
        if (reg.has(zombie)) return;  // already hit this enemy during this swing
        reg.add(zombie);

        // Damage prefers sensor payload, falls back to DB
        const base = ITEM_DB?.crude_bat?.weapon?.damage ?? 10;
        const dmg = hit?.getData('damage') ?? base;

        this._applyZombieDamage(zombie, dmg);
    }

    handleBulletHit(bullet, zombie) {
        if (bullet && bullet.destroy) bullet.destroy();
        if (!zombie || !zombie.active) return;

        // Damage prefers bullet payload, falls back to DB
        const base = ITEM_DB?.slingshot?.weapon?.damage ?? 6;
        const dmg = bullet?.getData('damage') ?? base;

        this._applyZombieDamage(zombie, dmg);
    }

    // Create the slingshot ghost (above the player)
    _createSlingshotGhost(eq) {
        const def = eq ? ITEM_DB[eq.id] : null;
        const texKey = def?.icon?.textureKey || eq?.id || 'slingshot';

        if (this.slingshotGhost && this.slingshotGhost.texture && this.slingshotGhost.texture.key === texKey) {
            this.slingshotGhost.setVisible(true);
            return;
        }
        if (this.slingshotGhost) {
            this.slingshotGhost.destroy();
            this.slingshotGhost = null;
        }

        this.slingshotGhost = this.add.image(this.player.x, this.player.y, texKey)
            .setOrigin(0.5, 0.5)
            .setDepth((this.player?.depth ?? 900) + 1) // always above player
            .setScale(0.5)                             // shrink to 50%
            .setFlipY(false);                          // start upright
    }

    // Update position/rotation each frame while charging
    _updateSlingshotGhost() {
        if (!this.slingshotGhost || !this.isCharging) return;

        // Equipped slingshot weapon data for offset
        const eq = this.uiScene?.inventory?.getEquipped?.();
        const wpn = eq ? ITEM_DB[eq.id]?.weapon : null;

        // Support both: number (radial) or object {x,y}
        const mo = wpn?.muzzleOffset;
        const ptr = this.input.activePointer;
        const px = this.player.x;
        const py = this.player.y;
        const angle = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY); // radians

        let x = px, y = py;
        if (typeof mo === 'number') {
            // Radial distance
            x = px + Math.cos(angle) * mo;
            y = py + Math.sin(angle) * mo;
        } else if (mo && typeof mo.x === 'number' && typeof mo.y === 'number') {
            // Local-space offset (x = forward, y = perpendicular)
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const offX = mo.x * cos - mo.y * sin;
            const offY = mo.x * sin + mo.y * cos;
            x = px + offX;
            y = py + offY;
        } else {
            // Fallback radius
            const r = 20;
            x = px + Math.cos(angle) * r;
            y = py + Math.sin(angle) * r;
        }
        this.slingshotGhost.setPosition(x, y);

        // Face the aim; flip boundary shifted slightly left so it flips later on the right side
        const flipY = Math.cos(angle - Phaser.Math.DegToRad(-20)) < 0;

        this.slingshotGhost
            .setRotation(angle)   // always point at cursor
            .setFlipY(flipY)      // keep upright when crossing the boundary
            .setScale(0.5);       // enforce 50% scale
    }

    // Destroy and clear reference
    _destroySlingshotGhost() {
        if (this.slingshotGhost) {
            this.slingshotGhost.destroy();
            this.slingshotGhost = null;
        }
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

    
    // Pick a zombie type using spawnWeight from the DB (option 1)
    _pickZombieTypeFromDB() {
        const entries = Object.entries(ZOMBIES);
        if (!entries.length) return 'walker';
        let total = 0;
        for (const [key, def] of entries) {
            total += Math.max(0, def?.spawnWeight ?? 1);
        }
        if (total <= 0) return entries[0][0];
        let r = Math.random() * total;
        for (const [key, def] of entries) {
            r -= Math.max(0, def?.spawnWeight ?? 1);
            if (r <= 0) return key;
        }
        return entries[0][0];
    }

    // Spawn a zombie at a random screen edge
    spawnZombie(typeKey) {
        const type = typeKey || this._pickZombieTypeFromDB?.() || 'walker';
        const def = (window.ZOMBIES && ZOMBIES[type]) ? ZOMBIES[type] : (window.ZOMBIES?.walker || {});

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

        const tex = def.textureKey || 'zombie';
        const zombie = this.zombies.create(x, y, tex);
        zombie.setOrigin(0.5, 0.5);
        zombie.setScale(def.scale ?? 0.1);
        zombie.setDepth(def.depth ?? 2);
        zombie.lastHitTime = 0;
        zombie.zType = type;

        // Stats
        zombie.speed = def.speed ?? 40;
        zombie.maxHp = def.health ?? 40;
        zombie.hp = zombie.maxHp;
        zombie.attackDamage = def.damage ?? 10;
        zombie.aggroRange = def.aggroRange ?? 99999;
        zombie.attackCooldownMs = def.attackCooldownMs ?? 800;
        zombie.resist = Object.assign({ rangedMult: 1, meleeMult: 1, knockback: 0 }, def.resist || {});

        // HP bar placeholders (created on first damage only)
        zombie.hpBg = null;
        zombie.hpFill = null;
        zombie.hpBarW = def.hpBar?.width ?? 18;
        zombie.hpBarH = def.hpBar?.height ?? 3;
        zombie.hpYOffset = (typeof def.hpBar?.yOffset === 'number')
            ? def.hpBar.yOffset
            : (zombie.displayHeight * (def.hpBar?.yOffsetFactor ?? 0.6));

        return zombie;
    }

    // --- Zombie HP bar & damage helpers ---

    // Create the small red HP bar above the zombie (only created on first damage)
    _ensureZombieHpBar(zombie) {
        if (zombie.hpBg && zombie.hpFill) return;

        const barW = zombie.hpBarW ?? 18;
        const barH = zombie.hpBarH ?? 3;
        const yOff = zombie.hpYOffset ?? (zombie.displayHeight * 0.6);

        const bg = this.add.rectangle(zombie.x, zombie.y - yOff, barW, barH, 0x000000)
            .setOrigin(0.5, 1).setDepth(950).setAlpha(0.9).setVisible(true);
        const fill = this.add.rectangle(bg.x - barW / 2, bg.y, barW, barH, 0xff3333)
            .setOrigin(0, 1).setDepth(951).setAlpha(1).setVisible(true);

        zombie.hpBg = bg;
        zombie.hpFill = fill;
        zombie.hpBarW = barW;
        zombie.hpBarH = barH;
        zombie.hpYOffset = yOff;
    }

    // Keep a zombie's HP bar positioned; hide when full health
    _updateOneZombieHpBar(zombie) {
        if (!zombie.hpBg || !zombie.hpFill) return;

        const w = zombie.hpBarW ?? 18;
        const yOff = zombie.hpYOffset ?? (zombie.displayHeight * 0.6);

        const bx = zombie.x;
        const by = zombie.y - yOff;
        zombie.hpBg.setPosition(bx, by);
        zombie.hpFill.setPosition(bx - w / 2, by);

        const pct = Phaser.Math.Clamp((zombie.hp ?? 0) / (zombie.maxHp || 1), 0, 1);
        zombie.hpFill.width = Math.max(0, w * pct);

        const show = pct < 1; // only visible after they've taken damage
        zombie.hpBg.setVisible(show);
        zombie.hpFill.setVisible(show);
    }

    // Apply weapon damage and update/destroy as needed
    _applyZombieDamage(zombie, amount) {
        if (!zombie || !zombie.active) return;

        const dmg = Math.max(0, amount || 0);
        zombie.hp = Math.max(0, (zombie.hp ?? zombie.maxHp ?? 1) - dmg);

        if (!zombie.hpBg || !zombie.hpFill) this._ensureZombieHpBar(zombie);
        this._updateOneZombieHpBar(zombie);

        if (zombie.hp <= 0) this._destroyZombie(zombie);
    }

    // Cleanly destroy a zombie and its HP bar
    _destroyZombie(zombie) {
        if (zombie.hpBg) { zombie.hpBg.destroy(); zombie.hpBg = null; }
        if (zombie.hpFill) { zombie.hpFill.destroy(); zombie.hpFill = null; }
        if (zombie.destroy) zombie.destroy();
    }

    // Return an array of { id, weight } eligible for the given phase ('day' | 'night')
    _getEligibleZombieTypesForPhase(phase = 'day') {
        const list = [];
        for (const id of Object.keys(ZOMBIES)) {
            const def = ZOMBIES[id];
            if (!def) continue;
            const weight = def.spawnWeight ?? 1;
            if (weight <= 0) continue;
            if (phase === 'day') {
                if (def.canSpawnDay === true) {
                    list.push({ id, weight });
                }
            } else {
                // night: allow all types (even if canSpawnDay is false/missing)
                list.push({ id, weight });
            }
        }
        // Fallback: if nothing eligible (misconfig), allow 'walker'
        if (list.length === 0 && ZOMBIES.walker) {
            list.push({ id: 'walker', weight: ZOMBIES.walker.spawnWeight ?? 1 });
        }
        return list;
    }

    // Weighted random pick from [{id, weight}, ...]
    _pickZombieTypeWeighted(list) {
        if (!list || list.length === 0) return 'walker';
        let total = 0;
        for (const e of list) total += Math.max(0, e.weight || 0);
        if (total <= 0) return list[0].id;

        const r = Math.random() * total;
        let acc = 0;
        for (const e of list) {
            acc += Math.max(0, e.weight || 0);
            if (r <= acc) return e.id;
        }
        return list[list.length - 1].id;
    }

}
