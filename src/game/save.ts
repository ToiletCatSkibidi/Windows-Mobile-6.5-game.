import type { PlaneId, SaveData, Settings } from "./types";

const KEY = "aces400.save";
const SAVE_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  assist: true,
  music: 0.55,
  sfx: 0.8,
  shake: true,
};

export const DEFAULT_SAVE: SaveData = {
  version: SAVE_VERSION,
  unlocked: ["camel"],
  selected: "camel",
  completedMissions: [],
  medals: [],
  kills: 0,
  deaths: 0,
  bestArcade: 0,
  settings: { ...DEFAULT_SETTINGS },
};

function migrate(raw: SaveData): SaveData {
  const s: SaveData = {
    ...DEFAULT_SAVE,
    ...raw,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    unlocked: Array.isArray(raw.unlocked) ? raw.unlocked : ["camel"],
    completedMissions: Array.isArray(raw.completedMissions) ? raw.completedMissions : [],
    medals: Array.isArray(raw.medals) ? raw.medals : [],
  };
  s.version = SAVE_VERSION;
  if (!s.unlocked.includes("camel")) s.unlocked.push("camel");
  if (!s.unlocked.includes(s.selected)) s.selected = "camel";
  return s;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    return migrate(JSON.parse(raw) as SaveData);
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota */
  }
}

export function addMedal(save: SaveData, id: string): SaveData {
  if (save.medals.includes(id)) return save;
  return { ...save, medals: [...save.medals, id] };
}

export function unlockPlane(save: SaveData, id: PlaneId): SaveData {
  if (save.unlocked.includes(id)) return save;
  return { ...save, unlocked: [...save.unlocked, id] };
}
