// macho-derinlik.test.mjs: Dalga K/3 — Mach-O ObjC + IL2CPP imza + Go buildinfo derinliği.
// Koş: npm run build sonrası `node --test tests/macho-derinlik.test.mjs`.
// Fixture'lar geçici dizinde üretilir; tests/corpus'a dosya eklenmez.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rea_macho_objc,
  rea_macho_classdump,
  resolveClassdumpCommand,
} from "../dist/rea-domains/apple/MachoBridge.js";
import {
  rea_il2cpp_dump,
  rea_il2cpp_methods,
} from "../dist/rea-domains/dotnet/ManagedInspector.js";
import {
  rea_go_buildinfo,
  rea_go_goresym,
} from "../dist/rea-domains/wasm-evm/GoPwnBridge.js";

// Mach-O sabitleri (gerçek loader.h değerleri).
const MH_MAGIC_64 = 0xfeedfacf;
const CPU_ARM64 = 0x0100000c;
const MH_EXECUTE = 2;
const LC_SEGMENT_64 = 0x19;
const VM_TEXT = 0x100000000;
const VM_DATA = 0x100001000;

let DIR = "";
let OBJC = "";
let SADE = "";
let BOZUK = "";
let FAT_OBJC = "";
let FAT_KARISIK = "";
let FAT_SADE = "";
let FAT_BOZUK = "";
let FAT_HEPBOZUK = "";
let META29 = "";
let META16 = "";
let META_BOZUK = "";
let GO_BIN = "";
let GO_SADE = "";
let GO_DUZ = "";
const YOK = join(tmpdir(), "rea-machoderin-olmayan-7k2m.bin");

function u64le(b, off, v) { b.writeBigUInt64LE(BigInt(v), off); }

// LC_SEGMENT_64 + section_64 listesi (LE). Bölüm ofsetleri çağrıcı tarafından verilir.
function segKomut(segAd, vmaddr, fileoff, filesize, bolumler, prot) {
  const b = Buffer.alloc(72 + 80 * bolumler.length, 0);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  dv.setUint32(0, LC_SEGMENT_64, true);
  dv.setUint32(4, b.length, true);
  b.write(segAd, 8, "ascii");
  u64le(b, 24, vmaddr);
  u64le(b, 32, 0x1000);
  u64le(b, 40, fileoff);
  u64le(b, 48, filesize);
  dv.setUint32(56, prot, true);
  dv.setUint32(60, prot, true);
  dv.setUint32(64, bolumler.length, true);
  bolumler.forEach((s, i) => {
    const o = 72 + i * 80;
    b.write(s.sect, o, "ascii");
    b.write(segAd, o + 16, "ascii");
    u64le(b, o + 32, s.addr);
    u64le(b, o + 40, s.size);
    dv.setUint32(o + 48, s.offset, true);
  });
  return b;
}

function baslik(ncmds, sizeofcmds) {
  const h = Buffer.alloc(32, 0);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  dv.setUint32(0, MH_MAGIC_64, true);
  dv.setUint32(4, CPU_ARM64, true);
  dv.setUint32(8, 0, true);
  dv.setUint32(12, MH_EXECUTE, true);
  dv.setUint32(16, ncmds, true);
  dv.setUint32(20, sizeofcmds, true);
  return h;
}

// ObjC'li ince Mach-O: __TEXT(__cstring: 3 ad) + __DATA(__objc_classlist×2, __objc_catlist×1, __objc_data).
// Sınıflar: AppDelegate, SceneDelegate; kategori: NetworkExtras.
function objcKur() {
  const cstr = Buffer.from("AppDelegate\0SceneDelegate\0NetworkExtras\0", "ascii"); // 12+14+15=41
  const N1 = VM_TEXT, N2 = VM_TEXT + 12, N3 = VM_TEXT + 26;
  const D = VM_DATA + 24; // __objc_data vmaddr
  const C1 = D, C2 = D + 40, R1 = D + 80, R2 = D + 112, K1 = D + 144;
  const list = Buffer.alloc(16, 0);
  u64le(list, 0, C1); u64le(list, 8, C2);
  const catl = Buffer.alloc(8, 0);
  u64le(catl, 0, K1);
  const data = Buffer.alloc(192, 0); // 40+40+32+32+48
  u64le(data, 32, R1); // class1.bits
  u64le(data, 72, R2); // class2.bits
  u64le(data, 104, N1); // ro1.name
  u64le(data, 136, N2); // ro2.name
  u64le(data, 144, N3); // category.name
  const H = 32 + 152 + 312; // başlık + TEXT(1 bölümlü) + DATA(3 bölümlü)
  const F1 = H, F2 = H + cstr.length;
  const seg1 = segKomut("__TEXT", VM_TEXT, F1, cstr.length,
    [{ sect: "__cstring", addr: VM_TEXT, size: cstr.length, offset: F1 }], 5);
  const seg2 = segKomut("__DATA", VM_DATA, F2, list.length + catl.length + data.length, [
    { sect: "__objc_classlist", addr: VM_DATA, size: list.length, offset: F2 },
    { sect: "__objc_catlist", addr: VM_DATA + 16, size: catl.length, offset: F2 + 16 },
    { sect: "__objc_data", addr: D, size: data.length, offset: F2 + 24 },
  ], 3);
  return Buffer.concat([baslik(2, seg1.length + seg2.length), seg1, seg2, cstr, list, catl, data]);
}

// ObjC'siz ince Mach-O: tek segmentsiz __TEXT (bölüm yok).
function sadeKur() {
  const seg = segKomut("__TEXT", VM_TEXT, 32 + 72, 0, [], 5);
  return Buffer.concat([baslik(1, seg.length), seg]);
}

// --- Yağlı (fat) sahne kurucular (dalga-4f/macho-il2cpp-derinlik) ---
const CPU_X86_64 = 0x01000007;

// 64-bit ince başlık (cputype parametrik).
function baslikCpu(cputype, cpusubtype, ncmds, sizeofcmds) {
  const h = Buffer.alloc(32, 0);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  dv.setUint32(0, MH_MAGIC_64, true);
  dv.setUint32(4, cputype, true);
  dv.setUint32(8, cpusubtype, true);
  dv.setUint32(12, MH_EXECUTE, true);
  dv.setUint32(16, ncmds, true);
  dv.setUint32(20, sizeofcmds, true);
  return h;
}

// ObjC'li 64-bit dilim: sınıf/kategori adları parametrik (VM adresleri dilim-içi,
// her dilim bağımsız çözülür; düzen objcKur() ile birebir: class 40B, ro 32B, kat 48B).
function objcDilimKur(cputype, cpusubtype, siniflar, kategoriler) {
  const adlar = [...siniflar, ...kategoriler];
  const cstr = Buffer.from(adlar.join("\0") + "\0", "ascii");
  const T = VM_TEXT, VD = VM_DATA + 24; // __objc_data vmaddr
  let p = 0;
  const adVM = adlar.map((a) => { const v = T + p; p += Buffer.byteLength(a, "ascii") + 1; return v; });
  const ns = siniflar.length, nk = kategoriler.length;
  const data = Buffer.alloc(ns * 40 + ns * 32 + nk * 48, 0);
  for (let i = 0; i < ns; i++) {
    u64le(data, i * 40 + 32, VD + ns * 40 + i * 32); // class.bits -> ro VA
    u64le(data, ns * 40 + i * 32 + 24, adVM[i]); // ro.name
  }
  for (let i = 0; i < nk; i++) {
    u64le(data, ns * 40 + ns * 32 + i * 48, adVM[ns + i]); // category.name@0
  }
  const list = Buffer.alloc(ns * 8, 0);
  for (let i = 0; i < ns; i++) u64le(list, i * 8, VD + i * 40);
  const catl = Buffer.alloc(nk * 8, 0);
  for (let i = 0; i < nk; i++) u64le(catl, i * 8, VD + ns * 40 + ns * 32 + i * 48);
  // Segment uzunlukları bölüm sayısından deterministik: ofsetler önden hesaplanır.
  const F1 = 32 + (72 + 80) + (72 + 80 * 3), F2 = F1 + cstr.length;
  const seg1 = segKomut("__TEXT", T, F1, cstr.length,
    [{ sect: "__cstring", addr: T, size: cstr.length, offset: F1 }], 5);
  const seg2 = segKomut("__DATA", VM_DATA, F2, list.length + catl.length + data.length, [
    { sect: "__objc_classlist", addr: VM_DATA, size: list.length, offset: F2 },
    { sect: "__objc_catlist", addr: VM_DATA + ns * 8, size: catl.length, offset: F2 + ns * 8 },
    { sect: "__objc_data", addr: VD, size: data.length, offset: F2 + ns * 8 + nk * 8 },
  ], 3);
  return Buffer.concat([baslikCpu(cputype, cpusubtype, 2, seg1.length + seg2.length), seg1, seg2, cstr, list, catl, data]);
}

// 32-bit ince dilim (yalnız başlık; ObjC çözümü desteklenmez → dürüst atlanır).
function otuzikiDilimKur() {
  const h = Buffer.alloc(28, 0);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  dv.setUint32(0, 0xfeedface, true); // MH_MAGIC (32-bit LE) -> diskte CE FA ED FE
  dv.setUint32(4, 12, true); // CPU arm
  dv.setUint32(8, 0, true);
  dv.setUint32(12, MH_EXECUTE, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 0, true);
  return h;
}

// Yağlı (fat/BE) kur: dilimler [{cputype, cpusubtype, buf}].
function fatKur(dilimler) {
  const kafa = Buffer.alloc(8 + dilimler.length * 20, 0);
  const fdv = new DataView(kafa.buffer, kafa.byteOffset, kafa.byteLength);
  fdv.setUint32(0, 0xcafebabe, false); // diskte CA FE BA BE
  fdv.setUint32(4, dilimler.length, false);
  let off = kafa.length;
  const parcalar = [kafa];
  dilimler.forEach((d, i) => {
    const o = 8 + i * 20;
    fdv.setUint32(o, d.cputype, false);
    fdv.setUint32(o + 4, d.cpusubtype, false);
    fdv.setUint32(o + 8, off, false);
    fdv.setUint32(o + 12, d.buf.length, false);
    fdv.setUint32(o + 16, 12, false);
    off += d.buf.length;
    parcalar.push(d.buf);
  });
  return Buffer.concat(parcalar);
}

// Sahte global-metadata.dat: sürüm + string tablosu + 32B method girdileri (v25-30 düzeni).
function metaKur(surum, girisler) {
  // girisler: [{ad, declaringType, returnType}]
  const dizeler = [];
  const endeks = [];
  let birikim = 0;
  for (const g of girisler) {
    endeks.push(birikim);
    const b = Buffer.from(g.ad + "\0", "utf8");
    dizeler.push(b);
    birikim += b.length;
  }
  const strTab = Buffer.concat(dizeler);
  const SO = 256, MO = SO + strTab.length;
  const buf = Buffer.alloc(MO + girisler.length * 32, 0);
  const w = (o, v) => buf.writeUInt32LE(v, o);
  w(0, 0xfab11baf);
  w(4, surum);
  w(24, SO); w(28, strTab.length);
  w(48, MO); w(52, girisler.length);
  w(160, MO); w(164, 0); w(172, 0); w(180, 0);
  strTab.copy(buf, SO);
  girisler.forEach((g, i) => {
    const o = MO + i * 32;
    buf.writeUInt32LE(endeks[i], o); // nameIndex
    buf.writeInt32LE(g.declaringType, o + 4);
    buf.writeInt32LE(g.returnType, o + 8);
  });
  return buf;
}

before(() => {
  DIR = mkdtempSync(join(tmpdir(), "macho-derinlik-"));
  OBJC = join(DIR, "objc.macho");
  SADE = join(DIR, "sade.macho");
  BOZUK = join(DIR, "bozuk.bin");
  META29 = join(DIR, "global-metadata.dat");
  META16 = join(DIR, "global-metadata-v16.dat");
  META_BOZUK = join(DIR, "bozuk.dat");
  FAT_OBJC = join(DIR, "fat-objc.macho");
  FAT_KARISIK = join(DIR, "fat-karisik.macho");
  FAT_SADE = join(DIR, "fat-sade.macho");
  FAT_BOZUK = join(DIR, "fat-bozuk.macho");
  FAT_HEPBOZUK = join(DIR, "fat-hepbozuk.macho");
  GO_BIN = join(DIR, "go-buildinfo.bin");
  GO_SADE = join(DIR, "go-sade.bin");
  GO_DUZ = join(DIR, "duz.txt");
  writeFileSync(OBJC, objcKur());
  writeFileSync(SADE, sadeKur());
  writeFileSync(BOZUK, Buffer.from("Mach-O degilim, duz metin", "latin1"));
  writeFileSync(META29, metaKur(29, [
    { ad: "OnStart", declaringType: 2, returnType: 7 },
    { ad: "Update", declaringType: 3, returnType: 9 },
  ]));
  writeFileSync(META16, metaKur(16, [{ ad: "Eski", declaringType: 1, returnType: 1 }]));
  writeFileSync(META_BOZUK, Buffer.from("sihirsiz duz yazi", "latin1"));
  // Yağlı sahneler: (1) iki ObjC'li 64-bit dilim (farklı adlar);
  // (2) 64-bit ObjC + 32-bit dilim; (3) ObjC'siz iki dilim;
  // (4) bir sağlam + bir dosya-dışı dilim; (5) tüm dilimler dosya-dışı.
  writeFileSync(FAT_OBJC, fatKur([
    { cputype: CPU_ARM64, cpusubtype: 0, buf: objcDilimKur(CPU_ARM64, 0, ["AppDelegate", "SceneDelegate"], ["NetworkExtras"]) },
    { cputype: CPU_X86_64, cpusubtype: 3, buf: objcDilimKur(CPU_X86_64, 3, ["LoginVC"], ["AnalyticsHelper", "CrashReporter"]) },
  ]));
  writeFileSync(FAT_KARISIK, fatKur([
    { cputype: CPU_ARM64, cpusubtype: 0, buf: objcDilimKur(CPU_ARM64, 0, ["AppDelegate"], []) },
    { cputype: 12, cpusubtype: 0, buf: otuzikiDilimKur() },
  ]));
  writeFileSync(FAT_SADE, fatKur([
    { cputype: CPU_ARM64, cpusubtype: 0, buf: sadeKur() },
    { cputype: CPU_X86_64, cpusubtype: 3, buf: sadeKur() },
  ]));
  {
    const saglam = sadeKur();
    const kafa = Buffer.alloc(8 + 2 * 20, 0);
    const fdv = new DataView(kafa.buffer, kafa.byteOffset, kafa.byteLength);
    fdv.setUint32(0, 0xcafebabe, false);
    fdv.setUint32(4, 2, false);
    fdv.setUint32(8, CPU_ARM64, false); fdv.setUint32(12, 0, false);
    fdv.setUint32(16, kafa.length, false); fdv.setUint32(20, saglam.length, false);
    fdv.setUint32(24, 12, false);
    fdv.setUint32(28, CPU_X86_64, false); fdv.setUint32(32, 3, false);
    fdv.setUint32(36, 0xffffff00, false); fdv.setUint32(40, 100, false); // dosya-dışı
    fdv.setUint32(44, 12, false);
    writeFileSync(FAT_BOZUK, Buffer.concat([kafa, saglam]));
  }
  {
    const kafa = Buffer.alloc(8 + 2 * 20, 0);
    const fdv = new DataView(kafa.buffer, kafa.byteOffset, kafa.byteLength);
    fdv.setUint32(0, 0xcafebabe, false);
    fdv.setUint32(4, 2, false);
    fdv.setUint32(8, CPU_ARM64, false); fdv.setUint32(12, 0, false);
    fdv.setUint32(16, 0xffff0000, false); fdv.setUint32(20, 100, false);
    fdv.setUint32(24, 12, false);
    fdv.setUint32(28, CPU_X86_64, false); fdv.setUint32(32, 3, false);
    fdv.setUint32(36, 0xffffff00, false); fdv.setUint32(40, 100, false);
    fdv.setUint32(44, 12, false);
    writeFileSync(FAT_HEPBOZUK, kafa);
  }
  writeFileSync(GO_BIN, [
    "go1.22.1 runtime.gopclntab runtime.pclnametab",
    "ÿ Go buildinf:",
    "path\tcommand-line-arguments",
    "mod\texample.com/demo\t(devel)\t",
    "dep\tgithub.com/spf13/cobra\tv1.8.0\th1:abc123=",
    "dep\tgolang.org/x/sys\tv0.18.0\th1:xyz789=",
    "",
  ].join("\n"), "latin1");
  writeFileSync(GO_SADE, "go1.21 gopclntab duz metin, buildinfo yok", "latin1");
  writeFileSync(GO_DUZ, "merhaba dunya", "latin1");
  // Araç yok dallarını hermetik kilitle.
  process.env.REA_CLASSDUMP_BIN = join(DIR, "yok-class-dump");
  process.env.REA_IL2CPPDUMPER_BIN = join(DIR, "yok-Il2CppDumper");
  process.env.REA_GORESYM_BIN = join(DIR, "yok-GoReSym");
});

after(() => {
  delete process.env.REA_CLASSDUMP_BIN;
  delete process.env.REA_IL2CPPDUMPER_BIN;
  delete process.env.REA_GORESYM_BIN;
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* en iyi efor */ }
});

describe("macho objc sınıf listesi (saf __objc_classlist okuma)", () => {
  it("(a) 2 sınıf + 1 kategori sahne değerleriyle birebir", () => {
    const r = rea_macho_objc(OBJC);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.siniflar, ["AppDelegate", "SceneDelegate"]);
    assert.equal(r.details.sinifSayisi, 2);
    assert.deepEqual(r.details.kategoriler, ["NetworkExtras"]);
    assert.equal(r.details.kategoriSayisi, 1);
  });
  it("(a2) giriş/çözülemeyen sayıları gerçek", () => {
    const r = rea_macho_objc(OBJC);
    assert.equal(r.ok, true);
    assert.equal(r.details.girisSayisi, 2);
    assert.equal(r.details.cozulemeyen, 0);
  });
});

describe("objc yoksa boş + dürüst işaret", () => {
  it("(b) sınıf yoksa boş liste + yok işareti", () => {
    const r = rea_macho_objc(SADE);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.siniflar, []);
    assert.equal(r.details.sinifSayisi, 0);
    assert.equal(r.details.objc, "yok");
    assert.equal(r.details.sinirli, true);
  });
  it("(b2) bozuk dosya capability_unsupported (throw yok)", () => {
    const r = rea_macho_objc(BOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("(b3) olmayan dosya capability_unsupported", () => {
    const r = rea_macho_objc(YOK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("il2cpp imza okuma (string tablosu + method girdisi)", () => {
  it("(c) 2 imza adı + ham tip endeksleri sahneden okunur", () => {
    const r = rea_il2cpp_methods(META29);
    assert.equal(r.ok, true);
    assert.equal(r.surum, 29);
    assert.equal(r.metodSayisi, 2);
    assert.equal(r.imzaSayisi, 2);
    assert.deepEqual(r.imzalar.map((m) => m.ad), ["OnStart", "Update"]);
    assert.equal(r.imzalar[0].nameIndex, 0);
    assert.equal(r.imzalar[1].nameIndex, 8);
    assert.equal(r.imzalar[0].declaringType, 2);
    assert.equal(r.imzalar[0].returnType, 7);
    assert.equal(r.sinirli, false);
  });
  it("(c2) desteklenmeyen sürümde sayılar var, imza yok (sınırlı)", () => {
    const r = rea_il2cpp_methods(META16);
    assert.equal(r.ok, true);
    assert.equal(r.metodSayisi, 1);
    assert.deepEqual(r.imzalar, []);
    assert.equal(r.imzaSayisi, 0);
    assert.equal(r.sinirli, true);
    assert.match(r.not, /sınırlı/);
  });
  it("(c3) sihirsiz dosya capability_unsupported", () => {
    const r = rea_il2cpp_methods(META_BOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("macho objc yağlı (fat) dilim çözümleme (dalga-4f)", () => {
  it("(f) iki dilimden sınıflar arch kırılımıyla toplanır", () => {
    const r = rea_macho_objc(FAT_OBJC);
    assert.equal(r.ok, true);
    assert.deepEqual([...r.details.siniflar].sort(),
      ["AppDelegate", "LoginVC", "SceneDelegate"].sort());
    assert.equal(r.details.sinifSayisi, 3);
    assert.deepEqual([...r.details.kategoriler].sort(),
      ["AnalyticsHelper", "CrashReporter", "NetworkExtras"].sort());
    assert.equal(r.details.kategoriSayisi, 3);
    assert.equal(r.details.fat, true);
    assert.equal(r.details.dilimler.length, 2);
    const arm = r.details.dilimler.find((d) => d.arch === "arm64");
    assert.deepEqual(arm.siniflar, ["AppDelegate", "SceneDelegate"]);
    assert.deepEqual(arm.kategoriler, ["NetworkExtras"]);
    const x64 = r.details.dilimler.find((d) => d.arch === "x86_64");
    assert.deepEqual(x64.siniflar, ["LoginVC"]);
    assert.deepEqual(x64.kategoriler, ["AnalyticsHelper", "CrashReporter"]);
    assert.deepEqual(r.details.atlananDilimler, []);
  });
  it("(f2) arch seçimi yalnız o dilimi çözer", () => {
    const r = rea_macho_objc(FAT_OBJC, 200, "x86_64");
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.siniflar, ["LoginVC"]);
    assert.deepEqual(r.details.kategoriler, ["AnalyticsHelper", "CrashReporter"]);
    assert.equal(r.details.dilimler.length, 1);
    assert.equal(r.details.dilimler[0].arch, "x86_64");
  });
  it("(f2b) olmayan arch dürüst unsupported (mevcutlar listelenir)", () => {
    const r = rea_macho_objc(FAT_OBJC, 200, "powerpc");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(String(r.reason ?? r.neden ?? ""), /powerpc/);
  });
  it("(f3) 32-bit dilim dürüstçe atlanır, 64-bit çözülür", () => {
    const r = rea_macho_objc(FAT_KARISIK);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.siniflar, ["AppDelegate"]);
    assert.equal(r.details.dilimler.length, 1);
    assert.equal(r.details.atlananDilimler.length, 1);
    assert.equal(r.details.atlananDilimler[0].arch, "arm");
    assert.match(String(r.details.atlananDilimler[0].neden), /32-bit/);
  });
  it("(f4) ObjC'siz fat: objc yok, unsupported değil", () => {
    const r = rea_macho_objc(FAT_SADE);
    assert.equal(r.ok, true);
    assert.equal(r.details.objc, "yok");
    assert.deepEqual(r.details.siniflar, []);
    assert.equal(r.details.dilimler.length, 2);
  });
  it("(f5) kesik dilim atlanır, sağlam dilim işlenir", () => {
    const r = rea_macho_objc(FAT_BOZUK);
    assert.equal(r.ok, true);
    assert.equal(r.details.dilimler.length, 1);
    assert.equal(r.details.atlananDilimler.length, 1);
    assert.match(String(r.details.atlananDilimler[0].neden), /dosya dışında/);
  });
  it("(f6) hiçbir dilim çözülemezse dürüst unsupported (throw yok)", () => {
    const r = rea_macho_objc(FAT_HEPBOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("go buildinfo (build-id + modül bağımlılıkları)", () => {
  it("(d) build-id + 2 bağımlılık sahne değerleriyle birebir", () => {
    const r = rea_go_buildinfo(GO_BIN);
    assert.equal(r.ok, true);
    assert.equal(r.details.buildid, "go1.22.1");
    assert.equal(r.details.modul, "command-line-arguments");
    assert.equal(r.details.anaModul.yol, "example.com/demo");
    assert.equal(r.details.modulSayisi, 2);
    assert.deepEqual(r.details.moduller[0], { yol: "github.com/spf13/cobra", surum: "v1.8.0" });
    assert.deepEqual(r.details.moduller[1], { yol: "golang.org/x/sys", surum: "v0.18.0" });
    assert.equal(r.details.sinirli, false);
  });
  it("(d2) buildinfo yoksa sürüm var, liste boş (sınırlı)", () => {
    const r = rea_go_buildinfo(GO_SADE);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.moduller, []);
    assert.equal(r.details.modulSayisi, 0);
    assert.equal(r.details.sinirli, true);
  });
  it("(d3) go sinyalsiz dosya capability_unsupported", () => {
    const r = rea_go_buildinfo(GO_DUZ);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("araç yoksa 3 dürüst dal", () => {
  it("(e1) class-dump yok: unsupported + kurulum ipucu", () => {
    assert.equal(resolveClassdumpCommand(), null);
    const r = rea_macho_classdump(OBJC);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    const ipucu = String(r.reason ?? r.neden ?? "");
    assert.match(ipucu, /class-dump/i);
    assert.match(ipucu, /REA_CLASSDUMP_BIN/);
  });
  it("(e2) Il2CppDumper yok: unsupported + kurulum ipucu", () => {
    const r = rea_il2cpp_dump(META29, join(DIR, "GameAssembly.dll"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.neden, /Il2CppDumper/);
    assert.match(r.neden, /github\.com\/Perfare\/Il2CppDumper/);
  });
  it("(e3) GoReSym yok: unsupported + kurulum ipucu", () => {
    const r = rea_go_goresym(GO_BIN);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.reason, /GoReSym/);
    assert.match(r.reason, /github\.com\/mandiant\/GoReSym/);
  });
});
