// systems/resourceSystem.js
// Handles world resource spawning in a Phaser-agnostic way.
import { WORLD_GEN } from './world_gen/worldGenConfig.js';
import { DESIGN_RULES } from '../data/designRules.js';
import { RESOURCE_DB } from '../data/resourceDatabase.js';
import { getResourceRegistry } from './world_gen/resources/registry.js';
import { getBiome } from './world_gen/biomes/biomeMap.js';
import { getDensity } from './world_gen/noise.js';
import * as poissonSampler from './world_gen/resources/poissonSampler.js';
import './world_gen/resources/index.js';

const DEFAULT_CLUSTER_GROWTH = 0.3;

// Biased cluster size picker favors single spawns
export function pickClusterCount(min, max, rng = Math.random, growthChance = DEFAULT_CLUSTER_GROWTH) {
    let count = min;
    while (count < max && rng() < growthChance) count++;
    return count;
}

function createResourceSystem(scene) {
    // Background job timers for time-sliced chunk population
    const _chunkJobs = new Map(); // key: "cx,cy" -> Phaser.TimerEvent
    // Ensure resource collision/overlap systems are set up once
    function ensureColliders() {
        if (!scene.player || !scene.physics) return;
        if (!scene._resourcesCollider) {
            if (!scene.resources) return; // wait until group exists
            scene._resourcesCollider = scene.physics.add.collider(
                scene.player,
                scene.resources,
                null,
                (player, obj) => !!obj.getData('blocking'),
                scene,
            );
        }
        if (!scene._resourcesColliderDyn) {
            if (!scene.resourcesDyn) return;
            scene._resourcesColliderDyn = scene.physics.add.collider(
                scene.player,
                scene.resourcesDyn,
                null,
                (player, obj) => !!obj.getData('blocking'),
                scene,
            );
        }

        if (!scene._bushSlowOverlap) {
            if (!scene.player || !scene.resources || !scene.zombies) return;
            const markBush = (ent, obj) => {
                if (obj.getData('bush')) ent._inBush = true;
            };
            scene._bushSlowOverlap = [
                scene.physics.add.overlap(
                    scene.player,
                    scene.resources,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.zombies,
                    scene.resources,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.player,
                    scene.resourcesDyn,
                    markBush,
                    null,
                    scene,
                ),
                scene.physics.add.overlap(
                    scene.zombies,
                    scene.resourcesDyn,
                    markBush,
                    null,
                    scene,
                ),
            ];
            const slow = DESIGN_RULES.movement?.bushSlowMultiplier ?? 0.5;
            scene._bushSlowUpdate = () => {
                const p = scene.player;
                if (p) {
                    p._speedMult = p._inBush ? slow : 1;
                    p._inBush = false;
                }
                const zs = scene.zombies.getChildren();
                for (let i = 0; i < zs.length; i++) {
                    const z = zs[i];
                    z._speedMult = z._inBush ? slow : 1;
                    z._inBush = false;
                }
            };
            scene.events.on('update', scene._bushSlowUpdate);
            scene.events.once('shutdown', () => {
                scene.events.off('update', scene._bushSlowUpdate);
                scene._bushSlowUpdate = null;
            });
        }
    }
    // ----- Public API -----
    function _keyForChunk(c) {
        return `${c.cx},${c.cy}`;
    }

    function _cancelChunkJob(chunk) {
        const key = _keyForChunk(chunk);
        const t = _chunkJobs.get(key);
        if (t) {
            try { t.remove(false); } catch {}
            _chunkJobs.delete(key);
        }
    }

    function spawnChunkResources(chunk) {
        // Make sure physics interactions exist before creating any resources
        ensureColliders();
        const registry = getResourceRegistry();
        const size = WORLD_GEN.chunk.size;
        const bounds = {
            minX: chunk.cx * size,
            minY: chunk.cy * size,
            maxX: (chunk.cx + 1) * size,
            maxY: (chunk.cy + 1) * size,
        };

        const meta = chunk.meta;
        meta.resources = meta.resources || [];
        const resources = meta.resources;

        if (resources.length === 0) {
            const totalTarget = Phaser.Math.Between(35, 45);
            const centers = poissonSampler.generate(bounds, 40);
            Phaser.Utils.Array.Shuffle(centers);
            let total = 0;
            for (let i = 0; i < centers.length && total < totalTarget; i++) {
                const c = centers[i];
                const biome = getBiome((c.x / size) | 0, (c.y / size) | 0);
                const weights = WORLD_GEN.spawns.resourceWeights?.[biome];
                let key;
                if (weights && weights.length) {
                    let wTotal = 0;
                    for (let j = 0; j < weights.length; j++) {
                        wTotal += weights[j].weight || 0;
                    }
                    let r = Math.random() * wTotal;
                    for (let j = 0; j < weights.length; j++) {
                        r -= weights[j].weight || 0;
                        if (r <= 0) {
                            key = weights[j].key;
                            break;
                        }
                    }
                }
                if (!key) {
                    const keys = Array.from(registry.keys());
                    key = Phaser.Utils.Array.GetRandom(keys);
                }
                const gen = registry.get(key);
                const cfg = gen && gen();
                if (!cfg) continue;
                const clusterChance = cfg.clusterChance ?? 0.5;
                const clusterRadius = cfg.clusterRadius ?? cfg.minSpacing ?? 50;
                const clusterMin = cfg.clusterMin ?? 1;
                const clusterMax = cfg.clusterMax ?? 1;
                let clusterCount =
                    Math.random() < clusterChance
                        ? Phaser.Math.Between(clusterMin, clusterMax)
                        : 1;
                const remaining = totalTarget - total;
                clusterCount = Math.min(clusterCount, remaining);
                const cfgOverride = {
                    ...cfg,
                    clusterMin: clusterCount,
                    clusterMax: clusterCount,
                    clusterRadius,
                    minSpacing: cfg.minSpacing,
                };
                const spawned =
                    _spawnResourceGroup(key, cfgOverride, {
                        bounds: {
                            minX: Math.round(c.x),
                            maxX: Math.round(c.x),
                            minY: Math.round(c.y),
                            maxY: Math.round(c.y),
                        },
                        count: clusterCount,
                        noRespawn: true,
                        proximityGroup: chunk.group,
                        onCreate(trunk, id, x, y) {
                            chunk.group.add(trunk);
                            const idx =
                                resources.push({
                                    type: key,
                                    id,
                                    x,
                                    y,
                                    harvested: false,
                                }) - 1;
                            trunk.setData('chunkIdx', idx);
                            trunk.setData('chunk', chunk);
                        },
                        onHarvest(trunk) {
                            const idx = trunk.getData('chunkIdx');
                            if (idx != null) resources[idx].harvested = true;
                        },
                    }) | 0;
                total += spawned;
            }
        } else {
            for (let i = 0; i < resources.length; i++) {
                const r = resources[i];
                if (r.harvested) continue;
                const cfg = {
                    variants: [{ id: r.id, weight: 1 }],
                    clusterMin: 1,
                    clusterMax: 1,
                };
                _spawnResourceGroup(r.type, cfg, {
                    bounds: {
                        minX: r.x,
                        maxX: r.x,
                        minY: r.y,
                        maxY: r.y,
                    },
                    count: 1,
                    noRespawn: true,
                    proximityGroup: chunk.group,
                    onCreate(trunk) {
                        chunk.group.add(trunk);
                        trunk.setData('chunkIdx', i);
                        trunk.setData('chunk', chunk);
                    },
                    onHarvest() {
                        resources[i].harvested = true;
                    },
                });
            }
        }
    }

    function spawnAllResources() {
        const registry = getResourceRegistry();
        for (const [key, gen] of registry.entries()) {
            const cfg = gen();
            if (!cfg) continue;
            const count = _spawnResourceGroup(key, cfg);
            console.log(`resources: ${key}=${count}`);
        }
        // After global spawn, set up interactions once
        ensureColliders();
    }

    // ----- Internal Helpers -----
    function _spawnResourceGroup(groupKey, groupCfg, opts = {}) {
        const variants = Array.isArray(groupCfg?.variants)
            ? groupCfg.variants
            : null;
        if (!variants || variants.length === 0) return;

        const maxActive =
            opts.count ??
            groupCfg.maxActive ??
            Phaser.Math.Between(
                groupCfg.minCount ?? 8,
                groupCfg.maxCount ?? 12,
            );
        const minSpacing = groupCfg.minSpacing ?? 48;
        const respawnMin = groupCfg.respawnDelayMs?.min ?? 5000;
        const respawnMax = groupCfg.respawnDelayMs?.max ?? 7000;
        const clusterMin = groupCfg.clusterMin ?? 3;
        const clusterMax = groupCfg.clusterMax ?? 6;

        const w = WORLD_GEN.world.width;
        const h = WORLD_GEN.world.height;
        const bounds = opts.bounds || {};
        const minX = bounds.minX ?? 0;
        const maxX = bounds.maxX ?? w;
        const minY = bounds.minY ?? 0;
        const maxY = bounds.maxY ?? h;
        const chunkSize = WORLD_GEN.chunk.size;
        const noRespawn = !!opts.noRespawn;
        const onCreate = opts.onCreate;
        const onHarvest = opts.onHarvest;
        const densityFn = opts.getDensity || getDensity;
        const biomeFn = opts.getBiome || getBiome;

        const tooClose = (x, y, w, h) => {
            // Prefer proximity-limited list (e.g., the current chunk's group) to avoid global N^2 scans
            const proxGroup = opts.proximityGroup;
            let children = [];
            if (proxGroup && proxGroup.getChildren) {
                children = proxGroup.getChildren();
                // Also consider decorative overlays (e.g., tree canopies, stump tops)
                // because trunks may be cropped and decor sprites extend the visual footprint.
                if (scene.resourcesDecor && scene.resourcesDecor.getChildren) {
                    children = children.concat(scene.resourcesDecor.getChildren());
                }
            } else {
                const a = (scene.resources && scene.resources.getChildren) ? scene.resources.getChildren() : [];
                const b = (scene.resourcesDyn && scene.resourcesDyn.getChildren) ? scene.resourcesDyn.getChildren() : [];
                const c = (scene.resourcesDecor && scene.resourcesDecor.getChildren) ? scene.resourcesDecor.getChildren() : [];
                children = a.concat(b, c);
            }
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                if (!c.active) continue;
                const margin = (groupCfg.minSpacing ?? 0) * 0.5; // use half-spacing per axis
                const halfW = (c.displayWidth + w) * 0.5 + margin;
                const halfH = (c.displayHeight + h) * 0.5 + margin;
                const dx = c.x - x;
                const dy = c.y - y;
                if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) return true;
            }
            return false;
        };

        const pickVariantId = (biome, baseKey) => {
            let total = 0;
            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                if (baseKey && !v.id.startsWith(baseKey)) continue;
                const bs = v.biomes;
                if (bs && bs.indexOf && bs.indexOf(biome) === -1) continue;
                total += v.weight || 0;
            }
            if (total <= 0) return null;
            let r = Math.random() * total;
            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                if (baseKey && !v.id.startsWith(baseKey)) continue;
                const bs = v.biomes;
                if (bs && bs.indexOf && bs.indexOf(biome) === -1) continue;
                r -= v.weight || 0;
                if (r <= 0) return v.id;
            }
            return null;
        };

        const createResourceAt = (id, def, x, y) => {
            x = Math.round(x);
            y = Math.round(y);
            const originX = def.world?.origin?.x ?? 0.5;
            const originY = def.world?.origin?.y ?? 0.5;
            const scale = def.world?.scale ?? 1;
            const texKey = def.world?.textureKey || id;

            const isBush = !!def.tags?.includes('bush');
            const isBlocking = !!def.blocking;
            const needsPhysics = isBlocking || isBush;

            const depthOff = Math.floor(y) % 899;
            const trunkDepthBase = def.trunkDepth ?? def.depth ?? 5;
            const playerDepth = scene.player?.depth ?? 900;
            let trunkDepth = trunkDepthBase + depthOff;
            if (trunkDepth >= playerDepth) trunkDepth -= 899;

            let trunk;
            const bodyCfg = def.world?.body;
            // REVERT: Always create dynamic physics bodies for resources that need physics
            if (needsPhysics) {
                trunk = scene.physics.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth(trunkDepth)
                    .setImmovable(true)
                    .setPosition(x, y);
                if (scene.resourcesDyn && scene.resourcesDyn.add) scene.resourcesDyn.add(trunk);
            } else {
                trunk = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth(trunkDepth);
                scene.resourcesDecor && scene.resourcesDecor.add(trunk);
            }

            trunk.setData('blocking', isBlocking);

            if (isBlocking && def.tags?.includes('rock')) {
                const frameW = trunk.width;
                const frameH = trunk.height;
                const topH = frameH * 0.5;
                const top = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    .setDepth((scene.player?.depth ?? 900) + 2 + depthOff)
                    .setCrop(0, 0, frameW, topH);
                scene.resourcesDecor && scene.resourcesDecor.add(top);
                top.setData('noHitboxDebug', true);
                trunk.setCrop(0, topH, frameW, frameH - topH);
                trunk.setData('topSprite', top);
                trunk.once('destroy', () => top.destroy());
            }

            if (isBush) trunk.setData('bush', true);

            if (needsPhysics && trunk.body) {
                const b = trunk.body;
                if (typeof b.setAllowGravity === 'function') b.setAllowGravity(false);

                if (isBush) {
                    // Circular slow zone centered on the bush sprite
                    const dispW = trunk.displayWidth;
                    const dispH = trunk.displayHeight;
                    const r = Math.min(dispW, dispH) * 0.36;
                    const ox = dispW * 0.5 - r;
                    const oy = dispH * 0.5 - r;
                    if (typeof b.setCircle === 'function') b.setCircle(r, ox, oy);
                    else if (typeof b.setSize === 'function') b.setSize(2 * r, 2 * r);
                    if (typeof b.setOffset === 'function') b.setOffset(ox, oy);
                } else if (bodyCfg) {
                    const frameW = trunk.width;
                    const frameH = trunk.height;
                    const dispW = trunk.displayWidth;
                    const dispH = trunk.displayHeight;

                    const scaleX = trunk.scaleX || 1;
                    const scaleY = trunk.scaleY || 1;
                    const useScale = !!bodyCfg.useScale;

                    let bw, bh, br;
                    if (bodyCfg.kind === 'circle') {
                        br = useScale
                            ? bodyCfg.radius * scaleX
                            : bodyCfg.radius;
                        bw = bh = 2 * br;
                    } else {
                        bw = useScale ? bodyCfg.width * scaleX : bodyCfg.width;
                        bh = useScale
                            ? bodyCfg.height * scaleY
                            : bodyCfg.height;
                    }

                    const anchorSpaceW = useScale ? dispW : frameW;
                    const anchorSpaceH = useScale ? dispH : frameH;

                    const anchor = bodyCfg.anchor || 'topLeft';
                    let baseX = 0,
                        baseY = 0;
                    switch (anchor) {
                        case 'center':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = (anchorSpaceH - bh) * 0.5;
                            break;
                        case 'topCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = 0;
                            break;
                        case 'bottomCenter':
                            baseX = (anchorSpaceW - bw) * 0.5;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'bottomLeft':
                            baseX = 0;
                            baseY = anchorSpaceH - bh;
                            break;
                        case 'topLeft':
                        default:
                            baseX = 0;
                            baseY = 0;
                            break;
                    }

                    const addX = useScale
                        ? (bodyCfg.offsetX || 0) * scaleX
                        : bodyCfg.offsetX || 0;
                    const addY = useScale
                        ? (bodyCfg.offsetY || 0) * scaleY
                        : bodyCfg.offsetY || 0;
                    const ox = baseX + addX;
                    const oy = baseY + addY;

                    if (bodyCfg.kind === 'circle' && typeof b.setCircle === 'function') {
                        b.setCircle(br, ox, oy);
                    } else {
                        if (typeof b.setSize === 'function') b.setSize(bw, bh);
                        if (typeof b.setOffset === 'function') b.setOffset(ox, oy);
                    }
                    // static bodies are inherently immovable; for dynamic, guard the call
                    if (typeof b.setImmovable === 'function') b.setImmovable(true);
                } else {
                    if (isBlocking) {
                        if (typeof b.setImmovable === 'function') b.setImmovable(true);
                    } else {
                            if (typeof b.setSize === 'function') b.setSize(trunk.displayWidth, trunk.displayHeight);
                            // Center align rect within the sprite's display frame
                            if (typeof b.setOffset === 'function') {
                                const ox = (trunk.displayOriginX || trunk.displayWidth * 0.5) - trunk.displayWidth * 0.5;
                                const oy = (trunk.displayOriginY || trunk.displayHeight * 0.5) - trunk.displayHeight * 0.5;
                                b.setOffset(ox, oy);
                            }
                        }
                        if (typeof b.setImmovable === 'function') b.setImmovable(true);
                    }
                // Important for static bodies: refresh after size/offset/scale/origin/crop changes
                if (b.moves === false && typeof trunk.refreshBody === 'function') {
                    try { trunk.refreshBody(); } catch {}
                }
                }

            const leavesCfg = def.world?.leaves;
            if (leavesCfg) {
                const frameW = trunk.width;
                const frameH = trunk.height;

                const lwCfg = leavesCfg.width;
                let lhCfg = leavesCfg.height;
                // Anchor computations need a provisional width/height
                const lwAnchor = Math.max(1, Math.min(frameW, lwCfg || 0));
                const lhAnchor = Math.max(0, Math.min(frameH, lhCfg || 0));

                const anchor = leavesCfg.anchor || 'topLeft';
                let baseX = 0,
                    baseY = 0;
                switch (anchor) {
                    case 'center':
                        baseX = (frameW - lwAnchor) * 0.5;
                        baseY = (frameH - lhAnchor) * 0.5;
                        break;
                    case 'topCenter':
                        baseX = (frameW - lwAnchor) * 0.5;
                        baseY = 0;
                        break;
                    case 'bottomCenter':
                        baseX = (frameW - lwAnchor) * 0.5;
                        baseY = frameH - lhAnchor;
                        break;
                    case 'bottomLeft':
                        baseX = 0;
                        baseY = frameH - lhAnchor;
                        break;
                    case 'topLeft':
                    default:
                        baseX = 0;
                        baseY = 0;
                        break;
                }

                const addX = leavesCfg.offsetX || 0;
                const addY = leavesCfg.offsetY || 0;
                const cropX = baseX + addX;
                const cropY = baseY + addY;

                // Use database-configured canopy height but verify trunk collider alignment.
                const trunkBody = trunk && trunk.body;
                let canopyHeight = lhCfg;
                if (trunkBody && Number.isFinite(trunkBody.top)) {
                    // World-space Y of the top edge of the sprite frame (accounts for origin and scale)
                    const topWorldY = y - (trunk.displayHeight * (originY || 0)); // originY=1 => bottom-aligned
                    const scaleY = trunk.scaleY || 1;
                    // Use a ceiled trunk top so the crop line does not sit above the collider
                    const trunkTop = Math.ceil(trunkBody.top);
                    // Distance from top of sprite to the trunk hitbox top, converted to source frame pixels
                    const distFrame = (trunkTop - topWorldY) / scaleY;
                    // Subtract cropY because our cropped leaves start at cropY within the frame
                    const calcHeight = Math.ceil(
                        Phaser.Math.Clamp(distFrame - cropY, 0, Math.max(0, frameH - cropY))
                    );
                    if (calcHeight !== canopyHeight) {
                        console.warn(`leaves.height mismatch for ${id}: DB=${canopyHeight} vs calc=${calcHeight}`);
                    }
                }
                // Ensure sane bounds
                const lw = Math.max(1, Math.min(frameW, lwCfg));
                const lh = Math.max(0, Math.min(frameH - cropY, canopyHeight));

                trunk.setCrop(0, cropY + lh, frameW, Math.max(0, frameH - (cropY + lh)));

                const leaves = scene.add
                    .image(x, y, texKey)
                    .setOrigin(originX, originY)
                    .setScale(scale)
                    // Depth: render canopy overlays above player so player walks under
                    .setDepth((() => {
                        // Force canopy above player with slight offset for stable ordering
                        const orderJitter = depthOff % 10; // keep within a small band
                        return (playerDepth + 2 + orderJitter);
                    })())
                    .setCrop(cropX, cropY, lw, lh);
                scene.resourcesDecor && scene.resourcesDecor.add(leaves);
                leaves.setData('noHitboxDebug', true);
                const dispW = trunk.displayWidth;
                const dispH = trunk.displayHeight;
                const scaleX = trunk.scaleX || 1;
                const scaleY = trunk.scaleY || 1;
                const useScale = !!leavesCfg.useScale;

                // Build sensor column used to fade leaves when player is "under" the canopy.
                // Build the canopy overlap rectangle used to fade leaves.
                // Request: make this rect span from the TOP of the trunk hitbox up to the TOP of the leaves,
                // with the width equal to the widest part of the leaves (configured leaves width).
                const BODY = trunk && trunk.body;
                const lCfg = def.world?.leaves;
                let rect;
                if (lCfg && BODY && Number.isFinite(BODY.top)) {
                    const sx = trunk.scaleX || 1;
                    const sy = trunk.scaleY || 1;
                    const useScale = !!lCfg.useScale;

                    // Width equals leaves overlay width (widest leaves) in world space
                    const rectW = (lCfg.width || 0) * (useScale ? sx : 1);

                    // Compute world X for rect left: center above trunk, allow offsetX from config
                    const dispLeft = trunk.x - (trunk.displayOriginX || trunk.displayWidth * 0.5);
                    const rectLeft = dispLeft + (trunk.displayWidth - rectW) * 0.5
                        + ((lCfg.offsetX || 0) * (useScale ? sx : 1));

                    // Vertical bounds: from trunk body TOP to leaves TOP in world space
                    const trunkTop = Math.ceil(Number.isFinite(BODY.top) ? BODY.top : BODY.y);

                    // Determine display-space top of leaves crop based on anchor and baseY
                    const frameTop = trunk.y - (trunk.displayOriginY || trunk.displayHeight * 0.5);
                    let baseY = 0;
                    switch (lCfg.anchor || 'topLeft') {
                        case 'center':
                            baseY = (trunk.height - lCfg.height) * 0.5;
                            break;
                        case 'topCenter':
                        case 'topLeft':
                            baseY = 0;
                            break;
                        case 'bottomCenter':
                        case 'bottomLeft':
                            baseY = trunk.height - lCfg.height;
                            break;
                        default:
                            baseY = 0;
                            break;
                    }
                    const leavesTop = frameTop
                        + (useScale ? baseY * sy : baseY)
                        + ((lCfg.offsetY || 0) * (useScale ? sy : 1));

                    const top = Math.min(trunkTop, leavesTop);
                    const bottom = Math.max(trunkTop, leavesTop);
                    const rectH = Math.max(0, bottom - top);

                    rect = new Phaser.Geom.Rectangle(rectLeft, top, Math.max(0, rectW), rectH);
                } else {
                    // Fallback to database-provided transparent box if available
                    const tCfg = def.world?.transparent;
                    const hasT = tCfg && Number.isFinite(tCfg.width) && Number.isFinite(tCfg.height);
                    if (hasT && BODY && Number.isFinite(BODY.top) && Number.isFinite(BODY.x) && Number.isFinite(BODY.width)) {
                        const bodyTop = Math.ceil(Number.isFinite(BODY.top) ? BODY.top : BODY.y);
                        const bodyX = BODY.x;
                        const bodyW = BODY.width;
                        const bodyCenterX = bodyX + bodyW * 0.5;
                        const useScale = !!tCfg.useScale;
                        const sx = trunk.scaleX || 1;
                        const sy = trunk.scaleY || 1;
                        const w = useScale ? tCfg.width * sx : tCfg.width;
                        const h = useScale ? tCfg.height * sy : tCfg.height;
                        const offX = useScale ? (tCfg.offsetX || 0) * sx : (tCfg.offsetX || 0);
                        const offY = useScale ? (tCfg.offsetY || 0) * sy : (tCfg.offsetY || 0);
                        const bottomY = bodyTop + offY;
                        const centerX = bodyCenterX + offX;
                        const left = centerX - w * 0.5;
                        const top = bottomY - h;
                        rect = new Phaser.Geom.Rectangle(left, top, Math.max(0, w), Math.max(0, h));
                    } else if (hasT) {
                        const useScale = !!tCfg.useScale;
                        const sx = trunk.scaleX || 1;
                        const sy = trunk.scaleY || 1;
                        const w = useScale ? tCfg.width * sx : tCfg.width;
                        const h = useScale ? tCfg.height * sy : tCfg.height;
                        const offX = useScale ? (tCfg.offsetX || 0) * sx : (tCfg.offsetX || 0);
                        const offY = useScale ? (tCfg.offsetY || 0) * sy : (tCfg.offsetY || 0);
                        const centerX = (trunk.x ?? x) + offX;
                        const bottomY = (trunk.y ?? y) + offY;
                        const left = centerX - w * 0.5;
                        const top = bottomY - h;
                        rect = new Phaser.Geom.Rectangle(left, top, Math.max(0, w), Math.max(0, h));
                    } else {
                        rect = null;
                    }
                }

                scene._treeLeaves = scene._treeLeaves || [];
                // Identify stump overlays so we can skip fade behavior
                // Use id/texture name only; ignore tags to avoid mislabeling trees
                const isStumpRes = /^stump/i.test(id) || /stump/i.test(texKey);
                const data = { leaves, rect };
                if (!isStumpRes && rect) {
                    scene._treeLeaves.push(data);
                }
                trunk.once('destroy', () => {
                    leaves.destroy();
                    const idx = scene._treeLeaves.indexOf(data);
                    if (idx !== -1) scene._treeLeaves.splice(idx, 1);
                });

                if (!scene._treeLeavesUpdate) {
                    const playerRect = new Phaser.Geom.Rectangle();
                    scene._treeLeavesUpdate = () => {
                        // Use physics hitbox as the source of truth so only canopy over the hitbox fades
                        const p = scene.player;
                        if (!p) return;
                        if (p.body) {
                            const pb = p.body;
                            playerRect.x = pb.x;
                            playerRect.y = pb.y;
                            playerRect.width = pb.width;
                            playerRect.height = pb.height;
                        } else if (typeof p.getBounds === 'function') {
                            const b = p.getBounds();
                            playerRect.x = b.x;
                            playerRect.y = b.y;
                            playerRect.width = b.width;
                            playerRect.height = b.height;
                        } else {
                            return;
                        }
                        // Use exact collider bounds for precise fade start at trunk top
                        for (const d of scene._treeLeaves) {
                            const overlap =
                                Phaser.Geom.Intersects.RectangleToRectangle(
                                    playerRect,
                                    d.rect,
                                );
                            d.leaves.setAlpha(overlap ? 0.25 : 1);
                        }
                    };
                    // Throttle updates with a timer instead of every frame
                    scene._treeLeavesTimer = scene.time.addEvent({
                        delay: 120,
                        loop: true,
                        callback: scene._treeLeavesUpdate,
                    });
                    scene.events.once('shutdown', () => {
                        try { scene._treeLeavesTimer?.remove(false); } catch {}
                        scene._treeLeavesTimer = null;
                        scene._treeLeaves = [];
                        scene._treeLeavesUpdate = null;
                    });
                }
            }

            if (def.collectible) {
                trunk.setInteractive();
                trunk.on('pointerdown', (pointer) => {
                    if (!pointer.rightButtonDown()) return;
                    const pickupRange = 40;
                    const d2 = Phaser.Math.Distance.Squared(
                        scene.player.x,
                        scene.player.y,
                        trunk.x,
                        trunk.y,
                    );
                    if (d2 > pickupRange * pickupRange) return;

                    if (def.givesItem && scene.uiScene?.inventory) {
                        scene.uiScene.inventory.addItem(
                            def.givesItem,
                            def.giveAmount || 1,
                        );
                    }
                    if (onHarvest) onHarvest(trunk, id, x, y);
                    if (needsPhysics) {
                        try { trunk.destroy(); } catch {}
                    } else if (scene.resourcePool) {
                        scene.resourcePool.release(trunk);
                    } else {
                        trunk.destroy();
                    }
                    if (!noRespawn) {
                        scene.time.delayedCall(
                            Phaser.Math.Between(respawnMin, respawnMax),
                            () => {
                                if (scene.resources.countActive(true) < maxActive)
                                    spawnCluster();
                            },
                        );
                    }
                });
            }
            if (onCreate) onCreate(trunk, id, x, y);
        };

        const spawnCluster = () => {
            let x,
                y,
                biome,
                baseId,
                baseDef,
                baseWidth = 0,
                baseHeight = 0,
                tries = 30,
                density = 0;
            do {
                x = Math.round(Phaser.Math.Between(minX, maxX));
                y = Math.round(Phaser.Math.Between(minY, maxY));
                biome = biomeFn((x / chunkSize) | 0, (y / chunkSize) | 0);
                baseId = pickVariantId(biome);
                baseDef = baseId ? RESOURCE_DB[baseId] : null;
                if (baseDef) {
                    const baseTex = scene.textures.get(baseDef.world?.textureKey || baseId);
                    const baseSrc = baseTex.getSourceImage();
                    const baseScale = baseDef.world?.scale ?? 1;
                    baseWidth = baseSrc.width * baseScale;
                    baseHeight = baseSrc.height * baseScale;
                    const seed = WORLD_GEN.biomeSeeds[biome] || 0;
                    density = densityFn(x, y, seed);
                }
                tries--;
            } while (
                tries > 0 &&
                (!baseDef || density < 0.5 || tooClose(x, y, baseWidth, baseHeight))
            );
            if (tries <= 0 || !baseDef) return 0;

            createResourceAt(baseId, baseDef, x, y);
            let spawned = 1;
            const growthChance = groupCfg.clusterGrowth ?? DEFAULT_CLUSTER_GROWTH;
            const clusterCount = pickClusterCount(
                clusterMin,
                clusterMax,
                Math.random,
                growthChance,
            );
            const radius =
                groupCfg.clusterRadius ?? Math.max(baseWidth, baseHeight) * 1.1;
            const baseKey = baseId.replace(/[A-Za-z0-9]$/, '');
            for (
                let i = 1;
                i < clusterCount && scene.resources.countActive(true) < maxActive;
                i++
            ) {
                const id2 = pickVariantId(biome, baseKey);
                const def2 = id2 ? RESOURCE_DB[id2] : null;
                if (!def2) continue;
                let cfg2 = null;
                for (let k = 0; k < variants.length; k++) {
                    if (variants[k].id === id2) { cfg2 = variants[k]; break; }
                }
                const tex2 = scene.textures.get(def2.world?.textureKey || id2);
                const src2 = tex2.getSourceImage();
                const scale2 = def2.world?.scale ?? 1;
                const w = src2.width * scale2;
                const h = src2.height * scale2;
                let x2,
                    y2,
                    t2 = 10,
                    d2 = 0;
                do {
                    const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
                    const dist = radius * Math.sqrt(Math.random());
                    x2 = Math.round(x + Math.cos(ang) * dist);
                    y2 = Math.round(y + Math.sin(ang) * dist);
                    const biome2 = biomeFn((x2 / chunkSize) | 0, (y2 / chunkSize) | 0);
                    const bs = cfg2?.biomes;
                    if (bs && bs.indexOf && bs.indexOf(biome2) === -1) {
                        t2--;
                        continue;
                    }
                    const seed2 = WORLD_GEN.biomeSeeds[biome2] || 0;
                    d2 = densityFn(x2, y2, seed2);
                    t2--;
                } while (t2 > 0 && (d2 < 0.5 || tooClose(x2, y2, w, h)));
                if (t2 <= 0) continue;
                createResourceAt(id2, def2, x2, y2);
                spawned++;
            }

            return spawned;
        };

        let spawned = 0,
            attempts = 0;
        while (spawned < maxActive && attempts < maxActive * 10) {
            spawned += spawnCluster();
            attempts++;
        }
        return spawned;
    }

    // ----- Dev Helpers -----
    function spawnWorldItem(id, pos) {
        const def = RESOURCE_DB[id];
        if (!def) return;
        const x = Math.round(pos.x);
        const y = Math.round(pos.y);
        const depthOff = y % 899;
        const obj = scene.add
            .image(x, y, def.world?.textureKey || id)
            .setDepth((def.depth ?? 5) + depthOff)
            .setScale(def.world?.scale ?? 1);
        scene.physics.add.existing(obj);
        obj.body.setAllowGravity(false);
    }

    // Expose API on the scene and return it for convenience
    scene.resourceSystem = {
        spawnAllResources,
        spawnWorldItem,
        spawnChunkResources,
        cancelChunkJob: _cancelChunkJob,
        __testSpawnResourceGroup: _spawnResourceGroup,
    };

    return scene.resourceSystem;
}

export default createResourceSystem;
