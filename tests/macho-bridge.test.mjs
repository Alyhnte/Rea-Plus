// macho-bridge.test.mjs: Mach-O saf başlık okuyucu testi (node:test, geçici fixture).
// Koş: npm run build sonrası `node --test tests/macho-bridge.test.mjs`.
// Fixture'lar geçici dizinde üretilir; tests/corpus'a dosya eklenmez.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rea_macho_info,
  rea_macho_loads,
  rea_macho_otool,
  resolveOtoolCommand,
} from "../dist/rea-domains/apple/MachoBridge.js";

// Mach-O sabitleri (gerçek loader.h değerleri).
const MH_MAGIC_64 = 0xfeedfacf;
const CPU_X86_64 = 0x01000007;
const CPU_ARM64 = 0x0100000c;
const MH_EXECUTE = 2;
const LC_SEGMENT_64 = 0x19;
const LC_LOAD_DYLIB = 0x0c;
const FAT_MAGIC = 0xcafebabe;

let DIR = "";
let X64 = "";
let ARM = "";
let FAT = "";
let BOZUK = "";
const YOK = join(tmpdir(), "kesinlikle-olmayan-macho-9f3k2.bin");

// LC_SEGMENT_64 (72 bayt, LE): segname + adres alanları.
function seg64(segAd) {
  const b = Buffer.alloc(72, 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  dv.setUint32(0, LC_SEGMENT_64, true);
  dv.setUint32(4, 72, true);
  b.write(segAd, 8, "ascii");
  return b;
}

// LC_LOAD_DYLIB (LE): 24 bayt başlık + NUL-sonlu yol (8'e hizalı).
function dylib(yol) {
  const yolBuf = Buffer.from(yol + "\0", "ascii");
  const dolgulu = (yolBuf.length + 7) & ~7;
  const boy = 24 + dolgulu;
  const b = Buffer.alloc(boy, 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  dv.setUint32(0, LC_LOAD_DYLIB, true);
  dv.setUint32(4, boy, true);
  dv.setUint32(8, 24, true); // name offset
  dv.setUint32(12, 2, true); // timestamp
  yolBuf.copy(b, 24);
  return b;
}

// İnce 64-bit Mach-O (LE) kur.
function inceKur(cputype, cpusubtype, yukler) {
  const ncmds = yukler.length;
  const sizeofcmds = yukler.reduce((t, y) => t + y.length, 0);
  const h = Buffer.alloc(32, 0);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  dv.setUint32(0, MH_MAGIC_64, true); // diskte CF FA ED FE
  dv.setUint32(4, cputype, true);
  dv.setUint32(8, cpusubtype, true);
  dv.setUint32(12, MH_EXECUTE, true);
  dv.setUint32(16, ncmds, true);
  dv.setUint32(20, sizeofcmds, true);
  return Buffer.concat([h, ...yukler]);
}

before(() => {
  DIR = mkdtempSync(join(tmpdir(), "macho-bridge-"));
  X64 = join(DIR, "x64.macho");
  ARM = join(DIR, "arm64.macho");
  FAT = join(DIR, "fat.macho");
  BOZUK = join(DIR, "bozuk.bin");
  const dy = dylib("/usr/lib/libSystem.B.dylib");
  writeFileSync(X64, inceKur(CPU_X86_64, 3, [seg64("__TEXT"), dy]));
  writeFileSync(ARM, inceKur(CPU_ARM64, 0, [seg64("__TEXT")]));
  // Yağlı (fat/BE): 2 mimari, dilimler gerçek ince başlıklar.
  const dilim1 = inceKur(CPU_X86_64, 3, [seg64("__TEXT")]);
  const dilim2 = inceKur(CPU_ARM64, 0, [seg64("__TEXT")]);
  const kafa = Buffer.alloc(8 + 2 * 20, 0);
  const fdv = new DataView(kafa.buffer, kafa.byteOffset, kafa.byteLength);
  fdv.setUint32(0, FAT_MAGIC, false); // diskte CA FE BA BE
  fdv.setUint32(4, 2, false);
  const off1 = kafa.length;
  fdv.setUint32(8, CPU_X86_64, false);
  fdv.setUint32(12, 3, false);
  fdv.setUint32(16, off1, false);
  fdv.setUint32(20, dilim1.length, false);
  fdv.setUint32(24, 12, false);
  const off2 = off1 + dilim1.length;
  fdv.setUint32(28, CPU_ARM64, false);
  fdv.setUint32(32, 0, false);
  fdv.setUint32(36, off2, false);
  fdv.setUint32(40, dilim2.length, false);
  fdv.setUint32(44, 12, false);
  writeFileSync(FAT, Buffer.concat([kafa, dilim1, dilim2]));
  writeFileSync(BOZUK, Buffer.from("Mach-O degilim, duz metin 1234567890abcdef", "latin1"));
});
after(() => { try { rmSync(DIR, { recursive: true, force: true }); } catch { /* en iyi efor */ } });

// Otool keşfini deterministik "yok" durumuna zorla.
function otoolYokEnv(fn) {
  const once = process.env.REA_OTOOL_BIN;
  process.env.REA_OTOOL_BIN = join(tmpdir(), "kesinlikle-olmayan-otool-9f3k2", "otool");
  try { return fn(); } finally {
    if (once === undefined) delete process.env.REA_OTOOL_BIN;
    else process.env.REA_OTOOL_BIN = once;
  }
}

describe("macho başlık (saf okuma)", () => {
  it("(a) x86_64 header doğru", () => {
    const r = rea_macho_info(X64);
    assert.equal(r.ok, true);
    assert.equal(r.details.cputype, CPU_X86_64);
    assert.equal(r.details.arch, "x86_64");
    assert.equal(r.details.filetype, MH_EXECUTE);
    assert.equal(r.details.is64, true);
    assert.equal(r.details.ncmds, 2);
  });
  it("(b) ARM64 header doğru", () => {
    const r = rea_macho_info(ARM);
    assert.equal(r.ok, true);
    assert.equal(r.details.cputype, CPU_ARM64);
    assert.equal(r.details.arch, "arm64");
    assert.equal(r.details.is64, true);
    assert.equal(r.details.ncmds, 1);
  });
  it("(c) fat binary mimarileri listelenir", () => {
    const r = rea_macho_info(FAT);
    assert.equal(r.ok, true);
    assert.equal(r.details.fat, true);
    assert.equal(r.details.mimariler.length, 2);
    const adlar = r.details.mimariler.map((m) => m.arch).sort();
    assert.deepEqual(adlar, ["arm64", "x86_64"]);
  });
  it("(d) bozuk dosya açık hata (throw yok)", () => {
    const r = rea_macho_info(BOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    const r2 = rea_macho_loads(BOZUK);
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "capability_unsupported");
  });
  it("(d2) olmayan dosya açık hata", () => {
    const r = rea_macho_info(YOK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("macho load komutları", () => {
  it("x86_64 segment + dylib listelenir", () => {
    const r = rea_macho_loads(X64);
    assert.equal(r.ok, true);
    assert.equal(r.details.sayi, 2);
    const turler = r.details.komutlar.map((k) => k.tur);
    assert.ok(turler.includes("segment_64"));
    assert.ok(turler.includes("load_dylib"));
    const seg = r.details.komutlar.find((k) => k.tur === "segment_64");
    assert.equal(seg.segname, "__TEXT");
    const dy = r.details.komutlar.find((k) => k.tur === "load_dylib");
    assert.ok(String(dy.yol).includes("libSystem"));
  });
  it("arm64 tek segment", () => {
    const r = rea_macho_loads(ARM);
    assert.equal(r.ok, true);
    assert.equal(r.details.sayi, 1);
    assert.equal(r.details.komutlar[0].tur, "segment_64");
  });
});

describe("macho otool dürüst dalı", () => {
  it("(e) otool yoksa capability_unsupported + kurulum ipucu", () => {
    otoolYokEnv(() => {
      assert.equal(resolveOtoolCommand(), null);
      const r = rea_macho_otool(X64);
      assert.equal(r.ok, false);
      assert.equal(r.code, "capability_unsupported");
      const ipucu = String(r.reason ?? r.neden ?? "");
      assert.match(ipucu, /otool bulunamad/i);
    });
  });
});
