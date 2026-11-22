// Coral Bay — all sound is synthesized live with WebAudio. No audio files.
// Three original radio stations, engine hum, sirens and one-shot effects.
(function () {
  'use strict';
  var CB = window.CB;

  function AudioSys() {
    this.ctx = null;
    this.master = null;
    this.radioOn = true;
    this.station = 0;
    this.stations = [
      { name: 'BAY FM 88.1 — SUNSET DRIVE', bpm: 96, root: 220.00, minor: true, wave: 'sawtooth' },
      { name: 'CORAL ROCK 101 — REEF RIFF', bpm: 132, root: 164.81, minor: false, wave: 'square' },
      { name: 'TIDE TALK 74 — NIGHT TIDE', bpm: 72, root: 196.00, minor: true, wave: 'triangle' },
    ];
    this._step = 0;
    this._timer = null;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._noiseBuf = null;
  }

  AudioSys.prototype.init = function () {
    if (this.ctx) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = this._noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.startRadio();
      this.startEngine();
      this.startSiren();
    } catch (e) { this.ctx = null; }
  };

  AudioSys.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  AudioSys.prototype._note = function (freq, when, dur, type, vol, dest) {
    if (!this.ctx) return;
    var o = this.ctx.createOscillator();
    var g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(when); o.stop(when + dur + 0.05);
  };

  // Simple step sequencer: bass line + arpeggio, different scale per station.
  AudioSys.prototype.startRadio = function () {
    var self = this;
    if (this._timer) return;
    var scaleMinor = [1, 1.189, 1.335, 1.498, 1.782, 2];
    var scaleMajor = [1, 1.122, 1.26, 1.335, 1.498, 1.682, 2];
    var bassPat = [0, -1, 0, -1, 3, -1, 0, 2];
    var arpPat = [0, 2, 4, 2, 5, 4, 2, 1];
    this._timer = setInterval(function () {
      if (!self.ctx || !self.radioOn) return;
      var st = self.stations[self.station];
      var scale = st.minor ? scaleMinor : scaleMajor;
      var stepDur = 60 / st.bpm / 2;
      var t = self.ctx.currentTime + 0.05;
      var s = self._step;
      var bi = bassPat[s % 8];
      if (bi >= 0) self._note(st.root * 0.5 * scale[bi % scale.length], t, stepDur * 1.8, 'sine', 0.16);
      var ai = arpPat[s % 8];
      self._note(st.root * scale[ai % scale.length], t, stepDur * 0.9, st.wave, 0.045);
      if (s % 16 === 0) self._note(st.root * 2, t, stepDur * 6, 'sine', 0.05);
      if (s % 4 === 2) { // hat tick
        var src = self.ctx.createBufferSource();
        src.buffer = self._noiseBuf;
        var g = self.ctx.createGain();
        g.gain.setValueAtTime(0.03, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        var f = self.ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        src.connect(f); f.connect(g); g.connect(self.master);
        src.start(t); src.stop(t + 0.06);
      }
      self._step++;
    }, 60 / this.stations[this.station].bpm / 2 * 1000);
  };

  AudioSys.prototype.nextStation = function () {
    this.station = (this.station + 1) % this.stations.length;
    this._step = 0;
    return this.stations[this.station].name;
  };

  AudioSys.prototype.startEngine = function () {
    if (!this.ctx) return;
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 50;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0;
    var f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 400;
    this._engineOsc.connect(f); f.connect(this._engineGain); this._engineGain.connect(this.master);
    this._engineOsc.start();
  };

  AudioSys.prototype.setEngine = function (speed01, driving) {
    if (!this.ctx || !this._engineOsc) return;
    var t = this.ctx.currentTime;
    this._engineOsc.frequency.setTargetAtTime(45 + speed01 * 130, t, 0.08);
    this._engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.05 : 0.0, t, 0.1);
  };

  AudioSys.prototype.startSiren = function () {
    if (!this.ctx) return;
    this._sirenOsc = this.ctx.createOscillator();
    this._sirenOsc.type = 'sine';
    this._sirenOsc.frequency.value = 700;
    this._sirenGain = this.ctx.createGain();
    this._sirenGain.gain.value = 0;
    this._sirenOsc.connect(this._sirenGain); this._sirenGain.connect(this.master);
    this._sirenOsc.start();
    var self = this, hi = true;
    setInterval(function () {
      if (!self.ctx || !self._sirenOsc) return;
      hi = !hi;
      self._sirenOsc.frequency.setTargetAtTime(hi ? 950 : 650, self.ctx.currentTime, 0.05);
    }, 420);
  };

  AudioSys.prototype.setSiren = function (on) {
    if (!this.ctx || !this._sirenGain) return;
    this._sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.2);
  };

  AudioSys.prototype._burst = function (dur, vol, freq) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    var f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = freq || 1200;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  };

  AudioSys.prototype.shoot = function (kind) {
    if (kind === 'fists') { this._burst(0.08, 0.2, 500); return; }
    this._burst(0.12, 0.5, kind === 'shotgun' ? 900 : 2400);
    if (kind === 'shotgun') this._burst(0.25, 0.35, 500);
  };
  AudioSys.prototype.enemyShoot = function () { this._burst(0.1, 0.18, 1800); };
  AudioSys.prototype.explosion = function () { this._burst(0.9, 0.7, 300); };
  AudioSys.prototype.pickup = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    this._note(660, t, 0.12, 'sine', 0.15);
    this._note(990, t + 0.1, 0.2, 'sine', 0.15);
  };
  AudioSys.prototype.horn = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    this._note(370, t, 0.35, 'square', 0.08);
    this._note(466, t, 0.35, 'square', 0.08);
  };
  AudioSys.prototype.missionDone = function () {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    var seq = [523, 659, 784, 1046];
    for (var i = 0; i < seq.length; i++) this._note(seq[i], t + i * 0.14, 0.22, 'triangle', 0.16);
  };
  AudioSys.prototype.hurt = function () { this._burst(0.15, 0.3, 400); };
  AudioSys.prototype.click = function () {
    if (!this.ctx) return;
    this._note(880, this.ctx.currentTime, 0.06, 'sine', 0.1);
  };

  CB.AudioSys = AudioSys;
})();
