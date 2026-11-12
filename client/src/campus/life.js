import * as THREE from 'three';
import { canvasTexture } from './util.js';

/* The national flag on its mast in the assembly yard, and birds over the campus. */

export function buildFlag(scene, B, x, z) {
  // three-step platform and mast
  B.box(4.2, 0.35, 4.2, 'plinth', x, 0, z);
  B.box(3.2, 0.35, 3.2, 'concrete', x, 0.35, z);
  B.box(2.2, 0.35, 2.2, 'white', x, 0.7, z);
  B.cyl(0.07, 10.5, 'steel', x, 1.05, z, 12, { r2: 0.045 });
  B.add(new THREE.SphereGeometry(0.11, 12, 10), 'gold', x, 11.6, z);

  const tex = canvasTexture(600, 400, (g) => {
    g.fillStyle = '#ff9933';
    g.fillRect(0, 0, 600, 134);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 133, 600, 134);
    g.fillStyle = '#138808';
    g.fillRect(0, 266, 600, 134);
    g.strokeStyle = '#000080';
    g.fillStyle = '#000080';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(300, 200, 56, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(300, 200, 9, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(300, 200);
      g.lineTo(300 + Math.cos(a) * 56, 200 + Math.sin(a) * 56);
      g.stroke();
    }
  });
  const geo = new THREE.PlaneGeometry(2.7, 1.8, 30, 16);
  const base = geo.attributes.position.array.slice();
  const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }));
  flag.position.set(x + 1.42, 10.45, z);
  flag.castShadow = true;
  scene.add(flag);
  return {
    update(t) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        const f = (bx + 1.35) / 2.7; // 0 at the mast, 1 at the free edge
        const w = Math.sin(bx * 2.6 - t * 5.2 + by * 0.6) * 0.16 + Math.sin(bx * 5.1 - t * 8.3) * 0.04;
        p.setXYZ(i, bx - f * f * 0.08, by - f * f * 0.06, w * f);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
    },
  };
}

export async function buildBirds(scene, L, rng, { count = 12 } = {}) {
  const make = async (file, n, wingspan, alt, radius, speed) => {
    const gltf = await L.model(file);
    const src = gltf.scene.children[0];
    const box = new THREE.Box3().setFromObject(src);
    const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const s = wingspan / span;
    const flock = [];
    for (let i = 0; i < n; i++) {
      const b = src.clone();
      b.scale.setScalar(s * (0.9 + rng() * 0.2));
      b.castShadow = true;
      const mixer = new THREE.AnimationMixer(b);
      mixer.clipAction(gltf.animations[0]).setDuration(0.9 + rng() * 0.3).play();
      mixer.setTime(rng());
      scene.add(b);
      flock.push({ b, mixer, a: (i / n) * 0.8 + rng() * 0.2, r: radius + (rng() - 0.5) * 14, y: alt + (rng() - 0.5) * 6, speed: speed * (0.9 + rng() * 0.2) });
    }
    return flock;
  };
  const parrots = await make('Parrot.glb', count, 0.55, 26, 60, 0.11);
  const egrets = await make('Stork.glb', Math.ceil(count / 3), 1.4, 38, 110, 0.06);
  const all = [...parrots, ...egrets];
  return {
    update(t, dt, k) {
      for (const f of all) {
        f.b.visible = k < 0.9;
        const a = f.a + t * f.speed;
        f.b.position.set(Math.cos(a) * f.r + 15, f.y + Math.sin(t * 0.7 + f.a * 9) * 1.5, Math.sin(a) * f.r - 15);
        f.b.rotation.y = -a; // fly along the circle
        f.mixer.update(dt);
      }
    },
  };
}
