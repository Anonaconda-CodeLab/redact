# Notices

## Third-party components
The built app embeds these, unmodified (the WebAssembly files are stored gzipped; `tests/origins.test.mjs` checks every
file against the SHA-256 of the release named here, listed in `tests/origins.json`):

| Component | File | Version | Licence | SHA-256 (as released) |
|---|---|---|---|---|
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime): runs the two detection models, compiled to WebAssembly | `ort.wasm.bundle.min.mjs` | 1.31.1 (npm `onnxruntime-web`) | MIT ([src/vendor/LICENSE-onnxruntime.txt](src/vendor/LICENSE-onnxruntime.txt)) | `51bd7168175767324ab0acfcfc4ca94a096a3826e3ebac9ccc4f195eb865f8dd` |
| | `ort-wasm-simd-threaded.wasm` | 1.31.1 | MIT | `4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d` |
| [zxing-wasm](https://github.com/Sec-ant/zxing-wasm): the [ZXing-C++](https://github.com/zxing-cpp/zxing-cpp) code reader (QR codes and barcodes) compiled to WebAssembly | `zxing-reader.js` | 3.1.6 (npm `zxing-wasm`) | MIT ([src/vendor/LICENSE-zxing-wasm.txt](src/vendor/LICENSE-zxing-wasm.txt)); ZXing-C++: Apache-2.0 ([src/vendor/LICENSE-zxing-cpp.txt](src/vendor/LICENSE-zxing-cpp.txt)) | `ffd72d59d54082194f7c086b384dcd930bdeb0c5b39fbb13779694e69bb0d344` |
| | `zxing_reader.wasm` | 3.1.6 | as above | `5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e` |
| [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) PP-OCRv4 text detector (finds text regions), in ONNX form from npm `@gutenye/ocr-models` 1.4.2 (`ch_PP-OCRv4_det_infer.onnx`) | `ppocrv4-det.onnx` | PP-OCRv4 | Apache-2.0 ([src/models/LICENSE-ppocr.txt](src/models/LICENSE-ppocr.txt)) | `30a86f5731181461d08021402766601e4302a9b9b9666be8aff402696339cdff` |
| [YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet) face detector, from OpenCV Zoo (commit `48b10fa`) | `yunet-2023mar.onnx` | 2023mar | MIT ([src/models/LICENSE-yunet.txt](src/models/LICENSE-yunet.txt)) | `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` |
| Instrument Sans typeface | `src/fonts/` | | SIL Open Font License 1.1 ([src/fonts/OFL-InstrumentSans.txt](src/fonts/OFL-InstrumentSans.txt)) | |
| IBM Plex Mono typeface | `src/fonts/` | | SIL Open Font License 1.1 ([src/fonts/OFL-IBMPlexMono.txt](src/fonts/OFL-IBMPlexMono.txt)) | |

`src/picture.js` (the picture-size check) and `src/native.js` come from [Flatbed](https://github.com/Anonaconda-CodeLab/flatbed)
(Anonaconda Code Lab, GPL-3.0-or-later, 1.0.2); the picture-size check is an exact copy, checked by a test. MIT and
Apache-2.0 components are compatible with the GPL v3 that covers Redact as a whole.

The **Android app** (built from `mobile/`) also includes:

| Component | Version | Licence |
|---|---|---|
| [Capacitor](https://capacitorjs.com) (`@capacitor/android`, `@capacitor/core`) | 8.5.3 | MIT |
| AndroidX libraries (AppCompat, Core, CoordinatorLayout, Core SplashScreen, Activity, WebKit) | see `mobile/android/variables.gradle` | Apache-2.0 |

Test pictures in `tests/fixtures/` are synthetic, made with Pillow, qrcode and python-barcode (`make-fixtures.py`) and
the DejaVu fonts; `faces640-opencv.json` records OpenCV's own results for the face test picture. The tools and fonts
are not part of the app.
