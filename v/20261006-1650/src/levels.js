/* =====================================================================
   THE 20 LEVELS — change these to design your own missions!
   district: downtown | residential | harbor | airport | military | volcano
   mission types:
     rescue   — beat the guards at monster camps and free the people
     nests    — blow up monster nests (they keep making monsters)
     rooftop  — climb ladders to save people stuck on roofs
     airstrike — fly a jet from the airport and bomb monster bases
     tank     — take a tank from the army base and stop the brute army
     collect  — grab the weapon parts guarded by monsters
   boss model: godzilla | kid | ice | thunder | mecha | shadow | swamp
   ===================================================================== */
export const LEVELS = [
  { name: 'BABY GODZILLA ATTACK', district: 'downtown', theme: 'day', mission: { type: 'rescue', count: 3 }, monsters: ['lizard'], roamers: 8,
    boss: { model: 'godzilla', name: 'BABY GODZILLA', health: 260, size: 1, element: 'normal' }, unlocks: ['rifle'], reward: 'GROUND POUND' },
  { name: 'NEST BUSTERS', district: 'downtown', theme: 'day', mission: { type: 'nests', count: 4 }, monsters: ['lizard', 'jumper'], roamers: 9,
    boss: { model: 'kid', name: 'KID GODZILLA', health: 380, size: 1.1, element: 'normal' }, unlocks: ['shotgun'] },
  { name: 'SWAMP THING', district: 'residential', theme: 'golden', mission: { type: 'rescue', count: 3 }, monsters: ['lizard', 'spitter'], roamers: 10,
    boss: { model: 'swamp', name: 'SWAMP GODZILLA', health: 460, size: 1.2, element: 'swamp', special: 'summon' } },
  { name: 'ROOFTOP RESCUE', district: 'residential', theme: 'day', mission: { type: 'rooftop', count: 4 }, monsters: ['lizard', 'jumper', 'spitter'], roamers: 10,
    boss: { model: 'ice', name: 'ICE GODZILLA', health: 520, size: 1.2, element: 'ice', special: 'frost' }, unlocks: ['bazooka', 'sniper'] },
  { name: 'HARBOR HOSTAGES', district: 'harbor', theme: 'harbor', mission: { type: 'rescue', count: 4 }, monsters: ['lizard', 'spitter', 'brute'], roamers: 10,
    boss: { model: 'godzilla', name: 'ADULT GODZILLA', health: 600, size: 1.7, tint: 0x7fa9d6, element: 'water', special: 'breath' }, unlocks: ['lightning'], reward: 'WATER ARMOR' },
  { name: 'TANK BATTLE', district: 'military', theme: 'golden', mission: { type: 'tank', count: 8 }, monsters: ['lizard', 'bomber'], roamers: 8,
    boss: { model: 'thunder', name: 'THUNDER GODZILLA', health: 640, size: 1.3, element: 'thunder', special: 'lightning' } },
  { name: 'AIR STRIKE', district: 'airport', theme: 'day', mission: { type: 'airstrike', count: 3 }, monsters: ['lizard', 'spitter', 'jumper'], roamers: 10,
    boss: { model: 'mecha', name: 'MECHA GODZILLA', health: 700, size: 1.3, element: 'mecha', special: 'missiles' }, reward: 'KONG THROW' },
  { name: 'VOLCANO CRISIS', district: 'volcano', theme: 'volcano', mission: { type: 'nests', count: 5 }, monsters: ['lizard', 'spitter', 'brute', 'bomber'], roamers: 12,
    boss: { model: 'godzilla', name: 'GRANDPA GODZILLA', health: 820, size: 2.1, tint: 0xd9886a, element: 'lava', special: 'breath' }, unlocks: ['freeze'], reward: 'FIRE FISTS' },
  { name: 'SHADOW PARTS', district: 'downtown', theme: 'storm', mission: { type: 'collect', count: 6 }, monsters: ['lizard', 'jumper', 'spitter', 'brute'], roamers: 12,
    boss: { model: 'shadow', name: 'SHADOW GODZILLA', health: 860, size: 1.4, element: 'shadow', special: 'teleport' } },
  { name: 'MEGA SWAMP', district: 'harbor', theme: 'harbor', mission: { type: 'nests', count: 5 }, monsters: ['lizard', 'spitter', 'bomber'], roamers: 12,
    boss: { model: 'swamp', name: 'MEGA SWAMP GODZILLA', health: 950, size: 1.6, element: 'swamp', special: 'summon' } },
  { name: 'FROSTY NIGHT', district: 'residential', theme: 'night', mission: { type: 'rescue', count: 4 }, monsters: ['lizard', 'jumper', 'brute', 'spitter'], roamers: 13,
    boss: { model: 'ice', name: 'FROST GODZILLA', health: 1000, size: 1.6, element: 'ice', special: 'frost' } },
  { name: 'STORM BOMBERS', district: 'airport', theme: 'golden', mission: { type: 'airstrike', count: 4 }, monsters: ['lizard', 'bomber', 'jumper'], roamers: 12,
    boss: { model: 'thunder', name: 'STORM GODZILLA', health: 1050, size: 1.6, element: 'thunder', special: 'lightning' } },
  { name: 'SKYSCRAPER SAVE', district: 'downtown', theme: 'day', mission: { type: 'rooftop', count: 5 }, monsters: ['lizard', 'spitter', 'jumper', 'brute'], roamers: 14,
    boss: { model: 'mecha', name: 'MECHA KING', health: 1120, size: 1.6, element: 'mecha', special: 'missiles' } },
  { name: 'ARMY OF BRUTES', district: 'military', theme: 'storm', mission: { type: 'tank', count: 12 }, monsters: ['lizard', 'bomber', 'spitter'], roamers: 12,
    boss: { model: 'shadow', name: 'DARK GODZILLA', health: 1180, size: 1.7, element: 'shadow', special: 'teleport' } },
  { name: 'LAVA RESCUE', district: 'volcano', theme: 'volcano', mission: { type: 'rescue', count: 4 }, monsters: ['lizard', 'spitter', 'brute', 'bomber', 'jumper'], roamers: 14,
    boss: { model: 'godzilla', name: 'LAVA GODZILLA', health: 1250, size: 2.3, tint: 0xff8a5a, element: 'lava', special: 'breath' } },
  { name: 'DEEP SEA PARTS', district: 'harbor', theme: 'harbor', mission: { type: 'collect', count: 8 }, monsters: ['lizard', 'spitter', 'brute', 'jumper'], roamers: 14,
    boss: { model: 'godzilla', name: 'SEA GODZILLA', health: 1320, size: 2.3, tint: 0x5f8fd6, element: 'water', special: 'breath' } },
  { name: 'NIGHT NESTS', district: 'downtown', theme: 'night', mission: { type: 'nests', count: 6 }, monsters: ['lizard', 'jumper', 'bomber', 'brute'], roamers: 15,
    boss: { model: 'thunder', name: 'THUNDER KING', health: 1400, size: 1.9, element: 'thunder', special: 'lightning' } },
  { name: 'FINAL AIR STRIKE', district: 'airport', theme: 'storm', mission: { type: 'airstrike', count: 5 }, monsters: ['lizard', 'spitter', 'bomber', 'brute'], roamers: 14,
    boss: { model: 'mecha', name: 'ULTRA MECHA', health: 1500, size: 1.9, element: 'mecha', special: 'missiles' } },
  { name: 'MONSTER LAND', district: 'volcano', theme: 'volcano', mission: { type: 'nests', count: 7 }, monsters: ['lizard', 'spitter', 'brute', 'bomber', 'jumper'], roamers: 16,
    boss: { model: 'shadow', name: 'SHADOW KING', health: 1600, size: 2.1, element: 'shadow', special: 'teleport' } },
  { name: 'MAX GODZILLA', district: 'downtown', theme: 'storm', mission: { type: 'rescue', count: 4 }, monsters: ['lizard', 'spitter', 'brute', 'bomber', 'jumper'], roamers: 18,
    boss: { model: 'godzilla', name: 'MAX GODZILLA', health: 2200, size: 2.6, tint: 0xb08ad6, element: 'all', special: 'breath' }, reward: 'KONG FOREVER' },
];

/* What each boss is weak against (shown as "SUPER!" hits). fire = bazooka, tank shells and bombs. */
export const WEAKNESS = { water: 'shock', lava: 'ice', ice: 'fire', swamp: 'fire', thunder: 'ice', mecha: 'shock', shadow: 'fire' };

export const MISSION_TEXT = {
  rescue: { icon: '🏚️', goal: 'Free the people in the monster camps!' },
  nests: { icon: '🥚', goal: 'Blow up the monster nests!' },
  rooftop: { icon: '🪜', goal: 'Climb the ladders and save the people on the roofs!' },
  airstrike: { icon: '✈️', goal: 'Get a jet at the airport and bomb the monster bases!' },
  tank: { icon: '🪖', goal: 'Get a tank at the army base and stop the brute army!' },
  collect: { icon: '⚙️', goal: 'Grab the weapon parts the monsters are guarding!' },
};
