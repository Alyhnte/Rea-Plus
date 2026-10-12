// rea-domains/process: fs günlüğü (snapshot + diff)
// Dizin recursive taranır, ad->boyut+mtime kaydı çıkar; iki kayıt farkı kanıta girer.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type ReaFsSonuç =
  | { ok: true; tool: string; summary: string; kayıt: FsKaydı }
  | { ok: false; code: "capability_unsupported"; reason: string };

// Tek dosya kaydı: bayt boyutu + mtime (ms).
export interface FsDosya { boyut: number; mtime: number; }

// Snapshot kaydı dosyalar sözlüğü taşır; diff kaydı eklenen/silinen/değişen listeler.
export interface FsKaydı {
  dizin?: string;
  dosyalar?: Record<string, FsDosya>;
  eklenen?: string[];
  silinen?: string[];
  değişen?: string[];
}

// Yürüyüş: alt dizinlere recursive iner, okunamayanı atlar, göreli yol kullanır.
function yürü(kök: string, cur: string, out: Record<string, FsDosya>): void {
  for (const ad of readdirSync(cur)) {
    const tam = join(cur, ad);
    try {
      const st = statSync(tam);
      if (st.isDirectory()) yürü(kök, tam, out);
      else if (st.isFile()) out[relative(kök, tam).replace(/\\/g, "/")] = { boyut: st.size, mtime: st.mtimeMs };
    } catch { /* kilitli/uçan dosya atlanır */ }
  }
}

// Snapshot: dizindeki tüm dosyaların boyut+mtime sözlüğü (gerçek fs).
export function rea_fs_snapshot(dizin: string): ReaFsSonuç {
  if (!dizin) return { ok: false, code: "capability_unsupported", reason: "boş dizin" };
  if (!existsSync(dizin)) return { ok: false, code: "capability_unsupported", reason: `dizin yok: ${dizin}` };
  try {
    const dosyalar: Record<string, FsDosya> = {};
    yürü(dizin, dizin, dosyalar);
    const n = Object.keys(dosyalar).length;
    return { ok: true, tool: "rea_fs_snapshot", summary: `${n} dosya <- ${dizin}`, kayıt: { dizin, dosyalar } };
  } catch (e) { return { ok: false, code: "capability_unsupported", reason: `tarama başarısız: ${(e as Error).message}` }; }
}

// Kayıt çözümleme: tam snapshot JSON'u ya da çıplak ad->kayıt sözlüğü kabul edilir.
function çöz(girdi: string): Record<string, FsDosya> | null {
  try {
    const o = JSON.parse(girdi) as { dosyalar?: unknown } & Record<string, FsDosya>;
    if (!o || typeof o !== "object") return null;
    if (o.dosyalar && typeof o.dosyalar === "object") return o.dosyalar as Record<string, FsDosya>;
    return o;
  } catch { return null; }
}

// Diff: önce->sonra karşılaştırılır; değişen = boyut ya da mtime farklı olan.
export function rea_fs_diff(onceJson: string, sonraJson: string): ReaFsSonuç {
  const once = çöz(onceJson ?? "");
  const sonra = çöz(sonraJson ?? "");
  if (!once || !sonra) return { ok: false, code: "capability_unsupported", reason: "snapshot JSON çözülemedi" };
  const eklenen = Object.keys(sonra).filter((k) => !(k in once));
  const silinen = Object.keys(once).filter((k) => !(k in sonra));
  const değişen = Object.keys(sonra).filter((k) => k in once && (sonra[k].boyut !== once[k].boyut || sonra[k].mtime !== once[k].mtime));
  return { ok: true, tool: "rea_fs_diff", summary: `+${eklenen.length} -${silinen.length} ~${değişen.length}`, kayıt: { eklenen, silinen, değişen } };
}
