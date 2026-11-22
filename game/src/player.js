// Coral Bay — Rae Delgado on foot: movement, camera-relative controls, the
// weapon set, shooting, and the enemy gunmen used by combat missions.
(function () {
  'use strict';
  var CB = window.CB;

  function buildHumanoid(shirt, pants, skin) {
    var g = new THREE.Group();
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.0, 0.45), shirtMat);
    torso.position.y = 1.25;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 2.0;
    g.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.56), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    cap.position.y = 2.28;
    g.add(cap);
    var armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, 0.22), shirtMat);
    armL.position.set(-0.55, 1.3, 0);
    g.add(armL);
    var armR = armL.clone();
    armR.position.x = 0.55;
    g.add(armR);
    var legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), pantsMat);
    legL.position.set(-0.22, 0.45, 0);
    g.add(legL);
    var legR = legL.clone();
    legR.position.x = 0.22;
    g.add(legR);
    g.userData.armL = armL; g.userData.armR = armR;
    g.userData.legL = legL; g.userData.legR = legR;
    return g;
  }

  function Player(scene, world) {
    this.scene = scene;
    this.world = world;
    // Rae Delgado: teal jacket, dark jeans.
    this.mesh = buildHumanoid(0x2a9d8f, 0x2a2f3a, 0xc98a5e);
    this.mesh.position.set(-60, 0, -40);
    scene.add(this.mesh);
    this.pos = this.mesh.position;
    this.yaw = 0;          // facing
    this.camYaw = 0; this.camPitch = 0.32;
    this.camDist = 7;
    this.health = 100;
    this.armor = 0;
    this.money = 0;
    this.weaponIndex = 0;
    this.ammo = [Infinity, 48, 120, 0];
    this.hasShotgun = false;
    this.inCar = null;
    this.speed = 0;
    this.vy = 0;
    this.onGround = true;
    this._shootT = 0;
    this._walkPhase = 0;
    this._hurtT = 0;
    this.alive = true;
  }

  Player.prototype.weapon = function () { return CB.WEAPONS[this.weaponIndex]; };

  Player.prototype.selectWeapon = function (i) {
    if (i === 3 && !this.hasShotgun) return false;
    this.weaponIndex = i;
    return true;
  };

  Player.prototype.moveSpeed = function () { return 7.5; };

  Player.prototype.updateOnFoot = function (dt, input) {
    if (!this.alive) return;
    this._shootT -= dt;
    this._hurtT -= dt;
    var sprint = input.sprint ? 1.55 : 1;
    var fwd = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    var strafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var len = Math.sqrt(fwd * fwd + strafe * strafe) || 1;
    fwd /= len; strafe /= len;
    // camera-relative movement
    var cy = this.camYaw;
    var mx = (Math.sin(cy) * -fwd + Math.cos(cy) * strafe);
    var mz = (Math.cos(cy) * -fwd + -Math.sin(cy) * strafe);
    var spd = this.moveSpeed() * sprint;
    var nx = this.pos.x + mx * spd * dt * (fwd || strafe ? 1 : 0);
    var nz = this.pos.z + mz * spd * dt * (fwd || strafe ? 1 : 0);
    var fixed = this.world.collide(nx, nz, 0.6);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    if (fwd || strafe) {
      this.yaw = Math.atan2(mx, mz);
      this._walkPhase += dt * spd * 1.6;
    }
    // jump / gravity
    if (input.jump && this.onGround) { this.vy = 7; this.onGround = false; }
    this.vy -= 22 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.onGround = true; }
    this.mesh.rotation.y = this.yaw;
    // walk animation
    var sw = (fwd || strafe) ? Math.sin(this._walkPhase) * 0.6 : 0;
    this.mesh.userData.legL.rotation.x = sw;
    this.mesh.userData.legR.rotation.x = -sw;
    this.mesh.userData.armL.rotation.x = -sw * 0.7;
    this.mesh.userData.armR.rotation.x = sw * 0.7;
    // aim arms forward when armed
    if (this.weaponIndex > 0) {
      this.mesh.userData.armR.rotation.x = -1.3;
      this.mesh.userData.armL.rotation.x = -1.1;
    }
  };

  Player.prototype.takeDamage = function (amount) {
    if (!this.alive) return;
    var absorbed = Math.min(this.armor, amount * 0.6);
    this.armor -= absorbed;
    this.health -= (amount - absorbed);
    this._hurtT = 0.4;
    if (this.health <= 0) { this.health = 0; this.alive = false; }
  };

  Player.prototype.heal = function (amount) {
    this.health = Math.min(100, this.health + amount);
  };

  // Shoot toward the camera aim point. Returns true if a shot was fired.
  Player.prototype.shoot = function (enemies, audio, onHit) {
    if (!this.alive || this.inCar) return false;
    if (this._shootT > 0) return false;
    var w = this.weapon();
    if (w.id !== 'fists' && this.ammo[this.weaponIndex] <= 0) {
      this._shootT = 0.3;
      return false; // click — empty
    }
    this._shootT = w.rate;
    if (w.id !== 'fists') this.ammo[this.weaponIndex]--;
    if (audio) audio.shoot(w.id);
    // aim: from camera through screen centre
    var origin = this.pos.clone(); origin.y += 1.6;
    var dir = new THREE.Vector3();
    // forward from camera yaw/pitch
    dir.set(-Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), -Math.cos(this.camYaw) * Math.cos(this.camPitch));
    dir.normalize();
    var pellets = w.pellets || 1;
    for (var p = 0; p < pellets; p++) {
      var d = dir.clone();
      d.x += (Math.random() - 0.5) * w.spread * 2;
      d.y += (Math.random() - 0.5) * w.spread * 2;
      d.z += (Math.random() - 0.5) * w.spread * 2;
      d.normalize();
      if (w.id === 'fists') {
        // melee: hit the nearest enemy in front within range
        var best = null, bestD = w.range;
        enemies.forEach(function (e) {
          if (e.dead) return;
          var dx = e.mesh.position.x - origin.x, dz = e.mesh.position.z - origin.z;
          var dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < bestD) {
            var dot = (dx * d.x + dz * d.z) / (dist || 1);
            if (dot > 0.5) { best = e; bestD = dist; }
          }
        });
        if (best) onHit(best, w.damage);
        continue;
      }
      // hitscan against enemies
      var hit = null, hitD = w.range;
      enemies.forEach(function (e) {
        if (e.dead) return;
        var to = new THREE.Vector3(e.mesh.position.x - origin.x, (e.mesh.position.y + 1.2) - origin.y, e.mesh.position.z - origin.z);
        var along = to.dot(d);
        if (along < 0 || along > hitD) return;
        var perp = to.clone().addScaledVector(d, -along).length();
        if (perp < 1.1) { hit = e; hitD = along; }
      });
      if (hit) onHit(hit, w.damage);
      if (this._tracer) this._tracer(origin, d, Math.min(hitD, w.range));
    }
    return true;
  };

  // ---- Enemies ----
  function Enemy(scene, x, z, boss) {
    this.scene = scene;
    this.mesh = buildHumanoid(boss ? 0x8a1f2d : 0x5a3a6a, 0x333333, 0xb98a62);
    this.mesh.position.set(x, 0, z);
    if (boss) this.mesh.scale.set(1.15, 1.15, 1.15);
    scene.add(this.mesh);
    this.health = boss ? 220 : 80;
    this.boss = !!boss;
    this.dead = false;
    this._shootT = 1 + Math.random();
    this._moveT = 0;
    this._strafeDir = Math.random() < 0.5 ? 1 : -1;
    this._flashT = 0;
  }

  Enemy.prototype.update = function (dt, playerPos, player, audio, onPlayerHit) {
    if (this.dead) return;
    this._shootT -= dt;
    this._moveT -= dt;
    this._flashT -= dt;
    var dx = playerPos.x - this.mesh.position.x, dz = playerPos.z - this.mesh.position.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var want = 14;
    if (d > want + 6) { // advance
      this.mesh.position.x += (dx / d) * 4.5 * dt;
      this.mesh.position.z += (dz / d) * 4.5 * dt;
    } else if (d < want - 6) { // back off
      this.mesh.position.x -= (dx / d) * 3 * dt;
      this.mesh.position.z -= (dz / d) * 3 * dt;
    } else if (this._moveT <= 0) { // strafe
      this._moveT = 1.2 + Math.random();
      this._strafeDir *= -1;
    }
    if (this._moveT > 0) {
      this.mesh.position.x += (-dz / (d || 1)) * this._strafeDir * 2.5 * dt;
      this.mesh.position.z += (dx / (d || 1)) * this._strafeDir * 2.5 * dt;
    }
    this.mesh.rotation.y = Math.atan2(dx, dz);
    // walk anim
    var sw = Math.sin(performance.now() / 130) * 0.5;
    this.mesh.userData.legL.rotation.x = sw;
    this.mesh.userData.legR.rotation.x = -sw;
    this.mesh.userData.armR.rotation.x = -1.3;
    // shoot at the player
    if (d < 55 && this._shootT <= 0 && player.alive) {
      this._shootT = this.boss ? 0.9 : 1.4 + Math.random() * 0.8;
      if (audio) audio.enemyShoot();
      var hitChance = d < 18 ? 0.42 : d < 35 ? 0.25 : 0.12;
      if (Math.random() < hitChance) onPlayerHit(this.boss ? 14 : 9);
    }
  };

  Enemy.prototype.damage = function (amount) {
    this.health -= amount;
    this._flashT = 0.12;
    if (this.health <= 0) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2; // fall over
      this.mesh.position.y = 0.4;
    }
  };

  Enemy.prototype.remove = function () { this.scene.remove(this.mesh); };

  CB.Player = Player;
  CB.Enemy = Enemy;
  CB.buildHumanoid = buildHumanoid;
})();
