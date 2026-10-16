// scripts/setup-paketle.mjs: setup sihirbazını tek dosyalık standalone asset'lere
// çevirir (release'e yüklenir). setup.ts yalnız node built-in kullanır, bu yüzden
// derlenmiş dist/cli/setup.js + main çağrısı yeterlidir.
// Koş: npm run build && node scripts/setup-paketle.mjs
// Çıktı: dist-release/setup.mjs + dist-release/setup.ps1
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const kok = dirname(dirname(fileURLToPath(import.meta.url)));
const cikis = join(kok, "dist-release");
mkdirSync(cikis, { recursive: true });

const setupJs = join(kok, "dist", "cli", "setup.js");
if (!existsSync(setupJs)) {
  console.error("dist/cli/setup.js yok: önce npm run build");
  process.exit(1);
}
const surum = JSON.parse(readFileSync(join(kok, "package.json"), "utf8")).version;
const govde = readFileSync(setupJs, "utf8");
const mjs = `#!/usr/bin/env node
// rea-plus setup sihirbazı (standalone release asset'i, v${surum}).
// Kaynak: src/cli/setup.ts. Kullanım: node setup.mjs [--client <id>] [--yes] [--dry-run] [--force] [--list]
${govde}
const __args = process.argv.slice(2);
runSetupCommand(__args, __args.includes("--json"));
`;
writeFileSync(join(cikis, "setup.mjs"), mjs, "utf8");
const ps1 = `# rea-plus setup (Windows tek-tik, v${surum}).
# Kullanim: .\\setup.ps1 [--client <id>] [--yes] [--dry-run] [--force] [--list]
# node gerekir (https://nodejs.org). setup.mjs ile ayni dizinde olmalidir.
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source)
if (-not $node) { Write-Error "node bulunamadi: https://nodejs.org adresinden Node.js 20+ kurun."; exit 1 }
$burada = Split-Path -Parent $MyInvocation.MyCommand.Path
& $node (Join-Path $burada "setup.mjs") @args
exit $LASTEXITCODE
`;
writeFileSync(join(cikis, "setup.ps1"), ps1, "utf8");
console.log(`setup assetleri yazildi: ${cikis} (setup.mjs + setup.ps1)`);
