import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/*
  Collects thousands of static pieces (walls, slabs, columns, sills...) and merges them
  into one mesh per material, so the GPU draws the whole school in a few calls.
  Texture coordinates are projected from world space, so plaster, brick and tiles keep
  their real-world size on every surface.
*/

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Batch {
  constructor(materials) {
    this.M = materials;
    this.groups = new Map();
  }

  /** add any geometry, positioned by (x, y, z) and optional rotations / scale */
  add(geo, key, x = 0, y = 0, z = 0, { ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.groups.has(key)) this.groups.set(key, []);
    this.groups.get(key).push(g);
    return this;
  }

  /** box standing on y (bottom face at y) */
  box(w, h, d, key, x, y, z, o) {
    return this.add(new THREE.BoxGeometry(w, h, d), key, x, y + h / 2, z, o);
  }

  /** box between two corner points on the ground plan */
  span(x0, z0, x1, z1, y, h, key) {
    return this.box(Math.abs(x1 - x0), h, Math.abs(z1 - z0), key, (x0 + x1) / 2, y, (z0 + z1) / 2);
  }

  cyl(r, h, key, x, y, z, seg = 16, o = {}) {
    return this.add(new THREE.CylinderGeometry(o.r2 ?? r, r, h, seg), key, x, y + h / 2, z, o);
  }

  /** world-space box projection for texture coordinates */
  static projectUV(g, scale) {
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const nx = Math.abs(nor.getX(i));
      const ny = Math.abs(nor.getY(i));
      const nz = Math.abs(nor.getZ(i));
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (ny >= nx && ny >= nz) uv.setXY(i, x / scale, z / scale);
      else if (nx >= nz) uv.setXY(i, z / scale, y / scale);
      else uv.setXY(i, x / scale, y / scale);
    }
    uv.needsUpdate = true;
  }

  build(parent, { castShadow = true, receiveShadow = true, noCast = [] } = {}) {
    const meshes = {};
    for (const [key, list] of this.groups) {
      const mat = this.M[key] ?? key;
      const geo = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (mat.userData?.uvScale) Batch.projectUV(geo, mat.userData.uvScale);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow && !noCast.includes(key);
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      meshes[key] = mesh;
    }
    this.groups.clear();
    return meshes;
  }
}
