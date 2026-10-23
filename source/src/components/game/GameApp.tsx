import { useEffect, useRef, useState, type ComponentType } from "react";
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
  EMOTES,
  emoteItemId,
  MODES,
  keyLabel,
  levelFromXp,
  PASS_TIERS,
  passProgress,
  passTier,
  modeById,
  gearById,
  type Action,
  type ModeId,
  type Settings as SettingsT,
} from "@/game/core/content";
import {
  applyMatchResult,
  getSave,
  loadSave,
  patchSave,
  patchSettings,
  playerLevel,
  resetBinds,
  setBind,
  subscribe,
  unclaimedTiers,
} from "@/game/core/save";
import type { BuildMat, HudState, MatchResult, PadInput } from "@/game/core/engine";
import { crazy, initCrazyGames } from "@/lib/crazygames";
import { BattlePass, Locker, PassIcon, Shop } from "@/components/game/Cosmetics";
import lobbyBg from "@/assets/ui/lobby-bg.jpg?url";
import loadSquad from "@/assets/ui/load-squad.jpg?url";
import loadGlide from "@/assets/ui/load-glide.jpg?url";
import loadChest from "@/assets/ui/load-chest.jpg?url";

type Screen = "lobby" | "modes" | "settings" | "locker" | "shop" | "pass" | "stats" | "match";

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

/** Matchmaking: Play waits this long in the lobby before loading onto the spawn island. */
const QUEUE_SECS = urlNumber("queue") ?? 60;
/** If the lobby isn't full after this long in the queue, the empty slots are filled with bots. */
const BOT_FILL_AFTER = Math.min(10, QUEUE_SECS);
const LOBBY_SIZE = 16;

function urlNumber(key: string) {
  try {
    const v = new URLSearchParams(window.location.search).get(key);
    if (v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export type QueueState = { start: number; now: number };

/**
 * What the matchmaking queue shows at a given time. This build has no online matchmaking service, so
 * no other real players are ever found: after BOT_FILL_AFTER seconds the remaining slots fill with bots
 * (they "ready up" one by one), then the match loads when the queue time is up.
 */
function queueInfo(q: QueueState) {
  const t = (q.now - q.start) / 1000;
  const real = 1;
  const fillT = Math.max(0, t - BOT_FILL_AFTER);
  const bots = t < BOT_FILL_AFTER ? 0 : Math.min(LOBBY_SIZE - real, Math.floor(fillT / 0.18) + 1);
  return { t, real, bots, players: real + bots, left: Math.max(0, QUEUE_SECS - t), filling: t >= BOT_FILL_AFTER };
}

export function GameApp() {
  const { save } = useSave();
  const [screen, setScreen] = useState<Screen>("lobby");
  const [toast, setToast] = useState("");
  const [queue, setQueue] = useState<QueueState | null>(null);
  const [matchBots, setMatchBots] = useState(LOBBY_SIZE - 1);

  // matchmaking clock
  useEffect(() => {
    if (!queue) return;
    const id = window.setInterval(() => {
      setQueue((q) => {
        if (!q) return q;
        const now = performance.now();
        if ((now - q.start) / 1000 >= QUEUE_SECS) {
          const info = queueInfo({ start: q.start, now });
          setMatchBots(LOBBY_SIZE - info.real);
          setScreen("match");
          return null;
        }
        return { ...q, now };
      });
    }, 200);
    return () => window.clearInterval(id);
  }, [queue !== null]);

  const play = () => {
    if (modeById(getSave().modeId).map === "island") {
      const now = performance.now();
      setQueue({ start: now, now });
    } else setScreen("match");
  };

  useEffect(() => {
    // CrazyGames: menus are interactive now; pick up the player's CrazyGames name if they have one
    void initCrazyGames().then(async (ok) => {
      if (!ok) return;
      crazy.loadingStop();
      const name = await crazy.username();
      if (name && getSave().name === "Builder") patchSave({ name: name.slice(0, 16) });
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  return (
    <main className="hex-bg relative h-dvh w-full overflow-hidden text-ink">
      {screen !== "match" && <MenuBackdrop lobby={screen === "lobby"} />}
      <div className="relative z-10 h-full">
      {screen === "lobby" && <Lobby onGo={setScreen} onPlay={play} queue={queue} onCancel={() => setQueue(null)} />}
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
      {screen === "locker" && <Locker onBack={() => setScreen("lobby")} toast={setToast} currencies={<Currencies onSettings={() => setScreen("settings")} />} />}
      {screen === "shop" && <Shop onBack={() => setScreen("lobby")} toast={setToast} currencies={<Currencies onSettings={() => setScreen("settings")} />} />}
      {screen === "pass" && <BattlePass onBack={() => setScreen("lobby")} toast={setToast} currencies={<Currencies onSettings={() => setScreen("settings")} />} />}
      {screen === "stats" && <Stats onBack={() => setScreen("lobby")} />}
      {screen === "match" && (
        <Match
          modeId={save.modeId}
          bots={matchBots}
          onExit={() => setScreen("lobby")}
          onRequeue={() => {
            setScreen("lobby");
            play();
          }}
        />
      )}
      </div>
      {queue && screen !== "lobby" && screen !== "match" && (
        <div className="absolute top-3 left-1/2 z-40 -translate-x-1/2">
          <QueueCard queue={queue} onCancel={() => setQueue(null)} compact />
        </div>
      )}
      {toast && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-bg-deep px-4 py-2 text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}

/** Island art behind every menu: a slow drift over the island, darkened at the edges, with a lit stage in the lobby. */
function MenuBackdrop({ lobby }: { lobby: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <img src={lobbyBg} alt="" className="menu-drift absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,rgba(8,30,80,0)_0%,rgba(8,30,80,0.35)_55%,rgba(6,20,60,0.85)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#06163d]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#06163d]/90 to-transparent" />
      {lobby && (
        <div className="absolute top-1/2 left-1/2 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2">
          <div className="stage-rays absolute inset-0 rounded-full" />
          <div className="absolute inset-[22%] rounded-full bg-[radial-gradient(circle,rgba(160,215,255,0.55)_0%,rgba(90,160,255,0.22)_40%,rgba(40,90,200,0)_70%)]" />
        </div>
      )}
      {!lobby && <div className="absolute inset-0 bg-[#06204f]/55 backdrop-blur-[2px]" />}
    </div>
  );
}

function TopNav({ active, onGo }: { active: Screen; onGo: (s: Screen) => void }) {
  const items: NavItem[] = [
    { id: "lobby", icon: Home, label: "Lobby" },
    { id: "pass", icon: PassIcon, label: "Battle Pass" },
    { id: "locker", icon: Swords, label: "Locker" },
    { id: "shop", icon: ShoppingCart, label: "Item Shop" },
    { id: "stats", icon: BarChart3, label: "Career" },
  ];
  const badge = unclaimedTiers();
  return (
    <>
      <nav className="hidden items-end gap-6 px-2 md:flex" aria-label="Main">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onGo(item.id)}
            className={`relative pb-1.5 font-display text-2xl tracking-wide uppercase italic transition-colors ${active === item.id ? "text-white" : "text-white/55 hover:text-white/90"}`}
          >
            {item.id === "lobby" ? "Play" : item.id === "shop" ? "Shop" : item.label}
            {item.id === "pass" && badge > 0 && <span className="absolute -top-1 -right-3 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 font-sans text-[11px] font-black text-white not-italic">{badge}</span>}
            {active === item.id && <span className="absolute inset-x-0 -bottom-0.5 h-1 rounded-full bg-play shadow-[0_0_12px_rgba(255,214,90,0.9)]" />}
          </button>
        ))}
      </nav>
      <NavIcons items={items} active={active} onGo={onGo} badge={badge} />
    </>
  );
}

type NavItem = { id: Screen; icon: ComponentType<{ size?: number; className?: string }>; label: string };
function NavIcons({ items, active, onGo, badge }: { items: NavItem[]; active: Screen; onGo: (s: Screen) => void; badge: number }) {
  return (
    <nav className="flex items-center gap-1 rounded-full bg-bg-deep/80 p-1 shadow-lg md:hidden">
      {items.map((item) => (
        <button
          key={item.id}
          aria-label={item.label}
          onClick={() => onGo(item.id)}
          className={`relative flex h-11 w-12 items-center justify-center rounded-full ${active === item.id ? "bg-panel text-ink" : "text-muted hover:text-ink"}`}
        >
          <item.icon size={20} />
          {item.id === "pass" && badge > 0 && <span className="absolute top-1.5 right-2.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-bg-deep" />}
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

/** Try emotes on your skin in the lobby. */
function LobbyEmotes({ onShop }: { onShop: () => void }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState<string | null>(null);
  const play = (id: string | null) => {
    setCur(id);
    void import("@/game/player/preview").then(({ previewEmote }) => previewEmote(id));
  };
  useEffect(() => () => void import("@/game/player/preview").then(({ previewEmote }) => previewEmote(null)), []);
  return (
    <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      {open && (
        <div className="pop-in grid grid-cols-4 gap-1.5 rounded-xl bg-black/55 p-2 ring-1 ring-white/20">
          {EMOTES.map((em) => {
            const have = getSave().owned.includes(emoteItemId(em.id));
            return (
              <button
                key={em.id}
                type="button"
                title={have ? em.name : `${em.name}: buy it in the Item Shop`}
                onClick={() => (have ? play(cur === em.id ? null : em.id) : onShop())}
                className={`relative flex w-[68px] flex-col items-center rounded-lg px-1 py-1.5 text-white ring-1 ${cur === em.id ? "bg-[#1a7ded] ring-white" : "bg-[#0b2a66]/90 ring-white/20 hover:bg-[#164b9e]"} ${have ? "" : "opacity-60"}`}
              >
                <span className="text-2xl leading-none">{em.icon}</span>
                <span className="hud-label mt-0.5 text-[9px] leading-tight">{em.name}</span>
                {!have && (
                  <span className="hud-label mt-0.5 rounded bg-black/50 px-1 text-[9px] leading-tight text-gold">
                    {em.currency === "gems" ? "💎" : "🪙"} {em.price}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          if (open) play(null);
          setOpen(!open);
        }}
        className="hud-label rounded-full bg-[#0b2a66]/90 px-4 py-1.5 text-sm text-white ring-1 ring-white/40 hover:bg-[#1a7ded]"
      >
        {open ? "Stop emote" : "Emotes"}
      </button>
    </div>
  );
}

function Lobby({ onGo, onPlay, queue, onCancel }: { onGo: (s: Screen) => void; onPlay: () => void; queue: QueueState | null; onCancel: () => void }) {
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
    void import("@/game/player/preview").then(({ mountPreview }) => {
      if (dead || !canvasRef.current) return;
      dispose = mountPreview(canvasRef.current, save.skinId, "none-pack", save.pickaxeId);
    });
    return () => {
      dead = true;
      dispose();
    };
  }, [save.skinId, save.backpackId, save.pickaxeId]);

  // the round avatar shows the outfit you have on
  const [avatar, setAvatar] = useState("");
  useEffect(() => {
    let dead = false;
    void import("@/game/player/thumbs")
      .then((m) => m.skinHeadshot(save.skinId))
      .then((u) => {
        if (!dead) setAvatar(u);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [save.skinId]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-bg-deep/55 p-2 pr-4">
          <div className="relative grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-panel">
            {avatar ? <img src={avatar} alt="" draggable={false} className="h-full w-full scale-110 object-cover" /> : <span className="font-display text-lg">{save.name.slice(0, 1).toUpperCase()}</span>}
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

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="m-3 hidden w-56 flex-col gap-3 self-start lg:flex">
        <button
          onClick={() => onGo("shop")}
          className="flex flex-col overflow-hidden rounded-xl border-2 border-white/60 bg-[#0b2a66]/85 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <div className="relative h-32">
            <img src={loadChest} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#0b2a66] to-transparent" />
            <span className="absolute top-2 left-2 rounded bg-play px-1.5 py-0.5 font-display text-xs text-[#2a1d00] uppercase">New</span>
          </div>
          <div className="px-3 pb-3">
            <div className="font-display text-xs tracking-widest text-play uppercase">Item Shop · Daily Drop</div>
            <div className="font-display text-lg leading-tight uppercase italic">New gliders in stock</div>
          </div>
        </button>
        <button
          onClick={() => onGo("pass")}
          className="relative rounded-xl border-2 border-white/60 bg-[#0b2a66]/85 p-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center justify-between">
            <div className="font-display text-xs tracking-widest text-gem uppercase">Battle Pass</div>
            {unclaimedTiers() > 0 && <span className="rounded-full bg-danger px-2 text-[11px] font-black text-white">{unclaimedTiers()} to claim</span>}
          </div>
          <div className="font-display text-2xl leading-none uppercase italic">
            Tier {passTier(save.xp)}
            <span className="text-base text-white/50"> / {PASS_TIERS.length}</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/40">
            <div className="xp-fill h-full rounded-full" style={{ width: `${Math.round(passProgress(save.xp) * 100)}%` }} />
          </div>
        </button>
        </div>

        <div className="relative min-h-48 flex-1">
          <canvas ref={canvasRef} className="h-full w-full" />
          <LobbyEmotes onShop={() => onGo("shop")} />
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 text-center">
            <div className="font-display text-2xl drop-shadow">{save.name}</div>
            <div className="text-sm font-extrabold text-ok">ready</div>
          </div>
        </div>

        <div className="flex flex-col items-end justify-end gap-2 p-3 sm:p-4">
          <button onClick={() => onGo("modes")} className="group w-64 overflow-hidden rounded-xl border-2 border-white/70 bg-[#0b2a66]/85 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:w-80">
            <div className="[@media(max-height:520px)]:hidden">
              <ModeArt id={mode.id} />
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <div>
                <div className="font-display text-xl leading-none uppercase italic">{mode.name}</div>
                <div className="text-[11px] font-extrabold tracking-widest text-muted">{mode.map === "island" ? "BATTLE ROYALE · SOLO · 16 PLAYERS" : "1V1 · FIRST TO 5 · BUILDS RESET"}</div>
              </div>
              <ChevronRight size={22} className="text-white/70 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
          {queue ? (
            <>
              <QueueCard queue={queue} onCancel={onCancel} />
              <button onClick={onCancel} className="w-64 rounded-lg border-2 border-white/40 bg-[#3a4458]/90 py-3 font-display text-3xl tracking-wide text-white uppercase italic hover:bg-[#4a556c] sm:w-80">
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setParty(true)} className="w-64 rounded-lg border-2 border-white/30 bg-[#0b2a66]/80 py-2 font-display text-base tracking-wide text-white uppercase sm:w-80">
                Party · Solo
              </button>
              <button onClick={onPlay} className="play-btn w-64 rounded-lg py-3 font-display text-4xl tracking-wide text-[#2a1d00] uppercase italic sm:w-80">
                Play
              </button>
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 bg-bg-deep/80 px-3 py-1.5 text-[11px] font-bold text-muted sm:text-xs">
        <span>{mode.map === "island" ? "16 players · solo" : "1v1 vs Rival"}</span>
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
            <p className="mb-4 text-sm text-muted">{modeById(save.modeId).map === "island" ? "Matchmaking fills the lobby to 16. Any empty slots are filled with bots, then everyone waits on the spawn island for the drop ship." : "1v1 against the Rival bot, first to 5 rounds."}</p>
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
                  onPlay();
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

/** Fortnite-style matchmaking status: elapsed time, players found and the countdown to the spawn island. */
function QueueCard({ queue, onCancel, compact = false }: { queue: QueueState; onCancel: () => void; compact?: boolean }) {
  const q = queueInfo(queue);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const status = !q.filling ? "Finding players" : q.players < LOBBY_SIZE ? "Not enough players · adding bots" : "Lobby full · match ready";
  return (
    <div className={`w-64 overflow-hidden rounded-lg border-2 border-white/60 bg-[#06163d]/90 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)] sm:w-80 ${compact ? "flex items-center gap-3 px-3 py-2" : ""}`}>
      {compact ? (
        <>
          <span className="queue-spin h-4 w-4 rounded-full border-2 border-white/30 border-t-[#ffd84a]" />
          <div className="flex-1">
            <div className="font-display text-sm leading-none text-white">Matchmaking {mmss(q.t)}</div>
            <div className="text-[11px] font-bold text-white/65">
              {q.players}/{LOBBY_SIZE} · spawn island in {Math.ceil(q.left)}s
            </div>
          </div>
          <button onClick={onCancel} className="rounded bg-white/15 px-2 py-1 font-display text-xs text-white hover:bg-white/25">
            Cancel
          </button>
        </>
      ) : (
        <div className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="queue-spin h-4 w-4 rounded-full border-2 border-white/30 border-t-[#ffd84a]" />
              <span className="font-display text-lg leading-none text-white italic">Matchmaking</span>
            </div>
            <span className="font-display text-lg leading-none text-[#ffd84a] tabular-nums">{mmss(q.t)}</span>
          </div>
          <div className="mt-1.5 text-xs font-bold text-white/75">{status}</div>
          <div className="mt-2 flex items-center gap-[3px]">
            {Array.from({ length: LOBBY_SIZE }, (_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-sm ${i < q.real ? "bg-[#ffd84a]" : i < q.players ? "bg-[#7fc4ff]" : "bg-white/15"}`} />
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-bold text-white/60">
            <span>
              {q.players}/{LOBBY_SIZE} players{q.bots > 0 ? ` · ${q.bots} bots` : ""}
            </span>
            <span>Spawn island in {Math.ceil(q.left)}s</span>
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
      {mode.map === "island" && <img src={loadGlide} alt="" className="absolute inset-0 z-10 h-full w-full object-cover" draggable={false} />}
      {mode.map === "island" && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 288 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <rect width="288" height="96" fill="#2f8fd8" />
          <path d="M60 70 C40 40 90 10 150 14 C210 18 250 34 236 62 C224 86 170 90 120 86 C90 84 70 82 60 70Z" fill="#e6d49a" />
          <path d="M70 66 C55 42 96 18 150 22 C204 26 238 38 226 60 C216 80 168 82 122 79 C94 77 78 76 70 66Z" fill="#5cb848" />
          <path d="M150 22 C148 40 140 60 150 82" stroke="#7fc8f0" strokeWidth="4" fill="none" />
          <path d="M100 52 L200 48" stroke="#e8e2d2" strokeWidth="3" />
          <g transform="translate(170 18)">
            <ellipse cx="0" cy="0" rx="26" ry="9" fill="#f3e3c3" />
            <rect x="6" y="-9" width="5" height="18" fill="#2fb8a0" />
            <rect x="-7" y="10" width="14" height="5" fill="#36475a" />
          </g>
        </svg>
      )}
      {mode.map === "duel" && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 288 96" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <defs>
            <linearGradient id="duelsky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fb4ff" />
              <stop offset="1" stopColor="#cfeaff" />
            </linearGradient>
          </defs>
          <rect width="288" height="96" fill="url(#duelsky)" />
          <path d="M20 70 L144 46 L268 70 L144 94 Z" fill="#2c4469" />
          <path d="M144 46 L268 70 L144 94 Z" fill="#643042" opacity="0.9" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path key={i} d={`M${20 + i * 20.7} ${70 - i * 4} L${144 + i * 20.7} ${94 - i * 4}`} stroke="#8ce6ff" strokeWidth="0.8" opacity="0.7" />
          ))}
          <path d="M20 70 L144 94 L268 70" stroke="#8ce6ff" strokeWidth="2" fill="none" />
          <ellipse cx="88" cy="71" rx="10" ry="3.5" fill="#3fa9ff" />
          <ellipse cx="200" cy="71" rx="10" ry="3.5" fill="#ff4f5e" />
          <rect x="84" y="50" width="8" height="20" rx="3" fill="#3fa9ff" />
          <rect x="196" y="50" width="8" height="20" rx="3" fill="#ff4f5e" />
          <text x="144" y="30" textAnchor="middle" fontSize="22" fontWeight="900" fill="#ffffff" fontStyle="italic" fontFamily="'Lilita One', sans-serif">
            1V1
          </text>
        </svg>
      )}
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/40 to-transparent" />
      <div className="absolute top-3 left-3 z-20 font-display text-sm text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">{mode.kicker}</div>
    </div>
  );
}

function ModeSelect({ selected, onPick, onBack }: { selected: string; onPick: (id: ModeId) => void; onBack: () => void }) {
  const [id, setId] = useState<ModeId>((MODES.some((m) => m.id === selected) ? selected : "royale") as ModeId);
  const blurb: Record<string, string[]> = {
    royale: ["Drop from the ferry onto Driftwood Isle", "15 rivals, loot, cars and the storm", "Last one standing wins"],
    duel: ["Skybox arena on the build grid", "Full mats, AR, pump, SMG and sniper", "First to 5 rounds · builds reset each round"],
  };
  return (
    <div className="flex h-full flex-col p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-bg-deep/85 text-white shadow-lg hover:bg-panel">
            <ChevronLeft size={24} />
          </button>
          <h1 className="font-display text-3xl uppercase italic sm:text-4xl">Select mode</h1>
        </div>
        <Currencies onSettings={onBack} />
      </div>
      <div className="settings-scroll grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto sm:grid-cols-2">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setId(mode.id)}
            onDoubleClick={() => onPick(mode.id)}
            className={`overflow-hidden rounded-2xl border-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform hover:-translate-y-0.5 ${id === mode.id ? "border-play shadow-[0_0_0_3px_#ffd21f,0_8px_24px_rgba(0,0,0,0.45)]" : "border-white/40"} bg-[#0b2a66]/90`}
          >
            <div className="[&>div]:h-40 sm:[&>div]:h-52">
              <ModeArt id={mode.id} />
            </div>
            <div className="p-4">
              <div className="font-display text-xs tracking-widest text-play uppercase">{mode.kicker}</div>
              <div className="font-display text-3xl leading-none uppercase italic">{mode.name}</div>
              <ul className="mt-2 space-y-0.5 text-sm font-bold text-white/75">
                {(blurb[mode.id] ?? [mode.detail]).map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="play-btn w-64 rounded-lg py-3 font-display text-2xl text-[#2a1d00] uppercase italic" onClick={() => onPick(id)}>
          Select
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
    // reset edit can also take the scroll wheel or a mouse button
    const wheel = (e: WheelEvent) => {
      if (capture !== "resetEdit") return;
      e.preventDefault();
      setBind(capture, "MouseWheel");
      setCapture(null);
    };
    const mouse = (e: MouseEvent) => {
      if (capture !== "resetEdit" || e.button === 0 || e.button === 2) return;
      e.preventDefault();
      setBind(capture, e.button === 1 ? "Mouse3" : e.button === 3 ? "Mouse4" : "Mouse5");
      setCapture(null);
    };
    window.addEventListener("keydown", fn, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    window.addEventListener("mousedown", mouse, true);
    return () => {
      window.removeEventListener("keydown", fn, true);
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("mousedown", mouse, true);
    };
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
              <CycleRow
                label="Reset edit"
                value={keyLabel(s.binds.resetEdit ?? "MouseWheel")}
                options={["Scroll wheel", "Middle mouse", "Mouse 4", "Mouse 5", "G"]}
                onChange={(v) => setBind("resetEdit", ({ "Scroll wheel": "MouseWheel", "Middle mouse": "Mouse3", "Mouse 4": "Mouse4", "Mouse 5": "Mouse5", G: "KeyG" } as Record<string, string>)[v] ?? "MouseWheel")}
              />
              <p className="pt-2 text-sm text-muted">Move with WASD or arrows. Jump Space, sprint Shift, crouch Z, open your backpack with I to move guns between slots. In Driftwood Royale press Space to leave the drop ship, X to open chests, M for the map, and swing your pickaxe at trees, rocks, cars and walls for materials. After the first hit a blue weak point appears: hit it for double materials. Build with R F E C, and right-click or press V to switch between wood, brick and metal. Wood goes up fastest, metal is toughest. New builds start as a frame and fill in over a second or two. Builds snap to the grid around you: walls go on the edge you face, floors, stairs and cones on the square in front of you (look straight down for your own square), always at the level you stand on. Standing on stairs, the next piece goes off their top. Press B for the emote wheel (moving, jumping or shooting stops an emote). Press Q to edit the piece in front of you, hold left click and drag across the squares, and release to apply. Right-click or scroll the mouse wheel to reset the edit. Out of edit mode, look at a build you edited and press Reset edit (the scroll wheel by default, change it above or under Keys) to put it straight back to normal. Walls edit as a 3×3 grid; floors, stairs and cones as 2×2. When the edit ends you go back to the piece you were holding. Up on your builds, new pieces snap to the level you are standing on.</p>
            </>
          )}
          {tab === "keys" && (
            <>
              <button className="mb-2 rounded-lg bg-panel px-3 py-2 text-sm font-extrabold" onClick={() => resetBinds()}>
                Reset all binds
              </button>
              {(Object.keys(s.binds) as Action[]).map((action) => (
                <div key={action} className="flex items-center gap-2 rounded-lg bg-panel/80">
                  <div className="w-36 px-3 py-2 text-sm font-bold capitalize">{action === "resetEdit" ? "reset edit" : action}</div>
                  <button className={`flex-1 rounded-md py-2 font-extrabold ${capture === action ? "bg-gold text-gold-ink" : "bg-bg-deep/50"}`} onClick={() => setCapture(action)}>
                    {capture === action ? (action === "resetEdit" ? "Press a key or scroll" : "Press a key") : keyLabel(s.binds[action])}
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
  material: false,
});

const LOAD_ART = [loadSquad, loadGlide, loadChest];
const LOAD_TIPS = [
  "Chests hide inside houses: check bedrooms, kitchens and corners. Listen for the shimmer.",
  "Hit the blue weak point while harvesting for double materials.",
  "Press Q on your own build to edit it. Drag across tiles and release to confirm.",
  "Up on your builds, new pieces snap to the level you're standing on.",
  "Wood builds fastest, metal is toughest. Swap materials with right-click or V.",
  "Jump from the ferry with Space. Your glider opens by itself near the ground.",
  "Guns come in five rarities: grey, green, blue, purple and gold. Gold hits hardest.",
  "The storm shrinks in phases. Keep an eye on the map with M.",
  "Doors open with X. Windows shatter, so don't hide behind glass.",
  "Parked cars can be driven: walk up and press X. Space brakes, and running into rivals hurts them.",
  "Cars soak up bullets for you, but a wrecked car explodes. Bail out before it blows.",
  "Level up to unlock Battle Pass tiers. Claim new gliders, outfits and gold in the Battle Pass tab.",
  "Hold right-click to aim down sights. Snipers scope in, and every gun gets far more accurate.",
  "Edit a wall's bottom two middle tiles for a real door. Press X to open and close it.",
  "Edit stairs by dragging a path: two tiles for half stairs, three for an L, four round for a U.",
  "Edit a cone by picking corners to raise: one for a peak, two for a ramp, opposite two for a tent.",
];

/** Full-screen loading art with a progress bar and a tip, shown until the first frame of the match. */
function LoadingScreen({ progress, label, title, sub, fading }: { progress: number; label: string; title: string; sub: string; fading: boolean }) {
  const [pick] = useState(() => ({ art: LOAD_ART[Math.floor(Math.random() * LOAD_ART.length)]!, tip: LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)]! }));
  return (
    <div className={`load-fade absolute inset-0 z-[60] overflow-hidden bg-[#06163d] ${fading ? "pointer-events-none opacity-0" : "opacity-100"}`}>
      <img src={pick.art} alt="" className="load-art absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#06163d]/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#06163d] via-[#06163d]/80 to-transparent" />
      <div className="absolute top-5 left-6 sm:top-8 sm:left-10">
        <div className="font-display text-4xl leading-none text-white uppercase italic drop-shadow-[0_3px_0_rgba(0,0,0,0.45)] sm:text-6xl">{title}</div>
        <div className="mt-1 font-display text-base tracking-widest text-play uppercase drop-shadow sm:text-xl">{sub}</div>
      </div>
      <div className="absolute inset-x-6 bottom-6 sm:inset-x-10 sm:bottom-9">
        <div className="mb-3 max-w-2xl rounded-lg bg-black/35 px-3 py-2 text-sm font-bold text-white/95 backdrop-blur-sm sm:text-base">
          <span className="mr-2 font-display tracking-wide text-play uppercase">Tip</span>
          {pick.tip}
        </div>
        <div className="flex items-end justify-between gap-4 pb-1.5">
          <div className="font-display text-lg tracking-wide text-white uppercase italic sm:text-2xl">{label}</div>
          <div className="font-display text-lg text-white/80 sm:text-2xl">{Math.round(progress * 100)}%</div>
        </div>
        <div className="h-3.5 overflow-hidden rounded-full border-2 border-white/70 bg-black/45 sm:h-4">
          <div className="load-fill h-full rounded-full" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function Match({ modeId, bots, onExit, onRequeue }: { modeId: string; bots: number; onExit: () => void; onRequeue: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pad = useRef<PadInput>(emptyPad());
  const api = useRef<{ dispose: () => void; setPaused: (p: boolean) => void; swapSlots: (a: number, b: number) => void; setBag: (open: boolean) => void; setEmotes: (open: boolean) => void; playEmote: (id: string) => void } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [emotesOpen, setEmotesOpen] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const applied = useRef(false);
  const [coarse, setCoarse] = useState(false);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const [load, setLoad] = useState({ p: 0.04, label: "Loading characters" });
  const loadStart = useRef(0);
  const [loadState, setLoadState] = useState<"loading" | "fading" | "done">("loading");

  useEffect(() => {
    setCoarse(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 800);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    applied.current = false;
    const save = getSave();
    const island = modeById(modeId).map === "island";
    setLoadState("loading");
    loadStart.current = performance.now();
    setLoad({ p: 0.06, label: "Loading characters" });
    const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    void import("@/game/player/character")
      .then(({ whenWorkerReady }) => {
        setLoad({ p: 0.22, label: "Loading weapons" });
        return whenWorkerReady();
      })
      .then(() => {
        setLoad({ p: 0.48, label: island ? "Loading Driftwood Isle" : "Loading arena" });
        return import("@/game/core/engine");
      })
      .then(async (m) => {
        setLoad({ p: 0.72, label: island ? "Building houses and placing loot" : "Building the arena" });
        // let the loading screen paint before the (blocking) world build
        await nextPaint();
        return m;
      })
      .then(({ mountMatch }) => {
      if (dead) return;
      try {
        api.current = mountMatch(canvas, {
          modeId,
          skinId: save.skinId,
          pickaxeId: save.pickaxeId,
          backpackId: save.backpackId,
          gliderId: save.gliderId,
          getSettings: () => (crazy.muted ? { ...getSave().settings, master: 0 } : getSave().settings),
          pad: pad.current,
          bots,
          pregame: urlNumber("pregame") ?? 60,
          onHud: (h) => {
            if (dead) return;
            setHud(h);
            setLoadState((s) => (s === "loading" ? "fading" : s));
          },
          onEnd: (r) => {
            if (applied.current) return;
            applied.current = true;
            crazy.gameplayStop();
            if (r.win) crazy.happytime();
            if (modeById(modeId).aim) return;
            applyMatchResult({ win: r.win, elims: r.elims, shots: r.shots, hits: r.hits, streak: r.streak, gold: r.gold, xp: r.xp });
            setResult(r);
          },
          onPause: () => {
            setPaused(true);
            crazy.gameplayStop();
          },
          onBag: (open) => setBagOpen(open),
          onEmotes: (open) => setEmotesOpen(open),
          ownedEmotes: () => EMOTES.filter((e) => getSave().owned.includes(emoteItemId(e.id))).map((e) => e.id),
        });
        setLoad({ p: 0.94, label: island ? "Joining the spawn island" : "Dropping in" });
        crazy.gameplayStart();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start the match");
      }
    })
      .catch((err) => {
        if (!dead) setError(err instanceof Error ? err.message : "Could not load the character");
      });
    return () => {
      dead = true;
      crazy.gameplayStop();
      api.current?.dispose();
      api.current = null;
    };
  }, [modeId, nonce]);

  const mode = modeById(modeId);
  const ui = getSave().settings.uiScale / 100;

  const [fadeOut, setFadeOut] = useState(false);
  useEffect(() => {
    if (loadState !== "fading") {
      setFadeOut(false);
      return;
    }
    setLoad((l) => ({ ...l, p: 1 }));
    // keep the art up long enough to read the tip, then fade into the match
    const hold = Math.max(400, 2600 - (performance.now() - loadStart.current));
    const a = window.setTimeout(() => setFadeOut(true), hold);
    const b = window.setTimeout(() => setLoadState("done"), hold + 500);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [loadState]);

  return (
    <div className="relative h-full w-full touch-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {loadState !== "done" && !error && (
        <LoadingScreen
          progress={load.p}
          label={load.label}
          title={mode.map === "island" ? "Driftwood Royale" : mode.name}
          sub={mode.map === "island" ? "Battle Royale · Solo · 16 Players" : mode.kicker}
          fading={fadeOut}
        />
      )}
      {hud && <Hud hud={hud} modeName={mode.name} aim={mode.aim} ui={ui} onSlot={(s) => (pad.current.slot = s)} />}
      {hud && !hud.pointerLocked && !coarse && !paused && !result && (
        <button className="hud-label absolute bottom-24 left-1/2 z-20 -translate-x-1/2 rounded-[4px] bg-black/60 px-4 py-2 text-sm text-white ring-1 ring-white/30" onClick={() => canvasRef.current?.requestPointerLock()}>
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
        className="absolute top-3 left-3 z-30 grid h-10 w-10 place-items-center rounded-[6px] bg-black/45 text-white/90 ring-1 ring-white/20 hover:bg-black/60"
        onClick={() => {
          setPaused(true);
          api.current?.setPaused(true);
          crazy.gameplayStop();
        }}
      >
        <Settings size={18} />
      </button>
      {showSettings && (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#071a3d]">
          <SettingsScreen onBack={() => setShowSettings(false)} />
        </div>
      )}
      {emotesOpen && !paused && !result && (
        <EmoteWheel
          onPick={(id) => {
            api.current?.playEmote(id);
            api.current?.setEmotes(false);
          }}
          onClose={() => api.current?.setEmotes(false)}
        />
      )}
      {bagOpen && hud && !paused && !result && (
        <BackpackScreen
          hud={hud}
          onSwap={(a, b) => api.current?.swapSlots(a, b)}
          onClose={() => api.current?.setBag(false)}
        />
      )}
      {(paused || error) && !result && (
        <div className="absolute inset-0 z-40 flex items-center bg-gradient-to-r from-[#050b1a]/90 via-[#050b1a]/60 to-transparent p-6 sm:pl-14">
          <div className="pop-in w-full max-w-xs">
            <div className="screen-title text-4xl text-white">{error ? "Graphics error" : "Paused"}</div>
            <div className="hud-label mt-0.5 text-xs text-white/60">{mode.name}</div>
            {error && <p className="mt-2 text-sm">{error}</p>}
            {!error && (
              <button
                className="play-btn mt-5 w-full rounded-[6px] py-3 font-display text-2xl text-[#2a1d00] italic"
                onClick={() => {
                  setPaused(false);
                  api.current?.setPaused(false);
                  crazy.gameplayStart();
                  canvasRef.current?.requestPointerLock();
                }}
              >
                Resume
              </button>
            )}
            {!error && (
              <button className="mt-2 w-full rounded-[6px] bg-white/10 py-3 font-display text-lg text-white ring-1 ring-white/20 hover:bg-white/20" onClick={() => setShowSettings(true)}>
                Settings
              </button>
            )}
            <button className="mt-2 w-full rounded-[6px] bg-white/10 py-3 font-display text-lg text-white ring-1 ring-white/20 hover:bg-white/20" onClick={onExit}>
              Leave match
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className={`absolute inset-0 z-40 grid place-items-center p-4 ${result.win ? "result-win" : "result-loss"}`}>
          <div className="pop-in w-full max-w-lg text-center">
            {mode.map === "island" && <div className="hud-num text-5xl leading-none text-white/90">#{result.placement}</div>}
            <div className={`screen-title mt-1 text-6xl leading-none sm:text-7xl ${result.win ? "victory-text" : "text-white"}`}>
              {result.win ? (mode.map === "island" ? "Victory Royale" : "Victory") : result.title}
            </div>
            <p className="hud-label mt-2 text-sm text-white/80">{result.subtitle}</p>
            <div className="mx-auto mt-5 grid max-w-md grid-cols-4 gap-1.5 text-sm">
              <Stat n={result.placement} l="Place" />
              <Stat n={result.elims} l="Elims" />
              <Stat n={result.shots ? Math.round((result.hits / result.shots) * 100) : 0} l="Accuracy %" />
              <Stat n={result.gold} l="Gold" />
            </div>
            <button
              className="play-btn mx-auto mt-6 block w-full max-w-xs rounded-[6px] py-3 font-display text-2xl text-[#2a1d00] italic"
              onClick={() => {
                // a midgame ad between matches (resolves straight away when ads are off)
                void crazy.midgameAd().then(() => {
                  // battle royale goes back through matchmaking; 1v1 restarts straight away
                  if (mode.map === "island") return onRequeue();
                  setResult(null);
                  setPaused(false);
                  setNonce((n) => n + 1);
                });
              }}
            >
              Play again
            </button>
            <button className="mx-auto mt-2 block w-full max-w-xs rounded-[6px] bg-white/10 py-3 font-display text-lg text-white ring-1 ring-white/20 hover:bg-white/20" onClick={() => void crazy.midgameAd().then(onExit)}>
              Return to lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Backpack (I): the hotbar laid out big, like Fortnite's inventory screen. Click a gun, then another
 * slot, to swap them (or drag one slot onto another). The pickaxe always stays in the first slot.
 */
/** Emote wheel (B): pick an emote with the mouse or its number key. */
function EmoteWheel({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const R = 150;
  const mine = EMOTES.filter((e) => getSave().owned.includes(emoteItemId(e.id)));
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#050b1a]/55" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop-in relative h-[380px] w-[380px] rounded-full bg-black/45 ring-2 ring-white/20 backdrop-blur-sm">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="screen-title text-3xl text-white">Emotes</div>
          <div className="hud-label text-[11px] text-white/60">{mine.length ? `Click or press 1-${mine.length} · Esc closes` : "No emotes yet: buy them in the Item Shop"}</div>
        </div>
        {mine.map((em, i) => {
          const a = (i / Math.max(mine.length, 1)) * Math.PI * 2 - Math.PI / 2;
          return (
            <button
              key={em.id}
              type="button"
              onClick={() => onPick(em.id)}
              className="absolute flex h-[86px] w-[86px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-[#0b2a66]/90 text-white ring-2 ring-white/30 transition hover:scale-110 hover:bg-[#1a7ded] hover:ring-white"
              style={{ left: 190 + Math.cos(a) * R, top: 190 + Math.sin(a) * R }}
            >
              <span className="text-3xl leading-none">{em.icon}</span>
              <span className="hud-label mt-1 text-[10px] leading-tight">{em.name}</span>
              <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gold text-[11px] font-extrabold text-gold-ink">{i + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BackpackScreen({ hud, onSwap, onClose }: { hud: HudState; onSwap: (a: number, b: number) => void; onClose: () => void }) {
  const [pick, setPick] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const order = hud.bag.order;
  const names = ["Pickaxe", "Assault Rifle", "Shotgun", "SMG", "Sniper Rifle", "Meds"];
  const RAR = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  const choose = (pos: number) => {
    if (pos === 0) return;
    if (pick === null) setPick(pos);
    else {
      if (pick !== pos) onSwap(pick, pos);
      setPick(null);
    }
  };
  const ammoRow: [string, number, string][] = [
    ["Light (SMG)", hud.bag.reserve.smg, "#6f7d8c"],
    ["Medium (AR)", hud.bag.reserve.ar, "#5d7a3a"],
    ["Shells", hud.bag.reserve.shotgun, "#c8322b"],
    ["Heavy (Sniper)", hud.bag.reserve.sniper, "#3d4a5a"],
  ];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#050b1a]/80 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop-in w-full max-w-3xl">
        <div className="flex items-end justify-between">
          <div className="screen-title text-4xl text-white">Backpack</div>
          <button className="hud-label rounded-[4px] bg-white/10 px-3 py-1.5 text-sm text-white ring-1 ring-white/25 hover:bg-white/20" onClick={onClose}>
            Close (I)
          </button>
        </div>
        <p className="hud-label mt-1 text-xs text-white/60">Click a weapon, then the slot to move it to. Or drag it there.</p>
        <div className="mt-4 grid grid-cols-6 gap-2">
          {order.map((item, pos) => {
            const owned = hud.inv.owned[item];
            const rar = hud.inv.rarity[item] ?? 0;
            const color = item === 0 ? "#7f8a99" : item === 5 ? "#3fae6a" : (hud.inv.colors[rar] ?? "#b8bec6");
            const sel = pick === pos;
            return (
              <button
                key={pos}
                type="button"
                draggable={pos > 0}
                onDragStart={() => setDrag(pos)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (drag !== null && drag !== pos && pos > 0) onSwap(drag, pos);
                  setDrag(null);
                }}
                onClick={() => choose(pos)}
                className={`slot !h-auto !w-auto aspect-[3/4] flex-col gap-1 p-2 ${owned ? "" : "is-empty"} ${sel ? "is-sel" : ""} ${pos === 0 ? "cursor-default" : "cursor-pointer"}`}
                style={owned ? ({ "--rc": color } as React.CSSProperties) : undefined}
              >
                <span className="slot-key">{pos + 1}</span>
                {owned && <WeaponIcon slot={item} scoped={item === 1 && rar >= 3} />}
                <span className="hud-label text-center text-[11px] leading-tight text-white">
                  {owned ? (item > 0 && item < 5 ? `${RAR[rar]} ${names[item]}` : item === 5 ? `Bandages ${hud.bag.bandages} · Kits ${hud.bag.medkits}` : names[item]) : "Empty"}
                </span>
                {owned && item > 0 && item < 5 && <span className="hud-num text-sm text-white/85">{hud.inv.ammo[item]} in mag</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ammoRow.map(([label, n, c]) => (
            <div key={label} className="flex items-center gap-2 rounded-[6px] bg-black/40 px-3 py-2 ring-1 ring-white/10">
              <span className="h-5 w-3 rounded-sm" style={{ background: c }} />
              <span className="hud-label flex-1 text-xs text-white/75">{label}</span>
              <span className="hud-num text-xl text-white">{n}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          {(["wood", "brick", "metal"] as const).map((m) => (
            <div key={m} className="flex items-center gap-2 rounded-[6px] bg-black/40 px-3 py-2 ring-1 ring-white/10">
              <MatIcon mat={m} size={22} />
              <span className="hud-num text-xl text-white">{hud.infiniteWood ? "∞" : hud.mats[m]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="rounded-[4px] bg-black/45 py-2 ring-1 ring-white/10">
      <div className="hud-num text-3xl leading-none text-white">{n}</div>
      <div className="hud-label mt-1 text-[10px] text-white/60">{l}</div>
    </div>
  );
}

/**
 * Fortnite-style scope view. Sniper: a big lens with a fine cross, heavy outer posts and range ticks.
 * Scoped AR: a smaller lens with a thin cross and a centre ring.
 */
function ScopeOverlay({ kind }: { kind: "sniper" | "ar" }) {
  const R = kind === "sniper" ? "min(40vh, 40vw)" : "min(31vh, 31vw)";
  const D = kind === "sniper" ? "min(80vh, 80vw)" : "min(62vh, 62vw)";
  return (
    <div className="scope-in absolute inset-0">
      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${R}, rgba(6,9,14,0.97) calc(${R} + 2px))` }} />
      <div
        className="absolute top-1/2 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ width: D, boxShadow: "inset 0 0 50px 16px rgba(0,0,0,0.6), inset 0 0 0 2px rgba(120,190,255,0.35), 0 0 0 4px rgba(0,0,0,0.95)", background: "radial-gradient(circle at 35% 30%, rgba(160,210,255,0.08), rgba(0,0,0,0) 45%)" }}
      />
      <div className="absolute top-1/2 left-1/2 h-px -translate-x-1/2 bg-black/90" style={{ width: D }} />
      <div className="absolute top-1/2 left-1/2 w-px -translate-y-1/2 bg-black/90" style={{ height: D }} />
      {kind === "sniper" ? (
        <>
          {/* heavy posts from the edge in toward the middle */}
          <div className="absolute top-1/2 h-[5px] -translate-y-1/2 bg-black" style={{ width: "min(24vh, 24vw)", left: "calc(50% + min(16vh, 16vw))" }} />
          <div className="absolute top-1/2 h-[5px] -translate-y-1/2 bg-black" style={{ width: "min(24vh, 24vw)", right: "calc(50% + min(16vh, 16vw))" }} />
          <div className="absolute left-1/2 w-[5px] -translate-x-1/2 bg-black" style={{ height: "min(24vh, 24vw)", top: "calc(50% + min(16vh, 16vw))" }} />
          {/* range ticks under the centre */}
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="absolute left-1/2 h-px -translate-x-1/2 bg-black" style={{ width: i % 2 ? 18 : 30, top: `calc(50% + ${i * 2.6}vh)` }} />
          ))}
          <div className="absolute top-1/2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30] shadow-[0_0_6px_#ff3b30]" />
        </>
      ) : (
        <>
          <div className="absolute top-1/2 left-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/85" />
          <div className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30]" />
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * In-match HUD, laid out like Fortnite's Battle Royale HUD:
 *   top centre   compass strip (heading + cardinal points), banners, 1v1 scoreboard
 *   top right    square minimap, then storm timer · players left · eliminations, then storm status
 *   left         elimination feed
 *   bottom left  shield (4 segments) over health, with big condensed numbers
 *   bottom right materials, weapon name + ammo, and the rarity-coloured hotbar (build pieces in build mode)
 *   centre       crosshair, hit marker, damage direction arcs, "ELIMINATED" pop, build health
 * ------------------------------------------------------------------------------------------- */
function bindLabel(code: string | undefined, fallback: string) {
  if (!code) return fallback;
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Key")) return code.slice(3);
  if (code === "Mouse3") return "M3";
  if (code === "Mouse4") return "M4";
  return code.length > 4 ? fallback : code;
}

function Hud({ hud, aim, ui, onSlot }: { hud: HudState; modeName: string; aim: boolean; ui: number; onSlot: (s: number) => void }) {
  const settings = getSave().settings;
  const showCross = settings.showCrosshair;
  const net = settings.showNet;
  const binds = settings.binds as Record<string, string | undefined>;
  const r = hud.royale;
  const stormLabel = !r
    ? null
    : r.stormStage === "pre"
      ? "Storm forming"
      : r.stormStage === "wait"
        ? "Storm eye shrinks in"
        : r.stormStage === "shrink"
          ? "Storm eye shrinking"
          : "Final circle";
  return (
    <div className="hud pointer-events-none absolute inset-0 select-none" style={{ zoom: ui }}>
      {/* ---------- top centre ---------- */}
      <div className="absolute top-2 left-1/2 flex -translate-x-1/2 flex-col items-center">
        <Compass heading={hud.heading} />
        {hud.duel && (
          <div className="mt-2 flex items-stretch overflow-hidden rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            <div className="hud-num flex items-center gap-2 bg-[#2a8cf0] px-3 text-2xl text-white">
              <span className="text-xs tracking-wider opacity-85">YOU</span>
              {hud.duel.you}
            </div>
            <div className="bg-[#0b1426]/85 px-3 py-1 text-center">
              <div className="hud-label text-[10px] text-white/60">Round {hud.duel.round}</div>
              <div className="hud-label text-xs text-[#ffd84a]">First to {hud.duel.limit}</div>
            </div>
            <div className="hud-num flex items-center gap-2 bg-[#ef3b4f] px-3 text-2xl text-white">
              {hud.duel.them}
              <span className="text-xs tracking-wider opacity-85">RIVAL</span>
            </div>
          </div>
        )}
        {hud.teams && (
          <div className="hud-num mt-2 text-2xl">
            <span className="text-[#5fb6ff]">{hud.scoreBlue}</span>
            <span className="px-2 text-white/60">–</span>
            <span className="text-[#ff6070]">{hud.scoreRed}</span>
          </div>
        )}
        {aim && (
          <div className="hud-num mt-2 text-3xl">
            {hud.aimScore} <span className="text-base text-[#ffd84a]">STREAK {hud.aimStreak}</span>
          </div>
        )}
        {hud.banner && <div className="hud-ribbon mt-3">{hud.banner}</div>}
        {r?.stage === "bus" && (
          <div className="hud-ribbon mt-3 text-center">
            <div className="text-xl leading-tight">{r.canJump ? "Jump to drop in!" : "Boarding the drop ship"}</div>
            <div className="text-[11px] tracking-wider text-white/70">
              <span className="pointer-coarse:hidden">
                <Kbd>Space</Kbd> to jump
              </span>
              <span className="hidden pointer-coarse:inline">Tap JUMP</span> · auto-drop in {Math.ceil(r.busLeft)}s
            </div>
          </div>
        )}
        {hud.pregame && (
          <div className="hud-ribbon mt-3 text-center">
            <div className="text-xl leading-tight">
              Drop ship leaves in <span className="text-[#ffd84a] tabular-nums">{fmtClock(hud.pregame.t)}</span>
            </div>
            <div className="text-[11px] tracking-wider text-white/70">Spawn island warm-up · no damage · free building</div>
          </div>
        )}
        {(r?.stage === "fall" || r?.stage === "glide") && (
          <div className="hud-ribbon mt-3 text-sm">{r.stage === "fall" ? "Skydiving · hold W to dive · glider deploys near the ground" : "Gliding · steer to your landing spot"}</div>
        )}
      </div>

      {/* ---------- top left ---------- */}
      {net && <div className="hud-label absolute top-3 left-16 rounded bg-black/40 px-2 py-0.5 text-xs text-[#8dff8d]">{hud.fps} FPS</div>}

      {/* ---------- top right: minimap + stats (the full map takes this corner while on the drop ship) ---------- */}
      <div className={`absolute top-3 right-3 flex flex-col items-end ${r?.stage === "bus" && r.bigMap ? "invisible" : ""}`}>
        <Minimap data={hud.minimap} />
        <div className="mt-1.5 flex items-center gap-3 pr-0.5">
          {hud.stormEta >= 0 && !hud.duel && (
            <HudStat icon={<StormIcon />} value={fmtClock(hud.stormEta)} warn={hud.stormEta < 10 && r?.stormStage === "wait"} />
          )}
          {!aim && !hud.duel && <HudStat icon={<PlayersIcon />} value={hud.alive} />}
          {hud.duel ? (
            <HudStat icon={<TrophyIcon />} value={`${hud.duel.you}-${hud.duel.them}`} />
          ) : (
            !aim && <HudStat icon={<ElimIcon />} value={hud.elims} />
          )}
        </div>
        {stormLabel && r?.stage === "ground" && (
          <div className={`hud-label mt-0.5 text-[11px] ${r.stormStage === "shrink" ? "text-[#d9b8ff]" : "text-white/75"}`}>{stormLabel}</div>
        )}
      </div>

      {/* ---------- centre ---------- */}
      {hud.scope && <ScopeOverlay kind={hud.scope} />}
      {showCross && !hud.scope && (
        <div className="absolute top-1/2 left-1/2" style={{ transform: "translate(-50%, -50%)", opacity: 1 - hud.ads * 0.15 }}>
          <i className="absolute h-[2px] w-2.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: -hud.gap - 10, top: -1 }} />
          <i className="absolute h-[2px] w-2.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: hud.gap, top: -1 }} />
          <i className="absolute h-2.5 w-[2px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ top: -hud.gap - 10, left: -1 }} />
          <i className="absolute h-2.5 w-[2px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ top: hud.gap, left: -1 }} />
          <i className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />
        </div>
      )}
      {hud.hit > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          {[45, 135, 225, 315].map((a) => (
            <i
              key={a}
              className="absolute block h-[3px] w-3 rounded-full"
              style={{ background: hud.head ? "#ffd21f" : "#ffffff", boxShadow: "0 0 0 1px rgba(0,0,0,0.6)", transform: `rotate(${a}deg) translateX(9px)`, transformOrigin: "0 50%", left: 0, top: -1.5 }}
            />
          ))}
        </div>
      )}
      {hud.hurtDirs.map((d, i) => (
        <div key={i} className="absolute top-1/2 left-1/2 h-0 w-0" style={{ transform: `rotate(${d.ang}rad)`, opacity: d.a }}>
          <svg width="130" height="34" viewBox="-65 -17 130 34" className="absolute -left-[65px]" style={{ top: -150 }} aria-hidden>
            <path d="M-56 10 Q0 -16 56 10" fill="none" stroke="#ff2a2a" strokeWidth="9" strokeLinecap="round" opacity="0.9" />
            <path d="M-56 10 Q0 -16 56 10" fill="none" stroke="#ffb0a8" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
          </svg>
        </div>
      ))}
      {hud.elimPop && (
        <div key={hud.elimPop.name + hud.elims} className="elim-pop absolute top-[63%] left-1/2 -translate-x-1/2 text-center">
          <div className="hud-num flex items-center justify-center gap-2 text-3xl leading-none text-white">
            <span className="text-[#ff4040]">
              <SkullIcon />
            </span>
            <span className="text-[#ff4f4f]">ELIMINATED</span>
            <span>{hud.elimPop.name}</span>
          </div>
          <div className="hud-label mt-1 text-sm text-white/80">
            {hud.elims} Elimination{hud.elims === 1 ? "" : "s"}
          </div>
        </div>
      )}
      {hud.build && !hud.edit && (
        <div className="absolute top-1/2 left-1/2 mt-8 ml-16 space-y-1 text-[11px] font-extrabold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] pointer-coarse:hidden">
          <PromptRow k="LMB" label="Build">
            <MatIcon mat={hud.mat} size={13} /> 10
          </PromptRow>
          <PromptRow k="RMB" label="Change Material" />
          <PromptRow k="Scroll ↑" label="Rotate" />
          <PromptRow k="Scroll ↓" label="Reset edit" />
        </div>
      )}
      {hud.edit && (
        <div className="absolute top-1/2 left-1/2 mt-8 ml-16 space-y-1 text-[11px] font-extrabold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)] pointer-coarse:hidden">
          <PromptRow k="Release" label="Confirm" />
          <PromptRow k="RMB" label="Reset" />
          <PromptRow k="Q" label="Done" />
        </div>
      )}
      {hud.buildInfo && <BuildHealth info={hud.buildInfo} />}
      {(r?.prompt || hud.prompt) && (
        <div className="absolute top-1/2 left-1/2 mt-12 flex -translate-x-1/2 items-center gap-2 rounded-[4px] bg-black/55 px-2.5 py-1 text-white">
          <span className="pointer-coarse:hidden">
            <Kbd>{bindLabel(binds.interact, "X")}</Kbd>
          </span>
          <span className="hidden pointer-coarse:inline">
            <Kbd>USE</Kbd>
          </span>
          <span className="hud-label text-sm">{r?.prompt || hud.prompt}</span>
        </div>
      )}
      {hud.phase === "countdown" && (
        <div key={hud.countdown} className="count-pop absolute top-[30%] left-1/2 -translate-x-1/2 text-center">
          <div className="hud-num text-8xl text-[#ffd84a]" style={{ WebkitTextStroke: "3px rgba(0,0,0,0.55)", paintOrder: "stroke fill" }}>
            {hud.countdown}
          </div>
          <div className="hud-label text-sm text-white/85">{hud.duel ? "Round starting" : "Get ready"}</div>
        </div>
      )}
      {hud.inStorm && <div className="storm-tint absolute inset-0" />}
      {hud.hurt > 0 && <div className="absolute inset-0 shadow-[inset_0_0_110px_rgba(220,30,30,0.5)]" />}
      {hud.floaters.map((f, i) => (
        <div key={i} className={`dmg-num absolute ${f.crit ? "text-[#ffd84a]" : "text-white"}`} style={{ left: f.x, top: f.y, opacity: Math.min(1, f.life * 2.4), transform: `translate(-50%, -50%) scale(${f.crit ? 1.25 : 1})` }}>
          {f.text}
        </div>
      ))}
      {hud.royale?.bigMap && hud.minimap.bg && <BigMap hud={hud} compact={hud.royale.stage === "bus"} />}

      {/* ---------- left: elimination feed ---------- */}
      <div className="absolute bottom-[9.5rem] left-3 flex w-72 flex-col gap-1 pointer-coarse:top-24 pointer-coarse:bottom-auto">
        {hud.feed
          .slice()
          .reverse()
          .map((line, i) => {
            const mine = line.startsWith("You");
            return (
              <div key={line + i} className={`feed-line hud-label flex items-center gap-1.5 px-2 py-0.5 text-[13px] ${mine ? "feed-mine" : ""}`}>
                <span className={mine ? "text-[#ffd84a]" : "text-white/70"}>
                  <SkullIcon size={12} />
                </span>
                <span className="truncate normal-case">{line}</span>
              </div>
            );
          })}
      </div>

      {/* ---------- bottom left: shield + health ---------- */}
      {hud.vehicle && (
        <div className="absolute bottom-28 left-4 w-56 rounded-[4px] bg-[#0b1426]/75 px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.4)] pointer-coarse:left-44">
          <div className="flex items-baseline justify-between">
            <div className="hud-num text-3xl leading-none text-white">
              {hud.vehicle.speed}
              <span className="ml-1 text-xs tracking-wider text-white/60">KM/H</span>
            </div>
            <div className="hud-label text-[10px] text-white/60">Vehicle</div>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden bg-black/50">
            <div className="h-full transition-[width]" style={{ width: `${(hud.vehicle.hp / hud.vehicle.max) * 100}%`, background: hud.vehicle.hp / hud.vehicle.max > 0.35 ? "#ffcf3a" : "#ff5a3a" }} />
          </div>
          <div className="mt-1 text-[10px] font-bold text-white/55 pointer-coarse:hidden">W/S drive · A/D steer · Space brake</div>
        </div>
      )}
      <Vitals hp={hud.hp} shield={hud.shield} healing={hud.healing} />

      {/* ---------- bottom right: mats, ammo, hotbar ---------- */}
      <div className="absolute right-4 bottom-3 z-30 flex flex-col items-end pointer-coarse:right-1/2 pointer-coarse:translate-x-1/2 pointer-coarse:items-center">
        <div className="mb-1.5 flex gap-1.5">
          {(["wood", "brick", "metal"] as const).map((m) => (
            <div key={m} className={`mat-chip ${hud.mat === m ? "is-on" : ""}`}>
              <MatIcon mat={m} size={20} />
              <span className="hud-num text-lg leading-none tabular-nums">{hud.infiniteWood ? "∞" : hud.mats[m]}</span>
            </div>
          ))}
        </div>
        <WeaponReadout hud={hud} />
        {hud.build ? <BuildBar hud={hud} binds={binds} /> : <Hotbar hud={hud} binds={binds} onSlot={onSlot} />}
      </div>
    </div>
  );
}

function fmtClock(s: number) {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="inline-block min-w-5 rounded-[3px] border border-white/75 bg-black/50 px-1 text-center text-[10px] leading-4 font-extrabold text-white">{children}</span>;
}

function HudStat({ icon, value, warn = false }: { icon: React.ReactNode; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-1 ${warn ? "text-[#ff6b6b]" : "text-white"}`}>
      <span className="opacity-90">{icon}</span>
      <span className="hud-num text-[22px] leading-none tabular-nums">{value}</span>
    </div>
  );
}

/** Fortnite's top-centre compass: a strip of ticks every 5°, numbers every 15°, cardinal letters, and the heading. */
function Compass({ heading }: { heading: number }) {
  const W = 420;
  const span = 100; // degrees visible across the strip
  const px = W / span;
  const marks: React.ReactNode[] = [];
  const start = Math.ceil((heading - span / 2) / 5) * 5;
  const names: Record<number, string> = { 0: "N", 45: "NE", 90: "E", 135: "SE", 180: "S", 225: "SW", 270: "W", 315: "NW" };
  for (let d = start; d <= heading + span / 2; d += 5) {
    const deg = ((d % 360) + 360) % 360;
    const x = W / 2 + (d - heading) * px;
    const name = names[deg];
    const major = deg % 15 === 0;
    marks.push(
      <div key={d} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: x }}>
        <i className={`block w-[2px] ${name ? "h-2.5 bg-white" : major ? "h-2 bg-white/80" : "h-1.5 bg-white/45"}`} />
        {(name || major) && (
          <span className={`hud-num leading-none ${name ? (deg === 0 ? "text-[17px] text-[#ffd84a]" : "text-[15px] text-white") : "text-[11px] text-white/65"}`}>{name ?? deg}</span>
        )}
      </div>,
    );
  }
  return (
    <div className="flex flex-col items-center pointer-coarse:scale-75">
      <div className="compass relative h-7 overflow-hidden" style={{ width: W }}>
        {marks}
      </div>
      <div className="-mt-0.5 flex flex-col items-center">
        <i className="block h-0 w-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-white" />
        <span className="hud-num rounded-[3px] bg-black/45 px-1.5 text-sm leading-[18px] text-white tabular-nums">{Math.round(heading) % 360}</span>
      </div>
    </div>
  );
}

/** Shield (four 25-point cells) above health, like Fortnite's bottom-left vitals. */
function Vitals({ hp, shield, healing }: { hp: number; shield: number; healing: number }) {
  const h = Math.max(0, Math.min(100, hp));
  const s = Math.max(0, Math.min(100, shield));
  return (
    <div className="absolute bottom-4 left-4 w-[17rem] pointer-coarse:bottom-2 pointer-coarse:w-48">
      <div className="flex items-center gap-2">
        <span className="grid w-6 place-items-center text-[#5fc8ff]">
          <ShieldIcon />
        </span>
        <span className="hud-num w-10 text-right text-xl leading-none text-white tabular-nums">{Math.ceil(s)}</span>
        <div className="flex flex-1 gap-[3px]">
          {[0, 1, 2, 3].map((k) => {
            const f = Math.max(0, Math.min(1, (s - k * 25) / 25));
            return (
              <div key={k} className="vital-track h-3 flex-1">
                <div className="vital-fill h-full" style={{ width: `${f * 100}%`, background: "linear-gradient(180deg,#9be3ff,#2ea7f2 55%,#1677d6)" }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="grid w-6 place-items-center text-[#5ff07a]">
          <HealthIcon />
        </span>
        <span className="hud-num w-10 text-right text-[28px] leading-none text-white tabular-nums">{Math.ceil(h)}</span>
        <div className="vital-track relative h-5 flex-1">
          <div className="vital-fill h-full" style={{ width: `${h}%`, background: h > 30 ? "linear-gradient(180deg,#a8ff9a,#3fd65a 55%,#1f9c3c)" : "linear-gradient(180deg,#ffb09a,#f0503a 55%,#b8261a)" }} />
          {healing > 0 && <div className="absolute inset-y-0 left-0 bg-white/35" style={{ width: `${Math.min(100, h + healing * 15)}%`, mixBlendMode: "overlay" }} />}
        </div>
      </div>
      {healing > 0 && (
        <div className="mt-1 ml-[4.5rem] flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden bg-black/50">
            <div className="h-full bg-[#5ff07a]" style={{ width: `${healing * 100}%` }} />
          </div>
          <span className="hud-label text-[10px] text-white/80">Healing</span>
        </div>
      )}
    </div>
  );
}

const SLOT_SHORT = ["Pickaxe", "Assault Rifle", "Shotgun", "SMG", "Sniper", "Bandages"];

function WeaponReadout({ hud }: { hud: HudState }) {
  const gun = !hud.build && hud.slot > 0 && hud.slot < 5;
  const rc = hud.inv.colors[hud.inv.rarity[hud.slot] ?? 0] ?? "#ffffff";
  return (
    <div className="mb-1 flex items-end gap-3 pointer-coarse:hidden">
      <div className="text-right">
        <div className="hud-label text-[13px] leading-tight" style={{ color: hud.build ? "#bfe6ff" : hud.slot > 0 && hud.slot < 5 ? rc : "#ffffff" }}>
          {hud.weapon}
        </div>
      </div>
      {gun && (
        <div className="hud-num flex items-baseline leading-none text-white tabular-nums">
          {hud.reloading ? (
            <span className="text-lg text-[#ffd84a]">RELOADING</span>
          ) : (
            <>
              <span className={`text-[30px] ${hud.mag === 0 ? "text-[#ff5a5a]" : ""}`}>{hud.mag}</span>
              <span className="px-1 text-lg text-white/50">|</span>
              <span className="text-lg text-white/75">{hud.reserve}</span>
            </>
          )}
        </div>
      )}
      {hud.slot === 5 && !hud.build && <span className="hud-num text-[30px] leading-none text-white">{hud.heals}</span>}
    </div>
  );
}

function Hotbar({ hud, binds, onSlot }: { hud: HudState; binds: Record<string, string | undefined>; onSlot: (s: number) => void }) {
  return (
    <div className="flex items-end gap-1">
      {hud.bag.order.map((i, pos) => {
        const name = SLOT_SHORT[i]!;
        const owned = hud.inv.owned[i];
        const rar = hud.inv.rarity[i] ?? 0;
        const color = i === 0 ? "#7f8a99" : i === 5 ? "#3fae6a" : hud.inv.colors[rar] ?? "#b8bec6";
        const sel = hud.slot === i;
        const ammo = hud.inv.ammo[i];
        return (
          <button
            key={name}
            type="button"
            tabIndex={-1}
            aria-label={name}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSlot(pos);
            }}
            className={`slot pointer-coarse:pointer-events-auto ${sel ? "is-sel" : ""} ${owned ? "" : "is-empty"}`}
            style={owned ? ({ "--rc": color } as React.CSSProperties) : undefined}
          >
            <span className="slot-key">{bindLabel(binds[`slot${pos + 1}`], String(pos + 1))}</span>
            {owned && <WeaponIcon slot={i} scoped={i === 1 && rar >= 3} />}
            {owned && ammo !== null && ammo !== undefined && <span className="slot-ammo hud-num">{ammo}</span>}
          </button>
        );
      })}
    </div>
  );
}

function BuildBar({ hud, binds }: { hud: HudState; binds: Record<string, string | undefined> }) {
  const pieces = [
    ["wall", binds.wall, "R"],
    ["floor", binds.floor, "F"],
    ["ramp", binds.ramp, "E"],
    ["pyramid", binds.roof, "C"],
  ] as const;
  return (
    <div className="flex items-end gap-1">
      {pieces.map(([id, code, fb]) => {
        const on = hud.build === id;
        return (
          <div key={id} className={`slot build-slot ${on ? "is-sel" : ""}`}>
            <span className="slot-key">{bindLabel(code, fb)}</span>
            <BuildGlyph kind={id} size={on ? 40 : 34} />
            <span className="slot-ammo hud-num">10</span>
          </div>
        );
      })}
    </div>
  );
}

/** White weapon silhouettes for the hotbar (side view, muzzle to the right). */
function WeaponIcon({ slot, scoped = false }: { slot: number; scoped?: boolean }) {
  const f = "#ffffff";
  return (
    <svg viewBox="0 0 64 30" className="slot-icon" aria-hidden>
      {slot === 0 && (
        <g fill={f}>
          <path d="M14 28 L40 6 L43 9 L17 30 Z" />
          <path d="M28 9 Q40 -1 58 9 L56 12 Q42 5 33 12 Z" />
          <path d="M34 6 Q27 2 19 7 L21 10 Q27 6 34 9 Z" />
          <rect x="11" y="25" width="7" height="4" rx="1.5" transform="rotate(-40 14 27)" />
        </g>
      )}
      {slot === 1 && (
        <g fill={f}>
          <path d="M2 11 L13 10 L15 13 L15 17 L5 21 L2 21 Z" />
          <rect x="13" y="10" width="26" height="8" rx="1" />
          {scoped ? (
            <>
              <rect x="18" y="3" width="16" height="4.5" rx="2" />
              <rect x="16.5" y="2.5" width="3" height="5.5" rx="1" />
              <rect x="32.5" y="2" width="3.5" height="6.5" rx="1" />
              <rect x="21" y="7" width="2" height="3.5" />
              <rect x="29" y="7" width="2" height="3.5" />
            </>
          ) : (
            <rect x="19" y="7.5" width="14" height="2.5" />
          )}
          <rect x="39" y="11" width="12" height="6" rx="1" />
          <rect x="51" y="12.5" width="11" height="2.5" />
          <rect x="47" y="8" width="2" height="3" />
          <path d="M27 18 L33 18 L35 27 L29 28 Z" />
          <path d="M17 18 L22 18 L20 25 L15 25 Z" />
        </g>
      )}
      {slot === 2 && (
        <g fill={f}>
          <path d="M2 12 L15 11 L17 14 L17 17 L5 21 L2 20 Z" />
          <rect x="15" y="10" width="16" height="7.5" rx="1" />
          <rect x="31" y="10" width="31" height="3" />
          <rect x="31" y="14" width="24" height="2.5" />
          <rect x="35" y="13" width="13" height="5.5" rx="1.5" />
          <path d="M18 17.5 L23 17.5 L21 24 L16 24 Z" />
        </g>
      )}
      {slot === 3 && (
        <g fill={f}>
          <path d="M4 10 L14 10 L14 12 L7 12 L7 16 L14 16 L14 18 L4 18 Z" />
          <rect x="14" y="9" width="25" height="8.5" rx="1" />
          <rect x="21" y="6.5" width="9" height="2.5" />
          <rect x="39" y="11" width="9" height="3.5" />
          <rect x="48" y="9.8" width="11" height="6" rx="1.5" />
          <rect x="30" y="17.5" width="5" height="10" rx="1" />
          <path d="M17 17.5 L22 17.5 L20 24 L15 24 Z" />
        </g>
      )}
      {slot === 4 && (
        <g fill={f}>
          <path d="M1 12 L12 12 L16 15 L16 18 L3 21 L1 21 Z" />
          <rect x="15" y="12" width="20" height="6" rx="1" />
          <rect x="35" y="13.5" width="28" height="2.5" />
          <rect x="18" y="5" width="16" height="4.5" rx="2" />
          <rect x="16" y="4.5" width="3.5" height="5.5" rx="1" />
          <rect x="32.5" y="4" width="3.5" height="6.5" rx="1" />
          <rect x="21" y="9" width="2" height="3" />
          <rect x="29" y="9" width="2" height="3" />
          <path d="M19 18 L24 18 L22 24 L17 24 Z" />
          <rect x="26" y="18" width="5" height="4" />
        </g>
      )}
      {slot === 5 && (
        <g>
          <rect x="18" y="5" width="28" height="21" rx="4" fill={f} />
          <rect x="29" y="9" width="6" height="13" fill="#e23b3b" />
          <rect x="25.5" y="12.5" width="13" height="6" fill="#e23b3b" />
        </g>
      )}
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
      <path d="M9 1 L17 4 V10 C17 15 13 18 9 19 C5 18 1 15 1 10 V4 Z" fill="currentColor" stroke="#062a4a" strokeWidth="1.4" />
      <path d="M9 4 L14 6 V10 C14 13 12 15 9 16 Z" fill="#ffffff" opacity="0.45" />
    </svg>
  );
}
function HealthIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M7 1 H13 V7 H19 V13 H13 V19 H7 V13 H1 V7 H7 Z" fill="currentColor" stroke="#0b3a14" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
function StormIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="#c9a6ff" strokeWidth="2.4" />
      <path d="M10 5 V10 L13.5 12" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function PlayersIcon() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden>
      <circle cx="9" cy="5" r="4" fill="#ffffff" />
      <path d="M1 19 C1 13 4.5 10.5 9 10.5 C13.5 10.5 17 13 17 19 Z" fill="#ffffff" />
    </svg>
  );
}
function ElimIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="#ffffff" strokeWidth="2.2" />
      <path d="M10 0.5 V6 M10 14 V19.5 M0.5 10 H6 M14 10 H19.5" stroke="#ffffff" strokeWidth="2.2" />
      <circle cx="10" cy="10" r="1.6" fill="#ff4f4f" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <path d="M5 2 H15 V8 C15 11 13 13 10 13 C7 13 5 11 5 8 Z" fill="#ffd84a" />
      <path d="M5 4 H2 C2 8 4 9 5.5 9 M15 4 H18 C18 8 16 9 14.5 9" fill="none" stroke="#ffd84a" strokeWidth="1.6" />
      <rect x="8.5" y="12.5" width="3" height="3.5" fill="#ffd84a" />
      <rect x="5.5" y="16" width="9" height="2.5" rx="1" fill="#ffd84a" />
    </svg>
  );
}
function SkullIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M10 1.5 C5 1.5 2 5 2 9 C2 11.5 3.3 13.2 5 14 V17.5 H15 V14 C16.7 13.2 18 11.5 18 9 C18 5 15 1.5 10 1.5 Z" fill="currentColor" />
      <circle cx="6.8" cy="9.4" r="2.2" fill="#000" opacity="0.8" />
      <circle cx="13.2" cy="9.4" r="2.2" fill="#000" opacity="0.8" />
      <path d="M8.5 15 V17.5 M11.5 15 V17.5" stroke="#000" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}

/** Fortnite-style health readout for the build under the crosshair: orange while it is still going up, green once finished. */
function BuildHealth({ info }: { info: NonNullable<HudState["buildInfo"]> }) {
  const pct = Math.max(0, Math.min(1, info.hp / info.max));
  const color = info.building ? "#f5a524" : pct < 0.3 ? "#ef4444" : "#5ad25a";
  return (
    <div className="absolute top-1/2 left-1/2 mt-7 -translate-x-1/2">
      <div className="relative h-[15px] w-36 overflow-hidden rounded-[3px] bg-black/55 shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
        <div className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${pct * 100}%`, background: color }} />
        <div className="relative flex h-full items-center gap-1 px-1.5 text-[10px] leading-none font-extrabold text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.7)]">
          <MatIcon mat={info.mat} size={11} />
          <span className="tabular-nums">{info.hp}</span>
          <span className="opacity-70">|</span>
          <span className="tabular-nums">{info.max}</span>
        </div>
      </div>
    </div>
  );
}

function PromptRow({ k, label, children }: { k: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="min-w-6 rounded-[3px] border border-white/70 bg-black/55 px-1 text-center text-[9px] leading-4">{k}</span>
      <span>{label}</span>
      {children && <span className="inline-flex items-center gap-0.5">{children}</span>}
    </div>
  );
}

function MatIcon({ mat, size = 18 }: { mat: BuildMat; size?: number }) {
  if (mat === "wood")
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
        <rect x="2" y="5" width="16" height="10" rx="3" fill="#c8833f" stroke="#5a3415" strokeWidth="1.2" />
        <ellipse cx="15" cy="10" rx="3" ry="5" fill="#f0c486" stroke="#5a3415" strokeWidth="1.2" />
        <ellipse cx="15" cy="10" rx="1.2" ry="2.2" fill="none" stroke="#a4682f" strokeWidth="0.9" />
        <path d="M4 8h8M4 12h7" stroke="#8d5428" strokeWidth="0.9" />
      </svg>
    );
  if (mat === "brick")
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
        <rect x="2" y="3" width="16" height="14" rx="1.5" fill="#6a5a50" />
        <rect x="3" y="4" width="7" height="3.6" fill="#c25e3c" />
        <rect x="11" y="4" width="6" height="3.6" fill="#a84e34" />
        <rect x="3" y="8.4" width="3.5" height="3.6" fill="#b55a3c" />
        <rect x="7.5" y="8.4" width="9.5" height="3.6" fill="#c96a46" />
        <rect x="3" y="12.8" width="8" height="3.4" fill="#9a462f" />
        <rect x="12" y="12.8" width="5" height="3.4" fill="#c25e3c" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d="M3 7l7-3 7 3v7l-7 3-7-3z" fill="#8e959d" stroke="#2b3036" strokeWidth="1.2" />
      <path d="M3 7l7 3 7-3M10 10v7" fill="none" stroke="#2b3036" strokeWidth="1.1" />
      <path d="M4.5 8.5l4.5 2v4.5" fill="none" stroke="#c9cfd5" strokeWidth="0.8" />
    </svg>
  );
}

/** Glossy light-blue structure icons, modelled on Fortnite's build bar. */
function BuildGlyph({ kind, size = 32 }: { kind: "wall" | "floor" | "ramp" | "pyramid"; size?: number }) {
  const hi = "#e8f6ff";
  const mid = "#8fd0ff";
  const lo = "#3d8fd6";
  const edge = "#ffffff";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }}>
      {kind === "wall" && (
        <>
          <path d="M11 9 L27 5 L27 33 L11 37 Z" fill={mid} stroke={edge} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M27 5 L31 7 L31 35 L27 33 Z" fill={lo} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
          <path d="M11 9 L27 5 L31 7 L15 11 Z" fill={hi} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
          <path d="M13 12 L25 9" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.4" />
        </>
      )}
      {kind === "floor" && (
        <>
          <path d="M4 21 L20 13 L36 21 L20 29 Z" fill={hi} stroke={edge} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M4 21 L20 29 L20 33 L4 25 Z" fill={mid} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
          <path d="M20 29 L36 21 L36 25 L20 33 Z" fill={lo} stroke={edge} strokeWidth="1" strokeLinejoin="round" />
        </>
      )}
      {kind === "ramp" && (
        <>
          <path d="M6 34 L6 30 L12 30 L12 24 L18 24 L18 18 L24 18 L24 12 L30 12 L30 6 L34 6 L34 34 Z" fill={lo} stroke={edge} strokeWidth="1.1" strokeLinejoin="round" />
          {[30, 24, 18, 12, 6].map((y, i) => (
            <path key={y} d={`M${6 + i * 6} ${y} L${12 + i * 6} ${y} L${15 + i * 6} ${y - 2} L${9 + i * 6} ${y - 2} Z`} fill={hi} stroke={edge} strokeWidth="0.8" strokeLinejoin="round" />
          ))}
          <path d="M8 32 L32 8" stroke={mid} strokeWidth="2" strokeOpacity="0.6" />
        </>
      )}
      {kind === "pyramid" && (
        <>
          <path d="M20 6 L5 27 L20 34 Z" fill={hi} stroke={edge} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M20 6 L20 34 L35 27 Z" fill={mid} stroke={edge} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M20 6 L5 27 L20 21 L35 27 Z" fill="none" stroke={edge} strokeOpacity="0.5" strokeWidth="0.8" />
        </>
      )}
    </svg>
  );
}

const mapImages = new Map<string, HTMLImageElement>();
function mapImage(src: string) {
  let img = mapImages.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    mapImages.set(src, img);
  }
  return img;
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
    g.fillStyle = data.bg ? "#2f7fcf" : "rgba(20,90,40,0.85)";
    g.fillRect(0, 0, w, h);
    // island maps show a 170 m window around the player; arenas show everything
    const view = data.bg ? 85 : data.bounds;
    const cx = data.bg ? data.px : 0;
    const cz = data.bg ? data.pz : 0;
    const mapX = (x: number) => (((x - cx) / view) * 0.5 + 0.5) * w;
    const mapY = (z: number) => (((z - cz) / view) * 0.5 + 0.5) * h;
    const scale = (r: number) => (r / view) * w * 0.5;
    if (data.bg) {
      const img = mapImage(data.bg);
      if (img.complete) {
        const B = data.bounds;
        g.drawImage(img, mapX(-B), mapY(-B), scale(B * 2), scale(B * 2));
      }
    } else {
      // arena: sky, then the deck with its blue (your) and red (rival) halves and the build grid
      // the 1v1 floor: grey Creative grid on grass, blue home strip (you) and red (rival)
      g.fillStyle = "#62b84a";
      g.fillRect(0, 0, w, h);
      const A = data.bounds - 6;
      g.fillStyle = "#c4c9d1";
      g.fillRect(mapX(-A), mapY(-A), scale(A * 2), scale(A * 2));
      g.fillStyle = "rgba(63,169,255,0.45)";
      g.fillRect(mapX(-A), mapY(A - 8), scale(A * 2), scale(8));
      g.fillStyle = "rgba(255,79,94,0.45)";
      g.fillRect(mapX(-A), mapY(-A), scale(A * 2), scale(8));
      g.strokeStyle = "rgba(60,68,82,0.35)";
      g.lineWidth = 1;
      for (let k = -A; k <= A; k += 4) {
        g.beginPath();
        g.moveTo(mapX(k), mapY(-A));
        g.lineTo(mapX(k), mapY(A));
        g.moveTo(mapX(-A), mapY(k));
        g.lineTo(mapX(A), mapY(k));
        g.stroke();
      }
      g.fillStyle = "#ffffff";
      g.fillRect(mapX(-A), mapY(0) - 1, scale(A * 2), 2);
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 2;
      g.strokeRect(mapX(-A), mapY(-A), scale(A * 2), scale(A * 2));
    }
    if (data.isle) {
      // spawn island: sand ring, grass top, launch pad
      const ix = mapX(data.isle.x);
      const iz = mapY(data.isle.z);
      g.fillStyle = "#e8d29a";
      g.beginPath();
      g.arc(ix, iz, scale(data.isle.r), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#62bf4b";
      g.beginPath();
      g.arc(ix, iz, scale(data.isle.r * 0.78), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#2a6fd6";
      g.beginPath();
      g.arc(ix, iz, scale(8.5), 0, Math.PI * 2);
      g.fill();
    }
    if (data.next) {
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.beginPath();
      g.arc(mapX(data.next.x), mapY(data.next.z), Math.max(1, scale(data.next.r)), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (data.storm) {
      g.strokeStyle = "rgba(120,90,255,0.95)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(mapX(data.storm.x), mapY(data.storm.z), Math.max(1, scale(data.storm.r)), 0, Math.PI * 2);
      g.stroke();
    }
    for (const d of data.dots) {
      g.fillStyle = d.team === 1 ? "#8ad7ff" : d.team === 3 ? "#ffe08a" : "#ff4f5e";
      g.strokeStyle = "#000";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(mapX(d.x), mapY(d.z), 4.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    g.save();
    g.translate(mapX(data.px), mapY(data.pz));
    g.rotate(-data.yaw);
    g.fillStyle = "#ffffff";
    g.strokeStyle = "#000000";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }, [data]);
  return (
    <div className="minimap relative">
      <canvas ref={ref} width={220} height={220} className="block h-24 w-24 sm:h-44 sm:w-44" />
      <span className="hud-num absolute top-0.5 left-1/2 -translate-x-1/2 text-xs leading-none text-[#ffd84a] drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]">N</span>
    </div>
  );
}

/** Full island map: shown while riding the drop ship and when the player presses M. */
function BigMap({ hud, compact = false }: { hud: HudState; compact?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const r = hud.royale;
  const data = hud.minimap;
  useEffect(() => {
    const c = ref.current;
    if (!c || !data.bg) return;
    const g = c.getContext("2d");
    if (!g) return;
    const S = c.width;
    const B = data.bounds;
    const P = (v: number) => ((v + B) / (B * 2)) * S;
    const img = mapImage(data.bg);
    g.clearRect(0, 0, S, S);
    if (img.complete) g.drawImage(img, 0, 0, S, S);
    if (r?.bus) {
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 3;
      g.setLineDash([10, 8]);
      g.beginPath();
      g.moveTo(P(r.bus.x0), P(r.bus.z0));
      g.lineTo(P(r.bus.x1), P(r.bus.z1));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#2fb8a0";
      g.strokeStyle = "#ffffff";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(P(r.bus.x), P(r.bus.z), 9, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (data.next) {
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = 2.5;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.arc(P(data.next.x), P(data.next.z), Math.max(2, (data.next.r / (B * 2)) * S), 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (data.storm && r?.stormStage !== "pre") {
      g.strokeStyle = "rgba(120,90,255,0.95)";
      g.lineWidth = 4;
      g.beginPath();
      g.arc(P(data.storm.x), P(data.storm.z), Math.max(2, (data.storm.r / (B * 2)) * S), 0, Math.PI * 2);
      g.stroke();
    }
    if (r?.stage !== "bus") {
      g.fillStyle = "#ffe14a";
      g.strokeStyle = "#000";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(P(data.px), P(data.pz), 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }, [data, r]);
  if (compact)
    return (
      <div className="pointer-events-none absolute top-3 right-3 z-10 text-center">
        <canvas ref={ref} width={480} height={480} className="h-[min(44vh,34vw)] w-[min(44vh,34vw)] rounded-[10px] border-2 border-white/90 shadow-xl" />
        <div className="hud-label mt-1.5 rounded-[4px] bg-black/55 px-3 py-0.5 text-[11px]">Dashed line: drop ship route · ring: first safe zone</div>
      </div>
    );
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/25">
      <div className="relative">
        <canvas ref={ref} width={640} height={640} className="h-[min(72vh,72vw)] w-[min(72vh,72vw)] rounded-[10px] border-2 border-white/90 shadow-2xl" />
        <div className="hud-label absolute -bottom-9 left-1/2 -translate-x-1/2 rounded-[4px] bg-black/60 px-3 py-1 text-xs whitespace-nowrap">Press M to close the map</div>
      </div>
    </div>
  );
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
      <div className="absolute right-3 bottom-3 z-30 grid grid-cols-2 gap-2">
        <Hold label="Fire" on={(v) => (pad.fire = v)} />
        <Hold label="Aim" on={(v) => (pad.aim = v)} />
        <Hold label="Jump" on={(v) => (pad.jump = v)} />
        <Hold label="Build" on={(v) => (pad.wall = v)} />
        <Hold label="Mat" on={(v) => (pad.material = v)} />
        <Hold label="Use" on={(v) => (pad.interact = v)} />
      </div>
    </>
  );
}

function Hold({ label, on }: { label: string; on: (v: boolean) => void }) {
  return (
    <button
      className="hud-label pointer-events-auto h-12 w-16 rounded-full bg-black/40 text-xs text-white ring-2 ring-white/40 active:bg-white/30"
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
