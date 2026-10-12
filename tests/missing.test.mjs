// missingReason testi (node:test). Çalıştırma: node --test tests/missing.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { INSTALL_CMDS, missingReason } from "../dist/facade/missingReasons.js";
// win32 kolu winget komutu vermeli (jadx -> Skylot.jadx).
test("win32 jadx komutu winget Skylot.jadx içerir", () => {
  const sonuc = missingReason("jadx", "win32");
  assert.equal(sonuc.eksik, "jadx");
  assert.match(sonuc.kur, /winget/i);
  assert.match(sonuc.kur, /Skylot\.jadx/);
});
// linux kolu apt komutu vermeli (adb örneği).
test("linux adb komutu apt içerir", () => {
  const sonuc = missingReason("adb", "linux");
  assert.match(sonuc.kur, /apt/i);
  assert.match(sonuc.kur, /adb/);
});
// darwin kolu brew komutu vermeli (dot -> graphviz).
test("darwin dot komutu brew içerir", () => {
  const sonuc = missingReason("dot", "darwin");
  assert.match(sonuc.kur, /brew/i);
  assert.match(INSTALL_CMDS["dot"]?.darwin ?? "", /brew/i);
});
// Alternatif alanı FALLBACKS ile tutarlı olmalı (jadx -> apktool).
test("jadx alternatifi apktool ve neden url içerir", () => {
  const sonuc = missingReason("jadx", "linux");
  assert.equal(sonuc.alternatif, "apktool");
  assert.match(sonuc.neden, /https:\/\//);
  assert.match(missingReason("r2", "linux").neden, /radare2\/releases/);
});
// Bilinmeyen araç ve platform güvenli varsayılanla döner.
test("bilinmeyen araç boş kur ile döner", () => {
  const sonuc = missingReason("yokboylebirarac", "linux");
  assert.equal(sonuc.kur, "");
  assert.match(sonuc.neden, /bilinmeyen/);
  const serbest = missingReason("dot", "freebsd");
  assert.match(serbest.kur, /apt/i);
});
