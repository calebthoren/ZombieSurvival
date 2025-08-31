// systems/world_gen/resources/poissonSampler.js
// Simple Poisson-disc sampler for evenly spaced points.
// bounds: {minX, maxX, minY, maxY}
// radius: minimum distance between points

export function generate(bounds, radius, rng = Math.random) {
    const cellSize = radius / Math.SQRT2;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    const gridW = Math.ceil(width / cellSize);
    const gridH = Math.ceil(height / cellSize);
    const grid = new Array(gridW * gridH).fill(null);
    const samples = [];
    const active = [];
    const k = 30; // attempts per active point

    const toGrid = (x, y) => {
        const gx = Math.floor((x - bounds.minX) / cellSize);
        const gy = Math.floor((y - bounds.minY) / cellSize);
        return { gx, gy };
    };

    const inBounds = (x, y) =>
        x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;

    const isFar = (x, y) => {
        const { gx, gy } = toGrid(x, y);
        const minX = Math.max(gx - 2, 0);
        const maxX = Math.min(gx + 2, gridW - 1);
        const minY = Math.max(gy - 2, 0);
        const maxY = Math.min(gy + 2, gridH - 1);
        for (let yy = minY; yy <= maxY; yy++) {
            for (let xx = minX; xx <= maxX; xx++) {
                const s = grid[yy * gridW + xx];
                if (!s) continue;
                const dx = s.x - x;
                const dy = s.y - y;
                if (dx * dx + dy * dy < radius * radius) return false;
            }
        }
        return true;
    };

    const addPoint = (x, y) => {
        const { gx, gy } = toGrid(x, y);
        grid[gy * gridW + gx] = { x, y };
        const p = { x, y };
        samples.push(p);
        active.push(p);
    };

    const randBetween = (min, max) => rng() * (max - min) + min;

    // initial point
    addPoint(randBetween(bounds.minX, bounds.maxX), randBetween(bounds.minY, bounds.maxY));

    while (active.length > 0) {
        const idx = (rng() * active.length) | 0;
        const p = active[idx];
        let found = false;
        for (let i = 0; i < k; i++) {
            const ang = randBetween(0, Math.PI * 2);
            const dist = randBetween(radius, radius * 2);
            const x = p.x + Math.cos(ang) * dist;
            const y = p.y + Math.sin(ang) * dist;
            if (inBounds(x, y) && isFar(x, y)) {
                addPoint(x, y);
                found = true;
                break;
            }
        }
        if (!found) {
            active[idx] = active[active.length - 1];
            active.pop();
        }
    }

    return samples;
}

export default { generate };

