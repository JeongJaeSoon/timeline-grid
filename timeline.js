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
  // Clear air between caption lines, as a fraction of the em. Line pitch is measured ink + this,
  // rather than a fixed leading, because ink height varies a lot between faces (0.91em for Tinos,
  // 1.08em for Noto Serif KR) and a fixed leading left the latter 1.4px apart.
  // The source's own two-line captions were spaced 50 / 48 / 50 px top-to-top at 45px type over
  // ink measuring 0.911em, which is a gap of 0.2. This runs deliberately looser than that: 0.4
  // puts Tinos at a 59.2px pitch against the source's 50px. It is the one layout number here that
  // is a choice rather than a measurement, so it is the one that can be tuned — the tests below
  // are written against the rule and the source anchor, and follow this value rather than pinning
  // it. Change it and the captions breathe more; the README's 캡션 폰트 section says so too.
  lineGap: 0.4,
};

export const PER_PAGE = SPEC.cols * SPEC.rows;

// cols -> rows for every supported layout. 4 columns run 2 rows (8 photos) rather than 3 (12) —
// a grid that tall would ask for more photos than a single day's timeline usually has.
export const LAYOUTS = [
  { cols: 1, rows: SPEC.rows },
  { cols: SPEC.cols, rows: SPEC.rows },
  { cols: 4, rows: 2 },
];
const DEFAULT_LAYOUT = LAYOUTS.find((l) => l.cols === SPEC.cols);
export const layoutFor = (cols) => LAYOUTS.find((l) => l.cols === cols) ?? DEFAULT_LAYOUT;

export const perPage = (cols = SPEC.cols) => cols * layoutFor(cols).rows;

// Canvas height scales with row count: every row keeps the source's measured rowPitch, and the
// same clear air trails the last caption as in the 3-row source this was measured from.
const TAIL = SPEC.aspect - SPEC.rows * SPEC.rowPitch;
export const aspectFor = (rows = SPEC.rows) => rows * SPEC.rowPitch + TAIL;

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

export function canvasSize(W, rows = SPEC.rows) {
  return { w: Math.round(W), h: Math.round(W * aspectFor(rows)) };
}

// Preview canvases stretch to their container (`width: 100%`), so the bitmap has to be the size
// the screen actually shows — CSS px times devicePixelRatio. The old fixed 620px was being
// magnified 3.10x on a HiDPI desktop (962 CSS px at the 1040px .wrap cap, DPR 2). A 700px window
// is the case that hid it: 622 CSS px against a 620px bitmap reads as a 1.00x match until DPR
// goes into the arithmetic, and then it is 2.01x. Measured on Chrome.
// Capped at the export width. The container never exceeds 962 CSS px, so the cap first bites at
// devicePixelRatio 3.2 — past that the preview would cost more than the download it stands in
// for. Floored at 320, the narrowest phone viewport and so the smallest width worth drawing,
// which is what a container measuring 0 (laid out while hidden) gets instead of a 0x0 canvas.
export function previewWidth(cssW, dpr = 1) {
  return Math.min(Math.max(Math.round(cssW * dpr) || 0, 320), SPEC.ref);
}

/* ---------- files the browser cannot open ---------- */

// What to say about the files a pick had to skip. HEIC is the iPhone's default format and no
// engine but WebKit decodes it, so it is worth more than being named: the setting that stops
// the phone producing them is two taps away, and nothing else the user does here will help.
// Matched on the name rather than on file.type, which is whatever the OS told the browser to
// call the extension and is empty often enough to not be worth trusting.
export function skippedNote(names) {
  if (!names.length) return '';
  const note = `${names.join(', ')} — 이 브라우저가 열지 못해 건너뛰었습니다.`;
  return names.some((n) => /\.hei[cf]$/i.test(n))
    ? `${note} HEIC는 Safari 밖에서는 열리지 않습니다 — 설정 > 카메라 > 포맷을 '높은 호환성'으로 두거나 JPEG로 바꿔 올려주세요.`
    : note;
}

/* ---------- sharing ---------- */

// The width the copy handed to a social app is rendered at, rather than the export's 3077.
// Two reasons, and the second one is what the whole feature rests on:
//   - Instagram's grid went 3:4 in 2025 and takes 1080x1440 without cropping, which is exactly
//     this collage's aspect — the source template was already 3:4.
//   - navigator.share() needs transient activation and, unlike ClipboardItem, has no way to be
//     handed a promise, so the blob has to exist before the click rather than be made during it.
//     At 1080 a page costs 33ms to render and encode against 3077's 192ms (median of 3, Chrome
//     on macOS, rasterisation forced with getImageData), which is cheap enough to prepare on a
//     debounce after every edit and have waiting by the time a button is pressed.
export const SHARE_W = 1080;

// `intent` is the documented web-intent endpoint, which prefills a composer but cannot carry an
// image — none of the three can. Instagram has no intent at all: its web composer opens a file
// picker, ignores a paste, and reads no query parameters, which is why it is null here and why
// sharePlan() sends it down the download path.
export const SERVICES = [
  { id: 'instagram', label: 'Instagram', intent: null, home: 'https://www.instagram.com/' },
  { id: 'threads', label: 'Threads', intent: 'https://www.threads.net/intent/post' },
  { id: 'x', label: 'X', intent: 'https://x.com/intent/post' },
];

// How the image gets to `service` here and now. The answer is fixed by feature detection, not by
// what happens during the click, so the UI can say in advance what pressing the button will do.
export function sharePlan({ service, canShareFiles, canCopyImage }) {
  if (canShareFiles) return 'share'; // the OS sheet, i.e. the actual app — mobile only in practice
  if (service === 'instagram') return 'download'; // takes neither a paste nor a URL
  return canCopyImage ? 'clipboard' : 'download';
}

export function intentUrl(service, text = '') {
  const { intent, home } = SERVICES.find((s) => s.id === service) ?? {};
  if (!intent) return home ?? '';
  return text ? `${intent}?text=${encodeURIComponent(text)}` : intent;
}

// What goes in the composer: the notes the user already typed, in page order. The stamps are
// left out — they are burned into the image, and repeating them as text reads like a caption
// for a photo the reader can already see.
export const shareText = (page) => page.map((p) => p.note).filter(Boolean).join(' · ');

export function cellRect(i, W, cols = SPEC.cols) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const w = W / cols;
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

/* ---------- EXIF capture time ---------- */

// A file's mtime is when it was copied, not when the shutter fired — AirDropped and downloaded
// photos all carry the moment they landed on the machine. The real time is in EXIF, which is a
// TIFF block hidden inside a JPEG's APP1 segment: byte order, magic 42, IFD0's offset, then IFD0,
// with an ExifIFD hanging off tag 0x8769. Every offset inside is relative to that block's start.
//
// Only the three date tags below are ever read, plus the pointer that leads to them. EXIF also
// carries GPS, and this app promises the photo does not leave the browser, so nothing else is
// parsed and a Date is all that can come back out.
//
// The stamp is read as a local wall clock. DateTimeOriginal has no timezone, and the newer
// OffsetTimeOriginal (0x9011) is ignored on purpose: honouring it would shift a photo taken at
// 04:56 in Tokyo to whatever that instant is called wherever the collage is being made, printing
// a time the camera never showed. formatStamp() and the datetime-local input are both local too.
//
// JPEG only. HEIC/HEIF — the iPhone default — keeps EXIF in an ISOBMFF item, an unrelated
// container, and PNG has no capture time worth chasing; both fall out as null.
const ASCII = 2;
const LONG = 4;
const EXIF_ID = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0", what marks an APP1 as EXIF
const TAG_DATE_TIME = 0x0132; // IFD0: the file's own stamp, set by the camera or by an editor
const TAG_EXIF_IFD = 0x8769; // IFD0: offset of the ExifIFD
const TAG_ORIGINAL = 0x9003; // ExifIFD: when the shutter fired
const TAG_DIGITIZED = 0x9004; // ExifIFD: when it was recorded — same as above on a camera

// The TIFF block of the first APP1 EXIF segment, as a view bounded by that segment — or null.
// Bounding it there is what keeps the block honest: an IFD is free to point a value offset
// anywhere, and against a view of the whole file a malformed one can reach into the segments that
// follow and pass their bytes off as a capture time. Against this view the same offset simply
// throws. Walking the marker chain rather than searching for "Exif\0\0" is the other half of that
// — the same six bytes occur inside pixel data often enough.
function exifTiff(v) {
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null; // no SOI: not a JPEG
  let p = 2;
  while (p + 4 <= v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null; // lost the chain
    const marker = v.getUint8(p + 1);
    if (marker === 0xff) { p += 1; continue; } // fill byte ahead of the real marker
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    if (marker === 0xda || marker === 0xd9) return null; // pixel data starts here; the headers are behind us
    const len = v.getUint16(p + 2);
    if (len < 2) return null; // the length counts itself, so anything under 2 is nonsense
    const id = p + 4;
    const end = Math.min(p + 2 + len, v.byteLength); // a cut-short head ends the block early
    if (marker === 0xe1 && id + EXIF_ID.length <= end && EXIF_ID.every((b, i) => v.getUint8(id + i) === b)) {
      const at = id + EXIF_ID.length;
      return at < end ? new DataView(v.buffer, v.byteOffset + at, end - at) : null;
    }
    p += 2 + len; // some other segment — XMP and ICC also live in APP1/APP2
  }
  return null;
}

// The value of one tag in the IFD at `ifd`. Offsets are relative to the start of the TIFF block,
// which is where `t` begins. Values of four bytes or fewer sit in the entry itself; anything longer
// is stored elsewhere in the block and the entry holds its offset.
function tagValue(t, ifd, le, tag) {
  const n = t.getUint16(ifd, le);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12; // count, then 12 bytes per entry: tag, type, count, value
    if (t.getUint16(e, le) !== tag) continue;
    const type = t.getUint16(e + 2, le);
    const count = t.getUint32(e + 4, le);
    const size = count * (type === ASCII ? 1 : 4); // only ASCII strings and LONG offsets are asked for
    return { type, count, at: size <= 4 ? e + 8 : t.getUint32(e + 8, le) };
  }
  return null;
}

// "2026:07:09 04:56:00" — colon-separated, which is why new Date(string) cannot read it.
function stampToDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, min, sec] = m.slice(1).map(Number);
  // Month and day of zero are how a blank field gets written — "0000:00:00 00:00:00" is thrown out
  // right here, before any of it reaches Date.
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || min > 59 || sec > 60) return null;
  const date = new Date(y, mo - 1, d, h, min, sec);
  // The date then has to survive the round trip, which catches what a range check cannot: a bare
  // year under 100 lands silently in the 1900s, and 02:31 rolls forward into March. Only the date
  // is checked, so a stamp inside a DST gap normalises rather than being thrown away.
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

function dateTag(t, ifd, le, tag) {
  const f = tagValue(t, ifd, le, tag);
  if (!f || f.type !== ASCII) return null;
  let s = '';
  for (let i = 0; i < f.count; i++) {
    const c = t.getUint8(f.at + i);
    if (c === 0) break; // count includes the terminating NUL
    s += String.fromCharCode(c);
  }
  return stampToDate(s.trim());
}

// bytes: an ArrayBuffer or a view over one. The head of the file is enough — see index.html.
// Returns the capture time as a local Date, or null when the file has none to give.
export function exifDateTime(bytes) {
  try {
    const v = ArrayBuffer.isView(bytes)
      ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : new DataView(bytes);
    const t = exifTiff(v);
    if (!t) return null;
    const order = t.getUint16(0);
    if (order !== 0x4949 && order !== 0x4d4d) return null; // "II" little-endian / "MM" big-endian
    const le = order === 0x4949;
    if (t.getUint16(2, le) !== 0x2a) return null; // TIFF's 42, which also proves the order read
    const ifd0 = t.getUint32(4, le);
    const ptr = tagValue(t, ifd0, le, TAG_EXIF_IFD);
    const inExif = (tag) =>
      ptr && ptr.type === LONG ? dateTag(t, t.getUint32(ptr.at, le), le, tag) : null;
    // Shutter time first. Digitized matches it on a camera and is what a scan carries instead.
    // IFD0's DateTime comes last: it is an edit time, but it still travels with the pixels, which
    // is more than the mtime the caller falls back to can claim.
    return inExif(TAG_ORIGINAL) ?? inExif(TAG_DIGITIZED) ?? dateTag(t, ifd0, le, TAG_DATE_TIME);
  } catch {
    return null; // truncated head or offsets pointing off the end — the caller falls back to the mtime
  }
}

// Fill the cell, preserving aspect ratio, cropping from the center (CSS object-fit: cover),
// then optionally zoom in and re-center the crop. zoom is a multiplier on top of the cover fit
// (1 = plain cover, >1 crops tighter). panX/panY are in [-1, 1] and read as a fraction of the
// slack — how far the image can shift before a gap would show — rather than raw pixels, so the
// same stored values reproduce the same framing on both the preview canvas and the full-size
// export even though their pixel dimensions differ.
// No imageSmoothingQuality here on purpose: rendering a 3024x4032 photo into a 962x645 preview
// cell gave byte-identical output at 'low' and 'high' (max per-pixel difference 0 over 620k
// pixels), and upscaling a 400x300 one differed by 0.013 per channel — Chrome's GPU canvas
// ignores the hint on this path, so setting it would be a line that reads like it does something.
export function drawCover(ctx, img, x, y, w, h, zoom = 1, panX = 0, panY = 0) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s;
  const dh = img.height * s;
  const slackX = Math.max(0, (dw - w) / 2);
  const slackY = Math.max(0, (dh - h) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2 + panX * slackX, y + (h - dh) / 2 + panY * slackY, dw, dh);
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

// items: [{ img, stamp, note }] — at most perPage(cols). Remaining cells stay white.
export function renderPage(canvas, items, W, stack = CAPTION_FONT, cols = SPEC.cols) {
  const { rows } = layoutFor(cols);
  const { w, h } = canvasSize(W, rows);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  // Measured on every render rather than cached: measuring before the webfont has loaded
  // reads the fallback face, and a cache would keep serving those numbers forever.
  const font = measureCaptionFont(ctx, stack);
  const limit = cols * rows;
  items.slice(0, limit).forEach((it, i) => {
    const r = cellRect(i, W, cols);
    if (it.img) drawCover(ctx, it.img, r.x, r.y, r.w, r.h, it.zoom, it.panX, it.panY);
    const lines = [it.stamp, it.note].filter(Boolean);
    if (lines.length) drawCaption(ctx, lines, r.colCenterX, r.capCenterY, W, font);
  });
  return canvas;
}
