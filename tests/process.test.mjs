// process.test.mjs: süreç koşusu (echo/hello) + caps + compare kapısı (gerçek PTY yok).
// Koş: node --test tests/process.test.mjs (alternatif: node tests/process.test.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rea_process_caps, rea_process_compare, rea_process_run } from "../dist/rea-domains/firmware-browser/ProcessCapture.js";

describe("rea_process_run", () => {
  // node --version koşusu çıkış kodu 0 vermeli (yorumlayıcı kanıtı).
  it("node --version koşar, kod 0", () => {
    const r = rea_process_run(process.execPath, { args: ["--version"] });
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_process_run");
    assert.equal(r.kayıt.çıkış_kodu, 0);
  });

  // hello çıktılı koşu aynı kanaldan döner (echo/hello görevi).
  it("hello çıktılı koşu kod 0 verir", () => {
    const r = rea_process_run(process.execPath, { args: ["-e", "console.log('hello')"] });
    assert.equal(r.ok, true);
    assert.equal(r.kayıt.çıkış_kodu, 0);
    assert.equal(typeof r.kayıt.stdout_sha256_kısa, "string");
  });

  // Varsayılan kanal pipe'tır; süre_ms negatif olamaz.
  it("varsayılan kanal pipe, süre geçerli", () => {
    const r = rea_process_run(process.execPath, { args: ["--version"] });
    assert.equal(r.ok, true);
    assert.equal(r.kayıt.kanal, "pipe");
    assert.ok(r.kayıt.süre_ms >= 0);
  });

  // Boş komut kapıdan döner: capability_unsupported.
  it("boş komut capability_unsupported verir", () => {
    const r = rea_process_run("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
  });
});

describe("caps ve compare", () => {
  // Yetenek sorgusu her platformda ok döner, özet metni doludur.
  it("caps ok döner", () => {
    const r = rea_process_caps();
    assert.equal(r.ok, true);
    assert.equal(r.tool, "rea_process_caps");
    assert.ok(r.summary.length > 0);
  });

  // Gerçek PTY uygulanmadı: compare her platformda kapıdan döner (sahte fark yok).
  it("compare capability_unsupported verir", () => {
    const r = rea_process_compare(process.execPath, ["--version"]);
    assert.equal(r.ok, false);
    assert.equal(r.code, "capability_unsupported");
    assert.ok(r.reason.includes(process.platform));
  });
});
