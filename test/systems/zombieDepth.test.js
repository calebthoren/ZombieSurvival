import test from 'node:test';
import assert from 'node:assert/strict';
import createCombatSystem from '../../systems/combatSystem.js';

globalThis.Phaser = {
    Math: {
        Clamp: (v, min, max) => Math.min(Math.max(v, min), max),
        Linear: (start, end, t) => start + (end - start) * t,
        Angle: {
            Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
            Normalize: (angle) => angle,
            DegToRad: (deg) => (deg * Math.PI) / 180,
        },
        Between: (min, max) => min + (max - min) * 0.5,
        Distance: {
            Squared: (x1, y1, x2, y2) => {
                const dx = x2 - x1;
                const dy = y2 - y1;
                return dx * dx + dy * dy;
            },
        },
    },
};

test('spawned zombies use player depth for tree overlap', () => {
    const zombie = {
        body: { setAllowGravity() {} },
        setOrigin() { return this; },
        setScale() { return this; },
        setDepth(d) { this.depth = d; return this; },
        setPosition() { return this; },
    };
    const scene = {
        zombies: { create: () => zombie },
        physics: { add: { existing() {} } },
    };
    const combat = createCombatSystem(scene);
    const z = combat.spawnZombie('walker', { x: 0, y: 0 });
    assert.equal(z.depth, 900);
});
