// People Joseph rescues. In a camp they wave for help; once freed they put on a helmet, grab a rifle and join his army.
import * as THREE from 'three';
import { scene } from './engine.js';
import { GAME } from './settings.js';
import { spawnModel } from './models.js';
import { collide, blocked } from './city.js';
import { fireWeapon, nearestTarget, makeGun, teamMul } from './weapons.js';
import { sfx } from './audio.js';
import { sparks, popWord } from './fx.js';
import { wordTexture } from './textures.js';
import { V3, rnd, world, P, flatDist, angleTo, turnToward } from './world.js';

const helmetGeo = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const helmetMat = new THREE.MeshStandardMaterial({ color: 0x4a5a36, roughness: 0.75, metalness: 0.1 });

export function spawnHostage(pos) {
  const model = spawnModel('person');
  model.root.position.copy(pos);
  model.root.rotation.y = rnd(-0.5, 0.5);
  model.anim.play('wave', { speed: rnd(0.9, 1.15) });
  const help = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture('HELP!', '#ffffff'), transparent: true, depthWrite: false, toneMapped: false }));
  help.scale.setScalar(2.6); help.position.y = 3.6;
  model.root.add(help);
  scene.add(model.root);
  return { model, pos: pos.clone(), help };
}

export function updateHostages(list, dt) {
  for (const h of list) {
    h.help.position.y = 3.6 + Math.sin(world.time * 4 + h.pos.x) * 0.15;
    h.model.root.rotation.y = turnToward(h.model.root.rotation.y, angleTo(h.pos, P.pos), dt * 2);
    if (flatDist(h.pos, P.pos) < 95) h.model.anim.update(dt);
  }
}

/* A freed hostage joins the army (or goes home if the army is full). */
export function recruit(h) {
  h.model.root.remove(h.help);
  if (world.allies.length >= GAME.army.maxSize) {
    popWord('THANK YOU!', new V3(h.pos.x, 3.5, h.pos.z), '#ffe066', 2.6);
    goHome(h);
    return false;
  }
  const head = h.model.bones.Head;
  if (head) {
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    // bone space is scaled with the model, so size the helmet in world units
    head.updateWorldMatrix(true, false);
    const ws = new V3();
    head.getWorldScale(ws);
    const s = 0.21 / (ws.x || 1);
    helmet.scale.set(s, s * 0.85, s);
    helmet.position.set(0, 0.14 / (ws.y || 1), 0.01 / (ws.z || 1));
    head.add(helmet);
  }
  const gun = makeGun('rifle', 1.1);
  scene.add(gun);
  const ally = {
    model: h.model, pos: h.pos.clone(), face: h.model.root.rotation.y, gun,
    hp: GAME.army.hearts, downT: 0, fireCd: rnd(0, 0.5), aimT: 0, slot: world.allies.length, aimY: 1.3, radius: 0.9,
    get alive() { return this.downT <= 0; },
    hurt(n) { hurtAlly(ally, n); },
  };
  world.allies.push(ally);
  sparks(new V3(h.pos.x, 2, h.pos.z), 0xffe066, 16, 6, 0.4);
  popWord('JOINED!', new V3(h.pos.x, 3.5, h.pos.z), '#9dff4a', 2.8);
  return true;
}

const leaving = [];
function goHome(h) {
  h.model.anim.play('run', { speed: 0.7 });
  leaving.push({ h, t: 3, dir: rnd(0, Math.PI * 2) });
}

function hurtAlly(a, n) {
  if (a.downT > 0) return;
  a.hp -= n;
  sfx.hurt();
  sparks(new V3(a.pos.x, 1.4, a.pos.z), 0xff6b6b, 6, 4, 0.35);
  if (a.hp <= 0) {
    a.downT = GAME.army.getUpSeconds;
    popWord('OUCH!', new V3(a.pos.x, 3, a.pos.z), '#ff9a9a', 2.2);
  }
}

/* Where each soldier stands: rows of three behind Joseph. */
function slotPosition(i) {
  // soldiers line up beside Joseph (left, right, left, ...), a little behind, so you can see them in first person
  const k = Math.floor(i / 2), sideSign = i % 2 ? -1 : 1;
  const side = sideSign * (2.4 + k * 1.9), back = 0.6 + k * 1.3;
  const f = P.yaw;
  return new V3(P.pos.x - Math.sin(f) * back + Math.cos(f) * side, 0, P.pos.z - Math.cos(f) * back - Math.sin(f) * side);
}

const handPos = new V3();
function updateAlly(a, i, dt) {
  const root = a.model.root;
  if (a.downT > 0) {
    a.downT -= dt;
    root.rotation.x = -Math.PI / 2 * Math.min(1, (GAME.army.getUpSeconds - a.downT) * 4);
    root.position.set(a.pos.x, 0.35, a.pos.z);
    a.gun.visible = false;
    if (a.downT <= 0) { a.hp = GAME.army.hearts; root.rotation.x = 0; sparks(new V3(a.pos.x, 1.5, a.pos.z), 0x9dff4a, 8, 4, 0.3); }
    return;
  }
  a.fireCd -= dt; a.aimT -= dt;
  const hand = a.model.bones.RightHand;
  if (hand) hand.getWorldPosition(handPos); else handPos.set(a.pos.x, 1.3, a.pos.z);
  const slot = slotPosition(i);
  const toSlot = flatDist(a.pos, slot);
  const target = nearestTarget(a.pos, GAME.army.range);
  let move = 0, wantFace = a.face;
  if (toSlot > 1.2) {
    move = Math.min(1, toSlot / 4);
    wantFace = angleTo(a.pos, slot);
  }
  if (target && (toSlot < 9 || P.moving < 0.1)) {
    const tp = new V3(target.pos.x, 0, target.pos.z);
    if (a.fireCd <= 0 && !blocked(a.pos, tp)) {
      a.fireCd = GAME.army.fireRate * rnd(0.85, 1.2);
      a.aimT = 0.4;
      const muzzle = handPos.clone().add(new V3(Math.sin(a.face) * 0.8, 0.05, Math.cos(a.face) * 0.8));
      fireWeapon('rifle', 1, muzzle, target, { damageMul: GAME.army.damage * teamMul() / 0.6, quiet: true });
      sfx.ally();
    }
    if (a.aimT > 0) { wantFace = angleTo(a.pos, tp); if (toSlot < 6) move = Math.min(move, 0.3); }
  }
  a.face = turnToward(a.face, wantFace, dt * 10);
  const speed = GAME.hero.speed * 1.1 * move;
  if (move > 0) {
    const dir = a.aimT > 0 ? angleTo(a.pos, slot) : a.face;
    a.pos.x += Math.sin(dir) * speed * dt; a.pos.z += Math.cos(dir) * speed * dt;
    collide(a.pos, 0.5);
  }
  if (a.aimT > 0) { if (move > 0.1) a.model.anim.play('shoot', { speed: 1.3 }); else a.model.anim.hold('shoot', 0.3); }
  else if (move > 0.1) a.model.anim.play('run', { speed: 0.5 + move * 0.4 });
  else a.model.anim.hold('shoot', 0.05);
  root.position.set(a.pos.x, 0, a.pos.z);
  root.rotation.y = a.face;
  a.model.anim.update(dt);
  if (hand) hand.getWorldPosition(handPos); else handPos.set(a.pos.x, 1.3, a.pos.z);
  a.gun.position.copy(handPos);
  a.gun.rotation.set(0, a.face, 0);
  a.gun.visible = true;
}

export function updateAllies(dt) {
  world.allies.forEach((a, i) => updateAlly(a, i, dt));
  for (let i = leaving.length - 1; i >= 0; i--) {
    const l = leaving[i];
    l.t -= dt;
    l.h.pos.x += Math.sin(l.dir) * 7 * dt; l.h.pos.z += Math.cos(l.dir) * 7 * dt;
    l.h.model.root.position.copy(l.h.pos); l.h.model.root.rotation.y = l.dir;
    l.h.model.root.scale.setScalar(Math.min(1, l.t));
    l.h.model.anim.update(dt);
    if (l.t <= 0) { scene.remove(l.h.model.root); leaving.splice(i, 1); }
  }
}

/* Move the army next to Joseph (start of a city). */
export function gatherAllies() {
  world.allies.forEach((a, i) => {
    a.pos.copy(slotPosition(i)); a.downT = 0; a.hp = GAME.army.hearts; a.model.root.rotation.x = 0;
  });
}

export function clearAllies() {
  for (const a of world.allies) { scene.remove(a.model.root); scene.remove(a.gun); }
  world.allies = [];
}

/* Re-create saved soldiers when a game is continued. */
export function restoreArmy(count) {
  for (let i = 0; i < count; i++) recruit(spawnHostage(P.pos.clone()));
}
