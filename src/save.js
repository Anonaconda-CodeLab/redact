/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Redact: check and save ----------
   1. The original is decoded again at full size and the covers are painted into its pixels (paint.js).
   2. A new file is encoded from those pixels alone: nothing from the original file can reach it.
   3. The new file is decoded again and checked: every pixel under a solid cover is the cover's colour (exactly, for
      PNG), and a mosaic changed the face. If not, it can't be saved.
   4. The saved picture is looked at and read again, as a new picture: anything of a kind the person chose to cover
      that can still be found (and any of their Find words) is listed.
   5. Unmarked's cleaner lists the hidden data the original carried and confirms the new file carries none. */
window.RedactSave = (() => {
  'use strict';
  const A = RedactApp, $ = A.$, Paint = globalThis.RedactPaint, T = globalThis.RedactText, Clean = globalThis.UnmarkedClean;
  let cur = null;   // { pic, bytes, mime, name, saved }

  const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const inside = (b, c) => b.x + b.w / 2 >= c.x && b.x + b.w / 2 <= c.x + c.w && b.y + b.h / 2 >= c.y && b.y + b.h / 2 <= c.y + c.h;
  const PICTURE_FINDINGS = new Set(['gps', 'location']);
  function item(cls, text, note) {
    const li = document.createElement('li'), sp = document.createElement('span'); if (cls) li.className = cls;
    sp.append(text);
    if (note) { const s = document.createElement('small'); s.textContent = note; sp.append(s); }
    li.append(sp);
    $('checkList').append(li);
  }
  function outName(pic, ext) {
    const base = pic.name.replace(/\.[^.]{1,5}$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || 'picture';
    return `${base}-redacted.${ext}`;
  }

  async function check(pic) {
    const token = cur = { pic };
    A.show('scrCheck');
    $('checkTitle').textContent = 'Checking…'; $('checkSub').textContent = `Picture ${pic.n}`;
    $('checkProgress').hidden = false; $('checkImg').hidden = true; $('saveRow').hidden = true; $('btnCheckNext').hidden = true;
    $('origNote').hidden = true; $('saveHint').textContent = ''; $('checkList').replaceChildren();
    if ($('donateCard')) $('donateCard').hidden = true;
    let orig = null, out = null, url = '';
    try {
      // 1-2: paint into the full-size picture and encode a new file
      const mime = A.settings.format === 'png' ? 'image/png' : A.settings.format === 'jpeg' ? 'image/jpeg' : pic.type === 'png' ? 'image/png' : 'image/jpeg';
      const bm = await createImageBitmap(new Blob([pic.bytes], { type: A.MIME[pic.type] }), { imageOrientation: 'from-image' });
      const W = bm.width, H = bm.height, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(bm, 0, 0); bm.close();
      orig = g.getImageData(0, 0, W, H);
      const work = new ImageData(new Uint8ClampedArray(orig.data), W, H);
      const painted = Paint.paint({ w: W, h: H, data: work.data }, pic.covers, { colour: A.settings.colour, faces: A.settings.faces }, rand, 1);
      g.putImageData(work, 0, 0);
      const blob = await cv.convertToBlob({ type: mime, quality: 0.92 });
      if (blob.type !== mime) throw new Error('this browser could not write a ' + (mime === 'image/png' ? 'PNG' : 'JPEG'));
      // the browser's encoder may add blocks of its own (Chrome puts a standard colour profile in every JPEG): the new
      // file goes through Unmarked's cleaner too, which cuts them out without touching the picture data
      out = (await Clean.clean(new Uint8Array(await blob.arrayBuffer()))).bytes;
      if (token !== cur) return;
      // 3: decoded again, pixel by pixel
      const back = await createImageBitmap(new Blob([out], { type: mime }));
      const g2 = new OffscreenCanvas(W, H).getContext('2d', { willReadFrequently: true });
      g2.drawImage(back, 0, 0);
      const chk = Paint.check({ w: W, h: H, data: g2.getImageData(0, 0, W, H).data }, { w: W, h: H, data: orig.data }, painted, mime === 'image/png' ? 0 : 24);
      orig = null;
      url = URL.createObjectURL(new Blob([out], { type: mime }));
      $('checkImg').src = url; $('checkImg').hidden = false;
      const nCovers = painted.length;
      if (!chk.ok) {
        back.close();
        $('checkTitle').textContent = 'This picture can\'t be saved';
        item('bad', 'A cover didn\'t come out as it should.', 'Please report this (About → Questions or problems), with the kind of picture and covers. ' + chk.problems.map(p => p.why).join('; '));
        return;
      }
      item('', nCovers ? `${A.plural(nCovers, 'cover')} painted into the picture.` : 'No covers: the picture is saved without them.', nCovers ? 'Checked pixel by pixel in the new file: the original pixels are gone, not hidden.' : 'Only its hidden data is removed.');
      // 4: looked at and read again, as a new picture
      $('checkSub').textContent = `Picture ${pic.n}: reading the new picture again…`;
      const f = await A.find(back); back.close();
      if (token !== cur) return;
      // Anything found in the new picture that the editor already showed (covered, or uncovered by the person on
      // purpose) is left alone: only what was never marked is reported. It is added to the editor as an outline, so
      // "Show me" leads straight to it.
      const D = globalThis.RedactDetect, fresh = [];
      const same = (b, c) => inside(b, c) || inside(c, b);
      // already decided: under a cover, or where the person turned off a suggestion of the same kind
      const consider = (cat, b) => { if (!pic.covers.some(c => same(b, c) && (c.on || c.cat === cat)) && !fresh.some(x => same(b, x))) fresh.push(Object.assign({ cat }, D.pad(b, W, H))); };
      for (const b of f.faces) if (b.score >= A.FACE_MIN) consider('faces', b);
      for (const b of f.codes) consider('codes', b);
      const box = ws => { const x0 = Math.min(...ws.map(w => w.x)), y0 = Math.min(...ws.map(w => w.y)); return { x: x0, y: y0, w: Math.max(...ws.map(w => w.x + w.w)) - x0, h: Math.max(...ws.map(w => w.y + w.h)) - y0 }; };
      for (const g of f.regions) {
        for (const s of g.found) consider(s.cat, box(s.words.map(k => g.words[k])));
        if (A.state.words.length) for (const run of T.findWords(A.state.words, g.words)) consider('words', box(run.map(k => g.words[k])));
      }
      if (fresh.length) {
        const n = {}; for (const x of fresh) n[x.cat] = (n[x.cat] || 0) + 1;
        const what = Object.entries(n).map(([cat, k]) => cat === 'faces' ? A.plural(k, 'face') : cat === 'codes' ? A.plural(k, 'code') : cat === 'words' ? A.plural(k, 'match', 'matches') + ' for your words' : `${A.catLabel(cat).toLowerCase()}: ${k}`);
        for (const x of fresh) pic.covers.push({ id: Date.now() + Math.random(), cat: x.cat, src: 'auto', on: false, x: x.x, y: x.y, w: x.w, h: x.h });
        A.describe(pic);
        item('warn', 'Found in the new picture, and not marked before: ' + what.join(', ') + '.', 'They are outlined in the editor now: Show me takes you there' + (n.faces ? '. A "face" may be nothing (a hand or a pattern taken for one): if so, leave it uncovered.' : ', and a tap covers them.'));
        const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Show me';
        btn.onclick = () => { cur = null; RedactEditor.open(pic, fresh[0]); };
        $('checkList').lastElementChild.querySelector('span').append(btn);
      } else item('', 'Read again: nothing new found in the new picture.', (f.read ? 'Faces, codes, card, ID and phone numbers, emails and your words were looked for again.' : 'Faces and codes were looked for again (text reading isn\'t available in this browser).') + ' Anything you uncovered yourself is left as you chose. Check the picture below yourself as well.');
      // 5: hidden data
      let had = [];
      try { had = ((await Clean.inspect(pic.bytes)).findings || []).filter(x => x.keep !== 'always'); } catch (e) { /* unreadable metadata: nothing to list */ }
      const left = ((await Clean.inspect(out)).findings || []).filter(x => x.keep !== 'always');
      if (left.length) { $('checkTitle').textContent = 'This picture can\'t be saved'; item('bad', 'The new file still carries hidden data.', left.map(x => x.label).join(', ') + '. Please report this (About → Questions or problems).'); return; }
      const where = had.some(x => PICTURE_FINDINGS.has(x.id) || /gps|location/i.test(x.id + x.label));
      item('', had.length ? `Hidden data removed: ${[...new Set(had.map(x => x.label))].slice(0, 6).join(', ')}${had.length > 6 ? '…' : ''}.` : 'No hidden data: the original had none, and the new file has none either.', had.length && where ? 'Including where the photo was taken.' : 'The new file holds the picture and nothing else.');
      const name = outName(pic, mime === 'image/png' ? 'png' : 'jpg');
      item('', `${mime === 'image/png' ? 'PNG' : 'JPEG'}, ${W} × ${H}, ${A.size(out.length)}.`, name);
      cur = { pic, bytes: out, mime, name, saved: false };
      $('checkTitle').textContent = fresh.length ? 'Ready, with something to look at' : 'Ready to save';
      $('checkSub').textContent = `Picture ${pic.n}`;
      $('saveRow').hidden = false;
      $('btnSave').textContent = 'Save';
      $('btnShare').hidden = !canShare(mime);
      $('origNote').hidden = false;
    } catch (e) {
      if (token !== cur) return;
      $('checkTitle').textContent = 'This picture couldn\'t be saved';
      item('bad', (e && e.message) || String(e), /memory|allocat|size|canvas/i.test(String(e && e.message)) ? 'It may be too large for this device. Try on a computer.' : '');
    } finally {
      if (token === cur || (cur && cur.pic === pic)) $('checkProgress').hidden = true;
      if (url && $('checkImg').src !== url) URL.revokeObjectURL(url);
    }
  }

  // ---------- saving and sharing (as in Flatbed) ----------
  function download(name, bytes, mime) {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // The Android app uses Android's "save as" screen, opening in the original's folder. Browsers that let a page open a
  // "save as" dialog (Chrome and Edge on a computer) use it. Others save to their download folder.
  const TYPES = { 'image/png': { description: 'PNG picture', accept: { 'image/png': ['.png'] } }, 'image/jpeg': { description: 'JPEG picture', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }, 'text/plain': { description: 'Text file', accept: { 'text/plain': ['.txt'] } } };
  async function saveAs(name, bytes, mime, startIn) {
    try {
      if (NATIVE) { const r = await RedactNative.saveFile(name, bytes, mime, startIn); if (!r.saved) return false; A.toast('Saved.'); return true; }
      if (typeof window.showSaveFilePicker === 'function') {
        let handle;
        try { handle = await window.showSaveFilePicker({ suggestedName: name, id: 'redact-save', startIn: 'pictures', types: TYPES[mime] ? [TYPES[mime]] : undefined }); }
        catch (e) { if (e && e.name === 'AbortError') return false; handle = null; }
        if (handle) { const w = await handle.createWritable(); await w.write(new Blob([bytes], { type: mime })); await w.close(); A.toast(`Saved as ${handle.name}.`); return true; }
      }
      download(name, bytes, mime);
      return true;
    } catch (e) { if (!e || e.name !== 'AbortError') A.toast('Could not save: ' + (e && e.message || e)); return false; }
  }
  const canShare = mime => NATIVE || (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Uint8Array(1)], 'x', { type: mime })] })); } catch (e) { return false; } })();
  function saved() {
    const r = cur; r.saved = true; r.pic.done = true; r.pic.el.classList.add('done');
    $('btnSave').textContent = 'Save a copy';
    const next = A.state.pics.find(p => p.found && !p.done && p !== r.pic);
    $('btnCheckNext').hidden = !next;
    countUse();
  }
  $('btnSave').onclick = async () => {
    const r = cur; if (!r || !r.bytes) return;
    if (await saveAs(r.name, r.bytes, r.mime, r.pic.uri)) {
      if (!NATIVE && typeof window.showSaveFilePicker !== 'function') $('saveHint').textContent = 'It\'s in your browser\'s Downloads folder.';
      saved();
    }
  };
  $('btnShare').onclick = async () => {
    const r = cur; if (!r || !r.bytes) return;
    try {
      if (NATIVE) await RedactNative.share([{ name: r.name, bytes: r.bytes, mime: r.mime }]);
      else await navigator.share({ files: [new File([r.bytes], r.name, { type: r.mime })] });
      saved();
    } catch (e) { if (!e || e.name !== 'AbortError') A.toast('Could not share: ' + (e && e.message || e)); }
  };
  function back() {
    if (cur && cur.bytes && !cur.saved && !confirm('Go back without saving? You can check and save again afterwards.')) return;
    const pic = cur && cur.pic; cur = null;
    if ($('checkImg').src.startsWith('blob:')) URL.revokeObjectURL($('checkImg').src);
    $('checkImg').removeAttribute('src');
    if (pic && !pic.removed) RedactEditor.open(pic); else A.show('scrHome');
  }
  $('btnCheckBack').onclick = back;
  $('btnCheckNext').onclick = () => {
    const r = cur, next = A.state.pics.find(p => p.found && !p.done && p !== (r && r.pic));
    cur = null; if ($('checkImg').src.startsWith('blob:')) URL.revokeObjectURL($('checkImg').src);
    if (next) RedactEditor.open(next); else A.show('scrHome');
  };

  // ---------- gentle donation request (same as the studio's other apps) ----------
  // Each picture saved or shared counts as one use. At 20, 50 and 100 uses a card appears under the save buttons;
  // "Not now" hides it until the next milestone, and after Ko-fi is tapped it never appears again.
  const SUP_KEY = 'redact.support', DONATE_AT = [20, 50, 100];
  const getSup = () => { try { return JSON.parse(localStorage.getItem(SUP_KEY) || '{}') || {}; } catch (e) { return {}; } };
  const putSup = p => { try { localStorage.setItem(SUP_KEY, JSON.stringify(Object.assign(getSup(), p))); } catch (e) {} };
  function countUse() {
    const c = $('donateCard'); if (!c) return;
    const s = getSup(), n = (+s.uses || 0) + 1, m = DONATE_AT.filter(x => n >= x).pop() || 0;
    putSup({ uses: n });
    c.hidden = !!s.donateDone || !m || (+s.donateSeen || 0) >= m;
    if (!c.hidden) { $('donateN').textContent = n; c.dataset.m = m; }
  }
  if ($('donateCard')) {
    $('btnDonate').addEventListener('click', () => { putSup({ donateDone: true }); $('donateCard').hidden = true; });
    $('btnDonateLater').onclick = () => { putSup({ donateSeen: +$('donateCard').dataset.m }); $('donateCard').hidden = true; };
  }

  return { check, back, saveAs };
})();
