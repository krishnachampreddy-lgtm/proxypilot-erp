import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

/*
  Level of detail. A student seen from across the courtyard doesn't need 28,000
  triangles, and a twig doesn't need 8 sides. meshoptimizer removes triangles where
  it changes the shape least; vertices (and the skinning on them) stay as they are,
  only the triangle list gets shorter.
*/

export const lodReady = MeshoptSimplifier.ready;

/** Keeps about `ratio` of the triangles. Works in place and returns the geometry. */
export function simplifyGeometry(geo, ratio, error = 0.06) {
  if (!geo?.index || ratio >= 0.999 || !MeshoptSimplifier.supported) return geo;
  const pa = geo.attributes.position;
  let pos = pa.array;
  if (pa.isInterleavedBufferAttribute || !(pos instanceof Float32Array) || pa.itemSize !== 3 || pa.normalized) {
    pos = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      pos[i * 3] = pa.getX(i);
      pos[i * 3 + 1] = pa.getY(i);
      pos[i * 3 + 2] = pa.getZ(i);
    }
  }
  const idx = geo.index.array instanceof Uint32Array ? geo.index.array : new Uint32Array(geo.index.array);
  const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3);
  try {
    const [out] = MeshoptSimplifier.simplify(idx, pos, 3, target, error);
    const small = pa.count < 65535 ? new Uint16Array(out) : out;
    geo.setIndex(new THREE.BufferAttribute(small, 1));
    geo.clearGroups();
  } catch {
    /* keep the full mesh */
  }
  return geo;
}

/** Drops the vertices no triangle uses any more (after simplifying a static mesh). */
export function compactGeometry(geo) {
  if (!geo?.index || !MeshoptSimplifier.supported) return geo;
  const idx = new Uint32Array(geo.index.array);
  let remap, unique;
  try {
    [remap, unique] = MeshoptSimplifier.compactMesh(idx); // rewrites idx in place
  } catch {
    return geo;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const n = attr.itemSize;
    const src = attr.array;
    const dst = new src.constructor(unique * n);
    for (let v = 0; v < attr.count; v++) {
      const r = remap[v];
      if (r === 0xffffffff) continue;
      for (let k = 0; k < n; k++) dst[r * n + k] = src[v * n + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, n, attr.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(unique < 65535 ? new Uint16Array(idx) : idx, 1));
  out.computeBoundingSphere();
  return out;
}
