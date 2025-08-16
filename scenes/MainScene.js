// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js';
import DevTools from '../systems/DevTools.js';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');

        // Day/Night state
        this.dayIndex = 1;              // Day 1
        this.phase = 'day';             // 'day' | 'night'
        this.phaseStartTime = 0;        // ms since scene start
        this.waveNumber = 0;            // increments each night
        this.spawnZombieTimer = null;   // day trickle timer
        this.nightWaveTimer = null;     // night waves timer

        // Charge state (generic to any charge-capable weapon)
        this.isCharging = false;
        this._chargingItemId = null;    // which item started the current charge; null when not charging
        this.chargeStart = 0;
        this.chargeMaxMs = 1500; // 1.5s charge UI cap
        this.lastCharge = 0;     // 0..1 captured on release

        // Melee swing state
        this._isSwinging = false;       // true while a swing tween runs
        this._lastSwingEndTime = 0;     // when the last swing finished
        this._nextSwingCooldownMs = 0;  // computed per swing

        //ranged cooldown state
        this._nextRangedReadyTime = 0;   // ms timestamp when ranged can fire again

        // Equipped-item ghost (generic)
        this.equippedItemGhost = null;
    }

    preload() {
        // player
        this.load.image('player', 'https://labs.phaser.io/assets/sprites/phaser-dude.png');
        // zombies
        this.load.image('zombie', 'assets/enemies/zombie.png');
        // weapons & ammo
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');
        // resources (examples)
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
        this._lastStaminaSpendTime = 0;      // for regen delay
        this._staminaRegenDelayMs = 1000;    // 1.0s after last spend
        this._staminaRegenPerSec = 1;        // +1 / sec
        this._sprintDrainPerSec = 2;         // -2 / sec
        this._isSprinting = false;

        // Launch UI and keep a reference
        this.scene.launch('UIScene', { playerData: { health: this.health, stamina: this.stamina, ammo: 0 } });
        this.uiScene = this.scene.get('UIScene');

        // Player
        this.player = this.physics.add.sprite(400, 300, 'player')
            .setScale(0.5)
            .setDepth(900)
            .setCollideWorldBounds(true);

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointerup', this.onPointerUp, this);

        // ESC → open Pause overlay
        this.input.keyboard.on('keydown-ESC', this._onEsc, this);

        // ─────────────────────────────────────────────────────────────
        // Auto‑pause when the game/tab loses focus (robust, no restarts)
        // ─────────────────────────────────────────────────────────────
        if (!this._autoPauseBound) {
            this._autoPauseBound = true;

            // Cache bound handlers so we can unbind cleanly on shutdown/destroy
            this._boundAutoPause = this._boundAutoPause || (() => this._autoPause());
            this._boundReset     = this._boundReset     || (() => this._resetInputAndStop());
            this._visHandler     = this._visHandler     || (() => { if (document.hidden) this._autoPause(); });
            this._winBlurHandler = this._winBlurHandler || (() => this._autoPause());

            // Phaser core blur
            this.game.events.on(Phaser.Core.Events.BLUR, this._boundAutoPause);
            // Browser-level fallbacks
            document.addEventListener('visibilitychange', this._visHandler, { passive: true });
            window.addEventListener('blur', this._winBlurHandler, { passive: true });
            // On Phaser pause, clear inputs to avoid drift when resuming
            this.game.events.on(Phaser.Core.Events.PAUSE, this._boundReset);

            // Teardown on shutdown/destroy to prevent duplicates after hot-reload/restart
            const _teardown = () => {
                this.input.keyboard.off('keydown-ESC', this._onEsc, this);
                this.game.events.off(Phaser.Core.Events.BLUR, this._boundAutoPause);
                this.game.events.off(Phaser.Core.Events.PAUSE, this._boundReset);
                document.removeEventListener('visibilitychange', this._visHandler, { passive: true });
                window.removeEventListener('blur', this._winBlurHandler, { passive: true });
                this._autoPauseBound = false;
            };
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, _teardown);
            this.events.once(Phaser.Scenes.Events.DESTROY,  _teardown);
        }

        // Groups
        this.zombies = this.physics.add.group();
        this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 32 });
        this.meleeHits = this.physics.add.group();
        this.resources = this.physics.add.group();

        // Spawn resources from WORLD_GEN (all resource groups)
        this.spawnAllResources();

        // Physics interactions
        this.physics.add.overlap(this.player, this.zombies, this.handlePlayerZombieCollision, null, this);
        this.physics.add.overlap(this.bullets, this.zombies, this.handleProjectileHit, null, this);
        this.physics.add.overlap(this.meleeHits, this.zombies, this.handleMeleeHit, null, this);

        // Bullets vs resources (all resources stop bullets)
        this.physics.add.collider(this.bullets, this.resources, (bullet) => {
            if (bullet && bullet.destroy) bullet.destroy();
        }, (bullet, res) => !!res.getData('blocking'), this);

        // Zombies vs resources (only blocking ones separate)
        this._zombieResourceCollider = this.physics.add.collider(
            this.zombies,
            this.resources,
            null,
            (zombie, obj) => !!obj.getData('blocking'),
            this
        );

        // Night overlay
        const w = this.sys.game.config.width;
        const h = this.sys.game.config.height;
        this.nightOverlay = this.add.rectangle(0, 0, w, h, 0x000000)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(999)
            .setAlpha(0);

        // --- DevTools integration ---
// Apply current hitbox flag right away (responds to future toggles too)
DevTools.applyHitboxFlag(this);

// Listen for dev spawn events
this.game.events.on('dev:spawn-zombie', ({ type, pos }) => this.spawnZombie(type, pos));
this.game.events.on('dev:drop-item', ({ id, pos }) => this.spawnWorldItem(id, pos));

// Inventory add hook used by DevTools.spawnItemsSmart()
this.game.events.on('inv:add', ({ id, qty, where }) => {
    const added = this.addItemToInventory(id, qty || 1, where || 'inventory') | 0;
    const prev = this.registry.get('inv:addedCount') || 0;
    this.registry.set('inv:addedCount', prev + added);
});

// Clean up listeners when scene shuts down/destroys
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    this.game.events.off('dev:spawn-zombie');
    this.game.events.off('dev:drop-item');
    this.game.events.off('inv:add');
});

// Start at day
this.startDay();

        // Update the UI clock periodically (cheap)
        this.time.addEvent({ delay: 250, loop: true, callback: () => this.updateTimeUi() });
    }

    // ==========================
    // Resource spawning (DB-driven)
    // ==========================
    spawnAllResources() {
        const all = WORLD_GEN?.spawns?.resources;
        if (!all) return;

        for (const [key, cfg] of Object.entries(all)) this._spawnResourceGroup(key, cfg);

        // Player collides only with blocking resources
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

    _spawnResourceGroup(groupKey, groupCfg) {
        const variants = Array.isArray(groupCfg?.variants) ? groupCfg.variants : null;
        if (!variants || variants.length === 0) return;

        const maxActive   = groupCfg.maxActive ?? Phaser.Math.Between(groupCfg.minCount ?? 8, groupCfg.maxCount ?? 12);
        const minSpacing  = groupCfg.minSpacing ?? 48;
        const respawnMin  = groupCfg.respawnDelayMs?.min ?? 5000;
        const respawnMax  = groupCfg.respawnDelayMs?.max ?? 7000;
        const totalWeight = variants.reduce((s, v) => s + (v.weight || 0), 0);

        const w = this.sys.game.config.width;
        const h = this.sys.game.config.height;
        const minX = 100, maxX = w - 100, minY = 100, maxY = h - 100;

        const tooClose = (x, y) => {
            return this.resources.getChildren().some(c => {
                if (!c.active) return false;
                const dx = c.x - x, dy = c.y - y;
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
            if (!def) return;

            const originX = def.world?.origin?.x ?? 0.5;
            const originY = def.world?.origin?.y ?? 0.5;
            const scale   = def.world?.scale ?? 1;

            const obj = this.resources.create(x, y, def.world?.textureKey || id)
                .setOrigin(originX, originY)
                .setScale(scale)
                .setDepth(def.depth ?? 5);

            const blocking = !!def.blocking;
            obj.setData('blocking', blocking);

            const bodyCfg = def.world?.body;
            if (obj.body) {
                obj.body.setAllowGravity(false);

                if (bodyCfg) {
                    const frameW = obj.width;
                    const frameH = obj.height;
                    const dispW  = obj.displayWidth;
                    const dispH  = obj.displayHeight;

                    const scaleX = obj.scaleX || 1;
                    const scaleY = obj.scaleY || 1;
                    const useScale = !!bodyCfg.useScale;

                    let bw, bh, br;
                    if (bodyCfg.kind === 'circle') {
                        br = useScale ? (bodyCfg.radius * scaleX) : bodyCfg.radius;
                        bw = bh = 2 * br;
                    } else {
                        bw = useScale ? (bodyCfg.width  * scaleX) : bodyCfg.width;
                        bh = useScale ? (bodyCfg.height * scaleY) : bodyCfg.height;
                    }

                    const anchorSpaceW = useScale ? dispW : frameW;
                    const anchorSpaceH = useScale ? dispH : frameH;

                    const anchor = bodyCfg.anchor || 'topLeft';
                    let baseX = 0, baseY = 0;
                    switch (anchor) {
                        case 'center':
                            baseX = (anchorSpaceW - bw) * 0.5; baseY = (anchorSpaceH - bh) * 0.5; break;
                        case 'topCenter':
                            baseX = (anchorSpaceW - bw) * 0.5; baseY = 0; break;
                        case 'bottomCenter':
                            baseX = (anchorSpaceW - bw) * 0.5; baseY = anchorSpaceH - bh; break;
                        case 'bottomLeft':
                            baseX = 0; baseY = anchorSpaceH - bh; break;
                        case 'topLeft':
                        default:
                            baseX = 0; baseY = 0; break;
                    }

                    const addX = useScale ? ((bodyCfg.offsetX || 0) * scaleX) : (bodyCfg.offsetX || 0);
                    const addY = useScale ? ((bodyCfg.offsetY || 0) * scaleY) : (bodyCfg.offsetY || 0);
                    const ox = baseX + addX;
                    const oy = baseY + addY;

                    if (bodyCfg.kind === 'circle') {
                        obj.body.setCircle(br, ox, oy);
                    } else {
                        obj.body.setSize(bw, bh);
                        obj.body.setOffset(ox, oy);
                    }
                    obj.body.setImmovable(blocking);
                } else {
                    if (blocking) obj.body.setImmovable(true);
                    else {
                        obj.body.setSize(obj.displayWidth, obj.displayHeight);
                        obj.body.setOffset(0, 0);
                        obj.body.setImmovable(true);
                    }
                }
            }

            if (def.collectible) {
                obj.setInteractive();
                obj.on('pointerdown', (pointer) => {
                    if (!pointer.rightButtonDown()) return;
                    const pickupRange = 40;
                    const d2 = Phaser.Math.Distance.Squared(this.player.x, this.player.y, obj.x, obj.y);
                    if (d2 > pickupRange * pickupRange) return;

                    if (def.givesItem && this.uiScene?.inventory) {
                        this.uiScene.inventory.addItem(def.givesItem, def.giveAmount || 1);
                    }
                    obj.destroy();
                    this.time.delayedCall(Phaser.Math.Between(respawnMin, respawnMax), () => {
                        if (this.resources.countActive(true) < maxActive) spawnOne();
                    });
                });
            }
        };

        for (let i = 0; i < maxActive; i++) spawnOne();
    }

    // ==========================
    // STAMINA HELPERS
    // ==========================
    spendStamina(amount) {
        if (!amount || amount <= 0) return 0;

        // DevTools: skip stamina drain entirely when "Don’t Use Stamina" is ON
        if (DevTools && typeof DevTools.shouldConsumeStamina === 'function' && !DevTools.shouldConsumeStamina()) {
            return 0;
        }

        const spend = Math.min(this.stamina, amount);
        if (spend > 0) {
            this.stamina -= spend;
            this._lastStaminaSpendTime = this.time.now;
            this.uiScene?.updateStamina?.(this.stamina);
        }
        return spend;
    }

    hasStamina(amount) {
        return (this.stamina >= (amount || 0.0001));
    }

    regenStamina(deltaMs) {
        if (this._isSprinting || this.isCharging) return;
        if (this.time.now - this._lastStaminaSpendTime < this._staminaRegenDelayMs) return;
        const add = (this._staminaRegenPerSec * (deltaMs / 1000));
        if (add > 0) {
            this.stamina = Math.min(this.staminaMax, this.stamina + add);
            this.uiScene?.updateStamina?.(this.stamina);
        }
    }

    // ==========================
    // Day/Night Cycle Management
    // ==========================
    startDay() {
        this.phase = 'day';
        this.phaseStartTime = this.time.now;
        if (this.nightWaveTimer) { this.nightWaveTimer.remove(false); this.nightWaveTimer = null; }
        this.waveNumber = 0;
        this.scheduleDaySpawn();
        this.updateTimeUi();
    }

    startNight() {
        this.phase = 'night';
        this.phaseStartTime = this.time.now;
        if (this.spawnZombieTimer) { this.spawnZombieTimer.remove(false); this.spawnZombieTimer = null; }
        this.waveNumber = 0;
        this.scheduleNightWave();
        this.updateTimeUi();
    }

    scheduleDaySpawn() {
        const dayCfg = WORLD_GEN.spawns.zombie.day;
        const delay = Phaser.Math.Between(dayCfg.minDelayMs, dayCfg.maxDelayMs);
        this.spawnZombieTimer = this.time.addEvent({
            delay,
            loop: false,
            callback: () => {
                if (this.phase !== 'day' || this.isGameOver) return;
                if (Math.random() < dayCfg.chance) {
                    const types = this._getEligibleZombieTypesForPhase('day');
                    const id = this._pickZombieTypeWeighted(types);
                    this.spawnZombie(id);
                }
                this.scheduleDaySpawn();
            }
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
                    if (this.phase === 'night' && !this.isGameOver) this.scheduleNightWave();
                });
            }
        });
    }

    getPhaseElapsed() { return this.time.now - this.phaseStartTime; }
    getPhaseDuration() { return this.phase === 'day' ? WORLD_GEN.dayNight.dayMs : WORLD_GEN.dayNight.nightMs; }

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
        const duration = this.getPhaseDuration(); // fixed: const, not 'aconst'
        const progress = Phaser.Math.Clamp(elapsed / duration, 0, 1);
        const phaseLabel = this.phase === 'day' ? 'Daytime' : 'Night';
        this.uiScene.updateTimeDisplay(this.dayIndex, phaseLabel, progress);
    }

    // ==========================
    // UPDATE LOOP
    // ==========================
    update(time, delta) {
        if (this.isGameOver) {
            if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE))) {
                this.scene.stop('UIScene');
                this.scene.restart();
            }
            return;
        }

        // Auto switch phases when duration elapses
        if (this.getPhaseElapsed() >= this.getPhaseDuration()) {
            if (this.phase === 'day') {
                this.startNight();
            } else {
                this.dayIndex++;
                this.startDay();
            }
        }

        // Toggle player collision off/on in Invisible mode
        const invisibleNow = DevTools.isPlayerInvisible();
        if (this._wasInvisible !== invisibleNow) {
            this._wasInvisible = invisibleNow;
            const b = this.player?.body;
            if (b) {
                if (invisibleNow) {
                    // ignore all collisions/overlaps against the player
                    b.checkCollision.none = true;
                } else {
                    // restore default 4-way checks
                    b.checkCollision.up = true;
                    b.checkCollision.down = true;
                    b.checkCollision.left = true;
                    b.checkCollision.right = true;
                    b.checkCollision.none = false;
                }
            }
        }

        // Movement + sprinting
        const walkSpeed = 100;
        const sprintMult = 1.75;
        const p = this.player.body.velocity;
        p.set(0);

        const up = (this.keys.W?.isDown) || (this.cursors.up?.isDown);
        const down = (this.keys.S?.isDown) || (this.cursors.down?.isDown);
        const left = (this.keys.A?.isDown) || (this.cursors.left?.isDown);
        const right = (this.keys.D?.isDown) || (this.cursors.right?.isDown);
        const shift = this.input.keyboard.checkDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0);

        this._isSprinting = !!shift && this.hasStamina(0.001);
        let speed = walkSpeed * (this._isSprinting ? sprintMult : 1);

        if (up) p.y = -speed; else if (down) p.y = speed;
        if (left) p.x = -speed; else if (right) p.x = speed;
        if (p.x !== 0 && p.y !== 0) { p.x *= Math.SQRT1_2; p.y *= Math.SQRT1_2; }

        // Sprint drain
        if (this._isSprinting && (p.x !== 0 || p.y !== 0)) {
            const drain = this._sprintDrainPerSec * (delta / 1000);
            this.spendStamina(drain);
            if (!this.hasStamina(0.001)) this._isSprinting = false;
        }

        // Stamina regen
        this.regenStamina(delta);

        // Zombie pursuit (simple: slide → then stun → then chase)
        this.zombies.getChildren().forEach(zombie => {
            const now = this.time.now;

            const inKnockback = (zombie.knockbackUntil || 0) > now;
            const stunned = (zombie.stunUntil || 0) > now && !inKnockback; // stun begins after slide

            if (stunned) {
                zombie.setVelocity(0, 0);
            } else if (!inKnockback) {
                if (DevTools.isPlayerInvisible()) {
                    zombie.setVelocity(0, 0);
                } else {
                    this.physics.moveToObject(zombie, this.player, zombie.speed || 40);
                }
            } // else: let existing velocity keep sliding

            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);

            if (zombie.hpBg && zombie.hpFill) this._updateOneZombieHpBar(zombie);
        });

        // Visuals
        this.updateNightOverlay();

        // Fast dev hitbox debug (~40 Hz for attacks/enemies/player)
        DevTools.tickHitboxDebug(this);

        // Live charge bar updates
        if (this.isCharging) {
            // If the equipped item changed while charging, cancel the charge immediately
            const eq = this.uiScene?.inventory?.getEquipped?.();
            if (!eq || eq.id !== this._chargingItemId) {
                this._cancelCharge();
            } else {
                this._tickChargeUi?.();
            }
        }

        // Equipped-item ghost maintenance while charging (guarded by isCharging)
        if (this.isCharging && this.equippedItemGhost) {
            this._updateEquippedItemGhost();
        } else if (!this.isCharging && this.equippedItemGhost) {
            this._destroyEquippedItemGhost();
        }
    }

    // ==========================
    // INPUT & COMBAT
    // ==========================
    onPointerDown(pointer) {
        if (this.isGameOver || pointer.button !== 0) return; // left-only
        if (this._isSwinging) return;

        const equipped = this.uiScene?.inventory?.getEquipped?.();
        if (!equipped) return;

        const def = ITEM_DB[equipped.id];
        const cat = def?.weapon?.category;

        // MELEE (bat)
        if (cat === 'melee' && equipped.id === 'crude_bat') {
            const wpn = def.weapon || {};
            const now = this.time.now;

            // Cooldown gate (from END of previous swing) — SKIP when No Cooldown
            const baseCd = wpn?.swingCooldownMs ?? 80;
            const effectiveCd = this._nextSwingCooldownMs ?? baseCd;
            const lastEnd = this._lastSwingEndTime || 0;
            if (!DevTools.flags.noCooldown && (now - lastEnd < effectiveCd)) return;

            if (wpn.canCharge === true) {
                // Start charge
                this.isCharging = true;
                this.chargeStart = now;
                this.chargeMaxMs = Math.max(1, wpn?.chargeMaxMs ?? 1500); // per-weapon time
                this._chargingItemId = equipped.id;
                this.uiScene?.events?.emit('weapon:charge', 0);

                // Ghost (optional; helper may not exist; pass ID not object)
                this._createEquippedItemGhost?.(equipped.id);
                this._updateEquippedItemGhost();
                return;
            } else {
                // Immediate swing
                this.swingBat(pointer, wpn, 0);
                return;
            }
        }

        // RANGED (slingshot)
        if (cat === 'ranged' && equipped.id === 'slingshot') {
            const wpn = def.weapon || {};
            const now = this.time.now;

            // Ranged cooldown gate — SKIP when No Cooldown
            const fireCd = wpn?.fireCooldownMs ?? 0;
            if (!DevTools.flags.noCooldown && fireCd > 0 && now < (this._nextRangedReadyTime || 0)) return;

            // Ammo check (generic, multi-ammo ready)
            const ammoInfo = this.uiScene?.inventory?.totalOfActiveAmmo?.(equipped.id);
            if (!ammoInfo || ammoInfo.total <= 0) return;

            // Start charge
            this.isCharging = true;
            this.chargeStart = now;
            this.chargeMaxMs = Math.max(1, wpn?.chargeMaxMs ?? 1500); // per-weapon time
            this._chargingItemId = equipped.id;
            this.uiScene?.events?.emit('weapon:charge', 0);

            // Ghost (optional; helper may not exist; pass ID not object)
            this._createEquippedItemGhost?.(equipped.id);
            this._updateEquippedItemGhost();
            return;
        }
    }

    onPointerUp(pointer) {
        if (this.isGameOver || pointer.button !== 0) return;
        if (!this.isCharging) return;

        // Only resolve an attack if we're still holding the SAME item that started the charge
        const eq = this.uiScene?.inventory?.getEquipped?.();
        if (!eq || eq.id !== this._chargingItemId) {
            this._cancelCharge();
            return;
        }

        // Capture raw charge percent (0..1) from time held
        const heldMs = Phaser.Math.Clamp(this.time.now - this.chargeStart, 0, this.chargeMaxMs);
        const charge = (this.chargeMaxMs > 0) ? (heldMs / this.chargeMaxMs) : 1;

        // End charge visuals before applying attack logic
        this.isCharging = false;
        this._chargingItemId = null;
        this.uiScene?.events?.emit('weapon:chargeEnd');
        this._destroyEquippedItemGhost();

        const def = ITEM_DB[eq.id];
        const cat = def?.weapon?.category;

        if (cat === 'ranged' && eq.id === 'slingshot') {
            this.fireRangedWeapon(pointer, def.weapon || {}, charge);
            return;
        }

        if (cat === 'melee' && eq.id === 'crude_bat') {
            this.swingBat(pointer, def.weapon || {}, charge);
            return;
        }
    }

    // ---- Melee (bat) ----
    swingBat(pointer, wpn, chargePercent = 0) {
        // Kill any stray charge UI
        if (this.isCharging) {
            this.isCharging = false;
            this._chargingItemId = null;
            this.uiScene?.events?.emit('weapon:chargeEnd');
            this._destroyEquippedItemGhost?.();
        }

        // Per-weapon tuning
        let swingDurationMs = wpn?.swingDurationMs ?? 160;
        const baseCooldownMs = wpn?.swingCooldownMs ?? 80;
        // Reach tuning: pad the cone a bit so it lines up with the bat *tip* visually.
        // You can tune per-weapon via ITEM_DB.weapon.meleeRangePad (default +10).
        const rangeBase = wpn?.range ?? 30;
        const rangePad  = wpn?.meleeRangePad ?? 10;
        const range     = Math.max(8, rangeBase + rangePad);

        const radius = wpn?.radius ?? 22;

        // Mid-swing protection
        if (this._isSwinging) return;

        // Cooldown from END of previous swing
        const effectiveCooldownMs = this._nextSwingCooldownMs ?? baseCooldownMs;
        const now = this.time.now;
        if (now - (this._lastSwingEndTime || 0) < effectiveCooldownMs) return;

        // -----------------------
        // Stamina spend + flags
        // -----------------------
        const st = wpn?.stamina;
        let lowStamina = false;
        if (st?.cost != null) {
            const cost = st.cost;
            if (this.hasStamina(cost)) {
                // You can afford THIS swing → not a low-stamina swing.
                this.spendStamina(cost);
            } else {
                // Can't afford → this swing is treated as low-stamina
                lowStamina = true;
                this.spendStamina(this.stamina); // drain remainder for regen timing
            }
        }

        // Tired penalty lengthens swing
        if (lowStamina && st) {
            const slowMult = (st.slowMultiplier ?? st.slowMult ?? 3);
            swingDurationMs = Math.floor(swingDurationMs * slowMult);
        }

        // Next cooldown (applies to the swing AFTER this ends)
        const cooldownMult = (lowStamina && st) ? (st.cooldownMultiplier ?? 6) : 1;
        this._nextSwingCooldownMs = Math.floor(baseCooldownMs * cooldownMult);

        // -----------------------
        // CHARGE SCALING
        // -----------------------
        const canCharge = (wpn?.canCharge === true);
        // raw charge from input (0..1)
        let charge = canCharge ? Phaser.Math.Clamp(chargePercent || 0, 0, 1) : 0;

        // Charge clamp when tired (based on affordability at release)
        if (lowStamina && st && typeof st.poorChargeClamp === 'number') {
            charge = Math.min(charge, st.poorChargeClamp);
        }

        const baseDmg = wpn?.damage ?? 10;
        const baseKb  = wpn?.knockback ?? 10;
        const maxDmg  = wpn?.maxChargeDamage ?? baseDmg;
        const maxKb   = wpn?.maxChargeKnockback ?? baseKb;

        // Damage & KB (use stamina cost as damage floor when tired, if present)
        let swingDamage    = canCharge ? Phaser.Math.Linear(baseDmg, maxDmg, charge) : baseDmg;
        let swingKnockback = canCharge ? Phaser.Math.Linear(baseKb,  maxKb,  charge) : baseKb;

        const dmgFloor = lowStamina ? (typeof st.baseCost === 'number' ? st.baseCost : (typeof st.cost === 'number' ? st.cost : null)) : null;
        if (dmgFloor != null) swingDamage = Math.max(dmgFloor, swingDamage);

        // Aim
        let aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        aim = Phaser.Math.Angle.Normalize(aim);

        // 90° arc centered on aim
        const halfArc = Phaser.Math.DegToRad(45);
        let startRot = Phaser.Math.Angle.Normalize(aim - halfArc);
        let endRot   = Phaser.Math.Angle.Normalize(aim + halfArc);
        if (endRot < startRot) endRot += Math.PI * 2;

        // Bat sprite
        if (this.batSprite) this.batSprite.destroy();
        const baseOffset = Phaser.Math.DegToRad(45);

        this.batSprite = this.add.image(this.player.x, this.player.y, 'crude_bat')
            .setDepth(500)
            .setOrigin(0.1, 0.8)
            .setRotation(startRot + baseOffset);

        // ─────────────────────────────────────────────────────────────
        // MELEE SWING — Rotating cone using angle-filtered circle
        //   • One circle collider centered on player (radius = range).
        //   • We filter overlaps by current aim ± coneHalf to form a cone.
        // ─────────────────────────────────────────────────────────────
        const cone = this.add.circle(this.player.x, this.player.y, range, 0x0000ff, 0);
        this.physics.add.existing(cone);
        cone.body.setAllowGravity(false);
        if (cone.body.setCircle) {
            cone.body.setCircle(range);
            cone.body.setOffset(-range, -range);
        }
        this.meleeHits.add(cone);

        // Per-swing payload & state (seed aim + timing so debug follows the real swing)
        cone._hitSet = new Set();
        cone.setData('damage', Math.max(0, Math.round(swingDamage)));
        cone.setData('knockback', Math.max(0, swingKnockback));
        cone.setData('originX', this.player.x);
        cone.setData('originY', this.player.y);

        // Seed aim immediately to prevent any fallback circle frame
        cone.setData('aimAngle', startRot);

        // Cone shape + reach
        cone.setData('coneHalfRad', halfArc);
        cone.setData('maxRange', range);

        // Timing so DevTools animates slices in sync with real swing speed
        cone.setData('swingStartMs', this.time.now | 0);
        cone.setData('swingDurationMs', swingDurationMs | 0);

        // Lock swing state
        this._isSwinging = true;

        // Tween progress along swing arc
        const swing = { t: 0 };
        const deltaRot = endRot - startRot;
        this.tweens.add({
            targets: swing,
            t: 1,
            duration: swingDurationMs,
            ease: 'Sine.InOut',
            onUpdate: () => {
                const centerRot = startRot + swing.t * deltaRot;

                // Update bat sprite visually
                this.batSprite
                    .setPosition(this.player.x, this.player.y)
                    .setRotation(centerRot + baseOffset);

                // Keep collider centered and store current aim angle
                cone.setPosition(this.player.x, this.player.y);
                cone.setData('aimAngle', centerRot);
            },
            onComplete: () => {
                this._isSwinging = false;
                this._lastSwingEndTime = this.time.now;
                if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }

                if (this._nextSwingCooldownMs > 0) {
                    this.uiScene?.events?.emit('weapon:cooldownStart', {
                        itemId: 'crude_bat',
                        durationMs: this._nextSwingCooldownMs
                    });
                }
            }
        });

        // Destroy the cone sensor after swing
        this.time.delayedCall(swingDurationMs, () => { if (cone && cone.destroy) cone.destroy(); });

    }

    handleMeleeHit(hit, zombie) {
        if (!hit || !zombie || !zombie.active) return;

        // One-hit-per-enemy-per-swing
        const reg = hit._hitSet || (hit._hitSet = new Set());
        if (reg.has(zombie)) return;

        // Cone filter — angle & distance from swing origin
        const ox = hit.getData('originX') ?? this.player.x;
        const oy = hit.getData('originY') ?? this.player.y;
        const aim = hit.getData('aimAngle') ?? Phaser.Math.Angle.Between(ox, oy, zombie.x, zombie.y);
        const coneHalf = hit.getData('coneHalfRad') ?? Phaser.Math.DegToRad(45);
        const maxRange = hit.getData('maxRange') ?? 30;

        const dx = zombie.x - ox, dy = zombie.y - oy;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > maxRange * maxRange) return;

        const angTo = Math.atan2(dy, dx);
        const delta = Phaser.Math.Angle.Wrap(angTo - aim);
        if (Math.abs(delta) > coneHalf) return;

        // Mark as hit (dedupe)
        reg.add(zombie);

        // Damage/KB payload
        const baseD = hit.getData('damage');
        const baseKb = hit.getData('knockback');

        // Apply melee resistance multiplier
        const meleeMult = Math.max(0, zombie?.resist?.meleeMult ?? 1);
        const dmg = Math.max(0, Math.round((baseD ?? (ITEM_DB?.crude_bat?.weapon?.damage ?? 10)) * meleeMult));
        const kb  = Math.max(0, baseKb ?? (ITEM_DB?.crude_bat?.weapon?.knockback ?? 10));

        this._applyZombieDamage(zombie, dmg);
        this._applyKnockbackAndMaybeStun(zombie, ox, oy, kb);
    }

    handleProjectileHit(bullet, zombie) {
        if (!bullet || !zombie || !zombie.active) return;

        // ✅ Read all payload BEFORE destroying the bullet
        const payloadDmg = (typeof bullet.getData === 'function') ? bullet.getData('damage') : undefined;
        const payloadKb  = (typeof bullet.getData === 'function') ? bullet.getData('knockback') : undefined;

        // Fallbacks from DB only if payload is missing
        let dmg = (typeof payloadDmg === 'number') ? payloadDmg : (ITEM_DB?.slingshot?.weapon?.damage ?? 5);
        let kb  = (typeof payloadKb  === 'number') ? payloadKb  : (ITEM_DB?.slingshot?.weapon?.knockback ?? 5);

        // Impact source for knockback should be the bullet's last position
        const sx = (typeof bullet.x === 'number') ? bullet.x : this.player.x;
        const sy = (typeof bullet.y === 'number') ? bullet.y : this.player.y;

        // Now it's safe to destroy the projectile
        if (bullet && bullet.destroy) bullet.destroy();

        // Apply ranged resistance AFTER per‑shot payload is resolved
        const rangedMult = Math.max(0, zombie?.resist?.rangedMult ?? 1);
        dmg = Math.max(0, Math.round(dmg * rangedMult));

        this._applyZombieDamage(zombie, dmg);
        this._applyKnockbackAndMaybeStun(zombie, sx, sy, kb);
    }

    // ---- Ranged (slingshot) ----
    fireRangedWeapon(pointer, wpn, chargePercent) {
        const equipped = this.uiScene?.inventory?.getEquipped?.();
        const ammoChoice = this.uiScene?.inventory?.firstViableAmmoFor?.(equipped?.id)
            || (() => {
                const info = this.uiScene?.inventory?.totalOfActiveAmmo?.(equipped?.id);
                return info ? { ammoId: info.ammoId || 'slingshot_rock', total: info.total } : null;
            })();
        if (!ammoChoice || ammoChoice.total <= 0) return;

        const rawCharge = Phaser.Math.Clamp(chargePercent || 0, 0, 1);

        // Spend stamina according to model
        const st = wpn?.stamina || {};
        let lowStamina = false;
        let cost = 0;
        if (typeof st.baseCost === 'number' && typeof st.maxCost === 'number') {
            cost = Phaser.Math.Linear(st.baseCost, st.maxCost, rawCharge);
        } else if (typeof st.cost === 'number') {
            cost = st.cost;
        }
        if (cost > 0) {
            if (this.hasStamina(cost)) {
                this.spendStamina(cost);
            } else {
                lowStamina = true;
                this.spendStamina(this.stamina);
            }
        }

        // Effective max cap when tired
        const maxCap = (lowStamina && typeof st.poorChargeClamp === 'number') ? Math.max(0.0001, st.poorChargeClamp) : 1;
        const effectiveCharge = Math.min(rawCharge, maxCap);

        // Show normalized UI percent so the bar reaches "full" at the cap
        const uiPercent = Phaser.Math.Clamp(effectiveCharge / maxCap, 0, 1);
        this.uiScene?.events?.emit('weapon:charge', uiPercent);

        // Damage / Knockback scaling
        const canCharge = (wpn?.canCharge === true);
        const baseDmg = wpn?.damage ?? 6;
        const maxDmg  = wpn?.maxChargeDamage ?? baseDmg;
        let shotDmg   = canCharge ? Phaser.Math.Linear(baseDmg, maxDmg, effectiveCharge) : baseDmg;

        const baseKb = wpn?.knockback ?? 6;
        const maxKb  = wpn?.maxChargeKnockback ?? baseKb;
        const shotKb = canCharge ? Phaser.Math.Linear(baseKb, maxKb, effectiveCharge) : baseKb;

        // When tired, use stamina base cost/cost as a damage floor (replacing minDamageOnLow)
        const dmgFloor = lowStamina ? ((typeof st.baseCost === 'number') ? st.baseCost : (typeof st.cost === 'number' ? st.cost : null)) : null;
        if (dmgFloor != null) shotDmg = Math.max(dmgFloor, shotDmg);

        // Travel distance from charge (unchanged); speed may be reduced if tired
        let speed    = wpn?.projectileSpeed ?? 400;
        const minRange = wpn?.minRange ?? 180;
        const maxRange = wpn?.maxRange ?? 420;
        const travel   = Phaser.Math.Linear(minRange, maxRange, effectiveCharge);

        // tired shots fly slower
        if (lowStamina && typeof st.lowSpeedMultiplier === 'number') {
            speed = Math.max(40, Math.floor(speed * st.lowSpeedMultiplier));
        }

        // Consume ammo now that we know we will fire
        if (DevTools.shouldConsumeAmmo()) { this.uiScene?.inventory?.consumeAmmo?.(ammoChoice.ammoId, 1); }

        // Spawn / reuse projectile
        const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.worldX, pointer.worldY);
        const bullet = this.bullets.get(this.player.x, this.player.y, ammoChoice.ammoId)
            || this.physics.add.image(this.player.x, this.player.y, ammoChoice.ammoId);
        if (!bullet) return;

        if (!bullet.body) this.physics.add.existing(bullet);
        bullet.setActive(true).setVisible(true);
        bullet.body.setAllowGravity(false);
        bullet.setDepth(600);
        bullet.setScale(0.4);
        bullet.setSize(8, 8);

        // Per‑shot payload (read in handleProjectileHit)
        bullet.setData('damage', Math.max(0, Math.round(shotDmg)));
        bullet.setData('knockback', Math.max(0, shotKb));

        // Velocity & lifetime
        const v = this.physics.velocityFromRotation(angle, speed);
        bullet.setVelocity(v.x, v.y);
        bullet.setRotation(angle);

        const lifetimeMs = Math.max(1, Math.floor((travel / Math.max(1, speed)) * 1000));
        this.time.delayedCall(lifetimeMs, () => { if (bullet.active && bullet.destroy) bullet.destroy(); });

        // Collide with scenery/resources so shots don’t pass through
        this.physics.add.collider(bullet, this.resources, (bb) => { if (bb && bb.destroy) bb.destroy(); }, null, this);

        // Ranged cooldown (skip when No Cooldown)
        const baseCd = wpn?.fireCooldownMs ?? 0;
        const cdMs = lowStamina && typeof st.lowCooldownMultiplier === 'number'
            ? Math.floor(baseCd * st.lowCooldownMultiplier)
            : baseCd;

        if (!DevTools.flags.noCooldown && cdMs > 0) {
            this._nextRangedReadyTime = this.time.now + cdMs;
            this.uiScene?.events?.emit('weapon:cooldownStart', {
                itemId: equipped.id,
                durationMs: cdMs
            });
        }

        // Close out the bar
        this.uiScene?.events?.emit('weapon:chargeEnd');
    }

    // -----------------------------------------------------------------------------
    // Equipped Item Ghost
    // -----------------------------------------------------------------------------
    _createEquippedItemGhost(eqOrId) {
        // Normalize input to an object with id
        const eq = (typeof eqOrId === 'string') ? { id: eqOrId } : eqOrId;
        const def = eq && eq.id ? (ITEM_DB?.[eq.id] || null) : null;

        // Texture & visual from WORLD config (fallback to id)
        const texKey = def?.world?.textureKey || eq?.id || 'slingshot';
        const originX = def?.world?.origin?.x ?? 0.5;
        const originY = def?.world?.origin?.y ?? 0.5;
        const scale   = def?.world?.scale ?? 0.5;

        // Reuse image if same texture; otherwise (re)create
        if (this.equippedItemGhost && this.equippedItemGhost.texture && this.equippedItemGhost.texture.key === texKey) {
            this.equippedItemGhost.setVisible(true);
        } else {
            if (this.equippedItemGhost) {
                this.equippedItemGhost.destroy();
                this.equippedItemGhost = null;
            }
            this.equippedItemGhost = this.add.image(this.player.x, this.player.y, texKey)
                .setOrigin(originX, originY)
                .setDepth((this.player?.depth ?? 900) + 1)
                .setFlipY(false)
                .setAlpha(1); // not transparent
        }

        this.equippedItemGhost
            .setScale(scale)
            .setVisible(true);

        this._equippedGhostItemId = eq?.id || null;

        // Immediate placement so it doesn’t pop
        this._updateEquippedItemGhost();
    }

    _updateEquippedItemGhost() {
        if (!this.equippedItemGhost || !this.isCharging) return;

        const eq = this.uiScene?.inventory?.getEquipped?.();
        if (!eq) return;

        const def = ITEM_DB?.[eq.id];
        const wpn = def?.weapon || {};
        const isMelee  = (wpn.category === 'melee');
        const isRanged = (wpn.category === 'ranged');

        const ptr = this.input.activePointer;
        const px = this.player.x, py = this.player.y;

        // Aim angle from player to mouse
        const aim = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY);

        // ─────────────────────────────────────────────────────────────
        // RANGED (slingshot): orbit + rotate to mouse, flip across X-axis
        // ─────────────────────────────────────────────────────────────
        if (isRanged) {
            let radius;
            const mo = wpn.muzzleOffset;
            if (typeof mo === 'number') {
                radius = Math.max(1, mo);
            } else if (mo && typeof mo.x === 'number' && typeof mo.y === 'number') {
                radius = Math.max(1, Math.hypot(mo.x, mo.y));
            } else if (typeof wpn.ghostRadius === 'number') {
                radius = Math.max(1, wpn.ghostRadius);
            } else {
                radius = 18;
            }

            const gx = px + Math.cos(aim) * radius;
            const gy = py + Math.sin(aim) * radius;

            const flipY = (gx < px); // flip across X-axis when ghost is left of player
            const overlapNudge = -4;

            this.equippedItemGhost
                .setDepth((this.player?.depth ?? 900) + 1)
                .setPosition(gx, gy + overlapNudge)
                .setRotation(aim)
                .setFlipX(false)
                .setFlipY(flipY)
                .setAlpha(1);
            return;
        }

        // ─────────────────────────────────────────────────────────────
        // MELEE (bat): place at the *start of the swing arc* using the SAME values as swingBat()
        // ─────────────────────────────────────────────────────────────
        if (isMelee) {
            // Cone math: swingBat() uses a 90° arc centered on aim (half = 45°)
            const coneHalf = Phaser.Math.DegToRad((wpn?.coneAngleDeg ?? 90) / 2); // default 45°
            const startRot = Phaser.Math.Angle.Normalize(aim - coneHalf);

            // Visual offset/origin: match swingBat() bat sprite
            const baseOffset = Phaser.Math.DegToRad(45); // identical to swingBat()
            const rotWithOffset = startRot + baseOffset;

            // Match swing reach at the very start of the swing (t = 0)
            const range = wpn?.range ?? 30;

            // Ensure the ghost image uses the same anchor as the bat sprite so they overlap perfectly
            this.equippedItemGhost
                .setOrigin(0.1, 0.8) // same as swingBat() batSprite
                .setDepth((this.player?.depth ?? 900) + 1)
                .setPosition(this.player.x, this.player.y)
                .setRotation(rotWithOffset)
                .setFlipX(false)
                .setFlipY(false)
                .setAlpha(1);

            // Optional: if you want the ghost to hint the strike point too, uncomment:
            // const hx = this.player.x + Math.cos(startRot) * range;
            // const hy = this.player.y + Math.sin(startRot) * range;
            // this.equippedItemGhost.setPosition(this.player.x, this.player.y).setRotation(rotWithOffset);
            // (We keep the image at the player like the actual bat; the hit sensor will travel to hx/hy.)
            return;
        }

        // Fallback
        this.equippedItemGhost
            .setDepth((this.player?.depth ?? 900) + 1)
            .setPosition(px, py)
            .setRotation(0)
            .setFlipX(false)
            .setFlipY(false)
            .setAlpha(1);
    }

    _destroyEquippedItemGhost() {
        // Hide instead of destroy to avoid churn (pool-friendly)
        if (this.equippedItemGhost) {
            this.equippedItemGhost.setVisible(false);
        }
    }

    // Predictive live charge UI (bar fills only to actual max; still flashes at cap)
    _tickChargeUi() {
        const eq = this.uiScene?.inventory?.getEquipped?.();
        if (!eq) return;

        const wpnDef = ITEM_DB?.[eq.id]?.weapon;
        if (!wpnDef || wpnDef.canCharge !== true) return;

        // Raw 0..1 charge based on time held
        const heldMs = Phaser.Math.Clamp(this.time.now - this.chargeStart, 0, this.chargeMaxMs);
        const raw = (this.chargeMaxMs > 0) ? (heldMs / this.chargeMaxMs) : 1;

        // Predict low-stamina condition without spending stamina
        const st = wpnDef.stamina || {};
        let predictLowStamina = false;
        let estCost = 0;
        if (typeof st.baseCost === 'number' && typeof st.maxCost === 'number') {
            estCost = Phaser.Math.Linear(st.baseCost, st.maxCost, raw);
        } else if (typeof st.cost === 'number') {
            estCost = st.cost;
        }
        if (estCost > 0 && this.stamina < estCost) predictLowStamina = true;

        // Max cap when tired; actual effective charge is clamped
        const maxCap = (predictLowStamina && typeof st.poorChargeClamp === 'number')
            ? Math.max(0.0001, st.poorChargeClamp)
            : 1;

        const effective = Math.min(raw, maxCap); // clamped effective charge

        // Emit percent directly as the bar fill amount (no normalization)
        const uiPercent = Phaser.Math.Clamp(effective, 0, 1);

        // Emit only when visibly different
        if (Math.abs((uiPercent || 0) - (this.lastCharge || 0)) >= 0.01) {
            this.lastCharge = uiPercent;
            this.uiScene?.events?.emit('weapon:charge', uiPercent);
        }
    }

    // Cancel any in-progress charge (used when swapping items or otherwise aborting)
    _cancelCharge() {
        if (!this.isCharging) return;
        this.isCharging = false;
        this._chargingItemId = null;
        this.lastCharge = 0;
        this.uiScene?.events?.emit('weapon:chargeEnd');
        this._destroyEquippedItemGhost?.();
    }

    // ==========================
    // Zombie helpers
    // ==========================
    spawnZombie(typeKey = 'walker', pos = null) {
        const def = ZOMBIES[typeKey] || ZOMBIES.walker || {};
        const tex = def.texture || 'zombie';

        // Pick spawn position (use provided pos or random screen edge)
        let x, y;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            x = pos.x; y = pos.y;
        } else {
            const cam = this.cameras.main;
            const x0 = cam.worldView.x,            y0 = cam.worldView.y;
            const x1 = x0 + cam.worldView.width,   y1 = y0 + cam.worldView.height;
            const edge = (Math.random() * 4) | 0;
            if (edge === 0) { x = Phaser.Math.Between(x0, x1); y = y0 - 8; }
            else if (edge === 1) { x = x1 + 8; y = Phaser.Math.Between(y0, y1); }
            else if (edge === 2) { x = Phaser.Math.Between(x0, x1); y = y1 + 8; }
            else { x = x0 - 8; y = Phaser.Math.Between(y0, y1); }
        }

        const zombie = this.zombies.create(x, y, tex);
        if (!zombie.body) this.physics.add.existing(zombie);
        zombie.body.setAllowGravity(false);
        zombie.setOrigin(0.5, 0.5);
        zombie.setScale(def.scale ?? 0.1);
        zombie.setDepth(def.depth ?? 2);
        zombie.lastHitTime = 0;
        zombie.zType = typeKey;

        // Stats
        zombie.speed = def.speed ?? 40;
        zombie.maxHp = def.health ?? 25;
        zombie.hp = zombie.maxHp;
        zombie.attackDamage = def.damage ?? 10;
        zombie.aggroRange = def.aggroRange ?? 99999;
        zombie.attackCooldownMs = def.attackCooldownMs ?? 800;
        zombie.resist = Object.assign({ rangedMult: 1, meleeMult: 1, knockback: 0 }, def.resist || {});
        zombie.staggerThreshold = (typeof def.staggerThreshold === 'number') ? def.staggerThreshold : 8;
        zombie.stunDurationMs = (typeof def.stunDurationMs === 'number') ? def.stunDurationMs : 300;

        // Lazy HP bar; initialize references cleanly
        zombie.hpBg = null;
        zombie.hpFill = null;
        zombie.hpBarW = def.hpBarW ?? zombie.hpBarW;
        zombie.hpBarH = def.hpBarH ?? zombie.hpBarH;
        zombie.hpYOffset = def.hpYOffset ?? zombie.hpYOffset;

        return zombie;
    }


    _ensureZombieHpBar(zombie) {
        if (zombie.hpBg && zombie.hpFill) return;

        const barW = zombie.hpBarW ?? 18;
        const barH = zombie.hpBarH ?? 3;
        const yOff = zombie.hpYOffset ?? (zombie.displayHeight * 0.6);

        const bx = zombie.x;
        const by = zombie.y - yOff;

        // Create fully hidden; we’ll show only when hp < maxHp
        const bg = this.add.rectangle(bx, by, barW, barH, 0x000000, 1)
            .setOrigin(0.5, 1).setDepth(950).setAlpha(0).setVisible(false);
        const fill = this.add.rectangle(bx - barW / 2, by, barW, barH, 0xff3333, 1)
            .setOrigin(0, 1).setDepth(951).setAlpha(0).setVisible(false);

        zombie.hpBg = bg;
        zombie.hpFill = fill;
        zombie.hpBarW = barW;
        zombie.hpBarH = barH;
        zombie.hpYOffset = yOff;
    }

    _updateOneZombieHpBar(zombie) {
        const maxHp = zombie.maxHp || 1;
        const hp = Math.max(0, zombie.hp ?? maxHp);
        const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
        const show = pct < 1; // show only after first damage

        if (!show) {
            // If bars exist, keep them hidden and alpha 0 (no draw, no “print”)
            if (zombie.hpBg) zombie.hpBg.setVisible(false).setAlpha(0);
            if (zombie.hpFill) zombie.hpFill.setVisible(false).setAlpha(0);
            return;
        }

        // Lazily create when we actually need them
        if (!zombie.hpBg || !zombie.hpFill) this._ensureZombieHpBar(zombie);

        if (!zombie.hpBg || !zombie.hpFill) return;

        const w = zombie.hpBarW ?? 18;
        const yOff = zombie.hpYOffset ?? (zombie.displayHeight * 0.6);

        const bx = zombie.x;
        const by = zombie.y - yOff;

        zombie.hpBg.setPosition(bx, by).setVisible(true).setAlpha(0.9);
        zombie.hpFill
            .setPosition(bx - w / 2, by)
            .setVisible(true)
            .setAlpha(1);
        zombie.hpFill.width = Math.max(0, w * pct);
    }

    _applyKnockbackAndMaybeStun(zombie, srcX, srcY, baseKb) {
        if (!zombie || !zombie.active) return;

        // Knockback amount reduced by resistance (movement), but
        // stun check uses the raw hit strength (baseKb).
        const resist = Math.max(0, Math.min(1, zombie?.resist?.knockback ?? 0));
        const effKb = Math.max(0, (baseKb || 0) * (1 - resist));

        // Direction away from the hit source
        const dx = zombie.x - srcX, dy = zombie.y - srcY;
        const len = Math.max(1e-3, Math.hypot(dx, dy));

        // Instant pushback impulse (they WILL slide)
        const impulse = effKb * 18;
        const vx = (dx / len) * impulse;
        const vy = (dy / len) * impulse;
        zombie.setVelocity(vx, vy);

        const now = this.time.now;

        // Slide window (AI won't steer during this)
        const slideMs = 100 + Math.floor(effKb * 8); // small scale with hit strength
        zombie.knockbackUntil = now + slideMs;

        // If strong enough, apply stun that starts AFTER sliding
        const thresh = zombie.staggerThreshold || 0;
        if ((baseKb || 0) >= thresh) {
            const stunMs = zombie.stunDurationMs ?? 180;
            zombie.stunUntil = zombie.knockbackUntil + stunMs; // ← begins after slide
        } else {
            zombie.stunUntil = 0;
        }
    }

    _applyZombieDamage(zombie, amount) {
        if (!zombie || !zombie.active) return;

        const dmg = Math.max(0, amount || 0);
        zombie.hp = Math.max(0, (zombie.hp ?? zombie.maxHp ?? 1) - dmg);

        if (!zombie.hpBg || !zombie.hpFill) this._ensureZombieHpBar(zombie);
        this._updateOneZombieHpBar(zombie);

        if (zombie.hp <= 0) this._destroyZombie(zombie);
    }

    _destroyZombie(zombie) {
        // Loot scaffolding (no drops now if tables are empty)
        this._maybeDropLoot(zombie);

        if (zombie.hpBg) { zombie.hpBg.destroy(); zombie.hpBg = null; }
        if (zombie.hpFill) { zombie.hpFill.destroy(); zombie.hpFill = null; }
        if (zombie.destroy) zombie.destroy();
    }

    _maybeDropLoot(zombie) {
        // Reads ZOMBIES[zombie.zType].loot.table if present. Empty tables ⇒ no drops.
        try {
            const def = ZOMBIES[zombie.zType];
            const table = def?.loot?.table;
            if (!table || !Array.isArray(table) || table.length === 0) return;

            // Weighted pick
            let total = 0;
            for (const e of table) total += (e.weight || 0);
            if (total <= 0) return;
            let r = Math.random() * total, choice = null;
            for (const e of table) { r -= (e.weight || 0); if (r <= 0) { choice = e; break; } }
            if (!choice || !choice.itemId) return;

            // Optional drop chance
            if (choice.chance != null && Math.random() > choice.chance) return;

            const qty = (choice.min && choice.max) ? Phaser.Math.Between(choice.min, choice.max) : (choice.qty || 1);

            // Simple proximity auto-pickup scaffold (replace with ground pickup later)
            const d2 = Phaser.Math.Distance.Squared(this.player.x, this.player.y, zombie.x, zombie.y);
            if (d2 <= 40 * 40 && this.uiScene?.inventory?.addItem) {
                this.uiScene.inventory.addItem(choice.itemId, qty);
            }
        } catch (_) { /* noop */ }
    }

    handlePlayerZombieCollision(player, zombie) {
        if (this.isGameOver) return;

        // Invisible: zombies don't hit you
        if (DevTools?.isPlayerInvisible?.() === true) return;

        // Per-zombie contact cooldown (prevents rapid-fire hits)
        const now = this.time.now | 0;
        const hitCdMs = 500;
        if (!zombie.lastHitTime) zombie.lastHitTime = 0;
        if (now - zombie.lastHitTime < hitCdMs) return;
        zombie.lastHitTime = now;

        // Dev invincibility
        if (DevTools?.shouldBlockPlayerDamage?.() === true) return;

        // Apply damage safely
        const damage = Phaser.Math.Between(5, 10);
        this.health = Math.max(0, (this.health | 0) - damage);

        // 🔒 Hardened: UI call is optional so a missing method never crashes the game
        this.uiScene?.updateHealth?.(this.health);

        // Dead → show Game Over, pause physics, allow SPACE to respawn in update()
        if (this.health <= 0) {
            this.isGameOver = true;

            // Pause physics but keep scenes alive
            this.physics.world.isPaused = true; // safer than this.physics.pause() if other subsystems run

            // Player feedback (guard body)
            try { player?.setTint?.(0x720c0c); } catch {}

            // Unbind inputs safely (same refs we bound with)
            this.input.off('pointerdown', this.onPointerDown, this);
            this.input.off('pointerup',   this.onPointerUp,   this);

            // Clear any swing state so cones stop drawing
            this._isSwinging = false;

            // Destroy any prior texts to avoid duplicates
            if (this.gameOverText?.destroy) this.gameOverText.destroy();
            if (this.respawnPrompt?.destroy) this.respawnPrompt.destroy();

            // Centered texts
            const cam = this.cameras.main;
            const cx = cam.worldView.x + cam.worldView.width  * 0.5;
            const cy = cam.worldView.y + cam.worldView.height * 0.5;

            this.gameOverText = this.add.text(cx, cy - 20, 'GAME OVER', {
                fontFamily: 'monospace',
                fontSize: '32px',
                color: '#ffffff'
            }).setOrigin(0.5).setDepth(1000);
            this.gameOverText.setStroke('#720c0c', 4);

            this.respawnPrompt = this.add.text(cx, cy + 20, 'Press SPACE to Respawn', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#ffffff'
            }).setOrigin(0.5).setDepth(1000);

            return;
        }

        // OPTIONAL: brief hit flash without allocations
        try {
            player?.setTintFill?.(0xffaaaa);
            this.time.delayedCall(90, () => player?.clearTint?.());
        } catch {}
    }

    // ==========================
    // Spawn helpers for zombie lists
    // ==========================
    _getEligibleZombieTypesForPhase(phase = 'day') {
        const list = [];
        for (const id of Object.keys(ZOMBIES)) {
            const def = ZOMBIES[id];
            if (!def) continue;
            const weight = def.spawnWeight ?? 1;
            if (weight <= 0) continue;
            if (phase === 'day') {
                if (def.canSpawnDay === true) list.push({ id, weight });
            } else {
                list.push({ id, weight });
            }
        }
        if (list.length === 0 && ZOMBIES.walker) list.push({ id: 'walker', weight: ZOMBIES.walker.spawnWeight ?? 1 });
        return list;
    }

    _pickZombieTypeWeighted(list) {
        if (!list || list.length === 0) return 'walker';
        let total = 0; for (const e of list) total += Math.max(0, e.weight || 0);
        if (total <= 0) return list[0].id;
        const r = Math.random() * total;
        let acc = 0;
        for (const e of list) { acc += Math.max(0, e.weight || 0); if (r <= acc) return e.id; }
        return list[list.length - 1].id;
    }

    // ==========================
    // RANDOM FUNCTIONS
    // ==========================
    _onEsc() {
        if (this.isGameOver) return;
        // If Pause is already open, let PauseScene handle ESC to resume;
        // otherwise open the overlay and pause gameplay.
        if (!this.scene.isActive('PauseScene')) {
            this.scene.launch('PauseScene'); // show overlay
            this.scene.pause();              // pause MainScene
        }
    }

    // Stop motion and clear key/pointer states (fixes "stuck moving" after tab switch)
    _autoPause() {
        if (this.isGameOver) return;

        // Prevent duplicate pause if already in PauseScene or a sub-pause scene
        const pauseOpen =
            this.scene.isActive('PauseScene') ||
            this.scene.isActive('DevUIScene'); // add other sub-pause scenes here if needed

        if (!pauseOpen) {
            this.scene.launch('PauseScene'); // only open top-level pause if none of them are open
        }

        if (this.sys.isActive()) {
            this.scene.pause(); // pause gameplay scene
        }

        this._resetInputAndStop?.();
    }


    // Stop motion and clear key/pointer states (fixes "stuck moving" after tab switch)
    _resetInputAndStop() {
        // Stop motion immediately
        if (this.player?.body) {
            this.player.body.setVelocity(0, 0);
            if (typeof this.player.body.stop === 'function') this.player.body.stop();
        }
        this._isSprinting = false;

        // Cancel any charging + hide ghost using your centralized helper
        this._cancelCharge?.();
        if (this.equippedItemGhost?.setVisible) this.equippedItemGhost.setVisible(false);

        // Reset keyboard states (clears isDown across all keys)
        if (this.input?.keyboard?.resetKeys) this.input.keyboard.resetKeys(true);

        // Defensive: also ensure our tracked movement keys are not stuck
        if (this.cursors) {
            if (this.cursors.up)    this.cursors.up.isDown = false;
            if (this.cursors.down)  this.cursors.down.isDown = false;
            if (this.cursors.left)  this.cursors.left.isDown = false;
            if (this.cursors.right) this.cursors.right.isDown = false;
            if (this.cursors.shift) this.cursors.shift.isDown = false;
            if (this.cursors.space) this.cursors.space.isDown = false;
        }
        if (this.keys) {
            if (this.keys.W) this.keys.W.isDown = false;
            if (this.keys.A) this.keys.A.isDown = false;
            if (this.keys.S) this.keys.S.isDown = false;
            if (this.keys.D) this.keys.D.isDown = false;
        }

        // Reset pointer state so buttons aren’t “held” when tabbing back
        if (this.input?.activePointer?.reset) this.input.activePointer.reset();
    }
}