/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact: the detection test page ----------
   Opens pictures, hands each one to the detection worker and shows what was found: outlines, or a preview of black
   covers and the face mosaic, drawn on a display copy only. Nothing is saved and nothing leaves the device (the page's
   policy blocks every connection). The editor and saving come next. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MAX_BYTES = 60 * 1024 * 1024;   // larger files are refused before they are read in full
  const KINDS = new Set(['jpeg', 'png', 'webp']);   // version 1: JPEG, PNG and WebP
  const SHOW_MAX = 1600;                // the display copy's longer side
  const P = globalThis.RedactPicture, D = globalThis.RedactDetect;
  const APP = { name: '{{APP_NAME}}', version: '{{VERSION}}' };
  const state = { look: 'outline', faceMin: 0.6, items: [], queue: Promise.resolve(), worker: null, ready: null, next: 1 };

  // ---------- screens ----------
  const screens = ['scrHome', 'scrAbout', 'scrHelp'];
  const show = id => { for (const s of screens) $(s).hidden = s !== id; window.scrollTo(0, 0); };
  $('btnHome').onclick = () => show('scrHome');
  $('btnAbout').onclick = () => show('scrAbout');
  $('btnAboutBack').onclick = () => show('scrHome');
  $('btnHelp').onclick = $('btnHelp2').onclick = () => show('scrHelp');
  $('btnHelpBack').onclick = () => show('scrAbout');
  // Android's Back button: back inside the app first (MainActivity asks this)
  window.redactBack = () => {
    if (!$('scrHelp').hidden) { show('scrAbout'); return true; }
    if (!$('scrAbout').hidden) { show('scrHome'); return true; }
    return false;
  };

  // ---------- the detection worker ----------
  // the worker's code sits in the page as plain text; the engines and models are gzipped base64 (see build.mjs)
  async function unpack(id) {
    const b = atob($(id).textContent.trim()), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  function startWorker() {
    const url = URL.createObjectURL(new Blob([$('srcDetect').textContent], { type: 'text/javascript' }));
    const w = new Worker(url, { type: 'module', name: 'detect' });
    const waiting = new Map();
    state.ready = new Promise((resolve, reject) => {
      w.onmessage = e => {
        const m = e.data || {};
        if (m.type === 'ready') { URL.revokeObjectURL(url); resolve(); return; }
        const p = waiting.get(m.id);
        if (m.type === 'error' && !p) { reject(new Error(m.message)); return; }
        if (!p) return;
        waiting.delete(m.id);
        m.type === 'result' ? p.resolve(m) : p.reject(new Error(m.message));
      };
      w.onerror = e => reject(new Error(e.message || 'the detection worker could not start'));
    });
    state.worker = { w, waiting };
    (async () => {
      const [ort, text, face, codes] = await Promise.all(['binOrt', 'binText', 'binFace', 'binCodes'].map(unpack));
      w.postMessage({ type: 'init', bin: { ort, text, face, codes } }, [ort, text, face, codes]);
    })().catch(err => { $('engineHint').textContent = 'The detectors could not start: ' + err.message; });
    const t0 = performance.now();
    state.ready.then(() => { $('engineHint').textContent = `Detectors ready (${fmt(performance.now() - t0)}).`; },
      err => { $('engineHint').textContent = 'The detectors could not start: ' + err.message; });
  }
  let nextId = 1;
  function detect(bitmap, tiles) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      state.worker.waiting.set(id, { resolve, reject });
      state.worker.w.postMessage({ type: 'detect', id, bitmap, tiles }, [bitmap]);
    });
  }

  // ---------- opening pictures ----------
  const fmt = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s';
  function addFiles(list) {
    for (const f of list) {
      const item = { n: state.next++, el: $('tplResult').content.firstElementChild.cloneNode(true) };
      item.el.querySelector('[data-a="remove"]').onclick = () => { item.el.remove(); state.items = state.items.filter(x => x !== item); };
      item.el.querySelector('[data-a="copy"]').onclick = async e => {
        const b = e.currentTarget;
        try { await navigator.clipboard.writeText(item.el.querySelector('.summary').textContent); b.textContent = 'Copied'; }
        catch { b.textContent = 'Select the text to copy it'; }
        setTimeout(() => { b.textContent = 'Copy summary'; }, 2000);
      };
      item.el.querySelector('.times').textContent = `Picture ${item.n}: waiting…`;
      $('results').prepend(item.el);
      state.items.push(item);
      state.queue = state.queue.then(() => run(item, f)).catch(() => {});
    }
  }

  async function run(item, f) {
    const el = item.el, times = el.querySelector('.times');
    try {
      // a picked or dropped File, or { bytes, size } from the Android app (bytes is null when it was too large to read).
      // Not f.bytes on a File: browsers now give every File a bytes() method.
      const isFile = f instanceof Blob;
      if ((isFile ? f.size : f.bytes ? f.bytes.length : +f.size || 0) > MAX_BYTES || (!isFile && !f.bytes)) throw new Error('This file is too large (the limit is 60 MB).');
      const bytes = isFile ? new Uint8Array(await f.arrayBuffer()) : f.bytes;
      const big = P.tooLarge(bytes);
      if (big) throw new Error(big.bad ? 'This picture looks damaged: its size could not be read.' : `This picture is too large to open safely (${(big.w * big.h / 1e6).toFixed(0)} megapixels; the limit is ${P.MAX_PIXELS / 1e6}).`);
      const kind = P.pictureSize(bytes);
      if (!kind || !KINDS.has(kind.type)) throw new Error('This test opens JPEG, PNG and WebP pictures only.');
      times.textContent = `Picture ${item.n}: opening…`;
      const t0 = performance.now();
      const full = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' });
      const decodeMs = performance.now() - t0;
      // the display copy, kept as plain pixels so the preview can be redrawn
      const s = Math.min(1, SHOW_MAX / Math.max(full.width, full.height));
      const cv = el.querySelector('canvas');
      cv.width = Math.round(full.width * s); cv.height = Math.round(full.height * s);
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(full, 0, 0, cv.width, cv.height);
      item.base = g.getImageData(0, 0, cv.width, cv.height);
      item.scale = s;
      times.textContent = `Picture ${item.n}: looking…`;
      await state.ready;
      const tiles = $('optTiles').checked;
      const t1 = performance.now();
      const r = await detect(full, tiles);   // the bitmap is handed over and closed by the worker
      item.result = r; item.tiles = tiles;
      item.ms = { decode: decodeMs, total: performance.now() - t1, ...r.ms };
      el.querySelector('.progress').remove();
      draw(item);
    } catch (err) {
      el.classList.add('failed');
      const p = el.querySelector('.progress'); if (p) p.remove();
      el.querySelector('canvas').remove();
      el.querySelector('[data-a="copy"]').remove();
      times.textContent = `Picture ${item.n}: ${err.message}`;
      el.querySelector('.summary').textContent = '';
      el.querySelector('.summary').hidden = true;
    }
  }

  // ---------- showing what was found ----------
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function draw(item) {
    if (!item.result) return;
    const r = item.result, s = item.scale, el = item.el, cv = el.querySelector('canvas'), g = cv.getContext('2d');
    const faces = r.faces.filter(f => f.score >= state.faceMin);
    const scaled = b => ({ x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s, score: b.score });
    if (state.look === 'outline') {
      g.putImageData(item.base, 0, 0);
      const lw = Math.max(2, Math.round(Math.max(cv.width, cv.height) / 400));
      const box = (b, colour, label) => {
        g.lineWidth = lw; g.strokeStyle = colour; g.strokeRect(b.x, b.y, b.w, b.h);
        if (label) { g.font = `600 ${lw * 6}px sans-serif`; g.fillStyle = colour; g.fillText(label, b.x, Math.max(lw * 6, b.y - lw)); }
      };
      for (const b of r.text) box(scaled(b), css('--text'));
      for (const b of r.codes) box(scaled(b), css('--code'));
      for (const b of faces) box(scaled(b), css('--face'), b.score.toFixed(2));
    } else {
      // a preview of the covers on the display copy (the finished app paints them into the full picture)
      const img = new ImageData(new Uint8ClampedArray(item.base.data), item.base.width, item.base.height);
      const W = img.width, H = img.height, rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      for (const b of r.text.concat(r.codes)) D.fill(img.data, W, H, D.pad(scaled(b), W, H), [0, 0, 0]);
      for (const b of faces) {
        const p = D.pad(scaled(b), W, H);
        state.look === 'mosaic' ? D.mosaic(img.data, W, H, p, rand) : D.fill(img.data, W, H, p, [0, 0, 0]);
      }
      g.putImageData(img, 0, 0);
    }
    // the legend, timings and the summary to copy: counts and times only, never the file name or what was read
    const legend = el.querySelector('.legend'); legend.textContent = '';
    for (const [cls, n, word] of [['face', faces.length, 'Faces'], ['text', r.text.length, 'Text'], ['code', r.codes.length, 'Codes']]) {
      const c = document.createElement('span'); c.className = 'chip ' + cls;
      c.append(document.createElement('i'), `${word} ${n}`); legend.append(c);
    }
    const m = item.ms, mp = (r.w * r.h / 1e6).toFixed(1);
    el.querySelector('.times').textContent = `Picture ${item.n}: ${r.w} × ${r.h} (${mp} MP). Faces ${fmt(m.faces)}, text ${fmt(m.text)}, codes ${fmt(m.codes)}; ${fmt(m.total)} in all.`;
    const kinds = {}; for (const c of r.codes) kinds[c.kind] = (kinds[c.kind] || 0) + 1;
    el.querySelector('.summary').textContent = [
      `${APP.name} ${APP.version} detection test · ${NATIVE ? 'Android app' : 'browser'} · ${r.w}×${r.h} (${mp} MP)`,
      `faces ${faces.length} at score ≥ ${state.faceMin.toFixed(2)}${faces.length ? ' (' + faces.map(f => f.score.toFixed(2)).join(', ') + ')' : ''}; ${r.faces.length} at ≥ ${D.FACE.minScore.toFixed(2)}; small faces ${item.tiles ? 'on' : 'off'}`,
      `text regions ${r.text.length} · codes ${r.codes.length}${r.codes.length ? ' (' + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ') + ')' : ''}`,
      `times: open ${fmt(m.decode)}, faces ${fmt(m.faces)}, text ${fmt(m.text)}, codes ${fmt(m.codes)}, total ${fmt(m.total)}`
    ].join('\n');
  }
  // ---------- controls ----------
  for (const b of $('lookChips').querySelectorAll('[data-look]')) b.onclick = () => {
    state.look = b.dataset.look;
    for (const o of $('lookChips').querySelectorAll('[data-look]')) o.setAttribute('aria-pressed', String(o === b));
    state.items.forEach(draw);
  };
  $('faceMin').oninput = e => {
    state.faceMin = +e.target.value; $('faceMinOut').textContent = state.faceMin.toFixed(2);
    state.items.forEach(draw);
  };
  $('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  // drop pictures anywhere on the start screen (computers)
  const home = $('scrHome');
  home.addEventListener('dragover', e => { e.preventDefault(); home.classList.add('drop'); });
  home.addEventListener('dragleave', e => { if (e.target === home) home.classList.remove('drop'); });
  home.addEventListener('drop', e => { e.preventDefault(); home.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });

  // ---------- Android: its own picker, and pictures shared to Redact ----------
  const nativeAdd = list => addFiles(list.map(f => ({ bytes: f.bytes, size: f.size, name: f.name })));
  if (NATIVE) {
    $('importLbl').hidden = true; $('btnPick').hidden = false;
    $('btnPick').onclick = () => RedactNative.pickFiles().then(nativeAdd).catch(() => {});
    RedactNative.takeShared().then(nativeAdd).catch(() => {});
    RedactNative.onShared(() => RedactNative.takeShared().then(l => { show('scrHome'); nativeAdd(l); }).catch(() => {}));
  }

  startWorker();
})();
