/* AFTERBURN pack for the F-X fighter — ideas ported from Sky Survivor: AFTERBURN (journey map):
   homing missiles + decoy flares, threat markers and a lock tone that speeds up, CLOSE CALL slow motion,
   SPLASH kills, a combo multiplier, a scramble launch, wingtip contrails, explosions with shock rings,
   and adaptive music (calm → drums+bass on the ring run → lead when missiles are in the air → calm again for the landing).
   Loaded after the main script; it wraps SIM.step / render / drawHUD / startStage / handleEvents. */
(function () {
  'use strict';
  const clamp = SIM.clamp, DT = SIM.DT, rnd = Math.random;
  SIM.FAILS.SHOT = ['撃墜された', 'ミサイルが近づいたら DECOY（おとり弾）。赤い矢印の方向と距離を見て、早めに撃とう。'];
  const COMBAT_CAP = 5000;
  const on = s => s && !attract && s.plane === 'fighter' && Save.d.opt.missile !== false;
  const fighter = s => s && !attract && s.plane === 'fighter';

  /* ---------------- state ---------------- */
  let A = null;
  function reset() {
    A = { hp: 3, mis: [], flares: [], fx: [], rings: [], trails: [[], []], spawnT: 9, flareCd: 0, combo: 0, comboT: 0, maxCombo: 0, slow: 0, inv: 0, smoke: 0,
      banner: null, warned: false, lockT: 0, launch: 1.3, flashA: 0, flashC: '255,255,255', near: 0, splash: 0, saves: 0, decoyQ: false, tr: 0 };
  }
  reset();

  /* ---------------- audio (uses the host Snd graph) ---------------- */
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const Au = {
    ok() { return Snd.ok && Snd.on() && Snd.ctx && Snd.ctx.state === 'running'; },
    out(pan, dest) { const c = Snd.ctx, g = c.createGain(); let head = g; if (c.createStereoPanner && pan) { const p = c.createStereoPanner(); p.pan.value = clamp(pan, -0.95, 0.95); g.connect(p); head = p; } head.connect(dest || Snd.master); return g; },
    osc(type, f, t, dur, vol, o = {}) {
      const c = Snd.ctx, os = c.createOscillator(), g = this.out(o.pan || 0, o.dest); os.type = type; os.frequency.setValueAtTime(f, t); if (o.detune) os.detune.value = o.detune;
      if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      let src = os; if (o.filter) { const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.filter; fl.Q.value = o.q || 1; os.connect(fl); src = fl; }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      src.connect(g); os.start(t); os.stop(t + dur + 0.05); os.onended = () => g.disconnect();
    },
    noise(t, dur, vol, o = {}) {
      const c = Snd.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this.out(o.pan || 0, o.dest);
      s.buffer = Snd.noiseBuf; s.loop = true; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.freq || 1000, t); f.Q.value = o.q || 1; if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.003)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(f); f.connect(g); s.start(t, rnd() * 1.2); s.stop(t + dur + 0.05); s.onended = () => g.disconnect(); return f;
    },
    get now() { return Snd.ctx.currentTime; },
    chime(combo) { if (!this.ok()) return; const t = this.now, P = [0, 3, 5, 7, 10], d = Math.min(combo, 9), n = 81 + P[d % 5] + 12 * Math.floor(d / 5); this.osc('triangle', mtof(n), t, 0.45, 0.06); this.osc('sine', mtof(n + 7), t + 0.06, 0.5, 0.04); },
    closeCall(pan) { if (!this.ok()) return; const t = this.now, f = this.noise(t, 0.55, 0.4, { freq: 400, to: 2600, q: 2.4, pan, attack: 0.12 }); f.frequency.exponentialRampToValueAtTime(500, t + 0.55); this.osc('sine', mtof(88), t + 0.05, 0.25, 0.03); },
    flare() { if (!this.ok()) return; const t = this.now; this.noise(t, 0.45, 0.2, { freq: 900, to: 3000, q: 0.8, attack: 0.01 }); for (let i = 0; i < 9; i++) this.noise(t + 0.05 + i * 0.055 + rnd() * 0.03, 0.07, 0.12, { type: 'highpass', freq: 2500 + rnd() * 3000, pan: (rnd() - 0.5) * 1.4 }); this.osc('sine', 180, t, 0.3, 0.12, { to: 70 }); },
    launch(pan, vol) { if (!this.ok()) return; const t = this.now; this.noise(t, 1.1, 0.16 * vol, { freq: 300, to: 1400, q: 1.5, pan, attack: 0.2 }); this.osc('sawtooth', 90, t, 0.9, 0.03 * vol, { to: 180, filter: 600, pan }); },
    lock(pan, urgent) { if (!this.ok()) return; const t = this.now; this.osc('square', urgent ? 1480 : 1180, t, 0.1, 0.1, { pan, filter: 4500 }); if (urgent) this.osc('square', 1480, t + 0.11, 0.1, 0.09, { pan, filter: 4500 }); },
    explosion(vol, pan, big) { if (!this.ok()) return; const t = this.now, d = big ? 2.2 : 1.2; vol = clamp(vol, 0, 1.2);
      this.noise(t, d, 0.5 * vol, { type: 'lowpass', freq: big ? 5000 : 3200, to: 120, q: 0.7, pan, attack: 0.004 }); this.osc('sine', big ? 110 : 140, t, d * 0.6, 0.5 * vol, { to: 28, pan }); this.noise(t, 0.12, 0.22 * vol, { type: 'highpass', freq: 3000, pan }); },
    hit() { if (!this.ok()) return; const t = this.now; this.explosion(0.9, 0, false); this.osc('square', 190, t, 0.35, 0.12, { to: 60, filter: 1600 }); this.osc('sawtooth', 260, t, 0.25, 0.08, { to: 90, filter: 1200, detune: 30 }); },
    stinger() { if (!this.ok()) return; const t = this.now; this.noise(t, 2.0, 0.12, { type: 'highpass', freq: 5000, attack: 0.002 }); [0, 7, 12, 15].forEach(d => this.osc('sawtooth', mtof(52 + d), t, 1.4, 0.04, { filter: 1800, detune: (rnd() - 0.5) * 14 })); this.osc('sine', 55, t, 0.6, 0.35, { to: 30 }); this.osc('sawtooth', 440, t + 0.05, 0.9, 0.022, { to: 880, filter: 2000 }); },
    boom() { if (!this.ok()) return; const t = this.now; this.osc('sine', 70, t, 0.9, 0.45, { to: 24 }); this.noise(t, 1.1, 0.34, { type: 'lowpass', freq: 1600, to: 90, attack: 0.01 }); this.noise(t + 0.02, 0.5, 0.14, { freq: 600, to: 2400, q: 0.7 }); },
    heart() { if (!this.ok()) return; const t = this.now; this.osc('sine', 62, t, 0.16, 0.26, { to: 40 }); this.osc('sine', 58, t + 0.19, 0.2, 0.18, { to: 38 }); }
  };
  /* adaptive music: A minor, Am–F–C–G; look-ahead scheduler */
  const CH = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], RT = [45, 41, 48, 43];
  const LEAD = (() => { const s = new Array(64).fill(-1), put = (b, st, n) => s[b * 16 + st] = n;
    put(0, 0, 69); put(0, 4, 72); put(0, 6, 76); put(0, 10, 74); put(0, 12, 72); put(1, 0, 72); put(1, 4, 69); put(1, 6, 72); put(1, 8, 77); put(1, 12, 76);
    put(2, 0, 76); put(2, 4, 79); put(2, 8, 76); put(2, 10, 72); put(2, 12, 74); put(3, 0, 74); put(3, 4, 71); put(3, 8, 74); put(3, 10, 79); put(3, 14, 76); return s; })();
  const Mu = { on: false, level: 0, bpm: 120, step: 0, next: 0, timer: null, bus: null, roar: null,
    ensure() { if (this.bus || !Snd.ctx) return; const c = Snd.ctx; this.bus = c.createGain(); this.bus.gain.value = 0; this.bus.connect(Snd.master);
      const n = c.createBufferSource(); n.buffer = Snd.noiseBuf; n.loop = true; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; this.roarF = f;
      this.roar = c.createGain(); this.roar.gain.value = 0; n.connect(f); f.connect(this.roar); this.roar.connect(Snd.master); n.start(); },
    start() { if (this.on || !Snd.ctx) return; this.ensure(); this.on = true; this.step = 0; this.next = Snd.ctx.currentTime + 0.08; this.bus.gain.setTargetAtTime(0.34, Snd.ctx.currentTime, 0.3); this.timer = setInterval(() => this.sched(), 25); },
    stop() { if (!this.on) return; this.on = false; clearInterval(this.timer); this.timer = null; if (this.bus) this.bus.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.15); },
    sched() { const c = Snd.ctx; if (!c || c.state !== 'running') return; if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.05;
      while (this.next < c.currentTime + 0.14) { this.play(this.step, this.next); this.next += 60 / this.bpm / 4; this.step = (this.step + 1) % 64; } },
    play(step, t) {
      const L = this.level, bar = Math.floor(step / 16) % 4, s = step % 16, chord = CH[bar], root = RT[bar], m = this.bus, six = 60 / this.bpm / 4;
      if (s === 0) { chord.forEach(n => Au.osc('sawtooth', mtof(n), t, six * 16, L ? 0.02 : 0.034, { dest: m, filter: L >= 2 ? 1500 : 900, attack: 0.25, detune: (rnd() - 0.5) * 16 })); Au.osc('triangle', mtof(root + 12), t, six * 16, L ? 0.03 : 0.05, { dest: m, attack: 0.3 }); }
      if (L >= 2 || s % 2 === 0) { const idx = (s >> (L >= 2 ? 0 : 1)) % 4, n = idx === 3 ? chord[0] + 12 : chord[idx]; Au.osc(L >= 1 ? 'square' : 'triangle', mtof(n + 12), t, six * 1.6, L >= 1 ? 0.018 : 0.04, { dest: m, filter: L >= 2 ? 3600 : 2200 }); }
      if (L >= 1) {
        if (s % 4 === 0) { Au.osc('sine', 150, t, 0.32, 0.42, { dest: m, to: 42, attack: 0.002 }); Au.noise(t, 0.02, 0.08, { type: 'highpass', freq: 3000, dest: m }); }
        if (s % 2 === 0) Au.osc('sawtooth', mtof(root + (s % 4 === 2 ? 12 : 0)), t, six * 1.8, 0.07, { dest: m, filter: L >= 2 ? 720 : 520, q: 5 });
        if (L >= 2 ? true : s % 4 === 2) Au.noise(t, s % 4 === 2 ? 0.06 : 0.03, s % 4 === 2 ? 0.05 : 0.025, { type: 'highpass', freq: 8000, dest: m });
      }
      if (L >= 2 && (s === 4 || s === 12)) { Au.noise(t, 0.22, 0.16, { freq: 1800, q: 0.8, dest: m }); Au.osc('triangle', 190, t, 0.12, 0.12, { dest: m, to: 130 }); }
      if (L >= 2) { const n = LEAD[step]; if (n > 0) { Au.osc('square', mtof(n), t, six * 3.2, 0.026, { dest: m, filter: 2600 }); Au.osc('sawtooth', mtof(n), t, six * 3.2, 0.018, { dest: m, filter: 2200, detune: 9 }); } }
    }
  };

  /* ---------------- effects ---------------- */
  function spark(x, y, z, vx, vy, vz, life, size, grow, col, add, drag) { if (A.fx.length > 520) A.fx.shift(); A.fx.push({ x, y, z, vx, vy, vz, life, max: life, size, grow, col, add, drag: drag || 0 }); }
  function explode(x, y, z, size, big) {
    for (let i = 0; i < (big ? 46 : 26); i++) { const a = rnd() * 6.283, b = (rnd() - 0.5) * 3.1, sp = (20 + rnd() * 70) * size; spark(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp, 0.35 + rnd() * 0.5, (2 + rnd() * 3) * size, 6, rnd() < 0.5 ? '255,210,120' : '255,140,50', true, 2.2); }
    for (let i = 0; i < (big ? 16 : 9); i++) spark(x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, z + (rnd() - 0.5) * 6, (rnd() - 0.5) * 14, 4 + rnd() * 8, (rnd() - 0.5) * 14, 1.4 + rnd(), 5 * size, 9, '70,66,62', false, 0.8);
    A.rings.push({ x, y, z, r: 4 * size, grow: 150 * size, life: 0.5, max: 0.5 });
    spark(x, y, z, 0, 0, 0, 0.16, 26 * size, 60, '255,245,220', true, 0);
  }
  function award(s, pts, label, col) {
    A.combo++; A.comboT = 7; A.maxCombo = Math.max(A.maxCombo, A.combo);
    const mult = Math.min(5, A.combo), got = Math.min(pts * mult, Math.max(0, COMBAT_CAP - (s.sky.combat || 0)));
    s.sky.combat = (s.sky.combat || 0) + got; s.boost = Math.min(100, s.boost + 12);
    pop(`${label} +${got}${mult > 1 ? ' ×' + mult : ''}`, col || '#ffd23f'); Au.chime(A.combo);
  }
  function banner(big, sub, col) { A.banner = { big, sub, col: col || '#ff5a4f', t: 2.2 }; }

  /* ---------------- gameplay ---------------- */
  function spawnMissile(s) {
    const fx = Math.sin(s.psi), fz = Math.cos(s.psi), rx = fz, rz = -fx, behind = rnd() > 0.28;
    const d = behind ? -(480 + rnd() * 220) : 1500, lat = (rnd() - 0.5) * 420;
    const m = { x: s.x + fx * d + rx * lat, y: Math.max(90, s.h + (rnd() - 0.4) * 240), z: s.z + fz * d + rz * lat, vx: 0, vy: 0, vz: 0, life: 11, age: 0, div: false, decoy: null, near: false, scored: false, tr: 0,
      turn: 0.5 + 0.12 * (s.ring / Math.max(1, s.W.rings.length)) };
    const dx = s.x - m.x, dy = s.h - m.y, dz = s.z - m.z, L = Math.hypot(dx, dy, dz) || 1, sp = Math.max(280, s.v + 70);
    m.vx = dx / L * sp; m.vy = dy / L * sp; m.vz = dz / L * sp; A.mis.push(m);
    Au.launch(clamp(lat / 300, -0.8, 0.8), behind ? 0.9 : 0.6);
    if (!A.warned) { A.warned = true; banner('MISSILE ALERT', '赤い矢印が近づいたら DECOY（おとり弾）', '#ff5a4f'); Au.stinger(); }
  }
  function decoy(s) {
    if (A.flareCd > 0 || s.phase !== 'air' || s.result) return;
    A.flareCd = 5.5; const fx = Math.sin(s.psi), fz = Math.cos(s.psi), rx = fz, rz = -fx;
    for (let i = 0; i < 10; i++) { const sd = i % 2 ? 1 : -1, spd = 0.3 + Math.floor(i / 2) * 0.18;
      A.flares.push({ x: s.x - fx * 5, y: s.h + 2, z: s.z - fz * 5, vx: s.vx * 0.8 + rx * sd * (30 + spd * 80), vy: -6 + rnd() * 34 - spd * 16, vz: s.vz * 0.8 + rz * sd * (30 + spd * 80), life: 2.2 + rnd() * 0.6 }); }
    let n = 0; for (const m of A.mis) { if (m.div || Math.hypot(m.x - s.x, m.y - s.h, m.z - s.z) > 900) continue; m.div = true; m.decoy = A.flares[A.flares.length - 1 - Math.floor(rnd() * 10)]; m.life = Math.min(m.life, 1.5 + rnd() * 0.5); n++; }
    A.saves += n; pop(n ? `おとり成功 · ${n} 発の誘導を外した` : 'おとり弾 · ミサイルが近いときに使おう', n ? '#5fdc9b' : '#a9bcc4'); Au.flare(); A.flashA = 0.22; A.flashC = '255,243,208';
    if (navigator.vibrate) try { navigator.vibrate(20); } catch (e) {}
  }
  function hurt(s) {
    if (A.inv > 0) return; A.hp--; A.inv = 2.6; A.spawnT = Math.max(A.spawnT, 4); A.smoke = 4; A.combo = 0; s.v = Math.max(120, s.v * 0.82); s.boost = Math.max(0, s.boost - 35);
    shake = 22; A.flashA = 0.5; A.flashC = '255,80,60'; Au.hit(); if (navigator.vibrate) try { navigator.vibrate([80, 40, 120]); } catch (e) {}
    if (A.hp <= 0) { explode(s.x, s.h + 2, s.z, 2.2, true); Au.explosion(1.1, 0, true); s.phase = 'done'; s.result = { ok: false, code: 'SHOT', title: SIM.FAILS.SHOT[0], hint: SIM.FAILS.SHOT[1] }; s.events.push({ type: 'crash', code: 'SHOT' }); }
    else flash = { big: '被弾！', sub: `機体 残り ${A.hp}`, col: '#ff5a4f', t: 1.1 };
  }
  function step(s) {
    A.flareCd = Math.max(0, A.flareCd - DT); A.inv = Math.max(0, A.inv - DT); A.comboT -= DT; if (A.comboT <= 0) A.combo = 0;
    if (A.decoyQ) { A.decoyQ = false; decoy(s); }
    const fin = SIM.finalLeg(s), live = s.phase === 'air' && !s.result;
    if (live && !fin && s.t > 7) { A.spawnT -= DT; const cap = s.ring > s.W.rings.length * 0.6 ? 3 : 2;
      if (A.spawnT <= 0) { if (A.mis.filter(m => !m.div).length < cap) spawnMissile(s); A.spawnT = 5.6 + rnd() * 3 - 1.6 * (s.ring / Math.max(1, s.W.rings.length)); } }
    if (fin && A.mis.length && !A.cleared) { A.cleared = true; for (const m of A.mis) { explode(m.x, m.y, m.z, 0.8); } A.mis.length = 0; Au.explosion(0.5, 0, false); banner('空域クリア', '羽田へ着陸せよ', '#5fdc9b'); }
    for (const f of A.flares) { f.life -= DT; f.vy -= 14 * DT; f.vx *= 1 - 0.9 * DT; f.vz *= 1 - 0.9 * DT; f.x += f.vx * DT; f.y += f.vy * DT; f.z += f.vz * DT;
      if (rnd() < 0.7) spark(f.x, f.y, f.z, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6, 0.35, 2.4, -3, rnd() < 0.5 ? '255,250,220' : '255,200,110', true, 1); }
    A.flares = A.flares.filter(f => f.life > 0 && f.y > 0);
    for (let i = A.mis.length - 1; i >= 0; i--) {
      const m = A.mis[i]; m.life -= DT; m.age += DT;
      const sp = Math.max(280, s.v + 70); let ax, ay, az;
      if (!m.div) { ax = s.x + s.vx * 0.12 - m.x; ay = s.h + 2 + s.vy * 0.12 - m.y; az = s.z + s.vz * 0.12 - m.z; }
      else if (m.decoy) { ax = m.decoy.x - m.x; ay = m.decoy.y - m.y; az = m.decoy.z - m.z; } else { ax = m.vx; ay = m.vy; az = m.vz; }
      const al = Math.hypot(ax, ay, az) || 1, vl = Math.hypot(m.vx, m.vy, m.vz) || 1; let dx = m.vx / vl, dy = m.vy / vl, dz = m.vz / vl; ax /= al; ay /= al; az /= al;
      const ang = Math.acos(clamp(dx * ax + dy * ay + dz * az, -1, 1)), k = Math.min(1, (m.div ? 3 : m.turn) * DT / Math.max(ang, 0.001));
      dx += (ax - dx) * k; dy += (ay - dy) * k; dz += (az - dz) * k; const dl = Math.hypot(dx, dy, dz) || 1; m.vx = dx / dl * sp; m.vy = dy / dl * sp; m.vz = dz / dl * sp;
      m.x += m.vx * DT; m.y += m.vy * DT; m.z += m.vz * DT;
      m.tr += DT; if (m.tr > 0.03) { m.tr = 0; spark(m.x - dx * 4, m.y - dy * 4, m.z - dz * 4, (rnd() - 0.5) * 4, (rnd() - 0.5) * 4, (rnd() - 0.5) * 4, 1.5, 2.2, 3.6, '225,220,210', false, 0.5); spark(m.x - dx * 3, m.y - dy * 3, m.z - dz * 3, m.vx * 0.1, m.vy * 0.1, m.vz * 0.1, 0.12, 3, -4, '255,160,70', true, 0); }
      const rx = m.x - s.x, ry = m.y - (s.h + 2), rz = m.z - s.z, dist = Math.hypot(rx, ry, rz); let dead = false;
      if (!m.div && live && dist < 9) { explode(m.x, m.y, m.z, 1.1); hurt(s); dead = true; }
      else if (!m.div && live) { if (dist < 48) m.near = true;
        if (m.near && !m.scored && dist > 62 && rx * (m.vx - s.vx) + ry * (m.vy - s.vy) + rz * (m.vz - s.vz) > 0) { m.scored = true; A.near++; award(s, 150, 'CLOSE CALL', '#5fd7ff'); Au.closeCall(clamp((rx * Math.cos(s.psi) - rz * Math.sin(s.psi)) / 40, -0.9, 0.9)); A.slow = 0.45; } }
      if (!dead && (m.y < 2 || SIM.hitTest(s.W, m.x, m.y, m.z))) { if (live) { A.splash++; award(s, m.div ? 150 : 250, m.div ? 'SPLASH' : '障害物でかわした！', '#5fdc9b'); } explode(m.x, Math.max(2, m.y), m.z, 1); Au.explosion(clamp(1 - dist / 900, 0.15, 0.8), 0, false); dead = true; }
      if (!dead && m.life <= 0) { if (m.div && live) { A.splash++; award(s, 150, 'SPLASH', '#5fdc9b'); } explode(m.x, m.y, m.z, m.div ? 0.9 : 0.6); Au.explosion(clamp(1 - dist / 900, 0.1, 0.7), 0, false); dead = true; }
      if (!dead && dist > 2600) dead = true;
      if (dead) A.mis.splice(i, 1);
    }
  }
  const _step = SIM.step;
  SIM.step = function (s, inp) {
    const f = fighter(s);
    if (f && A.launch > 0 && s.phase === 'air') { A.launch -= DT; inp = Object.assign({}, inp, { boost: true }); }
    _step(s, inp);
    if (on(s)) step(s);
  };

  /* ---------------- per-frame visuals ---------------- */
  let lastT = 0;
  function update(s, dt) {
    A.slow = Math.max(0, A.slow - dt); A.flashA = Math.max(0, A.flashA - dt * 1.6); if (A.banner) { A.banner.t -= dt; if (A.banner.t <= 0) A.banner = null; }
    for (const p of A.fx) { p.life -= dt; const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; p.vz *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.size = Math.max(0.2, p.size + p.grow * dt); }
    A.fx = A.fx.filter(p => p.life > 0);
    for (const r of A.rings) { r.life -= dt; r.r += r.grow * dt; } A.rings = A.rings.filter(r => r.life > 0);
    // wingtip contrails while pulling G or on afterburner; black smoke after a hit
    const live = s.phase === 'air' && !s.result;
    if (live) { A.tr += dt; if (A.tr > 0.022) { A.tr = 0; const on2 = s.boosting || s.n > 2.6 || s.v > 250;
        const fx = Math.sin(s.psi), fz = Math.cos(s.psi), rx = fz, rz = -fx, b = (s.bank + (s.roll || 0)) * SIM.D2R, cb = Math.cos(b), sb = Math.sin(b), span = 8.6;
        [-1, 1].forEach((sd, i) => { const tl = A.trails[i]; tl.push(on2 ? [s.x + rx * sd * span * cb - fx * 3, s.h + 3 - sd * span * sb, s.z + rz * sd * span * cb - fz * 3] : null); if (tl.length > 46) tl.shift(); }); } }
    if (live && A.smoke > 0) { A.smoke -= dt; if (rnd() < 0.8) spark(s.x + (rnd() - 0.5) * 3, s.h + 3, s.z + (rnd() - 0.5) * 3, (rnd() - 0.5) * 5, 3 + rnd() * 4, (rnd() - 0.5) * 5, 1.4, 2.5, 6, '40,38,36', false, 0.6); }
    if (live && A.hp === 1) { A.heart = (A.heart || 0) - dt; if (A.heart <= 0) { A.heart = 0.85; Au.heart(); } }
    if (live && A.hp <= 2 && A.smoke <= 0 && rnd() < (A.hp === 1 ? 0.5 : 0.18)) spark(s.x, s.h + 3, s.z, (rnd() - 0.5) * 4, 2 + rnd() * 3, (rnd() - 0.5) * 4, 1.1, 2, 5, '60,56,54', false, 0.6);
    // lock tone: faster as the nearest missile closes, panned to its side
    if (live && Save.d.opt.missile !== false) { let nd = 1e9, nm = null; for (const m of A.mis) { if (m.div) continue; const d = Math.hypot(m.x - s.x, m.y - s.h, m.z - s.z); if (d < nd) { nd = d; nm = m; } }
      A.nearest = nm; A.nearD = nd;
      if (nm && nd < 1100) { A.lockT -= dt; if (A.lockT <= 0) { const pan = clamp(((nm.x - s.x) * Math.cos(s.psi) - (nm.z - s.z) * Math.sin(s.psi)) / 300, -0.8, 0.8); Au.lock(pan, nd < 260); A.lockT = clamp(nd / 900, 0.14, 0.9); } } }
    else { A.nearest = null; }
    // music + afterburner roar
    const play = mode === 'play' && !s.result, want = play && Save.d.opt.music !== false && Au.ok();
    if (want) { Mu.start(); const fin = SIM.finalLeg(s), hot = A.mis.some(m => !m.div); Mu.level = s.phase !== 'air' || fin ? 0 : hot ? 2 : 1; Mu.bpm = Mu.level === 2 ? 134 : Mu.level === 1 ? 126 : 118; } else Mu.stop();
    Mu.ensure(); if (Mu.roar) { const g = play && Au.ok() && s.phase === 'air' ? (s.boosting ? 0.11 : 0.02 * s.thr) : 0; Mu.roar.gain.setTargetAtTime(g, Snd.ctx.currentTime, 0.12); Mu.roarF.frequency.setTargetAtTime(s.boosting ? 760 : 320, Snd.ctx.currentTime, 0.15); }
  }
  function draw(s) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // contrails
    ctx.lineCap = 'round';
    for (const tl of A.trails) { for (let i = 1; i < tl.length; i++) { const a = tl[i - 1], b = tl[i]; if (!a || !b) continue; const p = toScreen(a[0], a[1], a[2]), q = toScreen(b[0], b[1], b[2]); if (p[2] < 2 || q[2] < 2) continue;
        const k = i / tl.length; ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`; ctx.lineWidth = Math.max(0.6, cam.f * 0.5 / q[2] * (0.5 + k)); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); } }
    // particles: smoke first, then additive fire
    for (const pass of [false, true]) { ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of A.fx) { if (p.add !== pass) continue; const c = toScreen(p.x, p.y, p.z); if (c[2] < 2) continue; const r = cam.f * p.size / c[2]; if (r < 0.3 || r > 400) continue; const a = p.life / p.max;
        if (pass && r > 3) { const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r); g.addColorStop(0, `rgba(${p.col},${a})`); g.addColorStop(1, `rgba(${p.col},0)`); ctx.fillStyle = g; }
        else ctx.fillStyle = `rgba(${p.col},${a * (pass ? 0.9 : 0.42)})`;
        ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 6.2832); ctx.fill(); } }
    ctx.globalCompositeOperation = 'source-over';
    for (const r of A.rings) { const c = toScreen(r.x, r.y, r.z); if (c[2] < 2) continue; const a = r.life / r.max; ctx.strokeStyle = `rgba(255,240,210,${a * 0.8})`; ctx.lineWidth = 1 + 4 * a; ctx.beginPath(); ctx.arc(c[0], c[1], cam.f * r.r / c[2], 0, 6.2832); ctx.stroke(); }
    // missiles
    const t = performance.now() / 1000;
    for (const m of A.mis) { const vl = Math.hypot(m.vx, m.vy, m.vz) || 1, c = toScreen(m.x, m.y, m.z), d = toScreen(m.x - m.vx / vl * 5.5, m.y - m.vy / vl * 5.5, m.z - m.vz / vl * 5.5); if (c[2] < 2 || d[2] < 2) continue;
      const k = cam.f / c[2]; ctx.strokeStyle = '#efe2c0'; ctx.lineWidth = Math.max(1.5, k * 0.8); ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; const gr = Math.max(4, k * 4.5), g = ctx.createRadialGradient(d[0], d[1], 0, d[0], d[1], gr); g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d[0], d[1], gr, 0, 6.2832); ctx.fill();
      if (!m.div && Math.sin(m.age * 18) > 0) { ctx.fillStyle = 'rgba(255,60,40,.95)'; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(2, k * 0.9), 0, 6.2832); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over'; }
    // afterburner bloom + scramble shock ring around the jet
    const pc = toScreen(s.x, s.h + 3, s.z);
    if (pc[2] > 2 && s.phase === 'air' && !s.result) { const k = cam.f / pc[2];
      if (s.boosting) { ctx.globalCompositeOperation = 'lighter'; const r = k * (9 + 2 * Math.sin(t * 50)), g = ctx.createRadialGradient(pc[0], pc[1] + k * 1.2, 0, pc[0], pc[1] + k * 1.2, r); g.addColorStop(0, 'rgba(140,210,255,.5)'); g.addColorStop(1, 'rgba(80,140,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pc[0], pc[1] + k * 1.2, r, 0, 6.2832); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      if (A.launch > 0) { const a = A.launch / 1.3; ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`; ctx.lineWidth = 2 + 5 * a; ctx.beginPath(); ctx.ellipse(pc[0], pc[1], k * (8 + (1 - a) * 60), k * (4 + (1 - a) * 30), 0, 0, 6.2832); ctx.stroke(); }
      if (A.inv > 0 && Math.floor(t * 14) % 2) { ctx.strokeStyle = 'rgba(255,90,79,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pc[0], pc[1], k * 12, 0, 6.2832); ctx.stroke(); } }
    if (A.flashA > 0) { ctx.fillStyle = `rgba(${A.flashC},${A.flashA})`; ctx.fillRect(0, 0, W, H); }
    if (A.hp === 1 && s.phase === 'air' && !s.result) { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); g.addColorStop(0, 'rgba(255,40,30,0)'); g.addColorStop(1, `rgba(255,40,30,${0.2 + 0.1 * Math.sin(t * 6)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
  }
  function arrow(x, y, ang, col, label, size) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(12,23,32,.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.6, -size * 0.7); ctx.lineTo(-size * 0.25, 0); ctx.lineTo(-size * 0.6, size * 0.7); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
    txt(label, clamp(x - Math.cos(ang) * (size + 20), 30, W - 30), clamp(y - Math.sin(ang) * (size + 14), 20, H - 12) + 4, '600 11px "IBM Plex Mono",monospace', col, 'center');
  }
  function hud(s) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const t = performance.now() / 1000, mOn = Save.d.opt.missile !== false, live = s.phase === 'air' && !s.result;
    if (mOn && live) {
      const mx = 46, top = 96, bot = H - 70;
      for (const m of A.mis) { if (m.div) continue; const d = Math.hypot(m.x - s.x, m.y - s.h, m.z - s.z); if (d > 1800) continue;
        const hot = d < 220, col = hot ? (Math.floor(t * 8) % 2 ? '#ff3b2a' : '#ffd0c0') : d < 480 ? '#ff7048' : '#ffb27a', p = toScreen(m.x, m.y, m.z), lab = Math.round(d) + 'm';
        if (p[2] > 2 && p[0] > mx && p[0] < W - mx && p[1] > top && p[1] < bot) { const z = clamp(2600 / (d + 20), 9, 30); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
          for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(p[0] + qx * z, p[1] + qy * z * 0.55); ctx.lineTo(p[0] + qx * z, p[1] + qy * z); ctx.lineTo(p[0] + qx * z * 0.55, p[1] + qy * z); } ctx.stroke();
          txt(lab, p[0], p[1] + z + 13, '600 11px "IBM Plex Mono",monospace', col, 'center'); }
        else { let dx = p[0] - W / 2, dy = p[1] - H / 2; if (p[2] < 0) { dx = -dx; dy = -dy; } const a = Math.atan2(dy, dx), ex = clamp(W / 2 + Math.cos(a) * W, mx, W - mx), ey = clamp(H / 2 + Math.sin(a) * H, top, bot); arrow(ex, ey, a, col, lab, hot ? 17 : 13); } }
      if (A.nearest && A.nearD < 520) { const urgent = A.nearD < 260; txt(urgent ? '⚠ DECOY！ ミサイル至近' : 'ミサイル接近', W / 2, H > W ? Math.max(H * 0.32, 230) : H * 0.3, `400 ${urgent ? 20 : 15}px "Dela Gothic One",sans-serif`, urgent ? (Math.floor(t * 8) % 2 ? '#ff3b2a' : '#fff') : '#ff9a7a', 'center'); }
      // hull pips + decoy status (bottom centre, clear of the instruments)
      const by = INS.t + (H > W ? 112 : 80), cx = W / 2;
      ctx.fillStyle = 'rgba(12,23,32,.55)'; rr(cx - 104, by - 13, 208, 24, 8); ctx.fill();
      txt('機体', cx - 96, by + 4, '600 10px "IBM Plex Mono",monospace', '#a9bcc4');
      for (let i = 0; i < 3; i++) { ctx.fillStyle = i < A.hp ? (A.hp === 1 ? '#ff5a4f' : '#5fd7ff') : 'rgba(238,247,251,.18)'; ctx.fillRect(cx - 66 + i * 15, by - 5, 11, 9); }
      const rdy = A.flareCd <= 0; txt(rdy ? `DECOY ${Inp.touch ? '' : '[F] '}READY` : `DECOY ${A.flareCd.toFixed(1)}s`, cx + 98, by + 4, '600 10px "IBM Plex Mono",monospace', rdy ? '#5fdc9b' : '#a9bcc4', 'right');
    }
    if (A.combo > 1 && live) { const x = W - INS.r - 14, y = Math.max(H * 0.36, 170); txt('×' + Math.min(5, A.combo), x, y, '400 30px "Dela Gothic One",sans-serif', '#ffd23f', 'right'); txt('COMBO', x, y + 16, '600 10px "IBM Plex Mono",monospace', '#eef7fb', 'right');
      ctx.fillStyle = 'rgba(255,210,63,.8)'; ctx.fillRect(x - 46, y + 22, 46 * clamp(A.comboT / 7, 0, 1), 3); }
    if (A.banner) { const b = A.banner, k = clamp((2.2 - b.t) / 0.25, 0, 1), o = clamp(b.t / 0.4, 0, 1), y = H > W ? Math.max(H * 0.25, 168) : Math.max(H * 0.36, 128);
      ctx.globalAlpha = o; ctx.fillStyle = 'rgba(12,23,32,.7)'; ctx.fillRect(0, y - 26, W * k, 54); ctx.fillStyle = b.col; ctx.fillRect(0, y - 26, W * k, 3); ctx.fillRect(0, y + 25, W * k, 3);
      txt(b.big, W / 2 - (1 - k) * 80, y + 4, '400 24px "Dela Gothic One",sans-serif', b.col, 'center'); txt(b.sub, W / 2 + (1 - k) * 80, y + 21, '500 11px "Zen Kaku Gothic New",sans-serif', '#eef7fb', 'center'); ctx.globalAlpha = 1; }
    const db = $('decoyBtn'); if (db) { const showB = Inp.touch && mode === 'play' && mOn && live && !SIM.finalLeg(s); if (db.hidden === showB) db.hidden = !showB; const dis = A.flareCd > 0; if (db.disabled !== dis) db.disabled = dis; }
  }

  /* ---------------- hooks ---------------- */
  const _render = render;
  render = function (s, opt) { _render(s, opt); if (fighter(s)) { const now = performance.now(), dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now; if (mode === 'play') update(s, dt * (A.slow > 0 ? 0.35 : 1)); else { Mu.stop(); if (Mu.roar) Mu.roar.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.1); } draw(s); } else { Mu.stop(); if (Mu.roar && Snd.ctx) Mu.roar.gain.setTargetAtTime(0, Snd.ctx.currentTime, 0.1); const db = $('decoyBtn'); if (db && !db.hidden) db.hidden = true; } };
  const _hud = drawHUD;
  drawHUD = function (s, m) { _hud(s, m); if (fighter(s)) hud(s); };
  const _start = startStage;
  startStage = function (i) { _start(i); reset(); if (fighter(sim)) { Au.boom(); shake = 12; banner('SCRAMBLE', Save.d.opt.missile !== false ? 'アフターバーナー点火 · ミサイルに警戒' : 'アフターバーナー点火', '#5fd7ff'); } };
  const _ev = handleEvents;
  handleEvents = function (s) { if (fighter(s)) for (const e of s.events) { if (e.type === 'ring' && e.ok) { A.combo++; A.comboT = 7; A.maxCombo = Math.max(A.maxCombo, A.combo); Au.chime(A.combo); } else if (e.type === 'ring') A.combo = 0; } _ev(s); };
  window.AB = { ts: () => (A.slow > 0 ? 0.35 : 1), get state() { return A; }, decoy: () => { A.decoyQ = true; }, stats: () => ({ near: A.near, splash: A.splash, saves: A.saves, maxCombo: A.maxCombo, hp: A.hp }) };
  window.addEventListener('keydown', e => { if (mode === 'play' && !e.repeat && (e.code === 'KeyF' || e.code === 'KeyC')) A.decoyQ = true; });
  const db = $('decoyBtn'); if (db) db.addEventListener('pointerdown', e => { e.preventDefault(); A.decoyQ = true; });
  for (const [id, key] of [['optMissile', 'missile'], ['optMusic', 'music']]) { const el = $(id); if (!el) continue; el.checked = Save.d.opt[key] !== false; el.onchange = e => { Save.d.opt[key] = e.target.checked; Save.write(); }; }
})();
