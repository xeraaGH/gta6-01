// Coral Bay — the city itself: sun-soaked streets, towers, palms, beach and
// water, built procedurally from a fixed seed. Also owns collision boxes,
// pickups, district props and the mission-marker beacon.
(function () {
  'use strict';
  var CB = window.CB;

  function makeCanvasTexture(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // Ground: asphalt streets on a grid, sidewalks, a plaza, and a beach strip.
  function groundTexture() {
    return makeCanvasTexture(2048, 2048, function (g, W, H) {
      var S = W / 1400; // world units -> px (city spans -700..700 incl. beach)
      function wx(x) { return (x + 700) * S; }
      function wz(z) { return (z + 700) * S; }
      g.fillStyle = '#7a8a6d'; g.fillRect(0, 0, W, H); // base grass/verge
      // beach strip at south (z > 560)
      g.fillStyle = '#e8d5a2'; g.fillRect(0, wz(560), W, H - wz(560));
      // sand speckle
      g.fillStyle = 'rgba(180,150,90,.35)';
      var rnd = CB.RNG(7);
      for (var i = 0; i < 900; i++) g.fillRect(wx(-700 + rnd() * 1400), wz(560 + rnd() * 130), 3, 3);
      // blocks
      for (var bx = -600; bx < 600; bx += 120) {
        for (var bz = -600; bz < 600; bz += 120) {
          g.fillStyle = '#9aa0a3';
          g.fillRect(wx(bx), wz(bz), 120 * S, 120 * S);
        }
      }
      // roads
      g.fillStyle = '#2e3138';
      for (var x = -600; x <= 600; x += 120) g.fillRect(wx(x - 9), 0, 18 * S, H);
      for (var z = -600; z <= 600; z += 120) g.fillRect(0, wz(z - 9), W, 18 * S);
      // centre dashes
      g.fillStyle = '#e8c33a';
      for (var x2 = -600; x2 <= 600; x2 += 120) {
        for (var z2 = -600; z2 < 600; z2 += 24) g.fillRect(wx(x2) - 1, wz(z2), 2, 12 * S);
      }
      for (var z3 = -600; z3 <= 600; z3 += 120) {
        for (var x3 = -600; x3 < 600; x3 += 24) g.fillRect(wx(x3), wz(z3) - 1, 12 * S, 2);
      }
      // crosswalks at intersections
      g.fillStyle = 'rgba(255,255,255,.75)';
      for (var ix = -600; ix <= 600; ix += 120) {
        for (var iz = -600; iz <= 600; iz += 120) {
          for (var k = -3; k <= 3; k++) g.fillRect(wx(ix + k * 4 - 1.5), wz(iz - 12), 3, 5 * S);
        }
      }
      // central plaza
      g.fillStyle = '#b9a06a';
      g.fillRect(wx(-60), wz(-60), 120 * S, 120 * S);
      g.fillStyle = '#7fb069';
      g.beginPath(); g.arc(wx(0), wz(0), 26 * S, 0, Math.PI * 2); g.fill();
    });
  }

  function buildingTexture(base, lit) {
    return makeCanvasTexture(128, 256, function (g, W, H) {
      g.fillStyle = base; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(0, 0, W, 10);
      for (var y = 22; y < H - 12; y += 22) {
        for (var x = 10; x < W - 10; x += 20) {
          g.fillStyle = lit && ((x * 7 + y * 13) % 5 === 0) ? '#ffd76a' : '#20262e';
          g.fillRect(x, y, 12, 14);
        }
      }
    });
  }

  function World() {
    this.colliders = []; // {minX,maxX,minZ,maxZ}
    this.buildings = [];
    this.palms = [];
    this.lamps = [];
    this.pickupMeshes = [];
    this.marker = null;
    this.markerLight = null;
    this.scene = null;
  }

  World.prototype.addCollider = function (x, z, hw, hd) {
    this.colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  };

  // Circle (player radius r) vs AABB; returns corrected position or null.
  World.prototype.collide = function (x, z, r) {
    for (var i = 0; i < this.colliders.length; i++) {
      var c = this.colliders[i];
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) {
        var dxl = x - (c.minX - r), dxr = (c.maxX + r) - x;
        var dzl = z - (c.minZ - r), dzr = (c.maxZ + r) - z;
        var m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) x = c.minX - r;
        else if (m === dxr) x = c.maxX + r;
        else if (m === dzl) z = c.minZ - r;
        else z = c.maxZ + r;
      }
    }
    var lim = CB.CITY / 2 - 4;
    x = Math.max(-lim, Math.min(lim, x));
    z = Math.max(-lim, Math.min(lim, z));
    return { x: x, z: z };
  };

  World.prototype.build = function (scene) {
    this.scene = scene;
    var rnd = CB.RNG(CB.SEED);

    // Sky, sun, fog — late-afternoon golden hour over the bay.
    scene.background = new THREE.Color(0x87b5d9);
    scene.fog = new THREE.Fog(0x9fc3dd, 320, 1150);
    var sun = new THREE.DirectionalLight(0xffe0b0, 1.25);
    sun.position.set(220, 320, 140);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.75));

    // Ground + water
    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.MeshLambertMaterial({ map: groundTexture() })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    scene.add(ground);
    var water = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 260),
      new THREE.MeshPhongMaterial({ color: 0x1f7fa8, shininess: 120, transparent: true, opacity: 0.92 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.4, 830);
    scene.add(water);

    // Buildings: one per block, seeded height/colour, window textures.
    var palette = ['#c9a37e', '#a8b8c4', '#d9c9a8', '#b08a7a', '#8fa8b8', '#c4b49a', '#e0b48f'];
    var texes = palette.map(function (c) { return buildingTexture(c, true); });
    var roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a60 });
    for (var bx = -600; bx < 600; bx += 120) {
      for (var bz = -600; bz < 600; bz += 120) {
        if (bx === -120 && bz === -120) continue; // plaza block
        if (Math.abs(bx) === 60 && Math.abs(bz) === 60) continue;
        var h = 18 + rnd() * 70;
        if (rnd() < 0.12) h = 95 + rnd() * 55; // towers
        var w = 52 + rnd() * 22, d = 52 + rnd() * 22;
        var cx = bx + 60 + (rnd() - 0.5) * 8, cz = bz + 60 + (rnd() - 0.5) * 8;
        var mat = new THREE.MeshLambertMaterial({ map: texes[(rnd() * texes.length) | 0] });
        var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2, cz);
        scene.add(b);
        var roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 3, d * 0.5), roofMat);
        roof.position.set(cx, h + 1.5, cz);
        scene.add(roof);
        this.buildings.push({ x: cx, z: cz, w: w, d: d, h: h });
        this.addCollider(cx, cz, w / 2 + 1, d / 2 + 1);
      }
    }

    // Palm trees along the beach and plaza.
    var trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    var leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    function palm(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 9, 6), trunkMat);
      trunk.position.y = 4.5; trunk.rotation.z = 0.12;
      g.add(trunk);
      for (var i = 0; i < 6; i++) {
        var leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 4), leafMat);
        var a = (i / 6) * Math.PI * 2;
        leaf.position.set(Math.cos(a) * 2.2, 9.2, Math.sin(a) * 2.2);
        leaf.rotation.z = Math.cos(a) * 1.1;
        leaf.rotation.x = -Math.sin(a) * 1.1;
        g.add(leaf);
      }
      g.position.set(x, 0, z);
      scene.add(g);
    }
    for (var px = -580; px <= 580; px += 60) palm(px + (rnd() - 0.5) * 20, 575 + rnd() * 12);
    for (var i = 0; i < 10; i++) palm(-90 + rnd() * 180, -90 + rnd() * 180);

    // Street lamps on corners.
    var poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2f36 });
    var lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (var lx = -600; lx <= 600; lx += 120) {
      for (var lz = -600; lz <= 600; lz += 120) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 6), poleMat);
        pole.position.set(lx + 12, 4, lz + 12);
        scene.add(pole);
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), lampMat);
        lamp.position.set(lx + 12, 8.2, lz + 12);
        scene.add(lamp);
        this.lamps.push({ x: lx + 12, z: lz + 12 });
      }
    }

    // District props: crates, benches, barriers near the docks and depot.
    var crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7a4a });
    var crateMat2 = new THREE.MeshLambertMaterial({ color: 0x6a7a8a });
    var crateSpots = [[-360, -240], [0, -480], [360, 360], [480, -480], [-480, 480]];
    for (var ci = 0; ci < crateSpots.length; ci++) {
      for (var cj = 0; cj < 5; cj++) {
        var s = 2 + rnd() * 2;
        var crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), cj % 2 ? crateMat : crateMat2);
        crate.position.set(crateSpots[ci][0] + (rnd() - 0.5) * 26, s / 2, crateSpots[ci][1] + (rnd() - 0.5) * 26);
        crate.rotation.y = rnd() * Math.PI;
        scene.add(crate);
        this.addCollider(crate.position.x, crate.position.z, s / 2 + 0.5, s / 2 + 0.5);
      }
    }

    // Safehouse (blue house), TAC SHOP (green), Garage (orange) — simple marked buildings.
    this.buildDistrict(CB.SAFEHOUSE_POS[0], CB.SAFEHOUSE_POS[2], 0x3fa9f5, 'SAFEHOUSE');
    this.buildDistrict(CB.SHOP_POS[0], CB.SHOP_POS[2], 0x37d67a, 'TAC SHOP');
    this.buildDistrict(CB.GARAGE_POS[0], CB.GARAGE_POS[2], 0xff7a1a, 'GARAGE');

    // Mission marker beacon (hidden until a mission sets it).
    var beaconGeo = new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true);
    var beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.marker = new THREE.Mesh(beaconGeo, beaconMat);
    this.marker.position.y = 30;
    this.marker.visible = false;
    scene.add(this.marker);
    this.markerLight = new THREE.PointLight(0xffd23e, 1.2, 40);
    this.markerLight.position.y = 6;
    this.markerLight.visible = false;
    scene.add(this.markerLight);

    // Pickups: floating spinning icons.
    var self = this;
    CB.PICKUPS.forEach(function (p) {
      var color = p.kind === 'cash' ? 0x37d67a : p.kind === 'health' ? 0xff5e7a : p.kind === 'armor' ? 0x3fa9f5 : 0xffd23e;
      var mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshBasicMaterial({ color: color }));
      mesh.position.set(p.pos[0], 2.2, p.pos[2]);
      scene.add(mesh);
      self.pickupMeshes.push({ mesh: mesh, data: p, taken: false });
    });
  };

  World.prototype.buildDistrict = function (x, z, color, label) {
    var g = new THREE.Group();
    var base = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 18), new THREE.MeshLambertMaterial({ color: 0xd8d3c8 }));
    base.position.y = 5;
    g.add(base);
    var sign = new THREE.Mesh(new THREE.BoxGeometry(20, 3.4, 1), new THREE.MeshBasicMaterial({ color: color }));
    sign.position.set(0, 11.5, 9.4);
    g.add(sign);
    var door = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.6), new THREE.MeshLambertMaterial({ color: 0x2a2f36 }));
    door.position.set(0, 3, 9.2);
    g.add(door);
    g.position.set(x, 0, z);
    g.userData.label = label;
    this.scene.add(g);
    this.addCollider(x, z, 11, 9);
  };

  World.prototype.setMarker = function (x, z, visible) {
    if (!this.marker) return;
    this.marker.visible = visible;
    this.markerLight.visible = visible;
    this.marker.position.x = x; this.marker.position.z = z;
    this.markerLight.position.x = x; this.markerLight.position.z = z;
  };

  World.prototype.update = function (t, playerPos) {
    if (this.marker && this.marker.visible) {
      this.marker.rotation.y = t * 0.8;
      this.marker.material.opacity = 0.28 + Math.sin(t * 3) * 0.1;
    }
    for (var i = 0; i < this.pickupMeshes.length; i++) {
      var p = this.pickupMeshes[i];
      if (p.taken) continue;
      p.mesh.rotation.y = t * 2;
      p.mesh.position.y = 2.2 + Math.sin(t * 2 + i) * 0.4;
      if (playerPos) {
        var dx = p.mesh.position.x - playerPos.x, dz = p.mesh.position.z - playerPos.z;
        if (dx * dx + dz * dz < 6.25) {
          p.taken = true;
          p.mesh.visible = false;
          if (this.onPickup) this.onPickup(p.data);
        }
      }
    }
  };

  CB.World = World;
})();
