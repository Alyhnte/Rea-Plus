// JEB statik provider iskeleti (WP4a): MCP istemcisini ÇAĞIRAN başlatır.
// Provider içinde spawn/fetch yok; sadece URL doğrulanır, yönlendirme döner.
import { existsSync } from "node:fs";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const JEB_TOOLS = ["rea_jeb_ac", "rea_jeb_siniflar"] as const;

export interface StatikSaglayici {
  readonly id: string;
  readonly capabilities: Capabilities;
  open(oturumId: string, hedefYol: string): Promise<void>;
  close(oturumId: string): Promise<void>;
}

// MCP uç adresi: yalnızca env (varsayılan yazılmaz, yanlış hedefe saplanmaz).
export function jebMcpUrl(env = process.env): string | null {
  const aday = (env.REA_JEB_MCP_URL ?? "").trim();
  if (!aday) return null;
  try {
    const u = new URL(aday);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return aday;
  } catch {
    return null;
  }
}

// Ortak kapı: URL yoksa ya da hedef yoksa capability_unsupported.
export function jebDurumu(hedefYol: string, env = process.env) {
  const url = jebMcpUrl(env);
  if (!url) return { tamam: false as const, neden: "REA_JEB_MCP_URL tanımlı değil ya da http(s) değil" };
  if (!existsSync(hedefYol)) return { tamam: false as const, neden: `Hedef yok: ${hedefYol}` };
  return { tamam: true as const, url };
}

export class JebProvider implements StatikSaglayici {
  readonly id = "jeb";
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

  // Not: MCP bağlantısını çağıran (facade) başlatır; provider client üretmez.
  async open(oturumId: string, hedefYol: string): Promise<void> {
    void oturumId;
    const durum = jebDurumu(hedefYol);
    if (!durum.tamam) throw new Error(`capability_unsupported: ${durum.neden}`);
  }

  // Kapatma: bizim açtığımız soket yok, no-op.
  async close(oturumId: string): Promise<void> {
    void oturumId;
  }
}
