// compact.test.mjs: full vs compact profil + 13KB girdi bütçesi.
// Koş: node --test tests/compact.test.mjs (alternatif: node tests/compact.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPACT_INPUT_BUDGET_BYTES,
  REA_MCP_INPUT_SCHEMA_PROFILE,
  assertCompactInput,
  describeCompactProfile,
  measureInputBytes,
  resolveInputSchemaProfile,
  toCompactProfile,
} from "../dist/facade/compactSchema.js";

describe("compact profil", () => {
  // Bütçe sabiti 13KB olmalı (görev tanımındaki sınır budur).
  it("bütçe 13KB (13312 bayt)", () => {
    assert.equal(COMPACT_INPUT_BUDGET_BYTES, 13 * 1024);
    assert.equal(COMPACT_INPUT_BUDGET_BYTES, 13312);
  });

  // Profil bayrağı tek kaynaktan "compact" okunur.
  it("profil bayrağı compact", () => {
    assert.equal(REA_MCP_INPUT_SCHEMA_PROFILE, "compact");
    assert.equal(resolveInputSchemaProfile("compact"), "compact");
  });

  // full profili desteklenmez: yanlış değer erken patlar.
  it("full profil desteklenmez", () => {
    assert.throws(() => resolveInputSchemaProfile("full"), /desteklenmeyen profil/);
  });

  // Ortam bayrağı boşken varsayılan compact döner (sessiz kayma yok).
  it("ortam bayrağı boşken compact döner", () => {
    delete process.env.REA_MCP_INPUT_SCHEMA_PROFILE;
    assert.equal(resolveInputSchemaProfile(undefined), "compact");
  });

  // Küçük girdi bütçeye sığar, kapıdan sessizce geçer.
  it("küçük girdi assertCompactInput'tan geçer", () => {
    assert.doesNotThrow(() => assertCompactInput({ komut: "merhaba" }));
    assert.ok(measureInputBytes({ komut: "merhaba" }) < COMPACT_INPUT_BUDGET_BYTES);
  });

  // 13KB üstü girdi kapıda patlar: sessiz kırpma yasak, karar çağıranda.
  it("13KB üstü girdi bütçe hatası verir", () => {
    const büyük = { veri: "x".repeat(14 * 1024) };
    assert.ok(measureInputBytes(büyük) > COMPACT_INPUT_BUDGET_BYTES);
    assert.throws(() => assertCompactInput(büyük), /compact profil aşıldı/);
  });

  // toCompactProfile uzun alanı kırpar, kırpılan adını raporlar.
  it("toCompactProfile kırpar ve raporlar", () => {
    const büyük = { veri: "y".repeat(14 * 1024), küçük: "tamam" };
    const p = toCompactProfile(büyük);
    assert.equal(p.profile, "compact");
    assert.deepEqual(p.kırpılan, ["veri"]);
    assert.ok(p.bytes <= p.budget);
    assert.ok(describeCompactProfile(p).includes("veri"));
  });

  // Kırpmasız profilde özet "kırpma yok" cümlesini taşır.
  it("kırpmasız özet cümlesi sabittir", () => {
    const p = toCompactProfile({ a: "1" });
    assert.deepEqual(p.kırpılan, []);
    assert.ok(describeCompactProfile(p).includes("kırpma yok"));
  });
});
