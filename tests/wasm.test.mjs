// wasm.test.mjs: WAT export taraması + decode kapısı (tamamen offline).
// Koş: node --test tests/wasm.test.mjs (alternatif: node tests/wasm.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_wasm_decode, rea_wasm_exports } from "../dist/rea-domains/wasm-evm/WasmEvmBridge.js";

// İki exportlu örnek WAT: tarayıcı ikisini de bulmalı.
const IKI_EXPORT = `(module
  (func (export "topla") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)
  (func (export "cikar") (param i32 i32) (result i32) local.get 0 local.get 1 i32.sub))`;

// Tek exportlu örnek WAT: ikinci parse yolu bu girdiyi kullanır.
const TEK_EXPORT = `(module (func (export "merhaba") (result i32) i32.const 1))`;

describe("rea_wasm_exports", () => {
  // İki exportlu metin ikisini de sırasıyla döndürmeli.
  it("iki exportu adlarıyla listeler", () => {
    const r = rea_wasm_exports(IKI_EXPORT);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_wasm_exports");
    assert.deepEqual(r.details.names, ["topla", "cikar"]);
  });

  // Tek exportlu metin tek girdilik liste döndürmeli.
  it("tek exportu listeler", () => {
    const r = rea_wasm_exports(TEK_EXPORT);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.names, ["merhaba"]);
  });

  // Özet satırı export sayısını bildirmeli.
  it("summary export sayısını taşır", () => {
    const r = rea_wasm_exports(IKI_EXPORT);
    assert.equal(r.ok, true);
    assert.equal(r.summary, "2 export");
  });

  // Boş metinde export yoktur: capability_unsupported kapısı.
  it("boş metin capability_unsupported verir", () => {
    const r = rea_wasm_exports("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_wasm_decode kapısı", () => {
  // Boş yol erken elenir, wabt aranmadan kapı döner.
  it("boş yol capability_unsupported verir", () => {
    const r = rea_wasm_decode("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });

  // Olmayan dosya wabt olsa da çözülemez: kapı kodu sabittir.
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_wasm_decode("yok/boyle/bir/dosya.wasm");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
