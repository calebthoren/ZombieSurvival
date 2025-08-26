// systems/worldGen/ChunkManager.js
// Tracks player-centric chunks and emits activation/deactivation events.
export const CHUNK_WIDTH = 400;
export const CHUNK_HEIGHT = 300;
const ACTIVE_RADIUS = 1; // chunks around player kept active

export default class ChunkManager {
    constructor(scene, player, loader) {
        this.scene = scene;
        this.player = player;
        this.loader = loader;
        this._active = new Set();
        this._center = { x: NaN, y: NaN };
        this._onUpdate = () => this._update();
        scene.events.on('update', this._onUpdate);
        scene.events.once('shutdown', () =>
            scene.events.off('update', this._onUpdate),
        );
        // initial activation
        this._update();
    }

    _update() {
        const cx = Math.floor(this.player.x / CHUNK_WIDTH);
        const cy = Math.floor(this.player.y / CHUNK_HEIGHT);
        if (cx === this._center.x && cy === this._center.y) return;
        this._center.x = cx;
        this._center.y = cy;
        const next = new Set();
        for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
            for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy++) {
                const x = cx + dx;
                const y = cy + dy;
                const key = `${x},${y}`;
                next.add(key);
                if (!this._active.has(key)) {
                    const meta = this.loader
                        ? this.loader.load(x, y)
                        : { chunkX: x, chunkY: y };
                    this.scene.events.emit('chunk:activate', meta);
                }
            }
        }
        for (const key of this._active) {
            if (!next.has(key)) {
                const [x, y] = key.split(',').map(Number);
                this.scene.events.emit('chunk:deactivate', { chunkX: x, chunkY: y });
            }
        }
        this._active = next;
    }
}
