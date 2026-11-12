import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { N8AOPass } from 'n8ao';

/*
  Camera-like finishing:
  ambient occlusion (soft contact shadows under every ledge, sill and tree),
  gentle bloom on bright highlights, filmic tone mapping, a light lens vignette,
  fine film grain and anti-aliasing.
*/

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uWarm: { value: 0.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uWarm;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // slight S-curve and a touch of warmth, like a real camera profile
      c.rgb = mix(c.rgb, c.rgb * c.rgb * (3.0 - 2.0 * c.rgb), 0.18);
      c.rgb *= vec3(1.0 + uWarm * 0.06, 1.0 + uWarm * 0.01, 1.0 - uWarm * 0.07);
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * dot(d, d) * 1.6;
      c.rgb += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

export function createPost(renderer, scene, camera, P) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);

  // the scene is drawn either by the ambient-occlusion pass or by a plain render pass
  const plain = new RenderPass(scene, camera);
  let ao = null;
  if (P.ao) {
    ao = new N8AOPass(scene, camera, size.x, size.y);
    ao.configuration.aoRadius = 2.2;
    ao.configuration.distanceFalloff = 1.0;
    ao.configuration.intensity = 2.6;
    ao.configuration.color = new THREE.Color(0, 0, 0);
    ao.configuration.gammaCorrection = false;
    ao.configuration.halfRes = Boolean(P.aoHalf);
    ao.setQualityMode(P.ao);
    composer.addPass(ao);
    plain.enabled = false;
  }
  composer.addPass(plain);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.22, 0.55, 0.93);
  bloom.enabled = P.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  let fxaa = null;
  if (P.aa === 'smaa') composer.addPass(new SMAAPass(size.x, size.y));
  else {
    fxaa = new ShaderPass(FXAAShader);
    composer.addPass(fxaa);
  }
  const setFxaa = () => {
    const s = renderer.getDrawingBufferSize(new THREE.Vector2());
    fxaa?.material.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
  };
  setFxaa();

  return {
    composer,
    film,
    bloom,
    get hasAO() {
      return Boolean(ao && ao.enabled);
    },
    /** governor: switch the ambient occlusion off to save time */
    dropAO() {
      if (!ao || !ao.enabled) return false;
      ao.enabled = false;
      plain.enabled = true;
      return true;
    },
    dropBloom() {
      if (!bloom.enabled) return false;
      bloom.enabled = false;
      return true;
    },
    setSize(w, h) {
      // the composer keeps its own pixel ratio: follow the renderer's, or lowering
      // the resolution would only shrink the canvas while the scene still renders full size
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const s = renderer.getDrawingBufferSize(new THREE.Vector2());
      ao?.setSize(s.x, s.y);
      setFxaa();
    },
    render(t, warm) {
      film.uniforms.uTime.value = t % 100;
      film.uniforms.uWarm.value = warm;
      composer.render();
    },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
