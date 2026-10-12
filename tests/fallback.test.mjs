// fallback zincir testi (node:test). Çalıştırma: node --test tests/fallback.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { FALLBACKS, resolveChain } from "../dist/facade/fallback.js";
// Birincil mevcutsa zincir kurulmaz, tek başına döner.
test("birincil mevcutsa aynen döner", () => {
  assert.deepEqual(resolveChain("jadx", new Set(["jadx", "apktool"])), ["jadx"]);
});
// Birincil yoksa tablodaki yedek denenir.
test("jadx yoksa apktool yedeği döner", () => {
  assert.deepEqual(resolveChain("jadx", new Set(["apktool"])), ["apktool"]);
  assert.equal(FALLBACKS["jadx"]?.[0], "apktool");
});
// Ghidra zinciri sırayı korur: önce açık cutter, sonra hopper ve ida.
test("ghidra zinciri sırayı korur", () => {
  assert.deepEqual(resolveChain("ghidra", new Set(["cutter", "hopper", "ida"])), ["cutter", "hopper", "ida"]);
  assert.deepEqual(resolveChain("ghidra", new Set(["ida"])), ["ida"]);
  assert.deepEqual(resolveChain("hopper", new Set(["cutter", "ida"])), ["cutter", "ida"]);
  assert.deepEqual(resolveChain("binwalk", new Set(["unblob"])), ["unblob"]);
});
// Lisanslı araçların açık alternatifi: JEB yoksa jadx.
test("jeb ve cutter zincirleri", () => {
  assert.deepEqual(resolveChain("jeb", new Set(["jadx"])), ["jadx"]);
  assert.deepEqual(resolveChain("cutter", new Set(["hopper", "ida"])), ["hopper", "ida"]);
  assert.deepEqual(resolveChain("cutter", new Set(["cutter"])), ["cutter"]);
});
// Boş kümede normal araç [] döner, wasm2wat unsupported döner.
test("boş küme ve bilinmeyen ad güvenli döner", () => {
  assert.deepEqual(resolveChain("jadx", new Set()), []);
  assert.deepEqual(resolveChain("ghidra", new Set()), []);
  assert.deepEqual(resolveChain("bilinmeyen", new Set(["jadx"])), []);
  assert.deepEqual(resolveChain("wasm2wat", new Set()), ["unsupported"]);
  assert.deepEqual(resolveChain("wasm2wat", new Set(["wat2wasm"])), ["wat2wasm"]);
});
