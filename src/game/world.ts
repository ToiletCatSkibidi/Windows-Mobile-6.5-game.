import * as THREE from "three";
import type { MissionDef } from "./types";

export const WORLD = 420;

export function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function heightAt(x: number, z: number) {
  const h =
    Math.sin(x * 0.018) * 4.5 +
    Math.cos(z * 0.014) * 5.5 +
    Math.sin((x + z) * 0.011) * 3.2 +
    Math.sin(x * 0.07) * 0.6;
  return Math.max(0.2, h);
}

export function makeTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 72, 72);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  paintTerrain(geo, "fields");
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return new THREE.Mesh(geo, mat);
}

export function paintTerrain(geo: THREE.BufferGeometry, biome: MissionDef["biome"]) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = hash(x * 0.07 + z * 0.13);
    let r = 0.28 + n * 0.1;
    let g = 0.38 + n * 0.12;
    let b = 0.18;
    if (biome === "ocean") {
      r = 0.08 + n * 0.04;
      g = 0.22 + n * 0.1;
      b = 0.28 + n * 0.12;
      if (y > 3.5) {
        r = 0.45 + n * 0.1;
        g = 0.5 + n * 0.08;
        b = 0.38;
      }
    } else if (biome === "dusk") {
      r = 0.22 + n * 0.08;
      g = 0.24 + n * 0.06;
      b = 0.14;
    } else {
      if (n > 0.62) {
        r = 0.42;
        g = 0.36;
        b = 0.18;
      }
      if (n < 0.18) {
        r = 0.2;
        g = 0.32;
        b = 0.16;
      }
    }
    const shade = 0.75 + Math.min(0.35, y * 0.03);
    cols[i * 3] = r * shade;
    cols[i * 3 + 1] = g * shade;
    cols[i * 3 + 2] = b * shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
}

export function makeTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.1, 5);
  const crownGeo = new THREE.ConeGeometry(0.85, 1.8, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1c, flatShading: true });
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f4a30, flatShading: true });
  const N = 70;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, N);
  const dummy = new THREE.Object3D();
  let i = 0;
  for (let k = 0; k < 200 && i < N; k++) {
    const x = (hash(k * 3.1) - 0.5) * WORLD * 0.85;
    const z = (hash(k * 7.7) - 0.5) * WORLD * 0.85;
    if (Math.hypot(x, z) < 28) continue;
    const y = heightAt(x, z);
    dummy.position.set(x, y + 0.55, z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, hash(k) * 6, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 1.6;
    dummy.scale.set(1 + hash(k + 2) * 0.4, 1 + hash(k + 4) * 0.5, 1);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    i += 1;
  }
  const g = new THREE.Group();
  g.add(trunks, crowns);
  return g;
}

export function makeClouds() {
  const geo = new THREE.SphereGeometry(1, 6, 5);
  geo.scale(6, 2.2, 4.5);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xf0ece4,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const N = 28;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    dummy.position.set((hash(i * 1.7) - 0.5) * 360, 48 + hash(i * 4.2) * 28, (hash(i * 2.9) - 0.5) * 360);
    dummy.scale.setScalar(0.8 + hash(i * 5.1) * 1.6);
    dummy.rotation.y = hash(i) * 6;
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  return mesh;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(480, 16, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x6ea0c8) },
      mid: { value: new THREE.Color(0xc9b898) },
      bot: { value: new THREE.Color(0xd8c8a8) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; void main(){ float h = normalize(vP).y; vec3 c = mix(bot, mid, smoothstep(-0.15, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.85, h)); gl_FragColor = vec4(c,1.0); }`,
  });
  return new THREE.Mesh(geo, mat);
}
