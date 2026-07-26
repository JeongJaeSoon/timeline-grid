// node --test timeline.test.mjs
// Every expected value here is a pixel measurement taken from the source carousel
// (instagram.com/p/Daz6IEyEpT5). Touch the layout constants and these break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEC, FONTS, CAPTION_FONT, canvasSize, cellRect, paginate, formatStamp,
  measureCaptionFont, drawCaption, previewWidth,
} from './timeline.js';

const W = SPEC.ref; // 3077 — the width the source was measured at
const near = (actual, expected, tol, what) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (±${tol})`);

// Node has no canvas, so replay the readings a real one gave for Tinos while the layout was
// being derived: the reference caption at 48px has an ink box of 473x45, with actualBoundingBox
// ascent 0.694em and descent 0.217em. Everything below runs the same measure -> derive -> draw
// chain the browser runs, rather than trusting a stored constant.
const fakeCtx = (inkW48, ascentEm, descentEm) => ({
  font: '',
  measureText() {
    const px = parseFloat(this.font);
    return {
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: (inkW48 / 48) * px,
      actualBoundingBoxAscent: ascentEm * px,
      actualBoundingBoxDescent: descentEm * px,
    };
  },
});
const TINOS = measureCaptionFont(fakeCtx(473, 0.694, 0.217), CAPTION_FONT);

test('canvas matches the source dimensions', () => {
  assert.deepEqual(canvasSize(W), { w: 3077, h: 4096 });
});

// The preview canvas is stretched to its container by CSS, so its bitmap has to be the device
// pixels it lands on. The CSS widths below were measured in Chrome: 962 at the 1040px .wrap cap,
// 622 in a 700px window, 313 on a 375px phone.
test('preview bitmaps come out at one device pixel each', () => {
  assert.equal(previewWidth(962, 2), 1924);
  assert.equal(previewWidth(622, 2), 1244);
  assert.equal(previewWidth(313, 3), 939);
  assert.equal(previewWidth(962), 962, 'no ratio given means CSS pixels');
  // Never bigger than the export it stands in for, never zero for a container that measures none.
  assert.equal(previewWidth(962, 4), SPEC.ref);
  assert.equal(previewWidth(0, 2), 320);
  assert.equal(previewWidth(NaN, 2), 320);
});

test('photo cells reproduce the measured grid', () => {
  const rowTop = [0, 1347, 2695]; // measured
  const colCenter = [769.25, 2307.75]; // measured 768.5 / 2307
  for (let i = 0; i < 6; i++) {
    const r = cellRect(i, W);
    near(r.y, rowTop[Math.floor(i / 2)], 2, `row${Math.floor(i / 2)} top`);
    near(r.h, 1032, 2, 'photo height');
    near(r.w, 1538.5, 0.5, 'cell width');
    near(r.colCenterX, colCenter[i % 2], 1, 'column center');
  }
  // Zero gutter: the left cell's right edge is the right cell's left edge.
  assert.equal(cellRect(0, W).x + cellRect(0, W).w, cellRect(1, W).x);
});

test('caption center sits 161px below the photo', () => {
  const capCenter = [1192.5, 2540.5, 3887.5]; // measured
  for (let i = 0; i < 6; i++) {
    near(cellRect(i, W).capCenterY, capCenter[Math.floor(i / 2)], 2, 'caption center');
  }
});

// Normalising on ink width is what lets any face stand in for Tinos: the source's own caption
// is scaled until its ink is as wide as the source's 445px. For Tinos that lands back on the
// 45px the layout was originally fixed at.
test('font size is derived from the measured face, not stored', () => {
  near(TINOS.fontSize * W, 45, 0.3, 'derived px size');
  near(TINOS.ascent, 0.694, 1e-9, 'ascent');
  near(TINOS.descent, 0.217, 1e-9, 'descent');
  assert.equal(TINOS.stack, CAPTION_FONT);
  // A face whose glyphs are 20% wider per em has to come out 20% smaller.
  const wide = measureCaptionFont(fakeCtx(473 * 1.2, 0.694, 0.217), 'Wide');
  near(wide.fontSize, TINOS.fontSize / 1.2, 1e-12, 'wide face size');
});

// drawCaption solves backwards for the baseline to center the ink band.
// Get this wrong and every caption shifts.
function capturedBand(lines, cy, font = TINOS) {
  const drawn = [];
  const ctx = { fillText: (t, x, y) => drawn.push(y) };
  drawCaption(ctx, lines, 0, cy, W, font);
  const fs = font.fontSize * W;
  return { top: drawn[0] - font.ascent * fs, bottom: drawn.at(-1) + font.descent * fs };
}

test('single-line caption reproduces the measured band 1172-1213', () => {
  const b = capturedBand(['04:56, Thursday, July 09'], 1192.5);
  near(b.top, 1172, 2, 'band top');
  near(b.bottom, 1213, 2, 'band bottom');
});

test('two-line caption reproduces the measured band 2495-2587', () => {
  const b = capturedBand(['13:31, Thursday, July 09', 'Sheung Wan, Hong Kong'], 2540.5);
  near(b.top, 2495, 2, 'band top');
  near(b.bottom, 2587, 2, 'band bottom');
});

// The invariant that makes swapping fonts safe. Nothing about the source is assumed: whatever
// ascent, descent and size a face measures, the ink band's center must land on cy.
test('the ink band stays centered for any face', () => {
  const faces = [
    TINOS,
    { stack: 'Tall', ascent: 0.92, descent: 0.04, fontSize: 62 / W }, // barely any descender
    { stack: 'Deep', ascent: 0.55, descent: 0.45, fontSize: 28 / W },
    { stack: 'Hangul', ascent: 0.88, descent: 0.12, fontSize: 51 / W },
  ];
  for (const font of faces) {
    for (const lines of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
      const b = capturedBand(lines, 1192.5, font);
      near((b.top + b.bottom) / 2, 1192.5, 1e-9, `${font.stack} center, ${lines.length} lines`);
    }
  }
});

// What stays constant between two lines is the clear air, not the pitch — a face with taller
// ink gets more pitch rather than losing its gap. For Tinos that lands back on the source's
// measured 50px.
test('line pitch tracks the face and reproduces the measured 50px', () => {
  const pitch = (font) => {
    const drawn = [];
    drawCaption({ fillText: (t, x, y) => drawn.push(y) }, ['a', 'b'], 0, 0, W, font);
    return drawn[1] - drawn[0];
  };
  assert.ok(SPEC.lineGap > 0, 'lines need clear air between them');
  near(pitch(TINOS), 50, 0.3, 'Tinos line pitch');
  const fs = TINOS.fontSize * W;
  near(pitch(TINOS) - (TINOS.ascent + TINOS.descent) * fs, SPEC.lineGap * fs, 1e-9, 'Tinos gap');
  const tall = { ...TINOS, ascent: 0.9, descent: 0.3 };
  near(pitch(tall) - (1.2 * fs), SPEC.lineGap * fs, 1e-9, 'gap holds for taller ink');
});

test('font lineup', () => {
  assert.equal(FONTS[0].family, 'Tinos', 'the default has to stay the source font');
  assert.equal(FONTS[0].stack, CAPTION_FONT);
  for (const f of FONTS) {
    assert.ok(f.label, `${f.family} label`);
    assert.ok(f.stack.includes(`"${f.family}"`), `${f.family} stack`);
    // Tinos is linked statically in index.html; every other face is fetched when picked.
    assert.equal(f.css === null, f.family === 'Tinos', `${f.family} stylesheet`);
    if (f.css) assert.ok(f.css.startsWith('https://fonts.googleapis.com/css2?family='), f.family);
  }
  // Verified against the served stylesheets: only these four carry a subset covering U+AC00.
  assert.deepEqual(
    FONTS.filter((f) => f.hangul).map((f) => f.family),
    ['Noto Serif KR', 'Gowun Batang', 'Nanum Myeongjo', 'Noto Sans KR'],
  );
});

test('pages hold six photos each', () => {
  const n = (arr) => arr.map((p) => p.length);
  assert.deepEqual(n(paginate(Array(7).fill(0))), [6, 1]);
  assert.deepEqual(n(paginate(Array(12).fill(0))), [6, 6]);
  assert.deepEqual(paginate([]), []);
});

test('timestamp formatting', () => {
  const d = new Date(2026, 6, 9, 4, 56); // same as the source's first frame: Thu 2026-07-09 04:56 local
  assert.equal(formatStamp(d, 'en-US'), '04:56, Thursday, July 09');
  assert.equal(formatStamp(d, 'ko-KR'), '04:56, 목요일, 7월 09일');
  // Midnight and single-digit hours stay zero-padded.
  assert.equal(formatStamp(new Date(2026, 6, 9, 0, 5), 'en-US'), '00:05, Thursday, July 09');
});
