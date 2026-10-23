/**
 * Thin, defensive wrapper around the CrazyGames HTML5 SDK v3
 * (https://docs.crazygames.com/sdk/intro/). Every call is a no-op when the SDK
 * script is absent (normal web build, local dev), so the game never depends on it.
 *
 * Covers what a "full" CrazyGames launch needs here:
 * - loading start/stop
 * - gameplay start/stop (start when a match is running, stop on menus, pause, results)
 * - midgame ads between matches, with game audio muted while the ad plays
 * - the platform mute setting
 * - happytime on a win, and the player's CrazyGames username
 */

type AdCallbacks = { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void };
type CrazySdk = {
  init: () => Promise<void>;
  environment?: "local" | "crazygames" | "disabled";
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    happytime: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (fn: (s: { muteAudio?: boolean }) => void) => void;
  };
  ad: { requestAd: (type: "midgame" | "rewarded", cb: AdCallbacks) => void };
  user?: { getUser: () => Promise<{ username?: string } | null>; isUserAccountAvailable?: boolean };
};

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazySdk };
  }
}

let sdk: CrazySdk | null = null;
let initPromise: Promise<boolean> | null = null;
let playing = false;
let adPlaying = false;
let platformMuted = false;
const muteListeners = new Set<() => void>();

function emitMute() {
  for (const fn of muteListeners) fn();
}

/** Call once at startup. Resolves true when running with a working SDK. */
export function initCrazyGames(): Promise<boolean> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window === "undefined") return false;
    const candidate = window.CrazyGames?.SDK;
    if (!candidate) return false;
    try {
      await candidate.init();
      if (candidate.environment === "disabled") return false;
      sdk = candidate;
      platformMuted = !!sdk.game.settings?.muteAudio;
      sdk.game.addSettingsChangeListener?.((s) => {
        platformMuted = !!s.muteAudio;
        emitMute();
      });
      emitMute();
      return true;
    } catch {
      sdk = null;
      return false;
    }
  })();
  return initPromise;
}

export const crazy = {
  get active() {
    return !!sdk;
  },
  loadingStart() {
    try {
      sdk?.game.loadingStart();
    } catch {
      /* ignore */
    }
  },
  loadingStop() {
    try {
      sdk?.game.loadingStop();
    } catch {
      /* ignore */
    }
  },
  gameplayStart() {
    if (playing) return;
    playing = true;
    try {
      sdk?.game.gameplayStart();
    } catch {
      /* ignore */
    }
  },
  gameplayStop() {
    if (!playing) return;
    playing = false;
    try {
      sdk?.game.gameplayStop();
    } catch {
      /* ignore */
    }
  },
  happytime() {
    try {
      sdk?.game.happytime();
    } catch {
      /* ignore */
    }
  },
  /** True while the game should be silent (ad playing or the platform asked for mute). */
  get muted() {
    return adPlaying || platformMuted;
  },
  onMuteChange(fn: () => void) {
    muteListeners.add(fn);
    return () => muteListeners.delete(fn);
  },
  /**
   * Show a midgame ad (between matches). Always resolves — when ads are unavailable,
   * on cooldown, or blocked, it resolves immediately so the player is never stuck.
   */
  midgameAd(): Promise<void> {
    if (!sdk) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        adPlaying = false;
        emitMute();
        resolve();
      };
      try {
        sdk!.ad.requestAd("midgame", {
          adStarted: () => {
            adPlaying = true;
            emitMute();
          },
          adFinished: finish,
          adError: finish,
        });
      } catch {
        finish();
      }
      // safety net in case no callback ever fires
      window.setTimeout(() => {
        if (!adPlaying) finish();
      }, 4000);
    });
  },
  async username(): Promise<string | null> {
    try {
      if (!sdk?.user?.isUserAccountAvailable) return null;
      const u = await sdk.user.getUser();
      return u?.username ?? null;
    } catch {
      return null;
    }
  },
};
