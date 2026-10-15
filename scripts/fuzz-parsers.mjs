// scripts/fuzz-parsers.mjs: Dalga H/1 — PE/ELF/WASM/DWARF parser fuzz CI smoke motoru.
// - Gecerli corpus fixture'larindan deterministik seed'li mutasyonlar turetip
//   her birini ilgili parser hedefinde kosar (throw=crash, sure-asimi=hang).
// - Crash/hang bulan girdi repro dizinine birebir yazilir (.bin + .json meta).
// - Parser'lar senkrondur; "timeout" olcumu cagri suresiyle yapilir (preemptive
//   iptal yok — CI smoke icin sure-tavanli olcum; asim hang sayilir + raporlanir).
// - tests/corpus'a ASLA yazilmaz; calisma dosyalari tmpdir'de, repro'lar
//   --repro-dir (varsayilan: tmpdir) altinda toplanir.
// Kullanim: node scripts/fuzz-parsers.mjs [--seed N] [--adet N]
//   [--tekil-tavan MS] [--toplam-tavan MS] [--repro-dir D] [--corpus D]
// Cikis: crash/hang yoksa 0, varsa 1 (ozet stdout'ta JSON).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rea_pe_info, rea_pe_imports, rea_pe_sections } from "../dist/rea-domains/winpe/PeReader.js";
import { rea_wasm_sections, rea_wasm_imports } from "../dist/rea-domains/wasm-evm/WasmInfo.js";
import { rea_dwarf_ozet } from "../dist/rea-domains/typedef/DwarfReader.js";

const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- Deterministik PRNG (mulberry32) ----
export function tohumla(seed) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rand, n) => Math.floor(rand() * n);

// ---- Mutasyon: taban baytlardan deterministik bozuk girdiler ----
export function mutasyonUret(taban, seed, adet) {
  if (!taban || !taban.length || !(adet > 0)) return [];
  const rand = tohumla(seed);
  const out = [];
  for (let i = 0; i < adet; i++) {
    const b = Buffer.from(taban);
    const strateji = int(rand, 8);
    const n = b.length;
    const bir = () => int(rand, n);
    if (strateji === 0) {
      // Rastgele baytlari degistir (1-8 bayt).
      const k = 1 + int(rand, Math.min(8, n));
      for (let j = 0; j < k; j++) b[bir()] = int(rand, 256);
    } else if (strateji === 1) {
      // Bit cevir (1-4 bit).
      const k = 1 + int(rand, 4);
      for (let j = 0; j < k; j++) b[bir()] ^= 1 << int(rand, 8);
    } else if (strateji === 2) {
      // Dilim kopyala (baska ofsete yapistir).
      const boy = 1 + int(rand, Math.min(64, n));
      const src = int(rand, n - boy + 1);
      const dst = int(rand, n - boy + 1);
      b.subarray(src, src + boy).copy(b, dst);
    } else if (strateji === 3) {
      // Kes (en az 1 bayt birak).
      const kes = 1 + int(rand, n - 1);
      out.push(b.subarray(0, n - kes));
      continue;
    } else if (strateji === 4) {
      // Sisir (basa/sona rastgele bayt ekle).
      const ek = Buffer.alloc(1 + int(rand, 16));
      for (let j = 0; j < ek.length; j++) ek[j] = int(rand, 256);
      out.push(rand() < 0.5 ? Buffer.concat([ek, b]) : Buffer.concat([b, ek]));
      continue;
    } else if (strateji === 5) {
      // Sihir/baslik alanini boz (ilk 4 bayt).
      const k = Math.min(4, n);
      for (let j = 0; j < k; j++) b[j] = int(rand, 256);
    } else if (strateji === 6) {
      // Uzunluk/LEB alanlarini sisir (0xFF serpiştir).
      const k = 1 + int(rand, Math.min(8, n));
      for (let j = 0; j < k; j++) b[bir()] = 0xff;
    } else {
      // Iki 16-bayt blogu takas et.
      if (n >= 32) {
        const w = Math.min(16, Math.floor(n / 2));
        const a0 = int(rand, n - w * 2 + 1);
        let b0 = int(rand, n - w + 1);
        if (Math.abs(a0 - b0) < w) b0 = (a0 + w) % (n - w + 1);
        const t = Buffer.from(b.subarray(a0, a0 + w));
        b.subarray(b0, b0 + w).copy(b, a0);
        t.copy(b, b0);
      } else {
        b[bir()] ^= 0xff;
      }
    }
    out.push(b);
  }
  return out;
}

export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

// ---- Tohumlar: gecerli corpus fixture'lari (salt-okunur) ----
export function tohumlariOku(corpusDir) {
  const dir = corpusDir ?? join(kok, "tests", "corpus");
  const oku = (ad) => {
    const yol = join(dir, ad);
    if (!existsSync(yol)) throw new Error(`tohum bulunamadi: ${yol}`);
    return readFileSync(yol);
  };
  return { pe: oku("mini_pe_x64.exe"), elf: oku("mini_branch.elf"), wasm: oku("ornek.wasm") };
}

// ---- Hedef sarmalayicilar (dosya isteyen parser'lar tmp dosyaya yazar) ----
function yolHedefi(calismaDir, ad, tur, uzanti, fn) {
  let sayac = 0;
  return {
    ad,
    tur,
    cagir: (girdi) => {
      const yol = join(calismaDir, `${tur}-${sayac++}${uzanti}`);
      writeFileSync(yol, girdi);
      try {
        return fn(yol);
      } finally {
        try { rmSync(yol, { force: true }); } catch { /* temizlik en iyi cabayla */ }
      }
    },
  };
}

export function varsayilanHedefler(calismaDir) {
  const dir = calismaDir ?? mkdtempSync(join(tmpdir(), "fuzz-calisma-"));
  // Not: gecici dosyalar bilerek `.bin` uzantili yazilir; parser'lar yalniz
  // icerige bakar (uzanti kapisi yok). `.exe` yazmak Windows'ta AV gercek-zamanli
  // taramayi tetikleyip ilk cagriyi saniyelerce geciktirir (olculdu: ~2.5sn) ve
  // CI smoke'u kararsizlastirir.
  return [
    yolHedefi(dir, "pe-info", "pe", ".bin", (y) => rea_pe_info(y)),
    yolHedefi(dir, "pe-imports", "pe", ".bin", (y) => rea_pe_imports(y)),
    yolHedefi(dir, "pe-sections", "pe", ".bin", (y) => rea_pe_sections(y)),
    yolHedefi(dir, "dwarf-ozet", "elf", ".bin", (y) => rea_dwarf_ozet(y)),
    { ad: "wasm-sections", tur: "wasm", cagir: (g) => rea_wasm_sections(g.toString("base64")) },
    { ad: "wasm-imports", tur: "wasm", cagir: (g) => rea_wasm_imports(g.toString("base64")) },
  ];
}

// ---- Fuzz kosusu ----
export function fuzzKos({
  tohumlar,
  hedefler,
  seed = 1,
  adet = 20,
  tekilTavanMs = 2000,
  toplamTavanMs = 60_000,
  reproDir = null,
  calismaDir = null,
}) {
  const baslangic = Date.now();
  const turler = Object.keys(tohumlar);
  const liste = hedefler ?? varsayilanHedefler(calismaDir ?? undefined);
  const bizDir = calismaDir ?? null;
  if (reproDir) mkdirSync(reproDir, { recursive: true });

  let toplam = 0, crash = 0, hang = 0, atlanan = 0;
  const reprolar = [], digestler = [], crashes = [], hanglar = [];

  const reproYaz = (sinif, hedefAd, tur, idx, girdi, bilgi) => {
    if (!reproDir) return null;
    const taban = `${sinif}-${hedefAd}-${Number(seed)}-${tur}-${idx}`;
    const binYol = join(reproDir, `${taban}.bin`);
    writeFileSync(binYol, girdi);
    writeFileSync(join(reproDir, `${taban}.json`), JSON.stringify({
      hedef: hedefAd, tur, seed: Number(seed), idx, sinif, bilgi: String(bilgi ?? ""),
      sha256: sha256(girdi), boyut: girdi.length,
    }, null, 2) + "\n", "utf8");
    reprolar.push(binYol);
    return binYol;
  };

  dis: for (const tur of turler) {
    const girdiler = mutasyonUret(tohumlar[tur], Number(seed), adet);
    for (const g of girdiler) digestler.push(sha256(g));
    for (const h of liste.filter((x) => x.tur === tur)) {
      for (let i = 0; i < girdiler.length; i++) {
        if (Date.now() - baslangic > toplamTavanMs) {
          // Kalan tum cagrilari say (bu tur+hedef ve sonrakiler).
          const buTurHedefler = liste.filter((x) => x.tur === tur);
          const kalanBu = girdiler.length - i;
          atlanan += kalanBu + (buTurHedefler.length - buTurHedefler.indexOf(h) - 1) * girdiler.length;
          for (let t = turler.indexOf(tur) + 1; t < turler.length; t++) {
            const hSay = liste.filter((x) => x.tur === turler[t]).length;
            atlanan += adet * hSay;
          }
          break dis;
        }
        const girdi = girdiler[i];
        toplam++;
        const t0 = Date.now();
        try {
          h.cagir(girdi);
        } catch (e) {
          crash++;
          const bilgi = e && e.stack ? String(e.stack).split("\n").slice(0, 3).join(" | ") : String(e);
          crashes.push({ hedef: h.ad, tur, idx: i, hata: bilgi.slice(0, 500) });
          reproYaz("crash", h.ad, tur, i, girdi, bilgi.slice(0, 500));
          continue;
        } finally {
          const ms = Date.now() - t0;
          if (ms > tekilTavanMs) {
            hang++;
            hanglar.push({ hedef: h.ad, tur, idx: i, ms });
            reproYaz("hang", h.ad, tur, i, girdi, `${ms}ms > ${tekilTavanMs}ms`);
          }
        }
      }
    }
  }

  const ms = Date.now() - baslangic;
  // Calisma dizini disaridan verilmediyse hedefler kendi tmp'sini acti; biz actiysak temizle.
  if (bizDir) { try { rmSync(bizDir, { recursive: true, force: true }); } catch { /* en iyi cabayla */ } }
  return { toplam, crash, hang, atlanan, ms, reprolar, digestler, crashes, hanglar };
}

// ---- CLI ----
const cliMi = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (cliMi) {
  const arg = (ad, varsayilan) => {
    const i = process.argv.indexOf(`--${ad}`);
    return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : varsayilan;
  };
  const seed = Number(arg("seed", "1"));
  const adet = Number(arg("adet", "50"));
  const tekilTavanMs = Number(arg("tekil-tavan", "2000"));
  const toplamTavanMs = Number(arg("toplam-tavan", "60000"));
  const corpus = String(arg("corpus", join(kok, "tests", "corpus")));
  const reproDir = String(arg("repro-dir", join(tmpdir(), `reaplus-fuzz-${seed}`)));
  const calismaDir = mkdtempSync(join(tmpdir(), "fuzz-calisma-"));
  try {
    const tohumlar = tohumlariOku(corpus);
    const sonuc = fuzzKos({
      tohumlar, hedefler: varsayilanHedefler(calismaDir),
      seed, adet, tekilTavanMs, toplamTavanMs, reproDir, calismaDir,
    });
    console.log(JSON.stringify({
      seed, adet, tekilTavanMs, toplamTavanMs,
      toplam: sonuc.toplam, crash: sonuc.crash, hang: sonuc.hang,
      atlanan: sonuc.atlanan, ms: sonuc.ms, reprolar: sonuc.reprolar,
    }, null, 2));
    process.exit(sonuc.crash || sonuc.hang || sonuc.atlanan ? 1 : 0);
  } catch (e) {
    console.error(`fuzz hatasi: ${e && e.message ? e.message : e}`);
    process.exit(2);
  } finally {
    try { rmSync(calismaDir, { recursive: true, force: true }); } catch { /* en iyi cabayla */ }
  }
}
