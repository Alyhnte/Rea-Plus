// session-queue.test.mjs: Dalga A/1 oturum komut kuyruğu (TDD).
// Kos: once `npm run build`, sonra `node --test tests/session-queue.test.mjs`
// (veya `node tests/session-queue.test.mjs`).
// Kapsam:
//  (a) Ayni oturuma 3 hizli cagri -> FIFO sirayla islenir.
//  (b) Farkli oturumlar paralel ilerler (birbirini beklemez).
//  (c) Kuyruk tasmasi -> acik hata (session_queue_full, durust zarf, sahte ok:true YOK), sunucu ayakta.
//  (d) Iptal (notifications/cancelled) -> bekleyen is duser, kuyruk devam eder.
//  (e) Kuyruk devre disiyken mevcut davranis degismez (171 arac, status araci yok).
//  (+) Bekleyen is makul surede islenemezse acik hatayla duser (session_queue_timeout), kuyruk kilitlenmez.
//  (+) REA_SESSION_SERIALIZE=1 (Dalga I/1): tek basina kuyrugu acar; ayni oturum TAM seri
//      (zaman damgasi kanitli), farkli oturum paralel; timeout+iptal korunur, kilit yok.
// Duzeyler: (1) sahte sunucu + dogrudan SessionQueue birimi, (2) gercek derlenmis sunucu (stdio JSON-RPC).
// Canli Frida/debugger/enjeksiyon yok; dogan her surec oldurulur; corpus'a dokunulmaz.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SessionQueue,
  parseSessionQueueConfig,
  sessionQueueEnabled,
  sessionSerializeEnabled,
  SESSION_QUEUE_STATUS_TOOL,
  DEFAULT_SESSION_QUEUE_MAX,
  DEFAULT_SESSION_QUEUE_TIMEOUT_MS,
} from "../dist/server/sessionQueue.js";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const canli = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ---------------------------------------------------------------- birim ---
describe("sessionQueueEnabled + parseSessionQueueConfig (birim)", () => {
  it("opt-in yalniz tam '1' ile acilir", () => {
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "1" }), true);
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "0" }), false);
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "true" }), false);
    assert.equal(sessionQueueEnabled({}), false);
    assert.equal(sessionQueueEnabled(undefined), false);
  });

  it("varsayilan derinlik 32 ve makul timeout; env override calisir", () => {
    assert.equal(DEFAULT_SESSION_QUEUE_MAX, 32);
    assert.ok(DEFAULT_SESSION_QUEUE_TIMEOUT_MS >= 1000);
    const v = parseSessionQueueConfig({});
    assert.equal(v.enabled, false);
    assert.equal(v.maxDepth, 32);
    assert.ok(v.timeoutMs >= 1000);
    const ozel = parseSessionQueueConfig({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_MAX: "3", REA_SESSION_QUEUE_TIMEOUT_MS: "500" });
    assert.equal(ozel.enabled, true);
    assert.equal(ozel.maxDepth, 3);
    assert.equal(ozel.timeoutMs, 500);
  });

  it("gecersiz limit acik hata verir (sessiz varsayilana dusmez)", () => {
    assert.throws(() => parseSessionQueueConfig({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_MAX: "0" }), /REA_SESSION_QUEUE_MAX/);
    assert.throws(() => parseSessionQueueConfig({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_MAX: "abc" }), /REA_SESSION_QUEUE_MAX/);
    assert.throws(() => parseSessionQueueConfig({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_TIMEOUT_MS: "-5" }), /REA_SESSION_QUEUE_TIMEOUT_MS/);
  });

  it("status arac adi sabittir", () => {
    assert.equal(SESSION_QUEUE_STATUS_TOOL, "session_queue_status");
  });
});

describe("SessionQueue birimi (sahte kosucular)", () => {
  it("(a) ayni oturuma 3 hizli cagri FIFO sirayla islenir", async () => {
    const q = new SessionQueue({ maxDepth: 10, timeoutMs: 5000 });
    const baslama = [];
    const bitis = [];
    const is = (ad, ms) => () => (async () => { baslama.push(ad); await bekle(ms); bitis.push(ad); return ad; })();
    // Farkli sureler: kuyruksuz kosuda bitis sirasi karisirdi; FIFO'da baslama==bitis==gonderim sirasi.
    const p1 = q.enqueue("oturum-a", "r1", is("bir", 50), { tool: "test" });
    const p2 = q.enqueue("oturum-a", "r2", is("iki", 10), { tool: "test" });
    const p3 = q.enqueue("oturum-a", "r3", is("uc", 10), { tool: "test" });
    assert.deepEqual(await Promise.all([p1, p2, p3]), ["bir", "iki", "uc"]);
    assert.deepEqual(baslama, ["bir", "iki", "uc"]);
    assert.deepEqual(bitis, ["bir", "iki", "uc"]);
    const d = q.status("oturum-a");
    assert.equal(d.pending, 0);
    assert.equal(d.running, false);
  });

  it("(b) farkli oturumlar birbirini beklemez (paralel ilerler)", async () => {
    const q = new SessionQueue({ maxDepth: 10, timeoutMs: 5000 });
    const olay = [];
    const is = (oturum, ad, ms) => () => (async () => {
      const t0 = Date.now();
      olay.push({ ev: "basla", oturum, ad, t: t0 });
      await bekle(ms);
      olay.push({ ev: "bit", oturum, ad, t: Date.now() });
      return ad;
    })();
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      q.enqueue("oturum-1", "r1", is("oturum-1", "a", 120), { tool: "test" }),
      q.enqueue("oturum-2", "r2", is("oturum-2", "b", 120), { tool: "test" }),
    ]);
    const toplam = Date.now() - t0;
    assert.equal(a, "a");
    assert.equal(b, "b");
    // Seri olsaydi ~240ms surerdi; paralel ~120ms. CI payiyla 200ms alti paralel kanitidir.
    assert.ok(toplam < 200, `paralel beklenen <200ms, gelen ${toplam}ms`);
    const basla2 = olay.find((o) => o.ev === "basla" && o.ad === "b").t;
    const bit1 = olay.find((o) => o.ev === "bit" && o.ad === "a").t;
    assert.ok(basla2 < bit1, "ikinci oturum birincinin bitisini beklememeli (ortusme olmali)");
  });

  it("(c) kuyruk tasmasi acik hata verir, kuyruk kilitlenmez", async () => {
    const q = new SessionQueue({ maxDepth: 2, timeoutMs: 5000 });
    const cagrildi = [];
    const uzun = q.enqueue("oturum-t", "r1", async () => { await bekle(120); cagrildi.push("uzun"); return "uzun"; }, { tool: "test" });
    const bekleyen = q.enqueue("oturum-t", "r2", async () => { cagrildi.push("bekleyen"); return "bekleyen"; }, { tool: "test" });
    // Kosan(1) + kuyrukta(1) = 2 = tavan; ucuncu acik hatayla reddedilmeli.
    let hata;
    try {
      await q.enqueue("oturum-t", "r3", async () => "asla", { tool: "test" });
    } catch (e) { hata = e; }
    assert.ok(hata, "tasma hata vermeli");
    assert.equal(hata.code ?? hata.error, "session_queue_full");
    assert.ok(!("ok" in hata) || hata.ok !== true, "sahte ok:true YOK");
    assert.equal(await uzun, "uzun");
    assert.equal(await bekleyen, "bekleyen");
    assert.deepEqual(cagrildi, ["uzun", "bekleyen"]);
    // Kuyruk saglam: yeni is alir.
    assert.equal(await q.enqueue("oturum-t", "r4", async () => "sonra", { tool: "test" }), "sonra");
  });

  it("(d) iptal bekleyen isi dusurur, kosani calistirmaz, kuyruk devam eder", async () => {
    const q = new SessionQueue({ maxDepth: 5, timeoutMs: 5000 });
    let bekleyenCagrildi = false;
    const uzun = q.enqueue("oturum-i", "r1", async () => { await bekle(100); return "uzun"; }, { tool: "test" });
    const bekleyen = q.enqueue("oturum-i", "r2", async () => { bekleyenCagrildi = true; return "bekleyen"; }, { tool: "test" });
    const iptalSonuc = q.cancel("r2");
    assert.equal(iptalSonuc, true);
    let hata;
    try { await bekleyen; } catch (e) { hata = e; }
    assert.ok(hata, "iptal edilen is reddedilmeli");
    assert.equal(hata.code ?? hata.error, "cancelled");
    assert.equal(await uzun, "uzun");
    assert.equal(bekleyenCagrildi, false, "iptal edilen isin kosucusu cagrilmamali");
    assert.equal(await q.enqueue("oturum-i", "r3", async () => "devam", { tool: "test" }), "devam");
  });

  it("(d2) AbortSignal abort kuyruktaki isi dusurur", async () => {
    const q = new SessionQueue({ maxDepth: 5, timeoutMs: 5000 });
    const ac = new AbortController();
    const uzun = q.enqueue("oturum-s", "r1", async () => { await bekle(100); return "uzun"; }, { tool: "test" });
    const bekleyen = q.enqueue("oturum-s", "r2", async () => "bekleyen", { tool: "test", signal: ac.signal });
    ac.abort(new Error("test iptali"));
    let hata;
    try { await bekleyen; } catch (e) { hata = e; }
    assert.ok(hata, "signal abort reddetmeli");
    assert.equal(hata.code ?? hata.error, "cancelled");
    assert.equal(await uzun, "uzun");
  });

  it("bekleyen is makul surede islenemezse acik hatayla duser, kuyruk kilitlenmez", async () => {
    const q = new SessionQueue({ maxDepth: 5, timeoutMs: 60 });
    const uzun = q.enqueue("oturum-z", "r1", async () => { await bekle(200); return "uzun"; }, { tool: "test" });
    let hata;
    try {
      await q.enqueue("oturum-z", "r2", async () => "bekleyen", { tool: "test" });
    } catch (e) { hata = e; }
    assert.ok(hata, "timeout hata vermeli");
    assert.equal(hata.code ?? hata.error, "session_queue_timeout");
    assert.ok(!("ok" in hata) || hata.ok !== true, "sahte ok:true YOK");
    assert.equal(await uzun, "uzun");
    assert.equal(await q.enqueue("oturum-z", "r3", async () => "sonra", { tool: "test" }), "sonra");
  });

  it("(e) sahte sunucuda devre disiyken sarmalayici dogrudan calistirir (siralama yok)", async () => {
    // Dogrudan SessionQueue kullanmadan: devre disi sarmalayici passthrough olmali.
    // Burada yalniz enabled bayragi dogrulanir; stdio (e) testi gercek davranisi kanitlar.
    assert.equal(sessionQueueEnabled({}), false);
  });
});

describe("sessionSerializeEnabled + TAM serilestirme (Dalga I/1, birim)", () => {
  it("serialize opt-in yalniz tam '1' ile acilir", () => {
    assert.equal(sessionSerializeEnabled({ REA_SESSION_SERIALIZE: "1" }), true);
    assert.equal(sessionSerializeEnabled({ REA_SESSION_SERIALIZE: "0" }), false);
    assert.equal(sessionSerializeEnabled({ REA_SESSION_SERIALIZE: "true" }), false);
    assert.equal(sessionSerializeEnabled({}), false);
    assert.equal(sessionSerializeEnabled(undefined), false);
  });

  it("kuyruk QUEUE=1 veya SERIALIZE=1 ile acilir; ikisi de yoksa kapali (mevcut davranis korunur)", () => {
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "1" }), true);
    assert.equal(sessionQueueEnabled({ REA_SESSION_SERIALIZE: "1" }), true);
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "1", REA_SESSION_SERIALIZE: "1" }), true);
    assert.equal(sessionQueueEnabled({}), false);
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "0" }), false);
    assert.equal(sessionQueueEnabled({ REA_SESSION_QUEUE: "0", REA_SESSION_SERIALIZE: "0" }), false);
  });

  it("parse SERIALIZE=1 ile acilir; limit override'lar calisir", () => {
    const v = parseSessionQueueConfig({ REA_SESSION_SERIALIZE: "1" });
    assert.equal(v.enabled, true);
    assert.equal(v.maxDepth, 32);
    assert.ok(v.timeoutMs >= 1000);
    const ozel = parseSessionQueueConfig({ REA_SESSION_SERIALIZE: "1", REA_SESSION_QUEUE_MAX: "3", REA_SESSION_QUEUE_TIMEOUT_MS: "500" });
    assert.equal(ozel.enabled, true);
    assert.equal(ozel.maxDepth, 3);
    assert.equal(ozel.timeoutMs, 500);
  });

  it("(a) TAM seri: ayni oturumda 2 uzun is cakismaz (zaman damgasi kanitli)", async () => {
    const q = new SessionQueue({ maxDepth: 10, timeoutMs: 5000 });
    const iz = {};
    const is = (ad, ms) => async () => {
      iz[ad] = { basla: Date.now() };
      await bekle(ms);
      iz[ad].bit = Date.now();
      return ad;
    };
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      q.enqueue("oturum-seri", "r1", is("bir", 120), { tool: "test" }),
      q.enqueue("oturum-seri", "r2", is("iki", 120), { tool: "test" }),
    ]);
    const toplam = Date.now() - t0;
    assert.equal(a, "bir");
    assert.equal(b, "iki");
    // Seri ispat: 2x120ms is ~240ms surer; paralel olsaydi ~120ms olurdu.
    assert.ok(toplam >= 200, `seri beklenen >=200ms, gelen ${toplam}ms`);
    // Cakisma yok: ikinci is, birinci bitmeden baslamaz (gercekten tek is kosar).
    assert.ok(iz.iki.basla >= iz.bir.bit, `cakisma: bir=[${iz.bir.basla},${iz.bir.bit}] iki basla=${iz.iki.basla}`);
  });

  it("(b) farkli oturumlar paralel: araliklar ortusur", async () => {
    const q = new SessionQueue({ maxDepth: 10, timeoutMs: 5000 });
    const iz = {};
    const is = (ad, ms) => async () => {
      iz[ad] = { basla: Date.now() };
      await bekle(ms);
      iz[ad].bit = Date.now();
      return ad;
    };
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      q.enqueue("oturum-p1", "r1", is("a", 120), { tool: "test" }),
      q.enqueue("oturum-p2", "r2", is("b", 120), { tool: "test" }),
    ]);
    const toplam = Date.now() - t0;
    assert.equal(a, "a");
    assert.equal(b, "b");
    // Paralel ispat: ~120ms; seri olsaydi ~240ms surerdi.
    assert.ok(toplam < 200, `paralel beklenen <200ms, gelen ${toplam}ms`);
    // Ortusme: ikinci, birinci bitmeden baslar.
    assert.ok(iz.b.basla < iz.a.bit, `ortusme beklenir: a=[${iz.a.basla},${iz.a.bit}] b basla=${iz.b.basla}`);
  });

  it("(d) iptal sonrasi seri devam eder, kuyruk kilitlenmez", async () => {
    const q = new SessionQueue({ maxDepth: 10, timeoutMs: 5000 });
    const ac = new AbortController();
    const iz = {};
    const is = (ad, ms) => async () => {
      iz[ad] = { basla: Date.now() };
      await bekle(ms);
      iz[ad].bit = Date.now();
      return ad;
    };
    const uzun = q.enqueue("oturum-k", "r1", is("bir", 120), { tool: "test" });
    const iptalEdilecek = q.enqueue("oturum-k", "r2", is("iki", 10), { tool: "test", signal: ac.signal });
    ac.abort(new Error("test iptali"));
    const devam = q.enqueue("oturum-k", "r3", is("uc", 10), { tool: "test" });
    let hata;
    try { await iptalEdilecek; } catch (e) { hata = e; }
    assert.ok(hata, "iptal edilen is reddedilmeli");
    assert.equal(hata.code ?? hata.error, "cancelled");
    assert.equal(await uzun, "bir");
    assert.equal(await devam, "uc");
    assert.ok(!("bit" in (iz.iki ?? {})), "iptal edilen isin kosucusu cagrilmamali");
    // Seri korunur: uc, bir bitmeden baslamaz.
    assert.ok(iz.uc.basla >= iz.bir.bit, `seri korunmali: bir bit=${iz.bir.bit} uc basla=${iz.uc.basla}`);
    const d = q.status("oturum-k");
    assert.equal(d.pending, 0);
    assert.equal(d.running, false);
  });

  it("(d2) timeout sonrasi seri devam eder, kuyruk kilitlenmez", async () => {
    const q = new SessionQueue({ maxDepth: 5, timeoutMs: 60 });
    const iz = {};
    const uzun = q.enqueue("oturum-t2", "r1", async () => {
      iz.bir = { basla: Date.now() };
      await bekle(200);
      iz.bir.bit = Date.now();
      return "uzun";
    }, { tool: "test" });
    let hata;
    try {
      await q.enqueue("oturum-t2", "r2", async () => "bekleyen", { tool: "test" });
    } catch (e) { hata = e; }
    assert.ok(hata, "timeout hata vermeli");
    assert.equal(hata.code ?? hata.error, "session_queue_timeout");
    assert.equal(await uzun, "uzun");
    const sonra = await q.enqueue("oturum-t2", "r3", async () => {
      iz.uc = { basla: Date.now() };
      return "sonra";
    }, { tool: "test" });
    assert.equal(sonra, "sonra");
    assert.ok(iz.uc.basla >= iz.bir.bit, "timeout sonrasi seri korunmali");
  });
});

// ------------------------------------------------------- gercek stdio ---
function stdioIstemci(env) {
  const s = {
    sunucu: null, tampon: "", stderrLog: "", sonrakiId: 1,
    bekleyenler: new Map(), mesajlar: [],
  };
  s.satirAl = (parca) => {
    s.tampon += parca.toString("utf8");
    for (;;) {
      const i = s.tampon.indexOf("\n");
      if (i < 0) return;
      const satir = s.tampon.slice(0, i).trim();
      s.tampon = s.tampon.slice(i + 1);
      if (!satir) continue;
      let mesaj;
      try { mesaj = JSON.parse(satir); } catch { continue; }
      s.mesajlar.push(mesaj);
      if (mesaj.id !== undefined && s.bekleyenler.has(mesaj.id)) {
        const b = s.bekleyenler.get(mesaj.id);
        s.bekleyenler.delete(mesaj.id);
        clearTimeout(b.zamanlayici);
        if (mesaj.error) b.reject(new Error(`JSON-RPC hata: ${JSON.stringify(mesaj.error)}`));
        else b.resolve(mesaj.result);
      }
    }
  };
  s.istek = (method, params, ms = 15000) => {
    const id = s.sonrakiId++;
    return {
      id,
      soz: new Promise((resolve, reject) => {
        const zamanlayici = setTimeout(() => {
          s.bekleyenler.delete(id);
          reject(new Error(`${method} zaman asimi. stderr: ${s.stderrLog.slice(-800)}`));
        }, ms);
        s.bekleyenler.set(id, { resolve, reject, zamanlayici });
        s.sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      }),
    };
  };
  s.bildirim = (method, params) => {
    s.sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  };
  s.baslat = async () => {
    s.sunucu = spawn(process.execPath, [join(kok, "dist", "server.js")], { cwd: kok, env, stdio: ["pipe", "pipe", "pipe"] });
    s.sunucu.stdout.on("data", s.satirAl);
    s.sunucu.stderr.on("data", (d) => { s.stderrLog = (s.stderrLog + d).slice(-4000); });
    const baslat = s.istek("initialize", {
      protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "session-queue-test", version: "0" },
    });
    const sonuc = await baslat.soz;
    assert.equal(sonuc.serverInfo.name, "rea-plus");
    s.bildirim("notifications/initialized", {});
    return s;
  };
  s.kapat = async () => {
    for (const b of s.bekleyenler.values()) { clearTimeout(b.zamanlayici); b.reject(new Error("test bitti")); }
    s.bekleyenler.clear();
    if (s.sunucu && s.sunucu.exitCode === null) {
      const cikis = new Promise((r) => s.sunucu.once("exit", r));
      try { s.sunucu.stdin.end(); } catch { /* kapali */ }
      const durum = await Promise.race([cikis.then(() => "cikti"), bekle(3000).then(() => "zaman")]);
      if (durum !== "cikti") {
        if (s.sunucu.pid && canli(s.sunucu.pid)) {
          try { spawnSync("taskkill", ["/PID", String(s.sunucu.pid), "/T", "/F"], { stdio: "ignore" }); }
          catch { /* olu */ }
        }
        await Promise.race([cikis, bekle(3000)]);
      }
    }
  };
  return s;
}

const govde = (sonuc) => JSON.parse(sonuc.content.find((c) => c.type === "text").text);
const temizEnv = (ek) => {
  const env = { ...process.env, ...ek };
  delete env.REA_WORKSPACE_ROOT;
  delete env.REA_TOOLSETS;
  delete env.REA_AUDIT_LOG;
  return env;
};
async function oturumAc(istemci, engine = "radare2") {
  const r = await istemci.istek("tools/call", { name: "session_open", arguments: { engine } }).soz;
  return govde(r).session_id;
}

describe("stdio: (e) kuyruk devre disiyken mevcut davranis degismez", () => {
  let istemci;
  before(async () => { istemci = await stdioIstemci(temizEnv({})).baslat(); });
  after(async () => { await istemci.kapat(); });

  it("arac sayisi 191 kalir, status araci yoktur", async () => {
    const sayfa = await istemci.istek("tools/list", {}).soz;
    assert.equal(sayfa.tools.length, 191);
    assert.ok(!sayfa.tools.some((t) => t.name === "session_queue_status"), "devre disiyken status araci olmamali");
  });

  it("oturum akisi aynen calisir", async () => {
    const sid = await oturumAc(istemci);
    const cek = await istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } }).soz;
    assert.equal(cek.isError, undefined);
    assert.ok(Array.isArray(govde(cek).events));
  });
});

describe("stdio: SERIALIZE=1 tek basina kuyrugu acar (kapali davranis korunur)", () => {
  let istemci;
  before(async () => {
    const env = temizEnv({ REA_SESSION_SERIALIZE: "1" });
    delete env.REA_SESSION_QUEUE;
    istemci = await stdioIstemci(env).baslat();
  });
  after(async () => { await istemci.kapat(); });

  it("arac sayisi 192 olur, status araci vardir", async () => {
    const sayfa = await istemci.istek("tools/list", {}).soz;
    assert.equal(sayfa.tools.length, 192);
    assert.ok(sayfa.tools.some((t) => t.name === "session_queue_status"), "status araci listede olmali");
  });

  it("oturum akisi aynen calisir (kilit yok)", async () => {
    const sid = await oturumAc(istemci);
    const cek = await istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } }).soz;
    assert.equal(cek.isError, undefined);
    assert.equal(govde(cek).session_id, sid);
  });
});

describe("stdio: kuyruk acikken (REA_SESSION_QUEUE=1)", () => {
  let istemci;
  before(async () => { istemci = await stdioIstemci(temizEnv({ REA_SESSION_QUEUE: "1" })).baslat(); });
  after(async () => { await istemci.kapat(); });

  it("arac sayisi 192 olur, status araci vardir", async () => {
    const sayfa = await istemci.istek("tools/list", {}).soz;
    assert.equal(sayfa.tools.length, 192);
    assert.ok(sayfa.tools.some((t) => t.name === "session_queue_status"), "status araci listede olmali");
  });

  it("(a) ayni oturuma 3 hizli cagri FIFO sirada ve basariyla doner", async () => {
    const sid = await oturumAc(istemci);
    istemci.mesajlar.length = 0;
    const c1 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } });
    const c2 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } });
    const c3 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } });
    const [r1, r2, r3] = await Promise.all([c1.soz, c2.soz, c3.soz]);
    for (const r of [r1, r2, r3]) {
      assert.equal(r.isError, undefined);
      assert.equal(govde(r).session_id, sid);
    }
    // Yanitlar gonderim sirasinda gelmeli (FIFO).
    const idx = [c1.id, c2.id, c3.id].map((id) => istemci.mesajlar.findIndex((m) => m.id === id));
    assert.ok(idx.every((i) => i >= 0), "uc yanit da gorulmeli");
    assert.ok(idx[0] < idx[1] && idx[1] < idx[2], `yanit sirasi FIFO olmali: ${idx}`);
  });

  it("(b) farkli oturumlar paralel ilerler (ikisi de basarir, kilit yok)", async () => {
    const s1 = await oturumAc(istemci);
    const s2 = await oturumAc(istemci);
    const c1 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: s1 } });
    const c2 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: s2 } });
    const [r1, r2] = await Promise.all([c1.soz, c2.soz]);
    assert.equal(govde(r1).session_id, s1);
    assert.equal(govde(r2).session_id, s2);
  });

  it("kuyruk durumu araci bekleyen sayisi ve isleyen bilgisini verir", async () => {
    const sid = await oturumAc(istemci);
    const r = await istemci.istek("tools/call", { name: "session_queue_status", arguments: { session_id: sid } }).soz;
    assert.equal(r.isError, undefined);
    const g = govde(r);
    assert.equal(g.ok, true);
    assert.equal(g.session_id, sid);
    assert.equal(typeof g.pending, "number");
    assert.equal(typeof g.running, "boolean");
    assert.equal(g.maxDepth, 32);
    const tum = govde(await istemci.istek("tools/call", { name: "session_queue_status", arguments: {} }).soz);
    assert.equal(tum.ok, true);
    assert.ok(Array.isArray(tum.sessions));
    assert.equal(typeof tum.totalPending, "number");
  });
});

describe("stdio: (c) kuyruk tasmasi acik hata, sunucu ayakta", () => {
  let istemci;
  before(async () => { istemci = await stdioIstemci(temizEnv({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_MAX: "3" })).baslat(); });
  after(async () => { await istemci.kapat(); });

  it("tasma session_queue_full doner (sahte ok:true yok), sunucu yasamaya devam eder", async () => {
    const sid = await oturumAc(istemci);
    // static_info r2 yoklamasiyla yavaslar; patlama kuyrugu doldurur.
    const istekler = [];
    for (let i = 0; i < 10; i++) {
      istekler.push(istemci.istek("tools/call", { name: "static_info", arguments: { session_id: sid } }, 20000));
    }
    const sonuclar = await Promise.all(istekler.map((c) => c.soz.then(
      (r) => ({ ok: true, r }),
      () => ({ ok: false }),
    )));
    // JSON-RPC duzeyinde hata olmamali; arac zarfinda isError + session_queue_full aranir.
    // Tum patlama cozulmeli (asim takilmamali).
    assert.equal(sonuclar.length, 10);
    let tasma = 0;
    for (const s of sonuclar) {
      if (!s.ok) continue;
      if (s.r.isError === true) {
        const g = govde(s.r);
        if (g.error === "session_queue_full") {
          tasma += 1;
          assert.ok(!("ok" in g) || g.ok !== true, "sahte ok:true YOK");
          assert.equal(g.session_id, sid);
        }
      }
    }
    assert.ok(tasma >= 1, `en az bir tasma hatasi beklenir, gelen ${tasma}`);
    // Sunucu ayakta: saglik + yeni oturum akisi calisir.
    const saglik = await istemci.istek("tools/call", { name: "health", arguments: {} }, 5000).soz;
    assert.equal(saglik.isError, undefined);
    const sid2 = await oturumAc(istemci);
    const cek = await istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid2 } }, 5000).soz;
    assert.equal(cek.isError, undefined);
  });
});

describe("stdio: (d) iptal bekleyen isi dusurur, kuyruk devam eder", () => {
  let istemci;
  before(async () => { istemci = await stdioIstemci(temizEnv({ REA_SESSION_QUEUE: "1", REA_SESSION_QUEUE_MAX: "10" })).baslat(); });
  after(async () => { await istemci.kapat(); });

  it("notifications/cancelled sonrasi kuyruk yeni isleri isler", async () => {
    const sid = await oturumAc(istemci);
    istemci.mesajlar.length = 0;
    // Birinci static_info kosarken (kuyrukta tutar), ikinci kuyruga girer.
    // static_info hizli bitebilir; iptalin kuyruktaki isi yakalamasi icin
    // c2 hemen arkasindan gonderilip cancel gecikmeden verilir.
    const c1 = istemci.istek("tools/call", { name: "static_info", arguments: { session_id: sid } }, 20000);
    const c2 = istemci.istek("tools/call", { name: "static_info", arguments: { session_id: sid } }, 20000);
    istemci.bildirim("notifications/cancelled", { requestId: c2.id, reason: "test iptali" });
    // Kuyruk devam etmeli: ucuncu cagri basariyla doner.
    await bekle(50);
    const c3 = istemci.istek("tools/call", { name: "events_pull", arguments: { session_id: sid } }, 20000);
    const r3 = await c3.soz;
    assert.equal(r3.isError, undefined);
    assert.equal(govde(r3).session_id, sid);
    const r1 = await c1.soz;
    assert.equal(r1.isError, undefined);
    // Ikinci: SDK cevabi bastirabilir (yanit yok) ya da cancelled/isError zarfi donebilir; ikisi de gecerli.
    let r2 = null;
    try {
      r2 = await Promise.race([c2.soz, bekle(3000).then(() => "yanit-yok")]);
    } catch { r2 = "yanit-yok"; }
    if (r2 !== null && r2 !== "yanit-yok") {
      assert.equal(r2.isError, true);
      const g = govde(r2);
      assert.ok(g.error === "cancelled" || g.code === "cancelled", `iptal zarfi beklenir: ${JSON.stringify(g).slice(0, 200)}`);
      assert.ok(!("ok" in g) || g.ok !== true, "sahte ok:true YOK");
    }
    // Sunucu ayakta.
    const saglik = await istemci.istek("tools/call", { name: "health", arguments: {} }, 5000).soz;
    assert.equal(saglik.isError, undefined);
  });
});
