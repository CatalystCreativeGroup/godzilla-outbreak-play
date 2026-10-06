// The army base: lookout towers you can climb, a concrete bunker you can walk into (with a bed for a nap),
// helicopter pads and an airstrip for the Blue Angels. Built once with the map.
import * as THREE from 'three';
import { scene, applyTheme } from './engine.js';
import { addSolid } from './map.js';
import { setMapTheme } from './map-props.js';
import { texRepeat } from './textures.js';
import { sfx, say } from './audio.js';
import { V3, world, P, $ } from './world.js';
import { GAME } from './settings.js';

const group = new THREE.Group();
scene.add(group);
const concrete = new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 3, 2), color: 0x9d9a90, roughness: 0.95 });
const darkConcrete = new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 3, 2), color: 0x7a776f, roughness: 0.95 });
const steel = new THREE.MeshStandardMaterial({ color: 0x4a4d47, roughness: 0.55, metalness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x6b5032, roughness: 0.8 });
const sand = new THREE.MeshStandardMaterial({ color: 0x9b8a62, roughness: 1 });
const olive = new THREE.MeshStandardMaterial({ color: 0x4a5230, roughness: 0.8 });
const paint = new THREE.MeshStandardMaterial({ color: 0xf2f0e6, roughness: 0.8 });

function box(w, h, d, m, x, y, z, parent = group) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function flat(w, d, m, x, z, y = 0.05) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function canvasMat(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: 0.8 });
}
function sandbags(x, z, len, alongX) {
  for (let i = 0; i < len; i++) for (let row = 0; row < 2; row++) {
    const off = (i - (len - 1) / 2) * 1.0 + (row ? 0.5 : 0);
    const bag = box(0.95, 0.4, 0.55, sand, alongX ? x + off : x, 0.2 + row * 0.4, alongX ? z : z + off);
    if (!alongX) bag.rotation.y = Math.PI / 2;
  }
}

/* ---------- lookout tower: legs, a platform you can stand on, a roof and a ladder ---------- */
const TOWER_H = 12;
function tower(x, z) {
  for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) box(0.35, TOWER_H, 0.35, wood, x + lx, TOWER_H / 2, z + lz);
  for (const y of [4, 8]) { box(4.8, 0.15, 0.15, wood, x, y, z - 2.2); box(4.8, 0.15, 0.15, wood, x, y, z + 2.2); box(0.15, 0.15, 4.8, wood, x - 2.2, y, z); box(0.15, 0.15, 4.8, wood, x + 2.2, y, z); }
  box(5.4, 0.4, 5.4, wood, x, TOWER_H - 0.2, z);                                   // floor
  for (const [w, d, lx, lz] of [[5.4, 0.12, 0, -2.65], [0.12, 5.4, -2.65, 0], [0.12, 5.4, 2.65, 0], [1.8, 0.12, -1.8, 2.65], [1.8, 0.12, 1.8, 2.65]])
    box(w, 1.1, d, wood, x + lx, TOWER_H + 0.55, z + lz);                         // railings (gap for the ladder)
  for (const [lx, lz] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) box(0.15, 2.6, 0.15, wood, x + lx, TOWER_H + 1.3, z + lz);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.3, 1.8, 4), olive);
  roof.position.set(x, TOWER_H + 3.5, z); roof.rotation.y = Math.PI / 4; roof.castShadow = true; group.add(roof);
  // searchlight
  const lamp = box(0.6, 0.6, 0.9, steel, x + 1.8, TOWER_H + 1.4, z - 1.8);
  box(0.5, 0.5, 0.05, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c0, emissiveIntensity: 1.5 }), 0, 0, 0.46, lamp);
  // ladder up the +z side
  for (const lx of [-0.35, 0.35]) box(0.08, TOWER_H + 1, 0.08, steel, x + lx, (TOWER_H + 1) / 2, z + 2.85);
  for (let y = 0.4; y < TOWER_H; y += 0.4) box(0.7, 0.05, 0.06, steel, x, y, z + 2.85);
  sandbags(x, z + 4.5, 3, true);
  // the platform is a solid box you can stand on top of; the ladder is how you get there
  addSolid(x, z, 2.7, 2.7, TOWER_H, { ladder: { x, z: z + 2.95, nz: 1 }, tower: true });
}

/* ---------- the bunker: walk in through the door, nap in the bed ---------- */
export const BUNKER = { x: 300, z: -350, hw: 7, hd: 5, h: 4.2 };
let bunkerRoof = null;
export const bed = new V3();
function bunker() {
  const { x, z, hw, hd, h } = BUNKER, t = 0.6, door = 2.6;
  // walls (the front, facing the yard, has a doorway)
  box(hw * 2, h, t, concrete, x, h / 2, z - hd + t / 2);
  box(t, h, hd * 2, concrete, x - hw + t / 2, h / 2, z);
  box(t, h, hd * 2, concrete, x + hw - t / 2, h / 2, z);
  const seg = hw - door / 2;
  box(seg, h, t, concrete, x - hw + seg / 2, h / 2, z + hd - t / 2);
  box(seg, h, t, concrete, x + hw - seg / 2, h / 2, z + hd - t / 2);
  box(door, h - 2.6, t, concrete, x, h - (h - 2.6) / 2, z + hd - t / 2);           // over the door
  addSolid(x, z - hd + t / 2, hw, t / 2, h);
  addSolid(x - hw + t / 2, z, t / 2, hd, h);
  addSolid(x + hw - t / 2, z, t / 2, hd, h);
  addSolid(x - hw + seg / 2, z + hd - t / 2, seg / 2, t / 2, h);
  addSolid(x + hw - seg / 2, z + hd - t / 2, seg / 2, t / 2, h);
  // thick roof with a camouflage net (hidden while Joseph is inside so you can see in)
  bunkerRoof = new THREE.Group();
  box(hw * 2 + 0.6, 0.7, hd * 2 + 0.6, darkConcrete, x, h + 0.35, z, bunkerRoof);
  box(hw * 2 + 1.4, 0.08, hd * 2 + 1.4, olive, x, h + 0.75, z, bunkerRoof);
  group.add(bunkerRoof);
  // floor and inside
  flat(hw * 2 - t * 2, hd * 2 - t * 2, new THREE.MeshStandardMaterial({ color: 0x6d6a62, roughness: 0.9 }), x, z, 0.06);
  flat(4, 2.6, new THREE.MeshStandardMaterial({ color: 0x5a2e22, roughness: 1 }), x - 1, z - 0.6, 0.07);  // rug
  // bed: metal frame, mattress, pillow and an army-green blanket
  const bx = x - hw + 1.8, bz = z - hd + 2.2;
  bed.set(bx, 0, bz);
  for (const [lx, lz] of [[-0.5, -1.05], [0.5, -1.05], [-0.5, 1.05], [0.5, 1.05]]) box(0.06, 0.45, 0.06, steel, bx + lx, 0.22, bz + lz);
  box(1.1, 0.06, 2.2, steel, bx, 0.45, bz);
  box(1.0, 0.22, 2.1, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.9 }), bx, 0.59, bz);
  box(1.02, 0.12, 1.4, olive, bx, 0.74, bz + 0.3);                                   // blanket
  box(0.7, 0.14, 0.4, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), bx, 0.77, bz - 0.8); // pillow
  // footlocker, table with a radio and a lamp, a map on the wall, a ceiling light
  box(0.9, 0.5, 0.5, olive, bx, 0.25, bz + 1.5);
  box(1.6, 0.08, 0.9, wood, x + 3.5, 0.9, z - hd + 1.2);
  for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) box(0.06, 0.9, 0.06, wood, x + 3.5 + lx, 0.45, z - hd + 1.2 + lz);
  box(0.5, 0.3, 0.3, olive, x + 3.1, 1.09, z - hd + 1.1);
  box(0.1, 0.1, 0.02, new THREE.MeshStandardMaterial({ color: 0x002200, emissive: 0x2aff4a, emissiveIntensity: 1.2 }), x + 3.0, 1.12, z - hd + 1.26);
  box(0.2, 0.35, 0.2, new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 1.4 }), x + 4.0, 1.12, z - hd + 1.1);
  const map = canvasMat(256, 160, (g, w, hh) => {
    g.fillStyle = '#d8cfa8'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#5a6a4a'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 20 + i * 25); g.bezierCurveTo(80, i * 30, 160, 40 + i * 20, w, 10 + i * 26); g.stroke(); }
    g.fillStyle = '#c0392b'; for (const [px, py] of [[60, 50], [180, 110], [140, 40]]) { g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#222'; g.font = 'bold 18px Arial'; g.fillText('TOP SECRET', 70, 150);
  });
  const mapMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), map);
  mapMesh.position.set(x + 2, 2.2, z - hd + t + 0.02); group.add(mapMesh);
  box(2.4, 0.08, 0.5, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.2 }), x, h - 0.05, z);
  // outside: sandbags by the door and a sign
  sandbags(x - 3.2, z + hd + 1.3, 3, true);
  sandbags(x + 3.2, z + hd + 1.3, 3, true);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), canvasMat(256, 64, (g, w, hh) => {
    g.fillStyle = '#2f3524'; g.fillRect(0, 0, w, hh); g.fillStyle = '#f2f0e6'; g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillText('BUNKER', w / 2, 46);
  }));
  sign.position.set(x, h - 0.6, z + hd + 0.02); group.add(sign);
}

/* ---------- helipads and the airstrip ---------- */
function helipads() {
  const hMat = canvasMat(256, 256, (g, w) => {
    g.fillStyle = '#3a3d40'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#f2c94c'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 14, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#f2f0e6'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, w / 2 + 6);
  });
  for (const x of [215, 245, 275]) flat(14, 14, hMat, x, -212, 0.05);
}
function airstrip() {
  flat(210, 20, new THREE.MeshStandardMaterial({ map: texRepeat('asphalt', 26, 3), color: 0x6f6f6f, roughness: 0.9 }), 280, -285, 0.04);
  for (let x = 185; x < 380; x += 12) flat(6, 0.5, paint, x, -285, 0.06);
  for (const z of [-294.5, -275.5]) flat(208, 0.4, paint, 280, z, 0.06);
  const label = canvasMat(256, 128, (g, w, hh) => { g.fillStyle = '#f2f0e6'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.fillText('09', w / 2, 105); });
  const m = flat(10, 5, label, 200, -285, 0.07); m.rotation.z = -Math.PI / 2;
}

let built = false;
export function buildArmyBase() {
  if (built) return;
  built = true;
  for (const [x, z] of [[180, -382], [382, -382], [180, -180], [382, -180]]) tower(x, z);
  bunker();
  helipads();
  airstrip();
}

/* ---------- napping ---------- */
export const insideBunker = () => Math.abs(P.pos.x - BUNKER.x) < BUNKER.hw - 0.4 && Math.abs(P.pos.z - BUNKER.z) < BUNKER.hd - 0.4 && P.y < 2;
export const bedNear = () => !P.vehicle && !P.kong && !P.nap && P.pos.distanceTo(bed) < 2.2 && P.y < 1;

let night = false;
export function startNap() {
  if (!bedNear()) return;
  P.nap = { t: 0, woke: false };
  P.ads = false; P.firing = false;
  $('nap').hidden = false;
  requestAnimationFrame(() => $('nap').classList.add('dark'));
  say('Good night, Joseph.');
}

export function updateNap(dt) {
  if (bunkerRoof) bunkerRoof.visible = !(insideBunker() || P.nap);
  const n = P.nap;
  if (!n) return false;
  n.t += dt;
  P.inv = Math.max(P.inv, 1);
  if (n.t > 4 && !n.woke) {
    n.woke = true;
    // a good nap: all hearts back; in free play the sun goes down (or comes up) while you sleep
    P.hearts = GAME.hero.hearts;
    if (world.mode === 'free') { night = !night; applyTheme(night ? 'night' : 'day'); setMapTheme(night ? 'night' : 'day'); }
    $('nap').classList.remove('dark');
  }
  if (n.t > 5.2) {
    P.nap = null;
    $('nap').hidden = true;
    sfx.save();
    world.banner?.(world.mode === 'free' ? (night ? 'GOOD EVENING!<small>All hearts back. It got dark!</small>' : 'GOOD MORNING!<small>All hearts back!</small>') : 'GOOD MORNING!<small>All hearts back!</small>', 2600);
    say(night && world.mode === 'free' ? 'Good evening! It got dark!' : 'Good morning!');
  }
  return true;
}

/* While napping the camera lies on the pillow and looks up at the ceiling. */
export function napCamera(camera) {
  if (!P.nap) return false;
  camera.position.set(bed.x, 1.05, bed.z - 0.75);
  camera.lookAt(bed.x + 0.2, 4, bed.z + 0.6);
  return true;
}
export const resetDayNight = () => { night = false; };
