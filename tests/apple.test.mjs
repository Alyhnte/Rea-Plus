// apple.test.mjs: Mach-O/bundle/plist testi (node:test, geçici fixture).
// Koş: npm run build sonrası `node tests/apple.test.mjs`.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_apple_macho, rea_apple_bundle, rea_apple_plist } from "../dist/rea-domains/apple/Apple.js";
// Geçici kök: sahte Mach-O, sahte Info.plist, sahte .app anatomisi.
let DIR = "";
let MACHO = "";
let PLIST = "";
let BUNDLE = "";
let BOZUK_BIN = "";
let BOZUK_PLIST = "";
const YOK = "C:\\yok\\olmayan-macho";
before(() => {
  DIR = mkdtempSync(join(tmpdir(), "apple-"));
  MACHO = join(DIR, "a.out");
  PLIST = join(DIR, "Info.plist");
  BOZUK_BIN = join(DIR, "bozuk.bin");
  BOZUK_PLIST = join(DIR, "bozuk.plist");
  BUNDLE = join(DIR, "Ornek.app");
  // Sahte 64-bit LE Mach-O + dyld yolu.
  writeFileSync(MACHO, Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.alloc(28, 0), Buffer.from("/usr/lib/libSystem.dylib LC_LOAD_DYLIB", "latin1")]));
  // Sihirsiz bozuk binary.
  writeFileSync(BOZUK_BIN, Buffer.from("MZ degil macho degil duz yazi 1234567890abcdef", "latin1"));
  // Sahte Info.plist: iki kritik anahtar.
  const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.ornek.uygulama</string><key>CFBundleExecutable</key><string>Ornek</string></dict></plist>`;
  writeFileSync(PLIST, xml, "utf8");
  // Anahtarsız bozuk plist (kök var, kritik key yok).
  writeFileSync(BOZUK_PLIST, `<plist version="1.0"><dict><key>BosKey</key><string>x</string></dict></plist>`, "utf8");
  // Bundle anatomisi: Contents/MacOS + Frameworks(1) + Info.plist.
  mkdirSync(join(BUNDLE, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(BUNDLE, "Contents", "Frameworks"), { recursive: true });
  writeFileSync(join(BUNDLE, "Contents", "Info.plist"), xml, "utf8");
  writeFileSync(join(BUNDLE, "Contents", "Frameworks", "libOrnek.dylib"), "x");
});
after(() => { try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temizlik en iyi efor */ } });
describe("apple tarama", () => {
  it("macho: sihir cffaedfe ok", () => {
    const s = rea_apple_macho(MACHO);
    assert.equal(s.ok, true);
    assert.equal(s.details.sihir, "cffaedfe");
  });
  it("macho: dyld listesi libSystem içerir", () => {
    const s = rea_apple_macho(MACHO);
    assert.equal(s.ok, true);
    assert.ok(s.details.dyld.some((d) => String(d).includes("libSystem")));
  });
  it("plist: CFBundleIdentifier parse", () => {
    const s = rea_apple_plist(PLIST);
    assert.equal(s.ok, true);
    assert.equal(s.details.bundleId, "com.ornek.uygulama");
  });
  it("plist: executable parse", () => {
    const s = rea_apple_plist(PLIST);
    assert.equal(s.ok, true);
    assert.equal(s.details.executable, "Ornek");
  });
  it("bundle: macos + frameworks sayımı", () => {
    const s = rea_apple_bundle(BUNDLE);
    assert.equal(s.ok, true);
    assert.equal(s.details.macos, true);
    assert.equal(s.details.frameworks, 1);
  });
  it("kapı: olmayan macho unsupported", () => {
    const s = rea_apple_macho(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: sihirsiz binary unsupported", () => {
    const s = rea_apple_macho(BOZUK_BIN);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: anahtarsız plist unsupported", () => {
    const s = rea_apple_plist(BOZUK_PLIST);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("kapı: olmayan bundle unsupported", () => {
    const s = rea_apple_bundle(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
});
