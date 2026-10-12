// Ghidra statik provider iskeleti (WP4a): headless import, hedef çalıştırılmaz.
// Conduit StaticEngine şekline uyar: id + capabilities + open/close.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Capabilities } from "../../conduit-core/engines/types.js";

// Facade prefix kuralı: rea_ öneki zorunlu.
export const GHIDRA_TOOLS = ["rea_ghidra_ac", "rea_ghidra_semboller"] as const;

export interface StatikSaglayici {
  readonly id: string;
  readonly capabilities: Capabilities;
  open(oturumId: string, hedefYol: string): Promise<void>;
  close(oturumId: string): Promise<void>;
}

// Kurulum dizini: yalnızca env (sürpriz varsayılan yok).
export function ghidraDizini(env = process.env): string | null {
  const aday = (env.REA_GHIDRA_DIR ?? "").trim();
  return aday ? aday : null;
}

// Java 17 zorunlu: Ghidra headless 17 altında açılmaz.
export function java17Tamam(): boolean {
  try {
    const err = execFileSync("java", ["-version"], { stdio: ["ignore", "pipe", "pipe"] }).toString();
    return /version "17(\.|")/.test(err) || /openjdk version "17(\.|")/.test(err);
  } catch {
    return false;
  }
}

// analyzeHeadless mevcut mu?
function headlessTamam(dizin: string): boolean {
  const bin = join(dizin, "support", "analyzeHeadless");
  return existsSync(bin) || existsSync(`${bin}.bat`);
}

// Ortak kapı: eksikse capability_unsupported nedeni dön.
export function ghidraDurumu(env = process.env) {
  const dizin = ghidraDizini(env);
  if (!dizin) return { tamam: false as const, neden: "REA_GHIDRA_DIR tanımlı değil" };
  if (!existsSync(dizin)) return { tamam: false as const, neden: `Dizin yok: ${dizin}` };
  if (!java17Tamam()) return { tamam: false as const, neden: "Java 17 bulunamadı (java -version)" };
  if (!headlessTamam(dizin))
    return { tamam: false as const, neden: "analyzeHeadless yok (support/ altında olmalı)" };
  return { tamam: true as const, dizin };
}

export class GhidraProvider implements StatikSaglayici {
  readonly id = "ghidra";
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

  // Statik açma: dizin + hedef doğrular, import WP4b'de yapılır.
  async open(oturumId: string, hedefYol: string): Promise<void> {
    void oturumId;
    const durum = ghidraDurumu();
    if (!durum.tamam) throw new Error(`capability_unsupported: ${durum.neden}`);
    if (!existsSync(hedefYol)) throw new Error(`capability_unsupported: hedef yok: ${hedefYol}`);
  }

  async close(oturumId: string): Promise<void> {
    void oturumId; // ephemeral proje temizliği WP4b'de eklenir
  }
}
