// systems/inputSystem.js
// Centralizes player input handling, exposing Phaser-agnostic callbacks.
import { ITEM_DB } from '../data/itemDatabase.js';
import DevTools from './DevTools.js';

export default function createInputSystem(scene) {
    // ----- Pointer Events -----
    function onPointerDown(pointer) {
        if (scene.isGameOver || pointer.button !== 0) return;
        if (scene._isSwinging) return;

        const equipped = scene.uiScene?.inventory?.getEquipped?.();
        if (!equipped) return;

        const def = ITEM_DB[equipped.id];
        const cat = def?.weapon?.category;

        if (cat === 'melee' && equipped.id === 'crude_bat') {
            const wpn = def.weapon || {};
            const now = scene.time.now;
            const baseCd = wpn?.swingCooldownMs ?? 80;
            const effectiveCd = scene._nextSwingCooldownMs ?? baseCd;
            const lastEnd = scene._lastSwingEndTime || 0;
            if (!DevTools.cheats.noCooldown && now - lastEnd < effectiveCd)
                return;

            if (wpn.canCharge === true) {
                scene.isCharging = true;
                scene.chargeStart = now;
                const scale = DevTools.cheats.timeScale || 1;
                const applied = scale <= 0 ? 0 : 1 / scale;
                scene.chargeMaxMs = Math.max(1, Math.floor((wpn?.chargeMaxMs ?? 1500) * applied));
                scene._chargingItemId = equipped.id;
                scene.uiScene?.events?.emit('weapon:charge', 0);
                scene._createEquippedItemGhost?.(equipped.id);
                scene._updateEquippedItemGhost();
                return;
            } else {
                scene.combat.swingBat(pointer, wpn, 0);
                return;
            }
        }

        if (cat === 'ranged' && equipped.id === 'slingshot') {
            const wpn = def.weapon || {};
            const now = scene.time.now;
            const fireCd = wpn?.fireCooldownMs ?? 0;
            if (
                !DevTools.cheats.noCooldown &&
                fireCd > 0 &&
                now < (scene._nextRangedReadyTime || 0)
            )
                return;
            const ammoInfo = scene.uiScene?.inventory?.totalOfActiveAmmo?.(
                equipped.id,
            );
            if (!ammoInfo || ammoInfo.total <= 0) return;

            scene.isCharging = true;
            scene.chargeStart = now;
            const scale = DevTools.cheats.timeScale || 1;
            const applied = scale <= 0 ? 0 : 1 / scale;
            scene.chargeMaxMs = Math.max(1, Math.floor((wpn?.chargeMaxMs ?? 1500) * applied));
            scene._chargingItemId = equipped.id;
            scene.uiScene?.events?.emit('weapon:charge', 0);
            scene._createEquippedItemGhost?.(equipped.id);
            scene._updateEquippedItemGhost();
            return;
        }
    }

    function onPointerUp(pointer) {
        if (scene.isGameOver || pointer.button !== 0) return;
        if (!scene.isCharging) return;

        const eq = scene.uiScene?.inventory?.getEquipped?.();
        if (!eq || eq.id !== scene._chargingItemId) {
            scene._cancelCharge();
            return;
        }

        const heldMs = Phaser.Math.Clamp(
            scene.time.now - scene.chargeStart,
            0,
            scene.chargeMaxMs,
        );
        const charge = scene.chargeMaxMs > 0 ? heldMs / scene.chargeMaxMs : 1;

        scene.isCharging = false;
        scene._chargingItemId = null;
        scene.uiScene?.events?.emit('weapon:chargeEnd');
        scene._destroyEquippedItemGhost();

        const def = ITEM_DB[eq.id];
        const cat = def?.weapon?.category;

        if (cat === 'ranged' && eq.id === 'slingshot') {
            scene.combat.fireRangedWeapon(pointer, def.weapon || {}, charge);
            return;
        }

        if (cat === 'melee' && eq.id === 'crude_bat') {
            scene.combat.swingBat(pointer, def.weapon || {}, charge);
            return;
        }
    }

    // ----- Pause & Auto-Pause -----
    function onEsc() {
        if (scene.isGameOver) return;
        if (!scene.scene.isActive('PauseScene')) {
            scene.scene.launch('PauseScene');
            scene.scene.pause();
        }
    }

    function autoPause() {
        if (scene.isGameOver) return;
        const pauseOpen =
            scene.scene.isActive('PauseScene') ||
            scene.scene.isActive('DevUIScene');
        if (!pauseOpen) {
            scene.scene.launch('PauseScene');
        }
        if (scene.sys.isActive()) {
            scene.scene.pause();
        }
        resetInputAndStop();
    }

    // ----- Reset Helpers -----
    function resetInputAndStop() {
        if (scene.player?.body) {
            scene.player.body.setVelocity(0, 0);
            if (typeof scene.player.body.stop === 'function')
                scene.player.body.stop();
        }
        scene._isSprinting = false;
        scene._cancelCharge?.();
        if (scene.equippedItemGhost?.setVisible)
            scene.equippedItemGhost.setVisible(false);
        if (scene.input?.keyboard?.resetKeys)
            scene.input.keyboard.resetKeys(true);
        if (scene.cursors) {
            if (scene.cursors.up) scene.cursors.up.isDown = false;
            if (scene.cursors.down) scene.cursors.down.isDown = false;
            if (scene.cursors.left) scene.cursors.left.isDown = false;
            if (scene.cursors.right) scene.cursors.right.isDown = false;
            if (scene.cursors.shift) scene.cursors.shift.isDown = false;
            if (scene.cursors.space) scene.cursors.space.isDown = false;
        }
        if (scene.keys) {
            if (scene.keys.W) scene.keys.W.isDown = false;
            if (scene.keys.A) scene.keys.A.isDown = false;
            if (scene.keys.S) scene.keys.S.isDown = false;
            if (scene.keys.D) scene.keys.D.isDown = false;
        }
        if (scene.input?.activePointer?.reset)
            scene.input.activePointer.reset();
    }

    return { onPointerDown, onPointerUp, onEsc, autoPause, resetInputAndStop };
}
