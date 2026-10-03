// City missions: monster camps hold people in cages. Beat the guards, free the people (they join the army),
// and when every camp is free the city's Godzilla boss shows up.
import * as THREE from 'three';
import { scene } from './engine.js';
import { CITIES } from './settings.js';
import { spawnEnemy, spawnRoamer } from './enemies.js';
import { disposeModel, disposeGroup } from './models.js';
import { spawnHostage, updateHostages, recruit } from './allies.js';
import { dropLoot } from './loot.js';
import { addPower } from './hero.js';
import { bossArrives } from './boss.js';
import { sfx, say } from './audio.js';
import { sparks, smoke, popWord } from './fx.js';
import { tex } from './textures.js';
import { GAME } from './settings.js';
import { V3, rnd, pick, world, P, loadout, flatDist } from './world.js';

const barMat = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.35, metalness: 0.9 });
const barrierMat = new THREE.MeshStandardMaterial({ map: tex('sidewalk'), color: 0xa9a49a, roughness: 0.9 });
const sandMat = new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 1 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 2 });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd866, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

const CAGE = 3.6; // half-size of the cage

function buildCage(center) {
  const g = new THREE.Group();
  g.position.copy(center);
  const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6);
  barGeo.translate(0, 1.7, 0);
  const sides = [];
  for (let side = 0; side < 4; side++) {
    const wall = new THREE.Group();
    for (let i = -6; i <= 6; i++) {
      const b = new THREE.Mesh(barGeo, barMat);
      b.position.set(i * (CAGE / 6), 0, 0); b.castShadow = true;
      wall.add(b);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CAGE * 2, 0.14, 0.14), barMat);
    rail.position.y = 3.4; wall.add(rail);
    const a = side * Math.PI / 2;
    wall.position.set(Math.sin(a) * CAGE, 0, Math.cos(a) * CAGE);
    wall.rotation.y = a;
    g.add(wall);
    sides.push(wall);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(CAGE * 2, 0.2, CAGE * 2), new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.6, metalness: 0.6 }));
  floor.position.y = 0.1; floor.receiveShadow = true; g.add(floor);
  // concrete barriers and sandbags around the camp
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(6.5, 7.2);
    const block = Math.random() < 0.5
      ? new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.7), barrierMat)
      : new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.4, 3, 8).rotateZ(Math.PI / 2), sandMat);
    block.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
    block.rotation.y = -a + Math.PI / 2;
    block.castShadow = block.receiveShadow = true;
    g.add(block);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
  lamp.position.set(CAGE, 3.6, CAGE); g.add(lamp);
  // the light beam starts above the people's heads so they stay easy to see
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 64, 20, 1, true), beamMat);
  beam.position.y = 5 + 32; g.add(beam);
  scene.add(g);
  return { g, sides, beam, lamp };
}

function createCamp(center, spec, types) {
  const cage = buildCage(center);
  const hostages = [];
  for (let i = 0; i < spec.people; i++) {
    const a = (i / spec.people) * Math.PI * 2;
    hostages.push(spawnHostage(new V3(center.x + Math.cos(a) * 1.4, 0.2, center.z + Math.sin(a) * 1.4)));
  }
  const guards = [];
  for (let i = 0; i < spec.guards; i++) {
    const a = (i / spec.guards) * Math.PI * 2 + rnd(-0.2, 0.2);
    const type = i === 0 && types.includes('brute') ? 'brute' : pick(types);
    guards.push(spawnEnemy(type, new V3(center.x + Math.cos(a) * rnd(8.5, 11), 0, center.z + Math.sin(a) * rnd(8.5, 11)), center));
  }
  return { center: center.clone(), cage, hostages, guards, state: 'guarded', openT: 0 };
}

export function clearCamps() {
  for (const c of world.camps) {
    disposeGroup(c.cage.g);
    for (const h of c.hostages) disposeModel(h.model);
  }
  world.camps = [];
}

export function setupMissions(cityIndex, campSites) {
  const city = CITIES[cityIndex];
  clearCamps();
  world.camps = campSites.map((site, i) => createCamp(site, city.camps[i], city.monsterTypes));
  world.campsFreed = 0;
  for (let i = 0; i < city.roamers; i++) spawnRoamer(city.monsterTypes);
  roamerT = 6;
}

let roamerT = 6;

function openCage(camp) {
  camp.state = 'open';
  camp.openT = 0;
  sfx.cage();
  world.banner?.('Guards beaten!<small>Free the people!</small>', 2400);
  say('Free the people!');
}

function freeCamp(camp) {
  camp.state = 'freed';
  camp.cage.beam.visible = false;
  camp.cage.lamp.material = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x2aff4a, emissiveIntensity: 2 });
  let joined = 0;
  for (const h of camp.hostages) { if (recruit(h)) joined++; addPower(GAME.power.perPerson); }
  camp.hostages = [];
  world.campsFreed++;
  sfx.save();
  sparks(camp.center.clone().setY(2), 0xffe066, 24, 8, 0.5);
  // every camp gives a reward crate; the city's new guns come from camps first
  const unlockable = (world.city.unlocks || []).filter(w => !loadout.owned.includes(w) && !world.pickups.some(p => p.weaponId === w));
  if (unlockable.length) dropLoot(camp.center.clone().add(new V3(0, 0, CAGE + 1.5)), 'weapon', unlockable[0]);
  else dropLoot(camp.center.clone().add(new V3(0, 0, CAGE + 1.5)), Math.random() < 0.5 ? 'power' : 'rate');
  const left = world.camps.length - world.campsFreed;
  if (left > 0) {
    world.banner?.(`${joined ? joined + ' joined your army!' : 'People saved!'}<small>${left} camp${left > 1 ? 's' : ''} to go</small>`, 2600);
    say(joined ? `${joined} joined your army!` : 'People saved!');
  }
}

export function updateMissions(dt) {
  for (const camp of world.camps) {
    updateHostages(camp.hostages, dt);
    if (camp.state === 'guarded') {
      camp.cage.lamp.material.emissiveIntensity = 1.5 + Math.sin(world.time * 8) * 1;
      if (camp.guards.every(g => !g.alive)) openCage(camp);
    } else if (camp.state === 'open') {
      // the front wall swings open
      camp.openT = Math.min(1, camp.openT + dt * 1.5);
      camp.cage.sides[0].rotation.x = -camp.openT * Math.PI / 2 * 0.95;
      if (camp.openT < 1 && Math.random() < 0.3) smoke(camp.center.clone().setY(0.5), 1, 1.5, 0xb7ab98, 3, 1);
      if (flatDist(camp.center, P.pos) < CAGE + (P.kong ? 4 : 1.5)) freeCamp(camp);
    }
  }
  // keep a few monsters roaming the streets
  if (world.state === 'mission') {
    roamerT -= dt;
    const roaming = world.enemies.filter(e => e.alive && !e.camp).length;
    if (roamerT <= 0 && roaming < world.city.roamers) { spawnRoamer(world.city.monsterTypes); roamerT = rnd(4, 8); }
    if (world.camps.length && world.campsFreed >= world.camps.length) startBossIntro();
  }
}

let introT = 0;
function startBossIntro() {
  world.state = 'bossIntro'; introT = 0;
  world.banner?.('ALL CAMPS FREE!<small>Get ready...</small>', 2400);
  say('All camps free! Get ready!');
  sfx.save();
}

export function updateBossIntro(dt) {
  introT += dt;
  if (introT > 2.6 && introT - dt <= 2.6) bossArrives();
}

/* Where the yellow arrow points: the closest camp that still needs help. */
export function objective() {
  let best = null, bd = Infinity;
  for (const c of world.camps) {
    if (c.state === 'freed') continue;
    const d = flatDist(c.center, P.pos);
    if (d < bd) { bd = d; best = c.center; }
  }
  return best;
}

export function campStatus() {
  return { freed: world.campsFreed, total: world.camps.length };
}

