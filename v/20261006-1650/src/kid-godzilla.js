// "KID GODZILLA SPOTTED IN THE HARBOR!" A young Godzilla wades in the sea off the docks, splashing and roaring.
// Shoot him enough and he dives under and swims away, leaving a prize on the dock. He comes back later.
import { scene } from './engine.js';
import { spawnModel, setGlow, disposeModel, hasModel, inView } from './models.js';
import { isWater, SHORE, WATER_Y } from './map.js';
import { dropLoot } from './loot.js';
import { sfx } from './audio.js';
import { smoke, popWord, shake, addRing } from './fx.js';
import { V3, rnd, world, P, angleTo, turnToward } from './world.js';
import { GAME } from './settings.js';

const WADE_DEPTH = 2.6;        // how far he stands below the waves
const FIRST_SIGHTING = 12;     // seconds in the harbor before he first shows up
const COME_BACK = 75;          // seconds before he shows up again
const HARBOR_Z = 150;          // Joseph is "at the harbor" south of this line (or out at sea)
const SPEED = 3.2;
const HP = 160;

let kid = null, model = null, waitT = FIRST_SIGHTING;

export const kidTarget = {
  pos: new V3(), aimY: 4.5, radius: 3,
  get alive() { return !!kid && kid.mode !== 'dive'; },
  hit: (dmg) => hitKid(dmg),
};

const inHarbor = () => P.pos.z > HARBOR_Z || (P.vehicle && isWater(P.vehicle.pos.x, P.vehicle.pos.z));
const bossBusy = () => world.state === 'bossIntro' || (world.mode === 'story' && world.state === 'boss');

function seaSpotNear(x, z) {
  for (let i = 0; i < 12; i++) {
    const a = rnd(-1.0, 1.0), d = rnd(38, 60);
    const sx = x + Math.sin(a) * d, sz = Math.max(SHORE + 26, z + Math.cos(a) * d);
    if (isWater(sx, sz)) return new V3(sx, 0, sz);
  }
  return new V3(x, 0, SHORE + 50);
}

function appear() {
  if (!hasModel('kid')) return; // no model file: no sighting (the boss fights still use the stand-in)
  model = spawnModel('kid');
  scene.add(model.root);
  const at = seaSpotNear(P.pos.x, P.pos.z);
  const hp = Math.round(HP * GAME.difficulty);
  kid = { pos: at, face: angleTo(at, P.pos), hp, max: hp, mode: 'rise', t: 0, y: -10, flash: 0, goal: at.clone(), roarCd: 4 };
  kidTarget.pos = kid.pos;
  model.anim.once('roar');
  world.banner?.('KID GODZILLA SPOTTED<small>in the harbor! 🌊</small>', 3200);
  sfx.roar();
  addRing(new V3(at.x, WATER_Y + 0.1, at.z), 22, 0xeaf6ff);
}

function hitKid(dmg) {
  if (!kid || kid.mode === 'dive') return;
  kid.hp -= dmg;
  kid.flash = 0.08;
  sfx.hit();
  if (kid.hp > 0) return;
  kid.mode = 'dive'; kid.t = 0;
  sfx.roar(); shake(0.6);
  popWord('SPLASH!', kid.pos.clone().setY(6), '#bfe8ff', 4);
  world.banner?.('KID GODZILLA SWAM AWAY!<small>He left something on the dock</small>', 2600);
  dropLoot(new V3(P.pos.x + rnd(-3, 3), 0, Math.min(P.pos.z + 3, SHORE - 4)));
}

function splash(n = 3) {
  smoke(new V3(kid.pos.x + rnd(-2, 2), WATER_Y + 0.4, kid.pos.z + rnd(-2, 2)), n, 2.4, 0xeaf6ff, 2.5, 1.2);
}

function wade(dt) {
  if (kid.pos.distanceTo(kid.goal) < 4) kid.goal = seaSpotNear(P.pos.x, P.pos.z);
  const want = angleTo(kid.pos, kid.goal);
  kid.face = turnToward(kid.face, want, dt * 1.5);
  if (!model.anim.busy()) {
    kid.pos.x += Math.sin(kid.face) * SPEED * dt;
    kid.pos.z += Math.cos(kid.face) * SPEED * dt;
    model.anim.play('walk', { speed: 0.7 });
  }
  if (!isWater(kid.pos.x, kid.pos.z) || kid.pos.z < SHORE + 18) kid.pos.z = Math.max(kid.pos.z, SHORE + 18);
  if ((kid.roarCd -= dt) <= 0) {
    kid.roarCd = rnd(7, 12);
    kid.face = angleTo(kid.pos, P.pos);
    model.anim.once('roar');
    sfx.roar();
  }
  if (Math.random() < dt * 4) splash(2);
}

function remove() {
  if (model) disposeModel(model);
  model = null; kid = null;
  waitT = COME_BACK;
}

export function updateKidGodzilla(dt) {
  if (!kid) {
    if (!inHarbor() || bossBusy()) return;
    if ((waitT -= dt) <= 0) appear();
    return;
  }
  kid.t += dt;
  kid.flash = Math.max(0, kid.flash - dt);
  if (kid.mode === 'rise') {
    kid.y = Math.min(-WADE_DEPTH, kid.y + dt * 6);
    if (Math.random() < dt * 10) splash(3);
    if (kid.y >= -WADE_DEPTH) kid.mode = 'wade';
  } else if (kid.mode === 'wade') {
    wade(dt);
    if (!inHarbor() && P.pos.distanceTo(kid.pos) > 220) { kid.mode = 'dive'; kid.t = 0; }
  } else if (kid.mode === 'dive') {
    kid.y -= dt * 5;
    if (Math.random() < dt * 8) splash(3);
    if (kid.y < -14) return remove();
  }
  model.root.position.set(kid.pos.x, kid.y, kid.pos.z);
  model.root.rotation.y = kid.face;
  model.root.visible = inView(new V3(kid.pos.x, 0, kid.pos.z), 8, 420);
  setGlow(model, kid.flash > 0 ? 0x666666 : 0x000000, 1);
  if (model.root.visible) model.anim.update(dt);
}

export function clearKidGodzilla() {
  if (model) disposeModel(model);
  model = null; kid = null;
  waitT = FIRST_SIGHTING;
}
