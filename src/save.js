// Auto-save: which cities are beaten, Joseph's guns and upgrades, Kong powers and army size.
import { loadout, world, P } from './world.js';
import { WEAPONS, CITIES } from './settings.js';

const KEY = 'godzilla-outbreak-save-v2';

export function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    const owned = (Array.isArray(raw.owned) ? raw.owned : []).filter(w => WEAPONS[w]);
    return {
      owned: owned.length ? owned : ['blaster'],
      levels: raw.levels && typeof raw.levels === 'object' ? raw.levels : {},
      rateLevel: Number.isFinite(raw.rateLevel) ? raw.rateLevel : 1,
      kongPowers: Array.isArray(raw.kongPowers) ? raw.kongPowers : [],
      citiesBeaten: Array.isArray(raw.citiesBeaten) ? raw.citiesBeaten.filter(id => CITIES.some(c => c.id === id)) : [],
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
  loadout.kongPowers = s.kongPowers;
  loadout.citiesBeaten = s.citiesBeaten;
  P.armor = s.armor;
}

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      owned: loadout.owned, levels: loadout.levels, rateLevel: loadout.rateLevel,
      kongPowers: loadout.kongPowers, citiesBeaten: loadout.citiesBeaten,
      army: world.allies.length, armor: P.armor,
    }));
  } catch (e) { /* saving is optional */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
}

/* The first city not beaten yet (or the last one). */
export function nextCityIndex() {
  const i = CITIES.findIndex(c => !loadout.citiesBeaten.includes(c.id));
  return i === -1 ? CITIES.length - 1 : i;
}
