// wasm-evm2.test.mjs: gerçek wasm-validate + saf EVM disas (offline, yürütme yok).
// Koş: node --test tests/wasm-evm2.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_wasm_validate, rea_evm_disasm } from "../dist/rea-domains/wasm-evm/EvmTools.js";

// wabt (wasm-validate) var mı? Yoksa validate testleri kapı beklentisine düşer.
// spawnSync bulunamayan komutta throw etmez; r.error/status bakılır.
const wabtVar = [process.env.REA_WABT_BIN, "wasm-validate"].filter(Boolean).some((b) => { try { const r = spawnSync(b, ["--version"], { stdio: "ignore" }); return !r.error && r.status === 0; } catch { return false; } });

// Geçici dosya yardımcısı: hex dizgiyi gerçek bayta çevirir (Buffer ise aynen yazar).
function gecici(ad, bayt) {
  const d = mkdtempSync(join(tmpdir(), "evm2-"));
  const yol = join(d, ad);
  writeFileSync(yol, Buffer.isBuffer(bayt) ? bayt : Buffer.from(bayt, "hex"));
  return yol;
}

describe("rea_wasm_validate (gerçek wabt)", () => {
  // En küçük geçerli WASM başlığı wasm-validate'den geçmeli.
  it("geçerli başlık geçerli döner", () => {
    const yol = gecici("gecerli.wasm", "0061736d01000000");
    if (!wabtVar) { const k = rea_wasm_validate(yol); assert.equal(k.ok, false); assert.equal(k.code, "capability_unsupported"); return; }
    const r = rea_wasm_validate(yol);
    assert.equal(r.ok, true);
    assert.equal(r.detay.gecerli, true);
  });
  // Bozuk dosya WASM değildir: kal (invalid_wasm) kodu beklenir.
  it("bozuk dosya invalid_wasm verir", () => {
    const yol = gecici("bozuk.wasm", Buffer.from("not a wasm"));
    if (!wabtVar) { const k = rea_wasm_validate(yol); assert.equal(k.ok, false); assert.equal(k.code, "capability_unsupported"); return; }
    const r = rea_wasm_validate(yol);
    assert.equal(r.ok, false);
    assert.equal(r.code, "invalid_wasm");
  });
  // Olmayan yol erken kapıdan döner.
  it("olmayan dosya capability_unsupported verir", () => {
    const r = rea_wasm_validate("yok/boyle.wasm");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_evm_disasm (saf TS)", () => {
  // Bilinen vektör: PUSH1 00, CALLDATALOAD, PUSH1 e0, SHR (pc takibiyle).
  it("0x60003560e01c dizisini doğru çözer", () => {
    const r = rea_evm_disasm("0x60003560e01c");
    assert.equal(r.ok, true);
    const ops = r.detay.ops;
    assert.equal(ops.length, 4);
    assert.deepEqual(ops.map((o) => o.ad), ["PUSH1", "CALLDATALOAD", "PUSH1", "SHR"]);
    assert.equal(ops[0].operand, "0x00");
    assert.equal(ops[2].operand, "0xe0");
    assert.deepEqual(ops.map((o) => o.pc), [0, 2, 3, 5]);
  });
  // PUSH1 + ADD: operand ve aritmetik opcode birlikte.
  it("PUSH1 ve ADD çözer", () => {
    const r = rea_evm_disasm("0x600101");
    assert.equal(r.ok, true);
    assert.deepEqual(r.detay.ops.map((o) => o.ad), ["PUSH1", "ADD"]);
  });
  // Tek bayt STOP: pc 0, operandsiz.
  it("STOP çözer", () => {
    const r = rea_evm_disasm("0x00");
    assert.equal(r.ok, true);
    assert.equal(r.detay.ops[0].ad, "STOP");
    assert.equal(r.detay.ops[0].pc, 0);
  });
  // Tek bayt JUMPDEST: atlama hedefi tanınmalı.
  it("JUMPDEST çözer", () => {
    const r = rea_evm_disasm("0x5b");
    assert.equal(r.ok, true);
    assert.equal(r.detay.ops[0].ad, "JUMPDEST");
  });
  // Boş hex kapıdan döner, uydurma opcode üretilmez.
  it("boş hex capability_unsupported verir", () => {
    const r = rea_evm_disasm("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
