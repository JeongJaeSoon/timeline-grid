// The layout spec below was measured from the source, not eyeballed.
// All 12 carousel images of instagram.com/p/Daz6IEyEpT5 (3077x4096 each) were scanned
// for white rows/columns, and every one of them agreed on:
//   photo row tops   0 / 1347 / 2695   (identical across all 12 -> a fixed template)
//   photo height     1032
//   caption band center   row top + 1193
//   column centers   769.25 / 2307.75  (zero gutter, zero outer margin)
// Every value is stored as a ratio of the canvas width W.
export const SPEC = {
  ref: 3077, // width the measurements were taken at
  aspect: 4096 / 3077, // canvas height = W * aspect
  cols: 2,
  rows: 3,
  photoH: 1032 / 3077,
  rowPitch: 1347.5 / 3077, // distance between photo row tops
  capCenter: 1193 / 3077, // row top -> vertical center of the caption block
  // Font size was matched empirically, not derived from font metric tables. Drawing the
  // source's own caption string in Tinos at 48px gives an ink box of 473x45, while the
  // source measures 445x42 (ratios 0.941 / 0.933) -> 45px.
  fontSize: 45 / 3077,
  lineH: 50 / 3077, // measured top-to-top spacing of two-line captions (50 / 48 / 50)
  // Placing the caption band's center on capCenter means solving backwards for the
  // baseline, which needs these. Values are measureText actualBoundingBox readings
  // for Tinos, as a fraction of em.
  capAscent: 0.694,
  capDescent: 0.217,
};

export const PER_PAGE = SPEC.cols * SPEC.rows;
export const CAPTION_FONT = '"Tinos", "Times New Roman", Times, serif';

export function canvasSize(W) {
  return { w: Math.round(W), h: Math.round(W * SPEC.aspect) };
}

export function cellRect(i, W) {
  const col = i % SPEC.cols;
  const row = Math.floor(i / SPEC.cols);
  const w = W / SPEC.cols;
  const top = row * SPEC.rowPitch * W;
  return {
    x: col * w,
    y: top,
    w,
    h: SPEC.photoH * W,
    colCenterX: col * w + w / 2,
    capCenterY: top + SPEC.capCenter * W,
  };
}

export function paginate(items, per = PER_PAGE) {
  const pages = [];
  for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
  return pages;
}

// "04:56, Thursday, July 09" / "04:56, 목요일, 7월 09일"
export function formatStamp(date, locale = 'en-US') {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: '2-digit' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const day = locale.startsWith('ko') ? `${parts.month} ${parts.day}일` : `${parts.month} ${parts.day}`;
  return `${hh}:${mm}, ${parts.weekday}, ${day}`;
}

// Fill the cell, preserving aspect ratio, cropping from the center (CSS object-fit: cover).
export function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export function drawCaption(ctx, lines, cx, cy, W) {
  const fs = SPEC.fontSize * W;
  const lh = SPEC.lineH * W;
  ctx.font = `${fs}px ${CAPTION_FONT}`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Band height is (lines-1)*lh + (capAscent + capDescent)*fs, and its center goes on cy.
  // This is the first baseline, i.e. cy - bandHeight/2 + capAscent*fs, simplified.
  const band = (lines.length - 1) * lh - (SPEC.capAscent - SPEC.capDescent) * fs;
  let y = cy - band / 2;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lh;
  }
}

// items: [{ img, stamp, note }] — at most PER_PAGE. Remaining cells stay white.
export function renderPage(canvas, items, W) {
  const { w, h } = canvasSize(W);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  items.slice(0, PER_PAGE).forEach((it, i) => {
    const r = cellRect(i, W);
    if (it.img) drawCover(ctx, it.img, r.x, r.y, r.w, r.h);
    const lines = [it.stamp, it.note].filter(Boolean);
    if (lines.length) drawCaption(ctx, lines, r.colCenterX, r.capCenterY, W);
  });
  return canvas;
}
