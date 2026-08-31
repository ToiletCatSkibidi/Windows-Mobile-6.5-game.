export type PlaneId =
  | "camel"
  | "fokker"
  | "spad"
  | "albatros"
  | "spitfire"
  | "mustang"
  | "bf109"
  | "zero";

export type PlaneLayout = "biplane" | "triplane" | "sesqui" | "mono";

export type Unlock =
  | { type: "start" }
  | { type: "kills"; n: number }
  | { type: "mission"; n: number };

export type PlaneDef = {
  id: PlaneId;
  name: string;
  short: string;
  nation: string;
  year: string;
  role: string;
  blurb: string;
  speed: number;
  turn: number;
  climb: number;
  firepower: number;
  armor: number;
  ammo: number;
  layout: PlaneLayout;
  unlock: Unlock;
  colors: {
    fuse: number;
    wing: number;
    accent: number;
    cowl: number;
    strut: number;
  };
};

export type Settings = {
  sensitivity: number;
  invertY: boolean;
  assist: boolean;
  music: number;
  sfx: number;
  shake: boolean;
};

export type SaveData = {
  version: number;
  unlocked: PlaneId[];
  selected: PlaneId;
  completedMissions: number[];
  medals: string[];
  kills: number;
  deaths: number;
  bestArcade: number;
  settings: Settings;
};

export type ScreenId =
  | "title"
  | "hangar"
  | "campaign"
  | "flight"
  | "debrief"
  | "settings"
  | "records"
  | "pause";

export type MissionGoal =
  | { kind: "kills"; n: number }
  | { kind: "survive"; seconds: number }
  | { kind: "ace" }
  | { kind: "bombers"; n: number };

export type EnemyKind = "drone" | "fighter" | "ace" | "bomber";

export type MissionDef = {
  id: number;
  name: string;
  callsign: string;
  brief: string;
  goal: MissionGoal;
  waves: { kind: EnemyKind; n: number; plane?: PlaneId }[];
  biome: "fields" | "ocean" | "dusk";
  hint: string;
};

export type Debrief = {
  win: boolean;
  title: string;
  kills: number;
  time: number;
  damage: number;
  score: number;
  medal: string | null;
  missionId: number | "arcade";
};

export type RadarBlip = { x: number; z: number; kind: EnemyKind | "player" };

export type HudSnap = {
  hp: number;
  maxHp: number;
  speed: number;
  alt: number;
  ammo: number;
  maxAmmo: number;
  boost: number;
  kills: number;
  needed: number;
  objective: string;
  stall: boolean;
  overspeed: boolean;
  leadX: number;
  leadY: number;
  leadVis: boolean;
  radar: RadarBlip[];
  message: string | null;
  yaw: number;
  roll: number;
  throttle: number;
};

export type GameEvent =
  | { type: "win"; debrief: Debrief }
  | { type: "lose"; debrief: Debrief }
  | { type: "kill"; total: number }
  | { type: "message"; text: string };

export type GameHandle = {
  startMission: (id: number, plane: PlaneId) => void;
  startArcade: (plane: PlaneId) => void;
  setHangar: (plane: PlaneId) => void;
  setAttract: () => void;
  setPaused: (v: boolean) => void;
  setSettings: (s: Settings) => void;
  sampleInput: () => void;
  dispose: () => void;
  getYaw: () => number;
  getSpeed: () => number;
  getRoll: () => number;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
  setStick: (x: number, y: number) => void;
  setFire: (v: boolean) => void;
  setBoost: (v: boolean) => void;
  unlockAudio: () => void;
};


export type Actions = {
  roll: number;
  pitch: number;
  yaw: number;
  throttle: number;
  fire: boolean;
  boost: boolean;
};
