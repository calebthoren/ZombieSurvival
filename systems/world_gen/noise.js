// systems/world_gen/noise.js
// Deterministic noise helpers for world generation.

export function getDensity(x, y, seed) {
    let n = x * 374761393 + y * 668265263 + seed * 69069;
    n = (n ^ (n >> 13)) * 1274126177;
    n = n ^ (n >> 16);
    return (n >>> 0) / 4294967295;
}

export default { getDensity };
