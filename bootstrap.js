const BASE_WIDTH = 800;   // base game width (designed pixel resolution)
const BASE_HEIGHT = 600;  // base game height
const IS_NODE = typeof window === 'undefined';

let MainScene, UIScene, PauseScene, DevUIScene, TestWorldScene;

if (IS_NODE) {
    globalThis.Phaser = { Scene: class {}, Math: { Clamp: () => 0, Linear: () => 0 } };
    ({ default: MainScene } = await import('./scenes/MainScene.js'));
    ({ default: UIScene } = await import('./scenes/UIScene.js'));
    ({ default: PauseScene } = await import('./scenes/PauseScene.js'));
    ({ default: DevUIScene } = await import('./scenes/DevUIScene.js'));
    ({ default: TestWorldScene } = await import('./scenes/TestWorldScene.js'));
    await import('./systems/world_gen/dayNightSystem.js');
    console.log('Headless bootstrap: modules loaded');
    process.exit(0);
} else {
    ({ default: MainScene } = await import('./scenes/MainScene.js'));
    ({ default: UIScene } = await import('./scenes/UIScene.js'));
    ({ default: PauseScene } = await import('./scenes/PauseScene.js'));
    ({ default: DevUIScene } = await import('./scenes/DevUIScene.js'));
    ({ default: TestWorldScene } = await import('./scenes/TestWorldScene.js'));

    // 🖼️ Explicit canvas with willReadFrequently to avoid readback warnings
    const canvas = document.createElement('canvas');
    canvas.setAttribute('willReadFrequently', 'true');

    const config = {
        canvas,
        type: Phaser.WEBGL,
        width: BASE_WIDTH,
        height: BASE_HEIGHT,
        backgroundColor: '#228B22',

        // 🔧 Pixel-art friendly rendering
        render: {
            pixelArt: true,      // use nearest-neighbor sampling (no smoothing)
            antialias: false,    // disable texture smoothing on Canvas
            roundPixels: true,   // force integer pixel positions for crisp movement
            powerPreference: 'high-performance',
        },

        // 🔎 Scale to the window; we'll apply an integer zoom below
        scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
            expandParent: true,
            zoom: 1,
        },

        physics: {
            default: 'arcade',
            arcade: {
                gravity: { y: 0 },
                debug: false,
            },
        },
        

        scene: [MainScene, UIScene, PauseScene, DevUIScene, TestWorldScene],
    };

    const game = new Phaser.Game(config);
    // Expose game globally for debugging convenience
    try { window.game = game; } catch {}

    // Auto pixel-perfect integer zoom that fits the window
    function applyPixelPerfectZoom() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // Integer zoom that fits both dimensions
        const zx = Math.floor(w / BASE_WIDTH);
        const zy = Math.floor(h / BASE_HEIGHT);
        const zoom = Math.max(1, Math.min(zx, zy));

        // Apply zoom; Scale.FIT will handle the rest
        game.scale.setZoom(zoom);
    }

    // Run once and on resize
    window.addEventListener('resize', applyPixelPerfectZoom);
    applyPixelPerfectZoom();
}

