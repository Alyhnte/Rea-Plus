// managed-workflow.test.mjs: compare/verify/import saf akış testleri (offline).
// Koş: npm run build; if ($?) { node --test tests/managed-workflow.test.mjs }
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_managed_compare, rea_managed_verify, rea_managed_import } from "../dist/rea-domains/dotnet/ManagedWorkflow.js";

// Üye listesi kısayolu: [{ad, imza}] JSON metni üretir.
const U = (l) => JSON.stringify(l);

describe("rea_managed_compare", () => {
  // Yeni sürümde gelen ad eklenen sayılır.
  it("ekleneni bulur", () => {
    const r = rea_managed_compare(U([{ ad: "A", imza: "v()" }]), U([{ ad: "A", imza: "v()" }, { ad: "B", imza: "w()" }]));
    assert.equal(r.ok, true);
    assert.equal(r.detay.eklenen.length, 1);
    assert.equal(r.detay.eklenen[0].ad, "B");
  });
  // Eski sürümde kalıp yenide olmayan ad silinen sayılır.
  it("silineni bulur", () => {
    const r = rea_managed_compare(U([{ ad: "A", imza: "v()" }, { ad: "B", imza: "w()" }]), U([{ ad: "A", imza: "v()" }]));
    assert.equal(r.ok, true);
    assert.equal(r.detay.silinen.length, 1);
    assert.equal(r.detay.silinen[0].ad, "B");
  });
  // Aynı ad farklı imza imza-değişen sayılır, eklenen/silinen sayılmaz.
  it("imza-değişeni bulur", () => {
    const r = rea_managed_compare(U([{ ad: "A", imza: "v()" }]), U([{ ad: "A", imza: "v(int)" }]));
    assert.equal(r.ok, true);
    assert.equal(r.detay.imzaDegisen.length, 1);
    assert.equal(r.detay.eklenen.length, 0);
    assert.equal(r.detay.silinen.length, 0);
  });
  // Birebir aynı listede fark sıfırdır.
  it("aynı listede fark sıfırdır", () => {
    const r = rea_managed_compare(U([{ ad: "A", imza: "v()" }]), U([{ ad: "A", imza: "v()" }]));
    assert.equal(r.ok, true);
    assert.equal(r.ozet, "+0 -0 ~0");
  });
  // Bozuk JSON kapıdan döner, sahte diff üretilmez.
  it("geçersiz JSON capability_unsupported verir", () => {
    const r = rea_managed_compare("bozuk", U([]));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
  // İki boş liste anlamsızdır: kapı kodu sabittir.
  it("iki boş liste capability_unsupported verir", () => {
    const r = rea_managed_compare(U([]), U([]));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_managed_verify", () => {
  // Metadata methods çıktısı beklenenle kesişir: eksik+fazla raporlanır.
  it("eksik ve fazlayı raporlar", () => {
    const meta = JSON.stringify({ assembly: "X", methods: ["A", "B", "C"] });
    const r = rea_managed_verify(meta, U(["A", "B", "D"]));
    assert.equal(r.ok, true);
    assert.deepEqual(r.detay.eksik, ["D"]);
    assert.deepEqual(r.detay.fazla, ["C"]);
  });
  // Ham dizi metadata da kabul edilir (üye-ad dizisi).
  it("dizi metadata ile tam eşleşme verir", () => {
    const r = rea_managed_verify(U(["A", "B"]), U(["A", "B"]));
    assert.equal(r.ok, true);
    assert.deepEqual(r.detay.eksik, []);
    assert.deepEqual(r.detay.fazla, []);
  });
  // Dosya yolu metni metadata değildir: okuma yapılmaz, kapı döner.
  it("dosya yolu capability_unsupported verir", () => {
    const r = rea_managed_verify("C:\\x\\y.dll", U(["A"]));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_managed_import", () => {
  // Bulgu->üye eşleme listesi reconstruction kaydıyla döner.
  it("eşleme kaydını üretir", () => {
    const r = rea_managed_import(U([{ bulgu: "f1", uye: "A" }, { bulgu: "f2", aday: "B" }]));
    assert.equal(r.ok, true);
    assert.equal(r.detay.kayit, "reconstruction");
    assert.deepEqual(r.detay.esleme, [{ bulgu: "f1", uye: "A" }, { bulgu: "f2", uye: "B" }]);
  });
  // Boş bulgu listesi kapıdan döner.
  it("boş liste capability_unsupported verir", () => {
    const r = rea_managed_import(U([]));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
