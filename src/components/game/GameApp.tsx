import { useEffect, useRef, useState } from "react";
import {
  Backpack,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Crosshair,
  Gamepad2,
  Gem,
  Home,
  Keyboard,
  Monitor,
  Settings,
  ShoppingCart,
  Swords,
  Users,
  Volume2,
  X,
} from "lucide-react";
import {
  GEAR,
  MODES,
  SKINS,
  keyLabel,
  levelFromXp,
  modeById,
  skinById,
  gearById,
  type Action,
  type ModeId,
  type Settings as SettingsT,
} from "@/game/content";
import {
  applyMatchResult,
  buy,
  getSave,
  loadSave,
  owns,
  patchSave,
  patchSettings,
  playerLevel,
  redeem,
  resetBinds,
  setBind,
  subscribe,
} from "@/game/save";
import type { HudState, MatchResult, PadInput } from "@/game/engine";

type Screen = "lobby" | "modes" | "settings" | "locker" | "shop" | "stats" | "match";

function useSave() {
  const [, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadSave();
    setReady(true);
    return subscribe(() => setTick((n) => n + 1));
  }, []);
  return { save: getSave(), ready };
}

export function GameApp() {
  const { save } = useSave();
  const [screen, setScreen] = useState<Screen>("lobby");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <main className="hex-bg relative h-dvh w-full overflow-hidden text-ink">
      {screen === "lobby" && <Lobby onGo={setScreen} />}
      {screen === "modes" && (
        <ModeSelect
          selected={save.modeId}
          onPick={(id) => {
            patchSave({ modeId: id });
            setScreen("lobby");
          }}
          onBack={() => setScreen("lobby")}
        />
      )}
      {screen === "settings" && <SettingsScreen onBack={() => setScreen("lobby")} />}
      {screen === "locker" && <Locker onBack={() => setScreen("lobby")} toast={setToast} />}
      {screen === "shop" && <Shop onBack={() => setScreen("lobby")} toast={setToast} />}
      {screen === "stats" && <Stats onBack={() => setScreen("lobby")} />}
      {screen === "match" && <Match modeId={save.modeId} onExit={() => setScreen("lobby")} />}
      {toast && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-bg-deep px-4 py-2 text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

function TopNav({ active, onGo }: { active: Screen; onGo: (s: Screen) => void }) {
  const items: { id: Screen; icon: typeof Home; label: string }[] = [
    { id: "lobby", icon: Home, label: "Lobby" },
    { id: "locker", icon: Swords, label: "Locker" },
    { id: "stats", icon: BarChart3, label: "Stats" },
    { id: "shop", icon: ShoppingCart, label: "Shop" },
  ];
  return (
    <nav className="flex items-center gap-1 rounded-full bg-bg-deep/80 p-1 shadow-lg">
      {items.map((item) => (
        <button
          key={item.id}
          aria-label={item.label}
          onClick={() => onGo(item.id)}
          className={`flex h-11 w-12 items-center justify-center rounded-full ${active === item.id ? "bg-panel text-ink" : "text-muted hover:text-ink"}`}
        >
          <item.icon size={20} />
        </button>
      ))}
    </nav>
  );
}

function Currencies({ onSettings }: { onSettings: () => void }) {
  const save = getSave();
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full bg-bg-deep/85 px-3 py-1.5 text-sm font-extrabold">
        <Gem size={16} className="text-gem" />
        {save.gems}
      </div>
      <div className="flex items-center gap-2 rounded-full bg-bg-deep/85 px-3 py-1.5 text-sm font-extrabold">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-gold text-[10px] text-gold-ink">$</span>
        {save.gold}
      </div>
      <button aria-label="Settings" onClick={onSettings} className="grid h-10 w-10 place-items-center rounded-full bg-bg-deep/85">
        <Settings size={18} />
      </button>
    </div>
  );
}

function Lobby({ onGo }: { onGo: (s: Screen) => void }) {
  const save = getSave();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mode = modeById(save.modeId);
  const [editing, setEditing] = useState(false);
  const [party, setParty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose = () => {};
    let dead = false;
    void import("@/game/preview").then(({ mountPreview }) => {
      if (dead || !canvasRef.current) return;
      dispose = mountPreview(canvasRef.current, save.skinId, save.backpackId, save.pickaxeId);
    });
    return () => {
      dead = true;
      dispose();
    };
  }, [save.skinId, save.backpackId, save.pickaxeId]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-bg-deep/55 p-2 pr-4">
          <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-panel">
            <span className="font-display text-lg">{save.name.slice(0, 1).toUpperCase()}</span>
            <span className="absolute -top-1 -left-1 rounded-full bg-gold px-1.5 text-xs font-extrabold text-gold-ink">{playerLevel()}</span>
          </div>
          <div>
            {editing ? (
              <input
                autoFocus
                maxLength={16}
                defaultValue={save.name}
                aria-label="Display name"
                className="w-36 rounded-md bg-panel px-2 py-1 font-extrabold outline-none"
                onBlur={(e) => {
                  patchSave({ name: e.target.value.trim().slice(0, 16) || "Builder" });
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button className="font-extrabold" onClick={() => setEditing(true)}>
                {save.name}
              </button>
            )}
            <div className="text-xs font-bold text-ok">Ready</div>
          </div>
        </div>
        <div className="hidden sm:block">
          <TopNav active="lobby" onGo={onGo} />
        </div>
        <Currencies onSettings={() => onGo("settings")} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <button
          onClick={() => onGo("shop")}
          className="m-3 hidden w-52 flex-col overflow-hidden rounded-2xl bg-bg-deep/70 text-left shadow-lg sm:flex"
        >
          <div className="h-24 bg-gradient-to-br from-gold to-danger" />
          <div className="p-3">
            <div className="text-xs font-extrabold tracking-wide text-gold">DAILY DROP</div>
            <div className="font-display text-lg leading-tight">Honey Scout kit</div>
          </div>
        </button>

        <div className="relative min-h-48 flex-1">
          <canvas ref={canvasRef} className="h-full w-full" />
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 text-center">
            <div className="font-display text-2xl drop-shadow">{save.name}</div>
            <div className="text-sm font-extrabold text-ok">ready</div>
          </div>
        </div>

        <div className="flex flex-col items-end justify-end gap-2 p-3 sm:p-4">
          <button onClick={() => onGo("modes")} className="w-64 overflow-hidden rounded-2xl bg-ink text-left text-bg-deep shadow-lg sm:w-72">
            <ModeArt id={mode.id} />
            <div className="px-3 py-2">
              <div className="font-display text-xl leading-none">{mode.name}</div>
              <div className="text-xs font-extrabold tracking-wide">MODE</div>
            </div>
          </button>
          <button onClick={() => setParty(true)} className="w-64 rounded-xl bg-ok py-2.5 font-display text-lg text-bg-deep sm:w-72">
            PARTY
          </button>
          <button
            onClick={() => onGo("match")}
            className="w-64 rounded-xl bg-play py-3 font-display text-2xl text-gold-ink shadow-lg sm:w-72"
          >
            Play
          </button>
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 bg-bg-deep/80 px-3 py-1.5 text-[11px] font-bold text-muted sm:text-xs">
        <span>Local match · solo</span>
        <span className="hidden sm:inline">Level {levelFromXp(save.xp)}</span>
        <span>Build Battle</span>
      </footer>

      <div className="flex justify-center gap-2 pb-2 sm:hidden">
        <TopNav active="lobby" onGo={onGo} />
      </div>

      {party && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-bg-deep/60 p-4">
          <div className="pop-in w-full max-w-md rounded-2xl bg-panel p-5 shadow-2xl">
            <div className="mb-1 font-display text-2xl">Party</div>
            <p className="mb-4 text-sm text-muted">This round is just you. No other builders spawn in.</p>
            <ul className="mb-4 space-y-2">
              <li className="flex items-center justify-between rounded-xl bg-bg-deep/40 px-3 py-2">
                <span className="font-extrabold">{save.name}</span>
                <span className="text-xs font-bold text-ok">Solo</span>
              </li>
            </ul>
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl bg-bg-deep/40 py-3 font-bold" onClick={() => setParty(false)}>
                Close
              </button>
              <button
                className="flex-1 rounded-xl bg-play py-3 font-display text-gold-ink"
                onClick={() => {
                  setParty(false);
                  onGo("match");
                }}
              >
                Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeArt({ id }: { id: string }) {
  const mode = modeById(id);
  return (
    <div className="relative h-24 w-full overflow-hidden" style={{ background: mode.accent }}>
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 h-3 rounded-sm bg-white/80" />
      <div className="absolute bottom-6 left-6 h-8 w-10 origin-bottom -skew-x-6 bg-amber-200/90" />
      <div className="absolute right-6 bottom-6 h-10 w-8 bg-white/30" />
      <div className="absolute top-3 left-3 font-display text-sm text-white drop-shadow">{mode.kicker}</div>
    </div>
  );
}

function ModeSelect({ selected, onPick, onBack }: { selected: string; onPick: (id: ModeId) => void; onBack: () => void }) {
  const [id, setId] = useState<ModeId>((MODES.some((m) => m.id === selected) ? selected : "wild-west") as ModeId);
  return (
    <div className="flex h-full flex-col p-3 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-3xl">Choose a mode</h1>
        <Currencies onSettings={onBack} />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setId(mode.id)}
            className={`w-52 shrink-0 overflow-hidden rounded-2xl bg-bg-deep/50 text-left ${id === mode.id ? "ring-4 ring-gold" : ""}`}
          >
            <ModeArt id={mode.id} />
            <div className="p-3">
              <div className="font-display text-xl leading-tight">{mode.name}</div>
              <div className="text-xs font-bold text-muted">{mode.detail}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button className="rounded-xl bg-danger px-6 py-3 font-display text-lg" onClick={onBack}>
          Back
        </button>
        <button className="rounded-xl bg-play px-6 py-3 font-display text-lg text-gold-ink" onClick={() => onPick(id)}>
          Confirm
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({ onBack }: { onBack: () => void }) {
  const save = getSave();
  const [tab, setTab] = useState<"graphic" | "control" | "keys" | "pad" | "net" | "audio">("graphic");
  const [capture, setCapture] = useState<Action | null>(null);
  const s = save.settings;

  useEffect(() => {
    if (!capture) return;
    const fn = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== "Escape") setBind(capture, e.code);
      setCapture(null);
    };
    window.addEventListener("keydown", fn, true);
    return () => window.removeEventListener("keydown", fn, true);
  }, [capture]);

  const tabs = [
    { id: "graphic" as const, icon: Monitor, label: "Graphic" },
    { id: "control" as const, icon: Crosshair, label: "Control" },
    { id: "keys" as const, icon: Keyboard, label: "Keys" },
    { id: "pad" as const, icon: Gamepad2, label: "Gamepad" },
    { id: "net" as const, icon: Cloud, label: "Network" },
    { id: "audio" as const, icon: Volume2, label: "Audio" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto bg-bg-deep px-2 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex h-12 min-w-12 items-center gap-2 rounded-lg px-3 ${tab === t.id ? "bg-panel" : "text-muted"}`}
          >
            <t.icon size={18} />
            <span className="hidden font-extrabold sm:inline">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-xl space-y-2">
          {tab === "graphic" && (
            <>
              <CycleRow label="Quality" value={s.quality} options={["low", "medium", "high"]} onChange={(quality) => patchSettings({ quality: quality as SettingsT["quality"] })} />
              <CycleRow label="Render distance" value={s.renderDistance} options={["low", "medium", "high"]} onChange={(renderDistance) => patchSettings({ renderDistance: renderDistance as SettingsT["renderDistance"] })} />
              <CycleRow label="Shadows" value={s.shadows ? "On" : "Off"} options={["Off", "On"]} onChange={(v) => patchSettings({ shadows: v === "On" })} />
              <CycleRow label="Crosshair" value={s.showCrosshair ? "On" : "Off"} options={["Off", "On"]} onChange={(v) => patchSettings({ showCrosshair: v === "On" })} />
              <CycleRow label="FPS limit" value={s.fpsLimit === 0 ? "Unlimited" : String(s.fpsLimit)} options={["Unlimited", "30", "60", "120"]} onChange={(v) => patchSettings({ fpsLimit: v === "Unlimited" ? 0 : Number(v) })} />
              <SliderRow label="UI scale" value={s.uiScale} min={80} max={120} suffix="%" onChange={(uiScale) => patchSettings({ uiScale })} />
            </>
          )}
          {tab === "control" && (
            <>
              <SliderRow label="Look sensitivity" value={s.mouseSens} min={1} max={100} suffix="%" onChange={(mouseSens) => patchSettings({ mouseSens })} />
              <SliderRow label="Aim sensitivity" value={s.adsSens} min={20} max={100} suffix="%" onChange={(adsSens) => patchSettings({ adsSens })} />
              <CycleRow label="Invert Y" value={s.invertY ? "On" : "Off"} options={["Off", "On"]} onChange={(v) => patchSettings({ invertY: v === "On" })} />
              <p className="pt-2 text-sm text-muted">Move with WASD or arrows. Jump Space, crouch Shift, sprint Ctrl, slide Z. Build with R F E C. Look at the top of a piece to stack another on it. Press Q to edit the piece in front of you, hold left click and drag across the squares, and release to apply. Scroll the mouse wheel to reset the edit.</p>
            </>
          )}
          {tab === "keys" && (
            <>
              <button className="mb-2 rounded-lg bg-panel px-3 py-2 text-sm font-extrabold" onClick={() => resetBinds()}>
                Reset all binds
              </button>
              {(Object.keys(s.binds) as Action[]).map((action) => (
                <div key={action} className="flex items-center gap-2 rounded-lg bg-panel/80">
                  <div className="w-36 px-3 py-2 text-sm font-bold capitalize">{action}</div>
                  <button className={`flex-1 rounded-md py-2 font-extrabold ${capture === action ? "bg-gold text-gold-ink" : "bg-bg-deep/50"}`} onClick={() => setCapture(action)}>
                    {capture === action ? "Press a key" : keyLabel(s.binds[action])}
                  </button>
                </div>
              ))}
            </>
          )}
          {tab === "pad" && (
            <>
              <SliderRow label="Look speed" value={s.gamepadSens} min={10} max={100} suffix="%" onChange={(gamepadSens) => patchSettings({ gamepadSens })} />
              <SliderRow label="Deadzone" value={s.deadzone} min={5} max={40} suffix="%" onChange={(deadzone) => patchSettings({ deadzone })} />
              <CycleRow label="Aim assist" value={s.aimAssist ? "On" : "Off"} options={["Off", "On"]} onChange={(v) => patchSettings({ aimAssist: v === "On" })} />
              <p className="text-sm text-muted">Left stick moves, right stick looks, RT fires or places, LT aims, A jumps, Y cycles builds, Start pauses.</p>
            </>
          )}
          {tab === "net" && (
            <>
              <CycleRow label="Region label" value={s.region} options={["Local", "Nearby", "Far"]} onChange={(region) => patchSettings({ region })} />
              <CycleRow label="Show FPS" value={s.showNet ? "On" : "Off"} options={["Off", "On"]} onChange={(v) => patchSettings({ showNet: v === "On" })} />
              <p className="text-sm text-muted">Matches run on this device. You are the only builder in the round.</p>
            </>
          )}
          {tab === "audio" && (
            <>
              <SliderRow label="Master" value={s.master} min={0} max={100} suffix="%" onChange={(master) => patchSettings({ master })} />
              <SliderRow label="Music" value={s.music} min={0} max={100} suffix="%" onChange={(music) => patchSettings({ music })} />
              <SliderRow label="Effects" value={s.sfx} min={0} max={100} suffix="%" onChange={(sfx) => patchSettings({ sfx })} />
            </>
          )}
        </div>
      </div>
      <div className="flex justify-end p-3">
        <button className="rounded-xl bg-panel px-6 py-3 font-display" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function CycleRow({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const i = Math.max(0, options.indexOf(value));
  const shift = (d: number) => onChange(options[(i + d + options.length) % options.length]!);
  return (
    <div className="flex items-center gap-2 rounded-lg bg-panel/85">
      <div className="w-40 px-3 py-3 text-sm font-bold">{label}</div>
      <button aria-label={`Previous ${label}`} className="grid h-10 w-10 place-items-center rounded-md bg-line" onClick={() => shift(-1)}>
        <ChevronLeft size={18} />
      </button>
      <div className="flex-1 text-center font-extrabold">{value}</div>
      <button aria-label={`Next ${label}`} className="grid h-10 w-10 place-items-center rounded-md bg-line" onClick={() => shift(1)}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function SliderRow({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-lg bg-panel/85 px-3 py-3">
      <span className="w-40 text-sm font-bold">{label}</span>
      <input className="range flex-1" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-14 text-right font-extrabold">
        {Math.round(value)}
        {suffix}
      </span>
    </label>
  );
}

function Locker({ onBack, toast }: { onBack: () => void; toast: (s: string) => void }) {
  const save = getSave();
  const [tab, setTab] = useState<"characters" | "backpacks" | "pickaxes">("characters");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose = () => {};
    let dead = false;
    void import("@/game/preview").then(({ mountPreview }) => {
      if (dead || !canvasRef.current) return;
      dispose = mountPreview(canvasRef.current, save.skinId, save.backpackId, save.pickaxeId);
    });
    return () => {
      dead = true;
      dispose();
    };
  }, [save.skinId, save.backpackId, save.pickaxeId]);

  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-3xl">Locker</h1>
        <button className="rounded-xl bg-panel px-4 py-2 font-bold" onClick={onBack}>
          Back
        </button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-16 flex-col gap-2 sm:w-28">
          {(
            [
              ["characters", "Skins"],
              ["backpacks", "Packs"],
              ["pickaxes", "Picks"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`rounded-xl px-2 py-3 text-xs font-extrabold sm:text-sm ${tab === id ? "bg-play text-gold-ink" : "bg-panel"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="settings-scroll grid min-w-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3">
          {tab === "characters" &&
            SKINS.map((skin) => (
              <button
                key={skin.id}
                onClick={() => {
                  if (!owns(skin.id)) {
                    toast("Buy it in the shop");
                    return;
                  }
                  patchSave({ skinId: skin.id });
                }}
                className={`rounded-xl p-2 text-left ${save.skinId === skin.id ? "ring-4 ring-gold" : "bg-panel/70"}`}
                style={{ background: skin.accent }}
              >
                <div className="font-display text-lg text-bg-deep">{skin.name}</div>
                <div className="text-xs font-bold text-bg-deep/80">{owns(skin.id) ? "Owned" : "Locked"}</div>
              </button>
            ))}
          {tab !== "characters" &&
            GEAR.filter((g) => (tab === "backpacks" ? g.kind === "backpack" : g.kind === "pickaxe")).map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  if (!owns(g.id)) {
                    toast("Buy it in the shop");
                    return;
                  }
                  patchSave(g.kind === "backpack" ? { backpackId: g.id } : { pickaxeId: g.id });
                }}
                className={`rounded-xl bg-panel p-3 text-left ${(g.kind === "backpack" ? save.backpackId : save.pickaxeId) === g.id ? "ring-4 ring-gold" : ""}`}
              >
                <div className="mb-2 h-8 w-8 rounded-md" style={{ background: g.primary }} />
                <div className="font-extrabold">{g.name}</div>
                <div className="text-xs text-muted">{owns(g.id) ? "Owned" : "Locked"}</div>
              </button>
            ))}
        </div>
        <div className="hidden w-64 sm:block">
          <canvas ref={canvasRef} className="h-80 w-full" />
          <div className="text-center font-display text-xl">{skinById(save.skinId).name}</div>
        </div>
      </div>
    </div>
  );
}

function Shop({ onBack, toast }: { onBack: () => void; toast: (s: string) => void }) {
  const save = getSave();
  const items = [
    ...SKINS.filter((s) => s.currency !== "free").map((s) => ({ id: s.id, name: s.name, kind: "Skin", price: s.price, currency: s.currency, swatch: s.accent })),
    ...GEAR.filter((g) => g.currency !== "free").map((g) => ({ id: g.id, name: g.name, kind: g.kind, price: g.price, currency: g.currency, swatch: g.primary })),
  ];
  return (
    <div className="flex h-full flex-col p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="font-display text-3xl">Daily shop</h1>
        <div className="flex items-center gap-2">
          <Currencies onSettings={onBack} />
        </div>
      </div>
      <div className="settings-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const owned = owns(item.id);
          return (
            <button
              key={item.id}
              disabled={owned}
              onClick={() => {
                const err = buy(item.id, item.price, item.currency === "gems" ? "gems" : "gold");
                toast(err ?? `Unlocked ${item.name}`);
                if (!err && SKINS.some((s) => s.id === item.id)) patchSave({ skinId: item.id });
              }}
              className="overflow-hidden rounded-2xl bg-bg-deep/50 text-left"
            >
              <div className="relative h-24" style={{ background: item.swatch }}>
                {owned && <span className="absolute top-2 left-2 rounded-md bg-ok px-2 py-0.5 text-xs font-extrabold text-bg-deep">OWNED</span>}
              </div>
              <div className="p-3">
                <div className="font-extrabold">{item.name}</div>
                <div className="text-xs text-muted">{item.kind}</div>
                <div className="mt-1 font-extrabold">
                  {owned ? "Purchased" : item.currency === "gems" ? `${item.price} gems` : `${item.price} gold`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <Redeem />
    </div>
  );
}

function Redeem() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(redeem(code));
        setCode("");
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Redeem code"
        aria-label="Redeem code"
        className="w-48 rounded-xl bg-bg-deep/60 px-3 py-3 outline-none"
      />
      <button className="rounded-xl bg-panel px-4 py-3 font-extrabold" type="submit">
        Redeem
      </button>
      {msg && <span className="text-sm font-bold">{msg}</span>}
    </form>
  );
}

function Stats({ onBack }: { onBack: () => void }) {
  const s = getSave().stats;
  const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
  const rows = [
    ["Matches", s.matches],
    ["Wins", s.wins],
    ["Eliminations", s.elims],
    ["Accuracy", `${acc}%`],
    ["Best streak", s.bestStreak],
    ["Gold earned", s.goldEarned],
  ];
  return (
    <div className="mx-auto flex h-full max-w-lg flex-col p-4">
      <h1 className="mb-4 font-display text-3xl">Record</h1>
      <div className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={String(k)} className="flex items-center justify-between rounded-xl bg-panel/80 px-4 py-3">
            <span className="font-bold">{k}</span>
            <span className="font-display text-xl">{v}</span>
          </div>
        ))}
      </div>
      <button className="mt-4 self-start rounded-xl bg-bg-deep/50 px-5 py-3 font-display" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

const emptyPad = (): PadInput => ({
  moveX: 0,
  moveY: 0,
  lookX: 0,
  lookY: 0,
  jump: false,
  fire: false,
  aim: false,
  crouch: false,
  edit: false,
  reload: false,
  wall: false,
  floor: false,
  ramp: false,
  roof: false,
});

function Match({ modeId, onExit }: { modeId: string; onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pad = useRef<PadInput>(emptyPad());
  const api = useRef<{ dispose: () => void; setPaused: (p: boolean) => void } | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const applied = useRef(false);
  const [coarse, setCoarse] = useState(false);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    applied.current = false;
    const save = getSave();
    void import("@/game/character")
      .then(({ whenWorkerReady }) => whenWorkerReady())
      .then(() => import("@/game/engine"))
      .then(({ mountMatch }) => {
      if (dead) return;
      try {
        api.current = mountMatch(canvas, {
          modeId,
          skinId: save.skinId,
          pickaxeId: save.pickaxeId,
          backpackId: save.backpackId,
          getSettings: () => getSave().settings,
          pad: pad.current,
          onHud: (h) => {
            if (!dead) setHud(h);
          },
          onEnd: (r) => {
            if (applied.current) return;
            applied.current = true;
            if (modeById(modeId).aim) return;
            applyMatchResult({ win: r.win, elims: r.elims, shots: r.shots, hits: r.hits, streak: r.streak, gold: r.gold, xp: r.xp });
            setResult(r);
          },
          onPause: () => setPaused(true),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start the match");
      }
    })
      .catch((err) => {
        if (!dead) setError(err instanceof Error ? err.message : "Could not load the character");
      });
    return () => {
      dead = true;
      api.current?.dispose();
      api.current = null;
    };
  }, [modeId, nonce]);

  const mode = modeById(modeId);
  const ui = getSave().settings.uiScale / 100;

  return (
    <div className="relative h-full w-full touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {hud && <Hud hud={hud} modeName={mode.name} aim={mode.aim} ui={ui} />}
      {hud && !hud.pointerLocked && !coarse && !paused && !result && (
        <button className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-bg-deep/80 px-4 py-2 text-sm font-extrabold" onClick={() => canvasRef.current?.requestPointerLock()}>
          Click to look
        </button>
      )}
      {coarse && !paused && !result && (
        <TouchPad
          pad={pad.current}
          onLookStart={(e) => {
            lookId.current = e.pointerId;
            lookLast.current = { x: e.clientX, y: e.clientY };
          }}
          onLookMove={(e) => {
            if (lookId.current !== e.pointerId) return;
            const dx = e.clientX - lookLast.current.x;
            const dy = e.clientY - lookLast.current.y;
            lookLast.current = { x: e.clientX, y: e.clientY };
            pad.current.lookX += dx;
            pad.current.lookY += dy;
          }}
          onLookEnd={(e) => {
            if (lookId.current === e.pointerId) lookId.current = null;
          }}
        />
      )}
      <button
        aria-label="Menu"
        className="absolute top-3 right-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-bg-deep/70"
        onClick={() => {
          setPaused(true);
          api.current?.setPaused(true);
        }}
      >
        <Settings size={18} />
      </button>
      {(paused || error) && !result && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-bg-deep/55 p-4">
          <div className="pop-in w-full max-w-sm rounded-2xl bg-panel p-5 text-center">
            <div className="font-display text-3xl">{error ? "Graphics error" : "Paused"}</div>
            {error && <p className="mt-2 text-sm">{error}</p>}
            {!error && (
              <button
                className="mt-4 w-full rounded-xl bg-play py-3 font-display text-xl text-gold-ink"
                onClick={() => {
                  setPaused(false);
                  api.current?.setPaused(false);
                  canvasRef.current?.requestPointerLock();
                }}
              >
                Resume
              </button>
            )}
            <button className="mt-2 w-full rounded-xl bg-bg-deep/40 py-3 font-bold" onClick={onExit}>
              Leave match
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-bg-deep/60 p-4">
          <div className="pop-in w-full max-w-md rounded-2xl bg-panel p-6 text-center">
            <div className="font-display text-4xl">{result.title}</div>
            <p className="mt-1 text-muted">{result.subtitle}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Stat n={result.placement} l="Place" />
              <Stat n={result.elims} l="Elims" />
              <Stat n={result.gold} l="Gold" />
            </div>
            <button
              className="mt-5 w-full rounded-xl bg-play py-3 font-display text-xl text-gold-ink"
              onClick={() => {
                setResult(null);
                setPaused(false);
                setNonce((n) => n + 1);
              }}
            >
              Rematch
            </button>
            <button className="mt-2 w-full rounded-xl bg-bg-deep/40 py-3 font-bold" onClick={onExit}>
              Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-xl bg-bg-deep/40 py-2">
      <div className="font-display text-2xl">{n}</div>
      <div className="text-xs font-bold text-muted">{l}</div>
    </div>
  );
}

function Hud({ hud, modeName, aim, ui }: { hud: HudState; modeName: string; aim: boolean; ui: number }) {
  const showCross = getSave().settings.showCrosshair;
  const net = getSave().settings.showNet;
  const slots = ["Pick", "AR", "SG", "SMG", "SR", "Meds"];
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zoom: ui }}>
      <div className="absolute top-3 left-3">
        <Minimap data={hud.minimap} />
      </div>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 text-center drop-shadow-[0_2px_0_rgba(0,0,0,0.45)]">
        <div className="font-display text-sm tracking-wide">{modeName}</div>
        {hud.teams && (
          <div className="font-extrabold">
            <span className="text-gem">{hud.scoreBlue}</span>
            <span className="px-1 text-muted">-</span>
            <span className="text-danger">{hud.scoreRed}</span>
          </div>
        )}
        {!aim && (
          <div className="text-xs font-bold">
            {hud.alive}/{hud.total} up · {hud.elims} elims
            {hud.stormEta >= 0 && <span> · zone {Math.ceil(hud.stormEta)}s</span>}
          </div>
        )}
        {aim && (
          <div className="font-display text-xl">
            {hud.aimScore} <span className="text-sm">streak {hud.aimStreak}</span>
          </div>
        )}
        {net && <div className="text-xs font-bold">{hud.fps} FPS</div>}
      </div>
      <div className="absolute top-3 right-3 grid grid-cols-2 gap-1.5">
        {(
          [
            ["wall", "Wall", "R"],
            ["floor", "Floor", "F"],
            ["ramp", "Ramp", "E"],
            ["pyramid", "Cone", "C"],
          ] as const
        ).map(([id, label, key]) => (
          <div
            key={id}
            className={`flex h-11 w-[4.6rem] items-center gap-1 rounded-md border-2 px-1.5 text-[10px] font-extrabold shadow-md ${hud.build === id ? "border-white bg-gold text-bg-deep" : "border-white/70 bg-bg-deep/70"}`}
          >
            <BuildGlyph kind={id} />
            <span>
              {label}
              <span className="block text-[9px] opacity-80">{key}</span>
            </span>
          </div>
        ))}
      </div>
      {showCross && (
        <div className="absolute top-1/2 left-1/2" style={{ transform: "translate(-50%, -50%)" }}>
          <i className="absolute h-[3px] w-2.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" style={{ left: -hud.gap - 10, top: -1 }} />
          <i className="absolute h-[3px] w-2.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" style={{ left: hud.gap, top: -1 }} />
          <i className="absolute h-2.5 w-[3px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" style={{ top: -hud.gap - 10, left: -1 }} />
          <i className="absolute h-2.5 w-[3px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.65)]" style={{ top: hud.gap, left: -1 }} />
          <i className="absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          {hud.hit > 0 && <div className={`absolute -top-3.5 -left-3.5 h-7 w-7 rounded-full border-2 ${hud.head ? "border-gold" : "border-white"}`} />}
        </div>
      )}
      {hud.phase === "countdown" && <div className="absolute top-1/3 left-1/2 -translate-x-1/2 font-display text-7xl drop-shadow-[0_4px_0_rgba(0,0,0,0.35)]">{hud.countdown}</div>}
      {hud.banner && <div className="absolute top-[42%] left-1/2 -translate-x-1/2 rounded-full bg-bg-deep/80 px-4 py-1 text-sm font-extrabold">{hud.banner}</div>}
      {hud.inStorm && <div className="absolute inset-0 shadow-[inset_0_0_90px_rgba(90,140,255,0.6)]" />}
      {hud.hurt > 0 && <div className="absolute inset-0 shadow-[inset_0_0_90px_rgba(220,40,40,0.45)]" />}
      {hud.edit && <div className="absolute bottom-32 left-1/2 -translate-x-1/2 rounded-full bg-panel px-3 py-1 text-xs font-extrabold">Drag across the squares · gold is the cut · release to apply · scroll to reset · Q done</div>}
      <div className="absolute bottom-4 left-4 w-56">
        <div className="relative h-8 overflow-hidden rounded-md border-[3px] border-bg-deep bg-bg-deep shadow-[0_3px_0_rgba(0,0,0,0.35)]">
          <div className="absolute inset-y-0 left-0 bg-hp" style={{ width: `${Math.max(0, Math.min(100, hud.hp))}%` }} />
          <div className="relative px-2 font-display text-xl leading-8 text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.55)]">{Math.ceil(hud.hp)}</div>
        </div>
        <div className="relative mt-1 h-3.5 overflow-hidden rounded-sm border-2 border-bg-deep bg-bg-deep/80">
          <div className="absolute inset-y-0 left-0 bg-gem" style={{ width: `${Math.max(0, Math.min(100, hud.shield))}%` }} />
          {hud.shield > 0 && <div className="relative px-1.5 text-[10px] font-extrabold leading-3 text-white">{Math.ceil(hud.shield)}</div>}
        </div>
        {hud.healing > 0 && (
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg-deep/70">
            <div className="h-full bg-play" style={{ width: `${hud.healing * 100}%` }} />
          </div>
        )}
        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-bg-deep/75 px-2 py-1 text-sm font-extrabold">
          <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[#e0a85c] shadow-[inset_0_0_0_1px_rgba(90,50,20,0.6)]" />
          {hud.infiniteWood ? "∞" : hud.wood}
        </div>
      </div>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-end gap-1">
        {slots.map((n, i) => (
          <div
            key={n}
            className={`grid place-items-center rounded-md border-[3px] text-[10px] font-extrabold shadow-md ${!hud.build && hud.slot === i ? "h-16 w-14 border-gold bg-bg-deep text-white" : "h-12 w-12 border-white/50 bg-bg-deep/75"}`}
          >
            {n}
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 right-4 max-w-40 rounded-md bg-bg-deep/75 px-2 py-1 text-right text-xs font-extrabold">
        {hud.weapon}
        {hud.build ? "" : hud.slot === 0 || hud.slot === 5 ? (hud.slot === 5 ? ` · ${hud.heals}` : "") : hud.reloading ? " · reloading" : ` · ${hud.mag}/${hud.reserve}`}
      </div>
      <div className="absolute top-28 right-3 space-y-1 text-right text-xs font-bold drop-shadow">
        {hud.feed.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
      {hud.floaters.map((f, i) => (
        <div key={i} className={`absolute font-extrabold drop-shadow ${f.crit ? "text-gold" : "text-white"}`} style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}
      {hud.buildHp != null && (
        <div className="absolute bottom-36 left-1/2 h-1.5 w-24 -translate-x-1/2 overflow-hidden rounded-full bg-bg-deep/70">
          <div className="h-full bg-play" style={{ width: `${hud.buildHp * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function BuildGlyph({ kind }: { kind: "wall" | "floor" | "ramp" | "pyramid" }) {
  if (kind === "wall") return <span className="inline-block h-6 w-3.5 rounded-[2px] bg-white/90" />;
  if (kind === "floor") return <span className="inline-block h-2.5 w-6 rounded-[2px] bg-white/90" />;
  if (kind === "ramp") return <span className="inline-block h-0 w-0 border-r-[14px] border-b-[18px] border-r-transparent border-b-white/90" />;
  return <span className="inline-block h-4 w-4 rotate-45 bg-white/90" />;
}

function Minimap({ data }: { data: HudState["minimap"] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const w = c.width;
    const h = c.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(20,90,40,0.85)";
    g.fillRect(0, 0, w, h);
    const b = data.bounds;
    const mapX = (x: number) => ((x / b) * 0.5 + 0.5) * w;
    const mapY = (z: number) => ((z / b) * 0.5 + 0.5) * h;
    if (data.storm) {
      g.strokeStyle = "rgba(160,200,255,0.9)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(mapX(data.storm.x), mapY(data.storm.z), (data.storm.r / b) * w * 0.5, 0, Math.PI * 2);
      g.stroke();
    }
    for (const d of data.dots) {
      g.fillStyle = d.team === 1 ? "#8ad7ff" : d.team === 3 ? "#ffe08a" : "#ff8d8d";
      g.fillRect(mapX(d.x) - 2, mapY(d.z) - 2, 4, 4);
    }
    g.save();
    g.translate(mapX(data.px), mapY(data.pz));
    g.rotate(data.yaw);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4, 5);
    g.lineTo(-4, 5);
    g.fill();
    g.restore();
  }, [data]);
  return <canvas ref={ref} width={160} height={160} className="h-28 w-28 rounded-full border-[3px] border-white shadow-[0_4px_0_rgba(0,0,0,0.35)] sm:h-36 sm:w-36" />;
}

function TouchPad({
  pad,
  onLookStart,
  onLookMove,
  onLookEnd,
}: {
  pad: PadInput;
  onLookStart: (e: React.PointerEvent) => void;
  onLookMove: (e: React.PointerEvent) => void;
  onLookEnd: (e: React.PointerEvent) => void;
}) {
  const stick = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  return (
    <>
      <div
        className="absolute inset-y-0 right-0 z-20 w-1/2"
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
      />
      <div
        className="absolute bottom-28 left-4 z-30 h-32 w-32 rounded-full border-2 border-ink/50 bg-bg-deep/40"
        onPointerDown={(e) => {
          stick.current = e.pointerId;
          origin.current = { x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (stick.current !== e.pointerId) return;
          const dx = (e.clientX - origin.current.x) / 48;
          const dy = (e.clientY - origin.current.y) / 48;
          pad.moveX = Math.max(-1, Math.min(1, dx));
          pad.moveY = Math.max(-1, Math.min(1, -dy));
        }}
        onPointerUp={() => {
          stick.current = null;
          pad.moveX = 0;
          pad.moveY = 0;
        }}
      />
      <div className="absolute right-4 bottom-28 z-30 flex flex-col gap-2">
        <Hold label="Fire" on={(v) => (pad.fire = v)} />
        <Hold label="Aim" on={(v) => (pad.aim = v)} />
        <Hold label="Jump" on={(v) => (pad.jump = v)} />
        <Hold label="Build" on={(v) => (pad.wall = v)} />
      </div>
    </>
  );
}

function Hold({ label, on }: { label: string; on: (v: boolean) => void }) {
  return (
    <button
      className="pointer-events-auto h-14 w-20 rounded-2xl bg-bg-deep/70 text-sm font-extrabold"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        on(true);
      }}
      onPointerUp={() => on(false)}
      onPointerCancel={() => on(false)}
    >
      {label}
    </button>
  );
}

void Users;
void Backpack;
void X;
void gearById;
void Home;
