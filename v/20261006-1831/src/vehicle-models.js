// Vehicles built from shapes with realistic metal and paint (no model files needed): the Blue Angels jet, the army
// helicopter, the guided-missile truck, the aircraft carrier and the nuclear submarine. Each faces +Z with its
// wheels/keel at y = 0, like the loaded models.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { spawnModel, hasModel } from './models.js';

const mats = {};
function mat(key, opts) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ envMapIntensity: 0.6, ...opts });
  return mats[key];
}
const M = {
  blue:    () => mat('blue', { color: 0x041646, roughness: 0.3, metalness: 0.35, envMapIntensity: 0.35 }),
  yellow:  () => mat('yellow', { color: 0xf4c20d, roughness: 0.4, metalness: 0.3 }),
  canopy:  () => mat('canopy', { color: 0x2a2410, roughness: 0.05, metalness: 0.95 }),
  nozzle:  () => mat('nozzle', { color: 0x3a3632, roughness: 0.5, metalness: 0.9 }),
  olive:   () => mat('olive', { color: 0x3f4428, roughness: 0.7, metalness: 0.25 }),
  oliveDk: () => mat('oliveDk', { color: 0x2c301c, roughness: 0.75, metalness: 0.2 }),
  glass:   () => mat('glass', { color: 0x0e1a20, roughness: 0.05, metalness: 0.9 }),
  rubber:  () => mat('rubber', { color: 0x141414, roughness: 0.9, metalness: 0 }),
  steel:   () => mat('steel', { color: 0x6b7077, roughness: 0.4, metalness: 0.85 }),
  rotor:   () => mat('rotor', { color: 0x1c1d1f, roughness: 0.6, metalness: 0.4 }),
  navy:    () => mat('navy', { color: 0x5d646b, roughness: 0.6, metalness: 0.35 }),
  navyDk:  () => mat('navyDk', { color: 0x464c52, roughness: 0.65, metalness: 0.3 }),
  hullRed: () => mat('hullRed', { color: 0x6b2420, roughness: 0.8, metalness: 0.1 }),
  subHull: () => mat('subHull', { color: 0x0c0d0e, roughness: 0.7, metalness: 0.2, envMapIntensity: 0.2 }),
  white:   () => mat('white', { color: 0xe8e8e2, roughness: 0.5, metalness: 0.1 }),
  red:     () => mat('red', { color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 1.6 }),
  green:   () => mat('green', { color: 0x002200, emissive: 0x2aff4a, emissiveIntensity: 1.6 }),
};

function add(g, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
}
const rbox = (w, h, d, r = 0.1) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
const cyl = (r1, r2, h, s = 16) => new THREE.CylinderGeometry(r1, r2, h, s);
const alongZ = geo => geo.rotateX(Math.PI / 2);
/* A flat shape (points in x,z) extruded upward by `h`. */
function slab(points, h) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/* ---------- Blue Angels F/A-18: navy blue with yellow trim ---------- */
function blueAngel() {
  const g = new THREE.Group(), y = 1.9;
  add(g, alongZ(new THREE.CapsuleGeometry(0.95, 10, 6, 16)), M.blue(), 0, y, 0).scale.set(1, 0.85, 1);
  add(g, alongZ(cyl(0.02, 0.9, 3.4, 16)), M.blue(), 0, y, 7.6);                 // nose
  add(g, alongZ(cyl(0.05, 0.12, 0.6, 8)), M.yellow(), 0, y, 9.5);               // pitot tip
  add(g, new THREE.SphereGeometry(0.75, 16, 10), M.canopy(), 0, y + 0.75, 3.6).scale.set(0.8, 0.7, 2.2);
  add(g, rbox(2.6, 0.9, 7, 0.3), M.blue(), 0, y - 0.15, -0.6);                   // engine body
  for (const x of [-0.55, 0.55]) add(g, alongZ(cyl(0.48, 0.42, 0.9, 16)), M.nozzle(), x, y - 0.2, -4.6);
  // wings (swept) and the yellow leading edges
  const wing = slab([[0, 3.2], [6.2, -0.6], [6.2, -2.0], [0, -2.4]], 0.18);
  for (const s of [1, -1]) {
    const w = add(g, wing, M.blue(), 0, y - 0.25, 0); w.scale.x = s;
    const edge = add(g, slab([[0.4, 3.0], [6.2, -0.55], [6.2, -0.85], [0.4, 2.6]], 0.2), M.yellow(), 0, y - 0.24, 0); edge.scale.x = s;
    const st = add(g, slab([[0, -2.6], [3.0, -4.6], [3.0, -5.4], [0, -5.2]], 0.15), M.blue(), 0, y - 0.1, 0); st.scale.x = s; // tailplane
  }
  // twin canted tails with yellow tips
  for (const s of [1, -1]) {
    const tail = new THREE.Group();
    add(tail, slab([[0, 0.6], [0, -2.6], [2.4, -3.4], [2.4, -1.6]], 0.14), M.blue(), 0, 0, 0, 0, 0, Math.PI / 2);
    add(tail, rbox(0.16, 0.3, 1.6, 0.05), M.yellow(), 0, 2.35, -2.5);
    tail.position.set(s * 1.0, y + 0.3, -1.4); tail.rotation.z = -s * 0.35;
    g.add(tail);
  }
  // yellow stripe down the spine and the cheat line
  add(g, rbox(0.28, 0.06, 7.5, 0.03), M.yellow(), 0, y + 0.82, -0.8);
  for (const s of [1, -1]) add(g, rbox(0.06, 0.18, 9, 0.03), M.yellow(), s * 0.93, y, 1.6);
  // landing gear
  for (const [x, z] of [[0, 6], [-1.4, -1], [1.4, -1]]) { add(g, cyl(0.08, 0.08, 1.4, 6), M.steel(), x, 0.7, z); add(g, alongZ(cyl(0.35, 0.35, 0.3, 12)).rotateY(Math.PI / 2), M.rubber(), x, 0.35, z); }
  return g;
}

/* ---------- army helicopter ---------- */
function helicopter() {
  const g = new THREE.Group(), y = 1.9;
  add(g, alongZ(new THREE.CapsuleGeometry(1.35, 3.6, 6, 16)), M.olive(), 0, y, 0.6).scale.set(1, 0.95, 1);
  add(g, new THREE.SphereGeometry(1.25, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M.glass(), 0, y + 0.1, 2.6).scale.set(1, 0.9, 1.2);
  add(g, alongZ(cyl(0.35, 0.7, 6.5, 12)), M.olive(), 0, y + 0.45, -4.2);          // tail boom
  add(g, slab([[0, 0], [0, -1.8], [2.3, -2.2], [2.3, -1.2]], 0.14), M.oliveDk(), 0.07, y + 0.45, -6.4, 0, 0, Math.PI / 2); // fin
  add(g, slab([[0, 0], [1.6, -0.4], [1.6, -1.0], [0, -0.9]], 0.1), M.oliveDk(), 0, y + 0.5, -6.6);   // tailplane
  add(g, slab([[0, 0], [-1.6, -0.4], [-1.6, -1.0], [0, -0.9]], 0.1), M.oliveDk(), 0, y + 0.5, -6.6);
  add(g, rbox(1.6, 0.6, 2.2, 0.2), M.oliveDk(), 0, y + 1.35, 0.2);                // engine housing
  add(g, cyl(0.15, 0.15, 0.7, 8), M.steel(), 0, y + 1.9, 0.4);                    // mast
  // main rotor (spins) and tail rotor
  const rotor = new THREE.Group(); rotor.position.set(0, y + 2.25, 0.4);
  add(rotor, cyl(0.35, 0.35, 0.25, 12), M.steel());
  for (let i = 0; i < 4; i++) add(rotor, rbox(0.42, 0.06, 6.8, 0.03), M.rotor(), 0, 0, 0, 0, i * Math.PI / 2, 0).geometry.translate(0, 0, 3.4);
  g.add(rotor);
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.35, y + 1.2, -7.2);
  for (let i = 0; i < 2; i++) add(tailRotor, rbox(0.06, 2.0, 0.22, 0.03), M.rotor(), 0, 0, 0, i * Math.PI / 2);
  g.add(tailRotor);
  // skids and rocket pods
  for (const x of [-1.2, 1.2]) {
    add(g, alongZ(cyl(0.09, 0.09, 4.6, 8)), M.steel(), x, 0.1, 0.6);
    for (const z of [-0.6, 1.8]) add(g, cyl(0.07, 0.07, 1.0, 6), M.steel(), x * 0.85, 0.55, z, 0, 0, x * 0.2);
    add(g, alongZ(cyl(0.3, 0.3, 1.5, 10)), M.oliveDk(), x * 1.35, y - 0.3, 0.9);
    add(g, alongZ(cyl(0.22, 0.22, 0.05, 10)), M.rubber(), x * 1.35, y - 0.3, 1.66);
  }
  add(g, cyl(0.1, 0.1, 0.1, 8), M.red(), -1.4, y + 0.2, 0.6);
  add(g, cyl(0.1, 0.1, 0.1, 8), M.green(), 1.4, y + 0.2, 0.6);
  g.userData.rotor = rotor; g.userData.tailRotor = tailRotor;
  return g;
}

/* ---------- guided-missile truck (rocket launcher on a six-wheel army truck) ---------- */
function missileTruck() {
  const g = new THREE.Group();
  add(g, rbox(2.5, 0.6, 7.2, 0.1), M.oliveDk(), 0, 1.15, 0);                      // chassis
  add(g, rbox(2.5, 1.8, 2.2, 0.25), M.olive(), 0, 2.2, 2.6);                       // cab
  add(g, rbox(2.3, 0.7, 0.1, 0.05), M.glass(), 0, 2.6, 3.72);                      // windshield
  for (const s of [-1, 1]) add(g, rbox(0.08, 0.6, 1.2, 0.04), M.glass(), s * 1.26, 2.6, 2.7);
  // launcher pod: six missile tubes, tilted up
  const pod = new THREE.Group(); pod.position.set(0, 2.2, -1.2); pod.rotation.x = -0.32;
  add(pod, rbox(2.3, 1.5, 4.0, 0.12), M.olive());
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    add(pod, alongZ(cyl(0.28, 0.28, 0.06, 12)), M.rubber(), -0.7 + i * 0.7, -0.35 + j * 0.7, 2.02);
    add(pod, alongZ(new THREE.ConeGeometry(0.2, 0.3, 10)), M.white(), -0.7 + i * 0.7, -0.35 + j * 0.7, 1.9);
  }
  g.add(pod);
  for (const z of [2.6, -0.8, -2.6]) for (const s of [-1, 1]) {
    add(g, cyl(0.58, 0.58, 0.45, 16).rotateZ(Math.PI / 2), M.rubber(), s * 1.25, 0.58, z);
    add(g, cyl(0.28, 0.28, 0.47, 10).rotateZ(Math.PI / 2), M.steel(), s * 1.25, 0.58, z);
  }
  g.userData.pod = pod;
  return g;
}

/* ---------- aircraft carrier (deck 11 m above the water) ---------- */
export const CARRIER_DECK = 11;
export const CARRIER_SIZE = { halfBeam: 13, halfLength: 57 };
export const CARRIER_ISLAND = { x0: 7.5, x1: 12.6, z0: -10, z1: 12 };
function deckTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#34383c'; x.fillRect(0, 0, 256, 1024);
  for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; x.fillRect(Math.random() * 256, Math.random() * 1024, 2, 2); }
  x.strokeStyle = '#e8e3d0'; x.lineWidth = 3; x.setLineDash([24, 18]);
  x.beginPath(); x.moveTo(110, 1024); x.lineTo(110, 60); x.stroke();                  // take-off line
  x.strokeStyle = '#f2c94c'; x.setLineDash([]); x.lineWidth = 4;
  x.beginPath(); x.moveTo(40, 980); x.lineTo(150, 420); x.stroke();                 // angled landing line
  x.strokeStyle = '#e8e3d0'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(20, 980); x.lineTo(130, 420); x.moveTo(60, 980); x.lineTo(170, 420); x.stroke();
  x.fillStyle = '#e8e3d0'; x.font = 'bold 110px Arial'; x.textAlign = 'center'; x.fillText('77', 110, 200);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}
function carrier() {
  const g = new THREE.Group(), { halfBeam: B, halfLength: L } = CARRIER_SIZE, D = CARRIER_DECK;
  // hull: narrow at the waterline, flaring out to the deck, with a pointed bow
  const hullShape = [[-9, -L + 4], [9, -L + 4], [10, L - 22], [0, L - 2], [-10, L - 22]];
  add(g, slab(hullShape, D + 8), M.navyDk(), 0, -8, 0);
  add(g, slab(hullShape.map(([x, z]) => [x * 1.02, z * 1.01]), 1.6), M.hullRed(), 0, -1.4, 0); // red boot-top at the waterline
  // flight deck with its overhang to the left (angled deck)
  const deckShape = [[-B, -L], [B, -L], [B, L - 16], [3, L], [-6, L], [-B, L - 30], [-B - 4, -10], [-B - 4, -L + 8]];
  const deckGeo = slab(deckShape, 0.8);
  const uv = deckGeo.attributes.uv, pos = deckGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + B + 4) / (2 * B + 4), (pos.getZ(i) + L) / (2 * L));
  add(g, deckGeo, mat('deck', { map: deckTexture(), roughness: 0.85, metalness: 0.2 }), 0, D - 0.8, 0);
  // island (bridge tower) on the right
  const I = CARRIER_ISLAND;
  add(g, rbox(I.x1 - I.x0, 9, I.z1 - I.z0, 0.3), M.navy(), (I.x0 + I.x1) / 2, D + 4.5, (I.z0 + I.z1) / 2);
  add(g, rbox(I.x1 - I.x0 + 0.2, 1.2, I.z1 - I.z0 - 4, 0.1), M.glass(), (I.x0 + I.x1) / 2, D + 7.4, (I.z0 + I.z1) / 2 + 1);
  add(g, rbox(3.6, 4, 9, 0.2), M.navy(), (I.x0 + I.x1) / 2, D + 11, 3);
  add(g, cyl(0.25, 0.4, 9, 8), M.steel(), (I.x0 + I.x1) / 2, D + 17, 3);            // mast
  const radar = new THREE.Group(); radar.position.set((I.x0 + I.x1) / 2, D + 20, 3);
  add(radar, rbox(4, 1.2, 0.2, 0.05), M.white());
  g.add(radar);
  add(g, rbox(0.5, 0.5, 0.5, 0.1), M.red(), (I.x0 + I.x1) / 2, D + 21.8, 3);
  // number on the island and a door to the bridge
  add(g, rbox(0.1, 2.2, 1.4, 0.05), mat('door', { color: 0x2b2f33, roughness: 0.6, metalness: 0.5 }), I.x0 - 0.05, D + 1.1, 0);
  // deck lights along the edges
  for (let z = -L + 6; z < L - 18; z += 8) for (const x of [-B + 0.5, B - 0.5]) add(g, rbox(0.3, 0.12, 0.3, 0.05), z % 16 ? M.green() : M.red(), x, D + 0.06, z);
  g.userData.radar = radar;
  return g;
}

/* ---------- nuclear submarine ---------- */
function submarine() {
  const g = new THREE.Group();
  add(g, alongZ(new THREE.CapsuleGeometry(2.4, 26, 8, 20)), M.subHull(), 0, 0, 0).scale.set(1, 0.92, 1);
  add(g, rbox(1.6, 3.6, 5.5, 0.6), M.subHull(), 0, 3.4, 5);                         // sail (tower)
  for (const s of [-1, 1]) add(g, rbox(3.2, 0.18, 1.4, 0.08), M.subHull(), s * 2.2, 4.0, 5.6);  // sail planes
  for (const s of [-1, 1]) add(g, rbox(3.4, 0.2, 2.2, 0.1), M.subHull(), s * 2.5, 0, -13);     // stern planes
  for (const s of [-1, 1]) add(g, rbox(0.2, 3.0, 2.2, 0.1), M.subHull(), 0, s * 2.2, -13);     // rudders
  const prop = new THREE.Group(); prop.position.set(0, 0, -15.6);
  for (let i = 0; i < 7; i++) add(prop, rbox(0.25, 1.6, 0.12, 0.05), M.nozzle(), 0, 0, 0, 0, 0, (i / 7) * Math.PI * 2).geometry.translate(0, 0.8, 0);
  g.add(prop);
  for (let i = 0; i < 6; i++) add(g, rbox(1.1, 0.12, 1.1, 0.05), M.navyDk(), 0, 2.2, -2 - i * 1.7); // missile hatches
  add(g, cyl(0.06, 0.06, 2.4, 6), M.steel(), 0.3, 6.2, 5.6);                           // periscope
  g.userData.prop = prop;
  return g;
}

const BUILD = { blueangel: blueAngel, heli: helicopter, missile: missileTruck, carrier, sub: submarine };
export const proceduralTypes = Object.keys(BUILD);

/* Realistic model files for these vehicles (add them to MODEL_SPECS in models.js). When one is loaded it replaces the shape-built body;
   moving parts (rotors) are still built here so they can spin. */
const MODEL_FOR = { heli: 'heli', blueangel: 'blueangel', sub: 'sub', carrier: 'carrier' };

const _box = new THREE.Box3(), _ray = new THREE.Raycaster();
function boundsOf(obj) { obj.updateMatrixWorld(true); return _box.setFromObject(obj).clone(); }

/* Height of the model's surface under (x, z), so the carrier's flight deck lines up with the walkable deck. */
function surfaceY(obj, x, z) {
  obj.updateMatrixWorld(true);
  _ray.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
  const hit = _ray.intersectObject(obj, true)[0];
  return hit ? hit.point.y : null;
}

function fitModel(type) {
  const m = spawnModel(MODEL_FOR[type]);
  const g = new THREE.Group();
  g.add(m.root);
  if (type === 'carrier') {
    const deck = surfaceY(m.root, -4, -30);
    if (deck !== null) m.root.position.y += CARRIER_DECK - deck;
    const radar = new THREE.Object3D(); g.add(radar); g.userData.radar = radar;
  } else if (type === 'sub') {
    m.root.position.y -= boundsOf(m.root).getCenter(new THREE.Vector3()).y; // hull centre on the waterline like the built one
    const prop = new THREE.Object3D(); g.add(prop); g.userData.prop = prop;
  } else if (type === 'heli') {
    // the spinning rotors come from the built helicopter, moved onto the model's mast and tail
    const built = helicopter(), b = boundsOf(m.root);
    const { rotor, tailRotor } = built.userData;
    rotor.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.1, (b.min.z + b.max.z) / 2 + (b.max.z - b.min.z) * 0.087); // the model's hub sits a little forward
    tailRotor.position.set(0.45, b.min.y + (b.max.y - b.min.y) * 0.78, b.min.z + 0.5);
    g.add(rotor, tailRotor);
    g.userData.rotor = rotor; g.userData.tailRotor = tailRotor;
  }
  return g;
}

/* Same shape as spawnModel() returns, so vehicles don't care where their model came from. */
export function buildVehicleModel(type) {
  const fromFile = MODEL_FOR[type] && hasModel(MODEL_FOR[type]);
  const g = fromFile ? fitModel(type) : BUILD[type]();
  const root = new THREE.Group();
  root.add(g);
  return { root, anim: null, materials: [], bones: {}, procedural: true, parts: g.userData };
}
