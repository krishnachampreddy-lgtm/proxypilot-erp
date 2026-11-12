/*
  Rooms on the campus and how people get about the building. No 3D code here, so the
  page can use it too.

  The school is three blocks: A at the back, wings B (west) and C (east). Each block has
  its own frame: u runs along the block, v from the outer wall (0) to the courtyard edge
  (9). Rooms are 7.2 m cells along u, 6.6 m deep; an open corridor (v 6.6 → 9) runs in
  front of them. Four staircases sit in cells of their own.
*/

export const PLINTH = 0.45;
export const FLOOR = 3.6;
export const CD = 6.6; // room depth (block depth 9 minus the 2.4 m corridor)
export const floorY = (f) => PLINTH + FLOOR * f;
const FLOOR_NAME = ['Ground floor', 'First floor', 'Second floor'];
const G = 0.08; // feet on the paving
const V0 = PLINTH + 0.03; // feet on the ground-floor corridor
export const FEET = { ground: G, corridor: V0, floor: (f) => floorY(f) + 0.03 };

/** block frames: (u, v) → [x, z] */
export const BLOCKS = {
  A: { at: (u, v) => [u, -34 + v], theta: 0, half: 36, ox: 0, oz: -34 },
  B: { at: (u, v) => [-36 + v, -8.5 - u], theta: Math.PI / 2, half: 16.5, ox: -36, oz: -8.5 },
  C: { at: (u, v) => [36 - v, -8.5 + u], theta: -Math.PI / 2, half: 16.5, ox: 36, oz: -8.5 },
};
/** heading (three.js rotation.y) of something facing along +u / +v in a block */
const headingU = (b) => BLOCKS[b].theta + Math.PI / 2;
const headingV = (b) => BLOCKS[b].theta;

/** what fills each 7.2 m cell along a block: rooms, stairwells and solid walls */
export const CELLS = {
  A: [
    ['solid', -36, -28.8], ['room', -28.8, -21.6], ['room', -21.6, -14.4], ['room', -14.4, -7.2], ['stair', -7.2, -3.6],
    ['solid', -3.6, 3.6], ['stair', 3.6, 7.2], ['room', 7.2, 14.4], ['room', 14.4, 21.6], ['room', 21.6, 28.8], ['solid', 28.8, 36],
  ],
  B: [['room', -16.5, -9.3], ['room', -9.3, -2.1], ['room', -2.1, 5.1], ['room', 5.1, 12.3], ['stair', 12.3, 16.5]],
  C: [['room', -16.5, -9.3], ['room', -9.3, -2.1], ['room', -2.1, 5.1], ['room', 5.1, 12.3], ['stair', 12.3, 16.5]],
};

// ---------------- seats ----------------
// five rows of twin study desks (a chair each) in four columns, facing the smart board (towards -u)
export const DESK_ROWS = [-1.45, -0.45, 0.55, 1.55, 2.55]; // u of each row, from the room centre (lockers along the back wall)
export const DESK_COLS = [1.125, 2.475, 4.125, 5.475]; // v of each column (girls 0-1, boys 2-3)
const AISLE_V = 3.3; // the middle aisle

function seatList(block, rc, y, cols) {
  const at = BLOCKS[block].at;
  const out = [];
  for (const r of DESK_ROWS) {
    // inner seats (next to the aisle) first
    const vs = [];
    for (const c of cols) vs.push(c - 0.26, c + 0.26);
    vs.sort((p, q) => Math.abs(p - AISLE_V) - Math.abs(q - AISLE_V));
    for (const v of vs) {
      const [x, z] = at(rc + r + 0.17, v);
      const [ax, az] = at(rc + r + 0.43, AISLE_V);
      const [rx, rz] = at(rc + r + 0.43, v);
      out.push({ x, y, z, heading: headingU(block) + Math.PI, aisle: [ax, az], row: [rx, rz] });
    }
  }
  return out;
}

function makeRoom(block, rc, f, kind) {
  const at = BLOCKS[block].at;
  const y = f === 0 ? V0 : floorY(f) + 0.03;
  const du = rc - 2.5; // the door is 2.5 m before the room centre along the block
  const [x, z] = at(rc + 0.8, CD); // between the two corridor windows
  const nrm = { A: [0, 1], B: [1, 0], C: [-1, 0] }[block];
  const wing = { A: 'Main block', B: 'West wing', C: 'East wing' }[block];
  const r = {
    block, rc, floor: f, kind, x, y: floorY(f) + 1.57, z, nx: nrm[0], nz: nrm[1], where: `${wing} · ${FLOOR_NAME[f]}`,
    feet: y,
    door: at(du, CD + 0.5), // just outside the door, in the corridor
    inDoor: at(du, CD - 0.7), // just inside
    corr: at(du, 7.8), // corridor centre line
    front: at(du, 10.6), // out in the courtyard (see groundPath for the corner room)
    frontAisle: at(rc - 2.05, AISLE_V), // the space in front of the first row
    hinge: at(du - 0.5, CD - 0.11),
    theta: BLOCKS[block].theta,
    teacher: { p: at(rc - 2.8, AISLE_V + 0.4), heading: headingU(block) },
  };
  // from the courtyard to the corridor outside a ground-floor door: straight across, except for the
  // room in the corner of the main block, whose door opens off the corner where the west wing joins
  r.groundPath = [[r.front[0], G, r.front[1]]];
  if (block === 'A' && du < -27) {
    r.front = [-25.4, -23.8];
    r.groundPath = [[-25.4, G, -23.8], [-28.2, V0, -23.8], [-28.2, V0, -26.2]];
  }
  if (kind === 'class') {
    r.girls = seatList(block, rc, y, [DESK_COLS[0], DESK_COLS[1]]);
    r.boys = seatList(block, rc, y, [DESK_COLS[2], DESK_COLS[3]]);
  }
  return r;
}

// ---------------- classrooms (in the order class names get them) ----------------
const PREFERRED = [
  ['A', -10.8, 1], ['A', 10.8, 1], ['A', -18, 0], ['A', 18, 0], ['A', -10.8, 2], ['A', 10.8, 2],
  ['B', 1.5, 1], ['C', 1.5, 1], ['A', -25.2, 1], ['A', 25.2, 1], ['B', -12.9, 0], ['C', -12.9, 0],
  ['A', -18, 2], ['A', 18, 2], ['B', 8.7, 1], ['C', 8.7, 1], ['A', -25.2, 0], ['A', 25.2, 0],
];
export const STAFF_ROOM = ['B', -5.7, 0];
export const HOD_OFFICE = ['C', -5.7, 1];
const special = (b, rc, f) => [STAFF_ROOM, HOD_OFFICE].some((s) => s[0] === b && s[1] === rc && s[2] === f);

const ORDER = (() => {
  const list = PREFERRED.slice();
  const seen = new Set(PREFERRED.map((p) => p.join()));
  for (const [b, rcs] of [['A', [-25.2, -18, -10.8, 10.8, 18, 25.2]], ['B', [-12.9, -5.7, 1.5, 8.7]], ['C', [-12.9, -5.7, 1.5, 8.7]]]) {
    for (const rc of rcs) {
      for (let f = 0; f < 3; f++) {
        if (special(b, rc, f)) continue; // the staff room and the HOD's office
        if (!seen.has([b, rc, f].join())) list.push([b, rc, f]);
      }
    }
  }
  return list;
})();

/** the 40 classrooms the school day uses (also what the HOD view highlights) */
export const CLASSROOMS = ORDER.map(([b, rc, f]) => makeRoom(b, rc, f, 'class'));
export const ROOMS = CLASSROOMS;
export const STAFF = makeRoom(...STAFF_ROOM, 'staff');
export const HOD = makeRoom(...HOD_OFFICE, 'hod');
/** every room with a door (classrooms, staff room, HOD office) */
export const ALL_ROOMS = [...CLASSROOMS, STAFF, HOD];

// the staff room: a long table with chairs on both sides
STAFF.table = { u: STAFF.rc + 0.2, v: AISLE_V };
STAFF.chairs = (() => {
  const { at } = BLOCKS[STAFF.block];
  const out = [];
  for (const side of [-1, 1]) {
    for (const du of [-1.25, -0.35, 0.55, 1.45]) {
      const [x, z] = at(STAFF.table.u + du, AISLE_V + side * 0.92);
      out.push({ x, y: STAFF.feet, z, heading: headingV(STAFF.block) + (side < 0 ? 0 : Math.PI) });
    }
  }
  return out;
})();
// the HOD's office: a desk, the HOD's chair behind it, two chairs for visitors
HOD.chair = (() => {
  const [x, z] = BLOCKS[HOD.block].at(HOD.rc + 2.05, AISLE_V);
  return { x, y: HOD.feet, z, heading: headingU(HOD.block) + Math.PI };
})();
HOD.visitors = [AISLE_V - 0.55, AISLE_V + 0.55].map((v) => {
  const [x, z] = BLOCKS[HOD.block].at(HOD.rc + 0.25, v);
  return { x, y: HOD.feet, z, heading: headingU(HOD.block) };
});

// ---------------- the library (its own single-storey building, square to the axes) ----------------
const LX = -64;
const LZ = -44;
export const LIBRARY = (() => {
  const y = 0.53; // feet on the library floor
  const tables = [[-70.2, -46.2], [-57.8, -46.2], [-70.2, -43.4], [-57.8, -43.4]];
  const readers = [];
  for (const [tx, tz] of tables) {
    for (const side of [-1, 1]) {
      for (const dx of [-0.8, 0, 0.8]) readers.push({ x: tx + dx, y, z: tz + side * 0.72, heading: side < 0 ? 0 : Math.PI });
    }
  }
  return {
    x: LX, z: LZ, y, tables, readers,
    librarian: { x: -60.4, y, z: -42.95, heading: 0 },
    desk: [-60.4, -42.25],
    door: [LX, -39.7],
    inDoor: [LX, -41.4],
    aisle: (z) => [LX, z],
  };
})();

/** the same class always gets the same room: rooms are handed out in sorted class-name order */
export function roomFor(className, allClasses) {
  const sorted = [...new Set(allClasses)].sort();
  const i = sorted.indexOf(className);
  return ROOMS[(i >= 0 ? i : sorted.length) % ROOMS.length];
}

// ---------------- staircases ----------------
// a dog-leg stair in its own cell: flight A climbs from the corridor towards the outer wall,
// a landing, then flight B climbs back to the next floor's landing at the corridor
function stairOf(id, block, u0, u1) {
  const at = BLOCKS[block].at;
  const um = (u0 + u1) / 2;
  const uA = (u0 + um) / 2 - 0.05;
  const uB = (um + u1) / 2 + 0.05;
  const p = (u, v, y) => {
    const [x, z] = at(u, v);
    return [x, y, z];
  };
  /** the walk from floor f up to floor f + 1 */
  const up = (f) => {
    const y0 = f === 0 ? V0 : floorY(f) + 0.03;
    const y1 = floorY(f + 1) + 0.03;
    const ym = floorY(f) + FLOOR / 2 + 0.03;
    return [p(uA, 5.7, y0), p(uA, 5.0, y0), p(uA, 1.65, ym), p(uA, 0.95, ym), p(uB, 0.95, ym), p(uB, 1.65, ym), p(uB, 5.0, y1), p(uB, 5.7, y1)];
  };
  const corr = at(um, 7.8);
  // the two stairs beside the clock tower are reached round the side of its porch, not through it
  const yard = block === 'A' && Math.abs(um) < 8 ? [[Math.sign(um) * 6.9, -14.4], [Math.sign(um) * 6.9, -19.6]] : [];
  // (the clock tower's stairs come down beside it, clear of the tower and its porch)
  const ground = yard.length ? [Math.sign(um) * 6.3, -23.4] : at(um, 10.6);
  return { id, block, u0, u1, um, uA, uB, corr, ground, yard, up };
}

export const STAIRS = [
  stairOf('A-west', 'A', -7.2, -3.6),
  stairOf('A-east', 'A', 3.6, 7.2),
  stairOf('B-back', 'B', 12.3, 16.5),
  stairOf('C-front', 'C', 12.3, 16.5),
];

/** the staircase nearest a room (by walking distance along the corridors) */
const corridorDist = (r, s) => {
  const [dx, dz] = r.corr;
  const [sx, sz] = s.corr;
  return Math.abs(dx - sx) + Math.abs(dz - sz);
};
for (const r of ALL_ROOMS) {
  let best = 0;
  for (let i = 1; i < STAIRS.length; i++) if (corridorDist(r, STAIRS[i]) < corridorDist(r, STAIRS[best])) best = i;
  r.stair = best;
}
// The upstairs classrooms share the four staircases out evenly: a room goes to its nearest staircase unless that
// one is already busier, so no stairwell has to carry twice the classes of another when everyone comes down for
// assembly or goes home. (The rooms with only one sensible staircase are placed first.)
{
  const up = CLASSROOMS.filter((r) => r.floor > 0);
  const near = (r) => STAIRS.map((s) => corridorDist(r, s)).sort((a, b) => a - b);
  up.sort((a, b) => near(b)[1] - near(b)[0] - (near(a)[1] - near(a)[0]));
  const load = STAIRS.map(() => 0);
  for (const r of up) {
    let best = 0;
    let cost = Infinity;
    STAIRS.forEach((s, k) => {
      const c = corridorDist(r, s) + 3 * load[k];
      if (c < cost) [cost, best] = [c, k];
    });
    r.stair = best;
    load[best]++;
  }
}

/**
 * Corridor route from one point to another on the same floor (feet height y): along the
 * corridor centre lines, turning at the corner where a wing meets the main block.
 */
export function corridorPath([x0, z0], [x1, z1], y) {
  const pts = [];
  const inA = (z) => z < -24.9;
  const wingX = (x) => (x < 0 ? -28.2 : 28.2);
  if (inA(z0) && !inA(z1)) pts.push([wingX(x1), -26.2]);
  else if (!inA(z0) && inA(z1)) pts.push([wingX(x0), -26.2]);
  else if (!inA(z0) && !inA(z1) && Math.sign(x0) !== Math.sign(x1)) pts.push([wingX(x0), -26.2], [wingX(x1), -26.2]);
  pts.push([x1, z1]);
  return pts.map(([x, z]) => [x, y, z]);
}
