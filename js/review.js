// Store ratings, in the iOS and Android apps only. On the web every export is a no-op.
//
// The prompt is the native one (SKStoreReviewController on iOS, Play In-App Review on
// Android). The OS decides whether it actually appears and caps it on its own (iOS: three
// times a year). These rules decide when we may ask at all, so that it only ever comes:
//   - to a player who has clearly stuck with the game (solves across several days),
//   - right after a moment of success (a 3-star solve, no hints),
//   - at a natural pause (they tapped Next), never mid-puzzle,
//   - never in the same break as an ad, and
//   - rarely (months apart, a few times ever).
// There is deliberately no "Do you like the game?" pre-prompt: both stores forbid gating
// the review prompt on the player's answer.

import { plugin, platform } from './native.js';

const InAppReview = plugin('InAppReview');

export const RULES = {
  minSolves: 8, // puzzles solved in total before the first ask
  minDays: 2, // on at least this many different days
  cooldownDays: 120, // between asks
  maxAsks: 3, // ever
};

const DAY_MS = 24 * 60 * 60 * 1000;

// The saved record: store.review in main.js.
export const newRecord = () => ({ solves: 0, days: 0, lastDay: '', asks: 0, askedAt: 0 });

// Count a solved puzzle. `day` is the local date, YYYY-MM-DD.
export function countSolve(r, day) {
  r.solves++;
  if (r.lastDay !== day) {
    r.days++;
    r.lastDay = day;
  }
}

// moment: { stars, hints, adShown } for the solve the player is moving on from.
export function reviewDue(r, moment, now = Date.now()) {
  if (moment.adShown || moment.stars < 3 || moment.hints > 0) return false;
  if (r.solves < RULES.minSolves || r.days < RULES.minDays || r.asks >= RULES.maxAsks) return false;
  return !r.askedAt || now - r.askedAt >= RULES.cooldownDays * DAY_MS;
}

// Asks if the rules allow. Returns true if it asked, so the caller saves the record and
// keeps the next ad away from it.
export async function maybeAskForReview(r, moment) {
  if (!InAppReview || !reviewDue(r, moment)) return false;
  r.asks++;
  r.askedAt = Date.now();
  try {
    await InAppReview.requestReview();
  } catch {
    /* no store services (e.g. a sideloaded Android build): nothing to do */
  }
  return true;
}

// The App Store's numeric Apple ID for Chain Shift (App Store Connect → App Information →
// Apple ID). Until it's set, the menu's "Rate Chain Shift" link is hidden on iOS.
export const APP_STORE_ID = '6767428876';

// Where the menu's "Rate Chain Shift" link goes: the store's write-a-review page. The player
// chooses to open it, so it has no limits. Null on the web.
export function storeReviewUrl() {
  if (platform === 'ios') return APP_STORE_ID ? `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review` : null;
  if (platform === 'android') return 'https://play.google.com/store/apps/details?id=com.chainshift.game';
  return null;
}
