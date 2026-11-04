# Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
# Makes the test pictures (synthetic: no real people, places or documents) and records OpenCV's own YuNet results for
# the face picture, so tests/detect.test.mjs can check Redact's decoding against OpenCV's FaceDetectorYN. page.jpg (used
# by tests/picture-size.test.mjs) is copied from Flatbed's tests/fixtures, where its make-fixtures.py renders it.
#   python3 tests/fixtures/make-fixtures.py      (needs Pillow, numpy, qrcode, python-barcode and opencv-python 4.8+)
import gzip, json, os, numpy as np, qrcode, barcode, cv2
from barcode.writer import ImageWriter
from PIL import Image, ImageDraw, ImageFont, ImageFilter
here = os.path.dirname(os.path.abspath(__file__))
F = "/usr/share/fonts/truetype/dejavu/"
font = lambda n, s: ImageFont.truetype(F + n, s)
def save_rgba(im, name):   # raw RGBA with a small header: "W H\n" then the pixels, gzipped
    a = np.asarray(im.convert("RGBA"), np.uint8)
    with gzip.GzipFile(os.path.join(here, name), "wb", mtime=0) as g: g.write(f"{im.width} {im.height}\n".encode() + a.tobytes())

# 1. a street scene, 1280 x 960: a rotated street sign, a house number and a number plate (smooth shapes, no noise)
im = Image.new("RGB", (1280, 960)); d = ImageDraw.Draw(im)
for y in range(960): d.line([(0, y), (1279, y)], fill=(90 + y // 13, 110 + y // 16, 120 + y // 19))
d.rectangle([190, 380, 770, 830], fill=(140, 30, 30))
d.rectangle([370, 690, 590, 745], fill=(250, 250, 245), outline=(0, 0, 0), width=2)
d.text((383, 695), "AB 1234", font=font("DejaVuSans-Bold.ttf", 42), fill=(10, 10, 10))
d.rectangle([930, 95, 1185, 480], fill=(200, 180, 150))
d.text((1010, 160), "27", font=font("DejaVuSerif-Bold.ttf", 96), fill=(30, 30, 30))
sign = Image.new("RGB", (290, 72), (20, 90, 40)); ImageDraw.Draw(sign).text((10, 12), "Elm Street", font=font("DejaVuSans-Bold.ttf", 40), fill=(255, 255, 255))
im.paste(sign.rotate(8, expand=True, fillcolor=(100, 120, 130)), (64, 80))
im = im.filter(ImageFilter.GaussianBlur(0.6)); save_rgba(im, "street.rgba.gz")

# 2. a phone screenshot, 540 x 1200: lines of text, a QR code and a Code 128 barcode (invented details)
im = Image.new("RGB", (540, 1200), (255, 255, 255)); d = ImageDraw.Draw(im); f = font("DejaVuSans.ttf", 21)
y = 75
for t in ["Payment details", "Name: Somchai Jaidee", "Card: 4111 1111 1111 1111", "Email: somchai.j@example.com", "Phone: +66 81 234 5678", "12 Elm Street, Chiang Mai 50200"]:
    d.text((30, y), t, font=f, fill=(20, 20, 20)); y += 55
im.paste(qrcode.make("BOOKING:XK7P2Q").resize((250, 250), Image.NEAREST), (145, 600))
im.paste(barcode.get("code128", "XK7P2Q-1104", writer=ImageWriter()).render({"module_height": 12, "write_text": False}).resize((400, 120), Image.NEAREST), (70, 920))
save_rgba(im, "screenshot.rgba.gz")

# 3. the face detector's input, 640 x 640: soft face-like shapes (ovals with eyes and a mouth) on a gradient. Not real
#    faces; what matters is that Redact's decoding gives exactly what OpenCV's gives for the same model and input.
im = Image.new("RGB", (640, 640)); d = ImageDraw.Draw(im)
for y in range(640): d.line([(0, y), (639, y)], fill=(70 + y // 8, 80 + y // 9, 90 + y // 10))
for (cx, cy, r) in [(170, 220, 70), (430, 200, 46), (330, 470, 100), (560, 520, 26)]:
    d.ellipse([cx - r * .8, cy - r, cx + r * .8, cy + r], fill=(225, 185, 160))
    for ex in (-0.32, 0.32): d.ellipse([cx + ex * r - r * .12, cy - r * .3 - r * .08, cx + ex * r + r * .12, cy - r * .3 + r * .08], fill=(40, 30, 30))
    d.line([(cx, cy - r * .15), (cx - r * .08, cy + r * .2)], fill=(170, 120, 100), width=max(1, int(r * .06)))
    d.arc([cx - r * .35, cy + r * .2, cx + r * .35, cy + r * .6], 20, 160, fill=(150, 60, 60), width=max(1, int(r * .08)))
im = im.filter(ImageFilter.GaussianBlur(1.5)); save_rgba(im, "faces640.rgba.gz")
bgr = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2BGR)
model = os.path.join(here, "..", "..", "src", "models", "yunet-2023mar.onnx")
det = cv2.FaceDetectorYN.create(model, "", (640, 640), score_threshold=0.05, nms_threshold=0.3, top_k=50)
_, faces = det.detect(bgr)
faces = [] if faces is None else [[round(float(v), 2) for v in f[:4]] + [round(float(f[14]), 4)] for f in faces]
json.dump({"made_by": f"OpenCV {cv2.__version__} FaceDetectorYN, score_threshold 0.05, nms_threshold 0.3", "faces": faces},
          open(os.path.join(here, "faces640-opencv.json"), "w"), indent=1)
print("OpenCV faces:", faces)
