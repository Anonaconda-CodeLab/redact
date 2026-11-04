/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- the detection worker ----------
   Runs in a module worker started from a blob: address the page makes from its own inlined code (build.mjs puts ONNX
   Runtime, the code reader and detect.js in front of this file). Nothing is downloaded: the page hands over the
   WebAssembly code and the models as bytes, and the page's policy blocks every connection anyway.

   Messages in:  { type: 'init', bin: { ort, text, face, codes } }   (ArrayBuffers)
                 { type: 'detect', id, bitmap, tiles }                (an ImageBitmap, transferred; closed afterwards;
                                                                      tiles: also look in overlapping parts for small faces)
   Messages out: { type: 'ready' } · { type: 'result', id, w, h, faces, text, codes, ms } · { type: 'error', id, message }
   A code's contents never leave this worker: only where it is and what kind it is. */
const D = globalThis.RedactDetect;
let ready = null, textModel = null, faceModel = null;

async function init(bin) {
  ort.env.wasm.wasmBinary = new Uint8Array(bin.ort);
  ort.env.wasm.numThreads = 1;   // one thread: no cross-origin isolation needed, and as fast on a phone for these models
  ort.env.wasm.proxy = false;
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  textModel = await ort.InferenceSession.create(new Uint8Array(bin.text), opts);
  faceModel = await ort.InferenceSession.create(new Uint8Array(bin.face), opts);
  // the code reader would fetch its WebAssembly from a CDN by default: it gets the bundled bytes instead
  await ZXingWASM.prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(bin.codes) }, fireImmediately: true });
}

function pixels(bm, sx, sy, sw, sh, w, h, dx = 0, dy = 0, cw = w, ch = h) {
  const c = new OffscreenCanvas(cw, ch), g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
  g.drawImage(bm, sx, sy, sw, sh, dx, dy, w, h);
  return g.getImageData(0, 0, cw, ch);
}

async function findText(bm, W, H) {
  const { w, h } = D.textSize(W, H);
  const img = pixels(bm, 0, 0, W, H, w, h);
  const r = await textModel.run({ [textModel.inputNames[0]]: new ort.Tensor('float32', D.textInput(img.data, w, h), [1, 3, h, w]) });
  return D.textBoxes(r[textModel.outputNames[0]].data, w, h, W / w, H / h, W, H);
}

async function findFaces(bm, W, H, tiles) {
  const all = [];
  for (const tile of tiles ? D.faceTiles(W, H) : [{ x: 0, y: 0, w: W, h: H }]) {
    const fit = D.faceFit(tile), S = D.FACE.size;
    const img = pixels(bm, tile.x, tile.y, tile.w, tile.h, tile.w * fit.s, tile.h * fit.s, fit.dw, fit.dh, S, S);
    const r = await faceModel.run({ [faceModel.inputNames[0]]: new ort.Tensor('float32', D.faceInput(img.data), [1, 3, S, S]) });
    const out = {}; for (const k of faceModel.outputNames) out[k] = r[k].data;
    all.push(...D.faceBoxes(out, tile, fit));
  }
  return D.nms(all);
}

async function findCodes(bm, W, H) {
  const s = Math.min(1, 4000 / Math.max(W, H)), w = Math.round(W * s), h = Math.round(H * s);
  const img = pixels(bm, 0, 0, W, H, w, h);
  const found = await ZXingWASM.readBarcodes(img, { formats: [], tryHarder: true, maxNumberOfSymbols: 32 });
  return found.filter(c => c.isValid !== false).map(c => {
    const b = D.codeBox(c.position, w, h);
    return { x: b.x / s, y: b.y / s, w: b.w / s, h: b.h / s, score: 1, kind: String(c.format || 'code') };
  });
}

async function detect(bm, tiles) {
  const W = bm.width, H = bm.height, ms = {};
  let t = performance.now();
  const faces = await findFaces(bm, W, H, tiles); ms.faces = performance.now() - t; t = performance.now();
  const text = await findText(bm, W, H); ms.text = performance.now() - t; t = performance.now();
  const codes = await findCodes(bm, W, H); ms.codes = performance.now() - t;
  return { w: W, h: H, faces, text, codes, ms };
}

onmessage = async e => {
  const m = e.data || {};
  try {
    if (m.type === 'init') { ready = init(m.bin); await ready; postMessage({ type: 'ready' }); }
    else if (m.type === 'detect') { await ready; postMessage({ type: 'result', id: m.id, ...(await detect(m.bitmap, m.tiles !== false)) }); }
  } catch (err) {
    postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  } finally {
    if (m.bitmap && m.bitmap.close) m.bitmap.close();
  }
};
