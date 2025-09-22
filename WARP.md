# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Stack: JavaScript (ES modules), Node’s built-in test runner, Phaser 3 at runtime (browser) with a Node headless bootstrap for module loading.
- Entry point: bootstrap.js
- Notable directories: scenes/, systems/ (combat, input, resource, world_gen, pools), data/, test/

Commands
- Install dependencies
```bash path=null start=null
npm install
```

- Run entire test suite
```bash path=null start=null
npm test
```

- Run a single test file (adjust the path as needed)
```bash path=null start=null
node --test test/systems/world_gen/Chunk.test.js
```

- Filter tests by name (uses Node’s test-name pattern)
```bash path=null start=null
node --test --test-name-pattern="night overlay"
```

- Headless bootstrap (loads modules under Node and exits)
```bash path=null start=null
npm start
```

Notes
- No linter or build step is configured in package.json. Development is test-driven with node:test.
- The bootstrap detects browser vs Node. Under Node it stubs Phaser to load modules and then exits; in a browser it creates a Phaser game with configured scenes.

High-level architecture
- Bootstrap and runtime selection
  - bootstrap.js checks for a window global to decide between Node (headless) and browser runtime.
  - Browser mode: constructs a Phaser.Game with pixel-art friendly settings, a resize-aware integer zoom, Arcade physics, and scenes [MainScene, UIScene, PauseScene, DevUIScene].
  - Node mode: stubs Phaser, dynamically imports scenes/systems to verify module wiring, logs, and exits. Useful for quick “smoke” checks during development.

- Scenes
  - MainScene (scenes/MainScene.js)
    - Orchestrates the game: player setup, physics, camera bounds, lighting, night overlay mask, and event wiring.
    - Initializes systems:
      - combatSystem: combat, damage, collisions, game-over overlay.
      - dayNightSystem: day/night progression, overlay intensity, spawn scheduling, time scaling hooks.
      - resourceSystem: data-driven world resource spawning and cleanup (chunk-scoped).
      - inputSystem: unified pointer/keyboard handling, charging, sprinting, ESC/pause and auto-pause.
    - Chunk streaming: constructs ChunkManager, budgets loads/unloads per tick, and adapts budgets/timers based on FPS and player movement speed. Emits chunk:load and chunk:unload for resourceSystem to react.
    - Inventory/UI: launches UIScene and interacts via events and methods like inventory.getEquipped(), addItemToInventory(), and UI updates for health/stamina/charge.
    - Lighting and night overlay: attaches per-object lights via lightweight binding objects, computes a gradient-style geometry mask for the night overlay, and manages enable/disable and teardown cleanly on scene shutdown/destroy.

  - UIScene / PauseScene / DevUIScene
    - UIScene is launched from MainScene and exposes inventory APIs consumed by systems (e.g., equipped item, ammo counts, UI events like weapon:charge).
    - PauseScene provides overlay and pause control (MainScene wires ESC and auto-pause behaviors).
    - DevUIScene is included in the scene list for dev tooling and cheats integration (see DevTools usages).

- Systems
  - combatSystem (systems/combatSystem.js)
    - Encapsulates melee (bat), ranged (slingshot), projectile lifetime, knockback, stuns, resist multipliers, and player-zombie interactions.
    - Manages game-over presentation and input teardown when health reaches 0.
    - Uses data from data/itemDatabase.js and data/zombieDatabase.js.

  - inputSystem (systems/inputSystem.js)
    - Centralizes pointer/keyboard handling and translates intent into combat actions or charge lifecycles.
    - Handles sprint state, cooldown checks, ESC/pause, auto-pause on window blur/visibility change, and robust input reset helpers.

  - dayNightSystem (systems/world_gen/dayNightSystem.js)
    - Drives day/night phases and elapsed time, updates overlay alpha/ambient, and schedules night waves by segments.
    - Respects DevTools.cheats flags (timeScale, noDarkness) and exposes helper accessors (e.g., getPhaseElapsed()).

  - resourceSystem (systems/resourceSystem.js)
    - Spawns world resources based on WORLD_GEN, biome, density noise, and Poisson sampling. Splits resources into physics/non-physics groups with layered sprites for proper depth.
    - Listens to chunk lifecycle via MainScene events to spawn and cancel per-chunk jobs, and cleans up timers/sprites defensively.
    - Uses data from data/resourceDatabase.js, design rules in data/designRules.js, and registry wiring in systems/world_gen/resources/.

  - Pools (systems/pools/)
    - resourcePool and zombiePool centralize creation/reuse/cleanup of sprites and associated overlays (e.g., top sprites for rocks, HP bars for zombies) to control churn and depth ordering.

- World generation
  - worldGenConfig (systems/world_gen/worldGenConfig.js)
    - Single source for world dimensions, chunk size, blend parameters, seeds, biome colors, and day/night timing.
  - Chunk and ChunkManager (systems/world_gen/chunks/)
    - Chunk renders a biome-tinted render texture via sampled colors (with blend radius/density/falloff). Texture pooling avoids GC churn; unload serializes meta via chunkStore.
    - ChunkManager tracks the player’s chunk index, wraps coordinates, prioritizes nearest loads and farthest unloads with hysteresis and grace periods to minimize thrash.
  - Biomes and noise (systems/world_gen/biomes/ and systems/world_gen/noise.js)
    - biomeMap selects biomes via noise, exposes helpers and test hooks. Additional simplex/perlin or density queries live in noise.js.
  - Resources registry and sampling (systems/world_gen/resources/)
    - registry wires concrete resource spawners to keys referenced by RESOURCE_DB; poissonSampler generates well-spaced positions within chunks based on density/biome rules.

- Data-driven configuration
  - data/itemDatabase.js: items, weapons (melee/ranged), stamina costs/penalties, visuals and world origins/scales; used by input/combat/UI.
  - data/resourceDatabase.js: static world resources (trees, rocks, bushes), tags (rock/bush), blocking status, physics body hints, and spawn rules.
  - data/zombieDatabase.js: zombie archetypes, speeds, resistances, and visuals.
  - data/designRules.js and data/uiConfig.js: tuning knobs and UI layout/hotbar specifics consumed by systems/scenes.

- Tests
  - Node’s test runner (node:test) is used throughout test/. Phaser is stubbed to run pure logic deterministically under Node.
  - Representative coverage includes: Chunk render texture sampling/blending, day/night progression and spawn scheduling, resource pooling/registries, combat interactions, and various scene-level utilities/light mask math via system hooks.

Where to make common changes
- World size/seed/phase lengths: systems/world_gen/worldGenConfig.js
- Tuning items/weapons/ammo: data/itemDatabase.js
- Resource spawn rules/densities: data/resourceDatabase.js, systems/world_gen/noise.js, systems/resourceSystem.js
- Chunk streaming budgets/timeouts: scenes/MainScene.js (after ChunkManager creation) and systems/world_gen/chunks/ChunkManager.js
- Day/night overlay behavior and wave scheduling: systems/world_gen/dayNightSystem.js

README highlights
- README.md documents the test command (npm test); all additional commands and architecture are summarized above.
