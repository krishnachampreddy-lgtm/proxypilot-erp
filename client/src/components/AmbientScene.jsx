import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/*
  "The timetable that heals itself"
  A floating 3D grid of class periods breathes like a calm fluid.
  Every few seconds one period goes dark (a teacher is absent) and a brass
  block glides in to cover it. Blocks rise gently away from the cursor.
*/

const THEMES = {
  dark: {
    bg: 0x0b1626,
    block: new THREE.Color('#1c2f4c'),
    blockHi: new THREE.Color('#2a4166'),
    absent: new THREE.Color('#5a2a26'),
    brass: new THREE.Color('#c8973f'),
    covered: new THREE.Color('#9b7533'),
    hemiSky: 0x9fb4d6,
    hemiGround: 0x0b1626,
    key: 0xfff1d9,
    fogNear: 9,
    fogFar: 30,
    panel: 0xc8d4ea,
    panelOpacity: 0.07,
  },
  light: {
    bg: 0xf5f1ea,
    block: new THREE.Color('#e7e0d3'),
    blockHi: new THREE.Color('#f1ece3'),
    absent: new THREE.Color('#d9a99b'),
    brass: new THREE.Color('#c8973f'),
    covered: new THREE.Color('#dcc192'),
    hemiSky: 0xffffff,
    hemiGround: 0xd9cfbf,
    key: 0xffffff,
    fogNear: 8,
    fogFar: 26,
    panel: 0x13233a,
    panelOpacity: 0.035,
  },
};

const COLS = 18;
const ROWS = 10;
const GAP = 1.18;

export default function AmbientScene({ theme = 'dark', className = '', intensity = 1 }) {
  const mount = useRef(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const T = THEMES[theme];
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      return; // no WebGL: the CSS background behind still looks fine
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(T.bg, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = theme === 'dark' ? 1.05 : 0.95;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(T.bg, T.fogNear, T.fogFar);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const camBase = new THREE.Vector3(0, 9.5, 12.5);
    camera.position.copy(camBase);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.HemisphereLight(T.hemiSky, T.hemiGround, theme === 'dark' ? 1.1 : 1.6));
    const key = new THREE.DirectionalLight(T.key, theme === 'dark' ? 2.2 : 1.4);
    key.position.set(-6, 12, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc8973f, theme === 'dark' ? 0.6 : 0.25);
    rim.position.set(8, 3, -8);
    scene.add(rim);

    // ---- the timetable grid (one instanced mesh) ----
    const geo = new RoundedBoxGeometry(1, 0.32, 0.72, 3, 0.12);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.08 });
    const count = COLS * ROWS;
    const grid = new THREE.InstancedMesh(geo, mat, count);
    grid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(grid);

    const slots = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - (COLS - 1) / 2) * GAP;
        const z = (r - (ROWS - 1) / 2) * GAP * 0.82;
        // a few empty cells so it reads as a real timetable, not a carpet
        const empty = (c * 7 + r * 13) % 11 === 0;
        slots.push({ x, z, empty, state: 'normal', t: 0, lift: 0, color: T.block.clone(), tint: Math.random() });
      }
    }

    // ---- brass "substitute" blocks floating above, ready to cover ----
    const brassMat = new THREE.MeshStandardMaterial({ color: T.brass, roughness: 0.32, metalness: 0.55, emissive: T.brass, emissiveIntensity: 0.12 });
    const travellers = Array.from({ length: 3 }, (_, i) => {
      const m = new THREE.Mesh(geo, brassMat);
      m.scale.setScalar(0.85);
      const home = new THREE.Vector3(1 + i * 3.2 + Math.random(), 2.2 + Math.random() * 0.6, -5 - Math.random() * 1.5);
      m.position.copy(home);
      scene.add(m);
      return { mesh: m, home, phase: Math.random() * 10, busy: false, from: new THREE.Vector3(), target: -1, t: 0 };
    });

    // ---- translucent floating "pages" (timetables) for depth ----
    const panels = [];
    const panelGeo = new THREE.PlaneGeometry(2.4, 1.5);
    const edgeGeo = new THREE.EdgesGeometry(panelGeo);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const face = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({ color: T.panel, transparent: true, opacity: T.panelOpacity, side: THREE.DoubleSide, depthWrite: false }));
      const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: T.panel, transparent: true, opacity: T.panelOpacity * 3.2 }));
      g.add(face, edge);
      g.position.set((Math.random() - 0.5) * 22, 2.5 + Math.random() * 3.5, -6 - Math.random() * 6);
      g.rotation.set(-0.3 + Math.random() * 0.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.3);
      g.userData = { speed: 0.15 + Math.random() * 0.2, phase: Math.random() * 6, y: g.position.y };
      scene.add(g);
      panels.push(g);
    }

    // ---- pointer (fluid reaction + parallax) ----
    const pointer = new THREE.Vector2(9, 9);
    const smooth = new THREE.Vector2(0, 0);
    const ray = new THREE.Raycaster();
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3(999, 0, 999);
    const hitSmooth = new THREE.Vector3(999, 0, 999);
    const onMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const onLeave = () => pointer.set(9, 9);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);

    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      // keep the grid filling narrow (phone) screens too
      camera.fov = w / h < 0.9 ? 55 : 38;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // ---- substitution story ----
    const pickAbsent = () => {
      const free = travellers.find((t) => !t.busy);
      if (!free) return;
      const candidates = slots.map((s, i) => [s, i]).filter(([s]) => !s.empty && s.state === 'normal');
      // prefer cells in the visible middle band
      const mid = candidates.filter(([s]) => Math.abs(s.x) < 7 && Math.abs(s.z) < 3.5);
      const pool = mid.length ? mid : candidates;
      const [slot, idx] = pool[Math.floor(Math.random() * pool.length)];
      slot.state = 'absent';
      slot.t = 0;
      free.busy = true;
      free.target = idx;
      free.t = -0.9; // short pause before it leaves, so the gap is noticed
      free.from.copy(free.mesh.position);
    };
    let nextPick = 1.2;

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const clock = new THREE.Clock();
    let raf = 0;
    let running = true;
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

    const frame = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.elapsedTime;

      // parallax + pointer smoothing
      smooth.lerp(pointer.x > 5 ? new THREE.Vector2(0, 0) : pointer, 0.04);
      camera.position.set(camBase.x + smooth.x * 1.1 * intensity, camBase.y + smooth.y * 0.5 * intensity, camBase.z);
      camera.lookAt(0, 0, 0);

      if (pointer.x < 5) {
        ray.setFromCamera(pointer, camera);
        ray.ray.intersectPlane(ground, hit);
      } else hit.set(999, 0, 999);
      hitSmooth.lerp(hit, 0.12);

      if (!reduceMotion) {
        nextPick -= dt;
        if (nextPick <= 0) {
          pickAbsent();
          nextPick = 1.6 + Math.random() * 1.4;
        }
      }

      // grid
      for (let i = 0; i < count; i++) {
        const s = slots[i];
        const wave = reduceMotion ? 0 : (Math.sin(s.x * 0.42 + time * 0.7) + Math.cos(s.z * 0.55 + time * 0.55) * 0.8) * 0.14 * intensity;
        const dx = s.x - hitSmooth.x;
        const dz = s.z - hitSmooth.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const target = Math.max(0, 1 - d / 2.8);
        s.lift += (target * target - s.lift) * 0.12;

        let y = wave + s.lift * 0.9;
        let scale = s.empty ? 0.0001 : 1;
        s.t += dt;

        if (s.state === 'absent') {
          y -= Math.min(s.t * 0.5, 0.28); // sinks a little
          tmpColor.copy(T.block).lerp(T.absent, Math.min(s.t * 1.8, 1));
        } else if (s.state === 'covered') {
          const k = Math.max(0, 1 - s.t / 6);
          tmpColor.copy(T.block).lerp(T.covered, k);
          if (s.t > 6) s.state = 'normal';
        } else {
          tmpColor.copy(T.block).lerp(T.blockHi, s.lift * 0.9 + s.tint * 0.15);
        }

        dummy.position.set(s.x, y, s.z);
        dummy.rotation.set(s.lift * 0.18 * Math.sign(dz || 1), 0, -s.lift * 0.18 * Math.sign(dx || 1));
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        grid.setMatrixAt(i, dummy.matrix);
        grid.setColorAt(i, tmpColor);
      }
      grid.instanceMatrix.needsUpdate = true;
      if (grid.instanceColor) grid.instanceColor.needsUpdate = true;

      // travellers
      for (const tr of travellers) {
        const m = tr.mesh;
        if (!tr.busy) {
          m.position.x = tr.home.x + Math.sin(time * 0.3 + tr.phase) * 0.6;
          m.position.y = tr.home.y + Math.sin(time * 0.9 + tr.phase) * 0.18;
          m.position.z = tr.home.z;
          m.rotation.set(Math.sin(time * 0.4 + tr.phase) * 0.25, time * 0.25 + tr.phase, 0.1);
          m.scale.setScalar(0.85);
          continue;
        }
        tr.t += dt;
        if (tr.t < 0) {
          tr.from.copy(m.position);
          continue;
        }
        const s = slots[tr.target];
        const k = Math.min(tr.t / 1.7, 1);
        const e = ease(k);
        const tx = s.x, tz = s.z, ty = 0.05;
        m.position.set(
          THREE.MathUtils.lerp(tr.from.x, tx, e),
          THREE.MathUtils.lerp(tr.from.y, ty, e) + Math.sin(e * Math.PI) * 1.4,
          THREE.MathUtils.lerp(tr.from.z, tz, e)
        );
        m.rotation.set((1 - e) * 0.6, (1 - e) * 2.2, 0);
        m.scale.setScalar(0.85 + e * 0.15);
        if (k >= 1) {
          s.state = 'covered';
          s.t = 0;
          tr.busy = false;
          // respawn far above, then drift home
          tr.home.set(1 + Math.random() * 8, 2.2 + Math.random() * 0.6, -5 - Math.random() * 1.5);
          m.position.set(tr.home.x, 6, tr.home.z - 3);
        }
      }

      for (const p of panels) {
        const u = p.userData;
        p.position.y = u.y + Math.sin(time * u.speed + u.phase) * 0.35;
        p.rotation.y += Math.sin(time * 0.1 + u.phase) * 0.0006;
      }

      renderer.render(scene, camera);
      if (running && !reduceMotion) raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        clock.getDelta();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [theme, intensity]);

  return <div ref={mount} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
