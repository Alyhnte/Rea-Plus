// wasm-dwarf.test.mjs: Dalga B/3 — WasmInfo LEB128 + DWARF v5 düzeltmeleri (TDD).
// Koş: node tests/wasm-dwarf.test.mjs (kurulum: npm run build sonrası dist üzerinden)
// Kapsam:
//  (a) Çok-bayt LEB import gövdesi doğru boyut + tüm kind'lar doğru çözülür.
//  (b) LEB taşmasında açık hata (ok:false), negatif boyut ASLA dönmez.
//  (c) DWARF v5 + abbrev_offset'li ELF'te gerçek özet (boş değil).
//  (d) Desteklenmeyen DWARF sürümü -> dürüst kısmi/desteklenmiyor (sahte boş özet YOK).
// Not: tests/corpus'a dosya eklenmez; ELF'ler geçici dizine yazılır, WASM base64 bellektedir.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_wasm_sections, rea_wasm_imports } from "../dist/rea-domains/wasm-evm/WasmInfo.js";
import { rea_dwarf_ozet } from "../dist/rea-domains/typedef/DwarfReader.js";

// ---- WASM kurucu yardımcılar (bellek içi) ----
function lebU(n) {
  const o = [];
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; o.push(b); } while (n);
  return Buffer.from(o);
}
function yStr(s) {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([lebU(b.length), b]);
}
function wasmModuluImport(uyeBaytlari) {
  const yuk = Buffer.concat([lebU(uyeBaytlari.length), ...uyeBaytlari]);
  return Buffer.concat([Buffer.from("0061736d01000000", "hex"), Buffer.from([2]), lebU(yuk.length), yuk]).toString("base64");
}
// func: mod, ad, kind=0, tipNo | table: mod, ad, kind=1, elem, flags, min | mem: kind=2, flags, min
const funcUye = (m, a, t = 0) => Buffer.concat([yStr(m), yStr(a), Buffer.from([0]), lebU(t)]);
const tableUye = (m, a) => Buffer.concat([yStr(m), yStr(a), Buffer.from([1, 0x70, 0, 1])]);
const memUye = (m, a) => Buffer.concat([yStr(m), yStr(a), Buffer.from([2, 0, 1])]);

// ---- ELF kurucu yardımcılar (geçici dizin) ----
let D = "";
before(() => { D = mkdtempSync(join(tmpdir(), "wasmdwarf-")); });
function elfYaz(ad, bayt) {
  const yol = join(D, ad);
  writeFileSync(yol, bayt);
  return yol;
}
// shstrtab'ı da bölüm listesine ekleyip son ELF'i üret (bölüm adları shstrtab içinde çözülür).
function elfBitir(adBaytListesi) {
  const isimler = ["", ".shstrtab"].concat(adBaytListesi.map((b) => b.ad));
  const shstr = Buffer.from("\0" + isimler.slice(1).join("\0") + "\0", "latin1");
  const adOff = new Map();
  let p = 1;
  for (const n of isimler.slice(1)) { adOff.set(n, p); p += Buffer.byteLength(n, "latin1") + 1; }
  const tüm = [{ ad: ".shstrtab", bayt: shstr }].concat(adBaytListesi);
  const shstrOff = 64;
  let off = shstrOff + shstr.length;
  const yer = tüm.map((b) => { const o = off; off += b.bayt.length; return { ...b, off: o }; });
  const shoff = off, n = 1 + tüm.length;
  const top = Buffer.alloc(shoff + n * 64, 0);
  const dv = new DataView(top.buffer, top.byteOffset, top.byteLength);
  top.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], 0);
  dv.setUint16(16, 2, true); dv.setUint16(18, 0x3e, true); dv.setUint32(20, 1, true);
  dv.setBigUint64(40, BigInt(shoff), true);
  dv.setUint16(58, 64, true); dv.setUint16(60, n, true);
  dv.setUint16(62, 2, true); // shstrndx: .shstrtab 1. sırada değil 2. sırada
  const shYaz = (i, ad, o2, boy) => {
    dv.setUint32(shoff + i * 64, ad, true);
    dv.setUint32(shoff + i * 64 + 4, 1, true);
    dv.setBigUint64(shoff + i * 64 + 24, BigInt(o2), true);
    dv.setBigUint64(shoff + i * 64 + 32, BigInt(boy), true);
  };
  // shstrndx düzelt: .shstrtab tüm[0] -> bölüm 1
  dv.setUint16(62, 1, true);
  tüm.forEach((b, i) => {
    const y = yer[i];
    top.set(y.bayt, y.off);
    shYaz(i + 1, adOff.get(b.ad), y.off, y.bayt.length);
  });
  return top;
}

// v5 CU: version=5, unit_type=1, addr=8, abbrev_offset=ABBOFF; adlar .debug_str'de (strp).
function v5Elf() {
  const str = Buffer.concat([Buffer.from([0]), Buffer.from("main_v5\0yardimci_v5\0", "latin1")]);
  const OFF_MAIN = 1, OFF_YARD = 1 + Buffer.byteLength("main_v5\0", "latin1");
  const gercekAbb = Buffer.concat([
    Buffer.from([0x01, 0x11, 0x01, 0x03, 0x08, 0x00, 0x00]),
    Buffer.from([0x02, 0x2e, 0x00, 0x03, 0x0e, 0x00, 0x00]),
    Buffer.from([0x00]),
  ]);
  const dolgu = Buffer.from([0x00, 0x00, 0x00]); // 0-ofsetli tabloyu boş gösterir
  const ABBOFF = dolgu.length;
  const abb = Buffer.concat([dolgu, gercekAbb]);
  const strp = (o) => { const b = Buffer.alloc(4); b.writeUInt32LE(o, 0); return b; };
  const die = Buffer.concat([
    Buffer.from([0x01]), Buffer.from("test_cu_v5\0", "latin1"),
    Buffer.from([0x02]), strp(OFF_MAIN),
    Buffer.from([0x02]), strp(OFF_YARD),
    Buffer.from([0x00]),
  ]);
  const govde = Buffer.concat([Buffer.from([0x05, 0x00, 0x01, 0x08]), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(ABBOFF, 0); return b; })(), die]);
  const ulen = Buffer.alloc(4); ulen.writeUInt32LE(govde.length, 0);
  const info = Buffer.concat([ulen, govde]);
  return elfBitir([
    { ad: ".debug_info", bayt: info },
    { ad: ".debug_abbrev", bayt: abb },
    { ad: ".debug_str", bayt: str },
  ]);
}
// Desteklenmeyen sürüm (v6) CU: dürüst kısmi beklenir.
function v6Elf() {
  const abb = Buffer.from([0x01, 0x11, 0x01, 0x03, 0x08, 0x00, 0x00, 0x00]);
  const die = Buffer.concat([Buffer.from([0x01]), Buffer.from("cu_v6\0", "latin1"), Buffer.from([0x00])]);
  const govde = Buffer.concat([Buffer.from([0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08]), die]);
  const ulen = Buffer.alloc(4); ulen.writeUInt32LE(govde.length, 0);
  const info = Buffer.concat([ulen, govde]);
  return elfBitir([
    { ad: ".debug_info", bayt: info },
    { ad: ".debug_abbrev", bayt: abb },
  ]);
}

describe("WasmInfo LEB128 (Dalga B/3)", () => {
  // (a) Çok-bayt LEB section boyutu + table/func/mem import gövdeleri eksiksiz çözülür.
  it("(a) çok-bayt LEB import gövdesi doğru boyut ve doğru importlar", () => {
    const b64 = wasmModuluImport([tableUye("env", "tab"), funcUye("uzun-modul-" + "m".repeat(130), "f", 300), memUye("env", "mem")]);
    const s = rea_wasm_sections(b64);
    assert.equal(s.ok, true);
    const det = s.details;
    assert.equal(det.sections.length, 1);
    assert.equal(det.sections[0].id, 2);
    const ham = Buffer.from(b64, "base64");
    // section boyut LEB uzunluğunu bayt bayt say (çok-bayt olmalı).
    let lebLen = 0;
    for (let i = 9; i < ham.length; i++) { lebLen++; if (!(ham[i] & 0x80)) break; }
    assert.ok(lebLen > 1, "çok-bayt LEB boyutu tetiklenmeli");
    assert.equal(det.sections[0].boyut, ham.length - 8 - 1 - lebLen);
    const r = rea_wasm_imports(b64);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.imports, [
      { modul: "env", ad: "tab", tur: "table" },
      { modul: "uzun-modul-" + "m".repeat(130), ad: "f", tur: "func" },
      { modul: "env", ad: "mem", tur: "mem" },
    ]);
  });

  // (b) Taşmada açık hata: ok:false, negatif boyut asla dönmez.
  it("(b) taşan LEB boyutta açık hata, negatif boyut yok", () => {
    const hdr = Buffer.from("0061736d01000000", "hex");
    const w = Buffer.concat([hdr, Buffer.from([2]), Buffer.from([0xff, 0xff, 0xff, 0xff, 0x0f]), Buffer.from([0])]);
    const r = rea_wasm_sections(w.toString("base64"));
    assert.equal(r.ok, false, "taşma ok:true dönmemeli");
    assert.ok(r.reason.length > 0, "açık hata nedeni olmalı");
    assert.match(r.reason, /taşma|invalid|parse/i);
    assert.ok(!JSON.stringify(r).includes('"boyut":-'), "negatif boyut taşınmamalı");
  });
});

describe("DwarfReader v5 (Dalga B/3)", () => {
  // (c) v5 + abbrev_offset + strp: gerçek özet, boş değil.
  it("(c) v5 + abbrev_offset'li ELF gerçek özet döner", () => {
    const yol = elfYaz("v5.elf", v5Elf());
    const r = rea_dwarf_ozet(yol);
    assert.equal(r.ok, true);
    assert.equal(r.unitSayisi, 1);
    assert.equal(r.subprogramSayisi, 2);
    assert.ok(r.fonksiyonAdlari.includes("main_v5"), `adlar: ${JSON.stringify(r.fonksiyonAdlari)}`);
    assert.ok(r.fonksiyonAdlari.includes("yardimci_v5"));
  });

  // (d) Desteklenmeyen sürüm: dürüst kısmi/desteklenmiyor, sahte boş özet yok.
  it("(d) desteklenmeyen sürüm dürüst kısmi döner", () => {
    const yol = elfYaz("v6.elf", v6Elf());
    const r = rea_dwarf_ozet(yol);
    assert.equal(r.ok, false, "desteklenmeyen sürüm ok:true (sahte özet) dönmemeli");
    const neden = r.neden ?? r.reason ?? "";
    assert.match(neden, /desteklenmiyor|kısmi|desteklenen/i);
    if ("fonksiyonAdlari" in r) assert.deepEqual(r.fonksiyonAdlari, undefined, "sahte boş liste taşınmamalı");
  });
});
