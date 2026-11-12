import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
  ProxyPilot campus — a living school, built from simple shapes.
  A U-shaped school block with a clock tower, flag, assembly yard, library,
  basketball court, running track, bus bay, gate, road and the town around it.
  Students walk, line up for morning assembly and head home in the evening.
  One classroom's windows tell the product story: red when its teacher is on
  leave, pencil-yellow when a substitute has been found.
*/

// ---------- time of day ----------
const TIMES = {
  morning: {
    skyTop: '#6fa4d6', skyBottom: '#f6dcb6', fog: '#e9dcc8', fogNear: 170, fogFar: 680,
    sun: '#fff0d4', sunI: 2.6, hemiSky: '#d6e6ff', hemiGround: '#6f6248', hemiI: 1.15,
    sunDir: [0.55, 0.62, 0.38], exposure: 1.0, clock: 8 + 50 / 60, grass: '#86a35a',
  },
  evening: {
    skyTop: '#1a2146', skyBottom: '#ef8547', fog: '#4b3442', fogNear: 120, fogFar: 560,
    sun: '#ff9653', sunI: 1.25, hemiSky: '#6a67a6', hemiGround: '#2a1c17', hemiI: 0.6,
    sunDir: [-0.75, 0.2, -0.3], exposure: 1.05, clock: 4 + 20 / 60, grass: '#5e7547',
  },
};

// ---------- guided tour ----------
export const STOPS = [
  {
    title: 'Main gate',
    time: '7:40 am',
    text: 'A teacher wakes up unwell. One tap on “I’m sick today” — before she even leaves home.',
    cam: [0, 15, 80], target: [0, 4, 36], beacon: [0, 0, 40],
  },
  {
    title: 'Staff room',
    time: '7:41 am',
    text: 'Her leave reaches the HOD instantly. No phone calls, no WhatsApp chains.',
    cam: [4, 9, 12], target: [-20, 3, -2], beacon: [-20, 0, -2],
  },
  {
    title: 'HOD office',
    time: '7:45 am',
    text: 'One tap to approve — or decline with a reason the teacher can see.',
    cam: [-4, 12, 8], target: [20, 5, -9], beacon: [20, 0, -9],
  },
  {
    title: 'Classrooms',
    time: '7:46 am',
    text: 'Each missed class goes to the fairest free teacher of the same subject. Other subjects step in as backup.',
    cam: [16, 6, 3], target: [8, 6, -19], beacon: [9.6, 0, -16.5], story: true,
  },
  {
    title: 'Library',
    time: '7:52 am',
    text: 'The substitute gets the request in the app, with a handover note on what to teach.',
    cam: [-34, 16, -6], target: [-56, 3, -34], beacon: [-56, 0, -27],
  },
  {
    title: 'Playground',
    time: '8:50 am',
    text: 'Students see who is taking their class before the bell rings.',
    cam: [36, 32, 34], target: [66, 0, -10], beacon: [66, 0, -10],
  },
  {
    title: 'Bus bay',
    time: '4:20 pm',
    text: 'By evening every class was covered — and the HOD has the full record for the month.',
    cam: [54, 18, 62], target: [29, 2, 26], beacon: [29, 0, 26],
  },
];

const HOME_VIEW = { cam: [96, 58, 112], target: [6, 3, -6] };

// ---------- small helpers ----------
const C = (hex) => new THREE.Color(hex);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function boardTexture(text, { bg = '#1f3d30', fg = '#f3efe2', edge = '#f4c542' } = {}) {
  return canvasTexture(1024, 168, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = edge;
    g.lineWidth = 10;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = fg;
    g.font = '600 84px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  });
}

function glowTexture(inner = 'rgba(255,255,255,1)') {
  return canvasTexture(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner);
    r.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}

/** Collects static shapes by colour and merges them into a few meshes (fast to draw). */
class Batch {
  constructor() {
    this.groups = new Map();
  }
  add(geo, color, x = 0, y = 0, z = 0, ry = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    if (!this.groups.has(color)) this.groups.set(color, []);
    this.groups.get(color).push(g);
    return this;
  }
  box(w, h, d, color, x, y, z, ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry);
  }
  build(scene, { shadows = true, emissive = {} } = {}) {
    const meshes = [];
    for (const [color, list] of this.groups) {
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
      if (emissive[color]) mat.emissive = C(emissive[color]);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows;
      m.receiveShadow = shadows;
      scene.add(m);
      meshes.push(m);
    }
    return meshes;
  }
}

// ---------- the scene ----------
export function buildCampus(container, { mode = 'hero', time = 'morning' } = {}) {
  const hero = mode === 'hero';
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: hero, powerPreference: hero ? 'high-performance' : 'low-power' });
  } catch {
    return null; // no WebGL: the CSS background behind the canvas shows instead
  }
  const dprCap = hero ? (coarse ? 1.5 : 1.75) : 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = hero;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(hero ? 42 : 38, 1, 0.5, 2000);
  camera.position.set(...HOME_VIEW.cam);
  const target = new THREE.Vector3(...HOME_VIEW.target);
  camera.lookAt(target);

  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  // sky dome
  const skyMat = keep(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: C(TIMES.morning.skyTop) }, bottom: { value: C(TIMES.morning.skyBottom) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
        void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.75)), 1.0); }`,
    })
  );
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(1400, 32, 16)), skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(TIMES.morning.fog, TIMES.morning.fogNear, TIMES.morning.fogFar);

  // lights
  const hemi = new THREE.HemisphereLight(TIMES.morning.hemiSky, TIMES.morning.hemiGround, TIMES.morning.hemiI);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(TIMES.morning.sun, TIMES.morning.sunI);
  sun.target.position.set(5, 0, -8);
  scene.add(sun, sun.target);
  if (hero) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    const s = sun.shadow.camera;
    s.left = -125; s.right = 125; s.top = 110; s.bottom = -110; s.near = 10; s.far = 600;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.4;
  }
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: keep(glowTexture()), color: TIMES.morning.sun, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunGlow.scale.set(170, 170, 1);
  scene.add(sunGlow);

  // ground
  const grassMat = new THREE.MeshStandardMaterial({ color: TIMES.morning.grass, roughness: 1, flatShading: true });
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(2400, 2400)), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = hero;
  scene.add(ground);

  const B = new Batch();

  // campus lawn, courtyard and paths
  B.box(180, 0.12, 100, '#97b064', 5, 0, -10);
  B.box(40, 0.2, 26, '#d8c9ac', 0, 0, -6); // assembly yard
  B.box(6, 0.2, 33, '#cfbf9f', 0, 0, 23.5); // gate path
  B.box(30, 0.2, 4, '#cfbf9f', -33, 0, 8);
  B.box(4, 0.2, 30, '#cfbf9f', -48, 0, -10);
  B.box(26, 0.2, 4, '#cfbf9f', 33, 0, 12);
  B.box(32, 0.2, 16, '#8f8d86', 30, 0, 26); // bus bay

  // ----- main school block (U shape) -----
  const WALL = '#efe2c4';
  const TRIM = '#b4573c';
  const H = 10.8;
  const blocks = [
    { w: 64, d: 12, x: 0, z: -25 },
    { w: 12, d: 26, x: -26, z: -6 },
    { w: 12, d: 26, x: 26, z: -6 },
  ];
  for (const b of blocks) {
    B.box(b.w + 0.4, 0.8, b.d + 0.4, '#a39581', b.x, 0, b.z); // plinth
    B.box(b.w, H, b.d, WALL, b.x, 0, b.z);
    for (const y of [3.6, 7.2]) B.box(b.w + 0.3, 0.35, b.d + 0.3, TRIM, b.x, y - 0.17, b.z);
    B.box(b.w + 0.5, 0.9, b.d + 0.5, TRIM, b.x, H, b.z); // parapet
    B.box(b.w - 0.6, 0.2, b.d - 0.6, '#8d918d', b.x, H + 0.5, b.z); // roof
    // water tanks on the roof
    B.add(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 10), '#2b2e31', b.x + b.w / 4, H + 1.6, b.z);
  }

  // clock tower and porch
  B.box(7.4, 0.8, 7.4, '#a39581', 0, 0, -18.5);
  B.box(7, 18, 7, WALL, 0, 0, -18.5);
  for (const y of [3.6, 7.2, 10.8, 17.4]) B.box(7.3, 0.4, 7.3, TRIM, 0, y - 0.2, -18.5);
  B.add(new THREE.ConeGeometry(5.7, 5.5, 4), TRIM, 0, 18 + 2.75, -18.5, Math.PI / 4);
  B.box(11, 0.5, 5, '#d9cdb4', 0, 3.8, -13.5); // porch roof
  for (const x of [-4.8, 4.8]) B.add(new THREE.CylinderGeometry(0.32, 0.32, 3.8, 10), '#f2ead8', x, 1.9, -11.4);
  B.box(3.2, 3, 0.3, '#5b3a2a', 0, 0, -14.9); // main door

  // flag platform and pole
  B.box(5, 0.5, 5, '#c8b99c', 0, 0, -9);
  B.box(3, 0.4, 3, '#b8a98c', 0, 0.5, -9);
  B.add(new THREE.CylinderGeometry(0.12, 0.16, 14, 8), '#f4f1ea', 0, 7.9, -9);

  // library with a pitched roof
  B.box(18.4, 0.6, 12.4, '#a39581', -56, 0, -34);
  B.box(18, 6.4, 12, '#ead6b2', -56, 0, -34);
  {
    const roof = new THREE.CylinderGeometry(7.6, 7.6, 19, 3);
    roof.rotateZ(Math.PI / 2);
    roof.rotateX(Math.PI / 6);
    roof.scale(1, 0.42, 0.9);
    B.add(roof, '#a84a31', -56, 6.4 + 1.7, -34);
  }
  B.box(2.4, 2.8, 0.3, '#5b3a2a', -56, 0, -27.9);

  // basketball court
  B.box(16, 0.12, 28, '#3c6c98', -58, 0.12, 6);
  B.box(0.25, 0.04, 28, '#f1f1ea', -58, 0.25, 6);
  B.box(16, 0.04, 0.25, '#f1f1ea', -58, 0.25, 6);
  for (const z of [-7.4, 19.4]) {
    const s = z < 6 ? -1 : 1;
    B.box(0.25, 4.2, 0.25, '#e9e7e0', -58, 0, z + s * 0.8);
    B.box(2.4, 1.5, 0.15, '#f4f2ec', -58, 3.6, z);
  }

  // running track (stadium shape) with field
  {
    const stadium = (r, half) => {
      const s = new THREE.Shape();
      s.absarc(0, half, r, 0, Math.PI, false);
      s.absarc(0, -half, r, Math.PI, Math.PI * 2, false);
      return s;
    };
    const outer = stadium(14, 18);
    outer.holes.push(stadium(10, 18));
    const track = new THREE.ShapeGeometry(outer, 24);
    track.rotateX(-Math.PI / 2);
    B.add(track, '#b55a3f', 66, 0.2, -10);
    const field = new THREE.ShapeGeometry(stadium(10, 18), 24);
    field.rotateX(-Math.PI / 2);
    B.add(field, '#7fa451', 66, 0.18, -10);
    B.box(20, 0.04, 0.3, '#f4f2ea', 66, 0.2, -10);
    for (const z of [-26, 6]) {
      const s = z < -10 ? -1 : 1;
      B.box(0.25, 2.4, 0.25, '#ffffff', 63, 0.2, z + s);
      B.box(0.25, 2.4, 0.25, '#ffffff', 69, 0.2, z + s);
      B.box(6.25, 0.25, 0.25, '#ffffff', 66, 2.5, z + s);
    }
  }

  // boundary wall and gate
  const wall = (len, x, z, ry) => {
    B.box(len, 1.8, 0.5, '#e0cfb0', x, 0, z, ry);
    B.box(len + 0.1, 0.25, 0.7, TRIM, x, 1.8, z, ry);
  };
  wall(79, -45.5, 40, 0);
  wall(89, 50.5, 40, 0);
  wall(180, 5, -60, 0);
  wall(100, -85, -10, Math.PI / 2);
  wall(100, 95, -10, Math.PI / 2);
  for (const x of [-7, 7]) {
    B.box(1.8, 5, 1.8, '#e3d3b4', x, 0, 40);
    B.box(2.1, 0.5, 2.1, TRIM, x, 5, 40);
  }

  // road, footpath and the town outside
  B.box(1600, 0.1, 13, '#3d3e41', 0, 0.05, 50);
  B.box(1600, 0.16, 2.2, '#b6aa96', 0, 0.05, 42.4);
  B.box(1600, 0.16, 2.2, '#b6aa96', 0, 0.05, 57.6);
  for (let x = -400; x <= 400; x += 9) B.box(4, 0.04, 0.35, '#e9e4d6', x, 0.12, 50);

  const HOUSE = ['#e9c8a0', '#d8a88b', '#c8d3b6', '#e7ddcb', '#b9c7d1', '#efd9a8', '#d6b8c8'];
  const placeHouse = (x, z) => {
    const w = rand(6, 11);
    const d = rand(6, 10);
    const h = [3.4, 6.8, 6.8, 10.2][Math.floor(Math.random() * 4)];
    const col = HOUSE[Math.floor(Math.random() * HOUSE.length)];
    B.box(w, h, d, col, x, 0, z);
    B.box(w + 0.3, 0.5, d + 0.3, '#cfc3ae', x, h, z);
    if (Math.random() < 0.7) B.add(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 8), '#26292c', x + rand(-w / 4, w / 4), h + 1.1, z + rand(-d / 4, d / 4));
  };
  for (let row = 0; row < 6; row++) {
    for (let x = -300; x < 300; x += rand(11, 17)) {
      if (Math.random() < 0.18) continue;
      placeHouse(x, 66 + row * 16 + rand(-2, 2));
    }
  }
  for (let z = -150; z < 40; z += rand(12, 17)) {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) if (Math.random() < 0.75) placeHouse(side * (112 + k * 15 + rand(-2, 2)), z);
    }
  }
  for (let x = -100; x < 110; x += rand(12, 17)) for (let k = 0; k < 4; k++) if (Math.random() < 0.7) placeHouse(x, -76 - k * 15);

  // distant hills
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand(-0.1, 0.1);
    const r = rand(470, 560);
    const hgt = rand(40, 95);
    B.add(new THREE.ConeGeometry(rand(90, 150), hgt, 6), '#7b8b74', Math.cos(a) * r, hgt / 2 - 6, Math.sin(a) * r);
  }

  B.build(scene, { shadows: hero });

  // ----- windows (instanced, so each can light up on its own) -----
  const windowSpots = [];
  const face = (x0, z0, ux, uz, nx, nz, len, step = 3.2, floors = 3, skip = () => false) => {
    const n = Math.floor(len / step);
    const start = -((n - 1) * step) / 2;
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < n; i++) {
        const u = start + i * step;
        const x = x0 + ux * u;
        const z = z0 + uz * u;
        if (skip(x, z)) continue;
        windowSpots.push({ x: x + nx * 0.06, y: f * 3.6 + 1.95, z: z + nz * 0.06, ry: Math.atan2(nx, nz), floor: f });
      }
    }
  };
  face(0, -19, 1, 0, 0, 1, 62, 3.2, 3, (x) => Math.abs(x) < 4.6); // back block, yard side
  face(0, -31, 1, 0, 0, -1, 62); // back block, rear
  face(-20, -6, 0, 1, 1, 0, 24); // left wing, yard side
  face(20, -6, 0, 1, -1, 0, 24); // right wing, yard side
  face(-32, -12, 0, 1, -1, 0, 36); // left outer
  face(32, -12, 0, 1, 1, 0, 36); // right outer
  face(-26, 7, 1, 0, 0, 1, 10, 3.2); // wing fronts
  face(26, 7, 1, 0, 0, 1, 10, 3.2);
  face(-56, -27.94, 1, 0, 0, 1, 16, 3.4, 1, (x) => Math.abs(x + 56) < 2); // library
  for (const w of windowSpots) if (Math.abs(w.x + 56) < 10 && w.z > -29) w.y = 3.2;

  const winGeo = keep(new THREE.PlaneGeometry(1.8, 1.55));
  const winMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
  const windows = new THREE.InstancedMesh(winGeo, winMat, windowSpots.length);
  const sillGeo = keep(new THREE.BoxGeometry(2.1, 0.14, 0.22));
  const sills = new THREE.InstancedMesh(sillGeo, keep(new THREE.MeshStandardMaterial({ color: '#f6f0e2', roughness: 0.9 })), windowSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const story = []; // the classroom that needs cover: 2nd floor, right of the tower
  windowSpots.forEach((w, i) => {
    q.setFromAxisAngle(up, w.ry);
    m4.compose(new THREE.Vector3(w.x, w.y, w.z), q, one);
    windows.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(w.x, w.y - 0.88, w.z), q, one);
    sills.setMatrixAt(i, m4);
    w.lit = Math.random() < 0.72;
    w.tint = rand(0.85, 1.12);
    if (w.floor === 1 && Math.abs(w.z + 18.94) < 0.1 && w.x > 5.5 && w.x < 14) story.push(i);
  });
  windows.setColorAt(0, C('#000'));
  scene.add(windows, sills);
  const DAY_GLASS = C('#3c5868');
  const NIGHT_LIT = C('#ffcd78');
  const NIGHT_DARK = C('#242a35');
  const RED = C('#ff5a45');
  const YELLOW = C('#f4c542');

  // ----- clock faces with moving hands -----
  const clockTex = keep(
    canvasTexture(256, 256, (g) => {
      g.fillStyle = '#f6f1e3';
      g.beginPath();
      g.arc(128, 128, 120, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 12;
      g.strokeStyle = '#3b2a20';
      g.stroke();
      g.fillStyle = '#3b2a20';
      for (let i = 0; i < 12; i++) {
        g.save();
        g.translate(128, 128);
        g.rotate((i / 12) * Math.PI * 2);
        g.fillRect(-4, -104, 8, i % 3 === 0 ? 26 : 14);
        g.restore();
      }
    })
  );
  const clockMat = keep(new THREE.MeshBasicMaterial({ map: clockTex, transparent: true }));
  const handMat = keep(new THREE.MeshBasicMaterial({ color: '#2b1d16' }));
  const hourGeo = keep(new THREE.BoxGeometry(0.22, 1.05, 0.06).translate(0, 0.45, 0));
  const minGeo = keep(new THREE.BoxGeometry(0.14, 1.55, 0.06).translate(0, 0.7, 0));
  const clocks = [];
  for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const g = new THREE.Group();
    g.position.set(nx * 3.53, 14.4, -18.5 + nz * 3.53);
    g.rotation.y = Math.atan2(nx, nz);
    const faceMesh = new THREE.Mesh(keep(new THREE.CircleGeometry(2.1, 32)), clockMat);
    const hour = new THREE.Mesh(hourGeo, handMat);
    const min = new THREE.Mesh(minGeo, handMat);
    hour.position.z = 0.05;
    min.position.z = 0.09;
    g.add(faceMesh, hour, min);
    scene.add(g);
    clocks.push({ hour, min });
  }

  // name boards
  const boardMat = keep(new THREE.MeshBasicMaterial({ map: keep(boardTexture('PROXYPILOT SCHOOL')) }));
  const board = new THREE.Mesh(keep(new THREE.PlaneGeometry(6.6, 1.08)), boardMat);
  board.position.set(0, 9.2, -14.94);
  const gateBoard = new THREE.Mesh(keep(new THREE.PlaneGeometry(13, 2.1)), boardMat);
  gateBoard.position.set(0, 5.9, 40.4);
  const gateBack = gateBoard.clone();
  gateBack.rotation.y = Math.PI;
  gateBack.position.z = 39.6;
  const libBoard = new THREE.Mesh(keep(new THREE.PlaneGeometry(5.2, 0.86)), keep(new THREE.MeshBasicMaterial({ map: keep(boardTexture('LIBRARY')) })));
  libBoard.position.set(-56, 5.3, -27.93);
  scene.add(board, gateBoard, gateBack, libBoard);

  // flag (waves)
  const flagTex = keep(
    canvasTexture(300, 200, (g) => {
      g.fillStyle = '#ff9933';
      g.fillRect(0, 0, 300, 67);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 67, 300, 66);
      g.fillStyle = '#138808';
      g.fillRect(0, 133, 300, 67);
      g.strokeStyle = '#000080';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(150, 100, 26, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        g.beginPath();
        g.moveTo(150, 100);
        g.lineTo(150 + Math.cos(a) * 26, 100 + Math.sin(a) * 26);
        g.lineWidth = 1.2;
        g.stroke();
      }
    })
  );
  const flagGeo = keep(new THREE.PlaneGeometry(3.6, 2.4, 24, 1));
  const flagBase = flagGeo.attributes.position.array.slice();
  const flag = new THREE.Mesh(flagGeo, keep(new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 })));
  flag.position.set(1.95, 13.6, -9);
  scene.add(flag);

  // ----- trees -----
  const treeSpots = [];
  for (let x = -80; x <= 90; x += 7) {
    treeSpots.push([x + rand(-1, 1), -56]);
    if (Math.abs(x) > 12) treeSpots.push([x + rand(-1, 1), 35.5]);
  }
  for (let z = -52; z <= 34; z += 7) {
    treeSpots.push([-81, z + rand(-1, 1)]);
    treeSpots.push([91, z + rand(-1, 1)]);
  }
  for (const [x, z] of [[-14, 14], [14, 14], [-40, -6], [-40, 22], [42, -40], [44, 4], [-70, -16], [-36, -46], [10, -44], [-10, -44], [30, -44]]) treeSpots.push([x, z]);
  for (let i = 0; i < 140; i++) {
    const x = rand(-320, 320);
    const z = rand(-260, 260);
    if (x > -95 && x < 105 && z > -70 && z < 60) continue;
    treeSpots.push([x, z]);
  }
  const trunkGeo = keep(new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6).translate(0, 1.6, 0));
  const leafGeo = keep(new THREE.IcosahedronGeometry(2.6, 0));
  const trunks = new THREE.InstancedMesh(trunkGeo, keep(new THREE.MeshStandardMaterial({ color: '#6b4a32', flatShading: true })), treeSpots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, keep(new THREE.MeshStandardMaterial({ flatShading: true, roughness: 1 })), treeSpots.length);
  const GREENS = ['#4f7a3a', '#5f8a3f', '#3f6b35', '#6c9445', '#557f3c'].map(C);
  treeSpots.forEach(([x, z], i) => {
    const s = rand(0.8, 1.35);
    m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
    q.setFromAxisAngle(up, rand(0, 6.28));
    m4.compose(new THREE.Vector3(x, 3.2 * s + 1.4 * s, z), q, new THREE.Vector3(s, s * rand(0.85, 1.15), s));
    leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, GREENS[i % GREENS.length]);
  });
  trunks.castShadow = leaves.castShadow = hero;
  scene.add(trunks, leaves);

  // ----- street lamps -----
  const lampSpots = [];
  for (let z = 12; z <= 36; z += 8) lampSpots.push([-4.2, z], [4.2, z]);
  lampSpots.push([-19, 6], [19, 6], [-19, -17], [19, -17], [16, 20], [44, 20], [-46, -4], [-46, -24], [-48, 20], [52, -30], [80, 10]);
  const poleGeo = keep(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 6).translate(0, 2.3, 0));
  const poles = new THREE.InstancedMesh(poleGeo, keep(new THREE.MeshStandardMaterial({ color: '#45484b' })), lampSpots.length);
  const headMat = keep(new THREE.MeshBasicMaterial({ color: '#6b6b66', toneMapped: false }));
  const heads = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.34, 10, 8)), headMat, lampSpots.length);
  const lampGlowMat = keep(new THREE.SpriteMaterial({ map: keep(glowTexture()), color: '#ffcf86', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  lampSpots.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0, z);
    poles.setMatrixAt(i, m4);
    m4.makeTranslation(x, 4.7, z);
    heads.setMatrixAt(i, m4);
    const g = new THREE.Sprite(lampGlowMat);
    g.position.set(x, 4.7, z);
    g.scale.set(5, 5, 1);
    scene.add(g);
  });
  scene.add(poles, heads);

  // ----- buses and cars -----
  const busParts = [
    [new THREE.BoxGeometry(3, 2.6, 10.4), '#f2b42c', 0, 1.75, 0],
    [new THREE.BoxGeometry(3.06, 0.95, 8.6), '#27303b', 0, 2.25, -0.4],
    [new THREE.BoxGeometry(2.6, 0.95, 0.1), '#27303b', 0, 2.25, 5.21],
    [new THREE.BoxGeometry(3.08, 0.2, 10.5), '#2b2b2b', 0, 1.2, 0],
    [new THREE.BoxGeometry(2.7, 0.3, 9.8), '#e9a91f', 0, 3.2, 0],
  ];
  const wheelGeo = keep(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12).rotateZ(Math.PI / 2));
  const wheelMat = keep(new THREE.MeshStandardMaterial({ color: '#1b1b1b' }));
  const busMats = new Map();
  const makeVehicle = (parts, wheelZ) => {
    const g = new THREE.Group();
    for (const [geo, col, x, y, z] of parts) {
      if (!busMats.has(col)) busMats.set(col, keep(new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, flatShading: true })));
      const m = new THREE.Mesh(geo, busMats.get(col));
      m.position.set(x, y, z);
      m.castShadow = hero;
      g.add(m);
    }
    for (const z of wheelZ) for (const x of [-1.45, 1.45]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.55, z);
      g.add(w);
    }
    return g;
  };
  for (const x of [20, 29, 38]) {
    const b = makeVehicle(busParts, [-3.4, 3.4]);
    b.position.set(x, 0.1, 26);
    scene.add(b);
  }
  const traffic = [];
  const movingBus = makeVehicle(busParts, [-3.4, 3.4]);
  movingBus.rotation.y = Math.PI / 2;
  scene.add(movingBus);
  traffic.push({ obj: movingBus, z: 47.2, speed: 8, x: -120 });
  const CAR = ['#c0392b', '#ecf0f1', '#2c3e50', '#16a085', '#7f8c8d'];
  for (let i = 0; i < 6; i++) {
    const col = CAR[i % CAR.length];
    const car = makeVehicle(
      [
        [new THREE.BoxGeometry(2, 1.0, 4.2), col, 0, 1.0, 0],
        [new THREE.BoxGeometry(1.8, 0.8, 2.2), '#2a3440', 0, 1.85, -0.2],
      ],
      [-1.3, 1.3]
    );
    car.scale.setScalar(0.95);
    car.children.slice(2).forEach((w) => (w.position.x *= 0.7));
    const dir = i % 2 ? 1 : -1;
    car.rotation.y = (dir * Math.PI) / 2;
    scene.add(car);
    traffic.push({ obj: car, z: dir > 0 ? 47.2 : 52.8, speed: dir * rand(10, 15), x: rand(-300, 300) });
  }

  // ----- students -----
  const nStudents = hero ? 96 : 40;
  const mats = {
    legs: keep(new THREE.MeshStandardMaterial({ color: '#283a5e', roughness: 0.9 })),
    shirt: keep(new THREE.MeshStandardMaterial({ roughness: 0.9 })),
    head: keep(new THREE.MeshStandardMaterial({ color: '#241c17', roughness: 0.8 })),
    bag: keep(new THREE.MeshStandardMaterial({ roughness: 0.8 })),
  };
  const parts = {
    legs: new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.42, 0.8, 0.26).translate(0, 0.4, 0)), mats.legs, nStudents),
    shirt: new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.52, 0.64, 0.3).translate(0, 1.12, 0)), mats.shirt, nStudents),
    head: new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.64, 0)), mats.head, nStudents),
    bag: new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.38, 0.46, 0.18).translate(0, 1.12, -0.25)), mats.bag, nStudents),
  };
  Object.values(parts).forEach((p) => {
    p.frustumCulled = false;
    scene.add(p);
  });
  const BAGS = ['#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#e67e22', '#34495e', '#f1c40f'].map(C);
  const loop = (pts) => pts.map(([x, z]) => new THREE.Vector2(x, z));
  const oval = (cx, cz, r, half, n = 28) => {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * (r + half)]);
    }
    return pts;
  };
  const PATHS = {
    yard: loop([[-17, -16], [17, -16], [17, 5], [-17, 5]]),
    gate: loop([[1.4, 38], [1.4, 8], [-1.4, 8], [-1.4, 38]]),
    track: loop(oval(66, -10, 12, 18)),
    library: loop([[-18, 8], [-48, 8], [-48, -24], [-46, 8]]),
    bus: loop([[4, 31], [16, 31], [16, 21], [4, 21]]),
    court: loop([[-67, -9], [-49, -9], [-49, 21], [-67, 21]]),
    home: loop([[1.5, 8], [1.5, 42.7], [60, 42.7], [60, 42.1], [-1.5, 42.1], [-1.5, 8]]),
  };
  const MORNING_PATHS = ['yard', 'gate', 'track', 'library', 'bus', 'court'];
  const EVENING_PATHS = ['gate', 'home', 'bus', 'track', 'court', 'home', 'bus'];
  const students = [];
  const ASSEMBLY = Math.min(48, Math.floor(nStudents * 0.5));
  for (let i = 0; i < nStudents; i++) {
    const path = MORNING_PATHS[i % MORNING_PATHS.length];
    const pts = PATHS[path];
    const seg = Math.floor(Math.random() * pts.length);
    const p = pts[seg].clone();
    students.push({
      pos: p,
      heading: 0,
      path,
      seg: (seg + 1) % pts.length,
      speed: path === 'track' ? rand(2.6, 3.4) : rand(1.1, 1.6),
      phase: rand(0, 6.28),
      slot: i < ASSEMBLY ? new THREE.Vector2(-10.5 + (i % 8) * 3, -4.5 + Math.floor(i / 8) * 2) : null,
      evening: EVENING_PATHS[i % EVENING_PATHS.length],
    });
    parts.shirt.setColorAt(i, C(Math.random() < 0.25 ? '#dfe9f5' : '#f3f2ec'));
    parts.bag.setColorAt(i, BAGS[i % BAGS.length]);
  }

  // ----- birds and drifting motes / fireflies -----
  const birdGeo = keep(new THREE.BufferGeometry());
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.9, 0.25, 0, 0, 0, 0.25, 0, 0, -0.2, 0.9, 0.25, 0, 0, 0, 0.25, 0, 0, -0.2], 3));
  const birdMat = keep(new THREE.MeshBasicMaterial({ color: '#2d2a2a', side: THREE.DoubleSide, transparent: true }));
  const birds = hero ? new THREE.InstancedMesh(birdGeo, birdMat, 16) : null;
  if (birds) scene.add(birds);

  const moteCount = hero ? 320 : 120;
  const moteGeo = keep(new THREE.BufferGeometry());
  const mp = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    mp[i * 3] = rand(-90, 100);
    mp[i * 3 + 1] = rand(0.8, 22);
    mp[i * 3 + 2] = rand(-62, 46);
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const moteBase = mp.slice();
  const moteMat = keep(new THREE.PointsMaterial({ map: keep(glowTexture()), size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffe8a8', opacity: 0.35 }));
  scene.add(new THREE.Points(moteGeo, moteMat));

  // soft clouds
  const cloudTex = keep(
    canvasTexture(256, 128, (g) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + Math.random() * 176;
        const y = 50 + Math.random() * 40;
        const r = 18 + Math.random() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.85)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 128);
      }
    })
  );
  const cloudMat = keep(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 }));
  const clouds = [];
  for (let i = 0; i < (hero ? 9 : 5); i++) {
    const c = new THREE.Sprite(cloudMat);
    c.position.set(rand(-500, 500), rand(110, 170), rand(-500, -150));
    c.scale.set(rand(150, 240), rand(60, 90), 1);
    scene.add(c);
    clouds.push(c);
  }

  // ----- tour beacon -----
  const beacon = new THREE.Group();
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beam = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.9, 0.9, 26, 20, 1, true).translate(0, 13, 0)), beamMat);
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(1.6, 2.1, 40).rotateX(-Math.PI / 2)), ringMat);
  ring.position.y = 0.35;
  beacon.add(beam, ring);
  beacon.visible = false;
  scene.add(beacon);

  // ----- camera control -----
  let controls = null;
  if (hero) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 28;
    controls.maxDistance = 220;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = 1.36;
    controls.rotateSpeed = 0.55;
    controls.autoRotate = !reduceMotion;
    controls.autoRotateSpeed = 0.35;
    // on phones, one finger scrolls the page; the tour still moves the camera
    if (coarse) {
      controls.enabled = false;
      renderer.domElement.style.touchAction = 'pan-y';
    }
    controls.update();
  }

  let flight = null; // { fromCam, fromTarget, toCam, toTarget, t }
  const flyTo = (cam, tgt, dur = 2.4) => {
    const curTarget = controls ? controls.target.clone() : target.clone();
    flight = { fromCam: camera.position.clone(), fromTarget: curTarget, toCam: new THREE.Vector3(...cam), toTarget: new THREE.Vector3(...tgt), t: 0, dur: reduceMotion ? 0.01 : dur };
    if (controls) controls.autoRotate = false;
  };

  // ----- state & animation -----
  let k = time === 'evening' ? 1 : 0; // 0 = morning, 1 = evening
  let kTarget = k;
  let storyClock = 0;
  let forcedStory = false;
  let running = true;
  let visible = true;
  let last = performance.now();
  let acc = 0;
  let elapsed = 0;
  const tmpC = new THREE.Color();
  const lerpHex = (a, b, t) => tmpC.copy(C(a)).lerp(C(b), t);

  const applyTime = () => {
    const A = TIMES.morning;
    const Z = TIMES.evening;
    skyMat.uniforms.top.value.copy(lerpHex(A.skyTop, Z.skyTop, k));
    skyMat.uniforms.bottom.value.copy(lerpHex(A.skyBottom, Z.skyBottom, k));
    scene.fog.color.copy(lerpHex(A.fog, Z.fog, k));
    scene.fog.near = THREE.MathUtils.lerp(A.fogNear, Z.fogNear, k);
    scene.fog.far = THREE.MathUtils.lerp(A.fogFar, Z.fogFar, k);
    hemi.color.copy(lerpHex(A.hemiSky, Z.hemiSky, k));
    hemi.groundColor.copy(lerpHex(A.hemiGround, Z.hemiGround, k));
    hemi.intensity = THREE.MathUtils.lerp(A.hemiI, Z.hemiI, k);
    sun.color.copy(lerpHex(A.sun, Z.sun, k));
    sun.intensity = THREE.MathUtils.lerp(A.sunI, Z.sunI, k);
    const dir = new THREE.Vector3(...A.sunDir).lerp(new THREE.Vector3(...Z.sunDir), k).normalize();
    sun.position.copy(sun.target.position).addScaledVector(dir, 260);
    sunGlow.position.copy(dir.clone().multiplyScalar(1100));
    sunGlow.material.color.copy(sun.color);
    grassMat.color.copy(lerpHex(A.grass, Z.grass, k));
    renderer.toneMappingExposure = THREE.MathUtils.lerp(A.exposure, Z.exposure, k);
    headMat.color.copy(lerpHex('#6b6b66', '#ffd58a', k));
    lampGlowMat.opacity = k * 0.85;
    moteMat.color.copy(lerpHex('#ffe8a8', '#d4ff8f', k));
    moteMat.opacity = THREE.MathUtils.lerp(0.32, 0.9, k);
    moteMat.size = THREE.MathUtils.lerp(0.7, 1.1, k);
    cloudMat.color.copy(lerpHex('#ffffff', '#f7b38f', k));
    cloudMat.opacity = THREE.MathUtils.lerp(0.85, 0.45, k);
    birdMat.opacity = 1 - k;
    // clock: 8:50 in the morning, 4:20 in the evening
    const hours = THREE.MathUtils.lerp(A.clock, Z.clock + 12, k) % 12;
    for (const c of clocks) {
      c.hour.rotation.z = -(hours / 12) * Math.PI * 2;
      c.min.rotation.z = -((hours % 1) * Math.PI * 2);
    }
  };

  const updateWindows = () => {
    // story: normal -> red (teacher on leave) -> yellow (substitute found) -> normal
    const cycle = 12;
    const s = forcedStory ? Math.min(storyClock, 7.9) : storyClock % cycle;
    const storyColor = s > 0.8 && s < 4.2 ? RED : s >= 4.2 && s < 8 ? YELLOW : null;
    const pulse = 0.75 + 0.25 * Math.sin(elapsed * 6);
    windowSpots.forEach((w, i) => {
      const night = w.lit ? NIGHT_LIT : NIGHT_DARK;
      tmpC.copy(DAY_GLASS).multiplyScalar(w.tint).lerp(night, k);
      windows.setColorAt(i, tmpC);
    });
    if (storyColor) {
      for (const i of story) {
        tmpC.copy(storyColor).multiplyScalar(storyColor === RED ? pulse : 1);
        windows.setColorAt(i, tmpC);
      }
    }
    windows.instanceColor.needsUpdate = true;
  };

  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3(1, 1, 1);
  const updateStudents = (dt) => {
    const assembly = k < 0.5;
    students.forEach((st, i) => {
      let moving = true;
      let goal;
      if (assembly && st.slot) {
        goal = st.slot;
        if (st.pos.distanceTo(goal) < 0.15) {
          moving = false;
          st.pos.copy(goal);
          st.heading = Math.PI; // face the flag and the stage
        }
      } else {
        const pathName = assembly ? st.path : st.evening;
        const pts = PATHS[pathName];
        if (st.curPath !== pathName) {
          // join the nearest point of the new path
          let best = 0;
          let bd = Infinity;
          pts.forEach((p, j) => {
            const d = p.distanceTo(st.pos);
            if (d < bd) (bd = d), (best = j);
          });
          st.curPath = pathName;
          st.seg = best;
        }
        goal = pts[st.seg % pts.length];
        if (st.pos.distanceTo(goal) < 0.6) st.seg = (st.seg + 1) % pts.length;
      }
      if (moving) {
        const dx = goal.x - st.pos.x;
        const dz = goal.y - st.pos.y;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, st.speed * dt);
        st.pos.x += (dx / d) * step;
        st.pos.y += (dz / d) * step;
        const want = Math.atan2(dx, dz);
        let diff = want - st.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        st.heading += diff * Math.min(1, dt * 8);
      }
      st.phase += dt * (moving ? st.speed * 5 : 1.2);
      const bob = moving ? Math.abs(Math.sin(st.phase)) * 0.07 : Math.sin(st.phase) * 0.01;
      q.setFromAxisAngle(up, st.heading);
      m4.compose(v3.set(st.pos.x, 0.12 + bob, st.pos.y), q, sc);
      for (const p of Object.values(parts)) p.setMatrixAt(i, m4);
    });
    for (const p of Object.values(parts)) p.instanceMatrix.needsUpdate = true;
  };

  const tick = (now) => {
    if (!running) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    // background scenes run at ~30 fps to save battery
    if (!hero) {
      acc += dt;
      if (acc < 1 / 30) return;
    }
    const step = hero ? dt : acc;
    acc = 0;
    elapsed += step;
    storyClock += step;

    if (Math.abs(kTarget - k) > 0.001) {
      k += Math.sign(kTarget - k) * Math.min(Math.abs(kTarget - k), step / 1.6);
      applyTime();
    }

    // flag wave
    const pos = flagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = flagBase[i * 3];
      const f = (x + 1.8) / 3.6;
      pos.array[i * 3 + 2] = Math.sin(x * 1.7 - elapsed * 3.2) * 0.32 * f;
    }
    pos.needsUpdate = true;

    updateStudents(step);
    updateWindows();

    for (const t of traffic) {
      t.x += t.speed * step;
      if (t.x > 330) t.x = -330;
      if (t.x < -330) t.x = 330;
      t.obj.position.set(t.x, 0.1, t.z);
    }
    for (const c of clouds) {
      c.position.x += step * 2.2;
      if (c.position.x > 600) c.position.x = -600;
    }
    for (let i = 0; i < moteCount; i++) {
      mp[i * 3] = moteBase[i * 3] + Math.sin(elapsed * 0.3 + i) * 1.6;
      mp[i * 3 + 1] = moteBase[i * 3 + 1] + Math.sin(elapsed * 0.5 + i * 1.7) * 0.8;
      mp[i * 3 + 2] = moteBase[i * 3 + 2] + Math.cos(elapsed * 0.27 + i) * 1.6;
    }
    moteGeo.attributes.position.needsUpdate = true;
    if (birds && k < 0.98) {
      for (let i = 0; i < 16; i++) {
        const a = elapsed * 0.12 + (i / 16) * 0.9;
        const r = 70 + (i % 4) * 6;
        const flap = 0.6 + Math.abs(Math.sin(elapsed * 9 + i)) * 0.8;
        q.setFromAxisAngle(up, -a);
        m4.compose(v3.set(Math.cos(a) * r + 10, 46 + (i % 5) * 1.5 + Math.sin(elapsed + i) * 1.2, Math.sin(a) * r - 10), q, new THREE.Vector3(0.9, flap * 0.9, 0.9));
        birds.setMatrixAt(i, m4);
      }
      birds.instanceMatrix.needsUpdate = true;
    }

    if (beacon.visible) {
      const p = 1 + Math.sin(elapsed * 3) * 0.12;
      ring.scale.set(p, 1, p);
      beamMat.opacity = 0.16 + Math.sin(elapsed * 3) * 0.06;
    }

    if (flight) {
      flight.t = Math.min(1, flight.t + step / flight.dur);
      const e = ease(flight.t);
      camera.position.lerpVectors(flight.fromCam, flight.toCam, e);
      const tg = new THREE.Vector3().lerpVectors(flight.fromTarget, flight.toTarget, e);
      if (controls) controls.target.copy(tg);
      else target.copy(tg);
      camera.lookAt(tg);
      if (flight.t >= 1) flight = null;
    } else if (controls) {
      controls.update();
    } else {
      // background: slow, steady orbit around the campus
      const a = elapsed * 0.03 + 0.7;
      camera.position.set(Math.cos(a) * 150 + 6, 72, Math.sin(a) * 150 - 6);
      camera.lookAt(target);
    }

    renderer.render(scene, camera);
  };

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // phones in portrait: pull back so the campus fits
    camera.fov = w / h < 0.8 ? (hero ? 58 : 52) : hero ? 42 : 38;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting && !document.hidden));
  io.observe(container);
  const onVis = () => (visible = !document.hidden);
  document.addEventListener('visibilitychange', onVis);

  applyTime();
  updateWindows();
  updateStudents(0);
  renderer.render(scene, camera);
  if (reduceMotion && !hero) {
    // still picture only
    running = false;
  } else {
    requestAnimationFrame(tick);
  }

  return {
    setTime(name) {
      kTarget = name === 'evening' ? 1 : 0;
      if (reduceMotion) {
        k = kTarget;
        applyTime();
        updateWindows();
        renderer.render(scene, camera);
      }
    },
    goTo(i) {
      const s = STOPS[i];
      if (!s) return;
      flyTo(s.cam, s.target);
      beacon.position.set(...s.beacon);
      beacon.visible = true;
      beam.visible = !s.story; // keep the classroom windows in clear view
      forcedStory = Boolean(s.story);
      if (s.story) storyClock = 0;
    },
    endTour() {
      beacon.visible = false;
      forcedStory = false;
      flyTo(HOME_VIEW.cam, HOME_VIEW.target, 2.2);
      if (controls) setTimeout(() => (controls.autoRotate = !reduceMotion), 2300);
    },
    dispose() {
      running = false;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls?.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isSprite) {
          o.geometry?.dispose();
          const m = o.material;
          (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose());
        }
      });
      disposables.forEach((d) => d.dispose?.());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
