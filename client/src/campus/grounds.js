import * as THREE from 'three';
import { canvasTexture, signTexture } from './util.js';
import { Batch } from './batch.js';
import { furnishLibrary } from './interiors.js';
import { chhatri } from './school.js';
import { crestTexture } from './crest.js';
import { buildEstate } from './estate.js';

/* Ground, lawns, paths, sports areas, compound wall, gate, road, poles and the library. */

/** the drop-off loop (its island's centre) and the children's walk from its canopy to the courtyard */
/** the school buses' own gate, at the east end of the bus bay (in from the road, and out again, never past the walkers) */
export const BUS_GATE = { x: 49 };
export const DROP = { x: -56, z: 34, r: 6.75 };
export const DROP_WALK = [[-49.5, 24.4], [-46.5, 26.0], [-24.1, 26.0], [-24.1, 12.6], [-27.2, 10.6], [-24.9, 6.5]];
// (the grounds run back past the cricket oval, the pool and the auditorium: see estate.js)
export const CAMPUS = { x0: -96, x1: 126, z0: -172, z1: 44 };
const ROAD_Z = 53;

// ---------- ground with grass, dry patches and worn earth ----------
function wornMask() {
  // a painted map of where feet and tyres have worn the grass away
  const W = 512;
  const sx = W / (CAMPUS.x1 - CAMPUS.x0);
  const sz = W / (CAMPUS.z1 - CAMPUS.z0);
  const X = (x) => (x - CAMPUS.x0) * sx;
  const Z = (z) => (z - CAMPUS.z0) * sz;
  return canvasTexture(
    W,
    W,
    (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, W);
      g.filter = 'blur(6px)';
      const blob = (x, z, rx, rz, a = 0.8) => {
        g.fillStyle = `rgba(255,255,255,${a})`;
        g.beginPath();
        g.ellipse(X(x), Z(z), rx * sx, rz * sz, 0, 0, Math.PI * 2);
        g.fill();
      };
      // football: goal mouths and centre
      blob(85, -58, 5, 3, 0.95); blob(85, -2, 5, 3, 0.95); blob(85, -30, 4.5, 4.5, 0.5);
      // along the inside of the track and the bus bay
      for (let z = -52; z <= -8; z += 4) { blob(69, z, 1.4, 2.6, 0.45); blob(101, z, 1.4, 2.6, 0.45); }
      blob(30, 30, 18, 9, 0.45);
      // desire lines: students cutting across the lawn
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.lineWidth = 1.6 * sx;
      g.beginPath(); g.moveTo(X(40), Z(10)); g.quadraticCurveTo(X(52), Z(0), X(60), Z(-6)); g.stroke();
      g.beginPath(); g.moveTo(X(-40), Z(-20)); g.lineTo(X(-60), Z(-34)); g.stroke();
      // around the library and the basketball court
      blob(-64, -33, 9, 3, 0.55); blob(-62, 3, 11, 17, 0.4);
    },
    { srgb: false }
  );
}

function groundMaterial(L, noise) {
  const grass = L.tex('grass_color.jpg');
  const dirt = L.tex('dirt_color.jpg');
  const mask = wornMask();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, normalMap: L.tex('grass_normal.jpg', { srgb: false }), normalScale: new THREE.Vector2(0.6, 0.6) });
  mat.normalMap.repeat.set(700, 700);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uGrass: { value: grass },
      uDirt: { value: dirt },
      uMask: { value: mask },
      uNoise: { value: noise },
      uRect: { value: new THREE.Vector4(CAMPUS.x0, CAMPUS.z0, CAMPUS.x1 - CAMPUS.x0, CAMPUS.z1 - CAMPUS.z0) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uGrass, uDirt, uMask, uNoise;\nuniform vec4 uRect;')
      .replace(
        '#include <map_fragment>',
        `{
          vec2 p = vWPos.xz;
          vec3 g1 = texture2D(uGrass, p / 3.7).rgb;
          vec3 g2 = texture2D(uGrass, p / 13.1 + 0.37).rgb;
          vec3 grass = mix(g1, g2, 0.45);
          float gl = dot(grass, vec3(0.299, 0.587, 0.114));
          grass = mix(vec3(gl), grass, 0.62) * vec3(1.0, 0.97, 0.78);
          float macro = texture2D(uNoise, p * 0.0035).r;
          float macro2 = texture2D(uNoise, p * 0.019 + 0.5).g;
          grass *= mix(vec3(1.18, 1.04, 0.70), vec3(0.82, 0.95, 0.80), smoothstep(0.3, 0.8, macro));
          vec3 dirt = texture2D(uDirt, p / 4.5).rgb * vec3(1.05, 0.98, 0.92);
          vec2 m = (p - uRect.xy) / uRect.zw;
          float inside = step(0.0, m.x) * step(m.x, 1.0) * step(0.0, m.y) * step(m.y, 1.0);
          float worn = inside * texture2D(uMask, m).r;
          float dry = smoothstep(0.58, 0.8, macro2) * mix(0.95, 0.35, inside);
          float d = clamp(worn + dry * 0.8, 0.0, 1.0);
          diffuseColor.rgb = mix(grass, dirt, d);
        }`
      );
  };
  return mat;
}

// ---------- real grass blades (tufts), swaying in the wind ----------
function tuftGeometry() {
  const blades = 5;
  const pos = [];
  const shade = [];
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + Math.random();
    const r = Math.random() * 0.06;
    const ox = Math.cos(a) * r;
    const oz = Math.sin(a) * r;
    const h = 0.7 + Math.random() * 0.6;
    const lean = 0.15 + Math.random() * 0.25;
    const w = 0.022;
    const dirx = Math.cos(a + 1.3);
    const dirz = Math.sin(a + 1.3);
    const seg = 3;
    for (let s = 0; s < seg; s++) {
      const t0 = s / seg;
      const t1 = (s + 1) / seg;
      const w0 = w * (1 - t0);
      const w1 = w * (1 - t1);
      const p = (t, ww, side) => [ox + Math.cos(a) * lean * t * t + dirx * ww * side, h * t, oz + Math.sin(a) * lean * t * t + dirz * ww * side];
      const A = p(t0, w0, -1), Bv = p(t0, w0, 1), Cv = p(t1, w1, 1), Dv = p(t1, w1, -1);
      pos.push(...A, ...Bv, ...Cv, ...A, ...Cv, ...Dv);
      shade.push(t0, t0, t1, t0, t1, t1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1));
  g.computeVertexNormals();
  // point normals upward so tufts light like a lawn, not like flat cards
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  n.needsUpdate = true;
  return g;
}

function grassBlades(areas, count, rng) {
  const geo = tuftGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shade;\nvarying float vShade;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShade = shade;
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float wv = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.21) * 0.6 + sin(uTime * 3.1 + ip.x * 1.3) * 0.25;
        transformed.x += wv * shade * shade * 0.12;
        transformed.z += wv * shade * shade * 0.06;
        // tufts shrink away with distance; far lawns are carried by the ground texture
        float camD = distance(ip, vec3(cameraPosition.x, 0.0, cameraPosition.z));
        transformed *= 1.0 - smoothstep(35.0, 70.0, camD);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.10, 0.16, 0.05), vec3(0.42, 0.52, 0.20), vShade);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const total = areas.reduce((s, a) => s + (a[2] - a[0]) * (a[3] - a[1]), 0);
  let i = 0;
  for (const [x0, z0, x1, z1] of areas) {
    const n = Math.round((count * (x1 - x0) * (z1 - z0)) / total);
    for (let k = 0; k < n && i < count; k++, i++) {
      const s = 0.12 + rng() * 0.12;
      q.setFromAxisAngle(up, rng() * 6.28);
      m.compose(new THREE.Vector3(x0 + rng() * (x1 - x0), 0.02, z0 + rng() * (z1 - z0)), q, new THREE.Vector3(s * 1.6, s, s * 1.6));
      mesh.setMatrixAt(i, m);
      const c = new THREE.Color().setHSL(0.2 + rng() * 0.06, 0.35, 0.6 + rng() * 0.12);
      mesh.setColorAt(i, c);
    }
  }
  mesh.count = i;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** A hip roof (ridge along x) — used for the library's Mangalore-tile roof. */
export function hipRoof(w, d, h) {
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const inset = d / 2;
  const r0 = [x0 + inset, h, 0], r1 = [x1 - inset, h, 0];
  const A = [x0, 0, z0], B = [x1, 0, z0], Cc = [x1, 0, z1], Dd = [x0, 0, z1];
  const tris = [A, r0, r1, A, r1, B, Dd, r1, r0, Dd, Cc, r1, A, Dd, r0, B, r1, Cc];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tris.length * 2), 2));
  return g;
}

/** Sagging overhead wire between two points. */
function wire(B, a, b, sag = 0.9) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t));
  }
  B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.014, 4), 'darkMetal');
}

export function buildGrounds(scene, B, M, L, rng, P) {
  const noise = L.tex('grime.jpg', { srgb: false });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), groundMaterial(L, noise));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- paved areas ----
  B.box(54, 0.08, 33, 'pavers', 0, 0, -8.5); // assembly courtyard
  B.box(9, 0.08, 23, 'pavers', 0, 0, 20.5); // main drive to the porch
  B.box(9, 0.08, 12.4, 'pavers', 0, 0, 38.1); // ... and on to the gate (everyone walks in this way)
  B.box(5, 0.08, 4, 'pavers', 0, 0, 7); // porch apron
  B.box(44, 0.06, 20.4, 'asphalt', 28, 0, 31.2); // bus bay: four drive-through bays and an entry lane along the wall
  B.box(10.5, 0.065, 15, 'asphalt', 9.75, 0, 34.5); // driveway from the gate into the bus bay
  B.box(31, 0.06, 7.4, 'asphalt', -21, 0, 36.3); // staff car park
  B.box(4, 0.065, 6, 'asphalt', -5.5, 0, 38.5);
  B.box(14, 0.08, 3, 'pavers', 15, 0, 12); // path to bus bay
  B.box(3, 0.08, 52, 'pavers', -46, 0, -10); // path to library
  B.box(12, 0.08, 3, 'pavers', -40, 0, 14);
  B.box(3, 0.08, 40, 'pavers', 46, 0, -14); // path to playground
  // painted bays for buses and cars
  // bay dividers, a stop line at the front of each bay, and arrows on the entry lane
  for (const z of [23.4, 27.0, 30.6, 34.2, 37.8]) B.box(30, 0.01, 0.12, 'line', 31, 0.065, z);
  for (const z of [25.2, 28.8, 32.4, 36.0]) B.box(0.25, 0.01, 3.2, 'line', 24.4, 0.066, z);
  for (const x of [16, 28, 40]) {
    B.box(2.2, 0.01, 0.18, 'line', x, 0.066, 39.6);
    B.add(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x + 1.1, 0.067, 39.05), new THREE.Vector3(x + 2.1, 0.067, 39.6), new THREE.Vector3(x + 1.1, 0.067, 40.15)]).setIndex([0, 2, 1]), 'line');
  }
  for (const x of [-30, -26, -22, -18]) B.box(0.1, 0.01, 4.4, 'line', x, 0.065, 34.8);

  // flower beds edged with painted bricks along the drive
  for (const side of [-1, 1]) {
    B.box(1.2, 0.18, 13, 'dirt', side * 6.2, 0, 19.5);
    for (let z = 13.2; z <= 26; z += 0.6) B.box(0.22, 0.24, 0.5, (Math.round(z / 0.6) % 2 ? 'white' : 'maroon'), side * 5.5, 0, z);
  }

  // ---- running track and football field ----
  const TX = 85, TZ = -30;
  const stadium = (r, half) => {
    const s = new THREE.Shape();
    s.absarc(0, half, r, 0, Math.PI, false);
    s.absarc(0, -half, r, Math.PI, Math.PI * 2, false);
    return s;
  };
  const HALF = 22; // length of the straights / 2
  const outer = stadium(22, HALF);
  outer.holes.push(stadium(15.5, HALF));
  const trackGeo = new THREE.ShapeGeometry(outer, 48).rotateX(-Math.PI / 2);
  B.add(trackGeo, 'track', TX, 0.05, TZ);
  for (let lane = 0; lane <= 6; lane++) {
    const r = 15.5 + lane * 1.08;
    const ring = stadium(r + 0.05, HALF);
    ring.holes.push(stadium(r - 0.025, HALF));
    B.add(new THREE.ShapeGeometry(ring, 48).rotateX(-Math.PI / 2), 'line', TX, 0.065, TZ);
  }
  // football markings
  // seven-a-side football pitch inside the track: 28 m x 56 m
  const FW = 14, FLn = 28;
  const lines = [
    [FW * 2, 0.12, TX, TZ - FLn], [FW * 2, 0.12, TX, TZ + FLn], [0.12, FLn * 2, TX - FW, TZ], [0.12, FLn * 2, TX + FW, TZ], [FW * 2, 0.12, TX, TZ],
    [16, 0.12, TX, TZ - FLn + 9], [0.12, 9, TX - 8, TZ - FLn + 4.5], [0.12, 9, TX + 8, TZ - FLn + 4.5],
    [16, 0.12, TX, TZ + FLn - 9], [0.12, 9, TX - 8, TZ + FLn - 4.5], [0.12, 9, TX + 8, TZ + FLn - 4.5],
  ];
  for (const [w, d, x, z] of lines) B.box(w, 0.01, d, 'line', x, 0.04, z);
  B.add(new THREE.RingGeometry(5.0, 5.12, 64).rotateX(-Math.PI / 2), 'line', TX, 0.045, TZ);
  for (const s of [-1, 1]) {
    const gz = TZ + s * FLn;
    B.box(0.12, 2.0, 0.12, 'white', TX - 2.5, 0, gz);
    B.box(0.12, 2.0, 0.12, 'white', TX + 2.5, 0, gz);
    B.box(5.12, 0.12, 0.12, 'white', TX, 2.0, gz);
    B.box(5, 0.03, 0.03, 'darkMetal', TX, 0.05, gz + s * 1.4);
    B.box(0.03, 1.9, 0.03, 'darkMetal', TX - 2.5, 0, gz + s * 1.4);
    B.box(0.03, 1.9, 0.03, 'darkMetal', TX + 2.5, 0, gz + s * 1.4);
  }

  // ---- basketball court ----
  const BX = -62, BZ = 3;
  B.box(19, 0.06, 32, 'courtOut', BX, 0, BZ);
  B.box(15, 0.07, 28, 'court', BX, 0, BZ);
  for (const [w, d, x, z] of [[15, 0.08, BX, BZ - 14], [15, 0.08, BX, BZ + 14], [0.08, 28, BX - 7.5, BZ], [0.08, 28, BX + 7.5, BZ], [15, 0.08, BX, BZ]]) B.box(w, 0.01, d, 'line', x, 0.075, z);
  B.add(new THREE.RingGeometry(1.75, 1.83, 48).rotateX(-Math.PI / 2), 'line', BX, 0.08, BZ);
  for (const s of [-1, 1]) {
    const z = BZ + s * 14;
    B.add(new THREE.RingGeometry(6.7, 6.78, 48, 1, s > 0 ? Math.PI : 0, Math.PI).rotateX(-Math.PI / 2), 'line', BX, 0.08, z);
    B.box(4.9, 0.01, 0.08, 'line', BX, 0.075, z - s * 5.8);
    B.box(0.14, 3.3, 0.14, 'darkMetal', BX, 0, z + s * 1.3);
    B.box(0.1, 0.1, 1.2, 'darkMetal', BX, 3.2, z + s * 0.75);
    B.box(1.8, 1.05, 0.05, 'white', BX, 2.9, z + s * 0.15);
    B.add(new THREE.TorusGeometry(0.23, 0.015, 6, 20).rotateX(Math.PI / 2), 'kerbYellow', BX, 3.05, z - s * 0.12);
  }

  // ---- compound wall with pillars and grills ----
  const wallRun = (x0, z0, x1, z1, gap) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / 3);
    const dx = (x1 - x0) / n;
    const dz = (z1 - z0) / n;
    const ry = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (i + 0.5);
      const cz = z0 + dz * (i + 0.5);
      if (gap && gap(cx, cz)) continue;
      B.add(new THREE.BoxGeometry(3, 1.2, 0.24), 'wall', cx, 0.6, cz, { ry });
      B.add(new THREE.BoxGeometry(3.02, 0.08, 0.32), 'maroon', cx, 1.24, cz, { ry });
      for (let b = 1; b < 12; b++) {
        const t = b / 12 - 0.5;
        B.add(new THREE.BoxGeometry(0.02, 0.9, 0.02), 'green', cx + dx * t, 1.73, cz + dz * t);
      }
      B.add(new THREE.BoxGeometry(3, 0.04, 0.04), 'green', cx, 2.17, cz, { ry });
      const px = x0 + dx * i;
      const pz = z0 + dz * i;
      B.box(0.45, 2.3, 0.45, 'wallShade', px, 0, pz);
      B.box(0.55, 0.1, 0.55, 'maroon', px, 2.3, pz);
    }
  };
  const { x0, x1, z0, z1 } = CAMPUS;
  // (open at the main gate, at the drop-off gate for autos and parents' cars further west, and at the buses' gate to the east)
  wallRun(x0, z1, x1, z1, (x) => Math.abs(x) < 17 || (x > -61 && x < -51) || Math.abs(x - BUS_GATE.x) < 5);
  wallRun(x0, z0, x1, z0);
  wallRun(x0, z0, x0, z1);
  wallRun(x1, z0, x1, z1);

  // ---- the main gate: two sandstone-and-ivory pylons carrying an arched entablature with the school's name and
  // crest, ornamental wing walls, a guard house, a boom barrier over the vehicle lane and a median that keeps
  // the walkers' lane apart ----
  for (const s of [-1, 1]) {
    const px = s * 8.6;
    B.box(2.4, 1.3, 1.5, 'maroon', px, 0, z1);
    B.box(2.0, 4.6, 1.3, 'white', px, 1.3, z1);
    B.box(1.1, 2.7, 0.06, 'maroon', px, 2.0, z1 + 0.66); // inlaid panels, front and back
    B.box(1.1, 2.7, 0.06, 'maroon', px, 2.0, z1 - 0.66);
    B.box(2.3, 0.3, 1.5, 'maroon', px, 5.9, z1);
    B.box(2.4, 0.35, 1.6, 'maroon', px, 7.6, z1);
    chhatri(B, px, 7.95, z1, 0.55);
    // lanterns on brackets either side of the gateway
    for (const fz of [1, -1]) {
      B.box(0.08, 0.08, 0.4, 'green', px - s * 0.7, 3.9, z1 + fz * 0.84);
      B.add(new THREE.SphereGeometry(0.2, 14, 10), 'lampOff', px - s * 0.7, 3.72, z1 + fz * 1.04);
      B.box(0.3, 0.06, 0.3, 'green', px - s * 0.7, 3.95, z1 + fz * 1.04);
    }
  }
  {
    // the entablature over the gateway, with a shallow arch beneath
    B.box(17.4, 1.4, 1.4, 'white', 0, 6.2, z1);
    B.box(17.6, 0.18, 1.5, 'maroon', 0, 6.12, z1);
    B.box(17.9, 0.25, 1.7, 'maroon', 0, 7.6, z1);
    const arch = new THREE.Shape();
    arch.moveTo(-7.6, 1.2);
    arch.lineTo(7.6, 1.2);
    arch.lineTo(7.6, 0);
    arch.quadraticCurveTo(0, 1.6, -7.6, 0);
    arch.closePath();
    B.add(new THREE.ExtrudeGeometry(arch, { depth: 1.2, bevelEnabled: false, curveSegments: 24 }), 'white', 0, 5.0, z1 - 0.6);
    // a raised centre panel for the crest
    B.box(5.2, 1.7, 0.9, 'white', 0, 7.85, z1);
    B.box(5.5, 0.22, 1.1, 'maroon', 0, 9.55, z1);
    B.box(2.2, 0.3, 0.8, 'maroon', 0, 9.77, z1);
    for (const x of [-2.5, 2.5]) {
      B.cyl(0.18, 0.5, 'maroon', x, 9.77, z1, 10);
      B.add(new THREE.SphereGeometry(0.2, 12, 8), 'gold', x, 10.42, z1);
    }
  }
  // ornamental wing walls out to the compound wall, with a plaque on each
  for (const s of [-1, 1]) {
    const cx = s * 13.8;
    B.box(8.4, 0.5, 0.6, 'maroon', cx, 0, z1);
    B.box(8.4, 1.9, 0.45, 'white', cx, 0.5, z1);
    B.box(8.6, 0.16, 0.62, 'maroon', cx, 2.4, z1);
    for (const x of [s * 9.8, s * 12.6, s * 15.2, s * 17.8]) B.box(0.45, 2.7, 0.6, 'maroon', x, 0, z1);
  }
  // sliding gate: two bronze panels that open in the morning and close at night (they run just inside the pylons)
  const gate = [];
  for (const side of [-1, 1]) {
    const GB = new Batch(M);
    for (let b = 0; b <= 28; b++) GB.box(0.035, 2.0, 0.035, 'green', side * b * 0.26, 0.15, 0);
    for (let b = 0; b < 14; b++) GB.add(new THREE.SphereGeometry(0.05, 8, 6), 'gold', side * (0.13 + b * 0.52), 2.25, 0); // finials
    GB.box(7.4, 0.07, 0.07, 'green', side * 3.65, 2.15, 0);
    GB.box(7.4, 0.07, 0.07, 'green', side * 3.65, 0.12, 0);
    GB.box(7.4, 0.05, 0.05, 'green', side * 3.65, 1.1, 0);
    GB.box(7.4, 0.04, 0.04, 'gold', side * 3.65, 1.9, 0);
    GB.add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), 'darkMetal', side * 0.3, 0.09, 0, { rx: Math.PI / 2 });
    GB.add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), 'darkMetal', side * 7, 0.09, 0, { rx: Math.PI / 2 });
    const g = new THREE.Group();
    GB.build(g);
    g.position.set(side * 0.02, 0, z1 - 1.0);
    scene.add(g);
    gate.push({ g, side });
  }
  const signMat = (text, w = 2048, h = 170) => new THREE.MeshStandardMaterial({ map: signTexture(text, { w, h, bg: '#a9583f', fg: '#f3d888', font: '700 104px Georgia, serif' }), roughness: 0.45, metalness: 0.25 });
  const nameFront = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.0), signMat('PROXYPILOT SCHOOL'));
  nameFront.position.set(0, 6.9, z1 + 0.71);
  const nameBack = nameFront.clone();
  nameBack.rotation.y = Math.PI;
  nameBack.position.z = z1 - 0.71;
  const crestMat = new THREE.MeshStandardMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.4, roughness: 0.5 });
  const crestF = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0), crestMat);
  crestF.position.set(0, 8.72, z1 + 0.46);
  const crestB = crestF.clone();
  crestB.rotation.y = Math.PI;
  crestB.position.z = z1 - 0.46;
  const plaqueL = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), signMat('SINCE 1962', 1024, 138));
  plaqueL.position.set(-13.8, 1.45, z1 + 0.235);
  const plaqueR = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), signMat('TAMASO MA JYOTIRGAMAYA', 1536, 138));
  plaqueR.position.set(13.8, 1.45, z1 + 0.235);
  scene.add(nameFront, nameBack, crestF, crestB, plaqueL, plaqueR);

  // the guard house just inside, west of the gate
  {
    const GX = -12;
    const GZ = 41.45;
    B.box(3.4, 0.3, 2.9, 'maroon', GX, 0, GZ);
    B.box(3.2, 2.5, 2.7, 'white', GX, 0.3, GZ);
    B.box(0.04, 1.0, 1.7, 'glass', GX + 1.62, 1.2, GZ); // watching the gate
    B.box(0.06, 1.1, 1.8, 'green', GX + 1.6, 1.15, GZ);
    B.box(1.2, 0.9, 0.04, 'glass', GX + 0.4, 1.3, GZ + 1.37);
    B.box(0.9, 2.0, 0.05, 'doorWood', GX - 0.6, 0.3, GZ - 1.37);
    B.box(3.9, 0.2, 3.4, 'maroon', GX, 2.8, GZ);
    B.cyl(0.9, 0.2, 'white', GX, 3.0, GZ, 18);
    B.add(new THREE.SphereGeometry(0.9, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'white', GX, 3.2, GZ, { sy: 0.9 });
    B.add(new THREE.SphereGeometry(0.1, 8, 6), 'gold', GX, 4.08, GZ);
    const sec = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.3), new THREE.MeshStandardMaterial({ map: signTexture('SECURITY', { w: 512, h: 110, bg: '#1d2b4f', fg: '#f3d888', font: '700 70px Arial, sans-serif' }), roughness: 0.5 }));
    sec.position.set(GX + 1.63, 2.45, GZ);
    sec.rotation.y = Math.PI / 2;
    scene.add(sec);
  }
  // the median between the walkers' lane (west) and the vehicle lane, with bollards; the barrier's post at its end
  B.box(0.5, 0.18, 2.1, 'maroon', -0.5, 0, 41.95);
  for (const z of [41.55, 42.65]) {
    B.cyl(0.08, 0.85, 'white', -0.5, 0.18, z, 10);
    B.cyl(0.085, 0.08, 'kerbYellow', -0.5, 0.86, z, 10);
  }
  B.box(0.34, 1.05, 0.34, 'white', -0.5, 0.18, 40.95);
  B.box(0.42, 0.25, 0.42, 'charcoal', -0.5, 1.0, 40.95);
  const boom = new THREE.Group();
  {
    const red = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 });
    for (let k = 0; k < 8; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.07), k % 2 ? white : red);
      seg.position.x = 0.25 + k * 0.9 + 0.45;
      seg.castShadow = true;
      boom.add(seg);
    }
    boom.position.set(-0.5, 1.12, 40.95);
    scene.add(boom);
  }

  // ---- the bus gate: two pylons and a lintel like the drop-off's, a boom-free opening wide enough for a bus to
  // swing in off the road, and its own apron of asphalt joining the bus bay ----
  {
    const BX = BUS_GATE.x;
    for (const s of [-1, 1]) {
      const px = BX + s * 5.3;
      B.box(1.6, 0.9, 1.4, 'maroon', px, 0, z1);
      B.box(1.3, 3.9, 1.1, 'white', px, 0.9, z1);
      B.box(1.6, 0.3, 1.4, 'maroon', px, 4.8, z1);
      B.add(new THREE.SphereGeometry(0.22, 12, 8), 'lampOff', px, 5.35, z1);
    }
    B.box(9.4, 0.6, 0.9, 'white', BX, 5.1, z1);
    B.box(9.6, 0.15, 1.0, 'maroon', BX, 5.7, z1);
    const busSign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 0.48), new THREE.MeshStandardMaterial({ map: signTexture('SCHOOL BUSES ONLY', { w: 1536, h: 102, bg: '#1d2b4f', fg: '#f3d888', font: '700 62px Georgia, serif' }), roughness: 0.5 }));
    busSign.position.set(BX, 5.4, z1 + 0.46);
    const busSignB = busSign.clone();
    busSignB.rotation.y = Math.PI;
    busSignB.position.z = z1 - 0.46;
    scene.add(busSign, busSignB);
    // the apron across the footpath, and a little more of the bay for the buses to turn on
    B.box(9.6, 0.066, 7.2, 'asphalt', BX, 0, z1 - 0.6);
    B.box(5, 0.061, 9, 'asphalt', BX + 2.4, 0, 37.4);
    // white lines either side of the footpath where it crosses the apron
    B.box(9.2, 0.01, 0.16, 'line', BX, 0.07, z1 + 1.0);
    B.box(9.2, 0.01, 0.16, 'line', BX, 0.07, z1 - 1.0);
  }

  // ---- the drop-off: autos and parents' cars come in at their own gate, go round a one-way loop and set the
  // children down under a canopy, well away from the buses and the walkers' lane ----
  {
    const DX = DROP.x;
    const DZ = DROP.z;
    for (const s of [-1, 1]) {
      const px = DX + s * 5.3;
      B.box(1.6, 0.9, 1.4, 'maroon', px, 0, z1);
      B.box(1.3, 3.6, 1.1, 'white', px, 0.9, z1);
      B.box(1.6, 0.3, 1.4, 'maroon', px, 4.5, z1);
      B.add(new THREE.SphereGeometry(0.22, 12, 8), 'lampOff', px, 5.05, z1);
    }
    B.box(9.4, 0.6, 0.9, 'white', DX, 4.8, z1);
    B.box(9.6, 0.15, 1.0, 'maroon', DX, 5.4, z1);
    const dropSign = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 0.48), new THREE.MeshStandardMaterial({ map: signTexture('DROP-OFF  ·  AUTOS & CARS', { w: 1536, h: 98, bg: '#a9583f', fg: '#f3d888', font: '700 60px Georgia, serif' }), roughness: 0.5 }));
    dropSign.position.set(DX, 5.1, z1 + 0.46);
    const dropSignB = dropSign.clone();
    dropSignB.rotation.y = Math.PI;
    dropSignB.position.z = z1 - 0.46;
    scene.add(dropSign, dropSignB);
    // the driveway across the footpath and the loop round a planted island
    B.box(9.6, 0.066, 7.2, 'asphalt', DX, 0, z1 - 0.6);
    B.add(new THREE.RingGeometry(4.4, 9.1, 64).rotateX(-Math.PI / 2), 'asphalt', DX, 0.066, DZ);
    B.add(new THREE.RingGeometry(9.1, 9.35, 64).rotateX(-Math.PI / 2), 'kerbYellow', DX, 0.075, DZ);
    B.add(new THREE.CylinderGeometry(4.4, 4.5, 0.22, 48), 'maroon', DX, 0.11, DZ);
    B.add(new THREE.CylinderGeometry(4.2, 4.2, 0.24, 48), 'courtOut', DX, 0.12, DZ);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      B.add(new THREE.SphereGeometry(0.5, 10, 8), 'shrub', DX + Math.cos(a) * 3.3, 0.6, DZ + Math.sin(a) * 3.3, { sy: 0.8 });
    }
    B.cyl(0.5, 0.6, 'maroon', DX, 0.24, DZ, 16);
    B.add(new THREE.SphereGeometry(1.1, 14, 10), 'shrub', DX, 1.7, DZ);
    // painted arrows for the one-way loop
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const ax = DX + Math.cos(a) * 6.75;
      const az = DZ + Math.sin(a) * 6.75;
      const ry = -a; // clockwise from above
      B.add(new THREE.BoxGeometry(0.18, 0.01, 1.4), 'line', ax, 0.08, az, { ry });
    }
    // the canopy over the set-down kerb on the far side of the loop
    const cz = DZ - 10.3;
    B.box(14, 0.18, 2.6, 'pavers', DX, 0, cz);
    B.box(14.2, 0.2, 0.25, 'maroon', DX, 0, cz + 1.32);
    for (const x of [-6.4, -2.1, 2.1, 6.4]) {
      B.cyl(0.16, 3.0, 'white', DX + x, 0.18, cz - 1.05, 12);
      B.box(0.38, 0.25, 0.38, 'maroon', DX + x, 0.18, cz - 1.05);
    }
    B.box(14.6, 0.22, 3.6, 'maroon', DX, 3.18, cz + 0.2);
    B.box(14.2, 0.06, 3.3, 'white', DX, 3.14, cz + 0.2);
    for (const x of [-4.3, 0, 4.3]) {
      B.box(1.8, 0.07, 0.42, 'wood', DX + x, 0.63, cz - 0.75);
      B.box(0.12, 0.45, 0.4, 'maroon', DX + x - 0.75, 0.18, cz - 0.75);
      B.box(0.12, 0.45, 0.4, 'maroon', DX + x + 0.75, 0.18, cz - 0.75);
    }
    const canopySign = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.4), new THREE.MeshStandardMaterial({ map: signTexture('SET-DOWN & PICK-UP', { w: 1024, h: 82, bg: '#1d2b4f', fg: '#f3d888', font: '700 54px Arial, sans-serif' }), roughness: 0.5 }));
    canopySign.position.set(DX, 2.7, cz + 2.03);
    scene.add(canopySign);
    // the children's path from the canopy to the courtyard, past the bicycle stand and in through the hedge
    const walk = (ax, az, bx, bz, w = 2) => {
      const len = Math.hypot(bx - ax, bz - az);
      B.add(new THREE.BoxGeometry(len, 0.08, w), 'pavers', (ax + bx) / 2, 0.04, (az + bz) / 2, { ry: -Math.atan2(bz - az, bx - ax) });
    };
    for (let k = 0; k < DROP_WALK.length - 1; k++) walk(DROP_WALK[k][0], DROP_WALK[k][1], DROP_WALK[k + 1][0], DROP_WALK[k + 1][1]);
  }

  // ---- the fountain on the west lawn: a tiered fountain in a sandstone basin, in a round paved court ----
  const water = new THREE.MeshStandardMaterial({ color: '#2f86ad', roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.9 });
  const jet = new THREE.MeshStandardMaterial({ color: '#d4eef8', roughness: 0.1, transparent: true, opacity: 0.42, emissive: '#8fcde6', emissiveIntensity: 0.12, depthWrite: false });
  water.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 };
    water.userData.shader = sh;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nuniform float uTime;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 p = vWP.xz;
          float a = sin(p.x * 3.1 + uTime * 1.7) + sin(p.y * 2.3 - uTime * 1.3) + sin((p.x + p.y) * 4.7 + uTime * 2.3) * 0.5;
          float b = cos(p.y * 3.3 + uTime * 1.5) + cos(p.x * 2.1 - uTime * 1.1) + cos((p.x - p.y) * 5.1 + uTime * 2.1) * 0.5;
          normal = normalize(normal + (viewMatrix * vec4(a * 0.05, 0.0, b * 0.05, 0.0)).xyz);
        }`
      );
  };
  const FX = -17;
  const FZ = 21.5;
  B.add(new THREE.CylinderGeometry(5.6, 5.6, 0.07, 56), 'maroon', FX, 0.035, FZ);
  B.add(new THREE.CylinderGeometry(5.3, 5.3, 0.09, 56), 'pavers', FX, 0.045, FZ);
  B.add(new THREE.CylinderGeometry(3.05, 3.15, 0.55, 48, 1, true), 'maroon', FX, 0.275, FZ);
  B.add(new THREE.CylinderGeometry(2.85, 2.85, 0.5, 48, 1, true), 'maroon', FX, 0.25, FZ);
  B.add(new THREE.TorusGeometry(2.97, 0.16, 6, 48).rotateX(Math.PI / 2), 'white', FX, 0.56, FZ);
  B.add(new THREE.CylinderGeometry(2.86, 2.86, 0.04, 48), 'tiles', FX, 0.06, FZ);
  B.cyl(0.36, 1.1, 'white', FX, 0.08, FZ, 16);
  B.add(new THREE.CylinderGeometry(1.25, 0.45, 0.32, 32), 'white', FX, 1.34, FZ);
  B.cyl(0.18, 0.75, 'white', FX, 1.5, FZ, 12);
  B.add(new THREE.CylinderGeometry(0.62, 0.22, 0.22, 24), 'white', FX, 2.36, FZ);
  B.add(new THREE.SphereGeometry(0.16, 12, 8), 'white', FX, 2.56, FZ);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = FX + Math.cos(a) * 4.45;
    const bz = FZ + Math.sin(a) * 4.45;
    const ry = -a + Math.PI / 2;
    B.box(1.8, 0.07, 0.42, 'wood', bx, 0.45, bz, { ry });
    B.box(1.8, 0.32, 0.06, 'wood', bx + Math.cos(a) * 0.2, 0.62, bz + Math.sin(a) * 0.2, { ry });
    for (const e of [-0.75, 0.75]) B.box(0.12, 0.45, 0.4, 'maroon', bx + Math.sin(a) * e, 0, bz - Math.cos(a) * e, { ry });
    const ua = a + Math.PI / 4;
    B.add(new THREE.CylinderGeometry(0.35, 0.22, 0.7, 14), 'maroon', FX + Math.cos(ua) * 5.0, 0.35, FZ + Math.sin(ua) * 5.0);
    B.add(new THREE.SphereGeometry(0.42, 10, 8), 'shrub', FX + Math.cos(ua) * 5.0, 0.95, FZ + Math.sin(ua) * 5.0);
  }
  const fountain = new THREE.Group();
  {
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      fountain.add(m);
      return m;
    };
    add(new THREE.CircleGeometry(2.86, 48).rotateX(-Math.PI / 2), water, FX, 0.44, FZ);
    add(new THREE.CircleGeometry(1.15, 32).rotateX(-Math.PI / 2), water, FX, 1.62, FZ);
    add(new THREE.CircleGeometry(0.56, 24).rotateX(-Math.PI / 2), water, FX, 2.52, FZ);
    add(new THREE.CylinderGeometry(1.26, 1.5, 1.18, 32, 1, true), jet, FX, 1.04, FZ); // water falling from the bowl
    add(new THREE.CylinderGeometry(0.63, 0.75, 0.86, 24, 1, true), jet, FX, 2.1, FZ);
    add(new THREE.CylinderGeometry(0.03, 0.07, 1.0, 8), jet, FX, 3.1, FZ); // the jet
    add(new THREE.SphereGeometry(0.22, 12, 8), jet, FX, 3.62, FZ);
    scene.add(fountain);
  }

  // ---- road, footpaths, kerbs, zebra crossing ----
  B.box(1200, 0.06, 14, 'asphalt', 0, 0, ROAD_Z);
  // (the school-side footpath and its kerb are cut where the drop-off and the buses' gate driveways cross them: the
  // driveway runs level out to the road there)
  const CUTS = [[DROP.x - 4.8, DROP.x + 4.8], [BUS_GATE.x - 4.8, BUS_GATE.x + 4.8]];
  const cut = (x) => CUTS.some(([a, b]) => x > a && x < b);
  B.box(1200, 0.16, 3, 'pavers', 0, 0, ROAD_Z + 8.5);
  {
    let a = -600;
    for (const [c0, c1] of [...CUTS, [600, 600]]) {
      B.box(c0 - a, 0.16, 3, 'pavers', (a + c0) / 2, 0, ROAD_Z - 8.5);
      a = c1;
    }
    for (const [c0, c1] of CUTS) B.box(c1 - c0, 0.066, 3.2, 'asphalt', (c0 + c1) / 2, 0, ROAD_Z - 8.4);
  }
  for (let x = -300; x < 300; x += 1) {
    for (const s of [-1, 1]) if (s > 0 || !cut(x + 0.5)) B.box(0.98, 0.22, 0.2, Math.round(x) % 2 ? 'kerbBlack' : 'kerbYellow', x + 0.5, 0, ROAD_Z + s * 7.05);
  }
  for (let x = -300; x < 300; x += 8) if (Math.abs(x) > 8) B.box(3.4, 0.01, 0.14, 'line', x, 0.065, ROAD_Z);
  for (let i = 0; i < 9; i++) B.box(0.5, 0.01, 11, 'line', -4 + i, 0.065, ROAD_Z);
  B.box(1200, 0.01, 0.12, 'line', 0, 0.065, ROAD_Z - 6.4);
  B.box(1200, 0.01, 0.12, 'line', 0, 0.065, ROAD_Z + 6.4);

  // ---- electric poles with sagging wires along the far footpath ----
  const poles = [];
  for (let x = -280; x <= 280; x += 36) {
    const z = ROAD_Z + 9.6;
    B.add(new THREE.BoxGeometry(0.28, 9, 0.22), 'concrete', x, 4.5, z, { sx: 1, sy: 1, sz: 1 });
    B.box(2.4, 0.1, 0.12, 'darkMetal', x, 8.4, z);
    for (const o of [-1, 0, 1]) B.cyl(0.05, 0.2, 'white', x + o * 1.0, 8.5, z, 6);
    poles.push(x);
    // street light arm
    B.box(0.06, 0.06, 2, 'darkMetal', x, 7.4, z - 1);
    B.box(0.5, 0.12, 0.25, 'lampOff', x, 7.3, z - 2);
  }
  for (let i = 0; i < poles.length - 1; i++) for (const o of [-1, 0, 1]) wire(B, new THREE.Vector3(poles[i] + o, 8.7, ROAD_Z + 9.6), new THREE.Vector3(poles[i + 1] + o, 8.7, ROAD_Z + 9.6), 0.8 + o * 0.05);

  // ---- campus lamps ----
  const lamps = [];
  for (let z = 12; z <= 25; z += 6.5) lamps.push([-5.2, z], [5.2, z]);
  // (the courtyard ones stand against the wings, between the doors, out of everyone's way)
  lamps.push([-26.3, 3.3], [26.3, 2.0], [-26.3, -17.4], [26.3, -14.7], [16, 22], [44, 22], [-46, 16], [-46, -26], [46, 0], [46, -28]);
  for (const [x, z] of lamps) {
    B.cyl(0.08, 4.4, 'darkMetal', x, 0, z, 8, { r2: 0.05 });
    B.box(0.6, 0.12, 0.3, 'darkMetal', x, 4.4, z);
    B.box(0.5, 0.04, 0.24, 'lampOff', x, 4.36, z);
  }

  // ---- library: single storey with a verandah and a Mangalore-tile hip roof; open inside ----
  const LX = -64, LZ = -44;
  B.box(22.4, 0.5, 14.4, 'plinth', LX, 0, LZ);
  const lw = (x0, x1, z0, z1, y0, y1, key = 'wall') => B.box(x1 - x0, y1 - y0, z1 - z0, key, (x0 + x1) / 2, y0, (z0 + z1) / 2);
  const X0 = LX - 11, X1 = LX + 11, Z0 = LZ - 6.5, Z1 = LZ + 3.5, T = 0.25;
  lw(X0, X1, Z0, Z0 + T, 0.5, 4.9); // back
  lw(X0, X0 + T, Z0, Z1, 0.5, 4.9); // sides
  lw(X1 - T, X1, Z0, Z1, 0.5, 4.9);
  // front wall: a doorway in the middle and four windows
  const wins = [-8, -4, 4, 8].map((x) => [LX + x - 0.9, LX + x + 0.9]);
  const door = [LX - 0.7, LX + 0.7];
  lw(X0, door[0], Z1 - T, Z1, 0.5, 1.6);
  lw(door[1], X1, Z1 - T, Z1, 0.5, 1.6);
  const cuts = [...wins, door].sort((a, b) => a[0] - b[0]);
  let from = X0;
  for (const [a, b] of cuts) {
    lw(from, a, Z1 - T, Z1, 1.6, 2.8);
    from = b;
  }
  lw(from, X1, Z1 - T, Z1, 1.6, 2.8);
  from = X0;
  for (const [a, b] of wins) {
    lw(from, a, Z1 - T, Z1, 2.8, 3.1);
    from = b;
  }
  lw(from, X1, Z1 - T, Z1, 2.8, 3.1);
  lw(X0, X1, Z1 - T, Z1, 3.1, 4.9);
  B.box(21.5, 0.03, 9.5, 'floorIn', LX, 0.5, LZ - 1.5);
  B.box(22.1, 0.3, 10.1, 'maroon', LX, 4.6, LZ - 1.5);
  B.box(21.5, 0.04, 9.5, 'white', LX, 4.56, LZ - 1.5); // ceiling
  for (let x = -9; x <= 9; x += 3.6) B.cyl(0.18, 4.1, 'white', LX + x, 0.5, LZ + 6.6, 14);
  B.add(hipRoof(24.5, 16, 4.2), 'rooftiles', LX, 4.9, LZ);
  B.box(24.2, 0.25, 15.7, 'wood', LX, 4.65, LZ); // eaves board
  // door frame and the two leaves, open inwards
  B.box(0.12, 2.42, 0.3, 'white', LX - 0.76, 0.5, Z1 - 0.12);
  B.box(0.12, 2.42, 0.3, 'white', LX + 0.76, 0.5, Z1 - 0.12);
  B.box(1.64, 0.12, 0.3, 'white', LX, 2.8, Z1 - 0.12);
  B.box(0.05, 2.28, 0.7, 'wood', LX - 0.68, 0.52, Z1 - 0.62);
  B.box(0.05, 2.28, 0.7, 'wood', LX + 0.68, 0.52, Z1 - 0.62);
  for (const [a, b] of wins) {
    const x = (a + b) / 2;
    B.box(1.8, 1.5, 0.04, 'glassClearLit', x, 1.6, LZ + 3.52);
    B.box(2.1, 0.1, 0.2, 'white', x, 1.5, LZ + 3.6);
    for (let k = 1; k < 12; k++) B.box(0.016, 1.45, 0.016, 'green', x - 0.9 + k * 0.15, 1.62, LZ + 3.6);
  }
  furnishLibrary(B);
  const estate = buildEstate(scene, B, M, rng);
  const libSign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), new THREE.MeshStandardMaterial({ map: signTexture('LIBRARY', { w: 1024, h: 138, font: '700 92px Georgia, serif' }), roughness: 0.5 }));
  libSign.position.set(LX, 4.0, LZ + 3.56);
  scene.add(libSign);

  // ---- bicycle stand ----
  const SX = -36, SZ = 22;
  for (const x of [-10, -5, 0, 5, 10]) {
    B.cyl(0.05, 2.6, 'darkMetal', SX + x, 0, SZ - 2, 6);
    B.cyl(0.05, 2.2, 'darkMetal', SX + x, 0, SZ + 2, 6);
  }
  B.add(new THREE.BoxGeometry(21, 0.06, 4.8), 'green', SX, 2.45, SZ, { rx: 0.1 });
  B.box(21, 0.06, 4.2, 'concrete', SX, 0, SZ);
  const wheel = new THREE.TorusGeometry(0.31, 0.022, 6, 18);
  const frameCols = ['darkMetal', 'maroon', 'blueRail', 'green', 'kerbBlack'];
  for (let i = 0; i < 34; i++) {
    const x = SX - 9.8 + i * 0.6;
    const col = frameCols[i % frameCols.length];
    const z = SZ + (i % 2 ? 0.15 : -0.15);
    B.add(wheel, 'rubber', x, 0.34, z - 0.55, { ry: Math.PI / 2 });
    B.add(wheel, 'rubber', x, 0.34, z + 0.55, { ry: Math.PI / 2 });
    B.add(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 5), col, x, 0.62, z, { rx: Math.PI / 2 });
    B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.75, 5), col, x, 0.52, z - 0.15, { rx: 0.55 });
    B.add(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 5), col, x, 0.5, z + 0.35, { rx: -0.6 });
    B.box(0.42, 0.03, 0.03, 'darkMetal', x, 0.98, z + 0.52, { ry: Math.PI / 2 });
    B.box(0.1, 0.05, 0.22, 'rubber', x, 0.88, z - 0.2);
  }

  // ---- benches around the courtyard and under trees ----
  const bench = (x, z, ry) => {
    B.box(1.8, 0.07, 0.42, 'wood', x, 0.45, z, { ry });
    B.box(1.8, 0.32, 0.06, 'wood', x - Math.sin(ry) * 0.2, 0.62, z - Math.cos(ry) * 0.2, { ry });
    B.box(0.12, 0.45, 0.4, 'concrete', x + Math.cos(ry) * 0.75, 0, z - Math.sin(ry) * 0.75, { ry });
    B.box(0.12, 0.45, 0.4, 'concrete', x - Math.cos(ry) * 0.75, 0, z + Math.sin(ry) * 0.75, { ry });
  };
  for (const [x, z, r] of [[-26.15, -20, Math.PI / 2], [-26.15, -11.2, Math.PI / 2], [26.15, -20, -Math.PI / 2], [26.15, -12.8, -Math.PI / 2], [10, 14.8, 0], [16, 14.8, 0], [56, 10, Math.PI / 2], [56, -2, Math.PI / 2], [56, -30, Math.PI / 2]]) bench(x, z, r);

  // ---- grass blades on the lawns ----
  const lawns = [
    [-24, 10, -7, 32], [-46, 26, -37, 42], [-36, 26, -24, 32], [7, 14, 14, 27], [24, 10, 46, 20], // front lawns
    [70, -60, 100, 0], // football pitch
  ];
  // weaker graphics chips skip the blades; the lawn texture alone still reads as grass from the tour cameras
  const grass = grassBlades(lawns, Math.max(1, P.grass || 0), rng);
  grass.visible = (P.grass || 0) > 0;
  scene.add(grass);

  return {
    ground,
    grass,
    lamps,
    estate,
    /** 0 = closed, 1 = open */
    setGate(open) {
      for (const { g, side } of gate) g.position.x = side * (0.02 + open * 7.6);
    },
    /** the barrier arm: 0 = down across the vehicle lane, 1 = up */
    setBoom(up) {
      boom.rotation.z = up * Math.PI * 0.47;
    },
    /** the fountain's water moves */
    update(t, minutes) {
      estate.update(t, minutes);
      if (water.userData.shader) water.userData.shader.uniforms.uTime.value = t;
      fountain.children[5].scale.y = 1 + Math.sin(t * 5.3) * 0.06;
    },
  };
}
