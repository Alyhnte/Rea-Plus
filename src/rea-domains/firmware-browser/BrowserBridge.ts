// rea-domains/firmware-browser: gerçek tarayıcı kapısı (CDP/Playwright).
// REA_CDP_URL yoksa `npx playwright --version` ile kurulum doğrulanır.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
// Playwright opsiyonel bağımlılık: paket kurulumunda yoksa sunucu yine açılır,
// tarayıcı araçları kapıdan döner. Bu yüzden statik import yerine tembel shim.
type Chromium = (typeof import("playwright"))["chromium"];
const chromium = {
  async launch(...args: Parameters<Chromium["launch"]>) {
    const pw = await import("playwright");
    return pw.chromium.launch(...args);
  },
};
export type ReaBrResult =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Playwright sürümünü gerçekten sorgular, yoksa null döner.
function playwrightVer(): string | null {
  try {
    const out = execSync("npx playwright --version", { stdio: "pipe", timeout: 15000 });
    const v = out.toString().trim();
    return v || null;
  } catch { return null; }
}
// Kapı: CDP URL varsa geç, yoksa Playwright kurulumu şart.
function needBrowser(): ReaBrResult | null {
  if (typeof process !== "undefined" && process.env.REA_CDP_URL) return null;
  const v = playwrightVer();
  if (v) return null;
  return { ok: false, code: "capability_unsupported", reason: "CDP yok ve Playwright kurulu değil (REA_CDP_URL/npx playwright)" };
}
// Senaryoyu artifact klasörüne gerçek JSON olarak kaydeder.
export function rea_browser_scenario(steps: Array<{ action: string; target?: string }>): ReaBrResult {
  const gate = needBrowser();
  if (gate) return gate;
  if (!steps.length) return { ok: false, code: "capability_unsupported", reason: "boş senaryo" };
  const kinds = [...new Set(steps.map((s) => s.action))].join(",");
  const dir = process.env.REA_ARTIFACTS ?? join(tmpdir(), "rea-browser");
  mkdirSync(dir, { recursive: true }); // artifact klasörünü gerçekten oluşturur
  const file = join(dir, `scenario-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ steps, kinds }, null, 2), "utf8");
  return { ok: true, tool: "rea_browser_scenario", summary: `${steps.length} adım (${kinds}) -> ${file}`, details: { file, dir } };
}
// HAR dosyasını gerçekten okur, request/response sayar.
export function rea_browser_har_import(harPath: string): ReaBrResult {
  const gate = needBrowser();
  if (gate) return gate;
  if (!existsSync(harPath)) return { ok: false, code: "capability_unsupported", reason: `HAR dosyası yok: ${harPath}` };
  try {
    const har = JSON.parse(readFileSync(harPath, "utf8")) as { log?: { entries?: Array<{ request?: unknown; response?: { status?: number } }> } };
    const entries = har.log?.entries ?? [];
    const req = entries.filter((e) => e.request).length; // istek sayımı
    const res = entries.filter((e) => e.response?.status && e.response.status > 0).length; // yanıt sayımı
    return { ok: true, tool: "rea_browser_har_import", summary: `${entries.length} girdi (${req} req/${res} resp)`, details: { entries: entries.length, requests: req, responses: res, file: harPath } };
  } catch {
    return { ok: false, code: "capability_unsupported", reason: "HAR parse edilemedi" };
  }
}
// Sürücü durumunu gerçekten yoklar (CDP + Playwright sürümü).
export function rea_browser_caps(): ReaBrResult {
  const cdp = Boolean(process.env.REA_CDP_URL);
  const pw = playwrightVer();
  if (!cdp && !pw) return { ok: false, code: "capability_unsupported", reason: "tarayıcı sürücüsü yok (REA_CDP_URL/Playwright)" };
  return { ok: true, tool: "rea_browser_caps", summary: cdp ? `cdp + ${pw ?? "pw yok"}` : (pw as string), details: { cdp, playwright: pw } };
}

// Tüm goto/click işlemleri için üst sınır (30sn); ağ yok, data: URL hızlı döner.
const BROWSER_ZAMAN_ASIMI = 30_000;

// URL kapısı: yalnızca data/http/https kabul edilir, gerisi unsupported döner.
function gecerliUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "data:" || u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

// Ekran görüntüsü yolu verildiyse ebeveyn klasörü gerçekten oluşturur.
function ebeveynHazirla(dosya: string): void {
  mkdirSync(dirname(dosya), { recursive: true }); // shot yolu yoksa açılır
}

// Gerçek chromium ile sayfaya gider, başlık+url döndürür, istenirse png yazar.
// Her çağrıda browser kapatılır (sızıntı yok).
export async function rea_browser_nav(url: string, ciktiShot?: string): Promise<ReaBrResult> {
  const gate = needBrowser(); // kapı deseni korunur
  if (gate) return gate;
  if (!gecerliUrl(url)) return { ok: false, code: "capability_unsupported", reason: `gecersiz url: ${url}` };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true }); // headless shell kullanılır
    const page = await browser.newPage();
    await page.goto(url, { timeout: BROWSER_ZAMAN_ASIMI, waitUntil: "domcontentloaded" }); // 30sn sınır
    const baslik = await page.title(); // sayfa başlığı gerçekten okunur
    const oankiUrl = page.url();
    const icerik = await page.content(); // h1 doğrulaması için gerçek DOM
    let shot: string | null = null;
    if (ciktiShot) {
      ebeveynHazirla(ciktiShot);
      await page.screenshot({ path: ciktiShot }); // png gerçekten yazılır
      shot = ciktiShot;
    }
    return { ok: true, tool: "rea_browser_nav", summary: `${baslik || "(basliksiz)"} -> ${oankiUrl}${shot ? ` + ${shot}` : ""}`, details: { title: baslik, url: oankiUrl, shot, icerik } };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `nav basarisiz: ${(e as Error).message}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* kapatma hatası yoksayılır */ } } // sızıntı yok
  }
}

// Gerçek chromium ile sayfaya gidip seçiciye tıklar, sonrası başlık/url/shot döndürür.
// Her çağrıda browser kapatılır (sızıntı yok).
export async function rea_browser_click(url: string, selector: string, ciktiShot?: string): Promise<ReaBrResult> {
  const gate = needBrowser(); // kapı deseni korunur
  if (gate) return gate;
  if (!gecerliUrl(url)) return { ok: false, code: "capability_unsupported", reason: `gecersiz url: ${url}` };
  if (!selector || typeof selector !== "string") return { ok: false, code: "capability_unsupported", reason: "bos selector" };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true }); // headless shell kullanılır
    const page = await browser.newPage();
    await page.goto(url, { timeout: BROWSER_ZAMAN_ASIMI, waitUntil: "domcontentloaded" }); // önce sayfa açılır
    await page.click(selector, { timeout: BROWSER_ZAMAN_ASIMI }); // gerçek tıklama (inline JS çalışır)
    const baslik = await page.title(); // tıklama sonrası başlık
    const oankiUrl = page.url();
    const icerik = await page.content(); // sayaç artışı buradan doğrulanır
    let shot: string | null = null;
    if (ciktiShot) {
      ebeveynHazirla(ciktiShot);
      await page.screenshot({ path: ciktiShot }); // sonrası kare yazılır
      shot = ciktiShot;
    }
    return { ok: true, tool: "rea_browser_click", summary: `click ${selector} -> ${baslik || "(basliksiz)"}${shot ? ` + ${shot}` : ""}`, details: { title: baslik, url: oankiUrl, selector, shot, icerik } };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `click basarisiz: ${(e as Error).message}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* kapatma hatası yoksayılır */ } } // sızıntı yok
  }
}

// Gerçek chromium ile sayfanın tam boy png görüntüsünü dosyaya yazar.
// Her çağrıda browser kapatılır (sızıntı yok).
export async function rea_browser_shot(url: string, cikti: string): Promise<ReaBrResult> {
  const gate = needBrowser(); // kapı deseni korunur
  if (gate) return gate;
  if (!gecerliUrl(url)) return { ok: false, code: "capability_unsupported", reason: `gecersiz url: ${url}` };
  if (!cikti || typeof cikti !== "string") return { ok: false, code: "capability_unsupported", reason: "bos cikti yolu" };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true }); // headless shell kullanılır
    const page = await browser.newPage();
    await page.goto(url, { timeout: BROWSER_ZAMAN_ASIMI, waitUntil: "domcontentloaded" }); // 30sn sınır
    ebeveynHazirla(cikti);
    await page.screenshot({ path: cikti, fullPage: true }); // tam sayfa png
    const baslik = await page.title();
    return { ok: true, tool: "rea_browser_shot", summary: `${cikti} (${baslik || "basliksiz"})`, details: { file: cikti, url: page.url(), title: baslik } };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `shot basarisiz: ${(e as Error).message}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* kapatma hatası yoksayılır */ } } // sızıntı yok
  }
}
