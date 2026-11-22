// Coral Bay — everything drawn on top of the 3D view.
// One job: the HUD (health, money, wanted stars, speed, objective, toasts),
// the minimap, and the menus (start, pause, busted, all-done).

class HUD {
  constructor(callbacks) {
    this.cb = callbacks;   // {onStart, onResume, onRestart, onMute}
    this.el = {};
    for (const id of ['hud', 'health-fill', 'money', 'stars', 'speed', 'speed-val',
      'objective', 'objective-text', 'timer', 'toast', 'minimap',
      'menu', 'menu-title', 'menu-body', 'menu-btn', 'menu-btn2',
      'hint', 'busted', 'mission-done']) {
      this.el[id] = document.getElementById(id);
    }
    this.toastTimer = null;
    this.el['menu-btn'].addEventListener('click', () => this.cb.onStart());
    this.el['menu-btn2'].addEventListener('click', () => this.cb.onRestart());
    this.mapCtx = this.el['minimap'].getContext('2d');
  }

  showStart(save) {
    this.el['hud'].style.display = 'none';
    this.el['menu'].style.display = 'flex';
    this.el['menu-title'].textContent = 'CORAL BAY';
    this.el['menu-body'].innerHTML =
      '<p>' + STORY.intro + '</p>' +
      '<p><b>Controls:</b> WASD move &middot; mouse drag camera &middot; Shift sprint &middot; Space jump<br>' +
      'E enter / exit car &middot; F or click punch &middot; Esc pause &middot; M mute</p>' +
      '<p><b>8 story missions</b> &middot; steal cars &middot; outrun the Coral Bay PD &middot; ' +
      'earn ' + fmtMoney(MISSIONS.reduce((a, m) => a + m.reward, 0)) + ' in total.</p>' +
      (save ? '<p>Save found: ' + fmtMoney(save.money) + ' &middot; mission ' + (save.mission + 1) + '/8. Continue keeps it.</p>' : '');
    this.el['menu-btn'].textContent = save ? 'Continue' : 'Start the story';
    this.el['menu-btn2'].style.display = save ? 'inline-block' : 'none';
    this.el['menu-btn2'].textContent = 'New game';
  }

  showPause() {
    this.el['menu'].style.display = 'flex';
    this.el['menu-title'].textContent = 'PAUSED';
    this.el['menu-body'].innerHTML = '<p>Coral Bay waits for no one. Well — right now it does.</p>';
    this.el['menu-btn'].textContent = 'Resume';
    this.el['menu-btn2'].style.display = 'inline-block';
    this.el['menu-btn2'].textContent = 'Restart';
  }

  showBusted() {
    this.el['menu'].style.display = 'flex';
    this.el['menu-title'].textContent = 'BUSTED';
    this.el['menu-body'].innerHTML =
      '<p>The Coral Bay PD caught you. They took ' + fmtMoney(200) + ' in fines and dropped you at the station.</p>';
    this.el['menu-btn'].textContent = 'Get back out there';
    this.el['menu-btn2'].style.display = 'none';
  }

  showAllDone() {
    this.el['menu'].style.display = 'flex';
    this.el['menu-title'].textContent = 'KING OF CORAL BAY';
    this.el['menu-body'].innerHTML =
      '<p>All 8 missions complete. Mara says the city is yours now, Rook. Free roam — cause trouble, lose the cops, enjoy the sunset.</p>';
    this.el['menu-btn'].textContent = 'Keep playing';
    this.el['menu-btn2'].style.display = 'none';
  }

  hideMenu() { this.el['menu'].style.display = 'none'; this.el['hud'].style.display = 'block'; }

  setHealth(h) {
    this.el['health-fill'].style.width = clamp(h, 0, 100) + '%';
    this.el['health-fill'].style.background = h > 50 ? '#2ecc71' : (h > 25 ? '#f39c12' : '#e74c3c');
  }

  setMoney(m) { this.el['money'].textContent = fmtMoney(m); }

  setStars(n) {
    let s = '';
    for (let i = 0; i < CONFIG.WANTED_MAX; i++) s += i < n ? '★' : '☆';
    this.el['stars'].textContent = s;
    this.el['stars'].style.color = n > 0 ? '#ffdd33' : 'rgba(255,255,255,0.35)';
  }

  setSpeed(kmh, driving) {
    this.el['speed'].style.display = driving ? 'block' : 'none';
    if (driving) this.el['speed-val'].textContent = Math.round(kmh);
  }

  setObjective(text) { this.el['objective-text'].textContent = text; }
  setTimer(seconds) {
    if (seconds > 0) { this.el['timer'].style.display = 'block'; this.el['timer'].textContent = fmtTime(seconds); }
    else this.el['timer'].style.display = 'none';
  }

  setHint(text) { this.el['hint'].textContent = text || ''; }

  toast(text, ms) {
    this.el['toast'].textContent = text;
    this.el['toast'].style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el['toast'].style.opacity = '0'; }, ms || 3500);
  }

  // Top-down minimap: roads, beach, player arrow, mission marker, police.
  drawMinimap(player, markerPos, policeUnits, cars) {
    const ctx = this.mapCtx;
    const W = 170, H = 170;
    const scale = W / 340;   // world -170..170 maps to the canvas
    const px = (x) => (x + 170) * scale;
    const pz = (z) => (z + 170) * scale;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20, 30, 40, 0.85)';
    ctx.fillRect(0, 0, W, H);
    // Beach + ocean.
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, pz(CONFIG.BEACH_Z), W, H - pz(CONFIG.BEACH_Z));
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, pz(CONFIG.OCEAN_Z), W, H - pz(CONFIG.OCEAN_Z));
    // Roads.
    ctx.strokeStyle = '#5a6068';
    ctx.lineWidth = 5;
    for (const at of CONFIG.STREETS) {
      ctx.beginPath(); ctx.moveTo(px(at), 0); ctx.lineTo(px(at), H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, pz(at)); ctx.lineTo(W, pz(at)); ctx.stroke();
    }
    // Mission marker.
    if (markerPos) {
      ctx.fillStyle = '#22aaff';
      ctx.beginPath(); ctx.arc(px(markerPos.x), pz(markerPos.z), 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px(markerPos.x), pz(markerPos.z), 8, 0, Math.PI * 2); ctx.stroke();
    }
    // Police blips (red/blue).
    for (const u of policeUnits) {
      ctx.fillStyle = '#ff3344';
      ctx.beginPath(); ctx.arc(px(u.x), pz(u.z), 4, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow.
    const heading = player.inCar ? player.inCar.heading : player.heading;
    ctx.save();
    ctx.translate(px(player.pos.x), pz(player.pos.z));
    ctx.rotate(-heading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }
}
