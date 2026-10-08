// Rewarded ads (quick wins, 2026-10-08): the player can choose to watch one short ad a day for the
// trader's cart. Nothing here ever starts an ad by itself; `show` runs only from the offer's button.
//
// Providers, chosen when the page loads:
// - `?ads=test` (or `?ads=test-empty`): a stand-in ad drawn by the page, for development and tests.
// - VITE_ADS=crazygames at build time: the CrazyGames SDK, only when actually running on CrazyGames.
// - VITE_ADSENSE_CLIENT=ca-pub-… at build time: Google's H5 Games Ads (the Ad Placement API).
// With none of these, there is no provider and the game shows no offer at all.

export type AdResult = 'watched' | 'dismissed' | 'unavailable';

/** What the game does around an ad: stop the town while it plays, start it again after. */
export interface AdHooks {
  pause(): void;
  resume(): void;
}

export interface RewardedAds {
  readonly name: string;
  show(hooks: AdHooks): Promise<AdResult>;
}

type AnyWindow = Window & Record<string, any>;

function loadScript(src: string): Promise<void> {
  return new Promise((done, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = () => done();
    s.onerror = () => fail(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

/** A stand-in ad: a card with a countdown, which the player can watch to the end or close early. */
export function testAds(empty = false): RewardedAds {
  return {
    name: 'test',
    show(hooks) {
      if (empty) return Promise.resolve('unavailable');
      return new Promise((done) => {
        hooks.pause();
        const back = document.createElement('div');
        back.className = 'modal-back ad-test';
        back.setAttribute('data-testid', 'ad-test');
        back.innerHTML = `<div class="modal paper"><h2>A short ad</h2><p>This stands in for a real ad while testing.</p>
          <div class="ad-row"><button data-testid="ad-test-finish">Watch to the end</button><button data-testid="ad-test-close">Close early</button></div></div>`;
        const finish = (r: AdResult) => {
          back.remove();
          hooks.resume();
          done(r);
        };
        (back.querySelector('[data-testid="ad-test-finish"]') as HTMLElement).addEventListener('click', () => finish('watched'));
        (back.querySelector('[data-testid="ad-test-close"]') as HTMLElement).addEventListener('click', () => finish('dismissed'));
        document.body.appendChild(back);
      });
    },
  };
}

/** Google's H5 Games Ads, through the Ad Placement API (adBreak with type 'reward'). */
function googleAds(client: string): RewardedAds {
  const w = window as AnyWindow;
  w.adsbygoogle = w.adsbygoogle || [];
  w.adBreak = w.adConfig = (o: unknown) => w.adsbygoogle.push(o);
  loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`).catch(() => {
    // Blocked or offline: every offer will come back "unavailable".
  });
  w.adConfig({ preloadAdBreaks: 'on', sound: 'off' });
  return {
    name: 'google',
    show(hooks) {
      return new Promise((done) => {
        let shown = false;
        let result: AdResult = 'unavailable';
        let settled = false;
        const settle = (r: AdResult) => {
          if (settled) return;
          settled = true;
          done(r);
        };
        // If the library never answers (an ad blocker), don't leave the button waiting.
        setTimeout(() => {
          if (!shown) settle('unavailable');
        }, 8000);
        w.adBreak({
          type: 'reward',
          name: 'trader_cart',
          // The player already chose by pressing the offer, so the ad is shown straight away.
          beforeReward: (showAdFn: () => void) => showAdFn(),
          beforeAd: () => {
            shown = true;
            hooks.pause();
          },
          afterAd: () => hooks.resume(),
          adDismissed: () => (result = 'dismissed'),
          adViewed: () => (result = 'watched'),
          adBreakDone: () => settle(shown ? result : 'unavailable'),
        });
      });
    },
  };
}

/** The CrazyGames SDK (v3), only where it works: on CrazyGames, or its local test mode. */
async function crazyGamesAds(): Promise<RewardedAds | null> {
  const w = window as AnyWindow;
  try {
    await loadScript('https://sdk.crazygames.com/crazygames-sdk-v3.js');
    await w.CrazyGames.SDK.init();
  } catch {
    return null;
  }
  const sdk = w.CrazyGames.SDK;
  if (sdk.environment !== 'crazygames' && sdk.environment !== 'local') return null;
  return {
    name: 'crazygames',
    show(hooks) {
      return new Promise((done) => {
        sdk.ad.requestAd('rewarded', {
          adStarted: () => hooks.pause(),
          adFinished: () => {
            hooks.resume();
            done('watched');
          },
          // "unfilled" means no ad to show; anything else ends the ad without a reward.
          adError: (error: { code?: string }) => {
            hooks.resume();
            done(error?.code === 'unfilled' ? 'unavailable' : 'dismissed');
          },
        });
      });
    },
  };
}

/** The provider for this page, or null when there is none (then no offer is shown). */
export async function pickAds(params: URLSearchParams): Promise<RewardedAds | null> {
  const asked = params.get('ads');
  if (asked === 'test' || asked === 'test-empty') return testAds(asked === 'test-empty');
  if (asked === 'none') return null;
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  if (env.VITE_ADS === 'crazygames') return crazyGamesAds();
  if (env.VITE_ADSENSE_CLIENT) return googleAds(env.VITE_ADSENSE_CLIENT);
  return null;
}
