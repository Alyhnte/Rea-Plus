// rea-domains/reposcan: repo recursive tarama + sniff+motor + mtime önbelleği.
// Uzantı ipucu + sihirli bayt birleşir; 4'lü worker havuzuyla işlenir.
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { ProbeCache } from "../../facade/probeCache.js";
import { sniffBytes } from "../../facade/sniff.js";
import { bestMotor } from "../../facade/confidence.js";

// Paralel tarama tavanı: aynı anda en fazla bu kadar dosya işlenir.
export const PARALEL_TAVAN = 4;

// Başarı: dosyalar+tip sayımı+motor planı; hata: desteklenmeyen kapısı.
export type ReaRepoScanSonuc =
  | { ok: true; tool: string; summary: string; details: { dosyalar: Array<{ yol: string; tip: string; motor: string }>; tipler: Record<string, number>; planlar: Array<{ dosya: string; motor: string; neden: string }> } }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Uzantı ipucu: yalnız bu uzantılar taranır.
const UZANTI_TIP: Record<string, string> = { ".exe": "pe", ".dll": "pe", ".elf": "elf", ".so": "elf", ".apk": "apk", ".js": "js", ".mjs": "js", ".cjs": "js", ".wasm": "wasm" };
// Tip aday motorları (confidence skor tablosuyla uyumlu).
const ADAYLAR: Record<string, string[]> = { pe: ["cutter", "ghidra", "x64dbg"], elf: ["radare2", "ghidra", "cutter"], apk: ["jadx", "apktool"], js: ["js"], wasm: ["wabt"] };
// Gezmede girilmeyen dizin adları.
const ATLANAN = new Set([".git", "node_modules", "dist"]);
// mtime anahtarlı sonuç önbelleği (ikinci tur disk okumaz).
const önbellek = new ProbeCache(60_000);

// Recursive toplama: atlanan dizine girmez, listedışı uzantıyı almaz.
function yürü(cur: string, out: string[]): void {
  for (const ad of readdirSync(cur)) {
    if (ATLANAN.has(ad)) continue;
    const tam = join(cur, ad);
    try {
      const st = statSync(tam);
      if (st.isDirectory()) yürü(tam, out);
      else if (st.isFile() && UZANTI_TIP[extname(tam).toLowerCase()]) out.push(tam);
    } catch { /* kilitli yol atlanır */ }
  }
}

// Tek dosya: önbellek vurursa döner, yoksa sniff+ipucu+bestMotor koşar.
async function dosyayıİşle(tam: string, kok: string): Promise<{ yol: string; tip: string; motor: string } | null> {
  let mtime = 0;
  try { mtime = statSync(tam).mtimeMs; } catch { return null; }
  const anahtar = `${tam}:${mtime}`;
  const hazır = önbellek.get(anahtar) as { yol: string; tip: string; motor: string } | undefined;
  if (hazır) return hazır;
  let tip = UZANTI_TIP[extname(tam).toLowerCase()] ?? "bilinmiyor";
  try {
    const s = sniffBytes(readFileSync(tam).subarray(0, 4096));
    if (s.tip !== "bilinmiyor") tip = s.tip;
  } catch { /* okunamazsa ipucu kalır */ }
  const motor = bestMotor(tip, ADAYLAR[tip] ?? ["radare2"]) || "radare2";
  const kayıt = { yol: relative(kok, tam).replace(/\\/g, "/"), tip, motor };
  önbellek.set(anahtar, kayıt);
  return kayıt;
}

// Sınırlı worker havuzu: en fazla `eszamanlilik` (tavan: PARALEL_TAVAN) iş
// aynı anda koşar. Sonuçlar girdi sırasında döner (paralel koşuma rağmen
// deterministik). Sinyal abort olursa yeni iş alınmaz; in-flight bitenler
// korunur, kalan düşer (`iptalEdildi`). Patlayan iş hataya yazılır, diğerleri
// sürer (hata izolasyonu). Timer/süreç üretmez; abort dinleyicisi eklemez
// (döngü-başı bayrak okuma), asılı kaynak bırakmaz.
export interface HavuzSecenek {
  eszamanlilik?: number;
  sinyal?: AbortSignal;
}
export interface HavuzSonuc<R> {
  sonuclar: R[];
  hatalar: Array<{ sira: number; hata: string }>;
  iptalEdildi: boolean;
  baslatilan: number;
}
export async function havuzlaTara<T, R>(
  isler: T[],
  isle: (is: T, sira: number) => Promise<R | null | undefined>,
  secenek?: HavuzSecenek,
): Promise<HavuzSonuc<R>> {
  const istenen = Math.floor(secenek?.eszamanlilik ?? PARALEL_TAVAN);
  const tavan = Number.isFinite(istenen) && istenen > 0 ? Math.min(istenen, PARALEL_TAVAN) : 1;
  const sinyal = secenek?.sinyal;
  const biten: Array<{ sira: number; deger: R }> = [];
  const hatalar: Array<{ sira: number; hata: string }> = [];
  let sonraki = 0;
  let baslatilan = 0;
  async function worker(): Promise<void> {
    for (;;) {
      if (sinyal?.aborted) break;
      const sira = sonraki;
      if (sira >= isler.length) break;
      sonraki += 1;
      baslatilan += 1;
      try {
        const deger = await isle(isler[sira] as T, sira);
        if (deger !== null && deger !== undefined) biten.push({ sira, deger });
        // null/undefined: sessiz atlandı (hedef-dışı/okunamayan yol).
      } catch (e) {
        hatalar.push({ sira, hata: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const workerSayisi = Math.min(tavan, isler.length);
  // Sınırlı: yalnız worker sayısı kadar söz (iş sayısı kadar Promise.all YOK).
  await Promise.all(Array.from({ length: workerSayisi }, () => worker()));
  biten.sort((a, b) => a.sira - b.sira);
  hatalar.sort((a, b) => a.sira - b.sira);
  return {
    sonuclar: biten.map((x) => x.deger),
    hatalar,
    iptalEdildi: Boolean(sinyal?.aborted) && baslatilan < isler.length,
    baslatilan,
  };
}

// Paralel repo tarama seçenekleri: tavan, iptal sinyali, enjekte tarayıcı (test).
export interface ParalelTaramaSecenek extends HavuzSecenek {
  dosyaTara?: (tam: string, kok: string) => Promise<{ yol: string; tip: string; motor: string } | null>;
}
// Paralel tarama sonucu: sıralı dosyalar + tip sayımı + plan + hata listesi + iptal bayrağı.
export type ReaRepoParalelSonuc =
  | { ok: true; tool: string; summary: string; iptalEdildi: boolean; details: { dosyalar: Array<{ yol: string; tip: string; motor: string }>; tipler: Record<string, number>; planlar: Array<{ dosya: string; motor: string; neden: string }>; hatalar: Array<{ yol: string; hata: string }> } }
  | { ok: false; code: "capability_unsupported"; reason: string };
// Paralel repo tarama: yürür, 4'lü (tavanlı) havuzla işler, sıralı
// birleştirir; iptalde yapılanı korur, patlayanı listeler, sürer.
export async function rea_scan_repo_paralel(kokDizin: string, secenek?: ParalelTaramaSecenek): Promise<ReaRepoParalelSonuc> {
  if (!kokDizin) return { ok: false, code: "capability_unsupported", reason: "boş kök dizin" };
  if (!existsSync(kokDizin)) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${kokDizin}` };
  try {
    const adaylar: string[] = [];
    yürü(kokDizin, adaylar);
    const tara = secenek?.dosyaTara ?? ((tam: string, kok: string) => dosyayıİşle(tam, kok));
    const havuz = await havuzlaTara(adaylar, (tam) => tara(tam, kokDizin), secenek);
    const dosyalar = [...havuz.sonuclar];
    dosyalar.sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
    const hatalar = havuz.hatalar.map((h) => ({
      yol: relative(kokDizin, adaylar[h.sira] as string).replace(/\\/g, "/"),
      hata: h.hata,
    }));
    hatalar.sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
    const tipler: Record<string, number> = {};
    for (const d of dosyalar) tipler[d.tip] = (tipler[d.tip] ?? 0) + 1;
    const planlar = dosyalar.map((d) => ({ dosya: d.yol, motor: d.motor, neden: `${d.tip} için ${d.motor}` }));
    return { ok: true, tool: "rea_scan_repo", summary: `${dosyalar.length} dosya, ${Object.keys(tipler).length} tip`, iptalEdildi: havuz.iptalEdildi, details: { dosyalar, tipler, planlar, hatalar } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `tarama başarısız: ${(e as Error).message}` }; }
}

// Repo tarama: aynı havuz (tavan 4), aynı sıralı birleştirme; dönüş şekli değişmez.
export async function rea_scan_repo(kokDizin: string, seceneklerJson?: string): Promise<ReaRepoScanSonuc> {
  if (!kokDizin) return { ok: false, code: "capability_unsupported", reason: "boş kök dizin" };
  if (!existsSync(kokDizin)) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${kokDizin}` };
  if (seceneklerJson) { try { JSON.parse(seceneklerJson); } catch { /* bozuk seçenek yok sayılır */ } }
  try {
    const paralel = await rea_scan_repo_paralel(kokDizin, { eszamanlilik: PARALEL_TAVAN });
    if (!paralel.ok) return paralel;
    const { dosyalar, tipler, planlar } = paralel.details;
    return { ok: true, tool: "rea_scan_repo", summary: `${dosyalar.length} dosya, ${Object.keys(tipler).length} tip`, details: { dosyalar, tipler, planlar } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `tarama başarısız: ${(e as Error).message}` }; }
}
