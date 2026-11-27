import * as THREE from './lib/three.module.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';
import { OBB } from './lib/OBB.js';

/* ---------- helpers ---------- */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => t * t * (3 - 2 * t);
const seg = (p, a, b) => ease(clamp((p - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const bez = (a, c, b, t) => a.clone().multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * (1 - t) * t)).add(b.clone().multiplyScalar(t * t));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Phones/tablets get a lighter texture set: same look on a small screen, a fraction of the memory.
// (Full-size textures add up to ~1.4 GB, more than iOS allows a browser tab, so the tab gets killed.)
const MOBILE = matchMedia('(pointer: coarse) and (hover: none)').matches;   // touch-only device: phones & tablets
const TEXN = MOBILE ? 1024 : 2048;      // labels + disc print
const GROOVE_N = MOBILE ? 1024 : 4096;  // groove normal/roughness maps
const IMG = p => MOBILE ? 'img/m/' + p.split('/').pop() : p;
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = IMG(src); });
const _texCache = new Map();
function texFrom(img, opts = {}) {
  const key = img.src + '|' + (opts.repeat || '') + '|' + (opts.offset || '');
  if (_texCache.has(key)) return _texCache.get(key);
  const t = new THREE.Texture(img); _texCache.set(key, t);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) { t.repeat.set(...opts.repeat); t.offset.set(...opts.offset); }
  t.needsUpdate = true;
  return t;
}
// draw() always works in `logical` px; the canvas itself is `size` px
function canvasTex(size, draw, logical = size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.scale(size / logical, size / logical);
  draw(x, logical);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/* ---------- tracklist data (from back cover) ---------- */
const TRACKS = [
  'Trying On Shoes', 'Anything But Love', "Nobody's Girl", 'Horseshoe', 'Tit For Tat',
  'Miss Possessive', 'Revolving Door', ['bloodonmyhands', 'feat. Flo Milli'], 'Dear God', 'Purple Lace Bra',
  'Sports Car', 'Signs', ['I Know Love', 'feat. The Kid LAROI'], 'Like I Do', "It's OK I'm OK",
  "No I'm Not In Love", 'Means I Care', 'Greenlight', '2 Hands', ['Siren Sounds', 'bonus'], 'Nostalgia',
];

/* ---------- starfield background ---------- */
(function stars() {
  const c = document.getElementById('stars'), x = c.getContext('2d');
  let s = [];
  const size = () => {
    c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
    s = Array.from({ length: 160 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 1.3 * devicePixelRatio + .3, p: Math.random() * 6 }));
  };
  size(); addEventListener('resize', size);
  let last = 0;
  const draw = t => {
    if (t - last < 33) { requestAnimationFrame(draw); return; }
    last = t;
    x.clearRect(0, 0, c.width, c.height);
    for (const p of s) {
      x.globalAlpha = .35 + .65 * Math.abs(Math.sin(t / 1400 + p.p));
      x.fillStyle = '#eef1f8'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill();
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
})();

/* ---------- hero: 3D floating cards ---------- */
(function hero() {
  const cards = [...document.querySelectorAll('#heroCards .card')];
  let mx = 0, my = 0;
  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
  const base = [
    { x: -38, y: 6, z: -300, ry: 28 },
    { x: 0, y: 0, z: 0, ry: 0 },
    { x: 38, y: -6, z: -300, ry: -28 },
  ];
  const tick = t => {
    if (scrollY > innerHeight * 1.6) { requestAnimationFrame(tick); return; }
    const sp = clamp(scrollY / innerHeight);
    cards.forEach((c, i) => {
      const b = base[i], f = Math.sin(t / 1600 + i) * 10;
      const spread = 1 + sp * 0.8;
      c.style.transform =
        `translate3d(${b.x * spread}vw, calc(${b.y}vh + ${f}px - ${sp * 30}vh), ${b.z + sp * (i === 1 ? 300 : -200)}px)` +
        ` rotateY(${b.ry + mx * 20}deg) rotateX(${-my * 14 + sp * 20}deg)`;
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();


/* ---------- smooth, speed-limited page scrolling ----------
   Wheel / trackpad / keys feed a target; the page glides toward it with a damped spring,
   so it eases to a stop. Through the 3D sections the speed is capped, so a hard flick
   can't blast through the animation. Touch and scrollbar dragging stay native. */
const SS = { y: scrollY, target: scrollY, v: 0, fast: false };
const maxY = () => document.documentElement.scrollHeight - innerHeight;
const stages = [...document.querySelectorAll('.stage')];
const inStage = y => stages.some(s => y > s.offsetTop - innerHeight * .6 && y < s.offsetTop + s.offsetHeight - innerHeight * .4);
function nudge(d) {
  SS.fast = false;
  SS.target = clamp(SS.target + d, 0, maxY());
  SS.target = clamp(SS.target, SS.y - innerHeight * 1.2, SS.y + innerHeight * 1.2); // don't queue up a runaway
}
window.smoothScrollTo = y => { SS.target = clamp(y, 0, maxY()); SS.fast = true; };
addEventListener('wheel', e => {
  if (e.ctrlKey || !npFullClosed()) return;
  e.preventDefault();
  nudge(e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1));
}, { passive: false });
addEventListener('keydown', e => {
  if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
  const k = { ArrowDown: 80, ArrowUp: -80, PageDown: innerHeight * .9, PageUp: -innerHeight * .9, ' ': e.shiftKey ? -innerHeight * .9 : innerHeight * .9, End: 1e7, Home: -1e7 }[e.key];
  if (k === undefined) return;
  e.preventDefault();
  if (Math.abs(k) === 1e7) smoothScrollTo(k > 0 ? maxY() : 0); else nudge(k);
});
addEventListener('scroll', () => { if (Math.abs(scrollY - SS.y) > 3) { SS.y = SS.target = scrollY; SS.v = 0; } }, { passive: true });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a || a.getAttribute('href').length < 2) return;
  const el = document.querySelector(a.getAttribute('href')); if (!el) return;
  e.preventDefault(); smoothScrollTo(el.offsetTop);
});
const npFullClosed = () => document.getElementById('npFull')?.hidden !== false;
let ssT = performance.now();
(function ssLoop(now) {
  const dt = Math.min((now - ssT) / 1000, .05); ssT = now;
  const gap = SS.target - SS.y;
  if (Math.abs(gap) > .5 || Math.abs(SS.v) > 2) {
    const cap = (SS.fast ? 7 : inStage(SS.y) ? .7 : 4.5) * innerHeight;     // px per second
    SS.v += (gap * 36 - 12 * SS.v) * dt;
    SS.v = clamp(SS.v, -cap, cap);
    SS.y += SS.v * dt;
    if (Math.abs(SS.target - SS.y) < .5 && Math.abs(SS.v) < 2) { SS.y = SS.target; SS.v = 0; SS.fast = false; }
    scrollTo(0, SS.y);
  }
  requestAnimationFrame(ssLoop);
})(ssT);

/* ---------- text-free toggle ---------- */
const toggle = document.getElementById('cleanToggle');
toggle.addEventListener('click', () => {
  ALL_STAGES.forEach(s => s.dirty = true);
  const on = document.body.classList.toggle('clean');
  toggle.setAttribute('aria-pressed', on);
  toggle.querySelector('.lbl').textContent = on ? 'Show text' : 'View only';
});


/* ---------- performance + collision tooling ---------- */
const STAGES = {};
window.__STAGES = STAGES;
// Adaptive resolution: drop pixel ratio if frames run slow, raise it back when there is headroom
// Upload every texture and compile every shader up front, so pieces don't hitch the first time they appear
function warm(S, camera) {
  S.scene.traverse(o => {
    if (!o.material) return;
    for (const mt of [].concat(o.material)) for (const k of ['map', 'normalMap', 'roughnessMap', 'bumpMap']) if (mt[k]) S.renderer.initTexture(mt[k]);
  });
  const hidden = []; S.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  S.renderer.compile(S.scene, camera);
  hidden.forEach(o => o.visible = false);
}
// Scenes are framed for a wide screen; on a tall phone pull the camera back so the sides aren't cut off
function fitPortrait(camera, look) {
  const f = camera.aspect < 1.25 ? Math.sqrt(1.25 / camera.aspect) : 1;
  if (f === 1) return;
  camera.position.x = look[0] + (camera.position.x - look[0]) * f;
  camera.position.y = look[1] + (camera.position.y - look[1]) * f;
  camera.position.z = look[2] + (camera.position.z - look[2]) * f;
}
function adapt(S, dt) {
  const a = S.adapt ??= { avg: 1 / 60, n: 0, pr: S.renderer.getPixelRatio() };
  a.avg = a.avg * .97 + dt * .03; if (++a.n < 120) return;
  let pr = a.pr;
  if (a.avg > 1 / 40 && pr > 1) pr = Math.max(1, pr - .5);   // step down only, with a long settle window
  if (pr !== a.pr) { a.pr = pr; a.n = 0; S.renderer.setPixelRatio(pr); const c = S.renderer.domElement; S.renderer.setSize(c.clientWidth, c.clientHeight, false); }
}
// Collision check: every tagged piece against every other, using oriented boxes (discs tested as true circles)
const _o1 = new OBB(), _o2 = new OBB(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function obbOf(mesh, out) {
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  out.center.copy(g.boundingBox.getCenter(_v)); g.boundingBox.getSize(out.halfSize).multiplyScalar(.5);
  out.halfSize.max(new THREE.Vector3(.0004, .0004, .0004)); out.rotation.identity();
  return out.applyMatrix4(mesh.matrixWorld);
}
function discHits(disc, other) {
  const R = disc.userData.disc, inv = _m.copy(disc.matrixWorld).invert();
  obbOf(other, _o2);
  for (let r = 0; r <= 1; r += .125) for (let a = 0; a < 6.283; a += .2) {
    _v.set(Math.cos(a) * r * R, Math.sin(a) * r * R, 0).applyMatrix4(disc.matrixWorld);
    if (_o2.containsPoint(_v)) return true;
  }
  // and the other piece's surface against the disc slab
  const hs = _o2.halfSize;
  for (let i = -1; i <= 1; i += .1) for (let j = -1; j <= 1; j += .1) {
    _v.set(i * hs.x, j * hs.y, 0).applyMatrix3(_o2.rotation).add(_o2.center).applyMatrix4(inv);
    if (Math.abs(_v.z) < .012 && Math.hypot(_v.x, _v.y) < R) return true;
  }
  return false;
}
const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
const desc = o => { const w = new THREE.Vector3(); o.getWorldPosition(w); return o.geometry.type + '@' + w.toArray().map(v => v.toFixed(3)).join(','); };
window.__clip = (name, groups, exempt) => {
  const st = STAGES[name]; st.root.updateMatrixWorld(true);
  const meshes = groups.map(([k, o]) => { const l = []; [].concat(o).forEach(o => o.traverseVisible(c => { if (c.isMesh && !c.userData.noclip && shown(c)) l.push(c); })); return [k, l]; });
  const hits = [];
  for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
    const [ka, la] = meshes[i], [kb, lb] = meshes[j];
    if (exempt(ka, kb)) continue;
    outer: for (const a of la) for (const b of lb) {
      let hit;
      if (a.userData.disc) hit = discHits(a, b);
      else if (b.userData.disc) hit = discHits(b, a);
      else hit = obbOf(a, _o1).intersectsOBB(obbOf(b, _o2), 1e-6);
      if (hit) { hits.push(ka + '×' + kb + (window.__clipDetail ? ` [${desc(a)} | ${desc(b)}]` : '')); break outer; }
    }
  }
  return hits;
};

/* ---------- shared 3D scene scaffolding ---------- */
// A night-sky backdrop the clear vinyl / glass can actually refract and reflect
function backdropTex() {
  return canvasTex(2048, (x, s) => {
    const g = x.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#05060a'); g.addColorStop(.42, '#1b2338'); g.addColorStop(.5, '#2b3a5e');
    g.addColorStop(.56, '#151a28'); g.addColorStop(1, '#05060a');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      x.globalAlpha = Math.random() * .8; x.fillStyle = '#eef1f8';
      x.fillRect(Math.random() * s, Math.random() * s * .45, 1.4, 1.4);
    }
  });
}

const ALL_STAGES = [];
function makeStage(canvas) {
  const st = {};
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(renderer), .02).texture;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.MeshBasicMaterial({ map: backdropTex(), side: THREE.BackSide, depthWrite: false }));
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(35, 1, 1, 200);
  scene.add(new THREE.HemisphereLight(0xb8c6ff, 0x0c0e14, .55));

  // Key light: the only shadow caster, soft and high-resolution
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 8, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = .015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f8fd8, 2.6); rim.position.set(-7, 3, -6); scene.add(rim);
  const kick = new THREE.PointLight(0xc9d6ff, 18, 30, 2); kick.position.set(6, -2, 5); scene.add(kick);

  const root = new THREE.Group(); scene.add(root);
  // Invisible floor that only shows shadows, so pieces feel grounded
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .45 }));
  floor.position.y = -3.6; floor.receiveShadow = true; root.add(floor);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    st.dirty = true;
  };
  resize(); addEventListener('resize', resize);

  const rot = { x: 0, y: 0, tx: 0, ty: 0 };
  let drag = null, moved = 0;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; moved = 0; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy);
    rot.ty += dx * .006; rot.tx = clamp(rot.tx + dy * .004, -.8, .8);
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });

  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pickables = [];
  canvas.addEventListener('click', e => {
    if (moved > 6) return;
    const r = canvas.getBoundingClientRect();
    ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables.map(p => p.obj), true)[0];
    if (!hit) { pickables.forEach(p => p.focus = 0); return; }
    const owner = pickables.find(p => { let o = hit.object; while (o) { if (o === p.obj) return true; o = o.parent; } return false; });
    // pieces only pop out where the collision test showed there is room in front of them
    const blocked = owner?.noLift?.some(([x, y]) => st.p >= x - .02 && st.p <= y + .02);
    pickables.forEach(p => p.focus = p === owner && !blocked ? (p.focus ? 0 : 1) : 0);
  });

  Object.assign(st, { renderer, scene, camera, root, rot, pickables });
  ALL_STAGES.push(st);
  return st;
}
let MAX_ANISO = 8;
const LIFT = 1.2;   // how far a clicked piece pops toward you

function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  return clamp(-r.top / (r.height - innerHeight));
}
function inView(el) { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
function setSteps(list, idx) { [...list.children].forEach((li, i) => li.classList.toggle('on', i === idx)); }

document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
  ALL_STAGES.forEach(s => s.pickables.forEach(k => k.focus = 0));
  const sec = document.getElementById(b.dataset.go);
  const top = sec.offsetTop + (+b.dataset.to) * (sec.offsetHeight - innerHeight);
  smoothScrollTo(top);
}));

/* =================================================================
   TEXTURES
   Desktop: artwork at full source resolution, grooves 4096 px, labels/disc print 2048 px.
   Phones: everything capped at 1024 px (see MOBILE above).
   ================================================================= */
await document.fonts.load('700 40px Unison');
const [imgFront, imgBack, imgWind, imgGate] = await Promise.all(
  ['img/cover-front.webp', 'img/cover-back.png', 'img/photo-wind.webp', 'img/ref-vinyl-gatefold.png'].map(loadImg));

const art = (img, opts) => { const t = texFrom(img, opts); t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };

// Paper grain: drives bump + roughness so prints don't look like flat plastic
const paperGrain = (() => {
  const N = 1024, d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    const v = 200 + Math.random() * 40 + (Math.random() < .002 ? -60 : 0);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true; return t;
})();

// Record grooves: real normal + roughness maps (4096²) with song gaps between tracks
const grooveMaps = await new Promise(resolve => {
  const src = `onmessage = ({ data: N }) => {
    const R = 1.46, half = N / 2, period = Math.max(.0042, 6.4 * R / N);   // keep grooves above pixel size
    const nrm = new Uint8Array(N * N * 4), rgh = new Uint8Array(N * N * 4);
    const outer = 1.40, inner = .66, tracks = 5;
    const gaps = Array.from({ length: tracks - 1 }, (_, i) => outer - (outer - inner) * (i + 1) / tracks);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = x - half + .5, dy = y - half + .5, dp = Math.hypot(dx, dy), r = dp / half * R;
      let slope = 0, rough = .08;
      if (r > inner && r < outer && !gaps.some(g => Math.abs(r - g) < .007)) {
        slope = Math.cos(r / period * Math.PI * 2) * .55; rough = .22 + .06 * Math.sin(r * 90);
      } else if (r >= .54 && r <= inner) { slope = Math.cos(r / .03 * Math.PI * 2) * .08; rough = .1; }
      const nx = -slope * dx / (dp || 1), ny = slope * dy / (dp || 1), len = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      nrm[i] = (nx / len * .5 + .5) * 255; nrm[i + 1] = (ny / len * .5 + .5) * 255; nrm[i + 2] = (1 / len * .5 + .5) * 255; nrm[i + 3] = 255;
      rgh[i] = rgh[i + 1] = rgh[i + 2] = rough * 255; rgh[i + 3] = 255;
    }
    postMessage({ nrm, rgh }, [nrm.buffer, rgh.buffer]);
  };`;
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.onmessage = ({ data }) => {
    const mk = d => { const t = new THREE.DataTexture(d, GROOVE_N, GROOVE_N); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 16; t.needsUpdate = true; return t; };
    resolve({ normal: mk(data.nrm), rough: mk(data.rgh) }); w.terminate();
  };
  w.postMessage(GROOVE_N);
});

function grain(x, s, a = .05) {
  const n = s * s / 30 * Math.min(1, (TEXN / s) ** 2);   // grain density matches the real canvas size
  for (let i = 0; i < n; i++) { x.globalAlpha = Math.random() * a; x.fillStyle = Math.random() < .5 ? '#000' : '#fff'; x.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  x.globalAlpha = 1;
}
// Labels match the pressing: LP1 light blue, LP2 charcoal (from unboxing footage)
function labelTex(side, songs, bg = '#2b2d34', fg = '#eef1f8') {
  return canvasTex(TEXN, (x, s) => {
    const c = s / 2;
    x.fillStyle = bg; x.beginPath(); x.arc(c, c, c, 0, 7); x.fill();
    grain(x, s, .06);
    x.strokeStyle = fg; x.globalAlpha = .25; x.lineWidth = 6;
    x.beginPath(); x.arc(c, c, c - 110, 0, 7); x.stroke(); x.globalAlpha = 1;
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '700 660px Unison'; x.fillText('TATE', c, c - 520);
    x.font = '700 150px Unison'; x.fillText('SIDE ' + side, c, c + 430);
    x.font = '700 92px Unison'; x.globalAlpha = .75;
    songs.forEach((t, i) => x.fillText(t.toUpperCase(), c, c + 640 + i * 120));
    x.globalAlpha = .5; x.font = '700 80px Unison';
    x.fillText('SO CLOSE TO WHAT??? (DELUXE)', c, c - 90);
    x.fillText('33⅓ RPM', c - 1150, c); x.fillText('STEREO', c + 1150, c);
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(c, c, 100, 0, 7); x.fill();
  }, 4096);
}
function discPrint() {
  return canvasTex(TEXN, (x, s) => {
    const c = s / 2;
    x.save(); x.beginPath(); x.arc(c, c, c, 0, 7); x.clip();
    x.drawImage(imgWind, 0, 0, s, s);
    const g = x.createRadialGradient(c, c, s * .2, c, c, c); g.addColorStop(0, 'rgba(12,14,20,0)'); g.addColorStop(1, 'rgba(12,14,20,.45)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    x.fillStyle = '#eef1f8'; x.textAlign = 'center';
    x.font = '700 230px Unison'; x.fillText('SO CLOSE TO WHAT???', c, s * .83);
    x.font = '700 110px Unison'; x.globalAlpha = .85; x.fillText('TATE McRAE · DELUXE', c, s * .885);
    x.restore(); grain(x, s, .03);
  }, 4096);
}

/* =================================================================
   MATERIALS
   ================================================================= */
const printMat = (tex, gloss = .35) => new THREE.MeshPhysicalMaterial({
  map: tex, roughness: .5, roughnessMap: paperGrain, bumpMap: paperGrain, bumpScale: .6,
  clearcoat: gloss, clearcoatRoughness: .3, envMapIntensity: .7,
});
const boardMat = new THREE.MeshStandardMaterial({ color: 0xe6e2da, roughness: .92, bumpMap: paperGrain, bumpScale: 1 });
// No transmission pass (it re-renders the whole scene every frame and glitches on some GPUs):
// the clear look comes from low opacity + strong reflections + the groove maps instead.
const clearVinyl = () => new THREE.MeshPhysicalMaterial({
  color: 0x0d1119, transparent: true, opacity: .42, depthWrite: false, roughness: .18, metalness: .35, clearcoat: .7, clearcoatRoughness: .05,
  roughnessMap: grooveMaps.rough, normalMap: grooveMaps.normal, normalScale: new THREE.Vector2(.7, .7),
  specularIntensity: 1, envMapIntensity: 3, side: THREE.DoubleSide,
});
const glassMat = () => new THREE.MeshPhysicalMaterial({
  color: 0xf2f6fb, transparent: true, opacity: .16, depthWrite: false, roughness: .03, clearcoat: 1, envMapIntensity: 2, specularIntensity: 1,
});

const shadowed = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

// Printed board: rounded cardboard core with the artwork laid on each face
function printPanel(w, h, d, frontTex, backTex, gloss) {
  const g = new THREE.Group();
  // the core board sits a few tenths of a mm inside the printed faces, so the print never
  // depth-fights the board at grazing angles; very thin stock is just the two printed faces
  const cd = d - .004;
  if (cd > .002) g.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, cd, 3, Math.min(cd * .45, .012)), boardMat));
  const inset = .006;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w - inset, h - inset), printMat(frontTex, gloss)); f.position.z = d / 2 + .0006;
  const b = new THREE.Mesh(new THREE.PlaneGeometry(w - inset, h - inset), printMat(backTex, gloss)); b.position.z = -d / 2 - .0006; b.rotation.y = Math.PI;
  g.add(f, b);
  return shadowed(g);
}

// Lathe-turned disc with planar UVs, so maps line up like a real pressing
function latheDisc(profile, segs = 256) {
  const geo = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segs).rotateX(Math.PI / 2);
  const R = Math.max(...profile.map(p => p[0]));
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * R) + .5, pos.getY(i) / (2 * R) + .5);
  geo.computeVertexNormals();
  return geo;
}

/* =================================================================
   MODELS
   ================================================================= */
const SIDES = {
  A: TRACKS.slice(0, 6), B: TRACKS.slice(6, 11), C: TRACKS.slice(11, 16), D: TRACKS.slice(16),
};
const nm = t => Array.isArray(t) ? t[0] : t;

// 12" LP: 140g profile with raised label area and beaded edge
function buildLP(sideA, sideB, bg, fg) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const profile = [
    [.036, .0105], [.5, .0105], [.53, .0085], [1.40, .0078], [1.425, .0098], [1.45, .0098], [1.462, .005], [1.465, 0],
    [1.462, -.005], [1.45, -.0098], [1.425, -.0098], [1.40, -.0078], [.53, -.0085], [.5, -.0105], [.036, -.0105], [.036, .0105],
  ];
  const disc = new THREE.Mesh(latheDisc(profile), clearVinyl());
  disc.castShadow = false; disc.receiveShadow = true; disc.userData.disc = 1.465;
  spin.add(disc);
  const lab = s => new THREE.MeshPhysicalMaterial({ map: labelTex(s, SIDES[s].map(nm), bg, fg), roughness: .55, bumpMap: paperGrain, bumpScale: .4, transparent: true });
  const la = new THREE.Mesh(new THREE.CircleGeometry(.49, 128), lab(sideA)); la.position.z = .0108;
  const lb = new THREE.Mesh(new THREE.CircleGeometry(.49, 128), lab(sideB)); lb.position.z = -.0108; lb.rotation.y = Math.PI;
  la.castShadow = lb.castShadow = true; la.receiveShadow = lb.receiveShadow = true; la.userData.noclip = lb.userData.noclip = true;
  spin.add(la, lb);
  g.userData.spin = spin;
  return g;
}

// 120mm CD: iridescent data side, printed top, clear stacking hub
function buildCD() {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const data = new THREE.Mesh(latheDisc([[.34, .012], [1.2, .012], [1.2, -.012], [.34, -.012], [.34, .012]]),
    new THREE.MeshPhysicalMaterial({ color: 0xd2d6de, metalness: 1, roughness: .08, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [250, 900], envMapIntensity: 1.6 }));
  const hub = new THREE.Mesh(latheDisc([[.15, .009], [.34, .009], [.34, -.009], [.15, -.009], [.15, .009]]), glassMat());
  const ring = new THREE.Mesh(latheDisc([[.3, .014], [.32, .014], [.32, .009], [.3, .009], [.3, .014]], 128), glassMat());
  const print = new THREE.Mesh(new THREE.RingGeometry(.345, 1.195, 256, 1), new THREE.MeshPhysicalMaterial({ map: discPrint(), roughness: .45, clearcoat: .4, clearcoatRoughness: .2 }));
  // Ring UVs are radial, so remap them planar to match the print
  const p = print.geometry.attributes.position, u = print.geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / 2.4 + .5, p.getY(i) / 2.4 + .5);
  print.position.z = .0125;
  data.castShadow = print.castShadow = true; data.receiveShadow = print.receiveShadow = true;
  data.userData.disc = 1.2; hub.userData.noclip = ring.userData.noclip = print.userData.noclip = true;
  spin.add(data, hub, ring, print);
  g.userData.spin = spin;
  return g;
}

/* =================================================================
   VINYL STAGE
   Built from the real 2LP deluxe package (checked against unboxing footage):
   shrink-wrap with hype sticker -> gatefold jacket (two pockets, openings on
   the outer edges) -> 12"x24" insert folded in half -> picture sleeve 1 with
   LP1 (light-blue labels) -> picture sleeve 2 with LP2 (charcoal labels).
   Every piece leaves along its own path and only moves freely once it has
   fully cleared whatever it was inside, so nothing passes through anything.
   ================================================================= */
const hq = await Promise.all([
  'jacket-front', 'jacket-back', 'gatefold-inside', 'sleeve1-a', 'sleeve1-b', 'sleeve2-a', 'sleeve2-b', 'poster',
].map(n => loadImg(`img/hq/${n}.webp`)));
const [hqFront, hqBack, hqGate, hqS1a, hqS1b, hqS2a, hqS2b, hqPoster] = hq;

// Keyframe track: [t, [x,y,z], [rx,ry,rz]] eased between neighbours
// Keyframe track as one continuous curve per axis (monotone cubic / PCHIP):
// - pieces keep their speed through waypoints instead of stopping at each one
// - wherever a piece rests (or an axis turns around) the curve's slope is 0, so it eases to a gentle stop
// - monotone: never overshoots a keyframe, so a path never bulges into something it was routed around
function track(keys) {
  const T = keys.map(k => k[0]);
  const vals = [...[0, 1, 2].map(c => keys.map(k => k[1][c])), ...[0, 1, 2].map(c => keys.map(k => k[2][c]))];
  const tans = vals.map(Y => Y.map((y, i) => {
    if (i === 0 || i === Y.length - 1) return 0;
    const h0 = T[i] - T[i - 1], h1 = T[i + 1] - T[i];
    const d0 = (y - Y[i - 1]) / h0, d1 = (Y[i + 1] - y) / h1;
    if (d0 * d1 <= 0) return 0;
    return 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);   // Fritsch–Butland
  }));
  return p => {
    const n = T.length;
    if (p <= T[0]) return { pos: keys[0][1], rot: keys[0][2] };
    if (p >= T[n - 1]) return { pos: keys[n - 1][1], rot: keys[n - 1][2] };
    let i = 1; while (p > T[i]) i++;
    const h = T[i] - T[i - 1], u = (p - T[i - 1]) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const out = vals.map((Y, c) => h00 * Y[i - 1] + h10 * h * tans[c][i - 1] + h01 * Y[i] + h11 * h * tans[c][i]);
    return { pos: out.slice(0, 3), rot: out.slice(3, 6) };
  };
}
const apply = (o, s) => { o.position.set(...s.pos); o.rotation.set(...s.rot); };
const PI = Math.PI;

// Shrink-wrap crinkle normal map
const crinkle = (() => {
  const N = 512, d = new Uint8Array(N * N * 4);
  const bumps = Array.from({ length: 90 }, () => [Math.random() * N, Math.random() * N, 10 + Math.random() * 60, Math.random() * 2 - 1]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let nx = 0, ny = 0;
    for (const [bx, by, r, a] of bumps) {
      const dx = x - bx, dy = y - by, q = (dx * dx + dy * dy) / (r * r);
      if (q < 1) { const f = a * (1 - q); nx += dx / r * f; ny += dy / r * f; }
    }
    const l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    d[i] = (nx / l * .5 + .5) * 255; d[i + 1] = (ny / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const stickerTex = canvasTex(1024, (x, s) => {
  const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#323d5c'); g.addColorStop(1, '#1d2338');
  x.fillStyle = g; x.fillRect(0, 0, s, s); grain(x, s, .04);
  x.fillStyle = '#eef1f8'; x.textAlign = 'center';
  x.font = '700 50px Unison'; x.fillText('SO CLOSE TO WHAT???', s / 2, s * .3);
  x.font = '700 250px Unison'; x.fillText('TATE', s / 2, s * .58);
  x.font = '700 44px Unison'; x.globalAlpha = .7; x.fillText('THE DELUXE ALBUM', s / 2, s * .74);
  x.fillText('INCLUDES 5 NEW SONGS', s / 2, s * .8);
});

{
  const sec = document.getElementById('vinyl');
  const steps = document.getElementById('vinylSteps');
  const S = makeStage(document.getElementById('vinylGL'));
  const { root, camera, pickables } = S;

  const JW = 3.1;          // 12.375" jacket
  const BOARD = .012;      // ~1.2mm board
  const GAP = .024;        // half-depth of each pocket (fits a sleeved LP + the folded insert)
  const SW = 3.04;         // 12.25" picture sleeve
  const PAPER = .0012;     // ~0.3mm paper sleeve stock

  /* ---- jacket ---- */
  const plain = new THREE.MeshStandardMaterial({ color: 0x1d2130, roughness: .85, bumpMap: paperGrain, bumpScale: .5 });
  const gateL = art(hqGate, { repeat: [.5, 1], offset: [0, 0] });
  const gateR = art(hqGate, { repeat: [.5, 1], offset: [.5, 0] });

  // A pocket: outer board + inner board, glued on three edges, open on +x
  function pocket(outerTex, innerTex, outerFacesNegZ) {
    const g = new THREE.Group();
    const outer = printPanel(JW, JW, BOARD, outerFacesNegZ ? null : outerTex, outerFacesNegZ ? outerTex : null, .5);
    const inner = printPanel(JW, JW, BOARD, outerFacesNegZ ? innerTex : null, outerFacesNegZ ? null : innerTex, .35);
    const zo = GAP + BOARD / 2;
    outer.position.z = outerFacesNegZ ? -zo : zo; inner.position.z = outerFacesNegZ ? zo : -zo;
    // inside faces of the pocket are plain dark card
    [outer, inner].forEach(b => b.children.slice(1).forEach(m => { if (!m.material.map) m.material = plain; }));
    g.add(outer, inner);
    const edge = (w, h, x, y) => { const e = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, GAP * 2), plain)); e.position.set(x, y, 0); g.add(e); };
    edge(JW, .006, 0, JW / 2 - .003); edge(JW, .006, 0, -JW / 2 + .003); edge(.006, JW, -JW / 2 + .003, 0);
    return g;
  }
  const jacket = new THREE.Group(); root.add(jacket);
  const backP = pocket(art(hqBack), gateR, true); jacket.add(backP);
  const hinge = new THREE.Group(); hinge.position.set(-JW / 2, 0, GAP + BOARD + .004); jacket.add(hinge);
  const frontP = pocket(art(hqFront), gateL, false);
  frontP.position.set(JW / 2, 0, GAP + BOARD + .004); hinge.add(frontP);
  const spine = shadowed(new THREE.Mesh(new RoundedBoxGeometry(.014, JW, (GAP + BOARD) * 2 + .012, 2, .005), plain));
  spine.position.set(-JW / 2, 0, (GAP + BOARD + .004) / 2); jacket.add(spine);

  /* ---- shrink-wrap + hype sticker ---- */
  const wrap = new THREE.Group(); jacket.add(wrap);
  // sized from the closed jacket: back face at -(GAP+BOARD), front face at 2*(GAP+BOARD+.004)+(GAP+BOARD)
  const J0 = -(GAP + BOARD), J1 = 3 * (GAP + BOARD) + .008, FILM_D = J1 - J0 + .012, FILM_Z = (J0 + J1) / 2;
  const film = new THREE.Mesh(new RoundedBoxGeometry(JW + .05, JW + .05, FILM_D, 3, .02), new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .06, metalness: 0, transparent: true, opacity: .16, clearcoat: 1, clearcoatRoughness: .05,
    normalMap: crinkle, normalScale: new THREE.Vector2(.35, .35), envMapIntensity: 2.4, depthWrite: false,
  }));
  film.position.z = FILM_Z; film.renderOrder = 2; wrap.add(film);
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(.72, .72), new THREE.MeshPhysicalMaterial({ map: stickerTex, roughness: .35, clearcoat: .6 }));
  sticker.position.set(JW / 2 - .52, JW / 2 - .52, FILM_Z + FILM_D / 2 + .001); wrap.add(sticker);

  /* ---- 12" x 24" insert, folded once ---- */
  const poster = new THREE.Group();
  const sheet = (off) => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), (() => { const t = art(hqPoster, { repeat: [1, .5], offset: [0, off] }); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: .32, roughness: .9, bumpMap: paperGrain, bumpScale: .3, envMapIntensity: .12 }); })());
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), plain); b.rotation.y = PI; b.position.z = -.0006;
    g.add(f, b); return shadowed(g);
  };
  const pLow = sheet(0); pLow.position.y = -1.5;                     // origin = fold line
  const pTopHinge = new THREE.Group(); poster.add(pLow, pTopHinge);
  const pTop = sheet(.5); pTop.position.y = 1.5; pTopHinge.add(pTop);
  root.add(poster);

  /* ---- picture sleeves (two paper sheets that bulge around the record) ---- */
  // Paper sleeve: two printed sheets (print outside, plain paper inside, back to back so they
  // can never depth-fight), joined by paper edges on the three sealed sides.
  const paperIn = new THREE.MeshStandardMaterial({ color: 0xd8d5ce, roughness: .9, bumpMap: paperGrain, bumpScale: .4 });
  const paperEdge = new THREE.MeshStandardMaterial({ color: 0xcfccc5, roughness: .9, side: THREE.DoubleSide });
  function sleeve(aImg, bImg, open) {
    const g = new THREE.Group();
    const mk = (img, flip) => {
      const s = new THREE.Group();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(SW, SW), printMat(art(img), .2));
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(SW, SW), paperIn); inner.rotation.y = PI;
      s.add(face, inner);
      if (flip) s.rotation.y = PI;
      return shadowed(s);
    };
    const a = mk(aImg, false), b = mk(bImg, true);
    const edges = [];
    for (const side of ['left', 'right', 'top', 'bottom']) {
      if (side === open) continue;
      const vert = side === 'left' || side === 'right';
      const e = new THREE.Mesh(new THREE.PlaneGeometry(vert ? 1 : SW, vert ? SW : 1), paperEdge);
      if (vert) { e.rotation.y = PI / 2; e.position.x = (side === 'left' ? -1 : 1) * SW / 2; }
      else { e.rotation.x = PI / 2; e.position.y = (side === 'bottom' ? -1 : 1) * SW / 2; }
      e.userData.vert = vert; e.userData.noclip = true; edges.push(e);
    }
    g.add(a, b, ...edges); g.userData.sheets = [a, b]; g.userData.edges = edges;
    return g;
  }
  const sleeve1 = sleeve(hqS1a, hqS1b, 'top'), sleeve2 = sleeve(hqS2a, hqS2b, 'right');  // LP1 slides out the top, LP2 rolls out the side
  const lp1 = buildLP('A', 'B', '#6f8fc2', '#f4f6fb'), lp2 = buildLP('C', 'D', '#2e3036', '#c9ccd3');
  sleeve1.add(lp1); sleeve2.add(lp2);         // records ride inside their sleeves
  root.add(sleeve1, sleeve2);
  const setBulge = (sl, k) => {
    const z = lerp(.0125, PAPER, k);
    sl.userData.sheets[0].position.z = z; sl.userData.sheets[1].position.z = -z;
    for (const e of sl.userData.edges) { if (e.userData.vert) e.scale.x = 2 * z; else e.scale.y = 2 * z; }
  };
  setBulge(sleeve1, 0); setBulge(sleeve2, 0);

  pickables.push(
    { obj: jacket, focus: 0, lift: 0 }, { obj: poster, focus: 0, lift: 0 },
    { obj: sleeve1, focus: 0, lift: 0 }, { obj: sleeve2, focus: 0, lift: 0 });

  /* ---- choreography (scroll 0..1) ----
     Jacket open & flat from .26 to .86: back pocket centre (1.55,0,0) opens to +x;
     front pocket centre (-1.55,0,0) is flipped (rotY π) and opens to -x. */
  const FZ = 0; // pocket mid-plane in world
  const T = {
    jacket: track([
      [0, [0, 0, 0], [.18, -.55, 0]],
      [.07, [0, 0, 0], [.05, -.12, 0]],
      [.15, [0, -.1, 0], [0, 0, 0]],
      [.26, [JW / 2, 0, 0], [0, 0, 0]],
      [.86, [JW / 2, 0, 0], [0, 0, 0]],
      [.97, [JW / 2 - .2, 1.0, -3.6], [-.08, 0, 0]],
    ]),
    // insert: slides out of the LEFT pocket in-plane, swings to face us, then unfolds upward
    poster: track([
      [.26, [-1.55, 1.5, FZ + .013], [0, PI, 0]],
      [.31, [-4.8, 1.5, FZ + .013], [0, PI, 0]],
      [.335, [-5.0, 1.3, 2.0], [0, PI * .6, 0]],
      [.36, [-1.2, -.2, 3.2], [0, 0, 0]],
      [.42, [-1.2, -.2, 3.2], [0, 0, 0]],
      [.445, [-5.5, .2, 2.4], [0, .3, 0]],
      [.47, [-5.6, .4, -1.7], [0, .3, 0]],
    ]),
    // sleeve 1: drawn out of the RIGHT pocket, tilts forward, LP1 slides up out of the top
    sleeve1: track([
      [.44, [1.55, 0, FZ], [0, 0, 0]],
      [.49, [4.75, 0, FZ], [0, 0, 0]],
      [.52, [4.85, -.2, 1.6], [0, -.35, 0]],
      [.55, [1.0, -.9, 2.3], [-.06, -.12, 0]],
      [.62, [1.0, -.9, 2.3], [-.06, -.12, 0]],
      [.67, [3.3, -1.4, 1.1], [0, -.38, 0]],
      [.88, [3.3, -1.4, 1.1], [0, -.38, 0]],
      [.97, [2.4, -1.7, 1.0], [0, -.28, 0]],
    ]),
    lp1: track([
      [.555, [0, 0, 0], [0, 0, 0]],
      [.595, [0, SW + .02, 0], [0, 0, 0]],           // straight up through the open top edge
      [.605, [.1, SW + .08, .42], [0, -.08, 0]],     // steps forward before coming down
      [.625, [1.35, 1.25, .35], [0, -.15, 0]],        // clear of the sleeve, settles beside it
    ]),
    // sleeve 2: out of the LEFT pocket (behind where the insert was), turns around to face us
    sleeve2: track([
      [.66, [-1.55, 0, FZ - .006], [0, PI, 0]],
      [.71, [-4.75, 0, FZ - .006], [0, PI, 0]],
      [.735, [-4.9, .1, 1.8], [0, PI * .55, 0]],
      [.76, [-1.4, -.9, 2.4], [-.06, .1, 0]],
      [.83, [-1.4, -.9, 2.4], [-.06, .1, 0]],
      [.88, [-1.6, -1.4, 1.2], [0, .22, 0]],
      [.97, [-2.7, -1.7, 1.4], [0, .2, 0]],
    ]),
    // LP2 rolls out of the side opening like a wheel, then lifts and turns to show its label
    lp2: track([
      [.765, [0, 0, 0], [0, 0, 0]],
      [.805, [SW + .02, 0, 0], [0, 0, 0]],
      [.815, [SW + .1, .15, .42], [0, .1, 0]],
      [.83, [1.45, 1.2, .35], [0, .2, 0]],
    ]),
  };

  // camera: [position], [look-at]; drifts toward whichever pocket a piece is coming out of
  const L = -.1;
  const CAM = track([
    [0, [0, .4, 9.2], [0, L, 0]], [.15, [0, .4, 9.2], [0, L, 0]], [.25, [0, .5, 11.5], [0, L, 0]],
    [.3, [-1.6, .5, 13], [-1.6, L, 0]], [.37, [-.6, .6, 14.5], [-.6, L, 0]], [.44, [-.5, .5, 13.5], [-.6, L, 0]],
    [.49, [1.6, .5, 13.5], [1.6, L, 0]], [.56, [.6, .5, 13.5], [.6, L, 0]], [.66, [0, .5, 13.5], [0, L, 0]],
    [.72, [-1.6, .5, 13.5], [-1.6, L, 0]], [.78, [-.6, .5, 13.5], [-.6, L, 0]], [.88, [0, .5, 13.5], [0, L, 0]],
    [1, [0, 1.4, 17.5], [0, L, 0]]]);
  let t0 = performance.now();
  let sp = 0, sv = 0;
  function update(p, dt, now) {
    S.p = p;
    {

      // jacket + shrink-wrap
      apply(jacket, T.jacket(p));
      const strip = seg(p, .07, .15);
      wrap.visible = strip < .999;
      wrap.position.set(lerp(0, .25, strip), strip * 3.9, strip * .35);   // jacket slides out the bottom
      wrap.rotation.set(0, 0, strip * -.12);
      wrap.scale.set(1 - strip * .06, 1, 1 + strip * .4);                  // film relaxes and crumples
      film.material.opacity = .16 * (1 - seg(p, .12, .15));
      sticker.material.opacity = 1 - seg(p, .13, .15); sticker.material.transparent = true;
      // gatefold opens on the spine with a soft settle
      const o = seg(p, .15, .25), settle = Math.sin(o * PI) * .06;
      hinge.rotation.y = -PI * o - settle * (o > .85 ? 1 : 0);
      spine.rotation.y = hinge.rotation.y / 2;

      // insert
      poster.visible = p > .255;
      apply(poster, T.poster(p));
      const unfold = seg(p, .365, .415);
      pTopHinge.rotation.x = -PI * (1 - unfold);
      pTopHinge.position.z = (1 - unfold) * -.0014;
      poster.scale.setScalar(lerp(.98, 1, unfold));

      // sleeve 1 + LP1
      sleeve1.visible = p > .435;
      apply(sleeve1, T.sleeve1(p));
      apply(lp1, T.lp1(p));
      setBulge(sleeve1, seg(p, .6, .625));
      lp1.userData.spin.rotation.z -= dt * 3.49 * seg(p, .6, .63);

      // sleeve 2 + LP2
      sleeve2.visible = p > .655;
      apply(sleeve2, T.sleeve2(p));
      apply(lp2, T.lp2(p));
      const rollOut = T.lp2(p).pos[0];
      lp2.userData.spin.rotation.z = p < .805 ? -rollOut / 1.465 : lp2.userData.spin.rotation.z - dt * 3.49 * seg(p, .81, .84);
      setBulge(sleeve2, seg(p, .81, .83));

      for (const pk of pickables) { pk.lift = lerp(pk.lift, pk.focus, .12); if (pk.lift < .001) pk.lift = 0; pk.obj.position.z += pk.lift * LIFT; }

      // camera: pulls back as more pieces come out
      const cam = CAM(p);
      camera.position.set(...cam.pos); fitPortrait(camera, cam.rot); camera.lookAt(...cam.rot);

      S.rot.x = lerp(S.rot.x, S.rot.tx, .1); S.rot.y = lerp(S.rot.y, S.rot.ty, .1);
      root.rotation.set(S.rot.x, S.rot.y, 0);
      root.position.x = innerWidth > 720 && !document.body.classList.contains('clean') ? .7 : 0;

      setSteps(steps, p < .15 ? 0 : p < .26 ? 1 : p < .44 ? 2 : p < .66 ? 3 : p < .88 ? 4 : 5);
    }
  }
  warm(S, camera);
  const VMAX = .075;   // whole unboxing takes at least ~13s, no matter how hard you scroll
  [[[.385, .395], [.65, .665], [.745, .745], [.86, .89]], [], [[.8, .815]], []].forEach((w, i) => pickables[i].noLift = w);
  STAGES.vinyl = { update, root, S, groups: [['back', backP], ['front', frontP], ['posterLow', pLow], ['posterTop', pTop], ['s1a', sleeve1.userData.sheets[0]], ['s1b', sleeve1.userData.sheets[1]], ['lp1', lp1], ['s2a', sleeve2.userData.sheets[0]], ['s2b', sleeve2.userData.sheets[1]], ['lp2', lp2]] };
  function frame(now) {
    const dt = Math.min((now - t0) / 1000, .05); t0 = now;
    if (inView(sec)) {
      // ease toward the scroll position so wheel steps become smooth motion
      const target = window.__forceP?.vinyl ?? sectionProgress(sec);
      // motion profile: accelerate gently, cruise at a locked speed, then decelerate at a
      // constant rate so the models glide to rest (velocity falls smoothly to zero, no snap)
      // a popped-out piece goes back first; the unboxing waits until it is home, so nothing clips
      if (Math.abs(target - sp) > 1e-4) pickables.forEach(k => k.focus = 0);
      const lifted = pickables.some(k => k.focus || k.lift > .004);
      if (lifted && !window.__forceP) sv = 0;
      else {
        const gap = target - sp, AMAX = VMAX * 1.4;
        const want = Math.sign(gap) * Math.min(VMAX, Math.sqrt(2 * AMAX * .8 * Math.abs(gap)));
        sv += clamp(want - sv, -AMAX * dt, AMAX * dt);
        sp = clamp(sp + sv * dt, 0, 1);
        if ((Math.abs(target - sp) < 1e-5 && Math.abs(sv) < 2e-3) || window.__forceP) { sp = target; sv = 0; }
      }
      const moving = sp !== S.lastP || S.dirty || !S.drawn
        || Math.abs(S.rot.x - S.rot.tx) + Math.abs(S.rot.y - S.rot.ty) > 1e-5
        || pickables.some(k => Math.abs(k.lift - k.focus) > 1e-4);
      if (moving || sp > .6) {                       // past .6 a disc is spinning, keep drawing
        update(sp, dt, now);
        if (moving) S.renderer.shadowMap.needsUpdate = true;   // a spinning disc casts the same shadow
        S.renderer.render(S.scene, camera);
        adapt(S, dt);
        S.lastP = sp; S.drawn = true; S.dirty = false;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =================================================================
   CD STAGE
   Jewel case -> lid opens -> booklet slides out of the lid tabs past the free
   edge -> disc lifts straight off the rosette before moving -> back insert
   drops out of the bottom of the base. Each path clears its container first.
   ================================================================= */
{
  const sec = document.getElementById('cd');
  const steps = document.getElementById('cdSteps');
  const S = makeStage(document.getElementById('cdGL'));
  const { root, camera, pickables } = S;
  const W = 2.84, H = 2.5, LIDZ = .135;

  const caseG = new THREE.Group(); root.add(caseG);
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, H, .05, 3, .015), glassMat()); base.position.z = -.09; caseG.add(base);
  const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1014, roughness: .38, clearcoat: .6, clearcoatRoughness: .25 });
  const tray = shadowed(new THREE.Mesh(new RoundedBoxGeometry(W - .2, H - .06, .1, 3, .02), trayMat)); tray.position.set(.08, 0, -.02); caseG.add(tray);
  const well = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.24, 1.24, .02, 128).rotateX(Math.PI / 2), trayMat)); well.position.set(.12, 0, .03); caseG.add(well);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    const tooth = shadowed(new THREE.Mesh(new RoundedBoxGeometry(.05, .09, .06, 2, .015), trayMat));
    tooth.position.set(.12 + Math.cos(a) * .13, Math.sin(a) * .13, .054); tooth.rotation.z = a; caseG.add(tooth);
  }
  for (let i = 0; i < 2; i++) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .35, 24), glassMat());
    k.position.set(-W / 2, i ? .95 : -.95, .03); caseG.add(k);
  }
  const lidHinge = new THREE.Group(); lidHinge.position.set(-W / 2, 0, LIDZ); caseG.add(lidHinge);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(W, H, .045, 3, .015), glassMat()); lid.position.x = W / 2; lidHinge.add(lid);
  // the small tabs inside the lid that hold the booklet
  for (const y of [-1, 1]) for (const x of [.25, W - .25]) {
    const tab = new THREE.Mesh(new THREE.BoxGeometry(.3, .03, .016), glassMat()); tab.position.set(x, y * (H / 2 - .07), -.03); lidHinge.add(tab);
  }

  const backInsert = printPanel(W - .14, H - .1, .004, art(hqBack), art(imgWind), .2);
  root.add(backInsert);

  const booklet = new THREE.Group();
  const bS = 2.36;
  const bBack = printPanel(bS, bS, .012, art(imgWind), art(hqBack), .08); bBack.position.x = bS / 2;
  const bHinge = new THREE.Group();
  const bFront = printPanel(bS, bS, .012, art(hqFront), art(hqGate, { repeat: [.5, 1], offset: [0, 0] }), .08);
  bFront.position.set(bS / 2, 0, .013); bHinge.add(bFront);
  const bWrap = new THREE.Group(); bWrap.add(bBack, bHinge); bWrap.position.set(-bS / 2, 0, -.0065);
  booklet.add(bWrap); root.add(booklet);

  const disc = buildCD(); const dSpin = disc.userData.spin; root.add(disc);

  pickables.push({ obj: caseG, focus: 0, lift: 0 }, { obj: booklet, focus: 0, lift: 0 }, { obj: disc, focus: 0, lift: 0 }, { obj: backInsert, focus: 0, lift: 0 });

  const PI = Math.PI;
  const T = {
    caseG: track([[0, [0, 0, 0], [-.3, .7, 0]], [.12, [0, 0, 0], [0, 0, 0]], [.86, [0, 0, 0], [0, 0, 0]], [1, [.7, -.1, -1.6], [0, -.12, 0]]]),
    // booklet, in lid-hinge space: tucked under the tabs, then slid out past the free edge
    bookIn: track([[.28, [W / 2 + .06, 0, -.036], [0, 0, 0]], [.36, [W + bS / 2 + .1, 0, -.036], [0, 0, 0]]]),
    // booklet, free (root space) once clear of the lid
    bookFree: track([[.36, [0, 0, 0], [0, 0, 0]], [.41, [.3, .2, 3.4], [0, .05, 0]], [.47, [.3, .2, 3.4], [0, .05, 0]], [.495, [-.2, 2.65, 3.2], [.1, 0, 0]], [.52, [-.5, 2.75, -.6], [.15, 0, 0]]]),
    disc: track([[.5, [.12, 0, .07], [0, 0, 0]], [.55, [.12, 0, .8], [0, 0, 0]], [.62, [2.5, .5, 1.8], [0, -.35, 0]]]),
    insert: track([[.66, [0, 0, -.125], [0, 0, 0]], [.74, [0, -2.75, -.125], [0, 0, 0]], [.8, [.4, -2.7, .9], [-.3, 0, 0]], [.86, [.4, -2.45, 1.3], [-.2, -.1, 0]]]),
  };
  // camera: [position], [look-at]; pans left to follow the booklet out of the lid
  const CAM = track([[0, [0, .4, 8], [0, 0, 0]], [.28, [0, .4, 8.5], [0, 0, 0]], [.33, [-2.7, .4, 10.2], [-2.7, 0, 0]], [.37, [-2.7, .4, 10.2], [-2.7, 0, 0]], [.42, [-.6, .4, 10.5], [-.2, .1, 0]], [.5, [0, .5, 12.5], [0, .3, 0]], [.86, [0, .5, 12.8], [0, .15, 0]], [1, [0, .7, 13.5], [0, .15, 0]]]);

  const m = new THREE.Matrix4(), inv = new THREE.Matrix4(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), e = new THREE.Euler(), va = new THREE.Vector3(), vs = new THREE.Vector3();

  let t0 = performance.now();
  let sp = 0, sv = 0;
  function update(p, dt, now) {
    S.p = p;
    {
      apply(caseG, T.caseG(p));
      const open = seg(p, .12, .27);
      lidHinge.rotation.y = -2.7 * open;   // opens wide (~155°) so the booklet slides out sideways, in view

      // booklet: pose inside the lid converted to root space, then eased into its free path
      caseG.updateMatrixWorld(true); root.updateMatrixWorld(true);
      const bi = T.bookIn(p), bf = T.bookFree(p);
      m.copy(inv.copy(root.matrixWorld).invert()).multiply(lidHinge.matrixWorld).multiply(new THREE.Matrix4().compose(va.set(...bi.pos), qa.setFromEuler(e.set(...bi.rot)), vs.set(1, 1, 1)));
      m.decompose(va, qa, vs);
      const free = seg(p, .36, .41);
      if (free <= 0) { booklet.position.copy(va); booklet.quaternion.copy(qa); }
      else {
        const startPos = va.clone(), startQ = qa.clone();
        const fp = T.bookFree(Math.max(p, .41));
        const tgtPos = new THREE.Vector3(...(p < .41 ? T.bookFree(.41).pos : fp.pos));
        qb.setFromEuler(e.set(...(p < .41 ? T.bookFree(.41).rot : fp.rot)));
        booklet.position.copy(startPos.lerp(tgtPos, free));
        booklet.quaternion.copy(startQ.slerp(qb, free));
      }
      booklet.visible = true;   // a real jewel case shows the booklet through the lid from the start
      const bOpen = seg(p, .43, .48);
      bHinge.rotation.y = -PI * .9 * bOpen;
      bWrap.position.x = lerp(-bS / 2, 0, bOpen);

      // disc: straight up off the rosette, then out, slow tilt to catch the rainbow
      apply(disc, T.disc(p));
      const dOut = seg(p, .55, .62);
      disc.rotation.y += dOut * Math.sin(now / 1300) * .45;
      disc.rotation.x += dOut * Math.sin(now / 1700) * .22;
      dSpin.rotation.z -= dt * 4 * seg(p, .53, .6);
      // while still in the case, the disc rides with the case (offset rotated with it)
      if (p < .5) { disc.position.applyEuler(caseG.rotation).add(caseG.position); disc.rotation.copy(caseG.rotation); }

      // back insert: drops out of the bottom of the base, then tips toward us
      apply(backInsert, T.insert(p));
      if (p < .66) { backInsert.position.applyEuler(caseG.rotation).add(caseG.position); backInsert.rotation.copy(caseG.rotation); }

      for (const pk of pickables) { pk.lift = lerp(pk.lift, pk.focus, .12); if (pk.lift < .001) pk.lift = 0; pk.obj.position.z += pk.lift * LIFT; }

      const cam = CAM(p); camera.position.set(...cam.pos); fitPortrait(camera, cam.rot); camera.lookAt(...cam.rot);
      S.rot.x = lerp(S.rot.x, S.rot.tx, .1); S.rot.y = lerp(S.rot.y, S.rot.ty, .1);
      root.rotation.set(S.rot.x, S.rot.y, 0);
      root.position.x = innerWidth > 720 && !document.body.classList.contains('clean') ? -1.1 : 0;

      setSteps(steps, p < .28 ? 0 : p < .5 ? 1 : p < .66 ? 2 : 3);
    }
  }
  warm(S, camera);
  const VMAX = .11;
  [[[.16, .205], [.38, .385], [.565, .585]], [], [[.16, .19]], [[.155, .2], [.565, .57]]].forEach((w, i) => pickables[i].noLift = w);
  STAGES.cd = { update, root, S, groups: [['case', caseG.children.filter(c => c !== lidHinge)], ['lid', lidHinge], ['bookBack', bBack], ['bookFront', bFront], ['disc', disc], ['insert', backInsert]] };
  function frame(now) {
    const dt = Math.min((now - t0) / 1000, .05); t0 = now;
    if (inView(sec)) {
      // ease toward the scroll position so wheel steps become smooth motion
      const target = window.__forceP?.cd ?? sectionProgress(sec);
      // motion profile: accelerate gently, cruise at a locked speed, then decelerate at a
      // constant rate so the models glide to rest (velocity falls smoothly to zero, no snap)
      // a popped-out piece goes back first; the unboxing waits until it is home, so nothing clips
      if (Math.abs(target - sp) > 1e-4) pickables.forEach(k => k.focus = 0);
      const lifted = pickables.some(k => k.focus || k.lift > .004);
      if (lifted && !window.__forceP) sv = 0;
      else {
        const gap = target - sp, AMAX = VMAX * 1.4;
        const want = Math.sign(gap) * Math.min(VMAX, Math.sqrt(2 * AMAX * .8 * Math.abs(gap)));
        sv += clamp(want - sv, -AMAX * dt, AMAX * dt);
        sp = clamp(sp + sv * dt, 0, 1);
        if ((Math.abs(target - sp) < 1e-5 && Math.abs(sv) < 2e-3) || window.__forceP) { sp = target; sv = 0; }
      }
      const moving = sp !== S.lastP || S.dirty || !S.drawn
        || Math.abs(S.rot.x - S.rot.tx) + Math.abs(S.rot.y - S.rot.ty) > 1e-5
        || pickables.some(k => Math.abs(k.lift - k.focus) > 1e-4);
      if (moving || sp > .53) {                       // past .53 a disc is spinning, keep drawing
        update(sp, dt, now);
        if (moving) S.renderer.shadowMap.needsUpdate = true;   // a spinning disc casts the same shadow
        S.renderer.render(S.scene, camera);
        adapt(S, dt);
        S.lastP = sp; S.drawn = true; S.dirty = false;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =================================================================
   TRACKLIST + SPOTIFY PLAYER
   ================================================================= */
const SPOTIFY_ALBUM = 'spotify:album:4AIX5TN8oT656mgxRwDevJ';
const SPOTIFY_IDS = ['7AxXJXqJOMRqkgZxvG3r6E', '66tlRqExpkn4kRyuxelzs5', '2oPCpj9ezVq5D6IJNAGkL2', '3unY0p45pcQVnABntzlX8B', '1dByUyyoRKL99fJJ6VCQzb', '4eVeuJ3a4bBlQWwfRutxwJ', '5MUzICHHfkCdMsorkUG34R', '5XEiB0fnWSZpBhE2t7sumF', '2eIRfeewYUjqr7gqc4tHWh', '2AO3eTcub4Gh8epdyYoZEv', '0vRZm4RiCqucc89v3AVbbI', '47fmAJR4rBqOu2c1Vmh73f', '4WjjHDBuJL9g5wAkQbIa8X', '2eBIrx3OLzOwtRwGoXcCZM', '3wEItjsFLU3QTglN0inpko', '0X5yoiAdFeKl8lBxXL6GSD', '2vRDMeUfvfP1Vvf4BfoiWp', '4U8Uus44j7KWQaU7ad0Gys', '5jj9wgYAnMVUqJUYvw8LMt', '6SWcn5rpHaqpjJ5au2CQqv', '7gkw71l5TLZb5SDn7PR830'];
const APPLE_ALBUM = 'https://music.apple.com/us/album/so-close-to-what-deluxe/1854870821';
const APPLE_IDS = [1854871391, 1854871397, 1854871401, 1854871413, 1854871778, 1854871781, 1854871786, 1854871791, 1854871792, 1854871794, 1854871795, 1854871797, 1854871799, 1854872274, 1854872286, 1854872290, 1854872295, 1854872301, 1854872374, 1854872385, 1854872594];
const spUrl = i => `https://open.spotify.com/track/${SPOTIFY_IDS[i]}`;
const apUrl = i => `${APPLE_ALBUM}?i=${APPLE_IDS[i]}`;

const list = document.getElementById('tracklist');
TRACKS.forEach((tr, i) => {
  const [name, note] = Array.isArray(tr) ? tr : [tr];
  const li = document.createElement('li');
  li.className = 'track';
  li.style.transitionDelay = `${(i % 7) * 60}ms`;
  li.innerHTML = `
    <span class="n">${String(i + 1).padStart(2, '0')}</span>
    <span class="t">${name.toUpperCase()}${note ? `<small>(${note})</small>` : ''}</span>
    <span class="acts">
      <button class="chip play" data-i="${i}">▶ Play</button>
      <a class="chip" target="_blank" rel="noopener" href="${spUrl(i)}">Spotify</a>
      <a class="chip" target="_blank" rel="noopener" href="${apUrl(i)}">Apple</a>
    </span>`;
  list.appendChild(li);
});
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .2 });
list.querySelectorAll('.track').forEach(t => io.observe(t));

const player = document.getElementById('player'), npFull = document.getElementById('npFull');
const npKinetic = document.getElementById('npKinetic'), npProg = document.getElementById('npProg');
const npPos = document.getElementById('npPos'), npDur = document.getElementById('npDur');
const fmt = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
let controller = null, current = -1, wantPlay = false;

function setNowPlaying(i) {
  current = i;
  const name = i < 0 ? 'SO CLOSE TO WHAT???' : (Array.isArray(TRACKS[i]) ? TRACKS[i][0] : TRACKS[i]).toUpperCase();
  npKinetic.innerHTML = [...name].map((c, k) => `<span style="animation-delay:${k * 70}ms">${c === ' ' ? '&nbsp;' : c}</span>`).join('');
  document.getElementById('npLyrics').href = i < 0 ? 'https://open.spotify.com/album/4AIX5TN8oT656mgxRwDevJ' : spUrl(i);
  document.getElementById('npApple').href = i < 0 ? APPLE_ALBUM : apUrl(i);
  list.querySelectorAll('.track').forEach((t, k) => t.classList.toggle('playing', k === i));
}

async function play(uri, i) {
  setNowPlaying(i);
  player.hidden = false; document.body.classList.add('has-player');
  wantPlay = true;
  if (controller) { controller.loadUri(uri); return; }
  const API = await window.spotifyReady;
  API.createController(document.getElementById('spotifyEmbed'), { uri, width: '100%', height: 80 }, c => {
    controller = c;
    c.addListener('ready', () => { if (wantPlay) { c.play(); wantPlay = false; } });
    c.addListener('playback_update', e => {
      const { isPaused, position, duration } = e.data;
      player.classList.toggle('paused', isPaused);
      if (duration) { npProg.style.width = (position / duration * 100) + '%'; npPos.textContent = fmt(position); npDur.textContent = fmt(duration); }
    });
  });
}
// Where the Spotify embed script is blocked (e.g. a strict preview viewer), open the song on Spotify instead
const embedOK = () => !window.spotifyBlocked;
list.addEventListener('click', e => {
  const b = e.target.closest('.play'); if (!b) return;
  const i = +b.dataset.i;
  if (!embedOK()) return window.open(spUrl(i), '_blank', 'noopener');
  play(`spotify:track:${SPOTIFY_IDS[i]}`, i);
});
document.getElementById('playAll').addEventListener('click', () => {
  if (!embedOK()) return window.open('https://open.spotify.com/album/4AIX5TN8oT656mgxRwDevJ', '_blank', 'noopener');
  play(SPOTIFY_ALBUM, -1);
});
document.getElementById('npExpand').addEventListener('click', () => npFull.hidden = false);
document.getElementById('npClose').addEventListener('click', () => npFull.hidden = true);
// close the mini player completely (stops playback)
document.getElementById('npClose2').addEventListener('click', () => {
  try { controller?.pause(); } catch {}
  player.hidden = true; npFull.hidden = true; document.body.classList.remove('has-player');
  list.querySelectorAll('.track').forEach(t => t.classList.remove('playing'));
});
document.querySelectorAll('[data-soon]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
document.querySelectorAll('[data-placeholder]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
