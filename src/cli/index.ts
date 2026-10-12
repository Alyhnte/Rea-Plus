#!/usr/bin/env node
// cli: rea-plus komut satırı (analyze-evm/wasm/js + doctor)
// --json bayrağı her komutta JSON çıktı verir, bin eklemez.
import { runDoctorCommand } from "./doctor.js";
import { runEvmCommand } from "./evm.js";
import { runJsCommand } from "./js.js";
import { runWasmCommand } from "./wasm.js";

// Desteklenen komutlar: analiz üçlüsü + ortam raporu.
const KOMUTLAR = ["analyze-evm", "analyze-wasm", "analyze-js", "doctor"] as const;
type Komut = (typeof KOMUTLAR)[number];

// Kullanım metni: arg yoksa ya da bilinmeyen komutta basılır.
function kullanim(): void {
  console.log("kullanım: rea-plus <komut> [args] [--json]");
  console.log("  analyze-evm <\"sig\">        imza -> selector");
  console.log("  analyze-wasm <dosya>       export listesi + decode kapısı");
  console.log("  analyze-js <bundle> [map]  sourcemap/bundle özeti");
  console.log("  doctor                     prerequisites raporu");
}

// Bayrakları ayıkla: --json global, kalanı komut + args.
function main(): void {
  const ham = process.argv.slice(2);
  const json = ham.includes("--json");
  const temiz = ham.filter((a) => a !== "--json");
  const komut = temiz[0] as Komut | undefined;
  const args = temiz.slice(1);
  if (!komut || !KOMUTLAR.includes(komut)) {
    kullanim();
    process.exitCode = 1;
    return;
  }
  if (komut === "analyze-evm") runEvmCommand(args, json);
  else if (komut === "analyze-wasm") runWasmCommand(args, json);
  else if (komut === "analyze-js") runJsCommand(args, json);
  else runDoctorCommand(json);
}

// Doğrudan çalışınca başlat (import edilirse sessiz kalır).
main();
