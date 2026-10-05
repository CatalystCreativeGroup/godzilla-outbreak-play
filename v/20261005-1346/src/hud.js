// On-screen HUD (hearts, armor, Kong meter, mission, boss bar, current gun) and touch / keyboard controls.
import { GAME, WEAPONS, MAX_WEAPON_LEVEL } from './settings.js';
import { LEVELS } from './levels.js';
import { firstPerson } from './hero.js';
import { $, world, P, loadout } from './world.js';
import { missionStatus } from './missions.js';
import { freeStats } from './freeplay.js';
import { bossHealthFraction, bossName } from './boss.js';

const last = {};
function setIfChanged(key, value, fn) {
  if (last[key] === value) return;
  last[key] = value; fn(value);
}
export function resetHudCache() { for (const k in last) delete last[k]; }

export function updateHud() {
  setIfChanged('hearts', P.hearts, () => {
    let h = '';
    for (let i = 0; i < GAME.hero.hearts; i++) h += i < P.hearts ? '<i class="heart"></i>' : '<i class="heart off"></i>';
    $('hearts').innerHTML = h;
  });
  setIfChanged('armor', P.armor, () => {
    let a = '';
    for (let i = 0; i < P.armor; i++) a += '<i class="shield"></i>';
    $('armor').innerHTML = a;
  });
  const pw = P.kong ? Math.round(Math.max(0, P.kongT) / GAME.kong.seconds * 100) : Math.round(P.power);
  setIfChanged('power', pw + (P.kong ? 'k' : ''), () => {
    $('meter-fill').style.width = Math.min(100, pw) + '%';
    const ready = !P.kong && P.power >= 100;
    $('meter').classList.toggle('ready', ready);
    $('meter').classList.toggle('kong', P.kong);
    $('btn-morph').classList.toggle('ready', ready);
  });
  const ms = world.mode === 'free' ? { icon: '🆓', done: 0, total: 0, text: `💀 ${freeStats.kills}  🦖 ${freeStats.bosses}  🥚 ${freeStats.bases}` } : missionStatus();
  setIfChanged('mission', `${ms.icon}${ms.done}/${ms.total}/${world.allies.length}/${ms.text || ''}`, () => {
    $('m-camps').innerHTML = ms.text ? `<span class="ic">${ms.icon}</span><b>${ms.text}</b>` : `<span class="ic">${ms.icon}</span><b>${ms.done}/${ms.total}</b>`;
    $('m-army').innerHTML = `<span class="ic">🪖</span><b>${world.allies.length}/${GAME.army.maxSize}</b>`;
    $('m-camps').classList.toggle('done', ms.total > 0 && ms.done >= ms.total);
  });
  const bossOn = !!world.bossTarget;
  setIfChanged('bossOn', !!bossOn, on => { $('boss-bar').hidden = !on; $('boss-name').textContent = bossName(); });
  if (bossOn) {
    const hp = Math.round(bossHealthFraction() * 100);
    setIfChanged('bossHp', hp, v => { $('boss-fill').style.width = v + '%'; $('boss-bar').classList.toggle('mad', v <= 50); });
  }
  setIfChanged('roarCool', P.kong && P.roarCd > 0, c => $('btn-a').classList.toggle('cool', c));
  setIfChanged('sight', sightMode(), m => { $('scope').hidden = m !== 'scope'; $('holo').hidden = m !== 'holo'; });
  const showCross = sightMode() ? false : P.vehicle ? P.vehicle.type === 'tank' : (firstPerson() || !P.kong);
  setIfChanged('crosshair', (P.ads ? 'a' : '') + (showCross ? (world.aimTarget && !P.vehicle ? 'on' : 'off') : 'hidden'), v => {
    v = v.replace(/^a/, '');
    $('crosshair').hidden = v === 'hidden';
    $('crosshair').classList.toggle('on', v === 'on');
    $('crosshair').classList.toggle('ads', P.ads);
  });
}

/* First person: an arrow at the top of the screen points to the next camp (or the boss). */
/* While aiming down the sights: a real scope (rifle, bazooka) or a red holographic sight (other guns). */
export function sightMode() {
  if (!firstPerson() || P.kong || P.vehicle || (P.adsT || 0) < 0.85) return '';
  return loadout.current === 'rifle' || loadout.current === 'bazooka' ? 'scope' : 'holo';
}

export function updateCompass(target) {
  const el = $('compass');
  const show = !!target && firstPerson();
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  const dx = target.x - P.pos.x, dz = target.z - P.pos.z;
  const fwd = dx * Math.sin(P.yaw) + dz * Math.cos(P.yaw);
  const right = dx * -Math.cos(P.yaw) + dz * Math.sin(P.yaw);
  el.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
}

export function updateWeaponHud() {
  const w = WEAPONS[loadout.current];
  const lvl = loadout.levels[loadout.current] || 1;
  $('btn-swap-ic').textContent = w.icon;
  $('weapon-name').textContent = w.name;
  $('weapon-stars').textContent = '★'.repeat(lvl) + '☆'.repeat(MAX_WEAPON_LEVEL - lvl);
  $('weapon-rate').textContent = (loadout.fullAuto[loadout.current] ? 'FULL AUTO ' : 'SEMI ') + (loadout.rateLevel > 1 ? `⏩${loadout.rateLevel}` : '');
  $('btn-swap').classList.toggle('single', loadout.owned.length < 2);
}

export function setKongControls(isKong) {
  $('btn-morph').hidden = isKong;
  $('btn-swap').hidden = isKong;
  $('btn-aim').hidden = isKong;
  $('weapon-chip').hidden = isKong;
  $('btn-a-ic').textContent = isKong ? '📣' : '⬆️';
  $('btn-a-label').textContent = isKong ? 'ROAR' : 'JUMP';
  $('btn-fire-ic').textContent = isKong ? '👊' : '🎯';
  $('btn-fire-label').textContent = isKong ? 'PUNCH' : 'FIRE';
  $('hero-name').textContent = isKong ? GAME.kong.name : GAME.hero.name;
  resetHudCache();
}

let bannerTimer = null;
export function banner(html, ms = 2200) {
  const b = $('banner');
  b.innerHTML = html; b.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}
export function flashScreen() {
  const f = $('flash'); f.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
}
export function hurtFlash() {
  const h = $('hurt'); h.classList.add('on');
  setTimeout(() => h.classList.remove('on'), 60);
}

export function showScreen(id) {
  for (const s of ['loading', 'title', 'win', 'ending']) $(s).hidden = s !== id;
  const inGame = !id;
  $('hud').hidden = !inGame; $('controls').hidden = !inGame;
  $('minimap').hidden = !inGame;
  resetInput();
}

/* Level buttons on the title screen: beaten levels get a check, the next one is open, later ones are locked. */
export function renderLevelPicker(onPick) {
  const wrap = $('city-picker');
  wrap.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const beaten = loadout.levelsBeaten.includes(i + 1);
    const open = beaten || i === 0 || loadout.levelsBeaten.includes(i);
    const b = document.createElement('button');
    b.className = 'city-btn' + (beaten ? ' beaten' : '') + (open ? '' : ' locked');
    b.disabled = !open;
    b.title = lv.name;
    b.innerHTML = `<span class="n">${i + 1}</span><span class="s">${beaten ? '✔' : open ? '▶' : '🔒'}</span>`;
    if (open) b.addEventListener('click', () => onPick(i));
    wrap.appendChild(b);
  });
}

/* The context button: DRIVE / FLY / TANK / CLIMB / EXIT (hidden when there's nothing to do). */
export function setAction(label) {
  setIfChanged('action', label || '', v => { $('btn-act').hidden = !v; $('btn-act-label').textContent = v; });
}

/* Inside a vehicle only the driving controls make sense. */
export function setVehicleControls(v) {
  const inside = !!v;
  $('btn-a').hidden = inside;
  $('btn-swap').hidden = inside || P.kong;
  $('btn-aim').hidden = inside || P.kong;
  $('btn-morph').hidden = inside || P.kong;
  $('weapon-chip').hidden = inside || P.kong;
  $('btn-fire').hidden = inside && v.type === 'car';
  $('btn-fire-ic').textContent = !inside ? (P.kong ? '👊' : '🎯') : v.type === 'jet' ? '💣' : '💥';
  $('btn-fire-label').textContent = !inside ? (P.kong ? 'PUNCH' : 'FIRE') : v.type === 'jet' ? 'BOMB' : 'CANNON';
  resetHudCache();
}

/* ---------- input ---------- */
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const lookDrag = { id: null, x: 0, y: 0 };
const keys = new Set();
const STICK_R = 60;
const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (err) { /* finger already gone */ } };

export function initInput(actions) {
  window.addEventListener('controls-changed', resetInput);
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  zone.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (stick.id !== null) return;
    stick.id = e.pointerId; capture(zone, e);
    const r = zone.getBoundingClientRect();
    stick.ox = e.clientX; stick.oy = e.clientY;
    base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    stick.x = dx / STICK_R; stick.y = dy / STICK_R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const stickUp = e => {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.x = stick.y = 0; knob.style.transform = '';
  };
  zone.addEventListener('pointerup', stickUp);
  zone.addEventListener('pointercancel', stickUp);
  zone.addEventListener('lostpointercapture', stickUp);

  const pad = (id, fn) => {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); fn(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => el.classList.remove('down'));
    el.addEventListener('click', e => { if (e.detail === 0) fn(); }); // keyboard activation
  };
  pad('btn-a', () => (P.kong ? actions.roar() : actions.jump()));
  pad('btn-morph', actions.morph);
  pad('btn-swap', actions.swap);
  pad('btn-view', actions.view);
  pad('btn-aim', actions.aim);
  pad('btn-act', actions.act);

  // FIRE: hold to keep shooting
  const fire = $('btn-fire');
  fire.addEventListener('pointerdown', e => { e.preventDefault(); fire.classList.add('down'); P.firing = true; P.fireQueued = true; capture(fire, e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) fire.addEventListener(ev, () => { fire.classList.remove('down'); P.firing = false; });

  // LOOK: drag the right side of the screen to turn and aim
  const look = $('look-zone');
  const drag = lookDrag;
  look.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (drag.id !== null) return;
    drag.id = e.pointerId; drag.x = e.clientX; drag.y = e.clientY;
    capture(look, e);
  });
  look.addEventListener('pointermove', e => {
    if (e.pointerId !== drag.id) return;
    // slower look while aiming down the sights, and a little sticky when the crosshair is on a monster
    const scoped = loadout.current === 'rifle' || loadout.current === 'bazooka';
    const k = 0.0055 * GAME.controls.lookSpeed * (P.ads ? (scoped ? 0.3 : 0.45) : 1) * (world.aimTarget ? 0.7 : 1);
    P.lookActive = 0.15;
    P.yaw -= (e.clientX - drag.x) * k;
    P.lookT = 1.5; // while driving, the camera stays where you looked for a moment
    P.pitch = Math.max(-0.6, Math.min(0.6, P.pitch - (e.clientY - drag.y) * k * 0.8));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const lookUp = e => { if (e.pointerId === drag.id) drag.id = null; };
  look.addEventListener('pointerup', lookUp);
  look.addEventListener('pointercancel', lookUp);
  look.addEventListener('lostpointercapture', lookUp);

  window.addEventListener('keydown', e => {
    keys.add(e.code);
    if (!['mission', 'boss', 'bossIntro'].includes(world.state)) return;
    if (e.code === 'Space') { e.preventDefault(); P.kong ? actions.roar() : actions.jump(); }
    if ((e.code === 'KeyF' || e.code === 'Enter') && !e.repeat) { P.firing = true; P.fireQueued = true; }
    if (e.code === 'KeyV') actions.view();
    if (e.code === 'KeyZ') actions.aim();
    if (e.code === 'KeyM' || e.code === 'KeyE') actions.morph();
    if (e.code === 'KeyR') actions.roar();
    if (e.code === 'KeyQ' || e.code === 'Tab') { e.preventDefault(); actions.swap(); }
    const n = Number(e.key);
    if (n >= 1 && n <= 6) actions.select(n - 1);
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'KeyF' || e.code === 'Enter') P.firing = false; });
  window.addEventListener('blur', () => { keys.clear(); P.firing = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());
}

/* Forget any finger that was down (screens changing, controls hidden): no stuck walking or looking. */
export function resetInput() {
  stick.id = null; stick.x = stick.y = 0;
  const knob = $('stick-knob'); if (knob) knob.style.transform = '';
  lookDrag.id = null;
  P.firing = false;
}

export function moveInput(dt = 0) {
  // arrow keys turn, WASD walks and steps sideways
  if (keys.has('ArrowLeft')) P.yaw += 2.4 * dt;
  if (keys.has('ArrowRight')) P.yaw -= 2.4 * dt;
  let x = stick.x, z = stick.y;
  if (keys.has('KeyA')) x -= 1;
  if (keys.has('KeyD')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z, l: Math.min(1, l) };
}
