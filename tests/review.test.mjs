import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, newRecord, countSolve, reviewDue } from '../js/review.js';

const DAY = 24 * 60 * 60 * 1000;
const good = { stars: 3, hints: 0, adShown: false };

// A player who has met the engagement bar: enough solves over enough days.
function engaged() {
  const r = newRecord();
  for (let i = 0; i < RULES.minSolves; i++) countSolve(r, i < RULES.minSolves / 2 ? '2026-11-01' : '2026-11-03');
  return r;
}

test('counts distinct days, not solves, toward minDays', () => {
  const r = newRecord();
  countSolve(r, '2026-11-01');
  countSolve(r, '2026-11-01');
  countSolve(r, '2026-11-02');
  assert.equal(r.solves, 3);
  assert.equal(r.days, 2);
});

test('never asks a new player', () => {
  const r = newRecord();
  for (let i = 0; i < RULES.minSolves * 3; i++) countSolve(r, '2026-11-01');
  assert.equal(reviewDue(r, good), false, 'many solves but one day');
  const few = newRecord();
  countSolve(few, '2026-11-01');
  countSolve(few, '2026-11-02');
  assert.equal(reviewDue(few, good), false, 'two days but few solves');
});

test('asks an engaged player after a clean 3-star solve', () => {
  assert.equal(reviewDue(engaged(), good), true);
});

test('only after a moment of success, and never alongside an ad', () => {
  const r = engaged();
  assert.equal(reviewDue(r, { ...good, stars: 2 }), false);
  assert.equal(reviewDue(r, { ...good, hints: 1 }), false);
  assert.equal(reviewDue(r, { ...good, adShown: true }), false);
});

test('waits out the cooldown and stops after maxAsks', () => {
  const r = engaged();
  const t0 = Date.UTC(2026, 10, 5);
  r.asks = 1;
  r.askedAt = t0;
  assert.equal(reviewDue(r, good, t0 + (RULES.cooldownDays - 1) * DAY), false);
  assert.equal(reviewDue(r, good, t0 + RULES.cooldownDays * DAY), true);
  r.asks = RULES.maxAsks;
  assert.equal(reviewDue(r, good, t0 + 1000 * DAY), false);
});
