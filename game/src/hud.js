// Coral Bay — the HUD: health/armor bars, cash, respect rank, wanted stars,
// mission objective, speedometer, radio readout, toasts, and the minimap.
(function () {
  'use strict';
  var CB = window.CB;

  function $(id) { return document.getElementById(id); }

  function HUD() {
    this.mm = $('minimap').getContext('2d');
    this._toastT = 0;
    this._bannerT = 0;
  }

  HUD.prototype.rankName = function (completed) {
    var name = 'ROOKIE';
    CB.RANKS.forEach(function (r) { if (completed >= r.at) name = r.name; });
    return name;
  };

  HUD.prototype.update = function (game, dt) {
    var p = game.player;
    $('health-fill').style.width = Math.max(0, p.health) + '%';
    $('armor-fill').style.width = Math.max(0, p.armor) + '%';
    $('money').textContent = '$' + p.money.toLocaleString('en-US');
    $('respect').textContent = this.rankName(game.missions.completed) + ' · RESPECT ' + game.missions.completed;
    // wanted stars
    var w = game.wanted.stars;
    var stars = '';
    for (var i = 0; i < 5; i++) stars += i < w ? '★' : '<span class="dim">★</span>';
    var wel = $('wanted');
    wel.innerHTML = stars;
    wel.classList.toggle('hot', w >= 3);
    // weapon + speedo
    var wpn = p.weapon();
    $('weapon-name').textContent = wpn.name;
    $('weapon-ammo').textContent = wpn.id === 'fists' ? '' : '· ' + (p.ammo[game.player.weaponIndex] === Infinity ? '∞' : p.ammo[game.player.weaponIndex]);
    var inCar = !!p.inCar;
    $('speedo').classList.toggle('hidden', !inCar);
    $('crosshair').classList.toggle('hidden', inCar || wpn.id === 'fists' || game.state !== 'playing');
    if (inCar) {
      $('speed-num').textContent = Math.round(Math.abs(p.inCar.speed) * 2.2);
      $('car-name').textContent = p.inCar.def.name + (p.inCar.health < 50 ? ' — SMOKING' : '');
    }
    $('radio-box').textContent = game.audio.radioOn ? '♪ ' + game.audio.stations[game.audio.station].name : '♪ RADIO OFF';
    // toast fade
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) $('toast').textContent = '';
    }
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) $('banner').classList.add('hidden');
    }
    this.drawMinimap(game);
  };

  HUD.prototype.toast = function (text, secs) {
    $('toast').textContent = text;
    this._toastT = secs || 3;
  };

  HUD.prototype.banner = function (title, sub, secs) {
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    $('banner').classList.remove('hidden');
    this._bannerT = secs || 3;
  };

  HUD.prototype.setObjective = function (title, text, dist) {
    $('objective-title').textContent = title;
    $('objective-text').textContent = text;
    $('objective-dist').textContent = dist || '';
  };

  HUD.prototype.setHint = function (text) { $('hint').textContent = text || ''; };

  // Minimap: circular top-down view, roads + buildings + blips, player arrow.
  HUD.prototype.drawMinimap = function (game) {
    var g = this.mm, S = 190, C = S / 2;
    var scale = S / 320; // show 320 world units across
    var px = game.playerPos().x, pz = game.playerPos().z;
    function toX(x) { return C + (x - px) * scale; }
    function toZ(z) { return C + (z - pz) * scale; }
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    // sea / land
    g.fillStyle = '#1f7fa8'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#3a4a3a'; g.fillRect(0, 0, S, S);
    // blocks
    g.fillStyle = '#5a636b';
    for (var bx = -600; bx < 600; bx += 120) {
      for (var bz = -600; bz < 600; bz += 120) {
        var x = toX(bx), z = toZ(bz), w = 120 * scale;
        if (x + w < 0 || x > S || z + w < 0 || z > S) continue;
        g.fillRect(x, z, w, w);
      }
    }
    // roads
    g.strokeStyle = '#2e3138'; g.lineWidth = 18 * scale;
    for (var s = -600; s <= 600; s += 120) {
      g.beginPath(); g.moveTo(toX(s), toZ(-700)); g.lineTo(toX(s), toZ(700)); g.stroke();
      g.beginPath(); g.moveTo(toX(-700), toZ(s)); g.lineTo(toX(700), toZ(s)); g.stroke();
    }
    // beach
    g.fillStyle = '#e8d5a2';
    g.fillRect(0, toZ(560), S, S - toZ(560));
    // districts
    var dots = [
      { p: CB.SAFEHOUSE_POS, c: '#3fa9f5' },
      { p: CB.SHOP_POS, c: '#37d67a' },
      { p: CB.GARAGE_POS, c: '#ff7a1a' },
    ];
    dots.forEach(function (d) {
      g.fillStyle = d.c;
      g.beginPath(); g.arc(toX(d.p[0]), toZ(d.p[2]), 4, 0, Math.PI * 2); g.fill();
    });
    // mission marker
    if (game.world.marker && game.world.marker.visible) {
      var mx = toX(game.world.marker.position.x), mz = toZ(game.world.marker.position.z);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.arc(mx, mz, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx, mz, 9, 0, Math.PI * 2); g.stroke();
    }
    // pickups
    g.fillStyle = '#7dff9b';
    game.world.pickupMeshes.forEach(function (pk) {
      if (pk.taken) return;
      g.fillRect(toX(pk.mesh.position.x) - 2, toZ(pk.mesh.position.z) - 2, 4, 4);
    });
    // police blips
    g.fillStyle = '#ff5340';
    game.police.cars.forEach(function (v) {
      g.beginPath(); g.arc(toX(v.mesh.position.x), toZ(v.mesh.position.z), 3.5, 0, Math.PI * 2); g.fill();
    });
    // player arrow (points along camera yaw)
    g.save();
    g.translate(C, C);
    g.rotate(Math.PI - game.player.camYaw);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill();
    g.strokeStyle = '#0b1620'; g.lineWidth = 1.5; g.stroke();
    g.restore();
    g.restore();
    // north tick
    g.fillStyle = '#fff'; g.font = 'bold 11px Arial'; g.textAlign = 'center';
    g.fillText('N', C, 14);
  };

  CB.HUD = HUD;
})();
