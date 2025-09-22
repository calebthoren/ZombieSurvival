// test/scenes/mainScene.playerLightGlow.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

const previousPhaser = globalThis.Phaser;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function wrap(value, min, max) {
    const range = max - min;
    if (range === 0) return min;
    return value - range * Math.floor((value - min) / range);
}

function quadraticOut(t) {
    return t * (2 - t);
}

class SceneStub {
    constructor() {
        this.sys = { events: { once() {}, on() {}, off() {} } };
        this.events = this.sys.events;
    }
}

globalThis.Phaser = {
    Scene: SceneStub,
    Math: {
        PI2: Math.PI * 2,
        Clamp: clamp,
        Wrap: wrap,
        Linear: (start, end, t) => start + (end - start) * t,
        Easing: {
            Quadratic: {
                Out: quadraticOut,
            },
        },
    },
    Scenes: {
        Events: {
            SHUTDOWN: 'shutdown',
            DESTROY: 'destroy',
        },
    },
    Input: {
        Keyboard: {
            JustDown() {
                return false;
            },
            KeyCodes: {
                SPACE: 32,
            },
        },
    },
};

const { default: MainScene } = await import('../../scenes/MainScene.js');

function createScene() {
    const scene = new MainScene();
    scene.player = { x: 0, y: 0 };
    scene._lightBindings = [];
    scene.lightSettings = {
        player: {
            nightRadius: 48,
            baseRadius: 48,
            flickerAmplitude: 0,
            flickerSpeed: 0,
            upgradeMultiplier: 1,
            maskScale: 1,
        },
    };
    scene._playerLightNightRadius = 48;
    scene._playerLightUpgradeMultiplier = 1;
    scene.playerLight = scene.attachLightToObject(scene.player, {
        radius: 48,
        intensity: 0,
        maskScale: 1,
    });
    scene.playerLight.active = false;
    return scene;
}

test('player light activates whenever the overlay is dark', () => {
    const scene = createScene();
    scene.phase = 'night';
    scene.phaseSegmentLabel = 'Strange Segment';
    scene.nightOverlay = { alpha: 0.45 };

    scene._updatePlayerLightGlow(16);

    assert.equal(scene.playerLight.active, true);
    assert.ok(scene.playerLight.intensity > 0.99);
});

test('player light stays off when overlay is clear during the day', () => {
    const scene = createScene();
    scene.phase = 'day';
    scene.phaseSegmentLabel = 'Morning';
    scene.nightOverlay = { alpha: 0 };

    scene._updatePlayerLightGlow(16);

    assert.equal(scene.playerLight.active, false);
    assert.equal(scene.playerLight.intensity, 0);
});

test('player light still activates on named night segments even if overlay alpha is tiny', () => {
    const scene = createScene();
    scene.phase = 'night';
    scene.phaseSegmentLabel = 'Midnight';
    scene.nightOverlay = { alpha: 0 };

    scene._updatePlayerLightGlow(16);

    assert.equal(scene.playerLight.active, true);
});

test.after(() => {
    globalThis.Phaser = previousPhaser;
});

