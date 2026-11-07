/* EARTH LAP — hyper plane X-100 (top speed = fighter F-X × 100) circling the whole Earth.
   The globe (country colours, borders, mountain height map, atmosphere rim, twinkling stars, landmarks)
   is ported from Earth_feature (cuichunxue/earth_feature): textures are pre-rendered into ./earth/.
   Uses three.js r128 (../shared/three.min.js), lazy-loaded the first time this mode starts.
   Talks to the host page through window.EarthLapHost { onExit, Snd, Save }. */
(function () {
  'use strict';
  const R_KM = 6371, MACH_KMS = 0.34;
  const V_FX = 0.39;               // F-X top speed in km/s (390 m/s)
  const V_MAX = V_FX * 100;        // 39 km/s = Mach 115
  const V_CRUISE = 21, V_MIN = 8;  // km/s
  const TW = 12;                   // time compression shown in HUD
  const LAND = 0.009;              // Earth_feature LAND_HEIGHT (displacement)
  const ALT_MAX = 0.65, SPACE = 100 / R_KM;
  const D = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  const COURSES = [
    { id: 'east', code: 'EARTH 1', name: '世界一周・東回り', time: '昼→夜→昼',
      desc: '東京タワーから太平洋を越えて米国、欧州、エジプト、インド、中国をまわり東京へ戻る一周レース。',
      start: '東京タワー', ring: [['ゴールデン・ゲート・ブリッジ', 60], ['自由の女神', 50], ['エッフェル塔', 55], ['ギザのピラミッド', 45], ['タージ・マハル', 50], ['エベレスト', 75], ['万里の長城', 55], ['東京タワー', 50]] },
    { id: 'south', code: 'EARTH 2', name: '南半球グランドループ', time: '海と山',
      desc: 'シドニーからモアイ像、アンデス山脈のマチュ・ピチュ、リオ、キリマンジャロ、ウルルを結ぶ大周回。',
      start: 'シドニー・オペラハウス', ring: [['モアイ像（イースター島）', 45], ['マチュ・ピチュ', 70], ['コルコバードのキリスト像', 45], ['キリマンジャロ', 65], ['ウルル', 45], ['シドニー・オペラハウス', 45]] },
    { id: 'free', code: 'EARTH ∞', name: 'フリーフライト・発見の旅', time: '自由飛行',
      desc: 'リングなし。宇宙まで上昇して地球を高速でまわしたり、超低空で世界の名所と動物を探そう。', start: '富士山', ring: [] }
  ];

  /* ---------------- save ---------------- */
  const SKEY = 'tsk_earth_v1';
  let SV = { best: {}, found: [] };
  try { const r = localStorage.getItem(SKEY); if (r) SV = Object.assign(SV, JSON.parse(r)); } catch (e) {}
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(SV)); } catch (e) {} };

  /* ---------------- loading ---------------- */
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  let ready = null;
  function boot() {
    if (ready) return ready;
    ready = (async () => {
      if (!window.THREE) { try { await loadScript('../shared/three.min.js'); } catch (e) {} }
      if (!window.THREE) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
      if (!window.EARTH_SPOTS) await loadScript('earth/spots.js');
      const [col, hgt, ids, cld] = await Promise.all(['earth/earth-color.jpg', 'earth/earth-height.jpg', 'earth/earth-ids.png', 'earth/earth-clouds.jpg'].map(loadImg));
      build(col, hgt, ids, cld);
    })();
    ready.catch(() => { ready = null; });
    return ready;
  }

  /* ---------------- geo ---------------- */
  // Earth_feature geo.ts latLonToVector3 (matches SphereGeometry UVs)
  function ll2v(lat, lon, r, out) {
    const phi = (lon + 180) * D, th = (90 - lat) * D;
    return (out || new THREE.Vector3()).set(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
  }
  function v2ll(v) {
    const r = v.length(), lat = 90 - Math.acos(clamp(v.y / r, -1, 1)) / D;
    let lon = Math.atan2(v.z, -v.x) / D - 180; if (lon < -180) lon += 360;
    return [lat, lon];
  }
  let HMAP = null, IMAP = null;
  function sampleH(v) { // terrain height (units) under direction v
    const [lat, lon] = v2ll(v), w = HMAP.w, h = HMAP.h;
    const x = ((lon + 180) / 360) * w - 0.5, y = ((90 - lat) / 180) * h - 0.5;
    const x0 = Math.floor(x), y0 = clamp(Math.floor(y), 0, h - 2), tx = x - x0, ty = clamp(y - y0, 0, 1);
    const g = (xx, yy) => HMAP.d[(yy * w + ((xx % w) + w) % w) * 4];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty) / 255 * LAND;
  }
  function placeName(v) {
    const [lat, lon] = v2ll(v), w = IMAP.w, h = IMAP.h;
    const i = IMAP.d[(clamp(Math.floor((90 - lat) / 180 * h), 0, h - 1) * w + clamp(Math.floor((lon + 180) / 360 * w), 0, w - 1)) * 4];
    if (i > 0 && window.EARTH_NAMES[i - 1]) return window.EARTH_NAMES[i - 1];
    if (lat < -60) return '南極海';
    if (lat > 68) return '北極海';
    if (lon > -70 && lon < 20 && !(lat < 10 && lon < -80)) return lat > 0 && lon > -6 && lon < 36 && lat < 46 ? '地中海' : '大西洋';
    if (lon >= 20 && lon < 120 && lat < 24 && !(lon > 100 && lat > 0)) return 'インド洋';
    return '太平洋';
  }
  const spotByName = n => window.EARTH_SPOTS.find(s => s[2] === n);

  /* ---------------- DOM ---------------- */
  const css = `
#elWrap{position:fixed;inset:0;z-index:60;background:#02040c;touch-action:none;user-select:none;-webkit-user-select:none;overflow:hidden}
#elWrap canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
#elWrap .elb{position:absolute;border-radius:50%;border:2px solid #eef3f1;color:#fff;touch-action:none;font:400 14px var(--display);letter-spacing:.04em;
  display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;padding:0;-webkit-tap-highlight-color:transparent}
#elBoost{right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(22px + env(safe-area-inset-bottom,0px));width:88px;height:88px;
  background:linear-gradient(180deg,#36c7ff,#1a6fff)}
#elBoost.held{box-shadow:0 0 24px 8px rgba(54,199,255,.75);transform:scale(.95)}
#elBoost small,#elRoll small{font:600 10px var(--mono);opacity:.85}
#elRoll{right:calc(118px + env(safe-area-inset-right,0px));bottom:calc(30px + env(safe-area-inset-bottom,0px));width:64px;height:64px;background:rgba(255,106,26,.85);font-size:13px}
#elRoll.held{transform:scale(.92);background:#ff6a1a}
#elView{right:calc(30px + env(safe-area-inset-right,0px));bottom:calc(124px + env(safe-area-inset-bottom,0px));width:52px;height:52px;background:rgba(12,23,32,.7);font-size:22px}
#elPauseB{position:absolute;top:calc(10px + env(safe-area-inset-top,0px));left:calc(10px + env(safe-area-inset-left,0px));width:40px;height:40px;border-radius:10px;
  border:1.5px solid rgba(238,243,241,.45);background:rgba(12,23,32,.6);color:#eef3f1;font:600 14px var(--mono)}
#elStick{position:absolute;left:0;top:64px;bottom:0;width:58%}
#elWrap .elScr{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;background:rgba(2,6,14,.84);overflow-y:auto;touch-action:pan-y;
  padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
#elWrap .elScr .sheet{max-width:520px}
#elWrap .elRes{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font:600 14px var(--mono)}
#elWrap .elRes span{color:#9db0b8}
#elWrap .elRank{font:400 64px var(--display);line-height:1;color:#ffd23f}
#elLoad{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#eef3f1;font:400 18px var(--display);letter-spacing:.06em;text-align:center;padding:20px}
#elWrap [hidden]{display:none!important}
@media (max-height:520px){#elBoost{width:76px;height:76px}#elRoll{width:56px;height:56px;right:calc(104px + env(safe-area-inset-right,0px))}
  #elView{bottom:auto;top:calc(10px + env(safe-area-inset-top,0px));right:calc(180px + env(safe-area-inset-right,0px));width:42px;height:42px;font-size:18px}
  #elWrap .elRank{font-size:44px}#elWrap .elScr .sheet{gap:10px}#elWrap .elScr h2{font-size:26px!important}#elWrap .elScr .lead{display:none}#elWrap .panel{padding:8px 14px!important}#elWrap .toggles label{padding:3px 0!important;min-height:0!important;font-size:13px}}
`;
  let wrap, glc, hud, hx, el = {};
  function makeDom() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    wrap = document.createElement('div'); wrap.id = 'elWrap'; wrap.hidden = true;
    wrap.innerHTML = `<canvas id="elGL"></canvas><canvas id="elHud"></canvas><div id="elStick"></div>
<button type="button" class="elb" id="elRoll">ROLL<small>Z/X</small></button>
<button type="button" class="elb" id="elBoost">BOOST<small>×100</small></button>
<button type="button" class="elb" id="elView" aria-label="視点切替">🌍</button>
<button type="button" id="elPauseB" aria-label="一時停止">II</button>
<div id="elLoad">🌍 地球を読み込み中…</div>
<div class="elScr" id="elPause" hidden><div class="sheet"><h2 class="logo" style="font-size:34px">一時停止</h2>
 <div class="panel toggles"><label><input type="checkbox" id="elOptAssist"> リングアシスト（自動で少しリングへ寄せる）</label>
 <label><input type="checkbox" id="elOptInvert"> 上下操作を反転（下で上昇）</label><label><input type="checkbox" id="elOptSound"> 効果音</label></div>
 <p class="lead" style="margin:0;font-size:13px">左側ドラッグ：左右で旋回・上下で上昇/降下　BOOST：A/B（最高マッハ115）　ROLL：バレルロール　🌍：宇宙ビュー切替<br>PC：←→旋回 ↑↓上昇/降下 Space/B ブースト Z/X ロール V 視点 Esc 一時停止</p>
 <div class="row"><button class="btn primary" id="elResume" type="button">再開 <span class="k">Esc</span></button><button class="btn" id="elRetry" type="button">やり直す <span class="k">R</span></button><button class="btn" id="elQuit" type="button">コース選択へ</button></div></div></div>
<div class="elScr" id="elResult" hidden><div class="sheet"><div class="eyebrow" id="elResT"></div>
 <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div class="elRank" id="elResRank">S</div><div><div class="score" id="elResScore" style="font:400 34px var(--display)">0</div><div class="newbest" id="elResBest" hidden>自己ベスト更新</div></div></div>
 <div class="elRes" id="elResData"></div>
 <div class="row"><button class="btn primary" id="elRetry2" type="button">もう一度 <span class="k">R</span></button><button class="btn" id="elQuit2" type="button">コース選択へ</button></div></div></div>`;
    document.body.appendChild(wrap);
    for (const id of ['elGL', 'elHud', 'elStick', 'elRoll', 'elBoost', 'elView', 'elPauseB', 'elLoad', 'elPause', 'elResult', 'elResT', 'elResRank', 'elResScore', 'elResBest', 'elResData', 'elOptAssist', 'elOptInvert', 'elOptSound']) el[id] = document.getElementById(id);
    glc = el.elGL; hud = el.elHud; hx = hud.getContext('2d');
    bindInput();
  }

  /* ---------------- scene ---------------- */
  let renderer, scene, camera, earth, earthMat, clouds, atmo, stars, starMat, plane, flame, glow, trail, trailGeo, guide, guideGeo, beacon;
  const rings = []; const sprites = [];
  let mini = null;
  function build(col, hgt, ids, cld) {
    const T = THREE, touch = matchMedia('(pointer:coarse)').matches;
    // terrain + country lookups (CPU side)
    const rd = (img, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h); return { w, h, d: x.getImageData(0, 0, w, h).data }; };
    HMAP = rd(hgt, hgt.width, hgt.height); IMAP = rd(ids, ids.width, ids.height);
    mini = document.createElement('canvas'); mini.width = 256; mini.height = 128; mini.getContext('2d').drawImage(col, 0, 0, 256, 128);

    renderer = new T.WebGLRenderer({ canvas: glc, antialias: !touch || devicePixelRatio < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(touch ? 1.5 : 2, devicePixelRatio || 1));
    renderer.outputEncoding = T.sRGBEncoding;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(62, 1, 0.0005, 260);

    const ctex = new T.Texture(col); ctex.encoding = T.sRGBEncoding; ctex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); ctex.needsUpdate = true;
    const htex = new T.Texture(hgt); htex.needsUpdate = true;
    const geo = touch ? new T.SphereGeometry(1, 256, 128) : new T.SphereGeometry(1, 384, 192);
    earthMat = new T.MeshStandardMaterial({ map: ctex, displacementMap: htex, displacementScale: LAND, bumpMap: htex, bumpScale: 0.05, roughness: 0.75, metalness: 0 });
    const uTime = { value: 0 }, uCam = { value: 0 };
    earthMat.onBeforeCompile = sh => { // Earth_feature sea ripples + a fine grain so low-altitude flight shows texture motion
      sh.uniforms.time = uTime; sh.uniforms.camR = uCam;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float time;
uniform float camR;
float elHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float elNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(elHash(i), elHash(i + vec2(1.0, 0.0)), f.x), mix(elHash(i + vec2(0.0, 1.0)), elHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <map_fragment>', `
vec4 texelColor = texture2D(map, vUv);
texelColor = mapTexelToLinear(texelColor);
diffuseColor *= texelColor;
float seaLevel = texture2D(bumpMap, vUv).r;
float sea = 1.0 - smoothstep(0.015, 0.06, seaLevel);
float latR = (vUv.y - 0.5) * PI;
vec2 q = vec2(vUv.x * 360.0 * cos(latR), vUv.y * 180.0) * 0.45;
float wave = sin(q.x + time * 0.35 + 1.6 * sin(q.y * 0.8 + time * 0.2)) * sin(q.y * 1.1 - time * 0.3 + 1.4 * sin(q.x * 0.7 - time * 0.15));
diffuseColor.rgb += sea * smoothstep(0.2, 1.0, wave) * vec3(0.025, 0.04, 0.055);
vec2 g = vec2(vUv.x * 4096.0 * cos(latR), vUv.y * 2048.0) * 1.5;
float grain = elNoise(g) * 0.6 + elNoise(g * 3.7) * 0.4;
diffuseColor.rgb *= 1.0 + 0.2 * (mix(grain, 0.5, sea * 0.6) - 0.5) * clamp(1.0 - camR * 7.0, 0.0, 1.0);
`);
    };
    earthMat.userData.uTime = uTime; earthMat.userData.uCam = uCam;
    earth = new T.Mesh(geo, earthMat); scene.add(earth);

    const cltex = new T.Texture(cld); cltex.needsUpdate = true;
    clouds = new T.Mesh(new T.SphereGeometry(1.0042, touch ? 128 : 192, touch ? 64 : 96),
      new T.MeshStandardMaterial({ color: 0xffffff, alphaMap: cltex, transparent: true, opacity: 0.62, depthWrite: false, roughness: 1 }));
    scene.add(clouds);

    // Earth_feature createAtmosphere
    atmo = new T.Mesh(new T.SphereGeometry(1.12, 96, 48), new T.ShaderMaterial({
      uniforms: { glowColor: { value: new T.Color('#6ec8ff') } },
      vertexShader: 'varying vec3 vNormal; varying vec3 vViewDir; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vNormal = normalize(normalMatrix * normal); vViewDir = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vViewDir; void main(){ float rim = dot(vNormal, vViewDir); float intensity = pow(clamp(0.72 + rim, 0.0, 1.0), 5.0); gl_FragColor = vec4(glowColor, intensity); }',
      side: T.BackSide, blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
    scene.add(atmo);

    // Earth_feature createStars
    { const n = 4000, pos = new Float32Array(n * 3), colr = new Float32Array(n * 3), size = new Float32Array(n), ph = new Float32Array(n);
      const pal = ['#ffffff', '#ffe9a8', '#a8d8ff', '#ffc2e0'].map(c => new T.Color(c)), v = new T.Vector3();
      for (let i = 0; i < n; i++) { v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1); if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; }
        v.normalize().multiplyScalar(60 + Math.random() * 40); v.toArray(pos, i * 3); pal[(Math.random() * 4) | 0].toArray(colr, i * 3);
        size[i] = Math.random() < 0.04 ? 4 + Math.random() * 3 : 1 + Math.random() * 2; ph[i] = Math.random() * Math.PI * 2; }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(colr, 3));
      g.setAttribute('size', new T.BufferAttribute(size, 1)); g.setAttribute('phase', new T.BufferAttribute(ph, 1));
      starMat = new T.ShaderMaterial({ uniforms: { time: { value: 0 }, pixelRatio: { value: renderer.getPixelRatio() } },
        vertexShader: 'attribute float size; attribute float phase; attribute vec3 color; uniform float time; uniform float pixelRatio; varying vec3 vColor; varying float vTwinkle; void main(){ vColor = color; vTwinkle = 0.55 + 0.45 * sin(time * (1.0 + phase * 0.3) + phase * 10.0); gl_PointSize = size * pixelRatio * (0.8 + 0.4 * vTwinkle); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vColor; varying float vTwinkle; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vColor, a * vTwinkle); }',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending });
      stars = new T.Points(g, starMat); stars.frustumCulled = false; scene.add(stars); }

    scene.add(new T.AmbientLight(0x8090c0, 0.55));
    const sun = new T.DirectionalLight(0xffffff, 1.55); sun.position.set(1, 0.35, 0.55); scene.add(sun);
    scene.add(new T.HemisphereLight(0xbfe4ff, 0x1a2040, 0.25));

    plane = makePlane(); scene.add(plane);

    // trail (light streak drawn round the planet)
    const TN = 420; trailGeo = new T.BufferGeometry();
    trailGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(TN * 3), 3));
    const tc = new Float32Array(TN * 3); for (let i = 0; i < TN; i++) { const k = i / TN; tc[i * 3] = 0.3 + 0.7 * k; tc[i * 3 + 1] = 0.6 + 0.3 * k; tc[i * 3 + 2] = 1; }
    trailGeo.setAttribute('color', new T.BufferAttribute(tc, 3)); trailGeo.setDrawRange(0, 0);
    trail = new T.Line(trailGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false }));
    trail.frustumCulled = false; trail.userData.n = 0; trail.userData.N = TN; scene.add(trail);

    guideGeo = new T.BufferGeometry(); guideGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(64 * 3), 3));
    guide = new T.Line(guideGeo, new T.LineBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.75, depthWrite: false }));
    guide.frustumCulled = false; scene.add(guide);

    const bg = new T.CylinderGeometry(1, 1, 1, 10, 1, true); bg.translate(0, 0.5, 0);
    beacon = new T.Mesh(bg, new T.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    scene.add(beacon);

    // landmark & animal emoji sprites (Earth_feature features.ts)
    window.EARTH_SPOTS.forEach((s, i) => {
      const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
      x.fillStyle = s[0] ? 'rgba(255,210,63,.95)' : 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(48, 48, 44, 0, 6.2832); x.fill();
      x.strokeStyle = 'rgba(40,30,60,.6)'; x.lineWidth = 4; x.stroke();
      x.font = '58px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s[1], 48, 52);
      const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding;
      const sp = new T.Sprite(new T.SpriteMaterial({ map: tx, transparent: true, depthWrite: false }));
      const dir = ll2v(s[3], s[4], 1); const sz = s[0] ? 0.011 : 0.0075;
      sp.position.copy(dir).multiplyScalar(1 + sampleH(dir) + sz * 0.7); sp.scale.set(sz, sz, 1);
      sp.userData = { i, dir, sz }; scene.add(sp); sprites.push(sp);
    });
    resize();
  }

  function makePlane() {
    const T = THREE, g = new T.Group();
    const tri = pts => { const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(pts.flat()), 3)); geo.computeVertexNormals(); return geo; };
    const N = [0, 0, -3.2], T1 = [0, 0.3, -0.5], T2 = [0, 0.26, 1.6], B1 = [0, -0.16, -0.4], B2 = [0, -0.18, 1.6];
    const L1 = [-0.42, 0, -0.2], L2 = [-0.5, 0, 1.6], R1 = [0.42, 0, -0.2], R2 = [0.5, 0, 1.6];
    const body = tri([N, L1, T1, T1, L1, L2, T1, L2, T2, N, T1, R1, T1, R1, R2, T1, R2, T2, N, B1, L1, B1, L2, L1, B1, B2, L2, N, B1, R1, B1, R2, R1, B1, B2, R2, T2, L2, B2, T2, R2, B2].reduce((a, p, i) => (i % 3 === 0 ? a.push([p]) : a[a.length - 1].push(p), a), []).flat());
    const wing = tri([[-0.3, 0, -1.0], [-1.7, -0.03, 1.45], [-0.45, 0, 1.6], [0.3, 0, -1.0], [1.7, -0.03, 1.45], [0.45, 0, 1.6]]);
    const tail = tri([[-0.35, 0.15, 0.8], [-0.72, 0.82, 1.7], [-0.42, 0.15, 1.65], [0.35, 0.15, 0.8], [0.72, 0.82, 1.7], [0.42, 0.15, 1.65]]);
    const tips = tri([[-1.35, -0.025, 1.1], [-1.7, -0.03, 1.45], [-1.25, -0.02, 1.5], [1.35, -0.025, 1.1], [1.7, -0.03, 1.45], [1.25, -0.02, 1.5]]);
    const canopy = tri([[0, 0.24, -1.7], [-0.16, 0.13, -1.25], [0, 0.34, -0.85], [0, 0.24, -1.7], [0.16, 0.13, -1.25], [0, 0.34, -0.85]]);
    const m = (c, mt, rg, em) => new T.MeshStandardMaterial({ color: c, metalness: mt, roughness: rg, flatShading: true, side: T.DoubleSide, emissive: em || 0x000000 });
    g.add(new T.Mesh(body, m(0xdfe6ee, 0.45, 0.35, 0x1a1d22)), new T.Mesh(wing, m(0x2d3646, 0.4, 0.45, 0x0b0f16)), new T.Mesh(tail, m(0x2d3646, 0.4, 0.45, 0x0b0f16)),
      new T.Mesh(tips, m(0xff6a1a, 0.2, 0.5, 0x5a1800)), new T.Mesh(canopy, m(0x101826, 0.9, 0.15, 0x0a2a40)));
    const cg = new T.ConeGeometry(0.3, 1, 12, 1, true); cg.rotateX(Math.PI / 2); cg.translate(0, 0, 0.5);
    flame = new T.Mesh(cg, new T.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    flame.position.set(0, 0.02, 1.62); g.add(flame);
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(120,220,255,.8)'); gr.addColorStop(1, 'rgba(40,120,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    glow = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
    glow.position.set(0, 0.02, 1.75); g.add(glow);
    return g;
  }

  function makeRings(course) {
    const T = THREE;
    for (const r of rings) scene.remove(r.mesh); rings.length = 0;
    let prev = ll2v(...spotByName(course.start).slice(3, 5), 1);
    course.ring.forEach(([name, altKm], i) => {
      const s = spotByName(name), c = ll2v(s[3], s[4], 1);
      const back = prev.clone().sub(c.clone().multiplyScalar(c.dot(prev)));
      const n = back.lengthSq() > 1e-9 ? back.normalize().negate() : new T.Vector3(1, 0, 0);
      const ra = Math.max(altKm / R_KM, sampleH(c) + 22 / R_KM), rr = 0.0085;
      const mesh = new T.Mesh(new T.TorusGeometry(rr, rr * 0.075, 8, 56), new T.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.9 }));
      mesh.position.copy(c).multiplyScalar(1 + ra); mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), n);
      scene.add(mesh);
      rings.push({ name, spot: s, c, n, ra, rr, mesh, C: mesh.position.clone(), side: null });
      prev = c;
    });
  }

  /* ---------------- state ---------------- */
  let S = null, course = null, courseIdx = 0, active = false, paused = false, raf = 0, lastT = 0, acc = 0;
  const DT = 1 / 60;
  function newState() {
    const T = THREE, st = spotByName(course.start), p = ll2v(st[3], st[4], 1);
    let f;
    if (rings.length) { const c = rings[0].c; f = c.clone().sub(p.clone().multiplyScalar(p.dot(c))).normalize(); }
    else { f = new T.Vector3(0, 1, 0).cross(p).normalize(); } // eastward
    return { p, f, alt: 75 / R_KM, vs: 0, v: V_CRUISE * 0.7, boost: 1, boosting: false, turn: 0, climb: 0, bank: 0, pitch: 0,
      roll: 0, rollDir: 0, rollT: 0, t: 0, count: 3.2, ring: 0, got: 0, missed: 0, score: 0, center: 0, tricks: 0, found: 0, foundSet: new Set(),
      flash: null, pops: [], fact: null, placeT: 0, shake: 0, maxMach: 0, space: false, low: 0, dayN: 0, sunSide: null, crashes: 0,
      dist: 0, trailT: 0, place: placeName(p), done: false, view: S ? S.view : 0, camP: null, camU: null, lastPlace: '', mach100: false };
  }

  /* ---------------- input ---------------- */
  const keys = new Set(); let stick = null, stickId = null, boostHeld = false, rollQ = 0;
  const GK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyB', 'KeyZ', 'KeyX', 'KeyV']);
  function bindInput() {
    window.addEventListener('keydown', e => {
      if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
      if (GK.has(e.code)) e.preventDefault();
      if (!el.elResult.hidden) { if (e.code === 'KeyR' || e.code === 'Enter') restart(); if (e.code === 'Escape') exit(); return; }
      if (e.code === 'Escape') { paused ? resume() : pause(); return; }
      if (paused) { if (e.code === 'KeyR') restart(); return; }
      if (!e.repeat) { if (e.code === 'KeyZ') rollQ = -1; if (e.code === 'KeyX') rollQ = 1; if (e.code === 'KeyV') toggleView(); if (e.code === 'KeyR') restart(); }
      keys.add(e.code);
    });
    window.addEventListener('keyup', e => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); stick = null; boostHeld = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && active && !paused && S && !S.done) pause(); });
    const sz = el.elStick;
    sz.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; try { sz.setPointerCapture(e.pointerId); } catch (er) {} stick = { ox: e.clientX, oy: e.clientY, nx: 0, ny: 0 }; });
    sz.addEventListener('pointermove', e => { if (e.pointerId !== stickId || !stick) return; const R = 64; stick.nx = clamp((e.clientX - stick.ox) / R, -1, 1); stick.ny = clamp((e.clientY - stick.oy) / R, -1, 1); });
    const end = e => { if (e.pointerId === stickId) { stickId = null; stick = null; } };
    sz.addEventListener('pointerup', end); sz.addEventListener('pointercancel', end);
    const hold = (b, on, off) => { b.addEventListener('pointerdown', e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (er) {} b.classList.add('held'); on(); });
      const up = () => { b.classList.remove('held'); off && off(); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); };
    hold(el.elBoost, () => { boostHeld = true; }, () => { boostHeld = false; });
    hold(el.elRoll, () => { rollQ = stick && stick.nx < -0.2 ? -1 : 1; });
    el.elView.addEventListener('click', () => toggleView());
    el.elPauseB.addEventListener('click', () => pause());
    document.getElementById('elResume').onclick = resume;
    document.getElementById('elRetry').onclick = restart; document.getElementById('elRetry2').onclick = restart;
    document.getElementById('elQuit').onclick = exit; document.getElementById('elQuit2').onclick = exit;
    const H = () => window.EarthLapHost || {};
    el.elOptAssist.onchange = e => { SV.assist = e.target.checked; save(); };
    el.elOptInvert.onchange = e => { const sv = H().Save; if (sv) { sv.d.opt.invert = e.target.checked; sv.write(); } };
    el.elOptSound.onchange = e => { const sv = H().Save; if (sv) { sv.d.opt.sound = e.target.checked; sv.write(); } if (e.target.checked) snd('beep', 880, 0.15, 'triangle', 0.12); };
    window.addEventListener('resize', () => { if (renderer) resize(); });
    wrap.addEventListener('touchmove', e => { if (el.elPause.hidden && el.elResult.hidden) e.preventDefault(); }, { passive: false });
  }
  function readInput() {
    let turn = ((keys.has('ArrowRight') || keys.has('KeyD')) ? 1 : 0) - ((keys.has('ArrowLeft') || keys.has('KeyA')) ? 1 : 0);
    let climb = ((keys.has('ArrowUp') || keys.has('KeyW')) ? 1 : 0) - ((keys.has('ArrowDown') || keys.has('KeyS')) ? 1 : 0);
    if (stick) { const dz = v => Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9; turn += dz(stick.nx); climb += dz(-stick.ny); }
    const sv = (window.EarthLapHost || {}).Save; if (sv && sv.d.opt.invert) climb = -climb;
    const r = rollQ; rollQ = 0;
    return { turn: clamp(turn, -1, 1), climb: clamp(climb, -1, 1), boost: boostHeld || keys.has('Space') || keys.has('KeyB'), roll: r };
  }
  function snd(fn, ...a) { const s = (window.EarthLapHost || {}).Snd; if (s && s[fn]) try { s[fn](...a); } catch (e) {} }

  /* ---------------- simulation ---------------- */
  function step(s, inp, dt) {
    const T = THREE;
    if (s.count > 0) { const c0 = Math.ceil(s.count); s.count -= dt; const c1 = Math.ceil(s.count);
      if (c1 !== c0) { if (c1 > 0) snd('beep', 660, 0.12, 'triangle', 0.1); else { snd('beep', 1320, 0.25, 'triangle', 0.12); snd('swish', 0.7, 0.8); s.flash = { big: 'GO!', sub: 'マッハ115の世界へ', col: '#ffd23f', t: 1.0 }; } }
      return; }
    s.t += dt;
    // --- speed & boost
    s.boosting = inp.boost && s.boost > 0.02;
    const target = s.boosting ? V_MAX : V_CRUISE;
    s.v += clamp(target - s.v, -5 * dt, (s.boosting ? 9 : 3) * dt);
    s.boost = clamp(s.boost + (s.boosting ? -0.16 : 0.045) * dt, 0, 1);
    const mach = s.v / MACH_KMS; s.maxMach = Math.max(s.maxMach, mach);
    if (!s.mach100 && mach >= 100) { s.mach100 = true; s.flash = { big: 'マッハ100突破！', sub: '戦闘機の100倍の世界', col: '#5fd7ff', t: 1.4 }; addScore(s, 500, 'マッハ100 +500', '#5fd7ff'); snd('jingle', true); }
    // --- steering (turn about local up; assist toward next ring)
    const R = rings[s.ring];
    let yaw = inp.turn, assist = 0;
    s.turn += (yaw - s.turn) * Math.min(1, dt * 6);
    let turnRate = -s.turn * 0.95;
    s.climb += (inp.climb - s.climb) * Math.min(1, dt * 5);
    let vsT = s.climb * (0.004 + s.alt * 0.8);
    if (R && SV.assist !== false) {
      const P = s.p.clone().multiplyScalar(1 + s.alt), dd = P.distanceTo(R.C), ahead = R.C.clone().sub(P).dot(s.f) > 0;
      if (dd < 0.14 && ahead) {
        const w = (1 - dd / 0.14) * 0.9 * (1 - Math.abs(inp.turn) * 0.7);
        const d = R.c.clone().sub(s.p.clone().multiplyScalar(s.p.dot(R.c))).normalize();
        const err = Math.atan2(s.p.dot(s.f.clone().cross(d)), s.f.dot(d));
        turnRate += clamp(err * 3, -0.7, 0.7) * w; assist = w;
        vsT += clamp((R.ra - s.alt) * 3, -0.01, 0.01) * w * (1 - Math.abs(inp.climb) * 0.7);
      }
    }
    s.f.applyAxisAngle(s.p, turnRate * dt);
    // terrain look-ahead: automatic pull-up (overridable by diving hard)
    let hA = sampleH(s.p);
    { const ax0 = s.p.clone().cross(s.f).normalize(), step0 = s.v * TW * 0.25 / R_KM;
      for (let k = 1; k <= 4; k++) hA = Math.max(hA, sampleH(s.p.clone().applyAxisAngle(ax0, step0 * k))); }
    const floor = hA + 9 / R_KM; s.terrWarn = s.alt < floor + 6 / R_KM;
    if (s.alt < floor) vsT = Math.max(vsT, (floor - s.alt) * 5 * (1 - Math.max(0, -inp.climb) * 0.8));
    s.vs += (vsT - s.vs) * Math.min(1, dt * 4);
    s.alt = clamp(s.alt + s.vs * dt, 0, ALT_MAX);
    // --- move along great circle
    const ang = s.v * TW * dt / (R_KM * (1 + s.alt));
    const ax = s.p.clone().cross(s.f).normalize();
    s.p.applyAxisAngle(ax, ang).normalize(); s.f.applyAxisAngle(ax, ang);
    s.f.sub(s.p.clone().multiplyScalar(s.p.dot(s.f))).normalize();
    s.dist += ang * R_KM;
    // --- visuals: bank/pitch/roll
    s.bank += (-turnRate * 0.9 * 60 * D - s.bank) * Math.min(1, dt * 5);
    s.pitch += (clamp(s.vs / (0.004 + s.alt * 0.8), -1, 1) * 22 * D - s.pitch) * Math.min(1, dt * 5);
    if (inp.roll && s.rollT <= 0) { s.rollT = 0.7; s.rollDir = inp.roll; snd('swish', 0.6, 0.55); }
    if (s.rollT > 0) { s.rollT -= dt; s.roll = s.rollDir * (1 - Math.max(0, s.rollT) / 0.7) * Math.PI * 2; if (s.rollT <= 0) { s.roll = 0; s.tricks++; addScore(s, 300, 'バレルロール +300', '#ff9f43'); } }
    // --- terrain
    const th = sampleH(s.p), agl = s.alt - th;
    if (agl < 3.5 / R_KM) {
      s.alt = th + 20 / R_KM; s.vs = 0.004; s.v = Math.max(V_MIN, s.v * 0.5); s.boost = Math.max(0, s.boost - 0.25); s.shake = 1; s.crashes++;
      addScore(s, -300, '地表に接触！ -300', '#ff5b5b'); s.flash = { big: '地表に接触！', sub: '山に注意（高度を上げよう）', col: '#ff5b5b', t: 1.2 }; snd('boom');
      try { navigator.vibrate && navigator.vibrate([40, 30, 60]); } catch (e) {}
    } else if (agl < 15 / R_KM) { s.low += dt; s.boost = Math.min(1, s.boost + 0.12 * dt); s.score += Math.round(250 * dt * (s.v / V_CRUISE)); }
    if (!s.space && s.alt > SPACE) { s.space = true; s.flash = { big: '宇宙へ！', sub: '高度100km カーマン・ライン突破', col: '#b084f5', t: 1.4 }; addScore(s, 500, '宇宙到達 +500', '#b084f5'); snd('jingle', true); }
    // --- sunrise / sunset (sun is fixed; at Mach 115 you outrun it)
    const sunSide = s.p.dot(SUN) > 0;
    if (s.sunSide !== null && sunSide !== s.sunSide) { s.dayN++; if (sunSide) { addScore(s, 200, '日の出！ +200', '#ffd23f'); s.flash = { big: '日の出！', sub: `${s.dayN}回目の朝と夜`, col: '#ffd23f', t: 1.0 }; snd('beep', 1047, 0.2, 'sine', 0.07); } else pop(s, '日没…夜側へ', '#9db0ff'); }
    s.sunSide = sunSide;
    // --- rings
    if (R) {
      const P = s.p.clone().multiplyScalar(1 + s.alt), rel = P.clone().sub(R.C), sd = rel.dot(R.n);
      if (R.side !== null && R.side < 0 && sd >= 0 && rel.length() < 0.3) {
        const lat = rel.sub(R.n.clone().multiplyScalar(sd)).length();
        if (lat < R.rr * 1.08) {
          const cen = Math.max(0, 1 - lat / R.rr), bonus = Math.round(cen * 600), rollB = s.rollT > 0 ? 1000 : 0;
          s.got++; s.center += cen; s.boost = Math.min(1, s.boost + 0.4);
          addScore(s, 1000 + bonus + rollB, `RING +${1000 + bonus}${rollB ? ' ロール通過+1000' : ''}`, '#ffd23f');
          s.flash = { big: cen > 0.75 ? 'ど真ん中！' : 'リング通過！', sub: `${R.spot[1]} ${R.name}  ${s.ring + 1}/${rings.length}`, col: cen > 0.75 ? '#ffd23f' : '#ff9f43', t: 1.2 };
          snd('beep', 880, 0.1, 'triangle', 0.09); setTimeout(() => snd('beep', 1320, 0.14, 'triangle', 0.09), 80);
        } else { s.missed++; s.flash = { big: 'リングを逃した', sub: `${R.name}  ${s.ring + 1}/${rings.length}`, col: '#ff5b5b', t: 1.2 }; snd('beep', 300, 0.2, 'square', 0.06, 200); }
        discover(s, R.spot);
        R.mesh.visible = false; s.ring++; R.side = null;
        if (s.ring >= rings.length) finish(s);
      } else R.side = sd;
    }
    // --- discoveries
    if (s.alt < 0.09) for (const sp of sprites) {
      const i = sp.userData.i; if (s.foundSet.has(i)) continue;
      if (sp.userData.dir.dot(s.p) > Math.cos(220 / R_KM)) discover(s, window.EARTH_SPOTS[i]);
    }
    // --- place name
    s.placeT -= dt; if (s.placeT <= 0) { s.placeT = 0.25; const n = placeName(s.p); if (n !== s.place) { s.place = n; } }
    // --- trail
    s.trailT -= dt; if (s.trailT <= 0) { s.trailT = 0.035; pushTrail(s); }
    if (s.flash) { s.flash.t -= dt; if (s.flash.t <= 0) s.flash = null; }
    for (const q of s.pops) q.t -= dt; s.pops = s.pops.filter(q => q.t > 0);
    if (s.fact) { s.fact.t -= dt; if (s.fact.t <= 0) s.fact = null; }
    s.shake = Math.max(0, s.shake - dt * 1.6);
  }
  const SUN = { x: 0, y: 0, z: 0, dot: null };
  function addScore(s, n, txt, col) { s.score = Math.max(0, s.score + n); pop(s, txt, col); }
  function pop(s, txt, col) { s.pops.push({ txt, col, t: 1.6 }); if (s.pops.length > 4) s.pops.shift(); }
  function discover(s, spot) {
    const i = window.EARTH_SPOTS.indexOf(spot); if (i < 0 || s.foundSet.has(i)) return;
    s.foundSet.add(i); s.found++;
    const fresh = !SV.found.includes(i); if (fresh) { SV.found.push(i); save(); }
    addScore(s, spot[0] ? 200 : 120, `${spot[1]} ${spot[2]} 発見！ +${spot[0] ? 200 : 120}${fresh ? ' NEW' : ''}`, spot[0] ? '#ffd23f' : '#a3e048');
    s.fact = { e: spot[1], n: spot[2], f: spot[5], t: 5 };
    s.boost = Math.min(1, s.boost + 0.1);
    snd('beep', 1568, 0.1, 'sine', 0.07); setTimeout(() => snd('beep', 2093, 0.14, 'sine', 0.06), 60);
    const sp = sprites[i]; if (sp) sp.material.opacity = 0.5;
  }
  function pushTrail(s) {
    const a = trailGeo.attributes.position.array, N = trail.userData.N;
    const back = s.p.clone().multiplyScalar(1 + s.alt).addScaledVector(s.f, -planeScale(s) * 1.7);
    let n = trail.userData.n;
    if (n >= N) { a.copyWithin(0, 3); n = N - 1; }
    a[n * 3] = back.x; a[n * 3 + 1] = back.y; a[n * 3 + 2] = back.z; n++;
    trail.userData.n = n; trailGeo.setDrawRange(0, n); trailGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- camera & render ---------------- */
  const camDist = s => 0.0105 + s.alt * 1.55;
  const planeScale = s => camDist(s) * 0.105;
  function toggleView() { if (!S) return; S.view = S.view ? 0 : 1; snd('beep', S.view ? 520 : 780, 0.1, 'triangle', 0.08); }
  function updateScene(s, dt, now) {
    const T = THREE;
    const P = s.p.clone().multiplyScalar(1 + s.alt), up = s.p, right = s.f.clone().cross(up).normalize();
    // plane orientation: basis (right, up, back), then pitch & bank/roll
    const m = new T.Matrix4().makeBasis(right, up, s.f.clone().negate());
    plane.quaternion.setFromRotationMatrix(m);
    plane.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), s.pitch));
    plane.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), s.bank + s.roll));
    plane.position.copy(P); const ps = planeScale(s); plane.scale.setScalar(ps);
    const fl = s.boosting ? 2.6 + Math.random() * 0.8 : 0.9 + Math.random() * 0.25;
    flame.scale.set(1, 1, fl); flame.material.color.setHex(s.boosting ? 0x8fe8ff : 0xff9a4a);
    glow.scale.setScalar(s.boosting ? 0.75 : 0.4);
    // camera
    const cd = camDist(s);
    let cp, cu, look;
    if (s.view === 0) {
      cp = P.clone().addScaledVector(s.f, -cd).addScaledVector(up, cd * 0.3);
      cu = up.clone(); look = P.clone().addScaledVector(s.f, cd * 0.55).addScaledVector(up, cd * 0.06);
    } else {
      const r = 2.25 + s.alt; cp = s.p.clone().multiplyScalar(r * 0.82).addScaledVector(s.f, -r * 0.5); cu = s.f.clone(); look = P.clone().multiplyScalar(0.55);
    }
    if (s.shake > 0) cp.add(new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(cd * 0.08 * s.shake));
    if (!s.camP) { s.camP = cp.clone(); s.camU = cu.clone(); s.camL = look.clone(); }
    const k = Math.min(1, dt * (s.view ? 3 : 10));
    s.camP.lerp(cp, k); s.camU.lerp(cu, k).normalize(); s.camL.lerp(look, k);
    if (s.camP.length() < 1 + sampleH(s.camP) + 0.0012) s.camP.setLength(1 + sampleH(s.camP) + 0.0012);
    camera.position.copy(s.camP); camera.up.copy(s.camU); camera.lookAt(s.camL);
    const camR = s.camP.length() - 1;
    camera.near = clamp(camR * 0.05, 0.0003, 0.08); camera.far = 260;
    camera.fov = s.view ? 50 : 60 + (s.v - V_CRUISE) / (V_MAX - V_CRUISE) * 14; camera.updateProjectionMatrix();
    // rings & guide
    rings.forEach((r, i) => { r.mesh.visible = i >= s.ring && i <= s.ring + 1; if (!r.mesh.visible) return; const nx = i === s.ring;
      r.mesh.material.color.setHex(nx ? 0xff6a1a : 0xffd23f); r.mesh.material.opacity = nx ? 0.95 : 0.35;
      const sc = nx ? 1 + 0.06 * Math.sin(now * 0.008) : 0.8; r.mesh.scale.setScalar(sc); });
    const R = rings[s.ring];
    if (R && !s.done) {
      beacon.visible = true; beacon.position.copy(R.c); beacon.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), R.c);
      beacon.scale.set(0.0012 + camR * 0.004, 0.09, 0.0012 + camR * 0.004);
      const a = guideGeo.attributes.position.array, om = Math.acos(clamp(s.p.dot(R.c), -1, 1)), so = Math.sin(om);
      for (let i = 0; i < 64; i++) { const t = i / 63, w0 = so > 1e-6 ? Math.sin((1 - t) * om) / so : 1 - t, w1 = so > 1e-6 ? Math.sin(t * om) / so : t;
        const v = s.p.clone().multiplyScalar(w0).addScaledVector(R.c, w1).normalize(), al = s.alt + (R.ra - s.alt) * t;
        v.multiplyScalar(1 + Math.max(al, sampleH(v) + 0.001)); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; }
      guideGeo.attributes.position.needsUpdate = true; guide.visible = SV.guide !== false;
    } else { beacon.visible = false; guide.visible = false; }
    // sprites: grow a little when far so they read from orbit
    const sf = clamp(1 + camR * 2.2, 1, 3.2);
    for (const sp of sprites) { const z = Math.min(sp.userData.sz * sf, sp.position.distanceTo(camera.position) * 0.055); sp.scale.set(z, z, 1); }
    earthMat.userData.uCam.value = camR;
    earthMat.userData.uTime.value = now / 1000; starMat.uniforms.time.value = now / 1000; stars.rotation.y = now * 0.000003;
    clouds.rotation.y += dt * 0.004;
    renderer.render(scene, camera);
  }

  /* ---------------- HUD ---------------- */
  let W = 0, H = 0, DPR = 1;
  function resize() {
    W = wrap.clientWidth || innerWidth; H = wrap.clientHeight || innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
    hud.width = Math.round(W * DPR); hud.height = Math.round(H * DPR);
    if (renderer) { renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
  }
  const FD = '"Dela Gothic One","Hiragino Sans","Yu Gothic",sans-serif', FM = '"IBM Plex Mono",ui-monospace,Menlo,monospace';
  const fmtT = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
  function txt(t, x, y, font, col, align, stroke) {
    hx.font = font; hx.textAlign = align || 'left'; hx.textBaseline = 'middle';
    if (stroke !== false) { hx.lineWidth = 4; hx.strokeStyle = 'rgba(2,6,14,.75)'; hx.strokeText(t, x, y); }
    hx.fillStyle = col; hx.fillText(t, x, y);
  }
  function drawHud(s, now) {
    hx.setTransform(DPR, 0, 0, DPR, 0, 0); hx.clearRect(0, 0, W, H);
    const sm = Math.min(W, H) < 420, safeT = 10, cx = W / 2;
    // speed lines (sense of velocity, stronger with boost and near the ground)
    const agl = s.alt - sampleH(s.p), intensity = clamp((s.v - 12) / 27, 0, 1) * clamp(1.4 - agl * 40, 0.25, 1) * (s.count > 0 ? 0 : 1) * (s.view ? 0.2 : 1);
    if (intensity > 0.02) {
      hx.save(); hx.globalCompositeOperation = 'lighter';
      const n = Math.round(10 + 34 * intensity), cy = H * 0.46;
      for (let i = 0; i < n; i++) {
        const a = (i * 2.399 + Math.floor(now / 70) * 0.7 * (i % 3)) % 6.2832, r0 = (0.25 + ((i * 0.618 + now * 0.0021 * (1 + i % 4)) % 1) * 0.7) * Math.max(W, H) * 0.62;
        const len = 30 + 120 * intensity, x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0;
        hx.strokeStyle = s.boosting ? `rgba(120,220,255,${0.25 * intensity})` : `rgba(255,255,255,${0.18 * intensity})`; hx.lineWidth = 1.5;
        hx.beginPath(); hx.moveTo(x0, y0); hx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); hx.stroke();
      }
      hx.restore();
    }
    // top centre: time / rings / place
    const ringTxt = course.ring.length ? `RING ${Math.min(s.ring + 1, rings.length)}/${rings.length}` : `発見 ${s.found}  (図鑑 ${SV.found.length}/${window.EARTH_SPOTS.length})`;
    const narrow = W < 520, mw = narrow ? 104 : Math.round(clamp(W * 0.3, 120, 220)), mh = mw / 2, mx = W - mw - 10, my = safeT;
    const tcx = narrow ? (56 + mx) / 2 : cx;
    txt(fmtT(s.t), tcx, safeT + 16, `400 ${sm ? 22 : 26}px ${FD}`, '#eef3f1', 'center');
    txt(ringTxt, tcx, safeT + 40, `600 ${sm ? 11 : 12}px ${FM}`, '#ffd23f', 'center');
    if (narrow) { txt(`${s.place || ''} 上空`, 12, safeT + 66, `500 12px ${FD}`, '#bfe4ff'); txt(`SCORE ${s.score.toLocaleString()}`, 12, safeT + 200, `600 11px ${FM}`, '#eef3f1'); }
    else { txt(`${s.place || ''} 上空`, tcx, safeT + 58, `500 ${sm ? 12 : 13}px ${FD}`, '#bfe4ff', 'center'); txt(s.score.toLocaleString(), 58, safeT + 20, `400 ${sm ? 16 : 18}px ${FD}`, '#eef3f1'); }
    // speed block
    const mach = s.v / MACH_KMS, by = narrow ? safeT + 100 : safeT + 52;
    txt(`マッハ ${mach.toFixed(mach < 10 ? 1 : 0)}`, 12, by + 8, `400 ${sm ? 20 : 24}px ${FD}`, s.boosting ? '#5fd7ff' : '#eef3f1');
    txt(`${s.v.toFixed(1)} km/s · F-X×${(s.v / V_FX).toFixed(0)}`, 12, by + 32, `600 11px ${FM}`, '#9db0b8');
    txt(`高度 ${Math.round(s.alt * R_KM)} km${s.alt > SPACE ? '  宇宙' : agl < 15 / R_KM ? '  超低空!' : ''}`, 12, by + 48, `600 11px ${FM}`, agl < 15 / R_KM ? '#ff9f43' : s.alt > SPACE ? '#b084f5' : '#9db0b8');
    if (s.terrWarn && s.count <= 0) txt('⚠ 山岳 PULL UP', cx, H * 0.34, `400 ${sm ? 16 : 20}px ${FD}`, Math.floor(now / 250) % 2 ? '#ff5b5b' : '#ffd23f', 'center');
    txt(`時間圧縮 ×${TW}`, 12, by + 64, `600 10px ${FM}`, '#6f8790');
    // boost bar
    const bw = sm ? 110 : 140, bx = 12, bby = by + 78;
    hx.fillStyle = 'rgba(12,23,32,.7)'; hx.fillRect(bx, bby, bw, 8); hx.fillStyle = s.boosting ? '#5fd7ff' : '#1a8fff'; hx.fillRect(bx, bby, bw * s.boost, 8);
    hx.strokeStyle = 'rgba(238,243,241,.5)'; hx.lineWidth = 1; hx.strokeRect(bx + 0.5, bby + 0.5, bw - 1, 7);
    txt('BOOST', bx + bw + 6, bby + 4, `600 10px ${FM}`, '#9db0b8');
    // mini map (top right)
    hx.globalAlpha = 0.9; hx.drawImage(mini, mx, my, mw, mh); hx.globalAlpha = 1; hx.strokeStyle = 'rgba(238,243,241,.6)'; hx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    const mp = v => { const [la, lo] = v2ll(v); return [mx + (lo + 180) / 360 * mw, my + (90 - la) / 180 * mh]; };
    rings.forEach((r, i) => { if (i < s.ring) return; const [x, y] = mp(r.c); hx.fillStyle = i === s.ring ? '#ff6a1a' : 'rgba(255,210,63,.8)'; hx.beginPath(); hx.arc(x, y, i === s.ring ? 3.5 : 2.2, 0, 6.2832); hx.fill(); });
    { const [x, y] = mp(s.p), [x2, y2] = mp(s.p.clone().addScaledVector(s.f, 0.05)); let dx = x2 - x, dy = y2 - y; if (Math.abs(dx) > mw / 2) dx = -Math.sign(dx) * 2; const l = Math.hypot(dx, dy) || 1;
      hx.fillStyle = '#5fd7ff'; hx.beginPath(); hx.arc(x, y, 3.5, 0, 6.2832); hx.fill(); hx.strokeStyle = '#5fd7ff'; hx.lineWidth = 2; hx.beginPath(); hx.moveTo(x, y); hx.lineTo(x + dx / l * 9, y + dy / l * 9); hx.stroke(); }
    // next ring: distance + arrow / bracket
    const R = rings[s.ring];
    if (R && s.count <= 0 && !s.done) {
      const P = s.p.clone().multiplyScalar(1 + s.alt), km = Math.acos(clamp(s.p.dot(R.c), -1, 1)) * R_KM;
      const dAlt = Math.round((R.ra - s.alt) * R_KM);
      txt(`${R.spot[1]} ${R.name}`, mx + mw, my + mh + 12, `500 12px ${FD}`, '#ffd23f', 'right');
      txt(`残り ${Math.round(km).toLocaleString()} km  ${dAlt > 3 ? '▲' + dAlt : dAlt < -3 ? '▼' + (-dAlt) : '高度OK'}`, mx + mw, my + mh + 28, `600 11px ${FM}`, '#eef3f1', 'right');
      const v = R.C.clone().project(camera), behind = R.C.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) < 0;
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      const on = !behind && sx > 30 && sx < W - 30 && sy > 90 && sy < H - 40;
      if (on) {
        const rad = clamp(R.rr * 1.2 / Math.max(1e-4, camera.position.distanceTo(R.C)) * H * 0.9, 10, 90);
        hx.strokeStyle = '#ff6a1a'; hx.lineWidth = 2.5; const b = rad + 6;
        for (const [qx, qy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { hx.beginPath(); hx.moveTo(sx + qx * b, sy + qy * (b - 10)); hx.lineTo(sx + qx * b, sy + qy * b); hx.lineTo(sx + qx * (b - 10), sy + qy * b); hx.stroke(); }
      } else {
        let dx = sx - cx, dy = sy - H / 2; if (behind) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx), ex = cx + Math.cos(a) * Math.min(W * 0.42, Math.abs((W * 0.42) / (Math.cos(a) || 1e-6))), ey = H / 2 + Math.sin(a) * Math.min(H * 0.36, Math.abs((H * 0.36) / (Math.sin(a) || 1e-6)));
        const ax = clamp(ex, 40, W - 40), ay = clamp(ey, 100, H - 60);
        hx.save(); hx.translate(ax, ay); hx.rotate(a); hx.fillStyle = '#ff6a1a'; hx.strokeStyle = 'rgba(2,6,14,.7)'; hx.lineWidth = 3;
        hx.beginPath(); hx.moveTo(18, 0); hx.lineTo(-10, -12); hx.lineTo(-4, 0); hx.lineTo(-10, 12); hx.closePath(); hx.stroke(); hx.fill(); hx.restore();
      }
    }
    // fact ticker
    if (s.fact) {
      hx.globalAlpha = Math.min(1, s.fact.t * 2);
      const port = H > W, maxW = port ? Math.min(W - 24, 560) : Math.min(W - 260, 560);
      hx.font = `500 13px ${FD}`; const nl = wrapText(s.fact.f, maxW - 24).length, fy = port ? Math.max(H * 0.25, 232) : Math.min(H * 0.68, H - 40 - 30 - nl * 18);
      hx.font = `500 13px ${FD}`; const lines = wrapText(s.fact.f, maxW - 24);
      const bh = 30 + lines.length * 18; hx.fillStyle = 'rgba(2,6,14,.62)'; roundRect(cx - maxW / 2, fy, maxW, bh, 10); hx.fill();
      txt(`${s.fact.e} ${s.fact.n}`, cx, fy + 15, `400 15px ${FD}`, '#ffd23f', 'center', false);
      lines.forEach((l, i) => txt(l, cx, fy + 34 + i * 18, `500 13px ${FD}`, '#eef3f1', 'center', false));
      hx.globalAlpha = 1;
    }
    // pops
    s.pops.forEach((q, i) => { hx.globalAlpha = Math.min(1, q.t * 1.5); txt(q.txt, cx, H * 0.58 - i * 22 - (1.6 - q.t) * 12, `400 ${sm ? 13 : 15}px ${FD}`, q.col, 'center'); });
    hx.globalAlpha = 1;
    // flash / countdown
    if (s.count > 0) txt(String(Math.ceil(s.count)), cx, H * 0.42, `400 ${sm ? 72 : 96}px ${FD}`, '#ffd23f', 'center');
    if (s.count > 0) txt(course.ring.length ? `${course.name}　スタート：${course.start}` : course.name, cx, H * 0.42 + (sm ? 56 : 70), `500 14px ${FD}`, '#eef3f1', 'center');
    if (s.flash) { hx.globalAlpha = Math.min(1, s.flash.t * 2.5); txt(s.flash.big, cx, H * 0.44, `400 ${sm ? 30 : 40}px ${FD}`, s.flash.col, 'center'); txt(s.flash.sub, cx, H * 0.44 + (sm ? 30 : 38), `500 13px ${FD}`, '#eef3f1', 'center'); hx.globalAlpha = 1; }
    // stick
    if (stick) { hx.strokeStyle = 'rgba(238,243,241,.5)'; hx.lineWidth = 2; hx.beginPath(); hx.arc(stick.ox, stick.oy, 64, 0, 6.2832); hx.stroke();
      hx.fillStyle = 'rgba(95,215,255,.7)'; hx.beginPath(); hx.arc(stick.ox + stick.nx * 64, stick.oy + stick.ny * 64, 22, 0, 6.2832); hx.fill(); }
  }
  function wrapText(t, w) { const out = []; let line = ''; for (const ch of t) { if (hx.measureText(line + ch).width > w && line) { out.push(line); line = ''; } line += ch; } if (line) out.push(line); return out.slice(0, 3); }
  function roundRect(x, y, w, h, r) { hx.beginPath(); hx.moveTo(x + r, y); hx.arcTo(x + w, y, x + w, y + h, r); hx.arcTo(x + w, y + h, x, y + h, r); hx.arcTo(x, y + h, x, y, r); hx.arcTo(x, y, x + w, y, r); hx.closePath(); }

  /* ---------------- engine sound (re-uses the host Snd graph) ---------------- */
  function engine(s, on) {
    const sn = (window.EarthLapHost || {}).Snd; if (!sn || !sn.ok || !sn.ctx || sn.ctx.state !== 'running') return;
    const t = sn.ctx.currentTime, go = on && sn.on() && s && s.count <= 0 && !s.done, k = s ? (s.v - V_MIN) / (V_MAX - V_MIN) : 0;
    sn.eg.gain.setTargetAtTime(go ? 0.08 + k * 0.12 : 0, t, 0.15);
    sn.whg.gain.setTargetAtTime(go ? 0.015 + k * 0.03 : 0, t, 0.2);
    sn.wg.gain.setTargetAtTime(go ? 0.18 + k * 0.24 : 0, t, 0.2);
    if (s) { sn.o1.frequency.setTargetAtTime(120 + k * 90, t, 0.3); sn.o2.frequency.setTargetAtTime(242 + k * 185, t, 0.3); sn.wh.frequency.setTargetAtTime(1100 + k * 1300, t, 0.4); }
  }

  /* ---------------- flow ---------------- */
  function loop(now) {
    if (!active) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - (lastT || now)) / 1000); lastT = now;
    if (!paused && S && !S.done) {
      acc += dt; let n = 0;
      while (acc >= DT && n < 8) { acc -= DT; n++; step(S, readInput(), DT); if (S.done) break; }
    }
    engine(S, !paused);
    if (S) { updateScene(S, dt, now); drawHud(S, now); }
  }
  function begin() {
    const sun = new THREE.Vector3(1, 0.35, 0.55).normalize(); SUN.x = sun.x; SUN.y = sun.y; SUN.z = sun.z; SUN.dot = null;
    makeRings(course);
    for (const sp of sprites) sp.material.opacity = 1;
    trail.userData.n = 0; trailGeo.setDrawRange(0, 0);
    S = newState(); acc = 0; lastT = 0;
    el.elOptAssist.checked = SV.assist !== false;
    const sv = (window.EarthLapHost || {}).Save; if (sv) { el.elOptInvert.checked = !!sv.d.opt.invert; el.elOptSound.checked = sv.d.opt.sound !== false; }
    el.elPause.hidden = true; el.elResult.hidden = true; paused = false; setControls(true);
    snd('beep', 660, 0.12, 'triangle', 0.1);
  }
  function setControls(on) { for (const k of ['elRoll', 'elBoost', 'elView', 'elPauseB', 'elStick']) el[k].hidden = !on; }
  function finish(s) {
    s.done = true; setControls(false); s.flash = null; s.fact = null; s.pops = [];
    const n = rings.length, par = COURSES[courseIdx].par || 150;
    const timeB = Math.max(0, Math.round((par - s.t) * 60));
    const total = s.score + timeB;
    const rank = s.got === n && s.t <= par ? 'S' : s.got >= n - 1 && s.t <= par * 1.2 ? 'A' : s.got >= Math.ceil(n / 2) ? 'B' : 'C';
    const b = SV.best[course.id], nb = !b || total > b.score; if (nb) { SV.best[course.id] = { score: total, t: +s.t.toFixed(1), rank }; save(); }
    el.elResT.textContent = `${course.code} · ${course.name}`;
    el.elResRank.textContent = rank; el.elResScore.textContent = total.toLocaleString(); el.elResBest.hidden = !nb;
    const rows = [['タイム', fmtT(s.t) + `（目標 ${fmtT(par)}）`], ['リング', `${s.got}/${n}`], ['タイムボーナス', '+' + timeB.toLocaleString()], ['飛行距離', Math.round(s.dist).toLocaleString() + ' km'],
      ['最高速度', `マッハ ${Math.round(s.maxMach)}（F-X×${Math.round(s.maxMach * MACH_KMS / V_FX)}）`], ['発見', `${s.found}（図鑑 ${SV.found.length}/${window.EARTH_SPOTS.length}）`],
      ['朝と夜', `${s.dayN}回`], ['ロール', `${s.tricks}回`], ['地表接触', `${s.crashes}回`]];
    if (b && !nb) rows.push(['ベスト', `${b.score.toLocaleString()} (${b.rank})`]);
    el.elResData.innerHTML = rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    snd('jingle', rank === 'S' || rank === 'A');
    setTimeout(() => { el.elResult.hidden = false; const b2 = document.getElementById('elRetry2'); b2 && b2.focus({ preventScroll: true }); }, 900);
  }
  function freeResult() {
    const s = S; s.done = true; setControls(false);
    el.elResT.textContent = `${course.code} · ${course.name}`;
    el.elResRank.textContent = '🌍'; el.elResScore.textContent = s.score.toLocaleString(); el.elResBest.hidden = true;
    el.elResData.innerHTML = [['飛行時間', fmtT(s.t)], ['飛行距離', Math.round(s.dist).toLocaleString() + ' km'], ['地球', (s.dist / 40030).toFixed(2) + ' 周'],
      ['最高速度', `マッハ ${Math.round(s.maxMach)}`], ['今回の発見', s.found], ['図鑑', `${SV.found.length}/${window.EARTH_SPOTS.length}`], ['朝と夜', `${s.dayN}回`]].map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    el.elResult.hidden = false;
  }
  function pause() { if (!active || paused || !S || S.done) return; paused = true; el.elPause.hidden = false; setControls(false); keys.clear(); stick = null; boostHeld = false;
    const q = document.getElementById('elQuit'); q.textContent = course.ring.length ? 'コース選択へ' : '終了して記録を見る'; }
  function resume() { if (!paused) return; paused = false; el.elPause.hidden = true; setControls(true); lastT = 0; }
  function restart() { if (!active) return; begin(); }
  function exit() {
    if (!active) return;
    if (course && !course.ring.length && S && !S.done && S.t > 3) { paused = false; el.elPause.hidden = true; freeResult(); return; }
    active = false; cancelAnimationFrame(raf); engine(null, false); wrap.hidden = true; keys.clear(); stick = null; boostHeld = false;
    const h = window.EarthLapHost; h && h.onExit && h.onExit();
  }
  async function start(i) {
    if (!wrap) makeDom();
    courseIdx = clamp(i | 0, 0, COURSES.length - 1); course = COURSES[courseIdx];
    wrap.hidden = false; active = true; el.elLoad.hidden = false; el.elLoad.textContent = '🌍 地球を読み込み中…'; setControls(false); el.elPause.hidden = true; el.elResult.hidden = true;
    try { await boot(); } catch (e) {
      el.elLoad.innerHTML = '地球データを読み込めませんでした。<br>通信状態を確認してください。<br><br><button class="btn" type="button" id="elLoadBack">戻る</button>';
      document.getElementById('elLoadBack').onclick = () => { active = false; wrap.hidden = true; const h = window.EarthLapHost; h && h.onExit && h.onExit(); }; return;
    }
    if (!active) return;
    el.elLoad.hidden = true; resize(); begin(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  // par time: course length at ~1.15× cruise
  function coursePar(c) {
    if (!window.EARTH_SPOTS || !c.ring.length) return 0;
    let prev = spotByName(c.start), L = 0;
    for (const [n] of c.ring) { const s = spotByName(n); const a = [prev[3] * D, prev[4] * D], b = [s[3] * D, s[4] * D];
      L += Math.acos(clamp(Math.sin(a[0]) * Math.sin(b[0]) + Math.cos(a[0]) * Math.cos(b[0]) * Math.cos(a[1] - b[1]), -1, 1)) * R_KM; prev = s; }
    return Math.round(L / (V_CRUISE * 1.25 * TW) + 8);
  }
  const _boot = boot;
  boot = function () { return _boot().then(() => { COURSES.forEach(c => { c.par = coursePar(c); }); }); };

  window.EarthLap = {
    COURSES, start, exit, best: id => SV.best[id], found: () => SV.found.length, V_MAX, TW,
    get state() { return S; }, get rings() { return rings; }, get active() { return active; }, _step: (n, inp) => { for (let i = 0; i < n; i++) step(S, Object.assign({ turn: 0, climb: 0, boost: false, roll: 0 }, inp || {}), DT); }
  };
})();
