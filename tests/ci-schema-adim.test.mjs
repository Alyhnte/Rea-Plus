// ci-schema-adim.test.mjs: ci.yml'de şema bütçesi adımının VARLIĞI (ROADMAP P2).
// YÖNTEM: yaml'ı ham metin/regex ile kontrol eder, yeni bağımlılık YOK.
// GERÇEK eşikler tests/schema-budget.test.mjs'ten gelir:
//   listeBayt=200*1024 (204800), semaToplamBayt=110*1024 (112640), ortalamaBayt=600.
// Bu test yalnız CI kablolamasını doğrular (adım var + doğru dosyayı koşuyor);
// bütçe sayıları schema-budget.test.mjs'in kendisindedir (burada uydurma sayı YOK).
// Koş: `node tests/ci-schema-adim.test.mjs` (veya npm test).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const yml = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

describe("ci şema-bütçesi adımı (kablolama)", () => {
  it("ci.yml schema-budget testini koşan bir adım içerir", () => {
    assert.match(
      yml,
      /schema-budget/i,
      "ci.yml içinde schema-budget adım ibaresi olmalı",
    );
    assert.match(
      yml,
      /tests\/schema-budget\.test\.mjs/,
      "ci.yml schema-budget adımı tests/schema-budget.test.mjs dosyasını koşmalı",
    );
  });
});
