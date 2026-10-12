// scripts/korpus-kur.mjs: golden korpus kurulumu (kopyala + üret, idempotent).
// Koş: node scripts/korpus-kur.mjs (repo kökünden; ikinci koşu aynı baytları yazar).
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

// Betiğin bulunduğu repo kökü; çıktılar hep aynı yere yazılır.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Korpus dizini yoksa kurulur (recursive: ikinci koşuda zararsız).
const corpusDir = join(kok, "tests", "corpus");
// Kaynak ikililer: conduit tarafındaki gerçek dosyalar, aynen kopyalanır.
const KAYNAK_ELF = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\examples\\target\\mini_branch.elf";
const KAYNAK_PE = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\conduit\\plugin\\x64dbg\\test\\mini_pe_x64.exe";
// Hedef yollar: korpusun kanonik 5 dosyası.
const HEDEF_ELF = join(corpusDir, "mini_branch.elf");
const HEDEF_PE = join(corpusDir, "mini_pe_x64.exe");
const HEDEF_APK = join(corpusDir, "sahte.apk");
const HEDEF_WASM = join(corpusDir, "ornek.wasm");
const HEDEF_JS = join(corpusDir, "ornek.js");

// CRC-32 (IEEE) tablosu: zip girdisi için bağımlılıksız, deterministik.
let crcTablo = null;
function tabloyuKur() {
  if (crcTablo) return crcTablo;
  crcTablo = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTablo[n] = c >>> 0;
  }
  return crcTablo;
}
// Tamponun CRC-32 özeti (işaretsiz 32-bit sayı döner).
function crc32(tampon) {
  const tablo = tabloyuKur();
  let c = 0xffffffff;
  for (const b of tampon) c = tablo[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Gerçek zip yazımı: tek girdili (AndroidManifest.xml) store-değil deflate arşivi.
// DOS tarih/saat sabit tutulur (2024-01-01 00:00) ki her koşu aynı baytı üretsin.
function apkBaytlariniUret() {
  const BILDIRIM = '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.ornek.sahte" android:versionCode="1" android:versionName="1.0" />\n';
  const ham = Buffer.from(BILDIRIM, "utf8");
  // Zip girdileri ham deflate akışı kullanır (zlib başlıksız).
  const sıkısık = deflateRawSync(ham, { level: 9 });
  const ozet = crc32(ham);
  const ad = Buffer.from("AndroidManifest.xml", "utf8");
  const DOS_SAAT = 0x0000;
  const DOS_TARIH = 0x5821; // 2024-01-01
  // Yerel dosya başlığı (30 bayt + ad).
  const yerel = Buffer.alloc(30 + ad.length);
  yerel.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  yerel.writeUInt16LE(20, 4); // çıkarma sürümü
  yerel.writeUInt16LE(0, 6); // bayrak
  yerel.writeUInt16LE(8, 8); // yöntem: deflate
  yerel.writeUInt16LE(DOS_SAAT, 10);
  yerel.writeUInt16LE(DOS_TARIH, 12);
  yerel.writeUInt32LE(ozet, 14);
  yerel.writeUInt32LE(sıkısık.length, 18);
  yerel.writeUInt32LE(ham.length, 22);
  yerel.writeUInt16LE(ad.length, 26);
  yerel.writeUInt16LE(0, 28); // ek alan yok
  ad.copy(yerel, 30);
  // Merkezi dizin kaydı (46 bayt + ad); yerel başlık uzaklığı 0'dır.
  const merkezBaslangic = yerel.length + sıkısık.length;
  const merkez = Buffer.alloc(46 + ad.length);
  merkez.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
  merkez.writeUInt16LE(20, 4); // üreten sürüm
  merkez.writeUInt16LE(20, 6); // çıkarma sürümü
  merkez.writeUInt16LE(0, 8);
  merkez.writeUInt16LE(8, 10);
  merkez.writeUInt16LE(DOS_SAAT, 12);
  merkez.writeUInt16LE(DOS_TARIH, 14);
  merkez.writeUInt32LE(ozet, 16);
  merkez.writeUInt32LE(sıkısık.length, 20);
  merkez.writeUInt32LE(ham.length, 24);
  merkez.writeUInt16LE(ad.length, 28);
  merkez.writeUInt16LE(0, 30);
  merkez.writeUInt16LE(0, 32);
  merkez.writeUInt16LE(0, 34);
  merkez.writeUInt16LE(0, 36);
  merkez.writeUInt32LE(0, 38);
  merkez.writeUInt32LE(0, 42);
  ad.copy(merkez, 46);
  // Arşiv sonu kaydı (22 bayt, yorumsuz).
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  son.writeUInt16LE(0, 4);
  son.writeUInt16LE(0, 6);
  son.writeUInt16LE(1, 8); // bu diskteki girdi
  son.writeUInt16LE(1, 10); // toplam girdi
  son.writeUInt32LE(merkez.length, 12);
  son.writeUInt32LE(merkezBaslangic, 16);
  son.writeUInt16LE(0, 20);
  return Buffer.concat([yerel, sıkısık, merkez, son]);
}

// En küçük geçerli wasm: sihir + sürüm 1 + boş tip bölümü (id 1, boy 1, sayaç 0).
function wasmBaytlariniUret() {
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00]);
}

// Küçük require'lı örnek bundle (deterministik metin).
function jsMetniniUret() {
  return `// ornek.js: golden korpus icin kucuk require'li bundle (deterministik).
const path = require("node:path");
const fs = require("node:fs");
function selamla(ad) {
  return "merhaba " + ad + " (" + path.basename(__filename) + ")";
}
const VARSAYILAN = selamla("korpus");
module.exports = { selamla, VARSAYILAN, fs };
`;
}

// Kurulum: kopyala + üret; aynı girdiden hep aynı çıktı (idempotent).
mkdirSync(corpusDir, { recursive: true });
// Gerçek ikililer aynen kopyalanır (üzerine yazma idempotenttir).
copyFileSync(KAYNAK_ELF, HEDEF_ELF);
copyFileSync(KAYNAK_PE, HEDEF_PE);
// Türetilenler her koşuda aynı baytlarla yeniden yazılır.
writeFileSync(HEDEF_APK, apkBaytlariniUret());
writeFileSync(HEDEF_WASM, wasmBaytlariniUret());
writeFileSync(HEDEF_JS, jsMetniniUret(), "utf8");
// Özet satırları kurulum kanıtı olarak konsola yazılır.
console.log("OK: kopyalandi mini_branch.elf");
console.log("OK: kopyalandi mini_pe_x64.exe");
console.log("OK: uretildi sahte.apk (AndroidManifest.xml)");
console.log("OK: uretildi ornek.wasm");
console.log("OK: uretildi ornek.js");
