// parallel-scan.test.mjs: 4'lü paralel tarama — sıra, iptal, hata izolasyonu, tavan.
// Koş: npm run build sonrası `node --test tests/parallel-scan.test.mjs` (tsc emit şart).
// Fixture'lar yalnız geçici dizinde üretilir; tests/corpus'a dokunulmaz.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PARALEL_TAVAN,
  havuzlaTara,
  rea_scan_repo,
  rea_scan_repo_paralel,
} from "../dist/rea-domains/reposcan/RepoScan.js";

function taze(one) {
  return mkdtempSync(join(tmpdir(), `rea-paralel-${one}-`));
}

const b = (hex) => Buffer.from(hex, "hex");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// 8 dosyalık karışık sahne: 2 pe + 2 elf + 1 apk + 2 js + 1 wasm.
function sekizliSahne() {
  const dir = taze("sekizli");
  writeFileSync(join(dir, "a1.exe"), b("4d5a900003000000"));
  writeFileSync(join(dir, "a2.dll"), b("4d5a900003000000"));
  writeFileSync(join(dir, "b1.elf"), b("7f454c4602010100"));
  writeFileSync(join(dir, "b2.so"), b("7f454c4602010100"));
  writeFileSync(join(dir, "c1.apk"), b("504b030414000000"));
  writeFileSync(join(dir, "d1.js"), "console.log('bir');\n");
  writeFileSync(join(dir, "d2.mjs"), "export const x = 1;\n");
  writeFileSync(join(dir, "e1.wasm"), b("0061736d01000000"));
  return dir;
}

function siraliMi(dosyalar) {
  return dosyalar.every((d, i, a) => i === 0 || a[i - 1].yol <= d.yol);
}

describe("paralel tarama kuyruğu (4'lü)", () => {
  it("tavan sabiti 4'tür", () => {
    assert.equal(PARALEL_TAVAN, 4);
  });

  it("(a) 4'lü paralelde sonuçlar sıralı ve eksiksiz", async () => {
    const dir = sekizliSahne();
    try {
      const r = await rea_scan_repo_paralel(dir, { eszamanlilik: 4 });
      assert.equal(r.ok, true);
      assert.equal(r.details.dosyalar.length, 8);
      assert.ok(siraliMi(r.details.dosyalar), "paralel koşuma rağmen yol sırası deterministik olmalı");
      const toplam = Object.values(r.details.tipler).reduce((a, v) => a + v, 0);
      assert.equal(toplam, 8);
      assert.deepEqual(r.details.tipler, { pe: 2, elf: 2, apk: 1, js: 2, wasm: 1 });
      assert.equal(r.details.planlar.length, 8);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("(a2) seri/paralel aynı kümeyi verir", async () => {
    const dir = sekizliSahne();
    try {
      const seri = await rea_scan_repo(dir);
      const paralel = await rea_scan_repo_paralel(dir, { eszamanlilik: 4 });
      assert.equal(seri.ok, true);
      assert.equal(paralel.ok, true);
      assert.deepEqual(paralel.details.dosyalar, seri.details.dosyalar);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("(b) iptal kalanı düşürür, yapılanı korur", async () => {
    const isler = Array.from({ length: 12 }, (_, i) => i);
    const ac = new AbortController();
    let biten = 0;
    const r = await havuzlaTara(
      isler,
      async (n) => {
        await bekle(30);
        biten += 1;
        if (biten === 3) ac.abort(); // 3 iş bitince iptal ateşe
        return n * 10;
      },
      { eszamanlilik: 4, sinyal: ac.signal },
    );
    assert.equal(r.iptalEdildi, true);
    assert.ok(r.sonuclar.length >= 3, `yapılanlar korunmalı (biten=${r.sonuclar.length})`);
    assert.ok(r.sonuclar.length < 12, "kalan işler düşmeli");
    assert.ok(r.baslatilan < 12, `başlatılmayan iş kalmalı (başlatılan=${r.baslatilan})`);
    // Korunanlar input sırasındadır.
    assert.deepEqual([...r.sonuclar].sort((a, b) => a - b), r.sonuclar);
  });

  it("(c) bozuk dosya diğerlerini durdurmaz + listelenir", async () => {
    const dir = taze("bozuk");
    try {
      const adlar = ["saglam1.js", "saglam2.js", "saglam3.js", "saglam4.js", "bozuk.js"];
      for (const a of adlar) writeFileSync(join(dir, a), `// ${a}\n`);
      const r = await rea_scan_repo_paralel(dir, {
        eszamanlilik: 4,
        dosyaTara: async (tam, kok) => {
          if (tam.endsWith("bozuk.js")) throw new Error("sahte okuma patlaması");
          const yol = tam.slice(kok.length + 1).replace(/\\/g, "/");
          return { yol, tip: "js", motor: "js" };
        },
      });
      assert.equal(r.ok, true);
      assert.equal(r.details.dosyalar.length, 4);
      assert.ok(r.details.dosyalar.every((d) => d.yol !== "bozuk.js"));
      assert.equal(r.details.hatalar.length, 1);
      assert.equal(r.details.hatalar[0].yol, "bozuk.js");
      assert.ok(r.details.hatalar[0].hata.length > 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("(d) eşzamanlılık tavanı aşılmaz (ölçülü)", async () => {
    const isler = Array.from({ length: 12 }, (_, i) => i);
    let aktif = 0;
    let zirve = 0;
    const r = await havuzlaTara(
      isler,
      async (n) => {
        aktif += 1;
        zirve = Math.max(zirve, aktif);
        await bekle(25);
        aktif -= 1;
        return n;
      },
      { eszamanlilik: 4 },
    );
    assert.equal(r.iptalEdildi, false);
    assert.equal(r.sonuclar.length, 12);
    assert.deepEqual(r.sonuclar, isler, "sonuçlar girdi sırasında dönmeli");
    assert.ok(zirve <= 4, `tavan aşılmamalı (zirve=${zirve})`);
    assert.ok(zirve > 1, `gerçekten paralel koşmalı (zirve=${zirve})`);
  });

  it("(d2) tavan parametrik: 2 verilirse 2 aşılmaz", async () => {
    const isler = Array.from({ length: 8 }, (_, i) => i);
    let aktif = 0;
    let zirve = 0;
    const r = await havuzlaTara(
      isler,
      async (n) => {
        aktif += 1;
        zirve = Math.max(zirve, aktif);
        await bekle(15);
        aktif -= 1;
        return n;
      },
      { eszamanlilik: 2 },
    );
    assert.equal(r.sonuclar.length, 8);
    assert.ok(zirve <= 2, `tavan=2 aşılmamalı (zirve=${zirve})`);
  });
});
