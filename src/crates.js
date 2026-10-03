// Breakable crates (wood and army ammo boxes) that drop rewards, and red barrels that explode.
// Shoot them, punch them as Kong, or ram them with a car.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './engine.js';
import { burstDebris, fireball, shake, sparks } from './fx.js';
import { sfx } from './audio.js';
import { dropLoot } from './loot.js';
import { V3, rnd, world, flatDist } from './world.js';
import { ROADS, DISTRICTS, smashNear } from './map.js';

const KINDS = {
  wood:   { hp: 2, radius: 0.9, aimY: 0.6, color: 0x8a6a42, debris: 0x7a5a32 },
  ammo:   { hp: 3, radius: 0.9, aimY: 0.5, color: 0x4a5a32, debris: 0x3a4a28 },
  barrel: { hp: 1, radius: 0.7, aimY: 0.7, color: 0xb3261e, debris: 0x7a1a14 },
};
const MAX = { wood: 340, ammo: 140, barrel: 150 };
const meshes = {};
const dummy = new THREE.Object3D();

function plankTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a07a4a'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, 128, 3); }
  g.strokeStyle = 'rgba(40,25,10,0.7)'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.beginPath(); g.moveTo(8, 8); g.lineTo(120, 120); g.stroke();
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,35,15,${Math.random() * 0.15})`; g.fillRect(Math.random() * 128, Math.random() * 128, 18, 1); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
}
function barrelTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c0281f'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 18, 128, 6); g.fillRect(0, 104, 128, 6);
  g.fillStyle = '#ffd400'; g.fillRect(0, 52, 128, 24);
  g.fillStyle = '#1b1b1b'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.fillText('🔥 BOOM', 64, 71);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  return t;
}

function ensureMeshes() {
  if (meshes.wood) return;
  const make = (kind, geo, mat) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX[kind]);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.count = 0;
    scene.add(m);
    meshes[kind] = m;
  };
  make('wood', new RoundedBoxGeometry(1.4, 1.2, 1.4, 2, 0.05).translate(0, 0.6, 0), new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.85 }));
  make('ammo', new RoundedBoxGeometry(1.6, 0.9, 1.0, 2, 0.06).translate(0, 0.45, 0), new THREE.MeshStandardMaterial({ color: 0x4a5a32, roughness: 0.6, metalness: 0.4 }));
  make('barrel', new THREE.CylinderGeometry(0.6, 0.6, 1.5, 18).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.45, metalness: 0.5 }));
}

function writeMatrix(c) {
  dummy.position.copy(c.pos);
  dummy.rotation.set(0, c.ry, 0);
  dummy.scale.setScalar(c.alive ? 1 : 0.0001);
  dummy.updateMatrix();
  meshes[c.kind].setMatrixAt(c.index, dummy.matrix);
  meshes[c.kind].instanceMatrix.needsUpdate = true;
}

function place(kind, pos) {
  const m = meshes[kind];
  if (m.count >= MAX[kind]) return null;
  const k = KINDS[kind];
  const c = {
    kind, index: m.count++, pos: pos.clone(), ry: rnd(0, Math.PI), hp: k.hp, radius: k.radius, aimY: k.aimY, alive: true, isProp: true,
    hit: (dmg, opts = {}) => hitCrate(c, dmg, opts),
  };
  writeMatrix(c);
  world.breakables.push(c);
  return c;
}

/* Rewards inside crates: hearts and armor are common; soldiers and FULL AUTO are the exciting finds. */
function crateLoot(c) {
  const roll = Math.random();
  const kind = c.kind === 'ammo'
    ? (roll < 0.35 ? 'auto' : roll < 0.6 ? 'power' : roll < 0.8 ? 'rate' : 'soldier2')
    : (roll < 0.3 ? 'heart' : roll < 0.5 ? 'armor' : roll < 0.62 ? 'soldier1' : roll < 0.7 ? 'soldier2' : roll < 0.73 ? 'soldier5' : roll < 0.85 ? 'power' : 'auto');
  dropLoot(c.pos, kind);
}

export function breakCrate(c) {
  if (!c.alive) return;
  c.alive = false;
  writeMatrix(c);
  const k = KINDS[c.kind];
  burstDebris(c.pos.clone().setY(0.7), k.debris, 14, 7, 0.35, 1.2);
  if (c.kind === 'barrel') {
    fireball(c.pos.clone().setY(1), 6);
    sfx.boom(); shake(0.6);
    for (const e of world.enemies) if (e.alive && flatDist(e.pos, c.pos) < 7) e.hit(8, { from: c.pos });
    if (world.bossTarget?.alive && flatDist(world.bossTarget.pos, c.pos) < 7 + world.bossTarget.radius) world.bossTarget.hit(15, { from: c.pos });
    for (const o of world.breakables) if (o.alive && o !== c && flatDist(o.pos, c.pos) < 5) setTimeout(() => breakCrate(o), 150);
    smashNear(c.pos, 1.5);
  } else {
    sfx.pop();
    crateLoot(c);
  }
}

function hitCrate(c, dmg) {
  if (!c.alive) return;
  c.hp -= dmg;
  sparks(c.pos.clone().setY(c.aimY + 0.3), 0xffd27a, 3, 4, 0.3);
  if (c.hp <= 0) breakCrate(c);
}

/* Anything that smashes (Kong, cars, tanks) breaks crates it touches. */
export function breakNear(pos, r) {
  for (const c of world.breakables) if (c.alive && flatDist(c.pos, pos) < r + c.radius) breakCrate(c);
}

function sidewalkSpot(r) {
  const t = rnd(0.05, 0.95), alongX = Math.abs(r.x1 - r.x0) > 1;
  const off = (Math.random() < 0.5 ? -1 : 1) * (r.w / 2 - rnd(0.8, 1.2)); // at the curb, never inside a building
  return new V3(r.x0 + (r.x1 - r.x0) * t + (alongX ? 0 : off), 0, r.z0 + (r.z1 - r.z0) * t + (alongX ? off : 0));
}

/* Scatter crates and barrels around the map (fresh for every level). */
export function scatterCrates() {
  ensureMeshes();
  for (const m of Object.values(meshes)) m.count = 0;
  world.breakables = [];
  for (const r of ROADS) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const n = Math.round(len / (r.kind === 'highway' ? 70 : 45));
    for (let i = 0; i < n; i++) {
      const p = sidewalkSpot(r);
      const roll = Math.random();
      place(roll < 0.55 ? 'wood' : roll < 0.75 ? 'ammo' : 'barrel', p);
      if (Math.random() < 0.35) place('wood', p.clone().add(new V3(rnd(-1.6, 1.6), 0, rnd(-1.6, 1.6))));
    }
  }
  // stockpiles at the army base and the airport
  for (let i = 0; i < 14; i++) place(i % 3 ? 'ammo' : 'barrel', new V3(rnd(200, 260), 0, rnd(-300, -270)));
  for (let i = 0; i < 8; i++) place(i % 2 ? 'wood' : 'barrel', new V3(rnd(270, 300), 0, rnd(150, 230)));
  // red barrels in monster land make big booms
  const v = DISTRICTS.volcano;
  for (let i = 0; i < 20; i++) place('barrel', new V3(rnd(v.x0 + 20, v.x1 - 20), 0, rnd(v.z0 + 20, v.z1 - 20)));
}

/* Crates placed on purpose (around camps, on rooftops). */
export function placeCrate(kind, pos) { ensureMeshes(); return place(kind, pos); }
