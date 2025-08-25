// systems/DevTools.js
// Fast, allocation-free debug hitboxes.
// - ~40 Hz: attacks (BLUE), enemies (RED), player (PURPLE)
// - ~10 Hz: resources (YELLOW)
// - Melee cones draw as time-synced thin slices. Batch size (1 or 2) is configurable.

const DevTools = {
    // ─────────────────────────────────────────────────────────────
    // CHEATS (wired from Dev UI)
    // ─────────────────────────────────────────────────────────────
    cheats: {
        showHitboxes: false,
        invisible:    false,
        invincible:   false,
        noAmmo:       false,
        noStamina:    false,
        noCooldown:   false,

        // NEW: how many slices to draw per fast tick (1 or 2)
        meleeSliceBatch: 1,

        // Global time scale (0..10, 1 = normal)
        timeScale: 1
    },

    // ─────────────────────────────────────────────────────────────
    // RENDER CONFIG
    // ─────────────────────────────────────────────────────────────
    _FAST_MS: 25,         // ~40 Hz
    _SLOW_MS: 100,        // ~10 Hz
    _MELEE_SUBDIV: 13,    // total thin wedges across the cone (odd looks good)

    // Pooled graphics layers per scene
    _gfx: { enemies: null, attacks: null, resources: null, player: null },
    _lastFastDraw: 0,
    _lastSlowDraw: 0,
    _lastScene: null,

    // Public helpers used by scenes
    isPlayerInvisible() { return !!this.cheats.invisible; },
    shouldConsumeAmmo() { return !this.cheats.noAmmo; },
    shouldConsumeStamina() { return !this.cheats.noStamina; },

    // gate for player damage (invincible toggle)
    shouldBlockPlayerDamage() { return !!this.cheats.invincible; },

    // simple persistence for Dev UI spawner (lives across DevUI open/close)
    _getEnemySpawnPrefs() { return this._enemySpawnPrefs || null; },
    _setEnemySpawnPrefs(p) {
        if (!p) return;
        // Store minimal fields; keep "count" as string so your number box shows exactly what user typed
        this._enemySpawnPrefs = {
            key:  p.key  || p.selectedKey || p.typeKey,
            name: p.name || p.selectedName,
            count: (p.count == null ? '1' : String(p.count))
        };
    },

    // reset dev toggles to defaults (used on death)
    resetToDefaults(scene = null) {
        this.cheats.showHitboxes   = false;
        this.cheats.invincible     = false;
        this.cheats.invisible      = false;
        this.cheats.noAmmo         = false;
        this.cheats.noStamina      = false;
        this.cheats.noCooldown     = false;
        this.cheats.meleeSliceBatch = 1;
        this.cheats.timeScale       = 1;
        // Re-apply hitbox visibility immediately (hides layers if they were on)
        try { this.applyHitboxCheat(scene || this._lastScene); } catch {}
        // Reset global time scale
        try { this.setTimeScale(1, (scene || this._lastScene)?.game); } catch {}
    },

    // Public API: change between 1 or 2 slices per tick at runtime
    setMeleeSliceBatch(n = 1) {
        const v = (n | 0);
        this.cheats.meleeSliceBatch = (v <= 1) ? 1 : 2;
    },

    // Set global time scale (0..10) and apply to all scenes
    setTimeScale(scale = 1, game = null) {
        let v = Number(scale);
        if (!Number.isFinite(v)) v = 1;
        if (v < 0) v = 0;
        if (v > 10) v = 10;
        this.cheats.timeScale = v;

        // Engine treats smaller values as faster; invert so higher is faster
        const applied = (v <= 0) ? 0 : 1 / v;

        const mgr = game?.scene;
        if (mgr && Array.isArray(mgr.scenes)) {
            for (let i = 0; i < mgr.scenes.length; i++) {
                const sc = mgr.scenes[i];
                try {
                    if (sc.time) sc.time.timeScale = applied;
                    if (sc.physics && sc.physics.world) sc.physics.world.timeScale = applied;
                } catch {}
            }
        }
    },

    applyTimeScale(scene) {
        const v = this.cheats.timeScale;
        const applied = (v <= 0) ? 0 : 1 / v;
        if (!scene) return;
        try {
            if (scene.time) scene.time.timeScale = applied;
            if (scene.physics && scene.physics.world) scene.physics.world.timeScale = applied;
        } catch {}
    },

    // Get scaled time in ms honoring the dev time multiplier
    now(scene) {
        const base = scene?.time?.now || 0;
        const applied = scene?.time?.timeScale || 1;
        const scale = this.cheats.timeScale || 1;
        if (applied <= 0) return base;
        return (base / applied) * scale;
    },

    // Toggle entry point used by Dev UI
    setShowHitboxes(value, scene) {
        this.cheats.showHitboxes = !!value;
        if (scene) this._lastScene = scene;
        if (this._lastScene) this.applyHitboxCheat(this._lastScene);
    },

    applyHitboxCheat(scene) {
        this._ensureLayers(scene);
        const vis = !!this.cheats.showHitboxes;
        this._gfx.enemies.setVisible(vis);
        this._gfx.attacks.setVisible(vis);
        this._gfx.resources.setVisible(vis);
        this._gfx.player.setVisible(vis);

        if (vis) {
            // Immediate redraw so it feels instant
            this._lastFastDraw = 0;
            this._lastSlowDraw = 0;
            this._drawFast(scene);
            this._drawSlow(scene);
        } else {
            this._clearAll();
        }
        this._lastScene = scene;
    },

    // Call this once per frame from MainScene.update()
    tickHitboxDebug(scene) {
        if (!this.cheats.showHitboxes) return;
        this._ensureLayers(scene);

        const now = this.now(scene) | 0;
        if (now - this._lastFastDraw >= this._FAST_MS) {
            this._drawFast(scene);
            this._lastFastDraw = now;
        }
        if (now - this._lastSlowDraw >= this._SLOW_MS) {
            this._drawSlow(scene);
            this._lastSlowDraw = now;
        }
    },

    // ─────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────
    _ensureLayers(scene) {
        if (this._gfx.enemies && this._gfx.enemies.scene === scene) return;

        // Tear down old layers if scene changed
        this._clearAll();
        for (const k of Object.keys(this._gfx)) {
            if (this._gfx[k]) { this._gfx[k].destroy(); this._gfx[k] = null; }
        }

        // Create pooled graphics (drawn above gameplay, below UI)
        this._gfx.resources = scene.add.graphics().setDepth(994).setVisible(false);
        this._gfx.enemies   = scene.add.graphics().setDepth(995).setVisible(false);
        this._gfx.attacks   = scene.add.graphics().setDepth(996).setVisible(false);
        this._gfx.player    = scene.add.graphics().setDepth(997).setVisible(false);

        this._lastScene = scene;
    },

    _clearAll() {
        for (const k of Object.keys(this._gfx)) {
            if (this._gfx[k]) this._gfx[k].clear();
        }
    },

    _drawFast(scene) {
        // ATTACKS (blue), ENEMIES (red), PLAYER (purple)
        this._drawAttacks(scene);
        this._drawEnemies(scene);
        this._drawPlayer(scene);
    },

    _drawSlow(scene) {
        // RESOURCES (yellow with 25% fill)
        this._drawResources(scene);
    },

    _drawEnemies(scene) {
        const g = this._gfx.enemies;
        if (!g) return;
        g.clear().lineStyle(1, 0xff3b30, 1); // red

        const group = scene.zombies;
        if (group && group.children?.iterate) {
            group.children.iterate((z) => {
                if (!z || !z.body) return;
                const b = z.body;
                g.strokeRect(b.x, b.y, b.width, b.height);
            });
        }
    },

    _drawPlayer(scene) {
        const g = this._gfx.player;
        if (!g) return;
        g.clear().lineStyle(1, 0x9b59b6, 1); // purple

        const p = scene.player;
        const b = p && p.body;
        if (!b) return;

        if (b.isCircle) {
            const cx = b.x + b.halfWidth;
            const cy = b.y + b.halfHeight;
            const r  = b.halfWidth;
            g.strokeCircle(cx, cy, r);
        } else {
            g.strokeRect(b.x, b.y, b.width, b.height);
        }
    },

    _drawAttacks(scene) {
        const g = this._gfx.attacks;
        if (!g) return;

        g.clear().lineStyle(1, 0x277fff, 1); // BLUE for all attacks

        // 1) Melee — animated thin slices progressing with real swing time
        const mh = scene.meleeHits;
        if (mh && mh.children?.iterate) {
            const N     = Math.max(1, (this._MELEE_SUBDIV | 0));                 // total slices across cone
            const batch = Math.max(1, (this.cheats.meleeSliceBatch | 0)) > 1 ? 2 : 1; // 1 or 2
            const now   = this.now(scene) | 0;

            mh.children.iterate((hit) => {
                if (!hit || !hit.active) return;

                const ox = hit.getData('originX') ?? scene.player?.x ?? hit.x;
                const oy = hit.getData('originY') ?? scene.player?.y ?? hit.y;
                const aim = hit.getData('aimAngle');
                if (typeof aim !== 'number') return; // no aim yet → draw nothing

                const coneHalf = hit.getData('coneHalfRad') ?? Math.PI / 4;
                const maxRange = hit.getData('maxRange') ?? (hit.body?.halfWidth ?? 30);

                // Time-synced progress 0..1 across the swing duration (matches low-stamina slow swings)
                const startMs = hit.getData('swingStartMs') | 0;
                const durMs   = Math.max(1, hit.getData('swingDurationMs') | 0);
                const t       = Phaser.Math.Clamp((now - startMs) / durMs, 0, 0.9999);

                // Leading slice index from time (no looping)
                const total = 2 * coneHalf;
                const step  = total / N;
                const startAngle = aim - coneHalf;
                const idx = Math.min(N - 1, Math.floor(t * N));

                for (let k = 0; k < batch; k++) {
                    const i = Math.min(N - 1, idx + k);
                    const a0 = startAngle + i * step + 0.0001;
                    const a1 = Math.min(startAngle + (i + 1) * step - 0.0001, aim + coneHalf);

                    g.beginPath();
                    g.moveTo(ox, oy);
                    g.lineTo(ox + Math.cos(a0) * maxRange, oy + Math.sin(a0) * maxRange);
                    g.arc(ox, oy, maxRange, a0, a1);
                    g.lineTo(ox, oy);
                    g.closePath();
                    g.strokePath();
                }
            });
        }

        // 2) Projectiles — simple AABB, also BLUE
        const bullets = scene.bullets;
        if (bullets && bullets.children?.iterate) {
            bullets.children.iterate((p) => {
                if (!p || !p.body) return;
                const b = p.body;
                g.strokeRect(b.x, b.y, b.width, b.height);
            });
        }
    },

    _drawResources(scene) {
        const g = this._gfx.resources;
        if (!g) return;

        g.clear().lineStyle(1, 0xffff00, 1).fillStyle(0xffff00, 0.25); // yellow
        const list = (scene.resources && scene.resources.getChildren) ? scene.resources.getChildren() : [];
        for (let i = 0; i < list.length; i++) {
            const obj = list[i];
            const body = obj && obj.body;
            if (!body) continue;

            if (body.isCircle) {
                const cx = body.x + body.halfWidth;
                const cy = body.y + body.halfHeight;
                const r  = body.halfWidth;
                g.fillCircle(cx, cy, r);
                g.strokeCircle(cx, cy, r);
            } else {
                g.fillRect(body.x, body.y, body.width, body.height);
                g.strokeRect(body.x, body.y, body.width, body.height);
            }
        }
    },

    // Spawn N enemies just outside the current camera view along a random edge,
    // then let MainScene drive them in. Uses scene.spawnZombie(type, pos).
    spawnEnemiesAtScreenEdge(scene, type, count = 1) {
        count = Math.max(1, count | 0);

        const cam = scene.cameras && scene.cameras.main;
        const view = cam ? cam.worldView : new Phaser.Geom.Rectangle(0, 0, scene.scale.width, scene.scale.height);

        const margin = 32; // spawn slightly off-screen
        const pickEdge = () => {
            const side = Phaser.Math.Between(0, 3); // 0=top,1=right,2=bottom,3=left
            switch (side) {
                case 0: return { x: Phaser.Math.Between(view.x, view.right), y: view.y - margin };
                case 1: return { x: view.right + margin, y: Phaser.Math.Between(view.y, view.bottom) };
                case 2: return { x: Phaser.Math.Between(view.x, view.right), y: view.bottom + margin };
                default: return { x: view.x - margin, y: Phaser.Math.Between(view.y, view.bottom) };
            }
        };

        // Stagger slightly so physics doesn’t hiccup when spawning a large number
        for (let i = 0; i < count; i++) {
            const pos = pickEdge();
            scene.time.delayedCall(i * 30, () => {
                if (typeof scene.spawnZombie === 'function') {
                    scene.spawnZombie(type, pos);
                } else if (scene.game && scene.game.events) {
                    scene.game.events.emit('dev:spawn-zombie', { type, pos });
                }
            });
        }
    },

    // Try to add items to inventory; ignore leftovers if inventory is full
    spawnItemsSmart(scene, id, qty = 1) {
        qty = Math.max(1, qty | 0);
        const game = scene?.game;
        if (!game || !game.events) return;

        const reg = scene.registry;
        let prev = 0;
        if (reg) { prev = reg.get('inv:addedCount') | 0; reg.set('inv:addedCount', 0); }

        game.events.emit('inv:add', { id, qty, where: 'inventory' });

        let added = qty;
        if (reg) { added = reg.get('inv:addedCount') | 0; reg.set('inv:addedCount', prev + added); }

        // Ignore leftovers when inventory + hotbar are full
    },

};

export default DevTools;
