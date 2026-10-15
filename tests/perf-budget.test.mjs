// perf-budget.test.mjs: ReaPlus performans bütçeleri (Dalga H/3).
// HEDEF: tools/list süresi + sunucu açılış süresi bütçeli. Yavaşlama sessizce
// birikmez: bütçe aşımı testi kırar.
// Koş: npm run build sonrası `node tests/perf-budget.test.mjs` (veya npm test).
//
// BÜTÇELER (gerekçe + ölçüm notu):
//   SAF_INIT_MS = 150   (süreç-içi initialize medyanı; ölçüm ~12-16ms → ~10x pay)
//   LIST_MS = 300       (saf ~30-31ms / spawn-içi ~14-23ms → ~10x pay, iki modda ortak)
//   CALL_MS = 150       (saf health ~15-16ms → ~10x pay; spawn-içi health ~0.6-0.8ms
//                        doğası gereği çok hızlı, bağlayıcı olan saf ölçüm)
//   SPAWN_ACILIS_MS = 3000 (spawn→initialize yanıtı medyanı ~359ms → ~8x pay)
//
// ÖLÇÜM (2026-10-15, bu makine):
//   Makine: AMD Ryzen 7 5700X3D 8-Core, Windows 11 Pro, 32 GB RAM,
//            Node v24.19.0, x64 win32. Worktree: dalga-h/perf, dist build'li.
//   Saf (InMemoryTransport, 1 ısınma + 3 tekrar medyanı):
//     tur0: init=16.1ms list=40.2ms call=14.8ms | tur1-3 medyan: init=11.7ms
//     list=30.6ms call=15.9ms; araç sayısı=187.
//     Kırmızı-faz tekrarı: init=15.1-15.7ms list=30.7ms call=15.1-15.2ms.
//   Spawn (dist/server.js stdio, 1 ısınma + 3 taze süreç medyanı):
//     açılış=391/364/359/342ms → medyan 359ms (son 3);
//     süreç-içi list medyanı ~13-23ms, health ~0.6-0.8ms.
//     Kırmızı-faz tekrarı: açılış=327-334ms, list=13.2-13.7ms, call=0.6ms.
// YÖNTEM (flake karşıtı): her suite'te before() bir kez ölçer (ısınma turu
// atılır, 3 tekrarın medyanı alınır); it() blokları yalnız assert eder.
// Tek ölçümle karar verilmez. Süreçler after()'da kapatılır, asılı timer yok.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createReaPlusMcpServer } from "../dist/server.js";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const ISTEK_ZAMAN_ASIMI_MS = 15_000;

// Bütçeler: üstteki gerekçe bloğuna bağlı; keyfi değil, ölçümün ~10x'i.
const BUTCE = {
  safInitMs: 150,
  listMs: 300,
  callMs: 150,
  spawnAcilisMs: 3000,
};

function medyan(dizi) {
  const s = [...dizi].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// --- Saf ölçüm (timersiz, süreç-içi, InMemoryTransport) ---
async function safTur() {
  const server = createReaPlusMcpServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const yanitlar = new Map();
  let idSayac = 0;
  clientT.onmessage = (m) => { if (m.id !== undefined) yanitlar.set(m.id, m); };
  const gonder = async (method, params) => {
    const id = ++idSayac;
    const t0 = performance.now();
    await clientT.send({ jsonrpc: "2.0", id, method, params });
    for (let i = 0; i < 500 && !yanitlar.has(id); i++) await new Promise((r) => setTimeout(r, 5));
    const dt = performance.now() - t0;
    const y = yanitlar.get(id);
    assert.ok(y, `${method} yanıtı gelmedi`);
    assert.ok(!y.error, `${method} protokol hatası: ${JSON.stringify(y.error)}`);
    return { sonuc: y.result, sureMs: dt };
  };
  const t0 = performance.now();
  await server.connect(serverT);
  await clientT.start();
  const init = await gonder("initialize", {
    protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "perf-budget-test", version: "0" },
  });
  const initDt = performance.now() - t0;
  await clientT.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  const l = await gonder("tools/list", {});
  const c = await gonder("tools/call", { name: "health", arguments: {} });
  const aracSayisi = l.sonuc.tools.length;
  try { await server.close(); } catch { /* zaten kapalı */ }
  try { await clientT.close(); } catch { /* zaten kapalı */ }
  return { initDt, listDt: l.sureMs, callDt: c.sureMs, aracSayisi, initSonuc: init.sonuc };
}

// --- Gerçek sunucu spawn ölçümü (dist/server.js stdio) ---
function spawnSureciAc() {
  const env = { ...process.env };
  delete env.REA_WORKSPACE_ROOT;
  delete env.REA_TOOLSETS;
  delete env.REA_AUDIT_LOG;
  const cocuk = spawn(process.execPath, [join(kok, "dist", "server.js")], {
    cwd: kok, env, stdio: ["pipe", "pipe", "pipe"],
  });
  let tampon = "";
  const bekleyenler = new Map();
  let sonrakiId = 1;
  cocuk.stdout.on("data", (parca) => {
    tampon += parca.toString("utf8");
    for (;;) {
      const i = tampon.indexOf("\n");
      if (i < 0) return;
      const satir = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (!satir) continue;
      let mesaj;
      try { mesaj = JSON.parse(satir); } catch { continue; } // JSON-dışı satır protokol dışı
      if (mesaj && typeof mesaj.id === "number" && bekleyenler.has(mesaj.id)) {
        const e = bekleyenler.get(mesaj.id);
        bekleyenler.delete(mesaj.id);
        clearTimeout(e.zamanlayici);
        if (mesaj.error) e.reddet(new Error(`JSON-RPC hata: ${JSON.stringify(mesaj.error)}`));
        else e.coz(mesaj.result);
      }
    }
  });
  const istek = (method, params) => {
    const id = sonrakiId++;
    return new Promise((coz, reddet) => {
      const zamanlayici = setTimeout(() => {
        bekleyenler.delete(id);
        reddet(new Error(`${method} zaman aşımı (${ISTEK_ZAMAN_ASIMI_MS}ms)`));
      }, ISTEK_ZAMAN_ASIMI_MS);
      bekleyenler.set(id, { coz, reddet, zamanlayici });
      cocuk.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };
  const kapat = async () => {
    for (const e of bekleyenler.values()) clearTimeout(e.zamanlayici);
    bekleyenler.clear();
    if (!cocuk || cocuk.exitCode !== null) return;
    const cikis = new Promise((r) => cocuk.once("exit", r));
    try { cocuk.stdin.end(); } catch { /* kapalı */ }
    const s = await Promise.race([cikis.then(() => "cikti"), new Promise((r) => setTimeout(() => r("zaman"), 3000))]);
    if (s !== "cikti") {
      try {
        if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(cocuk.pid), "/T", "/F"], { stdio: "ignore" });
        else cocuk.kill("SIGKILL");
      } catch { /* zaten ölü */ }
      await Promise.race([cikis, new Promise((r) => setTimeout(r, 3000))]);
    }
  };
  return { cocuk, istek, kapat };
}

describe("perf bütçeleri (saf, timersız InMemory)", () => {
  let olcum;
  before(async () => {
    const initS = [], listS = [], callS = [];
    let aracSayisi = 0;
    for (let tur = 0; tur < 4; tur++) {
      const r = await safTur();
      if (tur === 0) continue; // ısınma turu atılır
      initS.push(r.initDt);
      listS.push(r.listDt);
      callS.push(r.callDt);
      aracSayisi = r.aracSayisi;
    }
    olcum = { initMed: medyan(initS), listMed: medyan(listS), callMed: medyan(callS), aracSayisi };
    console.log(`SAF medyan: init=${olcum.initMed.toFixed(1)}ms list=${olcum.listMed.toFixed(1)}ms call=${olcum.callMed.toFixed(1)}ms araç=${aracSayisi}`);
  });

  it("(a) tools/list medyanı bütçe altında", () => {
    assert.equal(olcum.aracSayisi, 187, "araç sayısı 187 olmalı (gerçek değer)");
    assert.ok(olcum.listMed < BUTCE.listMs, `tools/list medyan ${olcum.listMed.toFixed(1)}ms bütçe ${BUTCE.listMs}ms üstünde`);
  });

  it("(b-saf) initialize medyanı bütçe altında", () => {
    assert.ok(olcum.initMed < BUTCE.safInitMs, `initialize medyan ${olcum.initMed.toFixed(1)}ms bütçe ${BUTCE.safInitMs}ms üstünde`);
  });

  it("(c-saf) tools/call (health) medyanı bütçe altında", () => {
    assert.ok(olcum.callMed < BUTCE.callMs, `health medyan ${olcum.callMed.toFixed(1)}ms bütçe ${BUTCE.callMs}ms üstünde`);
  });
});

describe("perf bütçeleri (gerçek sunucu spawn)", () => {
  let olcum;
  let canli = null;

  before(async () => {
    // Açılış: 4 taze süreç (ilki ısınma), spawn→initialize yanıtı süresi.
    const acilislar = [];
    for (let tur = 0; tur < 4; tur++) {
      const s = spawnSureciAc();
      try {
        const t0 = performance.now();
        const baslat = await s.istek("initialize", {
          protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "perf-budget-test", version: "0" },
        });
        const dt = performance.now() - t0;
        assert.equal(baslat.serverInfo.name, "rea-plus");
        if (tur > 0) acilislar.push(dt);
      } finally {
        await s.kapat();
      }
    }
    // Liste/çağrı: tek süreçte ısınma + 3 tekrar medyanı.
    canli = spawnSureciAc();
    await canli.istek("initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "perf-budget-test", version: "0" },
    });
    canli.cocuk.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    await canli.istek("tools/list", {});
    const listS = [], callS = [];
    for (let k = 0; k < 3; k++) {
      const a = performance.now();
      await canli.istek("tools/list", {});
      listS.push(performance.now() - a);
      const b = performance.now();
      await canli.istek("tools/call", { name: "health", arguments: {} });
      callS.push(performance.now() - b);
    }
    olcum = { acilisMed: medyan(acilislar), listMed: medyan(listS), callMed: medyan(callS) };
    console.log(`SPAWN medyan: açılış=${olcum.acilisMed.toFixed(0)}ms list=${olcum.listMed.toFixed(1)}ms call=${olcum.callMed.toFixed(1)}ms`);
  });

  after(async () => {
    if (canli) { await canli.kapat(); canli = null; }
  });

  it("(b-spawn) açılış (initialize yanıtı) medyanı bütçe altında", () => {
    assert.ok(olcum.acilisMed < BUTCE.spawnAcilisMs, `açılış medyan ${olcum.acilisMed.toFixed(0)}ms bütçe ${BUTCE.spawnAcilisMs}ms üstünde`);
  });

  it("(a-spawn) tools/list medyanı bütçe altında", () => {
    assert.ok(olcum.listMed < BUTCE.listMs, `spawn list medyan ${olcum.listMed.toFixed(1)}ms bütçe ${BUTCE.listMs}ms üstünde`);
  });

  it("(c-spawn) tools/call (health) medyanı bütçe altında", () => {
    assert.ok(olcum.callMed < BUTCE.callMs, `spawn health medyan ${olcum.callMed.toFixed(1)}ms bütçe ${BUTCE.callMs}ms üstünde`);
  });
});
