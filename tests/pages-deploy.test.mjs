// pages-deploy.test.mjs: ROADMAP P2 — GitHub Pages deploy workflow doğrulaması.
// Hedef: `.github/workflows/pages.yml` main push'ta site üretip Pages'e deploy eder.
// Bu test ÜRETMEZ, yalnız doğrular (offline + salt okunur: fs okuma, ağ/timer/süreç yok).
// Koş: `node tests/pages-deploy.test.mjs` (tek dosya) veya `npm test` (tam küme).
// Desen: tests/publish-workflow.test.mjs gibi metin-tabanlı (yaml parser bağımlılığı yok).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wfPath = path.join(root, ".github", "workflows", "pages.yml");
const wf = existsSync(wfPath) ? readFileSync(wfPath, "utf8") : "";

function sira(...parcalar) {
  let onceki = -1;
  for (const p of parcalar) {
    const idx = wf.indexOf(p);
    assert.ok(idx > onceki, `'${p}' bulunmali ve onceki adimlardan sonra gelmeli (idx=${idx}, onceki=${onceki})`);
    onceki = idx;
  }
}

describe("pages deploy workflow", () => {
  it("pages.yml mevcuttur ve boş değildir", () => {
    assert.ok(existsSync(wfPath), ".github/workflows/pages.yml olmali");
    assert.ok(wf.length > 200, "workflow boş olmamalı (en az adımlar olmalı)");
  });

  it("tetik: main push (branches main içerir)", () => {
    const onBas = wf.indexOf("\non:");
    assert.ok(onBas >= 0, "on: blogu olmali");
    // on blogunun ilk ~400 karakteri tetikleyiciyi taşır.
    const onBlogu = wf.slice(onBas, onBas + 600);
    assert.ok(onBlogu.includes("push:"), "push tetikleyici olmali");
    assert.ok(onBlogu.includes('"main"') || onBlogu.includes("'main'") || onBlogu.includes("main"), "main branch tetikleyici olmali");
    assert.ok(/branches:\s*\n?\s*\[?"?main"?\]?/.test(wf), "branches main deseni olmali");
  });

  it("tetik: PR'da deploy yok (pull_request tetiklemez)", () => {
    const onBas = wf.indexOf("\non:");
    const jobsBas = wf.indexOf("\njobs:");
    assert.ok(onBas >= 0 && jobsBas > onBas, "on: blogu jobs oncesinde olmali");
    const onBlogu = wf.slice(onBas, jobsBas);
    assert.ok(!onBlogu.includes("pull_request:"), "on: blogunda pull_request olmamali (PR'da deploy yok)");
    assert.ok(!onBlogu.includes("pull_request_target:"), "on: blogunda pull_request_target olmamali");
  });

  it("izinler: pages:write + id-token:write (contents:read ile)", () => {
    assert.match(wf, /pages:\s*write/, "pages:write izni olmali");
    assert.match(wf, /id-token:\s*write/, "id-token:write izni olmali");
    assert.match(wf, /contents:\s*read/, "contents:read izni olmali (checkout için)");
    assert.ok(!wf.includes("write-all"), "write-all olmamali (en az yetki)");
  });

  it("site üretim adımı: npm ci + build + site-uret sırasıyla", () => {
    sira("run: npm ci", "run: npm run build", "scripts/site-uret.mjs");
    assert.ok(
      wf.includes("node scripts/site-uret.mjs"),
      "site üretim adımı `node scripts/site-uret.mjs` olmalı",
    );
  });

  it("deploy deseni: configure-pages + upload (docs/site) + deploy-pages + github-pages ortamı", () => {
    assert.ok(wf.includes("actions/configure-pages@"), "actions/configure-pages olmali");
    assert.ok(wf.includes("actions/upload-pages-artifact@"), "actions/upload-pages-artifact olmali");
    assert.ok(wf.includes("actions/deploy-pages@"), "actions/deploy-pages olmali (deploy deseni)");
    assert.ok(wf.includes("docs/site"), "artifact yolu docs/site olmali");
    assert.ok(wf.includes("github-pages"), "github-pages ortamı olmalı");
    sira("actions/configure-pages@", "actions/upload-pages-artifact@", "actions/deploy-pages@");
  });

  it("kapılar: checkout@v4 + setup-node@v4 (Node 20+), ubuntu-latest", () => {
    assert.ok(wf.includes("actions/checkout@v4"), "checkout@v4 olmali");
    assert.ok(wf.includes("actions/setup-node@v4"), "setup-node@v4 olmali");
    assert.ok(wf.includes("runs-on: ubuntu-latest"), "ubuntu-latest olmali");
    assert.match(wf, /node-version:\s*(2[0-9])\b/, "Node 20+ olmali");
  });

  it("yasaklar: git push, npm publish, canlı test, ham token", () => {
    for (const yasak of ["git push", "npm publish", "test:live", "workflow_dispatch\n  branches"]) {
      assert.ok(!wf.includes(yasak), `'${yasak}' workflow'da olmamali`);
    }
    assert.ok(!/npm_[A-Za-z0-9]{20,}/.test(wf), "ham npm token workflow'da olmamali");
    assert.ok(!wf.includes("_authToken"), "_authToken workflow'da olmamali");
  });

  it("hijyen: kişisel yol/sır sızıntısı yok", () => {
    const ev = homedir();
    assert.ok(!wf.includes(":\\Users\\"), "kullanıcı yolu sızmamalı");
    assert.ok(!wf.includes(":/Users/"), "kullanıcı yolu (/) sızmamalı");
    assert.ok(!wf.includes("AppData"), "profil dizini sızmamalı");
    assert.ok(!wf.includes(ev) || ev.length < 3, "ev dizini sızmamalı");
  });
});
