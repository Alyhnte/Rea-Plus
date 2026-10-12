// Ghidra headless köprüsü: hedef çalıştırılmaz, salt-okunur analiz dökümleri.
// Kapı deseni GhidraProvider.ghidraDurumu'ndan gelir (aynen korunur).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GHIDRA_TOOLS, ghidraDurumu } from "./GhidraProvider.js";
// Yeni araçlar Provider dosyasına dokunulmadan çalışırken listeye eklenir.
for (const ad of ["rea_ghidra_vt", "rea_ghidra_trace"] as const) {
  if (!(GHIDRA_TOOLS as readonly string[]).includes(ad)) {
    (GHIDRA_TOOLS as unknown as string[]).push(ad);
  }
}
// Üst sınırlar: büyük binary analizinde takılmasın (300sn), çıktı sığsın (16MB).
const ZAMAN_ASIMI = 300_000;
const MAKS_TAMPON = 16 * 1024 * 1024;
// Ephemeral proje: her koşuda import edilir, iş bitince silinir.
const PROJE_DIZIN = join(tmpdir(), "rea-ghidra-proj");
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
// PyGhidra çalıştırıcı: .py betikler bu kiple koşar (Ghidra 12 headless Jython içermez).
function pyghidraYolu(dizin: string): string {
  const bat = join(dizin, "support", "pyghidraRun.bat");
  return existsSync(bat) ? bat : join(dizin, "support", "pyghidraRun");
}
// Betik adı uzantısız verilebilir ("DumpFuncs" -> "DumpFuncs.py"); gerçek dosya bulunur.
function betikDosyasi(betik: string): string {
  if (/\.(py|java)$/i.test(betik)) return betik;
  const dizin = betikDizini();
  for (const uzanti of [".py", ".java"]) {
    try {
      if (existsSync(join(dizin, `${betik}${uzanti}`))) return `${betik}${uzanti}`;
    } catch { /* sonraki uzantı denenir */ }
  }
  return betik; // bulunamazsa headless açık hata verir
}
// Ortak çalıştırıcı: Windows .bat/.cmd cmd.exe üstünden koşar.
function calistir(bin: string, argv: string[]): string {
  const secenekler = { encoding: "utf8" as const, timeout: ZAMAN_ASIMI, maxBuffer: MAKS_TAMPON, stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };
  if (/\.bat$/i.test(bin) || /\.cmd$/i.test(bin)) {
    return execFileSync("cmd.exe", ["/d", "/c", bin, ...argv], secenekler);
  }
  return execFileSync(bin, argv, secenekler);
}
// Ortak kapı: Ghidra durumu + hedef varlığı; geçerse bin döner.
function giris(hedef: string): { bin: string; dizin: string } | Engel {
  const durum = ghidraDurumu();
  if (!durum.tamam) return { ok: false, code: "capability_unsupported", neden: durum.neden };
  if (!existsSync(hedef)) return { ok: false, code: "capability_unsupported", neden: `hedef yok: ${hedef}` };
  return { bin: headlessYolu(durum.dizin), dizin: durum.dizin };
}
// Hata zarfı: headless/parse hatası capability_unsupported olur.
function hata(neden: string, e: unknown): Engel {
  return { ok: false, code: "capability_unsupported", neden: `${neden}: ${e instanceof Error ? e.message : String(e)}` };
}
// Çekirdek koşucu: -import -overwrite -postScript -scriptPath -deleteProject.
// .py betik PyGhidra kipinde (--headless), .java betik analyzeHeadless ile koşar.
export function runHeadless(hedef: string, betik: string, betikArgumanlari: string[] = []): string {
  const g = giris(hedef);
  if ("neden" in g) throw new Error(`capability_unsupported: ${g.neden}`);
  // Ephemeral proje: kalıntı (postScript System.exit) birikmesin, her koşuda sıfırlanır.
  try { rmSync(PROJE_DIZIN, { recursive: true, force: true }); } catch { /* ilk koşu */ }
  mkdirSync(PROJE_DIZIN, { recursive: true });
  const gercekBetik = betikDosyasi(betik);
  const argv = [PROJE_DIZIN, PROJE_ADI, "-import", hedef, "-overwrite", "-postScript", gercekBetik, ...betikArgumanlari, "-scriptPath", betikDizini(), "-deleteProject"];
  if (/\.py$/i.test(gercekBetik)) {
    return calistir(pyghidraYolu(g.dizin), ["--headless", ...argv]);
  }
  return calistir(g.bin, argv);
}
// Geçici çıktı: betiğe argüman verilir, sonra okunup silinir.
function geciciCikti(): string {
  mkdirSync(PROJE_DIZIN, { recursive: true });
  return join(PROJE_DIZIN, `cikti-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
}
// Geçici girdi: runHeadless PROJE_DIZIN'i sıfırlar; girdi dosyası dışarıda durmalı.
function geciciGirdi(): string {
  const dizin = join(tmpdir(), "rea-ghidra-girdi");
  mkdirSync(dizin, { recursive: true });
  return join(dizin, `girdi-${Date.now()}-${Math.floor(Math.random() * 1e6)}.json`);
}
function ciktiOku(yol: string): string {
  try { return readFileSync(yol, "utf8"); } finally { try { rmSync(yol, { force: true }); } catch { /* kalıntı sorun değil */ } }
}
// Analiz: betiksiz import (varsayılan analizörler çalışır), proje silinir.
export function rea_ghidra_analyze(hedef: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  try {
    mkdirSync(PROJE_DIZIN, { recursive: true });
    const log = calistir(g.bin, [PROJE_DIZIN, PROJE_ADI, "-import", hedef, "-overwrite", "-deleteProject"]);
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
// Disas: DumpDisasm.py Listing getInstructions aralığını mnemonic+bytes JSON döker.
export function rea_ghidra_disasm(hedef: string, addr: string, len = 50) {
  const g = giris(hedef); if ("neden" in g) return g;
  if (!addr || !addr.trim()) return { ok: false as const, code: "capability_unsupported" as const, neden: "addr boş olmamalı" };
  const ham = Math.trunc(len);
  const sayi = Number.isFinite(ham) ? Math.min(Math.max(ham, 1), 500) : 50;
  const cikti = geciciCikti();
  try {
    runHeadless(hedef, "DumpDisasm", [addr.trim(), String(sayi), cikti]);
    const talimatlar = JSON.parse(ciktiOku(cikti)) as { addr: string; mnemonic: string; bytes: string; length: number; text: string }[];
    const kod = talimatlar.map((t) => `${t.addr} ${t.mnemonic} ${t.text}`).join("\n");
    return { ok: true as const, arac: "rea_ghidra_disasm", hedef, addr, sayi, talimatlar, kod };
  } catch (e) { try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } return hata("DumpDisasm hatası", e); }
}
// Sürüm farkı (vt): iki headless funcs dökümü + TS diff (eklenen/silinen/değişen isim+boyut).
export function rea_ghidra_vt(eskiYol: string, yeniYol: string) {
  const g1 = giris(eskiYol); if ("neden" in g1) return g1;
  const g2 = giris(yeniYol); if ("neden" in g2) return g2;
  const eskiR = rea_ghidra_funcs(eskiYol);
  if (!eskiR.ok) return eskiR;
  const yeniR = rea_ghidra_funcs(yeniYol);
  if (!yeniR.ok) return yeniR;
  type F = { name: string; entry: string; size: number };
  const eskiListe = eskiR.fonksiyonlar as F[];
  const yeniListe = yeniR.fonksiyonlar as F[];
  const eskiHarita = new Map(eskiListe.map((f) => [f.name, f]));
  const yeniHarita = new Map(yeniListe.map((f) => [f.name, f]));
  const eklenen = yeniListe.filter((f) => !eskiHarita.has(f.name)).map((f) => ({ name: f.name, entry: f.entry, size: f.size }));
  const silinen = eskiListe.filter((f) => !yeniHarita.has(f.name)).map((f) => ({ name: f.name, entry: f.entry, size: f.size }));
  const degisen = yeniListe.filter((f) => {
    const e = eskiHarita.get(f.name);
    return e !== undefined && (e.size !== f.size || e.entry !== f.entry);
  }).map((f) => {
    const e = eskiHarita.get(f.name) as F;
    return { name: f.name, eskiEntry: e.entry, yeniEntry: f.entry, eskiBoyut: e.size, yeniBoyut: f.size };
  });
  return { ok: true as const, arac: "rea_ghidra_vt", eski: eskiYol, yeni: yeniYol, eklenen, silinen, degisen, ozet: { eklenen: eklenen.length, silinen: silinen.length, degisen: degisen.length } };
}
// İz snapshot: adres->hex baytları ImportTrace.py ile TraceManager izine yazar, geri okuyup doğrular.
export function rea_ghidra_trace(hedef: string, kayitJson: string) {
  const g = giris(hedef); if ("neden" in g) return g;
  let snapshot: unknown;
  try {
    const t = kayitJson.trim();
    // Dosya yolu da kabul edilir (köşeli parantez içermeyen mevcut yol).
    const ham = existsSync(t) && !t.startsWith("{") ? readFileSync(t, "utf8") : t;
    snapshot = JSON.parse(ham);
  } catch (e) { return hata("snapshot JSON parse hatası", e); }
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: "snapshot adres->hex sözlüğü olmalı" };
  }
  const girdiler = Object.entries(snapshot as Record<string, unknown>);
  if (girdiler.length === 0) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: "snapshot boş olmamalı" };
  }
  for (const [a, h] of girdiler) {
    if (typeof h !== "string" || h.length === 0 || h.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(h)) {
      return { ok: false as const, code: "capability_unsupported" as const, neden: `geçersiz hex: ${a}` };
    }
  }
  const snapYol = geciciGirdi();
  const cikti = geciciCikti();
  try {
    writeFileSync(snapYol, JSON.stringify(snapshot), "utf8");
    runHeadless(hedef, "ImportTrace", [snapYol, cikti]);
    const sonuc = JSON.parse(ciktiOku(cikti)) as { trace: string; bolge: string; yazilan: number; adresSayisi: number; dogrulama: Record<string, boolean>; tamam: boolean };
    return { ok: true as const, arac: "rea_ghidra_trace", hedef, sonuc };
  } catch (e) { return hata("ImportTrace hatası", e); }
  finally { try { rmSync(snapYol, { force: true }); } catch { /* yoksay */ } try { rmSync(cikti, { force: true }); } catch { /* yoksay */ } }
}
