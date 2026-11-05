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
| **Levels** | A 60-level campaign in five chapters: Basics, Arrows, Pits, Crossroads and Expert. Every level is rated Easy, Medium, Hard or Expert. A chapter opens once you earn 18 of the 36 stars in the one before. Stars are based on moves compared with par. |
| **Endless** | Freshly generated puzzles at Easy (par 2–3), Medium (par 3–4) or Hard (par 5–6). The game remembers the last choice. |
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

## iOS and Android apps

The store apps wrap the same files with [Capacitor](https://capacitorjs.com) 8 (`com.chainshift.game`). The web version is unchanged and still has no build step.

```sh
npm install
npm run ios       # builds www/, syncs, opens Xcode
npm run android   # builds www/, syncs, opens Android Studio
npm run sync      # after any change to the game files
```

To upload an iOS build to App Store Connect without signing in to Xcode, use an App Store Connect API key (Users and Access → Integrations, Admin access). Put the `.p8` file in `~/.appstoreconnect/private_keys/`, then run:

```sh
ASC_KEY_ID=<key id> ASC_ISSUER_ID=<issuer id> npm run ios:upload
```

`tools/ios-upload.sh` archives, signs and uploads the app. It sets a new build number each time (date and time, for example `261102.1530`).

`tools/build-www.mjs` copies the game into `www/` and adds Capacitor's runtime (`capacitor.js`). `js/native.js` is the only app-specific module. In the browser it does nothing, and in the apps it replaces four browser features:

- **Saves:** Preferences instead of `localStorage`, which iOS may clear.
- **Haptics:** native haptics instead of `navigator.vibrate`, which iOS doesn't support.
- **Sharing:** the share card is written to a file and handed to the native share sheet.
- **Links and Back:** share links point at the GitHub Pages URL (`WEB_URL`). Android's Back button closes sheets, then sends the app to the background.

### Ads

The apps show AdMob interstitials through [`@capacitor-community/admob`](https://github.com/capacitor-community/admob). The web version has no ads. All the ad logic is in `js/ads.js`:

- **When:** after the player solves a level or an Endless puzzle and taps Next. The first 4 solves of a session have no ads. After that, ads are at least 3 solves and 3 minutes apart. The Daily and shared challenges never show ads.
- **Consent:** Google's consent form (UMP) appears at launch where the law requires it. In those regions the menu also shows **Privacy settings**.
- **Tracking (iOS):** after the consent step, Apple's App Tracking Transparency prompt asks once whether ads may be personalized (`askToTrack` in `js/ads.js`). The App Store privacy label declares tracking for Device ID and Advertising Data, so this prompt must stay.
- **IDs:** the AdMob app IDs are in `android/app/src/main/res/values/strings.xml` (`admob_app_id`) and `ios/App/App/Info.plist` (`GADApplicationIdentifier`). The interstitial ad unit IDs are in `INTERSTITIAL` in `js/ads.js`. Clear an ad unit ID there to get Google's demo ads on that platform.
- **Privacy policy:** `privacy.html`, published at https://allendev1.github.io/chain-shift/privacy.html. The menu links to it. Use this URL in AdMob, Play Console and App Store Connect, and update the page if the apps start collecting anything new.
- **Support page:** `support.html`, published at https://allendev1.github.io/chain-shift/support.html. Players reach support at info@thebrilliantideas.com. Use this URL as the App Store support URL.
- **Testing:** these are live ads. Register your phones under AdMob → Settings → Test devices before tapping any of them. Simulators and emulators get test ads automatically.

### Ratings

The apps ask for a store rating with the native prompt, through [`@capacitor-community/in-app-review`](https://github.com/capacitor-community/in-app-review). All the logic is in `js/review.js`. It only asks after at least 8 solves on at least 2 different days, right after a 3-star solve with no hints, when the player taps Next. It never asks in the same break as an ad, and asks at most once every 120 days and 3 times ever. The menu's **Rate Chain Shift** link opens the store's review page; on iOS it uses `APP_STORE_ID` in the same file.

App icons and splash screens are generated from `assets/` with `npx @capacitor/assets generate --ios --android` (background `#0f1020`).

### Store screenshots and videos

`npm run store-assets` builds every App Store and Google Play asset into `store-assets/`, which git ignores. It needs Google Chrome and ffmpeg and takes about four minutes. Add `-- stills` to skip the videos.

- **Screenshots** come from the real game, driven in headless Chrome on a frame-exact clock (`tools/store/harness.mjs`). Puzzles are solved with the game's own solver.
- **Hero art and videos** (the App Store header and search results images, the Play feature graphic and the promo video) use the board film in `tools/store/film.js`, drawn by the game's renderer at full resolution. `tools/store/compose.html` lays them out.

Edit captions in `SHOTS` in `tools/store/make.mjs`, and taglines in `compose.html`.

## Layout

```
index.html, css/style.css   UI shell
js/engine.js     rules, simulation, preview, BFS solver (pure; runs in Node too)
js/codec.js      board ⇄ challenge code
js/generator.js  seeded generation: Daily one-move puzzles, multi-move puzzles
js/levels.js     campaign and chapters (generated, do not edit by hand)
js/difficulty.js measures a puzzle and rates it easy / medium / hard / expert
js/render.js     canvas drawing, shared by the game and the share card
js/animate.js    plays back simulation events as motion
js/share.js      share-card PNG and Web Share / download fallback
js/icons.js      inline SVG icons (UI + tiles that match the board art)
js/review.js     when to ask for a store rating
js/main.js       game flow, input, sheets, editor
tools/make-levels.mjs   regenerates js/levels.js (about 2 minutes, one worker per core)
tools/serve.mjs         local static server
```

### How puzzles are generated

The target is just a floor marker and has no effect on how pieces move. So the generator first builds a board **without** a target, simulates every possible move, and finds the cells where the cube can come to rest. It then puts the target on a cell that exactly one move reaches. For multi-move puzzles, a breadth-first search finds the first depth at which the cube can stop on each cell, and that depth becomes the par.

One design consequence: **without arrows, every chain runs along a single straight line**, because momentum keeps its direction. Long one-move chains need arrows, so the campaign uses arrow-free boards for multi-move setup puzzles and saves the one-move showpieces for after arrows are introduced.

### Difficulty

Par alone is a poor measure of difficulty. Long puzzles often allow several move orders, so a par-6 puzzle where many first moves work can be easier than a par-4 puzzle with a single way in. `js/difficulty.js` therefore measures each puzzle:

- **Multi-move puzzles:** par, adjusted by how many first moves still allow an optimal solve. Only one good first move makes a puzzle a step harder; four or more make it a step easier.
- **One-move puzzles:** the number of pieces the winning chain sets moving, plus a step up when many other moves also shove the cube around.

Each campaign level in `tools/make-levels.mjs` names the tier it should be. The script generates candidates, keeps only those that measure at that tier, and picks the one whose solution has the most chain reaction. Seeds come from the level's name, so adding or reordering levels leaves the others unchanged. The first three levels of chapters 1–4 are the original 1.0 levels, kept as they were. Progress is saved per puzzle code, and 1.0 saves (which used level positions) are migrated on load. The tests re-measure every level and fail if one no longer matches its tier.
