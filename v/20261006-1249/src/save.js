// Auto-save: which levels are beaten, Joseph's guns and upgrades, Kong powers and army size.
import { loadout, world, P } from './world.js';
import { WEAPONS } from './settings.js';
import { LEVELS } from './levels.js';

const KEY = 'godzilla-outbreak-save-v2';
const OLD_CITIES = ['starter', 'downtown', 'harbor', 'volcano', 'final']; // saves from the 5-city version

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const owned = (Array.isArray(raw.owned) ? raw.owned : []).filter(w => WEAPONS[w]);
    let beaten = Array.isArray(raw.levelsBeaten) ? raw.levelsBeaten.filter(n => Number.isInteger(n) && n >= 1 && n <= LEVELS.length) : [];
    if (!beaten.length && Array.isArray(raw.citiesBeaten)) {
      // old save: each beaten city unlocks the matching number of levels
      const count = raw.citiesBeaten.filter(id => OLD_CITIES.includes(id)).length;
      beaten = Array.from({ length: Math.min(count * 2, LEVELS.length) }, (_, i) => i + 1);
    }
    return {
      owned: owned.length ? owned : ['blaster'],
      levels: raw.levels && typeof raw.levels === 'object' ? raw.levels : {},
      rateLevel: Number.isFinite(raw.rateLevel) ? raw.rateLevel : 1,
      fullAuto: raw.fullAuto && typeof raw.fullAuto === 'object' ? raw.fullAuto : {},
      kongPowers: Array.isArray(raw.kongPowers) ? raw.kongPowers : [],
      levelsBeaten: beaten,
      army: Number.isFinite(raw.army) ? raw.army : 0,
      armor: Number.isFinite(raw.armor) ? raw.armor : 0,
    };
  } catch (e) {
    return null; // storage blocked (private mode) or bad data: start fresh
  }
}

export function applySave(s) {
  if (!s) return;
  loadout.owned = s.owned;
  loadout.current = s.owned.includes(loadout.current) ? loadout.current : s.owned[s.owned.length - 1];
  loadout.levels = s.levels;
  loadout.rateLevel = s.rateLevel;
  loadout.fullAuto = s.fullAuto;
  loadout.kongPowers = s.kongPowers;
  loadout.levelsBeaten = s.levelsBeaten;
  P.armor = s.armor;
}

export function writeSave() {
  if (world.mode === 'free') return; // free play doesn't change the story save
  try {
    localStorage.setItem(KEY, JSON.stringify({
      owned: loadout.owned, levels: loadout.levels, rateLevel: loadout.rateLevel, fullAuto: loadout.fullAuto,
      kongPowers: loadout.kongPowers, levelsBeaten: loadout.levelsBeaten,
      army: world.allies.length, armor: P.armor,
    }));
  } catch (e) { /* saving is optional */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/* The first level not beaten yet (0-based), or the last one. */
export function nextLevelIndex() {
  const i = LEVELS.findIndex((_, n) => !loadout.levelsBeaten.includes(n + 1));
  return i === -1 ? LEVELS.length - 1 : i;
}
