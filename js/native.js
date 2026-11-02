// Native-app glue. In the iOS and Android builds, www/capacitor.js defines window.Capacitor
// and these helpers talk to native plugins. On the web every export falls back to null or
// to browser APIs, so the same modules run unchanged from GitHub Pages.

const cap = globalThis.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
export const platform = isNative ? cap.getPlatform() : 'web';
export const plugin = (name) => (isNative ? cap.registerPlugin(name) : null);

const App = plugin('App');
const Haptics = plugin('Haptics');
const Preferences = plugin('Preferences');
const Share = plugin('Share');
const Filesystem = plugin('Filesystem');

// Where share links point. Inside the app, location is capacitor://localhost.
export const WEB_URL = 'https://allendev1.github.io/chain-shift/';

// ---------- storage ----------

// iOS may clear a web view's localStorage when the device runs low on space; Preferences
// (UserDefaults / SharedPreferences) is kept. localStorage stays as the web store and a mirror.
export async function loadSaved(key) {
  if (Preferences) {
    try {
      const { value } = await Preferences.get({ key });
      if (value != null) return value;
    } catch {
      /* fall back to localStorage */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSaved(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: progress just isn't kept */
  }
  Preferences?.set({ key, value }).catch(() => {});
}

// ---------- haptics ----------

// navigator.vibrate doesn't exist on iOS. Web vibration patterns map to native feedback:
// short taps are light impacts, longer thuds medium ones, a pattern (the win) a success.
export const haptic = Haptics && ((pattern) => {
  const p = Array.isArray(pattern)
    ? Haptics.notification({ type: 'SUCCESS' })
    : Haptics.impact({ style: pattern < 10 ? 'LIGHT' : 'MEDIUM' });
  p.catch(() => {});
});

// ---------- sharing ----------

// The web view can't hand a File to the share sheet, so the card is written to the cache
// directory and shared by path. Resolves false if the player dismissed the sheet.
export const shareImage = Share && (async ({ base64, filename, text }) => {
  const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
  try {
    await Share.share({ title: 'Chain Shift', text, files: [uri] });
    return true;
  } catch (err) {
    if (/cancel/i.test(err?.message ?? '')) return false;
    throw err;
  }
});

// ---------- links & Back ----------

const hashOf = (url) => {
  try {
    return new URL(url).hash;
  } catch {
    return '';
  }
};

// The share link that launched the app (#c=…, #d=…), if any.
export async function launchHash() {
  if (!App) return '';
  try {
    return hashOf((await App.getLaunchUrl())?.url ?? '');
  } catch {
    return '';
  }
}

// A share link opened while the app is already running.
export function onLinkOpened(fn) {
  App?.addListener('appUrlOpen', ({ url }) => {
    const hash = hashOf(url);
    if (hash.length > 1) fn(hash);
  });
}

// Android Back: an open sheet has pushed a history entry, and popping it closes the sheet
// (see showPanel in main.js). With nothing to close, the app goes to the background.
App?.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : App.minimizeApp()));
