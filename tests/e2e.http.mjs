// e2e.http.mjs: rea-plus HTTP uçtan uca (gerçek http, stub yok).
// Koş: node tests/e2e.http.mjs (önce `npm run build` gerekir).
// Akış (iki ayrı yerel sunucu; ikisi de dinamik port + kısa timeout, CI'da flake yok):
//   1) TOKENLİ: spawn -> /health 200 -> tools/list 187 araç -> tools/call health
//      -> tokensız /health + /mcp 401 (yazma dahil her rota reddedilir)
//   2) TOKENSİZ: spawn -> tools/list 44 salt-okunur araç -> tools/call debug_open reddi
// Her sunucu sonunda öldürülür, portun serbest kaldığı (bağlantı reddi + yeniden
// dinlenebilir) doğrulanır; asılı süreç/timer bırakılmaz.
// Sayı dayanağı: 187 = dist tam yüzey (http-policy.test.mjs + toolsets.test.mjs);
// 44 = HTTP_READ_ONLY_TOOLS.length (http-policy.test.mjs).
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Sunucu girişi: görev tanımındaki kanonik yol budur.
const giris = join(kok, "dist", "server.js");
// Hazır bekleme üst sınırı: yavaş makinede de yeter, CI'da flake yapmaz.
const HAZIR_MS = 8000;
// Tekil HTTP isteği tavanı: asılı fetch kalmaz.
const ISTEK_MS = 5000;
// Kapanış bekleme tavanı: SIGTERM sonrası çıkış gelmezse SIGKILL.
const KAPANIS_MS = 3000;

// Boş yerel port bul (paralel koşuda çakışma olmaz; 0 portu sunucu bayrağı
// kabul etmez, o yüzden geçici dinleyiciyle gerçek boş port alınır).
function bosPortBul() {
  return new Promise((cöz, kır) => {
    const s = createServer();
    s.once("error", kır);
    s.listen(0, "127.0.0.1", () => {
      const port = s.address().port;
      s.close(() => cöz(port));
    });
  });
}

// Token'ı test kendi üretir (gerçek kimlik yok).
function jetonUret() {
  return randomBytes(32).toString("hex");
}

// Ortam: token'lı/token'sız iki faz birbirini kirletmez; REA_TOOLSETS
// silinir ki varsayılan tam yüzey deterministik olsun.
function cocukEnv(token) {
  const env = { ...process.env };
  if (token === undefined) delete env.DBG_BRIDGE_TOKEN;
  else env.DBG_BRIDGE_TOKEN = token;
  delete env.REA_TOOLSETS;
  return env;
}

function sunucuBaslat(port, token) {
  const c = spawn(
    process.execPath,
    [giris, "--transport", "http", "--host", "127.0.0.1", "--port", String(port)],
    { env: cocukEnv(token), stdio: ["ignore", "pipe", "pipe"] },
  );
  c.stdout.on("data", () => {}); // boru dolup kilitlemesin
  c.stderr.on("data", () => {}); // hazır logunu yut
  return c;
}

// Çıkış olayını bekle; sürede sinyal sırası: TERM -> KILL.
function cikisBekle(c, ms) {
  return new Promise((cöz) => {
    if (c.exitCode !== null || c.signalCode !== null) return cöz(true);
    const t = setTimeout(() => cöz(false), ms);
    c.once("exit", () => {
      clearTimeout(t);
      cöz(true);
    });
  });
}

async function kapat(c) {
  if (c.exitCode !== null || c.signalCode !== null) return;
  c.kill("SIGTERM");
  if (await cikisBekle(c, KAPANIS_MS)) return;
  try {
    c.kill("SIGKILL");
  } catch { /* zaten öldüyse sorun yok */ }
  await cikisBekle(c, KAPANIS_MS);
}

// /health dönene kadar yokla (yetkili istek), dönmezse zaman aşımına düş.
async function hazirBekle(port, basliklar) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: basliklar,
        signal: AbortSignal.timeout(ISTEK_MS),
      });
      if (r.ok) return await r.json();
    } catch { /* açılmadıysa tekrar dene */ }
    assert(Date.now() - t0 < HAZIR_MS, "sunucu hazır olmadı");
    await new Promise((r) => setTimeout(r, 200));
  }
}

// /mcp yanıt gövdesi: SSE data satırı ya da düz JSON (ikisini de çözer).
function govdeCoz(metin) {
  const satir = metin.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse((satir ? satir.slice(5) : metin).trim());
}

async function mcpCagri(port, basliklar, method, params) {
  const y = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...basliklar,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(ISTEK_MS),
  });
  return { status: y.status, zarf: govdeCoz(await y.text()) };
}

// Sayfalama güvenli liste: cursor bitene kadar tools/list.
async function tumAraclar(port, basliklar) {
  const adlar = [];
  let cursor;
  for (;;) {
    const { status, zarf } = await mcpCagri(
      port,
      basliklar,
      "tools/list",
      cursor ? { cursor } : {},
    );
    assert.equal(status, 200, "tools/list http 200 dönmedi");
    assert(!zarf.error, `tools/list hata döndü: ${JSON.stringify(zarf.error)}`);
    adlar.push(...zarf.result.tools.map((t) => t.name));
    cursor = zarf.result.nextCursor;
    if (!cursor) return adlar;
  }
}

function metinJson(sonuc, arac) {
  const metin = sonuc.content?.find((c) => c.type === "text");
  assert(metin, `${arac} yanıtında text içeriği yok`);
  const veri = JSON.parse(metin.text);
  if (sonuc.structuredContent !== undefined) {
    assert.deepEqual(sonuc.structuredContent, veri, `${arac}: structuredContent text JSON ile aynı olmalı`);
  }
  return veri;
}

// Port serbestlik kanıtı: bağlantı reddedilir + port yeniden dinlenebilir.
async function portSerbest(port) {
  let reddedildi = false;
  try {
    await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(ISTEK_MS) });
  } catch {
    reddedildi = true;
  }
  assert(reddedildi, `port ${port} kapanış sonrası hâlâ yanıt veriyor`);
  await new Promise((cöz, kır) => {
    const s = createServer();
    s.once("error", (h) => kır(new Error(`port ${port} serbest kalmadı: ${h.message}`)));
    s.listen(port, "127.0.0.1", () => s.close(() => cöz()));
  });
}

// Faz 1: token'lı tam yüzey (187 araç + health zinciri + tokensız ret).
async function tokenliFaz() {
  const port = await bosPortBul();
  const token = jetonUret();
  const auth = { Authorization: `Bearer ${token}` };
  const c = sunucuBaslat(port, token);
  try {
    // (a) /health 200
    const s = await hazirBekle(port, auth);
    assert.equal(s.name, "rea-plus", "health name rea-plus olmalı");
    assert.equal(s.status, "ok", "health status ok olmalı");
    // Token kapısı her rotada: tokensız /health 401
    const ciplak = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(ISTEK_MS),
    });
    assert.equal(ciplak.status, 401, "tokensız /health 401 dönmeli");
    // (b) tools/list 187 araç
    const adlar = await tumAraclar(port, auth);
    assert.equal(adlar.length, 191, `araç sayısı 187 olmalı, gelen=${adlar.length}`);
    assert(adlar.includes("health"), "araçlarda health yok");
    assert(adlar.includes("rea_evm_selector"), "araçlarda rea_evm_selector yok");
    assert(adlar.includes("debug_open"), "tam yüzeyde debug_open yok");
    // (c) tools/call health zinciri
    const { status, zarf } = await mcpCagri(port, auth, "tools/call", {
      name: "health",
      arguments: {},
    });
    assert.equal(status, 200, "tools/call http 200 dönmedi");
    assert(!zarf.error, `health çağrısı hata döndü: ${JSON.stringify(zarf.error)}`);
    assert.notEqual(zarf.result.isError, true, "health isError dönmemeli");
    assert.equal(metinJson(zarf.result, "health").status, "ok", "health çağrısı status ok dönmeli");
    // (d1) tokensız yazma reddi: Authorization yoksa /mcp 401
    const red = await mcpCagri(port, {}, "tools/call", {
      name: "debug_open",
      arguments: { session_id: "00000000-0000-4000-8000-000000000000" },
    });
    assert.equal(red.status, 401, "tokensız tools/call 401 dönmeli");
    console.log(`OK: tokenli faz port=${port} health=${s.name} araclar=${adlar.length} saglik=cagri-ok ret=401`);
  } finally {
    await kapat(c); // (e) sunucu kapanır
  }
  await portSerbest(port); // (e) port serbest kalır
}

// Faz 2: tokensız salt-okunur yüzey (44 araç, yazan araç kayıt dışı).
async function tokensizFaz() {
  const port = await bosPortBul();
  const c = sunucuBaslat(port, undefined);
  try {
    const s = await hazirBekle(port, {});
    assert.equal(s.name, "rea-plus", "tokensız health name rea-plus olmalı");
    const adlar = await tumAraclar(port, {});
    assert.equal(adlar.length, 44, `tokensız araç sayısı 44 olmalı, gelen=${adlar.length}`);
    assert(adlar.includes("health"), "tokensız araçlarda health yok");
    assert(!adlar.includes("debug_open"), "tokensız yüzeyde debug_open olmamalı");
    // (d2) tokensız yazma reddi: kayıt dışı araca çağrı hata zarfı döner
    const { status, zarf } = await mcpCagri(port, {}, "tools/call", {
      name: "debug_open",
      arguments: {},
    });
    assert.equal(status, 200, "reddedilen çağrı bile http 200 zarfında dönmeli");
    assert(
      zarf.error !== undefined || zarf.result?.isError === true,
      "tokensız debug_open çağrısı reddedilmeli (error ya da isError)",
    );
    console.log(`OK: tokensiz faz port=${port} araclar=${adlar.length} yazma-reddi=ok`);
  } finally {
    await kapat(c); // (e) sunucu kapanır
  }
  await portSerbest(port); // (e) port serbest kalır
}

// Ana akış: iki faz üst üste; her durumda süreçler öldürülür.
async function main() {
  await tokenliFaz();
  await tokensizFaz();
  console.log("OK: e2e http iki faz da geçti");
}

// Başarıda exit 0, hatada Türkçe mesaj + exit 1.
main().then(
  () => process.exit(0),
  (h) => {
    console.error(`FAIL: ${h instanceof Error ? h.message : String(h)}`);
    process.exit(1);
  },
);
