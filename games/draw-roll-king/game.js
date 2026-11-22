/* DRAW & ROLL KING — game.js
 * 外部ライブラリなし。独自の2D剛体物理(固定タイムステップ / 逐次インパルス法)で動作。
 */
'use strict';
(() => {
  // ====================================================================
  // 定数
  // ====================================================================
  const DT = 1 / 120;            // 物理の固定タイムステップ
  const G = 620;                 // 重力 (world units / s^2)
  const WHEEL_R = 22;
  const WHEEL_M = 1.0;
  const DENSITY = 0.0007;
  const MOTOR_T = 24000;         // 1輪あたりの駆動トルク
  const MAX_W = 20;            // 車輪の最高角速度
  const BAL_ACC = 7;             // BALANCE の角加速度 (rad/s^2)
  const BAL_ACC_AIR = 22;        // 空中ではよく回る (1回転ジャンプ用)
  const BAL_MAXW = 4.5;          // BALANCE で到達できる最大角速度
  const BAL_MAXW_AIR = 10;
  const HEAVY = 15;              // これを超えると「おもすぎ」
  const ITER = 10;
  const EDIT_W = 260, EDIT_H = 170;  // 編集エリア (world units)
  const START_X = 200;
  const UNIT_PER_M = 20;
  const STORE_KEY = 'drawroll_v1';

  const COURSES = [
    { name: 'GREEN HILLS', goal: 6400, limit: 90, par: 16, sky: ['#8fd3ff', '#d9f3ff'], hill: '#7cc77a', ground: '#8b5a2b', grass: '#4caf50' },
    { name: 'BUMPY VALLEY', goal: 7400, limit: 100, par: 19.5, sky: ['#ffb37a', '#ffe2b8'], hill: '#c99a6b', ground: '#7a4a2a', grass: '#e0a93a' },
    { name: 'RAINBOW RIDGE', goal: 6600, limit: 120, par: 17.5, sky: ['#b49cff', '#ffd6f3'], hill: '#9b86e0', ground: '#5b3c8a', grass: '#ff7ab8' },
  ];

  const WHY = {
    wheels: { icon: '🛞', text: 'タイヤが ちかすぎる', fix: 'タイヤの あいだを ひろげよう', target: 'wheels' },
    cog: { icon: '🎯', text: 'まんなかが たかすぎる', fix: 'くるまを ひくく・ひらたく しよう', target: 'cog' },
    heavy: { icon: '🐘', text: 'くるまが おもすぎる', fix: 'くるまを ちいさく・ほそく しよう', target: 'body' },
    boost: { icon: '🔥', text: 'BOOSTが たりない', fix: 'のぼりざかで BOOSTを ながおし', target: null },
    balance: { icon: '🌀', text: 'ぐらぐらして たおれた', fix: '◀▶で むきを なおそう', target: 'wheels' },
    belly: { icon: '🪨', text: 'おなかが じめんに ついた', fix: 'タイヤを さげて うかせよう', target: 'wheels' },
  };


  // ====================================================================
  // DOM
  // ====================================================================
  const $ = (id) => document.getElementById(id);
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;

  // ====================================================================
  // 保存
  // ====================================================================
  const store = (() => {
    let d = { best: {}, played: false, mute: false };
    try { const s = JSON.parse(localStorage.getItem(STORE_KEY)); if (s) d = Object.assign(d, s); } catch (e) { /* ignore */ }
    return {
      d,
      save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } },
    };
  })();

  // ====================================================================
  // サウンド (WebAudio で合成。音声ファイル不要)
  // ====================================================================
  const Snd = {
    ac: null, master: null, on: !store.d.mute, eng: null, engG: null, whine: null, whineG: null, lastTick: 0,
    init() {
      if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = this.on ? 0.5 : 0;
        this.master.connect(this.ac.destination);
        this.eng = this.ac.createOscillator(); this.eng.type = 'sawtooth'; this.eng.frequency.value = 60;
        this.engG = this.ac.createGain(); this.engG.gain.value = 0;
        const lp = this.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
        this.eng.connect(lp); lp.connect(this.engG); this.engG.connect(this.master); this.eng.start();
        this.whine = this.ac.createOscillator(); this.whine.type = 'square'; this.whine.frequency.value = 600;
        this.whineG = this.ac.createGain(); this.whineG.gain.value = 0;
        this.whine.connect(this.whineG); this.whineG.connect(this.master); this.whine.start();
      } catch (e) { this.ac = null; }
    },
    setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.5 : 0; },
    tone(f, dur, type = 'square', vol = 0.2, f2 = null, delay = 0) {
      if (!this.ac || !this.on) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    },
    tick() { const n = performance.now(); if (n - this.lastTick > 45) { this.lastTick = n; this.tone(900 + Math.random() * 300, 0.03, 'triangle', 0.05); } },
    pop() { this.tone(300, 0.12, 'sine', 0.3, 900); },
    start() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, null, i * 0.08)); },
    goal() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'square', 0.14, null, i * 0.11)); },
    fail() { [392, 370, 349, 262].forEach((f, i) => this.tone(f, i === 3 ? 0.6 : 0.25, 'triangle', 0.22, i === 3 ? 200 : null, i * 0.26)); },
    boing() { this.tone(180, 0.35, 'sine', 0.3, 520); },
    whistle(up) { this.tone(up ? 500 : 1400, 0.4, 'sine', 0.15, up ? 1400 : 500); },
    snap() { this.tone(1200, 0.08, 'square', 0.2, 200); },
    engine(boost, wheelW, spin) {
      if (!this.ac) return;
      const t = this.ac.currentTime;
      this.engG.gain.setTargetAtTime(this.on ? (boost ? 0.18 : 0.04) : 0, t, 0.05);
      this.eng.frequency.setTargetAtTime(55 + Math.abs(wheelW) * 6, t, 0.05);
      this.whineG.gain.setTargetAtTime(this.on && spin ? 0.035 : 0, t, 0.05);
      this.whine.frequency.setTargetAtTime(500 + Math.abs(wheelW) * 25, t, 0.05);
    },
    silence() { if (!this.ac) return; const t = this.ac.currentTime; this.engG.gain.setTargetAtTime(0, t, 0.05); this.whineG.gain.setTargetAtTime(0, t, 0.05); },
  };

  // ====================================================================
  // 幾何ユーティリティ
  // ====================================================================
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }

  function pointInPoly(x, y, p) { // even-odd
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const a = p[i], b = p[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  }

  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t };
  }

  function distToPolyEdge(pt, p) {
    let best = Infinity, bp = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const q = closestOnSeg(pt.x, pt.y, a.x, a.y, b.x, b.y);
      const d = dist(pt, q);
      if (d < best) { best = d; bp = q; }
    }
    return { d: best, p: bp };
  }

  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    let maxD = 0, idx = 0;
    const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
      const q = closestOnSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
      const d = dist(pts[i], q);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps) {
      const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
      return l.slice(0, -1).concat(r);
    }
    return [a, b];
  }

  function segsIntersect(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }

  function hasSelfIntersection(p) {
    const n = p.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsIntersect(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
    }
    return false;
  }

  // 自由描画 → 閉じた輪郭(間引き・平滑化・単純化)
  function processStroke(raw) {
    if (raw.length < 6) return { ok: false, msg: 'もう少し長く描いてね' };
    let xs = raw.map((p) => p.x), ys = raw.map((p) => p.y);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    if (Math.max(bw, bh) < 40) return { ok: false, msg: 'もう少し大きく描いてね' };
    // 閉じる: 離れていれば直線で補間
    const pts = raw.slice();
    const gap = dist(pts[0], pts[pts.length - 1]);
    if (gap > 6) {
      const n = Math.ceil(gap / 6), a = pts[pts.length - 1], b = pts[0];
      for (let i = 1; i < n; i++) pts.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n });
    }
    // 等間隔に再サンプル
    const rs = [pts[0]];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1]; const b = pts[i];
      let seg = dist(a, b);
      while (acc + seg >= 6) {
        const t = (6 - acc) / seg;
        a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        rs.push(a); seg = dist(a, b); acc = 0;
      }
      acc += seg;
    }
    // 平滑化 (循環移動平均 2回)
    let sm = rs;
    for (let k = 0; k < 2; k++) {
      sm = sm.map((p, i) => {
        const a = sm[(i - 1 + sm.length) % sm.length], c = sm[(i + 1) % sm.length];
        return { x: (a.x + p.x * 2 + c.x) / 4, y: (a.y + p.y * 2 + c.y) / 4 };
      });
    }
    // 単純化 (頂点数 ≤ 48)
    let eps = 2.5, simp;
    do { simp = rdp(sm.concat([sm[0]]), eps).slice(0, -1); eps *= 1.4; } while (simp.length > 48);
    if (simp.length < 3) simp = convexHull(sm);
    // 編集エリア内に収める
    simp = simp.map((p) => ({ x: clamp(p.x, -20, EDIT_W + 20), y: clamp(p.y, -20, EDIT_H + 20) }));
    const selfX = hasSelfIntersection(simp);
    const mp = massProps(simp);
    if (!mp.ok) return { ok: false, msg: '線だけだと車にならないよ。囲んで描いてね' };
    return { ok: true, pts: mp.pts, selfX, corrected: mp.corrected };
  }

  // 面積・重心・慣性モーメント (ラスタ積分。自己交差は even-odd で扱う)
  function massProps(p) {
    const calc = (poly) => {
      const xs = poly.map((q) => q.x), ys = poly.map((q) => q.y);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const cell = Math.max(2.5, Math.sqrt(((x1 - x0) * (y1 - y0)) / 2500));
      let A = 0, sx = 0, sy = 0; const cells = [];
      for (let y = y0 + cell / 2; y < y1; y += cell) for (let x = x0 + cell / 2; x < x1; x += cell) {
        if (pointInPoly(x, y, poly)) { A += cell * cell; sx += x * cell * cell; sy += y * cell * cell; cells.push(x, y); }
      }
      if (A <= 0) return null;
      const cx = sx / A, cy = sy / A;
      let I = 0;
      for (let i = 0; i < cells.length; i += 2) { const dx = cells[i] - cx, dy = cells[i + 1] - cy; I += (dx * dx + dy * dy + cell * cell / 6) * cell * cell; }
      return { A, cx, cy, I };
    };
    let r = calc(p), pts = p, corrected = false;
    if (!r || r.A < 900) {
      const hull = convexHull(p);
      if (hull.length >= 3) { const r2 = calc(hull); if (r2 && r2.A >= 900) { r = r2; pts = hull; corrected = true; } }
    }
    if (!r || r.A < 900) return { ok: false };
    return { ok: true, pts, A: r.A, cx: r.cx, cy: r.cy, I: r.I, corrected };
  }

  function lowestBoundaryY(x, p) {
    let best = -Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
        const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
        best = Math.max(best, a.y + (b.y - a.y) * t);
      }
    }
    return best;
  }

  // タイヤが近すぎるか (エディタ警告と WHY? 診断で同じ基準を使う)
  function wheelsTooClose(pts, wheels) {
    if (!pts.length || wheels.length !== 2) return false;
    const xs = pts.map((q) => q.x), width = Math.max(...xs) - Math.min(...xs);
    return dist(wheels[0], wheels[1]) < Math.max(WHEEL_R * 2.3, width * 0.38);
  }

  function autoWheels(p) {
    const xs = p.map((q) => q.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), w = x1 - x0;
    let a, b;
    if (w < WHEEL_R * 4) { const c = (x0 + x1) / 2; a = c - WHEEL_R * 1.3; b = c + WHEEL_R * 1.3; } else { a = x0 + w * 0.18; b = x1 - w * 0.18; }
    return [a, b].map((x) => {
      let y = lowestBoundaryY(x, p);
      if (!isFinite(y)) y = Math.max(...p.map((q) => q.y));
      return validWheel({ x, y: y + 2 }, p);
    });
  }

  function validWheel(w, p) {
    if (pointInPoly(w.x, w.y, p)) return { x: w.x, y: w.y };
    const e = distToPolyEdge(w, p);
    if (e.d <= WHEEL_R * 1.3) return { x: w.x, y: w.y };
    const dx = w.x - e.p.x, dy = w.y - e.p.y, d = Math.hypot(dx, dy) || 1;
    return { x: e.p.x + dx / d * WHEEL_R * 1.25, y: e.p.y + dy / d * WHEEL_R * 1.25 };
  }

  // ====================================================================
  // テンプレート
  // ====================================================================
  const TEMPLATES = {
    basic() {
      const pts = [[25, 112], [25, 84], [62, 76], [92, 48], [168, 48], [196, 76], [234, 84], [236, 112]].map(([x, y]) => ({ x, y }));
      return { pts, wheels: [{ x: 68, y: 114 }, { x: 194, y: 114 }] };
    },
    banana() {
      const pts = [], cx = 130, cy = 10;
      for (let i = 0; i <= 14; i++) { const t = (25 + 130 * i / 14) * Math.PI / 180; pts.push({ x: cx + 128 * Math.cos(t), y: cy + 128 * Math.sin(t) }); }
      for (let i = 14; i >= 0; i--) { const t = (30 + 120 * i / 14) * Math.PI / 180; pts.push({ x: cx + 98 * Math.cos(t), y: cy + 98 * Math.sin(t) }); }
      return { pts, wheels: [{ x: 68, y: 128 }, { x: 192, y: 128 }] };
    },
    star() {
      const pts = [];
      for (let i = 0; i < 10; i++) { const t = (-90 + 36 * i) * Math.PI / 180, r = i % 2 ? 32 : 76; pts.push({ x: 130 + r * Math.cos(t), y: 88 + r * Math.sin(t) }); }
      return { pts, wheels: [{ x: 86, y: 145 }, { x: 174, y: 145 }] };
    },
  };

  // ====================================================================
  // コース生成 (高さマップ。穴あり)
  // ====================================================================
  function genCourse(id) {
    const c = COURSES[id];
    const dx = 20, x0 = -200, end = c.goal + 700;
    const pts = [], holes = [];
    // なめらかな山 (キッカー/尾根): at から len の区間で高さ h だけ盛り上がる
    const bump = (u, at, len, h) => (u > at && u < at + len ? -h * (1 - Math.cos((u - at) / len * Math.PI * 2)) / 2 : 0);
    // 片側だけ上がるキッカー (頂上でそのまま穴へ)
    const kicker = (u, at, len, h) => (u <= at ? 0 : u >= at + len ? -h : -h * ((u - at) / len) ** 2);
    // ジャンプ台: 上り(rise) → 頂上 → なめらかな下り(着地帯)。何もしなくても着地でき、空中で◀▶を使うと1回転できる
    // C1: 何もしなくても安全なゆるいジャンプ台 / C2: 空中で◀▶長押しすると1回転できるジャンプ台
    const JCFG = {
      0: { rise: 50, riseLen: 140, top: 10, drop: 220, dropLen: 480, land: 0, landLen: 400 },
      1: { rise: 45, riseLen: 150, top: 0, drop: 170, dropLen: 60, land: 200, landLen: 650 },
    };
    const J = Object.assign({}, JCFG[id] || JCFG[0], (typeof window !== 'undefined' && window.__jumpCfg && window.__jumpCfg[id]) || {});
    const jump = (u, at) => {
      if (u <= at) return 0;
      if (u <= at + J.riseLen) return -J.rise * ((u - at) / J.riseLen) ** 2;
      if (u <= at + J.riseLen + J.top) return -J.rise;
      const v = u - at - J.riseLen - J.top;
      if (v <= J.dropLen) return -J.rise + (J.rise + J.drop) * (1 - Math.cos(v / J.dropLen * Math.PI)) / 2;
      const w = v - J.dropLen;   // 着地帯: ゆるい下り坂で衝撃をやわらげる
      return J.drop + (J.land || 0) * (w < J.landLen ? (1 - Math.cos(w / J.landLen * Math.PI)) / 2 : 1);
    };
    const PITS = id === 1 ? [[2600, 170], [5400, 180]] : [];
    const hAt = (x) => {
      if (x < -150) return -420 + (x + 200) * 2;  // 左端の壁
      if (x < -120) return -320 + (x + 150) * 10;
      if (x <= 0) return 0;
      if (x <= 320) return x * 0.06;              // スタートはゆるい下り
      const xx = Math.min(x, c.goal + 150), uu = xx - 320, ramp = Math.min(1, uu / 300);
      let y = 19.2;
      if (id === 0) {
        y += uu * 0.055 + ramp * (20 * Math.sin(uu / 160) + 7 * Math.sin(uu / 53));
        y += 14 * Math.floor(uu / 450);                       // 小さな下り段差
        for (const at of [1200, 2500, 3900, 5200]) y += bump(uu, at, 90, 22); // 小さな上り段差
        y += jump(uu, 3000);                                                   // 1回転ジャンプ台
      } else if (id === 1) {
        y += uu * 0.035 + ramp * (36 * Math.sin(uu / 170) + 10 * Math.sin(uu / 60));
        for (const at of [900, 1500, 2900, 6200, 6800]) y += bump(uu, at, 240, 30); // 小ジャンプ
        y += jump(uu, 3400);                                                   // 1回転ジャンプ台
        for (const [px, w] of PITS) { y += kicker(uu, px - 320 - 260, 260, 55); if (uu > px - 320 + w) y += 55 + 40; }
      } else {
        y += -uu * 0.1 + ramp * (85 * Math.sin(uu / 300) + 10 * Math.sin(uu / 70));
        y += 0.17 * Math.min(uu, 520);                                         // 最初は下り坂で温存を覚える
        for (const at of [1800, 3600, 5200]) y += bump(uu, at, 560, 95);   // 急な尾根
      }
      return y;
    };
    for (let x = x0; x <= end; x += dx) pts.push({ x, y: hAt(x) });
    for (let i = 0; i < pts.length - 1; i++) {
      const x = pts[i].x;
      holes.push(PITS.some(([px, w]) => x >= px && x < px + w));
    }
    let maxY = -Infinity; for (const p of pts) maxY = Math.max(maxY, p.y);
    return { id, ...c, pts, holes, dx, x0, maxY };
  }

  function groundSeg(course, x) {
    const i = Math.floor((x - course.x0) / course.dx);
    if (i < 0 || i >= course.pts.length - 1) return null;
    return { i, a: course.pts[i], b: course.pts[i + 1], hole: course.holes[i] };
  }

  // ====================================================================
  // 物理
  // ====================================================================
  function makeBody(m, I) {
    return { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, m, I, im: 1 / m, iI: 1 / I };
  }

  function buildMachine(design) {
    const mp = massProps(design.pts);
    const local = mp.pts.map((p) => ({ x: p.x - mp.cx, y: p.y - mp.cy }));
    // 衝突判定用の点: 頂点 + 辺の分割点
    const cps = [];
    for (let i = 0; i < local.length; i++) {
      const a = local[i], b = local[(i + 1) % local.length];
      const n = Math.max(1, Math.ceil(dist(a, b) / 14));
      for (let k = 0; k < n; k++) cps.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    const mass = Math.max(2, mp.A * DENSITY);
    const I = Math.max(50, mp.I * DENSITY);
    const wheels = design.wheels.map((w) => ({ x: w.x - mp.cx, y: w.y - mp.cy }));
    const xs = local.map((p) => p.x), ys = local.map((p) => p.y);
    const bbox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    // 目の位置 (車体内部を探す)
    let eye = { x: (bbox.x1) * 0.35, y: bbox.y0 * 0.35 };
    if (!pointInPoly(eye.x, eye.y, local)) eye = pointInPoly(0, 0, local) ? { x: 0, y: 0 } : { x: local[0].x * 0.5, y: local[0].y * 0.5 };
    const wheelbase = dist(wheels[0], wheels[1]);
    const axleY = (wheels[0].y + wheels[1].y) / 2;
    return {
      local, cps, mass, I, wheels, bbox, eye, wheelbase,
      cogRatio: axleY / Math.max(1, wheelbase / 2),   // 重心が車軸よりどれだけ高いか
      totalMass: mass + WHEEL_M * 2,
      width: bbox.x1 - bbox.x0,
      source: design.source,
      verts: local.length,
    };
  }

  function makeSim(machine, course) {
    const ch = makeBody(machine.mass, machine.I);
    const wheels = machine.wheels.map((lw) => {
      const b = makeBody(WHEEL_M, 0.5 * WHEEL_M * WHEEL_R * WHEEL_R);
      b.lx = lw.x; b.ly = lw.y; b.attached = true; b.contact = false;
      return b;
    });
    const bottom = Math.max(machine.bbox.y1, ...machine.wheels.map((w) => w.y + WHEEL_R));
    ch.x = START_X; ch.y = -bottom - 6;
    for (const w of wheels) { w.x = ch.x + w.lx; w.y = ch.y + w.ly; }
    return {
      machine, course, ch, wheels, t: 0, energy: 100, boostTime: 0,
      bestX: ch.x, stuckT: 0, flips: 0, unwrapped: 0, flipRef: 0, lastA: 0,
      airT: 0, airRot: 0, inAir: false, stabSum: 0, stabN: 0, chContacts: 0,
      ended: false, result: null, wob: 0, eyeState: 'normal', balTime: 0, balHold: 0, balDir: 0, stunts: 0, emptyAt: [], empty: false, nudgeT: 0, spinT: 0, upsideT: 0, slowT: 0,
      broke: false, takeoffSpeed: 0, events: [],
    };
  }

  function wheelContact(course, w) {
    const r = WHEEL_R;
    const i0 = Math.floor((w.x - r - course.x0) / course.dx), i1 = Math.floor((w.x + r - course.x0) / course.dx);
    let best = null;
    for (let i = Math.max(0, i0); i <= Math.min(course.pts.length - 2, i1); i++) {
      if (course.holes[i]) continue;
      const a = course.pts[i], b = course.pts[i + 1];
      const q = closestOnSeg(w.x, w.y, a.x, a.y, b.x, b.y);
      const dx = w.x - q.x, dy = w.y - q.y, d = Math.hypot(dx, dy);
      if (d >= r || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d;
      if (ny > 0.35) continue; // 地面の下側からは押さない
      const pen = r - d;
      if (!best || pen > best.pen) best = { px: q.x, py: q.y, nx, ny, pen };
    }
    return best;
  }

  function addContact(list, b, px, py, nx, ny, pen, mu) {
    const rx = px - b.x, ry = py - b.y;
    const rn = rx * ny - ry * nx;
    const tx = -ny, ty = nx, rt = rx * ty - ry * tx;
    const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
    const vn = vx * nx + vy * ny;
    list.push({
      b, rx, ry, nx, ny, tx, ty, mu, jn: 0, jt: 0,
      kn: 1 / (b.im + b.iI * rn * rn), kt: 1 / (b.im + b.iI * rt * rt),
      bias: 0.25 / DT * Math.max(0, pen - 0.5) + (vn < -120 ? -0.15 * vn : 0),
      vn0: vn,
    });
  }

  function solveContact(c) {
    const b = c.b;
    let vx = b.vx - b.w * c.ry, vy = b.vy + b.w * c.rx;
    const vn = vx * c.nx + vy * c.ny;
    let dj = c.kn * (-vn + c.bias);
    const jn0 = c.jn; c.jn = Math.max(0, jn0 + dj); dj = c.jn - jn0;
    applyImp(b, c.nx * dj, c.ny * dj, c.rx, c.ry);
    vx = b.vx - b.w * c.ry; vy = b.vy + b.w * c.rx;
    const vt = vx * c.tx + vy * c.ty;
    let dt = c.kt * -vt;
    const maxF = c.mu * c.jn, jt0 = c.jt;
    c.jt = clamp(jt0 + dt, -maxF, maxF); dt = c.jt - jt0;
    applyImp(b, c.tx * dt, c.ty * dt, c.rx, c.ry);
  }

  function applyImp(b, px, py, rx, ry) {
    b.vx += px * b.im; b.vy += py * b.im; b.w += b.iI * (rx * py - ry * px);
  }

  function step(sim, input) {
    const { ch, wheels, course } = sim;
    const att = wheels.filter((w) => w.attached);
    // 外力
    ch.vy += G * DT;
    for (const w of wheels) w.vy += G * DT;
    // BOOST (反トルクを車体へ → ウィリーなど自然な挙動)
    if (sim.empty && sim.energy >= 20) sim.empty = false;   // 20%まで回復したら「切れ」状態を解除
    const boosting = input.boost && sim.energy > 0 && !sim.ended;
    if (boosting) {
      for (const w of att) {
        if (w.w < MAX_W) { const T = MOTOR_T * DT; w.w += T * w.iI; ch.w -= T * ch.iI; }
      }
      const before = sim.energy;
      sim.energy = Math.max(0, sim.energy - 16 * DT);
      if (before > 0 && sim.energy === 0 && !sim.empty) { sim.emptyAt.push(ch.x); sim.empty = true; }
      sim.boostTime += DT;
    } else {
      sim.energy = Math.min(100, sim.energy + 18 * DT);
    }
    // BALANCE (限定的な回転トルク)
    if (input.bal && !sim.ended) {
      const dir = input.bal;
      // 空中で長押しするほど強く回る (短いタップは微調整、長押しは1回転スピン)
      sim.balHold = sim.balDir === dir ? sim.balHold + DT : 0; sim.balDir = dir; sim.balTime += DT;
      const air = !sim.wheels.some((w) => w.contact) && sim.chContacts === 0;
      const k = air ? clamp((sim.balHold - 0.2) / 0.3, 0, 1) : 0;
      const acc = BAL_ACC + (BAL_ACC_AIR - BAL_ACC) * k, maxW = BAL_MAXW + (BAL_MAXW_AIR - BAL_MAXW) * k;
      if (ch.w * dir < maxW) ch.w += dir * acc * DT;
    } else { sim.balHold = 0; sim.balDir = 0;
    }
    // 接触
    const contacts = [];
    let chC = 0;
    for (const w of wheels) {
      const c = wheelContact(course, w);
      w.contact = !!c;
      if (c) addContact(contacts, w, c.px, c.py, c.nx, c.ny, c.pen, 1.1);
    }
    const ca = Math.cos(ch.a), sa = Math.sin(ch.a);
    for (const lp of sim.machine.cps) {
      const px = ch.x + lp.x * ca - lp.y * sa, py = ch.y + lp.x * sa + lp.y * ca;
      const g = groundSeg(course, px);
      if (!g || g.hole) continue;
      const s = (g.b.y - g.a.y) / (g.b.x - g.a.x);
      const gy = g.a.y + (px - g.a.x) * s;
      if (py > gy && py - gy < 45) {
        const inv = 1 / Math.sqrt(1 + s * s);
        addContact(contacts, ch, px, py, s * inv, -inv, (py - gy) * inv, 0.55);
        chC++;
      }
    }
    sim.chContacts = chC;
    // ジョイント前計算
    const joints = att.map((w) => {
      const rx = w.lx * ca - w.ly * sa, ry = w.lx * sa + w.ly * ca;
      const mA = ch.im, mB = w.im, iA = ch.iI;
      const k11 = mA + mB + iA * ry * ry, k12 = -iA * rx * ry, k22 = mA + mB + iA * rx * rx;
      const det = k11 * k22 - k12 * k12;
      return {
        w, rx, ry, i11: k22 / det, i12: -k12 / det, i22: k11 / det,
        cx: w.x - (ch.x + rx), cy: w.y - (ch.y + ry), sx: 0, sy: 0,
      };
    });
    // 逐次インパルス
    for (let it = 0; it < ITER; it++) {
      for (const j of joints) {
        const w = j.w;
        const cdx = w.vx - (ch.vx - ch.w * j.ry), cdy = w.vy - (ch.vy + ch.w * j.rx);
        const bx = cdx + 0.2 / DT * j.cx, by = cdy + 0.2 / DT * j.cy;
        const ix = -(j.i11 * bx + j.i12 * by), iy = -(j.i12 * bx + j.i22 * by);
        w.vx += ix * w.im; w.vy += iy * w.im;
        applyImp(ch, -ix, -iy, j.rx, j.ry);
        j.sx += ix; j.sy += iy;
      }
      for (const c of contacts) solveContact(c);
    }
    // 着地の衝撃
    let impact = 0;
    for (const c of contacts) impact += c.jn;
    const impactF = impact / DT / (sim.machine.totalMass * G);
    if (impactF > 9) { sim.wob = Math.min(0.2, sim.wob + impactF * 0.004); }
    // ジョイント破断 (非常に大きな衝撃のみ)
    for (const j of joints) {
      const f = Math.hypot(j.sx, j.sy) / DT;
      if (f > sim.machine.totalMass * G * 110) {
        j.w.attached = false; sim.broke = true; sim.events.push('broke');
      }
    }
    // 積分
    for (const b of [ch, ...wheels]) {
      b.x += b.vx * DT; b.y += b.vy * DT; b.a += b.w * DT;
      b.w *= 0.9995;
    }
    sim.t += DT;
    return { boosting, impactF, contacts: contacts.length };
  }

  // ====================================================================
  // 状態
  // ====================================================================
  const S = {
    mode: 'edit',          // edit | race | result
    tool: 'draw',
    course: 0,
    design: null,          // { pts, wheels, source }
    history: [],
    stroke: null,
    dragWheel: -1,
    dragVert: null,
    nudgeOn: false,
    fixHint: null,
    sim: null,
    machine: null,
    courseData: null,
    input: { boost: false, left: false, right: false },
    cam: { x: START_X, y: 0, s: 1 },
    particles: [],
    bubbles: [],
    lastResult: null,
    acc: 0,
    lastT: 0,
    toastT: null,
  };
  const courseCache = {};
  const getCourse = (id) => courseCache[id] || (courseCache[id] = genCourse(id));

  function loadTemplate(name, pushHist = true) {
    if (pushHist) pushHistory();
    const t = TEMPLATES[name]();
    S.design = { pts: t.pts, wheels: t.wheels, source: 'template:' + name };
    S.fixHint = null;
  }

  function pushHistory() {
    S.history.push(JSON.stringify(S.design));
    if (S.history.length > 40) S.history.shift();
  }

  // ====================================================================
  // UI
  // ====================================================================
  function toast(msg, ms = 1800) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(S.toastT); S.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  function setTool(tool) {
    S.tool = tool;
    $('btnDraw').classList.toggle('active', tool === 'draw');
    $('btnWheel').classList.toggle('active', tool === 'wheel');
    $('btnShape').classList.toggle('active', tool === 'shape');
  }

  function setCourse(id) {
    S.course = id;
    document.querySelectorAll('#courseRow .chip').forEach((b) => b.classList.toggle('active', +b.dataset.course === id));
    updateHud();
  }

  function fmtBest(id) {
    const b = store.d.best[id];
    if (!b) return '--';
    return b.time ? b.time.toFixed(1) + 's' : Math.round(b.dist) + 'm';
  }

  function updateHud() {
    const c = COURSES[S.course];
    $('hudCourse').textContent = c.name;
    $('hudBest').textContent = fmtBest(S.course);
    if (S.sim) {
      $('hudDist').textContent = Math.max(0, Math.round((S.sim.ch.x - START_X) / UNIT_PER_M)) + 'm';
      $('hudTime').textContent = S.sim.t.toFixed(1);
    } else {
      $('hudDist').textContent = '0m'; $('hudTime').textContent = '0.0';
    }
  }

  function showMode(mode) {
    S.mode = mode;
    $('editBar').classList.toggle('hidden', mode !== 'edit');
    $('raceBar').classList.toggle('hidden', mode === 'edit');
    $('result').classList.toggle('hidden', mode !== 'result');
    resize();
  }

  function enterEdit(keep = true) {
    Snd.silence();
    if (!keep) { pushHistory(); S.design = { pts: [], wheels: [], source: 'draw' }; S.fixHint = null; }
    S.sim = null; S.particles = []; S.bubbles = [];
    $('sharePanel').classList.add('hidden');
    // WHY? の原因に合わせて、直すためのツールを選んでおく
    setTool(keep && (S.fixHint === 'cog' || S.fixHint === 'body') ? 'shape' : keep && S.fixHint === 'wheels' ? 'wheel' : 'draw');
    showMode('edit');
    updateHud();
  }

  function startRace() {
    Snd.init();
    const d = S.design;
    if (!d || d.pts.length < 3) { toast('まず車体を描くか、テンプレートを選んでね'); return; }
    if (d.wheels.length !== 2) d.wheels = autoWheels(d.pts);
    // START 前に車輪の接続を検証
    d.wheels = d.wheels.map((w) => validWheel(w, d.pts));
    if (dist(d.wheels[0], d.wheels[1]) < WHEEL_R * 2) { d.wheels = autoWheels(d.pts); toast('タイヤが重なっていたので置き直したよ'); }
    S.machine = buildMachine(d);
    S.courseData = getCourse(S.course);
    S.sim = makeSim(S.machine, S.courseData);
    S.particles = []; S.bubbles = [];
    $('sharePanel').classList.add('hidden');
    S.cam.x = S.sim.ch.x; S.cam.y = S.sim.ch.y;
    S.acc = 0;
    S.input.boost = S.input.left = S.input.right = false;
    document.querySelectorAll('.btn.pressed').forEach((b) => b.classList.remove('pressed'));
    S.nudgeOn = false; $('btnBoost').classList.remove('nudge');
    showMode('race');
    Snd.start();
  }

  // ====================================================================
  // 走行の進行・判定
  // ====================================================================
  function bubble(text) {
    const last = S.bubbles[S.bubbles.length - 1];
    if (last && S.sim.t - last.t0 < 2.2) return;
    S.bubbles.push({ text, t0: S.sim.t, life: 2.4 });
  }

  function groundAngleAt(course, x) {
    const g = groundSeg(course, x);
    return g ? Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) : 0;
  }

  function updateRace(sim) {
    const inp = S.input;
    const bal = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const r = step(sim, { boost: inp.boost, bal });
    const ch = sim.ch;
    if (!isFinite(ch.x) || !isFinite(ch.y) || !isFinite(ch.a)) { endRace(false, 'stuck'); return r; }

    // 回転回数
    let da = ch.a - sim.lastA; sim.lastA = ch.a; sim.unwrapped += da;
    if (Math.abs(sim.unwrapped - sim.flipRef) >= Math.PI * 2) {
      const dir = Math.sign(sim.unwrapped - sim.flipRef);
      sim.flipRef += dir * Math.PI * 2; sim.flips++; Snd.whistle(dir > 0);
    }
    // 空中
    const anyContact = r.contacts > 0;
    if (!anyContact) {
      if (!sim.inAir) { sim.inAir = true; sim.airT = 0; sim.airRot = 0; sim.takeoffSpeed = Math.hypot(ch.vx, ch.vy); }
      sim.airT += DT; sim.airRot += da;
    } else if (sim.inAir) {
      sim.inAir = false;
      const gaL = groundAngleAt(sim.course, ch.x);
      const upright = Math.cos(ch.a - gaL) > 0.5;
      if (Math.abs(sim.airRot) > Math.PI * 1.75 && upright) {
        sim.stunts++; sim.energy = Math.min(100, sim.energy + 30);
        S.bubbles = []; bubble(sim.stunts > 1 ? 'また回った! エネルギー+30' : '1回転ジャンプ成功! エネルギー+30');
        Snd.goal(); miniConfetti();
      } else if (Math.abs(sim.airRot) > Math.PI * 2) bubble('回りすぎて目が回った!');
      else if (sim.airT > 1.0) bubble('今、飛んだよね?');
      if (r.impactF > 14) { Snd.boing(); if (sim.airT > 0.5) bubble('ぼよーん!'); }
    }
    // 安定性 (車体角と地面角の差)
    const ga = groundAngleAt(sim.course, ch.x);
    let diff = Math.abs(((ch.a - ga + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    sim.stabSum += diff; sim.stabN++;
    // 逆さま・空回り
    const upside = Math.cos(ch.a) < -0.3;
    sim.upsideT = upside ? sim.upsideT + DT : 0;
    if (sim.upsideT > 1.2 && Math.hypot(ch.vx, ch.vy) < 40) bubble('逆さまでも走れると思った');
    const att = sim.wheels.filter((w) => w.attached);
    const avgW = att.length ? att.reduce((s, w) => s + w.w, 0) / att.length : 0;
    const spinning = r.boosting && Math.abs(avgW) > 15 && Math.abs(ch.vx) < 40;
    sim.spinT = spinning ? sim.spinT + DT : Math.max(0, sim.spinT - DT);
    if (sim.spinT > 1.0) bubble('タイヤだけ元気');
    if (inp.boost && Math.abs(ch.vx) < 25 && !upside) sim.slowT += DT; else sim.slowT = Math.max(0, sim.slowT - DT * 2);
    if (sim.slowT > 3) bubble('カタツムリに抜かれた');
    if (sim.events.includes('broke')) { sim.events = []; Snd.snap(); bubble('タイヤは旅に出た'); }
    Snd.engine(r.boosting, avgW, !att.some((w) => w.contact) && Math.abs(avgW) > 10 || spinning);
    sim.wob *= 0.96;
    const stalling = !inp.boost && Math.abs(ch.vx) < 50 && sim.energy > 20 && sim.t > 0.8 && !upside;
    sim.nudgeT = stalling ? sim.nudgeT + DT : 0;

    // 判定
    if (ch.x >= sim.course.goal) { endRace(true, 'goal'); return r; }
    const gsNow = groundSeg(sim.course, ch.x);
    const inPit = gsNow && gsNow.hole && ch.y > Math.max(gsNow.a.y, gsNow.b.y) + 70;
    if (inPit || ch.y > sim.course.maxY + 500 || ch.x < -260) { endRace(false, 'out'); return r; }
    if (ch.x > sim.bestX + 8) { sim.bestX = ch.x; sim.stuckT = 0; } else sim.stuckT += DT;
    if (sim.stuckT > (sim.boostTime < 0.3 ? 10 : 5)) { endRace(false, 'stuck'); return r; }
    if (sim.t > sim.course.limit) { endRace(false, 'timeout'); return r; }
    return r;
  }

  function diagnose(sim, reason) {
    const m = sim.machine, ch = sim.ch;
    const tooClose = m.wheelbase < Math.max(WHEEL_R * 2.3, m.width * 0.38);
    const cogHigh = m.cogRatio > 0.85;
    const heavy = m.totalMass > HEAVY;
    const ga = groundAngleAt(sim.course, ch.x);
    const rel = Math.abs(Math.atan2(Math.sin(ch.a - ga), Math.cos(ch.a - ga)));
    const tipped = rel > 1.0 || sim.upsideT > 0.5;      // 横倒し・逆さま
    const boostFrac = sim.boostTime / Math.max(1, sim.t);
    if (sim.broke && heavy) return 'heavy';
    if (tipped || (sim.flips > 0 && reason === 'stuck')) {
      if (tooClose) return 'wheels';
      if (cogHigh) return 'cog';
      return 'balance';
    }
    if (reason === 'out') {
      if (sim.flips > 0) return tooClose ? 'wheels' : 'balance';
      if (heavy) return 'heavy';
      if (sim.takeoffSpeed < 300) return 'boost';
      return 'balance';
    }
    if (reason === 'stuck') {
      if (sim.chContacts > 0 && (sim.spinT > 0.3 || !sim.wheels.some((w) => w.contact))) return 'belly';
      if (heavy) return 'heavy';
      return 'boost';
    }
    // timeout
    if (heavy) return 'heavy';
    return boostFrac < 0.35 ? 'boost' : 'balance';
  }

  function endRace(goal, reason) {
    const sim = S.sim;
    if (sim.ended) return;
    sim.ended = true;
    Snd.silence();
    const m = sim.machine;
    const dist = Math.max(0, (Math.min(sim.bestX, sim.course.goal) - START_X) / UNIT_PER_M);
    const stability = Math.round(clamp(100 - (sim.stabSum / Math.max(1, sim.stabN)) * 180 / Math.PI * 1.6, 0, 100));
    const res = { goal, reason, time: sim.t, dist, stability, flips: sim.flips, stunts: sim.stunts, course: S.course, titles: [], why: null };
    // 称号
    const total = (sim.course.goal - START_X) / UNIT_PER_M;
    if (goal && sim.t <= sim.course.par) res.titles.push({ t: 'SPEED KING' });
    if (goal && sim.flips === 0 && stability >= 90 && sim.balTime >= 1 && !sim.broke) res.titles.push({ t: 'BALANCE MASTER' });
    if (m.source === 'draw' && (goal || dist > total * 0.5)) res.titles.push({ t: 'CREATIVE BUILDER' });
    if (sim.stunts >= 1 || sim.flips >= 2) res.titles.push({ t: 'ROLLING STAR' });
    if (!goal && sim.flips >= 3) res.titles.push({ t: 'ただの転がる岩', silly: true });
    if (!goal && Math.cos(sim.ch.a) < -0.3) res.titles.push({ t: '逆さま職人', silly: true });
    if (!goal && sim.spinT > 0.5) res.titles.push({ t: 'タイヤだけ元気', silly: true });
    if (reason === 'timeout') res.titles.push({ t: 'カタツムリ級', silly: true });
    if (sim.broke) res.titles.push({ t: 'タイヤ旅立ち', silly: true });
    if (!res.titles.length) res.titles.push(goal ? { t: '完走ドライバー' } : { t: '見習い発明家', silly: true });
    // WHY?
    if (!goal) { res.why = diagnose(sim, reason); S.fixHint = WHY[res.why].target; } else S.fixHint = null;
    if (res.why === 'boost') {
      if (sim.boostTime < 0.3) res.whyFix = 'BOOSTを ながおしすると すすむよ';
      else if (sim.emptyAt.length && sim.energy < 35) res.whyFix = '⚡で でんちぎれ。くだりざかでは はなして ためよう';
      else res.whyFix = 'でんちは のこってたよ。のぼりざかで ながおし';
    }
    // 記録
    const b = store.d.best[S.course] || {};
    let newBest = false;
    if (goal) { if (!b.time || sim.t < b.time) { b.time = sim.t; newBest = true; } }
    if (!b.dist || dist > b.dist) { b.dist = dist; if (!goal && !b.time) newBest = true; }
    store.d.best[S.course] = b;
    const firstRun = !store.d.played;
    store.d.played = true;
    store.save();
    res.newBest = newBest; res.firstRun = firstRun;
    S.lastResult = res;
    sim.eyeState = goal ? 'happy' : 'dizzy';
    if (goal) { Snd.goal(); confetti(); } else { Snd.fail(); sim.wob = 0.2; }
    if (!goal) {
      const msg = { out: 'あ〜れ〜…', stuck: 'もう動けない…', timeout: '時間切れ〜' }[reason];
      S.bubbles = []; S.bubbles.push({ text: msg, t0: sim.t, life: 3 });
    }
    setTimeout(() => showResult(res, sim), goal ? 1300 : 1100);
  }

  function showResult(res, sim) {
    if (!S.sim || S.sim !== sim || S.sim.result || S.mode !== 'race') return;
    S.sim.result = res;
    $('resHead').textContent = res.goal ? 'GOAL!' : { out: 'コースアウト!', stuck: 'ストップ!', timeout: 'タイムアップ!' }[res.reason];
    $('resHead').classList.toggle('goal', res.goal);
    $('resTitles').innerHTML = res.titles.map((x) => `<span class="${x.silly ? 'silly' : ''}">${x.t}</span>`).join('');
    if (res.why) {
      const w = WHY[res.why];
      $('whyIcon').textContent = w.icon; $('whyText').textContent = w.text; $('whyFix').textContent = res.whyFix || w.fix;
      $('resWhy').classList.remove('hidden');
    } else $('resWhy').classList.add('hidden');
    drawResMap(sim, res);
    $('resTime').textContent = res.goal ? res.time.toFixed(1) + 's' : '-';
    $('resDist').textContent = Math.round(res.dist) + 'm';
    $('resStab').textContent = res.stability;
    $('resRot').textContent = res.flips;
    $('resBest').textContent = (res.newBest ? '🎉 NEW BEST! ' : '') + 'BEST: ' + fmtBest(res.course);
    $('resHint').classList.toggle('hidden', !res.firstRun);
    $('resHint').textContent = 'ヒント: BOOST(Space)を ながおしで かそく。◀▶(←→)で むきを なおせるよ。ジャンプで くるっと 1かいてんも!';
    $('btnNext').classList.toggle('hidden', !(res.goal && res.course < 2));
    showMode('result');
    updateHud();
  }

  // 結果画面のミニマップ: コースの断面、到達点、BOOST切れ地点
  function drawResMap(sim, res) {
    const c = $('resMap'), r = c.getBoundingClientRect();
    const w = Math.max(200, r.width || 300), h = 64, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    const course = sim.course, x0 = START_X - 100, x1 = course.goal + 100;
    const samples = [];
    for (let wx = x0; wx <= x1; wx += 40) { const g = groundSeg(course, wx); samples.push({ wx, y: g ? g.a.y : 0, hole: g && g.hole }); }
    const ys = samples.map((q) => q.y), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const sx = (wx) => 6 + (wx - x0) / (x1 - x0) * (w - 12);
    const sy = (y) => 12 + (y - yMin) / Math.max(1, yMax - yMin) * (h - 26);
    x.beginPath(); x.moveTo(sx(x0), h);
    for (const q of samples) x.lineTo(sx(q.wx), q.hole ? h : sy(q.y));
    x.lineTo(sx(x1), h); x.closePath(); x.fillStyle = course.ground; x.globalAlpha = 0.35; x.fill(); x.globalAlpha = 1;
    // 走った区間
    const reach = Math.min(sim.bestX, course.goal);
    x.beginPath(); let first = true;
    for (const q of samples) { if (q.wx > reach) break; if (q.hole) { first = true; continue; } first ? x.moveTo(sx(q.wx), sy(q.y)) : x.lineTo(sx(q.wx), sy(q.y)); first = false; }
    x.strokeStyle = '#e2508a'; x.lineWidth = 3; x.stroke();
    // ゴール旗
    x.font = '700 12px system-ui, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#2b2560';
    const gseg = groundSeg(course, course.goal); x.fillText('🏁', sx(course.goal), sy(gseg ? gseg.a.y : 0) - 2);
    // BOOST切れ地点
    for (const ex of sim.emptyAt) { const g = groundSeg(course, ex); if (g) x.fillText('⚡', sx(ex), sy(g.a.y) - 2); }
    // 到達点
    if (!res.goal) { const g = groundSeg(course, reach); x.font = '900 14px system-ui, sans-serif'; x.fillStyle = '#d61f5e'; x.fillText('✕', sx(reach), sy(g ? g.a.y : 0) + 5); }
    $('resMapNote').textContent = (res.goal ? '🏁 ゴール!' : '✕ とまった ところ') + (sim.emptyAt.length ? ' / ⚡ でんちぎれ ' + sim.emptyAt.length + 'かい' : ' / でんちぎれ なし') + (sim.stunts ? ' / 🌀 1かいてん ' + sim.stunts + 'かい' : '');
  }

  // ====================================================================
  // 演出
  // ====================================================================
  function miniConfetti() {
    const ch = S.sim.ch, cols = ['#ff5c8a', '#ffd84a', '#5cd6ff', '#7cff8a'];
    for (let i = 0; i < 40; i++) S.particles.push({ x: ch.x, y: ch.y - 40, vx: (Math.random() - 0.5) * 360, vy: -Math.random() * 360, a: 0, va: (Math.random() - 0.5) * 14, c: cols[i % 4], life: 1.6 });
  }

  function confetti() {
    const ch = S.sim.ch;
    const cols = ['#ff5c8a', '#ffd84a', '#5cd6ff', '#7cff8a', '#b38cff'];
    for (let i = 0; i < 140; i++) {
      S.particles.push({ x: ch.x + (Math.random() - 0.5) * 200, y: ch.y - 150 - Math.random() * 150, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, a: Math.random() * 6, va: (Math.random() - 0.5) * 12, c: cols[i % cols.length], life: 3 + Math.random() });
    }
  }

  // ====================================================================
  // 描画
  // ====================================================================
  function resize() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }

  function editView() {
    const pad = 28;
    const s = Math.min((W - pad * 2) / (EDIT_W + 60), (H - pad * 2 - 30) / (EDIT_H + 70));
    const ox = (W - EDIT_W * s) / 2, oy = (H - EDIT_H * s) / 2 - 6;
    return { s, ox, oy };
  }
  const toEdit = (sx, sy) => { const v = editView(); return { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s }; };

  function drawMachineShape(c, pts, wheels, opts = {}) {
    // pts/wheels はすでにローカル座標系 (c の変換済み)
    if (pts.length >= 3) {
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
      c.closePath();
      c.fillStyle = opts.fill || '#ffb627'; c.fill('evenodd');
      c.lineWidth = opts.lw || 3; c.strokeStyle = '#3a2a10'; c.lineJoin = 'round'; c.stroke();
    }
    for (const w of wheels) drawWheel(c, w.x, w.y, w.a || 0, opts.lw);
  }

  function drawWheel(c, x, y, a, lw = 3) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath(); c.arc(0, 0, WHEEL_R, 0, Math.PI * 2); c.fillStyle = '#2d2d3a'; c.fill();
    c.lineWidth = lw; c.strokeStyle = '#111'; c.stroke();
    c.beginPath(); c.arc(0, 0, WHEEL_R * 0.55, 0, Math.PI * 2); c.fillStyle = '#c9c9d6'; c.fill();
    c.strokeStyle = '#555'; c.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) { const t = k * Math.PI * 2 / 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(t) * WHEEL_R * 0.55, Math.sin(t) * WHEEL_R * 0.55); c.stroke(); }
    c.restore();
  }

  function drawEdit(t) {
    const v = editView();
    ctx.fillStyle = '#efeaff'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(v.ox, v.oy); ctx.scale(v.s, v.s);
    // グリッド
    ctx.strokeStyle = 'rgba(80,60,160,.12)'; ctx.lineWidth = 1 / v.s;
    for (let x = -40; x <= EDIT_W + 40; x += 20) { ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, EDIT_H + 50); ctx.stroke(); }
    for (let y = -30; y <= EDIT_H + 50; y += 20) { ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(EDIT_W + 40, y); ctx.stroke(); }
    ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(80,60,160,.45)'; ctx.lineWidth = 2 / v.s;
    ctx.strokeRect(0, 0, EDIT_W, EDIT_H); ctx.setLineDash([]);
    // 地面の目安
    ctx.fillStyle = 'rgba(76,175,80,.25)'; ctx.fillRect(-40, EDIT_H + 30, EDIT_W + 80, 8);

    const d = S.design;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    if (d && d.pts.length >= 3) {
      if (S.fixHint === 'body') { ctx.save(); ctx.shadowColor = '#ff2d6f'; ctx.shadowBlur = 20 * pulse; }
      drawMachineShape(ctx, d.pts, [], { lw: 3 / Math.max(0.6, v.s) });
      if (S.fixHint === 'body') ctx.restore();
      if (S.tool === 'shape') {
        for (const q of d.pts) {
          ctx.beginPath(); ctx.arc(q.x, q.y, 5 / Math.max(0.6, v.s) + 1, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2 / Math.max(0.6, v.s); ctx.strokeStyle = '#7a6ff0'; ctx.stroke();
        }
      }
      // 車輪と接続線
      d.wheels.forEach((w, i) => {
        drawWheel(ctx, w.x, w.y, 0, 3 / Math.max(0.6, v.s));
        if (S.fixHint === 'wheels') {
          ctx.beginPath(); ctx.arc(w.x, w.y, WHEEL_R + 6 + pulse * 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,45,111,${0.5 + pulse * 0.5})`; ctx.lineWidth = 4; ctx.stroke();
        }
        if (S.dragWheel === i) { ctx.beginPath(); ctx.arc(w.x, w.y, WHEEL_R + 4, 0, Math.PI * 2); ctx.strokeStyle = '#7a6ff0'; ctx.lineWidth = 3; ctx.stroke(); }
      });
      // 重心
      const mp = massProps(d.pts);
      if (mp.ok) {
        ctx.save(); ctx.translate(mp.cx, mp.cy);
        const R = S.fixHint === 'cog' ? 10 + pulse * 6 : 8;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = S.fixHint === 'cog' ? '#ff2d6f' : '#3a2a10'; ctx.stroke();
        ctx.fillStyle = S.fixHint === 'cog' ? '#ff2d6f' : '#3a2a10';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // 描画中の線
    if (S.stroke && S.stroke.length > 1) {
      ctx.beginPath(); ctx.moveTo(S.stroke[0].x, S.stroke[0].y);
      for (const p of S.stroke) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#e2508a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      const a = S.stroke[0], b = S.stroke[S.stroke.length - 1];
      if (dist(a, b) < 30 && S.stroke.length > 10) { ctx.beginPath(); ctx.arc(a.x, a.y, 10, 0, Math.PI * 2); ctx.strokeStyle = '#19a15f'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    ctx.restore();

    // おもさメーター: 走る前に重さが分かる
    if (d && d.pts.length >= 3) {
      const mpW = massProps(d.pts);
      if (mpW.ok) {
        const total = mpW.A * DENSITY + WHEEL_M * 2, k = clamp(total / (HEAVY * 1.6), 0, 1), lim = HEAVY / (HEAVY * 1.6);
        const mw = Math.min(150, W * 0.38), mx = W - mw - 14, my = 40;
        ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#5a4ea8';
        ctx.fillText('おもさ', mx, my - 4);
        ctx.fillStyle = 'rgba(90,78,168,.15)'; roundRect(ctx, mx, my, mw, 12, 6); ctx.fill();
        ctx.fillStyle = total > HEAVY ? '#e2508a' : total > HEAVY * 0.8 ? '#eda100' : '#19a15f';
        roundRect(ctx, mx, my, Math.max(12, mw * k), 12, 6); ctx.fill();
        ctx.fillStyle = '#2b2560'; ctx.fillRect(mx + mw * lim - 1, my - 3, 2, 18);
        ctx.textAlign = 'right'; ctx.fillStyle = total > HEAVY ? '#d61f5e' : '#5a4ea8';
        ctx.fillText(total > HEAVY ? 'おもすぎ! 🐘' : total > HEAVY * 0.8 ? 'ちょっと おもい' : 'かるい 👍', mx + mw, my + 26);
      }
    }
    // テキスト
    ctx.textAlign = 'center'; ctx.font = '700 13px system-ui, sans-serif';
    let msg = '';
    if (S.fixHint && S.lastResult && S.lastResult.why) msg = '💡 ' + WHY[S.lastResult.why].fix + (S.tool === 'shape' ? '(てんを つまんでね)' : S.tool === 'wheel' ? '(タイヤを うごかしてね)' : '');
    else if (!d || d.pts.length < 3) msg = 'ゆびや マウスで くるまを かこう!';
    else if (S.tool === 'wheel') msg = 'タイヤを うごかせるよ';
    else if (S.tool === 'shape') msg = 'てんを つまんで かたちを かえよう';
    else msg = 'かいたら くるまに なるよ。すぐ STARTも OK!';
    ctx.fillStyle = S.fixHint ? '#d61f5e' : '#5a4ea8';
    ctx.fillText(msg, W / 2, 22);
    if (d && wheelsTooClose(d.pts, d.wheels)) {
      ctx.fillStyle = '#d61f5e'; ctx.fillText('⚠ タイヤが ちかすぎるよ', W / 2, H - 12);
    } else {
      ctx.fillStyle = 'rgba(90,78,168,.7)'; ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText('⊕ = バランスの まんなか / ' + COURSES[S.course].name, W / 2, H - 12);
    }
  }

  function drawWorld(t) {
    const sim = S.sim, course = sim.course, ch = sim.ch;
    // カメラ
    const s = Math.min(W / 720, H / 420) * 1.0;
    const look = clamp(ch.vx * 0.35, -120, 220);
    S.cam.x += (ch.x + look - S.cam.x) * 0.08;
    S.cam.y += (ch.y - S.cam.y) * 0.08;
    S.cam.s = s;
    const ox = W * 0.42, oy = H * 0.55;
    const toSx = (x) => (x - S.cam.x) * s + ox;
    // 空
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, course.sky[0]); g.addColorStop(1, course.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 虹 (コース3)
    if (course.id === 2) {
      const cols = ['#ff6b6b', '#ffb86b', '#ffe66b', '#7dff8a', '#6bc8ff', '#a98bff'];
      const rx = W * 0.75 - (S.cam.x * 0.03) % W, ry = H * 0.75;
      cols.forEach((c, i) => { ctx.beginPath(); ctx.arc(rx, ry, H * 0.55 - i * 9, Math.PI, 0); ctx.strokeStyle = c; ctx.globalAlpha = 0.5; ctx.lineWidth = 9; ctx.stroke(); });
      ctx.globalAlpha = 1;
    }
    // 遠景の丘
    ctx.fillStyle = course.hill; ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) { const wx = x + S.cam.x * 0.2; ctx.lineTo(x, H * 0.6 + Math.sin(wx / 90) * 30 + Math.sin(wx / 37) * 12); }
    ctx.lineTo(W, H); ctx.fill(); ctx.globalAlpha = 1;
    // 雲
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let k = 0; k < 5; k++) {
      const cx = ((k * 260 - S.cam.x * 0.1) % (W + 300) + W + 300) % (W + 300) - 150, cy = 40 + (k * 37) % 80;
      ctx.beginPath(); ctx.ellipse(cx, cy, 40, 14, 0, 0, Math.PI * 2); ctx.ellipse(cx + 25, cy - 8, 26, 14, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.save();
    ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-S.cam.x, -S.cam.y);
    // 地面
    const vx0 = S.cam.x - ox / s - 40, vx1 = S.cam.x + (W - ox) / s + 40;
    const i0 = Math.max(0, Math.floor((vx0 - course.x0) / course.dx)), i1 = Math.min(course.pts.length - 1, Math.ceil((vx1 - course.x0) / course.dx));
    const bottom = S.cam.y + (H - oy) / s + 50;
    let run = [];
    const flush = () => {
      if (run.length < 2) { run = []; return; }
      ctx.beginPath(); ctx.moveTo(run[0].x, bottom);
      for (const p of run) ctx.lineTo(p.x, p.y);
      ctx.lineTo(run[run.length - 1].x, bottom); ctx.closePath();
      ctx.fillStyle = course.ground; ctx.fill();
      ctx.beginPath(); ctx.moveTo(run[0].x, run[0].y);
      for (const p of run) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = course.grass; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.stroke();
      run = [];
    };
    for (let i = i0; i <= i1; i++) {
      run.push(course.pts[i]);
      if (i < course.holes.length && course.holes[i]) flush();
    }
    flush();
    // 距離マーカー
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let x = START_X + 500; x < course.goal; x += 500) {
      if (x < vx0 || x > vx1) continue;
      const gs = groundSeg(course, x); if (!gs) continue;
      const gy = gs.a.y + (x - gs.a.x) * (gs.b.y - gs.a.y) / (gs.b.x - gs.a.x);
      ctx.fillRect(x - 2, gy - 40, 4, 40); ctx.fillText(Math.round((x - START_X) / UNIT_PER_M) + 'm', x, gy - 46);
    }
    // スタート・ゴール旗
    drawFlag(course, START_X - 60, false);
    drawFlag(course, course.goal, true);

    // 車
    const wob = sim.wob * Math.sin(t * 38);
    for (const w of sim.wheels) if (!w.attached) drawWheel(ctx, w.x, w.y, w.a);
    ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(ch.a); ctx.scale(1 + wob, 1 - wob);
    drawMachineShape(ctx, sim.machine.local, []);
    drawEyes(sim);
    ctx.restore();
    for (const w of sim.wheels) if (w.attached) drawWheel(ctx, w.x, w.y, w.a);

    // 紙吹雪
    for (const p of S.particles) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-5, -3, 10, 6); ctx.restore();
    }
    ctx.restore();

    // 吹き出し
    const b = S.bubbles[S.bubbles.length - 1];
    if (b) {
      const age = sim.t - b.t0 + (sim.ended ? 0 : 0);
      if (age < b.life) {
        const sx = toSx(ch.x), sy = (ch.y - S.cam.y) * s + oy - 90 * s - 20;
        const k = Math.min(1, age * 6);
        ctx.save(); ctx.translate(clamp(sx, 90, W - 90), Math.max(56, sy)); ctx.scale(k, k);
        ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(b.text).width + 22;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2560'; ctx.lineWidth = 3;
        roundRect(ctx, -tw / 2, -18, tw, 32, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2560'; ctx.fillText(b.text, 0, 3);
        ctx.restore();
      }
    }
    // エネルギーゲージ
    const gw = Math.min(180, W * 0.4);
    ctx.fillStyle = 'rgba(20,16,50,.55)'; roundRect(ctx, 10, 10, gw + 16, 26, 13); ctx.fill();
    if (sim.empty && Math.sin(t * 14) > 0) { ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = 3; roundRect(ctx, 10, 10, gw + 16, 26, 13); ctx.stroke(); }
    ctx.fillStyle = sim.empty ? '#9a8fb8' : sim.energy > 25 ? '#ff8a35' : '#ff3d5a';
    roundRect(ctx, 18, 17, gw * sim.energy / 100, 12, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('BOOST', 22, 27);
    // 進捗バー
    const prog = clamp((ch.x - START_X) / (course.goal - START_X), 0, 1);
    ctx.fillStyle = 'rgba(20,16,50,.35)'; ctx.fillRect(10, H - 10, W - 20, 4);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(10, H - 10, (W - 20) * prog, 4);
  }

  function drawEyes(sim) {
    const e = sim.machine.eye;
    const vx = sim.ch.vx, vy = sim.ch.vy, sp = Math.hypot(vx, vy) || 1;
    const ca = Math.cos(-sim.ch.a), sa = Math.sin(-sim.ch.a);
    const lx = (vx * ca - vy * sa) / sp, ly = (vx * sa + vy * ca) / sp;
    for (const dx of [-8, 8]) {
      const x = e.x + dx, y = e.y;
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#3a2a10'; ctx.stroke();
      ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a';
      if (sim.eyeState === 'dizzy') {
        ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.lineWidth = 2.5; ctx.stroke();
      } else if (sim.eyeState === 'happy') {
        ctx.beginPath(); ctx.arc(x, y + 2, 4, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 2.5; ctx.stroke();
      } else {
        const big = sim.inAir && sim.airT > 0.4 ? 2 : 3.2;
        ctx.beginPath(); ctx.arc(x + lx * 2.5, y + ly * 2.5, big, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawFlag(course, x, goal) {
    const g = groundSeg(course, x); if (!g) return;
    const gy = g.a.y + (x - g.a.x) * (g.b.y - g.a.y) / (g.b.x - g.a.x);
    ctx.fillStyle = '#eee'; ctx.fillRect(x - 3, gy - 130, 6, 130);
    if (goal) {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff'; ctx.fillRect(x + 3 + c * 10, gy - 130 + r * 10, 10, 10); }
      ctx.fillStyle = '#fff'; ctx.font = '900 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GOAL', x + 33, gy - 140);
    } else {
      ctx.fillStyle = '#19a15f'; ctx.beginPath(); ctx.moveTo(x + 3, gy - 130); ctx.lineTo(x + 50, gy - 115); ctx.lineTo(x + 3, gy - 100); ctx.fill();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, h / 2, Math.abs(w) / 2);
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  // ====================================================================
  // メインループ (物理は固定タイムステップ)
  // ====================================================================
  let hudT = 0;
  function frame(now) {
    const t = now / 1000;
    let dt = S.lastT ? t - S.lastT : 0; S.lastT = t;
    dt = Math.min(dt, 0.1);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (S.mode === 'edit') {
      drawEdit(t);
    } else if (S.sim) {
      const sim = S.sim;
      S.acc += dt;
      let n = 0;
      while (S.acc >= DT && n < 10) {
        if (!sim.ended) updateRace(sim);
        else step(sim, { boost: false, bal: 0 }); // 終了後も物理で転がる
        S.acc -= DT; n++;
      }
      if (n >= 10) S.acc = 0;
      for (const p of S.particles) { p.vy += 400 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= dt; }
      S.particles = S.particles.filter((p) => p.life > 0);
      drawWorld(t);
      hudT += dt; if (hudT > 0.1) { hudT = 0; updateHud(); }
      const nudge = !sim.ended && (sim.nudgeT > 1.0 || (sim.boostTime < 0.3 && sim.t > 2.5));
      if (nudge !== S.nudgeOn) { S.nudgeOn = nudge; $('btnBoost').classList.toggle('nudge', nudge); }
    }
    requestAnimationFrame(frame);
  }

  // ====================================================================
  // 入力
  // ====================================================================
  function canvasPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  cv.addEventListener('pointerdown', (e) => {
    if (S.mode !== 'edit') return;
    Snd.init();
    cv.setPointerCapture(e.pointerId);
    const sp = canvasPos(e), p = toEdit(sp.x, sp.y);
    const d = S.design;
    if (d && d.wheels.length) {
      let bi = -1, bd = Infinity;
      d.wheels.forEach((w, i) => { const dd = dist(w, p); if (dd < bd) { bd = dd; bi = i; } });
      if (bd < WHEEL_R * 1.4 || (S.tool === 'wheel' && d.pts.length >= 3)) {
        pushHistory(); S.dragWheel = bi; S.fixHint = S.fixHint === 'wheels' ? null : S.fixHint;
        if (S.tool === 'wheel') d.wheels[bi] = validWheel(p, d.pts);
        return;
      }
    }
    if (S.tool === 'shape' && d && d.pts.length >= 3) {
      let vi = -1, vd = Infinity;
      d.pts.forEach((q, i) => { const dd = dist(q, p); if (dd < vd) { vd = dd; vi = i; } });
      if (vd < 32 / Math.max(0.5, editView().s)) {
        pushHistory();
        // 頂点が少ない形は辺を分割して、なめらかに変形できるようにする
        let pts = d.pts;
        for (let k = 0; k < 3 && pts.length < 40; k++) {
          const out = [];
          pts.forEach((q, i) => { const n = pts[(i + 1) % pts.length]; out.push(q); if (dist(q, n) > 28) out.push({ x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 }); });
          pts = out;
        }
        const grab = d.pts[vi]; d.pts = pts; vi = pts.indexOf(grab);
        S.dragVert = { i: vi, orig: d.pts.map((q) => ({ x: q.x, y: q.y })), start: p, wheels: d.wheels.map((w) => ({ x: w.x, y: w.y })) };
      } else toast('輪郭の点をつまんで動かしてね', 1200);
      return;
    }
    if (S.tool === 'draw') { S.stroke = [p]; }
  });

  cv.addEventListener('pointermove', (e) => {
    if (S.mode !== 'edit') return;
    const sp = canvasPos(e), p = toEdit(sp.x, sp.y);
    if (S.dragWheel >= 0) {
      S.design.wheels[S.dragWheel] = validWheel(p, S.design.pts);
      return;
    }
    if (S.dragVert) {
      // 粘土のように: つまんだ点の近くほど大きく動く
      const dv = S.dragVert, o = dv.orig[dv.i];
      const dx = clamp(p.x, -30, EDIT_W + 30) - dv.start.x, dy = clamp(p.y, -30, EDIT_H + 30) - dv.start.y;
      S.design.pts = dv.orig.map((q) => { const k = Math.exp(-((dist(q, o) / 30) ** 2)); return { x: q.x + dx * k, y: q.y + dy * k }; });
      S.design.wheels = dv.wheels.map((w) => validWheel(w, S.design.pts));
      return;
    }
    if (S.stroke) {
      const last = S.stroke[S.stroke.length - 1];
      if (dist(last, p) > 2.5) { S.stroke.push(p); Snd.tick(); }
      if (S.stroke.length > 4000) finishStroke();
    }
  });

  function finishStroke() {
    const raw = S.stroke; S.stroke = null;
    if (!raw) return;
    const r = processStroke(raw);
    if (!r.ok) { if (raw.length > 3) toast(r.msg); return; }
    pushHistory();
    S.design = { pts: r.pts, wheels: autoWheels(r.pts), source: 'draw' };
    S.fixHint = null;
    Snd.pop();
    if (r.corrected) toast('細すぎたので形をふくらませたよ');
    else if (r.selfX) toast('線が交差していたので自動で補正したよ');
  }

  const endPointer = () => {
    if (S.mode !== 'edit') return;
    if (S.dragWheel >= 0) {
      const d = S.design;
      if (wheelsTooClose(d.pts, d.wheels)) toast('⚠ タイヤが ちかすぎるよ(たおれやすい)');
      S.dragWheel = -1; Snd.pop(); return;
    }
    if (S.dragVert) {
      const dv = S.dragVert; S.dragVert = null;
      if (!massProps(S.design.pts).ok) { S.design.pts = dv.orig; S.design.wheels = dv.wheels; toast('細くなりすぎたので戻したよ'); return; }
      S.design.source = 'draw';
      if (S.fixHint === 'cog' || S.fixHint === 'body') S.fixHint = null;
      Snd.pop(); return;
    }
    if (S.stroke) finishStroke();
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  // 押し続け対応ボタン
  function holdButton(el, key) {
    const on = (e) => { e.preventDefault(); Snd.init(); S.input[key] = true; el.classList.add('pressed'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } };
    const off = (e) => { e.preventDefault(); S.input[key] = false; el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdButton($('btnBoost'), 'boost');
  holdButton($('btnLeft'), 'left');
  holdButton($('btnRight'), 'right');

  const keyMap = { Space: 'boost', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'boost' };
  window.addEventListener('keydown', (e) => {
    const k = keyMap[e.code];
    if (k && S.mode !== 'edit') { e.preventDefault(); Snd.init(); S.input[k] = true; }
    if (e.code === 'Enter') { if (S.mode === 'edit') startRace(); else if (S.mode === 'result') startRace(); }
    if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && S.mode === 'edit') undo();
  });
  window.addEventListener('keyup', (e) => { const k = keyMap[e.code]; if (k) S.input[k] = false; });
  window.addEventListener('blur', () => { S.input.boost = S.input.left = S.input.right = false; });

  function undo() {
    if (!S.history.length) { toast('これ以上戻せないよ'); return; }
    S.design = JSON.parse(S.history.pop());
    S.fixHint = null;
  }

  $('btnDraw').addEventListener('click', () => setTool('draw'));
  $('btnShape').addEventListener('click', () => {
    if (!S.design || S.design.pts.length < 3) { toast('先に車体を描いてね'); return; }
    setTool('shape'); Snd.init(); Snd.pop();
  });
  $('btnWheel').addEventListener('click', () => {
    if (!S.design || S.design.pts.length < 3) { toast('先に車体を描いてね'); return; }
    if (S.design.wheels.length !== 2) { pushHistory(); S.design.wheels = autoWheels(S.design.pts); }
    setTool('wheel'); Snd.init(); Snd.pop();
  });
  $('btnErase').addEventListener('click', () => { pushHistory(); S.design = { pts: [], wheels: [], source: 'draw' }; S.fixHint = null; setTool('draw'); });
  $('btnUndo').addEventListener('click', undo);
  $('btnStart').addEventListener('click', startRace);
  $('btnRetry').addEventListener('click', startRace);
  $('btnAbort').addEventListener('click', startRace);
  $('btnEdit').addEventListener('click', () => enterEdit(true));
  $('btnNew').addEventListener('click', () => enterEdit(false));
  $('btnNext').addEventListener('click', () => { setCourse(Math.min(2, S.course + 1)); startRace(); });
  $('btnShare').addEventListener('click', share);
  document.querySelectorAll('#courseRow .chip').forEach((b) => b.addEventListener('click', () => setCourse(+b.dataset.course)));
  document.querySelectorAll('#tplRow .chip').forEach((b) => b.addEventListener('click', () => { Snd.init(); loadTemplate(b.dataset.tpl); Snd.pop(); setTool('draw'); }));
  $('muteBtn').addEventListener('click', () => {
    Snd.init(); Snd.setOn(!Snd.on); store.d.mute = !Snd.on; store.save();
    $('muteBtn').textContent = Snd.on ? '🔊' : '🔇';
  });
  $('muteBtn').textContent = Snd.on ? '🔊' : '🔇';

  // ====================================================================
  // SHARE (Canvas → PNG)
  // ====================================================================
  function makeShareCanvas(res) {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    const x = c.getContext('2d');
    const course = COURSES[res.course];
    const g = x.createLinearGradient(0, 0, 0, 630); g.addColorStop(0, course.sky[0]); g.addColorStop(1, course.sky[1]);
    x.fillStyle = g; x.fillRect(0, 0, 1200, 630);
    x.fillStyle = course.ground; x.fillRect(0, 520, 1200, 110); x.fillStyle = course.grass; x.fillRect(0, 512, 1200, 14);
    x.fillStyle = '#2b2560'; x.font = '900 64px system-ui, sans-serif'; x.textAlign = 'left';
    x.fillText('DRAW & ROLL KING', 50, 95);
    // マシン
    const m = S.machine;
    const sc = Math.min(420 / (m.width + 60), 300 / (m.bbox.y1 - m.bbox.y0 + 60));
    x.save(); x.translate(300, 330); x.scale(sc, sc);
    drawMachineShape(x, m.local, m.wheels, { lw: 3 });
    x.restore();
    // 記録
    x.textAlign = 'left'; x.fillStyle = '#2b2560';
    x.font = '800 34px system-ui, sans-serif'; x.fillText(course.name, 640, 190);
    x.font = '900 72px system-ui, sans-serif'; x.fillText(res.goal ? res.time.toFixed(1) + ' s' : Math.round(res.dist) + ' m', 640, 280);
    x.font = '700 28px system-ui, sans-serif'; x.fillText(res.goal ? 'GOAL!' : '最大到達 ' + Math.round(res.dist) + 'm', 640, 325);
    let ty = 380;
    for (const tt of res.titles.slice(0, 3)) {
      x.font = '800 28px system-ui, sans-serif';
      const w = x.measureText(tt.t).width + 40;
      x.fillStyle = tt.silly ? '#ffd0e3' : '#ffd84a'; roundRect(x, 640, ty, w, 46, 23); x.fill();
      x.fillStyle = tt.silly ? '#8a1e4c' : '#5a3b00'; x.fillText(tt.t, 660, ty + 33); ty += 58;
    }
    return c;
  }

  let shareBlob = null;
  function share() {
    const res = S.lastResult; if (!res) return;
    const c = makeShareCanvas(res);
    $('shareImg').src = c.toDataURL('image/png');
    $('sharePanel').classList.remove('hidden');
    shareBlob = null;
    c.toBlob((blob) => { shareBlob = blob; }, 'image/png');
  }

  async function shareGo() {
    const res = S.lastResult;
    if (!shareBlob || !res) { toast('画像を準備中…'); return; }
    const file = new File([shareBlob], 'draw-roll-king.png', { type: 'image/png' });
    const text = `DRAW & ROLL KING / ${COURSES[res.course].name} ${res.goal ? res.time.toFixed(1) + '秒でゴール!' : Math.round(res.dist) + 'm 到達'}`;
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'DRAW & ROLL KING', text }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(shareBlob); a.download = 'draw-roll-king.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('保存できない場合は画像を長押ししてね');
    } catch (e) { toast('画像を長押しして保存してね'); }
  }
  $('btnShareGo').addEventListener('click', shareGo);
  $('btnShareClose').addEventListener('click', () => $('sharePanel').classList.add('hidden'));

  // ====================================================================
  // 起動
  // ====================================================================
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  loadTemplate('basic', false);
  setCourse(0);
  showMode('edit');
  requestAnimationFrame(frame);

  // テスト用フック
  window.__drk = { clearCourses: () => { for (const k in courseCache) delete courseCache[k]; }, HEAVY, DENSITY, S, wheelsTooClose, massProps, step, buildMachine, makeSim, getCourse, processStroke, TEMPLATES, startRace, endRace, autoWheels, updateRace };
})();
