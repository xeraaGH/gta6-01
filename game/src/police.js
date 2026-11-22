// Coral Bay — the law.
// One job: the wanted level, police cars and officers that chase you,
// and what happens when they catch you.

class PoliceOfficer {
  constructor(scene, world, x, z) {
    this.world = world;
    this.mesh = makePedMesh(0x1a2a4a);   // dark blue uniform
    // A cap brim so officers read as police, not pedestrians.
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
    brim.position.set(0, 1.95, 0.2);
    this.mesh.add(brim);
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = 0;
    this.health = 100;
    this.walkPhase = rand(0, 6);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, target) {
    if (this.health <= 0) return;   // knocked down; the world leaves them be
    const d = dist2D(this.pos.x, this.pos.z, target.x, target.z);
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this.heading = angleLerp(this.heading, want, Math.min(1, dt * 6));
    if (d > 1.2) {
      const sp = CONFIG.POLICE_OFFICER_SPEED;
      this.pos.x += Math.sin(this.heading) * sp * dt;
      this.pos.z += Math.cos(this.heading) * sp * dt;
    }
    const fixed = this.world.resolveCollision(this.pos.x, this.pos.z, 0.4);
    this.pos.x = fixed[0]; this.pos.z = fixed[1];
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.walkPhase += dt * 8;
    const swing = Math.sin(this.walkPhase) * 0.55;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
  }
}

class Police {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.stars = 0;
    this.heatTimer = 0;        // seconds since the last crime
    this.bustTimer = 0;        // seconds held by police
    this.cars = [];            // police cars on the hunt
    this.officers = [];        // foot officers on the hunt
    this.seenTimer = 0;        // seconds since police last saw the player
    this.flash = 0;            // light-bar flash phase
  }

  wanted() { return this.stars; }

  addStars(n, reason) {
    const before = this.stars;
    this.stars = clamp(this.stars + n, 0, CONFIG.WANTED_MAX);
    this.heatTimer = 0;
    if (this.stars > before) this.audio.siren(this.stars > 0);
    return this.stars;
  }

  setStars(n) {
    this.stars = clamp(n, 0, CONFIG.WANTED_MAX);
    this.heatTimer = 0;
    this.audio.siren(this.stars > 0);
  }

  // How many units the current heat fields.
  desiredUnits() {
    return {
      cars: this.stars >= 1 ? Math.min(this.stars, 3) : 0,
      officers: this.stars >= 2 ? Math.min(this.stars - 1, 3) : 0,
    };
  }

  spawnCarNear(x, z) {
    const mesh = makeCarMesh(0xffffff, { police: true });
    // Black-and-white cruiser paint: dark doors on a white body.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 2.4),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    door.position.set(0, 0.65, -0.2);
    mesh.add(door);
    this.scene.add(mesh);
    const a = rand(0, Math.PI * 2);
    const car = new Car(this.world, mesh, x + Math.sin(a) * 30, z + Math.cos(a) * 30, rand(0, Math.PI * 2), 'police');
    this.cars.push(car);
    return car;
  }

  spawnOfficerNear(x, z) {
    const a = rand(0, Math.PI * 2);
    const o = new PoliceOfficer(this.scene, this.world, x + Math.sin(a) * 12, z + Math.cos(a) * 12);
    this.officers.push(o);
    return o;
  }

  // dt, player position, player car (or null), and a callback for "busted".
  update(dt, player, onBusted) {
    this.flash += dt;
    const target = player.inCar ? player.inCar.pos : player.pos;

    if (this.stars === 0) {
      // Heat is off: send units home and stop the siren.
      for (const c of this.cars) this.scene.remove(c.mesh);
      for (const o of this.officers) this.scene.remove(o.mesh);
      this.cars = []; this.officers = [];
      this.audio.siren(false);
      this.bustTimer = 0;
      return;
    }

    this.heatTimer += dt;
    // One star fades after a clean stretch with no police close by.
    const nearest = this.nearestUnitDistance(target);
    if (nearest > 45 && this.heatTimer > CONFIG.WANTED_DECAY_SECONDS) {
      this.stars -= 1;
      this.heatTimer = 0;
      this.audio.siren(this.stars > 0);
    }

    // Field the right number of units for the heat.
    const want = this.desiredUnits();
    while (this.cars.length < want.cars) this.spawnCarNear(target.x, target.z);
    while (this.cars.length > want.cars) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    while (this.officers.length < want.officers) this.spawnOfficerNear(target.x, target.z);
    while (this.officers.length > want.officers) {
      const o = this.officers.pop();
      this.scene.remove(o.mesh);
    }

    // Police cars chase: steer toward the player, ram to stop them.
    for (const car of this.cars) {
      const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = clamp(dh * 1.5, -1, 1);
      const speed = Math.min(CONFIG.POLICE_CAR_SPEED, 12 + this.stars * 3);
      car.speed = lerp(car.speed, speed, Math.min(1, dt * 1.5));
      car.heading = angleLerp(car.heading, car.heading + steer * 0.12, 1);
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      let nx = car.pos.x + fx * car.speed * dt;
      let nz = car.pos.z + fz * car.speed * dt;
      if (!this.world.hitsBuilding(nx, nz, 1.4)) { car.pos.x = nx; car.pos.z = nz; }
      else car.speed *= 0.4;
      car.mesh.position.copy(car.pos);
      car.mesh.rotation.y = car.heading;
      // Flash the light bar.
      if (car.mesh.userData.lightBar) {
        car.mesh.userData.lightBar.material.color.setHex(Math.floor(this.flash * 4) % 2 ? 0xff2222 : 0x2244ff);
      }
      // Ram: touching the player's car slows it and hurts on foot.
      const d = dist2D(car.pos.x, car.pos.z, target.x, target.z);
      if (d < 3.2) {
        if (player.inCar) player.inCar.speed *= 0.9;
        this.bustTimer += dt;
      }
    }

    // Officers chase on foot and grab the player.
    for (const o of this.officers) {
      o.update(dt, target);
      const d = dist2D(o.pos.x, o.pos.z, target.x, target.z);
      if (d < 1.6 && !player.inCar) this.bustTimer += dt;
    }
    if (this.nearestUnitDistance(target) > 4) this.bustTimer = Math.max(0, this.bustTimer - dt * 2);

    if (this.bustTimer >= CONFIG.BUST_SECONDS) {
      this.bustTimer = 0;
      this.audio.busted();
      onBusted();
    }
  }

  nearestUnitDistance(target) {
    let best = Infinity;
    for (const c of this.cars) best = Math.min(best, dist2D(c.pos.x, c.pos.z, target.x, target.z));
    for (const o of this.officers) best = Math.min(best, dist2D(o.pos.x, o.pos.z, target.x, target.z));
    return best;
  }

  clearHeat() {
    this.stars = 0;
    this.heatTimer = 0;
    this.bustTimer = 0;
    this.audio.siren(false);
  }
}
