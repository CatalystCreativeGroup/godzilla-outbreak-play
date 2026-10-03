// Loot that monsters drop: new guns, gun power, fire rate, armor and hearts. Walk over it to grab it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { scene } from './engine.js';
import { GAME, WEAPONS, MAX_WEAPON_LEVEL, MAX_RATE_LEVEL } from './settings.js';
import { sfx, say } from './audio.js';
import { sparks, popWord } from './fx.js';
import { V3, rnd, pick, world, P, loadout, flatDist } from './world.js';
import { makeGun } from './weapons.js';

const KINDS = {
  weapon: { color: 0xffc23d, label: 'NEW GUN!' },
  power:  { color: 0xff5a3d, label: 'POWER UP!' },
  rate:   { color: 0x5ad1ff, label: 'FASTER!' },
  armor:  { color: 0x5a8cff, label: 'ARMOR!' },
  heart:  { color: 0xff4d6d, label: '+HEART' },
};

const crateGeo = new RoundedBoxGeometry(1.1, 0.8, 0.8, 2, 0.08);
const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 14, 12, 1, true);
beamGeo.translate(0, 7, 0);
const iconCache = {};
function iconTexture(kind, weaponId) {
  const key = kind + (weaponId || '');
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const emoji = kind === 'weapon' ? WEAPONS[weaponId].icon : { power: '💪', rate: '⏩', armor: '🛡️', heart: '❤️' }[kind];
  g.font = '92px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return (iconCache[key] = t);
}

export function dropLoot(pos, forcedKind = null, forcedWeapon = null) {
  let kind = forcedKind;
  if (!kind) {
    const roll = Math.random();
    kind = roll < 0.12 ? 'weapon' : roll < 0.38 ? 'power' : roll < 0.58 ? 'rate' : roll < 0.8 ? 'armor' : 'heart';
  }
  let weaponId = forcedWeapon;
  if (kind === 'weapon' && !weaponId) {
    const unlockable = (world.city?.unlocks || []).filter(w => !loadout.owned.includes(w));
    if (!unlockable.length) kind = 'power';
    else weaponId = pick(unlockable);
  }
  const k = KINDS[kind];
  const g = new THREE.Group();
  const crate = new THREE.Mesh(crateGeo, new THREE.MeshStandardMaterial({ color: 0x3e4a30, roughness: 0.6, metalness: 0.3, emissive: k.color, emissiveIntensity: 0.15 }));
  crate.position.y = 0.5; crate.castShadow = true;
  g.add(crate);
  if (kind === 'weapon') { const gun = makeGun(weaponId, 1.6); gun.position.set(0, 1.25, 0); gun.rotation.y = Math.PI / 2; g.add(gun); }
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind, weaponId), transparent: true, depthWrite: false }));
  icon.position.y = 2.3; icon.scale.setScalar(1.4);
  g.add(icon);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: k.color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  g.add(beam);
  g.position.set(pos.x + rnd(-0.6, 0.6), 0, pos.z + rnd(-0.6, 0.6));
  scene.add(g);
  world.pickups.push({ g, crate, icon, kind, weaponId, pos: g.position, age: 0, life: kind === 'weapon' ? 9999 : 40 });
}

export function maybeDrop(pos, chanceMul = 1) {
  if (Math.random() < GAME.loot.dropChance * chanceMul) dropLoot(pos);
}

function grab(p) {
  const k = KINDS[p.kind];
  let text = k.label;
  if (p.kind === 'weapon') {
    const id = p.weaponId;
    if (!loadout.owned.includes(id)) {
      loadout.owned = [...loadout.owned, id];
      loadout.levels = { ...loadout.levels, [id]: 1 };
      loadout.current = id;
      text = WEAPONS[id].name + '!';
      say('New gun! ' + WEAPONS[id].name.toLowerCase());
      sfx.unlock();
    } else {
      loadout.levels = { ...loadout.levels, [id]: Math.min(MAX_WEAPON_LEVEL, (loadout.levels[id] || 1) + 1) };
      sfx.pickup();
    }
    world.onWeaponChange?.();
  } else if (p.kind === 'power') {
    const id = loadout.current;
    const lvl = loadout.levels[id] || 1;
    if (lvl >= MAX_WEAPON_LEVEL) { P.power = Math.min(100, P.power + 10); text = 'MAX POWER!'; }
    loadout.levels = { ...loadout.levels, [id]: Math.min(MAX_WEAPON_LEVEL, lvl + 1) };
    sfx.pickup();
    world.onWeaponChange?.();
  } else if (p.kind === 'rate') {
    loadout.rateLevel = Math.min(MAX_RATE_LEVEL, loadout.rateLevel + 1);
    sfx.pickup();
    world.onWeaponChange?.();
  } else if (p.kind === 'armor') {
    P.armor = Math.min(GAME.hero.maxArmor, P.armor + 2);
    sfx.armor();
  } else if (p.kind === 'heart') {
    P.hearts = Math.min(GAME.hero.hearts, P.hearts + 1);
    sfx.pickup();
  }
  sparks(p.pos.clone().setY(1), k.color, 14, 7, 0.5);
  popWord(text, new V3(p.pos.x, 3.5, p.pos.z), '#' + k.color.toString(16).padStart(6, '0'), 3.4);
}

// Shared crate/beam geometry and icon textures are kept; only this crate's own materials and gun are freed.
function removePickup(p) {
  scene.remove(p.g);
  p.g.traverse(o => {
    if (o.userData.sharedGeometry) return;
    if (o.material && !o.material.userData.shared) o.material.dispose();
    if (o.geometry && !o.parent?.userData.sharedGeometry && o.geometry !== crateGeo && o.geometry !== beamGeo) o.geometry.dispose();
  });
}

export function updateLoot(dt) {
  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const p = world.pickups[i];
    p.age += dt; p.life -= dt;
    p.crate.rotation.y += dt * 1.5;
    p.icon.position.y = 2.3 + Math.sin(p.age * 3) * 0.2;
    const reach = P.kong ? 6 : 2.2;
    const d = flatDist(p.pos, P.pos);
    // gentle magnet so little thumbs don't have to be exact
    if (d < 5 && !P.kong) p.pos.lerp(new V3(P.pos.x, 0, P.pos.z), Math.min(1, dt * 3));
    if (d < reach && P.ko <= 0) { grab(p); removePickup(p); world.pickups.splice(i, 1); continue; }
    if (p.life <= 0) { removePickup(p); world.pickups.splice(i, 1); continue; }
    if (p.life < 5) p.g.visible = Math.floor(p.life * 6) % 2 === 0;
  }
}

export function clearLoot() {
  for (const p of world.pickups) removePickup(p);
  world.pickups = [];
}
