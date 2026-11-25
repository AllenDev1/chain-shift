// Builds js/levels.js: the campaign, generated from seeds and checked by the solver.
// Run: node tools/make-levels.mjs   (deterministic: same output every time)
//
// Every level names the tier it should be (easy / medium / hard / expert / master). The script
// generates candidates, measures each one (js/difficulty.js), keeps those that really are
// that tier, and picks the one with the most chain reaction in its solution. Seeds come
// from the level's name, so adding, removing or reordering levels never changes the others.
// Levels are built in parallel, one worker per CPU core.
//
// Built levels are cached in node_modules/.cache/make-levels.json, keyed by the level's
// settings and the source of the modules that generate and measure it. A rerun only builds
// levels that changed, and a run that fails keeps the levels it did build.
// Pass --fresh to ignore the cache.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { CONFIGS, generateOneMove, generatePuzzle, chainStats, hashString } from '../js/generator.js';
import { simulate, solve } from '../js/engine.js';
import { encode, decode } from '../js/codec.js';
import { measure, classify } from '../js/difficulty.js';

// ---------- board mixes ----------

// Without arrows every chain runs along one straight line (momentum keeps its direction),
// so long one-move chains only become possible once arrows appear.
const C = {
  basic: { walls: [1, 3], pits: [0, 0], arrows: [0, 0], blocks: [6, 9] },
  small: { walls: [1, 3], pits: [0, 0], arrows: [0, 0], blocks: [6, 8] },
  arrows: CONFIGS.arrows,
  smallArrows: { walls: [1, 3], pits: [0, 0], arrows: [1, 2], blocks: [6, 9] },
  denseArrows: { walls: [2, 4], pits: [0, 0], arrows: [2, 4], blocks: [7, 10] },
  pits: { walls: [2, 4], pits: [1, 2], arrows: [0, 1], blocks: [4, 7] },
  smallPits: { walls: [1, 3], pits: [1, 1], arrows: [1, 2], blocks: [6, 9] },
  densePits: { walls: [2, 4], pits: [1, 2], arrows: [1, 3], blocks: [7, 10] },
  full: CONFIGS.full,
  dense: CONFIGS.dense,
  // Chapters 6–9: more pieces in play, and every hazard at once.
  crowded: { walls: [2, 4], pits: [0, 1], arrows: [1, 3], blocks: [6, 9] },
  gauntlet: { walls: [2, 4], pits: [1, 2], arrows: [2, 4], blocks: [4, 8] },
};

// Par ranges a multi-move candidate is drawn from, per target tier. The tier itself is
// decided by measuring (a par-6 puzzle with one way in is expert, with many it's hard).
// Par stops at 10, the depth the in-game hint searches.
const PARS = { easy: [2, 3], medium: [3, 4], hard: [5, 6], expert: [6, 8], master: [9, 10] };
// One-move generator settings that tend to produce each tier.
const ONE = {
  easy: { minMovers: 2, minMoves: 8 },
  medium: { minMovers: 3, minMoves: 10 },
  hard: { minMovers: 4, minMoves: 12 },
};
const CANDIDATES = { easy: 16, medium: 24, hard: 30, expert: 36, master: 24 };

// ---------- the campaign ----------

const pin = (name, code, tip = '') => ({ name, tip, pin: code });
const multi = (name, tier, cfg, tip = '', pars = PARS[tier]) => ({ name, tip, kind: 'multi', tier, cfg, pars });
// A chapter finale: master at the full par of 10.
const finale = (name, cfg, tip = '') => multi(name, 'master', cfg, tip, [10, 10]);
const one = (name, tier, cfg, opts = {}, tip = '') => ({ name, tip, kind: 'one', tier, cfg, opts });

// The first three levels of chapters 1–4 are the original 1.0 campaign, kept as they were
// so players keep their stars (progress is saved per puzzle code).
const CHAPTERS = [
  {
    name: 'Basics',
    blurb: 'Push, slide, chain.',
    levels: [
      pin('First Push', '12QoxnixzfFZSw7atMvvXoRByjEb', 'Drag a block into others. Momentum passes along. Land the cube on the target.'),
      pin('Two Steps', 'AC72MkvxTpnX8tR51U5f5Bt5KcBb', 'Some puzzles need setup. Match par for three stars.'),
      pin('Groundwork', '12Uteg3GpUk1HCDZnPQ5XeX7ByAk'),
      one('Straight Shot', 'easy', C.small),
      multi('Setup', 'easy', C.basic),
      multi('Backstop', 'medium', C.basic),
      one('Crowd Control', 'medium', C.small, { minMovers: 2, minDecoys: 5 }, 'Several moves shove the cube. Only one leaves it on the target.'),
      multi('Bank Shot', 'medium', C.basic),
      multi('Bottleneck', 'medium', C.basic),
      multi('Relay', 'medium', C.basic),
      multi('Long Way Round', 'hard', C.basic),
      multi('Cornerstone', 'hard', C.basic),
    ],
  },
  {
    name: 'Arrows',
    blurb: 'Arrows turn whatever slides onto them.',
    levels: [
      pin('Turn Signal', '12V5G81nB2tZurqJA4s5VhToztog', 'Arrows turn anything that slides onto them. One move solves this.'),
      pin('Detour', '11Riyh1fnYm3HLCg2DCQPdST2WjU', 'Arrows act on entry. A piece hit while on one moves the way it was hit.'),
      pin('Ricochet', '6qYdJD62z2ZJHfVASF6LXqXYpoRr'),
      multi('Switchback', 'easy', C.arrows),
      one('Signpost', 'medium', C.smallArrows),
      multi('Roundabout', 'medium', C.arrows),
      multi('Crosswind', 'medium', C.arrows),
      one('Pinball', 'hard', C.denseArrows),
      multi('Spiral', 'hard', C.arrows),
      multi('Redirect', 'hard', C.arrows),
      one('Carom', 'hard', C.denseArrows),
      multi('Labyrinth', 'expert', C.arrows),
    ],
  },
  {
    name: 'Pits',
    blurb: 'Pits swallow the first piece in.',
    levels: [
      pin('Mind the Gap', '116wZSb7KzbJWxZSaq5i5GGRHnFE', "Pits swallow the first piece in, then fill up. Don't drop the cube."),
      pin('Fill the Hole', '2wpvxvUVMbhHNc6vzoqsddeZ1FdL'),
      pin('Sinkhole', '1WcnBj1cq4q7RfQBGKy7vLjtxNCs'),
      multi('Stepping Stone', 'easy', C.pits),
      one('Trapdoor', 'medium', C.smallPits),
      multi('Sacrifice', 'medium', C.pits),
      multi('Pothole', 'medium', C.pits),
      one('Cliffside', 'hard', C.densePits),
      multi('Bridge Builder', 'hard', C.pits),
      multi('Quicksand', 'hard', C.pits),
      one('Tightrope', 'hard', C.densePits),
      multi('Abyss', 'expert', C.pits),
    ],
  },
  {
    name: 'Crossroads',
    blurb: 'Arrows, pits and walls, all at once.',
    levels: [
      pin('Crossfire', '8J6k1sqrPzkBQ51kvySN4PDqwUje'),
      pin('Long Fuse', '9uFKcJAPk4coAXDA4WpBXQbz8A71'),
      pin('Domino Effect', '2V2jsebrLyULQnwBtFyDU6QCjx3f'),
      multi('Junction', 'medium', C.full),
      one('Contraption', 'hard', C.dense),
      multi('Overpass', 'hard', C.full),
      multi('Gridlock', 'hard', C.full),
      one('Chain Letter', 'hard', C.denseArrows),
      multi('Traffic Jam', 'hard', C.full),
      multi('Switchyard', 'expert', C.full),
      one('Clockwork', 'hard', C.dense, { minMovers: 3, minDecoys: 6 }),
      multi('Interchange', 'expert', C.full),
    ],
  },
  {
    name: 'Expert',
    blurb: 'Only one or two good first moves.',
    levels: [
      multi('Cold Start', 'expert', C.full, 'Expert puzzles leave only one or two good first moves. Look before you swipe.'),
      one('Needle', 'hard', C.denseArrows, { minMovers: 4, minDecoys: 5 }),
      multi('Long Game', 'expert', C.full),
      multi('Keystone', 'expert', C.full),
      multi('Gambit', 'expert', C.full),
      one('Hair Trigger', 'expert', C.denseArrows, { minMovers: 4, minDecoys: 6 }),
      multi('Endgame', 'expert', C.full),
      multi('Zugzwang', 'expert', C.full),
      one('Butterfly', 'expert', C.dense, { minMovers: 4, minDecoys: 6 }),
      multi('Avalanche', 'expert', C.full),
      multi('Perpetual Motion', 'expert', C.full),
      multi('Last Link', 'expert', C.full),
    ],
  },
  // Chapters 6–9 have 10 levels each. Each opens at Expert and climbs into Master
  // (nine or ten moves, few ways in). Within a chapter, levels are ordered by measured
  // difficulty: par, then fewer good first moves. One single-move puzzle per chapter
  // changes the pace.
  {
    name: 'Long Haul',
    blurb: 'Nine moves or more to the target.',
    levels: [
      multi('Slow Burn', 'expert', C.full, 'Master puzzles take nine moves or more. Plan the last few moves first.'),
      multi('Uphill', 'expert', C.full),
      multi('Marathon', 'expert', C.full),
      one('Tripwire', 'expert', C.denseArrows, { minMovers: 4, minDecoys: 6 }),
      multi('Odyssey', 'master', C.full),
      multi('Nine Lives', 'master', C.full),
      multi('Homestretch', 'master', C.full),
      multi('Long Division', 'master', C.full),
      multi('Slow Dance', 'master', C.full),
      finale('Summit', C.full),
    ],
  },
  {
    name: 'Tight Quarters',
    blurb: 'Crowded boards. Every push moves a lot.',
    levels: [
      multi('Elbow Room', 'expert', C.crowded),
      multi('Sardines', 'expert', C.crowded),
      multi('Pressure Cooker', 'master', C.crowded),
      one('Domino Run', 'expert', C.denseArrows, { minMovers: 4, minDecoys: 6 }),
      finale('Standing Room', C.crowded),
      multi('Packed House', 'master', C.crowded),
      multi('Bumper to Bumper', 'master', C.crowded),
      multi('Rush Hour', 'master', C.crowded),
      finale('Squeeze Play', C.crowded),
      multi('Shoulder to Shoulder', 'master', C.crowded),
    ],
  },
  {
    name: 'Gauntlet',
    blurb: 'Pits and arrows everywhere.',
    levels: [
      multi('Minefield', 'expert', C.gauntlet),
      multi('Obstacle Course', 'master', C.gauntlet),
      multi('Pitfall', 'master', C.gauntlet),
      one('Booby Trap', 'expert', C.densePits, { minMovers: 4, minDecoys: 6 }),
      finale('Crucible', C.gauntlet),
      multi('Gauntlet Run', 'master', C.gauntlet),
      multi('Trial by Fire', 'master', C.gauntlet),
      multi('Hall of Mirrors', 'master', C.gauntlet),
      finale('Brink', C.gauntlet),
      finale('Point of No Return', C.gauntlet),
    ],
  },
  {
    name: 'Grandmaster',
    blurb: 'The longest puzzles in the game.',
    levels: [
      multi('Grand Opening', 'master', C.full),
      multi('Clockmaker', 'master', C.gauntlet),
      multi('Long Shadow', 'master', C.full),
      one('Domino Theory', 'expert', C.denseArrows, { minMovers: 4, minDecoys: 6 }),
      finale('Chain Master', C.gauntlet),
      finale('Weak Link', C.full),
      multi('Iron Will', 'master', C.full),
      finale('High Wire', C.full),
      finale('Infinity', C.full),
      finale('Magnum Opus', C.gauntlet, 'The last level. Ten moves, almost no room for error.'),
    ],
  },
];

const SPECS = CHAPTERS.flatMap((ch, chapter) => ch.levels.map((spec) => ({ ...spec, chapter })));

// ---------- building one level ----------

// How much happens per move of the solution: pieces moved, turns, impacts.
function interest(state, solution) {
  let cur = state, score = 0;
  for (const m of solution) {
    const r = simulate(cur, m.x, m.y, m.dir);
    const st = chainStats(r.events);
    score += st.movers * 3 + st.turns * 2 + st.hits;
    cur = r.state;
  }
  return score / solution.length;
}

function candidate(spec, seed) {
  if (spec.kind === 'one') return generateOneMove(seed, { cfg: spec.cfg, pool: 2, maxTries: 40000, ...ONE[spec.tier], ...spec.opts });
  const [minPar, maxPar] = spec.pars;
  return generatePuzzle(seed, { cfg: spec.cfg, minPar, maxPar, maxTries: 60 });
}

function build(i) {
  const spec = SPECS[i];
  if (spec.pin) {
    const state = decode(spec.pin);
    const r = solve(state, { maxDepth: 10, maxStates: 400000 });
    const m = measure(state, r.moves, r.path);
    return { i, level: { name: spec.name, tip: spec.tip, code: spec.pin, par: r.moves, tier: classify(m), chapter: spec.chapter }, m };
  }
  const base = hashString(`chain-shift-level-${spec.name}`);
  // Try a batch of candidates; if none measures at the wanted tier, try a bigger one.
  for (const batch of [CANDIDATES[spec.tier], CANDIDATES[spec.tier] * 4]) {
    const found = [];
    for (let k = 0; k < batch; k++) {
      const p = candidate(spec, (base + k * 7919) >>> 0);
      if (p) found.push({ p, score: interest(p.state, p.solution) });
    }
    // Measuring is the slow part, so measure in order of interest and stop at the first
    // candidate that is the right tier: it is the most interesting one that qualifies.
    found.sort((a, b) => b.score - a.score);
    for (const { p, score } of found) {
      const m = measure(p.state, p.par, p.solution);
      if (classify(m) !== spec.tier) continue;
      return { i, level: { name: spec.name, tip: spec.tip, code: encode(p.state), par: p.par, tier: spec.tier, chapter: spec.chapter }, m: { ...m, score } };
    }
  }
  throw new Error(`No ${spec.tier} puzzle found for "${spec.name}". Loosen its settings.`);
}

// ---------- parallel driver ----------

if (!isMainThread) {
  parentPort.on('message', (i) => {
    try {
      parentPort.postMessage(build(i));
    } catch (err) {
      parentPort.postMessage({ i, error: err.message });
    }
  });
} else {
  const t0 = Date.now();
  const CACHE = new URL('../node_modules/.cache/make-levels.json', import.meta.url);
  const src = ['engine', 'generator', 'difficulty', 'codec']
    .map((f) => readFileSync(new URL(`../js/${f}.js`, import.meta.url), 'utf8'))
    .join('\n');
  const keyOf = (spec) => hashString(src + JSON.stringify(spec)).toString(36);
  const cache = !process.argv.includes('--fresh') && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};

  const results = new Array(SPECS.length);
  const todo = [];
  SPECS.forEach((spec, i) => {
    const hit = cache[keyOf(spec)];
    if (hit) results[i] = { ...hit, i };
    else todo.push(i);
  });
  console.log(`${SPECS.length - todo.length} levels cached, building ${todo.length}`);

  const failed = [];
  let next = 0, done = 0;
  const workers = Math.min(cpus().length, todo.length);
  if (todo.length) await new Promise((resolve, reject) => {
    for (let w = 0; w < workers; w++) {
      const worker = new Worker(new URL(import.meta.url));
      const feed = () => (next < todo.length ? worker.postMessage(todo[next++]) : worker.terminate());
      worker.on('message', (r) => {
        // Keep going after a failure, so one run reports every level that needs loosening.
        if (r.error) failed.push(`${String(r.i + 1).padStart(3)} ${r.error}`);
        else results[r.i] = cache[keyOf(SPECS[r.i])] = r;
        if (++done === todo.length) resolve();
        feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
  mkdirSync(new URL('.', CACHE), { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache));
  if (failed.length) {
    console.error(`${failed.length} level(s) failed; js/levels.js not written:\n${failed.sort().join('\n')}`);
    process.exit(1);
  }

  const codes = new Set();
  for (const { i, level, m } of results) {
    if (codes.has(level.code)) throw new Error(`Duplicate puzzle at level ${i + 1}`);
    codes.add(level.code);
    const stats = `par ${level.par}  first ${String(m.firstMoves).padStart(2)}  good ${m.goodFirst}  cube ${m.cubeMoves}  chain ${m.movers.toFixed(1)}`;
    console.log(`${String(i + 1).padStart(2)} ${CHAPTERS[level.chapter].name.padEnd(10)} ${level.name.padEnd(16)} ${level.tier.padEnd(6)}  ${stats}`);
  }

  // A chapter opens with half the stars of the one before it (18 of 36, 15 of 30).
  const chapters = CHAPTERS.map(({ name, blurb }, k) => ({ name, blurb, unlock: k ? Math.ceil(CHAPTERS[k - 1].levels.length * 1.5) : 0 }));
  const out = `// Generated by tools/make-levels.mjs. Edit that script, not this file.
// unlock: stars needed in the previous chapter to open this one.
export const CHAPTERS = ${JSON.stringify(chapters, null, 2)};

export const LEVELS = ${JSON.stringify(results.map((r) => r.level), null, 2)};
`;
  writeFileSync(new URL('../js/levels.js', import.meta.url), out);
  console.log(`${SPECS.length} levels in ${((Date.now() - t0) / 1000).toFixed(0)}s on ${workers} workers`);
}
