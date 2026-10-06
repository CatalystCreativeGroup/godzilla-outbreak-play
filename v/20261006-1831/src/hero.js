// Joseph (aim with the view, hold FIRE, swappable guns) and his King Kong form.
import * as THREE from 'three';
import { scene, camera } from './engine.js';
import { GAME, WEAPONS } from './settings.js';
import { spawnModel, disposeGroup } from './models.js';
import { collide, smashNear, groundAt, EDGE } from './map.js';
import { breakNear } from './crates.js';
import { fireWeapon, liveTargets, aimPoint, makeGun, gunMuzzle, rateMul } from './weapons.js';
import { defeatEnemy } from './enemies.js';
import { sfx, say } from './audio.js';
import { sparks, popWord, addRing, shake, fireball, smoke } from './fx.js';
import { V3, world, P, loadout, playing, flatDist, angleTo, turnToward, clamp } from './world.js';

export let joseph = null, kong = null;
let handGun = null, viewGun = null, gunId = null;
const handPos = new V3();
export const EYE = 2.05;

/* What monsters see when they attack Joseph. */
const heroPos = new V3();
export const heroVictim = {
  get pos() { return heroPos.set(P.pos.x, P.y, P.pos.z); }, aimY: 1.2, radius: 0.9,
  get elev() { return P.y; },
  get alive() { return P.ko <= 0 && P.morphT <= 0 && !P.vehicle; },
  hurt: n => hurtPlayer(n),
};

export function createHero() {
  joseph = spawnModel('joseph');
  kong = spawnModel('kong');
  kong.root.visible = false;
  scene.add(joseph.root, kong.root);
  scene.add(camera); // the first-person gun rides on the camera
  joseph.anim.play('idle');
  kong.anim.hold('walk', 0);
  equipGun();
}

/* Two copies of the current gun: one in Joseph's hand (outside view), one held in front of the camera (first person). */
export function equipGun() {
  if (gunId === loadout.current && handGun) return;
  if (handGun) disposeGroup(handGun);
  if (viewGun) disposeGroup(viewGun);
  gunId = loadout.current;
  handGun = makeGun(gunId, 1.15);
  scene.add(handGun);
  viewGun = makeGun(gunId, 1);
  viewGun.traverse(o => { o.castShadow = false; });
  // how far the sight (top of the gun) sits above the gun's centre, so aiming lines it up with the screen centre
  viewGun.updateMatrixWorld(true);
  viewGun.userData.sightY = new THREE.Box3().setFromObject(viewGun).max.y;
  camera.add(viewGun);
}

export function resetHero(start) {
  Object.assign(P, {
    y: 0, vy: 0, onGround: true, ads: false, adsT: 0, lookActive: 0, climb: null, parachute: false, slowT: 0, vehicle: null, face: Math.PI, yaw: Math.PI, pitch: 0, hearts: GAME.hero.hearts, inv: 0, ko: 0, power: 0, kong: false, kongT: 0, morphT: 0,
    fireCd: 0, aimT: 0, punchCd: 0, punchT: 0, roarCd: 0, roarT: 0, readyToldYou: false, firing: false, recoil: 0,
  });
  P.pos.copy(start);
  joseph.root.visible = true; joseph.root.rotation.set(0, 0, 0);
  kong.root.visible = false;
  equipGun();
}

/* AIM button: raise the gun and look down the sights (toggle). */
export function toggleAim(force) {
  const want = typeof force === 'boolean' ? force : !P.ads;
  if (want && (P.vehicle || P.kong || P.climb || P.morphT > 0)) return;
  P.ads = want;
  P.adsIdle = 0;
  if (want) sfx.pickup();
  world.onAimChange?.(want);
}

// aiming down the sights always looks through the gun, even in the outside view
export const firstPerson = () => (world.view === 'first' || P.ads) && !P.kong && !P.vehicle && world.state !== 'title';

/* ---------- actions ---------- */
export function heroJump() {
  if (!playing() || P.kong || P.ko > 0 || P.morphT > 0 || !P.onGround || P.climb || P.vehicle) return;
  P.vy = GAME.hero.jump; sfx.jump();
}

export function addPower(n) {
  if (P.kong) return;
  const before = P.power;
  P.power = Math.min(100, P.power + n);
  if (before < 100 && P.power >= 100) {
    sfx.ready();
    if (!P.readyToldYou) { world.banner?.('KONG POWER READY!<small>Tap 🦍 MORPH</small>', 2600); say('Kong power ready! Tap morph!'); P.readyToldYou = true; }
  }
}

export function tryMorph() {
  if (!playing() || P.kong || P.vehicle || P.climb || P.power < 100 || P.ko > 0 || P.morphT > 0) return;
  P.morphT = 1.1; P.inv = 99; P.ads = false;
  sfx.morph(); world.flash?.();
}

function kongSeconds() { return GAME.kong.seconds + (loadout.kongPowers.includes('WATER ARMOR') ? 6 : 0); }

function finishMorph() {
  P.kong = true; P.kongT = kongSeconds(); P.power = 0; P.y = 0; P.vy = 0; P.climb = null;
  joseph.root.visible = false; handGun.visible = false; viewGun.visible = false; kong.root.visible = true;
  sparks(new V3(P.pos.x, 4, P.pos.z), 0xffd23f, 30, 16, 0.8);
  addRing(P.pos, 18, 0xffd23f);
  smashNear(P.pos, 4);
  world.setKongMode?.(true); world.flash?.(); shake(1); sfx.roar();
  kong.anim.once('roar', { speed: 1.4 });
  P.inv = 0;
  world.banner?.('KING KONG!', 1600);
  say('King Kong!');
}

function unmorph() {
  P.kong = false; P.inv = 2;
  joseph.root.visible = true; kong.root.visible = false;
  smoke(new V3(P.pos.x, 2, P.pos.z), 8, 3, 0xffffff, 2, 1.2);
  world.setKongMode?.(false); world.flash?.();
  P.readyToldYou = false;
}

export function kongPunch() {
  if (!playing() || !P.kong || P.punchCd > 0) return;
  P.punchCd = 0.42; P.punchT = 0.3;
  kong.anim.once('punch', { speed: 1.8 });
  const fwd = new V3(Math.sin(P.face), 0, Math.cos(P.face));
  const fist = P.pos.clone().addScaledVector(fwd, 5);
  sfx.punch();
  const fire = loadout.kongPowers.includes('FIRE FISTS');
  breakNear(fist, 4);
  let hitSomething = smashNear(fist, 3) > 0;
  const boss = world.bossTarget;
  if (boss && boss.alive && flatDist(P.pos, boss.pos) < GAME.kong.punchRange + boss.radius * 0.3) {
    boss.hit(GAME.kong.punchDamage * (fire ? 1.5 : 1), { kong: true, from: P.pos, knock: loadout.kongPowers.includes('KONG THROW') ? 5 : 2.5 });
    popWord(['POW!', 'BAM!', 'WHAM!', 'BOOM!'][Math.floor(Math.random() * 4)], new V3(boss.pos.x, 9, boss.pos.z), '#ffd23f', 5);
    sparks(new V3(boss.pos.x, 6, boss.pos.z), 0xffffff, 14, 14, 0.6);
    if (fire) fireball(new V3(boss.pos.x, 6, boss.pos.z), 4);
    shake(0.9); hitSomething = true;
  }
  for (const e of world.enemies) if (e.alive && flatDist(e.pos, fist) < 5) { defeatEnemy(e); hitSomething = true; }
  if (!hitSomething) smoke(fist.setY(1), 3, 2, 0xb7ab98, 1, 1);
}

export function kongRoar() {
  if (!playing() || !P.kong || P.roarCd > 0) return;
  P.roarCd = GAME.kong.roarCooldown; P.roarT = 1.2;
  kong.anim.once('roar', { speed: 1.3 });
  sfx.roar(); shake(0.6);
  const pound = loadout.kongPowers.includes('GROUND POUND');
  addRing(P.pos, pound ? 36 : 28, pound ? 0xffb347 : 0xfff1b0);
  popWord('ROAR!', new V3(P.pos.x, 14, P.pos.z), '#ff9a3d', 6);
  const boss = world.bossTarget;
  if (boss && boss.alive && flatDist(P.pos, boss.pos) < 35) {
    boss.stun?.(GAME.kong.roarStun);
    if (pound) boss.hit(12, { kong: true, from: P.pos });
  }
  for (const e of world.enemies) if (e.alive && flatDist(e.pos, P.pos) < (pound ? 30 : 24)) defeatEnemy(e);
}

export function hurtPlayer(n) {
  if (P.inv > 0 || P.ko > 0 || P.morphT > 0) return;
  shake(0.45);
  world.hurtFlash?.();
  if (P.kong) {
    const armor = loadout.kongPowers.includes('WATER ARMOR') ? 0.5 : 1;
    P.kongT = Math.max(0.1, P.kongT - 2.5 * n * armor); P.inv = 0.8; sfx.hurt();
    popWord('OOF!', new V3(P.pos.x, 12, P.pos.z), '#ff6b6b', 4);
    return;
  }
  P.inv = 1.1;
  if (P.armor > 0) {
    const absorbed = Math.min(P.armor, n);
    P.armor -= absorbed; n -= absorbed; sfx.armor();
    sparks(new V3(P.pos.x, 1.4, P.pos.z), 0x5a8cff, 8, 5, 0.4);
  }
  if (n <= 0) return;
  P.hearts -= n; sfx.hurt();
  if (P.hearts <= 0) {
    P.hearts = 0; P.ko = 2.4; P.ads = false;
    world.banner?.('Get up, Joseph!', 1800);
  }
}

/* ---------- aiming ---------- */
/* Where the shot goes: straight out of the view (first person) or along Joseph's facing (outside view). */
function aimDirection() {
  const pitch = firstPerson() ? P.pitch : P.pitch * 0.5;
  return new V3(Math.sin(P.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(P.yaw) * Math.cos(pitch));
}

/* Aim help: the monster closest to the crosshair, if it's within a small cone. */
function findAimTarget(from, dir, range) {
  const cone = THREE.MathUtils.degToRad((firstPerson() ? 7 : 16) * GAME.controls.aimHelp);
  let best = null, bestAngle = cone;
  for (const t of liveTargets()) {
    const to = aimPoint(t).sub(from);
    const dist = to.length();
    if (dist > range + t.radius) continue;
    // big targets (the boss) are easier to hit: widen by their size
    const angle = to.normalize().angleTo(dir) - Math.atan2(t.radius * 0.6, dist);
    if (angle < bestAngle) { bestAngle = angle; best = t; }
  }
  return best;
}

/* When the sight is close to a monster, it gently settles onto it (stronger while aiming down the sights). */
function aimMagnet(dt) {
  const t = world.aimTarget;
  if (!t || P.lookActive > 0 || !playing()) return;
  const eye = eyePoint(), aim = aimPoint(t);
  const wantYaw = Math.atan2(aim.x - eye.x, aim.z - eye.z);
  const wantPitch = Math.atan2(aim.y - eye.y, Math.hypot(aim.x - eye.x, aim.z - eye.z));
  const k = dt * (P.ads ? 2.6 : 0.8) * GAME.controls.aimHelp;
  P.yaw = turnToward(P.yaw, wantYaw, k);
  if (firstPerson()) P.pitch += (Math.max(-0.6, Math.min(0.6, wantPitch)) - P.pitch) * Math.min(1, k);
}

function eyePoint() {
  return new V3(P.pos.x, P.y + EYE, P.pos.z);
}

function shoot() {
  const w = WEAPONS[loadout.current];
  const dir = aimDirection();
  const target = findAimTarget(eyePoint(), dir, w.range);
  // looking through the sight: the shot leaves from the middle of the screen, exactly where the dot is
  const throughSight = firstPerson() && P.adsT > 0.85;
  const muzzle = throughSight ? eyePoint().addScaledVector(dir, 0.6) : firstPerson() ? gunMuzzle(viewGun, new V3()) : gunMuzzle(handGun, new V3());
  // no monster near the crosshair: shoot at the point straight ahead
  const goal = target || { pos: eyePoint().addScaledVector(dir, w.range).setY(0), aimY: P.y + EYE + dir.y * w.range, radius: 0, hit() {} };
  fireWeapon(loadout.current, loadout.levels[loadout.current] || 1, muzzle, goal);
  P.fireCd = w.rate * rateMul();
  P.aimT = 0.35;
  P.recoil = Math.min(1, P.recoil + (loadout.current === 'bazooka' || loadout.current === 'shotgun' ? 1 : 0.45));
  P.kick = Math.min(0.12, (P.kick || 0) + (loadout.current === 'sniper' ? 0.07 : loadout.current === 'bazooka' ? 0.06 : loadout.current === 'shotgun' ? 0.04 : 0.008) * (P.ads ? 0.4 : 1));
}

/* ---------- per-frame ---------- */
/* Climb a ladder to the roof (started from the action button). */
export function startClimb(b) {
  if (P.vehicle || P.kong || P.climb) return;
  P.ads = false;
  P.climb = b; P.vy = 0;
  P.yaw = P.face = Math.atan2(0, -b.ladder.nz);
  sfx.jump();
}
function updateClimb(dt) {
  const b = P.climb, L = b.ladder;
  P.pos.set(L.x, 0, L.z + L.nz * 0.3);
  P.y += 4.5 * dt;
  joseph.anim.play('run', { speed: 0.6 });
  if (!b.alive) { P.climb = null; return; }
  if (P.y >= b.h) {
    P.y = b.h; P.climb = null; P.onGround = true;
    P.pos.set(L.x, 0, L.z - L.nz * 1.8); // step onto the roof
    world.banner?.('ON THE ROOF!', 1200);
  }
}

/* Gravity: stand on the street or on a roof; walking off a roof drops you down (no damage). */
function updateFalling(dt) {
  const ground = groundAt(P.pos.x, P.pos.z, P.y);
  P.vy -= (P.parachute ? 5 : 28) * dt;
  if (P.parachute) P.vy = Math.max(P.vy, -4.5);
  P.y += P.vy * dt;
  P.onGround = P.y <= ground + 0.02;
  if (P.onGround) { P.y = ground; P.vy = 0; if (P.parachute) { P.parachute = false; sfx.jump(); } }
}

function updateJoseph(dt, inp) {
  if (P.climb) updateClimb(dt); else updateFalling(dt);
  P.fireCd -= dt; P.aimT -= dt;
  P.recoil = Math.max(0, P.recoil - dt * 6);
  P.lookActive = Math.max(0, (P.lookActive || 0) - dt);
  aimMagnet(dt);
  P.kick = Math.max(0, (P.kick || 0) - dt * 0.6);
  world.aimTarget = findAimTarget(eyePoint(), aimDirection(), WEAPONS[loadout.current].range);
  // semi-auto: one shot per tap; with FULL AUTO, holding FIRE keeps shooting
  const auto = loadout.fullAuto[loadout.current];
  if (playing() && P.fireCd <= 0 && (auto ? P.firing : P.fireQueued)) { shoot(); P.fireQueued = false; }

  const moving = inp.l > 0.12;
  if (P.y > 0.1) { /* keep the current pose in the air */ }
  else if (P.aimT > 0 || P.firing) {
    if (moving) joseph.anim.play('shoot', { speed: 1.4 });
    else joseph.anim.hold('shoot', 0.3);
  } else if (moving) joseph.anim.play('run', { speed: 0.55 + inp.l * 0.35 });
  else joseph.anim.play('idle');
  joseph.root.position.set(P.pos.x, P.y, P.pos.z);
  joseph.root.rotation.y = P.face;
  const blink = P.inv > 0 && P.inv < 50 ? Math.floor(world.time * 14) % 2 === 0 : true;
  joseph.root.visible = !firstPerson() && blink;
  joseph.anim.update(dt);
  placeGuns(dt, inp);
}

/* Hand gun follows Joseph's right hand; the first-person gun sways with walking and kicks back when it fires. */
function placeGuns(dt, inp) {
  const hand = joseph.bones.RightHand;
  if (hand) hand.getWorldPosition(handPos);
  else handPos.set(P.pos.x + Math.sin(P.face + 0.6) * 0.5, P.y + 1.2, P.pos.z + Math.cos(P.face + 0.6) * 0.5);
  handGun.position.copy(handPos);
  handGun.rotation.set(-P.pitch * 0.5, P.face, 0);
  handGun.visible = joseph.root.visible;

  const fp = firstPerson() && P.ko <= 0 && P.morphT <= 0;
  viewGun.visible = fp && P.adsT < 0.85; // fully aimed: you look through the sight overlay instead
  if (!fp) return;
  const bob = inp && inp.l > 0.12 && P.y < 0.1 ? world.time * 11 : 0;
  const swayX = Math.sin(bob) * 0.012 * (inp?.l || 0), swayY = Math.abs(Math.cos(bob)) * 0.012 * (inp?.l || 0);
  const big = loadout.current === 'bazooka';
  const a = P.adsT, sway = 1 - a * 0.8;
  const hipX = 0.24 + swayX * sway, hipY = (big ? -0.3 : -0.24) - swayY * sway, hipZ = big ? -0.5 : -0.55;
  // guns with a scope (rifle, bazooka) look through the scope; the others line up over the sights
  const scoped = loadout.current === 'rifle' || loadout.current === 'sniper' || big;
  const adsY = -(viewGun.userData.sightY || 0.06) + (scoped ? 0.03 : -0.022), adsZ = big ? -0.42 : -0.36;
  viewGun.position.set(hipX * (1 - a), hipY + (adsY - hipY) * a + P.recoil * 0.015 * sway, hipZ + (adsZ - hipZ) * a + P.recoil * 0.07 * sway);
  viewGun.rotation.set(P.recoil * 0.12 * sway, Math.PI + 0.04 * (1 - a), 0);
}

function updateKong(dt, inp) {
  P.kongT -= dt;
  if (P.firing) kongPunch();
  if (!kong.anim.busy()) {
    if (inp.l > 0.12) kong.anim.play('walk', { speed: 0.8 + inp.l * 0.8 });
    else kong.anim.hold('walk', 0.1);
  }
  kong.root.position.set(P.pos.x, 0, P.pos.z);
  kong.root.rotation.y = P.face;
  kong.anim.update(dt);
  if (P.kongT <= 0) unmorph();
}

export function updateHero(dt, inp) {
  // aiming eases in and out every frame, whatever Joseph is doing (so the zoom can never get stuck)
  if (P.ads && (P.vehicle || P.kong || P.ko > 0 || P.morphT > 0 || P.climb)) toggleAim(false);
  P.adsT += ((P.ads ? 1 : 0) - (P.adsT || 0)) * Math.min(1, dt * 10);
  // forgot to switch AIM off? it lowers the gun by itself after 8 quiet seconds
  if (P.ads) { P.adsIdle = (P.adsIdle || 0) + dt; if (P.firing || P.lookActive > 0) P.adsIdle = 0; if (P.adsIdle > 8) toggleAim(false); }
  P.inv = Math.max(0, P.inv - dt);
  P.punchCd -= dt; P.roarCd = Math.max(0, P.roarCd - dt); P.punchT -= dt; P.roarT -= dt;
  if (P.morphT > 0) {
    P.morphT -= dt;
    joseph.root.visible = true;
    joseph.root.rotation.y += dt * 25;
    joseph.root.position.y = (1.1 - P.morphT) * 3;
    if (Math.random() < 0.6) sparks(new V3(P.pos.x, 1 + Math.random() * 3, P.pos.z), 0xffd23f, 2, 6, 0.4);
    joseph.anim.update(dt); placeGuns(dt, null);
    if (P.morphT <= 0) { joseph.root.position.y = 0; finishMorph(); }
    return;
  }
  if (P.ko > 0) {
    P.ko -= dt;
    P.climb = null;
    if (!P.vehicle) updateFalling(dt);
    joseph.root.visible = !firstPerson();
    joseph.root.rotation.x = -Math.PI / 2 * Math.min(1, (2.4 - P.ko) * 4);
    joseph.root.position.set(P.pos.x, P.y + 0.35, P.pos.z);
    placeGuns(dt, null); handGun.visible = false;
    if (P.ko <= 0) { P.hearts = GAME.hero.hearts; P.inv = 3; joseph.root.rotation.x = 0; sfx.save(); }
    return;
  }
  // the stick moves relative to where you're looking: up = forward, sideways = step left/right
  const fwdX = Math.sin(P.yaw), fwdZ = Math.cos(P.yaw), rightX = -Math.cos(P.yaw), rightZ = Math.sin(P.yaw);
  const mx = fwdX * -inp.z + rightX * inp.x, mz = fwdZ * -inp.z + rightZ * inp.x;
  if (P.vehicle) { joseph.root.visible = false; handGun.visible = false; viewGun.visible = false; return; }
  if (P.climb) { updateJoseph(dt, { x: 0, z: 0, l: 0 }); return; }
  P.slowT = Math.max(0, (P.slowT || 0) - dt);
  const spd = (P.kong ? GAME.kong.speed : GAME.hero.speed) * (P.slowT > 0 ? 0.5 : 1) * (P.parachute ? 0.6 : 1) * (P.ads ? 0.55 : 1);
  P.moving = inp.l;
  P.pos.x += mx * spd * dt; P.pos.z += mz * spd * dt;
  if (P.kong) {
    P.pos.x = clamp(P.pos.x, -EDGE, EDGE); P.pos.z = clamp(P.pos.z, -EDGE, EDGE);
    if (inp.l > 0.1) smashNear(P.pos, 3.2);
    breakNear(P.pos, 3.5);
  } else collide(P.pos, 0.5, P.y);

  // Joseph faces where he aims; Kong also turns toward a close boss so punches land
  let wantFace = P.yaw;
  const boss = world.bossTarget;
  if (P.kong && boss && boss.alive && flatDist(P.pos, boss.pos) < 16) wantFace = angleTo(P.pos, boss.pos);
  P.face = firstPerson() ? P.yaw : turnToward(P.face, wantFace, dt * 12);

  if (P.kong) updateKong(dt, inp); else updateJoseph(dt, inp);
}

/* Title screen pose. */
export function poseHeroForTitle(dt) {
  joseph.root.visible = true;
  joseph.root.position.set(0, 0, 12); joseph.root.rotation.set(0, Math.PI, 0);
  P.face = P.yaw = Math.PI;
  joseph.anim.play('idle');
  joseph.anim.update(dt);
  placeGuns(dt, null);
}

