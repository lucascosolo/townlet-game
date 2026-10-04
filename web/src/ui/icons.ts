// Small inline SVG icons for the HUD and dock (review: emoji and arrow glyphs read as prototype).
// Stroke-drawn at 20px, currentColor, so they follow the button's text colour.

const svg = (body: string, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>'),
  play: svg('<path d="M7 5v14l11-7z" fill="currentColor" stroke="none"/>'),
  fast: svg('<path d="M4 6v12l8-6zM12 6v12l8-6z" fill="currentColor" stroke="none"/>'),
  faster: svg('<path d="M2 6v12l6.5-6zM8.5 6v12L15 12zM15 6v12l6.5-6z" fill="currentColor" stroke="none"/>'),
  fastest: svg('<path d="M2 6v12l6.5-6zM8.5 6v12L15 12zM15 6v12l6.5-6z" fill="currentColor" stroke="none"/><path d="M21.5 5v14"/>'),
  turnLeft: svg('<path d="M4 9a8 8 0 1 1 1.7 7.5"/><path d="M4 4v5h5"/>'),
  turnRight: svg('<path d="M20 9a8 8 0 1 0-1.7 7.5"/><path d="M20 4v5h-5"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.2" r="0.6" fill="currentColor"/>'),
  wheat: svg('<path d="M12 21V9"/><path d="M12 9c-3-1-4-4-3.5-6 2 .5 4 2.5 3.5 6zM12 9c3-1 4-4 3.5-6-2 .5-4 2.5-3.5 6z"/><path d="M12 14c-3-.5-4.5-3-4.5-5 2.2 0 4.5 2 4.5 5zM12 14c3-.5 4.5-3 4.5-5-2.2 0-4.5 2-4.5 5z"/>', 20),
  // Two stacked logs with end-grain rings (review: the old icon read as a battery).
  log: svg('<rect x="3" y="5" width="17" height="6" rx="3"/><circle cx="6" cy="8" r="1.3"/><rect x="5" y="13" width="17" height="6" rx="3"/><circle cx="8" cy="16" r="1.3"/>', 20),
  // A tied grain sack, for the granary's stores.
  sack: svg('<path d="M9 4h6l-1.5 3c3.5 1.5 5.5 5 5.5 8.5 0 3-2 4.5-7 4.5s-7-1.5-7-4.5C5 12 7 8.5 10.5 7z"/><path d="M10.5 7h3"/>', 20),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 18),
  cloud: svg('<path d="M7 18h10a4 4 0 0 0 .5-8 6 6 0 0 0-11.3 1.5A3.3 3.3 0 0 0 7 18z"/><path d="M9 21l1-2M13 21l1-2" />', 18),
  moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>', 18),
  look: svg('<path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor" stroke="none"/>', 16),
  build: svg('<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/>', 16),
  remove: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
};
