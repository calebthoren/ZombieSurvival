import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDensity } from '../../../systems/world_gen/resources/density.js';

test('getDensity returns consistent values for same seed', () => {
    const seed = 12345;
    const a = getDensity(10, 10, seed);
    const b = getDensity(10, 10, seed);
    assert.strictEqual(a, b);
});

test('changing seed shifts patterns', () => {
    const coords = [
        [10, 10],
        [15, 20],
        [20, 25],
    ];
    const seedA = 1;
    const seedB = 2;
    const same = coords.every(([x, y]) => getDensity(x, y, seedA) === getDensity(x, y, seedB));
    assert.ok(!same);
});
