/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact text: reading regions, finding numbers and addresses, Find words ----------
   Plain JavaScript, no DOM, no network: runs in the page and in Node (the tests).

   The text detector finds where text is; Tesseract (Flatbed's engine) reads it. Reading every region of a picture one
   by one would start the engine dozens of times, so the regions are cut out, scaled to one line height and stacked
   into a single tall grey picture (a "strip"); the words Tesseract finds in the strip are mapped back to the picture.

   API (on the global RedactText):
     strip(regions, crop)          -> { w, h, grey, slots }   crop(region, w, h) -> grey Uint8Array of w x h
     pgm(strip)                    -> Uint8Array, the strip as a PGM (P5) file for the engine
     wordsBack(words, strip)       -> [{ text, conf, region, x, y, w, h }] in picture pixels (words outside a slot dropped)
     readable(words)               -> true when a region's words hold real letters or digits (not a railing or a fence)
     findSensitive(words)          -> [{ cat, kind, words: [indexes] }] card and bank numbers, ID numbers, emails,
                                      phone numbers, web addresses and long numbers in one region's words
     findWords(queries, words)     -> [[indexes]] runs of words matching any query (small reading errors allowed)
     parseList(text) / listText(queries) -> the Find words list from / to a text file (one entry per line)
     luhn(digits), ibanOk(s), thaiIdOk(digits) -> checksums */
(function (root) {
  'use strict';

  // ---------- the strip ----------
  const LINE = 40, GAP = 24, MARGIN = 16, MAX_W = 1800, MAX_UP = 4;
  // each region scaled so its height is LINE pixels (at most 4 times larger; wide ones narrower), one below the other
  function strip(regions, crop) {
    const slots = [];
    let y = MARGIN, W = 0;
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i];
      if (!(r.w >= 2 && r.h >= 2)) continue;
      let s = Math.min(MAX_UP, LINE / r.h);
      if (r.w * s > MAX_W) s = MAX_W / r.w;
      const w = Math.max(1, Math.round(r.w * s)), h = Math.max(1, Math.round(r.h * s));
      slots.push({ region: i, x: MARGIN, y, w, h, sx: r.w / w, sy: r.h / h, ox: r.x, oy: r.y });
      y += h + GAP; W = Math.max(W, w + 2 * MARGIN);
    }
    const H = Math.max(1, y - GAP + MARGIN);
    W = Math.max(W, 64);
    const grey = new Uint8Array(W * H).fill(255);
    for (const s of slots) {
      const g = crop(regions[s.region], s.w, s.h);
      // light text on a dark background (a sign, a dark-mode screenshot) is turned round: the engine reads dark on light
      let sum = 0; for (let k = 0; k < g.length; k++) sum += g[k];
      const flip = sum / g.length < 110;
      for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
        const v = g[yy * s.w + xx];
        grey[(s.y + yy) * W + s.x + xx] = flip ? 255 - v : v;
      }
    }
    return { w: W, h: H, grey, slots };
  }

  function pgm(st) {
    const head = new TextEncoder().encode(`P5\n${st.w} ${st.h}\n255\n`), out = new Uint8Array(head.length + st.grey.length);
    out.set(head); out.set(st.grey, head.length);
    return out;
  }

  // a word belongs to the slot its centre is in; its box is mapped back to the picture
  function wordsBack(words, st) {
    const out = [];
    for (const w of words) {
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      const s = st.slots.find(q => cy >= q.y - GAP / 2 && cy < q.y + q.h + GAP / 2 && cx >= q.x - MARGIN && cx < q.x + q.w + MARGIN);
      if (!s) continue;
      const x0 = Math.max(0, w.x - s.x), y0 = Math.max(0, w.y - s.y), x1 = Math.min(s.w, w.x + w.w - s.x), y1 = Math.min(s.h, w.y + w.h - s.y);
      if (x1 <= x0) continue;
      out.push({ text: w.text, conf: w.conf, region: s.region, x: s.ox + x0 * s.sx, y: s.oy + Math.max(0, y0) * s.sy, w: (x1 - x0) * s.sx, h: Math.max(1, y1 - y0) * s.sy });
    }
    return out;
  }

  // at least two letters or digits read with some confidence: a railing, a fence or a brick wall reads as nothing or
  // as a few stray marks
  function readable(words) {
    let n = 0;
    for (const w of words) if (w.conf >= 40) n += (w.text.match(/[\p{L}\p{N}]/gu) || []).length;
    return n >= 2;
  }

  // ---------- checksums ----------
  function luhn(d) {
    let sum = 0;
    for (let i = 0; i < d.length; i++) { let v = +d[d.length - 1 - i]; if (i % 2) { v *= 2; if (v > 9) v -= 9; } sum += v; }
    return d.length >= 12 && sum % 10 === 0;
  }
  function ibanOk(s) {
    const t = s.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(t)) return false;
    const r = (t.slice(4) + t.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
    let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97;
    return m === 1;
  }
  function thaiIdOk(d) {
    if (!/^\d{13}$/.test(d)) return false;
    let s = 0; for (let i = 0; i < 12; i++) s += +d[i] * (13 - i);
    return (11 - s % 11) % 10 === +d[12];
  }

  // ---------- sensitive text in one region ----------
  // the region's words joined with single spaces; each match is mapped back to the words it touches. Reading errors
  // that turn digits into letters (O for 0, l or I for 1, S for 5, B for 8) are allowed inside number-like runs.
  const DIGITISH = { O: '0', o: '0', D: '0', Q: '0', l: '1', I: '1', '|': '1', i: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9' };
  const asDigits = s => s.replace(/[OoDQlI|iSsBZzGbgq]/g, c => DIGITISH[c]);
  const DATE = /^(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})$/, AMOUNT = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/;
  const PATTERNS = [
    // order matters: a run is taken by the first pattern that claims it
    // the part before the @ may hold anything but spaces: reading errors turn a dot or a letter into ; or :
    { cat: 'emails', kind: 'email', re: /[^\s@]{1,64} ?@ ?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu },
    { cat: 'links', kind: 'link', re: /\b(?:https?:\/\/|www\.)\S+|\b[\p{L}\p{N}-]+\.(?:com|net|org|co|io|me|info|th|uk|de|fr|es|app|dev)(?:\/\S*)?\b/giu },
    { cat: 'ids', kind: 'mrz', re: /[A-Z0-9<]{2,}<<[A-Z0-9<]{6,}/g },
    { cat: 'cards', kind: 'iban', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{2,4}){3,8}\b/g, ok: m => ibanOk(m) },
    { cat: 'ids', kind: 'thai-id', re: /\b\d[\d -]{14,20}\d\b/g, digits: true, ok: (m, d) => thaiIdOk(d) },
    { cat: 'cards', kind: 'card', re: /\b\d(?:[ -]?\d){12,18}\b/g, digits: true, ok: (m, d) => luhn(d) },
    { cat: 'phones', kind: 'phone', re: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,4}\)[ .-]?)?\d{2,4}(?:[ .-]?\d{2,4}){2,4}\b/g, digits: true, ok: (m, d) => d.length >= 9 && d.length <= 15 && /^(?:\+|\(?0)/.test(m.trim()) },   // international (+66 …) or a national number (08…, (02) …)
    // dates (01.02.1985, 2026-11-05) and amounts with separators (1,250,000.00) are not account or booking numbers
    { cat: 'numbers', kind: 'number', re: /\b\d(?:[ .,/-]?\d){7,}\b/g, digits: true, ok: (m, d) => d.length >= 8 && !DATE.test(m.trim()) && !AMOUNT.test(m.trim()) }
  ];
  function joined(words) {
    let s = ''; const at = [];
    words.forEach((w, i) => { if (i) s += ' '; at.push([s.length, s.length + w.text.length]); s += w.text; });
    return { s, at };
  }
  const touching = (at, a, b) => at.map((r, i) => r[1] > a && r[0] < b ? i : -1).filter(i => i >= 0);
  function findSensitive(words) {
    const { s, at } = joined(words), taken = new Array(s.length).fill(false), out = [];
    // number patterns also run on a copy with look-alike letters turned into digits (same length, same positions)
    // (a token with a digit in it whose other characters all look like digits: "4lll" is 4111, "Room" stays a word)
    const digitised = s.replace(/[\p{L}\p{N}|]+/gu, tok => /\d/.test(tok) && /^[\dOoDQlI|iSsBZzGbgq]+$/.test(tok) ? asDigits(tok) : tok);
    for (const p of PATTERNS) {
      const text = p.digits ? digitised : s;
      p.re.lastIndex = 0;
      for (let m; (m = p.re.exec(text));) {
        const a = m.index, b = a + m[0].length;
        if (taken.slice(a, b).some(Boolean)) continue;
        const d = m[0].replace(/\D/g, '');
        if (p.ok && !p.ok(m[0], d)) continue;
        for (let k = a; k < b; k++) taken[k] = true;
        out.push({ cat: p.cat, kind: p.kind, words: touching(at, a, b) });
      }
    }
    return out;
  }

  // ---------- Find words ----------
  const norm = s => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  function distance(a, b, max) {   // Levenshtein, giving up past max
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // allowed reading errors: none in short entries, one from 5 characters, two from 10
  const allow = n => n >= 10 ? 2 : n >= 5 ? 1 : 0;
  function findWords(queries, words) {
    const qs = queries.map(q => ({ n: norm(q), parts: q.trim().split(/\s+/).length })).filter(q => q.n.length >= 2);
    const hits = [], used = new Set();
    for (const q of qs) {
      for (let i = 0; i < words.length; i++) {
        // runs of one to (words in the entry + 2) words: "12 Elm St" may be read as "12", "Elm", "St." or as "12Elm St"
        for (let k = 1; k <= Math.min(words.length - i, q.parts + 2); k++) {
          const run = norm(words.slice(i, i + k).map(w => w.text).join(''));
          if (!run) continue;
          const hit = distance(run, q.n, allow(q.n.length)) <= allow(q.n.length) || (q.n.length >= 4 && k === 1 && run.includes(q.n));
          if (!hit) { if (run.length > q.n.length + 2) break; continue; }
          const idx = Array.from({ length: k }, (_, j) => i + j), key = idx.join();
          if (!used.has(key)) { used.add(key); hits.push(idx); }
          i += k - 1;   // the words of this match are not the start of another one
          break;
        }
      }
    }
    return hits;
  }
  // the saved list: plain text, one entry per line (blank lines and lines starting with # ignored), at most 200 entries
  function parseList(text) {
    const out = [];
    for (const line of String(text).split(/\r?\n/)) {
      const t = line.replace(/[\u0000-\u001f\u007f]/g, '').trim();
      if (!t || t.startsWith('#') || t.length > 200 || out.includes(t)) continue;
      out.push(t);
      if (out.length >= 200) break;
    }
    return out;
  }
  const listText = qs => '# Redact: Find words list (one entry per line)\n' + qs.join('\n') + '\n';

  root.RedactText = { LINE, strip, pgm, wordsBack, readable, findSensitive, findWords, parseList, listText, luhn, ibanOk, thaiIdOk, norm, distance };
})(typeof globalThis !== 'undefined' ? globalThis : this);
