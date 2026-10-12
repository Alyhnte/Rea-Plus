// rea-domains/browser: depolama + konsol derinliği (gerçek chromium)
// data: URL ile offline test edilir; her çağrıda browser kapatılır (sızıntı yok).
// Playwright opsiyonel bağımlılık: paket kurulumunda yoksa sunucu yine açılır,
// tarayıcı araçları kapıdan döner. Bu yüzden statik import yerine tembel shim.
type Chromium = (typeof import("playwright"))["chromium"];
const chromium = {
  async launch(...args: Parameters<Chromium["launch"]>) {
    const pw = await import("playwright");
    return pw.chromium.launch(...args);
  },
};

export type ReaBrDerinlikSonuç =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Üst sınır: tek sayfa bekleyişi 30sn'yi geçmez.
const DERİNLİK_ZAMAN_AŞIMI = 30_000;

// URL kapısı: yalnızca data/http/https kabul edilir.
function gecerliUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "data:" || u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

// localStorage okuma betiği: opak origin'de (data:) hata yerine {} döner.
const DEPO_BETİĞİ = "(() => { try { const o = {}; for (let i = 0; i < window.localStorage.length; i++) { const k = window.localStorage.key(i); if (k) o[k] = window.localStorage.getItem(k); } return o; } catch (e) { return {}; } })()";

// Depolama dökümü: context çerezleri + sayfa localStorage (gerçek chromium).
export async function rea_storage_dump(url: string): Promise<ReaBrDerinlikSonuç> {
  if (!gecerliUrl(url)) return { ok: false, code: "capability_unsupported", reason: `gecersiz url: ${url}` };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    browser = await chromium.launch({ headless: true }); // headless shell kullanılır
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { timeout: DERİNLİK_ZAMAN_AŞIMI, waitUntil: "domcontentloaded" });
    const cookies = await ctx.cookies(); // gerçek çerez listesi
    const depo = (await page.evaluate(DEPO_BETİĞİ)) as Record<string, string | null>;
    return { ok: true, tool: "rea_storage_dump", summary: `${cookies.length} çerez, ${Object.keys(depo).length} depo girdisi`, details: { cookies, localStorage: depo } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `depo okunamadı: ${(e as Error).message}` }; }
  finally { if (browser) { try { await browser.close(); } catch { /* kapatma hatası yoksayılır */ } } }
}

// Konsol yakalama: sayfa sure_ms boyunca dinlenir, tip+metin toplanır.
export async function rea_console_yakala(url: string, sure_ms = 1000): Promise<ReaBrDerinlikSonuç> {
  if (!gecerliUrl(url)) return { ok: false, code: "capability_unsupported", reason: `gecersiz url: ${url}` };
  if (!Number.isFinite(sure_ms) || sure_ms < 0 || sure_ms > DERİNLİK_ZAMAN_AŞIMI) return { ok: false, code: "capability_unsupported", reason: `sure_ms aralık dışı: ${sure_ms}` };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  const iletiler: Array<{ tip: string; metin: string }> = [];
  try {
    browser = await chromium.launch({ headless: true }); // headless shell kullanılır
    const page = await browser.newPage();
    page.on("console", (m) => { iletiler.push({ tip: m.type(), metin: m.text() }); }); // gerçek konsol akışı
    await page.goto(url, { timeout: DERİNLİK_ZAMAN_AŞIMI, waitUntil: "domcontentloaded" });
    await page.waitForTimeout(Math.min(sure_ms, DERİNLİK_ZAMAN_AŞIMI)); // betiklerin çalışması beklenir
    return { ok: true, tool: "rea_console_yakala", summary: `${iletiler.length} konsol iletisi (${sure_ms}ms)`, details: { mesajlar: iletiler, sure_ms } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `konsol yakalanamadı: ${(e as Error).message}` }; }
  finally { if (browser) { try { await browser.close(); } catch { /* kapatma hatası yoksayılır */ } } }
}
