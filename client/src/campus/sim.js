import * as THREE from 'three';
import { FL } from './school.js';
import { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel, TIMES, PERIODS, CHANGEOVERS, isLessons, speedAt, periodAt } from './day.js';
import { CLASSROOMS, STAIRS, FEET, STAFF, HOD, LIBRARY, BLOCKS, corridorPath } from './rooms.js';
import { MALE_TEACHERS, FEMALE_TEACHERS } from './people.js';
import { DROP, DROP_WALK, BUS_GATE } from './grounds.js';

/*
  A school day for a thousand-plus students, from the gate opening to the gate closing.

  07:15  gate opens · teachers drive in and go to the staff room · buses park in their bays ·
         autos drop children at the gate · friends walk in together with school bags, climb
         the stairs, open the classroom door and sit down at their desks
  07:58  assembly bell · every class comes out of its room, down the stairs, into its line
  08:10  assembly · the whole school in class lines, teachers in front of the flag
  08:28  lines break up from the back, everyone goes back up to class and sits down
  08:40  lessons · a teacher at every blackboard, fans turning · a PE class jogs round the
         track · readers in the library · the HOD at her desk
  12:30  lunch · friends come down together and stand about in little circles, chatting
  13:10  lessons · football in PE
  15:20  home bell · classes empty out in groups of friends with their bags → buses (each
         leaves when its children are on board), autos queueing at the gate, or the walk home
  16:05  evening · teachers leave the staff room and drive home · the gate shuts at 17:35

  Busy moments run close to real time and lessons fast-forward (see day.js).
*/

export { PHASES, DAY_START, DAY_END, phaseAt, clockLabel, phaseLabel };

const V = (x, z, y = FEET.ground) => new THREE.Vector3(x, y, z);
/** a route point everyone walks through exactly (no sideways spread) — lanes between the assembly lines, inside rooms */
const E = (x, z, y = FEET.ground) => Object.assign(new THREE.Vector3(x, y, z), { exact: true });
/** a point where friends walking together squeeze up (stairs, doorways, the gap between buses) */
const NW = (x, z, y = FEET.ground) => Object.assign(new THREE.Vector3(x, y, z), { narrow: true });
/** where a staircase meets its corridor: as wide as the stairs, so two abreast too */
const ST = (x, z, y) => Object.assign(new THREE.Vector3(x, y, z), { narrow: true, stair: true });
/** a point on a staircase (wide enough for two abreast: people keep to one side or the other of the flight) */
const P3 = ([x, y, z], flags = { narrow: true, stair: true }) => Object.assign(new THREE.Vector3(x, y, z), flags);
/** a point in a corridor or on the footpath: friends keep closer together there (squeeze = share of their usual spacing) */
const SQ = (x, z, y = FEET.ground, squeeze = 0.5) => Object.assign(new THREE.Vector3(x, y, z), { squeeze });
// friends walking side by side: how far each one keeps to the right of the shared route
const LAT = { 1: [0], 2: [-0.36, 0.36], 3: [-0.62, 0, 0.62], 4: [-0.78, -0.26, 0.26, 0.78], 5: [-0.9, -0.45, 0, 0.45, 0.9] };
const hm = (h, m = 0) => h * 60 + m;

// ---------- the bus bay: four drive-through bays, so a bus never passes another ----------
const LANES = [25.2, 28.8, 32.4, 36.0];
const PARK_X = 30;
const busSlot = (i) => ({ x: PARK_X, z: LANES[i] });
// the buses have their own gate at the east end of the bay: in off the road (a left turn), down beside the bay and
// into it nose first; out again round the west end of the bay, along the lane by the wall and back out of their gate
// (another left turn) — so they never cross the walkers at the main gate
const BX = BUS_GATE.x;
const busIn = (s) => [
  [-120, 49.5], [30, 49.5], [BX - 8, 49.4], [BX - 2.8, 48.3], [BX - 0.4, 46], [BX, 43.4], [BX, 40.4], [BX - 0.4, 37.0],
  ...(s.z < 34 ? [[BX - 0.3, s.z + 2.2]] : []),
  [BX - 2.8, s.z + 0.25], [42, s.z], [s.x, s.z],
];
const busOut = (s) => [
  [s.x, s.z], [s.x - 6, s.z], [16, s.z],
  // (round the west end of the bay: a wide sweep for the bays further from the wall, a tighter loop for the last)
  ...(s.z < 34
    ? [[11.2, s.z + 0.6], [8.2, s.z + 3], ...(s.z + 3 < 35.5 ? [[7.5, (s.z + 40.6) / 2]] : []), [7.7, 37.6], [9.4, 39.4]]
    : [[11.8, s.z - 0.6], [8.4, s.z - 0.1], [6.8, 38.0], [8.4, 39.6]]),
  [13.5, 39.8], [40, 39.8], [BX - 3.8, 40.1], [BX - 0.8, 41.8], [BX, 44.2], [BX + 0.6, 46.6], [BX + 3, 48.6], [BX + 8, 49.5], [160, 49.5],
];
// the door is at the front on the left; children walk up the aisle beside the bus
const busDoor = (s) => V(s.x - 3.3, s.z + 1.6);
const busAisle = (s) => s.z + 1.85;

// ---------- staff car park: cars drive in nose first from the aisle, and reverse out to leave ----------
const CAR_SLOTS = [-20, -24, -28];
// (cars come in on the east half of the gate like the buses, then cross the footpath lane once)
const carIn = (x) => [[-120, 49.5], [-30, 49.5], [-12, 49.4], [-4.5, 48.4], [-0.6, 46.2], [1.4, 43.4], [1.3, 40.6], [-2, 39.0], [-10, 38.8], [x + 5, 38.8], [x + 1.6, 37.9], [x, 36.2], [x, 34.8]];
const carBackOut = (x) => [[x, 34.8], [x, 36.6], [x - 1.4, 38.4], [x - 4.2, 38.8]];
const carOut = (x) => [[x - 4.2, 38.8], [-10, 38.8], [-3, 39.2], [1.2, 40.6], [2.2, 43.4], [1.0, 46.4], [-4, 50.8], [-14, 56.5], [-150, 56.5]];

// ---------- the drop-off: autos and parents' cars come in at their own gate, round a one-way loop (clockwise, as
// Indian traffic goes round), set the children down at the canopy and drive out again ----------
const AUTO_SEATS = 4;
const CAR_SEATS = 2;
/** points round the loop, from angle a0 down to a1 (degrees; clockwise from above) */
const loop = (a0, a1) => {
  const out = [];
  for (let a = a0; a >= a1 - 0.01; a -= 15) out.push([DROP.x + Math.cos((a * Math.PI) / 180) * DROP.r, DROP.z + Math.sin((a * Math.PI) / 180) * DROP.r]);
  return out;
};
const DROP_IN = [[-112, 49.5], [-68, 49.5], [-60, 49.3], [-55.2, 47.6], [-54.1, 44.6], ...loop(75, -90)];
const DROP_OUT = [[DROP.x, DROP.z - DROP.r], ...loop(-105, -255), [-58.3, 43.4]];
const DROP_ROAD = [[-58.3, 43.4], [-58.7, 46.4], [-56.8, 48.9], [-50, 49.5], [160, 49.5]];
/** where children stand under the canopy (two rows of places, an arm's length apart), and their path to the courtyard */
const WAIT_SLOTS = [];
for (let r = 0; r < 2; r++) for (let k = 0; k < 12; k++) WAIT_SLOTS.push({ x: DROP.x - 4.6 + k * 0.64 + r * 0.32, z: 23.62 + r * 0.6, kid: null });
const WAIT_LANE = 24.85; // (in front of the rows: they walk along here to their place, and from it to their ride)
const DROP_PATH = [V(-52.5, 24.3), ...DROP_WALK.map(([x, z]) => V(x, z))];

// ---------- places ----------
// people use the west half of the gate and the drive; buses keep to the east half
// (walkers keep to the lane west of the median in the gateway; vehicles use the east half)
const GATE_IN = [V(-2.2, 43.2), V(-1.9, 30), V(-1.3, 14), V(0.6, 4)];
const COURTYARD_IN = V(0.6, 4);
/** somewhere across the courtyard's wide front opening (so groups don't all funnel through one spot) */
const courtyardGap = (rng) => V(0.6 + (rng() - 0.5) * 8, 4 + (rng() - 0.5) * 2.2);
// places where friends stand about at lunch: the courtyard and the front lawns
const LUNCH_AREAS = [
  { x0: -20, x1: 20, z0: -19, z1: 1.5, not: (x, z) => (Math.abs(x) < 3.2 && z > -14.5 && z < -7.5) || (Math.abs(x) < 7 && z < -14.5) },
  { x0: -22, x1: -12, z0: 13, z1: 30, not: (x, z) => Math.hypot(x + 17, z - 21.5) < 6.2 }, // (round the fountain)
  { x0: 26, x1: 44, z0: 11.5, z1: 18 },
  { x0: -46, x1: -30, z0: 11.5, z1: 17.5 },
];
const COURT = { x0: -68, x1: -56, z0: -9, z1: 15 };
// the wings are solid buildings: to reach the playground (east) or the court (west), go out of the
// courtyard past the front end of the wing, along the outside, then down the path
const EAST_OUT = [V(25.4, 7.2), V(27.5, 11.2), V(38, 11.4), V(45, 9.4), V(47.6, 2), V(47.6, -8)];
const WEST_OUT = [V(-25.4, 7.2), V(-27.5, 11.2), V(-38, 11.4), V(-45, 9.4), V(-50, 6)];
const PITCH = { x0: 74, x1: 96, z0: -54, z1: -6 };

// assembly: every class stands in its own pair of lines (boys and girls), facing the flag
const LINE_PITCH = 1.12;
const ROW_PITCH = 0.62;
// (an aisle down the middle, where the teachers walk)
const lineX = (cls) => -22.4 + (cls + 0.5) * LINE_PITCH + (cls < 20 ? -0.75 : 0.75);
// (the boys' and girls' lines stand close, leaving a clear gap either side for walking up)
const slotXZ = (cls, kind, row) => [lineX(cls) + (kind === 'boy' ? -0.235 : 0.235), -8.2 + row * ROW_PITCH];
// the gap beside each line: students walk up it and step into their place, never through others
const laneX = (cls, kind) => lineX(cls) + (kind === 'boy' ? -0.56 : 0.56);
const LINES_FRONT = -9.5;
const LINES_BACK = 1.0;
const FLAG_CLEAR = 2.7; // half the flag platform plus room to pass
// the lines fill the middle of the courtyard (x ±23, z -8 to 0): to get from the front to the back
// you walk round the end of them
const LINES_X = 23.6;

export function createSim({ people, vehicles, grounds, scene, rng, onBell, onStory }) {
  const { pool, assembly, crowd, posed } = people;
  const F = vehicles.fleet;
  const N = crowd.capacity;
  const CLASSES = CLASSROOMS.length;
  const perClass = Math.max(4, Math.floor(N / CLASSES));
  const busCap = Math.max(10, Math.round(N * 0.04));
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const randIn = (r) => V(r.x0 + rng() * (r.x1 - r.x0), r.z0 + rng() * (r.z1 - r.z0));
  const route = (a, pts, o) => a.sys.route(a, pts, o);
  const release = (a) => a.sys.release(a);
  /** a group of friends: 1 to 4, mostly 2 or 3 */
  const groupSize = (max = 4) => {
    const r = rng();
    return Math.min(max, r < 0.18 ? 1 : r < 0.52 ? 2 : r < 0.84 ? 3 : 4);
  };
  /** friends keep the same walking speed (small ones step quicker) */
  const evenPace = (a, base) => (base * 0.86) / a.size;

  let minutes = DAY_START;
  let last = DAY_START;
  let phase = null;
  let gateOpen = 0;
  let paused = false;
  let speedOverride = null;
  const timers = {};
  const every = (key, sec, dt, fn) => {
    timers[key] = (timers[key] ?? rng() * sec) - dt;
    if (timers[key] <= 0) {
      timers[key] = sec * (0.6 + rng() * 0.8);
      fn();
    }
  };
  // things that happen a few seconds from now (cleared when the day jumps)
  let queue = [];
  const later = (sec, fn) => queue.push({ t: sec, fn });
  /** like later(), but if fn() reports failure (everyone's busy, or the road isn't clear) it tries again shortly */
  const soon = (sec, fn, tries = 160) => later(sec, () => fn() || (tries > 0 && soon(0.25, fn, tries - 1)));
  /** a vehicle sets off along a route once its starting spot on the road is clear */
  const setOff = (d, path, opts) => soon(0, () => (vehicles.clearAt(path[0][0], path[0][1], 12) ? (d.drive(path, opts), true) : false));

  // ---------- seats: every classroom has desks; students sit down and stand up for real ----------
  const at = (b, u, v) => BLOCKS[b].at(u, v);
  const seats = CLASSROOMS.map((room, ci) => {
    const [cx, cz] = at(room.block, room.rc, 3.3);
    const g = posed.group(cx, room.feet + 1.2, cz, 5.4);
    // how far each desk is from the door (in, along the front, down the aisle, along the row): the far desks
    // fill first and empty last, so nobody has to squeeze past someone sitting down or getting up
    const d2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const walkTo = (s) => d2(room.inDoor, room.frontAisle) + d2(room.frontAisle, s.aisle) + d2(s.aisle, s.row) + d2(s.row, [s.x, s.z]);
    const mk = (s, kind, i) => ({ ...s, kind, rowIdx: Math.floor(i / 4), state: 0, walk: walkTo(s), slot: posed.slot(g, { kind, x: s.x, y: s.y, z: s.z, heading: s.heading }) });
    const teacherKind = (ci % 2 ? MALE_TEACHERS : FEMALE_TEACHERS)[Math.floor(ci / 2) % 3];
    return {
      girl: room.girls.map((s, i) => mk(s, 'girl', i)),
      boy: room.boys.map((s, i) => mk(s, 'boy', i)),
      // the teacher's spots: explaining in front of the class, writing at the board, pointing from the boys' side
      // (the teacher's table is on the other side, by the window)
      teacher: posed.slot(g, {
        kind: teacherKind,
        pose: 'teach',
        x: room.teacher.p[0],
        y: room.feet,
        z: room.teacher.p[1],
        heading: room.teacher.heading,
        teach: { mid: at(room.block, room.rc - 2.35, 3.3), board: at(room.block, room.rc - 2.85, 2.6), side: at(room.block, room.rc - 2.3, 5.25), face: room.teacher.heading, back: room.teacher.heading + Math.PI },
      }),
      n: 0, // students sitting
    };
  });
  // at assembly each class teacher stands at the front of their class's two lines
  // the watchman, just inside the main gate: he stands watching the road, and holds up a hand to stop the
  // walkers on the footpath while a bus or car turns across it
  const WATCH = { x: -9.75, z: 41.6 }; // (beside the guard house, facing the gate)
  const watchman = posed.slot(posed.group(WATCH.x, FEET.ground + 1, WATCH.z, 3), { kind: 'guard', pose: 'stand', x: WATCH.x, y: FEET.ground, z: WATCH.z, heading: Math.atan2(0 - WATCH.x, 46 - WATCH.z) });
  posed.set(watchman, true);
  // and a second guard at the drop-off gate, who waves the cars and autos in and out
  const WATCH2 = { x: -49.6, z: 41.4 };
  const watchman2 = posed.slot(posed.group(WATCH2.x, FEET.ground + 1, WATCH2.z, 3), { kind: 'guard', pose: 'stand', x: WATCH2.x, y: FEET.ground, z: WATCH2.z, heading: Math.atan2(DROP.x - WATCH2.x, 44.5 - WATCH2.z) });
  posed.set(watchman2, true);
  // and a third at the buses' gate, who stops the road for them
  const WATCH3 = { x: BX + 6.6, z: 41.9 };
  const watchman3 = posed.slot(posed.group(WATCH3.x, FEET.ground + 1, WATCH3.z, 3), { kind: 'guard', pose: 'stand', x: WATCH3.x, y: FEET.ground, z: WATCH3.z, heading: Math.atan2(BX - WATCH3.x, 46 - WATCH3.z) });
  posed.set(watchman3, true);
  let signalT = 0;
  let signal2T = 0;
  let signal3T = 0;
  const asmGroup = posed.group(0, FEET.ground + 1, -5, 28);
  const assemblyTeachers = CLASSROOMS.map((_, c) => posed.slot(asmGroup, { kind: [...MALE_TEACHERS, ...FEMALE_TEACHERS][(c * 7 + 5) % 6], pose: 'stand', x: lineX(c), y: FEET.ground, z: -8.78, heading: Math.PI }));
  const reserveSeat = (cls, kind) => {
    const S = seats[cls];
    for (const k of [kind, kind === 'boy' ? 'girl' : 'boy']) {
      // the class spreads over every row (a classroom with its front benches empty looks wrong): the row with the
      // fewest taken so far, and in it the free desk furthest in
      const taken = [0, 0, 0, 0, 0, 0];
      for (const x of S[k]) if (x.state !== 0) taken[x.rowIdx]++;
      let s = null;
      for (const x of S[k]) if (x.state === 0 && (!s || taken[x.rowIdx] < taken[s.rowIdx] || (taken[x.rowIdx] === taken[s.rowIdx] && x.walk > s.walk))) s = x;
      if (s) {
        s.state = 1;
        return s;
      }
    }
    return null;
  };
  const occupy = (cls, s, who) => {
    s.state = 2;
    s.slot.kind = who.kind;
    s.slot.size = who.size;
    s.slot.tone = who.tone;
    posed.set(s.slot, true);
    seats[cls].n++;
  };
  /** someone at a desk stands up (that desk, or the one nearest the door, preferring boys or girls); returns their seat */
  const standUp = (cls, kind, seat = null) => {
    const S = seats[cls];
    let s = seat && seat.state === 2 ? seat : null;
    for (const k of kind ? [kind, kind === 'boy' ? 'girl' : 'boy'] : rng() < 0.5 ? ['boy', 'girl'] : ['girl', 'boy']) {
      if (s) break;
      for (const x of S[k]) if (x.state === 2 && (!s || x.walk < s.walk)) s = x;
    }
    if (!s) return null;
    s.state = 0;
    posed.set(s.slot, false);
    S.n--;
    return s;
  };
  /**
   * who gets up when, as a class leaves: `order` lists each leaver ({ kind, t } — when they should be through
   * the door). Each takes the nearest desk of their kind still occupied, and stands up just early enough to
   * reach the door at their time — so everyone walks out at the same speed, a step apart, and nobody overtakes.
   */
  const planExit = (cls, order, base, start) => {
    const S = seats[cls];
    const used = new Set();
    const v = 1.032 * base; // walking speed (see evenPace)
    const out = order.map(({ kind, t }) => {
      let best = null;
      for (const k of [kind, kind === 'boy' ? 'girl' : 'boy']) {
        for (const x of S[k]) if (x.state === 2 && !used.has(x) && (!best || x.walk < best.walk)) best = x;
        if (best) break;
      }
      if (!best) return null;
      used.add(best);
      return { seat: best, at: t - best.walk / v };
    });
    const first = Math.min(Infinity, ...out.filter(Boolean).map((o) => o.at));
    if (first < start) for (const o of out) if (o) o.at += start - first;
    return out;
  };
  /** fill (or empty) the desks straight away, when the day jumps */
  const fillSeats = (share, skip = -1) => {
    for (let c = 0; c < CLASSES; c++) {
      const S = seats[c];
      for (const k of ['girl', 'boy']) for (const s of S[k]) {
        s.state = 0;
        posed.set(s.slot, false);
      }
      S.n = 0;
      if (c === skip) continue;
      const n = Math.round(perClass * share);
      for (let i = 0; i < n; i++) {
        const kind = i % 2 ? 'boy' : 'girl';
        const s = reserveSeat(c, kind);
        if (s) occupy(c, s, { kind: s.kind, size: 0.78 + rng() * 0.14, tone: 0.84 + rng() * 0.16 });
      }
    }
  };
  const inClassTime = () => phase && isLessons(phase.id);
  // who teaches which class each period (six teachers' looks, never the same one twice running)
  const TEACHERS = [...MALE_TEACHERS, ...FEMALE_TEACHERS];
  const teacherFor = (cls, period) => (cls === COVER.cls && period === COVER.period ? COVER.sub : TEACHERS[(cls * 7 + period * 5) % TEACHERS.length]);
  /**
   * Today's cover — the ProxyPilot moment. One teacher is on leave; ProxyPilot gave her period-6 class to a
   * colleague of the same subject who is free that period. As lunch ends he walks over from the staff room,
   * up to the class, and starts the lesson.
   */
  const COVER = { cls: 1, period: 6, sub: 'teacher3', className: '8B', absent: 'Mrs Rao', teacher: 'Mr Iyer', subject: 'Maths' };
  let coverAgent = null;
  // the classrooms whose changeovers are walked out in full (the two the camera looks into)
  const ANIM_ROOMS = new Set([0, 1]);
  const updateTeachers = () => {
    seats.forEach((S, c) => {
      // between periods the teacher has left and the next one isn't in yet
      const between = S.tLeave != null && minutes >= S.tLeave && minutes < S.tBack;
      if (!ANIM_ROOMS.has(c) && S.tBack != null && minutes >= S.tBack && S.nextKind) {
        S.teacher.kind = S.nextKind;
        S.nextKind = null;
        S.teacher.restart = true;
      }
      const away = ANIM_ROOMS.has(c) ? S.away : between;
      posed.set(S.teacher, inClassTime() && S.n >= 3 && !away);
    });
    // at assembly, every class teacher stands at the front of their class's lines
    const asm = minutes > TIMES.assemblyBell + 2.5 && minutes < TIMES.toClass + 1.2;
    for (const t of assemblyTeachers) posed.set(t, asm);
  };
  /** the start of a block of lessons: each class has this period's teacher */
  const setTeachers = (m) => {
    const period = Math.max(1, periodAt(m) || 1);
    seats.forEach((S, c) => {
      S.teacher.kind = teacherFor(c, period);
      S.tLeave = S.tBack = null;
      S.nextKind = null;
      S.away = c === COVER.cls && Boolean(coverAgent?.active); // (the substitute is still on his way)
    });
  };
  const coverStory = (step) =>
    onStory?.(
      step && {
        step,
        agent: step === 'walking' ? coverAgent : null,
        room: COVER.cls,
        title: step === 'walking' ? 'Cover by ProxyPilot' : 'Class covered',
        lines:
          step === 'walking'
            ? [`${COVER.absent} (${COVER.subject}) is on leave today`, `Period ${COVER.period} · Class ${COVER.className} → ${COVER.teacher}, free this period`]
            : [`${COVER.teacher} is teaching ${COVER.className}`, 'No phone calls, no empty classroom'],
      }
    );
  /** the substitute gets up in the staff room and walks to the class */
  const startCover = () => {
    if (coverAgent?.active) return;
    const S = seats[COVER.cls];
    const room = CLASSROOMS[COVER.cls];
    const T = S.teacher.teach;
    coverAgent = outOfStaffRoom([...toDoor(room), E(room.inDoor[0], room.inDoor[1], room.feet), E(T.mid[0], T.mid[1], room.feet)], { kind: COVER.sub, tag: 'cover', pace: 1.2 });
    if (!coverAgent) return;
    S.away = true;
    coverAgent.onArrive = (b) => {
      release(b);
      coverAgent = null;
      S.teacher.kind = COVER.sub;
      S.teacher.restart = true;
      S.away = false;
      coverStory('arrived');
      later(10, () => coverStory(null));
    };
    coverStory('walking');
  };
  /**
   * The bell between two periods: every teacher walks out and the next period's comes in. In the rooms
   * the camera can look into, they're seen doing it — out of the door, along the corridor to the stairs,
   * and the next teacher up the stairs, along and in.
   */
  const changeover = (t) => {
    const next = periodAt(t + 0.5);
    seats.forEach((S, c) => {
      S.tLeave = t + (c % 7) * 0.05;
      S.tBack = t + 1.5 + ((c * 3) % 5) * 0.12;
      S.nextKind = teacherFor(c, next);
      if (!ANIM_ROOMS.has(c) || S.n < 3) return;
      const room = CLASSROOMS[c];
      const T = S.teacher.teach;
      const st = STAIRS[room.stair];
      const toStairs = room.floor === 0 ? [SQ(room.corr[0], room.corr[1], room.feet), SQ(...along(room, 9), room.feet)] : [SQ(room.corr[0], room.corr[1], room.feet), ...corridor(room.corr, st.corr, room.feet), ST(st.corr[0], st.corr[1], room.feet)];
      // (down the first flight to the landing, out of sight behind the stairwell wall)
      const flight = room.floor === 0 ? [] : st.up(room.floor - 1);
      const goDown = room.floor === 0 ? [] : [P3(flight[7]), P3(flight[6]), P3(flight[5]), P3(flight[4])];
      // out goes this period's teacher...
      later(0.3 + (c % 3) * 0.4, () => {
        if (!isLessons(phaseAt(minutes).id)) return;
        const out = pool.spawn([E(T.mid[0], T.mid[1], room.feet), E(room.inDoor[0], room.inDoor[1], room.feet), NW(room.door[0], room.door[1], room.feet), ...toStairs, ...goDown], { teacher: true, kind: S.teacher.kind, tag: 'changeover', pace: 1.1, onArrive: release });
        S.away = true;
        if (!out) later(6, () => arrive());
      });
      // ...and in comes the next one, up the stairs (or along the corridor) and into the room
      const arrive = () => {
        S.teacher.kind = S.nextKind || S.teacher.kind;
        S.nextKind = null;
        S.teacher.restart = true;
        S.away = false;
      };
      later(3.5 + (c % 3) * 0.5, () => {
        const back = [...toStairs].reverse();
        const from = room.floor === 0 ? back : [...goDown.slice().reverse(), ...back];
        const a = pool.spawn([...from, NW(room.door[0], room.door[1], room.feet), E(room.inDoor[0], room.inDoor[1], room.feet), E(T.mid[0], T.mid[1], room.feet)], { teacher: true, kind: S.nextKind, tag: 'changeover', pace: 1.1 });
        if (!a) return later(8, arrive);
        a.onArrive = (b) => {
          S.nextKind = b.kind; // (whoever walked in is who teaches)
          release(b);
          arrive();
        };
      });
    });
  };
  /** a point along a room's corridor, `d` metres from its door towards the nearer end of the block */
  const along = (room, d) => {
    const B = BLOCKS[room.block];
    const du = room.rc - 2.5;
    const dir = du > 0 ? -1 : 1;
    return B.at(du + dir * d, 7.8);
  };

  // ---------- getting about the building ----------
  const climb = (st, f) => {
    const out = [];
    for (let k = 0; k < f; k++) for (const p of st.up(k)) out.push(P3(p));
    return out;
  };
  const corridor = (from, to, y) => corridorPath(from, to, y).map((p) => SQ(p[0], p[2], p[1]));
  // (the way round the clock tower's porch to the stairs beside it is two abreast, like the stairs)
  const yardIn = (st) => st.yard.map(([x, z]) => ST(x, z, FEET.ground));
  /** from the courtyard to just outside a room's door */
  const toDoor = (room) => {
    if (room.floor === 0) return [...room.groundPath.map(([x, y, z]) => (y > 0.3 ? SQ(x, z, y) : V(x, z, y))), NW(room.door[0], room.door[1], room.feet)];
    const st = STAIRS[room.stair];
    return [
      ...yardIn(st),
      ST(st.ground[0], st.ground[1], FEET.ground),
      ST(st.corr[0], st.corr[1], FEET.corridor),
      ...climb(st, room.floor),
      SQ(st.corr[0], st.corr[1], room.feet),
      ...corridor(st.corr, room.corr, room.feet),
      NW(room.door[0], room.door[1], room.feet),
    ];
  };
  /** from just outside a room's door down to the courtyard */
  const fromDoor = (room) => {
    if (room.floor === 0) return room.groundPath.slice().reverse().map(([x, y, z]) => (y > 0.3 ? SQ(x, z, y) : V(x, z, y)));
    const st = STAIRS[room.stair];
    return [
      SQ(room.corr[0], room.corr[1], room.feet),
      ...corridor(room.corr, st.corr, room.feet),
      ...climb(st, room.floor).reverse(),
      ST(st.corr[0], st.corr[1], FEET.corridor),
      ST(st.ground[0], st.ground[1], FEET.ground),
      ...yardIn(st).reverse(),
    ];
  };
  /** in through the door, along the front of the class, down the aisle to the desk */
  const intoSeat = (room, s) => [E(room.inDoor[0], room.inDoor[1], room.feet), E(room.frontAisle[0], room.frontAisle[1], room.feet), E(s.aisle[0], s.aisle[1], room.feet), E(s.row[0], s.row[1], room.feet), E(s.x, s.z, room.feet)];
  const outOfSeat = (room, s) => [E(s.row[0], s.row[1], room.feet), E(s.aisle[0], s.aisle[1], room.feet), E(room.frontAisle[0], room.frontAisle[1], room.feet), E(room.inDoor[0], room.inDoor[1], room.feet), NW(room.door[0], room.door[1], room.feet)];
  /** where a room's people come out into the courtyard */
  const courtyardOf = (room) => {
    if (room.floor === 0) return room.front;
    const st = STAIRS[room.stair];
    return st.yard.length ? st.yard[0] : st.ground;
  };
  /** somewhere for a group of friends to wait for each other: near where they come out, a little way into the courtyard */
  const meetSpot = (room) => {
    const [x, z] = courtyardOf(room);
    const ang = rng() * Math.PI * 2;
    const r = 1.6 + rng() * 2.2;
    // (towards the middle of the courtyard, never back into the building)
    const tx = x + (Math.sign(-x) || 1) * (1.2 + Math.abs(Math.cos(ang)) * r);
    let tz = z + Math.sin(ang) * r + (z < -20 ? 2 : 0);
    tz = Math.max(-19.5, Math.min(7.5, tz));
    // (never on the clock tower's porch: out beside it instead)
    if (Math.abs(tx) < 6.6 && tz < -14.8) return [(Math.sign(x) || 1) * (6.8 + rng() * 2.4), tz];
    return [Math.max(-23.5, Math.min(23.5, tx)), tz];
  };
  const inBuilding = (p) => p.y > 0.3 || (Math.abs(p.x) < 36 && p.z > -34 && p.z < 8 && (p.z < -25 || Math.abs(p.x) > 27));
  /** change someone's plan: at once if they're outside, or as soon as they come out if they're still in the building */
  const reroute = (a, fn) => {
    if (inBuilding(a.pos)) {
      a.onArrive = (b) => fn(b);
      a.waitAfter = 0; // (and no standing about when they get there)
    } else fn(a);
  };

  const gathering = () => minutes >= TIMES.assemblyBell && minutes < TIMES.toClass;
  /**
   * from wherever the student is, through the courtyard, up the stairs, along the corridor,
   * in through the door and to a free desk, where they sit down.
   * opts.queue: their place in a group of friends (they take turns at the door)
   */
  const goToClass = (a, cls, from = [], opts = {}) => {
    const room = CLASSROOMS[cls];
    const s = reserveSeat(cls, a.kind);
    opts = { ...opts, pace: evenPace(a, opts.pace || 1.3) }; // (the same speed for big and small, so nobody catches up inside)
    const path = [...from, ...toDoor(room)];
    const holdAt = opts.queue ? { [path.length - 1]: opts.queue * 0.75 } : null;
    a.data = { ...(a.data || {}), cls, seat: s };
    if (!s) {
      route(a, path, { ...opts, holdAt, onArrive: release }); // (never happens: every class has spare desks)
      return;
    }
    route(a, [...path, ...intoSeat(room, s)], {
      ...opts,
      holdAt,
      onArrive: (b) => {
        if (b.data) b.data.seat = null;
        if (gathering() && phase?.id !== 'arrival') {
          // the assembly bell went while they were on the way: straight back out to the line
          s.state = 0;
          b.tag = 'toLine';
          route(b, [...outOfSeat(room, s).slice(-2), ...fromDoor(room)], { pace: 1.4, onArrive: (c) => walkToLine(c, cls) });
          return;
        }
        occupy(cls, s, b);
        release(b);
      },
    });
  };
  /**
   * a student stands up from their desk and walks out of the classroom and down to the courtyard,
   * then carries on with next(agent). Returns the agent, null if nobody's free to play them
   * (try again), or 'empty' if nobody is sitting in that class.
   */
  const leaveClass = (cls, opts, next, kind, seat = null) => {
    const room = CLASSROOMS[cls];
    const s = standUp(cls, kind, seat);
    if (!s) return 'empty';
    const a = crowd.spawn([E(s.x, s.z, room.feet), ...outOfSeat(room, s), ...fromDoor(room)], {
      ...opts,
      pace: ((opts.pace || 1.2) * 0.86) / s.slot.size, // (small ones step quicker: the whole class walks at one speed)
      kind: s.slot.kind,
      size: s.slot.size,
      tone: s.slot.tone,
      jitterStart: false,
      onArrive: (b) => next(b),
    });
    if (!a) {
      occupy(cls, s, s.slot); // nobody free right now: they stay sitting
      return null;
    }
    a.data = { ...(a.data || {}), cls };
    return a;
  };

  /**
   * Friends meet up in the courtyard after coming down, then go on together.
   * grp: { expect, here: [], go(members) }
   */
  const meet = (grp, b) => {
    if (b.tag === 'toClass') return; // (the bell went while they were on their way: they've turned back)
    if (grp.gone) return grp.go([b]);
    const n = grp.here.length;
    const [cx, cz] = grp.spot;
    const ang = n * 2.1 + grp.spin;
    const r = 0.55;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    grp.here.push(b);
    b.meetGrp = grp;
    b.meetTag = b.tag;
    route(b, [V(x, z)], { wait: 1e9, face: Math.atan2(cx - x, cz - z), talk: true, pace: 0.9 });
    if (grp.here.length >= grp.expect) {
      grp.gone = true;
      later(0.6, () => grp.go(waiting(grp)));
    } else if (n === 0) {
      // nobody waits forever for a friend who isn't coming
      later(25, () => {
        if (grp.gone) return;
        grp.gone = true;
        grp.go(waiting(grp));
      });
    }
  };
  const newGroup = (spot, expect, go) => ({ spot, expect, here: [], go, gone: false, spin: rng() * 6 });
  /** the friends still standing at the meeting place (not anyone who's since been sent off somewhere else) */
  const waiting = (grp) => grp.here.filter((m) => m.active && m.meetGrp === grp && m.tag === m.meetTag);
  /**
   * When the whole school moves at once (down for assembly, back up after it, home time) each staircase takes its
   * classes a few at a time, so nobody is crushed on the stairs. Returns when each class sets off (seconds from
   * now), given how long one class takes to file past (`each(c)`). Ground-floor classes simply go, over `spread`.
   */
  const stairTurns = (each, spread, conc = 2) => {
    const out = new Array(CLASSES).fill(0);
    const byStair = new Map();
    CLASSROOMS.forEach((r, c) => {
      if (r.floor === 0) out[c] = rng() * spread;
      else (byStair.get(r.stair) || byStair.set(r.stair, []).get(r.stair)).push(c);
    });
    for (const list of byStair.values()) {
      list.sort(() => rng() - 0.5);
      const lanes = Array.from({ length: conc }, (_, k) => k * 2.5 + rng() * 2);
      for (const c of list) {
        let k = 0;
        for (let j = 1; j < conc; j++) if (lanes[j] < lanes[k]) k = j;
        out[c] = lanes[k];
        lanes[k] += each(c) + 1.5;
      }
    }
    return out;
  };
  /** a class empties out in groups of friends (girls with girls, boys with boys) */
  const emptyClass = (cls, start, gap, opts, go) => {
    const S = seats[cls];
    const counts = { girl: S.girl.filter((s) => s.state === 2).length, boy: S.boy.filter((s) => s.state === 2).length };
    const base = opts.pace || 1.3;
    // first the order (groups of friends, girls then boys) and when each is through the door...
    const order = [];
    let t = start;
    for (const kind of ['girl', 'boy']) {
      let left = counts[kind];
      while (left > 0) {
        const n = Math.min(left, groupSize());
        left -= n;
        const grp = newGroup(meetSpot(CLASSROOMS[cls]), n, (members) => go(members, cls));
        for (let k = 0; k < n; k++) {
          order.push({ kind, t, grp });
          t += 0.7;
        }
        t += gap;
      }
    }
    // ...then who sits where decides when they stand up
    const plan = planExit(cls, order, base, start);
    order.forEach(({ kind, grp }, i) => {
      const o = plan[i];
      soon(o ? o.at : start, () => {
        const a = leaveClass(cls, { pace: base, ...opts }, (b) => meet(grp, b), kind, o?.seat);
        if (a === 'empty') {
          grp.expect--;
          if (!grp.gone && grp.here.length && grp.here.length >= grp.expect) {
            grp.gone = true;
            grp.go(waiting(grp));
          }
        }
        return a;
      });
    });
  };
  /** send a group off along a route side by side; each member gets onArrive(member, k) */
  const walkTogether = (members, points, opts, onArrive) => {
    const lat = LAT[Math.min(5, members.length)] || LAT[1];
    members.forEach((m, k) => {
      m.talk = false;
      route(m, points, { ...opts, lateral: lat[k], pace: evenPace(m, opts.pace || 1.15), onArrive: (b) => onArrive?.(b, k) });
    });
  };

  // ---------- the staff room ----------
  const staffGroup = (() => {
    const [cx, cz] = at(STAFF.block, STAFF.rc, 3.3);
    return posed.group(cx, STAFF.feet + 1.2, cz, 5.4);
  })();
  const [tcx, tcz] = at(STAFF.block, STAFF.table.u, STAFF.table.v);
  const staffSeats = STAFF.chairs.map((c, i) => {
    const dx = c.x - tcx;
    const dz = c.z - tcz;
    const l = Math.hypot(dx, dz) || 1;
    const kind = (i % 2 ? MALE_TEACHERS : FEMALE_TEACHERS)[i % 3];
    return { ...c, back: [c.x + (dx / l) * 0.55, c.z + (dz / l) * 0.55], state: 0, slot: posed.slot(staffGroup, { kind, x: c.x, y: c.y, z: c.z, heading: c.heading }) };
  });
  const staffIn = (s) => [V(STAFF.front[0], STAFF.front[1]), NW(STAFF.door[0], STAFF.door[1], STAFF.feet), E(STAFF.inDoor[0], STAFF.inDoor[1], STAFF.feet), E(s.back[0], s.back[1], STAFF.feet), E(s.x, s.z, STAFF.feet)];
  /** a teacher walks into the staff room and sits down (or just goes in, if every chair is taken) */
  const toStaffRoom = (t, from = []) => {
    const free = staffSeats.filter((s) => s.state === 0);
    if (!free.length) {
      route(t, [...from, V(STAFF.front[0], STAFF.front[1]), NW(STAFF.door[0], STAFF.door[1], STAFF.feet), E(STAFF.inDoor[0], STAFF.inDoor[1], STAFF.feet)], { onArrive: release });
      return;
    }
    const s = pick(free);
    s.state = 1;
    route(t, [...from, ...staffIn(s)], {
      onArrive: (b) => {
        s.state = 2;
        s.slot.kind = b.kind;
        posed.set(s.slot, true);
        release(b);
      },
    });
  };
  /** a teacher gets up from the staff room table (if anyone's sitting there) and walks out, then on along `to` */
  const outOfStaffRoom = (to, opts = {}) => {
    const s = staffSeats.find((x) => x.state === 2);
    const start = s ? [E(s.x, s.z, STAFF.feet), E(s.back[0], s.back[1], STAFF.feet)] : [E(STAFF.inDoor[0], STAFF.inDoor[1], STAFF.feet)];
    const t = pool.spawn([...start, E(STAFF.inDoor[0], STAFF.inDoor[1], STAFF.feet), NW(STAFF.door[0], STAFF.door[1], STAFF.feet), V(STAFF.front[0], STAFF.front[1]), ...to], {
      teacher: true,
      ...(s ? { kind: s.slot.kind } : {}),
      ...opts,
    });
    if (t && s) {
      s.state = 0;
      posed.set(s.slot, false);
    }
    return t;
  };
  const fillStaff = (n) => {
    staffSeats.forEach((s, i) => {
      s.state = i < n ? 2 : 0;
      posed.set(s.slot, i < n);
    });
  };
  // the HOD at her desk, the librarian and readers in the library
  const hodGroup = (() => {
    const [cx, cz] = at(HOD.block, HOD.rc, 3.3);
    return posed.group(cx, HOD.feet + 1.2, cz, 5.4);
  })();
  const hodSlot = posed.slot(hodGroup, { kind: 'teacherF2', ...HOD.chair });
  const visitorSlot = posed.slot(hodGroup, { kind: 'teacher', ...HOD.visitors[0] });
  const libGroup = posed.group(LIBRARY.x, 1.6, LIBRARY.z - 1.5, 12);
  const librarian = posed.slot(libGroup, { kind: 'teacherF3', ...LIBRARY.librarian });
  const readers = LIBRARY.readers.map((r, i) => posed.slot(libGroup, { kind: i % 3 ? 'boy' : 'girl', ...r, size: 0.8 + rng() * 0.12, tone: 0.84 + rng() * 0.16 }));
  const readerOrder = readers.map((_, i) => i).sort(() => rng() - 0.5);
  const setOffices = () => {
    const m = minutes;
    posed.set(hodSlot, m > hm(7, 30) && m < hm(17, 5));
    posed.set(visitorSlot, (m > hm(9, 20) && m < hm(9, 50)) || (m > hm(13, 35) && m < hm(14, 0)));
    posed.set(librarian, m > hm(7, 40) && m < hm(17, 0));
    const id = phase?.id;
    const n = isLessons(id) ? 11 : id === 'lunch' ? 16 : id === 'break' ? 8 : id === 'home' ? 4 : id === 'after' ? 6 : 0;
    readerOrder.forEach((r, i) => posed.set(readers[r], i < n));
  };

  // ---------- the assembly lines ----------
  let rowsTaken = [];
  let lineAgents = [];
  const resetLines = () => {
    rowsTaken = Array.from({ length: CLASSES }, () => ({ boy: 0, girl: 0 }));
    lineAgents = [];
  };
  resetLines();
  const takeSlot = (cls, kind) => {
    const row = rowsTaken[cls][kind]++;
    const [x, z] = slotXZ(cls, kind, row);
    return { x, z, row };
  };
  const standInLine = (a, cls, slot) => {
    a.tag = 'line';
    a.data = { cls, row: slot.row };
    route(a, [], { wait: 1e9, face: Math.PI });
    a.pos.set(slot.x, FEET.ground, slot.z);
    a.heading = Math.PI;
    lineAgents.push(a);
  };
  /** coming from the front of the courtyard to a middle lane at the back: round the end of the lines */
  const behindLines = (a, via, lx) => {
    const from = via.length ? via[via.length - 1] : a.pos;
    if (from.z > -4 || from.y > 0.3) return [];
    const sx = Math.sign(from.x || lx || 1);
    return [V(sx * LINES_X, Math.min(from.z, -9.8)), V(sx * LINES_X, 2.4)];
  };
  /** from the back of the lines to somewhere at the front: round the end of them */
  const aroundLines = (lx, [x, z]) => {
    if (z > -4) return [];
    const sx = Math.sign(x || lx || 1);
    return [V(sx * LINES_X, 2.4), V(sx * LINES_X, -9.8)];
  };
  /** walk from wherever the student is to their place in the class line (up the gap beside the line) */
  const walkToLine = (a, cls, via = []) => {
    const slot = takeSlot(cls, a.kind);
    a.tag = 'toLine';
    a.data = { cls, row: slot.row };
    const lx = laneX(cls, a.kind);
    // (the middle lanes start right by the flag platform: those always come in from the back)
    const fromFront = (via.length ? via[via.length - 1].z : a.pos.z) < -4 && Math.abs(lx) > FLAG_CLEAR;
    const end = fromFront ? LINES_FRONT : LINES_BACK;
    route(a, [...via, ...(fromFront ? [] : behindLines(a, via, lx)), E(lx, end + (fromFront ? -1.2 : 1.2)), E(lx, end), E(lx, slot.z), E(slot.x, slot.z)], {
      pace: 1.35,
      run: a.run,
      onArrive: (b) => {
        b.tag = 'line';
        route(b, [], { wait: 1e9, face: Math.PI });
        lineAgents.push(b);
      },
    });
  };

  // ---------- morning arrivals ----------
  // every class gets its share of students
  let arrived = new Array(CLASSES).fill(0);
  const pickClass = () => {
    const open = [];
    for (let c = 0; c < CLASSES; c++) if (arrived[c] < perClass) open.push(c);
    const c = open.length ? pick(open) : Math.floor(rng() * CLASSES);
    arrived[c]++;
    return c;
  };
  /** one student (or a group of friends, with grp = { cls, lat, k }) walks in and goes up to class */
  const arriveToSchool = (start, via, bag = true, grp = null) => {
    const cls = grp ? grp.cls : pickClass();
    const a = crowd.spawn([start, ...via], {
      bag,
      pace: 1.45, // a brisk walk: the bell is at 7:58
      kind: grp?.kind,
      lateral: grp?.lat || 0,
      tag: 'arriving',
      onArrive: (b) => {
        // late for assembly: straight to the line, bag and all
        if (minutes >= TIMES.assemblyBell && minutes < TIMES.toClass) walkToLine(b, cls, []);
        else goToClass(b, cls, [], { pace: 1.45, lateral: grp?.lat || 0, queue: grp?.k || 0 });
      },
    });
    if (a) {
      a.data = { cls };
      if (grp) {
        a.pace = evenPace(a, 1.45);
        if (grp.k) arrived[cls]++;
      }
    }
    return a;
  };
  /** friends arriving together on foot, side by side */
  const arriveGroup = (start, via, n) => {
    const cls = pickClass();
    const kind = rng() < 0.5 ? 'boy' : 'girl';
    const lat = LAT[n];
    for (let k = 0; k < n; k++) arriveToSchool(start, via, true, { cls, lat: lat[k], k, kind });
  };
  /** where someone on foot comes from or goes to along the road (never as far as the drop-off gate to the west, or the
   *  buses' gate to the east: nobody on foot has to cross either) */
  const roadEnd = (side) => (side < 0 ? -(30 + rng() * 17) : 26 + rng() * 16);
  // (into the courtyard anywhere across its wide front, not all through one spot)
  const walkerFrom = (side) => [SQ(roadEnd(side), 45.45, FEET.ground, 0.45), [SQ(side * 2.4, 45.45, FEET.ground, 0.45), ...GATE_IN.slice(0, 3), courtyardGap(rng)]];

  let walkSchedule = [];
  const WALK_SPEED = 1.5; // metres a second for a group walking in (see evenPace)
  /**
   * Who walks in when: groups of friends, most between 7:15 and 7:31 (it's a two-minute walk from
   * down the road to a desk, so they're all sitting down by the bell). When the day jumps into the
   * morning, the groups who set off a little earlier are put where they'd be by now, and the ones
   * who'd have arrived are already at their desks.
   */
  const buildWalkSchedule = (fromMinute, jumping = false) => {
    const walkers = N - busCap * F.buses.length - AUTO_SEATS * F.autos.length - 1.5 * F.parents.length;
    const list = [];
    let left = walkers;
    while (left > 0) {
      const n = Math.min(left, groupSize());
      left -= n;
      const u = (rng() + rng() + rng()) / 3;
      // (the campus clock runs fast in the morning, so if everyone came in by the front gate the drive would be
      // packed solid: most come in by the side gate behind the library and are simply found at their desks)
      list.push({ t: hm(7, 13.5) + u * 30, n, unseen: rng() < 0.62 }); // (in by 7:44, so nobody is still on the stairs when the bell goes)
    }
    walkSchedule = list.filter((g) => g.t >= fromMinute).sort((x, y) => y.t - x.t); // popped from the end, earliest first
    if (!jumping) return 0;
    let seated = 0;
    const speed = speedAt(fromMinute); // campus minutes per real second
    for (const g of list) {
      if (g.t >= fromMinute) continue;
      if (g.unseen) {
        seated += g.n;
        continue;
      }
      const dist = ((fromMinute - g.t) / speed) * WALK_SPEED;
      const side = rng() < 0.5 ? -1 : 1;
      const pts = [SQ(roadEnd(side), 45.45, FEET.ground, 0.45), SQ(side * 2.4, 45.45, FEET.ground, 0.45), ...GATE_IN];
      // where along the way in they'd be by now
      let d = dist;
      let i = 0;
      for (; i < pts.length - 1; i++) {
        const l = pts[i].distanceTo(pts[i + 1]);
        if (d < l) break;
        d -= l;
      }
      if (i >= pts.length - 1) {
        if (d > 22) seated += g.n; // already up in class
        else arriveGroup(COURTYARD_IN.clone(), [V(0.4, 2)], g.n);
        continue;
      }
      const p = pts[i].clone().lerp(pts[i + 1], d / pts[i].distanceTo(pts[i + 1]));
      arriveGroup(p, pts.slice(i + 1), g.n);
    }
    return seated;
  };

  // ---------- vehicles ----------
  const busArrive = (i) => {
    const b = F.buses[i];
    b.slot = busSlot(i);
    b.load = 0;
    b.expected = 0;
    b.boarding = false;
    setOff(b, busIn(b.slot), {
      max: 7,
      onEnd: () => {
        b.unload = busCap;
        b.unloadTimer = 1.2;
      },
    });
  };
  const convoy = []; // buses waiting their turn to pull out
  const busDepart = (i) => {
    const b = F.buses[i];
    if (!b.obj.visible || b.active) return;
    b.boarding = false;
    b.departAt = null;
    // anyone still on the way to this bus has missed it, and walks home instead
    // (from the courtyard side of the hedge, out through the gap in it)
    for (const a of crowd.agents) if (a.active && a.tag === 'toBus' && a.data?.bus === i) walkHome(a, a.pos.z < 9.8 ? [courtyardGap(rng), V(-1.3, 14)] : []);
    b.drive(busOut(b.slot), { max: 8, onEnd: () => (b.obj.visible = false) });
  };
  const parkBus = (i) => {
    const b = F.buses[i];
    b.slot = busSlot(i);
    b.drive(busIn(b.slot));
    b.s = b.len;
    b.active = false;
    b.place();
    b.unload = 0;
  };
  const carArrive = (i) => {
    const c = F.cars[i];
    setOff(c, carIn(CAR_SLOTS[i]), {
      max: 9,
      onEnd: () => {
        const t = pool.spawn([V(CAR_SLOTS[i] - 1.45, 35.4), V(CAR_SLOTS[i] - 1.6, 33.4), V(-8, 33), V(-1.4, 26), V(-1, 12), V(-14, -1)], { teacher: true });
        if (t) t.onArrive = (b) => toStaffRoom(b);
      },
    });
  };
  const carDepart = (i) => {
    const c = F.cars[i];
    if (!c.obj.visible || c.active) return;
    // back out of the bay, then drive off — one car moving in the car park at a time
    const go = () =>
      soon(0, () => {
        if (F.cars.some((o) => o !== c && o.active && o.obj.position.z < 46)) return false;
        c.drive(carBackOut(CAR_SLOTS[i]), { max: 2.2, reverse: true, onEnd: () => c.drive(carOut(CAR_SLOTS[i]), { max: 9, onEnd: () => (c.obj.visible = false) }) });
        return true;
      }, 1e6);
    // the teacher gets up from the staff room table and walks out to the car
    // (past the fountain on its east side, between the palms and the hedge along the drive)
    const t = outOfStaffRoom([V(-20, 8.4), V(-7.7, 8.4), V(-7.9, 11.2), V(-8.1, 27.0), V(-10.6, 28.6), V(CAR_SLOTS[i] + 1.4, 33.6), V(CAR_SLOTS[i] + 1.4, 36.2)], {
      pace: 1.2,
      onArrive: (a) => {
        release(a);
        go();
      },
    });
    if (!t) go();
  };
  const parkCar = (i) => {
    const c = F.cars[i];
    c.drive(carIn(CAR_SLOTS[i]));
    c.s = c.len;
    c.active = false;
    c.place();
  };
  /**
   * an auto or a parent's car comes in at the drop-off gate and round the loop to the canopy: in the morning it
   * sets its children down (they walk along the path to the courtyard), after school it waits for its riders
   */
  const DROPPERS = [...F.autos, ...F.parents];
  F.autos.forEach((a) => (a.seats = AUTO_SEATS));
  F.parents.forEach((c) => (c.seats = CAR_SEATS));
  /** cars and autos inside the drop-off (or on their way in): no more than DROP_MAX at a time, so the queue never backs out onto the road */
  const DROP_MAX = 4;
  const inDrop = () => DROPPERS.reduce((n, d) => n + (d.obj.visible && !d.onRoad ? 1 : 0), 0);
  const dropRun = (v, dropping) => {
    v.load = 0;
    v.dropping = dropping;
    v.boarding = false;
    v.stopped = false;
    v.leaving = false;
    v.onRoad = false;
    v.due = !dropping;
    // (waits down the road, out of sight, till there's room in the loop)
    soon(0, () => {
      if (v.obj.visible || inDrop() >= DROP_MAX || !vehicles.clearAt(DROP_IN[0][0], DROP_IN[0][1], 12)) return false;
      v.due = false;
      v.drive(DROP_IN, dropOpts(v, dropping));
      return true;
    }, 2400);
  };
  const dropOpts = (v, dropping) => ({
      max: 7,
      onEnd: () => {
        v.stopped = true;
        v.waitT = 0;
        if (dropping) {
          // out they climb on the canopy side and walk in together
          const cls = pickClass();
          const kind = rng() < 0.5 ? 'boy' : 'girl';
          const n = v.seats === AUTO_SEATS ? AUTO_SEATS : 1 + (rng() < 0.55 ? 1 : 0);
          for (let k = 0; k < n; k++) {
            later(0.5 + k * 0.55, () => {
              const kid = arriveToSchool(V(v.obj.position.x - 0.5 + k * 0.35, 26.1), [V(v.obj.position.x - 0.4 + k * 0.3, 24.6), ...DROP_PATH], true, { cls, kind, lat: LAT[n][k], k });
              if (kid) kid.data.drop = true;
            });
          }
          v.leaveIn = 2.5 + n * 0.7;
        }
      },
  });
  const autoRun = (i, dropping) => dropRun(F.autos[i], dropping);
  const parentRun = (i, dropping) => dropRun(F.parents[i], dropping);
  const dropLeave = (v) => {
    if (v.leaving) return;
    v.leaving = true;
    v.stopped = false;
    v.drive(DROP_OUT, {
      max: 6,
      onEnd: () =>
        // at the gate: wait for a gap in the traffic before pulling out onto the road
        soon(0, () => {
          if (!vehicles.laneClear(-58)) return false;
          v.leaving = false;
          v.onRoad = true;
          v.drive(DROP_ROAD, { max: 8, onEnd: () => (v.obj.visible = false) });
          return true;
        }),
    });
  };

  // ---------- going home ----------
  const autoWaiting = []; // children under the canopy waiting for an auto or a parent's car
  /** a child leaves their place in the rows (returns the place, if they had one) */
  const freeSlot = (kid) => {
    const slot = WAIT_SLOTS.find((w) => w.kid === kid);
    if (slot) slot.kid = null;
    return slot;
  };
  let autoRiders = 0;
  let autoComing = 0; // children on their way to the auto stop
  const homeRoute = (a, from, side) => {
    const inside = a.pos.z < 43;
    // from the bus bay, back down the aisle first (never between the buses)
    const fromBay = a.pos.x > 3 && a.pos.z > 22 && a.pos.z < 40 ? [V(3.6, a.pos.z)] : [];
    // (groups spread across the drive and the walkers' lane — those turning west keep to its west side, those turning
    // east to its east side, so the two streams never cross in the gateway — then each group finds its own line along
    // the footpath, rather than everyone treading one spot)
    const u = rng() * 2 - 1;
    const west = side < 0;
    return [...from, ...fromBay, ...(inside ? [V((west ? -3.1 : -0.95) + u * 0.75, Math.max(30, Math.min(a.pos.z, 40))), V((west ? -4.6 : -1.75) + u * (west ? 1.1 : 0.45), 43.2)] : []), SQ(side * (2.6 + rng() * 2.2), 45.1 + rng() * 0.7, FEET.ground, 0.6), SQ(roadEnd(side), 45.1 + rng() * 0.7, FEET.ground, 0.6)];
  };
  const walkHome = (a, from = [], side = rng() < 0.5 ? -1 : 1) => {
    a.tag = 'walkHome';
    route(a, homeRoute(a, from, side), { pace: 1.4, onArrive: release });
  };
  /** a group of friends from one class decides how they're going home */
  const goHomeGroup = (members) => {
    if (!members.length) return;
    const r = rng();
    const busesOpen = F.buses.filter((b) => b.boarding && b.obj.visible && !b.active);
    const n = members.length;
    const roomy = busesOpen.filter((b) => b.expected + n <= busCap + 3);
    // (the first classes down fill the buses, so the buses are away before the crowd walking home reaches the gate)
    if (r < 0.42 && roomy.length) {
      // the bus with the fewest children so far (and seats for the whole group)
      const bus = roomy.reduce((m, b) => (b.expected < m.expected ? b : m), roomy[0]);
      const s = bus.slot;
      const bi = F.buses.indexOf(bus);
      const pts = [courtyardGap(rng), V(1.4 + (rng() - 0.5) * 1.6, 14), V(2.6, 24), V(3.6, busAisle(s)), E(s.x - 6.2, busAisle(s)), E(s.x - 3.3, busAisle(s)), busDoor(s)];
      members.forEach((m) => {
        bus.expected++;
        m.tag = 'toBus';
        m.data = { ...(m.data || {}), bus: bi };
      });
      walkTogether(members, pts, { pace: 1.6 }, (b) => {
        if (bus.boarding) bus.load++;
        release(b);
      });
      // single file at the bus door
      members.forEach((m, k) => m.path && m.path[pts.length - 2] && (m.path[pts.length - 2].hold = k * 0.5));
      return;
    }
    if (r < 0.49 && autoRiders + n <= AUTO_SEATS * F.autos.length + CAR_SEATS * F.parents.length) {
      // home by auto or a parent's car: out to the drop-off canopy to wait
      members.forEach((m) => {
        autoRiders++;
        autoComing++;
        m.tag = 'toAuto';
        const slot = WAIT_SLOTS.find((w) => !w.kid) && pick(WAIT_SLOTS.filter((w) => !w.kid));
        if (!slot) {
          // (every place under the canopy is taken: they walk instead, out through the gap in the hedge)
          autoRiders--;
          autoComing--;
          walkHome(m, [courtyardGap(rng), V(-1.3 + (rng() - 0.5) * 4.4, 14)]);
          return;
        }
        slot.kid = m;
        m.data = { ...(m.data || {}), slot };
        route(m, [V(-17 + rng() * 3, 4.6 + rng() * 1.2), ...DROP_PATH.slice(1).reverse(), V(Math.min(slot.x + 0.8, DROP_PATH[0].x), WAIT_LANE), E(slot.x, WAIT_LANE - 0.15), E(slot.x, slot.z)], {
          pace: evenPace(m, 1.25),
          onArrive: (b) => {
            autoComing = Math.max(0, autoComing - 1);
            b.tag = 'waitAuto';
            route(b, [], { wait: 1e9, face: 0, talk: true }); // (facing the loop, watching for their ride)
            autoWaiting.push(b);
          },
        });
      });
      return;
    }
    // walking home together, left or right along the road
    const side = rng() < 0.5 ? -1 : 1;
    members.forEach((m) => (m.tag = 'walkHome'));
    walkTogether(members, homeRoute(members[0], [courtyardGap(rng), V(-1.3 + (rng() - 0.5) * 4.4, 14)], side), { pace: 1.4 }, (b) => release(b));
  };

  // ---------- other parts of the day ----------
  // lunch: each group of friends gets its own spot and stands in a little circle, chatting
  let lunchSpots = [];
  const makeLunchSpots = () => {
    const out = [];
    for (const A of LUNCH_AREAS) {
      for (let x = A.x0; x <= A.x1; x += 4.0) {
        for (let z = A.z0; z <= A.z1; z += 4.0) {
          const px = x + (rng() - 0.5) * 1.4;
          const pz = z + (rng() - 0.5) * 1.4;
          if (A.not?.(px, pz)) continue;
          out.push([px, pz]);
        }
      }
    }
    lunchSpots = out.sort(() => rng() - 0.5);
  };
  const takeSpot = () => lunchSpots.pop() || [(rng() < 0.5 ? -1 : 1) * (9 + rng() * 11), -18 + rng() * 16];
  /** from inside the courtyard out to a place on the lawns (through the front opening or a gap in the hedge) */
  const fromYard = ([x, z]) => {
    if (z < 9) return [];
    if (Math.abs(x) < 9) return [V(x * 0.4, 7.4), V(x * 0.6, 11)];
    if (Math.abs(x) < 20) return [V(Math.sign(x) * 5, 7.4), V(Math.sign(x) * 6, 11)];
    return [V(Math.sign(x) * 25.4, 7.2), V(Math.sign(x) * 27.4, 11.2)];
  };
  /** and back in again */
  const toYard = (p) => fromYard([p.x, p.z]).reverse();
  const chatCircle = (members, spot) => {
    const n = members.length;
    const r = 0.36 + n * 0.1;
    const spin = rng() * 6;
    walkTogether(members, [...fromYard(spot), V(spot[0], spot[1])], { pace: 1.0 }, (b, k) => {
      const ang = spin + (k / n) * Math.PI * 2;
      const x = spot[0] + Math.cos(ang) * r;
      const z = spot[1] + Math.sin(ang) * r;
      route(b, [V(x, z)], { wait: 1e9, face: Math.atan2(spot[0] - x, spot[1] - z), talk: true, pace: 0.8 });
    });
    for (const m of members) {
      m.tag = 'lunch';
      m.data = { ...(m.data || {}), friends: members };
    }
  };
  const runAround = (a, area, tag) => {
    route(a, [randIn(area)], { run: true, onArrive: (b) => b.tag === tag && runAround(b, area, tag) });
  };
  const trackLap = (() => {
    const out = [];
    const cx = 85, cz = -30, r = 17.2, half = 22;
    for (let i = 0; i <= 8; i++) out.push(V(cx + r, cz + half - (2 * half * i) / 8, 0.1));
    for (let i = 1; i < 12; i++) { const a = (i / 12) * Math.PI; out.push(V(cx + Math.cos(a) * r, cz - half - Math.sin(a) * r, 0.1)); }
    for (let i = 0; i <= 8; i++) out.push(V(cx - r, cz - half + (2 * half * i) / 8, 0.1));
    for (let i = 1; i < 12; i++) { const a = Math.PI + (i / 12) * Math.PI; out.push(V(cx + Math.cos(a) * r, cz + half - Math.sin(a) * r, 0.1)); }
    return out;
  })();
  const jog = (a, start) => {
    const lap = trackLap.slice(start).concat(trackLap.slice(0, start));
    route(a, lap, { run: true, onArrive: (b) => b.tag === 'pe' && jog(b, 0) });
  };
  const PE_CLASS = 7;
  // the PE class goes round the front of the east wing to the track
  const TO_TRACK = [...EAST_OUT, V(62, -14)];
  const BACK_FROM_TRACK = [V(62, -14), ...EAST_OUT.slice().reverse()];
  // students in games come out of (and go back into) the stairwells nearest their game
  const C_STAIR = STAIRS[3];
  const B_STAIR = STAIRS[2];
  const stairOut = (st) => [P3(st.up(0)[0]), ST(st.corr[0], st.corr[1], FEET.corridor), ST(st.ground[0], st.ground[1], FEET.ground)];
  const stairIn = (st) => [ST(st.ground[0], st.ground[1], FEET.ground), ST(st.corr[0], st.corr[1], FEET.corridor), ...climb(st, 1)];
  const WEST_FROM_B = [V(-23, -20), V(-23.2, 4), ...WEST_OUT];
  const corridorWalker = () => {
    const y1 = FL[1] + 0.03;
    const y2 = FL[2] + 0.03;
    const routes = [
      [V(6, -26.2, y1), V(27.5, -26.2, y1), V(28.2, -24, y1), V(28.2, 2, y1)],
      [V(-27.5, -26.2, y2), V(-6, -26.2, y2)],
      [V(-28.2, -22, y1), V(-28.2, 6, y1)],
      [V(28.2, 6, y2), V(28.2, -22, y2)],
      [V(-28.2, 5, FEET.corridor), V(-28.2, -21, FEET.corridor)],
      [V(28.2, -21, FEET.corridor), V(28.2, 5, FEET.corridor)],
      [V(-6, -26.2, FEET.corridor), V(-27, -26.2, FEET.corridor)],
    ];
    const r = pick(routes);
    if (rng() < 0.5) r.reverse();
    pool.spawn(r, { teacher: true, tag: 'corridor', onArrive: release });
  };

  // football and its ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 }));
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);
  const ballState = { pos: new THREE.Vector3(85, 0.12, -30), vel: new THREE.Vector3(), area: PITCH, players: [] };
  const kickOff = new THREE.Vector3();
  const playFootball = (n) => {
    ball.visible = true;
    ballState.pos.set(85, 0.12, -30);
    ballState.vel.set(0, 0, 0);
    ballState.players = [];
    // (they come down one after another, not all in one heap)
    for (let i = 0; i < n; i++) {
      later(i * 1.1, () => {
        if (!ball.visible) return;
        const a = pool.spawn([...stairOut(C_STAIR), ...EAST_OUT, randIn(PITCH)], { teacher: false, tag: 'football' });
        if (a) {
          a.onPitch = false;
          a.onArrive = (b) => (b.onPitch = true);
          ballState.players.push(a);
        }
      });
    }
  };
  /** players go back into the building, round the front of the east (or west) wing and up the stairs */
  const sendIn = (filter, side = 'east') => {
    const back = side === 'east' ? [...EAST_OUT.slice().reverse(), ...stairIn(C_STAIR)] : [...WEST_FROM_B.slice().reverse(), ...stairIn(B_STAIR)];
    for (const a of pool.agents) {
      if (!a.active || !filter(a)) continue;
      a.tag = 'leaving';
      // (anyone still on the way there turns round and goes back the way they came)
      const onTheWay = a.path && a.path.length > 3 && a.seg > 0 && a.seg < a.path.length;
      route(a, onTheWay ? a.path.slice(0, a.seg).reverse() : back, { pace: 1.2, onArrive: release });
    }
  };
  const stopFootball = () => {
    ball.visible = false;
    ballState.players = [];
    sendIn((a) => a.tag === 'football');
  };

  // ---------- the timetable ----------
  const ringBell = (name) => onBell?.(name);
  const EVENTS = [
    [hm(7, 16), () => carArrive(0)], [hm(7, 19), () => carArrive(1)], [hm(7, 23), () => carArrive(2)],
    ...F.buses.map((_, i) => [hm(7, 15.3) + i * 1.8, () => busArrive(i)]),
    ...F.autos.map((_, i) => [hm(7, 18) + i * 3.5, () => autoRun(i, true)]),
    ...F.parents.map((_, i) => [hm(7, 19.8) + i * 4.6, () => parentRun(i, true)]),
    [TIMES.assemblyBell, () => ringBell('Assembly')],
    [TIMES.toClass, () => ringBell('To class')],
    // a bell at the start of every period (and the changeover between back-to-back ones)
    ...PERIODS.map(([a], i) => [a, () => ringBell(`Period ${i + 1}`)]),
    ...CHANGEOVERS.map((t) => [t - 0.05, () => changeover(t)]),
    [TIMES.breakStart, () => ringBell('Short break')],
    [TIMES.breakEnd - 4, () => endLunch(16)], // (the break's nearly over: back up for period 4, a few friends at a time)
    [TIMES.lunchStart, () => ringBell('Lunch break')],
    [TIMES.lunchWarn, () => {
      ringBell('End of lunch');
      endLunch();
    }],
    [TIMES.lunchWarn + 1.2, () => startCover()],
    [TIMES.home, () => ringBell('Home time')],
    [TIMES.busesBoard, () => F.buses.forEach((b, i) => {
      if (!b.obj.visible) return;
      b.boarding = true;
      b.departAt = TIMES.busesLeave + i * 1.5; // a bus leaves once its children are on board
    })],
    // (parents and autos turn up through the first twenty minutes, and wait their turn to come in)
    ...F.autos.map((_, i) => [TIMES.home + 3 + i * 3.4, () => autoRun(i, false)]),
    ...F.parents.map((_, i) => [TIMES.home + 4.6 + i * 4.2, () => parentRun(i, false)]),
    ...F.cars.map((_, i) => [TIMES.teachersLeave + i * 2, () => carDepart(i)]),
  ];

  /** fill class lines straight away (when the day jumps into the middle of assembly) */
  const fillLines = (share) => {
    for (let c = 0; c < CLASSES; c++) {
      for (let k = 0; k < Math.round(perClass * share); k++) {
        const a = crowd.spawn([V(0, 0)], { jitterStart: false, kind: k % 2 ? 'boy' : 'girl' });
        if (!a) return;
        standInLine(a, c, takeSlot(c, a.kind));
      }
    }
  };

  // ---------- phase changes ----------
  const enter = (p, fresh = true, m = minutes) => {
    assembly.setLeaders(p.id === 'assembly' || p.id === 'gather');
    const progress = Math.max(0, Math.min(1, (m - p.from) / (p.to - p.from)));
    if (p.id === 'arrival') {
      if (!fresh) {
        // jumping into the morning: the ones who'd have arrived are at their desks, the rest are on the way
        let seated = buildWalkSchedule(m, true);
        F.buses.forEach((_, i) => m > hm(7, 15.3) + i * 1.8 + 30 && (seated += busCap));
        F.autos.forEach((_, i) => m > hm(7, 18) + i * 3.5 + 20 && (seated += AUTO_SEATS));
        F.parents.forEach((_, i) => m > hm(7, 19.8) + i * 4.6 + 20 && (seated += 1.5));
        fillSeats(Math.min(1, seated / (perClass * CLASSES)));
        for (let c = 0; c < CLASSES; c++) arrived[c] += seats[c].n;
      } else buildWalkSchedule(m);
    }
    if (p.id === 'gather') {
      // every class comes out and down; on a jump, part of the school is already standing in line
      const already = fresh ? 0 : Math.min(1, progress * 1.2);
      if (!fresh) {
        fillSeats(1 - already);
        fillLines(already);
      }
      // (each staircase brings down two classes at a time)
      const turns = stairTurns((c) => seats[c].n * 0.75, 45);
      for (let c = 0; c < CLASSES; c++) {
        const start = turns[c];
        const n = seats[c].n;
        // through the door one after another, girls and boys in turn (nearest desks first)
        const order = [];
        for (let k = 0; k < n; k++) order.push({ kind: k % 2 ? 'boy' : 'girl', t: start + k * 0.75 });
        planExit(c, order, 1.4, start).forEach((o, k) => {
          soon(o ? o.at : start + k * 0.75, () => leaveClass(c, { pace: 1.4, tag: 'toLine' }, (b) => walkToLine(b, c), order[k].kind, o?.seat));
        });
      }
      // anyone still walking in (on the ground) is late: straight to their line, bag and all
      for (const a of crowd.agents) {
        if (!(a.active && a.tag === 'arriving' && a.pos.y < 0.3 && a.data) || a.data.drop) continue; // (on the path from the drop-off: they go to their line when they get in)
        // (still outside, or in the gateway: in through the gate first, never through the wall; then past the
        // hedge by the front walk)
        const z = a.pos.z;
        const via = z > 42.5 ? [V(Math.max(-3, Math.min(3, a.pos.x)), Math.min(z, 45.3)), ...GATE_IN.slice(0, 3), courtyardGap(rng)] : z > 9 ? [V(-1.6 + (rng() - 0.5) * 4, Math.min(z, 14)), courtyardGap(rng)] : [];
        walkToLine(a, a.data.cls, via);
      }
    }
    if (p.id === 'assembly') {
      if (!fresh) {
        fillSeats(0);
        fillLines(1);
      }
      // the PT teacher walks down the middle aisle and back
      pool.spawn([V(0, -8.3), V(0, -0.2), V(0.3, -8.3)], { teacher: true, tag: 'aisle', onArrive: release, pace: 0.8 });
      // anyone still on the way steps it up (a brisk walk, still minding the others: no running in a crowd)
      for (const a of crowd.agents) if (a.active && a.tag === 'toLine') a.pace = Math.min(2, (a.pace || 1) * 1.25);
    }
    if (p.id === 'toclass') {
      if (!fresh) {
        const back = Math.min(1, progress * 1.3);
        fillSeats(back);
        fillLines(1 - back);
      }
      // the lines break up class by class (each staircase takes two classes at a time), each from the back;
      // every class goes back up to its room and sits down
      const rows = new Array(CLASSES).fill(0);
      for (const a of lineAgents) if (a.data) rows[a.data.cls] = Math.max(rows[a.data.cls], a.data.row ?? 0);
      const turns = stairTurns((c) => (rows[c] + 1) * 1.7, 55);
      for (const a of lineAgents) {
        if (!a.active || a.tag !== 'line') continue;
        const { cls, row } = a.data;
        a.tag = 'toClass';
        const lx = laneX(cls, a.kind);
        const room = CLASSROOMS[cls];
        const toFront = courtyardOf(room)[1] < -4 && Math.abs(lx) > FLAG_CLEAR;
        const end = toFront ? LINES_FRONT : LINES_BACK;
        later(turns[cls] + (rows[cls] - row) * 1.7 + rng() * 0.6, () => a.active && goToClass(a, cls, [E(lx, a.pos.z), E(lx, end), E(lx, end + (toFront ? -1.2 : 1.2)), ...(toFront ? [] : aroundLines(lx, courtyardOf(room)))], { pace: 1.3 }));
      }
      // anyone still on the way to the lines turns round (once they're out of the building); anyone already
      // heading for their desk just carries on
      for (const a of crowd.agents) {
        if (!a.active || (a.tag !== 'toLine' && a.tag !== 'arriving') || a.data?.seat) continue;
        a.tag = 'toClass';
        reroute(a, (b) => b.active && goToClass(b, b.data?.cls ?? 0, [], { pace: 1.3 }));
      }
      lineAgents = [];
    }
    if (isLessons(p.id)) setTeachers(m);
    if (p.id === 'classes') {
      if (!fresh) fillSeats(1, PE_CLASS);
      startPE(PE_CLASS, fresh);
    }
    if (p.id === 'break') {
      if (!fresh) fillSeats(1);
      startOuting(0.2, fresh, m, TIMES.breakEnd - 4, false);
      onDuty(2);
    }
    if (p.id === 'classesB') {
      if (!fresh) fillSeats(1, PE_CLASS_B);
      startPE(PE_CLASS_B, fresh, 26); // (once the stairs are clear of everyone coming back from break)
    }
    if (p.id === 'lunch') {
      startOuting(0.25, fresh, m, TIMES.lunchWarn, true);
      onDuty(3);
    }
    if (p.id === 'classes2') {
      if (!fresh) fillSeats(1);
      playFootball(8);
      if (!fresh && m < PERIODS[COVER.period - 1][0] + 2) later(1, startCover);
    }
    if (p.id === 'home') {
      // every class empties out, bags on, in groups of friends — the ground floor first, then the first
      // floor, then the second, so the stairs never jam
      const gone = fresh ? 0 : Math.min(1, progress * 1.8);
      if (!fresh) fillSeats(1 - gone);
      const turns = stairTurns((c) => seats[c].n * 1.1, 50, 3);
      for (let c = 0; c < CLASSES; c++) emptyClass(c, turns[c], 0.8 + rng() * 1.2, { pace: 1.2, bag: true, tag: 'home' }, (members) => goHomeGroup(members));
      // jumped in after the autos were due: send them now
      if (!fresh && m > TIMES.home + 1 && m < TIMES.home + 28) {
        F.autos.forEach((_, i) => later(i * 2.5, () => autoRun(i, false)));
        F.parents.forEach((_, i) => later(3 + i * 3, () => parentRun(i, false)));
      }
      // a teacher sees the bus children on board
      if (m < TIMES.busesLeave + 6) {
        const t = pool.spawn([V(1.6, 16), V(3.2, 27.5), V(4.4, 29.2)], { teacher: true, tag: 'busDuty', wait: 9999, face: Math.PI / 2, pace: 1.0 });
        if (t) later((TIMES.busesLeave + 8 - m) / 0.4, () => t.active && t.tag === 'busDuty' && toStaffRoom(t, [V(1.6, 16)]));
      }
    }
    if (p.id === 'after') {
      if (!fresh) fillSeats(0);
      // the staff meeting: every chair round the staff room table
      fillStaff(staffSeats.length);
      // games practice: football on the pitch, basketball, and a few running laps of the track
      playFootball(8);
      basketball(6);
      cricket(fresh);
      tennis();
      for (let k = 0; k < 8; k++) {
        const lapAt = Math.floor((k * trackLap.length) / 8);
        later(2 + k * 0.9, () => {
          const a = crowd.spawn([V(25.4, 7.4), ...TO_TRACK, trackLap[lapAt]], { tag: 'pe', kind: k % 2 ? 'boy' : 'girl', pace: 1.2 });
          if (a) {
            a.data = { cls: -1 };
            a.onArrive = (b) => b.tag === 'pe' && jog(b, (lapAt + 1) % trackLap.length);
          }
        });
      }
    }
    if (p.id === 'evening') {
      if (!fresh) fillSeats(0);
      fillStaff(m < TIMES.teachersLeave ? 5 : 0);
    }
    updateTeachers();
    setOffices();
  };
  // the other PE period's class
  const PE_CLASS_B = 22;
  /** a PE class comes down to the track with its teacher and runs laps */
  const startPE = (cls, fresh, delay = 10) => {
    for (let k = 0; k < perClass; k++) {
      const lapAt = Math.floor((k * trackLap.length) / perClass) % trackLap.length;
      if (!fresh) {
        const a = crowd.spawn([trackLap[lapAt]], { jitterStart: false, tag: 'pe' });
        if (a) {
          a.data = { cls, toTrack: true };
          jog(a, (lapAt + 1) % trackLap.length);
        }
        continue;
      }
      soon(
        delay + k * 0.55,
        () => {
          const r = leaveClass(cls, { pace: 1.25, tag: 'pe' }, (b) => {
            if (b.data) b.data.toTrack = true;
            route(b, [...TO_TRACK, trackLap[lapAt]], { pace: 1.3, onArrive: (c) => c.tag === 'pe' && jog(c, (lapAt + 1) % trackLap.length) });
          });
          if (r && r !== 'empty') r.data = { ...(r.data || {}), cls };
          return r === 'empty' ? false : r; // still on the way up from assembly: try again shortly
        },
        60
      );
    }
    pool.spawn([...stairOut(C_STAIR), ...EAST_OUT, V(62, -14), V(66, -30)], { teacher: true, tag: 'peTeacher', wait: 9999, face: Math.PI / 2 });
  };
  /** the PE period's over: back to class (or, after school, home) */
  const endPE = () => {
    for (const a of crowd.agents) {
      if (!a.active || a.tag !== 'pe') continue;
      if (a.data?.cls >= 0) {
        const cls = a.data.cls;
        a.tag = 'toClass';
        if (!a.data.toTrack) {
          // still on the way down from their classroom when the bell goes: once they're out, straight back up
          a.onArrive = (b) => b.active && goToClass(b, cls, [], { pace: 1.4 });
          a.waitAfter = 0;
        } else if (a.pos.x < 58 && a.path && a.seg < a.path.length) {
          // still on the way out to the track: back the way they came
          goToClass(a, cls, a.path.slice(0, a.seg).reverse(), { pace: 1.4 });
        } else goToClass(a, cls, BACK_FROM_TRACK, { pace: 1.4 });
      } else walkHome(a, [...BACK_FROM_TRACK.slice(0, -1), V(12, 12.8), V(3.2, 12.8)]); // (along the path from the bus bay, outside the hedge)
    }
    sendIn((a) => a.tag === 'peTeacher');
  };
  const basketball = (n) => {
    for (let i = 0; i < n; i++) {
      later(i * 1.1, () => {
        const a = pool.spawn([...stairOut(B_STAIR), ...WEST_FROM_B, randIn(COURT)], { teacher: false, tag: 'basket' });
        if (a) a.onArrive = (b) => b.tag === 'basket' && runAround(b, COURT, 'basket');
      });
    }
  };
  /** after school, cricket practice in the nets: in each net a bowler runs in again and again, the batsman waits */
  const NETS = [44, 48.2];
  // a red ball for each net: bowled, it pitches and reaches the batsman, who swings and sends it into the netting
  const cricketBalls = NETS.map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: '#9e1b1b', roughness: 0.4 }));
    m.visible = false;
    scene.add(m);
    return { mesh: m, t: -1, bat: null };
  });
  // (they change in the pavilion's dressing rooms and walk round outside the boundary rope to the nets)
  const NETS_WAY = [V(0.8, -62.2), V(1.2, -65.6), V(24, -67.4)];
  const bowlIn = (b, nx) =>
    route(b, [V(nx, -77.5)], {
      run: true,
      onArrive: (c) => {
        if (c.tag !== 'cricket') return;
        // the ball's away
        const cb = cricketBalls[NETS.indexOf(nx)];
        if (cb.bat?.active && cb.bat.tag === 'cricket' && !cb.bat.path?.length) cb.t = 0;
        route(c, [V(nx + 0.45, -66.5)], { pace: 0.9, wait: 1.2, onArrive: (d) => d.tag === 'cricket' && bowlIn(d, nx) });
      },
    });
  const cricket = (fresh = true) => {
    NETS.forEach((nx, k) => {
      later(fresh ? 1.5 + k * 3 : 0.2 + k * 0.3, () => {
        // (jumped in once practice has begun: they're already at the nets)
        const via = fresh ? [...NETS_WAY, V(nx + 0.6, -65.4)] : [V(nx + 0.6, -67.6)];
        const bat = pool.spawn([...via, V(nx, -85)], { sport: 'bat', tag: 'cricket', pace: 1.1 });
        if (bat) bat.onArrive = (b) => b.tag === 'cricket' && route(b, [], { wait: 1e9, face: 0 });
        cricketBalls[k].bat = bat;
        later(1.2, () => {
          const bowl = pool.spawn([...via, V(nx + 0.45, -66.5)], { sport: 'bowl', tag: 'cricket', pace: 1.1 });
          if (bowl) bowl.onArrive = (b) => b.tag === 'cricket' && bowlIn(b, nx);
        });
      });
    });
  };
  const stopCricket = () => {
    for (const a of pool.agents) {
      if (!a.active || a.tag !== 'cricket') continue;
      a.tag = 'leaving';
      route(a, [V(a.pos.x + 0.6, -65.4), ...NETS_WAY.slice().reverse()], { pace: 1.1, onArrive: release });
    }
  };
  /** after school, tennis: on each court two players rally, running across their baseline to reach the ball */
  const COURTS = [{ x: 116.7, z: -58 }, { x: 116.7, z: -22 }];
  const rallies = COURTS.map((c) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: '#d7f23a', roughness: 0.6 }));
    m.visible = false;
    scene.add(m);
    return { c, ball: m, players: [], shot: null, pause: 1 };
  });
  const tennis = () => {
    rallies.forEach((r, k) => {
      r.players = [];
      r.shot = null;
      r.pause = 3;
      for (const s of [-1, 1]) {
        later(1 + k * 2 + (s > 0 ? 1 : 0), () => {
          const bz = r.c.z + s * 11.4;
          const p = pool.spawn([V(107.6, r.c.z + s * 3), V(r.c.x - 3, r.c.z + s * 9), V(r.c.x, bz)], { sport: 'racket', tag: 'tennis', pace: 1.1 });
          if (p) {
            p.data = { side: s, baseZ: bz };
            p.onArrive = (b) => {
              if (b.tag !== 'tennis') return;
              b.data.onCourt = true;
              route(b, [], { wait: 1e9, face: s > 0 ? Math.PI : 0 });
            };
            r.players.push(p);
          }
        });
      }
    });
  };
  const stopTennis = () => {
    for (const r of rallies) {
      r.ball.visible = false;
      r.shot = null;
      r.players = [];
    }
    for (const a of pool.agents) {
      if (!a.active || a.tag !== 'tennis') continue;
      a.tag = 'leaving';
      route(a, [V(a.pos.x - 3, a.pos.z), V(107.6, a.pos.z)], { pace: 1.1, onArrive: release });
    }
  };
  /** the games' moving parts each frame: the rallies, the bowled balls, the swings */
  const updateGames = (dt) => {
    for (const r of rallies) {
      const ready = r.players.length === 2 && r.players.every((p) => p.active && p.tag === 'tennis' && p.data?.onCourt);
      if (!ready) {
        r.ball.visible = false;
        continue;
      }
      if (!r.shot) {
        if ((r.pause -= dt) > 0) continue;
        // a shot from one player across to the other, landing somewhere along their baseline
        const from = r.players[r.serve = (r.serve ?? 0) ^ 1];
        const to = r.players.find((p) => p !== from);
        const tx = r.c.x + (rng() - 0.5) * 7;
        r.shot = { from, to, x0: from.pos.x, z0: from.pos.z, x1: tx, z1: to.data.baseZ, t: 0, dur: 1.15 + rng() * 0.3, net: rng() < 0.08 };
        route(to, [V(tx + 0.5 * to.data.side, to.data.baseZ)], { run: Math.abs(tx - to.pos.x) > 2.5, pace: 1.3, wait: 1e9, face: to.data.side > 0 ? Math.PI : 0 });
        from.swingT = 0.35;
      }
      const sh = r.shot;
      sh.t += dt / sh.dur;
      const u = Math.min(1, sh.t);
      const reach = sh.net ? 0.5 : 1;
      const k = u * reach;
      const x = sh.x0 + (sh.x1 - sh.x0) * k;
      const z = sh.z0 + (sh.z1 - sh.z0) * k;
      // up over the net, a bounce near the far baseline, and up again to the racket
      const y = sh.net ? 1.0 + Math.sin(u * Math.PI * 0.5) * 0.3 - u * u * 1.2 : u < 0.75 ? 1.0 + Math.sin((u / 0.75) * Math.PI) * 1.5 - (u / 0.75) * 0.95 : 0.05 + Math.sin(((u - 0.75) / 0.25) * Math.PI * 0.5) * 0.85;
      r.ball.visible = true;
      r.ball.position.set(x, Math.max(0.04, y), z);
      if (u >= 1) {
        if (sh.net) r.pause = 2.2; // (into the net: a fresh serve)
        else {
          sh.to.swingT = 0.35;
          r.serve = r.players.indexOf(sh.from); // (and back it comes)
        }
        r.shot = null;
        if (!sh.net) r.pause = 0;
      }
    }
    for (const cb of cricketBalls) {
      if (cb.t < 0) {
        cb.mesh.visible = false;
        continue;
      }
      const nx = NETS[cricketBalls.indexOf(cb)];
      cb.t += dt;
      const t = cb.t;
      cb.mesh.visible = true;
      if (t < 0.45) cb.mesh.position.set(nx, 2.1 - (t / 0.45) * 2.05, -77.5 - (t / 0.45) * 5);
      else if (t < 0.7) cb.mesh.position.set(nx, 0.05 + ((t - 0.45) / 0.25) * 0.6, -82.5 - ((t - 0.45) / 0.25) * 2.1);
      else if (t < 1.5) {
        const u = (t - 0.7) / 0.8;
        cb.mesh.position.set(nx + Math.sin(u * 2) * 0.9, 0.65 + Math.sin(u * Math.PI) * 2.2, -84.6 + u * 6);
      } else cb.t = -1;
      if (t > 0.58 && t - dt <= 0.58 && cb.bat?.active) cb.bat.swingT = 0.4;
    }
    // a swing: a quick turn of the shoulders and back
    for (const a of pool.agents) {
      if (!a.active || !(a.swingT > 0)) continue;
      a.swingT -= dt;
      const p = 1 - Math.max(0, a.swingT) / 0.4;
      a.heading = (a.face ?? a.heading) + Math.sin(p * Math.PI) * 1.2;
    }
  };
  /** teachers on duty at break and lunch: they stroll about the courtyard keeping an eye on things */
  const DUTY = { x0: -18, x1: 18, z0: -18, z1: 3 };
  const dutySpot = () => {
    // (anywhere in the courtyard but the flag platform and the porch)
    for (let k = 0; k < 12; k++) {
      const p = randIn(DUTY);
      if (!(Math.abs(p.x) < 3.4 && Math.abs(p.z + 11) < 3.4) && !(Math.abs(p.x) < 6.5 && p.z < -15)) return p;
    }
    return V(-10, -2);
  };
  const patrol = (t) => route(t, [dutySpot()], { pace: 0.55, wait: 3 + rng() * 5, onArrive: (b) => b.tag === 'duty' && patrol(b) });
  const onDuty = (n) => {
    for (let i = 0; i < n; i++) {
      later(1 + i * 2, () => {
        const t = outOfStaffRoom([dutySpot()], { tag: 'duty', pace: 0.8 });
        if (t) t.onArrive = (b) => b.tag === 'duty' && patrol(b);
      });
    }
  };
  const offDuty = () => {
    for (const a of pool.agents) if (a.active && a.tag === 'duty') toStaffRoom(a);
  };
  /**
   * break or lunch: some come down with their friends and stand about in little circles (the rest stay in
   * class with their tiffin). Jumping into the middle of it, they're already out.
   */
  const startOuting = (share, fresh, m, until, games) => {
    makeLunchSpots();
    if (!fresh && m < until) {
      fillSeats(1 - share);
      let out = Math.round(N * share);
      while (out > 0) {
        const n = Math.min(out, 2 + Math.floor(rng() * 4));
        out -= n;
        const spot = takeSpot();
        const r = 0.36 + n * 0.1;
        const spin = rng() * 6;
        const cls = Math.floor(rng() * CLASSES);
        const kind = rng() < 0.5 ? 'boy' : 'girl';
        const members = [];
        for (let k = 0; k < n; k++) {
          const ang = spin + (k / n) * Math.PI * 2;
          const x = spot[0] + Math.cos(ang) * r;
          const z = spot[1] + Math.sin(ang) * r;
          const a = crowd.spawn([V(x, z)], { jitterStart: false, tag: 'lunch', kind, wait: 1e9, face: Math.atan2(spot[0] - x, spot[1] - z), talk: true });
          if (!a) break;
          a.heading = Math.atan2(spot[0] - x, spot[1] - z);
          a.data = { cls, friends: members };
          members.push(a);
        }
      }
    } else if (!fresh) {
      fillSeats(1); // (jumped in after they've all gone back up)
    } else {
      for (let c = 0; c < CLASSES; c++) {
        const S = seats[c];
        let out = Math.round(S.n * share);
        let t = rng() * 10;
        const order = [];
        while (out > 0) {
          const n = Math.min(out, 2 + Math.floor(rng() * 4));
          out -= n;
          const kind = rng() < 0.5 ? 'boy' : 'girl';
          const grp = newGroup(meetSpot(CLASSROOMS[c]), n, (members) => chatCircle(members, takeSpot()));
          for (let k = 0; k < n; k++) {
            order.push({ kind, t, grp });
            t += 0.7;
          }
          t += 1.5 + rng() * 3;
        }
        planExit(c, order, 1.15, order[0]?.t ?? 0).forEach((o, i) => {
          const { kind, grp } = order[i];
          soon(o ? o.at : order[i].t, () => {
            const a = leaveClass(c, { pace: 1.15, tag: 'lunch' }, (b) => meet(grp, b), kind, o?.seat);
            if (a === 'empty') grp.expect--;
            return a;
          });
        });
      }
    }
    if (games) basketball(6);
  };
  /** lunch is over: every group of friends walks back up to class together */
  const endLunch = (spread = 6) => {
    const done = new Set();
    const inside = new Set();
    for (const a of crowd.agents) {
      if (!a.active || a.tag !== 'lunch' || done.has(a)) continue;
      const members = (a.data?.friends || [a]).filter((m) => m.active && m.tag === 'lunch');
      if (!members.length) members.push(a);
      const cls = a.data?.cls ?? Math.floor(rng() * CLASSES);
      const lat = LAT[Math.min(5, members.length)];
      const back = (k) => (b) => b.active && goToClass(b, cls, toYard(b.pos), { pace: 1.4, lateral: lat[k], queue: k });
      members.forEach((m, k) => {
        done.add(m);
        m.tag = 'toClass';
        m.talk = false;
        m.meetGrp = null; // (no longer waiting for friends to go out with)
        // still on their way somewhere (down the stairs, to meet their friends): when they get there they turn
        // straight back to class instead
        if (m.path && m.seg < m.path.length) {
          m.onArrive = back(k);
          m.waitAfter = 0; // (heading for a chat with friends: when they get there they go straight on, no standing about)
          inside.add(m);
        }
      });
      // the ones out in the courtyard set off together, a moment later
      later(rng() * spread, () => members.forEach((m, k) => m.active && !inside.has(m) && m.tag === 'toClass' && reroute(m, back(k))));
    }
    sendIn((a) => a.tag === 'basket', 'west');
  };
  const exit = (p) => {
    if (p.id === 'classes' || p.id === 'classesB') endPE();
    if (p.id === 'break' || p.id === 'lunch') {
      endLunch();
      offDuty();
    }
    if (p.id === 'classes2') stopFootball();
    if (p.id === 'after') {
      // practice is over: the footballers, cricketers and basketball players head home, the meeting breaks up
      stopFootball();
      stopCricket();
      stopTennis();
      sendIn((a) => a.tag === 'basket', 'west');
      endPE();
    }
  };

  /** put everything where it would be at this time of day */
  const resetTo = (m) => {
    if (coverAgent) coverStory(null);
    coverAgent = null;
    minutes = last = m;
    queue = [];
    walkSchedule = [];
    autoWaiting.length = 0;
    convoy.length = 0;
    for (const w of WAIT_SLOTS) w.kid = null;
    autoRiders = 0;
    autoComing = 0;
    arrived = new Array(CLASSES).fill(0);
    pool.releaseAll();
    crowd.releaseAll();
    resetLines();
    fillSeats(0);
    fillStaff(m > hm(7, 26) && m < TIMES.teachersLeave ? 5 : 0);
    ball.visible = false;
    ballState.players = [];
    F.buses.forEach((b, i) => {
      b.active = false;
      b.boarding = false;
      b.unload = 0;
      b.load = 0;
      b.expected = 0;
      b.departAt = null;
      const arrive = hm(7, 15.3) + i * 1.8 + 18;
      const leave = TIMES.busesLeave + 18 + i * 3;
      if (m > arrive && m < leave) {
        parkBus(i);
        // just parked: the children are still climbing down
        if (m < arrive + 12) {
          b.unload = busCap;
          b.unloadTimer = 0.4 + i * 0.3;
        }
        if (m > TIMES.busesBoard) {
          b.boarding = true;
          b.departAt = TIMES.busesLeave + i * 1.5;
        }
      } else {
        b.obj.visible = false;
        // it would be on its way in right now: send it
        if (m > hm(7, 15.3) + i * 1.8 && m <= arrive) later(i * 2.5, () => busArrive(i));
      }
    });
    F.cars.forEach((c, i) => {
      c.active = false;
      const arrive = [hm(7, 16), hm(7, 19), hm(7, 23)][i] + 12;
      const leave = TIMES.teachersLeave + i * 2;
      if (m > arrive && m < leave) parkCar(i);
      else {
        c.obj.visible = false;
        if (m > arrive - 12 && m <= arrive) later(i * 2, () => carArrive(i));
      }
    });
    DROPPERS.forEach((a) => {
      a.active = false;
      a.obj.visible = false;
      a.due = false;
      a.onRoad = false;
      a.stopped = false;
      a.boarding = false;
      a.leaving = false;
      a.load = 0;
    });
    F.autos.forEach((_, i) => {
      const due = hm(7, 18) + i * 3.5;
      if (m > due && m < due + 8) later(i * 2, () => autoRun(i, true));
    });
    F.parents.forEach((_, i) => {
      const due = hm(7, 19.8) + i * 4.6;
      if (m > due && m < due + 8) later(1 + i * 2, () => parentRun(i, true));
    });
    gateOpen = m >= TIMES.gateOpen + 1 && m < TIMES.gateClose ? 1 : 0;
    grounds.setGate(gateOpen);
    phase = phaseAt(m);
    enter(phase, false, m);
  };

  let clockCb = null;
  let clockT = 0;
  let officeT = 0;
  let walkingIn = 0; // students on their way to class (counted twice a second)
  resetTo(DAY_START);

  const busyList = [...F.buses, ...F.cars];
  const gateUsers = [...F.buses, ...F.cars];
  return {
    get minutes() {
      return minutes;
    },
    get phase() {
      return phase;
    },
    onClock(cb) {
      clockCb = cb;
    },
    jumpTo(m) {
      resetTo(Math.max(DAY_START, Math.min(DAY_END - 1, m)));
      clockCb?.(minutes, phase);
    },
    setPaused(p) {
      paused = p;
    },
    setSpeed(s) {
      speedOverride = s;
    },
    /** is a room in use right now (for its fans and lights)? room: class index, 'staff', 'hod', 'library' */
    busy(room) {
      if (room === 'staff') return staffSeats.some((s) => s.state === 2);
      if (room === 'hod') return hodSlot.on;
      if (room === 'library') return librarian.on;
      return seats[room]?.n >= 3;
    },
    seated(cls) {
      return seats[cls]?.n ?? 0;
    },
    update(dt) {
      // lessons fast-forward only once everyone's sitting down: while students are still on their way
      // to class, the clock runs slowly so nobody is seen wandering the corridors for an hour
      let speed = speedOverride ?? speedAt(minutes);
      if (walkingIn > 12 && !speedOverride && isLessons(phase?.id)) speed = Math.min(speed, 0.35);
      // (and while the substitute walks to his class, so he's seen doing it)
      if (coverAgent?.active && !speedOverride) speed = Math.min(speed, 0.16);
      if (!paused) minutes += speed * dt;
      if (minutes >= DAY_END) {
        resetTo(DAY_START);
        clockCb?.(minutes, phase);
      }
      // timetable events
      for (const [when, fn] of EVENTS) if (when > last && when <= minutes) fn();
      last = minutes;
      // phase changes
      const p = phaseAt(minutes);
      if (p !== phase) {
        exit(phase);
        phase = p;
        enter(p, true);
      }
      // delayed actions
      if (queue.length) {
        const due = [];
        queue = queue.filter((j) => ((j.t -= dt) <= 0 ? (due.push(j), false) : true));
        for (const j of due) j.fn();
      }
      // the watchman signals while a vehicle crosses the footpath (and keeps his hand up a moment after)
      signalT = vehicles.gateTurning() ? 1.6 : signalT - dt;
      watchman.pose = signalT > 0 ? 'point' : 'stand';
      signal2T = DROPPERS.some((d) => d.active && d.obj.visible && Math.abs(d.obj.position.x - DROP.x) < 6 && d.obj.position.z > 42 && d.obj.position.z < 48) ? 1.4 : signal2T - dt;
      watchman2.pose = signal2T > 0 ? 'point' : 'stand';
      signal3T = F.buses.some((b) => b.active && b.obj.visible && Math.abs(b.obj.position.x - BX) < 7 && b.obj.position.z > 40.5 && b.obj.position.z < 49) ? 1.4 : signal3T - dt;
      watchman3.pose = signal3T > 0 ? 'point' : 'stand';
      officeT += dt;
      if (officeT > 0.5) {
        officeT = 0;
        updateTeachers();
        setOffices();
        walkingIn = 0;
        for (const a of crowd.agents) if (a.active && (a.tag === 'toClass' || a.tag === 'arriving')) walkingIn++;
      }

      // ---- students walking in from both sides of the road, in groups of friends ----
      if (p.id === 'arrival') {
        let n = 0;
        while (walkSchedule.length && walkSchedule[walkSchedule.length - 1].t <= minutes && n < 6) {
          const g = walkSchedule.pop();
          if (g.unseen) {
            // came in by the side gate: they're at their desks
            for (let k = 0; k < g.n; k++) {
              const cls = pickClass();
              const kind = rng() < 0.5 ? 'boy' : 'girl';
              const st = reserveSeat(cls, kind);
              if (st) occupy(cls, st, { kind: st.kind, size: 0.78 + rng() * 0.14, tone: 0.84 + rng() * 0.16 });
            }
            continue;
          }
          const [start, via] = walkerFrom(rng() < 0.5 ? -1 : 1);
          arriveGroup(start, via, g.n);
          n++;
        }
        if (minutes > hm(7, 18)) {
          every('teacherIn', 7, dt, () => {
            const t = pool.spawn([V((rng() < 0.5 ? -1 : 1) * 20, 45.1), V(0, 45.0), ...GATE_IN, V(-14, -1)], { teacher: true });
            if (t) t.onArrive = (b) => toStaffRoom(b);
          });
        }
      }
      // corridors stay quiet in lessons: only now and then a teacher or the office peon walks past
      if (isLessons(p.id)) every('corridor', 14, dt, corridorWalker);
      if (p.id === 'after') every('corridor', 12, dt, corridorWalker);

      // ---- buses unloading in the morning: children climb down two by two ----
      for (const b of F.buses) {
        if (b.unload > 0) {
          b.unloadTimer -= dt;
          if (b.unloadTimer <= 0) {
            b.unloadTimer = 0.62;
            const s = b.slot;
            const cls = pickClass();
            const kind = rng() < 0.5 ? 'boy' : 'girl';
            const two = Math.min(2, b.unload);
            for (let k = 0; k < two; k++) {
              const lat = two === 2 ? LAT[2][k] : 0;
              if (arriveToSchool(busDoor(s).add(V(two === 2 ? (k ? 0.32 : -0.32) : 0, 0.12, 0)), [NW(s.x - 3.3, busAisle(s)), NW(3.6, busAisle(s)), V(2.2, 22), V(1.2, 12), COURTYARD_IN], true, { cls, kind, lat, k })) b.unload--;
            }
          }
        }
      }
      // ---- the buses leave together, one behind the other, once every one of them has its children on board ----
      // (so none pulls out round the end of the bay while children are still walking to the others). The one nearest
      // the lane by the wall goes first; each waits till the one before is round the end of the bay and on the lane
      {
        const waiting = F.buses.filter((b) => b.departAt && !b.active && b.obj.visible);
        if (waiting.length && minutes >= Math.min(...waiting.map((b) => b.departAt))) {
          const done = (b) => (b.expected > 0 && b.load >= b.expected * 0.93 && b.load >= 3) || (b.expected === 0 && minutes >= b.departAt) || minutes >= b.departAt + 30;
          if (waiting.every(done)) {
            for (let i = F.buses.length - 1; i >= 0; i--) {
              const b = F.buses[i];
              if (!waiting.includes(b)) continue;
              b.departAt = null;
              b.boarding = false; // (no one else is sent to it now)
              convoy.push(i);
            }
          }
        }
        if (convoy.length) {
          const turning = F.buses.some((b) => b.active && b.obj.visible && b.obj.position.x < 34 && (b.obj.position.z < 38.6 || b.obj.position.x < 18));
          if (!turning) busDepart(convoy.shift());
        }
      }
      // ---- autos: drop and go in the morning; in the afternoon the front one fills up, then goes ----
      let front = null;
      for (const a of DROPPERS) {
        if (!a.stopped) continue;
        a.waitT += dt;
        if (a.dropping) {
          a.leaveIn -= dt;
          if (a.leaveIn <= 0) dropLeave(a);
          continue;
        }
        front = a;
      }
      if (front) {
        // children waiting under the canopy climb in, one by one
        if (front.load < front.seats && autoWaiting.length && !front.boarding) {
          const kid = autoWaiting.shift();
          if (kid?.active && kid.tag === 'waitAuto') {
            front.boarding = true;
            const v = front;
            const slot = freeSlot(kid);
            route(kid, [...(slot ? [E(slot.x, WAIT_LANE)] : []), V(v.obj.position.x - 0.3 + rng() * 0.6, 26.05)], {
              pace: 1.2,
              onArrive: (b) => {
                v.load++;
                v.boarding = false;
                release(b);
              },
            });
          }
        }
        // off when full, or when nobody else is coming (the next one in the queue is waiting)
        const nobody = autoWaiting.length === 0 && autoComing === 0;
        if (!front.boarding && (front.load >= front.seats || (front.load > 0 && front.waitT > 14) || (nobody && front.waitT > 5) || front.waitT > 35)) dropLeave(front);
      }
      // no more rides coming (or it's long past home time): anyone still waiting walks home
      const noRides = !DROPPERS.some((a) => !a.dropping && (a.obj.visible || a.due)) && minutes > TIMES.home + 22;
      if (autoWaiting.length && (noRides || minutes > TIMES.after + 12)) {
        for (const kid of autoWaiting.splice(0)) {
          if (!kid.active) continue;
          const slot = freeSlot(kid);
          walkHome(kid, [...(slot ? [E(slot.x, WAIT_LANE)] : []), ...DROP_PATH, courtyardGap(rng), V(-1.3, 14)]);
        }
      }
      // the road traffic waits while a car or an auto turns in or out at the drop-off gate
      vehicles.setDropBusy(DROPPERS.some((d) => d.obj.visible && (d.active || d.stopped) && Math.abs(d.obj.position.x - DROP.x) < 9 && d.obj.position.z > 41 && d.obj.position.z < 51.5));
      // ---- one school vehicle at a time through the gate: the next one waits outside it ----
      {
        const inGate = (x, z) => Math.abs(x) < 9 && z > 36.5 && z < 47.5;
        let owner = null;
        const coming = [];
        for (const d of gateUsers) {
          d.hold = false;
          if (!d.active || !d.obj.visible) continue;
          const p = d.obj.position;
          if (inGate(p.x, p.z)) {
            owner = owner || d;
            continue;
          }
          const r = d.obj.rotation.y + (d.reverse ? Math.PI : 0);
          const ahead = d.dims.len / 2 + 6;
          if (inGate(p.x + Math.sin(r) * ahead, p.z + Math.cos(r) * ahead)) coming.push(d);
        }
        if (coming.length) {
          const first = owner ? null : coming.reduce((m, d) => (d.stamp < m.stamp ? d : m), coming[0]);
          for (const d of coming) if (d !== first) d.hold = true;
        }
        // pulling out of the gate onto the road: wait for a gap in the traffic
        for (const d of gateUsers) {
          if (!d.active || !d.obj.visible) continue;
          const p = d.obj.position;
          const out = Math.cos(d.obj.rotation.y + (d.reverse ? Math.PI : 0)) > 0.2;
          if (out && p.z > 43.5 && p.z < 47.5 && Math.abs(p.x) < 9 && d.speed < 3 && !vehicles.roadClear(p.x)) d.hold = true;
        }
      }
      // ---- road traffic waits while school vehicles turn at the gate (or a bus at its own gate) ----
      let busy = false;
      let busTurning = false;
      for (const d of busyList) {
        if (!(d.active || d.stopped) || !d.obj.visible) continue;
        const p = d.obj.position;
        if (Math.abs(p.x) < 16 && p.z > 40 && p.z < 48.2) busy = true;
        if (Math.abs(p.x - BX) < 12 && p.z > 41 && p.z < 51.5 && !(p.z > 48.8 && Math.abs(d.obj.rotation.y) > 1.2 && d.speed > 4)) busTurning = true;
      }
      vehicles.setGateBusy(busy);
      vehicles.setBusGateBusy(busTurning ? BX : null);
      // a bus pulling out of its gate waits, its nose short of the road, for a gap in the near lane (it turns left
      // into it, so only what's coming from the west matters — cars and autos leaving the drop-off included)
      for (const b of F.buses) {
        if (!b.active || !b.obj.visible) continue;
        const p = b.obj.position;
        if (Math.cos(b.obj.rotation.y) > 0.2 && p.z > 40.8 && p.z < 43.6 && Math.abs(p.x - BX) < 4 && b.speed < 3 && !vehicles.laneClear(p.x, true)) b.hold = true;
      }

      // ---- football: players chase the ball, the nearest one kicks it ----
      if (ball.visible) {
        const bs = ballState;
        bs.pos.addScaledVector(bs.vel, dt);
        bs.vel.multiplyScalar(Math.pow(0.35, dt));
        if (bs.pos.x < bs.area.x0 || bs.pos.x > bs.area.x1) bs.vel.x *= -1;
        if (bs.pos.z < bs.area.z0 || bs.pos.z > bs.area.z1) bs.vel.z *= -1;
        let nearest = null;
        let nd = Infinity;
        for (const a of bs.players) {
          if (!a.active || a.tag !== 'football' || !a.onPitch) continue;
          const d = a.pos.distanceTo(bs.pos);
          if (d < nd) {
            nd = d;
            nearest = a;
          }
        }
        for (const a of bs.players) {
          if (!a.active || a.tag !== 'football' || !a.onPitch) continue;
          if (!a.path || a.seg >= a.path.length || rng() < dt * 0.6) {
            if (a === nearest) kickOff.set(0, 0, 0);
            else kickOff.set((rng() - 0.5) * 14, 0, (rng() - 0.5) * 14);
            route(a, [V(bs.pos.x + kickOff.x, bs.pos.z + kickOff.z, 0.1)], { run: a === nearest || rng() < 0.6 });
          }
        }
        if (nearest && nd < 0.9) {
          const ang = rng() * Math.PI * 2;
          bs.vel.set(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(7 + rng() * 7);
        }
        ball.position.set(bs.pos.x, 0.12, bs.pos.z);
        ball.rotation.x += bs.vel.length() * dt * 2;
      }

      // ---- the gate slides open in the morning and shut at night (never on a vehicle) ----
      let vehicleAtGate = false;
      for (const d of busyList) if (d.obj.visible && d.active && d.obj.position.z > 36 && d.obj.position.z < 47 && Math.abs(d.obj.position.x) < 12) vehicleAtGate = true;
      const want = (minutes >= TIMES.gateOpen && minutes < TIMES.gateClose) || vehicleAtGate || F.cars.some((c) => c.active) ? 1 : 0;
      if (Math.abs(want - gateOpen) > 0.001) {
        gateOpen += Math.sign(want - gateOpen) * Math.min(Math.abs(want - gateOpen), dt * 0.25);
        grounds.setGate(gateOpen);
      }

      updateGames(dt);
      pool.update(dt);
      crowd.update(dt);
      clockT += dt;
      if (clockT > 0.25) {
        clockT = 0;
        clockCb?.(minutes, phase);
      }
    },
    /** numbers for the test page */
    debug() {
      return {
        lines: lineAgents.length,
        walkLeft: walkSchedule.length,
        autoWaiting: autoWaiting.length,
        queue: queue.length,
        seated: seats.reduce((n, S) => n + S.n, 0),
        staff: staffSeats.filter((s) => s.state === 2).length,
        tags: crowd.agents.reduce((h, a) => (a.active && (h[a.tag || '-'] = (h[a.tag || '-'] || 0) + 1), h), {}),
        buses: F.buses.map((b) => `${b.load}/${b.expected}`).join(' '),
        autos: DROPPERS.map((a) => `${a.load}${a.stopped ? 's' : ''}`).join(' '),
      };
    },
  };
}
