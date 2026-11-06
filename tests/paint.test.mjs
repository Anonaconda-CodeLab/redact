// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Painting covers into the pixels (solid, colour from around, brush strokes, the face mosaic) and the check of a saved
// picture: it must catch any cover that didn't come out, and pass overlapping covers of different colours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../src/detect.js');
await import('../src/paint.js');
const Paint = globalThis.RedactPaint;

// a 100 x 60 picture with a busy pattern, a white band at the top (the "paper") and dark text-like marks in it
function picture() {
  const W = 100, H = 60, data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, v = y < 20 ? ((x % 7 < 2 && y > 6 && y < 14) ? 20 : 250) : (x * 7 + y * 13) % 256;
    data.set([v, y < 20 ? v : (x * 3) % 256, y < 20 ? v : (y * 5) % 256, 255], o);
  }
  return { w: W, h: H, data };
}
const copy = img => ({ w: img.w, h: img.h, data: new Uint8ClampedArray(img.data) });
const px = (img, x, y) => Array.from(img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 3));
let seed = 1; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

test('solid covers replace every pixel inside, and nothing outside; covers that are off are not painted', () => {
  const o = picture(), img = copy(o);
  const covers = [{ id: 1, cat: 'cards', on: true, x: 30, y: 25, w: 20, h: 10 }, { id: 2, cat: 'text', on: false, x: 0, y: 40, w: 100, h: 20 }];
  const p = Paint.paint(img, covers, { colour: 'black', faces: 'solid' }, rand, 1);
  assert.equal(p.length, 1);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const inBox = x >= 30 && x < 50 && y >= 25 && y < 35;
    if (inBox) assert.deepEqual(px(img, x, y), [0, 0, 0]); else assert.deepEqual(px(img, x, y), px(o, x, y), `${x},${y}`);
  }
  assert.ok(Paint.check(img, o, p, 0).ok);
});

test('colour from around: the background, not the letters next to the cover', () => {
  const img = picture();
  // a cover over the marks in the white band: its ring crosses dark marks, but most of it is white paper
  assert.deepEqual(Paint.around(img, { x: 10, y: 5, w: 40, h: 10 }), [250, 250, 250]);
  const p = Paint.paint(img, [{ id: 1, cat: 'text', on: true, x: 10, y: 5, w: 40, h: 10 }], { colour: 'around', faces: 'solid' }, rand, 1);
  assert.deepEqual(p[0].rgb, [250, 250, 250]); assert.deepEqual(px(img, 20, 10), [250, 250, 250]);
});

test('a brush stroke covers the pixels along its line, out to its radius', () => {
  const o = picture(), img = copy(o);
  const c = { id: 1, cat: 'hand', on: true, pts: [[10, 30], [90, 30]], r: 4, x: 6, y: 26, w: 88, h: 8 };
  const p = Paint.paint(img, [c], { colour: 'white', faces: 'solid' }, rand, 1);
  assert.deepEqual(px(img, 50, 30), [255, 255, 255]); assert.deepEqual(px(img, 50, 33), [255, 255, 255]);
  assert.deepEqual(px(img, 50, 36), px(o, 50, 36), 'beyond the radius');
  assert.deepEqual(px(img, 2, 30), px(o, 2, 30), 'beyond the end');
  assert.ok(Paint.check(img, o, p, 0).ok);
});

test('display copy: covers in picture pixels are scaled', () => {
  const img = picture();
  Paint.paint(img, [{ id: 1, cat: 'cards', on: true, x: 60, y: 50, w: 40, h: 20 }], { colour: 'black', faces: 'solid' }, rand, 0.5);
  assert.deepEqual(px(img, 35, 30), [0, 0, 0]); assert.notDeepEqual(px(img, 29, 30), [0, 0, 0]);
});

test('faces: mosaic in blocks when chosen; text is always solid', () => {
  const o = picture(), img = copy(o);
  const covers = [{ id: 1, cat: 'faces', on: true, x: 40, y: 20, w: 42, h: 35 }, { id: 2, cat: 'cards', on: true, x: 0, y: 25, w: 20, h: 10 }];
  const p = Paint.paint(img, covers, { colour: 'black', faces: 'mosaic' }, rand, 1);
  assert.equal(p[0].rgb, null); assert.deepEqual(p[1].rgb, [0, 0, 0]);
  assert.deepEqual(px(img, 41, 21), px(img, 43, 23), 'one block, one colour');
  assert.ok(Paint.check(img, o, p, 0).ok);
});

test('check: overlapping covers of different colours pass (the one painted last wins)', () => {
  const o = picture(), img = copy(o);
  const covers = [{ id: 1, cat: 'codes', on: true, x: 20, y: 25, w: 40, h: 20 }, { id: 2, cat: 'codes', on: true, x: 30, y: 40, w: 40, h: 15 }];
  const p = Paint.paint(img, covers, { colour: 'around', faces: 'solid' }, rand, 1);
  assert.notDeepEqual(p[0].rgb, p[1].rgb, 'the test needs two different colours');
  assert.ok(Paint.check(img, o, p, 0).ok);
  assert.ok(Paint.check(img, o, p, 24).ok, 'with JPEG tolerance too');
});

test('check: a cover that did not come out is caught, exactly for PNG and beyond the edges for JPEG', () => {
  const o = picture(), img = copy(o);
  const p = Paint.paint(img, [{ id: 1, cat: 'cards', on: true, x: 30, y: 25, w: 20, h: 10 }], { colour: 'black', faces: 'solid' }, rand, 1);
  const one = copy(img); one.data.set([1, 0, 0], (30 * one.w + 40) * 4);
  assert.ok(!Paint.check(one, o, p, 0).ok, 'one pixel off by one, PNG');
  assert.ok(Paint.check(one, o, p, 24).ok, 'within JPEG tolerance');
  const leak = copy(img); leak.data.set(o.data.subarray((30 * o.w + 40) * 4, (30 * o.w + 40) * 4 + 3), (30 * leak.w + 40) * 4);
  assert.ok(!Paint.check(leak, o, p, 24).ok, 'an original pixel left inside, even with JPEG tolerance');
  const r = Paint.check(o, o, p, 0);
  assert.ok(!r.ok); assert.match(r.problems[0].why, /200 of 200 pixels/);
  // a mosaic that left the face as it was
  const q = Paint.paint(copy(o), [{ id: 2, cat: 'faces', on: true, x: 40, y: 20, w: 40, h: 30 }], { colour: 'black', faces: 'mosaic' }, rand, 1);
  assert.ok(!Paint.check(o, o, q, 0).ok);
});

test('coverage: a find counts as covered only when most of it is under covers that are on (security review 2)', () => {
  const face = { x: 100, y: 100, w: 100, h: 120 };
  const C = (on, x, y, w, h) => ({ id: Math.random(), cat: 'hand', on, x, y, w, h });
  assert.equal(Paint.coverage(face, []), 0);
  assert.equal(Paint.coverage(face, [C(true, 90, 90, 130, 140)]), 1, 'all of it');
  const half = Paint.coverage(face, [C(true, 100, 100, 100, 60)]);
  assert.ok(Math.abs(half - 0.5) < 0.05, `half covered: ${half}`);
  assert.ok(Paint.coverage(face, [C(true, 95, 130, 110, 25)]) < 0.3, 'a bar over the eyes');
  assert.equal(Paint.coverage(face, [C(false, 90, 90, 130, 140)]), 0, 'a cover that is off covers nothing');
  // two covers that together hide it
  assert.equal(Paint.coverage(face, [C(true, 90, 90, 130, 75), C(true, 90, 160, 130, 70)]), 1);
  // a brush stroke counts by its painted width, not its whole box
  const stroke = { id: 1, cat: 'hand', on: true, pts: [[100, 160], [200, 160]], r: 10, x: 90, y: 150, w: 120, h: 20 };
  const s = Paint.coverage(face, [stroke]);
  assert.ok(s > 0.1 && s < 0.25, `a 20-pixel stroke across a 120-pixel face: ${s}`);
});
