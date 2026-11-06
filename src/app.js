/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact: the app ----------
   Opens pictures, finds what to cover (detect-worker.js: faces, text regions, codes; Tesseract reads the text regions,
   text.js finds numbers and addresses in them), lets the person check and change the covers (editor.js), then paints
   the covers into a full-size copy, saves it as a new file and checks the saved file (paint.js, clean.js).
   Nothing leaves the device: the page's policy blocks every connection. */
const RedactApp = (() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const APP = { name: '{{APP_NAME}}', version: '{{VERSION}}' };
  const P = globalThis.RedactPicture, D = globalThis.RedactDetect, T = globalThis.RedactText;
  const MAX_BYTES = 60 * 1024 * 1024;   // larger files are refused before they are read in full
  const MAX_PICS = 20;                  // pictures open at once (each keeps its file in memory)
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };   // version 1: JPEG, PNG and WebP
  const FACE_MIN = 0.6;                 // faces below this score are not suggested
  const size = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

  // ---------- what can be covered ----------
  // the categories found automatically (settings decide which are covered straight away), then Find words and by hand
  const CATS = [
    { id: 'faces', label: 'Faces', on: true, note: 'People, also small and in the background.' },
    { id: 'cards', label: 'Card and bank numbers', on: true, note: 'Card numbers (checked with the card checksum) and IBANs.' },
    { id: 'ids', label: 'ID numbers', on: true, note: 'Thai ID card numbers (checked) and passport lines.' },
    { id: 'emails', label: 'Email addresses', on: true },
    { id: 'phones', label: 'Phone numbers', on: true },
    { id: 'codes', label: 'QR codes and barcodes', on: true, note: 'Tickets, boarding passes and parcel labels hold names and booking codes.' },
    { id: 'links', label: 'Web addresses', on: false },
    { id: 'numbers', label: 'Long numbers', on: false, note: 'Account, order and booking numbers: 8 digits or more.' },
    { id: 'text', label: 'Other text', on: false, note: 'Every other piece of text: signs, number plates, house numbers, names, each line of a screenshot.' },
    { id: 'maybe', label: 'Possible text', on: false, note: 'Shapes that look like text but read as nothing, such as railings or patterns.' }
  ];
  const EXTRA = [{ id: 'words', label: 'Your words' }, { id: 'hand', label: 'By hand' }];
  const catLabel = id => (CATS.concat(EXTRA).find(c => c.id === id) || {}).label || id;

  // ---------- settings: kept only when the person asks ----------
  const SET_KEY = 'redact.settings';
  const settings = { cats: Object.fromEntries(CATS.map(c => [c.id, c.on])), langs: ['eng'], format: 'auto', names: 'plain', colour: 'black', faces: 'solid', remember: false, chosen: false };
  try {
    const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
    if (s && typeof s === 'object') {
      for (const c of CATS) if (typeof (s.cats || {})[c.id] === 'boolean') settings.cats[c.id] = s.cats[c.id];
      const langs = (Array.isArray(s.langs) ? s.langs : []).filter(l => REDACT.languages.some(([c]) => c === l));
      if (langs.length) settings.langs = langs;
      if (['auto', 'png', 'jpeg'].includes(s.format)) settings.format = s.format;
      if (['plain', 'original'].includes(s.names)) settings.names = s.names;
      if (['black', 'white', 'around'].includes(s.colour)) settings.colour = s.colour;
      if (['solid', 'mosaic'].includes(s.faces)) settings.faces = s.faces;
      settings.remember = settings.chosen = true;
    }
  } catch (e) { /* storage off: defaults, and the first-run question */ }
  function saveSettings() {
    try {
      if (settings.remember) localStorage.setItem(SET_KEY, JSON.stringify({ cats: settings.cats, langs: settings.langs, format: settings.format, names: settings.names, colour: settings.colour, faces: settings.faces }));
      else localStorage.removeItem(SET_KEY);
    } catch (e) { /* storage off */ }
  }

  // ---------- screens ----------
  const screens = ['scrHome', 'scrFirst', 'scrEdit', 'scrCheck', 'scrSettings', 'scrAbout', 'scrHelp'];
  let current = 'scrHome';
  const listeners = [];
  function show(id) {
    for (const s of screens) $(s).hidden = s !== id;
    const was = current; current = id;
    window.scrollTo(0, 0);
    for (const fn of listeners) fn(id, was);
  }
  let toastTimer = 0;
  // act: an optional { label, fn } button in the message (such as Undo)
  function toast(msg, act) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    if (act) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = act.label; b.onclick = () => { t.hidden = true; act.fn(); }; t.append(b); }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  // ---------- workers: detection (module worker) and text reading (Flatbed's engine) ----------
  const b64 = id => { const s = atob($(id).textContent.trim()), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  const gunzip = async u => new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const unpack = id => gunzip(b64(id));
  const detector = (() => {
    let w = null, ready = null, seq = 0;
    const wait = new Map();
    function start() {
      const url = URL.createObjectURL(new Blob([$('srcDetect').textContent], { type: 'text/javascript' }));
      w = new Worker(url, { type: 'module', name: 'detect' });
      ready = new Promise((resolve, reject) => {
        w.onmessage = e => {
          const m = e.data || {};
          if (m.type === 'ready') { URL.revokeObjectURL(url); resolve(); return; }
          const p = wait.get(m.id);
          if (!p) { if (m.type === 'error') reject(new Error(m.message)); return; }
          wait.delete(m.id);
          m.type === 'result' ? p.resolve(m) : p.reject(new Error(m.message));
        };
        w.onerror = e => { e.preventDefault(); reject(new Error(e.message || 'the detectors could not start')); };
      });
      (async () => {
        const [ort, text, face, codes] = await Promise.all(['binOrt', 'binText', 'binFace', 'binCodes'].map(unpack));
        w.postMessage({ type: 'init', bin: { ort, text, face, codes } }, [ort, text, face, codes]);
      })().catch(err => { $('engineHint').textContent = 'The detectors could not start: ' + err.message; });
      return ready;
    }
    return {
      start: () => ready || start(),
      // the picture is copied to the worker (the page keeps its own, to read the text regions from)
      async detect(bitmap, tiles) {
        await (ready || start());
        const id = ++seq;
        return new Promise((resolve, reject) => { wait.set(id, { resolve, reject }); w.postMessage({ type: 'detect', id, bitmap, tiles }); });
      }
    };
  })();
  const reader = (() => {
    let w = null, seq = 0, ready = null;
    const wait = new Map(), loaded = new Set();
    function call(cmd, data, transfer) {
      if (!w) {
        const url = URL.createObjectURL(new Blob([$('srcOcr').textContent], { type: 'text/javascript' }));
        w = new Worker(url, { name: 'read' });
        w.onmessage = e => { const m = e.data || {}, p = wait.get(m.id); if (!p) return; wait.delete(m.id); m.ok ? p.res(m.result) : p.rej(new Error(m.error)); };
        w.onerror = e => { e.preventDefault(); const err = new Error('text reading stopped: ' + (e.message || 'unknown error')); for (const p of wait.values()) p.rej(err); wait.clear(); w.terminate(); w = null; ready = null; loaded.clear(); };
      }
      return new Promise((res, rej) => { const id = ++seq; wait.set(id, { res, rej }); w.postMessage(Object.assign({ id, cmd }, data), transfer || []); });
    }
    return {
      async read(pgm, langs) {
        if (!ready) ready = (async () => { const wasm = new Uint8Array(await unpack('binWasm')); await call('init', { wasm }, [wasm.buffer]); })();
        try { await ready; } catch (e) { ready = null; throw e; }
        for (const l of langs) if (!loaded.has(l)) {
          const data = new Uint8Array(await unpack('binLang-' + l));
          await call('lang', { name: l, data }, [data.buffer]);
          loaded.add(l);
        }
        return call('recognize', { image: pgm, langs }, [pgm.buffer]);
      }
    };
  })();

  // ---------- finding things in one picture ----------
  // the text regions are cut from the full picture into one strip (text.js), read once, and the words mapped back
  function cropper(bitmap) {
    const c = new OffscreenCanvas(1, 1), g = c.getContext('2d', { willReadFrequently: true });
    return (r, w, h) => {
      c.width = w; c.height = h;
      g.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
      for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
      return out;
    };
  }
  async function readRegions(bitmap, regions) {
    if (!regions.length) return [];
    const st = T.strip(regions, cropper(bitmap));
    try {
      const r = await reader.read(T.pgm(st), settings.langs);
      return T.wordsBack(r.words, st);
    } catch (e) { return null; }   // reading unavailable: regions stay as "Other text"
  }
  // everything found, in picture pixels: { faces, codes, regions: [{ x, y, w, h, words, readable, found }] }
  async function find(bitmap) {
    const r = await detector.detect(bitmap, true);
    const words = await readRegions(bitmap, r.text);
    const regions = r.text.map((g, i) => {
      const ws = words ? words.filter(w => w.region === i) : [];
      return { x: g.x, y: g.y, w: g.w, h: g.h, words: ws, readable: words ? T.readable(ws) : true, found: words ? T.findSensitive(ws) : [] };
    });
    return { w: r.w, h: r.h, faces: r.faces, codes: r.codes, regions, read: !!words, ms: r.ms };
  }

  // ---------- covers from what was found ----------
  let nextCover = 1;
  const union = ws => { const x0 = Math.min(...ws.map(w => w.x)), y0 = Math.min(...ws.map(w => w.y)); return { x: x0, y: y0, w: Math.max(...ws.map(w => w.x + w.w)) - x0, h: Math.max(...ws.map(w => w.y + w.h)) - y0 }; };
  function nextTo(g, b) {
    const ox = Math.min(g.x + g.w, b.x + b.w) - Math.max(g.x, b.x), oy = Math.min(g.y + g.h, b.y + b.h) - Math.max(g.y, b.y);
    const gapY = Math.max(g.y - (b.y + b.h), b.y - (g.y + g.h)), gapX = Math.max(g.x - (b.x + b.w), b.x - (g.x + g.w));
    const reach = 0.15 * Math.min(b.w, b.h) + 1.5 * g.h;   // close: a line of text or two, not the paragraph above
    return (ox >= 0.5 * Math.min(g.w, b.w) && gapY <= reach) || (oy >= 0.5 * g.h && gapX <= reach && g.w < 2 * b.w);
  }
  function coversFrom(pic) {
    const f = pic.found, W = pic.w, H = pic.h, out = [];
    const add = (cat, b) => { const p = D.pad(b, W, H); if (p.w > 0 && p.h > 0) out.push({ id: nextCover++, cat, src: 'auto', on: !!settings.cats[cat], x: p.x, y: p.y, w: p.w, h: p.h }); };
    for (const b of f.faces) if (b.score >= FACE_MIN) add('faces', b);
    for (const b of f.codes) add('codes', b);
    // the text printed with a code (the booking code under a barcode, the number beside a QR code) usually says what
    // the code holds: a text region just above, below or beside a code is covered with it
    for (const g of f.regions) if (f.codes.some(b => nextTo(g, b))) add('codes', g);
    for (const g of f.regions) {
      for (const s of g.found) add(s.cat, union(s.words.map(k => g.words[k])));
      add(g.readable ? 'text' : 'maybe', g);
    }
    return out;
  }
  // Find words: every run of words that matches, in every picture; the covers are made again when the list changes
  function findCovers(pic) {
    const out = [];
    if (!pic.found || !state.words.length) return out;
    for (const g of pic.found.regions) for (const run of T.findWords(state.words, g.words)) {
      const p = D.pad(union(run.map(k => g.words[k])), pic.w, pic.h);
      out.push({ id: nextCover++, cat: 'words', src: 'find', on: true, x: p.x, y: p.y, w: p.w, h: p.h });
    }
    return out;
  }
  function refreshFinds() {
    for (const pic of state.pics) {
      if (!pic.found) continue;
      pic.covers = pic.covers.filter(c => c.src !== 'find').concat(findCovers(pic));
      describe(pic);
    }
    if (window.RedactEditor) RedactEditor.changed();
  }

  // ---------- pictures ----------
  const state = { pics: [], words: [], queue: Promise.resolve(), queued: 0, nativeIds: new Set(), next: 1 };
  function counts(pic) {
    const n = {};
    for (const c of pic.covers) if (c.src === 'auto' || c.src === 'find') n[c.cat] = (n[c.cat] || 0) + 1;
    return n;
  }
  function describe(pic) {
    const el = pic.el; if (!el) return;
    el.querySelector('.pic-n').textContent = `Picture ${pic.n}`;
    const st = el.querySelector('.pic-state');
    if (pic.error) { el.classList.add('failed'); st.textContent = pic.error; return; }
    if (!pic.found) { st.textContent = pic.status || 'Waiting…'; return; }
    const n = counts(pic), parts = [];
    for (const c of CATS.concat(EXTRA)) if (n[c.id] && c.id !== 'maybe') parts.push(`${c.label} ${n[c.id]}`);
    st.textContent = parts.length ? parts.join(' · ') : 'Nothing found: check it yourself';
    el.querySelector('.busy-veil').hidden = true;
  }
  function renderList() {
    $('picsWrap').hidden = !state.pics.length;
    $('pics').replaceChildren(...state.pics.map(p => p.el));
  }
  function removePic(pic) {
    state.pics = state.pics.filter(p => p !== pic);
    pic.removed = true; pic.bytes = null;
    if (pic.thumb) URL.revokeObjectURL(pic.thumb);
    renderList();
  }

  // a picked or dropped File, or a file the Android app holds ({ native: true, id, name, size, mime, uri })
  function addFiles(list) {
    let skipped = 0;
    for (const f of list) {
      if (state.pics.length >= MAX_PICS) { skipped++; continue; }
      const pic = { n: state.next++, name: String(f.name || 'picture'), file: f, covers: [], hist: [], fut: [], status: 'Waiting…' };
      const el = pic.el = $('tplPic').content.firstElementChild.cloneNode(true);
      const open = () => { if (pic.found) RedactEditor.open(pic); else if (!pic.error) toast('Still looking at this picture…'); };
      el.querySelector('.pic-thumb').onclick = open;
      el.querySelector('.pic-info').onclick = open;
      el.querySelector('[data-a="remove"]').onclick = () => removePic(pic);
      state.pics.push(pic); describe(pic);
      state.queued++;
      state.queue = state.queue.then(() => load(pic)).catch(() => {}).finally(() => { if (--state.queued === 0 && NATIVE) { RedactNative.release(); state.nativeIds.clear(); } });
    }
    renderList();
    if (skipped) toast(`${plural(skipped, 'picture')} not opened: ${MAX_PICS} at once is the limit. Close some to open more.`);
    if (list.length && !settings.chosen && !askedThisTime) { askedThisTime = true; firstRun(); }
  }

  async function load(pic) {
    const el = pic.el, f = pic.file; pic.file = null;
    const fail = msg => { pic.error = msg; el.querySelector('.busy-veil').hidden = true; describe(pic); };
    if (pic.removed) return;
    let bitmap = null;
    try {
      pic.status = 'Opening…'; describe(pic);
      // Not f.bytes on a File: browsers give every File a bytes() method
      let bytes;
      if (f instanceof Blob) { if (f.size > MAX_BYTES) return fail(`Too large (over ${size(MAX_BYTES)}).`); bytes = new Uint8Array(await f.arrayBuffer()); }
      else { bytes = await RedactNative.readOne(f); if (!bytes) return fail(`Too large (over ${size(MAX_BYTES)}).`); pic.uri = f.uri || ''; }
      const big = P.tooLarge(bytes);
      if (big) return fail(big.bad ? 'This picture looks damaged: its size could not be read.' : `Too large to open safely (${Math.round(big.w * big.h / 1e6)} megapixels; the limit is ${P.MAX_PIXELS / 1e6}).`);
      const kind = P.pictureSize(bytes);
      if (!kind || !MIME[kind.type]) return fail(kind ? `${kind.type.toUpperCase()} pictures can't be opened yet: use JPEG, PNG or WebP.` : 'Not a picture Redact can open (JPEG, PNG or WebP).');
      pic.bytes = bytes; pic.type = kind.type;
      bitmap = await createImageBitmap(new Blob([bytes], { type: MIME[kind.type] }), { imageOrientation: 'from-image' });
      pic.w = bitmap.width; pic.h = bitmap.height;
      // the thumbnail, made here and kept small
      const s = 160 / Math.max(pic.w, pic.h), tc = new OffscreenCanvas(Math.max(1, Math.round(pic.w * s)), Math.max(1, Math.round(pic.h * s)));
      tc.getContext('2d').drawImage(bitmap, 0, 0, tc.width, tc.height);
      pic.thumb = URL.createObjectURL(await tc.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
      el.querySelector('img').src = pic.thumb;
      if (pic.removed) return;
      pic.status = 'Looking for faces, text and codes…'; describe(pic);
      pic.found = await find(bitmap);
      pic.covers = coversFrom(pic).concat(findCovers(pic));
      describe(pic);
      if (window.RedactEditor) RedactEditor.loaded(pic);
    } catch (e) {
      fail('Could not open this picture: ' + (e && e.message || e));
    } finally { if (bitmap) bitmap.close(); }
  }

  // ---------- first run: what to cover ----------
  let askedThisTime = false;
  function catChecks(box, onChange) {
    box.replaceChildren(...CATS.map(c => {
      const l = document.createElement('label'); l.className = 'check';
      const i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!settings.cats[c.id]; i.dataset.cat = c.id;
      i.onchange = () => { settings.cats[c.id] = i.checked; if (onChange) onChange(); };
      const sp = document.createElement('span'), b = document.createElement('b'), sw = document.createElement('i');
      sw.className = 'swatch'; sw.style.background = `var(--c-${c.id})`;
      b.append(sw, c.label); sp.append(b);
      if (c.note) { const sm = document.createElement('small'); sm.textContent = c.note; sp.append(sm); }
      l.append(i, sp); return l;
    }));
  }
  function firstRun() {
    catChecks($('firstCats'));
    $('firstRemember').checked = settings.remember;
    show('scrFirst');
  }
  $('btnFirstGo').onclick = () => {
    settings.chosen = true; settings.remember = $('firstRemember').checked; saveSettings();
    applyChoice();
    show('scrHome');
  };
  // the choice applies to pictures not yet changed by hand
  function applyChoice() {
    for (const pic of state.pics) if (!pic.hist.length) for (const c of pic.covers) if (c.src === 'auto') c.on = !!settings.cats[c.cat];
    if (window.RedactEditor) RedactEditor.changed();
  }

  // ---------- settings screen ----------
  let settingsFrom = 'scrHome';
  $('btnSettings').onclick = () => {
    if (current === 'scrSettings') return;
    settingsFrom = ['scrEdit', 'scrHome'].includes(current) ? current : 'scrHome';
    catChecks($('setCats'), () => { saveSettings(); });
    for (const b of $('langChips').querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(settings.langs.includes(b.dataset.lang)));
    for (const b of $('formatChips').querySelectorAll('[data-format]')) b.setAttribute('aria-pressed', String(b.dataset.format === settings.format));
    for (const b of $('nameChips').querySelectorAll('[data-names]')) b.setAttribute('aria-pressed', String(b.dataset.names === settings.names));
    $('setRemember').checked = settings.remember;
    show('scrSettings');
  };
  for (const b of $('langChips').querySelectorAll('[data-lang]')) b.onclick = () => {
    const l = b.dataset.lang, on = settings.langs.includes(l);
    if (on && settings.langs.length === 1) { toast('At least one language is needed.'); return; }
    settings.langs = on ? settings.langs.filter(x => x !== l) : settings.langs.concat(l);
    b.setAttribute('aria-pressed', String(!on)); saveSettings();
    toast('Applies to pictures opened from now on.');
  };
  for (const b of $('formatChips').querySelectorAll('[data-format]')) b.onclick = () => {
    settings.format = b.dataset.format;
    for (const o of $('formatChips').querySelectorAll('[data-format]')) o.setAttribute('aria-pressed', String(o === b));
    saveSettings();
  };
  for (const b of $('nameChips').querySelectorAll('[data-names]')) b.onclick = () => {
    settings.names = b.dataset.names;
    for (const o of $('nameChips').querySelectorAll('[data-names]')) o.setAttribute('aria-pressed', String(o === b));
    saveSettings();
  };
  $('setRemember').onchange = e => { settings.remember = e.target.checked; settings.chosen = settings.chosen || settings.remember; saveSettings(); };
  $('btnSettingsBack').onclick = () => { settings.chosen = true; show(settingsFrom); if (settingsFrom === 'scrEdit') RedactEditor.changed(); };

  // ---------- opening pictures ----------
  $('photoInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  $('fileInput').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  const home = $('scrHome');
  home.addEventListener('dragover', e => { e.preventDefault(); home.classList.add('drop'); });
  home.addEventListener('dragleave', e => { if (e.target === home) home.classList.remove('drop'); });
  home.addEventListener('drop', e => { e.preventDefault(); home.classList.remove('drop'); if (e.dataTransfer && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); });
  $('btnClearAll').onclick = () => {
    if (state.pics.some(p => !p.done) && !confirm('Close all pictures? Covers you haven\'t saved are lost.')) return;
    for (const p of state.pics.slice()) removePic(p);
  };
  // Android: its own picker (photos, or any file), and pictures shared to Redact
  const nativeAdd = list => addFiles(list.filter(d => !state.nativeIds.has(d.id)).map(d => { state.nativeIds.add(d.id); return Object.assign({ native: true }, d); }));
  if (NATIVE) {
    $('photosLbl').hidden = $('filesLbl').hidden = true;
    $('btnPhotosN').hidden = $('btnFilesN').hidden = false;
    $('btnPhotosN').onclick = () => RedactNative.pickFiles('images').then(nativeAdd).catch(e => toast('Could not open the pictures: ' + (e && e.message || e)));
    $('btnFilesN').onclick = () => RedactNative.pickFiles('any').then(nativeAdd).catch(e => toast('Could not open the files: ' + (e && e.message || e)));
    const take = () => RedactNative.takeShared().then(l => { if (l.length) { if (current !== 'scrFirst') show('scrHome'); nativeAdd(l); } }).catch(() => {});
    RedactNative.onShared(take);
    take();
  }
  // pictures exist only in memory: leaving the page (a link opens in the same tab) would lose them, so ask first
  window.addEventListener('beforeunload', e => { if (!NATIVE && state.pics.some(p => !p.done)) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- about, manual, Back ----------
  let aboutFrom = 'scrHome';
  $('btnHome').onclick = () => show('scrHome');
  $('btnAbout').onclick = () => { if (!['scrAbout', 'scrHelp'].includes(current)) aboutFrom = current === 'scrFirst' ? 'scrHome' : current; show('scrAbout'); };
  $('btnAboutBack').onclick = () => show(aboutFrom);
  $('btnHelp').onclick = $('btnHelp2').onclick = () => show('scrHelp');
  $('btnHelpBack').onclick = () => show('scrAbout');
  // Android's Back button: back inside the app first (MainActivity asks this)
  window.redactBack = () => {
    const to = { scrHelp: 'scrAbout', scrAbout: aboutFrom, scrSettings: settingsFrom, scrCheck: 'scrEdit', scrEdit: 'scrHome', scrFirst: 'scrHome' }[current];
    if (!to) return false;
    if (current === 'scrCheck') RedactSave.back(); else show(to);
    return true;
  };

  // the page has fully arrived: the spectacles make way for the buttons
  (() => {
    const l = $('loader'); if (!l) return;
    window.redactLoading && window.redactLoading(1, 'All clean.');
    $('addRow').hidden = false; $('addRow').classList.add('arrive');
    l.classList.add('done');
    setTimeout(() => l.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);
  })();
  detector.start().then(() => { $('engineHint').textContent = ''; }, err => { $('engineHint').textContent = 'The detectors could not start: ' + err.message; });
  return { $, APP, CATS, EXTRA, catLabel, settings, saveSettings, state, show, toast, onShow: fn => listeners.push(fn), find, detector, refreshFinds, describe, counts, FACE_MIN, MIME, size, plural, get current() { return current; } };
})();
