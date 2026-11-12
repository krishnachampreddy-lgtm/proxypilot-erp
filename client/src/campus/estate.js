import * as THREE from 'three';
import { canvasTexture, signTexture } from './util.js';
import { chhatri } from './school.js';
import { crestTexture } from './crest.js';

/*
  The grounds behind the school, the part that makes it a great school: a cricket oval with its pavilion
  and scoreboard, practice nets, a 25 m swimming pool with its aquatic centre, two tennis courts, an
  auditorium, an open-air amphitheatre, a formal garden with a lily pool, and the paths and lamps that
  join them up. Everything is built in the same ivory and red sandstone as the main building.
*/

export const OVAL = { x: 0, z: -116, r: 52, rope: 47 };
export const POOL = { x: -72, z: -101, w: 25, d: 12.5, deck: 0.9 };
export const AUDITORIUM = { x: 82, z: -112 };
export const AMPHI = { x: 27, z: -47.5 };
export const GARDEN = { x: -29, z: -50 };
export const TENNIS = [{ x: 116.7, z: -58 }, { x: 116.7, z: -22 }];
/** places nothing else (trees) may stand: [x0, z0, x1, z1] */
export const ESTATE_CLEAR = [
  [-92, -114, -52, -80], // pool, deck and aquatic centre
  [106, -78, 126, -3], // tennis
  [62, -130, 102, -92], // auditorium and its forecourt
  [-42, -59, -16, -41], // garden
  [13, -61, 41, -40], // amphitheatre
  [-14, -66, 14, -40], // pavilion and its path
  [-56, -56, 60, -37], // the path behind the main block
  [40, -92, 53, -63], // the practice nets
];

const disc = (r, seg = 64) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
const ring = (r0, r1, seg = 96) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2);

export function buildEstate(scene, B, M, rng) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // ---- materials of its own ----
  // the outfield: mown in broad stripes
  const stripes = canvasTexture(512, 512, (g, w, h) => {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#5f8f3c' : '#6f9f45';
      g.fillRect(0, (i * h) / 16, w, h / 16 + 1);
    }
    for (let k = 0; k < 4000; k++) {
      g.fillStyle = `rgba(${30 + Math.random() * 40},${60 + Math.random() * 50},20,0.15)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping;
  stripes.repeat.set(4, 4);
  const outfield = std({ map: stripes, roughness: 0.95 });
  const square = std({ color: '#86a858', roughness: 0.95 });
  const clay = std({ color: '#c9a66d', roughness: 0.95 });
  const netMat = std({ color: '#1f3b2a', roughness: 0.9, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const astro = std({ color: '#3f8a4a', roughness: 0.9 });
  const tennisBlue = std({ color: '#2f5f8f', roughness: 0.65 });
  const tennisGreen = std({ color: '#3d7a52', roughness: 0.7 });
  const fence = std({ color: '#1e2a22', roughness: 0.8, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const poolTile = std({ color: '#4fa9d0', roughness: 0.35 });
  const laneRed = std({ color: '#c62828', roughness: 0.5 });
  const laneWhite = std({ color: '#f4f4f0', roughness: 0.5 });
  const seatBlue = std({ color: '#203a66', roughness: 0.5 });
  const flower = [std({ color: '#d63a4a', roughness: 0.8 }), std({ color: '#f2b134', roughness: 0.8 }), std({ color: '#f5f0e6', roughness: 0.8 }), std({ color: '#c05aa8', roughness: 0.8 })];
  const water = std({ color: '#2a86b4', roughness: 0.05, metalness: 0.25, transparent: true, opacity: 0.82 });
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
          float a = sin(p.x * 1.9 + uTime * 1.1) + sin(p.y * 1.4 - uTime * 0.9) + sin((p.x + p.y) * 3.3 + uTime * 1.6) * 0.5;
          float b = cos(p.y * 2.1 + uTime * 1.0) + cos(p.x * 1.3 - uTime * 0.8) + cos((p.x - p.y) * 3.7 + uTime * 1.4) * 0.5;
          normal = normalize(normal + (viewMatrix * vec4(a * 0.04, 0.0, b * 0.04, 0.0)).xyz);
        }`
      );
  };
  const extras = new THREE.Group();
  scene.add(extras);
  const plane = (w, h, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    extras.add(m);
    return m;
  };
  const sign = (text, w, h, x, y, z, ry = 0, o = {}) => plane(w, h, std({ map: signTexture(text, { w: 1024, h: Math.round((1024 * h) / w), bg: '#a9583f', fg: '#f3d888', font: '700 80px Georgia, serif', ...o }), roughness: 0.5 }), x, y, z, ry);
  const crestMat = std({ map: crestTexture(), transparent: true, alphaTest: 0.4, roughness: 0.5 });

  // ---- paths and lamps joining it all up ----
  const path = (x0, z0, x1, z1, w = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.add(new THREE.BoxGeometry(len, 0.08, w), 'pavers', (x0 + x1) / 2, 0.04, (z0 + z1) / 2, { ry: -Math.atan2(z1 - z0, x1 - x0) });
    B.add(new THREE.BoxGeometry(len, 0.1, 0.18), 'maroon', (x0 + x1) / 2, 0.05, (z0 + z1) / 2 + ((w / 2) * (x1 - x0)) / len, { ry: -Math.atan2(z1 - z0, x1 - x0) });
    B.add(new THREE.BoxGeometry(len, 0.1, 0.18), 'maroon', (x0 + x1) / 2, 0.05, (z0 + z1) / 2 - ((w / 2) * (x1 - x0)) / len, { ry: -Math.atan2(z1 - z0, x1 - x0) });
  };
  path(-47.5, -40, 47.5, -40); // behind the main block, from the library path to the playground path
  path(-46, -41.5, -46, -34);
  path(46, -41.5, 46, -34);
  path(0, -41.5, 0, -55.5, 4); // to the pavilion
  path(-47.5, -41.5, -47.5, -62); // west, to the pool
  path(-49, -62, -72, -62);
  path(-72, -63.5, -72, -83);
  path(47.5, -40, 57, -40); // east, to the auditorium
  path(57, -41.5, 57, -95);
  path(55.5, -95, 70, -95);
  const lamps = [];
  for (const [x, z] of [[-30, -42.2], [-12, -42.2], [12, -42.2], [30, -42.2], [-2.6, -50], [2.6, -50], [-49.8, -52], [-60, -64], [-74.3, -73], [59.3, -55], [59.3, -75], [59.3, -92]]) {
    B.cyl(0.08, 4.4, 'darkMetal', x, 0, z, 8, { r2: 0.05 });
    B.box(0.6, 0.12, 0.3, 'darkMetal', x, 4.4, z);
    B.box(0.5, 0.04, 0.24, 'lampOff', x, 4.36, z);
    lamps.push([x, z]);
  }

  // ---- the cricket oval ----
  {
    const { x, z, r, rope } = OVAL;
    B.add(disc(r, 128), outfield, x, 0.025, z);
    B.add(ring(rope - 0.12, rope + 0.12, 160), 'line', x, 0.04, z); // the boundary rope
    B.add(new THREE.PlaneGeometry(26, 30).rotateX(-Math.PI / 2), square, x, 0.03, z);
    // the pitch runs east-west, square of the pavilion
    B.box(20.12, 0.02, 3.05, clay, x, 0.03, z);
    for (const s of [-1, 1]) {
      const cx = x + s * 10.06;
      B.box(0.06, 0.01, 3.66, 'line', cx - s * 1.22, 0.05, z); // popping crease
      B.box(0.06, 0.01, 2.64, 'line', cx, 0.05, z); // bowling crease
      B.box(1.22, 0.01, 0.06, 'line', cx - s * 0.61, 0.05, z - 1.32);
      B.box(1.22, 0.01, 0.06, 'line', cx - s * 0.61, 0.05, z + 1.32);
      for (const dz of [-0.11, 0, 0.11]) B.cyl(0.018, 0.71, 'oak', cx, 0.04, z + dz, 6);
      B.box(0.03, 0.02, 0.24, 'oak', cx, 0.75, z);
      // sight screens beyond the rope at each end
      const sx = x + s * (rope + 2.4);
      B.box(0.15, 4.2, 9, 'white', sx, 0.5, z);
      for (const dz of [-4, 0, 4]) B.box(0.18, 0.5, 0.18, 'darkMetal', sx, 0, z + dz);
    }
  }
  // ---- the pavilion: two storeys of ivory and sandstone, a balcony under a tiled roof, steps for the crowd ----
  {
    const PX = 0;
    const PZ = -59;
    const W = 22;
    B.box(W + 0.6, 0.6, 8.6, 'maroon', PX, 0, PZ);
    B.box(W, 3.2, 6.6, 'white', PX, 0.6, PZ + 0.6); // the dressing rooms
    for (let k = 0; k < 6; k++) {
      const wx = PX - W / 2 + 2 + k * 3.6;
      if (k === 2 || k === 3) B.box(1.2, 2.3, 0.08, 'doorWood', wx + (k === 2 ? 1.0 : -1.0), 0.6, PZ - 2.76);
      else B.box(1.4, 1.2, 0.06, 'glass', wx, 1.6, PZ - 2.76);
    }
    B.box(W + 0.4, 0.3, 8.0, 'maroon', PX, 3.8, PZ); // first floor slab
    B.box(W, 2.9, 4.2, 'white', PX, 4.1, PZ + 1.8); // members' room at the back
    for (let k = 0; k < 6; k++) B.box(1.6, 1.6, 0.06, 'glass', PX - W / 2 + 2 + k * 3.6, 4.8, PZ - 0.32);
    for (let k = 0; k <= 7; k++) {
      const cx = PX - W / 2 + 0.3 + (k * (W - 0.6)) / 7;
      B.cyl(0.16, 2.9, 'white', cx, 4.1, PZ - 3.7, 12);
      B.box(0.36, 0.2, 0.36, 'maroon', cx, 4.1, PZ - 3.7);
    }
    B.box(W, 0.12, 0.18, 'maroon', PX, 4.95, PZ - 3.75); // balcony rail
    for (let bx = PX - W / 2 + 0.5; bx < PX + W / 2 - 0.3; bx += 0.32) B.box(0.05, 0.75, 0.05, 'white', bx, 4.2, PZ - 3.75);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 18; k++) B.box(0.42, 0.42, 0.4, seatBlue, PX - 8.5 + k, 4.1, PZ - 2.9 + row * 0.75);
    // the roof: a hipped tile roof with a gable over the middle, the crest and the clock in it
    const roof = new THREE.BufferGeometry();
    {
      const w2 = W / 2 + 0.8;
      const d0 = PZ - 4.4;
      const d1 = PZ + 4.4;
      const h = 2.2;
      const pts = [[-w2, 0, d0], [w2, 0, d0], [w2, 0, d1], [-w2, 0, d1], [-w2 + 4.4, h, PZ], [w2 - 4.4, h, PZ]];
      const tri = [0, 4, 5, 0, 5, 1, 3, 5, 4, 3, 2, 5, 0, 3, 4, 1, 5, 2];
      roof.setAttribute('position', new THREE.Float32BufferAttribute(tri.flatMap((i) => pts[i]), 3));
      roof.computeVertexNormals();
      roof.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(tri.length * 2), 2));
    }
    B.add(roof, 'rooftiles', PX, 7.0, 0);
    B.box(W + 1.8, 0.25, 9.0, 'maroon', PX, 6.8, PZ);
    const gable = new THREE.Shape();
    gable.moveTo(-3.2, 0);
    gable.lineTo(3.2, 0);
    gable.lineTo(0, 2.6);
    gable.closePath();
    B.add(new THREE.ExtrudeGeometry(gable, { depth: 0.4, bevelEnabled: false }), 'white', PX, 7.05, PZ - 4.6);
    plane(1.5, 1.5, crestMat, PX, 7.95, PZ - 4.63, Math.PI);
    sign('PAVILION', 5, 0.5, PX, 3.3, PZ - 2.78, Math.PI);
    // the crowd's steps in front
    for (let s = 0; s < 3; s++) B.box(W + 0.6, 0.3 * (s + 1), 0.9, 'maroon', PX, 0, PZ - 5.6 + s * 0.9);
    // flag poles either side
    for (const s of [-1, 1]) {
      B.cyl(0.06, 9, 'white', PX + s * 13.2, 0, PZ - 4.5, 8);
      B.add(new THREE.SphereGeometry(0.12, 8, 6), 'gold', PX + s * 13.2, 9.05, PZ - 4.5);
    }
  }
  // ---- the scoreboard and the practice nets ----
  {
    const sx = -36;
    const sz = -153;
    const ry = Math.atan2(OVAL.x - sx, OVAL.z - sz);
    B.box(7.2, 1.2, 1.2, 'maroon', sx, 0, sz, { ry });
    B.box(7.0, 3.6, 0.6, 'white', sx, 1.2, sz, { ry });
    B.box(7.4, 0.3, 0.9, 'maroon', sx, 4.8, sz, { ry });
    const board = canvasTexture(1024, 512, (g, w, h) => {
      g.fillStyle = '#151a17';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f3d888';
      g.font = '700 54px Georgia, serif';
      g.fillText('HOUSE CUP FINAL', 270, 72);
      g.fillStyle = '#ffffff';
      g.font = '700 120px Arial, sans-serif';
      g.fillText('187 / 4', 80, 250);
      g.font = '600 48px Arial, sans-serif';
      g.fillText('OVERS  18.2', 80, 340);
      g.fillText('TARGET  203', 80, 410);
      g.fillStyle = '#f3d888';
      g.fillText('BATTING  TAGORE HOUSE', 520, 250);
      g.fillStyle = '#9fb6d8';
      g.fillText('REQ. RATE  9.0', 520, 340);
    });
    const m = plane(6.2, 3.0, std({ map: board, roughness: 0.6 }), sx + Math.sin(ry) * 0.31, 2.9, sz + Math.cos(ry) * 0.31, ry);
    m.castShadow = false;
    // two practice nets outside the rope, north-east
    for (let k = 0; k < 2; k++) {
      const nx = 44 + k * 4.2;
      const nz = -78;
      B.box(3.2, 0.03, 22, astro, nx, 0.02, nz);
      B.box(3.05, 0.035, 2.0, clay, nx, 0.025, nz - 9);
      for (const s of [-1, 1]) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 3.2), netMat);
        wall.position.set(nx + s * 1.6, 1.6, nz + 1);
        wall.rotation.y = Math.PI / 2;
        extras.add(wall);
        for (let p = 0; p <= 4; p++) B.cyl(0.05, 3.3, 'darkMetal', nx + s * 1.6, 0, nz - 9 + p * 5, 6);
      }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), netMat);
      back.position.set(nx, 1.6, nz - 9);
      extras.add(back);
      for (const dz of [-0.11, 0, 0.11]) B.cyl(0.018, 0.71, 'oak', nx + dz, 0.04, nz - 8.2, 6);
    }
  }

  // ---- the swimming pool and the aquatic centre ----
  {
    const { x, z, w, d, deck } = POOL;
    const DW = 36;
    const DD = 22;
    // the deck is raised: the pool sits within it (the basin floor at ground level)
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const dx0 = x - DW / 2;
    const dx1 = x + DW / 2;
    const dz0 = z - DD / 2;
    const dz1 = z + DD / 2;
    const deckBox = (a0, b0, a1, b1) => B.box(a1 - a0, deck, b1 - b0, 'maroon', (a0 + a1) / 2, 0, (b0 + b1) / 2);
    deckBox(dx0, dz0, dx1, z0);
    deckBox(dx0, z1, dx1, dz1);
    deckBox(dx0, z0, x0, z1);
    deckBox(x1, z0, dx1, z1);
    const top = (a0, b0, a1, b1) => B.box(a1 - a0, 0.03, b1 - b0, 'tiles', (a0 + a1) / 2, deck, (b0 + b1) / 2);
    top(dx0, dz0, dx1, z0 - 0.4);
    top(dx0, z1 + 0.4, dx1, dz1);
    top(dx0, z0 - 0.4, x0 - 0.4, z1 + 0.4);
    top(x1 + 0.4, z0 - 0.4, dx1, z1 + 0.4);
    // white coping round the edge, blue tiles in the basin, lane lines on the floor
    B.box(w + 0.8, 0.06, 0.4, 'white', x, deck, z0 - 0.2);
    B.box(w + 0.8, 0.06, 0.4, 'white', x, deck, z1 + 0.2);
    B.box(0.4, 0.06, d, 'white', x0 - 0.2, deck, z);
    B.box(0.4, 0.06, d, 'white', x1 + 0.2, deck, z);
    B.box(w, 0.02, d, poolTile, x, 0.02, z);
    B.box(w, deck, 0.02, poolTile, x, 0, z0 + 0.01);
    B.box(w, deck, 0.02, poolTile, x, 0, z1 - 0.01);
    B.box(0.02, deck, d, poolTile, x0 + 0.01, 0, z);
    B.box(0.02, deck, d, poolTile, x1 - 0.01, 0, z);
    const lanes = 6;
    for (let k = 0; k < lanes; k++) {
      const lz = z0 + ((k + 0.5) * d) / lanes;
      B.box(w - 3, 0.01, 0.22, 'charcoal', x, 0.04, lz);
      B.box(0.22, 0.01, 1.0, 'charcoal', x0 + 1.6, 0.04, lz);
      B.box(0.22, 0.01, 1.0, 'charcoal', x1 - 1.6, 0.04, lz);
      // starting blocks at the east end
      B.box(0.6, 0.35, 0.5, 'white', x1 + 0.55, deck, lz);
      B.box(0.06, 0.05, 0.4, 'charcoal', x1 + 0.3, deck + 0.35, lz);
    }
    // floating lane ropes
    for (let k = 1; k < lanes; k++) {
      const lz = z0 + (k * d) / lanes;
      for (let s = 0; s < 25; s++) B.add(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 8), s % 4 < 2 ? laneRed : laneWhite, x0 + 0.5 + s, deck - 0.12, lz, { rz: Math.PI / 2 });
    }
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), water);
    surf.position.set(x, deck - 0.12, z);
    extras.add(surf);
    // steps up to the deck, and loungers
    for (let s = 0; s < 3; s++) B.box(6, 0.3 * (s + 1), 0.4, 'maroon', x, 0, dz1 + 1.2 - s * 0.4);
    for (let k = 0; k < 6; k++) {
      const lx = dx0 + 3 + k * 2.2;
      B.box(0.7, 0.3, 1.9, 'whiteMetal', lx, deck, dz0 + 1.6);
      B.add(new THREE.BoxGeometry(0.7, 0.06, 0.7), 'blind', lx, deck + 0.55, dz0 + 0.9, { rx: -0.6 });
    }
    // the aquatic centre along the north side
    const AX = x;
    const AZ = dz1 + 4.6;
    B.box(28.6, 0.5, 6.6, 'maroon', AX, 0, AZ);
    B.box(28, 3.8, 6, 'white', AX, 0.5, AZ);
    B.box(29, 0.3, 7, 'maroon', AX, 4.3, AZ);
    for (let k = 0; k < 7; k++) B.box(1.6, 1.0, 0.06, 'glass', AX - 12 + k * 4, 2.3, AZ + 3.01);
    B.box(2.2, 2.6, 0.08, 'doorWood', AX, 0.5, AZ + 3.02);
    for (const s of [-1, 1]) B.box(1.4, 2.4, 0.06, 'doorWood', AX + s * 9, 0.5, AZ - 3.02);
    sign('AQUATIC CENTRE', 8, 0.8, AX, 3.75, AZ + 3.05, 0);
    chhatri(B, AX - 11.5, 4.6, AZ, 0.6);
    chhatri(B, AX + 11.5, 4.6, AZ, 0.6);
  }

  // ---- the tennis courts ----
  for (const t of TENNIS) {
    B.box(17, 0.04, 34, tennisGreen, t.x, 0.02, t.z);
    B.box(10.97, 0.05, 23.77, tennisBlue, t.x, 0.025, t.z);
    const L = 23.77 / 2;
    const W = 10.97 / 2;
    const S = 8.23 / 2;
    for (const [w, d, dx, dz] of [[10.97, 0.05, 0, -L], [10.97, 0.05, 0, L], [0.05, 23.77, -W, 0], [0.05, 23.77, W, 0], [0.05, 23.77, -S, 0], [0.05, 23.77, S, 0], [8.23, 0.05, 0, -6.4], [8.23, 0.05, 0, 6.4], [0.05, 12.8, 0, 0]]) B.box(w, 0.01, d, 'line', t.x + dx, 0.05, t.z + dz);
    // the net
    const net = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.9), netMat);
    net.position.set(t.x, 0.47, t.z);
    extras.add(net);
    B.box(12.8, 0.06, 0.04, 'white', t.x, 0.9, t.z);
    for (const s of [-1, 1]) B.cyl(0.05, 1.07, 'darkMetal', t.x + s * 6.4, 0, t.z, 6);
    // the fence round the court
    for (const [w, dx, dz, ry] of [[17, 0, -17, 0], [17, 0, 17, 0], [34, -8.5, 0, Math.PI / 2], [34, 8.5, 0, Math.PI / 2]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), fence);
      f.position.set(t.x + dx, 1.6, t.z + dz);
      f.rotation.y = ry;
      extras.add(f);
    }
    for (let k = 0; k <= 8; k++) {
      B.cyl(0.05, 3.3, 'darkMetal', t.x - 8.5, 0, t.z - 17 + k * 4.25, 6);
      B.cyl(0.05, 3.3, 'darkMetal', t.x + 8.5, 0, t.z - 17 + k * 4.25, 6);
    }
    for (let k = 1; k < 4; k++) {
      B.cyl(0.05, 3.3, 'darkMetal', t.x - 8.5 + k * 4.25, 0, t.z - 17, 6);
      B.cyl(0.05, 3.3, 'darkMetal', t.x - 8.5 + k * 4.25, 0, t.z + 17, 6);
    }
  }

  // ---- the auditorium: a long hall under a barrel roof, a portico of six columns with a pediment ----
  {
    const { x, z } = AUDITORIUM;
    const W = 32;
    const D = 26;
    const H = 11;
    B.box(W + 1, 0.8, D + 1, 'maroon', x, 0, z);
    B.box(W, H, D, 'white', x, 0.8, z);
    for (let k = 0; k <= 8; k++) {
      B.box(0.6, H, 0.25, 'maroon', x - W / 2 + (k * W) / 8, 0.8, z - D / 2 - 0.1);
      B.box(0.25, H, 0.6, 'maroon', x - W / 2 - 0.1, 0.8, z - D / 2 + (k * D) / 8);
      B.box(0.25, H, 0.6, 'maroon', x + W / 2 + 0.1, 0.8, z - D / 2 + (k * D) / 8);
    }
    for (let k = 0; k < 8; k++) {
      for (const s of [-1, 1]) B.box(0.06, 3.2, 1.2, 'glass', x + s * (W / 2 + 0.02), 4.0, z - D / 2 + 1.6 + k * 3.2);
    }
    B.box(W + 1.2, 0.5, D + 1.2, 'maroon', x, 0.8 + H, z);
    const vault = new THREE.CylinderGeometry(W / 2 - 0.5, W / 2 - 0.5, D, 32, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2);
    B.add(vault, 'rooftiles', x, 0.8 + H + 0.5, z, { sy: 0.32 });
    // the portico on the north front
    const fz = z + D / 2;
    B.box(W - 4, 0.8, 5, 'maroon', x, 0, fz + 2.5);
    for (let s = 0; s < 3; s++) B.box(W - 6, 0.27 * (s + 1), 0.45, 'maroon', x, 0, fz + 5.6 - s * 0.45);
    for (let k = 0; k < 6; k++) {
      const cx = x - 10 + k * 4;
      B.cyl(0.42, 8.2, 'white', cx, 0.8, fz + 4.2, 16);
      B.box(1.0, 0.4, 1.0, 'maroon', cx, 0.8, fz + 4.2);
      B.box(1.0, 0.35, 1.0, 'white', cx, 9.0, fz + 4.2);
    }
    B.box(W - 3, 1.0, 5.6, 'white', x, 9.35, fz + 2.6);
    B.box(W - 2.6, 0.25, 6.0, 'maroon', x, 10.35, fz + 2.6);
    const ped = new THREE.Shape();
    ped.moveTo(-(W - 3) / 2, 0);
    ped.lineTo((W - 3) / 2, 0);
    ped.lineTo(0, 3.2);
    ped.closePath();
    B.add(new THREE.ExtrudeGeometry(ped, { depth: 0.6, bevelEnabled: false }), 'white', x, 10.6, fz + 4.8);
    plane(2.0, 2.0, crestMat, x, 11.9, fz + 5.42, 0);
    sign('AUDITORIUM', 9, 0.8, x, 9.85, fz + 5.42, 0);
    for (let k = 0; k < 3; k++) B.box(2.2, 3.4, 0.08, 'doorWood', x - 6 + k * 6, 0.8, fz + 0.02);
  }

  // ---- the amphitheatre: stone tiers round a stage, for assemblies, plays and the annual day ----
  {
    const { x, z } = AMPHI;
    const sector = (r0, r1, a0, a1) => {
      const s = new THREE.Shape();
      s.absarc(0, 0, r1, a0, a1, false);
      s.absarc(0, 0, r0, a1, a0, true);
      s.closePath();
      return s;
    };
    for (let k = 0; k < 8; k++) {
      const r0 = 5.6 + k * 0.9;
      const g = new THREE.ExtrudeGeometry(sector(r0, r0 + 0.9, 0.18, Math.PI - 0.18), { depth: 0.42 * (k + 1), bevelEnabled: false, curveSegments: 28 }).rotateX(-Math.PI / 2);
      B.add(g, k % 2 ? 'maroon' : 'plinth', x, 0, z);
    }
    // the stage: a half round of white stone, and a backdrop wall with an arch
    const stage = new THREE.Shape();
    stage.absarc(0, 0, 4.6, Math.PI, Math.PI * 2, false);
    stage.closePath();
    B.add(new THREE.ExtrudeGeometry(stage, { depth: 0.8, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2), 'white', x, 0, z);
    B.add(disc(5.5, 48), 'tiles', x, 0.03, z);
    B.box(11, 3.4, 0.45, 'white', x, 0, z + 4.9);
    B.box(11.4, 0.3, 0.6, 'maroon', x, 3.4, z + 4.9);
    B.box(11.2, 0.5, 0.6, 'maroon', x, 0, z + 4.9);
    const arc = new THREE.Shape();
    arc.absarc(0, 0, 2.2, 0, Math.PI, false);
    arc.absarc(0, 0, 1.9, Math.PI, 0, true);
    B.add(new THREE.ExtrudeGeometry(arc, { depth: 0.1, bevelEnabled: false, curveSegments: 20 }), 'maroon', x, 1.0, z + 4.62);
    plane(1.4, 1.4, crestMat, x, 2.05, z + 4.65, Math.PI);
  }

  // ---- the formal garden: four lawns round a lily pool, hedges, flower beds and topiary ----
  {
    const { x, z } = GARDEN;
    const W = 22;
    const D = 14;
    B.box(W, 0.06, D, 'maroon', x, 0, z);
    for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = x + qx * 5.75;
      const cz = z + qz * 3.75;
      B.box(9.5, 0.08, 5.5, 'courtOut', cx, 0.02, cz);
      B.box(5.2, 0.14, 2.0, 'dirt', cx, 0.03, cz);
      for (let f = 0; f < 34; f++) {
        const fx = cx - 2.4 + rng() * 4.8;
        const fz = cz - 0.85 + rng() * 1.7;
        B.add(new THREE.IcosahedronGeometry(0.11 + rng() * 0.06, 0), flower[f % 4], fx, 0.24, fz);
      }
      B.add(new THREE.SphereGeometry(0.55, 12, 9), 'shrub', cx + qx * 3.6, 0.6, cz + qz * 1.7);
      B.add(new THREE.CylinderGeometry(0.3, 0.22, 0.4, 10), 'maroon', cx + qx * 3.6, 0.2, cz + qz * 1.7);
    }
    // hedges round the outside, open in the middle of each side
    for (const s of [-1, 1]) {
      for (const half of [-1, 1]) {
        B.box(W / 2 - 1.2, 0.7, 0.55, 'shrub', x + half * (W / 4 + 0.6), 0, z + s * (D / 2 - 0.3));
        B.box(0.55, 0.7, D / 2 - 1.2, 'shrub', x + s * (W / 2 - 0.3), 0, z + half * (D / 4 + 0.6));
      }
    }
    // the lily pool in the middle, an octagon of sandstone
    B.add(new THREE.CylinderGeometry(2.2, 2.3, 0.45, 8, 1, true), 'maroon', x, 0.225, z);
    B.add(new THREE.TorusGeometry(2.25, 0.12, 4, 8).rotateX(Math.PI / 2), 'white', x, 0.46, z);
    const lily = new THREE.Mesh(new THREE.CircleGeometry(2.15, 8).rotateX(-Math.PI / 2), water);
    lily.position.set(x, 0.38, z);
    extras.add(lily);
    for (let k = 0; k < 7; k++) B.add(disc(0.18 + rng() * 0.1, 8), 'courtOut', x - 1.4 + rng() * 2.8, 0.4, z - 1.4 + rng() * 2.8);
    B.cyl(0.18, 0.9, 'white', x, 0.3, z, 10);
    B.add(new THREE.SphereGeometry(0.22, 10, 8), 'white', x, 1.25, z);
    for (const s of [-1, 1]) {
      B.box(1.8, 0.07, 0.42, 'wood', x + s * 8.5, 0.45, z, { ry: Math.PI / 2 });
      B.box(0.42, 0.45, 1.6, 'maroon', x + s * 8.5, 0, z);
    }
  }

  // ---- swimmers doing lengths (in the afternoon's swimming periods and at swim practice after school) ----
  const swim = (() => {
    const { x, z, w, d, deck } = POOL;
    const lanes = 6;
    const skin = std({ color: '#8f5e40', roughness: 0.6 });
    const suit = std({ color: '#16203d', roughness: 0.5 });
    const caps = std({ color: '#ffffff', roughness: 0.4 });
    const body = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8).scale(0.62, 0.13, 0.19), suit, lanes);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 12, 8), skin, lanes);
    const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(0.112, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), caps, lanes);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.06, 0.07).translate(0.25, 0, 0), skin, lanes * 2);
    const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.09, 0.09).translate(-0.27, 0, 0), skin, lanes * 2);
    const capColors = ['#c62828', '#ffffff', '#f2b134', '#1f5fbf', '#ffffff', '#c62828'].map((c) => new THREE.Color(c));
    for (let i = 0; i < lanes; i++) cap.setColorAt(i, capColors[i]);
    const all = [body, head, cap, arms, legs];
    for (const im of all) {
      im.frustumCulled = false;
      im.visible = false;
      extras.add(im);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const sx0 = x - w / 2 + 0.9;
    const span = w - 1.8;
    const swimmers = Array.from({ length: lanes }, (_, i) => ({ lane: z - d / 2 + ((i + 0.5) * d) / lanes, speed: 0.9 + ((i * 37) % 10) * 0.04, phase: (i * 0.37) % 1 }));
    const surface = deck - 0.12;
    return {
      update(t, on) {
        for (const im of all) im.visible = on;
        if (!on) return;
        swimmers.forEach((s, i) => {
          // up and down the length, turning at each wall
          const u = (t * s.speed) / span + s.phase;
          const k = u % 2;
          const fwd = k < 1;
          const along = fwd ? k : 2 - k;
          const sx = sx0 + along * span;
          const dir = fwd ? 1 : -1;
          const ry = fwd ? 0 : Math.PI;
          const bob = Math.sin(t * 6 + i) * 0.02;
          q.setFromEuler(e.set(Math.sin(t * 3 + i) * 0.12, ry, 0, 'YXZ'));
          m4.compose(p.set(sx, surface - 0.09 + bob, s.lane), q, one);
          body.setMatrixAt(i, m4);
          q.setFromEuler(e.set(0, ry, 0, 'YXZ'));
          m4.compose(p.set(sx + dir * 0.7, surface + 0.01 + bob, s.lane), q, one);
          head.setMatrixAt(i, m4);
          cap.setMatrixAt(i, m4);
          // freestyle: the arms windmill in turn, the legs flutter
          for (const side of [0, 1]) {
            const a = t * 3.2 * s.speed + i + side * Math.PI;
            q.setFromEuler(e.set(0, ry, -a, 'YXZ'));
            m4.compose(p.set(sx + dir * 0.5, surface - 0.07, s.lane + (side ? 0.19 : -0.19)), q, one);
            arms.setMatrixAt(i * 2 + side, m4);
            q.setFromEuler(e.set(0, ry, Math.sin(t * 9 + side * Math.PI) * 0.25, 'YXZ'));
            m4.compose(p.set(sx - dir * 0.55, surface - 0.12, s.lane + (side ? 0.08 : -0.08)), q, one);
            legs.setMatrixAt(i * 2 + side, m4);
          }
        });
        for (const im of all) im.instanceMatrix.needsUpdate = true;
      },
    };
  })();

  return {
    lamps,
    /** t: seconds; minutes: the school clock (the swimmers are in the pool in the afternoon) */
    update(t, minutes = 0) {
      if (water.userData.shader) water.userData.shader.uniforms.uTime.value = t;
      swim.update(t, (minutes > 12 * 60 + 52 && minutes < 14 * 60 + 47) || (minutes > 15 * 60 + 43 && minutes < 16 * 60 + 36));
    },
  };
}
