import * as THREE from 'three';
import { Tree, TreePreset } from './vendor/ez-tree/index.js';
import { CAMPUS } from './grounds.js';
import { OVAL, ESTATE_CLEAR } from './estate.js';
import { simplifyGeometry } from './lod.js';

/*
  Trees: real branching trees with bark and leaf textures (EZ-Tree, MIT licence),
  generated once per species and drawn many times with instancing.
  Coconut palms line the drive, broad shade trees stand around the grounds,
  and clipped bushes edge the buildings.
*/

const SPECIES = [
  { key: 'neem', preset: 'Ash Medium', height: [10, 13], seed: 11, leafTint: '#cfe3a6', barkTint: '#bfae9a' },
  { key: 'banyan', preset: 'Oak Large', height: [13, 17], seed: 7, leafTint: '#b9d39a', barkTint: '#a89a8a' },
  { key: 'peepal', preset: 'Aspen Medium', height: [9, 12], seed: 23, leafTint: '#d7e8a0', barkTint: '#c4b6a6' },
  { key: 'ashoka', preset: 'Oak Medium', height: [8, 11], seed: 41, leafTint: '#a9c98a', barkTint: '#b0a090' },
  { key: 'bush', preset: 'Bush 1', height: [1.4, 2.2], seed: 5, leafTint: '#bcd79a' },
  { key: 'bush2', preset: 'Bush 2', height: [1.1, 1.8], seed: 9, leafTint: '#c7dc9c' },
];

function makeVariant(spec, far = false, leafScale = 1.25) {
  const t = new Tree();
  const json = JSON.parse(JSON.stringify(TreePreset[spec.preset]));
  json.seed = spec.seed;
  if (spec.leafTint) json.leaves.tint = new THREE.Color(spec.leafTint).getHex();
  const bush = spec.key.startsWith('bush');
  // far trees: fewer, bigger leaves and simpler branches (they are only a few pixels tall)
  json.leaves.count = Math.max(2, Math.round(json.leaves.count * (bush ? 0.85 : far ? 0.36 : leafScale)));
  if (far) {
    json.leaves.size *= 1.7;
    for (const lvl of Object.keys(json.branch.sections)) json.branch.sections[lvl] = Math.max(3, Math.round(json.branch.sections[lvl] * 0.4));
    for (const lvl of Object.keys(json.branch.segments)) json.branch.segments[lvl] = Math.max(3, Math.round(json.branch.segments[lvl] * 0.6));
  }
  if (spec.barkTint && json.bark) json.bark.tint = new THREE.Color(spec.barkTint).getHex();
  t.loadFromJson(json);
  t.branchesMesh.geometry.computeBoundingBox();
  t.leavesMesh.geometry.computeBoundingBox();
  const box = t.leavesMesh.geometry.boundingBox.clone().union(t.branchesMesh.geometry.boundingBox);
  return { tree: t, height: box.max.y - box.min.y };
}

// ---------- coconut palm ----------
function palmGeometries(L, rng, spots) {
  const trunkMat = new THREE.MeshStandardMaterial({ map: L.tex('palmbark_color.jpg'), roughness: 0.95 });
  trunkMat.map.repeat.set(1, 6);
  const frondMat = new THREE.MeshStandardMaterial({ map: L.tex('frond.png'), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, color: '#d8e6b0' });
  const nutMat = new THREE.MeshStandardMaterial({ color: '#6f6a2c', roughness: 0.7 });
  const trunks = [];
  const fronds = [];
  const nuts = [];
  for (const [x, z] of spots) {
    const h = 8 + rng() * 4;
    const lean = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize().multiplyScalar(0.6 + rng() * 1.2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x + lean.x * 0.3, h * 0.35, z + lean.z * 0.3),
      new THREE.Vector3(x + lean.x * 0.8, h * 0.7, z + lean.z * 0.8),
      new THREE.Vector3(x + lean.x, h, z + lean.z),
    ]);
    const tg = new THREE.TubeGeometry(curve, 14, 0.2, 8);
    // taper the trunk and flare the base
    const p = tg.attributes.position;
    const uv = tg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = uv.getX(i);
      const c = curve.getPoint(t);
      const k = (t < 0.06 ? 1.6 - t * 10 : 1) * (1 - t * 0.35);
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, p.getY(i), c.z + (p.getZ(i) - c.z) * k);
    }
    tg.computeVertexNormals();
    trunks.push(tg);
    const top = curve.getPoint(1);
    const n = 15;
    for (let f = 0; f < n; f++) {
      const len = 4 + rng() * 1.4;
      const g = new THREE.PlaneGeometry(1.6, len, 1, 10);
      g.translate(0, len / 2, 0);
      const pos = g.attributes.position;
      const droop = 0.55 + rng() * 0.35;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = y / len;
        const ang = (f < 4 ? 0.25 : droop) * t * 1.9; // young fronds stand up, old ones droop
        pos.setXYZ(i, pos.getX(i) * (1 - t * 0.2), Math.sin(Math.PI / 2 - ang) * y * 0.75, Math.cos(Math.PI / 2 - ang) * y * 0.9 + pos.getX(i) * 0.15 * t);
      }
      g.rotateX(0.12 + (f < 4 ? 0 : 0.3));
      g.rotateY((f / n) * Math.PI * 2 + rng() * 0.3);
      g.translate(top.x, top.y - 0.2, top.z);
      g.computeVertexNormals();
      fronds.push(g);
    }
    for (let c = 0; c < 6; c++) {
      const a = (c / 6) * Math.PI * 2;
      const s = new THREE.SphereGeometry(0.17, 8, 6);
      s.translate(top.x + Math.cos(a) * 0.32, top.y - 0.5 - (c % 2) * 0.15, top.z + Math.sin(a) * 0.32);
      nuts.push(s);
    }
  }
  return { trunks, fronds, nuts, trunkMat, frondMat, nutMat };
}

export function buildTrees(scene, L, rng, { P, merge }) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- where things grow ----
  const spots = { neem: [], banyan: [], peepal: [], ashoka: [], bush: [], bush2: [] };
  const { x0, x1, z0, z1 } = CAMPUS;
  // a row of ashoka trees just inside the compound wall
  for (let x = x0 + 4; x <= x1 - 4; x += 9) {
    const xr = x + rng() * 1.5;
    // keep the gate and the buses' entry lane along the front wall clear
    if (Math.abs(x) > 14 && !(x > 10 && x < 54)) spots.ashoka.push([xr, z1 - 3.5]);
    if ((x - x0) % 18 < 9) spots.ashoka.push([x + rng() * 1.5, z0 + 3.5]);
  }
  for (let z = z0 + 8; z <= z1 - 8; z += z < -80 ? 22 : 10) {
    spots.neem.push([x0 + 4 + rng() * 2, z]);
    spots.neem.push([x1 - 4 - rng() * 2, z]);
  }
  // big shade trees
  [[-46, 34], [-70, -20], [-82, 30], [-56, -68], [60, 34], [116, 34], [60, -76], [-86, -64]].forEach((p) => spots.banyan.push(p));
  [[26, -64], [-76, 14], [-44, -6], [50, -58], [120, 0], [32, 6]].forEach((p) => spots.peepal.push(p));
  // shade trees round the cricket ground (none in front of the pavilion), and along the paths behind the school
  for (let a = 0; a < 360; a += 24) {
    const t = (a * Math.PI) / 180;
    const r = 60 + ((a * 7) % 5);
    const x = OVAL.x + Math.cos(t) * r;
    const z = OVAL.z + Math.sin(t) * r;
    if (z > -78 && Math.abs(x) < 26) continue;
    spots[a % 48 ? 'neem' : 'banyan'].push([x, z]);
  }
  for (const x of [-38, -22, 22, 38]) spots.ashoka.push([x, -36.8]);
  // bushes along the buildings and the drive
  for (let z = 10; z <= 27; z += 3.2) {
    spots.bush.push([-9.6 + rng() * 0.3, z]);
    spots.bush2.push([9.6 + rng() * 0.3, z]);
  }
  for (let x = -34; x <= 34; x += 3.4) if (Math.abs(x) > 8 && Math.abs(Math.abs(x) - 27.2) > 0.5) spots.bush[x % 2 ? 'push' : 'push']([x, 9.4]);
  for (let z = -22; z <= 6; z += 3.4) {
    spots.bush2.push([-38.2, z]);
    spots.bush2.push([38.2, z]);
  }
  // a green belt round the outside of the compound wall, and an avenue along the far side of the main road
  for (let z = z0 + 2; z < z1 - 4; z += 11) {
    spots[(z / 11) % 2 < 1 ? 'neem' : 'peepal'].push([x0 - 7 - rng() * 1.5, z + rng() * 3]);
    spots[(z / 11) % 2 < 1 ? 'peepal' : 'neem'].push([x1 + 7 + rng() * 1.5, z + rng() * 3]);
  }
  for (let x = x0 - 4; x < x1 + 4; x += 11) spots[(x / 11) % 2 < 1 ? 'neem' : 'banyan'].push([x + rng() * 3, z0 - 7 - rng() * 1.5]);
  for (let x = -190; x <= 190; x += 36) spots.neem.push([x, 61.6]); // (half-way between the electric poles)
  // trees in the town beyond the road and around the campus
  const farCount = P.farTrees;
  for (let i = 0; i < farCount; i++) {
    const a = rng() * Math.PI * 2;
    const r = 120 + Math.pow(rng(), 0.8) * 640;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (x > x0 - 8 && x < x1 + 8 && z > z0 - 8 && z < 70) continue;
    if (z > 42 && z < 66) continue; // keep the main road clear
    spots[rng() < 0.5 ? 'neem' : rng() < 0.5 ? 'peepal' : 'banyan'].push([x, z]);
  }

  // ---- generate each species once, then instance it ----
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const windMats = [];
  const inCampus = ([x, z]) => x > x0 - 6 && x < x1 + 6 && z > z0 - 6 && z < z1 + 6;
  // (nothing grows on the pool deck, the courts, the pitch, the running track or the paths)
  const clear = ([x, z]) =>
    !ESTATE_CLEAR.some(([a0, b0, a1, b1]) => x > a0 - 2 && x < a1 + 2 && z > b0 - 2 && z < b1 + 2) &&
    Math.hypot(x - OVAL.x, z - OVAL.z) > OVAL.r + 3 &&
    !(x > 60 && x < 110 && z > -77 && z < 17) &&
    !(Math.abs(x - 57) < 3 && z < -38 && z > -97) &&
    !(Math.abs(x + 47.5) < 3 && z < -38 && z > -64) &&
    !(Math.abs(z + 62) < 3 && x < -45 && x > -75) &&
    !(x > -67 && x < -45 && z > 21 && z < 46) && // (the drop-off loop and its canopy)
    !(x > 41 && x < 57 && z > 33 && z < 50) && // (the bus gate and where the buses swing through it)
    !(x > -50 && x < -22 && Math.abs(z - 26) < 2.5); // (and the children's path from it)
  for (const k of Object.keys(spots)) spots[k] = spots[k].filter((p) => !inCampus(p) || clear(p));
  const lists = [];
  const farMeshes = [];
  for (const spec of SPECIES) {
    const all = spots[spec.key];
    lists.push([spec, all.filter(inCampus), false]);
    const far = all.filter((p) => !inCampus(p));
    if (far.length) lists.push([spec, far, true]);
  }
  for (const [spec, list, far] of lists) {
    if (!list.length) continue;
    const { tree, height } = makeVariant(spec, far, P.nearLeaves);
    simplifyGeometry(tree.branchesMesh.geometry, far ? P.branch * 0.6 : P.branch, 0.03);
    const parts = [tree.branchesMesh, tree.leavesMesh];
    for (const part of parts) {
      const inst = new THREE.InstancedMesh(part.geometry, part.material, list.length);
      list.forEach(([x, z], i) => {
        const r2 = rng();
        const target = spec.height[0] + r2 * (spec.height[1] - spec.height[0]);
        const s = target / height;
        q.setFromAxisAngle(up, ((x * 13.7 + z * 7.1) % 6.28));
        m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * (0.92 + ((x + z) % 1) * 0.1), s));
        inst.setMatrixAt(i, m4);
      });
      if (far) farMeshes.push(inst);
      inst.castShadow = !far;
      inst.receiveShadow = !far;
      group.add(inst);
    }
    windMats.push(tree.leavesMesh.material);
    if (window.__campusDebug) console.log('tree', spec.key, far ? 'far' : 'near', list.length, 'x', (tree.branchesMesh.geometry.index.count + tree.leavesMesh.geometry.index.count) / 3, 'tris');
  }

  // ---- coconut palms along the drive and by the gate ----
  const palmSpots = [];
  // palms frame the drive; the north end is kept clear for buses and cars turning in
  for (let z = 14; z <= 26; z += 6) palmSpots.push([-11.6, z]);
  palmSpots.push([11.6, 14], [11.6, 20]); // (the third one would stand where buses turn out of their bays)
  palmSpots.push([-20, 30], [-40, 30], [30, 14], [40, 15], [60, 38], [-72, 38], [-88, 40], [118, 40]);
  const palm = palmGeometries(L, rng, palmSpots);
  const meshes = [
    new THREE.Mesh(merge(palm.trunks), palm.trunkMat),
    new THREE.Mesh(merge(palm.fronds), palm.frondMat),
    new THREE.Mesh(merge(palm.nuts), palm.nutMat),
  ];
  meshes.forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  return {
    group,
    /** the governor hides the distant trees on slow chips */
    setFar(on) {
      for (const m of farMeshes) m.visible = on;
    },
    update(t) {
      for (const m of windMats) {
        const sh = m.userData.shader;
        if (sh) sh.uniforms.uTime.value = t;
      }
    },
  };
}
