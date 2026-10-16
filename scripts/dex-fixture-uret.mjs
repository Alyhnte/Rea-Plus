// scripts/dex-fixture-uret.mjs: sentetik minimal DEX fixture üretimi (idempotent).
// Koş: node scripts/dex-fixture-uret.mjs (repo kökünden; ikinci koşu aynı baytları yazar).
// Çıktı: tests/corpus/mini.dex — 112 baytlık yalnız-başlık DEX v035; sihir +
//   adler32 checksum + sha1 imza spec'e göre hesaplanır. Gerçek APK/DEX indirmesi
//   yok; ağ yok, canlı araç yok (yalnız node:crypto + node:fs).
// Üretim deseni scripts/korpus-kur.mjs ile aynıdır (sabit bayt, idempotent yazım).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Betiğin bulunduğu repo kökü; çıktılar hep aynı yere yazılır.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Korpus dizini yoksa kurulur (recursive: ikinci koşuda zararsız).
const corpusDir = join(kok, "tests", "corpus");
const HEDEF_DEX = join(corpusDir, "mini.dex");

// DEX başlık sabitleri (Android DEX spec, little-endian).
const BASLIK_BOY = 0x70; // 112: yalnız-başlık dosyanın toplam boyudur
const SIHIR = Buffer.from([0x64, 0x65, 0x78, 0x0a, 0x30, 0x33, 0x35, 0x00]); // "dex\n035\0"
const ENDIAN_ETIKET = 0x12345678;

// Adler-32 (IEEE/zlib tanımı, bağımlılıksız): checksum = adler32(bayt[12..son]).
function adler32(tampon) {
  let a = 1;
  let b = 0;
  for (const bayt of tampon) {
    a = (a + bayt) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// Minimal DEX baytlarını kurar: tüm bölüm sayaçları 0, ofsetler 0; yalnız başlık.
// checksum boş bırakılıp önce imza (sha1 [32..]), sonra checksum (adler32 [12..]) yazılır.
function dexBaytlariniUret() {
  const baslik = Buffer.alloc(BASLIK_BOY, 0);
  SIHIR.copy(baslik, 0);
  baslik.writeUInt32LE(BASLIK_BOY, 32); // dosya_boy = 112
  baslik.writeUInt32LE(BASLIK_BOY, 36); // baslik_boy = 0x70
  baslik.writeUInt32LE(ENDIAN_ETIKET, 40); // endian etiketi
  // link/harita/string/type/proto/field/method/class/data sayaç+ofsetleri 0 kaldı.
  createHash("sha1").update(baslik.subarray(32)).digest().copy(baslik, 12); // imza
  baslik.writeUInt32LE(adler32(baslik.subarray(12)), 8); // checksum
  return baslik;
}

// Kurulum: deterministik yazım; aynı girdiden hep aynı çıktı (idempotent).
mkdirSync(corpusDir, { recursive: true });
const baytlar = dexBaytlariniUret();
writeFileSync(HEDEF_DEX, baytlar);
// Özet satırı kurulum kanıtı olarak konsola yazılır.
const ozet = createHash("sha256").update(baytlar).digest("hex");
console.log(`OK: uretildi mini.dex (${baytlar.length} bayt, sha256=${ozet})`);
