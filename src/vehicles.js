// Cars, the army tank and fighter jets. Walk up and tap the action button to get in.
// Car: drive and run monsters over. Tank: drive, FIRE the cannon where you look. Jet: take off down the runway, FIRE drops bombs.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './engine.js';
import { spawnModel, disposeModel } from './models.js';
import { collide, groundAt, EDGE } from './map.js';
import { parkedCarSpots } from './map-props.js';
import { explode } from './weapons.js';
import { breakNear } from './crates.js';
import { defeatEnemy } from './enemies.js';
import { sfx, say } from './audio.js';
import { smoke, fireball, sparks, flash, shake, popWord } from './fx.js';
import { V3, rnd, clamp, world, P, flatDist, turnToward, angleTo } from './world.js';

export const VEHICLE_TYPES = {
  car:  { label: '🚗 DRIVE', hp: 30, maxSpeed: 32, accel: 20, turn: 1.9, radius: 2.0, ram: 2.6, seatY: 1.3 },
  tank: { label: '🪖 TANK',  hp: 90, maxSpeed: 14, accel: 9,  turn: 1.2, radius: 3.0, ram: 3.6, seatY: 2.6, cannon: 1.1 },
  jet:  { label: '✈️ FLY',   hp: 60, maxSpeed: 55, accel: 14, turn: 1.1, radius: 4.5, ram: 0,   seatY: 2.0, bombs: 0.55 },
};

let parked = null; // instanced decorative cars

function make(type, x, z, yaw) {
  const model = spawnModel(type);
  model.root.position.set(x, 0, z);
  model.root.rotation.y = yaw;
  scene.add(model.root);
  const t = VEHICLE_TYPES[type];
  const v = {
    type, t, model, pos: new V3(x, 0, z), yaw, speed: 0, alt: 0, roll: 0, climb: 0, hp: t.hp, home: { x, z, yaw },
    fireCd: 0, occupied: false, dead: false,
  };
  world.vehicles.push(v);
  return v;
}

/* Decorative parked cars: a simple low-poly car shape, instanced (a few hundred triangles each). */
const PAINTS = [0xa31621, 0x1d4f91, 0xd9d9d6, 0x1b1b1d, 0x5c6b73, 0xb88a2c, 0x2f5233];
const parkedParts = (() => {
  const body = new RoundedBoxGeometry(2, 0.9, 4.3, 2, 0.3).translate(0, 0.75, 0);
  const cabin = new RoundedBoxGeometry(1.75, 0.75, 2.2, 2, 0.25).translate(0, 1.5, -0.25);
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) wheels.push(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10).rotateZ(Math.PI / 2).translate(x, 0.42, z));
  return [
    [body, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }), true],
    [cabin, new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.05, metalness: 0.9 }), false],
    [mergeGeos(wheels), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }), false],
  ];
})();
function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g of list) { const n = g.index ? g.toNonIndexed() : g; pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
function buildParkedCars(skipSpots) {
  if (parked) for (const m of parked) scene.remove(m);
  const spots = parkedCarSpots.filter(s => !skipSpots.has(s)).slice(0, 90);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new V3(1, 1, 1);
  parked = parkedParts.map(([geo, mat, painted]) => {
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => {
      mesh.setMatrixAt(i, m4.compose(new V3(s.x, 0, s.z), q.setFromAxisAngle(new V3(0, 1, 0), s.ry), one));
      if (painted) mesh.setColorAt(i, new THREE.Color(PAINTS[i % PAINTS.length]));
    });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
}

export function setupVehicles() {
  clearVehicles();
  // drivable cars: some near the start, some around the map
  const near = parkedCarSpots.filter(s => Math.hypot(s.x, s.z - 12) < 80 && Math.hypot(s.x - 3, s.z - 13.5) > 8).slice(0, 5);
  const far = parkedCarSpots.filter(s => !near.includes(s)).sort(() => Math.random() - 0.5).slice(0, 14);
  const drivable = new Set([...near, ...far]);
  for (const s of drivable) make('car', s.x, s.z, s.ry);
  make('car', 3, 13.5, Math.PI / 2);  // one right next to Joseph at the start
  buildParkedCars(drivable);
  for (const [x, z] of [[230, -250], [245, -250], [260, -250]]) make('tank', x, z, Math.PI);
  for (const [x, z] of [[300, 205], [300, 225], [312, 240]]) make('jet', x, z, Math.PI);
}

export function clearVehicles() {
  for (const v of world.vehicles || []) disposeModel(v.model);
  world.vehicles = [];
}

/* The vehicle Joseph is standing next to (for the action button). */
export function vehicleNear() {
  if (P.vehicle || P.kong || P.y > 0.5) return null;
  let best = null, bd = Infinity;
  for (const v of world.vehicles) {
    if (v.dead || v.crashing || v.alt > 1) continue;
    const d = flatDist(v.pos, P.pos);
    if (d < v.t.radius + 2.5 && d < bd) { bd = d; best = v; }
  }
  return best;
}

export function enterVehicle(v) {
  P.vehicle = v; v.occupied = true;
  P.yaw = v.yaw; P.pitch = 0.05;
  sfx.pickup();
  if (v.type === 'jet') { world.banner?.('JET!<small>Push up to speed down the runway, FIRE drops bombs</small>', 3200); say('Push up to take off!'); }
  else if (v.type === 'tank') { world.banner?.('TANK!<small>Drag to aim, FIRE the cannon</small>', 2600); say('Tank! Fire the cannon!'); }
  else world.banner?.('DRIVE!<small>Run over the monsters!</small>', 2200);
  world.onVehicleChange?.();
}

export function exitVehicle() {
  const v = P.vehicle;
  if (!v) return;
  P.vehicle = null; v.occupied = false;
  const side = new V3(-Math.cos(v.yaw), 0, Math.sin(v.yaw)).multiplyScalar(v.t.radius + 1.2);
  P.pos.set(v.pos.x + side.x, 0, v.pos.z + side.z);
  collide(P.pos, 0.5);
  if (v.type === 'jet' && v.alt > 4) {
    P.y = v.alt; P.vy = 0; P.parachute = true;
    world.banner?.('PARACHUTE!', 1600);
    // the empty jet glides down and crashes harmlessly
    v.crashing = true;
  } else P.y = groundAt(P.pos.x, P.pos.z, 0);
  P.inv = Math.max(P.inv, 1);
  world.onVehicleChange?.();
}

/* What monsters hit while Joseph is driving. */
export const vehicleVictim = {
  get pos() { return P.vehicle ? P.vehicle.pos : P.pos; },
  get elev() { return P.vehicle ? P.vehicle.alt : 0; },
  aimY: 1.2, radius: 2.5,
  get alive() { return !!P.vehicle && P.vehicle.alt < 6; },
  hurt: n => damageVehicle(P.vehicle, n * 3),
};

function damageVehicle(v, n) {
  if (!v || v.dead) return;
  v.hp -= n;
  sparks(v.pos.clone().setY(1.5), 0xffd27a, 6, 6, 0.4);
  if (v.hp <= v.t.hp * 0.3 && Math.random() < 0.3) smoke(v.pos.clone().setY(2), 1, 2, 0x333333, 1, 1.5);
  if (v.hp <= 0) wreck(v);
}

function wreck(v) {
  v.dead = true;
  fireball(v.pos.clone().setY(1.5), v.type === 'car' ? 5 : 8);
  sfx.boom(); shake(0.8);
  if (P.vehicle === v) { exitVehicle(); world.banner?.('Jump out!', 1400); }
  v.model.root.visible = false;
  // a fresh one comes back where it was parked
  setTimeout(() => {
    if (!world.vehicles.includes(v)) return;
    Object.assign(v, { dead: false, hp: v.t.hp, speed: 0, alt: 0, crashing: false, yaw: v.home.yaw });
    v.pos.set(v.home.x, 0, v.home.z);
    v.model.root.visible = true;
  }, 15000);
}

/* ---------- driving ---------- */
function drive(v, inp, dt) {
  const t = v.t;
  const throttle = -inp.z;
  if (throttle > 0.1) v.speed += t.accel * throttle * dt;
  else if (throttle < -0.1) v.speed += t.accel * 1.6 * throttle * dt;
  else v.speed *= Math.pow(0.4, dt);
  v.speed = clamp(v.speed, -t.maxSpeed * 0.4, t.maxSpeed);
  const grip = Math.min(1, Math.abs(v.speed) / 6);
  v.yaw -= inp.x * t.turn * grip * dt * Math.sign(v.speed || 1);
  const before = v.pos.clone();
  v.pos.x += Math.sin(v.yaw) * v.speed * dt;
  v.pos.z += Math.cos(v.yaw) * v.speed * dt;
  collide(v.pos, t.radius * 0.8);
  const blockedBy = before.distanceTo(v.pos) < Math.abs(v.speed) * dt * 0.5;
  if (blockedBy && Math.abs(v.speed) > 8) { sfx.hit(); shake(0.3); v.speed *= -0.25; sparks(v.pos.clone().setY(1), 0xffd27a, 6, 5, 0.4); }
  // run monsters over, smash crates
  if (Math.abs(v.speed) > 4) {
    for (const e of world.enemies) if (e.alive && flatDist(e.pos, v.pos) < t.ram + e.radius * 0.5) { defeatEnemy(e); v.speed *= 0.92; }
    breakNear(v.pos, t.radius * 0.7);
    const boss = world.bossTarget;
    if (boss?.alive && flatDist(boss.pos, v.pos) < boss.radius + t.radius && (v.ramCd || 0) <= 0) {
      boss.hit(v.type === 'tank' ? 15 : 8, { from: v.pos, heavy: true }); v.ramCd = 1; v.speed *= -0.4; shake(0.6);
    }
  }
  v.ramCd = (v.ramCd || 0) - dt;
  if (v.type === 'car' && Math.abs(v.speed) > 20 && Math.random() < 0.1) smoke(v.pos.clone().setY(0.4), 1, 0.8, 0xb7ab98, 0.3, 0.8);
}

function fireCannon(v) {
  if (v.fireCd > 0) return;
  v.fireCd = v.t.cannon;
  const dir = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const muzzle = v.pos.clone().addScaledVector(dir, 5).setY(2.6);
  flash(muzzle.clone(), 0xfff0b0, 3);
  smoke(muzzle.clone(), 4, 1.5, 0x9a958c, 0.6, 1.2);
  sfx.bazooka(); shake(0.4);
  // the shell flies fast; find where it lands (first monster in the line of fire, or 45m ahead)
  let hitAt = v.pos.clone().addScaledVector(dir, 45);
  let best = 45;
  const targets = [...world.enemies.filter(e => e.alive), ...world.nests.filter(n => n.alive), ...(world.bossTarget?.alive ? [world.bossTarget] : [])];
  for (const tg of targets) {
    const to = tg.pos.clone().sub(v.pos).setY(0);
    const along = to.dot(dir);
    if (along < 0 || along > best) continue;
    const side = to.clone().sub(dir.clone().multiplyScalar(along)).length();
    if (side < tg.radius + 2) { best = along; hitAt = tg.pos.clone(); }
  }
  setTimeout(() => explode(hitAt.setY(1), 7, 28), best * 8);
}

/* ---------- flying ---------- */
function fly(v, inp, dt) {
  const t = v.t;
  const airborne = v.alt > 0.5;
  const throttle = airborne ? 1 : Math.max(0, -inp.z);
  v.speed = clamp(v.speed + (throttle > 0.1 ? t.accel * throttle : -t.accel) * dt, 0, t.maxSpeed);
  const turnRate = airborne ? t.turn : t.turn * 0.4 * Math.min(1, v.speed / 10);
  v.yaw -= inp.x * turnRate * dt;
  v.roll += ((airborne ? -inp.x * 0.7 : 0) - v.roll) * Math.min(1, dt * 4);
  // lift off once fast enough; then push up/down to climb or dive
  if (!airborne && v.speed > 32) v.alt = 0.6;
  if (airborne) {
    v.climb += ((-inp.z) * 18 - v.climb) * Math.min(1, dt * 2);
    v.alt = clamp(v.alt + v.climb * dt, 0.6, 140);
    const ground = groundAt(v.pos.x, v.pos.z, 999);
    if (v.alt < ground + 8) { v.alt = ground + 8; v.climb = Math.max(v.climb, 4); }
    if (v.alt < 3 && v.climb < 0) v.climb = 0;
  }
  v.pos.x += Math.sin(v.yaw) * v.speed * dt;
  v.pos.z += Math.cos(v.yaw) * v.speed * dt;
  // don't fly off the map: turn back toward the city
  if (Math.abs(v.pos.x) > EDGE - 20 || Math.abs(v.pos.z) > EDGE - 20) {
    v.yaw = turnToward(v.yaw, angleTo(v.pos, new V3(0, 0, 0)), dt * 1.5);
    v.pos.x = clamp(v.pos.x, -EDGE - 40, EDGE + 40); v.pos.z = clamp(v.pos.z, -EDGE - 40, EDGE + 40);
  }
  if (!airborne) collide(v.pos, t.radius * 0.6);
}

function dropBomb(v) {
  if (v.fireCd > 0 || v.alt < 6) return;
  v.fireCd = v.t.bombs;
  const start = v.pos.clone().setY(v.alt - 1.5);
  const vel = new V3(Math.sin(v.yaw), 0, Math.cos(v.yaw)).multiplyScalar(v.speed * 0.8);
  bombs.push({ pos: start, vel, mesh: bombMesh() });
  sfx.spit();
}

const bombs = [];
const bombGeo = new THREE.CapsuleGeometry(0.35, 1.2, 4, 10).rotateX(Math.PI / 2);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x3d4430, roughness: 0.5, metalness: 0.5 });
function bombMesh() { const m = new THREE.Mesh(bombGeo, bombMat); scene.add(m); return m; }
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i];
    b.vel.y -= 22 * dt;
    b.pos.addScaledVector(b.vel, dt);
    b.mesh.position.copy(b.pos);
    b.mesh.lookAt(b.pos.clone().add(b.vel));
    const ground = groundAt(b.pos.x, b.pos.z, b.pos.y);
    if (b.pos.y <= ground + 0.3) {
      explode(b.pos.clone().setY(ground + 1), 12, 60);
      fireball(b.pos.clone().setY(ground + 2), 10);
      shake(1);
      scene.remove(b.mesh);
      bombs.splice(i, 1);
    }
  }
}

/* ---------- per frame ---------- */
export function updateVehicles(dt, inp) {
  for (const v of world.vehicles) {
    v.fireCd -= dt;
    if (v.dead) continue;
    if (v.occupied) {
      if (v.type === 'jet') fly(v, inp, dt); else drive(v, inp, dt);
      if (P.firing || P.fireQueued) {
        if (v.type === 'tank') fireCannon(v);
        if (v.type === 'jet') dropBomb(v);
        P.fireQueued = false;
      }
      P.pos.set(v.pos.x, 0, v.pos.z);
      P.y = v.alt;
      P.moving = Math.min(1, Math.abs(v.speed) / 10);
    } else if (v.crashing) {
      // abandoned jet glides down
      v.alt = Math.max(0, v.alt - 12 * dt);
      v.pos.x += Math.sin(v.yaw) * v.speed * dt; v.pos.z += Math.cos(v.yaw) * v.speed * dt;
      if (v.alt <= 0) { v.crashing = false; wreck(v); }
    } else if (Math.abs(v.speed) > 0.1) {
      v.speed *= Math.pow(0.3, dt);
      v.pos.x += Math.sin(v.yaw) * v.speed * dt; v.pos.z += Math.cos(v.yaw) * v.speed * dt;
      collide(v.pos, v.t.radius * 0.8);
    }
    const r = v.model.root;
    r.position.set(v.pos.x, v.alt, v.pos.z);
    r.rotation.set(v.type === 'jet' ? -v.climb * 0.02 : 0, v.yaw, v.type === 'jet' ? v.roll : 0, 'YXZ');
  }
  updateBombs(dt);
}

export function clearBombs() {
  for (const b of bombs) scene.remove(b.mesh);
  bombs.length = 0;
}
export { popWord };
