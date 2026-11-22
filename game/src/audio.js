// Coral Bay — all sound, synthesised live with WebAudio. No sound files.
// One job: engine hum, sirens, impacts, pickups and jingles.

class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.muted = false;
    this.waveTimer = null;
  }

  // Browsers need a user gesture before audio starts; call from Start.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // Gentle looping surf, made of filtered noise, for the beach mood.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.12;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = this.ctx.createGain(); g.gain.value = 0.25;
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  // A short blip: oscillator with a quick pitch/fall envelope.
  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  // A burst of noise (impacts, gunfire).
  noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.4;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this.blip(660, 0.06, 'square', 0.15); }
  pickup() { this.blip(880, 0.12, 'sine', 0.3); this.blip(1320, 0.18, 'sine', 0.25); }
  cash() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.16, 'triangle', 0.3), i * 90);
    });
  }
  punch() { this.noise(0.12, 0.5, 900); }
  shoot() { this.noise(0.15, 0.55, 2600); this.blip(180, 0.1, 'square', 0.25, 60); }
  crash() { this.noise(0.35, 0.7, 500); this.blip(90, 0.3, 'sawtooth', 0.3, 40); }
  busted() { [392, 311, 233].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.25), i * 180)); }
  missionStart() { this.blip(440, 0.12, 'triangle', 0.3); setTimeout(() => this.blip(587, 0.18, 'triangle', 0.3), 120); }

  // Engine: a sawtooth whose pitch follows speed; call every frame while driving.
  engine(speed01, on) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 700;
      this.engineOsc.connect(f); f.connect(this.engineGain); this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 60 + speed01 * 160;
      this.engineGain.gain.value = on ? 0.06 + speed01 * 0.08 : 0;
    }
  }

  // Two-tone police siren while any wanted stars are up.
  siren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.value = high ? 960 : 720;
      }, 380);
    } else if (!on && this.sirenOsc) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      this.sirenOsc.stop();
      this.sirenOsc = null;
      this.sirenGain = null;
    }
  }
}
