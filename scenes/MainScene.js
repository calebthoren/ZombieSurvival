// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js';

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
                this.physics.moveToObject(zombie, this.player, zombie.speed || 40);
            } // else: let existing velocity keep sliding

            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);

            if (zombie.hpBg && zombie.hpFill) this._updateOneZombieHpBar(zombie);
        });

        // Visuals
        this.updateNightOverlay();

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

            // Cooldown gate (from END of previous swing)
            const baseCd = wpn?.swingCooldownMs ?? 80;
            const effectiveCd = this._nextSwingCooldownMs ?? baseCd;
            const lastEnd = this._lastSwingEndTime || 0;
            if (now - lastEnd < effectiveCd) return;

            if (wpn.canCharge === true) {
                // Start charge
                this.isCharging = true;
                this.chargeStart = now;
                this.chargeMaxMs = Math.max(1, wpn?.chargeMaxMs ?? 1500); // ← use per-weapon time
                this._chargingItemId = equipped.id;
                this.uiScene?.events?.emit('weapon:charge', 0);

                // Ghost
                this._createEquippedItemGhost(equipped);
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

            // ranged cooldown gate
            const fireCd = wpn?.fireCooldownMs ?? 0;
            if (fireCd > 0 && now < (this._nextRangedReadyTime || 0)) return;

            // Ammo check (generic, multi-ammo ready)
            const ammoInfo = this.uiScene?.inventory?.totalOfActiveAmmo?.(equipped.id);
            if (!ammoInfo || ammoInfo.total <= 0) return;

            // Start charge
            this.isCharging = true;
            this.chargeStart = now;
            this.chargeMaxMs = Math.max(1, wpn?.chargeMaxMs ?? 1500); // ← use per-weapon time
            this._chargingItemId = equipped.id;
            this.uiScene?.events?.emit('weapon:charge', 0);

            // Ghost
            this._createEquippedItemGhost(equipped);
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
        const range = wpn?.range ?? 30;
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

        // Hit circle (sensor)
        const hit = this.add.circle(this.player.x, this.player.y, radius, 0xff0000, 0);
        this.physics.add.existing(hit);
        hit.body.setAllowGravity(false);
        if (hit.body.setCircle) {
            hit.body.setCircle(radius);
            hit.body.setOffset(-radius, -radius);
        }
        this.meleeHits.add(hit);

        // Per-swing payload
        hit.setData('damage', Math.max(0, Math.round(swingDamage)));
        hit.setData('knockback', Math.max(0, swingKnockback));
        hit._hitSet = new Set();

        // Lock swing state now
        this._isSwinging = true;

        // Tweened swing motion
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
                // Swing finished → record end time for cooldown & unlock
                this._isSwinging = false;
                this._lastSwingEndTime = this.time.now;
                if (this.batSprite) { this.batSprite.destroy(); this.batSprite = null; }

                // UI cooldown overlay for bat
                if (this._nextSwingCooldownMs > 0) {
                    this.uiScene?.events?.emit('weapon:cooldownStart', {
                        itemId: 'crude_bat',
                        durationMs: this._nextSwingCooldownMs
                    });
                }
            }
        });

        // Destroy the hit sensor after swing
        this.time.delayedCall(swingDurationMs, () => { if (hit && hit.destroy) hit.destroy(); });
    }

    handleMeleeHit(hit, zombie) {
        if (!hit || !zombie || !zombie.active) return;

        // One-hit-per-enemy-per-swing
        const reg = hit._hitSet || (hit._hitSet = new Set());
        if (reg.has(zombie)) return;
        reg.add(zombie);

        const baseD = ITEM_DB?.crude_bat?.weapon?.damage ?? 10;
        let dmg     = hit?.getData('damage') ?? baseD;
        const baseKb = ITEM_DB?.crude_bat?.weapon?.knockback ?? 10;
        const kb      = hit?.getData('knockback') ?? baseKb;

        // Apply melee resistance multiplier
        const meleeMult = Math.max(0, zombie?.resist?.meleeMult ?? 1);
        dmg = Math.max(0, Math.round(dmg * meleeMult));

        this._applyZombieDamage(zombie, dmg);
        this._applyKnockbackAndMaybeStun(zombie, this.player.x, this.player.y, kb);
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

        // NEW: When tired, use stamina base cost/cost as a damage floor (replacing minDamageOnLow)
        const dmgFloor = lowStamina ? ((typeof st.baseCost === 'number') ? st.baseCost : (typeof st.cost === 'number' ? st.cost : null)) : null;
        if (dmgFloor != null) shotDmg = Math.max(dmgFloor, shotDmg);

        // Travel distance from charge (unchanged); speed may be reduced if tired
        let speed    = wpn?.projectileSpeed ?? 400;
        const minRange = wpn?.minRange ?? 180;
        const maxRange = wpn?.maxRange ?? 420;
        const travel   = Phaser.Math.Linear(minRange, maxRange, effectiveCharge);

        // NEW: tired shots fly slower
        if (lowStamina && typeof st.lowSpeedMultiplier === 'number') {
            speed = Math.max(40, Math.floor(speed * st.lowSpeedMultiplier));
        }

        // Consume ammo now that we know we will fire
        this.uiScene?.inventory?.consumeAmmo?.(ammoChoice.ammoId, 1);

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

        // NEW: ranged cooldown (longer when tired)
        const baseCd = wpn?.fireCooldownMs ?? 0;
        const cdMs = lowStamina && typeof st.lowCooldownMultiplier === 'number'
            ? Math.floor(baseCd * st.lowCooldownMultiplier)
            : baseCd;

        if (cdMs > 0) {
            this._nextRangedReadyTime = this.time.now + cdMs;
            this.uiScene?.events?.emit('weapon:cooldownStart', {
                itemId: equipped.id,
                durationMs: cdMs
            });
        }

        // Close out the bar
        this.uiScene?.events?.emit('weapon:chargeEnd');
    }

    _updateEquippedItemGhost() {
        if (!this.equippedItemGhost || !this.isCharging) return;

        const eq = this.uiScene?.inventory?.getEquipped?.();
        const wpn = eq ? ITEM_DB[eq.id]?.weapon : null;
        const isBat = (eq?.id === 'crude_bat');

        const ptr = this.input.activePointer;
        const px = this.player.x, py = this.player.y;

        const aim = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY);

        if (isBat) {
            const startAng = aim - Phaser.Math.DegToRad(45);
            this.equippedItemGhost
                .setPosition(px, py)
                .setRotation(startAng)
                .setFlipY(false)
                .setScale(1);
            return;
        }

        const mo = wpn?.muzzleOffset;
        let x = px, y = py;

        if (typeof mo === 'number') {
            x = px + Math.cos(aim) * mo;
            y = py + Math.sin(aim) * mo;
        } else if (mo && typeof mo.x === 'number' && typeof mo.y === 'number') {
            const cos = Math.cos(aim), sin = Math.sin(aim);
            const offX = mo.x * cos - mo.y * sin;
            const offY = mo.x * sin + mo.y * cos;
            x = px + offX; y = py + offY;
        } else {
            const r = 20;
            x = px + Math.cos(aim) * r;
            y = py + Math.sin(aim) * r;
        }

        const flipY = Math.cos(aim - Phaser.Math.DegToRad(-20)) < 0;

        this.equippedItemGhost
            .setPosition(x, y)
            .setRotation(aim)
            .setFlipY(flipY)
            .setScale(0.5);
    }

    _destroyEquippedItemGhost() {
        if (this.equippedItemGhost) {
            this.equippedItemGhost.destroy();
            this.equippedItemGhost = null;
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
    spawnZombie(typeKey) {
        const type = typeKey || 'walker';
        const def = ZOMBIES[type] || ZOMBIES.walker || {};

        // Spawn at a random edge
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
        zombie.maxHp = def.health ?? 25;
        zombie.hp = zombie.maxHp;
        zombie.attackDamage = def.damage ?? 10;
        zombie.aggroRange = def.aggroRange ?? 99999;
        zombie.attackCooldownMs = def.attackCooldownMs ?? 800;
        zombie.resist = Object.assign({ rangedMult: 1, meleeMult: 1, knockback: 0 }, def.resist || {});
        zombie.staggerThreshold = (typeof def.staggerThreshold === 'number') ? def.staggerThreshold : 0;
        zombie.stunDurationMs = def.stunDurationMs ?? 180;
        zombie.knockbackUntil = 0;
        zombie.stunUntil = 0;


        // HP bar placeholders
        zombie.hpBg = null; zombie.hpFill = null;
        zombie.hpBarW = def.hpBar?.width ?? 18;
        zombie.hpBarH = def.hpBar?.height ?? 3;
        zombie.hpYOffset = (typeof def.hpBar?.yOffset === 'number')
            ? def.hpBar.yOffset
            : (zombie.displayHeight * (def.hpBar?.yOffsetFactor ?? 0.6));

        return zombie;
    }

    _ensureZombieHpBar(zombie) {
        if (zombie.hpBg && zombie.hpFill) return;

        const barW = zombie.hpBarW ?? 18;
        const barH = zombie.hpBarH ?? 3;
        const yOff = zombie.hpYOffset ?? (zombie.displayHeight * 0.6);

        const bg = this.add.rectangle(zombie.x, zombie.y - yOff, barW, barH, 0x000000)
            .setOrigin(0.5, 1).setDepth(950).setAlpha(0.9).setVisible(true);
        const fill = this.add.rectangle(bg.x - barW / 2, bg.y, barW, barH, 0xff3333)
            .setOrigin(0, 1).setDepth(951).setAlpha(1).setVisible(true);

        zombie.hpBg = bg; zombie.hpFill = fill;
        zombie.hpBarW = barW; zombie.hpBarH = barH; zombie.hpYOffset = yOff;
    }

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

        const show = pct < 1;
        zombie.hpBg.setVisible(show);
        zombie.hpFill.setVisible(show);
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
                { fontSize: '32px', fill: '#fff', align: 'center', padding: { x: 20, y: 20 } }
            ).setOrigin(0.5).setDepth(1000);
            this.gameOverText.setStroke('#720c0c', 3);
        }
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
        if (this.isGameOver) return; // don't interfere with game-over flow

        // Prevent redundant work if we've already paused or are inactive
        // (Pausing an already-paused scene is safe but we short-circuit to avoid churn.)
        if (!this.scene.isActive('PauseScene')) {
            this.scene.launch('PauseScene'); // show overlay (no start/restart of MainScene)
        }
        if (this.sys.isActive()) {
            this.scene.pause(); // pause THIS MainScene
        }

        // Clear inputs so we don’t drift/shoot on return
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
