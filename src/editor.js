/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact: the editor ----------
   One picture on a canvas, its covers drawn as they will be saved (painted into a display copy with paint.js), and
   outlines for what was found but isn't covered. Tap a cover to remove it or put it back, drag its corners to resize
   it, draw boxes or paint with the brush; pinch or scroll to zoom, drag with two fingers (or with Tap on empty space)
   to move. Every change can be undone. */
window.RedactEditor = (() => {
  'use strict';
  const A = RedactApp, $ = A.$, Paint = globalThis.RedactPaint;
  const canvas = $('stage'), ctx = canvas.getContext('2d');
  const ed = { pic: null, disp: null, ds: 1, bmp: null, v: { s: 1, x: 0, y: 0 }, fit: 1, tool: 'select', sel: null, drag: null, temp: null, token: 0 };
  const style = () => ({ colour: A.settings.colour, faces: A.settings.faces });

  // ---------- opening a picture ----------
  // focus: a box to zoom in on (something the check found)
  async function open(pic, focus) {
    const token = ++ed.token;
    ed.pic = pic; ed.sel = null; ed.disp = null;
    if (ed.bmp) { ed.bmp.close(); ed.bmp = null; }
    A.show('scrEdit');
    $('stageBusy').hidden = false;
    head(); bar(); draw();
    try {
      const bm = await createImageBitmap(new Blob([pic.bytes], { type: A.MIME[pic.type] }), { imageOrientation: 'from-image' });
      // the display copy: at most 2048 pixels on its longer side, kept as plain pixels so the covers can be painted in
      const s = Math.min(1, 2048 / Math.max(bm.width, bm.height)), w = Math.max(1, Math.round(bm.width * s)), h = Math.max(1, Math.round(bm.height * s));
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bm, 0, 0, w, h); bm.close();
      if (token !== ed.token) return;
      ed.disp = g.getImageData(0, 0, w, h); ed.ds = w / pic.w;
      fitView();
      if (focus) {   // about half the view, centred on it
        const r = canvas.getBoundingClientRect(), f = Math.min(r.width / focus.w, r.height / focus.h) * 0.5 / ed.fit;
        zoomAt(Math.max(1, Math.min(12, f)), ...toScreen(focus.x + focus.w / 2, focus.y + focus.h / 2));
        ed.v.x += r.width / 2 - toScreen(focus.x + focus.w / 2, 0)[0]; ed.v.y += r.height / 2 - toScreen(0, focus.y + focus.h / 2)[1]; keepIn();
      }
      await preview();
    } catch (e) { A.toast('Could not show this picture: ' + (e && e.message || e)); }
    finally { if (token === ed.token) $('stageBusy').hidden = true; }
  }
  function head() {
    const pics = A.state.pics.filter(p => p.found), i = pics.indexOf(ed.pic);
    $('editN').textContent = `Picture ${ed.pic.n}` + (pics.length > 1 ? ` (${i + 1} of ${pics.length})` : '');
    $('btnPrev').disabled = i <= 0; $('btnNext').disabled = i < 0 || i >= pics.length - 1;
    $('btnUndo').disabled = !ed.pic.hist.length; $('btnRedo').disabled = !ed.pic.fut.length;
    for (const b of $('colourChips').querySelectorAll('[data-colour]')) b.setAttribute('aria-pressed', String(b.dataset.colour === A.settings.colour));
    for (const b of $('faceChips').querySelectorAll('[data-faces]')) b.setAttribute('aria-pressed', String(b.dataset.faces === A.settings.faces));
    $('mosaicNote').hidden = A.settings.faces !== 'mosaic';
  }
  const step = d => { const pics = A.state.pics.filter(p => p.found), i = pics.indexOf(ed.pic); if (pics[i + d]) open(pics[i + d]); };
  $('btnPrev').onclick = () => step(-1);
  $('btnNext').onclick = () => step(1);
  $('btnEditBack').onclick = () => A.show('scrHome');

  // ---------- the category bar ----------
  function bar() {
    const pic = ed.pic, by = {};
    for (const c of pic.covers) (by[c.cat] = by[c.cat] || []).push(c);
    const chips = [];
    for (const cat of A.CATS.concat(A.EXTRA)) {
      const list = by[cat.id]; if (!list) continue;
      const on = list.filter(c => c.on).length;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cat-chip';
      b.style.color = `var(--c-${cat.id})`;
      b.setAttribute('aria-pressed', on === list.length ? 'true' : on ? 'mixed' : 'false');
      b.title = on === list.length ? 'Covered: tap to uncover all' : 'Tap to cover all';
      const lab = document.createElement('b'); lab.textContent = `${cat.label} ${list.length}`;
      b.append(document.createElement('i'), lab);
      b.onclick = () => {
        remember(); const to = on !== list.length, n = list.filter(c => c.on !== to).length;
        for (const c of list) c.on = to;
        changed();
        // a whole category at once is a big change: say so, with a way back
        A.toast(`${cat.label}: ${A.plural(n, 'cover')} ${to ? 'added' : 'removed'}.`, { label: 'Undo', fn: () => $('btnUndo').click() });
      };
      chips.push(b);
    }
    if (!chips.length) { const p = document.createElement('span'); p.className = 'dev-meta'; p.textContent = 'Nothing was found. Check the picture and cover anything with Box or Brush.'; chips.push(p); }
    $('catBar').replaceChildren(...chips);
  }

  // ---------- undo ----------
  function remember() {
    const p = ed.pic; p.hist.push(JSON.stringify(p.covers)); if (p.hist.length > 100) p.hist.shift(); p.fut = [];
  }
  $('btnUndo').onclick = () => { const p = ed.pic; if (!p.hist.length) return; p.fut.push(JSON.stringify(p.covers)); p.covers = JSON.parse(p.hist.pop()); ed.sel = null; changed(); };
  $('btnRedo').onclick = () => { const p = ed.pic; if (!p.fut.length) return; p.hist.push(JSON.stringify(p.covers)); p.covers = JSON.parse(p.fut.pop()); ed.sel = null; changed(); };

  // ---------- drawing ----------
  // the covers painted into a copy of the display picture, exactly as they will be saved (the mosaic's noise is fixed
  // here so it doesn't flicker; the saved picture gets fresh random noise)
  let previewing = null, again = false;
  async function preview() {
    if (previewing) { again = true; return previewing; }
    previewing = (async () => {
      do {
        again = false;
        if (!ed.disp) break;
        const img = { w: ed.disp.width, h: ed.disp.height, data: new Uint8ClampedArray(ed.disp.data) };
        let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        Paint.paint(img, ed.pic.covers, style(), rand, ed.ds);
        const bm = await createImageBitmap(new ImageData(img.data, img.w, img.h));
        if (ed.bmp) ed.bmp.close();
        ed.bmp = bm; draw();
      } while (again);
    })();
    try { await previewing; } finally { previewing = null; }
  }
  function changed() {
    if (!ed.pic) return;
    if (A.current === 'scrEdit') { head(); bar(); preview(); }
    A.describe(ed.pic);
  }
  const dpr = () => window.devicePixelRatio || 1;
  function fitView() {
    const r = canvas.getBoundingClientRect(), p = ed.pic;
    ed.fit = Math.min(r.width / p.w, r.height / p.h);
    ed.v = { s: ed.fit, x: (r.width - p.w * ed.fit) / 2, y: (r.height - p.h * ed.fit) / 2 };
  }
  const toScreen = (x, y) => [x * ed.v.s + ed.v.x, y * ed.v.s + ed.v.y];
  const toPic = (x, y) => [(x - ed.v.x) / ed.v.s, (y - ed.v.y) / ed.v.s];
  const colour = cat => getComputedStyle(document.documentElement).getPropertyValue('--c-' + cat).trim() || '#888';
  function draw() {
    const r = canvas.getBoundingClientRect(), k = dpr();
    if (canvas.width !== Math.round(r.width * k) || canvas.height !== Math.round(r.height * k)) { canvas.width = Math.round(r.width * k); canvas.height = Math.round(r.height * k); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d0b0c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!ed.pic || !ed.bmp) return;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(ed.bmp, ed.v.x, ed.v.y, ed.pic.w * ed.v.s, ed.pic.h * ed.v.s);
    // outlines: dashed for what is found but not covered, thin for covers, with handles on the selected one
    for (const c of ed.pic.covers.concat(ed.temp ? [ed.temp] : [])) {
      if (c.pts && c.id !== ed.sel && c !== ed.temp) continue;
      const [x, y] = toScreen(c.x, c.y), w = c.w * ed.v.s, h = c.h * ed.v.s;
      ctx.strokeStyle = colour(c.cat);
      if (c.pts && c === ed.temp) {
        ctx.lineWidth = Math.max(1, c.r * ed.v.s * 2); ctx.lineCap = ctx.lineJoin = 'round'; ctx.globalAlpha = 0.8; ctx.strokeStyle = '#000';
        ctx.beginPath(); c.pts.forEach(([px, py], i) => { const [sx, sy] = toScreen(px, py); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); if (c.pts.length === 1) { const [sx, sy] = toScreen(...c.pts[0]); ctx.lineTo(sx + 0.1, sy); } ctx.stroke();
        ctx.globalAlpha = 1; continue;
      }
      if (c === ed.temp) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, y, w, h); }
      ctx.setLineDash(c.on || c === ed.temp ? [] : [6, 4]);
      ctx.lineWidth = c.id === ed.sel ? 3 : c.on ? 1.5 : 2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      if (c.id === ed.sel && !c.pts) for (const [hx, hy] of corners(c)) { ctx.fillStyle = '#fff'; ctx.fillRect(hx - 6, hy - 6, 12, 12); ctx.strokeRect(hx - 6, hy - 6, 12, 12); }
    }
  }
  const corners = c => { const [x, y] = toScreen(c.x, c.y), w = c.w * ed.v.s, h = c.h * ed.v.s; return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]; };
  new ResizeObserver(() => { if (ed.pic && A.current === 'scrEdit') { const was = ed.v.s / ed.fit; fitView(); if (was > 1.01) zoomAt(was, ...center()); draw(); } }).observe(canvas);
  const center = () => { const r = canvas.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };

  // ---------- zoom ----------
  function zoomAt(f, sx, sy) {
    const s = Math.max(ed.fit, Math.min(ed.fit * 12, ed.v.s * f));
    const [px, py] = toPic(sx, sy);
    ed.v.s = s; ed.v.x = sx - px * s; ed.v.y = sy - py * s;
    keepIn();
  }
  // the picture can't be moved out of sight
  function keepIn() {
    const r = canvas.getBoundingClientRect(), w = ed.pic.w * ed.v.s, h = ed.pic.h * ed.v.s;
    ed.v.x = w <= r.width ? (r.width - w) / 2 : Math.min(0, Math.max(r.width - w, ed.v.x));
    ed.v.y = h <= r.height ? (r.height - h) / 2 : Math.min(0, Math.max(r.height - h, ed.v.y));
  }
  canvas.addEventListener('wheel', e => { if (!ed.pic) return; e.preventDefault(); const r = canvas.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY / 400), e.clientX - r.left, e.clientY - r.top); draw(); }, { passive: false });

  // ---------- tools ----------
  const HINTS = {
    select: 'Tap a cover to remove it or put it back; drag its corners to resize. Pinch to zoom.',
    box: 'Drag across anything to cover it. Two fingers move and zoom.',
    brush: 'Paint over anything to cover it. Two fingers move and zoom.'
  };
  function setTool(t) {
    ed.tool = t; ed.sel = null;
    for (const b of $('toolSeg').querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    $('brushSize').hidden = t !== 'brush';
    canvas.classList.toggle('select', t === 'select');
    $('toolHint').textContent = HINTS[t];
    draw();
  }
  for (const b of $('toolSeg').querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  for (const b of $('colourChips').querySelectorAll('[data-colour]')) b.onclick = () => { A.settings.colour = b.dataset.colour; A.saveSettings(); changed(); };
  for (const b of $('faceChips').querySelectorAll('[data-faces]')) b.onclick = () => { A.settings.faces = b.dataset.faces; A.saveSettings(); changed(); };

  // the smallest cover (or found outline) under a point, a few pixels of slack on a phone
  function hit(px, py) {
    const slack = 8 / ed.v.s;
    let best = null;
    for (const c of ed.pic.covers) {
      if (px < c.x - slack || px > c.x + c.w + slack || py < c.y - slack || py > c.y + c.h + slack) continue;
      if (c.pts && !c.pts.some(([x, y]) => (x - px) ** 2 + (y - py) ** 2 <= (c.r + slack) ** 2)) continue;
      if (!best || c.w * c.h < best.w * best.h) best = c;
    }
    return best;
  }

  // ---------- pointer handling: one finger uses the tool, two move and zoom ----------
  const pointers = new Map();
  const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', e => {
    if (!ed.pic || !ed.bmp) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, pos(e));
    if (pointers.size === 2) {   // a second finger: whatever the first one started becomes a pinch
      if (ed.drag && ed.drag.mode === 'resize' && ed.drag.moved) { /* keep the resize as it was */ }
      ed.temp = null;
      const [a, b] = [...pointers.values()];
      ed.drag = { mode: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v0: Object.assign({}, ed.v) };
      draw(); return;
    }
    if (pointers.size > 2) return;
    const [sx, sy] = pos(e), [px, py] = toPic(sx, sy);
    if (ed.tool === 'select') {
      const sel = ed.pic.covers.find(c => c.id === ed.sel);
      const corner = sel && !sel.pts ? corners(sel).findIndex(([hx, hy]) => Math.abs(hx - sx) <= 16 && Math.abs(hy - sy) <= 16) : -1;
      ed.drag = corner >= 0 ? { mode: 'resize', c: sel, corner, start: [sx, sy], box: { x: sel.x, y: sel.y, w: sel.w, h: sel.h }, moved: false } : { mode: 'tap', start: [sx, sy], v0: Object.assign({}, ed.v) };
    } else if (ed.tool === 'box') {
      ed.drag = { mode: 'box', start: [px, py] };
      ed.temp = { cat: 'hand', on: true, x: px, y: py, w: 0, h: 0 };
    } else {
      const r = (4 + 4 * +$('brushSize').value) / ed.v.s;
      ed.drag = { mode: 'brush' };
      ed.temp = { cat: 'hand', on: true, pts: [[px, py]], r, x: px - r, y: py - r, w: 2 * r, h: 2 * r };
    }
    draw();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId) || !ed.drag) return;
    pointers.set(e.pointerId, pos(e));
    const d = ed.drag, [sx, sy] = pos(e);
    if (d.mode === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ed.v = Object.assign({}, d.v0);
      ed.v.x += m[0] - d.m0[0]; ed.v.y += m[1] - d.m0[1];
      zoomAt(dist / d.d0, m[0], m[1]);
    } else if (d.mode === 'tap' || d.mode === 'pan') {
      if (d.mode === 'tap' && Math.hypot(sx - d.start[0], sy - d.start[1]) > 8) d.mode = 'pan';
      if (d.mode === 'pan') { ed.v.x = d.v0.x + sx - d.start[0]; ed.v.y = d.v0.y + sy - d.start[1]; keepIn(); }
    } else if (d.mode === 'resize') {
      if (!d.moved) { remember(); d.moved = true; }
      const dx = (sx - d.start[0]) / ed.v.s, dy = (sy - d.start[1]) / ed.v.s, b = d.box, c = d.c, min = 4;
      let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      if (d.corner % 2 === 0) x0 += dx; else x1 += dx;
      if (d.corner < 2) y0 += dy; else y1 += dy;
      x0 = Math.max(0, Math.min(x0, x1 - min)); y0 = Math.max(0, Math.min(y0, y1 - min));
      x1 = Math.min(ed.pic.w, Math.max(x1, x0 + min)); y1 = Math.min(ed.pic.h, Math.max(y1, y0 + min));
      Object.assign(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0, on: true });
    } else if (d.mode === 'box') {
      const [px, py] = toPic(sx, sy), [ax, ay] = d.start;
      const x0 = Math.max(0, Math.min(ax, px)), y0 = Math.max(0, Math.min(ay, py));
      Object.assign(ed.temp, { x: x0, y: y0, w: Math.min(ed.pic.w, Math.max(ax, px)) - x0, h: Math.min(ed.pic.h, Math.max(ay, py)) - y0 });
    } else if (d.mode === 'brush') {
      const [px, py] = toPic(sx, sy), t = ed.temp, [lx, ly] = t.pts[t.pts.length - 1];
      if (Math.hypot(px - lx, py - ly) > t.r / 3) {
        t.pts.push([px, py]);
        const xs = t.pts.map(p => p[0]), ys = t.pts.map(p => p[1]);
        Object.assign(t, { x: Math.min(...xs) - t.r, y: Math.min(...ys) - t.r, w: Math.max(...xs) - Math.min(...xs) + 2 * t.r, h: Math.max(...ys) - Math.min(...ys) + 2 * t.r });
      }
    }
    draw();
  });
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    const d = ed.drag; if (!d) return;
    if (d.mode === 'pinch') { if (!pointers.size) ed.drag = null; return; }   // the other finger lifting ends nothing
    ed.drag = null;
    if (e.type === 'pointercancel') { ed.temp = null; draw(); return; }
    if (d.mode === 'tap') {
      const c = hit(...toPic(...d.start));
      if (c) { remember(); c.on = !c.on; ed.sel = c.on && !c.pts ? c.id : null; changed(); }
      else { ed.sel = null; draw(); }
    } else if (d.mode === 'resize') { if (d.moved) changed(); }
    else if (d.mode === 'box') {
      const t = ed.temp; ed.temp = null;
      if (t.w * ed.v.s >= 6 && t.h * ed.v.s >= 6) { remember(); t.id = nextId(); t.src = 'box'; ed.pic.covers.push(t); changed(); } else draw();
    } else if (d.mode === 'brush') {
      const t = ed.temp; ed.temp = null;
      clip(t); remember(); t.id = nextId(); t.src = 'brush'; ed.pic.covers.push(t); changed();
    } else draw();
  };
  const clip = t => { const x0 = Math.max(0, t.x), y0 = Math.max(0, t.y); t.w = Math.min(ed.pic.w, t.x + t.w) - x0; t.h = Math.min(ed.pic.h, t.y + t.h) - y0; t.x = x0; t.y = y0; };
  let idSeq = 1e6; const nextId = () => ++idSeq;
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  // ---------- Find words ----------
  function findList() {
    const n = {};
    for (const p of A.state.pics) for (const c of p.covers) if (c.src === 'find') n.all = (n.all || 0) + 1;
    $('findList').replaceChildren(...A.state.words.map(w => {
      const li = document.createElement('li'), x = document.createElement('button');
      li.append(w); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + w);
      x.onclick = () => { A.state.words = A.state.words.filter(q => q !== w); afterFind(); };
      li.append(x); return li;
    }));
    $('findSum').textContent = A.state.words.length ? `${A.plural(A.state.words.length, 'entry', 'entries')} · found ${A.plural(n.all || 0, 'time')}` : 'names, streets, numbers you type';
  }
  function afterFind() { A.refreshFinds(); findList(); }
  function addWords(list) {
    let added = 0;
    for (const w of list) if (!A.state.words.includes(w) && A.state.words.length < 200) { A.state.words.push(w); added++; }
    afterFind();
    return added;
  }
  $('findForm').onsubmit = e => {
    e.preventDefault();
    const w = $('findIn').value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (w.length < 2) { A.toast('Type at least two letters or digits.'); return; }
    addWords([w]); $('findIn').value = '';
  };
  $('btnFindClear').onclick = () => { if (A.state.words.length && confirm('Clear the Find words list?')) { A.state.words = []; afterFind(); } };
  $('btnFindSave').onclick = () => {
    if (!A.state.words.length) { A.toast('The list is empty.'); return; }
    RedactSave.saveAs('redact-words.txt', new TextEncoder().encode(RedactText.listText(A.state.words)), 'text/plain');
  };
  const importText = text => { const n = addWords(RedactText.parseList(text)); A.toast(n ? `${A.plural(n, 'entry', 'entries')} added.` : 'Nothing new in that list.'); };
  $('findImport').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 64 * 1024) { A.toast('That file is too large for a word list.'); return; }
    importText(await f.text());
  };
  // a real button (reachable with the keyboard) that opens the browser's file picker, or Android's in the app
  $('btnFindImport').onclick = async () => {
    if (!NATIVE) { $('findImport').click(); return; }
    try {
      const [d] = await RedactNative.pickFiles('text'); if (!d) return;
      if (+d.size > 64 * 1024) { A.toast('That file is too large for a word list.'); return; }
      const b = await RedactNative.readOne(d); RedactNative.release();
      if (b && b.length <= 64 * 1024) importText(new TextDecoder().decode(b));
    } catch (err) { A.toast('Could not open the list: ' + (err && err.message || err)); }
  };

  $('btnCheck').onclick = () => { if (ed.pic) RedactSave.check(ed.pic); };
  setTool('select');

  return {
    open,
    changed() { if (ed.pic) changed(); findList(); },
    loaded(pic) { if (ed.pic === pic) changed(); else if (A.current === 'scrEdit') head(); },
    get pic() { return ed.pic; }
  };
})();
