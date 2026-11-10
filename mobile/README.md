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

GitHub builds and signs the APK with `.github/workflows/android.yml` (below), through the protected `signing`
environment, as in the studio's other apps. To try a branch on a phone before it is merged, run that workflow by hand on
the branch: it publishes the `android-preview` pre-release, signed after the owner's approval. **A preview replaces the
official app:** it is a release build signed with the same studio key, so Android installs it as an update over the
official Redact, not beside it. To go back to the official version, install the latest release; if the preview has a
higher version code, Android refuses that as a downgrade, so uninstall the preview first (which also clears Redact's
settings on that phone). (Until the 1.0.0 launch,
while the repository was private, test APKs came from a separate workflow with a public test key; both were removed at
launch. A debug build made by hand still installs as a separate app, "Redact (test)".) To build locally you need Node 22, JDK 21 and the Android SDK:

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
   branch (such as `test`) publishes the `android-preview` pre-release, for trying a branch before it is merged.
