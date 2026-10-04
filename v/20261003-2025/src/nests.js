// Monster nests (spawn monsters until destroyed) and big monster bases (airstrike targets).
import * as THREE from 'three';
import { scene } from './engine.js';
import { spawnEnemy } from './enemies.js';
import { dropLoot } from './loot.js';
import { sfx, say } from './audio.js';
import { fireball, shake, burstDebris, smoke, popWord, sparks } from './fx.js';
import { V3, rnd, pick, world, P, flatDist } from './world.js';
import { GAME } from './settings.js';

const shellMat = new THREE.MeshStandardMaterial({ color: 0x2a1530, roughness: 0.55, metalness: 0.1 });
const veinMat = new THREE.MeshStandardMaterial({ color: 0x220022, emissive: 0xc040ff, emissiveIntensity: 1.6, roughness: 0.4 });
const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3b1f45, roughness: 0.5 });

function buildNest(big) {
  const g = new THREE.Group();
  const s = big ? 2.6 : 1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3 * s, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
  dome.scale.y = 0.75; g.add(dome);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1.1 * s, 16, 12), veinMat);
  core.position.y = 1.6 * s; g.add(core);
  for (let i = 0; i < (big ? 14 : 7); i++) {
    const a = (i / (big ? 14 : 7)) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.45 * s, 3.2 * s, 7), spikeMat);
    spike.position.set(Math.cos(a) * 2.4 * s, 1.2 * s, Math.sin(a) * 2.4 * s);
    spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    g.add(spike);
  }
  for (let i = 0; i < 4; i++) {
    const vein = new THREE.Mesh(new THREE.TorusGeometry(2.2 * s, 0.09 * s, 6, 24, Math.PI), veinMat);
    vein.rotation.set(Math.PI / 2, 0, i * Math.PI / 2); vein.position.y = 0.2; g.add(vein);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { g, core };
}

/* Create a nest (small, spawns monsters) or a base (big, for airstrikes). */
export function spawnNest(pos, { big = false, types = ['lizard'], spawnEvery = 7 } = {}) {
  const { g, core } = buildNest(big);
  g.position.copy(pos);
  scene.add(g);
  const hp = Math.round((big ? 160 : 40) * GAME.difficulty * (1 + world.levelIndex * 0.05));
  const n = {
    g, core, pos: pos.clone(), big, hp, maxHp: hp, alive: true, isNest: true, radius: big ? 7 : 3, aimY: big ? 3 : 1.4,
    types, spawnEvery, spawnT: rnd(1, spawnEvery), flash: 0,
    hit: (dmg, opts = {}) => hitNest(n, dmg, opts),
  };
  world.nests.push(n);
  return n;
}

function hitNest(n, dmg, opts) {
  if (!n.alive) return;
  // big bases are tough: bombs, rockets and tank shells do full damage, bullets only a little
  const mul = n.big && !opts.heavy ? 0.25 : 1;
  n.hp -= dmg * mul;
  n.flash = 0.08;
  if (n.hp <= 0) destroyNest(n);
}

function destroyNest(n) {
  n.alive = false;
  fireball(n.pos.clone().setY(2), n.big ? 14 : 6);
  burstDebris(n.pos.clone().setY(1.5), 0x3b1f45, n.big ? 40 : 20, n.big ? 16 : 10, n.big ? 1.2 : 0.6);
  smoke(n.pos.clone().setY(1), n.big ? 16 : 8, n.big ? 7 : 3, 0x3a3038, n.big ? 8 : 3, 3);
  sfx.boom(); shake(n.big ? 1.2 : 0.6);
  popWord(n.big ? 'BASE DESTROYED!' : 'NEST DESTROYED!', n.pos.clone().setY(n.big ? 12 : 6), '#ff9a3d', n.big ? 7 : 4);
  dropLoot(n.pos.clone().add(new V3(rnd(-2, 2), 0, rnd(-2, 2))), pick(['soldier2', 'auto', 'power', 'armor']));
  if (n.big) dropLoot(n.pos.clone().add(new V3(4, 0, 0)), 'soldier5');
  setTimeout(() => scene.remove(n.g), 600);
  world.onNestDestroyed?.(n);
}

export function updateNests(dt) {
  for (const n of world.nests) {
    if (!n.alive) continue;
    n.flash -= dt;
    n.core.material = n.flash > 0 ? whiteMat : veinMat;
    n.core.scale.setScalar(1 + Math.sin(world.time * 3 + n.pos.x) * 0.08);
    if (Math.random() < 0.05) sparks(n.pos.clone().setY(n.aimY + 1), 0xc040ff, 2, 3, 0.4);
    // only spawn when Joseph is near, and don't flood the map
    const d = flatDist(n.pos, P.pos);
    if (d > 80 || n.big) continue;
    n.spawnT -= dt;
    const nearby = world.enemies.filter(e => e.alive && e.nest === n).length;
    if (n.spawnT <= 0 && nearby < 4) {
      n.spawnT = n.spawnEvery;
      const a = rnd(0, Math.PI * 2);
      const e = spawnEnemy(pick(n.types), new V3(n.pos.x + Math.cos(a) * 4.5, 0, n.pos.z + Math.sin(a) * 4.5), n.pos);
      e.nest = n;
      smoke(e.pos.clone().setY(0.5), 3, 1.4, 0x5a3a60, 0.8, 1);
    }
  }
}
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });

export function clearNests() {
  for (const n of world.nests) scene.remove(n.g);
  world.nests = [];
}

export const nestsLeft = () => world.nests.filter(n => n.alive).length;
export { say };
