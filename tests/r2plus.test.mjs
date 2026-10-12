// r2plus.test.mjs: R2Plus testi (node:test, mocksuz gerçek r2).
// radare2 yoksa fail-safe unsupported; varsa mini_branch.elf üstünde çalışır.
// Koş: npm run build sonrası `node tests/r2plus.test.mjs`.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { R2PLUS_TOOLS, r2Tamam, r2Json, rea_r2_callgraph, rea_r2_esil, rea_r2_debug } from "../dist/rea-domains/r2plus/R2Plus.js";
// Gerçek hedef: conduit örneği (entry0=0x400200, 4 blok).
const ELF = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\examples\\target\\mini_branch.elf";
const YOK = "C:\\yok\\olmayan-hedef.elf";
const BP = "0x400200";
// Mocksuz gerçek kapı: bu makinedeki radare2 durumu.
const VAR = r2Tamam();
// Fail-safe: dosya yoksa skip değil, capability_unsupported assert edilir.
function yoksaUnsupported(s) {
  assert.equal(s.ok, false);
  assert.equal(s.code, "capability_unsupported");
}
describe("r2plus kapı (mocksuz gerçek)", () => {
  it("R2PLUS_TOOLS 3 isimli, rea_r2_ prefixli", () => {
    assert.equal(R2PLUS_TOOLS.length, 3);
    for (const a of R2PLUS_TOOLS) assert.ok(a.startsWith("rea_r2_"), `${a} prefixli olmalı`);
  });
  it("r2Tamam boolean döner", () => {
    assert.equal(typeof VAR, "boolean");
  });
  it("r2Json: aflj entry0 içerir (gerçek exec)", () => {
    if (!VAR) return;
    if (!existsSync(ELF)) return;
    const dizi = r2Json(ELF, "aflj");
    assert.ok(Array.isArray(dizi));
    assert.ok(dizi.some((f) => f.name === "entry0"), "aflj entry0 içermeli");
  });
  it("callgraph entry0 içerir", () => {
    const s = rea_r2_callgraph(ELF);
    if (!VAR) return yoksaUnsupported(s);
    if (!existsSync(ELF)) return yoksaUnsupported(s);
    assert.equal(s.ok, true);
    assert.ok(Array.isArray(s.fonksiyonlar));
    assert.ok(s.fonksiyonlar.some((f) => f.ad === "entry0"), "entry0 bulunmalı");
    assert.ok(s.fonksiyonlar.every((f) => Array.isArray(f.cagrilar)), "cagrilar dizi olmalı");
  });
  it("callgraph: boş arg unsupported", () => {
    const s = rea_r2_callgraph("");
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("callgraph: olmayan hedef unsupported", () => {
    const s = rea_r2_callgraph(YOK);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("esil regs eax/edi ailesini gösterir", () => {
    const s = rea_r2_esil(ELF, BP, 20);
    if (!VAR) return yoksaUnsupported(s);
    if (!existsSync(ELF)) return yoksaUnsupported(s);
    assert.equal(s.ok, true);
    const adlar = Object.keys(s.regs).map((k) => k.toLowerCase());
    assert.ok(adlar.includes("rax") || adlar.includes("eax"), "rax/eax olmalı");
    assert.ok(adlar.includes("rdi") || adlar.includes("edi"), "rdi/edi olmalı");
  });
  it("esil: boş arg unsupported", () => {
    const b1 = rea_r2_esil("", BP);
    assert.equal(b1.ok, false);
    assert.equal(b1.code, "capability_unsupported");
    const b2 = rea_r2_esil(ELF, "");
    assert.equal(b2.ok, false);
    assert.equal(b2.code, "capability_unsupported");
  });
  it("esil: olmayan hedef unsupported", () => {
    const s = rea_r2_esil(YOK, BP);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("debug kapısı: hedef yoksa unsupported", () => {
    const s = rea_r2_debug(YOK, BP);
    assert.equal(s.ok, false);
    assert.equal(s.code, "capability_unsupported");
  });
  it("debug: boş arg unsupported", () => {
    const b1 = rea_r2_debug("", BP);
    assert.equal(b1.ok, false);
    const b2 = rea_r2_debug(ELF, "");
    assert.equal(b2.ok, false);
    assert.equal(b2.code, "capability_unsupported");
  });
  it("debug: gerçek r2 çıktısı+notu (unsupported DEĞİL)", () => {
    const s = rea_r2_debug(ELF, BP);
    if (!VAR) return yoksaUnsupported(s);
    if (!existsSync(ELF)) return yoksaUnsupported(s);
    assert.equal(s.ok, true);
    assert.equal(typeof s.cikti, "string");
    assert.ok(s.cikti.length > 0, "gerçek r2 çıktısı boş olmamalı");
    assert.equal(typeof s.not, "string");
    assert.ok(s.not.length > 0, "not boş olmamalı");
  });
});
