/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact covers: painting them into the pixels, and checking a saved picture ----------
   Plain JavaScript on RGBA pixel arrays: no DOM, no network; runs in the page and in Node (the tests).

   A cover is { id, cat, src, on, x, y, w, h } in picture pixels, plus for a brush stroke { pts: [[x, y], ...], r }
   (its box is the stroke's extent). src: 'auto' (found by Redact), 'find' (Find words), 'box' or 'brush' (by hand).

   API (on the global RedactPaint):
     paint(img, covers, style, rand, scale) -> [{ cover, rgb | null }]   paints every cover that is on into img
         img: { w, h, data } (RGBA, changed in place); style: { colour: 'black'|'white'|'around', faces: 'solid'|'mosaic' };
         scale: picture pixels to img pixels (1 for the full picture, less for the display copy). rgb null = mosaic.
     check(img, orig, painted, tolerance)  -> { ok, problems: [{ cover, why }] }
         every pixel under a solid cover is its colour (within tolerance: 0 for PNG, more for JPEG), and a mosaic
         changed the face; img is the saved picture decoded again, orig the picture before covering (same size)
     covered(img, painted) -> the pixel count under covers (for the summary) */
(function (root) {
  'use strict';
  const D = () => root.RedactDetect;
  const COLOURS = { black: [0, 0, 0], white: [255, 255, 255] };

  const scaled = (c, s) => ({ x: c.x * s, y: c.y * s, w: c.w * s, h: c.h * s });
  const clip = (b, W, H) => ({ x0: Math.max(0, Math.floor(b.x)), y0: Math.max(0, Math.floor(b.y)), x1: Math.min(W, Math.ceil(b.x + b.w)), y1: Math.min(H, Math.ceil(b.y + b.h)) });

  // the colour of a two-pixel ring just outside the box (the paper, the wall, the screen's background): the middle value
  // of each channel, so letters or an edge touching the box don't darken it
  function around(img, b) {
    const { w: W, h: H, data } = img, rs = [], gs = [], bs = [];
    for (const d of [1, 2]) {
      const { x0, y0, x1, y1 } = clip({ x: b.x - d, y: b.y - d, w: b.w + 2 * d, h: b.h + 2 * d }, W, H);
      const add = (x, y) => { const o = (y * W + x) * 4; rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]); };
      for (let x = x0; x < x1; x++) { add(x, y0); if (y1 - 1 > y0) add(x, y1 - 1); }
      for (let y = y0 + 1; y < y1 - 1; y++) { add(x0, y); if (x1 - 1 > x0) add(x1 - 1, y); }
    }
    if (!rs.length) return [0, 0, 0];
    const mid = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    return [mid(rs), mid(gs), mid(bs)];
  }

  // every pixel within r of the stroke's line
  function strokePixels(c, s, W, H, fn) {
    const pts = c.pts.map(([x, y]) => [x * s, y * s]), r = Math.max(1, c.r * s), r2 = r * r;
    const b = clip({ x: Math.min(...pts.map(p => p[0])) - r, y: Math.min(...pts.map(p => p[1])) - r, w: 0, h: 0 }, W, H);
    const e = clip({ x: Math.max(...pts.map(p => p[0])) + r, y: Math.max(...pts.map(p => p[1])) + r, w: 0, h: 0 }, W, H);
    for (let y = b.y0; y < e.y1; y++) for (let x = b.x0; x < e.x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let near = false;
      for (let i = 0; i < pts.length && !near; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[Math.min(i + 1, pts.length - 1)];
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        const qx = ax + t * dx - px, qy = ay + t * dy - py;
        near = qx * qx + qy * qy <= r2;
      }
      if (near) fn(x, y);
    }
  }

  function paint(img, covers, style, rand, scale = 1) {
    const { w: W, h: H, data } = img, out = [];
    const on = covers.filter(c => c.on);
    // colours from around each cover are taken first, from the picture as it was, so covers side by side don't take
    // each other's colour
    const rgbs = on.map(c => style.colour === 'around' ? around(img, scaled(c, scale)) : COLOURS[style.colour] || COLOURS.black);
    on.forEach((c, i) => {
      const mosaic = c.cat === 'faces' && style.faces === 'mosaic' && !c.pts;
      if (mosaic) { D().mosaic(data, W, H, scaled(c, scale), rand); out.push({ cover: c, rgb: null }); return; }
      const rgb = rgbs[i];
      if (c.pts) strokePixels(c, scale, W, H, (x, y) => { const o = (y * W + x) * 4; data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255; });
      else D().fill(data, W, H, scaled(c, scale), rgb);
      out.push({ cover: c, rgb });
    });
    return out;
  }

  // Which cover each pixel ended up under (covers can overlap; the one painted last wins), then every pixel is compared
  // with what its cover put there. With JPEG (tol > 0) the edges blur into the neighbours, so pixels within 2 of a
  // different cover or of an uncovered pixel are not checked.
  function check(img, orig, painted, tol) {
    const { w: W, h: H, data } = img, owner = new Uint16Array(W * H), problems = [];
    painted.forEach(({ cover: c }, i) => {
      const mark = (x, y) => { owner[y * W + x] = i + 1; };
      if (c.pts) strokePixels(c, 1, W, H, mark);
      else { const { x0, y0, x1, y1 } = clip(c, W, H); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) mark(x, y); }
    });
    const bad = new Array(painted.length).fill(0), n = new Array(painted.length).fill(0), same = new Array(painted.length).fill(0);
    const m = tol ? 2 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = owner[y * W + x]; if (!k) continue;
      if (m && (x < m || y < m || x >= W - m || y >= H - m || owner[y * W + x - m] !== k || owner[y * W + x + m] !== k || owner[(y - m) * W + x] !== k || owner[(y + m) * W + x] !== k)) continue;
      const i = k - 1, rgb = painted[i].rgb, o = (y * W + x) * 4;
      n[i]++;
      if (rgb) { if (Math.abs(data[o] - rgb[0]) > tol || Math.abs(data[o + 1] - rgb[1]) > tol || Math.abs(data[o + 2] - rgb[2]) > tol) bad[i]++; }
      else if (Math.abs(data[o] - orig.data[o]) + Math.abs(data[o + 1] - orig.data[o + 1]) + Math.abs(data[o + 2] - orig.data[o + 2]) <= 6) same[i]++;
    }
    painted.forEach(({ cover, rgb }, i) => {
      if (rgb && bad[i]) problems.push({ cover, why: `${bad[i]} of ${n[i]} pixels are not the cover's colour` });
      if (!rgb && n[i] && same[i] / n[i] > 0.5) problems.push({ cover, why: 'the mosaic left most of the face unchanged' });
    });
    return { ok: !problems.length, problems };
  }

  // How much of a box lies under the covers that are on, from 0 to 1, sampled on a 24 x 24 grid (boxes and brush
  // strokes alike). Used by the re-check: a find counts as covered only when most of it is.
  function coverage(b, covers) {
    const on = covers.filter(c => c.on && c.w > 0 && c.h > 0), N = 24;
    if (!on.length || !(b.w > 0 && b.h > 0)) return 0;
    const under = (x, y) => on.some(c => {
      if (x < c.x || x > c.x + c.w || y < c.y || y > c.y + c.h) return false;
      if (!c.pts) return true;
      for (let i = 0; i < c.pts.length; i++) {
        const [ax, ay] = c.pts[i], [bx, by] = c.pts[Math.min(i + 1, c.pts.length - 1)], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0, qx = ax + t * dx - x, qy = ay + t * dy - y;
        if (qx * qx + qy * qy <= c.r * c.r) return true;
      }
      return false;
    });
    let n = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (under(b.x + (i + 0.5) * b.w / N, b.y + (j + 0.5) * b.h / N)) n++;
    return n / (N * N);
  }

  root.RedactPaint = { paint, check, around, coverage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
