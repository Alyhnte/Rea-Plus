// telemetry.test.mjs: opt-in kayıt, özet ve JSONL append davranışı.
// Koş: node --test tests/telemetry.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Telemetry } from "../dist/facade/telemetry.js";

describe("Telemetry", () => {
  // Varsayılan KAPALI: record çağrısı iz bırakmaz.
  it("kapalıyken kayıt yok", () => {
    const t = new Telemetry();
    t.record({ hedef_tip: "apk", eksik_arac: "jadx", sonuc: "eksik-arac" });
    assert.equal(t.summary().toplam, 0);
  });

  // Açıkken özet doğru: toplam, en sık eksik, hedef dağılımı.
  it("açıkken özet doğru", () => {
    const t = new Telemetry();
    t.enable();
    t.record({ hedef_tip: "apk", eksik_arac: "jadx", sonuc: "eksik-arac" });
    t.record({ hedef_tip: "elf", eksik_arac: "ghidra", sonuc: "eksik-arac" });
    t.record({ hedef_tip: "apk", eksik_arac: "jadx", sonuc: "tamam" });
    assert.deepEqual(t.summary(), { toplam: 3, en_cok_eksik: "jadx", hedef_dagilimi: { apk: 2, elf: 1 } });
  });

  // disable sonrası yeni kayıt durur, eski özet korunur.
  it("disable sonrası kayıt durur", () => {
    const t = new Telemetry();
    t.enable();
    t.record({ hedef_tip: "apk", eksik_arac: "jadx", sonuc: "tamam" });
    t.disable();
    t.record({ hedef_tip: "elf", eksik_arac: "ghidra", sonuc: "tamam" });
    assert.equal(t.summary().toplam, 1);
  });

  // appendJsonl dosyaya satır başına bir JSON yazar (append).
  it("dosyaya JSONL append eder", () => {
    const dir = mkdtempSync(join(tmpdir(), "rea-tel-"));
    try {
      const yol = join(dir, "tel.jsonl");
      const t = new Telemetry();
      t.enable();
      t.record({ hedef_tip: "wasm", eksik_arac: "wabt", sonuc: "tamam" });
      t.appendJsonl(yol);
      t.record({ hedef_tip: "apk", eksik_arac: "jadx", sonuc: "eksik-arac" });
      t.appendJsonl(yol);
      const satirlar = readFileSync(yol, "utf8").trim().split("\n").map((s) => JSON.parse(s));
      assert.equal(satirlar.length, 3); // 1 + 2: ikinci yazım öncekileri de ekler
      assert.equal(satirlar[2].eksik_arac, "jadx");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
