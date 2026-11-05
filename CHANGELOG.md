# Changelog

## 0.2.0
- The editor (test build, not released). Redact now covers pictures and saves them:
  - Found automatically: faces, card numbers and IBANs (checked), Thai ID numbers (checked) and passport lines,
    email addresses, phone numbers, QR codes and barcodes (and the text printed with them), web addresses, long
    numbers, all other text. Text regions are read with Flatbed's text reader (English, French, Spanish, German, Thai),
    so railings and patterns taken for text are set apart as "Possible text".
  - The first time: choose what to cover straight away, with an option to remember the choice.
  - Covers: tap to remove or put back, drag the corners to resize, draw boxes, paint with the brush, undo and redo;
    zoom and move with two fingers or the mouse wheel. Black, white or colour from around; faces solid or as a mosaic
    (text always solid).
  - Find words: names, streets, plates and numbers found in every picture, allowing small reading errors. The list is
    kept for the session only; save it to a file and import it again.
  - Check and save: the covers are painted into the full-size picture and a new file is made from those pixels; it is
    checked pixel by pixel, looked at and read again, and checked for hidden data (Unmarked's cleaner) before it can be
    saved or shared. The re-check reports only what the editor never marked (not what was uncovered on purpose),
    outlines it in the editor and leads there with Show me.
- Browse files: pictures from any folder (Chrome on Android shows only the gallery for Open photos).
- Up to 20 pictures open at once; the Android app reads each picture only when its turn comes.
- Settings: what to cover, text languages, PNG or JPEG.

## 0.1.0
- Detection test build (not released): opens photos and screenshots and shows what Redact finds in them, all on the
  device: faces (YuNet), text regions such as signs, number plates, house numbers and the lines of a screenshot
  (PaddleOCR's PP-OCRv4 detector), and QR codes and barcodes (ZXing-C++). Outlines, or a preview of black covers and
  the face mosaic; a summary of counts and times to report back. Nothing is covered or saved yet.
