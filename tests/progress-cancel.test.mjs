// progress-cancel.test.mjs: rea_process_run progress/cancel pilotu.
// Kos: once `npm run build`, sonra `node --test tests/progress-cancel.test.mjs`.
// Kapsam: (1) paced progress helper (token yoklugu, ilk bildirim, ~20/sn pacing,
// monotonluk, notify hatasi), (2) asenkron domain cekirdegi (basari, nonzero,
// timeout, tampon siniri, AbortController iptali + surec agaci olumu),
// (3) gercek stdio JSON-RPC (progressToken bildirimi sonuctan once,
// tokensiz cagrida bildirim yok, notifications/cancelled sureci oldurur).
// Hicbir test canli debugger/Frida/ag kullanmaz; dogan her surec oldurulur.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPacedProgress, pilotContextFromCtx, PROGRESS_MIN_INTERVAL_MS } from "../dist/server/progress.js";
import { rea_process_run_async } from "../dist/rea-domains/firmware-browser/ProcessCapture.js";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const canli = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const kisaHash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

async function olumuBekle(pid, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (!canli(pid)) return true;
    await bekle(50);
  }
  return !canli(pid);
}

function pidOku(yol) {
  const n = Number(readFileSync(yol, "utf8").trim());
  assert.ok(Number.isInteger(n) && n > 0, `pid dosyasi gecerli pid icermeli: ${yol}`);
  return n;
}

describe("createPacedProgress (birim)", () => {
  it("token yoksa notify hic cagrilmaz", async () => {
    let sayi = 0;
    const notify = async () => { sayi += 1; };
    await createPacedProgress(notify, undefined)({ progress: 1 });
    await createPacedProgress(notify, null)({ progress: 1 });
    await createPacedProgress(undefined, "tok")({ progress: 1 });
    assert.equal(sayi, 0);
  });

  it("ilk bildirim gecikmeden gider, sonrakiler en fazla ~20/sn ve monotondur", async () => {
    let simdi = 1000; // sahte saat: pacing deterministik olculur
    const giden = [];
    const bildir = createPacedProgress(
      async (n) => { giden.push({ t: simdi, progress: n.params.progress, token: n.params.progressToken }); },
      "tok-1",
      { now: () => simdi },
    );
    assert.equal(PROGRESS_MIN_INTERVAL_MS, 50);
    await bildir({ progress: 1 }); // ilk: hemen
    simdi += 10; await bildir({ progress: 2 }); // 10ms: cok erken, atilir
    simdi += 30; await bildir({ progress: 3 }); // 40ms: hala erken, atilir
    simdi += 10; await bildir({ progress: 3 }); // 50ms: gonderilir
    simdi += 100; await bildir({ progress: 3 }); // artmayan progress atilir
    simdi += 100; await bildir({ progress: 2 }); // gerileyen progress atilir
    await bildir({ progress: 4, total: 10, message: "yari" }); // gecerli artis gider
    assert.deepEqual(giden.map((g) => g.progress), [1, 3, 4]);
    assert.deepEqual(giden.map((g) => g.t), [1000, 1050, 1250]);
    assert.ok(giden.every((g) => g.token === "tok-1"));
  });

  it("notify hatasi reporter'i cokertmez; sonraki gonderimler surer", async () => {
    let simdi = 0;
    let cagri = 0;
    const bildir = createPacedProgress(
      () => { cagri += 1; if (cagri === 1) throw new Error("boom"); return Promise.reject(new Error("yine")); },
      42,
      { now: () => simdi },
    );
    await bildir({ progress: 1 }); // senkron throw yutulur
    simdi += 60;
    await bildir({ progress: 2 }); // reject de yutulur
    assert.equal(cagri, 2);
  });

  it("pilotContextFromCtx: ctx yoksa sessiz; varsa sinyal ve token tasinir", async () => {
    const bos = pilotContextFromCtx(undefined);
    assert.equal(bos.signal, undefined);
    await bos.onProgress({ progress: 1 }); // hata vermeden sessiz

    const ac = new AbortController();
    const giden = [];
    const pilot = pilotContextFromCtx({
      mcpReq: {
        signal: ac.signal,
        _meta: { progressToken: "tok-ctx" },
        notify: async (n) => { giden.push(n); },
      },
    });
    assert.equal(pilot.signal, ac.signal);
    await pilot.onProgress({ progress: 5, message: "adim" });
    assert.equal(giden.length, 1);
    assert.equal(giden[0].method, "notifications/progress");
    assert.deepEqual(giden[0].params, { progressToken: "tok-ctx", progress: 5, message: "adim" });
  });
});

describe("rea_process_run_async (domain)", () => {
  it("kisa Node komutu basarisi senkron sozlesmeyle ayni sekli korur", async () => {
    const r = await rea_process_run_async(process.execPath, { args: ["-e", "process.stdout.write('hello')"] });
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_process_run");
    assert.equal(r.kayıt.çıkış_kodu, 0);
    assert.equal(r.kayıt.kanal, "pipe");
    assert.equal(r.kayıt.stdout_sha256_kısa, kisaHash("hello"));
    assert.ok(r.kayıt.süre_ms >= 0);
  });

  it("nonzero exit ok:true ve ayni kodla doner", async () => {
    const r = await rea_process_run_async(process.execPath, { args: ["-e", "process.exit(3)"] });
    assert.equal(r.ok, true);
    assert.equal(r.kayıt.çıkış_kodu, 3);
  });

  it("olmayan komut ok:true/kod null; bos komut capability_unsupported", async () => {
    const yok = await rea_process_run_async("kesinlikle-yok-12345.exe", {});
    assert.equal(yok.ok, true);
    assert.equal(yok.kayıt.çıkış_kodu, null);
    const bos = await rea_process_run_async("", {});
    assert.equal(bos.ok, false);
    assert.equal(bos.code, "capability_unsupported");
  });

  it("zaman asimi mevcut davranisla uyumlu: ok:true/kod null ve hizli biter", async () => {
    const t0 = Date.now();
    const r = await rea_process_run_async(process.execPath, {
      args: ["-e", "setTimeout(()=>{},10000)"],
      zaman_aşımı_ms: 400,
    });
    assert.equal(r.ok, true);
    assert.equal(r.kayıt.çıkış_kodu, null);
    assert.ok(Date.now() - t0 < 5000, "zaman asimi kosusu takilmamali");
  });

  it("stdout tampon siniri (1 MiB) korunur: asimda kod null, hash ilk 1 MiB uzerinden", async () => {
    const r = await rea_process_run_async(process.execPath, {
      args: ["-e", "process.stdout.write('x'.repeat(2*1024*1024))"],
      zaman_aşımı_ms: 10000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.kayıt.çıkış_kodu, null);
    assert.equal(r.kayıt.stdout_sha256_kısa, kisaHash("x".repeat(1024 * 1024)));
  });

  it("baslamadan iptal edilmis sinyal surec dogurmadan cancelled doner", async () => {
    const ac = new AbortController();
    ac.abort();
    const r = await rea_process_run_async(process.execPath, {
      args: ["-e", "setTimeout(()=>{},10000)"],
      signal: ac.signal,
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "cancelled");
    assert.ok(r.kayıt.süre_ms < 1000);
  });

  it("AbortController iptali: cancelled govdesi + cocuk ve torun surec agaci olur", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-cancel-"));
    const pid1Yol = join(dir, "cocuk.pid");
    const pid2Yol = join(dir, "torun.pid");
    const torunJs = join(dir, "torun.cjs");
    const uyuyanJs = join(dir, "uyuyan.cjs");
    writeFileSync(torunJs, "require('node:fs').writeFileSync(process.argv[2], String(process.pid));\nsetTimeout(()=>{},30000);\n");
    writeFileSync(uyuyanJs, [
      "const fs = require('node:fs');",
      "const { spawn } = require('node:child_process');",
      "fs.writeFileSync(process.argv[2], String(process.pid));",
      "const c = spawn(process.execPath, [process.argv[4], process.argv[3]], { stdio: 'ignore' });",
      "c.unref();",
      "process.stdout.write('hazir');",
      "setTimeout(()=>{},30000);",
    ].join("\n"));
    let pid1; let pid2;
    try {
      const ac = new AbortController();
      const ilerlemeler = [];
      const t0 = Date.now();
      const kosu = rea_process_run_async(process.execPath, {
        args: [uyuyanJs, pid1Yol, pid2Yol, torunJs],
        signal: ac.signal,
        zaman_aşımı_ms: 25000,
        onProgress: (u) => { ilerlemeler.push(u.progress); },
      });
      // Iki pid dosyasi da yazilana kadar bekle (surecler gercekten ayakta).
      const son = Date.now() + 8000;
      while (Date.now() < son && !(existsSync(pid1Yol) && existsSync(pid2Yol))) await bekle(25);
      assert.ok(existsSync(pid1Yol) && existsSync(pid2Yol), "cocuk ve torun pid dosyalari yazilmali");
      pid1 = pidOku(pid1Yol); pid2 = pidOku(pid2Yol);
      assert.ok(canli(pid1) && canli(pid2), "iptal oncesi iki surec de canli olmali");
      ac.abort();
      const r = await Promise.race([
        kosu,
        bekle(8000).then(() => { throw new Error("iptal edilen kosu 8sn icinde donmedi"); }),
      ]);
      assert.equal(r.ok, false);
      assert.equal(r.code, "cancelled");
      assert.equal(r.kayıt.çıkış_kodu, null);
      assert.ok(Date.now() - t0 < 8000, "iptal, 30sn uyuyan komutu beklememeli");
      // Surec sizintisi yok: cocuk da torun da olu (agac oldurme kaniti).
      assert.equal(await olumuBekle(pid1), true, "cocuk surec olmeli");
      assert.equal(await olumuBekle(pid2), true, "torun surec olmeli (agac oldurme)");
      // Ilerleme en az bir kez ve artan sirada gitti.
      assert.ok(ilerlemeler.length >= 1, "onProgress en az bir kez cagrilmali");
      assert.ok(ilerlemeler.every((v, i) => i === 0 || v > ilerlemeler[i - 1]), "progress monoton artmali");
    } finally {
      // Sizinti birakma: test her kosulda kendi sureclerini temizler.
      for (const pid of [pid1, pid2]) {
        if (pid && canli(pid)) {
          if (process.platform === "win32") { try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* olu */ } }
          else { try { process.kill(pid, "SIGKILL"); } catch { /* olu */ } }
        }
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("stdio JSON-RPC: progress + cancelled", () => {
  // MCP semasi yalniz `cmd` tasir (args yok); uyuyan tek-komut icin NODE_OPTIONS
  // --require hilesi kullanilir: betik, yalniz script'siz `node` cocugunda ve
  // gate dosyasi varken pid yazar + uyur. Sunucunun kendisinde (argv[1] dolu) no-op'tur.
  let sunucu; let tampon = ""; let stderrLog = ""; let sonrakiId = 1;
  const mesajlar = [];
  const bekleyenler = new Map();
  let dir; let pidYol; let gateYol; let uyuyanPid;

  function agaciOldur(pid) {
    if (!pid || !canli(pid)) return;
    if (process.platform === "win32") { try { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* olu */ } }
    else { try { process.kill(pid, "SIGKILL"); } catch { /* olu */ } }
  }

  function satirAl(parca) {
    tampon += parca.toString("utf8");
    for (;;) {
      const i = tampon.indexOf("\n");
      if (i < 0) return;
      const satir = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (!satir) continue;
      let mesaj;
      try { mesaj = JSON.parse(satir); } catch { continue; }
      mesajlar.push(mesaj);
      if (typeof mesaj.id === "number" && bekleyenler.has(mesaj.id)) {
        const b = bekleyenler.get(mesaj.id);
        bekleyenler.delete(mesaj.id);
        clearTimeout(b.zamanlayici);
        if (mesaj.error) b.reject(new Error(`JSON-RPC hata: ${JSON.stringify(mesaj.error)}`));
        else b.resolve(mesaj.result);
      }
    }
  }

  function istek(method, params, ms = 15000) {
    const id = sonrakiId++;
    return {
      id,
      soz: new Promise((resolve, reject) => {
        const zamanlayici = setTimeout(() => {
          bekleyenler.delete(id);
          reject(new Error(`${method} zaman asimi. stderr: ${stderrLog.slice(-800)}`));
        }, ms);
        bekleyenler.set(id, { resolve, reject, zamanlayici });
        sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      }),
    };
  }

  function bildirimGonder(method, params) {
    sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "rea-stdio-"));
    pidYol = join(dir, "cocuk.pid");
    gateYol = join(dir, "gate.txt");
    const sleepYol = join(dir, "sleep.cjs");
    writeFileSync(sleepYol, [
      "const fs = require('node:fs');",
      "if (!process.argv[1] && process.env.REA_TEST_PIDFILE && process.env.REA_TEST_GATE && fs.existsSync(process.env.REA_TEST_GATE)) {",
      "  fs.writeFileSync(process.env.REA_TEST_PIDFILE, String(process.pid));",
      "  setInterval(() => {}, 1000);",
      "}",
    ].join("\n"));
    const env = { ...process.env };
    delete env.REA_WORKSPACE_ROOT;
    delete env.REA_TOOLSETS;
    delete env.REA_AUDIT_LOG;
    env.NODE_OPTIONS = `--require ${sleepYol}`;
    env.REA_TEST_PIDFILE = pidYol;
    env.REA_TEST_GATE = gateYol;
    sunucu = spawn(process.execPath, [join(kok, "dist", "server.js")], { cwd: kok, env, stdio: ["pipe", "pipe", "pipe"] });
    sunucu.stdout.on("data", satirAl);
    sunucu.stderr.on("data", (d) => { stderrLog = (stderrLog + d).slice(-4000); });
    const baslat = istek("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "progress-cancel-test", version: "0" },
    });
    const sonuc = await baslat.soz;
    assert.equal(sonuc.serverInfo.name, "rea-plus");
    bildirimGonder("notifications/initialized", {});
  });

  after(async () => {
    for (const b of bekleyenler.values()) { clearTimeout(b.zamanlayici); b.reject(new Error("test bitti")); }
    bekleyenler.clear();
    agaciOldur(uyuyanPid);
    if (sunucu && sunucu.exitCode === null) {
      const cikis = new Promise((r) => sunucu.once("exit", r));
      try { sunucu.stdin.end(); } catch { /* kapali */ }
      const durum = await Promise.race([cikis.then(() => "cikti"), bekle(3000).then(() => "zaman")]);
      if (durum !== "cikti") { agaciOldur(sunucu.pid); await Promise.race([cikis, bekle(3000)]); }
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("progressToken'li cagrida bildirim sonuctan once gelir; token yankilanir", async () => {
    mesajlar.length = 0;
    const cagri = istek("tools/call", {
      name: "rea_process_run",
      arguments: { cmd: process.execPath },
      _meta: { progressToken: "tok-stdio" },
    });
    const sonuc = await cagri.soz;
    assert.notEqual(sonuc.isError, true);
    const metin = sonuc.content.find((c) => c.type === "text");
    assert.equal(JSON.parse(metin.text).ok, true);
    const ilerlemeler = mesajlar.filter((m) => m.method === "notifications/progress");
    assert.ok(ilerlemeler.length >= 1, "en az bir progress bildirimi gelmeli");
    assert.ok(ilerlemeler.every((m) => m.params.progressToken === "tok-stdio"));
    const siraBildirim = mesajlar.findIndex((m) => m.method === "notifications/progress");
    const siraSonuc = mesajlar.findIndex((m) => m.id === cagri.id);
    assert.ok(siraBildirim >= 0 && siraSonuc > siraBildirim, "bildirim sonuctan once gelmeli");
    const degerler = ilerlemeler.map((m) => m.params.progress);
    assert.ok(degerler.every((v, i) => i === 0 || v > degerler[i - 1]), "progress monoton artmali");
  });

  it("token'suz cagrida hicbir progress bildirimi gelmez", async () => {
    mesajlar.length = 0;
    const cagri = istek("tools/call", {
      name: "rea_process_run",
      arguments: { cmd: process.execPath },
    });
    const sonuc = await cagri.soz;
    assert.notEqual(sonuc.isError, true);
    assert.equal(mesajlar.filter((m) => m.method === "notifications/progress").length, 0);
  });

  it("notifications/cancelled uyuyan sureci oldurur; sunucu cevap vermeyi surdurur", async () => {
    writeFileSync(gateYol, "1");
    mesajlar.length = 0;
    const cagri = istek("tools/call", {
      name: "rea_process_run",
      arguments: { cmd: process.execPath },
      _meta: { progressToken: "tok-iptal" },
    }, 20000);
    // Cagri, SDK iptal edilen istege cevap gondermeyebilecegi icin yarista izlenir.
    let cevap = null;
    const cevapSoz = cagri.soz.then((r) => { cevap = r; return r; }).catch(() => null);
    const son = Date.now() + 8000;
    while (Date.now() < son && !existsSync(pidYol)) await bekle(25);
    assert.ok(existsSync(pidYol), "uyuyan cocuk pid yazmali");
    uyuyanPid = pidOku(pidYol);
    assert.ok(canli(uyuyanPid), "iptal oncesi cocuk canli olmali");
    assert.ok(mesajlar.some((m) => m.method === "notifications/progress"), "iptal oncesi progress akmali");

    const t0 = Date.now();
    bildirimGonder("notifications/cancelled", { requestId: cagri.id, reason: "test iptali" });
    assert.equal(await olumuBekle(uyuyanPid, 5000), true, "cancelled sonrasi cocuk surec olmeli");
    assert.ok(Date.now() - t0 < 5000, "olum hizli olmali (15sn domain timeout beklenmemeli)");

    // Cevap gelirse cancelled/isError zarfi olmali; gelmezse SDK'nin cevabi
    // bastirmasi da gecerlidir (spec: iptal edilen istege cevap gonderilmez).
    await Promise.race([cevapSoz, bekle(1500)]);
    if (cevap !== null) {
      assert.equal(cevap.isError, true);
      const metin = cevap.content.find((c) => c.type === "text");
      assert.equal(JSON.parse(metin.text).code, "cancelled");
      bekleyenler.delete(cagri.id);
    } else {
      // Bekleyen kaydi temizle: after() sahte timeout ile ugrasmasin.
      const b = bekleyenler.get(cagri.id);
      if (b) { clearTimeout(b.zamanlayici); bekleyenler.delete(cagri.id); }
    }

    const ping = istek("ping", {}, 5000);
    assert.deepEqual(await ping.soz, {});
    // Arac yuzeyi de saglam: hizli bir arac cagrisi basarili doner.
    const kapsama = istek("tools/call", { name: "rea_coverage", arguments: { incelenen: 1, toplam: 4 } }, 5000);
    assert.equal((await kapsama.soz).structuredContent.oran, 0.25);
    uyuyanPid = undefined; // oldu; after() tekrar ugrasmasin
  });
});
