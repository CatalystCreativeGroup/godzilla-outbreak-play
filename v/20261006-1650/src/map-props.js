// Scenery for the open world: trees, street lights, parked cars, harbor (water, containers, cranes),
// airport (hangars, control tower), army base (fence, helipad) and the volcano with lava.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, texRepeat, waterNormal } from './textures.js';
import { ember, smoke } from './fx.js';
import { sun, hemi } from './engine.js';
import { V3, rnd, pick, P, world } from './world.js';
import { ROADS, DISTRICTS, DT, addSolid, districtAt } from './map.js';

let treeMat = null, lavaMats = [], water = null, themeName = 'day', stormT = 4, baseSunI = 2, baseHemiI = 0.4;
const flat = g => (g.index ? g.toNonIndexed() : g);
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V3(), UP = new V3(0, 1, 0);

function instanced(group, geo, mat, transforms, shadow = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  transforms.forEach(([x, y, z, ry = 0, s = 1, sy = s], i) => {
    Q.setFromAxisAngle(UP, ry);
    mesh.setMatrixAt(i, M4.compose(new V3(x, y, z), Q, S.set(s, sy, s)));
  });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  mesh.frustumCulled = false; // r149: instanced bounds don't cover spread-out copies
  group.add(mesh);
  return mesh;
}

/* ---------- trees ---------- */
function trees(group) {
  const geo = (() => {
    const a = new THREE.PlaneGeometry(4.4, 6.4); a.translate(0, 3.2, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    return mergeBufferGeometries([a, b]);
  })();
  treeMat = new THREE.MeshStandardMaterial({ map: tex('tree'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  const spots = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; spots.push([Math.cos(a) * 16.5, 0, Math.sin(a) * 16.5, rnd(0, 3), rnd(0.6, 0.8)]); }
  // Maple Hills yards and the park
  for (let i = 0; i < 260; i++) {
    const r = DISTRICTS.residential, x = rnd(r.x0, r.x1), z = rnd(r.z0, r.z1);
    if (ROADS.some(rd => Math.abs(rd.x0 - rd.x1) < 1 ? Math.abs(x - rd.x0) < rd.w : Math.abs(z - rd.z0) < rd.w)) continue;
    spots.push([x, 0, z, rnd(0, 3), rnd(0.8, 1.3)]);
  }
  // countryside around the city
  for (let i = 0; i < 260; i++) {
    const x = rnd(-560, 560), z = rnd(-560, 560);
    if ((Math.abs(x) < 400 && Math.abs(z) < 400) || z > 258) continue; // not in the city, not in the sea
    spots.push([x, 0, z, rnd(0, 3), rnd(1.2, 2.2)]);
  }
  // along the highways
  for (const r of ROADS.filter(rd => rd.kind === 'highway')) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), alongX = Math.abs(r.x1 - r.x0) > 1;
    for (let t = 6; t < len; t += 18) for (const side of [-1, 1]) {
      const x = r.x0 + (alongX ? Math.sign(r.x1 - r.x0) * t : side * (r.w / 2 + 3));
      const z = r.z0 + (alongX ? side * (r.w / 2 + 3) : Math.sign(r.z1 - r.z0) * t);
      if (Math.abs(x) < DT.half + 2 && Math.abs(z) < DT.half + 2) continue;
      if (districtAt(x, z) === 'airport' || districtAt(x, z) === 'military' || (z > 160 && Math.abs(x) < 240)) continue;
      spots.push([x, 0, z, rnd(0, 3), rnd(0.8, 1.1)]);
    }
  }
  instanced(group, geo, treeMat, spots);
}

/* ---------- street lights along roads ---------- */
function lamps(group) {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 8); pole.translate(0, 3.5, 0);
  const arm = new THREE.BoxGeometry(0.14, 0.14, 2.2); arm.translate(0, 6.9, 1.0);
  const head = new THREE.BoxGeometry(0.5, 0.2, 0.9); head.translate(0, 6.8, 2.0);
  const geo = mergeBufferGeometries([pole, arm, head]);
  const spots = [];
  for (const r of ROADS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), alongX = Math.abs(r.x1 - r.x0) > 1;
    const step = r.kind === 'highway' ? 30 : 24;
    for (let t = 12; t < len; t += step) {
      const off = r.w / 2 + 0.6;
      const x = r.x0 + (alongX ? Math.sign(r.x1 - r.x0) * t : off), z = r.z0 + (alongX ? off : Math.sign(r.z1 - r.z0) * t);
      spots.push([x, 0, z, alongX ? Math.PI : -Math.PI / 2]);
    }
  }
  instanced(group, geo, new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.8 }), spots);
}

/* ---------- parked cars (procedural until the car model is swapped in by vehicles.js) ---------- */
export const parkedCarSpots = [];
function parkedCars(group) {
  for (const r of ROADS.filter(rd => rd.kind === 'street')) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0), alongX = Math.abs(r.x1 - r.x0) > 1;
    for (let t = 8; t < len - 8; t += rnd(14, 40)) {
      if (Math.random() < 0.55) continue;
      const lane = (Math.random() < 0.5 ? -1 : 1) * (r.w / 2 - 1.3);
      const x = r.x0 + (alongX ? Math.sign(r.x1 - r.x0) * t : lane), z = r.z0 + (alongX ? lane : Math.sign(r.z1 - r.z0) * t);
      if (Math.abs(x) < DT.park + 4 && Math.abs(z) < DT.park + 4) continue;
      parkedCarSpots.push({ x, z, ry: (alongX ? Math.PI / 2 : 0) + (Math.random() < 0.5 ? 0 : Math.PI) });
    }
  }
}

/* ---------- harbor ---------- */
function harbor(group) {
  waterNormal.repeat.set(60, 30);
  // one big sheet of ocean (seen from below too, by the submarine)
  waterNormal.repeat.set(110, 75);
  water = new THREE.Mesh(new THREE.PlaneGeometry(2300, 1490), new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.08, metalness: 0.2, normalMap: waterNormal, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.06, 262 + 745);
  group.add(water);
  const quay = new THREE.Mesh(new THREE.BoxGeometry(520, 1.4, 3), new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 90, 1), roughness: 0.9 }));
  quay.position.set(0, 0.2, 261); quay.receiveShadow = true; group.add(quay);
  // shipping containers in stacks
  const colors = [0xb03a2e, 0x1f618d, 0x7d8c2a, 0xc87f0a, 0x5d6d7e, 0x8e44ad];
  const contGeo = new THREE.BoxGeometry(2.5, 2.6, 6.1).translate(0, 1.3, 0);
  const contMat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.5, map: containerTexture() });
  const conts = [];
  for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
    const baseX = -200 + row * 34 + (row > 2 ? 200 : 0), baseZ = 232 + col * 7;
    if (Math.abs(baseX) < 30) continue;
    const stack = 1 + Math.floor(Math.random() * 3);
    for (let s = 0; s < stack; s++) conts.push([baseX, s * 2.62, baseZ, Math.PI / 2, 1]);
    addSolid(baseX, baseZ, 3.1, 1.3, stack * 2.6);
  }
  const mesh = instanced(group, contGeo, contMat, conts.map(c => [c[0], c[1], c[2], c[3]]));
  conts.forEach((c, i) => mesh.setColorAt(i, new THREE.Color(pick(colors))));
  mesh.instanceColor.needsUpdate = true;
  // dock cranes
  const craneMat = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.5, metalness: 0.6 });
  for (const x of [-150, -60, 60, 150]) {
    const crane = new THREE.Group();
    for (const [lx, lz] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 26, 0.8), craneMat); leg.position.set(lx, 13, lz); crane.add(leg); }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 46), craneMat); boom.position.set(0, 27, 10); crane.add(boom);
    crane.traverse(o => { o.castShadow = true; });
    crane.position.set(x, 0, 256);
    group.add(crane);
  }
}
function containerTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < 64; x += 6) g.fillRect(x, 0, 2, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

/* ---------- airport ---------- */
function airport(group) {
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xa7adb3, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
  for (const z of [-110, -70, -30]) {
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 34, 24, 1, true, -Math.PI / 2, Math.PI), roofMat);
    roof.rotation.x = Math.PI / 2; roof.rotation.z = Math.PI / 2; roof.position.set(240, 0, z);
    roof.scale.set(1, 1, 0.8); roof.castShadow = roof.receiveShadow = true;
    group.add(roof);
  }
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 26, 16), towerMat);
  tower.position.set(262, 13, 60); tower.castShadow = true; group.add(tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 4, 16), new THREE.MeshStandardMaterial({ color: 0x1a2a33, roughness: 0.05, metalness: 0.9 }));
  cab.position.set(262, 28, 60); cab.castShadow = true; group.add(cab);
  // windsock and runway lights
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3322, emissiveIntensity: 1.5 });
  const lights = [];
  for (let z = -150; z <= 240; z += 20) for (const x of [317, 353]) lights.push([x, 0.15, z]);
  instanced(group, new THREE.SphereGeometry(0.25, 8, 6), lightMat, lights, false);
}

/* ---------- army base ---------- */
function military(group) {
  const fenceGeo = new THREE.BoxGeometry(0.12, 3, 0.12).translate(0, 1.5, 0);
  const posts = [];
  const d = DISTRICTS.military;
  for (let x = d.x0 + 6; x <= d.x1 - 4; x += 4) { posts.push([x, 0, d.z0 + 4]); if (Math.abs(x - 300) > 10) posts.push([x, 0, d.z1 - 4]); }
  for (let z = d.z0 + 6; z <= d.z1 - 4; z += 4) { posts.push([d.x0 + 4, 0, z]); posts.push([d.x1 - 4, 0, z]); }
  instanced(group, fenceGeo, new THREE.MeshStandardMaterial({ color: 0x6b6f72, roughness: 0.5, metalness: 0.8 }), posts);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.9 }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(330, 0.04, -300); group.add(pad);
  const h = new THREE.Mesh(new THREE.RingGeometry(5, 5.8, 32), new THREE.MeshStandardMaterial({ color: 0xf1c40f }));
  h.rotation.x = -Math.PI / 2; h.position.set(330, 0.06, -300); group.add(h);
}

/* ---------- monster land: volcano and lava ---------- */
function lavaPool(group, x, z, r) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a0a00, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.6 });
  lavaMats.push(mat);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 28), mat);
  pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.06, z);
  group.add(pool);
}
function volcanoLand(group) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(150, 120, 48, 1, true), new THREE.MeshStandardMaterial({ map: texRepeat('basalt', 12, 4), roughness: 1 }));
  cone.position.set(-160, 60, -520);
  group.add(cone);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff4a10, emissiveIntensity: 2.2 });
  lavaMats.push(glowMat);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 4, 32), glowMat);
  crater.position.set(-160, 119, -520);
  group.add(crater);
  const v = DISTRICTS.volcano;
  for (let i = 0; i < 16; i++) lavaPool(group, rnd(v.x0 + 20, v.x1 - 20), rnd(v.z0 + 20, v.z1 - 30), rnd(3, 9));
}

export function addMapProps(group) {
  baseSunI = sun.intensity; baseHemiI = hemi.intensity;
  trees(group); lamps(group); parkedCars(group); harbor(group); airport(group); military(group); volcanoLand(group);
}

/* Level mood changes (tree colour, storm flashes) without rebuilding the map. */
export function setMapTheme(theme) {
  themeName = theme;
  baseSunI = sun.intensity; baseHemiI = hemi.intensity;
  if (treeMat) treeMat.color.setHex(theme === 'storm' ? 0x8a9a80 : theme === 'night' ? 0x6a7a70 : 0xffffff);
}

export function updateMapProps(dt) {
  const t = world.time;
  if (water) { waterNormal.offset.x = t * 0.01; waterNormal.offset.y = t * 0.02; }
  for (const m of lavaMats) m.emissiveIntensity = 1.6 + Math.sin(t * 2.3) * 0.35;
  if (districtAt(P.pos.x, P.pos.z) === 'volcano') {
    if (Math.random() < 0.5) ember(new V3(P.pos.x + rnd(-30, 30), P.y + rnd(0, 4), P.pos.z + rnd(-30, 30)));
  }
  if (Math.random() < 0.04) smoke(new V3(-160 + rnd(-10, 10), 122, -520), 1, 30, 0x3a302c, 8, 8);
  if (themeName === 'storm') {
    stormT -= dt;
    if (stormT < 0) { stormT = rnd(3, 8); sun.intensity = baseSunI * 3; hemi.intensity = baseHemiI * 3; }
    sun.intensity += (baseSunI - sun.intensity) * Math.min(1, dt * 6);
    hemi.intensity += (baseHemiI - hemi.intensity) * Math.min(1, dt * 6);
  }
}

export { RoundedBoxGeometry, flat };
