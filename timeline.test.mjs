// node --test timeline.test.mjs
// Every expected value here is a pixel measurement taken from the source carousel
// (instagram.com/p/Daz6IEyEpT5). Touch the layout constants and these break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEC, canvasSize, cellRect, paginate, formatStamp, drawCaption } from './timeline.js';

const W = SPEC.ref; // 3077 — the width the source was measured at
const near = (actual, expected, tol, what) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected} (±${tol})`);

test('canvas matches the source dimensions', () => {
  assert.deepEqual(canvasSize(W), { w: 3077, h: 4096 });
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

// drawCaption solves backwards for the baseline to center the ink band.
// Get this wrong and every caption shifts.
function capturedBand(lines, cy) {
  const drawn = [];
  const ctx = { fillText: (t, x, y) => drawn.push(y) };
  drawCaption(ctx, lines, 0, cy, W);
  const fs = SPEC.fontSize * W;
  return { top: drawn[0] - SPEC.capAscent * fs, bottom: drawn.at(-1) + SPEC.capDescent * fs };
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
