// Generates every App Store and Google Play asset into store-assets/:
//
//   npm run store-assets            everything (a few minutes)
//   npm run store-assets -- stills  screenshots and images only, no video
//
// Screens come from the real game in headless Chrome on a frame-exact clock (harness.mjs),
// hero art and hero videos from the board film (film.js) laid out by compose.html.
// Needs Google Chrome and ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, pageApi, startServer } from './harness.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'store-assets');
const FRAMES = join(OUT, '.frames');
const ONLY_STILLS = process.argv.includes('stills');
const FPS = 30, DT = 1000 / FPS;
const DATE = new Date().toLocaleDateString('en-CA'); // today's Daily, as the game picks it

const DEVICES = {
  phone: { w: 440, h: 956, scale: 3 }, // 1320 × 2868, iPhone 6.9"
  tablet: { w: 1032, h: 1376, scale: 2 }, // 2064 × 2752, iPad 13"
};
const PREVIEWS = {
  'iphone-6.9': { w: 443, h: 960, scale: 2 }, // 886 × 1920
  'ipad-13': { w: 1032, h: 1376, scale: 1200 / 1032 }, // 1200 × 1600
};
const STORE = { helpSeen: true, levels: { 0: 1, 1: 2, 2: 3, 3: 1, 4: 2 }, daily: {} };

const SHOTS = [
  ['chain', 'Every move sets off a *chain reaction*', 'Slide one block, and everything it hits slides on.'],
  ['predict', 'Predict where *everything stops*', 'You see the first hit. The rest of the chain is up to you.'],
  ['daily', 'One move. *Can you find it?*', 'A new Daily One-Move puzzle every day. Share your result.'],
  ['stars', 'Earn *three stars*', 'Hand-made levels with arrows, pits and walls, then endless puzzles.'],
  ['editor', 'Build your *own puzzles*', 'The solver checks them. Send a code to challenge friends.'],
];

const log = (...a) => console.log('·', ...a);
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// ---------- driving the real game ----------

// Moves for a puzzle, worked out in the page with the game's own solver.
const PLAN = `async (which, pick) => {
  const E = await import('/js/engine.js');
  const { LEVELS } = await import('/js/levels.js');
  const { decode } = await import('/js/codec.js');
  const G = await import('/js/generator.js');
  const { ChainAnimation } = await import('/js/animate.js');
  let s = E.withIds(which === 'daily' ? G.generateDaily(G.todayString()).state : decode(LEVELS[which - 1].code));
  let moves = E.solve(s, { maxDepth: 10, maxStates: 300000 }).path;
  if (pick === 'longest') {
    const scored = E.legalMoves(s).map((m) => ({ m, r: E.simulate(s, m.x, m.y, m.dir) })).filter((x) => x.r.ok && x.r.outcome !== 'fail');
    moves = [scored.sort((a, b) => b.r.hits - a.r.hits)[0].m];
  }
  return moves.map((m) => {
    const r = E.simulate(s, m.x, m.y, m.dir);
    // Step the chain as the game will, noting when each impact flashes (they last 380 ms).
    const flashes = [];
    let frames = 0;
    const a = new ChainAnimation(s, r.events, () => flashes.push(frames));
    for (let done = false; !done; ) (frames++, (done = a.update(${DT})));
    let peakFrame = 1, peak = 0;
    for (let k = 1; k < frames - 1; k++) {
      const live = flashes.filter((f) => f <= k && (k - f) * ${DT} < 380).length;
      if (live >= peak) (peak = live), (peakFrame = k);
    }
    s = r.state;
    return { ...m, chainFrames: frames, hits: r.hits, peakFrame };
  });
}`;

const FINGER = `(() => {
  const f = document.createElement('div');
  Object.assign(f.style, {
    position: 'fixed', left: '0', top: '0', width: '44px', height: '44px', margin: '-22px 0 0 -22px', borderRadius: '50%',
    background: 'rgba(255,255,255,0.28)', border: '2px solid rgba(255,255,255,0.75)', pointerEvents: 'none', zIndex: '9999',
    opacity: '0', transform: 'scale(1.25)', transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
  });
  document.body.append(f);
  const at = (e) => (f.style.translate = e.clientX + 'px ' + e.clientY + 'px');
  addEventListener('pointerdown', (e) => (at(e), (f.style.opacity = '1'), (f.style.transform = 'scale(1)')), true);
  addEventListener('pointermove', at, true);
  addEventListener('pointerup', () => ((f.style.opacity = '0'), (f.style.transform = 'scale(1.25)')), true);

  // Synthetic touches, delivered synchronously between clock ticks. Chrome's real input is
  // aligned to its own rendering, which capturing screenshots disturbs. A synthetic pointer
  // can't be captured, so capture is stubbed; the pointer keeps its pressed target instead.
  Element.prototype.setPointerCapture = () => {};
  let target = null, last = null;
  window.__touch = (type, x, y) => {
    if (type === 'pointerdown') target = document.elementFromPoint(x, y);
    [x, y] = x == null ? last : [x, y];
    last = [x, y];
    target.dispatchEvent(new PointerEvent(type, { pointerId: 7, isPrimary: true, pointerType: 'touch', clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true, composed: true }));
    if (type === 'pointerup' && target.closest('button')) target.closest('button').click();
  };
})()`;

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ease = (p) => 1 - (1 - p) ** 3;

async function gameSession(page, url, dev, hash, record) {
  await page.viewport(dev.w, dev.h, dev.scale);
  await page.goto(`${url}?seed`);
  await page.evaluate(`localStorage.setItem('chain-shift-v1', ${JSON.stringify(JSON.stringify(STORE))})`);
  await page.goto(`${url}?${Date.now()}#${hash}`);
  await page.evaluate(FINGER);
  let n = 0;
  const g = {
    // Advance `count` frames; while recording, each one is captured.
    async run(count = 1) {
      for (let i = 0; i < count; i++) {
        await page.tick(DT);
        if (record) await writeFile(join(record, `${String(++n).padStart(5, '0')}.png`), await page.screenshot());
      }
    },
    frames: () => n,
    plan: (which, pick) => page.evaluate(`(${PLAN})(${JSON.stringify(which)}, ${JSON.stringify(pick ?? null)})`),
    async cell(x, y) {
      return page.evaluate(`(() => {
        const r = document.getElementById('board').getBoundingClientRect();
        const pad = r.width * 0.035, cell = (r.width - pad * 2) / 6;
        return { x: r.left + pad + (${x} + 0.5) * cell, y: r.top + pad + (${y} + 0.5) * cell, cell };
      })()`);
    },
    // A finger drag: press, slide 0.85 of a cell, hold on the preview, then (optionally) let go.
    async drag(m, { release = true, hold = 9 } = {}) {
      const c = await g.cell(m.x, m.y);
      const [dx, dy] = DIRS[m.dir];
      await page.evaluate(`__touch('pointerdown', ${c.x}, ${c.y})`);
      await g.run(5);
      for (let i = 1; i <= 12; i++) {
        const k = 0.85 * c.cell * ease(i / 12);
        await page.evaluate(`__touch('pointermove', ${c.x + dx * k}, ${c.y + dy * k})`);
        await g.run(1);
      }
      await g.run(hold);
      if (release) await page.evaluate(`__touch('pointerup')`);
    },
    async tap(selector) {
      const c = await page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      await page.evaluate(`__touch('pointerdown', ${c.x}, ${c.y})`);
      await g.run(4);
      await page.evaluate(`__touch('pointerup')`);
      await g.run(2);
    },
  };
  await g.run(3); // let the game boot and lay out
  return g;
}

// The five screens behind the screenshots, captured raw at device resolution.
async function rawScreens(page, url, dev, name) {
  const shot = async (g, file) => writeFile(join(OUT, 'raw', `${name}-${file}.png`), await page.screenshot());

  // The level whose opening move sets off the longest chain, caught at its busiest frame.
  let g = await gameSession(page, url, dev, 'l=1');
  let big = null;
  // One-move levels are skipped: a wrong move there reads "Not this one".
  const pars = await page.evaluate(`import('/js/levels.js').then((m) => m.LEVELS.map((l) => l.par))`);
  for (let level = 1; level <= 12; level++) {
    if (pars[level - 1] < 2) continue;
    const [m] = await g.plan(level, 'longest');
    if (!big || m.hits > big.hits) big = { ...m, level };
  }
  g = await gameSession(page, url, dev, `l=${big.level}`);
  await g.drag(big);
  await g.run(Math.min(big.peakFrame, big.chainFrames - 2));
  await shot(g, 'chain');

  g = await gameSession(page, url, dev, 'l=12');
  const [first] = await g.plan(12);
  await g.drag(first, { release: false, hold: 6 });
  await shot(g, 'predict');
  await page.evaluate(`__touch('pointerup')`);

  g = await gameSession(page, url, dev, `d=${DATE}`);
  await g.run(4);
  const [win] = await g.plan('daily');
  await g.drag(win);
  await g.run(win.chainFrames + 50);
  await shot(g, 'daily');

  g = await gameSession(page, url, dev, 'l=6');
  for (const m of await g.plan(6)) {
    await g.drag(m);
    await g.run(m.chainFrames + 4);
  }
  await g.run(45);
  await shot(g, 'stars');

  const code = await page.evaluate(`import('/js/levels.js').then((m) => m.LEVELS[8].code)`);
  g = await gameSession(page, url, dev, `e=${code}`);
  await g.run(10);
  await shot(g, 'editor');
}

// App preview: a level solved, the next one, then today's Daily, as a player would.
async function appPreview(page, url, dev, name) {
  const dir = join(FRAMES, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const g = await gameSession(page, url, dev, 'l=6', dir);
  await g.run(15);
  for (const m of await g.plan(6)) {
    await g.drag(m);
    await g.run(m.chainFrames + 10);
  }
  await g.run(45);
  await g.tap('#win-next');
  await g.run(15);
  for (const m of await g.plan(7)) {
    await g.drag(m);
    await g.run(m.chainFrames + 10);
  }
  await g.run(40);
  await g.tap('#win-close');
  await g.run(10);
  await g.tap('#btn-menu');
  await g.run(25);
  await g.tap('#m-daily');
  await g.run(20);
  for (const m of await g.plan('daily')) {
    await g.drag(m);
    await g.run(m.chainFrames);
  }
  await g.run(Math.max(70, 16 * FPS - g.frames())); // App previews must run 15–30 s
  log(`${name}: ${(g.frames() / FPS).toFixed(1)} s`);

  const file = join(OUT, 'app-store', 'app-previews', `${name}.mp4`);
  ffmpeg([
    '-framerate', String(FPS), '-i', join(dir, '%05d.png'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-shortest',
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
    '-b:v', '11M', '-maxrate', '12M', '-bufsize', '24M', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', file,
  ]);
  await rm(dir, { recursive: true, force: true });
}

// ---------- composed art ----------

async function compose(page, url, spec, file) {
  await page.viewport(spec.w, spec.h, 1, false);
  await page.goto(`${url}tools/store/compose.html?${Date.now()}#${encodeURIComponent(JSON.stringify(spec))}`);
  for (let i = 0; i < 100 && !(await page.evaluate('!!window.__ready')); i++) await new Promise((r) => setTimeout(r, 100));
  const slot = await page.evaluate('window.__slot || null');
  const tmp = `${file}.tmp.png`;
  await writeFile(tmp, await page.screenshot());
  // The stores reject alpha channels, even fully opaque ones: save as 24-bit RGB.
  ffmpeg(['-i', tmp, '-pix_fmt', 'rgb24', file]);
  await rm(tmp);
  return slot;
}

async function filmFrames(page, url, size) {
  const dir = join(FRAMES, 'film');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await page.viewport(800, 600, 1, false);
  await page.goto(`${url}tools/store/film.html`);
  let count = 0;
  for (let i = 0; i < 100 && !count; i++) {
    count = await page.evaluate('window.__frameCount || 0');
    if (!count) await new Promise((r) => setTimeout(r, 100));
  }
  for (let i = 0; i < count; i++) {
    const data = await page.evaluate(`window.__renderFrame(${i}, ${size})`);
    await writeFile(join(dir, `${String(i + 1).padStart(5, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  log(`board film: ${count} frames, ${(count / FPS).toFixed(1)} s`);
  return dir;
}

function heroVideo(bg, slot, filmDir, file) {
  ffmpeg([
    '-loop', '1', '-framerate', String(FPS), '-i', bg,
    '-framerate', String(FPS), '-i', join(filmDir, '%05d.png'),
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex', `[1:v]scale=${slot.size}:${slot.size}:flags=lanczos[b];[0:v][b]overlay=${slot.x}:${slot.y}:shortest=1,format=yuv420p[v]`,
    '-map', '[v]', '-map', '2:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', file,
  ]);
}

// ---------- run ----------

for (const d of ['raw', 'app-store/iphone-6.9', 'app-store/ipad-13', 'app-store/app-previews', 'app-store/header', 'app-store/search-results', 'google-play/phone', 'google-play/tablet']) {
  await mkdir(join(OUT, d), { recursive: true });
}
const server = await startServer(ROOT, 8765);
const game = await launch();
const art = await launch();
try {
  const gp = pageApi(game);
  await gp.installClock();
  for (const [name, dev] of Object.entries(DEVICES)) {
    await rawScreens(gp, server.url, dev, name);
    log(`raw ${name} screens`);
  }

  const ap = pageApi(art);
  const sets = [
    ['app-store/iphone-6.9', 1320, 2868, 'phone'],
    ['app-store/ipad-13', 2064, 2752, 'tablet'],
    ['google-play/phone', 1080, 1920, 'phone'],
    ['google-play/tablet', 1440, 2560, 'tablet'],
  ];
  for (const [dir, w, h, device] of sets) {
    for (const [i, [key, title, sub]] of SHOTS.entries()) {
      await compose(ap, server.url, { kind: 'shot', w, h, title, sub, device, img: `/store-assets/raw/${device}-${key}.png` }, join(OUT, dir, `${i + 1}-${key}.png`));
    }
    log(dir);
  }
  await compose(ap, server.url, { kind: 'header', w: 3840, h: 1646 }, join(OUT, 'app-store/header/header-3840x1646.png'));
  await compose(ap, server.url, { kind: 'search', w: 3840, h: 2560 }, join(OUT, 'app-store/search-results/search-3840x2560.png'));
  await compose(ap, server.url, { kind: 'feature', w: 1024, h: 500 }, join(OUT, 'google-play/feature-graphic-1024x500.png'));
  ffmpeg(['-i', join(ROOT, 'assets/icon-only.png'), '-vf', 'scale=512:512:flags=lanczos', '-pix_fmt', 'rgba', join(OUT, 'google-play/icon-512.png')]);
  log('hero images, feature graphic, icon');

  if (!ONLY_STILLS) {
    for (const [name, dev] of Object.entries(PREVIEWS)) await appPreview(gp, server.url, dev, name);

    const heroes = [
      ['header', 3840, 1646, 'app-store/header/header-3840x1646.mp4'],
      ['search', 3840, 2560, 'app-store/search-results/search-3840x2560.mp4'],
      ['promo', 1920, 1080, 'google-play/promo-video-1920x1080.mp4'],
    ];
    const slots = [];
    for (const [kind, w, h, file] of heroes) {
      const bg = join(FRAMES, `${kind}-bg.png`);
      await mkdir(FRAMES, { recursive: true });
      slots.push([await compose(ap, server.url, { kind, w, h, board: 'slot' }, bg), bg, file]);
    }
    const filmDir = await filmFrames(ap, server.url, Math.max(...slots.map(([s]) => s.size)));
    for (const [slot, bg, file] of slots) {
      heroVideo(bg, slot, filmDir, join(OUT, file));
      log(file);
    }
  }
} finally {
  await game.close();
  await art.close();
  server.stop();
  await rm(FRAMES, { recursive: true, force: true });
}
log(`done: ${OUT}`);
