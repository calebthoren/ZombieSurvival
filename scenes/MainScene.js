// scenes/MainScene.js
import { WORLD_GEN } from '../data/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js';
import DevTools from '../systems/DevTools.js';
import createCombatSystem from '../systems/combatSystem.js';
import createDayNightSystem from '../systems/dayNightSystem.js';
import createResourceSystem from '../systems/resourceSystem.js';
import createInputSystem from '../systems/inputSystem.js';

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');

        // Day/Night state
        this.dayIndex = 1; // Day 1
        this.phase = 'day'; // 'day' | 'night'
        this.phaseStartTime = 0; // ms since scene start
        this.waveNumber = 0; // increments each night
        this.spawnZombieTimer = null; // day trickle timer
        this.nightWaveTimer = null; // night waves timer

        // Charge state (generic to any charge-capable weapon)
        this.isCharging = false;
        this._chargingItemId = null; // which item started the current charge; null when not charging
        this.chargeStart = 0;
        this.chargeMaxMs = 1500; // 1.5s charge UI cap
        this.lastCharge = 0; // 0..1 captured on release

        // Melee swing state
        this._isSwinging = false; // true while a swing tween runs
        this._lastSwingEndTime = 0; // when the last swing finished
        this._nextSwingCooldownMs = 0; // computed per swing

        //ranged cooldown state
        this._nextRangedReadyTime = 0; // ms timestamp when ranged can fire again

        // pause tracking
        this._pauseStart = 0;

        // Equipped-item ghost (generic)
        this.equippedItemGhost = null;

        // Auto-pickup state
        this._autoPickupTimer = null;
        this._autoPickupEvent = null;
        this._autoPickupActive = false;
        this._autoPickupPointer = { rightButtonDown: () => true };
    }

    preload() {
        // player
        this.load.image(
            'player',
            'https://labs.phaser.io/assets/sprites/phaser-dude.png',
        );
        // zombies
        this.load.image('zombie', 'assets/enemies/zombie.png');
        // weapons & ammo
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');
        // resources
        this.load.image('rock1A', 'assets/resources/rocks/rock1A.png');
        this.load.image('rock1B', 'assets/resources/rocks/rock1B.png');
        this.load.image('rock1C', 'assets/resources/rocks/rock1C.png');
        this.load.image('rock1D', 'assets/resources/rocks/rock1D.png');
        this.load.image('rock1E', 'assets/resources/rocks/rock1E.png');
        this.load.image('rock2A', 'assets/resources/rocks/rock2A.png');
        this.load.image('rock2B', 'assets/resources/rocks/rock2B.png');
        this.load.image('rock2C', 'assets/resources/rocks/rock2C.png');
        this.load.image('rock2D', 'assets/resources/rocks/rock2D.png');
        this.load.image('rock2E', 'assets/resources/rocks/rock2E.png');
        this.load.image('rock5A', 'assets/resources/rocks/rock5A.png');
        this.load.image('rock5B', 'assets/resources/rocks/rock5B.png');
        this.load.image('rock5C', 'assets/resources/rocks/rock5C.png');
        this.load.image('rock5D', 'assets/resources/rocks/rock5D.png');
        this.load.image('rock5E', 'assets/resources/rocks/rock5E.png');
        // trees
        this.load.image('tree1A', 'assets/resources/trees/tree1A.png');
        this.load.image('tree1B', 'assets/resources/trees/tree1B.png');
        this.load.image('tree1C', 'assets/resources/trees/tree1C.png');
        this.load.image('tree2A', 'assets/resources/trees/tree2A.png');
        this.load.image('tree2B', 'assets/resources/trees/tree2B.png');
        this.load.image('tree2C', 'assets/resources/trees/tree2C.png');
        this.load.image('tree10A', 'assets/resources/trees/tree10A.png');
        this.load.image('tree10B', 'assets/resources/trees/tree10B.png');
        this.load.image('tree10C', 'assets/resources/trees/tree10C.png');
        // bushes
        this.load.image('bush1A', 'assets/resources/bushes/bush1A.png');
        this.load.image('bush1B', 'assets/resources/bushes/bush1B.png');
        this.load.image('bush1C', 'assets/resources/bushes/bush1C.png');
        this.load.image('bush3A', 'assets/resources/bushes/bush3A.png');
        this.load.image('bush3B', 'assets/resources/bushes/bush3B.png');
        this.load.image('bush3C', 'assets/resources/bushes/bush3C.png');
        // berry bushes
        this.load.image('berry_bushA1', 'assets/resources/bushes/berry_bushA1.png');
        this.load.image('berry_bushA2', 'assets/resources/bushes/berry_bushA2.png');
        this.load.image('berry_bushA3', 'assets/resources/bushes/berry_bushA3.png');
        this.load.image('berry_bushB1', 'assets/resources/bushes/berry_bushB1.png');
        this.load.image('berry_bushB2', 'assets/resources/bushes/berry_bushB2.png');
        this.load.image('berry_bushB3', 'assets/resources/bushes/berry_bushB3.png');
        // cotton bushes
        this.load.image('cotton_bush1', 'assets/resources/bushes/cotton_bush1.png');
        this.load.image('cotton_bush2', 'assets/resources/bushes/cotton_bush2.png');
        this.load.image('cotton_bush3', 'assets/resources/bushes/cotton_bush3.png');
    }

    create() {
        // Basic state
        this.health = 100;
        this.isGameOver = false;

        // Stamina state
        this.staminaMax = 100;
        this.stamina = this.staminaMax;
        this._lastStaminaSpendTime = 0; // for regen delay
        this._staminaRegenDelayMs = 1000; // 1.0s after last spend
        this._staminaRegenPerSec = 1; // +1 / sec
        this._sprintDrainPerSec = 2; // -2 / sec
        this._isSprinting = false;

        // Launch UI and keep a reference
        this.scene.launch('UIScene', {
            playerData: { health: this.health, stamina: this.stamina, ammo: 0 },
        });
        this.uiScene = this.scene.get('UIScene');
        this.combat = createCombatSystem(this);
        this.dayNight = createDayNightSystem(this);
        this.resourceSystem = createResourceSystem(this);
        this.inputSystem = createInputSystem(this);

        // Player
        this.player = this.physics.add
            .sprite(400, 300, 'player')
            .setScale(0.5)
            .setDepth(900)
            .setCollideWorldBounds(true);

        this.player._speedMult = 1;
        this.player._inBush = false;

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointerup', this.onPointerUp, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._cancelAutoPickup());
        this.events.once(Phaser.Scenes.Events.DESTROY, () => this._cancelAutoPickup());

        // ESC → open Pause overlay
        this.input.keyboard.on('keydown-ESC', this._onEsc, this);

        // ─────────────────────────────────────────────────────────────
        // Auto‑pause when the game/tab loses focus (robust, no restarts)
        // ─────────────────────────────────────────────────────────────
        if (!this._autoPauseBound) {
            this._autoPauseBound = true;

            // Cache bound handlers so we can unbind cleanly on shutdown/destroy
            this._boundAutoPause =
                this._boundAutoPause || (() => this._autoPause());
            this._boundReset =
                this._boundReset || (() => this._resetInputAndStop());
            this._visHandler =
                this._visHandler ||
                (() => {
                    if (document.hidden) this._autoPause();
                });
            this._winBlurHandler =
                this._winBlurHandler || (() => this._autoPause());

            // Phaser core blur
            this.game.events.on(Phaser.Core.Events.BLUR, this._boundAutoPause);
            // Browser-level fallbacks
            document.addEventListener('visibilitychange', this._visHandler, {
                passive: true,
            });
            window.addEventListener('blur', this._winBlurHandler, {
                passive: true,
            });
            // On Phaser pause, clear inputs to avoid drift when resuming
            this.game.events.on(Phaser.Core.Events.PAUSE, this._boundReset);

            // Teardown on shutdown/destroy to prevent duplicates after hot-reload/restart
            const _teardown = () => {
                this.input.keyboard.off('keydown-ESC', this._onEsc, this);
                this.game.events.off(
                    Phaser.Core.Events.BLUR,
                    this._boundAutoPause,
                );
                this.game.events.off(
                    Phaser.Core.Events.PAUSE,
                    this._boundReset,
                );
                document.removeEventListener(
                    'visibilitychange',
                    this._visHandler,
                    { passive: true },
                );
                window.removeEventListener('blur', this._winBlurHandler, {
                    passive: true,
                });
                this._autoPauseBound = false;
            };
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, _teardown);
            this.events.once(Phaser.Scenes.Events.DESTROY, _teardown);
        }

        // Groups
        this.zombies = this.physics.add.group();
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 32,
        });
        this.meleeHits = this.physics.add.group();
        this.resources = this.physics.add.group();
        this.droppedItems = this.add.group();
        this._dropCleanupEvent = this.time.addEvent({
            delay: 1000,
            loop: true,
            callback: () => this._cleanupDroppedItems(),
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this._dropCleanupEvent?.remove(false);
        });
        this.events.once(Phaser.Scenes.Events.DESTROY, () => {
            this._dropCleanupEvent?.remove(false);
        });

        // Spawn resources from WORLD_GEN (all resource groups)
        this.spawnAllResources();

        // Physics interactions
        this.physics.add.overlap(
            this.player,
            this.zombies,
            this.handlePlayerZombieCollision,
            null,
            this,
        );
        this.physics.add.overlap(
            this.bullets,
            this.zombies,
            this.handleProjectileHit,
            null,
            this,
        );
        this.physics.add.overlap(
            this.meleeHits,
            this.zombies,
            this.handleMeleeHit,
            null,
            this,
        );

        // Bullets vs resources (all resources stop bullets)
        this.physics.add.collider(
            this.bullets,
            this.resources,
            (bullet) => {
                if (bullet && bullet.destroy) bullet.destroy();
            },
            (bullet, res) => !!res.getData('blocking'),
            this,
        );

        // Zombies vs resources (only blocking ones separate)
        this._zombieResourceCollider = this.physics.add.collider(
            this.zombies,
            this.resources,
            null,
            (zombie, obj) => !!obj.getData('blocking'),
            this,
        );

        // Adjust timers when the scene is paused/resumed
        this.events.on(Phaser.Scenes.Events.PAUSE, () => {
            this._pauseStart = DevTools.now(this);
        });
        this.events.on(Phaser.Scenes.Events.RESUME, () => {
            const now = DevTools.now(this);
            const diff = now - (this._pauseStart || now);
            if (diff > 0) {
                if (this._lastStaminaSpendTime) this._lastStaminaSpendTime += diff;
            }
            this._pauseStart = 0;
        });

        // Night overlay
        const w = this.sys.game.config.width;
        const h = this.sys.game.config.height;
        this.nightOverlay = this.add
            .rectangle(0, 0, w, h, 0x000000)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(999)
            .setAlpha(0);

        // --- DevTools integration ---
        // Apply current hitbox cheat right away (responds to future toggles too)
        DevTools.applyHitboxCheat(this);
        DevTools.applyTimeScale(this);

        // Listen for dev spawn events
        this.game.events.on('dev:spawn-zombie', ({ type, pos }) =>
            this.spawnZombie(type, pos),
        );
        this.game.events.on('dev:drop-item', ({ id, pos }) =>
            this.resourceSystem.spawnWorldItem(id, pos),
        );

        // Inventory add hook used by DevTools.spawnItemsSmart()
        this.game.events.on('inv:add', ({ id, qty, where }) => {
            const added =
                this.addItemToInventory(id, qty || 1, where || 'inventory') | 0;
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

        // Use update(delta) to track phase time so it naturally freezes when paused.
        this._phaseElapsedMs = this._phaseElapsedMs | 0; // ensure exists

        // Update the UI clock periodically (cheap)
        this.time.addEvent({
            delay: 250,
            loop: true,
            callback: () => this.updateTimeUi(),
        });
    }

    // ==========================
    // Resource spawning (DB-driven)
    // ==========================
    spawnAllResources() {
        return this.resourceSystem.spawnAllResources();
    }

    addItemToInventory(id, qty = 1, _where = 'inventory') {
        const inv = this.uiScene?.inventory;
        if (!inv || !id) return 0;

        const count = (arr) => {
            let total = 0;
            for (let i = 0; i < arr.length; i++) {
                const s = arr[i];
                if (s && s.id === id) total += s.count;
            }
            return total;
        };

        const before = count(inv.grid) + count(inv.hotbar);
        inv.addItem(id, qty);
        const after = count(inv.grid) + count(inv.hotbar);
        return after - before;
    }

    dropItemStack(id, count = 1) {
        if (!id || count <= 0) return null;
        const item = this.add
            .image(this.player.x, this.player.y, id)
            .setDepth(5)
            .setScale(0.5)
            .setInteractive();

        const shadow = this.add
            .ellipse(
                item.x,
                item.y + item.displayHeight * 0.5,
                item.displayWidth * 0.8,
                item.displayHeight * 0.3,
                0x000000,
                0.3,
            )
            .setDepth(item.depth - 1);

        item.setData('stack', { id, count });
        const cycleMs = WORLD_GEN.dayNight.dayMs + WORLD_GEN.dayNight.nightMs;
        const phaseOffset = this.phase === 'night' ? WORLD_GEN.dayNight.dayMs : 0;
        const elapsed = this.getPhaseElapsed();
        const currentTime = (this.dayIndex - 1) * cycleMs + phaseOffset + elapsed;
        item.setData('expireGameTime', currentTime + cycleMs);

        item.once('destroy', () => {
            if (shadow && shadow.destroy) shadow.destroy();
        });

        item.on('pointerdown', (pointer) => {
            if (!pointer.rightButtonDown()) return;
            if (this.isCharging) return;
            this._pickupItem(item);
        });

        item.setData('shadow', shadow);
        this.droppedItems.add(item);
        return item;
    }

    _pickupItem(item) {
        if (!item) return false;
        const pickupRange = 40;
        const d2 = Phaser.Math.Distance.Squared(
            this.player.x,
            this.player.y,
            item.x,
            item.y,
        );
        if (d2 > pickupRange * pickupRange) return false;
        const stack = item.getData('stack');
        if (!stack) return false;
        const added = this.addItemToInventory(stack.id, stack.count);
        if (added > 0) {
            if (added >= stack.count) {
                item.destroy();
            } else {
                stack.count -= added;
                item.setData('stack', stack);
            }
            return true;
        }
        return false;
    }

    _scheduleAutoPickup() {
        this._cancelAutoPickup();
        this._autoPickupTimer = this.time.delayedCall(2000, () => {
            if (this.isCharging || !this.input.activePointer.rightButtonDown())
                return;
            this._autoPickupActive = true;
            this._autoPickupEvent = this.time.addEvent({
                delay: 100,
                loop: true,
                callback: () => this._attemptAutoPickup(),
            });
        });
    }

    _cancelAutoPickup() {
        if (this._autoPickupTimer) {
            this._autoPickupTimer.remove(false);
            this._autoPickupTimer = null;
        }
        if (this._autoPickupEvent) {
            this._autoPickupEvent.remove(false);
            this._autoPickupEvent = null;
        }
        this._autoPickupActive = false;
    }

    _attemptAutoPickup() {
        if (!this._autoPickupActive) return;
        if (this.isCharging || !this.input.activePointer.rightButtonDown()) {
            this._cancelAutoPickup();
            return;
        }
        const ptr = this.input.activePointer;
        const px = ptr.worldX;
        const py = ptr.worldY;
        const pickupRange = 40;
        const pickupRangeSq = pickupRange * pickupRange;
        const items = this.droppedItems.getChildren();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;
            if (!Phaser.Geom.Rectangle.Contains(item.getBounds(), px, py))
                continue;
            const dx = this.player.x - item.x;
            const dy = this.player.y - item.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > pickupRangeSq) continue;
            if (this._pickupItem(item)) break;
        }

        const resources = this.resources.getChildren();
        for (let i = 0; i < resources.length; i++) {
            const res = resources[i];
            if (!res.active) continue;
            if (!Phaser.Geom.Rectangle.Contains(res.getBounds(), px, py))
                continue;
            const dx = this.player.x - res.x;
            const dy = this.player.y - res.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > pickupRangeSq) continue;
            res.emit('pointerdown', this._autoPickupPointer);
            if (!res.active) break;
        }
    }

    // Remove expired dropped items to keep performance steady
    _cleanupDroppedItems() {
        const cycleMs = WORLD_GEN.dayNight.dayMs + WORLD_GEN.dayNight.nightMs;
        const phaseOffset = this.phase === 'night' ? WORLD_GEN.dayNight.dayMs : 0;
        const now =
            (this.dayIndex - 1) * cycleMs + phaseOffset + this.getPhaseElapsed();
        const items = this.droppedItems.getChildren();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;
            const expire = item.getData('expireGameTime');
            if (expire != null && now >= expire) {
                item.destroy();
            }
        }
    }

    // ==========================
    // STAMINA HELPERS
    // ==========================
    spendStamina(amount) {
        if (!amount || amount <= 0) return 0;

        // DevTools: skip stamina drain entirely when "Don’t Use Stamina" is ON
        if (
            DevTools &&
            typeof DevTools.shouldConsumeStamina === 'function' &&
            !DevTools.shouldConsumeStamina()
        ) {
            return 0;
        }

        const spend = Math.min(this.stamina, amount);
        if (spend > 0) {
            this.stamina -= spend;
            this._lastStaminaSpendTime = DevTools.now(this);
            this.uiScene?.updateStamina?.(this.stamina);
        }
        return spend;
    }

    hasStamina(amount) {
        return this.stamina >= (amount || 0.0001);
    }

    regenStamina(deltaMs) {
        if (this._isSprinting || this.isCharging) return;
        if (
            DevTools.now(this) - this._lastStaminaSpendTime <
            this._staminaRegenDelayMs
        )
            return;
        const add = this._staminaRegenPerSec * (deltaMs / 1000);
        if (add > 0) {
            this.stamina = Math.min(this.staminaMax, this.stamina + add);
            this.uiScene?.updateStamina?.(this.stamina);
        }
    }

    // ==========================
    // Day/Night Cycle Management
    // ==========================
    startDay() {
        return this.dayNight.startDay();
    }
    startNight() {
        return this.dayNight.startNight();
    }
    scheduleDaySpawn() {
        return this.dayNight.scheduleDaySpawn();
    }
    scheduleNightWave() {
        return this.dayNight.scheduleNightWave();
    }
    getPhaseElapsed() {
        return this.dayNight.getPhaseElapsed();
    }
    getPhaseDuration() {
        return this.dayNight.getPhaseDuration();
    }
    updateNightOverlay() {
        return this.dayNight.updateNightOverlay();
    }
    updateTimeUi() {
        return this.dayNight.updateTimeUi();
    }

    // ==========================
    // UPDATE LOOP
    // ==========================
    update(time, delta) {
        if (this.isGameOver) {
            if (
                Phaser.Input.Keyboard.JustDown(
                    this.input.keyboard.addKey(
                        Phaser.Input.Keyboard.KeyCodes.SPACE,
                    ),
                )
            ) {
                DevTools.resetToDefaults(this);
                this.scene.stop('UIScene');
                this.scene.restart();
            }
            return;
        }

        this.dayNight.tick(delta);

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
        const walkSpeed = 75;
        const sprintMult = 1.5;
        const p = this.player.body.velocity;
        p.set(0);

        const up = this.keys.W?.isDown || this.cursors.up?.isDown;
        const down = this.keys.S?.isDown || this.cursors.down?.isDown;
        const left = this.keys.A?.isDown || this.cursors.left?.isDown;
        const right = this.keys.D?.isDown || this.cursors.right?.isDown;
        const shift = this.input.keyboard.checkDown(
            this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
            0,
        );

        this._isSprinting = !!shift && this.hasStamina(0.001);
        let speed =
            walkSpeed *
            (this._isSprinting ? sprintMult : 1) *
            (this.player._speedMult || 1);

        if (up) p.y = -speed;
        else if (down) p.y = speed;
        if (left) p.x = -speed;
        else if (right) p.x = speed;
        if (p.x !== 0 && p.y !== 0) {
            p.x *= Math.SQRT1_2;
            p.y *= Math.SQRT1_2;
        }

        // Sprint drain
        if (this._isSprinting && (p.x !== 0 || p.y !== 0)) {
            const drain = this._sprintDrainPerSec * (delta / 1000);
            this.spendStamina(drain);
            if (!this.hasStamina(0.001)) this._isSprinting = false;
        }

        // Stamina regen
        this.regenStamina(delta);

        // Zombie pursuit (simple: slide → then stun → then chase)
        const now = this.time.now;
        this.zombies.getChildren().forEach((zombie) => {
            const inKnockback = (zombie.knockbackUntil || 0) > now;
            const stunned = (zombie.stunUntil || 0) > now && !inKnockback; // stun begins after slide

            if (stunned) {
                zombie.setVelocity(0, 0);
            } else if (!inKnockback) {
                if (DevTools.isPlayerInvisible()) {
                    zombie.setVelocity(0, 0);
                } else {
                    this.physics.moveToObject(
                        zombie,
                        this.player,
                        (zombie.speed || 40) * (zombie._speedMult || 1),
                    );
                }
            } // else: let existing velocity keep sliding

            if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
            else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);

            if (zombie.hpBg && zombie.hpFill)
                this.combat.updateZombieHpBar(zombie);
        });

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
        if (pointer.button === 2) this._scheduleAutoPickup();
        return this.inputSystem.onPointerDown(pointer);
    }

    onPointerUp(pointer) {
        if (pointer.button === 2) this._cancelAutoPickup();
        return this.inputSystem.onPointerUp(pointer);
    }

    swingBat(pointer, wpn, chargePercent = 0) {
        return this.combat.swingBat(pointer, wpn, chargePercent);
    }
    fireRangedWeapon(pointer, wpn, chargePercent) {
        return this.combat.fireRangedWeapon(pointer, wpn, chargePercent);
    }
    handleMeleeHit(hit, zombie) {
        return this.combat.handleMeleeHit(hit, zombie);
    }
    handleProjectileHit(bullet, zombie) {
        return this.combat.handleProjectileHit(bullet, zombie);
    }
    handlePlayerZombieCollision(player, zombie) {
        return this.combat.handlePlayerZombieCollision(player, zombie);
    }
    spawnZombie(typeKey = 'walker', pos = null) {
        return this.combat.spawnZombie(typeKey, pos);
    }

    _createEquippedItemGhost(eqOrId) {
        // Normalize input to an object with id
        const eq = typeof eqOrId === 'string' ? { id: eqOrId } : eqOrId;
        const def = eq && eq.id ? ITEM_DB?.[eq.id] || null : null;

        // Texture & visual from WORLD config (fallback to id)
        const texKey = def?.world?.textureKey || eq?.id || 'slingshot';
        const originX = def?.world?.origin?.x ?? 0.5;
        const originY = def?.world?.origin?.y ?? 0.5;
        const scale = def?.world?.scale ?? 0.5;

        // Reuse image if same texture; otherwise (re)create
        if (
            this.equippedItemGhost &&
            this.equippedItemGhost.texture &&
            this.equippedItemGhost.texture.key === texKey
        ) {
            this.equippedItemGhost.setVisible(true);
        } else {
            if (this.equippedItemGhost) {
                this.equippedItemGhost.destroy();
                this.equippedItemGhost = null;
            }
            this.equippedItemGhost = this.add
                .image(this.player.x, this.player.y, texKey)
                .setOrigin(originX, originY)
                .setDepth((this.player?.depth ?? 900) + 1)
                .setFlipY(false)
                .setAlpha(1); // not transparent
        }

        this.equippedItemGhost.setScale(scale).setVisible(true);

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
        const isMelee = wpn.category === 'melee';
        const isRanged = wpn.category === 'ranged';

        const ptr = this.input.activePointer;
        const px = this.player.x,
            py = this.player.y;

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
            } else if (
                mo &&
                typeof mo.x === 'number' &&
                typeof mo.y === 'number'
            ) {
                radius = Math.max(1, Math.hypot(mo.x, mo.y));
            } else if (typeof wpn.ghostRadius === 'number') {
                radius = Math.max(1, wpn.ghostRadius);
            } else {
                radius = 18;
            }

            const gx = px + Math.cos(aim) * radius;
            const gy = py + Math.sin(aim) * radius;

            const flipY = gx < px; // flip across X-axis when ghost is left of player
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
            const coneHalf = Phaser.Math.DegToRad(
                (wpn?.coneAngleDeg ?? 90) / 2,
            ); // default 45°
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

        const item = ITEM_DB?.[eq.id];
        const wpnDef = item?.weapon;
        const ammoDef = item?.ammo;
        const canChargeWpn = wpnDef?.canCharge === true;
        const canChargeAmmo = !!ammoDef && item.tags?.includes('rock');
        if (!canChargeWpn && !canChargeAmmo) return;

        // Raw 0..1 charge based on time held
        const heldMs = Phaser.Math.Clamp(
            this.time.now - this.chargeStart,
            0,
            this.chargeMaxMs,
        );
        const raw = this.chargeMaxMs > 0 ? heldMs / this.chargeMaxMs : 1;

        let uiPercent;
        if (canChargeWpn) {
            const st = wpnDef.stamina || {};
            let predictLowStamina = false;
            let estCost = 0;
            if (
                typeof st.baseCost === 'number' &&
                typeof st.maxCost === 'number'
            ) {
                estCost = Phaser.Math.Linear(st.baseCost, st.maxCost, raw);
            } else if (typeof st.cost === 'number') {
                estCost = st.cost;
            }
            if (estCost > 0 && this.stamina < estCost) predictLowStamina = true;

            const maxCap =
                predictLowStamina && typeof st.poorChargeClamp === 'number'
                    ? Math.max(0.0001, st.poorChargeClamp)
                    : 1;

            const effective = Math.min(raw, maxCap);
            uiPercent = Phaser.Math.Clamp(effective, 0, 1);
        } else {
            uiPercent = Phaser.Math.Clamp(raw, 0, 1);
        }

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
    // RANDOM FUNCTIONS
    // ==========================
    _onEsc() {
        return this.inputSystem.onEsc();
    }

    _autoPause() {
        return this.inputSystem.autoPause();
    }

    _resetInputAndStop() {
        return this.inputSystem.resetInputAndStop();
    }
}
