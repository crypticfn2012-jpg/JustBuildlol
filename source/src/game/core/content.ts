/** Build grid: pieces are CELL wide and CELL_H tall (1v1.LOL's 5 m pieces; walls a little taller than its 3.5 m). */
export const CELL = 5;
export const CELL_H = 4;

export type Quality = "low" | "medium" | "high";
export type RenderDistance = "low" | "medium" | "high";

export type Action =
  | "jump"
  | "crouch"
  | "sprint"
  | "inventory"
  | "reload"
  | "edit"
  | "resetEdit"
  | "emote"
  | "interact"
  | "wall"
  | "floor"
  | "ramp"
  | "roof"
  | "material"
  | "slot1"
  | "slot2"
  | "slot3"
  | "slot4"
  | "slot5"
  | "slot6";

export type Settings = {
  quality: Quality;
  renderDistance: RenderDistance;
  showCrosshair: boolean;
  shadows: boolean;
  fpsLimit: number;
  mouseSens: number;
  adsSens: number;
  invertY: boolean;
  aimAssist: boolean;
  master: number;
  music: number;
  sfx: number;
  region: string;
  showNet: boolean;
  uiScale: number;
  gamepadSens: number;
  deadzone: number;
  binds: Record<Action, string>;
};

export const DEFAULT_BINDS: Record<Action, string> = {
  jump: "Space",
  crouch: "KeyZ",
  sprint: "ShiftLeft",
  inventory: "KeyI",
  reload: "Tab",
  edit: "KeyQ",
  resetEdit: "MouseWheel",
  emote: "KeyB",
  interact: "KeyX",
  wall: "KeyR",
  floor: "KeyF",
  ramp: "KeyE",
  roof: "KeyC",
  material: "KeyV",
  slot1: "Digit1",
  slot2: "Digit2",
  slot3: "Digit3",
  slot4: "Digit4",
  slot5: "Digit5",
  slot6: "Digit6",
};

export const DEFAULT_SETTINGS: Settings = {
  quality: "medium",
  renderDistance: "medium",
  showCrosshair: true,
  shadows: true,
  fpsLimit: 0,
  mouseSens: 42,
  adsSens: 62,
  invertY: false,
  aimAssist: true,
  master: 80,
  music: 28,
  sfx: 80,
  region: "Local",
  showNet: false,
  uiScale: 100,
  gamepadSens: 46,
  deadzone: 16,
  binds: { ...DEFAULT_BINDS },
};

/**
 * Emotes: posed in code on the shared character rig, so they work with every skin. They are sold in the
 * Item Shop (save id `emote-<id>`); only owned emotes show on the emote wheel.
 */
export type Emote = { id: string; name: string; icon: string; price: number; currency: Currency; rarity: Rarity };
export const EMOTES: Emote[] = [
  { id: "wave", name: "Wave", icon: "👋", price: 200, currency: "gold", rarity: "common" },
  { id: "clap", name: "Applause", icon: "👏", price: 250, currency: "gold", rarity: "common" },
  { id: "salute", name: "Salute", icon: "🫡", price: 300, currency: "gold", rarity: "uncommon" },
  { id: "jacks", name: "Jumping Jacks", icon: "🤸", price: 400, currency: "gold", rarity: "uncommon" },
  { id: "robot", name: "Robot", icon: "🤖", price: 600, currency: "gold", rarity: "rare" },
  { id: "groove", name: "Groove", icon: "🎶", price: 700, currency: "gold", rarity: "rare" },
  { id: "disco", name: "Disco", icon: "🪩", price: 60, currency: "gems", rarity: "epic" },
  { id: "floss", name: "Floss", icon: "🕺", price: 90, currency: "gems", rarity: "legendary" },
];
export const emoteItemId = (id: string) => `emote-${id}`;
export const emoteByItem = (itemId: string) => EMOTES.find((e) => emoteItemId(e.id) === itemId);

export type Hat = "cap" | "cowboy" | "beanie" | "bunny" | "helmet" | "hood" | "none";

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
/** Card colours per rarity (Fortnite-style: grey, green, blue, purple, orange). */
export const RARITY: Record<Rarity, { label: string; from: string; to: string; edge: string }> = {
  common: { label: "Common", from: "#8a97a8", to: "#4f5b6b", edge: "#c3ccd8" },
  uncommon: { label: "Uncommon", from: "#5fc23a", to: "#1f7a26", edge: "#a6ee7a" },
  rare: { label: "Rare", from: "#3ab4ff", to: "#1450b8", edge: "#8fd8ff" },
  epic: { label: "Epic", from: "#c45cff", to: "#5a1fa8", edge: "#e2a8ff" },
  legendary: { label: "Legendary", from: "#ffa93a", to: "#b8461a", edge: "#ffd88f" },
};

/** "pass" items are battle pass rewards and can't be bought. */
export type Currency = "gold" | "gems" | "free" | "pass";

export type Skin = {
  id: string;
  name: string;
  blurb: string;
  price: number;
  currency: Currency;
  rarity?: Rarity;
  cap: string;
  shirt: string;
  stripe: string;
  pants: string;
  skinTone: string;
  hair: string;
  hat: Hat;
  accent: string;
  ownedDefault?: boolean;
};

export const SKINS: Skin[] = [
  {
    id: "chainline",
    name: "Chainline",
    blurb: "Street cap, red band, no excuses.",
    price: 0,
    currency: "free",
    cap: "#f0c84a",
    shirt: "#f4f6f8",
    stripe: "#d24b4b",
    pants: "#2c3138",
    skinTone: "#f0c2a0",
    hair: "#6a3b2a",
    hat: "cap",
    accent: "#f0c84a",
    ownedDefault: true,
  },
  {
    id: "mesa",
    name: "Mesa Fox",
    blurb: "Dust trail hat and sunset vest.",
    price: 1800,
    currency: "gold",
    cap: "#c47a3a",
    shirt: "#f2d2a2",
    stripe: "#8a3e22",
    pants: "#5a3a28",
    skinTone: "#e0aa84",
    hair: "#3a2418",
    hat: "cowboy",
    accent: "#e07a32",
    rarity: "uncommon",
  },
  {
    id: "static",
    name: "Violet Static",
    blurb: "Night circuit hoodie.",
    price: 2200,
    currency: "gold",
    cap: "#2a2148",
    shirt: "#221c38",
    stripe: "#b06cff",
    pants: "#141222",
    skinTone: "#d9b39a",
    hair: "#1a1028",
    hat: "hood",
    accent: "#b06cff",
    rarity: "rare",
  },
  {
    id: "hare",
    name: "Neon Hare",
    blurb: "Ears up. Edits faster.",
    price: 90,
    currency: "gems",
    cap: "#ff4f93",
    shirt: "#fff4f8",
    stripe: "#ff4f93",
    pants: "#3a3550",
    skinTone: "#f3c7b0",
    hair: "#ff7ab3",
    hat: "bunny",
    accent: "#ff4f93",
    rarity: "epic",
  },
  {
    id: "warden",
    name: "Marsh Warden",
    blurb: "Green kit for late circles.",
    price: 1600,
    currency: "gold",
    cap: "#2f6b45",
    shirt: "#3e8f5a",
    stripe: "#d6e38a",
    pants: "#243628",
    skinTone: "#c98862",
    hair: "#2a1c14",
    hat: "helmet",
    accent: "#7dce6a",
    rarity: "uncommon",
  },
  {
    id: "honey",
    name: "Honey Scout",
    blurb: "Amber jacket, bright boots.",
    price: 1400,
    currency: "gold",
    cap: "#f2b423",
    shirt: "#f6e27a",
    stripe: "#ef8b2a",
    pants: "#3d3428",
    skinTone: "#efc09a",
    hair: "#5c3318",
    hat: "cap",
    accent: "#f2b423",
    rarity: "rare",
  },
  {
    id: "glacier",
    name: "Glacier Line",
    blurb: "Cold metal, clean aim.",
    price: 70,
    currency: "gems",
    cap: "#d7e7f5",
    shirt: "#eef6ff",
    stripe: "#3aa0d8",
    pants: "#223044",
    skinTone: "#f4d2bc",
    hair: "#8aa4b8",
    hat: "beanie",
    accent: "#7ec8f0",
    rarity: "epic",
  },
  {
    id: "goldstandard",
    name: "High Ground",
    blurb: "Champion gold. Earned, or bought.",
    price: 160,
    currency: "gems",
    cap: "#f0b429",
    shirt: "#1c2430",
    stripe: "#f0b429",
    pants: "#14181f",
    skinTone: "#e8b894",
    hair: "#1a120c",
    hat: "helmet",
    accent: "#f0b429",
    rarity: "legendary",
  },
  {
    id: "tidecaller",
    name: "Tidecaller",
    blurb: "Rides the first wave off the drop ship.",
    price: 0,
    currency: "pass",
    cap: "#1d8fb0",
    shirt: "#e8fbff",
    stripe: "#22b8c8",
    pants: "#173a4a",
    skinTone: "#c98862",
    hair: "#0f2630",
    hat: "beanie",
    accent: "#22b8c8",
    rarity: "epic",
  },
  {
    id: "ranger",
    name: "Driftwood Ranger",
    blurb: "Season 1's last reward. Wears the island.",
    price: 0,
    currency: "pass",
    cap: "#7a4a24",
    shirt: "#2f3a24",
    stripe: "#f0b429",
    pants: "#3a2a1a",
    skinTone: "#e0aa84",
    hair: "#24160c",
    hat: "cowboy",
    accent: "#f0b429",
    rarity: "legendary",
  },
];

export type GliderStyle = "delta" | "parafoil" | "umbrella" | "wing";
export type GliderPattern = "stripe" | "chevron" | "dots" | "split" | "stars" | "flame" | "waves" | "check";

export type Gear = {
  id: string;
  name: string;
  kind: "pickaxe" | "backpack" | "glider";
  price: number;
  currency: Currency;
  primary: string;
  secondary: string;
  ownedDefault?: boolean;
  rarity?: Rarity;
  /** Model to build: pickaxes reuse a head design (stock, ember, bloom, icepick); gliders pick a frame. */
  style?: string;
  accent?: string;
  pattern?: GliderPattern;
};

export const GEAR: Gear[] = [
  { id: "stock", name: "Stock Pick", kind: "pickaxe", price: 0, currency: "free", primary: "#8d97a5", secondary: "#5c6570", ownedDefault: true },
  { id: "ember", name: "Ember Bit", kind: "pickaxe", price: 900, currency: "gold", primary: "#ff7a32", secondary: "#6a2a16", rarity: "rare" },
  { id: "bloom", name: "Twin Bloom", kind: "pickaxe", price: 50, currency: "gems", primary: "#ff5ea8", secondary: "#ffe27a", rarity: "epic" },
  { id: "icepick", name: "Clearcut", kind: "pickaxe", price: 1200, currency: "gold", primary: "#b9e7ff", secondary: "#3a6d88", rarity: "rare" },
  { id: "none-pack", name: "No Pack", kind: "backpack", price: 0, currency: "free", primary: "#000000", secondary: "#000000", ownedDefault: true },
  // gliders
  { id: "glider", name: "Glider", kind: "glider", price: 0, currency: "free", primary: "#f28c38", secondary: "#ffffff", accent: "#2a3340", style: "delta", pattern: "stripe", ownedDefault: true },
  { id: "skyline", name: "Skyline", kind: "glider", price: 800, currency: "gold", primary: "#2f7fe0", secondary: "#f4f7fb", accent: "#1b2a44", style: "delta", pattern: "chevron", rarity: "uncommon" },
  { id: "sunset-sail", name: "Sunset Sail", kind: "glider", price: 1100, currency: "gold", primary: "#ff6a3d", secondary: "#ffd23f", accent: "#7a2a5a", style: "parafoil", pattern: "waves", rarity: "rare" },
  { id: "polka", name: "Polka Pop", kind: "glider", price: 45, currency: "gems", primary: "#ff4f93", secondary: "#fff4f8", accent: "#3a3550", style: "umbrella", pattern: "dots", rarity: "rare" },
  { id: "nightwing", name: "Nightwing", kind: "glider", price: 90, currency: "gems", primary: "#1c1a33", secondary: "#9a6cff", accent: "#e7dcff", style: "delta", pattern: "stars", rarity: "epic" },
  // battle pass rewards
  { id: "brolly", name: "Summit Brolly", kind: "glider", price: 0, currency: "pass", primary: "#e63b3b", secondary: "#ffffff", accent: "#2b2b2b", style: "umbrella", pattern: "split", rarity: "rare" },
  { id: "coral", name: "Coral Cutter", kind: "pickaxe", price: 0, currency: "pass", primary: "#ff7f6a", secondary: "#1d6f86", style: "bloom", rarity: "rare" },
  { id: "seabreeze", name: "Seabreeze", kind: "glider", price: 0, currency: "pass", primary: "#22b8c8", secondary: "#f6fbff", accent: "#0f4f6a", style: "parafoil", pattern: "stripe", rarity: "rare" },
  { id: "wavebreaker", name: "Wavebreaker", kind: "glider", price: 0, currency: "pass", primary: "#0f5fa8", secondary: "#7fe3ff", accent: "#0b1f3a", style: "delta", pattern: "waves", rarity: "epic" },
  { id: "sunsplitter", name: "Sunsplitter", kind: "pickaxe", price: 0, currency: "pass", primary: "#ffc93a", secondary: "#7a2a12", style: "ember", rarity: "epic" },
  { id: "goldwing", name: "Goldwing", kind: "glider", price: 0, currency: "pass", primary: "#f0b429", secondary: "#1c2430", accent: "#ffe9a8", style: "wing", pattern: "flame", rarity: "legendary" },
];

/* ---------- battle pass ---------- */
export const PASS_SEASON = "Season 1 · Driftwood";
export const PASS_XP_PER_TIER = 200;
export type PassReward = { gold?: number; gems?: number; item?: string };
/** One reward per tier. Tiers unlock from total XP; rewards are claimed in the Battle Pass screen. */
export const PASS_TIERS: PassReward[] = [
  { gold: 300 },
  { item: "brolly" },
  { gems: 10 },
  { gold: 400 },
  { gold: 500 },
  { item: "coral" },
  { gems: 15 },
  { item: "seabreeze" },
  { gold: 700 },
  { item: "tidecaller" },
  { gems: 20 },
  { item: "wavebreaker" },
  { gems: 25 },
  { gold: 900 },
  { gems: 30 },
  { item: "sunsplitter" },
  { gold: 1200 },
  { item: "goldwing" },
  { gems: 50 },
  { item: "ranger" },
];
export function passTier(xp: number) {
  return Math.min(PASS_TIERS.length, Math.floor(Math.max(0, xp) / PASS_XP_PER_TIER) + 1);
}
/** Progress (0..1) toward the next tier. */
export function passProgress(xp: number) {
  if (passTier(xp) >= PASS_TIERS.length) return 1;
  return (Math.max(0, xp) % PASS_XP_PER_TIER) / PASS_XP_PER_TIER;
}

export type ModeId = "royale" | "duel";

export type MapKind = "island" | "duel";

export type ModeDef = {
  id: ModeId;
  name: string;
  kicker: string;
  detail: string;
  players: number;
  map: MapKind;
  storm: boolean;
  stormDelay: number;
  stormRadius: number;
  mats: number;
  infiniteMats: boolean;
  shield: number;
  teams: boolean;
  respawn: boolean;
  scoreLimit: number;
  passive: boolean;
  aim: boolean;
  accent: string;
};

export const MODES: ModeDef[] = [
  {
    id: "royale",
    name: "Driftwood Royale",
    kicker: "Battle Royale",
    detail: "16 players · solo · drop in",
    players: 16,
    map: "island",
    storm: true,
    stormDelay: 50,
    stormRadius: 240,
    mats: 0,
    infiniteMats: false,
    shield: 0,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#2fb8a0",
  },
  {
    id: "duel",
    name: "1v1 Build Fights",
    kicker: "1v1",
    detail: "First to 5 · full mats · builds reset",
    players: 2,
    map: "duel",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 999,
    infiniteMats: false,
    shield: 100,
    teams: false,
    respawn: false,
    scoreLimit: 5,
    passive: false,
    aim: false,
    accent: "#7c5cff",
  },
];

export const BOT_NAMES = [
  "Bricklayer",
  "Rampage",
  "Cone King",
  "Edit Wiz",
  "High Ground",
  "Box Bandit",
  "Dusty",
  "Nash",
  "Pine",
  "Quarry",
  "Ledge",
  "Sable",
];

export const CODES: Record<string, { gold?: number; gems?: number; item?: string }> = {
  BUILT: { gold: 500 },
  RAMPAGE: { gems: 25 },
  ZONEWARS: { gold: 800 },
  FIRSTBLOOD: { item: "honey" },
};

export function modeById(id: string): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0]!;
}

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0]!;
}

export function gearById(id: string): Gear {
  return GEAR.find((g) => g.id === id) ?? GEAR[0]!;
}

export function levelFromXp(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
}

export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    Space: "Space",
    ShiftLeft: "Shift",
    ShiftRight: "R-Shift",
    ControlLeft: "Ctrl",
    ControlRight: "R-Ctrl",
    Tab: "Tab",
    AltLeft: "Alt",
    AltRight: "R-Alt",
    Backquote: "`",
    Escape: "Esc",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    MouseWheel: "Scroll wheel",
    Mouse3: "Middle mouse",
    Mouse4: "Mouse 4",
    Mouse5: "Mouse 5",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
