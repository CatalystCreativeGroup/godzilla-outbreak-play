// The city: textured ground, roads, sidewalks and buildings that giants can smash. Rebuilt for each city theme.
import * as THREE from 'three';
import { scene, ENV } from './engine.js';
import { tex, texRepeat, laneTex } from './textures.js';
import { burstDebris, smoke, shake } from './fx.js';
import { sfx } from './audio.js';
import { V3, rnd, clamp, P, world } from './world.js';
import { addProps, updateProps } from './city-props.js';

export const CITY = 100, ROAD_GAP = 24, ROAD_W = 8, PARK = 20, EDGE = 98;

export const cityGroup = new THREE.Group();
scene.add(cityGroup);

export let buildings = [];
let campSites = [];

/* Facade styles: texture, how many world units one texture tile covers, and surface feel. */
const FACADES = {
  glass:    { tex: 'facade_glass',    tile: 12, roughness: 0.18, metalness: 0.55, debris: 0x8fa3b5 },
  concrete: { tex: 'facade_concrete', tile: 12, roughness: 0.85, metalness: 0.0,  debris: 0xc9bfae },
  brick:    { tex: 'facade_brick',    tile: 10, roughness: 0.9,  metalness: 0.0,  debris: 0x9a5444 },
};
const roofMat = () => new THREE.MeshStandardMaterial({ map: tex('roof'), roughness: 0.95, transparent: true });

function facadeFor(fromCenter, h, theme) {
  if (theme === 'harbor' && Math.random() < 0.5) return 'brick';
  if (h > 22 || (fromCenter < 50 && Math.random() < 0.6)) return 'glass';
  return Math.random() < 0.5 ? 'concrete' : 'brick';
}

function addBuilding(cx, cz, w, d, h, style) {
  const f = FACADES[style];
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, h / 2, 0);
  // Scale UVs so windows stay the same size on every building. Faces: +x, -x, +y, -y, +z, -z.
  const uv = geo.attributes.uv;
  const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) for (let v = 0; v < 4; v++) {
    const i = face * 4 + v;
    const div = face === 2 || face === 3 ? 6 : f.tile;
    uv.setXY(i, uv.getX(i) * faces[face][0] / div, uv.getY(i) * faces[face][1] / div);
  }
  const side = new THREE.MeshStandardMaterial({ map: tex(f.tex), roughness: f.roughness, metalness: f.metalness, transparent: true });
  const roof = roofMat();
  const m = new THREE.Mesh(geo, [side, side, roof, roof, side, side]);
  m.position.set(cx, 0, cz);
  m.castShadow = m.receiveShadow = true;
  // a concrete cap on the roof edge, sometimes an AC unit
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.6, d + 0.4), new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9, transparent: true }));
  cap.position.y = h + 0.3; cap.castShadow = true; m.add(cap);
  if (Math.random() < 0.55) {
    const ac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 1.4, d * 0.25), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.5, metalness: 0.6, transparent: true }));
    ac.position.set(rnd(-w / 5, w / 5), h + 1.3, rnd(-d / 5, d / 5)); ac.castShadow = true; m.add(ac);
  }
  cityGroup.add(m);
  const mats = [side, roof, cap.material, ...(m.children[1] ? [m.children[1].material] : [])];
  buildings.push({ m, mats, debris: f.debris, cx, cz, hw: w / 2, hd: d / 2, h, alive: true, crumble: -1, fade: 1 });
}

function buildGround(theme) {
  const outskirts = theme === 'volcano' ? 'basalt' : 'grass';
  const far = new THREE.Mesh(new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ map: texRepeat(outskirts, 110, 110), roughness: 1, color: theme === 'storm' ? 0x8a8f86 : 0xffffff }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02; far.receiveShadow = true;
  cityGroup.add(far);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(CITY * 2 + 8, CITY * 2 + 8),
    new THREE.MeshStandardMaterial({ map: texRepeat('asphalt', 26, 26), roughness: 0.92, color: theme === 'volcano' ? 0x8a807a : 0xffffff }));
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true;
  cityGroup.add(road);

  // sidewalk slab under every block (one instanced mesh)
  const blocks = [];
  for (let bx = -96; bx < 96; bx += ROAD_GAP) for (let bz = -96; bz < 96; bz += ROAD_GAP) blocks.push([bx + 12, bz + 12]);
  const walkGeo = new THREE.BoxGeometry(16, 0.25, 16);
  const walk = new THREE.InstancedMesh(walkGeo, new THREE.MeshStandardMaterial({ map: texRepeat('sidewalk', 4, 4), roughness: 0.95 }), blocks.length);
  const mtx = new THREE.Matrix4();
  blocks.forEach(([x, z], i) => walk.setMatrixAt(i, mtx.makeTranslation(x, 0.125, z)));
  walk.receiveShadow = true;
  cityGroup.add(walk);

  // painted center lines
  const laneMat = new THREE.MeshStandardMaterial({ color: 0xe8d36a, map: laneTex, alphaMap: laneTex, transparent: true, roughness: 0.8, depthWrite: false });
  for (let r = -96; r <= 96; r += ROAD_GAP) {
    for (const vertical of [true, false]) {
      const t = laneTex.clone(); t.needsUpdate = true; t.repeat.set(1, 60);
      const mat = laneMat.clone(); mat.map = t; mat.alphaMap = t;
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.3, CITY * 2), mat);
      line.rotation.x = -Math.PI / 2;
      if (!vertical) line.rotation.z = Math.PI / 2;
      line.position.set(vertical ? r : 0, 0.02, vertical ? 0 : r);
      cityGroup.add(line);
    }
  }

  // the park in the middle: the boss arena
  const parkTex = theme === 'volcano' ? 'basalt' : 'grass';
  const park = new THREE.Mesh(new THREE.BoxGeometry(PARK * 2 - 4, 0.3, PARK * 2 - 4),
    new THREE.MeshStandardMaterial({ map: texRepeat(parkTex, 6, 6), roughness: 1 }));
  park.position.y = 0.15; park.receiveShadow = true;
  cityGroup.add(park);
}

/* Pick block centres for the hostage camps: spread out, away from the start and the park. */
function chooseCampSites(n) {
  const options = [];
  for (let bx = -96; bx < 96; bx += ROAD_GAP) for (let bz = -96; bz < 96; bz += ROAD_GAP) {
    const c = new V3(bx + 12, 0, bz + 12), d = Math.hypot(c.x, c.z);
    if (d > 30 && d < 92) options.push(c);
  }
  const sites = [];
  const start = new V3(0, 0, 14);
  while (sites.length < n && options.length) {
    let best = null, bestScore = -Infinity;
    for (const o of options) {
      const near = Math.min(...sites.map(s => s.distanceTo(o)), o.distanceTo(start) * 1.2);
      const score = near + rnd(0, 12);
      if (score > bestScore) { bestScore = score; best = o; }
    }
    sites.push(best);
    options.splice(options.indexOf(best), 1);
  }
  return sites;
}

export function buildCity(theme, campCount) {
  for (const o of [...cityGroup.children]) {
    cityGroup.remove(o);
    o.traverse(c => { if (c.geometry) c.geometry.dispose(); });
  }
  buildings = [];
  campSites = chooseCampSites(campCount);
  buildGround(theme);
  const isCamp = (x, z) => campSites.some(s => Math.abs(s.x - x) < 9 && Math.abs(s.z - z) < 9);
  const heightBoost = theme === 'golden' || theme === 'storm' ? 1.35 : 1;
  for (let bx = -96; bx < 96; bx += ROAD_GAP) for (let bz = -96; bz < 96; bz += ROAD_GAP) {
    const x0 = bx + 4, z0 = bz + 4;
    if (x0 >= -PARK && x0 + 16 <= PARK && z0 >= -PARK && z0 + 16 <= PARK) continue;
    if (isCamp(x0 + 8, z0 + 8)) continue;
    const fromCenter = Math.hypot(x0 + 8, z0 + 8);
    const tall = () => (rnd(7, 13) + Math.max(0, 75 - fromCenter) * rnd(0.12, 0.34)) * heightBoost;
    const split = Math.random();
    const add = (cx, cz, w, d) => { const h = tall(); addBuilding(cx, cz, w, d, h, facadeFor(fromCenter, h, theme)); };
    if (split < 0.3) add(x0 + 8, z0 + 8, 14, 14);
    else if (split < 0.7) {
      if (Math.random() < 0.5) { add(x0 + 4, z0 + 8, 6.5, 14); add(x0 + 12, z0 + 8, 6.5, 14); }
      else { add(x0 + 8, z0 + 4, 14, 6.5); add(x0 + 8, z0 + 12, 14, 6.5); }
    } else for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) add(x0 + 4 + i * 8, z0 + 4 + j * 8, 6.5, 6.5);
  }
  addProps(cityGroup, theme, campSites);
  cityGroup.traverse(o => {
    for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial) m.envMapIntensity = m.metalness > 0.5 ? ENV.glass : ENV.city;
  });
  return campSites;
}

/* Push a circle out of buildings. */
export function collide(pos, r) {
  for (const b of buildings) {
    if (!b.alive) continue;
    const nx = clamp(pos.x, b.cx - b.hw, b.cx + b.hw), nz = clamp(pos.z, b.cz - b.hd, b.cz + b.hd);
    const dx = pos.x - nx, dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + dx / d * r; pos.z = nz + dz / d * r;
    } else {
      const ox = b.hw - Math.abs(pos.x - b.cx), oz = b.hd - Math.abs(pos.z - b.cz);
      if (ox < oz) pos.x = b.cx + Math.sign(pos.x - b.cx || 1) * (b.hw + r);
      else pos.z = b.cz + Math.sign(pos.z - b.cz || 1) * (b.hd + r);
    }
  }
  pos.x = clamp(pos.x, -EDGE, EDGE); pos.z = clamp(pos.z, -EDGE, EDGE);
}

/* Is there a building between two points? (used so monsters don't shoot through walls) */
export function blocked(a, b) {
  const steps = Math.ceil(a.distanceTo(b) / 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const bd of buildings) if (bd.alive && Math.abs(x - bd.cx) < bd.hw && Math.abs(z - bd.cz) < bd.hd) return true;
  }
  return false;
}

/* Giants smash buildings they touch. */
export function smashNear(pos, r) {
  let n = 0;
  for (const b of buildings) {
    if (!b.alive) continue;
    const nx = clamp(pos.x, b.cx - b.hw, b.cx + b.hw), nz = clamp(pos.z, b.cz - b.hd, b.cz + b.hd);
    if ((pos.x - nx) ** 2 + (pos.z - nz) ** 2 >= r * r) continue;
    b.alive = false; b.crumble = 0; n++;
    burstDebris(new V3(b.cx, b.h * 0.5, b.cz), b.debris, 30, 14, 0.9);
    burstDebris(new V3(b.cx, 1, b.cz), 0x8d8a84, 14, 8, 1.2);
    smoke(new V3(b.cx, 2, b.cz), 10, Math.max(b.hw, b.hd) * 0.9, 0xa49e93, Math.max(b.hw, b.hd));
  }
  if (n) { sfx.boom(); shake(0.7); }
  return n;
}

/* Does the line from the camera to Joseph cross this building (seen from above)? */
function blocksView(b, cam, pad) {
  const steps = 10;
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = cam.x + (P.pos.x - cam.x) * t, z = cam.z + (P.pos.z - cam.z) * t;
    const y = cam.y + (P.pos.y + 1.5 - cam.y) * t;
    if (Math.abs(x - b.cx) < b.hw + pad && Math.abs(z - b.cz) < b.hd + pad && y < b.h + 1) return true;
  }
  return false;
}

export function updateCity(dt, camera, allowFade = true) {
  const active = allowFade && (world.state === 'mission' || world.state === 'boss' || world.state === 'bossIntro');
  for (const b of buildings) {
    if (b.crumble >= 0 && b.crumble < 1) {
      b.crumble = Math.min(1, b.crumble + dt * 1.6);
      b.m.scale.y = THREE.MathUtils.lerp(1, 0.06, b.crumble);
      b.m.position.x = b.cx + Math.sin(b.crumble * 60) * 0.3 * (1 - b.crumble);
      if (Math.random() < 0.3) smoke(new V3(b.cx, b.h * b.m.scale.y, b.cz), 1, 3, 0xa49e93, b.hw);
    }
    // see-through when a building hides the hero from the camera
    // see-through when a building is between the camera and Joseph
    const hides = active && b.alive && b.h > 3 && blocksView(b, camera.position, P.kong ? 3 : 0.6);
    const target = hides ? 0.05 : 1;
    if (Math.abs(b.fade - target) > 0.01) {
      b.fade = THREE.MathUtils.lerp(b.fade, target, Math.min(1, dt * 8));
      for (const m of b.mats) { m.opacity = b.fade; m.depthWrite = b.fade > 0.95; }
      b.m.visible = b.fade > 0.15;
    }
  }
  updateProps(dt);
}

export function resetBuildings() {
  for (const b of buildings) {
    b.alive = true; b.crumble = -1; b.m.scale.y = 1; b.m.position.x = b.cx; b.fade = 1; b.m.visible = true;
    for (const m of b.mats) { m.opacity = 1; m.depthWrite = true; }
  }
}
