// scenes/PauseScene.js
// A lightweight overlay scene for the Pause menu.
// Opens on ESC from MainScene. Closes on ESC or "Return to Game" button.
// Layout:
//   [ Return to Game ]  (wide button at top)
//   [ Settings ] [ Dev Mode ]    (two small buttons, top row)
//   [ Coming Soon ] [ Coming Soon ] (two small buttons, second row, placeholders)
//   [ Return to Menu ] (wide button at bottom; currently non-functional)

import DevTools from '../systems/DevTools.js';

export default class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    // Safety guard: if MainScene doesn't exist (e.g., boot ordering issue), just close.
    // Do NOT start/restart MainScene here — resuming is handled by user input (ESC / button).
    const main = this.scene.get('MainScene');
    if (!main) {
      this.scene.stop(); // nothing to overlay
      return;
    }

    // Ensure gameplay is actually paused whenever this overlay is open.
    // This is idempotent and covers ALL entry points (ESC, other scenes, etc.).
    if (this.scene.isActive('MainScene')) {
      this.scene.pause('MainScene');
    }

    DevTools.applyTimeScale(this);

    const { width: W, height: H } = this.scale;

    // Block input to scenes underneath
    const blocker = this.add.rectangle(0, 0, W, H, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10)
      .setInteractive({ useHandCursor: false });

    // Title (optional subtle text)
    this.add.text(W / 2, H * 0.12, 'Paused', {
      fontFamily: 'sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(11);

    // Helpers
    const makeButton = (x, y, w, h, label, onClick, opts = {}) => {
      const bg = this.add.rectangle(x, y, w, h, opts.fillColor ?? 0x1f2937, 1)
        .setOrigin(0.5)
        .setDepth(11)
        .setStrokeStyle(2, opts.strokeColor ?? 0x93c5fd)
        .setInteractive({ useHandCursor: true });

      const txt = this.add.text(x, y, label, {
        fontFamily: 'sans-serif',
        fontSize: opts.fontSize ?? '18px',
        color: '#ffffff',
        align: 'center'
      }).setOrigin(0.5).setDepth(12);

      // Hover
      bg.on('pointerover', () => { bg.setFillStyle(opts.hoverFill ?? 0x374151, 1); });
      bg.on('pointerout',  () => { bg.setFillStyle(opts.fillColor ?? 0x1f2937, 1); });
      // Click
      bg.on('pointerdown', () => {
        if (typeof onClick === 'function') onClick();
      });

      return { bg, txt };
    };

    // Layout metrics (responsive-ish, pixel-art friendly)
    const pad = Math.max(8, Math.floor(W * 0.02));
    const bigW = Math.min(480, Math.floor(W - pad * 2));
    const bigH = 48;
    const smallW = Math.floor((bigW - pad) / 2);
    const smallH = 42;

    let cursorY = H * 0.22;

    // Top big button: Return to Game
    makeButton(W / 2, cursorY, bigW, bigH, 'Return to Game', () => this._resume(), {
      fillColor: 0x0f172a, strokeColor: 0x38bdf8, hoverFill: 0x1e293b, fontSize: '20px'
    });
    cursorY += bigH + pad * 1.25;

    // Two rows of two small buttons
    const rowXLeft  = (W - bigW) / 2 + smallW / 2;
    const rowXRight = W - rowXLeft;
    const row1Y = cursorY;
    const row2Y = row1Y + smallH + pad;

    // Row 1: Settings (top-left) + Dev Mode (top-right)
    makeButton(rowXLeft,  row1Y, smallW, smallH, 'Settings', () => {
      this.sound.play?.('sfx_click', { volume: 0.5 });
      // Placeholder: open settings scene in the future
    }, { fillColor: 0x1f2937, strokeColor: 0xf59e0b, hoverFill: 0x374151 });

    // Open Dev UI and close Pause behind it (keep MainScene paused)
  makeButton(rowXRight, row1Y, smallW, smallH, 'Dev Mode', () => {
      // Only play if the audio is actually loaded
      if (this.cache?.audio?.exists('sfx_click')) {
          this.sound.play('sfx_click', { volume: 0.5 });
      }
      if (!this.scene.isActive('DevUIScene')) {
          this.scene.launch('DevUIScene');
      }
      // Close PauseScene so the UI isn't stacked/cluttered
      this.scene.stop(); // <- important
  }, { fillColor: 0x1f2937, strokeColor: 0x10b981, hoverFill: 0x374151 });

    // Row 2: placeholders (small buttons)
    makeButton(rowXLeft,  row2Y, smallW, smallH, 'Coming Soon', () => {
      this.sound.play?.('sfx_click', { volume: 0.5 });
    }, { fillColor: 0x1f2937, strokeColor: 0x64748b, hoverFill: 0x374151 });

    makeButton(rowXRight, row2Y, smallW, smallH, 'Coming Soon', () => {
      this.sound.play?.('sfx_click', { volume: 0.5 });
    }, { fillColor: 0x1f2937, strokeColor: 0x64748b, hoverFill: 0x374151 });

    // Bottom big: Return to Menu (no-op for now)
    const bottomY = row2Y + smallH + pad * 1.25;
    makeButton(W / 2, bottomY, bigW, bigH, 'Return to Menu', () => {
      this.sound.play?.('sfx_click', { volume: 0.5 });
      // Intentionally not yet implemented.
      // In the future: this.scene.stop('UIScene'); this.scene.start('MainMenuScene');
    }, { fillColor: 0x0f172a, strokeColor: 0xef4444, hoverFill: 0x1e293b, fontSize: '20px' });

    // ESC to resume
    this.input.keyboard?.on('keydown-ESC', () => this._resume());

    // Safety: click outside buttons also resumes? (No — we require explicit button or ESC)
    // blocker.on('pointerdown', () => this._resume());
  }

  _resume() {
    // Resume the gameplay scene; stop this overlay
    const main = this.scene.get('MainScene');
    // Unpause only if the scene exists
    if (main) {
      this.scene.stop('PauseScene');
      this.scene.resume('MainScene');
    } else {
      // Fallback: just stop ourselves
      this.scene.stop('PauseScene');
    }
  }

  // Dev Mode button handler (optional if you call inline; kept for reuse)
  onDevModeClick() {
      // Open DevUIScene as a deeper overlay.
      // Do NOT resume or restart MainScene here.
      if (!this.scene.isActive('DevUIScene')) {
          this.scene.launch('DevUIScene');
      }
  }
}
