// Photo textures for the city (made with Higgsfield) plus small procedural ones for smoke, glow and water.
import * as THREE from 'three';
import { renderer } from './engine.js';

const loader = new THREE.TextureLoader();
const cache = {};
const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

export function tex(name, { color = true, mirror = false } = {}) {
  const key = name + (mirror ? ':m' : '');
  if (cache[key]) return cache[key];
  const t = loader.load(`assets/textures/${name}.webp`, () => {
    t.userData.loaded = true;
    for (const c of t.userData.clones) c.needsUpdate = true;
  }, undefined, () => console.warn('texture missing:', name));
  t.userData.clones = [];
  t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  if (color) t.encoding = THREE.sRGBEncoding;
  cache[key] = t;
  return t;
}

/* A texture with its own repeat (textures share the image, so cloning is cheap). */
export function texRepeat(name, rx, ry, opts) {
  const base = tex(name, opts);
  const t = base.clone();
  t.userData = {};
  t.repeat.set(rx, ry);
  // a copy made before the image arrives must be re-uploaded once it does
  if (base.userData.loaded) t.needsUpdate = true;
  else base.userData.clones.push(t);
  return t;
}

function canvasTex(size, draw, { color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (color) t.encoding = THREE.sRGBEncoding;
  return t;
}

/* Soft puffy smoke/dust sprite. */
export const smokeTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 18; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.35, y = s / 2 + (Math.random() - 0.5) * s * 0.35, r = s * (0.18 + Math.random() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.22)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }
});

/* Hot round glow for muzzle flashes, sparks, fire and lava. */
export const glowTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

/* Gentle ripple normal map for harbor water. */
export const waterNormal = (() => {
  const t = canvasTex(256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const a = (x / s) * Math.PI * 2, b = (y / s) * Math.PI * 2;
      const dx = Math.cos(a * 3 + b) * 0.5 + Math.cos(a * 7 - b * 2) * 0.3;
      const dy = Math.cos(b * 4 - a) * 0.5 + Math.cos(b * 9 + a * 3) * 0.25;
      const i = (y * s + x) * 4;
      img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { color: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

/* Painted road lines. */
export const laneTex = canvasTex(64, (g, s) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s * 0.55);
});
laneTex.wrapS = laneTex.wrapT = THREE.RepeatWrapping;

/* Comic-style words that pop up ("POW!"). */
const wordCache = {};
export function wordTexture(text, fill) {
  const key = text + fill;
  if (wordCache[key]) return wordCache[key];
  const t = canvasTex(256, (g) => {
    g.font = '64px "Russo One", "Arial Black", Impact, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,14,0.9)'; g.strokeText(text, 128, 128);
    g.fillStyle = fill; g.fillText(text, 128, 128);
  });
  return (wordCache[key] = t);
}
