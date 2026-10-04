// Steering wheel and pedals for cars and tanks. Twist the wheel to steer (it straightens itself when you let go),
// hold GAS to go and BRAKE to slow down or back up. Keyboard: A/D steer, W gas, S brake.
import { $ } from './world.js';

/* Keep getting this finger's moves even if it slides off the control (never let a failed capture break the button). */
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* finger already gone */ } };

const MAX_TURN = 120; // degrees the wheel can turn each way
const wheel = { id: null, startAngle: 0, startRot: 0, rot: 0, held: false };
const pedals = { gas: false, brake: false };
const keys = new Set();

function pointerAngle(e, el) {
  const r = el.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
}

export function initDriveControls() {
  const el = $('wheel');
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (wheel.id !== null) return;
    wheel.id = e.pointerId; wheel.held = true;
    capture(el, e);
    wheel.startAngle = pointerAngle(e, el);
    wheel.startRot = wheel.rot;
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== wheel.id) return;
    let d = pointerAngle(e, el) - wheel.startAngle;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    wheel.rot = Math.max(-MAX_TURN, Math.min(MAX_TURN, wheel.startRot + d));
  });
  const release = e => { if (e.pointerId === wheel.id) { wheel.id = null; wheel.held = false; } };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);

  for (const [id, key] of [['pedal-gas', 'gas'], ['pedal-brake', 'brake']]) {
    const p = $(id);
    p.addEventListener('pointerdown', e => { e.preventDefault(); pedals[key] = true; p.classList.add('down'); capture(p, e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) p.addEventListener(ev, () => { pedals[key] = false; p.classList.remove('down'); });
  }
  window.addEventListener('keydown', e => keys.add(e.code));
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); pedals.gas = pedals.brake = false; });
}

/* Show the wheel and pedals (car/tank) or hide them (on foot, jet). */
export function showDriveControls(type) {
  const on = type === 'car' || type === 'tank';
  $('drive').hidden = !on;
  $('stick-zone').hidden = on;
  if (!on) { wheel.rot = 0; wheel.id = null; pedals.gas = pedals.brake = false; }
}

/* steer: -1 (left) .. 1 (right); gas and brake: 0..1. */
export function driveInput(dt) {
  const keyTurn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (keyTurn) wheel.rot = Math.max(-MAX_TURN, Math.min(MAX_TURN, wheel.rot + keyTurn * 260 * dt));
  else if (!wheel.held) wheel.rot *= Math.pow(0.02, dt); // let go: the wheel straightens out
  $('wheel-img').style.transform = `rotate(${wheel.rot}deg)`;
  return {
    steer: wheel.rot / MAX_TURN,
    gas: pedals.gas || keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0,
    brake: pedals.brake || keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0,
  };
}
