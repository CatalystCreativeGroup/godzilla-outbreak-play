// The Godzilla boss of each city: falls from the sky, bites, stomps shockwaves, charges, and (bigger ones) breathes.
import * as THREE from 'three';
import { scene } from './engine.js';
import { GAME } from './settings.js';
import { spawnModel, setGlow, disposeModel } from './models.js';
import { smashNear } from './city.js';
import { spit } from './weapons.js';
import { addPower } from './hero.js';
import { sfx, say } from './audio.js';
import { addRing, shake, smoke, burstDebris, sparks, popWord, ember } from './fx.js';
import { wordTexture } from './textures.js';
import { V3, rnd, clamp, world, P, flatDist, angleTo, turnToward } from './world.js';

let model = null, cfg = null;
const B = { pos: new V3(), y: 0, vy: 0, hp: 1, max: 1, face: 0, mode: 'hidden', t: 0, biteCd: 1, stompCd: 4, chargeCd: 9, breathCd: 6, chargeDir: new V3(), hitThisCharge: false, stun: 0, mad: false, flash: 0, target: null };
export const bossState = B;

const BREATH_COLORS = { normal: 0x9dff4a, water: 0x5ac8ff, lava: 0xff7a2a, all: 0xc77dff };
const WEAKNESS = { water: 'shock', lava: 'ice' };

const stunStars = new THREE.Group();
for (let i = 0; i < 4; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture('★', '#ffd23f'), transparent: true, depthTest: false, toneMapped: false }));
  s.scale.setScalar(2); stunStars.add(s);
}
stunStars.visible = false;
scene.add(stunStars);

/* What bullets and Kong's fists hit. */
export const bossTarget = {
  pos: B.pos, aimY: 4, radius: 3,
  get alive() { return B.mode !== 'hidden' && B.mode !== 'dead' && B.mode !== 'falling' && B.mode !== 'intro'; },
  hit: (dmg, opts = {}) => damageBoss(dmg, opts),
  stun: s => { if (B.mode !== 'dead') { B.stun = s; B.mode = 'walk'; B.y = 0; } },
};

export function setupBoss(bossCfg) {
  if (model) disposeModel(model);
  cfg = bossCfg;
  model = spawnModel('godzilla', { tint: cfg.tint, sizeMul: cfg.size });
  model.root.visible = false;
  scene.add(model.root);
  const hp = Math.round(cfg.health * GAME.difficulty);
  Object.assign(B, { hp, max: hp, mode: 'hidden', t: 0, y: 0, vy: 0, stun: 0, mad: false, biteCd: 1, stompCd: 4, chargeCd: 9, breathCd: 6 });
  bossTarget.aimY = 4.2 * cfg.size;
  bossTarget.radius = 2.8 * cfg.size;
  world.bossTarget = null;
}

export function bossArrives() {
  B.mode = 'falling'; B.y = 70; B.vy = 0;
  B.pos.set(0, 0, -4);
  if (flatDist(P.pos, B.pos) < 12) B.pos.set(0, 0, P.pos.z < 0 ? 12 : -12);
  B.face = angleTo(B.pos, P.pos);
  model.root.visible = true;
  world.bossTarget = bossTarget;
  world.banner?.(cfg.name + '<small>is coming!</small>', 2600);
  say(cfg.name.toLowerCase() + ' is coming!');
}

function damageBoss(d, { element = null, kong = false, knock = 0, from = null } = {}) {
  if (B.hp <= 0 || !bossTarget.alive) return;
  const weak = WEAKNESS[cfg.element] && element === WEAKNESS[cfg.element];
  const mul = weak ? 2 : cfg.element === 'all' && element ? 1.3 : 1;
  B.hp -= d * mul; B.flash = 0.08;
  if (weak && Math.random() < 0.15) popWord('SUPER!', new V3(B.pos.x, 10 * cfg.size, B.pos.z), '#7fe0ff', 4);
  if (!kong) addPower(GAME.power.perZapOnBoss);
  if (knock && from) B.pos.addScaledVector(B.pos.clone().sub(from).setY(0).normalize(), knock);
  sfx.hit();
  if (!B.mad && B.hp <= B.max / 2) {
    B.mad = true;
    world.banner?.(cfg.name + '<small>is MAD!</small>', 2000);
    sfx.roar();
    model.anim.once('roar', { speed: 1.2 });
  }
  if (B.hp <= 0) {
    B.hp = 0; B.mode = 'dead'; B.t = 0;
    world.banner?.('YOU DID IT!', 2500);
    say('You did it!');
    sfx.roar();
  }
}

/* Joseph or the nearest standing soldier. Joseph is a bit more interesting to bosses. */
function chooseTarget() {
  let best = P.ko <= 0 ? { pos: P.pos, hurt: n => world.hurtPlayer(n), isHero: true } : null;
  let bd = best ? flatDist(P.pos, B.pos) * 0.75 : Infinity;
  for (const a of world.allies) {
    if (!a.alive) continue;
    const d = flatDist(a.pos, B.pos);
    if (d < bd) { bd = d; best = { pos: a.pos, hurt: n => a.hurt(n), isHero: false }; }
  }
  return best;
}

function hurtNear(center, range, n) {
  if (P.ko <= 0 && flatDist(P.pos, center) < range + (P.kong ? 3 : 0)) world.hurtPlayer(n);
  for (const a of world.allies) if (a.alive && flatDist(a.pos, center) < range) a.hurt(n);
}

function stompRing() {
  const radius = (B.mad ? 24 : 17) * Math.sqrt(cfg.size);
  const color = cfg.element === 'water' ? 0x5ac8ff : cfg.element === 'lava' ? 0xff5a1a : cfg.element === 'all' ? 0xc77dff : 0xff8a3d;
  addRing(B.pos, radius, color, (center, r, hits) => {
    if (world.state !== 'boss') return;
    if (!hits.has('hero') && P.ko <= 0 && Math.abs(flatDist(center, P.pos) - r) < (P.kong ? 2.5 : 1.3) && (P.kong || P.y < 0.6)) { hits.add('hero'); world.hurtPlayer(1); }
    world.allies.forEach((a, i) => {
      if (!hits.has(i) && a.alive && Math.abs(flatDist(center, a.pos) - r) < 1.3) { hits.add(i); a.hurt(1); }
    });
  });
  if (cfg.element === 'lava' || cfg.element === 'all') for (let i = 0; i < 20; i++) ember(new V3(B.pos.x + rnd(-6, 6), 0.5, B.pos.z + rnd(-6, 6)));
}

function breathe(target) {
  const color = BREATH_COLORS[cfg.element] || BREATH_COLORS.normal;
  const mouth = new V3(B.pos.x + Math.sin(B.face) * 3 * cfg.size, 6.5 * cfg.size, B.pos.z + Math.cos(B.face) * 3 * cfg.size);
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      if (B.mode === 'dead' || world.state !== 'boss') return;
      const aim = target.pos.clone().add(new V3(rnd(-2, 2), 0, rnd(-2, 2)));
      spit(mouth, aim, 1, color, 26);
    }, i * 110);
  }
}

export function updateBoss(dt) {
  if (!model || B.mode === 'hidden') return;
  const g = model.root, s = cfg.size;
  B.t += dt;
  B.flash = Math.max(0, B.flash - dt);
  const charging = B.mode === 'charge' && B.t < 0.8 && Math.sin(B.t * 40) > 0;
  setGlow(model, B.flash > 0 ? 0x666666 : charging ? 0x881111 : B.mad ? 0x330000 : 0x000000, 1);

  if (B.mode === 'falling') {
    B.vy -= 60 * dt; B.y += B.vy * dt;
    model.anim.hold('walk', 0.2);
    if (B.y <= 0) {
      B.y = 0; B.mode = 'intro'; B.t = 0;
      shake(1.4); sfx.boom(); sfx.roar();
      addRing(B.pos, 24, 0xff9a3d);
      burstDebris(new V3(B.pos.x, 0.5, B.pos.z), 0x8d8a84, 30, 16, 0.9);
      smoke(new V3(B.pos.x, 1, B.pos.z), 12, 5, 0xb7ab98, 6);
      model.anim.once('roar', { speed: 1 });
    }
  } else if (B.mode === 'intro') {
    if (B.t > 2.2) { B.mode = 'walk'; B.t = 0; world.state = 'boss'; }
  } else if (B.mode === 'dead') {
    g.rotation.z = Math.min(Math.PI / 2, B.t * 1.6);
    if (B.t > 0.9 && B.t - dt <= 0.9) { shake(1.2); sfx.boom(); smoke(new V3(B.pos.x, 1, B.pos.z), 14, 5, 0xb7ab98, 6); }
    if (B.t > 2.8) g.scale.setScalar(Math.max(0.01, 1 - (B.t - 2.8) * 2));
    if (B.t > 3.4 && (world.state === 'boss' || world.state === 'bossIntro')) { world.bossTarget = null; world.onBossDefeated?.(); }
  } else if (B.stun > 0) {
    B.stun -= dt;
    g.rotation.z = Math.sin(B.t * 6) * 0.08;
    model.anim.hold('walk', 0.5);
  } else {
    g.rotation.z = 0;
    think(dt, s);
  }

  g.position.set(B.pos.x, B.y, B.pos.z);
  g.rotation.y = B.face;
  model.anim.update(dt);

  stunStars.visible = B.stun > 0 && B.mode !== 'dead';
  if (stunStars.visible) {
    stunStars.position.set(B.pos.x, 9.5 * s, B.pos.z);
    stunStars.children.forEach((st, i) => { const a = B.t * 4 + i * Math.PI / 2; st.position.set(Math.cos(a) * 2.6 * s, Math.sin(B.t * 6 + i) * 0.3, Math.sin(a) * 2.6 * s); });
  }
}

function think(dt, s) {
  const target = chooseTarget();
  const speed = cfg.speed * (B.mad ? 1.4 : 1);
  B.biteCd -= dt; B.stompCd -= dt; B.chargeCd -= dt; B.breathCd -= dt;
  if (B.mode === 'walk') {
    if (!target) { model.anim.hold('walk', 0.3); return; }
    const toT = target.pos.clone().sub(B.pos).setY(0), dist = toT.length();
    const reach = (target.isHero && P.kong ? 8.5 : 5) * Math.max(1, s * 0.8);
    B.face = turnToward(B.face, Math.atan2(toT.x, toT.z), dt * 5);
    if (dist > reach - 1) {
      B.pos.addScaledVector(toT.normalize(), speed * dt);
      smashNear(B.pos, 3 * s);
      model.anim.play('walk', { speed: 0.9 * (B.mad ? 1.3 : 1) });
    } else model.anim.hold('walk', 0.3);
    if (dist < reach + 1 && B.biteCd <= 0) { B.mode = 'bite'; B.t = 0; B.target = target; model.anim.once('bite', { speed: 1.2 }); }
    else if (B.breathCd <= 0 && cfg.element !== 'normal' && dist > 9 && dist < 34) { B.mode = 'breath'; B.t = 0; B.target = target; model.anim.once('roar', { speed: 1.6 }); }
    else if (B.stompCd <= 0 && dist < 28) { B.mode = 'stomp'; B.t = 0; }
    else if (B.chargeCd <= 0 && dist > 10) { B.mode = 'charge'; B.t = 0; B.chargeDir.copy(toT).normalize(); B.hitThisCharge = false; }
  } else if (B.mode === 'bite') {
    if (B.t >= 0.5 && B.t - dt < 0.5) { hurtNear(B.pos.clone().addScaledVector(new V3(Math.sin(B.face), 0, Math.cos(B.face)), 3 * s), 4 * s, 1); sfx.hit(); }
    if (B.t > 1.0) { B.mode = 'walk'; B.t = 0; B.biteCd = B.mad ? 1.1 : 1.7; }
  } else if (B.mode === 'breath') {
    if (B.t >= 0.4 && B.t - dt < 0.4 && B.target) breathe(B.target);
    if (B.t > 1.3) { B.mode = 'walk'; B.t = 0; B.breathCd = B.mad ? rnd(4, 6) : rnd(6, 9); }
  } else if (B.mode === 'stomp') {
    model.anim.hold('walk', 0.25);
    if (B.t < 0.6) B.y = Math.sin(B.t / 0.6 * Math.PI) * 4;
    if (B.t >= 0.6 && B.t - dt < 0.6) {
      B.y = 0; shake(1); sfx.boom();
      stompRing();
      if (B.mad) setTimeout(() => { if (B.mode !== 'dead' && world.state === 'boss') stompRing(); }, 450);
    }
    if (B.t > 1.1) { B.mode = 'walk'; B.t = 0; B.stompCd = B.mad ? rnd(3.5, 5) : rnd(5.5, 7.5); }
  } else if (B.mode === 'charge') {
    if (B.t < 0.8) { B.face = Math.atan2(B.chargeDir.x, B.chargeDir.z); model.anim.hold('walk', 0.1); }
    else if (B.t < 2.0) {
      model.anim.play('walk', { speed: 2.2 });
      B.pos.addScaledVector(B.chargeDir, (B.mad ? 26 : 21) * dt);
      smashNear(B.pos, 3.4 * s);
      if (!B.hitThisCharge && P.ko <= 0 && flatDist(B.pos, P.pos) < (P.kong ? 6 : 3.5) * Math.max(1, s * 0.7)) { B.hitThisCharge = true; world.hurtPlayer(1); }
      for (const a of world.allies) if (a.alive && flatDist(B.pos, a.pos) < 3.5 * s) a.hurt(1);
      if (Math.random() < 0.5) smoke(new V3(B.pos.x, 0.5, B.pos.z), 1, 2, 0xb7ab98, 1, 1.2);
    } else { B.mode = 'walk'; B.t = 0; B.chargeCd = B.mad ? rnd(6, 8) : rnd(9, 12); }
  }
  B.pos.x = clamp(B.pos.x, -96, 96); B.pos.z = clamp(B.pos.z, -96, 96);
  // don't stand inside the hero
  const minD = (P.kong ? 6.5 : 3.4) + (s - 1) * 2, d = flatDist(P.pos, B.pos);
  if (d < minD && d > 0.01) P.pos.add(P.pos.clone().sub(B.pos).setY(0).normalize().multiplyScalar(minD - d));
}

/* Title screen: the boss roars in the park. */
export function poseBossForTitle(dt) {
  if (!model) return;
  model.root.visible = true;
  B.pos.set(0, 0, -6); B.face = 0;
  model.root.position.set(0, 0, -6); model.root.rotation.set(0, 0, 0);
  if (!model.anim.busy()) {
    if (Math.random() < 0.006) model.anim.once('roar');
    else model.anim.hold('walk', 0.3);
  }
  model.anim.update(dt);
}

export function hideBoss() {
  if (model) model.root.visible = false;
  B.mode = 'hidden';
  world.bossTarget = null;
  stunStars.visible = false;
}

export const bossHealthFraction = () => B.max ? B.hp / B.max : 0;
export const bossName = () => cfg?.name || '';
