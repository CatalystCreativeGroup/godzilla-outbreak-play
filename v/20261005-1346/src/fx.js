// Visual effects: concrete debris, smoke and dust, sparks and fire, shockwave rings, lightning bolts, floating words, camera shake.
import * as THREE from 'three';
import { scene } from './engine.js';
import { smokeTex, glowTex, wordTexture } from './textures.js';
import { V3, rnd, reduceMotion } from './world.js';

/* ---------- debris chunks (instanced, lit, cast no shadow for speed) ---------- */
const DMAX = 260;
const debrisMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }),
  DMAX,
);
debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debrisMesh.frustumCulled = false;
scene.add(debrisMesh);
const debris = [];
const dummy = new THREE.Object3D(), tmpColor = new THREE.Color();
for (let i = 0; i < DMAX; i++) {
  debris.push({ life: 0, max: 1, pos: new V3(), vel: new V3(), size: 0.3, spin: new V3() });
  debrisMesh.setColorAt(i, tmpColor.set(0xffffff));
}
let dNext = 0;

export function burstDebris(pos, color, n, speed, size, life = 1.6) {
  for (let i = 0; i < n; i++) {
    const p = debris[dNext];
    debrisMesh.setColorAt(dNext, tmpColor.set(color).multiplyScalar(rnd(0.7, 1.1)));
    dNext = (dNext + 1) % DMAX;
    p.pos.copy(pos).add(new V3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).multiplyScalar(size * 2));
    p.vel.set(rnd(-1, 1), rnd(0.4, 1.3), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1));
    p.size = size * rnd(0.4, 1.3); p.life = p.max = life * rnd(0.7, 1.2);
    p.spin.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
  }
  debrisMesh.instanceColor.needsUpdate = true;
}

function updateDebris(dt) {
  for (let i = 0; i < DMAX; i++) {
    const p = debris[i];
    if (p.life > 0) {
      p.life -= dt;
      p.vel.y -= 24 * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.size * 0.5) { p.pos.y = p.size * 0.5; p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.6); }
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.life * p.spin.x, p.life * p.spin.y, p.life * p.spin.z);
      dummy.scale.setScalar(Math.max(0, p.size * Math.min(1, p.life / (p.max * 0.3))));
    } else dummy.scale.setScalar(0);
    dummy.updateMatrix();
    debrisMesh.setMatrixAt(i, dummy.matrix);
  }
  debrisMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- soft sprites: smoke, dust, sparks, fire, muzzle flashes ---------- */
const SMAX = 240;
const sprites = [];
for (let i = 0; i < SMAX; i++) {
  const m = new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 });
  const s = new THREE.Sprite(m);
  s.visible = false;
  scene.add(s);
  sprites.push({ s, life: 0, max: 1, vel: new V3(), grow: 1, start: 1, alpha: 1, grav: 0, drag: 0.6, glow: false });
}
let sNext = 0;

function spawnSprite({ pos, vel, size, grow = 1.5, life = 1.5, color = 0xffffff, alpha = 0.6, glow = false, grav = 0, drag = 0.6 }) {
  const p = sprites[sNext];
  sNext = (sNext + 1) % SMAX;
  const m = p.s.material;
  if (p.glow !== glow) {
    m.map = glow ? glowTex : smokeTex;
    m.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.toneMapped = !glow;
    m.fog = !glow;
    m.needsUpdate = true;
    p.glow = glow;
  }
  m.color.set(color);
  m.rotation = rnd(0, Math.PI * 2);
  p.s.position.copy(pos);
  p.vel.copy(vel || new V3());
  p.start = size; p.grow = grow; p.life = p.max = life; p.alpha = alpha; p.grav = grav; p.drag = drag;
  p.s.scale.setScalar(size);
  p.s.visible = true;
  return p;
}

function updateSprites(dt) {
  for (const p of sprites) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) { p.s.visible = false; continue; }
    const k = 1 - p.life / p.max;
    p.vel.y -= p.grav * dt;
    p.vel.multiplyScalar(Math.pow(p.drag, dt));
    p.s.position.addScaledVector(p.vel, dt);
    p.s.scale.setScalar(p.start * (1 + k * p.grow));
    const fadeIn = Math.min(1, k * 8);
    p.s.material.opacity = p.alpha * fadeIn * (1 - k);
  }
}

export function smoke(pos, n = 6, size = 3, color = 0x9a958c, spread = 2, life = 2.4) {
  for (let i = 0; i < n; i++) {
    spawnSprite({
      pos: pos.clone().add(new V3(rnd(-spread, spread), rnd(0, spread), rnd(-spread, spread))),
      vel: new V3(rnd(-1, 1), rnd(1, 3), rnd(-1, 1)),
      size: size * rnd(0.7, 1.3), grow: 2, life: life * rnd(0.7, 1.2), color, alpha: 0.55,
    });
  }
}

export function dustRing(pos, radius, n = 14, color = 0xb7ab98) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    spawnSprite({
      pos: new V3(pos.x + Math.cos(a) * radius * 0.3, 0.6, pos.z + Math.sin(a) * radius * 0.3),
      vel: new V3(Math.cos(a) * radius * 1.2, rnd(0.5, 1.5), Math.sin(a) * radius * 1.2),
      size: radius * 0.35, grow: 2.5, life: 1.4, color, alpha: 0.5, drag: 0.15,
    });
  }
}

export function sparks(pos, color = 0xffd27a, n = 8, speed = 8, size = 0.5) {
  for (let i = 0; i < n; i++) {
    spawnSprite({
      pos: pos.clone(), vel: new V3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.4, 1)),
      size: size * rnd(0.5, 1.2), grow: -0.6, life: rnd(0.2, 0.45), color, alpha: 1, glow: true, grav: 18, drag: 0.3,
    });
  }
}

export function flash(pos, color = 0xfff0b0, size = 1.6) {
  spawnSprite({ pos, size, grow: 0.4, life: 0.08, color, alpha: 1, glow: true });
}

export function fireball(pos, size = 5) {
  for (let i = 0; i < 10; i++) {
    spawnSprite({
      pos: pos.clone().add(new V3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).multiplyScalar(size * 0.3)),
      vel: new V3(rnd(-1, 1), rnd(0.5, 2), rnd(-1, 1)).multiplyScalar(size * 0.6),
      size: size * rnd(0.4, 0.8), grow: 1, life: rnd(0.35, 0.6), color: i % 2 ? 0xff9a3d : 0xffd27a, alpha: 1, glow: true, drag: 0.2,
    });
  }
  smoke(pos, 6, size * 0.8, 0x4a4540, size * 0.4, 2.6);
}

export function ember(pos, color = 0xff7a2a) {
  spawnSprite({ pos, vel: new V3(rnd(-0.5, 0.5), rnd(1.5, 3), rnd(-0.5, 0.5)), size: rnd(0.15, 0.35), grow: -0.5, life: rnd(1, 2), color, alpha: 1, glow: true, drag: 0.8 });
}

/* ---------- shockwave rings ---------- */
const rings = [];
const ringGeo = new THREE.RingGeometry(0.86, 1, 64);
ringGeo.rotateX(-Math.PI / 2);
export function addRing(pos, maxR, color, onExpand) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  m.position.set(pos.x, 0.3, pos.z);
  scene.add(m);
  rings.push({ m, r: 0.5, maxR, onExpand, hits: new Set() });
  dustRing(pos, maxR * 0.25);
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.r += dt * r.maxR * 1.1;
    r.m.scale.setScalar(r.r);
    r.m.material.opacity = 0.85 * (1 - r.r / r.maxR);
    if (r.onExpand) r.onExpand(r.m.position, r.r, r.hits);
    if (r.r >= r.maxR) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
}

/* ---------- lightning bolts ---------- */
const bolts = [];
export function bolt(from, to, color = 0xc8b8ff) {
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const p = from.clone().lerp(to, i / n);
    if (i > 0 && i < n) p.add(new V3(rnd(-0.6, 0.6), rnd(-0.6, 0.6), rnd(-0.6, 0.6)));
    pts.push(p);
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(line);
  bolts.push({ line, life: 0.14 });
  flash(to.clone(), color, 1.8);
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.line.material.opacity = Math.max(0, b.life / 0.14);
    if (b.life <= 0) { scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); bolts.splice(i, 1); }
  }
}

/* ---------- floating words ---------- */
const words = [];
export function popWord(text, pos, fill = '#ffd23f', scale = 3) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture(text, fill), transparent: true, depthTest: false, toneMapped: false, fog: false }));
  s.position.copy(pos); s.scale.setScalar(scale); s.renderOrder = 10;
  scene.add(s);
  words.push({ s, life: 1, base: scale });
}
function updateWords(dt) {
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    w.life -= dt;
    w.s.position.y += dt * 3;
    const k = w.life > 0.8 ? 1 + (w.life - 0.8) * 3 : 1;
    w.s.scale.setScalar(w.base * k);
    w.s.material.opacity = Math.min(1, w.life * 2.5);
    if (w.life <= 0) { scene.remove(w.s); w.s.material.dispose(); words.splice(i, 1); }
  }
}

/* ---------- floating dust in the air, around the camera ---------- */
const MOTES = 220;
const moteGeo = new THREE.BufferGeometry();
moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
const moteMat = new THREE.PointsMaterial({ map: glowTex, size: 0.18, transparent: true, opacity: 0.5, depthWrite: false, color: 0xfff4e0 });
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled = false;
scene.add(motes);
const moteVel = Array.from({ length: MOTES }, () => new V3(rnd(-0.4, 0.4), rnd(-0.1, 0.25), rnd(-0.4, 0.4)));
let moteCenter = new V3();
export function setMoteColor(hex, size = 0.18) { moteMat.color.setHex(hex); moteMat.size = size; }
function updateMotes(dt, focus) {
  const a = moteGeo.attributes.position.array;
  if (moteCenter.distanceTo(focus) > 40) {
    moteCenter = focus.clone();
    for (let i = 0; i < MOTES; i++) { a[i * 3] = focus.x + rnd(-30, 30); a[i * 3 + 1] = rnd(0, 18); a[i * 3 + 2] = focus.z + rnd(-30, 30); }
  }
  for (let i = 0; i < MOTES; i++) {
    a[i * 3] += moteVel[i].x * dt; a[i * 3 + 1] += moteVel[i].y * dt; a[i * 3 + 2] += moteVel[i].z * dt;
    if (a[i * 3 + 1] > 18) a[i * 3 + 1] = 0;
    if (Math.abs(a[i * 3] - focus.x) > 30) a[i * 3] = focus.x - Math.sign(a[i * 3] - focus.x) * 29;
    if (Math.abs(a[i * 3 + 2] - focus.z) > 30) a[i * 3 + 2] = focus.z - Math.sign(a[i * 3 + 2] - focus.z) * 29;
  }
  moteGeo.attributes.position.needsUpdate = true;
}

/* ---------- camera shake ---------- */
export const shakeState = { amt: 0 };
export function shake(a) { shakeState.amt = Math.max(shakeState.amt, reduceMotion ? a * 0.25 : a); }

export function updateFx(dt, focus) {
  updateDebris(dt);
  updateSprites(dt);
  updateRings(dt);
  updateBolts(dt);
  updateWords(dt);
  updateMotes(dt, focus);
}
