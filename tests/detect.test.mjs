// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Detection with the bundled engines and models, offline: every network call fails here. Faces are decoded exactly as
// OpenCV's own FaceDetectorYN decodes them (tests/fixtures/faces640-opencv.json, made by make-fixtures.py); text
// regions and codes are found in synthetic pictures; the covers change the pixels inside the box and nothing else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

globalThis.fetch = async u => { throw new Error('network access attempted: ' + u); };
const file = f => readFileSync(new URL(f, import.meta.url));
const gz = f => new Uint8Array(gunzipSync(file(f)));
await import('../src/detect.js');
const D = globalThis.RedactDetect;
const ort = await import('../src/vendor/ort.wasm.bundle.min.mjs');
ort.env.wasm.wasmBinary = gz('../src/vendor/ort-wasm-simd-threaded.wasm.gz');
ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
const textModel = await ort.InferenceSession.create(file('../src/models/ppocrv4-det.onnx'));
const faceModel = await ort.InferenceSession.create(file('../src/models/yunet-2023mar.onnx'));

// fixtures: "W H\n" then RGBA pixels
function picture(f) {
  const b = gz(f), nl = b.indexOf(10), [w, h] = new TextDecoder().decode(b.subarray(0, nl)).split(' ').map(Number);
  return { w, h, data: new Uint8ClampedArray(b.buffer, b.byteOffset + nl + 1, w * h * 4) };
}
function resize(img, w, h) {   // bilinear, enough for the detector's input
  const out = new Uint8ClampedArray(w * h * 4), sx = img.w / w, sy = img.h / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = Math.min(img.w - 1, (x + 0.5) * sx - 0.5), fy = Math.min(img.h - 1, (y + 0.5) * sy - 0.5);
    const x0 = Math.max(0, Math.floor(fx)), y0 = Math.max(0, Math.floor(fy)), x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
    const ax = fx - x0, ay = fy - y0;
    for (let c = 0; c < 4; c++) {
      const p = (X, Y) => img.data[(Y * img.w + X) * 4 + c];
      out[(y * w + x) * 4 + c] = (p(x0, y0) * (1 - ax) + p(x1, y0) * ax) * (1 - ay) + (p(x0, y1) * (1 - ax) + p(x1, y1) * ax) * ay;
    }
  }
  return out;
}
async function findText(img) {
  const { w, h } = D.textSize(img.w, img.h);
  const px = w === img.w && h === img.h ? img.data : resize(img, w, h);
  const r = await textModel.run({ [textModel.inputNames[0]]: new ort.Tensor('float32', D.textInput(px, w, h), [1, 3, h, w]) });
  return D.textBoxes(r[textModel.outputNames[0]].data, w, h, img.w / w, img.h / h, img.w, img.h);
}
const inside = (b, r) => b.x <= r[0] && b.y <= r[1] && b.x + b.w >= r[2] && b.y + b.h >= r[3];   // box b holds rectangle r
// where the ink actually is: the bounding rectangle of the pixels in a region that pass a test (dark text on a light
// plate, white text on a sign), so the check is "every ink pixel is under a cover", not a rectangle guessed by hand
function ink(img, [x0, y0, x1, y1], isInk) {
  let a = Infinity, b = Infinity, c = -1, d = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const o = (y * img.w + x) * 4;
    if (isInk(img.data[o], img.data[o + 1], img.data[o + 2])) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x + 1); d = Math.max(d, y + 1); }
  }
  assert.ok(c > a, 'ink found in the region');
  return [a, b, c, d];
}
const dark = (r, g, b) => r + g + b < 200, white = (r, g, b) => r + g + b > 600;
const covered = (boxes, img, r) => boxes.some(b => inside(D.pad(b, img.w, img.h), r));
const show = boxes => JSON.stringify(boxes.map(b => [b.x, b.y, b.w, b.h].map(Math.round)));

test('faces: decoded exactly as OpenCV decodes YuNet', async () => {
  const img = picture('./fixtures/faces640.rgba.gz'), want = JSON.parse(file('./fixtures/faces640-opencv.json')).faces;
  const r = await faceModel.run({ [faceModel.inputNames[0]]: new ort.Tensor('float32', D.faceInput(img.data), [1, 3, 640, 640]) });
  const out = {}; for (const k of faceModel.outputNames) out[k] = r[k].data;
  const tile = { x: 0, y: 0, w: 640, h: 640 };
  const got = D.nms(D.faceBoxes(out, tile, D.faceFit(tile), 0.05));
  assert.ok(want.length >= 3, 'the fixture has faces for OpenCV');
  for (const [x, y, w, h, score] of want) {
    const m = got.find(g => Math.abs(g.x - x) < 1.5 && Math.abs(g.y - y) < 1.5 && Math.abs(g.w - w) < 1.5 && Math.abs(g.h - h) < 1.5);
    assert.ok(m, `OpenCV's face at ${x},${y} ${w}x${h} found: ${JSON.stringify(got.map(g => [g.x, g.y, g.w, g.h].map(Math.round)))}`);
    assert.ok(Math.abs(m.score - score) < 0.01, `score ${m.score} vs OpenCV's ${score}`);
  }
});

test('faces: a region placed in the input maps back to the picture', () => {
  const tile = { x: 1000, y: 500, w: 1280, h: 960 }, fit = D.faceFit(tile);
  assert.equal(fit.s, 0.5); assert.equal(fit.dw, 0); assert.equal(fit.dh, 80);
  // one strong cell at stride 32, row 5, column 10: centre (10.5, 5.5) cells, 64 x 64 input pixels (exp(1) x 32 ≈ 87)
  const out = {}; for (const s of D.FACE.strides) { const n = (640 / s) ** 2; out['cls_' + s] = new Float32Array(n); out['obj_' + s] = new Float32Array(n); out['bbox_' + s] = new Float32Array(n * 4); }
  const i = 5 * 20 + 10; out.cls_32[i] = 1; out.obj_32[i] = 1; out.bbox_32.set([0.5, 0.5, Math.log(2), Math.log(2)], i * 4);
  const [f] = D.faceBoxes(out, tile, fit, 0.5);
  assert.deepEqual([f.x, f.y, f.w, f.h, f.score].map(v => Math.round(v * 1000) / 1000), [1000 + (336 - 32) * 2, 500 + (176 - 32 - 80) * 2, 128, 128, 1]);
});

test('faces: tiles cover a large picture with overlap; a small picture is looked at whole', () => {
  assert.deepEqual(D.faceTiles(1080, 1280), [{ x: 0, y: 0, w: 1080, h: 1280 }]);
  const W = 4000, H = 3000, t = D.faceTiles(W, H);
  assert.deepEqual(t[0], { x: 0, y: 0, w: W, h: H });
  for (const [x, y] of [[0, 0], [W - 1, H - 1], [1999, 1499], [3999, 0]]) assert.ok(t.slice(1).some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h), `${x},${y} in a tile`);
  assert.ok(t.length <= 20, 'a bounded number of tiles');
  // a face cut by a tile edge is found whole by the neighbouring tile: neighbours overlap by a quarter of a tile
  const a = t[1], b = t.find(r => r.y === a.y && r.x > a.x);
  assert.ok(a.x + a.w - b.x >= a.w / 4 - 1);
});

test('text: the street sign, the house number and the number plate', async () => {
  const img = picture('./fixtures/street.rgba.gz'), boxes = await findText(img);
  // the plate's letters (dark on the white plate), the house number (dark on the wall), the sign's letters (white, rotated 8°)
  for (const [what, region, test] of [['plate', [372, 692, 588, 743], dark], ['house number', [932, 97, 1183, 478], dark], ['sign', [64, 80, 360, 200], white]])
    assert.ok(covered(boxes, img, ink(img, region, test)), `${what}: ${JSON.stringify(ink(img, region, test))} under a cover: ${show(boxes)}`);
});

test('text: every line of a screenshot', async () => {
  const img = picture('./fixtures/screenshot.rgba.gz'), boxes = await findText(img);
  for (let k = 0; k < 6; k++) {
    const line = ink(img, [0, 70 + k * 55, 540, 70 + k * 55 + 45], dark);
    // a line may be found as one region or as words: every ink pixel must be under some cover
    const under = (x, y) => boxes.some(b => { const p = D.pad(b, img.w, img.h); return x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h; });
    let missed = 0;
    for (let y = line[1]; y < line[3]; y++) for (let x = line[0]; x < line[2]; x++) { const o = (y * img.w + x) * 4; if (dark(img.data[o], img.data[o + 1], img.data[o + 2]) && !under(x, y)) missed++; }
    assert.equal(missed, 0, `line ${k + 1}: ink pixels left uncovered ${show(boxes)}`);
  }
});

test('codes: QR code and barcode read offline (the bundled WebAssembly, no download)', async () => {
  vm.runInThisContext(file('../src/vendor/zxing-reader.js').toString('utf8'), { filename: 'zxing-reader.js' });   // defines ZXingWASM, as in the worker
  const Z = globalThis.ZXingWASM;
  assert.ok(Z, 'code reader loaded');
  await Z.prepareZXingModule({ overrides: { wasmBinary: gz('../src/vendor/zxing_reader.wasm.gz') }, fireImmediately: true });
  const img = picture('./fixtures/screenshot.rgba.gz');
  const found = await Z.readBarcodes({ data: img.data, width: img.w, height: img.h }, { formats: [], tryHarder: true });
  assert.deepEqual(found.map(c => c.format).sort(), ['Code128', 'QRCode']);
  // the cover over each code holds all of its modules (bars)
  for (const [fmt, region] of [['QRCode', [145, 600, 395, 850]], ['Code128', [70, 920, 470, 1040]]]) {
    const b = D.codeBox(found.find(c => c.format === fmt).position, img.w, img.h);
    assert.ok(inside(D.pad(b, img.w, img.h), ink(img, region, dark)), `${fmt}: ${JSON.stringify(b)} holds ${ink(img, region, dark)}`);
  }
});

test('covers: margin, solid fill and mosaic change the box and nothing else', () => {
  const W = 60, H = 40, base = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) base.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
  const b = D.pad({ x: 10, y: 10, w: 20, h: 10 }, W, H);
  assert.deepEqual([b.x, b.y, b.w, b.h], [7, 7, 26, 16], 'at least 3 pixels of margin');
  assert.deepEqual(D.pad({ x: 0, y: 0, w: 60, h: 40 }, W, H), { x: 0, y: 0, w: 60, h: 40, score: undefined }, 'kept inside the picture');
  let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const paint of [img => D.fill(img, W, H, b, [0, 0, 0]), img => D.mosaic(img, W, H, b, rand)]) {
    const img = new Uint8ClampedArray(base);
    paint(img);
    let insideSame = 0, outsideChanged = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4, same = img[o] === base[o] && img[o + 1] === base[o + 1] && img[o + 2] === base[o + 2];
      const inBox = x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
      if (inBox && same) insideSame++; if (!inBox && !same) outsideChanged++;
    }
    assert.equal(outsideChanged, 0, 'nothing outside the box changes');
    assert.ok(insideSame <= 2, `pixels inside left as they were: ${insideSame}`);   // a mosaic block may by chance equal one pixel
  }
  // the mosaic is blocks: within a block every pixel is the same colour
  const img = new Uint8ClampedArray(base); D.mosaic(img, W, H, b, rand);
  const at = (x, y) => Array.from(img.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)).join();
  assert.equal(at(b.x, b.y), at(b.x + 5, b.y + 5));
});

test('text input sizes are multiples of 32 and never larger than the limit', () => {
  for (const [w, h] of [[4000, 3000], [1080, 2400], [20, 20], [1280, 960]]) {
    const s = D.textSize(w, h);
    assert.equal(s.w % 32, 0); assert.equal(s.h % 32, 0);
    assert.ok(Math.max(s.w, s.h) <= D.TEXT.maxSide + 16 && Math.min(s.w, s.h) >= 32, JSON.stringify(s));
  }
});
