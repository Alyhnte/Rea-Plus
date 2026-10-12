// e2e.http.mjs: rea-plus HTTP uçtan uca (gerçek http, stub yok).
// Koş: node tests/e2e.http.mjs (önce `npm run build` gerekir).
// Akış: spawn -> /health -> tools/list -> kill, hepsi yerelde.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Sunucu girişi: görev tanımındaki kanonik yol budur.
const giris = join(kok, "dist", "server.js");
// Test portu: görevde sabitlendi, başka testle çakışmaz.
const PORT = 3849;
// Hazır bekleme üst sınırı: yavaş makinede de yeter.
const HAZIR_MS = 8000;
// Basit assert: koşul tutmazsa Türkçe mesajla patlat.
function assert(kosul, mesaj) {
  if (!kosul) throw new Error(mesaj);
}
// SSE gövdesinden data satırını çekip JSON'a çevir.
function sseCoz(govde) {
  const satir = govde.split("\n").find((l) => l.startsWith("data:"));
  assert(satir, "mcp yanıtında data satırı yok");
  return JSON.parse(satir.slice(5).trim());
}
// /health dönene kadar yokla, dönmezse zaman aşımına düş.
async function hazirBekle() {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return await r.json();
    } catch { /* açılmadıysa tekrar dene */ }
    assert(Date.now() - t0 < HAZIR_MS, "sunucu hazır olmadı");
    await new Promise((r) => setTimeout(r, 200));
  }
}
// Ana akış: spawn et, iki kapıyı yokla, her durumda öldür.
async function main() {
  const c = spawn(process.execPath, [giris, "--transport", "http", "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  c.stdout.on("data", () => {}); // boru dolup kilitlemesin
  c.stderr.on("data", () => {}); // hazır logunu yut
  try {
    const s = await hazirBekle(); // 1) canlı mı?
    assert(s.name === "rea-plus", "health name rea-plus olmalı");
    assert(s.status === "ok", "health status ok olmalı");
    const y = await fetch(`http://127.0.0.1:${PORT}/mcp`, { // 2) liste
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert(y.ok, "tools/list http 200 dönmedi");
    const adlar = sseCoz(await y.text()).result.tools.map((t) => t.name);
    assert(adlar.includes("health"), "araçlarda health yok");
    assert(adlar.includes("rea_evm_selector"), "araçlarda rea_evm_selector yok");
    console.log(`OK: health=${s.name} araclar=${adlar.length}`); // kanıt satırı
  } finally {
    c.kill("SIGTERM"); // her durumda öldür, portu kirli bırakma
    await new Promise((r) => setTimeout(r, 500));
    try { c.kill("SIGKILL"); } catch { /* zaten öldüyse sorun yok */ }
  }
}
// Başarıda exit 0, hatada Türkçe mesaj + exit 1.
main().then(
  () => process.exit(0),
  (h) => { console.error(`FAIL: ${h instanceof Error ? h.message : String(h)}`); process.exit(1); },
);
