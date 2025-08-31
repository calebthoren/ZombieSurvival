import { createNoise2D } from '../../../node_modules/simplex-noise/dist/esm/simplex-noise.js';

const _noiseCache = new Map();

function _noise(seed) {
    let n = _noiseCache.get(seed);
    if (!n) {
        const rnd = _mulberry32(_hash(seed));
        n = createNoise2D(rnd);
        _noiseCache.set(seed, n);
    }
    return n;
}

function _hash(x) {
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x ^= x >>> 16;
    return x >>> 0;
}

function _mulberry32(a) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function getDensity(cx, cy, seed = 0) {
    const noise = _noise(seed);
    const base = (noise(cx * 0.1, cy * 0.1) + 1) / 2; // 0..1
    const rng = _mulberry32(_hash(seed + cx + cy));
    const total = Math.round(25 + base * 8 + rng() * 2);
    return total;
}
