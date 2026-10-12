// rea-domains/javascript: require/import grafı + export şekli (regex + gerçek fs)
// AST yok; dosya->bağımlılık listesi ile fonksiyon/sınıf/default özeti çıkarılır.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

export type ReaJsDerinlikSonuç =
  | { ok: true; tool: string; summary: string; details?: unknown }
  | { ok: false; code: "capability_unsupported"; reason: string };

// require() + import-from + export-from yakalar (üç gruptan biri dolar).
const BAĞIMLILIK_RE = /require\(\s*["']([^"']+)["']\s*\)|import\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]|export\s+[^"'`]*?\s+from\s+["'`]([^"'`]+)["'`]/g;
// Bildirim kalıpları: function, ok-fonksiyon sabiti, class, default.
const FONKSİYON_RE = /function\s+([A-Za-z_$][\w$]*)|export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
const OKFONK_RE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?[^;{]*?=>/g;
const SINIF_RE = /class\s+([A-Za-z_$][\w$]*)|export\s+(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/g;
const DEFAULT_RE = /(?:export\s+default\b|module\.exports\s*=)/;

// Eşleşen adları toplar, tekrarları tekler (grup1 ?? grup2).
function adları(re: RegExp, kod: string): string[] {
  const out: string[] = [];
  for (const m of kod.matchAll(re)) { const ad = m[1] ?? m[2]; if (ad && !out.includes(ad)) out.push(ad); }
  return out;
}

// Yorum ayıklama: blok + satır yorumları eşleşme dışı bırakılır.
function temizle(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// JS uzantıları: yalnız çalıştırılabilir kaynak taranır.
const JS_UZANTI = new Set([".js", ".mjs", ".cjs"]);

// Recursive JS toplama: alt dizinlere iner, okunamayanı atlar.
function jsTopla(cur: string, out: string[]): void {
  for (const ad of readdirSync(cur)) {
    const tam = join(cur, ad);
    try {
      const st = statSync(tam);
      if (st.isDirectory()) jsTopla(tam, out);
      else if (st.isFile() && JS_UZANTI.has(extname(tam).toLowerCase())) out.push(tam);
    } catch { /* kilitli dosya atlanır */ }
  }
}

// Graf: her JS dosyasının require/import bağımlılıkları (göreli yol->liste).
export function rea_js_require(dizin: string): ReaJsDerinlikSonuç {
  if (!dizin) return { ok: false, code: "capability_unsupported", reason: "boş dizin" };
  if (!existsSync(dizin)) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${dizin}` };
  try {
    const dosyalar: string[] = [];
    jsTopla(dizin, dosyalar);
    const graf: Record<string, string[]> = {};
    for (const tam of dosyalar) {
      const kod = temizle(readFileSync(tam, "utf8"));
      const out: string[] = [];
      for (const m of kod.matchAll(BAĞIMLILIK_RE)) { const d = m[1] ?? m[2] ?? m[3]; if (d && !out.includes(d)) out.push(d); }
      graf[relative(dizin, tam).replace(/\\/g, "/")] = out;
    }
    const kenar = Object.values(graf).reduce((t, l) => t + l.length, 0);
    return { ok: true, tool: "rea_js_require", summary: `${dosyalar.length} dosya, ${kenar} kenar`, details: { graf } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `tarama başarısız: ${(e as Error).message}` }; }
}

// Şekil: dosyadaki fonksiyon/sınıf adları + default export var mı.
export function rea_js_export_shape(dosya: string): ReaJsDerinlikSonuç {
  if (!dosya) return { ok: false, code: "capability_unsupported", reason: "boş dosya yolu" };
  if (!existsSync(dosya)) return { ok: false, code: "capability_unsupported", reason: `dosya yok: ${dosya}` };
  try {
    const kod = temizle(readFileSync(dosya, "utf8"));
    const fonksiyonlar = adları(FONKSİYON_RE, kod);
    for (const a of adları(OKFONK_RE, kod)) if (!fonksiyonlar.includes(a)) fonksiyonlar.push(a);
    const siniflar = adları(SINIF_RE, kod);
    const defaultVarMi = DEFAULT_RE.test(kod);
    return { ok: true, tool: "rea_js_export_shape", summary: `${fonksiyonlar.length} fonksiyon, ${siniflar.length} sınıf, default=${defaultVarMi ? "var" : "yok"}`, details: { fonksiyonlar, siniflar, defaultVarMi } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `okuma başarısız: ${(e as Error).message}` }; }
}
