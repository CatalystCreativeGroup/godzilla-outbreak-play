// Shared game state that every system reads. Systems own their own logic; this file only holds data and tiny helpers.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const angleTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const $ = id => document.getElementById(id);

export function turnToward(current, target, rate) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * Math.min(1, rate);
}

export const world = {
  state: 'title',      // title | intro | mission | bossIntro | boss | win | ending
  time: 0,
  cityIndex: 0,
  city: null,          // settings for the current city
  enemies: [],         // monsters (see enemies.js)
  allies: [],          // Joseph's army (see allies.js)
  camps: [],           // hostage camps (see missions.js)
  pickups: [],         // loot on the ground (see loot.js)
  campsFreed: 0,
  view: 'first',       // first | outside (camera), switched with the VIEW button
  aimTarget: null,     // what the crosshair is on (for the red crosshair)
};

/* The player. */
export const P = {
  pos: new V3(0, 0, 14), y: 0, vy: 0, face: Math.PI,
  hearts: 6, armor: 0, inv: 0, ko: 0,
  power: 0, kong: false, kongT: 0, morphT: 0,
  fireCd: 0, aimT: 0, punchCd: 0, punchT: 0, roarCd: 0, roarT: 0, readyToldYou: false,
  moving: 0,
  yaw: Math.PI, pitch: 0, firing: false, recoil: 0,
};

/* What Joseph owns. Saved between visits. */
export const loadout = {
  owned: ['blaster'],
  current: 'blaster',
  levels: { blaster: 1 },
  rateLevel: 1,
  kongPowers: [],
  citiesBeaten: [],
};

export function playing() {
  return world.state === 'mission' || world.state === 'boss';
}
