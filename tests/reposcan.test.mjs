// reposcan.test.mjs: sahte PE/ELF/APK/JS/WASM ile repo tarama (gerçek fs, offline).
// Koş: npm run build sonrası `node --test tests/reposcan.test.mjs` (tsc emit şart).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rea_scan_repo } from "../dist/rea-domains/reposcan/RepoScan.js";

// Taze tmp dizini üretir (repo kirlenmez).
function taze(one) {
  return mkdtempSync(join(tmpdir(), `rea-reposcan-${one}-`));
}

// Onaltılık imzadan bayt dizisi kurar.
const b = (hex) => Buffer.from(hex, "hex");

// Karışık sahte repo: PE+ELF+APK+JS+WASM sihir baytlı dosyalar.
function karışıkSahne() {
  const dir = taze("karisik");
  writeFileSync(join(dir, "uygulama.exe"), b("4d5a900003000000"));
  writeFileSync(join(dir, "kitaplik.elf"), b("7f454c4602010100"));
  writeFileSync(join(dir, "mobil.apk"), b("504b030414000000"));
  writeFileSync(join(dir, "index.js"), "console.log('selam');\n");
  writeFileSync(join(dir, "mod.wasm"), b("0061736d01000000"));
  return dir;
}

// Dosyadan tip satırını bulur (yoksa test patlar).
function bul(dosyalar, yol) {
  const k = dosyalar.find((d) => d.yol === yol);
  assert.ok(k, `${yol} listede olmalı`);
  return k;
}

describe("rea_scan_repo sahte dosyalar", () => {
  // MZ başlıklı .exe PE sayılıp motor önerisi almalı.
  it("PE dosyasını tip+motor ile listeler", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(bul(r.details.dosyalar, "uygulama.exe").tip, "pe");
      assert.ok(bul(r.details.dosyalar, "uygulama.exe").motor.length > 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // ELF sihirli .elf radare2 önerisiyle dönmeli.
  it("ELF dosyasını tanır", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(bul(r.details.dosyalar, "kitaplik.elf").tip, "elf");
      assert.equal(bul(r.details.dosyalar, "kitaplik.elf").motor, "radare2");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // PK başlıklı .apk jadx önerisiyle dönmeli.
  it("APK dosyasını tanır", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(bul(r.details.dosyalar, "mobil.apk").tip, "apk");
      assert.equal(bul(r.details.dosyalar, "mobil.apk").motor, "jadx");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Düz metin .js uzantı ipucuyla js sayılmalı.
  it("JS dosyasını uzantı ipucuyla tanır", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(bul(r.details.dosyalar, "index.js").tip, "js");
      assert.equal(bul(r.details.dosyalar, "index.js").motor, "js");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // WASM sihirli .wasm wabt önerisiyle dönmeli.
  it("WASM dosyasını tanır", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(bul(r.details.dosyalar, "mod.wasm").tip, "wasm");
      assert.ok(bul(r.details.dosyalar, "mod.wasm").motor.length > 0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Beş dosyalık sahnede tip sayımı + plan uzunluğu tutmalı.
  it("tip sayılarını ve planları üretir", async () => {
    const dir = karışıkSahne();
    try {
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.deepEqual(r.details.tipler, { pe: 1, elf: 1, apk: 1, js: 1, wasm: 1 });
      assert.equal(r.details.planlar.length, 5);
      assert.ok(r.summary.includes("5 dosya"));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // İkinci tur önbellekten gelmeli: esnek eşik (toleranslı).
  it("cache ikinci turu yavaşlatmaz", async () => {
    const dir = karışıkSahne();
    try {
      const t0 = Date.now();
      await rea_scan_repo(dir);
      const t1 = Date.now();
      await rea_scan_repo(dir);
      const t2 = Date.now();
      assert.ok(t2 - t1 <= (t1 - t0) + 20, `ikinci tur (${t2 - t1}ms) birinciden (${t1 - t0}ms) yavaş olmamalı`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // .git/node_modules/dist içindeki ikililer listeye girmemeli.
  it(".git/node_modules/dist atlanır", async () => {
    const dir = taze("atlanir");
    try {
      for (const d of [".git", "node_modules", "dist"]) {
        mkdirSync(join(dir, d), { recursive: true });
        writeFileSync(join(dir, d, "gizli.exe"), b("4d5a900003000000"));
      }
      writeFileSync(join(dir, "görünür.exe"), b("4d5a900003000000"));
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.equal(r.details.dosyalar.length, 1);
      assert.equal(r.details.dosyalar[0].yol, "görünür.exe");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Hiç hedef uzantı yoksa boş ama ok sonuç dönmeli.
  it("boş dizin boş liste döner", async () => {
    const dir = taze("bos");
    try {
      writeFileSync(join(dir, "not.txt"), "desteklenmeyen uzantı");
      const r = await rea_scan_repo(dir);
      assert.equal(r.ok, true);
      assert.deepEqual(r.details.dosyalar, []);
      assert.deepEqual(r.details.tipler, {});
      assert.deepEqual(r.details.planlar, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // Yok dizin + boş girdi kapıdan dönmeli.
  it("yok dizin ve boş girdi unsupported verir", async () => {
    const yok = await rea_scan_repo(join(tmpdir(), "rea-reposcan-olmayan-12345"));
    assert.equal(yok.ok, false);
    assert.equal(yok.code, "capability_unsupported");
    const bos = await rea_scan_repo("");
    assert.equal(bos.ok, false);
    assert.equal(bos.code, "capability_unsupported");
  });
});
