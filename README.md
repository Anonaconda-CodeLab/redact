# Redact

**Cover what people can see in your photos and screenshots before you share them, on your own device.**
Faces, number plates, house numbers, names and addresses, card and account numbers, QR codes and barcodes: Redact finds
them, you check and add to what it found, and the covers replace the pixels themselves, so they can't be lifted off.
No account, no server, no upload.

> **Status: test build 0.2.0**, in testing before the first release. See `docs/MANUAL.md` for how it works.

**Web app (when launched): [redact.anonacondacodelab.com](https://redact.anonacondacodelab.com)**

## How it works
The whole web app is one file, `dist/index.html`, built by `node build.mjs` from `src/`. Its Content Security Policy
blocks every connection (`connect-src 'none'`); it allows workers only from `blob:` addresses the page makes from its
own code, and WebAssembly (`'wasm-unsafe-eval'`, no JavaScript `eval`) for the detectors. The engines and models are
embedded in the page (gzipped) and handed to the worker as bytes: nothing is ever downloaded.

- `src/detect.js`: model inputs and outputs (text regions, faces, codes), merging, margins and the cover styles. Plain
  JavaScript, no dependencies; runs in the detection worker and in Node for the tests.
- `src/text.js`: the text regions cut into one strip and read once by Tesseract (`src/ocr-engine.js`, Flatbed's), the
  words mapped back; card numbers, IBANs, ID numbers, emails, phones, links and long numbers found in them (with
  checksums); Find words.
- `src/paint.js`: covers painted into the pixels (solid, colour from around, brush, face mosaic), and the pixel check of
  a saved picture.
- `src/editor.js`: the editor. `src/save.js`: check and save. `src/clean.js`: Unmarked's cleaner, for the hidden-data
  check and to strip what the browser's encoder adds.
- `src/detect-worker.js`: the module worker that runs the models with ONNX Runtime (one thread) and reads codes with
  ZXing-C++. A code's contents never leave the worker.
- `src/picture.js`: refuses picture-size bombs from the file header before anything decodes them (Flatbed's check).
- `src/app.js`, `src/body.html`, `src/style.css`: the page, opening pictures, settings. `src/native.js`: the Android app's file picker, saving,
  sharing and Share → Redact.
- `mobile/`: the Android app ([Capacitor](https://capacitorjs.com)), no internet permission. See `mobile/README.md`.

Detection: [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) for faces (the whole
picture, plus overlapping tiles in large pictures for small faces), [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)'s
PP-OCRv4 detector for text regions, [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) for codes. The face decoding is
tested against OpenCV's own. See `NOTICE.md` for versions, licences and checksums.

## Develop
```
node build.mjs     # -> dist/
npm test           # builds, then runs the tests (Node 20.12 or later; no packages to install)
```
`tests/fixtures/make-fixtures.py` rebuilds the synthetic test pictures (Pillow, numpy, qrcode, python-barcode, OpenCV).

## Hosting
Cloudflare Pages, from this repository: build command `node build.mjs`, output `dist`, variable `NODE_VERSION=22`.
`dist/_headers` adds the HTTP headers (a second block on connections, no framing, `*.pages.dev` kept out of search
engines).

## Licence
GPL-3.0-or-later. © 2026 Anonaconda Code Lab. The code is written with Claude (every commit says so); the owner
designs and tests the app.
