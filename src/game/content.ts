export const CELL = 4;

export type Quality = "low" | "medium" | "high";
export type RenderDistance = "low" | "medium" | "high";

export type Action =
  | "jump"
  | "crouch"
  | "sprint"
  | "slide"
  | "reload"
  | "edit"
  | "interact"
  | "wall"
  | "floor"
  | "ramp"
  | "roof"
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
  crouch: "ShiftLeft",
  sprint: "ControlLeft",
  slide: "KeyZ",
  reload: "Tab",
  edit: "KeyQ",
  interact: "KeyX",
  wall: "KeyR",
  floor: "KeyF",
  ramp: "KeyE",
  roof: "KeyC",
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

export type Hat = "cap" | "cowboy" | "beanie" | "bunny" | "helmet" | "hood" | "none";

export type Skin = {
  id: string;
  name: string;
  blurb: string;
  price: number;
  currency: "gold" | "gems" | "free";
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
  },
];

export type Gear = {
  id: string;
  name: string;
  kind: "pickaxe" | "backpack";
  price: number;
  currency: "gold" | "gems" | "free";
  primary: string;
  secondary: string;
  ownedDefault?: boolean;
};

export const GEAR: Gear[] = [
  { id: "stock", name: "Stock Pick", kind: "pickaxe", price: 0, currency: "free", primary: "#8d97a5", secondary: "#5c6570", ownedDefault: true },
  { id: "ember", name: "Ember Bit", kind: "pickaxe", price: 900, currency: "gold", primary: "#ff7a32", secondary: "#6a2a16" },
  { id: "bloom", name: "Twin Bloom", kind: "pickaxe", price: 50, currency: "gems", primary: "#ff5ea8", secondary: "#ffe27a" },
  { id: "icepick", name: "Clearcut", kind: "pickaxe", price: 1200, currency: "gold", primary: "#b9e7ff", secondary: "#3a6d88" },
  { id: "none-pack", name: "No Pack", kind: "backpack", price: 0, currency: "free", primary: "#000000", secondary: "#000000", ownedDefault: true },
  { id: "crate", name: "Crate Pack", kind: "backpack", price: 700, currency: "gold", primary: "#c47a3a", secondary: "#6b4224" },
  { id: "medic", name: "Field Kit", kind: "backpack", price: 40, currency: "gems", primary: "#e8f2f4", secondary: "#d24b4b" },
  { id: "rover", name: "Rover Pack", kind: "backpack", price: 1100, currency: "gold", primary: "#3d4a3a", secondary: "#c5a15a" },
];

export type ModeId =
  | "wild-west"
  | "varena"
  | "lategame"
  | "redblue"
  | "box2"
  | "box"
  | "realistic"
  | "free"
  | "aim";

export type MapKind = "hills" | "arena" | "box" | "split" | "aim";

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
    id: "wild-west",
    name: "Wild West Wars",
    kicker: "Zone Wars",
    detail: "8 builders · solo",
    players: 8,
    map: "hills",
    storm: true,
    stormDelay: 42,
    stormRadius: 78,
    mats: 160,
    infiniteMats: false,
    shield: 0,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#e39b3a",
  },
  {
    id: "varena",
    name: "V-Arena",
    kicker: "1v1",
    detail: "Duel on a raised pad",
    players: 2,
    map: "arena",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 220,
    infiniteMats: false,
    shield: 50,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#7c5cff",
  },
  {
    id: "lategame",
    name: "Late Game",
    kicker: "Zone Wars",
    detail: "Final circle · 6 builders",
    players: 6,
    map: "hills",
    storm: true,
    stormDelay: 10,
    stormRadius: 34,
    mats: 480,
    infiniteMats: false,
    shield: 100,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#f0b429",
  },
  {
    id: "redblue",
    name: "Red vs Blue",
    kicker: "Team Deathmatch",
    detail: "8 builders · first to 12",
    players: 8,
    map: "split",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 260,
    infiniteMats: false,
    shield: 50,
    teams: true,
    respawn: true,
    scoreLimit: 12,
    passive: false,
    aim: false,
    accent: "#3aa0e8",
  },
  {
    id: "box2",
    name: "Box Fight 2v2",
    kicker: "2v2",
    detail: "Tight pad · one teammate",
    players: 4,
    map: "box",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 360,
    infiniteMats: false,
    shield: 100,
    teams: true,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#3d8bfd",
  },
  {
    id: "box",
    name: "Box Fight",
    kicker: "1v1",
    detail: "Pure piece control",
    players: 2,
    map: "box",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 420,
    infiniteMats: false,
    shield: 100,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#f08a2a",
  },
  {
    id: "realistic",
    name: "Realistic 1v1",
    kicker: "1v1",
    detail: "Builds and aim decide it",
    players: 2,
    map: "hills",
    storm: true,
    stormDelay: 55,
    stormRadius: 64,
    mats: 240,
    infiniteMats: false,
    shield: 50,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: false,
    aim: false,
    accent: "#e25b2a",
  },
  {
    id: "free",
    name: "Free Mode",
    kicker: "Sandbox",
    detail: "Unlimited mats · wanderers",
    players: 6,
    map: "hills",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 999,
    infiniteMats: true,
    shield: 100,
    teams: false,
    respawn: true,
    scoreLimit: 0,
    passive: true,
    aim: false,
    accent: "#3dcf6e",
  },
  {
    id: "aim",
    name: "Aim Training",
    kicker: "Practice",
    detail: "Moving targets · local",
    players: 1,
    map: "aim",
    storm: false,
    stormDelay: 0,
    stormRadius: 0,
    mats: 200,
    infiniteMats: false,
    shield: 0,
    teams: false,
    respawn: false,
    scoreLimit: 0,
    passive: true,
    aim: true,
    accent: "#f0b429",
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
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}
