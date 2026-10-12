// concurrency.test.mjs: 10 paralel selector + paralel namespace (yarış yok).
// Koş: node --test tests/concurrency.test.mjs (alternatif: node tests/concurrency.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_evm_selector } from "../dist/rea-domains/wasm-evm/WasmEvmBridge.js";
import { assertNoCollision, qualifyReaTool } from "../dist/facade/toolNamespace.js";

describe("paralel evm_selector", () => {
  // 10 paralel çağrı karışmadan doğru seçicileri döndürmeli (race yok).
  it("10 paralel çağrı doğru seçici verir", async () => {
    const imzalar = [
      "transfer(address,uint256)",
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "approve(address,uint256)",
      "transfer(address,uint256)",
      "approve(address,uint256)",
    ];
    const beklenen = [
      "0xa9059cbb", "0x095ea7b3", "0xa9059cbb", "0x095ea7b3", "0xa9059cbb",
      "0x095ea7b3", "0xa9059cbb", "0x095ea7b3", "0xa9059cbb", "0x095ea7b3",
    ];
    const sonuçlar = await Promise.all(imzalar.map(async (s) => rea_evm_selector(s)));
    assert.equal(sonuçlar.length, 10);
    sonuçlar.forEach((r, i) => {
      assert.equal(r.ok, true);
      assert.equal(r.details.selector, beklenen[i]);
    });
  });
});

describe("paralel namespace", () => {
  // Paralel prefixleme sıraya bakmadan aynı sonucu vermeli.
  it("paralel qualify prefixleri doğru basar", async () => {
    const adlar = ["health", "disassemble", "health", "disassemble", "health", "disassemble"];
    const sonuçlar = await Promise.all(adlar.map(async (a) => qualifyReaTool(a)));
    assert.deepEqual(sonuçlar, [
      "rea_health", "rea_disassemble", "rea_health",
      "rea_disassemble", "rea_health", "rea_disassemble",
    ]);
  });

  // Paralel sonuçlar tek kümede çakışmamalı (collision kapısı sessiz).
  it("paralel sonuçlarda collision yok", async () => {
    const adlar = ["health", "disassemble"];
    const sonuçlar = await Promise.all(adlar.map(async (a) => qualifyReaTool(a)));
    assert.doesNotThrow(() => assertNoCollision([...sonuçlar, "rea_evm_selector"]));
  });

  // Karışık yük: selector + namespace aynı anda koşar, ikisi de tutar.
  it("karışık paralel yükte race yok", async () => {
    const [sel, ad] = await Promise.all([
      Promise.resolve(rea_evm_selector("transfer(address,uint256)")),
      Promise.resolve(qualifyReaTool("health")),
    ]);
    assert.equal(sel.ok, true);
    assert.equal(sel.details.selector, "0xa9059cbb");
    assert.equal(ad, "rea_health");
  });
});
