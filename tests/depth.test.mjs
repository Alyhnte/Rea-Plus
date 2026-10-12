// depth.test.mjs: fs günlüğü + browser derinliği + js derinliği (gerçek fs/chromium, sahte dosyalar).
// Koş: npm run build sonrası `node --test tests/depth.test.mjs` (tsc emit şart).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_fs_diff, rea_fs_snapshot } from "../dist/rea-domains/process/FsJournal.js";
import { rea_console_yakala, rea_storage_dump } from "../dist/rea-domains/browser/BrowserDepth.js";
import { rea_js_export_shape, rea_js_require } from "../dist/rea-domains/javascript/JsDepth.js";

// Taze tmp dizini üretir (repo kirlenmez).
function tazeKlasör(one) {
  return mkdtempSync(join(tmpdir(), `rea-depth-${one}-`));
}

// data: URL üretir (ağ yok, offline chromium).
function dataUrl(html) {
  return "data:text/html," + encodeURIComponent(html);
}

// FS sahnesi: kök dosya + alt dizin dosyası.
function fsSahnesi() {
  const dir = tazeKlasör("fs");
  writeFileSync(join(dir, "a.txt"), "abc");
  mkdirSync(join(dir, "alt"));
  writeFileSync(join(dir, "alt", "b.js"), "console.log(1);");
  return dir;
}

// JS sahnesi: require+import kullanan giriş, bağımsız lib, boş modül.
function jsSahnesi() {
  const dir = tazeKlasör("js");
  writeFileSync(join(dir, "index.js"), "const lib = require('./lib');\nimport fs from 'node:fs';\nconsole.log(lib, fs);\n");
  writeFileSync(join(dir, "lib.js"), "module.exports = 1;\n");
  writeFileSync(join(dir, "bos.js"), "// yalniz yorum\nconst x = 1;\n");
  return dir;
}

// Export sahnesi: fonksiyon + ok-fonksiyon + sınıf + default.
function exportSahnesi() {
  const dir = tazeKlasör("exp");
  writeFileSync(join(dir, "ornek.js"), "function topla(a, b) { return a + b; }\nconst ikiKat = (x) => x * 2;\nclass Kutu {}\nexport default topla;\n");
  return dir;
}

describe("rea_fs_snapshot (gerçek fs)", () => {
  // Recursive yürüyüş kök + alt dizin dosyasını göreli yolla listeler.
  it("dosyaları recursive listeler", () => {
    const dir = fsSahnesi();
    try {
      const r = rea_fs_snapshot(dir);
      assert.equal(r.ok, true);
      assert.equal(r.tool, "rea_fs_snapshot");
      assert.ok(r.kayıt.dosyalar["a.txt"], "a.txt kayıtta olmalı");
      assert.ok(r.kayıt.dosyalar["alt/b.js"], "alt/b.js kayıtta olmalı");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Her kayıt bayt boyutu + mtime sayısı taşır (a.txt = 3 bayt).
  it("boyut+mtime sayıları yazar", () => {
    const dir = fsSahnesi();
    try {
      const r = rea_fs_snapshot(dir);
      assert.equal(r.ok, true);
      assert.equal(r.kayıt.dosyalar["a.txt"].boyut, 3);
      assert.equal(typeof r.kayıt.dosyalar["a.txt"].mtime, "number");
      assert.ok(r.summary.includes("2 dosya"), "özet dosya saymalı");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Yok dizin + boş girdi kapıdan döner.
  it("yok dizin ve boş girdi unsupported verir", () => {
    const yok = rea_fs_snapshot(join(tmpdir(), "rea-depth-olmayan-12345"));
    assert.equal(yok.ok, false);
    assert.equal(yok.code, "capability_unsupported");
    const bos = rea_fs_snapshot("");
    assert.equal(bos.ok, false);
    assert.equal(bos.code, "capability_unsupported");
  });
});

describe("rea_fs_diff (snapshot farkı)", () => {
  // Yeni dosya eklenince eklenen listesinde belirir.
  it("eklenen dosyayı bulur", () => {
    const dir = fsSahnesi();
    try {
      const once = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      writeFileSync(join(dir, "yeni.txt"), "yeni");
      const sonra = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      const d = rea_fs_diff(once, sonra);
      assert.equal(d.ok, true);
      assert.deepEqual(d.kayıt.eklenen, ["yeni.txt"]);
      assert.deepEqual(d.kayıt.silinen, []);
      assert.deepEqual(d.kayıt.değişen, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Dosya silinince silinen listesinde belirir.
  it("silinen dosyayı bulur", () => {
    const dir = fsSahnesi();
    try {
      const once = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      rmSync(join(dir, "a.txt"));
      const sonra = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      const d = rea_fs_diff(once, sonra);
      assert.equal(d.ok, true);
      assert.deepEqual(d.kayıt.silinen, ["a.txt"]);
      assert.deepEqual(d.kayıt.eklenen, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // İçerik (boyut) değişince değişen listesinde belirir.
  it("değişen dosyayı bulur", () => {
    const dir = fsSahnesi();
    try {
      const once = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      writeFileSync(join(dir, "a.txt"), "abc-degisti-uzun-icerik");
      const sonra = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      const d = rea_fs_diff(once, sonra);
      assert.equal(d.ok, true);
      assert.deepEqual(d.kayıt.değişen, ["a.txt"]);
      assert.deepEqual(d.kayıt.eklenen, []);
      assert.deepEqual(d.kayıt.silinen, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Değişiklik yoksa üç liste de boştur.
  it("aynı snapshot fark üretmez", () => {
    const dir = fsSahnesi();
    try {
      const once = JSON.stringify(rea_fs_snapshot(dir).kayıt);
      const d = rea_fs_diff(once, once);
      assert.equal(d.ok, true);
      assert.deepEqual(d.kayıt.eklenen, []);
      assert.deepEqual(d.kayıt.silinen, []);
      assert.deepEqual(d.kayıt.değişen, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Bozuk JSON kapıdan döner.
  it("bozuk JSON unsupported verir", () => {
    const d1 = rea_fs_diff("bozuk-degil-json", "{}");
    assert.equal(d1.ok, false);
    assert.equal(d1.code, "capability_unsupported");
    const d2 = rea_fs_diff("", "");
    assert.equal(d2.ok, false);
    assert.equal(d2.code, "capability_unsupported");
  });
});

describe("rea_storage_dump (gerçek chromium)", () => {
  // Data URL deposu okunur: çerez dizisi + localStorage nesnesi döner.
  it("data URL deposunu okur (çerez+localStorage şekli)", async () => {
    const url = dataUrl("<html><head><title>Depo</title></head><body><p>selam</p></body></html>");
    const r = await rea_storage_dump(url);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_storage_dump");
    assert.ok(Array.isArray(r.details.cookies), "cookies dizi olmalı");
    assert.equal(typeof r.details.localStorage, "object");
    assert.ok(r.summary.length > 0, "özet dolu olmalı");
  });

  // Geçersiz şemalar chromium açılmadan kapıdan döner.
  it("geçersiz url unsupported verir", async () => {
    for (const u of ["", "not-a-url", "ftp://ornek/x"]) {
      const r = await rea_storage_dump(u);
      assert.equal(r.ok, false);
      assert.equal(r.code, "capability_unsupported");
    }
  });
});

describe("rea_console_yakala (gerçek chromium)", () => {
  // Inline betikteki log+warn iletileri tip+metin ile yakalanır.
  it("console.log iletisini yakalar", async () => {
    const url = dataUrl("<html><body><script>console.log('merhaba-konsol');console.warn('dikkat-konsol');</script></body></html>");
    const r = await rea_console_yakala(url, 800);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_console_yakala");
    const metinler = r.details.mesajlar.map((m) => m.metin);
    assert.ok(metinler.includes("merhaba-konsol"), "log yakalanmalı");
    assert.ok(metinler.includes("dikkat-konsol"), "warn yakalanmalı");
    assert.ok(r.details.mesajlar.every((m) => typeof m.tip === "string"), "her iletide tip olmalı");
  });

  // Geçersiz url + aralık-dışı süre kapıdan döner.
  it("geçersiz url ve aralık-dışı süre kapıdan döner", async () => {
    const kotu = await rea_console_yakala("not-a-url", 500);
    assert.equal(kotu.ok, false);
    assert.equal(kotu.code, "capability_unsupported");
    const sure = await rea_console_yakala(dataUrl("<html></html>"), -1);
    assert.equal(sure.ok, false);
    assert.equal(sure.code, "capability_unsupported");
  });
});

describe("rea_js_require (sahte dosyalar)", () => {
  // require('./lib') + import-from aynı dosyadan çıkarılır; bağımsız dosya boş liste.
  it("require+import bağımlılıklarını çıkarır", () => {
    const dir = jsSahnesi();
    try {
      const r = rea_js_require(dir);
      assert.equal(r.ok, true);
      assert.equal(r.tool, "rea_js_require");
      assert.deepEqual(r.details.graf["index.js"].sort(), ["./lib", "node:fs"]);
      assert.deepEqual(r.details.graf["lib.js"], []);
      assert.deepEqual(r.details.graf["bos.js"], []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Yok dizin kapıdan döner.
  it("yok dizin unsupported verir", () => {
    const r = rea_js_require(join(tmpdir(), "rea-depth-olmayan-12345"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_js_export_shape (sahte dosya)", () => {
  // function + ok-fonksiyon + class + default hepsi özetlenir.
  it("fonksiyon/sınıf/default özetini çıkarır", () => {
    const dir = exportSahnesi();
    try {
      const r = rea_js_export_shape(join(dir, "ornek.js"));
      assert.equal(r.ok, true);
      assert.equal(r.tool, "rea_js_export_shape");
      assert.ok(r.details.fonksiyonlar.includes("topla"), "topla bulunmalı");
      assert.ok(r.details.fonksiyonlar.includes("ikiKat"), "ikiKat bulunmalı");
      assert.ok(r.details.siniflar.includes("Kutu"), "Kutu bulunmalı");
      assert.equal(r.details.defaultVarMi, true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Yok dosya kapıdan döner.
  it("yok dosya unsupported verir", () => {
    const r = rea_js_export_shape(join(tmpdir(), "rea-depth-olmayan-12345.js"));
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});
