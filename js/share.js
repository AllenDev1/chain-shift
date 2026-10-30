// The share card: a PNG with the starting puzzle, the player's result, and the
// challenge code — everything a friend needs to replay it, no server involved.

import { drawBoard } from './render.js';
import { formatCode } from './codec.js';

const W = 1080, H = 1350;

export function makeShareCard({ state, title, headline, code, link }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f1020');
  bg.addColorStop(1, '#1d1440');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 68px system-ui, -apple-system, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillText('CHAIN SHIFT', W / 2, 112);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#a9abd9';
  ctx.font = '500 36px system-ui, -apple-system, sans-serif';
  ctx.fillText(title, W / 2, 168);

  ctx.save();
  ctx.translate(90, 210);
  drawBoard(ctx, 900, { state, time: 0 });
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 46px system-ui, -apple-system, sans-serif';
  ctx.fillText(headline, W / 2, 1180);
  ctx.fillStyle = '#5ef2ff';
  ctx.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatCode(code), W / 2, 1244);
  if (link) {
    ctx.fillStyle = '#8a8cc0';
    ctx.font = '400 28px system-ui, -apple-system, sans-serif';
    ctx.fillText(link.replace(/^https?:\/\//, '').replace(/#.*$/, ''), W / 2, 1298);
  }
  return canvas;
}

// Share via the OS sheet when it accepts images; otherwise download the PNG and copy the
// link. Returns a short status message for the UI.
export async function shareResult(card, { text, link, filename = 'chain-shift.png' }) {
  const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  const message = link ? `${text}\n${link}` : text;

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: message, title: 'Chain Shift' });
      return 'Shared!';
    } catch (err) {
      if (err.name === 'AbortError') return '';
    }
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try {
    await navigator.clipboard.writeText(message);
    return 'Image saved and challenge link copied.';
  } catch {
    return 'Image saved.';
  }
}
