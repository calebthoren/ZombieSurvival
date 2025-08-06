import MainScene from './scenes/MainScene.js';

const config = {
    type: Phaser.AUTO,
    width: 800, // base game width
    height: 600, // base game height
    backgroundColor: '#228B22', // green background
    scale: {
        mode: Phaser.Scale.FIT,              // Scales proportionally
        autoCenter: Phaser.Scale.CENTER_BOTH // Centers the game
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [MainScene]
};

const game = new Phaser.Game(config);
