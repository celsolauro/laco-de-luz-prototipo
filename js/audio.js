(function (global) {
  'use strict';

  const VIOLA_SCALE = [
    293.66, // D4
    329.63, // E4
    369.99, // F#4
    440.00, // A4
    493.88, // B4
    587.33, // D5
    659.25, // E5
    739.99, // F#5
    880.00, // A5
  ];

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.padGain = null;
      this.noiseBuffer = null;
      this.enabled = true;
      this.unlocked = false;
      this.unlockAttempted = false;
      this.padStarted = false;
      this.effectsPlayed = 0;
      this.noteStep = 0;
      this._silentPlayed = false;
    }

    isEnabled() {
      return this.enabled;
    }

    hasAttemptedUnlock() {
      return this.unlockAttempted;
    }

    isUnlocked() {
      return Boolean(this.unlocked && this.ctx && this.ctx.state === 'running');
    }

    getDebugInfo() {
      const state = this.ctx ? this.ctx.state : 'uninitialized';
      return {
        state: state,
        enabled: this.enabled,
        unlocked: this.isUnlocked(),
        effectsPlayed: this.effectsPlayed,
      };
    }

    setEnabled(next) {
      this.enabled = Boolean(next);
      if (this.enabled) {
        if (!this.ctx) {
          this.unlock();
        } else if (this.ctx.state !== 'running') {
          this._resumeContext();
        } else if (!this.padStarted) {
          this._startAmbientPad();
        }
      }
      if (this.ctx && this.masterGain) {
        const now = this.ctx.currentTime;
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setTargetAtTime(this.enabled ? 0.85 : 0, now, 0.04);
      }
      return this.enabled;
    }

    toggle() {
      return this.setEnabled(!this.enabled);
    }

    unlock() {
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return Promise.resolve();

      this.unlockAttempted = true;

      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.enabled ? 0.85 : 0;
        this.masterGain.connect(this.ctx.destination);
        this.noiseBuffer = this._createNoiseBuffer();
        if ('onstatechange' in this.ctx) {
          this.ctx.onstatechange = () => {
            this._syncState();
          };
        }
      }

      // Play a 1-sample silent buffer synchronously inside the user gesture
      // (required by iOS Safari to move Web Audio out of hardware-muted state).
      if (!this._silentPlayed || this.ctx.state !== 'running') {
        try {
          const sampleRate = this.ctx.sampleRate || 22050;
          const silentBuf = this.ctx.createBuffer(1, 1, sampleRate);
          const silentSrc = this.ctx.createBufferSource();
          silentSrc.buffer = silentBuf;
          silentSrc.connect(this.ctx.destination);
          silentSrc.start(0);
          this._silentPlayed = true;
        } catch (_) {}
      }

      if (this.ctx.state === 'running') {
        this._syncState();
        return Promise.resolve();
      }

      return this._resumeContext();
    }

    _syncState() {
      if (!this.ctx) return;
      if (this.ctx.state === 'running') {
        this.unlocked = true;
        if (this.enabled && !this.padStarted) {
          this._startAmbientPad();
        }
      }
    }

    _resumeContext() {
      if (!this.ctx) return Promise.resolve();
      if (this.ctx.state === 'running') {
        this._syncState();
        return Promise.resolve();
      }
      try {
        const res = this.ctx.resume();
        if (res && typeof res.then === 'function') {
          return res
            .then(() => {
              this._syncState();
            })
            .catch(() => {});
        }
      } catch (_) {}
      return Promise.resolve();
    }

    _playWhenRunning(fn) {
      if (!this.ctx || !this.enabled) return;
      if (this.ctx.state === 'running') {
        this._syncState();
        fn();
        this.effectsPlayed += 1;
        return;
      }
      this._resumeContext().then(() => {
        if (this.ctx && this.ctx.state === 'running' && this.enabled) {
          fn();
          this.effectsPlayed += 1;
        }
      });
    }

    _createNoiseBuffer() {
      const sampleRate = this.ctx.sampleRate;
      const length = Math.floor(sampleRate * 0.4);
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    }

    _startAmbientPad() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.enabled || this.padStarted) return;
      this.padStarted = true;

      const now = this.ctx.currentTime;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, now);
      filter.Q.value = 0.7;

      this.padGain = this.ctx.createGain();
      this.padGain.gain.setValueAtTime(0.0001, now);
      this.padGain.gain.linearRampToValueAtTime(0.032, now + 1.8);

      filter.connect(this.padGain);
      this.padGain.connect(this.masterGain);

      // Soft warm night pad: D3 + A3 + F#4 subtle fifth/tenth drone
      const freqs = [146.83, 220.0, 369.99];
      freqs.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const voiceGain = this.ctx.createGain();
        voiceGain.gain.value = i === 2 ? 0.25 : 0.45;
        osc.connect(voiceGain);
        voiceGain.connect(filter);
        osc.start(now);
      });

      // Gentle breathing LFO on filter cutoff
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.14;
      lfoGain.gain.value = 95;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start(now);
    }

    _playSleighBell(time, intensity) {
      if (!this.ctx || !this.enabled) return;

      // Crisp metallic shimmer partials
      const partials = [2349.32, 3520.0, 4698.64];
      partials.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * (1 + (Math.random() - 0.5) * 0.015), time);

        const peak = (0.045 / (idx + 1)) * intensity;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(peak, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22 - idx * 0.03);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(time);
        osc.stop(time + 0.26);
      });

      // Short high-frequency jingle burst
      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(6200, time);
        bp.Q.value = 3.5;

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.0001, time);
        nGain.gain.linearRampToValueAtTime(0.055 * intensity, time + 0.005);
        nGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.065);

        noise.connect(bp);
        bp.connect(nGain);
        nGain.connect(this.masterGain);
        noise.start(time);
        noise.stop(time + 0.075);
      }
    }

    _playViolaPluck(freq, time, duration, volume) {
      if (!this.ctx || !this.enabled) return;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, time);
      filter.frequency.exponentialRampToValueAtTime(420, time + duration * 0.85);
      filter.Q.value = 1.6;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, time);
      env.gain.linearRampToValueAtTime(volume, time + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      filter.connect(env);
      env.connect(this.masterGain);

      // Double-course viola caipira voices (slight detune + octave shimmer)
      const voices = [
        { type: 'sawtooth', mult: 1.0, detune: -4, gain: 0.48 },
        { type: 'triangle', mult: 1.0, detune: 4, gain: 0.52 },
        { type: 'triangle', mult: 2.0, detune: 2, gain: 0.16 },
      ];

      voices.forEach((v) => {
        const osc = this.ctx.createOscillator();
        osc.type = v.type;
        osc.frequency.setValueAtTime(freq * v.mult, time);
        osc.detune.setValueAtTime(v.detune, time);

        const vGain = this.ctx.createGain();
        vGain.gain.value = v.gain;
        osc.connect(vGain);
        vGain.connect(filter);
        osc.start(time);
        osc.stop(time + duration + 0.03);
      });
    }

    playLightUp(wraps, combo) {
      this._playWhenRunning(() => {
        const now = this.ctx.currentTime;
        const stepOffset = (this.noteStep + Math.max(0, combo - 1)) % VIOLA_SCALE.length;
        const baseFreq = VIOLA_SCALE[stepOffset];
        this.noteStep = (this.noteStep + 1) % VIOLA_SCALE.length;

        this._playSleighBell(now, Math.min(1.4, 0.85 + wraps * 0.15));
        this._playViolaPluck(baseFreq, now + 0.015, 0.55, 0.16);

        // Extra harmonic fifth when wrapped multiple times
        if (wraps >= 2) {
          const fifthFreq = baseFreq * 1.498;
          this._playViolaPluck(fifthFreq, now + 0.065, 0.65, 0.12);
        }
        if (wraps >= 3) {
          this._playViolaPluck(baseFreq * 2, now + 0.115, 0.65, 0.10);
        }
      });
    }

    playWhoosh() {
      if (!this.noiseBuffer) return;
      this._playWhenRunning(() => {
        const now = this.ctx.currentTime;
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(420, now);
        filter.frequency.exponentialRampToValueAtTime(190, now + 0.12);
        filter.Q.value = 1.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.045, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.14);
      });
    }

    playPhaseComplete() {
      this._playWhenRunning(() => {
        const now = this.ctx.currentTime;
        const chord = [293.66, 369.99, 440.0, 587.33]; // D4, F#4, A4, D5
        chord.forEach((f, idx) => {
          this._playViolaPluck(f, now + idx * 0.07, 0.9, 0.14);
        });
        this._playSleighBell(now + 0.14, 1.15);
      });
    }

    playFinale() {
      this._playWhenRunning(() => {
        const now = this.ctx.currentTime;
        const chord = [293.66, 369.99, 440.0, 587.33, 739.99];
        chord.forEach((f, idx) => {
          this._playViolaPluck(f, now + idx * 0.085, 1.35, 0.14);
        });
        this._playSleighBell(now + 0.08, 1.2);
        this._playSleighBell(now + 0.34, 1.0);
      });
    }
  }

  global.SoundEngine = SoundEngine;
})(window);
