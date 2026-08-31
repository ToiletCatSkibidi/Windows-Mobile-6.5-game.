import * as THREE from "three";
import { buildAircraft, type AircraftView } from "./aircraft";
import { GameAudio } from "./audio";
import { Input } from "./input";
import { missionById } from "./missions";
import { planeById, PLANES } from "./planes";
import type {
  Actions,
  Debrief,
  EnemyKind,
  GameEvent,
  GameHandle,
  HudSnap,
  MissionDef,
  PlaneId,
  RadarBlip,
  SaveData,
  Settings,
} from "./types";
import { heightAt, makeClouds, makeSky, makeTerrain, makeTrees, paintTerrain, WORLD } from "./world";

export type { GameHandle };

const FIXED = 1 / 60;
const BULLET_MAX = 80;
const FX_MAX = 90;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _proj = new THREE.Vector3();

type Mode = "attract" | "hangar" | "play";
type Craft = {
  id: number;
  kind: EnemyKind | "player";
  planeId: PlaneId;
  view: AircraftView;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  hp: number;
  maxHp: number;
  ammo: number;
  maxAmmo: number;
  reload: number;
  fireCd: number;
  ai: number;
  aim: number;
  alive: boolean;
  isAce: boolean;
};
type Bullet = {
  live: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  fromPlayer: boolean;
  dmg: number;
};
type Fx = {
  live: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  scale: number;
};

function fwd(c: Craft, out: THREE.Vector3) {
  const cp = Math.cos(c.pitch);
  return out.set(-Math.sin(c.yaw) * cp, Math.sin(c.pitch), -Math.cos(c.yaw) * cp);
}

function disposeView(v: AircraftView) {
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export function createGame(opts: {
  canvas: HTMLCanvasElement;
  save: SaveData;
  onHud: (s: HudSnap) => void;
  onEvent: (e: GameEvent) => void;
}): GameHandle {
  const { canvas, onHud, onEvent } = opts;
  const input = new Input();
  const detachKeys = input.attach();
  const audio = new GameAudio();
  input.invertY = opts.save.settings.invertY;
  input.sensitivity = opts.save.settings.sensitivity;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x6a8aaa, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8aa6b8, 70, 280);
  const camera = new THREE.PerspectiveCamera(58, 240 / 400, 0.2, 520);
  const camPos = new THREE.Vector3(0, 12, 18);
  camera.position.copy(camPos);
  const hemi = new THREE.HemisphereLight(0xc9d8e8, 0x3a4a32, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 1.15);
  sun.position.set(-40, 60, 20);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x6a7060, 0.25));

  const sky = makeSky();
  scene.add(sky);
  const terrain = makeTerrain();
  scene.add(terrain);
  const trees = makeTrees();
  scene.add(trees);
  const clouds = makeClouds();
  scene.add(clouds);

  const bulletMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.9, 4),
    new THREE.MeshBasicMaterial({ color: 0xffe6a0 }),
    BULLET_MAX,
  );
  bulletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bulletMesh.frustumCulled = false;
  scene.add(bulletMesh);
  const fxMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.35, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffaa55, transparent: true, opacity: 0.85, depthWrite: false }),
    FX_MAX,
  );
  fxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fxMesh.frustumCulled = false;
  scene.add(fxMesh);

  const bullets: Bullet[] = Array.from({ length: BULLET_MAX }, () => ({
    live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, fromPlayer: false, dmg: 1,
  }));
  const fx: Fx[] = Array.from({ length: FX_MAX }, () => ({
    live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, scale: 1,
  }));

  let mode: Mode = "attract";
  let paused = false;
  let mission: MissionDef | null = null;
  let arcade = false;
  let arcadeWave = 0;
  let settings: Settings = { ...opts.save.settings };
  let nextId = 1;
  const crafts: Craft[] = [];
  let player: Craft | null = null;
  let hangarView: AircraftView | null = null;
  let hangarSpin = 0;
  let kills = 0;
  let needed = 0;
  let missionTime = 0;
  let trauma = 0;
  let hitstop = 0;
  let message: string | null = null;
  let messageT = 0;
  let outcome: "none" | "win" | "lose" = "none";
  let hudClock = 0;
  let boost = 1;
  const dummy = new THREE.Object3D();
  const timer = new THREE.Timer();
  let acc = 0;
  let running = true;
  let attractT = 0;

  function resize() {
    const w = canvas.clientWidth || 240;
    const h = canvas.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function setBiome(b: MissionDef["biome"]) {
    const u = (sky.material as THREE.ShaderMaterial).uniforms;
    if (b === "ocean") {
      u.top.value.set(0x4a88b8); u.mid.value.set(0x9ec0d0); u.bot.value.set(0xb8d0d8);
      (scene.fog as THREE.Fog).color.set(0x7aa8c0);
      renderer.setClearColor(0x4a88b8);
      hemi.groundColor.set(0x1a3a40);
      trees.visible = false;
    } else if (b === "dusk") {
      u.top.value.set(0x2a3a68); u.mid.value.set(0xc07050); u.bot.value.set(0xd8a070);
      (scene.fog as THREE.Fog).color.set(0xa07068);
      renderer.setClearColor(0x2a3a68);
      hemi.groundColor.set(0x3a2a20);
      sun.color.set(0xffb080); sun.intensity = 0.85;
      trees.visible = true;
    } else {
      u.top.value.set(0x6ea0c8); u.mid.value.set(0xc9b898); u.bot.value.set(0xd8c8a8);
      (scene.fog as THREE.Fog).color.set(0x8aa6b8);
      renderer.setClearColor(0x6a8aaa);
      hemi.groundColor.set(0x3a4a32);
      sun.color.set(0xffe6c4); sun.intensity = 1.15;
      trees.visible = true;
    }
    paintTerrain(terrain.geometry as THREE.BufferGeometry, b);
  }

  function clearCrafts() {
    for (const c of crafts) { scene.remove(c.view.root); disposeView(c.view); }
    crafts.length = 0;
    player = null;
    if (hangarView) { scene.remove(hangarView.root); disposeView(hangarView); hangarView = null; }
    for (const b of bullets) b.live = false;
    for (const f of fx) f.live = false;
  }

  function spawnCraft(kind: EnemyKind | "player", planeId: PlaneId, x: number, y: number, z: number, yaw: number): Craft {
    const def = planeById(planeId);
    const view = buildAircraft(def);
    scene.add(view.root);
    const hpMul = kind === "bomber" ? 3.2 : kind === "ace" ? 2.4 : kind === "drone" ? 0.7 : 1;
    const hp = 18 * def.armor * hpMul;
    const c: Craft = {
      id: nextId++, kind, planeId, view, x, y, z, yaw, pitch: 0, roll: 0,
      speed: def.speed * (kind === "bomber" ? 0.55 : kind === "drone" ? 0.5 : 0.72),
      hp, maxHp: hp, ammo: def.ammo, maxAmmo: def.ammo, reload: 0, fireCd: 0,
      ai: Math.random() * 6.28, aim: 0, alive: true, isAce: kind === "ace",
    };
    crafts.push(c);
    return c;
  }

  function say(text: string) { message = text; messageT = 2.4; onEvent({ type: "message", text }); }

  function spawnWave(kind: EnemyKind, n: number, plane?: PlaneId) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 50;
      const px = player ? player.x : 0;
      const pz = player ? player.z : 0;
      const pid = plane ?? (kind === "bomber" ? "spad" : kind === "drone" ? "camel" : PLANES[(i + 2) % PLANES.length]!.id);
      spawnCraft(kind, pid, px + Math.cos(ang) * dist, 22 + Math.random() * 18, pz + Math.sin(ang) * dist, ang + Math.PI);
    }
  }

  function spawnArcadeWave() {
    arcadeWave += 1;
    spawnWave("fighter", 2 + Math.min(6, arcadeWave), arcadeWave % 2 === 0 ? "bf109" : "albatros");
    if (arcadeWave % 4 === 0) spawnWave("bomber", 1);
    if (arcadeWave % 5 === 0) spawnWave("ace", 1, "fokker");
    needed = 999;
    say(`Oleada ${arcadeWave}`);
  }

  function startPlay(plane: PlaneId, m: MissionDef | null, isArcade: boolean) {
    clearCrafts();
    mode = "play"; paused = false; arcade = isArcade; arcadeWave = 0; mission = m;
    kills = 0; missionTime = 0; trauma = 0; hitstop = 0; outcome = "none"; boost = 1;
    setBiome(m?.biome ?? "fields");
    player = spawnCraft("player", plane, 0, 28, 40, 0);
    player.speed = planeById(plane).speed * 0.78;
    needed = m ? (m.goal.kind === "kills" || m.goal.kind === "bombers" ? m.goal.n : 1) : 999;
    if (m) { for (const w of m.waves) spawnWave(w.kind, w.n, w.plane); say(m.hint); }
    else { spawnArcadeWave(); say("Arcade · sobrevive"); }
    wireProbe();
  }

  function fireFrom(c: Craft, fromPlayer: boolean) {
    if (c.fireCd > 0 || c.ammo <= 0) return;
    const def = planeById(c.planeId);
    c.fireCd = fromPlayer ? 0.09 : c.kind === "bomber" ? 0.28 : 0.16;
    c.ammo -= 1;
    if (c.ammo <= 0) c.reload = 2.2;
    fwd(c, _v);
    const b = bullets.find((x) => !x.live);
    if (!b) return;
    b.live = true;
    b.x = c.x + _v.x * 2.2; b.y = c.y + _v.y * 2.2; b.z = c.z + _v.z * 2.2;
    const spd = c.speed + 92;
    b.vx = _v.x * spd; b.vy = _v.y * spd; b.vz = _v.z * spd;
    b.life = 1.15; b.fromPlayer = fromPlayer;
    b.dmg = 4.2 * def.firepower * (c.kind === "ace" ? 1.25 : 1);
    if (fromPlayer) audio.gun();
  }

  function burst(x: number, y: number, z: number, n: number, power: number) {
    let left = n;
    for (const f of fx) {
      if (left <= 0) break;
      if (f.live) continue;
      f.live = true;
      f.x = x; f.y = y; f.z = z;
      f.vx = (Math.random() - 0.5) * power;
      f.vy = Math.random() * power * 0.7;
      f.vz = (Math.random() - 0.5) * power;
      f.life = 0.35 + Math.random() * 0.5;
      f.max = f.life;
      f.scale = 0.4 + Math.random() * 1.4;
      left -= 1;
    }
  }

  function killCraft(c: Craft, byPlayer: boolean) {
    if (!c.alive) return;
    c.alive = false;
    burst(c.x, c.y, c.z, 18, 18);
    audio.explosion();
    if (settings.shake) trauma = Math.min(1, trauma + 0.55);
    hitstop = 0.06;
    c.view.root.visible = false;
    if (byPlayer && c.kind !== "player") {
      kills += 1;
      onEvent({ type: "kill", total: kills });
      if (c.isAce) say("As derribado");
    }
  }

  function finish(win: boolean) {
    if (outcome !== "none") return;
    outcome = win ? "win" : "lose";
    const debrief: Debrief = {
      win,
      title: win ? (arcade ? "Cielo limpio" : "Misión cumplida") : "Derribado",
      kills, time: missionTime,
      damage: player ? 1 - player.hp / player.maxHp : 1,
      score: Math.floor(kills * 140 + missionTime * 2 + (win ? 400 : 0)),
      medal: win && mission?.id === 3 ? "baron" : win && kills >= 5 ? "ace" : win ? "wings" : null,
      missionId: arcade ? "arcade" : (mission?.id ?? 1),
    };
    window.setTimeout(() => onEvent({ type: win ? "win" : "lose", debrief }), 200);
  }

  function orient(c: Craft) {
    fwd(c, _v);
    _v2.set(0, 1, 0);
    _v3.crossVectors(_v, _v2).normalize();
    if (_v3.lengthSq() < 1e-4) _v3.set(1, 0, 0);
    _v2.crossVectors(_v3, _v).normalize();
    _q.setFromAxisAngle(_v, c.roll);
    _v2.applyQuaternion(_q);
    c.view.root.position.set(c.x, c.y, c.z);
    c.view.root.up.copy(_v2);
    c.view.root.lookAt(c.x + _v.x, c.y + _v.y, c.z + _v.z);
  }

  function aiCraft(c: Craft, dt: number, maxSpd: number) {
    if (!player || !player.alive) { c.yaw += 0.2 * dt; return; }
    const tx = player.x - c.x, ty = player.y - c.y, tz = player.z - c.z;
    const dist = Math.hypot(tx, ty, tz);
    fwd(c, _v);
    let wantYaw: number;
    let wantPitch: number;
    if (c.kind === "bomber") {
      wantYaw = c.yaw + 0.15 * dt; wantPitch = 0.02; c.ai += dt;
      if (dist < 90) fireFrom(c, false);
    } else {
      const intercept = 0.35 + dist / 180;
      const px = player.x + -Math.sin(player.yaw) * player.speed * intercept;
      const pz = player.z + -Math.cos(player.yaw) * player.speed * intercept;
      wantYaw = Math.atan2(-(px - c.x), -(pz - c.z));
      wantPitch = Math.atan2(player.y - c.y, Math.hypot(px - c.x, pz - c.z));
      if (c.hp < c.maxHp * 0.35) { wantYaw += 1.2; wantPitch = -0.25; }
      const los = _v.dot(_v2.set(tx, ty, tz).normalize());
      c.aim = los;
      if (los > 0.88 && dist < (c.kind === "drone" ? 42 : 70)) fireFrom(c, false);
    }
    let dyaw = wantYaw - c.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = 1.1 * planeById(c.planeId).turn * (c.kind === "ace" ? 1.25 : c.kind === "drone" ? 0.55 : 1);
    c.yaw += Math.max(-turn * dt, Math.min(turn * dt, dyaw));
    c.pitch += (wantPitch - c.pitch) * 1.6 * dt;
    c.roll += (Math.max(-0.8, Math.min(0.8, -dyaw * 1.4)) - c.roll) * 3 * dt;
    c.speed += (maxSpd * 0.8 - c.speed) * 0.8 * dt;
    if (c.y < 14) c.pitch += 0.8 * dt;
  }

  function stepCraft(c: Craft, dt: number, act: Actions | null) {
    const def = planeById(c.planeId);
    const maxSpd = def.speed * (c.kind === "bomber" ? 0.62 : 1);
    if (c.kind === "player" && act) {
      c.roll += act.roll * 2.35 * def.turn * dt;
      c.pitch += act.pitch * 1.55 * def.climb * dt;
      c.roll = Math.max(-1.05, Math.min(1.05, c.roll));
      c.pitch = Math.max(-0.85, Math.min(0.85, c.pitch));
      if (settings.assist) {
        if (Math.abs(act.roll) < 0.08) c.roll += -c.roll * 1.8 * dt;
        if (Math.abs(act.pitch) < 0.08) c.pitch += -c.pitch * 1.1 * dt;
      }
      c.yaw += Math.sin(c.roll) * 1.85 * def.turn * (c.speed / maxSpd) * dt;
      let thr = act.throttle;
      if (act.boost && boost > 0) { thr = 1.2; boost = Math.max(0, boost - 0.22 * dt); }
      else boost = Math.min(1, boost + 0.12 * dt);
      const target = maxSpd * (0.45 + thr * 0.55);
      c.speed += (target - c.speed) * 1.1 * dt;
      c.speed -= Math.max(0, c.pitch) * 18 * dt;
      c.speed += Math.max(0, -c.pitch) * 14 * dt;
      c.speed = Math.max(12, Math.min(maxSpd * 1.25, c.speed));
      if (act.fire) fireFrom(c, true);
    } else aiCraft(c, dt, maxSpd);

    if (c.reload > 0) { c.reload -= dt; if (c.reload <= 0) c.ammo = c.maxAmmo; }
    if (c.fireCd > 0) c.fireCd -= dt;
    fwd(c, _v);
    c.x += _v.x * c.speed * dt; c.y += _v.y * c.speed * dt; c.z += _v.z * c.speed * dt;
    const gnd = heightAt(c.x, c.z) + 1.4;
    if (c.y < gnd) {
      if (c.kind === "player") { killCraft(c, false); finish(false); } else killCraft(c, false);
      return;
    }
    if (c.y > 90) { c.y = 90; c.pitch = Math.min(c.pitch, 0); }
    const lim = WORLD * 0.48;
    if (Math.abs(c.x) > lim) c.yaw += Math.sign(c.x) * 0.8 * dt;
    if (Math.abs(c.z) > lim) c.yaw += Math.sign(-c.z) * 0.8 * dt;
    c.view.prop.rotation.z += (8 + c.speed * 0.35) * dt;
    c.view.disc.visible = c.speed > 28;
    orient(c);
    if (c.hp < c.maxHp * 0.45 && Math.random() < 0.4) burst(c.x, c.y - 0.2, c.z, 1, 2);
  }

  function stepBullets(dt: number) {
    for (const b of bullets) {
      if (!b.live) continue;
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.life <= 0 || b.y < heightAt(b.x, b.z)) { b.live = false; continue; }
      for (const c of crafts) {
        if (!c.alive) continue;
        if (b.fromPlayer && c.kind === "player") continue;
        if (!b.fromPlayer && c.kind !== "player") continue;
        const dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z;
        const rad = c.kind === "bomber" ? 3.2 : 2.1;
        if (dx * dx + dy * dy + dz * dz < rad * rad) {
          b.live = false; c.hp -= b.dmg; burst(b.x, b.y, b.z, 4, 6);
          if (c.kind === "player") { audio.hit(); if (settings.shake) trauma = Math.min(1, trauma + 0.28); }
          if (c.hp <= 0) {
            if (c.kind === "player") { killCraft(c, false); finish(false); }
            else killCraft(c, b.fromPlayer);
          }
          break;
        }
      }
    }
  }

  function stepFx(dt: number) {
    for (const f of fx) {
      if (!f.live) continue;
      f.life -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vy -= 8 * dt;
      if (f.life <= 0) f.live = false;
    }
  }

  function checkGoals() {
    if (mode !== "play" || outcome !== "none") return;
    if (arcade) {
      if (!crafts.some((c) => c.alive && c.kind !== "player")) spawnArcadeWave();
      return;
    }
    if (!mission) return;
    if (mission.goal.kind === "kills" && kills >= mission.goal.n) finish(true);
    if (mission.goal.kind === "bombers" && !crafts.some((c) => c.alive && c.kind === "bomber")) finish(true);
    if (mission.goal.kind === "ace" && !crafts.some((c) => c.alive && c.isAce)) finish(true);
  }

  function updateCamera(dt: number) {
    if (mode === "hangar" && hangarView) {
      hangarSpin += dt * 0.45;
      hangarView.root.rotation.y = hangarSpin;
      hangarView.prop.rotation.z += dt * 14;
      camera.position.set(Math.cos(hangarSpin * 0.15) * 5.2, 2.0, Math.sin(hangarSpin * 0.15) * 5.2 + 3.2);
      camera.lookAt(0, 0.55, 0);
      return;
    }
    const c = player;
    if (!c) return;
    fwd(c, _v);
    const dist = mode === "attract" ? 11 : 9.5;
    const height = mode === "attract" ? 3.4 : 2.8;
    _v2.set(c.x - _v.x * dist + c.roll * 0.8, c.y + height - c.pitch * 1.4, c.z - _v.z * dist);
    camPos.lerp(_v2, 1 - Math.exp(-4.2 * dt));
    if (settings.shake && trauma > 0) {
      const s = trauma * trauma;
      camPos.x += (Math.random() - 0.5) * s * 0.7;
      camPos.y += (Math.random() - 0.5) * s * 0.5;
    }
    camera.position.copy(camPos);
    camera.lookAt(c.x + _v.x * 6, c.y + 0.4, c.z + _v.z * 6);
    camera.rotation.z += c.roll * 0.18;
  }

  function syncInstances() {
    let bi = 0;
    for (const b of bullets) {
      if (!b.live) continue;
      dummy.position.set(b.x, b.y, b.z);
      dummy.lookAt(b.x + b.vx, b.y + b.vy, b.z + b.vz);
      dummy.rotateX(Math.PI / 2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bulletMesh.setMatrixAt(bi++, dummy.matrix);
    }
    dummy.scale.set(0, 0, 0); dummy.position.set(0, -50, 0); dummy.updateMatrix();
    for (let i = bi; i < BULLET_MAX; i++) bulletMesh.setMatrixAt(i, dummy.matrix);
    bulletMesh.instanceMatrix.needsUpdate = true;
    let fi = 0;
    for (const f of fx) {
      if (!f.live) continue;
      dummy.position.set(f.x, f.y, f.z);
      dummy.scale.setScalar(f.scale * (0.4 + (1 - f.life / f.max)));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      fxMesh.setMatrixAt(fi++, dummy.matrix);
    }
    dummy.scale.set(0, 0, 0); dummy.position.set(0, -80, 0); dummy.updateMatrix();
    for (let i = fi; i < FX_MAX; i++) fxMesh.setMatrixAt(i, dummy.matrix);
    fxMesh.instanceMatrix.needsUpdate = true;
  }

  function emitHud() {
    const c = player;
    const radar: RadarBlip[] = [];
    if (c) {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      for (const e of crafts) {
        if (!e.alive || e === c) continue;
        const dx = e.x - c.x, dz = e.z - c.z;
        radar.push({ x: dx * cs - dz * sn, z: dx * sn + dz * cs, kind: e.kind === "player" ? "fighter" : e.kind });
      }
    }
    let leadX = 0.5, leadY = 0.42, leadVis = false;
    if (c && mode === "play") {
      let best: Craft | null = null, bestDot = 0.55;
      fwd(c, _v);
      for (const e of crafts) {
        if (!e.alive || e.kind === "player") continue;
        const d = _v.dot(_v2.set(e.x - c.x, e.y - c.y, e.z - c.z).normalize());
        if (d > bestDot) { bestDot = d; best = e; }
      }
      if (best) {
        const t = Math.hypot(best.x - c.x, best.y - c.y, best.z - c.z) / 140;
        fwd(best, _v3);
        _proj.set(best.x + _v3.x * best.speed * t, best.y + _v3.y * best.speed * t, best.z + _v3.z * best.speed * t);
        _proj.project(camera);
        leadX = _proj.x * 0.5 + 0.5;
        leadY = 1 - (_proj.y * 0.5 + 0.5);
        leadVis = _proj.z < 1 && leadX > 0.08 && leadX < 0.92 && leadY > 0.08 && leadY < 0.92;
      }
    }
    const obj = arcade
      ? `OLEADA ${arcadeWave}  ·  ${kills} DERRIBOS`
      : mission
        ? mission.goal.kind === "ace" ? "DERRIBA AL AS"
          : mission.goal.kind === "bombers" ? `BOMBARDEROS  ${kills}/${needed}`
            : `DERRIBOS  ${kills}/${needed}`
        : "";
    onHud({
      hp: c?.hp ?? 0, maxHp: c?.maxHp ?? 1, speed: c?.speed ?? 0, alt: c?.y ?? 0,
      ammo: c?.ammo ?? 0, maxAmmo: c?.maxAmmo ?? 1, boost, kills, needed, objective: obj,
      stall: !!c && c.speed < planeById(c.planeId).speed * 0.42,
      overspeed: !!c && c.speed > planeById(c.planeId).speed * 1.12,
      leadX, leadY, leadVis, radar, message, yaw: c?.yaw ?? 0, roll: c?.roll ?? 0,
      throttle: input.sample().throttle,
    });
  }

  function fixedUpdate(dt: number) {
    if (paused && mode === "play") return;
    if (hitstop > 0) { hitstop -= dt; return; }
    if (messageT > 0) { messageT -= dt; if (messageT <= 0) message = null; }
    trauma = Math.max(0, trauma - dt * 1.6);
    const act = input.sample();
    if (mode === "play" && player?.alive) {
      missionTime += dt;
      stepCraft(player, dt, act);
      audio.setEngine(player.speed, planeById(player.planeId).speed, true);
    } else if (mode === "attract" && player) {
      attractT += dt;
      player.yaw += 0.22 * dt;
      player.roll = Math.sin(attractT * 0.6) * 0.35;
      player.pitch = Math.sin(attractT * 0.33) * 0.12;
      stepCraft(player, dt, null);
      audio.setEngine(36, 52, true);
    } else audio.setEngine(0, 50, false);
    for (const c of crafts) { if (c.kind !== "player" && c.alive) stepCraft(c, dt, null); }
    stepBullets(dt); stepFx(dt);
    if (mode === "play") checkGoals();
  }

  function loop() {
    if (!running) return;
    timer.update();
    const d = Math.min(timer.getDelta(), 0.1);
    if (mode === "hangar") { updateCamera(d); syncInstances(); renderer.render(scene, camera); return; }
    acc += d;
    let steps = 0;
    while (acc >= FIXED && steps < 5) { fixedUpdate(FIXED); acc -= FIXED; steps += 1; }
    updateCamera(d);
    clouds.rotation.y += d * 0.003;
    sky.position.copy(camera.position);
    syncInstances();
    renderer.render(scene, camera);
    hudClock += d;
    if (hudClock > 0.05) { hudClock = 0; emitHud(); }
  }

  function wireProbe() {
    window.__controlsTest = {
      getYaw: () => player?.yaw ?? 0,
      getSpeed: () => player?.speed ?? 0,
      getRoll: () => player?.roll ?? 0,
      setSteer: (v: number) => input.setSteer(v),
      setKeys: (codes: string[]) => input.setKeys(codes),
    };
  }

  function setHangar(id: PlaneId) {
    clearCrafts();
    mode = "hangar";
    setBiome("fields");
    hangarView = buildAircraft(planeById(id));
    hangarView.root.position.set(0, 1.1, 0);
    scene.add(hangarView.root);
    camera.position.set(4.2, 2.1, 6.4);
    camera.lookAt(0, 0.6, 0);
  }

  function setAttract() {
    clearCrafts();
    mode = "attract";
    setBiome("fields");
    const demo = spawnCraft("player", "camel", 8, 26, 0, 0.4);
    demo.speed = 40;
    player = demo;
    attractT = 0;
  }

  setAttract();
  wireProbe();
  renderer.setAnimationLoop(loop);
  const vis = () => { if (!document.hidden) audio.resume(); };
  document.addEventListener("visibilitychange", vis);

  return {
    startMission: (id, plane) => startPlay(plane, missionById(id), false),
    startArcade: (plane) => startPlay(plane, null, true),
    setHangar, setAttract,
    setPaused: (v) => { paused = v; },
    setSettings: (s) => {
      settings = s; input.invertY = s.invertY; input.sensitivity = s.sensitivity;
      audio.setVolumes(s.music, s.sfx);
    },
    sampleInput: () => { audio.unlock(); },
    dispose: () => {
      running = false; renderer.setAnimationLoop(null); detachKeys(); ro.disconnect();
      document.removeEventListener("visibilitychange", vis); clearCrafts(); renderer.dispose();
      delete window.__controlsTest;
    },
    getYaw: () => player?.yaw ?? 0,
    getSpeed: () => player?.speed ?? 0,
    getRoll: () => player?.roll ?? 0,
    setKeys: (codes) => input.setKeys(codes),
    setSteer: (v) => input.setSteer(v),
    setStick: (x, y) => { input.stickX = x; input.stickY = y; },
    setFire: (v) => { input.fireHeld = v; },
    setBoost: (v) => { input.boostHeld = v; },
    unlockAudio: () => audio.unlock(),
  };
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getRoll?: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
    };
  }
}
