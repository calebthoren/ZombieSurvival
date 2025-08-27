// scenes/DevUIScene.js
import DevTools from '../systems/DevTools.js';
import * as ZOMBIES_DB from '../data/zombieDatabase.js';
import * as ITEMS_DB from '../data/itemDatabase.js';

// Normalize to support both default and named exports
const ZDB = (ZOMBIES_DB && 'default' in ZOMBIES_DB) ? ZOMBIES_DB.default : ZOMBIES_DB;
const IDB = (ITEMS_DB && 'default' in ITEMS_DB) ? ITEMS_DB.default : ITEMS_DB;

// Easy to tweak: max dropdown items visible at once (scrollable)
const MAX_DROPDOWN_ITEMS = 8;

const UI = {
    pad: 10,
    rowH: 44,
    font: { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' },
    dim:  { fontFamily: 'monospace', fontSize: '16px', color: '#aaaaaa' },
    title:{ fontFamily: 'monospace', fontSize: '20px', color: '#ffffff' },
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

    init() {
        this._contentHeight = 0; // total height of built rows
        this._scroll = 0;
        this._editing = null;  // currently focused editor API
        this._scrollbarTrack = null;
        this._scrollbarThumb = null;

        // Build zombie index (names for display; keys used to spawn)
        this._zIndex = this._buildZombieIndex();

        const first = this._zIndex.sortedEntries.length
            ? this._zIndex.sortedEntries[0]
            : { key: 'zombie_basic', name: 'Zombie', lower: 'zombie' };

        // Load saved prefs (if any) from DevTools
        const saved = (DevTools._getEnemySpawnPrefs && DevTools._getEnemySpawnPrefs()) || null;

        const startKey       = saved?.key   || first.key;
        const startName      = saved?.name  || first.name;
        const startEnemyCount = (saved?.count != null ? String(saved.count) : '1');

        this._enemy = {
            // selection model
            selectedKey: startKey,
            selectedName: startName,
            lastConfirmedKey: startKey,
            lastConfirmedName: startName,

            // typeahead query + results
            query: startName,                        // box shows current selection initially
            results: this._zIndex.sortedEntries,     // start with full list
            resStart: 0,                             // first visible result index (scroll)
            resHL: 0,                                // highlighted result in view

            // amount model (string so user can blank it)
            count: startEnemyCount,
        };

        // Build item index for inventory spawning
        this._iIndex = this._buildItemIndex();
        const firstItem = this._iIndex.sortedEntries.length
            ? this._iIndex.sortedEntries[0]
            : { key: '', name: '', lower: '', maxStack: 1 };
        const savedItem = (DevTools._getItemSpawnPrefs && DevTools._getItemSpawnPrefs()) || null;
        const startItemKey   = savedItem?.key   || firstItem.key;
        const startItemName  = savedItem?.name  || firstItem.name;
        const entry          = this._iIndex.entries.find(e => e.key === startItemKey) || firstItem;
        const startItemCount = savedItem?.count != null ? String(savedItem.count) : '1';

        this._item = {
            selectedKey: startItemKey,
            selectedName: startItemName,
            lastConfirmedKey: startItemKey,
            lastConfirmedName: startItemName,
            maxStack: entry.maxStack || 1,

            query: startItemName,
            results: this._iIndex.sortedEntries,
            resStart: 0,
            resHL: 0,

            count: startItemCount,
        };

        this._gameSpeed = { scale: String(DevTools.cheats.timeScale || 1) };
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
                this._lockedScenes.push({
                    scene: s,
                    wasInputEnabled: s.input.enabled !== false,
                    wasKeyboardEnabled: s.input.keyboard ? s.input.keyboard.enabled !== false : null
                });
                s.input.enabled = false;
                if (s.input.keyboard) s.input.keyboard.enabled = false;
            }
        }
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this._unlockScenes());

        // Header bar
        this.add.rectangle(0, 0, camW, 54, UI.cardColor, UI.cardAlpha).setOrigin(0, 0).setDepth(1);
        this.add.text(UI.pad, 12, 'Dev Tools', UI.title).setDepth(2);

        // Back button
        this._makeButton(camW - 160, 10, 150, 30, '◀ Return', () => this._goBack(), 2);

        // Content root (clipped so rows can't overlap the header)
        this.content = this.add.container(0, 54).setDepth(1);
        const viewH = this.scale.height - 54;
        const maskRect = this.add.rectangle(0, 54, camW, viewH, 0xffffff)
            .setOrigin(0, 0)
            .setVisible(false);
        this.content.setMask(maskRect.createGeometryMask());
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.content.clearMask(true);
            maskRect.destroy();
        });


        let y = 0;
        y = this._sectionTitle('Cheats', y);
        y = this._rowToggle('Show Hitboxes', () => DevTools.cheats.showHitboxes, v => DevTools.setShowHitboxes(v), y);
        y = this._rowToggle('Invisible',      () => DevTools.cheats.invisible,    v => DevTools.cheats.invisible = v, y);
        y = this._rowToggle('Infinite Health',() => DevTools.cheats.invincible,   v => {
            DevTools.cheats.invincible = v;
            if (v) {
                const mainScene = this.scene.get('MainScene');
                if (mainScene) {
                    const max = (typeof mainScene.maxHealth === 'number' && mainScene.maxHealth > 0) ? mainScene.maxHealth : 100;
                    mainScene.health = max;
                    mainScene.uiScene?.updateHealth?.(mainScene.health);
                }
            }
        }, y);
        y = this._rowToggle('Infinite Stamina',() => DevTools.cheats.noStamina,    v => {
            DevTools.cheats.noStamina = v;
            if (v) {
                const mainScene = this.scene.get('MainScene');
                if (mainScene) {
                    mainScene.stamina = mainScene.staminaMax;
                    mainScene.uiScene?.updateStamina?.(mainScene.stamina);
                }
            }
        }, y);
        y = this._rowToggle('No Cooldown',     () => DevTools.cheats.noCooldown,   v => DevTools.cheats.noCooldown = v, y);
        y = this._rowToggle('Infinite Ammo',   () => DevTools.cheats.noAmmo,       v => DevTools.cheats.noAmmo = v, y);
        y = this._rowToggle('Chunk Details',   () => DevTools.cheats.chunkDetails, v => DevTools.setChunkDetails(v, main), y);
        y = this._rowToggle('Performance HUD', () => DevTools.cheats.performanceHud, v => DevTools.setPerformanceHud(v, main), y);

        y = this._sectionTitle('Spawners', y);
        y = this._enemySpawnerRow(y);
        y = this._itemSpawnerRow(y);

        y = this._sectionTitle('Control', y);
        y = this._gameSpeedRow(y);

        this._contentHeight = y; // record total content height for scrolling
        this._createScrollbar();
        this._scrollBy(0);

        // Keyboard handling
        this.input.keyboard.on('keydown', (ev) => this._onKey(ev));

        // Mouse wheel: page dropdown when pointer over it; otherwise scroll panel
        // Phaser passes (pointer, gameObjects, deltaX, deltaY, deltaZ)
        this.input.on('wheel', (pointer, _objs, _dx, dy) => {
            let consumed = false;
            if (this._typeDD && this._typeDD.visible && this._isPointerInside(pointer, this._typeDDBounds)) {
                consumed = this._scrollDropdownBy(dy);  // enemy dropdown
            } else if (this._itemTypeDD && this._itemTypeDD.visible && this._isPointerInside(pointer, this._itemDDBounds)) {
                consumed = this._scrollItemDropdownBy(dy); // item dropdown
            }
            if (!consumed) this._scrollBy(dy); // otherwise scroll the whole panel
        });

        // Make sure overlays and game speed react immediately
        DevTools.applyHitboxCheat(main);
        DevTools.setChunkDetails(DevTools.cheats.chunkDetails, main);
        DevTools.setPerformanceHud(DevTools.cheats.performanceHud, main);
        DevTools.applyTimeScale(this);
    }

    // ---------- Section builders ----------

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
            btn._setState(get());
        });
        this.content.add([card, txt, btn]);
        return y + UI.rowH;
    }

    _enemySpawnerRow(y) {
        const card = this._card(y);
        const label = this.add.text(UI.pad + 6, y + 12, 'Spawn Enemy', UI.font).setDepth(2);

        // --- Horizontal layout: [ Zombie Type: | input ]  [ Count: [ - ][ value ][ + ] ]  [ Spawn ]
        // Zombie Type label + input
        const typeLabelX = 135;
        const typeLbl = this.add.text(typeLabelX, y + 12, 'Zombie Type:', UI.font).setDepth(2);
        const typeInputX = typeLabelX + typeLbl.displayWidth + 8;
        const typeInputW = 180;

        this._enemyTypeInputX = typeInputX;
        this._makeTypeaheadBox(typeInputX, y + 9, typeInputW, 26);

        // Count controls
        const countLabelX = typeInputX + typeInputW + 18;
        const countLbl = this.add.text(countLabelX, y + 12, 'Amount:', UI.font).setDepth(2);
        const minusX = countLabelX + countLbl.displayWidth + 8;
        const minus = this._makeButton(minusX, y + 9, 26, 26, '–', () => this._bumpCount(-1), 2);
        this._countText = this._makeEditableNumber(minusX + 30, y + 9, 60, 26, () => this._enemy.count, (s) => { this._enemy.count = s; });
        const plus = this._makeButton(minusX + 94, y + 9, 26, 26, '+', () => this._bumpCount(1), 2);
        // Spawn button
        this._spawnBtnX = this.scale.width - 140;
        this._spawnMinusX = minusX;
        const spawn = this._makeButton(this._spawnBtnX, y + 7, 120, 30, 'Spawn', () => this._spawnEnemies(), 2, UI.okColor);

        this.content.add([card, label, typeLbl, this._typeBox.box, minus, this._countText.box, plus, countLbl, spawn]);
        return y + UI.rowH;
    }

    _itemSpawnerRow(y) {
        const card = this._card(y);
        const label = this.add.text(UI.pad + 6, y + 12, 'Spawn Item', UI.font).setDepth(2);

        const typeLabelX = 135;
        const typeLbl = this.add.text(typeLabelX, y + 12, 'Item:', UI.font).setDepth(2);
        const typeInputX = (this._enemyTypeInputX ?? (typeLabelX + typeLbl.displayWidth + 8));
        const typeInputW = 180;

        this._makeItemTypeaheadBox(typeInputX, y + 9, typeInputW, 26);

        const countLabelX = typeInputX + typeInputW + 18;
        const countLbl = this.add.text(countLabelX, y + 12, 'Amount:', UI.font).setDepth(2);
        const minusX = countLabelX + countLbl.displayWidth + 8;
        const minus = this._makeButton(minusX, y + 9, 26, 26, '–', () => this._bumpItemCount(-1), 2);
        this._itemCountText = this._makeEditableNumber(minusX + 30, y + 9, 60, 26, () => this._item.count, (s) => {
            const max = this._item.maxStack || 1;
            let v = s.trim() === '' ? 1 : parseInt(s, 10) || 1;
            v = Phaser.Math.Clamp(v, 1, max);
            this._item.count = String(v);
            DevTools._setItemSpawnPrefs && DevTools._setItemSpawnPrefs({
                key: this._item.selectedKey,
                name: this._item.selectedName,
                count: this._item.count
            });
            return this._item.count;
        });
        const plus = this._makeButton(minusX + 94, y + 9, 26, 26, '+', () => this._bumpItemCount(1), 2);

        const spawn = this._makeButton(this.scale.width - 140, y + 7, 120, 30, 'Spawn', () => this._spawnItems(), 2, UI.okColor);

        this.content.add([card, label, typeLbl, this._itemTypeBox.box, minus, this._itemCountText.box, plus, countLbl, spawn]);
        return y + UI.rowH;
    }

    _gameSpeedRow(y) {
        const card = this._card(y);
        const label = this.add.text(UI.pad + 6, y + 12, 'Game Speed', UI.font).setDepth(2);

        const minusX = this._spawnMinusX ?? (this.scale.width - 220);
        const minus = this._makeButton(minusX, y + 9, 26, 26, '–', () => this._bumpGameSpeed(-0.1), 2);
        this._gameSpeedText = this._makeEditableNumber(minusX + 30, y + 9, 60, 26, () => this._gameSpeed.scale, (s) => { this._gameSpeed.scale = s; this._commitGameSpeed(); });
        const plus = this._makeButton(minusX + 94, y + 9, 26, 26, '+', () => this._bumpGameSpeed(0.1), 2);
        const setX = this._spawnBtnX ?? (this.scale.width - 140);
        const set = this._makeButton(setX, y + 7, 120, 30, 'Set', () => this._commitGameSpeed(), 2, UI.okColor);

        this.content.add([card, label, minus, this._gameSpeedText.box, plus, set]);
        return y + UI.rowH;
    }

    _card(y) {
        const r = this.add.rectangle(UI.pad, y + 4, this.scale.width - UI.pad * 2, UI.rowH - 8, UI.cardColor, UI.cardAlpha).setOrigin(0, 0);
        return r;
    }

    _makeButton(x, y, w, h, text, onClick, depth = 1, fillColor = UI.btnColor) {
        const r = this.add.rectangle(0, 0, w, h, fillColor, 1)
            .setOrigin(0, 0)
            .setDepth(depth)
            .setInteractive({ useHandCursor: true });
        const t = this.add.text(8, 6, text, UI.font).setDepth(depth + 1);
        const c = this.add.container(x, y, [r, t]).setDepth(depth);
        c.setSize(w, h);
        r.on('pointerover', () => r.setFillStyle(UI.btnHover, 1));
        r.on('pointerout', () => r.setFillStyle(fillColor, 1));
        r.on('pointerdown', () => onClick && onClick());
        c._rect = r;
        return c;
    }

    _makeToggle(x, y, w, h, state, onToggle) {
        const baseOn  = UI.okColor;
        const baseOff = UI.btnColor;

        const rect = this.add.rectangle(x, y, w, h, state ? baseOn : baseOff, 1).setOrigin(0, 0).setDepth(2).setInteractive({ useHandCursor: true });
        const label = this.add.text(x + 8, y + 6, state ? 'ON' : 'OFF', UI.font).setDepth(3);
        const c = this.add.container(0, 0, [rect, label]).setDepth(2);

        const applyColor = (isOn) => {
            rect.setFillStyle(isOn ? baseOn : baseOff, 1);
            label.setText(isOn ? 'ON' : 'OFF');
        };

        const lighten = (colorInt, amt = 0.18) => {
            const col = Phaser.Display.Color.IntegerToColor(colorInt);
            const r = Math.round(Phaser.Math.Linear(col.red,   255, amt));
            const g = Math.round(Phaser.Math.Linear(col.green, 255, amt));
            const b = Math.round(Phaser.Math.Linear(col.blue,  255, amt));
            return Phaser.Display.Color.GetColor(r, g, b);
        };

        c._setState = (s) => applyColor(!!s);

        rect.on('pointerover', () => rect.setFillStyle(lighten(rect.fillColor)));
        rect.on('pointerout',  () => applyColor(state));
        rect.on('pointerdown', () => { state = !state; applyColor(state); onToggle && onToggle(state); });

        applyColor(state);
        return c;
    }

    // Number-only editable box (for Amount)
    _makeEditableNumber(x, y, w, h, getText, setText) {
        const rect = this.add.rectangle(x, y, w, h, 0x000000, 0.4).setOrigin(0, 0).setStrokeStyle(1, 0xffffff, 0.6).setDepth(2).setInteractive({ useHandCursor: true });
        const txt  = this.add.text(x + 6, y + 5, getText(), UI.font).setDepth(3);
        const box  = this.add.container(0, 0, [rect, txt]).setDepth(2);

        let api;
        const startEdit = () => {
            if (this._editing && this._editing !== api && this._editing.stopEdit) this._editing.stopEdit(true);
            rect.setFillStyle(0xffff00, 0.25);
            rect.setStrokeStyle(2, 0xffff00, 1);
            txt.setColor('#fff176');
            this._editing = api;
        };
        const stopEdit = (apply = true) => {
            if (this._editing !== api) return;
            rect.setFillStyle(0x000000, 0.4);
            rect.setStrokeStyle(1, 0xffffff, 0.6);
            txt.setColor(UI.font.color);
            if (apply) {
                let val = txt.text.trim();
                if (val === '') val = '1';
                const res = setText(val);
                txt.setText(typeof res === 'string' ? res : val);
            } else {
                txt.setText(getText());
            }
            this._editing = null;
        };

        rect.on('pointerdown', startEdit);
        txt.on('pointerdown', startEdit);

        this.input.on('pointerdown', (_p, objs) => {
            if (this._editing === api && !objs.includes(rect) && !objs.includes(txt)) stopEdit(true);
        });

        api = {
            box, txt, rect,
            startEdit, stopEdit,
            set: (s) => { txt.setText(s); setText(s); },
            get: () => txt.text,
            _kind: 'number'
        };
        return api;
    }

    // Typeahead text box (for Zombie Type)
    _makeTypeaheadBox(x, y, w, h) {
        // Visual input
        const rect = this.add.rectangle(x, y, w, h, 0x000000, 0.4)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.6)
            .setDepth(2)
            .setInteractive({ useHandCursor: true });

        const txt  = this.add.text(x + 6, y + 5, this._enemy.query, UI.font).setDepth(3);

        // Dropdown container (overlaps content) — parented to `content`
        this._typeDD = this.add.container(0, 0).setVisible(false);
        this.content.add(this._typeDD);

        // Baseline "below" metrics (children are created at this Y; we shift the container to flip)
        const listX = x;
        const listYBelow = y + h + 10;           // 10px gap under input
        const listW = w;
        const rowH  = 24;
        const dropH = (rowH * MAX_DROPDOWN_ITEMS) + 8;

        // Keep metrics so we can place below or above at open-time
        this._ddMetrics = { listX, listYBelow, listW, rowH, dropH, inputY: y, inputH: h };

        // Background uses the baseline "below" Y; we'll move the container to flip
        const bg = this.add.rectangle(listX, listYBelow, listW, dropH, 0x000000, 0.92)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.5)
            .setDepth(3);
        this._typeDD.add(bg);

        // Row pool
        this._typeRows = [];
        for (let i = 0; i < MAX_DROPDOWN_ITEMS; i++) {
            const ry = listYBelow + 4 + i * rowH;
            const rowC = this.add.container(listX + 2, ry).setDepth(3);
            const hlRect = this.add.rectangle(0, 0, listW - 4, rowH, 0xffffff, 0.08)
                .setOrigin(0, 0)
                .setDepth(3)
                .setVisible(false);
            const pre = this.add.text(2, 0, '', UI.font).setDepth(4);
            const mid = this.add.text(2, 0, '', { ...UI.font, fontStyle: 'bold' }).setDepth(4);
            const post = this.add.text(2, 0, '', UI.font).setDepth(4);
            rowC.add([hlRect, pre, mid, post]);
            rowC.setSize(listW - 4, rowH);
            this._typeRows.push(rowC);
            this._typeDD.add(rowC);
            rowC.setInteractive(new Phaser.Geom.Rectangle(0, 0, listW - 4, rowH), Phaser.Geom.Rectangle.Contains);
            rowC._hlRect = hlRect; rowC._pre = pre; rowC._mid = mid; rowC._post = post;
            rowC._index = i;

            rowC.on('pointerover', () => {
                this._enemy.resHL = i;
                this._renderDropdown();
            });
            rowC.on('pointerdown', () => {
                const sel = this._visibleDropdownItem(i);
                if (sel) this._confirmTypeSelection(sel.name, true);
            });
        }

        // Bounds used for wheel & outside-click
        this._typeDDBounds = new Phaser.Geom.Rectangle(listX, listYBelow, listW, dropH);

        const api = {
            box: this.add.container(0, 0, [rect, txt]).setDepth(2),
            rect, txt,
            startEdit: () => {
                if (this._editing && this._editing !== api && this._editing.stopEdit) this._editing.stopEdit(true);
                rect.setFillStyle(0xffff00, 0.25);
                rect.setStrokeStyle(2, 0xffff00, 1);
                txt.setColor('#fff176');
                this._editing = api;

                // Open dropdown and refresh results for current query
                this._openDropdown();
            },
            stopEdit: (apply = true) => {
                if (this._editing !== api) return;

                rect.setFillStyle(0x000000, 0.4);
                rect.setStrokeStyle(1, 0xffffff, 0.6);
                txt.setColor(UI.font.color);

                if (apply) {
                    // Blur behavior: auto-confirm best match or revert
                    this._confirmTypeSelection(txt.text, false);
                } else {
                    // Revert visual to last confirmed
                    txt.setText(this._enemy.lastConfirmedName);
                }

                this._closeDropdown();
                this._editing = null;
            },
            get: () => txt.text,
            set: (s) => { txt.setText(s); },
            _kind: 'typeahead'
        };

        rect.on('pointerdown', api.startEdit);
        txt.on('pointerdown',  api.startEdit);

        // Global click: if editing typeahead and click outside both input and dropdown → blur-apply
        this.input.on('pointerdown', (pointer, objs) => {
            if (this._editing === api) {
                const inInput = objs.includes(rect) || objs.includes(txt);
                const inDD = this._isPointerInside(pointer, this._typeDDBounds);
                if (!inInput && !inDD) api.stopEdit(true);
            }
        });

        this._typeBox = api;
        return api;
    }

    _makeItemTypeaheadBox(x, y, w, h) {
        const rect = this.add.rectangle(x, y, w, h, 0x000000, 0.4)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.6)
            .setDepth(2)
            .setInteractive({ useHandCursor: true });

        const txt = this.add.text(x + 6, y + 5, this._item.query, UI.font).setDepth(3);

        this._itemTypeDD = this.add.container(0, 0).setVisible(false);
        this.content.add(this._itemTypeDD);

        const listX = x;
        const listYBelow = y + h + 10;
        const listW = w;
        const rowH = 24;
        const dropH = (rowH * MAX_DROPDOWN_ITEMS) + 8;

        this._itemDDMetrics = { listX, listYBelow, listW, rowH, dropH, inputY: y, inputH: h };

        const bg = this.add.rectangle(listX, listYBelow, listW, dropH, 0x000000, 0.92)
            .setOrigin(0, 0)
            .setStrokeStyle(1, 0xffffff, 0.5)
            .setDepth(3);
        this._itemTypeDD.add(bg);

        this._itemTypeRows = [];
        for (let i = 0; i < MAX_DROPDOWN_ITEMS; i++) {
            const ry = listYBelow + 4 + i * rowH;
            const rowC = this.add.container(listX + 2, ry).setDepth(3);
            const hlRect = this.add.rectangle(0, 0, listW - 4, rowH, 0xffffff, 0.08)
                .setOrigin(0, 0)
                .setDepth(3)
                .setVisible(false)
                .setInteractive({ useHandCursor: true });
            const pre = this.add.text(2, 0, '', UI.font).setDepth(4);
            const mid = this.add.text(2, 0, '', { ...UI.font, fontStyle: 'bold' }).setDepth(4);
            const post = this.add.text(2, 0, '', UI.font).setDepth(4);
            rowC.add([hlRect, pre, mid, post]);
            rowC.setSize(listW - 4, rowH);
            this._itemTypeRows.push(rowC);
            this._itemTypeDD.add(rowC);
            rowC._hlRect = hlRect; rowC._pre = pre; rowC._mid = mid; rowC._post = post;
            rowC._index = i;

            hlRect.on('pointerover', () => {
                this._item.resHL = i;
                this._renderItemDropdown();
            });
            hlRect.on('pointerdown', () => {
                const sel = this._visibleItemDropdownItem(i);
                if (sel) this._confirmItemSelection(sel.name, true);
            });
        }

        this._itemDDBounds = new Phaser.Geom.Rectangle(listX, listYBelow, listW, dropH);

        const api = {
            box: this.add.container(0, 0, [rect, txt]).setDepth(2),
            rect, txt,
            startEdit: () => {
                if (this._editing && this._editing !== api && this._editing.stopEdit) this._editing.stopEdit(true);
                rect.setFillStyle(0xffff00, 0.25);
                rect.setStrokeStyle(2, 0xffff00, 1);
                txt.setColor('#fff176');
                this._editing = api;

                this._openItemDropdown();
            },
            stopEdit: (apply = true) => {
                if (this._editing !== api) return;

                rect.setFillStyle(0x000000, 0.4);
                rect.setStrokeStyle(1, 0xffffff, 0.6);
                txt.setColor(UI.font.color);

                if (apply) {
                    this._confirmItemSelection(txt.text, false);
                } else {
                    txt.setText(this._item.lastConfirmedName);
                }

                this._closeItemDropdown();
                this._editing = null;
            },
            get: () => txt.text,
            set: (s) => { txt.setText(s); },
            _kind: 'typeahead'
        };

        rect.on('pointerdown', api.startEdit);
        txt.on('pointerdown', api.startEdit);

        this.input.on('pointerdown', (pointer, objs) => {
            if (this._editing === api) {
                const inInput = objs.includes(rect) || objs.includes(txt);
                const inDD = this._isPointerInside(pointer, this._itemDDBounds);
                if (!inInput && !inDD) api.stopEdit(true);
            }
        });

        this._itemTypeBox = api;
        return api;
    }

    // ---------- Interaction logic ----------

    _onKey(ev) {
        // ESC closes Dev UI (existing behavior). Do NOT close dropdown on Esc.
        if (ev.key === 'Escape') {
            if (this._editing && this._editing.stopEdit) this._editing.stopEdit(false);
            this._goBack();
            return;
        }

        // ENTER confirms current editor
        if (ev.key === 'Enter') {
            if (this._editing && this._editing.stopEdit) this._editing.stopEdit(true);
            return;
        }

        if (!this._editing) return;

        // Typeahead editors
        if (this._editing === this._typeBox) {
            const t = this._typeBox.txt;
            if (ev.key === 'Backspace') { t.setText(t.text.length ? t.text.slice(0, -1) : ''); this._updateTypeResults(t.text); return; }
            if (ev.key === 'ArrowDown') { this._moveDropdownHL(1); return; }
            if (ev.key === 'ArrowUp')   { this._moveDropdownHL(-1); return; }
            if (/^[a-z0-9 \-_'"]$/i.test(ev.key)) {
                if (t.text.length < 32) { t.setText(t.text + ev.key); this._updateTypeResults(t.text); }
            }
            return;
        }
        if (this._editing === this._itemTypeBox) {
            const t = this._itemTypeBox.txt;
            if (ev.key === 'Backspace') { t.setText(t.text.length ? t.text.slice(0, -1) : ''); this._updateItemResults(t.text); return; }
            if (ev.key === 'ArrowDown') { this._moveItemDropdownHL(1); return; }
            if (ev.key === 'ArrowUp')   { this._moveItemDropdownHL(-1); return; }
            if (/^[a-z0-9 \-_'"]$/i.test(ev.key)) {
                if (t.text.length < 32) { t.setText(t.text + ev.key); this._updateItemResults(t.text); }
            }
            return;
        }

        // Numeric editor (Amount)
        if (this._editing._kind === 'number') {
            const t = this._editing.txt;
            if (ev.key === 'Backspace') {
                t.setText(t.text.length ? t.text.slice(0, -1) : '');
                return;
            }
            if (/^[0-9]$/.test(ev.key)) {
                const max = t.text.includes('.') ? 4 : 3;
                if (t.text.length < max) {
                    const candidate = t.text + ev.key;
                    let allow = true;
                    if (this._editing === this._gameSpeedText) {
                        allow = parseFloat(candidate) <= 10;
                    } else if (this._editing === this._itemCountText) {
                        const maxStack = this._item?.maxStack || 1;
                        allow = parseInt(candidate, 10) <= maxStack;
                    }
                    if (allow) t.setText(candidate);
                }
                return;
            }
            if (
                ev.key === '.' &&
                this._editing === this._gameSpeedText &&
                !t.text.includes('.')
            ) {
                const candidate = t.text + '.';
                if (candidate.length < 4) {
                    const num = parseFloat(candidate);
                    if (!Number.isFinite(num) || num <= 10) t.setText(candidate);
                }
            }
        }
    }

    _openDropdown() {
        this._typeDD.setVisible(true);
        if (this.content?.bringToTop) this.content.bringToTop(this._typeDD);

        // Decide placement: below if space, else flip above. All coordinates are in `content` space.
        const M = this._ddMetrics;
        if (M) {
            // Convert input's bottom Y in content space to screen space: screenY = content.y + 54 + localY
            const screenBottomYOfInput = (this.content.y | 0) + 54 + (M.inputY + M.inputH + 10);
            const screenSpaceBelow = (this.scale.height - 24) - screenBottomYOfInput; // footer hint eats ~24px

            const fitsBelow = screenSpaceBelow >= M.dropH;
            if (fitsBelow) {
                // Place at baseline (below). Container offset 0, bounds at "below" Y.
                this._typeDD.y = 0;
                this._typeDDBounds.y = M.listYBelow;
                this._typeDDFlip = false;
            } else {
                // Flip up: anchor the dropdown bottom to the input's top edge with the same 10px gap.
                const listYAbove = M.inputY - 10 - M.dropH;
                const delta = listYAbove - M.listYBelow; // move container so children land at "above"
                this._typeDD.y = delta;
                this._typeDDBounds.y = listYAbove;
                this._typeDDFlip = true;
            }
        }

        this._updateTypeResults(this._typeBox.txt.text); // refresh results
        this._scrollBy(0); // re-evaluate page length so you can scroll to the dropdown bottom
    }

   _closeDropdown() {
        this._typeDD.setVisible(false);
        this._scrollBy(0); // shrink page length back
    }

    _updateTypeResults(inputStr) {
        const q = (inputStr || '').trim().toLowerCase();
        let results;

        if (q === '') {
            // Empty input: show all A→Z
            results = this._zIndex.sortedEntries;
        } else {
            // Prefix first, then contains; both alphabetical
            const prefix = [];
            const contain = [];
            for (let i = 0; i < this._zIndex.entries.length; i++) {
                const e = this._zIndex.entries[i];
                const idx = e.lower.indexOf(q);
                if (idx === 0) prefix.push(e);
                else if (idx > 0) contain.push(e);
            }
            prefix.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
            contain.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
            results = prefix.concat(contain);
        }

        this._enemy.results = results;
        this._enemy.resStart = 0;
        this._enemy.resHL = 0;
        this._renderDropdown();
    }

    _renderDropdown() {
        if (!this._typeDD.visible) return;

        const list = this._enemy.results;
        const start = this._enemy.resStart;
        const max = MAX_DROPDOWN_ITEMS;
        const q = (this._typeBox.txt.text || '').trim().toLowerCase();

        for (let i = 0; i < this._typeRows.length; i++) {
            const row = this._typeRows[i];
            const e = list[start + i];
            const visible = !!e;
            row.setVisible(visible);
            row._hlRect.setVisible(visible && i === this._enemy.resHL);
            if (!visible) continue;

            // Split text into pre/mid/post to "bold" the matched substring
            const name = e.name;
            const lower = e.lower;
            let m = -1, len = 0;
            if (q.length) {
                m = lower.indexOf(q);
                len = q.length;
            }
            const preStr  = (m >= 0) ? name.slice(0, m) : name;
            const midStr  = (m >= 0) ? name.slice(m, m + len) : '';
            const postStr = (m >= 0) ? name.slice(m + len) : '';

            // Position three text parts inline (pre at row.x, mid next, then post)
            const rx = row._pre.x; const ry = row._pre.y;
            row._pre.setText(preStr);
            row._mid.setText(midStr);
            row._post.setText(postStr);

            // Measure pre + mid to place post
            row._mid.setX(rx + row._pre.displayWidth);
            row._post.setX(rx + row._pre.displayWidth + row._mid.displayWidth);
            row._pre.setY(ry); row._mid.setY(ry); row._post.setY(ry);

            // Color adjustments for highlighted row
            const isHL = (i === this._enemy.resHL);
            const colorHL = isHL ? '#ffffff' : UI.font.color;
            row._pre.setColor(colorHL);
            row._mid.setColor(colorHL);
            row._post.setColor(colorHL);
        }
    }

    _visibleDropdownItem(rowIndex) {
        const idx = this._enemy.resStart + rowIndex;
        return this._enemy.results[idx];
    }

    _moveDropdownHL(dir) {
        const total = this._enemy.results.length;
        if (!total) return;

        const maxVis = Math.min(total, MAX_DROPDOWN_ITEMS);
        let hl = this._enemy.resHL + dir;

        if (hl < 0) {
            if (this._enemy.resStart > 0) {
                this._enemy.resStart = Math.max(0, this._enemy.resStart - 1);
                hl = 0;
            } else {
                hl = 0;
            }
        } else if (hl >= maxVis) {
            if (this._enemy.resStart + maxVis < total) {
                this._enemy.resStart += 1;
                hl = maxVis - 1;
            } else {
                hl = maxVis - 1;
            }
        }

        this._enemy.resHL = hl;
        this._renderDropdown();
    }

    _scrollDropdownBy(dy) {
        const prevStart = this._enemy.resStart | 0;
        const step = dy > 0 ? 1 : -1;
        const total = this._enemy.results.length;
        const maxStart = Math.max(0, total - MAX_DROPDOWN_ITEMS);

        const nextStart = Phaser.Math.Clamp(prevStart + step, 0, maxStart);
        this._enemy.resStart = nextStart;

        // Keep highlight inside window
        const maxVis = Math.min(MAX_DROPDOWN_ITEMS, total - this._enemy.resStart);
        this._enemy.resHL = Phaser.Math.Clamp(this._enemy.resHL, 0, Math.max(0, maxVis - 1));
        this._renderDropdown();

        return nextStart !== prevStart; // tell caller if we actually consumed the wheel
    }

    _confirmTypeSelection(inputText, selectingFromRow) {
        const q = (inputText || '').trim().toLowerCase();

        let chosen = null;
        // 1) Exact (case-insensitive) name match
        for (let i = 0; i < this._zIndex.entries.length; i++) {
            const e = this._zIndex.entries[i];
            if (e.lower === q) { chosen = e; break; }
        }
        // 2) Else elect first visible match
        if (!chosen && this._enemy.results.length > 0) {
            chosen = selectingFromRow ? this._visibleDropdownItem(this._enemy.resHL) : this._enemy.results[0];
        }

        if (chosen) {
            this._enemy.selectedKey = chosen.key;
            this._enemy.selectedName = chosen.name;
            this._enemy.lastConfirmedKey = chosen.key;
            this._enemy.lastConfirmedName = chosen.name;
            this._typeBox.set(chosen.name);

            // Save prefs
            DevTools._setEnemySpawnPrefs && DevTools._setEnemySpawnPrefs({
                key: chosen.key,
                name: chosen.name,
                count: this._enemy.count
            });
        } else {
            // Revert if nothing matched
            this._typeBox.set(this._enemy.lastConfirmedName);
        }
    }

    _openItemDropdown() {
        this._itemTypeDD.setVisible(true);
        if (this.content?.bringToTop) this.content.bringToTop(this._itemTypeDD);

        const M = this._itemDDMetrics;
        if (M) {
            const screenBottomYOfInput = (this.content.y | 0) + 54 + (M.inputY + M.inputH + 10);
            const screenSpaceBelow = (this.scale.height - 24) - screenBottomYOfInput;
            const fitsBelow = screenSpaceBelow >= M.dropH;
            if (fitsBelow) {
                this._itemTypeDD.y = 0;
                this._itemDDBounds.y = M.listYBelow;
                this._itemDDFlip = false;
            } else {
                const listYAbove = M.inputY - 10 - M.dropH;
                const delta = listYAbove - M.listYBelow;
                this._itemTypeDD.y = delta;
                this._itemDDBounds.y = listYAbove;
                this._itemDDFlip = true;
            }
        }

        this._updateItemResults(this._itemTypeBox.txt.text);
        this._scrollBy(0);
    }

    _closeItemDropdown() {
        this._itemTypeDD.setVisible(false);
        this._scrollBy(0);
    }

    _updateItemResults(inputStr) {
        const q = (inputStr || '').trim().toLowerCase();
        let results;

        if (q === '') {
            results = this._iIndex.sortedEntries;
        } else {
            const prefix = [];
            const contain = [];
            for (let i = 0; i < this._iIndex.entries.length; i++) {
                const e = this._iIndex.entries[i];
                const idx = e.lower.indexOf(q);
                if (idx === 0) prefix.push(e);
                else if (idx > 0) contain.push(e);
            }
            prefix.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
            contain.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
            results = prefix.concat(contain);
        }

        this._item.results = results;
        this._item.resStart = 0;
        this._item.resHL = 0;
        this._renderItemDropdown();
    }

    _renderItemDropdown() {
        if (!this._itemTypeDD.visible) return;

        const list = this._item.results;
        const start = this._item.resStart;
        const max = MAX_DROPDOWN_ITEMS;
        const q = (this._itemTypeBox.txt.text || '').trim().toLowerCase();

        for (let i = 0; i < this._itemTypeRows.length; i++) {
            const row = this._itemTypeRows[i];
            const e = list[start + i];
            const visible = !!e;
            row.setVisible(visible);
            row._hlRect.setVisible(visible && i === this._item.resHL);
            if (!visible) continue;

            const name = e.name;
            const lower = e.lower;
            let m = -1, len = 0;
            if (q.length) {
                m = lower.indexOf(q);
                len = q.length;
            }
            const preStr = (m >= 0) ? name.slice(0, m) : name;
            const midStr = (m >= 0) ? name.slice(m, m + len) : '';
            const postStr = (m >= 0) ? name.slice(m + len) : '';

            const rx = row._pre.x; const ry = row._pre.y;
            row._pre.setText(preStr);
            row._mid.setText(midStr);
            row._post.setText(postStr);

            row._mid.setX(rx + row._pre.displayWidth);
            row._post.setX(rx + row._pre.displayWidth + row._mid.displayWidth);
            row._pre.setY(ry); row._mid.setY(ry); row._post.setY(ry);

            const isHL = (i === this._item.resHL);
            const colorHL = isHL ? '#ffffff' : UI.font.color;
            row._pre.setColor(colorHL);
            row._mid.setColor(colorHL);
            row._post.setColor(colorHL);
        }
    }

    _visibleItemDropdownItem(rowIndex) {
        const idx = this._item.resStart + rowIndex;
        return this._item.results[idx];
    }

    _moveItemDropdownHL(dir) {
        const total = this._item.results.length;
        if (!total) return;

        const maxVis = Math.min(total, MAX_DROPDOWN_ITEMS);
        let hl = this._item.resHL + dir;

        if (hl < 0) {
            if (this._item.resStart > 0) {
                this._item.resStart = Math.max(0, this._item.resStart - 1);
                hl = 0;
            } else {
                hl = 0;
            }
        } else if (hl >= maxVis) {
            if (this._item.resStart + maxVis < total) {
                this._item.resStart += 1;
                hl = maxVis - 1;
            } else {
                hl = maxVis - 1;
            }
        }

        this._item.resHL = hl;
        this._renderItemDropdown();
    }

    _scrollItemDropdownBy(dy) {
        const prevStart = this._item.resStart | 0;
        const step = dy > 0 ? 1 : -1;
        const total = this._item.results.length;
        const maxStart = Math.max(0, total - MAX_DROPDOWN_ITEMS);

        const nextStart = Phaser.Math.Clamp(prevStart + step, 0, maxStart);
        this._item.resStart = nextStart;

        const maxVis = Math.min(MAX_DROPDOWN_ITEMS, total - this._item.resStart);
        this._item.resHL = Phaser.Math.Clamp(this._item.resHL, 0, Math.max(0, maxVis - 1));
        this._renderItemDropdown();

        return nextStart !== prevStart;
    }

    _confirmItemSelection(inputText, selectingFromRow) {
        const q = (inputText || '').trim().toLowerCase();

        let chosen = null;
        for (let i = 0; i < this._iIndex.entries.length; i++) {
            const e = this._iIndex.entries[i];
            if (e.lower === q) { chosen = e; break; }
        }
        if (!chosen && this._item.results.length > 0) {
            chosen = selectingFromRow ? this._visibleItemDropdownItem(this._item.resHL) : this._item.results[0];
        }

        if (chosen) {
            this._item.selectedKey = chosen.key;
            this._item.selectedName = chosen.name;
            this._item.lastConfirmedKey = chosen.key;
            this._item.lastConfirmedName = chosen.name;
            this._item.maxStack = chosen.maxStack || 1;
            if ((parseInt(this._item.count, 10) || 1) > this._item.maxStack) {
                this._item.count = String(this._item.maxStack);
                this._itemCountText?.set?.(this._item.count);
            }
            this._itemTypeBox.set(chosen.name);
            DevTools._setItemSpawnPrefs && DevTools._setItemSpawnPrefs({
                key: this._item.selectedKey,
                name: this._item.selectedName,
                count: this._item.count
            });
        } else {
            this._itemTypeBox.set(this._item.lastConfirmedName);
        }
    }

    _isPointerInside(pointer, rect) {
        if (!rect) return false;
        const x = pointer.x, y = pointer.y - 54 + this._scroll; // content container offset
        return rect.contains(x, y);
    }

    // ---------- Spawner logic ----------

    _bumpCount(delta) {
        const val = this._enemy.count.trim() === '' ? 1 : parseInt(this._enemy.count, 10) || 1;
        let next = Phaser.Math.Clamp(val + delta, 1, 999);
        this._enemy.count = String(next);
        if (this._countText) this._countText.set(this._enemy.count);

        // Save prefs
        DevTools._setEnemySpawnPrefs && DevTools._setEnemySpawnPrefs({
            key: this._enemy.selectedKey,
            name: this._enemy.selectedName,
            count: this._enemy.count
        });
    }

    _bumpItemCount(delta) {
        const val = this._item.count.trim() === '' ? 1 : parseInt(this._item.count, 10) || 1;
        const max = this._item.maxStack || 1;
        let next = Phaser.Math.Clamp(val + delta, 1, max);
        this._item.count = String(next);
        if (this._itemCountText) this._itemCountText.set(this._item.count);
        DevTools._setItemSpawnPrefs && DevTools._setItemSpawnPrefs({
            key: this._item.selectedKey,
            name: this._item.selectedName,
            count: this._item.count
        });
    }

    _spawnEnemies() {
        // Commit any active edits first
        if (this._editing && this._editing.stopEdit) this._editing.stopEdit(true);

        // Parse count 1..999
        let raw = this._countText?.txt?.text?.trim?.() ?? String(this._enemy.count || '').trim();
        if (raw === '') raw = '1';
        let count = parseInt(raw, 10);
        if (!Number.isFinite(count) || count <= 0) count = 1;
        count = Phaser.Math.Clamp(count, 1, 999);
        this._enemy.count = String(count);
        this._countText?.set?.(this._enemy.count);

        // Save prefs (optional redundancy)
        DevTools._setEnemySpawnPrefs && DevTools._setEnemySpawnPrefs({
            key: this._enemy.selectedKey,
            name: this._enemy.selectedName,
            count: this._enemy.count
        });

        const typeKey = this._enemy.selectedKey;
        const main = this.scene.get('MainScene');
        if (!main) return;

        DevTools.spawnEnemiesAtScreenEdge(main, typeKey, count);
    }

    _spawnItems() {
        if (this._editing && this._editing.stopEdit) this._editing.stopEdit(true);

        let raw = this._itemCountText?.txt?.text?.trim?.() ?? String(this._item.count || '').trim();
        if (raw === '') raw = '1';
        let qty = parseInt(raw, 10);
        if (!Number.isFinite(qty) || qty <= 0) qty = 1;
        const max = this._item.maxStack || 1;
        qty = Phaser.Math.Clamp(qty, 1, max);
        this._item.count = String(qty);
        this._itemCountText?.set?.(this._item.count);

        const itemKey = this._item.selectedKey;
        const main = this.scene.get('MainScene');
        if (!main) return;

        DevTools.spawnItemsSmart(main, itemKey, qty);
        DevTools._setItemSpawnPrefs && DevTools._setItemSpawnPrefs({
            key: itemKey,
            name: this._item.selectedName,
            count: this._item.count
        });
    }

    // ---------- Game speed logic ----------

    _commitGameSpeed() {
        let raw = this._gameSpeedText?.get?.() ?? String(this._gameSpeed.scale || '').trim();
        if (raw === '') raw = '0';
        let val = parseFloat(raw);
        if (!Number.isFinite(val)) val = 0;
        val = Math.round(val * 10) / 10;
        val = Phaser.Math.Clamp(val, 0, 10);
        this._gameSpeed.scale = val.toFixed(1).replace(/\.0$/, '');
        if (this._gameSpeedText?.txt) this._gameSpeedText.txt.setText(this._gameSpeed.scale);
        this._gameSpeedText?.stopEdit?.(false);
        DevTools.setTimeScale(val, this.game);
    }


    _bumpGameSpeed(delta) {
        let val = parseFloat(this._gameSpeed.scale) || 0;
        val = Math.round((val + delta) * 10) / 10;
        val = Phaser.Math.Clamp(val, 0, 10);
        this._gameSpeed.scale = val.toFixed(1).replace(/\.0$/, '');
        if (this._gameSpeedText?.txt) this._gameSpeedText.txt.setText(this._gameSpeed.scale);
        this._gameSpeedText?.stopEdit?.(false);
        DevTools.setTimeScale(val, this.game);
    }

    _goBack() {
        this._unlockScenes();
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
            s.input.enabled = !!info.wasInputEnabled;
            if (s.input.keyboard != null && info.wasKeyboardEnabled != null) {
                s.input.keyboard.enabled = !!info.wasKeyboardEnabled;
            }
        }
        this._lockedScenes.length = 0;
    }

    _scrollBy(delta) {
        const viewH = this.scale.height - 54;
        const totalH = this._estimateContentHeight();
        const maxScroll = Math.max(0, totalH - viewH);
        this._scroll = Phaser.Math.Clamp(this._scroll + delta * 0.3, 0, maxScroll);
        this.content.y = 54 - this._scroll;
        this._updateScrollbar();
    }

    _createScrollbar() {
        const viewH = this.scale.height - 54;
        const trackW = 8;
        const trackX = this.scale.width - trackW - 2;
        const trackY = 54;
        const trackH = viewH;
        this._scrollbarTrack = this.add.rectangle(trackX, trackY, trackW, trackH, 0xffffff, 0.2)
            .setOrigin(0, 0).setDepth(2);
        this._scrollbarThumb = this.add.rectangle(trackX, trackY, trackW, 20, 0xffffff, 0.6)
            .setOrigin(0, 0).setDepth(3).setInteractive({ useHandCursor: true });
        this.input.setDraggable(this._scrollbarThumb);
        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (gameObject !== this._scrollbarThumb) return;
            const maxY = trackY + trackH - this._scrollbarThumb.height;
            const newY = Phaser.Math.Clamp(dragY, trackY, maxY);
            this._scrollbarThumb.y = newY;
            const totalH = this._estimateContentHeight();
            const maxScroll = Math.max(0, totalH - viewH);
            const ratio = (newY - trackY) / (trackH - this._scrollbarThumb.height);
            this._scroll = ratio * maxScroll;
            this.content.y = 54 - this._scroll;
        });
        this._updateScrollbar();
    }

    _updateScrollbar() {
        if (!this._scrollbarTrack || !this._scrollbarThumb) return;
        const viewH = this.scale.height - 54;
        const totalH = this._estimateContentHeight();
        const trackH = viewH;
        const trackY = 54;
        const visible = totalH > viewH;
        this._scrollbarTrack.setVisible(visible);
        this._scrollbarThumb.setVisible(visible);
        if (!visible) return;
        const thumbH = Math.max(20, trackH * (viewH / totalH));
        this._scrollbarThumb.height = thumbH;
        const maxScroll = Math.max(0, totalH - viewH);
        const ratio = (maxScroll === 0) ? 0 : this._scroll / maxScroll;
        this._scrollbarThumb.y = trackY + (trackH - thumbH) * ratio;
    }

    _estimateContentHeight() {
        // Base content height from built rows plus padding
        let base = this._contentHeight;

        // If a dropdown is open, extend the page so the user can scroll to see it
        if (this._typeDD && this._typeDD.visible && this._typeDDBounds) {
            base = Math.max(base, this._typeDDBounds.y + this._typeDDBounds.height);
        } else if (this._itemTypeDD && this._itemTypeDD.visible && this._itemDDBounds) {
            base = Math.max(base, this._itemDDBounds.y + this._itemDDBounds.height);
        }
        return base;
    }

    // ---------- Data helpers ----------

    _buildZombieIndex() {
        const entries = [];
        if (Array.isArray(ZDB)) {
            for (const z of ZDB) {
                const key  = z.id || z.key || z.name;
                const name = z.name || key;
                if (!key || !name) continue;
                entries.push({ key, name, lower: name.toLowerCase() });
            }
        } else if (ZDB && typeof ZDB === 'object') {
            const keys = Object.keys(ZDB);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const z = ZDB[k] || {};
                const name = z.name || k;
                entries.push({ key: k, name, lower: name.toLowerCase() });
            }
        }
        // Sorted list by A→Z (used for empty query)
        const sortedEntries = entries.slice().sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
        return { entries, sortedEntries };
    }

    _buildItemIndex() {
        const db = IDB.ITEM_DB || IDB;
        const entries = [];
        if (db && typeof db === 'object') {
            const keys = Object.keys(db);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const it = db[k] || {};
                const name = it.name || k;
                const max = it.maxStack || 1;
                entries.push({ key: k, name, lower: name.toLowerCase(), maxStack: max });
            }
        }
        const sortedEntries = entries.slice().sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
        return { entries, sortedEntries };
    }
}
