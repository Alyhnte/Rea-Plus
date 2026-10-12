// evidence.test.mjs: kanıt paketi build/verify + stabil tools_sha256 + ev_ öneki.
// Koş: node --test tests/evidence.test.mjs (alternatif: node tests/evidence.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceBundle,
  buildToolsSha256,
  isRetainedRef,
  verifyEvidenceBundle,
} from "../dist/facade/evidenceBundle.js";

describe("evidence bundle", () => {
  // En küçük paket kurulup doğrulanmalı (digest yeniden hesapla tutar).
  it("bundle build/verify turu geçer", () => {
    const b = buildEvidenceBundle([{ ad: "not", inline: "merhaba" }], []);
    assert.equal(typeof b.digest, "string");
    assert.equal(b.digest.length, 64);
    assert.equal(verifyEvidenceBundle(b), true);
  });

  // ev_* referanslı paket de doğrulanmalı (retained deposu yolu).
  it("ev_ referanslı paket doğrulanır", () => {
    const retained = [{ id: "ev_test123", sha256: "abc", bytes: 10, mime: "text/plain" }];
    const b = buildEvidenceBundle([{ ad: "rapor", ref: "ev_test123" }], retained);
    assert.equal(verifyEvidenceBundle(b), true);
  });

  // tools_sha256 katalogdan türetilir ve her çağrıda aynıdır (stabil).
  it("tools_sha256 stabil ve 64 haneli", () => {
    const a = buildToolsSha256();
    const b = buildToolsSha256();
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  // Aynı girdiye aynı tools_sha256: sıralama stabiliteyi garanti eder.
  it("aynı kimlik listesi aynı hash'i verir", () => {
    const a = buildToolsSha256(["b", "a", "c"]);
    const b = buildToolsSha256(["c", "b", "a"]);
    assert.equal(a, b);
  });

  // ev_ öneki koruması: doğru önek geçer, çıplak ad elenir.
  it("ev_ öneki doğru ayrılır", () => {
    assert.equal(isRetainedRef("ev_9f2c41"), true);
    assert.equal(isRetainedRef("rapor-1"), false);
    assert.equal(isRetainedRef("ev_"), false);
  });

  // Yanlış referans pakete girmeden elenmeli (erken hata).
  it("geçersiz ref build'i patlatır", () => {
    assert.throws(() => buildEvidenceBundle([{ ad: "x", ref: "yanlis" }], []), /geçersiz evidence ref/);
  });

  // Kurcalanmış digest doğrulamadan geçmemeli (bütünlük kapısı).
  it("kurcalanmış paket verify'den geçemez", () => {
    const b = buildEvidenceBundle([{ ad: "not", inline: "orijinal" }], []);
    const sahte = { ...b, items: [{ ad: "not", inline: "kurcalandı" }] };
    assert.equal(verifyEvidenceBundle(sahte), false);
  });
});
