# Redact for Android

The Android app wraps the same web app (`../dist/index.html`) with [Capacitor](https://capacitorjs.com).
Native code is small and lives in `android/app/src/main/java/com/anonacondacodelab/redact/`:

- `RedactPlugin.java` (from Flatbed's plugin, without its camera): picking pictures with Android's picker, receiving
  pictures shared to the app (**Share → Redact**), saving through Android's "save as" screen, sharing through the share
  sheet, and opening web and email links in the phone's browser or mail app.
- `MainActivity.java`: the Back button goes back inside the app.

`src/native.js` in the web app calls these. File data crosses the bridge in base64 pieces of 384 KB.

The app has **no internet permission and no other permissions** (internet is removed in the manifest, and the build
checks for it). Shared copies are written to a private `share/` folder, emptied before each share and when the app
starts, and exposed only to the app chosen in the share sheet.

## Building

While the repository is private, GitHub builds a test APK on each push to `test` (`.github/workflows/android-debug.yml`,
attached to the run as an artifact): a separate app, "Redact (test)" (`com.anonacondacodelab.redact.test`), signed with
the public test key `test.keystore` (password `android`; for test builds only), so each test APK updates the last.
The key is public on purpose, so test builds need no secrets while the repository is private; that is also why anyone
could sign an update to "Redact (test)". It must never sign anything but test builds of `com.anonacondacodelab.redact.test`
(a test checks that release builds can't use it), test APKs are never linked or published, and "Redact (test)" is
uninstalled and this workflow retired (or limited to manual runs) at launch. Once it is public, `android.yml` signs
with the studio's key through the protected `signing` environment, as in the studio's other apps. To build locally you need Node 22, JDK 21 and the Android SDK:

```
node build.mjs                      # in the repository root
cd mobile && npm ci && npx cap sync android
cd android && ./gradlew assembleRelease
```

Release signing reads `LEADONE_KEYSTORE`, `LEADONE_KEYSTORE_PASSWORD`, `LEADONE_KEY_ALIAS` and `LEADONE_KEY_PASSWORD`
from the environment (the studio's shared key; the names come from the first app that used it). Without them the
release APK is unsigned, and Android will not install an unsigned APK. To sign your own build, make a key once:

```
keytool -genkeypair -v -keystore my-release.jks -alias mykey -keyalg RSA -keysize 4096 -validity 10000
export LEADONE_KEYSTORE=$PWD/my-release.jks LEADONE_KEY_ALIAS=mykey
export LEADONE_KEYSTORE_PASSWORD=... LEADONE_KEY_PASSWORD=...
cd mobile/android && ./gradlew assembleRelease     # from the repository root; app/build/outputs/apk/release/app-release.apk
```

A build signed with your own key cannot install over the official app (Android checks the signature).

## Releases

Releases are made by running the *Android APK* workflow by hand on `main` with **release** ticked (Actions → Android
APK → Run workflow, or `gh workflow run android.yml --ref main -f release=true`). Pushing a tag does nothing: the
workflow creates the `v<version>` tag itself, from `package.json`. It works in three separate jobs:

1. **Build** (read-only access): builds the web app and an *unsigned* APK. npm and Gradle never see the signing key,
   its password or a token that could write to the repository.
2. **Sign** (read-only access): signs that APK with the studio's key using `apksigner`, then checks that it has no
   internet permission and that it is signed with the published key (`certSha256` in `../build.mjs`). The key is kept
   in the protected `signing` environment, so every signed build waits for the owner's approval.
3. **Publish** (the only job that can write): publishes the GitHub release with the APK, its SHA-256 checksum and the
   changelog entry, or on an ordinary push to `main` the `android-test` pre-release. A run started by hand on another
   branch (such as `test`) publishes nothing: the signed APK is attached to the run instead.
