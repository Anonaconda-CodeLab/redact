# Redact user manual

## What Redact does

Redact covers what people can see in your photos and screenshots before you share them: faces, number plates, house
numbers, names and addresses, card and account numbers, email addresses and phone numbers, QR codes and barcodes.

The covers become part of the picture. Many editors draw a box on top that can be removed again; Redact replaces the
pixels underneath and saves a new picture made only from what you see, with no hidden details about you or your phone.

> **Check every picture yourself before you share it.** Redact finds a lot, but not everything. You decide what is
> covered, and you can cover anything by hand.

## Covering a picture

1. Tap **Open photos** (your gallery) or **Browse files** (any folder: Downloads, a USB stick, a cloud drive on your
   phone). Several pictures at once is fine, up to 20. On a computer you can also drop pictures onto the page.[[android]]
   In the Android app you can also share pictures to Redact from your gallery or another app.[[/android]]
2. The first time, choose **what Redact should cover** straight away (see below). Tick **Remember my choice** to skip
   this next time.
3. Redact looks at each picture: faces, text, codes. It takes a few seconds a picture.
4. Tap a picture to check it. What is covered shows as it will be saved; what was found but not covered has a dashed
   outline in its category's colour.
5. Change what you need (see *The editor*), then tap **Check and save**.
6. Redact makes the new picture, checks it (see *Check and save*) and shows it. Tap **Save** or **Share**.

## What Redact looks for

- **Faces**: People, also small ones in the background.
- **Card and bank numbers**: Card numbers (only when the card checksum fits) and IBANs (checked).
- **ID numbers**: Thai ID card numbers (checked) and the machine-readable lines of passports and ID cards.
- **Email addresses**: Also when a letter is misread.
- **Phone numbers**: International (+66 …) and national (08…, (02) …) numbers.
- **QR codes and barcodes**: And the text printed next to them, which usually says the same thing. What a code holds is never shown or kept.
- **Web addresses**: Links and website names.
- **Long numbers**: Account, order and booking numbers of 8 digits or more (not dates or amounts).
- **Other text**: Every other piece of text: signs, number plates, house numbers, names, each line of a screenshot.
- **Possible text**: Shapes the detector took for text but that read as nothing, such as railings or patterns.
- **Your words**: Everything you typed in **Find words**.
- **By hand**: Boxes and brush strokes you drew.

Ticked categories are covered straight away; the others are marked so you can cover them with a tap. You can change
the choice at any time in **Settings** (the sliders icon), and for each picture in the editor.

Names and addresses can't be recognised as such. Type them in **Find words** and Redact finds them in every picture.

## The editor

- **The category bar** above the picture shows what was found. Tap a category to cover all of it, tap again to uncover
  all of it.
- **Tap** (the first tool): tap a cover to remove it, or a dashed outline to cover it. A cover you tap gets corner
  handles: drag them to make it larger or smaller.
- **Box**: drag across anything to cover it.
- **Brush**: paint over anything, such as a face turned away or a name at an angle. The slider sets the brush size.
- **Zoom** with two fingers (or the mouse wheel), and move the picture with two fingers (or by dragging with Tap).
- **Undo** and **Redo** (the arrows) take back any change.
- **‹ ›** go to the previous and next picture.

### Cover colour and faces

- **Black**, **White**, or **Colour from around**: the colour of what surrounds each cover (the paper, the screen's
  background). Colour from around makes a screenshot look as if the details were never there.
- **Faces: Mosaic** covers faces with large blocks of colour instead. It hides the face but still shows hair, skin
  tone and outline, and software can sometimes recognise a face through a mosaic: for anyone who must not be
  recognised, use **Solid**. Text is always covered solid, because blurred
  or pixelated text can be read back.

### Find words

Open **Find words**, type a name, a street, a number plate or any other word, and tap **Add**. Redact finds it in
every open picture, allowing for small reading errors, and covers it. Tap × to take a word off the list.

The list is kept only until you close Redact. **Save list** saves it to a small text file of your own (one entry per
line), and **Import list** loads such a file, so you can keep a list of your name, address and number plate and use it
every time. Redact itself never stores the list.

## Check and save

When you tap **Check and save**, Redact:

1. paints the covers into the full-size picture and saves a new file from those pixels alone;
2. opens the new file again and checks, pixel by pixel, that every cover came out (if one didn't, the picture can't
   be saved);
3. looks at the new picture again as if for the first time, and lists anything of the kinds you chose to cover that
   can still be found, and any of your words;
4. checks that the new file carries no hidden data, and lists what the original carried (where the photo was taken,
   the phone, the date and time).

Then look at the picture yourself, and tap **Save** or **Share**. Screenshots and other PNG pictures are saved as PNG
(sharp text), photos as JPEG; **Settings** can change this. The new file gets a plain name such as `redacted-1.jpg`: a
file's name goes with it, and camera names say when a photo was taken. **Settings** can keep the original name instead
(with `-redacted` added).
[[android]]In the Android app, the save screen opens in the original's folder.
[[/android]]

**Your original stays as it was**: the uncovered picture is still in your gallery, and in any cloud backup. Delete it
there if no one should ever see it.

## What Redact can't find for you

- Faces mostly hidden, turned away or seen from above; very small, blurred or dark faces.
- Handwriting; text at a steep angle, in fancy lettering, very small, or under glare. A clearer photo helps.
- Reflections (in windows, glasses, a phone screen), screens and photos inside the picture, tattoos.
- Things that give away a place or a person without any text: a view, a building, clothes, a car.

Cover these by hand with **Box** or **Brush**.

## Settings

- **Covered straight away**: the categories covered as soon as a picture is opened.
- **Languages of the text to read**: English, French, Spanish, German and Thai. Numbers, emails and web addresses are
  found in any of them; names in your words need the right language. Each extra language makes reading slower.
- **Save as**: the same kind as the original, PNG or JPEG.
- **Names of saved pictures**: plain (`redacted-1.jpg`, the default) or the original name with `-redacted` added.
- **Remember these settings on this device**: without it, settings last until you close Redact.

## Privacy

- **Nothing leaves your device.** The page's security policy blocks every connection, so it can't send anything
  anywhere[[android]], and the Android app has no internet permission[[/android]].
- Opening the web app is an ordinary website visit: the server sees your connection, as for any website. The pictures
  you open are never sent.
- Everything Redact needs (the detectors, the text reader and its languages) is built into the page: nothing is
  downloaded while you use it.
- Pictures exist only while Redact is open. The only things kept on your device are your settings, if you ask, and a
  count of pictures saved (for an occasional donation request).
- Pictures, their text and your words are kept from your browser's translator, so translation never sends them
  anywhere.

## Questions

Write to hello@anonacondacodelab.com. A description or a screenshot of the app is usually enough; please don't send
the pictures you were covering.
