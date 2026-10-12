// Hopper statik provider iskeleti (WP4a): hedef ASLA çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const HOPPER_TOOLS = ["rea_hopper_ac", "rea_hopper_semboller", "rea_hopper_istek", "rea_hopper_tara"] as const;

// Conduit engine tipiyle yapısal uyum (id radare2 dışında kalır).
export interface StatikSaglayici {
  readonly id: string;
  readonly capabilities: Capabilities;
  open(oturumId: string, hedefYol: string): Promise<void>;
  close(oturumId: string): Promise<void>;
}

// Hopper yalnızca macOS/Linux ana makinede anlamlı (orijinal REA kararı).
function platformDesteklenir(p = process.platform): boolean {
  return p === "darwin" || p === "linux";
}

// Kurulum yolu: önce env, sonra bilinen varsayılanlar.
export function hopperYolu(env = process.env): string | null {
  const aday = (env.REA_HOPPER_PATH ?? "").trim();
  if (aday) return aday;
  for (const yol of ["/Applications/Hopper v4.app", "/opt/hopper/hopper"]) {
    if (existsSync(yol)) return yol;
  }
  return null;
}

// Ortak kapı: eksikse çalıştırma, capability_unsupported nedeni dön.
export function hopperDurumu(env = process.env) {
  if (!platformDesteklenir())
    return { tamam: false as const, neden: `Bu platformda yok: ${process.platform}` };
  const yol = hopperYolu(env);
  if (!yol || !existsSync(yol))
    return { tamam: false as const, neden: "REA_HOPPER_PATH yok ya da dosya bulunamadı" };
  return { tamam: true as const, yol };
}

export class HopperProvider implements StatikSaglayici {
  readonly id = "hopper";
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

  // Statik açma: sadece yol doğrular, binary yürütmez.
  async open(oturumId: string, hedefYol: string): Promise<void> {
    void oturumId;
    const durum = hopperDurumu();
    if (!durum.tamam) throw new Error(`capability_unsupported: ${durum.neden}`);
    if (!existsSync(hedefYol)) throw new Error(`capability_unsupported: hedef yok: ${hedefYol}`);
  }

  // Kapatma: harici Hopper süreci bizde yaşamaz, no-op.
  async close(oturumId: string): Promise<void> {
    void oturumId;
    void execFileSync; // ileride headless sürüm sorgusu burada yapılır
  }
}

// Hopper'da headless CLI yoktur (`hopper -e` diye batch koşumu yok).
// Bu yüzden otomasyon istek dosyası üretir: hedef + adresler JSON olarak
// yazılır, kullanıcı bu dosyayı Hopper v4 içinde açıp adreslere gider.
export function rea_hopper_istek(hedef: string, adresler: string[] = [], cikti?: string) {
  if (!hedef || !existsSync(hedef))
    return { ok: false as const, code: "capability_unsupported" as const, neden: `hedef yok: ${hedef}` };
  const durum = hopperDurumu();
  if (!durum.tamam)
    return { ok: false as const, code: "capability_unsupported" as const, neden: `${durum.neden} — fallback: dosyayı rizin/cutter (rea_cutter_*) ya da Ghidra (rea_ghidra_*) ile açın; Hopper için REA_HOPPER_PATH tanımlayın` };
  try {
    const dosya = cikti?.trim() ? cikti : join(tmpdir(), `rea-hopper-istek-${Date.now()}.json`);
    const icerik = JSON.stringify({ arac: "rea_hopper_istek", hedef, adresler, hopper: durum.yol, not: "Hopper CLI yok; bu dosyayı Hopper v4 içinde açıp adreslere gidin", uretildi: new Date().toISOString() }, null, 2);
    writeFileSync(dosya, icerik, "utf8");
    return { ok: true as const, arac: "rea_hopper_istek", hedef, adresler, istekDosyasi: dosya, hopper: durum.yol };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: `istek dosyası yazılamadı: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Çevrimdışı metin taraması (Hopper çalıştırılmaz, lisans gerekmez).
// Dosya latin1 okunur; düz string ya da regex desenle satır satır taranır.
// NOT: `rea_hopper_regex` adında bir araç YOKTUR (çalışan Hopper gerektirirdi);
// offline karşılığı budur.
export function rea_hopper_tara(hedef: string, desen: string, regexMi = false, limit = 100) {
  if (!hedef || !existsSync(hedef))
    return { ok: false as const, code: "capability_unsupported" as const, neden: `hedef yok: ${hedef}` };
  if (!desen)
    return { ok: false as const, code: "capability_unsupported" as const, neden: "desen boş" };
  let re: RegExp | null = null;
  if (regexMi) {
    try {
      re = new RegExp(desen, "i");
    } catch {
      return { ok: false as const, code: "capability_unsupported" as const, neden: `geçersiz regex: ${desen}` };
    }
  }
  try {
    const ham = readFileSync(hedef).toString("latin1");
    const satirlar = ham.split(/\r?\n/);
    const kucuk = desen.toLowerCase();
    const eslesmeler: { satir: number; offset: number; metin: string }[] = [];
    let offset = 0;
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i] as string;
      const bulundu = re ? re.test(s) : s.toLowerCase().includes(kucuk);
      if (bulundu) {
        eslesmeler.push({ satir: i + 1, offset, metin: s.slice(0, 300) });
        if (eslesmeler.length >= limit) break;
      }
      offset += s.length + 1;
    }
    return { ok: true as const, arac: "rea_hopper_tara", hedef, desen, regex: regexMi, sayi: eslesmeler.length, eslesmeler };
  } catch (e) {
    return { ok: false as const, code: "capability_unsupported" as const, neden: `tarama hatası: ${e instanceof Error ? e.message : String(e)}` };
  }
}
