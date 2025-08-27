// systems/world_gen/chunks/Chunk.js
// Basic world chunk container handling entity group and metadata.

export default class Chunk {
    constructor(cx, cy, meta = {}) {
        this.cx = cx;
        this.cy = cy;
        this.group = null;
        this.meta = meta;
    }

    load(scene) {
        if (!this.group) {
            this.group = scene.add.group();
        }
        this.group.active = true;
        return this.group;
    }

    unload() {
        if (this.group) {
            this.group.destroy(true);
            this.group = null;
        }
        return this.meta;
    }

    serialize() {
        return {
            cx: this.cx,
            cy: this.cy,
            meta: { ...this.meta },
        };
    }
}

