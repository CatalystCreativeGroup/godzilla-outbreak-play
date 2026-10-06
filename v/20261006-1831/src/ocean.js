// The ocean: what you see underwater (in the submarine) and the submarine's torpedoes.
import * as THREE from 'three';
import { scene } from './engine.js';
import { explode, liveTargets, aimPoint } from './weapons.js';
import { isWater, WATER_Y, SEABED, SHORE } from './map.js';
import { sfx } from './audio.js';
import { smoke, shake, popWord } from './fx.js';
import { V3, world, $ } from './world.js';

/* ---------- underwater view: blue-green haze when the camera dips below the waves ---------- */
let under = false, saved = null;
export function updateUnderwater(camera) {
  const u = camera.position.y < WATER_Y - 0.05 && isWater(camera.position.x, camera.position.z);
  if (u === under) return;
  under = u;
  $('underwater').hidden = !u;
  // the sky dome ignores fog, so hide it down here and fill the background with sea colour
  const sky = scene.children.find(o => o.material?.uniforms?.sunPosition);
  if (u) {
    saved = { fog: scene.fog, background: scene.background };
    scene.fog = new THREE.FogExp2(0x0e4a5c, 0.03);
    scene.background = new THREE.Color(0x0e4a5c);
    if (sky) sky.visible = false;
  } else if (saved) {
    scene.fog = saved.fog;
    scene.background = saved.background;
    if (sky) sky.visible = true;
    saved = null;
  }
}

/* ---------- torpedoes ---------- */
const torpedoes = [];
const torpGeo = new THREE.CapsuleGeometry(0.35, 2.6, 4, 10).rotateX(Math.PI / 2);
const torpMat = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.6 });

export function fireTorpedo(sub) {
  const dir = new V3(Math.sin(sub.yaw), 0, Math.cos(sub.yaw));
  const mesh = new THREE.Mesh(torpGeo, torpMat);
  const pos = sub.pos.clone().addScaledVector(dir, 17).setY(Math.min(-1.5, sub.alt - 1));
  mesh.position.copy(pos);
  mesh.lookAt(pos.clone().add(dir));
  scene.add(mesh);
  torpedoes.push({ mesh, pos, dir, t: 0 });
  sfx.spit();
  popWord('TORPEDO!', pos.clone().setY(3), '#bfe8ff', 3);
}

export function updateTorpedoes(dt) {
  for (let i = torpedoes.length - 1; i >= 0; i--) {
    const tp = torpedoes[i];
    tp.t += dt;
    tp.pos.addScaledVector(tp.dir, 34 * dt);
    tp.mesh.position.copy(tp.pos);
    if (Math.random() < 0.6) smoke(tp.pos.clone().addScaledVector(tp.dir, -2), 1, 0.5, 0xeaf6ff, 0.3, 0.8); // bubbles
    const hitTarget = liveTargets().some(t => aimPoint(t).distanceTo(tp.pos) < t.radius + 3);
    const hitShore = tp.pos.z < SHORE + 2;
    if (hitTarget || hitShore || tp.t > 6 || tp.pos.y < SEABED + 1) {
      const at = tp.pos.clone().setY(Math.max(0.5, tp.pos.y));
      explode(at, 10, 70);
      smoke(at.clone().setY(1), 16, 5, 0xf4f8ff, 6, 2); // a big splash
      shake(0.8);
      scene.remove(tp.mesh);
      torpedoes.splice(i, 1);
    }
  }
}

export function clearTorpedoes() {
  for (const tp of torpedoes) scene.remove(tp.mesh);
  torpedoes.length = 0;
}
export { world };
