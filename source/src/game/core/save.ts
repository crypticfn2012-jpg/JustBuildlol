import {
  DEFAULT_SETTINGS,
  type Settings,
  SKINS,
  GEAR,
  PASS_TIERS,
  levelFromXp,
  passTier,
  type Currency,
} from "@/game/core/content";

export type Stats = {
  wins: number;
  matches: number;
  elims: number;
  shots: number;
  hits: number;
  bestStreak: number;
  goldEarned: number;
};

export type Save = {
  version: 1;
  name: string;
  xp: number;
  gold: number;
  gems: number;
  skinId: string;
  pickaxeId: string;
  backpackId: string;
  gliderId: string;
  /** Battle pass tiers (0-based) whose reward was claimed. */
  passClaimed: number[];
  owned: string[];
  redeemed: string[];
  modeId: string;
  settings: Settings;
  stats: Stats;
};

const KEY = "bb-save-v1";

function fresh(): Save {
  return {
    version: 1,
    name: "Builder",
    xp: 0,
    gold: 850,
    gems: 40,
    skinId: "chainline",
    pickaxeId: "stock",
    backpackId: "none-pack",
    gliderId: "glider",
    passClaimed: [],
    owned: [
      ...SKINS.filter((s) => s.ownedDefault).map((s) => s.id),
      ...GEAR.filter((g) => g.ownedDefault).map((g) => g.id),
    ],
    redeemed: [],
    modeId: "royale",
    settings: structuredClone(DEFAULT_SETTINGS),
    stats: { wins: 0, matches: 0, elims: 0, shots: 0, hits: 0, bestStreak: 0, goldEarned: 0 },
  };
}

let save: Save = fresh();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSave(): Save {
  return save;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Save>;
    const base = fresh();
    save = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings ?? {}), binds: { ...base.settings.binds, ...(parsed.settings?.binds ?? {}) } },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      owned: Array.isArray(parsed.owned) ? parsed.owned : base.owned,
      redeemed: Array.isArray(parsed.redeemed) ? parsed.redeemed : [],
      passClaimed: Array.isArray(parsed.passClaimed) ? parsed.passClaimed : [],
    };
    // items added after the save was made (e.g. the default glider)
    for (const g of GEAR) if (g.ownedDefault && !save.owned.includes(g.id)) save.owned = [...save.owned, g.id];
    // Ctrl+W closes the browser tab, so sprint moved off Ctrl (and crouch off Shift).
    const b = save.settings.binds;
    if (b.sprint === "ControlLeft") {
      b.sprint = "ShiftLeft";
      if (b.crouch === "ShiftLeft") b.crouch = "KeyZ";
    }
    // sliding / rolling was removed from the game; its old key bind goes with it
    delete (b as Record<string, string>).slide;
  } catch {
    save = fresh();
  }
  emit();
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* ignore quota */
  }
  emit();
}

export function patchSave(p: Partial<Save>) {
  save = { ...save, ...p };
  persist();
}

export function patchSettings(p: Partial<Settings>) {
  save = { ...save, settings: { ...save.settings, ...p } };
  persist();
}

export function setBind(action: keyof Settings["binds"], code: string) {
  save = {
    ...save,
    settings: { ...save.settings, binds: { ...save.settings.binds, [action]: code } },
  };
  persist();
}

export function resetBinds() {
  save = { ...save, settings: { ...save.settings, binds: { ...DEFAULT_SETTINGS.binds } } };
  persist();
}

export function owns(id: string) {
  return save.owned.includes(id);
}

export function buy(id: string, price: number, currency: Currency): string | null {
  if (owns(id)) return "Already owned";
  if (currency === "pass") return "Unlock it in the Battle Pass";
  if (currency === "gold" && save.gold < price) return "Not enough gold";
  if (currency === "gems" && save.gems < price) return "Not enough gems";
  save = {
    ...save,
    gold: currency === "gold" ? save.gold - price : save.gold,
    gems: currency === "gems" ? save.gems - price : save.gems,
    owned: [...save.owned, id],
  };
  persist();
  return null;
}

export function redeem(code: string): string {
  const key = code.trim().toUpperCase();
  if (!key) return "Enter a code";
  if (save.redeemed.includes(key)) return "Code already used";
  const table: Record<string, { gold?: number; gems?: number; item?: string }> = {
    BUILT: { gold: 500 },
    RAMPAGE: { gems: 25 },
    ZONEWARS: { gold: 800 },
    FIRSTBLOOD: { item: "honey" },
  };
  const reward = table[key];
  if (!reward) return "Unknown code";
  const owned = [...save.owned];
  if (reward.item && !owned.includes(reward.item)) owned.push(reward.item);
  save = {
    ...save,
    gold: save.gold + (reward.gold ?? 0),
    gems: save.gems + (reward.gems ?? 0),
    owned,
    redeemed: [...save.redeemed, key],
    skinId: reward.item ?? save.skinId,
  };
  persist();
  const bits = [
    reward.gold ? `${reward.gold} gold` : "",
    reward.gems ? `${reward.gems} gems` : "",
    reward.item ? "Honey Scout unlocked" : "",
  ].filter(Boolean);
  return `Redeemed: ${bits.join(", ")}`;
}

export function applyMatchResult(r: { win: boolean; elims: number; shots: number; hits: number; streak: number; gold: number; xp: number }) {
  save = {
    ...save,
    xp: save.xp + r.xp,
    gold: save.gold + r.gold,
    stats: {
      wins: save.stats.wins + (r.win ? 1 : 0),
      matches: save.stats.matches + 1,
      elims: save.stats.elims + r.elims,
      shots: save.stats.shots + r.shots,
      hits: save.stats.hits + r.hits,
      bestStreak: Math.max(save.stats.bestStreak, r.streak),
      goldEarned: save.stats.goldEarned + r.gold,
    },
  };
  persist();
}

export function playerLevel() {
  return levelFromXp(save.xp);
}

/** Claim a battle pass tier (0-based) once it's unlocked. Returns an error or null. */
export function claimTier(i: number): string | null {
  const reward = PASS_TIERS[i];
  if (!reward) return "No such tier";
  if (save.passClaimed.includes(i)) return "Already claimed";
  if (passTier(save.xp) < i + 1) return `Reach tier ${i + 1} first`;
  const owned = reward.item && !save.owned.includes(reward.item) ? [...save.owned, reward.item] : save.owned;
  save = {
    ...save,
    gold: save.gold + (reward.gold ?? 0),
    gems: save.gems + (reward.gems ?? 0),
    owned,
    passClaimed: [...save.passClaimed, i],
  };
  persist();
  return null;
}

/** Number of unlocked tiers whose reward hasn't been claimed yet. */
export function unclaimedTiers() {
  const t = passTier(save.xp);
  let n = 0;
  for (let i = 0; i < t; i++) if (!save.passClaimed.includes(i)) n++;
  return n;
}
