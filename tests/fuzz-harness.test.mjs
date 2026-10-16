// tests/fuzz-harness.test.mjs: Dalga 4g — hedefli fuzz harness (TDD).
// Kos: once `npm run build` (dist parser'lari icin), sonra `node tests/fuzz-harness.test.mjs`.
// Kapsam:
//  (a) Bilinen-crash'li sentetik hedef YAKALANIR + dogru sinifa konur.
//  (b) Hata turu -> sinif tablosu (Error nesnesi + fuzz cikti metni).
//  (c) Ayni imzali crash'ler tek grupta toplanir.
//  (d) Rapor yalniz tmpdir'e yazilir (ozet.json + rapor.md), corpus kirlenmez.
//  (e) Varsayilan butce CI dostu (<60sn) + tavan asimi raporlanir.
//  (f) Gercek parser'larla kucuk kosu tutarli sayilar verir (0 crash da durust sonuc).
// Not: tests/corpus'a ASLA yazilmaz; tohumlar salt-okunur okunur.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VARSAYILANLAR,
  hatayiSiniflandir,
  crashlariGrupla,
  fuzzCalistir,
  raporYaz,
} from "../scripts/fuzz-harness.mjs";
import { tohumlariOku, varsayilanHedefler } from "../scripts/fuzz-parsers.mjs";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const corpusDir = join(kok, "tests", "corpus");
const corpusAnlik = readdirSync(corpusDir).sort();

let tohumlar;
let hedefler;
before(() => {
  tohumlar = tohumlariOku(corpusDir);
  hedefler = varsayilanHedefler();
});

describe("fuzz harness (a): sentetik crash yakalanir + siniflanir", () => {
  it("TypeError firlatan hedef: crash sayilir, sinif 'tip' olur", () => {
    const patlayan = {
      ad: "sahte-tip-patlayan",
      tur: "sahte",
      cagir: () => { throw new TypeError("sahte tip hatasi: okunamadi"); },
    };
    const sonuc = fuzzCalistir({
      tohumlar: { sahte: Buffer.from([0x41, 0x42, 0x43, 0x44]) },
      hedefler: [patlayan],
      seed: 7,
      adet: 3,
      tekilTavanMs: 2000,
      toplamTavanMs: 60_000,
      reproDir: null,
    });
    assert.equal(sonuc.toplam, 3);
    assert.equal(sonuc.crash, 3);
    assert.equal(sonuc.sinifli.length, 3);
    assert.ok(sonuc.sinifli.every((c) => c.sinif === "tip"), "tum crash'ler 'tip' olmali");
    assert.equal(sonuc.siniflar.tip, 3);
    assert.equal(sonuc.gruplar.length, 1);
    assert.equal(sonuc.gruplar[0].sayi, 3);
    assert.ok(sonuc.gruplar[0].imza.length > 0, "imza bos olmamali");
  });
});

describe("fuzz harness (b): hata -> sinif tablosu", () => {
  it("Error nesneleri + fuzz cikti metinleri dogru sinifa gider", () => {
    const durumlar = [
      [new RangeError("uzunluk tasti"), "aralik"],
      [new TypeError("okunamadi"), "tip"],
      [new SyntaxError("beklenmeyen belirtec"), "sozdizimi"],
      [new Error("Maximum call stack size exceeded"), "yigin-tasmasi"],
      [new RangeError("Maximum call stack size exceeded"), "yigin-tasmasi"],
      [new Error("JavaScript heap out of memory"), "bellek"],
      [new Error("garip bir durum"), "genel"],
      ["TypeError: okunamadi | at sahte-hedef (sahte.js:1:1)", "tip"],
      ["RangeError: uzunluk tasti | at sahte-hedef (sahte.js:2:3)", "aralik"],
      ["ciplak string firlatma", "bilinmeyen"],
      [42, "bilinmeyen"],
    ];
    for (const [hata, beklenen] of durumlar) {
      assert.equal(hatayiSiniflandir(hata).sinif, beklenen, `yanlis sinif: ${String(hata).slice(0, 60)}`);
    }
  });

  it("imza deterministik ve bos degil", () => {
    const a = hatayiSiniflandir(new TypeError("ayni mesaj"));
    const b = hatayiSiniflandir(new TypeError("ayni mesaj"));
    assert.ok(a.imza.length > 0);
    assert.equal(a.imza, b.imza);
    const c = hatayiSiniflandir(new RangeError("farkli mesaj"));
    assert.notEqual(a.imza, c.imza);
  });
});

describe("fuzz harness (c): gruplama", () => {
  it("ayni imza tek grup, sayiya gore azalan sira", () => {
    const g = crashlariGrupla([
      { imza: "tip:TypeError:x", sinif: "tip", hedef: "a" },
      { imza: "tip:TypeError:x", sinif: "tip", hedef: "b" },
      { imza: "genel:Error:y", sinif: "genel", hedef: "a" },
    ]);
    assert.equal(g.length, 2);
    assert.equal(g[0].sayi, 2);
    assert.equal(g[0].imza, "tip:TypeError:x");
    assert.equal(g[1].sayi, 1);
    assert.deepEqual([...g[0].hedefler].sort(), ["a", "b"]);
  });

  it("bos liste bos grup verir", () => {
    assert.deepEqual(crashlariGrupla([]), []);
  });
});

describe("fuzz harness (d): rapor tmpdir'e yazilir", () => {
  it("ozet.json + rapor.md olusur, corpus'a dokunulmaz", () => {
    const patlayan = {
      ad: "sahte-rapor-patlayan",
      tur: "sahte",
      cagir: () => { throw new Error("sahte rapor crash"); },
    };
    const sonuc = fuzzCalistir({
      tohumlar: { sahte: Buffer.from([0xde, 0xad, 0xbe, 0xef]) },
      hedefler: [patlayan],
      seed: 99,
      adet: 2,
      tekilTavanMs: 2000,
      toplamTavanMs: 60_000,
      reproDir: null,
    });
    const raporDir = mkdtempSync(join(tmpdir(), "fuzz-harness-rapor-"));
    const yazilan = raporYaz(sonuc, { raporDir, meta: { seed: 99, adet: 2 } });
    assert.ok(yazilan.ozetYol.startsWith(raporDir), "ozet rapor dizininde olmali");
    assert.ok(existsSync(yazilan.ozetYol), "ozet.json yazilmali");
    assert.ok(existsSync(yazilan.mdYol), "rapor.md yazilmali");
    const ozet = JSON.parse(readFileSync(yazilan.ozetYol, "utf8"));
    assert.equal(ozet.seed, 99);
    assert.equal(ozet.toplam, 2);
    assert.equal(ozet.crash, 2);
    const md = readFileSync(yazilan.mdYol, "utf8");
    assert.ok(md.includes("sahte-rapor-patlayan") || md.includes("crash"), "rapor bulguyu anmali");
    assert.deepEqual(readdirSync(corpusDir).sort(), corpusAnlik, "corpus kirlenmemeli");
  });
});

describe("fuzz harness (e): butce CI dostu", () => {
  it("varsayilan toplam tavan 60sn altinda", () => {
    assert.ok(VARSAYILANLAR.toplamTavanMs < 60_000, `tavan: ${VARSAYILANLAR.toplamTavanMs}ms`);
    assert.ok(VARSAYILANLAR.adet > 0 && VARSAYILANLAR.tekilTavanMs > 0);
  });

  it("yavas hedef hang sayilir (sahte hedef)", () => {
    const yavas = {
      ad: "sahte-yavas",
      tur: "sahte",
      cagir: () => {
        const bas = Date.now();
        while (Date.now() - bas < 120) { /* mesgul bekleme */ }
        return { ok: true };
      },
    };
    const sonuc = fuzzCalistir({
      tohumlar: { sahte: Buffer.from([1, 2, 3, 4]) },
      hedefler: [yavas],
      seed: 7,
      adet: 2,
      tekilTavanMs: 50,
      toplamTavanMs: 60_000,
      reproDir: null,
    });
    assert.equal(sonuc.hang, 2);
    assert.equal(sonuc.toplam, 2);
  });

  it("toplam tavan asimi atlanan sayar, kosu surunmez", () => {
    const yavas = {
      ad: "sahte-cok-yavas",
      tur: "sahte",
      cagir: () => {
        const bas = Date.now();
        while (Date.now() - bas < 120) { /* mesgul bekleme */ }
        return { ok: true };
      },
    };
    const sonuc = fuzzCalistir({
      tohumlar: { sahte: Buffer.from([5, 6, 7, 8]) },
      hedefler: [yavas],
      seed: 7,
      adet: 2,
      tekilTavanMs: 10_000,
      toplamTavanMs: 1,
      reproDir: null,
    });
    assert.equal(sonuc.toplam + sonuc.atlanan, 2);
    assert.ok(sonuc.atlanan >= 1, "tavan asiminda girdi atlanmali");
    assert.ok(sonuc.ms < 30_000, `kosu surunmemeli: ${sonuc.ms}ms`);
  });
});

describe("fuzz harness (f): gercek parser kosusu tutarli", () => {
  it("kucuk butcede sayilar tutarli, sinif toplami crash'e esit", () => {
    const sonuc = fuzzCalistir({
      tohumlar,
      hedefler,
      seed: 1,
      adet: 5,
      tekilTavanMs: 2000,
      toplamTavanMs: 60_000,
      reproDir: null,
    });
    assert.equal(sonuc.toplam, 5 * hedefler.length);
    assert.equal(typeof sonuc.crash, "number");
    assert.equal(sonuc.sinifli.length, sonuc.crash);
    const sinifToplam = Object.values(sonuc.siniflar).reduce((a, b) => a + b, 0);
    assert.equal(sinifToplam, sonuc.crash);
    assert.ok(sonuc.ms < 60_000, `kosu tavani asmali: ${sonuc.ms}ms`);
    assert.deepEqual(readdirSync(corpusDir).sort(), corpusAnlik, "corpus kirlenmemeli");
  });
});
