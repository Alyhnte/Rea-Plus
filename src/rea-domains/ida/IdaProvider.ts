// IDA statik provider iskeleti (WP4a): idat headless, hedef çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const IDA_TOOLS = ["rea_ida_ac", "rea_ida_semboller"] as const;

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
