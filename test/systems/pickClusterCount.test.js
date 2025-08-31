// test/systems/pickClusterCount.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClusterCount } from '../../systems/resourceSystem.js';

test('pickClusterCount favors single clusters', () => {
    const seq1 = [0.8];
    assert.equal(pickClusterCount(1, 6, () => seq1.shift()), 1);

    const seq2 = [0.2, 0.9];
    assert.equal(pickClusterCount(1, 6, () => seq2.shift()), 2);

    const seq3 = [0.2, 0.2, 0.9];
    assert.equal(pickClusterCount(1, 6, () => seq3.shift()), 3);
});

test('pickClusterCount accepts growth chance parameter', () => {
    const rng1 = [0.2, 0.9];
    assert.equal(pickClusterCount(1, 6, () => rng1.shift(), 0.3), 2);

    const rng2 = [0.2, 0.9];
    assert.equal(pickClusterCount(1, 6, () => rng2.shift(), 0.1), 1);
});
