/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- picture size from the file header, before anything decodes it ----------
   Copied unchanged from Flatbed's src/scan.js (1.0.2, d6d08d6), where it was reviewed; a change is made there first.
   API (on the global RedactPicture): MAX_PIXELS, pictureSize(bytes) -> { type, w, h } | { type, bad: true } | null,
   tooLarge(bytes) -> the size when the picture must be refused, else null. */
(function (root) {
  'use strict';
  // A small file can declare enormous dimensions (a one-colour 40000 x 40000 PNG is a few MB), and decoding it would
  // need gigabytes and crash the page or the app. The size is read from the header only, with every offset checked.
  // Returns { type, w, h }; { type, bad: true } when the file is one of these formats but its size can't be read (it
  // is refused: a decoder might still find a size the check didn't see); null when the format isn't recognised (the
  // browser then decides, and opens only formats it knows).
  const MAX_PIXELS = 100e6;   // 100 megapixels: far more than a page needs (an A4 page at 600 dpi is 35 megapixels)
  const HEIF_BRANDS = new Set(['mif1', 'msf1', 'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'avif', 'avis', 'avio']);
  function pictureSize(b) {
    const n = b.length, be16 = i => b[i] << 8 | b[i + 1], le16 = i => b[i] | b[i + 1] << 8;
    const be32 = i => b[i] * 0x1000000 + (b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]);
    const le24 = i => b[i] | b[i + 1] << 8 | b[i + 2] << 16, le32 = i => b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24;
    const is = (i, s) => i + s.length <= n && [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
    const size = (type, w, h) => ({ type, w, h }), bad = type => ({ type, bad: true });
    if (n >= 2 && b[0] === 0xFF && b[1] === 0xD8) {   // JPEG: the frame header (SOF0-15, not DHT/JPG/DAC)
      for (let i = 2; i + 4 <= n;) {
        if (b[i] !== 0xFF) { i++; continue; }   // decoders skip stray bytes before a marker, so this does too
        const m = b[i + 1];
        if (m === 0xFF) { i++; continue; }   // fill byte
        if (m === 0x00 || m === 0x01 || m === 0xD8 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }   // no length
        if (m === 0xD9 || m === 0xDA) return bad('jpeg');   // image end or scan data before any frame header
        const len = be16(i + 2);
        if (len < 2) return bad('jpeg');
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return i + 9 <= n ? size('jpeg', be16(i + 7), be16(i + 5)) : bad('jpeg');
        i += 2 + len;
      }
      return bad('jpeg');
    }
    if (n >= 8 && is(0, '\x89PNG\r\n\x1a\n')) return n >= 24 && is(12, 'IHDR') ? size('png', be32(16), be32(20)) : bad('png');
    if (n >= 12 && is(0, 'RIFF') && is(8, 'WEBP')) {
      if (n >= 30 && is(12, 'VP8X')) return size('webp', 1 + le24(24), 1 + le24(27));
      if (n >= 25 && is(12, 'VP8L') && b[20] === 0x2F) return size('webp', 1 + (le16(21) & 0x3FFF), 1 + ((b[22] >> 6 | b[23] << 2 | b[24] << 10) & 0x3FFF));
      if (n >= 30 && is(12, 'VP8 ') && b[23] === 0x9D && b[24] === 0x01 && b[25] === 0x2A) return size('webp', le16(26) & 0x3FFF, le16(28) & 0x3FFF);
      return bad('webp');
    }
    if (n >= 6 && (is(0, 'GIF87a') || is(0, 'GIF89a'))) {
      // the logical screen, and every frame's own extent (a frame may reach beyond the screen)
      if (n < 13) return bad('gif');
      let w = le16(6), h = le16(8), i = 13;
      const table = f => f & 0x80 ? 3 * (1 << ((f & 7) + 1)) : 0;
      const blocks = () => { while (i < n && b[i]) i += b[i] + 1; i++; };   // data sub-blocks, then their terminator
      i += table(b[10]);
      while (i < n) {
        const c = b[i];
        if (c === 0x21) { i += 2; blocks(); }   // an extension
        else if (c === 0x2C) {   // a frame
          if (i + 10 > n) break;
          w = Math.max(w, le16(i + 1) + le16(i + 5)); h = Math.max(h, le16(i + 3) + le16(i + 7));
          i += 10 + table(b[i + 9]) + 1; blocks();
        } else break;   // the end (0x3B) or damage: decoders stop here too
      }
      return size('gif', w, h);
    }
    if (n >= 2 && is(0, 'BM')) {
      if (n < 26) return bad('bmp');
      if (le32(14) === 12) return size('bmp', le16(18), le16(20));   // the oldest header: 16-bit sizes
      return size('bmp', Math.abs(le32(18)), Math.abs(le32(22)));   // a negative height means top-down
    }
    if (n >= 16 && is(4, 'ftyp')) {   // HEIF/HEIC/AVIF (videos in the same container are left to the browser)
      const end = Math.min(n, Math.max(16, be32(0)));
      let image = false;
      for (let i = 8; i + 4 <= end; i += 4) if (HEIF_BRANDS.has(String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]))) image = true;
      if (!image) return null;
      // every 'ispe' (image size) property anywhere in the file, the largest counting: a decoder can't use a size the
      // file doesn't state, and the boxes may come in any order (even after the picture data)
      let best = null;
      for (let i = 4; i + 16 <= n; i++) {
        if (b[i] !== 0x69 || b[i + 1] !== 0x73 || b[i + 2] !== 0x70 || b[i + 3] !== 0x65) continue;   // 'ispe'
        const w = be32(i + 8), h = be32(i + 12);
        if (!best || w * h > best.w * best.h) best = size('heif', w, h);
      }
      return best || bad('heif');
    }
    return null;
  }
  // what stops a picture before decoding: its size when over the limit, or { type, bad: true } when a recognised
  // format's size can't be read; null when it may go on to the decoder
  function tooLarge(bytes) {
    const s = pictureSize(bytes);
    return s && (s.bad || s.w * s.h > MAX_PIXELS) ? s : null;
  }


  const api = { MAX_PIXELS, pictureSize, tooLarge };
  root.RedactPicture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
