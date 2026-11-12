import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createLoader } from './assets.js';
import { createMaterials } from './materials.js';
import { Batch } from './batch.js';
import { createSky } from './sky.js';
import { createPost } from './post.js';
import { buildSchool } from './school.js';
import { buildInteriors, createMovers, interiorMaterials } from './interiors.js';
import { buildGrounds } from './grounds.js';
import { buildTown } from './town.js';
import { buildTrees } from './trees.js';
import { buildVehicles } from './vehicles.js';
import { createPeople, setVehicleZones, setVehicleBodies, setGateHold } from './people.js';
import { buildFlag, buildBirds } from './life.js';
import { createSim, DAY_START } from './sim.js';
import { PROFILES, pickProfile, Governor } from './quality.js';
import { rng as makeRng, ease } from './util.js';
import { STOPS } from './stops.js';
import { ROOMS, CLASSROOMS, STAFF, HOD, BLOCKS, STAIRS } from './rooms.js';
import { lodReady } from './lod.js';

/*
  ProxyPilot campus — a living Indian school, rendered live in the browser.
  A full school day plays out: buses and autos drop students, assembly, classes,
  lunch, home time, evening. A director camera follows the action; drag to look around.
*/

export { STOPS };
/** await before createCampus: the mesh simplifier loads asynchronously */
export const prepared = lodReady;

const HOME_VIEW = { cam: [78, 30, 92], target: [-6, 2, -6] };
const IM_KEYS = [0, 1, 2, 3, 4, 5].flatMap((i) => ['wbl' + i, 'wbr' + i]);

/** a camera standing inside a room (block frame u, v, height above the floor) looking at another point in it */
const inRoom = (r, cu, cv, ch, tu, tv, th) => {
  const { at } = BLOCKS[r.block];
  const [cx, cz] = at(r.rc + cu, cv);
  const [tx, tz] = at(r.rc + tu, tv);
  const y = r.feet;
  return [[cx, y + ch, cz], [tx, y + th, tz], { inside: true }];
};
// the rooms the camera looks into: a classroom from its back corner, the staff room, the HOD's office, the library
export const INSIDE_VIEWS = {
  classroom: inRoom(CLASSROOMS[1], 3.25, 0.55, 2.25, -2.6, 3.6, 1.0),
  classroom2: inRoom(CLASSROOMS[0], 1.2, 6.2, 2.35, -2.8, 2.2, 1.15), // (from the corridor side: the teacher and the class side on)
  staff: inRoom(STAFF, -3.1, 0.6, 2.2, 1.2, 3.6, 0.8),
  hod: inRoom(HOD, -2.7, 0.9, 1.95, 2.0, 3.5, 0.95),
  library: [[-73.6, 2.6, -41.4], [-61, 0.9, -46.8], { inside: true }],
  stairs: (() => {
    const st = STAIRS[1];
    const { at } = BLOCKS[st.block];
    const [cx, cz] = at(st.um, 12.5);
    const [tx, tz] = at(st.um, 3.2);
    return [[cx, 3.2, cz], [tx, 2.4, tz], {}];
  })(),
};
export const HOD_VIEW = { cam: [0, 24, 36], target: [0, 4, -16] };
export const STILL_VIEW = { cam: [-58, 24, 66], target: [2, 6, -14] };

// shots the director cuts between, by part of the day: [camera, target]
export const SHOTS = {
  arrival: [[[22, 7, 55], [2, 1.5, 37]], [[9, 4.2, 51], [-1, 1.2, 36]], [[-38, 14, 52], [-56, 0, 31]], [[40, 8, 57], [50, 1, 40]], [[-8, 11, 41], [8, 1, 20]], [[18, 13, 11], [31, 1.2, 31]], [[-16, 9, -6], [-26, 4, -22]]],
  gather: [['stairs'], [[-20, 10, 14], [-4, 3, -16]], [[14, 12, 18], [2, 2, -10]]],
  assembly: [[[-28, 14, 16], [0, 1.5, -6]], [[18, 7, 12], [-2, 1.8, -8]], [[0, 16, 26], [0, 0.5, -4]]],
  toclass: [[[-18, 9, 10], [-6, 3, -18]], ['stairs'], [[20, 10, 12], [8, 3, -14]]],
  classes: [['classroom'], [[58, 18, 12], [85, 0, -28]], ['staff'], [[12, 9, -6], [8, 6, -26]], ['hod'], ['classroom2'], [[6, 4, 62], [0, 5, 44]]],
  break: [[[-30, 12, 14], [0, 1.4, -4]], [[5, 9, 22], [-8, 1.2, 4]], [[-14, 4.2, 6], [-4, 1.2, -6]], ['classroom']],
  classesB: [['classroom2'], [[58, 18, 12], [85, 0, -28]], ['library'], [[12, 9, -6], [8, 6, -26]], ['staff']],
  lunch: [[[-30, 12, 14], [0, 1.4, -4]], [[-14, 4.2, 6], [-4, 1.2, -6]], [[-42, 10, 18], [-62, 1, 2]], [[5, 9, 22], [-8, 1.2, 4]]],
  classes2: [['library'], [[60, 16, 6], [85, 0, -30]], ['classroom']],
  home: [[[-22, 10, 12], [0, 2, -12]], [[18, 13, 11], [31, 1.2, 31]], [[14, 8, 56], [2, 1.5, 36]], [[-38, 14, 52], [-56, 0, 31]], [[6, 7, 57], [-6, 1, 46]], [[24, 24, 58], [26, 0, 33]], [[-26, 9, 16], [0, 1.4, 4]]],
  after: [[[40, 8, 57], [50, 1, 40]], [[60, 16, 10], [85, 0, -30]], [[62, 7, -60], [46, 1.5, -80]], ['staff'], [[18, 9, -88], [0, 4, -60]], [[-42, 10, 18], [-62, 1, 2]], [[90, 95, 70], [0, 0, -70]]],
  evening: [[[96, 30, 100], [-6, 3, -8]], [[-30, 14, -165], [0, 2, -110]], [[-48, 12, -118], [-72, 0, -100]], [[60, 16, 10], [85, 0, -30]]],
};

/** a director's shot as a view: shotView('arrival', 1), or shotView('inside', 'staff') */
export function shotView(phase, i) {
  let shot = phase === 'inside' ? [i] : SHOTS[phase][+i || 0];
  if (typeof shot[0] === 'string') shot = INSIDE_VIEWS[shot[0]];
  return { cam: shot[0], target: shot[1], inside: Boolean(shot[2]?.inside) };
}

export function createCampus(container, { mode = 'hero', time = 'morning', startMinutes, onProgress, onReady, onClock, onBell, onStory, onInside, view, quality = 'auto' } = {}) {
  const still = mode === 'still';
  const forcedQ = new URLSearchParams(window.location.search).get('q');
  const P = still ? PROFILES[forcedQ] || PROFILES.still : pickProfile(quality);
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: still || new URLSearchParams(window.location.search).has('pdb'), stencil: false });
  } catch {
    onReady?.(false);
    return null;
  }
  // 4K draws at twice the screen's resolution (supersampling); otherwise up to the screen's own sharpness
  const maxDpr = P.name === '4k' ? 2 : Math.min(window.devicePixelRatio || 1, P.dpr);
  renderer.setPixelRatio(maxDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  Object.assign(renderer.domElement.style, { display: 'block', width: '100%', height: '100%', opacity: still ? '1' : '0', transition: still ? 'none' : 'opacity 1.2s ease' });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.6, 3500);
  const v0 = view || (still ? STILL_VIEW : mode === 'hod' ? HOD_VIEW : HOME_VIEW);
  camera.position.set(...v0.cam);
  const target = new THREE.Vector3(...v0.target);
  camera.lookAt(target);

  const rng = makeRng(20261026);
  const L = createLoader(onProgress);
  const M = createMaterials(L, { quality: P.name });
  M.glassLit = M.glass.clone();
  M.glassLit.emissive = new THREE.Color('#ffcf8c');
  M.glassLit.emissiveIntensity = 0;
  M.glassStory = M.glassClear.clone();
  M.glassStory.emissive = new THREE.Color('#ff3b2a');
  M.glassStory.emissiveIntensity = 0;
  const IM = interiorMaterials();
  IM.boards.forEach((b, i) => {
    M['wbl' + i] = b.l;
    M['wbr' + i] = b.r;
  });
  delete IM.boards;
  for (const [k, v] of Object.entries(IM)) if (v) M[k] = v;

  const sky = createSky(renderer, scene, { shadowSize: P.shadow, flare: !still && P.name !== 'low' });

  // ---- static world, merged per material ----
  const B = new Batch(M);
  const TT = (label) => window.__campusDebug && console.log('[people]', label, Math.round(performance.now()));
  TT('start');
  const school = buildSchool(scene, B, M, rng);
  TT('school');
  buildInteriors(B);
  TT('interiors');
  const grounds = buildGrounds(scene, B, M, L, rng, P);
  TT('grounds');
  const flag = buildFlag(scene, B, 0, -11);
  // furniture inside never needs to cast sun shadows (the walls and roof already do)
  const INSIDE = ['floorIn', 'deskWood', 'deskMetal', 'dado', 'almirah', 'poster', 'notice', 'books', 'screen', 'leather', 'fanWhite', 'kota', 'oak', 'walnut', 'chairShell', 'chrome', 'whiteMetal', 'charcoal', 'locker', 'lockerB', 'blind', 'aluminium', 'bezel', 'mesh', 'sofa', 'carpet', 'coverScreen', 'clockFace', 'crest', ...IM_KEYS];
  B.build(scene, { noCast: ['line', 'tiles', 'pavers', 'asphalt', 'track', 'court', 'courtOut', ...INSIDE] });
  TT('batched');
  const movers = createMovers(scene, M);
  const TB = new Batch(M);
  buildTown(TB, M, rng, P);
  TB.build(scene, { castShadow: P.townShadows });

  TT('town');
  const trees = buildTrees(scene, L, rng, { P, merge: (list) => mergeGeometries(list) });
  TT('trees');
  const vehicles = buildVehicles(scene, rng, P);
  const peopleP = createPeople(scene, L, rng, P, camera);
  const birdsP = still ? Promise.resolve(null) : buildBirds(scene, L, rng, { count: P.name === 'low' ? 6 : 12 }).catch(() => null); // birds are a nice extra, never a blocker

  // ---- tour beacon ----
  const beacon = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.05;
  const beamMat = new THREE.MeshBasicMaterial({ color: '#f4c542', transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 24, 1, true).translate(0, 9, 0), beamMat);
  beacon.add(ring, beam);
  beacon.visible = false;
  scene.add(beacon);

  // ---- today's cover, shown on the classrooms (HOD view) ----
  const coverGroup = new THREE.Group();
  scene.add(coverGroup);
  const STATUS_COLOR = { accepted: '#62d39b', pending: '#f4c542', uncovered: '#f07a62' };
  let coverItems = [];
  const labelTexture = (title, sub, color) => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 168;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,11,9,0.82)';
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.beginPath();
    if (g.roundRect) g.roundRect(6, 6, 628, 156, 26);
    else g.rect(6, 6, 628, 156);
    g.fill();
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(52, 62, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#edf2ec';
    g.font = '600 56px Geist, system-ui, sans-serif';
    g.fillText(title, 84, 82);
    g.fillStyle = '#c5d1c8';
    g.font = '400 36px Geist, system-ui, sans-serif';
    g.fillText(sub.length > 30 ? sub.slice(0, 29) + '…' : sub, 30, 138);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const clearCover = () => {
    for (const o of [...coverGroup.children]) {
      coverGroup.remove(o);
      o.traverse((m) => {
        m.geometry?.dispose();
        m.material?.map?.dispose();
        m.material?.dispose();
      });
    }
    coverItems = [];
  };
  const setCover = (items) => {
    clearCover();
    for (const it of items) {
      const r = ROOMS[it.room % ROOMS.length];
      const color = STATUS_COLOR[it.status] || '#94a59b';
      const g = new THREE.Group();
      g.position.set(r.x + r.nx * 0.14, r.y, r.z + r.nz * 0.14);
      g.rotation.y = Math.atan2(r.nx, r.nz);
      // the classroom windows glow in the status colour
      const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.4), glowMat);
      g.add(glow);
      // a label floating over the corridor
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(it.title, it.sub, color), depthTest: false, transparent: true }));
      sprite.scale.set(7.4, 1.94, 1);
      sprite.position.set(0, 2.5, 2.6);
      sprite.renderOrder = 10;
      g.add(sprite);
      // a ring on the corridor floor
      const ringM = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false, depthWrite: false });
      const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.86, 40).rotateX(-Math.PI / 2), ringM);
      ringMesh.position.set(0, -1.5, 1.2);
      g.add(ringMesh);
      coverGroup.add(g);
      coverItems.push({ ...it, glowMat, ringMesh, sprite });
    }
    renderer.shadowMap.needsUpdate = true;
  };
  const updateCover = (t) => {
    for (const c of coverItems) {
      const k = c.status === 'pending' ? 0.55 + 0.45 * Math.sin(t * 4) : c.status === 'uncovered' ? 0.7 + 0.3 * Math.sin(t * 7) : 0.85;
      c.glowMat.opacity = k;
      const s = 1 + ((t * 0.8 + c.room * 0.13) % 1) * 0.6;
      c.ringMesh.scale.set(s, 1, s);
      c.ringMesh.material.opacity = 0.7 * (1 - ((t * 0.8 + c.room * 0.13) % 1));
    }
  };

  const post = createPost(renderer, scene, camera, P);

  // ---- camera: orbit controls + a director that follows the action ----
  let controls = null;
  let userUntil = 0; // the director waits while someone is looking around
  if (mode === 'hero' || mode === 'hod') {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 260;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = 1.45;
    controls.rotateSpeed = 0.5;
    controls.autoRotate = false;
    if (coarse) {
      controls.enabled = false; // one finger scrolls the page on phones
      renderer.domElement.style.touchAction = 'pan-y';
    }
    controls.addEventListener('start', () => {
      userUntil = performance.now() + 25000;
      flight = null;
    });
    controls.update();
  }
  let flight = null;
  const flyTo = (cam, tgt, dur = 3) => {
    flight = { fromCam: camera.position.clone(), fromT: (controls ? controls.target : target).clone(), toCam: new THREE.Vector3(...cam), toT: new THREE.Vector3(...tgt), t: 0, dur: reduceMotion ? 0.001 : dur };
  };
  let director = mode === 'hero' && !reduceMotion;
  let touring = false;
  let shotTimer = 7; // start on the wide view, then move in to the action
  let shotIdx = 0;
  let shotPhase = null;
  const drift = { angle: 0 };
  const nextShot = (phaseId) => {
    const list = SHOTS[phaseId] || SHOTS.evening;
    if (shotPhase !== phaseId) {
      shotPhase = phaseId;
      shotIdx = 0;
    } else shotIdx = (shotIdx + 1) % list.length;
    let shot = list[shotIdx];
    if (typeof shot[0] === 'string') shot = INSIDE_VIEWS[shot[0]];
    let [cam, tgt, o = {}] = shot;
    // on a tall phone screen the view is narrow: step back so the shot isn't all wall
    if (camera.aspect < 0.8 && !o.inside) {
      const k = 1.45;
      cam = [tgt[0] + (cam[0] - tgt[0]) * k, tgt[1] + (cam[1] - tgt[1]) * k, Math.min(57, tgt[2] + (cam[2] - tgt[2]) * k)];
    }
    // into (or out of) a room: a quick cut, never a flight through the wall
    if (o.inside || insideShot) cutTo(cam, tgt, Boolean(o.inside));
    else flyTo(cam, tgt, 4.5);
    drift.angle = 0;
    shotTimer = o.inside ? 11 + rng() * 3 : 15 + rng() * 6;
  };
  // following someone (the substitute walking to his class): { agent, room, t }
  let chase = null;
  const chaseCam = new THREE.Vector3();
  const chaseTgt = new THREE.Vector3();
  let insideShot = false;
  const setInside = (on) => {
    if (on !== insideShot) onInside?.(on); // the page shows a "Back outside" button while the camera is in a room
    insideShot = on;
    camera.near = on ? 0.12 : 0.6;
    camera.updateProjectionMatrix();
    if (controls) controls.minDistance = on ? 0.4 : 10;
  };
  const cutTo = (cam, tgt, inside) => {
    flight = null;
    const apply = () => {
      setInside(inside);
      camera.position.set(...cam);
      (controls ? controls.target : target).set(...tgt);
      camera.lookAt(...tgt);
      renderer.shadowMap.needsUpdate = true;
    };
    if (still || reduceMotion) return apply();
    const el = renderer.domElement;
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    setTimeout(() => {
      apply();
      el.style.opacity = '1';
    }, 320);
  };

  // frame the action beside the page's text card (desktop: right of it, phones: above it)
  let shift = { x: 0, y: 0 };
  const applyShift = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    if (shift.x || shift.y) camera.setViewOffset(w, h, -shift.x * w, -shift.y * h, w, h);
    else camera.clearViewOffset();
  };

  // ---- state ----
  let people = null;
  let birds = null;
  let sim = null;
  let ready = false;
  let running = true;
  let visible = true;
  let elapsed = 0;
  let storyClock = 0;
  let forcedStory = false;
  let last = performance.now();
  let envTimer = 99;
  let frameNo = 0;
  let shadowEvery = P.shadowEvery;
  let light = { warm: 0, lights: 0 };
  let boom = 0;
  let boomHold = 0;
  let minutesNow = startMinutes ?? (time === 'evening' ? 16 * 60 + 40 : DAY_START);
  const RED = new THREE.Color('#ff3b2a');
  const YELLOW = new THREE.Color('#f4c542');

  const applyTime = (rebuildEnv) => {
    light = sky.apply(minutesNow, { rebuildEnv, envDeg: P.envDeg });
    // at dusk the windows glow only as much as the rooms behind them are in use (an empty school is dark)
    const inUse = Math.min(1, (movers.lightsOn ?? 1) * 1.6);
    M.glassLit.emissiveIntensity = light.lights * 0.95 * inUse;
    M.glassClearLit.emissiveIntensity = light.lights * 0.35 * inUse;
    M.glassClearLit.opacity = 0.16 + light.lights * 0.25 * inUse;
    M.night.value = light.lights;
    M.lampOff.emissiveIntensity = light.lights * 6;
    school.dialMat.emissiveIntensity = light.lights * 0.5;
    school.setClock(minutesNow / 60);
  };

  const updateStory = () => {
    const cycle = 14;
    const s = forcedStory ? Math.min(storyClock, 9.5) : storyClock % cycle;
    const pulse = 0.7 + 0.3 * Math.sin(elapsed * 6);
    if (s > 1 && s < 5) {
      M.glassStory.emissive.copy(RED);
      M.glassStory.emissiveIntensity = 2.2 * pulse;
    } else if (s >= 5 && s < 10) {
      M.glassStory.emissive.copy(YELLOW);
      M.glassStory.emissiveIntensity = 2.0;
    } else {
      M.glassStory.emissive.set('#ffcf8c');
      M.glassStory.emissiveIntensity = light.lights * 0.95;
    }
  };

  // keeps the frame rate up by trading detail for speed
  const governor = new Governor({
    maxDpr,
    // the viewer's choice of HD or 4K is kept sharp: only the effects step down, and only when it's really slow
    minDpr: P.name === '4k' ? 1.5 : P.name === 'hd' ? 1 : Math.min(maxDpr, coarse ? 0.6 : 0.85),
    low: P.name === '4k' ? 16 : P.name === 'hd' ? 24 : 30,
    onChange: ({ dpr, step }) => {
      if (dpr) {
        renderer.setPixelRatio(dpr);
        resize();
      }
      // each step switches one thing off; returning false means "nothing to do here, try the next"
      if (step === 1) return post.dropAO();
      if (step === 2) return post.dropBloom();
      if (step === 3) {
        if (!grounds.grass.visible) return false;
        grounds.grass.visible = false;
      }
      if (step === 4) trees.setFar(false);
      if (step === 5) {
        if (shadowEvery >= 3) return false;
        shadowEvery = 3;
      }
      if (step === 6) {
        sky.sun.castShadow = false;
        renderer.shadowMap.needsUpdate = true;
      }
      if (step > 6) return true; // nothing left to switch off
    },
  });

  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 54 : 36;
    camera.updateProjectionMatrix();
    applyShift();
    post.setSize(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting && !document.hidden));
  io.observe(container);
  const onVis = () => (visible = !document.hidden);
  document.addEventListener('visibilitychange', onVis);

  applyTime(true);
  if (v0.inside) setInside(true);
  updateStory();

  const frame = (dt) => {
    elapsed += dt;
    storyClock += dt;
    if (sim) {
      sim.update(dt);
      minutesNow = sim.minutes;
    }
    envTimer += dt;
    const rebuild = envTimer > P.envEvery; // re-lighting from the sky is costly on small chips
    if (rebuild) envTimer = 0;
    applyTime(rebuild);
    updateStory();
    sky.update(elapsed);
    trees.update(elapsed);
    const gs = grounds.grass.material.userData.shader;
    if (gs) gs.uniforms.uTime.value = elapsed;
    flag.update(elapsed);
    vehicles.update(dt);
    setGateHold(vehicles.gateTurning());
    // the barrier lifts for a vehicle coming through, and comes down a couple of seconds after it's gone
    boomHold = vehicles.nearBoom() ? 2.2 : boomHold - dt;
    boom = Math.max(0, Math.min(1, boom + (boomHold > 0 ? dt * 1.4 : -dt * 0.7)));
    grounds.setBoom(boom);
    grounds.update(elapsed, minutesNow);
    if (people) {
      people.posed.update(elapsed);
      movers.update(dt, [people.crowd.agents, people.pool.agents], (room) => sim?.busy(room));
    }
    birds?.update(elapsed, dt, light.lights);
    if (coverItems.length) updateCover(elapsed);
    if (beacon.visible) {
      const p = 1 + Math.sin(elapsed * 3) * 0.12;
      ring.scale.set(p, 1, p);
    }

    // director: glide between shots of whatever is happening now
    const directing = director && !touring && sim && performance.now() > userUntil;
    if (directing && chase) {
      // the story of the moment: follow the substitute across the courtyard; once he's on the stairs, cut into
      // the classroom and watch him walk in
      const a = chase.agent;
      if (!a.active || a.tag !== 'cover') {
        chase = null;
      } else if (a.pos.y > 1.2 && !chase.inside) {
        chase.inside = true;
        const v = INSIDE_VIEWS[chase.room === 0 ? 'classroom2' : 'classroom'];
        cutTo(v[0], v[1], true);
        shotTimer = 26;
      } else if (!chase.inside) {
        chaseTgt.set(a.pos.x, 1.3, a.pos.z);
        chaseCam.set(a.pos.x + 7.5, 6.8, a.pos.z + 9.5);
        if (chase.t === 0) {
          if (insideShot) cutTo(chaseCam.toArray(), chaseTgt.toArray(), false);
          else flyTo(chaseCam.toArray(), chaseTgt.toArray(), 2.2);
        } else if (!flight) {
          const k = 1 - Math.exp(-dt * 2.2);
          camera.position.lerp(chaseCam, k);
          const t = controls ? controls.target : target;
          t.lerp(chaseTgt, k);
          camera.lookAt(t);
        }
        chase.t += dt;
        shotTimer = 30;
      }
    } else if (directing) {
      shotTimer -= dt;
      const pid = sim.phase?.id;
      if (shotTimer <= 0 || (pid !== shotPhase && shotTimer < 12)) nextShot(pid);
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.dur);
      const e = ease(flight.t);
      camera.position.lerpVectors(flight.fromCam, flight.toCam, e);
      const tg = new THREE.Vector3().lerpVectors(flight.fromT, flight.toT, e);
      (controls ? controls.target : target).copy(tg);
      camera.lookAt(tg);
      if (flight.t >= 1) flight = null;
    } else if (controls) {
      // a slow sideways drift keeps every shot alive
      if (director && !touring && !insideShot && !chase && performance.now() > userUntil) {
        const t = controls.target;
        const off = camera.position.clone().sub(t);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.018);
        camera.position.copy(t).add(off);
      }
      controls.update();
    }

    frameNo++;
    if (frameNo % shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
    post.render(elapsed, light.warm);
  };

  const tick = (now) => {
    if (!running) return;
    requestAnimationFrame(tick);
    // cap the step so a hiccup doesn't teleport anyone, but keep real-time speed at low frame rates
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || !ready) return;
    frame(dt);
    governor.tick(dt);
    if (window.__campusDebug && frameNo % 60 === 0) {
      const r = renderer.info.render;
      window.__campusStats = { fps: governor.fps, calls: r.calls, tris: r.triangles, dpr: renderer.getPixelRatio(), step: governor.step, profile: P.name, minutes: minutesNow, agents: people?.pool.activeCount(), crowd: people?.crowd.activeCount() };
    }
  };

  const readyP = Promise.all([peopleP, birdsP]).then(async ([p, b]) => {
    people = p;
    birds = b;
    // vehicles and people on foot look out for each other
    vehicles.setPedestrians(() => [people.crowd.agents, people.pool.agents]);
    setVehicleZones(vehicles.zones);
    setVehicleBodies(vehicles.bodies);
    const T = (label) => window.__campusDebug && console.log('[people]', label, Math.round(performance.now()));
    sim = createSim({
      people, vehicles, grounds, scene, rng, onBell,
      onStory: (s) => {
        // the page shows the card; the director follows the substitute across the courtyard, then cuts into the class
        onStory?.(s && { step: s.step, title: s.title, lines: s.lines });
        if (s?.step === 'walking' && s.agent) chase = { agent: s.agent, room: s.room, t: 0 };
        else if (!s) chase = null;
      },
    });
    sim.onClock((m, ph) => onClock?.(m, ph));
    sim.jumpTo(minutesNow);
    T('sim');
    if (mode === 'hod') sim.setSpeed(1 / 60); // the HOD sees the school at the real time
    await L.done();
    T('textures');
    if (!running) return;
    // compile every shader before the first frame (in the background where the browser can), with the
    // hidden people and parts shown for a moment so theirs are ready too: no stutter later in the day
    const hidden = [];
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      renderer.compile(scene, camera);
    }
    for (const o of hidden) o.visible = false;
    if (!running) return;
    T('compiled programs ' + renderer.info.programs.length);
    ready = true;
    for (let i = 0; i < 3; i++) {
      frame(1 / 60);
      T('frame ' + i + ' programs ' + renderer.info.programs.length);
    }
    renderer.domElement.style.opacity = '1';
    onReady?.(true);
  });
  readyP.catch((err) => {
    console.error('[campus]', err);
    onReady?.(false);
  });
  if (!still) requestAnimationFrame(tick);
  if (window.__campusDebug) {
    // triangle budget per object, biggest first (for tuning)
    window.__campusBreakdown = () => {
      const rows = [];
      scene.traverseVisible((o) => {
        if (!o.isMesh || !o.geometry) return;
        const g = o.geometry;
        const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const n = o.isInstancedMesh ? o.count : 1;
        rows.push([o.name || o.parent?.name || o.material?.name || o.type, Math.round(tris), n, Math.round(tris * n), o.isSkinnedMesh ? 'skinned' : '']);
      });
      rows.sort((a, b) => b[3] - a[3]);
      return rows.slice(0, 40);
    };
  }

  return {
    ready: readyP,
    canvas: renderer.domElement,
    profile: P.name,
    get fps() {
      return governor.fps;
    },
    /** who is standing in front of a vehicle (testing) */
    debugAgent(i, sys = 'c') {
      const a = (sys === 'c' ? people?.crowd.agents : people?.pool.agents)?.[i];
      if (!a) return null;
      const r = (v) => (v ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), v.exact ? 'E' : v.narrow ? 'N' : v.squeeze ? 'S' : ''] : null);
      return { tag: a.tag, pos: r(a.pos), seg: a.seg, path: a.path?.map(r), holdT: a.holdT, wait: a.wait, yieldT: a.yieldT, gateT: a.gateT, moving: a.moving, run: a.run, pace: a.pace, data: a.data && { cls: a.data.cls, row: a.data.row, seat: Boolean(a.data.seat) }, onArrive: Boolean(a.onArrive), routes: a.routes, size: a.size, active: a.active };
    },
    debugFleet() {
      const out = [];
      for (const [kind, list] of Object.entries(vehicles.fleet)) {
        list.forEach((d, i) => {
          if (!d.obj.visible) return;
          const by = d.blockedBy ? Object.entries(vehicles.fleet).map(([k, l]) => (l.indexOf(d.blockedBy) >= 0 ? k + l.indexOf(d.blockedBy) : '')).join('') || 'traffic' : '';
          out.push([kind + i, +d.obj.position.x.toFixed(1), +d.obj.position.z.toFixed(1), +d.obj.rotation.y.toFixed(2), +d.speed.toFixed(1), d.active ? 1 : 0, d.blocked ? 1 : 0, +(d.pedWait || 0).toFixed(1), by, d.hold ? 1 : 0, d.stopped ? 1 : 0]);
        });
      }
      return out;
    },
    debugBlockers(kind = 'buses', i = 0) {
      const d = vehicles.fleet[kind][i];
      if (!d) return null;
      const r = d.obj.rotation.y;
      const fx = Math.sin(r);
      const fz = Math.cos(r);
      const out = [];
      for (const list of [people.crowd.agents, people.pool.agents]) {
        for (const a of list) {
          if (!a.active) continue;
          const rx = a.pos.x - d.obj.position.x;
          const rz = a.pos.z - d.obj.position.z;
          const along = rx * fx + rz * fz;
          const side = Math.abs(rx * fz - rz * fx);
          if (along > 2 && along < 9 && side < 3) out.push({ tag: a.tag, along: +along.toFixed(1), side: +side.toFixed(1), pos: [+a.pos.x.toFixed(2), +a.pos.z.toFixed(2)], goal: a.path?.[a.seg] ? [+a.path[a.seg].x.toFixed(1), +a.path[a.seg].z.toFixed(1)] : null, seg: a.seg, n: a.path?.length, hold: a.holdT, wait: +(a.wait || 0).toFixed(1) });
        }
      }
      return { bus: [d.obj.position.x, d.obj.position.z], blocked: d.blocked, ped: d.pedWait, speed: d.speed, zones: vehicles.zones.map((z) => [+z.x.toFixed(1), +z.z.toFixed(1), +z.fx.toFixed(2), +z.fz.toFixed(2), z.back, +z.front.toFixed(1), z.half, z.path, z.nose]), out: out.slice(0, 6) };
    },
    /** everyone and everything that moves, compactly (for the audit script) */
    debugAll() {
      const pk = (a, sys) => {
        const g = a.path?.[a.seg];
        return [sys, +a.pos.x.toFixed(2), +a.pos.y.toFixed(2), +a.pos.z.toFixed(2), a.tag || '-', a.kind, g ? +g.x.toFixed(1) : null, g ? +g.z.toFixed(1) : null, a.path ? a.path.length - a.seg : 0, +(a.wait || 0).toFixed(1), +(a.holdT || 0).toFixed(1), a.i, a.talk ? 1 : 0];
      };
      const out = [];
      for (const a of people?.crowd.agents || []) if (a.active) out.push(pk(a, 'c'));
      for (const a of people?.pool.agents || []) if (a.active) out.push(pk(a, 'p'));
      return {
        m: sim?.minutes,
        phase: sim?.phase?.id,
        agents: out,
        fp: vehicles.footprints(),
        doors: movers.doors.map((d) => +d.open.toFixed(2)),
        seated: CLASSROOMS.map((_, i) => sim?.seated(i)),
      };
    },
    /** one student's whole route (testing) */
    debugPath(i) {
      const a = people?.crowd.agents[i];
      return a && { seg: a.seg, tag: a.tag, data: a.data && { cls: a.data.cls }, pos: a.pos.toArray().map((v) => +v.toFixed(2)), path: a.path?.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), p.exact ? 'E' : p.narrow ? 'N' : ''].join(' ')) };
    },
    /** a walking student with a bag (testing) */
    findWalker(tag = 'arriving') {
      const a = people?.crowd.agents.find((g) => g.active && g.tag === tag && g.bag && g.path && g.seg < g.path.length && g.pos.y < 0.3);
      return a ? { pos: a.pos.toArray(), heading: a.heading, kind: a.kind } : null;
    },
    /** where an animated person of this kind is (testing): e.g. 'teacherF' */
    findPool(prefix) {
      const a = people?.pool.agents.find((g) => g.active && g.kind.startsWith(prefix));
      return a ? { pos: a.pos.toArray(), heading: a.heading, kind: a.kind, tag: a.tag } : null;
    },
    /** people with a given tag (testing): where they are and where they're heading */
    debugAgents(tag, n = 5) {
      const out = [];
      for (const a of people?.crowd.agents || []) {
        if (!a.active || a.tag !== tag) continue;
        out.push({ pos: a.pos.toArray().map((v) => +v.toFixed(2)), seg: a.seg, len: a.path?.length, goal: a.path?.[a.seg]?.toArray().map((v) => +v.toFixed(2)), hold: a.holdT, wait: a.wait, run: a.run, pace: +(a.pace || 0).toFixed(2), data: a.data && { cls: a.data.cls } });
        if (out.length >= n) break;
      }
      return out;
    },
    /** what the school day is doing (testing) */
    debugState() {
      const F = vehicles.fleet;
      const v = (d) => ({ vis: d.obj.visible, act: d.active, x: +d.obj.position.x.toFixed(1), z: +d.obj.position.z.toFixed(1), load: d.load, boarding: d.boarding, blocked: d.blocked, hold: d.hold, ped: +(d.pedWait || 0).toFixed(1), by: d.blockedBy ? d.blockedBy.kind || (d.blockedBy.obj ? "veh" : "traffic") : null, speed: +(d.speed || 0).toFixed(1) });
      return { minutes: sim?.minutes, phase: sim?.phase?.id, agents: people?.pool.activeCount(), crowd: people?.crowd.activeCount(), sim: sim?.debug(), footprints: vehicles.footprints(), buses: F.buses.map(v), cars: F.cars.map(v), autos: F.autos.map(v) };
    },
    /** like view(), for a view that may be inside a room ({ cam, target, inside }) */
    viewInside(v) {
      setInside(Boolean(v.inside));
      return this.view(v.cam, v.target);
    },
    /** the heaviest meshes in the scene (testing) */
    debugTris(n = 25) {
      const list = [];
      scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        const g = o.geometry;
        const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const k = o.isInstancedMesh ? o.count : 1;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        list.push({ name: o.name || mat?.name || mat?.type, color: mat?.color?.getHexString?.(), tris: Math.round(t * k), cast: o.castShadow });
      });
      list.sort((a, b) => b.tris - a.tris);
      return { total: list.reduce((s, m) => s + m.tris, 0), top: list.slice(0, n) };
    },
    /** draw calls and triangles in the last frame (testing) */
    debugRender(cam, tgt) {
      renderer.info.autoReset = false;
      renderer.info.reset();
      this.view(cam, tgt);
      const r = renderer.info.render;
      const out = { calls: r.calls, tris: r.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
      renderer.info.autoReset = true;
      return out;
    },
    /** point the camera somewhere and draw one frame (testing and stills) */
    view(cam, tgt) {
      camera.position.set(...cam);
      target.set(...tgt);
      controls?.target.copy(target);
      camera.lookAt(target);
      renderer.shadowMap.needsUpdate = true;
      frame(1 / 30);
      return renderer.domElement;
    },
    renderStill() {
      sim?.setPaused(true);
      for (let i = 0; i < 3; i++) frame(1 / 30);
      renderer.info.autoReset = false;
      renderer.info.reset();
      frame(1 / 30);
      renderer.info.autoReset = true;
      const r = renderer.info.render;
      window.__campusInfo = { calls: r.calls, triangles: r.triangles, profile: P.name };
      return renderer.domElement;
    },
    /** how long the per-frame work takes without drawing, in ms per frame (testing) */
    benchJS(n = 120) {
      sim?.setPaused(false);
      const t = { sim: 0, veh: 0, posed: 0, movers: 0 };
      for (let i = 0; i < n; i++) {
        let a = performance.now();
        sim?.update(1 / 60);
        let b = performance.now();
        t.sim += b - a;
        vehicles.update(1 / 60);
        setGateHold(vehicles.gateTurning());
        a = performance.now();
        t.veh += a - b;
        people.posed.update(i / 60);
        b = performance.now();
        t.posed += b - a;
        movers.update(1 / 60, [people.crowd.agents, people.pool.agents], (room) => sim?.busy(room));
        a = performance.now();
        t.movers += a - b;
      }
      if (still) sim?.setPaused(true);
      for (const k of Object.keys(t)) t[k] = +(t[k] / n).toFixed(3);
      return t;
    },
    /** run the school day for a while without drawing (used to make stills of a moment) */
    advance(seconds) {
      sim?.setPaused(false);
      for (let t = 0; t < seconds; t += 1 / 30) {
        sim?.update(1 / 30);
        vehicles.update(1 / 30);
        setGateHold(vehicles.gateTurning());
        boomHold = vehicles.nearBoom() ? 2.2 : boomHold - 1 / 30;
        boom = Math.max(0, Math.min(1, boom + (boomHold > 0 ? 1.4 : -0.7) / 30));
      }
      grounds.setBoom(boom);
      minutesNow = sim?.minutes ?? minutesNow;
      if (still) sim?.setPaused(true);
    },
    /** jump the school day to a time (minutes after midnight) */
    jumpTo(m) {
      // a quick dip to black hides the cut
      const el = renderer.domElement;
      el.style.transition = 'opacity 0.25s ease';
      el.style.opacity = '0';
      setTimeout(() => {
        minutesNow = m;
        sim?.jumpTo(m);
        shotTimer = 0.5;
        envTimer = 99;
        el.style.opacity = '1';
      }, still ? 0 : 260);
    },
    setTime(name) {
      this.jumpTo(name === 'evening' ? 16 * 60 + 40 : DAY_START);
    },
    setFrameShift(x, y) {
      shift = { x, y };
      applyShift();
    },
    setDirector(on) {
      director = on;
    },
    /** HOD view: show today's cover on the classrooms. items: [{ room, status, title, sub }] */
    setCover(items) {
      setCover(items || []);
    },
    /** fly to a classroom (index into ROOMS) */
    focusRoom(i) {
      const r = ROOMS[i % ROOMS.length];
      if (!r) return;
      userUntil = performance.now() + 60000;
      const cam = [r.x + r.nx * 15 + r.nz * 4, r.y + 6, r.z + r.nz * 15 - r.nx * 4];
      if (insideShot) cutTo(cam, [r.x, r.y, r.z], false);
      else flyTo(cam, [r.x, r.y, r.z], 2.4);
    },
    /** back to the whole-campus view */
    overview() {
      if (insideShot) cutTo(v0.cam, v0.target, false);
      else flyTo(v0.cam, v0.target, 2.4);
    },
    goTo(i) {
      const s = STOPS[i];
      if (!s) return;
      touring = true;
      sim?.setSpeed(0.5);
      if (s.clock && sim && Math.abs(sim.minutes - s.clock) > 20) this.jumpTo(s.clock);
      if (s.inside || insideShot) cutTo(s.cam, s.target, Boolean(s.inside));
      else flyTo(s.cam, s.target, 2.8);
      beacon.position.set(...s.beacon);
      beacon.visible = !s.inside;
      beam.visible = !s.story;
      forcedStory = Boolean(s.story);
      if (s.story) storyClock = 0;
    },
    /** look inside a room: 'classroom', 'staff', 'hod', 'library' — as it is right now (after school, it's empty) */
    lookInside(name) {
      const v = INSIDE_VIEWS[name];
      if (!v) return;
      userUntil = performance.now() + 30000;
      cutTo(v[0], v[1], true);
    },
    /** back out of a room to the view over the whole campus; the director carries on from there */
    lookOutside() {
      userUntil = performance.now() + 8000;
      cutTo(v0.cam, v0.target, false);
    },
    endTour() {
      touring = false;
      if (insideShot) cutTo(v0.cam, v0.target, false);
      sim?.setSpeed(null);
      beacon.visible = false;
      forcedStory = false;
      shotTimer = 0.5;
    },
    dispose() {
      running = false;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      controls?.dispose();
      post.dispose();
      sky.dispose();
      scene.traverse((o) => {
        if (o.isMesh || o.isPoints || o.isSprite) {
          o.geometry?.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
