// systems/DevTools.js
// Fast, allocation-free debug hitboxes.
// - ~40 Hz: attacks (BLUE), enemies (RED), player (PURPLE)
// - ~10 Hz: resources (YELLOW)
// - Melee cones draw as time-synced thin slices. Batch size (1 or 2) is configurable.

import { ITEM_DB } from '../data/itemDatabase.js';
import { WORLD_GEN, BIOME_IDS } from './world_gen/worldGenConfig.js';
import { getBiome } from './world_gen/biomes/biomeMap.js';

// Helper function to format time as M:SS
function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// Helper function to get formatted day/night clock string
function getPhaseClock(scene) {
    if (!scene) return 'Time: --';
    
    // Get day/night config
    const dayMs = WORLD_GEN.dayNight.dayMs;
    const nightMs = WORLD_GEN.dayNight.nightMs;
    const totalCycle = dayMs + nightMs;
    
    // Get current game time (scaled and pause-aware)
    const currentPhaseMs = scene._phaseElapsedMs || 0;
    const dayIndex = scene.dayIndex || 1;
    const phase = scene.phase || 'day';
    
    if (phase === 'day') {
        const elapsed = formatTime(currentPhaseMs);
        const total = formatTime(dayMs);
        return `Day ${dayIndex} - ${elapsed}/${total}`;
    } else {
        const elapsed = formatTime(currentPhaseMs);
        const total = formatTime(nightMs);
        return `Night ${dayIndex} - ${elapsed}/${total}`;
    }
}

const BIOME_NAMES = {
    [BIOME_IDS.PLAINS]: 'Plains',
    [BIOME_IDS.FOREST]: 'Forest',
    [BIOME_IDS.DESERT]: 'Desert',
};

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
        noDarkness:   false,

        // Debug overlays
        chunkDetails:    false,
        performanceHud:  false,

        // NEW: how many slices to draw per fast tick (1 or 2)
        meleeSliceBatch: 1,

        // Global game speed (0..10, 1 = normal)
        timeScale: 1
    },

    _appliedTimeScale: 1,
    _resourcePoolDebug: false,

    setResourcePoolDebug(value = false) {
        this._resourcePoolDebug = !!value;
    },

    shouldLogResourcePool() {
        return !!this._resourcePoolDebug;
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
    _noDarknessScene: null,

    // Chunk grid & performance HUD
    _chunkGfx: null,
    _chunkText: null,
    _chunkTimer: null,
    _chunkScene: null,
    _perfText: null,
    _perfTimer: null,
    _perfScene: null,

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

    _getItemSpawnPrefs() { return this._itemSpawnPrefs || null; },
    _setItemSpawnPrefs(p) {
        if (!p) return;
        this._itemSpawnPrefs = {
            key:  p.key  || p.selectedKey || p.itemId,
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
        this.cheats.noDarkness     = false;
        this.cheats.chunkDetails   = false;
        this.cheats.performanceHud = false;
        this.cheats.meleeSliceBatch = 1;
        this.cheats.timeScale       = 1;
        this._enemySpawnPrefs = null;
        this._itemSpawnPrefs  = null;
        this._stopChunkDetails();
        this._stopPerformanceHud();
        // Re-apply hitbox visibility immediately (hides layers if they were on)
        try { this.applyHitboxCheat(scene || this._lastScene); } catch {}
        // Reset global game speed
        try { this.setTimeScale(1, (scene || this._lastScene)?.game); } catch {}
        // Restore default night overlay state
        try {
            this.setNoDarkness(false, scene || this._noDarknessScene);
        } catch {}
        if (!scene) {
            this._noDarknessScene = null;
        }
    },

    // Public API: change between 1 or 2 slices per tick at runtime
    setMeleeSliceBatch(n = 1) {
        const v = (n | 0);
        this.cheats.meleeSliceBatch = (v <= 1) ? 1 : 2;
    },

    // Set global game speed (0..10) and apply to all scenes
    setTimeScale(scale = 1, game = null) {
        let v = Number(scale);
        if (!Number.isFinite(v)) v = 1;
        if (v < 0) v = 0;
        if (v > 10) v = 10;
        this.cheats.timeScale = v;

        // Engine treats smaller values as faster; invert so higher is faster
        const applied = (v <= 0) ? 0 : 1 / v;
        const prev = this._appliedTimeScale || 1;
        this._appliedTimeScale = applied;

        const mgr = game?.scene;
        if (mgr && Array.isArray(mgr.scenes)) {
            for (let i = 0; i < mgr.scenes.length; i++) {
                const sc = mgr.scenes[i];
                try {
                    if (sc.time) sc.time.timeScale = applied;
                    if (sc.physics && sc.physics.world) sc.physics.world.timeScale = applied;
                } catch {}
            }
            try { this._rescaleTimers(prev, applied, mgr.scenes); } catch {}
        }
    },

    _rescaleTimers(prev, applied, scenes) {
        if (!Array.isArray(scenes)) return;
        for (let i = 0; i < scenes.length; i++) {
            const sc = scenes[i];
            const clock = sc?.time;
            const now = clock?.now;
            if (typeof now === 'number') {
                // Ranged cooldown
                if (sc._nextRangedReadyTime != null && sc._nextRangedReadyTime > now) {
                    const remaining = sc._nextRangedReadyTime - now;
                    sc._nextRangedReadyTime = now + remaining * (prev / applied);
                }
                // Melee swing cooldown
                if (sc._nextSwingCooldownMs != null && sc._lastSwingEndTime != null) {
                    const duration = sc._nextSwingCooldownMs;
                    const elapsed = now - sc._lastSwingEndTime;
                    const newDuration = duration * (prev / applied);
                    const newElapsed = elapsed * (prev / applied);
                    sc._nextSwingCooldownMs = newDuration;
                    sc._lastSwingEndTime = now - newElapsed;
                }
                // Charging adjustments
                if (sc.isCharging && sc.chargeStart != null) {
                    const elapsed = now - sc.chargeStart;
                    const factor = prev / applied;
                    sc.chargeStart = now - elapsed * factor;
                    if (sc.chargeMaxMs != null) {
                        sc.chargeMaxMs = Math.floor(sc.chargeMaxMs * factor);
                    }
                }
            }
            // UI cooldown overlays
            if (sc._activeCooldowns && sc.time && typeof sc.time.now === 'number') {
                const nowUi = sc.time.now;
                sc._activeCooldowns.forEach((info) => {
                    const duration = info.end - info.start;
                    const elapsed = nowUi - info.start;
                    const newDuration = duration * (prev / applied);
                    const newElapsed = elapsed * (prev / applied);
                    info.start = nowUi - newElapsed;
                    info.end = info.start + newDuration;
                });
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

    // Get unscaled game time in ms (independent of scene timeScale)
    now(scene) {
        const loop = scene?.sys?.game?.loop;
        if (loop && typeof loop.time === 'number') return loop.time;
        return scene?.time?.now || 0;
    },

    // Toggle entry point used by Dev UI
    setShowHitboxes(value, scene) {
        this.cheats.showHitboxes = !!value;
        if (scene) this._lastScene = scene;
        if (this._lastScene) this.applyHitboxCheat(this._lastScene);
    },

    setChunkDetails(value, scene) {
        this.cheats.chunkDetails = !!value;
        if (value) this._startChunkDetails(scene);
        else this._stopChunkDetails();
    },

    setPerformanceHud(value, scene) {
        this.cheats.performanceHud = !!value;
        if (value) this._startPerformanceHud(scene);
        else this._stopPerformanceHud();
    },

    setNoDarkness(value, scene) {
        this.cheats.noDarkness = !!value;
        if (scene) {
            this._noDarknessScene = scene;
        }
        const target = scene || this._noDarknessScene;
        if (!target) return;
        try {
            if (typeof target.updateNightOverlay === 'function') {
                target.updateNightOverlay();
            } else if (target.dayNight && typeof target.dayNight.updateNightOverlay === 'function') {
                target.dayNight.updateNightOverlay();
            }
        } catch {}
    },

    _overlayBaseY(scene) {
        const ui = scene?.uiScene;
        if (ui && ui.staminaBarY != null && ui.staminaBarHeight != null) {
            return ui.staminaBarY + ui.staminaBarHeight + 4;
        }
        return 60; // fallback below top HUD
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
    // Chunk details overlay
    // ─────────────────────────────────────────────────────────────
    _startChunkDetails(scene) {
        if (!scene) return;
        if (this._chunkScene && this._chunkScene !== scene) this._stopChunkDetails();
        this._chunkScene = scene;
        if (!this._chunkGfx) {
            this._chunkGfx = scene.add.graphics().setDepth(998);
        }
        const baseY = this._overlayBaseY(scene);
        if (!this._chunkText) {
            this._chunkText = scene.add.text(4, baseY, '', { fontSize: '12px', color: '#0f0' })
                .setScrollFactor(0)
                .setDepth(999);
        } else {
            this._chunkText.setY(baseY);
        }
        if (this._perfText) {
            this._perfText.setY(baseY + 14);
        }
        if (!this._chunkTimer) {
            this._chunkTimer = scene.time.addEvent({ delay: 250, loop: true, callback: () => { this._drawChunkDetails(scene); } });
        }
        // Draw once immediately so overlay toggles even when the game is paused
        this._drawChunkDetails(scene);
    },

    _stopChunkDetails() {
        const scene = this._chunkScene || this._perfScene;
        if (this._chunkTimer) { try { this._chunkTimer.remove(); } catch {} }
        if (this._chunkGfx) { try { this._chunkGfx.destroy(); } catch {} }
        if (this._chunkText) { try { this._chunkText.destroy(); } catch {} }
        this._chunkTimer = null;
        this._chunkGfx = null;
        this._chunkText = null;
        this._chunkScene = null;
        if (this._perfText && scene) {
            this._perfText.setY(this._overlayBaseY(scene));
        }
    },

    _drawChunkDetails(scene) {
        const g = this._chunkGfx;
        if (!g || !scene) return;
        const cm = scene.chunkManager;
        const size = WORLD_GEN.chunk.size;
        const cam = scene.cameras?.main;
        const view = cam?.worldView;
        if (!view) return;
        g.clear();
        const color = 0x00ffff;
        const thin = 1;

        const edgeColor = 0x0000aa;
        const edgeThick = 4;
        const startX = Math.floor(view.x / size);
        const endX = Math.floor(view.right / size);
        const startY = Math.floor(view.y / size);
        const endY = Math.floor(view.bottom / size);
        const cols = Math.max(1, Math.floor(WORLD_GEN.world.width / size));
        const rows = Math.max(1, Math.floor(WORLD_GEN.world.height / size));
        for (let cx = startX; cx <= endX; cx++) {
            for (let cy = startY; cy <= endY; cy++) {
                const x = cx * size;
                const y = cy * size;
                // Wrap indices to match ChunkManager keys
                const kx = ((cx % cols) + cols) % cols;
                const ky = ((cy % rows) + rows) % rows;
                g.lineStyle(thin, color, 1);
                g.strokeRect(x, y, size, size);
                if (kx === 0) {
                    g.lineStyle(edgeThick, edgeColor, 1).beginPath();
                    g.moveTo(x, y);
                    g.lineTo(x, y + size);
                    g.strokePath();
                }
                if (ky === 0) {
                    g.lineStyle(edgeThick, edgeColor, 1).beginPath();
                    g.moveTo(x, y);
                    g.lineTo(x + size, y);
                    g.strokePath();
                }
                if (kx === cols - 1) {
                    g.lineStyle(edgeThick, edgeColor, 1).beginPath();
                    g.moveTo(x + size, y);
                    g.lineTo(x + size, y + size);
                    g.strokePath();
                }
                if (ky === rows - 1) {
                    g.lineStyle(edgeThick, edgeColor, 1).beginPath();
                    g.moveTo(x, y + size);
                    g.lineTo(x + size, y + size);
                    g.strokePath();
                }
            }
        }
        const player = scene.player;
        const pcx = Math.floor((player?.x || 0) / size);
        const pcy = Math.floor((player?.y || 0) / size);
        const loaded = cm?.loadedChunks?.size || 0;
        const biomeId = getBiome(pcx, pcy);
        const name = BIOME_NAMES[biomeId] || 'Unknown';
        if (this._chunkText) {
            this._chunkText.setText(`Chunk (${pcx},${pcy}) loaded: ${loaded} Biome: ${name}`);
        }
        // Lightly mark the player's current chunk
        const px = pcx * size;
        const py = pcy * size;
        g.fillStyle(0x00ff00, 0.1).fillRect(px, py, size, size);
    },

    // ─────────────────────────────────────────────────────────────
    // Performance HUD
    // ─────────────────────────────────────────────────────────────
    _startPerformanceHud(scene) {
        if (!scene) return;
        if (this._perfScene && this._perfScene !== scene) this._stopPerformanceHud();
        this._perfScene = scene;
        const baseY = this._overlayBaseY(scene);
        const perfY = this._chunkText ? baseY + 14 : baseY;
        if (!this._perfText) {
            this._perfText = scene.add.text(4, perfY, '', { fontSize: '12px', color: '#0f0' })
                .setScrollFactor(0)
                .setDepth(999);
        } else {
            this._perfText.setY(perfY);
        }
        if (!this._perfTimer) {
            this._perfTimer = scene.time.addEvent({ delay: 500, loop: true, callback: () => { this._drawPerformanceHud(scene); } });
        }
        // Draw once immediately so overlay toggles even when the game is paused
        this._drawPerformanceHud(scene);
    },

    _stopPerformanceHud() {
        if (this._perfTimer) { try { this._perfTimer.remove(); } catch {} }
        if (this._perfText) { try { this._perfText.destroy(); } catch {} }
        this._perfTimer = null;
        this._perfText = null;
        this._perfScene = null;
    },

    _drawPerformanceHud(scene) {
        if (!this._perfText || !scene) return;
        const fps = Math.round(scene.game?.loop?.actualFps || 0);
        const heap = performance?.memory?.usedJSHeapSize ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0;
        const timers = scene.time?.events?.size || 0;
        const clockStr = getPhaseClock(scene);
        this._perfText.setText(`FPS: ${fps}\nHeap: ${heap}MB\nTimers: ${timers}\n${clockStr}`);
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

        // Create pooled graphics above night overlay and world sprites
        this._gfx.resources = scene.add.graphics().setDepth(10001).setVisible(false);
        this._gfx.enemies   = scene.add.graphics().setDepth(10002).setVisible(false);
        this._gfx.attacks   = scene.add.graphics().setDepth(10003).setVisible(false);
        this._gfx.player    = scene.add.graphics().setDepth(10004).setVisible(false);

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
        const lists = [];
        if (scene.resources && scene.resources.getChildren) lists.push(scene.resources.getChildren());
        if (scene.resourcesDyn && scene.resourcesDyn.getChildren) lists.push(scene.resourcesDyn.getChildren());
        if (scene.resourcesDecor && scene.resourcesDecor.getChildren) lists.push(scene.resourcesDecor.getChildren());

        for (const list of lists) {
            for (let i = 0; i < list.length; i++) {
                const obj = list[i];
                if (!obj || !obj.active || !obj.visible) continue;
                if (obj.getData && obj.getData('noHitboxDebug')) continue;
                const body = obj.body;
                if (body) {
                    if (body.isCircle) {
                        const cx = (body.x ?? 0) + (body.halfWidth ?? (body.width || 0) / 2);
                        const cy = (body.y ?? 0) + (body.halfHeight ?? (body.height || 0) / 2);
                        const r = body.halfWidth ?? (body.width || 0) / 2;
                        g.fillCircle(cx, cy, r);
                        g.strokeCircle(cx, cy, r);
                    } else {
                        const x = body.x ?? (obj.x - (body.width || obj.displayWidth) * (obj.originX || 0.5));
                        const y = body.y ?? (obj.y - (body.height || obj.displayHeight) * (obj.originY || 0.5));
                        const w = body.width ?? obj.displayWidth;
                        const h = body.height ?? obj.displayHeight;
                        g.fillRect(x, y, w, h);
                        g.strokeRect(x, y, w, h);
                    }
                } else {
                    // Non-physics decor: approximate using display bounds
                    const b = obj.getBounds ? obj.getBounds() : null;
                    if (!b) continue;
                    g.fillRect(b.x, b.y, b.width, b.height);
                    g.strokeRect(b.x, b.y, b.width, b.height);
                }
            }
        }

        // Draw green sensor columns used for canopy transparency (if present)
        try {
            const sensors = scene._treeLeaves;
            if (Array.isArray(sensors) && sensors.length > 0) {
                g.lineStyle(2, 0x00ff00, 1);
                for (let i = 0; i < sensors.length; i++) {
                    const d = sensors[i];
                    const r = d && d.rect;
                    if (!r) continue;
                    g.strokeRect(r.x, r.y, r.width, r.height);
                }
            }
        } catch {}
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
        const max = ITEM_DB[id]?.maxStack || 1;
        qty = Math.max(1, Math.min(qty | 0, max));
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
