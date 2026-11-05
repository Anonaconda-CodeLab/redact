// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Reading what the text detector found, offline (every network call fails here): the regions of a screenshot are read
// in one strip by Flatbed's engine, the card number, email and phone number are found, and their covers hold exactly
// those words' ink, not the labels before them. A railing is found as "text" by the detector but reads as nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

globalThis.fetch = async u => { throw new Error('network access attempted: ' + u); };
// the engine looks for Node's require() when it runs in Node (in the app it runs in a browser worker)
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url));
const file = f => readFileSync(new URL(f, import.meta.url));
const gz = f => new Uint8Array(gunzipSync(file(f)));
await import('../src/detect.js'); await import('../src/text.js');
vm.runInThisContext(file('../src/vendor/tesseract-core-simd-lstm.js').toString('utf8'), { filename: 'tesseract-core-simd-lstm.js' });
await import('../src/ocr-engine.js');
const D = globalThis.RedactDetect, T = globalThis.RedactText;
const ort = await import('../src/vendor/ort.wasm.bundle.min.mjs');
ort.env.wasm.wasmBinary = gz('../src/vendor/ort-wasm-simd-threaded.wasm.gz'); ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
const model = await ort.InferenceSession.create(file('../src/models/ppocrv4-det.onnx'));
const eng = globalThis.FlatbedOcrEngine.createEngine(globalThis.TesseractCore);
await eng.init(gz('../src/vendor/tesseract-core-simd-lstm.wasm.gz'));
eng.addLang('eng', gz('../src/lang/eng.traineddata.gz'));

function picture(f) {
  const b = gz(f), nl = b.indexOf(10), [w, h] = new TextDecoder().decode(b.subarray(0, nl)).split(' ').map(Number);
  return { w, h, data: new Uint8ClampedArray(b.buffer, b.byteOffset + nl + 1, w * h * 4) };
}
const sample = (img, x, y) => { const sx = Math.min(img.w - 1, Math.max(0, Math.floor(x))), sy = Math.min(img.h - 1, Math.max(0, Math.floor(y))), o = (sy * img.w + sx) * 4; return [img.data[o], img.data[o + 1], img.data[o + 2]]; };
async function read(img) {
  const { w, h } = D.textSize(img.w, img.h), px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = sample(img, (x + 0.5) * img.w / w, (y + 0.5) * img.h / h); px.set([r, g, b, 255], (y * w + x) * 4); }
  const out = await model.run({ [model.inputNames[0]]: new ort.Tensor('float32', D.textInput(px, w, h), [1, 3, h, w]) });
  const regions = D.textBoxes(out[model.outputNames[0]].data, w, h, img.w / w, img.h / h, img.w, img.h);
  const st = T.strip(regions, (r, cw, ch) => {
    const g = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const [a, b, c] = sample(img, r.x + (x + 0.5) * r.w / cw, r.y + (y + 0.5) * r.h / ch); g[y * cw + x] = (a * 299 + b * 587 + c * 114) / 1000; }
    return g;
  });
  const words = regions.length ? T.wordsBack(eng.recognize(T.pgm(st), ['eng']).words, st) : [];
  return regions.map((r, i) => { const ws = words.filter(w => w.region === i); return { r, words: ws, readable: T.readable(ws), found: T.findSensitive(ws) }; });
}
const ink = (img, x0, y0, x1, y1) => {   // the bounding box of dark pixels in a rectangle
  let a = Infinity, b = Infinity, c = -1, d = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const [r, g, bl] = sample(img, x, y); if (r + g + bl < 300) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x + 1); d = Math.max(d, y + 1); } }
  return [a, b, c, d];
};

test('a screenshot: the card number, email and phone number are read and found, and their covers hold just them', async () => {
  const img = picture('./fixtures/screenshot.rgba.gz'), regions = await read(img);
  const all = regions.flatMap(g => g.found.map(f => ({ ...f, g })));
  const kinds = all.map(f => f.kind).sort();
  assert.deepEqual(kinds, ['card', 'email', 'phone'], JSON.stringify(regions.map(g => g.words.map(w => w.text).join(' '))));
  // lines at y = 75 + 55k: "Card: 4111 …" is the third line; the cover must hold the number's ink and not the label's
  for (const [kind, k, labelEnd] of [['card', 2, 90], ['email', 3, 100], ['phone', 4, 105]]) {
    const f = all.find(x => x.kind === kind), ws = f.words.map(i => f.g.words[i]);
    const x0 = Math.min(...ws.map(w => w.x)), y0 = Math.min(...ws.map(w => w.y)), x1 = Math.max(...ws.map(w => w.x + w.w)), y1 = Math.max(...ws.map(w => w.y + w.h));
    const p = D.pad({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, img.w, img.h);
    const [a, b, c, d] = ink(img, labelEnd, 75 + k * 55 - 5, 540, 75 + k * 55 + 40);
    assert.ok(p.x <= a && p.y <= b && p.x + p.w >= c && p.y + p.h >= d, `${kind}: cover ${JSON.stringify(p)} holds the ink ${[a, b, c, d]}`);
    assert.ok(p.x >= labelEnd - 25, `${kind}: the label stays readable (cover starts at ${Math.round(p.x)})`);
  }
});

test('a railing: what the detector takes for text reads as nothing', async () => {
  // upright bars, evenly spaced, like balusters (and a line of real text, so the strip has both)
  const W = 640, H = 480, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const bar = y > 200 && y < 330 && x > 60 && x < 580 && (x - 60) % 26 < 9;
    const v = bar ? 70 : 205 - (y >> 4);
    data.set([v, v * 0.9, v * 0.8, 255], (y * W + x) * 4);
  }
  const regions = await read({ w: W, h: H, data });
  const bars = regions.filter(g => g.r.y < 330 && g.r.y + g.r.h > 200);
  assert.ok(bars.length >= 1, 'the detector takes the railing for text (otherwise this test proves nothing)');
  for (const g of bars) assert.ok(!g.readable, `bars read as ${JSON.stringify(g.words.map(w => w.text).join(' '))}`);
  for (const g of regions) assert.deepEqual(g.found, []);
});
