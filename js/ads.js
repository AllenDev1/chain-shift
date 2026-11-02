// AdMob interstitials, in the iOS and Android apps only. On the web every export is a no-op.
//
// An ad can play between puzzles: when the player taps Next after solving a level or an
// endless puzzle. The Daily and friends' challenges never show one, because those wins lead
// to sharing. A player's first puzzles are ad-free, and ads are spaced by solves and by time.

import { isNative, platform, plugin } from './native.js';

const AdMob = plugin('AdMob');

// Interstitial ad unit IDs, from AdMob → Apps → Ad units. While one is empty, that platform
// shows Google's demo ads, which are safe to tap during development. App IDs are separate:
// see AndroidManifest.xml (via strings.xml) and Info.plist.
const INTERSTITIAL = {
  ios: 'ca-app-pub-1949655614307812/3745837065',
  android: 'ca-app-pub-1949655614307812/3429695185',
};
const DEMO_INTERSTITIAL = {
  ios: 'ca-app-pub-3940256099942544/4411468910',
  android: 'ca-app-pub-3940256099942544/1033173712',
};

const FREE_SOLVES = 4; // solves per session before the first ad
const SOLVES_BETWEEN = 3; // solves between ads
const MIN_GAP_MS = 3 * 60 * 1000; // and at least this long between ads

const adId = INTERSTITIAL[platform] || DEMO_INTERSTITIAL[platform];

let started = false;
let ready = false;
let loading = false;
let solves = 0;
let solvesAtLastAd = -Infinity;
let lastAdAt = -Infinity;
let privacyRequired = false;

function preload() {
  if (!started || ready || loading) return;
  loading = true;
  AdMob.prepareInterstitial({ adId })
    .then(() => (ready = true))
    .catch(() => {}) // no fill or offline: try again at the next break
    .finally(() => (loading = false));
}

// iOS: Apple's App Tracking Transparency prompt, which the App Store requires because the
// privacy label declares tracking for personalized ads. Asked once, after the consent form
// and before the first ad; skipped if an AdMob IDFA message already asked. Either answer
// still gets ads; "Ask App Not to Track" just makes them non-personalized.
async function askToTrack() {
  if (platform !== 'ios') return;
  try {
    const { status } = await AdMob.trackingAuthorizationStatus();
    if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
  } catch {
    /* ATT unavailable: ads stay non-personalized */
  }
}

// Asks for consent where the law requires it (Google's UMP form, configured under AdMob →
// Privacy & messaging), then starts the SDK and loads the first ad. Call once after boot.
export async function startAds() {
  if (!AdMob) return;
  try {
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === 'REQUIRED') {
      consent = await AdMob.showConsentForm();
    }
    privacyRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    if (!consent.canRequestAds) return;
    await askToTrack();
    await AdMob.initialize();
    started = true;
    AdMob.addListener('interstitialAdDismissed', preload);
    AdMob.addListener('interstitialAdFailedToShow', preload);
    preload();
  } catch {
    /* consent or SDK failure: the game runs without ads */
  }
}

// A solved puzzle is being left for the next one. Shows an interstitial if one is loaded and
// the pacing allows; the next puzzle loads underneath it.
export function adBreak() {
  if (!started) return;
  solves++;
  const now = performance.now();
  const due = solves > FREE_SOLVES && solves - solvesAtLastAd >= SOLVES_BETWEEN && now - lastAdAt >= MIN_GAP_MS;
  if (!due) return;
  if (!ready) return preload();
  ready = false;
  solvesAtLastAd = solves;
  lastAdAt = now;
  AdMob.showInterstitial().catch(preload);
}

// Regions with consent rules (EEA, UK, some US states) require a way to change the choice.
export const needsPrivacyOptions = () => isNative && privacyRequired;
export const showPrivacyOptions = () => AdMob?.showPrivacyOptionsForm().catch(() => {});
