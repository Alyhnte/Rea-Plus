// apk-adb2.test.mjs: Apktool build/framework/caps + ADB install/logcat/screencap (node:test, gerçek exec, stub yok).
// Koş: npm run build sonrası `node tests/apk-adb2.test.mjs` (apktool+aapt2 gerçek, adb/cihaz yok).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APKTOOL_TOOLS,
  rea_apktool_build,
  rea_apktool_caps,
  rea_apktool_decode,
  rea_apktool_framework,
} from "../dist/rea-domains/android/ApktoolBridge.js";
import {
  ADB_TOOLS,
  rea_adb_devices,
  rea_adb_install,
  rea_adb_logcat,
  rea_adb_screencap,
} from "../dist/rea-domains/android/AdbBridge.js";

// Var olmayan yollar (arg/kapı doğrulaması için, dosya yazılmaz).
const YOK_APK = join(tmpdir(), "rea-olmayan.apk");
const YOK_PROJE = join(tmpdir(), "rea-olmayan-proje");

// Cihaz yok mu? (bu makinede adb kurulu değil; cihazlı ortamda testler ok-dalını dener.)
function cihazYok() {
  const r = rea_adb_devices();
  return !r.ok || r.cihazlar.length === 0;
}

// TOOLS kataloğu 5 isme genişledi (mevcut 2 + build/framework/caps).
test("APKTOOL_TOOLS 5 araç adı içerir", () => {
  assert.equal(APKTOOL_TOOLS.length, 5);
  for (const ad of ["rea_apktool_decode", "rea_apktool_info", "rea_apktool_build", "rea_apktool_framework", "rea_apktool_caps"]) {
    assert.ok(APKTOOL_TOOLS.includes(ad), `eksik: ${ad}`);
  }
});

// TOOLS kataloğu 5 isme genişledi (mevcut 2 + install/logcat/screencap).
test("ADB_TOOLS 5 araç adı içerir", () => {
  assert.equal(ADB_TOOLS.length, 5);
  for (const ad of ["rea_adb_devices", "rea_adb_packages", "rea_adb_install", "rea_adb_logcat", "rea_adb_screencap"]) {
    assert.ok(ADB_TOOLS.includes(ad), `eksik: ${ad}`);
  }
});

// Caps gerçektir: apktool `version` + aapt2 `version` çalıştırılır, stub yok.
test("caps gerçek: apktool + aapt2 sürümü döner", () => {
  const r = rea_apktool_caps();
  if (!r.ok) {
    assert.equal(r.code, "capability_unsupported"); // apktool kurulu değilse kapı
    return;
  }
  assert.match(r.apktool, /\d+\.\d+/); // örn. "2.12.0"
  assert.ok(r.aapt2 !== null && r.aapt2.includes("Android Asset Packaging Tool"));
  assert.equal(r.aapt2Tamam, true);
});

// Mevcut kapı deseni korunur: decode APK yoksa capability_unsupported.
test("decode kapısı korunur: apk yoksa capability_unsupported", () => {
  const r = rea_apktool_decode(YOK_APK, join(tmpdir(), "rea-decode-cikti"));
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Build kapısı: proje dizini yoksa çalıştırma, capability_unsupported.
test("build: proje dizini yoksa capability_unsupported", () => {
  const r = rea_apktool_build(YOK_PROJE, join(tmpdir(), "rea-build.apk"));
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Build arg doğrulaması: boş yol ortamdan bağımsız unsupported.
test("build: boş yol capability_unsupported", () => {
  assert.equal(rea_apktool_build("", join(tmpdir(), "x.apk")).code, "capability_unsupported");
  assert.equal(rea_apktool_build(YOK_PROJE, "").code, "capability_unsupported");
});

// Framework kapısı: dosya yoksa çalıştırma, capability_unsupported (cihaz gerekmez).
test("framework: dosya yoksa capability_unsupported", () => {
  const r = rea_apktool_framework(YOK_APK);
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Framework arg doğrulaması: boş yol ortamdan bağımsız unsupported.
test("framework: boş yol capability_unsupported", () => {
  const r = rea_apktool_framework("");
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Install arg doğrulaması: boş yol adb/cihaz durumundan önce elenir.
test("install: boş yol capability_unsupported", () => {
  const r = rea_adb_install("");
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Install kapısı: dosya yoksa ya da cihaz yoksa capability_unsupported.
test("install: dosya yoksa ya da cihaz yoksa capability_unsupported", () => {
  const r = rea_adb_install(YOK_APK);
  assert.equal(r.ok, false);
  assert.equal(r.code, "capability_unsupported");
});

// Logcat kapısı: cihaz yoksa çalıştırma; cihaz varsa head uygular.
test("logcat: cihaz yoksa capability_unsupported", () => {
  const r = rea_adb_logcat(undefined, 10);
  if (cihazYok()) {
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  } else {
    assert.equal(r.ok, true);
    assert.ok(r.satirlar.length <= 10);
  }
});

// Screencap arg + kapı doğrulaması: boş çıktı yolu unsupported, cihaz yoksa unsupported.
test("screencap: boş çıktı yolu unsupported; cihaz yoksa unsupported", () => {
  const bos = rea_adb_screencap(undefined, "");
  assert.equal(bos.ok, false);
  assert.equal(bos.code, "capability_unsupported");
  if (cihazYok()) {
    const r = rea_adb_screencap(undefined, join(tmpdir(), "rea-ekran.png"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  }
});
