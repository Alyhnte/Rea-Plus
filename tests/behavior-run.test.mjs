// behavior-run.test.mjs: tek çağrıda uçtan uca davranış koşusu (spawn+api+net birleşimi).
// Zararsız fixture: yalnız node -e (hello/sleep/exit3); GUI (calc/notepad) yok,
// kısa süreli, salt izleme, repo/corpus yazımı yok. Asılı süreç bırakılmaz (pid ölü kontrolü).
// Koş: node --test tests/behavior-run.test.mjs
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { rea_behavior_run } from "../dist/rea-domains/behavior/BehaviorRun.js";

// Canlı mı? pid sinyal 0 ile yoklanır (ölüyse true).
const öldüMü = (pid) => {
  if (!Number.isInteger(pid)) return true;
  try { process.kill(pid, 0); return false; } catch { return true; }
};
// Dosyadaki tüm çocuk pid'ler; after() hepsini ölü doğrular.
const görülenPidler = [];
const izle = (r) => {
  const pid = r?.kismi?.kayıt?.pid ?? r?.kayıt?.pid;
  if (Number.isInteger(pid)) görülenPidler.push(pid);
};

// Kısa zararsız hello: 0 çıkış, anlık bitiş.
const HELLO = ["-e", "console.log('rea-ok')"];
// Zaman aşımı yemi: 30sn uyur (koşucu 800ms'de öldürür).
const UYKU = ["-e", "setTimeout(()=>{}, 30000)"];
// Çöküş yemi: deterministik anormal çıkış (sinyal yok, kod 3).
const ÇÖKÜŞ = ["-e", "process.exit(3)"];
// Enjekte api izi (gerçek toplayıcı yerine deterministik katman girdisi).
const API = [
  { api: "CreateFileW", yol: "C:\\tmp\\rea-davranis-test.txt" },
  { api: "ReadFile", yol: "C:\\tmp\\rea-davranis-test.txt" },
];
// Enjekte net olayı.
const NET = [{ kaynak: "net", zaman: 5, detay: "n1" }];

describe("rea_behavior_run tam profil", () => {
  // (a) Kısa zararsız süreç + api + net birleşir: tek çağrıda tam profil.
  it("kısa süreçte tam profil döner", async () => {
    const r = await rea_behavior_run(process.execPath, {
      args: HELLO, timeout_ms: 15000, apiOlaylari: API, netOlaylari: NET,
    });
    izle(r);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_behavior_run");
    assert.equal(r.zaman_aşımı, false);
    assert.equal(r.crash, false);
    assert.deepEqual(r.eksik_katmanlar, []);
    assert.ok(Array.isArray(r.cizelge) && r.cizelge.length >= 5, `cizelge kısa: ${r.cizelge?.length}`);
    assert.ok(r.cizelge.some((o) => o.kaynak === "process"), "process olayı yok");
    assert.ok(r.cizelge.some((o) => o.kaynak === "api"), "api olayı yok");
    assert.ok(r.cizelge.some((o) => o.kaynak === "net"), "net olayı yok");
    assert.ok(typeof r.ozet === "string" && r.ozet.length > 0);
    assert.ok(r.bulgular.some((b) => b.includes("dosya_yazma")), `bulgu yok: ${r.bulgular.join("|")}`);
    assert.equal(r.kayıt.çıkış_kodu, 0);
    assert.ok(öldüMü(r.kayıt.pid), "çocuk süreç asılı kaldı");
  });
});

describe("rea_behavior_run zaman aşımı", () => {
  // (b) Süre dolunca kısmi profil + zaman aşımı işareti (sahte tam profil YOK).
  it("süre dolunca kısmi + işaret döner", async () => {
    const baş = Date.now();
    const r = await rea_behavior_run(process.execPath, {
      args: UYKU, timeout_ms: 800, apiOlaylari: API, netOlaylari: NET,
    });
    const geçen = Date.now() - baş;
    izle(r);
    assert.equal(r.ok, false);
    assert.equal(r.code, "zaman_aşımı");
    assert.equal(r.zaman_aşımı, true);
    assert.equal(r.crash, false);
    assert.ok(Array.isArray(r.kismi.cizelge) && r.kismi.cizelge.length >= 1, "spawn kanıtı yok");
    assert.ok(r.kismi.cizelge.some((o) => o.kaynak === "process"), "process kanıtı yok");
    assert.ok(r.kismi.bulgular.some((b) => b.includes("zaman_aşımı")), `işaret yok: ${r.kismi.bulgular.join("|")}`);
    assert.ok(geçen < 15000, `çok sürdü: ${geçen}ms`);
    assert.ok(öldüMü(r.kismi.kayıt.pid), "zaman aşımı sonrası çocuk asılı kaldı");
  });
});

describe("rea_behavior_run eksik backend", () => {
  // (c) Ağır izleme yoksa hangi katman + kısmi (süreç sağlamken bile tam iddia yok).
  it("eksik katmanı adıyla + kısmi döner", async () => {
    const r = await rea_behavior_run(process.execPath, { args: HELLO, timeout_ms: 15000 });
    izle(r);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.ok(r.eksik_katmanlar.includes("api"), `api eksik listede yok: ${r.eksik_katmanlar}`);
    assert.ok(r.eksik_katmanlar.includes("net"), `net eksik listede yok: ${r.eksik_katmanlar}`);
    assert.ok(r.kismi.cizelge.some((o) => o.kaynak === "process"), "process kanıtı yok");
    assert.equal(r.kismi.kayıt.çıkış_kodu, 0);
    assert.equal(r.zaman_aşımı, false);
    assert.equal(r.crash, false);
    assert.ok(öldüMü(r.kismi.kayıt.pid), "çocuk süreç asılı kaldı");
  });
});

describe("rea_behavior_run çöküş", () => {
  // Hedef çökerse crash işareti + kanıt (sahte başarı YOK).
  it("anormal çıkışta crash + kanıt döner", async () => {
    const r = await rea_behavior_run(process.execPath, {
      args: ÇÖKÜŞ, timeout_ms: 15000, apiOlaylari: API, netOlaylari: NET,
    });
    izle(r);
    assert.equal(r.ok, false);
    assert.equal(r.code, "crash");
    assert.equal(r.crash, true);
    assert.equal(r.zaman_aşımı, false);
    assert.ok(r.kismi.cizelge.length >= 2, "spawn+exit kanıtı yok");
    assert.ok(r.kismi.bulgular.some((b) => b.includes("crash")), `işaret yok: ${r.kismi.bulgular.join("|")}`);
    assert.equal(r.kismi.kayıt.çıkış_kodu, 3);
    assert.ok(öldüMü(r.kismi.kayıt.pid), "çocuk süreç asılı kaldı");
  });
});

describe("rea_behavior_run kapı", () => {
  // Boş komut: hiç spawn yok, kapıdan döner.
  it("boş komut capability_unsupported verir", async () => {
    const r = await rea_behavior_run("", { timeout_ms: 1000 });
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

after(() => {
  // Dosya sonunda asılı süreç kanıtı: görülen her pid ölü olmalı.
  for (const pid of görülenPidler) assert.ok(öldüMü(pid), `asılı pid: ${pid}`);
});
