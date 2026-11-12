import * as THREE from 'three';
import { signTexture, canvasTexture } from './util.js';
import { crestTexture } from './crest.js';
import { CELLS } from './rooms.js';

/*
  The main school: a U-shaped, three-storey block around an assembly courtyard.
  Built the way Indian schools are actually built — classrooms with an open
  verandah corridor facing the courtyard, columns every 3.6 m, solid parapets with
  a painted railing, concrete sunshades (chajjas) over every outer window, window
  grills, wooden classroom doors, maroon floor bands and a terrace roof with water
  tanks and solar panels.
*/

export const FLOOR = 3.6;
export const PLINTH = 0.45;
export const FL = [PLINTH, PLINTH + FLOOR, PLINTH + FLOOR * 2];
export const ROOFY = PLINTH + FLOOR * 3; // 11.25
const D = 9; // block depth
const CW = 2.4; // corridor width
const CD = D - CW; // classroom depth

/** Places pieces in a block's own frame: u along the block, v from the outer wall (0) to the courtyard (D). */
export function frame(B, ox, oz, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const at = (u, v) => [ox + u * c + v * s, oz - u * s + v * c];
  return {
    at,
    theta,
    box(w, h, d, key, u, y, v, ry = 0) {
      const [x, z] = at(u, v);
      B.box(w, h, d, key, x, y, z, { ry: theta + ry });
    },
    add(geo, key, u, y, v, o = {}) {
      const [x, z] = at(u, v);
      B.add(geo, key, x, y, z, { ...o, ry: theta + (o.ry || 0) });
    },
  };
}

/** A real window: painted surround, green steel frame with mullions, glass, sill, grill and optional sunshade. */
function windowUnit(F, u, y, v, w, h, out, { chajja = false, grill = true, glass = 'glass' } = {}) {
  // `out` = +1 when the window faces +v, -1 when it faces -v
  const o = out;
  const surround = 0.12;
  const proj = 0.07;
  F.box(w + surround * 2, surround, proj, 'white', u, y + h, v + o * proj / 2); // lintel band
  F.box(w + surround * 2 + 0.1, 0.07, 0.2, 'white', u, y - 0.07, v + o * 0.1); // sill
  F.box(surround, h, proj, 'white', u - w / 2 - surround / 2, y, v + o * proj / 2);
  F.box(surround, h, proj, 'white', u + w / 2 + surround / 2, y, v + o * proj / 2);
  F.box(w, h, 0.02, glass, u, y, v + o * 0.01); // glass, set just in front of the wall
  // steel frame and mullions
  const fz = v + o * 0.035;
  F.box(w, 0.05, 0.05, 'green', u, y, fz);
  F.box(w, 0.05, 0.05, 'green', u, y + h - 0.05, fz);
  F.box(w, 0.04, 0.04, 'green', u, y + h * 0.68, fz);
  const panes = Math.max(2, Math.round(w / 0.55));
  for (let i = 0; i <= panes; i++) F.box(0.045, h, 0.05, 'green', u - w / 2 + (w * i) / panes, y, fz);
  if (grill) {
    const gz = v + o * 0.09;
    const bars = Math.round(w / 0.13);
    for (let i = 1; i < bars; i++) F.box(0.016, h - 0.06, 0.016, 'green', u - w / 2 + (w * i) / bars, y + 0.03, gz);
    F.box(w, 0.03, 0.02, 'green', u, y + h * 0.33, gz);
    F.box(w, 0.03, 0.02, 'green', u, y + h * 0.66, gz);
  }
  if (chajja) {
    F.box(w + 0.6, 0.09, 0.62, 'white', u, y + h + 0.18, v + o * 0.31);
    F.box(w + 0.6, 0.12, 0.05, 'white', u, y + h + 0.15, v + o * 0.6);
  }
}

// a column shaft (slightly tapered) and a turned baluster, shared by every block
const COLUMN = new THREE.CylinderGeometry(0.17, 0.2, 1, 16).scale(1, ROOFY - PLINTH - 0.32, 1);
const BALUSTER = (() => {
  const prof = [[0.001, 0], [0.06, 0], [0.06, 0.05], [0.035, 0.1], [0.065, 0.3], [0.035, 0.52], [0.055, 0.6], [0.055, 0.66], [0.001, 0.66]];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 6);
})();

/** a chhatri: an open domed pavilion on four sandstone columns, the crowning touch of Indian roofs */
export function chhatri(B, x, y, z, s = 1) {
  B.box(2.4 * s, 0.25 * s, 2.4 * s, 'maroon', x, y, z);
  for (const dx of [-0.85, 0.85]) for (const dz of [-0.85, 0.85]) B.cyl(0.1 * s, 1.5 * s, 'maroon', x + dx * s, y + 0.25 * s, z + dz * s, 10);
  B.box(2.7 * s, 0.12 * s, 2.7 * s, 'white', x, y + 1.75 * s, z); // the eave
  B.cyl(0.9 * s, 0.25 * s, 'white', x, y + 1.87 * s, z, 20);
  B.add(new THREE.SphereGeometry(0.95 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'white', x, y + 2.12 * s, z, { sy: 1.15 });
  B.cyl(0.05 * s, 0.5 * s, 'gold', x, y + 3.15 * s, z, 6);
  B.add(new THREE.SphereGeometry(0.12 * s, 10, 8), 'gold', x, y + 3.6 * s, z);
}

/**
 * One block of the school, built hollow: real rooms behind real window and door openings,
 * partition walls, floor slabs and ceilings, and dog-leg staircases in cells of their own.
 * name: 'A' | 'B' | 'C' (see rooms.js for the cells along each block).
 */
function block(B, name, opts, rng, lit) {
  const { L, ox, oz, theta, corridorFrom = -L / 2, corridorTo = L / 2, endWalls = [true, true] } = opts;
  const F = frame(B, ox, oz, theta);
  const half = L / 2;
  const cells = CELLS[name];
  const top = (f) => (f < 2 ? FL[f + 1] : ROOFY);
  // a box between two corners in the block frame
  const wb = (u0, u1, v0, v1, y0, y1, key) => {
    if (u1 - u0 < 0.005 || v1 - v0 < 0.005 || y1 - y0 < 0.005) return;
    F.box(u1 - u0, y1 - y0, v1 - v0, key, (u0 + u1) / 2, y0, (v0 + v1) / 2);
  };
  const T = 0.22; // wall thickness
  const hollowAt = (u) => cells.some(([t, a, b]) => t !== 'solid' && u > a && u < b);

  F.box(L + 0.3, PLINTH, D + 0.3, 'plinth', 0, 0, D / 2);

  // ---- solid parts (behind the clock tower, the corners) ----
  for (const [t, a, b] of cells) if (t === 'solid') wb(a, b, 0, CD, PLINTH, ROOFY, 'wall');

  // ---- outer wall with window openings, and the windows themselves ----
  const winU = [];
  for (let u = -half + 1.8; u < half - 0.5; u += 3.6) winU.push(u);
  const runs = [];
  for (const [t, a, b] of cells) {
    if (t === 'solid') continue;
    const last = runs[runs.length - 1];
    if (last && Math.abs(last[1] - a) < 0.01) last[1] = b;
    else runs.push([a, b]);
  }
  for (let f = 0; f < 3; f++) {
    const y0 = FL[f];
    for (const [a, b] of runs) {
      wb(a, b, 0, T, y0, y0 + 0.9, 'wall');
      wb(a, b, 0, T, y0 + 2.4, top(f), 'wall');
      let from = a;
      for (const u of winU) {
        if (u - 1 < a - 0.01 || u + 1 > b + 0.01) continue;
        wb(from, u - 1, 0, T, y0 + 0.9, y0 + 2.4, 'wall');
        from = u + 1;
      }
      wb(from, b, 0, T, y0 + 0.9, y0 + 2.4, 'wall');
    }
  }
  for (const i of [1, 2]) F.box(L + 0.06, 0.32, 0.06, 'maroon', 0, FL[i] - 0.3, -0.03);
  F.box(L + 0.06, 0.5, 0.06, 'maroon', 0, ROOFY - 0.1, -0.03);
  for (let u = -half + 3.6; u <= half - 3.6 + 0.01; u += 7.2) F.box(0.4, ROOFY - PLINTH, 0.12, 'wallShade', u, PLINTH, -0.06); // pilasters
  for (let f = 0; f < 3; f++) {
    for (const u of winU) {
      const open = hollowAt(u);
      windowUnit(F, u, FL[f] + 0.9, 0, 2.0, 1.5, -1, { chajja: true, grill: false, glass: open ? (lit(f) ? 'glassClearLit' : 'glassClear') : lit(f) ? 'glassLit' : 'glass' });
    }
  }

  // ---- rooms and stairwells: partitions, slabs, floors, the corridor wall ----
  for (let ci = 0; ci < cells.length; ci++) {
    const [t, u0, u1] = cells[ci];
    if (t === 'solid') continue;
    const prev = cells[ci - 1];
    const next = cells[ci + 1];
    // partition / end walls (one tall wall through all three floors)
    if (!prev) {
      wb(u0, u0 + T, 0, CD, PLINTH, ROOFY, 'wall');
    } else if (prev[0] !== 'solid') wb(u0 - 0.1, u0 + 0.1, T, CD - T, PLINTH, ROOFY, 'wall');
    if (!next) wb(u1 - T, u1, 0, CD, PLINTH, ROOFY, 'wall');
    // slabs, floors and ceilings
    for (let f = 0; f < 3; f++) {
      if (f > 0) wb(u0, u1, t === 'stair' ? 5.0 : 0, CD, FL[f] - 0.2, FL[f], 'white');
      if (t === 'room' || f === 0) wb(u0 + 0.1, u1 - 0.1, T, CD - T, FL[f], FL[f] + 0.025, 'floorIn');
      else wb(u0 + 0.1, u1 - 0.1, 5.0, CD - T, FL[f], FL[f] + 0.025, 'kota');
    }
    wb(u0, u1, 0, CD, ROOFY - 0.2, ROOFY, 'white');
    if (t === 'stair') {
      stairwell(F, u0, u1, wb);
      for (let f = 0; f < 3; f++) wb(u0, u1, CD - T, CD, FL[f] + 2.7, top(f), 'wall');
      continue;
    }
    // the corridor wall of a room: a door and two windows on every floor
    const rc = (u0 + u1) / 2;
    const du = rc - 2.5;
    const dA = du - 0.51;
    const dB = du + 0.51;
    const w1 = [rc - 1.2, rc + 0.4];
    const w2 = [rc + 1.2, rc + 2.8];
    for (let f = 0; f < 3; f++) {
      const y = FL[f];
      const v0 = CD - T;
      wb(u0, dA, v0, CD, y, y + 0.95, 'wall');
      wb(dB, u1, v0, CD, y, y + 0.95, 'wall');
      for (const [a, b] of [[u0, dA], [dB, w1[0]], [w1[1], w2[0]], [w2[1], u1]]) wb(a, b, v0, CD, y + 0.95, y + 2.12, 'wall');
      for (const [a, b] of [[u0, w1[0]], [w1[1], w2[0]], [w2[1], u1]]) wb(a, b, v0, CD, y + 2.12, y + 2.2, 'wall');
      wb(u0, u1, v0, CD, y + 2.2, top(f), 'wall');
      doorFrame(F, du, y, CD);
      const isStory = opts.story && opts.story.u === rc && opts.story.floor === f;
      const g = isStory ? 'glassStory' : lit(f) ? 'glassClearLit' : 'glassClear';
      windowUnit(F, rc - 0.4, y + 0.95, CD, 1.6, 1.25, 1, { glass: g, grill: false });
      windowUnit(F, rc + 2.0, y + 0.95, CD, 1.6, 1.25, 1, { glass: g, grill: false });
      F.box(0.7, 0.22, 0.03, 'board', du, y + 2.42, CD + 0.03); // class name plate above the door
    }
  }

  // end walls with windows (into the end room or stairwell)
  [-1, 1].forEach((side, i) => {
    const u = side * half;
    if (endWalls[i] && hollowAt(u - side * 1)) {
      for (let f = 0; f < 3; f++) {
        F.add(new THREE.BoxGeometry(0.02, 1.5, 1.8), lit(f) ? 'glassClearLit' : 'glassClear', u + side * 0.01, FL[f] + 0.9 + 0.75, CD / 2);
        F.add(new THREE.BoxGeometry(0.62, 0.09, 2.4), 'white', u + side * 0.31, FL[f] + 2.58, CD / 2);
      }
    }
    if (endWalls[i]) for (let f = 1; f < 3; f++) F.box(0.16, 0.92, CW, 'wall', u - side * 0.08, FL[f], CD + CW / 2); // corridor end parapet
  });

  // ---- open corridor facing the courtyard ----
  const cu0 = Math.max(-half, corridorFrom);
  const cu1 = Math.min(half, corridorTo);
  const clen = cu1 - cu0;
  const cmid = (cu0 + cu1) / 2;
  for (let f = 0; f < 3; f++) F.box(L, 0.025, CW, 'tiles', 0, FL[f], CD + CW / 2); // corridor floors
  for (let f = 1; f <= 3; f++) {
    const y = f < 3 ? FL[f] : ROOFY;
    F.box(L, 0.2, CW + 0.12, 'white', 0, y - 0.2, CD + CW / 2 + 0.06); // slab
    F.box(clen, 0.5, 0.26, 'maroon', cmid, y - 0.7, D - 0.1); // edge beam
  }
  const colU = opts.columns || [];
  if (!opts.columns) for (let u = cu0 + 0.2; u <= cu1 - 0.1; u += 3.6) colU.push(u);
  // round ivory columns on red sandstone bases, a capital under every floor's beam
  const colH = ROOFY - PLINTH - 0.32;
  for (const u of colU) {
    F.add(COLUMN, 'white', u, PLINTH + 0.32 + colH / 2, D - 0.2);
    F.box(0.5, 0.32, 0.5, 'maroon', u, PLINTH, D - 0.2); // base
    F.box(0.42, 0.06, 0.42, 'white', u, PLINTH + 0.32, D - 0.2);
    for (const y of [FL[1], FL[2], ROOFY]) {
      F.box(0.46, 0.08, 0.46, 'white', u, y - 0.86, D - 0.2); // capital
      F.box(0.52, 0.08, 0.52, 'maroon', u, y - 0.78, D - 0.2);
    }
  }
  // upstairs, a stone balustrade along the corridor: sandstone base and rail, turned ivory balusters
  for (let f = 1; f < 3; f++) {
    F.box(clen, 0.14, 0.22, 'maroon', cmid, FL[f], D - 0.1);
    F.box(clen + 0.06, 0.1, 0.3, 'maroon', cmid, FL[f] + 0.8, D - 0.1);
    for (let u = cu0 + 0.25; u <= cu1 - 0.2; u += 0.27) {
      if (colU.some((c) => Math.abs(u - c) < 0.32)) continue;
      F.add(BALUSTER, 'white', u, FL[f] + 0.14, D - 0.1);
    }
  }
  // potted plants along the ground-floor verandah, tucked beside a column (never in front of a door or a staircase)
  for (const cu of colU) {
    const u = cu + 0.55;
    if (u > cu1 - 0.5 || !rng.chance(0.6)) continue;
    const cell = cells.find(([, a, b]) => u > a && u < b);
    if (cell?.[0] === 'stair') continue;
    if (cell?.[0] === 'room' && Math.abs(u - ((cell[1] + cell[2]) / 2 - 2.5)) < 1.4) continue;
    F.add(new THREE.CylinderGeometry(0.22, 0.16, 0.38, 12), 'pot', u, PLINTH + 0.19, D - 0.42);
    F.add(new THREE.SphereGeometry(0.3, 10, 8), 'shrub', u, PLINTH + 0.6, D - 0.42, { sy: 0.85 });
  }

  // terrace: finish, a projecting cornice, the parapet with sandstone coping
  F.box(L - 0.3, 0.06, D - 0.3, 'roof', 0, ROOFY, D / 2);
  F.box(L + 0.5, 0.2, 0.42, 'white', 0, ROOFY - 0.18, -0.12);
  F.box(L + 0.5, 0.2, 0.42, 'white', 0, ROOFY - 0.18, D + 0.12);
  F.box(L + 0.2, 1.0, 0.2, 'wall', 0, ROOFY, -0.1 + 0.1);
  F.box(L + 0.2, 1.0, 0.2, 'wall', 0, ROOFY, D);
  F.box(0.2, 1.0, D, 'wall', -half, ROOFY, D / 2);
  F.box(0.2, 1.0, D, 'wall', half, ROOFY, D / 2);
  F.box(L + 0.36, 0.1, 0.34, 'maroon', 0, ROOFY + 1.0, 0);
  F.box(L + 0.36, 0.1, 0.34, 'maroon', 0, ROOFY + 1.0, D);
  F.box(0.34, 0.1, D, 'maroon', -half, ROOFY + 1.0, D / 2);
  F.box(0.34, 0.1, D, 'maroon', half, ROOFY + 1.0, D / 2);
  return F;
}

/** a dog-leg staircase between u0 and u1: flight A climbs towards the outer wall, flight B comes back */
function stairwell(F, u0, u1, wb) {
  const um = (u0 + u1) / 2;
  const RISERS = 12;
  const rise = FLOOR / 2 / RISERS;
  const run = (5.0 - 1.65) / RISERS;
  const slope = Math.atan2(FLOOR / 2, 5.0 - 1.65);
  const len = Math.hypot(FLOOR / 2, 5.0 - 1.65);
  for (let f = 0; f < 2; f++) {
    const y0 = FL[f];
    const ym = y0 + FLOOR / 2;
    for (let k = 0; k < RISERS; k++) {
      // flight A: up as v decreases
      wb(u0 + 0.12, um - 0.08, 5.0 - (k + 1) * run, 5.0 - k * run, y0 + k * rise, y0 + (k + 1) * rise, 'kota');
      // flight B: up as v increases
      wb(um + 0.08, u1 - 0.12, 1.65 + k * run, 1.65 + (k + 1) * run, ym + k * rise, ym + (k + 1) * rise, 'kota');
    }
    // sloping slabs under the flights and the low walls between them
    F.add(new THREE.BoxGeometry(um - 0.08 - u0 - 0.12, 0.16, len), 'white', (u0 + 0.12 + um - 0.08) / 2, (y0 + ym) / 2 - 0.12, 3.325, { rx: slope });
    F.add(new THREE.BoxGeometry(u1 - 0.12 - um - 0.08, 0.16, len), 'white', (um + 0.08 + u1 - 0.12) / 2, (ym + y0 + FLOOR) / 2 - 0.12, 3.325, { rx: -slope });
    F.add(new THREE.BoxGeometry(0.1, 0.95, len), 'white', um - 0.05, (y0 + ym) / 2 + 0.47, 3.325, { rx: slope });
    F.add(new THREE.BoxGeometry(0.1, 0.95, len), 'white', um + 0.05, (ym + y0 + FLOOR) / 2 + 0.47, 3.325, { rx: -slope });
    F.add(new THREE.BoxGeometry(0.14, 0.05, len), 'wood', um - 0.05, (y0 + ym) / 2 + 0.97, 3.325, { rx: slope }); // hand rails
    F.add(new THREE.BoxGeometry(0.14, 0.05, len), 'wood', um + 0.05, (ym + y0 + FLOOR) / 2 + 0.97, 3.325, { rx: -slope });
    // the half-way landing
    wb(u0 + 0.1, u1 - 0.1, 0.22, 1.65, ym - 0.18, ym, 'kota');
  }
}

/** door frame (the door leaf itself is a separate moving part, see doors.js) */
function doorFrame(F, u, y, v) {
  F.box(0.12, 2.24, 0.26, 'white', u - 0.57, y, v - 0.11);
  F.box(0.12, 2.24, 0.26, 'white', u + 0.57, y, v - 0.11);
  F.box(1.26, 0.12, 0.26, 'white', u, y + 2.12, v - 0.11);
}

export function buildSchool(scene, B, M, rng) {
  // windows lit in the evening: roughly two in three, mostly on lower floors
  const lit = (f) => rng.chance(f === 0 ? 0.75 : f === 1 ? 0.6 : 0.45);

  // block A (back) — the story classroom is on the 2nd floor, right of the clock tower
  // (its corridor front stops where the wings' corridors join it, so the corners stay open on every floor;
  // columns stand on the partition lines, clear of the doors and the two staircases)
  const colA = [];
  for (let u = -25.2; u <= 25.21; u += 3.6) if (Math.abs(u) > 4) colA.push(u);
  block(B, 'A', { L: 72, ox: 0, oz: -34, theta: 0, corridorFrom: -27, corridorTo: 27, columns: colA, story: { u: 10.8, floor: 2 } }, rng, lit);
  // wings B (left) and C (right), corridors facing the courtyard
  block(B, 'B', { L: 33, ox: -36, oz: -8.5, theta: Math.PI / 2, endWalls: [true, false] }, rng, lit);
  block(B, 'C', { L: 33, ox: 36, oz: -8.5, theta: -Math.PI / 2, endWalls: [false, true] }, rng, lit);

  // stair rooms ("mumty") and tanks on the terrace
  for (const x of [-31.5, 31.5]) {
    B.box(5, 3, 4.2, 'wall', x, ROOFY, -30.5);
    B.box(5.3, 0.25, 4.5, 'maroon', x, ROOFY + 3, -30.5);
    B.box(1.0, 2.1, 0.06, 'wood', x + 1, ROOFY, -28.37);
  }
  // chhatris on the corners of the roofs
  for (const [x, z] of [[-34.2, -32.2], [34.2, -32.2], [-31.5, 6.3], [31.5, 6.3], [-24, -26.6], [24, -26.6]]) chhatri(B, x, ROOFY, z, 0.9);

  // solar panels on the back block
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 7; c++) {
      const x = -5 + c * 2.2 + 18;
      const z = -32.6 + r * 2.6;
      B.add(new THREE.BoxGeometry(2, 0.05, 1.2), 'solar', x, ROOFY + 0.9, z, { rx: -0.35 });
      B.box(0.06, 0.75, 0.06, 'darkMetal', x - 0.9, ROOFY, z + 0.45);
      B.box(0.06, 0.75, 0.06, 'darkMetal', x + 0.9, ROOFY, z + 0.45);
      B.box(0.06, 1.15, 0.06, 'darkMetal', x - 0.9, ROOFY, z - 0.45);
      B.box(0.06, 1.15, 0.06, 'darkMetal', x + 0.9, ROOFY, z - 0.45);
    }
  }

  // ---------- clock tower ----------
  const TX = 0;
  const TZ = -24.4;
  B.box(7.6, PLINTH, 7.6, 'plinth', TX, 0, TZ);
  B.box(7.2, 14.6 - PLINTH, 7.2, 'wall', TX, PLINTH, TZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.5, 14.6 - PLINTH, 0.5, 'maroon', TX + sx * 3.45, PLINTH, TZ + sz * 3.45);
  for (const y of [FL[1] - 0.3, FL[2] - 0.3, ROOFY - 0.1]) B.box(7.36, 0.32, 7.36, 'maroon', TX, y, TZ);
  B.box(7.9, 0.45, 7.9, 'white', TX, 14.6, TZ); // cornice
  B.box(6.2, 5, 6.2, 'wall', TX, 15.05, TZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(0.42, 5, 0.42, 'maroon', TX + sx * 3, 15.05, TZ + sz * 3);
  B.box(6.8, 0.4, 6.8, 'white', TX, 20.05, TZ);
  // a drum and a white dome with a gold finial, a small chhatri at each corner
  B.cyl(2.5, 0.25, 'maroon', TX, 20.45, TZ, 28);
  B.cyl(2.3, 1.2, 'white', TX, 20.7, TZ, 28);
  B.cyl(2.45, 0.18, 'maroon', TX, 21.9, TZ, 28);
  B.add(new THREE.SphereGeometry(2.45, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), 'white', TX, 22.05, TZ, { sy: 1.2 });
  B.cyl(0.32, 0.4, 'gold', TX, 24.95, TZ, 12);
  B.cyl(0.07, 1.6, 'gold', TX, 25.35, TZ, 8);
  B.add(new THREE.SphereGeometry(0.28, 16, 12), 'gold', TX, 26.0, TZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chhatri(B, TX + sx * 2.85, 20.45, TZ + sz * 2.85, 0.42);
  // tall arched windows on the tower front
  const TF = frame(B, TX, TZ + 3.6, 0);
  for (const f of [0, 1, 2]) windowUnit(TF, 0, FL[f] + 0.8, 0, 1.4, 2.0, 1, { glass: f === 0 ? 'glassLit' : 'glass', grill: false });

  // entrance porch with columns and steps
  const PZ = TZ + 3.6;
  B.box(11, 0.32, 5, 'white', TX, FL[1] - 0.32, PZ + 2.5);
  B.box(11.1, 0.62, 0.3, 'maroon', TX, FL[1] - 0.94, PZ + 4.9);
  B.box(11, PLINTH, 5, 'plinth', TX, 0, PZ + 2.5);
  B.box(10.6, 0.02, 4.8, 'tiles', TX, PLINTH, PZ + 2.5);
  for (const x of [-4.8, -1.8, 1.8, 4.8]) {
    B.cyl(0.26, FL[1] - 0.32 - PLINTH, 'white', TX + x, PLINTH, PZ + 4.55, 20);
    B.box(0.66, 0.25, 0.66, 'maroon', TX + x, PLINTH, PZ + 4.55);
  }
  for (let s = 0; s < 3; s++) B.box(8 - s * 0.6, 0.15, 0.4, 'plinth', TX, s * 0.15, PZ + 5.2 - s * 0.4 + 0.8);
  // a classical pediment over the porch, with the crest in it
  {
    const tri = new THREE.Shape();
    tri.moveTo(-5.7, 0);
    tri.lineTo(5.7, 0);
    tri.lineTo(0, 1.9);
    tri.closePath();
    B.add(new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }), 'white', TX, FL[1], PZ + 4.55);
    B.box(11.6, 0.14, 0.5, 'maroon', TX, FL[1] - 0.02, PZ + 4.75);
  }
  B.box(1.0, 2.6, 0.08, 'wood', TX, PLINTH, PZ + 0.04); // main door
  B.box(1.0, 2.6, 0.08, 'wood', TX - 1.05, PLINTH, PZ + 0.04);

  // ---------- separate textured pieces (signs, clock faces) ----------
  const extras = new THREE.Group();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.56), new THREE.MeshStandardMaterial({ map: signTexture('PROXYPILOT SCHOOL', { w: 2048, h: 134, font: '700 96px Georgia, serif' }), roughness: 0.45, metalness: 0.2 }));
  sign.position.set(TX, FL[1] - 0.64, PZ + 5.06);
  extras.add(sign);
  const crest = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.4, roughness: 0.5 }));
  crest.position.set(TX, FL[1] + 0.82, PZ + 4.97);
  extras.add(crest);
  const motto = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('EVERY CLASS, COVERED', { w: 1024, h: 120, bg: '#e9d3a2', fg: '#7a2a1d', font: 'italic 600 64px Georgia, serif', border: false }), roughness: 0.8 }));
  motto.position.set(TX, ROOFY + 0.45, TZ + 3.61);
  extras.add(motto);

  const dial = canvasTexture(512, 512, (g) => {
    g.fillStyle = '#f4efe1';
    g.beginPath();
    g.arc(256, 256, 244, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 18;
    g.strokeStyle = '#2b2018';
    g.stroke();
    g.fillStyle = '#2b2018';
    g.font = '600 54px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    R.forEach((r, i) => {
      const a = (i / 12) * Math.PI * 2;
      g.fillText(r, 256 + Math.sin(a) * 182, 256 - Math.cos(a) * 182);
    });
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r0 = i % 5 ? 226 : 214;
      g.lineWidth = i % 5 ? 3 : 6;
      g.beginPath();
      g.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0);
      g.lineTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236);
      g.stroke();
    }
  });
  const dialMat = new THREE.MeshStandardMaterial({ map: dial, roughness: 0.5, emissive: '#fff2d0', emissiveMap: dial, emissiveIntensity: 0 });
  const handMat = new THREE.MeshStandardMaterial({ color: '#1d1712', roughness: 0.4, metalness: 0.6 });
  const clocks = [];
  for (const [nx, nz] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const g = new THREE.Group();
    g.position.set(TX + nx * 3.12, 17.6, TZ + nz * 3.12);
    g.rotation.y = Math.atan2(nx, nz);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), dialMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.07, 8, 48), handMat);
    const hour = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.04).translate(0, 0.32, 0), handMat);
    const min = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.04).translate(0, 0.5, 0), handMat);
    hour.position.z = 0.04;
    min.position.z = 0.07;
    hour.castShadow = min.castShadow = true;
    g.add(face, ring, hour, min);
    extras.add(g);
    clocks.push({ hour, min });
  }
  scene.add(extras);

  return {
    clocks,
    dialMat,
    setClock(hours) {
      for (const c of clocks) {
        c.hour.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
        c.min.rotation.z = -((hours % 1) * Math.PI * 2);
      }
    },
  };
}
