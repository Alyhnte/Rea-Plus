// tests/corpus.test.mjs: golden korpus bütünlük kapısı (tamamen offline).
// Koş: node --test tests/corpus.test.mjs (önce: node scripts/korpus-kur.mjs)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Korpus dizini ile kanonik 5 dosya yolu.
const corpusDir = join(kok, "tests", "corpus");
const kurBetik = join(kok, "scripts", "korpus-kur.mjs");
const ELF_YOL = join(corpusDir, "mini_branch.elf");
const PE_YOL = join(corpusDir, "mini_pe_x64.exe");
const APK_YOL = join(corpusDir, "sahte.apk");
const WASM_YOL = join(corpusDir, "ornek.wasm");
const JS_YOL = join(corpusDir, "ornek.js");
const TUMU = [ELF_YOL, PE_YOL, APK_YOL, WASM_YOL, JS_YOL];

// Dosyanın sha256 özeti (idempotency karşılaştırması için).
function sha256(yol) {
  return createHash("sha256").update(readFileSync(yol)).digest("hex");
}

describe("korpus varlık + boyut", () => {
  // ELF ikilisi kurulumdan sonra var ve boş olmamalı.
  it("mini_branch.elf var, boyut > 0", () => {
    assert.equal(existsSync(ELF_YOL), true);
    assert.ok(statSync(ELF_YOL).size > 0);
  });

  // PE ikilisi kurulumdan sonra var ve boş olmamalı.
  it("mini_pe_x64.exe var, boyut > 0", () => {
    assert.equal(existsSync(PE_YOL), true);
    assert.ok(statSync(PE_YOL).size > 0);
  });

  // APK kurulumdan sonra var ve boş olmamalı.
  it("sahte.apk var, boyut > 0", () => {
    assert.equal(existsSync(APK_YOL), true);
    assert.ok(statSync(APK_YOL).size > 0);
  });

  // Wasm kurulumdan sonra var ve boş olmamalı.
  it("ornek.wasm var, boyut > 0", () => {
    assert.equal(existsSync(WASM_YOL), true);
    assert.ok(statSync(WASM_YOL).size > 0);
  });

  // JS kurulumdan sonra var ve boş olmamalı.
  it("ornek.js var, boyut > 0", () => {
    assert.equal(existsSync(JS_YOL), true);
    assert.ok(statSync(JS_YOL).size > 0);
  });
});

describe("korpus sihir + içerik", () => {
  // ELF sihri ilk 4 baytta 7f454c46 olmalı.
  it("elf sihri 7f454c46", () => {
    const bayt = readFileSync(ELF_YOL).subarray(0, 4);
    assert.equal(Buffer.from(bayt).toString("hex"), "7f454c46");
  });

  // PE sihri MZ (4d5a) ile başlamalı.
  it("pe MZ ile başlar", () => {
    const bayt = readFileSync(PE_YOL).subarray(0, 2);
    assert.equal(Buffer.from(bayt).toString("ascii"), "MZ");
  });

  // APK gerçek zip: PK (504b) ile başlamalı.
  it("apk PK ile başlar", () => {
    const bayt = readFileSync(APK_YOL).subarray(0, 2);
    assert.equal(Buffer.from(bayt).toString("ascii"), "PK");
  });

  // APK girdisi AndroidManifest.xml içermeli.
  it("apk AndroidManifest.xml girdisi taşır", () => {
    const ham = readFileSync(APK_YOL);
    assert.ok(ham.includes(Buffer.from("AndroidManifest.xml", "utf8")));
  });

  // Wasm sihri 0061736d + sürüm 01000000 olmalı.
  it("wasm sihir + sürüm", () => {
    const bayt = readFileSync(WASM_YOL).subarray(0, 8);
    assert.equal(Buffer.from(bayt).toString("hex"), "0061736d01000000");
  });

  // JS bundle require içermeli.
  it("js require içerir", () => {
    const metin = readFileSync(JS_YOL, "utf8");
    assert.ok(metin.includes("require"));
  });
});

describe("korpus-kur idempotent", () => {
  // İkinci koşu aynı baytları üretmeli: 5 dosyanın hash'i değişmemeli.
  it("ikinci koşu aynı hashleri verir", () => {
    execFileSync(process.execPath, [kurBetik], { cwd: kok, stdio: "pipe" }); // önce kur: idempotentlik ikinci koşuda ölçülür
    const once = TUMU.map(sha256);
    execFileSync(process.execPath, [kurBetik], { cwd: kok, stdio: "pipe" });
    const sonra = TUMU.map(sha256);
    assert.deepEqual(sonra, once);
  });
});
