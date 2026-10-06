// Guns: firing, bullets/rockets/lightning, monster spit, and the 3D gun models the heroes hold.
import * as THREE from 'three';
import { scene } from './engine.js';
import { WEAPONS, MAX_WEAPON_LEVEL } from './settings.js';
import { sfx } from './audio.js';
import { sparks, flash, fireball, bolt, shake, smoke } from './fx.js';
import { V3, rnd, world, loadout } from './world.js';
import { smashNear } from './map.js';

/* Damage multiplier for a weapon level (level 1 = x1, each level +30%). */
export const levelMul = lvl => 1 + 0.3 * (Math.min(lvl, MAX_WEAPON_LEVEL) - 1);
/* Faster shooting from fire-rate upgrades (each level shoots 12% faster). */
export const rateMul = () => Math.pow(0.88, loadout.rateLevel - 1);
/* "Every upgrade Joseph gets, the whole team gets." */
export function teamMul() {
  const levels = loadout.owned.reduce((n, w) => n + (loadout.levels[w] || 1) - 1, 0);
  return 1 + 0.12 * levels + 0.1 * (loadout.rateLevel - 1);
}

/* Things bullets can hit: monsters plus the boss when it's in the fight. */
let cacheTime = -1, cache = [];
/* Built once per frame and shared (bullets and soldiers ask many times a frame). */
export function liveTargets() {
  if (cacheTime === world.time) return cache;
  cacheTime = world.time;
  const list = world.enemies.filter(e => e.alive && !e.removed);
  cache = list;
  for (const n of world.nests) if (n.alive) list.push(n);
  if (world.bossTarget && world.bossTarget.alive) list.push(world.bossTarget);
  return list;
}

export function nearestTarget(pos, range) {
  let best = null, bd = range;
  for (const t of liveTargets()) {
    const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) - (t.radius > 2 ? t.radius : 0);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
export const aimPoint = t => new V3(t.pos.x, t.pos.y + t.aimY, t.pos.z);

/* ---------- projectiles ---------- */
const shots = [];
const tracerGeo = new THREE.BoxGeometry(0.12, 0.12, 1.4);
const rocketGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 8).rotateX(Math.PI / 2);
const blobGeo = new THREE.SphereGeometry(0.32, 10, 8);
const glowMats = {};
function glowMat(color) {
  if (!glowMats[color]) glowMats[color] = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  return glowMats[color];
}
const rocketMat = new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.5, metalness: 0.4 });

function spawnShot({ from, dir, speed, damage, color, life, kind = 'bullet', splash = 0, element = null, slow = 0, hostile = false }) {
  const geo = kind === 'rocket' ? rocketGeo : kind === 'blob' ? blobGeo : tracerGeo;
  const mat = kind === 'rocket' ? rocketMat : glowMat(color);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.lookAt(from.clone().add(dir));
  scene.add(m);
  shots.push({ m, dir: dir.clone().normalize(), speed, damage, color, life, kind, splash, element, slow, hostile, prev: from.clone() });
}

const _ab = new V3(), _ac = new V3(), _p = new V3(), _c = new V3();
function segmentHitsSphere(a, b, c, r) {
  _ab.subVectors(b, a);
  const t = Math.max(0, Math.min(1, _ac.subVectors(c, a).dot(_ab) / Math.max(1e-6, _ab.lengthSq())));
  return _p.copy(a).addScaledVector(_ab, t).distanceToSquared(c) < r * r;
}

export function explode(pos, radius, damage, element) {
  fireball(pos, radius);
  sfx.boom(); shake(0.5);
  for (const t of liveTargets().concat(world.breakables.filter(c => c.alive))) {
    const d = Math.hypot(t.pos.x - pos.x, t.pos.z - pos.z) - t.radius;
    if (d < radius) t.hit(damage * (1 - Math.max(0, d) / radius * 0.5), { element, from: pos, heavy: true });
  }
  smashNear(pos, radius * 0.25);
}

/* Crates near a bullet (crates are many, so only nearby ones are checked). */
function nearbyCrates(pos) {
  const out = [];
  for (const c of world.breakables) if (c.alive && Math.abs(c.pos.x - pos.x) < 20 && Math.abs(c.pos.z - pos.z) < 20) out.push(c);
  return out;
}

/* Who can monster spit hit? Joseph and his army. */
let hostileTargets = () => [];
export function setHostileTargets(fn) { hostileTargets = fn; }

export function updateShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.life -= dt;
    s.prev.copy(s.m.position);
    if (s.kind === 'blob') s.dir.y -= 0.9 * dt;
    s.m.position.addScaledVector(s.dir, s.speed * dt);
    if (s.kind === 'rocket' && Math.random() < 0.7) smoke(s.m.position.clone(), 1, 0.6, 0xd8d2c8, 0.1, 1);
    let done = s.life <= 0 || s.m.position.y < 0;
    let hitSomething = false;
    const list = s.hostile ? hostileTargets() : liveTargets().concat(nearbyCrates(s.m.position));
    for (const t of list) {
      const c = _c.set(t.pos.x, t.pos.y + t.aimY, t.pos.z);
      if (!segmentHitsSphere(s.prev, s.m.position, c, t.radius)) continue;
      done = hitSomething = true;
      if (s.hostile) { t.hurt(s.damage, s.prev); sparks(s.m.position.clone(), s.color, 6, 5, 0.4); }
      else if (s.splash) explode(s.m.position.clone(), s.splash, s.damage, s.element);
      else {
        t.hit(s.damage, { element: s.element, slow: s.slow, from: s.prev });
        sparks(s.m.position.clone(), s.color, 5, 6, 0.35);
      }
      break;
    }
    if (done) {
      if (s.splash && !hitSomething) explode(s.m.position.clone().setY(Math.max(0.5, s.m.position.y)), s.splash, s.damage, s.element);
      if (s.kind === 'blob' && !hitSomething) sparks(s.m.position.clone().setY(0.3), 0x9dff4a, 6, 4, 0.4);
      scene.remove(s.m);
      shots.splice(i, 1);
    }
  }
}

export function clearShots() {
  for (const s of shots) scene.remove(s.m);
  shots.length = 0;
}

/* Fire a weapon from `from` toward a target. Used by Joseph and his army. */
export function fireWeapon(id, level, from, target, { damageMul = 1, quiet = false } = {}) {
  const w = WEAPONS[id];
  const dmg = w.damage * levelMul(level) * damageMul;
  const aim = aimPoint(target);
  flash(from.clone(), w.color, id === 'shotgun' || id === 'bazooka' ? 2.4 : 1.3);
  if (id === 'lightning') {
    let src = from, hitSet = new Set(), cur = target;
    for (let k = 0; k < w.chain + Math.floor(level / 2) && cur; k++) {
      bolt(src, aimPoint(cur), w.color);
      cur.hit(dmg, { element: w.element, from: src });
      hitSet.add(cur);
      src = aimPoint(cur);
      cur = liveTargets().filter(t => !hitSet.has(t)).sort((a, b) => a.pos.distanceTo(src) - b.pos.distanceTo(src))
        .find(t => t.pos.distanceTo(src) < 12);
    }
    if (!quiet) sfx.lightning();
    return;
  }
  const baseDir = aim.clone().sub(from).normalize();
  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone().add(new V3(rnd(-w.spread, w.spread), rnd(-w.spread, w.spread) * 0.4, rnd(-w.spread, w.spread))).normalize();
    spawnShot({
      from, dir, speed: w.speed, damage: dmg, color: w.color, life: w.range / w.speed + 0.15,
      kind: id === 'bazooka' ? 'rocket' : 'bullet', splash: w.splash ? w.splash + level * 0.5 : 0, element: w.element || null, slow: w.slow || 0,
    });
  }
  if (!quiet) (sfx[id] || sfx.blaster)();
}

/* Monster acid spit: a lobbed blob that hurts Joseph or his army. */
export function spit(from, targetPos, damage, color = 0x9dff4a, speed = 20) {
  const dir = targetPos.clone().setY(targetPos.y + 1).sub(from);
  const dist = dir.length();
  dir.normalize(); dir.y += dist * 0.012 * (20 / speed);
  spawnShot({ from, dir, speed, damage, color, life: 2.6, kind: 'blob', hostile: true });
  sfx.spit();
}

/* Gun models live in guns.js. */
export { makeGun, gunMuzzle } from './guns.js';
