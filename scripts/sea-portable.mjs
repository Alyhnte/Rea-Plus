// scripts/sea-portable.mjs: portable node bundle derler (Dalga 4e/sea-dagitim).
// Karar (bkz. docs/SEA-FIZIBILITE.md + docs/SEA-DAGITIM.md): tek-dosya SEA exe
// 3 engelli (129MB frida binding gomulemez, dinamik playwright, imzalama + postject
// ag ister) oldugu icin GERCEKCI dagitim = sistemdeki node.exe + dist/ + prod
// node_modules tasiyan portable dizin (+zip). Ag YOK, npm ci/install YOK,
// node indirmesi YOK (process.execPath kopyalanir), imza/AV sorunu YOK.
// Kos: npm run build && node scripts/sea-portable.mjs [--cikti <dizin>]
// Cikti: dist-release/rea-plus-portable-<platform>-<arch>/ + MANIFEST.json (+zip, best-effort).
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(kok, "package.json"), "utf8"));
const SURUM = pkg.version;

const ciktiArg = process.argv.indexOf("--cikti");
const dizin = ciktiArg >= 0
  ? resolve(process.argv[ciktiArg + 1])
  : join(kok, "dist-release", `rea-plus-portable-${process.platform}-${process.arch}`);

// 0. Onkosul: derlenmis dist sart (tsc + copy-assets).
const distKaynak = join(kok, "dist");
if (!existsSync(join(distKaynak, "server.js")) || !existsSync(join(distKaynak, "cli", "index.js"))) {
  console.error("dist/ eksik: once `npm run build` kosulmali.");
  process.exit(1);
}

// 1. Temiz cikti dizini (yalniz bu dizine yazilir; baska yere dokunulmaz).
rmSync(dizin, { recursive: true, force: true });
mkdirSync(dizin, { recursive: true });

// 2. Sistem node'unun kopyasi (indirme yok).
const nodeHedefAdi = process.platform === "win32" ? "node.exe" : "node";
const nodeHedef = join(dizin, nodeHedefAdi);
copyFileSync(process.execPath, nodeHedef);
const nodeBoyut = statSync(nodeHedef).size;

// 3. dist/ + kok dosyalari (Dockerfile uretim katmaniyla ayni kume).
cpSync(distKaynak, join(dizin, "dist"), { recursive: true });
for (const dosya of ["package.json", "server.json"]) {
  copyFileSync(join(kok, dosya), join(dizin, dosya));
}
if (existsSync(join(kok, "configs"))) cpSync(join(kok, "configs"), join(dizin, "configs"), { recursive: true });

// 4. node_modules: yalniz uretim bagimliliklari. devDependencies'in top-level
// karsiliklari budanir (or. @types/node -> @types dizini; typescript, playwright).
// Gerekce: tsc/playwright calisma aninda gerekmez; playwright dinamik
// `import()` ile yuklenir, yoklugu `capability_unsupported` + kurulum ipucu
// doner (sahte basari yok). Transitive artiklar kalabilir; boyut notu MANIFEST'te.
const devUst = new Set(
  Object.keys(pkg.devDependencies ?? {}).map((ad) =>
    ad.startsWith("@") ? ad.split("/").slice(0, 2).join("/") : ad.split("/")[0],
  ),
);
const nmKaynak = join(kok, "node_modules");
const nmHedef = join(dizin, "node_modules");
mkdirSync(nmHedef, { recursive: true });
const budanan = [];
for (const girdi of readdirSync(nmKaynak)) {
  if (girdi === ".bin" || girdi === ".package-lock.json") { budanan.push(girdi); continue; }
  let atla = false;
  for (const d of devUst) {
    const ust = d.startsWith("@") ? d.split("/")[0] : d;
    if (girdi === ust || girdi === d) {
      // Scoped dizinde (@types) yalniz dev paketler varsa tum dizin atlanir.
      if (girdi.startsWith("@")) {
        const alt = readdirSync(join(nmKaynak, girdi));
        const hepsiDev = alt.every((a) => devUst.has(`${girdi}/${a}`));
        if (hepsiDev) { atla = true; break; }
        // Kismi dev: dizin kopyalanir, dev cocuklar ayiklanir.
        mkdirSync(join(nmHedef, girdi), { recursive: true });
        for (const a of alt) {
          if (devUst.has(`${girdi}/${a}`)) { budanan.push(`${girdi}/${a}`); continue; }
          cpSync(join(nmKaynak, girdi, a), join(nmHedef, girdi, a), { recursive: true });
        }
        atla = true; // isaretle ki asagidaki toptan kopya calismasin
        break;
      }
      atla = true;
      break;
    }
  }
  if (atla) { if (!budanan.includes(girdi)) budanan.push(girdi); continue; }
  cpSync(join(nmKaynak, girdi), join(nmHedef, girdi), { recursive: true });
}

// 5. Baslaticilar.
if (process.platform === "win32") {
  writeFileSync(join(dizin, "rea-plus.cmd"), `@echo off\r\n"%~dp0node.exe" "%~dp0dist\\server.js" %*\r\n`, "utf8");
  writeFileSync(join(dizin, "rea-plus-cli.cmd"), `@echo off\r\n"%~dp0node.exe" "%~dp0dist\\cli\\index.js" %*\r\n`, "utf8");
} else {
  const srv = join(dizin, "rea-plus"); const cli = join(dizin, "rea-plus-cli");
  writeFileSync(srv, `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/dist/server.js" "$@"\n`, "utf8");
  writeFileSync(cli, `#!/bin/sh\nexec "$(dirname "$0")/node" "$(dirname "$0")/dist/cli/index.js" "$@"\n`, "utf8");
  chmodSync(srv, 0o755); chmodSync(cli, 0o755);
}
writeFileSync(
  join(dizin, "KULLANIM.txt"),
  [
    `rea-plus portable v${SURUM} (${process.platform}-${process.arch}, node ${process.version}).`,
    "Kurulum yok: bu dizin tasinir, icindeki node ile calisir.",
    process.platform === "win32"
      ? "  rea-plus-cli.cmd doctor        (ortam raporu)"
      : "  ./rea-plus-cli doctor          (ortam raporu)",
    "Sinirlar: playwright pakette YOK (browser domainleri capability_unsupported);",
    "imza yok (SmartScreen ilk calistirmada sorabilir); baska OS/mimariye tasinmaz",
    "(frida_binding.node platforma ozeldir).",
    "",
  ].join("\n"),
  "utf8",
);

// 6. Boyut sayimi (gercek olcum; uydurma yok).
let dosyaSayisi = 0; let toplamBayt = 0;
(function gez(d) {
  for (const g of readdirSync(d, { withFileTypes: true })) {
    const t = join(d, g.name);
    if (g.isDirectory()) gez(t);
    else { dosyaSayisi++; toplamBayt += statSync(t).size; }
  }
})(dizin);
const bayt = (p) => {
  try {
    const s = statSync(join(dizin, p));
    if (!s.isDirectory()) return s.size;
    let n = 0;
    (function g(d) {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const t = join(d, e.name);
        if (e.isDirectory()) g(t); else n += statSync(t).size;
      }
    })(join(dizin, p));
    return n;
  } catch { return -1; }
};

const manifest = {
  ad: "rea-plus-portable",
  surum: SURUM,
  platform: process.platform,
  mimari: process.arch,
  node: { surum: process.version, kaynak: "sistem node kopyasi (process.execPath); indirme yok", boyut: nodeBoyut },
  olusturma: new Date().toISOString(),
  icerik: {
    dosyaSayisi,
    toplamBayt,
    baytlar: { node: bayt(nodeHedefAdi), dist: bayt("dist"), nodeModules: bayt("node_modules") },
  },
  devBudama: [...budanan].sort(),
  playwright: {
    pakette: false,
    neden: "devDependencies'te; dinamik import + harici tarayici binary'si SEA/portable'a gomu tasinamaz; yoklugu capability_unsupported doner",
  },
  sea: {
    tekDosya: {
      ok: false,
      neden:
        "3 engel acik (docs/SEA-FIZIBILITE.md): (1) frida_binding.node ~129MiB, SEA blob'a gomulemez; " +
        "(2) playwright dinamik yuk + harici tarayici; (3) postject ag ister + kod imzalama yok. " +
        "Bu paket tek-dosya degil; frida dosya olarak tasinir, imza/AV sorunu yoktur.",
    },
  },
  duman: {
    komut: "node dist/cli/index.js analyze-evm transfer(address,uint256) --json",
    beklenen: "0xa9059cbb",
  },
};
writeFileSync(join(dizin, "MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

// 7. Zip (best-effort; release asset deseni). Basarisizsa dizin yine ciktidir.
let zipYolu = null;
try {
  zipYolu = `${dizin}.zip`;
  if (process.platform === "win32") {
    execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `Compress-Archive -Path '${dizin}' -DestinationPath '${zipYolu}' -Force`],
      { timeout: 600_000 },
    );
  } else {
    execFileSync("zip", ["-qr", zipYolu, dizin], { timeout: 600_000 });
  }
  console.log(`[sea-portable] zip: ${zipYolu} (${statSync(zipYolu).size} bayt)`);
} catch (e) {
  console.warn(`[sea-portable] UYARI: zip uretilemedi (${String(e).split("\n")[0]}); dizin ciktidir.`);
}

console.log(`[sea-portable] TAMAM: ${dizin}`);
console.log(`[sea-portable] dosya: ${dosyaSayisi}, toplam: ${toplamBayt} bayt (node ${nodeBoyut} bayt)`);
console.log(`[sea-portable] budanan: ${[...budanan].sort().join(", ")}`);
