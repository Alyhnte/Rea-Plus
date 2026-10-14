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
  | { ok: false; code: string; reason: string; details?: unknown };
// Senaryo adımı: goto/click/type/wait sırayla GERÇEKTEN çalıştırılır (sahte başarı yok).
export type BrowserScenarioStep = { action: string; target?: string; value?: string; ms?: number };
// MCP girdisi: düz dizi ya da dryRun bayraklı zarf (kayıt yeri değişmeden çalışır).
export type BrowserScenarioInput = BrowserScenarioStep[] | { steps: BrowserScenarioStep[]; dryRun?: boolean };
// Enjekte edilebilir tarayıcı arkayüzü: testler sahte backend verir, ürün gerçek
// chromium kullanır. Metotlar kanıt değeri döner, patlarsa hata fırlatır.
export type ScenarioBackend = {
  goto(url: string): Promise<unknown>;
  click(selector: string): Promise<unknown>;
  type(selector: string, text: string): Promise<unknown>;
  wait(ms: number): Promise<unknown>;
  close?(): Promise<void>;
};
export type ScenarioOptions = { backend?: ScenarioBackend | null; dryRun?: boolean };
export type ScenarioStepResult = {
  sira: number; action: string; target?: string;
  ok: boolean; durum: "ok" | "hata" | "calismadi";
  kanit?: unknown; hata?: string;
};
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
// Kurulum ipucu: backend yoksa dürüst unsupported + ne kurulacağı söylenir.
const BACKEND_YOK_IPUCU = "tarayıcı backend yok (Playwright kurulu değil ya da REA_CDP_URL tanımsız). Kurulum: npx playwright install chromium ya da REA_CDP_URL=wss://... adresini tanımla";

// Adım önden-doğrulama: bilinmeyen/eksik adım backend'e dokunmadan reddedilir.
function adimDogrula(sira: number, adım: BrowserScenarioStep): string | null {
  if (!adım || typeof adım.action !== "string") return `adım ${sira + 1}: action yok`;
  switch (adım.action) {
    case "goto":
      if (!adım.target || !gecerliUrl(adım.target)) return `adım ${sira + 1} (goto): geçersiz url`;
      return null;
    case "click":
      if (!adım.target || typeof adım.target !== "string") return `adım ${sira + 1} (click): boş selector`;
      return null;
    case "type":
      if (!adım.target || typeof adım.target !== "string") return `adım ${sira + 1} (type): boş selector`;
      if (typeof adım.value !== "string") return `adım ${sira + 1} (type): value yok`;
      return null;
    case "wait": {
      const ms = adım.ms ?? (adım.target !== undefined ? Number(adım.target) : (adım.value !== undefined ? Number(adım.value) : NaN));
      if (!Number.isFinite(ms) || (ms as number) < 0 || (ms as number) > BROWSER_ZAMAN_ASIMI) return `adım ${sira + 1} (wait): süre aralık dışı`;
      return null;
    }
    default:
      return `adım ${sira + 1}: bilinmeyen action '${adım.action}' (goto/click/type/wait olmalı)`;
  }
}

// wait adımının ms değeri (doğrulamadan geçtiği için burada her zaman sayıdır).
function beklemeSuresi(adım: BrowserScenarioStep): number {
  if (typeof adım.ms === "number") return adım.ms;
  if (adım.target !== undefined) return Number(adım.target);
  return Number(adım.value);
}

// Senaryoyu GERÇEKTEN sırayla çalıştırır (tek browser oturumu, her çağrıda kapatılır).
// backend verilirse kapıya bakılmadan o kullanılır (testler sahte backend verir);
// backend null ise ya da kapı düşerse dürüst capability_unsupported + kurulum ipucu.
// dryRun: çalıştırmadan listeler/doğrular, backend'e dokunmaz.
// Patlayan adımda durur, kalanlar durum:"calismadi" olur (sahte başarı yok).
export async function rea_browser_scenario(stepsOrInput: BrowserScenarioInput, secenekler?: ScenarioOptions): Promise<ReaBrResult> {
  const girdi = Array.isArray(stepsOrInput) ? { steps: stepsOrInput, dryRun: secenekler?.dryRun ?? false }
    : (stepsOrInput && typeof stepsOrInput === "object" && Array.isArray((stepsOrInput as { steps?: unknown }).steps))
      ? { steps: (stepsOrInput as { steps: BrowserScenarioStep[] }).steps, dryRun: (stepsOrInput as { dryRun?: boolean }).dryRun ?? secenekler?.dryRun ?? false }
      : null;
  if (!girdi) return { ok: false, code: "capability_unsupported", reason: "geçersiz senaryo girdisi (adım dizisi ya da {steps,dryRun} olmalı)" };
  const { steps, dryRun } = girdi;
  if (!steps.length) return { ok: false, code: "capability_unsupported", reason: "boş senaryo" };
  for (let i = 0; i < steps.length; i++) {
    const hata = adimDogrula(i, steps[i] as BrowserScenarioStep);
    if (hata) return { ok: false, code: "capability_unsupported", reason: hata };
  }
  if (dryRun) {
    const results: ScenarioStepResult[] = steps.map((s, i) => ({ sira: i, action: s.action, target: s.target, ok: true, durum: "ok" as const, kanit: { dogrulandi: true } }));
    return { ok: true, tool: "rea_browser_scenario", summary: `${steps.length} adım doğrulandı (dry-run, çalıştırılmadı)`, details: { dryRun: true, adimSayisi: steps.length, results } };
  }
  // null backend = yok dalı (deterministik, gerçek tarayıcı açılmaz).
  if (secenekler && secenekler.backend === null) return { ok: false, code: "capability_unsupported", reason: BACKEND_YOK_IPUCU };
  let backend = secenekler?.backend ?? null;
  let gercekTarayici: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    if (!backend) {
      const gate = needBrowser();
      if (gate && !gate.ok) return { ok: false, code: "capability_unsupported", reason: `${gate.reason}. ${BACKEND_YOK_IPUCU}` };
      gercekTarayici = await chromium.launch({ headless: true }); // tek oturum, finally'de kapatılır
      const page = await gercekTarayici.newPage();
      backend = {
        async goto(url: string) {
          await page.goto(url, { timeout: BROWSER_ZAMAN_ASIMI, waitUntil: "domcontentloaded" });
          return { url: page.url(), title: await page.title() };
        },
        async click(selector: string) {
          await page.click(selector, { timeout: BROWSER_ZAMAN_ASIMI });
          return { selector, title: await page.title() };
        },
        async type(selector: string, text: string) {
          await page.fill(selector, text, { timeout: BROWSER_ZAMAN_ASIMI });
          return { selector };
        },
        async wait(ms: number) {
          await page.waitForTimeout(ms);
          return { ms };
        },
      };
    }
    const results: ScenarioStepResult[] = [];
    let patladi = -1;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i] as BrowserScenarioStep;
      try {
        let kanit: unknown;
        if (s.action === "goto") kanit = await (backend as ScenarioBackend).goto(s.target as string);
        else if (s.action === "click") kanit = await (backend as ScenarioBackend).click(s.target as string);
        else if (s.action === "type") kanit = await (backend as ScenarioBackend).type(s.target as string, s.value as string);
        else kanit = await (backend as ScenarioBackend).wait(beklemeSuresi(s));
        results.push({ sira: i, action: s.action, target: s.target, ok: true, durum: "ok", kanit });
      } catch (e) {
        patladi = i;
        results.push({ sira: i, action: s.action, target: s.target, ok: false, durum: "hata", hata: (e as Error).message });
        break; // patlayan adımda durulur
      }
    }
    for (let i = patladi + 1; patladi >= 0 && i < steps.length; i++) {
      const s = steps[i] as BrowserScenarioStep;
      results.push({ sira: i, action: s.action, target: s.target, ok: false, durum: "calismadi" });
    }
    results.sort((a, b) => a.sira - b.sira);
    const okSayi = results.filter((r) => r.durum === "ok").length;
    const dir = process.env.REA_ARTIFACTS ?? join(tmpdir(), "rea-browser");
    let file: string | null = null;
    try {
      mkdirSync(dir, { recursive: true }); // sonuç kaydı gerçekten yazılır
      file = join(dir, `scenario-${Date.now()}.json`);
      writeFileSync(file, JSON.stringify({ steps, results }, null, 2), "utf8");
    } catch { file = null; }
    if (patladi >= 0) {
      const p = results[patladi] as ScenarioStepResult;
      return { ok: false, code: "scenario_step_failed", reason: `adım ${patladi + 1} (${p.action}) başarısız: ${p.hata ?? "bilinmeyen hata"}`, details: { results, file, dir } };
    }
    const kinds = [...new Set(steps.map((s) => s.action))].join(",");
    return { ok: true, tool: "rea_browser_scenario", summary: `${okSayi}/${steps.length} adım ok (${kinds})${file ? ` -> ${file}` : ""}`, details: { results, file, dir } };
  } catch (e) {
    return { ok: false, code: "capability_unsupported", reason: `senaryo çalıştırılamadı: ${(e as Error).message}. ${BACKEND_YOK_IPUCU}` };
  } finally {
    if (gercekTarayici) { try { await gercekTarayici.close(); } catch { /* kapatma hatası yoksayılır */ } }
    // Enjekte backend'in kapatması varsa çağır (sızıntı yok, test saf kalır).
    const b = secenekler?.backend;
    if (b && typeof b.close === "function") { try { await b.close(); } catch { /* yoksay */ } }
  }
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
