// Monster camps: a cage of people, concrete barriers, a red warning light and a light beam you can see from far away.
import * as THREE from 'three';
import { scene } from './engine.js';
import { tex } from './textures.js';
import { rnd } from './world.js';

const barMat = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.35, metalness: 0.9 });
const barrierMat = new THREE.MeshStandardMaterial({ map: tex('sidewalk'), color: 0xa9a49a, roughness: 0.9 });
const sandMat = new THREE.MeshStandardMaterial({ color: 0x6b5d45, roughness: 1 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 2 });
const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd866, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

export const CAGE = 3.6; // half-size of the cage

export function buildCage(center) {
  const g = new THREE.Group();
  g.position.copy(center);
  const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6);
  barGeo.translate(0, 1.7, 0);
  const sides = [];
  for (let side = 0; side < 4; side++) {
    const wall = new THREE.Group();
    for (let i = -6; i <= 6; i++) {
      const b = new THREE.Mesh(barGeo, barMat);
      b.position.set(i * (CAGE / 6), 0, 0); b.castShadow = true;
      wall.add(b);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CAGE * 2, 0.14, 0.14), barMat);
    rail.position.y = 3.4; wall.add(rail);
    const a = side * Math.PI / 2;
    wall.position.set(Math.sin(a) * CAGE, 0, Math.cos(a) * CAGE);
    wall.rotation.y = a;
    g.add(wall);
    sides.push(wall);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(CAGE * 2, 0.2, CAGE * 2), new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.6, metalness: 0.6 }));
  floor.position.y = 0.1; floor.receiveShadow = true; g.add(floor);
  // concrete barriers and sandbags around the camp
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(6.5, 7.2);
    const block = Math.random() < 0.5
      ? new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 0.7), barrierMat)
      : new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.4, 3, 8).rotateZ(Math.PI / 2), sandMat);
    block.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
    block.rotation.y = -a + Math.PI / 2;
    block.castShadow = block.receiveShadow = true;
    g.add(block);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampMat);
  lamp.position.set(CAGE, 3.6, CAGE); g.add(lamp);
  // the light beam starts above the people's heads so they stay easy to see
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 64, 20, 1, true), beamMat);
  beam.position.y = 5 + 32; g.add(beam);
  scene.add(g);
  return { g, sides, beam, lamp };
}

/* A tall light beam that marks a mission spot from far away. */
const beaconGeo = new THREE.CylinderGeometry(1.8, 1.8, 70, 18, 1, true).translate(0, 35 + 4, 0);
const beaconMats = {};
export function beacon(pos, color = 0xffd866) {
  if (!beaconMats[color]) beaconMats[color] = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const m = new THREE.Mesh(beaconGeo, beaconMats[color]);
  m.position.copy(pos);
  scene.add(m);
  return m;
}
