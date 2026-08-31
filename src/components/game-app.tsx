import { useCallback, useEffect, useRef, useState } from "react";
import { MISSIONS, isMissionOpen } from "@/game/missions";
import { PLANES, isUnlocked, planeById, unlockHint } from "@/game/planes";
import { addMedal, DEFAULT_SAVE, loadSave, unlockPlane, writeSave } from "@/game/save";
import type { Debrief, GameHandle, HudSnap, PlaneId, SaveData, ScreenId, Settings } from "@/game/types";

const EMPTY_HUD: HudSnap = {
  hp: 1, maxHp: 1, speed: 0, alt: 0, ammo: 0, maxAmmo: 1, boost: 1, kills: 0, needed: 0,
  objective: "", stall: false, overspeed: false, leadX: 0.5, leadY: 0.42, leadVis: false,
  radar: [], message: null, yaw: 0, roll: 0, throttle: 0.7,
};

function firstOpen(save: SaveData) {
  for (const m of MISSIONS) {
    if (isMissionOpen(m.id, save.completedMissions) && !save.completedMissions.includes(m.id)) return m.id;
  }
  return 1;
}

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const [scale, setScale] = useState(1);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<ScreenId>("title");
  const [save, setSave] = useState<SaveData>(DEFAULT_SAVE);
  const [hud, setHud] = useState<HudSnap>(EMPTY_HUD);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const stickPtr = useRef<number | null>(null);

  const persist = useCallback((next: SaveData) => { setSave(next); writeSave(next); }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => setScale(el.clientWidth / 240);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let handle: GameHandle | null = null;
    void (async () => {
      const { createGame } = await import("@/game/engine");
      if (dead || !canvas) return;
      const data = loadSave();
      setSave(data);
      handle = createGame({
        canvas, save: data, onHud: (s) => setHud(s),
        onEvent: (e) => {
          if (e.type !== "win" && e.type !== "lose") return;
          setDebrief(e.debrief);
          setScreen("debrief");
          handle?.setPaused(true);
          setSave((prev) => {
            let next: SaveData = { ...prev, kills: prev.kills + e.debrief.kills };
            if (!e.debrief.win) next = { ...next, deaths: prev.deaths + 1 };
            if (e.debrief.win && e.debrief.missionId !== "arcade") {
              const id = e.debrief.missionId;
              if (!next.completedMissions.includes(id)) {
                next = { ...next, completedMissions: [...next.completedMissions, id] };
              }
            }
            if (e.debrief.missionId === "arcade" && e.debrief.score > next.bestArcade) {
              next = { ...next, bestArcade: e.debrief.score };
            }
            if (e.debrief.medal) next = addMedal(next, e.debrief.medal);
            if (next.kills >= 8) next = unlockPlane(next, "fokker");
            if (next.kills >= 16) next = unlockPlane(next, "albatros");
            if (next.kills >= 28) next = unlockPlane(next, "bf109");
            if (next.completedMissions.includes(2)) next = unlockPlane(next, "spad");
            if (next.completedMissions.includes(4)) next = unlockPlane(next, "spitfire");
            if (next.completedMissions.includes(5)) next = unlockPlane(next, "mustang");
            if (next.completedMissions.includes(6)) next = unlockPlane(next, "zero");
            writeSave(next);
            return next;
          });
        },
      });
      handle.setSettings(data.settings);
      gameRef.current = handle;
      setReady(true);
    })();
    return () => { dead = true; handle?.dispose(); gameRef.current = null; };
  }, []);

  const goTitle = () => {
    setScreen("title");
    gameRef.current?.setPaused(false);
    gameRef.current?.setAttract();
  };
  const startMission = (id: number) => {
    gameRef.current?.unlockAudio();
    gameRef.current?.startMission(id, save.selected);
    setDebrief(null);
    setScreen("flight");
  };
  const startArcade = () => {
    gameRef.current?.unlockAudio();
    gameRef.current?.startArcade(save.selected);
    setDebrief(null);
    setScreen("flight");
  };
  const openHangar = () => {
    gameRef.current?.unlockAudio();
    gameRef.current?.setHangar(save.selected);
    setScreen("hangar");
  };
  const pickPlane = (id: PlaneId) => {
    if (!isUnlocked(id, save.kills, save.completedMissions) && !save.unlocked.includes(id)) return;
    const next = {
      ...save, selected: id,
      unlocked: save.unlocked.includes(id) ? save.unlocked : [...save.unlocked, id],
    };
    persist(next);
    gameRef.current?.setHangar(id);
  };
  const patchSettings = (partial: Partial<Settings>) => {
    const settings = { ...save.settings, ...partial };
    persist({ ...save, settings });
    gameRef.current?.setSettings(settings);
  };

  const moveStick = (e: React.PointerEvent, zone: HTMLElement) => {
    const r = zone.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.42);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.42);
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    setStick({ x, y });
    gameRef.current?.setStick(x, y);
  };
  const onStickDown = (e: React.PointerEvent) => {
    stickPtr.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    moveStick(e, e.currentTarget as HTMLElement);
  };
  const onStickMove = (e: React.PointerEvent) => {
    if (stickPtr.current !== e.pointerId) return;
    moveStick(e, e.currentTarget as HTMLElement);
  };
  const onStickUp = (e: React.PointerEvent) => {
    if (stickPtr.current !== e.pointerId) return;
    stickPtr.current = null;
    setStick({ x: 0, y: 0 });
    gameRef.current?.setStick(0, 0);
  };

  const plane = planeById(save.selected);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink">
      <div ref={stageRef} className="e101-stage shadow-[0_0_0_1px_#3d4a40]">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
        <div className="e101-hud" style={{ transform: `scale(${scale})` }}>
          {screen === "title" && (
            <Title ready={ready} kills={save.kills} onStart={() => startMission(firstOpen(save))}
              onCampaign={() => setScreen("campaign")} onHangar={openHangar} onArcade={startArcade}
              onRecords={() => setScreen("records")} onSettings={() => setScreen("settings")} />
          )}
          {screen === "campaign" && <Campaign save={save} onBack={goTitle} onPlay={startMission} />}
          {screen === "hangar" && <Hangar save={save} onBack={goTitle} onPick={pickPlane} onFly={() => startMission(firstOpen(save))} />}
          {screen === "settings" && <SettingsPane save={save} onBack={goTitle} onPatch={patchSettings} />}
          {screen === "records" && <Records save={save} onBack={goTitle} />}
          {screen === "flight" && (
            <FlightHud hud={hud} planeName={plane.short} stick={stick} onPause={() => { gameRef.current?.setPaused(true); setScreen("pause"); }}
              onStickDown={onStickDown} onStickMove={onStickMove} onStickUp={onStickUp}
              onFire={(v) => gameRef.current?.setFire(v)} onBoost={(v) => gameRef.current?.setBoost(v)} />
          )}
          {screen === "pause" && (
            <Pause onResume={() => { gameRef.current?.setPaused(false); setScreen("flight"); }} onQuit={goTitle} />
          )}
          {screen === "debrief" && debrief && (
            <DebriefPane debrief={debrief}
              onAgain={() => { if (debrief.missionId === "arcade") startArcade(); else startMission(typeof debrief.missionId === "number" ? debrief.missionId : 1); }}
              onHangar={openHangar} onTitle={goTitle} />
          )}
        </div>
        <div className="e101-scan" />
      </div>
    </main>
  );
}

function MenuBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="h-8 rounded-sm border border-line bg-panel text-[11px] font-medium tracking-[0.16em] text-cream">
      {children}
    </button>
  );
}

function Head({ onBack, title, sub }: { onBack: () => void; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onBack}
        className="h-7 w-7 rounded-sm border border-line bg-panel font-display text-[12px] text-cream">←</button>
      <div>
        <h2 className="font-display text-[16px] font-semibold leading-none tracking-wide text-cream">{title}</h2>
        <p className="font-mono text-[8px] tracking-widest text-brass">{sub}</p>
      </div>
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm border border-line bg-panel px-2 py-1.5">
      <div className="font-mono text-[8px] tracking-widest text-brass">{k}</div>
      <div className="font-display text-[18px] font-semibold leading-none tabular-nums">{v}</div>
    </div>
  );
}

function Title(p: {
  ready: boolean; kills: number; onStart: () => void; onCampaign: () => void;
  onHangar: () => void; onArcade: () => void; onRecords: () => void; onSettings: () => void;
}) {
  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-4">
      <p className="font-mono text-[8px] tracking-[0.28em] text-brass">240×400 · BETOUCH E101</p>
      <h1 className="mt-2 font-display text-[42px] font-semibold leading-[0.85] tracking-tight text-cream">
        ACES<span className="block text-crimson">400</span>
      </h1>
      <p className="mt-2 max-w-[11rem] font-display text-[11px] leading-tight tracking-wide text-cream-dim">
        Combate aéreo clásico. Biplanos y cazas, joystick táctil, cielo completo.
      </p>
      <p className="mt-1 font-mono text-[8px] text-brass">{p.kills} derribos registrados</p>
      <div className="mt-auto flex flex-col gap-1.5">
        <button type="button" disabled={!p.ready} onClick={p.onStart}
          className="h-9 rounded-sm bg-cream text-[13px] font-semibold tracking-[0.22em] text-ink disabled:opacity-50">
          START
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <MenuBtn onClick={p.onCampaign}>Campaña</MenuBtn>
          <MenuBtn onClick={p.onHangar}>Hangar</MenuBtn>
          <MenuBtn onClick={p.onArcade}>Arcade</MenuBtn>
          <MenuBtn onClick={p.onRecords}>Récords</MenuBtn>
        </div>
        <MenuBtn onClick={p.onSettings}>Ajustes</MenuBtn>
      </div>
    </div>
  );
}

function Campaign({ save, onBack, onPlay }: { save: SaveData; onBack: () => void; onPlay: (id: number) => void }) {
  return (
    <div className="flex h-full flex-col bg-ink/70 px-3 py-3">
      <Head onBack={onBack} title="Campaña" sub="Ocho salidas" />
      <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
        {MISSIONS.map((m) => {
          const open = isMissionOpen(m.id, save.completedMissions);
          const done = save.completedMissions.includes(m.id);
          return (
            <button key={m.id} type="button" disabled={!open} onClick={() => onPlay(m.id)}
              className="flex w-full items-start justify-between rounded-sm border border-line bg-panel px-2 py-1.5 text-left disabled:opacity-35">
              <span>
                <span className="block font-mono text-[8px] tracking-widest text-brass">{m.callsign}</span>
                <span className="block font-display text-[13px] font-medium leading-none text-cream">{m.name}</span>
                <span className="mt-0.5 block font-display text-[9px] leading-tight text-cream-dim">{m.brief}</span>
              </span>
              <span className="font-mono text-[8px] text-ok">{done ? "OK" : open ? "GO" : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Hangar({ save, onBack, onPick, onFly }: {
  save: SaveData; onBack: () => void; onPick: (id: PlaneId) => void; onFly: () => void;
}) {
  const p = planeById(save.selected);
  return (
    <div className="flex h-full flex-col px-3 py-3">
      <Head onBack={onBack} title="Hangar" sub={p.nation} />
      <div className="h-[132px]" />
      <p className="font-display text-[16px] font-semibold leading-none text-cream">{p.name}</p>
      <p className="mt-0.5 font-mono text-[8px] tracking-widest text-brass">{p.year} · {p.role}</p>
      <p className="mt-1 font-display text-[10px] leading-snug text-cream-dim">{p.blurb}</p>
      <div className="mt-2 grid grid-cols-4 gap-1 font-mono text-[8px] text-cream-dim">
        <Stat label="VEL" v={p.speed} max={90} />
        <Stat label="VIR" v={p.turn * 70} max={90} />
        <Stat label="FUE" v={p.firepower * 70} max={90} />
        <Stat label="ARM" v={p.armor * 80} max={90} />
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {PLANES.map((pl) => {
          const open = save.unlocked.includes(pl.id) || isUnlocked(pl.id, save.kills, save.completedMissions);
          const sel = save.selected === pl.id;
          return (
            <button key={pl.id} type="button" onClick={() => onPick(pl.id)}
              className={`h-8 min-w-[52px] rounded-sm border px-1.5 font-display text-[10px] tracking-wide ${
                sel ? "border-cream bg-cream text-ink" : "border-line bg-panel text-cream"
              } ${open ? "" : "opacity-40"}`}>
              {open ? pl.short : unlockHint(pl.id)}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onFly}
        className="mt-auto h-9 rounded-sm bg-cream text-[12px] font-semibold tracking-[0.2em] text-ink">
        Despegar
      </button>
    </div>
  );
}

function Stat({ label, v, max }: { label: string; v: number; max: number }) {
  return (
    <div>
      <span>{label}</span>
      <div className="mt-0.5 h-1 bg-line">
        <div className="h-full bg-cream" style={{ width: `${Math.max(8, Math.min(100, (v / max) * 100))}%` }} />
      </div>
    </div>
  );
}

function SettingsPane({ save, onBack, onPatch }: {
  save: SaveData; onBack: () => void; onPatch: (p: Partial<Settings>) => void;
}) {
  const s = save.settings;
  return (
    <div className="flex h-full flex-col bg-ink/80 px-3 py-3">
      <Head onBack={onBack} title="Ajustes" sub="Mando y audio" />
      <label className="mt-3 block font-display text-[11px] tracking-wide text-cream-dim">
        Sensibilidad {s.sensitivity.toFixed(1)}
        <input type="range" min={0.5} max={1.6} step={0.1} value={s.sensitivity}
          onChange={(e) => onPatch({ sensitivity: Number(e.target.value) })} className="mt-1 w-full accent-cream" />
      </label>
      <Toggle on={s.invertY} label="Invertir eje Y" onClick={() => onPatch({ invertY: !s.invertY })} />
      <Toggle on={s.assist} label="Asistencia de vuelo" onClick={() => onPatch({ assist: !s.assist })} />
      <Toggle on={s.shake} label="Temblor de cámara" onClick={() => onPatch({ shake: !s.shake })} />
      <label className="mt-2 block font-display text-[11px] tracking-wide text-cream-dim">
        Música
        <input type="range" min={0} max={1} step={0.05} value={s.music}
          onChange={(e) => onPatch({ music: Number(e.target.value) })} className="mt-1 w-full accent-cream" />
      </label>
      <label className="mt-2 block font-display text-[11px] tracking-wide text-cream-dim">
        Efectos
        <input type="range" min={0} max={1} step={0.05} value={s.sfx}
          onChange={(e) => onPatch({ sfx: Number(e.target.value) })} className="mt-1 w-full accent-cream" />
      </label>
      <p className="mt-auto font-mono text-[8px] leading-relaxed text-brass">
        WASD / palanca: alabeo y cabeceo. Espacio: fuego. Shift: impulso. A vira a babor.
      </p>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="mt-2 flex h-8 w-full items-center justify-between rounded-sm border border-line bg-panel px-2 font-display text-[11px] tracking-wide text-cream">
      {label}
      <span className={`font-mono text-[9px] ${on ? "text-ok" : "text-brass"}`}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function Records({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const medals: Record<string, string> = { wings: "Alas de campaña", ace: "As de caza", baron: "Cazador del Barón" };
  return (
    <div className="flex h-full flex-col bg-ink/80 px-3 py-3">
      <Head onBack={onBack} title="Récords" sub="Libro de vuelo" />
      <div className="mt-3 grid grid-cols-2 gap-1.5 font-display text-[11px] text-cream">
        <Box k="Derribos" v={String(save.kills)} />
        <Box k="Caídas" v={String(save.deaths)} />
        <Box k="Misiones" v={`${save.completedMissions.length}/8`} />
        <Box k="Arcade" v={String(save.bestArcade)} />
      </div>
      <p className="mt-3 font-mono text-[8px] tracking-widest text-brass">CONDECORACIONES</p>
      <ul className="mt-1 space-y-1">
        {save.medals.length === 0 && <li className="font-display text-[11px] text-cream-dim">Ninguna aún</li>}
        {save.medals.map((m) => (
          <li key={m} className="border border-line bg-panel px-2 py-1 font-display text-[11px] text-cream">
            {medals[m] ?? m}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlightHud({ hud, planeName, stick, onPause, onStickDown, onStickMove, onStickUp, onFire, onBoost }: {
  hud: HudSnap; planeName: string; stick: { x: number; y: number };
  onPause: () => void;
  onStickDown: (e: React.PointerEvent) => void;
  onStickMove: (e: React.PointerEvent) => void;
  onStickUp: (e: React.PointerEvent) => void;
  onFire: (v: boolean) => void; onBoost: (v: boolean) => void;
}) {
  const hp = hud.maxHp > 0 ? hud.hp / hud.maxHp : 0;
  return (
    <div className="relative h-full">
      <div className="absolute left-2 top-2 flex items-center gap-1.5">
        <button type="button" onClick={onPause}
          className="h-7 w-7 rounded-sm border border-line bg-olive-deep/80 font-display text-[10px] text-cream">II</button>
        <div>
          <p className="font-mono text-[8px] tracking-widest text-cream">{planeName}</p>
          <p className="font-mono text-[8px] text-brass">{hud.objective}</p>
        </div>
      </div>
      <div className="absolute right-2 top-2 h-[56px] w-[56px] rounded-full border border-line bg-olive-deep/70">
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream" />
        {hud.radar.slice(0, 12).map((b, i) => {
          const nx = Math.max(-1, Math.min(1, b.x / 90));
          const nz = Math.max(-1, Math.min(1, b.z / 90));
          return (
            <span key={i}
              className={`absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                b.kind === "bomber" ? "bg-warn" : b.kind === "ace" ? "bg-crimson" : "bg-cream"
              }`}
              style={{ left: `${50 + nx * 42}%`, top: `${50 - nz * 42}%` }} />
          );
        })}
      </div>
      <div className="absolute left-2 top-[52px] w-[88px]">
        <div className="h-1.5 bg-line">
          <div className={`h-full ${hp < 0.3 ? "bg-crimson" : "bg-ok"}`} style={{ width: `${hp * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] tabular-nums text-cream">
          <span>{Math.round(hud.speed * 1.94)} kts</span>
          <span>{Math.round(hud.alt)} m</span>
        </div>
        <div className="mt-0.5 font-mono text-[8px] text-cream-dim">AMMO {hud.ammo}/{hud.maxAmmo}</div>
        {hud.stall && <p className="font-display text-[10px] tracking-widest text-crimson">STALL</p>}
      </div>
      {hud.leadVis && (
        <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cream"
          style={{ left: `${hud.leadX * 240}px`, top: `${hud.leadY * 400}px` }} />
      )}
      <span className="pointer-events-none absolute left-1/2 top-[42%] h-3 w-3 -translate-x-1/2 -translate-y-1/2 border border-cream/80" />
      {hud.message && (
        <p className="pointer-events-none absolute left-1/2 top-[28%] w-[200px] -translate-x-1/2 text-center font-display text-[11px] leading-tight text-cream">
          {hud.message}
        </p>
      )}
      <div data-stick onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}
        className="absolute bottom-3 left-2 h-[72px] w-[72px] touch-none rounded-full border border-line bg-olive-deep/55">
        <span className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cream/90"
          style={{ left: `${50 + stick.x * 32}%`, top: `${50 + stick.y * 32}%` }} />
      </div>
      <div className="absolute bottom-3 right-2 flex flex-col items-end gap-1.5">
        <button type="button"
          onPointerDown={(e) => { e.preventDefault(); onBoost(true); }}
          onPointerUp={() => onBoost(false)} onPointerCancel={() => onBoost(false)}
          className="h-9 w-9 touch-none rounded-full border border-line bg-olive-deep/80 font-display text-[8px] tracking-widest text-cream">
          IMP
        </button>
        <button type="button"
          onPointerDown={(e) => { e.preventDefault(); onFire(true); }}
          onPointerUp={() => onFire(false)} onPointerCancel={() => onFire(false)}
          className="h-[52px] w-[52px] touch-none rounded-full bg-crimson font-display text-[11px] font-semibold tracking-[0.18em] text-cream">
          FUEGO
        </button>
      </div>
      <div className="absolute bottom-[88px] right-3 h-10 w-1.5 bg-line">
        <div className="absolute bottom-0 w-full bg-cream" style={{ height: `${hud.boost * 100}%` }} />
      </div>
    </div>
  );
}

function Pause({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  return (
    <div className="flex h-full flex-col items-stretch justify-center bg-ink/75 px-5">
      <h2 className="text-center font-display text-[22px] font-semibold tracking-[0.2em] text-cream">PAUSA</h2>
      <button type="button" onClick={onResume}
        className="mt-4 h-9 rounded-sm bg-cream text-[12px] font-semibold tracking-[0.18em] text-ink">Reanudar</button>
      <button type="button" onClick={onQuit}
        className="mt-2 h-9 rounded-sm border border-line bg-panel text-[12px] tracking-[0.18em] text-cream">Hangar</button>
    </div>
  );
}

function DebriefPane({ debrief, onAgain, onHangar, onTitle }: {
  debrief: Debrief; onAgain: () => void; onHangar: () => void; onTitle: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-ink/80 px-4 py-4">
      <p className="font-mono text-[8px] tracking-[0.28em] text-brass">{debrief.win ? "DEBRIEF" : "PÉRDIDA"}</p>
      <h2 className="mt-1 font-display text-[26px] font-semibold leading-none text-cream">{debrief.title}</h2>
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <Box k="Derribos" v={String(debrief.kills)} />
        <Box k="Tiempo" v={`${Math.floor(debrief.time)}s`} />
        <Box k="Daño" v={`${Math.round(debrief.damage * 100)}%`} />
        <Box k="Puntos" v={String(debrief.score)} />
      </div>
      {debrief.medal && (
        <p className="mt-3 border border-line bg-panel px-2 py-1.5 font-display text-[11px] text-cream">Condecoración concedida</p>
      )}
      <div className="mt-auto flex flex-col gap-1.5">
        <button type="button" onClick={onAgain}
          className="h-9 rounded-sm bg-cream text-[12px] font-semibold tracking-[0.18em] text-ink">Otra salida</button>
        <div className="grid grid-cols-2 gap-1.5">
          <MenuBtn onClick={onHangar}>Hangar</MenuBtn>
          <MenuBtn onClick={onTitle}>Menú</MenuBtn>
        </div>
      </div>
    </div>
  );
}
