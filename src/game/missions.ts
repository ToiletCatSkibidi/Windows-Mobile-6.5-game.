import type { MissionDef } from "./types";

export const MISSIONS: MissionDef[] = [
  {
    id: 1,
    name: "Bautismo",
    callsign: "ESCUELA 01",
    brief: "Tres blancos lentos sobre el Somme. Aprende a virar y a disparar.",
    goal: { kind: "kills", n: 3 },
    waves: [{ kind: "drone", n: 3 }],
    biome: "fields",
    hint: "Inclina para virar. Tira del stick para trepar. Fuego a la derecha.",
  },
  {
    id: 2,
    name: "Patrulla",
    callsign: "SOMME 12",
    brief: "Cazas enemigos en el sector. No les des el sol a la espalda.",
    goal: { kind: "kills", n: 4 },
    waves: [{ kind: "fighter", n: 4, plane: "albatros" }],
    biome: "fields",
    hint: "El viraje coordinado gana al picado largo.",
  },
  {
    id: 3,
    name: "El Barón",
    callsign: "CIRCO 09",
    brief: "Un triplano rojo y dos escoltas. El as no huye: te espera.",
    goal: { kind: "ace" },
    waves: [
      { kind: "ace", n: 1, plane: "fokker" },
      { kind: "fighter", n: 2, plane: "albatros" },
    ],
    biome: "dusk",
    hint: "No le sigas en el giro. Corta por dentro y dispara en corto.",
  },
  {
    id: 4,
    name: "Fortaleza",
    callsign: "GOTHIC 04",
    brief: "Tres bombarderos pesados. Rompe la formación antes del frente.",
    goal: { kind: "bombers", n: 3 },
    waves: [
      { kind: "bomber", n: 3 },
      { kind: "fighter", n: 2, plane: "albatros" },
    ],
    biome: "fields",
    hint: "Ataca desde abajo, fuera del cono de las torretas.",
  },
  {
    id: 5,
    name: "Águila",
    callsign: "EAGLE 21",
    brief: "Cazas rápidos al atardecer. El cielo se estrecha.",
    goal: { kind: "kills", n: 6 },
    waves: [
      { kind: "fighter", n: 3, plane: "bf109" },
      { kind: "fighter", n: 3, plane: "bf109" },
    ],
    biome: "dusk",
    hint: "Usa el impulso. No gires con un 109 en trepada.",
  },
  {
    id: 6,
    name: "Pacífico",
    callsign: "CORAL 07",
    brief: "Cazas navales sobre agua. Ligero contra ligero.",
    goal: { kind: "kills", n: 6 },
    waves: [
      { kind: "fighter", n: 3, plane: "zero" },
      { kind: "fighter", n: 3, plane: "zero" },
    ],
    biome: "ocean",
    hint: "El Zero gira mejor. Pica, dispara, trepa.",
  },
  {
    id: 7,
    name: "Muro",
    callsign: "WALL 18",
    brief: "Oleadas mixtas. No dejes que te envuelvan.",
    goal: { kind: "kills", n: 10 },
    waves: [
      { kind: "fighter", n: 4, plane: "bf109" },
      { kind: "bomber", n: 2 },
      { kind: "fighter", n: 4, plane: "zero" },
    ],
    biome: "fields",
    hint: "Prioriza los cazas. Los bombarderos no se escapan.",
  },
  {
    id: 8,
    name: "As de ases",
    callsign: "ACE 00",
    brief: "Todo el circo. Si sales, tu nombre queda en el hangar.",
    goal: { kind: "kills", n: 12 },
    waves: [
      { kind: "ace", n: 1, plane: "fokker" },
      { kind: "fighter", n: 4, plane: "spitfire" },
      { kind: "fighter", n: 4, plane: "mustang" },
      { kind: "ace", n: 1, plane: "bf109" },
      { kind: "bomber", n: 2 },
    ],
    biome: "dusk",
    hint: "Munición corta. Cada ráfaga cuenta.",
  },
];

export function missionById(id: number): MissionDef {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

export function isMissionOpen(id: number, completed: number[]): boolean {
  if (id === 1) return true;
  return completed.includes(id - 1);
}
