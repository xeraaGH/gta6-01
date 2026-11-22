// Coral Bay — cars: how they look and how they drive.
// One job: build car meshes and run arcade driving physics for the player,
// traffic cars and police cars alike.

function makeCarMesh(color, opts) {
  opts = opts || {};
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2733 });
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2);
  group.add(cabin);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.6), bodyMat);
  nose.position.set(0, 0.55, 2.3);
  group.add(nose);
  // Headlights and taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    h.position.set(x, 0.7, 2.62);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat);
    t.position.set(x, 0.7, -2.22);
    group.add(t);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    group.add(w);
    wheels.push(w);
  }
  if (opts.police) {
    // Light bar on the roof.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.75, -0.2);
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.75, 1.75, -0.2);
    group.add(bar2);
    group.userData.lightBar = bar;
  }
  if (opts.gold) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.12, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffd700 }));
    trim.position.y = 1.05;
    group.add(trim);
  }
  group.userData.wheels = wheels;
  group.traverse((o) => { o.castShadow = false; });
  return group;
}

class Car {
  // kind: 'player' | 'traffic' | 'police' | 'parked'
  constructor(world, mesh, x, z, heading, kind) {
    this.world = world;
    this.mesh = mesh;
    this.kind = kind || 'traffic';
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Traffic AI: which street it drives on and which way.
    this.lane = null;
    this.laneDir = 1;
    this.cruise = rand(8, 13);
    this.stopped = 0;
  }

  // Put this car on a street lane and start driving along it.
  joinTraffic() {
    const p = this.world.randomRoadPoint();
    this.pos.set(p.x, 0, p.z);
    this.lane = { axis: p.axis, at: p.axis === 'x' ? p.x : p.z };
    this.laneDir = p.dir;
    this.heading = p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
                                  : (p.dir > 0 ? 0 : Math.PI);
    this.speed = this.cruise;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }

  // Arcade driving: throttle -1..1, steer -1..1.
  drive(dt, throttle, steerInput) {
    const C = CONFIG;
    this.steer = lerp(this.steer, steerInput, Math.min(1, dt * 8));
    if (throttle > 0) this.speed += C.CAR_ACCEL * throttle * dt;
    else if (throttle < 0) {
      this.speed += (this.speed > 0.5 ? -C.CAR_BRAKE : C.CAR_ACCEL * 0.6) * dt;
    }
    this.speed -= this.speed * C.CAR_DRAG * dt;
    this.speed = clamp(this.speed, -C.CAR_REVERSE_MAX, C.CAR_MAX_SPEED);
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const turn = this.steer * C.CAR_STEER * dt * clamp(Math.abs(this.speed) / 8, 0, 1) * Math.sign(this.speed || 1);
    this.heading += turn;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let nx = this.pos.x + fx * this.speed * dt;
    let nz = this.pos.z + fz * this.speed * dt;
    // Buildings stop cars; the beach and ocean stop them too.
    if (this.world.hitsBuilding(nx, nz, 1.4)) {
      const hit = this.world.hitsBuilding(this.pos.x + fx * this.speed * dt, this.pos.z, 1.4)
        || this.world.hitsBuilding(this.pos.x, this.pos.z + fz * this.speed * dt, 1.4);
      if (hit) this.speed *= -0.25;
      nx = this.pos.x; nz = this.pos.z;
    }
    nx = clamp(nx, -150, 150);
    nz = clamp(nz, -150, 205);
    this.pos.set(nx, 0, nz);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Lean the body into turns and spin the wheels.
    this.mesh.rotation.z = -this.steer * 0.05 * clamp(this.speed / 10, -1, 1);
    const spin = (this.speed * dt) / 0.42;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }

  // Traffic AI: cruise along its lane, slow for the car ahead, turn at the edge.
  updateTraffic(dt, carsAhead) {
    if (this.stopped > 0) { this.stopped -= dt; this.speed = lerp(this.speed, 0, dt * 4); }
    else {
      let target = this.cruise;
      for (const o of carsAhead) {
        if (o === this) continue;
        const d = dist2D(this.pos.x, this.pos.z, o.pos.x, o.pos.z);
        if (d < 9) {
          // Only brake for a car roughly in front of us.
          const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
          const dot = (o.pos.x - this.pos.x) * fx + (o.pos.z - this.pos.z) * fz;
          if (dot > 0) target = Math.min(target, 0);
        }
      }
      this.speed = lerp(this.speed, target, Math.min(1, dt * 2));
    }
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    // At the city edge, pick a new perpendicular street.
    const edge = this.lane.axis === 'x' ? this.pos.z : this.pos.x;
    if (Math.abs(edge) > 148) {
      const ns = this.world.nearestStreet(this.pos.x, this.pos.z);
      const cross = randPick(CONFIG.STREETS);
      if (ns.axis === 'x') {
        this.lane = { axis: 'z', at: cross };
        this.heading = this.pos.z > 0 ? Math.PI : 0;
      } else {
        this.lane = { axis: 'x', at: cross };
        this.heading = this.pos.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
      this.pos.x = clamp(this.pos.x, -145, 145);
      this.pos.z = clamp(this.pos.z, -145, 145);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
  }
}
