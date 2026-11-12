import * as THREE from 'three';

/*
  Physically based materials for the campus.
  Every textured material carries `userData.uvScale` (metres covered by one copy of the
  texture); the geometry batcher uses it to give boxes real-world texture density.
  Plaster and concrete get a weathering pass: rain streaks, damp near the ground and
  large-scale colour drift so nothing looks freshly rendered.
*/

function weather(mat, grime, { amount = 1, ground = 1 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrime = { value: grime };
    shader.uniforms.uGrimeAmt = { value: amount };
    shader.uniforms.uGround = { value: ground };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wpTmp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpTmp = instanceMatrix * wpTmp;
        #endif
        vWPos = (modelMatrix * wpTmp).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uGrime;\nuniform float uGrimeAmt;\nuniform float uGround;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float along = vWPos.x + vWPos.z;
          float streak = texture2D(uGrime, vec2(along * 0.09, vWPos.y * 0.035)).r;
          float blot = texture2D(uGrime, vec2(along * 0.013, vWPos.y * 0.011 + 0.37)).g;
          float damp = (1.0 - smoothstep(0.0, 0.9, vWPos.y)) * uGround;
          float g = smoothstep(0.5, 0.95, streak) * 0.34 + damp * 0.34;
          diffuseColor.rgb *= (1.0 - clamp(g * uGrimeAmt, 0.0, 0.6)) * (0.88 + 0.22 * blot);
        }`
      );
  };
  mat.customProgramCacheKey = () => 'weather' + amount + ground;
  return mat;
}

export function createMaterials(L, { quality = 'high' } = {}) {
  const grime = L.tex('grime.jpg', { srgb: false });
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const textured = (color, normal, uvScale, extra = {}) => {
    const m = std({ map: color ? L.tex(color) : null, normalMap: normal ? L.tex(normal, { srgb: false }) : null, roughness: 0.92, ...extra });
    m.userData.uvScale = uvScale;
    return m;
  };

  const plaster = (tint, opts) =>
    weather(textured('plaster_color.jpg', 'plaster_normal.jpg', 2.4, { color: tint, normalScale: new THREE.Vector2(0.45, 0.45) }), grime, opts);

  const M = {
    // walls and trims (cream walls with maroon bands: a classic Indian school)
    // ivory plaster with red sandstone bands, plinth and trim (the Lutyens palette of India's grand buildings)
    wall: plaster('#f1e7d2', { amount: 0.35, ground: 0.45 }),
    wallShade: plaster('#e9dcc1', { amount: 0.35, ground: 0.45 }),
    maroon: weather(textured('concrete_color.jpg', 'concrete_normal.jpg', 1.6, { color: '#c46a4c', roughness: 0.82, normalScale: new THREE.Vector2(0.5, 0.5) }), grime, { amount: 0.35, ground: 0.6 }),
    white: plaster('#f7f3ea', { amount: 0.3, ground: 0.3 }),
    plinth: weather(textured('concrete_color.jpg', 'concrete_normal.jpg', 2.0, { color: '#a9583f', roughness: 0.85 }), grime, { amount: 0.5, ground: 0.8 }),
    roof: weather(textured('concrete_color.jpg', 'concrete_normal.jpg', 4, { color: '#bdb6aa' }), grime, { amount: 0.8, ground: 0 }),
    concrete: weather(textured('concrete_color.jpg', 'concrete_normal.jpg', 3, { color: '#c9c3b8' }), grime, { amount: 0.6, ground: 0.4 }),
    tiles: textured('tiles_color.jpg', 'tiles_normal.jpg', 1.2, { roughness: 0.55 }),
    pavers: textured('pavers_color.jpg', 'pavers_normal.jpg', 2.2, { roughness: 0.85 }),
    asphalt: textured('asphalt_color.jpg', 'asphalt_normal.jpg', 3.5, { roughness: 0.88, normalScale: new THREE.Vector2(0.8, 0.8) }),
    track: textured('track_color.jpg', 'track_normal.jpg', 2.5, { roughness: 0.82 }),
    court: textured(null, 'concrete_normal.jpg', 3, { color: '#2e5b84', roughness: 0.6, normalScale: new THREE.Vector2(0.3, 0.3) }),
    courtOut: textured(null, 'concrete_normal.jpg', 3, { color: '#3d7a52', roughness: 0.62, normalScale: new THREE.Vector2(0.3, 0.3) }),
    brick: textured('brick_color.jpg', 'brick_bump.jpg', 1.6, { roughnessMap: L.tex('brick_rough.jpg', { srgb: false }), color: '#d9b8a6' }),
    rooftiles: textured('rooftiles_color.jpg', 'rooftiles_normal.jpg', 2.4, { roughness: 0.8 }),
    wood: textured('wood_color.jpg', null, 1.6, { color: '#8a5a3c', roughness: 0.7 }),
    // inside the rooms
    floorIn: textured('tiles_color.jpg', 'tiles_normal.jpg', 1.6, { color: '#f1eee8', roughness: 0.3, normalScale: new THREE.Vector2(0.5, 0.5) }),
    // the furniture of a well-kept school: light oak desks, walnut panelling and cabinets
    oak: textured('wood_color.jpg', null, 1.2, { color: '#ecd3a8', roughness: 0.42 }),
    walnut: textured('wood_color.jpg', null, 1.4, { color: '#7a5034', roughness: 0.48 }),
    kota: textured('concrete_color.jpg', 'concrete_normal.jpg', 1.4, { color: '#9aa093', roughness: 0.5 }),
    deskWood: textured('wood_color.jpg', null, 1.1, { color: '#c08a55', roughness: 0.5 }),
    doorWood: new THREE.MeshStandardMaterial({ map: L.tex('wood_color.jpg'), color: '#7a4a2c', roughness: 0.6 }),
    dirt: textured('dirt_color.jpg', 'dirt_normal.jpg', 4, { roughness: 1 }),

    // painted metal, plastic and glass
    // window frames, railings and gates: dark bronze
    green: std({ color: '#2b2a27', roughness: 0.4, metalness: 0.55 }),
    blueRail: std({ color: '#2c4f7a', roughness: 0.45, metalness: 0.35 }),
    steel: std({ color: '#9aa0a6', roughness: 0.35, metalness: 0.85 }),
    darkMetal: std({ color: '#33373b', roughness: 0.5, metalness: 0.6 }),
    tank: std({ color: '#151617', roughness: 0.55 }),
    solar: textured('solar.jpg', null, 1, { roughness: 0.18, metalness: 0.4 }),
    line: std({ color: '#f1f0ea', roughness: 0.7 }),
    yellowLine: std({ color: '#e8b32a', roughness: 0.7 }),
    kerbBlack: std({ color: '#222222', roughness: 0.8 }),
    kerbYellow: std({ color: '#e6b422', roughness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#2b3a40', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.6, ior: 1.5, specularIntensity: 1 }),
    // clear window glass: you can see into the rooms (a faint sky reflection on top)
    glassClear: new THREE.MeshStandardMaterial({ color: '#b7cdd2', roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 1.8, depthWrite: false }),
    glassTown: new THREE.MeshPhysicalMaterial({ color: '#39464b', roughness: 0.12, metalness: 0.15, envMapIntensity: 1.2 }),
    interior: std({ color: '#3a342b', roughness: 1, emissive: '#ffcf8a', emissiveIntensity: 0 }),
    board: std({ color: '#203b2f', roughness: 0.85 }),
    gold: std({ color: '#c9a24a', roughness: 0.3, metalness: 1 }),
    rubber: std({ color: '#141414', roughness: 0.9 }),
    lampOff: std({ color: '#d8d6cc', roughness: 0.3, emissive: '#ffd59a', emissiveIntensity: 0 }),
    pot: std({ color: '#a4532f', roughness: 0.9 }),
    shrub: std({ color: '#3d6b2e', roughness: 0.9 }),
    fabricBlue: std({ color: '#2b4f8c', roughness: 0.9, side: THREE.DoubleSide }),
    shutter: std({ color: '#8b9196', roughness: 0.55, metalness: 0.6 }),
    chairShell: std({ color: '#203a66', roughness: 0.45 }),
    chrome: std({ color: '#cfd4d8', roughness: 0.2, metalness: 0.95 }),
    whiteMetal: std({ color: '#efede7', roughness: 0.38, metalness: 0.25 }),
    charcoal: std({ color: '#2a2d31', roughness: 0.45, metalness: 0.4 }),
    locker: std({ color: '#24467a', roughness: 0.4, metalness: 0.3 }),
    lockerB: std({ color: '#7a2433', roughness: 0.4, metalness: 0.3 }),
    blind: std({ color: '#e9e1cf', roughness: 0.92 }),
    aluminium: std({ color: '#b9bdc1', roughness: 0.28, metalness: 0.9 }),
    bezel: std({ color: '#121417', roughness: 0.22, metalness: 0.3 }),
    mesh: std({ color: '#1e2024', roughness: 0.75 }),
    sofa: std({ color: '#6b2a2f', roughness: 0.85 }),
    carpet: std({ color: '#5b2f2c', roughness: 0.95 }),
  };

  // town houses: a handful of real paint colours, all weathered
  // the neighbourhood round an old school of standing: quiet villas in whites, creams, stone and soft terracotta
  M.town = ['#f3eee4', '#ece3d3', '#e2d8c6', '#f1e8d8', '#d8cdbb', '#f6f2ea', '#e7dbc6', '#cfc1ad', '#ebe4d8', '#d9cbb6', '#e9d3bf', '#dccfbd', '#e6d9c4', '#d2a88c'].map((c) =>
    weather(textured('plaster_color.jpg', 'plaster_normal.jpg', 2.4, { color: c, normalScale: new THREE.Vector2(0.4, 0.4) }), grime, { amount: 0.55 })
  );

  // far-away houses: windows are drawn by the shader (and light up in the evening)
  const nightU = { value: 0 };
  M.night = nightU;
  M.townFar = M.town.map((src) => {
    const m = new THREE.MeshStandardMaterial({ color: src.color, roughness: 0.9 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = nightU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;\nuniform float uNight;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float isWall = 1.0 - step(0.5, abs(vWN.y));
          vec2 f = vec2((abs(vWN.x) > 0.5 ? vWPos.z : vWPos.x) / 2.8, (vWPos.y - 0.4) / 3.1);
          vec2 c = fract(f);
          float win = step(0.28, c.x) * step(c.x, 0.74) * step(0.32, c.y) * step(c.y, 0.78) * step(0.9, vWPos.y) * isWall;
          float lit = step(0.55, fract(sin(dot(floor(f), vec2(12.9898, 78.233))) * 43758.5453));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.085, 0.1), win);`
        )
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.4) * win * lit * uNight * 1.4;'
        );
    };
    m.customProgramCacheKey = () => 'townFar';
    return m;
  });

  M.glassClearLit = M.glassClear.clone();
  M.glassClearLit.emissive = new THREE.Color('#ffd9a0');
  M.glassClearLit.emissiveIntensity = 0;

  const anis = quality === 'low' ? 4 : 8;
  Object.values(M)
    .flat()
    .forEach((m) => {
      for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k]) m[k].anisotropy = anis;
    });
  return M;
}
