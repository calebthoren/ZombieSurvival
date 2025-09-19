// systems/uiEscapeManager.js
// Tracks UI menus/panels that should respond to the Escape key.
// Maintains a stack of open menus so the most recently opened closes first.

export default class UIEscapeManager {
    constructor() {
        this._registry = new Map(); // id -> { close: fn, isOpen: bool }
        this._stack = []; // ordered list of open ids (oldest -> newest)
    }

    register(id, closeFn) {
        if (!id || typeof closeFn !== 'function') return;
        const entry = this._registry.get(id) || {};
        entry.close = closeFn;
        entry.isOpen = !!entry.isOpen;
        this._registry.set(id, entry);
    }

    unregister(id) {
        if (!id) return;
        this._registry.delete(id);
        const idx = this._stack.indexOf(id);
        if (idx >= 0) this._stack.splice(idx, 1);
    }

    setOpen(id, isOpen) {
        if (!id) return;
        const entry = this._registry.get(id);
        if (!entry) return;

        entry.isOpen = !!isOpen;
        const idx = this._stack.indexOf(id);
        if (entry.isOpen) {
            if (idx >= 0) this._stack.splice(idx, 1);
            this._stack.push(id);
        } else if (idx >= 0) {
            this._stack.splice(idx, 1);
        }
    }

    handleEscape() {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            const id = this._stack[i];
            const entry = this._registry.get(id);
            if (!entry) {
                this._stack.splice(i, 1);
                continue;
            }
            if (!entry.isOpen) {
                this._stack.splice(i, 1);
                continue;
            }
            if (typeof entry.close === 'function') {
                entry.close();
                return true;
            }
            return false;
        }

        for (const [id, entry] of this._registry.entries()) {
            if (entry.isOpen && typeof entry.close === 'function') {
                entry.close();
                const idx = this._stack.indexOf(id);
                if (idx >= 0) this._stack.splice(idx, 1);
                return true;
            }
        }

        return false;
    }
}
