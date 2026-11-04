# Security and privacy

## Design
- **No network access.** The built page carries a Content Security Policy (`default-src 'none'; connect-src 'none'`,
  checked by the tests) that blocks every connection the page and its worker could make: fetching, loading outside
  scripts, images, frames or fonts, and submitting forms. A Content Security Policy does not cover the page navigating
  itself to another address, so it is not the main protection against injected code: that is that no file content can
  ever become code (see *Untrusted input*). The Android app has no internet permission at all. Fonts, the detection
  engines and their models are embedded; there are no external scripts, analytics or trackers. As in Flatbed, the
  policy adds `worker-src blob:` (the detection worker is started from code already in the page) and
  `'wasm-unsafe-eval'` (to start the WebAssembly engines; no JavaScript `eval`); neither can reach the network. The code
  reader would fetch its WebAssembly from a CDN by default; it is given the embedded copy instead (tested offline, with
  every network call made to fail).
- **Nothing stored.** Pictures are held in memory while the page is open and are gone when it closes.
- **Originals untouched.** Redact only reads the pictures you give it.
- **What a code says stays in the worker.** QR codes and barcodes are located; their contents are never shown, kept or
  passed to the page.
- **Untrusted input.** Every picture is treated as hostile. Its size is read from the file header first, and a picture
  over 100 megapixels, a file over 60 MB, or a picture whose header is damaged is refused before anything decodes it.
  Only JPEG, PNG and WebP are opened. Pictures are decoded by the browser; nothing from a file is ever inserted as HTML.
- **Covers (coming in the editor).** Covers replace pixel values before the new picture is encoded: there is no layer
  to remove. Text is covered only with solid colour, because blurred or pixelated text can be read back; faces may also
  use a coarse mosaic with random noise.
- **Translation.** Pictures and results are marked `translate="no"`, so a browser's translate feature, which sends page
  text to an online service, leaves them out.

## Android app
- **No internet permission and no other permissions.** Internet is removed in the manifest, and every build fails if it
  reappears. Pictures come from Android's picker or another app's Share action, which grant access to those pictures
  only; shared files are accepted only from other apps (`content://`, never Redact's own files), and a file over the
  60 MB limit is refused before it is read. Saving writes only to the place just chosen in Android's "save as" screen;
  sharing uses a private folder inside the app, emptied before each share and when the app starts.
- **Test builds while the repository is private** are signed with a throwaway debug key (`android-debug.yml`) and are
  never published. Official APKs will be signed with the studio's key through the protected `signing` environment,
  every signing approved by the owner; the release build fails if an APK is signed with any other key.

## Known limitations
- Detection can miss things (small or turned faces, handwriting, stylised or angled text). You check the whole
  picture before sharing.
- Names and addresses can't be recognised as such offline: the editor will find words you type.

## Reporting a vulnerability
Please report security issues privately using GitHub's **Security → Report a vulnerability** on this repository rather
than opening a public issue, or email hello@anonacondacodelab.com. Include steps to reproduce and the affected version.
Please don't attach private pictures; a test image that shows the problem is best.
