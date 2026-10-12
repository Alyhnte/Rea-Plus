// Hopper statik provider iskeleti (WP4a): hedef ASLA çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const HOPPER_TOOLS = ["rea_hopper_ac", "rea_hopper_semboller"] as const;

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
