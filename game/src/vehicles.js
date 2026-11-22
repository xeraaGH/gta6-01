// Coral Bay — vehicles: box-built cars, traffic AI that follows the street
// grid, police cruisers that chase and ram, roadblocks, and the Air One heli.
(function () {
  'use strict';
  var CB = window.CB;

  function carMesh(def, color) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshPhongMaterial({ color: color || def.color, shininess: 60 });
    var darkMat = new THREE.MeshPhongMaterial({ color: 0x181c22, shininess: 20 });
    var glassMat = new THREE.MeshPhongMaterial({ color: 0x9fc8e8, shininess: 120 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.4), bodyMat);
    body.position.y = 0.65;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), glassMat);
    cabin.position.set(0, 1.25, -0.2);
    g.add(cabin);
    var roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.9), bodyMat);
    roof.position.set(0, 1.58, -0.2);
    g.add(roof);
    // wheels
    var wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    g.userData.wheels = [];
    [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]].forEach(function (p) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], 0.42, p[1]);
      g.add(w);
      g.userData.wheels.push(w);
    });
    // headlights + taillights
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    [-0.6, 0.6].forEach(function (x) {
      var h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
      h.position.set(x, 0.7, 2.22);
      g.add(h);
    });
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
    [-0.6, 0.6].forEach(function (x) {
      var t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
      t.position.set(x, 0.7, -2.22);
      g.add(t);
    });
    if (def === CB.CAR_DEFS.police) {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
      bar.position.set(0, 1.7, -0.2);
      g.add(bar);
      g.userData.lightbar = bar;
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 4.42), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      stripe.position.y = 0.9;
      g.add(stripe);
    }
    g.userData.def = def;
    return g;
  }

  function Vehicle(type, x, z, angle, scene) {
    this.def = CB.CAR_DEFS[type] || CB.CAR_DEFS.sedan;
    this.type = type;
    this.mesh = carMesh(this.def);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = angle || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.upgrades = { engine: 0, turbo: false, armor: false };
    this.paint = null;
    this.ai = null;      // 'traffic' | 'police' | null (player-driven)
    this.stuckT = 0;
    scene.add(this.mesh);
  }

  Vehicle.prototype.topSpeed = function () {
    var t = this.def.top * (1 + this.upgrades.engine * 0.25);
    if (this.upgrades.turbo) t *= 1.12;
    return t;
  };

  // Arcade driving: throttle/brake/steer, simple collision with buildings.
  Vehicle.prototype.drive = function (dt, input, world) {
    var top = this.topSpeed();
    if (input.forward) this.speed += this.def.accel * dt * (this.speed < 0 ? 2.2 : 1);
    if (input.back) this.speed -= this.def.accel * 0.9 * dt;
    if (!input.forward && !input.back) this.speed -= Math.sign(this.speed) * 8 * dt;
    if (input.handbrake) this.speed -= Math.sign(this.speed) * 26 * dt;
    if (Math.abs(this.speed) < 0.15 && !input.forward && !input.back) this.speed = 0;
    this.speed = Math.max(-top * 0.45, Math.min(top, this.speed));
    var steerTarget = 0;
    if (input.left) steerTarget = 1;
    if (input.right) steerTarget = -1;
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    var spd = this.speed;
    if (Math.abs(spd) > 0.3) {
      this.mesh.rotation.y += this.steer * this.def.grip * dt * Math.sign(spd) * Math.min(1, Math.abs(spd) / 8);
    }
    var a = this.mesh.rotation.y;
    var nx = this.mesh.position.x + Math.sin(a) * spd * dt;
    var nz = this.mesh.position.z + Math.cos(a) * spd * dt;
    var fixed = world.collide(nx, nz, 2.2);
    if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) {
      this.speed *= 0.4; // bumped a wall
      if (Math.abs(this.speed) > 12) this.health -= 2;
    }
    this.mesh.position.x = fixed.x;
    this.mesh.position.z = fixed.z;
    // wheel spin
    var spin = spd * dt * 2.2;
    this.mesh.userData.wheels.forEach(function (w) { w.rotation.x += spin; });
  };

  // ---- Traffic ----
  function TrafficManager(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.rnd = CB.RNG(CB.SEED + 5);
  }

  TrafficManager.prototype.spawn = function (n) {
    var types = ['sedan', 'sedan', 'taxi', 'coupe', 'truck', 'van'];
    for (var i = 0; i < n; i++) this.addCar(types[(this.rnd() * types.length) | 0]);
  };

  TrafficManager.prototype.addCar = function (type) {
    var alongX = this.rnd() < 0.5;
    var street = -600 + Math.floor(this.rnd() * 11) * 120;
    var lane = this.rnd() < 0.5 ? -4.5 : 4.5;
    var along = -560 + this.rnd() * 1120;
    var x = alongX ? along : street + lane;
    var z = alongX ? street + lane : along;
    var angle = alongX ? (lane < 0 ? Math.PI / 2 : -Math.PI / 2) : (lane < 0 ? 0 : Math.PI);
    var v = new Vehicle(type, x, z, angle, this.scene);
    v.ai = 'traffic';
    v.speed = 8 + this.rnd() * 7;
    v._dir = alongX ? 'x' : 'z';
    v._lane = lane;
    v._street = street;
    this.cars.push(v);
    return v;
  };

  TrafficManager.prototype.update = function (dt, playerPos) {
    var self = this;
    this.cars.forEach(function (v) {
      var a = v.mesh.rotation.y;
      var nx = v.mesh.position.x + Math.sin(a) * v.speed * dt;
      var nz = v.mesh.position.z + Math.cos(a) * v.speed * dt;
      // turn at intersections sometimes
      var nearInt = Math.abs(((v.mesh.position.x % 120) + 120) % 120) < 6 && Math.abs(((v.mesh.position.z % 120) + 120) % 120) < 6;
      if (nearInt && self.rnd() < dt * 0.25) {
        v.mesh.rotation.y += (self.rnd() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      // keep inside city; respawn at opposite edge
      if (nx < -590 || nx > 590 || nz < -590 || nz > 590) {
        v.mesh.position.x = -Math.sign(nx) * 560;
        v.mesh.position.z = -Math.sign(nz) * 560;
        return;
      }
      // slow down if a car is right ahead
      var slow = false;
      self.cars.forEach(function (o) {
        if (o === v) return;
        var dx = o.mesh.position.x - v.mesh.position.x, dz = o.mesh.position.z - v.mesh.position.z;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d < 9) {
          var fwd = Math.sin(a) * dx + Math.cos(a) * dz;
          if (fwd > 0) slow = true;
        }
      });
      if (playerPos) {
        var pdx = playerPos.x - v.mesh.position.x, pdz = playerPos.z - v.mesh.position.z;
        if (pdx * pdx + pdz * pdz < 64) slow = true;
      }
      var target = slow ? 0 : 8 + (v._baseSpeed || 10);
      v.speed += (target - v.speed) * Math.min(1, dt * 2);
      v.mesh.position.x = nx;
      v.mesh.position.z = nz;
      var spin = v.speed * dt * 2.2;
      v.mesh.userData.wheels.forEach(function (w) { w.rotation.x += spin; });
    });
  };

  TrafficManager.prototype.nearestCar = function (x, z, maxD) {
    var best = null, bestD = maxD;
    this.cars.forEach(function (v) {
      var dx = v.mesh.position.x - x, dz = v.mesh.position.z - z;
      var d = Math.sqrt(dx * dx + dz * dz);
      if (d < bestD) { bestD = d; best = v; }
    });
    return best;
  };

  TrafficManager.prototype.removeCar = function (v) {
    var i = this.cars.indexOf(v);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(v.mesh);
  };

  // ---- Police ----
  function PoliceManager(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.roadblocks = [];
    this.heli = null;
    this._spawnT = 0;
    this._blockT = 0;
    this.rnd = CB.RNG(CB.SEED + 9);
  }

  PoliceManager.prototype.wantedCount = function (wanted) {
    return wanted <= 0 ? 0 : wanted === 1 ? 1 : wanted === 2 ? 2 : wanted === 3 ? 3 : 4;
  };

  PoliceManager.prototype.update = function (dt, wanted, playerPos, playerInCar, audio) {
    var want = this.wantedCount(wanted);
    this._spawnT -= dt;
    if (this.cars.length < want && this._spawnT <= 0 && playerPos) {
      this._spawnT = 2.5;
      var a = this.rnd() * Math.PI * 2;
      var x = playerPos.x + Math.sin(a) * 120, z = playerPos.z + Math.cos(a) * 120;
      x = Math.max(-580, Math.min(580, x));
      z = Math.max(-580, Math.min(580, z));
      var v = new Vehicle('police', x, z, a, this.scene);
      v.ai = 'police';
      this.cars.push(v);
    }
    // chase
    var self = this;
    this.cars.forEach(function (v) {
      if (!playerPos) return;
      var dx = playerPos.x - v.mesh.position.x, dz = playerPos.z - v.mesh.position.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      var wantAngle = Math.atan2(dx, dz);
      var diff = wantAngle - v.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.mesh.rotation.y += Math.max(-1, Math.min(1, diff * 2.2)) * dt * 2.4;
      var target = d > 6 ? v.topSpeed() * 0.95 : v.topSpeed() * 0.4;
      v.speed += (target - v.speed) * Math.min(1, dt * 1.5);
      var a2 = v.mesh.rotation.y;
      var nx = v.mesh.position.x + Math.sin(a2) * v.speed * dt;
      var nz = v.mesh.position.z + Math.cos(a2) * v.speed * dt;
      var fixed = self.world.collide(nx, nz, 2.2);
      if (Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01) v.speed *= 0.3;
      v.mesh.position.x = fixed.x; v.mesh.position.z = fixed.z;
      var spin = v.speed * dt * 2.2;
      v.mesh.userData.wheels.forEach(function (w) { w.rotation.x += spin; });
      // lightbar flash
      if (v.mesh.userData.lightbar) {
        v.mesh.userData.lightbar.material.color.setHex(Math.floor(performance.now() / 300) % 2 ? 0xff2a2a : 0x2a6aff);
      }
      // ram damage to player car handled by main via proximity
      if (d > 220) { // too far: despawn
        v._far = (v._far || 0) + dt;
        if (v._far > 4) { self.scene.remove(v.mesh); self.cars.splice(self.cars.indexOf(v), 1); }
      } else v._far = 0;
    });
    // clear police when wanted drops to 0
    if (wanted === 0) {
      this.cars.forEach(function (v) { self.scene.remove(v.mesh); });
      this.cars = [];
      this.clearRoadblocks();
      this.removeHeli();
    }
    // roadblocks at 3+ stars
    this._blockT -= dt;
    if (wanted >= 3 && this._blockT <= 0 && playerPos) {
      this._blockT = 14;
      this.spawnRoadblock(playerPos);
    }
    // helicopter at 4+ stars
    if (wanted >= 4 && !this.heli) this.spawnHeli();
    if (wanted < 4 && this.heli) this.removeHeli();
    if (this.heli && playerPos) {
      var t = performance.now() / 1000;
      this.heli.position.set(playerPos.x + Math.sin(t * 0.5) * 26, 55 + Math.sin(t * 0.8) * 3, playerPos.z + Math.cos(t * 0.5) * 26);
      this.heli.rotation.y = Math.atan2(playerPos.x - this.heli.position.x, playerPos.z - this.heli.position.z);
      this.heli.children[1].rotation.y = t * 18; // rotor
    }
    if (audio) audio.setSiren(wanted > 0 && this.cars.length > 0);
  };

  PoliceManager.prototype.spawnRoadblock = function (playerPos) {
    var self = this;
    this.clearRoadblocks();
    var a = this.rnd() * Math.PI * 2;
    var cx = playerPos.x + Math.sin(a) * 55, cz = playerPos.z + Math.cos(a) * 55;
    for (var i = -1; i <= 1; i++) {
      var v = new Vehicle('police', cx + Math.cos(a) * i * 5, cz - Math.sin(a) * i * 5, a + Math.PI / 2, this.scene);
      v.ai = 'block';
      this.roadblocks.push(v);
      this.world.addCollider(v.mesh.position.x, v.mesh.position.z, 2.4, 2.4);
    }
  };

  PoliceManager.prototype.clearRoadblocks = function () {
    var self = this;
    this.roadblocks.forEach(function (v) { self.scene.remove(v.mesh); });
    this.roadblocks = [];
  };

  PoliceManager.prototype.spawnHeli = function () {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshPhongMaterial({ color: 0x1c2f4a, shininess: 40 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 6), bodyMat);
    g.add(body);
    var rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.1;
    g.add(rotor);
    var tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 4), bodyMat);
    tail.position.set(0, 0.3, -4.5);
    g.add(tail);
    var spot = new THREE.Mesh(new THREE.ConeGeometry(4, 22, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    spot.position.y = -12;
    g.add(spot);
    var lamp = new THREE.PointLight(0xfff2b0, 1.0, 60);
    lamp.position.y = -2;
    g.add(lamp);
    this.heli = g;
    this.scene.add(g);
  };

  PoliceManager.prototype.removeHeli = function () {
    if (this.heli) { this.scene.remove(this.heli); this.heli = null; }
  };

  CB.carMesh = carMesh;
  CB.Vehicle = Vehicle;
  CB.TrafficManager = TrafficManager;
  CB.PoliceManager = PoliceManager;
})();
