# Chain Shift

A 6×6 puzzle where every move sets off a chain reaction. The challenge is to predict where everything ends up once it all stops moving.

> **"This puzzle takes one move. Can you find it?"**

## Rules

- **Drag a block.** It slides until something stops it.
- **Chain reaction.** When a sliding piece hits another piece, it stops and passes its momentum on. The piece it hit slides in the same direction.
- **The glowing cube** can't be dragged. You move it only by hitting it with a chain. You win when the cube *comes to rest* on the target.
- **Arrows** turn any piece that slides onto them. A piece that is hit while resting on an arrow moves the way it was hit.
- **Pits** swallow the first piece that falls in, then become normal floor. If the cube falls in, you lose that attempt.
- **Walls** never move.

While you drag, the game shows only the first piece's path and what it hits. You have to work out the rest of the chain yourself. Drag back to the start to cancel.

You can also tap a block. Arrows appear around it: tap one to preview that swipe, then tap it again to make the move. With a keyboard, the arrow keys work the same way (press once to preview, again to move). Tab cycles through the blocks.

## Built for small screens

- **One screen, no scrolling.** The board is the largest square that fits between the header and the controls, from a 320×568 phone up to desktop. The board and status line stay together, and the controls sit at the bottom, within thumb reach.
- **Landscape phones** switch to a side-by-side layout: board on the left, everything else in a column on the right.
- **Menus slide up from the bottom of the screen** on phones held upright, and Android's Back button closes them instead of leaving the game.
- **Every button is at least 44 px.** The status line has a fixed height, so changing messages never shift the layout.
- **Touch details:** the dragged block nudges under your finger, a blocked move bumps against the wall, phones that support it give light vibration on impacts, double-tap zoom and pull-to-refresh are turned off over the game, and the long-press menu is suppressed on the board.
- The app can be added to the home screen and opens full-screen (`manifest.webmanifest`, icons in `icons/`). It respects the system's reduced-motion setting.

## Modes

| Mode | What it is |
|---|---|
| **Daily One-Move** | A new puzzle each day. Exactly one of roughly 20 possible moves wins. Your score is how many tries you needed. |
| **Levels** | A 12-level campaign that introduces arrows, then pits. Stars are based on moves compared with par. |
| **Endless** | Freshly generated puzzles with a par of 2–4. |
| **Editor** | Build your own puzzle. **Check** runs the solver to find its par and tells you whether it's a true one-move puzzle. |

## Sharing without a server

Every puzzle has a 28-character **challenge code**: the full board in base58, plus a checksum that catches typos. The code goes in the link (`#c=CODE`) and is printed on the share image, so a friend can replay the exact puzzle from either one.

- `#d=2026-10-30` opens a given day's Daily puzzle. It is generated from a seeded random number generator, so every device builds the same puzzle.
- `#l=5` opens level 5. `#e=CODE` opens a board in the editor.

## Running it

It's a static site written as plain ES modules, with no build step.

```sh
npm start        # serves on http://localhost:8080 (tools/serve.mjs, no dependencies)
npm test         # engine, codec, generator and campaign tests (node --test)
```

Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`. Use a local server.

To deploy, enable GitHub Pages on the repo root. Share links use the page's own URL.

## Layout

```
index.html, css/style.css   UI shell
js/engine.js     rules, simulation, preview, BFS solver (pure; runs in Node too)
js/codec.js      board ⇄ challenge code
js/generator.js  seeded generation: Daily one-move puzzles, multi-move puzzles
js/levels.js     campaign (generated, do not edit by hand)
js/render.js     canvas drawing, shared by the game and the share card
js/animate.js    plays back simulation events as motion
js/share.js      share-card PNG and Web Share / download fallback
js/icons.js      inline SVG icons (UI + tiles that match the board art)
js/main.js       game flow, input, sheets, editor
tools/make-levels.mjs   regenerates js/levels.js
tools/serve.mjs         local static server
```

### How puzzles are generated

The target is just a floor marker and has no effect on how pieces move. So the generator first builds a board **without** a target, simulates every possible move, and finds the cells where the cube can come to rest. It then puts the target on a cell that exactly one move reaches. For multi-move puzzles, a breadth-first search finds the first depth at which the cube can stop on each cell, and that depth becomes the par.

One design consequence: **without arrows, every chain runs along a single straight line**, because momentum keeps its direction. Long one-move chains need arrows, so the campaign uses arrow-free boards for multi-move setup puzzles and saves the one-move showpieces for after arrows are introduced.
