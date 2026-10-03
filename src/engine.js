// Renderer, scene, sky, image-based lighting and the sun. Tuned to stay smooth on an iPad.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const isTouch = matchMedia('(pointer: coarse)').matches;
export const QUALITY = {
  pixelRatio: Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5),
  shadowMap: isTouch ? 1024 : 2048,
  shadowBox: 46,
};

export const canvas = document.getElementById('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(QUALITY.pixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const scene = new THREE.Scene();
/* The sky's reflected light is very bright; most surfaces only take part of it so colors stay rich. */
export const ENV = { characters: 0.4, city: 0.45, glass: 1.0, guns: 0.55 };
export const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);

// Sky dome (Preetham model) and a matching environment map for reflections.
const sky = new Sky();
sky.scale.setScalar(4000);
sky.frustumCulled = false;
scene.add(sky);
const skyScene = new THREE.Scene();
const skyForEnv = new Sky();
skyForEnv.scale.setScalar(4000);
skyScene.add(skyForEnv);
const pmrem = new THREE.PMREMGenerator(renderer);
let envTarget = null;

export const hemi = new THREE.HemisphereLight(0xdfefff, 0x5b5348, 0.35);
export const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, {
  left: -QUALITY.shadowBox, right: QUALITY.shadowBox, top: QUALITY.shadowBox, bottom: -QUALITY.shadowBox, near: 1, far: 220,
});
scene.add(hemi, sun, sun.target);

const sunDir = new THREE.Vector3();

/* Lighting moods for each city. elevation/azimuth in degrees. */
export const THEMES = {
  day:     { elevation: 48, azimuth: 150, turbidity: 6,  rayleigh: 1.4, mie: 0.004, sun: 0xfff1dc, sunI: 1.9, hemiSky: 0xdfefff, hemiGround: 0x5b5348, hemiI: 0.35, fog: 0xbfd3e6, fogD: 0.0042, exposure: 0.82 },
  golden:  { elevation: 16, azimuth: 120, turbidity: 9,  rayleigh: 2.4, mie: 0.008, sun: 0xffc98a, sunI: 2.4, hemiSky: 0xffe2c2, hemiGround: 0x4f4034, hemiI: 0.3,  fog: 0xe8c39e, fogD: 0.0052, exposure: 0.8 },
  harbor:  { elevation: 30, azimuth: 200, turbidity: 12, rayleigh: 1.0, mie: 0.01,  sun: 0xeaf2ff, sunI: 1.7, hemiSky: 0xcfdcea, hemiGround: 0x46505a, hemiI: 0.45, fog: 0xaebccb, fogD: 0.0062, exposure: 0.8 },
  volcano: { elevation: 7,  azimuth: 100, turbidity: 18, rayleigh: 3.6, mie: 0.02,  sun: 0xff8a4a, sunI: 2.2, hemiSky: 0xff9a6a, hemiGround: 0x2a1610, hemiI: 0.35, fog: 0x7a4030, fogD: 0.0085, exposure: 0.85 },
  night:   { elevation: 3,  azimuth: 260, turbidity: 3,  rayleigh: 0.4, mie: 0.004, sun: 0x9fb4ff, sunI: 0.9, hemiSky: 0x3a4a7a, hemiGround: 0x15161c, hemiI: 0.6,  fog: 0x161c2c, fogD: 0.0065, exposure: 1.05 },
  storm:   { elevation: 10, azimuth: 250, turbidity: 20, rayleigh: 0.6, mie: 0.03,  sun: 0xc9b8ff, sunI: 1.6, hemiSky: 0x9a8fc0, hemiGround: 0x241f2c, hemiI: 0.5,  fog: 0x4c4660, fogD: 0.0075, exposure: 0.9 },
};

export function applyTheme(name) {
  const t = THEMES[name] || THEMES.day;
  const phi = THREE.MathUtils.degToRad(90 - t.elevation);
  const theta = THREE.MathUtils.degToRad(t.azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  for (const s of [sky, skyForEnv]) {
    const u = s.material.uniforms;
    u.turbidity.value = t.turbidity;
    u.rayleigh.value = t.rayleigh;
    u.mieCoefficient.value = t.mie;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDir);
  }
  sun.color.setHex(t.sun); sun.intensity = t.sunI;
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
  scene.fog = new THREE.FogExp2(t.fog, t.fogD);
  renderer.toneMappingExposure = t.exposure;
  if (envTarget) envTarget.dispose();
  envTarget = pmrem.fromScene(skyScene, 0.02);
  scene.environment = envTarget.texture;
  return t;
}

/* Keep the sun's shadow box centred on the action. */
export function followSun(focus) {
  sun.position.set(focus.x + sunDir.x * 90, Math.max(30, sunDir.y * 90), focus.z + sunDir.z * 90);
  sun.target.position.set(focus.x, 0, focus.z);
}

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
