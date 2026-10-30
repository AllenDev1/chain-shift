import { SIZE, F, P, idx, clone, withIds, emptyState, legalMoves, simulate, firstReaction, solve, winningMoves, validate } from './engine.js';
import { encode, decode, formatCode } from './codec.js';
import { CONFIGS, generateDaily, generatePuzzle, todayString, dailyNumber } from './generator.js';
import { LEVELS } from './levels.js';
import { drawBoard, layout, cellAt } from './render.js';
import { ChainAnimation } from './animate.js';
import { makeShareCard, shareResult } from './share.js';
import { UI, TILES } from './icons.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const playArea = $('play-area');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Drag distances, as fractions of a cell.
const DRAG_START = 0.22; // below this a press is a tap
const DRAG_COMMIT = 0.4; // release beyond this commits the swipe

// ---------- persistence ----------

const STORE_KEY = 'chain-shift-v1';
const store = (() => {
  const defaults = { levels: {}, daily: {}, helpSeen: false };
  try {
    return Object.assign(defaults, JSON.parse(localStorage.getItem(STORE_KEY) || '{}'));
  } catch {
    return defaults;
  }
})();
const save = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* private mode: progress just isn't kept */
  }
};

// ---------- state ----------

const game = {
  meta: null, // { kind: 'level'|'daily'|'endless'|'custom'|'test', title, levelIndex?, date?, tip? }
  start: null,
  state: null,
  history: [],
  moves: 0,
  attempts: 0,
  par: null,
  oneMove: false,
  solved: false,
  awaitingReset: false,
  hintsUsed: 0,
  code: '',
};

const ui = {
  mode: 'play', // 'play' | 'editor'
  size: 300,
  press: null, // active pointer press on the board
  preview: null,
  origin: null,
  selected: null, // tapped block, shows direction handles
  keyDir: null, // direction chosen via handle or arrow key, awaiting confirmation
  viaKeys: false, // last selection came from the keyboard (status copy says "press", not "tap")
  hint: null,
  bump: null,
  anim: null,
  pending: null,
  flashes: [],
  message: null, // { text, tone }: transient status, cleared by the next action
  busyText: '',
};

const editor = { state: emptyState(), tool: 'block', painting: false, lastCell: null, message: '' };

let needsDraw = true;

// ---------- haptics ----------

let lastBuzz = 0;
function buzz(pattern) {
  if (!navigator.vibrate) return;
  const now = performance.now();
  if (typeof pattern === 'number' && now - lastBuzz < 45) return;
  lastBuzz = now;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* not allowed before a user gesture */
  }
}

// ---------- sizing ----------

// The play area flexes to fill whatever the header and controls leave; the board is
// the largest square that fits in it above the status line.
function resize() {
  const status = $('status');
  const statusH = status.offsetParent ? status.offsetHeight + parseFloat(getComputedStyle(status).marginTop) : 0;
  const size = Math.max(120, Math.floor(Math.min(playArea.clientWidth, playArea.clientHeight - statusH, 560)));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (size === ui.size && canvas.width === Math.round(size * dpr)) return;
  ui.size = size;
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.width = canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  needsDraw = true;
}
new ResizeObserver(resize).observe(playArea);

// ---------- status, toast, HUD ----------

function say(text, tone = '') {
  ui.message = text ? { text, tone } : null;
  renderStatus();
}

function baseStatus() {
  if (game.meta?.tip) return game.meta.tip;
  if (game.oneMove) return 'This puzzle takes one move. Can you find it?';
  if (game.par) return `Land the cube on the target. Par is ${game.par}.`;
  return 'Land the cube on the target.';
}

function renderStatus() {
  let text, tone = '';
  if (ui.busyText) text = ui.busyText;
  else if (ui.mode === 'editor') text = editor.message || 'Pick a tool, then tap or drag on the board.';
  else if (ui.message) ({ text, tone } = ui.message);
  else if (ui.selected && !ui.anim && ui.viaKeys) text = ui.keyDir == null ? 'Press an arrow key to preview a swipe.' : 'Press the same arrow again to swipe. Esc cancels.';
  else if (ui.selected && !ui.anim) text = ui.keyDir == null ? 'Tap an arrow to preview that swipe, or drag the block.' : 'Tap the same arrow again to swipe. Tap elsewhere to cancel.';
  else text = baseStatus();
  for (const [id, cls] of [['status', 'status'], ['status-side', 'status side']]) {
    const el = $(id);
    el.textContent = text;
    el.className = `${cls} ${tone}`;
  }
}

let toastTimer = 0;
function toast(msg, ms = 2200) {
  if (!msg) return;
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function updateHud() {
  const busy = !!ui.anim;
  if (ui.mode === 'editor') {
    $('hud-title').textContent = 'Puzzle editor';
    $('hud-stats').textContent = 'Build · Check · Share';
    renderStatus();
    return;
  }
  $('hud-title').textContent = game.meta?.title || 'Chain Shift';
  const sep = ' <span class="sep">·</span> ';
  $('hud-stats').innerHTML = game.oneMove
    ? `One move${sep}Attempt <b>${game.attempts + (game.solved || game.awaitingReset ? 0 : 1)}</b>`
    : `Moves <b>${game.moves}</b>${sep}Par <b>${game.par ?? '?'}</b>`;

  const test = game.meta?.kind === 'test';
  $('btn-undo').hidden = game.oneMove;
  $('btn-hint').hidden = game.oneMove;
  $('btn-share').hidden = test;
  $('btn-back-editor').hidden = !test;
  $('btn-undo').disabled = busy || !game.history.length || game.solved;
  $('btn-reset').disabled = busy || (!game.history.length && !game.awaitingReset && !game.solved);
  $('btn-hint').disabled = busy || game.solved;
  $('btn-share').classList.toggle('primary', game.solved);
  const cubeLost = !game.solved && !!game.state && !game.state.piece.includes(P.CUBE);
  $('btn-reset').classList.toggle('attention', !busy && (game.awaitingReset || cubeLost));
  renderStatus();
}

// ---------- sheets (with Back-button support) ----------

// Opening a sheet pushes a history entry with the same URL, so the Android/browser Back
// button closes the sheet instead of leaving the game. URL updates made while that entry
// is being popped are deferred until the pop lands.
let sheetEntry = false, backPending = false, pendingHash = null;

function replaceHash(hash) {
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

function setHash(hash) {
  if (backPending) pendingHash = hash;
  else replaceHash(hash);
}

function showPanel(id, { soft = false } = {}) {
  const overlay = $('overlay');
  overlay.hidden = false;
  overlay.classList.toggle('soft', soft);
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== id;
  if (!sheetEntry) {
    history.pushState({ sheet: true }, '');
    sheetEntry = true;
  }
  clearSelection();
}

function hidePanels() {
  $('overlay').hidden = true;
  if (sheetEntry) {
    sheetEntry = false;
    backPending = true;
    history.back();
  }
}

window.addEventListener('popstate', () => {
  if (backPending) {
    backPending = false;
    if (pendingHash !== null) replaceHash(pendingHash);
    pendingHash = null;
    return;
  }
  if (!$('overlay').hidden) {
    sheetEntry = false;
    if (canDismiss()) $('overlay').hidden = true;
    else openMenu();
  }
});

const canDismiss = () => !!game.start || ui.mode === 'editor';

// ---------- loading puzzles ----------

function loadPuzzle(state, meta) {
  game.meta = meta;
  game.start = withIds(state);
  game.state = clone(game.start);
  game.history = [];
  game.moves = 0;
  game.attempts = 0;
  game.solved = false;
  game.awaitingReset = false;
  game.hintsUsed = 0;
  game.code = encode(game.start);
  game.par = meta.par ?? solve(game.start, { maxDepth: 10, maxStates: 250000 }).moves;
  game.oneMove = game.par === 1;
  ui.anim = null;
  ui.message = null;
  ui.busyText = '';
  clearSelection();
  setMode('play');
  hidePanels();
  if (meta.hash !== undefined) setHash(meta.hash);
  updateHud();
}

// Generation takes a few hundred ms on a phone; let "Generating…" paint first.
function generating(fn) {
  hidePanels();
  ui.busyText = 'Generating a fresh puzzle…';
  renderStatus();
  setTimeout(fn, 40);
}

function playLevel(i) {
  const lvl = LEVELS[i];
  loadPuzzle(decode(lvl.code), { kind: 'level', levelIndex: i, title: `Level ${i + 1} · ${lvl.name}`, tip: lvl.tip, par: lvl.par, hash: `l=${i + 1}` });
}

function playDaily(date = todayString()) {
  generating(() => {
    const p = generateDaily(date);
    if (!p) {
      ui.busyText = '';
      return say('Couldn’t build that day’s puzzle.', 'bad');
    }
    loadPuzzle(p.state, { kind: 'daily', date, title: `Daily One-Move #${dailyNumber(date)}`, par: 1, hash: `d=${date}` });
  });
}

function playEndless() {
  generating(() => {
    const p = generatePuzzle((Math.random() * 2 ** 32) >>> 0, { cfg: CONFIGS.full, minPar: 2, maxPar: 4 });
    if (!p) return playEndless();
    loadPuzzle(p.state, { kind: 'endless', title: 'Endless', par: p.par, hash: `c=${encode(p.state)}` });
  });
}

// Accepts a bare code, a formatted code, or a whole shared link.
function extractCode(raw) {
  const m = String(raw).match(/[#&?]c=([^&#\s]+)/);
  return m ? m[1] : String(raw);
}

function playCode(raw) {
  const s = decode(extractCode(raw));
  if (!s || validate(s).length) return false;
  generating(() => loadPuzzle(s, { kind: 'custom', title: 'Challenge', hash: `c=${encode(s)}` }));
  return true;
}

// ---------- selection & moves ----------

function clearSelection() {
  ui.press = null;
  ui.preview = null;
  ui.origin = null;
  ui.selected = null;
  ui.keyDir = null;
  ui.hint = null;
}

const legalDirsAt = (x, y) => legalMoves(game.state).filter((m) => m.x === x && m.y === y).map((m) => m.dir);

function selectBlock(cell) {
  ui.selected = { x: cell.x, y: cell.y };
  ui.keyDir = null;
  ui.preview = null;
  ui.origin = null;
  ui.hint = null;
  ui.message = null;
  renderStatus();
}

// Choosing a direction once previews it; choosing the same direction again commits.
function chooseDir(dir) {
  const sel = ui.selected;
  if (!sel) return;
  if (ui.keyDir === dir) return commitMove(sel.x, sel.y, dir);
  const fr = firstReaction(game.state, sel.x, sel.y, dir);
  if (fr?.end === 'blocked') return bump(sel.x, sel.y, dir);
  ui.keyDir = dir;
  ui.preview = fr;
  ui.origin = { ...sel };
  renderStatus();
}

function bump(x, y, dir) {
  ui.bump = { x, y, dir, start: performance.now() };
  buzz(18);
}

function commitMove(x, y, dir) {
  if (ui.anim || game.solved) return;
  const r = simulate(game.state, x, y, dir);
  if (!r.ok) {
    if (r.reason === 'blocked') bump(x, y, dir);
    if (r.reason === 'loop') say('That swipe would loop forever. Try another.', 'bad');
    return;
  }
  clearSelection();
  ui.message = null;
  game.history.push(game.state);
  game.moves++;
  if (game.oneMove) game.attempts++;
  ui.pending = r;
  ui.anim = new ChainAnimation(game.state, r.events, onFlash);
  buzz(8);
  updateHud();
}

function onFlash(f) {
  ui.flashes.push({ ...f, born: performance.now() });
  if (f.type === 'hit') buzz(6);
  else if (f.type === 'fall') buzz(14);
}

function onChainFinished() {
  const r = ui.pending;
  ui.anim = null;
  ui.pending = null;
  game.state = r.state;

  if (r.outcome === 'win') {
    game.solved = true;
    recordProgress();
    say(game.oneMove ? 'Found it!' : 'Solved!', 'good');
    buzz([12, 50, 28]);
    setTimeout(() => game.solved && showWin(), 600);
  } else if (game.oneMove) {
    game.awaitingReset = true;
    say(r.outcome === 'fail' ? 'The cube fell in a pit. Tap the board to try again.' : 'Not this one. Tap the board to try again.', 'bad');
  } else if (r.outcome === 'fail') {
    say('The cube fell in a pit. Undo or reset.', 'bad');
  } else if (r.hits >= 6) {
    say(`${r.hits}-hit chain!`);
  }
  updateHud();
}

function undo() {
  if (ui.anim || !game.history.length || game.solved) return;
  game.state = game.history.pop();
  game.moves = game.history.length;
  clearSelection();
  ui.message = null;
  updateHud();
}

function reset() {
  if (ui.anim) return;
  game.state = clone(game.start);
  game.history = [];
  game.awaitingReset = false;
  game.solved = false;
  if (!game.oneMove) game.moves = 0;
  clearSelection();
  ui.message = null;
  updateHud();
}

function hint() {
  if (ui.anim || game.solved) return;
  ui.busyText = 'Thinking…';
  renderStatus();
  setTimeout(() => {
    ui.busyText = '';
    const r = solve(game.state, { maxDepth: 10, maxStates: 250000 });
    if (!r.moves) return say('No solution from here. Undo or reset.', 'bad');
    game.hintsUsed++;
    clearSelection();
    ui.hint = r.path[0];
    say(`Swipe the highlighted block. ${r.moves} move${r.moves > 1 ? 's' : ''} to go with perfect play.`);
  }, 30);
}

function recordProgress() {
  const m = game.meta;
  if (m.kind === 'level') {
    const prev = store.levels[m.levelIndex];
    const score = game.oneMove ? game.attempts : game.moves;
    if (prev == null || score < prev) store.levels[m.levelIndex] = score;
  } else if (m.kind === 'daily' && store.daily[m.date] == null) {
    store.daily[m.date] = game.attempts;
  }
  save();
}

// ---------- win & share ----------

const stars = (moves, par) => (moves <= par ? 3 : moves <= par + 2 ? 2 : 1);
const oneMoveStars = (tries) => (tries === 1 ? 3 : tries <= 3 ? 2 : 1);
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function showWin() {
  const m = game.meta;
  $('win-title').textContent = game.oneMove ? 'Found it!' : 'Solved!';
  const n = game.oneMove ? oneMoveStars(game.attempts) : stars(game.moves, game.par);
  const line = game.oneMove ? (game.attempts === 1 ? 'First try' : `${game.attempts} tries`) : `${game.moves} moves · par ${game.par}`;
  $('win-score').innerHTML = `<span class="stars" aria-label="${n} of 3 stars">${starText(n)}</span>${line}`;
  $('win-sub').textContent = m.kind === 'daily' ? 'A new one-move puzzle arrives tomorrow.' : game.hintsUsed ? `Hints used: ${game.hintsUsed}` : '';
  const next = $('win-next');
  if (m.kind === 'level') next.textContent = m.levelIndex + 1 < LEVELS.length ? 'Next level' : 'All levels';
  else if (m.kind === 'endless') next.textContent = 'Next puzzle';
  else if (m.kind === 'test') next.textContent = 'Back to editor';
  else next.textContent = 'More puzzles';
  $('win-share').hidden = m.kind === 'test';
  showPanel('panel-win', { soft: true });
}

function nextAfterWin() {
  const m = game.meta;
  if (m.kind === 'level') {
    if (m.levelIndex + 1 < LEVELS.length) playLevel(m.levelIndex + 1);
    else openLevels();
  } else if (m.kind === 'endless') playEndless();
  else if (m.kind === 'test') openEditor(game.start);
  else openMenu();
}

function shareLink(code) {
  if (location.protocol === 'file:') return '';
  return `${location.origin}${location.pathname}#c=${code}`;
}

async function shareCurrent() {
  if (!game.start) return;
  const link = shareLink(game.code);
  const m = game.meta;
  const name = m.kind === 'daily' ? `Chain Shift Daily #${dailyNumber(m.date)}` : m.kind === 'level' ? `Chain Shift ${m.title}` : 'Chain Shift';
  let headline, text;
  if (game.solved) {
    headline = game.oneMove
      ? game.attempts === 1 ? 'One move. Found it first try.' : `One move. Found it in ${game.attempts} tries.`
      : `Solved in ${game.moves} · par ${game.par}`;
    const result = game.oneMove
      ? game.attempts === 1 ? 'found the one move first try' : `found the one move in ${game.attempts} tries`
      : `solved in ${game.moves} moves (par ${game.par})`;
    text = `${name}: ${result}${game.hintsUsed ? ' with hints' : ''}. Can you beat that?`;
  } else if (game.oneMove) {
    headline = 'This puzzle takes one move. Can you find it?';
    text = `${name}: this puzzle takes one move. Can you find it?`;
  } else {
    headline = `Par ${game.par ?? '?'}. Can you match it?`;
    text = `${name}: can you solve this in ${game.par ?? 'a few'} moves?`;
  }
  const card = makeShareCard({ state: game.start, title: m.title, headline, code: game.code, link });
  toast(await shareResult(card, { text, link }));
}

// ---------- menu sheets ----------

function openMenu() {
  const today = todayString();
  const done = store.daily[today];
  $('m-daily').textContent = `Daily One-Move #${dailyNumber(today)}${done != null ? '  ✓' : ''}`;
  $('m-close').hidden = !game.start || ui.mode === 'editor';
  showPanel('panel-menu');
}

function openLevels() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const next = LEVELS.findIndex((_, i) => store.levels[i] == null);
  LEVELS.forEach((lvl, i) => {
    const best = store.levels[i];
    const b = document.createElement('button');
    b.className = best != null ? 'done' : i === next ? 'next' : '';
    const n = best == null ? 0 : lvl.par === 1 ? oneMoveStars(best) : stars(best, lvl.par);
    b.innerHTML = `<span class="num">${i + 1}</span><span class="stars">${n ? starText(n) : ''}</span>`;
    b.setAttribute('aria-label', `Level ${i + 1}, ${lvl.name}${n ? `, ${n} stars` : ''}`);
    b.onclick = () => playLevel(i);
    grid.append(b);
  });
  showPanel('panel-levels');
}

function openCodeEntry() {
  const input = $('code-input');
  input.value = '';
  input.removeAttribute('aria-invalid');
  $('code-error').textContent = '';
  showPanel('panel-code');
  // On phones, focusing on open would pop the keyboard over a sheet that's still sliding in.
  if (matchMedia('(hover: hover)').matches) input.focus();
}

function buildHelp() {
  const rules = [
    ['block', '<b>Drag a block.</b> It slides until something stops it.'],
    ['hit', '<b>Chain reaction.</b> It stops on impact and the piece it hits slides on.'],
    ['cube', '<b>The cube</b> only moves when hit. Make it <i>stop</i> on the <span class="target-word">target</span>.'],
    ['right', '<b>Arrows</b> turn anything that slides onto them.'],
    ['pit', '<b>Pits</b> swallow the first piece in, then become floor.'],
    ['wall', '<b>Walls</b> never move.'],
  ];
  $('rules').innerHTML = rules.map(([icon, html]) => `<li>${TILES[icon]}<span>${html}</span></li>`).join('');
}

// ---------- editor ----------

const TOOLS = [
  ['block', 'Block'], ['cube', 'Cube'], ['target', 'Target'], ['wall', 'Wall'], ['pit', 'Pit'],
  ['up', 'Up'], ['right', 'Right'], ['down', 'Down'], ['left', 'Left'], ['erase', 'Erase'],
];

function buildTools() {
  const wrap = $('tools');
  for (const [id, label] of TOOLS) {
    const b = document.createElement('button');
    b.dataset.tool = id;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(id === editor.tool));
    b.innerHTML = `${TILES[id]}<span>${label}</span>`;
    b.onclick = () => {
      editor.tool = id;
      for (const el of wrap.children) el.setAttribute('aria-checked', String(el.dataset.tool === id));
    };
    wrap.append(b);
  }
}

function paint(x, y) {
  const s = editor.state;
  const i = idx(x, y);
  const floorTools = { wall: F.WALL, pit: F.PIT, up: F.UP, right: F.RIGHT, down: F.DOWN, left: F.LEFT };
  const t = editor.tool;
  if (t === 'erase') {
    if (s.piece[i]) s.piece[i] = P.NONE;
    else s.floor[i] = F.EMPTY;
  } else if (t === 'block' || t === 'cube') {
    if (t === 'cube') s.piece = s.piece.map((p) => (p === P.CUBE ? P.NONE : p));
    if (s.floor[i] === F.WALL || s.floor[i] === F.PIT) s.floor[i] = F.EMPTY;
    s.piece[i] = t === 'cube' ? P.CUBE : P.BLOCK;
  } else if (t === 'target') {
    s.floor = s.floor.map((f) => (f === F.TARGET ? F.EMPTY : f));
    s.floor[i] = F.TARGET;
  } else {
    s.floor[i] = floorTools[t];
    if (t === 'wall' || t === 'pit') s.piece[i] = P.NONE;
  }
  editor.state = withIds(s);
  editor.message = '';
  renderStatus();
  buzz(4);
}

function openEditor(state) {
  if (state) editor.state = withIds(state);
  editor.message = '';
  setMode('editor');
  hidePanels();
  setHash(`e=${safeEncode(editor.state)}`);
  updateHud();
}

function safeEncode(s) {
  try {
    return encode(s);
  } catch {
    return '';
  }
}

function editorSay(text) {
  editor.message = text;
  renderStatus();
}

function checkEditor(then) {
  const problems = validate(editor.state);
  if (problems.length) return editorSay(problems.join(' '));
  editorSay('Solving…');
  setTimeout(() => {
    const r = solve(editor.state, { maxDepth: 10, maxStates: 300000 });
    if (r.moves == null) {
      return editorSay(r.exhausted ? 'Too complex to verify within the search limit.' : 'Unsolvable: the cube can never stop on the target.');
    }
    let msg = `Par ${r.moves}.`;
    if (r.moves === 1) {
      const n = winningMoves(editor.state).length;
      msg += n === 1 ? ' Exactly one winning move: a true one-move puzzle!' : ` ${n} moves win. Make it 1 for a one-move puzzle.`;
    }
    editorSay(msg);
    setHash(`e=${encode(editor.state)}`);
    then?.(r);
  }, 30);
}

function setMode(mode) {
  ui.mode = mode;
  $('controls').hidden = mode !== 'play';
  $('editor-bar').hidden = mode !== 'editor';
  clearSelection();
  needsDraw = true;
}

// ---------- board input ----------

function pointerCell(e) {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left, py = e.clientY - rect.top;
  return { px, py, cell: cellAt(layout(ui.size), px, py) };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) return;
  ui.viaKeys = false;
  const { px, py, cell } = pointerCell(e);
  canvas.setPointerCapture(e.pointerId);

  if (ui.mode === 'editor') {
    if (!cell) return;
    editor.painting = true;
    editor.lastCell = `${cell.x},${cell.y}`;
    paint(cell.x, cell.y);
    return;
  }

  if (ui.anim) return ui.anim.finish();
  if (game.awaitingReset) return reset();
  if (game.solved || !game.state) return;
  const block = !!cell && game.state.piece[idx(cell.x, cell.y)] === P.BLOCK;
  ui.press = { cell, px, py, dist: 0, dir: null, block, dragged: false };
});

canvas.addEventListener('pointermove', (e) => {
  if (!e.isPrimary) return;
  const { px, py, cell } = pointerCell(e);
  if (ui.mode === 'editor') {
    if (!editor.painting || !cell) return;
    const key = `${cell.x},${cell.y}`;
    if (key !== editor.lastCell && editor.tool !== 'cube' && editor.tool !== 'target') {
      editor.lastCell = key;
      paint(cell.x, cell.y);
    }
    return;
  }
  const p = ui.press;
  if (!p) return;
  const dx = px - p.px, dy = py - p.py;
  p.dist = Math.hypot(dx, dy) / layout(ui.size).cell;
  if (!p.block) return;
  if (p.dist < DRAG_START) {
    if (p.dir != null) {
      p.dir = null;
      ui.preview = null;
    }
    return;
  }
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
  p.dragged = true;
  if (dir !== p.dir) {
    // Dragging takes over from any tap selection.
    ui.selected = null;
    ui.keyDir = null;
    ui.hint = null;
    p.dir = dir;
    ui.preview = firstReaction(game.state, p.cell.x, p.cell.y, dir);
    ui.origin = { ...p.cell };
    if (ui.preview?.end === 'blocked') buzz(10);
    renderStatus();
  }
});

function endPress(commit) {
  const p = ui.press;
  ui.press = null;
  if (!p) return;
  if (p.dir != null) {
    ui.preview = null;
    ui.origin = null;
    if (commit && p.dist >= DRAG_COMMIT) commitMove(p.cell.x, p.cell.y, p.dir);
    return;
  }
  // A press that ever became a drag is never a tap, even if the finger came back:
  // dragging back to the start is how a swipe gets cancelled.
  if (p.dragged) renderStatus();
  else if (commit && p.dist < DRAG_START) handleTap(p.cell);
}

function handleTap(cell) {
  const sel = ui.selected;
  if (sel && cell) {
    const dx = cell.x - sel.x, dy = cell.y - sel.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      const dir = dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0;
      if (legalDirsAt(sel.x, sel.y).includes(dir)) return chooseDir(dir);
    }
  }
  const piece = cell ? game.state.piece[idx(cell.x, cell.y)] : P.NONE;
  if (piece === P.BLOCK && !(sel && sel.x === cell.x && sel.y === cell.y)) {
    selectBlock(cell);
    buzz(4);
    return;
  }
  clearSelection();
  if (piece === P.CUBE) say('The cube only moves when something hits it.');
  else renderStatus();
}

canvas.addEventListener('pointerup', (e) => {
  if (!e.isPrimary) return;
  if (ui.mode === 'editor') {
    editor.painting = false;
    return;
  }
  endPress(true);
});
canvas.addEventListener('pointercancel', () => {
  editor.painting = false;
  endPress(false);
});

// ---------- keyboard ----------

const KEY_DIRS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

function cycleSelection(step) {
  const blocks = game.state.piece.map((p, i) => (p === P.BLOCK ? i : -1)).filter((i) => i >= 0);
  if (!blocks.length) return;
  const cur = ui.selected ? blocks.indexOf(idx(ui.selected.x, ui.selected.y)) : -1;
  const i = blocks[(cur + step + blocks.length) % blocks.length];
  selectBlock({ x: i % SIZE, y: (i / SIZE) | 0 });
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (!$('overlay').hidden) {
    if (e.key === 'Escape' && canDismiss()) hidePanels();
    return;
  }
  if (ui.mode !== 'play' || !game.state || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key in KEY_DIRS) {
    e.preventDefault();
    ui.viaKeys = true;
    if (ui.anim) return ui.anim.finish();
    if (game.awaitingReset) return reset();
    if (game.solved) return;
    if (!ui.selected || game.state.piece[idx(ui.selected.x, ui.selected.y)] !== P.BLOCK) cycleSelection(1);
    chooseDir(KEY_DIRS[e.key]);
  } else if (e.key === 'Tab' && document.activeElement === canvas) {
    e.preventDefault();
    ui.viaKeys = true;
    cycleSelection(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Enter' && ui.selected && ui.keyDir != null) {
    commitMove(ui.selected.x, ui.selected.y, ui.keyDir);
  } else if (e.key === 'Escape') {
    clearSelection();
    renderStatus();
  } else if (e.key === 'z' || e.key === 'u') undo();
  else if (e.key === 'r') reset();
  else if (e.key === 'h' && !game.oneMove) hint();
});

// ---------- buttons ----------

for (const b of document.querySelectorAll('[data-icon]')) {
  b.innerHTML = `${UI[b.dataset.icon]}<span class="label">${b.textContent.trim()}</span>`;
}
$('btn-menu').innerHTML = UI.menu;
$('btn-help').innerHTML = UI.help;

$('btn-menu').onclick = openMenu;
$('btn-help').onclick = () => showPanel('panel-help');
$('btn-undo').onclick = undo;
$('btn-reset').onclick = reset;
$('btn-hint').onclick = hint;
$('btn-share').onclick = shareCurrent;
$('btn-back-editor').onclick = () => openEditor(game.start);

$('m-daily').onclick = () => playDaily();
$('m-levels').onclick = openLevels;
$('m-endless').onclick = playEndless;
$('m-editor').onclick = () => openEditor(game.start && ui.mode !== 'editor' ? game.start : null);
$('m-code').onclick = openCodeEntry;
$('m-help').onclick = () => showPanel('panel-help');
$('m-close').onclick = hidePanels;

for (const b of document.querySelectorAll('[data-back]')) {
  b.onclick = () => {
    if (!store.helpSeen) {
      store.helpSeen = true;
      save();
    }
    if (b.closest('#panel-levels, #panel-code')) openMenu();
    else if (canDismiss()) hidePanels();
    else openMenu();
  };
}
$('overlay').addEventListener('click', (e) => {
  if (e.target === $('overlay') && canDismiss()) hidePanels();
});

$('code-go').onclick = () => {
  if (playCode($('code-input').value)) return;
  $('code-input').setAttribute('aria-invalid', 'true');
  $('code-error').textContent = 'That code isn’t valid. Check for typos.';
};
$('code-input').addEventListener('input', () => {
  $('code-input').removeAttribute('aria-invalid');
  $('code-error').textContent = '';
});
$('code-input').addEventListener('keydown', (e) => e.key === 'Enter' && $('code-go').click());

$('win-share').onclick = shareCurrent;
$('win-next').onclick = nextAfterWin;
$('win-close').onclick = hidePanels;

$('ed-clear').onclick = () => {
  editor.state = emptyState();
  editorSay('Board cleared.');
};
$('ed-solve').onclick = () => checkEditor();
$('ed-play').onclick = () => {
  const problems = validate(editor.state);
  if (problems.length) return editorSay(problems.join(' '));
  loadPuzzle(editor.state, { kind: 'test', title: 'Testing your puzzle', hash: `e=${encode(editor.state)}` });
};
$('ed-share').onclick = () =>
  checkEditor(async (r) => {
    const code = encode(editor.state);
    const link = shareLink(code);
    const headline = r.moves === 1 ? 'This puzzle takes one move. Can you find it?' : `Par ${r.moves}. Can you match it?`;
    const card = makeShareCard({ state: withIds(editor.state), title: 'Custom puzzle', headline, code, link });
    toast(await shareResult(card, { text: `Chain Shift challenge: ${headline}`, link }));
    editorSay(`Code ${formatCode(code)}`);
  });

// ---------- main loop ----------

let last = performance.now(), lastDraw = 0;

const OX = [0, 1, 0, -1], OY = [-1, 0, 1, 0];

function nudgeFor(now) {
  if (ui.bump) {
    const t = (now - ui.bump.start) / 200;
    if (t >= 1) ui.bump = null;
    else {
      const k = Math.sin(t * Math.PI) * 0.14;
      return { x: ui.bump.x, y: ui.bump.y, ox: OX[ui.bump.dir] * k, oy: OY[ui.bump.dir] * k };
    }
  }
  const p = ui.press;
  if (p?.block && p.dir != null) {
    const k = Math.min(1, p.dist) * (ui.preview?.end === 'blocked' ? 0.05 : 0.16);
    return { x: p.cell.x, y: p.cell.y, ox: OX[p.dir] * k, oy: OY[p.dir] * k };
  }
  return null;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(64, now - last);
  last = now;
  if (ui.anim && ui.anim.update(dt)) onChainFinished();
  ui.flashes = ui.flashes.filter((f) => now - f.born < 400);

  // Idle screens only have slow pulses: redraw at ~30fps to save battery.
  const active = ui.anim || ui.press || ui.bump || ui.flashes.length;
  if (!active && !needsDraw && now - lastDraw < 33) return;
  needsDraw = false;
  lastDraw = now;

  ctx.clearRect(0, 0, ui.size, ui.size);
  if (ui.mode === 'editor') {
    drawBoard(ctx, ui.size, { state: editor.state, time: now, still: reduceMotion.matches });
  } else if (game.state) {
    const sel = ui.press?.dir != null ? null : ui.selected;
    drawBoard(ctx, ui.size, {
      state: game.state,
      display: ui.anim?.display,
      preview: ui.preview,
      origin: ui.origin,
      selected: sel,
      handles: sel && !ui.anim ? { dirs: legalDirsAt(sel.x, sel.y), active: ui.keyDir } : null,
      hint: ui.hint,
      nudge: nudgeFor(now),
      flashes: ui.flashes,
      time: now,
      still: reduceMotion.matches,
    });
  }
}

// ---------- boot ----------

function route() {
  const [key, value = ''] = location.hash.slice(1).split('=');
  if (key === 'l' && LEVELS[Number(value) - 1]) return playLevel(Number(value) - 1);
  if (key === 'd' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return playDaily(value);
  if (key === 'c' && playCode(value)) return;
  if (key === 'e') return openEditor(decode(value) || emptyState());
  // No (valid) link: newcomers start at level 1, returning players at their next level.
  const next = LEVELS.findIndex((_, i) => store.levels[i] == null);
  playLevel(next < 0 ? LEVELS.length - 1 : next);
  if (!store.helpSeen) showPanel('panel-help');
}

buildHelp();
buildTools();
resize();
route();
window.addEventListener('hashchange', route);
requestAnimationFrame(frame);
