/* Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
   ---------- Android app (Capacitor) ----------
   In the Android app the page runs inside Android's WebView, which can't save files or share them. This file supplies
   native stand-ins: Android's file picker, saving (Android's "save as" screen), sharing (the share sheet), and
   receiving pictures shared to Redact from the gallery. In a browser NATIVE is false and nothing here is used.
   Adapted from Flatbed's src/native.js (1.0.2) without its camera.
   Everything stays on the phone: the app has no internet permission. */
const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
const nativeCall = (plugin, method, opts) => window.Capacitor.nativePromise(plugin, method, opts || {});
const nativeOn = (plugin, event, cb) => window.Capacitor.addListener(plugin, event, cb);
const CHUNK = 384 * 1024;   // bytes per bridge call (sent as base64)
const NATIVE_MAX = 60 * 1024 * 1024;   // same limit as the page (MAX_BYTES in app.js): larger files are never read
const toB64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const b = atob(s || ''), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const RedactNative = NATIVE ? {
  // Android's "save as" screen: the place the person chooses ('' when cancelled). Name only: Android limits what a
  // pending call may carry. writeTo then writes there (once).
  async pickSave(name, mime) {
    const r = await nativeCall('Redact', 'pickSaveLocation', { name, mime: mime || 'application/octet-stream' });
    return r && r.uri || '';
  },
  async writeTo(uri, bytes) {
    for (let i = 0; i === 0 || i < bytes.length; i += CHUNK)
      await nativeCall('Redact', 'writeChunk', { uri, data: toB64(bytes.subarray(i, i + CHUNK)), first: i === 0, last: i + CHUNK >= bytes.length });
  },
  async saveFile(name, bytes, mime) {
    const uri = await this.pickSave(name, mime);
    if (!uri) return { saved: false };
    await this.writeTo(uri, bytes);
    return { saved: true };
  },
  // copy the files into the app's private share folder, then open Android's share sheet
  async share(files) {
    await nativeCall('Redact', 'shareBegin');
    for (const [k, f] of files.entries())
      for (let i = 0; i === 0 || i < f.bytes.length; i += CHUNK)
        await nativeCall('Redact', 'shareChunk', { index: k, name: f.name, data: toB64(f.bytes.subarray(i, i + CHUNK)), first: i === 0, last: i + CHUNK >= f.bytes.length });
    await nativeCall('Redact', 'shareSend', { count: files.length, mimes: files.map(f => f.mime || 'application/octet-stream') });
  },
  // read files the native side holds (picked or shared) in pieces.
  // A file over the limit is not read (it could run the app out of memory): it is passed on with its size only, and the
  // page shows "too large". The size Android reports is checked first; reading also stops at the limit, in case it was wrong.
  async readHeld(list) {
    const out = [];
    for (const it of list || []) {
      const name = it.name || 'picture', mime = it.mime || '';
      if (+it.size > NATIVE_MAX) { out.push({ name, bytes: null, size: +it.size, mime }); continue; }
      const parts = []; let offset = 0;
      for (;;) {
        const c = await nativeCall('Redact', 'readShared', { id: it.id, offset, length: CHUNK });
        const u = fromB64(c && c.data); parts.push(u); offset += u.length;
        if (!c || c.eof || !u.length || offset > NATIVE_MAX) break;
      }
      if (offset > NATIVE_MAX) { out.push({ name, bytes: null, size: offset, mime }); continue; }
      const bytes = new Uint8Array(offset); let o = 0; for (const p of parts) { bytes.set(p, o); o += p.length; }
      out.push({ name, bytes, mime });
    }
    await nativeCall('Redact', 'clearShared').catch(() => {});
    return out;
  },
  // pictures shared to Redact from another app ("Share → Redact")
  async takeShared() { const r = await nativeCall('Redact', 'getShared'); return this.readHeld(r && r.files); },
  // Android's own file picker
  async pickFiles() { const r = await nativeCall('Redact', 'pickFiles'); return this.readHeld(r && r.files); },
  onShared: cb => nativeOn('Redact', 'shared', cb),
  openUrl: url => nativeCall('Redact', 'openUrl', { url })
} : null;

if (NATIVE) (() => {
  document.documentElement.classList.add('native');   // shows Android-only buttons (Check for updates)
  // links to websites and email open in the phone's browser or mail app, never inside the app
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^(https:|mailto:)/i.test(href)) { e.preventDefault(); RedactNative.openUrl(href).catch(() => {}); }
  }, true);
})();
