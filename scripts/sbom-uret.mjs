// scripts/sbom-uret.mjs: CycloneDX SBOM ureteci (offline, gercek verili).
// Kos: node scripts/sbom-uret.mjs [--cikti sbom.json]
// - Surumler package.json + package-lock.json'dan okunur (elle yazilmaz).
// - Dogrudan bagimliliklar lock'taki cozulmus surumleriyle yazilir.
// - Hash'ler yalniz gercek olculmus degerlerdir: kok bilesen icin `npm pack`
//   ciktisi temp dizine alinip sha256/sha512 olculur, sonra silinir.
//   Pack basarisiz olursa hash yazilmaz (uydurma hash YOK).
// - Magaza yayini yapmaz; yalniz sbom.json yazar.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ciktiArg = process.argv.indexOf("--cikti");
const ciktiYol = ciktiArg >= 0 ? resolve(root, process.argv[ciktiArg + 1]) : join(root, "sbom.json");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const SURUM = pkg.version;
const TARBALL_URL = `https://registry.npmjs.org/${pkg.name}/-/${pkg.name}-${SURUM}.tgz`;

// `sha512-<base64>` bicimindeki integrity degerini CycloneDX hash dizisine cevirir.
// Cozulemezse bos dizi doner (uydurma yazilmaz).
function integrityHashleri(integrity) {
  if (typeof integrity !== "string") return [];
  const m = integrity.match(/^(sha1|sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/);
  if (!m) return [];
  const algAd = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" }[m[1]];
  try {
    return [{ alg: algAd, content: Buffer.from(m[2], "base64").toString("hex") }];
  } catch {
    return [];
  }
}

function lisans(l) {
  if (typeof l !== "string" || !l.trim()) return undefined;
  // Kisa SPDX kimlikleri id olarak, uzun/complex ifadeler name olarak yazilir.
  return /^[A-Za-z0-9.+-]+$/.test(l) ? [{ license: { id: l } }] : [{ license: { name: l } }];
}

// Kok bilesenin gercek tarball hash'leri: `npm pack` temp dizine alinir, olculur, silinir.
function tarballHashleri() {
  let alan = null;
  try {
    alan = mkdtempSync(join(tmpdir(), "reaplus-sbom-"));
  } catch {
    return []; // temp acilamazsa hash yazilmaz
  }
  try {
    // Tek komut dizgisi + shell: win32'de npm.cmd cozumlenir, DEP0190 uyarisi cikmaz.
    const cikti = execFileSync(`npm pack --ignore-scripts --pack-destination "${alan}"`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      shell: true, // win32'de npm.cmd cozumlenmesi icin
    });
    const dosyaAd = cikti.trim().split(/\r?\n/).pop();
    const tgz = join(alan, dosyaAd);
    const bayt = readFileSync(tgz);
    return [
      { alg: "SHA-256", content: createHash("sha256").update(bayt).digest("hex") },
      { alg: "SHA-512", content: createHash("sha512").update(bayt).digest("hex") },
    ];
  } catch {
    return []; // pack alinamazsa hash yazilmaz
  } finally {
    if (alan && existsSync(alan)) rmSync(alan, { recursive: true, force: true });
  }
}

const dogrudan = lock.packages?.[""]?.dependencies ?? {};
const bilesenler = Object.keys(dogrudan)
  .sort()
  .map((ad) => {
    const kilit = lock.packages?.[`node_modules/${ad}`] ?? {};
    const surum = kilit.version ?? "bilinmiyor";
    const purl = `pkg:npm/${ad}@${surum}`;
    const bilesen = {
      type: "library",
      "bom-ref": purl,
      name: ad,
      version: surum,
      purl,
      scope: "required",
    };
    const hs = integrityHashleri(kilit.integrity);
    if (hs.length) bilesen.hashes = hs;
    const ls = lisans(kilit.license);
    if (ls) bilesen.licenses = ls;
    if (typeof kilit.resolved === "string") {
      bilesen.externalReferences = [{ type: "distribution", url: kilit.resolved }];
    }
    return bilesen;
  });

const kok = {
  type: "application",
  "bom-ref": `pkg:npm/${pkg.name}@${SURUM}`,
  name: pkg.name,
  version: SURUM,
  description: pkg.description,
  purl: `pkg:npm/${pkg.name}@${SURUM}`,
  licenses: lisans(pkg.license),
  externalReferences: [{ type: "distribution", url: TARBALL_URL }],
};
const kokHash = tarballHashleri();
if (kokHash.length) kok.hashes = kokHash;

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [
      {
        vendor: "ReaPlus",
        name: "scripts/sbom-uret.mjs",
        version: SURUM,
      },
    ],
    component: kok,
  },
  components: bilesenler,
};

writeFileSync(ciktiYol, JSON.stringify(sbom, null, 2) + "\n", "utf8");
console.log(`SBOM yazildi: ${ciktiYol} (${bilesenler.length} dogrudan bilesen, kok hash: ${kokHash.length ? "gercek" : "yok"})`);
