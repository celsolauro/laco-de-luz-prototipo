(function (global) {
  'use strict';

  const MAX_PARTICLES = 120;
  const MAX_POPUPS = 16;
  const COMBO_WINDOW_SEC = 2.6;

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  class GameEngine {
    constructor(options) {
      this.canvas = options.canvas;
      this.ctx = this.canvas.getContext('2d');
      this.sound = options.sound;
      this.cardGen = options.cardGen;
      this.onUIUpdate = options.onUIUpdate || function () {};
      this.onStateChange = options.onStateChange || function () {};
      this.onCardReady = options.onCardReady || function () {};

      this.config = global.CONFIG;
      this.reducedMotion = global.matchMedia
        ? global.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

      if (global.matchMedia) {
        const mq = global.matchMedia('(prefers-reduced-motion: reduce)');
        if (mq.addEventListener) {
          mq.addEventListener('change', (e) => {
            this.reducedMotion = e.matches;
          });
        }
      }

      // Offscreen buffers for 60fps compositing
      this.backdropCanvas = document.createElement('canvas');
      this.backdropCtx = this.backdropCanvas.getContext('2d');
      this.maskCanvas = document.createElement('canvas');
      this.maskCtx = this.maskCanvas.getContext('2d');
      this.maskDirty = true;

      this.width = 390;
      this.height = 844;
      this.dpr = 1;
      this.drawRect = { x: 0, y: 0, w: 390, h: 844 };

      // Preloaded phase images
      this.images = new Map();
      this.imagesLoaded = false;

      // Game state: 'opening' | 'playing' | 'transition' | 'finale' | 'card'
      this.state = 'opening';
      this.tranquil = false;
      this.phaseIndex = 0;
      this.targets = [];
      this.totalLightsLit = 0;
      this.phaseLightsLit = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.totalTimeLeft = this.config.tempoTotalSegundos;
      this.phaseTimeLeft = this.config.tempoPorFaseSegundos;
      this.phaseReveal = 0;
      this.transitionTimer = 0;
      this.finaleTimer = 0;
      this.shakeTime = 0;
      this.shakeIntensity = 0;
      this.time = 0;
      this.lastFrameTime = 0;
      this.rafId = null;

      // Object pools
      this.particles = [];
      for (let i = 0; i < MAX_PARTICLES; i++) {
        this.particles.push({
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          maxLife: 1,
          size: 2,
          color: '#f2c66d',
        });
      }

      this.popups = [];
      for (let i = 0; i < MAX_POPUPS; i++) {
        this.popups.push({
          active: false,
          x: 0,
          y: 0,
          text: '',
          subtext: '',
          life: 0,
          maxLife: 1,
        });
      }

      // Steam puffs for Maria Fumaça finale
      this.steamPuffs = [];
      for (let i = 0; i < 24; i++) {
        this.steamPuffs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, r: 4, life: 0 });
      }
      this.trainProgress = 0;

      this.lasso = new global.LassoController(this.canvas, {
        onGestureStart: () => {
          this.sound.unlock();
        },
        getTargets: () => this.targets,
        onLoopComplete: (res) => this._handleLoopResult(res),
      });

      this._preloadImages();
      this.resize();
      this._startLoop();
    }

    _preloadImages() {
      const promises = this.config.fases.map((fase) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            this.images.set(fase.backdrop, img);
            if (fase.backdrop === this.config.fases[this.phaseIndex].backdrop) {
              this._rebuildBackdropCache();
              this.maskDirty = true;
            }
            resolve(img);
          };
          img.onerror = () => resolve(null);
          img.src = fase.backdrop;
        });
      });

      Promise.all(promises).then(() => {
        this.imagesLoaded = true;
        this._rebuildBackdropCache();
        this.maskDirty = true;
      });
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(240, Math.round(rect.width || 390));
      const h = Math.max(420, Math.round(rect.height || 844));
      const dpr = Math.min(2, global.devicePixelRatio || 1);

      this.width = w;
      this.height = h;
      this.dpr = dpr;

      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.backdropCanvas.width = Math.round(w * dpr);
      this.backdropCanvas.height = Math.round(h * dpr);
      this.backdropCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this.maskCanvas.width = Math.round(w * dpr);
      this.maskCanvas.height = Math.round(h * dpr);
      this.maskCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      this._rebuildBackdropCache();
      this._recomputeTargetPositions();
      this.maskDirty = true;
    }

    _getCurrentBackdropImage() {
      const idx = this.state === 'finale' || this.state === 'card' ? 0 : this.phaseIndex;
      const fase = this.config.fases[idx] || this.config.fases[0];
      return this.images.get(fase.backdrop) || null;
    }

    _rebuildBackdropCache() {
      const w = this.width;
      const h = this.height;
      const bctx = this.backdropCtx;

      bctx.fillStyle = '#060d1f';
      bctx.fillRect(0, 0, w, h);

      const img = this._getCurrentBackdropImage();
      if (img && (img.naturalWidth || img.width)) {
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;
        const scale = Math.max(w / imgW, h / imgH);
        const drawW = imgW * scale;
        const drawH = imgH * scale;
        const dx = (w - drawW) * 0.5;
        const dy = (h - drawH) * 0.5;

        this.drawRect = { x: dx, y: dy, w: drawW, h: drawH };
        bctx.drawImage(img, dx, dy, drawW, drawH);
      } else {
        // Fallback 9:16 coordinate projection before image finishes loading
        const aspect = 9 / 16;
        const scale = Math.max(w / 720, h / 1280);
        const drawW = 720 * scale;
        const drawH = drawW / aspect;
        this.drawRect = {
          x: (w - drawW) * 0.5,
          y: (h - drawH) * 0.5,
          w: drawW,
          h: drawH,
        };
      }
      this._recomputeTargetPositions();
    }

    _recomputeTargetPositions() {
      const { x, y, w, h } = this.drawRect;
      const refDim = Math.min(w, h);
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        t.screenX = x + t.x * w;
        t.screenY = y + t.y * h;
        t.screenR = t.r * refDim;
      }
    }

    _loadPhase(index) {
      this.phaseIndex = clamp(index, 0, this.config.fases.length - 1);
      const fase = this.config.fases[this.phaseIndex];
      this.phaseLightsLit = 0;
      this.phaseReveal = 0;
      this.phaseTimeLeft = Math.min(
        this.config.tempoPorFaseSegundos,
        this.tranquil ? this.config.tempoPorFaseSegundos : Math.max(1, this.totalTimeLeft)
      );

      this.targets = fase.alvos.map((a, idx) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        r: a.r,
        pontos: a.pontos,
        rotulo: a.rotulo,
        screenX: 0,
        screenY: 0,
        screenR: 28,
        lit: false,
        litAnim: 0,
        flash: 0,
        pulsePhase: idx * 0.85,
      }));

      this._rebuildBackdropCache();
      this.maskDirty = true;
      this._emitUI();
    }

    startGame(options) {
      const opts = options || {};
      this.tranquil = Boolean(opts.tranquil);
      this.sound.unlock();

      this.totalLightsLit = 0;
      this.score = 0;
      this.combo = 0;
      this.comboTimer = 0;
      this.totalTimeLeft = this.config.tempoTotalSegundos;
      this.clearParticles();

      this._loadPhase(0);
      this._setState('playing');
      this.lasso.setEnabled(true);
      this._emitUI();
    }

    resetToOpening() {
      this.lasso.setEnabled(false);
      this.phaseIndex = 0;
      this.targets = [];
      this.phaseReveal = 0;
      this._rebuildBackdropCache();
      this.maskDirty = true;
      this._setState('opening');
      this._emitUI();
    }

    skipPhase() {
      if (this.state !== 'playing') return;
      this._enterPhaseTransition();
    }

    async forceEndForTest() {
      this.lasso.setEnabled(false);
      if (this.state === 'opening') {
        this.totalLightsLit = this.totalLightsLit || 0;
      }
      await this._showCardScreen();
      return {
        lightsLit: this.totalLightsLit,
        score: this.score,
        state: this.state,
      };
    }

    _setState(next) {
      this.state = next;
      this.onStateChange(next, this.getSnapshot());
    }

    getSnapshot() {
      const fase = this.config.fases[this.phaseIndex] || this.config.fases[0];
      return {
        state: this.state,
        tranquil: this.tranquil,
        phaseIndex: this.phaseIndex,
        phaseCount: this.config.fases.length,
        phaseName: fase.nome,
        phaseSubtitle: fase.subtitulo || '',
        phaseLightsLit: this.phaseLightsLit,
        phaseLightsTotal: this.targets.length,
        totalLightsLit: this.totalLightsLit,
        score: this.score,
        combo: this.combo,
        phaseTimeLeft: Math.ceil(Math.max(0, this.phaseTimeLeft)),
        totalTimeLeft: Math.ceil(Math.max(0, this.totalTimeLeft)),
      };
    }

    _emitUI() {
      this.onUIUpdate(this.getSnapshot());
    }

    clearParticles() {
      for (let i = 0; i < MAX_PARTICLES; i++) this.particles[i].active = false;
      for (let i = 0; i < MAX_POPUPS; i++) this.popups[i].active = false;
      for (let i = 0; i < this.steamPuffs.length; i++) this.steamPuffs[i].active = false;
    }

    _spawnBurst(x, y, count, colorPalette) {
      const n = this.reducedMotion ? Math.min(4, count) : count;
      let spawned = 0;
      for (let i = 0; i < MAX_PARTICLES && spawned < n; i++) {
        const p = this.particles[i];
        if (p.active) continue;
        const angle = (Math.PI * 2 * spawned) / n + (Math.random() - 0.5) * 0.4;
        const speed = this.reducedMotion ? 16 + Math.random() * 20 : 45 + Math.random() * 115;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed - (this.reducedMotion ? 0 : 18);
        p.life = 1;
        p.maxLife = 0.48 + Math.random() * 0.35;
        p.size = 2 + Math.random() * 2.8;
        p.color = colorPalette[spawned % colorPalette.length];
        spawned++;
      }
    }

    _spawnPopup(x, y, text, subtext) {
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = this.popups[i];
        if (pop.active) continue;
        pop.active = true;
        pop.x = clamp(x, 62, this.width - 62);
        pop.y = clamp(y - 16, 122, this.height - 80);
        pop.text = text;
        pop.subtext = subtext || '';
        pop.life = 1;
        pop.maxLife = 1.05;
        return;
      }
    }

    _handleLoopResult(res) {
      if (this.state !== 'playing') return;
      if (res.isTap) return;

      if (res.hits.length === 0) {
        if (this.combo > 0) {
          this.combo = 0;
          this.comboTimer = 0;
          this._emitUI();
        }
        this.sound.playWhoosh();
        return;
      }

      // Successful illumination!
      if (this.comboTimer > 0) {
        this.combo = Math.min(8, this.combo + 1);
      } else {
        this.combo = 1;
      }
      this.comboTimer = COMBO_WINDOW_SEC;

      let bestWraps = 1;
      const palette = ['#ffe8a3', '#f2c66d', '#f59e0b', '#4db874'];

      for (let i = 0; i < res.hits.length; i++) {
        const { target, wraps } = res.hits[i];
        if (target.lit) continue;

        target.lit = true;
        target.litAnim = 0.02;
        target.flash = 1;
        this.phaseLightsLit += 1;
        this.totalLightsLit += 1;
        if (wraps > bestWraps) bestWraps = wraps;

        const gained = target.pontos * wraps * Math.max(1, this.combo);
        this.score += gained;

        const tags = [];
        if (wraps > 1) tags.push(`${wraps} voltas`);
        if (this.combo > 1) tags.push(`combo x${this.combo}`);
        const sub = tags.length > 0 ? `${tags.join(' · ')} · ${target.rotulo}` : target.rotulo;

        this._spawnPopup(target.screenX, target.screenY, `+${gained}`, sub);
        this._spawnBurst(target.screenX, target.screenY, 14 + wraps * 4, palette);
      }

      this.maskDirty = true;
      this.sound.playLightUp(bestWraps, this.combo);

      if (!this.reducedMotion) {
        this.shakeTime = 0.16;
        this.shakeIntensity = Math.min(4.5, 1.5 + bestWraps * 0.9);
      }

      this._emitUI();

      // Check if phase completed
      if (this.phaseLightsLit >= this.targets.length) {
        this._enterPhaseTransition();
      }
    }

    _enterPhaseTransition() {
      this.lasso.setEnabled(false);
      // Light up remaining unlit target reveal visuals smoothly without giving free points
      for (let i = 0; i < this.targets.length; i++) {
        if (!this.targets[i].lit && this.targets[i].litAnim === 0) {
          this.targets[i].litAnim = 0.01;
        }
      }
      this.sound.playPhaseComplete();
      this._setState('transition');
      this.transitionTimer = this.reducedMotion ? 0.9 : 1.45;
      this._emitUI();
    }

    _enterFinale() {
      this.lasso.setEnabled(false);
      this._setState('finale');
      this.phaseIndex = 0; // Highlight Estação Natal tree + Maria Fumaça
      this.phaseReveal = 1;
      this._rebuildBackdropCache();
      this.maskDirty = true;
      this.finaleTimer = this.reducedMotion ? 1.5 : 2.5;
      this.trainProgress = 0;
      for (let i = 0; i < this.steamPuffs.length; i++) this.steamPuffs[i].active = false;
      this.sound.playFinale();
      this._emitUI();
    }

    async _showCardScreen() {
      this.lasso.setEnabled(false);
      this._setState('card');
      const heroImg = this.images.get(this.config.fases[0].backdrop) || this._getCurrentBackdropImage();
      const result = await this.cardGen.render({
        lightsLit: this.totalLightsLit,
        score: this.score,
        backdropImg: heroImg,
      });
      this.onCardReady({
        lightsLit: this.totalLightsLit,
        score: this.score,
        dataUrl: result.dataUrl,
        tainted: result.tainted,
      });
      this._emitUI();
    }

    _startLoop() {
      this.lastFrameTime = performance.now();
      const tick = (now) => {
        const rawDt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        const dt = Math.min(0.05, Math.max(0.001, rawDt));
        this._update(dt);
        this._render();
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    _update(dt) {
      this.time += dt;
      this.lasso.update(dt);

      if (this.shakeTime > 0) {
        this.shakeTime = Math.max(0, this.shakeTime - dt);
      }

      // Target reveal animations
      let animatingMask = false;
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (t.lit && t.litAnim < 1) {
          t.litAnim = Math.min(1, t.litAnim + dt * 2.2);
          animatingMask = true;
        }
        if (t.flash > 0) {
          t.flash = Math.max(0, t.flash - dt * 2.6);
        }
      }
      if (animatingMask) {
        this.maskDirty = true;
      }

      // Particle updates
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy = p.vy * 0.94 + 28 * dt;
        p.life -= dt / p.maxLife;
        if (p.life <= 0) p.active = false;
      }

      // Popup updates
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = this.popups[i];
        if (!pop.active) continue;
        pop.y -= 24 * dt;
        pop.life -= dt / pop.maxLife;
        if (pop.life <= 0) pop.active = false;
      }

      if (this.state === 'playing') {
        if (this.comboTimer > 0) {
          this.comboTimer -= dt;
          if (this.comboTimer <= 0) {
            this.comboTimer = 0;
            if (this.combo !== 0) {
              this.combo = 0;
              this._emitUI();
            }
          }
        }

        if (!this.tranquil) {
          const prevPhaseSec = Math.ceil(this.phaseTimeLeft);
          const prevTotalSec = Math.ceil(this.totalTimeLeft);
          this.phaseTimeLeft -= dt;
          this.totalTimeLeft -= dt;

          if (
            Math.ceil(this.phaseTimeLeft) !== prevPhaseSec ||
            Math.ceil(this.totalTimeLeft) !== prevTotalSec
          ) {
            this._emitUI();
          }

          if (this.totalTimeLeft <= 0) {
            this.totalTimeLeft = 0;
            this.phaseTimeLeft = 0;
            this._enterFinale();
          } else if (this.phaseTimeLeft <= 0) {
            this.phaseTimeLeft = 0;
            this._enterPhaseTransition();
          }
        }
      } else if (this.state === 'transition') {
        this.transitionTimer -= dt;
        this.phaseReveal = Math.min(1, this.phaseReveal + dt * 1.6);
        this.maskDirty = true;

        if (this.transitionTimer <= 0) {
          if (this.phaseIndex + 1 < this.config.fases.length) {
            this._loadPhase(this.phaseIndex + 1);
            this._setState('playing');
            this.lasso.setEnabled(true);
            this._emitUI();
          } else {
            this._enterFinale();
          }
        }
      } else if (this.state === 'finale') {
        this.finaleTimer -= dt;
        this.trainProgress = Math.min(1, this.trainProgress + dt / 2.4);

        // Steam puffs from locomotive chimney
        if (!this.reducedMotion && Math.random() < dt * 12) {
          this._spawnSteamPuff();
        }
        this._updateSteamPuffs(dt);

        if (this.finaleTimer <= 0) {
          this._showCardScreen();
        }
      }
    }

    _updateSteamPuffs(dt) {
      for (let i = 0; i < this.steamPuffs.length; i++) {
        const s = this.steamPuffs[i];
        if (!s.active) continue;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.r += dt * 7;
        s.life -= dt * 0.9;
        if (s.life <= 0) s.active = false;
      }
    }

    _spawnSteamPuff() {
      const trainPt = this._getTrainPosition();
      const sScale = trainPt.scale;
      for (let i = 0; i < this.steamPuffs.length; i++) {
        const s = this.steamPuffs[i];
        if (s.active) continue;
        s.active = true;
        // Smokestack top is at (-95 * sScale, -32 * sScale) relative to train center
        s.x = trainPt.x - 95 * sScale;
        s.y = trainPt.y - 32 * sScale;
        s.vx = (16 + Math.random() * 14) * sScale;
        s.vy = (-11 - Math.random() * 12) * sScale;
        s.r = (2.4 + Math.random() * 2) * sScale;
        s.life = 1;
        return;
      }
    }

    _getTrainPosition() {
      const { x, y, w, h } = this.drawRect;
      const scale = clamp(w / 450, 0.78, 1.35);

      // Finale crossing from right to left across the lit Estação Natal lawn
      const progress = this.reducedMotion ? 0.5 : this.trainProgress;
      const startX = x + w * 0.84;
      const endX = x + w * 0.16;
      return {
        x: startX + (endX - startX) * progress,
        y: y + h * 0.825,
        scale: scale,
      };
    }

    _rebuildMaskCanvas() {
      const w = this.width;
      const h = this.height;
      const mctx = this.maskCtx;

      mctx.clearRect(0, 0, w, h);

      const darkAlpha = 0.78 * (1 - easeOutCubic(this.phaseReveal));
      if (darkAlpha <= 0.005) {
        this.maskDirty = false;
        return;
      }

      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = `rgba(3, 9, 24, ${darkAlpha.toFixed(3)})`;
      mctx.fillRect(0, 0, w, h);

      if (this.state === 'opening') {
        // Soft subtle spotlight on tree & station in opening backdrop
        mctx.globalCompositeOperation = 'destination-out';
        const { x, y, w: dw, h: dh } = this.drawRect;
        const cx = x + dw * 0.56;
        const cy = y + dh * 0.48;
        const rad = Math.min(dw, dh) * 0.48;
        const g = mctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
        g.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        mctx.fillStyle = g;
        mctx.beginPath();
        mctx.arc(cx, cy, rad, 0, Math.PI * 2);
        mctx.fill();
        mctx.globalCompositeOperation = 'source-over';
        this.maskDirty = false;
        return;
      }

      // Open bright holes for lit targets
      mctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < this.targets.length; i++) {
        const t = this.targets[i];
        if (!t.lit || t.litAnim <= 0) continue;

        const prog = easeOutCubic(t.litAnim);
        const holeR = t.screenR * 2.9 * prog;
        const grad = mctx.createRadialGradient(t.screenX, t.screenY, holeR * 0.18, t.screenX, t.screenY, holeR);
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.85)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        mctx.fillStyle = grad;
        mctx.beginPath();
        mctx.arc(t.screenX, t.screenY, holeR, 0, Math.PI * 2);
        mctx.fill();
      }
      mctx.globalCompositeOperation = 'source-over';
      this.maskDirty = false;
    }

    _render() {
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;

      if (this.maskDirty) {
        this._rebuildMaskCanvas();
      }

      ctx.save();
      if (this.shakeTime > 0 && !this.reducedMotion) {
        const mag = this.shakeIntensity * (this.shakeTime / 0.16);
        ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
      }

      // 1. Cached lit painting
      ctx.drawImage(this.backdropCanvas, 0, 0, w, h);

      // 2. Deep midnight darkness mask with illuminated cutouts
      if (this.state !== 'finale' && this.state !== 'card') {
        ctx.drawImage(this.maskCanvas, 0, 0, w, h);
      }

      // 3. Warm edge glow on lit targets
      if (this.state === 'playing' || this.state === 'transition') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.targets.length; i++) {
          const t = this.targets[i];
          if (!t.lit) continue;
          const prog = easeOutCubic(t.litAnim);
          const glowR = t.screenR * (1.8 + t.flash * 1.2);
          const alpha = 0.14 + t.flash * 0.42;
          const g = ctx.createRadialGradient(t.screenX, t.screenY, 0, t.screenX, t.screenY, glowR);
          g.addColorStop(0, `rgba(255, 232, 163, ${alpha * prog})`);
          g.addColorStop(0.5, `rgba(245, 175, 55, ${alpha * 0.45 * prog})`);
          g.addColorStop(1, 'rgba(245, 158, 11, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(t.screenX, t.screenY, glowR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 4. Unlit targets ("fagulhas douradas")
      if (this.state === 'playing') {
        const liveMap = this.lasso.getLiveEncircled(this.targets);
        for (let i = 0; i < this.targets.length; i++) {
          const t = this.targets[i];
          if (t.lit) continue;
          this._renderTargetSpark(ctx, t, liveMap.get(t.id) || 0);
        }
      }

      // 5. Finale star radiance + faithful Mogiana 236 crossing
      if (this.state === 'finale') {
        this._renderFinaleDetails(ctx);
      }

      // 6. Pooled particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.particles[i];
        if (!p.active) continue;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // 7. Golden lasso rope
      if (this.state === 'playing') {
        this.lasso.render(ctx, this.time);
      }

      // 8. Floating popups
      for (let i = 0; i < MAX_POPUPS; i++) {
        const pop = this.popups[i];
        if (!pop.active) continue;
        const alpha = clamp(pop.life * 1.4, 0, 1);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 8;

        ctx.font = '700 18px "Cinzel Decorative", Georgia, serif';
        ctx.fillStyle = '#ffe8a3';
        ctx.fillText(pop.text, pop.x, pop.y);

        if (pop.subtext) {
          ctx.font = '600 12px "Source Sans 3", sans-serif';
          ctx.fillStyle = '#f5f0e4';
          ctx.fillText(pop.subtext, pop.x, pop.y + 18);
        }
        ctx.restore();
      }

      ctx.restore();
    }

    _renderTargetSpark(ctx, t, liveWraps) {
      const floatY = this.reducedMotion ? 0 : Math.sin(this.time * 2.2 + t.pulsePhase) * 3.5;
      const cx = t.screenX;
      const cy = t.screenY + floatY;
      const pulse = this.reducedMotion ? 1 : 0.88 + 0.18 * Math.sin(this.time * 3.4 + t.pulsePhase);
      const isCaught = liveWraps >= 1;

      ctx.save();

      // Subtle guide ring around unlit spot
      ctx.beginPath();
      ctx.arc(cx, cy, t.screenR * (isCaught ? 0.95 : 0.72), 0, Math.PI * 2);
      if (isCaught) {
        ctx.strokeStyle = 'rgba(255, 232, 150, 0.92)';
        ctx.lineWidth = 2.4;
      } else {
        ctx.setLineDash([4, 5]);
        ctx.lineDashOffset = this.reducedMotion ? 0 : -this.time * 12;
        ctx.strokeStyle = 'rgba(242, 198, 109, 0.42)';
        ctx.lineWidth = 1.4;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Warm spark radial glow
      const haloR = (isCaught ? 30 : 22) * pulse;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      grad.addColorStop(0, 'rgba(255, 250, 224, 0.98)');
      grad.addColorStop(0.32, isCaught ? 'rgba(255, 212, 92, 0.82)' : 'rgba(245, 180, 62, 0.62)');
      grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();

      // Crisp 4-point spark star
      const rot = this.reducedMotion ? 0 : this.time * 0.7 + t.pulsePhase;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      const outer = (isCaught ? 13 : 9.5) * pulse;
      const inner = outer * 0.28;
      ctx.fillStyle = '#fff9df';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        const rad = k % 2 === 0 ? outer : inner;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Live multi-wrap badge while drawing
      if (liveWraps >= 2) {
        ctx.font = '700 13px "Cinzel Decorative", Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#071127';
        ctx.beginPath();
        ctx.arc(cx, cy - t.screenR * 0.95, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f2c66d';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#ffe8a3';
        ctx.fillText(`x${liveWraps}`, cx, cy - t.screenR * 0.95 + 1);
      }

      ctx.restore();
    }

    _drawMariaFumaca(ctx, cx, railY, scale, alpha, animateRods) {
      ctx.save();
      ctx.globalAlpha = alpha;

      // Steam puffs behind train
      for (let i = 0; i < this.steamPuffs.length; i++) {
        const s = this.steamPuffs[i];
        if (!s.active) continue;
        ctx.fillStyle = `rgba(236, 234, 228, ${0.32 * s.life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.translate(cx, railY);
      ctx.scale(scale, scale);

      // Soft ground shadow under consist
      ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
      ctx.beginPath();
      ctx.ellipse(0, 0.8, 114, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Warm golden headlamp beam projecting left (forward direction of Mogiana 236)
      const beam = ctx.createLinearGradient(-103, -19.5, -182, -14);
      beam.addColorStop(0, 'rgba(255, 240, 178, 0.58)');
      beam.addColorStop(1, 'rgba(255, 220, 120, 0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(-103, -20.5);
      ctx.lineTo(-182, -29);
      ctx.lineTo(-182, -7);
      ctx.lineTo(-103, -18.5);
      ctx.closePath();
      ctx.fill();

      const drawSpokedWheel = (wx, wy, rad, spokeCount, redHub) => {
        ctx.save();
        ctx.translate(wx, wy);
        ctx.fillStyle = '#15181e';
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.fill();

        // Radial spokes
        ctx.strokeStyle = '#9aa3ae';
        ctx.lineWidth = 0.65;
        const rot = animateRods ? -this.time * 5.2 : 0;
        for (let k = 0; k < spokeCount; k++) {
          const ang = rot + (k * Math.PI * 2) / spokeCount;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(ang) * (rad - 0.6), Math.sin(ang) * (rad - 0.6));
          ctx.stroke();
        }

        // Silver/white tire rim
        ctx.strokeStyle = '#e2e7ed';
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.arc(0, 0, rad - 0.3, 0, Math.PI * 2);
        ctx.stroke();

        // Red-orange hub & counterweight accent
        ctx.fillStyle = redHub ? '#e0502a' : '#7b8490';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.1, rad * 0.32), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };

      // --- 1. PASSENGER CAR (vermelho-vinho + faixa amarela + CMEF) ---
      // Underframe & bogies
      ctx.fillStyle = '#1a1c21';
      ctx.fillRect(17, -6.5, 96, 2.5);
      drawSpokedWheel(25, -2.7, 2.7, 6, false);
      drawSpokedWheel(33, -2.7, 2.7, 6, false);
      drawSpokedWheel(97, -2.7, 2.7, 6, false);
      drawSpokedWheel(105, -2.7, 2.7, 6, false);

      // Burgundy/wine car body
      ctx.fillStyle = '#7e2026';
      ctx.fillRect(17, -23.5, 96, 17);
      // Curved dark roof + clerestory
      ctx.fillStyle = '#2d2326';
      ctx.beginPath();
      ctx.moveTo(15.5, -23.5);
      ctx.quadraticCurveTo(65, -27.5, 114.5, -23.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#3c3034';
      ctx.fillRect(26, -27.2, 78, 2);

      // Gold trim pinstripes
      ctx.fillStyle = '#e5bd64';
      ctx.fillRect(17, -23.5, 96, 0.8);
      ctx.fillRect(17, -7.2, 96, 0.8);

      // CMEF lettering on upper burgundy fascia
      ctx.font = '700 4.2px "Source Sans 3", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f5de9c';
      ctx.fillText('CMEF', 65, -21.1);

      // Yellow window band
      ctx.fillStyle = '#e8c468';
      ctx.fillRect(21.5, -19, 87, 8);

      // Warm lit passenger windows inside yellow band
      for (let wIdx = 0; wIdx < 9; wIdx++) {
        const winX = 24 + wIdx * 9.3;
        ctx.fillStyle = '#332419';
        ctx.fillRect(winX, -17.8, 6.2, 5.5);
        ctx.fillStyle = '#ffd984';
        ctx.fillRect(winX + 0.6, -17.2, 5, 4.3);
      }

      // End doors/platforms
      ctx.fillStyle = '#5a161b';
      ctx.fillRect(17.5, -22, 3.2, 14.5);
      ctx.fillRect(109.3, -22, 3.2, 14.5);

      // Coupler tender <-> passenger car
      ctx.fillStyle = '#1d2026';
      ctx.fillRect(14, -6.5, 3, 1.8);

      // --- 2. TENDER (cinza com letreiro branco MOGIANA) ---
      drawSpokedWheel(-24, -2.7, 2.7, 6, false);
      drawSpokedWheel(-16, -2.7, 2.7, 6, false);
      drawSpokedWheel(0, -2.7, 2.7, 6, false);
      drawSpokedWheel(8, -2.7, 2.7, 6, false);

      // Coal heap + thin top rail
      ctx.fillStyle = '#15181d';
      ctx.beginPath();
      ctx.moveTo(-29, -19);
      ctx.quadraticCurveTo(-8, -24.5, 12, -19);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#6f7782';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(-29.5, -21.5, 42, 2.5);

      // Grey tender tank body
      ctx.fillStyle = '#5b636e';
      ctx.fillRect(-31, -19, 45, 13);
      ctx.fillStyle = '#707985';
      ctx.fillRect(-31, -19, 45, 1.4);
      ctx.fillStyle = '#252930';
      ctx.fillRect(-31, -6.8, 45, 1.4);

      // White MOGIANA lettering
      ctx.font = '700 6.5px "Source Sans 3", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('MOGIANA', -8.5, -12.4);

      // Coupler locomotive <-> tender
      ctx.fillStyle = '#1d2026';
      ctx.fillRect(-34.5, -6.5, 3.5, 1.8);

      // --- 3. LOCOMOTIVE MOGIANA 236 (preto/cinza-chumbo + detalhes vermelho-alaranjados) ---
      // Red-orange chassis frame beam
      ctx.fillStyle = '#d94c27';
      ctx.fillRect(-102, -8.8, 67, 2.8);
      ctx.fillStyle = '#181b21';
      ctx.fillRect(-102, -6.3, 67, 1.3);

      // Cowcatcher (red-orange pilot beam + dark bars)
      ctx.fillStyle = '#d94c27';
      ctx.fillRect(-104, -9, 4, 3.4);
      ctx.beginPath();
      ctx.moveTo(-102, -6);
      ctx.lineTo(-114, -0.8);
      ctx.lineTo(-102, -0.8);
      ctx.closePath();
      ctx.fillStyle = '#22262e';
      ctx.fill();
      ctx.strokeStyle = '#df542d';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(-102, -5.8);
      ctx.lineTo(-114, -0.8);
      ctx.moveTo(-102, -3.5);
      ctx.lineTo(-109, -0.8);
      ctx.stroke();

      // Smokebox (front black)
      ctx.fillStyle = '#181b21';
      ctx.fillRect(-101, -21, 17, 12.2);
      // Boiler (charcoal lead-grey)
      ctx.fillStyle = '#2c323b';
      ctx.fillRect(-84, -21, 27, 12.2);
      // Boiler metallic top highlight & bands
      ctx.fillStyle = '#47505e';
      ctx.fillRect(-100, -21, 43, 1.3);
      ctx.fillStyle = '#191c22';
      ctx.fillRect(-76, -21, 1, 12.2);
      ctx.fillRect(-66, -21, 1, 12.2);

      // Smokestack (flared top)
      ctx.fillStyle = '#1a1d23';
      ctx.fillRect(-96.5, -31.5, 4.4, 10.5);
      ctx.beginPath();
      ctx.moveTo(-98.2, -32.2);
      ctx.lineTo(-90.4, -32.2);
      ctx.lineTo(-92, -29.8);
      ctx.lineTo(-96.6, -29.8);
      ctx.closePath();
      ctx.fill();

      // Sand & steam domes + brass bell
      ctx.fillStyle = '#2b313a';
      ctx.fillRect(-80.5, -23.2, 6, 2.4);
      ctx.beginPath();
      ctx.arc(-77.5, -23.2, 3, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-64.5, -23.6, 6.8, 2.8);
      ctx.beginPath();
      ctx.arc(-61.1, -23.6, 3.4, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#e5b95c';
      ctx.beginPath();
      ctx.arc(-70.5, -22.5, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Headlamp
      ctx.fillStyle = '#22262e';
      ctx.fillRect(-104, -21.5, 3.2, 3.8);
      ctx.fillStyle = '#fff6cc';
      ctx.beginPath();
      ctx.arc(-104.2, -19.6, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Cab (charcoal + overhanging roof + warm window + crisp 236)
      ctx.fillStyle = '#22272f';
      ctx.fillRect(-57, -26.2, 22, 17.4);
      ctx.fillStyle = '#14171c';
      ctx.fillRect(-58.8, -27.8, 25.5, 2);
      // Warm cab window
      ctx.fillStyle = '#f5c76b';
      ctx.fillRect(-53.5, -23.5, 7, 5.5);
      ctx.strokeStyle = '#14171c';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-53.5, -23.5, 7, 5.5);

      // Number plate 236
      ctx.fillStyle = '#171a20';
      ctx.fillRect(-54.8, -16.5, 16.5, 6.5);
      ctx.strokeStyle = '#adb5c0';
      ctx.lineWidth = 0.55;
      ctx.strokeRect(-54.8, -16.5, 16.5, 6.5);
      ctx.font = '700 6px "Source Sans 3", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('236', -46.5, -13.1);

      // Locomotive wheels (pilot truck + 3 large spoked drivers + trailing wheel)
      drawSpokedWheel(-96, -3, 2.9, 6, true);
      drawSpokedWheel(-86.5, -3, 2.9, 6, true);
      drawSpokedWheel(-75, -5.2, 5.2, 8, true);
      drawSpokedWheel(-63, -5.2, 5.2, 8, true);
      drawSpokedWheel(-51, -5.2, 5.2, 8, true);
      drawSpokedWheel(-39.5, -3.2, 3.2, 6, true);

      // Red-orange connecting rod (biela) linking driving wheels
      const rodDx = animateRods ? Math.cos(this.time * 5.2) * 1.4 : 0.8;
      const rodDy = animateRods ? Math.sin(this.time * 5.2) * 1.4 : 0.6;
      ctx.strokeStyle = '#e5562e';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-81, -5.8);
      ctx.lineTo(-75 + rodDx, -5.2 + rodDy);
      ctx.lineTo(-51 + rodDx, -5.2 + rodDy);
      ctx.stroke();

      ctx.restore();
    }

    _renderFinaleDetails(ctx) {
      const { x, y, w, h } = this.drawRect;

      // 1. Blazing sheriff star on the Estação Natal tree
      const starX = x + w * 0.70;
      const starY = y + h * 0.145;
      const pulse = this.reducedMotion ? 1 : 0.92 + 0.14 * Math.sin(this.time * 5);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const starGlow = ctx.createRadialGradient(starX, starY, 4, starX, starY, 115 * pulse);
      starGlow.addColorStop(0, 'rgba(255, 250, 224, 0.95)');
      starGlow.addColorStop(0.28, 'rgba(255, 214, 102, 0.65)');
      starGlow.addColorStop(0.65, 'rgba(245, 158, 11, 0.22)');
      starGlow.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = starGlow;
      ctx.beginPath();
      ctx.arc(starX, starY, 115 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // Rotating starlight rays
      ctx.translate(starX, starY);
      ctx.rotate(this.reducedMotion ? 0 : this.time * 0.35);
      ctx.fillStyle = 'rgba(255, 245, 200, 0.55)';
      for (let r = 0; r < 6; r++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(-2.2, 0);
        ctx.lineTo(0, -68 * pulse);
        ctx.lineTo(2.2, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // 2. Faithful Mogiana 236 + tender MOGIANA + CMEF car crossing at finale
      const trainPt = this._getTrainPosition();
      this._drawMariaFumaca(ctx, trainPt.x, trainPt.y, trainPt.scale, 0.96, !this.reducedMotion);
    }
  }

  global.GameEngine = GameEngine;
})(window);
