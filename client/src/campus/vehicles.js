import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './util.js';

/* School buses, cars and auto-rickshaws, with glossy paint and real glass. */

const paint = (color) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
const GLASS = new THREE.MeshPhysicalMaterial({ color: '#1a2228', roughness: 0.04, metalness: 0.2, envMapIntensity: 1.8 });
const RUBBER = new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.92 });
const RIM = new THREE.MeshStandardMaterial({ color: '#b9bdc2', roughness: 0.3, metalness: 0.9 });
const BLACK = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.6 });
const HEAD = new THREE.MeshStandardMaterial({ color: '#f4f2ea', emissive: '#fff4d6', emissiveIntensity: 0.2, roughness: 0.2 });
const TAIL = new THREE.MeshStandardMaterial({ color: '#8a1410', emissive: '#ff2a1a', emissiveIntensity: 0.4, roughness: 0.3 });

/** Builds one vehicle template: parts are merged per material, then the template is cloned. */
function template(parts) {
  const byMat = new Map();
  for (const [geo, mat, x, y, z, o = {}] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (o.rx) g.rotateX(o.rx);
    if (o.ry) g.rotateY(o.ry);
    if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat).push(g);
  }
  const group = new THREE.Group();
  for (const [mat, list] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

function wheels(parts, xs, zs, r = 0.45, w = 0.32) {
  const tyre = new THREE.CylinderGeometry(r, r, w, 20);
  const rim = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 16);
  for (const x of xs) for (const z of zs) {
    parts.push([tyre, RUBBER, x, r, z, { rz: Math.PI / 2 }]);
    parts.push([rim, RIM, x, r, z, { rz: Math.PI / 2 }]);
  }
}

/** the school's yellow bus, or (city: true) a red-and-cream city bus for the road traffic */
function busTemplate({ city = false } = {}) {
  const body = city ? '#e9e4d6' : '#f2a90c';
  const yellow = paint(body);
  const sideText = canvasTexture(1024, 96, (g) => {
    g.fillStyle = city ? '#b3261e' : '#f2a90c';
    g.fillRect(0, 0, 1024, 96);
    g.fillStyle = city ? '#f5f1e6' : '#6b1e14';
    g.font = '700 60px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(city ? 'CITY EXPRESS' : 'PROXYPILOT SCHOOL', 512, 50);
  });
  const signTex = canvasTexture(512, 96, (g) => {
    g.fillStyle = city ? '#151515' : '#f2a90c';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = city ? '#ff9a1f' : '#111';
    g.font = '800 64px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(city ? '47  CENTRAL' : 'SCHOOL BUS', 256, 52);
  });
  const side = new THREE.MeshStandardMaterial({ map: sideText, roughness: 0.4 });
  const sign = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 });
  const stripe = paint(city ? '#b3261e' : '#6b1e14');
  const parts = [
    [new RoundedBoxGeometry(2.45, 2.6, 9.6, 4, 0.14), yellow, 0, 0.55 + 1.3, 0],
    [new THREE.BoxGeometry(2.47, 0.95, 8.0), GLASS, 0, 2.3, -0.5],
    [new THREE.BoxGeometry(2.2, 1.1, 0.04), GLASS, 0, 2.25, 4.8, { rx: -0.08 }],
    [new THREE.BoxGeometry(2.2, 0.9, 0.04), GLASS, 0, 2.3, -4.81],
    [new THREE.BoxGeometry(2.48, 0.12, 9.62), stripe, 0, 1.55, 0],
    [new THREE.BoxGeometry(2.48, 0.08, 9.62), stripe, 0, 1.28, 0],
    [new THREE.BoxGeometry(2.5, 0.28, 0.25), BLACK, 0, 0.7, 4.85],
    [new THREE.BoxGeometry(2.5, 0.28, 0.25), BLACK, 0, 0.7, -4.85],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), HEAD, 0.85, 1.1, 4.82, { rx: Math.PI / 2 }],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), HEAD, -0.85, 1.1, 4.82, { rx: Math.PI / 2 }],
    [new THREE.BoxGeometry(0.3, 0.16, 0.05), TAIL, 0.9, 1.0, -4.82],
    [new THREE.BoxGeometry(0.3, 0.16, 0.05), TAIL, -0.9, 1.0, -4.82],
    [new THREE.BoxGeometry(0.05, 0.5, 0.3), BLACK, 1.35, 2.3, 4.6],
    [new THREE.BoxGeometry(0.05, 0.5, 0.3), BLACK, -1.35, 2.3, 4.6],
    [new THREE.BoxGeometry(2.3, 0.06, 9.2), yellow, 0, 3.17, 0],
  ];
  for (let z = -4.2; z <= 3.4; z += 1.25) parts.push([new THREE.BoxGeometry(2.49, 0.95, 0.07), yellow, 0, 2.3, z]);
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9d9d9', metalness: 0.9, roughness: 0.3 }); // one material, so the strips merge into one draw
  for (const s of [-1, 1]) for (let y = 2.0; y <= 2.6; y += 0.3) parts.push([new THREE.BoxGeometry(0.03, 0.025, 8.0), chrome, s * 1.26, y, -0.5]);
  parts.push([new THREE.PlaneGeometry(4.2, 0.4), side, 1.235, 1.84, -0.4, { ry: Math.PI / 2 }]);
  parts.push([new THREE.PlaneGeometry(4.2, 0.4), side, -1.235, 1.84, -0.4, { ry: -Math.PI / 2 }]);
  parts.push([new THREE.PlaneGeometry(1.6, 0.3), sign, 0, 2.95, 4.81]);
  parts.push([new THREE.PlaneGeometry(1.6, 0.3), sign, 0, 2.95, -4.81, { ry: Math.PI }]);
  wheels(parts, [1.05, -1.05], [3.0, -2.9], 0.5, 0.34);
  return template(parts);
}

function carTemplate(color) {
  const body = paint(color);
  const parts = [
    [new RoundedBoxGeometry(1.72, 0.72, 3.95, 4, 0.18), body, 0, 0.36 + 0.3, 0],
    [new RoundedBoxGeometry(1.52, 0.62, 2.1, 4, 0.18), GLASS, 0, 1.25, -0.25],
    [new RoundedBoxGeometry(1.5, 0.08, 1.9, 2, 0.04), body, 0, 1.57, -0.3],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), HEAD, 0.6, 0.78, 1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), HEAD, -0.6, 0.78, 1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), TAIL, 0.6, 0.82, -1.97],
    [new THREE.BoxGeometry(0.34, 0.12, 0.04), TAIL, -0.6, 0.82, -1.97],
    [new THREE.BoxGeometry(1.74, 0.16, 0.12), BLACK, 0, 0.45, 1.98],
    [new THREE.BoxGeometry(1.74, 0.16, 0.12), BLACK, 0, 0.45, -1.98],
  ];
  wheels(parts, [0.78, -0.78], [1.25, -1.3], 0.31, 0.2);
  return template(parts);
}

function autoTemplate() {
  const green = paint('#2f7d3a');
  const canopy = paint('#f0c419');
  const parts = [
    [new RoundedBoxGeometry(1.35, 0.9, 2.6, 3, 0.12), green, 0, 0.75, 0],
    [new RoundedBoxGeometry(1.42, 0.95, 2.2, 3, 0.2), canopy, 0, 1.65, -0.15],
    [new THREE.BoxGeometry(1.2, 0.55, 0.04), GLASS, 0, 1.55, 1.12, { rx: -0.2 }],
    [new THREE.BoxGeometry(0.2, 0.2, 0.05), HEAD, 0, 0.95, 1.31],
  ];
  wheels(parts, [0.6, -0.6], [-0.8], 0.24, 0.14);
  wheels(parts, [0], [0.9], 0.24, 0.14);
  return template(parts);
}

let driveStamp = 0;

/**
 * A vehicle that drives along a smooth route, slowing for curves and stopping at the end.
 * It never drives into another vehicle: if anything is in the way ahead it waits (see `blocked`).
 */
export class Driver {
  constructor(obj, dims) {
    this.obj = obj;
    this.dims = dims; // { len, wid }
    this.blocked = false;
    this.stamp = 0;
    this.curve = null;
    this.s = 0;
    this.len = 0;
    this.speed = 0;
    this.max = 8;
    this.active = false;
    this.onEnd = null;
    this.hold = false;
  }
  drive(points, { max = 8, onEnd = null, start = 0, reverse = false } = {}) {
    this.reverse = reverse; // reversing: the vehicle faces against its direction of travel
    this.curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], 0.06, p[1])), false, 'centripetal', 0.3);
    this.len = this.curve.getLength();
    this.s = 0;
    this.max = max;
    this.speed = start;
    this.onEnd = onEnd;
    this.active = true;
    this.stamp = ++driveStamp; // who set off first gets to go first at a stand-off
    this.obj.visible = true;
    this.place();
  }
  place() {
    const t = Math.min(1, this.s / this.len);
    const p = this.curve.getPointAt(t);
    const d = this.curve.getTangentAt(Math.min(0.999, t));
    this.obj.position.copy(p);
    this.obj.rotation.y = Math.atan2(d.x, d.z) + (this.reverse ? Math.PI : 0);
  }
  update(dt) {
    if (!this.active) return;
    const left = this.len - this.s;
    // ease off near the end and in tight bends
    const t = Math.min(0.999, this.s / this.len);
    const a = this.curve.getTangentAt(t);
    const b = this.curve.getTangentAt(Math.min(0.999, t + 6 / this.len));
    const bend = 1 - Math.max(0, a.dot(b));
    let target = this.max * (1 - Math.min(0.7, bend * 6));
    target = Math.min(target, Math.max(0.8, left * 0.6));
    if (this.hold || this.blocked) target = 0;
    else if (this.creep) target = Math.min(target, 0.7); // edging through people who won't clear the way
    // brake harder than we accelerate
    this.speed += (target - this.speed) * Math.min(1, dt * (target < this.speed ? 4 : 1.4));
    this.s = Math.min(this.len, this.s + this.speed * dt);
    this.place();
    if (left < 0.05) {
      this.active = false;
      this.speed = 0;
      const cb = this.onEnd;
      this.onEnd = null;
      cb?.(this);
    }
  }
}

export function buildVehicles(scene, rng, P) {
  const bus = busTemplate();
  const cityBus = busTemplate({ city: true });
  const cars = ['#f4f4f2', '#b8bcc0', '#a3201b', '#3b4249', '#1f4f8b', '#e9e6dc'].map(carTemplate);
  const auto = autoTemplate();
  const group = new THREE.Group();
  scene.add(group);

  // the school's own vehicles are moved by the school-day simulation
  const DIMS = { bus: { len: 9.8, wid: 2.55 }, car: { len: 4.0, wid: 1.8 }, auto: { len: 2.7, wid: 1.45 } };
  const make = (tpl, dims) => {
    const o = tpl.clone();
    o.visible = false;
    group.add(o);
    return new Driver(o, dims);
  };
  const fleet = {
    buses: [0, 1, 2, 3].map(() => make(bus, DIMS.bus)),
    autos: [0, 1, 2, 3, 4, 5].map(() => make(auto, DIMS.auto)),
    cars: [0, 1, 2].map((i) => make(cars[i], DIMS.car)),
    // parents' cars: they drop their children off in the morning at the drop-off canopy and collect them after school
    parents: [3, 4, 5, 0].map((i) => make(cars[i], DIMS.car)),
  };
  for (const d of [...fleet.autos, ...fleet.parents]) d.followBend = true;
  const fleetList = [...fleet.buses, ...fleet.autos, ...fleet.cars, ...fleet.parents];

  // through traffic on the main road (it waits while a school bus turns at the gate)
  const traffic = [];
  const lane = (dir) => (dir > 0 ? 49.5 : 56.5);
  for (let i = 0; i < P.traffic; i++) {
    const dir = i % 2 ? 1 : -1;
    // road traffic: cars, autos and red city buses (never a yellow school bus)
    const kind = i % 7 === 0 ? cityBus : i % 3 === 0 ? auto : cars[i % cars.length];
    const v = kind.clone();
    v.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    group.add(v);
    traffic.push({ obj: v, dir, x: rng() * 600 - 300, speed: kind === cityBus ? 7 : kind === auto ? 8 : 9 + rng() * 5, v: 0, z: lane(dir), dims: kind === cityBus ? DIMS.bus : kind === auto ? DIMS.auto : DIMS.car });
  }

  // ---- keeping vehicles apart ----
  // Every school vehicle looks ahead along its heading; anything whose footprint overlaps
  // the strip in front of it (parked or moving) makes it wait. Two vehicles that block
  // each other (at a merge) resolve it by who set off first.
  const others = [];
  const halfAlong = (o, fx, fz) => {
    // half the size of vehicle o measured along direction (fx, fz)
    const r = o.obj.rotation.y;
    const c = Math.abs(Math.sin(r) * fx + Math.cos(r) * fz);
    return (o.dims.len / 2) * c + (o.dims.wid / 2) * Math.sqrt(Math.max(0, 1 - c * c));
  };
  // separating-axis test between two rectangles on the ground: centre, unit forward, half length, half width
  const corners = (cx, cz, fx, fz, hl, hw, out) => {
    const sx = fz;
    const sz = -fx;
    let k = 0;
    for (const i of [-1, 1]) for (const j of [-1, 1]) {
      out[k++] = cx + fx * hl * i + sx * hw * j;
      out[k++] = cz + fz * hl * i + sz * hw * j;
    }
  };
  const A = new Float64Array(8);
  const Bc = new Float64Array(8);
  const sepOn = (ax, az) => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < 8; k += 2) {
      const pa = A[k] * ax + A[k + 1] * az;
      const pb = Bc[k] * ax + Bc[k + 1] * az;
      if (pa < a0) a0 = pa;
      if (pa > a1) a1 = pa;
      if (pb < b0) b0 = pb;
      if (pb > b1) b1 = pb;
    }
    return a1 < b0 || b1 < a0;
  };
  const boxesTouch = (afx, afz, bfx, bfz) => !(sepOn(afx, afz) || sepOn(afz, -afx) || sepOn(bfx, bfz) || sepOn(bfz, -bfx));
  /** the vehicle in d's way: anything that the strip it is about to drive over would touch */
  const blocker = (d) => {
    const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0); // look where it's going
    const fx = Math.sin(r);
    const fz = Math.cos(r);
    const p = d.obj.position;
    const ahead = 1.6 + d.speed * 0.9;
    // (round a tight loop, like the drop-off's, the strip ahead follows the bend it's driving, a box every
    // metre and a half: a straight strip would cut across the loop into the lane going the other way)
    if (d.followBend && d.curve) return bendBlocker(d, fx, fz, ahead);
    // the vehicle's footprint stretched forward by the stopping distance (plus a little elbow room)
    corners(p.x + fx * (ahead / 2), p.z + fz * (ahead / 2), fx, fz, d.dims.len / 2 + ahead / 2, d.dims.wid / 2 + 0.3, A);
    for (const o of others) {
      if (o === d || !o.obj.visible) continue;
      const rx = o.obj.position.x - p.x;
      const rz = o.obj.position.z - p.z;
      const along = rx * fx + rz * fz;
      if (along <= 0) continue; // only what's in front
      const ro = o.obj.rotation.y;
      const ofx = Math.sin(ro);
      const ofz = Math.cos(ro);
      corners(o.obj.position.x, o.obj.position.z, ofx, ofz, o.dims.len / 2, o.dims.wid / 2, Bc);
      if (boxesTouch(fx, fz, ofx, ofz)) {
        d.blockGap = along - halfAlong(o, fx, fz) - d.dims.len / 2;
        return o;
      }
    }
    return null;
  };

  const bendBlocker = (d, fx, fz, ahead) => {
    const p = d.obj.position;
    // its own front half, then boxes along the route ahead
    const boxes = [{ x: p.x + fx * (d.dims.len / 4), z: p.z + fz * (d.dims.len / 4), fx, fz, hl: d.dims.len / 4 + 0.1 }];
    for (const q of ahead_(d, d.dims.len / 2 + 0.75, d.dims.len / 2 + ahead, 1.5)) boxes.push({ x: q.x, z: q.z, fx: q.fx, fz: q.fz, hl: 0.8 });
    for (const o of others) {
      if (o === d || !o.obj.visible) continue;
      const rx = o.obj.position.x - p.x;
      const rz = o.obj.position.z - p.z;
      const along = rx * fx + rz * fz;
      if (along <= 0) continue; // only what's in front
      const ro = o.obj.rotation.y;
      const ofx = Math.sin(ro);
      const ofz = Math.cos(ro);
      corners(o.obj.position.x, o.obj.position.z, ofx, ofz, o.dims.len / 2, o.dims.wid / 2, Bc);
      for (const b of boxes) {
        corners(b.x, b.z, b.fx, b.fz, b.hl, d.dims.wid / 2 + 0.3, A);
        if (boxesTouch(b.fx, b.fz, ofx, ofz)) {
          d.blockGap = along - halfAlong(o, fx, fz) - d.dims.len / 2;
          return o;
        }
      }
    }
    return null;
  };

  // people on foot: a vehicle stops for anyone in the strip ahead of it, and publishes that strip
  // (its "zone") so people about to step into it wait for it to pass
  let pedestrians = () => [];
  const zones = [];
  const bodies = [];
  // points along the road a vehicle is about to drive (its own route, so it looks round the bend it's taking)
  const _p = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const ahead = (d, from, to, step) => {
    const out = [];
    if (!d.curve) return out;
    for (let s = from; s <= to + 0.001; s += step) {
      const u = Math.min(1, (d.s + s) / d.len);
      d.curve.getPointAt(u, _p);
      d.curve.getTangentAt(Math.min(0.999, u), _t);
      out.push({ x: _p.x, z: _p.z, fx: _t.x, fz: _t.z });
      if (u >= 1) break;
    }
    return out;
  };
  const ahead_ = (d, from, to, step) => ahead(d, from, to, step);
  const pedBlock = (d) => {
    const reach = d.dims.len / 2 + 1.2 + d.speed * 0.7;
    const half = d.dims.wid / 2 + 0.45;
    const pts = ahead(d, d.dims.len / 2 - 0.2, reach, 0.8);
    if (!pts.length) return false;
    const px = d.obj.position.x;
    const pz = d.obj.position.z;
    const R = reach + 2;
    // (and anyone right beside it, where its side or tail would brush them as it turns)
    const r0 = d.obj.rotation.y;
    const bx = Math.sin(r0);
    const bz = Math.cos(r0);
    for (const list of pedestrians()) {
      for (const a of list) {
        if (!a.active || a.pos.y > 0.3) continue;
        const rx = a.pos.x - px;
        const rz = a.pos.z - pz;
        if (rx > R || rx < -R || rz > R || rz < -R) continue;
        if (Math.abs(rx * bx + rz * bz) < d.dims.len / 2 + 0.2 && Math.abs(rx * bz - rz * bx) < d.dims.wid / 2 + 0.35) return true;
        for (const p of pts) {
          const dx = a.pos.x - p.x;
          const dz = a.pos.z - p.z;
          if (Math.abs(dx * p.fx + dz * p.fz) < 0.5 && Math.abs(dx * p.fz - dz * p.fx) < half) return true;
        }
      }
    }
    return false;
  };

  let gateBusy = false;
  let dropBusy = false;
  let busGate = null; // x of the buses' gate while a bus turns in or out there (else null)
  return {
    group,
    fleet,
    setGateBusy(b) {
      gateBusy = b;
    },
    /** a bus is turning in or out at the buses' gate at x (null: nobody is) — the road traffic waits */
    setBusGateBusy(x) {
      busGate = x;
    },
    /** a car or an auto is turning in or out at the drop-off gate (the road traffic waits) */
    setDropBusy(b) {
      dropBusy = b;
    },
    /** who's on foot (lists of people, checked by the vehicles) */
    setPedestrians(fn) {
      pedestrians = fn;
    },
    /** the strips in front of moving school vehicles (shared with the people) */
    zones,
    /** every school vehicle on show, as a box people walk round */
    bodies,
    /** true while a school vehicle is turning in or out through the gate (people on foot wait) */
    gateTurning() {
      // only while one is actually across the footpath in the gateway (or its nose is about to be)
      for (const d of fleetList) {
        if (!d.active || !d.obj.visible) continue;
        const p = d.obj.position;
        if (Math.abs(p.x) > 16 || p.z < 36 || p.z > 53) continue;
        const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0);
        const fx = Math.sin(r);
        const fz = Math.cos(r);
        const hl = d.dims.len / 2;
        const hw = d.dims.wid / 2 + 0.4;
        const front = hl + (d.speed > 0.3 ? 2.5 : 0.6);
        for (const [u, v] of [[front, hw], [front, -hw], [-hl, hw], [-hl, -hw], [0, hw], [0, -hw]]) {
          const x = p.x + fx * u + fz * v;
          const z = p.z + fz * u - fx * v;
          if (Math.abs(x) < 7.5 && z > 43.4 && z < 46.9) return true;
        }
      }
      return false;
    },
    /** true while a vehicle is about to pass (or passing) under the barrier arm inside the gate */
    nearBoom() {
      for (const d of fleetList) {
        if (!d.active || !d.obj.visible) continue;
        const p = d.obj.position;
        if (Math.abs(p.x) > 20 || p.z < 30 || p.z > 56) continue;
        const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0);
        const fx = Math.sin(r);
        const fz = Math.cos(r);
        const hl = d.dims.len / 2;
        const hw = d.dims.wid / 2;
        for (const [u, v] of [[hl + 7, 0], [hl + 3.5, 0], [hl, hw], [hl, -hw], [0, 0], [-hl, hw], [-hl, -hw]]) {
          const x = p.x + fx * u + fz * v;
          const z = p.z + fz * u - fx * v;
          if (x > -0.4 && x < 8 && z > 39.6 && z < 42.4) return true;
        }
      }
      return false;
    },
    /** true when no moving road traffic (either way) is about to pass x — a school vehicle waits for that before pulling out */
    roadClear(x) {
      for (const t of traffic) {
        if (t.v < 0.5) continue; // (traffic already waiting for us is fine)
        const ahead = (x - t.x) * t.dir; // how far it still has to go to reach x
        if (ahead > -6 && ahead < 38) return false;
      }
      return true;
    },
    /** true when no road traffic in the near lane is about to pass x (an auto waits for a gap before pulling out) */
    laneClear(x, school = false) {
      for (const t of traffic) if (t.dir > 0 && t.v > 0.5 && t.x > x - 30 && t.x < x + 8) return false; // (traffic already waiting for us is fine)
      // (and, if asked, the school's own cars and autos driving along the near lane)
      if (school) for (const d of fleetList) if (d.active && d.obj.visible && d.obj.position.z > 47.6 && Math.sin(d.obj.rotation.y) > 0.5 && d.obj.position.x > x - 30 && d.obj.position.x < x + 8) return false;
      return true;
    },
    /** true when no vehicle is within r metres of (x, z) — used before a vehicle sets off onto the road */
    clearAt(x, z, r = 9) {
      for (const d of fleetList) if (d.obj.visible && Math.hypot(d.obj.position.x - x, d.obj.position.z - z) < r) return false;
      for (const t of traffic) if (Math.hypot(t.x - x, t.z - z) < r) return false;
      return true;
    },
    /** footprints of every vehicle on show (for tests) */
    footprints() {
      const out = [];
      const add = (o, name) => o.obj.visible && out.push({ name, x: o.obj.position.x, z: o.obj.position.z, r: o.obj.rotation.y, len: o.dims.len, wid: o.dims.wid });
      fleet.buses.forEach((d, i) => add(d, 'bus' + i));
      fleet.autos.forEach((d, i) => add(d, 'auto' + i));
      fleet.cars.forEach((d, i) => add(d, 'car' + i));
      fleet.parents.forEach((d, i) => add(d, 'parent' + i));
      traffic.forEach((t, i) => add(t, 'traffic' + i));
      return out;
    },
    update(dt) {
      others.length = 0;
      for (const d of fleetList) others.push(d);
      for (const t of traffic) others.push(t);
      for (const d of fleetList) d.blockedBy = d.active ? blocker(d) : null;
      for (const d of fleetList) {
        const b = d.blockedBy;
        // a stand-off (each in the other's way): the one that set off first edges on, if there's room
        const byVehicle = Boolean(b) && !(b.blockedBy === d && d.stamp < b.stamp && d.blockGap > 1.5);
        const byPeople = d.active && !byVehicle && pedBlock(d);
        // (it takes a moment of nobody in the way to forget it was waiting, so people keep holding back)
        d.pedWait = byPeople ? (d.pedWait || 0) + dt : Math.max(0, (d.pedWait || 0) - dt * 0.5);
        // after a few seconds of waiting for people it edges forward slowly, and they make way
        d.creep = byPeople && d.pedWait > 5;
        d.blocked = byVehicle || (byPeople && !d.creep);
      }
      // zones in front of moving school vehicles, for the people on foot
      zones.length = 0;
      for (const d of fleetList) {
        // vehicles that are moving, or have waited a while for people to pass (then the people hold back
        // and let it go); people may walk past one that's just standing in a queue
        if (!d.active || !d.obj.visible || (d.speed < 0.4 && !(d.pedWait > 2))) continue;
        const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0);
        const moving = d.speed > 0.3;
        zones.push({ x: d.obj.position.x, z: d.obj.position.z, fx: Math.sin(r), fz: Math.cos(r), back: -d.dims.len / 2 - 0.3, front: d.dims.len / 2 + 1.2, half: d.dims.wid / 2 + 1.5, path: d.dims.wid / 2 + 0.45, nose: d.dims.len / 2 - 0.6, moving });
        // and short strips along the bend it's about to drive: anyone standing in them steps aside
        for (const p of ahead(d, d.dims.len / 2 + 1.0, d.dims.len / 2 + 1.0 + 4 + d.speed * 1.2, 2.4)) {
          zones.push({ x: p.x, z: p.z, fx: p.fx, fz: p.fz, back: -1.6, front: 1.6, half: d.dims.wid / 2 + 1.5, path: d.dims.wid / 2 + 0.45, nose: -9, moving });
        }
      }
      for (const d of fleetList) d.update(dt);
      bodies.length = 0;
      for (const d of fleetList) {
        if (!d.obj.visible) continue;
        const r = d.obj.rotation.y;
        bodies.push({ x: d.obj.position.x, z: d.obj.position.z, fx: Math.sin(r), fz: Math.cos(r), hl: d.dims.len / 2, hw: d.dims.wid / 2 });
      }
      // keep a safe gap to the vehicle ahead in the same lane and stop for turning buses
      for (const t of traffic) {
        let want = t.speed * (Math.abs(t.x) < 25 ? 0.6 : 1);
        // stop at the line before the gate while a school vehicle turns in or out
        const stopLine = t.dir > 0 ? -22 : 22;
        const toLine = (stopLine - t.x) * t.dir;
        if (gateBusy && toLine > 0 && toLine < 16) want = Math.min(want, toLine * 0.7);
        // (and at the drop-off gate, further down the road)
        const dropLine = t.dir > 0 ? -72 : -40;
        const toDrop = (dropLine - t.x) * t.dir;
        if (dropBusy && toDrop > 0 && toDrop < 16) want = Math.min(want, toDrop * 0.7);
        // (and at the buses' gate)
        if (busGate !== null) {
          const toBus = (busGate - t.dir * 20 - t.x) * t.dir;
          if (toBus > 0 && toBus < 16) want = Math.min(want, toBus * 0.7);
        }
        for (const o of traffic) {
          if (o === t || o.dir !== t.dir) continue;
          const gap = (o.x - t.x) * t.dir - (o.dims.len + t.dims.len) / 2; // bumper to bumper
          if (gap > -2 && gap < 10) want = Math.min(want, Math.max(0, (gap - 2.5) * 1.5));
        }
        // school vehicles pulling out onto the road, or waiting on it
        for (const d of fleetList) {
          if (!d.obj.visible) continue;
          const dz = Math.abs(d.obj.position.z - t.z);
          if (dz > halfAlong(d, 0, 1) + t.dims.wid / 2 + 0.3) continue;
          const gap = (d.obj.position.x - t.x) * t.dir - halfAlong(d, 1, 0) - t.dims.len / 2;
          if (gap > -t.dims.len && gap < 14) want = Math.min(want, Math.max(0, (gap - 2.5) * 1.5));
        }
        t.v += (want - t.v) * Math.min(1, dt * 2);
        t.x += t.dir * t.v * dt;
        if (t.x > 320) t.x = -320;
        if (t.x < -320) t.x = 320;
        t.obj.position.set(t.x, 0.06, t.z);
      }
    },
  };
}
