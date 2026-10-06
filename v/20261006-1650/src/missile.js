// The missile truck's guided missile. FIRE launches it and the screen switches to the camera in its nose:
// steer it with the joystick (push up to climb, down to dive, left/right to turn) and fly it into the target.
import * as THREE from 'three';
import { scene } from './engine.js';
import { explode, liveTargets, aimPoint } from './weapons.js';
import { groundAt } from './map.js';
import { sfx, say } from './audio.js';
import { smoke, fireball, shake, flash } from './fx.js';
import { V3, clamp, world, P, $ } from './world.js';

const SPEED = 38, LIFE = 14;
export const missile = { active: false, pos: new V3(), yaw: 0, pitch: 0, t: 0, boomT: 0, mesh: null, truck: null };

const body = new THREE.Group();
{
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: 0.45, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa3201a, roughness: 0.5 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false, transparent: true, opacity: 0.9 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 12).rotateX(Math.PI / 2), white);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 12).rotateX(Math.PI / 2), red); nose.position.z = 1.4;
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 10).rotateX(-Math.PI / 2), flame); fire.position.z = -1.5;
  body.add(tube, nose, fire);
  for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.4), red); fin.position.set(0, 0, -0.9); fin.rotation.z = i * Math.PI / 2; fin.geometry.translate(0, 0.3, 0); body.add(fin); }
  body.visible = false;
  scene.add(body);
}

export function launchMissile(truck) {
  if (missile.active) return;
  Object.assign(missile, { active: true, t: 0, boomT: 0, yaw: P.yaw, pitch: 0.35, truck });
  missile.pos.set(truck.pos.x, truck.alt + 3.4, truck.pos.z).addScaledVector(new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), -1);
  body.visible = true;
  flash(missile.pos.clone(), 0xffd27a, 3);
  smoke(missile.pos.clone(), 8, 2, 0xd8d2c8, 1.5, 1.4);
  sfx.bazooka(); shake(0.4);
  $('missile-cam').hidden = false;
  document.getElementById('c').classList.add('thermal');
  world.onMissileCam?.(true); // the stick shows up so you can steer
  world.banner?.('MISSILE CAM!<small>Steer it with the stick</small>', 2000);
  say('Missile cam! Steer it!');
}

function boom() {
  missile.boomT = 0.9;
  body.visible = false;
  explode(missile.pos.clone(), 12, 90);
  fireball(missile.pos.clone(), 12);
  shake(1.2);
}

function finish() {
  missile.active = false;
  $('missile-cam').hidden = true;
  document.getElementById('c').classList.remove('thermal');
  world.onMissileCam?.(false);
}

export function updateMissile(dt, inp) {
  if (!missile.active) return;
  if (missile.boomT > 0) { missile.boomT -= dt; if (missile.boomT <= 0) finish(); return; }
  missile.t += dt;
  missile.yaw -= inp.x * 1.5 * dt;
  missile.pitch = clamp(missile.pitch - inp.z * 1.1 * dt - 0.03 * dt, -1.2, 0.9); // push up = climb, a little gravity
  const dir = new V3(Math.sin(missile.yaw) * Math.cos(missile.pitch), Math.sin(missile.pitch), Math.cos(missile.yaw) * Math.cos(missile.pitch));
  missile.pos.addScaledVector(dir, SPEED * dt);
  body.position.copy(missile.pos);
  body.lookAt(missile.pos.clone().add(dir));
  if (Math.random() < 0.8) smoke(missile.pos.clone().addScaledVector(dir, -1.6), 1, 0.9, 0xe8e2d8, 0.2, 1.4);
  $('missile-time').style.width = Math.max(0, 100 - missile.t / LIFE * 100) + '%';
  // hit a monster, a nest, the boss, a building or the ground; or run out of fuel
  const near = liveTargets().some(t => aimPoint(t).distanceTo(missile.pos) < t.radius + 2);
  if (near || missile.pos.y <= groundAt(missile.pos.x, missile.pos.z, 999) + 0.3 || missile.pos.y < 0.3 || missile.t > LIFE) boom();
}

/* The camera rides in the missile's nose. */
export function missileCamera(camera) {
  if (!missile.active) return false;
  const dir = new V3(Math.sin(missile.yaw) * Math.cos(missile.pitch), Math.sin(missile.pitch), Math.cos(missile.yaw) * Math.cos(missile.pitch));
  if (missile.boomT > 0) { camera.lookAt(missile.pos); return true; } // watch the explosion from where the camera was
  camera.position.copy(missile.pos).addScaledVector(dir, 1.6);
  camera.lookAt(missile.pos.clone().addScaledVector(dir, 20));
  return true;
}

/* Leaving a level while a missile is flying: put everything back. */
export function resetMissile() {
  if (missile.active) finish();
  body.visible = false;
}
