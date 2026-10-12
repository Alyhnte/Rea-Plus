// obligation.test.mjs: bulgu->kod->test zinciri (build/advance/verify/close).
// Koş: node --test tests/obligation.test.mjs (alternatif: node tests/obligation.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceObligation,
  build_reconstruction_obligation_ledger,
  closeObligationLedger,
  verifyObligationChain,
} from "../dist/facade/obligationLedger.js";

// Test defteri: iki bulgu, sabit kimlikler (zincir deterministik olur).
function yeniDefter() {
  return build_reconstruction_obligation_ledger(["bulgu-a", "bulgu-b"], {
    tools_sha256: "t123",
    evidence_digest: "e123",
    ledger_id: "obl_test",
  });
}

describe("obligation zinciri", () => {
  // Yeni defter iki açık halkayla kurulur, kapatılmamıştır.
  it("build iki açık halka kurar", () => {
    const d = yeniDefter();
    assert.equal(d.ledger_id, "obl_test");
    assert.equal(d.kapatıldı, false);
    assert.deepEqual(d.links.map((l) => l.durum), ["açık", "açık"]);
  });

  // Boş bulgu listesiyle defter kurulamaz (en az bir halka şart).
  it("boş bulgu build'i patlatır", () => {
    assert.throws(
      () => build_reconstruction_obligation_ledger([], { tools_sha256: "t", evidence_digest: "e" }),
      /boş bulguyla/
    );
  });

  // Kod yazılınca halka "kodlandı" durumuna geçer.
  it("advance kod ile kodlandı yapar", () => {
    const d = advanceObligation(yeniDefter(), "bulgu-a", "kod-a");
    assert.equal(d.links[0].durum, "kodlandı");
    assert.equal(d.links[0].kod, "kod-a");
    assert.equal(d.links[1].durum, "açık");
  });

  // Test bağlanınca halka "testli" olur, eksik listesi küçülür.
  it("advance test ile testli yapar", () => {
    let d = yeniDefter();
    d = advanceObligation(d, "bulgu-a", "kod-a", "test-a");
    assert.equal(d.links[0].durum, "testli");
    const v = verifyObligationChain(d);
    assert.equal(v.ok, false);
    assert.deepEqual(v.eksik, ["bulgu-b"]);
  });

  // Tam zincir verify'den geçer ve mühürlenir (hepsi kapalı).
  it("tam zincir verify+close ile mühürlenir", () => {
    let d = yeniDefter();
    d = advanceObligation(d, "bulgu-a", "kod-a", "test-a");
    d = advanceObligation(d, "bulgu-b", "kod-b", "test-b");
    assert.equal(verifyObligationChain(d).ok, true);
    const kapalı = closeObligationLedger(d);
    assert.equal(kapalı.kapatıldı, true);
    assert.deepEqual(kapalı.links.map((l) => l.durum), ["kapalı", "kapalı"]);
  });

  // Eksik halka varken kapatma durur: hata eksik adı taşır.
  it("eksik kapatma hatası eksik adı söyler", () => {
    const d = advanceObligation(yeniDefter(), "bulgu-a", "kod-a", "test-a");
    assert.throws(() => closeObligationLedger(d), /bulgu-b/);
  });

  // Kapalı defter değişmez: ilerletme denemesi erken patlar.
  it("kapalı defter ilerletilemez", () => {
    let d = yeniDefter();    d = advanceObligation(d, "bulgu-a", "kod-a", "test-a");
    d = advanceObligation(d, "bulgu-b", "kod-b", "test-b");
    const kapalı = closeObligationLedger(d);
    assert.throws(() => advanceObligation(kapalı, "bulgu-a", "x"), /kapalı defter/);
  });
});
