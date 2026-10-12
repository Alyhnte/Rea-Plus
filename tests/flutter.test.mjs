// flutter.test.mjs: Flutter ELF iz taraması testi (node:test, geçici fixture).
// Koş: npm run build sonrası `node tests/flutter.test.mjs`.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_flutter_scan, rea_flutter_payload } from "../dist/rea-domains/flutter/Flutter.js";
// Geçici dizin + sahte ELF (Dart stringli) ve izsiz bozuk dosya.
let DIR = "";
let LIBAPP = "";
let BOZUK = "";
const YOK = "C:\\yok\\olmayan-flutter.so";
before(() => {
  DIR = mkdtempSync(join(tmpdir(), "flutter-"));
  LIBAPP = join(DIR, "libapp.so");
  BOZUK = join(DIR, "bozuk.so");
  // Sahte ELF: sihir + snapshot sembolleri + engine rev + GNU notu.
  const bas = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const govde = Buffer.from("kDartVmSnapshotData kDartIsolateSnapshotData flutter/abc1234def libflutter.so libapp.so build-id GNU0123456789ABCDEF.dart", "latin1");
  writeFileSync(LIBAPP, Buffer.concat([bas, Buffer.alloc(64, 0), govde]));
  // Bozuk: ELF sihri var ama Dart izi yok.
  writeFileSync(BOZUK, Buffer.concat([bas, Buffer.alloc(64, 0), Buffer.from("sadece pocketsifir duz yazi", "latin1")]));
});
after(() => { try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temizlik en iyi efor */ } });
describe("flutter tarama", () => {
  it("scan: Dart izli ELF ok, dartMi true", () => {
    const s = rea_flutter_scan(LIBAPP);
    assert.equal(s.ok, true);
    assert.equal(s.dartMi, true);
  });
  it("scan: tur libapp.so ayrımı", () => {
    const s = rea_flutter_scan(LIBAPP);
    assert.equal(s.ok, true);
    assert.equal(s.tur, "libapp.so");
  });
  it("scan: buildId hex + motor flutter/ yolu", () => {
    const s = rea_flutter_scan(LIBAPP);
    assert.equal(s.ok, true);
    assert.ok(typeof s.buildId === "string" && s.buildId.length >= 8);
    assert.ok(typeof s.motor === "string" && s.motor.includes("flutter/"));
  });
  it("payload: iz listesi snapshot içerir", () => {
    const s = rea_flutter_payload(LIBAPP);
    assert.equal(s.ok, true);
    assert.ok(s.izler.includes("kDartVmSnapshotData"));
    assert.ok(s.izler.length >= 3);
  });
  it("kapı: olmayan dosya scan unsupported", () => {
    const s = rea_flutter_scan(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: olmayan dosya payload unsupported", () => {
    const s = rea_flutter_payload(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: Dart izsiz ELF scan unsupported", () => {
    const s = rea_flutter_scan(BOZUK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: Dart izsiz ELF payload unsupported", () => {
    const s = rea_flutter_payload(BOZUK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
});
