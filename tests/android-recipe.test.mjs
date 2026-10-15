// android-recipe.test.mjs: Android dinamik analiz recetesi uretimi + kuru-dogrulama (node:test).
// Kos: npm run build sonrasi `node tests/android-recipe.test.mjs` (emulator/cihaz yok, saf uretim).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DYNAMIC_RECIPE_TOOLS,
  rea_android_dinamik_recete,
  rea_android_recete_dogrula,
} from "../dist/rea-domains/android/DynamicRecipe.js";

// (a) Tam recete semasi gecerli: 5 adim, her adimda komut + beklenen cikti + dogrulama.
test("tam recete: 5 adim, sema gecerli", () => {
  const r = rea_android_dinamik_recete({});
  assert.equal(r.ok, true);
  assert.equal(r.recete.adimlar.length, 5);
  const kimlikler = r.recete.adimlar.map((a) => a.id);
  assert.deepEqual(kimlikler, [
    "emulator_ac",
    "frida_server_kur",
    "apk_yukle",
    "pinning_bypass",
    "trace_baslat",
  ]);
  for (const adim of r.recete.adimlar) {
    assert.ok(adim.komut.length > 0, `komut bos: ${adim.id}`);
    assert.ok(adim.beklenen_cikti.length > 0, `beklenen_cikti bos: ${adim.id}`);
    assert.ok(adim.dogrulama.length > 0, `dogrulama bos: ${adim.id}`);
  }
  const d = rea_android_recete_dogrula(r.recete);
  assert.equal(d.ok, true);
});

// (b) Eksik arac isaretlenir: emulator/frida/adb yoksa ilgili adim "eksik" + eksik_arac dolu.
test("eksik arac: ilgili adim eksik isaretlenir, uydurma adim yok", () => {
  const r = rea_android_dinamik_recete({ emulator: false, adb: false, frida: false });
  assert.equal(r.ok, true);
  assert.equal(r.recete.adimlar.length, 5); // adim sayisi degismez, durum isareti konur
  const em = r.recete.adimlar[0];
  assert.equal(em.durum, "eksik");
  assert.ok((em.eksik_arac ?? "").length > 0);
  const eksikler = r.recete.adimlar.filter((a) => a.durum === "eksik");
  assert.ok(eksikler.length >= 3, `en az 3 eksik adim beklenir, bulunan: ${eksikler.length}`);
  for (const adim of eksikler) {
    assert.ok((adim.eksik_arac ?? "").length > 0, `eksik_arac bos: ${adim.id}`);
  }
  // Eksik isaretli recete de sema olarak gecerlidir (istemci uygular).
  assert.equal(rea_android_recete_dogrula(r.recete).ok, true);
});

// (c) Pinning adimi uyari tasir: objection + F-Droid ipucu, test-cihazi siniri.
test("pinning adimi: uyari tasir (objection/F-Droid)", () => {
  const r = rea_android_dinamik_recete({});
  const pin = r.recete.adimlar.find((a) => a.id === "pinning_bypass");
  assert.ok(pin, "pinning_bypass adimi yok");
  assert.ok((pin.uyari ?? "").length > 0, "pinning uyarisi bos");
  assert.match(pin.uyari.toLowerCase(), /objection/);
  assert.match(pin.uyari.toLowerCase(), /f-droid/);
});

// (d) Kuru-dogrulama hatali receteyi yakalar.
test("dogrulama: hatali receteyi yakalar", () => {
  const saglam = rea_android_dinamik_recete({}).recete;
  // Bozuk 1: komut bos.
  const bozukKomut = JSON.parse(JSON.stringify(saglam));
  bozukKomut.adimlar[2].komut = "";
  assert.equal(rea_android_recete_dogrula(bozukKomut).ok, false);
  // Bozuk 2: adim sayisi yanlis.
  const bozukSayi = JSON.parse(JSON.stringify(saglam));
  bozukSayi.adimlar = bozukSayi.adimlar.slice(0, 3);
  const d2 = rea_android_recete_dogrula(bozukSayi);
  assert.equal(d2.ok, false);
  assert.equal(d2.code, "gecersiz_recete");
  // Bozuk 3: pinning uyarisi silinmis.
  const bozukUyari = JSON.parse(JSON.stringify(saglam));
  bozukUyari.adimlar.find((a) => a.id === "pinning_bypass").uyari = null;
  assert.equal(rea_android_recete_dogrula(bozukUyari).ok, false);
  // Bozuk 4: recete degil.
  assert.equal(rea_android_recete_dogrula(null).ok, false);
  assert.equal(rea_android_recete_dogrula("recete").ok, false);
});

// Arac katalogu: 2 arac adi (uret + dogrula).
test("DYNAMIC_RECIPE_TOOLS 2 arac adi icerir", () => {
  assert.equal(DYNAMIC_RECIPE_TOOLS.length, 2);
  for (const ad of ["rea_android_dinamik_recete", "rea_android_recete_dogrula"]) {
    assert.ok(DYNAMIC_RECIPE_TOOLS.includes(ad), `eksik: ${ad}`);
  }
});
