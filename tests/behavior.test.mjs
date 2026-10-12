// behavior.test.mjs: timeline sıralama+özet (saf) + yerel mitmdump HAR (dış ağ yok).
// Koş: node --test tests/behavior.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_behavior_timeline } from "../dist/rea-domains/behavior/BehaviorTimeline.js";
import { NET_TOOLS, rea_net_capture } from "../dist/rea-domains/behavior/NetCapture.js";

// mitmdump var mı? Yoksa net testi kapı beklentisine düşer (skip yerine gate).
const mitmVar = (() => { try { spawnSync("mitmdump", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
// Olay kurucu: kaynak/zaman/detay üçlüsü.
const olay = (kaynak, zaman, detay) => ({ kaynak, zaman, detay });

describe("rea_behavior_timeline sıralama", () => {
  // Karışık girişte sabit öncelik: api|syscall|net|dosya|process.
  it("kaynak önceliğine dizer", () => {
    const gir = [olay("process", 1, "p"), olay("dosya", 1, "d"), olay("net", 1, "n"), olay("syscall", 1, "s"), olay("api", 1, "a")];
    const r = rea_behavior_timeline(gir);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.sıralı.map((o) => o.kaynak), ["api", "syscall", "net", "dosya", "process"]);
  });

  // Aynı kaynakta önce zaman, eşitlikte detay (tam deterministik).
  it("aynı kaynakta zaman+detay ile dizer", () => {
    const r = rea_behavior_timeline([olay("api", 9, "b"), olay("api", 1, "a"), olay("api", 5, "c")]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.sıralı.map((o) => o.detay), ["a", "c", "b"]);
  });

  // Bilinmeyen kaynak en sona; girdi dizisi değişmez (saf fonksiyon).
  it("bilinmeyeni sona atar, girdiyi değiştirmez", () => {
    const gir = [olay("xxx", 1, "x"), olay("api", 2, "a")];
    const r = rea_behavior_timeline(gir);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.sıralı.map((o) => o.kaynak), ["api", "xxx"]);
    assert.deepEqual(gir.map((o) => o.kaynak), ["xxx", "api"]);
  });
});

describe("rea_behavior_timeline özet", () => {
  // İlk/son + kaynak sayıları özetlenir.
  it("ilk/son ve sayıları verir", () => {
    const r = rea_behavior_timeline([olay("net", 2, "n1"), olay("api", 1, "a1"), olay("api", 3, "a1")]);
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_behavior_timeline");
    assert.deepEqual(r.details.sayılar, { api: 2, net: 1 });
    assert.equal(r.details.ilk, "api@1");
    assert.equal(r.details.son, "net@2");
  });

  // En sık 5 api detayı frekans sırasıyla (eşitlikte alfabetik).
  it("top-5 api frekans sırasındadır", () => {
    const gir = ["f", "e", "d", "c", "b", "a"].map((d, i) => olay("api", i, d));
    gir.push(olay("api", 99, "a"), olay("api", 98, "a"), olay("api", 97, "b"));
    const r = rea_behavior_timeline(gir);
    assert.equal(r.ok, true);
    assert.deepEqual(r.details.top_api.map((t) => t.ad), ["a", "b", "c", "d", "e"]);
    assert.equal(r.details.top_api[0].n, 3);
  });
});

describe("rea_behavior_timeline kapılar", () => {
  // Boş liste: timeline kurulamaz.
  it("boş dizi capability_unsupported", () => {
    const r = rea_behavior_timeline([]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });

  // Eksik alanlı olay reddedilir.
  it("eksik alan capability_unsupported", () => {
    const r = rea_behavior_timeline([{ kaynak: "api", zaman: 1 }]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("rea_net_capture", () => {
  // Katalog adı sabit: NET_TOOLS içinde rea_net_capture.
  it("araç adı rea_net_capture", () => {
    assert.ok(NET_TOOLS.includes("rea_net_capture"));
  });

  // Dış ağ ve boş hedef: hiç süreç açılmadan kapıdan döner.
  it("geçersiz/dış url capability_unsupported", async () => {
    for (const u of ["", "notaurl", "https://ornek.dis/ag", "http://192.168.1.1/x"]) {
      const r = await rea_net_capture(u, 5, join(tmpdir(), "asla.har"));
      assert.equal(r.ok, false, u);
      assert.equal(r.code, "capability_unsupported", u);
    }
  });

  // data: hedef → yerel yem + mitmdump → gerçek HAR; mitmdump yoksa gate.
  it("yerel hedef HAR üretir (yoksa gate)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-net-"));
    try {
      const har = join(dir, "yakala.har");
      const r = await rea_net_capture("data:text/plain,merhaba", 10, har);
      if (!mitmVar) {
        assert.equal(r.ok, false);
        assert.equal(r.code, "capability_unsupported");
        return;
      }
      assert.equal(r.ok, true);
      assert.equal(r.tool, "rea_net_capture");
      assert.ok(existsSync(har), "HAR dosyası yok");
      assert.ok(statSync(har).size > 0, "HAR boş");
      assert.ok(readFileSync(har, "utf8").includes('"entries"'), "HAR girdisiz");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
