export function generate(bounds, radius) {
    const minX = bounds.minX ?? 0;
    const minY = bounds.minY ?? 0;
    const maxX = bounds.maxX ?? 0;
    const maxY = bounds.maxY ?? 0;
    const width = maxX - minX;
    const height = maxY - minY;
    if (radius <= 0 || width <= 0 || height <= 0) return [];

    const cellSize = radius / Math.SQRT2;
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const grid = new Array(gridWidth * gridHeight).fill(null);
    const samples = [];
    const active = [];

    function insertSample(x, y) {
        const sample = { x, y };
        samples.push(sample);
        const gx = Math.floor((x - minX) / cellSize);
        const gy = Math.floor((y - minY) / cellSize);
        grid[gx + gy * gridWidth] = samples.length - 1;
        active.push(samples.length - 1);
    }

    const randX = () => minX + Math.random() * width;
    const randY = () => minY + Math.random() * height;
    insertSample(randX(), randY());

    const k = 30;
    while (active.length > 0) {
        const idx = active[Math.floor(Math.random() * active.length)];
        const sx = samples[idx].x;
        const sy = samples[idx].y;
        let found = false;
        for (let i = 0; i < k; i++) {
            const ang = Math.random() * Math.PI * 2;
            const mag = radius + Math.random() * radius;
            const x = sx + Math.cos(ang) * mag;
            const y = sy + Math.sin(ang) * mag;
            if (x < minX || x > maxX || y < minY || y > maxY) continue;
            const gx = Math.floor((x - minX) / cellSize);
            const gy = Math.floor((y - minY) / cellSize);
            let ok = true;
            for (let ox = -2; ox <= 2 && ok; ox++) {
                for (let oy = -2; oy <= 2 && ok; oy++) {
                    const nx = gx + ox;
                    const ny = gy + oy;
                    if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight)
                        continue;
                    const gi = grid[nx + ny * gridWidth];
                    if (gi != null) {
                        const dx = samples[gi].x - x;
                        const dy = samples[gi].y - y;
                        if (dx * dx + dy * dy < radius * radius) {
                            ok = false;
                        }
                    }
                }
            }
            if (ok) {
                insertSample(x, y);
                found = true;
                break;
            }
        }
        if (!found) {
            const last = active.pop();
            if (idx < active.length) active[idx] = last;
        }
    }

    return samples;
}
