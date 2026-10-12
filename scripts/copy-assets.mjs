// copy-assets.mjs: tsc'nin kopyalamadığı çalışma zamanı dosyalarını src -> dist taşır.
// Kapsam: .js (örn. frida-agent.js) ve .py (Ghidra scriptleri). Göreli yol korunur.
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");
const UZANTILAR = new Set([".js", ".py"]);

if (!existsSync(dist)) {
  console.error("copy-assets: dist yok; önce tsc koşulmalı.");
  process.exit(1);
}

let sayi = 0;
function gez(dir) {
  for (const ad of readdirSync(dir)) {
    const yol = join(dir, ad);
    if (statSync(yol).isDirectory()) { gez(yol); continue; }
    const nokta = ad.lastIndexOf(".");
    if (nokta < 0 || !UZANTILAR.has(ad.slice(nokta))) continue;
    const hedef = join(dist, relative(src, yol));
    cpSync(yol, hedef, { force: true });
    sayi++;
    console.log(`asset: ${relative(root, yol)} -> ${relative(root, hedef)}`);
  }
}
gez(src);
console.log(`copy-assets: ${sayi} dosya kopyalandı.`);
