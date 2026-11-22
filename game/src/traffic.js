// Coral Bay — the people and the traffic around you.
// One job: pedestrians who walk the sidewalks and flee trouble, and the
// traffic manager that keeps the streets full of cars.

function makePedMesh(shirtColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 8), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.75;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), pants);
  legL.position.set(-0.14, 0.3, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(legR);
  g.userData.legL = legL; g.userData.legR = legR;
  return g;
}

class Pedestrian {
  constructor(world, x, z) {
    this.world = world;
    this.mesh = makePedMesh(randPick([0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xe67e22]));
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = rand(0, Math.PI * 2);
    this.speed = rand(1.2, 2.2);
    this.fleeing = false;
    this.fleeTimer = 0;
    this.walkPhase = rand(0, 6);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.pickSidewalkTarget();
  }

  pickSidewalkTarget() {
    const block = randPick([-84, -28, 28, 84]);
    const block2 = randPick([-84, -28, 28, 84]);
    // Walk along a sidewalk edge of a random block.
    const edge = Math.floor(rand(0, 4));
    const half = CONFIG.BLOCK / 2 + 2;
    if (edge === 0) this.target = new THREE.Vector3(block - half, 0, block2 + rand(-half, half));
    else if (edge === 1) this.target = new THREE.Vector3(block + half, 0, block2 + rand(-half, half));
    else if (edge === 2) this.target = new THREE.Vector3(block + rand(-half, half), 0, block2 - half);
    else this.target = new THREE.Vector3(block + rand(-half, half), 0, block2 + half);
  }

  // from: what the ped is running from (a car or the player). dt seconds.
  update(dt, from, fromRadius) {
    const dFrom = from ? dist2D(this.pos.x, this.pos.z, from.x, from.z) : 999;
    if (from && dFrom < fromRadius) { this.fleeing = true; this.fleeTimer = 3; }
    if (this.fleeTimer > 0) this.fleeTimer -= dt;
    else this.fleeing = false;

    let tx, tz, speed;
    if (this.fleeing && from) {
      // Run directly away from the danger.
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      tx = this.pos.x + (dx / len) * 10;
      tz = this.pos.z + (dz / len) * 10;
      speed = 5;
    } else {
      tx = this.target.x; tz = this.target.z;
      speed = this.speed;
      if (dist2D(this.pos.x, this.pos.z, tx, tz) < 1.5) this.pickSidewalkTarget();
    }
    const want = Math.atan2(tx - this.pos.x, tz - this.pos.z);
    this.heading = angleLerp(this.heading, want, Math.min(1, dt * 6));
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    const fixed = this.world.resolveCollision(this.pos.x, this.pos.z, 0.4);
    this.pos.x = fixed[0]; this.pos.z = fixed[1];
    this.pos.x = clamp(this.pos.x, -148, 148);
    this.pos.z = clamp(this.pos.z, -148, 175);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Little leg swing while walking.
    this.walkPhase += dt * speed * 3;
    const swing = Math.sin(this.walkPhase) * 0.5;
    this.mesh.userData.legL.rotation.x = swing;
    this.mesh.userData.legR.rotation.x = -swing;
  }
}

class TrafficManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];        // traffic cars (driving)
    this.parked = [];      // parked cars (can be stolen)
    this.peds = [];
    this.goldCar = null;   // the mission-7 prize car
    this.spawnParked();
    this.spawnTraffic();
    this.spawnPeds();
  }

  spawnParked() {
    // Parked cars along street edges, facing along the road.
    const spots = [];
    for (const at of CONFIG.STREETS) {
      for (const along of [-84, -28, 28, 84]) {
        spots.push({ x: at + 5, z: along, heading: 0 });
        spots.push({ x: at - 5, z: along, heading: Math.PI });
        spots.push({ x: along, z: at + 5, heading: Math.PI / 2 });
        spots.push({ x: along, z: at - 5, heading: -Math.PI / 2 });
      }
    }
    for (const s of spots) {
      if (Math.random() < 0.45) continue;   // not every spot is taken
      const mesh = makeCarMesh(randPick(CONFIG.CAR_PALETTE));
      this.scene.add(mesh);
      const car = new Car(this.world, mesh, s.x, s.z, s.heading, 'parked');
      this.parked.push(car);
    }
    // The gold prize car by the Coral Bank plaza.
    const gold = makeCarMesh(0xffd700, { gold: true });
    this.scene.add(gold);
    this.goldCar = new Car(this.world, gold, this.world.goldCarSpot.x, this.world.goldCarSpot.z, Math.PI / 4, 'parked');
    this.parked.push(this.goldCar);
  }

  spawnTraffic() {
    for (let i = 0; i < 10; i++) {
      const mesh = makeCarMesh(randPick(CONFIG.CAR_PALETTE));
      this.scene.add(mesh);
      const car = new Car(this.world, mesh, 0, 0, 0, 'traffic');
      car.joinTraffic();
      this.cars.push(car);
    }
  }

  spawnPeds() {
    for (let i = 0; i < 16; i++) {
      const bx = randPick([-84, -28, 28, 84]);
      const bz = randPick([-84, -28, 28, 84]);
      const ped = new Pedestrian(this.world, bx + rand(-20, 20), bz + rand(-20, 20));
      this.scene.add(ped.mesh);
      this.peds.push(ped);
    }
  }

  // Nearest parked car to a point, within maxDist.
  nearestParked(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.parked) {
      const d = dist2D(x, z, c.pos.x, c.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  update(dt, playerPos, playerCar) {
    // Traffic cars drive their lanes.
    const all = this.cars.concat(playerCar ? [playerCar] : []);
    for (const c of this.cars) c.updateTraffic(dt, all);
    // Pedestrians flee cars and the player when wanted or speeding.
    const threat = playerCar || null;
    for (const p of this.peds) {
      const from = threat ? { x: threat.pos.x, z: threat.pos.z } : { x: playerPos.x, z: playerPos.z };
      const radius = threat ? 8 : 4;
      p.update(dt, from, radius);
    }
  }
}
