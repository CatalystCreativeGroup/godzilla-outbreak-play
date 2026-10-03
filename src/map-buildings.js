// Draws hundreds of buildings cheaply: one instanced mesh per facade style per map chunk.
// Windows are mapped from world position, so every building keeps real-size windows whatever its shape.
import * as THREE from 'three';
import { tex } from './textures.js';

export const FACADES = {
  glass:    { tex: 'facade_glass',    tile: 12, roughness: 0.18, metalness: 0.55, debris: 0x8fa3b5 },
  concrete: { tex: 'facade_concrete', tile: 12, roughness: 0.85, metalness: 0.0,  debris: 0xc9bfae },
  brick:    { tex: 'facade_brick',    tile: 10, roughness: 0.9,  metalness: 0.0,  debris: 0x9a5444 },
};
const CHUNK = 160;

// unit box standing on the ground, regrouped into two draw groups: walls (0) and roof/floor (1)
const unitBox = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const idx = g.index.array, faces = i => Array.from(idx.slice(i * 6, i * 6 + 6));
  g.setIndex([...faces(0), ...faces(1), ...faces(4), ...faces(5), ...faces(2), ...faces(3)]); // +x -x +z -z | +y -y
  g.clearGroups();
  g.addGroup(0, 24, 0);
  g.addGroup(24, 12, 1);
  return g;
})();

function facadeMaterial(style) {
  const f = FACADES[style];
  const m = new THREE.MeshStandardMaterial({ map: tex(f.tex), roughness: f.roughness, metalness: f.metalness });
  m.onBeforeCompile = shader => {
    shader.uniforms.tileSize = { value: f.tile };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        vWorldP = (modelMatrix * wp).xyz;
        vWorldN = normalize(mat3(modelMatrix) * wn);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nvarying vec3 vWorldN;\nuniform float tileSize;')
      .replace('#include <map_fragment>', `
        vec2 wuv = abs(vWorldN.x) > 0.5 ? vec2(vWorldP.z * sign(vWorldN.x), vWorldP.y) : vec2(-vWorldP.x * sign(vWorldN.z), vWorldP.y);
        vec4 sampledDiffuseColor = texture2D(map, wuv / tileSize);
        diffuseColor *= sampledDiffuseColor;`);
  };
  m.customProgramCacheKey = () => 'facade-' + style;
  return m;
}

let roofMat = null, capMat = null, facadeMats = null;
function materials() {
  if (!facadeMats) {
    facadeMats = Object.fromEntries(Object.keys(FACADES).map(s => [s, facadeMaterial(s)]));
    roofMat = new THREE.MeshStandardMaterial({ map: tex('roof'), roughness: 0.95 });
    capMat = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.9 });
  }
  return { facadeMats, roofMat, capMat };
}

const dummy = new THREE.Object3D();
function setMatrix(mesh, i, b, scaleY = 1) {
  dummy.position.set(b.cx, 0, b.cz);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(b.hw * 2, Math.max(0.001, b.h * scaleY), b.hd * 2);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
function setCapMatrix(mesh, i, b, scaleY = 1) {
  dummy.position.set(b.cx, b.h * scaleY, b.cz);
  dummy.scale.set(b.hw * 2 + 0.4, scaleY > 0.01 ? 0.6 : 0.001, b.hd * 2 + 0.4);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}

/* Build the instanced meshes for a list of buildings; each building gets b.mesh/b.index/b.cap/b.capIndex. */
export function buildBuildingMeshes(group, buildings) {
  const { facadeMats, roofMat, capMat } = materials();
  const buckets = new Map();
  for (const b of buildings) {
    const key = `${Math.floor(b.cx / CHUNK)},${Math.floor(b.cz / CHUNK)}`;
    if (!buckets.has(key)) buckets.set(key, { styles: {}, all: [] });
    const bucket = buckets.get(key);
    (bucket.styles[b.style] ||= []).push(b);
    bucket.all.push(b);
  }
  for (const bucket of buckets.values()) {
    for (const [style, list] of Object.entries(bucket.styles)) {
      const side = facadeMats[style];
      const mesh = new THREE.InstancedMesh(unitBox, [side, roofMat], list.length);
      list.forEach((b, i) => { b.mesh = mesh; b.index = i; setMatrix(mesh, i, b); });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false; // r149 instanced meshes have no per-instance bounds
      group.add(mesh);
    }
    const caps = new THREE.InstancedMesh(unitBox, capMat, bucket.all.length);
    bucket.all.forEach((b, i) => { b.cap = caps; b.capIndex = i; setCapMatrix(caps, i, b); });
    caps.castShadow = true;
    caps.frustumCulled = false;
    group.add(caps);
  }
}

/* Squash a building to a fraction of its height (crumbling) or hide it (0). */
export function setBuildingHeight(b, scaleY) {
  setMatrix(b.mesh, b.index, b, scaleY);
  setCapMatrix(b.cap, b.capIndex, b, scaleY);
  b.mesh.instanceMatrix.needsUpdate = true;
  b.cap.instanceMatrix.needsUpdate = true;
}
