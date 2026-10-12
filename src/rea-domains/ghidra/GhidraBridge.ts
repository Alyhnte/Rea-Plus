// Ghidra headless köprüsü: hedef çalıştırılmaz, salt-okunur analiz dökümleri.
// Kapı deseni GhidraProvider.ghidraDurumu'ndan gelir (aynen korunur).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ghidraDurumu } from "./GhidraProvider.js";
// Üst sınırlar: büyük binary analizinde takılmasın (300sn), çıktı sığsın (16MB).
const ZAMAN_ASIMI = 300_000;
const MAKS_TAMPON = 16 * 1024 * 1024;
// Ephemeral proje: her koşuda import edilir, iş bitince silinir.
const PROJE_DIZIN = "C:\\Users\\kngal\\AppData\\Local\\Temp\\opencode\\ghidra-proj";
const PROJE_ADI = "rea_tmp";
type Engel = { ok: false; code: "capability_unsupported" | "unsupported"; neden: string };
// Betik dizini: önce src (dev), sonra dist — tsc .py kopyalamaz.
function betikDizini(): string {
  const adaylar = [join(process.cwd(), "src", "rea-domains", "ghidra", "scripts"), join(process.cwd(), "dist", "rea-domains", "ghidra", "scripts")];
  for (const a of adaylar) if (existsSync(a)) return a;
  return adaylar[0] as string;
}
// Headless binary: Windows'ta .bat, diğerinde shell betiği.
function headlessYolu(dizin: string): string {
  const bat = join(dizin, "support", "analyzeHeadless.bat");
  return existsSync(bat) ? bat : join(dizin, "support", "analyzeHeadless");
}
// Ortak kapı: Ghidra durumu + hedef varlığı; geçerse bin döner.
function giris(hedef: string): { bin: string } | Engel {
  const durum = ghidraDurumu();
  if (!durum.tamam) return { ok: false, code: "capability_unsupported", neden: durum.neden };
  if (!existsSync(hedef)) return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${hedef}` };
  return { bin: headlessYolu(durum.dizin) };
}
// Hata zarfı: headless/parse hatası capability_unsupported olur.
function hata(neden: string, e: unknown): Engel {
  return { ok: false, code: "capability_unsupported", neden: `${neden}: ${e instanceof Error ? e.message : String(e)}` };
}
// Çekirdek koşucu: -import -overwrite -postScript -scriptPath -deleteProject.
export function runHeadless(hedef: string, betik: string, betikArgumanlari: string[] = []): string {
  const g = giris(hedef);
  if ("neden" in g) throw new Error(`capability_unsupported: ${g.neden}`);
  mkdirSync(PROJE_DIZIN, { recursive: true });
  const argv = [PROJE_DIZIN, PROJE_ADI, "-import", hedef, "-overwrite", "-postScript", betik, ...betikArgumanlari, "-scriptPath", betikDizini(), "-deleteProject"];
  return execFileSync(g.bin, argv, { encoding: "utf8", timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] });
}
// Geçici çıktı: betiğe argüman verilir, sonra okunup silinir.
function geciciCikti(): string {
  mkdirSync(PROJE_DIZIN, { recursive: true });
  return join(PROJE_DIZIN, `cikti-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
}
function ciktiOku(yol: string): string {
  try { return readFileSync(yol, "utf8"); } finally { try { rmSync(yol, { force: true }); } catch { /* kalıntı sorun değil */ } }
}
// Analiz: betiksiz import (varsayılan analizörler çalışır), proje silinir.
export function rea_ghidra_analyze(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    mkdirSync(PROJE_DIZIN, { recursive: true });
    const log = execFileSync(g.bin, [PROJE_DIZIN, PROJE_ADI, "-import", hedef, "-overwrite", "-deleteProject"], { encoding: "utf8", timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true as const, arac: "rea_ghidra_analyze", hedef, log: log.slice(-2000) };
  } catch (e) { return hata("analyzeHeadless hatası", e); }
}
// Fonksiyon listesi: DumpFuncs.py JSON'unu parse eder.
export function rea_ghidra_funcs(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  const cikti = geciciCikti();
  try {
    runHeadless(hedef, "DumpFuncs", [cikti]);
    const fonksiyonlar = JSON.parse(ciktiOku(cikti)) as unknown[];
    return { ok: true as const, arac: "rea_ghidra_funcs", hedef, fonksiyonlar };
  } catch (e) { try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } return hata("DumpFuncs hatası", e); }
}
// Decompile: DumpDecompile.py pseudo-C metnini dosyaya yazar.
export function rea_ghidra_decompile(hedef: string, addr: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  const cikti = geciciCikti();
  try {
    runHeadless(hedef, "DumpDecompile", [addr, cikti]);
    return { ok: true as const, arac: "rea_ghidra_decompile", hedef, addr, kod: ciktiOku(cikti) };
  } catch (e) { try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } return hata("DumpDecompile hatası", e); }
}
// Xref listesi: DumpXrefs.py getReferencesTo dökümü.
export function rea_ghidra_xrefs(hedef: string, addr: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  const cikti = geciciCikti();
  try {
    runHeadless(hedef, "DumpXrefs", [addr, cikti]);
    const xrefs = JSON.parse(ciktiOku(cikti)) as unknown[];
    return { ok: true as const, arac: "rea_ghidra_xrefs", hedef, addr, xrefs };
  } catch (e) { try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } return hata("DumpXrefs hatası", e); }
}
// String listesi: DumpStrings.py tanımlı stringler (ilk 500).
export function rea_ghidra_strings(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  const cikti = geciciCikti();
  try {
    runHeadless(hedef, "DumpStrings", [cikti]);
    const strings = JSON.parse(ciktiOku(cikti)) as unknown[];
    return { ok: true as const, arac: "rea_ghidra_strings", hedef, strings };
  } catch (e) { try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } return hata("DumpStrings hatası", e); }
}
// Disas: headless ham aralık disasmı dökmez (rizin yok) — cutter önerisiyle unsupported.
export function rea_ghidra_disasm(hedef: string, addr: string, len = 50): { ok: true; arac: string; kod: string } | Engel {
  void len; // imza uyumu için tutulur, headless aralık disasmı desteklenmez
  const g = giris(hedef); if ("neden" in g) return g;
  void addr;
  return { ok: false, code: "unsupported", neden: "Ghidra headless aralık disasm dökmez; radare2/cutter kullanın: rea_cutter_disasm (https://rizin.re)" };
}
