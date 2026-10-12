// rea-domains/reposcan: repo recursive tarama + sniff+motor + mtime önbelleği.
// Uzantı ipucu + sihirli bayt birleşir; 4'lü Promise grupları ile işlenir.
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { ProbeCache } from "../../facade/probeCache.js";
import { sniffBytes } from "../../facade/sniff.js";
import { bestMotor } from "../../facade/confidence.js";

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

// Repo tarama: yürür, 4'lü gruplar hâlinde işler, sayım+plan üretir.
export async function rea_scan_repo(kokDizin: string, seceneklerJson?: string): Promise<ReaRepoScanSonuc> {
  if (!kokDizin) return { ok: false, code: "capability_unsupported", reason: "boş kök dizin" };
  if (!existsSync(kokDizin)) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${kokDizin}` };
  if (seceneklerJson) { try { JSON.parse(seceneklerJson); } catch { /* bozuk seçenek yok sayılır */ } }
  try {
    const adaylar: string[] = [];
    yürü(kokDizin, adaylar);
    const dosyalar: Array<{ yol: string; tip: string; motor: string }> = [];
    for (let i = 0; i < adaylar.length; i += 4) {
      const grup = adaylar.slice(i, i + 4).map((t) => dosyayıİşle(t, kokDizin).catch(() => null));
      for (const d of await Promise.all(grup)) if (d) dosyalar.push(d);
    }
    dosyalar.sort((a, b) => (a.yol < b.yol ? -1 : 1));
    const tipler: Record<string, number> = {};
    for (const d of dosyalar) tipler[d.tip] = (tipler[d.tip] ?? 0) + 1;
    const planlar = dosyalar.map((d) => ({ dosya: d.yol, motor: d.motor, neden: `${d.tip} için ${d.motor}` }));
    return { ok: true, tool: "rea_scan_repo", summary: `${dosyalar.length} dosya, ${Object.keys(tipler).length} tip`, details: { dosyalar, tipler, planlar } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `tarama başarısız: ${(e as Error).message}` }; }
}
