// FREE PLAY: no missions. Everything is unlocked; monsters keep coming, monster bases in every part of the city
// fight back, and Godzilla bosses roam the map one after another for Joseph to hunt.
import { WEAPONS } from './settings.js';
import { LEVELS } from './levels.js';
import { DISTRICTS, openSpotNear } from './map.js';
import { spawnEnemy, spawnRoamer } from './enemies.js';
import { spawnNest } from './nests.js';
import { setupBoss, bossArrives } from './boss.js';
import { spawnSoldiers } from './allies.js';
import { say } from './audio.js';
import { V3, rnd, pick, world, P, loadout, flatDist } from './world.js';

const ALL_MONSTERS = ['lizard', 'spitter', 'brute', 'jumper', 'bomber'];
const BOSSES = LEVELS.map(l => l.boss); // every Godzilla from the story, in a shuffled order
let saved = null, bossQueue = [], nextBossT = 0, rebuildT = 0, roamT = 0;
export const freeStats = { kills: 0, bosses: 0, bases: 0 };

/* Free play gets every gun at full power; the story keeps its own progress. */
function unlockEverything() {
  saved = JSON.parse(JSON.stringify(loadout));
  const all = Object.keys(WEAPONS);
  loadout.owned = all;
  loadout.levels = Object.fromEntries(all.map(w => [w, 4]));
  loadout.fullAuto = Object.fromEntries(all.map(w => [w, true]));
  loadout.rateLevel = 3;
  loadout.kongPowers = ['GROUND POUND', 'KONG THROW', 'WATER ARMOR', 'FIRE FISTS'];
  loadout.current = 'rifle';
}
export function restoreStoryLoadout() {
  if (!saved) return;
  Object.assign(loadout, saved);
  saved = null;
}

function baseSpots() {
  const spots = [];
  for (const [id, d] of Object.entries(DISTRICTS)) {
    for (let i = 0; i < 2; i++) spots.push({ id, pos: openSpotNear(rnd(d.x0 + 25, d.x1 - 25), rnd(d.z0 + 25, d.z1 - 25), 25, 8) });
  }
  return spots;
}

function buildBase(spot) {
  // a monster base: a nest that keeps making monsters, guarded by a pack
  spawnNest(spot.pos, { types: ALL_MONSTERS, spawnEvery: 6 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spawnEnemy(pick(ALL_MONSTERS.filter(t => t !== 'bomber')), openSpotNear(spot.pos.x + Math.cos(a) * 10, spot.pos.z + Math.sin(a) * 10, 3, 1), spot.pos);
  }
}

function sendNextBoss() {
  if (!bossQueue.length) bossQueue = BOSSES.slice().sort(() => Math.random() - 0.5);
  const cfg = bossQueue.shift();
  const ids = Object.keys(DISTRICTS);
  const where = pick(ids.filter(id => flatDist(new V3(DISTRICTS[id].arena[0], 0, DISTRICTS[id].arena[1]), P.pos) > 80)) || pick(ids);
  const d = DISTRICTS[where];
  setupBoss(cfg);
  bossArrives(openSpotNear(d.arena[0], d.arena[1], 20, 8));
  world.banner?.(`${cfg.name} SPOTTED!<small>${d.name}. Follow the arrow!</small>`, 3200);
  say(`${cfg.name.toLowerCase()} spotted in ${d.name.toLowerCase()}!`);
}

export function startFreePlay() {
  world.mode = 'free';
  unlockEverything();
  Object.assign(freeStats, { kills: 0, bosses: 0, bases: 0 });
  for (const s of baseSpots()) buildBase(s);
  if (world.allies.length < 6) spawnSoldiers(6 - world.allies.length);
  bossQueue = [];
  nextBossT = 20;
  rebuildT = 60;
  roamT = 0;
  world.state = 'boss'; // the whole map is a battle
}

export function freeBossDefeated() {
  freeStats.bosses++;
  world.banner?.(`BOSS DOWN! (${freeStats.bosses})<small>Another one is coming...</small>`, 2600);
  nextBossT = 25;
}

export function updateFreePlay(dt) {
  // a new Godzilla shows up somewhere after the last one falls
  if (!world.bossTarget && nextBossT > 0 && (nextBossT -= dt) <= 0) sendNextBoss();
  // keep plenty of monsters around Joseph, more the longer he plays
  roamT -= dt;
  const near = world.enemies.filter(e => e.alive && flatDist(e.pos, P.pos) < 90).length;
  const want = Math.min(26, 10 + Math.floor(freeStats.kills / 15));
  if (roamT <= 0 && near < want) { spawnRoamer(ALL_MONSTERS); roamT = rnd(0.8, 2); }
  // destroyed bases get rebuilt somewhere else after a while
  if ((rebuildT -= dt) <= 0) {
    rebuildT = 60;
    const alive = world.nests.filter(n => n.alive).length;
    if (alive < 10) buildBase(pick(baseSpots()));
  }
}
