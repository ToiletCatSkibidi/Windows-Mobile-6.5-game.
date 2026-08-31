import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { PlaneDef } from "./types";

function paint(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    arr[j] = c.r;
    arr[j + 1] = c.g;
    arr[j + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  rx = 0,
  ry = 0,
  rz = 0,
) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return paint(g, hex);
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  hex: number,
  rx = 0,
  ry = 0,
  segs = 7,
) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, hex);
}

export type AircraftView = {
  root: THREE.Group;
  prop: THREE.Group;
  disc: THREE.Mesh;
};

export function buildAircraft(def: PlaneDef): AircraftView {
  const parts: THREE.BufferGeometry[] = [];
  const { fuse, wing, accent, cowl, strut } = def.colors;
  const mono = def.layout === "mono";
  const tri = def.layout === "triplane";
  const sesqui = def.layout === "sesqui";

  const fuseLen = mono ? 3.4 : 2.6;
  const fuseR = mono ? 0.28 : 0.32;
  parts.push(cyl(fuseR * 0.7, fuseR, fuseLen, 0, 0, 0, fuse, Math.PI / 2, 0, 8));
  parts.push(cyl(fuseR * 0.95, fuseR * 0.55, 0.7, 0, 0, fuseLen * 0.42, cowl, Math.PI / 2, 0, 8));
  parts.push(box(0.08, 0.08, 0.5, 0, 0, fuseLen * 0.55, 0x1a1814));

  const span = mono ? 4.6 : 3.6;
  const chord = mono ? 0.85 : 0.7;
  const thick = 0.07;

  const addWing = (y: number, spanMul: number, chordMul: number, zOff: number) => {
    const s = span * spanMul;
    const c = chord * chordMul;
    if (mono && def.id === "spitfire") {
      parts.push(box(s * 0.4, thick, c, 0, y, zOff, wing));
      parts.push(box(s * 0.32, thick * 0.9, c * 0.85, s * 0.28, y, zOff + 0.04, wing, 0, 0, 0.04));
      parts.push(box(s * 0.32, thick * 0.9, c * 0.85, -s * 0.28, y, zOff + 0.04, wing, 0, 0, -0.04));
      parts.push(box(s * 0.18, thick * 0.8, c * 0.55, s * 0.42, y, zOff + 0.08, wing, 0, 0, 0.1));
      parts.push(box(s * 0.18, thick * 0.8, c * 0.55, -s * 0.42, y, zOff + 0.08, wing, 0, 0, -0.1));
    } else {
      parts.push(box(s, thick, c, 0, y, zOff, wing));
      parts.push(box(s * 0.18, thick * 0.8, c * 0.7, s * 0.42, y, zOff + 0.02, wing, 0, 0, 0.08));
      parts.push(box(s * 0.18, thick * 0.8, c * 0.7, -s * 0.42, y, zOff + 0.02, wing, 0, 0, -0.08));
    }
    parts.push(box(0.34, 0.02, 0.34, s * 0.32, y + thick * 0.7, zOff, accent));
    parts.push(box(0.34, 0.02, 0.34, -s * 0.32, y + thick * 0.7, zOff, accent));
  };

  if (tri) {
    addWing(0.42, 0.85, 0.85, 0.1);
    addWing(0.08, 1, 1, 0.05);
    addWing(-0.26, 0.78, 0.8, 0.08);
  } else if (sesqui) {
    addWing(0.28, 1, 1, 0.05);
    addWing(-0.22, 0.62, 0.75, 0.1);
  } else if (mono) {
    addWing(-0.08, 1, 1, 0.05);
  } else {
    addWing(0.32, 1, 1, 0.05);
    addWing(-0.22, 0.95, 0.95, 0.08);
  }

  if (!mono) {
    const strutY0 = tri ? -0.26 : -0.22;
    const strutY1 = tri ? 0.42 : 0.32;
    for (const x of [-1.1, -0.55, 0.55, 1.1]) {
      parts.push(box(0.04, strutY1 - strutY0, 0.04, x, (strutY0 + strutY1) / 2, 0.05, strut));
    }
  }

  parts.push(box(0.08, 0.72, 0.42, 0, 0.42, -fuseLen * 0.42, wing));
  parts.push(box(1.35, 0.05, 0.38, 0, 0.12, -fuseLen * 0.42, wing));
  parts.push(box(0.22, 0.16, 0.42, 0, 0.28, 0.15, 0x1c2420));
  parts.push(box(0.28, 0.1, 0.18, 0, 0.38, 0.22, 0x8aa0b0));

  if (def.id === "mustang") {
    parts.push(box(0.28, 0.22, 0.7, 0, -0.32, -0.15, fuse));
  }
  if (def.id === "bf109") {
    parts.push(box(0.18, 0.12, 0.5, 0, 0.34, 0.55, accent));
  }

  parts.push(box(0.06, 0.42, 0.06, 0.22, -0.38, 0.35, strut));
  parts.push(box(0.06, 0.42, 0.06, -0.22, -0.38, 0.35, strut));
  parts.push(cyl(0.12, 0.12, 0.08, 0.28, -0.55, 0.35, 0x1a1814, 0, 0, 8));
  parts.push(cyl(0.12, 0.12, 0.08, -0.28, -0.55, 0.35, 0x1a1814, 0, 0, 8));
  parts.push(box(0.04, 0.22, 0.04, 0, -0.28, -fuseLen * 0.35, strut));

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("aircraft merge failed");
  merged.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const body = new THREE.Mesh(merged, mat);
  body.castShadow = false;

  const prop = new THREE.Group();
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x2a241c, flatShading: true });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 0.12), bladeMat);
  const blade2 = blade.clone();
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade, blade2);
  prop.position.z = fuseLen * 0.55 + 0.12;

  const discMat = new THREE.MeshBasicMaterial({
    color: 0xc9c4b0,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 16), discMat);
  disc.position.z = prop.position.z;
  disc.visible = false;

  const root = new THREE.Group();
  root.add(body, prop, disc);
  root.userData.defId = def.id;
  return { root, prop, disc };
}
