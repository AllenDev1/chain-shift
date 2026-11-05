// How hard a puzzle is, measured rather than guessed. Used by tools/make-levels.mjs to give
// every campaign level a tier, and by the tests to check those tiers still hold.
//
// Par alone is a poor measure: long puzzles often allow several move orders, and a par-4
// puzzle where most first moves work is easier than a par-3 one with a single way in. So
// for multi-move puzzles the tier also counts how many first moves still allow an optimal
// solve. For one-move puzzles it looks at the winning chain and the decoys around it.

import { P, legalMoves, simulate, solve } from './engine.js';
import { chainStats } from './generator.js';

export const TIERS = ['easy', 'medium', 'hard', 'expert'];
export const TIER_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard', expert: 'Expert' };

// Pieces set moving, per move of the solution: how much chain the player has to predict.
export function chainLength(state, solution) {
  let cur = state, movers = 0;
  for (const m of solution) {
    const r = simulate(cur, m.x, m.y, m.dir);
    movers += chainStats(r.events).movers;
    cur = r.state;
  }
  return movers / solution.length;
}

// { par, firstMoves, goodFirst, cubeMoves, movers } for a puzzle whose par and one optimal
// solution are known. cubeMoves: first moves that shift the cube at all (the real candidates
// in a one-move puzzle; most legal moves obviously never reach it).
export function measure(state, par, solution) {
  const moves = legalMoves(state);
  const start = state.piece.indexOf(P.CUBE);
  let goodFirst = 0, cubeMoves = 0;
  for (const m of moves) {
    const r = simulate(state, m.x, m.y, m.dir);
    if (!r.ok) continue;
    if (r.state.piece.indexOf(P.CUBE) !== start) cubeMoves++;
    if (r.outcome === 'fail') continue;
    if (r.outcome === 'win') goodFirst++;
    else if (par > 1 && solve(r.state, { maxDepth: par - 1, maxStates: 150000 }).moves === par - 1) goodFirst++;
  }
  return { par, firstMoves: moves.length, goodFirst, cubeMoves, movers: chainLength(state, solution) };
}

const STEP = { easy: 'medium', medium: 'hard', hard: 'expert', expert: 'expert' };

export function classify({ par, goodFirst, cubeMoves, movers }) {
  if (par === 1) {
    // Finding the one move is mostly about reading its chain; a crowd of other moves that
    // also shove the cube around makes it a step harder.
    const base = movers >= 4 ? 'hard' : movers >= 3 ? 'medium' : 'easy';
    return cubeMoves >= (base === 'easy' ? 5 : 6) ? STEP[base] : base;
  }
  // A single way in makes a puzzle feel a step harder; many make it a step easier.
  const effective = par + (goodFirst === 1 && par >= 3 ? 1 : 0) - (goodFirst >= 4 ? 1 : 0);
  if (effective <= 2) return 'easy';
  if (effective <= 4) return 'medium';
  if (effective <= 6) return 'hard';
  return 'expert';
}
