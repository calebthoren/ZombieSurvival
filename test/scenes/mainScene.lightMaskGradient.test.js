// test/scenes/mainScene.lightMaskGradient.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function quadraticOut(t) {
    return t * (2 - t);
}

test('player light mask gradient reserves a large inner bubble', async () => {
    const previousPhaser = globalThis.Phaser;
    globalThis.Phaser = {
        Scene: class SceneStub {
            constructor() {
                this.sys = { events: { once() {}, on() {}, off() {} } };
                this.events = this.sys.events;
            }
        },
        Math: {
            PI2: Math.PI * 2,
            Clamp: clamp,
            Linear: (start, end, t) => start + (end - start) * t,
            Easing: {
                Quadratic: {
                    Out: quadraticOut,
                },
            },
        },
    };

    try {
        const { default: MainScene } = await import('../../scenes/MainScene.js');
        const scene = new MainScene();

        const gradient = scene._buildLightMaskGradient(16, 5);
        assert.equal(gradient.layers.length, 5);

        const innerLayer = gradient.layers[0];
        assert.ok(innerLayer.radiusNormalized >= 0.34);
        assert.ok(innerLayer.radiusNormalized <= 0.36);

        const outerLayer = gradient.layers[gradient.layers.length - 1];
        assert.equal(outerLayer.radiusNormalized, 1);

        const midLayerIndex = 2;
        const midLayer = gradient.layers[midLayerIndex];
        assert.ok(midLayer.radiusNormalized > innerLayer.radiusNormalized);
        assert.ok(midLayer.radiusNormalized < outerLayer.radiusNormalized);
        const expectedMidRadius = Math.max(
            0.35,
            (midLayerIndex + 1) / gradient.layers.length,
        );
        assert.ok(Math.abs(midLayer.radiusNormalized - expectedMidRadius) <= 0.01);

        for (let i = 1; i < gradient.layers.length; i++) {
            assert.ok(
                gradient.layers[i].radiusNormalized >=
                    gradient.layers[i - 1].radiusNormalized,
            );
        }

        for (let ring = 0; ring < gradient.layers.length; ring++) {
            const layer = gradient.layers[ring];
            const expectedRadius = Math.max(
                0.35,
                (ring + 1) / gradient.layers.length,
            );
            assert.ok(Math.abs(layer.radiusNormalized - expectedRadius) <= 0.000001);
        }
    } finally {
        globalThis.Phaser = previousPhaser;
    }
});

