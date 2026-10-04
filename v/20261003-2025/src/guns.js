// Detailed 3D gun models (built from shapes, PBR metal and polymer). Each points down +Z with the grip at the origin,
// and has a "muzzle" marker where bullets come out.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { spawnModel, hasModel, MODEL_SPECS } from './models.js';

const shared = m => { m.userData.shared = true; return m; };
const MAT = {
  steel:   shared(new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.38, metalness: 0.85, envMapIntensity: 0.55 })),
  dark:    shared(new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.55, metalness: 0.6, envMapIntensity: 0.5 })),
  polymer: shared(new THREE.MeshStandardMaterial({ color: 0x141517, roughness: 0.8, metalness: 0.05, envMapIntensity: 0.4 })),
  tan:     shared(new THREE.MeshStandardMaterial({ color: 0x6e6047, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.4 })),
  olive:   shared(new THREE.MeshStandardMaterial({ color: 0x3a4027, roughness: 0.75, metalness: 0.15, envMapIntensity: 0.45 })),
  wood:    shared(new THREE.MeshStandardMaterial({ color: 0x55301a, roughness: 0.6, metalness: 0.0, envMapIntensity: 0.45 })),
  white:   shared(new THREE.MeshStandardMaterial({ color: 0xc8d0d6, roughness: 0.4, metalness: 0.3, envMapIntensity: 0.5 })),
  glass:   shared(new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.9 })),
  red:     shared(new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5, metalness: 0.2 })),
};
const glowCache = {};
function glow(color) {
  if (!glowCache[color]) glowCache[color] = shared(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2, roughness: 0.3, toneMapped: false }));
  return glowCache[color];
}

const box = (w, h, d, r = 0.012) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const tube = (r1, r2, len, seg = 16) => new THREE.CylinderGeometry(r1, r2, len, seg).rotateX(Math.PI / 2);

function add(g, geo, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.x = rx;
  m.castShadow = true;
  g.add(m);
  return m;
}
function muzzle(g, z, y = 0.05) {
  const o = new THREE.Object3D();
  o.name = 'muzzle';
  o.position.set(0, y, z);
  g.add(o);
}
function rail(g, z0, z1, y) {
  for (let z = z0; z <= z1; z += 0.035) add(g, box(0.05, 0.012, 0.018, 0.003), MAT.dark, 0, y, z);
}

const BUILDERS = {
  blaster(g) { // compact sci-fi sidearm
    add(g, box(0.07, 0.16, 0.1), MAT.polymer, 0, -0.07, -0.01, 0.25);          // grip
    add(g, box(0.075, 0.07, 0.34), MAT.polymer, 0, 0.03, 0.08);                 // frame
    add(g, box(0.07, 0.06, 0.32), MAT.steel, 0, 0.085, 0.09);                   // slide
    for (let i = 0; i < 5; i++) add(g, box(0.072, 0.045, 0.008, 0.002), MAT.dark, 0, 0.085, -0.03 + i * 0.016); // serrations
    add(g, tube(0.018, 0.018, 0.08), MAT.dark, 0, 0.07, 0.27);                  // barrel tip
    add(g, box(0.02, 0.03, 0.12), glow(0x6ff6ff), 0.037, 0.03, 0.1);           // energy cell
    add(g, box(0.014, 0.022, 0.014), MAT.dark, 0, 0.125, 0.22);                 // front sight
    add(g, box(0.05, 0.03, 0.06), MAT.steel, 0, -0.02, 0.06);                   // trigger guard
    muzzle(g, 0.32, 0.07);
  },
  rifle(g) { // assault rifle with red-dot sight
    add(g, box(0.06, 0.15, 0.08), MAT.polymer, 0, -0.08, -0.02, 0.3);           // pistol grip
    add(g, box(0.07, 0.1, 0.36), MAT.steel, 0, 0.02, 0.08);                     // receiver
    add(g, box(0.075, 0.085, 0.3), MAT.tan, 0, 0.02, 0.38);                     // handguard
    for (let i = 0; i < 6; i++) add(g, box(0.078, 0.01, 0.03, 0.003), MAT.dark, 0, 0.065, 0.26 + i * 0.045);
    add(g, tube(0.014, 0.014, 0.28), MAT.dark, 0, 0.03, 0.66);                  // barrel
    add(g, tube(0.024, 0.024, 0.07), MAT.steel, 0, 0.03, 0.82);                 // muzzle brake
    add(g, box(0.05, 0.2, 0.08), MAT.dark, 0, -0.1, 0.16, -0.25);               // curved magazine
    add(g, box(0.05, 0.08, 0.2), MAT.tan, 0, 0.0, -0.22);                       // stock
    add(g, box(0.055, 0.12, 0.04), MAT.polymer, 0, -0.02, -0.33);               // butt pad
    rail(g, -0.04, 0.24, 0.08);
    add(g, tube(0.028, 0.028, 0.1), MAT.dark, 0, 0.125, 0.1);                   // red-dot body
    add(g, new THREE.CircleGeometry(0.022, 16), MAT.glass, 0, 0.125, 0.152);
    add(g, new THREE.SphereGeometry(0.004, 6, 4), glow(0xff2a1a), 0, 0.125, 0.15);
    add(g, box(0.02, 0.03, 0.02), MAT.dark, 0, 0.07, 0.5);                      // front sight post
    muzzle(g, 0.86, 0.03);
  },
  shotgun(g) { // pump-action with wood furniture
    add(g, box(0.06, 0.14, 0.08), MAT.wood, 0, -0.07, -0.02, 0.35);
    add(g, box(0.07, 0.09, 0.3), MAT.steel, 0, 0.02, 0.1);
    add(g, tube(0.022, 0.022, 0.62), MAT.dark, 0, 0.045, 0.55);                 // barrel
    add(g, tube(0.018, 0.018, 0.5), MAT.steel, 0, -0.005, 0.5);                 // mag tube
    const pump = add(g, box(0.07, 0.07, 0.18, 0.02), MAT.wood, 0, 0.0, 0.42);   // pump fore-end
    for (let i = 0; i < 5; i++) add(g, box(0.072, 0.072, 0.008, 0.003), MAT.dark, 0, 0.0, 0.36 + i * 0.03);
    pump.name = 'pump';
    add(g, box(0.055, 0.1, 0.26), MAT.wood, 0, -0.01, -0.2);                    // stock
    add(g, new THREE.SphereGeometry(0.007, 8, 6), glow(0xfff2a0), 0, 0.072, 0.84); // bead sight
    muzzle(g, 0.87, 0.045);
  },
  bazooka(g) { // shoulder rocket launcher
    add(g, tube(0.085, 0.085, 1.1, 20), MAT.olive, 0, 0.12, 0.2);
    for (const z of [-0.2, 0.25, 0.68]) add(g, tube(0.092, 0.092, 0.04, 20), MAT.dark, 0, 0.12, z);
    add(g, tube(0.085, 0.12, 0.16, 20), MAT.dark, 0, 0.12, -0.42);              // rear flare
    add(g, new THREE.ConeGeometry(0.06, 0.16, 16).rotateX(Math.PI / 2), MAT.red, 0, 0.12, 0.82); // rocket tip
    add(g, box(0.05, 0.13, 0.07), MAT.polymer, 0, -0.03, 0.0, 0.2);             // grip
    add(g, box(0.05, 0.12, 0.06), MAT.polymer, 0, -0.01, 0.32);                 // front grip
    add(g, box(0.06, 0.07, 0.12), MAT.dark, -0.1, 0.18, 0.12);                  // optic
    add(g, new THREE.CircleGeometry(0.025, 14), MAT.glass, -0.1, 0.18, 0.181);
    muzzle(g, 0.9, 0.12);
  },
  lightning(g) { // tesla gun
    add(g, box(0.07, 0.15, 0.09), MAT.polymer, 0, -0.08, -0.02, 0.3);
    add(g, box(0.1, 0.12, 0.34, 0.03), MAT.steel, 0, 0.03, 0.1);
    add(g, tube(0.05, 0.05, 0.16), MAT.glass, 0, 0.13, 0.0);                    // capacitor glass
    add(g, tube(0.03, 0.03, 0.15), glow(0xb8a8ff), 0, 0.13, 0.0);
    for (let i = 0; i < 4; i++) add(g, new THREE.TorusGeometry(0.055 - i * 0.006, 0.01, 8, 20), glow(0xb8a8ff), 0, 0.04, 0.3 + i * 0.06);
    for (const x of [-0.035, 0.035]) add(g, tube(0.008, 0.004, 0.22), MAT.steel, x, 0.04, 0.42);
    add(g, new THREE.SphereGeometry(0.022, 12, 8), glow(0xe0d8ff), 0, 0.04, 0.55);
    muzzle(g, 0.56, 0.04);
  },
  freeze(g) { // cryo blaster
    add(g, box(0.07, 0.15, 0.09), MAT.polymer, 0, -0.08, -0.02, 0.3);
    add(g, box(0.09, 0.11, 0.38, 0.03), MAT.white, 0, 0.03, 0.12);
    add(g, new THREE.CylinderGeometry(0.045, 0.045, 0.22, 16), MAT.glass, 0, 0.14, 0.05).rotation.z = Math.PI / 2;
    add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.2, 16), glow(0x7fe0ff), 0, 0.14, 0.05).rotation.z = Math.PI / 2;
    add(g, new THREE.ConeGeometry(0.05, 0.14, 16).rotateX(-Math.PI / 2), MAT.steel, 0, 0.03, 0.38);
    for (let i = 0; i < 4; i++) add(g, box(0.11, 0.008, 0.02, 0.003), MAT.steel, 0, 0.03 + (i - 1.5) * 0.025, 0.24);
    add(g, tube(0.016, 0.016, 0.04), glow(0xaef4ff), 0, 0.03, 0.45);
    muzzle(g, 0.48, 0.03);
  },
};

/* Bake all parts that share a material into one mesh: ~4 draw calls per gun instead of ~25 (matters with a big army). */
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const groups = new Map();
  for (const m of g.children.filter(c => c.isMesh)) {
    let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    geo.applyMatrix4(m.matrix);
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(geo);
    g.remove(m);
  }
  for (const [mat, geos] of groups) {
    const merged = new THREE.Mesh(mergeBufferGeometries(geos), mat);
    merged.castShadow = true;
    g.add(merged);
    geos.forEach(x => x.dispose());
  }
}

/* The realistic Higgsfield gun model when it's loaded (muzzle at the front, +Z). */
function modelGun(id, scale) {
  const name = 'gun_' + id;
  const m = spawnModel(name);
  const g = new THREE.Group();
  g.add(m.root);
  const muzzleMark = new THREE.Object3D();
  muzzleMark.name = 'muzzle';
  muzzleMark.position.set(0, 0.02, MODEL_SPECS[name].length / 2);
  g.add(muzzleMark);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material.envMapIntensity = 0.6; } });
  g.userData.sharedGeometry = true;
  g.scale.setScalar(scale);
  return g;
}

const templates = {};
export function makeGun(id, scale = 1) {
  if (hasModel('gun_' + id)) return modelGun(id, scale);
  const key = BUILDERS[id] ? id : 'blaster';
  if (!templates[key]) {
    const t = new THREE.Group();
    BUILDERS[key](t);
    mergeByMaterial(t);
    templates[key] = t;
  }
  const g = templates[key].clone(); // clones share geometry and materials
  g.userData.sharedGeometry = true;
  g.scale.setScalar(scale);
  return g;
}

export function gunMuzzle(gun, target) {
  const m = gun.getObjectByName('muzzle');
  return m ? m.getWorldPosition(target) : gun.getWorldPosition(target);
}
