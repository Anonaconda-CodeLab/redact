# Redact

**Cover what people can see in your photos and screenshots before you share them, on your own device.**
Faces, number plates, house numbers, names and addresses, card and account numbers, QR codes and barcodes: Redact finds
them, you check and add to what it found, and the covers replace the pixels themselves, so they can't be lifted off.
No account, no server, no upload.

> **Status: early test build (0.1.0).** It shows what the detectors find, so they can be checked on real phones before
> the editor is built. Nothing is covered or saved yet. The plan: faces, text and codes suggested automatically;
> names and addresses found from words you type; covers drawn by hand anywhere; the finished picture redrawn from
> scratch with no hidden data, checked again before it is saved.

**Web app (when launched): [redact.anonacondacodelab.com](https://redact.anonacondacodelab.com)**

## How it works
The whole web app is one file, `dist/index.html`, built by `node build.mjs` from `src/`. Its Content Security Policy
blocks every connection (`connect-src 'none'`); it allows workers only from `blob:` addresses the page makes from its
own code, and WebAssembly (`'wasm-unsafe-eval'`, no JavaScript `eval`) for the detectors. The engines and models are
embedded in the page (gzipped) and handed to the worker as bytes: nothing is ever downloaded.

- `src/detect.js`: model inputs and outputs (text regions, faces, codes), merging, margins and the cover styles. Plain
  JavaScript, no dependencies; runs in the detection worker and in Node for the tests.
- `src/detect-worker.js`: the module worker that runs the models with ONNX Runtime (one thread) and reads codes with
  ZXing-C++. A code's contents never leave the worker.
- `src/picture.js`: refuses picture-size bombs from the file header before anything decodes them (Flatbed's check).
- `src/app.js`, `src/body.html`, `src/style.css`: the page. `src/native.js`: the Android app's file picker, saving,
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
