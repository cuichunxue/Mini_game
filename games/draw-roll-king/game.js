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
    vehicle: 'car',        // car | plane
    designs: {},
    lastAim: null,
    dragWeight: false,
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
    if (ROCKET_TEMPLATES[name]) {
      const t = ROCKET_TEMPLATES[name]();
      S.design = { pts: t.pts, wheels: [], weight: autoEngine(t.pts), source: 'template:' + name };
    } else if (PLANE_TEMPLATES[name]) {
      const t = PLANE_TEMPLATES[name]();
      S.design = { pts: t.pts, wheels: [], weight: autoWeight(t.pts), source: 'template:' + name };
    } else {
      const t = TEMPLATES[name]();
      S.design = { pts: t.pts, wheels: t.wheels, source: 'template:' + name };
    }
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

  const TPL_LABELS = { car: [['basic', '🚗 BASIC'], ['banana', '🍌 BANANA'], ['star', '⭐ STAR']], plane: [['dart', '✈️ DART'], ['glider', '🛩️ GLIDER'], ['ufo', '🛸 UFO']], rocket: [['pencil', '✏️ PENCIL'], ['classic', '🚀 CLASSIC'], ['onigiri', '🍙 ONIGIRI']] };
  // モードの解放: 最初は CAR だけ。CAR でゴール → PLANE、PLANE で着陸成功 → ROCKET
  const UNLOCK_ALL = /(^|#|&)all($|&)/.test(location.hash);
  const isUnlocked = (v) => UNLOCK_ALL || v === 'car' || !!(store.d.unlock && store.d.unlock[v]);
  function refreshModeChips() {
    document.querySelectorAll('#modeRow .chip').forEach((b) => {
      const v = b.dataset.mode, open = isUnlocked(v);
      b.classList.toggle('locked', !open);
      b.textContent = (open ? MODE_LABEL[v] : '🔒 ' + v.toUpperCase());
    });
  }
  function unlock(v) {
    if (isUnlocked(v)) return false;
    store.d.unlock = Object.assign({}, store.d.unlock, { [v]: true }); store.save(); refreshModeChips();
    return true;
  }
  function setVehicle(v) {
    if (!isUnlocked(v)) { toast(v === 'plane' ? '🔒 CARで 1かい ゴールすると ひらくよ' : '🔒 PLANEで 1かい ちゃくりく すると ひらくよ', 2200); return; }
    if (v === S.vehicle && S.design) return;
    if (S.design) S.designs[S.vehicle] = S.design;
    S.vehicle = v; S.history = []; S.fixHint = null; S.lastResult = null;
    document.querySelectorAll('#modeRow .chip').forEach((b) => b.classList.toggle('active', b.dataset.mode === v));
    document.querySelectorAll('#tplRow .chip').forEach((b, i) => { const [k, label] = TPL_LABELS[v][i]; b.dataset.tpl = k; b.textContent = label; });
    // コース名は setCourse → refreshProgress で更新
    $('btnWheel').textContent = v === 'rocket' ? 'ENGINE' : v === 'plane' ? 'WEIGHT' : 'WHEEL';
    $('btnBoost').textContent = 'BOOST';
    if (S.designs[v]) S.design = S.designs[v]; else loadTemplate(v === 'rocket' ? 'classic' : v === 'plane' ? 'dart' : 'basic', false);
    setTool('draw'); setCourse(0);
  }

  // クリア状況 (★) と 全9コースの進み具合
  const MODES = ['car', 'plane', 'rocket'];
  const MODE_LABEL = { car: '🚗 CAR', plane: '✈️ PLANE', rocket: '🚀 ROCKET' };
  function isCleared(v, id) {
    const b = store.d.best[v === 'car' ? id : (v === 'plane' ? 'p' : 'r') + id];
    return !!(b && (v === 'car' ? b.time : b.goal));
  }
  const clearedCount = () => MODES.reduce((n, v) => n + [0, 1, 2].filter((id) => isCleared(v, id)).length, 0);
  function refreshProgress() {
    document.querySelectorAll('#courseRow .chip').forEach((b) => {
      const id = +b.dataset.course, name = courseList()[id].name;
      b.textContent = (isCleared(S.vehicle, id) ? '★ ' : (id + 1) + ' ') + name;
    });
    const n = clearedCount(), el = $('progBadge');
    if (el) el.textContent = (n >= 9 ? '👑 ' : '★ ') + n + '/9';
  }

  function setCourse(id) {
    S.course = id;
    document.querySelectorAll('#courseRow .chip').forEach((b) => b.classList.toggle('active', +b.dataset.course === id));
    refreshProgress();
    updateHud();
  }

  const isPlane = () => S.vehicle === 'plane';
  const isRocket = () => S.vehicle === 'rocket';
  const isAir = () => isPlane() || isRocket();
  const courseList = () => (isRocket() ? RCOURSES : isPlane() ? PCOURSES : COURSES);
  const courseMeta = (id = S.course) => courseList()[id];
  function fmtBest(id) {
    if (isAir()) { const b = store.d.best[(isRocket() ? 'r' : 'p') + id]; return b ? Math.round(b.dist) + 'm' + (b.goal ? '★' : '') : '--'; }
    const b = store.d.best[id];
    if (!b) return '--';
    return b.time ? b.time.toFixed(1) + 's' : Math.round(b.dist) + 'm';
  }

  function updateHud() {
    const c = courseMeta();
    $('hudCourse').textContent = c.name;
    $('hudBest').textContent = fmtBest(S.course);
    if (S.sim) {
      $('hudDist').textContent = (S.sim.rocket ? Math.round(rocketAlt(S.sim)) : Math.max(0, Math.round((S.sim.ch.x - (S.sim.startX ?? START_X)) / UNIT_PER_M))) + 'm';
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
    setTool(keep && (S.fixHint === 'cog' || S.fixHint === 'body') ? 'shape' : keep && (S.fixHint === 'wheels' || S.fixHint === 'weight') ? 'wheel' : 'draw');
    showMode('edit');
    updateHud();
  }

  function startRace() {
    Snd.init();
    const d = S.design;
    if (!d || d.pts.length < 3) { toast(isRocket() ? 'まず ロケットを かくか、テンプレートを えらんでね' : isPlane() ? 'まず ひこうきを かくか、テンプレートを えらんでね' : 'まず車体を描くか、テンプレートを選んでね'); return; }
    if (isPlane()) { startFlight(d); return; }
    if (isRocket()) { startRocket(d); return; }
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

  function startRocket(d) {
    d.weight = validWeight(d.weight || autoEngine(d.pts), d.pts);
    S.machine = buildRocket(d);
    S.courseData = getRocketCourse(S.course);
    S.sim = makeRocketSim(S.machine, S.courseData);
    S.particles = []; S.bubbles = [];
    $('sharePanel').classList.add('hidden');
    S.cam.x = S.sim.ch.x; S.cam.y = S.sim.ch.y - 150; S.aimIdle = 0;
    S.acc = 0; S.input.boost = S.input.left = S.input.right = S.input.tap = false;
    document.querySelectorAll('.btn.pressed').forEach((b) => b.classList.remove('pressed'));
    S.nudgeOn = false; $('btnBoost').classList.remove('nudge');
    showMode('race');
    Snd.start();
  }

  function startFlight(d) {
    d.weight = validWeight(d.weight || autoWeight(d.pts), d.pts);
    S.machine = buildPlane(d);
    S.courseData = getPlaneCourse(S.course);
    S.sim = makePlaneSim(S.machine, S.courseData);
    S.particles = []; S.bubbles = [];
    $('sharePanel').classList.add('hidden');
    S.cam.x = S.sim.ch.x + 200; S.cam.y = S.sim.ch.y + 120; S.aimIdle = 0;
    S.acc = 0; S.input.boost = S.input.left = S.input.right = S.input.tap = false;
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
    let unlocked = null;
    if (res.goal && !res.vehicle && unlock('plane')) unlocked = 'plane';
    if (res.goal && res.vehicle === 'plane' && unlock('rocket')) unlocked = 'rocket';
    refreshProgress();
    // 全9コース制覇の瞬間
    const allNow = clearedCount() >= 9;
    if (allNow && !store.d.allClear) { store.d.allClear = true; store.save(); res.titles.unshift({ t: '👑 DRAW & ROLL KING' }); setTimeout(() => toast('👑 ぜんぶ クリア! あなたが DRAW & ROLL KING!', 3500), 500); }
    // 次の行き先: 解放したモード > 同じモードの次コース > 次のモード
    const curV = res.vehicle || 'car', nextV = MODES[MODES.indexOf(curV) + 1];
    S.nextAction = null;
    if (unlocked) S.nextAction = { v: unlocked, course: 0, label: MODE_LABEL[unlocked] + 'が ひらいた! あそぶ ▶', big: true };
    else if (res.goal && res.course < 2) S.nextAction = { v: curV, course: res.course + 1, label: 'NEXT ▶' };
    else if (res.goal && nextV && isUnlocked(nextV)) S.nextAction = { v: nextV, course: 0, label: 'つぎは ' + MODE_LABEL[nextV] + ' ▶' };
    $('resHead').textContent = res.vehicle === 'rocket'
      ? (res.goal ? (res.course === 2 ? 'ちゃくりく成功!' : 'ミッション成功!') : { crash: 'ぺちゃんこ!', fall: 'おちてきた!', tipped: 'たおれた!', offpad: 'はずれ!', stuck: 'とばない!', out: 'コースアウト!', timeout: 'タイムアップ!' }[res.reason])
      : res.vehicle === 'plane'
      ? (res.goal ? 'ちゃくりく成功!' : { out: 'おちた!', short: 'とどかず…', crash: 'ついらく!', timeout: 'タイムアップ!' }[res.reason])
      : (res.goal ? 'GOAL!' : { out: 'コースアウト!', stuck: 'ストップ!', timeout: 'タイムアップ!' }[res.reason]);
    $('resHead').classList.toggle('goal', res.goal);
    $('resTitles').innerHTML = res.titles.map((x) => `<span class="${x.silly ? 'silly' : ''}">${x.t}</span>`).join('');
    if (res.why) {
      const w = WHY[res.why];
      $('whyIcon').textContent = w.icon; $('whyText').textContent = w.text; $('whyFix').textContent = res.whyFix || w.fix;
      $('resWhy').classList.remove('hidden');
    } else $('resWhy').classList.add('hidden');
    drawResMap(sim, res);
    $('resTime').textContent = res.goal || res.vehicle ? res.time.toFixed(1) + 's' : '-';
    $('resDist').textContent = Math.round(res.dist) + 'm';
    $('resStab').textContent = res.stability;
    $('resRot').textContent = res.flips;
    $('resBest').textContent = (res.newBest ? '🎉 NEW BEST! ' : '') + 'BEST: ' + fmtBest(res.course);
    $('resHint').classList.toggle('hidden', !res.firstRun);
    $('resHint').textContent = res.vehicle === 'rocket' ? 'ヒント: BOOSTを ながおしで ふんしゃ。◀▶で むきを かえられるよ。うしろの ひれが おおきいと まっすぐ とぶ!' : res.vehicle === 'plane' ? 'ヒント: ひっぱる つよさと かくどで とびかたが かわるよ。とんでいる あいだは ◀▶で あたまの むき、「ふーっ」で ひと押し!' : 'ヒント: BOOST(Space)を ながおしで かそく。◀▶(←→)で むきを なおせるよ。ジャンプで くるっと 1かいてんも!';
    const na = S.nextAction;
    $('btnNext').classList.toggle('hidden', !na);
    $('btnUnlock').classList.toggle('hidden', !(na && na.big));
    if (na) { if (na.big) { $('btnUnlock').textContent = na.label; $('btnNext').classList.add('hidden'); } else $('btnNext').textContent = na.label; }
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
    if (sim.rocket) {
      x.fillStyle = '#d9d2ff'; x.fillRect(0, 0, w, h);
      const goal = sim.course.id === 0 ? sim.course.goalAlt : sim.course.id === 1 ? 520 : 170, top = Math.max(goal, sim.maxAlt) * 1.1;
      const bx = (a) => 8 + a / top * (w - 16);
      x.fillStyle = '#b8adff'; x.fillRect(8, 26, w - 16, 12);
      x.fillStyle = '#e2508a'; x.fillRect(8, 26, bx(sim.maxAlt) - 8, 12);
      x.font = '700 12px system-ui, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#2b2560';
      if (sim.course.id !== 2) x.fillText('🏁 ' + goal + 'm', bx(goal), 18);
      for (const rg of sim.rings) x.fillText(rg.passed ? '🟢' : '⭕', bx(-rg.y / UNIT_PER_M), 56);
      $('resMapNote').textContent = 'いちばん たかく ' + Math.round(sim.maxAlt) + 'm' + (sim.rings.length ? ' / わっか ' + sim.ringsPassed + '/' + sim.rings.length : '') + (sim.flips ? ' / ぐるぐる ' + sim.flips + 'かい' : '');
      return;
    }
    if (sim.plane) { $('resMapNote').textContent = (res.goal ? '🏁 ちゃくりく!' : '✕ おちた ところ') + ' / ふーっ ' + (PUFFS - sim.puffs) + 'かい つかった' + (sim.flips ? ' / ちゅうがえり ' + sim.flips + 'かい' : ''); return; }
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
    const s = Math.min((W - pad * 2) / (EDIT_W + 60), (H - pad * 2 - 30) / (EDIT_H + 70)) * (S.editZoom || 1);
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
      // 飛行機: おもり、重心(⊕)、風の中心(▲)、進む向き
      const pst = isAir() ? (isRocket() ? planeStats(d.pts, d.weight || autoEngine(d.pts), ENGINE_M) : planeStats(d.pts, d.weight)) : null;
      if (pst) {
        const w = d.weight || pst.w;
        if (isRocket()) drawEngine(ctx, w, false, t); else drawWeightClip(ctx, w);
        if (S.fixHint === 'weight' || S.dragWeight) { ctx.beginPath(); ctx.arc(w.x, w.y, WEIGHT_R + 6 + pulse * 5, 0, Math.PI * 2); ctx.strokeStyle = S.dragWeight ? '#7a6ff0' : `rgba(255,45,111,${0.5 + pulse * 0.5})`; ctx.lineWidth = 4; ctx.stroke(); }
        ctx.save(); ctx.translate(pst.cp.x, pst.cp.y);
        ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(10, 7); ctx.lineTo(-10, 7); ctx.closePath(); ctx.fillStyle = '#4aa8ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1d4f86'; ctx.stroke();
        ctx.restore();
        ctx.save(); ctx.translate(pst.cog.x, pst.cog.y);
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#3a2a10'; ctx.stroke();
        ctx.fillStyle = '#3a2a10'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 8, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 8, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (isAir()) {
        ctx.fillStyle = 'rgba(90,78,168,.55)'; ctx.font = `800 ${14}px system-ui, sans-serif`; ctx.textAlign = 'right';
        ctx.fillText('まえ ➜', EDIT_W + 36, -10);
      }
      // 重心
      const mp = isAir() ? { ok: false } : massProps(d.pts);
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
    if (d && d.pts.length >= 3 && isRocket()) {
      const pst = planeStats(d.pts, d.weight || autoEngine(d.pts), ENGINE_M);
      if (pst) {
        const twr = THRUST / (pst.m * G), k = clamp(twr / 3, 0, 1), lim = 1.15 / 3, weak = twr < 1.15;
        const mw = Math.min(150, W * 0.38), mx = W - mw - 14, my = 40;
        ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#5a4ea8';
        ctx.fillText('エンジンの ちから くらべ', mx, my - 4);
        ctx.fillStyle = 'rgba(90,78,168,.15)'; roundRect(ctx, mx, my, mw, 12, 6); ctx.fill();
        ctx.fillStyle = weak ? '#e2508a' : twr < 1.6 ? '#eda100' : '#19a15f';
        roundRect(ctx, mx, my, Math.max(12, mw * k), 12, 6); ctx.fill();
        ctx.fillStyle = '#2b2560'; ctx.fillRect(mx + mw * lim - 1, my - 3, 2, 18);
        ctx.textAlign = 'right'; ctx.fillStyle = weak ? '#d61f5e' : '#5a4ea8';
        const ew = d.weight || autoEngine(d.pts), off = Math.abs(ew.y - pst.cog.y);
        const stab = cachedRocketStab(d);
        const bal = off > 9 ? 'エンジンが ずれてるよ' : stab < ROCKET_STAB_OK ? 'ひれを おおきく' : 'バランス よし 👍';
        ctx.fillText(weak ? 'おもすぎ! とばないよ' : bal, mx + mw, my + 26);
      }
    } else if (d && d.pts.length >= 3 && isPlane()) {
      const pst = planeStats(d.pts, d.weight);
      if (pst) {
        const k = clamp(pst.load / (PLANE_HEAVY * 1.6), 0, 1), lim = 1 / 1.6, heavy = pst.load > PLANE_HEAVY;
        const mw = Math.min(150, W * 0.38), mx = W - mw - 14, my = 40;
        ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#5a4ea8';
        ctx.fillText('つばさに たいする おもさ', mx, my - 4);
        ctx.fillStyle = 'rgba(90,78,168,.15)'; roundRect(ctx, mx, my, mw, 12, 6); ctx.fill();
        ctx.fillStyle = heavy ? '#e2508a' : k > lim * 0.8 ? '#eda100' : '#19a15f';
        roundRect(ctx, mx, my, Math.max(12, mw * k), 12, 6); ctx.fill();
        ctx.fillStyle = '#2b2560'; ctx.fillRect(mx + mw * lim - 1, my - 3, 2, 18);
        ctx.textAlign = 'right'; ctx.fillStyle = heavy ? '#d61f5e' : '#5a4ea8';
        const bal = pst.margin < 0.04 ? 'おもりを まえへ' : pst.margin > 0.24 ? 'おもりを すこし うしろへ' : 'バランス よし 👍';
        ctx.fillText(heavy ? 'おもすぎ! すぐ おちるよ' : bal, mx + mw, my + 26);
      }
    } else if (d && d.pts.length >= 3) {
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
    const P = isAir(), Rk = isRocket();
    const noun = Rk ? 'ロケット' : P ? 'ひこうき' : 'くるま', part = Rk ? 'エンジン' : P ? 'おもり' : 'タイヤ';
    if (S.fixHint && S.lastResult && S.lastResult.why) msg = '💡 ' + WHY[S.lastResult.why].fix + (S.tool === 'shape' ? '(てんを つまんでね)' : S.tool === 'wheel' ? `(${part}を うごかしてね)` : '');
    else if (!d || d.pts.length < 3) msg = `ゆびや マウスで ${noun}を かこう!` + (Rk ? '(みぎが さき)' : '');
    else if (S.tool === 'wheel') msg = `${part}を うごかせるよ`;
    else if (S.tool === 'shape') msg = 'てんを つまんで かたちを かえよう';
    else msg = `かいたら ${noun}に なるよ。すぐ STARTも OK!`;
    ctx.fillStyle = S.fixHint ? '#d61f5e' : '#5a4ea8';
    ctx.fillText(msg, W / 2, 22);
    if (d && wheelsTooClose(d.pts, d.wheels)) {
      ctx.fillStyle = '#d61f5e'; ctx.fillText('⚠ タイヤが ちかすぎるよ', W / 2, H - 12);
    } else {
      ctx.fillStyle = 'rgba(90,78,168,.7)'; ctx.font = '600 11px system-ui, sans-serif';
      ctx.fillText(P ? (Rk ? '⊕ を ▲ より まえに・エンジンは まんなかに / ' : '⊕ じゅうしん を ▲ かぜの まんなか より まえに / ') + courseMeta().name : '⊕ = バランスの まんなか / ' + COURSES[S.course].name, W / 2, H - 12);
    }
  }

  function drawWorld(t) {
    const sim = S.sim, course = sim.course, ch = sim.ch;
    // カメラ
    const s = (sim.rocket ? Math.min(W / 640, H / 900) : sim.plane ? Math.min(W / 860, H / 560) : Math.min(W / 720, H / 420)) * (S.zoom || 1);
    if (sim.rocket) {
      S.cam.x += (ch.x + clamp(ch.vx * 0.25, -150, 150) - S.cam.x) * 0.1;
      S.cam.y += (ch.y + clamp(ch.vy * 0.3, -380, 220) - S.cam.y) * 0.12;
    } else {
      const look = clamp(ch.vx * 0.35, -120, 220);
      S.cam.x += (ch.x + look - S.cam.x) * 0.08;
      S.cam.y += (ch.y - S.cam.y) * 0.08;
    }
    S.cam.s = s;
    const ox = W * (sim.rocket ? 0.5 : sim.plane ? 0.36 : 0.42), oy = H * (sim.rocket ? 0.55 : sim.plane ? 0.45 : 0.55);
    const toSx = (x) => (x - S.cam.x) * s + ox;
    // 空
    if (course.rocket) drawRocketSky(sim); else {
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
    }

    ctx.save();
    ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-S.cam.x, -S.cam.y);
    // 地面
    const vx0 = S.cam.x - ox / s - 40, vx1 = S.cam.x + (W - ox) / s + 40;
    const i0 = Math.max(0, Math.floor((vx0 - course.x0) / course.dx)), i1 = Math.min(course.pts.length - 1, Math.ceil((vx1 - course.x0) / course.dx));
    const bottom = S.cam.y + (H - oy) / s + 50;
    if (sim.plane) drawWindZones(sim, t, vx0, vx1, S.cam.y - oy / s - 50, bottom);
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
    const sx0 = sim.startX ?? START_X;
    for (let x = sx0 + 500; !course.rocket && x < course.goal; x += 500) {
      if (x < vx0 || x > vx1) continue;
      const gs = groundSeg(course, x); if (!gs) continue;
      const gy = gs.a.y + (x - gs.a.x) * (gs.b.y - gs.a.y) / (gs.b.x - gs.a.x);
      ctx.fillRect(x - 2, gy - 40, 4, 40); ctx.fillText(Math.round((x - sx0) / UNIT_PER_M) + 'm', x, gy - 46);
    }
    // スタート・ゴール旗
    if (sim.rocket) drawRocketWorld(sim, t, vx0, vx1);
    else if (sim.plane) { drawTarget(course); if (sim.phase === 'aim') drawAim(sim); }
    else { drawFlag(course, START_X - 60, false); drawFlag(course, course.goal, true); }

    // 車
    const wob = sim.wob * Math.sin(t * 38);
    for (const w of sim.wheels) if (!w.attached) drawWheel(ctx, w.x, w.y, w.a);
    ctx.save(); ctx.translate(ch.x, ch.y); ctx.rotate(ch.a); ctx.scale(1 + wob, 1 - wob);
    if (sim.rocket) drawEngine(ctx, sim.machine.engineLocal, sim.firing, t);
    drawMachineShape(ctx, sim.machine.local, []);
    if (sim.plane) drawWeightClip(ctx, sim.machine.weightLocal);
    if (sim.rocket) drawEngine(ctx, sim.machine.engineLocal, false, t);
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
      if (age >= 0 && age < b.life) {
        const sx = toSx(ch.x), sy = (ch.y - S.cam.y) * s + oy - 90 * s - 20;
        const k = clamp(age * 6, 0, 1);
        ctx.save(); ctx.translate(clamp(sx, 90, W - 90), Math.max(56, sy)); ctx.scale(k, k);
        ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(b.text).width + 22;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2560'; ctx.lineWidth = 3;
        roundRect(ctx, -tw / 2, -18, tw, 32, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2560'; ctx.fillText(b.text, 0, 3);
        ctx.restore();
      }
    }
    if (sim.plane) { drawPlaneHud(sim, t, course, ch); return; }
    if (sim.rocket) { drawRocketHud(sim, t); return; }
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

  function drawPlaneHud(sim, t, course, ch) {
    ctx.fillStyle = 'rgba(20,16,50,.55)'; roundRect(ctx, 10, 10, 150, 26, 13); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('ふーっ', 22, 27);
    for (let i = 0; i < PUFFS; i++) { ctx.beginPath(); ctx.arc(80 + i * 22, 23, 7, 0, Math.PI * 2); ctx.fillStyle = i < sim.puffs ? '#9fe3ff' : 'rgba(255,255,255,.2)'; ctx.fill(); }
    if (sim.phase === 'aim' && !S.rec) {
      ctx.textAlign = 'center'; ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2560'; ctx.lineWidth = 4;
      const msg = 'ひっぱって はなす / ◀▶で かくど';
      ctx.strokeText(msg, W / 2, 62); ctx.fillText(msg, W / 2, 62);
      // パワー表示
      const pw = Math.min(160, W * 0.35);
      ctx.fillStyle = 'rgba(20,16,50,.55)'; roundRect(ctx, W - pw - 22, 10, pw + 12, 26, 13); ctx.fill();
      ctx.fillStyle = '#ffd84a'; roundRect(ctx, W - pw - 16, 17, pw * sim.aimPow, 12, 6); ctx.fill();
    }
    const prog = clamp((ch.x - sim.startX) / (course.goal - sim.startX), 0, 1);
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
  // PLANE モード (飛行機): 描いた輪郭の辺ごとに空気の力がかかる
  // ====================================================================
  const PLANE_DENSITY = 0.00045;
  const WEIGHT_M = 1.0;            // おもりの質量
  const WEIGHT_R = 10;
  const AERO_K = 4.6e-4;           // 面に当たる風の力 (法線方向)
  const AERO_T = 6e-7;             // 面に沿った摩擦
  const PITCH_ACC = 3.5, PITCH_MAXW = 2.2;
  const TRIM_K = 2e-4;
  const PUFFS = 3, PUFF_V = 170;
  const PLANE_HEAVY = 0.016;       // 1unit の長さあたりの重さ (つばさに対して重い)

  const PCOURSES = [
    { name: 'SUNNY HILL', jp: 'ひだまりの丘', limit: 40, sky: ['#9fdcff', '#e8f7ff'], hill: '#8fd18c', ground: '#7a5230', grass: '#5cbf4f' },
    { name: 'UPDRAFT VALLEY', jp: 'ふきあげ谷', limit: 50, sky: ['#ffc48a', '#fff0d6'], hill: '#d9a46f', ground: '#6e4426', grass: '#e6a83a' },
    { name: 'SKY TOWER', jp: 'そらの塔', limit: 60, sky: ['#7d8cff', '#ffd9f0'], hill: '#8e7fe0', ground: '#4f3a80', grass: '#ff8ac2' },
  ];

  Object.assign(WHY, {
    nose: { icon: '⤵️', text: 'あたまが おもすぎる', fix: 'おもりを うしろへ', target: 'weight' },
    tail: { icon: '⤴️', text: 'おしりが おもすぎる', fix: 'おもりを まえへ', target: 'weight' },
    wing: { icon: '🪶', text: 'つばさが ちいさい', fix: 'つばさを ながく・ひろく かこう', target: 'body' },
    launch: { icon: '📐', text: 'とばす かくどが たかすぎ', fix: 'ひくめに とばそう', target: null },
    shape: { icon: '🌀', text: 'かたちが アンバランス', fix: 'かたちを ととのえよう', target: 'body' },
    puff: { icon: '💨', text: 'あと すこし!', fix: '「ふーっ」で ひと押ししよう', target: null },
  });

  const PLANE_TEMPLATES = {
    dart() { return { pts: [{ x: 18, y: 96 }, { x: 46, y: 76 }, { x: 244, y: 88 }].map((p) => ({ ...p })), weight: null }; },
    glider() {
      // ほそながい胴体と、うしろの小さな水平尾翼
      return { pts: [[16, 88], [30, 80], [60, 82], [150, 78], [214, 82], [244, 88], [214, 94], [150, 96], [60, 94], [30, 96]].map(([x, y]) => ({ x, y })), weight: null };
    },
    ufo() {
      const pts = [];
      for (let i = 0; i < 36; i++) {
        const t = i / 36 * Math.PI * 2, x = 130 + 100 * Math.cos(t);
        let y = 95 + 9 * Math.sin(t);
        if (Math.sin(t) < 0 && Math.abs(x - 130) < 36) y = Math.min(y, 95 - 24 * Math.sqrt(Math.max(0, 1 - ((x - 130) / 36) ** 2)));
        pts.push({ x, y });
      }
      return { pts, weight: null };
    },
  };

  // 風の中心: 輪郭の長さで重みづけした中心 (平らな翼では弦のまんなか)
  function windCenter(pts) {
    let sx = 0, sy = 0, sl = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], L = dist(a, b); sx += (a.x + b.x) / 2 * L; sy += (a.y + b.y) / 2 * L; sl += L; }
    return sl > 0 ? { x: sx / sl, y: sy / sl } : { x: 130, y: 85 };
  }
  function autoWeight(pts) {
    const mp = massProps(pts); if (!mp.ok) return { x: 130, y: 85 };
    const xs = pts.map((p) => p.x), len = Math.max(20, Math.max(...xs) - Math.min(...xs));
    const cp = windCenter(mp.pts), mb = mp.A * PLANE_DENSITY, m = mb + WEIGHT_M;
    const wx = ((cp.x + 0.09 * len) * m - mb * mp.cx) / WEIGHT_M;
    const x = clamp(wx, Math.min(...xs) + 8, Math.max(...xs) - 8);
    let y = mp.cy;
    for (let k = 0; k <= 20; k++) { const yy = Math.min(...pts.map((p) => p.y)) + (Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))) * k / 20; if (pointInPoly(x, yy, pts)) { y = yy; if (k > 6) break; } }
    return validWeight({ x, y }, pts);
  }
  function validWeight(w, pts) {
    if (pointInPoly(w.x, w.y, pts)) return { x: w.x, y: w.y };
    const e = distToPolyEdge(w, pts);
    if (e.d <= WEIGHT_R * 1.4) return { x: w.x, y: w.y };
    const dx = w.x - e.p.x, dy = w.y - e.p.y, d = Math.hypot(dx, dy) || 1;
    return { x: e.p.x + dx / d * WEIGHT_R, y: e.p.y + dy / d * WEIGHT_R };
  }

  // 機体の重さ・重心・風の中心などの指標 (編集画面と診断で共通)
  function planeStats(pts, weight, wm = WEIGHT_M) {
    const mp = massProps(pts); if (!mp.ok) return null;
    const mb = mp.A * PLANE_DENSITY, m = mb + wm;
    const w = weight || autoWeight(mp.pts);
    const cog = { x: (mb * mp.cx + wm * w.x) / m, y: (mb * mp.cy + wm * w.y) / m };
    const xs = mp.pts.map((p) => p.x), len = Math.max(20, Math.max(...xs) - Math.min(...xs));
    const cp = windCenter(mp.pts);
    return { mp, mb, m, cog, cp, len, margin: (cog.x - cp.x) / len, load: m / len, w, wm };
  }

  function buildPlane(design) {
    const st = planeStats(design.pts, design.weight, design.wm);
    const { mp, mb, m, cog, w, wm } = st;
    let I = mp.I * PLANE_DENSITY + mb * ((mp.cx - cog.x) ** 2 + (mp.cy - cog.y) ** 2) + wm * ((w.x - cog.x) ** 2 + (w.y - cog.y) ** 2);
    I = Math.max(60, I);
    const local = mp.pts.map((p) => ({ x: p.x - cog.x, y: p.y - cog.y }));
    const sign = polyArea(local) > 0 ? 1 : -1;
    const segs = [], cps = [];
    for (let i = 0; i < local.length; i++) {
      const a = local[i], b = local[(i + 1) % local.length];
      const L = dist(a, b); if (L < 0.5) continue;
      const ex = (b.x - a.x) / L, ey = (b.y - a.y) / L;
      const nx = sign > 0 ? ey : -ey, ny = sign > 0 ? -ex : ex;   // 外向き法線
      const n = Math.max(1, Math.ceil(L / 14));
      for (let k = 0; k < n; k++) {
        segs.push({ x: a.x + (b.x - a.x) * (k + 0.5) / n, y: a.y + (b.y - a.y) * (k + 0.5) / n, L: L / n, nx, ny });
        cps.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
      }
    }
    const xs = local.map((p) => p.x), ys = local.map((p) => p.y);
    const bbox = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    let eye = { x: bbox.x1 * 0.55, y: bbox.y0 * 0.3 };
    if (!pointInPoly(eye.x, eye.y, local)) eye = pointInPoly(0, 0, local) ? { x: 0, y: 0 } : { x: local[0].x * 0.5, y: local[0].y * 0.5 };
    return {
      plane: true, local, segs, cps, mass: m, I, wheels: [], bbox, eye, width: bbox.x1 - bbox.x0, totalMass: m,
      weightLocal: { x: w.x - cog.x, y: w.y - cog.y }, margin: st.margin, load: st.load, len: st.len,
      source: design.source, verts: local.length,
    };
  }

  // ---------------- コース ----------------
  function genPlaneCourse(id) {
    const c = PCOURSES[id];
    const dx = 20, x0 = -200;
    let goal, goalEnd, end, platY, hole = () => false, updrafts = [], head = 0;
    let hAt;
    if (id === 0) {
      platY = -380; goal = 1500; goalEnd = 2150; end = 3400;
      hAt = (x) => {
        if (x <= 160) return platY;
        if (x <= 240) return platY + (x - 160) / 80 * 260;
        let y = -120 + Math.min(x - 240, 1160) * 0.075 + 16 * Math.sin((x - 240) / 150);
        if (x > 1400) y = -120 + 1160 * 0.075 + 16 * Math.sin(1160 / 150) + 5 * Math.sin((x - 1400) / 60);
        if (x > goalEnd) y -= Math.min(x - goalEnd, 1100) * 0.3;
        return y;
      };
    } else if (id === 1) {
      platY = -420; goal = 1960; goalEnd = 3000; end = 4300;
      updrafts = [{ x0: 560, x1: 1020, s: 320 }, { x0: 1220, x1: 1700, s: 320 }];
      hAt = (x) => {
        if (x <= 150) return platY;
        if (x <= 230) return platY + (x - 150) / 80 * 670;
        if (x <= 1880) return 250 + 15 * Math.sin(x / 90);
        if (x <= 1960) return 250 + 15 * Math.sin(1880 / 90) - (x - 1880) / 80 * (70 + 15 * Math.sin(1880 / 90));
        return 180 + 5 * Math.sin(x / 70) - (x > goalEnd ? Math.min(x - goalEnd, 1100) * 0.3 : 0);
      };
    } else {
      platY = -650; goal = 2100; goalEnd = 2650; end = 3600; head = -35;
      hole = (x) => (x >= 1000 && x < 2040) || (x >= 2710 && x < 3050);
      hAt = (x) => {
        if (x <= 140) return platY;
        if (x <= 220) return platY + (x - 140) / 80 * 770;
        if (x < 2040) return 120 + 10 * Math.sin(x / 80);
        if (x < 2100) return 400 - (x - 2040) / 60 * 460;
        if (x <= 2650) return -60 + 4 * Math.sin(x / 40);
        if (x < 2710) return -60 + (x - 2650) / 60 * 460;
        return 120 + 10 * Math.sin(x / 80);
      };
    }
    const wallTop = (x) => (x < -150 ? platY - 300 + (x + 200) * 2 : null);
    const pts = [], holes = [];
    for (let x = x0; x <= end; x += dx) { const wt = wallTop(x); pts.push({ x, y: wt !== null ? wt : hAt(x) }); }
    for (let i = 0; i < pts.length - 1; i++) holes.push(hole(pts[i].x));
    let maxY = -Infinity; for (const p of pts) maxY = Math.max(maxY, p.y);
    const wind = (x, y, t) => {
      let wx = head ? head + 25 * Math.sin(t * 1.3 + x / 300) : 0, wy = 0;
      for (const u of updrafts) {
        if (x > u.x0 && x < u.x1) { const k = Math.sin((x - u.x0) / (u.x1 - u.x0) * Math.PI) * clamp((y + 520) / 160, 0, 1); wy -= u.s * k; }  // 上空では弱まる
      }
      return { x: wx, y: wy };
    };
    return { id, ...c, plane: true, goal, goalEnd, pts, holes, dx, x0, maxY, wind, updrafts, head, launchX: 70, platY, padEnd: [160, 150, 140][id] + 40 };
  }
  const planeCourseCache = {};
  const getPlaneCourse = (id) => planeCourseCache[id] || (planeCourseCache[id] = genPlaneCourse(id));

  // ---------------- シミュレーション ----------------
  function makePlaneSim(machine, course) {
    const ch = makeBody(machine.mass, machine.I);
    const sim = {
      plane: true, machine, course, ch, wheels: [], t: 0, phase: 'aim',
      aimAng: S.lastAim ? S.lastAim.ang : -0.12, aimPow: S.lastAim ? S.lastAim.pow : 0.75,
      puffs: PUFFS, prevBoost: true, energy: 100, emptyAt: [], stunts: 0,
      startX: course.launchX, bestX: course.launchX, flips: 0, unwrapped: 0, flipRef: 0, lastA: 0,
      inAir: false, airT: 0, airRot: 0, flyT: 0, stopT: 0, landed: false, crashed: false, touched: false,
      noseDownT: 0, stallT: 0, stalls: 0, upT: 0, maxSpeed: 0, pitchSum: 0, pitchN: 0, wSum: 0,
      ended: false, result: null, wob: 0, eyeState: 'normal', chContacts: 0, upsideT: 0, spinT: 0, events: [], takeoffSpeed: 0,
    };
    placeOnPad(sim);
    return sim;
  }
  function placeOnPad(sim) {
    const { ch, machine, course } = sim;
    ch.a = sim.aimAng; ch.vx = ch.vy = ch.w = 0;
    const ca = Math.cos(ch.a), sa = Math.sin(ch.a);
    let bottom = -Infinity; for (const p of machine.local) bottom = Math.max(bottom, p.x * sa + p.y * ca);
    ch.x = course.launchX; ch.y = course.platY - bottom - 4; ch.lastA = ch.a; sim.lastA = ch.a;
  }
  function launchPlane(sim) {
    const spd = 220 + 430 * sim.aimPow;
    sim.phase = 'fly'; sim.ch.vx = Math.cos(sim.aimAng) * spd; sim.ch.vy = Math.sin(sim.aimAng) * spd; sim.ch.w = 0;
    S.lastAim = { ang: sim.aimAng, pow: sim.aimPow };
    sim.launchAng = sim.aimAng; Snd.whistle(true);
  }

  function stepPlane(sim, input) {
    const { ch, machine: m, course } = sim;
    if (sim.phase === 'aim') return { contacts: 0, impactF: 0 };
    ch.vy += (course.g || G) * DT;
    const ca = Math.cos(ch.a), sa = Math.sin(ch.a);
    let fx = 0, fy = 0, tq = 0;
    const aeroK = m.rocket ? (course.id === 2 ? 0 : ROCKET_AERO) : 1;   // 月には空気がない
    const wv = course.wind(ch.x, ch.y, sim.t);   // 機体全体に同じ風 (風の境目で急に回されないように)
    for (const sg of m.segs) {
      const rx = sg.x * ca - sg.y * sa, ry = sg.x * sa + sg.y * ca;
      const nx = sg.nx * ca - sg.ny * sa, ny = sg.nx * sa + sg.ny * ca;
      let relx = wv.x - (ch.vx - ch.w * ry), rely = wv.y - (ch.vy + ch.w * rx);
      let sp = Math.hypot(relx, rely);
      if (sp > 900) { relx *= 900 / sp; rely *= 900 / sp; sp = 900; }
      const vn = relx * nx + rely * ny;
      let Fx = AERO_T * sg.L * sp * (relx - vn * nx) * aeroK, Fy = AERO_T * sg.L * sp * (rely - vn * ny) * aeroK;
      if (vn < 0) { const f = AERO_K * sg.L * sp * vn * aeroK; Fx += f * nx; Fy += f * ny; }
      fx += Fx; fy += Fy; tq += rx * Fy - ry * Fx;
    }
    // 見えない昇降舵トリム: 空中ではわずかに機首上げ → どんな形でも少し揚力が出る
    if (!sim.touched && !m.rocket) { const q = ch.vx * ch.vx + ch.vy * ch.vy; tq -= (S.trimK ?? TRIM_K) * m.len * Math.min(q, 640000); }
    if (m.rocket && sim.firing) {   // エンジンの推力: 機体の向き(右=前)に、エンジンの位置でかかる
      const ex = m.engineLocal.x * ca - m.engineLocal.y * sa, ey = m.engineLocal.x * sa + m.engineLocal.y * ca;
      const Fx = THRUST * ca, Fy = THRUST * sa; fx += Fx; fy += Fy; tq += ex * Fy - ey * Fx;
    }
    ch.vx += fx * ch.im * DT; ch.vy += fy * ch.im * DT; ch.w += tq * ch.iI * DT;
    if (input.bal && !sim.ended) { if (ch.w * input.bal < PITCH_MAXW) ch.w += input.bal * PITCH_ACC * DT; }
    // 地面との接触 (車と同じ仕組み)
    const contacts = [];
    let chC = 0;
    for (const lp of m.cps) {
      const px = ch.x + lp.x * ca - lp.y * sa, py = ch.y + lp.x * sa + lp.y * ca;
      const g = groundSeg(course, px);
      if (!g || g.hole) continue;
      const s = (g.b.y - g.a.y) / (g.b.x - g.a.x);
      const gy = g.a.y + (px - g.a.x) * s;
      if (py > gy && py - gy < 45) {
        const inv = 1 / Math.sqrt(1 + s * s);
        addContact(contacts, ch, px, py, s * inv, -inv, (py - gy) * inv, 0.7);
        chC++;
      }
    }
    sim.chContacts = chC;
    for (let it = 0; it < ITER; it++) for (const c of contacts) solveContact(c);
    let impact = 0; for (const c of contacts) impact += c.jn;
    const impactF = impact / DT / (m.mass * G);
    if (impactF > 9) sim.wob = Math.min(0.2, sim.wob + impactF * 0.004);
    ch.x += ch.vx * DT; ch.y += ch.vy * DT; ch.a += ch.w * DT; ch.w *= 0.999;
    sim.t += DT;
    return { contacts: contacts.length, impactF };
  }

  function updateFlight(sim) {
    const inp = S.input, ch = sim.ch, course = sim.course;
    const boostEdge = (inp.boost && !sim.prevBoost) || inp.tap; sim.prevBoost = inp.boost; inp.tap = false;
    if (sim.phase === 'aim') {
      const d = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (d) { sim.aimAng = clamp(sim.aimAng + d * 0.9 * DT, -1.25, 0.25); placeOnPad(sim); }
      if (boostEdge) launchPlane(sim);
      return { contacts: 0 };
    }
    if (boostEdge && sim.puffs > 0 && !sim.ended) {
      sim.puffs--; const dx = Math.cos(ch.a), dy = Math.sin(ch.a);
      ch.vx += dx * PUFF_V; ch.vy += dy * PUFF_V; Snd.boing(); bubble('ふーっ!');
      for (let i = 0; i < 14; i++) S.particles.push({ x: ch.x - dx * 60, y: ch.y - dy * 60, vx: -dx * 120 + (Math.random() - 0.5) * 80, vy: -dy * 120 + (Math.random() - 0.5) * 80, a: 0, va: 0, c: '#ffffff', life: 0.6 });
    }
    const bal = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const wasAir = sim.inAir;
    const r = stepPlane(sim, { bal });
    if (!isFinite(ch.x) || !isFinite(ch.y)) { endFlight(sim, false, 'crash'); return r; }
    // 回転回数
    const da = ch.a - sim.lastA; sim.lastA = ch.a; sim.unwrapped += da;
    if (Math.abs(sim.unwrapped - sim.flipRef) >= Math.PI * 2) {
      const dir = Math.sign(sim.unwrapped - sim.flipRef); sim.flipRef += dir * Math.PI * 2; sim.flips++; Snd.whistle(dir > 0);
      if (!sim.touched) bubble('ちゅうがえり!');
    }
    const sp = Math.hypot(ch.vx, ch.vy); sim.maxSpeed = Math.max(sim.maxSpeed, sp);
    sim.inAir = r.contacts === 0;
    if (!sim.touched && (sim.inAir || ch.x <= course.padEnd)) {
      sim.flyT += DT;
      const vAng = Math.atan2(ch.vy, ch.vx), aoa = Math.atan2(Math.sin(ch.a - vAng), Math.cos(ch.a - vAng));
      sim.pitchSum += Math.atan2(Math.sin(ch.a), Math.cos(ch.a)); sim.pitchN++; sim.wSum += Math.abs(ch.w);
      if (Math.sin(ch.a) > 0.6 && ch.vy > 250) sim.noseDownT += DT;
      if (sp < 170 && aoa < -0.6) { if (sim.stallT === 0) sim.stalls++; sim.stallT += DT; if (sim.stalls === 1 && sim.stallT < DT * 2) bubble('あれ? とまった?'); } else sim.stallT = 0;
      const w = course.wind(ch.x, ch.y, sim.t);
      if (w.y < -150) { sim.upT += DT; if (sim.upT > 0.5 && sim.upT < 0.5 + DT * 1.5) bubble('ふわ〜っ!'); }
      if (sim.flyT > 6 && sim.flyT < 6 + DT * 1.5) bubble('まだ とんでる!');
    }
    if (!sim.inAir && !sim.touched && ch.x > course.padEnd) {
      sim.touched = true; sim.touchX = ch.x;
      const gt = groundSeg(course, ch.x), slope = gt ? (gt.b.y - gt.a.y) / (gt.b.x - gt.a.x) : 0;
      const impactV = (ch.vy - ch.vx * slope) / Math.sqrt(1 + slope * slope);
      const noseIn = Math.sin(ch.a - Math.atan(slope));
      sim.touchV = impactV;
      if (impactV > 300 || (noseIn > 0.7 && sp > 300)) { sim.crashed = true; Snd.snap(); bubble('ぺちゃっ!'); sim.wob = 0.2; }
      else if (Math.cos(ch.a) > 0.7) bubble('ふわり ちゃくりく');
    }
    sim.bestX = Math.max(sim.bestX, ch.x);
    sim.upsideT = Math.cos(ch.a) < -0.3 ? sim.upsideT + DT : 0;
    sim.wob *= 0.96;
    // 判定
    const g = groundSeg(course, ch.x);
    const inPit = g && g.hole && ch.y > Math.max(g.a.y, g.b.y) - 40;
    if (inPit || ch.y > course.maxY + 500 || ch.x < -260) { endFlight(sim, false, 'out'); return r; }
    if (r.contacts > 0 && sp < 25) sim.stopT += DT; else sim.stopT = 0;
    if (sim.stopT > 0.6) {
      const onTarget = ch.x >= course.goal;
      endFlight(sim, onTarget, onTarget ? 'goal' : (sim.crashed ? 'crash' : 'short'));
      return r;
    }
    if (sim.t > course.limit) { endFlight(sim, false, 'timeout'); return r; }
    return r;
  }

  function diagnosePlane(sim, reason) {
    const m = sim.machine;
    const meanPitch = sim.pitchN ? sim.pitchSum / sim.pitchN : 0;
    if (reason === 'puff' ) return 'puff';
    if (sim.flips > 0 && m.margin < 0.03) return 'tail';
    if (sim.noseDownT > 0.6 || (meanPitch > 0.5 && m.margin > 0.18)) return 'nose';
    if (sim.stalls >= 1 && m.margin < 0.04) return 'tail';
    if (m.load > PLANE_HEAVY) return 'wing';
    if (sim.flips > 0 || sim.wSum / Math.max(1, sim.pitchN) > 1.6) return 'shape';
    if (sim.stalls >= 1) return 'launch';
    if (m.margin > 0.24) return 'nose';
    return sim.puffs > 0 ? 'puff' : 'wing';
  }

  function endFlight(sim, success, reason) {
    if (sim.ended) return;
    sim.ended = true; Snd.silence();
    const m = sim.machine, course = sim.course;
    const landX = sim.touchX !== undefined ? Math.max(sim.touchX, sim.ch.x) : sim.bestX;
    const dist = Math.max(0, (Math.min(landX, course.goalEnd + 200) - sim.startX) / UNIT_PER_M);
    const stability = Math.round(clamp(100 - (sim.wSum / Math.max(1, sim.pitchN)) * 45, 0, 100));
    const res = { vehicle: 'plane', goal: success, reason, time: sim.flyT, dist, stability, flips: sim.flips, stunts: 0, course: S.course, titles: [], why: null };
    if (success) {
      if (sim.puffs === PUFFS) res.titles.push({ t: 'SKY KING' });
      if (!sim.crashed && Math.cos(sim.ch.a) > 0.8) res.titles.push({ t: 'SOFT LANDING' });
    }
    if (sim.flyT > 7) res.titles.push({ t: 'LONG GLIDER' });
    if (sim.flips >= 1) res.titles.push({ t: 'LOOP STAR' });
    if (m.source === 'draw' && success) res.titles.push({ t: 'CREATIVE BUILDER' });
    if (dist < 12) res.titles.push({ t: 'ただの紙くず', silly: true });
    if (sim.noseDownT > 0.6 && !success) res.titles.push({ t: 'まっさかさま職人', silly: true });
    if (sim.crashed) res.titles.push({ t: 'ぺちゃんこ', silly: true });
    if (reason === 'timeout') res.titles.push({ t: '風まかせ', silly: true });
    if (!res.titles.length) res.titles.push(success ? { t: 'ナイス着陸' } : { t: '見習いパイロット', silly: true });
    if (!success) {
      const toGoal = (course.goal - landX) / UNIT_PER_M;
      res.why = (reason === 'short' && toGoal < 12 && sim.puffs > 0) ? 'puff' : diagnosePlane(sim, reason);
      S.fixHint = WHY[res.why].target;
    } else S.fixHint = null;
    const key = 'p' + S.course;
    const b = store.d.best[key] || {};
    let newBest = false;
    if (!b.dist || dist > b.dist) { b.dist = dist; newBest = true; }
    if (success && !b.goal) { b.goal = true; newBest = true; }
    store.d.best[key] = b;
    const firstRun = !store.d.playedPlane; store.d.playedPlane = true; store.save();
    res.newBest = newBest; res.firstRun = firstRun;
    S.lastResult = res;
    sim.eyeState = success ? 'happy' : 'dizzy';
    if (success) { Snd.goal(); confetti(); } else { Snd.fail(); sim.wob = 0.2; }
    if (!success) { const msg = { out: 'おちた〜…', short: 'とどかなかった…', crash: 'ぺちゃんこ…', timeout: 'どこまでも〜' }[reason]; S.bubbles = [{ text: msg, t0: sim.t, life: 3 }]; }
    setTimeout(() => showResult(res, sim), success ? 1300 : 1000);
  }

  // ---------------- 描画 (飛行機専用の部分) ----------------
  function drawWindZones(sim, t, vx0, vx1, top, bottom) {
    const course = sim.course;
    for (const u of course.updrafts) {
      if (u.x1 < vx0 || u.x0 > vx1) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(u.x0, top, u.x1 - u.x0, bottom - top);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4;
      for (let k = 0; k < 4; k++) {
        const x = u.x0 + (u.x1 - u.x0) * (k + 0.5) / 4;
        for (let y = bottom - ((t * 160 + k * 70) % 140); y > top; y -= 140) {
          ctx.beginPath(); ctx.moveTo(x - 14, y + 12); ctx.lineTo(x, y); ctx.lineTo(x + 14, y + 12); ctx.stroke();
        }
      }
    }
    if (course.head) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3;
      for (let k = 0; k < 14; k++) {
        const y = top + (bottom - top) * ((k * 37) % 100) / 100;
        const x = vx1 - (((t * 260 + k * 173) % (vx1 - vx0 + 200)));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60, y); ctx.stroke();
      }
    }
  }

  function drawTarget(course) {
    const g0 = groundSeg(course, course.goal), g1 = groundSeg(course, course.goalEnd);
    if (!g0 || !g1) return;
    ctx.fillStyle = 'rgba(255,216,74,0.35)';
    for (let x = course.goal; x < course.goalEnd; x += 40) {
      const g = groundSeg(course, x); if (!g) continue;
      ctx.fillRect(x, g.a.y - 6, 20, 12);
    }
    drawFlag(course, course.goal, true);
  }

  function drawWeightClip(c, w) {
    c.save(); c.translate(w.x, w.y);
    c.beginPath(); c.arc(0, 0, WEIGHT_R, 0, Math.PI * 2); c.fillStyle = '#9aa3b5'; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = '#3a3f4f'; c.stroke();
    c.beginPath(); c.arc(0, 0, WEIGHT_R * 0.45, 0, Math.PI * 2); c.fillStyle = '#d7dce6'; c.fill();
    c.restore();
  }

  function drawAim(sim) {
    const ch = sim.ch, spd = 220 + 430 * sim.aimPow;
    let x = ch.x, y = ch.y, vx = Math.cos(sim.aimAng) * spd, vy = Math.sin(sim.aimAng) * spd;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 14; i++) { for (let k = 0; k < 6; k++) { vy += G * 0.01 * 0.55; x += vx * 0.01; y += vy * 0.01; } ctx.beginPath(); ctx.arc(x, y, 5 - i * 0.25, 0, Math.PI * 2); ctx.fill(); }
  }

  // ====================================================================
  // ROCKET モード: エンジン(ノズル)の推力 + 飛行機と同じ空気の力
  // ====================================================================
  const THRUST = 4300;              // エンジンの推力
  const ENGINE_M = 0.4;             // エンジンの質量
  const ROCKET_AERO = 0.2;          // ロケットの空気の力 (ひれの前縁で止まりすぎないよう弱める)
  const FUEL_BURN = 14;             // 1秒あたりの燃料消費
  const ROCKET_TURN = 3.2, ROCKET_MAXW = 2.2;
  const RING_FUEL = 15;
  const ROCKET_STAB_OK = 0.05;

  const RCOURSES = [
    { name: 'TO THE CLOUDS', jp: 'くもの上へ', limit: 30, sky: ['#7cc8ff', '#d8f1ff'], ground: '#6f4b2b', grass: '#5cbf4f' },
    { name: 'STAR RINGS', jp: 'ほしの わっか', limit: 45, sky: ['#ffb27a', '#ffe9cf'], ground: '#6e4426', grass: '#e6a83a' },
    { name: 'MOON LANDING', jp: 'つきに ちゃくりく', limit: 75, sky: ['#141638', '#2d2f6b'], ground: '#8d8fa3', grass: '#c9cbd9' },
  ];

  Object.assign(WHY, {
    rheavy: { icon: '🐘', text: 'おもすぎて あがらない', fix: 'ちいさく・かるく かこう', target: 'body' },
    fins: { icon: '🌀', text: 'ぐるぐる まわった', fix: 'うしろに ひれを おおきく かこう', target: 'body' },
    engine: { icon: '↗️', text: 'ななめに とんだ', fix: 'エンジンを まんなかへ', target: 'weight' },
    fuel: { icon: '⛽', text: 'ねんりょう ぎれ', fix: 'ほそく・かるく すると もっと たかく', target: 'body' },
    ring: { icon: '⭕', text: 'わっかを はずした', fix: '◀▶で すこしずつ むきを かえよう', target: null },
    slow: { icon: '🐢', text: 'おりるのが ゆっくりすぎ', fix: 'ときどき はなして おちよう', target: null },
    fast: { icon: '💥', text: 'ちゃくりくが はやすぎ', fix: 'じめんの てまえで ふんしゃして ブレーキ', target: null },
    offpad: { icon: '🎯', text: 'ちゃくりく ばしょが ずれた', fix: '◀▶で かたむけて ねらおう', target: null },
    tipped: { icon: '🙃', text: 'たおれちゃった', fix: 'まっすぐ たてて ゆっくり おりよう', target: null },
  });

  const ROCKET_TEMPLATES = {
    pencil() { return { pts: [[10, 50], [66, 79], [200, 79], [240, 85], [200, 91], [66, 91], [10, 120], [26, 85]].map(([x, y]) => ({ x, y })) }; },
    classic() { return { pts: [[16, 46], [62, 70], [170, 70], [238, 85], [170, 100], [62, 100], [16, 124], [40, 85]].map(([x, y]) => ({ x, y })) }; },
    onigiri() {
      const pts = []; const c = [[60, 36], [226, 85], [60, 134]];
      for (let i = 0; i < 3; i++) { const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 3]; for (let k = 1; k < 6; k++) pts.push({ x: ax + (bx - ax) * k / 6, y: ay + (by - ay) * k / 6 }); }
      return { pts };
    },
  };

  function autoEngine(pts) {
    const mp = massProps(pts); if (!mp.ok) return { x: 40, y: 85 };
    const xs = pts.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
    for (let x = x0 + 4; x < x1; x += 3) if (pointInPoly(x + 6, mp.cy, pts)) return { x: x + 8, y: mp.cy };
    return validWeight({ x: x0 + 10, y: mp.cy }, pts);
  }

  function genRocketCourse(id) {
    const c = RCOURSES[id];
    const dx = 20, x0 = -2600, end = 2600, pts = [], holes = [];
    let g = G, goalAlt = 0, rings = [], pad = { x0: -60, x1: 60 }, fuel = 100, startAir = null;
    let hAt = () => 0;
    if (id === 0) { goalAlt = 300; }
    else if (id === 1) {
      goalAlt = 520;
      rings = [[100, 0], [200, 110], [300, -100], [410, 70], [520, -30]].map(([alt, x]) => ({ x, y: -alt * UNIT_PER_M, r: 170, passed: false }));
    } else {
      g = G * 0.3; fuel = 100; pad = { x0: 240, x1: 760 };
      startAir = { x: 380, y: -3200, vx: 15 };
      hAt = (x) => {
        if (x >= pad.x0 - 20 && x <= pad.x1 + 20) return 0;
        let y = 18 * Math.sin(x / 130) + 10 * Math.sin(x / 47);
        for (const cx of [-300, 60, 1000, 1400]) { const d = (x - cx) / 90; if (Math.abs(d) < 1) y += 45 * (1 - d * d); }
        return y - 10;
      };
    }
    for (let x = x0; x <= end; x += dx) pts.push({ x, y: hAt(x) });
    for (let i = 0; i < pts.length - 1; i++) holes.push(false);
    const wind = () => ({ x: 0, y: 0 });
    return { id, ...c, rocket: true, g, goalAlt, rings, pad, fuel, startAir, pts, holes, dx, x0, maxY: 200, goal: 1, goalEnd: 1, wind, updrafts: [], head: 0 };
  }
  const rocketCourseCache = {};
  const getRocketCourse = (id) => { const k = id; rocketCourseCache[k] = genRocketCourse(id); return rocketCourseCache[k]; };

  function buildRocket(design) {
    const m = buildPlane({ pts: design.pts, weight: design.weight, wm: ENGINE_M, source: design.source });
    m.rocket = true; m.plane = false; m.engineLocal = m.weightLocal;
    m.twr = THRUST / (m.mass * G);
    m.stab = rocketStability(m);
    return m;
  }
  // 安定度: 実際の空気の計算で、少し傾けて1秒飛ばし、ゆれが小さくなるか (プラスなら安定)
  function rocketStability(m) {
    let a = 0.2, w = 0, vx = 700, vy = 0;
    const iI = 1 / m.I, im = 1 / m.mass;
    let late = 0;
    for (let n = 0; n < 150; n++) {
      const ca = Math.cos(a), sa = Math.sin(a);
      let fy = 0, tq = 0;
      for (const sg of m.segs) {
        const rx = sg.x * ca - sg.y * sa, ry = sg.x * sa + sg.y * ca, nx = sg.nx * ca - sg.ny * sa, ny = sg.nx * sa + sg.ny * ca;
        const relx = -(vx - w * ry), rely = -(vy + w * rx), sp = Math.hypot(relx, rely), vn = relx * nx + rely * ny;
        let Fx = AERO_T * sg.L * sp * (relx - vn * nx) * ROCKET_AERO, Fy = AERO_T * sg.L * sp * (rely - vn * ny) * ROCKET_AERO;
        if (vn < 0) { const f = AERO_K * sg.L * sp * vn * ROCKET_AERO; Fx += f * nx; Fy += f * ny; }
        fy += Fy; tq += rx * Fy - ry * Fx;
      }
      vy += fy * im * DT; w += tq * iI * DT; a += w * DT;
      if (n >= 100) late = Math.max(late, Math.abs(Math.atan2(Math.sin(a - Math.atan2(vy, vx)), Math.cos(a - Math.atan2(vy, vx)))));
    }
    return 1 - late / 0.2;
  }

  function makeRocketSim(machine, course) {
    const ch = makeBody(machine.mass, machine.I);
    const sim = {
      rocket: true, machine, course, ch, wheels: [], t: 0, phase: 'aim', firing: false,
      fuel: course.fuel, rings: course.rings.map((r) => ({ ...r })), ringsPassed: 0, maxAlt: 0, lifted: false,
      startX: 0, bestX: 0, flips: 0, unwrapped: 0, flipRef: 0, lastA: 0, wSum: 0, wN: 0, fuelOutT: null,
      touched: false, stopT: 0, landV: 0, crashed: false, emptyAt: [], stunts: 0, puffs: 0, energy: 100,
      ended: false, result: null, wob: 0, eyeState: 'normal', chContacts: 0, upsideT: 0, events: [], inAir: false, airT: 0,
    };
    const a = -Math.PI / 2;
    ch.a = a; sim.lastA = a;
    if (course.startAir) {
      ch.x = course.startAir.x; ch.y = course.startAir.y; ch.vx = course.startAir.vx; ch.vy = 0; sim.phase = 'fly'; sim.lifted = true;
    } else {
      let bottom = -Infinity; for (const p of machine.local) bottom = Math.max(bottom, -p.x);
      ch.x = 0; ch.y = -bottom - 2;
    }
    return sim;
  }

  const rocketAlt = (sim) => Math.max(0, -sim.ch.y / UNIT_PER_M);

  function updateRocket(sim) {
    const inp = S.input, ch = sim.ch, course = sim.course, m = sim.machine;
    if (sim.phase === 'aim') {
      if (inp.boost || inp.tap) { sim.phase = 'fly'; Snd.start(); bubble('はっしゃ!'); }
      inp.tap = false;
      if (sim.phase === 'aim') return { contacts: 0 };
    }
    inp.tap = false;
    sim.firing = !!inp.boost && sim.fuel > 0 && !sim.ended;
    if (sim.firing) {
      sim.fuel = Math.max(0, sim.fuel - FUEL_BURN * DT);
      if (sim.fuel === 0 && sim.fuelOutT === null) { sim.fuelOutT = sim.t; bubble('ぷしゅー… ねんりょう ぎれ'); }
      if (Math.random() < 0.5) {
        const ca = Math.cos(ch.a), sa = Math.sin(ch.a), e = m.engineLocal;
        const px = ch.x + e.x * ca - e.y * sa - ca * 20, py = ch.y + e.x * sa + e.y * ca - sa * 20;
        S.particles.push({ x: px, y: py, vx: -ca * 160 + (Math.random() - 0.5) * 70 + ch.vx * 0.3, vy: -sa * 160 + (Math.random() - 0.5) * 70 + ch.vy * 0.3, a: 0, va: 0, c: 'rgba(255,255,255,0.8)', life: 0.7 });
      }
    }
    const bal = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (bal && ch.w * bal < ROCKET_MAXW) ch.w += bal * ROCKET_TURN * DT;
    else if (!bal) ch.w *= course.id === 2 ? 0.95 : 0.996;   // 姿勢制御: ◀▶を離すと回転が止まる (月では強め)
    const r = stepPlane(sim, { bal: 0 });
    if (!isFinite(ch.x) || !isFinite(ch.y)) { endRocket(sim, false, 'crash'); return r; }
    // 回転
    const da = ch.a - sim.lastA; sim.lastA = ch.a; sim.unwrapped += da;
    if (Math.abs(sim.unwrapped - sim.flipRef) >= Math.PI * 2) { sim.flipRef += Math.sign(sim.unwrapped - sim.flipRef) * Math.PI * 2; sim.flips++; Snd.whistle(true); bubble('ぐるぐる〜!'); }
    const alt = rocketAlt(sim); sim.maxAlt = Math.max(sim.maxAlt, alt);
    if (alt > 8) sim.lifted = true;
    if (sim.lifted && !sim.touched) { sim.wSum += Math.abs(ch.w); sim.wN++; }
    // わっか
    for (const rg of sim.rings) {
      if (rg.passed) continue;
      if (sim.prevY > rg.y && ch.y <= rg.y) {
        if (Math.abs(ch.x - rg.x) < rg.r) { rg.passed = true; sim.ringsPassed++; sim.fuel = Math.min(100, sim.fuel + RING_FUEL); Snd.pop(); bubble('わっか くぐった! +' + RING_FUEL); miniConfetti(); }
        else rg.missed = true;
      }
    }
    sim.prevY = ch.y;
    // 目標
    if (course.id === 0 && alt >= course.goalAlt) { endRocket(sim, true, 'goal'); return r; }
    if (course.id === 1) { const top = sim.rings[sim.rings.length - 1]; if (top.passed) { endRocket(sim, true, 'goal'); return r; } }
    // 着地・接地
    const sp = Math.hypot(ch.vx, ch.vy);
    if (r.contacts > 0 && sim.lifted && !sim.touched) {
      sim.touched = true; sim.landV = sp;
      const up = Math.cos(ch.a + Math.PI / 2);
      if (sp > (course.id === 2 ? 230 : 200)) { sim.crashed = true; Snd.snap(); bubble('ぺちゃっ!'); sim.wob = 0.2; }
      else if (course.id === 2 && sp < 140 && up > 0.9) bubble('そ〜っと…');
    }
    if (r.contacts > 0 && sim.lifted && sp < 18) sim.stopT += DT; else sim.stopT = 0;
    if (sim.stopT > 0.6) {
      if (course.id === 2) {
        const up = Math.cos(ch.a + Math.PI / 2), onPad = ch.x >= course.pad.x0 && ch.x <= course.pad.x1;
        const ok = !sim.crashed && up > 0.8 && onPad;
        endRocket(sim, ok, ok ? 'goal' : sim.crashed ? 'crash' : up <= 0.8 ? 'tipped' : 'offpad');
      } else endRocket(sim, false, sim.crashed ? 'crash' : 'fall');
      return r;
    }
    if (!sim.lifted && sim.t > 4 && !sim.firing && sp < 5 && sim.phase === 'fly') { endRocket(sim, false, 'stuck'); return r; }
    if (Math.abs(ch.x) > 2400 || ch.y > 400) { endRocket(sim, false, 'out'); return r; }
    if (sim.t > course.limit) { endRocket(sim, false, 'timeout'); return r; }
    return r;
  }

  function diagnoseRocket(sim, reason) {
    const m = sim.machine, course = sim.course;
    const spin = sim.flips >= 1 || sim.wSum / Math.max(1, sim.wN) > 1.8;
    if (m.twr < 1.15 || (!sim.lifted && reason === 'stuck')) return 'rheavy';
    if (course.id === 2) {
      if (reason === 'timeout') return 'slow';
      if (reason === 'crash') return 'fast';
      if (reason === 'tipped') return 'tipped';
      if (reason === 'offpad') return 'offpad';
    }
    if (spin) return Math.abs(m.engineLocal.y) > 9 ? 'engine' : 'fins';
    if (m.stab < 0) return 'fins';
    if (Math.abs(m.engineLocal.y) > 9) return 'engine';
    if (course.id === 1 && sim.rings.some((r) => r.missed)) return 'ring';
    if (course.id === 2) return reason === 'timeout' ? 'slow' : 'fast';
    return 'fuel';
  }

  function endRocket(sim, success, reason) {
    if (sim.ended) return;
    sim.ended = true; sim.firing = false; Snd.silence();
    const m = sim.machine, course = sim.course;
    const res = { vehicle: 'rocket', goal: success, reason, time: sim.t, dist: sim.maxAlt, stability: Math.round(clamp(100 - (sim.wSum / Math.max(1, sim.wN)) * 40, 0, 100)), flips: sim.flips, stunts: 0, course: S.course, titles: [], why: null };
    if (success) {
      if (course.id === 0) res.titles.push({ t: 'SPACE KING' });
      if (course.id === 1 && sim.ringsPassed === sim.rings.length) res.titles.push({ t: 'RING MASTER' });
      if (course.id === 2) res.titles.push({ t: 'SOFT LANDING' });
      if (sim.flips === 0 && res.stability >= 85) res.titles.push({ t: 'まっすぐロケット' });
      if (m.source === 'draw') res.titles.push({ t: 'CREATIVE BUILDER' });
    }
    if (sim.flips >= 3) res.titles.push({ t: 'ぐるぐるロケット', silly: true });
    if (!sim.lifted) res.titles.push({ t: 'ただの えんとつ', silly: true });
    if (sim.crashed) res.titles.push({ t: 'ぺちゃんこ', silly: true });
    if (!res.titles.length) res.titles.push(success ? { t: 'ナイス ロケット' } : { t: '見習い うちゅうひこうし', silly: true });
    if (!success) { res.why = diagnoseRocket(sim, reason); S.fixHint = WHY[res.why].target; if (res.why === 'fuel' && course.id === 1) res.whyFix = 'わっかを くぐると ねんりょう +' + RING_FUEL; } else S.fixHint = null;
    const key = 'r' + S.course, b = store.d.best[key] || {};
    let newBest = false;
    if (!b.dist || sim.maxAlt > b.dist) { b.dist = sim.maxAlt; newBest = true; }
    if (success && !b.goal) { b.goal = true; newBest = true; }
    store.d.best[key] = b;
    const firstRun = !store.d.playedRocket; store.d.playedRocket = true; store.save();
    res.newBest = newBest; res.firstRun = firstRun;
    S.lastResult = res;
    sim.eyeState = success ? 'happy' : 'dizzy';
    if (success) { Snd.goal(); confetti(); } else { Snd.fail(); sim.wob = 0.2; }
    if (!success) { const msg = { crash: 'ぺちゃんこ…', fall: 'おちてきた〜', tipped: 'ころん…', offpad: 'ここ どこ…', stuck: 'うごかない…', out: 'どこまでも〜', timeout: 'じかんぎれ〜' }[reason]; S.bubbles = [{ text: msg, t0: sim.t, life: 3 }]; }
    setTimeout(() => showResult(res, sim), success ? 1300 : 1000);
  }

  // ---------------- 描画 ----------------
  function drawRocketSky(sim) {
    const alt = Math.max(0, -S.cam.y / UNIT_PER_M), course = sim.course;
    const k = clamp(alt / 700, 0, 1);
    const mix = (a, b) => { const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16); const r = (x) => Math.round(((pa >> x) & 255) * (1 - k) + ((pb >> x) & 255) * k); return `rgb(${r(16)},${r(8)},${r(0)})`; };
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, course.id === 2 ? course.sky[0] : mix(course.sky[0], '#0b0d2a'));
    g.addColorStop(1, course.id === 2 ? course.sky[1] : mix(course.sky[1], '#262a66'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const starA = course.id === 2 ? 1 : clamp((alt - 200) / 300, 0, 1);
    if (starA > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * starA})`;
      for (let i = 0; i < 70; i++) { const x = (i * 137.5) % W, y = ((i * 89.3 - S.cam.y * 0.05) % H + H) % H; ctx.fillRect(x, y, 2, 2); }
    }
    if (course.id === 2) { ctx.beginPath(); ctx.arc(W * 0.8, H * 0.2, 34, 0, Math.PI * 2); ctx.fillStyle = '#4aa8ff'; ctx.fill(); ctx.beginPath(); ctx.ellipse(W * 0.8 - 8, H * 0.2 - 4, 14, 10, 0.5, 0, Math.PI * 2); ctx.fillStyle = '#5cbf4f'; ctx.fill(); }
  }

  function drawRocketWorld(sim, t, vx0, vx1) {
    const course = sim.course;
    // 発射台 / 着陸パッド
    ctx.fillStyle = '#ffd84a';
    if (course.id === 2) { for (let x = course.pad.x0; x < course.pad.x1; x += 40) ctx.fillRect(x, -6, 20, 12); drawFlagAt(course.pad.x0 + 160, 0, 'ちゃくりく'); }
    else { ctx.fillStyle = '#5b5f73'; ctx.fillRect(-70, -8, 140, 10); }
    // 高さの目もり
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '700 18px system-ui, sans-serif'; ctx.textAlign = 'left';
    for (let a = 100; a <= 800; a += 100) { const y = -a * UNIT_PER_M; ctx.fillRect(vx0 + 10, y, 30, 3); ctx.fillText(a + 'm', vx0 + 46, y + 6); }
    // 雲 (ゴールの高さ)
    if (course.id === 0) {
      const y = -course.goalAlt * UNIT_PER_M;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let x = Math.floor(vx0 / 120) * 120; x < vx1; x += 120) { ctx.beginPath(); ctx.ellipse(x, y + 10 * Math.sin(x / 70), 90, 34, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#2b2560'; ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GOAL ' + course.goalAlt + 'm', 0, y - 50);
    }
    // わっか
    for (const rg of sim.rings) {
      ctx.lineWidth = 12; ctx.strokeStyle = rg.passed ? 'rgba(124,255,138,0.9)' : rg.missed ? 'rgba(255,90,120,0.6)' : 'rgba(255,216,74,0.95)';
      ctx.beginPath(); ctx.ellipse(rg.x, rg.y, rg.r, 26, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (sim.rings.length) { const top = sim.rings[sim.rings.length - 1]; ctx.fillStyle = '#fff'; ctx.font = '900 22px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('GOAL', top.x, top.y - 40); }
  }
  function drawFlagAt(x, gy, label) {
    ctx.fillStyle = '#eee'; ctx.fillRect(x - 3, gy - 110, 6, 110);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) { ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff'; ctx.fillRect(x + 3 + c * 10, gy - 110 + r * 10, 10, 10); }
  }

  function drawEngine(c, e, firing, t) {
    c.save(); c.translate(e.x, e.y);
    if (firing) {
      const f = 62 + 22 * Math.sin(t * 50);
      c.beginPath(); c.moveTo(-6, -12); c.quadraticCurveTo(-6 - f * 0.5, -14, -6 - f, 0); c.quadraticCurveTo(-6 - f * 0.5, 14, -6, 12); c.closePath(); c.fillStyle = '#ff6b35'; c.fill();
      c.beginPath(); c.moveTo(-6, -6); c.quadraticCurveTo(-6 - f * 0.3, -7, -6 - f * 0.6, 0); c.quadraticCurveTo(-6 - f * 0.3, 7, -6, 6); c.closePath(); c.fillStyle = '#ffe66b'; c.fill();
    }
    c.beginPath(); c.moveTo(6, -6); c.lineTo(-8, -10); c.lineTo(-8, 10); c.lineTo(6, 6); c.closePath();
    c.fillStyle = '#9aa3b5'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#3a3f4f'; c.stroke();
    c.restore();
  }

  // 編集画面用: 形やエンジンが変わったときだけ安定度を計算し直す
  let stabCache = { key: null, val: 0 };
  function cachedRocketStab(d) {
    const w = d.weight || autoEngine(d.pts);
    const key = d.pts.length + ':' + d.pts.map((p) => (p.x | 0) + ',' + (p.y | 0)).join(';') + '|' + (w.x | 0) + ',' + (w.y | 0);
    if (stabCache.key !== key) stabCache = { key, val: rocketStability(buildRocket({ ...d, weight: w })) };
    return stabCache.val;
  }

  function drawRocketHud(sim, t) {
    const gw = Math.min(170, W * 0.4);
    ctx.fillStyle = 'rgba(20,16,50,.55)'; roundRect(ctx, 10, 10, gw + 16, 26, 13); ctx.fill();
    ctx.fillStyle = sim.fuel > 25 ? '#ff8a35' : '#ff3d5a'; roundRect(ctx, 18, 17, gw * sim.fuel / 100, 12, 6); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('ねんりょう', 22, 27);
    // 高さ
    const alt = rocketAlt(sim);
    ctx.textAlign = 'right'; ctx.font = '900 20px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2560'; ctx.lineWidth = 4;
    const txt = Math.round(alt) + 'm'; ctx.strokeText(txt, W - 14, 32); ctx.fillText(txt, W - 14, 32);
    if (sim.course.id === 2) {
      const v = Math.round(Math.hypot(sim.ch.vx, sim.ch.vy) / 5);
      ctx.font = '800 13px system-ui, sans-serif'; ctx.fillStyle = v > 28 ? '#ff6b8a' : '#9fffb0';
      ctx.strokeText('はやさ ' + v, W - 14, 52); ctx.fillText('はやさ ' + v, W - 14, 52);
    }
    if (sim.phase === 'aim' && !S.rec) {
      ctx.textAlign = 'center'; ctx.font = '900 15px system-ui, sans-serif'; ctx.fillStyle = '#fff';
      const msg = 'BOOSTを ながおしで はっしゃ! ◀▶で むき';
      ctx.strokeText(msg, W / 2, 64); ctx.fillText(msg, W / 2, 64);
    }
    const goal = sim.course.id === 2 ? 1 : (sim.course.id === 0 ? sim.course.goalAlt : 520);
    const prog = sim.course.id === 2 ? 0 : clamp(alt / goal, 0, 1);
    ctx.fillStyle = 'rgba(20,16,50,.35)'; ctx.fillRect(10, H - 10, W - 20, 4);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(10, H - 10, (W - 20) * prog, 4);
  }

  // ====================================================================
  // メインループ (物理は固定タイムステップ)
  // ====================================================================
  let hudT = 0;
  function frame(now) {
    if (S.paused) { requestAnimationFrame(frame); return; }
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
        if (sim.plane) { if (!sim.ended) updateFlight(sim); else stepPlane(sim, { bal: 0 }); }
        else if (sim.rocket) { if (!sim.ended) updateRocket(sim); else { sim.firing = false; stepPlane(sim, { bal: 0 }); } }
        else if (!sim.ended) updateRace(sim);
        else step(sim, { boost: false, bal: 0 }); // 終了後も物理で転がる
        S.acc -= DT; n++;
      }
      if (n >= 10) S.acc = 0;
      for (const p of S.particles) { p.vy += 400 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= dt; }
      S.particles = S.particles.filter((p) => p.life > 0);
      drawWorld(t);
      hudT += dt; if (hudT > 0.1) { hudT = 0; updateHud(); }
      if (sim.rocket) {
        const label = sim.phase === 'aim' ? 'はっしゃ!' : 'ふんしゃ';
        if ($('btnBoost').textContent !== label) $('btnBoost').textContent = label;
      }
      if (sim.plane) {
        const label = sim.phase === 'aim' ? 'とばす!' : 'ふーっ ×' + sim.puffs;
        if ($('btnBoost').textContent !== label) $('btnBoost').textContent = label;
      }
      const nudge = !sim.ended && ((sim.plane || sim.rocket) ? (sim.phase === 'aim' && sim.t === 0 && (S.aimIdle = (S.aimIdle || 0) + dt) > 2.5) : (sim.nudgeT > 1.0 || (sim.boostTime < 0.3 && sim.t > 2.5)));
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
    if (isAir() && d && d.pts.length >= 3) {
      const w = d.weight || (isRocket() ? autoEngine(d.pts) : autoWeight(d.pts));
      if (dist(w, p) < WEIGHT_R * 2.2 || S.tool === 'wheel') {
        pushHistory(); S.dragWeight = true; if (S.fixHint === 'weight') S.fixHint = null;
        d.weight = validWeight(S.tool === 'wheel' ? p : w, d.pts); return;
      }
    }
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
        S.dragVert = { i: vi, orig: d.pts.map((q) => ({ x: q.x, y: q.y })), start: p, wheels: d.wheels.map((w) => ({ x: w.x, y: w.y })), weight: d.weight ? { ...d.weight } : null };
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
    if (S.dragWeight) { S.design.weight = validWeight(p, S.design.pts); return; }
    if (S.dragVert) {
      // 粘土のように: つまんだ点の近くほど大きく動く
      const dv = S.dragVert, o = dv.orig[dv.i];
      const dx = clamp(p.x, -30, EDIT_W + 30) - dv.start.x, dy = clamp(p.y, -30, EDIT_H + 30) - dv.start.y;
      S.design.pts = dv.orig.map((q) => { const k = Math.exp(-((dist(q, o) / 30) ** 2)); return { x: q.x + dx * k, y: q.y + dy * k }; });
      S.design.wheels = dv.wheels.map((w) => validWheel(w, S.design.pts));
      if (S.design.weight) S.design.weight = validWeight(dv.weight || S.design.weight, S.design.pts);
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
    S.design = isRocket() ? { pts: r.pts, wheels: [], weight: autoEngine(r.pts), source: 'draw' } : isPlane() ? { pts: r.pts, wheels: [], weight: autoWeight(r.pts), source: 'draw' } : { pts: r.pts, wheels: autoWheels(r.pts), source: 'draw' };
    S.fixHint = null;
    Snd.pop();
    if (r.corrected) toast('細すぎたので形をふくらませたよ');
    else if (r.selfX) toast('線が交差していたので自動で補正したよ');
  }

  const endPointer = () => {
    if (S.mode !== 'edit') return;
    if (S.dragWeight) { S.dragWeight = false; Snd.pop(); return; }
    if (S.dragWheel >= 0) {
      const d = S.design;
      if (wheelsTooClose(d.pts, d.wheels)) toast('⚠ タイヤが ちかすぎるよ(たおれやすい)');
      S.dragWheel = -1; Snd.pop(); return;
    }
    if (S.dragVert) {
      const dv = S.dragVert; S.dragVert = null;
      if (!massProps(S.design.pts).ok) { S.design.pts = dv.orig; S.design.wheels = dv.wheels; if (dv.weight) S.design.weight = dv.weight; toast('細くなりすぎたので戻したよ'); return; }
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
    const on = (e) => { e.preventDefault(); Snd.init(); S.input[key] = true; if (key === 'boost') S.input.tap = true; el.classList.add('pressed'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* */ } };
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
    if (k && S.mode !== 'edit') { e.preventDefault(); Snd.init(); if (k === 'boost' && !S.input.boost && !e.repeat) S.input.tap = true; S.input[k] = true; }
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
    if (!S.design || S.design.pts.length < 3) { toast(isAir() ? 'さきに かたちを かいてね' : '先に車体を描いてね'); return; }
    if (isAir()) { if (!S.design.weight) { pushHistory(); S.design.weight = isRocket() ? autoEngine(S.design.pts) : autoWeight(S.design.pts); } }
    else if (S.design.wheels.length !== 2) { pushHistory(); S.design.wheels = autoWheels(S.design.pts); }
    setTool('wheel'); Snd.init(); Snd.pop();
  });
  $('btnErase').addEventListener('click', () => { pushHistory(); S.design = { pts: [], wheels: [], source: 'draw' }; S.fixHint = null; setTool('draw'); });
  $('btnUndo').addEventListener('click', undo);
  $('btnStart').addEventListener('click', startRace);
  $('btnRetry').addEventListener('click', startRace);
  $('btnAbort').addEventListener('click', startRace);
  $('btnEdit').addEventListener('click', () => enterEdit(true));
  $('btnNew').addEventListener('click', () => enterEdit(false));
  // 次の行き先へ: モードが変わるときは そのモードの おすすめテンプレートで すぐ走り出す
  const goNext = () => {
    const na = S.nextAction; if (!na) return;
    if (na.v !== S.vehicle) setVehicle(na.v);
    setCourse(na.course); startRace();
  };
  $('btnNext').addEventListener('click', goNext);
  $('btnUnlock').addEventListener('click', goNext);
  $('btnShare').addEventListener('click', share);
  document.querySelectorAll('#courseRow .chip').forEach((b) => b.addEventListener('click', () => setCourse(+b.dataset.course)));
  document.querySelectorAll('#modeRow .chip').forEach((b) => b.addEventListener('click', () => { Snd.init(); setVehicle(b.dataset.mode); Snd.pop(); }));
  // 飛行機の発射: 引っぱって離す
  let aimDrag = null;
  cv.addEventListener('pointerdown', (e) => {
    const sim = S.sim;
    if (S.mode !== 'race' || !sim || !sim.plane || sim.phase !== 'aim') return;
    Snd.init(); cv.setPointerCapture(e.pointerId); aimDrag = canvasPos(e);
  });
  cv.addEventListener('pointermove', (e) => {
    const sim = S.sim;
    if (!aimDrag || !sim || !sim.plane || sim.phase !== 'aim') return;
    const p = canvasPos(e), dx = aimDrag.x - p.x, dy = aimDrag.y - p.y, len = Math.hypot(dx, dy);
    if (len < 12) return;
    sim.aimAng = clamp(Math.atan2(dy, dx), -1.25, 0.25);
    sim.aimPow = clamp(len / 160, 0.15, 1);
    placeOnPad(sim);
  });
  const aimUp = () => {
    const sim = S.sim; if (!aimDrag) return; aimDrag = null;
    if (sim && sim.plane && sim.phase === 'aim') launchPlane(sim);
  };
  cv.addEventListener('pointerup', aimUp);
  cv.addEventListener('pointercancel', () => { aimDrag = null; });
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
    const course = (res.vehicle === 'rocket' ? RCOURSES : res.vehicle === 'plane' ? PCOURSES : COURSES)[res.course];
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
    if (m.plane) drawWeightClip(x, m.weightLocal);
    if (m.rocket) drawEngine(x, m.engineLocal, true, 0.3);
    x.restore();
    // 記録
    x.textAlign = 'left'; x.fillStyle = '#2b2560';
    x.font = '800 34px system-ui, sans-serif'; x.fillText(course.name, 640, 190);
    x.font = '900 72px system-ui, sans-serif'; x.fillText(res.goal && res.vehicle !== 'plane' ? res.time.toFixed(1) + ' s' : Math.round(res.dist) + ' m', 640, 280);
    x.font = '700 28px system-ui, sans-serif'; x.fillText(res.vehicle === 'rocket' ? (res.goal ? 'ミッション成功!' : 'ロケットで ' + Math.round(res.dist) + 'm') : res.vehicle === 'plane' ? (res.goal ? 'ちゃくりく成功!' : 'ひこうきで ' + Math.round(res.dist) + 'm') : res.goal ? 'GOAL!' : '最大到達 ' + Math.round(res.dist) + 'm', 640, 325);
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
    const text = `DRAW & ROLL KING / ${(res.vehicle === 'rocket' ? RCOURSES : res.vehicle === 'plane' ? PCOURSES : COURSES)[res.course].name} ${res.vehicle === 'rocket' ? Math.round(res.dist) + 'm まで とんだ!' + (res.goal ? ' ミッション成功!' : '') : res.vehicle === 'plane' ? Math.round(res.dist) + 'm とんだ!' + (res.goal ? ' ちゃくりく成功!' : '') : res.goal ? res.time.toFixed(1) + '秒でゴール!' : Math.round(res.dist) + 'm 到達'}`;
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
  S.designs.car = S.design;
  refreshModeChips();
  refreshProgress();
  setCourse(0);
  showMode('edit');
  requestAnimationFrame(frame);

  // テスト用フック
  // 録画用: 指定時刻で1フレーム描く(物理は進めない)
  const render = (t, dt) => {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (const p of S.particles) { p.vy += 400 * dt; p.vx *= 0.99; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.life -= dt; }
    S.particles = S.particles.filter((p) => p.life > 0);
    if (S.mode === 'edit') drawEdit(t); else if (S.sim) drawWorld(t);
    updateHud();
  };
  window.__drk = { clearedCount, isCleared, refreshProgress, unlock, isUnlocked, refreshModeChips, rocketStability, buildRocket, makeRocketSim, getRocketCourse, updateRocket, ROCKET_TEMPLATES, autoEngine, rocketAlt, setVehicle, buildPlane, makePlaneSim, getPlaneCourse, updateFlight, stepPlane, launchPlane, placeOnPad, planeStats, PLANE_TEMPLATES, autoWeight, render, drawWorld, drawEdit, showResult, showMode, resize, setTool, confetti, clearCourses: () => { for (const k in courseCache) delete courseCache[k]; }, HEAVY, DENSITY, S, wheelsTooClose, massProps, step, buildMachine, makeSim, getCourse, processStroke, TEMPLATES, startRace, endRace, autoWheels, updateRace };
})();
