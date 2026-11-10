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
- **Nothing stored.** Pictures are held in memory while the page is open and are gone when it closes. The only things
  kept on the device are the settings, when the person ticks *Remember* (browser localStorage), and a count of pictures
  saved, used only for an occasional donation request. The Find words list is never stored by the app: it can be saved
  to a file the person keeps.
- **Originals untouched.** Redact only reads the pictures you give it.
- **What a code says stays in the worker.** QR codes and barcodes are located; their contents are never shown, kept or
  passed to the page.
- **Untrusted input.** Every picture is treated as hostile. Its size is read from the file header first, and a picture
  over 100 megapixels, a file over 60 MB, or a picture whose header is damaged is refused before anything decodes it.
  Only JPEG, PNG and WebP are opened. Pictures are decoded by the browser; nothing from a file is ever inserted as HTML.
- **Covers are pixels.** Covers replace pixel values in a full-size copy of the picture, and a new file is encoded
  from those pixels alone: no layer, no part of the original file. Text is covered only with solid colour, because
  blurred or pixelated text can be read back; faces may also use a coarse mosaic with random noise.
- **Every saved picture is checked** before it can be saved or shared: decoded again and compared pixel by pixel with
  what each cover should be (exactly for PNG; for JPEG within a tolerance, away from cover edges), with overlapping
  covers in painting order; looked at and read again as a new picture, listing anything of the kinds the person chose
  to cover that can still be found; and inspected by Unmarked's cleaner, which must find no hidden data. The browser's
  encoder adds a standard colour profile to JPEGs: the cleaner removes it without touching the picture data.
- **Text read from pictures** is only compared with patterns and the Find words list, and shown nowhere except as
  counts; it never reaches the page as HTML.
- **Translation.** Pictures and results are marked `translate="no"`, so a browser's translate feature, which sends page
  text to an online service, leaves them out.

## Android app
- **No internet permission and no other permissions.** Internet is removed in the manifest, and every build fails if it
  reappears. Pictures come from Android's picker or another app's Share action, which grant access to those pictures
  only; shared files are accepted only from other apps (`content://`, never Redact's own files), and a file over the
  60 MB limit is refused before it is read. Saving writes only to the place just chosen in Android's "save as" screen;
  sharing uses a private folder inside the app, emptied before each share and when the app starts.
- **Signing:** every APK published by the Android workflow (`android.yml`) is signed with the studio's key through the
  protected `signing` environment, each signing approved by the owner, and official releases come from `main` only;
  the workflow fails if an APK is signed with any other key. APKs built by anyone on their own computer are signed with
  their own (or a debug) key: check the certificate fingerprint on the download page. (Before the 1.0.0 launch, test APKs were a separate app, `com.anonacondacodelab.redact.test`, signed
  with a public test key; that workflow and key were removed at launch, and they could never update the official app,
  which Android only updates from the same signer.)

## Known limitations
- Detection can miss things (small or turned faces, handwriting, stylised or angled text). You check the whole
  picture before sharing.
- Names and addresses can't be recognised as such offline: Find words finds the ones you type.
- The original picture is not changed or deleted: it stays in the gallery and any cloud backup.

## Reporting a vulnerability
Please report security issues privately using GitHub's **Security → Report a vulnerability** on this repository rather
than opening a public issue, or email hello@anonacondacodelab.com. Include steps to reproduce and the affected version.
Please don't attach private pictures; a test image that shows the problem is best.
