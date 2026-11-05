// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// Finding card and bank numbers, ID numbers, emails, phone numbers, web addresses and long numbers in the words read
// from a region; Find words; the strip of regions handed to the text reader, and mapping its words back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
await import('../src/text.js');
const T = globalThis.RedactText;

// a line of words as the reader gives them (positions don't matter to the patterns)
const line = s => s.split(' ').map((text, i) => ({ text, conf: 90, x: i * 50, y: 0, w: 40, h: 20 }));
const found = s => { const ws = line(s); return T.findSensitive(ws).map(f => `${f.kind}:${f.words.map(k => ws[k].text).join(' ')}`); };

test('checksums', () => {
  assert.ok(T.luhn('4111111111111111')); assert.ok(!T.luhn('4111111111111112'));
  assert.ok(T.ibanOk('GB82 WEST 1234 5698 7654 32')); assert.ok(!T.ibanOk('GB82 WEST 1234 5698 7654 33'));
  assert.ok(T.thaiIdOk('1101700207340')); assert.ok(T.thaiIdOk('3100601234565')); assert.ok(!T.thaiIdOk('1101700207341'));
});

test('card and bank numbers, with or without spaces, and only when the checksum fits', () => {
  assert.deepEqual(found('Card: 4111 1111 1111 1111'), ['card:4111 1111 1111 1111']);
  assert.deepEqual(found('Card 4111-1111-1111-1111 exp'), ['card:4111-1111-1111-1111']);
  assert.deepEqual(found('Card: 4111 111111111111'), ['card:4111 111111111111'], 'spaces lost in reading');
  assert.deepEqual(found('Card 4111 1111 1111 1112'), ['number:4111 1111 1111 1112'], 'a wrong checksum is only a long number');
  assert.deepEqual(found('IBAN: GB82 WEST 1234 5698 7654 32'), ['iban:GB82 WEST 1234 5698 7654 32']);
  assert.deepEqual(found('Card 4lll 1111 1111 1111'), ['card:4lll 1111 1111 1111'], 'l read for 1');
});

test('ID numbers: Thai ID (checked) and passport lines', () => {
  assert.deepEqual(found('ID 1-1017-00207-34-0'), ['thai-id:1-1017-00207-34-0']);
  assert.deepEqual(found('เลขประจำตัว 3 1006 01234 56 5'), ['thai-id:3 1006 01234 56 5']);
  assert.deepEqual(found('P<THASAMPLE<<ALEX<<<<<<<<<<<<<<'), ['mrz:P<THASAMPLE<<ALEX<<<<<<<<<<<<<<']);
});

test('emails, phone numbers and web addresses', () => {
  assert.deepEqual(found('Email: somchai.j@example.com'), ['email:somchai.j@example.com']);
  assert.deepEqual(found('Email: somchai.;@example.com'), ['email:somchai.;@example.com'], 'a dot misread as ;');
  assert.deepEqual(found('Phone: +66 81 234 5678'), ['phone:+66 81 234 5678']);
  assert.deepEqual(found('Call 081-234-5678 now'), ['phone:081-234-5678']);
  assert.deepEqual(found('Tel (02) 123 4567'), ['phone:(02) 123 4567']);
  assert.deepEqual(found('visit www.example.com/help'), ['link:www.example.com/help']);
  assert.deepEqual(found('see https://example.org/a?b=1'), ['link:https://example.org/a?b=1']);
});

test('long numbers, but not dates, amounts or ordinary text', () => {
  assert.deepEqual(found('Order ref 20261104558812'), ['number:20261104558812']);
  assert.deepEqual(found('Account 1234567890'), ['number:1234567890']);
  assert.deepEqual(found('Booking 8812-0045-7731'), ['number:8812-0045-7731']);
  for (const s of ['DOB 01.02.1985', 'Sent 2026-11-05', 'Total 1,250,000.00 baht', 'Payment details', 'Room 1204, floor 12', 'Tuesday 10:30 to 12:45'])
    assert.deepEqual(found(s), [], s);
});

test('Find words: names, addresses and numbers, allowing small reading errors', () => {
  const ws = line('Name: Somchai Jaidee, 12 Elm Street, Chiang Mai 50200 ref AB123456');
  const hit = q => T.findWords([q], ws).map(r => r.map(k => ws[k].text).join(' '));
  assert.deepEqual(hit('Somchai Jaidee'), ['Somchai Jaidee,']);
  assert.deepEqual(hit('somchai'), ['Somchai'], 'case does not matter');
  assert.deepEqual(hit('Somchia'), [], 'short entries must match exactly… (7 letters: one error allowed, but this is two)');
  assert.deepEqual(hit('Somchal'), ['Somchai'], 'one reading error in 7 letters');
  assert.deepEqual(hit('12 Elm Street'), ['12 Elm Street,']);
  assert.deepEqual(hit('AB 123456'), ['AB123456'], 'spaces in the entry or the text don\'t matter');
  assert.deepEqual(hit('Elm'), ['Elm'], 'three letters: exact only');
  assert.deepEqual(hit('Oak Street'), []);
  // a word that contains the entry (an email with the name in it) is found too
  assert.deepEqual(T.findWords(['somchai'], line('mail somchai.j@example.com')).length, 1);
});

test('Find words list file: one entry per line, comments and control characters left out, at most 200', () => {
  assert.deepEqual(T.parseList('# list\nSomchai\r\n\n12 Elm Street\nSomchai\n  Jaidee  \n\u0007bell'), ['Somchai', '12 Elm Street', 'Jaidee', 'bell']);
  assert.equal(T.parseList(Array.from({ length: 300 }, (_, i) => 'w' + i).join('\n')).length, 200);
  assert.deepEqual(T.parseList(T.listText(['a b', 'c'])), ['a b', 'c']);
});

test('the strip: regions scaled to one line height, light-on-dark turned round, words mapped back', () => {
  const regions = [{ x: 100, y: 50, w: 400, h: 20 }, { x: 10, y: 300, w: 60, h: 80 }, { x: 0, y: 0, w: 5000, h: 10 }];
  const st = T.strip(regions, (r, w, h) => new Uint8Array(w * h).fill(r === regions[1] ? 20 : 200));
  assert.equal(st.slots.length, 3);
  const [a, b, c] = st.slots;
  assert.equal(a.h, T.LINE); assert.equal(a.w, 800); assert.equal(b.h, T.LINE);
  assert.ok(c.w <= 1800 && c.h < T.LINE, 'a very wide region is narrowed');
  assert.ok(b.y > a.y + a.h && c.y > b.y + b.h, 'one below the other, with gaps');
  assert.equal(st.grey[(b.y + 5) * st.w + b.x + 5], 235, 'dark region turned round');
  assert.equal(st.grey[(a.y + 5) * st.w + a.x + 5], 200);
  const pg = T.pgm(st); assert.equal(new TextDecoder().decode(pg.subarray(0, 3)), 'P5\n');
  // a word in the middle of the first slot maps to the middle of the first region
  const back = T.wordsBack([{ text: 'x', conf: 90, x: a.x + 200, y: a.y + 10, w: 400, h: 20 }, { text: 'gap', conf: 90, x: 0, y: st.h - 4, w: 3, h: 2 }], st);
  assert.equal(back.length, 1);
  assert.deepEqual([back[0].region, back[0].x, back[0].y, back[0].w, back[0].h], [0, 200, 55, 200, 10]);
});

test('readable: letters or digits, not a few stray marks', () => {
  assert.ok(T.readable(line('AB 1234')));
  assert.ok(!T.readable([{ text: '|||', conf: 30 }, { text: 'I', conf: 50 }]));
  assert.ok(!T.readable([]));
});
