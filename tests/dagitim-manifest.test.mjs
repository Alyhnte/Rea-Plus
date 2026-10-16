// tests/dagitim-manifest.test.mjs: Dalga J/2 dagitim manifest kapisi (offline).
// Kos: node --test tests/dagitim-manifest.test.mjs
// Kapsam: (a) winget/scoop/homebrew semaya uyar + surum package.json ile eslesir,
// (b) sbom.json gecerli CycloneDX + bilesen sayisi >0,
// (c) URL'ler gercek desene uyar (github.com/Alyhnte/ReaPlus | registry.npmjs.org/rea-plus),
// (d) docs/SANDBOX.md Hyper-V + VirtualBox adimlari sirali ve eksiksizdir.
// Magaza yayini YOK: yalniz dosya icerigi dogrulanir, `winget submit` vb. kosulmaz.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oku = (rel) => readFileSync(path.join(root, rel), "utf8");
const pkg = JSON.parse(oku("package.json"));
const lock = JSON.parse(oku("package-lock.json"));
const SURUM = pkg.version;

// Gercek dagitim deseni: Alyhnte/ReaPlus GitHub alani veya rea-plus npm alani.
const GERCEK_URL = /^https:\/\/(github\.com\/Alyhnte\/ReaPlus|registry\.npmjs\.org\/rea-plus)\//;
const ANASAYFA = "https://github.com/Alyhnte/ReaPlus";
const HASH64 = /^[0-9a-f]{64}$/i;

// Hash alani: gercek 64-hex sha256 ya da acikca "bilinmiyor" olur; uydurma yasaktir.
function hashGecerli(v) {
  const s = String(v ?? "").trim().replace(/^"(.*)"$/, "$1");
  return s === "bilinmiyor" || HASH64.test(s);
}

function metindekiUrller(metin) {
  return [...metin.matchAll(/https:\/\/[^\s"'`()\]]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
}

function wingetYamlYollari() {
  const taban = path.join(root, "winget");
  assert.ok(existsSync(taban), "winget/ dizini olmali");
  const cikti = [];
  const gez = (d) => {
    for (const g of readdirSync(d, { withFileTypes: true })) {
      const t = path.join(d, g.name);
      if (g.isDirectory()) gez(t);
      else if (/\.ya?ml$/.test(g.name)) cikti.push(t);
    }
  };
  gez(taban);
  assert.ok(cikti.length > 0, "winget/ altinda en az bir YAML olmali");
  return cikti;
}

describe("dagitim manifestleri (Dalga J/2)", () => {
  it("(a) winget YAML'lari surumlu + sema alanli + surum eslesir", () => {
    const yollar = wingetYamlYollari();
    const surumDizini = yollar.some((y) => y.split(path.sep).includes(SURUM));
    assert.ok(surumDizini, `winget altinda surum dizini (${SURUM}) olmali`);
    let installerGordu = false;
    for (const y of yollar) {
      const icerik = readFileSync(y, "utf8");
      assert.ok(/PackageIdentifier\s*:\s*\S+/.test(icerik), `${y}: PackageIdentifier olmali`);
      assert.ok(
        new RegExp(`PackageVersion\\s*:\\s*["']?${SURUM.replaceAll(".", "\\.")}["']?`).test(icerik),
        `${y}: PackageVersion ${SURUM} olmali`,
      );
      assert.ok(/ManifestType\s*:\s*\S+/.test(icerik), `${y}: ManifestType olmali`);
      if (/ManifestType\s*:\s*installer/.test(icerik)) {
        installerGordu = true;
        assert.ok(/InstallerUrl\s*:/.test(icerik), `${y}: InstallerUrl olmali`);
        const m = icerik.match(/InstallerSha256\s*:\s*(\S+)/);
        assert.ok(m, `${y}: InstallerSha256 olmali`);
        assert.ok(hashGecerli(m[1]), `${y}: InstallerSha256 gercek hash ya da bilinmiyor olmali`);
      }
    }
    assert.ok(installerGordu, "en az bir winget installer manifesti olmali");
  });

  it("(a) scoop JSON semaya uyar + surum eslesir", () => {
    const yol = path.join(root, "scoop", "rea-plus.json");
    assert.ok(existsSync(yol), "scoop/rea-plus.json olmali");
    const m = JSON.parse(readFileSync(yol, "utf8"));
    assert.equal(m.version, SURUM, "scoop version package.json ile eslesmeli");
    assert.equal(m.homepage, ANASAYFA, "scoop homepage gercek olmali");
    assert.ok(typeof m.url === "string" && m.url.length > 0, "scoop url olmali");
    assert.ok(hashGecerli(m.hash), "scoop hash gercek hash ya da bilinmiyor olmali");
  });

  it("(a) homebrew formula semaya uyar + surum eslesir", () => {
    const yol = path.join(root, "homebrew", "rea-plus.rb");
    assert.ok(existsSync(yol), "homebrew/rea-plus.rb olmali");
    const icerik = readFileSync(yol, "utf8");
    assert.ok(/class\s+\w+\s*<\s*Formula/.test(icerik), "formula Formula sinifi olmali");
    assert.ok(
      new RegExp(`version\\s+["']${SURUM.replaceAll(".", "\\.")}["']`).test(icerik),
      `formula version "${SURUM}" olmali`,
    );
    assert.ok(/url\s+["']https:\/\//.test(icerik), "formula url olmali");
    const m = icerik.match(/sha256\s+["']([^"']+)["']/);
    assert.ok(m, "formula sha256 olmali");
    assert.ok(hashGecerli(m[1]), "formula sha256 gercek hash ya da bilinmiyor olmali");
  });

  it("(b) sbom.json gecerli CycloneDX + bilesen sayisi >0", () => {
    const yol = path.join(root, "sbom.json");
    assert.ok(existsSync(yol), "sbom.json olmali");
    const sbom = JSON.parse(readFileSync(yol, "utf8"));
    assert.equal(sbom.bomFormat, "CycloneDX", "bomFormat CycloneDX olmali");
    assert.match(String(sbom.specVersion ?? ""), /^1\.(5|6|7)$/, "specVersion 1.5+ olmali");
    assert.equal(sbom.metadata?.component?.version, SURUM, "kok bilesen surumu eslesmeli");
    assert.equal(sbom.metadata?.component?.name, pkg.name, "kok bilesen adi eslesmeli");
    assert.ok(
      (sbom.metadata?.tools ?? []).some((t) => JSON.stringify(t).includes("sbom-uret")),
      "uretici sbom-uret.mjs olarak damgalanmali",
    );
    assert.ok(Array.isArray(sbom.components), "components dizi olmali");
    assert.ok(sbom.components.length > 0, "bilesen sayisi >0 olmali");
    for (const c of sbom.components) {
      assert.equal(typeof c.name, "string", "bilesen adi olmali");
      assert.match(String(c.version ?? ""), /^\d+\.\d+\.\d+/, `${c.name}: surum semver olmali`);
      assert.equal(typeof c["bom-ref"] ?? c.bomRef ?? "", "string");
    }
    // Dogrudan bagimliliklar package-lock'taki cozulmus surumleriyle yer alir.
    const dogrudan = lock.packages?.[""]?.dependencies ?? {};
    assert.ok(Object.keys(dogrudan).length > 0, "lock'ta dogrudan bagimlilik olmali");
    for (const ad of Object.keys(dogrudan)) {
      const cozulmus = lock.packages?.[`node_modules/${ad}`]?.version;
      const bilesen = sbom.components.find((c) => c.name === ad);
      assert.ok(bilesen, `SBOM dogrudan bagimliligi icermeli: ${ad}`);
      assert.equal(bilesen.version, cozulmus, `${ad} surumu lock'taki cozulmus surum olmali`);
    }
  });

  it("(b) scripts/sbom-uret.mjs mevcuttur (SBOM ureteci)", () => {
    assert.ok(existsSync(path.join(root, "scripts", "sbom-uret.mjs")), "scripts/sbom-uret.mjs olmali");
  });

  it("(c) manifest URL'leri gercek desene uyar + surum tasir", () => {
    const metinler = [
      ...wingetYamlYollari().map((y) => readFileSync(y, "utf8")),
      oku("scoop/rea-plus.json"),
      oku("homebrew/rea-plus.rb"),
    ];
    const tumUrller = metinler.flatMap(metindekiUrller);
    const urller = [...new Set(tumUrller)];
    assert.ok(urller.length > 0, "manifestlerde URL olmali");
    for (const u of urller) {
      assert.ok(GERCEK_URL.test(u) || u === ANASAYFA, `gercek desene uymayan URL: ${u}`);
    }
    // Her uc dagitim dosyasinda surumlu indirme URL'si olur (ayni URL birden
    // cok manifestte gecebilir; o yuzden tekil degil toplam sayilir).
    const surumluler = tumUrller.filter((u) => u.includes(SURUM) || u.includes(`v${SURUM}`));
    assert.ok(surumluler.length >= 3, `en az 3 surumlu indirme URL'si olmali (bulunan: ${surumluler.length})`);
  });

  it("(d) SANDBOX.md Hyper-V + VirtualBox adimlari sirali ve eksiksiz", () => {
    const yol = path.join(root, "docs", "SANDBOX.md");
    assert.ok(existsSync(yol), "docs/SANDBOX.md olmali");
    const icerik = oku("docs/SANDBOX.md");
    for (const bolum of ["Hyper-V", "VirtualBox"]) {
      assert.ok(icerik.includes(bolum), `${bolum} bolumu olmali`);
    }
    // Adimlar 1'den baslayip sirayla artar (her saglayici icin ayri sayim).
    for (const bolum of ["Hyper-V", "VirtualBox"]) {
      const bas = icerik.indexOf(bolum);
      const son = bolum === "Hyper-V" ? icerik.indexOf("VirtualBox") : icerik.length;
      const dilim = icerik.slice(bas, son < bas ? icerik.length : son);
      const adimlar = [...dilim.matchAll(/[Aa]dım\s+(\d+)/g)].map((m) => Number(m[1]));
      assert.ok(adimlar.length >= 4, `${bolum}: en az 4 adim olmali`);
      adimlar.forEach((n, i) => assert.equal(n, i + 1, `${bolum}: adimlar sirali olmali (${adimlar})`));
    }
    for (const anahtar of ["snapshot", "geri yük", "kontrol listesi"]) {
      assert.ok(icerik.toLocaleLowerCase("tr").includes(anahtar), `"${anahtar}" gecmeli`);
    }
    assert.ok(/ağ(sız|dan yalıtılmış| kapalı| bağlantısız)|ağ.*(kapalı|devre dışı|host-only)/i.test(icerik), "agsizlik tarifi olmali");
  });
});
