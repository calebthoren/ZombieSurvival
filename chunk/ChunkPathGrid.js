import { CHUNK_WIDTH, CHUNK_HEIGHT } from '../systems/worldGen/ChunkManager.js';

const CELL_SIZE = 20;
const COLS = Math.ceil(CHUNK_WIDTH / CELL_SIZE);
const ROWS = Math.ceil(CHUNK_HEIGHT / CELL_SIZE);
// 0 = passable, 1 = blocked

export function getChunkPathGrid(chunkMeta) {
    const grid = new Uint8Array(COLS * ROWS);
    const list = chunkMeta?.resources;
    if (Array.isArray(list)) {
        const offsetX = (chunkMeta?.chunkX || 0) * CHUNK_WIDTH;
        const offsetY = (chunkMeta?.chunkY || 0) * CHUNK_HEIGHT;
        for (let i = 0; i < list.length; i++) {
            const r = list[i];
            const blocking =
                typeof r?.getData === 'function' ? r.getData('blocking') : r?.blocking;
            if (!blocking) continue;
            const x = (r.x || 0) - offsetX;
            const y = (r.y || 0) - offsetY;
            const c = (x / CELL_SIZE) | 0;
            const rIdx = (y / CELL_SIZE) | 0;
            if (c >= 0 && c < COLS && rIdx >= 0 && rIdx < ROWS) {
                grid[rIdx * COLS + c] = 1;
            }
        }
    }
    return {
        width: COLS,
        height: ROWS,
        cellSize: CELL_SIZE,
        data: grid,
    };
}
