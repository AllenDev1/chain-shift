// Headless Chrome over the DevTools protocol, plus a frame-accurate clock for the game.
// The clock replaces performance.now, requestAnimationFrame and setTimeout and steps
// CSS animations by hand, so every captured frame is exactly 1/30 s after the last
// no matter how long a screenshot takes.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer(root, port) {
  const proc = spawn(process.execPath, [join(root, 'tools/serve.mjs'), String(port)], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${port}/`);
      return { url: `http://localhost:${port}/`, stop: () => proc.kill() };
    } catch {
      await wait(100);
    }
  }
  throw new Error('static server did not start');
}

export async function launch() {
  const profile = await mkdtemp(join(tmpdir(), 'chain-shift-chrome-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none', '--no-first-run', 'about:blank',
  ], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    } catch {
      await wait(100);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method) return listeners.get(m.method)?.forEach((fn) => fn(m.params));
    if (!pending.has(m.id)) return;
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(`${m.error.message} ${m.error.data ?? ''}`)) : resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    send,
    on: (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]),
    async close() {
      ws.close();
      proc.kill();
      await wait(200);
      await rm(profile, { recursive: true, force: true });
    },
  };
}

export function pageApi({ send, on }) {
  let onLoad = null;
  on('Page.loadEventFired', () => onLoad?.());
  const api = {
    send,
    async evaluate(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async viewport(width, height, scale, mobile = true) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 });
    },
    async goto(url) {
      const loaded = new Promise((r) => (onLoad = r));
      await send('Page.navigate', { url });
      await Promise.race([loaded, wait(10000)]);
    },
    async screenshot(format = 'png', quality) {
      const r = await send('Page.captureScreenshot', { format, quality, captureBeyondViewport: false });
      return Buffer.from(r.data, 'base64');
    },
    // Fake clock: call before goto(). Advance with tick(ms).
    async installClock() {
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${clockScript})()` });
    },
    tick: (ms) => api.evaluate(`window.__tick(${ms})`),
  };
  return api;
}

function clockScript() {
  let now = 0;
  let rafId = 0, timerId = 0;
  const rafs = new Map(), timers = new Map();
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => (rafs.set(++rafId, cb), rafId);
  window.cancelAnimationFrame = (id) => rafs.delete(id);
  window.setTimeout = (cb, ms = 0, ...args) => (timers.set(++timerId, { at: now + ms, cb: () => cb(...args) }), timerId);
  window.clearTimeout = (id) => timers.delete(id);
  window.__tick = (dt) => {
    const end = now + dt;
    for (;;) {
      let next = null;
      for (const entry of timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      timers.delete(next[0]);
      now = Math.max(now, next[1].at);
      next[1].cb();
    }
    now = end;
    const cbs = [...rafs.values()];
    rafs.clear();
    for (const cb of cbs) cb(now);
    // CSS animations and transitions run on the wall clock; pin them to ours.
    for (const a of document.getAnimations()) {
      if (a.__t === undefined) {
        a.__t = 0;
        a.pause();
      } else a.__t += dt;
      a.currentTime = a.__t;
    }
  };
}
