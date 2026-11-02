// The board film behind the store videos and hero images: real puzzles solved move by
// move, drawn with the game's own renderer at any size and frame-exact at 30 fps.
// A finger drags each block, the first-hit preview appears, then the chain plays out.

import { DIRS, P, SIZE, firstReaction, simulate, solve, withIds } from '/js/engine.js';
import { decode } from '/js/codec.js';
import { LEVELS } from '/js/levels.js';
import { generateDaily } from '/js/generator.js';
import { drawBoard, layout } from '/js/render.js';
import { ChainAnimation } from '/js/animate.js';

export const FPS = 30;
const DT = 1000 / FPS;
const sec = (s) => Math.round(s * FPS);
const ease = (p) => 1 - (1 - p) ** 3;

function puzzle(name, date) {
  if (name === 'daily') return withIds(generateDaily(date).state);
  return withIds(decode(LEVELS[name - 1].code));
}

// Builds every frame's view up front, so any frame can be drawn on its own.
export function makeFilm({ puzzles = [6, 'daily', 11], date = '2026-11-02' } = {}) {
  const frames = [];
  let t = 0;
  let flashes = [];
  const push = (view, meta = {}) => {
    flashes = flashes.filter((f) => t - f.born < 400);
    frames.push({ ...view, flashes: flashes.filter((f) => f.born <= t), time: t, meta });
    t += DT;
  };

  puzzles.forEach((name, pi) => {
    let state = puzzle(name, date);
    const { path } = solve(state, { maxDepth: 10, maxStates: 300000 });
    const fade = (from, to) => {
      for (let i = 0; i < sec(0.3); i++) push({ state, fade: from + (to - from) * (i / sec(0.3)) }, { phase: 'fade' });
    };
    // Every puzzle fades in and out, so the film also loops cleanly.
    fade(0, 1);

    path.forEach((m, mi) => {
      const d = DIRS[m.dir];
      const at = (dist) => ({ x: m.x + 0.5 + d.dx * dist, y: m.y + 0.5 + d.dy * dist });
      for (let i = 0; i < sec(mi === 0 ? 0.6 : 0.4); i++) push({ state }, { phase: 'idle' });
      for (let i = 0; i < sec(0.15); i++) push({ state, finger: { ...at(0), a: i / sec(0.15) } }, { phase: 'touch' });

      const preview = firstReaction(state, m.x, m.y, m.dir);
      const dragView = (dist) => ({
        state,
        finger: { ...at(dist), a: 1 },
        ...(dist >= 0.22 && { preview, origin: { x: m.x, y: m.y } }),
        nudge: { x: m.x, y: m.y, ox: d.dx * Math.min(1, dist) * 0.16, oy: d.dy * Math.min(1, dist) * 0.16 },
      });
      for (let i = 1; i <= sec(0.4); i++) push(dragView(0.85 * ease(i / sec(0.4))), { phase: 'drag' });
      for (let i = 0; i < sec(0.35); i++) push(dragView(0.85), { phase: 'preview' });

      const r = simulate(state, m.x, m.y, m.dir);
      const anim = new ChainAnimation(state, r.events, (f) => flashes.push({ ...f, born: t }));
      const lift = at(0.85);
      let i = 0;
      for (let done = false; !done; i++) {
        done = anim.update(DT);
        const a = Math.max(0, 1 - i / sec(0.2));
        push({ state, display: new Map([...anim.display].map(([k, v]) => [k, { ...v }])), finger: a ? { ...lift, a } : null }, { phase: 'chain', hits: r.hits });
      }
      state = r.state;
      if (r.outcome === 'win') {
        const c = state.piece.indexOf(P.CUBE);
        const cx = c % SIZE, cy = (c / SIZE) | 0;
        for (const delay of [0, 120, 240]) flashes.push({ type: 'hit', x: cx, y: cy, color: '#5ef2ff', born: t + delay });
        for (let k = 0; k < sec(1.3); k++) push({ state }, { phase: 'win' });
      } else {
        for (let k = 0; k < sec(0.3); k++) push({ state }, { phase: 'rest' });
      }
    });
    fade(1, 0);
  });
  return frames;
}

// Draws one frame onto ctx at (0,0) with the board `size` px wide.
export function drawFrame(ctx, size, f) {
  ctx.save();
  ctx.globalAlpha = f.fade ?? 1;
  drawBoard(ctx, size, f);
  if (f.finger && f.finger.a > 0) {
    const L = layout(size);
    const x = L.pad + f.finger.x * L.cell, y = L.pad + f.finger.y * L.cell;
    ctx.globalAlpha = (f.fade ?? 1) * f.finger.a;
    ctx.beginPath();
    ctx.arc(x, y, L.cell * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fill();
    ctx.lineWidth = L.cell * 0.035;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.stroke();
  }
  ctx.restore();
}

// The still for hero images: a finger mid-drag on the move with the longest chain, with the
// preview showing where the block will hit. It explains the game better than a frozen chain.
export function heroFrame(frames) {
  let best = -1, bestScore = -1;
  frames.forEach((f, i) => {
    if (f.meta.phase !== 'preview') return;
    const next = frames.slice(i + 1).find((g) => g.meta.phase !== 'preview');
    // A long dashed path reads at a glance; more hits break ties.
    const score = (f.preview?.path.length ?? 0) * 100 + (next?.meta.hits ?? 0);
    if (score > bestScore) (best = i), (bestScore = score);
  });
  return best;
}
