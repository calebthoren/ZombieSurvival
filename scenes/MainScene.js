// scenes/MainScene.js
import { WORLD_GEN } from '../systems/world_gen/worldGenConfig.js';
import { ITEM_DB } from '../data/itemDatabase.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js';
import DevTools from '../systems/DevTools.js';
import createCombatSystem from '../systems/combatSystem.js';
import createDayNightSystem from '../systems/world_gen/dayNightSystem.js';
import createResourceSystem from '../systems/resourceSystem.js';
import createInputSystem from '../systems/inputSystem.js';
import ChunkManager from '../systems/world_gen/chunks/ChunkManager.js';
import { clear } from '../systems/world_gen/chunks/chunkStore.js';
import createZombiePool from '../systems/pools/zombiePool.js';
import createResourcePool from '../systems/pools/resourcePool.js';
import { setBiomeSeed } from '../systems/world_gen/biomes/biomeMap.js';
import createLightingSystem from '../systems/lightingSystem.js';

// Radius for the player's personal light at night (tweak-friendly).
const PLAYER_NIGHT_LIGHT_RADIUS = 96; // Doubled from 48
const NIGHT_MASK_DEFAULT_TILE_SIZE = 16;
const NIGHT_MASK_DEFAULT_TILE_COUNT = 5;

export default class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');

        // Day/Night state
        this.dayIndex = 1; // Day 1
        this.phase = 'day'; // 'day' | 'night'
        this.phaseStartTime = 0; // ms since scene start
        this.waveNumber = 0; // increments each night
        this.spawnZombieTimer = null; // day trickle timer

        // Charge state (generic to any charge-capable weapon)
        this.isCharging = false;
        this._chargingItemId = null; // which item started the current charge; null when not charging
        this.chargeStart = 0;
        this.chargeMaxMs = 2000; // 2s charge UI cap
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

        // Chunk streaming timer state
        this._chunkCheckEvent = null;
        this._chunkCheckDelay = 300;

        // Lighting state
        this._lightBindings = [];
        this.lightSettings = {
            player: {
                nightRadius: PLAYER_NIGHT_LIGHT_RADIUS,
                baseRadius: PLAYER_NIGHT_LIGHT_RADIUS,
                flickerAmplitude: 8,
                flickerSpeed: 2.25,
                upgradeMultiplier: 1,
                maskScale: 0.8,
            },
        };
        this._playerLightNightRadius = this.lightSettings.player.nightRadius;
        this._lightsTeardownHooked = false;
        this._boundLightTeardown = null;
        this._playerLightNightActive = false;
        this._playerLightCachedRawSegment = null;
        this._playerLightCachedNormalizedSegment = '';
        this.nightOverlayMaskGraphics = null;
        this.nightOverlayMask = null;
        this._nightOverlayMaskEnabled = false;
        this._nightMaskTeardownHooked = false;
        this._boundNightMaskTeardown = null;
        this._lightMaskScratch = {
            lights: [],
            gradientCache: Object.create(null),
        };
        this._midnightAmbientStrength = 0;
        this._playerLightUpgradeMultiplier = this.lightSettings.player.upgradeMultiplier;
        this._playerLightFlickerPhase = Math.random() * Phaser.Math.PI2;
        this._playerLightFlickerPhaseAlt = Math.random() * Phaser.Math.PI2;

        // Lighting system
        this.lighting = createLightingSystem(this);
        this.lighting.initLighting();
    }

    preload() {
        // player
        this.load.image(
            'player',
            'https://labs.phaser.io/assets/sprites/phaser-dude.png',
        );
        // zombies
        this.load.image('zombie', 'assets/enemies/zombie.png');
        this.load.image('walker_flamed', 'assets/enemies/walker_flamed.png');
        // weapons & ammo
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');
        // resources
        const RES_PATHS = {
            rock: 'assets/resources/rocks/',
            tree: 'assets/resources/trees/',
            bush: 'assets/resources/bushes/',
        };
        const seen = new Set();
        Object.values(RESOURCE_DB).forEach((res) => {
            const tex = res.world?.textureKey;
            if (!tex || seen.has(tex)) return;
            const typeTag = res.tags.find((t) => RES_PATHS[t]);
            if (typeTag) {
                this.load.image(tex, `${RES_PATHS[typeTag]}${tex}.png`);
                seen.add(tex);
            }
        });
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

        // Reset any previous chunk metadata and UI state
        clear();
        setBiomeSeed(WORLD_GEN.seed);
        // Ensure fresh UI on respawn
        this.scene.stop('UIScene');
        // Launch UI and keep a reference
        this.scene.launch('UIScene', {
            playerData: { health: this.health, stamina: this.stamina, ammo: 0 },
        });
        this.uiScene = this.scene.get('UIScene');
        this.combat = createCombatSystem(this);
        this.dayNight = createDayNightSystem(this);
        this.resourceSystem = createResourceSystem(this) || this.resourceSystem;
        // Wire chunk events to resource system
        this.events.on('chunk:load', (chunk) => this.resourceSystem.spawnChunkResources(chunk));
        this.events.on('chunk:unload', (chunk) => this.resourceSystem.cancelChunkJob(chunk));
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.events.off('chunk:load');
            this.events.off('chunk:unload');
        });
        this.inputSystem = createInputSystem(this);

        // Expand world bounds to config size
        this.physics.world.setBounds(0, 0, WORLD_GEN.world.width, WORLD_GEN.world.height);
        this.cameras.main.setBounds(0, 0, WORLD_GEN.world.width, WORLD_GEN.world.height);

        // Player
        this.player = this.physics.add
            .sprite(WORLD_GEN.spawn.x, WORLD_GEN.spawn.y, 'player')
            .setScale(0.5)
            .setDepth(900)
            .setCollideWorldBounds(false);

        this.lighting.initLighting();
        const playerLightSettings = this.lightSettings.player;
        this.playerLight = this.attachLightToObject(this.player, {
            radius:
                playerLightSettings.baseRadius ?? playerLightSettings.nightRadius,
            intensity: 0,
            maskScale: playerLightSettings.maskScale,
        });
        if (this.playerLight) {
            this.playerLight.active = false;
        }
        if (!this._boundLightTeardown) {
            this._boundLightTeardown = () => {
                if (!this._lightsTeardownHooked) return;
                this._lightsTeardownHooked = false;
                this._teardownLights();
                this._boundLightTeardown = null;
            };
        }
        if (!this._lightsTeardownHooked) {
            this._lightsTeardownHooked = true;
            this.events.once(
                Phaser.Scenes.Events.SHUTDOWN,
                this._boundLightTeardown,
            );
            this.events.once(
                Phaser.Scenes.Events.DESTROY,
                this._boundLightTeardown,
            );
        }

        this.cameras.main.startFollow(this.player);
        this.cameras.main.setRoundPixels(true);

        this.player._speedMult = 1;
        this.player._inBush = false;

        // Adjust player collider: halve height by removing the top half
        try {
            const body = this.player?.body;
            if (body && typeof body.setSize === 'function' && typeof body.setOffset === 'function') {
                const currentW = body.width ?? this.player.displayWidth;
                const currentH = body.height ?? this.player.displayHeight;
                const newH = Math.max(1, Math.floor(currentH / 2));
                const deltaY = currentH - newH; // amount removed from the top
                body.setSize(currentW, newH);
                const ox = (body.offset && typeof body.offset.x === 'number') ? body.offset.x : 0;
                const oy = (body.offset && typeof body.offset.y === 'number') ? body.offset.y : 0;
                // Raise the hitbox upward by half its own height
                body.setOffset(ox, oy + deltaY - Math.floor(newH / 2));
            }
        } catch {}

        // Groups
        this.zombies = this.physics.add.group();
        this.bullets = this.physics.add.group({
            classType: Phaser.Physics.Arcade.Image,
            maxSize: 32,
        });
        this.meleeHits = this.physics.add.group();
        // Split resources:
        // - resources: static physics (AABBs) for blocking/bush where rect is fine
        // - resourcesDyn: dynamic immovable physics for circular bodies (rocks with circle colliders)
        // - resourcesDecor: non-physics collectibles
        this.resources = this.physics.add.staticGroup();
        this.resourcesDyn = this.physics.add.group();
        this.resourcesDecor = this.add.group();
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

        // Pools
        this.zombiePool = createZombiePool(this);
        this.resourcePool = createResourcePool(this);

        this.chunkManager = new ChunkManager(this, 1);
        // Tune chunk streaming budgets for smoother movement on your machine
        this.chunkManager.maxLoadsPerTick = 2;
        this.chunkManager.maxUnloadsPerTick = 2;
        this.chunkManager.unloadGraceMs = 900; // delay unload slightly to avoid thrash
        this.checkChunks();
        this._chunkCheckEvent = this.time.addEvent({
            delay: this._chunkCheckDelay,
            loop: true,
            callback: this.checkChunks,
            callbackScope: this,
        });
        const teardownChunkTimer = () => this._teardownChunkCheckEvent();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardownChunkTimer);
        this.events.once(Phaser.Scenes.Events.DESTROY, teardownChunkTimer);

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

        // Chunk-based resources: loaded per nearby chunk via ChunkManager
        // (Avoid global spawn to prevent startup hitch.)

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
        this.physics.add.collider(
            this.bullets,
            this.resourcesDyn,
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
        this._zombieResourceColliderDyn = this.physics.add.collider(
            this.zombies,
            this.resourcesDyn,
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
        this.lighting.createOverlayIfNeeded();

        // Simple radial BitmapMask light (ported from main) — overrides lightingSystem when active
        try {
            const texKey = 'light_radial_mask_v17';
            const size = 192; // square texture (px)
            if (!this.textures.exists(texKey)) {
                const c = this.textures.createCanvas(texKey, size, size);
                const ctx = c.getContext();
                const cx = size / 2;
                const cy = size / 2;
                const r = size / 2;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                // center fully white (alpha 1), edge transparent (alpha 0)
                grad.addColorStop(0.0, 'rgba(255,255,255,1)');
                grad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
                grad.addColorStop(1.0, 'rgba(255,255,255,0)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, size, size);
                c.refresh();
            }
            this._lightMaskSprite = this.add.image(0, 0, texKey)
                .setOrigin(0.5, 0.5)
                .setScrollFactor(0)
                .setDepth(10001)
                .setVisible(false);
            this._lightMaskBM = new Phaser.Display.Masks.BitmapMask(this, this._lightMaskSprite);
            this._lightMaskBM.invertAlpha = true; // punch a hole in darkness

            // Tunables
            this._lightTexSize = 192;
            this._lightBaseRadiusMult = 1.1;  // matches main (twice the earlier 0.55)
            this._lightFlickerPct = 0.06;
            this._lightFlickerHz = 6.3;
            this._lightFlickerHz2 = 9.7;

            // Cleanup on shutdown/destroy
            const onTearDown = () => {
                try { if (this.nightOverlay && this.nightOverlay.mask === this._lightMaskBM) this.nightOverlay.clearMask(true); } catch {}
                try { this._lightMaskSprite?.destroy(); } catch {}
                this._lightMaskSprite = null;
                this._lightMaskBM = null;
            };
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, onTearDown);
            this.events.once(Phaser.Scenes.Events.DESTROY, onTearDown);
        } catch (e) {
            console?.warn?.('V1.7 simple light mask init failed', e);
        }

        // --- DevTools integration ---
        // Apply current hitbox cheat right away (responds to future toggles too)
        DevTools.applyHitboxCheat(this);
        DevTools.setNoDarkness(DevTools.cheats.noDarkness, this);
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

        this.applyLightPipeline(item);
        const itemDef = ITEM_DB?.[id];
        const lightCfg = itemDef?.world?.light;
        if (lightCfg) this.attachLightToObject(item, lightCfg);

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
            // If the player starts holding RMB with this same click, enable auto-pickup immediately
            try { this._scheduleAutoPickup(); } catch {}
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
        this._autoPickupTimer = this.time.delayedCall(1000, () => {
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
        const pickupRange = 40;
        const pickupRangeSq = pickupRange * pickupRange;

        // Scan dropped items within range of the player (ignores pointer position)
        const items = this.droppedItems.getChildren();
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.active) continue;
            const dx = this.player.x - item.x;
            const dy = this.player.y - item.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > pickupRangeSq) continue;
            if (this._pickupItem(item)) break;
        }

        // Scan simple resources within range of the player (ignores pointer position)
        const scanGroups = [this.resources, this.resourcesDecor];
        for (const grp of scanGroups) {
            if (!grp || !grp.getChildren) continue;
            const resources = grp.getChildren();
            for (let i = 0; i < resources.length; i++) {
                const res = resources[i];
                if (!res.active) continue;
                const dx = this.player.x - res.x;
                const dy = this.player.y - res.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > pickupRangeSq) continue;
                res.emit('pointerdown', this._autoPickupPointer);
                if (!res.active) break;
            }
        }
    }

    // Periodic chunk loading/unloading
    checkChunks() {
        const p = this.player;
        const cm = this.chunkManager;
        if (!p || !cm || typeof cm.update !== 'function') return;
        // Adaptive streaming based on FPS and movement speed
        const fps = Math.round(this.game?.loop?.actualFps || 0);
        const body = p.body;
        const speed = body ? Math.hypot(body.velocity.x, body.velocity.y) : 0;
        const targetLoads = fps < 50 ? 1 : 2;
        const targetUnloads = fps < 50 ? 1 : 2;
        if (cm.maxLoadsPerTick !== targetLoads || cm.maxUnloadsPerTick !== targetUnloads) {
            cm.maxLoadsPerTick = targetLoads;
            cm.maxUnloadsPerTick = targetUnloads;
        }
        const baseDelay = 300;
        const targetDelay = speed > 140 ? 380 : baseDelay;
        this._chunkCheckDelay = targetDelay;
        const chunkEvent = this._chunkCheckEvent;
        if (chunkEvent && chunkEvent.delay !== targetDelay) {
            chunkEvent.delay = targetDelay;
            if (chunkEvent.hasDispatched && chunkEvent.elapsed > targetDelay) {
                chunkEvent.elapsed = targetDelay;
            }
        }
        cm.update(p.x, p.y);
    }

    _teardownChunkCheckEvent() {
        const chunkEvent = this._chunkCheckEvent;
        if (!chunkEvent) return;
        if (!chunkEvent.hasDispatched && chunkEvent.elapsed < chunkEvent.delay) {
            chunkEvent.elapsed = chunkEvent.delay;
        }
        chunkEvent.remove(false);
        this._chunkCheckEvent = null;
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
        // Keep overlay alpha up-to-date before drawing the mask
        this.updateNightOverlay();
        this.lighting.update(delta);

        // Override lightingSystem mask with simple BitmapMask when darkness is visible
        try {
            const overlay = this.nightOverlay;
            const hasDarkness = !!(overlay && (overlay.alpha || 0) > 0.01);
            if (!hasDarkness) {
                if (overlay && overlay.mask === this._lightMaskBM) overlay.clearMask(true);
            } else if (overlay && this._lightMaskBM) {
                // Position mask at player (screen space)
                const cam = this.cameras?.main;
                const p = this.player;
                if (cam && p && this._lightMaskSprite) {
                    const sx = p.x - cam.scrollX;
                    const sy = p.y - cam.scrollY;
                    this._lightMaskSprite.setPosition(sx, sy);

                    // Base radius from player collider/display
                    let baseDiam = 24;
                    const b = p.body;
                    if (b && b.width && b.height) baseDiam = Math.max(b.width, b.height);
                    else baseDiam = Math.max(p.displayWidth || 24, p.displayHeight || 24);

                    const baseRadius = Math.max(8, baseDiam * (this._lightBaseRadiusMult || 1.1));

                    // Edge flicker
                    const tsec = (this.time?.now || 0) * 0.001;
                    const f1 = Math.sin(2 * Math.PI * (this._lightFlickerHz || 6.3) * tsec);
                    const f2 = Math.sin(2 * Math.PI * (this._lightFlickerHz2 || 9.7) * tsec + 1.234);
                    const flicker = 1 + (this._lightFlickerPct || 0.06) * (0.5 * f1 + 0.5 * f2);

                    const diameter = baseRadius * 2 * flicker;
                    const texSize = this._lightTexSize || 192;
                    const scale = diameter / texSize;
                    this._lightMaskSprite.setScale(scale);

                    // Force overlay to use our mask (after lightingSystem)
                    overlay.setMask(this._lightMaskBM);
                }
            }
        } catch {}

        const w = WORLD_GEN.world.width;
        const h = WORLD_GEN.world.height;
        let x = this.player.x;
        let y = this.player.y;
        let wrapped = false;
        if (x < 0) {
            x += w;
            wrapped = true;
        } else if (x >= w) {
            x -= w;
            wrapped = true;
        }
        if (y < 0) {
            y += h;
            wrapped = true;
        } else if (y >= h) {
            y -= h;
            wrapped = true;
        }
        if (wrapped) {
            this.player.setPosition(x, y);
            this.cameras.main.centerOn(x, y);
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
    // LIGHTING (delegated to systems/lightingSystem.js)
    // ==========================
    _initLighting() { return this.lighting.initLighting(); }

    getPlayerLightUpgradeMultiplier() { return this.lighting.getPlayerLightUpgradeMultiplier(); }
    setPlayerLightUpgradeMultiplier(multiplier = 1) { return this.lighting.setPlayerLightUpgradeMultiplier(multiplier); }
    bumpPlayerLightUpgradeMultiplier(multiplier = 1) { return this.lighting.bumpPlayerLightUpgradeMultiplier(multiplier); }
    resetPlayerLightUpgradeMultiplier() { return this.lighting.resetPlayerLightUpgradeMultiplier(); }

    applyLightPipeline(gameObject, options = null) { return this.lighting.applyLightPipeline(gameObject, options); }
    attachLightToObject(target, cfg = {}) { return this.lighting.attachLightToObject(target, cfg); }
    releaseWorldLight(light) { return this.lighting.releaseWorldLight(light); }

    _updateAttachedLights() { return this.lighting._updateAttachedLights(); }
    _updatePlayerLightGlow(delta = 0) { return this.lighting._updatePlayerLightGlow(delta); }
    _ensureNightOverlayMask() { return this.lighting._ensureNightOverlayMask(); }
    _drawNightOverlayMask(lights) { return this.lighting._drawNightOverlayMask(lights); }
    _updateNightOverlayMask() { return this.lighting._updateNightOverlayMask(); }
    _teardownNightOverlayMask() { return this.lighting._teardownNightOverlayMask(); }
    _teardownLights() { return this.lighting._teardownLights(); }

    _ensureLightMaskScratch() { return this.lighting._ensureLightMaskScratch(); }
    _collectActiveMaskLights() { return this.lighting._collectActiveMaskLights(); }
    _getLightMaskGradientDefinition(binding) { return this.lighting._getLightMaskGradientDefinition(binding); }
    _buildLightMaskGradient(tileSize, tileCount) { return this.lighting._buildLightMaskGradient(tileSize, tileCount); }

    updateNightAmbient(strength = 0) { return this.lighting.updateNightAmbient(strength); }

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
