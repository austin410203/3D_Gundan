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
const WORLD = 100;            // playable half size
const ROADS = [-60, 0, 60];   // road centre lines on x and z
const ROAD_W = 10;
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
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);

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
//  CITY
// =====================================================================
const colliders = [];     // {minX,maxX,minZ,maxZ, house?}
const houses = [];
const rubbleGroup = new THREE.Group(); scene.add(rubbleGroup);

function addCollider(cx, cz, hx, hz, house = null) {
  const c = { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, house };
  colliders.push(c); return c;
}

function blocks() { // returns [center, width] along one axis
  const edges = [-WORLD, ...ROADS.flatMap(r => [r - ROAD_W / 2, r + ROAD_W / 2]), WORLD];
  const out = [];
  for (let i = 0; i < edges.length; i += 2) out.push([(edges[i] + edges[i + 1]) / 2, edges[i + 1] - edges[i]]);
  return out;
}

function buildGround() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), toon(0x86b85a));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // lots (lighter dirt/grass patches) & roads
  const roadMat = toon(0x7d8796), lineMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4 });
  for (const r of ROADS) {
    for (const axis of ['x', 'z']) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? ROAD_W : WORLD * 2 + 20, axis === 'x' ? WORLD * 2 + 20 : ROAD_W), roadMat);
      m.rotation.x = -Math.PI / 2; m.position.set(axis === 'x' ? r : 0, 0.02, axis === 'x' ? 0 : r); m.receiveShadow = true; scene.add(m);
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? .25 : WORLD * 2 + 20, axis === 'x' ? WORLD * 2 + 20 : .25), lineMat);
        l.rotation.x = -Math.PI / 2; l.position.set(axis === 'x' ? r + s * (ROAD_W / 2 - .7) : 0, 0.035, axis === 'x' ? 0 : r + s * (ROAD_W / 2 - .7)); scene.add(l);
      }
    }
  }
  // sidewalk-ish curb strips
  const curbMat = toon(0xb8bec7);
  for (const r of ROADS) for (const axis of ['x', 'z']) for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(axis === 'x' ? .5 : WORLD * 2, .18, axis === 'x' ? WORLD * 2 : .5), curbMat);
    m.position.set(axis === 'x' ? r + s * (ROAD_W / 2 + .25) : 0, .09, axis === 'x' ? 0 : r + s * (ROAD_W / 2 + .25)); m.receiveShadow = true; scene.add(m);
  }
}

function buildHouses(houseGltf) {
  const tpl = houseGltf.scene;
  tpl.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tpl.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(tpl), size = b.getSize(new THREE.Vector3());
  const s = HOUSE_W / Math.max(size.x, size.z);
  const hx = size.x * s / 2, hz = size.z * s / 2, hy = size.y * s;

  const wallBoxes = [];
  const trees = [];
  const B = blocks();
  for (const [bx, bw] of B) for (const [bz, bd] of B) {
    const nx = bw >= 46 ? 2 : 1, nz = bd >= 46 ? 2 : 1;
    const cw = bw / nx, cd = bd / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const cx = bx - bw / 2 + cw * (i + .5), cz = bz - bd / 2 + cd * (j + .5);
      // face the closest road: for split blocks face outward from block centre, else toward city centre
      const dirZ = nz === 2 ? Math.sign(cz - bz) : (cz > 0 ? -1 : 1);
      const g = new THREE.Group();
      const m = tpl.clone();
      m.scale.setScalar(s);
      m.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s);
      g.add(m);
      g.position.set(cx, 0, cz);
      g.rotation.y = dirZ > 0 ? 0 : Math.PI;
      scene.add(g);
      const house = { group: g, model: m, x: cx, z: cz, hx, hz, h: hy, hp: 100, alive: true, shake: 0, collapse: -1, emit: 0 };
      house.col = addCollider(cx, cz, hx * .92, hz * .92, house);
      houses.push(house);

      // lot walls (block wall) with a gate gap on the front
      const lx = cw / 2 - 1.3, lz = cd / 2 - 1.3, th = .35, wh = 1.5;
      const front = cz + dirZ * lz, back = cz - dirZ * lz;
      const gap = 3.2;
      wallBoxes.push([cx, back, lx * 2, th, wh]);
      wallBoxes.push([cx - lx, cz, th, lz * 2, wh]);
      wallBoxes.push([cx + lx, cz, th, lz * 2, wh]);
      const seg = lx - gap / 2;
      wallBoxes.push([cx - lx + seg / 2, front, seg, th, wh]);
      wallBoxes.push([cx + lx - seg / 2, front, seg, th, wh]);
      // trees in back corners
      for (const sx of [-1, 1]) if (Math.random() < .8) trees.push([cx + sx * (lx - 2), cz - dirZ * (lz - 2.2)]);
      if (cw > 30) trees.push([cx + (Math.random() < .5 ? -1 : 1) * (lx - 2.5), cz + dirZ * (lz - 3)]);
    }
  }
  // instanced block walls
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(wallGeo, toon(0xa9adb6), wallBoxes.length);
  const capWalls = new THREE.InstancedMesh(wallGeo, toon(0x8d929c), wallBoxes.length);
  const mtx = new THREE.Matrix4();
  wallBoxes.forEach(([x, z, w, d, h], i) => {
    mtx.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d)); walls.setMatrixAt(i, mtx);
    mtx.compose(new THREE.Vector3(x, h + .06, z), new THREE.Quaternion(), new THREE.Vector3(w + .08, .12, d + .08)); capWalls.setMatrixAt(i, mtx);
    addCollider(x, z, w / 2, d / 2);
  });
  walls.castShadow = walls.receiveShadow = true; capWalls.castShadow = true;
  scene.add(walls, capWalls);

  // trees
  const trunkGeo = new THREE.CylinderGeometry(.22, .32, 3, 6), leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const leafMats = [toon(0x4f9a3c), toon(0x5fae45), toon(0x3f8a36)];
  for (const [x, z] of trees) {
    const t = new THREE.Group();
    const tr = new THREE.Mesh(trunkGeo, toon(0x7a5536)); tr.position.y = 1.5; tr.castShadow = true; t.add(tr);
    for (let k = 0; k < 4; k++) {
      const l = new THREE.Mesh(leafGeo, leafMats[k % 3]);
      l.position.set((Math.random() - .5) * 1.6, 3.3 + Math.random() * 1.4, (Math.random() - .5) * 1.6);
      l.scale.setScalar(.8 + Math.random() * .5); l.rotation.set(Math.random(), Math.random(), 0); l.castShadow = true; t.add(l);
    }
    t.position.set(x, 0, z); t.scale.setScalar(.9 + Math.random() * .4); scene.add(t);
  }
}

function buildPolesAndWires() {
  const poleGeo = new THREE.CylinderGeometry(.16, .2, 9.5, 6), barGeo = new THREE.BoxGeometry(1.8, .14, .14);
  const poleMat = toon(0x9a9a92), barMat = toon(0x55585e);
  const wirePts = [];
  const lines = [];
  for (const r of ROADS) for (const axis of ['x', 'z']) {
    const off = r + ROAD_W / 2 + .7;
    let prev = null;
    for (let t = -WORLD + 6; t <= WORLD - 4; t += 18) {
      if (ROADS.some(q => Math.abs(t - q) < 8)) { prev = null; continue; }
      const x = axis === 'x' ? off : t, z = axis === 'x' ? t : off;
      const p = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 4.75; pole.castShadow = true; p.add(pole);
      const bar = new THREE.Mesh(barGeo, barMat); bar.position.y = 8.6; if (axis === 'z') bar.rotation.y = Math.PI / 2; bar.rotation.y += axis === 'x' ? Math.PI / 2 : 0; p.add(bar);
      p.position.set(x, 0, z); scene.add(p);
      addCollider(x, z, .25, .25);
      const cur = { x, z };
      if (prev) lines.push([prev, cur, axis]);
      prev = cur;
    }
  }
  for (const [a, b, axis] of lines) {
    for (const o of [-.75, 0, .75]) {
      const ox = axis === 'x' ? o : 0, oz = axis === 'z' ? o : 0;
      const p0 = new THREE.Vector3(a.x + ox, 8.6, a.z + oz), p1 = new THREE.Vector3(b.x + ox, 8.6, b.z + oz);
      const mid = p0.clone().lerp(p1, .5); mid.y -= .9;
      const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
      const pts = curve.getPoints(10);
      for (let i = 0; i < pts.length - 1; i++) wirePts.push(pts[i], pts[i + 1]);
    }
  }
  const wg = new THREE.BufferGeometry().setFromPoints(wirePts);
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2d33 })));
}

function buildScenery() {
  // distant skyline
  const mats = [toon(0xb7c6d9), toon(0xa6b7cc), toon(0xc9d4e2)];
  const g = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 90;
    const w = 10 + Math.random() * 18, h = 10 + Math.random() * 45;
    const m = new THREE.Mesh(g, mats[i % 3]); m.scale.set(w, h, w * (.6 + Math.random() * .6));
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r); m.rotation.y = Math.random(); scene.add(m);
  }
  // clouds
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 300;
    s.position.set(Math.cos(a) * r, 70 + Math.random() * 70, Math.sin(a) * r);
    const k = 50 + Math.random() * 60; s.scale.set(k, k * .55, 1); scene.add(s);
  }
}

// =====================================================================
//  DESERT MAP
// =====================================================================
const mapFeatures = []; // {x,z,r} for minimap (rocks / mesas)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function duneHeight(x, z) {
  const h = 3.2 * Math.sin(x * .026 + Math.sin(z * .021) * 1.6) + 2.2 * Math.sin(z * .043 + x * .011) + 1.1 * Math.sin((x + z) * .071) + 3.5;
  const r = Math.hypot(x, z - 4);
  return Math.max(0, h) * smooth(30, 52, r);
}
function groundAt(x, z) { return MAP === 'desert' ? duneHeight(x, z) : 0; }

const sandTex = canvasTex(512, (g, s) => {
  g.fillStyle = '#dcc189'; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) {
    for (let x = 0; x < s; x += 2) {
      const w = Math.sin((y + Math.sin(x * .045) * 14 + Math.sin(x * .013) * 22) * .38);
      const n = Math.random() * 10;
      const l = w > .55 ? 22 : w < -.7 ? -26 : 0;
      g.fillStyle = `rgb(${220 + l + n | 0},${193 + l + n | 0},${137 + l * .8 + n | 0})`; g.fillRect(x, y, 2, 2);
    }
  }
});
sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(40, 40); sandTex.anisotropy = 8;

function buildDesertGround() {
  const geo = new THREE.PlaneGeometry(700, 700, 220, 220); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, duneHeight(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; scene.add(ground);
}
function buildDesertScenery() {
  const rockMats = [new THREE.MeshStandardMaterial({ color: 0xc9a46b, flatShading: true, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xb48c57, flatShading: true, roughness: 1 })];
  const rand = (a, b) => a + Math.random() * (b - a);
  const freeSpot = (minR) => { for (let k = 0; k < 40; k++) { const x = rand(-WORLD + 8, WORLD - 8), z = rand(-WORLD + 8, WORLD - 8); if (Math.hypot(x, z - 4) > minR && Math.hypot(x, z + 78) > 16 && !mapFeatures.some(f => Math.hypot(f.x - x, f.z - z) < f.r + 10)) return [x, z]; } return null; };
  // tall pillar mesas (wider at the top, like wind-carved hoodoos)
  for (let i = 0; i < 14; i++) {
    const s = freeSpot(40); if (!s) continue; const [x, z] = s;
    const r = rand(2.5, 4.5), h = rand(10, 24);
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.25, h, 6), rockMats[i % 2]); stem.position.y = h / 2; g.add(stem);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.55, r * 1.1, h * .22, 6), rockMats[(i + 1) % 2]); cap.position.y = h + h * .09; cap.rotation.y = .4; g.add(cap);
    g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    g.position.set(x, groundAt(x, z) - 1, z); g.rotation.set(rand(-.06, .06), rand(0, 6), rand(-.06, .06)); scene.add(g);
    addCollider(x, z, r * .95, r * .95); mapFeatures.push({ x, z, r: r * 1.2 });
  }
  // big boulders / slanted slabs
  for (let i = 0; i < 18; i++) {
    const s = freeSpot(38); if (!s) continue; const [x, z] = s;
    const r = rand(2, 6);
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMats[i % 2]);
    m.scale.set(rand(.8, 1.6), rand(.5, 1.1), rand(.8, 1.4)); m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    m.position.set(x, groundAt(x, z) + r * .2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
    addCollider(x, z, r * .8, r * .8); mapFeatures.push({ x, z, r });
  }
  // ancient ruins: broken walls, arches, half-buried rings
  const ruinMat = new THREE.MeshStandardMaterial({ color: 0xd6bb88, flatShading: true, roughness: 1 });
  for (let i = 0; i < 10; i++) {
    const s = freeSpot(42); if (!s) continue; const [x, z] = s; const gy = groundAt(x, z);
    const kind = i % 3; const g = new THREE.Group();
    if (kind === 0) { const w = rand(6, 12), h = rand(2.5, 5); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), ruinMat); b.position.y = h / 2 - .6; g.add(b); addCollider(x, z, w / 2, w / 2 * .2 + .8); }
    else if (kind === 1) { const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, .8, 6, 14, Math.PI), ruinMat); ring.position.y = -.4; g.add(ring); }
    else { for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.7, .8, rand(2, 6), 8), ruinMat); c.position.set(k * 3 - 3, 1, 0); c.rotation.z = k === 2 ? 1.2 : 0; g.add(c); } addCollider(x, z, 4, 1); }
    g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    g.position.set(x, gy, z); g.rotation.y = kind === 0 ? 0 : rand(0, 6); scene.add(g); mapFeatures.push({ x, z, r: 4 });
  }
  // distant dune horizon + far mesas
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, r = 230 + Math.random() * 100, h = 15 + Math.random() * 40;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rand(8, 22), rand(14, 30), h, 6), rockMats[i % 2]);
    m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); scene.add(m);
  }
  // floating castle
  const castle = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x6d5a45, flatShading: true, roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3c3128, flatShading: true, roughness: .9 });
  const island = new THREE.Mesh(new THREE.ConeGeometry(30, 34, 9), dark); island.rotation.x = Math.PI; island.position.y = -17; castle.add(island);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 4, 9), stone); castle.add(base);
  const towers = [[0, 0, 7, 40], [-12, 5, 4, 26], [12, 4, 4, 28], [-6, -12, 3.5, 22], [8, -11, 3.5, 24], [-18, -6, 3, 18], [18, -6, 3, 17], [0, 14, 4.5, 20]];
  for (const [x, z, r, h] of towers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 8), stone); t.position.set(x, h / 2 + 2, z); castle.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.3, h * .45, 8), dark); roof.position.set(x, h + 2 + h * .22, z); castle.add(roof);
  }
  for (const s of [-1, 1]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(22, 2, 6), dark); wing.position.set(s * 36, -2, 0); wing.rotation.z = s * .15; castle.add(wing); }
  castle.position.set(-30, 95, -260); castle.scale.setScalar(1.1); scene.add(castle);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
    c.position.set(-30 + (Math.random() - .5) * 70, 62 + Math.random() * 8, -260 + (Math.random() - .5) * 30); c.scale.set(45, 22, 1); scene.add(c);
  }
  floatingCastle = castle;
  // soft clouds
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: .7 }));
    const a = Math.random() * Math.PI * 2, r = 160 + Math.random() * 300;
    s.position.set(Math.cos(a) * r, 90 + Math.random() * 60, Math.sin(a) * r); const k = 60 + Math.random() * 70; s.scale.set(k, k * .4, 1); scene.add(s);
  }
}
let floatingCastle = null;
function buildDesertVillage(houseGltf) {
  const tpl = houseGltf.scene;
  tpl.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  tpl.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(tpl), size = b.getSize(new THREE.Vector3());
  const s = HOUSE_W / Math.max(size.x, size.z);
  const hx = size.x * s / 2, hz = size.z * s / 2, hy = size.y * s;
  const spots = [[-26, -10], [-26, 16], [26, -10], [26, 16], [-10, -24], [12, -24], [-12, 32], [12, 32]];
  const sandWall = toon(0xc8a878);
  for (const [cx, cz] of spots) {
    const g = new THREE.Group(); const m = tpl.clone(); m.scale.setScalar(s);
    m.position.set(-(b.min.x + b.max.x) / 2 * s, -b.min.y * s, -(b.min.z + b.max.z) / 2 * s); g.add(m);
    g.position.set(cx, 0, cz);
    g.rotation.y = Math.abs(cx) > Math.abs(cz) ? (cx > 0 ? -Math.PI / 2 : Math.PI / 2) : (cz > 0 ? Math.PI : 0);
    scene.add(g);
    const rotated = Math.abs(cx) > Math.abs(cz);
    const house = { group: g, model: m, x: cx, z: cz, hx: rotated ? hz : hx, hz: rotated ? hx : hz, h: hy, hp: 100, alive: true, shake: 0, collapse: -1, emit: 0 };
    house.col = addCollider(cx, cz, house.hx * .92, house.hz * .92, house);
    houses.push(house);
    // low adobe wall stub beside each house
    const w = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, .6), sandWall); w.position.set(cx + (rotated ? 0 : 8.5), .6, cz + (rotated ? 8.5 : 0)); if (rotated) w.rotation.y = Math.PI / 2;
    w.castShadow = true; scene.add(w);
  }
  // oasis pool + palms in the centre
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshStandardMaterial({ color: 0x3fa7c9, roughness: .15, metalness: .1 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, .05, 4); scene.add(pool); mapFeatures.push({ x: 0, z: 4, r: 6, water: true });
  const trunkMat = toon(0x8a6a44), leafMat = toon(0x5e9a3c);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2 + .3, x = Math.cos(a) * 8.5, z = 4 + Math.sin(a) * 8.5;
    const p = new THREE.Group(); const h = 6 + Math.random() * 2;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.2, .32, h, 6), trunkMat); tr.position.y = h / 2; tr.rotation.z = (Math.random() - .5) * .25; p.add(tr);
    for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(.5, 4, 4), leafMat); l.position.set(Math.cos(k) * 1.6, h - .3, Math.sin(k) * 1.6); l.rotation.set(Math.sin(k) * 1.3, 0, -Math.cos(k) * 1.3); p.add(l); }
    p.traverse(o => { if (o.isMesh) o.castShadow = true; }); p.position.set(x, 0, z); scene.add(p); addCollider(x, z, .35, .35);
  }
}

// =====================================================================
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
    if (c.house && !c.house.alive) continue;
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
  pos.x = Math.max(-WORLD + 1, Math.min(WORLD - 1, pos.x));
  pos.z = Math.max(-WORLD + 1, Math.min(WORLD - 1, pos.z));
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
//  HERO
// =====================================================================
class Hero extends Actor {
  constructor(def, gltf) {
    super(gltf, HERO_H);
    this.def = def; this.hp = this.maxHp = def.hp;
    this.vy = 0; this.grounded = true; this.kb = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.act = null; this.combo = 0; this.inv = 0; this.dead = false; this.aiAtk = 0;
    this.comboList = ['box_01', 'box_02', 'box_03', 'front_kick_02', 'front_kick_01'].filter(n => this.has(n)).slice(0, 4);
    this.emoteNames = Object.keys(this.actions).sort();
    this.rollAnim = this.has('dive') ? 'dive' : 'flip';
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
    const speed = 1.35;
    const d = Math.min(this.play(anim, { once: true, speed, fade: .08 }), 1.1);
    this.startAct('attack', anim, d, { idx: i, hitT: d * .42, hit: false, queued: false });
    // auto-aim at monster if close
    if (monster && monster.alive) {
      const dx = monster.pos.x - this.pos.x, dz = monster.pos.z - this.pos.z;
      if (Math.hypot(dx, dz) < monster.radius + 6) this.facing = Math.atan2(dx, dz);
    }
    if (this === active) sfx('whoosh', .7);
  }
  tryRoll(dir) {
    if (this.dead || !this.grounded || this.act?.type === 'roll' || this.act?.type === 'hurt') return;
    let dx = dir.x, dz = dir.z;
    if (Math.hypot(dx, dz) < .1) { dx = Math.sin(this.facing); dz = Math.cos(this.facing); }
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    this.facing = Math.atan2(dx, dz);
    const target = .7;
    this.play(this.rollAnim, { once: true, speed: this.dur(this.rollAnim) / target, fade: .06 });
    this.startAct('roll', this.rollAnim, target, { dx, dz });
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
    showBanner(`${label(n)}`, 900, true);
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
    if (this.has('defeat')) this.play('defeat', { once: true });
    else this.play(this.rollAnim, { once: true, speed: .8 });
    onHeroDown(this);
  }
  applyHit() {
    const m = monster; if (!m || !m.alive) return;
    const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const kick = this.act.anim.includes('kick');
    const reach = m.radius + 2.3 + (kick ? .6 : 0);
    if (d > reach) return;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    if ((fx * dx + fz * dz) / (d || 1) < .2 && d > m.radius) return;
    const base = [9, 10, 14, 22][this.act.idx % 4];
    const dmg = Math.round(base * this.def.dmg * (.9 + Math.random() * .2));
    const hp = new THREE.Vector3(this.pos.x + dx / d * (d - m.radius * .7), 1.5 + Math.random() * 2.5, this.pos.z + dz / d * (d - m.radius * .7));
    m.damage(dmg, this, hp);
  }
  update(dt, inp) {
    this.inv = Math.max(0, this.inv - dt);
    this.tickFlash(dt, [1, .2, .2]);
    // gravity
    if (!this.grounded) {
      this.vy -= 22 * dt; this.pos.y += this.vy * dt;
      const gh = groundAt(this.pos.x, this.pos.z); if (this.pos.y <= gh) { this.pos.y = gh; this.vy = 0; this.grounded = true; }
    }
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
        if (a.t < a.d * .35) { this.vel.set(Math.sin(this.facing) * 1.6, 0, Math.cos(this.facing) * 1.6); }
        if (!a.hit && a.t >= a.hitT) { a.hit = true; this.applyHit(); }
        if (a.queued && a.t >= a.d * .7) { this.doAttack(a.idx + 1); }
        else if (a.t >= a.d) { this.act = null; }
        else if (mv > .2 && a.t > a.hitT + .12) { this.act = null; }
      } else if (a.type === 'roll') {
        const sp = 12 * (1 - (a.t / a.d) * .6);
        this.vel.set(a.dx * sp, 0, a.dz * sp);
        if (a.t >= a.d) this.act = null;
      } else if (a.type === 'emote') {
        if (mv > .2 || a.t >= a.d) this.act = null;
      } else if (a.type === 'hurt') {
        if (a.t >= a.d) this.act = null;
      }
    }
    if (!this.act) {
      if (mv > .05) {
        const run = inp.run;
        const sp = (run ? 9.5 : 4.6) * this.def.speed * (run ? 1 : Math.max(.5, mv));
        this.vel.set(inp.x / (mv || 1) * sp, 0, inp.z / (mv || 1) * sp);
        this.facing = angLerp(this.facing, Math.atan2(inp.x, inp.z), 1 - Math.exp(-14 * dt));
        if (this.grounded && !(this.curName.startsWith('jump') && this.cur.isRunning() && this.vy !== 0))
          this.play(run ? 'run' : 'walk', { speed: run ? 1.05 : .95 * Math.max(.6, mv) });
      } else if (this.grounded) this.play('idle');
      if (!this.grounded) { /* keep jump anim while airborne */ }
    }
    if (this.grounded && this.curName.startsWith('jump') && !this.act) this.play(mv > .05 ? (inp.run ? 'run' : 'walk') : 'idle', { fade: .12 });

    this.pos.x += (this.vel.x + this.kb.x) * dt;
    this.pos.z += (this.vel.z + this.kb.z) * dt;
    resolveCollision(this.pos, .45);
    if (this.grounded) this.pos.y = groundAt(this.pos.x, this.pos.z);
    // can't walk through the monster
    if (monster && monster.alive) {
      const dx = this.pos.x - monster.pos.x, dz = this.pos.z - monster.pos.z, d = Math.hypot(dx, dz), r = monster.radius * .85;
      if (d < r && d > 0) { this.pos.x = monster.pos.x + dx / d * r; this.pos.z = monster.pos.z + dz / d * r; }
    }
    this.obj.rotation.y = this.facing;
    this.mixer.update(dt);
  }
}

// =====================================================================
//  MONSTER
// =====================================================================
class Monster extends Actor {
  constructor(gltf) {
    super(gltf, MONSTER_H);
    this.radius = 6.2; this.hp = this.maxHp = MONSTER_HP; this.alive = true;
    this.state = 'wait'; this.t = 0; this.beamCd = 6; this.poise = 0; this.aggro = 0; this.aggroHero = null;
    this.target = null; this.retarget = 0; this.stepT = 0; this.atkName = '';
    this.obj.traverse(o => { if (o.isBone && !this.head && /head/i.test(o.name) && !/end|top/i.test(o.name)) this.head = o; });
    this.attacks = ['box_01', 'box_02', 'box_03', 'front_kick_02'].filter(n => this.has(n));
    this.play('idle');
    // beam meshes
    const bg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, .5);
    this.beamOuter = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamInner = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beamOuter.visible = this.beamInner.visible = false; scene.add(this.beamOuter, this.beamInner);
    this.aim = new THREE.Vector3(); this.beamHit = new Set();
  }
  mouth() {
    const p = new THREE.Vector3();
    if (this.head) this.head.getWorldPosition(p); else p.set(this.pos.x, MONSTER_H * .8, this.pos.z);
    p.x += Math.sin(this.facing) * 2.2; p.z += Math.cos(this.facing) * 2.2; return p;
  }
  setState(s) { this.state = s; this.t = 0; }
  damage(n, hero, at) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n); this.flash = .25; this.poise += n;
    this.aggro = 8; this.aggroHero = hero;
    hitSpark(at); dmgText(at, n); sfx('hit', .9); if (hero === active) addShake(.12);
    if (this.hp <= 0) return this.die();
    if (this.poise > 140 && ['walk', 'attack', 'wait'].includes(this.state)) {
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
  pickTarget() {
    const heroes = allHeroes.filter(h => h.alive);
    let near = null, nd = 1e9;
    for (const h of heroes) { const d = Math.hypot(h.pos.x - this.pos.x, h.pos.z - this.pos.z); if (d < nd) { nd = d; near = h; } }
    if (this.aggro > 0 && this.aggroHero?.alive) return { hero: this.aggroHero };
    if (near && nd < 16) return { hero: near };
    let best = null, bd = 1e9;
    for (const h of houses) if (h.alive) { const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z); if (d < bd) { bd = d; best = h; } }
    if (best) return { house: best };
    return near ? { hero: near } : null;
  }
  tpos() { const t = this.target; return t?.hero ? t.hero.pos : t?.house ? new THREE.Vector3(t.house.x, 0, t.house.z) : this.pos; }
  faceTo(p, dt, rate = 2.5) { this.facing = angLerp(this.facing, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), 1 - Math.exp(-rate * dt)); }
  meleeImpact() {
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    const ap = new THREE.Vector3(this.pos.x + fx * (this.radius + 3), 0, this.pos.z + fz * (this.radius + 3));
    for (const h of houses) if (h.alive) {
      const cx = Math.max(h.col.minX, Math.min(ap.x, h.col.maxX)), cz = Math.max(h.col.minZ, Math.min(ap.z, h.col.maxZ));
      if (Math.hypot(ap.x - cx, ap.z - cz) < 5) damageHouse(h, 38);
    }
    for (const h of allHeroes) if (h.alive && Math.hypot(h.pos.x - ap.x, h.pos.z - ap.z) < 6.5 && h.pos.y - groundAt(h.pos.x, h.pos.z) < 4) h.hurt(16 + Math.random() * 6, this.pos.x, this.pos.z, 13);
    spawnDebris(ap.x, 1, ap.z, 6, 7, .5);
    for (let i = 0; i < 4; i++) spawnSprite('smoke', ap.x + (Math.random() - .5) * 5, .5, ap.z + (Math.random() - .5) * 5, { size: 4, life: 1.6, grow: 2, opacity: .6, color: 0xa89a88 });
    const d = Math.hypot(active.pos.x - ap.x, active.pos.z - ap.z); addShake(Math.max(0, .9 - d / 40)); sfx('boom', Math.max(.2, 1 - d / 60));
  }
  update(dt) {
    this.tickFlash(dt, [1, .35, .1]);
    this.mixer.update(dt);
    this.obj.rotation.y = this.facing;
    if (!this.alive) {
      this.t += dt;
      if (this.t > 1.2) { this.obj.rotation.z = Math.min(Math.PI / 2.2, (this.t - 1.2) * .9); this.pos.y = groundAt(this.pos.x, this.pos.z) - Math.min(4, (this.t - 1.2) * 1.2); }
      if (this.t < 4 && Math.random() < .3) explosion(this.pos.x + (Math.random() - .5) * 8, 2 + Math.random() * 10, this.pos.z + (Math.random() - .5) * 8, .5);
      return;
    }
    this.t += dt; this.beamCd -= dt; this.aggro -= dt; this.retarget -= dt;
    if (this.retarget <= 0 && ['walk', 'wait'].includes(this.state)) { this.target = this.pickTarget(); this.retarget = 1; }
    const tp = this.tpos();
    const dist = Math.hypot(tp.x - this.pos.x, tp.z - this.pos.z);

    switch (this.state) {
      case 'wait': this.play('idle'); break;
      case 'intro':
        if (this.t < .05) { this.play(this.has('angry') ? 'angry' : 'idle', { once: true }); sfx('roar', 1.3); addShake(.8); showBanner('⚠ 外星巨獸出現！保護城市！', 2600); }
        if (this.t > Math.min(this.dur('angry'), 3)) this.setState('walk');
        break;
      case 'walk': {
        if (!this.target) { this.play('idle'); break; }
        this.faceTo(tp, dt, 2);
        const reach = this.target.house ? this.radius + Math.max(this.target.house.hx, this.target.house.hz) + 1 : this.radius + 3.5;
        if (this.beamCd <= 0 && dist > 16 && dist < 75) { this.setState('charge'); break; }
        if (dist <= reach) { this.setState('attack'); break; }
        this.play('run', { speed: .55 });
        const sp = 4.2;
        this.pos.x += Math.sin(this.facing) * sp * dt; this.pos.z += Math.cos(this.facing) * sp * dt;
        this.pos.x = Math.max(-WORLD + 3, Math.min(WORLD - 3, this.pos.x)); this.pos.z = Math.max(-WORLD + 3, Math.min(WORLD - 3, this.pos.z)); this.pos.y = groundAt(this.pos.x, this.pos.z);
        // stomping damages houses it walks through
        for (const h of houses) if (h.alive && Math.abs(h.x - this.pos.x) < h.hx + this.radius * .6 && Math.abs(h.z - this.pos.z) < h.hz + this.radius * .6) damageHouse(h, 30 * dt, true);
        this.stepT -= dt;
        if (this.stepT <= 0) {
          this.stepT = .62; const d = Math.hypot(active.pos.x - this.pos.x, active.pos.z - this.pos.z);
          if (d < 45) { addShake(.18 * (1 - d / 45)); sfx('boom', .25 * (1 - d / 45)); }
          spawnSprite('smoke', this.pos.x + (Math.random() - .5) * 4, .4, this.pos.z + (Math.random() - .5) * 4, { size: 3, life: 1.2, grow: 1.5, opacity: .45, color: 0xb0a490 });
        }
        break;
      }
      case 'attack':
        if (this.t < .05) {
          this.atkName = this.attacks[(Math.random() * this.attacks.length) | 0];
          this.atkD = this.play(this.atkName, { once: true, speed: 1.0, fade: .15 }); this.atkHit = false;
        }
        if (this.t < this.atkD * .35) this.faceTo(tp, dt, 3);
        if (!this.atkHit && this.t > this.atkD * .48) { this.atkHit = true; this.meleeImpact(); }
        if (this.t >= this.atkD) { this.setState('walk'); this.retarget = 0; }
        break;
      case 'stagger':
        if (this.t >= this.stagD) this.setState('walk');
        break;
      case 'charge':
        if (this.t < .05) {
          this.play(this.has('angry') ? 'angry' : 'idle', { once: true, speed: 1.3 }); sfx('roar', .9);
          this.aim.copy(tp).setY(this.target?.house ? 3 : .8);
          showBanner('⚠ 能量光束！快閃開！', 1300);
        }
        this.faceTo(tp, dt, 3);
        this.aim.lerp(new THREE.Vector3(tp.x, this.target?.house ? 3 : .8, tp.z), 1 - Math.exp(-2 * dt));
        if (this.t > 1.3) { this.setState('beam'); this.beamHit.clear(); sfx('beam', 1.2); }
        break;
      case 'beam': {
        const goal = new THREE.Vector3(tp.x, this.target?.house ? 3 : .8, tp.z);
        const dir = goal.sub(this.aim); const l = dir.length(); if (l > .01) this.aim.addScaledVector(dir, Math.min(1, 5.5 * dt / l));
        this.faceTo(this.aim, dt, 2);
        const m = this.mouth(); const len = m.distanceTo(this.aim);
        const pulse = 1 + Math.sin(this.t * 40) * .12;
        for (const [b, r] of [[this.beamOuter, 1.25], [this.beamInner, .5]]) { b.visible = true; b.position.copy(m); b.lookAt(this.aim); b.scale.set(r * pulse, r * pulse, len); }
        fxLight.position.copy(this.aim).setY(2); fxLight.intensity = 60 + Math.random() * 30;
        if (Math.random() < .5) explosion(this.aim.x, Math.max(groundAt(this.aim.x, this.aim.z) + .5, this.aim.y - 2), this.aim.z, .4);
        addShake(dt * 2.2);
        for (const h of allHeroes) if (h.alive && !this.beamHit.has(h) && Math.hypot(h.pos.x - this.aim.x, h.pos.z - this.aim.z) < 2.8 && h.pos.y - groundAt(h.pos.x, h.pos.z) < 3) {
          if (h.act?.type === 'roll') { dmgText(h.pos.clone().setY(2.2), 'MISS', 'miss'); this.beamHit.add(h); continue; }
          this.beamHit.add(h); h.hurt(28, this.aim.x - .01, this.aim.z - .01, 14);
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
//  INPUT
// =====================================================================
const keys = new Set(), pressed = new Set();
let mouseAttack = false, attackHeld = false;
let camYaw = 0, camPitch = .32, camDist = 9;
addEventListener('keydown', e => {
  if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft'].includes(e.code)) e.preventDefault();
  audio();
  if (!e.repeat) pressed.add(e.code); keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); attackHeld = false; });
const cv = renderer.domElement;
let rDrag = false;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  audio();
  if (state !== 'play') return;
  if (e.button === 0) {
    if (document.pointerLockElement !== cv && !IS_TOUCH) cv.requestPointerLock?.();
    mouseAttack = true; attackHeld = true;
  } else if (e.button === 2) rDrag = true;
});
addEventListener('mouseup', e => { if (e.button === 2) rDrag = false; if (e.button === 0) attackHeld = false; });
addEventListener('mousemove', e => {
  if (document.pointerLockElement === cv || rDrag) {
    camYaw -= e.movementX * .0028; camPitch = Math.max(-.05, Math.min(1.25, camPitch + e.movementY * .0022));
  }
});
cv.addEventListener('wheel', e => { camDist = Math.max(4, Math.min(26, camDist * (1 + Math.sign(e.deltaY) * .1))); }, { passive: true });

// --- touch controls
const touch = { x: 0, y: 0, joyId: null, camId: null, lx: 0, ly: 0, run: false, edge: new Set(), attackHold: false };
const joy = document.getElementById('joy'), knob = document.getElementById('joyKnob'), touchEl = document.getElementById('touch');
const JR = 55;
let joyCx = 0, joyCy = 0;
touchEl.addEventListener('pointerdown', e => {
  if (e.target !== touchEl) return;
  audio();
  if (e.clientX < innerWidth * .45 && touch.joyId === null) {
    touch.joyId = e.pointerId; joyCx = e.clientX; joyCy = e.clientY;
    joy.style.left = joyCx + 'px'; joy.style.top = joyCy + 'px'; joy.classList.add('active');
  } else if (touch.camId === null) { touch.camId = e.pointerId; touch.lx = e.clientX; touch.ly = e.clientY; }
  touchEl.setPointerCapture?.(e.pointerId);
});
touchEl.addEventListener('pointermove', e => {
  if (e.pointerId === touch.joyId) {
    let dx = e.clientX - joyCx, dy = e.clientY - joyCy; const l = Math.hypot(dx, dy);
    if (l > JR) { dx *= JR / l; dy *= JR / l; }
    knob.style.transform = `translate(${dx}px,${dy}px)`; touch.x = dx / JR; touch.y = dy / JR;
  } else if (e.pointerId === touch.camId) {
    camYaw -= (e.clientX - touch.lx) * .006; camPitch = Math.max(-.05, Math.min(1.25, camPitch + (e.clientY - touch.ly) * .004));
    touch.lx = e.clientX; touch.ly = e.clientY;
  }
});
const endTouch = e => {
  if (e.pointerId === touch.joyId) {
    touch.joyId = null; touch.x = touch.y = 0; knob.style.transform = ''; joy.classList.remove('active');
    joy.style.left = ''; joy.style.top = '';
  }
  if (e.pointerId === touch.camId) touch.camId = null;
};
touchEl.addEventListener('pointerup', endTouch); touchEl.addEventListener('pointercancel', endTouch);
document.querySelectorAll('#btns button').forEach(b => {
  const k = b.dataset.b;
  b.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); audio();
    if (k === 'run') { touch.run = !touch.run; b.classList.toggle('on', touch.run); return; }
    if (k === 'emote') { const p = document.getElementById('emotes'); p.classList.toggle('open'); b.classList.toggle('on', p.classList.contains('open')); return; }
    if (k === 'attack') touch.attackHold = true;
    touch.edge.add(k);
  });
  const up = () => { if (k === 'attack') touch.attackHold = false; };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
});

// emote panel
let emPage = 0;
const emList = document.getElementById('emList');
function renderEmotes() {
  if (!active) return;
  const names = active.emoteNames, pages = Math.ceil(names.length / 9);
  emPage = ((emPage % pages) + pages) % pages;
  document.getElementById('emPage').textContent = `${emPage + 1}/${pages}`;
  emList.innerHTML = '';
  names.slice(emPage * 9, emPage * 9 + 9).forEach((n, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<b>${i + 1}</b><span>${label(n)}</span>`;
    const b = document.createElement('button'); b.textContent = `${i + 1} ${label(n)}`;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); pendingEmote = emPage * 9 + i; });
    li.appendChild(b); emList.appendChild(li);
  });
}
let pendingEmote = null;
document.getElementById('emNext').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); emPage++; renderEmotes(); });

function gatherInput() {
  const inp = { x: 0, z: 0, run: false, attack: false, jump: false, roll: false, emote: null };
  let f = 0, r = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
  if (touch.joyId !== null) { f = -touch.y; r = touch.x; }
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  inp.x = fx * f + rx * r; inp.z = fz * f + rz * r;
  const l = Math.hypot(inp.x, inp.z); if (l > 1) { inp.x /= l; inp.z /= l; }
  inp.run = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.run;
  inp.attack = mouseAttack || touch.edge.has('attack');
  inp.jump = pressed.has('Space') || touch.edge.has('jump');
  inp.roll = pressed.has('ControlLeft') || pressed.has('ControlRight') || touch.edge.has('roll');
  for (let i = 1; i <= 9; i++) if (pressed.has('Digit' + i) || pressed.has('Numpad' + i)) inp.emote = emPage * 9 + i - 1;
  if (pendingEmote != null) { inp.emote = pendingEmote; pendingEmote = null; }
  if (pressed.has('Digit0') || pressed.has('Numpad0')) { emPage++; renderEmotes(); }
  if (pressed.has('Tab') || touch.edge.has('switch')) switchHero();
  return inp;
}
let autoAtk = 0;
function clearEdges(dt) {
  pressed.clear(); touch.edge.clear(); mouseAttack = false;
  // holding attack keeps combo going
  autoAtk -= dt;
  if ((attackHeld || touch.attackHold) && autoAtk <= 0) { mouseAttack = true; autoAtk = .18; }
}

// =====================================================================
//  COMPANION AI
// =====================================================================
function aiInput(h, dt) {
  const inp = { x: 0, z: 0, run: false, attack: false, jump: false, roll: false, emote: null };
  const m = monster;
  const md = m && m.alive ? Math.hypot(m.pos.x - h.pos.x, m.pos.z - h.pos.z) : 1e9;
  const pd = Math.hypot(active.pos.x - h.pos.x, active.pos.z - h.pos.z);
  h.aiAtk -= dt;
  if (m?.alive && m.state === 'beam' && Math.hypot(m.aim.x - h.pos.x, m.aim.z - h.pos.z) < 7 && Math.random() < .08) {
    inp.roll = true; inp.x = -(m.aim.x - h.pos.x); inp.z = -(m.aim.z - h.pos.z); return inp;
  }
  if (md < 26 && pd < 40) {
    if (md > m.radius + 1.8) { inp.x = m.pos.x - h.pos.x; inp.z = m.pos.z - h.pos.z; inp.run = md > 8; }
    else if (h.aiAtk <= 0) { h.facing = Math.atan2(m.pos.x - h.pos.x, m.pos.z - h.pos.z); inp.attack = true; h.aiAtk = .9; }
  } else if (pd > 4.5) { inp.x = active.pos.x - h.pos.x; inp.z = active.pos.z - h.pos.z; inp.run = pd > 10; }
  const l = Math.hypot(inp.x, inp.z); if (l > 1) { inp.x /= l; inp.z /= l; }
  return inp;
}

// =====================================================================
//  HUD
// =====================================================================
const $ = id => document.getElementById(id);
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
  const pct = Math.round(n / houses.length * 100);
  $('cityPct').textContent = pct + '%';
  if (n === 0 && state === 'play') endGame(false, '城市已被摧毀…');
}
const mm = $('minimap'), mctx = mm.getContext('2d');
let mmBase = null;
function drawMinimap(time) {
  const S = mm.width = mm.height = Math.round(mm.clientWidth * Math.min(devicePixelRatio, 2));
  const W = WORLD + 10, tx = x => (x + W) / (W * 2) * S;
  if (!mmBase || mmBase.width !== S) {
    mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = S; const g = mmBase.getContext('2d');
    g.fillStyle = MAP === 'desert' ? '#dcc28c' : '#7fae55'; g.fillRect(0, 0, S, S);
    for (const f of mapFeatures) { g.fillStyle = f.water ? '#3fa7c9' : '#a9844f'; g.beginPath(); g.arc(tx(f.x), tx(f.z), Math.max(2, tx(f.r) - tx(0)), 0, 7); g.fill(); }
    g.fillStyle = '#d7d9dc';
    if (MAP === 'city') for (const r of ROADS) { g.fillRect(tx(r - ROAD_W / 2), 0, tx(ROAD_W) - tx(0), S); g.fillRect(0, tx(r - ROAD_W / 2), S, tx(ROAD_W) - tx(0)); }
    g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.strokeRect(tx(-WORLD), tx(-WORLD), tx(WORLD) - tx(-WORLD), tx(WORLD) - tx(-WORLD));
  }
  mctx.drawImage(mmBase, 0, 0);
  for (const h of houses) {
    mctx.fillStyle = !h.alive ? '#5b5047' : h.hp < 50 ? '#ff9f43' : '#f4e9d8';
    mctx.fillRect(tx(h.x - h.hx), tx(h.z - h.hz), tx(h.hx * 2) - tx(0), tx(h.hz * 2) - tx(0));
  }
  const dot = (x, z, r, c, stroke = '#fff') => { mctx.beginPath(); mctx.arc(tx(x), tx(z), r, 0, 7); mctx.fillStyle = c; mctx.fill(); mctx.lineWidth = Math.max(1.5, S / 120); mctx.strokeStyle = stroke; mctx.stroke(); };
  if (monster?.alive) {
    if (monster.state === 'beam' || monster.state === 'charge') { mctx.strokeStyle = 'rgba(255,140,40,.9)'; mctx.lineWidth = S / 50; mctx.beginPath(); mctx.moveTo(tx(monster.pos.x), tx(monster.pos.z)); mctx.lineTo(tx(monster.aim.x), tx(monster.aim.z)); mctx.stroke(); }
    const pr = S / 18 * (1 + Math.sin(time * 6) * .12);
    dot(monster.pos.x, monster.pos.z, pr, '#e53935');
  }
  for (const h of allHeroes) {
    if (h === active) continue;
    dot(h.pos.x, h.pos.z, S / 40, h.dead ? '#777' : '#4fc3f7');
  }
  // player arrow
  const px = tx(active.pos.x), pz = tx(active.pos.z), f = active.facing, k = S / 22;
  // view cone
  mctx.fillStyle = 'rgba(255,255,255,.18)'; mctx.beginPath(); mctx.moveTo(px, pz);
  mctx.arc(px, pz, S / 5, Math.atan2(-Math.cos(camYaw), -Math.sin(camYaw)) - .5, Math.atan2(-Math.cos(camYaw), -Math.sin(camYaw)) + .5); mctx.fill();
  mctx.save(); mctx.translate(px, pz); mctx.rotate(Math.atan2(Math.cos(f), Math.sin(f)));
  mctx.beginPath(); mctx.moveTo(k, 0); mctx.lineTo(-k * .7, k * .65); mctx.lineTo(-k * .35, 0); mctx.lineTo(-k * .7, -k * .65); mctx.closePath();
  mctx.fillStyle = '#ffd54f'; mctx.fill(); mctx.strokeStyle = '#3b2a00'; mctx.lineWidth = Math.max(1.5, S / 120); mctx.stroke(); mctx.restore();
  mctx.fillStyle = '#fff'; mctx.font = `bold ${Math.round(S / 14)}px sans-serif`; mctx.fillText('N', S / 2 - S / 40, S / 12);
}

// portraits rendered off-screen once per hero
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
//  GAME
// =====================================================================
let state = 'loading';
let allHeroes = [], active = null, monster = null;

function switchHero() {
  if (state !== 'play') return;
  const other = allHeroes.find(h => h !== active);
  if (!other || other.dead) { showBanner('另一位角色無法戰鬥', 1000, true); return; }
  active = other; renderEmotes(); updateCard();
  showBanner(`切換：${active.def.name}`, 900, true);
}
function onHeroDown(h) {
  showBanner(`${h.def.name} 倒下了！`, 1600);
  updateCard();
  setTimeout(() => {
    if (state !== 'play') return;
    const alive = allHeroes.filter(x => x.alive);
    if (!alive.length) endGame(false, '兩位英雄都倒下了…');
    else if (h === active) { active = alive[0]; renderEmotes(); updateCard(); showBanner(`由 ${active.def.name} 接手戰鬥！`, 1400); }
  }, 1400);
}
function onMonsterDead() { setTimeout(() => endGame(true, '外星巨獸被擊退了！'), 3500); }

const overlay = $('overlay');
function endGame(win, msg) {
  if (state !== 'play') return;
  state = win ? 'win' : 'lose';
  document.exitPointerLock?.();
  const pct = $('cityPct').textContent;
  overlay.innerHTML = `<div class="panel"><h1 style="color:${win ? '#2e7d32' : '#c62828'}">${win ? '勝利！' : '戰敗…'}<small>${win ? 'VICTORY' : 'DEFEAT'}</small></h1>
    <p>${msg}</p><p>城市完整度：<b>${pct}</b></p><button class="go" id="again">再玩一次</button></div>`;
  overlay.classList.remove('hidden');
  $('again').onclick = () => location.reload();
}

function startScreen() {
  let pick = 0;
  overlay.innerHTML = `<div class="panel"><h1>怪獸襲來<small>KAIJU STRIKE</small></h1>
    <p>外星巨獸正在破壞${MAP === 'desert' ? '沙漠綠洲聚落' : '城市'}！選擇戰場與英雄，與夥伴一起擊退牠。</p>
    <div class="maps"><button class="mapb ${MAP === 'city' ? 'sel' : ''}" data-m="city">🏙 城市</button><button class="mapb ${MAP === 'desert' ? 'sel' : ''}" data-m="desert">🏜 沙漠</button></div>
    <div class="picks">${HERO_DEFS.map((d, i) => `<button class="pick ${i === 0 ? 'sel' : ''}" data-i="${i}"><img src="${portraits[d.key]}" alt=""><b>${d.name}</b><span>${d.title}</span></button>`).join('')}</div>
    ${IS_TOUCH ? `<p style="font-size:13px">左側拖曳＝移動搖桿 · 右側拖曳＝轉視角<br>右下按鈕：攻擊 / 跳 / 滾 / 跑 / ⇄ 切換 / ★ 動作</p>` : `
    <div class="keys"><span><kbd>WASD</kbd> 移動</span><span><kbd>Shift</kbd> 奔跑</span><span><kbd>空白</kbd> 跳躍</span><span><kbd>Ctrl</kbd> 翻滾（無敵）</span>
    <span><kbd>左鍵</kbd> 攻擊（連按連段）</span><span><kbd>Tab</kbd> 切換角色</span><span><kbd>1–9</kbd> 動作展示</span><span><kbd>0</kbd> 動作換頁</span>
    <span><kbd>滑鼠</kbd> 轉視角</span><span><kbd>滾輪</kbd> 縮放</span></div>`}
    <button class="go" id="go">出擊！</button></div>`;
  overlay.querySelectorAll('.pick').forEach(b => b.onclick = () => { pick = +b.dataset.i; overlay.querySelectorAll('.pick').forEach(x => x.classList.toggle('sel', x === b)); });
  overlay.querySelectorAll('.mapb').forEach(b => b.onclick = () => { if (b.dataset.m === MAP) return; const u = new URL(location.href); u.searchParams.set('map', b.dataset.m); location.href = u.toString(); });
  $('go').onclick = () => {
    audio();
    active = allHeroes[pick]; renderEmotes(); updateCard();
    overlay.classList.add('hidden'); state = 'play';
    monster.setState('intro');
    if (!IS_TOUCH) cv.requestPointerLock?.();
  };
  state = 'menu';
}

async function load() {
  const mgr = new THREE.LoadingManager();
  const loader = new GLTFLoader(mgr);
  const files = [...HERO_DEFS.map(d => d.file), 'models/monster.glb', 'models/house.glb'];
  const prog = new Array(files.length).fill(0);
  const res = await Promise.all(files.map((f, i) => loader.loadAsync(f, e => {
    if (e.total) prog[i] = e.loaded / e.total;
    const p = prog.reduce((a, b) => a + b, 0) / files.length; $('loadBar').style.width = (p * 100) + '%';
  })));
  $('loadText').textContent = MAP === 'desert' ? '建立沙漠中…' : '建立城市中…';
  await new Promise(r => setTimeout(r, 30));
  const heroGltfs = res.slice(0, HERO_DEFS.length), monGltf = res[HERO_DEFS.length], houseGltf = res[HERO_DEFS.length + 1];

  if (MAP === 'desert') { buildDesertGround(); buildDesertVillage(houseGltf); buildDesertScenery(); }
  else { buildGround(); buildHouses(houseGltf); buildPolesAndWires(); buildScenery(); }
  HERO_DEFS.forEach((d, i) => { portraits[d.key] = makePortrait(heroGltfs[i]); });
  allHeroes = HERO_DEFS.map((d, i) => new Hero(d, heroGltfs[i]));
  if (MAP === 'desert') { allHeroes[0].pos.set(-1.5, 0, 16); allHeroes[1].pos.set(1.5, 0, 17.5); } else { allHeroes[0].pos.set(-1.5, 0, 30); allHeroes[1].pos.set(1.5, 0, 31.5); }
  allHeroes.forEach(h => { h.facing = Math.PI; });
  monster = new Monster(monGltf);
  monster.pos.set(0, groundAt(0, -78), -78); monster.facing = 0;
  active = allHeroes[0];
  camYaw = 0;
  if (MAP === 'desert') document.querySelector('.city').firstChild.textContent = '聚落完整度 ';
  updateCity(); renderEmotes(); updateCard();
  console.log('loaded', performance.now()|0);
  startScreen();
  if (DEBUG.has('auto')) $('go').click();
  if (DEBUG.has('debug')) window.__g = { get monster() { return monster; }, allHeroes, houses, get active() { return active; }, setYaw(v) { camYaw = v; camPitch = .32; } };
}

// =====================================================================
//  LOOP
// =====================================================================
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3(0, 1.5, 30);
let time = 0, combatZoom = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05); time += dt;
  if (!active) { renderer.render(scene, camera); return; }

  if (state === 'play') {
    const inp = gatherInput();
    active.update(dt, inp);
    for (const h of allHeroes) if (h !== active) h.update(dt, h.dead ? { x: 0, z: 0 } : aiInput(h, dt));
    monster.update(dt);
    clearEdges(dt);
  } else {
    for (const h of allHeroes) h.update(dt, { x: 0, z: 0 });
    if (monster && state !== 'menu') monster.update(dt); else monster?.mixer.update(dt);
    pressed.clear();
  }
  updateHouses(dt);
  if (floatingCastle) { floatingCastle.position.y = 95 + Math.sin(time * .4) * 2; floatingCastle.rotation.y += dt * .01; }
  updateParticles(dt);

  // camera
  camTarget.lerp(new THREE.Vector3(active.pos.x, active.pos.y * .6 + 1.5, active.pos.z), 1 - Math.exp(-10 * dt));
  // pull the camera back & up when fighting the giant so it stays framed
  const md = monster?.alive ? Math.hypot(monster.pos.x - active.pos.x, monster.pos.z - active.pos.z) : 99;
  combatZoom += ((md < 30 ? 1 : 0) - combatZoom) * (1 - Math.exp(-2 * dt));
  const effDist = camDist + combatZoom * 6, effPitch = Math.max(camPitch, combatZoom * .38);
  const cp = Math.cos(effPitch);
  camera.position.set(camTarget.x + Math.sin(camYaw) * cp * effDist, camTarget.y + Math.sin(effPitch) * effDist + .4, camTarget.z + Math.cos(camYaw) * cp * effDist);
  if (camera.position.y < .4) camera.position.y = .4;
  camera.lookAt(camTarget.x, camTarget.y + combatZoom * 4.5, camTarget.z);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * .6; camera.position.y += (Math.random() - .5) * shake * .6; shake = Math.max(0, shake - dt * 2.2); }
  sky.position.copy(camera.position);
  sun.position.set(active.pos.x + 45, 80, active.pos.z + 30); sun.target.position.set(active.pos.x, 0, active.pos.z);

  // HUD
  if (monster) $('bossHp').style.width = (monster.hp / monster.maxHp * 100) + '%';
  $('pHp').style.width = (active.hp / active.maxHp * 100) + '%';
  const other = allHeroes.find(h => h !== active); $('aHp').style.width = (other.hp / other.maxHp * 100) + '%';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) bannerEl.classList.remove('show'); }
  drawMinimap(time);

  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});
camera.position.set(0, 6, 40);
frame();
load().catch(err => { console.error(err); $('loadText').textContent = '載入失敗：' + err.message; });
