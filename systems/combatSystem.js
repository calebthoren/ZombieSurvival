// systems/combatSystem.js
// Encapsulates combat logic to keep MainScene focused on orchestration.
import { ITEM_DB } from '../data/itemDatabase.js';
import ZOMBIES from '../data/zombieDatabase.js';
import DevTools from './DevTools.js';

export default function createCombatSystem(scene) {
    // ----- Hit Handling -----
    function handleMeleeHit(hit, zombie) {
        if (!hit || !zombie || !zombie.active) return;
        const reg = hit._hitSet || (hit._hitSet = new Set());
        if (reg.has(zombie)) return;
        const ox = hit.getData('originX') ?? scene.player.x;
        const oy = hit.getData('originY') ?? scene.player.y;
        const bx =
            zombie.body && zombie.body.center && zombie.body.center.x
                ? zombie.body.center.x
                : zombie.x;
        const by =
            zombie.body && zombie.body.center && zombie.body.center.y
                ? zombie.body.center.y
                : zombie.y;
        const dx = bx - ox;
        const dy = by - oy;
        const aimAngle = Phaser.Math.Angle.Normalize(
            hit.getData('aimAngle') || 0,
        );
        const angTo = Phaser.Math.Angle.Normalize(Math.atan2(dy, dx));
        const coneHalf = hit.getData('coneHalfRad') || Math.PI / 4;
        const diff = Math.abs(
            Math.atan2(Math.sin(angTo - aimAngle), Math.cos(angTo - aimAngle)),
        );
        if (diff > coneHalf + 1e-4) return;
        reg.add(zombie);
        const baseD = hit.getData('damage');
        const baseKb = hit.getData('knockback');
        const meleeMult = Math.max(0, zombie?.resist?.meleeMult ?? 1);
        const defMin = ITEM_DB?.crude_bat?.weapon?.minDamage ?? 10;
        const defMax = ITEM_DB?.crude_bat?.weapon?.maxDamage ?? defMin;
        const rawD =
            baseD ?? Phaser.Math.Between(defMin, defMax);
        const dmg = Math.max(0, Math.round(rawD * meleeMult));
        const kb = Math.max(
            0,
            baseKb ?? ITEM_DB?.crude_bat?.weapon?.knockback ?? 10,
        );
        _applyZombieDamage(zombie, dmg);
        _applyKnockbackAndMaybeStun(zombie, ox, oy, kb);
    }

    function handleProjectileHit(bullet, zombie) {
        if (!bullet || !zombie || !zombie.active) return;
        const payloadDmg =
            typeof bullet.getData === 'function'
                ? bullet.getData('damage')
                : undefined;
        const payloadKb =
            typeof bullet.getData === 'function'
                ? bullet.getData('knockback')
                : undefined;
        const slMin = ITEM_DB?.slingshot?.weapon?.minDamage ?? 5;
        const slMax = ITEM_DB?.slingshot?.weapon?.maxDamage ?? slMin;
        let dmg =
            typeof payloadDmg === 'number'
                ? payloadDmg
                : Phaser.Math.Between(slMin, slMax);
        let kb =
            typeof payloadKb === 'number'
                ? payloadKb
                : (ITEM_DB?.slingshot?.weapon?.knockback ?? 5);
        const sx = typeof bullet.x === 'number' ? bullet.x : scene.player.x;
        const sy = typeof bullet.y === 'number' ? bullet.y : scene.player.y;
        if (bullet && bullet.destroy) bullet.destroy();
        const rangedMult = Math.max(0, zombie?.resist?.rangedMult ?? 1);
        dmg = Math.max(0, Math.round(dmg * rangedMult));
        _applyZombieDamage(zombie, dmg);
        _applyKnockbackAndMaybeStun(zombie, sx, sy, kb);
    }

    function handlePlayerZombieCollision(player, zombie) {
        if (scene.isGameOver) return;
        if (DevTools?.isPlayerInvisible?.() === true) return;
        const now = scene.time.now | 0;
        const scale = DevTools.cheats.timeScale || 1;
        const hitCdMs = 500 / scale;
        if (!zombie.lastHitTime) zombie.lastHitTime = 0;
        if (now - zombie.lastHitTime < hitCdMs) return;
        zombie.lastHitTime = now;
        if (DevTools?.shouldBlockPlayerDamage?.() === true) return;
        const damage = Phaser.Math.Between(5, 10);
        scene.health = Math.max(0, (scene.health | 0) - damage);
        scene.uiScene?.updateHealth?.(scene.health);
        if (scene.health <= 0) {
            scene.isGameOver = true;
            scene.physics.world.isPaused = true;
            try {
                player?.setTint?.(0x720c0c);
            } catch {}
            scene.input.off(
                'pointerdown',
                scene.inputSystem.onPointerDown,
                scene,
            );
            scene.input.off('pointerup', scene.inputSystem.onPointerUp, scene);
            scene._isSwinging = false;
            if (scene.gameOverText?.destroy) scene.gameOverText.destroy();
            if (scene.respawnPrompt?.destroy) scene.respawnPrompt.destroy();
            if (scene.gameOverOverlay?.destroy) scene.gameOverOverlay.destroy();
            const cam = scene.cameras.main;
            scene.gameOverOverlay = scene.add
                .rectangle(0, 0, cam.width, cam.height, 0x000000, 0.5)
                .setOrigin(0, 0)
                .setScrollFactor(0)
                .setDepth(20000);
            const cx = cam.worldView.x + cam.worldView.width * 0.5;
            const cy = cam.worldView.y + cam.worldView.height * 0.5;
            scene.gameOverText = scene.add
                .text(cx, cy - 20, 'GAME OVER', {
                    fontFamily: 'monospace',
                    fontSize: '32px',
                    color: '#ffffff',
                })
                .setOrigin(0.5)
                .setDepth(20001);
            scene.gameOverText.setStroke('#720c0c', 4);
            scene.respawnPrompt = scene.add
                .text(cx, cy + 20, 'Press SPACE to Respawn', {
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    color: '#ffffff',
                })
                .setOrigin(0.5)
                .setDepth(20001);
            return;
        }
        try {
            player?.setTintFill?.(0xffaaaa);
            scene.time.delayedCall(90, () => player?.clearTint?.());
        } catch {}
    }

    // ----- Ranged Weapons -----
    function fireProjectile(pointer, textureKey, cfg) {
        if (!pointer || !textureKey) return;
        const damage = cfg?.damage ?? 0;
        const knockback = cfg?.knockback ?? 0;
        const speed = cfg?.speed ?? 0;
        const travel = cfg?.travel ?? 0;
        const angle = Phaser.Math.Angle.Between(
            scene.player.x,
            scene.player.y,
            pointer.worldX,
            pointer.worldY,
        );
        const bullet =
            scene.bullets.get(
                scene.player.x,
                scene.player.y,
                textureKey,
            ) ||
            scene.physics.add.image(
                scene.player.x,
                scene.player.y,
                textureKey,
            );
        if (!bullet) return;
        if (!bullet.body) scene.physics.add.existing(bullet);
        bullet.setActive(true).setVisible(true);
        bullet.body.setAllowGravity(false);
        bullet.setDepth(600);
        bullet.setScale(0.4);
        bullet.setSize(8, 8);
        bullet.setData('damage', Math.max(0, Math.round(damage)));
        bullet.setData('knockback', Math.max(0, knockback));
        const scale = DevTools.cheats.timeScale || 1;
        const v = scene.physics.velocityFromRotation(angle, speed * scale);
        bullet.setVelocity(v.x, v.y);
        bullet.setRotation(angle);
        // Lifetime scales by 1/scale so that, combined with timer timeScale (1/scale),
        // real-world projectile travel remains consistent across speeds.
        const lifetimeMs = Math.max(
            1,
            Math.floor((travel / Math.max(1, speed)) * 1000 / Math.max(0.0001, scale)),
        );
        scene.time.delayedCall(lifetimeMs, () => {
            if (bullet.active && bullet.destroy) bullet.destroy();
        });
        scene.physics.add.collider(
            bullet,
            scene.resources,
            (bb, r) => {
                if (bb && bb.destroy) bb.destroy();
            },
            (_b, r) =>
                !!(
                    r &&
                    typeof r.getData === 'function' &&
                    r.getData('blocking') === true
                ),
            scene,
        );
    }

    function fireRangedWeapon(pointer, wpn, chargePercent) {
        const equipped = scene.uiScene?.inventory?.getEquipped?.();
        const ammoChoice =
            scene.uiScene?.inventory?.firstViableAmmoFor?.(equipped?.id) ||
            (() => {
                const info = scene.uiScene?.inventory?.totalOfActiveAmmo?.(
                    equipped?.id,
                );
                return info
                    ? {
                          ammoId: info.ammoId || 'slingshot_rock',
                          total: info.total,
                      }
                    : null;
            })();
        if (!ammoChoice || ammoChoice.total <= 0) return;
        const rawCharge = Phaser.Math.Clamp(chargePercent || 0, 0, 1);
        const st = wpn?.stamina || {};
        let lowStamina = false;
        let cost = 0;
        if (typeof st.baseCost === 'number' && typeof st.maxCost === 'number') {
            cost = Phaser.Math.Linear(st.baseCost, st.maxCost, rawCharge);
        } else if (typeof st.cost === 'number') {
            cost = st.cost;
        }
        if (cost > 0) {
            if (scene.hasStamina(cost)) {
                scene.spendStamina(cost);
            } else {
                lowStamina = true;
                scene.spendStamina(scene.stamina);
            }
        }
        const maxCap =
            lowStamina && typeof st.poorChargeClamp === 'number'
                ? Math.max(0.0001, st.poorChargeClamp)
                : 1;
        const effectiveCharge = Math.min(rawCharge, maxCap);
        const uiPercent = Phaser.Math.Clamp(effectiveCharge / maxCap, 0, 1);
        scene.uiScene?.events?.emit('weapon:charge', uiPercent);
        const canCharge = wpn?.canCharge === true;
        const baseMin = wpn?.minDamage ?? wpn?.damage ?? 6;
        const baseMax = wpn?.maxDamage ?? baseMin;
        const baseDmg = Phaser.Math.Between(baseMin, baseMax);
        const maxDmg = wpn?.maxChargeDamage ?? baseMax;
        let shotDmg = canCharge
            ? Phaser.Math.Linear(baseDmg, maxDmg, effectiveCharge)
            : baseDmg;
        const baseKb = wpn?.knockback ?? 6;
        const maxKb = wpn?.maxChargeKnockback ?? baseKb;
        const shotKb = canCharge
            ? Phaser.Math.Linear(baseKb, maxKb, effectiveCharge)
            : baseKb;
        const dmgFloor = lowStamina
            ? typeof st.baseCost === 'number'
                ? st.baseCost
                : typeof st.cost === 'number'
                  ? st.cost
                  : null
            : null;
        if (dmgFloor != null) shotDmg = Math.max(dmgFloor, shotDmg);
        let speed = wpn?.projectileSpeed ?? 400;
        const minRange = wpn?.minRange ?? 180;
        const maxRange = wpn?.maxRange ?? 420;
        const travel = Phaser.Math.Linear(minRange, maxRange, effectiveCharge);
        if (lowStamina && typeof st.lowSpeedMultiplier === 'number') {
            speed = Math.max(40, Math.floor(speed * st.lowSpeedMultiplier));
        }
        if (DevTools.shouldConsumeAmmo()) {
            scene.uiScene?.inventory?.consumeAmmo?.(ammoChoice.ammoId, 1);
        }
        fireProjectile(pointer, ammoChoice.ammoId, {
            damage: shotDmg,
            knockback: shotKb,
            speed,
            travel,
        });
        const scale = DevTools.cheats.timeScale || 1;
        const baseCd = wpn?.fireCooldownMs ?? 0;
        const cdMs =
            lowStamina && typeof st.lowCooldownMultiplier === 'number'
                ? Math.floor(baseCd * st.lowCooldownMultiplier)
                : baseCd;
        const applied = scale <= 0 ? 0 : 1 / scale;
        const adjCd = Math.floor(cdMs * applied);
        if (!DevTools.cheats.noCooldown && adjCd > 0) {
            scene._nextRangedReadyTime = scene.time.now + adjCd;
            scene.uiScene?.events?.emit('weapon:cooldownStart', {
                itemId: equipped.id,
                durationMs: adjCd,
            });
        }
        scene.uiScene?.events?.emit('weapon:chargeEnd');
    }

    function throwRock(pointer, itemId, chargePercent = 0) {
        if (!pointer || !itemId) return;
        const def = ITEM_DB[itemId];
        const ammoCfg = def?.ammo || {};
        const charge = Phaser.Math.Clamp(chargePercent || 0, 0, 1);
        const minD = ammoCfg.minDamage ?? 1;
        const maxD = ammoCfg.maxDamage ?? 3;
        const damage = Phaser.Math.Linear(minD, maxD, charge);
        const minR = ammoCfg.minRange ?? 50;
        const maxR = ammoCfg.maxRange ?? 100;
        const travel = Phaser.Math.Linear(minR, maxR, charge);
        const speed = ammoCfg.speed ?? 300;
        const knockback = ammoCfg.knockback ?? 0;
        const tex = def?.icon?.textureKey || 'slingshot_rock';
        if (DevTools.shouldConsumeAmmo()) {
            scene.uiScene?.inventory?.consumeAmmo?.(itemId, 1);
        }
        fireProjectile(pointer, tex, {
            damage,
            knockback,
            speed,
            travel,
        });
    }

    // ----- Melee Weapons -----
    function swingBat(pointer, wpn, chargePercent = 0) {
        if (scene.isCharging) {
            scene.isCharging = false;
            scene._chargingItemId = null;
            scene.uiScene?.events?.emit('weapon:chargeEnd');
            scene._destroyEquippedItemGhost?.();
        }
        let swingDurationMs = wpn?.swingDurationMs ?? 160;
        const baseCooldownMs = wpn?.swingCooldownMs ?? 80;
        const rangeBase = wpn?.range ?? 30;
        const rangePad = wpn?.meleeRangePad ?? 10;
        const range = Math.max(8, rangeBase + rangePad);
        const radius = wpn?.radius ?? 22;
        if (scene._isSwinging) return;
        const effectiveCooldownMs =
            scene._nextSwingCooldownMs ?? baseCooldownMs;
        const now = scene.time.now;
        if (now - (scene._lastSwingEndTime || 0) < effectiveCooldownMs) return;
        const st = wpn?.stamina;
        let lowStamina = false;
        if (st?.cost != null) {
            const cost = st.cost;
            if (scene.hasStamina(cost)) {
                scene.spendStamina(cost);
            } else {
                lowStamina = true;
                scene.spendStamina(scene.stamina);
            }
        }
        if (lowStamina && st) {
            const slowMult = st.slowMultiplier ?? st.slowMult ?? 3;
            swingDurationMs = Math.floor(swingDurationMs * slowMult);
        }
        const cooldownMult =
            lowStamina && st ? (st.cooldownMultiplier ?? 6) : 1;
        const scale = DevTools.cheats.timeScale || 1;
        const applied = scale <= 0 ? 0 : 1 / scale;
        // Shorten swing duration at higher speeds (match gameplay pace)
        swingDurationMs = Math.max(1, Math.floor(swingDurationMs * applied));
        scene._nextSwingCooldownMs = Math.floor(
            baseCooldownMs * cooldownMult * applied,
        );
        const canCharge = wpn?.canCharge === true;
        let charge = canCharge
            ? Phaser.Math.Clamp(chargePercent || 0, 0, 1)
            : 0;
        if (lowStamina && st && typeof st.poorChargeClamp === 'number') {
            charge = Math.min(charge, st.poorChargeClamp);
        }
        const baseMin = wpn?.minDamage ?? wpn?.damage ?? 10;
        const baseMax = wpn?.maxDamage ?? baseMin;
        const baseDmg = Phaser.Math.Between(baseMin, baseMax);
        const baseKb = wpn?.knockback ?? 10;
        const maxDmg = wpn?.maxChargeDamage ?? baseMax;
        const maxKb = wpn?.maxChargeKnockback ?? baseKb;
        let swingDamage = canCharge
            ? Phaser.Math.Linear(baseDmg, maxDmg, charge)
            : baseDmg;
        let swingKnockback = canCharge
            ? Phaser.Math.Linear(baseKb, maxKb, charge)
            : baseKb;
        const dmgFloor = lowStamina
            ? typeof st.baseCost === 'number'
                ? st.baseCost
                : typeof st.cost === 'number'
                  ? st.cost
                  : null
            : null;
        if (dmgFloor != null) swingDamage = Math.max(dmgFloor, swingDamage);
        let aim = Phaser.Math.Angle.Between(
            scene.player.x,
            scene.player.y,
            pointer.worldX,
            pointer.worldY,
        );
        aim = Phaser.Math.Angle.Normalize(aim);
        const halfArc = Phaser.Math.DegToRad(45);
        let startRot = Phaser.Math.Angle.Normalize(aim - halfArc);
        let endRot = Phaser.Math.Angle.Normalize(aim + halfArc);
        if (endRot < startRot) endRot += Math.PI * 2;
        if (scene.batSprite) scene.batSprite.destroy();
        const baseOffset = Phaser.Math.DegToRad(45);
        scene.batSprite = scene.add
            .image(scene.player.x, scene.player.y, 'crude_bat')
            .setDepth(500)
            .setOrigin(0.1, 0.8)
            .setRotation(startRot + baseOffset);
        const cone = scene.add.circle(
            scene.player.x,
            scene.player.y,
            range,
            0x0000ff,
            0,
        );
        scene.physics.add.existing(cone);
        cone.body.setAllowGravity(false);
        if (cone.body.setCircle) {
            cone.body.setCircle(range);
            cone.body.setOffset(0, 0);
        }
        scene.meleeHits.add(cone);
        cone._hitSet = new Set();
        cone.setData('damage', Math.max(0, Math.round(swingDamage)));
        cone.setData('knockback', Math.max(0, swingKnockback));
        cone.setData('originX', scene.player.x);
        cone.setData('originY', scene.player.y);
        cone.setData('aimAngle', startRot);
        cone.setData('coneHalfRad', halfArc);
        cone.setData('maxRange', range);
        cone.setData('swingStartMs', scene.time.now | 0);
        cone.setData('swingDurationMs', swingDurationMs | 0);
        scene._isSwinging = true;
        const swing = { t: 0 };
        const deltaRot = endRot - startRot;
        scene.tweens.add({
            targets: swing,
            t: 1,
            duration: swingDurationMs,
            ease: 'Sine.InOut',
            onUpdate: () => {
                const centerRot = startRot + swing.t * deltaRot;
                scene.batSprite
                    .setPosition(scene.player.x, scene.player.y)
                    .setRotation(centerRot + baseOffset);
                cone.setPosition(scene.player.x, scene.player.y);
                cone.setData(
                    'aimAngle',
                    Phaser.Math.Angle.Normalize(centerRot),
                );
            },
            onComplete: () => {
                scene._isSwinging = false;
                scene._lastSwingEndTime = scene.time.now;
                if (scene.batSprite) {
                    scene.batSprite.destroy();
                    scene.batSprite = null;
                }
                if (
                    !DevTools.cheats.noCooldown &&
                    scene._nextSwingCooldownMs > 0
                ) {
                    scene.uiScene?.events?.emit('weapon:cooldownStart', {
                        itemId: 'crude_bat',
                        durationMs: scene._nextSwingCooldownMs,
                    });
                } else {
                    scene.uiScene?.events?.emit('weapon:cooldownClear', {
                        itemId: 'crude_bat',
                    });
                }
            },
        });
        scene.time.delayedCall(swingDurationMs, () => {
            if (cone && cone.destroy) cone.destroy();
        });
    }

    // ----- Zombie Spawning -----
    function spawnZombie(typeKey = 'walker', pos = null) {
        const def = ZOMBIES[typeKey] || ZOMBIES.walker || {};
        const tex = def.texture || def.textureKey || 'zombie';
        let x, y;
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            x = pos.x;
            y = pos.y;
        } else {
            const cam = scene.cameras.main;
            const x0 = cam.worldView.x,
                y0 = cam.worldView.y;
            const x1 = x0 + cam.worldView.width,
                y1 = y0 + cam.worldView.height;
            const edge = (Math.random() * 4) | 0;
            if (edge === 0) {
                x = Phaser.Math.Between(x0, x1);
                y = y0 - 8;
            } else if (edge === 1) {
                x = x1 + 8;
                y = Phaser.Math.Between(y0, y1);
            } else if (edge === 2) {
                x = Phaser.Math.Between(x0, x1);
                y = y1 + 8;
            } else {
                x = x0 - 8;
                y = Phaser.Math.Between(y0, y1);
            }
        }
        const zombie = (scene.zombiePool
            ? scene.zombiePool.acquire(tex)
            : scene.zombies.create(x, y, tex));
        zombie.setPosition(x, y);
        if (!zombie.body) scene.physics.add.existing(zombie);
        zombie.body.setAllowGravity(false);
        zombie.setOrigin(0.5, 0.5);
        zombie.setScale(def.scale ?? 0.1);
        zombie.setDepth(def.depth ?? 2);
        zombie._speedMult = 1;
        zombie._inBush = false;
        zombie.lastHitTime = 0;
        zombie.zType = typeKey;
        zombie.speed = def.speed ?? 40;
        zombie.maxHp = def.health ?? 25;
        zombie.hp = zombie.maxHp;
        zombie.attackDamage = def.damage ?? 10;
        zombie.aggroRange = def.aggroRange ?? 99999;
        zombie.attackCooldownMs = def.attackCooldownMs ?? 800;
        zombie.resist = Object.assign(
            { rangedMult: 1, meleeMult: 1, knockback: 0 },
            def.resist || {},
        );
        zombie.staggerThreshold =
            typeof def.staggerThreshold === 'number' ? def.staggerThreshold : 8;
        zombie.stunDurationMs =
            typeof def.stunDurationMs === 'number' ? def.stunDurationMs : 300;
        zombie.hpBg = null;
        zombie.hpFill = null;
        zombie.hpBarW = def.hpBarW ?? zombie.hpBarW;
        zombie.hpBarH = def.hpBarH ?? zombie.hpBarH;
        zombie.hpYOffset = def.hpYOffset ?? zombie.hpYOffset;
        
        // Attach light if configured
        if (def.light && typeof scene.attachLightToObject === 'function') {
            scene.attachLightToObject(zombie, def.light);
        }
        
        return zombie;
    }

    // ----- Zombie HP Bars -----
    function _ensureZombieHpBar(zombie) {
        if (zombie.hpBg && zombie.hpFill) return;
        const barW = zombie.hpBarW ?? 18;
        const barH = zombie.hpBarH ?? 3;
        const yOff = zombie.hpYOffset ?? zombie.displayHeight * 0.6;
        const bx = zombie.x;
        const by = zombie.y - yOff;
        const bg = scene.add
            .rectangle(bx, by, barW, barH, 0x000000, 1)
            .setOrigin(0.5, 1)
            .setDepth(950)
            .setAlpha(0)
            .setVisible(false);
        const fill = scene.add
            .rectangle(bx - barW / 2, by, barW, barH, 0xff3333, 1)
            .setOrigin(0, 1)
            .setDepth(951)
            .setAlpha(0)
            .setVisible(false);
        zombie.hpBg = bg;
        zombie.hpFill = fill;
        zombie.hpBarW = barW;
        zombie.hpBarH = barH;
        zombie.hpYOffset = yOff;
    }

    function _updateOneZombieHpBar(zombie) {
        const maxHp = zombie.maxHp || 1;
        const hp = Math.max(0, zombie.hp ?? maxHp);
        const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);
        const show = pct < 1;
        if (!show) {
            if (zombie.hpBg) zombie.hpBg.setVisible(false).setAlpha(0);
            if (zombie.hpFill) zombie.hpFill.setVisible(false).setAlpha(0);
            return;
        }
        if (!zombie.hpBg || !zombie.hpFill) _ensureZombieHpBar(zombie);
        if (!zombie.hpBg || !zombie.hpFill) return;
        const w = zombie.hpBarW ?? 18;
        const yOff = zombie.hpYOffset ?? zombie.displayHeight * 0.6;
        const bx = zombie.x;
        const by = zombie.y - yOff;
        zombie.hpBg.setPosition(bx, by).setVisible(true).setAlpha(0.9);
        zombie.hpFill

            .setPosition(bx - w / 2, by)
            .setVisible(true)
            .setAlpha(1);
        zombie.hpFill.width = Math.max(0, w * pct);
    }
    function updateZombieHpBar(zombie) {
        _updateOneZombieHpBar(zombie);
    }

    // ----- Damage Helpers -----
    function _applyKnockbackAndMaybeStun(zombie, srcX, srcY, baseKb) {
        if (!zombie || !zombie.active) return;
        const resist = Math.max(0, Math.min(1, zombie?.resist?.knockback ?? 0));
        const effKb = Math.max(0, (baseKb || 0) * (1 - resist));
        const dx = zombie.x - srcX,
            dy = zombie.y - srcY;
        const len = Math.max(1e-3, Math.hypot(dx, dy));
        const scale = DevTools?.cheats?.timeScale || 1;
        const applied = scale <= 0 ? 0 : 1 / scale;
        const impulse = effKb * 18 * applied;
        const vx = (dx / len) * impulse;
        const vy = (dy / len) * impulse;
        zombie.setVelocity(vx, vy);
        const now = scene.time.now | 0;
        zombie.knockbackUntil = now + 120;
        if (baseKb >= (zombie.staggerThreshold || 99999)) {
            zombie.stunUntil = now + (zombie.stunDurationMs || 300);
        }
    }

    function _applyZombieDamage(zombie, amount) {
        if (!zombie || !zombie.active) return;
        const dmg = Math.max(0, amount || 0);
        zombie.hp = Math.max(0, (zombie.hp ?? zombie.maxHp ?? 1) - dmg);
        if (!zombie.hpBg || !zombie.hpFill) _ensureZombieHpBar(zombie);
        _updateOneZombieHpBar(zombie);
        if (zombie.hp <= 0) _destroyZombie(zombie);
    }

    function _destroyZombie(zombie) {
        _maybeDropLoot(zombie);
        if (zombie.hpBg) {
            zombie.hpBg.destroy();
            zombie.hpBg = null;
        }
        if (zombie.hpFill) {
            zombie.hpFill.destroy();
            zombie.hpFill = null;
        }
        if (scene.zombiePool) scene.zombiePool.release(zombie);
        else if (zombie.destroy) zombie.destroy();
    }

    function _maybeDropLoot(zombie) {
        try {
            const def = ZOMBIES[zombie.zType];
            const table = def?.loot?.table;
            if (!table || !Array.isArray(table) || table.length === 0) return;
            let total = 0;
            for (const e of table) total += e.weight || 0;
            if (total <= 0) return;
            let r = Math.random() * total,
                choice = null;
            for (const e of table) {
                r -= e.weight || 0;
                if (r <= 0) {
                    choice = e;
                    break;
                }
            }
            if (!choice || !choice.itemId) return;
            if (choice.chance != null && Math.random() > choice.chance) return;
            const qty =
                choice.min && choice.max
                    ? Phaser.Math.Between(choice.min, choice.max)
                    : choice.qty || 1;
            const d2 = Phaser.Math.Distance.Squared(
                scene.player.x,
                scene.player.y,
                zombie.x,
                zombie.y,
            );
            if (d2 <= 40 * 40 && scene.uiScene?.inventory?.addItem) {
                scene.uiScene.inventory.addItem(choice.itemId, qty);
            }
        } catch (_) {
            /* noop */
        }
    }

    // ----- Zombie Selection -----
    function getEligibleZombieTypesForPhase(phase = 'day') {
        const list = [];
        for (const id of Object.keys(ZOMBIES)) {
            const def = ZOMBIES[id];
            if (!def) continue;
            const weight = def.spawnWeight ?? 1;
            if (weight <= 0) continue;
            if (phase === 'day') {
                if (def.canSpawnDay === true) list.push({ id, weight });
            } else {
                list.push({ id, weight });
            }
        }
        if (list.length === 0 && ZOMBIES.walker)
            list.push({
                id: 'walker',
                weight: ZOMBIES.walker.spawnWeight ?? 1,
            });
        return list;
    }

    function pickZombieTypeWeighted(list) {
        if (!list || list.length === 0) return 'walker';
        let total = 0;
        for (const e of list) total += Math.max(0, e.weight || 0);
        if (total <= 0) return list[0].id;
        const r = Math.random() * total;
        let acc = 0;
        for (const e of list) {
            acc += Math.max(0, e.weight || 0);
            if (r <= acc) return e.id;
        }
        return list[list.length - 1].id;
    }

    return {
        handleMeleeHit,
        handleProjectileHit,
        handlePlayerZombieCollision,
        fireProjectile,
        fireRangedWeapon,
        throwRock,
        swingBat,
        spawnZombie,
        getEligibleZombieTypesForPhase,
        pickZombieTypeWeighted,
        updateZombieHpBar,
    };
}
