// systems/world_gen/noise.js
// Deterministic noise helpers for world generation.

export function getDensity(x, y, seed) {
    let n =
        Math.imul(x | 0, 374761393) +
        Math.imul(y | 0, 668265263) +
        Math.imul(seed | 0, 69069);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
}

export default { getDensity };
