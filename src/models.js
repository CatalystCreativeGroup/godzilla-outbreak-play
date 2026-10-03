// Loads the rigged Higgsfield characters, scales them to game size, and plays their animation clips.
// If a model can't load, a simple stand-in shape is used so the game still works.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ENV } from './engine.js';

const cloneSkinned = SkeletonUtils.clone || SkeletonUtils.SkeletonUtils?.clone;

/* name -> how tall it stands in the game (city blocks are 16 units wide). */
export const MODEL_SPECS = {
  joseph:   { file: 'joseph',   height: 2.3, fallback: 0x4f6b3a, maps: ['color', 'normal', 'orm'] },
  person:   { file: 'person',   height: 2.6, fallback: 0xff8a2a, maps: ['color', 'normal', 'orm'] },
  minion:   { file: 'minion',   height: 1.9, fallback: 0x7a4fb0, maps: ['color', 'normal', 'orm'] },
  godzilla: { file: 'godzilla', height: 8.5, fallback: 0x55704a, maps: ['color'] },
  kong:     { file: 'kong',     height: 12,  fallback: 0x2b2522, maps: ['color', 'normal', 'orm'] },
};

const loaded = {};
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

/* Textures live next to each model as plain .webp files (images packed inside a GLB don't load in every viewer). */
async function loadMaps(spec) {
  const maps = {};
  await Promise.all(spec.maps.map(async slot => {
    try {
      const t = await texLoader.loadAsync(`assets/models/${spec.file}_${slot}.webp`);
      t.flipY = false; // glTF texture convention
      if (slot === 'color') t.encoding = THREE.sRGBEncoding;
      maps[slot] = t;
    } catch (e) {
      console.warn(`texture ${spec.file}_${slot} failed to load`, e);
    }
  }));
  return maps;
}

function applyMaps(material, maps) {
  // Start as a plain, non-metallic surface so a missing map never turns a character into white chrome.
  material.metalness = 0;
  material.roughness = 0.8;
  if (maps.color) material.map = maps.color;
  if (maps.normal) material.normalMap = maps.normal;
  if (maps.orm) {
    material.roughnessMap = maps.orm; // glTF packs roughness in G, metalness in B
    material.metalnessMap = maps.orm;
    material.metalness = 1;
    material.roughness = 1;
  }
  material.needsUpdate = true;
}

function stripRootMotion(clip) {
  // Clips should play "in place": keep the hips bobbing up and down, but not sliding forward.
  for (const track of clip.tracks) {
    if (!/hips\.position$/i.test(track.name)) continue;
    const v = track.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

/* Bounds of what actually renders: skinned vertices (Meshy's armature scale makes the static box ~100x too small). */
function measureSkinned(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  let skinned = false;
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    skinned = true;
    o.skeleton.update();
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      o.boneTransform(i, v);
      box.expandByPoint(v.applyMatrix4(o.matrixWorld));
    }
  });
  return skinned ? box : new THREE.Box3().setFromObject(root);
}

function prepare(name, gltf, maps) {
  const spec = MODEL_SPECS[name];
  const src = gltf.scene;
  const box = measureSkinned(src);
  const h = box.max.y - box.min.y;
  const scale = h > 0 ? spec.height / h : 1;
  src.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false; // skinned bounds don't follow the animation
    if (o.material) { applyMaps(o.material, maps); o.material.envMapIntensity = ENV.characters; }
  });
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = stripRootMotion(c);
  return { scene: src, clips, scale, minY: box.min.y * scale };
}

export async function loadModels(onProgress) {
  const names = Object.keys(MODEL_SPECS);
  let done = 0;
  await Promise.all(names.map(async name => {
    const spec = MODEL_SPECS[name];
    try {
      const [gltf, maps] = await Promise.all([loader.loadAsync(`assets/models/${spec.file}.glb`), loadMaps(spec)]);
      loaded[name] = prepare(name, gltf, maps);
    } catch (err) {
      console.warn(`model ${name} failed to load, using a stand-in`, err);
    }
    onProgress?.(++done / names.length);
  }));
}

/* A stand-in figure (capsule body + head) for when a model is missing. */
function fallbackFigure(spec) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: spec.fallback, roughness: 0.7 });
  const r = spec.height * 0.18;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, spec.height * 0.45, 4, 10), mat);
  body.position.y = spec.height * 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 16, 12), mat);
  head.position.y = spec.height * 0.86;
  for (const m of [body, head]) { m.castShadow = true; g.add(m); }
  return g;
}

/* Plays named clips with smooth cross-fades. Works (silently) when there are no clips. */
class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    for (const [n, c] of Object.entries(clips)) this.actions[n] = this.mixer.clipAction(c);
    this.current = null;
    this.oneShotLeft = 0;
  }
  has(name) { return !!this.actions[name]; }
  play(name, { fade = 0.2, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.timeScale = speed;
    a.paused = false;
    if (this.current === a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.oneShotLeft = 0;
  }
  /* Play a clip once (e.g. a punch). Returns its length in seconds. */
  once(name, { fade = 0.12, speed = 1 } = {}) {
    const a = this.actions[name];
    if (!a) return 0;
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = speed;
    a.setEffectiveWeight(1).play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    this.oneShotLeft = a.getClip().duration / speed;
    return this.oneShotLeft;
  }
  busy() { return this.oneShotLeft > 0; }
  /* Freeze a clip on one pose (fraction 0..1 of its length). */
  hold(name, fraction, { fade = 0.2 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    if (this.current !== a) this.play(name, { fade });
    a.time = a.getClip().duration * fraction;
    a.paused = true;
  }
  update(dt) {
    if (this.oneShotLeft > 0) this.oneShotLeft -= dt;
    this.mixer.update(dt);
  }
}

/* A fresh copy of a character with its own materials (so it can be tinted or flash when hit). */
export function spawnModel(name, { tint = null, sizeMul = 1 } = {}) {
  const spec = MODEL_SPECS[name];
  const holder = new THREE.Group();
  const src = loaded[name];
  if (!src) {
    const fig = fallbackFigure(spec);
    fig.scale.setScalar(sizeMul);
    holder.add(fig);
    return { root: holder, anim: new Animator(fig, {}), materials: [fig.children[0].material], bones: {}, isFallback: true };
  }
  const inst = cloneSkinned(src.scene);
  const materials = [];
  const bones = {};
  inst.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    o.material = o.material.clone();
    if (tint !== null) o.material.color.multiply(new THREE.Color(tint));
    o.material.emissive = new THREE.Color(0x000000);
    materials.push(o.material);
  });
  const s = src.scale * sizeMul;
  inst.scale.multiplyScalar(s);
  inst.position.y = -src.minY * sizeMul;
  holder.add(inst);
  return { root: holder, anim: new Animator(inst, src.clips), materials, bones, isFallback: false };
}

/* Briefly light a character up (hit flash) or tint it (frozen). */
export function setGlow(model, hex, intensity = 1) {
  for (const m of model.materials) {
    m.emissive.setHex(hex);
    m.emissiveIntensity = intensity;
  }
}

/* Free a character's GPU memory (its bone texture and its own materials) when it leaves for good. */
export function disposeModel(model) {
  model.root.parent?.remove(model.root);
  model.root.traverse(o => {
    if (o.skeleton) o.skeleton.dispose();
    if (o.isMesh && o.material) o.material.dispose();
  });
}

/* Free a one-off group (cage, gun): its geometries and materials. */
export function disposeGroup(group) {
  group.parent?.remove(group);
  if (group.userData.sharedGeometry) return; // gun copies share one template
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m.userData.shared) m.dispose(); });
  });
}
