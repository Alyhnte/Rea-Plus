// scripts/verify-corpus.mjs: golden korpus hash doğrulaması (tamamen offline).
// Koş: node scripts/verify-corpus.mjs [--corpus <dizin>] [--manifest <yol>]
// Başarıda exit 0; eksik/uyuşmaz/manifest-dışı dosyada dosya adıyla rapor + exit 1.
// Manifestin kendi yardımcı dosyaları (HASHES.json, README.md) fixture sayılmaz.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Betiğin bulunduğu repo kökü; varsayılan yollar hep aynı yere çözülür.
const kok = dirname(dirname(fileURLToPath(import.meta.url)));
// Varsayılan korpus dizini ile manifest yolu.
const VARSAYILAN_CORPUS = join(kok, "tests", "corpus");
const VARSAYILAN_MANIFEST = join(VARSAYILAN_CORPUS, "HASHES.json");
// Manifestin kendi yardımcı dosyaları: fixture değil, fazladan sayılmaz.
export const MANIFEST_YARDIMCILARI = ["HASHES.json", "README.md"];

// Dosyanın sha256 özeti (ham baytlar üzerinden).
export function sha256Dosya(yol) {
  return createHash("sha256").update(readFileSync(yol)).digest("hex");
}

// Manifesti okur ve biçimi doğrular; bozuksa dosya yoluyla hata fırlatır.
export function manifestiOku(manifestYol) {
  let ham;
  try {
    ham = readFileSync(manifestYol, "utf8");
  } catch {
    throw new Error(`manifest okunamadı: ${manifestYol}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(ham);
  } catch {
    throw new Error(`manifest JSON bozuk: ${manifestYol}`);
  }
  if (!manifest || typeof manifest.dosyalar !== "object" || manifest.dosyalar === null) {
    throw new Error(`manifest biçimi bozuk (dosyalar yok): ${manifestYol}`);
  }
  for (const [ad, girdi] of Object.entries(manifest.dosyalar)) {
    if (!girdi || typeof girdi.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(girdi.sha256)) {
      throw new Error(`manifest girdisi bozuk (${ad}): sha256 yok/biçimsiz: ${manifestYol}`);
    }
    if (typeof girdi.kaynak !== "string" || girdi.kaynak.trim().length === 0) {
      throw new Error(`manifest girdisi bozuk (${ad}): kaynak yok: ${manifestYol}`);
    }
    if (typeof girdi.lisans !== "string" || girdi.lisans.trim().length === 0) {
      throw new Error(`manifest girdisi bozuk (${ad}): lisans yok: ${manifestYol}`);
    }
  }
  return manifest;
}

// Korpus dizinini manifeste karşı denetler.
// Döner: { eksik: string[], uyusmaz: [{dosya, beklenen, gercek}], fazladan: string[] }
export function denetle(corpusDir, manifest) {
  const eksik = [];
  const uyusmaz = [];
  for (const [ad, girdi] of Object.entries(manifest.dosyalar)) {
    const yol = join(corpusDir, ad);
    if (!existsSync(yol) || !statSync(yol).isFile()) {
      eksik.push(ad);
      continue;
    }
    const gercek = sha256Dosya(yol);
    if (gercek !== girdi.sha256) uyusmaz.push({ dosya: ad, beklenen: girdi.sha256, gercek });
  }
  const kayitli = new Set(Object.keys(manifest.dosyalar));
  const fazladan = readdirSync(corpusDir)
    .filter((ad) => {
      if (kayitli.has(ad) || MANIFEST_YARDIMCILARI.includes(ad)) return false;
      try {
        return statSync(join(corpusDir, ad)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
  return { eksik: eksik.sort(), uyusmaz, fazladan };
}

// Denetleme sonucunu insan-okunur satırlara döker.
export function raporSatirlari(sonuc) {
  const satirlar = [];
  return satirlar.concat(
    sonuc.eksik.map((ad) => `EKSIK ${ad}`),
    sonuc.uyusmaz.map((u) => `FAIL(hash) ${u.dosya} beklenen=${u.beklenen} gercek=${u.gercek}`),
    sonuc.fazladan.map((ad) => `FAZLADAN(manifest-disi) ${ad}`),
  );
}

// Komut satırı bayrakları: --corpus <dizin> --manifest <yol>.
function bayrakOku(argv) {
  let corpus = VARSAYILAN_CORPUS;
  let manifest = VARSAYILAN_MANIFEST;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--corpus" && argv[i + 1]) corpus = resolve(argv[++i]);
    else if (argv[i] === "--manifest" && argv[i + 1]) manifest = resolve(argv[++i]);
  }
  return { corpus, manifest };
}

// Doğrudan koşumda: denetle, raporla, exit kodu ver.
const dogrudanKosum = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
if (dogrudanKosum) {
  const { corpus, manifest: manifestYol } = bayrakOku(process.argv.slice(2));
  let manifest;
  try {
    manifest = manifestiOku(manifestYol);
  } catch (e) {
    console.error(`HATA ${e.message}`);
    process.exit(1);
  }
  const sonuc = denetle(corpus, manifest);
  const kayitliSayisi = Object.keys(manifest.dosyalar).length;
  const okSayisi = kayitliSayisi - sonuc.eksik.length - sonuc.uyusmaz.length;
  for (const ad of Object.keys(manifest.dosyalar).sort()) {
    if (sonuc.eksik.includes(ad)) continue;
    if (sonuc.uyusmaz.some((u) => u.dosya === ad)) continue;
    console.log(`OK ${ad}`);
  }
  for (const satir of raporSatirlari(sonuc)) console.log(satir);
  const sorun = sonuc.eksik.length + sonuc.uyusmaz.length + sonuc.fazladan.length;
  console.log(`=== ${okSayisi}/${kayitliSayisi} OK, ${sorun} sorun ===`);
  process.exit(sorun ? 1 : 0);
}
