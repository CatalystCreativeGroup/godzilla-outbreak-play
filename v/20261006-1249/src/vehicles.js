// Every vehicle Joseph can use. Walk up and tap the action button to get in.
//   car / tank / missile truck: steering wheel + pedals. Tank: FIRE the cannon. Missile truck: FIRE a guided missile.
//   jet / Blue Angel: push up to speed down the runway, FIRE drops bombs, 🛬 LAND to come down on land or the carrier.
//   helicopter: stick to fly, UP / DOWN buttons to rise and land anywhere (even on roofs and the carrier), FIRE rockets.
//   aircraft carrier: steer it out to sea; jets and helicopters take off from and land on its deck.
//   submarine: steer like a boat, DOWN to dive, UP to come back up, FIRE torpedoes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './engine.js';
import { spawnModel, disposeModel } from './models.js';
import { buildVehicleModel, proceduralTypes, CARRIER_DECK, CARRIER_SIZE, CARRIER_ISLAND } from './vehicle-models.js';
import { collide, groundAt, isWater, platforms, platformAt, SHORE, OCEAN, AIR, WATER_Y } from './map.js';
import { parkedCarSpots } from './map-props.js';
import { explode, fireWeapon, liveTargets, aimPoint } from './weapons.js';
import { breakNear } from './crates.js';
import { defeatEnemy } from './enemies.js';
import { launchMissile, missile } from './missile.js';
import { fireTorpedo } from './ocean.js';
import { sfx, say } from './audio.js';
import { smoke, fireball, sparks, flash, shake, popWord } from './fx.js';
import { V3, rnd, clamp, world, P, flatDist, turnToward, angleTo } from './world.js';

/* kind: ground (wheel + pedals), jet, heli, ship, sub. controls: wheel or stick. */
export const VEHICLE_TYPES = {
  car:       { label: '🚗 DRIVE',      kind: 'ground', controls: 'wheel', hp: 30,  maxSpeed: 19, accel: 11,  turn: 2.6, radius: 2.0, ram: 2.6 },
  tank:      { label: '🪖 TANK',       kind: 'ground', controls: 'wheel', hp: 90,  maxSpeed: 11, accel: 7,   turn: 1.7, radius: 3.0, ram: 3.6, cannon: 1.1, fire: ['💥', 'CANNON'] },
  missile:   { label: '🚀 MISSILE TRUCK', kind: 'ground', controls: 'wheel', hp: 60, maxSpeed: 14, accel: 8, turn: 2.0, radius: 2.6, ram: 3.0, fire: ['🎯', 'MISSILE'] },
  jet:       { label: '✈️ FLY',        kind: 'jet',    controls: 'stick', hp: 60,  maxSpeed: 55, accel: 14,  turn: 1.1, radius: 4.5, ram: 0, bombs: 0.55, fire: ['💣', 'BOMB'] },
  blueangel: { label: '✈️ BLUE ANGEL', kind: 'jet',    controls: 'stick', hp: 70,  maxSpeed: 62, accel: 16,  turn: 1.3, radius: 4.5, ram: 0, bombs: 0.45, fire: ['💣', 'BOMB'] },
  heli:      { label: '🚁 HELICOPTER', kind: 'heli',   controls: 'stick', hp: 55,  maxSpeed: 24, accel: 6,   turn: 1.5, radius: 3.6, ram: 0, rockets: 0.5, fire: ['🚀', 'ROCKETS'] },
  carrier:   { label: '🚢 CAPTAIN',    kind: 'ship',   controls: 'wheel', hp: 9999, maxSpeed: 9, accel: 1.2, turn: 0.22, radius: 14, ram: 0 },
  sub:       { label: '🛳️ SUBMARINE',  kind: 'sub',    controls: 'wheel', hp: 120, maxSpeed: 13, accel: 3,   turn: 0.6, radius: 4.0, ram: 0, torpedo: 1.2, fire: ['🌊', 'TORPEDO'] },
};

let parked = null; // instanced decorative cars
export let carrierShip = null;

function make(type, x, z, yaw, alt = 0) {
  const model = proceduralTypes.includes(type) ? buildVehicleModel(type) : spawnModel(type);
  model.root.position.set(x, alt, z);
  model.root.rotation.y = yaw;
  scene.add(model.root);
  const t = VEHICLE_TYPES[type];
  const v = {
    type, t, model, pos: new V3(x, 0, z), yaw, speed: 0, alt, roll: 0, climb: 0, pitchTilt: 0, depth: 0, hp: t.hp,
    home: { x, z, yaw, alt }, fireCd: 0, occupied: false, dead: false,
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

/* ---------- the aircraft carrier: a moving deck you can stand on ---------- */
/* Carrier-local (lx = right, lz = forward) <-> world. */
function toWorld(c, lx, lz, out = new V3()) {
  const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  return out.set(c.pos.x + lx * cs + lz * sn, 0, c.pos.z - lx * sn + lz * cs);
}
function toLocal(c, x, z) {
  const dx = x - c.pos.x, dz = z - c.pos.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  return { lx: dx * cs - dz * sn, lz: dx * sn + dz * cs };
}
const onDeck = (c, x, z) => { const { lx, lz } = toLocal(c, x, z); return Math.abs(lx) < CARRIER_SIZE.halfBeam && Math.abs(lz) < CARRIER_SIZE.halfLength; };
export const carrierBridgeDoor = () => carrierShip && toWorld(carrierShip, CARRIER_ISLAND.x0 - 1.4, 0);

function makeCarrierPlatform(c) {
  return {
    top: CARRIER_DECK,
    contains: (x, z) => onDeck(c, x, z),
    keepInside(pos, r) {
      let { lx, lz } = toLocal(c, pos.x, pos.z);
      lx = clamp(lx, -CARRIER_SIZE.halfBeam + r, CARRIER_SIZE.halfBeam - r);
      lz = clamp(lz, -CARRIER_SIZE.halfLength + r, CARRIER_SIZE.halfLength - r);
      // walk around the bridge tower, not through it
      const I = CARRIER_ISLAND;
      if (lx > I.x0 - r && lx < I.x1 + r && lz > I.z0 - r && lz < I.z1 + r) {
        const out = [[lx - (I.x0 - r), 'x0'], [(I.z1 + r) - lz, 'z1'], [lz - (I.z0 - r), 'z0']].sort((a, b) => a[0] - b[0])[0][1];
        if (out === 'x0') lx = I.x0 - r; else if (out === 'z1') lz = I.z1 + r; else lz = I.z0 - r;
      }
      toWorld(c, lx, lz, pos);
    },
  };
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
  // ARMY BASE: tanks, missile trucks, helicopters on their pads, Blue Angels at the end of the airstrip
  for (const [x, z] of [[230, -250], [245, -250], [260, -250]]) make('tank', x, z, Math.PI);
  for (const [x, z] of [[330, -250], [345, -250]]) make('missile', x, z, Math.PI);
  for (const [x, z] of [[215, -212], [245, -212], [275, -212]]) make('heli', x, z, Math.PI);
  for (const [x, z] of [[190, -280], [190, -290]]) make('blueangel', x, z, Math.PI / 2);
  // AIRPORT: jets and two more Blue Angels by the runway
  for (const [x, z] of [[300, 205], [300, 225], [312, 240]]) make('jet', x, z, Math.PI);
  for (const [x, z] of [[324, 205], [324, 228]]) make('blueangel', x, z, Math.PI);
  // HARBOR: the aircraft carrier docked along the quay (with aircraft on deck) and a submarine
  const c = make('carrier', -120, SHORE + 26, Math.PI / 2);
  carrierShip = c;
  c.platform = makeCarrierPlatform(c);
  platforms.length = 0;
  platforms.push(c.platform);
  for (const [type, lx, lz] of [['blueangel', -6, -42], ['jet', -2, -24], ['heli', -6, 22], ['heli', 2, 34]]) {
    const p = toWorld(c, lx, lz);
    const v = make(type, p.x, p.z, c.yaw, CARRIER_DECK);
    v.deckHome = { lx, lz };
  }
  make('sub', 70, SHORE + 4.5, Math.PI / 2);
  make('sub', 150, SHORE + 4.5, Math.PI / 2);
}

export function clearVehicles() {
  for (const v of world.vehicles || []) {
    if (v.model.procedural) scene.remove(v.model.root); // shares its materials: just take it away
    else disposeModel(v.model);
  }
  world.vehicles = [];
  carrierShip = null;
}

/* How high a vehicle is above whatever is under it (street, roof, deck or water). */
const heightAbove = v => v.alt - groundAt(v.pos.x, v.pos.z, v.alt + 0.5);

/* The vehicle Joseph is standing next to (for the action button). The carrier is boarded from its deck. */
export function vehicleNear() {
  if (P.vehicle || P.kong || P.climb) return null;
  let best = null, bd = Infinity;
  for (const v of world.vehicles) {
    if (v.dead || v.crashing || v.type === 'carrier' || heightAbove(v) > 1 || Math.abs(v.alt - P.y) > 2.5) continue;
    if (v.type === 'sub' && v.depth > 1) continue;
    // a submarine is long: you can climb in anywhere along its side
    let d = flatDist(v.pos, P.pos);
    if (v.type === 'sub') {
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), along = clamp((P.pos.x - v.pos.x) * fx + (P.pos.z - v.pos.z) * fz, -13, 13);
      d = Math.hypot(P.pos.x - (v.pos.x + fx * along), P.pos.z - (v.pos.z + fz * along));
    }
    if (d < v.t.radius + 2.5 && d < bd) { bd = d; best = v; }
  }
  return best;
}

export function enterVehicle(v) {
  P.vehicle = v; v.occupied = true; P.ads = false;
  P.yaw = v.yaw; P.pitch = 0.05;
  P.liftUp = P.liftDown = false;
  sfx.pickup();
  const k = v.t.kind;
  if (k === 'jet') { world.banner?.(`${v.type === 'blueangel' ? 'BLUE ANGEL' : 'JET'}!<small>Push up to take off. 🛬 LAND to come down</small>`, 3200); say('Push up to take off!'); }
  else if (k === 'heli') { world.banner?.('HELICOPTER!<small>Hold UP to fly, DOWN to land anywhere</small>', 3200); say('Hold up to fly!'); }
  else if (k === 'ship') { world.banner?.('CAPTAIN!<small>Steer the carrier out to sea</small>', 2800); say('You are the captain!'); }
  else if (k === 'sub') { world.banner?.('SUBMARINE!<small>Hold DOWN to dive, FIRE torpedoes</small>', 3200); say('Submarine! Hold down to dive!'); }
  else if (v.type === 'tank') { world.banner?.('TANK!<small>Drag to aim, FIRE the cannon</small>', 2600); say('Tank! Fire the cannon!'); }
  else if (v.type === 'missile') { world.banner?.('MISSILE TRUCK!<small>FIRE a missile, then steer it with the stick</small>', 3200); say('Fire a missile and steer it!'); }
  else world.banner?.('DRIVE!<small>Run over the monsters!</small>', 2200);
  world.onVehicleChange?.();
}

/* Can Joseph get out here? Returns a reason when he can't. */
export function exitBlocked() {
  const v = P.vehicle;
  if (!v) return null;
  if (v.type === 'sub' && v.depth > 1) return 'Come up to the surface first!';
  if (v.t.kind === 'heli' && heightAbove(v) > 4 && isWater(v.pos.x, v.pos.z) && !platformAt(v.pos.x, v.pos.z, v.alt)) return 'Land on the ship or fly back to land first!';
  return null;
}

export function exitVehicle() {
  const v = P.vehicle;
  if (!v) return;
  const why = exitBlocked();
  if (why) { world.banner?.(why, 1800); return; }
  P.vehicle = null; v.occupied = false;
  if (v.type === 'carrier') {
    // step out of the bridge onto the middle of the deck
    P.pos.copy(toWorld(v, -4, 0)); P.y = CARRIER_DECK; P.vy = 0;
  } else if (v.t.kind === 'ship' || v.t.kind === 'sub') {
    // from a submarine: onto the carrier if it's right there, otherwise back onto the dock
    if (carrierShip && flatDist(carrierShip.pos, v.pos) < 70) { P.pos.copy(toWorld(carrierShip, -6, 0)); P.y = CARRIER_DECK; }
    else { P.pos.set(clamp(v.pos.x, -250, 250), 0, SHORE - 3); P.y = 0; world.banner?.('Back on the dock!', 1600); }
  } else {
    const side = new V3(-Math.cos(v.yaw), 0, Math.sin(v.yaw)).multiplyScalar(v.t.radius + 1.2);
    P.pos.set(v.pos.x + side.x, 0, v.pos.z + side.z);
    const air = (v.t.kind === 'jet' || v.t.kind === 'heli') && heightAbove(v) > 4;
    if (air) {
      P.y = v.alt; P.vy = 0; P.parachute = true;
      world.banner?.('PARACHUTE!', 1600);
      v.crashing = true; // the empty aircraft glides down and crashes harmlessly
    } else {
      P.y = groundAt(P.pos.x, P.pos.z, v.alt + 1);
      if (P.y < v.alt - 1.5) P.y = v.alt; // parked on a deck or roof: stand there too
    }
    collide(P.pos, 0.5, P.y);
  }
  P.inv = Math.max(P.inv, 1);
  P.liftUp = P.liftDown = false;
  world.onVehicleChange?.();
}

/* What monsters hit while Joseph is driving. */
export const vehicleVictim = {
  get pos() { return P.vehicle ? P.vehicle.pos : P.pos; },
  get elev() { return P.vehicle ? P.vehicle.alt : 0; },
  aimY: 1.2, radius: 2.5,
  get alive() { return !!P.vehicle && P.vehicle.alt < 6 && P.vehicle.alt > -2 && P.vehicle.type !== 'carrier'; },
  hurt: n => damageVehicle(P.vehicle, n * 3),
};

function damageVehicle(v, n) {
  if (!v || v.dead) return;
  v.hp -= n;
  sparks(v.pos.clone().setY(v.alt + 1.5), 0xffd27a, 6, 6, 0.4);
  if (v.hp <= v.t.hp * 0.3 && Math.random() < 0.3) smoke(v.pos.clone().setY(v.alt + 2), 1, 2, 0x333333, 1, 1.5);
  if (v.hp <= 0) wreck(v);
}

function wreck(v) {
  v.dead = true;
  const splash = isWater(v.pos.x, v.pos.z) && !platformAt(v.pos.x, v.pos.z, v.alt + 0.5);
  if (splash) { smoke(v.pos.clone().setY(0.5), 12, 4, 0xf4f8ff, 5, 1.6); popWord('SPLASH!', v.pos.clone().setY(6), '#bfe8ff', 4); }
  else fireball(v.pos.clone().setY(v.alt + 1.5), v.type === 'car' ? 5 : 8);
  sfx.boom(); shake(0.8);
  if (P.vehicle === v) { P.vehicle = null; v.occupied = false; P.pos.set(clamp(v.pos.x, -250, 250), 0, Math.min(v.pos.z, SHORE - 3)); P.y = groundAt(P.pos.x, P.pos.z, 0); world.onVehicleChange?.(); world.banner?.('Jump out!', 1400); }
  v.model.root.visible = false;
  // a fresh one comes back where it was parked (on the carrier's deck if that's where it lives)
  setTimeout(() => {
    if (!world.vehicles.includes(v)) return;
    Object.assign(v, { dead: false, hp: v.t.hp, speed: 0, alt: v.home.alt, crashing: false, landing: false, climb: 0, yaw: v.home.yaw });
    if (v.deckHome && carrierShip) { v.pos.copy(toWorld(carrierShip, v.deckHome.lx, v.deckHome.lz)); v.yaw = carrierShip.yaw; v.alt = CARRIER_DECK; }
    else v.pos.set(v.home.x, 0, v.home.z);
    v.model.root.visible = true;
  }, 15000);
}

/* ---------- driving (car, tank, missile truck) ---------- */
function drive(v, drv, dt) {
  const t = v.t;
  // GAS speeds up; BRAKE slows down, and once stopped it backs up
  if (drv.gas) v.speed += t.accel * dt;
  if (drv.brake) v.speed -= (v.speed > 0.5 ? t.accel * 2.2 : t.accel * 0.8) * dt;
  if (!drv.gas && !drv.brake) v.speed *= Math.pow(0.45, dt);
  v.speed = clamp(v.speed, -t.maxSpeed * 0.4, t.maxSpeed);
  // steering: turns well even when slow, a little gentler at top speed; tanks can turn on the spot
  const grip = v.type === 'tank' ? 1 : Math.min(1, 0.35 + Math.abs(v.speed) / 4);
  const gentle = 1 - 0.25 * Math.min(1, Math.abs(v.speed) / t.maxSpeed);
  const dir = v.speed < -0.5 ? -1 : 1;
  v.yaw -= drv.steer * t.turn * grip * gentle * dt * dir;
  if (Math.abs(drv.steer) > 0.6 && v.speed > t.maxSpeed * 0.7) v.speed *= Math.pow(0.7, dt); // ease off in hard turns
  const before = v.pos.clone();
  v.pos.x += Math.sin(v.yaw) * v.speed * dt;
  v.pos.z += Math.cos(v.yaw) * v.speed * dt;
  collide(v.pos, t.radius * 0.8, v.alt);
  v.alt = groundAt(v.pos.x, v.pos.z, v.alt + 0.6);
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

/* ---------- flying a jet (with landing) ---------- */
function keepInAir(v, dt) {
  // the sky has edges too: turn back toward the city
  const m = 40;
  if (v.pos.x < AIR.x0 + m || v.pos.x > AIR.x1 - m || v.pos.z < AIR.z0 + m || v.pos.z > AIR.z1 - m) {
    v.yaw = turnToward(v.yaw, angleTo(v.pos, new V3(0, 0, 300)), dt * 1.5);
    v.pos.x = clamp(v.pos.x, AIR.x0, AIR.x1); v.pos.z = clamp(v.pos.z, AIR.z0, AIR.z1);
  }
}

/* 🛬 LAND: the jet slows down and glides down ahead of it, onto a runway, a road, a field or the carrier deck. */
export function startLanding() {
  const v = P.vehicle;
  if (!v || v.t.kind !== 'jet' || heightAbove(v) < 1 || v.landing) return;
  v.landing = true; v.waterWarned = false;
  world.banner?.('LANDING!<small>Steer onto a runway, a field or the carrier</small>', 2400);
  say('Landing!');
}

function touchDown(v, ground) {
  v.alt = ground; v.climb = 0; v.landing = false; v.braking = true;
  sfx.hit(); shake(0.4); smoke(v.pos.clone().setY(ground + 0.3), 6, 2, 0xd8d2c8, 2, 1);
  world.banner?.('LANDED!', 1600); say('Landed!');
}

function fly(v, inp, dt) {
  const t = v.t;
  const ground = groundAt(v.pos.x, v.pos.z, v.alt + 0.5);
  const hag = v.alt - ground;
  const airborne = hag > 0.5;
  if (v.landing && airborne) {
    // glide in slowly; over open water just keep flying low until there's somewhere to land
    const overWater = isWater(v.pos.x, v.pos.z) && !platformAt(v.pos.x, v.pos.z, v.alt + 0.5);
    v.speed += ((overWater ? 30 : 24) - v.speed) * Math.min(1, dt * 0.8);
    const want = overWater && hag < 12 ? 0 : hag > 30 ? -10 : -5;
    v.climb += (want - v.climb) * Math.min(1, dt * 2);
    if (overWater && !v.waterWarned) { v.waterWarned = true; world.banner?.('Find land or the carrier!', 1800); }
    v.alt = Math.max(ground, v.alt + v.climb * dt);
    if (v.alt - ground < 0.3) touchDown(v, ground);
  } else if (airborne) {
    v.speed = clamp(v.speed + t.accel * dt, 0, t.maxSpeed);
    v.climb += ((-inp.z) * 18 - v.climb) * Math.min(1, dt * 2);
    v.alt = clamp(v.alt + v.climb * dt, ground + 0.6, 160);
    if (v.alt < ground + 8) { v.alt += Math.min(ground + 8 - v.alt, 30 * dt); v.climb = Math.max(v.climb, 6); }
  } else {
    // on the ground: push up to speed down the runway; after landing the brakes stop it quickly
    if (v.landing) touchDown(v, ground);
    v.alt = ground;
    const throttle = v.braking ? 0 : Math.max(0, -inp.z);
    if (throttle > 0.1) { v.braking = false; v.speed = clamp(v.speed + t.accel * throttle * dt, 0, t.maxSpeed); }
    else v.speed *= Math.pow(v.braking ? 0.12 : 0.4, dt);
    if (v.braking && v.speed < 1) v.braking = false;
    if (v.speed > 32) { v.alt = ground + 0.6; v.climb = 4; }
  }
  const turnRate = airborne ? t.turn : t.turn * 0.4 * Math.min(1, v.speed / 10);
  v.yaw -= inp.x * turnRate * dt;
  v.roll += ((airborne ? -inp.x * 0.7 : 0) - v.roll) * Math.min(1, dt * 4);
  v.pos.x += Math.sin(v.yaw) * v.speed * dt;
  v.pos.z += Math.cos(v.yaw) * v.speed * dt;
  keepInAir(v, dt);
  if (!airborne) collide(v.pos, t.radius * 0.6, v.alt);
  v.pitchTilt = -v.climb * 0.02;
}

/* ---------- flying a helicopter ---------- */
function heli(v, inp, dt) {
  const t = v.t;
  const ground = groundAt(v.pos.x, v.pos.z, v.alt + 0.5);
  const lift = (P.liftUp ? 1 : 0) - (P.liftDown ? 1 : 0);
  v.climb += (lift * 9 - v.climb) * Math.min(1, dt * 3);
  v.alt = clamp(v.alt + v.climb * dt, ground, 170);
  const landed = v.alt - ground < 0.05;
  if (landed && v.climb < 0) v.climb = 0;
  const fwd = landed ? 0 : -inp.z;
  v.speed += (fwd * t.maxSpeed - v.speed) * Math.min(1, dt * (landed ? 4 : 1.2));
  v.yaw -= inp.x * t.turn * dt * (landed ? 0.3 : 1);
  v.pos.x += Math.sin(v.yaw) * v.speed * dt;
  v.pos.z += Math.cos(v.yaw) * v.speed * dt;
  if (v.alt < 40) collide(v.pos, t.radius * 0.6, v.alt); // tall buildings are in the way when flying low
  keepInAir(v, dt);
  v.pitchTilt += ((-v.speed / t.maxSpeed) * -0.22 - v.pitchTilt) * Math.min(1, dt * 3);
  v.roll += (-inp.x * 0.25 * (landed ? 0 : 1) - v.roll) * Math.min(1, dt * 3);
  v.spin = landed && !P.liftUp ? Math.max(8, (v.spin || 30) - dt * 10) : 30;
}

function fireRockets(v) {
  if (v.fireCd > 0) return;
  v.fireCd = v.t.rockets;
  const fwd = new V3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  // aim at the monster most in front of the helicopter, otherwise at the ground ahead
  let target = null, best = 0.85;
  for (const tg of liveTargets()) {
    const to = aimPoint(tg).sub(v.pos.clone().setY(v.alt));
    const d = to.length();
    if (d > 90) continue;
    const dot = to.normalize().dot(new V3(fwd.x, -0.35, fwd.z).normalize());
    if (dot > best) { best = dot; target = tg; }
  }
  const goal = target || { pos: v.pos.clone().addScaledVector(fwd, 40).setY(groundAt(v.pos.x + fwd.x * 40, v.pos.z + fwd.z * 40, 999)), aimY: 0, radius: 0, hit() {} };
  for (const side of [-1.6, 1.6]) {
    const from = v.pos.clone().add(new V3(-Math.cos(v.yaw) * side, 0, Math.sin(v.yaw) * side)).addScaledVector(fwd, 1).setY(v.alt + 1.6);
    fireWeapon('bazooka', 3, from, goal, { quiet: side > 0 });
  }
}

/* ---------- ships and submarines ---------- */
/* Is this spot open sea, far enough from the shore and the carrier? */
function seaOK(v, x, z, margin) {
  if (!(z > SHORE + margin && z < OCEAN.z1 - margin && x > OCEAN.x0 + margin && x < OCEAN.x1 - margin)) return false;
  if (v.type !== 'carrier' && carrierShip) {
    const { lx, lz } = toLocal(carrierShip, x, z);
    if (Math.abs(lx) < CARRIER_SIZE.halfBeam + 2 && Math.abs(lz) < CARRIER_SIZE.halfLength + 2 && v.alt > -12) return false;
  }
  return true;
}

function sail(v, drv, dt) {
  const t = v.t;
  if (drv.gas) v.speed += t.accel * dt;
  if (drv.brake) v.speed -= t.accel * 1.4 * dt;
  if (!drv.gas && !drv.brake) v.speed *= Math.pow(0.7, dt);
  v.speed = clamp(v.speed, -t.maxSpeed * 0.4, t.maxSpeed);
  const steerYaw = drv.steer * t.turn * Math.min(1, Math.abs(v.speed) / 2 + 0.15) * (v.speed < -0.3 ? -1 : 1) * dt;
  const oldX = v.pos.x, oldZ = v.pos.z, oldYaw = v.yaw;
  v.yaw -= steerYaw;
  const nx = v.pos.x + Math.sin(v.yaw) * v.speed * dt, nz = v.pos.z + Math.cos(v.yaw) * v.speed * dt;
  // check the bow, the stern and (for the carrier) the sides
  const half = v.type === 'carrier' ? CARRIER_SIZE.halfLength : 15, beam = v.type === 'carrier' ? CARRIER_SIZE.halfBeam : 2.5;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  const ok = [[half, 0], [-half, 0], [half * 0.6, beam], [half * 0.6, -beam], [-half * 0.6, beam], [-half * 0.6, -beam]]
    .every(([f, r]) => seaOK(v, nx + fx * f + rx * r, nz + fz * f + rz * r, 1));
  if (ok) { v.pos.x = nx; v.pos.z = nz; }
  else {
    v.yaw = oldYaw;
    if (Math.abs(v.speed) > 3) { sfx.hit(); shake(0.3); }
    v.speed *= -0.2;
  }
  if (v.type === 'sub') {
    const dive = (P.liftDown ? 1 : 0) - (P.liftUp ? 1 : 0);
    v.depth = clamp(v.depth + dive * 6 * dt, 0, 24);
    v.alt = -v.depth;
    v.model.parts.prop.rotation.z += v.speed * dt * 2;
  }
  if (Math.abs(v.speed) > 2 && v.depth < 1 && Math.random() < 0.3) smoke(v.pos.clone().addScaledVector(new V3(fx, 0, fz), -half).setY(0.4), 1, 1.5, 0xf4f8ff, 1, 1);
  return { dx: v.pos.x - oldX, dz: v.pos.z - oldZ, dyaw: v.yaw - oldYaw, ox: oldX, oz: oldZ };
}

/* Everything standing on the carrier deck rides along when it moves or turns. */
function carryRiders(c, move) {
  if (!move.dx && !move.dz && !move.dyaw) return;
  const cs = Math.cos(move.dyaw), sn = Math.sin(move.dyaw);
  const ride = p => {
    const rx = p.x - move.ox, rz = p.z - move.oz;
    p.x = c.pos.x + rx * cs + rz * sn;
    p.z = c.pos.z - rx * sn + rz * cs;
  };
  for (const v of world.vehicles) {
    if (v === c || v.dead || Math.abs(v.alt - CARRIER_DECK) > 0.6) continue;
    if (!onDeckWorld(move, v.pos)) continue;
    ride(v.pos); v.yaw += move.dyaw;
  }
  if (!P.vehicle && Math.abs(P.y - CARRIER_DECK) < 0.8 && onDeckWorld(move, P.pos)) { ride(P.pos); P.yaw += move.dyaw; P.face += move.dyaw; }
}
/* On the deck where the carrier *was* at the start of this frame. */
function onDeckWorld(move, p) {
  const c = carrierShip, yaw = c.yaw - move.dyaw, cs = Math.cos(yaw), sn = Math.sin(yaw);
  const dx = p.x - move.ox, dz = p.z - move.oz;
  return Math.abs(dx * cs - dz * sn) < CARRIER_SIZE.halfBeam + 0.5 && Math.abs(dx * sn + dz * cs) < CARRIER_SIZE.halfLength + 0.5;
}

/* ---------- jet bombs ---------- */
function dropBomb(v) {
  if (v.fireCd > 0 || heightAbove(v) < 6) return;
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
      if (isWater(b.pos.x, b.pos.z) && ground <= WATER_Y + 0.1) smoke(b.pos.clone().setY(0.5), 14, 4, 0xf4f8ff, 5, 1.8); // splash
      explode(b.pos.clone().setY(ground + 1), 12, 60);
      fireball(b.pos.clone().setY(ground + 2), 10);
      shake(1);
      scene.remove(b.mesh);
      bombs.splice(i, 1);
    }
  }
}

/* ---------- per frame ---------- */
const NO_DRIVE = { steer: 0, gas: 0, brake: 0 };
export function updateVehicles(dt, inp, drv = { steer: inp.x, gas: inp.z < -0.2 ? 1 : 0, brake: inp.z > 0.2 ? 1 : 0 }) {
  for (const v of world.vehicles) {
    v.fireCd -= dt;
    if (v.dead) continue;
    const k = v.t.kind;
    if (v.occupied) {
      // while a guided missile is flying, the truck waits
      const d = missile.active ? NO_DRIVE : drv;
      if (k === 'jet') fly(v, inp, dt);
      else if (k === 'heli') heli(v, inp, dt);
      else if (k === 'ship' || k === 'sub') { const move = sail(v, d, dt); if (v === carrierShip) carryRiders(v, move); }
      else drive(v, d, dt);
      if ((P.firing || P.fireQueued) && !missile.active) {
        if (v.type === 'tank') fireCannon(v);
        else if (k === 'jet') dropBomb(v);
        else if (k === 'heli') fireRockets(v);
        else if (v.type === 'missile' && v.fireCd <= 0) { v.fireCd = 2; launchMissile(v); }
        else if (v.type === 'sub' && v.fireCd <= 0) { v.fireCd = v.t.torpedo; fireTorpedo(v); }
        P.fireQueued = false;
      }
      if (v.type !== 'carrier') {
        P.pos.set(v.pos.x, 0, v.pos.z);
        P.y = v.alt;
      } else {
        P.pos.copy(carrierBridgeDoor()); P.y = CARRIER_DECK + 4; // the captain stands on the bridge
      }
      P.moving = Math.min(1, Math.abs(v.speed) / 10);
    } else if (v.crashing) {
      // abandoned aircraft glides down
      v.alt = Math.max(groundAt(v.pos.x, v.pos.z, v.alt), v.alt - 12 * dt);
      v.pos.x += Math.sin(v.yaw) * v.speed * dt; v.pos.z += Math.cos(v.yaw) * v.speed * dt;
      if (v.alt - groundAt(v.pos.x, v.pos.z, v.alt) <= 0.1) { v.crashing = false; wreck(v); }
    } else if (Math.abs(v.speed) > 0.1 && k !== 'ship' && k !== 'sub') {
      v.speed *= Math.pow(0.3, dt);
      v.pos.x += Math.sin(v.yaw) * v.speed * dt; v.pos.z += Math.cos(v.yaw) * v.speed * dt;
      collide(v.pos, v.t.radius * 0.8, v.alt);
    } else if (k === 'sub' && v.depth > 0) {
      v.depth = Math.max(0, v.depth - 3 * dt); v.alt = -v.depth; // an empty submarine floats back up
    }
    const r = v.model.root;
    const bob = k === 'ship' ? Math.sin(world.time * 0.5) * 0.15 : (k === 'sub' && v.depth < 0.5 ? Math.sin(world.time * 1.3) * 0.12 : 0);
    r.position.set(v.pos.x, v.alt + bob - (k === 'sub' ? 1.2 : 0), v.pos.z);
    const tiltX = k === 'jet' || k === 'heli' ? (v.pitchTilt || 0) : k === 'ship' ? Math.sin(world.time * 0.4) * 0.008 : 0;
    r.rotation.set(tiltX, v.yaw, k === 'jet' || k === 'heli' ? v.roll : 0, 'YXZ');
    if (k === 'heli') {
      const spin = v.occupied ? (v.spin || 30) : 0;
      v.model.parts.rotor.rotation.y += spin * dt;
      v.model.parts.tailRotor.rotation.x += spin * 1.6 * dt;
    }
    if (v === carrierShip) v.model.parts.radar.rotation.y += dt * 1.2;
  }
  updateBombs(dt);
}

export function clearBombs() {
  for (const b of bombs) scene.remove(b.mesh);
  bombs.length = 0;
}
export { popWord, heightAbove };
