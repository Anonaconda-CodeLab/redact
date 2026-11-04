# Redact user manual

> **This is a test build.** It shows what Redact finds in a picture, so detection can be checked on real photos and
> phones before the editor is built. It doesn't cover or save anything yet.

## What Redact will do

Redact covers what people can see in photos and screenshots before you share them: faces, number plates, house
numbers, names and addresses, card and account numbers, QR codes and barcodes. The covers replace the pixels
themselves, so they can't be lifted off, and the saved picture carries no hidden details about you or your phone.

## The detection test

1. Tap **Open pictures** and choose one or more photos or screenshots (JPEG, PNG or WebP).
2. Each picture appears with what was found outlined:
   - **blue**: faces, with the detector's score (1.00 is certain)
   - **orange**: text (signs, number plates, house numbers, the lines of a screenshot)
   - **purple**: QR codes and barcodes
3. **Black covers** and **Mosaic on faces** show roughly how covers will look. Text is always covered in solid black:
   blurred or pixelated text can be read back.
4. **Faces: lowest score shown** hides weaker guesses. Lower it to see what the detector nearly missed.
5. **Look for small faces** also searches large pictures in overlapping parts, for faces in the background. It is
   slower; it applies to pictures opened after you change it.
6. Under each picture, the **summary** lists the size, what was found and how long each step took. It never includes
   the file name or anything the picture shows. **Copy summary** puts it on the clipboard to report back.

## Privacy

- **Nothing leaves your device.** The page's security policy blocks every connection, so the page can't send
  anything anywhere, and the Android app has no internet permission.
- Opening the web app is an ordinary website visit: the server sees your connection, as for any website. The pictures
  you open are never sent.
- Everything the detectors need is built into the page: nothing is downloaded while you use it.
- Pictures are only read. Nothing is changed, saved or kept after you close the app.
- Pictures and their text are kept from your browser's translator, so translation never sends them anywhere.

## Questions

Write to hello@anonacondacodelab.com. A description or a screenshot of the app is usually enough; please don't send
the pictures you were testing with.
