import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { simplifyGeometry, compactGeometry } from './lod.js';

/*
  Students and teachers.
  An animated human figure (walk / run / idle / talking) is dressed in school uniform by a
  shader that paints each body region from its rest-pose position: shirt, tie, belt,
  trousers, socks, shoes, skin and hair. Girls also wear a pleated skirt and two plaits with
  ribbons; women teachers wear sarees (pleated skirt, border, pallu over the shoulder, a bun).
  - teachers and the students in games are fully animated (skinned, with blended walk/run/idle)
  - the student body — a thousand and more, streaming in with school bags, standing in
    assembly, chatting in groups at lunch, going home — uses frames of the animations baked
    into plain meshes and drawn with instancing, in two levels of detail, and only the ones
    in view are drawn
  - everyone sitting down (students at their desks, teachers at the board and in the staff
    room, the HOD, readers in the library) is drawn the same way from posed frames
*/

const WALK_FRAMES = 8;
const RUN_FRAMES = 6;
const TALK_FRAMES = 3; // per talking clip (nodding, shaking the head)

// strips in front of moving vehicles (set by the vehicles each frame): nobody steps into one
let ZONES = [];
export const setVehicleZones = (z) => (ZONES = z);
// the vehicles themselves (every bus, car and auto on show, moving or parked): nobody walks through one
let BODIES = [];
export const setVehicleBodies = (b) => (BODIES = b);
const PAD = 0.3; // how close a person's centre comes to a vehicle's side
// while a school vehicle turns through the gate, people on foot wait either side of it (as the watchman waves them)
let GATE_HOLD = false;
export const setGateHold = (b) => (GATE_HOLD = b);
// (on the footpath they wait well clear, beyond where a turning bus's tail swings)
const inGateBox = (x, z) => z > 42.4 && z < 47.2 && Math.abs(x) < (z > 43.6 ? 8.6 : 5.4);
// the road beyond the kerb: nobody on foot is pushed out onto it (unless that's where they're going, to an auto)
const KERB = 46.3;
/**
 * the compound wall (z ≈ 44, open only at the gate, |x| < 7.6): nobody walks through it. Someone pushed (or
 * routed) towards it from the wrong side is stopped at it — and if where they're going is on the other side,
 * they go round by the gate first
 */
function wall(a, goal, z0) {
  if (a.pos.y >= 0.3 || Math.abs(a.pos.x) < 7.5 || Math.abs(a.pos.x) > 300) return;
  const inside = z0 < 44;
  if (inside && a.pos.z > 43.6) a.pos.z = z0 > 43.6 ? z0 : 43.6;
  else if (!inside && a.pos.z < 44.45) a.pos.z = 44.45;
  else if (!inside && Math.abs(a.pos.x) < 9.9 && a.pos.z < 44.85) {
    a.pos.z = 44.85; // (the gate's pylons stand a little proud of the wall: just step round them)
    return;
  }
  else return;
  if ((goal.z > 44) !== inside || a.path?.[a.seg] !== goal) return; // (just brushed it: carry on along it)
  const sx = Math.sign(a.pos.x);
  const p = (x, z) => Object.assign(new THREE.Vector3(x, goal.y, z), { hold: 0 });
  a.path.splice(a.seg, 0, ...(inside ? [p(sx * 5.4, 43.1), p(sx * 5.4, 45.2)] : [p(sx * 5.4, 45.2), p(sx * 5.4, 43.1)]));
  a.segLen = -1;
}
const kerb = (a, goal, z0) => {
  if (a.pos.y >= 0.3) return;
  wall(a, goal, z0);
  if (goal.z < KERB && z0 <= KERB + 0.05 && a.pos.z > KERB && Math.abs(a.pos.x) < 80) a.pos.z = KERB;
  // (and on the footpath, never pushed back into the compound wall: it only opens at the gate)
  if (z0 >= 44.4 && a.pos.z < 44.62 && Math.abs(a.pos.x) > 7.4) a.pos.z = 44.62;
};
const bodyLocal = (b, x, z) => {
  const dx = x - b.x;
  const dz = z - b.z;
  return [dx * b.fx + dz * b.fz, dx * b.fz - dz * b.fx]; // along, across
};
const inBody = (b, x, z, pad = PAD) => {
  const [u, v] = bodyLocal(b, x, z);
  return Math.abs(u) < b.hl + pad && Math.abs(v) < b.hw + pad;
};
/** keeps a step (dx, dz) from going into a vehicle: slides along its side instead; returns false if it can't move */
const _out = { x: 0, z: 0 };
function clearOfVehicles(a, goal, dx, dz) {
  _out.x = dx;
  _out.z = dz;
  for (const b of BODIES) {
    if (Math.abs(a.pos.x - b.x) > b.hl + 3 || Math.abs(a.pos.z - b.z) > b.hl + 3) continue;
    // heading for this very vehicle (boarding it): round it to the door, then in
    if (inBody(b, goal.x, goal.z, PAD + 0.25) && Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z) < 1.6) continue;
    const nx = a.pos.x + _out.x;
    const nz = a.pos.z + _out.z;
    if (!inBody(b, nx, nz)) continue;
    const [u, v] = bodyLocal(b, a.pos.x, a.pos.z);
    // the side we're nearest: the step loses its part going into the vehicle
    const pu = b.hl + PAD - Math.abs(u);
    const pv = b.hw + PAD - Math.abs(v);
    let ux, uz; // outward normal of that side
    if (pu < pv) {
      const s = u >= 0 ? 1 : -1;
      ux = b.fx * s;
      uz = b.fz * s;
    } else {
      const s = v >= 0 ? 1 : -1;
      ux = b.fz * s;
      uz = -b.fx * s;
    }
    const len = Math.hypot(_out.x, _out.z);
    if (pu > 0 && pv > 0) {
      // already inside (the vehicle drove up, or they got out of it): step out to the side (never out in front of it)
      if (pu < pv && pu > 0.4) {
        const s = v >= 0 ? 1 : -1;
        ux = b.fz * s;
        uz = -b.fx * s;
      }
      _out.x = ux * Math.max(len, 0.02);
      _out.z = uz * Math.max(len, 0.02);
      continue;
    }
    const into = _out.x * ux + _out.z * uz;
    if (into < 0) {
      _out.x -= ux * into;
      _out.z -= uz * into;
      // walking straight at it: go round, on the side nearer the goal
      const rest = Math.hypot(_out.x, _out.z);
      if (rest < len * 0.3) {
        let tx = -uz;
        let tz = ux;
        if ((goal.x - a.pos.x) * tx + (goal.z - a.pos.z) * tz < 0) {
          tx = -tx;
          tz = -tz;
        }
        _out.x = tx * len * 0.8;
        _out.z = tz * len * 0.8;
      }
    }
  }
  return _out;
}

// keeping out of each other's way: everyone on show, bucketed on a 1 m grid each frame
const SEP = 0.55;
const _grid = new Map();
const gkey = (x, z, y) => ((Math.floor(x) + 512) * 1024 + (Math.floor(z) + 512)) * 8 + Math.max(0, Math.min(7, Math.round(y / 3.6)));
function separate(lists, dt) {
  _grid.clear();
  for (const list of lists) {
    for (const a of list) {
      if (!a.active) continue;
      const k = gkey(a.pos.x, a.pos.z, a.pos.y);
      const cell = _grid.get(k);
      if (cell) cell.push(a);
      else _grid.set(k, [a]);
    }
  }
  for (const list of lists) {
    for (const a of list) {
      if (!a.active || a.run || a.force > 0 || !(a.moving || a.gateT > 0 || a.yieldT > 0)) continue;
      const goal = a.path?.[a.seg];
      if (!goal) continue;
      // (in a doorway, an aisle, a stair or the gap beside a line: only the gentlest nudge — but still out in the
      // open, heading for a doorway or a stair, the usual elbow room, so a crowd waiting to go in doesn't squash up)
      const gd = Math.hypot(goal.x - a.pos.x, goal.z - a.pos.z);
      const tight = goal.exact || (goal.narrow && (a.pos.y > 0.3 || gd < 2.2)) ? 0.2 : goal.narrow ? 1 : (goal.squeeze ?? 1);
      // nearly there (a seat, a spot in a line): no jostling
      if (gd < 0.7 && a.seg === a.path.length - 1) continue;
      let px = 0;
      let pz = 0;
      const fx = Math.sin(a.heading);
      const fz = Math.cos(a.heading);
      const cx = Math.floor(a.pos.x);
      const cz = Math.floor(a.pos.z);
      // (on a stair halfway between floors the people around may be filed under the floor above or below)
      const fy = a.pos.y / 3.6;
      const fl = Math.max(0, Math.min(7, Math.round(fy)));
      const fl2 = Math.abs(fy - fl) > 0.33 ? Math.max(0, Math.min(7, fy > fl ? fl + 1 : fl - 1)) : fl;
      for (let ix = -1; ix <= 1; ix++) {
        for (let iz = -1; iz <= 1; iz++) {
          for (let f = fl; ; f = fl2) {
            const cell = _grid.get(((cx + ix + 512) * 1024 + (cz + iz + 512)) * 8 + f);
            if (cell) {
              for (const b of cell) {
                if (b === a || Math.abs(b.pos.y - a.pos.y) > 0.6) continue;
                const dx = a.pos.x - b.pos.x;
                const dz = a.pos.z - b.pos.z;
                const r = SEP * (a.size + b.size) * 0.6;
                const d2 = dx * dx + dz * dz;
                if (d2 > r * r) continue;
                const d = Math.sqrt(d2) || 0.001;
                const w = (r - d) / r;
                // someone ahead of us: pass them on the side we're already on (or the left) — but not in a narrow
                // passage, where we just keep a step behind
                const ahead = -(dx * fx + dz * fz);
                if (ahead > 0.05 && tight > 0.3) {
                  const side = dx * fz - dz * fx >= 0 ? 1 : -1;
                  px += fz * side * w * 0.8;
                  pz += -fx * side * w * 0.8;
                }
                px += (dx / d) * w;
                pz += (dz / d) * w;
              }
            }
            if (f === fl2) break;
          }
        }
      }
      if (!px && !pz) continue;
      const m = Math.hypot(px, pz);
      const k = (Math.min(m, 1.2) / m) * dt * 1.1 * tight;
      const z0 = a.pos.z;
      a.pos.x += px * k;
      a.pos.z += pz * k;
      keepOff(a);
      // (in an upstairs corridor: never squeezed out over the parapet)
      if (a.pos.y > 3.5) parapet(a);
      // (on the footpath outside the wall: never squeezed into the wall or off the kerb)
      if (a.pos.y < 0.3 && a.pos.z > 44 && a.pos.z < 47 && goal.z > 44.4 && goal.z < KERB) a.pos.z = Math.min(46.2, Math.abs(a.pos.x) > 7.6 ? Math.max(44.62, a.pos.z) : a.pos.z);
      else kerb(a, goal, z0);
    }
  }
}
/**
 * In a doorway, on a stair, in a corridor or the gap beside the lines, people walk in single file: how much of
 * this step can `a` take without walking into the back of whoever is just ahead going the same way?
 * (1 = all of it, 0 = wait.) Someone coming the other way, or standing still out in the open, is passed instead.
 */
function followRoom(a, dirX, dirZ, narrow) {
  if (!_grid.size) return 1;
  const ax = a.pos.x + dirX * 0.4;
  const az = a.pos.z + dirZ * 0.4;
  const cx = Math.floor(ax);
  const cz = Math.floor(az);
  const fy = a.pos.y / 3.6;
  const fl = Math.max(0, Math.min(7, Math.round(fy)));
  const fl2 = Math.abs(fy - fl) > 0.33 ? Math.max(0, Math.min(7, fy > fl ? fl + 1 : fl - 1)) : fl;
  const keep = 0.36 * (a.size + 0.15); // (a step behind: about 0.36 m for a student)
  let room = 1;
  for (let ix = -1; ix <= 1; ix++) {
    for (let iz = -1; iz <= 1; iz++) {
      for (let f = fl; ; f = fl2) {
        const cell = _grid.get(((cx + ix + 512) * 1024 + (cz + iz + 512)) * 8 + f);
        if (cell) {
          for (const b of cell) {
            if (b === a || !b.active || Math.abs(b.pos.y - a.pos.y) > 0.5) continue;
            const dx = b.pos.x - a.pos.x;
            const dz = b.pos.z - a.pos.z;
            const ahead = dx * dirX + dz * dirZ;
            if (ahead <= 0.02 || ahead > keep + 0.3) continue;
            if (Math.abs(dx * dirZ - dz * dirX) > 0.26) continue; // (beside us, not in front)
            // only someone walking our way (or anyone at all in a narrow passage, unless they're coming at us)
            const same = Math.sin(b.heading) * dirX + Math.cos(b.heading) * dirZ;
            if (same < -0.2) continue;
            if (!narrow && !(b.moving && same > 0.4)) continue;
            // (two side by side at a merge, each a little ahead of the other: one of them gives way, not both)
            const back = -(dx * Math.sin(b.heading) + dz * Math.cos(b.heading));
            if (b.moving && back > 0.02 && Math.abs(dx * Math.cos(b.heading) - dz * Math.sin(b.heading)) < 0.26 && a.anim > b.anim) continue;
            room = Math.min(room, Math.max(0, (ahead - keep) / 0.3));
          }
        }
        if (f === fl2) break;
      }
    }
  }
  return room;
}

// a zone has a "path" strip (where the vehicle actually drives) and a wider waiting band around it
const sideOf = (z, x, y) => Math.abs((x - z.x) * z.fz - (y - z.z) * z.fx);
const alongOf = (z, x, y) => (x - z.x) * z.fx + (y - z.z) * z.fz;
const inZone = (z, x, y) => {
  const a = alongOf(z, x, y);
  return a > z.back && a < z.front && sideOf(z, x, y) < z.half;
};
/**
 * What someone on foot should do about the vehicles around them, given the step they want to take:
 * 0 = go ahead · 1 = wait (don't step into a vehicle's zone, or from the waiting band into its path)
 * · a zone object = they're standing in a vehicle's path ahead of it: step aside out of it
 */
const yieldTo = (x0, z0, x1, z1) => {
  // standing in a vehicle's path (ahead of its nose): get out of the way first, sideways
  for (const z of ZONES) {
    if (z.moving && inZone(z, x0, z0) && sideOf(z, x0, z0) < z.path && alongOf(z, x0, z0) > z.nose) return z;
  }
  for (const z of ZONES) {
    if (!inZone(z, x0, z0)) {
      if (inZone(z, x1, z1)) return 1; // don't step into a vehicle's zone
      continue;
    }
    if (sideOf(z, x0, z0) >= z.path && sideOf(z, x1, z1) < z.path) return 1; // nor from its edge into its path
  }
  return 0;
};

// raised floors at ground level: the plinth the three blocks stand on (and their corridors), the entrance
// porch, the library. Walking at ground level, your height comes from where you are — so you step up at the
// plinth's edge, not halfway across the paving
const RAISED = [
  { x0: -36.15, x1: 36.15, z0: -34.15, z1: -24.85, h: 0.48 }, // block A
  { x0: -36.15, x1: -26.85, z0: -25.0, z1: 8.15, h: 0.48 }, // block B
  { x0: 26.85, x1: 36.15, z0: -25.0, z1: 8.15, h: 0.48 }, // block C
  { x0: -5.5, x1: 5.5, z0: -20.85, z1: -15.8, h: 0.48 }, // the porch
  { x0: -75, x1: -53, z0: -50.5, z1: -40.45, h: 0.53 }, // the library
];
const GROUND = 0.08;
export function floorAt(x, z) {
  let y = GROUND;
  for (const r of RAISED) {
    const sd = Math.max(r.x0 - x, x - r.x1, r.z0 - z, z - r.z1); // < 0 inside
    if (sd > 0.12) continue;
    const t = sd < -0.12 ? 1 : 0.5 - sd / 0.24; // (a quick step up over the edge)
    y = Math.max(y, GROUND + (r.h - GROUND) * t);
  }
  return y;
}

/**
 * A lesson, on a loop (each teacher at their own point in it): explaining to the class, a few steps to the
 * board to write, back to the middle, across to the window side to point at someone with a question, back
 * again. s.teach = { mid, board, side: [x, z], face (towards the class), back (towards the board) }
 */
const LESSON = [
  { t: 7, at: 'mid', do: 'talk' },
  { t: 2.2, to: 'board' },
  { t: 6, at: 'board', do: 'write' },
  { t: 2.2, to: 'mid' },
  { t: 4, at: 'mid', do: 'talk' },
  { t: 2.4, to: 'side' },
  { t: 3, at: 'side', do: 'point' },
  { t: 2, at: 'side', do: 'talk' },
  { t: 2.4, to: 'mid' },
];
const LESSON_LEN = LESSON.reduce((n, l) => n + l.t, 0);
function teachAt(s, elapsed) {
  const T = s.teach;
  // (for checking the poses: window.__teachForce = 'write' | 'point' | 'talk0' …)
  const force = typeof window !== 'undefined' && window.__teachForce;
  if (force) return { x: T[force === 'write' ? 'board' : force === 'point' ? 'side' : 'mid'][0], z: T[force === 'write' ? 'board' : force === 'point' ? 'side' : 'mid'][1], heading: force === 'write' ? T.back : T.face, frame: force };
  let t = (elapsed + s.phase) % LESSON_LEN;
  let from = 'mid';
  for (const l of LESSON) {
    if (t < l.t) {
      if (l.at) {
        const [x, z] = T[l.at];
        const talkT = (elapsed * 0.5 + s.phase) % 4;
        const frame = l.do === 'write' ? 'write' : l.do === 'point' ? 'point' : `talk${talkT < 1.5 ? Math.floor(talkT * 2) % 3 : 3}`;
        return { x, z, heading: l.do === 'write' ? T.back : T.face, frame };
      }
      // walking between spots
      const [x0, z0] = T[from];
      const [x1, z1] = T[l.to];
      const k = t / l.t;
      const e = k * k * (3 - 2 * k);
      return { x: x0 + (x1 - x0) * e, z: z0 + (z1 - z0) * e, heading: Math.atan2(x1 - x0, z1 - z0), frame: `walk${Math.floor(((elapsed + s.phase) * 1.6) % 1 * 4)}` };
    }
    t -= l.t;
    if (l.to) from = l.to;
    else if (l.at) from = l.at;
  }
  const [x, z] = T.mid;
  return { x, z, heading: T.face, frame: 'talk3' };
}

/** moves one person along their route; returns true while they're walking */
function step(a, dt, tmp) {
  if (a.holdT > 0) {
    // waiting for a friend (or their turn at a door)
    a.holdT -= dt;
    return false;
  }
  if (a.path && a.seg < a.path.length) {
    const goal = a.path[a.seg];
    tmp.subVectors(goal, a.pos);
    tmp.y = 0;
    const d = tmp.length();
    const speed = (a.run ? 3.0 : 1.2 * (a.pace || 1)) * a.size;
    if (a.segLen < 0) a.segLen = Math.max(d, 0.001);
    // a watchdog: anyone making no headway for a while (hemmed in by others, or a vehicle that's waiting for
    // them) stops giving way for a few seconds and walks on through
    if (a.goalRef !== goal || d < a.bestD - 0.3) {
      a.goalRef = goal;
      a.bestD = d;
      a.stuckT = 0;
    } else if ((a.stuckT += dt) > 8) {
      a.force = 3;
      a.stuckT = 0;
      a.bestD = d;
      // held up by a vehicle standing in the way: go round its nearer end
      if (a.pos.y < 0.3) {
        for (const b of BODIES) {
          if (!inBody(b, a.pos.x, a.pos.z, PAD + 0.6)) continue;
          let best = null;
          let bd = Infinity;
          for (const su of [-1, 1]) {
            for (const sv of [-1, 1]) {
              const u = su * (b.hl + PAD + 0.45);
              const v = sv * (b.hw + PAD + 0.45);
              const cx = b.x + b.fx * u + b.fz * v;
              const cz = b.z + b.fz * u - b.fx * v;
              // (never out onto the road, nor into another vehicle)
              if (cz > KERB - 0.1 && goal.z < KERB) continue;
              // (nor through the compound wall: it only opens at the gate)
              if ((a.pos.z > 44.2) !== (cz > 44.2) && (Math.abs(cx) > 7 || Math.abs(a.pos.x) > 7)) continue;
              if (BODIES.some((o) => o !== b && inBody(o, cx, cz))) continue;
              const L = Math.hypot(cx - a.pos.x, cz - a.pos.z) + Math.hypot(goal.x - cx, goal.z - cz);
              if (L < bd) [bd, best] = [L, [cx, cz]];
            }
          }
          if (best) {
            const c = Object.assign(new THREE.Vector3(best[0], goal.y, best[1]), { hold: 0 });
            a.path.splice(a.seg, 0, c);
            a.segLen = -1;
            a.y0 = a.pos.y;
          }
          break;
        }
      }
    }
    if (a.force > 0) a.force -= dt;
    const giveWay = !(a.force > 0);
    if (d < 0.22) {
      a.pos.y = goal.y;
      // (the last step onto an exact spot — a desk, a place in line — lands right on it)
      if (goal.exact && a.seg === a.path.length - 1) {
        a.pos.x = goal.x;
        a.pos.z = goal.z;
      }
      a.seg++;
      a.y0 = a.pos.y;
      a.segLen = -1;
      if (goal.hold > 0) a.holdT = goal.hold;
      if (a.seg >= a.path.length) {
        a.wait = a.waitAfter || 0;
        if (!a.wait) {
          const cb = a.onArrive;
          a.onArrive = null;
          cb?.(a);
        }
      }
      return false;
    }
    tmp.normalize();
    let stepLen = Math.min(d, speed * dt);
    // keep a step behind whoever's ahead in a narrow place (a door, a stair, a corridor, a lane)
    if (giveWay && !a.run) {
      const near = Math.abs(goal.x - a.pos.x) + Math.abs(goal.z - a.pos.z) < 2.6;
      const narrow = goal.exact || (goal.narrow && near) || a.pos.y > 0.3;
      if (narrow || goal.narrow || goal.squeeze !== undefined) {
        const room = followRoom(a, tmp.x, tmp.z, narrow);
        if (room < 1) {
          stepLen *= room;
          if (stepLen < 1e-4) return false;
        }
      }
    }
    // a vehicle turning at the gate: wait till it's through
    // (only those about to cross the footpath in the gateway: someone just inside, heading in, carries on; and
    // nobody waits for ever)
    if (giveWay && GATE_HOLD && a.pos.z > 38 && !inGateBox(a.pos.x, a.pos.z) && inGateBox(a.pos.x + tmp.x * (stepLen + 0.3), a.pos.z + tmp.z * (stepLen + 0.3)) && (a.pos.z > 42.4 || goal.z > 43.7)) {
      a.gateT = (a.gateT || 0) + dt;
      if (a.gateT < 12) return false;
    } else if (a.gateT) a.gateT = Math.max(0, a.gateT - dt);
    // look out for vehicles: wait at the edge, or step aside if one is coming at you
    if (giveWay && a.pos.y < 0.3 && ZONES.length) {
      const y = yieldTo(a.pos.x, a.pos.z, a.pos.x + tmp.x * (stepLen + 0.35), a.pos.z + tmp.z * (stepLen + 0.35));
      if (y === 1) {
        // waiting for a vehicle to pass (but nobody waits for ever: after a while they edge on)
        a.yieldT = (a.yieldT || 0) + dt;
        if (a.yieldT < 7) return false;
        if (a.yieldT > 8) a.yieldT = 0;
      } else a.yieldT = 0;
      if (y && y !== 1) {
        const s = (a.pos.x - y.x) * y.fz - (a.pos.z - y.z) * y.fx >= 0 ? 1 : -1;
        tmp.set(y.fz * s, 0, -y.fx * s);
        a.pos.addScaledVector(tmp, Math.min(speed, 1.4) * dt);
        a.heading += Math.atan2(Math.sin(Math.atan2(tmp.x, tmp.z) - a.heading), Math.cos(Math.atan2(tmp.x, tmp.z) - a.heading)) * Math.min(1, dt * 7);
        return true;
      }
    }
    // (a narrow point is on a passage laid out clear of everything, like the aisle between parked buses)
    if (a.pos.y < 0.3 && BODIES.length && !goal.narrow) {
      const z0 = a.pos.z;
      const o = clearOfVehicles(a, goal, tmp.x * stepLen, tmp.z * stepLen);
      a.pos.x += o.x;
      a.pos.z += o.z;
      kerb(a, goal, z0);
    } else {
      const z0 = a.pos.z;
      a.pos.addScaledVector(tmp, stepLen);
      if (a.pos.y < 0.3 && a.pos.z > 43 && a.pos.z < 45) wall(a, goal, z0);
    }
    // height: at ground level, the floor where you're standing; on stairs it follows the walk smoothly
    if (a.y0 < 0.6 && goal.y < 0.6) a.pos.y = floorAt(a.pos.x, a.pos.z);
    else {
      const k = Math.min(1, Math.max(0, (d - stepLen) / a.segLen));
      a.pos.y = goal.y + (a.y0 - goal.y) * k;
    }
    const want = Math.atan2(tmp.x, tmp.z);
    let diff = want - a.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    a.heading += diff * Math.min(1, dt * 7);
    return true;
  }
  if (a.wait > 0) {
    a.wait -= dt;
    if (a.face !== null) {
      let diff = a.face - a.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.heading += diff * Math.min(1, dt * 4);
    }
    if (a.wait <= 0) {
      const cb = a.onArrive;
      a.onArrive = null;
      cb?.(a);
    }
  }
  return false;
}

// things standing in the open that nobody walks over: routes are bent round them
const OBSTACLES = [
  { x0: -2.1, x1: 2.1, z0: -13.1, z1: -8.9 }, // the flag platform
  { x0: -5.5, x1: 5.5, z0: -25.0, z1: -15.65 }, // the clock tower and its porch (with the columns): walked round, never across
  { x0: -10.05, x1: -9.45, z0: 41.3, z1: 41.9 }, // the watchman at the gate
  { x0: -13.8, x1: -10.2, z0: 39.9, z1: 43.0 }, // his guard house
  { x0: -0.78, x1: -0.22, z0: 40.75, z1: 43.0 }, // the median between the walkers' lane and the vehicles'
  { x0: -20.2, x1: -13.8, z0: 18.3, z1: 24.7 }, // the fountain's basin
  { x0: -60.6, x1: -51.4, z0: 29.4, z1: 38.6 }, // the island in the drop-off loop
  { x0: -62.7, x1: -49.3, z0: 22.3, z1: 23.2 }, // the canopy's columns and benches
  { x0: -49.9, x1: -49.3, z0: 41.1, z1: 41.7 }, // the guard at the drop-off gate
  // the courtyard benches against the wings
  ...[[-26.15, -20], [-26.15, -11.2], [26.15, -20], [26.15, -12.8]].map(([x, z]) => ({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.9, z1: z + 0.9 })),
];
/** the upstairs corridors: their courtyard edge (the parapet) is 8.75 m from each block's outer wall */
function parapet(a) {
  const { x, z } = a.pos;
  if (z > -27.8 && z < -24.9 && Math.abs(x) < 27.2) a.pos.z = Math.min(z, -25.4);
  else if (z > -25 && z < 8.3) {
    if (x > -30 && x < -26.6) a.pos.x = Math.min(x, -27.4);
    else if (x < 30 && x > 26.6) a.pos.x = Math.max(x, 27.4);
  }
}
/** someone jostled onto an obstacle steps straight back off it, to the nearest side */
function keepOff(a) {
  if (a.pos.y > 0.3) return;
  for (const o of OBSTACLES) {
    const P = 0.25;
    const l = a.pos.x - (o.x0 - P);
    const r = o.x1 + P - a.pos.x;
    const b = a.pos.z - (o.z0 - P);
    const f = o.z1 + P - a.pos.z;
    if (l <= 0 || r <= 0 || b <= 0 || f <= 0) continue;
    const m = Math.min(l, r, b, f);
    if (m === l) a.pos.x -= l;
    else if (m === r) a.pos.x += r;
    else if (m === b) a.pos.z -= b;
    else a.pos.z += f;
  }
}
const crosses = (o, ax, az, bx, bz, pad) => {
  // does the segment a→b pass through the box (grown by pad)? (Liang–Barsky clipping)
  const x0 = o.x0 - pad, x1 = o.x1 + pad, z0 = o.z0 - pad, z1 = o.z1 + pad;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
};
/** bends a route round the obstacles: the shortest way past via one or two of the box's corners */
function detour(start, path, spread = 0) {
  // (a few passes: going round one thing can lead across another)
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const o of OBSTACLES) {
      // starting on it (jostled there, or put there by a jump in time): first step off to the nearest side
      if (pass === 0 && start.y < 0.3 && start.x > o.x0 - 0.4 && start.x < o.x1 + 0.4 && start.z > o.z0 - 0.4 && start.z < o.z1 + 0.4) {
        const opts = [[o.x0 - 0.55, start.z], [o.x1 + 0.55, start.z], [start.x, o.z0 - 0.55], [start.x, o.z1 + 0.55]];
        let e = opts[0];
        for (const q of opts) if (Math.hypot(q[0] - start.x, q[1] - start.z) < Math.hypot(e[0] - start.x, e[1] - start.z)) e = q;
        path.unshift(Object.assign(new THREE.Vector3(e[0], start.y, e[1]), { hold: 0 }));
        changed = true;
      }
      for (let i = 0; i < path.length; i++) {
        const a = i ? path[i - 1] : start;
        const b = path[i];
        if (a.y > 0.3 || b.y > 0.3 || !crosses(o, a.x, a.z, b.x, b.z, 0.4)) continue;
        // (everyone rounds the corner a little differently, so a crowd crossing in front of something doesn't all
        // tread the one spot)
        const P = 0.6 + spread * 1.1;
        const c = [[o.x0 - P, o.z0 - P], [o.x1 + P, o.z0 - P], [o.x1 + P, o.z1 + P], [o.x0 - P, o.z1 + P]];
        const clear = (p, q) => !crosses(o, p[0], p[1], q[0], q[1], 0.38);
        const A = [a.x, a.z];
        const B = [b.x, b.z];
        const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
        let best = null;
        let bestLen = Infinity;
        for (let k = 0; k < 4; k++) {
          if (clear(A, c[k]) && clear(c[k], B)) {
            const L = d(A, c[k]) + d(c[k], B);
            if (L < bestLen) [best, bestLen] = [[c[k]], L];
          }
          for (const s of [1, 3]) {
            const k2 = (k + s) % 4;
            if (clear(A, c[k]) && clear(c[k2], B)) {
              const L = d(A, c[k]) + d(c[k], c[k2]) + d(c[k2], B);
              if (L < bestLen) [best, bestLen] = [[c[k], c[k2]], L];
            }
          }
        }
        if (!best) continue;
        const pts = best.map(([x, z]) => Object.assign(new THREE.Vector3(x, b.y, z), { hold: 0 }));
        path.splice(i, 0, ...pts);
        i += pts.length;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/**
 * shared route bookkeeping for both kinds of people
 * - each person walks a little to one side of the shared route (a.off), except at points marked exact
 * - lateral: friends walking together keep side by side, this far to the right of the route
 *   (points marked narrow — stairs, doors — squeeze them closer)
 * - holdAt: { pointIndex: seconds } to wait at a point (for friends to catch up, or a turn at a door)
 */
function setRoute(a, points, { run = false, onArrive = null, wait = 0, face = null, pace = 1, lateral = 0, holdAt = null, talk = false } = {}) {
  const n = points.length;
  a.path = points.map((p) => {
    const c = p.clone();
    c.exact = p.exact;
    c.narrow = p.narrow;
    c.squeeze = p.squeeze;
    c.stair = p.stair;
    c.hold = 0;
    return c;
  });
  // on a staircase there's room for two abreast: each person keeps to one side of the flight (friends side by
  // side), so a class going up flows in two files instead of one
  const lane = (lateral ? Math.sign(lateral) : a.anim < 0.5 ? -1 : 1) * 0.3;
  const jitter = lateral ? 0.25 : 1;
  for (let i = 0; i < n; i++) {
    const c = a.path[i];
    if (c.exact) continue;
    if (c.stair) {
      const prev = i > 0 ? points[i - 1] : a.pos;
      const next = i < n - 1 ? points[i + 1] : points[i];
      const dx = (i === n - 1 ? points[i].x : next.x) - prev.x;
      const dz = (i === n - 1 ? points[i].z : next.z) - prev.z;
      const l = Math.hypot(dx, dz) || 1;
      c.x += (dz / l) * lane;
      c.z += (-dx / l) * lane;
      continue;
    }
    if (lateral) {
      // perpendicular to the direction of travel through this point
      const prev = i > 0 ? points[i - 1] : a.pos;
      const next = i < n - 1 ? points[i + 1] : points[i];
      let dx = next.x - prev.x;
      let dz = next.z - prev.z;
      if (i === n - 1) {
        dx = points[i].x - prev.x;
        dz = points[i].z - prev.z;
      }
      const l = Math.hypot(dx, dz) || 1;
      const s = lateral * (c.narrow ? 0.4 : (c.squeeze ?? 1));
      c.x += (dz / l) * s;
      c.z += (-dx / l) * s;
    }
    if (a.off && i < n - 1 && !c.narrow) {
      const q = c.squeeze ?? 1;
      c.x += a.off.x * jitter * q;
      c.z += a.off.z * jitter * q;
    }
  }
  if (holdAt) for (const [i, t] of Object.entries(holdAt)) if (a.path[i]) a.path[i].hold = t;
  detour(a.pos, a.path, (a.anim * 7.31 + (a.routes || 0) * 0.618 + Math.abs(a.pos.x) * 0.37) % 1);
  a.routes = (a.routes || 0) + 1; // (for the debug tools: how often this person has been given a new route)
  a.seg = 0;
  a.y0 = a.pos.y;
  a.segLen = -1;
  a.holdT = 0;
  a.run = run;
  a.pace = pace;
  a.talk = talk;
  a.onArrive = onArrive;
  a.wait = n ? 0 : wait;
  a.waitAfter = wait;
  a.face = face;
}

// uniforms: shirt, trousers/skirt, tie (and its stripe), skin, hair, belt (or saree border, and its trim), socks, shoes
// teachers: everyone wears the navy lanyard with the white TEACHER badge; the men in a light-blue check shirt (with
// glasses), a dark navy shirt with grey trousers (glasses and a beard) or a cream shirt with black trousers (stubble);
// the women in sarees, maroon with a beige border or olive green with a maroon one, a bindi, hair tied back
// students: a navy blazer piped in gold with the crest on its breast pocket, a white shirt, a maroon-and-navy striped
// tie, grey trousers (or a grey pleated skirt with white knee socks) and black shoes
// (for the students the shader reads `belt` as the blazer's colour and `trim` as its gold piping)
const SCHOOL = { shirt: '#f3f3ef', pants: '#6a6d74', tie: '#7a1f2b', tie2: '#1d2b4f', belt: '#16203d', socks: '#25272c', shoe: '#0b0b0b', trim: '#c9a24a', tieOn: 1 };
const PALETTES = {
  boy: { ...SCHOOL, skin: '#9c6a4a', hair: '#110c09', girl: 0 },
  boy2: { ...SCHOOL, skin: '#7f5236', hair: '#0f0b08', girl: 0 },
  girl: { ...SCHOOL, skin: '#a8744f', hair: '#100b08', socks: '#f1f1ec', girl: 1 },
  girlP: { ...SCHOOL, skin: '#9a6a48', hair: '#120c09', socks: '#f1f1ec', girl: 1 }, // (the girls with ponytails)
  teacher: { shirt: '#b7d0ea', pants: '#2b2e35', tie: '#b7d0ea', tie2: '#b7d0ea', skin: '#8a5a3c', hair: '#1a1410', belt: '#111111', socks: '#22252b', shoe: '#2b1a10', trim: '#111111', tieOn: 0, girl: 0, glasses: 1, check: 1, teach: 1 },
  teacher2: { shirt: '#1f2a44', pants: '#6c7078', tie: '#1f2a44', tie2: '#1f2a44', skin: '#9a6748', hair: '#1b1816', belt: '#111111', socks: '#22252b', shoe: '#1a1210', trim: '#111111', tieOn: 0, girl: 0, glasses: 1, beard: 1, teach: 1 },
  teacher3: { shirt: '#eadfc3', pants: '#19191b', tie: '#eadfc3', tie2: '#eadfc3', skin: '#7c5034', hair: '#0f0c0a', belt: '#1a120c', socks: '#19191b', shoe: '#2b1a10', trim: '#111111', tieOn: 0, girl: 0, beard: 0.45, teach: 1 },
  teacherF: { shirt: '#d9c49b', pants: '#7a2030', tie: '#7a2030', tie2: '#7a2030', skin: '#9a6545', hair: '#100b08', belt: '#dcc79a', socks: '#7a2030', shoe: '#3a2414', trim: '#a8833c', tieOn: 0, girl: 1, saree: 1, teach: 1 },
  teacherF2: { shirt: '#56602a', pants: '#6f7432', tie: '#6f7432', tie2: '#6f7432', skin: '#a06c4a', hair: '#120c09', belt: '#7a2430', socks: '#6f7432', shoe: '#3a2414', trim: '#d2b05a', tieOn: 0, girl: 1, saree: 1, teach: 1 },
  teacherF3: { shirt: '#7a2030', pants: '#dccaa2', tie: '#dccaa2', tie2: '#dccaa2', skin: '#8e5d3e', hair: '#0e0a08', belt: '#7a2030', socks: '#dccaa2', shoe: '#3a2414', trim: '#c9a24a', tieOn: 0, girl: 1, saree: 1, teach: 1 },
  // games kit: cricket and tennis whites
  whites: { shirt: '#f5f3ee', pants: '#eeebe3', tie: '#f5f3ee', tie2: '#f5f3ee', skin: '#8f5e40', hair: '#120d0a', belt: '#e6e1d6', socks: '#f2f2ee', shoe: '#ecebe6', trim: '#eeebe3', tieOn: 0, girl: 0 },
  // the watchman at the gate: khaki shirt and trousers, a dark peaked cap, a moustache
  guard: { shirt: '#b39d6c', pants: '#5a4e33', tie: '#b39d6c', tie2: '#b39d6c', skin: '#7a4e33', hair: '#141110', belt: '#1a140e', socks: '#1a1a1a', shoe: '#0d0d0d', trim: '#2a2c33', tieOn: 0, girl: 0, beard: 0.7, guard: 1 },
};
export const MALE_TEACHERS = ['teacher', 'teacher2', 'teacher3'];
export const FEMALE_TEACHERS = ['teacherF', 'teacherF2', 'teacherF3'];

// cloth that isn't part of the body carries a marker instead of a body position: y = 3, x = what it is
const MARK = { book: 1, notebook: 2, hair: 3, border: 4, trim: 5, page: 6, band: 7 };

// one shader for every uniform: the colours and the few differences are uniforms, so the graphics card
// compiles it once, not once per kind. Each region of the figure is found from its rest-pose position.
// (An instanced student's skin tone comes in the instance colour's red channel; blue lower than red means
// they're wearing their backpack, so the straps are painted over the shoulders.)
const UNIFORM_FRAGMENT = `
        {
          vec3 b = vB; float ax = abs(b.x);
          float tone = 1.0; float bagOn = 0.0;
          #ifdef USE_COLOR
            tone = vColor.r; bagOn = step(0.2, vColor.r - vColor.b);
          #endif
          vec3 skin = u_skin * tone;
          vec3 col = u_pants;
          if (b.y > 2.5) {
            float code = floor(b.x + 0.5);
            col = code < 1.5 ? vec3(0.42, 0.13, 0.15) : code < 2.5 ? vec3(0.16, 0.3, 0.58) : code < 3.5 ? u_hair : code < 4.5 ? u_belt : code < 5.5 ? u_trim : code < 6.5 ? vec3(0.92, 0.9, 0.84) : vec3(0.1, 0.13, 0.3);
            if (code > 2.5 && code < 3.5) {
              // hair: tight curls for the boys, long strands with a sheen for the girls and women
              vec2 h = vec2(b.z * 0.1, b.y - 3.0);
              float n = sin(h.x * 230.0 + sin(h.y * 170.0) * 2.0) * sin(h.y * 210.0 + sin(h.x * 190.0) * 2.0);
              col *= u_flags.x > 0.5 ? 0.85 + 0.45 * smoothstep(0.55, 1.0, sin(h.x * 160.0 + sin(h.y * 30.0))) : 0.7 + 0.6 * smoothstep(-0.1, 0.9, n);
            }
          } else {
            if (b.y > 0.95) {
              col = u_shirt;
              if (u_flags2.z > 0.5) col *= 1.0 - 0.24 * max(step(0.8, fract(b.x * 36.0)), step(0.8, fract(b.y * 36.0))); // a check shirt
            }
            if (b.y > 1.18 && ax > 0.4 && u_flags.w < 0.5) col = skin; // short sleeves, to halfway down the upper arm
            if ((b.y > 1.535 && ax < 0.2) || (b.y > 1.49 && ax < 0.062)) col = skin; // the neck and head (the shirt's collar sits round the neck)
            if (u_flags.w > 0.5) {
              // the school blazer: navy, down to the wrists and the hips, open in a V at the front over the shirt and tie
              bool arm = ax > 0.19 && b.y > 1.3;
              float vw = (b.y - 1.205) * 0.26; // half the width of the V (nothing at the top button, wide at the collar)
              if (b.y > 0.9 && b.y < 1.505 && ax < 0.69 && !(b.y > 1.49 && ax < 0.062)) {
                col = u_belt;
                if (!arm && b.z > 0.055 && b.y > 1.205 && ax < vw) col = u_shirt;
                if (!arm && b.z > 0.055 && b.y > 1.205 && b.y < 1.47 && abs(ax - vw) < 0.0055) col = u_trim; // gold-piped lapels
                if (!arm && b.y < 0.913) col = u_trim; // and hem
                if (arm && ax > 0.648 && ax < 0.659) col = u_trim; // and cuffs
                if (!arm && b.z > 0.075 && ax < 0.011 && (abs(b.y - 1.183) < 0.0095 || abs(b.y - 1.095) < 0.0095)) col = u_trim; // gold buttons
                if (!arm && b.z > 0.075 && ax > 0.07 && ax < 0.15 && abs(b.y - 1.03) < 0.006) col = u_belt * 0.55; // pocket flaps
                // the breast pocket (on the left), the school crest above it
                if (b.z > 0.075 && b.x > 0.052 && b.x < 0.128 && abs(b.y - 1.302) < 0.0035) col = u_trim;
                vec2 q = vec2(b.x - 0.09, b.y - 1.338);
                if (b.z > 0.075 && abs(q.x) < 0.02 && q.y < 0.021 && q.y > -0.024 + abs(q.x) * 0.9) {
                  col = q.x < 0.0 ? vec3(0.1, 0.14, 0.3) : vec3(0.42, 0.11, 0.15);
                  if (abs(q.x) > 0.015 || q.y > 0.016 || q.y < -0.019 + abs(q.x) * 0.9) col = u_trim;
                  if (length(q - vec2(0.0, 0.0)) < 0.0055) col = vec3(0.98, 0.78, 0.3);
                }
              }
              if (b.y > 1.455 && b.y < 1.505 && ax < 0.082 && b.z > -0.01) col = u_shirt; // the white shirt collar
              if (b.y > 1.3 && ax > 0.69) col = skin; // hands
            }
            if (b.y > 1.6 && ax < 0.2 && b.z < 0.035) col = u_hair;
            if (u_flags.x > 0.5 && b.y > 1.55 && ax < 0.2 && b.z < 0.05) col = u_hair; // longer hair at the nape
            if (b.y > 1.71) col = u_hair;
            if (b.y > 0.9 && b.y <= 0.95 && u_flags.w < 0.5) col = u_belt;
            if (u_flags.y > 0.5 && b.y < 0.6) col = skin; // below a school skirt
            if (b.y < (u_flags.y > 0.5 ? 0.43 : 0.16)) col = u_socks; // (white knee socks with the skirt)
            if (b.y < 0.085) col = u_shoe;
            if (u_flags.z > 0.5 && b.y > 1.18 && b.y < 1.3 && ax < 0.36 && ax > 0.05) col = skin; // a saree blouse leaves the midriff bare
            if (u_flags.w > 0.5) {
              // the school tie in maroon with broad navy stripes, showing in the V of the blazer
              float tw = 0.016 + (1.46 - b.y) * 0.05; // narrow at the knot, wider towards the tip
              float vw2 = (b.y - 1.205) * 0.26;
              if (ax < tw && ax < vw2 - 0.006 && b.z > 0.075 && b.y > 1.205 && b.y < 1.47) col = fract((b.y + b.x * 0.9) * 22.0) < 0.38 ? u_tie2 : u_tie;
            }
            // backpack straps over both shoulders
            float sx = 0.098 + (1.46 - b.y) * 0.07; // each strap runs from the shoulder down towards the armpit
            if (bagOn > 0.5 && b.y > 1.12 && b.y < 1.49 && abs(ax - sx) < 0.0115 && (b.z > -0.02 || b.y > 1.42)) col = vec3(0.045);
            // the teacher's lanyard and white badge
            if (u_flags2.w > 0.5 && b.z > 0.035 && b.y < 1.5) {
              if (b.y > 1.27 && b.y < 1.48 && abs(ax - 0.078 * (b.y - 1.27) / 0.21) < 0.0075) col = vec3(0.08, 0.12, 0.3);
              if (b.y > 1.185 && b.y < 1.272 && ax < 0.031 && b.z > 0.08) {
                col = vec3(0.96);
                if (b.y > 1.212 && b.y < 1.236 && ax < 0.022) col = vec3(0.1, 0.13, 0.32); // TEACHER
                if (b.y > 1.25) col = vec3(0.08, 0.12, 0.3);
              }
            }
            // the face
            if (b.y > 1.53 && b.y < 1.75 && b.z > 0.075 && ax < 0.088) {
              if (u_flags2.y > 0.0 && b.y < 1.618) col = mix(skin, u_hair, u_flags2.y * 0.85); // beard or stubble
              vec2 e = vec2(ax - 0.033, b.y - 1.666);
              if (length(e / vec2(0.0155, 0.0095)) < 1.0) col = vec3(0.93, 0.91, 0.87);
              if (length(e / vec2(0.0075, 0.0085)) < 1.0) col = vec3(0.06, 0.04, 0.03);
              if (ax > 0.014 && ax < 0.052 && abs(b.y - 1.689 - (ax - 0.033) * (ax - 0.033) * -6.0) < 0.0042) col = u_hair * 0.9; // eyebrows
              if (ax < 0.021 && abs(b.y - 1.589) < 0.0042) col = mix(skin, vec3(0.42, 0.13, 0.13), 0.65); // lips
              if (ax < 0.009 && b.y > 1.6 && b.y < 1.645) col *= 0.9; // the nose's shadow
              if (u_flags2.x > 0.5) {
                float r = length(e / vec2(0.0235, 0.017));
                if ((r > 0.8 && r < 1.0) || (ax < 0.0095 && abs(b.y - 1.669) < 0.0025)) col = vec3(0.05); // glasses
              }
              if (u_flags.z > 0.5 && length(vec2(b.x, b.y - 1.699)) < 0.0058) col = vec3(0.72, 0.04, 0.08); // bindi
            }
          }
          diffuseColor.rgb *= col;
        }`;

function uniformMaterial(name) {
  const P = PALETTES[name];
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.78 });
  const flags = new THREE.Vector4(P.girl ? 1 : 0, name === 'girl' || name === 'girlP' ? 1 : 0, P.saree ? 1 : 0, P.tieOn ? 1 : 0);
  const flags2 = new THREE.Vector4(P.glasses ? 1 : 0, P.beard || 0, P.check ? 1 : 0, P.teach ? 1 : 0);
  m.onBeforeCompile = (sh) => {
    for (const k of ['shirt', 'pants', 'tie', 'tie2', 'skin', 'hair', 'belt', 'trim', 'socks', 'shoe']) sh.uniforms['u_' + k] = { value: new THREE.Color(P[k]) };
    sh.uniforms.u_flags = { value: flags };
    sh.uniforms.u_flags2 = { value: flags2 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 bindPos;\nvarying vec3 vB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvB = bindPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vB;\nuniform vec3 u_shirt, u_pants, u_tie, u_tie2, u_skin, u_hair, u_belt, u_trim, u_socks, u_shoe;\nuniform vec4 u_flags, u_flags2;')
      .replace('#include <color_fragment>', UNIFORM_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'uniform2';
  return m;
}

function skinnedParts(root) {
  const list = [];
  root.traverse((o) => o.isSkinnedMesh && list.push(o));
  return list;
}

// extra bone rotations for poses the file doesn't have
// teaching: the right hand up at the board with chalk; pointing at the class
// (the rig's upper-arm bone raises the arm forward about its local y axis, out to the side about -z)
const WRITE = [['RightArm', 0, 1.9, -0.3], ['RightForeArm', 0, 0.7, 0]];
const POINT = [['RightArm', 0, 1.35, -0.55]];
const SIT = [
  ['LeftUpLeg', -1.55, 0, 0], ['RightUpLeg', -1.55, 0, 0], ['LeftLeg', 1.55, 0, 0], ['RightLeg', 1.55, 0, 0],
  ['LeftArm', -0.5, 0, 0], ['RightArm', 0.5, 0, 0], ['LeftForeArm', 0, 0, -1.3], ['RightForeArm', 0, 0, 1.3], ['Spine', 0.12, 0, 0],
];

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
/** where the joints that clothes hang from are, for a posed copy of the figure (in `space`'s frame if given) */
function jointsOf(copy, space = null) {
  const get = (n) => copy.getObjectByName('mixamorig' + n);
  const P = (n) => {
    const v = get(n).getWorldPosition(new THREE.Vector3());
    return space ? space.worldToLocal(v) : v;
  };
  const inv = space ? space.getWorldQuaternion(new THREE.Quaternion()).invert() : null;
  const Q = (n) => {
    const q = get(n).getWorldQuaternion(new THREE.Quaternion());
    return inv ? q.premultiply(inv) : q;
  };
  return {
    hips: P('Hips'), upL: P('LeftUpLeg'), upR: P('RightUpLeg'), kneeL: P('LeftLeg'), kneeR: P('RightLeg'), footL: P('LeftFoot'), footR: P('RightFoot'),
    spine2: P('Spine2'), neck: P('Neck'), head: P('Head'), headQ: Q('Head'), shL: P('LeftArm'), shR: P('RightArm'),
    handL: P('LeftHand'), handR: P('RightHand'), handLQ: Q('LeftHand'), handRQ: Q('RightHand'),
    hipsQ: Q('Hips'), spine: P('Spine'), spineQ: Q('Spine'), spine1: P('Spine1'), spine1Q: Q('Spine1'), spine2Q: Q('Spine2'),
    shLQ: Q('LeftArm'), shRQ: Q('RightArm'), elL: P('LeftForeArm'), elR: P('RightForeArm'), elLQ: Q('LeftForeArm'), elRQ: Q('RightForeArm'),
    upLQ: Q('LeftUpLeg'), upRQ: Q('RightUpLeg'), kneeLQ: Q('LeftLeg'), kneeRQ: Q('RightLeg'),
  };
}

// The figure's own body is a robot's shell (a chest plate, a pelvis bowl, a ball between): the middle of it is cut
// away and a shirt is put in its place, an elliptical tube that bends with the spine, from the belt to the chest.
// Rings at rest: height, half width, half depth, centre depth, and the bone each ring moves with
const TORSO_RINGS = [
  [0.8, 0.06, 0.045, -0.005, 'hips'], // (closed underneath)
  [0.855, 0.19, 0.122, -0.008, 'hips'],
  [0.925, 0.203, 0.13, -0.005, 'hips'],
  [1.0, 0.176, 0.122, -0.01, 'hips'],
  [1.1, 0.158, 0.11, -0.006, 'spine'],
  [1.2, 0.152, 0.116, 0.006, 'spine1'],
  [1.315, 0.142, 0.127, 0.02, 'spine2'],
];
// the arms and legs too: the shell's jointed limbs give way to smooth sleeves, arms, trouser legs and shins
// (the shoulders, hands, feet and head stay). Built once from the figure at rest — see makeBodyTubes
let BODY = null; // { tubes: [{ rings: [{ c, a, b, ra, rb, bone }] }], shX, wrX, ankleY }
const CUT = (x, y) => {
  if (y > 0.935 && y < 1.305 && Math.abs(x) < 0.26) return true; // the torso
  if (!BODY) return false;
  const ax = Math.abs(x);
  if (y > 1.25 && ax > BODY.shX + 0.03 && ax < BODY.wrX - 0.01) return true; // the arms (from just past the shoulder to the wrist)
  if (y > BODY.ankleY + 0.035 && y < 0.95 && ax < 0.3) return true; // the legs and the hips (to the ankles)
  return false;
};
// which rest-pose joint (position, rotation) each ring moves with
const BONE_JOINT = {
  hips: ['hips', 'hipsQ', 'Hips'], spine: ['spine', 'spineQ', 'Spine'], spine1: ['spine1', 'spine1Q', 'Spine1'], spine2: ['spine2', 'spine2Q', 'Spine2'],
  shL: ['shL', 'shLQ', 'LeftArm'], shR: ['shR', 'shRQ', 'RightArm'], elL: ['elL', 'elLQ', 'LeftForeArm'], elR: ['elR', 'elRQ', 'RightForeArm'],
  upL: ['upL', 'upLQ', 'LeftUpLeg'], upR: ['upR', 'upRQ', 'RightUpLeg'], knL: ['kneeL', 'kneeLQ', 'LeftLeg'], knR: ['kneeR', 'kneeRQ', 'RightLeg'],
};
function makeBodyTubes() {
  const R = REST;
  const tubes = [];
  // the torso
  tubes.push({ rings: TORSO_RINGS.map(([y, ra, rb, cz, bone]) => ({ c: new THREE.Vector3(0, y, cz), a: X, b: Z, ra, rb, bone })) });
  const axesFor = (from, to, up) => {
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const a = up.clone().addScaledVector(dir, -up.dot(dir)).normalize();
    const b = new THREE.Vector3().crossVectors(dir, a).normalize();
    return [a, b];
  };
  for (const s of ['L', 'R']) {
    // an arm: round shoulder, the upper arm (short sleeve, then skin), the elbow, the forearm to the wrist
    const sh = R['sh' + s];
    const el = R['el' + s];
    const wr = R['hand' + s];
    const [ua, ub] = axesFor(sh, el, Y);
    const [fa, fb] = axesFor(el, wr, Y);
    const ring = (c, a, b, r, bone, k = 1) => ({ c, a, b, ra: r, rb: r * k, bone });
    tubes.push({
      rings: [
        ring(sh.clone().lerp(el, -0.06), ua, ub, 0.058, 'sh' + s),
        ring(sh.clone().lerp(el, 0.12), ua, ub, 0.062, 'sh' + s, 1.02),
        ring(sh.clone().lerp(el, 0.45), ua, ub, 0.052, 'sh' + s),
        ring(sh.clone().lerp(el, 0.9), ua, ub, 0.045, 'sh' + s),
        ring(el.clone().lerp(wr, 0.1), fa, fb, 0.044, 'el' + s),
        ring(el.clone().lerp(wr, 0.55), fa, fb, 0.04, 'el' + s),
        ring(el.clone().lerp(wr, 0.97), fa, fb, 0.032, 'el' + s),
      ],
    });
    // a leg: from inside the hips down the thigh, the knee, the shin to the ankle
    const hip = R['up' + s];
    const kn = R['knee' + s];
    const an = R['foot' + s];
    const [ta, tb] = axesFor(hip, kn, X);
    const [sa, sb] = axesFor(kn, an, X);
    tubes.push({
      rings: [
        ring(hip.clone().add(new THREE.Vector3(0, 0.05, 0)), ta, tb, 0.09, 'up' + s, 1.04),
        ring(hip.clone().lerp(kn, 0.3), ta, tb, 0.084, 'up' + s, 1.04),
        ring(hip.clone().lerp(kn, 0.88), ta, tb, 0.064, 'up' + s),
        ring(kn.clone().lerp(an, 0.1), sa, sb, 0.061, 'kn' + s),
        ring(kn.clone().lerp(an, 0.5), sa, sb, 0.053, 'kn' + s),
        ring(kn.clone().lerp(an, 0.93), sa, sb, 0.042, 'kn' + s),
      ],
    });
  }
  BODY = { tubes, shX: Math.abs(R.shL.x), wrX: Math.abs(R.handL.x), ankleY: Math.min(R.footL.y, R.footR.y) };
}
/** the smooth body (torso, arms, legs) for a pose: posed positions, and each vertex's rest position and bone */
function bodyTubes(S, j, around = 14) {
  const frames = {};
  const frame = (bone) => {
    if (!frames[bone]) {
      const [pk, qk] = BONE_JOINT[bone];
      frames[bone] = frameOf(j, j[pk], j[qk], REST[pk], REST[qk]);
    }
    return frames[bone];
  };
  const p = new THREE.Vector3();
  for (const tube of BODY.tubes) {
    const n = tube.rings.length;
    const seg = tube.rings[0].ra > 0.12 ? around : Math.max(8, Math.round(around * 0.6)); // (fewer sides round a limb)
    const base = S.role.length;
    for (const r of tube.rings) {
      const to = frame(r.bone);
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        p.copy(r.c).addScaledVector(r.a, Math.cos(t) * r.ra).addScaledVector(r.b, Math.sin(t) * r.rb);
        const vi = S.vert(to(p), 'body', p.clone());
        (S.bone || (S.bone = []))[vi] = r.bone;
        // (painted as trousers all the way up the thigh, never as shirt or belt)
        (S.paint || (S.paint = []))[vi] = [p.x, /^(up|kn)/.test(r.bone) ? Math.min(p.y, 0.88) : p.y, p.z];
      }
    }
    S.grid(base, n, seg);
  }
}
// the figure standing at rest (arms out): head and hands, to place hair and books relative to them in any pose
let REST = null;
const HEAD_C = new THREE.Vector3(0, 1.655, 0.004); // the middle of the head at rest
/** a joint's frame in this pose, relative to rest: where a point fixed to it at rest has moved to */
function frameOf(j, at, q, restAt, restQ) {
  const dq = q.clone().multiply(restQ.clone().invert());
  return (p) => p.clone().sub(restAt).applyQuaternion(dq).add(at);
}
const headFrame = (j) => frameOf(j, j.head, j.headQ, REST.head, REST.headQ);
const handFrame = (j, side) => (side > 0 ? frameOf(j, j.handL, j.handLQ, REST.handL, REST.handLQ) : frameOf(j, j.handR, j.handRQ, REST.handR, REST.handRQ));

/** Freezes the figure in one frame of an animation and returns a plain geometry (and its joints). */
function bakePose(gltf, clip, time, { surfaceOnly = false, rot = null } = {}) {
  const copy = cloneSkinned(gltf.scene);
  const mixer = new THREE.AnimationMixer(copy);
  mixer.clipAction(clip).play();
  mixer.update(time);
  if (rot) {
    for (const [name, x, y, z] of rot) {
      const b = copy.getObjectByName('mixamorig' + name);
      b?.quaternion.multiply(_q.setFromEuler(_e.set(x, y, z)));
    }
  }
  copy.updateMatrixWorld(true);
  const geos = [];
  for (const m of skinnedParts(copy)) {
    // the joints mesh: far away only its middle (the chest and belly piece) matters, the little rings don't
    const joints = m.geometry.attributes.position.count < 14000;
    m.skeleton.update();
    const src = m.geometry.attributes.position;
    const out = new Float32Array(src.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i);
      m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld); // mesh space -> figure space (the rig is scaled inside the file)
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setAttribute('bindPos', src.clone());
    let index = m.geometry.index.array;
    if (surfaceOnly) {
      // (the joints mesh isn't needed far away, and the shell's middle is replaced by the shirt)
      if (joints) continue;
      const keep = [];
      const cut = (i) => CUT(src.getX(i), src.getY(i));
      for (let t = 0; t < index.length; t += 3) if (!(cut(index[t]) && cut(index[t + 1]) && cut(index[t + 2]))) keep.push(index[t], index[t + 1], index[t + 2]);
      index = keep;
    }
    g.setIndex(Array.from(index));
    g.computeVertexNormals();
    geos.push(surfaceOnly ? compactGeometry(g) : g);
  }
  const geo = mergeGeometries(geos);
  const joints = jointsOf(copy);
  if (rot) {
    // a sitting figure: put the feet on the floor
    geo.computeBoundingBox();
    const dy = -geo.boundingBox.min.y;
    geo.translate(0, dy, 0);
    for (const v of Object.values(joints)) if (v.isVector3) v.y += dy;
  }
  return { geo, joints };
}

// ---------------- clothes made from simple shapes ----------------
// written into plain arrays so the same code serves baked figures (colours by region) and
// animated teachers (rebuilt every frame from the joints, coloured by vertex)
class Shapes {
  constructor() {
    this.pos = [];
    this.rest = [];
    this.idx = [];
    this.role = [];
  }
  vert(p, role, rest = p) {
    this.pos.push(p.x, p.y, p.z);
    this.rest.push(rest.x, rest.y, rest.z);
    this.role.push(role);
    return this.role.length - 1;
  }
  /**
   * the triangles joining `rings` rings of `seg` vertices each (starting at vertex `base`), wound so that
   * they face outwards (away from the rings' middles) — whichever way round the rings were made
   */
  grid(base, rings, seg) {
    const P = this.pos;
    const v = (i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const t = Math.min(rings - 2, Math.max(0, Math.floor((rings - 1) / 2)));
    const mid = new THREE.Vector3();
    for (let k = 0; k < seg; k++) mid.add(v(base + t * seg + k));
    mid.divideScalar(seg);
    let out = 0;
    for (let k = 0; k < seg; k++) {
      const a = v(base + t * seg + k);
      const n = new THREE.Vector3().crossVectors(v(base + t * seg + ((k + 1) % seg)).sub(a), v(base + (t + 1) * seg + k).sub(a));
      out += n.dot(a.clone().sub(mid));
    }
    const flip = out < 0;
    for (let i = 0; i < rings - 1; i++) {
      for (let k = 0; k < seg; k++) {
        const a = base + i * seg + k;
        const b = base + i * seg + ((k + 1) % seg);
        if (flip) this.idx.push(a, a + seg, b, b, a + seg, b + seg);
        else this.idx.push(a, b, a + seg, b, b + seg, a + seg);
      }
    }
  }
  /** a tube through rings {c, a, b, ra, rb, pleat}: c centre, a/b the ring's axes, ra/rb radii */
  tube(rings, seg, role) {
    const base = this.role.length;
    const p = new THREE.Vector3();
    for (const r of rings) {
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        const ca = Math.cos(t);
        const sb = Math.sin(t);
        const pl = r.pleat ? 1 + r.pleat * Math.max(0, sb) * Math.sin(t * 9) : 1;
        p.copy(r.c).addScaledVector(r.a, ca * r.ra * pl).addScaledVector(r.b, sb * r.rb * pl);
        this.vert(p, role);
      }
    }
    this.grid(base, rings.length, seg);
  }
  /** a flat strip through points, `w` wide, facing `out` (both sides drawn) */
  strip(points, outs, w, role) {
    const base = this.role.length;
    const side = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < points.length; i++) {
      dir.subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
      side.crossVectors(dir, outs[i]).normalize().multiplyScalar(w / 2);
      this.vert(p.copy(points[i]).add(side), role);
      this.vert(p.copy(points[i]).sub(side), role);
    }
    for (let i = 0; i < points.length - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // front
      this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); // back
    }
  }
  /** a box: centre c, half sizes along three axes (positions mapped by `to`, a rest-to-pose function) */
  box(c, hx, hy, hz, role, to = (p) => p) {
    const base = this.role.length;
    const p = new THREE.Vector3();
    // each face has its own corners, so the edges stay sharp
    const faces = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    ];
    const h = [hx, hy, hz];
    for (const [n, u, v] of faces) {
      const b0 = this.role.length;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        p.set(0, 0, 0);
        for (let k = 0; k < 3; k++) p.setComponent(k, c.getComponent(k) + (n[k] + u[k] * su + v[k] * sv) * h[k]);
        this.vert(to(p), role);
      }
      this.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
    return base;
  }
  /**
   * hair over the head: a cap reaching down to the hairline in front, over the ears at the sides and to the
   * nape at the back; `bump` makes it curly. `to` maps a point on the head at rest to this pose.
   */
  cap(to, role, { bump = 0, rings = 6, around = 14, grow = 1.05, nape = 2.25 } = {}) {
    const base = this.role.length;
    const p = new THREE.Vector3();
    const R = [0.091, 0.148, 0.127];
    for (let j = 0; j <= rings; j++) {
      for (let k = 0; k < around; k++) {
        const th = (k / around) * Math.PI * 2; // 0 = the face
        const c = Math.cos(th);
        const reach = (c > 0 ? 1.16 * c * c + 1.72 * (1 - c * c) : nape * c * c + 1.72 * (1 - c * c)) * (1 + (bump ? 0.05 : 0.025) * Math.sin(th * 5.3 + 0.4) * Math.sin(th * 2.1));
        const ph = (j / rings) * reach;
        const n = bump ? bump * (0.55 * Math.sin(th * 7 + ph * 3) * Math.sin(ph * 9 + th * 2) + 0.45 * Math.sin(th * 13 + 1.3) * Math.sin(ph * 12 + 0.7)) : 0;
        const g = (grow + n) * (j === rings ? 0.985 : 1);
        p.set(Math.sin(ph) * Math.sin(th) * R[0] * g, Math.cos(ph) * R[1] * g, Math.sin(ph) * Math.cos(th) * R[2] * g).add(HEAD_C);
        this.vert(to(p), role, p);
      }
    }
    this.grid(base, rings + 1, around);
  }
  /** a small low-poly ball */
  ball(c, r, role, sx = 1, sy = 1, sz = 1) {
    const base = this.role.length;
    const W = 6;
    const H = 4;
    const p = new THREE.Vector3();
    for (let j = 0; j <= H; j++) {
      const phi = (j / H) * Math.PI;
      for (let k = 0; k < W; k++) {
        const th = (k / W) * Math.PI * 2;
        p.set(Math.sin(phi) * Math.cos(th) * r * sx, Math.cos(phi) * r * sy, Math.sin(phi) * Math.sin(th) * r * sz).add(c);
        this.vert(p, role);
      }
    }
    this.grid(base, H + 1, W);
  }
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
/** ring axes perpendicular to the line from `from` to `to` (lateral first, then the other) */
function ringAxes(from, to) {
  const axis = new THREE.Vector3().subVectors(to, from).normalize();
  const a = X.clone().addScaledVector(axis, -X.dot(axis)).normalize();
  const b = new THREE.Vector3().crossVectors(axis, a).normalize();
  return [a, b];
}
const spreadAlong = (p, q, dir) => Math.abs(new THREE.Vector3().subVectors(p, q).dot(dir)) / 2;

/** school girl: pleated skirt, two plaits with ribbons */
function girlClothes(S, j, seg, pony = false) {
  const W = j.hips.clone().add(new THREE.Vector3(0, 0.04, 0));
  const knees = j.kneeL.clone().add(j.kneeR).multiplyScalar(0.5);
  const hem = W.clone().lerp(knees, 0.8);
  const [a, b] = ringAxes(W, hem);
  const ra = Math.max(0.2, Math.abs(j.kneeL.x - j.kneeR.x) / 2 + 0.12);
  const rb = Math.max(0.17, spreadAlong(j.kneeL, j.kneeR, b) + 0.13);
  const mid = W.clone().lerp(hem, 0.45);
  const [ma, mb] = ringAxes(W, hem);
  S.tube(
    [
      { c: W, a: X, b: Z, ra: 0.165, rb: 0.125 },
      { c: mid, a: ma, b: mb, ra: (0.165 + ra) / 2 + 0.01, rb: (0.125 + rb) / 2 + 0.01, pleat: 0.03 },
      { c: hem, a, b, ra, rb, pleat: 0.05 },
    ],
    seg,
    'skirt'
  );
  if (pony) ponytail(S, j);
  else longHair(S, j, seg < 12 ? 6 : 10);
}

/** long open hair: a full cap and a fall of hair down the back to the shoulder blades */
function longHair(S, j, around = 10) {
  const to = headFrame(j);
  S.cap(to, 'hair', { rings: around < 8 ? 4 : 6, around: around < 8 ? 10 : 14, grow: 1.04, nape: 2.35 });
  // locks of hair either side of the face, down past the shoulders
  for (const side of [-1, 1]) {
    const t = to(new THREE.Vector3(side * 0.084, 1.655, -0.03));
    const m = t.clone().add(new THREE.Vector3(side * 0.025, -0.12, -0.02));
    const e = t.clone().add(new THREE.Vector3(side * 0.035, -0.25, -0.035));
    const [la, lb] = ringAxes(t, e);
    S.tube(
      [
        { c: t, a: la, b: lb, ra: 0.022, rb: 0.03 },
        { c: m, a: la, b: lb, ra: 0.024, rb: 0.034 },
        { c: e, a: la, b: lb, ra: 0.012, rb: 0.02 },
      ],
      6,
      'hair'
    );
  }
  // (hanging well clear of the shoulders and the back of the shirt, so nothing shows through it)
  const top = to(new THREE.Vector3(0, 1.66, -0.112));
  const mid = top.clone().add(new THREE.Vector3(0, -0.17, -0.05));
  const end = top.clone().add(new THREE.Vector3(0, -0.35, -0.075));
  const [a, b] = ringAxes(top, end);
  S.tube(
    [
      { c: top, a, b, ra: 0.085, rb: 0.04 },
      { c: mid, a, b, ra: 0.098, rb: 0.034 },
      { c: end, a, b, ra: 0.08, rb: 0.022 },
    ],
    around,
    'hair'
  );
}

/** hair pulled back into a ponytail with a band */
function ponytail(S, j) {
  const to = headFrame(j);
  S.cap(to, 'hair', { rings: 6, around: 14, grow: 1.03, nape: 2.2 });
  const root = to(new THREE.Vector3(0, 1.69, -0.125));
  const knot = to(new THREE.Vector3(0, 1.665, -0.165));
  const mid = knot.clone().add(new THREE.Vector3(0, -0.12, -0.03));
  const end = knot.clone().add(new THREE.Vector3(0, -0.27, -0.02));
  const [a, b] = ringAxes(knot, end);
  S.tube([{ c: root, a, b, ra: 0.03, rb: 0.03 }, { c: knot, a, b, ra: 0.034, rb: 0.03 }, { c: mid, a, b, ra: 0.042, rb: 0.03 }, { c: end, a, b, ra: 0.012, rb: 0.01 }], 8, 'hair');
  S.ball(knot, 0.026, 'band', 1.2, 0.6, 1.2);
}

/** a book or notebook held in one hand, flat against the side of the leg as the arm swings */
function heldBook(S, j, side, role, size = [0.115, 0.016, 0.085]) {
  const to = handFrame(j, side);
  const h = side > 0 ? REST.handL : REST.handR;
  // at rest (arm out, palm down) the book lies along the arm, just beyond the fingers' grip
  const c = h.clone().add(new THREE.Vector3(side * 0.1, -0.035, 0.0));
  S.box(c, size[0], size[1], size[2], role, to);
  if (role === 'notebook') S.box(c.clone().add(new THREE.Vector3(side * 0.004, 0, 0)), size[0] * 0.97, size[1] * 0.75, size[2] * 1.02, 'page', to);
}

/** a teacher's saree: pleated drape to the ankles with a gold border, the pallu over the left shoulder, hair in a bun */
function sareeClothes(S, j, seg) {
  const W = j.hips.clone().add(new THREE.Vector3(0, 0.05, 0));
  const knees = j.kneeL.clone().add(j.kneeR).multiplyScalar(0.5);
  const feet = j.footL.clone().add(j.footR).multiplyScalar(0.5);
  const sitting = knees.y > W.y - 0.25;
  const hem = sitting ? knees.clone().lerp(feet, 0.85) : feet.clone().setY(Math.max(0.05, feet.y - 0.02));
  const border = hem.clone().lerp(sitting ? knees : W, 0.09);
  const kn = sitting ? knees.clone().add(new THREE.Vector3(0, 0.02, 0.08)) : knees;
  const [ka, kb] = ringAxes(W, kn);
  const [ha, hb] = ringAxes(kn, hem);
  const kra = Math.max(0.2, Math.abs(j.kneeL.x - j.kneeR.x) / 2 + 0.13);
  const krb = Math.max(0.18, spreadAlong(j.kneeL, j.kneeR, kb) + 0.13);
  const hra = Math.max(0.22, Math.abs(j.footL.x - j.footR.x) / 2 + 0.14);
  const hrb = Math.max(0.2, spreadAlong(j.footL, j.footR, hb) + 0.15);
  S.tube(
    [
      { c: W, a: X, b: Z, ra: 0.17, rb: 0.135 },
      { c: kn, a: ka, b: kb, ra: kra, rb: krb, pleat: 0.03 },
      { c: border, a: ha, b: hb, ra: hra * 0.98, rb: hrb * 0.98, pleat: 0.06 },
    ],
    seg,
    'saree'
  );
  S.tube(
    [
      { c: border, a: ha, b: hb, ra: hra * 0.985, rb: hrb * 0.985, pleat: 0.06 },
      { c: hem, a: ha, b: hb, ra: hra, rb: hrb, pleat: 0.06 },
    ],
    seg,
    'border'
  );
  // the pallu: from the right hip across the chest, over the left shoulder, down the back
  const chest = j.spine2.clone().lerp(j.neck, 0.2);
  const pts = [
    j.upR.clone().add(new THREE.Vector3(0.02, 0.12, 0.13)),
    chest.clone().add(new THREE.Vector3(0.0, -0.14, 0.165)),
    chest.clone().lerp(j.shL, 0.6).add(new THREE.Vector3(0.0, 0.03, 0.15)),
    j.shL.clone().add(new THREE.Vector3(-0.02, 0.085, 0.0)),
    j.shL.clone().lerp(j.spine2, 0.5).add(new THREE.Vector3(0, -0.05, -0.15)),
    j.hips.clone().add(new THREE.Vector3(0.1, 0.12, -0.15)),
  ];
  const outs = [Z, Z, Z.clone().add(Y).normalize(), Y, Z.clone().negate(), Z.clone().negate()];
  S.strip(pts, outs, 0.24, 'saree');
  // hair combed back into a bun
  const to = headFrame(j);
  S.cap(to, 'hair', { rings: seg < 12 ? 4 : 5, around: seg < 12 ? 10 : 12, grow: 1.04, nape: 2.2 });
  S.ball(to(new THREE.Vector3(0, 1.625, -0.15)), 0.068, 'hair', 1, 0.85, 0.8);
}

/** the watchman's peaked cap: a stiff crown a little wider at the top, a band, and a peak over the eyes */
function guardCap(S, j, seg) {
  const to = headFrame(j);
  const at = (x, y, z) => to(new THREE.Vector3(x, y, z).add(HEAD_C));
  const o = at(0, 0, 0);
  const ax = at(1, 0, 0).sub(o).normalize();
  const az = at(0, 0, 1).sub(o).normalize();
  const ring = (y, ra, rb) => ({ c: at(0, y, -0.008), a: ax, b: az, ra, rb });
  S.tube([ring(0.035, 0.094, 0.126), ring(0.075, 0.1, 0.133), ring(0.128, 0.111, 0.146), ring(0.145, 0.105, 0.14), ring(0.152, 0.002, 0.002)], seg, 'trim');
  // the peak, tipped down a little at the front
  const peak = new THREE.Vector3(0, 0.04, 0.155).add(HEAD_C);
  const tilt = (p) => to(p.clone().sub(peak).applyAxisAngle(X, 0.28).add(peak));
  S.box(peak, 0.078, 0.006, 0.04, 'trim', tilt);
}

// where each kind of cloth sits in the uniform shader's colour regions
const M = (k) => [k, 3, 0];
const ROLE_BIND = { trim: M(MARK.trim), band: M(MARK.band), body: [0, 1.1, 0], skirt: [0, 0.7, 0], hair: M(MARK.hair), saree: [0, 0.5, 0], border: M(MARK.border), shirt: [0, 1.1, 0], book: M(MARK.book), notebook: M(MARK.notebook), page: M(MARK.page) };
/** the shader's region for each vertex (a saree border alternates two colours round the hem: its woven pattern) */
const bindOf = (r, i) => (r === 'border' && i % 3 === 0 ? M(MARK.trim) : ROLE_BIND[r]);
function shapesToBaked(S) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(S.pos, 3));
  const bind = new Float32Array(S.role.length * 3);
  S.role.forEach((r, i) => {
    bind.set(bindOf(r, i), i * 3);
    if (r === 'body') bind.set(S.paint?.[i] || S.rest.slice(i * 3, i * 3 + 3), i * 3);
    // (hair also carries where it sits on the head at rest, for its curls and strands)
    if (r === 'hair') {
      bind[i * 3 + 1] = 3 + S.rest[i * 3 + 1];
      bind[i * 3 + 2] = (S.rest[i * 3] + S.rest[i * 3 + 2] * 0.6) * 10;
    }
  });
  g.setAttribute('bindPos', new THREE.BufferAttribute(bind, 3));
  g.setIndex(S.idx);
  g.computeVertexNormals();
  return g;
}

/** a baked body plus clothes, simplified to a level of detail */
const simplified = new Map(); // the same body at the same detail is simplified once, whoever wears it
function dressed(body, joints, kind, ratio, err = 0.2) {
  const key = body.uuid + ':' + ratio + ':' + err;
  if (!simplified.has(key)) simplified.set(key, compactGeometry(simplifyGeometry(body.clone(), ratio, err)));
  const base = simplified.get(key);
  const P = PALETTES[kind];
  const S = new Shapes();
  const seg = ratio < 0.05 ? 10 : 16;
  bodyTubes(S, joints, ratio < 0.05 ? 10 : 16);
  const sitting = joints.kneeL.y > joints.hips.y - 0.25;
  if (kind === 'girl' || kind === 'girlP') {
    girlClothes(S, joints, seg, kind === 'girlP');
    if (!sitting) heldBook(S, joints, 1, 'notebook');
  } else if (P.saree) sareeClothes(S, joints, seg);
  else if (!P.teach) S.cap(headFrame(joints), 'hair', { bump: 0.06, rings: ratio < 0.05 ? 4 : 6, around: ratio < 0.05 ? 10 : 16, grow: 1.04, nape: 2.05 }); // short curly hair
  if (P.guard) guardCap(S, joints, seg);
  if (P.teach && !sitting) heldBook(S, joints, 1, 'book', [0.12, 0.022, 0.09]);
  if (P.teach && sitting) {
    // sitting down: a book open in both hands, in the lap or on the table
    const mid = joints.handL.clone().lerp(joints.handR, 0.5).add(new THREE.Vector3(0, 0.025, 0.05));
    S.box(mid, 0.11, 0.012, 0.08, 'page');
    S.box(mid.clone().add(new THREE.Vector3(0, -0.014, 0)), 0.115, 0.004, 0.085, 'book');
  }
  const extra = shapesToBaked(S);
  // the simplified body keeps only position, bindPos, normal and the index
  for (const k of Object.keys(base.attributes)) if (!['position', 'bindPos', 'normal'].includes(k)) base.deleteAttribute(k);
  const out = mergeGeometries([base, extra]);
  extra.dispose();
  return out;
}

/**
 * Everyone on campus.
 * - assembly: the teachers who lead the assembly (posed)
 * - crowd: the student body (instanced, baked animation frames)
 * - pool: animated people who walk routes, wait, run, and leave — driven by the school-day simulation
 * - posed: people sitting or standing still at fixed places (desks, the staff room, the library)
 */
export async function createPeople(scene, L, rng, P, camera) {
  const gltf = await L.model('xbot.glb');
  const T = (label) => window.__campusDebug && console.log('[people]', label, Math.round(performance.now()));
  T('model');
  const clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
  for (const m of skinnedParts(gltf.scene)) m.geometry.setAttribute('bindPos', m.geometry.attributes.position.clone());
  const mats = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, uniformMaterial(k)]));
  {
    const rest = cloneSkinned(gltf.scene);
    rest.updateMatrixWorld(true);
    REST = jointsOf(rest);
    makeBodyTubes();
  }

  // ---------- teachers who lead the assembly (posed) ----------
  const idleBody = bakePose(gltf, clips.idle, 1.4, { surfaceOnly: true });
  const leaders = new THREE.Group();
  const leaderGeo = { teacher: dressed(idleBody.geo, idleBody.joints, 'teacher', P.peopleLod), teacherF: dressed(idleBody.geo, idleBody.joints, 'teacherF', P.peopleLod) };
  for (const [x, z, kind, ry] of [[-24.6, -5, 'teacherF', Math.PI / 2], [24.6, -5, 'teacher', -Math.PI / 2], [2.4, -10.6, 'teacherF2', 0], [-2.6, -10.4, 'teacher3', 0]]) {
    const t = new THREE.Mesh(leaderGeo[PALETTES[kind].saree ? 'teacherF' : 'teacher'], mats[kind]);
    t.position.set(x, 0.08, z);
    t.rotation.y = ry;
    t.castShadow = true;
    leaders.add(t);
  }
  leaders.visible = false;
  scene.add(leaders);
  const assembly = {
    setLeaders(on) {
      leaders.visible = on;
    },
  };

  // ---------- baked bodies: every frame of walking, running, standing, talking, sitting ----------
  const bake = (clip, t, rot) => bakePose(gltf, clip, t, { surfaceOnly: true, rot });
  // (the work is done in small pieces, letting the page breathe in between so it never freezes)
  const breathe = () => new Promise((r) => setTimeout(r, 0));
  const raw = [];
  for (let i = 0; i < WALK_FRAMES; i++) {
    raw.push(bake(clips.walk, (i / WALK_FRAMES) * clips.walk.duration));
    await breathe();
  }
  for (let i = 0; i < RUN_FRAMES; i++) {
    raw.push(bake(clips.run, (i / RUN_FRAMES) * clips.run.duration));
    await breathe();
  }
  raw.push(idleBody);
  for (const name of ['agree', 'headShake']) {
    for (let i = 0; i < TALK_FRAMES; i++) raw.push(bake(clips[name], ((i + 0.5) / TALK_FRAMES) * clips[name].duration));
    await breathe();
  }
  const SIT_BODY = bake(clips.idle, 0.6, SIT);
  T('baked');
  const IDLE = WALK_FRAMES + RUN_FRAMES;
  const TALK = IDLE + 1;
  const lods = [P.crowdLod, P.crowdFar];

  // ---------- the student body ----------
  const N = P.students;
  const crowdKinds = ['boy', 'girl'];
  const looks = ['boy', 'girl', 'girlP']; // (girls wear their hair open or in a ponytail)
  const lookOf = (a) => (a.kind === 'boy' ? 0 : a.alt ? 2 : 1);
  // [look][lod][frame] -> geometry
  const frameGeo = [];
  for (const k of looks) {
    const perLod = [];
    for (const ratio of lods) {
      const list = [];
      for (const b of raw) {
        list.push(dressed(b.geo, b.joints, k, ratio));
        if (list.length % 4 === 0) await breathe();
      }
      perLod.push(list);
    }
    frameGeo.push(perLod);
  }
  T('dressed crowd');
  const capOf = (lod, f) => {
    if (f === IDLE) return lod === 0 ? Math.ceil(N * 0.5) : N;
    if (f >= TALK) return lod === 0 ? Math.ceil(N * 0.12) : Math.ceil(N * 0.22);
    return lod === 0 ? Math.ceil(N * 0.3) : Math.ceil(N * 0.5);
  };
  const instanced = (geo, mat, cap, shadows) => {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, new THREE.Color(1, 1, 1));
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.visible = false;
    im.frustumCulled = false; // people move every frame; culling is done per person below
    im.castShadow = shadows;
    im.receiveShadow = shadows;
    im.userData.cap = cap;
    scene.add(im);
    return im;
  };
  const meshes = looks.map((k, ki) => frameGeo[ki].map((list, lod) => list.map((g, f) => instanced(g, mats[k], capOf(lod, f), lod === 0))));
  const allMeshes = meshes.flat(2);

  // school bags: a pack with a front pocket, worn on the back
  const bagGeo = mergeGeometries([new THREE.BoxGeometry(0.25, 0.36, 0.13).translate(0, 0, -0.085), new THREE.BoxGeometry(0.19, 0.15, 0.05).translate(0, -0.07, -0.17), new THREE.BoxGeometry(0.1, 0.03, 0.03).translate(0, 0.195, -0.08)]);
  const bags = new THREE.InstancedMesh(bagGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75 }), N);
  bags.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bags.setColorAt(0, new THREE.Color(1, 1, 1));
  bags.count = 0;
  bags.frustumCulled = false;
  bags.castShadow = true;
  scene.add(bags);
  // black school backpacks (a little wear and fading makes some greyer)
  const BAG_COLORS = ['#141414', '#1a1a1c', '#202022', '#121417', '#26272a', '#18191d'].map((c) => new THREE.Color(c));

  // soft round shadows under far-away people (they don't cast real ones)
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.85, 0.85).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }),
    N
  );
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.count = 0;
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  scene.add(blobs);

  const crowdAgents = [];
  for (let i = 0; i < N; i++) {
    crowdAgents.push({
      i, teacher: false, kind: crowdKinds[i % 2], alt: i % 2 === 1 && rng() < 0.4, size: 0.78 + rng() * 0.14, tone: 0.84 + rng() * 0.16,
      bagColor: BAG_COLORS[Math.floor(rng() * BAG_COLORS.length)], bag: false,
      off: new THREE.Vector3((rng() - 0.5) * 1.5, 0, (rng() - 0.5) * 1.5),
      active: false, path: null, seg: 0, run: false, pace: 1, wait: 0, onArrive: null, holdT: 0, y0: 0, segLen: -1,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null, anim: rng(), data: null, talk: false, talkSet: i % 2,
    });
  }
  // idle students, one stack per kind (so whoever stands up from a girl's seat is a girl)
  const free = { boy: [], girl: [] };
  for (let i = N - 1; i >= 0; i--) free[crowdAgents[i].kind].push(crowdAgents[i]);
  let activeCount = 0;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const bagOff = new THREE.Vector3();
  const bagPos = new THREE.Vector3();
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  const near2 = P.lodRadius * P.lodRadius;
  const tmpC = new THREE.Vector3();
  const flush = (im) => {
    im.visible = im.count > 0;
    if (!im.visible) return;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, im.count * 16);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) {
      im.instanceColor.clearUpdateRanges();
      im.instanceColor.addUpdateRange(0, im.count * 3);
      im.instanceColor.needsUpdate = true;
    }
  };
  const updateFrustum = () => {
    camera.updateMatrixWorld();
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
  };

  const sepLists = [crowdAgents];
  const crowd = {
    agents: crowdAgents,
    get capacity() {
      return N;
    },
    activeCount: () => activeCount,
    freeCount: () => free.boy.length + free.girl.length,
    /** a student enters the scene; returns null when everyone is already out. opts.kind prefers boys or girls */
    spawn(points, opts = {}) {
      const pref = opts.kind || (free.boy.length > free.girl.length ? 'boy' : 'girl');
      const a = free[pref].pop() || free[pref === 'boy' ? 'girl' : 'boy'].pop();
      if (!a) return null;
      a.active = true;
      activeCount++;
      a.sys = this;
      a.tag = opts.tag || null;
      a.bag = Boolean(opts.bag);
      a.data = opts.data ?? null;
      if (opts.size) a.size = opts.size;
      if (opts.tone) a.tone = opts.tone;
      a.pos.copy(points[0]);
      if (opts.jitterStart !== false && !opts.lateral) a.pos.addScaledVector(a.off, points[0].squeeze ?? 1);
      if (opts.lateral && points[1]) {
        const dx = points[1].x - points[0].x;
        const dz = points[1].z - points[0].z;
        const l = Math.hypot(dx, dz) || 1;
        a.pos.x += (dz / l) * opts.lateral;
        a.pos.z += (-dx / l) * opts.lateral;
      }
      a.heading = points[1] ? Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) : (opts.face ?? 0);
      this.route(a, points.slice(1), opts);
      return a;
    },
    route(a, points, opts = {}) {
      setRoute(a, points, opts);
    },
    release(a) {
      if (!a.active) return;
      a.active = false;
      a.meetGrp = null;
      a.tag = null;
      a.data = null;
      a.onArrive = null;
      a.talk = false;
      a.holdT = 0;
      activeCount--;
      free[a.kind].push(a);
    },
    releaseAll(filter = () => true) {
      for (const a of crowdAgents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const im of allMeshes) im.count = 0;
      let nb = 0;
      let nblob = 0;
      updateFrustum();
      const cam = camera.position;
      for (let i = 0; i < N; i++) {
        const a = crowdAgents[i];
        if (!a.active) continue;
        const moving = step(a, dt, tmpC);
        a.moving = moving;
        if (!a.active) continue;
        let f = IDLE;
        if (moving) {
          a.anim = (a.anim + (dt / (a.run ? clips.run.duration : clips.walk.duration)) * (a.run ? 1 : a.pace)) % 1;
          f = a.run ? WALK_FRAMES + Math.floor(a.anim * RUN_FRAMES) : Math.floor(a.anim * WALK_FRAMES);
        } else if (a.talk) {
          // chatting with friends: nodding and shaking heads, at their own pace
          a.anim = (a.anim + dt * 0.45) % 1;
          const ph = a.anim * 2;
          f = ph < 1 ? TALK + a.talkSet * TALK_FRAMES + Math.min(TALK_FRAMES - 1, Math.floor(ph * TALK_FRAMES)) : IDLE;
        }
        // only students in view are drawn
        sphere.center.set(a.pos.x, a.pos.y + 0.9, a.pos.z);
        if (!frustum.intersectsSphere(sphere)) continue;
        const dx = a.pos.x - cam.x;
        const dy = a.pos.y - cam.y;
        const dz = a.pos.z - cam.z;
        const lod = dx * dx + dy * dy + dz * dz < near2 ? 0 : 1;
        const im = meshes[lookOf(a)][lod][f];
        if (im.count >= im.userData.cap) continue;
        q.setFromAxisAngle(up, a.heading);
        sc.setScalar(a.size);
        m4.compose(a.pos, q, sc);
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, col.setRGB(a.tone, a.tone, a.bag ? a.tone - 0.4 : a.tone));
        im.count++;
        if (a.bag) {
          bagOff.set(0, 1.13 * a.size, -0.13 * a.size).applyQuaternion(q);
          bagPos.copy(a.pos).add(bagOff);
          m4.compose(bagPos, q, sc);
          bags.setMatrixAt(nb, m4);
          bags.setColorAt(nb, a.bagColor);
          nb++;
        }
        if (lod === 1) {
          m4.makeTranslation(a.pos.x, a.pos.y + 0.02, a.pos.z);
          blobs.setMatrixAt(nblob++, m4);
        }
      }
      separate(sepLists, dt);
      for (const im of allMeshes) flush(im);
      bags.count = nb;
      flush(bags);
      blobs.count = nblob;
      flush(blobs);
    },
  };

  // ---------- people sitting (or standing to teach) at fixed places ----------
  // students at desks and readers: boys and girls, two levels of detail
  await breathe();
  const sitGeo = looks.map((k) => lods.map((r) => dressed(SIT_BODY.geo, SIT_BODY.joints, k, r)));
  await breathe();
  // teachers: sitting, and standing at the board talking (nodding frames)
  const TEACH_FRAMES = [raw[TALK], raw[TALK + 1], raw[TALK + 2], idleBody];
  const TEACH_WALK = [raw[0], raw[2], raw[4], raw[6]]; // (a slow walk along the front of the class)
  const WRITE_BODY = bake(clips.idle, 1.0, WRITE);
  const POINT_BODY = bake(clips.idle, 1.0, POINT);
  const tLods = [Math.max(P.crowdLod, 0.12), P.crowdFar * 1.6];
  const teacherGeo = {};
  for (const sex of ['m', 'f']) {
    const k = sex === 'm' ? 'teacher' : 'teacherF';
    teacherGeo[sex] = tLods.map((r) => ({
      sit: dressed(SIT_BODY.geo, SIT_BODY.joints, k, r),
      talk: TEACH_FRAMES.map((b) => dressed(b.geo, b.joints, k, r)),
      walk: TEACH_WALK.map((b) => dressed(b.geo, b.joints, k, r)),
      write: dressed(WRITE_BODY.geo, WRITE_BODY.joints, k, r),
      point: dressed(POINT_BODY.geo, POINT_BODY.joints, k, r),
    }));
    await breathe();
  }
  const guardGeo = tLods.map((r) => ({ talk: TEACH_FRAMES.map((b) => dressed(b.geo, b.joints, 'guard', r)), point: dressed(POINT_BODY.geo, POINT_BODY.joints, 'guard', r) }));
  raw.forEach((b) => b.geo.dispose());
  for (const g of simplified.values()) g.dispose();
  simplified.clear();
  T('posed');
  const posedMeshes = new Map();
  const posedCap = { boy: Math.ceil(N * 0.62) + 40, girl: Math.ceil(N * 0.62) + 40 };
  const pm = (key, geo, mat, cap) => {
    const im = instanced(geo, mat, cap, false);
    im.receiveShadow = true;
    posedMeshes.set(key, im);
    return im;
  };
  looks.forEach((k, ki) => lods.forEach((_, lod) => pm(`${k}|sit|${lod}`, sitGeo[ki][lod], mats[k], posedCap[k === 'boy' ? 'boy' : 'girl'])));
  for (const k of [...MALE_TEACHERS, ...FEMALE_TEACHERS]) {
    const sex = PALETTES[k].saree ? 'f' : 'm';
    tLods.forEach((_, lod) => {
      pm(`${k}|sit|${lod}`, teacherGeo[sex][lod].sit, mats[k], 12);
      teacherGeo[sex][lod].talk.forEach((g, f) => pm(`${k}|talk${f}|${lod}`, g, mats[k], 24));
      teacherGeo[sex][lod].walk.forEach((g, f) => pm(`${k}|walk${f}|${lod}`, g, mats[k], 16));
      pm(`${k}|write|${lod}`, teacherGeo[sex][lod].write, mats[k], 16);
      pm(`${k}|point|${lod}`, teacherGeo[sex][lod].point, mats[k], 16);
    });
  }
  // the watchman: standing at the gate, or holding up a hand while a vehicle turns in
  guardGeo.forEach((g, lod) => {
    g.talk.forEach((geo, f) => pm(`guard|talk${f}|${lod}`, geo, mats.guard, 2));
    pm(`guard|point|${lod}`, g.point, mats.guard, 2);
  });
  const posedAll = [...posedMeshes.values()];
  let altN = 0;
  const groups = [];
  const posed = {
    /** a place where people sit together (a classroom, the staff room); culled as one */
    group(x, y, z, r = 5.5) {
      const g = { c: new THREE.Vector3(x, y, z), r, slots: [], on: 0 };
      groups.push(g);
      return g;
    },
    /** one seat (or teaching spot) in a group */
    slot(g, { kind, pose = 'sit', x, y, z, heading = 0, size = 1, tone = 1, teach = null }) {
      const s = { g, kind, pose, x, y, z, heading, size, tone, teach, on: false, phase: Math.random() * 30, alt: (altN++ % 5) < 2 };
      g.slots.push(s);
      return s;
    },
    set(s, on) {
      if (s.on === on) return;
      s.on = on;
      s.g.on += on ? 1 : -1;
    },
    update(elapsed) {
      updateFrustum();
      for (const im of posedAll) im.count = 0;
      const cam = camera.position;
      const gs = new THREE.Sphere();
      const p = new THREE.Vector3();
      for (const g of groups) {
        if (!g.on) continue;
        gs.set(g.c, g.r);
        if (!frustum.intersectsSphere(gs)) continue;
        const d2 = g.c.distanceToSquared(cam);
        if (d2 > 80 * 80) continue; // too far to see in through the windows
        for (const s of g.slots) {
          if (!s.on) continue;
          const lod = p.set(s.x, s.y, s.z).distanceToSquared(cam) < near2 * 1.6 ? 0 : 1;
          let key;
          let heading = s.heading;
          if (s.pose === 'teach' && s.teach) {
            // (a teacher who's just walked in starts the lesson from the front of the class)
            if (s.restart) {
              s.phase = LESSON_LEN - (elapsed % LESSON_LEN);
              s.restart = false;
            }
            const r = teachAt(s, elapsed);
            p.set(r.x, s.y, r.z);
            heading = r.heading;
            key = `${s.kind}|${r.frame}|${lod}`;
          } else if (s.pose === 'stand') {
            key = `${s.kind}|talk3|${lod}`;
          } else if (s.pose === 'point') {
            key = `${s.kind}|point|${lod}`;
          } else if (s.pose === 'talk') {
            // a teacher explaining: nods now and then, otherwise stands
            const t = (elapsed * 0.5 + s.phase) % 4;
            key = `${s.kind}|talk${t < 1.5 ? Math.floor(t * 2) % 3 : 3}|${lod}`;
          } else key = `${s.kind === 'girl' && s.alt ? 'girlP' : s.kind}|sit|${lod}`;
          const im = posedMeshes.get(key);
          if (!im || im.count >= im.userData.cap) continue;
          q.setFromAxisAngle(up, heading);
          sc.setScalar(s.size);
          m4.compose(p, q, sc);
          im.setMatrixAt(im.count, m4);
          im.setColorAt(im.count, col.setScalar(s.tone));
          im.count++;
        }
      }
      for (const im of posedAll) flush(im);
    },
  };

  // ---------- the pool of animated people ----------
  // lighter meshes for walkers (the clones below share these geometries)
  for (const m of skinnedParts(gltf.scene)) {
    simplifyGeometry(m.geometry, P.peopleLod);
    // the shell's middle (and the ball inside it) go; the shirt body below takes their place
    const bp = m.geometry.attributes.bindPos;
    const idx = m.geometry.index.array;
    const keep = [];
    const cut = (i) => CUT(bp.getX(i), bp.getY(i)) || (m.geometry.attributes.position.count < 14000 && bp.getY(i) > 0.9 && bp.getY(i) < 1.36 && Math.abs(bp.getX(i)) < 0.26);
    for (let t = 0; t < idx.length; t += 3) if (!(cut(idx[t]) && cut(idx[t + 1]) && cut(idx[t + 2]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    m.geometry.setIndex(keep);
  }
  const shirtGeo = (() => {
    const S = new Shapes();
    bodyTubes(S, REST, 16);
    const g = shapesToBaked(S);
    // each ring moves with its bone
    const n = S.role.length;
    const skel = skinnedParts(gltf.scene)[0].skeleton;
    const index = {};
    for (const [k, v] of Object.entries(BONE_JOINT)) index[k] = Math.max(0, skel.bones.findIndex((x) => x.name === 'mixamorig' + v[2]));
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = index[S.bone[i]];
      sw[i * 4] = 1;
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(S.rest, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.computeVertexNormals();
    return g;
  })();
  const kinds = ['boy', 'girl', 'boy2', 'girl', 'boy', 'boy2', 'girl'];
  const agents = [];
  const teacherEvery = 7;
  let nT = 0;
  let nGirl = 0;
  // (and a few in whites for the games after school: two batsmen, two bowlers, four tennis players)
  const SPORTS = ['bat', 'bat', null, null, 'racket', 'racket', 'racket', 'racket'];
  for (let i = 0; i < P.walkers + SPORTS.length; i++) {
    const prop = i >= P.walkers ? SPORTS[i - P.walkers] : undefined;
    const sport = prop !== undefined;
    const teacher = !sport && [1, 3, 5].includes(i % teacherEvery); // about three in seven are teachers
    const kind = sport ? 'whites' : teacher ? (nT++ % 2 ? MALE_TEACHERS : FEMALE_TEACHERS)[Math.floor(nT / 2) % 3] : kinds[i % kinds.length];
    const obj = cloneSkinned(gltf.scene);
    const shells = [];
    obj.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.material = mats[kind];
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        // (the robot's joint pieces aren't needed: the smooth body covers the elbows, knees and middle)
        if (o.geometry.attributes.position.count < 14000) o.visible = false;
        else shells.push(o);
      }
    });
    {
      const shell = shells[0];
      const shirt = new THREE.SkinnedMesh(shirtGeo, mats[kind]);
      shirt.castShadow = true;
      shirt.frustumCulled = false;
      shell.parent.add(shirt);
      shirt.bind(shell.skeleton, shell.bindMatrix);
    }
    const holder = new THREE.Group();
    holder.add(obj);
    holder.visible = false;
    const size = teacher ? 0.97 + rng() * 0.05 : 0.78 + rng() * 0.12;
    holder.scale.setScalar(size);
    attachExtras(obj, holder, kind, mats[kind], (nGirl += kind === 'girl' ? 1 : 0) % 2 === 0);
    if (prop) attachProp(obj, holder, prop);
    scene.add(holder);
    const mixer = new THREE.AnimationMixer(obj);
    const act = { walk: mixer.clipAction(clips.walk), run: mixer.clipAction(clips.run), idle: mixer.clipAction(clips.idle) };
    for (const a of Object.values(act)) {
      a.play();
      a.weight = 0;
    }
    act.idle.weight = 1;
    mixer.setTime(rng() * 5);
    const ag = {
      i, teacher, kind, holder, mixer, act, size, off: null, sport, prop: prop || null,
      active: false, path: null, seg: 0, run: false, wait: 0, onArrive: null, onWaitEnd: null, holdT: 0, y0: 0, segLen: -1,
      pos: new THREE.Vector3(), heading: 0, face: null, tag: null, anim: Math.random(),
      w: { walk: 0, run: 0, idle: 1 },
    };
    if (PALETTES[kind].saree) ag.saree = makeLiveSaree(obj, kind, holder);
    agents.push(ag);
  }

  const tmp = new THREE.Vector3();
  const pool = {
    agents,
    activeCount() {
      return agents.reduce((n, a) => n + (a.active ? 1 : 0), 0);
    },
    /**
     * Sends someone on a route. Returns the agent, or null when everyone is busy.
     * opts: { teacher, run, tag, onArrive(agent), wait, face, pace (walking speed, 1 = normal) }
     */
    spawn(points, opts = {}) {
      // (a particular teacher if asked for and free, otherwise anyone of the right sort)
      // (the ones in games kit only ever play games: ask for them by what they carry, opts.sport = 'bat' | 'racket' | 'bowl')
      if (opts.sport) {
        const want = opts.sport === 'bowl' ? null : opts.sport;
        const g = agents.find((x) => !x.active && x.sport && x.prop === want);
        if (!g) return null;
        return this.spawnAgent(g, points, opts);
      }
      const a = (opts.kind && agents.find((g) => !g.active && !g.sport && g.kind === opts.kind)) || agents.find((g) => !g.active && !g.sport && (opts.teacher === undefined || g.teacher === opts.teacher));
      if (!a) return null;
      return this.spawnAgent(a, points, opts);
    },
    spawnAgent(a, points, opts) {
      if (!a) return null;
      a.active = true;
      a.sys = this;
      a.holder.visible = true;
      if (a.saree) a.saree.mesh.visible = true;
      a.tag = opts.tag || null;
      a.pos.copy(points[0]);
      a.heading = points[1] ? Math.atan2(points[1].x - points[0].x, points[1].z - points[0].z) : 0;
      this.route(a, points.slice(1), opts);
      return a;
    },
    /** gives an agent a new route (or a wait if the route is empty) */
    route(a, points, opts = {}) {
      setRoute(a, points, opts);
      a.act.walk.timeScale = a.pace;
    },
    release(a) {
      a.active = false;
      a.meetGrp = null;
      a.holder.visible = false;
      if (a.saree) a.saree.mesh.visible = false;
      a.tag = null;
    },
    releaseAll(filter = () => true) {
      for (const a of agents) if (a.active && filter(a)) this.release(a);
    },
    update(dt) {
      for (const a of agents) {
        if (!a.active) continue;
        const moving = step(a, dt, tmp);
        a.moving = moving;
        if (!a.active) continue;
        // blend walk / run / idle smoothly
        const tw = moving && !a.run ? 1 : 0;
        const tr = moving && a.run ? 1 : 0;
        const ti = moving ? 0 : 1;
        const k = Math.min(1, dt * 6);
        a.w.walk += (tw - a.w.walk) * k;
        a.w.run += (tr - a.w.run) * k;
        a.w.idle += (ti - a.w.idle) * k;
        a.act.walk.weight = a.w.walk;
        a.act.run.weight = a.w.run;
        a.act.idle.weight = a.w.idle;
        a.holder.position.copy(a.pos);
        a.holder.rotation.y = a.heading;
        a.mixer.update(dt);
        if (a.saree) {
          a.holder.updateMatrixWorld(true);
          a.saree.update();
        }
      }
    },
  };

  sepLists.push(agents);
  T('pool');
  return { assembly, pool, crowd, posed, updateFrustum };
}

/** an animated teacher's saree, rebuilt every frame around her moving legs (lives in her holder's frame) */
/** hair and whatever they carry, for an animated figure: fixed to the head and hand bones so they move with them */
function attachExtras(obj, holder, kind, mat, pony = false) {
  const P = PALETTES[kind];
  holder.updateMatrixWorld(true);
  const parts = [];
  const id = (p) => p;
  if (kind === 'girl') {
    const S = new Shapes();
    if (pony) ponytail(S, REST);
    else longHair(S, REST, 10);
    parts.push(['Head', S]);
    const B = new Shapes();
    heldBook(B, REST, 1, 'notebook');
    parts.push(['LeftHand', B]);
  } else if (!P.teach) {
    const S = new Shapes();
    S.cap(id, 'hair', { bump: 0.06, rings: 6, around: 16, grow: 1.04, nape: 2.05 });
    parts.push(['Head', S]);
  }
  if (P.teach) {
    const B = new Shapes();
    heldBook(B, REST, 1, 'book', [0.12, 0.022, 0.09]);
    parts.push(['LeftHand', B]);
  }
  for (const [bone, S] of parts) {
    const b = obj.getObjectByName('mixamorig' + bone);
    if (!b) continue;
    const g = shapesToBaked(S);
    // from the figure at rest into the bone's own frame
    g.applyMatrix4(new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(holder.matrixWorld));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.frustumCulled = false;
    b.add(m);
  }
}

/** a cricket bat or a tennis racket, held in the right hand */
const PROP_MATS = {};
function attachProp(obj, holder, prop) {
  const b = obj.getObjectByName('mixamorigRightHand');
  if (!b) return;
  holder.updateMatrixWorld(true);
  const h = REST.handR;
  const parts = [];
  if (prop === 'bat') {
    PROP_MATS.willow = PROP_MATS.willow || new THREE.MeshStandardMaterial({ color: '#d9bb83', roughness: 0.6 });
    PROP_MATS.grip = PROP_MATS.grip || new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.8 });
    // (at rest the arm points out sideways, so the bat runs on from the fingers along -x)
    parts.push([new THREE.CylinderGeometry(0.016, 0.016, 0.26, 8).rotateZ(Math.PI / 2).translate(h.x - 0.16, h.y - 0.02, h.z), PROP_MATS.grip]);
    parts.push([new THREE.BoxGeometry(0.52, 0.035, 0.105).translate(h.x - 0.55, h.y - 0.02, h.z), PROP_MATS.willow]);
  } else {
    PROP_MATS.frame = PROP_MATS.frame || new THREE.MeshStandardMaterial({ color: '#1f3f7a', roughness: 0.4, metalness: 0.3 });
    PROP_MATS.strings = PROP_MATS.strings || new THREE.MeshStandardMaterial({ color: '#f1f1ea', roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    parts.push([new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8).rotateZ(Math.PI / 2).translate(h.x - 0.15, h.y - 0.02, h.z), PROP_MATS.frame]);
    parts.push([new THREE.TorusGeometry(0.13, 0.012, 6, 20).scale(1.3, 1, 1).rotateX(Math.PI / 2).translate(h.x - 0.43, h.y - 0.02, h.z), PROP_MATS.frame]);
    parts.push([new THREE.CircleGeometry(0.128, 20).scale(1.3, 1, 1).rotateX(Math.PI / 2).translate(h.x - 0.43, h.y - 0.02, h.z), PROP_MATS.strings]);
  }
  const toBone = new THREE.Matrix4().copy(b.matrixWorld).invert().multiply(holder.matrixWorld);
  for (const [g, m] of parts) {
    g.applyMatrix4(toBone);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    b.add(mesh);
  }
}

function makeLiveSaree(obj, kind, holder) {
  const P = PALETTES[kind];
  const colorOf = { saree: new THREE.Color(P.pants), border: new THREE.Color(P.belt), hair: new THREE.Color(P.hair), skirt: new THREE.Color(P.pants) };
  const trim = new THREE.Color(P.trim);
  const build = () => {
    const S = new Shapes();
    sareeClothes(S, jointsOf(obj, holder), 16);
    return S;
  };
  holder.updateMatrixWorld(true);
  const S0 = build();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(S0.pos, 3));
  const colors = new Float32Array(S0.role.length * 3);
  S0.role.forEach((r, i) => (r === 'border' && i % 3 === 0 ? trim : colorOf[r]).toArray(colors, i * 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(S0.idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  holder.add(mesh);
  return {
    mesh,
    update() {
      const S = build();
      g.attributes.position.array.set(S.pos);
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
    },
  };
}
