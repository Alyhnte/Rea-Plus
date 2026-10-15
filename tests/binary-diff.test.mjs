// binary-diff.test.mjs: iki binary sürümü arası fonksiyon seviyesi fark (Dalga G/3).
// Koş: node tests/binary-diff.test.mjs
// Sözleşme: ../dist/rea-domains/diff/BinaryDiff.js ->
//   rea_bindiff_fonksiyonlar(yol) -> { ok, fonksiyonlar:[{kimlik, ad, adres, offset, boyut, hash, imza}] }
//   rea_bindiff_karsilastir(eski, yeni) -> { ok, eklenen, cikarilan, degisen, aynen, ozet, istatistik }
// Fixture'lar geçici dizinde üretilir (tests/corpus'a dosya eklenmez): varyantlı minimal PE/ELF.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_bindiff_fonksiyonlar, rea_bindiff_karsilastir } from "../dist/rea-domains/diff/BinaryDiff.js";

let DIZIN = "";

// Deterministik sözde-rastgele gövde: 0xC3 içermez (0xC3 = fonksiyon sonu ayracı), son bayt 0xC3.
function fonkBayt(tohum, uzunluk) {
  const b = Buffer.alloc(uzunluk);
  let x = (tohum >>> 0) || 1;
  for (let i = 0; i < uzunluk - 1; i++) {
    x ^= (x << 13) >>> 0; x ^= x >>> 17; x ^= (x << 5) >>> 0;
    let v = (x >>> 0) % 255;
    if (v === 0xc3) v = 0xc2;
    b[i] = v;
  }
  b[uzunluk - 1] = 0xc3;
  return b;
}

// Minimal PE32+ x64: MZ + PE + COFF + OPT(240B) + 1 bölüm (.text). Sembol yok -> adresle eşleşme.
function peYaz(dosya, govdeler) {
  const text = Buffer.concat(govdeler);
  const hamBoy = Math.max(512, Math.ceil(text.length / 512) * 512);
  const baslik = Buffer.alloc(0x200, 0);
  baslik[0] = 0x4d; baslik[1] = 0x5a;
  baslik.writeUInt32LE(0x80, 0x3c);
  baslik.writeUInt32LE(0x00004550, 0x80);
  const coff = 0x84;
  baslik.writeUInt16LE(0x8664, coff);
  baslik.writeUInt16LE(1, coff + 2);
  baslik.writeUInt16LE(0xf0, coff + 16);
  const opt = coff + 20;
  baslik.writeUInt16LE(0x20b, opt);
  baslik.writeUInt32LE(0x1000, opt + 16); // entry
  baslik.writeUInt32LE(0x1000, opt + 20); // code base
  baslik.writeBigUInt64LE(0x140000000n, opt + 24);
  baslik.writeUInt32LE(0x1000, opt + 32);
  baslik.writeUInt32LE(0x200, opt + 36);
  const sec = opt + 0xf0;
  baslik.write(".text", sec);
  baslik.writeUInt32LE(text.length, sec + 8);
  baslik.writeUInt32LE(0x1000, sec + 12);
  baslik.writeUInt32LE(hamBoy, sec + 16);
  baslik.writeUInt32LE(0x200, sec + 20);
  baslik.writeUInt32LE(0x60000020, sec + 36);
  const ham = Buffer.alloc(0x200 + hamBoy, 0);
  baslik.copy(ham, 0);
  text.copy(ham, 0x200);
  writeFileSync(dosya, ham);
}

// Minimal ELF64 x86-64: .text + (isteğe bağlı) .symtab/.strtab. adlar=null -> sembolsüz (adresle eşleşme).
function elfYaz(dosya, govdeler, adlar) {
  const text = Buffer.concat(govdeler);
  const TVADDR = 0x401000;
  const sembollu = Array.isArray(adlar);
  const strtab = sembollu
    ? Buffer.concat([Buffer.from([0]), ...adlar.map((a) => Buffer.from(a + "\0"))])
    : Buffer.alloc(0);
  const adOfset = [];
  if (sembollu) {
    let o = 1;
    for (const a of adlar) { adOfset.push(o); o += Buffer.byteLength(a) + 1; }
  }
  const symSayi = sembollu ? govdeler.length + 1 : 0;
  const symtab = Buffer.alloc(symSayi * 24, 0);
  let rel = 0;
  if (sembollu) {
    govdeler.forEach((g, i) => {
      const o = (i + 1) * 24;
      symtab.writeUInt32LE(adOfset[i], o);
      symtab[o + 4] = 0x12; // GLOBAL(1)<<4 | FUNC(2)
      symtab.writeUInt16LE(1, o + 6); // .text
      symtab.writeBigUInt64LE(BigInt(TVADDR + rel), o + 8);
      symtab.writeBigUInt64LE(BigInt(g.length), o + 16);
      rel += g.length;
    });
  }
  const shstr = Buffer.from("\0.text\0.symtab\0.strtab\0.shstrtab\0");
  const O_TEXT = 0, O_SYM = 1, O_STR = 2, O_SHSTR = 3;
  const offText = 64;
  const offSym = offText + text.length;
  const offStr = offSym + symtab.length;
  const offShstr = offStr + strtab.length;
  const shoff = (offShstr + shstr.length + 7) & ~7;
  const shnum = sembollu ? 5 : 3;
  const shstrndx = sembollu ? 4 : 2;
  const toplam = shoff + shnum * 64;
  const im = Buffer.alloc(toplam, 0);
  im[0] = 0x7f; im.write("ELF", 1);
  im[4] = 2; im[5] = 1; im[6] = 1;
  im.writeUInt16LE(2, 16); im.writeUInt16LE(62, 18);
  im.writeUInt32LE(1, 20);
  im.writeBigUInt64LE(BigInt(TVADDR), 24);
  im.writeBigUInt64LE(BigInt(shoff), 40);
  im.writeUInt16LE(64, 52); im.writeUInt16LE(64, 58);
  im.writeUInt16LE(shnum, 60); im.writeUInt16LE(shstrndx, 62);
  text.copy(im, offText); symtab.copy(im, offSym); strtab.copy(im, offStr); shstr.copy(im, offShstr);
  const sh = (i, name, type, flags, addr, off, size, link, info, align, entsize) => {
    const o = shoff + i * 64;
    im.writeUInt32LE(name, o); im.writeUInt32LE(type, o + 4);
    im.writeBigUInt64LE(BigInt(flags), o + 8); im.writeBigUInt64LE(BigInt(addr), o + 16);
    im.writeBigUInt64LE(BigInt(off), o + 24); im.writeBigUInt64LE(BigInt(size), o + 32);
    im.writeUInt32LE(link, o + 40); im.writeUInt32LE(info, o + 44);
    im.writeBigUInt64LE(BigInt(align), o + 48); im.writeBigUInt64LE(BigInt(entsize), o + 56);
  };
  sh(1, O_TEXT, 1, 6, TVADDR, offText, text.length, 0, 0, 16, 0);
  if (sembollu) {
    sh(2, O_SYM, 2, 0, 0, offSym, symtab.length, 3, 1, 8, 24);
    sh(3, O_STR, 3, 0, 0, offStr, strtab.length, 0, 0, 1, 0);
    sh(4, O_SHSTR, 3, 0, 0, offShstr, shstr.length, 0, 0, 1, 0);
  } else {
    sh(2, O_SHSTR, 3, 0, 0, offShstr, shstr.length, 0, 0, 1, 0);
  }
  writeFileSync(dosya, im);
}

const ADLAR = ["func_a", "func_b", "func_c", "func_d"];
const govde = (degistir = -1, ekstra = false, eksik = false) => {
  const gs = [fonkBayt(11, 48), fonkBayt(22, 64), fonkBayt(33, 48), fonkBayt(44, 80)];
  if (degistir >= 0) { const k = Buffer.from(gs[degistir]); k[5] ^= 0xff; gs[degistir] = k; }
  if (ekstra) gs.push(fonkBayt(55, 56));
  if (eksik) gs.pop();
  return gs;
};

let PE_A = "", PE_B_DEGISIK = "", PE_C_YENI = "", PE_D_EKSIK = "";
let ELF_A = "", ELF_B_DEGISIK = "", ELF_C_YENI = "", ELF_D_EKSIK = "";
let ELFSIZ_A = "", ELFSIZ_B = "", DUZ = "", BUYUK_A = "", BUYUK_B = "";

before(() => {
  DIZIN = mkdtempSync(join(tmpdir(), "bindiff-"));
  PE_A = join(DIZIN, "v1.exe"); PE_B_DEGISIK = join(DIZIN, "v2_degisen.exe");
  PE_C_YENI = join(DIZIN, "v2_yeni.exe"); PE_D_EKSIK = join(DIZIN, "v2_eksik.exe");
  peYaz(PE_A, govde()); peYaz(PE_B_DEGISIK, govde(1)); peYaz(PE_C_YENI, govde(-1, true)); peYaz(PE_D_EKSIK, govde(-1, false, true));
  ELF_A = join(DIZIN, "v1.elf"); ELF_B_DEGISIK = join(DIZIN, "v2_degisen.elf");
  ELF_C_YENI = join(DIZIN, "v2_yeni.elf"); ELF_D_EKSIK = join(DIZIN, "v2_eksik.elf");
  elfYaz(ELF_A, govde(), ADLAR);
  elfYaz(ELF_B_DEGISIK, govde(1), ADLAR);
  elfYaz(ELF_C_YENI, govde(-1, true), [...ADLAR, "func_e"]);
  elfYaz(ELF_D_EKSIK, govde(-1, false, true), ADLAR.slice(0, 3));
  ELFSIZ_A = join(DIZIN, "siz1.elf"); ELFSIZ_B = join(DIZIN, "siz2.elf");
  elfYaz(ELFSIZ_A, govde(), null);
  const gb = govde(); const k = Buffer.from(gb[2]); k[7] ^= 0xff; gb[2] = k;
  elfYaz(ELFSIZ_B, gb, null);
  DUZ = join(DIZIN, "duz.bin");
  writeFileSync(DUZ, "ben binary değilim, düz metnim");
  // Büyük dosya: 256 fonk x 32KB = 8MB .text (streaming kanıtı).
  const buyuk = [];
  for (let i = 0; i < 256; i++) buyuk.push(fonkBayt(1000 + i, 32 * 1024));
  BUYUK_A = join(DIZIN, "buyuk1.exe"); BUYUK_B = join(DIZIN, "buyuk2.exe");
  peYaz(BUYUK_A, buyuk);
  const b2 = buyuk.map((b) => Buffer.from(b)); b2[100][1000] ^= 0xff;
  peYaz(BUYUK_B, b2);
});

describe("(a) aynı dosya -> fark yok", () => {
  it("PE kendine karşı temizdir", () => {
    const r = rea_bindiff_karsilastir(PE_A, PE_A);
    assert.equal(r.ok, true);
    assert.deepEqual([r.eklenen.length, r.cikarilan.length, r.degisen.length], [0, 0, 0]);
    assert.equal(r.aynen.length, 4);
    assert.deepEqual([r.ozet.eklenen, r.ozet.cikarilan, r.ozet.degisen, r.ozet.aynen], [0, 0, 0, 4]);
  });
  it("sembollü ELF kendine karşı temizdir, kimlik adladır", () => {
    const r = rea_bindiff_karsilastir(ELF_A, ELF_A);
    assert.equal(r.ok, true);
    assert.deepEqual([r.eklenen.length, r.cikarilan.length, r.degisen.length], [0, 0, 0]);
    assert.deepEqual([...r.aynen].sort(), [...ADLAR].sort());
  });
});

describe("(b) 1 fonksiyon değişik -> değişen listelenir", () => {
  it("PE'de değişen tek fonksiyondur, hash farklı boy aynı", () => {
    const r = rea_bindiff_karsilastir(PE_A, PE_B_DEGISIK);
    assert.equal(r.ok, true);
    assert.equal(r.degisen.length, 1);
    assert.deepEqual([r.eklenen.length, r.cikarilan.length], [0, 0]);
    assert.equal(r.aynen.length, 3);
    const d = r.degisen[0];
    assert.notEqual(d.eskiHash, d.yeniHash);
    assert.equal(d.eskiBoyut, d.yeniBoyut);
    assert.equal(d.eskiHash.length, 64);
  });
  it("sembollü ELF'te değişen adla bildirilir (func_b)", () => {
    const r = rea_bindiff_karsilastir(ELF_A, ELF_B_DEGISIK);
    assert.equal(r.ok, true);
    assert.equal(r.degisen.length, 1);
    assert.equal(r.degisen[0].kimlik, "func_b");
  });
});

describe("(c) yeni fonksiyon -> eklenen", () => {
  it("ELF'te func_e eklenen listesindedir", () => {
    const r = rea_bindiff_karsilastir(ELF_A, ELF_C_YENI);
    assert.equal(r.ok, true);
    assert.equal(r.eklenen.length, 1);
    assert.equal(r.eklenen[0].kimlik, "func_e");
    assert.equal(r.degisen.length, 0);
    assert.equal(r.aynen.length, 4);
  });
  it("PE'de eklenen adres kimliğiyle listelenir", () => {
    const r = rea_bindiff_karsilastir(PE_A, PE_C_YENI);
    assert.equal(r.ok, true);
    assert.equal(r.eklenen.length, 1);
    assert.match(r.eklenen[0].kimlik, /^sub_0x[0-9a-f]+$/);
  });
});

describe("(d) silinen fonksiyon -> çıkarılan", () => {
  it("ELF'te func_d çıkarılan listesindedir", () => {
    const r = rea_bindiff_karsilastir(ELF_A, ELF_D_EKSIK);
    assert.equal(r.ok, true);
    assert.equal(r.cikarilan.length, 1);
    assert.equal(r.cikarilan[0].kimlik, "func_d");
    assert.equal(r.aynen.length, 3);
  });
  it("PE'de çıkarılan adres kimliğiyle listelenir", () => {
    const r = rea_bindiff_karsilastir(PE_A, PE_D_EKSIK);
    assert.equal(r.ok, true);
    assert.equal(r.cikarilan.length, 1);
    assert.equal(r.degisen.length, 0);
  });
});

describe("(e) sembolsüzde adresle eşleşme", () => {
  it("symtab'sız ELF'te kimlik sub_0x.. formatındadır", () => {
    const f = rea_bindiff_fonksiyonlar(ELFSIZ_A);
    assert.equal(f.ok, true);
    assert.equal(f.sembollu, false);
    assert.equal(f.sayi, 4);
    for (const g of f.fonksiyonlar) assert.match(g.kimlik, /^sub_0x[0-9a-f]+$/);
  });
  it("symtab'sız ELF'te tek bayt değişimi adres kimliğiyle bulunur", () => {
    const r = rea_bindiff_karsilastir(ELFSIZ_A, ELFSIZ_B);
    assert.equal(r.ok, true);
    assert.equal(r.degisen.length, 1);
    assert.match(r.degisen[0].kimlik, /^sub_0x[0-9a-f]+$/);
    assert.equal(r.aynen.length, 3);
  });
  it("PE fonksiyon listesi 4 adres kimliği verir", () => {
    const f = rea_bindiff_fonksiyonlar(PE_A);
    assert.equal(f.ok, true);
    assert.equal(f.bicim, "pe");
    assert.equal(f.sayi, 4);
    assert.equal(f.fonksiyonlar[0].hash.length, 64);
  });
});

describe("sahte diff yok: geçersiz girdi kapısı", () => {
  it("düz metin capability_unsupported verir, liste uydurmaz", () => {
    const f = rea_bindiff_fonksiyonlar(DUZ);
    assert.equal(f.ok, false);
    assert.equal(f.code, "capability_unsupported");
    const r = rea_bindiff_karsilastir(DUZ, PE_A);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_bindiff_karsilastir(join(DIZIN, "yok.exe"), PE_A);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("(f) büyük dosyada streaming", () => {
  it("8MB .text: tek değişen bulunur, bellek tavanı sabittir", () => {
    const heapOnce = process.memoryUsage().heapUsed;
    const t0 = Date.now();
    const r = rea_bindiff_karsilastir(BUYUK_A, BUYUK_B);
    const sureMs = Date.now() - t0;
    const heapSonra = process.memoryUsage().heapUsed;
    assert.equal(r.ok, true);
    assert.equal(r.degisen.length, 1);
    assert.equal(r.aynen.length, 255);
    // Bellek tavanı kanıtı: okuma penceresi 64KB'ı aşmaz (dosyanın tamamı belleğe alınmaz).
    assert.ok(r.istatistik.azamiBellekBayt <= 64 * 1024, `azami ${r.istatistik.azamiBellekBayt}`);
    assert.ok(r.istatistik.okunanBayt >= 2 * 8 * 1024 * 1024, `okunan ${r.istatistik.okunanBayt}`);
    console.log(`    [kanıt] sure=${sureMs}ms okunan=${r.istatistik.okunanBayt}B tavan=${r.istatistik.azamiBellekBayt}B heapDelta=${heapSonra - heapOnce}B`);
  });
});
