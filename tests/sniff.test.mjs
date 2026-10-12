// sniff.test.mjs: sihirli bayt tanıma + dosya kapısı (tamamen offline).
// Koş: node tests/sniff.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sniffBytes, sniffFile } from "../dist/facade/sniff.js";

// Onaltılık imzadan bayt dizisi kurar.
const b = (hex) => Buffer.from(hex, "hex");

describe("sniffBytes", () => {
  // ELF sihri radare2 önerisiyle dönmeli.
  it("ELF imzasını tanır", () => {
    assert.deepEqual(sniffBytes(b("7f454c4602010100")), { tip: "elf", motor: "radare2" });
  });

  // ZIP/PK sihri APK sayılıp jadx'e yönlenmeli.
  it("APK/ZIP imzasını tanır", () => {
    assert.deepEqual(sniffBytes(b("504b030414000000")), { tip: "apk", motor: "jadx" });
  });

  // "dex\n" sihri jadx önerisiyle dönmeli.
  it("DEX imzasını tanır", () => {
    assert.deepEqual(sniffBytes(b("6465780a30333500")), { tip: "dex", motor: "jadx" });
  });

  // WASM sihri wasm motoruna yönlenmeli.
  it("WASM imzasını tanır", () => {
    assert.deepEqual(sniffBytes(b("0061736d01000000")), { tip: "wasm", motor: "wasm" });
  });

  // MZ başlığı PE sayılıp x64dbg önerilmeli.
  it("PE imzasını tanır", () => {
    assert.deepEqual(sniffBytes(b("4d5a900003000000")), { tip: "pe", motor: "x64dbg" });
  });

  // Üç Mach-O sihri de hopper önerisiyle dönmeli.
  it("Mach-O imzalarını tanır", () => {
    assert.deepEqual(sniffBytes(b("feedfacf00000000")), { tip: "macho", motor: "hopper" });
    assert.deepEqual(sniffBytes(b("cefaedfe00000000")), { tip: "macho", motor: "hopper" });
    assert.deepEqual(sniffBytes(b("cafebabe00000000")), { tip: "macho", motor: "hopper" });
  });

  // Rastgele bayt bilinmiyor + varsayılan motora düşmeli.
  it("bilinmeyeni varsayılan motorla döner", () => {
    assert.deepEqual(sniffBytes(b("deadbeef01020304")), { tip: "bilinmiyor", motor: "radare2" });
  });
});

describe("sniffFile", () => {
  // Olmayan dosya kapı kodu değil, bilinmiyor sonucudur.
  it("olmayan dosyada bilinmiyor döner", () => {
    assert.deepEqual(sniffFile("yok/boyle/bir/dosya.bin"), { tip: "bilinmiyor", motor: "radare2" });
  });

  // Gerçek dosyanın ilk baytlarından tür çıkarılmalı.
  it("gerçek dosyadan ilk baytları okur", () => {
    const dir = mkdtempSync(join(tmpdir(), "sniff-"));
    try {
      const yol = join(dir, "ornek.elf");
      writeFileSync(yol, b("7f454c4602010100"));
      assert.deepEqual(sniffFile(yol), { tip: "elf", motor: "radare2" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
