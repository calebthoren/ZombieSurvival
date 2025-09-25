// systems/pools/zombiePool.js
// Simple object pool for zombies to avoid create/destroy churn.


export default function createZombiePool(scene) {
    const pool = [];

    function acquire(texKey = 'zombie') {
        const zombie = pool.pop();
        if (zombie) {
            scene.zombies.add(zombie, true);
            zombie
                .setTexture(texKey)
                .setActive(true)
                .setVisible(true);
            zombie.body && (zombie.body.enable = true);

            if (typeof scene.applyLightPipeline === 'function') {
                scene.applyLightPipeline(zombie);
            }
            return zombie;
        }
        const z = scene.zombies.create(0, 0, texKey);
        if (!z.body) scene.physics.add.existing(z);
        z.body.setAllowGravity(false);

        if (typeof scene.applyLightPipeline === 'function') {
            scene.applyLightPipeline(z);
        }
        return z;
    }

    function release(zombie) {
        if (!zombie) return;
        if (zombie.hpBg) {
            zombie.hpBg.destroy();
            zombie.hpBg = null;
        }
        if (zombie.hpFill) {
            zombie.hpFill.destroy();
            zombie.hpFill = null;
        }
        scene.zombies.remove(zombie, false);
        zombie.body && zombie.body.stop && zombie.body.stop();
        if (zombie.body) zombie.body.enable = false;
        zombie.setActive(false).setVisible(false);
        pool.push(zombie);
    }

    function size() {
        return pool.length;
    }

    return { acquire, release, size };
}
