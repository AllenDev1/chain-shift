// Inline SVG icons. UI icons use currentColor; tool icons mirror the board art so the
// editor palette and the help sheet look exactly like the pieces on the board.

const svg = (body, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

const stroke = (d) =>
  svg(`<g fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${d}</g>`);

export const UI = {
  menu: stroke('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  help: stroke('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.4a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4"/><path d="M12 17.6h.01"/>'),
  undo: stroke('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  reset: stroke('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/>'),
  hint: stroke('<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.5.4.8 1 .8 1.7v.5h6V16c0-.7.3-1.3.8-1.7A6.5 6.5 0 0 0 12 2.5z"/>'),
  share: stroke('<path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="M16 6.5 12 2.5 8 6.5"/><path d="M12 2.5V15"/>'),
  play: stroke('<path d="M7 4.5v15l12-7.5z"/>'),
  check: stroke('<path d="M4.5 12.5l5 5 10-11"/>'),
  clear: stroke('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  back: stroke('<path d="M15 5l-7 7 7 7"/>'),
};

const chevrons = (rot) =>
  `<g transform="rotate(${rot} 12 12)" fill="none" stroke="#7b80ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 12.5l5-5 5 5"/><path d="M7 17.5l5-5 5 5"/></g>`;

export const TILES = {
  block: svg('<rect x="3" y="3" width="18" height="18" rx="5" fill="#ff7a59"/><rect x="5.5" y="5" width="13" height="5" rx="2.5" fill="#fff" opacity=".25"/>', 'tile'),
  // No <defs> gradients here: these SVGs appear several times (one copy inside the hidden
  // editor bar), and a gradient defined in a display:none subtree renders as nothing.
  cube: svg('<rect x="4.5" y="4.5" width="15" height="15" rx="3.5" fill="#5ef2ff"/><path d="M4.5 12V8a3.5 3.5 0 0 1 3.5-3.5h4z" fill="#fff" opacity=".55"/><path d="M12 8l4 4-4 4-4-4z" fill="none" stroke="#fff" stroke-width="1.4"/>', 'tile tile-cube'),
  target: svg('<rect x="5" y="5" width="14" height="14" rx="3.5" fill="none" stroke="#5ef2ff" stroke-width="2.2"/>', 'tile'),
  wall: svg('<rect x="3" y="3" width="18" height="18" rx="4" fill="#3d4178"/><rect x="3" y="3" width="18" height="15" rx="4" fill="#555aa3"/><path d="M3 15l9-9M8 18l12-12M14 18l6-6" stroke="#fff" stroke-opacity=".14" stroke-width="1.6"/>', 'tile'),
  pit: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="6" fill="#2a2c5a"/><rect x="5.5" y="5.5" width="13" height="13" rx="5" fill="#0b0b1c"/><rect x="8" y="8" width="8" height="8" rx="4" fill="#05050c"/>', 'tile'),
  up: svg(chevrons(0), 'tile'),
  right: svg(chevrons(90), 'tile'),
  down: svg(chevrons(180), 'tile'),
  left: svg(chevrons(270), 'tile'),
  erase: svg('<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 20h12"/><path d="M4.6 15.4l9.2-9.2a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L10 18H7.2z"/><path d="M9.5 10.5l4 4"/></g>', 'tile'),
  hit: svg('<rect x="2" y="6" width="9" height="12" rx="3" fill="#ffc145"/><rect x="13" y="6" width="9" height="12" rx="3" fill="#ff5d8f"/><path d="M12 4v16" stroke="#ffd166" stroke-width="1.4" stroke-dasharray="2 2"/>', 'tile'),
};
