// jadx-bridge.test.mjs: JadxBridge dürüstlük testleri (node:test; gerçek jadx KOŞULMAZ).
// Koş: node --test tests/jadx-bridge.test.mjs   (önce: npm run build)
// Canlı jadx + golden APK kapısı bu dosyanın kapsamı dışındadır (açık bırakıldı).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseAndroidManifestXml,
  fqcnFromRelativeJavaPath,
  collectClassFqcns,
  resolveJadxCommand,
  resolveJavaCommand,
  rea_jadx_manifest,
  rea_jadx_classes,
  rea_jadx_decompile,
  rea_jadx_full,
} from "../dist/rea-domains/android/JadxBridge.js";

const INLINE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.ornek.uygulama" android:versionCode="7">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission-sdk-23 android:name="android.permission.CAMERA"/>
    <application android:label="Ornek">
        <activity android:name=".MainActivity" android:exported="true"/>
        <activity android:name="com.ornek.AyarActivity"/>
        <activity-alias android:name=".AliasActivity" android:targetActivity=".MainActivity"/>
    </application>
</manifest>`;

// Sahte sources düzeni: <dir>/sources/<paket>/…/*.java (jadx çıktısıyla aynı şekil).
function sahteSources() {
  const dir = mkdtempSync(join(tmpdir(), "jadx-bridge-"));
  mkdirSync(join(dir, "sources", "com", "ornek", "api"), { recursive: true });
  writeFileSync(join(dir, "sources", "com", "ornek", "MainActivity.java"), "package com.ornek;\npublic class MainActivity {}\n");
  writeFileSync(join(dir, "sources", "com", "ornek", "api", "ApiClient.java"), "package com.ornek.api;\npublic class ApiClient {}\n");
  mkdirSync(join(dir, "resources"), { recursive: true });
  writeFileSync(join(dir, "resources", "AndroidManifest.xml"), INLINE_MANIFEST);
  return dir;
}

// Var olan sahte APK dosyası (içerik önemsiz: araç-yok dalı jadx'e hiç ulaşmaz).
function sahteApk() {
  const dir = mkdtempSync(join(tmpdir(), "jadx-apk-"));
  const apk = join(dir, "sahte.apk");
  writeFileSync(apk, "PK\x03\x04 sahte");
  return apk;
}

// Env'i deterministik "araç yok" durumuna zorla ve geri yükle.
// REA_JADX_BIN var olmayan mutlak yola işaret ederse keşif otoritatif olarak null döner.
function aracYokEnv(fn) {
  const once = { JAR: process.env.REA_JADX_JAR, BIN: process.env.REA_JADX_BIN };
  delete process.env.REA_JADX_JAR;
  process.env.REA_JADX_BIN = join(tmpdir(), "kesinlikle-olmayan-jadx-9f3k2", "jadx");
  try {
    return fn();
  } finally {
    if (once.JAR === undefined) delete process.env.REA_JADX_JAR; else process.env.REA_JADX_JAR = once.JAR;
    if (once.BIN === undefined) delete process.env.REA_JADX_BIN; else process.env.REA_JADX_BIN = once.BIN;
  }
}

test("manifest parser: paket/izin/aktivite inline XML'den çıkar (tekilleme dahil)", () => {
  const r = parseAndroidManifestXml(INLINE_MANIFEST);
  assert.equal(r.paket, "com.ornek.uygulama");
  assert.deepEqual(r.izinler, ["android.permission.INTERNET", "android.permission.CAMERA"]);
  assert.deepEqual(r.aktiviteler, [".MainActivity", "com.ornek.AyarActivity", ".AliasActivity"]);
});

test("manifest parser: package yoksa paket null döner (uydurma yok)", () => {
  const r = parseAndroidManifestXml("<manifest><application/></manifest>");
  assert.equal(r.paket, null);
  assert.deepEqual(r.izinler, []);
  assert.deepEqual(r.aktiviteler, []);
});

test("FQCN: göreli .java yolundan tam sınıf adı üretilir", () => {
  assert.equal(fqcnFromRelativeJavaPath("com/ornek/api/ApiClient.java"), "com.ornek.api.ApiClient");
  assert.equal(fqcnFromRelativeJavaPath("com\\ornek\\MainActivity.java"), "com.ornek.MainActivity");
  assert.equal(fqcnFromRelativeJavaPath("TekSinif.java"), "TekSinif");
});

test("FQCN toplama: sahte sources düzeninden sıralı liste çıkar", () => {
  const fqcnler = collectClassFqcns(sahteSources());
  assert.deepEqual(fqcnler, ["com.ornek.MainActivity", "com.ornek.api.ApiClient"]);
});

test("FQCN toplama: boş dizinde boş liste (classes bunu ok:false yapar)", () => {
  assert.deepEqual(collectClassFqcns(mkdtempSync(join(tmpdir(), "jadx-bos-"))), []);
});

test("keşif: REA_JADX_BIN var olmayan yolu gösterirse null (sessiz fallback yok)", () => {
  const env = { ...process.env, REA_JADX_JAR: "", REA_JADX_BIN: join(tmpdir(), "yok-9f3k2", "jadx") };
  assert.equal(resolveJadxCommand(env, process.platform), null);
});

test("keşif: REA_JADX_JAR var olmayan jar'ı gösterirse null", () => {
  const env = { ...process.env, REA_JADX_JAR: join(tmpdir(), "yok-9f3k2", "jadx-all.jar"), REA_JADX_BIN: "" };
  assert.equal(resolveJadxCommand(env, process.platform), null);
});

test("keşif: var olan REA_JADX_JAR java -jar komutuna çevrilir", () => {
  const dir = mkdtempSync(join(tmpdir(), "jadx-jar-"));
  const jar = join(dir, "jadx-9.9-all.jar");
  writeFileSync(jar, "sahte jar (koşulmaz)");
  const cmd = resolveJadxCommand({ ...process.env, REA_JADX_JAR: jar, REA_JADX_BIN: "" }, process.platform);
  assert.ok(cmd);
  assert.equal(cmd.kaynak, "REA_JADX_JAR");
  assert.deepEqual(cmd.onEkArgs, ["-jar", jar]);
  assert.match(cmd.komut, /java(\.exe)?$/);
});

test("java keşfi: JAVA_HOME yoksa PATH java'sına düşer", () => {
  assert.equal(resolveJavaCommand({ PATH: "" }, "linux"), "java");
});

test("araç yok dalı: manifest throw etmeden capability_unsupported döner (gerçek jadx koşulmaz)", () => {
  aracYokEnv(() => {
    const r = rea_jadx_manifest(sahteApk());
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.neden, /jadx bulunamadı/);
  });
});

test("araç yok dalı: classes ve decompile de capability_unsupported döner", () => {
  aracYokEnv(() => {
    const apk = sahteApk();
    for (const r of [rea_jadx_classes(apk), rea_jadx_decompile(apk, "com.ornek.MainActivity", join(tmpdir(), "jadx-cik-9f3k2"))]) {
      assert.equal(r.ok, false);
      assert.equal(r.code, "capability_unsupported");
    }
  });
});

test("araç yok dalı: full, önceden dolu çıktı dizinindeki eski .java'yı başarı saymaz", () => {
  aracYokEnv(() => {
    const dolu = sahteSources(); // içinde önceden var olan 2 .java
    const r = rea_jadx_full(sahteApk(), dolu);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

test("APK yokluğu: dört araç da açık ok:false döner, throw etmez", () => {
  const olmayan = join(tmpdir(), "kesin-olmayan-9f3k2.apk");
  for (const r of [
    rea_jadx_manifest(olmayan),
    rea_jadx_classes(olmayan),
    rea_jadx_decompile(olmayan, "com.ornek.MainActivity", join(tmpdir(), "jadx-cik-9f3k2")),
    rea_jadx_full(olmayan, join(tmpdir(), "jadx-cik-9f3k2")),
  ]) {
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.neden, /APK yok/);
  }
});
