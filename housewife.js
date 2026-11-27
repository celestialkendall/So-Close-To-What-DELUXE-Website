import * as THREE from './lib/three.module.js';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';

/* =================================================================
   HOUSEWIFE page
   - hero: original / Halloween cover switch
   - 3D: closed CD jewel case (4 cover versions) and the 7" vinyl.
     Nothing opens except the record, which can be pulled out of its sleeve.
   - tracklist: studio + live (VS Fashion Show 2026), Spotify embed player
   ================================================================= */
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const MOBILE = matchMedia('(pointer: coarse) and (hover: none)').matches;
const IMG = n => `img/housewife/${n}${MOBILE ? '-m' : ''}.webp`;
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });
const FONT = '"HelveticaUL", "Helvetica Neue", Helvetica, Arial, sans-serif';

/* ---------- hero cover switch ---------- */
document.querySelectorAll('[data-cover]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-cover]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  document.getElementById('coverA').classList.toggle('on', b.dataset.cover === 'A');
  document.getElementById('coverB').classList.toggle('on', b.dataset.cover === 'B');
}));

/* ---------- smooth, speed-limited scrolling (same as the main page) ----------
   Wheel / trackpad / keys feed a target; the page glides there on a damped spring and
   eases to a stop. Speed is capped so a hard flick can't fling the page. */
const SS = { y: scrollY, target: scrollY, v: 0, fast: false };
const maxY = () => document.documentElement.scrollHeight - innerHeight;
function nudge(d) {
  SS.fast = false;
  SS.target = clamp(SS.target + d, 0, maxY());
  SS.target = clamp(SS.target, SS.y - innerHeight * 1.2, SS.y + innerHeight * 1.2);
}
const smoothScrollTo = y => { SS.target = clamp(y, 0, maxY()); SS.fast = true; };
addEventListener('wheel', e => { if (e.ctrlKey) return; e.preventDefault(); nudge(e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1)); }, { passive: false });
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
let ssT = performance.now();
(function ssLoop(now) {
  const dt = Math.min((now - ssT) / 1000, .05); ssT = now;
  const gap = SS.target - SS.y;
  if (Math.abs(gap) > .5 || Math.abs(SS.v) > 2) {
    const cap = (SS.fast ? 7 : 4.5) * innerHeight;
    SS.v += (gap * 36 - 12 * SS.v) * dt;
    SS.v = clamp(SS.v, -cap, cap);
    SS.y += SS.v * dt;
    if (Math.abs(SS.target - SS.y) < .5 && Math.abs(SS.v) < 2) { SS.y = SS.target; SS.v = 0; SS.fast = false; }
    scrollTo(0, SS.y);
  }
  requestAnimationFrame(ssLoop);
})(ssT);

/* ---------- view-only ---------- */
const toggle = document.getElementById('cleanToggle');
toggle.addEventListener('click', () => {
  const on = document.body.classList.toggle('clean');
  toggle.setAttribute('aria-pressed', on);
  toggle.querySelector('.lbl').textContent = on ? 'Show text' : 'View only';
});

/* ---------- tracklist + Spotify ---------- */
const TRACKS = [
  { name: 'Housewife', note: 'Single', sp: '2sFepQNyl1WjpROruP8bJ0', ap: 'https://music.apple.com/us/album/housewife/6822497770?i=6822497774', img: 'cover' },
  { name: 'Housewife', note: "Live from The Victoria's Secret Fashion Show 2026", sp: '61LsiYvjx6R4taEZUOyWQb', ap: 'https://music.apple.com/us/album/housewife-live-from-the-victorias-secret-fashion-show/6825557427?i=6825557429', img: 'cover-live', sub: true },
];
const list = document.getElementById('tracklist');
TRACKS.forEach((t, i) => {
  const li = document.createElement('li');
  li.className = 'track' + (t.sub ? ' sub' : '');
  li.style.transitionDelay = `${i * 120}ms`;
  li.innerHTML = `<img src="img/housewife/${t.img}-m.webp" alt="">
    <span class="t">${t.name.toUpperCase()}<small>${t.note}</small></span>
    <span class="acts"><button class="chip play" data-i="${i}">▶ Play</button>
      <a class="chip" target="_blank" rel="noopener" href="https://open.spotify.com/track/${t.sp}">Spotify</a>
      <a class="chip" target="_blank" rel="noopener" href="${t.ap}">Apple</a></span>`;
  list.appendChild(li);
});
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .2 });
list.querySelectorAll('.track').forEach(t => io.observe(t));
let controller = null;
list.addEventListener('click', async e => {
  const b = e.target.closest('.play'); if (!b) return;
  const t = TRACKS[+b.dataset.i], uri = `spotify:track:${t.sp}`;
  if (window.spotifyBlocked) return window.open(`https://open.spotify.com/track/${t.sp}`, '_blank', 'noopener');
  list.querySelectorAll('.track').forEach((x, k) => x.classList.toggle('playing', k === +b.dataset.i));
  document.getElementById('playerSlot').hidden = false;
  if (controller) { controller.loadUri(uri); controller.play(); return; }
  const API = await window.spotifyReady;
  API.createController(document.getElementById('spotifyEmbed'), { uri, width: '100%', height: 152 }, c => {
    controller = c; c.addListener('ready', () => c.play());
  });
});

/* =================================================================
   3D
   ================================================================= */
await document.fonts.load('100 40px HelveticaUL');
const canvas = document.getElementById('hwGL');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), .02).texture;
const camera = new THREE.PerspectiveCamera(32, 1, 1, 100);
camera.position.set(0, .3, 11);

// warm villa-garden backdrop: deep red to olive, matching the cover
const sky = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#120907'); g.addColorStop(.45, '#3a1412'); g.addColorStop(.55, '#2b2614'); g.addColorStop(1, '#0c0805');
  x.fillStyle = g; x.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide, depthWrite: false })));
scene.add(new THREE.HemisphereLight(0xffe2cc, 0x1a0c08, .6));
const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(4, 7, 8); key.castShadow = true;
key.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); key.shadow.normalBias = .02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xff5a4a, 2.2); rim.position.set(-6, 2, -5); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: .45 }));
floor.position.y = -2.4; floor.receiveShadow = true; scene.add(floor);

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const photoTex = img => { const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true; return t; };
const print = (tex, gloss = .3) => new THREE.MeshPhysicalMaterial({ map: tex, roughness: .5, clearcoat: gloss, clearcoatRoughness: .3 });
const shadowed = o => { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; };

const [imgCover, ...imgCDs] = await Promise.all([IMG('cover'), ...['cd-housewife', 'cd-life-imitating-art', 'cd-run-away-with-me', 'cd-icing-on-the-dream'].map(IMG)].map(loadImg));
const CD_TEX = Object.fromEntries(['cd-housewife', 'cd-life-imitating-art', 'cd-run-away-with-me', 'cd-icing-on-the-dream'].map((n, i) => [n, photoTex(imgCDs[i])]));

/* ---------- mockup prints (real backs/labels haven't been shown yet) ---------- */
const S = MOBILE ? 1024 : 2048;
function textBlock(x, s, lines) { for (const [txt, size, y, alpha = 1, align = 'center', xx = s / 2] of lines) { x.globalAlpha = alpha; x.textAlign = align; x.font = `100 ${size * s / 2048}px ${FONT}`; x.fillText(txt, xx, y * s); } x.globalAlpha = 1; }
const cdBackTex = canvasTex(S, (x, s) => {
  const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, '#7d1416'); g.addColorStop(.7, '#4a0d0e'); g.addColorStop(1, '#2b2614');
  x.fillStyle = g; x.fillRect(0, 0, s, s); x.fillStyle = '#efe2cf'; x.textBaseline = 'middle';
  textBlock(x, s, [['TATE McRAE', 70, .16, .8], ['HOUSEWIFE', 230, .3], ['1   HOUSEWIFE', 64, .5, .9], ['3:28', 54, .56, .6], ['RCA RECORDS', 40, .86, .7], ['Ⓟ & © 2026 RCA RECORDS, A DIVISION OF SONY MUSIC ENTERTAINMENT', 26, .91, .5]]);
  x.fillStyle = '#fff'; x.fillRect(s * .74, s * .76, s * .18, s * .1);           // barcode
  x.fillStyle = '#111'; for (let i = 0; i < 46; i++) if (Math.random() > .4) x.fillRect(s * .75 + i * s * .0034, s * .775, s * (.0012 + Math.random() * .002), s * .065);
});
const spineTex = canvasTex(1024, (x, s) => {
  x.fillStyle = '#9e1b1e'; x.fillRect(0, 0, s, s); x.fillStyle = '#efe2cf'; x.textBaseline = 'middle';
  x.font = `100 ${s * .06}px ${FONT}`; x.textAlign = 'center'; x.fillText('TATE McRAE   ·   HOUSEWIFE', s / 2, s / 2);
});
const vinylBackTex = canvasTex(S, (x, s) => {
  x.fillStyle = '#efe2cf'; x.fillRect(0, 0, s, s); x.fillStyle = '#7d1416'; x.textBaseline = 'middle';
  textBlock(x, s, [['TATE McRAE', 80, .14, .85], ['HOUSEWIFE', 260, .32], ['SIDE A', 52, .55, .6], ['HOUSEWIFE', 80, .6], ['SIDE B', 52, .71, .6], ['HOUSEWIFE (INSTRUMENTAL)', 80, .76], ['45 RPM  ·  RCA RECORDS', 40, .9, .6]]);
});
function labelTex(side, title) {
  return canvasTex(S, (x, s) => {
    const c = s / 2;
    x.fillStyle = '#efe2cf'; x.beginPath(); x.arc(c, c, c, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c8282b'; x.lineWidth = s * .01; x.beginPath(); x.arc(c, c, c * .9, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#7d1416'; x.textBaseline = 'middle';
    textBlock(x, s, [['TATE McRAE', 150, .27], [title, title.length > 12 ? 92 : 150, .7], ['SIDE ' + side, 70, .8, .7], ['45 RPM', 54, .5, .6, 'left', s * .1], ['RCA', 54, .5, .6, 'right', s * .9]]);
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(c, c, s * .045, 0, Math.PI * 2); x.fill();
  });
}

/* =================================================================
   CD: closed jewel case, to scale (142 × 125 × 10.4 mm), front insert swappable
   ================================================================= */
const clear = op => new THREE.MeshPhysicalMaterial({ color: 0xf6f8fb, transparent: true, opacity: op, depthWrite: false, roughness: .02, clearcoat: 1, envMapIntensity: 2.6 });
const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0xe8edf4, transparent: true, opacity: .32, depthWrite: false, roughness: .02, clearcoat: 1, envMapIntensity: 2.6 });
const W = 2.84, H = 2.5;
const cd = new THREE.Group(); scene.add(cd);
const cdInner = new THREE.Group(); cd.add(cdInner);
{
  const box = (w, h, d, mat, x, y, z, ro = 2) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(d * .45, .008)), mat); m.position.set(x, y, z); m.renderOrder = ro; cdInner.add(m); return m; };
  box(W, H, .016, clear(.1), 0, 0, -.13, 1);                       // base
  box(.035, H, .17, edgeMat, -W / 2 + .018, 0, -.04, 1);            // spine wall
  box(W - .1, H - .05, .13, clear(.07), .03, 0, -.02, 2);           // tray
  box(W, H, .022, clear(.09), 0, 0, .146, 4);                       // lid
  for (const y of [-1, 1]) {
    box(W - .22, .016, .24, edgeMat, .11, y * (H / 2 - .008), .03, 4);   // lid flanges
    const k = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .2, 20), edgeMat); k.position.set(-W / 2, y * (H / 2 - .07), -.06); cdInner.add(k);
  }
  // front insert (under the lid) and back card (behind the tray) with red spines
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), print(CD_TEX['cd-housewife'], .2));
  front.position.set(.18, 0, .132); front.castShadow = true; cdInner.add(front); cd.userData.front = front;
  const backCard = new THREE.Mesh(new THREE.PlaneGeometry(W - .14, H - .1), print(cdBackTex, .2));
  backCard.rotation.y = Math.PI; backCard.position.z = -.112; cdInner.add(backCard);
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - .14, H - .1), new THREE.MeshStandardMaterial({ color: 0x7d1416, roughness: .7 }));
  inner.position.z = -.108; cdInner.add(inner);
  for (const sx of [-1, 1]) {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(H - .1, .16), new THREE.MeshStandardMaterial({ map: spineTex, roughness: .6 }));
    sp.rotation.set(0, sx * Math.PI / 2, sx * Math.PI / 2); sp.position.set(sx * ((W - .14) / 2 + .002), 0, -.03); cdInner.add(sp);
  }
  // shadow catcher: an invisible slab so the clear case still casts a soft shadow
  const sh = new THREE.Mesh(new THREE.BoxGeometry(W, H, .2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  sh.castShadow = true; cdInner.add(sh);
}

/* =================================================================
   7" VINYL: picture sleeve (open on the right) + light-blue record
   ================================================================= */
const vinyl = new THREE.Group(); scene.add(vinyl);
const VW = 3.1, R = 1.46;
const sleeveFront = new THREE.Mesh(new THREE.PlaneGeometry(VW, VW), print(photoTex(imgCover), .25));
const sleeveBack = new THREE.Mesh(new THREE.PlaneGeometry(VW, VW), print(vinylBackTex, .25));
const paperIn = new THREE.MeshStandardMaterial({ color: 0xe9dfd0, roughness: .9, side: THREE.DoubleSide });
sleeveFront.position.z = .02; sleeveBack.position.z = -.02; sleeveBack.rotation.y = Math.PI;
const sleeve = new THREE.Group(); sleeve.add(sleeveFront, sleeveBack);
for (const [w, h, x, y, ry, rx] of [[.04, VW, -VW / 2, 0, Math.PI / 2, 0], [VW, .04, 0, VW / 2, 0, Math.PI / 2], [VW, .04, 0, -VW / 2, 0, Math.PI / 2]]) {
  const e = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paperIn); e.position.set(x, y, 0); e.rotation.set(rx, ry, 0); sleeve.add(e);
}
const backIn = new THREE.Mesh(new THREE.PlaneGeometry(VW, VW), paperIn); backIn.position.z = -.0195; sleeve.add(backIn);
const frontIn = new THREE.Mesh(new THREE.PlaneGeometry(VW, VW), paperIn); frontIn.position.z = .0195; sleeve.add(frontIn);
vinyl.add(shadowed(sleeve));

// record: lathe profile with planar UVs, groove normal map, translucent light blue
const grooves = (() => {
  const N = MOBILE ? 512 : 1024, d = new Uint8Array(N * N * 4), h = N / 2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - h + .5, dy = y - h + .5, dp = Math.hypot(dx, dy), r = dp / h * R;
    const s = r > .62 && r < 1.38 ? Math.cos(r / Math.max(.006, 6 * R / N) * Math.PI * 2) * .5 : 0;
    const nx = -s * dx / (dp || 1), ny = s * dy / (dp || 1), l = Math.hypot(nx, ny, 1), i = (y * N + x) * 4;
    d[i] = (nx / l * .5 + .5) * 255; d[i + 1] = (ny / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
})();
const record = new THREE.Group(), spin = new THREE.Group(); record.add(spin);
{
  const prof = [[.04, .009], [.6, .009], [.62, .007], [1.43, .007], [1.46, .004], [1.46, -.004], [1.43, -.007], [.62, -.007], [.6, -.009], [.04, -.009], [.04, .009]];
  const geo = new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), 200).rotateX(Math.PI / 2);
  const p = geo.attributes.position, u = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / (2 * R) + .5, p.getY(i) / (2 * R) + .5);
  geo.computeVertexNormals();
  const disc = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x5aaee8, transparent: true, opacity: .88, roughness: .2, clearcoat: 1, clearcoatRoughness: .08,
    normalMap: grooves, normalScale: new THREE.Vector2(.6, .6), envMapIntensity: 1.6, side: THREE.DoubleSide }));
  disc.castShadow = true; spin.add(disc);
  const la = new THREE.Mesh(new THREE.CircleGeometry(.56, 96), new THREE.MeshStandardMaterial({ map: labelTex('A', 'HOUSEWIFE'), transparent: true, roughness: .6 }));
  const lb = new THREE.Mesh(new THREE.CircleGeometry(.56, 96), new THREE.MeshStandardMaterial({ map: labelTex('B', 'HOUSEWIFE (INSTRUMENTAL)'), transparent: true, roughness: .6 }));
  la.position.z = .0095; lb.position.z = -.0095; lb.rotation.y = Math.PI; spin.add(la, lb);
}
record.position.set(.04, 0, 0); vinyl.add(record);

/* =================================================================
   interaction + render loop (only redraws while something moves)
   ================================================================= */
const state = { model: 'cd', yaw: -.35, pitch: .08, tYaw: -.35, tPitch: .08, cur: 'cd', trans: null, pull: 0, tPull: 0, swap: null, idle: 0, dirty: true };
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  state.tYaw += (e.clientX - drag.x) * .008; state.tPitch = clamp(state.tPitch + (e.clientY - drag.y) * .005, -.7, .7);
  drag = { x: e.clientX, y: e.clientY }; state.idle = 0;
});
canvas.addEventListener('pointerup', () => { drag = null; });
// clicking the record in view toggles it in/out
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
canvas.addEventListener('click', e => {
  if (state.model !== 'vinyl') return;
  const r = canvas.getBoundingClientRect(); ptr.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ptr, camera);
  if (ray.intersectObject(vinyl, true).length) setPull(state.tPull ? 0 : 1);
});

const title = document.getElementById('modelTitle'), note = document.getElementById('modelNote');
const variants = document.getElementById('variants'), pullBtn = document.getElementById('pullBtn');
function setPull(v) { state.tPull = v; pullBtn.textContent = v ? 'Put record back' : 'Pull out record'; }
pullBtn.addEventListener('click', () => setPull(state.tPull ? 0 : 1));
document.getElementById('flipBtn').addEventListener('click', () => { state.tYaw += Math.PI; state.idle = 0; });
document.querySelectorAll('[data-model]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-model]').forEach(x => x.classList.toggle('on', x === b));
  if (b.dataset.model === state.model) return;
  state.trans = { from: state.cur, to: b.dataset.model, t: 0, dir: b.dataset.model === 'vinyl' ? 1 : -1 };
  state.model = b.dataset.model; setPull(0); state.pull = 0;
  state.tYaw = Math.round(state.tYaw / (Math.PI * 2)) * Math.PI * 2 - .35; state.idle = 0;   // always show the front first
  const isCD = state.model === 'cd';
  variants.hidden = !isCD; pullBtn.hidden = isCD;
  title.textContent = isCD ? 'CD SINGLE' : '7" VINYL';
  note.textContent = isCD ? 'Ships soon. Back is a mockup until the real one is shown.' : 'Light-blue 7". Side A: Housewife · Side B: Housewife (Instrumental). Back and labels are mockups.';
}));
variants.addEventListener('click', e => {
  const b = e.target.closest('[data-v]'); if (!b || b.classList.contains('on')) return;
  variants.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b));
  state.swap = { t: 0, to: b.dataset.v, done: false };          // quick spin, insert swaps edge-on
});

function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); state.dirty = true; }
resize(); addEventListener('resize', resize);
const visible = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };

let t0 = performance.now();
function frame(now) {
  const dt = Math.min((now - t0) / 1000, .05); t0 = now;
  if (visible()) {
    state.idle += dt;
    if (!drag && state.idle > 4 && state.tPull === 0) state.tYaw += dt * .25;          // gentle turntable when idle
    const k = 1 - Math.exp(-dt * 6);
    const prev = [state.yaw, state.pitch, state.pull, state.trans ? state.trans.t : -1];
    state.yaw = lerp(state.yaw, state.tYaw, k); state.pitch = lerp(state.pitch, state.tPitch, k);
    state.pull = clamp(state.pull + Math.sign(state.tPull - state.pull) * dt * .9, 0, 1);

    // model swap, in two halves so they never overlap:
    //  1) outgoing spins half a turn and glides off to one side while tipping back
    //  2) incoming sweeps in from the other side, spinning the rest of the way to face you
    const G = { cd, vinyl };
    for (const k in G) { G[k].visible = false; G[k].position.set(0, 0, 0); G[k].rotation.set(state.pitch, state.yaw, 0); G[k].scale.setScalar(1); }
    if (state.trans) {
      const tr = state.trans; if (!state.freezeT) tr.t = Math.min(1, tr.t + dt / 1.5);
      const out = ease(clamp(tr.t / .5)), inn = ease(clamp((tr.t - .5) / .5));
      const o = G[tr.from], n = G[tr.to];
      // how far to the side counts as fully off-screen: visible half-width at that depth + the model's own size
      const offX = d => (camera.position.z - d) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect + 3.6;
      if (tr.t < .5) {
        o.visible = true;
        o.position.set(-tr.dir * offX(-3) * out, -.4 * Math.sin(out * Math.PI), -3 * out);
        o.rotation.set(state.pitch + .3 * out, state.yaw - tr.dir * Math.PI * out, tr.dir * .15 * out);
      } else {
        n.visible = true;
        n.position.set(tr.dir * offX(-3) * (1 - inn), .4 * Math.sin(inn * Math.PI), -3 * (1 - inn));
        n.rotation.set(state.pitch + .3 * (1 - inn), state.yaw + tr.dir * Math.PI * (1 - inn), -tr.dir * .15 * (1 - inn));
      }
      if (tr.t >= 1) { state.cur = tr.to; state.trans = null; }
    } else G[state.cur].visible = true;
    // CD cover swap: a full turn, insert texture changes while edge-on
    if (state.swap) {
      const sw = state.swap; sw.t = Math.min(1, sw.t + dt / .9);
      cdInner.rotation.y = ease(sw.t) * Math.PI * 2;
      if (!sw.done && sw.t > .25) { cd.userData.front.material.map = CD_TEX[sw.to]; cd.userData.front.material.needsUpdate = true; sw.done = true; }
      if (sw.t >= 1) { cdInner.rotation.y = 0; state.swap = null; }
    }
    // record: slides straight out of the open right edge, then steps forward and spins
    const p = ease(state.pull), slide = ease(clamp(p / .7)), fwd = ease(clamp((p - .6) / .4));
    record.position.set(.04 + slide * (VW + .1), 0, fwd * .5);
    record.rotation.y = -.25 * fwd;
    sleeve.position.x = -slide * .9;
    if (fwd > 0) spin.rotation.z -= dt * 4.7 * fwd;                                    // 45 rpm
    // keep sleeve + record centred as a pair, and pull the camera back far enough that both fit
    vinyl.position.x += -1.17 * slide;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const needW = lerp(4.9, 7.8, slide) / 2;                                   // half the width that must be visible
    camera.position.set(0, .3, Math.max(lerp(11, 12.5, slide), needW / tanH + .6));
    camera.lookAt(0, camera.aspect < 1 ? -.7 : 0, 0);   // portrait: models sit higher, clear of the buttons

    const moving = state.dirty || drag || state.swap || Math.abs(prev[0] - state.yaw) > 1e-5 || Math.abs(prev[1] - state.pitch) > 1e-5 ||
      prev[2] !== state.pull || state.trans || fwd > 0 || (state.idle > 4 && !state.tPull);
    if (moving) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); state.dirty = false; }
  }
  requestAnimationFrame(frame);
}
renderer.shadowMap.autoUpdate = false;
window.__HW = state;
requestAnimationFrame(frame);
