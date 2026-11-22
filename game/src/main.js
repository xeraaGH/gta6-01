// Coral Bay — the game itself.
// One job: boot three.js, wire every system together, run the loop,
// handle input and menus, save/load, and stage scenes for screenshots.

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.SKY);
    this.scene.fog = new THREE.Fog(CONFIG.FOG, 120, 420);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

    // Sun-soaked light: warm sun + soft sky bounce.
    const sun = new THREE.DirectionalLight(CONFIG.SUN, 2.2);
    sun.position.set(80, 120, 40);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

    this.audio = new AudioSys();
    this.world = new World(this.scene);
    this.traffic = new TrafficManager(this.scene, this.world);
    this.player = new Player(this.scene, this.world, this.audio);
    this.police = new Police(this.scene, this.world, this.audio);
    this.hud = new HUD({
      onStart: () => this.startGame(),
      onResume: () => this.startGame(),
      onRestart: () => this.restartGame(),
    });
    this.missions = new Missions(this.scene, this.audio, (type, data) => this.onMissionEvent(type, data));

    this.state = 'menu';   // menu | playing | paused | busted
    this.input = { up: false, down: false, left: false, right: false, sprint: false, jump: false };
    this.clock = new THREE.Clock();
    this.save = this.loadSave();
    this.shotMode = new URLSearchParams(location.search).get('shot') || null;
    this.bindInput();
    this.hud.showStart(this.save);
    if (this.shotMode) this.stageShot();
    this.loop();
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  writeSave() {
    try {
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify({
        money: this.player.money,
        mission: this.missions.index,
        health: this.player.health,
      }));
    } catch (e) { /* storage may be unavailable; the game still runs */ }
  }

  bindInput() {
    const key = (code) => {
      switch (code) {
        case 'KeyW': case 'ArrowUp': return 'up';
        case 'KeyS': case 'ArrowDown': return 'down';
        case 'KeyA': case 'ArrowLeft': return 'left';
        case 'KeyD': case 'ArrowRight': return 'right';
        case 'ShiftLeft': case 'ShiftRight': return 'sprint';
        case 'Space': return 'jump';
        default: return null;
      }
    };
    window.addEventListener('keydown', (e) => {
      const k = key(e.code);
      if (k) { this.input[k] = true; e.preventDefault(); }
      if (e.code === 'KeyE' && this.state === 'playing') this.onInteract();
      if ((e.code === 'KeyF' || e.code === 'MouseLeft') && this.state === 'playing') this.onAttack();
      if (e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyM') this.audio.toggleMute();
    });
    window.addEventListener('keyup', (e) => {
      const k = key(e.code);
      if (k) this.input[k] = false;
    });
    // Mouse drag orbits the camera.
    let dragging = false, lx = 0, ly = 0;
    this.canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      this.player.camYaw -= (e.clientX - lx) * 0.005;
      this.player.camPitch = clamp(this.player.camPitch + (e.clientY - ly) * 0.004, -0.1, 1.1);
      lx = e.clientX; ly = e.clientY;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    this.canvas.addEventListener('click', () => { if (this.state === 'playing') this.onAttack(); });
    this.canvas.addEventListener('wheel', (e) => {
      this.player.camDist = clamp(this.player.camDist + Math.sign(e.deltaY), 5, 16);
    }, { passive: true });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.hud.hideMenu();
    if (this.state === 'menu') {
      if (this.save) {
        this.player.money = this.save.money || 0;
        this.player.health = this.save.health || CONFIG.PLAYER_HEALTH;
        this.missions.jumpTo(this.save.mission || 0);
      } else {
        this.missions.start();
      }
    } else if (this.state === 'busted') {
      // Back on the street: health restored, mission restarts at its start.
      this.player.health = CONFIG.PLAYER_HEALTH;
      this.player.pos.set(0, 0, 28);
      this.player.mesh.position.copy(this.player.pos);
      this.missions.jumpTo(this.missions.index);
    }
    this.state = 'playing';
    this.hud.setObjective(this.missions.objectiveText());
  }

  restartGame() {
    try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) { /* ignore */ }
    this.save = null;
    this.player.money = 0;
    this.player.health = CONFIG.PLAYER_HEALTH;
    this.player.pos.set(0, 0, 28);
    this.police.clearHeat();
    this.missions.jumpTo(0);
    this.startGame();
  }

  togglePause() {
    if (this.state === 'playing') { this.state = 'paused'; this.hud.showPause(); }
    else if (this.state === 'paused') { this.hud.hideMenu(); this.state = 'playing'; }
  }

  onInteract() {
    // Picking up a package comes first.
    if (this.missions.interact()) return;
    if (this.player.inCar) { this.player.exitCar(); return; }
    const car = this.traffic.nearestParked(this.player.pos.x, this.player.pos.z, 4);
    if (car) {
      const wasParked = car.kind === 'parked';
      const isGold = car === this.traffic.goldCar;
      this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
      this.player.enterCar(car);
      if (wasParked) {
        const stars = isGold ? 2 : CONFIG.STEAL_STARS;
        this.police.addStars(stars);
        this.hud.toast(isGold ? 'The gold car! The PD will want it back.' : 'Car "borrowed". The PD noticed.');
      }
    }
  }

  onAttack() {
    if (this.player.inCar) return;
    const hit = this.player.attack(this.traffic.peds, this.police.officers);
    if (hit) {
      if (hit.type === 'ped') {
        this.police.addStars(CONFIG.HIT_PED_STARS);
        this.hud.toast('You hit a pedestrian! The PD saw that.');
      } else if (hit.type === 'officer' && hit.target.health <= 0) {
        this.hud.toast('Officer down. That will cost you.');
        this.police.addStars(1);
      }
    }
  }

  onMissionEvent(type, data) {
    if (type === 'objective') this.hud.setObjective(data);
    if (type === 'toast') this.hud.toast(data);
    if (type === 'paid') {
      this.player.money += data.amount;
      this.hud.toast('Mission complete: ' + data.name + ' — paid ' + fmtMoney(data.amount) + '!');
      this.writeSave();
    }
    if (type === 'failed') this.hud.toast(data);
    if (type === 'complete') {
      this.writeSave();
      this.state = 'paused';
      this.hud.showAllDone();
    }
  }

  onBusted() {
    this.player.money = Math.max(0, this.player.money - 200);
    this.police.clearHeat();
    if (this.player.inCar) this.player.exitCar();
    this.player.pos.set(0, 0, 28);
    this.player.mesh.position.copy(this.player.pos);
    this.player.health = CONFIG.PLAYER_HEALTH;
    this.writeSave();
    this.state = 'busted';
    this.hud.showBusted();
  }

  // Stage a fixed scene for a screenshot: ?shot=drive|chase|mission|city
  stageShot() {
    this.audio.init();
    this.hud.hideMenu();
    this.state = 'playing';
    this.missions.start();
    const p = this.player;
    if (this.shotMode === 'drive' || this.shotMode === 'chase') {
      // In a car on the main avenue, mid-city.
      const car = this.traffic.parked[2] || this.traffic.parked[0];
      this.traffic.parked = this.traffic.parked.filter((c) => c !== car);
      car.pos.set(-56, 0, 20);
      car.heading = 0;
      car.mesh.position.copy(car.pos);
      p.enterCar(car);
      car.speed = 14;
      p.camYaw = Math.PI;
      p.camPitch = 0.28;
      p.camDist = 11;
      if (this.shotMode === 'chase') {
        this.police.setStars(3);
        this.missions.jumpTo(4);   // The Getaway
      }
    } else if (this.shotMode === 'mission') {
      // On foot at the Coral Diner, mission 1 marker ahead (camera south of
      // the player, looking north at the diner and its marker).
      p.pos.set(28, 0, -12);
      p.heading = Math.PI;
      p.camYaw = 0;
      p.camPitch = 0.3;
      p.mesh.position.copy(p.pos);
      this.missions.jumpTo(0);
    } else if (this.shotMode === 'city') {
      // High wide view over the plaza and the beach beyond.
      p.pos.set(0, 0, -40);
      p.heading = 0;
      p.camYaw = 0;
      p.camPitch = 0.55;
      p.camDist = 16;
      p.mesh.position.copy(p.pos);
    }
    this.hud.setObjective(this.missions.objectiveText());
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (this.state === 'playing') {
      this.player.update(dt, this.input, this.camera);
      this.traffic.update(dt, this.player.pos, this.player.inCar);
      this.police.update(dt, this.player, () => this.onBusted());
      this.missions.update(dt, { player: this.player, police: this.police, goldCar: this.traffic.goldCar });

      // Hitting a pedestrian with a car is a crime.
      if (this.player.inCar && Math.abs(this.player.inCar.speed) > 4) {
        for (const ped of this.traffic.peds) {
          if (dist2D(ped.pos.x, ped.pos.z, this.player.pos.x, this.player.pos.z) < 2) {
            ped.fleeing = true; ped.fleeTimer = 5;
            ped.pos.x += Math.sin(ped.heading) * 6;
            ped.pos.z += Math.cos(ped.heading) * 6;
            this.police.addStars(CONFIG.HIT_PED_STARS);
            this.audio.crash();
            this.hud.toast('You hit a pedestrian!');
            break;
          }
        }
      }
      // Slow health regen out of trouble.
      if (this.police.wanted() === 0 && this.player.health < CONFIG.PLAYER_HEALTH) {
        this.player.heal(dt * 2);
      }
      // Ocean shimmer.
      this.world.ocean.position.y = 0.1 + Math.sin(t * 0.8) * 0.05;

      // HUD refresh.
      this.hud.setHealth(this.player.health);
      this.hud.setMoney(this.player.money);
      this.hud.setStars(this.police.wanted());
      this.hud.setSpeed(this.player.speed() * 3.6, !!this.player.inCar);
      const step = this.missions.currentStep();
      this.hud.setTimer(step && step.type === 'timed' ? this.missions.timer : 0);
      const nearCar = !this.player.inCar && this.traffic.nearestParked(this.player.pos.x, this.player.pos.z, 4);
      const nearPickup = this.missions.nearPickup;
      this.hud.setHint(
        nearPickup ? 'Press E — grab the package' :
        nearCar ? 'Press E — get in the car' :
        this.player.inCar ? 'E — get out · WASD drive' : '',
      );
      const policeUnits = this.police.cars.map((c) => ({ x: c.pos.x, z: c.pos.z }))
        .concat(this.police.officers.map((o) => ({ x: o.pos.x, z: o.pos.z })));
      this.hud.drawMinimap(this.player, this.missions.markerPos(), policeUnits);
      // Hurt vignette.
      document.getElementById('hurt').style.opacity = this.player.hurtFlash > 0 ? '0.45' : '0';
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('load', () => { window.CoralBayGame = new Game(); });
