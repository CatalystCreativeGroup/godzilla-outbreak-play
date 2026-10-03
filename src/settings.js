/* =====================================================================
   GAME SETTINGS — change these numbers to design your own game!
   ===================================================================== */
export const GAME = {
  hero:  { name: 'JOSEPH', hearts: 6, speed: 9, jump: 10, range: 26, maxArmor: 6 },
  kong:  { name: 'KING KONG', seconds: 18, speed: 13, punchDamage: 10, punchRange: 11, roarStun: 2.5, roarCooldown: 8 },
  army:  { maxSize: 10, hearts: 4, range: 22, fireRate: 0.55, damage: 1, getUpSeconds: 6 },
  power: { perMonster: 5, perPerson: 8, perZapOnBoss: 0.5 },
  loot:  { dropChance: 0.4 },
  monsters: { lizardHp: 3, spitterHp: 4, bruteHp: 14, speed: 4.2, aggroRange: 16 },
  controls: { lookSpeed: 1, aimHelp: 1, startView: 'first' }, // aimHelp 0 = no help aiming, 2 = lots of help
  difficulty: 1, // 0.7 = easier, 1.5 = harder
};

/* Weapons Joseph can find. damage per bullet, rate = seconds between shots. */
export const WEAPONS = {
  blaster:   { name: 'BLASTER',    icon: '🔫', damage: 1,   rate: 0.26, speed: 55, pellets: 1, spread: 0.02, color: 0x6ff6ff, range: 34 },
  rifle:     { name: 'AUTO RIFLE', icon: '⚡', damage: 0.6, rate: 0.07, speed: 80, pellets: 1, spread: 0.06, color: 0xffc860, range: 38 },
  shotgun:   { name: 'SHOTGUN',    icon: '💥', damage: 0.9, rate: 0.75, speed: 60, pellets: 7, spread: 0.28, color: 0xffe0a0, range: 20 },
  bazooka:   { name: 'BAZOOKA',    icon: '🚀', damage: 7,   rate: 1.1,  speed: 32, pellets: 1, spread: 0,    color: 0xff8a3d, range: 42, splash: 6 },
  lightning: { name: 'LIGHTNING',  icon: '🌩️', damage: 1.6, rate: 0.45, speed: 0,  pellets: 1, spread: 0,    color: 0xb8a8ff, range: 30, chain: 3, element: 'shock' },
  freeze:    { name: 'FREEZE RAY', icon: '❄️', damage: 0.7, rate: 0.14, speed: 60, pellets: 1, spread: 0.03, color: 0xaef4ff, range: 30, slow: 2, element: 'ice' },
};
export const MAX_WEAPON_LEVEL = 5;
export const MAX_RATE_LEVEL = 5;

/* The cities. Each camp has monster guards and people to free. */
export const CITIES = [
  {
    id: 'starter', name: 'STARTER CITY', theme: 'day', unlocks: ['rifle', 'shotgun'],
    camps: [{ guards: 3, people: 2 }, { guards: 4, people: 2 }, { guards: 5, people: 3 }],
    roamers: 5, monsterTypes: ['lizard'],
    boss: { id: 'baby', name: 'BABY GODZILLA', health: 260, speed: 5, size: 1, tint: null, element: 'normal', reward: 'GROUND POUND' },
  },
  {
    id: 'downtown', name: 'DOWNTOWN', theme: 'golden', unlocks: ['bazooka'],
    camps: [{ guards: 5, people: 2 }, { guards: 6, people: 3 }, { guards: 7, people: 3 }],
    roamers: 7, monsterTypes: ['lizard', 'lizard', 'spitter'],
    boss: { id: 'kid', name: 'KID GODZILLA', health: 420, speed: 5.5, size: 1.35, tint: 0x9fb39a, element: 'normal', reward: 'KONG THROW' },
  },
  {
    id: 'harbor', name: 'HARBOR CITY', theme: 'harbor', unlocks: ['lightning'],
    camps: [{ guards: 6, people: 3 }, { guards: 7, people: 3 }, { guards: 8, people: 3 }, { guards: 8, people: 3 }],
    roamers: 8, monsterTypes: ['lizard', 'spitter', 'brute'],
    boss: { id: 'adult', name: 'ADULT GODZILLA', health: 620, speed: 6, size: 1.7, tint: 0x7fa9d6, element: 'water', reward: 'WATER ARMOR' },
  },
  {
    id: 'volcano', name: 'VOLCANO CITY', theme: 'volcano', unlocks: ['freeze'],
    camps: [{ guards: 7, people: 3 }, { guards: 8, people: 3 }, { guards: 9, people: 4 }, { guards: 10, people: 4 }],
    roamers: 10, monsterTypes: ['lizard', 'spitter', 'brute', 'brute'],
    boss: { id: 'grandpa', name: 'GRANDPA GODZILLA', health: 860, speed: 6.2, size: 2.1, tint: 0xd9886a, element: 'lava', reward: 'FIRE FISTS' },
  },
  {
    id: 'final', name: 'FINAL BATTLE', theme: 'storm', unlocks: [],
    camps: [{ guards: 9, people: 3 }, { guards: 10, people: 4 }, { guards: 12, people: 4 }],
    roamers: 12, monsterTypes: ['lizard', 'spitter', 'brute'],
    boss: { id: 'max', name: 'MAX GODZILLA', health: 1300, speed: 6.6, size: 2.5, tint: 0xb08ad6, element: 'all', reward: 'KONG FOREVER' },
  },
];
