// systems/lightingSystem.js
// Centralizes lighting: overlay, geometry mask, and light bindings.
// This system operates on the provided scene and stores state on the scene
// so existing code/tests that reference scene properties continue to work.

export default function createLightingSystem(scene) {
  function _ensureLightMaskScratch() {
    let scratch = scene._lightMaskScratch;
    if (!scratch || typeof scratch !== 'object' || Array.isArray(scratch)) {
      scratch = { lights: [], gradientCache: Object.create(null) };
      scene._lightMaskScratch = scratch;
      return scratch;
    }
    if (!Array.isArray(scratch.lights)) scratch.lights = [];
    if (!scratch.gradientCache) scratch.gradientCache = Object.create(null);
    return scratch;
  }

  function _collectActiveMaskLights() {
    const scratch = _ensureLightMaskScratch();
    const lights = scratch.lights;
    lights.length = 0;
    if (!Array.isArray(scene._lightBindings) || scene._lightBindings.length === 0) return lights;
    for (let i = 0; i < scene._lightBindings.length; i++) {
      const binding = scene._lightBindings[i];
      if (!binding) continue;
      // Check if light should be drawable based on radius, intensity, and target validity
      if (!Number.isFinite(binding.radius) || binding.radius <= 0) continue;
      const intensity = Number.isFinite(binding.intensity) ? binding.intensity : 0;
      if (intensity <= 0.001) continue;
      // Check if target is still valid
      const target = binding.target;
      if (target && (target.active === false || target.scene !== scene)) continue;
      lights.push(binding);
    }
    return lights;
  }

  function _buildLightMaskGradient(tileSize, tileCount) {
    const Phaser = globalThis.Phaser || {};
    const baseRadius = Math.max(tileSize * 0.5, (tileCount - 0.5) * tileSize);
    const layers = new Array(tileCount);
    for (let ring = 0; ring < tileCount; ring++) {
      const offsets = [];
      if (ring === 0) {
        offsets.push(0, 0);
      } else {
        for (let dx = -ring; dx <= ring; dx++) {
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            offsets.push(dx, dy);
          }
        }
      }
      const normalized = tileCount <= 1 ? 0 : ring / (tileCount - 1);
      const falloff = Phaser?.Math?.Easing?.Quadratic?.Out
        ? Phaser.Math.Easing.Quadratic.Out(1 - normalized)
        : 1 - normalized;
      const alpha = Math.min(Math.max(0.05 + falloff * 0.95, 0), 1);
      const minInnerRadiusNormalized = 0.35;
      const ringRadiusNormalized = tileCount <= 1 ? 1 : (ring + 1) / tileCount;
      const radiusNormalized = Math.min(
        Math.max(ringRadiusNormalized, minInnerRadiusNormalized),
        1,
      );
      layers[ring] = {
        alpha: Math.min(Math.max(alpha, 0), 1),
        offsets,
        radiusNormalized,
      };
    }
    return { tileSize, ringCount: tileCount, baseRadius, layers };
  }

  function _getLightMaskGradientDefinition(binding) {
    const Phaser = globalThis.Phaser || {};
    const scratch = _ensureLightMaskScratch();
    let cache = scratch.gradientCache;
    if (!cache) cache = scratch.gradientCache = Object.create(null);

    const NIGHT_MASK_DEFAULT_TILE_SIZE = 16;
    const NIGHT_MASK_DEFAULT_TILE_COUNT = 5;

    const tileSizeSource = Number.isFinite(binding?.maskTileSize)
      ? binding.maskTileSize
      : NIGHT_MASK_DEFAULT_TILE_SIZE;
    const tileSize = Phaser?.Math?.Clamp
      ? Phaser.Math.Clamp(tileSizeSource, 1, 1024)
      : Math.min(Math.max(tileSizeSource, 1), 1024);

    const tileCountSource = Number.isFinite(binding?.maskTileCount)
      ? Math.round(binding.maskTileCount)
      : NIGHT_MASK_DEFAULT_TILE_COUNT;
    const tileCount = Phaser?.Math?.Clamp
      ? Phaser.Math.Clamp(tileCountSource, 1, 32)
      : Math.min(Math.max(tileCountSource, 1), 32);

    const cacheKey = `${tileSize}|${tileCount}`;
    if (cache[cacheKey]) return cache[cacheKey];

    const definition = _buildLightMaskGradient(tileSize, tileCount);
    cache[cacheKey] = definition;
    return definition;
  }

  // Ensure a full-screen RenderTexture we draw darkness directly into (no masks)
  function _ensureDarknessRT() {
    const w = scene.sys?.game?.config?.width ?? scene.scale?.width ?? 800;
    const h = scene.sys?.game?.config?.height ?? scene.scale?.height ?? 600;

    // Display RT (visible) that holds the composed darkness with punched holes
    let rt = scene.nightOverlayRT;
    if (!rt || !rt.scene || rt.width !== w || rt.height !== h) {
      try { scene.nightOverlayRT?.destroy?.(); } catch {}
      rt = scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setScrollFactor(0).setDepth(10000);
      scene.nightOverlayRT = rt;
    }

    // Vector graphics used to draw circles that we erase with
    let gfx = scene.nightOverlayMaskGraphics;
    if (!gfx || !gfx.scene) {
      try { gfx?.destroy?.(); } catch {}
      gfx = scene.make.graphics({ x: 0, y: 0, add: false });
      scene.nightOverlayMaskGraphics = gfx;
    }

    return rt;
  }

  // Compose darkness directly into RT: fill black with overlay alpha, then erase circles for lights
  function _drawDarknessComposite(lights) {
    const Phaser = globalThis.Phaser || {};
    const rt = _ensureDarknessRT();
    const gfx = scene.nightOverlayMaskGraphics;
    if (!rt || !gfx) return;

    const w = rt.width;
    const h = rt.height;

    // Clear RT and paint the darkness based on overlay alpha
    rt.clear();
    const overlayAlpha = Number.isFinite(scene.nightOverlay?.alpha) ? (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(scene.nightOverlay.alpha, 0, 1) : Math.min(Math.max(scene.nightOverlay.alpha, 0), 1)) : 0;
    if (overlayAlpha <= 0) return; // no darkness to draw
    rt.fill(0x000000, overlayAlpha, 0, 0, w, h);

    // If no lights, we're done (solid darkness)
    if (!Array.isArray(lights) || lights.length === 0) return;

    // The RT is screen-space
    const cam = scene.cameras?.main;
    const scrollX = (cam?.scrollX || 0);
    const scrollY = (cam?.scrollY || 0);

    // Prepare Graphics once
    gfx.clear();

    for (let i = 0; i < lights.length; i++) {
      const b = lights[i];
      if (!b) continue;

      const rawR = Number.isFinite(b.radius) ? b.radius : 0;
      if (rawR <= 0) continue;

      const scale = Number.isFinite(b.maskScale) ? b.maskScale : 1;
      const intensity = Number.isFinite(b.intensity) ? b.intensity : 1;
      const effectiveR = rawR * scale * (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(intensity, 0, 1) : Math.min(Math.max(intensity, 0), 1));
      if (!(effectiveR > 0)) continue;

      // World -> screen coords
      const worldX = Number.isFinite(b.x) ? b.x : ((b.target?.x || 0) + (b.offsetX || 0));
      const worldY = Number.isFinite(b.y) ? b.y : ((b.target?.y || 0) + (b.offsetY || 0));
      const sx = worldX - scrollX;
      const sy = worldY - scrollY;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;

      // Soft erase: draw three circles with increasing strength and decreasing radius
      const coreR = effectiveR * 0.6;
      const midR  = effectiveR * 0.85;
      const edgeR = effectiveR;

      // Edge (lightest erase)
      gfx.fillStyle(0xffffff, 0.3);
      gfx.fillCircle(sx, sy, edgeR);
      rt.erase(gfx, 0, 0);
      gfx.clear();

      // Mid
      gfx.fillStyle(0xffffff, 0.6);
      gfx.fillCircle(sx, sy, midR);
      rt.erase(gfx, 0, 0);
      gfx.clear();

      // Core (strongest erase)
      gfx.fillStyle(0xffffff, 1.0);
      gfx.fillCircle(sx, sy, coreR);
      rt.erase(gfx, 0, 0);
      gfx.clear();
    }
  }

  // Back-compat helpers expected by tests
  function _ensureNightOverlayMask() {
    return _ensureDarknessRT();
  }

  function _drawNightOverlayMask() {
    const lights = _collectActiveMaskLights();
    _drawDarknessComposite(lights);
  }

  function _updateNightOverlayMask() {
    const overlay = scene.nightOverlay;
    if (!overlay) return;

    const lights = _collectActiveMaskLights();
    _drawDarknessComposite(lights);
  }

  function _teardownNightOverlayMask() {
    const rt = scene.nightOverlayRT;
    if (rt && typeof rt.destroy === 'function') rt.destroy();
    scene.nightOverlayRT = null;

    const gfx = scene.nightOverlayMaskGraphics;
    if (gfx && typeof gfx.destroy === 'function') gfx.destroy();
    scene.nightOverlayMaskGraphics = null;
  }

  function _removeLightBinding(light) {
    if (!Array.isArray(scene._lightBindings) || !light) return null;
    for (let i = scene._lightBindings.length - 1; i >= 0; i--) {
      const binding = scene._lightBindings[i];
      if (!binding || binding !== light) continue;
      const target = binding.target;
      if (target && typeof target.off === 'function' && binding.destroyHandler) {
        target.off('destroy', binding.destroyHandler);
      }
      scene._lightBindings.splice(i, 1);
      return binding;
    }
    return null;
  }

  function releaseWorldLight(light) {
    if (!light) return false;
    const removed = _removeLightBinding(light);
    if (removed) removed.active = false;
    return !!removed;
  }

  function applyLightPipeline(gameObject, _options = null) {
    return gameObject;
  }

  function attachLightToObject(target, cfg = {}) {
    const Phaser = globalThis.Phaser || {};
    if (!target) return null;
    if (!Array.isArray(scene._lightBindings)) scene._lightBindings = [];

    const offsetX = Number.isFinite(cfg.offsetX) ? cfg.offsetX : 0;
    const offsetY = Number.isFinite(cfg.offsetY) ? cfg.offsetY : 0;
    const radius = Number.isFinite(cfg.radius) ? cfg.radius : 0;
    const maskScale = Number.isFinite(cfg.maskScale) ? cfg.maskScale : 1;
    const intensity = Number.isFinite(cfg.intensity) ? cfg.intensity : 1;
    const maskTileSize = Number.isFinite(cfg.maskTileSize)
      ? (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(cfg.maskTileSize, 1, 1024) : Math.min(Math.max(cfg.maskTileSize, 1), 1024))
      : null;
    const maskTileCount = Number.isFinite(cfg.maskTileCount)
      ? (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(Math.round(cfg.maskTileCount), 1, 32) : Math.min(Math.max(Math.round(cfg.maskTileCount), 1), 32))
      : null;

    // Optional flicker controls (player-like behavior)
    const flickerAmplitude = Number.isFinite(cfg.flickerAmplitude) ? cfg.flickerAmplitude : 0;
    const flickerSpeed = Number.isFinite(cfg.flickerSpeed) ? cfg.flickerSpeed : 0;

    const binding = {
      target,
      offsetX,
      offsetY,
      radius,
      _baseRadius: radius,
      maskScale,
      intensity: (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(intensity, 0, 1) : Math.min(Math.max(intensity, 0), 1)),
      maskTileSize,
      maskTileCount,
      flickerAmplitude: flickerAmplitude < 0 ? 0 : flickerAmplitude,
      flickerSpeed: flickerSpeed < 0 ? 0 : flickerSpeed,
      _flickerPhase: Math.random() * (Phaser?.Math?.PI2 || Math.PI * 2),
      _flickerPhaseAlt: Math.random() * (Phaser?.Math?.PI2 || Math.PI * 2),
      active: intensity > 0 && radius > 0,
      x: (target.x || 0) + offsetX,
      y: (target.y || 0) + offsetY,
    };

    binding.destroyHandler = () => { releaseWorldLight(binding); };
    if (typeof target.once === 'function') target.once('destroy', binding.destroyHandler);

    scene._lightBindings.push(binding);
    return binding;
  }

  function _updateAttachedLights() {
    if (!Array.isArray(scene._lightBindings) || scene._lightBindings.length === 0) return;
    const Phaser = globalThis.Phaser || {};
    for (let i = scene._lightBindings.length - 1; i >= 0; i--) {
      const binding = scene._lightBindings[i];
      if (!binding) { scene._lightBindings.splice(i, 1); continue; }
      const target = binding.target;
      if (!target || target.active === false || target.scene !== scene) {
        releaseWorldLight(binding);
        continue;
      }
      // Always update position for valid targets
      const x = Number.isFinite(target.x) ? target.x : 0;
      const y = Number.isFinite(target.y) ? target.y : 0;
      binding.x = x + (binding.offsetX || 0);
      binding.y = y + (binding.offsetY || 0);

      // Player-like flicker for any light that opts in via flickerAmplitude/flickerSpeed
      const amp = Number.isFinite(binding.flickerAmplitude) ? binding.flickerAmplitude : 0;
      const spd = Number.isFinite(binding.flickerSpeed) ? binding.flickerSpeed : 0;
      if (amp > 0 && spd > 0) {
        const dt = Math.max(0, (scene.game?.loop?.delta || scene.time?.elapsedMS || 16)) / 1000;
        binding._flickerPhase = (binding._flickerPhase || 0) + spd * dt;
        binding._flickerPhaseAlt = (binding._flickerPhaseAlt || 0) + spd * 1.618 * dt;
        if (Phaser?.Math?.Wrap) {
          binding._flickerPhase = Phaser.Math.Wrap(binding._flickerPhase, 0, Phaser.Math.PI2);
          binding._flickerPhaseAlt = Phaser.Math.Wrap(binding._flickerPhaseAlt, 0, Phaser.Math.PI2);
        }
        const waveA = Math.sin(binding._flickerPhase);
        const waveB = Math.sin(binding._flickerPhaseAlt);
        const mix = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp((waveA * 0.6 + waveB * 0.4) * 0.5, -1, 1) : Math.min(Math.max((waveA * 0.6 + waveB * 0.4) * 0.5, -1), 1));
        const base = Number.isFinite(binding._baseRadius) ? binding._baseRadius : (Number.isFinite(binding.radius) ? binding.radius : 0);
        const jitter = mix * amp;
        const newRadius = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(base + jitter, Math.max(0, base - amp), base + amp) : Math.min(Math.max(base + jitter, Math.max(0, base - amp)), base + amp));
        binding.radius = newRadius;
        const intensityJitter = 1 + mix * 0.08;
        const newIntensity = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp((binding.intensity || 0) * intensityJitter, 0, 1) : Math.min(Math.max((binding.intensity || 0) * intensityJitter, 0), 1));
        binding.intensity = newIntensity;
      }
    }
  }

  function _updatePlayerLightGlow(delta = 0) {
    const Phaser = globalThis.Phaser || {};
    const light = scene.playerLight;
    if (!light) return;

    let normalized = scene._playerLightCachedNormalizedSegment;
    const rawLabel = scene.phaseSegmentLabel;
    if (rawLabel !== scene._playerLightCachedRawSegment) {
      scene._playerLightCachedRawSegment = rawLabel;
      if (typeof rawLabel === 'string') normalized = rawLabel.trim().toLowerCase();
      else normalized = '';
      scene._playerLightCachedNormalizedSegment = normalized;
    }

    const overlayRef = scene.nightOverlay;
    const overlayAlphaRaw = overlayRef?.alpha;
    let overlayAlpha;
    if (Number.isFinite(overlayAlphaRaw)) overlayAlpha = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(overlayAlphaRaw, 0, 1) : Math.min(Math.max(overlayAlphaRaw, 0), 1));
    else overlayAlpha = scene.phase === 'night' ? 1 : 0;
    const overlayDarkEnough = overlayAlpha > 0.001;

    let shouldGlow = overlayDarkEnough;
    if (!shouldGlow && scene.phase === 'night') {
      shouldGlow = normalized === 'dusk' || normalized === 'midnight' || normalized === 'dawn';
    }

    const settings = scene.lightSettings?.player;
    const rawRadius = settings?.nightRadius;
    let radiusBase;
    if (Number.isFinite(rawRadius)) {
      radiusBase = rawRadius < 0 ? 0 : rawRadius;
      scene._playerLightNightRadius = radiusBase;
    } else {
      radiusBase = Number.isFinite(scene._playerLightNightRadius) ? scene._playerLightNightRadius : 0;
    }

    const upgradeMultiplier = Number.isFinite(scene._playerLightUpgradeMultiplier)
      ? scene._playerLightUpgradeMultiplier
      : 1;
    let radius = radiusBase * upgradeMultiplier;

    let maskScale = settings?.maskScale;
    if (!Number.isFinite(maskScale)) maskScale = 1;
    if (maskScale < 0) maskScale = 0;

    const hasRadius = radius > 0;
    const desiredIntensity = shouldGlow && hasRadius ? 1 : 0;

    let flickerRadius = radius;
    let flickerIntensity = desiredIntensity;

    if (shouldGlow && hasRadius) {
      const flickerAmplitude = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(Number.isFinite(settings?.flickerAmplitude) ? settings.flickerAmplitude : 0, 0, 256) : Math.min(Math.max(Number.isFinite(settings?.flickerAmplitude) ? settings.flickerAmplitude : 0, 0), 256));
      const flickerSpeed = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(Number.isFinite(settings?.flickerSpeed) ? settings.flickerSpeed : 0, 0, 32) : Math.min(Math.max(Number.isFinite(settings?.flickerSpeed) ? settings.flickerSpeed : 0, 0), 32));
      const dt = Math.max(0, delta || 0) / 1000;
      if (flickerAmplitude > 0 && flickerSpeed > 0 && dt > 0) {
        const baseRadius = radius;
        scene._playerLightFlickerPhase = (scene._playerLightFlickerPhase || 0) + flickerSpeed * dt;
        scene._playerLightFlickerPhaseAlt = (scene._playerLightFlickerPhaseAlt || 0) + flickerSpeed * 1.618 * dt;
        if (Phaser?.Math?.Wrap) {
          scene._playerLightFlickerPhase = Phaser.Math.Wrap(scene._playerLightFlickerPhase, 0, Phaser.Math.PI2);
          scene._playerLightFlickerPhaseAlt = Phaser.Math.Wrap(scene._playerLightFlickerPhaseAlt, 0, Phaser.Math.PI2);
        }
        const waveA = Math.sin(scene._playerLightFlickerPhase);
        const waveB = Math.sin(scene._playerLightFlickerPhaseAlt);
        const mix = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp((waveA * 0.6 + waveB * 0.4) * 0.5, -1, 1) : Math.min(Math.max((waveA * 0.6 + waveB * 0.4) * 0.5, -1), 1));
        const radiusJitter = mix * flickerAmplitude;
        flickerRadius = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(baseRadius + radiusJitter, Math.max(0, baseRadius - flickerAmplitude), baseRadius + flickerAmplitude) : Math.min(Math.max(baseRadius + radiusJitter, Math.max(0, baseRadius - flickerAmplitude)), baseRadius + flickerAmplitude));
        const intensityJitter = 1 + mix * 0.08;
        flickerIntensity = (Phaser?.Math?.Clamp ? Phaser.Math.Clamp(desiredIntensity * intensityJitter, 0, 1) : Math.min(Math.max(desiredIntensity * intensityJitter, 0), 1));
      }
    }

    radius = flickerRadius;

    if (light.radius !== radius) light.radius = radius;
    if (light.maskScale !== maskScale) light.maskScale = maskScale;
    if (light.intensity !== flickerIntensity) light.intensity = flickerIntensity;

    const shouldBeActive = shouldGlow && hasRadius && flickerIntensity > 0.001;
    const stateChanged = shouldBeActive !== scene._playerLightNightActive;
    if (stateChanged) scene._playerLightNightActive = shouldBeActive;
    if (light.active !== shouldBeActive) light.active = shouldBeActive;
  }

  function _teardownLights() {
    if (Array.isArray(scene._lightBindings)) {
      for (let i = scene._lightBindings.length - 1; i >= 0; i--) {
        const binding = scene._lightBindings[i];
        if (binding) releaseWorldLight(binding);
      }
      scene._lightBindings.length = 0;
    } else {
      scene._lightBindings = [];
    }
    scene.playerLight = null;
    scene._playerLightNightActive = false;
    scene._playerLightCachedRawSegment = null;
    scene._playerLightCachedNormalizedSegment = '';
    _teardownNightOverlayMask();
  }

  function updateNightAmbient(strength = 0) {
    const Phaser = globalThis.Phaser || {};
    const value = Number.isFinite(strength) ? strength : 0;
    scene._midnightAmbientStrength = Phaser?.Math?.Clamp ? Phaser.Math.Clamp(value, 0, 1) : Math.min(Math.max(value, 0), 1);
  }

  function getPlayerLightUpgradeMultiplier() {
    return scene._playerLightUpgradeMultiplier;
  }
  function setPlayerLightUpgradeMultiplier(multiplier = 1) {
    let sanitized = Number.isFinite(multiplier) ? multiplier : 1;
    if (sanitized < 0) sanitized = 0;
    const settings = scene.lightSettings?.player;
    if (settings && settings.upgradeMultiplier !== sanitized) settings.upgradeMultiplier = sanitized;
    scene._playerLightUpgradeMultiplier = sanitized;
    return scene._playerLightUpgradeMultiplier;
  }
  function bumpPlayerLightUpgradeMultiplier(multiplier = 1) {
    if (!Number.isFinite(multiplier)) return scene._playerLightUpgradeMultiplier;
    let sanitized = multiplier;
    if (sanitized < 0) sanitized = 0;
    if (sanitized === 1) return scene._playerLightUpgradeMultiplier;
    const current = scene._playerLightUpgradeMultiplier;
    return setPlayerLightUpgradeMultiplier(current * sanitized);
  }
  function resetPlayerLightUpgradeMultiplier() {
    return setPlayerLightUpgradeMultiplier(1);
  }

  function initLighting() {
    if (!Array.isArray(scene._lightBindings)) scene._lightBindings = [];
    _ensureLightMaskScratch();
    const Phaser = globalThis.Phaser || {};
    const playerSettings = scene.lightSettings?.player;
    let baseRadius = playerSettings?.baseRadius;
    if (!Number.isFinite(baseRadius) || baseRadius <= 0) baseRadius = playerSettings?.nightRadius;
    if (!Number.isFinite(baseRadius) || baseRadius <= 0) baseRadius = 48;
    scene._playerLightNightRadius = baseRadius;
    if (playerSettings) {
      playerSettings.baseRadius = baseRadius;
      if (!Number.isFinite(playerSettings.nightRadius) || playerSettings.nightRadius <= 0) playerSettings.nightRadius = baseRadius;
      if (!Number.isFinite(playerSettings.flickerAmplitude)) playerSettings.flickerAmplitude = 0; else if (playerSettings.flickerAmplitude < 0) playerSettings.flickerAmplitude = 0;
      if (!Number.isFinite(playerSettings.flickerSpeed)) playerSettings.flickerSpeed = 0; else if (playerSettings.flickerSpeed < 0) playerSettings.flickerSpeed = 0;
      if (!Number.isFinite(playerSettings.upgradeMultiplier)) playerSettings.upgradeMultiplier = 1; else if (playerSettings.upgradeMultiplier < 0) playerSettings.upgradeMultiplier = 0;
      scene._playerLightUpgradeMultiplier = playerSettings.upgradeMultiplier;
    } else {
      scene._playerLightUpgradeMultiplier = 1;
    }
  }

  function createOverlayIfNeeded() {
    const Phaser = globalThis.Phaser || {};
    const w = scene.sys?.game?.config?.width ?? scene.scale?.width ?? 800;
    const h = scene.sys?.game?.config?.height ?? scene.scale?.height ?? 600;
    if (!scene.nightOverlay || !scene.nightOverlay.scene) {
      scene.nightOverlay = scene.add
        .rectangle(0, 0, w, h, 0x000000)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(10000)
        .setAlpha(0)
        .setVisible(false);
    }

    // Ensure RT is created once here
    _ensureDarknessRT();

    if (!scene._boundNightMaskTeardown) {
      scene._boundNightMaskTeardown = () => {
        if (!scene._nightMaskTeardownHooked) return;
        scene._nightMaskTeardownHooked = false;
        _teardownNightOverlayMask();
        scene._boundNightMaskTeardown = null;
      };
    }
    if (!scene._nightMaskTeardownHooked) {
      scene._nightMaskTeardownHooked = true;
      scene.events?.once?.(Phaser?.Scenes?.Events?.SHUTDOWN, scene._boundNightMaskTeardown);
      scene.events?.once?.(Phaser?.Scenes?.Events?.DESTROY, scene._boundNightMaskTeardown);
    }

    // Recreate RT on resize to match view size
    const onResize = (gameSize) => {
      const w2 = gameSize?.width ?? scene.scale?.width ?? 800;
      const h2 = gameSize?.height ?? scene.scale?.height ?? 600;
      if (!scene.nightOverlayRT || scene.nightOverlayRT.width !== w2 || scene.nightOverlayRT.height !== h2) {
        _ensureDarknessRT();
      }
    };
    scene.scale?.on?.('resize', onResize);
    scene.events?.once?.(Phaser?.Scenes?.Events?.SHUTDOWN, () => scene.scale?.off?.('resize', onResize));
    scene.events?.once?.(Phaser?.Scenes?.Events?.DESTROY, () => scene.scale?.off?.('resize', onResize));

    return scene.nightOverlay;
  }

  function update(delta) {
    _updateAttachedLights();
    _updatePlayerLightGlow(delta);
    _updateNightOverlayMask();
  }

  return {
    // lifecycle
    initLighting,
    createOverlayIfNeeded,
    update,

    // lights API
    applyLightPipeline,
    attachLightToObject,
    releaseWorldLight,

    // helpers (wrapped by MainScene for test compatibility)
    _ensureLightMaskScratch,
    _collectActiveMaskLights,
    _getLightMaskGradientDefinition,
    _buildLightMaskGradient,
    _ensureDarknessRT,
    _drawDarknessComposite,
    _updateNightOverlayMask,
    _updateAttachedLights,
    _updatePlayerLightGlow,
    _teardownNightOverlayMask,
    _teardownLights,

    // player upgrades & ambient
    getPlayerLightUpgradeMultiplier,
    setPlayerLightUpgradeMultiplier,
    bumpPlayerLightUpgradeMultiplier,
    resetPlayerLightUpgradeMultiplier,
    updateNightAmbient,
  };
}
