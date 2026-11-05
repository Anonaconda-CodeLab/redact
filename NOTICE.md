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
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core): the [Tesseract](https://github.com/tesseract-ocr/tesseract) OCR engine and Leptonica compiled to WebAssembly (reads the text regions) | `tesseract-core-simd-lstm.js` | 6.1.2 (as in Flatbed) | Apache-2.0 ([src/vendor/LICENSE-tesseract.txt](src/vendor/LICENSE-tesseract.txt)); Leptonica: BSD-2-Clause | `be3504705d7111d1d1f3f7f9dff326c26d334031ede36e31c4d3cf883027e982` |
| | `tesseract-core-simd-lstm.wasm` | 6.1.2 | as above | `187d76742dfc0d8929f0b49a619f145bb6370730776c7bd0d3e20c6b2098808d` |
| Tesseract language data, "fast" models, from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) commit `8741641` | `eng.traineddata` | | Apache-2.0 | `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2` |
| | `fra.traineddata` | | Apache-2.0 | `ced037562e8c80c13122dece28dd477d399af80911a28791a66a63ac1e3445ca` |
| | `spa.traineddata` | | Apache-2.0 | `6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464` |
| | `deu.traineddata` | | Apache-2.0 | `19d219bbb6672c869d20a9636c6816a81eb9a71796cb93ebe0cb1530e2cdb22d` |
| | `tha.traineddata` | | Apache-2.0 | `294227cc2d1292b0acb28d61d4115c88252b96d466ca90b417cf4cf0c67bf07c` |
| Instrument Sans typeface | `src/fonts/` | | SIL Open Font License 1.1 ([src/fonts/OFL-InstrumentSans.txt](src/fonts/OFL-InstrumentSans.txt)) | |
| IBM Plex Mono typeface | `src/fonts/` | | SIL Open Font License 1.1 ([src/fonts/OFL-IBMPlexMono.txt](src/fonts/OFL-IBMPlexMono.txt)) | |

From the studio's other apps (Anonaconda Code Lab, GPL-3.0-or-later), checked by tests to be unchanged copies:
`src/clean.js`, [Unmarked](https://github.com/Anonaconda-CodeLab/unmarked)'s cleaner (0.1.4, commit `695a6c5`, as in
Flatbed 1.0.2); `src/ocr-engine.js` (the text-reading driver) and the picture-size check in `src/picture.js`, from
[Flatbed](https://github.com/Anonaconda-CodeLab/flatbed) 1.0.2. `src/native.js` and the Android plugin are adapted from
Flatbed's. MIT and
Apache-2.0 components are compatible with the GPL v3 that covers Redact as a whole.

The **Android app** (built from `mobile/`) also includes:

| Component | Version | Licence |
|---|---|---|
| [Capacitor](https://capacitorjs.com) (`@capacitor/android`, `@capacitor/core`) | 8.5.3 | MIT |
| AndroidX libraries (AppCompat, Core, CoordinatorLayout, Core SplashScreen, Activity, WebKit) | see `mobile/android/variables.gradle` | Apache-2.0 |

Test pictures in `tests/fixtures/` are synthetic, made with Pillow, qrcode and python-barcode (`make-fixtures.py`) and
the DejaVu fonts; `faces640-opencv.json` records OpenCV's own results for the face test picture. The tools and fonts
are not part of the app.
