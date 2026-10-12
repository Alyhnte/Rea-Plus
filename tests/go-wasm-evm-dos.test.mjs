// go-wasm-evm-dos.test.mjs: Go/WASM/EVM/DOS derinleştirme testleri (offline).
// Koş: node --test tests/go-wasm-evm-dos.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_go_pclntab, rea_go_vendor } from "../dist/rea-domains/wasm-evm/GoPwnBridge.js";
import { rea_wasm_sections, rea_wasm_imports } from "../dist/rea-domains/wasm-evm/WasmInfo.js";
import { rea_evm_stats, rea_evm_selectors } from "../dist/rea-domains/wasm-evm/EvmInfo.js";
import { rea_dos_com, rea_dos_psp } from "../dist/rea-domains/dos/DosCom.js";

// Geçici dosya yardımcısı: metin ya da bayt yazar.
function gecici(ad, icerik) {
  const d = mkdtempSync(join(tmpdir(), "gwemos-"));
  const yol = join(d, ad);
  writeFileSync(yol, typeof icerik === "string" ? icerik : Buffer.from(icerik));
  return yol;
}
// Hex -> base64 (WASM/PSP fikstürleri için).
const b64 = (hex) => Buffer.from(hex, "hex").toString("base64");
// Sahte Go metni: buildid + tablo izleri + func sembolleri.
const SAHTE_GO = "Go buildinf: go1.22.1\nruntime.gopclntab\nruntime.pclnametab\nmain.main.func1\nmain.a.go:10\nmain.b.go:20\n";
// Sahte vendor metni: üç benzersiz modül yolu.
const SAHTE_VENDOR = "yukle vendor/github.com/spf13/cobra\nbag github.com/foo/bar\ndiger golang.org/x/sys\n";
// En küçük geçerli WASM modülü (sihir+versiyon, sectionsuz).
const MINIMAL = b64("0061736d01000000");
// Tek exportlu modül: export "a" (func 0).
const TEK_EXPORT = b64("0061736d0100000007050101610000");
// Tek importlu modül: env.f (func 0).
const TEK_IMPORT = b64("0061736d0100000002090103656e7601660000");

describe("rea_go_pclntab", () => {
  // Sahte Go metni buildid + tablo bayrakları + tahmin döndürmeli.
  it("sahte metinden buildid ve tahmin çıkarır", () => {
    const r = rea_go_pclntab(gecici("sahte.bin", SAHTE_GO));
    assert.equal(r.ok, true);
    assert.equal(r.details.buildid, "go1.22.1");
    assert.equal(r.details.pclntab, true);
    assert.equal(r.details.pclnametab, true);
    assert.ok(r.details.tahminiFonksiyon >= 1);
  });
  // İzsiz metin Go değildir: kapı kodu sabittir.
  it("izsiz dosya capability_unsupported verir", () => {
    const r = rea_go_pclntab(gecici("duz.txt", "merhaba dunya"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // Olmayan yol erken kapıdan döner.
  it("olmayan yol capability_unsupported verir", () => {
    const r = rea_go_pclntab("yok/boyle.bin");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_go_vendor", () => {
  // Üç benzersiz yol tekille listelenmeli.
  it("vendor/modül yollarını listeler", () => {
    const r = rea_go_vendor(gecici("vendor.bin", SAHTE_VENDOR));
    assert.equal(r.ok, true);
    assert.equal(r.details.sayi, 3);
    assert.ok(r.details.yollar.includes("vendor/github.com/spf13/cobra"));
  });
  // Yolsuz metin kapıdan döner.
  it("yolsuz dosya capability_unsupported verir", () => {
    const r = rea_go_vendor(gecici("bos.txt", "merhaba dunya"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_wasm_sections", () => {
  // Minimal modül: sihir+versiyon doğru, liste boş.
  it("minimal modülü doğrular", () => {
    const r = rea_wasm_sections(MINIMAL);
    assert.equal(r.ok, true);
    assert.equal(r.details.sihir, "0061736d");
    assert.equal(r.details.versiyon, 1);
    assert.deepEqual(r.details.sections, []);
  });
  // Export bölümü id->ad+boyut ve ad+kind vermeli.
  it("export bölümünü çözer", () => {
    const r = rea_wasm_sections(TEK_EXPORT);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.sections, [{ id: 7, ad: "export", boyut: 5 }]);
    assert.deepEqual(r.details.exports, [{ ad: "a", tur: "func" }]);
  });
  // Bozuk sihir kapıdan döner.
  it("bozuk sihir capability_unsupported verir", () => {
    const r = rea_wasm_sections(Buffer.from("not a wasm").toString("base64"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_wasm_imports", () => {
  // Import bölümü modül+ad döndürmeli.
  it("import modül+ad listeler", () => {
    const r = rea_wasm_imports(TEK_IMPORT);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.imports, [{ modul: "env", ad: "f", tur: "func" }]);
  });
  // Importsuz modül kapıdan döner.
  it("importsuz modül capability_unsupported verir", () => {
    const r = rea_wasm_imports(MINIMAL);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_evm_stats", () => {
  // Bilinen vektör: 5 op, 1 push, 1 jump, 3 JUMPDEST.
  it("bilinen hex sayaçları doğru verir", () => {
    const r = rea_evm_stats("0x60015b5b565b");
    assert.equal(r.ok, true);
    assert.equal(r.details.opSayisi, 5);
    assert.equal(r.details.pushSayisi, 1);
    assert.equal(r.details.jumpSayisi, 1);
    assert.equal(r.details.tahminiFonksiyon, 3);
  });
  // Boş hex kapıdan döner.
  it("boş hex capability_unsupported verir", () => {
    const r = rea_evm_stats("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_evm_selectors", () => {
  // İki JUMPDEST bloğu iki PUSH adayını sırayla vermeli.
  it("blok başı PUSH adaylarını listeler", () => {
    const r = rea_evm_selectors("0x5b600a5b63deadbeef");
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.adaylar, ["0x0a", "0xdeadbeef"]);
    assert.equal(r.details.blokSayisi, 2);
  });
  // PUSH içermeyen dizide aday yoktur.
  it("adaysız dizi capability_unsupported verir", () => {
    const r = rea_evm_selectors("0x00");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_dos_com", () => {
  // MZ'siz küçük dosya COM adayıdır.
  it("sahte COM dosyayı tanır", () => {
    const buf = Buffer.alloc(100, 0x90); buf[0] = 0xcd; buf[1] = 0x20;
    const r = rea_dos_com(gecici("prog.com", buf));
    assert.equal(r.ok, true);
    assert.equal(r.details.boyut, 100);
    assert.equal(r.details.com, true);
  });
  // MZ başlıklı dosya COM değildir.
  it("MZ dosya capability_unsupported verir", () => {
    const buf = Buffer.alloc(100, 0); buf[0] = 0x4d; buf[1] = 0x5a;
    const r = rea_dos_com(gecici("prog.exe", buf));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_dos_psp", () => {
  // Sahte PSP: INT20 + cmdline "hi" çözülmeli.
  it("psp alanlarını çözer", () => {
    const buf = Buffer.alloc(256, 0); buf[0] = 0xcd; buf[1] = 0x20;
    buf[2] = 0xff; buf[3] = 0x9f; buf[0x80] = 2; buf[0x81] = 0x68; buf[0x82] = 0x69;
    const r = rea_dos_psp(buf.toString("base64"));
    assert.equal(r.ok, true);
    assert.equal(r.details.int20, "cd20");
    assert.equal(r.details.cmdline, "hi");
    assert.equal(r.details.cmdLen, 2);
  });
  // Çok kısa girdi PSP değildir.
  it("kısa girdi capability_unsupported verir", () => {
    const r = rea_dos_psp(Buffer.from([1, 2, 3]).toString("base64"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
