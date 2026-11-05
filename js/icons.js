// Inline SVG icons. UI icons use currentColor; tile icons mirror the board art (render.js)
// so the editor palette and the help sheet look exactly like the pieces on the board.

const svg = (body, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

const stroke = (d) =>
  svg(`<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</g>`);

export const UI = {
  menu: stroke('<path d="M4 7h16M4 12h11M4 17h16"/>'),
  help: stroke('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.4a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><path d="M12 17.6h.01"/>'),
  undo: stroke('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  reset: stroke('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>'),
  hint: stroke('<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7v.5h6V16c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z"/>'),
  share: stroke('<path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M16 6.5 12 2.5 8 6.5"/><path d="M12 2.5V15"/>'),
  play: stroke('<path d="M7 4.5v15l12-7.5z"/>'),
  check: stroke('<path d="M4.5 12.5l5 5 10-11"/>'),
  clear: stroke('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  back: stroke('<path d="M15 5l-7 7 7 7"/>'),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>'),
  next: stroke('<path d="M9 5l7 7-7 7"/>'),
  calendar: stroke('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  grid: stroke('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  endless: stroke('<path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z"/>'),
  edit: stroke('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  code: stroke('<path d="M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16"/>'),
};

// Filled star; colour comes from CSS (.star.on / .star).
export const STAR = svg('<path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>', 'star');
export const stars = (n, of = 3) =>
  Array.from({ length: of }, (_, i) => STAR.replace('class="star"', `class="star${i < n ? ' on' : ''}"`)).join('');

// Board colours, kept in step with COLORS in render.js.
const C = { tile: '#e6ddcc', blue: '#3f6fe0', blueSide: '#2d50a1', red: '#f0532f', redSide: '#a83a21', stone: '#bcae96', stoneSide: '#9c8d75', arrow: '#a6977e', pit: '#1c1714', pitRim: '#7a6a58', pink: '#de6fa1', pinkSide: '#a05074' };

const slab = (top, side, x = 3, w = 18) =>
  `<rect x="${x}" y="3" width="${w}" height="18" rx="4.5" fill="${side}"/><rect x="${x}" y="3" width="${w}" height="15.5" rx="4.5" fill="${top}"/>`;

const chevrons = (rot) =>
  `<g transform="rotate(${rot} 12 12)" fill="none" stroke="${C.arrow}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5l5-5 5 5"/><path d="M7 17.5l5-5 5 5"/></g>`;

export const TILES = {
  block: svg(slab(C.blue, C.blueSide), 'tile'),
  cube: svg(`${slab(C.red, C.redSide)}<circle cx="12" cy="10.75" r="4.3" fill="none" stroke="#fff7ef" stroke-width="1.9"/><circle cx="12" cy="10.75" r="1.2" fill="#fff7ef"/>`, 'tile'),
  target: svg(`<rect x="3" y="3" width="18" height="18" rx="4.5" fill="${C.tile}"/><circle cx="12" cy="12" r="6.6" fill="${C.red}" opacity=".14"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="${C.red}" stroke-width="2"/><circle cx="12" cy="12" r="1.2" fill="${C.red}"/>`, 'tile'),
  wall: svg(`${slab(C.stone, C.stoneSide)}<g fill="${C.stoneSide}"><circle cx="7.5" cy="7.5" r="1"/><circle cx="16.5" cy="7.5" r="1"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/></g>`, 'tile'),
  pit: svg(`<rect x="3" y="3" width="18" height="18" rx="4.5" fill="${C.tile}"/><rect x="5" y="5" width="14" height="14" rx="4.5" fill="${C.pitRim}"/><path d="M5 9.5h14v5A4.5 4.5 0 0 1 14.5 19h-5A4.5 4.5 0 0 1 5 14.5z" fill="${C.pit}"/>`, 'tile'),
  up: svg(chevrons(0), 'tile'),
  right: svg(chevrons(90), 'tile'),
  down: svg(chevrons(180), 'tile'),
  left: svg(chevrons(270), 'tile'),
  erase: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h12"/><path d="M4.6 15.4l9.2-9.2a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L10 18H7.2z"/><path d="M9.5 10.5l4 4"/></g>', 'tile'),
  hit: svg(`${slab(C.blue, C.blueSide, 1.5, 9.5)}${slab(C.pink, C.pinkSide, 13, 9.5)}<path d="M12 3.5v17" stroke="#1e1b26" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="0.1 3"/>`, 'tile'),
};

// The home-screen logo: a block knocking a row of tiles into the cube.
export const LOGO = `<svg class="logo" viewBox="0 0 120 32" aria-hidden="true" focusable="false">
  <g transform="translate(0 2)">${[['#3f6fe0', '#2d50a1'], ['#ebb23a', '#a9802a'], ['#2ea37c', '#217559']]
    .map(([t, s], i) => `<g transform="translate(${i * 26} 0)"><rect width="22" height="26" rx="6" fill="${s}"/><rect width="22" height="22" rx="6" fill="${t}"/></g>`).join('')}
  <g transform="translate(86 0)"><rect width="26" height="26" rx="6" fill="#a83a21"/><rect width="26" height="22" rx="6" fill="#f0532f"/><circle cx="13" cy="11" r="5.4" fill="none" stroke="#fff7ef" stroke-width="2.4"/><circle cx="13" cy="11" r="1.6" fill="#fff7ef"/></g></g>
</svg>`;
