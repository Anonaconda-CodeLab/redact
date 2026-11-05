// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Checks the built page (run after `node build.mjs`): no network, everything inlined, settings filled in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const dist = f => readFileSync(new URL('../dist/' + f, import.meta.url), 'utf8');
const file = f => readFileSync(new URL('../' + f, import.meta.url));
const pkg = JSON.parse(file('package.json'));
const html = dist('index.html');

const directives = csp => {
  const dirs = new Map();
  for (const part of csp.split(';').map(x => x.trim()).filter(Boolean)) {
    const [name, ...values] = part.split(/\s+/);
    assert.ok(!dirs.has(name), `${name} appears once`);
    dirs.set(name, values.join(' '));
  }
  return dirs;
};

test('page blocks all network access', () => {
  const dirs = directives(/http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1]);
  // the blocking ones are exactly 'none' (nothing added after it)
  for (const d of ['default-src', 'connect-src', 'form-action', 'frame-src', 'media-src', 'object-src', 'base-uri']) assert.equal(dirs.get(d), "'none'", d);
  assert.equal(dirs.get('worker-src'), 'blob:');
  assert.equal(dirs.get('script-src'), "'unsafe-inline' 'wasm-unsafe-eval'", 'no JavaScript eval (only WebAssembly), no script from anywhere');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external scripts');
  assert.ok(!/sourceMappingURL/.test(html), 'no source map reference');
  assert.ok(!/target="_blank"/.test(html), 'links open in the same tab');
});

test('headers: a second block on connections, no framing, no camera, *.pages.dev kept out of search engines', () => {
  const h = dist('_headers');
  const dirs = directives(/Content-Security-Policy: (.*)/.exec(h)[1]);
  assert.equal(dirs.get('connect-src'), "'none'"); assert.equal(dirs.get('frame-ancestors'), "'none'");
  assert.match(h, /Permissions-Policy: camera=\(\), microphone=\(\)/);
  assert.match(h, /https:\/\/:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex/);
  for (const k of ['Referrer-Policy: no-referrer', 'X-Content-Type-Options: nosniff', 'Cross-Origin-Opener-Policy: same-origin', 'Strict-Transport-Security']) assert.ok(h.includes(k), k);
});

test('everything is inlined: engines, models, five languages, app', () => {
  for (const id of ['srcDetect', 'srcOcr', 'binOrt', 'binText', 'binFace', 'binCodes', 'binWasm', 'binLang-eng', 'binLang-fra', 'binLang-spa', 'binLang-deu', 'binLang-tha'])
    assert.ok(html.includes(`id="${id}"`), id);
  const worker = /<script type="text\/plain" id="srcDetect">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.match(worker, /const ort=\{[^}]*InferenceSession:[^}]*Tensor:[^}]*env:/, 'the runtime is one module with the worker');
  assert.ok(!/\bexport\s*\{/.test(worker) && !/^\s*import\s/m.test(worker), 'no imports or exports left in the worker');
  assert.match(worker, /prepareZXingModule\(\{ overrides: \{ wasmBinary:/, 'the code reader gets its WebAssembly as bytes (it would fetch it from a CDN otherwise)');
  const ocr = /<script type="text\/plain" id="srcOcr">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.ok(ocr.includes('TesseractCore') && ocr.includes('FlatbedOcrEngine'));
  for (const g of ['RedactPicture', 'RedactDetect', 'RedactText', 'RedactPaint', 'UnmarkedClean', 'RedactApp', 'RedactEditor', 'RedactSave']) assert.ok(html.includes(g), g);
  assert.ok(html.includes(`Version ${pkg.version}`));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(html), 'unfilled placeholder');
  assert.ok(html.length < 24 * 1048576, 'page under 24 MB (Cloudflare Pages serves files up to 25 MiB)');
});

test('the screens, the two ways in, the donation card', () => {
  for (const id of ['scrHome', 'scrFirst', 'scrEdit', 'scrCheck', 'scrSettings', 'scrAbout', 'scrHelp', 'photoInput', 'fileInput', 'stage', 'findForm', 'btnCheck', 'btnSave', 'donateCard', 'langChips'])
    assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /<input type="file" id="photoInput" multiple accept="image\/jpeg,image\/png,image\/webp/, 'Open photos: pictures only (the photo picker)');
  assert.match(html, /<input type="file" id="fileInput" multiple>/, 'Browse files: any file, any folder (Redact refuses what isn\'t a picture)');
  for (const l of ['eng', 'fra', 'spa', 'deu', 'tha']) assert.ok(html.includes(`data-lang="${l}"`), l);
});

test('the Android page and its links are off until the launch', () => {
  assert.ok(!existsSync(new URL('../dist/android.html', import.meta.url)));
  assert.ok(!/android\.html/.test(html));
});

test('pictures, words and results are kept from browser translators', () => {
  for (const id of ['pics', 'stage', 'findIn', 'findList', 'checkImg', 'checkSub', 'editN']) assert.match(html, new RegExp(`id="${id}"[^>]*translate="no"|translate="no"[^>]*id="${id}"`), id);
});
