import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = '/campus/';

/**
 * Loads every file through three.js's shared loading manager (the tree library uses it too),
 * so the page can show real progress and wait until everything has arrived.
 */
export function createLoader(onProgress) {
  const manager = THREE.DefaultLoadingManager;
  let loaded = 0;
  let total = 0;
  let waiters = [];
  const settle = () => {
    if (total > 0 && loaded >= total) {
      waiters.forEach((w) => w());
      waiters = [];
    }
  };
  manager.onStart = (_u, l, t) => {
    loaded = l;
    total = t;
  };
  manager.onProgress = (_u, l, t) => {
    loaded = l;
    total = t;
    onProgress?.(l / Math.max(t, 1));
    settle();
  };
  manager.onLoad = settle;
  manager.onError = (url) => console.warn('[campus] could not load', url);

  const textures = new THREE.TextureLoader(manager);
  const gltf = new GLTFLoader(manager);
  const cache = new Map();

  const tex = (file, { srgb = true } = {}) => {
    const key = file + srgb;
    if (cache.has(key)) return cache.get(key);
    const t = textures.load(BASE + 'tex/' + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(key, t);
    return t;
  };

  const model = (file) => gltf.loadAsync(BASE + 'models/' + file);

  /** resolves once everything queued so far has finished loading */
  const done = () =>
    new Promise((resolve) => {
      if (total > 0 && loaded >= total) return resolve();
      waiters.push(resolve);
    });

  return { tex, model, done };
}
