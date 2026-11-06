/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact detection core ----------
   Plain JavaScript on pixel arrays and model outputs: no DOM, no network, no dependencies, so it runs in the detection
   worker and in Node (the tests). The models themselves run in the worker (ONNX Runtime, WebAssembly); this file turns
   pictures into model inputs and model outputs into boxes, and paints the covers.

   Boxes are { x, y, w, h, score } in the original picture's pixels.

   API (on the global RedactDetect):
     TEXT, FACE                          -> the settings below
     textSize(w, h, maxSide)             -> the detector's input size (multiples of 32)
     textInput(rgba, w, h)               -> Float32Array, 1 x 3 x h x w (BGR, normalised as the model was trained)
     textBoxes(prob, w, h, sx, sy, W, H) -> text regions from the detector's probability map (sx, sy: to picture scale)
     faceTiles(W, H)                     -> the regions the face detector looks at: the whole picture, plus overlapping
                                            tiles in a large picture (small faces in the background)
     faceFit(tile)                       -> { s, dw, dh }: how a region is placed in the 640 x 640 input
     faceInput(rgba)                     -> Float32Array, 1 x 3 x 640 x 640 (BGR, 0-255) from a 640 x 640 RGBA picture
     faceBoxes(out, tile, fit, minScore) -> faces in picture pixels from YuNet's outputs
     nms(boxes, overlap)                 -> boxes without duplicates (the higher score kept)
     codeBox(position, W, H)             -> a box around a code reader's four corners
     pad(box, W, H)                      -> the box with a margin (covers reach past anti-aliased edges)
     fill(rgba, W, H, box, rgb)          -> paints a solid cover into the pixels
     mosaic(rgba, W, H, box, rand)       -> coarse blocks with noise (faces only; rand() gives numbers in [0, 1)) */
(function (root) {
  'use strict';

  // ---------- text regions: PaddleOCR's PP-OCRv4 detector (a DB text detector) ----------
  // bin: a pixel is text when its probability is over this; box: a region's mean probability must be over this;
  // unclip: the detector marks a shrunk core of each word, so regions are grown back (the DB method's unclip ratio)
  const TEXT = { maxSide: 1280, bin: 0.3, box: 0.6, unclip: 1.5, minSide: 3 };
  const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

  function textSize(w, h, maxSide) {
    const s = Math.min(1, (maxSide || TEXT.maxSide) / Math.max(w, h));
    const r = v => Math.max(32, Math.round(v * s / 32) * 32);
    return { w: r(w), h: r(h) };
  }

  // channels in the order the model was trained on (BGR, as PaddleOCR reads pictures), normalised with its mean and spread
  function textInput(rgba, w, h) {
    const n = w * h, t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      t[i] = (rgba[o + 2] / 255 - MEAN[0]) / STD[0];
      t[n + i] = (rgba[o + 1] / 255 - MEAN[1]) / STD[1];
      t[2 * n + i] = (rgba[o] / 255 - MEAN[2]) / STD[2];
    }
    return t;
  }

  // connected regions of the probability map (4-neighbour), each kept when its mean probability is high enough
  function textBoxes(prob, w, h, sx, sy, W, H) {
    const lab = new Int32Array(w * h), stack = new Int32Array(w * h), out = [];
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (lab[i] || prob[i] <= TEXT.bin) continue;
      n++; lab[i] = n;
      let top = 0, x0 = w, y0 = h, x1 = -1, y1 = -1, cnt = 0, sum = 0;
      stack[top++] = i;
      while (top) {
        const j = stack[--top], x = j % w, y = (j - x) / w;
        cnt++; sum += prob[j];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !lab[j - 1] && prob[j - 1] > TEXT.bin) { lab[j - 1] = n; stack[top++] = j - 1; }
        if (x < w - 1 && !lab[j + 1] && prob[j + 1] > TEXT.bin) { lab[j + 1] = n; stack[top++] = j + 1; }
        if (y > 0 && !lab[j - w] && prob[j - w] > TEXT.bin) { lab[j - w] = n; stack[top++] = j - w; }
        if (y < h - 1 && !lab[j + w] && prob[j + w] > TEXT.bin) { lab[j + w] = n; stack[top++] = j + w; }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (Math.min(bw, bh) < TEXT.minSide || sum / cnt < TEXT.box) continue;
      const d = bw * bh * TEXT.unclip / (2 * (bw + bh));   // grow by area x ratio / perimeter, as the DB method does
      const ax = Math.max(0, (x0 - d) * sx), ay = Math.max(0, (y0 - d) * sy);
      const bx = Math.min(W, (x1 + 1 + d) * sx), by = Math.min(H, (y1 + 1 + d) * sy);
      out.push({ x: ax, y: ay, w: bx - ax, h: by - ay, score: sum / cnt });
    }
    return out;
  }

  // ---------- faces: YuNet (OpenCV Zoo) ----------
  // minScore: the lowest score reported (the app chooses which to suggest); overlap: duplicates from overlapping tiles
  const FACE = { size: 640, strides: [8, 16, 32], minScore: 0.3, overlap: 0.3 };

  // the whole picture, and in a large picture overlapping tiles too, so a face a few dozen pixels wide in a 12-megapixel
  // group photo is still big enough for the detector
  function faceTiles(W, H) {
    const tiles = [{ x: 0, y: 0, w: W, h: H }];
    if (Math.max(W, H) <= 2 * FACE.size) return tiles;
    const T = Math.max(FACE.size, Math.round(Math.min(W, H) / 2)), step = Math.round(T * 0.75);
    const at = L => { const p = []; if (L <= T) return [0]; for (let v = 0; v + T < L; v += step) p.push(v); p.push(L - T); return p; };
    for (const y of at(H)) for (const x of at(W)) tiles.push({ x, y, w: Math.min(T, W), h: Math.min(T, H) });
    return tiles;
  }

  // a region scaled to fit 640 x 640, centred; the rest of the input stays black
  function faceFit(tile) {
    const s = Math.min(FACE.size / tile.w, FACE.size / tile.h);
    return { s, dw: (FACE.size - tile.w * s) / 2, dh: (FACE.size - tile.h * s) / 2 };
  }

  function faceInput(rgba) {
    const n = FACE.size * FACE.size, t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) { const o = i * 4; t[i] = rgba[o + 2]; t[n + i] = rgba[o + 1]; t[2 * n + i] = rgba[o]; }
    return t;
  }

  // YuNet's outputs per stride: cls_s, obj_s (one value per cell), bbox_s (four per cell); score = sqrt(cls x obj).
  // The same decoding as OpenCV's FaceDetectorYN.
  function faceBoxes(out, tile, fit, minScore) {
    const min = minScore == null ? FACE.minScore : minScore, faces = [];
    for (const s of FACE.strides) {
      const cls = out['cls_' + s], obj = out['obj_' + s], bb = out['bbox_' + s];
      if (!cls || !obj || !bb) throw new Error('face detector output missing for stride ' + s);
      const cols = FACE.size / s, rows = FACE.size / s;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])));
        if (!(score >= min)) continue;
        const cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s;
        const w = Math.exp(bb[i * 4 + 2]) * s, h = Math.exp(bb[i * 4 + 3]) * s;
        if (!isFinite(w) || !isFinite(h)) continue;
        // from the 640 x 640 input back to the picture
        const x = (cx - w / 2 - fit.dw) / fit.s + tile.x, y = (cy - h / 2 - fit.dh) / fit.s + tile.y;
        faces.push({ x, y, w: w / fit.s, h: h / fit.s, score });
      }
    }
    return faces;
  }

  // ---------- shared ----------
  function overlap(a, b) {
    const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
    const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    return i / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));   // against the smaller box: a face found whole and in part is one face
  }
  function nms(boxes, limit) {
    const lim = limit == null ? FACE.overlap : limit, keep = [];
    for (const b of boxes.slice().sort((p, q) => q.score - p.score)) if (!keep.some(k => overlap(k, b) > lim)) keep.push(b);
    return keep;
  }

  function codeBox(p, W, H) {
    const pts = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys));
    const x1 = Math.min(W, Math.max(...xs)), y1 = Math.min(H, Math.max(...ys));
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), score: 1 };
  }

  // a margin of 8 % of the box's shorter side, at least 3 pixels, so the soft edges of letters can't show their shape
  function pad(b, W, H) {
    const m = Math.max(3, 0.08 * Math.min(b.w, b.h));
    const x0 = Math.max(0, Math.floor(b.x - m)), y0 = Math.max(0, Math.floor(b.y - m));
    const x1 = Math.min(W, Math.ceil(b.x + b.w + m)), y1 = Math.min(H, Math.ceil(b.y + b.h + m));
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0), score: b.score };
  }

  const clip = (b, W, H) => ({ x0: Math.max(0, Math.floor(b.x)), y0: Math.max(0, Math.floor(b.y)), x1: Math.min(W, Math.ceil(b.x + b.w)), y1: Math.min(H, Math.ceil(b.y + b.h)) });

  function fill(rgba, W, H, b, rgb) {
    const { x0, y0, x1, y1 } = clip(b, W, H);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4; rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
    }
  }

  // about five blocks across the face, each one colour (its average) plus random noise, so the blocks can't be
  // matched back to a face by trying candidates. Text never gets this style: blurred or pixelated text can be read back.
  function mosaic(rgba, W, H, b, rand) {
    const { x0, y0, x1, y1 } = clip(b, W, H);
    const k = Math.max(6, Math.round(Math.min(x1 - x0, y1 - y0) / 5));
    for (let by = y0; by < y1; by += k) for (let bx = x0; bx < x1; bx += k) {
      const ex = Math.min(x1, bx + k), ey = Math.min(y1, by + k);
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const o = (y * W + x) * 4; r += rgba[o]; g += rgba[o + 1]; bl += rgba[o + 2]; n++; }
      const noise = () => (rand() - 0.5) * 48;
      const c = [r / n + noise(), g / n + noise(), bl / n + noise()].map(v => Math.max(0, Math.min(255, Math.round(v))));
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const o = (y * W + x) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; }
    }
  }

  root.RedactDetect = { TEXT, FACE, textSize, textInput, textBoxes, faceTiles, faceFit, faceInput, faceBoxes, nms, codeBox, pad, fill, mosaic };
})(typeof globalThis !== 'undefined' ? globalThis : this);
