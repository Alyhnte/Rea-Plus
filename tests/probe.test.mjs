// probe.test.mjs: ProbeCache + runProbes testi (node:test).
// Koş: npm run build sonrası `node --test tests/probe.test.mjs`.
// Kapsam: TTL taze/stale/invalidate/clear, withCache tek çağrı,
// paralel hız, limit saygısı, hata yakalama, süre ölçümü.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ProbeCache, withCache } from "../dist/facade/probeCache.js";
import { runProbes } from "../dist/facade/parallelProbe.js";
// Kısa uyku: paralel zamanlama testleri için gerçek async gecikme.
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
// Enjekte saat: now el ile ilerletilir, TTL deterministik test edilir.
function saatli(ttlMs, baslangic = 1000) {
  let simdi = baslangic;
  const cache = new ProbeCache(ttlMs, () => simdi);
  return { cache, ilerlet: (ms) => (simdi += ms) };
}
describe("ProbeCache", () => {
  it("taze kayıt get/has ile döner", () => {
    const { cache } = saatli(60_000);
    cache.set("node", "v22");
    assert.equal(cache.get("node"), "v22");
    assert.equal(cache.has("node"), true);
  });
  it("TTL dolunca get undefined, has false döner", () => {
    const { cache, ilerlet } = saatli(1000);
    cache.set("r2", "v1");
    ilerlet(1001);
    assert.equal(cache.get("r2"), undefined);
    assert.equal(cache.has("r2"), false);
  });
  it("sınır anında (TTL dolmadan) kayıt tazedir", () => {
    const { cache, ilerlet } = saatli(1000);
    cache.set("dot", "v2");
    ilerlet(999);
    assert.equal(cache.has("dot"), true);
    assert.equal(cache.get("dot"), "v2");
  });
  it("invalidate tek anahtarı siler, diğerini korur", () => {
    const { cache } = saatli(60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.invalidate("a");
    assert.equal(cache.has("a"), false);
    assert.equal(cache.get("b"), 2);
  });
  it("clear tüm kayıtları siler", () => {
    const { cache } = saatli(60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    assert.equal(cache.has("a"), false);
    assert.equal(cache.has("b"), false);
  });
  it("withCache taze iken probeFn'i tek kez koşar", async () => {
    const { cache } = saatli(60_000);
    let sayac = 0;
    const probe = () => ++sayac;
    assert.equal(await withCache(cache, "java", probe), 1);
    assert.equal(await withCache(cache, "java", probe), 1);
    assert.equal(sayac, 1);
  });
  it("withCache bayatlayınca probeFn'i yeniden koşar", async () => {
    const { cache, ilerlet } = saatli(1000);
    let sayac = 0;
    const probe = () => ++sayac;
    assert.equal(await withCache(cache, "adb", probe), 1);
    ilerlet(1500);
    assert.equal(await withCache(cache, "adb", probe), 2);
    assert.equal(sayac, 2);
  });
  it("withCache async probe sonucunu saklar", async () => {
    const { cache } = saatli(60_000);
    const deger = await withCache(cache, "wabt", async () => {
      await bekle(10);
      return "2.0";
    });
    assert.equal(deger, "2.0");
    assert.equal(cache.get("wabt"), "2.0");
  });
});
describe("runProbes", () => {
  it("8 probe seri süreden hızlı biter (limit 4)", async () => {
    const problar = {};
    for (let i = 0; i < 8; i++) problar[`p${i}`] = () => bekle(60).then(() => i);
    const bas = Date.now();
    const sonuc = await runProbes(problar, 4);
    const gecen = Date.now() - bas;
    assert.equal(Object.keys(sonuc).length, 8); // hepsi raporlanır
    assert.ok(gecen < 400, `paralel ${gecen}ms < seri 480ms olmalı`);
    for (let i = 0; i < 8; i++) assert.equal(sonuc[`p${i}`].deger, i);
  });
  it("paralellik limitine saygı gösterir (en yüksek eşzaman ≤ limit)", async () => {
    let anlik = 0;
    let enYuksek = 0;
    const problar = {};
    for (let i = 0; i < 5; i++) {
      problar[`k${i}`] = async () => {
        anlik++;
        enYuksek = Math.max(enYuksek, anlik);
        await bekle(30);
        anlik--;
        return i;
      };
    }
    await runProbes(problar, 2);
    assert.ok(enYuksek <= 2, `eşzaman ${enYuksek} ≤ 2 olmalı`);
    assert.ok(enYuksek >= 2, `paralellik gerçekten kullanılmalı (${enYuksek})`);
  });
  it("fırlatan probu ok:false + hata ile yakalar, diğerleri sürer", async () => {
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
  it("her sonucu süre damgasıyla döner (sure_ms ≥ 0)", async () => {
    const sonuc = await runProbes({ hizli: () => 42 }, 4);
    assert.equal(sonuc.hizli.ok, true);
    assert.equal(sonuc.hizli.deger, 42);
    assert.ok(typeof sonuc.hizli.sure_ms === "number" && sonuc.hizli.sure_ms >= 0);
  });
  it("boş probe kaydı boş sonuç döner", async () => {
    assert.deepEqual(await runProbes({}, 4), {});
  });
});
