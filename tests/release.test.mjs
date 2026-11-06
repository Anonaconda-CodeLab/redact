// Copyright (C) 2026 Anonaconda Code Lab · SPDX-License-Identifier: GPL-3.0-or-later
// The release pipeline and Android build settings (adapted from Still Point's tests/release.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const r = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('release workflow: three jobs; only publish can write, only sign sees the key, no tag trigger', () => {
  const w = r('.github/workflows/android.yml');
  const job = name => { const m = w.match(new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z]+:\\n|$)`)); assert.ok(m, name + ' job'); return m[1]; };
  const build = job('build'), sign = job('sign'), publish = job('publish');
  assert.equal((w.match(/contents: write/g) || []).length, 1, 'contents: write appears once');
  assert.match(publish, /contents: write/);
  for (const j of [build, sign]) assert.match(j, /contents: read/);
  assert.match(w.split('jobs:')[0], /permissions:\n  contents: read\n/, 'read-only by default');
  assert.ok(!/secrets\./.test(build) && !/secrets\./.test(publish), 'the signing key is used in the sign job only');
  assert.match(sign, /secrets\.LEADONE_KEYSTORE_B64/);
  assert.match(sign, /\n    environment: signing\n/, 'the sign job uses the protected signing environment');
  assert.match(sign, /signing environment/, 'the missing-key message points to the signing environment');
  for (const j of [build, publish]) assert.ok(!/environment:/.test(j), 'only the sign job uses an environment');
  assert.match(build, /persist-credentials: false/);
  assert.match(build, /run: node build\.mjs/);
  assert.match(build, /npm ci --ignore-scripts/, 'no install scripts run');
  assert.match(build, /retention-days: 30\b/, 'the unsigned APK outlives a late approval');
  assert.match(sign, /tr -d '\[:space:\]'/, 'all whitespace stripped from the stored key');
  assert.ok(!/tags:/.test(w.split('jobs:')[0]), 'no tag trigger');
  assert.match(w, /APK_NAME: Redact/);
  assert.match(sign, /if \[ "\$APKVER" != "\$VER" \]; then[\s\S]*exit 1;/, 'the APK version is checked');
  assert.match(publish, /Tag \$TAG already exists without a release[\s\S]*?HTTP\/\[0-9\.\]\+ 404/, 'an existing tag without a release is refused');
  const validate = build.search(/- uses: gradle\/actions\/wrapper-validation@[0-9a-f]{40}/), gradle = build.indexOf('./gradlew --no-daemon assembleRelease');
  assert.ok(validate >= 0 && gradle > validate, 'the Gradle wrapper is validated before the build runs it');
});

test('debug test APK workflow (private phase): no secrets, read-only, never publishes', () => {
  const w = r('.github/workflows/android-debug.yml');
  assert.ok(!/secrets\.|environment:|contents: write|gh release/.test(w));
  assert.match(w, /persist-credentials: false/);
  assert.match(w, /npm ci --ignore-scripts/);
  assert.match(w, /android\.permission\.INTERNET/, 'checks the APK has no internet permission');
  assert.ok(w.indexOf('wrapper-validation@') < w.indexOf('./gradlew'), 'the Gradle wrapper is validated first');
});

test('workflows: every action is pinned to a full commit (a moved tag cannot change what runs)', () => {
  for (const f of readdirSync(new URL('../.github/workflows/', import.meta.url))) {
    const uses = [...r('.github/workflows/' + f).matchAll(/uses:\s*(\S+)/g)].map(m => m[1]);
    assert.ok(uses.length > 0, f);
    for (const u of uses) assert.match(u, /^[\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40}$/, `${f}: ${u}`);
  }
});

test('Android: no internet, no camera, nothing exported but the launcher; shares only its share folder', () => {
  const m = r('mobile/android/app/src/main/AndroidManifest.xml');
  assert.match(m, /android\.permission\.INTERNET" tools:node="remove"/);
  assert.ok(!/<uses-permission(?![^>]*tools:node="remove")/.test(m), 'no permission is asked for');
  assert.ok(!/IMAGE_CAPTURE|CAMERA/.test(m));
  assert.equal((m.match(/android:exported="true"/g) || []).length, 1);
  assert.match(m, /android:allowBackup="false"/);
  const paths = r('mobile/android/app/src/main/res/xml/file_paths.xml');
  assert.deepEqual([...paths.matchAll(/<(\w+-path) [^>]*path="([^"]*)"/g)].map(x => x[1] + ' ' + x[2]), ['cache-path share/']);
  assert.match(r('mobile/capacitor.config.json'), /"webContentsDebuggingEnabled": false/);
});

test('Android: writeChunk writes only to the place the save screen returned; shared files must come from other apps', () => {
  const j = r('mobile/android/app/src/main/java/com/anonacondacodelab/redact/RedactPlugin.java');
  const wc = j.slice(j.indexOf('public void writeChunk'), j.indexOf('\n    }\n', j.indexOf('public void writeChunk')));
  assert.match(wc, /saveTarget/, 'writeChunk checks the address against the one from the save screen');
  assert.match(j, /SCHEME_CONTENT\.equals\(u\.getScheme\(\)\)\s*&& !\(getContext\(\)\.getPackageName\(\) \+ "\.fileprovider"\)\.equals\(u\.getAuthority\(\)\)/);
  assert.ok(!/takePhoto|IMAGE_CAPTURE|camera/i.test(j), 'no camera code');
  assert.match(j, /u\.startsWith\("https:\/\/"\) \|\| u\.startsWith\("mailto:"\)/, 'links: https and mailto only');
});

test('versions agree: package.json, mobile/package.json, build.gradle, CHANGELOG', () => {
  const v = JSON.parse(r('package.json')).version;
  assert.equal(JSON.parse(r('mobile/package.json')).version, v);
  const g = r('mobile/android/app/build.gradle');
  assert.match(g, new RegExp(`versionName "${v.replace(/\./g, '\\.')}"`));
  const [a, b, c] = v.split('.').map(Number);
  assert.match(g, new RegExp(`versionCode ${a * 10000 + b * 100 + c}\\b`));
  assert.match(r('CHANGELOG.md'), new RegExp(`^## ${v.replace(/\./g, '\\.')}$`, 'm'));
  assert.match(r('mobile/android/gradle/wrapper/gradle-wrapper.properties'), /^distributionSha256Sum=[0-9a-f]{64}$/m);
});

test('test builds: a separate app with the public test key; release builds never use it', () => {
  const g = r('mobile/android/app/build.gradle');
  const debug = /\n        debug \{([\s\S]*?)\n        \}/.exec(g)[1], release = /\n        release \{\n            if \(ks\) signingConfig([\s\S]*?)\n        \}/.exec(g)[0];
  assert.match(debug, /applicationIdSuffix '\.test'/); assert.match(debug, /signingConfig signingConfigs\.test/);
  assert.ok(!/signingConfigs\.test/.test(release), 'release is never signed with the test key');
  assert.match(r('mobile/android/app/src/debug/res/values/strings.xml'), /<string name="app_name">Redact \(test\)<\/string>/);
  assert.match(r('.github/workflows/android-debug.yml'), /com\.anonacondacodelab\.redact\.test/);
  assert.match(r('.gitignore'), /^\*\.keystore$[\s\S]*^!mobile\/android\/test\.keystore$/m, 'only the test key is an exception');
});
