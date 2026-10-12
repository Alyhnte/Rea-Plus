// cli2.test.mjs: yeni CLI altılısı duman testi (node:test, gerçek + kapı).
// Koş: npm run build sonrası `node --test tests/cli2.test.mjs` (düz `node` da olur).
// Kapsar: analyze-pe (GERÇEK mini_pe), analyze-go (sahte metin), flutter kapısı,
// doctor --json, bilinmeyen komut; artı apple/hap/wasm2 ek kapıları.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// CLI girişi: derlenmiş index.js (tsc emit sonrası var olmalı).
const cli = join(kok, "dist", "cli", "index.js");
// GERÇEK fixture: conduit mini PE (x64, kernel32!ExitProcess).
const GERCek_PE = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\plugin\\x64dbg\\test\\mini_pe_x64.exe";
// Sahte Go metni: buildid + pclntab izleri + func sembolleri.
const SAHTE_GO = "Go buildinf: go1.22.1\nruntime.gopclntab\nruntime.pclnametab\nmain.main.func1\nmain.a.go:10\nmain.b.go:20\n";
// Geçici dosya yolları: test başında doldurulur.
let DIR = "";
let GO = "";
let DUZ = "";
let LIBAPP = "";
let MACHO = "";
let MINIMAL_WASM = "";

// CLI'yi çalıştır, stdout + exit kodunu birlikte döndür.
function kos(args) {
  try {
    const out = execFileSync("node", [cli, ...args], { encoding: "utf8" });
    return { out, kod: 0 };
  } catch (h) {
    return { out: `${h.stdout ?? ""}${h.stderr ?? ""}`, kod: h.status ?? 1 };
  }
}

// Geçici fixture'ları kur: go metni, düz metin, sahte ELF, sahte Mach-O, minimal WASM.
before(() => {
  DIR = mkdtempSync(join(tmpdir(), "cli2-"));
  GO = join(DIR, "sahte.bin");
  DUZ = join(DIR, "duz.txt");
  LIBAPP = join(DIR, "libapp.so");
  MACHO = join(DIR, "a.out");
  MINIMAL_WASM = join(DIR, "minimal.wasm");
  writeFileSync(GO, SAHTE_GO, "utf8");
  writeFileSync(DUZ, "merhaba dunya, PE degil ELF degil macho degil", "utf8");
  // Sahte ELF: sihir + snapshot sembolleri + engine rev.
  const bas = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const govde = Buffer.from("kDartVmSnapshotData kDartIsolateSnapshotData flutter/abc1234def libflutter.so libapp.so", "latin1");
  writeFileSync(LIBAPP, Buffer.concat([bas, Buffer.alloc(64, 0), govde]));
  // Sahte Mach-O: 64-bit LE sihir + dyld yolu.
  writeFileSync(MACHO, Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.alloc(28, 0), Buffer.from("/usr/lib/libSystem.dylib", "latin1")]));
  // En küçük geçerli WASM modülü: sihir + versiyon 1.
  writeFileSync(MINIMAL_WASM, Buffer.from("0061736d01000000", "hex"));
});

// Geçici dizini temizle (en iyi efor, hata yutulur).
after(() => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* temizlik en iyi efor */
  }
});

describe("analyze-pe (GERÇEK mini_pe)", () => {
  // GERÇEK PE üstünde machine + dll kanıtı birlikte dönmeli.
  it("json kip machine 0x8664 + kernel32 verir", () => {
    const r = kos(["analyze-pe", GERCek_PE, "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.machine, 0x8664);
    assert.equal(j.machine_hex, "0x8664");
    assert.ok(j.dlls.includes("kernel32.dll"));
  });
  // Metin kip de exit 0 verip özet satırı basmalı.
  it("metin kip exit 0 + özet içerir", () => {
    const r = kos(["analyze-pe", GERCek_PE]);
    assert.equal(r.kod, 0);
    assert.ok(r.out.includes("0x8664"));
  });
  // Düz metin PE değildir: kapı kodu sabittir.
  it("düz metin capability_unsupported kapısı", () => {
    const r = kos(["analyze-pe", DUZ, "--json"]);
    assert.equal(r.kod, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.code, "capability_unsupported");
  });
});

describe("analyze-go (sahte metin)", () => {
  // Sahte Go metni buildid özeti + vendor/pclntab alanıyla dönmeli.
  it("sahte metinden go1.22.1 özeti çıkarır", () => {
    const r = kos(["analyze-go", GO, "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.ok(String(j.summary).includes("go1.22.1"));
  });
  // İzsiz dosya Go değildir: exit 1 + kapı kodu.
  it("izsiz dosya capability_unsupported verir", () => {
    const r = kos(["analyze-go", DUZ, "--json"]);
    assert.equal(r.kod, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.code, "capability_unsupported");
  });
});

describe("analyze-flutter kapısı + pozitif", () => {
  // Sahte libapp.so Dart iziyle ok geçmeli.
  it("sahte ELF ok + tur libapp.so", () => {
    const r = kos(["analyze-flutter", LIBAPP, "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.equal(j.tur, "libapp.so");
  });
  // Düz metin ELF değildir: kapıdan döner.
  it("düz metin capability_unsupported verir", () => {
    const r = kos(["analyze-flutter", DUZ, "--json"]);
    assert.equal(r.kod, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.code, "capability_unsupported");
  });
});

describe("analyze-apple + analyze-hap", () => {
  // Sahte Mach-O sihri tanınmalı.
  it("sahte macho ok döner", () => {
    const r = kos(["analyze-apple", MACHO, "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
  });
  // Düz metin HAP değildir (PK imzası yok): kapıdan döner.
  it("düz metin hap kapısı", () => {
    const r = kos(["analyze-hap", DUZ, "--json"]);
    assert.equal(r.kod, 1);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, false);
    assert.equal(j.code, "capability_unsupported");
  });
});

describe("analyze-wasm2 + doctor + bilinmeyen komut", () => {
  // Minimal WASM dosyası section tablosunu vermeli.
  it("minimal wasm section özeti döner", () => {
    const r = kos(["analyze-wasm2", MINIMAL_WASM, "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    assert.ok(Array.isArray(j.sections));
  });
  // Doctor node satırı var + katalog adresi dolu olmalı.
  it("doctor --json node var döner", () => {
    const r = kos(["doctor", "--json"]);
    assert.equal(r.kod, 0);
    const j = JSON.parse(r.out);
    assert.equal(j.ok, true);
    const nodeSatir = j.araclar.find((a) => a.id === "node");
    assert.equal(nodeSatir?.durum, "var");
  });
  // Bilinmeyen komut kullanımı basıp exit 1 vermeli.
  it("bilinmeyen komut exit 1 + kullanım basar", () => {
    const r = kos(["boyle-bir-komut-yok"]);
    assert.equal(r.kod, 1);
    assert.ok(r.out.includes("kullanım"));
  });
});
