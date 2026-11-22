// Coral Bay — the story engine: eight sequential jobs, the wanted system,
// pedestrians who walk the sidewalks and flee gunfire, and the phone menu data.
(function () {
  'use strict';
  var CB = window.CB;

  // ---- Wanted system ----
  function Wanted() {
    this.stars = 0;
    this.heat = 0;        // 0..100, stars = ceil(heat/20)
    this.quietT = 0;      // seconds since last crime
    this.seenT = 0;       // seconds police have seen the player recently
  }
  Wanted.prototype.addHeat = function (n) {
    this.heat = Math.min(100, this.heat + n);
    this.quietT = 0;
    this.stars = Math.ceil(this.heat / 20);
  };
  Wanted.prototype.setStars = function (n) {
    this.stars = n;
    this.heat = n * 20;
    this.quietT = 0;
  };
  Wanted.prototype.update = function (dt, policeNear, playerHidden) {
    this.quietT += dt;
    if (this.quietT > 6 && !policeNear) {
      this.heat -= dt * 2.2; // cooling off
      if (this.heat < 0) this.heat = 0;
      this.stars = Math.ceil(this.heat / 20);
    }
    if (this.stars === 0) this.heat = 0;
  };
  Wanted.prototype.clear = function () { this.stars = 0; this.heat = 0; this.quietT = 0; };

  // ---- Pedestrians ----
  function Pedestrians(scene) {
    this.scene = scene;
    this.list = [];
    this.rnd = CB.RNG(CB.SEED + 21);
    this.shirts = [0xd95f4b, 0x4b7ad9, 0xe8c33a, 0x7a4bd9, 0x4bd98a, 0xe8e8e8, 0x2a2f3a];
  }

  Pedestrians.prototype.spawn = function (n) {
    for (var i = 0; i < n; i++) {
      var shirt = this.shirts[(this.rnd() * this.shirts.length) | 0];
      var m = CB.buildHumanoid(shirt, 0x2a2f3a, [0xc98a5e, 0xe8b88a, 0x8a5a3a][(this.rnd() * 3) | 0]);
      var street = -600 + Math.floor(this.rnd() * 11) * 120;
      var along = -560 + this.rnd() * 1120;
      var onX = this.rnd() < 0.5;
      m.position.set(onX ? along : street + (this.rnd() < 0.5 ? -14 : 14), 0, onX ? street + (this.rnd() < 0.5 ? -14 : 14) : along);
      m.rotation.y = this.rnd() * Math.PI * 2;
      this.scene.add(m);
      this.list.push({ mesh: m, speed: 1.2 + this.rnd() * 1.2, dir: this.rnd() * Math.PI * 2, flee: 0, phase: this.rnd() * 10 });
    }
  };

  Pedestrians.prototype.update = function (dt, playerPos, gunfire) {
    var self = this;
    this.list.forEach(function (p) {
      if (gunfire) {
        var dx = p.mesh.position.x - playerPos.x, dz = p.mesh.position.z - playerPos.z;
        if (dx * dx + dz * dz < 900) p.flee = 3;
      }
      var spd = p.speed;
      if (p.flee > 0) {
        p.flee -= dt;
        spd = 5.5;
        var dx2 = p.mesh.position.x - playerPos.x, dz2 = p.mesh.position.z - playerPos.z;
        var d = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
        p.dir = Math.atan2(dx2 / d, dz2 / d);
      } else if (Math.random() < dt * 0.06) {
        p.dir += (Math.random() - 0.5) * 1.6;
      }
      p.mesh.position.x += Math.sin(p.dir) * spd * dt;
      p.mesh.position.z += Math.cos(p.dir) * spd * dt;
      // keep on the map and off the roads' middle
      if (p.mesh.position.x < -585) p.dir = Math.PI / 2;
      if (p.mesh.position.x > 585) p.dir = -Math.PI / 2;
      if (p.mesh.position.z < -585) p.dir = 0;
      if (p.mesh.position.z > 585) p.dir = Math.PI;
      p.mesh.rotation.y = p.dir;
      p.phase += dt * spd * 3;
      var sw = Math.sin(p.phase) * 0.5;
      p.mesh.userData.legL.rotation.x = sw;
      p.mesh.userData.legR.rotation.x = -sw;
      p.mesh.userData.armL.rotation.x = -sw * 0.6;
      p.mesh.userData.armR.rotation.x = sw * 0.6;
    });
  };

  // ---- Missions ----
  function MissionManager(game) {
    this.game = game;
    this.index = 0;          // next mission to play
    this.active = null;      // {def, step, ...}
    this.stepIndex = 0;
    this.enemies = [];
    this.timer = 0;
    this.kills = 0;
    this.completed = 0;
    this.finishedStory = false;
  }

  MissionManager.prototype.currentDef = function () {
    return CB.MISSIONS[this.index] || null;
  };

  MissionManager.prototype.startNext = function () {
    var def = this.currentDef();
    if (!def) return false;
    this.active = { def: def, step: 0 };
    this.stepIndex = 0;
    this.kills = 0;
    this.timer = 0;
    this.spawnStepEnemies();
    this.applyStep();
    this.game.showBanner(def.title, def.brief, 5);
    this.game.setObjective(def.title, this.stepText(), '');
    if (this.game.audio) this.game.audio.pickup();
    return true;
  };

  MissionManager.prototype.stepText = function () {
    if (!this.active) return '';
    var s = this.active.def.steps[this.stepIndex];
    if (!s) return '';
    if (s.type === 'kill') return s.text.replace(/\(\d+\/\d+\)/, '(' + this.kills + '/' + s.count + ')');
    return s.text;
  };

  MissionManager.prototype.applyStep = function () {
    if (!this.active) return;
    var s = this.active.def.steps[this.stepIndex];
    var g = this.game;
    if (!s) { this.completeMission(); return; }
    if (s.type === 'goto' || s.type === 'timed' || s.type === 'kill' || s.type === 'chase') {
      g.world.setMarker(s.pos[0], s.pos[2], true);
      if (s.type === 'timed') this.timer = s.time;
      if (s.type === 'kill') this.spawnStepEnemies();
      if (s.type === 'chase') g.wanted.setStars(s.wanted || 4);
    } else if (s.type === 'escape') {
      g.world.setMarker(0, 0, false);
      g.wanted.setStars(s.wanted || 2);
    } else if (s.type === 'stealCar') {
      g.world.setMarker(0, 0, false);
      if (s.carType === 'sport') {
        // park the Falcon S at the marina
        var v = g.spawnParkedCar('sport', 360, 380);
        g.missionCar = v;
        g.world.setMarker(360, 380, true);
      }
    }
    g.setObjective(this.active.def.title, this.stepText(), '');
  };

  MissionManager.prototype.spawnStepEnemies = function () {
    var s = this.active && this.active.def.steps[this.stepIndex];
    if (!s || s.type !== 'kill') return;
    var g = this.game;
    this.clearEnemies();
    this.kills = 0;
    for (var i = 0; i < s.count; i++) {
      var a = (i / s.count) * Math.PI * 2;
      var boss = (this.active.def.id === 'm8' && i === 0);
      var e = new CB.Enemy(g.scene, s.pos[0] + Math.sin(a) * 14, s.pos[2] + Math.cos(a) * 14, boss);
      this.enemies.push(e);
    }
  };

  MissionManager.prototype.clearEnemies = function () {
    this.enemies.forEach(function (e) { e.remove(); });
    this.enemies = [];
  };

  MissionManager.prototype.onKill = function () {
    this.kills++;
    var s = this.active && this.active.def.steps[this.stepIndex];
    if (s && s.type === 'kill') {
      this.game.setObjective(this.active.def.title, this.stepText(), '');
      if (this.kills >= s.count) this.nextStep();
    }
  };

  MissionManager.prototype.nextStep = function () {
    this.stepIndex++;
    var s = this.active.def.steps[this.stepIndex];
    if (!s) { this.completeMission(); return; }
    this.spawnStepEnemies();
    this.applyStep();
    if (this.game.audio) this.game.audio.pickup();
  };

  MissionManager.prototype.completeMission = function () {
    var def = this.active.def;
    var g = this.game;
    this.clearEnemies();
    g.world.setMarker(0, 0, false);
    g.player.money += def.pay;
    this.completed++;
    this.index++;
    this.active = null;
    if (this.game.audio) this.game.audio.missionDone();
    g.showBanner('JOB DONE — ' + def.title, '+$' + def.pay + '  ·  Respect up', 4);
    g.toast('+$' + def.pay + ' — ' + def.title + ' complete');
    g.saveGame();
    if (this.index >= CB.MISSIONS.length) {
      this.finishedStory = true;
      g.showWin();
    } else {
      g.setObjective('FREE ROAM', 'Next job: follow the gold M — press M for the story list', '');
      g.world.setMarker(g.nextMissionPos()[0], g.nextMissionPos()[1], true);
    }
  };

  MissionManager.prototype.failMission = function (reason) {
    if (!this.active) return;
    this.clearEnemies();
    this.game.world.setMarker(0, 0, false);
    this.active = null;
    this.game.showBanner('JOB FAILED', reason || 'Try again — follow the gold M marker.', 4);
    this.game.setObjective('FREE ROAM', 'Next job: follow the gold M — press M for the story list', '');
    var p = this.game.nextMissionPos();
    this.game.world.setMarker(p[0], p[1], true);
  };

  MissionManager.prototype.update = function (dt) {
    if (!this.active) return;
    var s = this.active.def.steps[this.stepIndex];
    if (!s) return;
    var g = this.game;
    var p = g.playerPos();
    if (s.type === 'goto' || s.type === 'timed' || s.type === 'chase') {
      var dx = s.pos[0] - p.x, dz = s.pos[2] - p.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      g.setObjective(this.active.def.title, this.stepText(), Math.round(d) + 'm');
      if (s.type === 'timed') {
        this.timer -= dt;
        if (this.timer <= 0) { this.failMission('Out of time.'); return; }
        g.setObjective(this.active.def.title, this.stepText(), Math.round(d) + 'm · ' + Math.ceil(this.timer) + 's left');
      }
      if (d < s.radius) {
        if (s.type === 'chase' && g.wanted.stars < 3) { /* must arrive hot */ }
        this.nextStep();
      }
    } else if (s.type === 'escape') {
      g.setObjective(this.active.def.title, this.stepText(), g.wanted.stars + ' stars');
      if (g.wanted.stars === 0) this.nextStep();
    } else if (s.type === 'stealCar') {
      if (g.player.inCar) {
        if (!s.carType || g.player.inCar.type === s.carType) this.nextStep();
        else g.setObjective(this.active.def.title, 'Wrong car — steal the ' + (s.carType === 'sport' ? 'Falcon S' : 'a car'), '');
      }
    }
  };

  CB.Wanted = Wanted;
  CB.Pedestrians = Pedestrians;
  CB.MissionManager = MissionManager;
})();
