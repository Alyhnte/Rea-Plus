// scripts/sea-build.mjs: hello-world Node SEA pilotu (Dalga J/1 fizibilite).
// Ne yapar (yalnızca geçici dizinde çalışır, repoya yazmaz):
//   1. hello.mjs + sea-config.json yazar.
//   2. `node --experimental-sea-config` ile hazırlık blob'u üretir.
//   3. node.exe'nin kopyasına postject ile blob'u enjekte eder (güncel sentinel fuse).
//   4. Üretilen exe'yi çalıştırıp çıktıyı doğrular.
// Koş: node scripts/sea-build.mjs [--cikti <yol>]
// Gereksinim: Node 20+, postject (PATH'te ya da npx ile indirilebilir; ağ gerekir).
// Not: postject repoya kurulmaz; test kümesi bu scripti çağırmaz (bkz. tests/sea-fizibilite.test.mjs).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Güncel sentinel (Node docs v26). Eski `...ac052938` v24 win-x64 derlemelerinde YOKTUR.
const SENTINEL = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const BEKLENEN_CIKTI = "SEA-HELLO-OK";

const ciktiArg = process.argv.indexOf("--cikti");
const calisma = ciktiArg >= 0 ? process.argv[ciktiArg + 1] : mkdtempSync(join(tmpdir(), "rea-sea-"));
if (!ciktiArg) console.log(`[sea] çalışma dizini: ${calisma}`);

const exeAdi = process.platform === "win32" ? "sea-hello.exe" : "sea-hello";
const exeYolu = ciktiArg ? join(calisma, exeAdi) : join(calisma, exeAdi);

// 1-2. Kaynak + blob.
const isDizini = ciktiArg ? mkdtempSync(join(tmpdir(), "rea-sea-is-")) : calisma;
writeFileSync(join(isDizini, "hello.mjs"), `console.log("${BEKLENEN_CIKTI}");\n`);
writeFileSync(join(isDizini, "sea-config.json"), JSON.stringify({ main: "hello.mjs", output: "sea-prep.blob" }));
execFileSync(process.execPath, ["--experimental-sea-config", "sea-config.json"], {
  cwd: isDizini,
  timeout: 60_000,
});
const blobYolu = join(isDizini, "sea-prep.blob");
console.log(`[sea] blob: ${statSync(blobYolu).size} bayt`);

// 3. node kopyası + enjeksiyon.
copyFileSync(process.execPath, exeYolu);
console.log(`[sea] kopya: ${exeYolu} (${statSync(exeYolu).size} bayt)`);
try {
  execFileSync("postject", [exeYolu, "NODE_SEA_BLOB", blobYolu, "--sentinel-fuse", SENTINEL], {
    timeout: 120_000,
    stdio: "inherit",
  });
} catch {
  if (!existsSync(exeYolu)) throw new Error("node kopyası oluşturulamadı.");
  console.log("[sea] postject PATH'te yok; npx ile deneniyor (ağ gerekir)...");
  try {
    const npx = process.platform === "win32" ? "npx.cmd" : "npx";
    execFileSync(npx, ["-y", "postject@1.0.0-alpha.6", exeYolu, "NODE_SEA_BLOB", blobYolu, "--sentinel-fuse", SENTINEL], {
      timeout: 300_000,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  } catch {
    throw new Error(
      "postject bulunamadı/indirilemedi. Engel: Windows'ta SEA enjeksiyonu postject gerektirir " +
        "(kurulu değil, ağsız ortamda edinilemez). Blob üretimi yukarıda doğrulandı; " +
        "ayrıntı: docs/SEA-FIZIBILITE.md",
    );
  }
}

// 4. Çalıştır + doğrula.
const cikti = execFileSync(exeYolu, { timeout: 30_000, encoding: "utf8" });
console.log(`[sea] exe çıktısı: ${cikti.trim().split(/\r?\n/)[0]}`);
if (!cikti.includes(BEKLENEN_CIKTI)) throw new Error(`beklenen çıktı alınamadı: ${BEKLENEN_CIKTI}`);
console.log(`[sea] TAMAM: ${exeYolu} (${statSync(exeYolu).size} bayt) hello-world SEA çalışıyor.`);
