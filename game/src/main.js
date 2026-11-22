// Coral Bay — the game itself: loop, camera, input, carjacking, combat wiring,
// shops, garage, saves, menus and the screenshot scene setups.
(function () {
  'use strict';
  var CB = window.CB;

  function $(id) { return document.getElementById(id); }

  function Game() {
    this.state = 'title'; // title | playing | paused | dead | win | shop | garage | how | missions
    this.prevState = 'playing';
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.world = null;
    this.player = null;
    this.traffic = null;
    this.police = null;
    this.peds = null;
    this.missions = null;
    this.wanted = null;
    this.hud = null;
    this.audio = new CB.AudioSys();
    this.keys = {};
    this.mouseDown = false;
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    this.parked = [];
    this.missionCar = null;
    this.tracers = [];
    this.muzzle = null;
    this.explosions = [];
    this.clock = null;
    this.shotMode = null;
    this._frames = 0;
    this._autoStartT = 0;
    this._saveNote = '';
  }

  Game.prototype.playerPos = function () {
    return this.player.inCar ? this.player.inCar.mesh.position : this.player.pos;
  };

  Game.prototype.nextMissionPos = function () {
    var starts = [[120, 120], [-60, -60], [-60, -60], [480, -480], [-360, -240], [360, 360], [360, 360], [0, -480]];
    var i = this.missions.index;
    if (i >= starts.length) return CB.SAFEHOUSE_POS.slice(0, 2).concat([0]).slice(0, 2);
    return starts[i];
  };

  Game.prototype.init = function () {
    var canvas = $('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.world = new CB.World();
    this.world.build(this.scene);
    this.world.onPickup = this.onPickup.bind(this);
    this.player = new CB.Player(this.scene, this.world);
    this.traffic = new CB.TrafficManager(this.scene, this.world);
    this.traffic.spawn(12);
    this.police = new CB.PoliceManager(this.scene, this.world);
    this.peds = new CB.Pedestrians(this.scene);
    this.peds.spawn(16);
    this.wanted = new CB.Wanted();
    this.missions = new CB.MissionManager(this);
    this.hud = new CB.HUD();
    this.clock = new THREE.Clock();
    // muzzle flash light
    this.muzzle = new THREE.PointLight(0xffd23e, 0, 18);
    this.scene.add(this.muzzle);
    // tracer pool
    for (var i = 0; i < 12; i++) {
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.visible = false;
      this.scene.add(line);
      this.tracers.push({ line: line, t: 0 });
    }
    var self = this;
    this.player._tracer = function (origin, dir, len) { self.spawnTracer(origin, dir, len); };
    window.addEventListener('resize', function () {
      self.camera.aspect = window.innerWidth / window.innerHeight;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.bindInput();
    this.bindMenus();
    // screenshot scene setups (?shot=start|drive|mission|city)
    var params = new URLSearchParams(window.location.search);
    this.shotMode = params.get('shot');
    if (params.get('debug')) {
      var d = document.createElement('div');
      d.id = 'debug-readout';
      d.style.cssText = 'position:fixed;left:4px;top:40%;z-index:99;color:#0f0;background:#000;font:12px monospace;';
      document.body.appendChild(d);
      this._debugEl = d;
    }
    if (this.shotMode) this.setupShot(this.shotMode);
    else this.showTitle();
    $('loading').classList.add('hidden');
    this.loop();
  };

  Game.prototype.spawnTracer = function (origin, dir, len) {
    var t = null;
    for (var i = 0; i < this.tracers.length; i++) if (this.tracers[i].t <= 0) { t = this.tracers[i]; break; }
    if (!t) t = this.tracers[0];
    var pos = t.line.geometry.attributes.position.array;
    pos[0] = origin.x; pos[1] = origin.y; pos[2] = origin.z;
    pos[3] = origin.x + dir.x * len; pos[4] = origin.y + dir.y * len; pos[5] = origin.z + dir.z * len;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.9;
    t.t = 0.07;
  };

  Game.prototype.spawnExplosion = function (x, z) {
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.9 }));
    mesh.position.set(x, 2, z);
    this.scene.add(mesh);
    var light = new THREE.PointLight(0xff7a1a, 3, 40);
    light.position.set(x, 4, z);
    this.scene.add(light);
    this.explosions.push({ mesh: mesh, light: light, t: 0.7 });
    if (this.audio) this.audio.explosion();
  };

  // ---------- Menus ----------
  Game.prototype.hideAllMenus = function () {
    ['menu-start', 'menu-how', 'menu-missions', 'menu-pause', 'menu-dead', 'menu-win'].forEach(function (id) { $(id).classList.add('hidden'); });
    $('shop-panel').classList.add('hidden');
    $('garage-panel').classList.add('hidden');
  };

  Game.prototype.showTitle = function () {
    this.state = 'title';
    this.hideAllMenus();
    $('menu-start').classList.remove('hidden');
    $('hud').classList.add('hidden');
    $('btn-continue').style.display = this.hasSave() ? '' : 'none';
    // orbit camera over the city behind the title
    this.player.camYaw = 0.6;
  };

  Game.prototype.startNewGame = function () {
    this.resetProgress();
    this.beginPlay();
    this.missions.startNext();
    this.toast('Job 1: FIRST WHEELS — steal a car!');
  };

  Game.prototype.beginPlay = function () {
    this.state = 'playing';
    this.hideAllMenus();
    $('hud').classList.remove('hidden');
    this.audio.init();
    this.audio.resume();
    this.setObjective('FREE ROAM', 'Next job: follow the gold M — press M for the story list', '');
    var p = this.nextMissionPos();
    this.world.setMarker(p[0], p[1], true);
  };

  Game.prototype.resetProgress = function () {
    this.player.health = 100; this.player.armor = 0; this.player.money = 0;
    this.player.ammo = [Infinity, 48, 120, 0]; this.player.hasShotgun = false;
    this.player.weaponIndex = 0;
    this.missions.index = 0; this.missions.completed = 0; this.missions.active = null;
    this.missions.finishedStory = false;
    this.wanted.clear();
    this.player.pos.set(-60, 0, -40);
    this.player.alive = true;
    if (this.player.inCar) this.exitCar();
  };

  Game.prototype.showWin = function () {
    this.state = 'win';
    $('win-stats').textContent = 'Jobs done: ' + this.missions.completed + ' · Cash: $' + this.player.money.toLocaleString('en-US');
    $('menu-win').classList.remove('hidden');
  };

  Game.prototype.showDead = function () {
    this.state = 'dead';
    this.hideAllMenus();
    $('menu-dead').classList.remove('hidden');
    if (this.audio) this.audio.explosion();
  };

  Game.prototype.setObjective = function (t, x, d) { this.hud.setObjective(t, x, d); };
  Game.prototype.toast = function (t, s) { this.hud.toast(t, s); };
  Game.prototype.showBanner = function (t, s, secs) { this.hud.banner(t, s, secs); };

  // ---------- Save / load ----------
  Game.prototype.hasSave = function () {
    try { return !!localStorage.getItem(CB.SAVE_KEY); } catch (e) { return false; }
  };

  Game.prototype.saveGame = function () {
    try {
      var p = this.player;
      localStorage.setItem(CB.SAVE_KEY, JSON.stringify({
        money: p.money, ammo: p.ammo, hasShotgun: p.hasShotgun,
        missionIndex: this.missions.index, completed: this.missions.completed,
        health: p.health, armor: p.armor,
        x: p.pos.x, z: p.pos.z,
      }));
      return true;
    } catch (e) { return false; }
  };

  Game.prototype.loadGame = function () {
    try {
      var s = JSON.parse(localStorage.getItem(CB.SAVE_KEY));
      if (!s) return false;
      var p = this.player;
      p.money = s.money || 0; p.ammo = s.ammo || p.ammo; p.hasShotgun = !!s.hasShotgun;
      p.health = s.health || 100; p.armor = s.armor || 0;
      p.pos.set(s.x || -60, 0, s.z || -40);
      this.missions.index = s.missionIndex || 0;
      this.missions.completed = s.completed || 0;
      this.missions.active = null;
      p.alive = true;
      return true;
    } catch (e) { return false; }
  };

  // ---------- Pickups / crime ----------
  Game.prototype.onPickup = function (data) {
    var p = this.player;
    if (data.kind === 'cash') { p.money += data.amount; this.toast('+$' + data.amount); }
    else if (data.kind === 'health') { p.heal(data.amount); this.toast('Health +' + data.amount); }
    else if (data.kind === 'armor') { p.armor = Math.min(100, p.armor + data.amount); this.toast('Armor +' + data.amount); }
    else if (data.kind === 'ammo') { p.ammo[1] += 24; p.ammo[2] += 48; this.toast('Ammo restocked'); }
    if (this.audio) this.audio.pickup();
  };

  Game.prototype.commitCrime = function (heat) {
    this.wanted.addHeat(heat);
  };

  Game.prototype.spawnParkedCar = function (type, x, z) {
    var v = new CB.Vehicle(type, x, z, 0.5, this.scene);
    this.parked.push(v);
    return v;
  };

  // ---------- Car enter / exit ----------
  Game.prototype.nearestDriveable = function (maxD) {
    var p = this.player.pos;
    var best = this.traffic.nearestCar(p.x, p.z, maxD);
    var bestD = best ? Math.hypot(best.mesh.position.x - p.x, best.mesh.position.z - p.z) : maxD;
    for (var i = 0; i < this.parked.length; i++) {
      var v = this.parked[i];
      var d = Math.hypot(v.mesh.position.x - p.x, v.mesh.position.z - p.z);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best;
  };

  Game.prototype.enterCar = function (v) {
    // stealing a traffic car is a crime; a parked mission car too
    this.traffic.removeCar(v);
    var pi = this.parked.indexOf(v);
    if (pi >= 0) this.parked.splice(pi, 1);
    this.player.inCar = v;
    this.player.mesh.visible = false;
    this.commitCrime(v.type === 'police' ? 40 : 20);
    this.toast('Stole the ' + v.def.name + ' — the CBPD noticed!');
    if (this.audio) this.audio.horn();
  };

  Game.prototype.exitCar = function () {
    var v = this.player.inCar;
    if (!v) return;
    var a = v.mesh.rotation.y;
    var x = v.mesh.position.x + Math.cos(a) * 3, z = v.mesh.position.z - Math.sin(a) * 3;
    this.player.pos.set(x, 0, z);
    this.player.mesh.visible = true;
    this.player.inCar = null;
    this.parked.push(v);
    v.speed = 0;
  };

  Game.prototype.tryEnterCar = function () {
    var v = this.nearestDriveable(5);
    if (v) this.enterCar(v);
    else this.hud.setHint('No car close enough — walk up to one and press E');
  };

  // ---------- Input ----------
  Game.prototype.bindInput = function () {
    var self = this;
    var canvas = $('game-canvas');
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      self.keys[e.code] = true;
      if (self.state !== 'playing') return;
      if (e.code === 'KeyE') { if (self.player.inCar) self.exitCar(); else self.tryEnterCar(); }
      if (e.code === 'KeyR') { self.audio.nextStation(); self.toast('♪ ' + self.audio.stations[self.audio.station].name); }
      if (e.code === 'KeyH' && self.player.inCar && self.audio) self.audio.horn();
      if (e.code === 'KeyC') { self.player.camDist = self.player.camDist === 7 ? 11 : 7; }
      if (e.code === 'KeyM') self.toggleMissions();
      if (e.code === 'KeyP' || e.code === 'Escape') self.togglePause();
      if (e.code === 'Digit1') self.player.selectWeapon(0);
      if (e.code === 'Digit2') self.player.selectWeapon(1);
      if (e.code === 'Digit3') self.player.selectWeapon(2);
      if (e.code === 'Digit4') self.player.selectWeapon(3);
      if (e.code === 'KeyQ') $('wheel').classList.remove('hidden');
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'KeyQ') {
        $('wheel').classList.add('hidden');
        var sel = document.querySelector('.wheel-slot.sel');
        if (sel) self.player.selectWeapon(parseInt(sel.dataset.w, 10));
      }
    });
    canvas.addEventListener('mousedown', function (e) {
      if (self.state !== 'playing') return;
      if (e.button === 0) {
        self.mouseDown = true;
        self.dragging = true;
        self.lastX = e.clientX; self.lastY = e.clientY;
        if (canvas.requestPointerLock) canvas.requestPointerLock();
      }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) { self.mouseDown = false; self.dragging = false; }
      if (document.pointerLockElement) document.exitPointerLock();
    });
    window.addEventListener('mousemove', function (e) {
      if (self.state !== 'playing') return;
      var dx = 0, dy = 0;
      if (document.pointerLockElement === canvas) {
        dx = e.movementX; dy = e.movementY;
      } else if (self.dragging) {
        dx = e.clientX - self.lastX; dy = e.clientY - self.lastY;
        self.lastX = e.clientX; self.lastY = e.clientY;
      } else {
        // weapon wheel hover
        if (!$('wheel').classList.contains('hidden')) self.updateWheelHover(e.clientX, e.clientY);
        return;
      }
      self.player.camYaw -= dx * 0.004;
      self.player.camPitch = Math.max(-0.15, Math.min(0.7, self.player.camPitch + dy * 0.003));
    });
    window.addEventListener('wheel', function (e) {
      if (self.state !== 'playing') return;
      self.player.camDist = Math.max(4, Math.min(14, self.player.camDist + Math.sign(e.deltaY)));
    });
    // shop / garage buy buttons
    document.querySelectorAll('#shop-panel [data-buy]').forEach(function (b) {
      b.addEventListener('click', function () { self.buyShop(b.dataset.buy); });
    });
    document.querySelectorAll('#garage-panel [data-buy]').forEach(function (b) {
      b.addEventListener('click', function () { self.buyGarage(b.dataset.buy); });
    });
  };

  Game.prototype.updateWheelHover = function (x, y) {
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var ang = Math.atan2(y - cy, x - cx);
    var idx = 0;
    if (ang > -Math.PI * 0.75 && ang <= -Math.PI * 0.25) idx = 0;
    else if (ang > -Math.PI * 0.25 && ang <= Math.PI * 0.25) idx = 1;
    else if (ang > Math.PI * 0.25 && ang <= Math.PI * 0.75) idx = 2;
    else idx = 3;
    document.querySelectorAll('.wheel-slot').forEach(function (s) {
      s.classList.toggle('sel', parseInt(s.dataset.w, 10) === idx);
    });
  };

  Game.prototype.togglePause = function () {
    if (this.state === 'playing') {
      this.prevState = 'playing';
      this.state = 'paused';
      this.hideAllMenus();
      $('menu-pause').classList.remove('hidden');
      $('save-note').textContent = '';
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hideAllMenus();
    }
  };

  Game.prototype.toggleMissions = function () {
    if (this.state === 'playing') {
      this.state = 'missions';
      this.renderMissionList();
      $('menu-missions').classList.remove('hidden');
    } else if (this.state === 'missions') {
      this.state = 'playing';
      $('menu-missions').classList.add('hidden');
    }
  };

  Game.prototype.renderMissionList = function () {
    var html = '';
    CB.MISSIONS.forEach(function (m, i) {
      var cls = i < this.missions.completed ? 'done' : (i === this.missions.index ? 'next' : 'locked');
      var mark = i < this.missions.completed ? '✓ ' : (i === this.missions.index ? '▶ ' : '· ');
      html += '<div class="' + cls + '">' + mark + (i + 1) + '. ' + m.title + ' — $' + m.pay + '</div>';
    }, this);
    $('mission-list').innerHTML = html;
  };

  // ---------- Shops ----------
  Game.prototype.buyShop = function (item) {
    var p = this.player;
    var cost = { pistolAmmo: 120, smgAmmo: 200, shotAmmo: 180, shotgun: 900, armor: 350, health: 150 }[item];
    if (p.money < cost) { this.toast('Not enough cash!'); return; }
    if (item === 'shotgun' && p.hasShotgun) { this.toast('Already own the shotgun'); return; }
    p.money -= cost;
    if (item === 'pistolAmmo') p.ammo[1] += 24;
    if (item === 'smgAmmo') p.ammo[2] += 60;
    if (item === 'shotAmmo') p.ammo[3] += 16;
    if (item === 'shotgun') { p.hasShotgun = true; p.ammo[3] += 16; }
    if (item === 'armor') p.armor = 100;
    if (item === 'health') p.health = 100;
    if (this.audio) this.audio.pickup();
    this.toast('Purchased!');
  };

  Game.prototype.buyGarage = function (item) {
    var p = this.player;
    if (!p.inCar) return;
    var cost = { paint: 200, engine: 800, turbo: 650, carArmor: 500, repair: 150 }[item];
    if (p.money < cost) { this.toast('Not enough cash!'); return; }
    var car = p.inCar;
    if (item === 'engine' && car.upgrades.engine >= 2) { this.toast('Engine maxed'); return; }
    if (item === 'turbo' && car.upgrades.turbo) { this.toast('Turbo already fitted'); return; }
    if (item === 'carArmor' && car.upgrades.armor) { this.toast('Armor already fitted'); return; }
    p.money -= cost;
    if (item === 'paint') {
      var colors = [0xff2a5e, 0x2affd5, 0xffd23e, 0x7a4bd9, 0xe8e8e8, 0x1a1a1a];
      var c = colors[(Math.random() * colors.length) | 0];
      car.mesh.children.forEach(function (ch) {
        if (ch.geometry && ch.geometry.type === 'BoxGeometry' && ch.material && ch.material.color) {
          if (ch.position.y === 0.65 || ch.position.y === 1.58) ch.material.color.setHex(c);
        }
      });
      car.paint = c;
    }
    if (item === 'engine') car.upgrades.engine++;
    if (item === 'turbo') car.upgrades.turbo = true;
    if (item === 'carArmor') { car.upgrades.armor = true; car.health = 150; }
    if (item === 'repair') car.health = car.upgrades.armor ? 150 : 100;
    if (this.audio) this.audio.pickup();
    this.toast('Installed!');
  };

  // ---------- Menus wiring ----------
  Game.prototype.bindMenus = function () {
    var self = this;
    $('btn-new').addEventListener('click', function () { self.audio.init(); self.startNewGame(); });
    $('btn-continue').addEventListener('click', function () {
      self.audio.init();
      self.loadGame();
      self.beginPlay();
      self.toast('Welcome back to Coral Bay');
    });
    $('btn-how').addEventListener('click', function () { self.hideAllMenus(); $('menu-how').classList.remove('hidden'); });
    $('btn-how-back').addEventListener('click', function () { self.hideAllMenus(); $('menu-start').classList.remove('hidden'); });
    $('btn-missions-close').addEventListener('click', function () { self.toggleMissions(); });
    $('btn-resume').addEventListener('click', function () { self.togglePause(); });
    $('btn-save').addEventListener('click', function () {
      $('save-note').textContent = self.saveGame() ? 'Game saved.' : 'Save failed (browser storage unavailable).';
    });
    $('btn-quit-title').addEventListener('click', function () { self.saveGame(); self.showTitle(); });
    $('btn-retry').addEventListener('click', function () {
      self.missions.failMission('Rae is back on the streets.');
      self.player.health = 100; self.player.alive = true;
      self.player.money = Math.floor(self.player.money / 2);
      self.player.pos.set(-60, 0, -40);
      self.wanted.clear();
      self.beginPlay();
    });
    $('btn-dead-title').addEventListener('click', function () { self.showTitle(); });
    $('btn-freeroam').addEventListener('click', function () { self.state = 'playing'; self.hideAllMenus(); });
    $('btn-win-title').addEventListener('click', function () { self.showTitle(); });
  };

  // ---------- Combat wiring ----------
  Game.prototype.onEnemyKilled = function (enemy) {
    this.missions.onKill();
    this.player.money += 50;
    this.commitCrime(8);
  };

  Game.prototype.playerShoot = function () {
    var self = this;
    this.player.shoot(this.missions.enemies, this.audio, function (enemy, dmg) {
      enemy.damage(dmg);
      self.muzzle.position.copy(self.player.pos); self.muzzle.position.y += 1.6;
      self.muzzle.intensity = 2;
      setTimeout(function () { self.muzzle.intensity = 0; }, 60);
      if (enemy.dead) self.onEnemyKilled(enemy);
    });
    // shooting in public is a crime (if anyone is around, the heat rises)
    if (this.player.weaponIndex > 0) this.commitCrime(2);
  };

  // ---------- Screenshot scene setups ----------
  Game.prototype.setupShot = function (mode) {
    this.audio.radioOn = false;
    this.state = 'playing';
    this.hideAllMenus();
    $('hud').classList.remove('hidden');
    var p = this.player;
    if (mode === 'start') {
      this.state = 'title';
      $('hud').classList.add('hidden');
      $('menu-start').classList.remove('hidden');
      p.pos.set(0, 0, 120);
      p.camYaw = 0.5;
      return;
    }
    if (mode === 'drive') {
      // street x=0, mid-block, heading -z; police cruisers right on the tail
      var car = new CB.Vehicle('sport', 0, -180, Math.PI, this.scene);
      this.parked.push(car);
      p.inCar = car;
      p.mesh.visible = false;
      car.speed = 24;
      p.money = 2450;
      p.camYaw = 0; // car heads -z, camera sits behind it at +z
      p.camDist = 14;
      p.camPitch = 0.5; // high chase cam: car + road ahead fill the frame
      this.keys.KeyW = true;
      this.wanted.setStars(3);
      // one cruiser on the tail, one cutting in head-on ahead
      var pc1 = new CB.Vehicle('police', -4.5, -158, Math.PI, this.scene);
      pc1.ai = 'police'; pc1.speed = 28;
      this.police.cars.push(pc1);
      var pc2 = new CB.Vehicle('police', 4.5, -238, 0, this.scene);
      pc2.ai = 'police'; pc2.speed = 20;
      this.police.cars.push(pc2);
      // a taxi ahead for depth
      var tx = new CB.Vehicle('taxi', 3, -250, Math.PI, this.scene);
      tx.ai = 'traffic'; tx.speed = 12;
      this.traffic.cars.push(tx);
      this.setObjective('THE GETAWAY', 'Reach the north docks with 3-star heat on you', '360m');
      return;
    }
    if (mode === 'mission') {
      p.pos.set(-360, 0, -200);
      p.camYaw = 0; // enemies are at -z from the player; camera sits at +z
      p.weaponIndex = 2;
      p.ammo = [Infinity, 96, 240, 16];
      p.money = 1800;
      this.missions.index = 4;
      this.missions.startNext();
      this.setObjective('THE EXCHANGE', 'Take out the Vulture runners at the depot (0/4)', '18m');
      // keep the mission banner out of the screenshot
      this.hud._bannerT = 0;
      $('banner').classList.add('hidden');
      return;
    }
    if (mode === 'city') {
      // golden-hour cruise down street z=0, mid-block, traffic in frame
      var car2 = new CB.Vehicle('coupe', 180, 0, -Math.PI / 2, this.scene);
      this.parked.push(car2);
      p.inCar = car2;
      p.mesh.visible = false;
      car2.speed = 14;
      p.money = 5300;
      p.camYaw = Math.PI / 2; // car heads -x, camera sits behind it at +x
      p.camDist = 14;
      p.camPitch = 0.5; // high chase cam: car + road ahead fill the frame
      this.keys.KeyW = true;
      // traffic ahead on the same street for depth
      var t1 = new CB.Vehicle('taxi', 120, 3, -Math.PI / 2, this.scene);
      t1.ai = 'traffic'; t1.speed = 11;
      this.traffic.cars.push(t1);
      var t2 = new CB.Vehicle('sedan', 80, -3, -Math.PI / 2, this.scene);
      t2.ai = 'traffic'; t2.speed = 10;
      this.traffic.cars.push(t2);
      this.setObjective('FREE ROAM', 'Next job: follow the gold M — press M for the story list', '');
      this.world.setMarker(120, 120, true);
    }
  };

  // ---------- Main loop ----------
  Game.prototype.loop = function () {
    var self = this;
    function frame() {
      requestAnimationFrame(frame);
      self.tick();
    }
    requestAnimationFrame(frame);
  };

  Game.prototype.inputState = function () {
    var k = this.keys;
    return {
      forward: !!(k.KeyW || k.ArrowUp),
      back: !!(k.KeyS || k.ArrowDown),
      left: !!(k.KeyA || k.ArrowLeft),
      right: !!(k.KeyD || k.ArrowRight),
      sprint: !!k.ShiftLeft || !!k.ShiftRight,
      jump: !!k.Space,
      handbrake: !!k.Space,
    };
  };

  Game.prototype.tick = function () {
    var dt = Math.min(this.clock.getDelta(), 0.05);
    var t = this.clock.elapsedTime;
    this._frames++;
    // keep the canvas glued to the real viewport (headless windows report a
    // smaller innerHeight at load than the screenshot size)
    if (this._frames % 30 === 0) {
      var sz = this.renderer.getSize(new THREE.Vector2());
      if (sz.x !== window.innerWidth || sz.y !== window.innerHeight) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }
    if (this._debugEl) {
      var pp = this.playerPos();
      this._debugEl.textContent = 'player ' + pp.x.toFixed(1) + ',' + pp.z.toFixed(1) +
        ' cam ' + this.camera.position.x.toFixed(1) + ',' + this.camera.position.y.toFixed(1) + ',' + this.camera.position.z.toFixed(1) +
        ' yaw ' + this.player.camYaw.toFixed(2) + ' state ' + this.state + ' frames ' + this._frames;
    }
    // title-screen camera orbit
    if (this.state === 'title') {
      var a = t * 0.05;
      this.camera.position.set(Math.sin(a) * 260, 90, Math.cos(a) * 260);
      this.camera.lookAt(0, 20, 0);
      this.world.update(t, null);
      this.renderer.render(this.scene, this.camera);
      if (this.shotMode === 'start' && this._frames > 90) window.__shotReady = true;
      return;
    }
    if (this.state !== 'playing') {
      // paused / menus: still render the frozen scene
      this.renderer.render(this.scene, this.camera);
      return;
    }
    var input = this.inputState();
    var p = this.player;
    var pp = this.playerPos();

    // --- player / car ---
    if (p.inCar) {
      p.inCar.drive(dt, input, this.world);
      // police rams damage the car
      var self = this;
      this.police.cars.forEach(function (pc) {
        var d = Math.hypot(pc.mesh.position.x - p.inCar.mesh.position.x, pc.mesh.position.z - p.inCar.mesh.position.z);
        if (d < 4.2) {
          p.inCar.health -= dt * 14;
          if (p.inCar.health <= 0) {
            self.spawnExplosion(p.inCar.mesh.position.x, p.inCar.mesh.position.z);
            var v = p.inCar;
            self.exitCar();
            self.scene.remove(v.mesh);
            p.takeDamage(25);
            self.commitCrime(10);
          }
        }
      });
      if (this.audio) this.audio.setEngine(Math.abs(p.inCar.speed) / p.inCar.topSpeed(), true);
    } else {
      p.updateOnFoot(dt, input);
      if (this.mouseDown && p.weaponIndex > 0) this.playerShoot();
      else if (this.mouseDown && p.weaponIndex === 0 && p._shootT <= 0) this.playerShoot();
      if (this.audio) this.audio.setEngine(0, false);
    }

    // --- world systems ---
    this.traffic.update(dt, pp);
    var policeNear = this.police.cars.some(function (pc) {
      return Math.hypot(pc.mesh.position.x - pp.x, pc.mesh.position.z - pp.z) < 60;
    });
    this.police.update(dt, this.wanted.stars, pp, !!p.inCar, this.audio);
    this.peds.update(dt, pp, this.mouseDown);
    this.world.update(t, pp);
    this.missions.update(dt);
    // enemies
    var self2 = this;
    this.missions.enemies.forEach(function (e) {
      e.update(dt, pp, p, self2.audio, function (dmg) {
        p.takeDamage(dmg);
        if (self2.audio) self2.audio.hurt();
        var df = $('damage-flash');
        df.style.opacity = '1';
        setTimeout(function () { df.style.opacity = '0'; }, 150);
      });
    });
    // wanted decay + safehouse clear
    this.wanted.update(dt, policeNear, false);
    var sdx = pp.x - CB.SAFEHOUSE_POS[0], sdz = pp.z - CB.SAFEHOUSE_POS[2];
    if (sdx * sdx + sdz * sdz < 144 && this.wanted.stars > 0) {
      this.wanted.clear();
      this.hud.setHint('Safehouse — heat cleared. Game saved.');
      this.saveGame();
    }
    // mission auto-start when reaching the gold M
    if (!this.missions.active && this.missions.index < CB.MISSIONS.length) {
      var mp = this.nextMissionPos();
      var mdx = pp.x - mp[0], mdz = pp.z - mp[1];
      if (mdx * mdx + mdz * mdz < 144) this.missions.startNext();
    }
    // shop / garage proximity
    var shdx = pp.x - CB.SHOP_POS[0], shdz = pp.z - CB.SHOP_POS[2];
    var gadx = pp.x - CB.GARAGE_POS[0], gadz = pp.z - CB.GARAGE_POS[2];
    var nearShop = shdx * shdx + shdz * shdz < 500;
    var nearGarage = gadx * gadx + gadz * gadz < 500;
    $('shop-panel').classList.toggle('hidden', !nearShop || !!p.inCar);
    $('garage-panel').classList.toggle('hidden', !nearGarage || !p.inCar);
    if (nearShop) $('shop-cash').textContent = '$' + p.money.toLocaleString('en-US');
    if (nearGarage) $('garage-cash').textContent = '$' + p.money.toLocaleString('en-US');
    // hints
    var hint = '';
    if (!p.inCar) {
      var near = this.nearestDriveable(5);
      if (near) hint = 'Press E to steal the ' + near.def.name;
      else if (nearShop) hint = 'TAC SHOP — buy ammo, armor, guns';
      else if (nearGarage) hint = 'GARAGE — drive a car in to tune it';
    } else {
      hint = 'WASD drive · Space handbrake · E exit · H horn · R radio';
    }
    this.hud.setHint(hint);
    // death
    if (!p.alive) { this.showDead(); }
    // camera
    this.updateCamera(dt);
    // tracers + explosions fade
    this.tracers.forEach(function (tr) {
      if (tr.t > 0) { tr.t -= dt; tr.line.material.opacity = Math.max(0, tr.t / 0.07) * 0.9; if (tr.t <= 0) tr.line.visible = false; }
    });
    this.explosions.forEach(function (ex) {
      ex.t -= dt;
      var s = (0.7 - ex.t) * 14 + 1;
      ex.mesh.scale.set(s, s, s);
      ex.mesh.material.opacity = Math.max(0, ex.t / 0.7);
      ex.light.intensity = Math.max(0, ex.t * 4);
      if (ex.t <= 0) { self2.scene.remove(ex.mesh); self2.scene.remove(ex.light); }
    });
    this.explosions = this.explosions.filter(function (ex) { return ex.t > 0; });
    // HUD
    this.hud.update(this, dt);
    this.renderer.render(this.scene, this.camera);
    if (this.shotMode && this._frames > 150) window.__shotReady = true;
  };

  Game.prototype.updateCamera = function (dt) {
    var p = this.player;
    var target = p.inCar ? p.inCar.mesh.position : p.pos;
    var dist = p.inCar ? p.camDist + 3.5 : p.camDist;
    var cy = p.camYaw, cp = p.camPitch;
    var cx = target.x + Math.sin(cy) * Math.cos(cp) * dist;
    var cz = target.z + Math.cos(cy) * Math.cos(cp) * dist;
    var cy2 = 1.6 + Math.sin(cp) * dist + (p.inCar ? 1.2 : 0);
    // keep camera above ground and out of buildings is approximated by height floor
    // (a minimum per-frame step so the camera settles quickly even when the
    // frame delta is tiny, e.g. under virtual time in headless screenshots)
    var k = Math.max(0.35, Math.min(1, dt * 8));
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (Math.max(1.5, cy2) - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.lookAt(target.x, target.y + 1.6, target.z);
  };

  window.addEventListener('DOMContentLoaded', function () {
    var game = new Game();
    window.CBGame = game;
    try { game.init(); } catch (err) {
      var el = document.getElementById('loading');
      if (el) el.textContent = 'ERROR: ' + err.message;
      window.__gameError = String(err && err.stack || err);
    }
  });
})();
