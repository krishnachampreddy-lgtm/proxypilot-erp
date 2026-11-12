import * as THREE from 'three';
import { CAMPUS } from './grounds.js';

/*
  The neighbourhood: quiet two- and three-storey villas in pale plaster with stone trim,
  chajjas over the windows, balconies with bronze railings, and glass-fronted shops on
  the main road — the leafy, well-kept streets round an old school of standing.
*/

const FH = 3.1;

function house(B, M, rng, x, z, facing, { detail = true, shop = false } = {}) {
  // facing: 0 = front faces -z, 1 = +z, 2 = -x, 3 = +x
  const w = 6 + rng() * 5;
  const d = 8 + rng() * 6;
  const floors = 2 + Math.floor(rng() * (shop ? 1.6 : 1.9));
  const H = floors * FH;
  const paint = M.town[Math.floor(rng() * M.town.length)];
  const trim = rng() < 0.5 ? 'white' : M.town[Math.floor(rng() * M.town.length)];
  const ry = [0, Math.PI, Math.PI / 2, -Math.PI / 2][facing];
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  // local (u across the front, v toward the back) -> world; front face at v = 0
  const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
  const put = (w2, h2, d2, key, u, y, v) => {
    const [px, pz] = at(u, v);
    B.box(w2, h2, d2, key, px, y, pz, { ry });
  };

  put(w + 0.2, 0.4, d + 0.2, 'plinth', 0, 0, d / 2);
  put(w, H, d, paint, 0, 0.4, d / 2);
  put(w + 0.3, 0.9, d + 0.3, paint, 0, H + 0.4, d / 2); // parapet
  put(w + 0.4, 0.1, d + 0.4, trim, 0, H + 1.3, d / 2);
  for (let f = 1; f < floors; f++) put(w + 0.08, 0.22, 0.1, trim, 0, 0.4 + f * FH - 0.12, -0.05);
  put(0.3, H, 0.1, trim, -w / 2 + 0.15, 0.4, -0.05);
  put(0.3, H, 0.1, trim, w / 2 - 0.15, 0.4, -0.05);

  const cols = Math.max(1, Math.round(w / 2.6));
  for (let f = 0; f < floors; f++) {
    const y0 = 0.4 + f * FH;
    if (f === 0 && shop) {
      // shop front: plate glass in a bronze frame under a fabric awning
      put(w * 0.8, 2.4, 0.06, 'glassTown', 0, y0 + 0.05, -0.03);
      put(w * 0.82, 0.1, 0.1, 'green', 0, y0 + 2.45, -0.06);
      put(w * 0.82, 0.1, 0.1, 'green', 0, y0, -0.06);
      put(w * 0.84, 0.08, 1.1, rng() < 0.5 ? 'fabricBlue' : 'maroon', 0, y0 + 2.75, -0.55);
      continue;
    }
    for (let i = 0; i < cols; i++) {
      const u = -w / 2 + (w / cols) * (i + 0.5);
      if (f === 0 && i === 0 && !shop) {
        put(1.0, 2.1, 0.06, 'doorWood', u, y0, -0.03); // front door
        continue;
      }
      put(1.5, 1.4, 0.04, 'glassTown', u, y0 + 0.85, -0.02);
      put(1.7, 0.12, 0.1, trim, u, y0 + 0.75, -0.05);
      put(1.9, 0.08, 0.55, trim, u, y0 + 2.35, -0.27); // chajja
      if (detail) for (let b = 1; b < 9; b++) put(0.02, 1.2, 0.02, 'green', u - 0.65 + b * 0.145, y0 + 0.97, -0.07);
    }
    // a balcony on upper floors at the front
    if (f > 0 && detail && rng() < 0.45) {
      put(w * 0.6, 0.14, 1.1, 'concrete', 0, y0 - 0.02, -0.55);
      put(w * 0.6, 0.9, 0.05, 'green', 0, y0 + 0.12, -1.08);
    }
  }
  // windows down both sides and across the back too, each under its chajja (seen from the campus, the backs of
  // the houses on the main road face the school)
  if (detail) {
    for (let f = 0; f < floors; f++) {
      const y0 = 0.4 + f * FH;
      for (const sd of [-1, 1]) {
        for (const dv of [0.35, 0.72]) {
          const [px, pz] = at(sd * (w / 2 + 0.02), d * dv);
          B.box(0.04, 1.2, 1.1, 'glassTown', px, y0 + 0.95, pz, { ry });
          const [cx, cz] = at(sd * (w / 2 + 0.22), d * dv);
          B.box(0.45, 0.08, 1.4, trim, cx, y0 + 2.3, cz, { ry });
        }
      }
      for (let i = 0; i < cols; i++) {
        const u = -w / 2 + (w / cols) * (i + 0.5);
        put(1.3, 1.25, 0.04, 'glassTown', u, y0 + 0.9, d + 0.02);
        put(1.6, 0.08, 0.45, trim, u, y0 + 2.3, d + 0.24);
      }
    }
  }
  // a stair room on the terrace, sometimes a pergola
  if (detail && rng() < 0.3) {
    const [gx, gz] = at(w / 4, d * 0.65);
    for (const du of [-1, 1]) for (const dv of [-1, 1]) B.box(0.12, 2.2, 0.12, 'white', gx + du * 1.1, H + 0.4, gz + dv * 1.1, { ry });
    B.box(2.6, 0.12, 2.6, 'wood', gx, H + 2.6, gz, { ry });
  }
  if (floors > 1 && rng() < 0.75) {
    const [mx, mz] = at(-w / 4, d * 0.35);
    B.box(2.2, 2.4, 2.6, paint, mx, H + 0.4, mz, { ry });
  }
  if (detail && rng() < 0.25) {
    const [sx, sz] = at(w / 3, d * 0.25);
    B.add(new THREE.CircleGeometry(0.35, 14), 'white', sx, H + 1.9, sz, { ry: ry + Math.PI, rx: -0.5 });
  }
}

/** Simple far-away blocks so the city carries on to the horizon. */
function farTown(B, M, rng, count = 1400) {
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = 330 + Math.pow(rng(), 0.7) * 520;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const w = 7 + rng() * 9;
    const h = 3.5 + Math.floor(rng() * 4) * 3.1;
    const paint = M.townFar[Math.floor(rng() * M.townFar.length)];
    B.box(w, h, 7 + rng() * 9, paint, x, 0, z, { ry: rng() * 0.3 });
  }
}

export function buildTown(B, M, rng, P) {
  farTown(B, M, rng, P.farTown);
  const many = P.name === 'low' ? 0.5 : P.name === 'medium' ? 0.8 : 1;
  const { x0, x1, z0 } = CAMPUS;
  // shops and houses facing the main road
  for (let x = -330; x < 330; x += 8 + rng() * 5) {
    if (rng() > many) continue;
    house(B, M, rng, x, 65, 0, { shop: rng() < 0.55 });
  }
  // streets of houses behind, facing narrow lanes
  for (let p = 0; p < 3; p++) {
    const lane = 101 + p * 36;
    B.box(700, 0.04, 6, 'asphalt', 0, 0, lane);
    for (const side of [-1, 1]) {
      for (let x = -330; x < 330; x += 8 + rng() * 6) {
        if (rng() > 0.85 * many) continue;
        house(B, M, rng, x, lane + side * 4, side < 0 ? 1 : 0, { detail: p === 0 });
      }
    }
  }
  // left and right of the campus
  for (let z = z0 - 40; z < 40; z += 9 + rng() * 5) {
    for (let k = 0; k < 4; k++) {
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x0 - 12 - k * 16, z, 3, { detail: k < 1 });
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x1 + 12 + k * 16, z, 2, { detail: k < 1 });
    }
  }
  // behind the school
  for (let x = x0 - 60; x < x1 + 60; x += 9 + rng() * 6) {
    for (let k = 0; k < 4; k++) {
      if (rng() > 0.8 * many) continue;
      house(B, M, rng, x, z0 - 12 - k * 16, 1, { detail: k < 1 });
    }
  }
}
