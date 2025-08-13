import MainScene from './scenes/MainScene.js';
import UIScene from './scenes/UIScene.js';

const BASE_WIDTH = 800;   // base game width (designed pixel resolution)
const BASE_HEIGHT = 600;  // base game height

const config = {
    type: Phaser.WEBGL, // Force WebGL renderer
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    backgroundColor: '#228B22',

    // 🔧 Pixel-art friendly rendering
    render: {
        pixelArt: true,      // use nearest-neighbor sampling (no smoothing)
        antialias: false,    // disable texture smoothing on Canvas
        roundPixels: true,    // snap draws to whole pixels to avoid shimmering
        powerPreference: 'high-performance'
    },

    // 🔎 Scale to the window; we'll apply an integer zoom below
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        expandParent: true,
        zoom: 1
    },

    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },

    scene: [MainScene, UIScene]
};

const game = new Phaser.Game(config);

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
