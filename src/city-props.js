// Street furniture and scenery: trees, parked cars, street lights, harbor water, the volcano and lava.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, texRepeat, waterNormal } from './textures.js';
import { ember, smoke } from './fx.js';
import { sun, hemi } from './engine.js';
import { V3, rnd, pick, P, world } from './world.js';

const ROAD_GAP = 24, PARK = 20;
let water = null, lavaMats = [], themeName = 'day', stormT = 4, baseSunI = 2, baseHemiI = 0.4;

/* ---------- trees: two crossed photo cut-outs ---------- */
const treeGeo = (() => {
  const a = new THREE.PlaneGeometry(4.4, 6.4); a.translate(0, 3.2, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  return mergeBufferGeometries([a, b]);
})();
function treeMaterial(theme) {
  return new THREE.MeshStandardMaterial({
    map: tex('tree'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9,
    color: theme === 'volcano' ? 0x5a4636 : theme === 'storm' ? 0x8a9a80 : 0xffffff,
  });
}

/* ---------- cars: rounded body + glass cabin + wheels in one mesh ---------- */
const carGeo = (() => {
  const body = new RoundedBoxGeometry(2, 0.9, 4.3, 3, 0.3); body.translate(0, 0.75, 0);
  const cabin = new RoundedBoxGeometry(1.75, 0.75, 2.2, 3, 0.25); cabin.translate(0, 1.5, -0.25);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 14); w.rotateZ(Math.PI / 2); w.translate(x, 0.42, z); wheels.push(w);
  }
  const flat = g => (g.index ? g.toNonIndexed() : g);
  return mergeBufferGeometries([flat(body), flat(cabin), mergeBufferGeometries(wheels.map(flat))], true);
})();
const CAR_COLORS = [0xa31621, 0x1d4f91, 0xd9d9d6, 0x1b1b1d, 0x5c6b73, 0xb88a2c, 0x2f5233];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.05, metalness: 0.9 });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });

/* ---------- street lights ---------- */
const lampGeo = (() => {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 8); pole.translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(0.14, 0.14, 2.2); arm.translate(0, 6.9, 1.0);
  const head = new THREE.BoxGeometry(0.5, 0.2, 0.9); head.translate(0, 6.8, 2.0);
  return mergeBufferGeometries([pole, arm, head]);
})();

function scatterTrees(group, theme, campSites) {
  const spots = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; spots.push([Math.cos(a) * 16.5, Math.sin(a) * 16.5, rnd(0.6, 0.8)]); }
  for (let i = 0; i < 70; i++) {
    const side = Math.floor(Math.random() * 4), t = rnd(-130, 130), off = rnd(108, 150);
    spots.push([[t, -off], [t, off], [-off, t], [off, t]][side].concat(rnd(1.1, 1.9)));
  }
  // a few trees along sidewalks
  for (let i = 0; i < 40; i++) {
    const r = Math.floor(rnd(-4, 4)) * ROAD_GAP + (Math.random() < 0.5 ? 4.6 : -4.6), t = rnd(-92, 92);
    const p = Math.random() < 0.5 ? [r, t] : [t, r];
    if (Math.abs(p[0]) < PARK + 4 && Math.abs(p[1]) < PARK + 4) continue;
    if (campSites.some(s => Math.abs(s.x - p[0]) < 10 && Math.abs(s.z - p[1]) < 10)) continue;
    spots.push(p.concat(rnd(0.7, 0.95)));
  }
  if (theme === 'harbor') for (let i = spots.length - 1; i >= 0; i--) if (spots[i][1] > 104) spots.splice(i, 1);
  const trees = new THREE.InstancedMesh(treeGeo, treeMaterial(theme), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();
  spots.forEach(([x, z, k], i) => {
    q.setFromAxisAngle(new V3(0, 1, 0), rnd(0, Math.PI));
    trees.setMatrixAt(i, m.compose(new V3(x, 0, z), q, s.setScalar(k)));
  });
  trees.castShadow = true; trees.receiveShadow = true;
  group.add(trees);
}

function parkCars(group, campSites) {
  const paints = CAR_COLORS.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }));
  for (let i = 0; i < 30; i++) {
    const r = Math.floor(rnd(-4, 5)) * ROAD_GAP, t = rnd(-90, 90), lane = Math.random() < 0.5 ? -2.4 : 2.4;
    if (Math.abs(t) < PARK + 3 && Math.abs(r) < PARK + 3) continue;
    const car = new THREE.Mesh(carGeo, [pick(paints), glassMat, tireMat]);
    if (Math.random() < 0.5) car.position.set(r + lane, 0, t);
    else { car.position.set(t, 0, r + lane); car.rotation.y = Math.PI / 2; }
    if (campSites.some(s => s.distanceTo(car.position) < 12)) continue;
    car.rotation.y += Math.random() < 0.5 ? 0 : Math.PI;
    car.castShadow = true; car.receiveShadow = true;
    group.add(car);
  }
}

function streetLights(group) {
  const spots = [];
  for (let r = -96; r <= 96; r += ROAD_GAP) for (let t = -84; t <= 84; t += 24) {
    spots.push([r + 4.4, t, -Math.PI / 2], [t, r - 4.4, 0]);
  }
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.8 }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new V3(1, 1, 1);
  spots.forEach(([x, z, ry], i) => lamps.setMatrixAt(i, m.compose(new V3(x, 0, z), q.setFromAxisAngle(new V3(0, 1, 0), ry), one)));
  lamps.castShadow = true;
  group.add(lamps);
}

function harborWater(group) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.08, metalness: 0.2, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6) });
  waterNormal.repeat.set(40, 20);
  water = new THREE.Mesh(new THREE.PlaneGeometry(900, 400), mat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.05, 106 + 200);
  group.add(water);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(220, 1.2, 3), new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 40, 1), roughness: 0.9 }));
  quay.position.set(0, 0.3, 105); quay.receiveShadow = true;
  group.add(quay);
}

function lavaPool(group, x, z, r) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.6 });
  lavaMats.push(mat);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 28), mat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.06, z);
  group.add(pool);
}

function volcano(group) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 110, 48, 1, true), new THREE.MeshStandardMaterial({ map: texRepeat('basalt', 12, 4), roughness: 1 }));
  cone.position.set(-60, 55, -360);
  group.add(cone);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 2.2 });
  lavaMats.push(glowMat);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 4, 32), glowMat);
  crater.position.set(-60, 104, -360);
  group.add(crater);
  for (let i = 0; i < 8; i++) lavaPool(group, rnd(-150, 150), (Math.random() < 0.5 ? -1 : 1) * rnd(110, 160), rnd(3, 8));
  for (const [x, z] of [[-PARK + 3, -PARK + 3], [PARK - 3, PARK - 3]]) lavaPool(group, x, z, 1.6);
}

export function addProps(group, theme, campSites) {
  themeName = theme; water = null; lavaMats = [];
  baseSunI = sun.intensity; baseHemiI = hemi.intensity;
  scatterTrees(group, theme, campSites);
  parkCars(group, campSites);
  streetLights(group);
  if (theme === 'harbor') harborWater(group);
  if (theme === 'volcano') volcano(group);
}

export function updateProps(dt) {
  const t = world.time;
  if (water) { waterNormal.offset.x = t * 0.01; waterNormal.offset.y = t * 0.02; }
  for (const m of lavaMats) m.emissiveIntensity = 1.6 + Math.sin(t * 2.3) * 0.35;
  if (themeName === 'volcano') {
    if (Math.random() < 0.5) ember(new V3(P.pos.x + rnd(-30, 30), rnd(0, 4), P.pos.z + rnd(-30, 30)));
    if (Math.random() < 0.08) smoke(new V3(-60 + rnd(-10, 10), 110, -360), 1, 30, 0x3a302c, 8, 8);
  }
  if (themeName === 'storm') {
    // far-off lightning flashes
    stormT -= dt;
    if (stormT < 0) { stormT = rnd(3, 8); sun.intensity = baseSunI * 3; hemi.intensity = baseHemiI * 3; }
    sun.intensity += (baseSunI - sun.intensity) * Math.min(1, dt * 6);
    hemi.intensity += (baseHemiI - hemi.intensity) * Math.min(1, dt * 6);
  }
}
