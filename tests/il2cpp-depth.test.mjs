// il2cpp-depth.test.mjs: Unity IL2CPP + Go + Flutter/Dart AOT derinliği (Dalga G/2).
// Koş: npm run build sonrası `node --test tests/il2cpp-depth.test.mjs`.
// Fixture'lar geçici dizinde; tests/corpus'a dosya eklenmez.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_il2cpp_metadata, rea_il2cpp_dump } from "../dist/rea-domains/dotnet/ManagedInspector.js";
import { rea_go_funclines, rea_go_goresym } from "../dist/rea-domains/wasm-evm/GoPwnBridge.js";
import { rea_flutter_snapshot, rea_flutter_blutter } from "../dist/rea-domains/flutter/Flutter.js";

// Geçici sahne: IL2CPP metadata + Go ikili-metni + Flutter ELF + bozuk/kısa dosyalar.
let DIR = "";
let META = "";
let META_BOZUK = "";
let GO_BIN = "";
let GO_DUZ = "";
let FLUTTER_SO = "";
let FLUTTER_BOZUK = "";
const YOK = join(tmpdir(), "rea-il2cpp-olmayan-12345.bin");

function u32le(buf, off, val) { buf.writeUInt32LE(val, off); }

// Sahte global-metadata.dat: sihir + sürüm + gerçek ofsetlerde sayı alanları.
function metadataSahne(sinif, metod) {
  const buf = Buffer.alloc(256, 0);
  u32le(buf, 0, 0xfab11baf); // sanity sihri
  u32le(buf, 4, 29); // sürüm
  u32le(buf, 48, 64); u32le(buf, 52, metod); // methods ofset/sayı
  u32le(buf, 160, 128); u32le(buf, 164, sinif); // typeDefinitions ofset/sayı
  u32le(buf, 168, 200); u32le(buf, 172, 1); // images
  u32le(buf, 176, 208); u32le(buf, 180, 1); // assemblies
  return buf;
}

before(() => {
  DIR = mkdtempSync(join(tmpdir(), "il2cpp-depth-"));
  META = join(DIR, "global-metadata.dat");
  META_BOZUK = join(DIR, "bozuk.dat");
  GO_BIN = join(DIR, "sahte-go.bin");
  GO_DUZ = join(DIR, "duz.txt");
  FLUTTER_SO = join(DIR, "libapp.so");
  FLUTTER_BOZUK = join(DIR, "bozuk.so");
  writeFileSync(META, metadataSahne(3, 7));
  writeFileSync(META_BOZUK, Buffer.from("sadece duz yazi, sihir yok", "latin1"));
  // Sahte Go: buildid + pclntab + func adları + dosya:satır izleri.
  writeFileSync(GO_BIN, [
    "Go buildinf: go1.22.1",
    "runtime.gopclntab runtime.pclnametab",
    "main.main.func1 main/a.go:10",
    "main.main.func2 main/b.go:20",
    "runtime.morestack.func3 runtime/proc.go:100",
    "",
  ].join("\n"), "latin1");
  writeFileSync(GO_DUZ, "merhaba dunya", "latin1");
  // Sahte Flutter ELF: snapshot magic dörtlüsü + Dart sürümü + engine rev.
  const bas = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const govde = Buffer.from(
    "kDartVmSnapshotData kDartVmSnapshotInstructions kDartIsolateSnapshotData kDartIsolateSnapshotInstructions Dart VM version: 3.4.0 flutter/abc1234def libapp.so",
    "latin1",
  );
  writeFileSync(FLUTTER_SO, Buffer.concat([bas, Buffer.alloc(64, 0), govde]));
  // Bozuk: ELF sihri var ama Dart izi yok.
  writeFileSync(FLUTTER_BOZUK, Buffer.concat([bas, Buffer.alloc(64, 0), Buffer.from("sadece pocketsifir duz yazi", "latin1")]));
  // Araç yok dalını hermetik kilitle: var-yok fark etmez, eksik yol zorlanır.
  process.env.REA_IL2CPPDUMPER_BIN = join(DIR, "yok-Il2CppDumper");
  process.env.REA_GORESYM_BIN = join(DIR, "yok-GoReSym");
  process.env.REA_BLUTTER_BIN = join(DIR, "yok-blutter");
});

after(() => {
  delete process.env.REA_IL2CPPDUMPER_BIN;
  delete process.env.REA_GORESYM_BIN;
  delete process.env.REA_BLUTTER_BIN;
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* temizlik en iyi efor */ }
});

describe("rea_il2cpp_metadata (global-metadata.dat saf okuma)", () => {
  // (a) Sahnedeki gerçek sayılar başlıktan okunur: sınıf=3, metod=7.
  it("sınıf/metod sayımını başlıktan çıkarır", () => {
    const r = rea_il2cpp_metadata(META);
    assert.equal(r.ok, true);
    assert.equal(r.surum, 29);
    assert.equal(r.sinifSayisi, 3);
    assert.equal(r.metodSayisi, 7);
    assert.ok(r.ozet.includes("3") && r.ozet.includes("7"));
  });
  it("sihirsiz dosya capability_unsupported verir", () => {
    const r = rea_il2cpp_metadata(META_BOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_il2cpp_metadata(YOK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_go_funclines (pclntab fonksiyon + dosya:satır)", () => {
  // (b) Func adları + dosya:satır listesi + yakınlık eşlemesi sahne değerleriyle birebir.
  it("fonksiyon ve satır eşlemesini çıkarır", () => {
    const r = rea_go_funclines(GO_BIN);
    assert.equal(r.ok, true);
    assert.ok(r.details.fonksiyonlar.includes("main.main.func1"));
    assert.ok(r.details.fonksiyonlar.includes("runtime.morestack.func3"));
    assert.ok(r.details.dosyaSatir.includes("main/a.go:10"));
    assert.ok(r.details.dosyaSatir.includes("runtime/proc.go:100"));
    assert.equal(r.details.esleme.length, 3);
    assert.deepEqual(r.details.esleme[0], { fonksiyon: "main.main.func1", dosya: "main/a.go", satir: 10 });
    assert.deepEqual(r.details.esleme[2], { fonksiyon: "runtime.morestack.func3", dosya: "runtime/proc.go", satir: 100 });
  });
  it("go sinyalsiz dosya capability_unsupported verir", () => {
    const r = rea_go_funclines(GO_DUZ);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_go_funclines(YOK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_flutter_snapshot (Dart magic + izolasyon)", () => {
  // (c) Snapshot magic dörtlüsü + vm+isolate türü + Dart sürümü sahneden okunur.
  it("magic ve izolasyon bilgisini çıkarır", () => {
    const r = rea_flutter_snapshot(FLUTTER_SO);
    assert.equal(r.ok, true);
    assert.equal(r.tur, "vm+isolate");
    assert.ok(r.magic.includes("kDartVmSnapshotData"));
    assert.ok(r.magic.includes("kDartIsolateSnapshotInstructions"));
    assert.equal(r.magic.length, 4);
    assert.deepEqual(r.izolasyon, { vm: true, isolate: true, talimat: true });
    assert.equal(r.dartSurumu, "3.4.0");
  });
  it("Dart izsiz ELF capability_unsupported verir", () => {
    const r = rea_flutter_snapshot(FLUTTER_BOZUK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_flutter_snapshot(YOK);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("araç yoksa dürüst dal (3 araç)", () => {
  // (d) Üç dış araç da kilitli-eksik: sahte derinlik yok, kurulum ipucu var.
  it("Il2CppDumper yok: unsupported + ipucu", () => {
    const r = rea_il2cpp_dump(META, join(DIR, "GameAssembly.dll"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.neden, /Il2CppDumper/);
    assert.match(r.neden, /github\.com\/Perfare\/Il2CppDumper/);
  });
  it("GoReSym yok: unsupported + ipucu", () => {
    const r = rea_go_goresym(GO_BIN);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.reason, /GoReSym/);
    assert.match(r.reason, /github\.com\/mandiant\/GoReSym/);
  });
  it("blutter yok: unsupported + ipucu", () => {
    const r = rea_flutter_blutter(FLUTTER_SO);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(r.reason, /blutter/i);
    assert.match(r.reason, /github\.com\/worawit\/blutter/);
  });
});
