import type { Actions } from "./types";

const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyC",
  "KeyP",
  "Escape",
]);

function radial(x: number, y: number, dz = 0.14) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export class Input {
  keys = new Set<string>();
  injected: string[] | null = null;
  stickX = 0;
  stickY = 0;
  fireHeld = false;
  boostHeld = false;
  invertY = false;
  sensitivity = 1;
  throttleStick = 0.72;

  attach() {
    const down = (e: KeyboardEvent) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const clear = () => this.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.keys.clear();
    });
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }

  setKeys(codes: string[]) {
    this.injected = codes;
  }

  setSteer(v: number) {
    this.stickX = -v;
  }

  sample(): Actions {
    const keys = new Set(this.injected ?? this.keys);
    let roll = -this.stickX * this.sensitivity;
    let pitch = -this.stickY * this.sensitivity;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) roll += 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) roll -= 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) pitch += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) pitch -= 1;
    if (this.invertY) pitch = -pitch;

    const pads = navigator.getGamepads?.() ?? [];
    let padFire = false;
    let padBoost = false;
    for (const pad of pads) {
      if (!pad || pad.mapping !== "standard") continue;
      const st = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
      roll += -st.x;
      pitch += this.invertY ? st.y : -st.y;
      if (pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.4) padFire = true;
      if (pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.4) padBoost = true;
    }

    roll = Math.max(-1, Math.min(1, roll));
    pitch = Math.max(-1, Math.min(1, pitch));

    let throttle = this.throttleStick;
    if (keys.has("KeyW") || keys.has("ArrowUp")) throttle = 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) throttle = 0.35;
    const boost = this.boostHeld || padBoost || keys.has("ShiftLeft") || keys.has("ShiftRight");
    if (boost) throttle = 1.15;

    const fire = this.fireHeld || padFire || keys.has("Space");

    return { roll, pitch, yaw: 0, throttle, fire, boost };
  }
}
