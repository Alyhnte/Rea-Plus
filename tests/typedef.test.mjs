// typedef.test.mjs: PDB yolu + DWARF özet + typedef yayılımı (gerçek mini PE + sahte ELF).
// Koş: node --test tests/typedef.test.mjs
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_pdb_yolu } from "../dist/rea-domains/typedef/PdbReader.js";
import { rea_dwarf_ozet } from "../dist/rea-domains/typedef/DwarfReader.js";
import { rea_typedef_oner } from "../dist/rea-domains/typedef/TypeSpread.js";

// Gerçek fixture: debug dizinsiz mini PE (PDB kaydı yok -> bulunamadı notu).
const PE = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\plugin\\x64dbg\\test\\mini_pe_x64.exe";
let DUZ = "", ELF = "", BOS_ELF = "";

// Sahte ELF64 yaz: .shstrtab + .debug_abbrev + .debug_info (tek CU, iki subprogram).
function sahteElf(bosMu) {
  const shstr = Buffer.from("\0.shstrtab\0.debug_info\0.debug_abbrev\0", "latin1");
  const abb = Buffer.from([0x01, 0x11, 0x01, 0x03, 0x08, 0x00, 0x00, 0x02, 0x2e, 0x00, 0x03, 0x08, 0x00, 0x00, 0x00]);
  const dies = Buffer.concat([Buffer.from([0x01]), Buffer.from("test_cu\0", "latin1"), Buffer.from([0x02]), Buffer.from("main_urun\0", "latin1"), Buffer.from([0x02]), Buffer.from("yardimci_is\0", "latin1"), Buffer.from([0x00])]);
  const govde = Buffer.concat([Buffer.from([0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08]), dies]);
  const ulen = Buffer.alloc(4); ulen.writeUInt32LE(govde.length, 0);
  const info = Buffer.concat([ulen, govde]);
  const shstrOff = 64, abbOff = shstrOff + shstr.length, infoOff = abbOff + abb.length, shoff = infoOff + info.length;
  const n = bosMu ? 2 : 4, top = Buffer.alloc(shoff + n * 64, 0);
  const dv = new DataView(top.buffer, top.byteOffset, top.byteLength);
  const shYaz = (i, ad, off, boy) => { dv.setUint32(shoff + i * 64, ad, true); dv.setUint32(shoff + i * 64 + 4, 1, true); dv.setBigUint64(shoff + i * 64 + 24, BigInt(off), true); dv.setBigUint64(shoff + i * 64 + 32, BigInt(boy), true); };
  top.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00], 0);
  dv.setUint16(16, 2, true); dv.setUint16(18, 0x3e, true); dv.setUint32(20, 1, true);
  dv.setBigUint64(40, BigInt(shoff), true); dv.setUint16(52, 64, true);
  dv.setUint16(58, 64, true); dv.setUint16(60, n, true); dv.setUint16(62, 1, true);
  top.set(shstr.subarray(0, bosMu ? 11 : shstr.length), shstrOff);
  shYaz(1, 1, shstrOff, bosMu ? 11 : shstr.length);
  if (!bosMu) { top.set(abb, abbOff); top.set(info, infoOff); shYaz(2, 11, infoOff, info.length); shYaz(3, 23, abbOff, abb.length); }
  return top;
}

before(() => {
  const d = mkdtempSync(join(tmpdir(), "typedef-"));
  DUZ = join(d, "duz.txt"); writeFileSync(DUZ, "düz metin, PE de ELF de değil");
  ELF = join(d, "sahte.elf"); writeFileSync(ELF, sahteElf(false));
  BOS_ELF = join(d, "bos.elf"); writeFileSync(BOS_ELF, sahteElf(true));
});

describe("rea_pdb_yolu (gerçek mini PE)", () => {
  // Mini PE'de debug dizini yok -> fırlatma değil, bulunamadı notu.
  it("debug dizini yoksa ok:false + neden döner", () => {
    const r = rea_pdb_yolu(PE);
    assert.equal(r.ok, false);
    assert.match(r.neden, /PDB debug kaydı yok/);
  });
  // Düz metin MZ kapısına takılır.
  it("düz metin PE-değil kapısı verir", () => {
    const r = rea_pdb_yolu(DUZ);
    assert.equal(r.ok, false);
    assert.match(r.neden, /PE değil/);
  });
  // Olmayan dosya aynı kapı ailesinden döner.
  it("olmayan dosya ok:false verir", () => {
    const r = rea_pdb_yolu("yok/boyle/bir.exe");
    assert.equal(r.ok, false);
    assert.ok(r.neden.length > 0);
  });
});

describe("rea_dwarf_ozet (sahte DWARF'lı ELF)", () => {
  // Tek CU başlığı sayılmalı.
  it("unitSayisi 1 döner", () => {
    const r = rea_dwarf_ozet(ELF);
    assert.equal(r.ok, true);
    assert.equal(r.unitSayisi, 1);
  });
  // İki DW_TAG_subprogram sayılmalı.
  it("subprogramSayisi 2 döner", () => {
    const r = rea_dwarf_ozet(ELF);
    assert.equal(r.ok, true);
    assert.equal(r.subprogramSayisi, 2);
  });
  // Ad strlen taraması iki adı da yakalamalı.
  it("fonksiyon adlarını listeler", () => {
    const r = rea_dwarf_ozet(ELF);
    assert.equal(r.ok, true);
    assert.ok(r.fonksiyonAdlari.includes("main_urun"));
    assert.ok(r.fonksiyonAdlari.includes("yardimci_is"));
  });
  // Debug bölümsüz ELF bölüm kapısına takılır.
  it("bölüm yoksa ok:false + neden verir", () => {
    const r = rea_dwarf_ozet(BOS_ELF);
    assert.equal(r.ok, false);
    assert.match(r.neden, /DWARF bölümü yok/);
  });
  // Düz metin ELF kapısına takılır.
  it("düz metin ELF-değil kapısı verir", () => {
    const r = rea_dwarf_ozet(DUZ);
    assert.equal(r.ok, false);
    assert.match(r.neden, /ELF değil/);
  });
});

describe("rea_typedef_oner (imza + yayılım)", () => {
  // Bilinen API: ilk arg adı tablodan gelmeli.
  it("CreateFileW rcx->lpFileName önerir (imza)", () => {
    const r = rea_typedef_oner({ cagrilar: [{ api: "CreateFileW", args: [{ reg: "rcx" }, { reg: "rdx" }] }] });
    assert.equal(r.ok, true);
    const ilk = r.oneriler.find((o) => o.reg === "rcx");
    assert.equal(ilk.oneri, "lpFileName");
    assert.equal(ilk.kaynak, "imza");
  });
  // İkinci bilinen API tablosu da çalışmalı.
  it("ReadFile rdx->lpBuffer önerir (imza)", () => {
    const r = rea_typedef_oner(JSON.stringify({ cagrilar: [{ api: "ReadFile", args: [{ reg: "rcx" }, { reg: "rdx" }] }] }));
    assert.equal(r.ok, true);
    assert.equal(r.oneriler.find((o) => o.reg === "rdx").oneri, "lpBuffer");
  });
  // Aynı register bilinmeyen çağrıda aynı adı taşımalı.
  it("bilinmeyen API'ye register yayılımı yapar", () => {
    const r = rea_typedef_oner({ cagrilar: [{ api: "CreateFileW", args: [{ reg: "rcx" }] }, { api: "BilinmeyenApi", args: [{ reg: "rcx" }] }] });
    assert.equal(r.ok, true);
    const y = r.oneriler.find((o) => o.api === "BilinmeyenApi");
    assert.equal(y.oneri, "lpFileName");
    assert.equal(y.kaynak, "yayilim");
  });
  // Bozuk JSON girdi kapısı.
  it("bozuk JSON ok:false verir", () => {
    const r = rea_typedef_oner("{bozuk json");
    assert.equal(r.ok, false);
  });
  // Boş çağrı listesi kapısı.
  it("boş liste ok:false verir", () => {
    const r = rea_typedef_oner({ cagrilar: [] });
    assert.equal(r.ok, false);
  });
});
