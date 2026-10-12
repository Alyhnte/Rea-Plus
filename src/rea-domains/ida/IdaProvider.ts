// IDA statik provider iskeleti (WP4a): idat headless, hedef çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const IDA_TOOLS = ["rea_ida_ac", "rea_ida_semboller", "rea_ida_idb", "rea_ida_flirt"] as const;

export interface StatikSaglayici {
  readonly id: string;
  readonly capabilities: Capabilities;
  open(oturumId: string, hedefYol: string): Promise<void>;
  close(oturumId: string): Promise<void>;
}

// Kurulum yolu: env öncelikli, sonra PATH'teki idat/ida.
export function idaYolu(env = process.env): string | null {
  const aday = (env.REA_IDA_PATH ?? "").trim();
  if (aday) return aday;
  for (const bin of ["idat64", "idat", "ida64"]) {
    try {
      execFileSync(bin, ["-h"], { stdio: "ignore" });
      return bin;
    } catch { /* sonraki adaya geç */ }
  }
  return null;
}

// Ortak kapı: lisanssız/lisansız ortamda çalıştırma yok.
export function idaDurumu(env = process.env) {
  const yol = idaYolu(env);
  if (!yol) return { tamam: false as const, neden: "REA_IDA_PATH yok ve idat PATH'te bulunamadı" };
  if (yol.includes("/") || yol.includes("\\")) {
    if (!existsSync(yol)) return { tamam: false as const, neden: `IDA yolu yok: ${yol}` };
  }
  return { tamam: true as const, yol };
}

export class IdaProvider implements StatikSaglayici {
  readonly id = "ida";
  readonly capabilities: Capabilities = {
    kind: "static",
    disassembly: true,
    symbols: true,
    readMemory: false,
    writeMemory: false,
    breakpoints: false,
    registers: false,
    modules: false,
    threads: false,
  };

  // Statik açma: idb/i64 üretimi WP4b'de, burada yalnız doğrulama.
  async open(oturumId: string, hedefYol: string): Promise<void> {
    void oturumId;
    const durum = idaDurumu();
    if (!durum.tamam) throw new Error(`capability_unsupported: ${durum.neden}`);
    if (!existsSync(hedefYol)) throw new Error(`capability_unsupported: hedef yok: ${hedefYol}`);
  }

  async close(oturumId: string): Promise<void> {
    void oturumId; // .idb kalıntısı bırakılmaz, üretici WP4b'de temizler
  }
}

// idat batch ile .idb üretimi (hedef çalıştırılmaz, IDA analizörleri koşar).
// Batch kip: `-A` (otonom) + `-B` (batch, idb üretip kapat); `-S <betik>`
// varyantı da aynı kapıdan geçer, betikli koşumlar için betik yolu verilir.
const IDB_ZAMAN_ASIMI = 300_000;
export function rea_ida_idb(hedef: string, cikti: string) {
  if (!hedef || !existsSync(hedef))
    return { ok: false as const, code: "capability_unsupported" as const, neden: `hedef yok: ${hedef}` };
  if (!cikti || !cikti.trim())
    return { ok: false as const, code: "capability_unsupported" as const, neden: "cikti yolu boş" };
  const durum = idaDurumu();
  if (!durum.tamam)
    return { ok: false as const, code: "capability_unsupported" as const, neden: `${durum.neden} — fallback: rizin/cutter (rea_cutter_*) ya da Ghidra headless (rea_ghidra_analyze) ile analiz edin` };
  try {
    // Önce bitişik -o formu, kabul etmezse ayrı argüman formu denenir.
    try {
      execFileSync(durum.yol, ["-A", "-B", `-o${cikti}`, hedef], { stdio: "ignore", timeout: IDB_ZAMAN_ASIMI });
    } catch {
      execFileSync(durum.yol, ["-A", "-B", "-o", cikti, hedef], { stdio: "ignore", timeout: IDB_ZAMAN_ASIMI });
    }
    if (!existsSync(cikti))
      return { ok: false as const, code: "capability_unsupported" as const, neden: `idb üretilemedi: ${cikti}` };
    return { ok: true as const, arac: "rea_ida_idb", hedef, idb: cikti, idat: durum.yol };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: `idat batch hatası: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// FLIRT çevrimdışı taraması (IDA/lisans gerekmez): imza veritabanı yerine
// dosyadaki derleyici kalıpları aranır (hedef çalıştırılmaz, salt okuma).
const FLIRT_KALIPLARI = ["MSVC", "Microsoft Visual C++", "RTTI", "MFC", "ATL", "GCC:", "clang version", "__cxa_", ".eh_frame", "Borland", "Delphi", "FLIRT"] as const;
export function rea_ida_flirt(hedef: string) {
  if (!hedef || !existsSync(hedef))
    return { ok: false as const, code: "capability_unsupported" as const, neden: `hedef yok: ${hedef}` };
  try {
    const metin = readFileSync(hedef).toString("latin1");
    const eslesmeler = FLIRT_KALIPLARI.filter((k) => metin.includes(k));
    const surumler = [...metin.matchAll(/((?:GCC:|clang version)[^\r\n]{0,80})/g)].map((m) => (m[1] as string).trim()).slice(0, 10);
    return { ok: true as const, arac: "rea_ida_flirt", hedef, eslesmeler, surumler, sayi: eslesmeler.length };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: `flirt taraması hatası: ${e instanceof Error ? e.message : String(e)}` };
  }
}
