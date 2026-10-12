// winpe.test.mjs: GERÇEK mini_pe_x64.exe üstünde machine/import/section + PE-değil kapısı.
// Koş: node --test tests/winpe.test.mjs
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_pe_info, rea_pe_imports, rea_pe_sections } from "../dist/rea-domains/winpe/PeReader.js";

// Gerçek fixture: conduit x64dbg mini PE (x64, tek .text, kernel32!ExitProcess).
const PE = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\plugin\\x64dbg\\test\\mini_pe_x64.exe";
let DUZ = "";

before(() => {
  const d = mkdtempSync(join(tmpdir(), "pe-"));
  DUZ = join(d, "duz.txt");
  writeFileSync(DUZ, "PE değilim, düz metnim");
});

describe("rea_pe_info (gerçek PE)", () => {
  // COFF machine x64 olmalı (0x8664 = 34404).
  it("machine 0x8664 döner", () => {
    const r = rea_pe_info(PE);
    assert.equal(r.ok, true);
    assert.equal(r.machine, 0x8664);
    assert.equal(r.machine_hex, "0x8664");
  });
  // Optional magic 0x20b => 64-bit.
  it("bit 64 bildirir", () => {
    const r = rea_pe_info(PE);
    assert.equal(r.ok, true);
    assert.equal(r.bit, "64");
  });
  // Giriş noktası .text tabanında (0x1000).
  it("entry 0x1000 döner", () => {
    const r = rea_pe_info(PE);
    assert.equal(r.ok, true);
    assert.equal(r.entry, 0x1000);
    assert.equal(r.entry_hex, "0x1000");
  });
  // Tek bölümlü mini fixture sayacı tutmalı.
  it("section_sayisi 1 döner", () => {
    const r = rea_pe_info(PE);
    assert.equal(r.ok, true);
    assert.equal(r.section_sayisi, 1);
  });
});

describe("rea_pe_imports (gerçek PE)", () => {
  // DLL listesi kernel32'yi içermeli.
  it("kernel32.dll listelenir", () => {
    const r = rea_pe_imports(PE);
    assert.equal(r.ok, true);
    assert.ok(r.dlls.includes("kernel32.dll"));
  });
  // Thunk zincirinden fonksiyon adı çözülmeli.
  it("kernel32.dll!ExitProcess çözülür", () => {
    const r = rea_pe_imports(PE);
    assert.equal(r.ok, true);
    assert.ok(r.fonksiyonlar.includes("kernel32.dll!ExitProcess"));
    assert.ok(r.sayi >= 1);
  });
});

describe("rea_pe_sections (gerçek PE)", () => {
  // Bölüm tablosu .text ad+vaddr ile gelmeli.
  it(".text vaddr 0x1000 döner", () => {
    const r = rea_pe_sections(PE);
    assert.equal(r.ok, true);
    assert.equal(r.sayi, 1);
    assert.equal(r.bolumler[0].ad, ".text");
    assert.equal(r.bolumler[0].vaddr, 0x1000);
    assert.equal(r.bolumler[0].vsize, 0x1000);
  });
});

describe("PE-değil kapıları", () => {
  // MZ yoksa info kapısı, fırlatma yok.
  it("düz metin info capability_unsupported verir", () => {
    const r = rea_pe_info(DUZ);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // MZ yoksa imports kapısı.
  it("düz metin imports capability_unsupported verir", () => {
    const r = rea_pe_imports(DUZ);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // MZ yoksa sections kapısı.
  it("düz metin sections capability_unsupported verir", () => {
    const r = rea_pe_sections(DUZ);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // Olmayan dosya aynı kapıya takılır.
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_pe_info("yok/boyle/bir.exe");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
