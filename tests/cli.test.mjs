// cli.test.mjs: rea-plus CLI duman testi (analyze-evm + doctor).
// Koş: node tests/cli.test.mjs (önce `npm run build` gerekir).
// İki kapı: transfer seçicisi + doctor node/katalog, hepsi exit 0.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// CLI girişi: package.json bin rea-plus-cli ile aynı dosya.
const cli = join(kok, "dist", "cli", "index.js");
// Kanonik imza tablosu: keccak ilk 4 baytı, 0x önekiyle.
const SECICI = "0xa9059cbb";
// Basit assert: koşul tutmazsa Türkçe mesajla patlat.
function assert(kosul, mesaj) {
  if (!kosul) throw new Error(mesaj);
}
// CLI'yi çalıştır, stdout + exit kodunu birlikte döndür.
function kos(args) {
  try {
    const out = execFileSync("node", [cli, ...args], { encoding: "utf8" });
    return { out, kod: 0 };
  } catch (h) {
    return { out: `${h.stdout ?? ""}${h.stderr ?? ""}`, kod: h.status ?? 1 };
  }
}
try {
  // 1) metin kip: transfer imzası kanonik seçiciyi vermeli.
  const metin = kos(["analyze-evm", "transfer(address,uint256)"]);
  assert(metin.kod === 0, "analyze-evm exit 0 olmalı");
  assert(metin.out.includes(SECICI), "transfer seçici 0xa9059cbb olmalı");
  // 2) json kip: aynı seçici JSON alanında da dönmeli.
  const js = kos(["analyze-evm", "transfer(address,uint256)", "--json"]);
  assert(js.kod === 0, "analyze-evm --json exit 0 olmalı");
  assert(JSON.parse(js.out).selector === SECICI, "json selector yanlış");
  // 3) doctor: node satırı var + katalog adresi dolu olmalı.
  const d = kos(["doctor", "--json"]);
  assert(d.kod === 0, "doctor --json exit 0 olmalı");
  const rapor = JSON.parse(d.out);
  assert(rapor.ok === true, "doctor ok true olmalı");
  const nodeSatir = rapor.araclar.find((a) => a.id === "node");
  assert(nodeSatir?.durum === "var", "doctor node satırı var olmalı");
  assert(typeof nodeSatir?.surum === "string", "doctor node sürümü dizge olmalı");
  const kataloglu = rapor.araclar.filter((a) => (a.indir ?? "") !== "");
  assert(kataloglu.length > 0, "doctor katalog adresi boş olmamalı");
  console.log(`OK: analyze-evm=${SECICI} doctor=node+katalog`); // kanıt satırı
  process.exit(0);
} catch (hata) {
  // Hata Türkçe mesajla stderr'e düşer, süreç 1 ile biter.
  console.error(`FAIL: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
