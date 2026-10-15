// tests/parser-fuzz.test.mjs: Dalga H/1 — PE/ELF/WASM/DWARF parser fuzz CI smoke (TDD).
// Koş: önce `npm run build` (dist parser'ları için), sonra `node tests/parser-fuzz.test.mjs`.
// Kapsam:
//  (a) Geçerli girdi crash vermez (corpus fixture'ları hedeflerde throw atmaz).
//  (b) Bozuk girdilerde crash yok (mutasyonlarda throw=0; dürüst ok:false beklenir).
//  (c) Hang yok (tekil çağrı + toplam koşu tavanı aşılmaz).
//  (d) Crash bulan girdi repro dosyasına yazılır (sahte hedefle, tmpdir'e).
//  (e) Seed deterministik (iki koşu aynı digest/crash/hang).
// Not: tests/corpus'a ASLA yazılmaz; mutasyonlar + repro'lar geçici dizindedir.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  tohumlariOku,
  mutasyonUret,
  varsayilanHedefler,
  fuzzKos,
} from "../scripts/fuzz-parsers.mjs";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const corpusDir = join(kok, "tests", "corpus");

// Fuzz bütçesi: CI smoke — küçük, hızlı, deterministik.
const ADET = 20;
const TEKIL_TAVAN_MS = 2000;
const TOPLAM_TAVAN_MS = 60_000;

let tohumlar;
let hedefler;
before(() => {
  tohumlar = tohumlariOku(corpusDir);
  hedefler = varsayilanHedefler();
});

describe("parser fuzz (a): gecerli girdi crash vermez", () => {
  it("corpus tohumlari tum hedeflerde throw atmaz", () => {
    assert.ok(tohumlar.pe.length > 0, "pe tohumu bos olmamali");
    assert.ok(tohumlar.elf.length > 0, "elf tohumu bos olmamali");
    assert.ok(tohumlar.wasm.length > 0, "wasm tohumu bos olmamali");
    let cagri = 0;
    for (const h of hedefler) {
      const girdi = tohumlar[h.tur];
      assert.ok(girdi, `${h.ad}: tur tohumu bulunamadi`);
      assert.doesNotThrow(() => h.cagir(girdi), `${h.ad} gecerli girdide throw atmamali`);
      cagri++;
    }
    // Gercek deger: hedef listesi uzunlugu (pe:3 + dwarf:1 + wasm:2 = 6).
    assert.equal(cagri, hedefler.length);
    assert.equal(hedefler.length, 6);
  });
});

describe("parser fuzz (b): bozuk girdilerde crash yok", () => {
  it("mutasyonlarda throw=0, sonuc sayilari tutarli", () => {
    const seed = 0xC10C;
    const sonuc = fuzzKos({
      tohumlar,
      hedefler,
      seed,
      adet: ADET,
      tekilTavanMs: TEKIL_TAVAN_MS,
      toplamTavanMs: TOPLAM_TAVAN_MS,
      reproDir: null,
    });
    assert.equal(sonuc.crash, 0, `crash bulundu: ${JSON.stringify(sonuc.crashes.slice(0, 3))}`);
    // Gercek deger: her tur icin ADET girdi x o turun hedefleri.
    const turHedef = new Map();
    for (const h of hedefler) turHedef.set(h.tur, (turHedef.get(h.tur) ?? 0) + 1);
    let beklenen = 0;
    for (const n of turHedef.values()) beklenen += ADET * n;
    assert.equal(sonuc.toplam, beklenen);
    assert.equal(sonuc.toplam, ADET * hedefler.length);
    assert.equal(sonuc.atlanan, 0, "toplam tavana takilip girdi atlanmamali");
  });
});

describe("parser fuzz (c): hang yok", () => {
  it("tekil + toplam tavan asilmaz", () => {
    const seed = 1234;
    const sonuc = fuzzKos({
      tohumlar,
      hedefler,
      seed,
      adet: ADET,
      tekilTavanMs: TEKIL_TAVAN_MS,
      toplamTavanMs: TOPLAM_TAVAN_MS,
      reproDir: null,
    });
    assert.equal(sonuc.hang, 0, `hang bulundu: ${JSON.stringify(sonuc.hanglar.slice(0, 3))}`);
    assert.ok(sonuc.ms < TOPLAM_TAVAN_MS, `toplam sure tavani asti: ${sonuc.ms}ms`);
    for (const h of sonuc.hanglar) assert.ok(h.ms < TEKIL_TAVAN_MS || false, "hang listesi bos olmali");
  });

  it("yavas hedef hang sayilir ve tavan asimi raporlanir (sahte hedef)", () => {
    const yavas = {
      ad: "sahte-yavas",
      tur: "sahte",
      cagir: () => {
        const bas = Date.now();
        while (Date.now() - bas < 120) { /* mesgul bekleme */ }
        return { ok: true };
      },
    };
    const sonuc = fuzzKos({
      tohumlar: { sahte: Buffer.from([1, 2, 3, 4]) },
      hedefler: [yavas],
      seed: 7,
      adet: 2,
      tekilTavanMs: 50,
      toplamTavanMs: TOPLAM_TAVAN_MS,
      reproDir: null,
    });
    assert.equal(sonuc.hang, 2);
    assert.equal(sonuc.toplam, 2);
  });
});

describe("parser fuzz (d): repro dosyasi yazilir", () => {
  it("crash bulan girdi repro dizinine birebir yazilir (sahte hedef)", () => {
    const reproDir = mkdtempSync(join(tmpdir(), "fuzz-repro-"));
    const patlayan = {
      ad: "sahte-patlayan",
      tur: "sahte",
      cagir: () => { throw new Error("sahte crash"); },
    };
    const tohum = { sahte: Buffer.from([0xde, 0xad, 0xbe, 0xef]) };
    const sonuc = fuzzKos({
      tohumlar: tohum,
      hedefler: [patlayan],
      seed: 99,
      adet: 3,
      tekilTavanMs: TEKIL_TAVAN_MS,
      toplamTavanMs: TOPLAM_TAVAN_MS,
      reproDir,
    });
    assert.equal(sonuc.crash, 3);
    assert.equal(sonuc.reprolar.length, 3);
    // Ilk girdinin digest'i + repro icerigi birebir tutmali.
    const ilk = mutasyonUret(tohum.sahte, 99, 3)[0];
    const ilkYol = sonuc.reprolar[0];
    assert.ok(existsSync(ilkYol), "repro dosyasi yazilmali");
    assert.deepEqual(readFileSync(ilkYol), ilk);
  });
});

describe("parser fuzz (e): seed deterministik", () => {
  it("iki kosu ayni digest/crash/hang verir", () => {
    const seed = 4242;
    const kos = () => fuzzKos({
      tohumlar,
      hedefler,
      seed,
      adet: ADET,
      tekilTavanMs: TEKIL_TAVAN_MS,
      toplamTavanMs: TOPLAM_TAVAN_MS,
      reproDir: null,
    });
    const a = kos();
    const b = kos();
    assert.deepEqual(a.digestler, b.digestler);
    assert.equal(a.crash, b.crash);
    assert.equal(a.hang, b.hang);
    assert.equal(a.toplam, b.toplam);
    // Gercek deger: digest sayisi = uretilen girdi sayisi (tur x adet).
    const turSayisi = new Set(hedefler.map((h) => h.tur)).size;
    assert.equal(a.digestler.length, turSayisi * ADET);
    assert.equal(turSayisi, 3);
  });

  it("farkli seed farkli mutasyon uretir", () => {
    const taban = Buffer.from("0061736d01000000", "hex");
    const x = mutasyonUret(taban, 1, 10);
    const y = mutasyonUret(taban, 2, 10);
    assert.equal(x.length, 10);
    const ayni = x.filter((b, i) => b.equals(y[i])).length;
    assert.ok(ayni < 10, "farkli seed ayni diziyi uretmemeli");
  });
});
