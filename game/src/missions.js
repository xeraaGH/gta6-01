// Coral Bay — the story.
// One job: run the 8 story missions in order, track each step, show the
// marker in the world and on the minimap, and pay out on completion.

class Missions {
  constructor(scene, audio, onEvent) {
    this.scene = scene;
    this.audio = audio;
    this.onEvent = onEvent;   // (type, data) -> main: 'toast' | 'paid' | 'complete' | 'failed'
    this.index = 0;           // which mission is active
    this.step = 0;            // which step of it
    this.state = 'idle';      // idle | active | done (all missions finished)
    this.marker = null;       // the 3D beacon mesh
    this.beaconLight = null;
    this.timer = 0;           // seconds left on a timed step
    this.carrying = false;    // holding a package
    this.maraWithYou = false;
    this.goldStolen = false;
    this.activeStep = null;
  }

  current() { return MISSIONS[this.index] || null; }
  currentStep() { const m = this.current(); return m ? m.steps[this.step] : null; }

  start() {
    this.state = 'active';
    this.index = 0;
    this.step = 0;
    this.enterStep();
  }

  // Jump to a mission (used by the save system and the screenshot staging).
  jumpTo(missionIndex) {
    this.index = clamp(missionIndex, 0, MISSIONS.length - 1);
    this.step = 0;
    this.state = 'active';
    this.carrying = false;
    this.maraWithYou = false;
    this.enterStep();
  }

  enterStep() {
    const step = this.currentStep();
    this.activeStep = step;
    this.clearMarker();
    if (!step) { this.completeMission(); return; }
    if (step.pos) this.showMarker(step.pos);
    if (step.type === 'wanted') this.pendingWanted = step.stars;
    if (step.type === 'timed') this.timer = step.seconds;
    this.onEvent('objective', this.objectiveText());
    this.audio.missionStart();
  }

  objectiveText() {
    const m = this.current();
    const s = this.currentStep();
    if (!m) return 'All missions complete — Coral Bay is yours, Rook.';
    return 'Mission ' + m.id + '/8 — ' + m.name + ': ' + (s ? s.text : '');
  }

  showMarker(pos) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3, 24),
      new THREE.MeshBasicMaterial({ color: 0x22aaff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x22aaff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    beam.position.y = 20;
    g.add(beam);
    g.position.set(pos[0], 0, pos[2]);
    this.scene.add(g);
    this.marker = g;
  }

  clearMarker() {
    if (this.marker) { this.scene.remove(this.marker); this.marker = null; }
  }

  markerPos() {
    const s = this.currentStep();
    return s && s.pos ? { x: s.pos[0], z: s.pos[2] } : null;
  }

  // Called every frame while a mission is active. Returns nothing; fires events.
  // ctx: { player, police, goldCar }
  update(dt, ctx) {
    if (this.state !== 'active') return;
    const m = this.current();
    const s = this.currentStep();
    if (!m || !s) return;
    const p = ctx.player;

    // The beacon pulses.
    if (this.marker) {
      const t = performance.now() / 300;
      this.marker.scale.setScalar(1 + Math.sin(t) * 0.12);
      this.marker.rotation.y += dt * 0.8;
    }
    if (s.type === 'timed') {
      this.timer -= dt;
      if (this.timer <= 0) { this.failMission('Out of time.'); return; }
    }

    const at = (pos, radius) => dist2D(p.pos.x, p.pos.z, pos[0], pos[2]) < radius;

    switch (s.type) {
      case 'goto':
        if (at(s.pos, s.radius)) this.advance(ctx);
        break;
      case 'steal':
        if (p.inCar) this.advance(ctx);
        break;
      case 'steal-gold':
        if (p.inCar && p.inCar === ctx.goldCar) {
          this.goldStolen = true;
          this.advance(ctx);
        }
        break;
      case 'pickup':
        // Picking up happens on E (see interact()); reaching the spot arms it.
        if (at(s.pos, s.radius)) this.nearPickup = true;
        else this.nearPickup = false;
        break;
      case 'deliver':
        if (at(s.pos, s.radius)) this.advance(ctx);
        break;
      case 'wanted':
        if (ctx.police.wanted() >= s.stars) this.advance(ctx);
        break;
      case 'evade':
        if (ctx.police.wanted() === 0) this.advance(ctx);
        break;
      case 'timed':
        if (at(s.pos, s.radius)) this.advance(ctx);
        break;
    }
  }

  // E pressed near a pickup: grab the package.
  interact() {
    const s = this.currentStep();
    if (!s || s.type !== 'pickup' || !this.nearPickup) return false;
    this.carrying = true;
    this.audio.pickup();
    this.onEvent('toast', 'Package grabbed. Deliver it.');
    this.advance();
    return true;
  }

  advance() {
    this.step += 1;
    this.audio.pickup();
    const m = this.current();
    if (this.step >= m.steps.length) this.completeMission();
    else this.enterStep();
  }

  completeMission() {
    const m = this.current();
    this.clearMarker();
    this.carrying = false;
    this.maraWithYou = false;
    this.onEvent('paid', { amount: m.reward, name: m.name });
    this.audio.cash();
    this.index += 1;
    this.step = 0;
    if (this.index >= MISSIONS.length) {
      this.state = 'done';
      this.onEvent('complete', 'You did it — King of Coral Bay. The city is yours.');
    } else {
      this.enterStep();
      this.onEvent('toast', 'New mission: ' + this.current().name + ' — ' + this.current().brief);
    }
  }

  failMission(reason) {
    this.onEvent('failed', reason + ' Mission restarted.');
    this.audio.busted();
    this.step = 0;
    this.carrying = false;
    this.enterStep();
  }
}
