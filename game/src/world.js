// Coral Bay — the city itself.
// One job: build every static mesh of Coral Bay and expose the collision boxes,
// the road graph traffic drives on, and the named places missions use.

class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];   // {x, z, hx, hz} axis-aligned boxes the player/cars hit
    this.roads = [];       // {axis:'x'|'z', at, from, to} drivable lanes
    this.sidewalks = [];   // {x, z, w, d} rectangles pedestrians walk on
    this.buildings = [];
    this.palms = [];
    this.goldCarSpot = new THREE.Vector3(-28, 0, -84);
    this.build();
  }

  // A canvas texture of lit windows, so buildings read as a city, not grey boxes.
  makeWindowTexture(base, litRatio) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 248; y += 18) {
      for (let x = 8; x < 120; x += 16) {
        const lit = Math.random() < litRatio;
        g.fillStyle = lit ? '#ffe9a8' : '#2c3a48';
        g.fillRect(x, y, 10, 12);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  addCollider(x, z, hx, hz) { this.colliders.push({ x, z, hx, hz }); }

  // True when the circle at (x,z) with radius r overlaps any building box.
  hitsBuilding(x, z, r) {
    for (const b of this.colliders) {
      if (Math.abs(x - b.x) < b.hx + r && Math.abs(z - b.z) < b.hz + r) return true;
    }
    return false;
  }

  // Push a circle out of buildings: returns corrected [x, z].
  resolveCollision(x, z, r) {
    for (const b of this.colliders) {
      const dx = x - b.x, dz = z - b.z;
      const ox = b.hx + r - Math.abs(dx), oz = b.hz + r - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) x = b.x + Math.sign(dx || 1) * (b.hx + r);
        else z = b.z + Math.sign(dz || 1) * (b.hz + r);
      }
    }
    return [x, z];
  }

  build() {
    const S = this.scene;
    const C = CONFIG;

    // Ground: big grass/concrete slab under everything.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 700),
      new THREE.MeshLambertMaterial({ color: C.GROUND }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 40);
    S.add(ground);

    // Roads: dark strips along every street line, both directions.
    const roadMat = new THREE.MeshLambertMaterial({ color: C.ROAD_COLOR });
    const walkMat = new THREE.MeshLambertMaterial({ color: C.SIDEWALK });
    for (const at of C.STREETS) {
      for (const [w, d, x, z] of [
        [C.ROAD, 300, at, 10], [300, C.ROAD, 10, at],
      ]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(x, 0, z);
        S.add(road);
      }
      this.roads.push({ axis: 'x', at, from: -150, to: 150 });
      this.roads.push({ axis: 'z', at, from: -150, to: 150 });
      // Centre dashes.
      const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
      for (let t = -140; t < 150; t += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(at, 0.01, t);
        S.add(dash);
        const dash2 = dash.clone();
        dash2.rotation.z = Math.PI / 2;
        dash2.position.set(t, 0.01, at);
        S.add(dash2);
      }
    }

    // Sidewalks: lighter borders around each block. Blocks sit BETWEEN the
    // streets, so their centres are offset half a pitch from the street lines.
    for (let bx = -2; bx <= 1; bx++) {
      for (let bz = -2; bz <= 1; bz++) {
        const cx = bx * C.PITCH + C.PITCH / 2, cz = bz * C.PITCH + C.PITCH / 2;
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(C.BLOCK + 4, C.BLOCK + 4), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(cx, 0.005, cz);
        S.add(walk);
        this.sidewalks.push({ x: cx, z: cz, w: C.BLOCK + 4, d: C.BLOCK + 4 });
      }
    }

    // Buildings: 1-3 per block, varied heights, window textures, rooftop boxes.
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f66 });
    for (let bx = -2; bx <= 1; bx++) {
      for (let bz = -2; bz <= 1; bz++) {
        const cx = bx * C.PITCH + C.PITCH / 2, cz = bz * C.PITCH + C.PITCH / 2;
        // Skip the diner block and the bank plaza block: they stay open.
        if (cx === 28 && cz === -28) continue;    // Coral Diner
        if (cx === -28 && cz === -84) continue;   // Coral Bank plaza (gold car)
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const w = rand(12, 20), d = rand(12, 20), h = rand(8, 34);
          const ox = count === 1 ? 0 : (i === 0 ? -11 : 11);
          const oz = count === 1 ? 0 : rand(-8, 8);
          const x = cx + ox, z = cz + oz;
          const color = randPick(C.BUILDING_PALETTE);
          const hex = '#' + color.toString(16).padStart(6, '0');
          const mat = new THREE.MeshLambertMaterial({
            map: this.makeWindowTexture(hex, 0.35),
          });
          const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
          b.position.set(x, h / 2, z);
          S.add(b);
          const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.2, d * 0.5), roofMat);
          roof.position.set(x, h + 0.6, z);
          S.add(roof);
          this.buildings.push(b);
          this.addCollider(x, z, w / 2, d / 2);
        }
      }
    }

    // Central plaza: a round fountain and benches where missions start.
    const fountain = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 6, 1.2, 20),
      new THREE.MeshLambertMaterial({ color: 0x7fb3d5 }),
    );
    fountain.position.set(0, 0.6, 0);
    S.add(fountain);
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.4, 0.3, 20),
      new THREE.MeshLambertMaterial({ color: 0x2e86c1 }),
    );
    water.position.set(0, 1.25, 0);
    S.add(water);
    this.addCollider(0, 0, 6, 6);

    // The Coral Diner (mission 1): a low teal building with a sign board.
    const diner = new THREE.Mesh(
      new THREE.BoxGeometry(16, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0x1abc9c }),
    );
    diner.position.set(28, 3, -28);
    S.add(diner);
    this.addCollider(28, -28, 8, 5);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(10, 2, 0.6),
      new THREE.MeshLambertMaterial({ color: 0xf39c12 }),
    );
    sign.position.set(28, 6.4, -23);
    S.add(sign);

    // Beach and ocean (south edge): sand strip, animated water plane, pier, lighthouse.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(340, 30),
      new THREE.MeshLambertMaterial({ color: C.SAND }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0.02, C.BEACH_Z + 12);
    S.add(sand);
    this.ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(700, 220),
      new THREE.MeshLambertMaterial({ color: C.OCEAN }),
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.set(0, 0.1, C.OCEAN_Z + 100);
    S.add(this.ocean);
    // Boardwalk along the sand.
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 6),
      new THREE.MeshLambertMaterial({ color: 0xa67c52 }),
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(0, 0.03, C.BEACH_Z + 2);
    S.add(board);
    // Pier at the Marina (east end of the beach).
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1, 40),
      new THREE.MeshLambertMaterial({ color: 0x8b6f47 }),
    );
    pier.position.set(112, 0.6, C.BEACH_Z + 30);
    S.add(pier);
    // Lighthouse at the Marina.
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 4.5, 26, 12),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }),
    );
    tower.position.set(128, 13, C.BEACH_Z + 44);
    S.add(tower);
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(2, 2, 3, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    lamp.position.set(128, 27.5, C.BEACH_Z + 44);
    S.add(lamp);
    this.addCollider(128, C.BEACH_Z + 44, 4.5, 4.5);

    // Palm trees along the beach road and the plaza.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b6f47 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x27ae60 });
    for (let x = -140; x <= 140; x += 20) {
      this.addPalm(x + rand(-3, 3), C.BEACH_Z - 4, trunkMat, leafMat);
    }
    for (const [x, z] of [[-20, -20], [20, -20], [-20, 20], [20, 20]]) {
      this.addPalm(x, z, trunkMat, leafMat);
    }

    // Street lamps along the main avenue.
    const lampMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    for (let t = -140; t <= 140; t += 28) {
      for (const x of [-118, 118]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 7, 6), lampMat);
        pole.position.set(x, 3.5, t);
        S.add(pole);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bulbMat);
        bulb.position.set(x, 7.1, t);
        S.add(bulb);
      }
    }
  }

  addPalm(x, z, trunkMat, leafMat) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = rand(-0.08, 0.08);
    this.scene.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.6, 7.4, z + Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      this.scene.add(leaf);
    }
    this.palms.push({ x, z });
    this.addCollider(x, z, 0.5, 0.5);
  }

  // A random point on a road (for spawning traffic / parked cars).
  randomRoadPoint() {
    const axis = Math.random() < 0.5 ? 'x' : 'z';
    const at = randPick(CONFIG.STREETS);
    const along = rand(-140, 140);
    return axis === 'x' ? { x: at + rand(-3, 3), z: along, axis, dir: Math.random() < 0.5 ? 1 : -1 }
                        : { x: along, z: at + rand(-3, 3), axis, dir: Math.random() < 0.5 ? 1 : -1 };
  }

  // Nearest street line to a point (traffic snaps back to roads).
  nearestStreet(x, z) {
    let best = { axis: 'x', at: 0, d: Infinity };
    for (const at of CONFIG.STREETS) {
      if (Math.abs(x - at) < best.d) best = { axis: 'x', at, d: Math.abs(x - at) };
      if (Math.abs(z - at) < best.d) best = { axis: 'z', at, d: Math.abs(z - at) };
    }
    return best;
  }
}
