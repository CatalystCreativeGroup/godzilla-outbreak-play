// Godzilla Outbreak: level flow, controls wiring and the main loop.
import * as THREE from 'three';
import { renderer, scene, camera, applyTheme, followSun, QUALITY } from './engine.js';
import { GAME, WEAPONS } from './settings.js';
import { LEVELS, MISSION_TEXT } from './levels.js';
import { V3, rnd, world, P, loadout, $ } from './world.js';
import { loadModels, updateCulling } from './models.js';
import { buildWorld, updateMap, resetBuildings, ladderNear, DISTRICTS } from './map.js';
import { setMapTheme } from './map-props.js';
import { updateFx, setMoteColor, sparks } from './fx.js';
import { initAudio, sfx, say, toggleSound } from './audio.js';
import { updateShots, clearShots, setHostileTargets } from './weapons.js';
import { updateLoot, clearLoot } from './loot.js';
import { updateEnemies, clearEnemies, setVictims } from './enemies.js';
import { updateAllies, gatherAllies, restoreArmy, spawnSoldiers } from './allies.js';
import { createHero, resetHero, updateHero, heroVictim, heroJump, tryMorph, kongPunch, kongRoar, hurtPlayer, addPower, equipGun, poseHeroForTitle, firstPerson, startClimb } from './hero.js';
import { updateCamera } from './camera.js';
import { setupBoss, updateBoss, hideBoss, poseBossForTitle } from './boss.js';
import { setupMission, updateMissions, updateBossIntro, objective, clearMission, missionTargets } from './missions.js';
import { updateNests } from './nests.js';
import { scatterCrates } from './crates.js';
import { setupVehicles, updateVehicles, vehicleNear, enterVehicle, exitVehicle, vehicleVictim, clearBombs } from './vehicles.js';
import { initMinimap, updateMinimap } from './minimap.js';
import { updateHud, updateWeaponHud, setKongControls, setVehicleControls, setAction, banner, flashScreen, hurtFlash, showScreen, renderLevelPicker, initInput, moveInput, resetHudCache, updateCompass } from './hud.js';
import { loadSave, applySave, writeSave, nextLevelIndex, resetSave } from './save.js';

const START = new V3(-4, 0, 12); // on the street at the south edge of the downtown park
const MOTE_COLORS = { day: 0xfff4e0, golden: 0xffd8a8, harbor: 0xe8f0ff, volcano: 0x8a7a70, storm: 0xc8c0e8, night: 0xb8c8ff };

/* ---------- wiring between systems ---------- */
Object.assign(world, {
  banner, flash: flashScreen, hurtFlash, hurtPlayer,
  setKongMode: isKong => { setKongControls(isKong); setVehicleControls(null); },
  onWeaponChange: () => { equipGun(); updateWeaponHud(); writeSave(); },
  onEnemyDefeated: () => addPower(GAME.power.perMonster),
  onBossDefeated: winLevel,
  onVehicleChange: () => setVehicleControls(P.vehicle),
  spawnSoldiers,
});
const victims = () => [heroVictim, vehicleVictim, ...world.allies].filter(v => v.alive);
setHostileTargets(victims);
setVictims(victims);

/* ---------- objective arrow above Joseph (outside view) ---------- */
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
  const big = P.kong ? 2.5 : P.vehicle ? (P.vehicle.type === 'jet' ? 3 : 1.8) : 1;
  arrow.position.set(P.pos.x, (P.kong ? 14 : P.vehicle ? 6 : 3.4) + P.y + Math.sin(world.time * 5) * 0.2, P.pos.z);
  arrow.rotation.y = Math.atan2(target.x - P.pos.x, target.z - P.pos.z);
  arrow.scale.setScalar(big);
}

/* ---------- level flow ---------- */
function prepareLevel(index) {
  const level = LEVELS[index];
  world.levelIndex = index;
  world.level = level;
  applyTheme(level.theme);
  setMapTheme(level.theme);
  setMoteColor(MOTE_COLORS[level.theme] || 0xfff4e0, level.theme === 'volcano' ? 0.28 : 0.18);
  clearEnemies(); clearLoot(); clearShots(); clearMission(); clearBombs(); hideBoss();
  resetBuildings();
  scatterCrates();
  setupVehicles();
  setupBoss(level.boss);
  return level;
}

function startLevel(index) {
  initAudio();
  try { navigator.wakeLock?.request('screen').catch(() => {}); } catch (e) { /* not supported */ }
  const level = prepareLevel(index);
  resetHero(START);
  setupMission(level);
  gatherAllies();
  setKongControls(false);
  setVehicleControls(null);
  updateWeaponHud();
  resetHudCache();
  showScreen(null);
  world.state = 'mission';
  const where = DISTRICTS[level.district].name;
  const goal = MISSION_TEXT[level.mission.type].goal;
  banner(`LEVEL ${index + 1}: ${level.name}<small>${where}: ${goal}</small>`, 4200);
  say(`Level ${index + 1}. ${goal}`);
}

function winLevel() {
  world.state = 'win';
  sfx.win();
  const level = world.level, n = world.levelIndex + 1;
  if (P.vehicle) exitVehicle();
  if (!loadout.levelsBeaten.includes(n)) loadout.levelsBeaten = [...loadout.levelsBeaten, n];
  if (level.reward && !loadout.kongPowers.includes(level.reward)) loadout.kongPowers = [...loadout.kongPowers, level.reward];
  writeSave();
  for (let i = 0; i < 6; i++) setTimeout(() => sparks(new V3(P.pos.x + rnd(-8, 8), 10, P.pos.z + rnd(-8, 8)), [0xffd23f, 0x9dff4a, 0xff7b24, 0x6ff6ff][i % 4], 30, 14, 0.7), i * 250);
  const isLast = world.levelIndex === LEVELS.length - 1;
  setTimeout(() => {
    if (isLast) { showScreen('ending'); return; }
    $('win-title').textContent = `LEVEL ${n} DONE!`;
    $('win-reward-box').hidden = !level.reward;
    $('win-reward').textContent = level.reward || '';
    $('win-army').textContent = world.allies.length;
    const next = LEVELS[world.levelIndex + 1];
    $('win-next').textContent = `Next: Level ${n + 1}, ${next.name}`;
    showScreen('win');
  }, 1600);
}

function showTitle() {
  world.state = 'title';
  prepareLevel(nextLevelIndex());
  resetHero(new V3(0, 0, 12));
  setKongControls(false);
  gatherAllies();
  showScreen('title');
  $('play-btn').textContent = loadout.levelsBeaten.length ? `CONTINUE (LEVEL ${nextLevelIndex() + 1})` : 'PLAY';
  renderLevelPicker(i => startLevel(i));
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
  if (P.kong || P.vehicle || loadout.owned.length < 2) return;
  const i = loadout.owned.indexOf(loadout.current);
  loadout.current = loadout.owned[(i + dir + loadout.owned.length) % loadout.owned.length];
  world.onWeaponChange();
  sfx.pickup();
}
/* The action button does whatever makes sense right here. */
function contextAction() {
  if (P.vehicle) return { label: '🚪 EXIT', run: exitVehicle };
  const v = vehicleNear();
  if (v) return { label: v.t.label, run: () => enterVehicle(v) };
  const ladder = !P.kong && !P.climb ? ladderNear(P.pos, P.y) : null;
  if (ladder) return { label: '🪜 CLIMB', run: () => startClimb(ladder) };
  return null;
}
initInput({
  jump: heroJump, punch: kongPunch, morph: tryMorph, roar: kongRoar,
  swap: () => swapWeapon(1),
  view: toggleView,
  act: () => { if (world.state === 'mission' || world.state === 'boss') contextAction()?.run(); },
  select: i => { if (!P.kong && !P.vehicle && loadout.owned[i]) { loadout.current = loadout.owned[i]; world.onWeaponChange(); } },
});
window.addEventListener('keydown', e => { if (e.code === 'KeyG' && (world.state === 'mission' || world.state === 'boss')) contextAction()?.run(); });
$('play-btn').addEventListener('click', () => startLevel(nextLevelIndex()));
$('next-btn').addEventListener('click', () => startLevel(Math.min(world.levelIndex + 1, LEVELS.length - 1)));
$('title-btn').addEventListener('click', showTitle);
$('again-btn').addEventListener('click', () => startLevel(LEVELS.length - 1));
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
    const live = world.state === 'mission' || world.state === 'boss';
    const inp = live ? moveInput(dt) : { x: 0, z: 0, l: 0 };
    updateVehicles(dt, inp);
    updateHero(dt, inp);
    updateAllies(dt);
    if (world.state !== 'win' && world.state !== 'ending') { updateEnemies(dt); updateShots(dt); updateNests(dt); }
    updateBoss(dt);
    updateLoot(dt);
    updateMissions(dt);
    if (world.state === 'bossIntro') updateBossIntro(dt);
    updateArrow();
    updateHud();
    setAction(live ? contextAction()?.label : null);
    updateMinimap();
  }
  updateMap(dt, camera, !firstPerson());
  const focus = world.state === 'title' || world.state === 'loading' ? new V3(0, 0, 6) : P.pos;
  updateFx(dt, focus);
  updateCamera(dt);
  updateCulling(camera);
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
  buildWorld();
  initMinimap();
  loop();
  await loadModels(f => { $('load-fill').style.width = Math.round(f * 100) + '%'; });
  createHero();
  const saved = loadSave();
  if (saved?.army) restoreArmy(Math.min(saved.army, GAME.army.maxSize));
  updateWeaponHud();
  $('btn-view').textContent = world.view === 'first' ? '👁️' : '🎥';
  showTitle();
  window.__game = { world, P, loadout, startLevel, WEAPONS, LEVELS, objective, missionTargets, act: () => contextAction()?.run(), action: () => contextAction()?.label }; // handy for testing
}
boot();
