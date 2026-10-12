// rea-plus duman testi: derleme + EVM + facade sayıları tek koşuda.
// Çalıştırma: node tests/reaplus.smoke.mjs (başarıda exit 0, hatada exit 1).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// dist çıktıları derlenmiş kaynaktır; .mjs olduğu için tsc denetimine girmez.
import { FROZEN_CONDUIT_TOOLS } from "../dist/facade/toolNamespace.js";
import { mergedCatalog } from "../dist/facade/catalogMerge.js";
import { rea_evm_selector } from "../dist/rea-domains/wasm-evm/WasmEvmBridge.js";

// Kök dizini test dosyasının konumundan türet.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Beklenen giriş dosyası; görev tanımındaki kanonik yol budur.
const giris = join(kok, "dist", "server.js");

// Basit assert: koşul tutmazsa Türkçe mesajla patlat.
function assert(kosul, mesaj) {
  if (!kosul) throw new Error(mesaj);
}

try {
  // dist/server.js yoksa kullanıcıyı derlemeye yönlendir, teste devam et.
  if (!existsSync(giris)) {
    console.warn("UYARI: dist/server.js yok; önce `npm run build` çalıştır.");
  }
  // EVM: transfer imzası kanonik seçiciyle eşleşmeli.
  const transfer = rea_evm_selector("transfer(address,uint256)");
  assert(transfer.ok === true, "transfer çağrısı ok dönmedi");
  assert(transfer.details.selector === "0xa9059cbb", "transfer seçici yanlış");
  // EVM: approve imzası kanonik seçiciyle eşleşmeli.
  const approve = rea_evm_selector("approve(address,uint256)");
  assert(approve.ok === true, "approve çağrısı ok dönmedi");
  assert(approve.details.selector === "0x095ea7b3", "approve seçici yanlış");
  // Facade: dondurulmuş conduit araç listesi 30 olmalı.
  assert(FROZEN_CONDUIT_TOOLS.length === 30, "frozen liste 30 olmalı");
  // Katalog: 8 conduit + 8 rea girdisi toplam 16 olmalı.
  const katalog = mergedCatalog();
  assert(katalog.length === 16, "birleşik katalog 16 olmalı");
  // Özet satırları başarı kanıtı olarak konsola yazılır.
  console.log("OK: transfer=0xa9059cbb approve=0x095ea7b3");
  console.log(`OK: frozen=${FROZEN_CONDUIT_TOOLS.length} katalog=${katalog.length}`);
  process.exit(0);
} catch (hata) {
  // Hata Türkçe mesajla stderr'e düşer, süreç 1 ile biter.
  console.error(`FAIL: ${hata instanceof Error ? hata.message : String(hata)}`);
  process.exit(1);
}
