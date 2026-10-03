// Godzilla Outbreak: game flow, camera and the main loop.
import * as THREE from 'three';
import { renderer, scene, camera, applyTheme, followSun, QUALITY } from './engine.js';
import { CITIES, WEAPONS } from './settings.js';
import { V3, rnd, world, P, loadout, $, lerp } from './world.js';
import { loadModels } from './models.js';
import { buildCity, updateCity } from './city.js';
import { updateFx, shakeState, setMoteColor, sparks } from './fx.js';
import { initAudio, sfx, say, toggleSound } from './audio.js';
import { updateShots, clearShots, setHostileTargets } from './weapons.js';
import { updateLoot, clearLoot } from './loot.js';
import { updateEnemies, clearEnemies, setVictims } from './enemies.js';
import { updateAllies, gatherAllies, restoreArmy } from './allies.js';
import { createHero, resetHero, updateHero, heroVictim, heroJump, tryMorph, kongPunch, kongRoar, hurtPlayer, addPower, equipGun, poseHeroForTitle, firstPerson } from './hero.js';
import { updateCamera } from './camera.js';
import { setupBoss, updateBoss, hideBoss, poseBossForTitle } from './boss.js';
import { setupMissions, updateMissions, updateBossIntro, objective, clearCamps } from './missions.js';
import { updateHud, updateWeaponHud, setKongControls, banner, flashScreen, hurtFlash, showScreen, renderCityPicker, initInput, moveInput, resetHudCache, updateCompass } from './hud.js';
import { loadSave, applySave, writeSave, nextCityIndex, resetSave } from './save.js';
import { GAME } from './settings.js';

const START = new V3(0, 0, 14);
const MOTE_COLORS = { day: 0xfff4e0, golden: 0xffd8a8, harbor: 0xe8f0ff, volcano: 0x8a7a70, storm: 0xc8c0e8 };

/* ---------- wiring between systems ---------- */
Object.assign(world, {
  banner, flash: flashScreen, hurtFlash, hurtPlayer,
  setKongMode: setKongControls,
  onWeaponChange: () => { equipGun(); updateWeaponHud(); writeSave(); },
  onEnemyDefeated: () => addPower(GAME.power.perMonster),
  onBossDefeated: winCity,
});
const victims = () => [heroVictim, ...world.allies].filter(v => v.alive);
setHostileTargets(victims);
setVictims(victims);

/* ---------- objective arrow above Joseph ---------- */
const arrow = new THREE.Group();
const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffc23d, emissive: 0xffa000, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.6 });
const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), arrowMat); tip.rotation.x = Math.PI / 2; tip.position.z = 1.4;
const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 1.4), arrowMat); shaft.position.z = 0.4;
arrow.add(tip, shaft);
scene.add(arrow);

function updateArrow() {
  let target = null;
  if (world.state === 'mission') target = objective();
  else if (world.state === 'boss' && !P.kong && world.bossTarget) target = world.bossTarget.pos;
  const far = target && Math.hypot(target.x - P.pos.x, target.z - P.pos.z) > 8;
  updateCompass(far ? target : null);
  arrow.visible = !!far && P.morphT <= 0 && !firstPerson();
  if (!arrow.visible) return;
  arrow.position.set(P.pos.x, (P.kong ? 14 : 3.4) + P.y + Math.sin(world.time * 5) * 0.2, P.pos.z);
  arrow.rotation.y = Math.atan2(target.x - P.pos.x, target.z - P.pos.z);
  arrow.scale.setScalar(P.kong ? 2.5 : 1);
}

/* ---------- city flow ---------- */
function loadCityScene(index) {
  const city = CITIES[index];
  world.cityIndex = index;
  world.city = city;
  const theme = applyTheme(city.theme);
  setMoteColor(MOTE_COLORS[city.theme] || 0xfff4e0, city.theme === 'volcano' ? 0.28 : 0.18);
  clearEnemies(); clearLoot(); clearShots(); clearCamps(); hideBoss();
  const sites = buildCity(city.theme, city.camps.length);
  setupBoss(city.boss);
  return { city, sites, theme };
}

function startCity(index) {
  initAudio();
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch (e) { /* not supported */ }
  const { city, sites } = loadCityScene(index);
  resetHero(START);
  setupMissions(index, sites);
  gatherAllies();
  setKongControls(false);
  updateWeaponHud();
  resetHudCache();
  showScreen(null);
  world.state = 'mission';
  banner(`${city.name}<small>Free the people in the monster camps!</small>`, 3600);
  say(`${city.name.toLowerCase()}. Free the people in the monster camps!`);
}

function winCity() {
  world.state = 'win';
  sfx.win();
  const city = world.city;
  if (!loadout.citiesBeaten.includes(city.id)) loadout.citiesBeaten = [...loadout.citiesBeaten, city.id];
  if (city.boss.reward && !loadout.kongPowers.includes(city.boss.reward)) loadout.kongPowers = [...loadout.kongPowers, city.boss.reward];
  writeSave();
  for (let i = 0; i < 6; i++) setTimeout(() => sparks(new V3(P.pos.x + rnd(-8, 8), 10, P.pos.z + rnd(-8, 8)), [0xffd23f, 0x9dff4a, 0xff7b24, 0x6ff6ff][i % 4], 30, 14, 0.7), i * 250);
  const isLast = world.cityIndex === CITIES.length - 1;
  setTimeout(() => {
    if (isLast) { showScreen('ending'); return; }
    $('win-reward').textContent = city.boss.reward;
    $('win-army').textContent = world.allies.length;
    const next = CITIES[world.cityIndex + 1];
    $('win-next').textContent = `Next: ${next.name} — ${next.boss.name}`;
    showScreen('win');
  }, 1600);
}

function showTitle() {
  world.state = 'title';
  const idx = nextCityIndex();
  loadCityScene(idx);
  resetHero(new V3(0, 0, 12));
  setKongControls(false);
  gatherAllies();
  showScreen('title');
  $('play-btn').textContent = loadout.citiesBeaten.length ? 'CONTINUE' : 'PLAY';
  renderCityPicker(i => startCity(i));
}

/* ---------- controls ---------- */
const VIEW_KEY = 'godzilla-outbreak-view';
try { world.view = localStorage.getItem(VIEW_KEY) || GAME.controls.startView; } catch (e) { world.view = GAME.controls.startView; }
function toggleView() {
  world.view = world.view === 'first' ? 'outside' : 'first';
  try { localStorage.setItem(VIEW_KEY, world.view); } catch (e) { /* remembering is optional */ }
  $('btn-view').textContent = world.view === 'first' ? '👁️' : '🎥';
  resetHudCache();
}

function swapWeapon(dir = 1) {
  if (P.kong || loadout.owned.length < 2) return;
  const i = loadout.owned.indexOf(loadout.current);
  loadout.current = loadout.owned[(i + dir + loadout.owned.length) % loadout.owned.length];
  world.onWeaponChange();
  sfx.pickup();
}
initInput({
  jump: heroJump, punch: kongPunch, morph: tryMorph, roar: kongRoar,
  swap: () => swapWeapon(1),
  view: toggleView,
  select: i => { if (!P.kong && loadout.owned[i]) { loadout.current = loadout.owned[i]; world.onWeaponChange(); } },
});
$('play-btn').addEventListener('click', () => startCity(nextCityIndex()));
$('next-btn').addEventListener('click', () => startCity(Math.min(world.cityIndex + 1, CITIES.length - 1)));
$('title-btn').addEventListener('click', showTitle);
$('again-btn').addEventListener('click', () => startCity(CITIES.length - 1));
// Two taps to start over (pop-up dialogs aren't available everywhere this game runs).
let resetArmed = null;
$('reset-btn').addEventListener('click', () => {
  const btn = $('reset-btn');
  if (!resetArmed) {
    btn.textContent = 'Tap again to erase guns and army';
    resetArmed = setTimeout(() => { resetArmed = null; btn.textContent = 'Start over'; }, 4000);
    return;
  }
  clearTimeout(resetArmed);
  resetSave();
  location.reload();
});
$('sound-btn').addEventListener('click', () => { $('sound-btn').textContent = toggleSound() ? '🔊' : '🔇'; });

// iPad: sound and the screen wake lock stop when the app is backgrounded; turn them back on when it returns.
const wakeUp = () => { if (world.state !== 'loading') initAudio(); try { navigator.wakeLock?.request('screen').catch(() => {}); } catch (e) { /* not supported */ } };
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeUp(); });
window.addEventListener('pointerdown', () => initAudio(), { passive: true });

/* ---------- adaptive quality: drop resolution if the iPad struggles ---------- */
let slowFrames = 0, qualityDropped = false;
function adaptQuality(dt) {
  if (qualityDropped) return;
  slowFrames = dt > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 0.5);
  if (slowFrames > 120) {
    qualityDropped = true;
    renderer.setPixelRatio(Math.min(1, QUALITY.pixelRatio));
    console.info('Lowering resolution to keep the game smooth');
  }
}

/* ---------- main loop ---------- */
function update(dt) {
  world.time += dt;
  if (world.state === 'title') {
    poseHeroForTitle(dt);
    poseBossForTitle(dt);
    updateAllies(dt);
  } else if (world.state !== 'loading') {
    const inp = (world.state === 'mission' || world.state === 'boss') ? moveInput(dt) : { x: 0, z: 0, l: 0 };
    updateHero(dt, inp);
    updateAllies(dt);
    if (world.state !== 'win' && world.state !== 'ending') { updateEnemies(dt); updateShots(dt); }
    updateBoss(dt);
    updateLoot(dt);
    updateMissions(dt);
    if (world.state === 'bossIntro') updateBossIntro(dt);
    updateArrow();
    updateHud();
  }
  updateCity(dt, camera, !firstPerson());
  const focus = world.state === 'title' || world.state === 'loading' ? new V3() : P.pos;
  updateFx(dt, focus);
  updateCamera(dt);
  followSun(focus);
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
  if (world.state === 'mission' || world.state === 'boss') adaptQuality(dt);
}

/* ---------- boot ---------- */
async function boot() {
  world.state = 'loading';
  showScreen('loading');
  applySave(loadSave());
  applyTheme('day');
  loop();
  await loadModels(f => { $('load-fill').style.width = Math.round(f * 100) + '%'; });
  createHero();
  const saved = loadSave();
  if (saved?.army) restoreArmy(Math.min(saved.army, GAME.army.maxSize));
  for (const a of world.allies) a.model.root.visible = true;
  updateWeaponHud();
  $('btn-view').textContent = world.view === 'first' ? '👁️' : '🎥';
  showTitle();
  window.__game = { world, P, loadout, startCity, WEAPONS }; // handy for testing
}
boot();
