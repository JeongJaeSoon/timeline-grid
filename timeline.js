// The layout spec below was measured from the source, not eyeballed.
// All 12 carousel images of instagram.com/p/Daz6IEyEpT5 (3077x4096 each) were scanned
// for white rows/columns, and every one of them agreed on:
//   photo row tops   0 / 1347 / 2695   (identical across all 12 -> a fixed template)
//   photo height     1032
//   caption band center   row top + 1193
//   column centers   769.25 / 2307.75  (zero gutter, zero outer margin)
// Lengths are stored as a ratio of the canvas width W, except lineGap, which is a ratio of
// the font size because it has to follow whichever face is drawing the captions.
export const SPEC = {
  ref: 3077, // width the measurements were taken at
  aspect: 4096 / 3077, // canvas height = W * aspect
  cols: 2,
  rows: 3,
  photoH: 1032 / 3077,
  rowPitch: 1347.5 / 3077, // distance between photo row tops
  capCenter: 1193 / 3077, // row top -> vertical center of the caption block
  // Caption size is normalised per font rather than fixed, so any face can stand in for
  // Tinos at the same visual size: the source's own first caption is drawn in the chosen
  // face and scaled until its ink is capInkW wide. The source measures 445x42 for this
  // string; Tinos at 48px measures 473x45, which is where the original 45px came from.
  capRef: '04:56, Thursday, July 09',
  capInkW: 445 / 3077,
  // The source's two-line captions were spaced 50 / 48 / 50 px top-to-top at 45px type, where
  // Tinos's caption ink measures 0.911em tall — 0.200em of clear air between the lines. Stored
  // as that gap rather than as a fixed leading, because ink height varies a lot between faces
  // (0.91em for Tinos, 1.08em for Noto Serif KR) and fixed leading left the latter 1.4px apart.
  // Line pitch is therefore measured ink + this, which reproduces the source's 50px for Tinos.
  lineGap: 0.2,
};

export const PER_PAGE = SPEC.cols * SPEC.rows;

const googleFont = (family) =>
  `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400&display=swap`;

// Captions are regular weight only, so each face is requested at wght@400. `hangul` records
// whether the served stylesheet has a subset covering U+AC00 — the Latin-only faces leave
// Korean captions to a system serif. Hangul families cost 58-98KB of CSS each (Google splits
// Hangul into ~100 unicode-range subsets), so index.html links a face only once it is picked.
// Tinos has no `css` because the page links it statically — the headings use it too.
export const FONTS = [
  { family: 'Tinos', label: 'Tinos — 원본', hangul: false, css: null,
    stack: '"Tinos", "Times New Roman", Times, serif' },
  { family: 'EB Garamond', label: 'EB Garamond', hangul: false, css: googleFont('EB Garamond'),
    stack: '"EB Garamond", "Times New Roman", Times, serif' },
  { family: 'Lora', label: 'Lora', hangul: false, css: googleFont('Lora'),
    stack: '"Lora", "Times New Roman", Times, serif' },
  { family: 'Noto Serif KR', label: '본명조 — Noto Serif KR', hangul: true, css: googleFont('Noto Serif KR'),
    stack: '"Noto Serif KR", serif' },
  { family: 'Gowun Batang', label: '고운바탕 — Gowun Batang', hangul: true, css: googleFont('Gowun Batang'),
    stack: '"Gowun Batang", serif' },
  { family: 'Nanum Myeongjo', label: '나눔명조 — Nanum Myeongjo', hangul: true, css: googleFont('Nanum Myeongjo'),
    stack: '"Nanum Myeongjo", serif' },
  { family: 'Noto Sans KR', label: '본고딕 — Noto Sans KR', hangul: true, css: googleFont('Noto Sans KR'),
    stack: '"Noto Sans KR", sans-serif' },
];

export const CAPTION_FONT = FONTS[0].stack;

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

const PROBE = 100; // arbitrary — every reading below divides it back out

// Reads the face off the canvas instead of carrying a per-font constant table: ink ascent and
// descent as a fraction of em, plus the em size (as a fraction of canvas width) that makes
// SPEC.capRef's ink as wide as the source's. Add a font to FONTS and it self-calibrates.
export function measureCaptionFont(ctx, stack) {
  ctx.font = `${PROBE}px ${stack}`;
  const m = ctx.measureText(SPEC.capRef);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight; // holds for any textAlign
  return {
    stack,
    ascent: m.actualBoundingBoxAscent / PROBE,
    descent: m.actualBoundingBoxDescent / PROBE,
    fontSize: (SPEC.capInkW * PROBE) / inkW,
  };
}

// font: a measureCaptionFont() result.
export function drawCaption(ctx, lines, cx, cy, W, font) {
  const fs = font.fontSize * W;
  const lh = (font.ascent + font.descent + SPEC.lineGap) * fs;
  ctx.font = `${fs}px ${font.stack}`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Band height is (lines-1)*lh + (ascent + descent)*fs, and its center goes on cy.
  // This is the first baseline, i.e. cy - bandHeight/2 + ascent*fs, simplified.
  const band = (lines.length - 1) * lh - (font.ascent - font.descent) * fs;
  let y = cy - band / 2;
  for (const line of lines) {
    ctx.fillText(line, cx, y);
    y += lh;
  }
}

// items: [{ img, stamp, note }] — at most PER_PAGE. Remaining cells stay white.
export function renderPage(canvas, items, W, stack = CAPTION_FONT) {
  const { w, h } = canvasSize(W);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  // Measured on every render rather than cached: measuring before the webfont has loaded
  // reads the fallback face, and a cache would keep serving those numbers forever.
  const font = measureCaptionFont(ctx, stack);
  items.slice(0, PER_PAGE).forEach((it, i) => {
    const r = cellRect(i, W);
    if (it.img) drawCover(ctx, it.img, r.x, r.y, r.w, r.h);
    const lines = [it.stamp, it.note].filter(Boolean);
    if (lines.length) drawCaption(ctx, lines, r.colCenterX, r.capCenterY, W, font);
  });
  return canvas;
}
