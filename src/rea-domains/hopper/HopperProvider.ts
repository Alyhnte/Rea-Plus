// Hopper statik provider iskeleti (WP4a): hedef ASLA çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
// NOT: bu provider alt süreç AÇMAZ (child_process yok); Hopper'ın headless
// CLI'si olmadığı için açılacak bir şey de yoktur (bkz. HOPPER_HEADLESS_ARASTIRMA).
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

// Dalga G/4 gerçek-köprü araştırması (resmi kaynak: https://www.hopperapp.com/):
// Hopper Disassembler'ın komut-satırı/headless disassembly API'si YOKTUR.
// Resmi yüzey yalnız GUI + GUI-içi Python betikleri (Scripts menüsü) + dosya/
// CPU SDK'sı + yapay-zekâ destekli MCP sunucusu belgeler; `hopper -e` benzeri
// toplu (batch) koşum ve makine-okunur CLI çıktısı yoktur. Topluluk dışa-aktarım
// iş-akışı da Hopper İÇİNDE koşar (Scripts → Run Script, ör. hopper_export_*.py).
// Hopper v4+ MCP sunucusu yapay-zekâ desteğidir, toplu sorgu API'si değildir.
// Bu yüzden rea_hopper_istek Hopper KOŞMAZ: yalnız istek-hazırlama dosyası yazar.
export const HOPPER_HEADLESS_ARASTIRMA = {
  headless: false as const,
  komut: null,
  ciktiFormati: null,
  neden: "Hopper Disassembler resmi yüzeyinde (hopperapp.com) komut-satırı/headless disassembly modu belgelenmemiştir; otomasyon yalnız GUI-içi Python betikleriyle yapılır, toplu CLI çıktısı yoktur.",
  kaynaklar: [
    "https://www.hopperapp.com/",
    "https://github.com/HendrikReh/hopper_reverse_toolkit",
  ],
} as const;

// Lisans yoksa edinme bilgisi (anahtar/kişisel yol yazılmaz):
export const HOPPER_EDINME = {
  site: "https://www.hopperapp.com/",
  platform: "macOS 12.4+ uygulaması; Linux sürümü mevcut",
  demo: "demo sürümde kayıt/dışa-aktarım kısıtlıdır",
  env: "REA_HOPPER_PATH",
} as const;

const EDINME_NOTU = `Hopper edinme: ${HOPPER_EDINME.site} (${HOPPER_EDINME.platform}, lisanslı; ${HOPPER_EDINME.demo}), yol: ${HOPPER_EDINME.env}`;

// Ortak kapı: eksikse çalıştırma, capability_unsupported nedeni dön.
export function hopperDurumu(env = process.env) {
  if (!platformDesteklenir())
    return { tamam: false as const, neden: `Bu platformda yok: ${process.platform} — ${EDINME_NOTU}` };
  const yol = hopperYolu(env);
  if (!yol || !existsSync(yol))
    return { tamam: false as const, neden: `REA_HOPPER_PATH yok ya da dosya bulunamadı — ${EDINME_NOTU}` };
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

  // Kapatma: harici Hopper süreci bizde yaşamaz (headless API yok), no-op.
  async close(oturumId: string): Promise<void> {
    void oturumId;
  }
}

// Hopper'da headless CLI yoktur (`hopper -e` diye batch koşumu yok; bkz.
// HOPPER_HEADLESS_ARASTIRMA). Bu yüzden otomasyon istek dosyası üretir:
// hedef + adresler JSON olarak yazılır (Hopper KOŞULMAZ, alt süreç YOK),
// kullanıcı bu dosyayı Hopper v4 içinde açıp adreslere gider ya da Scripts
// menüsünden dışa-aktarım betiği koşar.
export function rea_hopper_istek(hedef: string, adresler: string[] = [], cikti?: string) {
  if (!hedef || !existsSync(hedef))
    return { ok: false as const, code: "capability_unsupported" as const, neden: `hedef yok: ${hedef}` };
  const durum = hopperDurumu();
  if (!durum.tamam)
    return { ok: false as const, code: "capability_unsupported" as const, neden: `${durum.neden} — fallback: dosyayı rizin/cutter (rea_cutter_*) ya da Ghidra (rea_ghidra_*) ile açın; Hopper için REA_HOPPER_PATH tanımlayın` };
  try {
    const dosya = cikti?.trim() ? cikti : join(tmpdir(), `rea-hopper-istek-${Date.now()}.json`);
    const icerik = JSON.stringify({ arac: "rea_hopper_istek", hedef, adresler, hopper: durum.yol, not: "Hopper headless API yok (bkz. HOPPER_HEADLESS_ARASTIRMA); bu dosya yalnız istek-hazırlamadır, Hopper koşulmadı. Hopper v4+ içinde açıp adreslere gidin ya da Scripts menüsünden dışa-aktarım betiği koşun", uretildi: new Date().toISOString() }, null, 2);
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
