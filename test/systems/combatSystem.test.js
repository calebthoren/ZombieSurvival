import test from 'node:test';
import assert from 'node:assert/strict';
import createCombatSystem from '../../systems/combatSystem.js';
import DevTools from '../../systems/DevTools.js';

globalThis.Phaser = {
    Math: {
        Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
        Linear: (start, end, t) => start + (end - start) * t,
        Angle: {
            Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
        },
    },
};

function createStubScene(callStore) {
    const bullet = {
        active: true,
        data: {},
        body: {
            setAllowGravity() {},
            setCircle() {},
            setOffset() {},
        },
        setActive() { return this; },
        setVisible() { return this; },
        setDepth() { return this; },
        setScale() { return this; },
        setSize() { return this; },
        setData(key, value) { this.data[key] = value; return this; },
        getData(key) { return this.data[key]; },
        setVelocity() { return this; },
        setRotation() { return this; },
        destroy() { this.destroyed = true; },
    };
    const scene = {
        player: { x: 0, y: 0 },
        bullets: { get: () => bullet },
        physics: {
            velocityFromRotation: (angle, speed) => ({
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed,
            }),
            add: {
                collider() {},
                existing() {},
                image() { return bullet; },
            },
            world: {},
        },
        time: {
            delayedCall(ms, cb) {
                callStore.push(ms);
                cb();
            },
        },
        resources: {},
        uiScene: {
            inventory: {
                getEquipped: () => ({ id: 'bow' }),
                firstViableAmmoFor: () => ({ ammoId: 'rock', total: 1 }),
                consumeAmmo() {},
            },
            events: { emit() {} },
        },
        hasStamina: () => true,
        spendStamina() {},
    };
    scene.bullet = bullet;
    return scene;
}

test('fireRangedWeapon lifetime respects time scale', () => {
    const run = (scale) => {
        DevTools.cheats.timeScale = scale;
        const calls = [];
        const scene = createStubScene(calls);
        const combat = createCombatSystem(scene);
        const pointer = { worldX: 100, worldY: 0 };
        const wpn = { projectileSpeed: 100, minRange: 100, maxRange: 100 };
        combat.fireRangedWeapon(pointer, wpn, 1);
        return calls[0];
    };

    const slowLifetime = run(0.5);
    assert.equal(slowLifetime, 2000);

    const fastLifetime = run(2);
    assert.equal(fastLifetime, 500);
});
