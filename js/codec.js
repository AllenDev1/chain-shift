// Challenge codes: a whole board packed into 28 base58 characters (27 data + 1 checksum),
// so puzzles travel in a link or a screenshot without any server.

import { N, F, P, emptyState, withIds } from './engine.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const DATA_LEN = 27;

// Every legal (floor, piece) pair for a cell. Walls and pits never hold a piece.
const COMBOS = [];
for (const f of [F.EMPTY, F.TARGET, F.UP, F.RIGHT, F.DOWN, F.LEFT]) {
  for (const p of [P.NONE, P.BLOCK, P.CUBE]) COMBOS.push([f, p]);
}
COMBOS.push([F.WALL, P.NONE], [F.PIT, P.NONE]);
const RADIX = BigInt(COMBOS.length);
const comboIndex = new Map(COMBOS.map(([f, p], i) => [f * 3 + p, i]));

function checksum(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum = (sum * 31 + ALPHABET.indexOf(str[i]) + i) % 58;
  return ALPHABET[sum];
}

export function encode(s) {
  let n = 0n;
  for (let i = N - 1; i >= 0; i--) {
    const v = comboIndex.get(s.floor[i] * 3 + s.piece[i]);
    if (v === undefined) throw new Error(`Unencodable cell ${i}`);
    n = n * RADIX + BigInt(v);
  }
  let out = '';
  for (let i = 0; i < DATA_LEN; i++) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out + checksum(out);
}

export function decode(code) {
  const clean = String(code || '').replace(/[^1-9A-HJ-NP-Za-km-z]/g, '');
  if (clean.length !== DATA_LEN + 1) return null;
  const data = clean.slice(0, DATA_LEN);
  if (checksum(data) !== clean[DATA_LEN]) return null;

  let n = 0n;
  for (const ch of data) n = n * 58n + BigInt(ALPHABET.indexOf(ch));
  const s = emptyState();
  for (let i = 0; i < N; i++) {
    const v = Number(n % RADIX);
    n /= RADIX;
    [s.floor[i], s.piece[i]] = COMBOS[v];
  }
  if (n !== 0n) return null;
  return withIds(s);
}

// "AbC1234-..." groups of seven for display; decode() ignores the dashes.
export function formatCode(code) {
  return code.match(/.{1,7}/g).join('-');
}
