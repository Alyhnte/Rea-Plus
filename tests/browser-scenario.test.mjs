// browser-scenario.test.mjs: scenario adimlari GERCEKTEN sirayla calisir (sahte backend).
// Gercak chromium ACILMAZ: tum kosular enjekte sahte backend ile (birim agirlikli).
// Kos: npm run build sonrasi `node --test tests/browser-scenario.test.mjs` (tsc emit sart).
// Kapsam: (a) 3 adim sirayla calisir+sonuclar kaydedilir, (b) 2.adim patlarsa
// durur 3.adim "calismadi", (c) backend yoksa durust unsupported+ipucu,
// (d) dry-run calistirmaz dogrular. Timer/surec birakmaz (saf promise).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_browser_scenario } from "../dist/rea-domains/firmware-browser/BrowserBridge.js";

// Sahte backend: cagrilari sirayla kaydeder, istenen sirada patlar (hizli, timersiz).
function sahteBackend(bozukSira = -1) {
  const cagrilar = [];
  const patlat = (sira, ad) => {
    if (sira === bozukSira) throw new Error(`${ad} patladi`);
  };
  return {
    cagrilar,
    async goto(url) { cagrilar.push(`goto:${url}`); patlat(0, "goto"); return { url }; },
    async click(selector) { cagrilar.push(`click:${selector}`); patlat(1, "click"); return { selector }; },
    async type(selector, text) { cagrilar.push(`type:${selector}=${text}`); patlat(2, "type"); return { selector }; },
    async wait(ms) { cagrilar.push(`wait:${ms}`); patlat(3, "wait"); return { ms }; },
  };
}

const URL = "data:text/html," + encodeURIComponent("<html><body>merhaba</body></html>");

describe("rea_browser_scenario (sahte backend)", () => {
  // (a) 3 adim sirayla calisir, her adim sonucu kanitiyla kaydedilir.
  it("3 adimi sirayla calistirir, sonuclari kaydeder", async () => {
    const backend = sahteBackend();
    const adimlar = [
      { action: "goto", target: URL },
      { action: "click", target: "#artir" },
      { action: "type", target: "#ad", value: "merhaba" },
    ];
    const r = await rea_browser_scenario(adimlar, { backend });
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_browser_scenario");
    const sonuclar = r.details.results;
    assert.equal(sonuclar.length, 3);
    assert.deepEqual(sonuclar.map((s) => s.durum), ["ok", "ok", "ok"]);
    assert.deepEqual(backend.cagrilar, [`goto:${URL}`, "click:#artir", "type:#ad=merhaba"]);
  });

  // (b) 2.adim patlarsa scenario durur, 3.adim "calismadi" olur (sahte basari yok).
  it("2.adim patlarsa durur, 3.adim calismadi olur", async () => {
    const backend = sahteBackend(1);
    const adimlar = [
      { action: "goto", target: URL },
      { action: "click", target: "#artir" },
      { action: "type", target: "#ad", value: "merhaba" },
    ];
    const r = await rea_browser_scenario(adimlar, { backend });
    assert.equal(r.ok, false);
    const sonuclar = r.details.results;
    assert.equal(sonuclar.length, 3);
    assert.equal(sonuclar[0].durum, "ok");
    assert.equal(sonuclar[1].durum, "hata");
    assert.equal(sonuclar[2].durum, "calismadi");
    assert.ok(!backend.cagrilar.some((c) => c.startsWith("type:")), "3.adim calismamali");
  });

  // (c) Backend yoksa durust capability_unsupported + kurulum ipucu (sahte ok yok).
  it("backend yoksa durust hata ve kurulum ipucu verir", async () => {
    const adimlar = [{ action: "goto", target: URL }];
    const r = await rea_browser_scenario(adimlar, { backend: null });
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.match(String(r.reason).toLowerCase(), /playwright|cdp|kurulum|install/);
  });

  // (d) Dry-run backend'e dokunmaz, adimlari listeler/dogrular.
  it("dry-run calistirmaz, adimlari dogrular", async () => {
    const backend = sahteBackend();
    const adimlar = [
      { action: "goto", target: URL },
      { action: "wait", ms: 200 },
      { action: "click", target: "#artir" },
    ];
    const r = await rea_browser_scenario(adimlar, { backend, dryRun: true });
    assert.equal(r.ok, true);
    assert.equal(r.details.dryRun, true);
    assert.equal(r.details.results.length, 3);
    assert.deepEqual(r.details.results.map((s) => s.durum), ["ok", "ok", "ok"]);
    assert.equal(backend.cagrilar.length, 0, "dry-run backend cagirmamali");
  });

  // (d2) Dry-run bilinmeyen adimi calistirmadan reddeder.
  it("dry-run gecersiz adimi reddeder", async () => {
    const backend = sahteBackend();
    const r = await rea_browser_scenario([{ action: "uc", target: "x" }], { backend, dryRun: true });
    assert.equal(r.ok, false);
    assert.equal(backend.cagrilar.length, 0, "gecersiz adim calismamali");
  });
});
