import * as THREE from 'three';

const birchAo = '/campus/eztree/bark/birch_ao_1k.jpg';
const birchColor = '/campus/eztree/bark/birch_color_1k.jpg';
const birchNormal = '/campus/eztree/bark/birch_normal_1k.jpg';
const birchRoughness = '/campus/eztree/bark/birch_roughness_1k.jpg';

const oakAo = '/campus/eztree/bark/oak_ao_1k.jpg';
const oakColor = '/campus/eztree/bark/oak_color_1k.jpg';
const oakNormal = '/campus/eztree/bark/oak_normal_1k.jpg';
const oakRoughness = '/campus/eztree/bark/oak_roughness_1k.jpg';

const pineAo = '/campus/eztree/bark/pine_ao_1k.jpg';
const pineColor = '/campus/eztree/bark/pine_color_1k.jpg';
const pineNormal = '/campus/eztree/bark/pine_normal_1k.jpg';
const pineRoughness = '/campus/eztree/bark/pine_roughness_1k.jpg';

const willowAo = '/campus/eztree/bark/willow_ao_1k.jpg';
const willowColor = '/campus/eztree/bark/willow_color_1k.jpg';
const willowNormal = '/campus/eztree/bark/willow_normal_1k.jpg';
const willowRoughness = '/campus/eztree/bark/willow_roughness_1k.jpg';

const ashLeaves = '/campus/eztree/leaves/ash_color.png';
const aspenLeaves = '/campus/eztree/leaves/aspen_color.png';
const oakLeaves = '/campus/eztree/leaves/oak_color.png';
const pineLeaves = '/campus/eztree/leaves/pine_color.png';

const textureLoader = new THREE.TextureLoader();

/**
 * Gets a bark texture for the specified bark type
 * @param {string} barkType 
 * @param {'ao' | 'color' | 'normal' | 'roughness'} fileType 
 * @param {THREE.Vector2} scale 
 * @returns 
 */
export function getBarkTexture(barkType, fileType, scale = { x: 1, y: 1 }) {
  const texture = textures.bark[barkType][fileType]();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.x = scale.x;
  texture.repeat.y = 1 / scale.y;
  return texture;
}

/**
 * Gets the leaf texture for the specified leaf type
 * @param {string} leafType 
 * @returns 
 */
export function getLeafTexture(leafType) {
  return textures.leaves[leafType]();
}

/**
 * 
 * @param {string} url Path to texture
 * @param {THREE.Vector2} scale Scale of the texture repeat
 * @param {boolean} srgb Set to true to set texture color space to SRGB
 * @returns {THREE.Texture}
 */
const loadTexture = (url, srgb = true) => {
  const texture = textureLoader.load(url);
  texture.premultiplyAlpha = true;
  if (srgb) {
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  return texture;
};

// ProxyPilot: load each texture only when a tree actually uses it (saves ~2 MB)
const lazy = (url, srgb = true) => {
  let t = null;
  return () => (t ||= loadTexture(url, srgb));
};
const bark = (ao, color, normal, roughness) => ({
  ao: lazy(ao, false),
  color: lazy(color),
  normal: lazy(normal, false),
  roughness: lazy(roughness, false),
});
const textures = {
  bark: {
    birch: bark(birchAo, birchColor, birchNormal, birchRoughness),
    oak: bark(oakAo, oakColor, oakNormal, oakRoughness),
    pine: bark(pineAo, pineColor, pineNormal, pineRoughness),
    willow: bark(willowAo, willowColor, willowNormal, willowRoughness),
  },
  leaves: {
    ash: lazy(ashLeaves),
    aspen: lazy(aspenLeaves),
    oak: lazy(oakLeaves),
    pine: lazy(pineLeaves),
  },
};
