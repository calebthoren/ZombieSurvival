let logo; // Global variable for the logo image

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#2d2d2d',
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

function preload() {
    // Load a test image
    this.load.image('logo', 'https://labs.phaser.io/assets/sprites/phaser3-logo.png');
}

function create() {
    // Add the image to the screen and store it in the global variable
    logo = this.add.image(400, 300, 'logo');
}

function update() {
    // Only rotate if the logo has loaded
    if (logo) {
        logo.rotation += 0.01;
    }
}
