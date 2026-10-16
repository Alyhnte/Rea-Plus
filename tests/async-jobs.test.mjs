// async-jobs.test.mjs: REA_ASYNC_JOBS=1 async job pilotu.
// Kos: once `npm run build`, sonra `node --test tests/async-jobs.test.mjs`.
// Kapsam: (1) AsyncJobManager birimi (kuyruk/es-zamanlilik tavani, kuyrukta
// ve calisirken iptal, hata sonucu), (2) gercek stdio JSON-RPC (opt-in
// yuzey 176 arac, whitelist disi isError, job yasam dongusu, calisan
// rea_process_run job'inin cocuk surec agacini oldurerek iptali).
// Canli debugger/ag yok; dogan her surec test sonunda oldurulur.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncJobManager, ASYNC_JOB_TOOLS, asyncJobsEnabled } from "../dist/server/asyncJobs.js";
import { reaScanRepoStaged } from "../dist/server/registerReaTools.js";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const canli = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

describe("AsyncJobManager (birim)", () => {
  it("whitelist yalniz AbortSignal alan guvenli uzun araclari icerir; opt-in yalniz '1'", () => {
    // Dalga E/2: pilot + tarama (is-yuzu hizli iptal, salt-okur) + davranis kosusu
    // (async-ozel; iptalde hizli cancelled, artik surec kendi timeout'uyla temizlenir).
    // Elenen: rea_jadx_full (spawnSync event-loop'u kilitler + cocuk handle'i yok,
    // iptal ortada islemez), rea_behavior_full (saf senkron hesap, uzun degil).
    assert.deepEqual([...ASYNC_JOB_TOOLS], ["rea_process_run", "rea_scan_repo", "rea_behavior_run"]);
    assert.equal(asyncJobsEnabled({ REA_ASYNC_JOBS: "1" }), true);
    assert.equal(asyncJobsEnabled({ REA_ASYNC_JOBS: "true" }), false);
    assert.equal(asyncJobsEnabled({}), false);
  });

  it("es-zamanlilik tavani + kuyruk: ucuncu is ilk ikisi bitmeden baslamaz", async () => {
    const m = new AsyncJobManager({ maxConcurrent: 2 });
    const baslayan = [];
    const gecikmeli = (ad, ms) => async () => { baslayan.push(ad); await bekle(ms); return { ok: true, ad }; };
    const a = m.start("rea_process_run", gecikmeli("a", 60));
    const b = m.start("rea_process_run", gecikmeli("b", 60));
    const c = m.start("rea_process_run", gecikmeli("c", 5));
    assert.equal(m.status(c.id).status, "queued");
    assert.deepEqual(baslayan, ["a", "b"]);
    assert.equal((await m.wait(c.id)).status, "succeeded");
    assert.deepEqual(baslayan, ["a", "b", "c"]);
    assert.equal(m.result(a.id).ready, true);
    assert.deepEqual(m.result(a.id).result, { ok: true, ad: "a" });
    assert.equal(m.list().length, 3);
  });

  it("kuyruktaki is calismadan cancelled olur ve runner hic cagrilmaz", async () => {
    const m = new AsyncJobManager({ maxConcurrent: 1 });
    let cagrildi = false;
    const uzun = m.start("rea_process_run", async () => { await bekle(80); return { ok: true }; });
    const bekleyen = m.start("rea_process_run", async () => { cagrildi = true; return { ok: true }; });
    assert.equal(m.cancel(bekleyen.id).status, "cancelled");
    assert.equal((await m.wait(bekleyen.id)).status, "cancelled");
    assert.equal(m.result(bekleyen.id).ready, true);
    await m.wait(uzun.id);
    assert.equal(cagrildi, false);
  });

  it("calisan scan kosucusu abortta hizli cancelled doner (gercek wrapper + sentetik ctx)", async () => {
    // Deterministik kanit: iptal, kosucu ilk yield'ine donmeden AYNI tick'te ateslenir;
    // abort dinleyicisi + yaris cozumu walk baslamadan kurulur -> cancelled garanti.
    // (Bilinen sinir: walk fazi senkron bloklar; tick disi abort'lar walk sonuna sarkar.
    // Artik yurume sinirli/salt-okur sekilde kendiliginden biter, surec/timer kalmaz.)
    const dir = mkdtempSync(join(tmpdir(), "rea-mgrscan-"));
    try {
      for (let i = 0; i < 3000; i += 1) writeFileSync(join(dir, `f${i}.js`), `const v${i} = ${i};\n`);
      const m = new AsyncJobManager({ maxConcurrent: 1 });
      const job = m.start("rea_scan_repo", (signal) => reaScanRepoStaged({ path: dir }, { mcpReq: { signal } }));
      assert.equal(m.status(job.id).status, "running");
      const t0 = Date.now();
      m.cancel(job.id);
      const son = await m.wait(job.id);
      assert.equal(son.status, "cancelled");
      assert.ok(Date.now() - t0 < 5000, "iptal hizli terminal olmali");
      assert.equal(m.result(job.id).ready, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("calisan is AbortSignal ile cancelled olur; firlatan is failed + error tasir", async () => {
    const m = new AsyncJobManager();
    const uyuyan = m.start("rea_process_run", (signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve({ ok: false, code: "cancelled", reason: "iptal" }), { once: true });
    }));
    const bozuk = m.start("rea_process_run", async () => { throw new Error("patladi"); });
    m.cancel(uyuyan.id);
    assert.equal((await m.wait(uyuyan.id)).status, "cancelled");
    const b = await m.wait(bozuk.id);
    assert.equal(b.status, "failed");
    assert.equal(b.error, "patladi");
    assert.equal(m.status("job_yok"), undefined);
    assert.equal(m.cancel("job_yok"), undefined);
  });
});

describe("stdio JSON-RPC: async jobs (REA_ASYNC_JOBS=1)", () => {
  let sunucu; let tampon = ""; let stderrLog = ""; let sonrakiId = 1;
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
    return new Promise((resolve, reject) => {
      const zamanlayici = setTimeout(() => { bekleyenler.delete(id); reject(new Error(`${method} zaman asimi. stderr: ${stderrLog.slice(-800)}`)); }, ms);
      bekleyenler.set(id, { resolve, reject, zamanlayici });
      sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  const cagir = (name, args) => istek("tools/call", { name, arguments: args });
  const govde = (sonuc) => JSON.parse(sonuc.content.find((c) => c.type === "text").text);
  async function durumuBekle(jobId, hedef, ms = 10000) {
    const son = Date.now() + ms;
    for (;;) {
      const s = govde(await cagir("rea_job_status", { job_id: jobId }));
      if (s.job.status === hedef) return s.job;
      if (Date.now() > son) throw new Error(`job ${hedef} olmadi, son durum: ${s.job.status}`);
      await bekle(50);
    }
  }

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "rea-asyncjobs-"));
    pidYol = join(dir, "cocuk.pid");
    gateYol = join(dir, "gate.txt");
    const sleepYol = join(dir, "sleep.cjs");
    // MCP semasi yalniz cmd tasir; script'siz `node` cocugu gate varken uyur.
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
    env.REA_ASYNC_JOBS = "1";
    env.NODE_OPTIONS = `--require ${sleepYol}`;
    env.REA_TEST_PIDFILE = pidYol;
    env.REA_TEST_GATE = gateYol;
    sunucu = spawn(process.execPath, [join(kok, "dist", "server.js")], { cwd: kok, env, stdio: ["pipe", "pipe", "pipe"] });
    sunucu.stdout.on("data", satirAl);
    sunucu.stderr.on("data", (d) => { stderrLog = (stderrLog + d).slice(-4000); });
    const baslat = await istek("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "async-jobs-test", version: "0" } });
    assert.equal(baslat.serverInfo.name, "rea-plus");
    sunucu.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
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

  it("opt-in yuzey 196 arac: 191 + 5 job araci", async () => {
    const sayfa = await istek("tools/list", {});
    assert.equal(sayfa.tools.length, 196);
    for (const ad of ["rea_job_start", "rea_job_status", "rea_job_result", "rea_job_cancel", "rea_job_list"]) {
      assert.ok(sayfa.tools.some((t) => t.name === ad), `${ad} listede olmali`);
    }
  });

  it("whitelist disi arac job olarak baslatilamaz (isError)", async () => {
    const sonuc = await cagir("rea_job_start", { tool: "rea_coverage", arguments: { incelenen: 1, toplam: 2 } });
    assert.equal(sonuc.isError, true);
    assert.equal(govde(sonuc).code, "async_job_tool_not_whitelisted");
  });

  it("iptal edilemeyen adaylar whitelist disidir: jadx_full + behavior_full reddedilir", async () => {
    // rea_jadx_full: senkron spawnSync (600sn tavan) event-loop'u kilitler; abort
    // ortada islenemez, cocuk handle'i disari acilmaz -> whitelist'e girmez.
    const jadx = await cagir("rea_job_start", { tool: "rea_jadx_full", arguments: { apk_path: "x.apk", out: "out" } });
    assert.equal(jadx.isError, true);
    assert.equal(govde(jadx).code, "async_job_tool_not_whitelisted");
    // rea_behavior_full: saf senkron birlestirme (uzun degil); ayrica "behavior run"
    // ile karismamali — whitelist'teki ad rea_behavior_run'dur (async-ozel).
    const full = await cagir("rea_job_start", { tool: "rea_behavior_full", arguments: { api: "[]" } });
    assert.equal(full.isError, true);
    assert.equal(govde(full).code, "async_job_tool_not_whitelisted");
  });

  it("job yasam dongusu (scan): start -> succeeded -> result govdesi tarama zarfidir", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-asyncscan-"));
    try {
      writeFileSync(join(dir, "a.js"), "const a = 1;\n");
      writeFileSync(join(dir, "b.mjs"), "export const b = 2;\n");
      const baslat = govde(await cagir("rea_job_start", { tool: "rea_scan_repo", arguments: { path: dir } }));
      assert.equal(baslat.ok, true);
      assert.ok(baslat.job.id.startsWith("job_"));
      const job = await durumuBekle(baslat.job.id, "succeeded");
      assert.ok(job.finishedAt);
      const sonuc = govde(await cagir("rea_job_result", { job_id: baslat.job.id }));
      assert.equal(sonuc.ready, true);
      const icGovde = JSON.parse(sonuc.result.content.find((c) => c.type === "text").text);
      assert.equal(icGovde.ok, true);
      assert.equal(icGovde.tool, "rea_scan_repo");
      assert.ok(Array.isArray(icGovde.details.dosyalar) && icGovde.details.dosyalar.length >= 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("job yasam dongusu (behavior): start -> succeeded -> ic govde davranis raporudur", async () => {
    const baslat = govde(await cagir("rea_job_start", {
      tool: "rea_behavior_run",
      arguments: {
        cmd: process.execPath,
        timeout_ms: 8000,
        api: [{ api: "CreateFileW", yol: "C:\\test\\x.txt" }],
        net: [{ kaynak: "net", zaman: 1, detay: "test" }],
      },
    }));
    assert.equal(baslat.ok, true);
    const job = await durumuBekle(baslat.job.id, "succeeded");
    assert.ok(job.finishedAt);
    const sonuc = govde(await cagir("rea_job_result", { job_id: baslat.job.id }));
    assert.equal(sonuc.ready, true);
    const icGovde = JSON.parse(sonuc.result.content.find((c) => c.type === "text").text);
    assert.equal(icGovde.ok, true);
    assert.equal(icGovde.tool, "rea_behavior_run");
  });

  it("behavior job bos komutta succeeded biter ama ic govde capability_unsupported tasir", async () => {
    // Yonetici sozlesmesi: kosucu FIRLATMADI (deger dondu), abort yok -> succeeded;
    // handler-seviyesi ok:false zarfi sonuc govdesinde tasinir (sync cagriyla ayni).
    const baslat = govde(await cagir("rea_job_start", { tool: "rea_behavior_run", arguments: { cmd: "" } }));
    assert.equal(baslat.ok, true);
    const job = await durumuBekle(baslat.job.id, "succeeded");
    assert.ok(job.finishedAt);
    const sonuc = govde(await cagir("rea_job_result", { job_id: baslat.job.id }));
    assert.equal(sonuc.ready, true);
    const icGovde = JSON.parse(sonuc.result.content.find((c) => c.type === "text").text);
    assert.equal(icGovde.ok, false);
    assert.equal(icGovde.code, "capability_unsupported");
  });

  it("kuyruktaki scan job RPC iptaliyle calismadan cancelled olur; kosanlar etkilenmez", async () => {
    // Deterministik RPC iptali: iki worker da loop'u BOS birakan uyuyan davranis
    // job'iyla mesgulken (tum RPC'ler hizli islenir) ucuncu is KUYRUKTA kalir ve
    // calismadan iptal edilir. Kosu-sirasi abort yarisinin deterministik kaniti
    // manager-seviyesi testtedir (walk fazi senkron blokladigindan RPC zamanlamasi
    // dogasi geregi yarislidir; bkz. rapordaki loop-doygunlugu bulgusu).
    writeFileSync(gateYol, "1");
    const kucuk = mkdtempSync(join(tmpdir(), "rea-asyncscan-kucuk-"));
    const uyuyanBaslat = () => cagir("rea_job_start", {
      tool: "rea_behavior_run",
      arguments: { cmd: process.execPath, timeout_ms: 6000 },
    });
    const pidBekle = async () => {
      const son = Date.now() + 8000;
      while (Date.now() < son && !existsSync(pidYol)) await bekle(25);
      assert.ok(existsSync(pidYol), "uyuyan cocuk pid yazmali");
      const pid = Number(readFileSync(pidYol, "utf8").trim());
      try { rmSync(pidYol, { force: true }); } catch { /* siradaki olcum icin */ }
      return pid;
    };
    try {
      try { rmSync(pidYol, { force: true }); } catch { /* eski pid kalmasin */ }
      writeFileSync(join(kucuk, "a.js"), "const a = 1;\n");
      const s1 = govde(await uyuyanBaslat());
      assert.equal(s1.ok, true);
      const pid1 = await pidBekle();
      assert.ok(canli(pid1), "birinci uyuyan canli olmali");
      const s2 = govde(await uyuyanBaslat());
      assert.equal(s2.ok, true);
      const pid2 = await pidBekle();
      assert.ok(canli(pid2), "ikinci uyuyan canli olmali");
      assert.notEqual(pid2, pid1);
      // Iki worker da dolu: ucuncu is kuyrukta bekler (hizli loop'ta durum gunceldir).
      const bekleyen = govde(await cagir("rea_job_start", { tool: "rea_scan_repo", arguments: { path: kucuk } }));
      assert.equal(bekleyen.ok, true);
      assert.equal(govde(await cagir("rea_job_status", { job_id: bekleyen.job.id })).job.status, "queued");
      const iptal = govde(await cagir("rea_job_cancel", { job_id: bekleyen.job.id }));
      assert.equal(iptal.ok, true);
      await durumuBekle(bekleyen.job.id, "cancelled", 10000);
      assert.equal(govde(await cagir("rea_job_result", { job_id: bekleyen.job.id })).ready, true);
      // Kosan uyuyanlar hizli iptal edilir; artik surecler kendi timeout'uyla temizlenir.
      assert.equal(govde(await cagir("rea_job_cancel", { job_id: s1.job.id })).ok, true);
      assert.equal(govde(await cagir("rea_job_cancel", { job_id: s2.job.id })).ok, true);
      await durumuBekle(s1.job.id, "cancelled", 10000);
      await durumuBekle(s2.job.id, "cancelled", 10000);
      const olumSon = Date.now() + 15000;
      while (Date.now() < olumSon && (canli(pid1) || canli(pid2))) await bekle(100);
      assert.equal(canli(pid1), false, "birinci artik surec olmeli (sizinti yok)");
      assert.equal(canli(pid2), false, "ikinci artik surec olmeli (sizinti yok)");
      uyuyanPid = undefined;
      const liste = govde(await cagir("rea_job_list", {}));
      assert.ok(liste.jobs.some((j) => j.id === bekleyen.job.id));
    } finally {
      try { rmSync(gateYol, { force: true }); } catch { /* yok */ }
      rmSync(kucuk, { recursive: true, force: true });
    }
  });

  it("job yasam dongusu: start -> succeeded -> result govdesi handler zarfidir", async () => {
    const baslat = govde(await cagir("rea_job_start", { tool: "rea_process_run", arguments: { cmd: process.execPath } }));
    assert.equal(baslat.ok, true);
    assert.ok(baslat.job.id.startsWith("job_"));
    const job = await durumuBekle(baslat.job.id, "succeeded");
    assert.ok(job.finishedAt);
    const sonuc = govde(await cagir("rea_job_result", { job_id: baslat.job.id }));
    assert.equal(sonuc.ready, true);
    const icGovde = JSON.parse(sonuc.result.content.find((c) => c.type === "text").text);
    assert.equal(icGovde.ok, true);
    assert.equal(icGovde.tool, "rea_process_run");
    const liste = govde(await cagir("rea_job_list", {}));
    assert.ok(liste.jobs.some((j) => j.id === baslat.job.id));
    const yok = await cagir("rea_job_status", { job_id: "job_yok" });
    assert.equal(yok.isError, true);
    assert.equal(govde(yok).code, "async_job_not_found");
  });

  it("calisan behavior job iptalde hizli cancelled olur; artik surec kendi timeout'uyla temizlenir", async () => {
    writeFileSync(gateYol, "1");
    try {
      try { rmSync(pidYol, { force: true }); } catch { /* eski pid kalmasin */ }
      const baslat = govde(await cagir("rea_job_start", {
        tool: "rea_behavior_run",
        arguments: { cmd: process.execPath, timeout_ms: 8000 },
      }));
      assert.equal(baslat.ok, true);
      const son = Date.now() + 8000;
      while (Date.now() < son && !existsSync(pidYol)) await bekle(25);
      assert.ok(existsSync(pidYol), "uyuyan cocuk pid yazmali");
      uyuyanPid = Number(readFileSync(pidYol, "utf8").trim());
      assert.ok(canli(uyuyanPid), "iptal oncesi cocuk canli olmali");
      const t0 = Date.now();
      const iptal = govde(await cagir("rea_job_cancel", { job_id: baslat.job.id }));
      assert.equal(iptal.ok, true);
      // Is-yuzu iptal hizli gorunur (kosucu abort yarisini kazanir).
      await durumuBekle(baslat.job.id, "cancelled", 10000);
      assert.ok(Date.now() - t0 < 10000, "job iptali hizli gorunmeli");
      const sonuc = govde(await cagir("rea_job_result", { job_id: baslat.job.id }));
      assert.equal(sonuc.ready, true);
      // Artik hedef, davranis kosusunun kendi zaman asimi temizligiyle olur
      // (8sn timeout + oldurme payi); beklenti 20sn tavan.
      const olumSon = Date.now() + 20000;
      while (Date.now() < olumSon && canli(uyuyanPid)) await bekle(100);
      assert.equal(canli(uyuyanPid), false, "artik surec timeout temizligiyle olmeli (sizinti yok)");
      uyuyanPid = undefined;
      // Sunucu saglikli: liste calisir.
      const liste = govde(await cagir("rea_job_list", {}));
      assert.ok(liste.jobs.some((j) => j.id === baslat.job.id));
    } finally {
      try { rmSync(gateYol, { force: true }); } catch { /* yok */ }
    }
  });
});
