import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, Gem } from "lucide-react";
import {
  EMOTES,
  GEAR,
  PASS_SEASON,
  emoteByItem,
  emoteItemId,
  PASS_TIERS,
  PASS_XP_PER_TIER,
  RARITY,
  SKINS,
  passProgress,
  passTier,
  type Currency,
  type PassReward,
  type Rarity,
} from "@/game/core/content";
import { buy, claimTier, getSave, owns, patchSave, redeem } from "@/game/core/save";

/* ---------- item catalogue ---------- */
export type ItemKind = "outfit" | "backpack" | "pickaxe" | "glider" | "emote";
export type Item = { id: string; name: string; kind: ItemKind; rarity: Rarity; price: number; currency: Currency; blurb?: string };

export const KIND_LABEL: Record<ItemKind, string> = { outfit: "Outfit", backpack: "Back Bling", pickaxe: "Harvesting Tool", glider: "Glider", emote: "Emote" };

export const ITEMS: Item[] = [
  ...SKINS.map((s) => ({ id: s.id, name: s.name, kind: "outfit" as const, rarity: s.rarity ?? "common", price: s.price, currency: s.currency, blurb: s.blurb })),
  ...GEAR.filter((g) => g.kind !== "backpack").map((g) => ({ id: g.id, name: g.name, kind: (g.kind === "backpack" ? "backpack" : g.kind) as ItemKind, rarity: g.rarity ?? "common", price: g.price, currency: g.currency })),
  ...EMOTES.map((e) => ({ id: emoteItemId(e.id), name: e.name, kind: "emote" as const, rarity: e.rarity, price: e.price, currency: e.currency, blurb: "Plays from the emote wheel (B) on any outfit." })),
];
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);
const passTierOf = (id: string) => PASS_TIERS.findIndex((t) => t.item === id);

function equippedId(kind: ItemKind) {
  const s = getSave();
  return kind === "outfit" ? s.skinId : kind === "backpack" ? s.backpackId : kind === "pickaxe" ? s.pickaxeId : kind === "emote" ? "" : s.gliderId;
}
function equip(item: Item) {
  // owned emotes are always on the emote wheel: nothing to equip, just show it off on the preview
  if (item.kind === "emote") {
    const em = emoteByItem(item.id);
    void import("@/game/player/preview").then(({ previewEmote }) => previewEmote(em ? em.id : null));
    return;
  }
  if (item.kind === "outfit") patchSave({ skinId: item.id });
  else if (item.kind === "backpack") patchSave({ backpackId: item.id });
  else if (item.kind === "pickaxe") patchSave({ pickaxeId: item.id });
  else patchSave({ gliderId: item.id });
}

/* ---------- small pieces ---------- */
const thumbCache = new Map<string, string>();
function Thumb({ id, className = "" }: { id: string; className?: string }) {
  const [src, setSrc] = useState(thumbCache.get(id) ?? "");
  useEffect(() => {
    if (thumbCache.has(id)) {
      setSrc(thumbCache.get(id)!);
      return;
    }
    let dead = false;
    void import("@/game/player/thumbs")
      .then((m) => m.itemThumb(id))
      .then((u) => {
        thumbCache.set(id, u);
        if (!dead) setSrc(u);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [id]);
  if (id === "none-pack") return <div className={`grid place-items-center font-display text-4xl text-white/40 ${className}`}>∅</div>;
  const em = emoteByItem(id);
  if (em) return <div className={`grid place-items-center text-6xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)] ${className}`}>{em.icon}</div>;
  return src ? (
    <img src={src} alt="" draggable={false} className={`item-art object-contain ${className}`} />
  ) : (
    <div className={`grid place-items-center ${className}`}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/25 border-t-white/80" />
    </div>
  );
}

export function GoldCoin({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill="#f6b400" stroke="#8a5a00" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="7" fill="#ffd84a" />
      <text x="12" y="16.3" textAnchor="middle" fontSize="11" fontWeight="900" fill="#8a5a00" fontFamily="system-ui">$</text>
    </svg>
  );
}
function LockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" fill="currentColor" fillOpacity="0.25" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
export function PassIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 2.5 14.6 8l6 .7-4.4 4.1 1.2 6L12 15.9 6.6 18.8l1.2-6L3.4 8.7l6-.7z" />
    </svg>
  );
}

export function Price({ price, currency, size = "sm" }: { price: number; currency: Currency; size?: "sm" | "lg" }) {
  const big = size === "lg";
  if (currency === "free") return <span className={`font-display ${big ? "text-2xl" : "text-sm"} text-white`}>FREE</span>;
  if (currency === "pass") return <span className={`font-display ${big ? "text-xl" : "text-xs"} text-[#ffe08a]`}>BATTLE PASS</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 font-display ${big ? "text-3xl" : "text-base"} text-white`}>
      {currency === "gems" ? <Gem size={big ? 24 : 15} className="text-gem" /> : <GoldCoin size={big ? 24 : 15} />}
      {price.toLocaleString()}
    </span>
  );
}

const rarityVars = (r: Rarity) =>
  ({ "--r-from": RARITY[r].from, "--r-to": RARITY[r].to, "--r-edge": RARITY[r].edge }) as CSSProperties;

function ItemCard({
  item,
  onClick,
  active = false,
  locked = false,
  big = false,
  footer,
  badge,
}: {
  item: Item;
  onClick?: () => void;
  active?: boolean;
  locked?: boolean;
  big?: boolean;
  footer?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <button onClick={onClick} style={rarityVars(item.rarity)} className={`item-card flex flex-col text-left ${active ? "is-active" : ""} ${locked ? "item-locked" : ""} ${big ? "min-h-72" : "min-h-52"}`}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        <Thumb id={item.id} className={`${big ? "h-56 sm:h-64" : "h-32 sm:h-36"} w-full`} />
        {badge && <div className="absolute top-2 left-2">{badge}</div>}
        {locked && (
          <div className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white/90">
            <LockIcon size={15} />
          </div>
        )}
      </div>
      <div className="item-plate relative px-2.5 pt-3 pb-2">
        <div className={`screen-title leading-none text-white ${big ? "text-2xl" : "text-base sm:text-lg"}`}>{item.name}</div>
        <div className="mt-0.5 text-[10px] font-extrabold tracking-widest text-white/65 uppercase">
          {RARITY[item.rarity].label} {KIND_LABEL[item.kind]}
        </div>
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
      <div className="rarity-bar" />
    </button>
  );
}

function ScreenHeader({ title, sub, onBack, right }: { title: string; sub?: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full bg-bg-deep/85 text-white shadow-lg hover:bg-panel">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="screen-title text-3xl leading-none text-white sm:text-4xl">{title}</h1>
          {sub && <div className="mt-1 text-xs font-extrabold tracking-widest text-white/70 uppercase">{sub}</div>}
        </div>
      </div>
      {right}
    </header>
  );
}

function sourceLabel(item: Item) {
  if (item.currency === "pass") return `Battle Pass · Tier ${passTierOf(item.id) + 1}`;
  if (item.currency === "free") return "Default";
  return "Item Shop";
}

/* ---------- item shop ---------- */
function useCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  const left = Math.max(0, end.getTime() - now) / 1000;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = Math.floor(left % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Shop({ onBack, toast, currencies }: { onBack: () => void; toast: (s: string) => void; currencies: ReactNode }) {
  const save = getSave();
  const left = useCountdown();
  const [open, setOpen] = useState<Item | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const forSale = ITEMS.filter((i) => i.currency === "gold" || i.currency === "gems");
  const order: Rarity[] = ["legendary", "epic", "rare", "uncommon", "common"];
  const best = (k: ItemKind) => [...forSale].filter((i) => i.kind === k).sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity))[0];
  const featured = [best("outfit"), best("glider")].filter((i): i is Item => !!i);
  const sections: { title: string; items: Item[] }[] = [
    { title: "Outfits", items: forSale.filter((i) => i.kind === "outfit" && !featured.includes(i)) },
    { title: "Gliders", items: forSale.filter((i) => i.kind === "glider" && !featured.includes(i)) },
    { title: "Emotes", items: forSale.filter((i) => i.kind === "emote") },
    { title: "Harvesting Tools", items: forSale.filter((i) => i.kind === "pickaxe" && !featured.includes(i)) },
  ];
  const card = (item: Item, big = false) => (
    <ItemCard
      key={item.id}
      item={item}
      big={big}
      onClick={() => setOpen(item)}
      badge={owns(item.id) ? <span className="rounded bg-ok px-1.5 py-0.5 font-display text-[11px] text-bg-deep uppercase">Owned</span> : undefined}
      footer={owns(item.id) ? <span className="font-display text-sm text-white/70">Purchased</span> : <Price price={item.price} currency={item.currency} />}
    />
  );
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Item Shop"
        onBack={onBack}
        sub={
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-play shadow-[0_0_8px_#ffc44d]" /> Refreshes in {left}
          </span>
        }
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setCodeOpen(true)} className="rounded-full bg-bg-deep/85 px-4 py-2 text-sm font-extrabold text-white hover:bg-panel">
              Redeem code
            </button>
            {currencies}
          </div>
        }
      />
      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-6 sm:px-5">
        <SectionTitle>Featured</SectionTitle>
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">{featured.map((i) => card(i, true))}</div>
        {sections.map(
          (sec) =>
            sec.items.length > 0 && (
              <section key={sec.title} className="mb-6">
                <SectionTitle>{sec.title}</SectionTitle>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{sec.items.map((i) => card(i))}</div>
              </section>
            ),
        )}
      </div>
      {open && (
        <ItemModal
          item={open}
          onClose={() => setOpen(null)}
          action={
            owns(open.id) ? (
              open.kind === "emote" ? (
                <div className="rounded-lg bg-white/10 py-3 text-center font-display text-xl text-white/70 uppercase">Owned · on your emote wheel (B)</div>
              ) : equippedId(open.kind) === open.id ? (
                <div className="rounded-lg bg-white/10 py-3 text-center font-display text-xl text-white/70 uppercase">Equipped</div>
              ) : (
                <button
                  className="play-btn w-full rounded-lg py-3 font-display text-2xl text-[#2a1d00] uppercase italic"
                  onClick={() => {
                    equip(open);
                    toast(`${open.name} equipped`);
                    setOpen(null);
                  }}
                >
                  Equip
                </button>
              )
            ) : (
              <button
                className="play-btn flex w-full items-center justify-center gap-3 rounded-lg py-3 font-display text-2xl text-[#2a1d00] uppercase italic"
                onClick={() => {
                  const err = buy(open.id, open.price, open.currency);
                  if (err) {
                    toast(err);
                    return;
                  }
                  if (open.kind !== "emote") equip(open);
                  toast(open.kind === "emote" ? `Unlocked ${open.name}! Press B in a match to use it` : `Unlocked ${open.name}!`);
                  setOpen(null);
                }}
              >
                Purchase
                <span className="flex items-center gap-1 rounded-md bg-black/15 px-2 py-0.5 text-xl not-italic">
                  {open.currency === "gems" ? <Gem size={18} /> : <GoldCoin size={18} />}
                  {open.price.toLocaleString()}
                </span>
              </button>
            )
          }
          note={!owns(open.id) && ((open.currency === "gold" && save.gold < open.price) || (open.currency === "gems" && save.gems < open.price)) ? `You need ${open.price - (open.currency === "gold" ? save.gold : save.gems)} more ${open.currency}.` : undefined}
        />
      )}
      {codeOpen && <RedeemModal onClose={() => setCodeOpen(false)} />}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="screen-title mb-2 flex items-center gap-2 text-xl text-white sm:text-2xl">
      <span className="h-5 w-1.5 rounded-full bg-play" />
      {children}
    </h2>
  );
}

function ItemModal({ item, onClose, action, note }: { item: Item; onClose: () => void; action: ReactNode; note?: string }) {
  const s = SKINS.find((x) => x.id === item.id);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#020a22]/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="pop-in menu-panel flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl sm:flex-row" onClick={(e) => e.stopPropagation()}>
        <div style={rarityVars(item.rarity)} className="item-card flex h-64 items-center justify-center rounded-none sm:h-auto sm:w-1/2">
          <Thumb id={item.id} className="h-60 w-full sm:h-80" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div>
            <div className="text-xs font-extrabold tracking-widest uppercase" style={{ color: RARITY[item.rarity].edge }}>
              {RARITY[item.rarity].label} · {KIND_LABEL[item.kind]}
            </div>
            <div className="screen-title text-4xl leading-none text-white">{item.name}</div>
            {s?.blurb && <p className="mt-2 text-sm font-semibold text-white/75">{s.blurb}</p>}
            <div className="mt-2 text-xs font-bold text-white/55">{sourceLabel(item)}</div>
          </div>
          <div className="mt-auto space-y-2">
            {!owns(item.id) && item.currency !== "pass" && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold tracking-widest text-white/60 uppercase">Price</span>
                <Price price={item.price} currency={item.currency} size="lg" />
              </div>
            )}
            {action}
            {note && <div className="text-center text-xs font-bold text-[#ffb4a8]">{note}</div>}
            <button onClick={onClose} className="w-full rounded-lg bg-white/10 py-2.5 font-extrabold text-white hover:bg-white/15">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RedeemModal({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-[#020a22]/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <form
        className="pop-in menu-panel w-full max-w-sm rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(redeem(code));
          setCode("");
        }}
      >
        <div className="screen-title mb-3 text-2xl text-white">Redeem a code</div>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ENTER CODE"
          aria-label="Redeem code"
          className="w-full rounded-lg bg-black/30 px-3 py-3 font-display tracking-widest text-white uppercase outline-none placeholder:text-white/35 focus:ring-2 focus:ring-play"
        />
        {msg && <div className="mt-2 text-sm font-bold text-white/85">{msg}</div>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-white/10 py-3 font-extrabold text-white">
            Close
          </button>
          <button type="submit" className="play-btn flex-1 rounded-lg py-3 font-display text-lg text-[#2a1d00] uppercase">
            Redeem
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- locker ---------- */
const SLOTS: { kind: ItemKind; label: string }[] = [
  { kind: "outfit", label: "Outfit" },
  { kind: "pickaxe", label: "Pickaxe" },
  { kind: "glider", label: "Glider" },
  { kind: "emote", label: "Emotes" },
];

export function Locker({ onBack, toast, currencies }: { onBack: () => void; toast: (s: string) => void; currencies: ReactNode }) {
  const save = getSave();
  const [slot, setSlot] = useState<ItemKind>("outfit");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const showGlider = slot === "glider";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dispose = () => {};
    let dead = false;
    void import("@/game/player/preview").then(({ mountPreview }) => {
      if (dead || !canvasRef.current) return;
      dispose = mountPreview(canvasRef.current, save.skinId, "none-pack", save.pickaxeId, showGlider ? { glider: save.gliderId } : { pick: slot === "pickaxe" });
    });
    return () => {
      dead = true;
      dispose();
      void import("@/game/player/preview").then(({ previewEmote }) => previewEmote(null));
    };
  }, [save.skinId, save.backpackId, save.pickaxeId, save.gliderId, showGlider, slot]);

  const list = useMemo(() => {
    const all = ITEMS.filter((i) => i.kind === slot);
    return [...all.filter((i) => owns(i.id)), ...all.filter((i) => !owns(i.id))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, save.owned.length]);
  const current = itemById(equippedId(slot));
  const ownedCount = ITEMS.filter((i) => owns(i.id)).length;

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Locker" sub={`${ownedCount} / ${ITEMS.length} items collected`} onBack={onBack} right={currencies} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:px-5 md:flex-row">
        {/* stage */}
        <div className="relative hidden min-h-0 md:block md:w-[38%] lg:w-[34%]">
          <canvas ref={canvasRef} className="h-full w-full" />
          {current && (
            <div className="pointer-events-none absolute inset-x-0 top-1 text-center">
              <div className="text-[11px] font-extrabold tracking-widest uppercase" style={{ color: RARITY[current.rarity].edge }}>
                {RARITY[current.rarity].label} {KIND_LABEL[current.kind]}
              </div>
              <div className="screen-title text-3xl leading-none text-white">{current.name}</div>
              <div className="mt-1 text-[11px] font-bold text-white/50">Drag to spin</div>
            </div>
          )}
        </div>
        {/* loadout + picker */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="menu-panel rounded-2xl p-3">
            <div className="mb-2 text-xs font-extrabold tracking-widest text-white/60 uppercase">Loadout</div>
            <div className="grid grid-cols-4 gap-2">
              {SLOTS.map((s) => {
                const ownedEmotes = EMOTES.filter((e) => owns(emoteItemId(e.id)));
                const it = s.kind === "emote" ? (ownedEmotes[0] ? itemById(emoteItemId(ownedEmotes[0].id)) : undefined) : itemById(equippedId(s.kind));
                return (
                  <button
                    key={s.kind}
                    onClick={() => setSlot(s.kind)}
                    style={rarityVars(it?.rarity ?? "common")}
                    className={`item-card flex aspect-[4/5] flex-col ${slot === s.kind ? "is-active" : ""}`}
                  >
                    <div className="flex min-h-0 flex-1 items-center justify-center p-1">{it && <Thumb id={it.id} className="h-full max-h-28 w-full" />}</div>
                    <div className="item-plate px-1.5 pt-2 pb-1.5 text-left">
                      <div className="text-[9px] font-extrabold tracking-widest text-white/60 uppercase sm:text-[10px]">{s.label}</div>
                      <div className="truncate font-display text-xs text-white sm:text-sm">{s.kind === "emote" ? `${ownedEmotes.length} owned` : (it?.name ?? "None")}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="menu-panel flex min-h-0 flex-1 flex-col rounded-2xl p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="screen-title text-xl text-white">Choose {SLOTS.find((s) => s.kind === slot)!.label}</div>
              <div className="text-xs font-bold text-white/55">
                {list.filter((i) => owns(i.id)).length} owned · {list.length} total
              </div>
            </div>
            <div className="settings-scroll grid min-h-0 flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {list.map((it) => {
                const have = owns(it.id);
                return (
                  <ItemCard
                    key={it.id}
                    item={it}
                    locked={!have}
                    active={it.kind !== "emote" && equippedId(it.kind) === it.id}
                    onClick={() => {
                      if (!have) {
                        toast(it.currency === "pass" ? `Unlocks at Battle Pass tier ${passTierOf(it.id) + 1}` : "Find it in the Item Shop");
                        return;
                      }
                      equip(it);
                    }}
                    footer={
                      have ? (
                        it.kind === "emote" ? (
                          <span className="font-display text-xs text-white/70 uppercase">Owned · tap to preview</span>
                        ) : equippedId(it.kind) === it.id ? (
                          <span className="inline-flex items-center gap-1 font-display text-xs text-play uppercase">
                            <CheckIcon size={13} /> Equipped
                          </span>
                        ) : undefined
                      ) : (
                        <span className="text-[10px] font-extrabold text-white/60 uppercase">{sourceLabel(it)}</span>
                      )
                    }
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- battle pass ---------- */
function rewardName(r: PassReward) {
  if (r.item) return itemById(r.item)?.name ?? r.item;
  if (r.gold) return `${r.gold.toLocaleString()} Gold`;
  return `${r.gems} Gems`;
}
function rewardRarity(r: PassReward): Rarity {
  if (r.item) return itemById(r.item)?.rarity ?? "rare";
  if (r.gems) return (r.gems ?? 0) >= 30 ? "epic" : "rare";
  return (r.gold ?? 0) >= 900 ? "rare" : "uncommon";
}
function RewardArt({ r, big = false }: { r: PassReward; big?: boolean }) {
  if (r.item) return <Thumb id={r.item} className={big ? "h-48 w-full sm:h-64 lg:h-80" : "h-28 w-full"} />;
  const n = r.gold ?? r.gems ?? 0;
  const pile = Math.min(5, 1 + Math.floor(n / 250) + (r.gems ? Math.floor(n / 12) : 0));
  return (
    <div className={`item-art relative flex items-center justify-center ${big ? "h-48 sm:h-64 lg:h-80" : "h-28"}`}>
      {Array.from({ length: pile }).map((_, i) => (
        <div key={i} className="absolute" style={{ transform: `translate(${(i - (pile - 1) / 2) * (big ? 34 : 16)}px, ${Math.abs(i - (pile - 1) / 2) * (big ? 14 : 7)}px) rotate(${(i - (pile - 1) / 2) * 9}deg)` }}>
          {r.gems ? <Gem size={big ? 96 : 46} className="text-gem drop-shadow-[0_4px_0_rgba(0,40,90,0.45)]" /> : <GoldCoin size={big ? 104 : 50} />}
        </div>
      ))}
      <div className={`absolute bottom-1 font-display text-white drop-shadow-[0_2px_0_rgba(0,0,0,0.5)] ${big ? "text-4xl" : "text-xl"}`}>×{n.toLocaleString()}</div>
    </div>
  );
}

export function BattlePass({ onBack, toast, currencies }: { onBack: () => void; toast: (s: string) => void; currencies: ReactNode }) {
  const save = getSave();
  const tier = passTier(save.xp);
  const prog = passProgress(save.xp);
  const firstOpen = PASS_TIERS.findIndex((_, i) => i < tier && !save.passClaimed.includes(i));
  const [sel, setSel] = useState(firstOpen >= 0 ? firstOpen : Math.min(PASS_TIERS.length - 1, tier - 1));
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    trackRef.current?.querySelector<HTMLElement>(`[data-tier="${sel}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const reward = PASS_TIERS[sel]!;
  const claimed = save.passClaimed.includes(sel);
  const unlocked = sel < tier;
  const unclaimed = PASS_TIERS.map((_, i) => i).filter((i) => i < tier && !save.passClaimed.includes(i));
  const claim = (i: number) => {
    const err = claimTier(i);
    if (err) toast(err);
    else toast(`Claimed ${rewardName(PASS_TIERS[i]!)}!`);
  };
  const maxed = tier >= PASS_TIERS.length;
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Battle Pass" sub={PASS_SEASON} onBack={onBack} right={currencies} />
      <div className="settings-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 sm:px-5 md:overflow-visible">
        <div className="flex shrink-0 flex-col gap-3 md:min-h-0 md:flex-1 md:shrink md:flex-row">
          {/* selected reward */}
          <div style={rarityVars(rewardRarity(reward))} className="item-card flex min-h-60 flex-col md:w-[42%]">
            <div className="flex min-h-0 flex-1 items-center justify-center p-3">
              <RewardArt r={reward} big />
            </div>
            <div className="item-plate flex items-end justify-between gap-3 px-4 pt-6 pb-3">
              <div>
                <div className="text-xs font-extrabold tracking-widest text-white/70 uppercase">
                  Tier {sel + 1} · {reward.item ? `${RARITY[rewardRarity(reward)].label} ${KIND_LABEL[itemById(reward.item)?.kind ?? "outfit"]}` : "Currency"}
                </div>
                <div className="screen-title text-3xl leading-none text-white">{rewardName(reward)}</div>
              </div>
              {claimed ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-ok/90 px-3 py-2 font-display text-bg-deep uppercase">
                  <CheckIcon size={16} /> Claimed
                </span>
              ) : unlocked ? (
                <button onClick={() => claim(sel)} className="play-btn claim-ready rounded-lg px-5 py-2 font-display text-xl text-[#2a1d00] uppercase italic">
                  Claim
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/40 px-3 py-2 font-display text-sm text-white/80 uppercase">
                  <LockIcon size={15} /> Tier {sel + 1}
                </span>
              )}
            </div>
            <div className="rarity-bar" />
          </div>
          {/* progress */}
          <div className="menu-panel flex flex-1 flex-col justify-between gap-4 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center gap-4">
              <div className="relative grid h-24 w-24 shrink-0 place-items-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                  <path d="M50 3 61 36l35 1-28 21 10 34-28-20-28 20 10-34L4 37l35-1z" fill="url(#pg)" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#fff27a" />
                      <stop offset="1" stopColor="#f6b400" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="relative mt-1 font-display text-3xl text-[#3a2800]">{tier}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-extrabold tracking-widest text-white/60 uppercase">Current tier</div>
                <div className="screen-title text-3xl leading-none text-white">
                  Tier {tier} <span className="text-white/45">/ {PASS_TIERS.length}</span>
                </div>
                <div className="mt-2 h-4 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/15">
                  <div className="xp-fill h-full rounded-full" style={{ width: `${Math.round(prog * 100)}%` }} />
                </div>
                <div className="mt-1 text-xs font-bold text-white/65">
                  {maxed ? "Season complete. Every reward unlocked!" : `${Math.round(prog * PASS_XP_PER_TIER)} / ${PASS_XP_PER_TIER} XP to tier ${tier + 1}`}
                </div>
              </div>
            </div>
            <ul className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Play a match", "+40 XP"],
                ["Each elimination", "+20 XP"],
                ["Victory Royale", "+120 XP"],
              ].map(([k, v]) => (
                <li key={k} className="rounded-xl bg-black/25 px-2 py-2.5">
                  <div className="font-display text-lg text-gem">{v}</div>
                  <div className="text-[10px] font-extrabold tracking-wide text-white/60 uppercase">{k}</div>
                </li>
              ))}
            </ul>
            <button
              disabled={!unclaimed.length}
              onClick={() => {
                for (const i of unclaimed) claimTier(i);
                toast(`Claimed ${unclaimed.length} reward${unclaimed.length > 1 ? "s" : ""}!`);
              }}
              className={`rounded-lg py-3 font-display text-xl uppercase italic ${unclaimed.length ? "play-btn text-[#2a1d00]" : "bg-white/10 text-white/40"}`}
            >
              {unclaimed.length ? `Claim all (${unclaimed.length})` : "Nothing to claim"}
            </button>
          </div>
        </div>
        {/* tier track */}
        <div ref={trackRef} className="h-scroll flex shrink-0 gap-2.5 overflow-x-auto pt-1 pb-4">
          {PASS_TIERS.map((r, i) => {
            const isClaimed = save.passClaimed.includes(i);
            const open = i < tier;
            const ready = open && !isClaimed;
            return (
              <button
                key={i}
                data-tier={i}
                onClick={() => setSel(i)}
                style={rarityVars(rewardRarity(r))}
                className={`item-card flex w-32 shrink-0 flex-col sm:w-36 ${sel === i ? "is-active" : ""} ${!open ? "item-locked" : ""} ${ready && sel !== i ? "claim-ready" : ""}`}
              >
                <div className="flex items-center justify-between px-2 pt-1.5">
                  <span className={`rounded px-1.5 font-display text-sm ${open ? "bg-play text-[#3a2800]" : "bg-black/45 text-white/75"}`}>{i + 1}</span>
                  {isClaimed ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-ok text-bg-deep">
                      <CheckIcon size={13} />
                    </span>
                  ) : !open ? (
                    <span className="text-white/80">
                      <LockIcon size={15} />
                    </span>
                  ) : null}
                </div>
                <RewardArt r={r} />
                <div className="item-plate px-2 pt-2 pb-1.5 text-left">
                  <div className="truncate font-display text-sm text-white">{rewardName(r)}</div>
                  <div className="text-[9px] font-extrabold tracking-widest text-white/55 uppercase">{ready ? "Ready to claim" : r.item ? KIND_LABEL[itemById(r.item)?.kind ?? "outfit"] : "Currency"}</div>
                </div>
                <div className="rarity-bar" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
