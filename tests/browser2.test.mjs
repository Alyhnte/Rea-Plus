// browser2.test.mjs: gerçek chromium ile nav/click/shot (tamamen offline, data: URL).
// Koş: npm run build sonrası `node --test tests/browser2.test.mjs` (tsc emit şart).
// Kapsam: nav başlık+h1, nav+shot png, click sayaç artışı, shot tam sayfa png, geçersiz url kapısı.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rea_browser_nav,
  rea_browser_click,
  rea_browser_shot,
} from "../dist/rea-domains/firmware-browser/BrowserBridge.js";

// H1 sayfası: başlık DenemeNav, gövde Merhaba (ağ yok, data URL kullanılır).
const H1_HTML = `<html><head><title>DenemeNav</title></head><body><h1>Merhaba</h1></body></html>`;
const H1_URL = "data:text/html," + encodeURIComponent(H1_HTML);

// Sayaç sayfası: butona basınca inline JS span içeriğini 0->1 yapar.
const CLICK_HTML = `<html><head><title>TikTest</title></head><body><button id="artir" onclick="document.getElementById('sayac').textContent=Number(document.getElementById('sayac').textContent)+1">Artir</button><span id="sayac">0</span></body></html>`;
const CLICK_URL = "data:text/html," + encodeURIComponent(CLICK_HTML);

// PNG imzası: dosyanın gerçek png olduğu başlık baytlarıyla kanıtlanır.
function pngMi(dosya) {
  const buf = readFileSync(dosya);
  assert.ok(buf.length > 0, "png boş olmamalı");
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50); // P
  assert.equal(buf[2], 0x4e); // N
  assert.equal(buf[3], 0x47); // G
}

// Benzersiz tmp png yolu üretir (repo kirlenmez, tmp kullanılır).
function tmpPng(one) {
  return join(tmpdir(), `rea-browser2-${one}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`);
}

describe("rea_browser_nav (gerçek chromium)", () => {
  // Data URL sayfasında başlık gerçekten okunmalı.
  it("data h1 sayfasında nav başlık okur", async () => {
    const r = await rea_browser_nav(H1_URL);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_browser_nav");
    assert.equal(r.details.title, "DenemeNav");
    assert.ok(String(r.details.url).startsWith("data:"), "url data: ile başlamalı");
  });

  // Nav dönüşü gerçek DOM içeriğini taşımalı (h1 kanıtı).
  it("nav h1 içeriğini döndürür", async () => {
    const r = await rea_browser_nav(H1_URL);
    assert.equal(r.ok, true);
    assert.ok(String(r.details.icerik).includes("Merhaba"), "icerik Merhaba taşımalı");
    assert.ok(String(r.details.icerik).includes("<h1"), "icerik h1 taşımalı");
  });

  // Nav istenirse png yazar, dosya gerçek PNG olur.
  it("nav ciktiShot ile png yazar", async () => {
    const dosya = tmpPng("nav");
    const r = await rea_browser_nav(H1_URL, dosya);
    assert.equal(r.ok, true);
    assert.equal(r.details.shot, dosya);
    assert.ok(existsSync(dosya), "shot dosyası oluşmalı");
    pngMi(dosya);
  });
});

describe("rea_browser_click (gerçek chromium)", () => {
  // Inline JS sayacı 0->1 artmalı (click gerçekten çalıştı).
  it("button click sayacı artırır", async () => {
    const r = await rea_browser_click(CLICK_URL, "#artir");
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_browser_click");
    assert.equal(r.details.title, "TikTest");
    assert.ok(String(r.details.icerik).includes('id="sayac">1<'), "sayaç 1 olmalı");
  });

  // Click sonrası istenirse kare yazılır.
  it("click sonrası shot png yazar", async () => {
    const dosya = tmpPng("click");
    const r = await rea_browser_click(CLICK_URL, "#artir", dosya);
    assert.equal(r.ok, true);
    assert.equal(r.details.selector, "#artir");
    assert.ok(existsSync(dosya), "click shot oluşmalı");
    pngMi(dosya);
  });
});

describe("rea_browser_shot (gerçek chromium)", () => {
  // Tam sayfa png dosyası oluşur, başlığı PNG olur.
  it("tam sayfa png dosyası oluşur", async () => {
    const dosya = tmpPng("shot");
    const r = await rea_browser_shot(H1_URL, dosya);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_browser_shot");
    assert.equal(r.details.file, dosya);
    assert.ok(existsSync(dosya), "shot dosyası oluşmalı");
    pngMi(dosya);
  });

  // Geçersiz url kapıdan döner (chromium açılmadan unsupported).
  it("geçersiz url unsupported verir", async () => {
    for (const u of ["not-a-url", "", "ftp://ornek/test"]) {
      const r1 = await rea_browser_nav(u);
      assert.equal(r1.ok, false);
      assert.equal(r1.code, "capability_unsupported");
      const r2 = await rea_browser_click(u, "#artir");
      assert.equal(r2.ok, false);
      assert.equal(r2.code, "capability_unsupported");
      const r3 = await rea_browser_shot(u, tmpPng("gecersiz"));
      assert.equal(r3.ok, false);
      assert.equal(r3.code, "capability_unsupported");
    }
  });
});
