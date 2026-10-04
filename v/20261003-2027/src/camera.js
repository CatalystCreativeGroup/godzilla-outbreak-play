// Camera: orbit on the title screen, first person (Joseph's eyes) or an over-the-shoulder outside view.
// Kong always uses the outside view so you can see the giant.
import { camera } from './engine.js';
import { V3, rnd, world, P, angleTo, turnToward } from './world.js';
import { shakeState } from './fx.js';
import { EYE, firstPerson } from './hero.js';
import { loadout } from './world.js';

/* How much each gun zooms in when aiming down the sights (scopes zoom the most). */
const ZOOM = { blaster: 1.35, rifle: 1.9, shotgun: 1.25, bazooka: 2.3, lightning: 1.4, freeze: 1.4 };

const camPos = new V3(0, 40, 60), camLook = new V3();
let lastFov = 0, lastNear = 0;

function setLens(fov, near) {
  if (fov === lastFov && near === lastNear) return;
  camera.fov = fov; camera.near = near;
  camera.updateProjectionMatrix();
  lastFov = fov; lastNear = near;
}

function applyShake(dt) {
  if (shakeState.amt <= 0.01) return;
  camera.position.x += rnd(-1, 1) * shakeState.amt * 0.6;
  camera.position.y += rnd(-1, 1) * shakeState.amt * 0.6;
  shakeState.amt *= Math.pow(0.02, dt);
}

function titleCamera() {
  const a = world.time * 0.1;
  // circle inside the park (downtown towers stand all around it)
  camPos.set(Math.sin(a) * 15, 7.5, Math.cos(a) * 15 + 3);
  camLook.set(0, 4.5, 2);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function firstPersonCamera(dt) {
  const walking = P.moving > 0.12 && P.y < 0.1;
  const bob = walking ? Math.sin(world.time * 11) * 0.05 * P.moving : 0;
  camera.position.set(P.pos.x, P.pos.y + P.y + EYE + bob, P.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(P.pitch + (P.kick || 0), P.yaw + Math.PI, 0);
  camPos.copy(camera.position);
}

const CHASE = { car: [9, 3.8, 1.6], tank: [13, 6, 2.5], jet: [24, 6.5, 2] }; // back, up, look height

function vehicleCamera(dt) {
  const v = P.vehicle;
  P.lookT = Math.max(0, (P.lookT || 0) - dt);
  if (P.lookT <= 0 && v.type !== 'tank') P.yaw = turnToward(P.yaw, v.yaw, dt * 2.5);
  const [back, up, lookUp] = CHASE[v.type];
  const fwd = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
  const want = v.pos.clone().addScaledVector(fwd, -back).setY(v.alt + up - P.pitch * 4);
  camPos.lerp(want, Math.min(1, dt * 7));
  const look = v.pos.clone().addScaledVector(fwd, 10).setY(v.alt + lookUp + P.pitch * 8);
  camLook.lerp(look, Math.min(1, dt * 10));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function outsideCamera(dt) {
  if (P.vehicle) return vehicleCamera(dt);
  const bossOn = world.state === 'boss' || world.state === 'bossIntro';
  const fwd = new V3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), right = new V3(-Math.cos(P.yaw), 0, Math.sin(P.yaw));
  const a = P.kong ? 0 : (P.adsT || 0); // aiming pulls the camera in over the shoulder
  const back = P.kong ? 21 : (bossOn ? 8.5 : 6.2) * (1 - a) + 3.0 * a;
  const up = P.kong ? 13 : (bossOn ? 4.6 : 3.3) * (1 - a) + 2.3 * a;
  const shoulder = P.kong ? 0 : 1.0;
  const want = P.pos.clone().addScaledVector(fwd, -back).addScaledVector(right, shoulder).setY(P.y + up - P.pitch * (P.kong ? 8 : 3));
  camPos.lerp(want, Math.min(1, dt * 9));
  const look = P.pos.clone().addScaledVector(fwd, P.kong ? 10 : 7).addScaledVector(right, shoulder * 0.6)
    .setY((P.kong ? 7 : 1.9) + P.y + P.pitch * (P.kong ? 14 : 7));
  camLook.lerp(look, Math.min(1, dt * 14));
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

export function updateCamera(dt) {
  const portrait = window.innerHeight > window.innerWidth;
  if (world.state === 'title' || world.state === 'loading') {
    setLens(portrait ? 64 : 48, 0.5);
    titleCamera();
    return;
  }
  // when the boss lands, turn to face it
  const boss = world.bossTarget;
  if (world.state === 'bossIntro' && boss) {
    P.yaw = turnToward(P.yaw, angleTo(P.pos, boss.pos), dt * 3);
    P.pitch += (0.18 - P.pitch) * Math.min(1, dt * 2);
  }
  const zoom = 1 + ((ZOOM[loadout.current] || 1.4) - 1) * (P.adsT || 0);
  if (firstPerson()) {
    setLens((portrait ? 78 : 62) / zoom, 0.08);
    firstPersonCamera(dt);
  } else {
    setLens((portrait ? 72 : 56) / (1 + (zoom - 1) * 0.35), 0.3);
    outsideCamera(dt);
  }
  applyShake(dt);
}
