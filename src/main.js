import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// =====================================================================
//  CONFIG
// =====================================================================
const HERO_DEFS = [
  { key: 'people', file: 'models/people.glb', name: 'People', title: '格鬥少年', hp: 110, dmg: 1.0, speed: 1.0 },
  { key: 'gundan', file: 'models/gundan.glb', name: 'Gundan', title: '重裝戰士', hp: 150, dmg: 1.35, speed: 0.92 },
];
// 2.5D level: a long street running left → right
const LEVEL_END = 400;        // x where the level ends (boss arena at the end)
const ARENA_X = 300;          // boss arena starts here
const LANE_MIN_Z = -7.6, LANE_MAX_Z = 7.4; // walkable depth band
const HERO_H = 1.8;
const MONSTER_H = 16;
const MONSTER_HP = 3000;
const HOUSE_W = 12;
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (IS_TOUCH) document.body.classList.add('touch');


const DEBUG = new URLSearchParams(location.search);
const MAP = DEBUG.get('map') === 'desert' ? 'desert' : 'city';
// =====================================================================
//  RENDERER / SCENE
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !DEBUG.has('lowq');
if (DEBUG.has('lowq')) renderer.setPixelRatio(.5);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe6f7, 90, 330);
// 2.5D: fixed side-elevated camera with a narrow lens (flattened perspective)
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 1200);

// sky dome
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(600, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fd8) }, hor: { value: new THREE.Color(0xd6ecfb) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vP; void main(){ float h = max(vP.y,0.0); gl_FragColor = vec4(mix(hor, top, smoothstep(0.0,0.55,h)),1.0); }',
  })
);
scene.add(sky);
if (MAP === 'desert') { scene.fog.color.set(0xe8dcc4); scene.fog.near = 70; scene.fog.far = 360; sky.material.uniforms.top.value.set(0x6fa6d6); sky.material.uniforms.hor.value.set(0xeee6d6); }

const hemi = new THREE.HemisphereLight(0xe3f2ff, MAP === 'desert' ? 0xc8a46a : 0x6f8a4a, 1.25);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 260;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// toon gradient
const gradientMap = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();
const toonCache = {};
const toon = (c) => toonCache[c] || (toonCache[c] = new THREE.MeshToonMaterial({ color: c, gradientMap }));

// =====================================================================
//  TEXTURES (procedural)
// =====================================================================
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const softTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});
const puffTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 9; i++) {
    const x = s * (.3 + Math.random() * .4), y = s * (.3 + Math.random() * .4), r = s * (.16 + Math.random() * .14);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});
const cloudTex = canvasTex(256, (g, s) => {
  for (let i = 0; i < 14; i++) {
    const x = s * (.2 + Math.random() * .6), y = s * (.45 + Math.random() * .2), r = s * (.1 + Math.random() * .12);
    const gr = g.createRadialGradient(x, y - r * .3, 0, x, y, r);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(.7, 'rgba(240,248,255,.95)'); gr.addColorStop(1, 'rgba(220,235,250,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});

// =====================================================================
//  AUDIO (tiny synth)
// =====================================================================
let actx = null;
function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (actx?.state === 'suspended') actx.resume(); return actx; }
function sfx(type, vol = 1) {
  const a = actx; if (!a || a.state !== 'running') return;
  const t = a.currentTime, g = a.createGain(); g.connect(a.destination);
  if (type === 'hit' || type === 'boom' || type === 'crash') {
    const len = type === 'hit' ? .12 : type === 'boom' ? .6 : 1.0;
    const buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, type === 'hit' ? 3 : 1.6);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = type === 'hit' ? 2200 : type === 'boom' ? 420 : 900;
    src.connect(f); f.connect(g); g.gain.value = .5 * vol; src.start(t);
  } else if (type === 'roar') {
    const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(55, t + 1.6);
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    o.connect(f); f.connect(g); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.35 * vol, t + .2); g.gain.exponentialRampToValueAtTime(.0001, t + 1.7);
    o.start(t); o.stop(t + 1.8);
  } else if (type === 'beam') {
    const o = a.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(200, t + 1.5);
    o.connect(g); g.gain.setValueAtTime(.06 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6); o.start(t); o.stop(t + 1.6);
  } else if (type === 'whoosh') {
    const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(500, t); o.frequency.exponentialRampToValueAtTime(140, t + .15);
    o.connect(g); g.gain.setValueAtTime(.08 * vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .16); o.start(t); o.stop(t + .17);
  }
}

// =====================================================================
// =====================================================================
//  2.5D SIDE-SCROLLING LEVEL
//  The playable lane runs along +X (left → right). Depth (Z) is narrow.
//  The camera sits in front (+Z) looking at the street; houses line the back.
// =====================================================================
const colliders = [];     // {minX,maxX,minZ,maxZ, house?, off?}
const houses = [];        // destructible houses (boss arena only)
const rubbleGroup = new THREE.Group(); scene.add(rubbleGroup);
const bounds = { minX: -6, maxX: LEVEL_END - 2, minZ: LANE_MIN_Z, maxZ: LANE_MAX_Z };
let floatingCastle = null;
function groundAt() { return 0; }

function addCollider(cx, cz, hx, hz, house = null) {
  const c = { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, house, off: false };
  colliders.push(c); return c;
}
const rand = (a, b) => a + Math.random() * (b - a);

const sandTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#dcc189'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) for (let x = 0; x < s; x += 2) {
    const w = Math.sin((y + Math.sin(x * .045) * 14 + Math.sin(x * .013) * 22) * .38);
    const n = Math.random() * 10, l = w > .55 ? 22 : w < -.7 ? -26 : 0;
    g.fillStyle = `rgb(${220 + l + n | 0},${193 + l + n | 0},${137 + l * .8 + n | 0})`; g.fillRect(x, y, 2, 2);
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(60, 12); sandTex.anisotropy = 8;

// --- house factory from the user's house GLB
let houseFactory = null;
function makeHouseFactory(gltf) {
  const tpl = gltf.scene;
  tpl.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tpl.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(tpl), size = b.getSize(new THREE.Vector3());
  const s0 = HOUSE_W / Math.max(size.x, size.z);
  return (x, z, rotY = 0, scale = 1, collide = true) => {
    const s = s0 * scale;
    const g = new THREE.Group(); const m = tpl.clone(); m.scale.setScalar(s);
    m.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s); g.add(m);
    g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const sw = Math.abs(Math.sin(rotY)) > .5;
    const hx = (sw ? size.z : size.x) * s / 2, hz = (sw ? size.x : size.z) * s / 2;
    const house = { group: g, model: m, x, z, hx, hz, h: size.y * s, hp: 100, alive: true, shake: 0, collapse: -1, emit: 0 };
    if (collide) house.col = addCollider(x, z, hx * .92, hz * .92, house);
    return house;
  };
}

function buildLevel(houseGltf) {
  houseFactory = makeHouseFactory(houseGltf);
  const desert = MAP === 'desert';
  const L0 = -40, L1 = LEVEL_END + 40, LW = L1 - L0, LC = (L0 + L1) / 2;

  // ---- ground layers
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(LW + 400, 500), desert ? new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }) : toon(0x86b85a));
  ground.rotation.x = -Math.PI / 2; ground.position.set(LC, 0, -150); ground.receiveShadow = true; scene.add(ground);
  if (!desert) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(LW, 10), toon(0x7d8796)); road.rotation.x = -Math.PI / 2; road.position.set(LC, .02, 0); road.receiveShadow = true; scene.add(road);
    for (const z of [-4.3, 4.3]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(LW, .22), new THREE.MeshBasicMaterial({ color: 0xf4f4f4 })); l.rotation.x = -Math.PI / 2; l.position.set(LC, .035, z); scene.add(l); }
    for (const [z, w] of [[-6.4, 2.8], [6.4, 2.8]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(LW, .16, w), toon(0xc2c6cc)); s.position.set(LC, .08, z); s.receiveShadow = true; scene.add(s); }
  } else {
    const path = new THREE.Mesh(new THREE.PlaneGeometry(LW, 13), new THREE.MeshStandardMaterial({ color: 0xcdb27b, roughness: 1 })); path.rotation.x = -Math.PI / 2; path.position.set(LC, .02, 0); path.receiveShadow = true; scene.add(path);
    for (let x = L0; x < L1; x += 3.2) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.6, .12, 1.4), toon(0xb99b66)); st.position.set(x + rand(-.4, .4), .06, rand(-1.5, 1.5)); st.rotation.y = rand(-.2, .2); st.receiveShadow = true; scene.add(st); }
  }

  // ---- back row: block wall + houses (decor until the arena)
  const wallMat = toon(desert ? 0xc8a878 : 0xa9adb6), capMat = toon(desert ? 0xb08e5e : 0x8d929c);
  // block wall with openings for the shop, the shrine and each house gate
  const gaps = [[EV.shop.x - 6.5, EV.shop.x + 6.5], [EV.shrine.x - 4.5, EV.shrine.x + 4.5]];
  for (let x = -16; x < ARENA_X - 10; x += 24) gaps.push([x - 1.6, x + 1.6]);
  gaps.sort((a, b) => a[0] - b[0]);
  let wx = L0;
  const seg = (a, b) => {
    if (b - a < .5) return; const w = b - a, cx = (a + b) / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, .35), wallMat); wall.position.set(cx, .75, -8.4); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, .12, .45), capMat); cap.position.set(cx, 1.56, -8.4); scene.add(cap);
    addCollider(cx, -8.4, w / 2, .3);
  };
  for (const [a, b] of gaps) { seg(wx, Math.max(wx, a)); wx = Math.max(wx, b); }
  seg(wx, ARENA_X - 6);

  for (let x = -16; x < ARENA_X - 10; x += 24) {
    if (Math.abs(x - EV.shop.x) < 10 || Math.abs(x - EV.shrine.x) < 12) continue; // leave room for set pieces
    houseFactory(x, -16, 0, 1, true);
  }
  // second / third row backdrop (smaller, no collision)
  for (let x = L0; x < L1 + 40; x += 21) houseFactory(x + rand(-3, 3), -40 + rand(-2, 2), Math.PI * (Math.random() < .5 ? 0 : 1), .95, false);
  for (let x = L0 - 20; x < L1 + 60; x += 26) houseFactory(x + rand(-4, 4), -66 + rand(-3, 3), rand(0, 6), .9, false);

  // ---- trees / palms between back houses
  const leafMats = [toon(0x4f9a3c), toon(0x5fae45), toon(0x3f8a36)];
  const trunkGeo = new THREE.CylinderGeometry(.22, .32, 3, 6), leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  function tree(x, z, s = 1) {
    const t = new THREE.Group();
    if (desert) {
      const h = 6 + Math.random() * 2;
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(.2, .32, h, 6), toon(0x8a6a44)); tr.position.y = h / 2; tr.rotation.z = rand(-.12, .12); t.add(tr);
      for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.5, 4, 4), toon(0x5e9a3c)); l.position.set(Math.cos(k) * 1.6, h - .3, Math.sin(k) * 1.6); l.rotation.set(Math.sin(k) * 1.3, 0, -Math.cos(k) * 1.3); t.add(l); }
    } else {
      const tr = new THREE.Mesh(trunkGeo, toon(0x7a5536)); tr.position.y = 1.5; t.add(tr);
      for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(leafGeo, leafMats[k % 3]); l.position.set(rand(-.8, .8), 3.3 + Math.random() * 1.4, rand(-.8, .8)); l.scale.setScalar(.8 + Math.random() * .5); l.rotation.set(Math.random(), Math.random(), 0); t.add(l); }
    }
    t.traverse(o => { if (o.isMesh) o.castShadow = true; });
    t.position.set(x, 0, z); t.scale.setScalar(s); scene.add(t);
  }
  for (let x = -4; x < ARENA_X - 10; x += 24) tree(x + rand(-1, 1), -11, rand(.9, 1.2));
  for (let x = L0; x < L1; x += 14) tree(x + rand(-4, 4), -28 + rand(-3, 3), rand(.9, 1.3));

  // ---- utility poles & wires along the back sidewalk (city) / wooden posts (desert)
  const wirePts = [];
  let prev = null;
  for (let x = L0 + 4; x < ARENA_X - 6; x += 19) {
    const p = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 9.5, 6), toon(desert ? 0x8a6a44 : 0x9a9a92)); pole.position.y = 4.75; pole.castShadow = true; p.add(pole);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.14, .14, 1.8), toon(0x55585e)); bar.position.y = 8.6; p.add(bar);
    p.position.set(x, 0, -7.6); scene.add(p); addCollider(x, -7.6, .25, .25);
    if (prev) for (const o of [-.75, 0, .75]) {
      const p0 = new THREE.Vector3(prev, 8.6, -7.6 + o), p1 = new THREE.Vector3(x, 8.6, -7.6 + o);
      const mid = p0.clone().lerp(p1, .5); mid.y -= .9;
      const pts = new THREE.QuadraticBezierCurve3(p0, mid, p1).getPoints(10);
      for (let i = 0; i < pts.length - 1; i++) wirePts.push(pts[i], pts[i + 1]);
    }
    prev = x;
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), new THREE.LineBasicMaterial({ color: 0x2a2d33 })));

  // ---- foreground strip (keeps the lane readable: only low things in front)
  if (!desert) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(LW, .5, .4), toon(0x9aa0a8)); curb.position.set(LC, .25, 8.1); scene.add(curb);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(LW, 30), toon(0x7cae4f)); grass.rotation.x = -Math.PI / 2; grass.position.set(LC, .01, 23); scene.add(grass);
    for (let x = L0; x < L1; x += 9) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 0), leafMats[(x / 9 | 0) % 3]); b.position.set(x + rand(-2, 2), .5, 9.2 + rand(0, 1.5)); b.scale.set(1.4, .7, 1); scene.add(b); }
  }

  // ---- distant horizon
  const far = [toon(desert ? 0xd9b98a : 0xb7c6d9), toon(desert ? 0xc8a46b : 0xa6b7cc)];
  for (let i = 0; i < 70; i++) {
    const x = rand(L0 - 150, L1 + 150), z = rand(-110, -190), h = rand(12, desert ? 45 : 55);
    const m = desert ? new THREE.Mesh(new THREE.CylinderGeometry(rand(8, 18), rand(14, 26), h, 6), far[i % 2]) : new THREE.Mesh(new THREE.BoxGeometry(rand(10, 24), h, rand(8, 18)), far[i % 2]);
    m.position.set(x, h / 2 - 1, z); scene.add(m);
  }
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(rand(60, 110), rand(40, 80), 7), toon(desert ? 0xe0c79a : 0x9fb8cf)); m.position.set(rand(L0 - 100, L1 + 100), 10, rand(-230, -280)); scene.add(m); }
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
    s.position.set(rand(L0 - 100, L1 + 100), rand(45, 90), rand(-140, -260)); const k = rand(50, 100); s.scale.set(k, k * .5, 1); scene.add(s);
  }
  if (desert) buildCastle(LEVEL_END - 60, -230);

  // ---- river park arena (boss)
  const ax0 = ARENA_X - 6;
  const park = new THREE.Mesh(new THREE.PlaneGeometry(LEVEL_END - ax0 + 40, 26), desert ? new THREE.MeshStandardMaterial({ color: 0xe2c995, roughness: 1 }) : toon(0x8fc062));
  park.rotation.x = -Math.PI / 2; park.position.set((ax0 + LEVEL_END + 40) / 2, .03, -3); park.receiveShadow = true; scene.add(park);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(LEVEL_END - ax0 + 120, 14), new THREE.MeshStandardMaterial({ color: desert ? 0x3fa7c9 : 0x4a90c8, roughness: .2, metalness: .1 }));
  river.rotation.x = -Math.PI / 2; river.position.set((ax0 + LEVEL_END) / 2 + 40, .04, -32); scene.add(river);
  // arena houses (these are the ones the beast destroys)
  for (let x = ARENA_X + 8; x < LEVEL_END - 6; x += 22) houses.push(houseFactory(x, -18, 0, 1, true));
  // bridge at the far end
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 70), toon(0xb0a89a)); bridge.position.set(LEVEL_END + 6, .6, -25); bridge.castShadow = true; scene.add(bridge);
  for (const z of [-60, -40, -20, 0, 10]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), toon(0x8d929c)); pl.position.set(LEVEL_END + 1.5, 1.5, z); scene.add(pl); }
  // arena lock wall (invisible, enabled when the boss fight starts)
  arenaGate = addCollider(ax0 - 1, 0, .5, 12); arenaGate.off = true;

  buildSetPieces(desert);
}

function buildCastle(x, z) {
  const castle = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d5a45, flatShading: true, roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c3128, flatShading: true, roughness: .9 });
  const island = new THREE.Mesh(new THREE.ConeGeometry(30, 34, 9), dark); island.rotation.x = Math.PI; island.position.y = -17; castle.add(island);
  castle.add(new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 4, 9), stone));
  for (const [tx, tz, r, h] of [[0, 0, 7, 40], [-12, 5, 4, 26], [12, 4, 4, 28], [-6, -12, 3.5, 22], [8, -11, 3.5, 24], [-18, -6, 3, 18], [18, -6, 3, 17], [0, 14, 4.5, 20]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 8), stone); t.position.set(tx, h / 2 + 2, tz); castle.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, h * .45, 8), dark); roof.position.set(tx, h + 2 + h * .22, tz); castle.add(roof);
  }
  castle.position.set(x, 95, z); scene.add(castle); floatingCastle = castle;
  for (let i = 0; i < 8; i++) { const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false })); c.position.set(x + rand(-35, 35), rand(60, 70), z + rand(-15, 15)); c.scale.set(45, 22, 1); scene.add(c); }
}

// =====================================================================
//  SET PIECES & EVENTS
// =====================================================================
let arenaGate = null;
const EV = {
  neighbor: { x: 34 }, girl: { x: 80 }, debris: { x: 100 }, vending: { x: 140 },
  shop: { x: 176 }, police: { x: 212 }, barricade: { x: 222 }, shrine: { x: 258 }, boss: { x: ARENA_X - 4 },
};
const crates = [];          // breakable debris blocking the road
let barricade = null;       // police barricade
const props = {};

function stripeTex() {
  return canvasTex(128, (g, s) => { for (let i = -4; i < 8; i++) { g.fillStyle = i % 2 ? '#ffd23a' : '#222'; g.beginPath(); g.moveTo(i * 24, 0); g.lineTo(i * 24 + 24, 0); g.lineTo(i * 24 + 24 + s, s); g.lineTo(i * 24 + s, s); g.fill(); } });
}

function buildSetPieces(desert) {
  // --- collapsed wall + debris crates (must be smashed to pass)
  const dx = EV.debris.x;
  const crateMats = [toon(0x9b7650), toon(0x8a8a8a), toon(0xb18a5c)];
  for (let i = 0; i < 6; i++) {
    const z = LANE_MIN_Z + 1.2 + i * ((LANE_MAX_Z - LANE_MIN_Z - 2.4) / 5);
    const s = rand(1.8, 2.4);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * rand(.8, 1.1), s), crateMats[i % 3]);
    m.position.set(dx + rand(-.6, .6), s / 2, z); m.rotation.y = rand(-.4, .4); m.castShadow = m.receiveShadow = true; scene.add(m);
    crates.push({ mesh: m, x: m.position.x, z, hp: 26, alive: true, col: addCollider(m.position.x, z, s / 2, s / 2) });
  }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(6, .5, 3), toon(0xa9adb6)); slab.position.set(dx + 2, .9, -7.5); slab.rotation.set(.3, .4, .5); slab.castShadow = true; scene.add(slab);

  // --- vending machine
  const vm = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1), toon(0xd8343b)); body.position.y = 1.1; vm.add(body);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ color: 0xdff6ff })); panel.position.set(0, 1.4, .51); vm.add(panel);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .25, 8), toon([0x3a7bd5, 0xf3a712, 0x2bb673, 0xe94e77][c])); b.position.set(-.38 + c * .25, 1.75 - r * .33, .55); vm.add(b); }
  vm.traverse(o => { if (o.isMesh) o.castShadow = true; });
  vm.position.set(EV.vending.x, 0, -7.6); scene.add(vm); addCollider(EV.vending.x, -7.6, .75, .55);

  // --- electronics shop with TV in the window
  const shop = new THREE.Group();
  const sb = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 6), toon(desert ? 0xd9bf8f : 0xe9e1cf)); sb.position.set(0, 3, -4); shop.add(sb);
  const awn = new THREE.Mesh(new THREE.BoxGeometry(12.4, .25, 2.2), toon(0x2f6fb5)); awn.position.set(0, 3.6, -.2); awn.rotation.x = .25; shop.add(awn);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(256, (g, s) => { g.fillStyle = '#16365e'; g.fillRect(0, 0, s, s); g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.textAlign = 'center'; g.fillText('電器行', s / 2, s * .62); }) }));
  sign.position.set(0, 5.2, -.98); shop.add(sign);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshStandardMaterial({ color: 0x7fb5d6, roughness: .1, metalness: .3 })); win.position.set(0, 1.7, -.98); shop.add(win);
  const tvScreen = new THREE.MeshBasicMaterial({ color: 0x2a3442 });
  const tv = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, .5), toon(0x222222)); tv.position.set(0, 1.5, -.6); shop.add(tv);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), tvScreen); scr.position.set(0, 1.5, -.34); shop.add(scr);
  shop.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  shop.position.set(EV.shop.x, 0, -8.6); scene.add(shop); props.tv = tvScreen;
  addCollider(EV.shop.x, -12.6, 6, 3);

  // --- police barricade (blocks road until you talk to the officer)
  const st = stripeTex(); st.wrapS = THREE.RepeatWrapping; st.repeat.set(4, 1);
  const bar = new THREE.Group();
  for (const y of [.7, 1.3]) { const b = new THREE.Mesh(new THREE.BoxGeometry(.25, .3, LANE_MAX_Z - LANE_MIN_Z + 1), new THREE.MeshToonMaterial({ map: st, gradientMap })); b.position.y = y; bar.add(b); }
  for (let z = LANE_MIN_Z; z <= LANE_MAX_Z; z += 3.5) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.15, 1.6, .15), toon(0xeeeeee)); leg.position.set(0, .8, z - (LANE_MIN_Z + LANE_MAX_Z) / 2); bar.add(leg); }
  const car = new THREE.Group();
  const cb = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 2), toon(0xf4f4f4)); cb.position.y = .8; car.add(cb);
  const ct = new THREE.Mesh(new THREE.BoxGeometry(2.4, .8, 1.8), toon(0x222833)); ct.position.y = 1.7; car.add(ct);
  const light = new THREE.Mesh(new THREE.BoxGeometry(.8, .2, .4), new THREE.MeshBasicMaterial({ color: 0xff3030 })); light.position.y = 2.2; car.add(light); props.siren = light;
  car.position.set(4, 0, -6.2); bar.add(car);
  bar.traverse(o => { if (o.isMesh) o.castShadow = true; });
  bar.position.set(EV.barricade.x, 0, (LANE_MIN_Z + LANE_MAX_Z) / 2); scene.add(bar);
  barricade = { group: bar, col: addCollider(EV.barricade.x, (LANE_MIN_Z + LANE_MAX_Z) / 2, .4, (LANE_MAX_Z - LANE_MIN_Z) / 2 + .5), open: false, t: 0 };
  addCollider(EV.barricade.x + 4, -6.2, 2.2, 1);

  // --- shrine (torii + small hall)
  const torii = new THREE.Group(), red = toon(0xd1382f), blk = toon(0x2b2b2b);
  for (const z of [-2.2, 2.2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, 5.2, 10), red); p.position.set(0, 2.6, z); torii.add(p); }
  const k1 = new THREE.Mesh(new THREE.BoxGeometry(.6, .45, 6.4), blk); k1.position.y = 5.35; torii.add(k1);
  const k2 = new THREE.Mesh(new THREE.BoxGeometry(.4, .3, 5.4), red); k2.position.y = 4.4; torii.add(k2);
  torii.rotation.y = Math.PI / 2; torii.position.set(EV.shrine.x, 0, -9.5); scene.add(torii);
  const hall = new THREE.Group();
  const hb = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), toon(0x9c6b3e)); hb.position.y = 2.2; hall.add(hb);
  const hr = new THREE.Mesh(new THREE.ConeGeometry(6, 2.6, 4), toon(0x3b4a5a)); hr.position.y = 5.2; hr.rotation.y = Math.PI / 4; hr.scale.set(1, 1, .75); hall.add(hr);
  const base = new THREE.Mesh(new THREE.BoxGeometry(8, .6, 6), toon(0xb8b2a6)); base.position.y = .3; hall.add(base);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(.35, 10, 8), toon(0xd6a83a)); bell.position.set(0, 3.2, 2.7); hall.add(bell);
  hall.traverse(o => { if (o.isMesh) o.castShadow = true; });
  hall.position.set(EV.shrine.x, 0, -16); scene.add(hall); addCollider(EV.shrine.x, -16, 4, 3.2);
  for (const sx of [-3.2, 3.2]) { const lan = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 2, 6), toon(0xb8b2a6)); lan.position.set(EV.shrine.x + sx, 1, -10.6); lan.castShadow = true; scene.add(lan); }

  // --- cat (hidden behind debris until freed)
  const cat = new THREE.Group(), cm = toon(0xf0a64a), cw = toon(0xfff3e0);
  const cbody = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .45, 4, 8), cm); cbody.rotation.z = Math.PI / 2; cbody.position.y = .3; cat.add(cbody);
  const chead = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), cm); chead.position.set(.38, .48, 0); cat.add(chead);
  for (const z of [-.1, .1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(.07, .15, 4), cm); e.position.set(.38, .69, z); cat.add(e); }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .5, 5), cw); tail.position.set(-.42, .5, 0); tail.rotation.z = -.6; cat.add(tail);
  cat.traverse(o => { if (o.isMesh) o.castShadow = true; });
  cat.position.set(EV.debris.x + 4, 0, -6.6); cat.rotation.y = Math.PI; scene.add(cat); props.cat = cat;
}

//  PARTICLES / FX
// =====================================================================
const particles = [];
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const debrisMats = [toon(0xe8dcc0), toon(0xc4483a), toon(0x8a8a8a), toon(0x6b5038)];
function spawnDebris(x, y, z, n, power = 8, size = .6) {
  for (let i = 0; i < n; i++) {
    if (particles.length > 450) return;
    const m = new THREE.Mesh(debrisGeo, debrisMats[(Math.random() * 4) | 0]);
    m.scale.setScalar(size * (.4 + Math.random())); m.position.set(x + (Math.random() - .5) * 4, y, z + (Math.random() - .5) * 4); m.castShadow = true;
    scene.add(m);
    particles.push({ o: m, kind: 'debris', v: new THREE.Vector3((Math.random() - .5) * power, Math.random() * power * 1.2, (Math.random() - .5) * power), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life: 2.5 + Math.random() * 1.5 });
  }
}
function spawnSprite(kind, x, y, z, opt = {}) {
  if (particles.length > 450) return;
  const add = kind === 'fire' || kind === 'flash' || kind === 'spark';
  const mat = new THREE.SpriteMaterial({ map: kind === 'smoke' ? puffTex : softTex, color: opt.color ?? (kind === 'smoke' ? 0x6b6b6b : 0xffa040), transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opt.opacity ?? 1 });
  const s = new THREE.Sprite(mat); s.position.set(x, y, z); const k = opt.size ?? 3; s.scale.set(k, k, 1); scene.add(s);
  particles.push({ o: s, kind, v: opt.v ?? new THREE.Vector3((Math.random() - .5), 1.5 + Math.random() * 2, (Math.random() - .5)), life: opt.life ?? 2, max: opt.life ?? 2, grow: opt.grow ?? 1.5, size: k, op: opt.opacity ?? 1 });
}
function explosion(x, y, z, big = 1) {
  spawnSprite('flash', x, y, z, { size: 9 * big, life: .25, v: new THREE.Vector3(), grow: 3, color: 0xffe0a0 });
  for (let i = 0; i < 6 * big; i++) spawnSprite('fire', x + (Math.random() - .5) * 3, y + Math.random() * 2, z + (Math.random() - .5) * 3, { size: 3 + Math.random() * 3, life: .6 + Math.random() * .4, v: new THREE.Vector3((Math.random() - .5) * 6, 3 + Math.random() * 4, (Math.random() - .5) * 6), grow: 1.5 });
  for (let i = 0; i < 5 * big; i++) spawnSprite('smoke', x + (Math.random() - .5) * 4, y + 1, z + (Math.random() - .5) * 4, { size: 4 + Math.random() * 3, life: 2 + Math.random(), v: new THREE.Vector3((Math.random() - .5) * 2, 2 + Math.random() * 2, (Math.random() - .5) * 2), grow: 2.2, opacity: .8 });
}
function hitSpark(p) {
  spawnSprite('flash', p.x, p.y, p.z, { size: 2.6, life: .16, v: new THREE.Vector3(), grow: 2.5, color: 0xfff2b0 });
  for (let i = 0; i < 5; i++) spawnSprite('spark', p.x, p.y, p.z, { size: .5, life: .35, v: new THREE.Vector3((Math.random() - .5) * 10, Math.random() * 7, (Math.random() - .5) * 10), grow: .2, color: 0xffd060 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt;
    if (p.kind === 'debris') {
      p.v.y -= 22 * dt; p.o.position.addScaledVector(p.v, dt); p.o.rotation.x += p.r.x * dt; p.o.rotation.y += p.r.y * dt;
      if (p.o.position.y < p.o.scale.y / 2) { p.o.position.y = p.o.scale.y / 2; p.v.y *= -.3; p.v.x *= .6; p.v.z *= .6; p.r.multiplyScalar(.6); }
      if (p.life < .5) p.o.scale.multiplyScalar(1 - dt * 3);
    } else {
      p.o.position.addScaledVector(p.v, dt);
      const t = 1 - p.life / p.max; const k = p.size * (1 + t * p.grow); p.o.scale.set(k, k, 1);
      p.o.material.opacity = p.op * Math.max(0, p.kind === 'smoke' ? Math.min(1, t * 4) * (1 - t) : 1 - t);
      if (p.kind === 'smoke') p.v.multiplyScalar(1 - dt * .4);
    }
    if (p.life <= 0) { scene.remove(p.o); p.o.material !== debrisMats[0] && p.kind !== 'debris' && p.o.material.dispose(); particles.splice(i, 1); }
  }
}
const fxLight = new THREE.PointLight(0xff9a40, 0, 40, 1.6); scene.add(fxLight);

// floating damage numbers
const dmgLayer = document.getElementById('dmgLayer');
const _v = new THREE.Vector3();
function dmgText(pos, text, cls = '') {
  _v.copy(pos).project(camera); if (_v.z > 1) return;
  const el = document.createElement('div'); el.className = 'dmg ' + cls; el.textContent = text;
  el.style.left = ((_v.x * .5 + .5) * innerWidth + (Math.random() - .5) * 30) + 'px';
  el.style.top = ((-_v.y * .5 + .5) * innerHeight) + 'px';
  dmgLayer.appendChild(el); setTimeout(() => el.remove(), 900);
}

let shake = 0;
function addShake(a) { shake = Math.min(1.6, shake + a); }

// =====================================================================
//  MODEL HELPERS
// =====================================================================
function prepModel(gltf, height, clone = true) {
  const root = clone ? SkeletonUtils.clone(gltf.scene) : gltf.scene;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const s = height / (box.max.y - box.min.y);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.y -= box.min.y;
  root.position.x -= (box.min.x + box.max.x) / 2;
  root.position.z -= (box.min.z + box.max.z) / 2;
  const wrap = new THREE.Group(); wrap.add(root);
  return wrap;
}
// remove horizontal root motion so animations play in place
function fixClips(clips, obj) {
  let sk; obj.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; });
  const rootNames = new Set(sk ? sk.skeleton.bones.slice(0, 2).map(b => b.name) : []);
  return clips.map(c0 => {
    const c = c0.clone(); c.name = c.name.replace(/\.\d+$/, '');
    for (const t of c.tracks) {
      const p = THREE.PropertyBinding.parseTrackName(t.name);
      if (p.propertyName === 'position' && rootNames.has(p.nodeName)) {
        const v = t.values, x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
    return c;
  });
}
const LABELS = {
  idle: '待機', walk: '走路', run: '奔跑', jump: '跳躍', jump_down: '跳下', dive: '飛撲', flip: '翻轉', sit: '坐下', swim: '游泳',
  box_01: '拳擊 1', box_02: '拳擊 2', box_03: '拳擊 3', front_kick_01: '前踢 1', front_kick_02: '前踢 2', scratch: '抓', flee_01: '逃跑 1', flee_02: '逃跑 2',
  play_video_game: '打電動', run_upstairs: '上樓梯', basketball_shot: '投籃', defeat_03: '倒下', swagger: '得意', bow: '鞠躬', turn: '轉身',
  hit_to_body_01: '受擊', 'press-up': '伏地挺身',
};
const label = n => LABELS[n] || n;
function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

function resolveCollision(pos, r) {
  for (const c of colliders) {
    if (c.off || (c.house && !c.house.alive)) continue;
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX)), cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
      else { // inside: push out shortest axis
        const opts = [[c.minX - r - pos.x, 0], [c.maxX + r - pos.x, 0], [0, c.minZ - r - pos.z], [0, c.maxZ + r - pos.z]];
        opts.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); pos.x += opts[0][0]; pos.z += opts[0][1];
      }
    }
  }
  pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.x));
  pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z));
}

// =====================================================================
//  ANIMATED ACTOR BASE
// =====================================================================
class Actor {
  constructor(gltf, height) {
    this.obj = prepModel(gltf, height);
    scene.add(this.obj);
    this.pos = this.obj.position;
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.clips = fixClips(gltf.animations, this.obj);
    this.actions = {};
    for (const c of this.clips) this.actions[c.name] = this.mixer.clipAction(c);
    this.cur = null; this.curName = '';
    this.facing = 0;
    this.mats = [];
    this.obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.emissive) this.mats.push(m); }); });
    this.flash = 0;
  }
  has(n) { return !!this.find(n); }
  find(n) { return this.actions[n] ? n : Object.keys(this.actions).find(k => k.startsWith(n)); }
  dur(n) { const k = this.find(n); return k ? this.actions[k].getClip().duration : 1; }
  play(name, { once = false, fade = .18, speed = 1, force = false } = {}) {
    const k = this.find(name); if (!k) return 0;
    const a = this.actions[k];
    if (this.cur === a && !once && !force) { a.timeScale = speed; return a.getClip().duration; }
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.timeScale = speed; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false);
    a.play(); this.cur = a; this.curName = k;
    return a.getClip().duration / speed;
  }
  tickFlash(dt, color) {
    if (this.flash > 0) {
      this.flash -= dt; const k = Math.max(0, this.flash) * 3;
      for (const m of this.mats) m.emissive.setRGB(color[0] * k, color[1] * k, color[2] * k);
    }
  }
}

// =====================================================================
// =====================================================================
//  HERO
// =====================================================================
class Hero extends Actor {
  constructor(def, gltf) {
    super(gltf, HERO_H);
    this.def = def; this.hp = this.maxHp = def.hp; this.atkMul = 1;
    this.vy = 0; this.grounded = true; this.kb = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.act = null; this.inv = 0; this.dead = false; this.aiAtk = 0;
    this.comboList = ['box_01', 'box_02', 'box_03', 'front_kick_02', 'front_kick_01'].filter(n => this.has(n)).slice(0, 4);
    this.emoteNames = Object.keys(this.actions).sort();
    this.rollAnim = this.has('dive') ? 'dive' : 'flip';
    this.facing = Math.PI / 2;
    this.play('idle');
  }
  get alive() { return !this.dead; }
  startAct(type, anim, d, extra = {}) { this.act = { type, anim, t: 0, d, ...extra }; }
  tryAttack() {
    if (this.dead || !this.grounded) return;
    if (this.act?.type === 'attack') { if (this.act.t > this.act.d * .35) this.act.queued = true; return; }
    if (this.act && this.act.type !== 'emote') return;
    this.doAttack(0);
  }
  doAttack(i) {
    const anim = this.comboList[i % this.comboList.length];
    const d = Math.min(this.play(anim, { once: true, speed: 1.35, fade: .08 }), 1.1);
    this.startAct('attack', anim, d, { idx: i, hitT: d * .42, hit: false, queued: false });
    // auto-aim: nearest target in front-ish range (monster or crate)
    const t = nearestTarget(this, 6);
    if (t) this.facing = Math.atan2(t.x - this.pos.x, t.z - this.pos.z);
    if (this === active) sfx('whoosh', .7);
  }
  tryRoll(dir) {
    if (this.dead || !this.grounded || this.act?.type === 'roll' || this.act?.type === 'hurt') return;
    let dx = dir.x, dz = dir.z;
    if (Math.hypot(dx, dz) < .1) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    this.facing = Math.atan2(dx, dz);
    this.play(this.rollAnim, { once: true, speed: this.dur(this.rollAnim) / .7, fade: .06 });
    this.startAct('roll', this.rollAnim, .7, { dx, dz });
    if (this === active) sfx('whoosh', 1);
  }
  tryJump() {
    if (this.dead || !this.grounded || (this.act && this.act.type !== 'emote')) return;
    this.act = null; this.vy = 8.2; this.grounded = false;
    this.play('jump', { once: true, speed: this.dur('jump') / 1.0, fade: .08 });
  }
  tryEmote(i) {
    if (this.dead || !this.grounded || (this.act && this.act.type !== 'emote')) return;
    const n = this.emoteNames[i]; if (!n) return;
    const d = this.play(n, { once: true, fade: .2 });
    this.startAct('emote', n, d);
    showBanner(label(n), 900, true);
  }
  hurt(amount, fromX, fromZ, power = 8) {
    if (this.dead) return;
    if (this.act?.type === 'roll') { dmgText(this.pos.clone().setY(2.2), 'MISS', 'miss'); return; }
    if (this.inv > 0) return;
    this.hp = Math.max(0, this.hp - amount); this.inv = .7; this.flash = .3;
    const dx = this.pos.x - fromX, dz = this.pos.z - fromZ, l = Math.hypot(dx, dz) || 1;
    this.kb.set(dx / l * power, 0, dz / l * power);
    dmgText(this.pos.clone().setY(2.2), '-' + Math.round(amount), 'hurt');
    if (this === active) addShake(.5);
    if (this.hp <= 0) return this.die();
    if (this.has('hit_to_body')) { const d = this.play('hit_to_body', { once: true, speed: 1.4, fade: .06 }); this.startAct('hurt', 'hit', Math.min(d, .6)); }
    else this.startAct('hurt', null, .35);
  }
  die() {
    this.dead = true; this.act = null;
    if (this.has('defeat')) this.play('defeat', { once: true }); else this.play(this.rollAnim, { once: true, speed: .8 });
    onHeroDown(this);
  }
  applyHit() {
    const base = [9, 10, 14, 22][this.act.idx % 4];
    const dmg = Math.round(base * this.def.dmg * this.atkMul * (.9 + Math.random() * .2));
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    // crates
    for (const c of crates) if (c.alive) {
      const dx = c.x - this.pos.x, dz = c.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 3.6 && (fx * dx + fz * dz) / (d || 1) > -.1) hitCrate(c, dmg);
    }
    const m = monster; if (!m || !m.alive || !m.engaged) return;
    const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const reach = m.radius + 2.3 + (this.act.anim.includes('kick') ? .6 : 0);
    if (d > reach) return;
    if ((fx * dx + fz * dz) / (d || 1) < .2 && d > m.radius) return;
    const hp = new THREE.Vector3(this.pos.x + dx / d * (d - m.radius * .7), 1.5 + Math.random() * 2.5, this.pos.z + dz / d * (d - m.radius * .7));
    m.damage(dmg, this, hp);
  }
  update(dt, inp) {
    this.inv = Math.max(0, this.inv - dt);
    this.tickFlash(dt, [1, .2, .2]);
    if (!this.grounded) { this.vy -= 22 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= 0) { this.pos.y = 0; this.vy = 0; this.grounded = true; } }
    this.kb.multiplyScalar(Math.exp(-6 * dt));
    if (this.dead) { this.pos.addScaledVector(this.kb, dt); this.mixer.update(dt); return; }
    if (inp.attack) this.tryAttack();
    if (inp.roll) this.tryRoll(inp);
    if (inp.jump) this.tryJump();
    if (inp.emote != null) this.tryEmote(inp.emote);

    const mv = Math.min(1, Math.hypot(inp.x, inp.z));
    this.vel.set(0, 0, 0);
    const a = this.act;
    if (a) {
      a.t += dt;
      if (a.type === 'attack') {
        if (a.t < a.d * .35) this.vel.set(Math.sin(this.facing) * 1.6, 0, Math.cos(this.facing) * 1.6);
        if (!a.hit && a.t >= a.hitT) { a.hit = true; this.applyHit(); }
        if (a.queued && a.t >= a.d * .7) this.doAttack(a.idx + 1);
        else if (a.t >= a.d) this.act = null;
        else if (mv > .2 && a.t > a.hitT + .12) this.act = null;
      } else if (a.type === 'roll') {
        const sp = 12 * (1 - (a.t / a.d) * .6); this.vel.set(a.dx * sp, 0, a.dz * sp);
        if (a.t >= a.d) this.act = null;
      } else if (a.type === 'emote') { if (mv > .2 || a.t >= a.d) this.act = null; }
      else if (a.type === 'hurt') { if (a.t >= a.d) this.act = null; }
    }
    if (!this.act) {
      if (mv > .05) {
        const run = inp.run;
        const sp = (run ? 9.5 : 4.6) * this.def.speed * (run ? 1 : Math.max(.5, mv));
        this.vel.set(inp.x / (mv || 1) * sp, 0, inp.z / (mv || 1) * sp);
        this.facing = angLerp(this.facing, Math.atan2(inp.x, inp.z), 1 - Math.exp(-14 * dt));
        if (this.grounded && !(this.curName.startsWith('jump') && this.vy !== 0)) this.play(run ? 'run' : 'walk', { speed: run ? 1.05 : .95 * Math.max(.6, mv) });
      } else if (this.grounded) this.play('idle');
    }
    if (this.grounded && this.curName.startsWith('jump') && !this.act) this.play(mv > .05 ? (inp.run ? 'run' : 'walk') : 'idle', { fade: .12 });
    this.pos.x += (this.vel.x + this.kb.x) * dt;
    this.pos.z += (this.vel.z + this.kb.z) * dt;
    resolveCollision(this.pos, .45);
    if (monster && monster.engaged && monster.alive) {
      const dx = this.pos.x - monster.pos.x, dz = this.pos.z - monster.pos.z, d = Math.hypot(dx, dz), r = monster.radius * .85;
      if (d < r && d > 0) { this.pos.x = monster.pos.x + dx / d * r; this.pos.z = monster.pos.z + dz / d * r; resolveCollision(this.pos, .45); }
    }
    this.obj.rotation.y = this.facing;
    this.mixer.update(dt);
  }
}
function nearestTarget(h, range) {
  let best = null, bd = range;
  for (const c of crates) if (c.alive) { const d = Math.hypot(c.x - h.pos.x, c.z - h.pos.z); if (d < bd) { bd = d; best = c; } }
  if (monster?.engaged && monster.alive) { const d = Math.hypot(monster.pos.x - h.pos.x, monster.pos.z - h.pos.z) - monster.radius; if (d < bd) best = monster.pos; }
  return best;
}
function hitCrate(c, dmg) {
  c.hp -= dmg; const p = c.mesh.position.clone(); p.y += .6;
  hitSpark(p); dmgText(p, dmg); sfx('hit', .7);
  c.mesh.rotation.y += rand(-.15, .15);
  if (c.hp <= 0) {
    c.alive = false; c.col.off = true; scene.remove(c.mesh);
    spawnDebris(c.x, 1, c.z, 9, 6, .45); sfx('crash', .5);
    if (crates.every(k => !k.alive)) story.onDebrisCleared();
  }
}

// =====================================================================
//  NPC (townsfolk built from the People model, tinted)
// =====================================================================
class NPC {
  constructor(gltf, { x, z, name, tint = 0xffffff, scale = 1, anim = 'idle', face = 0 }) {
    this.obj = prepModel(gltf, HERO_H * scale);
    this.obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiply(new THREE.Color(tint)); } });
    this.obj.position.set(x, 0, z); this.obj.rotation.y = face; scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.clips = fixClips(gltf.animations, this.obj);
    this.name = name; this.baseFace = face; this.face = face; this.anim = null;
    this.setAnim(anim);
    addCollider(x, z, .35, .35);
  }
  get pos() { return this.obj.position; }
  setAnim(n, once = false) {
    const c = this.clips.find(k => k.name.startsWith(n)) || this.clips.find(k => k.name.startsWith('idle'));
    const a = this.mixer.clipAction(c); a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (this.anim && this.anim !== a) a.crossFadeFrom(this.anim, .25, false);
    a.play(); this.anim = a;
  }
  update(dt) {
    const d = active ? Math.hypot(active.pos.x - this.pos.x, active.pos.z - this.pos.z) : 99;
    const want = d < 6 ? Math.atan2(active.pos.x - this.pos.x, active.pos.z - this.pos.z) : this.baseFace;
    this.face = angLerp(this.face, want, 1 - Math.exp(-4 * dt)); this.obj.rotation.y = this.face;
    this.mixer.update(dt);
  }
}

// =====================================================================
//  MONSTER (boss at the end of the road)
// =====================================================================
class Monster extends Actor {
  constructor(gltf) {
    super(gltf, MONSTER_H);
    this.radius = 6.2; this.hp = this.maxHp = MONSTER_HP; this.alive = true; this.engaged = false;
    this.state = 'hidden'; this.t = 0; this.beamCd = 7; this.poise = 0; this.aggro = 0; this.aggroHero = null;
    this.target = null; this.retarget = 0; this.stepT = 0;
    this.obj.traverse(o => { if (o.isBone && !this.head && /head/i.test(o.name) && !/end|top/i.test(o.name)) this.head = o; });
    this.attacks = ['box_01', 'box_02', 'box_03', 'front_kick_02'].filter(n => this.has(n));
    this.play('idle'); this.obj.visible = false;
    const bg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, .5);
    this.beamOuter = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamInner = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamOuter.visible = this.beamInner.visible = false; scene.add(this.beamOuter, this.beamInner);
    this.aim = new THREE.Vector3(); this.beamHit = new Set(); this.goal = new THREE.Vector3();
  }
  mouth() {
    const p = new THREE.Vector3();
    if (this.head) this.head.getWorldPosition(p); else p.set(this.pos.x, MONSTER_H * .8, this.pos.z);
    p.x += Math.sin(this.facing) * 2.2; p.z += Math.cos(this.facing) * 2.2; return p;
  }
  setState(s) { this.state = s; this.t = 0; }
  damage(n, hero, at) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n); this.flash = .25; this.poise += n; this.aggro = 8; this.aggroHero = hero;
    hitSpark(at); dmgText(at, n); sfx('hit', .9); if (hero === active) addShake(.12);
    if (this.hp <= 0) return this.die();
    if (this.poise > 140 && ['walk', 'attack'].includes(this.state)) {
      this.poise = 0;
      const n2 = ['hit_to_body', 'hit_to_head', 'hit_to_side'].find(k => this.has(k));
      const d = n2 ? this.play(n2, { once: true, fade: .1 }) : 1; this.setState('stagger'); this.stagD = Math.min(d, 1.6);
      showBanner('巨獸硬直！', 900);
    }
  }
  die() {
    this.alive = false; this.setState('dead'); this.beamOuter.visible = this.beamInner.visible = false; fxLight.intensity = 0;
    this.play(this.has('hit_to_body_02') ? 'hit_to_body_02' : 'idle', { once: true });
    sfx('roar', 1.2); addShake(1.2);
    onMonsterDead();
  }
  // silhouette shown far in the background during the story
  appearFar() { this.obj.visible = true; this.pos.set(EV.boss.x + 60, 0, -95); this.facing = -.4; this.setState('far'); }
  enterArena() { this.obj.visible = true; this.pos.set(341, 0, -42); this.goal.set(341, 0, -6); this.setState('enter'); }
  pickTarget() {
    const heroes = allHeroes.filter(h => h.alive);
    let near = null, nd = 1e9;
    for (const h of heroes) { const d = Math.hypot(h.pos.x - this.pos.x, h.pos.z - this.pos.z); if (d < nd) { nd = d; near = h; } }
    if (this.aggro > 0 && this.aggroHero?.alive) return { hero: this.aggroHero };
    if (near && nd < 18) return { hero: near };
    let best = null, bd = 1e9;
    for (const h of houses) if (h.alive) { const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z); if (d < bd) { bd = d; best = h; } }
    if (best && Math.random() < .6) return { house: best };
    return near ? { hero: near } : best ? { house: best } : null;
  }
  tpos() { const t = this.target; return t?.hero ? t.hero.pos : t?.house ? new THREE.Vector3(t.house.x, 0, t.house.z) : this.pos; }
  faceTo(p, dt, rate = 2.5) { this.facing = angLerp(this.facing, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 1 - Math.exp(-rate * dt)); }
  clampArena() { this.pos.x = Math.max(ARENA_X + 2, Math.min(LEVEL_END - 6, this.pos.x)); this.pos.z = Math.max(-16, Math.min(2, this.pos.z)); }
  step(dt) {
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = .62; const d = Math.hypot(active.pos.x - this.pos.x, active.pos.z - this.pos.z);
      if (d < 50) { addShake(.2 * (1 - d / 50)); sfx('boom', .25 * (1 - d / 50)); }
      spawnSprite('smoke', this.pos.x + rand(-2, 2), .4, this.pos.z + rand(-2, 2), { size: 3, life: 1.2, grow: 1.5, opacity: .45, color: 0xb0a490 });
    }
  }
  meleeImpact() {
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const ap = new THREE.Vector3(this.pos.x + fx * (this.radius + 3), 0, this.pos.z + fz * (this.radius + 3));
    for (const h of houses) if (h.alive) {
      const cx = Math.max(h.col.minX, Math.min(ap.x, h.col.maxX)), cz = Math.max(h.col.minZ, Math.min(ap.z, h.col.maxZ));
      if (Math.hypot(ap.x - cx, ap.z - cz) < 5) damageHouse(h, 38);
    }
    for (const h of allHeroes) if (h.alive && Math.hypot(h.pos.x - ap.x, h.pos.z - ap.z) < 6.5 && h.pos.y < 4) h.hurt(16 + Math.random() * 6, this.pos.x, this.pos.z, 13);
    spawnDebris(ap.x, 1, ap.z, 6, 7, .5);
    for (let i = 0; i < 4; i++) spawnSprite('smoke', ap.x + rand(-2.5, 2.5), .5, ap.z + rand(-2.5, 2.5), { size: 4, life: 1.6, grow: 2, opacity: .6, color: 0xa89a88 });
    const d = Math.hypot(active.pos.x - ap.x, active.pos.z - ap.z); addShake(Math.max(0, .9 - d / 40)); sfx('boom', Math.max(.2, 1 - d / 60));
  }
  update(dt) {
    this.tickFlash(dt, [1, .35, .1]);
    this.mixer.update(dt);
    this.obj.rotation.y = this.facing;
    if (this.state === 'hidden') return;
    if (!this.alive) {
      this.t += dt;
      if (this.t > 1.2) { this.obj.rotation.z = Math.min(Math.PI / 2.2, (this.t - 1.2) * .9); this.pos.y = -Math.min(4, (this.t - 1.2) * 1.2); }
      if (this.t < 4 && Math.random() < .3) explosion(this.pos.x + rand(-4, 4), 2 + Math.random() * 10, this.pos.z + rand(-4, 4), .5);
      return;
    }
    this.t += dt;
    if (this.state === 'far') { this.play('idle'); return; }
    if (this.state === 'enter') {
      this.play('run', { speed: .55 }); this.faceTo(this.goal, dt, 3);
      const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      this.pos.x += Math.sin(this.facing) * 9 * dt; this.pos.z += Math.cos(this.facing) * 9 * dt; this.step(dt);
      if (d < 1.5) { this.setState('roar'); }
      return;
    }
    if (this.state === 'roar') {
      if (this.t < .05) { this.play(this.has('angry') ? 'angry' : 'idle', { once: true }); sfx('roar', 1.3); addShake(1); }
      this.faceTo(active.pos, dt, 2);
      if (this.t > Math.min(this.dur('angry'), 3)) { this.setState('idle'); story.onBossArrived(); }
      return;
    }
    if (this.state === 'idle') { this.play('idle'); return; }
    if (!this.engaged) return;

    this.beamCd -= dt; this.aggro -= dt; this.retarget -= dt;
    if (this.retarget <= 0 && this.state === 'walk') { this.target = this.pickTarget(); this.retarget = 1.2; }
    const tp = this.tpos();
    const dist = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);
    switch (this.state) {
      case 'walk': {
        if (!this.target) { this.play('idle'); break; }
        this.faceTo(tp, dt, 2);
        const reach = this.target.house ? this.radius + Math.max(this.target.house.hx, this.target.house.hz) + 1 : this.radius + 3.5;
        if (this.beamCd <= 0 && dist > 14 && dist < 75) { this.setState('charge'); break; }
        if (dist <= reach) { this.setState('attack'); break; }
        this.play('run', { speed: .55 });
        this.pos.x += Math.sin(this.facing) * 4.2 * dt; this.pos.z += Math.cos(this.facing) * 4.2 * dt; this.clampArena();
        for (const h of houses) if (h.alive && Math.abs(h.x - this.pos.x) < h.hx + this.radius * .6 && Math.abs(h.z - this.pos.z) < h.hz + this.radius * .6) damageHouse(h, 30 * dt, true);
        this.step(dt);
        break;
      }
      case 'attack':
        if (this.t < .05) { this.atkD = this.play(this.attacks[(Math.random() * this.attacks.length) | 0], { once: true, fade: .15 }); this.atkHit = false; }
        if (this.t < this.atkD * .35) this.faceTo(tp, dt, 3);
        if (!this.atkHit && this.t > this.atkD * .48) { this.atkHit = true; this.meleeImpact(); }
        if (this.t >= this.atkD) { this.setState('walk'); this.retarget = 0; }
        break;
      case 'stagger': if (this.t >= this.stagD) this.setState('walk'); break;
      case 'charge':
        if (this.t < .05) {
          this.play(this.has('angry') ? 'angry' : 'idle', { once: true, speed: 1.3 }); sfx('roar', .9);
          this.aim.copy(tp).setY(this.target?.house ? 3 : .8); showBanner('⚠ 能量光束！快閃開！', 1300);
        }
        this.faceTo(tp, dt, 3);
        this.aim.lerp(new THREE.Vector3(tp.x, this.target?.house ? 3 : .8, tp.z), 1 - Math.exp(-2 * dt));
        if (this.t > 1.3) { this.setState('beam'); this.beamHit.clear(); sfx('beam', 1.2); }
        break;
      case 'beam': {
        const goal = new THREE.Vector3(tp.x, this.target?.house ? 3 : .8, tp.z);
        const dir = goal.sub(this.aim); const l = dir.length(); if (l > .01) this.aim.addScaledVector(dir, Math.min(1, 5.5 * dt / l));
        this.faceTo(this.aim, dt, 2);
        const m = this.mouth(), len = m.distanceTo(this.aim), pulse = 1 + Math.sin(this.t * 40) * .12;
        for (const [b, r] of [[this.beamOuter, 1.25], [this.beamInner, .5]]) { b.visible = true; b.position.copy(m); b.lookAt(this.aim); b.scale.set(r * pulse, r * pulse, len); }
        fxLight.position.copy(this.aim).setY(2); fxLight.intensity = 60 + Math.random() * 30;
        if (Math.random() < .5) explosion(this.aim.x, Math.max(.5, this.aim.y - 2), this.aim.z, .4);
        addShake(dt * 2.2);
        for (const h of allHeroes) if (h.alive && !this.beamHit.has(h) && Math.hypot(h.pos.x - this.aim.x, h.pos.z - this.aim.z) < 2.8 && h.pos.y < 3) {
          this.beamHit.add(h);
          if (h.act?.type === 'roll') { dmgText(h.pos.clone().setY(2.2), 'MISS', 'miss'); continue; }
          h.hurt(28, this.aim.x - .01, this.aim.z - .01, 14);
        }
        for (const h of houses) if (h.alive && Math.hypot(h.x - this.aim.x, h.z - this.aim.z) < 7.5) damageHouse(h, 60 * dt, true);
        if (this.t > 1.8) {
          this.beamOuter.visible = this.beamInner.visible = false; fxLight.intensity = 0;
          explosion(this.aim.x, 1, this.aim.z, 1.2); sfx('boom', 1);
          this.beamCd = 8 + Math.random() * 4; this.setState('walk'); this.retarget = 0;
        }
        break;
      }
    }
  }
}

// houses damage / collapse
function damageHouse(h, amt, quiet = false) {
  if (!h.alive) return;
  h.hp -= amt; h.shake = .35;
  if (!quiet && Math.random() < .9) spawnDebris(h.x, h.h * .6, h.z, 5, 7, .55);
  if (Math.random() < (quiet ? .05 : .6)) spawnSprite('smoke', h.x + (Math.random() - .5) * 8, h.h * .5, h.z + (Math.random() - .5) * 8, { size: 4, life: 2, grow: 2, opacity: .7, color: 0x9a9088 });
  if (h.hp <= 0) collapseHouse(h);
}
function collapseHouse(h) {
  h.alive = false; h.collapse = 0; h.emit = 25;
  spawnDebris(h.x, h.h * .5, h.z, 26, 11, .8);
  explosion(h.x, 2, h.z, 1.4);
  for (let i = 0; i < 10; i++) spawnSprite('smoke', h.x + (Math.random() - .5) * 12, 1 + Math.random() * 4, h.z + (Math.random() - .5) * 12, { size: 6 + Math.random() * 4, life: 3 + Math.random() * 2, grow: 2.2, opacity: .85, color: 0x8f877f });
  const d = Math.hypot(active.pos.x - h.x, active.pos.z - h.z); addShake(Math.max(.1, 1 - d / 60)); sfx('crash', Math.max(.25, 1 - d / 70));
  // rubble pile
  const g = new THREE.Group(); g.position.set(h.x, 0, h.z);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(debrisGeo, debrisMats[(Math.random() * 4) | 0]);
    m.scale.set(1 + Math.random() * 3, .5 + Math.random() * 1.6, 1 + Math.random() * 3);
    m.position.set((Math.random() - .5) * h.hx * 1.6, m.scale.y / 2 * .8, (Math.random() - .5) * h.hz * 1.6);
    m.rotation.set((Math.random() - .5) * .6, Math.random() * 3, (Math.random() - .5) * .6); m.castShadow = m.receiveShadow = true; g.add(m);
  }
  const roof = new THREE.Mesh(debrisGeo, debrisMats[1]); roof.scale.set(h.hx * 1.4, .35, h.hz * .9); roof.position.set(0, 1.8, 0); roof.rotation.set(.35, .3, .2); roof.castShadow = true; g.add(roof);
  g.visible = false; h.rubble = g; rubbleGroup.add(g);
  updateCity();
}
function updateHouses(dt) {
  for (const h of houses) {
    if (h.shake > 0 && h.alive) { h.shake -= dt; h.model.position.x += (Math.random() - .5) * .25 * (h.shake > 0 ? 1 : 0); }
    if (h.collapse >= 0) {
      h.collapse += dt; const t = Math.min(1, h.collapse / 1.4);
      h.group.scale.y = 1 - t * .85; h.group.rotation.z = t * .12; h.group.position.y = -t * .5;
      if (t >= 1 && h.group.visible) { h.group.visible = false; h.rubble.visible = true; }
      if (h.collapse > .5 && h.rubble) h.rubble.visible = true;
    }
    if (!h.alive && h.emit > 0) {
      h.emit -= dt;
      if (Math.random() < dt * 5) spawnSprite('smoke', h.x + (Math.random() - .5) * 6, 2, h.z + (Math.random() - .5) * 6, { size: 4 + Math.random() * 2, life: 3.5, grow: 2.5, opacity: .55, color: 0x5d5853, v: new THREE.Vector3(.6, 2.2, .3) });
      if (Math.random() < dt * 8) spawnSprite('fire', h.x + (Math.random() - .5) * 8, .8, h.z + (Math.random() - .5) * 8, { size: 1.6 + Math.random() * 1.6, life: .7, grow: .4, v: new THREE.Vector3(0, 2.5, 0) });
    }
  }
}

// =====================================================================
// =====================================================================
//  INPUT
// =====================================================================
const keys = new Set(), pressed = new Set();
let mouseAttack = false, attackHeld = false;
let camDist = 21;
addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft'].includes(e.code)) e.preventDefault();
  audio();
  if (!e.repeat) pressed.add(e.code); keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); attackHeld = false; });
const cv = renderer.domElement;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  audio();
  if (state === 'dialog') { advanceDialog(); return; }
  if (state !== 'play' || e.button !== 0) return;
  mouseAttack = true; attackHeld = true;
});
addEventListener('mouseup', e => { if (e.button === 0) attackHeld = false; });
cv.addEventListener('wheel', e => { camDist = Math.max(12, Math.min(32, camDist * (1 + Math.sign(e.deltaY) * .1))); }, { passive: true });

// --- touch
const touch = { x: 0, y: 0, joyId: null, run: false, edge: new Set(), attackHold: false };
const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob'), touchEl = document.getElementById('touch');
const JR = 55; let joyCx = 0, joyCy = 0;
touchEl.addEventListener('pointerdown', e => {
  if (e.target !== touchEl) return;
  audio();
  if (state === 'dialog') { advanceDialog(); return; }
  if (e.clientX < innerWidth * .55 && touch.joyId === null) {
    touch.joyId = e.pointerId; joyCx = e.clientX; joyCy = e.clientY;
    joy.style.left = joyCx + 'px'; joy.style.top = joyCy + 'px'; joy.classList.add('active');
    touchEl.setPointerCapture?.(e.pointerId);
  }
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerId !== touch.joyId) return;
  let dx = e.clientX - joyCx, dy = e.clientY - joyCy; const l = Math.hypot(dx, dy);
  if (l > JR) { dx *= JR / l; dy *= JR / l; }
  knob.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / JR; touch.y = dy / JR;
});
const endTouch = e => {
  if (e.pointerId !== touch.joyId) return;
  touch.joyId = null; touch.x = touch.y = 0; knob.style.transform = ''; joy.classList.remove('active'); joy.style.left = ''; joy.style.top = '';
};
touchEl.addEventListener('pointerup', endTouch); touchEl.addEventListener('pointercancel', endTouch);
document.querySelectorAll('#btns button').forEach(b => {
  const k = b.dataset.b;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); audio();
    if (state === 'dialog') { advanceDialog(); return; }
    if (k === 'run') { touch.run = !touch.run; b.classList.toggle('on', touch.run); return; }
    if (k === 'emote') { const p = document.getElementById('emotes'); p.classList.toggle('open'); b.classList.toggle('on', p.classList.contains('open')); return; }
    if (k === 'attack') touch.attackHold = true;
    touch.edge.add(k);
  });
  const up = () => { if (k === 'attack') touch.attackHold = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});

// emote panel
let emPage = 0, pendingEmote = null;
const emList = document.getElementById('emList');
function renderEmotes() {
  if (!active) return;
  const names = active.emoteNames, pages = Math.ceil(names.length / 9);
  emPage = ((emPage % pages) + pages) % pages;
  document.getElementById('emPage').textContent = `${emPage + 1}/${pages}`;
  emList.innerHTML = '';
  names.slice(emPage * 9, emPage * 9 + 9).forEach((n, i) => {
    const li = document.createElement('li'); li.innerHTML = `<b>${i + 1}</b><span>${label(n)}</span>`;
    const b = document.createElement('button'); b.textContent = `${i + 1} ${label(n)}`;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); pendingEmote = emPage * 9 + i; });
    li.appendChild(b); emList.appendChild(li);
  });
}
document.getElementById('emNext').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); emPage++; renderEmotes(); });

function gatherInput() {
  const inp = { x: 0, z: 0, run: false, attack: false, jump: false, roll: false, emote: null };
  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
  if (touch.joyId !== null) { f = -touch.y; r = touch.x; }
  inp.x = r; inp.z = -f;   // fixed side camera: right = +X, up = into the screen (-Z)
  const l = Math.hypot(inp.x, inp.z); if (l > 1) { inp.x /= l; inp.z /= l; }
  inp.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run;
  inp.attack = mouseAttack || touch.edge.has('attack') || pressed.has('KeyJ');
  inp.jump = pressed.has('Space') || touch.edge.has('jump');
  inp.roll = pressed.has('ControlLeft') || pressed.has('ControlRight') || touch.edge.has('roll');
  for (let i = 1; i <= 9; i++) if (pressed.has('Digit' + i) || pressed.has('Numpad' + i)) inp.emote = emPage * 9 + i - 1;
  if (pendingEmote != null) { inp.emote = pendingEmote; pendingEmote = null; }
  if (pressed.has('Digit0') || pressed.has('Numpad0')) { emPage++; renderEmotes(); }
  if (pressed.has('Tab') || touch.edge.has('switch')) switchHero();
  if (pressed.has('KeyE') || pressed.has('Enter') || touch.edge.has('interact')) tryInteract();
  return inp;
}
let autoAtk = 0;
function clearEdges(dt) {
  pressed.clear(); touch.edge.clear(); mouseAttack = false;
  autoAtk -= dt;
  if ((attackHeld || touch.attackHold) && autoAtk <= 0) { mouseAttack = true; autoAtk = .18; }
}

// =====================================================================
//  COMPANION AI
// =====================================================================
const NOINP = { x: 0, z: 0 };
function aiInput(h, dt) {
  const inp = { x: 0, z: 0, run: false, attack: false, jump: false, roll: false, emote: null };
  const m = monster, fighting = m?.engaged && m.alive;
  const md = fighting ? Math.hypot(m.pos.x - h.pos.x, m.pos.z - h.pos.z) : 1e9;
  const pd = Math.hypot(active.pos.x - h.pos.x, active.pos.z - h.pos.z);
  h.aiAtk -= dt;
  if (fighting && m.state === 'beam' && Math.hypot(m.aim.x - h.pos.x, m.aim.z - h.pos.z) < 7 && Math.random() < .08) {
    inp.roll = true; inp.x = -(m.aim.x - h.pos.x); inp.z = -(m.aim.z - h.pos.z); return inp;
  }
  const crate = crates.find(c => c.alive && Math.hypot(c.x - h.pos.x, c.z - h.pos.z) < 5);
  if (crate && h.aiAtk <= 0) { h.facing = Math.atan2(crate.x - h.pos.x, crate.z - h.pos.z); inp.attack = true; h.aiAtk = .8; return inp; }
  if (md < 30) {
    if (md > m.radius + 1.8) { inp.x = m.pos.x - h.pos.x; inp.z = m.pos.z - h.pos.z; inp.run = md > 8; }
    else if (h.aiAtk <= 0) { h.facing = Math.atan2(m.pos.x - h.pos.x, m.pos.z - h.pos.z); inp.attack = true; h.aiAtk = .9; }
  } else if (pd > 3.5) {
    // follow slightly behind the player
    const tx = active.pos.x - Math.sign(Math.sin(active.facing) || 1) * 2.2, tz = active.pos.z + 1.6;
    inp.x = tx - h.pos.x; inp.z = tz - h.pos.z; inp.run = pd > 9;
  }
  const l = Math.hypot(inp.x, inp.z); if (l > 1) { inp.x /= l; inp.z /= l; }
  return inp;
}

// =====================================================================
//  DIALOGUE
// =====================================================================
const $ = id => document.getElementById(id);
const dlgEl = $('dialog'), dlgName = $('dlgName'), dlgText = $('dlgText'), dlgFace = $('dlgFace'), dlgChoices = $('dlgChoices'), dlgNext = $('dlgNext');
let dlg = null, stateBeforeDlg = 'play';
const SPEAKERS = {
  people: { name: 'People', hero: 'people' }, gundan: { name: 'Gundan', hero: 'gundan' },
  narr: { name: '', icon: '' }, tanaka: { name: '田中大叔', icon: '👨' }, girl: { name: '小美', icon: '👧' },
  cat: { name: '小橘', icon: '🐱' }, news: { name: '新聞主播', icon: '📺' }, police: { name: '警察 佐藤', icon: '👮' },
  shrine: { name: '神社', icon: '⛩' }, sys: { name: '系統', icon: '✨' },
};
function say(lines, onDone) {
  stateBeforeDlg = state === 'dialog' ? stateBeforeDlg : state;
  dlg = { lines, i: -1, onDone, shown: 0 };
  state = 'dialog'; dlgEl.classList.add('show'); document.body.classList.add('dlg'); attackHeld = false; touch.attackHold = false;
  nextLine();
}
function nextLine() {
  dlg.i++;
  if (dlg.i >= dlg.lines.length) return closeDialog();
  const L = dlg.lines[dlg.i];
  if (typeof L === 'function') { L(); return nextLine(); }
  const sp = SPEAKERS[L.who] || SPEAKERS.narr;
  dlgName.textContent = sp.name; dlgName.style.display = sp.name ? '' : 'none';
  dlgEl.classList.toggle('narr', L.who === 'narr');
  if (sp.hero) { dlgFace.innerHTML = `<img src="${portraits[sp.hero]}">`; dlgFace.style.display = ''; }
  else if (sp.icon) { dlgFace.textContent = sp.icon; dlgFace.style.display = ''; }
  else dlgFace.style.display = 'none';
  dlg.full = L.t; dlg.shown = 0; dlgText.textContent = '';
  dlgChoices.innerHTML = ''; dlgNext.style.display = 'none';
  if (L.fx) L.fx();
}
function finishTyping() { dlg.shown = dlg.full.length; dlgText.textContent = dlg.full; showChoices(); }
function showChoices() {
  const L = dlg.lines[dlg.i];
  if (L.choices && !dlgChoices.children.length) {
    L.choices.forEach((c, i) => {
      const b = document.createElement('button'); b.textContent = `${i + 1}. ${c.t}`;
      b.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); pickChoice(i); };
      dlgChoices.appendChild(b);
    });
  } else if (!L.choices) dlgNext.style.display = '';
}
function pickChoice(i) {
  const c = dlg.lines[dlg.i].choices[i]; if (!c) return;
  c.do?.();
  if (c.then) { dlg.lines = [...dlg.lines.slice(0, dlg.i + 1), ...c.then, ...dlg.lines.slice(dlg.i + 1)]; }
  nextLine();
}
function advanceDialog() {
  if (!dlg) return;
  if (dlg.shown < dlg.full.length) return finishTyping();
  if (dlg.lines[dlg.i].choices) return;
  nextLine();
}
function closeDialog() {
  const cb = dlg.onDone; dlg = null; dlgEl.classList.remove('show'); document.body.classList.remove('dlg');
  state = stateBeforeDlg === 'dialog' ? 'play' : stateBeforeDlg;
  pressed.clear(); clock.getDelta();
  cb?.();
}
dlgEl.addEventListener('pointerdown', e => { e.stopPropagation(); audio(); advanceDialog(); });
function tickDialog(dt) {
  if (!dlg) return;
  if (dlg.shown < dlg.full.length) {
    dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 42);
    dlgText.textContent = dlg.full.slice(0, dlg.shown | 0);
    if (dlg.shown >= dlg.full.length) showChoices();
  }
  if (pressed.has('KeyE') || pressed.has('Enter') || pressed.has('Space')) advanceDialog();
  const L = dlg.lines[dlg.i];
  if (L?.choices && dlg.shown >= dlg.full.length) for (let i = 1; i <= L.choices.length; i++) if (pressed.has('Digit' + i)) pickChoice(i - 1);
}

// =====================================================================
//  INTERACTABLES & STORY
// =====================================================================
const interactables = [];   // {x,z,r,verb,enabled,once,done,fn,marker}
const markerTex = canvasTex(64, (g, s) => {
  g.fillStyle = '#ffd54f'; g.beginPath(); g.arc(s / 2, s / 2, s * .42, 0, 7); g.fill(); g.lineWidth = 4; g.strokeStyle = '#7a4b00'; g.stroke();
  g.fillStyle = '#5a3200'; g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.fillText('!', s / 2, s * .68);
});
function addInteract(o) {
  const it = { r: 4.2, verb: '對話', enabled: true, once: true, done: false, h: 2.7, ...o };
  it.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTex, depthTest: false, transparent: true }));
  it.marker.scale.set(.8, .8, 1); it.marker.renderOrder = 10; scene.add(it.marker);
  interactables.push(it); return it;
}
const promptEl = $('prompt');
let nearInteract = null;
function updateInteractables(time) {
  nearInteract = null; let bd = 1e9;
  for (const it of interactables) {
    const vis = it.enabled && !it.done;
    it.marker.visible = vis;
    if (!vis) continue;
    const x = typeof it.x === 'function' ? it.x() : it.x, z = typeof it.z === 'function' ? it.z() : it.z;
    it.marker.position.set(x, it.h + .9 + Math.sin(time * 3 + x) * .15, z);
    const d = Math.hypot(active.pos.x - x, (active.pos.z - z) * .55);
    if (d < it.r && d < bd) { bd = d; nearInteract = it; }
  }
  const ib = document.querySelector('[data-b="interact"]');
  if (nearInteract && state === 'play') {
    const p = nearInteract.marker.position.clone(); p.y += .7; p.project(camera);
    promptEl.style.left = ((p.x * .5 + .5) * innerWidth) + 'px'; promptEl.style.top = ((-p.y * .5 + .5) * innerHeight) + 'px';
    promptEl.innerHTML = `<kbd>${IS_TOUCH ? '互動' : 'E'}</kbd> ${nearInteract.verb}`; promptEl.classList.add('show');
    ib?.classList.add('ready');
  } else { promptEl.classList.remove('show'); ib?.classList.remove('ready'); }
}
function tryInteract() {
  const it = nearInteract; if (!it || state !== 'play') return;
  if (it.once) it.done = true;
  it.fn(it);
}

const objectiveEl = $('objective');
function setObjective(t) { objectiveEl.innerHTML = `<b>目標</b>${t}`; objectiveEl.classList.remove('pulse'); void objectiveEl.offsetWidth; objectiveEl.classList.add('pulse'); }
const PLACE = MAP === 'desert' ? '沙丘鎮' : '青葉町';
const PARK = MAP === 'desert' ? '綠洲河畔' : '河岸公園';
const npcs = {};
const story = {
  flags: {},
  intro() {
    say([
      { who: 'narr', t: `${PLACE}，一個平凡的週六早晨。` },
      { who: 'narr', t: `昨天深夜，一道火光劃過天空，墜落在小鎮盡頭的${PARK}。` },
      { who: 'people', t: 'Gundan，你有感覺到嗎？從剛剛開始，地面就一直在微微震動。' },
      { who: 'gundan', t: `偵測到異常的巨大生命反應。方位：東方，${PARK}。距離約 300 公尺。` },
      { who: 'people', t: '走吧！去看看到底是什麼東西。' },
      { who: 'sys', t: '往右前進。看到頭上有「！」的人或物品，靠近後按 E（手機按「互動」）。' },
    ], () => setObjective(`沿著街道往東走，前往${PARK}`));
  },
  onDebrisCleared() {
    showBanner('道路打通了！', 1200);
    props.cat.visible = true;
    npcs.girl.setAnim('swagger');
    setObjective('瓦礫後面好像有東西在動…');
  },
  onBossArrived() {
    say([
      { who: 'gundan', t: '目標確認：外星巨獸。體長約 16 公尺，體內有高能量核心。' },
      { who: 'gundan', t: '警告：口部正在累積能量，光束發射前會先怒吼。' },
      { who: 'people', t: '牠打算把河岸的住宅全部踏平……絕對不能讓牠得逞！' },
      { who: 'sys', t: '左鍵連打攻擊，Ctrl 翻滾可以躲過光束；Tab 切換角色，夥伴會自動支援。' },
    ], () => {
      monster.engaged = true; monster.setState('walk'); monster.retarget = 0;
      $('boss').classList.add('show');
      showBanner('⚠ BOSS 戰：外星巨獸！', 2200);
      setObjective(`擊退外星巨獸，守護${PARK}的住宅！`);
      state = 'play';
    });
  },
};

function setupStory(peopleGltf) {
  const desert = MAP === 'desert';
  // --- 1. neighbour Tanaka
  npcs.tanaka = new NPC(peopleGltf, { x: EV.neighbor.x, z: -6.6, name: '田中大叔', tint: 0xd6e2ff, scale: 1.02, face: 0 });
  addInteract({
    x: EV.neighbor.x, z: -6.6, fn: () => say([
      { who: 'tanaka', t: '喔！是你們啊。昨晚那聲巨響把我家的窗戶都震破了！' },
      { who: 'tanaka', t: `電視說${PARK}那邊被封鎖了……你們該不會要過去吧？` },
      { who: 'people', t: '有什麼東西在那裡。我們得去確認。', choices: [
        { t: '「我們會小心的。」', then: [{ who: 'tanaka', t: '唉，年輕人就是這樣。好吧，這個你拿著。' }] },
        { t: '「放心，交給我們！」', then: [{ who: 'tanaka', t: '哈哈，真有精神！那這個就送給你們吧。' }] },
      ] },
      { who: 'sys', t: '獲得【神社御守】！兩位角色最大 HP +20，並完全回復。', fx: () => { allHeroes.forEach(h => { h.maxHp += 20; h.hp = h.maxHp; }); sfx('whoosh'); } },
      { who: 'tanaka', t: '路上小心啊！前面好像有圍牆倒塌了。' },
    ], () => setObjective('繼續往東走')),
  });

  // --- 2. crying girl + debris + cat
  npcs.girl = new NPC(peopleGltf, { x: EV.girl.x, z: -6.4, name: '小美', tint: 0xffb0c8, scale: .72, anim: 'sit', face: .6 });
  addInteract({
    x: EV.girl.x, z: -6.4, h: 1.9, fn: () => say([
      { who: 'girl', t: '嗚嗚……剛剛地震的時候，圍牆整個倒下來了……' },
      { who: 'girl', t: '我家的小橘被嚇得跑到瓦礫堆後面，叫牠都不出來……' },
      { who: 'gundan', t: '分析：瓦礫堵住了整條道路。以物理方式清除是最有效率的方案。' },
      { who: 'people', t: '意思就是——打碎它們對吧！交給我們！' },
    ], () => setObjective('擊碎擋路的瓦礫（左鍵攻擊）')),
  });
  props.cat.visible = false;
  addInteract({
    x: () => props.cat.position.x, z: () => props.cat.position.z, h: 1, verb: '抱起', enabled: false, fn: () => say([
      { who: 'cat', t: '喵～～' },
      { who: 'girl', t: '小橘！謝謝哥哥！還有機器人哥哥！', fx: () => { props.cat.visible = false; npcs.girl.setAnim('bow'); } },
      { who: 'girl', t: '這是我做的飯糰，給你們吃！' },
      { who: 'sys', t: '吃下飯糰，兩位角色 HP 完全回復！', fx: () => allHeroes.forEach(h => { if (h.alive) h.hp = h.maxHp; }) },
    ], () => setObjective('繼續往東走')),
  });
  // enable the cat interaction once the crates are gone
  const catIt = interactables[interactables.length - 1];
  const prevCleared = story.onDebrisCleared.bind(story);
  story.onDebrisCleared = () => { prevCleared(); catIt.enabled = true; };

  // --- 3. vending machine
  addInteract({
    x: EV.vending.x, z: -6.6, verb: '購買', fn: () => say([
      { who: 'narr', t: '一台自動販賣機。投幣口上貼著「本日特價」。' },
      { who: 'narr', t: '要買什麼呢？', choices: [
        { t: '能量飲料（HP 全滿）', then: [{ who: 'sys', t: '咕嚕咕嚕……充滿力量！HP 全滿。', fx: () => allHeroes.forEach(h => { if (h.alive) h.hp = h.maxHp; }) }] },
        { t: '黑咖啡（攻擊力 +10%）', then: [{ who: 'gundan', t: '……我是機器人，不需要咖啡因。不過心意收到了。' }, { who: 'sys', t: '攻擊力 +10%！', fx: () => allHeroes.forEach(h => h.atkMul += .1) }] },
        { t: '不買了', then: [{ who: 'people', t: '還是省點零用錢好了。' }] },
      ] },
    ]),
  });

  // --- 4. TV news in the electronics shop
  addInteract({
    x: EV.shop.x, z: -7, verb: '觀看', fn: () => say([
      { who: 'narr', t: '電器行的櫥窗裡，電視正在播放緊急新聞。', fx: () => { props.tvOn = true; } },
      { who: 'news', t: `插播一則緊急新聞。今天清晨，${PARK}的隕石坑中出現一隻不明巨大生物——` },
      { who: 'news', t: '目前自衛隊已封鎖周邊道路，請附近居民立即避難，切勿靠近！' },
      { who: 'narr', t: '——就在這時，遠方傳來一聲撼動大地的咆哮。', fx: () => { monster.appearFar(); monster.play(monster.has('angry') ? 'angry' : 'idle', { once: true }); sfx('roar', 1.4); addShake(1.2); camFocus = { x: monster.pos.x - 40, y: 10, z: -30, t: 4 }; } },
      { who: 'people', t: '那、那是什麼……！？比房子還要大好幾倍！' },
      { who: 'gundan', t: '確認目標。牠正在朝住宅區移動。我們必須加快腳步。' },
    ], () => setObjective(`趕往${PARK}！`)),
  });

  // --- 5. police barricade
  npcs.police = new NPC(peopleGltf, { x: EV.police.x, z: -5.6, name: '警察', tint: 0xbccbff, face: Math.PI / 2 });
  addInteract({
    x: EV.police.x, z: -5.6, fn: () => say([
      { who: 'police', t: '站住！前面就是封鎖區，一般民眾禁止進入！' },
      { who: 'people', t: '拜託讓我們過去！', choices: [
        { t: '「我們是來阻止那隻怪獸的！」', then: [{ who: 'police', t: '……你們？別開玩笑了，連自衛隊的坦克都被打翻了。' }, { who: 'gundan', t: '本機的戰鬥模擬勝率為 37%。比坦克高出 36 個百分點。' }, { who: 'police', t: '……………好吧。你們的眼神是認真的。' }] },
        { t: '「我家人還在河岸那邊！」', then: [{ who: 'police', t: '什麼！？……可惡，我們的人手根本不夠去疏散。' }, { who: 'police', t: '聽好，我只開一次封鎖線，你們一定要活著回來！' }] },
      ] },
      { who: 'police', t: '我把路障移開。前面的神社可以稍微喘口氣，祝你們好運！', fx: () => { barricade.open = true; barricade.col.off = true; } },
    ], () => setObjective('穿過封鎖線，前往神社')),
  });

  // --- 6. shrine
  addInteract({
    x: EV.shrine.x, z: -8, verb: '參拜', fn: () => say([
      { who: 'shrine', t: '古老的神社。賽錢箱前掛著鈴鐺。' },
      { who: 'people', t: '（搖鈴、拍手兩下）……請保佑我們打倒那隻怪獸。', fx: () => sfx('whoosh') },
      { who: 'sys', t: '神明聽見了你的願望！攻擊力 +20%，HP 全滿。', fx: () => allHeroes.forEach(h => { h.atkMul += .2; if (h.alive) h.hp = h.maxHp; }) },
      { who: 'gundan', t: `前方就是${PARK}。能量反應……非常強烈。準備好了嗎？` },
    ], () => setObjective(`進入${PARK}`)),
  });
}

function checkTriggers() {
  if (!story.flags.boss && active.pos.x > EV.boss.x) {
    story.flags.boss = true;
    arenaGate.off = false; bounds.minX = ARENA_X - 6;
    allHeroes.forEach(h => { if (h.pos.x < ARENA_X - 4) h.pos.x = ARENA_X - 4; });
    state = 'cutscene';
    $('boss').classList.add('show');
    showBanner('⚠ 地鳴……', 1500);
    monster.enterArena();
    setObjective('……');
  }
}

// =====================================================================
//  HUD
// =====================================================================
const bannerEl = $('banner'); let bannerT = 0;
function showBanner(t, ms = 1500, small = false) { bannerEl.textContent = t; bannerEl.style.fontSize = small ? '20px' : ''; bannerEl.classList.add('show'); bannerT = ms / 1000; }
const portraits = {};
function updateCard() {
  if (!active) return;
  const other = allHeroes.find(h => h !== active);
  $('pImg').src = portraits[active.def.key] || '';
  $('pName').innerHTML = `${active.def.name}<small>${active.def.title}</small>`;
  $('aImg').src = portraits[other.def.key] || '';
  $('pAlt').classList.toggle('down', other.dead);
}
function updateCity() {
  const n = houses.filter(h => h.alive).length;
  $('cityPct').textContent = Math.round(n / houses.length * 100) + '%';
  if (n === 0 && state === 'play') endGame(false, `${PARK}的住宅全被摧毀了…`);
}
// horizontal route map (top-right)
const mm = $('minimap'), mctx = mm.getContext('2d');
function drawMinimap(time) {
  const W = mm.width = Math.round(mm.clientWidth * Math.min(devicePixelRatio, 2)), H = mm.height = Math.round(mm.clientHeight * Math.min(devicePixelRatio, 2));
  const X0 = -12, X1 = LEVEL_END + 4, Z0 = -24, Z1 = 10;
  const tx = x => (x - X0) / (X1 - X0) * W, tz = z => (z - Z0) / (Z1 - Z0) * H;
  const g = mctx;
  g.fillStyle = MAP === 'desert' ? '#dcc28c' : '#7fae55'; g.fillRect(0, 0, W, H);
  g.fillStyle = MAP === 'desert' ? '#c9ab72' : '#c9ccd2'; g.fillRect(0, tz(LANE_MIN_Z), W, tz(LANE_MAX_Z) - tz(LANE_MIN_Z));
  g.fillStyle = 'rgba(229,57,53,.22)'; g.fillRect(tx(ARENA_X - 6), 0, W - tx(ARENA_X - 6), H);
  g.fillStyle = '#4a90c8'; g.fillRect(tx(ARENA_X - 6), tz(-24), W, tz(-21) - tz(-24));
  // houses (back row)
  for (const h of houses) { g.fillStyle = !h.alive ? '#5b5047' : h.hp < 50 ? '#ff9f43' : '#f4e9d8'; g.fillRect(tx(h.x - h.hx), tz(h.z - h.hz), tx(h.hx * 2) - tx(0), tz(h.hz * 2) - tz(0)); }
  for (let x = -16; x < ARENA_X - 10; x += 24) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(tx(x - 6), tz(-22), tx(12) - tx(0), tz(-10) - tz(-22)); }
  // gates
  if (crates.some(c => c.alive)) { g.fillStyle = '#8d6e4a'; g.fillRect(tx(EV.debris.x - 1), tz(LANE_MIN_Z), tx(2) - tx(0), tz(LANE_MAX_Z) - tz(LANE_MIN_Z)); }
  if (!barricade.open) { g.fillStyle = '#ffd23a'; g.fillRect(tx(EV.barricade.x - .8), tz(LANE_MIN_Z), tx(1.6) - tx(0), tz(LANE_MAX_Z) - tz(LANE_MIN_Z)); }
  const dot = (x, z, r, c) => { g.beginPath(); g.arc(tx(x), tz(z), r, 0, 7); g.fillStyle = c; g.fill(); g.lineWidth = Math.max(1.5, H / 50); g.strokeStyle = '#fff'; g.stroke(); };
  for (const it of interactables) if (it.enabled && !it.done) { const x = typeof it.x === 'function' ? it.x() : it.x, z = typeof it.z === 'function' ? it.z() : it.z; dot(x, z, H / 14 * (1 + Math.sin(time * 5) * .15), '#ffd54f'); }
  if (monster?.obj.visible && monster.alive) dot(Math.min(X1 - 2, monster.pos.x), Math.max(Z0 + 2, monster.pos.z), H / 7 * (1 + Math.sin(time * 6) * .1), '#e53935');
  for (const h of allHeroes) if (h !== active) dot(h.pos.x, h.pos.z, H / 16, h.dead ? '#777' : '#4fc3f7');
  // player arrow
  const px = tx(active.pos.x), pz = tz(active.pos.z), f = active.facing, k = H / 8;
  g.save(); g.translate(px, pz); g.rotate(Math.atan2(Math.cos(f), Math.sin(f)));
  g.beginPath(); g.moveTo(k, 0); g.lineTo(-k * .7, k * .65); g.lineTo(-k * .35, 0); g.lineTo(-k * .7, -k * .65); g.closePath();
  g.fillStyle = '#ffd54f'; g.fill(); g.strokeStyle = '#3b2a00'; g.lineWidth = Math.max(1.5, H / 50); g.stroke(); g.restore();
  // progress label
  g.fillStyle = '#fff'; g.font = `bold ${Math.round(H / 6)}px sans-serif`; g.textAlign = 'right';
  g.fillText(`${Math.max(0, Math.min(100, Math.round(active.pos.x / ARENA_X * 100)))}%`, W - H / 10, H / 5);
}

function makePortrait(gltf) {
  const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.setSize(256, 256); r.toneMapping = THREE.ACESFilmicToneMapping;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 3); s.add(dl);
  const m = prepModel(gltf, HERO_H);
  const mx = new THREE.AnimationMixer(m);
  const idle = gltf.animations.find(a => a.name.startsWith('idle'));
  if (idle) { mx.clipAction(idle).play(); mx.update(.4); }
  s.add(m);
  const c = new THREE.PerspectiveCamera(26, 1, .1, 50); c.position.set(.55, 1.5, 2.6); c.lookAt(0, 1.32, 0);
  r.render(s, c);
  const url = r.domElement.toDataURL('image/png');
  r.dispose(); r.forceContextLoss?.();
  return url;
}

// =====================================================================
//  GAME FLOW
// =====================================================================
let state = 'loading';
let allHeroes = [], active = null, monster = null;
let camFocus = null;

function switchHero() {
  if (state !== 'play') return;
  const other = allHeroes.find(h => h !== active);
  if (!other || other.dead) { showBanner('另一位角色無法戰鬥', 1000, true); return; }
  active = other; renderEmotes(); updateCard();
  showBanner(`切換：${active.def.name}`, 900, true);
}
function onHeroDown(h) {
  showBanner(`${h.def.name} 倒下了！`, 1600); updateCard();
  setTimeout(() => {
    if (state !== 'play') return;
    const alive = allHeroes.filter(x => x.alive);
    if (!alive.length) endGame(false, '兩位英雄都倒下了…');
    else if (h === active) { active = alive[0]; renderEmotes(); updateCard(); showBanner(`由 ${active.def.name} 接手戰鬥！`, 1400); }
  }, 1400);
}
function onMonsterDead() {
  setTimeout(() => say([
    { who: 'narr', t: '巨獸發出最後一聲哀嚎，緩緩倒進了河裡。' },
    { who: 'gundan', t: '目標生命反應……消失。任務完成。' },
    { who: 'people', t: '呼……我們做到了，Gundan！' },
    { who: 'narr', t: `夕陽下，${PLACE}的居民們陸續走出避難所，向兩位英雄揮手。` },
    { who: 'narr', t: '然而，在遙遠的天空中，又有一道火光悄悄劃過……' },
  ], () => endGame(true, '外星巨獸被擊退了！')), 3500);
}

const overlay = $('overlay');
function endGame(win, msg) {
  if (state === 'win' || state === 'lose') return;
  state = win ? 'win' : 'lose';
  const pct = $('cityPct').textContent;
  overlay.innerHTML = `<div class="panel"><h1 style="color:${win ? '#2e7d32' : '#c62828'}">${win ? '勝利！' : '戰敗…'}<small>${win ? 'VICTORY' : 'DEFEAT'}</small></h1>
    <p>${msg}</p><p>${PARK}住宅完整度：<b>${pct}</b></p><button class="go" id="again">再玩一次</button></div>`;
  overlay.classList.remove('hidden');
  $('again').onclick = () => location.reload();
}

function startScreen() {
  let pick = 0;
  overlay.innerHTML = `<div class="panel"><h1>怪獸襲來<small>KAIJU STRIKE</small></h1>
    <p>穿過${PLACE}的街道，幫助居民，然後在${PARK}迎戰外星巨獸！</p>
    <div class="maps"><button class="mapb ${MAP === 'city' ? 'sel' : ''}" data-m="city">🏙 青葉町</button><button class="mapb ${MAP === 'desert' ? 'sel' : ''}" data-m="desert">🏜 沙丘鎮</button></div>
    <div class="picks">${HERO_DEFS.map((d, i) => `<button class="pick ${i === 0 ? 'sel' : ''}" data-i="${i}"><img src="${portraits[d.key]}" alt=""><b>${d.name}</b><span>${d.title}</span></button>`).join('')}</div>
    ${IS_TOUCH ? `<p style="font-size:13px">左側拖曳＝移動搖桿（八方向）<br>右下按鈕：攻擊 / 跳 / 滾 / 跑 / ⇄ 切換 / ★ 動作 / 互動</p>` : `
    <div class="keys"><span><kbd>WASD</kbd> 八方向移動</span><span><kbd>Shift</kbd> 奔跑</span><span><kbd>空白</kbd> 跳躍</span><span><kbd>Ctrl</kbd> 翻滾（無敵）</span>
    <span><kbd>左鍵</kbd> 攻擊（按住連段）</span><span><kbd>E</kbd> 互動 / 對話</span><span><kbd>Tab</kbd> 切換角色</span><span><kbd>1–9</kbd> 動作（0 換頁）</span></div>`}
    <button class="go" id="go">出發！</button></div>`;
  overlay.querySelectorAll('.pick').forEach(b => b.onclick = () => { pick = +b.dataset.i; overlay.querySelectorAll('.pick').forEach(x => x.classList.toggle('sel', x === b)); });
  overlay.querySelectorAll('.mapb').forEach(b => b.onclick = () => { if (b.dataset.m === MAP) return; const u = new URL(location.href); u.searchParams.set('map', b.dataset.m); location.href = u.toString(); });
  $('go').onclick = () => {
    audio();
    active = allHeroes[pick]; renderEmotes(); updateCard();
    overlay.classList.add('hidden'); state = 'play';
    if (DEBUG.has('skipintro')) setObjective('（除錯）'); else story.intro();
  };
  state = 'menu';
}

async function load() {
  const loader = new GLTFLoader();
  const files = [...HERO_DEFS.map(d => d.file), 'models/monster.glb', 'models/house.glb'];
  const prog = new Array(files.length).fill(0);
  const res = await Promise.all(files.map((f, i) => loader.loadAsync(f, e => {
    if (e.total) prog[i] = e.loaded / e.total;
    $('loadBar').style.width = (prog.reduce((a, b) => a + b, 0) / files.length * 100) + '%';
  })));
  $('loadText').textContent = '建立街道中…';
  await new Promise(r => setTimeout(r, 30));
  const heroGltfs = res.slice(0, HERO_DEFS.length), monGltf = res[HERO_DEFS.length], houseGltf = res[HERO_DEFS.length + 1];
  buildLevel(houseGltf);
  HERO_DEFS.forEach((d, i) => { portraits[d.key] = makePortrait(heroGltfs[i]); });
  allHeroes = HERO_DEFS.map((d, i) => new Hero(d, heroGltfs[i]));
  allHeroes[0].pos.set(2, 0, 1); allHeroes[1].pos.set(-.5, 0, 3);
  monster = new Monster(monGltf);
  setupStory(heroGltfs[0]);
  active = allHeroes[0];
  updateCity(); renderEmotes(); updateCard();
  startScreen();
  if (DEBUG.has('auto')) $('go').click();
  if (DEBUG.has('debug')) window.__g = { get monster() { return monster; }, allHeroes, houses, get active() { return active; }, get state() { return state; }, advance: advanceDialog, camera, scene, tp(x) { allHeroes.forEach((h, i) => h.pos.set(x + i, 0, i)); camTarget.set(x, 1.5, 0); }, crates, interactables };
}

// =====================================================================
//  LOOP
// =====================================================================
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(2, 1.5, 0), camLook = new THREE.Vector3(2, 1.5, 0);
let time = 0, bossZoom = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05); time += dt;
  if (!active) { renderer.render(scene, camera); return; }

  if (state === 'play') {
    const inp = gatherInput();
    active.update(dt, inp);
    for (const h of allHeroes) if (h !== active) h.update(dt, h.dead ? NOINP : aiInput(h, dt));
    monster.update(dt);
    checkTriggers();
    clearEdges(dt);
  } else {
    if (state === 'dialog') tickDialog(dt);
    for (const h of allHeroes) h.update(dt, (state === 'cutscene' && h !== active && !h.dead) ? aiInput(h, dt) : NOINP);
    monster.update(dt);
    pressed.clear(); touch.edge.clear(); mouseAttack = false;
  }
  for (const k in npcs) npcs[k].update(dt);
  updateInteractables(time);
  updateHouses(dt);
  updateParticles(dt);
  // set-piece animation
  if (barricade?.open && barricade.t < 1) { barricade.t += dt * .7; barricade.group.position.z = (LANE_MIN_Z + LANE_MAX_Z) / 2 - barricade.t * 9; barricade.group.rotation.y = -barricade.t * .5; }
  if (props.siren) props.siren.material.color.setHex(Math.sin(time * 12) > 0 ? 0xff3030 : 0x3060ff);
  if (props.tv) props.tv.color.setHex(props.tvOn ? (Math.sin(time * 9) > .6 ? 0xffffff : 0x9fd0ff) : 0x2a3442);
  if (props.cat?.visible) props.cat.position.y = Math.abs(Math.sin(time * 6)) * .08;
  if (floatingCastle) { floatingCastle.position.y = 95 + Math.sin(time * .4) * 2; floatingCastle.rotation.y += dt * .01; }

  // ---- 2.5D camera: fixed angle, slides along the street
  const boss = monster.engaged || state === 'cutscene' || monster.state === 'roar';
  bossZoom += ((boss ? 1 : 0) - bossZoom) * (1 - Math.exp(-1.5 * dt));
  let fx = active.pos.x, fz = active.pos.z * .35;
  if (monster.alive && boss && !monster.engaged) { fx = THREE.MathUtils.lerp(fx, monster.pos.x, .85); fz = -2; }
  else if (monster.alive && boss) { fx = THREE.MathUtils.lerp(fx, (active.pos.x + monster.pos.x) / 2, .45); fz = THREE.MathUtils.lerp(fz, monster.pos.z * .3, .5); }
  if (camFocus) { camFocus.t -= dt; fx = THREE.MathUtils.lerp(fx, camFocus.x, .6); if (camFocus.t <= 0) camFocus = null; }
  fx = Math.max(bounds.minX + 6, Math.min(LEVEL_END - 8, fx));
  camTarget.lerp(new THREE.Vector3(fx, 1.4 + active.pos.y * .4, fz), 1 - Math.exp(-6 * dt));
  const dist = camDist + bossZoom * 18, pitch = .3 + bossZoom * .04;
  camera.position.set(camTarget.x, camTarget.y + Math.sin(pitch) * dist, camTarget.z + Math.cos(pitch) * dist);
  camLook.set(camTarget.x, camTarget.y + bossZoom * (monster.engaged ? 5 : 8) + (camFocus ? 4 : 0), camTarget.z);
  camera.lookAt(camLook);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * .6; camera.position.y += (Math.random() - .5) * shake * .6; shake = Math.max(0, shake - dt * 2.2); }
  sky.position.copy(camera.position);
  sun.position.set(camTarget.x + 30, 70, camTarget.z + 45); sun.target.position.set(camTarget.x, 0, camTarget.z - 4);

  $('bossHp').style.width = (monster.hp / monster.maxHp * 100) + '%';
  $('pHp').style.width = (active.hp / active.maxHp * 100) + '%';
  const other = allHeroes.find(h => h !== active); $('aHp').style.width = (other.hp / other.maxHp * 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('show'); }
  drawMinimap(time);
  renderer.render(scene, camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
camera.position.set(0, 6, 20);
frame();
load().catch(err => { console.error(err); $('loadText').textContent = '載入失敗：' + err.message; });
