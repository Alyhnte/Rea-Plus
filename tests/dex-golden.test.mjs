// tests/dex-golden.test.mjs: sentetik minimal DEX golden kapısı (tamamen offline).
// Koş: node tests/dex-golden.test.mjs  (sniff çapraz-kontrolü dist ister;
//   `npm run build` yoksa o adım dürüstçe atlanır, çekirdek başlık kapıları koşar).
// Fixture: tests/corpus/mini.dex — scripts/dex-fixture-uret.mjs ile deterministik
//   üretilir (sentetik, gerçek APK/DEX indirmesi yok). Canlı jadx kabulü bu dosyanın
//   kapsamı dışındadır (yol haritasındaki açık kapı gibi).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Korpus dizini ile kanonik DEX yolu + üretim betiği + manifest.
const corpusDir = join(kok, "tests", "corpus");
const DEX_YOL = join(corpusDir, "mini.dex");
const URET_BETIK = join(kok, "scripts", "dex-fixture-uret.mjs");
const MANIFEST_YOL = join(corpusDir, "HASHES.json");

// Normalize çıktının altın hash'i: başlık alanlarından kurulan kanonik JSON'un
// (sıralı anahtar + LF) sha256 özeti. Üretim betiği deterministik olduğundan her
// koşuda aynı değer çıkar; bayt değişirse bu kapı dosya adıyla olmasa da değerle yakalar.
const BEKLENEN_NORMALIZE_SHA256 = "270bffb2e234e8ef093642365482c48483509c4a3e97a2727c78688448888805"; // altın: 112 baytlık v035 başlık özeti

// DEX başlık düzeni (Android DEX spec, little-endian): yalnızca ilk 112 bayt.
const BASLIK_BOY = 0x70; // 112
const BEKLENEN_SIHIR = Buffer.from([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00]); // "dex\n035\0"

// Adler-32 (zlib'siz, spec'ten): checksum alanı bununla doğrulanır.
function adler32(tampon) {
  let a = 1;
  let b = 0;
  for (const bayt of tampon) {
    a = (a + bayt) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Ham bayttan başlık alanlarını okur; bozuksa hangi alanla açık hata verir.
function baslikOku(ham) {
  assert.ok(ham.length >= BASLIK_BOY, `dex başlığı kesik: ${ham.length} bayt < 112`);
  const u32 = (ofset) => ham.readUInt32LE(ofset);
  return {
    sihir: ham.subarray(0, 8),
    checksum: u32(8),
    imza: ham.subarray(12, 32).toString("hex"),
    dosya_boy: u32(32),
    baslik_boy: u32(36),
    endian: u32(40),
    harita_ofset: u32(52),
  };
}

// Normalize çıktı: kanonik JSON (sıralı anahtar, LF). Hash'i altın değerle kilitlenir.
function normalizeOzet(baslik) {
  const kanonik = {
    baslik_boy: baslik.baslik_boy,
    dosya_boy: baslik.dosya_boy,
    endian: `0x${baslik.endian.toString(16).padStart(8, "0")}`,
    harita_ofset: baslik.harita_ofset,
    imza_sha1: baslik.imza,
    sihir: "dex\\n035\\0",
    surum: "035",
  };
  return JSON.stringify(kanonik, Object.keys(kanonik).sort()) + "\n";
}

// UTF-8 metnin sha256 özeti.
function sha256Metin(metin) {
  return createHash("sha256").update(Buffer.from(metin, "utf8")).digest("hex");
}

describe("dex golden fixture", () => {
  // Fixture üretim betiğiyle kurulur; yoksa bu kapı dosya adıyla düşer (kırmızı).
  it("mini.dex var, boyut 112 (yalnız başlık, sentetik minimal)", () => {
    assert.equal(existsSync(DEX_YOL), true, "EKSIK tests/corpus/mini.dex (önce: node scripts/dex-fixture-uret.mjs)");
    assert.equal(statSync(DEX_YOL).size, BASLIK_BOY, "mini.dex 112 bayt olmalı");
  });

  // Sihir + tutarlılık: sürüm 035, başlık boyu 0x70, endian etiketi, dosya boyu diskle aynı.
  it("sihir dex\\n035\\0 + başlık tutarlı", () => {
    const baslik = baslikOku(readFileSync(DEX_YOL));
    assert.ok(baslik.sihir.equals(BEKLENEN_SIHIR), `sihir uyuşmaz: ${baslik.sihir.toString("hex")}`);
    assert.equal(baslik.baslik_boy, BASLIK_BOY);
    assert.equal(baslik.endian, 0x12345678, "endian etiketi 0x12345678 olmalı");
    assert.equal(baslik.dosya_boy, statSync(DEX_YOL).size, "başlıktaki dosya_boy diskle tutmalı");
  });

  // Bütünlük: checksum = adler32([12..]), imza = sha1([32..]). İkisi de spec'ten yeniden hesaplanır.
  it("checksum (adler32) + imza (sha1) geçerli", () => {
    const ham = readFileSync(DEX_YOL);
    const baslik = baslikOku(ham);
    assert.equal(baslik.checksum, adler32(ham.subarray(12)), "adler32 checksum tutmadı");
    assert.equal(
      baslik.imza,
      createHash("sha1").update(ham.subarray(32)).digest("hex"),
      "sha1 imza tutmadı",
    );
  });

  // Golden: normalize çıktının hash'i altın değerle aynı olmalı.
  it("normalize çıktı hash'i altın değerle eşit", () => {
    const ozet = normalizeOzet(baslikOku(readFileSync(DEX_YOL)));
    assert.equal(sha256Metin(ozet), BEKLENEN_NORMALIZE_SHA256, `normalize özet değişti:\n${ozet}`);
  });

  // Çapraz kontrol: repo'nun imza aracı (sniff) DEX'i jadx motoruna yönlendirmeli.
  // dist yoksa (build koşulmadıysa) dürüstçe atlanır; çekirdek kapılar yukarıda koştu.
  it("sniff DEX'i jadx'e yönlendirir (dist varsa)", async () => {
    let sniff;
    try {
      sniff = await import("../dist/facade/sniff.js");
    } catch {
      console.log("ATLANDI: dist/facade/sniff.js yok (önce: npm run build)");
      return;
    }
    assert.deepEqual(sniff.sniffBytes(readFileSync(DEX_YOL).subarray(0, 8)), { tip: "dex", motor: "jadx" });
    assert.deepEqual(sniff.sniffFile(DEX_YOL), { tip: "dex", motor: "jadx" });
  });

  // Manifest kapısı: HASHES.json girdisi ham baytın sha256'sıyla tutmalı (dex binary'dir, normalize yok).
  it("HASHES.json girdisi diskle tutar", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_YOL, "utf8"));
    const girdi = manifest.dosyalar?.["mini.dex"];
    assert.ok(girdi, "EKSIK HASHES.json girdisi: mini.dex");
    assert.match(girdi.sha256, /^[0-9a-f]{64}$/, "mini.dex: sha256 biçimi bozuk");
    assert.ok(girdi.kaynak?.trim(), "mini.dex: kaynak boş olmamalı");
    assert.ok(girdi.lisans?.trim(), "mini.dex: lisans boş olmamalı");
    const gercek = createHash("sha256").update(readFileSync(DEX_YOL)).digest("hex");
    assert.equal(gercek, girdi.sha256, `hash uyuşmaz: beklenen=${girdi.sha256} gercek=${gercek}`);
  });

  // Üretim deseni (korpus-kur gibi): ikinci koşu aynı baytları yazar.
  it("üretim idempotent: ikinci koşu aynı hashleri verir", () => {
    execFileSync(process.execPath, [URET_BETIK], { cwd: kok, stdio: "pipe" });
    const once = createHash("sha256").update(readFileSync(DEX_YOL)).digest("hex");
    execFileSync(process.execPath, [URET_BETIK], { cwd: kok, stdio: "pipe" });
    const sonra = createHash("sha256").update(readFileSync(DEX_YOL)).digest("hex");
    assert.equal(sonra, once);
  });
});
