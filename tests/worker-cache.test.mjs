// worker-cache.test.mjs: kalıcı worker + sonuç cache testi (Dalga C/3, node:test).
// Koş: npm run build sonrası `node --test tests/worker-cache.test.mjs` (tsc emit şart).
// Kapsam: (a) aynı soru ikinci kez cache'ten (vuruş sayacı + hız),
// (b) dosya değişince geçersizlenir, (c) farklı argüman ayrı anahtar,
// (d) REA_CACHE=0'da davranış aynı, (e) LRU taşması en eskiyi düşürür,
// + kalıcı havuz yeniden kullanımı, hata cache'lenmez, dosya hash kararlılığı.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResultCache, WorkerPool, dosyaHashi, runProbes } from "../dist/facade/workerCache.js";
import { rea_scan_repo, reposcanSonucCache, reposcanIsciHavuzu } from "../dist/rea-domains/reposcan/RepoScan.js";

// Kısa uyku: cache ıskalamadaki pahalı işi taklit eder.
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
// Taze tmp dizini üretir (repo kirlenmez).
const taze = (one) => mkdtempSync(join(tmpdir(), `rea-worker-${one}-`));

describe("ResultCache (a) aynı soru ikinci kez cache'ten", () => {
  it("ikinci çağrı üreticiyi koşturmaz, vuruş sayar, belirgin hızlıdır", async () => {
    const cache = new ResultCache(100);
    let sayac = 0;
    const girdi = { arac: "ornek-arac", argumanlar: { derinlik: 1 } };
    const uret = async () => {
      sayac++;
      await bekle(50);
      return { tip: "pe", motor: "x64dbg" };
    };
    const ilk = await cache.calistir(girdi, uret);
    assert.deepEqual(ilk, { tip: "pe", motor: "x64dbg" });
    assert.equal(sayac, 1);
    const t0 = Date.now();
    const ikinci = await cache.calistir(girdi, uret);
    const gecen = Date.now() - t0;
    assert.deepEqual(ikinci, ilk);
    assert.equal(sayac, 1); // üretici ikinci kez koşmadı
    assert.equal(cache.vurus, 1);
    assert.equal(cache.iskalama, 1);
    assert.ok(gecen < 25, `cache vuruşu (${gecen}ms) 50ms'lik işten hızlı olmalı`);
  });
});

describe("ResultCache (b) dosya değişince geçersizlenir", () => {
  it("içerik değişince yeniden hesaplar, yeni sonucu döner", async () => {
    const dir = taze("gecersiz");
    try {
      const dosya = join(dir, "ornek.bin");
      writeFileSync(dosya, "v1-icerik");
      const cache = new ResultCache();
      let sayac = 0;
      const uret = async () => {
        sayac++;
        return `${readFileSync(dosya, "utf8")}#${sayac}`;
      };
      const girdi = { dosya, arac: "isleyici", argumanlar: {} };
      assert.equal(await cache.calistir(girdi, uret), "v1-icerik#1");
      assert.equal(await cache.calistir(girdi, uret), "v1-icerik#1"); // vuruş
      assert.equal(sayac, 1);
      writeFileSync(dosya, "v2-icerik"); // dosya değişti
      assert.equal(await cache.calistir(girdi, uret), "v2-icerik#2"); // ıskalama
      assert.equal(sayac, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ResultCache (c) farklı argüman ayrı anahtar", () => {
  it("argüman değişince ayrı hesaplar, ilk argümana dönüş vuruştan gelir", async () => {
    const cache = new ResultCache();
    let sayac = 0;
    const uret = async (etiket) => {
      sayac++;
      return `sonuc-${etiket}`;
    };
    const a = { arac: "cozucu", argumanlar: { derinlik: 1 } };
    const b = { arac: "cozucu", argumanlar: { derinlik: 2 } };
    assert.equal(await cache.calistir(a, () => uret("a1")), "sonuc-a1");
    assert.equal(await cache.calistir(b, () => uret("b1")), "sonuc-b1");
    assert.equal(sayac, 2); // ayrı anahtarlar
    assert.equal(await cache.calistir(a, () => uret("a2")), "sonuc-a1"); // a vuruşu
    assert.equal(sayac, 2);
    assert.equal(cache.vurus, 1);
  });
});

describe("ResultCache (d) REA_CACHE=0 bypass", () => {
  it("kapalıyken her çağrı hesaplar ama sonuç birebir aynıdır", async () => {
    const eski = process.env.REA_CACHE;
    try {
      const girdi = { arac: "saf-arac", argumanlar: { k: 7 } };
      const uret = async () => ({ deger: 42, liste: [1, 2, 3] });
      delete process.env.REA_CACHE;
      const acik = new ResultCache();
      const beklenen = await acik.calistir(girdi, uret);
      process.env.REA_CACHE = "0";
      const kapali = new ResultCache();
      let sayac = 0;
      const yavasUret = async () => {
        sayac++;
        await bekle(10);
        return { deger: 42, liste: [1, 2, 3] };
      };
      const r1 = await kapali.calistir(girdi, yavasUret);
      const r2 = await kapali.calistir(girdi, yavasUret);
      assert.deepEqual(r1, beklenen); // davranış birebir aynı
      assert.deepEqual(r2, beklenen);
      assert.equal(sayac, 2); // cache yazılmadı/okunmadı
      assert.equal(kapali.vurus, 0);
      assert.equal(kapali.boyut(), 0);
    } finally {
      if (eski === undefined) delete process.env.REA_CACHE;
      else process.env.REA_CACHE = eski;
    }
  });
});

describe("ResultCache (e) LRU taşması", () => {
  it("kapasite aşımında en eski (kullanılmayan) girdi düşer", async () => {
    const cache = new ResultCache(3);
    assert.equal(cache.kapasite, 3);
    let sayac = 0;
    const sor = (i) =>
      cache.calistir({ arac: "t", argumanlar: { i } }, async () => {
        sayac++;
        return `d${i}`;
      });
    assert.equal(await sor(0), "d0");
    assert.equal(await sor(1), "d1");
    assert.equal(await sor(2), "d2");
    assert.equal(sayac, 3);
    assert.equal(await sor(0), "d0"); // 0 tazelenir (vuruş); sıra: 1,2,0
    assert.equal(sayac, 3);
    assert.equal(await sor(3), "d3"); // taşma: en eski (1) düşer; sıra: 2,0,3
    assert.equal(sayac, 4);
    assert.equal(cache.boyut(), 3);
    assert.equal(await sor(0), "d0"); // 0 hâlâ içeride (vuruş)
    assert.equal(sayac, 4);
    assert.equal(await sor(1), "d1"); // 1 düşmüştü: yeniden hesap
    assert.equal(sayac, 5);
  });
  it("varsayılan kapasite 100 girdidir", () => {
    assert.equal(new ResultCache().kapasite, 100);
  });
});

describe("ResultCache sağlamlık", () => {
  it("üretici hatası cache'lenmez; sonraki çağrı yeniden dener", async () => {
    const cache = new ResultCache();
    let sayac = 0;
    const girdi = { arac: "bozuk", argumanlar: null };
    await assert.rejects(
      cache.calistir(girdi, async () => {
        sayac++;
        throw new Error("gecici ariza");
      }),
      /gecici ariza/,
    );
    assert.equal(await cache.calistir(girdi, async () => {
      sayac++;
      return "duzeldi";
    }), "duzeldi");
    assert.equal(sayac, 2);
    assert.equal(await cache.calistir(girdi, async () => {
      sayac++;
      return "asla";
    }), "duzeldi"); // artık vuruş
    assert.equal(sayac, 2);
  });
  it("dosyaHashi aynı bayta aynı, farklı bayta farklı özet verir", async () => {
    const dir = taze("hash");
    try {
      const dosya = join(dir, "a.bin");
      writeFileSync(dosya, "ayni");
      const h1 = await dosyaHashi(dosya);
      const h2 = await dosyaHashi(dosya);
      assert.equal(h1, h2);
      assert.match(h1, /^[0-9a-f]{64}$/);
      writeFileSync(dosya, "farkli");
      assert.notEqual(await dosyaHashi(dosya), h1);
      await assert.rejects(dosyaHashi(join(dir, "yok.bin")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("WorkerPool kalıcılık", () => {
  it("tek havuz 6 işi limit 2 ile koşar, sonra ikinci dalgayı da aynı havuz kaldırır", async () => {
    const havuz = new WorkerPool(2);
    let anlik = 0;
    let enYuksek = 0;
    const is = (i) => async () => {
      anlik++;
      enYuksek = Math.max(enYuksek, anlik);
      await bekle(20);
      anlik--;
      return i;
    };
    const ilk = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => havuz.gonder(is(i))));
    assert.deepEqual(ilk, [0, 1, 2, 3, 4, 5]);
    assert.ok(enYuksek <= 2, `eşzaman ${enYuksek} ≤ 2 olmalı`);
    assert.ok(enYuksek >= 2, `paralellik gerçekten kullanılmalı (${enYuksek})`);
    assert.equal(havuz.tamamlanan, 6);
    // Kalıcılık kanıtı: yeni havuz yok, aynı örnek ikinci dalgayı koşar.
    const ikinci = await Promise.all([6, 7].map((i) => havuz.gonder(is(i))));
    assert.deepEqual(ikinci, [6, 7]);
    assert.equal(havuz.tamamlanan, 8);
    await havuz.kapat();
    await assert.rejects(havuz.gonder(async () => 1), /kapalı/);
  });
  it("cache ıskalaması havuzu kullanır, vuruş havuza dokunmaz", async () => {
    const cache = new ResultCache();
    const havuz = new WorkerPool(2);
    try {
      let sayac = 0;
      const girdi = { arac: "w", argumanlar: { k: 1 } };
      const uret = async () => {
        sayac++;
        return "w-sonuc";
      };
      assert.equal(await cache.calistir(girdi, uret, havuz), "w-sonuc");
      assert.equal(await cache.calistir(girdi, uret, havuz), "w-sonuc");
      assert.equal(sayac, 1);
      assert.equal(havuz.tamamlanan, 1); // yalnız ıskalama havuza indi
    } finally {
      await havuz.kapat();
    }
  });
});

describe("RepoScan canli worker-cache bagi (Dalga I/2)", () => {
  // Baglanan yol: rea_scan_repo dosya cozumunu paylasilan ResultCache +
  // kalici WorkerPool uzerinden kosar. Sayac kaniti = cache/havuz delta'lari.
  // (Turkce karaktersiz yazildi: dosya duzeni ASCII kilitli.)
  const h = (hex) => Buffer.from(hex, "hex");
  function besliSahne(one) {
    const dir = taze(`bag-${one}`);
    writeFileSync(join(dir, "uygulama.exe"), h("4d5a900003000000"));
    writeFileSync(join(dir, "kitaplik.elf"), h("7f454c4602010100"));
    writeFileSync(join(dir, "mobil.apk"), h("504b030414000000"));
    writeFileSync(join(dir, "index.js"), `console.log('${one}');\n`);
    writeFileSync(join(dir, "mod.wasm"), h("0061736d01000000"));
    return dir;
  }

  it("(a) ikinci tarama cache'ten gelir: 5 iskalama, sonra 5 vurus; havuz yalniz ilk turda 5 is yapar", async () => {
    const dir = besliSahne("a");
    try {
      const v0 = reposcanSonucCache.vurus;
      const i0 = reposcanSonucCache.iskalama;
      const h0 = reposcanIsciHavuzu.tamamlanan;
      const ilk = await rea_scan_repo(dir);
      assert.equal(ilk.ok, true);
      assert.equal(ilk.details.dosyalar.length, 5);
      assert.equal(reposcanSonucCache.iskalama - i0, 5);
      assert.equal(reposcanSonucCache.vurus - v0, 0);
      assert.equal(reposcanIsciHavuzu.tamamlanan - h0, 5);
      const v1 = reposcanSonucCache.vurus;
      const i1 = reposcanSonucCache.iskalama;
      const h1 = reposcanIsciHavuzu.tamamlanan;
      const ikinci = await rea_scan_repo(dir);
      assert.equal(ikinci.ok, true);
      assert.deepEqual(ikinci, ilk); // davranis birebir ayni
      assert.equal(reposcanSonucCache.vurus - v1, 5); // sayac kaniti
      assert.equal(reposcanSonucCache.iskalama - i1, 0);
      assert.equal(reposcanIsciHavuzu.tamamlanan - h1, 0); // vurus havuza inmez
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("(c) REA_CACHE=0 iken tarama baypaslanir: sayaclar kipirdamaz, sonuc aynidir", async () => {
    const eski = process.env.REA_CACHE;
    const dir = besliSahne("c");
    try {
      const acik = await rea_scan_repo(dir);
      assert.equal(acik.ok, true);
      process.env.REA_CACHE = "0";
      const v0 = reposcanSonucCache.vurus;
      const i0 = reposcanSonucCache.iskalama;
      const b0 = reposcanSonucCache.boyut();
      const r1 = await rea_scan_repo(dir);
      const r2 = await rea_scan_repo(dir);
      assert.deepEqual(r1, acik);
      assert.deepEqual(r2, acik);
      assert.equal(reposcanSonucCache.vurus - v0, 0);
      assert.equal(reposcanSonucCache.iskalama - i0, 0);
      assert.equal(reposcanSonucCache.boyut(), b0);
    } finally {
      if (eski === undefined) delete process.env.REA_CACHE;
      else process.env.REA_CACHE = eski;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("WorkerPool hata izolasyonu (runProbes karsiligi, Dalga I/2)", () => {
  // probe.test.mjs'deki "firlatan prob digerlerini durdurmaz" kapsami,
  // olu parallelProbe silinmeden once yeni yola tasindi: kalici havuzda
  // patlayan is reddedilir, saglamlar cozulur, havuz kullanilabilir kalir.
  it("patlayan is digerlerini durdurmaz, havuz saglam kalir", async () => {
    const havuz = new WorkerPool(2);
    try {
      const iyi1 = havuz.gonder(async () => "bir");
      const kotu = havuz.gonder(async () => {
        throw new Error("sahte patlama");
      });
      const iyi2 = havuz.gonder(async () => "iki");
      assert.equal(await iyi1, "bir");
      await assert.rejects(kotu, /sahte patlama/);
      assert.equal(await iyi2, "iki");
      assert.equal(havuz.tamamlanan, 3);
      assert.equal(await havuz.gonder(async () => "uc"), "uc");
      assert.equal(havuz.tamamlanan, 4);
    } finally {
      await havuz.kapat();
    }
  });
});

// ---- Dalga-1 tasima (KIRMIZI): probeCache davranisi ResultCache'te (TTL + invalidate/clear).
// Kaynak: tests/probe.test.mjs (silik oncesi) — ayni sinir semantigi: now > olum bayat, esit an taze.
// Karsilik: withCache <=> calistir (taze iken uretici kosmaz, bayatlayinca yeniden kosar).
describe("ResultCache TTL (probeCache karsiligi, Dalga-1)", () => {
  const saatli = (ttlMs, baslangic = 1000, kapasite = 100) => {
    let simdi = baslangic;
    const cache = new ResultCache(kapasite, ttlMs, () => simdi);
    return { cache, ilerlet: (ms) => (simdi += ms) };
  };
  const girdi = (k) => ({ arac: "yoklama", argumanlar: { k } });

  it("taze kayit has ile bulunur, calistir ureticiyi tekrar kosturmaz", async () => {
    const { cache } = saatli(60_000);
    let sayac = 0;
    const uret = async () => ++sayac;
    assert.equal(await cache.calistir(girdi("node"), uret), 1);
    assert.equal(await cache.has(girdi("node")), true);
    assert.equal(await cache.calistir(girdi("node"), uret), 1);
    assert.equal(sayac, 1);
  });
  it("TTL dolunca has false doner, calistir yeniden hesaplar", async () => {
    const { cache, ilerlet } = saatli(1000);
    let sayac = 0;
    const uret = async () => ++sayac;
    assert.equal(await cache.calistir(girdi("r2"), uret), 1);
    ilerlet(1001);
    assert.equal(await cache.has(girdi("r2")), false);
    assert.equal(await cache.calistir(girdi("r2"), uret), 2);
    assert.equal(sayac, 2);
  });
  it("sinir aninda (TTL dolmadan) kayit tazedir", async () => {
    const { cache, ilerlet } = saatli(1000);
    await cache.calistir(girdi("dot"), async () => "v2");
    ilerlet(999);
    assert.equal(await cache.has(girdi("dot")), true);
    assert.equal(await cache.calistir(girdi("dot"), async () => "asla"), "v2");
  });
  it("invalidate tek girdiyi siler, digerini korur", async () => {
    const { cache } = saatli(60_000);
    await cache.calistir(girdi("a"), async () => 1);
    await cache.calistir(girdi("b"), async () => 2);
    assert.equal(await cache.invalidate(girdi("a")), true);
    assert.equal(await cache.has(girdi("a")), false);
    assert.equal(await cache.calistir(girdi("b"), async () => 99), 2);
  });
  it("clear tum kayitlari siler", async () => {
    const { cache } = saatli(60_000);
    await cache.calistir(girdi("a"), async () => 1);
    await cache.calistir(girdi("b"), async () => 2);
    cache.clear();
    assert.equal(await cache.has(girdi("a")), false);
    assert.equal(await cache.has(girdi("b")), false);
    assert.equal(cache.boyut(), 0);
  });
  it("withCache karsiligi: taze iken uretici tek kez kosar", async () => {
    const { cache } = saatli(60_000);
    let sayac = 0;
    const probe = () => ++sayac;
    assert.equal(await cache.calistir(girdi("java"), probe), 1);
    assert.equal(await cache.calistir(girdi("java"), probe), 1);
    assert.equal(sayac, 1);
  });
  it("withCache karsiligi: bayatlayinca uretici yeniden kosar", async () => {
    const { cache, ilerlet } = saatli(1000);
    let sayac = 0;
    const probe = () => ++sayac;
    assert.equal(await cache.calistir(girdi("adb"), probe), 1);
    ilerlet(1500);
    assert.equal(await cache.calistir(girdi("adb"), probe), 2);
    assert.equal(sayac, 2);
  });
  it("withCache karsiligi: async uretici sonucunu saklar", async () => {
    const { cache } = saatli(60_000);
    const deger = await cache.calistir(girdi("wabt"), async () => {
      await bekle(10);
      return "2.0";
    });
    assert.equal(deger, "2.0");
    assert.equal(await cache.calistir(girdi("wabt"), async () => "asla"), "2.0");
  });
});

describe("runProbes (canli havuz ustu, Dalga-1)", () => {
  // Kaynak: tests/probe.test.mjs — ayni limit/hiz/hata/sure/bos-kayit kapsami,
  // artik olu parallelProbe yerine WorkerPool destekli workerCache.runProbes'tan.
  it("8 is seri sureden hizli biter (limit 4)", async () => {
    const isler = {};
    for (let i = 0; i < 8; i++) isler[`p${i}`] = () => bekle(60).then(() => i);
    const bas = Date.now();
    const sonuc = await runProbes(isler, 4);
    const gecen = Date.now() - bas;
    assert.equal(Object.keys(sonuc).length, 8); // hepsi raporlanir
    assert.ok(gecen < 400, `paralel ${gecen}ms < seri 480ms olmali`);
    for (let i = 0; i < 8; i++) assert.equal(sonuc[`p${i}`].deger, i);
  });
  it("paralellik limitine saygi gosterir (en yuksek eszaman <= limit)", async () => {
    let anlik = 0;
    let enYuksek = 0;
    const isler = {};
    for (let i = 0; i < 5; i++) {
      isler[`k${i}`] = async () => {
        anlik++;
        enYuksek = Math.max(enYuksek, anlik);
        await bekle(30);
        anlik--;
        return i;
      };
    }
    await runProbes(isler, 2);
    assert.ok(enYuksek <= 2, `eszaman ${enYuksek} <= 2 olmali`);
    assert.ok(enYuksek >= 2, `paralellik gercekten kullanilmali (${enYuksek})`);
  });
  it("firlatan isi ok:false + hata ile yakalar, digerleri surer", async () => {
    const sonuc = await runProbes(
      {
        iyi: () => "tamam",
        kotu: () => {
          throw new Error("yok");
        },
        red: () => Promise.reject(new Error("erisim yok")),
      },
      4,
    );
    assert.equal(sonuc.iyi.ok, true);
    assert.equal(sonuc.iyi.deger, "tamam");
    assert.equal(sonuc.kotu.ok, false);
    assert.equal(sonuc.kotu.hata, "yok");
    assert.equal(sonuc.red.ok, false);
    assert.ok(sonuc.red.hata.includes("erisim"));
  });
  it("her sonucu sure damgasiyla doner (sure_ms >= 0)", async () => {
    const sonuc = await runProbes({ hizli: () => 42 }, 4);
    assert.equal(sonuc.hizli.ok, true);
    assert.equal(sonuc.hizli.deger, 42);
    assert.ok(typeof sonuc.hizli.sure_ms === "number" && sonuc.hizli.sure_ms >= 0);
  });
  it("bos is kaydi bos sonuc doner", async () => {
    assert.deepEqual(await runProbes({}, 4), {});
  });
});
