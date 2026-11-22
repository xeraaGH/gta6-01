// Coral Bay — you, on foot.
// One job: the player character, third-person movement, the follow camera,
// getting in and out of cars, and fighting.

function makePlayerMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e86c1 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x1f2d3d });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 1.0, 10), jacket);
  body.position.y = 1.15;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), skin);
  head.position.y = 1.9;
  g.add(head);
  // A cap, so Rook reads at a distance.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12),
    new THREE.MeshLambertMaterial({ color: 0xc0392b }));
  cap.position.y = 2.1;
  g.add(cap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), jeans);
  legL.position.set(-0.16, 0.35, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), jacket);
  armL.position.set(-0.48, 1.15, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  g.add(armR);
  g.userData.legL = legL; g.userData.legR = legR;
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

class Player {
  constructor(scene, world, audio) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.mesh = makePlayerMesh();
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(0, 0, 28);
    this.velY = 0;
    this.heading = Math.PI;      // facing the plaza
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 9;
    this.health = CONFIG.PLAYER_HEALTH;
    this.money = 0;
    this.inCar = null;           // the Car being driven, or null
    this.onGround = true;
    this.walkPhase = 0;
    this.attackCooldown = 0;
    this.hurtFlash = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Camera-relative movement: W runs away from the camera.
  update(dt, input, camera) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    if (this.inCar) {
      // Driving: the car does the moving; the camera chases the car.
      const car = this.inCar;
      const throttle = (input.up ? 1 : 0) + (input.down ? -1 : 0);
      const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      car.drive(dt, throttle, steer);
      this.pos.copy(car.pos);
      this.camYaw = angleLerp(this.camYaw, car.heading + Math.PI, Math.min(1, dt * 3));
      this.audio.engine(Math.abs(car.speed) / CONFIG.CAR_MAX_SPEED, true);
      this.updateCamera(dt, camera, car.pos);
      return;
    }
    this.audio.engine(0, false);

    // On foot.
    const sprint = input.sprint ? CONFIG.SPRINT_SPEED : CONFIG.WALK_SPEED;
    let mx = 0, mz = 0;
    if (input.up) { mx -= Math.sin(this.camYaw); mz -= Math.cos(this.camYaw); }
    if (input.down) { mx += Math.sin(this.camYaw); mz += Math.cos(this.camYaw); }
    if (input.left) { mx -= Math.cos(this.camYaw); mz += Math.sin(this.camYaw); }
    if (input.right) { mx += Math.cos(this.camYaw); mz -= Math.sin(this.camYaw); }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len; mz /= len;
      this.heading = angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 10));
      this.pos.x += mx * sprint * dt;
      this.pos.z += mz * sprint * dt;
      this.walkPhase += dt * sprint * 1.6;
    }
    // Jump and gravity.
    if (input.jump && this.onGround) { this.velY = CONFIG.JUMP_VELOCITY; this.onGround = false; }
    this.velY -= CONFIG.GRAVITY * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    const fixed = this.world.resolveCollision(this.pos.x, this.pos.z, 0.5);
    this.pos.x = fixed[0]; this.pos.z = fixed[1];
    this.pos.x = clamp(this.pos.x, -150, 150);
    this.pos.z = clamp(this.pos.z, -150, 205);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Walk-cycle limbs.
    const swing = len > 0 ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
    this.mesh.userData.armL.rotation.x = -swing * 0.7;
    this.mesh.userData.armR.rotation.x = swing * 0.7;
    this.updateCamera(dt, camera, this.pos);
  }

  updateCamera(dt, camera, focus) {
    // Orbit with the mouse (camYaw/camPitch are changed by mouse drag),
    // smoothed so the camera never snaps.
    const cx = focus.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cz = focus.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDist;
    const cy = focus.y + 2 + Math.sin(this.camPitch) * this.camDist;
    camera.position.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 8));
    camera.lookAt(focus.x, focus.y + 1.6, focus.z);
  }

  enterCar(car) {
    this.inCar = car;
    car.kind = 'player';
    this.mesh.visible = false;
    this.audio.pickup();
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    this.inCar = null;
    car.kind = 'parked';
    // Step out to the driver's side.
    const side = car.heading + Math.PI / 2;
    this.pos.set(car.pos.x + Math.sin(side) * 2.2, 0, car.pos.z + Math.cos(side) * 2.2);
    const fixed = this.world.resolveCollision(this.pos.x, this.pos.z, 0.5);
    this.pos.x = fixed[0]; this.pos.z = fixed[1];
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
  }

  // A punch: short range, hurts a pedestrian or a police officer nearby.
  // Returns the thing hit, or null.
  attack(peds, officers) {
    if (this.attackCooldown > 0 || this.inCar) return null;
    this.attackCooldown = 0.45;
    this.audio.punch();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const reach = 2.2;
    for (const p of peds) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) < reach && dx * fx + dz * fz > 0) {
        p.fleeing = true; p.fleeTimer = 4;
        return { type: 'ped', target: p };
      }
    }
    for (const o of officers) {
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) < reach && dx * fx + dz * fz > 0) {
        o.health -= 34;
        return { type: 'officer', target: o };
      }
    }
    return null;
  }

  hurt(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.4;
  }

  heal(amount) { this.health = Math.min(CONFIG.PLAYER_HEALTH, this.health + amount); }
  speed() { return this.inCar ? Math.abs(this.inCar.speed) : 0; }
}
