// The open world: districts, roads, buildings (with ladders to the roofs), collision and rooftop walking.
// The map is built once; every level reuses it with its own missions.
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene, ENV } from './engine.js';
import { tex, texRepeat, laneTex } from './textures.js';
import { burstDebris, smoke, shake } from './fx.js';
import { sfx } from './audio.js';
import { V3, rnd, clamp, P, world } from './world.js';
import { FACADES, buildBuildingMeshes, setBuildingHeight } from './map-buildings.js';
import { addMapProps, updateMapProps } from './map-props.js';

export const WORLD = 400, EDGE = 395;
export const RING = 158, RING_W = 14;
export const DT = { half: 142, gap: 24, road: 8, park: 20 }; // downtown street grid

/* Districts: name, area, and the open spot where bosses land. */
export const DISTRICTS = {
  downtown:    { name: 'DOWNTOWN',     x0: -142, x1: 142, z0: -142, z1: 142, arena: [0, 0] },
  residential: { name: 'MAPLE HILLS',  x0: -390, x1: -172, z0: -240, z1: 240, arena: [-281, 0] },
  harbor:      { name: 'HARBOR',       x0: -240, x1: 240, z0: 172, z1: 390, arena: [0, 222] },
  airport:     { name: 'AIRPORT',      x0: 190, x1: 390, z0: -150, z1: 250, arena: [245, 200] },
  military:    { name: 'ARMY BASE',    x0: 172, x1: 390, z0: -390, z1: -172, arena: [262, -282] },
  volcano:     { name: 'MONSTER LAND', x0: -390, x1: 150, z0: -390, z1: -172, arena: [-120, -280] },
};
export function districtAt(x, z) {
  for (const [id, d] of Object.entries(DISTRICTS)) if (x >= d.x0 && x <= d.x1 && z >= d.z0 && z <= d.z1) return id;
  return null;
}

/* Long straight roads (centre line, width). Used for drawing, the minimap and placing cars. */
export const ROADS = [];
function road(x0, z0, x1, z1, w, kind = 'street') { ROADS.push({ x0, z0, x1, z1, w, kind }); }
function planRoads() {
  ROADS.length = 0;
  // highway ring around downtown
  road(-RING, -RING, RING, -RING, RING_W, 'highway'); road(-RING, RING, RING, RING, RING_W, 'highway');
  road(-RING, -RING, -RING, RING, RING_W, 'highway'); road(RING, -RING, RING, RING, RING_W, 'highway');
  // highways out to the districts
  road(-390, 0, -RING, 0, 12, 'highway');     // west: Maple Hills
  road(RING, 0, 300, 0, 12, 'highway');       // east: airport
  road(0, RING, 0, 255, 12, 'highway');       // south: harbor
  road(0, -RING, 0, -330, 12, 'highway');     // north: monster land
  road(RING, -RING, 300, -RING, 12, 'highway'); road(300, -RING, 300, -230, 12, 'highway'); // army base
  // downtown grid
  for (let r = -132; r <= 132; r += DT.gap) { road(r, -DT.half, r, DT.half, DT.road); road(-DT.half, r, DT.half, r, DT.road); }
  // Maple Hills streets
  for (let x = -360; x <= -190; x += 42) road(x, -235, x, 235, 7);
  for (let z = -210; z <= 210; z += 42) road(-385, z, -175, z, 7);
  // harbor quay road and airport taxiway
  road(-235, 255, 235, 255, 10);
  road(290, -110, 290, 220, 12, 'taxiway');
}

/* ---------- solid boxes: buildings and other things you can't walk through ---------- */
export let buildings = [];
let solids = [];
const grid = new Map();
const CELL = 32;
const cellKey = (i, j) => i * 100003 + j;
function addToGrid(b) {
  for (let i = Math.floor((b.cx - b.hw) / CELL); i <= Math.floor((b.cx + b.hw) / CELL); i++)
    for (let j = Math.floor((b.cz - b.hd) / CELL); j <= Math.floor((b.cz + b.hd) / CELL); j++) {
      const k = cellKey(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(b);
    }
}
function near(x, z, r) {
  const out = new Set();
  for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
    for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
      const list = grid.get(cellKey(i, j));
      if (list) for (const b of list) out.add(b);
    }
  return out;
}

/* Add a solid box (hangar, crate stack, base wall...). */
export function addSolid(cx, cz, hw, hd, h, extra = {}) {
  const s = { cx, cz, hw, hd, h, alive: true, solidOnly: true, ...extra };
  solids.push(s);
  addToGrid(s);
  return s;
}

function addBuilding(cx, cz, w, d, h, style, ladderChance = 0, blockZ = cz) {
  const b = { cx, cz, hw: w / 2, hd: d / 2, h, style, alive: true, crumble: -1, debris: FACADES[style].debris, hidden: false };
  if (Math.random() < ladderChance && h < 38) {
    // the ladder goes on the wall that faces the street (away from the middle of its block)
    const side = Math.abs(cz - blockZ) > 0.5 ? Math.sign(cz - blockZ) : (Math.random() < 0.5 ? 1 : -1);
    b.ladder = { x: cx + rnd(-w / 4, w / 4), z: cz + side * (d / 2 + 0.25), nz: side };
  }
  buildings.push(b);
  addToGrid(b);
}

function facadeFor(fromCenter, h) {
  if (h > 24 || (fromCenter < 60 && Math.random() < 0.6)) return 'glass';
  return Math.random() < 0.5 ? 'concrete' : 'brick';
}

function planDowntown() {
  for (let bx = -132; bx < 132; bx += DT.gap) for (let bz = -132; bz < 132; bz += DT.gap) {
    const x0 = bx + 4, z0 = bz + 4;
    if (x0 >= -DT.park && x0 + 16 <= DT.park && z0 >= -DT.park && z0 + 16 <= DT.park) continue;
    const fromCenter = Math.hypot(x0 + 8, z0 + 8);
    const tall = () => rnd(7, 14) + Math.max(0, 110 - fromCenter) * rnd(0.12, 0.38);
    const add = (cx, cz, w, d) => { const h = tall(); addBuilding(cx, cz, w, d, h, facadeFor(fromCenter, h), 0.35, z0 + 8); };
    const split = Math.random();
    if (split < 0.3) add(x0 + 8, z0 + 8, 14, 14);
    else if (split < 0.7) {
      if (Math.random() < 0.5) { add(x0 + 4, z0 + 8, 6.5, 14); add(x0 + 12, z0 + 8, 6.5, 14); }
      else { add(x0 + 8, z0 + 4, 14, 6.5); add(x0 + 8, z0 + 12, 14, 6.5); }
    } else for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) add(x0 + 4 + i * 8, z0 + 4 + j * 8, 6.5, 6.5);
  }
}

function planResidential() {
  for (let x = -360; x < -190; x += 42) for (let z = -210; z < 210; z += 42) {
    if (Math.abs(x + 21 - DISTRICTS.residential.arena[0]) < 30 && Math.abs(z + 21) < 30) continue; // the park
    for (const [ox, oz] of [[11, 11], [31, 11], [11, 31], [31, 31]]) {
      if (Math.random() < 0.15) continue;
      const w = rnd(8, 11), d = rnd(8, 11);
      addBuilding(x + ox, z + oz, w, d, rnd(5, 10), Math.random() < 0.7 ? 'brick' : 'concrete', 0.3, z + 21);
    }
  }
}

function planHarbor() {
  for (let x = -220; x <= 220; x += 40) {
    if (Math.abs(x) < 26) continue;
    addBuilding(x, 205, 30, 18, rnd(9, 13), 'concrete', 0.5); // warehouses
  }
}

function planAirport() {
  addBuilding(232, 110, 22, 64, 14, 'glass', 0.6); // terminal
  for (const z of [-110, -70, -30]) addSolid(240, z, 15, 17, 12, { hangar: true }); // hangars
  addSolid(262, 60, 4, 4, 30, { tower: true });   // control tower
}

function planMilitary() {
  for (const [x, z] of [[205, -350], [235, -350], [205, -315], [235, -315], [350, -210]]) addBuilding(x, z, 22, 10, 6, 'concrete', 0.6);
  addBuilding(360, -360, 26, 26, 9, 'concrete', 0.8); // command building
}

/* ---------- ground ---------- */
const mapGroup = new THREE.Group();
scene.add(mapGroup);

function plane(w, d, material, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true;
  mapGroup.add(m);
  return m;
}
function texturedPlane(name, w, d, x, z, y, tile, extra = {}) {
  return plane(w, d, new THREE.MeshStandardMaterial({ map: texRepeat(name, w / tile, d / tile), roughness: 0.95, ...extra }), x, z, y);
}

function buildGround() {
  texturedPlane('grass', 1200, 1200, 0, 0, -0.03, 10);
  const v = DISTRICTS.volcano;
  texturedPlane('basalt', v.x1 - v.x0 + 40, v.z1 - v.z0 + 40, (v.x0 + v.x1) / 2, (v.z0 + v.z1) / 2 - 10, -0.02, 14);
  texturedPlane('asphalt', DT.half * 2 + 8, DT.half * 2 + 8, 0, 0, 0.0, 8);                 // downtown paving
  texturedPlane('sidewalk', 480, 70, 0, 225, 0.0, 4, { color: 0xc8c2b8 });                   // harbor docks
  texturedPlane('sidewalk', 200, 400, 290, 50, 0.0, 6, { color: 0xb5b2ab });                 // airport apron
  texturedPlane('asphalt', 220, 210, 281, -282, 0.0, 8);                                      // army base yard
  // runway with painted markings
  const runway = texturedPlane('asphalt', 34, 400, 335, 45, 0.02, 8, { color: 0x7d7d7d });
  runway.material.roughness = 0.9;
  const dash = laneTex.clone(); dash.needsUpdate = true; dash.repeat.set(1, 40);
  plane(1, 380, new THREE.MeshStandardMaterial({ color: 0xffffff, map: dash, alphaMap: dash, transparent: true, depthWrite: false }), 335, 45, 0.04);
  for (const x of [319.5, 350.5]) plane(0.8, 396, new THREE.MeshStandardMaterial({ color: 0xffffff }), x, 45, 0.04);
  // downtown sidewalks: one slab per block
  const blocks = [];
  for (let bx = -132; bx < 132; bx += DT.gap) for (let bz = -132; bz < 132; bz += DT.gap) blocks.push([bx + 12, bz + 12]);
  const walk = new THREE.InstancedMesh(new THREE.BoxGeometry(16, 0.25, 16), new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 4, 4), roughness: 0.95 }), blocks.length);
  const mtx = new THREE.Matrix4();
  blocks.forEach(([x, z], i) => walk.setMatrixAt(i, mtx.makeTranslation(x, 0.125, z)));
  walk.receiveShadow = true; walk.frustumCulled = false;
  mapGroup.add(walk);
  // the park in the middle of downtown (boss arena)
  const park = new THREE.Mesh(new THREE.BoxGeometry(DT.park * 2 - 4, 0.3, DT.park * 2 - 4), new THREE.MeshStandardMaterial({ map: texRepeat('grass', 6, 6), roughness: 1 }));
  park.position.y = 0.15; park.receiveShadow = true; mapGroup.add(park);
}

/* A flat rectangle on the ground whose texture repeats every `tileU` x `tileV` units (so many can share one material). */
function groundPiece(w, d, x, z, y, tileU, tileV, rotate = false) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tileU, uv.getY(i) * d / tileV);
  g.rotateX(-Math.PI / 2);
  if (rotate) g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/* All roads in two meshes (highways and streets) and all painted lines in two more: few draw calls for the iPad. */
function buildRoads() {
  const pieces = { highway: [], street: [], yellow: [], white: [] };
  for (const r of ROADS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const alongX = Math.abs(r.x1 - r.x0) > Math.abs(r.z1 - r.z0);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const inDowntown = Math.max(Math.abs(r.x0), Math.abs(r.x1)) <= DT.half && Math.max(Math.abs(r.z0), Math.abs(r.z1)) <= DT.half;
    if (!inDowntown || r.kind === 'highway') {
      (r.kind === 'highway' ? pieces.highway : pieces.street).push(groundPiece(alongX ? len + r.w : r.w, alongX ? r.w : len + r.w, cx, cz, 0.01, 8, 8));
    }
    // centre line: dashes every 3.3 units along the road
    (r.kind === 'highway' ? pieces.white : pieces.yellow).push(groundPiece(0.3, len, cx, cz, 0.03, 1, 3.3, alongX));
  }
  const asphalt = c => new THREE.MeshStandardMaterial({ map: tex('asphalt'), roughness: 0.92, color: c });
  const paint = c => new THREE.MeshStandardMaterial({ color: c, map: laneTex, alphaMap: laneTex, transparent: true, roughness: 0.8, depthWrite: false });
  for (const [key, mat] of [['highway', asphalt(0x9a9a9a)], ['street', asphalt(0xb0b0b0)], ['yellow', paint(0xe8d36a)], ['white', paint(0xffffff)]]) {
    if (!pieces[key].length) continue;
    const mesh = new THREE.Mesh(mergeBufferGeometries(pieces[key]), mat);
    mesh.receiveShadow = true;
    mapGroup.add(mesh);
  }
}

/* Ladders: two rails and rungs, one instanced mesh for all of them. */
function buildLadders() {
  const withLadder = buildings.filter(b => b.ladder);
  if (!withLadder.length) return;
  const parts = [];
  for (const x of [-0.35, 0.35]) parts.push(new THREE.BoxGeometry(0.07, 1, 0.07).translate(x, 0.5, 0));
  for (let i = 0; i < 10; i++) parts.push(new THREE.BoxGeometry(0.7, 0.04, 0.05).translate(0, 0.05 + i * 0.1, 0));
  const geo = mergeGeos(parts);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xb8a24a, roughness: 0.5, metalness: 0.7 }), withLadder.length);
  const d = new THREE.Object3D();
  withLadder.forEach((b, i) => {
    d.position.set(b.ladder.x, 0, b.ladder.z);
    d.scale.set(1, b.h + 1, 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.castShadow = true; mesh.frustumCulled = false;
  mapGroup.add(mesh);
}
function mergeGeos(geos) {
  const pos = [], nor = [];
  for (const g of geos) {
    const n = g.index ? g.toNonIndexed() : g;
    pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

let built = false;
export function buildWorld() {
  if (built) return;
  built = true;
  planRoads();
  planDowntown(); planResidential(); planHarbor(); planAirport(); planMilitary();
  buildGround();
  buildRoads();
  buildBuildingMeshes(mapGroup, buildings);
  buildLadders();
  addMapProps(mapGroup);
  mapGroup.traverse(o => {
    for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial) m.envMapIntensity = m.metalness > 0.5 ? ENV.glass : ENV.city;
  });
}

/* ---------- physics helpers ---------- */
/* Push a circle out of solid things it can't climb onto. `y` = how high the mover is (roofs below it don't block). */
export function collide(pos, r, y = 0) {
  for (const b of near(pos.x, pos.z, r + 16)) {
    if (!b.alive || b.h <= y + 0.5) continue;
    const nx = clamp(pos.x, b.cx - b.hw, b.cx + b.hw), nz = clamp(pos.z, b.cz - b.hd, b.cz + b.hd);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + dx / d * r; pos.z = nz + dz / d * r;
    } else {
      const ox = b.hw - Math.abs(pos.x - b.cx), oz = b.hd - Math.abs(pos.z - b.cz);
      if (ox < oz) pos.x = b.cx + Math.sign(pos.x - b.cx || 1) * (b.hw + r);
      else pos.z = b.cz + Math.sign(pos.z - b.cz || 1) * (b.hd + r);
    }
  }
  pos.x = clamp(pos.x, -EDGE, EDGE); pos.z = clamp(pos.z, -EDGE, EDGE);
}

/* Height of whatever you'd stand on here (a roof just below you, or the street). */
export function groundAt(x, z, y = 0) {
  let g = 0;
  for (const b of near(x, z, 2)) {
    if (!b.alive || b.h > y + 0.7) continue;
    if (Math.abs(x - b.cx) < b.hw + 0.2 && Math.abs(z - b.cz) < b.hd + 0.2) g = Math.max(g, b.h);
  }
  return g;
}

/* Is there a building between two points? */
export function blocked(a, b) {
  const steps = Math.ceil(a.distanceTo(b) / 2);
  const cand = near((a.x + b.x) / 2, (a.z + b.z) / 2, a.distanceTo(b) / 2 + 16);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t;
    for (const bd of cand) if (bd.alive && y < bd.h && Math.abs(x - bd.cx) < bd.hw && Math.abs(z - bd.cz) < bd.hd) return true;
  }
  return false;
}

/* The nearest ladder you could climb, if you're standing at its foot. */
export function ladderNear(pos, y) {
  for (const b of near(pos.x, pos.z, 4)) {
    if (!b.ladder || !b.alive || y > 0.5) continue;
    if (Math.hypot(pos.x - b.ladder.x, pos.z - b.ladder.z) < 1.8) return b;
  }
  return null;
}

/* Giants smash buildings they touch. */
export function smashNear(pos, r) {
  let n = 0;
  for (const b of near(pos.x, pos.z, r + 16)) {
    if (!b.alive || b.solidOnly) continue;
    const nx = clamp(pos.x, b.cx - b.hw, b.cx + b.hw), nz = clamp(pos.z, b.cz - b.hd, b.cz + b.hd);
    if ((pos.x - nx) ** 2 + (pos.z - nz) ** 2 >= r * r) continue;
    b.alive = false; b.crumble = 0; n++;
    crumbling.add(b);
    burstDebris(new V3(b.cx, b.h * 0.5, b.cz), b.debris, 30, 14, 0.9);
    burstDebris(new V3(b.cx, 1, b.cz), 0x8d8a84, 14, 8, 1.2);
    smoke(new V3(b.cx, 2, b.cz), 10, Math.max(b.hw, b.hd) * 0.9, 0xa49e93, Math.max(b.hw, b.hd));
    // anyone on that roof drops to the street
    if (Math.abs(P.pos.x - b.cx) < b.hw + 0.5 && Math.abs(P.pos.z - b.cz) < b.hd + 0.5 && P.y > 1) P.vy = 2;
  }
  if (n) { sfx.boom(); shake(0.7); }
  return n;
}

/* ---------- per frame ---------- */
const crumbling = new Set();
const hiddenForCamera = new Set();

/* Buildings between the camera and Joseph get hidden in the outside view. */
function updateCameraHiding(camera, allow) {
  const want = new Set();
  if (allow && (world.state === 'mission' || world.state === 'boss' || world.state === 'bossIntro')) {
    const c = camera.position, steps = 10;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = c.x + (P.pos.x - c.x) * t, z = c.z + (P.pos.z - c.z) * t, y = c.y + (P.y + 1.5 - c.y) * t;
      for (const b of near(x, z, 1)) {
        if (!b.alive || b.solidOnly || b.h < 3) continue;
        if (Math.abs(x - b.cx) < b.hw + 0.6 && Math.abs(z - b.cz) < b.hd + 0.6 && y < b.h + 1) want.add(b);
      }
    }
  }
  for (const b of hiddenForCamera) if (!want.has(b)) { hiddenForCamera.delete(b); if (b.alive) setBuildingHeight(b, 1); }
  for (const b of want) if (!hiddenForCamera.has(b)) { hiddenForCamera.add(b); setBuildingHeight(b, 0); }
}

export function updateMap(dt, camera, allowHiding = true) {
  for (const b of crumbling) {
    b.crumble = Math.min(1, b.crumble + dt * 1.6);
    setBuildingHeight(b, THREE.MathUtils.lerp(1, 0.06, b.crumble));
    if (Math.random() < 0.3) smoke(new V3(b.cx, b.h * (1 - b.crumble), b.cz), 1, 3, 0xa49e93, b.hw);
    if (b.crumble >= 1) crumbling.delete(b);
  }
  updateCameraHiding(camera, allowHiding);
  updateMapProps(dt);
}

export function resetBuildings() {
  for (const b of buildings) {
    if (!b.alive || b.crumble >= 0 || hiddenForCamera.has(b)) { b.alive = true; b.crumble = -1; setBuildingHeight(b, 1); }
  }
  crumbling.clear(); hiddenForCamera.clear();
  for (const s of solids) s.alive = true;
}

/* A random point on a road inside a district (for spawning monsters, cars, crates). */
export function roadPointIn(districtId, minDistFrom = null, minDist = 0) {
  const d = districtId ? DISTRICTS[districtId] : null;
  const roads = ROADS.filter(r => !d || (Math.max(r.x0, r.x1) >= d.x0 && Math.min(r.x0, r.x1) <= d.x1 && Math.max(r.z0, r.z1) >= d.z0 && Math.min(r.z0, r.z1) <= d.z1));
  for (let tries = 0; tries < 60; tries++) {
    const r = roads[Math.floor(Math.random() * roads.length)];
    const t = Math.random();
    const p = new V3(r.x0 + (r.x1 - r.x0) * t, 0, r.z0 + (r.z1 - r.z0) * t);
    if (d && (p.x < d.x0 || p.x > d.x1 || p.z < d.z0 || p.z > d.z1)) continue;
    if (minDistFrom && Math.hypot(p.x - minDistFrom.x, p.z - minDistFrom.z) < minDist) continue;
    return p;
  }
  return new V3(d ? (d.x0 + d.x1) / 2 : 0, 0, d ? (d.z0 + d.z1) / 2 : 0);
}

/* An open spot (no buildings) near a point: for camps, nests and crates. */
export function openSpotNear(x, z, radius, clearance = 6) {
  for (let tries = 0; tries < 80; tries++) {
    const a = rnd(0, Math.PI * 2), r = rnd(0, radius);
    const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    let ok = Math.abs(px) < EDGE - 10 && Math.abs(pz) < EDGE - 10;
    if (ok) for (const b of near(px, pz, clearance + 16)) {
      if (Math.abs(px - b.cx) < b.hw + clearance && Math.abs(pz - b.cz) < b.hd + clearance) { ok = false; break; }
    }
    if (ok) return new V3(px, 0, pz);
  }
  return nearestRoadPoint(x, z); // streets never have buildings on them
}

/* The closest point on any road (always walkable). */
export function nearestRoadPoint(x, z) {
  let best = null, bd = Infinity;
  for (const r of ROADS) {
    const dx = r.x1 - r.x0, dz = r.z1 - r.z0, len2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - r.x0) * dx + (z - r.z0) * dz) / len2, 0, 1);
    const px = r.x0 + dx * t, pz = r.z0 + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = new V3(px, 0, pz); }
  }
  return best || new V3(x, 0, z);
}
