// Plays each level's story (story-script.js): radio briefing → find the witness (❗) → mission → the informant →
// sometimes a raid on a fake hideout with a clue inside → the monster HEADQUARTERS (boss) → the ending.
import * as THREE from 'three';
import { scene } from './engine.js';
import { spawnModel, disposeModel, inView } from './models.js';
import { STORY, CAST } from './story-script.js';
import { beacon } from './camps.js';
import { spawnNest } from './nests.js';
import { spawnEnemy } from './enemies.js';
import { wordTexture } from './textures.js';
import { openSpotNear, nearestRoadPoint, DISTRICTS } from './map.js';
import { sfx, say } from './audio.js';
import { sparks } from './fx.js';
import { V3, rnd, pick, world, P, $, flatDist, angleTo, turnToward } from './world.js';

let story = null; // { script, level, stage, npc, raid, clue, hq, ... }
const queue = [];   // dialogs waiting to be shown

/* ---------- dialog card (pauses the game, reads the words out loud) ---------- */
function openNext() {
  if (!queue.length || !$('dialog').hidden) return;
  const { who, text, then } = queue.shift();
  const c = CAST[who] || { name: who, face: '💬' };
  world.paused = true;
  $('dialog-face').textContent = c.face;
  $('dialog-name').textContent = c.name;
  $('dialog-text').textContent = text;
  $('dialog').hidden = false;
  say(text);
  sfx.pickup();
  const ok = $('dialog-ok');
  const close = () => {
    ok.removeEventListener('click', close);
    $('dialog').hidden = true;
    world.paused = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    then?.();
    openNext();
  };
  ok.addEventListener('click', close);
}
export function dialog(who, text, then) {
  queue.push({ who, text, then });
  openNext();
}

/* ---------- people (and clue notes) you walk up to ---------- */
const markGeo = new THREE.OctahedronGeometry(0.5);
function spawnNpc(pos, who) {
  const model = spawnModel('person');
  model.root.position.copy(pos);
  model.anim.play('wave', { speed: 0.8 });
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: wordTexture('❗', '#ffd23f'), transparent: true, depthWrite: false, toneMapped: false }));
  mark.scale.setScalar(2.4); mark.position.y = 3.8;
  model.root.add(mark);
  scene.add(model.root);
  return { model, pos: pos.clone(), who, mark, beam: beacon(pos, 0x5ac8ff) };
}
function spawnClue(pos) {
  const m = new THREE.Mesh(markGeo, new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd23f, emissiveIntensity: 1.5 }));
  m.position.copy(pos).setY(1.4);
  scene.add(m);
  return { mesh: m, pos: pos.clone(), beam: beacon(pos, 0xffd23f) };
}
function remove(thing) {
  if (!thing) return;
  if (thing.model) disposeModel(thing.model);
  if (thing.mesh) scene.remove(thing.mesh);
  if (thing.beam) scene.remove(thing.beam);
}

export function clearStory() {
  if (story) { remove(story.npc); remove(story.clue); if (story.hqBeam) scene.remove(story.hqBeam); if (story.raidBeam) scene.remove(story.raidBeam); }
  queue.length = 0;
  $('dialog').hidden = true;
  world.paused = false;
  story = null;
}

/* Level start: the radio briefing, then go find the witness. */
export function startStory(levelIndex, level, onReveal) {
  clearStory();
  const script = STORY[levelIndex];
  const a = rnd(0, Math.PI * 2);
  const spot = nearestRoadPoint(-4 + Math.cos(a) * 40, 12 + Math.sin(a) * 40);
  story = { script, level, stage: 'witness', npc: spawnNpc(spot, script.witness[0]), onReveal };
  dialog(script.briefing[0], script.briefing[1] + ' Look for the ❗ on your map.');
}

/* Mission targets stay secret until the witness tells you about them. */
export const targetsRevealed = () => !story || story.stage !== 'witness';

/* missions.js calls this when every goal is done. */
export function missionGoalsDone(lastPos) {
  if (!story || story.stage !== 'mission') return;
  const spot = openSpotNear(lastPos.x + rnd(-6, 6), lastPos.z + rnd(-6, 6), 8, 2);
  story.npc = spawnNpc(spot, story.script.informant[0]);
  story.stage = 'informant';
  world.banner?.('GREAT JOB!<small>Someone wants to talk to you. Find the ❗</small>', 3000);
  say('Great job! Someone wants to talk to you!');
}

/* ---------- talking ---------- */
export function npcNear() {
  if (!story?.npc || P.vehicle || P.kong || P.y > 1) return null;
  return flatDist(story.npc.pos, P.pos) < 4 ? story.npc : null;
}

export function talk() {
  const npc = npcNear();
  if (!npc) return;
  const s = story.script;
  if (story.stage === 'witness') {
    dialog(s.witness[0], s.witness[1], () => {
      sparks(npc.pos.clone().setY(2), 0x5ac8ff, 14, 6, 0.4);
      remove(npc); story.npc = null;
      story.stage = 'mission';
      story.onReveal?.();
    });
  } else if (story.stage === 'informant') {
    dialog(s.informant[0], s.informant[1], () => {
      remove(npc); story.npc = null;
      if (s.raid) openRaid(); else openHq();
    });
  }
}

/* ---------- side mission: raid a hideout (it's a fake, but there's a clue) ---------- */
function openRaid() {
  const r = story.script.raid, d = DISTRICTS[r.district];
  const pos = openSpotNear(rnd(d.x0 + 30, d.x1 - 30), rnd(d.z0 + 30, d.z1 - 30), 30, 6);
  const guards = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    guards.push(spawnEnemy(pick(story.level.monsters), openSpotNear(pos.x + Math.cos(a) * 9, pos.z + Math.sin(a) * 9, 3, 1), pos));
  }
  const nest = spawnNest(pos.clone().add(new V3(5, 0, 5)), { types: ['lizard'], spawnEvery: 9 });
  story.raid = { pos, guards, nest };
  story.raidBeam = beacon(pos, 0xff9a3d);
  story.stage = 'raid';
  world.banner?.(`RAID ${r.place.toUpperCase()}!<small>Beat the guards and search for clues</small>`, 3200);
  say(`Raid ${r.place}! Beat the guards and search for clues!`);
}

function updateRaid() {
  const R = story.raid;
  if (story.stage === 'raid' && R.guards.every(g => !g.alive) && !R.nest.alive) {
    scene.remove(story.raidBeam); story.raidBeam = null;
    story.clue = spawnClue(R.pos);
    story.stage = 'clue';
    world.banner?.('HIDEOUT CLEARED!<small>Grab the clue</small>', 2400);
  }
  if (story.stage === 'clue' && flatDist(story.clue.pos, P.pos) < 3 && !P.vehicle) {
    remove(story.clue); story.clue = null;
    sparks(R.pos.clone().setY(1.5), 0xffd23f, 16, 6, 0.4);
    const c = story.script.raid.clue;
    dialog(c[0], c[1], openHq);
    story.stage = 'reading';
  }
}

/* ---------- the monster headquarters ---------- */
function openHq() {
  const level = story.level;
  const d = level.mission.type === 'airstrike' ? DISTRICTS.volcano : DISTRICTS[level.district];
  const pos = openSpotNear(d.arena[0], d.arena[1], 20, 8);
  const hq = spawnNest(pos, { big: true });
  hq.isHq = true;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    spawnEnemy(pick(level.monsters.filter(t => t !== 'bomber')) || 'lizard', openSpotNear(pos.x + Math.cos(a) * 14, pos.z + Math.sin(a) * 14, 4, 1), pos);
  }
  story.hq = pos;
  story.hqBeam = beacon(pos, 0xff3a2a);
  story.stage = 'hq';
  world.banner?.(`MONSTER HEADQUARTERS: ${story.script.hq[0].toUpperCase()}<small>Follow the arrow to the red light</small>`, 3200);
  say(`To the monster headquarters at ${story.script.hq[0]}!`);
}

/* True once Joseph reaches the HQ: time for the boss. */
export function reachedHq() {
  if (!story || story.stage !== 'hq') return false;
  if (flatDist(story.hq, P.pos) >= (P.vehicle?.type === 'jet' ? 60 : 32)) return false;
  story.stage = 'boss';
  scene.remove(story.hqBeam);
  world.banner?.(story.script.hq[1], 2600);
  return true;
}

/* The story's ending line for the win screen. */
export const endingLine = () => story?.script.ending || null;

/* Where the arrow should point during the story parts (null = the mission decides). */
export function storyObjective() {
  if (!story) return null;
  if (story.npc) return story.npc.pos;
  if (story.stage === 'raid') return story.raid.pos;
  if (story.stage === 'clue') return story.clue.pos;
  if (story.stage === 'hq') return story.hq;
  return null;
}
export const storyStage = () => story?.stage || null;
export const hqSpot = () => story?.hq || null;
export const storyGoalText = () => {
  if (!story) return '';
  return { witness: 'Find the ❗', informant: 'Talk to the ❗', raid: `Raid ${story.script.raid?.place || ''}`, clue: 'Grab the clue', reading: 'Read the clue', hq: 'Go to the HQ', boss: 'Beat the boss!' }[story.stage] || '';
};

export function updateStory(dt) {
  if (!story) return;
  if (story.stage === 'raid' || story.stage === 'clue') updateRaid();
  if (story.clue) { story.clue.mesh.rotation.y += dt * 2; story.clue.mesh.position.y = 1.4 + Math.sin(world.time * 3) * 0.2; }
  const n = story.npc;
  if (!n) return;
  n.mark.position.y = 3.8 + Math.sin(world.time * 4) * 0.2;
  n.model.root.rotation.y = turnToward(n.model.root.rotation.y, angleTo(n.pos, P.pos), dt * 3);
  n.model.root.visible = inView(n.pos, 3, 200);
  if (n.model.root.visible) n.model.anim.update(dt);
}
