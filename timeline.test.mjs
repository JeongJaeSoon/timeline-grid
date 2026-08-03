// node --test timeline.test.mjs
// Every expected value here is a pixel measurement taken from the source carousel
// (instagram.com/p/Daz6IEyEpT5). Touch the layout constants and these break.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEC, FONTS, CAPTION_FONT, LAYOUTS, layoutFor, perPage, canvasSize, cellRect, paginate,
  formatStamp, measureCaptionFont, drawCaption, previewWidth, exifDateTime,
  SHARE_W, SERVICES, sharePlan, intentUrl, shareText, skippedNote,
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

// The source measured 2495-2587 for this caption, which is what a 0.2 gap draws. SPEC.lineGap is
// the one number here that is a choice rather than a measurement, so the expectation is written
// against the source anchor plus whatever that choice adds — the band grows symmetrically, half
// the extra gap onto each edge. This still fails if drawCaption's geometry drifts; it does not
// fail merely because the gap was tuned.
const SOURCE_GAP = 0.2;
test('two-line caption sits on the measured band 2495-2587, widened by the chosen line gap', () => {
  const b = capturedBand(['13:31, Thursday, July 09', 'Sheung Wan, Hong Kong'], 2540.5);
  const grew = ((SPEC.lineGap - SOURCE_GAP) * TINOS.fontSize * W) / 2;
  near(b.top, 2495 - grew, 2, 'band top');
  near(b.bottom, 2587 + grew, 2, 'band bottom');
  // and the widening is real: at the source's own gap this is the source's own band.
  assert.ok(SPEC.lineGap >= SOURCE_GAP, 'a gap tighter than the source would crowd Hangul ink');
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
// ink gets more pitch rather than losing its gap. That rule is the thing worth pinning; the gap
// it is fed is a choice. At the source's own 0.2 the rule lands back on the source's 50px, which
// is asserted here directly so the number is not lost when SPEC.lineGap moves.
test('line pitch is measured ink plus the gap, whatever the face and whatever the gap', () => {
  const pitch = (font, gap = SPEC.lineGap) => {
    const drawn = [];
    const original = SPEC.lineGap;
    SPEC.lineGap = gap;
    try {
      drawCaption({ fillText: (t, x, y) => drawn.push(y) }, ['a', 'b'], 0, 0, W, font);
    } finally {
      SPEC.lineGap = original;
    }
    return drawn[1] - drawn[0];
  };
  const fs = TINOS.fontSize * W;
  assert.ok(SPEC.lineGap > 0, 'lines need clear air between them');
  // The source: 45px Tinos, ink 0.911em, 50px top-to-top. Fed its own gap, the rule reproduces it.
  near(pitch(TINOS, SOURCE_GAP), 50, 0.3, "Tinos line pitch at the source's own gap");
  // And the rule holds for the gap actually in use, and for any ink height.
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

test('4-column layout runs 2 rows, not 3 — 8 photos a page', () => {
  assert.deepEqual(layoutFor(4), { cols: 4, rows: 2 });
  assert.equal(perPage(4), 8);
  const n = (arr) => arr.map((p) => p.length);
  assert.deepEqual(n(paginate(Array(9).fill(0), perPage(4))), [8, 1]);
});

test('an unknown column count falls back to the default 2-column layout', () => {
  assert.deepEqual(layoutFor(3), layoutFor(2));
});

test('canvas height scales with row count, keeping the same per-row pitch and tail', () => {
  // 2 rows of the same pitch as the 3-row source, minus one row's worth of height.
  const twoRow = canvasSize(W, 2);
  const threeRow = canvasSize(W);
  near(threeRow.h - twoRow.h, SPEC.rowPitch * W, 1, 'one row of height');
});

test('4-column cells sit side by side at the same row pitch as 2-column', () => {
  const rows = layoutFor(4).rows;
  assert.equal(rows, 2);
  for (let i = 0; i < 8; i++) {
    const r = cellRect(i, W, 4);
    const row = Math.floor(i / 4);
    near(r.y, row * SPEC.rowPitch * W, 1, `row ${row} top`);
    near(r.w, W / 4, 0.5, 'cell width');
  }
  // Zero gutter across all four columns, same as the 2-column grid.
  for (let col = 0; col < 3; col++) {
    assert.equal(cellRect(col, W, 4).x + cellRect(col, W, 4).w, cellRect(col + 1, W, 4).x);
  }
});

test('layout lineup includes 1, 2, and 4 columns, none dropped', () => {
  assert.deepEqual(LAYOUTS.map((l) => l.cols).sort(), [1, 2, 4]);
});

test('timestamp formatting', () => {
  const d = new Date(2026, 6, 9, 4, 56); // same as the source's first frame: Thu 2026-07-09 04:56 local
  assert.equal(formatStamp(d, 'en-US'), '04:56, Thursday, July 09');
  assert.equal(formatStamp(d, 'ko-KR'), '04:56, 목요일, 7월 09일');
  // Midnight and single-digit hours stay zero-padded.
  assert.equal(formatStamp(new Date(2026, 6, 9, 0, 5), 'en-US'), '00:05, Thursday, July 09');
});

/* ---------- EXIF capture time ---------- */

// The JPEGs below are assembled byte by byte instead of committed as photos. A binary fixture
// hides every offset the parser depends on, and the cases that matter most — big-endian, a
// truncated head, a missing tag — are the ones no camera on hand produces.

const be16 = (n) => [(n >> 8) & 255, n & 255];
const le16 = (n) => [n & 255, (n >> 8) & 255];
const le32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const chars = (s) => [...s].map((c) => c.charCodeAt(0));

// A JPEG segment: 0xFF, marker, then a big-endian length that counts its own two bytes.
const segment = (marker, payload) => [0xff, marker, ...be16(payload.length + 2), ...payload];
const exifApp1 = (tiff) => segment(0xe1, [...chars('Exif'), 0, 0, ...tiff]);
const jfifApp0 = segment(0xe0, [...chars('JFIF'), 0, 1, 2, 0, 0, 1, 0, 1, 0, 0]);
const xmpApp1 = segment(0xe1, [...chars('http://ns.adobe.com/xap/1.0/'), 0, ...chars('<x/>')]);
// SOI, the given segments, then SOS and two bytes standing in for the pixel data.
const jpeg = (...segments) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), ...segment(0xda, [1, 0]), 0x7f, 0x7f, 0xff, 0xd9]);

// A TIFF block: header, IFD0, an optional ExifIFD right behind it, then a heap for the values too
// long for an entry's four-byte slot. Every offset in it is relative to the block's own start.
// Tag values are written as LONG when given as a number, NUL-terminated ASCII when given as a string.
function tiffBlock({ le = true, ifd0 = {}, exif = null } = {}) {
  const u16 = (n) => (le ? [n & 255, (n >> 8) & 255] : be16(n));
  const u32 = (n) => {
    const b = [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    return le ? b : b.reverse();
  };
  const num = (o) => Object.entries(o).map(([tag, val]) => [Number(tag), val]);
  const entries0 = num(ifd0);
  const entriesE = exif && num(exif);
  const exifAt = 8 + 2 + 12 * (entries0.length + (entriesE ? 1 : 0)) + 4; // IFD0 is at 8, ExifIFD follows
  let heapAt = exifAt + (entriesE ? 2 + 12 * entriesE.length + 4 : 0);
  const heap = [];

  const entry = ([tag, val]) => {
    if (typeof val === 'number') return [...u16(tag), ...u16(4), ...u32(1), ...u32(val)]; // LONG, inline
    const s = [...chars(val), 0];
    const at = heapAt;
    heap.push(...s);
    heapAt += s.length;
    return [...u16(tag), ...u16(2), ...u32(s.length), ...u32(at)]; // ASCII, on the heap
  };

  if (entriesE) entries0.push([0x8769, exifAt]); // the ExifIFD pointer
  const ifd = (es) => [...u16(es.length), ...es.flatMap(entry), ...u32(0)];
  const ifd0Bytes = ifd(entries0);
  const exifBytes = entriesE ? ifd(entriesE) : [];
  return [
    ...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(0x2a), ...u32(8),
    ...ifd0Bytes, ...exifBytes, ...heap,
  ];
}

const ORIGINAL = 0x9003;
const DIGITIZED = 0x9004;
const IFD0_DATE = 0x0132;
const shot = (opts) => jpeg(jfifApp0, exifApp1(tiffBlock(opts)));
const SOURCE_FIRST_FRAME = new Date(2026, 6, 9, 4, 56, 0);

test('capture time comes out of a little-endian EXIF block', () => {
  assert.deepEqual(exifDateTime(shot({ exif: { [ORIGINAL]: '2026:07:09 04:56:00' } })), SOURCE_FIRST_FRAME);
});

test('big-endian EXIF reads the same', () => {
  const file = shot({ le: false, exif: { [ORIGINAL]: '2026:07:09 13:31:07' } });
  assert.deepEqual(exifDateTime(file), new Date(2026, 6, 9, 13, 31, 7));
});

test('DateTimeOriginal wins, then Digitized, then IFD0 DateTime', () => {
  const ifd0 = { [IFD0_DATE]: '2020:01:01 08:00:00' };
  const dig = { [DIGITIZED]: '2024:02:02 02:02:02' };
  assert.deepEqual(
    exifDateTime(shot({ ifd0, exif: { [ORIGINAL]: '2026:07:09 04:56:00', ...dig } })),
    SOURCE_FIRST_FRAME, 'the shutter time outranks both',
  );
  assert.deepEqual(exifDateTime(shot({ ifd0, exif: dig })), new Date(2024, 1, 2, 2, 2, 2), 'digitized');
  assert.deepEqual(exifDateTime(shot({ ifd0, exif: {} })), new Date(2020, 0, 1, 8), 'empty ExifIFD');
  assert.deepEqual(exifDateTime(shot({ ifd0 })), new Date(2020, 0, 1, 8), 'no ExifIFD at all');
});

test('a non-EXIF APP1 does not stop the walk', () => {
  // Anything that has been through Photoshop carries XMP in an APP1 of its own, ahead of the EXIF one.
  const file = jpeg(jfifApp0, xmpApp1, exifApp1(tiffBlock({ exif: { [ORIGINAL]: '2026:07:09 04:56:00' } })));
  assert.deepEqual(exifDateTime(file), SOURCE_FIRST_FRAME);
});

test('other tags are walked past, and only a date can come back', () => {
  // A phone writes dozens of tags, GPS among them. Nothing but the stamp is parsed — and the
  // OffsetTimeOriginal here is ignored on purpose: 04:56 is what the camera showed, so 04:56 local
  // is what the caption says, wherever the collage is being made.
  const file = shot({
    ifd0: { 0x010f: 'Apple', 0x0110: 'iPhone 15 Pro', 0x8825: 0x1000 }, // Make, Model, GPS pointer
    exif: { [ORIGINAL]: '2026:07:09 04:56:00', 0x9011: '+09:00', 0x9291: '742' },
  });
  assert.deepEqual(exifDateTime(file), SOURCE_FIRST_FRAME);
});

test('nothing to read means null, never a throw', () => {
  const cases = {
    'no EXIF segment': jpeg(jfifApp0),
    'EXIF carrying no date tag': shot({ exif: {} }),
    'HEIC — EXIF lives in an ISOBMFF item, out of scope': new Uint8Array(
      [0, 0, 0, 0x18, ...chars('ftypheic'), 0, 0, 0, 0, ...chars('heicmif1')],
    ),
    PNG: new Uint8Array([0x89, ...chars('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
    empty: new Uint8Array(0),
    'garbage behind the SOI': new Uint8Array([0xff, 0xd8, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]),
    'not an image at all': new Uint8Array(chars('this file is a grocery list')),
    'bogus byte order': jpeg(jfifApp0, exifApp1([0x58, 0x58, 0, 0x2a, 0, 0, 0, 8])),
    'bogus TIFF magic': jpeg(jfifApp0, exifApp1([0x49, 0x49, 0x99, 0x99, 8, 0, 0, 0])),
  };
  for (const [what, bytes] of Object.entries(cases)) assert.equal(exifDateTime(bytes), null, what);
});

test('a truncated head falls through instead of throwing', () => {
  // index.html hands over the first 128KB, so a small photo arrives whole and a big one does not.
  // subarray keeps the original buffer behind it — a parser that ignored the view's length would
  // read past the cut and pass this by accident.
  const file = shot({ exif: { [ORIGINAL]: '2026:07:09 04:56:00' } });
  for (let n = 0; n <= file.length; n++) {
    const got = exifDateTime(file.subarray(0, n));
    assert.ok(got === null || Number(got) === Number(SOURCE_FIRST_FRAME), `cut at ${n}: ${got}`);
  }
  assert.deepEqual(exifDateTime(file.subarray(0)), SOURCE_FIRST_FRAME, 'the whole head still reads');
});

test('a corrupted byte never throws and never invents a date', () => {
  const file = shot({ exif: { [ORIGINAL]: '2026:07:09 04:56:00' } });
  for (let i = 0; i < file.length; i++) {
    for (const bit of [0x01, 0x80, 0xff]) {
      const bad = Uint8Array.from(file);
      bad[i] ^= bit;
      const got = exifDateTime(bad);
      assert.ok(got === null || (got instanceof Date && !Number.isNaN(Number(got))),
        `byte ${i} ^ 0x${bit.toString(16)} gave ${got}`);
    }
  }
});

test('impossible and blank stamps fall back rather than inventing a date', () => {
  for (const stamp of [
    '0000:00:00 00:00:00', // how a blank field is conventionally written
    '    :  :     :  :  ', // and how some writers blank it instead
    '2026:02:31 10:00:00', // no such day
    '2026:13:01 10:00:00', // no such month
    '2026:07:09 25:00:00', // no such hour
    '0050:07:09 10:00:00', // a bare 0-99 year would silently land in the 1900s
    'Thu Jul  9 04:56:00', // not the EXIF format
    '2026-07-09 04:56:00', // dashes: a writer that used ISO instead
    '',
  ]) {
    assert.equal(exifDateTime(shot({ exif: { [ORIGINAL]: stamp } })), null, JSON.stringify(stamp));
  }
});

test('a value offset pointing past the APP1 segment reads nothing', () => {
  // Nothing stops a malformed IFD pointing its value offset outside its own segment. The bytes it
  // reaches here are a perfectly good date sitting in the comment segment that follows — they must
  // not become a capture time, because they have nothing to do with this photo.
  const date = [...chars('2026:07:09 04:56:00'), 0];
  // IFD0 at 8 with one ASCII entry whose value lives 30 bytes past the TIFF header. The APP1
  // length below covers the header and IFD0 and stops there, so offset 30 is outside the segment.
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, ...le32(8),
    ...le16(1), ...le16(IFD0_DATE), ...le16(2), ...le32(date.length), ...le32(30), ...le32(0),
  ];
  const app1 = [0xff, 0xe1, ...be16(6 + tiff.length + 2), ...chars('Exif'), 0, 0, ...tiff];
  const file = new Uint8Array([0xff, 0xd8, ...app1, ...segment(0xfe, date), 0xff, 0xd9]);
  // The TIFF header starts at 12, so the string really is 30 bytes past it — the parse has to be
  // what declines to follow the offset, not the absence of anything to find.
  const base = 12;
  assert.equal(String.fromCharCode(...file.subarray(base + 30, base + 49)), '2026:07:09 04:56:00');
  assert.equal(exifDateTime(file), null);
});

test('an ArrayBuffer works as well as a view over one', () => {
  const file = shot({ exif: { [ORIGINAL]: '2026:07:09 04:56:00' } });
  assert.deepEqual(exifDateTime(file.buffer.slice(0, file.byteLength)), SOURCE_FIRST_FRAME);
});

/* ---------- sharing ---------- */

// Everything below encodes what each platform actually accepts, measured or read off the docs:
// Instagram has no intent URL and its web composer takes neither a paste nor a prefill, X and
// Threads both document /intent/post?text=, and no service takes an image through a URL at all.

test('the share bitmap is the size Instagram posts uncropped', () => {
  // The collage is 3:4 (3077x4096), which is exactly the 1080x1440 Instagram's 2025 grid takes
  // without cropping. Rendering the share copy at 1080 rather than the export's 3077 is also
  // what keeps it cheap enough to have ready before the click — 33ms against 192ms, measured.
  assert.equal(SHARE_W, 1080);
  assert.deepEqual(canvasSize(SHARE_W), { w: 1080, h: 1438 });
});

test('a platform that shares files gets the share sheet, whatever the service', () => {
  for (const service of SERVICES.map((s) => s.id)) {
    assert.equal(sharePlan({ service, canShareFiles: true, canCopyImage: true }), 'share');
    assert.equal(sharePlan({ service, canShareFiles: true, canCopyImage: false }), 'share');
  }
});

test('without the share sheet, only X and Threads can take a pasted image', () => {
  const opts = { canShareFiles: false, canCopyImage: true };
  assert.equal(sharePlan({ ...opts, service: 'x' }), 'clipboard');
  assert.equal(sharePlan({ ...opts, service: 'threads' }), 'clipboard');
  // Instagram's web composer opens a file picker and ignores a paste, so the file has to land
  // on disk where the picker can reach it.
  assert.equal(sharePlan({ ...opts, service: 'instagram' }), 'download');
});

test('no clipboard leaves the download for everyone', () => {
  for (const service of SERVICES.map((s) => s.id)) {
    assert.equal(sharePlan({ service, canShareFiles: false, canCopyImage: false }), 'download');
  }
});

test('intent URLs are the documented endpoints, and only two services have one', () => {
  assert.equal(intentUrl('x'), 'https://x.com/intent/post');
  assert.equal(intentUrl('threads'), 'https://www.threads.net/intent/post');
  assert.equal(intentUrl('instagram'), 'https://www.instagram.com/');
});

test('prefill text is URL-encoded, and skipped when there is none', () => {
  assert.equal(intentUrl('x', '카페 · 퇴근'), 'https://x.com/intent/post?text=%EC%B9%B4%ED%8E%98%20%C2%B7%20%ED%87%B4%EA%B7%BC');
  assert.equal(intentUrl('x', ''), 'https://x.com/intent/post');
  // Instagram takes no parameters at all — handing it one would just be a URL that does nothing.
  assert.equal(intentUrl('instagram', '카페'), 'https://www.instagram.com/');
});

test('prefill text is the notes, in page order, and nothing when none were typed', () => {
  const page = [{ note: '카페에서 아침' }, { note: '' }, { note: '퇴근길' }];
  assert.equal(shareText(page), '카페에서 아침 · 퇴근길');
  assert.equal(shareText([{ note: '' }, {}]), '');
});

/* ---------- files the browser could not open ---------- */
// One undecodable file used to take the whole batch down: the rejection escaped addFiles and
// the photos already read never got drawn. They are skipped now, and this is what gets said
// about them.

test('nothing skipped, nothing said', () => {
  assert.equal(skippedNote([]), '');
});

test('every skipped file is named', () => {
  const note = skippedNote(['a.webp', 'b.avif']);
  assert.match(note, /a\.webp/);
  assert.match(note, /b\.avif/);
});

test('HEIC gets the advice that actually fixes it, other formats do not', () => {
  // Read off the name rather than file.type: what a browser calls a .heic varies, and a
  // caller that got here at all has already been told the type looked like an image.
  for (const name of ['IMG_0001.HEIC', 'img.heic', 'live.heif']) {
    assert.match(skippedNote([name]), /높은 호환성/, name);
  }
  assert.doesNotMatch(skippedNote(['b.avif']), /높은 호환성/);
  // Mixed batch: the advice belongs there as long as one of them is a HEIC.
  assert.match(skippedNote(['b.avif', 'IMG_0001.HEIC']), /높은 호환성/);
  // ".heiconvert.png" is not a HEIC — the extension has to end the name.
  assert.doesNotMatch(skippedNote(['x.heiconvert.png']), /높은 호환성/);
});
