// readiness.test.mjs: hazırlık skoru + kapsama oranı testleri (offline).
// Koş: npm run build; if ($?) { node --test tests/readiness.test.mjs }
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_readiness, rea_coverage } from "../dist/facade/readiness.js";

// Kanıt JSON kısayolu: {fonksiyonlar, problemler, bilinmeyenler} metni üretir.
const K = (f, p, b) => JSON.stringify({ fonksiyonlar: f, problemler: p, bilinmeyenler: b });

describe("rea_readiness", () => {
  // Kural: fonksiyon>=1, problem=0, bilinmeyen<=2 ise hazır (skor 100).
  it("kural tutunca hazir ve skor 100 verir", () => {
    const r = rea_readiness(K(3, 0, 1));
    assert.equal(r.ok, true);
    assert.equal(r.seviye, "hazir");
    assert.equal(r.skor, 100);
    assert.deepEqual(r.eksik, []);
  });
  // Sınır değer bilinmeyen=2 hâlâ hazırdır.
  it("bilinmeyen=2 sınırında hazir kalır", () => {
    const r = rea_readiness(K(1, 0, 2));
    assert.equal(r.ok, true);
    assert.equal(r.seviye, "hazir");
  });
  // Fazla bilinmeyen skoru düşürür ama 50 üstü kısmi sayılır.
  it("bilinmeyen fazlası kismi verir", () => {
    const r = rea_readiness(K(2, 0, 4));
    assert.equal(r.ok, true);
    assert.equal(r.seviye, "kismi");
    assert.equal(r.skor, 80);
    assert.ok(r.eksik.some((e) => e.includes("bilinmeyen")));
  });
  // Problem + fonksiyonsuzluk skoru tabana çeker: eksik.
  it("fonksiyonsuz ve problemli eksik verir", () => {
    const r = rea_readiness(K(0, 2, 5));
    assert.equal(r.ok, true);
    assert.equal(r.seviye, "eksik");
    assert.equal(r.skor, 0);
    assert.ok(r.eksik.length >= 2);
  });
  // Bozuk JSON kapıdan döner, sahte skor üretilmez.
  it("geçersiz JSON capability_unsupported verir", () => {
    const r = rea_readiness("bozuk");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // Eksik alanlı kanıt kapıdan döner.
  it("eksik alan capability_unsupported verir", () => {
    const r = rea_readiness(JSON.stringify({ fonksiyonlar: 1 }));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_coverage", () => {
  // 3/4 inceleme oran 0.75 + kalan 1 verir.
  it("oran ve kalanı hesaplar", () => {
    const r = rea_coverage(3, 4);
    assert.equal(r.ok, true);
    assert.equal(r.oran, 0.75);
    assert.equal(r.kalan, 1);
  });
  // Tam inceleme oran 1 + kalan 0 verir.
  it("tam kapsam oran 1 verir", () => {
    const r = rea_coverage(5, 5);
    assert.equal(r.ok, true);
    assert.equal(r.oran, 1);
    assert.equal(r.kalan, 0);
  });
  // Toplam sıfırsa oran tanımsızdır: kapı kodu sabittir.
  it("toplam 0 capability_unsupported verir", () => {
    const r = rea_coverage(0, 0);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
