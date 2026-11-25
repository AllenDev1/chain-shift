// The share card: a PNG with the starting puzzle, the player's result, and the
// challenge code — everything a friend needs to replay it, no server involved.

import { drawBoard, FONT } from './render.js';
import { formatCode } from './codec.js';
import { shareImage } from './native.js';

const W = 1080, H = 1350;

export function makeShareCard({ state, title, headline, code, link }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1e1b26';
  ctx.font = `900 76px ${FONT}`;
  ctx.letterSpacing = '-2px';
  ctx.fillText('Chain Shift', W / 2, 116);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#8f8798';
  ctx.font = `700 30px ${FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(title.toUpperCase(), W / 2, 170);
  ctx.letterSpacing = '0px';

  // The tray's edge and contact shadow, as the game draws them in CSS.
  ctx.save();
  ctx.translate(90, 210);
  ctx.shadowColor = 'rgba(80, 60, 30, 0.3)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#c2b59d';
  ctx.beginPath();
  ctx.roundRect(0, 14, 900, 900, 45);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(90, 210);
  drawBoard(ctx, 900, { state, time: 0, still: true });
  ctx.restore();

  ctx.fillStyle = '#1e1b26';
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(headline, W / 2, 1194);
  ctx.fillStyle = '#f0532f';
  ctx.font = '700 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(formatCode(code), W / 2, 1254);
  if (link) {
    ctx.fillStyle = '#8f8798';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(link.replace(/^https?:\/\//, '').replace(/#.*$/, ''), W / 2, 1306);
  }
  return canvas;
}

// Share via the OS sheet when it accepts images; otherwise download the PNG and copy the
// link. Returns a short status message for the UI.
export async function shareResult(card, { text, link, filename = 'chain-shift.png' }) {
  const message = link ? `${text}\n${link}` : text;

  // In the app there's no download fallback: if the sheet fails, copy the link instead.
  if (shareImage) {
    try {
      const base64 = card.toDataURL('image/png').split(',')[1];
      return (await shareImage({ base64, filename, text: message })) ? 'Shared!' : '';
    } catch {
      try {
        await navigator.clipboard.writeText(message);
        return 'Couldn’t open sharing. Challenge link copied.';
      } catch {
        return 'Couldn’t open sharing.';
      }
    }
  }

  const blob = await new Promise((resolve) => card.toBlob(resolve, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });

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
