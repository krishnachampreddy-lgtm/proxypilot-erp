import * as THREE from 'three';

export const C = (hex) => new THREE.Color(hex);

/** Seeded random numbers, so the campus is laid out the same way every visit. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const lerp = THREE.MathUtils.lerp;
export const deg = THREE.MathUtils.degToRad;

export function canvasTexture(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A painted signboard (school name, library, class name plates). */
export function signTexture(text, { w = 1024, h = 160, bg = '#7a2a1d', fg = '#f5d77a', font = '600 92px Georgia, "Times New Roman", serif', border = true } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (border) {
      g.strokeStyle = fg;
      g.globalAlpha = 0.8;
      g.lineWidth = h * 0.05;
      g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
      g.globalAlpha = 1;
    }
    g.fillStyle = fg;
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowOffsetY = h * 0.03;
    g.shadowBlur = h * 0.04;
    g.fillText(text, w / 2, h / 2 + h * 0.03);
  });
}

export function glowTexture() {
  return canvasTexture(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.5)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}
