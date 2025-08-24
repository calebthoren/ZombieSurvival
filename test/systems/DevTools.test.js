import test from 'node:test';
import assert from 'node:assert';
import DevTools from '../../systems/DevTools.js';

test('setMeleeSliceBatch clamps to 1 or 2', () => {
    DevTools.setMeleeSliceBatch(2);
    assert.equal(DevTools.cheats.meleeSliceBatch, 2);
    DevTools.setMeleeSliceBatch(0);
    assert.equal(DevTools.cheats.meleeSliceBatch, 1);
});
