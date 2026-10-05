// Steering wheel and pedals for cars and tanks. Slide your finger left or right on the wheel to steer (it straightens itself when you let go),
// hold GAS to go and BRAKE to slow down or back up. Keyboard: A/D steer, W gas, S brake.
import { $ } from './world.js';

/* Keep getting this finger's moves even if it slides off the control (never let a failed capture break the button). */
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* finger already gone */ } };

const MAX_TURN = 90; // degrees the wheel can turn each way
const DEG_PER_PX = 1.4; // sliding a finger 65px sideways turns the wheel all the way
const wheel = { id: null, startX: 0, startRot: 0, rot: 0, held: false };
const pedals = { gas: false, brake: false };
const keys = new Set();


export function initDriveControls() {
  const el = $('wheel');
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (wheel.id !== null) return;
    wheel.id = e.pointerId; wheel.held = true;
    capture(el, e);
    wheel.startX = e.clientX;
    wheel.startRot = wheel.rot;
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== wheel.id) return;
    // sliding sideways is much easier for small hands than twisting in a circle
    wheel.rot = Math.max(-MAX_TURN, Math.min(MAX_TURN, wheel.startRot + (e.clientX - wheel.startX) * DEG_PER_PX));
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
  window.dispatchEvent(new Event('controls-changed'));
  if (!on) { wheel.rot = 0; wheel.id = null; pedals.gas = pedals.brake = false; }
}

/* steer: -1 (left) .. 1 (right); gas and brake: 0..1. */
export function driveInput(dt) {
  const keyTurn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (keyTurn) wheel.rot = Math.max(-MAX_TURN, Math.min(MAX_TURN, wheel.rot + keyTurn * 300 * dt));
  else if (!wheel.held) wheel.rot *= Math.pow(0.002, dt); // let go: the wheel straightens out quickly
  $('wheel-img').style.transform = `rotate(${wheel.rot}deg)`;
  return {
    steer: wheel.rot / MAX_TURN,
    gas: pedals.gas || keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0,
    brake: pedals.brake || keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0,
  };
}
