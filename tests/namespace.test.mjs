// rea-plus ad-alanı testi: qualifyReaTool prefix kuralını kilitler.
// Çalıştırma: node tests/namespace.test.mjs (başarıda exit 0, hatada exit 1).
import {
  FROZEN_CONDUIT_TOOLS,
  assertNoCollision,
  qualifyReaTool,
} from "../dist/facade/toolNamespace.js";

// Basit assert: koşul tutmazsa Türkçe mesajla patlat.
function assert(kosul, mesaj) {
  if (!kosul) throw new Error(mesaj);
}

// Beklenen eşleşme tablosu; çıplak ad asla dönmemeli.
const ornekler = [
  ["health", "rea_health"],
  ["disassemble", "rea_disassemble"],
];

try {
  // Dondurulmuş listedeki her ad rea_ prefixi almalı.
  for (const [girdi, beklenen] of ornekler) {
    assert(qualifyReaTool(girdi) === beklenen, `${girdi} -> ${beklenen} olmalı`);
  }
  // rea_ ile başlayan rea aracı aynen kalır, iki kez prefixlenmez.
  assert(qualifyReaTool("rea_evm_selector") === "rea_evm_selector", "rea adı değişmemeli");
  // Bilinmeyen çıplak ad da aynen kalır; kural yalnız frozen listeyi kapsar.
  assert(qualifyReaTool("rea_wasm_decode") === "rea_wasm_decode", "rea decode adı değişmemeli");
  // Çakışma yok: frozen prefixli adlar + rea adları tek kümede durur.
  const tumu = [...FROZEN_CONDUIT_TOOLS.map(qualifyReaTool), "rea_evm_selector", "rea_wasm_decode"];
  assertNoCollision(tumu);
  // Negatif yol: aynı ad iki kez geçerse collision hatası vermeli.
  let yakalandi = false;
  try {
    assertNoCollision(["rea_health", "rea_health"]);
  } catch {
    yakalandi = true;
  }
  assert(yakalandi, "çift ad collision vermeli");
  // Özet satırları başarı kanıtı olarak konsola yazılır.
  console.log("OK: health->rea_health disassemble->rea_disassemble");
  console.log("OK: rea_evm_selector prefixsiz aynen kalır, collision kilitli");
  process.exit(0);
} catch (hata) {
  // Hata Türkçe mesajla stderr'e düşer, süreç 1 ile biter.
  console.error(`FAIL: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
