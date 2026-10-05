// Level missions (rescue, nests, rooftop, airstrike, tank, collect). When the goal is done, the level's boss lands.
import * as THREE from 'three';
import { scene } from './engine.js';
import { GAME } from './settings.js';
import { MISSION_TEXT } from './levels.js';
import { spawnEnemy, spawnRoamer } from './enemies.js';
import { disposeModel, disposeGroup } from './models.js';
import { spawnHostage, updateHostages, recruit } from './allies.js';
import { dropLoot } from './loot.js';
import { addPower } from './hero.js';
import { bossArrives } from './boss.js';
import { spawnNest, clearNests } from './nests.js';
import { buildCage, beacon, CAGE } from './camps.js';
import { placeCrate } from './crates.js';
import { startStory, clearStory, targetsRevealed, missionGoalsDone, reachedHq, storyObjective, storyStage, storyGoalText } from './story.js';
import { DISTRICTS, buildings, openSpotNear, roadPointIn } from './map.js';
import { sfx, say } from './audio.js';
import { sparks, smoke, popWord } from './fx.js';
import { V3, rnd, pick, world, P, loadout, flatDist } from './world.js';

let mission = null; // { type, total, done, items: [...], stage }
let roamerT = 6, introT = 0;
const markers = [];

/* Spread-out open spots inside a district. */
function spotsIn(districtId, n, minGap = 45, clearance = 8) {
  const d = DISTRICTS[districtId];
  const spots = [];
  for (let tries = 0; spots.length < n && tries < 400; tries++) {
    const p = openSpotNear(rnd(d.x0 + 20, d.x1 - 20), rnd(d.z0 + 20, d.z1 - 20), 10, clearance);
    if (Math.hypot(p.x - DISTRICTS[districtId].arena[0], p.z - DISTRICTS[districtId].arena[1]) < 15) continue;
    if (spots.every(s => s.distanceTo(p) > minGap - tries * 0.08)) spots.push(p);
  }
  return spots;
}

function guards(center, count, types, radius = 10) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd(-0.2, 0.2);
    const type = i === 0 && types.includes('brute') ? 'brute' : pick(types.filter(t => t !== 'bomber')) || 'lizard';
    list.push(spawnEnemy(type, new V3(center.x + Math.cos(a) * rnd(radius * 0.8, radius * 1.1), 0, center.z + Math.sin(a) * rnd(radius * 0.8, radius * 1.1)), center));
  }
  return list;
}
const guardCount = i => Math.round((3 + i * 0.7) * (1 + world.levelIndex * 0.08) * GAME.difficulty);

/* ---------- set up each mission type ---------- */
const SETUP = {
  rescue(level) {
    return spotsIn(level.district, level.mission.count).map((c, i) => {
      const cage = buildCage(c);
      const people = 2 + (i % 2) + Math.floor(world.levelIndex / 8);
      const hostages = [];
      for (let k = 0; k < people; k++) {
        const a = (k / people) * Math.PI * 2;
        hostages.push(spawnHostage(new V3(c.x + Math.cos(a) * 1.4, 0.2, c.z + Math.sin(a) * 1.4)));
      }
      for (let k = 0; k < 3; k++) placeCrate(k ? 'wood' : 'ammo', new V3(c.x + rnd(-9, 9), 0, c.z + (k % 2 ? 9 : -9)));
      return { kind: 'camp', pos: c, cage, hostages, guards: guards(c, guardCount(i), level.monsters), state: 'guarded', openT: 0, done: false };
    });
  },
  nests(level) {
    return spotsIn(level.district, level.mission.count).map(c => {
      const nest = spawnNest(c, { types: level.monsters.filter(t => t !== 'brute').concat(['lizard']), spawnEvery: Math.max(4, 8 - world.levelIndex * 0.2) });
      guards(c, 2, level.monsters, 8);
      return { kind: 'nest', pos: c, nest, done: false };
    });
  },
  rooftop(level) {
    const d = DISTRICTS[level.district];
    const roofs = buildings.filter(b => b.ladder && b.alive && b.cx > d.x0 && b.cx < d.x1 && b.cz > d.z0 && b.cz < d.z1)
      .sort(() => Math.random() - 0.5).slice(0, level.mission.count);
    return roofs.map(b => {
      const pos = new V3(b.cx, b.h, b.cz);
      const hostage = spawnHostage(pos);
      for (let k = 0; k < 2; k++) placeCrate('wood', new V3(b.cx + rnd(-b.hw + 1, b.hw - 1), b.h, b.cz + rnd(-b.hd + 1, b.hd - 1)));
      guards(new V3(b.ladder.x, 0, b.ladder.z), 3, level.monsters, 6);
      return { kind: 'roof', pos, building: b, hostage, beam: beacon(pos), done: false };
    });
  },
  airstrike(level) {
    return spotsIn('volcano', level.mission.count, 60, 14).map(c => ({ kind: 'base', pos: c, nest: spawnNest(c, { big: true }), done: false }));
  },
  tank(level) {
    const d = DISTRICTS[level.district];
    const groupAt = new V3(d.arena[0] + rnd(-30, 30), 0, d.arena[1] + rnd(-30, 30));
    const items = [];
    for (let i = 0; i < level.mission.count; i++) {
      const p = openSpotNear(groupAt.x, groupAt.z, 40, 3);
      const e = spawnEnemy('brute', p, groupAt);
      e.missionTarget = true;
      items.push({ kind: 'brute', pos: e.pos, enemy: e, done: false });
    }
    return items;
  },
  collect(level) {
    return spotsIn(level.district, level.mission.count, 35).map(c => {
      const part = makePart(c);
      guards(c, 3, level.monsters, 7);
      return { kind: 'part', pos: c, part, done: false };
    });
  },
};

/* Glowing weapon part to pick up (collect missions). */
const partGeo = new THREE.TorusGeometry(0.6, 0.22, 10, 18);
const partMat = new THREE.MeshStandardMaterial({ color: 0x8a6a1a, emissive: 0xffb800, emissiveIntensity: 1.2, metalness: 0.9, roughness: 0.3 });
function makePart(pos) {
  const m = new THREE.Mesh(partGeo, partMat);
  m.position.copy(pos).setY(1.3);
  m.castShadow = true;
  scene.add(m);
  markers.push(m, beacon(pos, 0xffb800));
  return m;
}

export function setupMission(level) {
  clearMission();
  const items = SETUP[level.mission.type](level);
  mission = { type: level.mission.type, level, items, total: items.length, stage: 'go', lastPos: new V3(-4, 0, 12) };
  for (let i = 0; i < level.roamers; i++) spawnRoamer(level.monsters, level.district);
  roamerT = 6;
  startStory(world.levelIndex, level, () => {
    world.banner?.(`${MISSION_TEXT[level.mission.type].icon} ${MISSION_TEXT[level.mission.type].goal}<small>It's on your map now</small>`, 3200);
  });
}

export function clearMission() {
  if (mission) for (const it of mission.items) {
    if (it.cage) disposeGroup(it.cage.g);
    for (const h of it.hostages || []) disposeModel(h.model);
    if (it.hostage && !it.done) disposeModel(it.hostage.model);
    if (it.beam) scene.remove(it.beam);
    if (it.part) scene.remove(it.part);
  }
  for (const m of markers) scene.remove(m);
  markers.length = 0;
  clearNests();
  clearStory();
  mission = null;
}

/* ---------- progress ---------- */
function complete(it, text) {
  if (it.done) return;
  it.done = true;
  mission.lastPos = it.pos.clone().setY(0);
  const left = mission.items.filter(x => !x.done).length;
  sfx.save();
  if (left > 0) {
    world.banner?.(`${text}<small>${left} to go</small>`, 2400);
    say(`${text}. ${left} to go!`);
  }
}

function freeCamp(it) {
  it.state = 'freed';
  it.cage.beam.visible = false;
  let joined = 0;
  for (const h of it.hostages) { if (recruit(h)) joined++; addPower(GAME.power.perPerson); }
  it.hostages = [];
  sparks(it.pos.clone().setY(2), 0xffe066, 24, 8, 0.5);
  rewardCrate(it.pos.clone().add(new V3(0, 0, CAGE + 1.5)));
  complete(it, joined ? `${joined} joined your army!` : 'People saved!');
}

/* Each finished goal leaves a reward; the level's new gun comes first. */
function rewardCrate(pos) {
  const unlockable = (mission.level.unlocks || []).filter(w => !loadout.owned.includes(w) && !world.pickups.some(p => p.weaponId === w));
  if (unlockable.length) dropLoot(pos, 'weapon', unlockable[0]);
  else dropLoot(pos, pick(['power', 'rate', 'auto', 'soldier1', 'armor']));
}

const UPDATE = {
  camp(it, dt) {
    updateHostages(it.hostages, dt);
    if (it.state === 'guarded') {
      it.cage.lamp.material.emissiveIntensity = 1.5 + Math.sin(world.time * 8);
      if (it.guards.every(g => !g.alive)) { it.state = 'open'; sfx.cage(); world.banner?.('Guards beaten!<small>Free the people!</small>', 2400); say('Free the people!'); }
    } else if (it.state === 'open') {
      it.openT = Math.min(1, it.openT + dt * 1.5);
      it.cage.sides[0].rotation.x = -it.openT * Math.PI / 2 * 0.95;
      if (flatDist(it.pos, P.pos) < CAGE + (P.kong ? 4 : 1.5) && !P.vehicle) freeCamp(it);
    }
  },
  nest(it) { if (!it.nest.alive) { rewardCrate(it.pos); complete(it, 'Nest destroyed!'); } },
  base(it) { if (!it.nest.alive) complete(it, 'Monster base destroyed!'); },
  roof(it, dt) {
    updateHostages([it.hostage], dt);
    if (!it.building.alive && it.pos.y > 0) {
      // the building fell down: the person climbs down to the street and waits there
      it.pos.y = 0; it.hostage.pos.y = 0; it.hostage.model.root.position.y = 0;
      it.beam.position.y = 0;
    }
    if (flatDist(it.pos, P.pos) < 3 && Math.abs(P.y - it.pos.y) < 1.5) {
      scene.remove(it.beam);
      if (recruit(it.hostage)) { it.hostage.model.root.position.y = 0; }
      addPower(GAME.power.perPerson);
      rewardCrate(it.building.alive ? new V3(it.building.ladder.x, 0, it.building.ladder.z + it.building.ladder.nz * 2) : it.pos.clone());
      complete(it, 'Rooftop rescue!');
    }
  },
  brute(it) { if (!it.enemy.alive) complete(it, 'Brute down!'); },
  part(it) {
    it.part.rotation.y += 0.05; it.part.position.y = 1.3 + Math.sin(world.time * 3) * 0.2;
    if (flatDist(it.pos, P.pos) < 2.5 && P.y < 2) {
      scene.remove(it.part);
      sparks(it.pos.clone().setY(1.3), 0xffb800, 18, 7, 0.5);
      addPower(10);
      complete(it, 'Weapon part!');
    }
  },
};

export function updateMissions(dt) {
  if (!mission) return;
  for (const it of mission.items) if (!it.done || it.kind === 'camp') UPDATE[it.kind](it, dt);
  // the brute army in tank missions is made of real monsters; they count as soon as they fall
  if (world.state === 'mission') {
    roamerT -= dt;
    const roaming = world.enemies.filter(e => e.alive && !e.camp).length;
    if (roamerT <= 0 && roaming < mission.level.roamers) { spawnRoamer(mission.level.monsters, mission.level.district); roamerT = rnd(4, 8); }
    // all goals done: the story takes over (informant, maybe a raid, then the HQ where the boss is)
    if (storyStage() === 'mission' && mission.items.every(it => it.done)) missionGoalsDone(mission.lastPos);
    if (reachedHq()) startBossIntro();
  }
}

function startBossIntro() {
  world.state = 'bossIntro'; introT = 0;
  P.inv = Math.max(P.inv, 7); // can't move during the boss's arrival, so nothing can hurt Joseph either
  world.banner?.('MISSION COMPLETE!<small>Get ready...</small>', 2400);
  say('Mission complete! Get ready!');
  sfx.save();
}

export function updateBossIntro(dt) {
  introT += dt;
  if (introT > 2.6 && introT - dt <= 2.6) bossArrives();
}

/* Where the arrow and the minimap point. Airstrike/tank missions first send you to get the vehicle. */
export function objective() {
  if (!mission) return null;
  const s = storyObjective();
  if (s) return s;
  if (!targetsRevealed() || storyStage() !== 'mission') return null;
  const type = mission.type;
  if ((type === 'airstrike' || type === 'tank') && P.vehicle?.type !== (type === 'airstrike' ? 'jet' : 'tank')) {
    const want = type === 'airstrike' ? 'jet' : 'tank';
    if (type === 'airstrike' || mission.items.filter(i => !i.done).length === mission.total) {
      let best = null, bd = Infinity;
      for (const v of world.vehicles) if (v.type === want && !v.dead) { const d = flatDist(v.pos, P.pos); if (d < bd) { bd = d; best = v.pos; } }
      if (best) return best;
    }
  }
  let best = null, bd = Infinity;
  for (const it of mission.items) {
    if (it.done) continue;
    const d = flatDist(it.pos, P.pos);
    if (d < bd) { bd = d; best = it.pos; }
  }
  return best;
}

export function missionTargets() {
  if (!mission) return [];
  const extra = storyObjective() ? [{ pos: storyObjective(), kind: 'story' }] : [];
  if (!targetsRevealed()) return extra;
  return mission.items.filter(it => !it.done).map(it => ({ pos: it.pos, kind: it.kind })).concat(extra);
}

export function missionStatus() {
  if (!mission) return { icon: '', done: 0, total: 0 };
  const st = storyStage();
  if (st && st !== 'mission') return { icon: '❗', done: 0, total: 0, text: storyGoalText() };
  return { icon: MISSION_TEXT[mission.type].icon, done: mission.items.filter(i => i.done).length, total: mission.total };
}
