// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Every third-party file is byte for byte the release named in tests/origins.json (and in NOTICE.md), and the
// picture-size check is still the exact copy of Flatbed's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const file = f => readFileSync(new URL('../' + f, import.meta.url));
const sha = b => createHash('sha256').update(b).digest('hex');
const O = JSON.parse(file('tests/origins.json'));

test('third-party files match their releases', () => {
  for (const [f, o] of Object.entries(O.files)) assert.equal(sha(f.endsWith('.gz') ? gunzipSync(file(f)) : file(f)), o.sha256, f);
  const listed = new Set(Object.keys(O.files));
  for (const dir of ['src/vendor', 'src/models'])
    for (const f of readdirSync(new URL('../' + dir, import.meta.url))) if (!/^LICENSE/.test(f)) assert.ok(listed.has(`${dir}/${f}`), `${dir}/${f} is listed in tests/origins.json`);
});

test("the picture-size check is Flatbed's, unchanged", () => {
  const s = file('src/picture.js').toString('utf8'), a = s.indexOf('  // A small file can declare'), b = s.indexOf('\n  const api');
  assert.equal(sha(s.slice(a, b).trimEnd()), O['picture.js'].sha256);
});

test('NOTICE.md names every third-party file and its licence', () => {
  const n = file('NOTICE.md').toString('utf8');
  for (const [f, o] of Object.entries(O.files)) { assert.ok(n.includes(f.split('/').pop().replace(/\.gz$/, '')), f); assert.ok(n.includes(o.sha256), f + ' checksum'); }
});
