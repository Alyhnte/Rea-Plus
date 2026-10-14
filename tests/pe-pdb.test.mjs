// pe-pdb.test.mjs: Dalga B/4 — PE tekilleştirme + PDB indirme (sahte HTTP, ağ yok).
// Koş: önce `npm run build`, sonra `node --test tests/pe-pdb.test.mjs`.
// (a) farklı SizeOfOptionalHeader'lı minimal PE'lerde doğru import adları.
// (b) kopya kod birleşti (ortak baslik okuyucu + davranış aynı).
// (c) sahte HTTP ile PDB indirme + önbellek hit.
// (d) bütünlük tutmazsa açık hata + yeniden indirme.
// (e) ağ yoksa dürüst hata (sahte PDB yazılmaz).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { rea_pe_info, rea_pe_imports, rea_pe_sections, peBaslikOku } from "../dist/rea-domains/winpe/PeReader.js";
import { rea_pdb_yolu, rea_pdb_indir } from "../dist/rea-domains/typedef/PdbReader.js";

const GUID = "ABCDEF01-2345-6789-ABCD-EF0123456789";
const YAS = 1;
const PDB_AD = "ornek_test.pdb";
const SIG = GUID.replace(/-/g, "").toUpperCase() + String(YAS); // symbol-server imzası

let KOK = "";
before(() => { KOK = mkdtempSync(join(tmpdir(), "pe-pdb-")); });

// GUID'i CodeView LE düzeninde yaz (Data1/Data2/Data3 LE, Data4 ham).
function guidYaz(dv, off, guid) {
  const s = guid.replace(/-/g, "");
  dv.setUint32(off, parseInt(s.slice(0, 8), 16), true);
  dv.setUint16(off + 4, parseInt(s.slice(8, 12), 16), true);
  dv.setUint16(off + 6, parseInt(s.slice(12, 16), 16), true);
  for (let i = 0; i < 8; i++) dv.setUint8(off + 8 + i, parseInt(s.slice(16 + i * 2, 18 + i * 2), 16));
}

// Geçici dizinde minimal PE32+ üret: tek .text, kernel32.dll!ExitProcess.
// sizeOpt: gerçek SizeOfOptionalHeader (240 standart, 256 dolgulu varyant).
// debug: true ise CodeView RSDS kaydı ekler (rea_pdb_yolu çözebilsin).
function minimalPe({ sizeOpt = 240, debug = false } = {}) {
  const HAM_BAS = 0x200, HAM_BOY = 0x600;
  const b = Buffer.alloc(HAM_BAS + HAM_BOY, 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  b.write("MZ", 0, "latin1");
  dv.setUint32(0x3c, 64, true); // e_lfanew
  b.write("PE\0\0", 64, "latin1");
  const coff = 68, opt = 88;
  dv.setUint16(coff, 0x8664, true); // x64
  dv.setUint16(coff + 2, 1, true); // tek bölüm
  dv.setUint16(coff + 16, sizeOpt, true); // GERÇEK SizeOfOptionalHeader
  dv.setUint16(opt, 0x20b, true); // PE32+
  dv.setUint32(opt + 16, 0x1000, true); // entry
  dv.setUint32(opt + 108, 16, true); // NumberOfRvaAndSizes
  const rva2off = (rva) => HAM_BAS + (rva - 0x1000);
  const IMP = 0x1000, ILT = 0x1028, IAT = 0x1038, HN = 0x1048, DLL = 0x1060;
  dv.setUint32(opt + 120, IMP, true); // import RVA
  dv.setUint32(opt + 124, 40, true); // import boy
  const d = rva2off(IMP);
  dv.setUint32(d, ILT, true);
  dv.setUint32(d + 12, DLL, true);
  dv.setUint32(d + 16, IAT, true);
  dv.setBigUint64(rva2off(ILT), BigInt(HN), true);
  dv.setBigUint64(rva2off(IAT), BigInt(HN), true);
  dv.setUint16(rva2off(HN), 0, true);
  b.write("ExitProcess\0", rva2off(HN) + 2, "latin1");
  b.write("kernel32.dll\0", rva2off(DLL), "latin1");
  if (debug) {
    const DBG = 0x1080, RSDS = 0x10a0;
    dv.setUint32(opt + 160, DBG, true); // debug RVA
    dv.setUint32(opt + 164, 28, true); // tek kayıt
    const g = rva2off(DBG);
    dv.setUint32(g + 12, 2, true); // CodeView
    dv.setUint32(g + 16, 24 + PDB_AD.length + 1, true);
    dv.setUint32(g + 20, RSDS, true);
    dv.setUint32(g + 24, rva2off(RSDS), true);
    const p = rva2off(RSDS);
    b.write("RSDS", p, "latin1");
    guidYaz(dv, p + 4, GUID);
    dv.setUint32(p + 20, YAS, true);
    b.write(PDB_AD + "\0", p + 24, "latin1");
  }
  const sec = opt + sizeOpt; // bölüm tablosu GERÇEK konumda
  b.write(".text", sec, "latin1");
  dv.setUint32(sec + 8, 0x200, true);
  dv.setUint32(sec + 12, 0x1000, true);
  dv.setUint32(sec + 16, HAM_BOY, true);
  dv.setUint32(sec + 20, HAM_BAS, true);
  return b;
}

function peYaz(ad, { sizeOpt = 240, debug = false } = {}) {
  const yol = join(KOK, ad);
  writeFileSync(yol, minimalPe({ sizeOpt, debug }));
  return yol;
}

// Sahte MSF PDB: gerçek imza + gömülü GUID/YAS (ham arama bütünlüğü için).
function sahtePdb(guid = GUID, yas = YAS, { guidVar = true } = {}) {
  const b = Buffer.alloc(4096, 0);
  b.write("Microsoft C/C++ MSF 7.00\r\n\x1aDS\0\0\0", 0, "latin1");
  if (guidVar) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    guidYaz(dv, 1024, guid);
    dv.setUint32(1040, yas, true);
  }
  return b;
}

// Sahte HTTP: sayacı + URL kaydı ile sarılmış fetch benzeri.
function sahteSunucu(icerik, { durum = 200, patlat = false } = {}) {
  let sayac = 0;
  const urlle = [];
  const fn = async (url) => {
    sayac++;
    urlle.push(url);
    if (patlat) throw new Error("fetch failed: ag yok (sahte)");
    const bayt = typeof icerik === "function" ? icerik(sayac) : icerik;
    const kopya = Buffer.from(bayt);
    return {
      ok: durum === 200, status: durum,
      arrayBuffer: async () => kopya.buffer.slice(kopya.byteOffset, kopya.byteOffset + kopya.byteLength),
    };
  };
  return { fn, sayac: () => sayac, urlle };
}

describe("(a) farklı SizeOfOptionalHeader'da doğru import adları", () => {
  let std = "", dolgulu = "";
  before(() => {
    std = peYaz("std.exe", { sizeOpt: 240 });
    dolgulu = peYaz("dolgulu.exe", { sizeOpt: 256 });
  });
  it("standart (240) PE'de kernel32.dll!ExitProcess çözülür", () => {
    const r = rea_pe_imports(std);
    assert.equal(r.ok, true);
    assert.ok(r.dlls.includes("kernel32.dll"));
    assert.ok(r.fonksiyonlar.includes("kernel32.dll!ExitProcess"));
  });
  it("dolgulu (256) PE'de AYNI adlar çözülür (sabit offset yok)", () => {
    const r = rea_pe_imports(dolgulu);
    assert.equal(r.ok, true);
    assert.ok(r.dlls.includes("kernel32.dll"), "dolgulu PE'de dll bulunamadı");
    assert.ok(r.fonksiyonlar.includes("kernel32.dll!ExitProcess"), "dolgulu PE'de fonksiyon bulunamadı");
  });
  it("her iki varyantta bölüm tablosu aynıdır", () => {
    for (const yol of [std, dolgulu]) {
      const r = rea_pe_sections(yol);
      assert.equal(r.ok, true);
      assert.equal(r.sayi, 1);
      assert.equal(r.bolumler[0].ad, ".text");
      assert.equal(r.bolumler[0].vaddr, 0x1000);
    }
  });
  it("her iki varyantta info tutarlıdır", () => {
    for (const yol of [std, dolgulu]) {
      const r = rea_pe_info(yol);
      assert.equal(r.ok, true);
      assert.equal(r.machine, 0x8664);
      assert.equal(r.bit, "64");
      assert.equal(r.section_sayisi, 1);
    }
  });
});

describe("(b) kopya kod birleşti", () => {
  it("ortak başlık okuyucu PeReader'dan export edilir", () => {
    assert.equal(typeof peBaslikOku, "function");
  });
  it("PdbReader ortak okuyucuyu kullanır (kopya secOff sabiti yok)", () => {
    const kok = dirname(dirname(fileURLToPath(import.meta.url)));
    const pdbJs = readFileSync(join(kok, "dist", "rea-domains", "typedef", "PdbReader.js"), "utf8");
    assert.ok(pdbJs.includes("PeReader.js"), "PdbReader.js PeReader.js'i import etmeli");
    assert.ok(!pdbJs.includes("? 240 : 224"), "PdbReader.js'te sabit 240/224 kalmamalı");
    const peJs = readFileSync(join(kok, "dist", "rea-domains", "winpe", "PeReader.js"), "utf8");
    assert.ok(!peJs.includes("? 240 : 224"), "PeReader.js'te sabit 240/224 kalmamalı");
    assert.ok(peJs.includes("SizeOfOptionalHeader"), "gerçek başlık boyu okunmalı");
  });
  it("rea_pdb_yolu debug'lı minimal PE'de guid+yaş çözer", () => {
    const yol = peYaz("pdbli.exe", { debug: true });
    const r = rea_pdb_yolu(yol);
    assert.equal(r.ok, true);
    assert.equal(r.pdb, PDB_AD);
    assert.equal(r.guid, GUID);
    assert.equal(r.yas, YAS);
  });
});

describe("(c) sahte HTTP ile PDB indirme + önbellek", () => {
  it("indirir, symbol-server URL'i doğrudur, ikinci çağrı önbellekten gelir", async () => {
    const pe = peYaz("indir_c.exe", { debug: true });
    const cache = join(KOK, "cache-c");
    const srv = sahteSunucu(sahtePdb());
    const ilk = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(ilk.ok, true);
    assert.equal(srv.sayac(), 1);
    assert.match(srv.urlle[0], new RegExp(`${PDB_AD}/${SIG}/${PDB_AD}$`));
    assert.ok(existsSync(ilk.yol), "indirilen dosya yazılmalı");
    assert.equal(basename(ilk.yol), PDB_AD);
    assert.equal(ilk.cache, false);
    const ikinci = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(ikinci.ok, true);
    assert.equal(ikinci.cache, true);
    assert.equal(ikinci.yol, ilk.yol);
    assert.equal(srv.sayac(), 1, "önbellek hit: ağa gidilmemeli");
  });
});

describe("(d) bütünlük tutmazsa açık hata + yeniden indirme", () => {
  it("bozuk içerik butunluk_hatasi verir, sahte dosya yazılmaz", async () => {
    const pe = peYaz("indir_d1.exe", { debug: true });
    const cache = join(KOK, "cache-d1");
    const srv = sahteSunucu(sahtePdb(GUID, YAS, { guidVar: false }));
    const r = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(r.ok, false);
    assert.equal(r.code, "butunluk_hatasi");
    assert.ok(r.neden.length > 0);
    assert.equal(existsSync(join(cache, PDB_AD, SIG, PDB_AD)), false);
  });
  it("bozuk önbellek varsa yeniden indirir", async () => {
    const pe = peYaz("indir_d2.exe", { debug: true });
    const cache = join(KOK, "cache-d2");
    const hedef = join(cache, PDB_AD, SIG, PDB_AD);
    const srvBozuk = sahteSunucu(sahtePdb(GUID, YAS, { guidVar: false }));
    const ilk = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srvBozuk.fn });
    assert.equal(ilk.ok, false);
    // Bozuk dosyayı elle önbelleğe koy (dış bozulma simülasyonu).
    const { mkdirSync } = await import("node:fs");
    mkdirSync(join(cache, PDB_AD, SIG), { recursive: true });
    writeFileSync(hedef, sahtePdb(GUID, 999, { guidVar: false }));
    const srvIyi = sahteSunucu(sahtePdb());
    const r = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srvIyi.fn });
    assert.equal(r.ok, true);
    assert.equal(r.cache, false, "bozuk önbellek yeniden indirilmeli");
    assert.equal(srvIyi.sayac(), 1);
  });
  it("ilk yanıt bozuksa bir kez yeniden dener", async () => {
    const pe = peYaz("indir_d3.exe", { debug: true });
    const cache = join(KOK, "cache-d3");
    const srv = sahteSunucu((n) => (n === 1 ? sahtePdb(GUID, YAS, { guidVar: false }) : sahtePdb()));
    const r = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(r.ok, true);
    assert.equal(srv.sayac(), 2);
  });
});

describe("(e) ağ yoksa dürüst hata", () => {
  it("fetch patlarsa ag_hatasi verir, dosya yazılmaz", async () => {
    const pe = peYaz("indir_e.exe", { debug: true });
    const cache = join(KOK, "cache-e");
    const srv = sahteSunucu(Buffer.alloc(0), { patlat: true });
    const r = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(r.ok, false);
    assert.equal(r.code, "ag_hatasi");
    assert.ok(r.neden.length > 0);
    assert.equal(existsSync(join(cache, PDB_AD, SIG, PDB_AD)), false, "sahte PDB yazılmamalı");
  });
  it("HTTP 404 ag_hatasi verir", async () => {
    const pe = peYaz("indir_e404.exe", { debug: true });
    const cache = join(KOK, "cache-e404");
    const srv = sahteSunucu(Buffer.alloc(0), { durum: 404 });
    const r = await rea_pdb_indir(pe, { cacheDir: cache, fetchFn: srv.fn });
    assert.equal(r.ok, false);
    assert.equal(r.code, "ag_hatasi");
  });
});
