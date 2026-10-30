import { test } from 'node:test';
import assert from 'node:assert/strict';
import { F, P, SIZE, emptyState, withIds, idx, simulate, firstReaction, solve, winningMoves, validate, stateKey } from '../js/engine.js';
import { encode, decode, formatCode } from '../js/codec.js';
import { generateDaily, generatePuzzle, generateOneMove, dailyNumber } from '../js/generator.js';
import { LEVELS } from '../js/levels.js';

// Build a board from 6 strings. Floor: . # T O ^ > v <   Pieces: B (block), C (cube).
// A piece on special floor is written as two chars "floor+piece" inside [..], e.g. [TB].
function board(rows) {
  const s = emptyState();
  const floorOf = { '.': F.EMPTY, '#': F.WALL, T: F.TARGET, O: F.PIT, '^': F.UP, '>': F.RIGHT, v: F.DOWN, '<': F.LEFT };
  rows.forEach((row, y) => {
    const cells = row.match(/\[..\]|./g);
    assert.equal(cells.length, SIZE, `row ${y} width`);
    cells.forEach((c, x) => {
      const i = idx(x, y);
      if (c.startsWith('[')) { s.floor[i] = floorOf[c[1]]; s.piece[i] = c[2] === 'C' ? P.CUBE : P.BLOCK; }
      else if (c === 'B') s.piece[i] = P.BLOCK;
      else if (c === 'C') s.piece[i] = P.CUBE;
      else s.floor[i] = floorOf[c];
    });
  });
  return withIds(s);
}

const at = (s, x, y) => s.piece[idx(x, y)];

test('a swiped block slides until the wall', () => {
  const s = board(['B.....', '......', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.ok(r.ok);
  assert.equal(at(r.state, 5, 0), P.BLOCK);
  assert.equal(at(r.state, 0, 0), P.NONE);
});

test('momentum transfers on impact and the hitter stops', () => {
  const s = board(['B..B..', '......', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.equal(at(r.state, 2, 0), P.BLOCK, 'hitter stops next to the target piece');
  assert.equal(at(r.state, 5, 0), P.BLOCK, 'hit piece slides on');
  assert.equal(r.hits, 1);
});

test('pushing an adjacent piece is legal; pushing into a wall is not', () => {
  const s = board(['BB....', '#.....', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.ok(r.ok);
  assert.equal(at(r.state, 0, 0), P.BLOCK);
  assert.equal(at(r.state, 5, 0), P.BLOCK);
  assert.deepEqual(simulate(s, 0, 0, 2), { ok: false, reason: 'blocked' });
  assert.deepEqual(simulate(s, 0, 0, 3), { ok: false, reason: 'blocked' }, 'board edge');
});

test('the cube cannot be swiped directly', () => {
  const s = board(['C.....', '......', '......', '......', '......', '.....B']);
  assert.equal(simulate(s, 0, 0, 1).reason, 'not-movable');
});

test('arrows redirect on entry', () => {
  const s = board(['B..v..', '......', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.equal(at(r.state, 3, 5), P.BLOCK);
  assert.ok(r.events.some((e) => e.type === 'turn'));
});

test('a piece hit while resting on an arrow moves the way it was hit', () => {
  const s = board(['B.[vB]...', '......', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.equal(at(r.state, 5, 0), P.BLOCK);
  assert.equal(at(r.state, 1, 0), P.BLOCK);
});

test('pits swallow a piece, become floor, and end the chain', () => {
  const s = board(['B.O.B.', '......', '......', '......', '......', '.....C']);
  const r = simulate(s, 0, 0, 1);
  assert.equal(r.state.floor[idx(2, 0)], F.EMPTY);
  assert.equal(at(r.state, 2, 0), P.NONE);
  assert.equal(at(r.state, 4, 0), P.BLOCK, 'pieces beyond the pit are untouched');
});

test('dropping the cube is a fail, resting on the target is a win', () => {
  const fail = board(['B.CO..', '......', '......', '......', '......', '.....T']);
  assert.equal(simulate(fail, 0, 0, 1).outcome, 'fail');
  const win = board(['B.C..T', '......', '......', '......', '......', '......']);
  assert.equal(simulate(win, 0, 0, 1).outcome, 'win');
  const passThrough = board(['B.CT..', '......', '......', '......', '......', '......']);
  assert.equal(simulate(passThrough, 0, 0, 1).outcome, 'none', 'passing over the target is not enough');
});

test('arrow cycles are rejected as infinite loops', () => {
  const s = board(['B>.v..', '......', '.^.<..', '......', '......', '.....C']);
  assert.equal(simulate(s, 0, 0, 1).reason, 'loop');
});

test('firstReaction reveals only the first impact', () => {
  const s = board(['B..B..', '......', '......', '......', '......', '.....C']);
  const fr = firstReaction(s, 0, 0, 1);
  assert.equal(fr.end, 'hit');
  assert.deepEqual(fr.path, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(fr.hit, { x: 3, y: 0 });
});

test('solver finds the optimal move count', () => {
  const s = board(['B.....', '......', '..C...', '......', '......', 'B.T...']);
  // One swipe can't do it; the solver must set up a blocker first.
  const r = solve(s);
  assert.ok(r.moves >= 1);
  let cur = s;
  for (const m of r.path) cur = simulate(cur, m.x, m.y, m.dir).state;
  assert.equal(cur.floor[cur.piece.indexOf(P.CUBE)], F.TARGET);
});

test('validate flags broken boards', () => {
  assert.deepEqual(validate(board(['B.C..T', '......', '......', '......', '......', '......'])), []);
  assert.ok(validate(emptyState()).length >= 2);
});

test('codes round-trip and reject typos', () => {
  const s = board(['B>[TB]..#', 'O.....', '..[^C]...', '......', '....v.', '<....B']);
  const code = encode(s);
  assert.equal(code.length, 28);
  assert.equal(stateKey(decode(code)), stateKey(s));
  assert.equal(stateKey(decode(formatCode(code))), stateKey(s), 'dashes are ignored');
  const typo = (code[3] === 'a' ? 'b' : 'a');
  assert.equal(decode(code.slice(0, 3) + typo + code.slice(4)), null);
  assert.equal(decode('nope'), null);
});

test('daily puzzles are deterministic and have exactly one winning move', () => {
  const a = generateDaily('2026-10-30'), b = generateDaily('2026-10-30');
  assert.equal(encode(a.state), encode(b.state));
  assert.equal(winningMoves(a.state).length, 1);
  assert.equal(solve(a.state).moves, 1);
  assert.notEqual(encode(generateDaily('2026-10-31').state), encode(a.state));
  assert.equal(dailyNumber('2026-10-30'), 1);
  assert.equal(dailyNumber('2026-11-30'), 32);
});

test('generated puzzles match their claimed par', () => {
  for (const seed of [1, 2, 3]) {
    const p = generatePuzzle(seed, { minPar: 2, maxPar: 3 });
    assert.equal(solve(p.state).moves, p.par);
    const o = generateOneMove(seed);
    assert.equal(winningMoves(o.state).length, 1);
  }
});

test('campaign levels decode, validate, and solve in par', () => {
  for (const [i, lvl] of LEVELS.entries()) {
    const s = decode(lvl.code);
    assert.ok(s, `level ${i + 1} decodes`);
    assert.deepEqual(validate(s), [], `level ${i + 1} is valid`);
    assert.equal(solve(s).moves, lvl.par, `level ${i + 1} par`);
  }
});
