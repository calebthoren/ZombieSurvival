// scenes/TestWorldScene.js
// Test world with organized resource layout and checkered floor for hitbox testing

import { RESOURCE_DB, RESOURCE_IDS } from '../data/resourceDatabase.js';
import { WORLD_GEN } from '../systems/world_gen/worldGenConfig.js';
import DevTools from '../systems/DevTools.js';
import createResourceSystem from '../systems/resourceSystem.js';
import createCombatSystem from '../systems/combatSystem.js';
import createInputSystem from '../systems/inputSystem.js';
import createDayNightSystem from '../systems/world_gen/dayNightSystem.js';
import createLightingSystem from '../systems/lightingSystem.js';
import { ITEM_DB } from '../data/itemDatabase.js';

export default class TestWorldScene extends Phaser.Scene {
    constructor() {
        super('TestWorldScene');

        // Day/Night state
        this.dayIndex = 1;
        this.phase = 'day';
        this.phaseStartTime = 0;
        this.waveNumber = 0;

        // Lighting state (minimal, mirrors MainScene defaults)
        this._lightBindings = [];
        this.lightSettings = {
            player: {
                nightRadius: 96,
                baseRadius: 96,
                flickerAmplitude: 8,
                flickerSpeed: 2.25,
                upgradeMultiplier: 1,
                maskScale: 0.25,
            },
        };
        this._playerLightNightRadius = this.lightSettings.player.nightRadius;
        this._playerLightLevel = 1;

        // Lighting system
        this.lighting = createLightingSystem(this);
        this.lighting.initLighting();
    }

    preload() {
        // Load player sprite
        this.load.image(
            'player',
            'https://labs.phaser.io/assets/sprites/phaser-dude.png',
        );

        // Enemies (match MainScene so DevTools spawner works here too)
        this.load.image('zombie', 'assets/enemies/zombie.png');
        this.load.image('flamed_walker', 'assets/enemies/flamed_walker.png');

        // Weapons & ammo (match MainScene for combat/inventory visuals)
        this.load.image('bullet', 'assets/weapons/bullet.png');
        this.load.image('slingshot', 'assets/weapons/slingshot.png');
        this.load.image('slingshot_rock', 'assets/weapons/slingshot_rock.png');
        this.load.image('crude_bat', 'assets/weapons/crude_bat.png');

        // Load all resource textures from database
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
        // Create checkered floor background
        this.createCheckeredFloor();

        // Set up camera bounds to cover the test area
        const testWorldWidth = 2400;
        const testWorldHeight = 1800;
        this.physics.world.setBounds(0, 0, testWorldWidth, testWorldHeight);
        this.cameras.main.setBounds(0, 0, testWorldWidth, testWorldHeight);

        // Create player
        this.player = this.physics.add
            .sprite(testWorldWidth / 2, testWorldHeight / 2 + 400, 'player') // Position below resources
            .setScale(0.5)
            .setDepth(900)
            .setCollideWorldBounds(true);

        // Lighting: attach player light and ensure overlay
        try {
            const playerLightSettings = this.lightSettings.player;
            this.playerLight = this.attachLightToObject(this.player, {
                radius: playerLightSettings.baseRadius ?? playerLightSettings.nightRadius,
                intensity: 0,
                maskScale: playerLightSettings.maskScale,
                lightLevel: this._playerLightLevel,
            });
            if (this.playerLight) this.playerLight.active = false;
            this.lighting.createOverlayIfNeeded();
        } catch (e) {}

        // Adjust player collider: halve height by removing the top half (match MainScene)
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

        // Set up basic player movement (match MainScene)
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys('W,A,S,D');
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        
        // Set up ESC key exactly like MainScene does
        this.input.keyboard.on('keydown-ESC', this._onEsc, this);
        
        // Clean up ESC key listener on scene shutdown/destroy
        const cleanupEsc = () => {
            this.input.keyboard.off('keydown-ESC', this._onEsc, this);
        };
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupEsc);
        this.events.once(Phaser.Scenes.Events.DESTROY, cleanupEsc);

        // Launch UI (inventory, HUD) like MainScene
        this.scene.stop('UIScene');
        this.scene.launch('UIScene', { playerData: { health: 100, stamina: 100, ammo: 0 } });
        this.uiScene = this.scene.get('UIScene');
        // Ensure UI scene is active and can receive keyboard input (TAB to toggle inventory)
        try {
            this.uiScene.scene.setActive(true);
            this.uiScene.scene.setVisible(true);
            if (this.scene.isPaused('UIScene')) this.scene.resume('UIScene');
            // Ensure UI receives keyboard input (TAB toggle)
            if (this.uiScene.input) {
                this.uiScene.input.enabled = true;
                if (this.uiScene.input.keyboard) this.uiScene.input.keyboard.enabled = true;
            }
            // Make sure UI draws above gameplay
            this.scene.bringToTop('UIScene');
        } catch (e) {}

        // Health + Stamina state (match MainScene behavior expected by combatSystem)
        this.health = 100; // Ensure health exists so damage isn’t treated as 0 → one‑shot
        this.uiScene?.updateHealth?.(this.health);
        this.staminaMax = 100;
        this.stamina = this.staminaMax;
        this._lastStaminaSpendTime = 0; // regen delay start
        this._staminaRegenDelayMs = 1000; // 1s after last spend
        this._staminaRegenPerSec = 1; // +1 per sec
        this._sprintDrainPerSec = 2; // match MainScene drain rate
        this._isSprinting = false;
        this.uiScene?.updateStamina?.(this.stamina);

        // Define stamina methods BEFORE creating combat system (required by combatSystem)
        this.spendStamina = function(amount) {
            if (!amount || amount <= 0) return 0;
            const spend = Math.min(this.stamina, amount);
            if (spend > 0) {
                this.stamina -= spend;
                this._lastStaminaSpendTime = this.time.now || 0;
                this.uiScene?.updateStamina?.(this.stamina);
            }
            return spend;
        }.bind(this);

        this.hasStamina = function(amount) {
            return this.stamina >= (amount || 0.0001);
        }.bind(this);

        this.regenStamina = function(deltaMs = 16) {
            if (this._isSprinting || this.isCharging) return;
            const now = this.time.now || 0;
            if (now - (this._lastStaminaSpendTime || 0) < (this._staminaRegenDelayMs || 1000)) return;
            const add = (this._staminaRegenPerSec || 0) * (deltaMs / 1000);
            if (add > 0) {
                this.stamina = Math.min(this.staminaMax || 100, this.stamina + add);
                this.uiScene?.updateStamina?.(this.stamina);
            }
        }.bind(this);

        // Initialize resource system like MainScene does
        this.resourceSystem = createResourceSystem(this);

        // Day/Night system + start at day
        this.dayNight = createDayNightSystem(this);
        try { this.dayNight.startDay(); } catch (e) {}
        // Update the UI clock periodically
        this.time.addEvent({ delay: 250, loop: true, callback: () => { try { this.dayNight.updateTimeUi(); } catch (e) {} } });
        
        // Create resource groups exactly like MainScene
        // Split resources:
        // - resources: static physics (AABBs) for blocking/bush where rect is fine
        // - resourcesDyn: dynamic immovable physics for circular bodies (rocks with circle colliders)
        // - resourcesDecor: non-physics collectibles
        this.resources = this.physics.add.staticGroup();
        this.resourcesDyn = this.physics.add.group();
        this.resourcesDecor = this.add.group();
        
        
        // Ensure DevTools compatibility - create empty groups for other expected resources
        // Ensure DevTools compatibility - create empty groups for other expected resources
        this.zombies = this.physics.add.group(); // For enemy hitboxes
        this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 32 }); // For projectile hitboxes
        this.meleeHits = this.physics.add.group(); // For melee hitboxes

        // Hook up combat + input like MainScene
        this.combat = createCombatSystem(this);
        this.inputSystem = createInputSystem(this);
        this.input.on('pointerdown', this.onPointerDown, this);
        this.input.on('pointerup', this.onPointerUp, this);

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

        // Wire dev spawn events so DevUI/console target the active scene
        if (this.game && this.game.events) {
            this.game.events.on('dev:spawn-zombie', ({ type, pos }) => {
                if (this.scene.isActive() || this.scene.isPaused()) {
                    try { this.combat?.spawnZombie(type, pos); } catch (e) {}
                }
            });
            this.game.events.on('dev:drop-item', ({ id, pos }) => {
                if (this.scene.isActive() || this.scene.isPaused()) {
                    try { this.resourceSystem?.spawnWorldItem(id, pos); } catch (e) {}
                }
            });
            this.game.events.on('inv:add', ({ id, qty, where }) => {
                if (this.scene.isActive() || this.scene.isPaused()) {
                    try { this.addItemToInventory?.(id, qty || 1, where || 'inventory'); } catch (e) {}
                }
            });
            // Cleanup listeners when scene shuts down/destroys
            const offAll = () => {
                try {
                    this.game.events.off('dev:spawn-zombie');
                    this.game.events.off('dev:drop-item');
                    this.game.events.off('inv:add');
                } catch (e) {}
            };
            this.events.once(Phaser.Scenes.Events.SHUTDOWN, offAll);
            this.events.once(Phaser.Scenes.Events.DESTROY, offAll);
        }

        // Initialize identical resource/player/zombie overlaps/colliders
        try { this.resourceSystem.ensureColliders(); } catch (e) {}
        
        // Safety: ensure player collision flags are enabled (not invisible mode)
        try {
            const b = this.player?.body;
            if (b) {
                if (b.checkCollision) {
                    b.checkCollision.none = false;
                    b.checkCollision.up = true;
                    b.checkCollision.down = true;
                    b.checkCollision.left = true;
                    b.checkCollision.right = true;
                }
            }
        } catch (e) {}

        // Bullets vs resources (all resources stop bullets when blocking)
        this.physics.add.collider(
            this.bullets,
            this.resources,
            (bullet) => { if (bullet && bullet.destroy) bullet.destroy(); },
            (bullet, res) => !!res.getData('blocking'),
            this,
        );
        this.physics.add.collider(
            this.bullets,
            this.resourcesDyn,
            (bullet) => { if (bullet && bullet.destroy) bullet.destroy(); },
            (bullet, res) => !!res.getData('blocking'),
            this,
        );

        // Zombies vs resources (only blocking ones separate)
        this.physics.add.collider(
            this.zombies,
            this.resources,
            null,
            (zombie, obj) => !!obj.getData('blocking'),
            this,
        );
        this.physics.add.collider(
            this.zombies,
            this.resourcesDyn,
            null,
            (zombie, obj) => !!obj.getData('blocking'),
            this,
        );

        // Mirror MainScene overlaps and bullet collisions
        try {
            this.physics.add.overlap(
                this.player,
                this.zombies,
                (player, zombie) => this.handlePlayerZombieCollision(player, zombie),
                null,
                this,
            );
            this.physics.add.overlap(
                this.bullets,
                this.zombies,
                (bullet, zombie) => this.combat?.handleProjectileHit?.(bullet, zombie),
                null,
                this,
            );
            this.physics.add.overlap(
                this.meleeHits,
                this.zombies,
                (hit, zombie) => this.combat?.handleMeleeHit?.(hit, zombie),
                null,
                this,
            );
            // Ensure bullets also collide with resources to destroy when blocked (already set above, duplicated safely)
        } catch (e) {}
        
        // Layout resources in organized rows by category
        this.layoutResourcesByCategory();

        // Ensure colliders again now that resources exist (some engines binding order can matter)
        try { this.resourceSystem.ensureColliders(); } catch (e) {}
        
        // Set up physics interactions (filtered safety net)
        this.setupPhysicsInteractions();
        
        // Resource collection is handled by pointerdown events on individual resources (like MainScene)

        // Focus camera on the resource area initially
        this.cameras.main.centerOn(testWorldWidth / 2, 300);

        // Removed explicit Return button (available via Pause menu)
        
        // Fix: If PauseScene is already active, stop it and ensure TestWorldScene is unpaused
        if (this.scene.isActive('PauseScene')) {
            this.scene.stop('PauseScene');
        }
        if (this.scene.isPaused()) {
            this.scene.resume();
        }
    }

    createCheckeredFloor() {
        const tileSize = 64;
        const worldWidth = 2400;
        const worldHeight = 1800;
        
        // Create graphics object for the floor
        const floorGraphics = this.add.graphics();
        
        // Colors for the checkered pattern
        const color1 = 0x404040; // Dark gray
        const color2 = 0x808080; // Light gray
        
        // Draw checkered pattern
        for (let x = 0; x < worldWidth; x += tileSize) {
            for (let y = 0; y < worldHeight; y += tileSize) {
                const tileX = Math.floor(x / tileSize);
                const tileY = Math.floor(y / tileSize);
                const isEven = (tileX + tileY) % 2 === 0;
                
                floorGraphics.fillStyle(isEven ? color1 : color2);
                floorGraphics.fillRect(x, y, tileSize, tileSize);
            }
        }
        
        // Set floor to lowest depth
        floorGraphics.setDepth(-1000);
    }

    layoutResourcesByCategory() {
        // Organize resources by category based on tags
        const categories = {
            rocks: [],
            trees: [],
            bushes: [],
            logs: [],
            stumps: [],
            other: []
        };

        // Categorize all resources
        Object.values(RESOURCE_DB).forEach(resource => {
            if (resource.tags.includes('rock')) {
                categories.rocks.push(resource);
            } else if (resource.id.toLowerCase().startsWith('stump')) {
                // Use ID to identify actual stumps (not oak trees with stump tags)
                categories.stumps.push(resource);
            } else if (resource.tags.includes('tree')) {
                if (resource.id.toLowerCase().includes('log')) {
                    categories.logs.push(resource);
                } else {
                    categories.trees.push(resource);
                }
            } else if (resource.tags.includes('bush') || resource.id.toLowerCase().includes('bush')) {
                categories.bushes.push(resource);
            } else {
                categories.other.push(resource);
            }
        });

        // Layout configuration
        const startY = 100;
        const rowSpacing = 150;
        const itemSpacing = 120;
        const maxItemsPerRow = 16; // Reduced to accommodate larger left margin

        let currentY = startY;

        // Layout each category
        Object.entries(categories).forEach(([categoryName, resources]) => {
            if (resources.length === 0) return;

            // Add category label
            this.add.text(50, currentY - 30, categoryName.toUpperCase(), {
                fontSize: '24px',
                fill: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }).setDepth(1000);

            // Layout resources in this category
            let currentRow = 0;
            let itemsInCurrentRow = 0;

            resources.forEach((resource, index) => {
                if (itemsInCurrentRow >= maxItemsPerRow) {
                    currentRow++;
                    itemsInCurrentRow = 0;
                }

                const x = 250 + (itemsInCurrentRow * itemSpacing); // Moved further right from 100 to 250
                const y = currentY + (currentRow * rowSpacing);

                this.createResourceSprite(resource, x, y);
                itemsInCurrentRow++;
            });

            // Move to next category (account for multiple rows)
            const rowsUsed = Math.ceil(resources.length / maxItemsPerRow);
            currentY += (rowsUsed * rowSpacing) + 80; // Extra spacing between categories
        });
    }

    createResourceSprite(resource, x, y) {
        // Use the resource system so hitboxes/sensors match MainScene exactly
        if (!resource || !resource.id) return null;
        const id = resource.id;
        const cfg = { variants: [{ id, weight: 1 }], clusterMin: 1, clusterMax: 1 };
        // Choose group key based on tags
        const tags = Array.isArray(resource.tags) ? resource.tags : [];
        const groupKey = tags.includes('tree') ? 'trees' : (tags.includes('bush') ? 'bushes' : 'rocks');
        let spawned = null;
        try {
            this.resourceSystem.__testSpawnResourceGroup(groupKey, cfg, {
                bounds: { minX: x, maxX: x, minY: y, maxY: y },
                count: 1,
                noRespawn: true,
                // Force spawn at the requested position; ignore density and proximity to ensure the full grid renders
                forceAtPosition: true,
                ignoreProximity: true,
                getDensity: () => 1,
                onCreate: (trunk, createdId) => {
                    spawned = trunk;
                    // DEV-WORLD RULE: small rock variants are NOT collectible for demonstration
                    try {
                        if (/^rock[1-9]a$/i.test(createdId)) {
                            if (typeof trunk.removeAllListeners === 'function') trunk.removeAllListeners('pointerdown');
                            if (typeof trunk.disableInteractive === 'function') trunk.disableInteractive();
                            if (typeof trunk.setData === 'function') trunk.setData('collectible', false);
                        }
                    } catch (e) {}
                },
            });
        } catch (e) {
            console.warn('[TestWorld] spawn failed for resource id', id, e);
        }

        // Add resource name label below the resource for identification
        try {
            const label = this.add.text(x, y + 50, resource.name || resource.id, {
                fontSize: '12px',
                fill: '#ffffff',
                align: 'center',
                stroke: '#000000',
                strokeThickness: 1,
            }).setOrigin(0.5).setDepth(1000);
            // Clean up label if the resource is destroyed
            if (spawned && typeof spawned.once === 'function') {
                spawned.once('destroy', () => { try { label.destroy(); } catch (e) {} });
            }
        } catch (e) {}

        return spawned;
    }

    addReturnButton() {
        // Add a button in the top-left corner to return to main scene
        const button = this.add.rectangle(100, 50, 180, 40, 0x333333, 0.8)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive()
            .setDepth(2000);

        const buttonText = this.add.text(100, 50, 'Return to Game', {
            fontSize: '16px',
            fill: '#ffffff',
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(2001);

        button.on('pointerdown', () => {
            this.returnToMainScene();
        });

        button.on('pointerover', () => {
            button.setFillStyle(0x555555, 0.9);
        });

        button.on('pointerout', () => {
            button.setFillStyle(0x333333, 0.8);
        });
    }

    update(_time, delta = 16) {
        // Don't update if scene is paused (e.g., when DevUIScene is open)
        if (this.scene.isPaused()) {
            return;
        }
        
        // Stamina regen (simple: when not charging)
        // Tick day/night + lighting (parity with MainScene)
        try {
            this.dayNight?.tick?.(delta);
            this.dayNight?.updateNightOverlay?.();
        } catch (e) {}
        try { this.lighting?.update?.(delta); } catch (e) {}

        // Update DevTools hitbox debug (like MainScene does)
        DevTools.tickHitboxDebug(this);
        
        // Simple WASD/Arrow movement for player
        if (this.isCharging) {
            const eq = this.uiScene?.inventory?.getEquipped?.();
            if (!eq || eq.id !== this._chargingItemId) {
                this._cancelCharge?.();
            } else {
                this._tickChargeUi?.();
            }
        }
        if (this.isCharging && this.equippedItemGhost) {
            this._updateEquippedItemGhost?.();
        } else if (!this.isCharging && this.equippedItemGhost) {
            this._destroyEquippedItemGhost?.();
        }
        
        // Movement + sprinting (match MainScene exactly)
        const walkSpeed = 75;
        const sprintMult = 1.5;
        
        // Safety check: ensure player and player body exist
        if (!this.player || !this.player.body) {
            return;
        }
        
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

        // Calculate axis values - opposite keys cancel each other out
        const verticalAxis = (up ? -1 : 0) + (down ? 1 : 0); // W/↑ = -1, S/↓ = +1
        const horizontalAxis = (left ? -1 : 0) + (right ? 1 : 0); // A/← = -1, D/→ = +1

        p.y = verticalAxis * speed;
        p.x = horizontalAxis * speed;
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

        // Give zombies the same simple pursuit logic as MainScene
        const now = this.time.now | 0;
        const kids = this.zombies?.getChildren ? this.zombies.getChildren() : [];
        for (let i = 0; i < kids.length; i++) {
            const zombie = kids[i];
            if (!zombie || !zombie.active) continue;
            const inKnockback = (zombie.knockbackUntil || 0) > now;
            const stunned = (zombie.stunUntil || 0) > now && !inKnockback;
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
            }
            if (zombie.body && zombie.body.velocity) {
                if (zombie.body.velocity.x < 0) zombie.setFlipX(true);
                else if (zombie.body.velocity.x > 0) zombie.setFlipX(false);
            }
            if (zombie.hpBg && zombie.hpFill && this.combat?.updateZombieHpBar) {
                this.combat.updateZombieHpBar(zombie);
            }
        }

        // Make camera follow player when they move significantly
        const distanceToPlayer = Phaser.Math.Distance.Between(
            this.cameras.main.scrollX + this.cameras.main.width / 2,
            this.cameras.main.scrollY + this.cameras.main.height / 2,
            this.player.x,
            this.player.y
        );

        if (distanceToPlayer > 300) {
            this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        }
    }

    returnToMainScene() {
        // Stop this scene and start the main scene
        this.scene.stop('TestWorldScene');
        this.scene.start('MainScene');
    }
    
    setupPhysicsInteractions() {
        // Add filtered player-vs-resource colliders (mirrors MainScene filtering)
        // This is a safety net in case ensureColliders hasn’t bound yet (e.g., hot reload order).
        try {
            if (this.player && this.resources) {
                this.physics.add.collider(
                    this.player,
                    this.resources,
                    null,
                    (player, obj) => !!(obj && obj.getData && obj.getData('blocking')),
                    this,
                );
            }
            if (this.player && this.resourcesDyn) {
                this.physics.add.collider(
                    this.player,
                    this.resourcesDyn,
                    null,
                    (player, obj) => !!(obj && obj.getData && obj.getData('blocking')),
                    this,
                );
            }
        } catch (e) {}
    }
    
    
    _onEsc() {
        // Match MainScene behavior: first let UI consume ESC (closes inventory), otherwise open Pause
        return this.inputSystem?.onEsc?.();
    }
    
    openPauseMenu() {
        // Launch the pause scene as an overlay (let PauseScene handle pausing)
        if (!this.scene.isActive('PauseScene')) {
            this.scene.launch('PauseScene');
        }
    }
    
    // Pointer wrappers to mirror MainScene input + auto-pickup scheduling
    onPointerDown(pointer) {
        if (pointer.button === 2) this._scheduleAutoPickup?.();
        return this.inputSystem?.onPointerDown?.(pointer);
    }

    onPointerUp(pointer) {
        if (pointer.button === 2) this._cancelAutoPickup?.();
        return this.inputSystem?.onPointerUp?.(pointer);
    }

    // Mirror MainScene helper so DevTools can call scene.spawnZombie when available
    spawnZombie(typeKey = 'walker', pos = null) {
        return this.combat?.spawnZombie?.(typeKey, pos);
    }

    // Lighting + day/night wrappers (mirrors MainScene for compatibility)
    applyLightPipeline(obj, cfg = null) { return this.lighting?.applyLightPipeline?.(obj, cfg) || obj; }
    attachLightToObject(target, cfg = {}) { return this.lighting?.attachLightToObject?.(target, cfg); }
    updateNightAmbient(strength = 0) { return this.lighting?.updateNightAmbient?.(strength); }
    getPlayerLightUpgradeMultiplier() { return this.lighting?.getPlayerLightUpgradeMultiplier?.(); }
    getPlayerLightLevel() { return this.lighting?.getPlayerLightLevel?.(); }
    
    // Auto-pause wrapper methods (mirrors MainScene for consistency)
    _autoPause() {
        return this.inputSystem.autoPause();
    }
    
    _resetInputAndStop() {
        return this.inputSystem.resetInputAndStop();
    }
    setPlayerLightLevel(level = 1) { return this.lighting?.setPlayerLightLevel?.(level); }

    // Expose methods used by DevTools and others
    updateNightOverlay() { return this.dayNight?.updateNightOverlay?.(); }
    updateTimeUi() { return this.dayNight?.updateTimeUi?.(); }
    getPhaseElapsed() { return this.dayNight?.getPhaseElapsed?.(); }
    getPhaseDuration() { return this.dayNight?.getPhaseDuration?.(); }

    // Physics callback wrappers mirroring MainScene
    handleMeleeHit(hit, zombie) { return this.combat?.handleMeleeHit?.(hit, zombie); }
    handleProjectileHit(bullet, zombie) { return this.combat?.handleProjectileHit?.(bullet, zombie); }

    // Custom: Dev World player collision — apply damage but do NOT trigger Game Over
    handlePlayerZombieCollision(player, zombie) {
        if (!player || !zombie || !zombie.active) return;
        if (DevTools?.isPlayerInvisible?.() === true) return;
        const now = this.time.now | 0;
        const scale = DevTools.cheats.timeScale || 1;
        const hitCdMs = 500 / Math.max(0.0001, scale);
        if (!zombie.lastHitTime) zombie.lastHitTime = 0;
        if (now - zombie.lastHitTime < hitCdMs) return;
        zombie.lastHitTime = now;
        if (DevTools?.shouldBlockPlayerDamage?.() === true) return;

        const damage = Phaser.Math.Between(5, 10); // same as MainScene
        const cur = (this.health | 0);
        this.health = Math.max(0, cur - damage);
        this.uiScene?.updateHealth?.(this.health);

        // Flash feedback
        try { player?.setTintFill?.(0xffaaaa); this.time.delayedCall(90, () => player?.clearTint?.()); } catch {}
        // NOTE: No Game Over in TestWorld — remain playable at 0 HP
    }

    // ===== Equipped item ghost (match MainScene) =====
    _createEquippedItemGhost(eqOrId) {
        const eq = typeof eqOrId === 'string' ? { id: eqOrId } : eqOrId;
        const def = eq && eq.id ? ITEM_DB?.[eq.id] || null : null;
        const texKey = def?.world?.textureKey || eq?.id || 'slingshot';
        const originX = def?.world?.origin?.x ?? 0.5;
        const originY = def?.world?.origin?.y ?? 0.5;
        const scale = def?.world?.scale ?? 0.5;
        if (this.equippedItemGhost && this.equippedItemGhost.texture && this.equippedItemGhost.texture.key === texKey) {
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
                .setAlpha(1);
        }
        this.equippedItemGhost.setScale(scale).setVisible(true);
        this._equippedGhostItemId = eq?.id || null;
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
        const px = this.player.x, py = this.player.y;
        const aim = Phaser.Math.Angle.Between(px, py, ptr.worldX, ptr.worldY);
        if (isRanged) {
            let radius;
            const mo = wpn.muzzleOffset;
            if (typeof mo === 'number') radius = Math.max(1, mo);
            else if (mo && typeof mo.x === 'number' && typeof mo.y === 'number') radius = Math.max(1, Math.hypot(mo.x, mo.y));
            else if (typeof wpn.ghostRadius === 'number') radius = Math.max(1, wpn.ghostRadius);
            else radius = 18;
            const gx = px + Math.cos(aim) * radius;
            const gy = py + Math.sin(aim) * radius;
            const flipY = gx < px;
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
        if (isMelee) {
            const coneHalf = Phaser.Math.DegToRad((wpn?.coneAngleDeg ?? 90) / 2);
            const startRot = Phaser.Math.Angle.Normalize(aim - coneHalf);
            const baseOffset = Phaser.Math.DegToRad(45);
            const rotWithOffset = startRot + baseOffset;
            this.equippedItemGhost
                .setOrigin(0.1, 0.8)
                .setDepth((this.player?.depth ?? 900) + 1)
                .setPosition(this.player.x, this.player.y)
                .setRotation(rotWithOffset)
                .setFlipX(false)
                .setFlipY(false)
                .setAlpha(1);
            return;
        }
        this.equippedItemGhost
            .setDepth((this.player?.depth ?? 900) + 1)
            .setPosition(px, py)
            .setRotation(0)
            .setFlipX(false)
            .setFlipY(false)
            .setAlpha(1);
    }

    _destroyEquippedItemGhost() {
        if (this.equippedItemGhost) this.equippedItemGhost.setVisible(false);
    }

    // Predictive live charge UI (same logic as MainScene)
    _tickChargeUi() {
        const eq = this.uiScene?.inventory?.getEquipped?.();
        if (!eq) return;

        const item = ITEM_DB?.[eq.id];
        const wpnDef = item?.weapon;
        const ammoDef = item?.ammo;
        const canChargeWpn = wpnDef?.canCharge === true;
        const canChargeAmmo = !!ammoDef && item?.tags?.includes('rock');
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

    // Minimal cancel-charge matching MainScene’s effect for TestWorld
    _cancelCharge() {
        if (!this.isCharging) return;
        this.isCharging = false;
        this._chargingItemId = null;
        this.lastCharge = 0;
        this.uiScene?.events?.emit?.('weapon:chargeEnd');
        this._destroyEquippedItemGhost?.();
    }

    // (Stamina methods moved to create() before combatSystem initialization)

    // Inventory helper (mirrors MainScene.addItemToInventory)
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

    _scheduleAutoPickup() {
        this._cancelAutoPickup();
        this._autoPickupTimer = this.time.delayedCall(1000, () => {
            if (this.isCharging || !this.input.activePointer.rightButtonDown()) return;
            this._autoPickupActive = true;
            this._autoPickupEvent = this.time.addEvent({
                delay: 100,
                loop: true,
                callback: () => this._attemptAutoPickup?.(),
            });
        });
    }

    _cancelAutoPickup() {
        if (this._autoPickupTimer) { this._autoPickupTimer.remove(false); this._autoPickupTimer = null; }
        if (this._autoPickupEvent) { this._autoPickupEvent.remove(false); this._autoPickupEvent = null; }
        this._autoPickupActive = false;
    }

    _pickupItem(item) {
        if (!item) return false;
        const pickupRange = 40;
        const d2 = Phaser.Math.Distance.Squared(this.player.x, this.player.y, item.x, item.y);
        if (d2 > pickupRange * pickupRange) return false;
        const stack = item.getData('stack');
        if (!stack) return false;
        const added = this.addItemToInventory ? this.addItemToInventory(stack.id, stack.count) : 0;
        if (added > 0) {
            if (added >= stack.count) item.destroy();
            else { stack.count -= added; item.setData('stack', stack); }
            return true;
        }
        return false;
    }

    _attemptAutoPickup() {
        if (!this._autoPickupActive) return;
        if (this.isCharging || !this.input.activePointer.rightButtonDown()) { this._cancelAutoPickup(); return; }
        const pickupRange = 40;
        const pickupRangeSq = pickupRange * pickupRange;
        const scanGroups = [this.droppedItems, this.resources, this.resourcesDecor];
        for (const grp of scanGroups) {
            if (!grp || !grp.getChildren) continue;
            const arr = grp.getChildren();
            for (let i = 0; i < arr.length; i++) {
                const obj = arr[i];
                if (!obj.active) continue;
                const dx = this.player.x - obj.x;
                const dy = this.player.y - obj.y;
                const d2 = dx * dx + dy * dy;
                if (d2 > pickupRangeSq) continue;
                if (grp === this.droppedItems) {
                    if (this._pickupItem(obj)) return;
                } else {
                    obj.emit('pointerdown', this._autoPickupPointer);
                    if (!obj.active) return;
                }
            }
        }
    }
}
