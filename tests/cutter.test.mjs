// cutter.test.mjs: CutterBridge testi (node:test, mocksuz gerçek kapı).
// rizin yoksa hepsi capability_unsupported; varsa mini_branch.elf üstünde çalışır.
// Koş: npm run build sonrası `node tests/cutter.test.mjs`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CUTTER_TOOLS, cutterTamam, rea_cutter_caps, rea_cutter_funcs, rea_cutter_disasm, rea_cutter_xrefs, rea_cutter_strings, rea_cutter_decompile } from "../dist/rea-domains/cutter/CutterBridge.js";
// Gerçek hedef: conduit örneği (yoksa fail-safe assert, skip yok).
const DIZIN = dirname(fileURLToPath(import.meta.url));
const ELF = join(DIZIN, "corpus", "mini_branch.elf");
const YOK = join(DIZIN, "corpus", "olmayan-hedef.elf");
// Mocksuz gerçek kapı: bu makinedeki rizin durumu.
const VAR = cutterTamam();
// Fail-safe: dosya yoksa skip değil, capability_unsupported assert edilir.
function dosyaYoksaUnsupported(s) {
  assert.equal(s.ok, false);
  assert.equal(s.code, "capability_unsupported");
}
// Disas/xref/decompile için ilk fonksiyon adresi (yoksa main).
function ilkAdres() {
  const f = rea_cutter_funcs(ELF);
  if (f.ok && f.fonksiyonlar.length > 0 && typeof f.fonksiyonlar[0].offset === "number") {
    return "0x" + f.fonksiyonlar[0].offset.toString(16);
  }
  return "main";
}
describe("cutter kapı (mocksuz gerçek)", () => {
  it("CUTTER_TOOLS 6 isimli, rea_cutter_ prefixli", () => {
    assert.equal(CUTTER_TOOLS.length, 6);
    for (const a of CUTTER_TOOLS) assert.ok(a.startsWith("rea_cutter_"), `${a} prefixli olmalı`);
  });
  it("cutterTamam boolean döner", () => {
    assert.equal(typeof VAR, "boolean");
  });
  it("caps: yoksa unsupported, varsa sürüm+pdc", () => {
    const s = rea_cutter_caps();
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else { assert.equal(s.ok, true); assert.ok(s.surum.length > 0); assert.equal(typeof s.pdc, "boolean"); }
  });
  it("funcs: olmayan hedef fail-safe unsupported", () => {
    const s = rea_cutter_funcs(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("funcs: yoksa unsupported, varsa mini_branch.elf listesi", () => {
    const s = rea_cutter_funcs(ELF);
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else if (!existsSync(ELF)) dosyaYoksaUnsupported(s);
    else { assert.equal(s.ok, true); assert.ok(Array.isArray(s.fonksiyonlar)); assert.ok(s.fonksiyonlar.length > 0); }
  });
  it("disasm: yoksa unsupported, varsa op listesi", () => {
    const s = rea_cutter_disasm(ELF, ilkAdres());
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else if (!existsSync(ELF)) dosyaYoksaUnsupported(s);
    else { assert.equal(s.ok, true); assert.ok(Array.isArray(s.ops)); assert.ok(s.ops.length > 0); assert.ok(s.ops.length <= 50); }
  });
  it("xrefs: yoksa unsupported, varsa liste", () => {
    const s = rea_cutter_xrefs(ELF, ilkAdres());
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else if (!existsSync(ELF)) dosyaYoksaUnsupported(s);
    else { assert.equal(s.ok, true); assert.ok(Array.isArray(s.xrefs)); }
  });
  it("strings: yoksa unsupported, varsa liste", () => {
    const s = rea_cutter_strings(ELF);
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else if (!existsSync(ELF)) dosyaYoksaUnsupported(s);
    else { assert.equal(s.ok, true); assert.ok(Array.isArray(s.strings)); assert.ok(s.strings.length <= 200); }
  });
  it("decompile: yoksa unsupported, varsa pdc ya da pdf yedeği", () => {
    const s = rea_cutter_decompile(ELF, ilkAdres());
    if (!VAR) assert.equal(s.code, "capability_unsupported");
    else if (!existsSync(ELF)) dosyaYoksaUnsupported(s);
    else { assert.equal(s.ok, true); assert.ok(s.kaynak === "pdc" || s.kaynak === "pdf"); assert.ok(typeof s.kod === "string" && s.kod.length > 0); }
  });
});
