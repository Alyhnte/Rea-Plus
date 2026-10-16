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
