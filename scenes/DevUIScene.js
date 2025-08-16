// scenes/DevUIScene.js
import DevTools from '../systems/DevTools.js';
import * as ZOMBIES_DB from '../data/zombieDatabase.js';
import * as ITEMS_DB from '../data/itemDatabase.js';

// Normalize to support both default and named exports
const ZDB = (ZOMBIES_DB && 'default' in ZOMBIES_DB) ? ZOMBIES_DB.default : ZOMBIES_DB;
const IDB = (ITEMS_DB && 'default' in ITEMS_DB) ? ITEMS_DB.default : ITEMS_DB;

const UI = {
    pad: 10,
    rowH: 44,
    font: { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' },
    dim: { fontFamily: 'monospace', fontSize: '16px', color: '#aaaaaa' },
    title: { fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' },
    bgColor: 0x000000,
    bgAlpha: 0.6,
    cardColor: 0x111111,
    cardAlpha: 0.9,
    btnColor: 0x333333,
    btnHover: 0x555555,
    okColor: 0x2e7d32,
    warnColor: 0xb71c1c,
};

export default class DevUIScene extends Phaser.Scene {
    constructor() { super({ key: 'DevUIScene' }); }

    init(data) {
        this._rows = [];
        this._scroll = 0;
        this._editing = null;  // which input is being edited
        this._enemy = {
            list: this._zombieKeys(),
            ix: 0,
            count: '1', // string so user can backspace to empty; defaults to 1 when parsed
        };
    }

    create() {
        const camW = this.scale.width, camH = this.scale.height;

        // Dimmed full-screen backdrop
        this.add.rectangle(0, 0, camW, camH, UI.bgColor, UI.bgAlpha)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(0);
        
        // --- Lock inputs in underlying scenes while DevUI is open ---
        this._lockedScenes = [];
        const main = this.scene.get('MainScene');
        const ui = this.scene.get('UIScene');
        for (const s of [main, ui]) {
            if (s && s.input) {
                // Remember prior state so we can restore exactly
                this._lockedScenes.push({
                    scene: s,
                    wasInputEnabled: s.input.enabled !== false,
                    wasKeyboardEnabled: s.input.keyboard ? s.input.keyboard.enabled !== false : null
                });
                s.input.enabled = false;
                if (s.input.keyboard) s.input.keyboard.enabled = false;
            }
        }
        // Ensure we always restore on shutdown, even if closed indirectly
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._unlockScenes());

        // Header bar
        this.add.rectangle(0, 0, camW, 54, UI.cardColor, UI.cardAlpha)
            .setOrigin(0, 0).setDepth(1);
        this.add.text(UI.pad, 12, 'Dev Tools', UI.title).setDepth(2);

        // Back button
        this._makeButton(camW - 160, 10, 150, 30, '◀ Return', () => this._goBack(), 2);

        // Scroll instructions
        this.add.text(UI.pad, camH - 24, 'Scroll: Mouse Wheel • Edit numbers: click value, type digits, Enter to apply', UI.dim).setDepth(2);

        // Content root (we position rows inside this container and move it when scrolling)
        this.content = this.add.container(0, 54).setDepth(1);

        let y = 0;
        y = this._sectionTitle('Flags', y);
        y = this._rowToggle('Show Hitboxes', () => DevTools.flags.showHitboxes, v => DevTools.setShowHitboxes(v), y);
        y = this._rowToggle('Invincible', () => DevTools.flags.invincible, v => DevTools.flags.invincible = v, y);
        y = this._rowToggle('Invisible', () => DevTools.flags.invisible, v => DevTools.flags.invisible = v, y);
        y = this._rowToggle('Don’t Use Ammo', () => DevTools.flags.noAmmo, v => DevTools.flags.noAmmo = v, y);
        y = this._rowToggle('Don’t Use Stamina', () => DevTools.flags.noStamina, v => DevTools.flags.noStamina = v, y);
        y = this._rowToggle('No Cooldown', () => DevTools.flags.noCooldown, v => DevTools.flags.noCooldown = v, y);

        y = this._sectionTitle('Spawners', y);
        y = this._enemySpawnerRow(y);

        // Input handling for number editing
        this.input.keyboard.on('keydown', (ev) => this._onKey(ev));

        // Mouse wheel scroll
        this.input.on('wheel', (_p, _dx, dy) => this._scrollBy(dy));

        // Make sure hitbox render reacts immediately
        DevTools.applyHitboxFlag(this.scene.get('MainScene'));
    }

    // ---------- UI builders ----------

    _sectionTitle(text, y) {
        const lbl = this.add.text(UI.pad, y + 12, text, UI.title).setDepth(2);
        this.content.add(lbl);
        const line = this.add.rectangle(UI.pad, y + 38, this.scale.width - UI.pad * 2, 2, 0xffffff, 0.2)
            .setOrigin(0, 0.5).setDepth(1);
        this.content.add(line);
        return y + UI.rowH;
    }

    _rowToggle(label, get, set, y) {
        const card = this._card(y);
        const txt = this.add.text(UI.pad + 6, y + 12, label, UI.font).setDepth(2);
        const btn = this._makeToggle(this.scale.width - 130, y + 7, 110, 30, get(), (v) => {
            set(v);
            // reflect immediately
            btn._setState(get());
        });
        this.content.add([card, txt, btn]);
        return y + UI.rowH;
    }

    _enemySpawnerRow(y) {
        const card = this._card(y);
        const label = this.add.text(UI.pad + 6, y + 12, 'Spawn Enemy', UI.font).setDepth(2);

        // Enemy type selector (◀ name ▶)
        const typeX = 170, wBtn = 26, hBtn = 26;
        const left = this._makeButton(typeX, y + 9, wBtn, hBtn, '◀', () => this._cycleEnemy(-1), 2);
        const right = this._makeButton(typeX + 220, y + 9, wBtn, hBtn, '▶', () => this._cycleEnemy(1), 2);
        this._enemyName = this.add.text(typeX + 32, y + 12, this._enemy.list[this._enemy.ix], UI.font).setDepth(2);

        // Count controls: [-] [value editable] [+]
        const countLabel = this.add.text(typeX + 270, y + 12, 'Count:', UI.font).setDepth(2);
        const minus = this._makeButton(typeX + 330, y + 9, 26, 26, '–', () => this._bumpCount(-1), 2);
        this._countText = this._makeEditableBox(typeX + 360, y + 9, 60, 26, () => this._enemy.count, (s) => { this._enemy.count = s; });
        const plus = this._makeButton(typeX + 424, y + 9, 26, 26, '+', () => this._bumpCount(1), 2);

        // Spawn button
        const spawn = this._makeButton(this.scale.width - 140, y + 7, 120, 30, 'Spawn', () => this._spawnEnemies(), 2, UI.okColor);

        this.content.add([card, label, left, right, this._enemyName, countLabel, minus, this._countText.box, plus, spawn]);
        return y + UI.rowH;
    }

    _card(y) {
        const r = this.add.rectangle(UI.pad, y + 4, this.scale.width - UI.pad * 2, UI.rowH - 8, UI.cardColor, UI.cardAlpha)
            .setOrigin(0, 0);
        return r;
    }

    _makeButton(x, y, w, h, text, onClick, depth = 1, fillColor = UI.btnColor) {
        const r = this.add.rectangle(x, y, w, h, fillColor, 1).setOrigin(0, 0).setDepth(depth).setInteractive({ useHandCursor: true });
        const t = this.add.text(x + 8, y + 6, text, UI.font).setDepth(depth + 1);
        r.on('pointerover', () => r.setFillStyle(UI.btnHover, 1));
        r.on('pointerout', () => r.setFillStyle(fillColor, 1));
        r.on('pointerdown', () => onClick && onClick());
        // group for easy add to container
        const c = this.add.container(0, 0, [r, t]);
        c.setDepth(depth);
        c.setSize(w, h);
        c.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
        c._rect = r;
        return c;
    }

    _makeToggle(x, y, w, h, state, onToggle) {
        const baseOn  = UI.okColor;  // green
        const baseOff = UI.btnColor; // gray

        const rect = this.add.rectangle(x, y, w, h, state ? baseOn : baseOff, 1)
            .setOrigin(0, 0)
            .setDepth(2)
            .setInteractive({ useHandCursor: true });

        const label = this.add.text(x + 8, y + 6, state ? 'ON' : 'OFF', UI.font).setDepth(3);
        const c = this.add.container(0, 0, [rect, label]).setDepth(2);

        const applyColor = (isOn) => {
            rect.setFillStyle(isOn ? baseOn : baseOff, 1);
            label.setText(isOn ? 'ON' : 'OFF');
        };

        // Lightweight lighten on hover: blend current fill toward white
        const lighten = (colorInt, amt = 0.18) => {
            const col = Phaser.Display.Color.IntegerToColor(colorInt);
            const r = Math.round(Phaser.Math.Linear(col.red,   255, amt));
            const g = Math.round(Phaser.Math.Linear(col.green, 255, amt));
            const b = Math.round(Phaser.Math.Linear(col.blue,  255, amt));
            return Phaser.Display.Color.GetColor(r, g, b);
        };

        c._setState = (s) => {
            state = !!s;
            applyColor(state);
        };

        rect.on('pointerover', () => {
            rect.setFillStyle(lighten(rect.fillColor));
        });

        rect.on('pointerout', () => {
            // restore exact color for current state (keeps ON = green)
            applyColor(state);
        });

        rect.on('pointerdown', () => {
            state = !state;
            applyColor(state);
            if (onToggle) onToggle(state);
        });

        // Initialize once
        applyColor(state);
        return c;
    }

    _makeEditableBox(x, y, w, h, getText, setText) {
        // Visual box
        const rect = this.add.rectangle(x, y, w, h, 0x000000, 0.4)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.6)
            .setDepth(2)
            .setInteractive({ useHandCursor: true });
        const txt = this.add.text(x + 6, y + 5, getText(), UI.font).setDepth(3);

        const box = this.add.container(0, 0, [rect, txt]);
        box.setDepth(2);

        let api; // we'll assign after functions so they can capture it

        const startEdit = () => {
            // If another field is active, commit & exit it first
            if (this._editing && this._editing !== api && this._editing.stopEdit) {
                this._editing.stopEdit(true);
            }
            // Highlight + mark as current editor
            rect.setFillStyle(0xffff00, 0.25);
            rect.setStrokeStyle(2, 0xffff00, 1);
            txt.setColor('#fff176'); // light yellow
            this._editing = api;
        };

        const stopEdit = (apply = true) => {
            // Only stop if this box is the active one
            if (this._editing !== api) return;

            // Restore visuals
            rect.setFillStyle(0x000000, 0.4);
            rect.setStrokeStyle(1, 0xffffff, 0.6);
            txt.setColor(UI.font.color);

            if (apply) {
                let val = txt.text.trim();
                if (val === '') {
                    val = '1'; // default if empty
                }
                txt.setText(val);
                setText(val);
            } else {
                txt.setText(getText()); // revert visuals
            }

            // Fully exit edit mode
            this._editing = null;
        };

        // Click to start editing
        rect.on('pointerdown', startEdit);
        txt.on('pointerdown', startEdit);

        // Click outside → apply & exit
        this.input.on('pointerdown', (_p, objs) => {
            if (this._editing === api) {
                if (!objs.includes(rect) && !objs.includes(txt)) {
                    stopEdit(true);
                }
            }
        });

        // API object (exposed + stored in this._editing)
        api = {
            box,
            txt,
            rect,
            startEdit,
            stopEdit,
            set: (s) => { txt.setText(s); setText(s); },
            get: () => txt.text
        };

        return api;
    }

    // ---------- logic ----------

    _cycleEnemy(dir) {
        const n = this._enemy.list.length;
        this._enemy.ix = (this._enemy.ix + dir + n) % n;
        this._enemyName.setText(this._enemy.list[this._enemy.ix]);
    }

    _bumpCount(delta) {
        const val = this._enemy.count.trim() === '' ? 1 : parseInt(this._enemy.count, 10) || 1;
        let next = Phaser.Math.Clamp(val + delta, 1, 999);
        this._enemy.count = String(next);
        if (this._countText) this._countText.set(this._enemy.count);
    }

    _spawnEnemies() {
        // 1) If you're editing ANY field, commit & exit edit mode now (removes highlight)
        if (this._editing && this._editing.stopEdit) {
            this._editing.stopEdit(true);
        }

        // 2) Read the live text directly from the count field (not a cached value)
        let raw = '1';
        if (this._countText && this._countText.txt && typeof this._countText.txt.text === 'string') {
            raw = this._countText.txt.text.trim();
        } else {
            raw = String(this._enemy.count || '').trim();
        }

        // 3) Default / clamp to 1–999
        if (raw === '') raw = '1';
        let count = parseInt(raw, 10);
        if (!Number.isFinite(count) || count <= 0) count = 1;
        count = Phaser.Math.Clamp(count, 1, 999);

        // 4) Keep model + UI in sync and ensure the field is NOT highlighted
        this._enemy.count = String(count);
        if (this._countText && this._countText.set) {
            this._countText.set(this._enemy.count); // updates text (no highlight)
        }

        // 5) Spawn using DevTools helper (guarantees N spawns)
        const type = this._enemy.list[this._enemy.ix];
        const main = this.scene.get('MainScene');
        if (!main) return;

        // Centralized helper: loops internally and calls scene.spawnZombie()
        DevTools.spawnEnemiesAtScreenEdge(main, type, count);
    }

    _goBack() {
        // Restore inputs before switching scenes
        this._unlockScenes();

        // Re-open PauseScene (MainScene remains paused)
        if (!this.scene.isActive('PauseScene')) {
            this.scene.launch('PauseScene', { from: 'DevUI' });
        }
        this.scene.stop();
    }

    _unlockScenes() {
        if (!this._lockedScenes) return;
        for (const info of this._lockedScenes) {
            const s = info.scene;
            if (!s || !s.input) continue;
            // Restore exactly what we captured
            s.input.enabled = !!info.wasInputEnabled;
            if (s.input.keyboard != null && info.wasKeyboardEnabled != null) {
                s.input.keyboard.enabled = !!info.wasKeyboardEnabled;
            }
        }
        this._lockedScenes.length = 0;
    }

    _onKey(ev) {
        // ESC = back one layer (and cancel any active edit)
        if (ev.key === 'Escape') {
            if (this._editing && this._editing.stopEdit) this._editing.stopEdit(false);
            this._goBack();
            return;
        }

        // ENTER = apply changes AND EXIT edit mode now
        if (ev.key === 'Enter') {
            if (this._editing && this._editing.stopEdit) {
                this._editing.stopEdit(true); // commits + removes highlight
            }
            return; // no longer editing, ignore further typing
        }

        // If not editing, ignore keys
        if (!this._editing) return;

        // Digits & backspace only while editing
        const t = this._editing.txt;
        if (ev.key === 'Backspace') {
            t.setText(t.text.length ? t.text.slice(0, -1) : '');
            return;
        }
        if (/^[0-9]$/.test(ev.key)) {
            if (t.text.length < 3) { // 0–999 (parse later clamps to 1–999)
                t.setText(t.text + ev.key);
            }
        }
    }

    _scrollBy(delta) {
        // simple scroll of the content container
        const viewH = this.scale.height - 54 - 24;
        const totalH = this._estimateContentHeight();
        const maxScroll = Math.max(0, totalH - viewH);
        this._scroll = Phaser.Math.Clamp(this._scroll + delta * 0.3, 0, maxScroll);
        this.content.y = 54 - this._scroll;
    }

    _estimateContentHeight() {
        return this._rows.length * UI.rowH + 2 * UI.rowH; // rough estimate, enough for our fixed rows
    }

    // ---------- data helpers ----------

    _zombieKeys() {
        const DB = ZDB;
        if (Array.isArray(DB)) {
            return DB.map(z => z.id || z.key || z.name).filter(Boolean);
        } else if (DB && typeof DB === 'object') {
            return Object.keys(DB);
        }
        return ['zombie_basic'];
    }

    _itemKeys() {
        const DB = IDB;
        if (Array.isArray(DB)) {
            return DB.map(i => i.id || i.key || i.name).filter(Boolean);
        } else if (DB && typeof DB === 'object') {
            return Object.keys(DB);
        }
        return ['slingshot_rock'];
    }
}
