// confidence.test.mjs: güven tablosu + en-iyi-motor seçimi (tamamen offline).
// Koş: node tests/confidence.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreTarget, bestMotor } from "../dist/facade/confidence.js";

describe("scoreTarget", () => {
  // Tablo değerleri sabit kalmalı: apk eşleşmeleri.
  it("apk+jadx 95, apk+apktool 70 verir", () => {
    assert.equal(scoreTarget("apk", "jadx"), 95);
    assert.equal(scoreTarget("apk", "apktool"), 70);
  });

  // Tablo değerleri sabit kalmalı: elf eşleşmeleri.
  it("elf+radare2 90, elf+ghidra 85 verir", () => {
    assert.equal(scoreTarget("elf", "radare2"), 90);
    assert.equal(scoreTarget("elf", "ghidra"), 85);
  });

  // Kesin eşleşme tam puan almalı.
  it("evm+keccak 100 verir", () => {
    assert.equal(scoreTarget("evm", "keccak"), 100);
  });

  // Alan motorları tablo değerlerini korumalı.
  it("wasm, firmware, browser skorlarını verir", () => {
    assert.equal(scoreTarget("wasm", "wabt"), 90);
    assert.equal(scoreTarget("firmware", "binwalk"), 80);
    assert.equal(scoreTarget("browser", "playwright"), 85);
  });

  // Bilinmeyen tür motordan bağımsız en düşük skordur.
  it("bilinmiyor her zaman 10 verir", () => {
    assert.equal(scoreTarget("bilinmiyor", "radare2"), 10);
    assert.equal(scoreTarget("bilinmiyor", "jadx"), 10);
  });

  // Tabloda olmayan eşleşme düşük güvene düşer.
  it("tabloda yoksa 20 verir", () => {
    assert.equal(scoreTarget("elf", "jadx"), 20);
  });
});

describe("bestMotor", () => {
  // Skor sıralaması en yüksek güveni başa taşımalı.
  it("en yüksek skorluyu seçer", () => {
    assert.equal(bestMotor("apk", ["apktool", "jadx"]), "jadx");
  });

  // Sıra girdiden bağımsız: düşük önce verilse de sonuç aynı.
  it("elf adaylarında radare2 kazanır", () => {
    assert.equal(bestMotor("elf", ["ghidra", "radare2"]), "radare2");
  });

  // Boş aday listesi boş döner, düşmez.
  it("boş listede boş döner", () => {
    assert.equal(bestMotor("elf", []), "");
  });
});
