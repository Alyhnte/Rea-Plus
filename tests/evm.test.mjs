// evm.test.mjs: EVM selector köprüsü (transfer/approve + boş imza kapısı).
// Koş: node --test tests/evm.test.mjs  (alternatif: node tests/evm.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_evm_selector } from "../dist/rea-domains/wasm-evm/WasmEvmBridge.js";

// Kanonik imza tablosu: keccak ilk 4 baytı, 0x önekiyle.
const KANONIK = {
  "transfer(address,uint256)": "0xa9059cbb",
  "approve(address,uint256)": "0x095ea7b3",
};

describe("rea_evm_selector", () => {
  // transfer imzası kanonik seçiciyi vermeli.
  it("transfer(address,uint256) -> 0xa9059cbb", () => {
    const r = rea_evm_selector("transfer(address,uint256)");
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_evm_selector");
    assert.equal(r.details.selector, KANONIK["transfer(address,uint256)"]);
  });

  // approve imzası kanonik seçiciyi vermeli.
  it("approve(address,uint256) -> 0x095ea7b3", () => {
    const r = rea_evm_selector("approve(address,uint256)");
    assert.equal(r.ok, true);
    assert.equal(r.details.selector, KANONIK["approve(address,uint256)"]);
  });

  // Özet satırı seçiciyle aynı olmalı (kullanıcıya tek satır kanıt).
  it("summary alanı selector özetini taşır", () => {
    const r = rea_evm_selector("transfer(address,uint256)");
    assert.equal(r.ok, true);
    assert.equal(r.summary, "0xa9059cbb");
  });

  // Boş imza kapıdan dönmeli: capability_unsupported, ok=false.
  it("boş imza capability_unsupported verir", () => {
    const r = rea_evm_selector("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });

  // Parantezsiz girdi geçersiz imzadır, kapı aynı kodu verir.
  it("parantezsiz imza capability_unsupported verir", () => {
    const r = rea_evm_selector("transfer");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });

  // Boşluklu yazım kanonik forma yaklaştırılır, seçici değişmez.
  it("boşluklu imza aynı seçiciyi verir", () => {
    const r = rea_evm_selector("transfer(address, uint256)");
    assert.equal(r.ok, true);
    assert.equal(r.details.selector, "0xa9059cbb");
  });
});
