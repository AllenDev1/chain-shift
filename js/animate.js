// Plays back the event list from engine.simulate() as smooth piece motion.

import { SIZE, P, DIRS } from './engine.js';
import { COLORS } from './render.js';

export class ChainAnimation {
  constructor(startState, events, onFlash) {
    this.display = new Map();
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (startState.piece[i]) this.display.set(startState.ids[i], { x: i % SIZE, y: (i / SIZE) | 0, kind: startState.piece[i], alpha: 1, scale: 1 });
    }
    // Long chains speed up so a 30-step reaction doesn't drag.
    const steps = events.filter((e) => e.type === 'move').length;
    const cellMs = Math.max(30, Math.min(80, 80 - steps * 1.6));
    this.segs = events.map((e) => this.segment(e, cellMs, onFlash));
    this.i = 0;
    this.t = 0;
  }

  segment(e, cellMs, onFlash) {
    const piece = () => this.display.get(e.id);
    switch (e.type) {
      case 'move':
        return { dur: cellMs, apply: (p) => Object.assign(piece(), { x: e.fx + (e.x - e.fx) * p, y: e.fy + (e.y - e.fy) * p }) };
      case 'hit':
        return {
          dur: 45,
          begin: () => onFlash({ type: 'hit', x: e.x + DIRS[e.dir].dx * 0.5, y: e.y + DIRS[e.dir].dy * 0.5, color: COLORS.impact }),
        };
      case 'turn':
        return { dur: 0, begin: () => onFlash({ type: 'turn', x: e.x, y: e.y, color: COLORS.arrow }) };
      case 'fall':
        return {
          dur: 260,
          begin: () => onFlash({ type: 'fall', x: e.x, y: e.y, color: e.kind === P.CUBE ? '#ff5d6c' : '#8a8cc0' }),
          apply: (p) => Object.assign(piece(), { scale: 1 - p * 0.8, alpha: 1 - p }),
          end: () => this.display.delete(e.id),
        };
      default:
        return { dur: 0 };
    }
  }

  // Advance by dt milliseconds. Returns true once the whole chain has played.
  update(dt) {
    this.t += dt;
    while (this.i < this.segs.length) {
      const seg = this.segs[this.i];
      if (!seg.started) {
        seg.started = true;
        seg.begin?.();
      }
      const p = seg.dur ? Math.min(1, this.t / seg.dur) : 1;
      seg.apply?.(p);
      if (p < 1) return false;
      seg.end?.();
      this.t -= seg.dur;
      this.i++;
    }
    return true;
  }

  finish() {
    this.update(Infinity);
  }
}
