/*
  SplendorFace — a real-time talking face made entirely of glowing particles.

  The particles ARE the face. There is no mesh, no skin texture, no polygons.
  Thousands of points organise themselves into eyes, brows, nose, lips, cheeks,
  a jawline and a forehead, then migrate — swarm-like — between expressions and
  speech shapes. Built on Three.js (WebGL), GPU point rendering, additive glow.

  ------------------------------------------------------------------------------
  Quick start (ES module):

    import { SplendorFace, THEMES, EXPRESSIONS } from './splendor-face.js';
    const face = new SplendorFace(document.getElementById('c'), { count: 18000 });

    face.setExpression('smile');
    face.setTheme('gold');
    face.speak('Hello. I am Splendor.');     // TTS + procedural lipsync
    await face.attachMic();                    // mic -> mouth
    face.attachAudio(htmlAudioElement);        // <audio>/<video> -> mouth
    face.driveViseme({ open: 0.7, wide: 0.3 });// push lipsync from your TTS

  Public API
    new SplendorFace(canvas, opts)
      opts: { count, theme, expression, transparent, orbit, autoplay, sizeScale }
    .setExpression(name)        neutral|smile|concern|surprise|curiosity|
                                thoughtfulness|focus|happiness
    .setTheme(name)             cyan|gold|purple|emerald|red|silver
    .setTransparent(bool)       alpha background for OBS / overlays
    .setOrbit(bool)             slow idle camera orbit
    .setQuality(n)              rebuild with n particles (graceful degradation)
    .blink()                    manual blink
    .speak(text)                SpeechSynthesis + procedural mouth
    .attachAudio(mediaEl)       drive mouth from an HTMLMediaElement
    .attachMic()                drive mouth from the microphone (async)
    .driveViseme({open,wide,round})  push a mouth shape directly (0..1, decays)
    .driveAmplitude(v)          shorthand for { open:v }
    .detachAudio()              unhook audio analyser
    .start() / .stop()          animation loop control
    .dispose()                  free all GPU + audio resources
  ------------------------------------------------------------------------------
*/

import * as THREE from '/lib/three.module.min.js';

/* ----------------------------------------------------------------- palettes */
// Each theme = core glow, white-hot highlight, deep shadow, background.
export const THEMES = {
  cyan:    { core: 0x36e6ff, hi: 0xffffff, shadow: 0x05203a, bg: 0x01060d },
  gold:    { core: 0xffc24d, hi: 0xfff6e0, shadow: 0x3a2102, bg: 0x0d0700 },
  purple:  { core: 0xb56bff, hi: 0xf3e6ff, shadow: 0x230540, bg: 0x07020d },
  emerald: { core: 0x3dffa6, hi: 0xeafff4, shadow: 0x05331f, bg: 0x010d07 },
  red:     { core: 0xff5b6b, hi: 0xffe6e8, shadow: 0x3a050c, bg: 0x0d0203 },
  silver:  { core: 0xcfe3ff, hi: 0xffffff, shadow: 0x1a2230, bg: 0x05080d },
};

export const EXPRESSIONS = [
  'neutral', 'smile', 'concern', 'surprise',
  'curiosity', 'thoughtfulness', 'focus', 'happiness',
];

/* ----------------------------------------------------------- region tags */
const R = {
  FOREHEAD: 0, CHEEK: 1, JAW: 2, BROW: 3,
  EYE: 4, PUPIL: 5, NOSE: 6, LIP_UP: 7, LIP_LOW: 8, AMBIENT: 9,
};

/* --------------------------------------------------------------- helpers */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
// small, fast seeded RNG so the face is identical every load
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* face silhouette: half-width of the head at a given height y.
   Control points run crown -> temples -> cheeks -> jaw -> chin. */
const HEAD_PROFILE = [
  [1.20, 0.02], [1.05, 0.50], [0.85, 0.72], [0.55, 0.83],
  [0.20, 0.86], [-0.15, 0.84], [-0.45, 0.74], [-0.72, 0.55],
  [-0.98, 0.34], [-1.18, 0.16], [-1.32, 0.0],
];
function halfWidth(y) {
  const p = HEAD_PROFILE;
  if (y >= p[0][0]) return p[0][1];
  if (y <= p[p.length - 1][0]) return 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [y0, w0] = p[i], [y1, w1] = p[i + 1];
    if (y <= y0 && y >= y1) {
      const t = (y - y0) / (y1 - y0);
      return lerp(w0, w1, smoothstep(0, 1, t));
    }
  }
  return 0;
}

/* facial landmark constants (normalised face space) */
const DEPTH = 0.34;            // how far the dome bulges toward the viewer
const EX = 0.345, EY = 0.16;   // eye centre (x mirrored per side)
const ERX = 0.205, ERY = 0.10; // eye half-extents (almond)
const MY = -0.56, MW = 0.30;   // mouth centre y, half width

// dome depth at a point — the whole face is a glowing curved sheet of light
function domeZ(x, y) {
  const v = 1 - (x * x) / 0.95 - (y * y) / 1.55;
  return v <= 0 ? 0 : DEPTH * Math.sqrt(v);
}
function inEye(x, y, scale) {
  const ax = Math.abs(x);
  const dx = (ax - EX) / (ERX * scale), dy = (y - EY) / (ERY * scale);
  return dx * dx + dy * dy < 1;
}
function inMouthGap(x, y) {
  const dx = x / 0.255, dy = (y - MY) / 0.075;
  return dx * dx + dy * dy < 1;
}
// upper-lip top edge & lower-lip bottom edge (cupid's bow geometry)
function lipTop(u) { // u in -1..1 across mouth
  return MY + 0.052 * Math.pow(1 - u * u, 0.6) - 0.02 * Math.exp(-(u * u) / 0.04);
}
function lipBottom(u) {
  return MY - 0.085 * Math.pow(1 - u * u, 0.55);
}

/* ============================================================ generation */
// Produces a flat particle list. Each particle: base position, region, side,
// mouth param, brightness shade, highlight amount, point size.
function buildFace(count) {
  const rnd = mulberry32(0x5fe1d0);
  const P = []; // {x,y,z,region,side,mu,shade,hi,size}

  const push = (x, y, z, region, side, mu, shade, hi, size) =>
    P.push({ x, y, z, region, side, mu, shade, hi, size });

  // budget split across features
  const nSkin   = Math.round(count * 0.49);
  const nEyes   = Math.round(count * 0.12);
  const nBrows  = Math.round(count * 0.07);
  const nNose   = Math.round(count * 0.06);
  const nLips   = Math.round(count * 0.16);
  const nAmb    = Math.round(count * 0.10);

  /* --- skin field: forehead + cheeks + jaw, carved around eyes & mouth --- */
  let made = 0, guard = 0;
  while (made < nSkin && guard < nSkin * 40) {
    guard++;
    const x = (rnd() * 2 - 1) * 0.95;
    const y = -1.30 + rnd() * 2.55;
    if (Math.abs(x) > halfWidth(y)) continue;
    if (inEye(x, y, 0.95)) continue;
    if (inMouthGap(x, y)) continue;
    // thin out the dense central panel a touch so features read
    if (rnd() > 0.97) continue;
    const z = domeZ(x, y) - 0.005;
    let region = R.CHEEK;
    if (y > 0.55) region = R.FOREHEAD;
    else if (y < -0.42) region = R.JAW;
    const edge = Math.abs(x) / (halfWidth(y) + 1e-3); // 0 centre .. 1 rim
    const shade = clamp(0.30 + 0.55 * (z / DEPTH) - 0.22 * edge, 0.08, 0.95);
    const hi = (y > 0.6 || (Math.abs(y - 0.0) < 0.15 && Math.abs(x) < 0.1)) ? 0.08 : 0.0;
    push(x, y, z, region, Math.sign(x) || 1, 0, shade, hi, 0.55 + rnd() * 0.35);
    made++;
  }

  /* --- eyes: a glowing almond (bright rim + full iris) with a hot pupil --- */
  const perEye = Math.max(1, Math.floor(nEyes / 2));
  for (const side of [-1, 1]) {
    const cx = side * EX;
    const nRim = Math.floor(perEye * 0.32);
    const nIris = Math.floor(perEye * 0.46);
    const nPup = perEye - nRim - nIris;
    // bright almond outline so the eye shape always reads
    for (let i = 0; i < nRim; i++) {
      const a = (i / nRim) * TAU;
      const x = cx + Math.cos(a) * ERX * (0.97 + rnd() * 0.06);
      const y = EY + Math.sin(a) * ERY * (0.97 + rnd() * 0.06);
      push(x, y, domeZ(x, y) + 0.005, R.EYE, side, 0, 0.78, 0.30, 0.55 + rnd() * 0.2);
    }
    // iris fills most of the almond — the eye glows as a whole
    for (let i = 0; i < nIris; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd());
      const x = cx + Math.cos(a) * r * ERX * 0.82;
      const y = EY + Math.sin(a) * r * ERY * 0.82;
      const cen = 1 - r;                          // brighter toward centre
      push(x, y, domeZ(x, y) + 0.01, R.EYE, side, 0, 0.8 + 0.2 * cen, 0.35 + 0.3 * cen, 0.55 + rnd() * 0.25);
    }
    // hot pupil core
    for (let i = 0; i < nPup; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.05;
      const x = cx + Math.cos(a) * r, y = EY + Math.sin(a) * r;
      push(x, y, domeZ(x, y) + 0.03, R.PUPIL, side, 0, 1.0, 1.0, 1.1 + rnd() * 0.5);
    }
  }

  /* --- eyebrows: bold arched arcs above each eye (two rows for body) --- */
  const perBrow = Math.max(1, Math.floor(nBrows / 2));
  for (const side of [-1, 1]) {
    const bx0 = side * EX;
    for (let i = 0; i < perBrow; i++) {
      const u = (rnd() * 2 - 1);                  // across the brow
      const x = bx0 + u * 0.215;
      const arch = 0.05 * (1 - u * u) * 0.85 - 0.014 * u * side;
      const y = 0.41 + arch + (rnd() - 0.5) * 0.026;
      push(x, y, domeZ(x, y) + 0.02, R.BROW, side, u, 0.85, 0.16, 0.6 + rnd() * 0.3);
    }
  }

  /* --- nose: bridge + softly rounded base & nostrils --- */
  const nBridge = Math.floor(nNose * 0.55), nBase = nNose - nBridge;
  for (let i = 0; i < nBridge; i++) {
    const t = rnd();
    const y = lerp(0.26, -0.08, t);
    const w = 0.018 + t * 0.05;
    const x = (rnd() * 2 - 1) * w;
    const z = domeZ(x, y) + 0.04 + t * 0.04;     // ridge stands forward
    push(x, y, z, R.NOSE, Math.sign(x) || 1, 0, 0.7, 0.1, 0.5 + rnd() * 0.25);
  }
  for (let i = 0; i < nBase; i++) {
    const a = (rnd() * 2 - 1) * Math.PI * 0.9;
    const r = 0.06 + rnd() * 0.05;
    const x = Math.cos(a) * r * 1.4;
    const y = -0.12 - Math.abs(Math.sin(a)) * 0.03 - rnd() * 0.02;
    push(x, y, domeZ(x, y) + 0.05, R.NOSE, Math.sign(x) || 1, 0, 0.66, 0.08, 0.5 + rnd() * 0.25);
  }

  /* --- lips: filled upper & lower lip, the most animated region --- */
  const nUp = Math.floor(nLips * 0.45), nLow = nLips - nUp;
  for (let i = 0; i < nUp; i++) {
    const u = (rnd() * 2 - 1);
    const x = u * MW;
    const top = lipTop(u), line = MY - 0.004;
    const y = lerp(line, top, rnd());
    const z = domeZ(x, y) + 0.03;
    const hi = 0.18 + 0.16 * (1 - Math.abs(u));
    push(x, y, z, R.LIP_UP, Math.sign(u) || 1, u, 0.95, hi, 0.6 + rnd() * 0.3);
  }
  for (let i = 0; i < nLow; i++) {
    const u = (rnd() * 2 - 1);
    const x = u * MW;
    const bot = lipBottom(u), line = MY + 0.004;
    const y = lerp(line, bot, rnd());
    const z = domeZ(x, y) + 0.035;
    const hi = 0.20 + 0.18 * (1 - Math.abs(u));
    push(x, y, z, R.LIP_LOW, Math.sign(u) || 1, u, 1.0, hi, 0.65 + rnd() * 0.35);
  }

  /* --- ambient halo: faint drifting motes around the face --- */
  for (let i = 0; i < nAmb; i++) {
    const a = rnd() * TAU;
    const r = 0.9 + Math.pow(rnd(), 0.6) * 0.7;
    const x = Math.cos(a) * r * 0.85;
    const y = Math.sin(a) * r * 1.05;
    const z = (rnd() * 2 - 1) * 0.35 - 0.1;
    push(x, y, z, R.AMBIENT, Math.sign(x) || 1, 0, 0.12 + rnd() * 0.12, 0.0, 0.3 + rnd() * 0.4);
  }

  return P;
}

/* ============================================================ shaders */
const VERT = /* glsl */`
  attribute float aSeed;
  attribute float aShade;   // 0 shadow .. 1 core
  attribute float aHi;      // highlight amount (pupils, lip sheen)
  attribute float aSize;

  uniform float uTime;
  uniform float uMicro;     // constant microscopic shimmer
  uniform float uLoosen;    // extra turbulence during expression transitions
  uniform float uBreath;    // global breathing scale
  uniform float uSizePx;    // base point size in pixels
  uniform float uIntensity; // global glow gain
  uniform vec3  uCore;
  uniform vec3  uHi;
  uniform vec3  uShadow;

  varying vec3  vColor;
  varying float vGlow;

  void main() {
    vec3 p = position;

    // never perfectly still — tiny per-particle drift, always alive
    float s = aSeed * 6.2831853;
    vec3 turb = vec3(
      sin(uTime * 0.9 + s),
      sin(uTime * 1.13 + s * 1.7 + 1.3),
      sin(uTime * 0.71 + s * 2.3 + 4.0)
    ) * (uMicro + uLoosen * 0.10);
    p += turb;

    // soft breathing — the whole face gently expands & contracts
    p *= (1.0 + uBreath);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = aSize * uSizePx / max(-mv.z, 0.001);
    gl_PointSize = clamp(size, 1.0, 64.0);

    // colour from shade ramp + highlight, with a gentle living flicker
    float flick = 0.88 + 0.12 * sin(uTime * 2.7 + aSeed * 40.0);
    vec3 col = mix(uShadow, uCore, aShade) + uHi * aHi;
    vColor = col * flick * uIntensity;
    vGlow = 0.7 + 0.5 * aShade + aHi * 0.8;
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  varying vec3  vColor;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    // soft glowing dot: bright core, feathered halo (premultiplied additive)
    float a = smoothstep(0.5, 0.0, d);
    a = pow(a, 1.4);
    float core = smoothstep(0.30, 0.0, d) * 0.9;
    float e = (a + core) * vGlow;
    gl_FragColor = vec4(vColor * e, a);
  }
`;

/* ============================================================ the face */
export class SplendorFace {
  constructor(canvas, opts = {}) {
    if (!canvas) throw new Error('SplendorFace: canvas required');
    this.canvas = canvas;
    this.opts = opts;
    this.count = opts.count || this._autoCount();
    this.themeName = opts.theme || 'cyan';
    this.transparent = !!opts.transparent;
    this.orbit = !!opts.orbit;
    this.sizeScale = opts.sizeScale || 1.0;

    // animated mouth state (smoothed) and its targets
    this.vis = { open: 0, wide: 0, round: 0 };
    this.visTarget = { open: 0, wide: 0, round: 0 };
    this._driveDecay = 0;            // when driveViseme/Amplitude is used
    this._ttsTalking = false;
    this._talkPhase = 0; this._talkNext = 0;
    this._talkShape = { open: 0, wide: 0, round: 0 };

    // eyes
    this.blinkL = 0; this.blinkR = 0; this._nextBlink = 1.5;
    this.gaze = { x: 0, y: 0 }; this.gazeTarget = { x: 0, y: 0 };
    this._nextSaccade = 1.0;

    // expression blending
    this.expr = opts.expression || 'neutral';
    this.exprW = 1;                  // blend from -> to
    this._loosen = 0;
    this.headTiltTarget = 0; this.headTilt = 0;
    this.gazeBias = { x: 0, y: 0 };
    this.blinkMul = 1;

    this._clock = 0; this._last = 0;
    this._running = false;
    this._audio = { ctx: null, analyser: null, src: null, kind: null, freq: null };

    this._initThree();
    this._buildGeometry();
    this.setTheme(this.themeName);
    this._applyExprGlobals(this.expr);
    this.exprTo = this._computeExprOffsets(this.expr);
    this.exprFrom = new Float32Array(this.exprTo.length);
    this.exprW = 1;

    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);

    if (opts.autoplay !== false) this.start();
  }

  /* ---------- setup ---------- */
  _autoCount() {
    const dpr = window.devicePixelRatio || 1;
    const mobile = /Mobi|Android/i.test(navigator.userAgent);
    if (mobile) return 9000;
    if (dpr > 2) return 16000;
    return 22000;
  }

  _initThree() {
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: true, alpha: true,
      powerPreference: 'high-performance', premultipliedAlpha: false,
    });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    this.camera.position.set(0, 0, 3.7);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.uniforms = {
      uTime:   { value: 0 },
      uMicro:  { value: 0.004 },
      uLoosen: { value: 0 },
      uBreath: { value: 0 },
      uSizePx: { value: 200 },
      uIntensity: { value: 1.7 },
      uCore:   { value: new THREE.Color() },
      uHi:     { value: new THREE.Color() },
      uShadow: { value: new THREE.Color() },
    };
    this._onResize();
  }

  _buildGeometry() {
    const list = buildFace(this.count);
    const n = list.length;
    this.n = n;
    this.region = new Int8Array(n);
    this.side = new Int8Array(n);
    this.mu = new Float32Array(n);
    this.base = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);

    const seed = new Float32Array(n);
    const shade = new Float32Array(n);
    const hi = new Float32Array(n);
    const size = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const p = list[i];
      this.region[i] = p.region;
      this.side[i] = p.side;
      this.mu[i] = p.mu;
      const j = i * 3;
      this.base[j] = p.x; this.base[j + 1] = p.y; this.base[j + 2] = p.z;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      seed[i] = Math.random();
      shade[i] = p.shade;
      hi[i] = p.hi;
      size[i] = p.size;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aShade', new THREE.BufferAttribute(shade, 1));
    g.setAttribute('aHi', new THREE.BufferAttribute(hi, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.computeBoundingSphere();

    // premultiplied additive glow — brighter & more controllable than the
    // SrcAlpha preset, and composites cleanly over a transparent OBS canvas
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });

    if (this.points) { this.group.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
    this.geometry = g;
    this.material = m;
    this.points = new THREE.Points(g, m);
    this.group.add(this.points);
  }

  /* ---------- expression offset tables (per-particle) ---------- */
  _computeExprOffsets(name) {
    const n = this.n, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = this.region[i], s = this.side[i], u = this.mu[i];
      const j = i * 3;
      const bx = this.base[j], by = this.base[j + 1];
      let dx = 0, dy = 0, dz = 0;
      const innerBrow = 1 - clamp((Math.abs(bx) - EX + 0.18) / 0.25, 0, 1);
      const corner = Math.max(0, Math.abs(u) - 0.45) / 0.55; // 0 centre .. 1 corner

      switch (name) {
        case 'smile':
          if (r === R.LIP_UP || r === R.LIP_LOW) { dy += 0.05 * corner + 0.012; dx += 0.03 * Math.sign(u) * corner; }
          if (r === R.CHEEK) { dy += 0.035 * smoothstep(-0.3, 0.25, by); dz += 0.015; }
          if (r === R.EYE && by < EY) dy += 0.012;
          break;
        case 'happiness':
          if (r === R.LIP_UP || r === R.LIP_LOW) { dy += 0.075 * corner + 0.02; dx += 0.04 * Math.sign(u) * corner; }
          if (r === R.CHEEK) { dy += 0.05 * smoothstep(-0.3, 0.3, by); dz += 0.025; }
          if (r === R.EYE) dy += (by < EY ? 0.02 : -0.005);
          if (r === R.PUPIL) dy += 0.006;
          if (r === R.BROW) dy += 0.012;
          break;
        case 'concern':
          if (r === R.BROW) { dy += 0.05 * innerBrow - 0.015 * (1 - innerBrow); dx -= 0.02 * Math.sign(bx) * innerBrow; }
          if (r === R.LIP_UP || r === R.LIP_LOW) dy -= 0.03 * corner;
          if (r === R.EYE && by > EY) dy += 0.01;
          break;
        case 'surprise':
          if (r === R.BROW) dy += 0.075;
          if (r === R.EYE) { dx += (Math.abs(bx) - EX) > -1 ? Math.sign(bx) * 0.018 : 0; dy += (by - EY) * 0.18; }
          if (r === R.PUPIL) dy += 0.0;
          if (r === R.LIP_UP) dy += 0.025;
          if (r === R.LIP_LOW) dy -= 0.06;
          if (r === R.JAW) dy -= 0.05 * smoothstep(-0.2, -1.1, by);
          break;
        case 'curiosity':
          if (r === R.BROW && s === 1) dy += 0.06;
          if (r === R.BROW && s === -1) dy += 0.012;
          if (r === R.EYE) dy += (by - EY) * 0.08;
          break;
        case 'thoughtfulness':
          if (r === R.BROW && s === -1) dy += 0.04;
          if (r === R.LIP_UP || r === R.LIP_LOW) { dx -= 0.02 * Math.sign(u); if (s === 1) dy += 0.015 * corner; }
          break;
        case 'focus':
          if (r === R.BROW) { dy -= 0.025; dx -= 0.012 * Math.sign(bx); }
          if (r === R.LIP_UP) dy -= 0.008;
          if (r === R.LIP_LOW) dy += 0.008;
          dz += 0.01;
          break;
        case 'neutral':
        default:
          break;
      }
      out[j] = dx; out[j + 1] = dy; out[j + 2] = dz;
    }
    return out;
  }

  _applyExprGlobals(name) {
    const g = {
      neutral:        { tilt: 0,    gx: 0,     gy: 0,    blink: 1.0 },
      smile:          { tilt: 0,    gx: 0,     gy: 0,    blink: 1.0 },
      happiness:      { tilt: 0.03, gx: 0,     gy: 0.05, blink: 1.1 },
      concern:        { tilt: -0.03,gx: 0,     gy: -0.05,blink: 1.0 },
      surprise:       { tilt: 0,    gx: 0,     gy: 0.05, blink: 0.2 },
      curiosity:      { tilt: 0.10, gx: 0.1,   gy: 0.05, blink: 1.0 },
      thoughtfulness: { tilt: 0.05, gx: -0.35, gy: 0.45, blink: 0.8 },
      focus:          { tilt: 0,    gx: 0,     gy: 0,    blink: 0.4 },
    }[name] || { tilt: 0, gx: 0, gy: 0, blink: 1 };
    this.headTiltTarget = g.tilt;
    this.gazeBias.x = g.gx; this.gazeBias.y = g.gy;
    this.blinkMul = g.blink;
  }

  /* ---------- public controls ---------- */
  setExpression(name) {
    if (!EXPRESSIONS.includes(name)) return;
    // snapshot current blended offsets as the new "from"
    const cur = new Float32Array(this.exprFrom.length);
    for (let k = 0; k < cur.length; k++) cur[k] = lerp(this.exprFrom[k], this.exprTo[k], this.exprW);
    this.exprFrom = cur;
    this.exprTo = this._computeExprOffsets(name);
    this.exprW = 0;
    this._loosen = 1;                 // particles briefly loosen, then reform
    this.expr = name;
    this._applyExprGlobals(name);
    return this;
  }

  setTheme(name) {
    const t = THEMES[name] || THEMES.cyan;
    this.themeName = name;
    this.uniforms.uCore.value.setHex(t.core);
    this.uniforms.uHi.value.setHex(t.hi);
    this.uniforms.uShadow.value.setHex(t.shadow);
    this._bg = new THREE.Color(t.bg);
    this._applyBackground();
    return this;
  }

  setTransparent(on) { this.transparent = !!on; this._applyBackground(); return this; }
  _applyBackground() {
    if (this.transparent) this.renderer.setClearColor(0x000000, 0);
    else this.renderer.setClearColor(this._bg || new THREE.Color(0x01060d), 1);
  }

  setOrbit(on) { this.orbit = !!on; return this; }

  setQuality(n) {
    this.count = Math.max(2000, Math.min(60000, n | 0));
    this._buildGeometry();
    this.exprTo = this._computeExprOffsets(this.expr);
    this.exprFrom = new Float32Array(this.exprTo.length);
    this.exprW = 1;
    this._onResize();
    return this;
  }

  blink() { this.blinkL = this.blinkR = 1e-3; this._blinking = true; return this; }

  /* ---------- mouth driving ---------- */
  driveViseme(v = {}) {
    if (typeof v.open === 'number') this.visTarget.open = clamp(v.open, 0, 1);
    if (typeof v.wide === 'number') this.visTarget.wide = clamp(v.wide, 0, 1);
    if (typeof v.round === 'number') this.visTarget.round = clamp(v.round, 0, 1);
    this._driveDecay = 0.25;          // hold briefly, then relax
    return this;
  }
  driveAmplitude(v) { return this.driveViseme({ open: v }); }

  speak(text) {
    if (!('speechSynthesis' in window)) return false;
    try { window.speechSynthesis.cancel(); } catch (_) {}
    const u = new SpeechSynthesisUtterance(String(text || ''));
    u.rate = 1.0; u.pitch = 1.0;
    u.onstart = () => { this._ttsTalking = true; };
    u.onend = () => { this._ttsTalking = false; };
    u.onerror = () => { this._ttsTalking = false; };
    u.onboundary = () => { this._talkNext = 0; };  // re-shape on each word
    this._ttsTalking = true;
    window.speechSynthesis.speak(u);
    return true;
  }

  /* ---------- audio analysis ---------- */
  async _ensureCtx() {
    if (!this._audio.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._audio.ctx = new AC();
    }
    if (this._audio.ctx.state === 'suspended') { try { await this._audio.ctx.resume(); } catch (_) {} }
    return this._audio.ctx;
  }
  _makeAnalyser(ctx) {
    const a = ctx.createAnalyser();
    a.fftSize = 1024; a.smoothingTimeConstant = 0.6;
    this._audio.analyser = a;
    this._audio.freq = new Uint8Array(a.frequencyBinCount);
    return a;
  }
  async attachAudio(mediaEl) {
    this.detachAudio();
    const ctx = await this._ensureCtx();
    const src = ctx.createMediaElementSource(mediaEl);
    const an = this._makeAnalyser(ctx);
    src.connect(an); an.connect(ctx.destination);
    this._audio.src = src; this._audio.kind = 'media';
    return true;
  }
  async attachMic() {
    this.detachAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = await this._ensureCtx();
      const src = ctx.createMediaStreamSource(stream);
      const an = this._makeAnalyser(ctx);
      src.connect(an);                 // do NOT connect to destination (no echo)
      this._audio.src = src; this._audio.kind = 'mic'; this._audio.stream = stream;
      return true;
    } catch (e) { console.warn('SplendorFace.attachMic failed', e); return false; }
  }
  detachAudio() {
    const a = this._audio;
    try { a.src && a.src.disconnect(); } catch (_) {}
    try { a.analyser && a.analyser.disconnect(); } catch (_) {}
    if (a.stream) { a.stream.getTracks().forEach((t) => t.stop()); a.stream = null; }
    a.src = null; a.analyser = null; a.kind = null; a.freq = null;
    return this;
  }

  _readAudioViseme() {
    const a = this._audio;
    if (!a.analyser) return null;
    a.analyser.getByteFrequencyData(a.freq);
    const f = a.freq, sr = a.ctx.sampleRate, bin = sr / a.analyser.fftSize;
    const idx = (hz) => Math.max(0, Math.min(f.length - 1, Math.round(hz / bin)));
    const band = (lo, hi) => {
      let s = 0, c = 0; for (let i = idx(lo); i <= idx(hi); i++) { s += f[i]; c++; }
      return c ? s / c / 255 : 0;
    };
    const total = band(120, 4000);
    const lf = band(150, 700), hf = band(2000, 5000);
    const ratio = hf / (hf + lf + 1e-3);
    const open = smoothstep(0.04, 0.45, total);
    const wide = clamp((ratio - 0.4) * 2.4, 0, 1) * open;
    const round = clamp((0.5 - ratio) * 2.2, 0, 1) * open * 0.85;
    return { open, wide, round };
  }

  /* ---------- loop ---------- */
  start() { if (this._running) return; this._running = true; this._last = performance.now(); this._raf = requestAnimationFrame(this._tick); }
  stop() { this._running = false; if (this._raf) cancelAnimationFrame(this._raf); }

  _tick = (now) => {
    if (!this._running) return;
    let dt = (now - this._last) / 1000; this._last = now;
    dt = Math.min(dt, 0.05);          // clamp big gaps (tab switch)
    this._clock += dt;
    this._update(dt, this._clock);
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(this._tick);
  };

  _update(dt, t) {
    /* --- decide mouth target --- */
    let vt;
    const audioVis = this._readAudioViseme();
    if (this._driveDecay > 0) {
      this._driveDecay -= dt;
      vt = this.visTarget;
      if (this._driveDecay <= 0) this.visTarget = { open: 0, wide: 0, round: 0 };
    } else if (audioVis) {
      vt = audioVis;
    } else if (this._ttsTalking) {
      // procedural syllables while TTS speaks (no PCM available from synthesis)
      this._talkNext -= dt;
      if (this._talkNext <= 0) {
        this._talkNext = 0.09 + Math.random() * 0.09;
        const o = 0.25 + Math.random() * 0.55;
        const r = Math.random();
        this._talkShape = { open: o, wide: r > 0.6 ? Math.random() * 0.7 : 0.1, round: r < 0.3 ? Math.random() * 0.6 : 0.0 };
      }
      vt = this._talkShape;
    } else {
      vt = { open: 0, wide: 0, round: 0 };
    }
    // frame-rate independent smoothing factor, always within [0,1) so the
    // value eases toward its target without overshooting past it
    const ease = (rate) => 1 - Math.exp(-rate * dt);
    this.vis.open = lerp(this.vis.open, vt.open, ease(18));
    this.vis.wide = lerp(this.vis.wide, vt.wide, ease(18));
    this.vis.round = lerp(this.vis.round, vt.round, ease(18));
    const speaking = this.vis.open;

    /* --- blinking --- */
    this._nextBlink -= dt;
    if (!this._blinking && this._nextBlink <= 0 && this.blinkMul > 0.01) {
      this._blinking = true; this.blinkL = this.blinkR = 1e-3;
      this._nextBlink = (2.4 + Math.random() * 4) / clamp(this.blinkMul, 0.2, 2);
    }
    if (this._blinking) {
      // quick close then open (asymmetric for life)
      const sp = dt * 9;
      if (this.blinkL < 1 && !this._reopen) { this.blinkL = Math.min(1, this.blinkL + sp); this.blinkR = Math.min(1, this.blinkR + sp * 0.96); if (this.blinkL >= 1) this._reopen = true; }
      else { this.blinkL = Math.max(0, this.blinkL - sp * 0.8); this.blinkR = Math.max(0, this.blinkR - sp * 0.8); if (this.blinkL <= 0) { this._blinking = false; this._reopen = false; } }
    }

    /* --- saccades / gaze --- */
    this._nextSaccade -= dt;
    if (this._nextSaccade <= 0) {
      this._nextSaccade = 0.7 + Math.random() * 2.2;
      // mostly look toward the viewer, occasional glance
      if (Math.random() < 0.6) this.gazeTarget = { x: (Math.random() - 0.5) * 0.2, y: (Math.random() - 0.5) * 0.15 };
      else this.gazeTarget = { x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.5 };
    }
    const gx = this.gazeTarget.x + this.gazeBias.x;
    const gy = this.gazeTarget.y + this.gazeBias.y;
    this.gaze.x = lerp(this.gaze.x, gx, ease(14));
    this.gaze.y = lerp(this.gaze.y, gy, ease(14));
    // micro tremor — eyes are never dead-still
    const mgx = this.gaze.x + Math.sin(t * 7.3) * 0.004 + Math.sin(t * 3.1) * 0.003;
    const mgy = this.gaze.y + Math.cos(t * 6.1) * 0.003;

    /* --- expression blend + loosen pulse --- */
    if (this.exprW < 1) this.exprW = Math.min(1, this.exprW + dt * 2.2);
    if (this._loosen > 0) this._loosen = Math.max(0, this._loosen - dt * 1.8);
    this.uniforms.uLoosen.value = this._loosen * 0.025;
    const ew = this.exprW;
    // follow speed eases off while loose (so particles "flow" before settling)
    const follow = 1 - Math.pow(this.exprW < 1 ? 0.02 : 0.0006, dt);

    /* --- per-particle target + spring integration --- */
    const n = this.n, base = this.base, pos = this.pos, vel = this.vel;
    const region = this.region, mu = this.mu;
    const o = this.vis.open, wd = this.vis.wide, rd = this.vis.round;
    const exF = this.exprFrom, exT = this.exprTo;

    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const r = region[i];
      let tx = base[j] + lerp(exF[j], exT[j], ew);
      let ty = base[j + 1] + lerp(exF[j + 1], exT[j + 1], ew);
      let tz = base[j + 2] + lerp(exF[j + 2], exT[j + 2], ew);

      // viseme — lips & jaw
      if (r === R.LIP_UP) {
        const u = mu[i];
        ty += 0.03 * o;
        tx += wd * 0.05 * Math.sign(u) - rd * 0.04 * Math.sign(u);
        tz += rd * 0.02;
      } else if (r === R.LIP_LOW) {
        const u = mu[i];
        ty -= 0.10 * o;
        tx += wd * 0.05 * Math.sign(u) - rd * 0.04 * Math.sign(u);
        tz += rd * 0.02;
      } else if (r === R.JAW) {
        const down = clamp((-base[j + 1] - 0.1) / 0.95, 0, 1);
        ty -= o * 0.13 * down;
      } else if (r === R.CHEEK) {
        ty += speaking * 0.008 * smoothstep(-0.4, 0.3, base[j + 1]);
      } else if (r === R.BROW) {
        ty += speaking * 0.012;        // whole face participates in speech
      }

      // blink — eyes & pupils
      if (r === R.EYE || r === R.PUPIL) {
        const b = (this.side[i] >= 0 ? this.blinkR : this.blinkL);
        ty = EY + (ty - EY) * (1 - 0.92 * b);
        if (r === R.PUPIL) { tx += mgx * 0.05; ty += mgy * 0.035; }
        else { tx += mgx * 0.012; ty += mgy * 0.008; }
      }

      // critically-damped follow toward target (the swarm finds equilibrium)
      vel[j]     = (vel[j]     + (tx - pos[j])     * follow) * 0.6;
      vel[j + 1] = (vel[j + 1] + (ty - pos[j + 1]) * follow) * 0.6;
      vel[j + 2] = (vel[j + 2] + (tz - pos[j + 2]) * follow) * 0.6;
      pos[j]     += vel[j];
      pos[j + 1] += vel[j + 1];
      pos[j + 2] += vel[j + 2];
    }
    this.geometry.attributes.position.needsUpdate = true;

    /* --- global motion: breathing, sway, tilt, camera float/orbit --- */
    this.uniforms.uTime.value = t;
    this.uniforms.uBreath.value = Math.sin(t * 0.5) * 0.012 + speaking * 0.006;
    this.uniforms.uMicro.value = 0.0035 + speaking * 0.002;

    this.headTilt = lerp(this.headTilt, this.headTiltTarget, ease(6));
    this.group.rotation.z = this.headTilt + Math.sin(t * 0.21) * 0.015;
    this.group.rotation.y = Math.sin(t * 0.23) * 0.05 + mgx * 0.15;
    this.group.rotation.x = Math.sin(t * 0.19) * 0.03 - mgy * 0.05;
    this.group.position.y = Math.sin(t * 0.4) * 0.012;

    if (this.orbit) {
      const a = t * 0.12;
      this.camera.position.x = Math.sin(a) * 0.6;
      this.camera.position.z = 3.7 - (1 - Math.cos(a)) * 0.2;
    } else {
      this.camera.position.x = Math.sin(t * 0.13) * 0.06;
      this.camera.position.z = 3.7;
    }
    this.camera.position.y = Math.sin(t * 0.17) * 0.045;
    this.camera.lookAt(0, 0, 0);
  }

  /* ---------- resize / lifecycle ---------- */
  _onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // keep dots a consistent on-screen size across resolutions & portrait/landscape
    this.uniforms.uSizePx.value = Math.min(h, w * 1.6) * dpr * 0.011 * this.sizeScale;
  };

  _onVisibility = () => {
    if (document.hidden) this.stop();
    else if (!this._running) { this._last = performance.now(); this.start(); }
  };

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.detachAudio();
    if (this._audio.ctx) { try { this._audio.ctx.close(); } catch (_) {} }
    if (this.points) { this.geometry.dispose(); this.material.dispose(); }
    this.renderer.dispose();
  }
}

export default SplendorFace;
