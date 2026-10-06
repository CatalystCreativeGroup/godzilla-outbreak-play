// Lizard minions: camp guards and roamers. Three kinds: lizard (bites), spitter (spits acid), brute (big and tough).
import { scene } from './engine.js';
import { GAME } from './settings.js';
import { spawnModel, setGlow, disposeModel, inView } from './models.js';
import { collide, blocked, roadPointIn } from './map.js';
import { spit } from './weapons.js';
import { maybeDrop } from './loot.js';
import { sfx } from './audio.js';
import { sparks, popWord, smoke, fireball, shake } from './fx.js';
import { V3, rnd, world, P, flatDist, angleTo, turnToward , loadout } from './world.js';

const TYPES = {
  lizard:  { hp: () => GAME.monsters.lizardHp,  speed: 1,    size: 1,   tint: null,     damage: 1, reach: 1.6, radius: 0.9 },
  spitter: { hp: () => GAME.monsters.spitterHp, speed: 0.85, size: 0.95, tint: 0x9cff7a, damage: 1, reach: 11, radius: 0.9 },
  brute:   { hp: () => GAME.monsters.bruteHp,   speed: 0.7,  size: 1.75, tint: 0xff9a8a, damage: 2, reach: 2.6, radius: 1.5 },
  jumper:  { hp: () => GAME.monsters.lizardHp,  speed: 1.35, size: 0.85, tint: 0xd8ff5a, damage: 1, reach: 8,   radius: 0.8 },
  bomber:  { hp: () => 2,                        speed: 1.25, size: 1.05, tint: 0xff5a44, damage: 2, reach: 2.4, radius: 0.9 },
};

/* Who monsters attack: Joseph and his army (anyone standing). */
let victims = () => [];
export function setVictims(fn) { victims = fn; }

function difficulty() {
  return (1 + 0.08 * world.levelIndex) * GAME.difficulty;
}

export function spawnEnemy(type, pos, camp = null) {
  const t = TYPES[type];
  const model = spawnModel('minion', { tint: t.tint, sizeMul: t.size });
  model.root.position.copy(pos);
  scene.add(model.root);
  model.anim.play('walk', { speed: 0.8 });
  const hp = Math.ceil(t.hp() * difficulty());
  const e = {
    type, t, model, pos: pos.clone(), face: rnd(0, Math.PI * 2), hp, maxHp: hp,
    radius: t.radius, aimY: 1.1 * t.size, alive: true, dying: 0, camp, home: pos.clone(),
    slowT: 0, flashT: 0, attackCd: rnd(0.5, 1.5), wanderT: rnd(1, 3), target: null, frozenGlow: false,
    hit: (dmg, opts = {}) => hitEnemy(e, dmg, opts),
  };
  world.enemies.push(e);
  return e;
}

function hitEnemy(e, dmg, { slow = 0 } = {}) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.flashT = 0.08;
  if (slow) e.slowT = Math.max(e.slowT, slow);
  sfx.hit();
  if (e.hp <= 0) defeatEnemy(e);
}

export function defeatEnemy(e) {
  if (!e.alive) return;
  e.alive = false; e.dying = 0.6;
  sparks(new V3(e.pos.x, 1, e.pos.z), 0x9dff4a, 12, 7, 0.4);
  smoke(new V3(e.pos.x, 0.8, e.pos.z), 3, 1.4, 0x6f6a60, 0.6, 1.4);
  popWord(e.type === 'brute' ? 'KO!' : 'POP!', new V3(e.pos.x, 2.6 * e.t.size, e.pos.z), '#9dff4a', 2.6);
  sfx.pop();
  maybeDrop(e.pos, e.type === 'brute' ? 2.2 : 1);
  world.onEnemyDefeated?.(e);
}

function pickTarget(e, range) {
  let best = null, bd = range;
  for (const v of victims()) {
    const d = flatDist(v.pos, e.pos);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function updateOne(e, dt) {
  if (!e.alive) {
    e.dying -= dt;
    const k = Math.max(0, e.dying / 0.6);
    e.model.root.scale.set(1 + (1 - k) * 0.5, Math.max(0.05, k), 1 + (1 - k) * 0.5);
    if (e.dying <= 0) { disposeModel(e.model); e.removed = true; }
    return;
  }
  // monsters far away sleep; looking through the sniper scope wakes them from further off
  const farAway = flatDist(e.pos, P.pos) > (P.ads && loadout.current === 'sniper' ? 160 : 95);
  e.model.root.visible = !farAway && inView(e.pos, 2.5 * e.t.size);
  if (farAway) return; // sleep when nobody is near (saves the iPad's battery)

  e.flashT -= dt; e.slowT -= dt; e.attackCd -= dt;
  if (e.leap) { updateLeap(e, dt); e.model.anim.update(dt); return; }
  // looking through a scope shows monsters glowing red (infrared), brightest on the one in the sights
  const thermal = (P.adsT || 0) > 0.6 && !P.kong ? [0xff2a10, world.aimTarget === e ? 1.1 : 0.45] : null;
  const glow = e.flashT > 0 ? [0xffffff, 0.6] : e.slowT > 0 ? [0x4fc8ff, 0.5] : thermal;
  if (glow) { setGlow(e.model, glow[0], glow[1]); e.frozenGlow = true; }
  else if (e.frozenGlow) { setGlow(e.model, 0x000000, 0); e.frozenGlow = false; }

  const aggro = GAME.monsters.aggroRange * (e.camp ? 0.95 : 1);
  const target = pickTarget(e, P.kong ? 0 : aggro);
  const speedMul = (e.slowT > 0 ? 0.4 : 1) * e.t.speed * GAME.monsters.speed;
  let move = 0;
  let wantFace = e.face;
  if (target) {
    const d = flatDist(target.pos, e.pos);
    wantFace = angleTo(e.pos, target.pos);
    const keepAway = e.type === 'spitter' ? 8 : 0;
    if (e.type === 'jumper' && d > 3.5 && d < e.t.reach && e.attackCd <= 0 && !e.model.anim.busy()) { attack(e, target); return; }
    if (d > e.t.reach * 0.8 && d > keepAway) move = 1;
    else if (e.type === 'spitter' && d < keepAway - 2) { move = -0.6; }
    if (e.type !== 'jumper' && d < e.t.reach && e.attackCd <= 0 && !e.model.anim.busy()) attack(e, target);
  } else if (e.camp && flatDist(e.pos, e.home) > 7) {
    wantFace = angleTo(e.pos, e.home); move = 0.6;
  } else {
    if ((e.wanderT -= dt) <= 0) { e.face = rnd(0, Math.PI * 2); wantFace = e.face; e.wanderT = rnd(1.5, 3.5); }
    move = 0.35;
  }
  // leash: guards don't chase forever
  if (e.camp && flatDist(e.pos, e.home) > 20) { wantFace = angleTo(e.pos, e.home); move = 1; }

  e.face = turnToward(e.face, wantFace, dt * 8);
  if (!e.model.anim.busy()) {
    const s = speedMul * move * dt;
    e.pos.x += Math.sin(e.face) * s; e.pos.z += Math.cos(e.face) * s;
    collide(e.pos, e.radius * 0.8);
    e.model.anim.play('walk', { speed: Math.max(0.3, Math.abs(move) * speedMul / 3.2) });
  }
  // Kong squashes minions just by walking into them
  if (P.kong && flatDist(e.pos, P.pos) < 3.5) defeatEnemy(e);
  e.model.root.position.set(e.pos.x, 0, e.pos.z);
  e.model.root.rotation.y = e.face;
  if (e.model.root.visible) e.model.anim.update(dt * (e.slowT > 0 ? 0.5 : 1));
}

/* Jumper: a big leap at its target. */
function leap(e, target) {
  e.attackCd = rnd(2.2, 3);
  e.leap = { t: 0, from: e.pos.clone(), to: target.pos.clone(), target };
  e.model.anim.once('attack', { speed: 0.8 });
}
function updateLeap(e, dt) {
  const L = e.leap;
  L.t = Math.min(1, L.t + dt / 0.55);
  e.pos.lerpVectors(L.from, L.to, L.t);
  e.model.root.position.set(e.pos.x, Math.sin(L.t * Math.PI) * 3.5, e.pos.z);
  if (L.t >= 1) {
    e.leap = null;
    smoke(new V3(e.pos.x, 0.5, e.pos.z), 3, 1.5, 0xb7ab98, 1, 1);
    if (L.target.alive && flatDist(L.target.pos, e.pos) < 2.2 && (L.target.elev || 0) < 2) L.target.hurt(e.t.damage, e.pos);
  }
}

/* Bomber: runs up and blows itself up. */
function selfDestruct(e) {
  fireball(new V3(e.pos.x, 1, e.pos.z), 4.5);
  sfx.boom(); shake(0.5);
  for (const v of victims()) if (flatDist(v.pos, e.pos) < 4 && (v.elev || 0) < 3) v.hurt(e.t.damage, e.pos);
  defeatEnemy(e);
}

function attack(e, target) {
  if (e.type === 'jumper') return leap(e, target);
  if (e.type === 'bomber') return selfDestruct(e);
  e.attackCd = e.type === 'spitter' ? rnd(1.8, 2.6) : e.type === 'brute' ? 1.6 : 1.1;
  const dmg = e.t.damage;
  const len = e.model.anim.once('attack', { speed: e.type === 'brute' ? 0.9 : 1.3 }) || 0.4;
  const hitAt = Math.min(0.45, len * 0.5);
  setTimeout(() => {
    if (!e.alive || !target.alive || !(world.state === 'mission' || world.state === 'boss')) return;
    if (e.type === 'spitter') {
      if (!blocked(e.pos, target.pos)) spit(new V3(e.pos.x, 1.4, e.pos.z), target.pos, dmg);
    } else if (flatDist(target.pos, e.pos) < e.t.reach + 0.8 && (target.elev || 0) < 2) target.hurt(dmg, e.pos);
  }, hitAt * 1000);
}

export function updateEnemies(dt) {
  for (const e of world.enemies) updateOne(e, dt);
  if (world.enemies.some(e => e.removed)) world.enemies = world.enemies.filter(e => !e.removed);
}

export function clearEnemies() {
  for (const e of world.enemies) disposeModel(e.model);
  world.enemies = [];
}

/* Spawn a roaming monster somewhere on a road, not right next to Joseph. */
export function spawnRoamer(types, district = null) {
  // most monsters roam the mission district; some wander near Joseph wherever he is
  for (let tries = 0; tries < 20; tries++) {
    const p = Math.random() < 0.6 && district ? roadPointIn(district, P.pos, 26) : roadPointIn(null, P.pos, 30);
    const d = flatDist(p, P.pos);
    if (d > 26 && (d < 120 || district)) return spawnEnemy(types[Math.floor(Math.random() * types.length)], p);
  }
  return null;
}
