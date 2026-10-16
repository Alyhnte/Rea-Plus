// scripts/fuzz-harness.mjs: Dalga 4g — parser'lari hedefleyen tekrarlanabilir fuzz katmani.
// - Tohum: tests/corpus'tan salt-okunur okunur (ASLA yazilmaz).
// - Mutasyon + kosu motoru: scripts/fuzz-parsers.mjs yeniden kullanilir (tek motor).
// - Bu katman ekler: crash siniflandirma + imza gruplama + JSON/Markdown rapor.
// - AFL++ yoksa node-tabanli kosar; WSL varsayimi YOK — bu makinede kosar.
// - Yazma yalniz --rapor-dir / --repro-dir (varsayilan: tmpdir) altina.
// Kullanim: node scripts/fuzz-harness.mjs [--seed N] [--adet N]
//   [--tekil-tavan MS] [--toplam-tavan MS] [--rapor-dir D] [--repro-dir D] [--corpus D]
// Cikis: crash/hang/atlanan yoksa 0, varsa 1; calisma hatasinda 2 (ozet stdout'ta JSON).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fuzzKos,
  tohumlariOku,
  varsayilanHedefler,
  sha256,
} from "./fuzz-parsers.mjs";

const kok = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---- Varsayilan butce: CI dostu, toplam <60sn ----
export const VARSAYILANLAR = {
  seed: 1,
  adet: 50,
  tekilTavanMs: 2000,
  toplamTavanMs: 45_000,
};

// ---- Crash siniflandirma ----
// Girdi Error nesnesi ya da fuzz motorunun urettigi "Ad: mesaj | at ..." metni
// olabilir (fuzzKos crash'leri metin tasir). Cikti: { sinif, imza, ad, mesaj }.
// Imza konumsuzdur (ad + mesaj): ayni mesaj her kosuda ayni gruba duser.
const YIGIN_RE = /maximum call stack|stack overflow|too much recursion/i;
const BELLEK_RE = /out of memory|heap out of memory|allocation failed|array buffer/i;

function sinifSec(ad, mesaj) {
  const kucuk = `${ad} ${mesaj}`.toLowerCase();
  if (YIGIN_RE.test(kucuk)) return "yigin-tasmasi";
  if (BELLEK_RE.test(kucuk)) return "bellek";
  if (ad === "RangeError") return "aralik";
  if (ad === "TypeError") return "tip";
  if (ad === "SyntaxError") return "sozdizimi";
  return "genel";
}

function metindenAyristir(metin) {
  const parcalar = String(metin).split(" | ");
  const ilk = (parcalar[0] ?? "").slice(0, 200);
  const m = ilk.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)$/);
  if (!m) return { ad: "bilinmeyen", mesaj: ilk || "(bos)" };
  return { ad: m[1], mesaj: m[2] || "(mesajsiz)" };
}

export function hatayiSiniflandir(hata) {
  // Fuzz motoru crash'leri "Ad: mesaj | at ..." metni tasir: one parse et.
  if (typeof hata === "string") {
    if (!/^[A-Za-z_$][\w$]*\s*:/.test(hata)) {
      const mesaj = hata.slice(0, 200) || "(bos)";
      return { sinif: "bilinmeyen", imza: `bilinmeyen:(firlatma):${mesaj.slice(0, 120)}`, ad: "(firlatma)", mesaj };
    }
    const { ad, mesaj } = metindenAyristir(hata);
    const sinif = sinifSec(ad, mesaj);
    return { sinif, imza: `${sinif}:${ad}:${mesaj.slice(0, 120)}`, ad, mesaj: mesaj.slice(0, 500) };
  }
  if (hata instanceof Error) {
    const ad = hata.name || "Error";
    const mesaj = (hata.message ?? "").slice(0, 200) || "(mesajsiz)";
    const sinif = sinifSec(ad, mesaj);
    return { sinif, imza: `${sinif}:${ad}:${mesaj.slice(0, 120)}`, ad, mesaj: mesaj.slice(0, 500) };
  }
  if (hata !== null && typeof hata === "object") {
    // Error olmayan nesne firlatmasi: metne bak, sinif genel.
    const { ad, mesaj } = metindenAyristir(String(hata));
    const sinif = ad === "bilinmeyen" ? "bilinmeyen" : "genel";
    return { sinif, imza: `${sinif}:${ad}:${mesaj.slice(0, 120)}`, ad, mesaj: mesaj.slice(0, 500) };
  }
  // null/undefined/sayi/... : siniflandirilamaz.
  const mesaj = String(hata ?? "(bos)").slice(0, 200);
  return { sinif: "bilinmeyen", imza: `bilinmeyen:(firlatma):${mesaj.slice(0, 120)}`, ad: "(firlatma)", mesaj };
}

// ---- Gruplama: ayni imza tek satir (sayiya gore azalan) ----
export function crashlariGrupla(liste) {
  const harita = new Map();
  for (const c of liste ?? []) {
    const g = harita.get(c.imza) ?? { imza: c.imza, sinif: c.sinif, sayi: 0, hedefler: new Set(), ilk: null };
    g.sayi++;
    if (c.hedef) g.hedefler.add(c.hedef);
    if (!g.ilk) g.ilk = { hedef: c.hedef ?? null, tur: c.tur ?? null, idx: c.idx ?? null };
    harita.set(c.imza, g);
  }
  return [...harita.values()]
    .map((g) => ({ ...g, hedefler: [...g.hedefler].sort() }))
    .sort((a, b) => b.sayi - a.sayi);
}

// ---- Fuzz kosusu: motor + siniflandirma + tekrar meta ----
export function fuzzCalistir({
  tohumlar,
  hedefler,
  seed = VARSAYILANLAR.seed,
  adet = VARSAYILANLAR.adet,
  tekilTavanMs = VARSAYILANLAR.tekilTavanMs,
  toplamTavanMs = VARSAYILANLAR.toplamTavanMs,
  reproDir = null,
  calismaDir = null,
}) {
  const sonuc = fuzzKos({ tohumlar, hedefler, seed, adet, tekilTavanMs, toplamTavanMs, reproDir, calismaDir });
  const sinifli = (sonuc.crashes ?? []).map((c) => ({ ...c, ...hatayiSiniflandir(c.hata) }));
  const gruplar = crashlariGrupla(sinifli);
  const siniflar = {};
  for (const c of sinifli) siniflar[c.sinif] = (siniflar[c.sinif] ?? 0) + 1;
  const tohumSha = {};
  for (const [tur, buf] of Object.entries(tohumlar ?? {})) {
    try { tohumSha[tur] = sha256(buf); } catch { /* tohum okunamazsa rapor yine yazilir */ }
  }
  return {
    ...sonuc,
    sinifli,
    gruplar,
    siniflar,
    girdi: { seed: Number(seed), adet: Number(adet), tekilTavanMs: Number(tekilTavanMs), toplamTavanMs: Number(toplamTavanMs) },
    tohumSha,
  };
}

// ---- Rapor: ozet.json + rapor.md (yalniz raporDir altina) ----
export function raporYaz(sonuc, { raporDir, meta = {} } = {}) {
  if (!raporDir) throw new Error("raporDir gerekli");
  mkdirSync(raporDir, { recursive: true });
  const g = sonuc.girdi ?? {};
  const ozet = {
    arac: "fuzz-harness",
    seed: meta.seed ?? g.seed ?? VARSAYILANLAR.seed,
    adet: meta.adet ?? g.adet ?? VARSAYILANLAR.adet,
    tekilTavanMs: g.tekilTavanMs ?? VARSAYILANLAR.tekilTavanMs,
    toplamTavanMs: g.toplamTavanMs ?? VARSAYILANLAR.toplamTavanMs,
    toplam: sonuc.toplam ?? 0,
    crash: sonuc.crash ?? 0,
    hang: sonuc.hang ?? 0,
    atlanan: sonuc.atlanan ?? 0,
    ms: sonuc.ms ?? 0,
    siniflar: sonuc.siniflar ?? {},
    gruplar: (sonuc.gruplar ?? []).map((x) => ({ imza: x.imza, sinif: x.sinif, sayi: x.sayi, hedefler: x.hedefler, ilk: x.ilk })),
    tohumSha: sonuc.tohumSha ?? {},
    zaman: new Date().toISOString(),
  };
  const ozetYol = join(raporDir, "ozet.json");
  writeFileSync(ozetYol, JSON.stringify(ozet, null, 2) + "\n", "utf8");

  const satir = [];
  satir.push("# Fuzz raporu");
  satir.push("");
  satir.push(`- seed: \`${ozet.seed}\` · adet(hedef basina): \`${ozet.adet}\` · tekil tavan: \`${ozet.tekilTavanMs}ms\` · toplam tavan: \`${ozet.toplamTavanMs}ms\``);
  satir.push(`- toplam cagri: \`${ozet.toplam}\` · sure: \`${ozet.ms}ms\` · atlanan: \`${ozet.atlanan}\``);
  satir.push(`- Bulgu: \`${ozet.crash} crash\`, \`${ozet.hang} hang\``);
  if (!ozet.crash && !ozet.hang) satir.push("- Sonuc: 0 crash, 0 hang — parser'lar bu tohum/seed penceresinde throw/sure-asimi vermedi.");
  if (Object.keys(ozet.siniflar).length) {
    satir.push("");
    satir.push("## Sinif dagilimi");
    satir.push("");
    satir.push("| Sinif | Sayi |");
    satir.push("|---|---|");
    for (const [k, v] of Object.entries(ozet.siniflar).sort((a, b) => b[1] - a[1])) satir.push(`| \`${k}\` | ${v} |`);
  }
  if (ozet.gruplar.length) {
    satir.push("");
    satir.push("## Gruplar (imza)");
    satir.push("");
    satir.push("| # | Sinif | Hedefler | Imza |");
    satir.push("|---|---|---|---|");
    ozet.gruplar.forEach((gr, i) => satir.push(`| ${gr.sayi} | \`${gr.sinif}\` | ${gr.hedefler.join(", ")} | \`${gr.imza.slice(0, 140)}\` |`));
  }
  satir.push("");
  satir.push("## Tekrar");
  satir.push("");
  satir.push("```sh");
  satir.push(`node scripts/fuzz-harness.mjs --seed ${ozet.seed} --adet ${ozet.adet} --tekil-tavan ${ozet.tekilTavanMs} --toplam-tavan ${ozet.toplamTavanMs}`);
  satir.push("```");
  const mdYol = join(raporDir, "rapor.md");
  writeFileSync(mdYol, satir.join("\n") + "\n", "utf8");
  return { raporDir, ozetYol, mdYol };
}

// ---- CLI ----
const cliMi = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (cliMi) {
  const arg = (ad, varsayilan) => {
    const i = process.argv.indexOf(`--${ad}`);
    return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : varsayilan;
  };
  const seed = Number(arg("seed", String(VARSAYILANLAR.seed)));
  const adet = Number(arg("adet", String(VARSAYILANLAR.adet)));
  const tekilTavanMs = Number(arg("tekil-tavan", String(VARSAYILANLAR.tekilTavanMs)));
  const toplamTavanMs = Number(arg("toplam-tavan", String(VARSAYILANLAR.toplamTavanMs)));
  const corpus = String(arg("corpus", join(kok, "tests", "corpus")));
  const raporDir = String(arg("rapor-dir", join(tmpdir(), `reaplus-fuzz-rapor-${seed}`)));
  const reproDir = String(arg("repro-dir", join(raporDir, "repro")));
  const calismaDir = mkdtempSync(join(tmpdir(), "fuzz-harness-calisma-"));
  try {
    const tohumlar = tohumlariOku(corpus);
    const sonuc = fuzzCalistir({
      tohumlar, hedefler: varsayilanHedefler(calismaDir),
      seed, adet, tekilTavanMs, toplamTavanMs, reproDir, calismaDir,
    });
    const yazilan = raporYaz(sonuc, { raporDir });
    console.log(JSON.stringify({
      seed, adet, tekilTavanMs, toplamTavanMs,
      toplam: sonuc.toplam, crash: sonuc.crash, hang: sonuc.hang,
      atlanan: sonuc.atlanan, ms: sonuc.ms,
      siniflar: sonuc.siniflar, grupSayisi: sonuc.gruplar.length,
      rapor: yazilan.raporDir, reprolar: sonuc.reprolar,
    }, null, 2));
    process.exit(sonuc.crash || sonuc.hang || sonuc.atlanan ? 1 : 0);
  } catch (e) {
    console.error(`fuzz hatasi: ${e && e.message ? e.message : e}`);
    process.exit(2);
  } finally {
    try { rmSync(calismaDir, { recursive: true, force: true }); } catch { /* en iyi cabayla */ }
  }
}
